/**
 * Consulta de cobertura AT&T 4G para el bot de Telegram (Google Apps Script).
 * Lee la rejilla publicada en GitHub Pages:  <BASE>/capas/grid_att4g/{lonFloor}_{latFloor}.txt
 * Cada archivo = 1°x1°, 200 filas x 200 columnas (celda 0.005° ≈ 550 m), fila 0 = norte.
 * Códigos: 0 sin cobertura | 1 extendida alt | 2 extendida | 3 baja | 4 media | 5 alta
 */
const COB_BASE = 'https://sdicom23.github.io/mapa-cobertura/'; // tu sitio de GitHub Pages, terminado en /
const COB_RES = 0.005;
const COB_TXT = {
  0: '⚫ Sin cobertura reportada',
  1: '🔵 Extendida (alterna)',
  2: '🔵 Extendida (CobEx)',
  3: '🟠 Baja (-121 a -111 dBm)',
  4: '🟡 Media (-111 a -100 dBm)',
  5: '🟢 Alta (≥ -100 dBm)'
};

// Qué esperar en campo por nivel (mismo texto que el mapa)
const COB_TIP = {
  0: { telemetria: 'No hay transmisión; el equipo debe guardar posiciones (buffer) y enviarlas al recuperar señal.',
       voz: 'Sin servicio AT&T.',
       practica: 'Si el tramo es crítico, considera SIM multi-operador o respaldo satelital.' },
  1: { telemetria: 'Posible en exteriores, sin garantía; espera reportes atrasados.',
       voz: 'Es muy probable que fallen.',
       practica: 'Antena externa y buffer en el equipo; no se recomienda para equipos en interior.' },
  2: { telemetria: 'Funciona en exteriores con reintentos frecuentes; usa un equipo con buffer para no perder reportes.',
       voz: 'Poco confiables; son probables los cortes.',
       practica: 'Antena externa de buena ganancia y equipo con LTE B28/700 MHz.' },
  3: { telemetria: 'Normalmente funciona, aunque puede haber reintentos o reportes atrasados.',
       voz: 'Pueden fallar, sobre todo dentro de la cabina o con antenas de poca ganancia.',
       practica: 'Un equipo con antena externa o con LTE B28/700 MHz responde mejor ahí.' },
  4: { telemetria: 'Funciona bien; en interiores puede haber algún reintento ocasional.',
       voz: 'Estables en exteriores; en sótanos, edificios o cabinas blindadas puede bajar la calidad.',
       practica: 'La antena interna suele bastar; para equipos fijos en interior conviene antena externa.' },
  5: { telemetria: 'Funciona sin problema, con reportes en tiempo real.',
       voz: 'Estables, incluso dentro de la cabina y en interiores.',
       practica: 'Cualquier equipo con antena interna trabaja bien.' }
};

function tipTexto_(c, titulo) {
  const t = COB_TIP[c];
  return '💡 Qué esperar en campo' + (titulo ? ' (' + titulo + ')' : '') + ':\n' +
         '• Telemetría IoT (GPS, LTE-M, mensajes cortos): ' + t.telemetria + '\n' +
         '• Llamadas y datos de celular: ' + t.voz + '\n' +
         '• En la práctica: ' + t.practica;
}

// ---- 3G (KMZ AT&T: Total con CobEx mar 2025 + Garantizada mar 2026). Rejilla capas/grid_att3g: 0 sin | 1 con cobertura | 2 garantizada
const COB3_TXT = { 0: '⚫ Sin cobertura 3G', 1: '🟣 3G con cobertura (incluye CobEx)', 2: '✅ Garantizada 3G' };
const COB3_TIP = {
  0: { telemetria: 'No hay transmisión 3G; el equipo debe guardar posiciones (buffer).',
       voz: 'Sin servicio 3G AT&T.',
       practica: 'Si el tramo es crítico, considera SIM multi-operador o respaldo satelital.' },
  1: { telemetria: 'Sólo equipos con 3G; en orillas y zonas CobEx espera reintentos o reportes atrasados.',
       voz: 'Pueden fallar dentro de la cabina o con antenas de poca ganancia.',
       practica: 'Equipos sólo LTE no funcionan aquí aunque haya 3G. Antena externa ayuda en orillas.' },
  2: { telemetria: 'Funciona en equipos con 3G (UMTS). Equipos sólo LTE (LTE-M, Cat-1) no se conectan en 3G.',
       voz: 'Estables, incluso en interiores.',
       practica: 'Confirma que el equipo soporte 3G y la banda de AT&T.' }
};
function tipTexto3_(c, titulo) {
  const t = COB3_TIP[c];
  return '💡 Qué esperar en campo' + (titulo ? ' (' + titulo + ')' : '') + ':\n' +
         '• Telemetría IoT (GPS, LTE-M, mensajes cortos): ' + t.telemetria + '\n' +
         '• Llamadas y datos de celular: ' + t.voz + '\n' +
         '• En la práctica: ' + t.practica;
}

function cobTile_(lonF, latF, tec) {
  const dir = tec === '3g' ? 'grid_att3g' : 'grid_att4g';
  const key = 'cob_' + dir + '_' + lonF + '_' + latF;
  const cache = CacheService.getScriptCache();
  let txt = cache.get(key);
  if (txt === null) {
    const r = UrlFetchApp.fetch(COB_BASE + 'capas/' + dir + '/' + lonF + '_' + latF + '.txt', {muteHttpExceptions: true});
    txt = r.getResponseCode() === 200 ? r.getContentText() : '';   // 404 = sin cobertura en ese cuadro
    cache.put(key, txt, 21600); // 6 h
  }
  return txt ? txt.split('\n') : null;
}

/** Código del punto. 4G: 0-5 (ver COB_TXT). 3G: 0-2 (ver COB3_TXT). */
function coberturaCodigo(lat, lon, tec) {
  const latF = Math.floor(lat), lonF = Math.floor(lon);
  const rows = cobTile_(lonF, latF, tec);
  if (!rows) return 0;
  const row = Math.min(199, Math.floor((latF + 1 - lat) / COB_RES));
  const col = Math.min(199, Math.floor((lon - lonF) / COB_RES));
  return Number(rows[row].charAt(col)) || 0;
}

/** Texto listo para Telegram para un punto: muestra 4G y 3G; el tip es de la tecnología elegida (por defecto 4G). */
function coberturaPunto(lat, lon, tec) {
  tec = tec === '3g' ? '3g' : '4g';
  const c4 = coberturaCodigo(lat, lon, '4g'), c3 = coberturaCodigo(lat, lon, '3g');
  return '📍 ' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '\n' +
         'AT&T 4G: ' + COB_TXT[c4] + '\n' +
         'AT&T 3G: ' + COB3_TXT[c3] + '\n' +
         (tec === '3g' ? tipTexto3_(c3, '3G') : tipTexto_(c4, '4G')) + '\n' +
         '🗺️ ' + COB_BASE + '?tec=' + tec + '&lat=' + lat + '&lon=' + lon;
}

/** Cobertura a lo largo de una ruta (origen/destino: texto o "lat,lon"). Usa Maps de Apps Script. */
function coberturaRuta(origen, destino, tec) {
  tec = tec === '3g' ? '3g' : '4g';
  const dir = Maps.newDirectionFinder().setOrigin(origen).setDestination(destino)
                  .setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
  if (!dir.routes || !dir.routes.length) return 'No encontré ruta.';
  const route = dir.routes[0];
  const pts = Maps.decodePolyline(route.overview_polyline.points); // [lat,lon,lat,lon,...]
  const km = route.legs.reduce((s, l) => s + l.distance.value, 0) / 1000;

  // Muestrea ~cada 1 km
  const muestras = [];
  let acum = 0, prev = null;
  for (let i = 0; i < pts.length; i += 2) {
    const p = [pts[i], pts[i + 1]];
    if (prev) acum += distKm_(prev, p);
    if (!prev || acum >= 1) { muestras.push(p); acum = 0; }
    prev = p;
  }
  const cuenta = [0, 0, 0, 0, 0, 0];
  const huecos = []; let enHueco = null;
  muestras.forEach((p, i) => {
    const c = coberturaCodigo(p[0], p[1], tec);
    cuenta[c]++;
    if (c === 0 && enHueco === null) enHueco = i;
    if (c !== 0 && enHueco !== null) { huecos.push([enHueco, i - 1]); enHueco = null; }
  });
  if (enHueco !== null) huecos.push([enHueco, muestras.length - 1]);

  const n = muestras.length;
  const pct = c => Math.round(100 * cuenta[c] / n) + '%';
  let msg = '🛣️ ' + route.legs[0].start_address + ' → ' + route.legs[route.legs.length - 1].end_address +
            '\n' + km.toFixed(0) + ' km · AT&T ' + (tec === '3g' ? '3G' : '4G') + ': ' + (100 - Math.round(100 * cuenta[0] / n)) + '% con cobertura\n' +
            (tec === '3g'
              ? '✅ Garantizada ' + pct(2) + '  🟣 Con cobertura (incluye CobEx) ' + pct(1) + '  ⚫ Sin cobertura ' + pct(0)
              : '🟢 Alta ' + pct(5) + '  🟡 Media ' + pct(4) + '  🟠 Baja ' + pct(3) + '\n' +
                '🔵 Extendida ' + Math.round(100 * (cuenta[1] + cuenta[2]) / n) + '%  ⚫ Sin cobertura ' + pct(0));
  const largos = huecos.filter(h => h[1] - h[0] >= 4)   // ≥ ~5 km
                       .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 5);
  if (largos.length) {
    msg += '\n\nTramos sin cobertura más largos:';
    largos.forEach(h => {
      const a = muestras[h[0]];
      msg += '\n• ~' + (h[1] - h[0] + 1) + ' km desde ' + a[0].toFixed(4) + ',' + a[1].toFixed(4);
    });
  }
  // Tip del peor nivel con al menos ~2 km en la ruta (sin señal → extendidas → baja)
  if (tec === '3g') {
    const p3 = [0, 1].find(c => cuenta[c] >= 2);
    const c3 = p3 !== undefined ? p3 : 2;
    msg += '\n\n' + tipTexto3_(c3, COB3_TXT[c3].replace(/^\S+\s/, '') + (p3 !== undefined ? ' · ~' + cuenta[p3] + ' km' : ''));
  } else {
    const peor = [0, 1, 2, 3].find(c => cuenta[c] >= 2);
    const cTip = peor !== undefined ? peor : (cuenta[5] >= cuenta[4] ? 5 : 4);
    msg += '\n\n' + tipTexto_(cTip, COB_TXT[cTip].replace(/^\S+\s/, '') + (peor !== undefined ? ' · ~' + cuenta[peor] + ' km' : ''));
  }
  msg += '\n🗺️ ' + COB_BASE + 'ruta.html?tec=' + tec + '&o=' + pts[0] + ',' + pts[1] + '&d=' + pts[pts.length - 2] + ',' + pts[pts.length - 1];
  return msg;
}

/** Mensaje de ayuda para el bot (por ejemplo, con /ayuda o /cobertura sin parámetros). */
function ayudaCobertura() {
  return '📶 *Cobertura AT&T 4G / 3G*\n\n' +
    '*Un punto:* comparte tu ubicación 📎 o escribe `lat,lon`\n' +
    '   ej. `19.4326,-99.1332`  ·  tip de 3G: `3g 19.4326,-99.1332`\n\n' +
    '*Una ruta:* `ruta origen > destino`\n' +
    '   ej. `ruta CDMX > Oaxaca`  ·  en 3G: `3g ruta CDMX > Oaxaca`\n\n' +
    '*3G:* ' + COB3_TXT[2] + ' · ' + COB3_TXT[1] + ' (equipos sólo LTE no funcionan en 3G)\n\n' +
    '*Niveles 4G:*\n' +
    COB_TXT[5] + '\n' + COB_TXT[4] + '\n' + COB_TXT[3] + '\n' + COB_TXT[2] + '\n' + COB_TXT[1] + '\n' + COB_TXT[0] + '\n\n' +
    '💡 Tip: en Google Maps mantén presionado un punto para copiar sus coordenadas.';
}

/**
 * Router listo para tu doPost de Telegram: pásale el objeto "message" de Telegram y te regresa el texto a enviar.
 *   - ubicación compartida            → cobertura en ese punto
 *   - "19.4326,-99.1332"              → cobertura en ese punto
 *   - "ruta CDMX > Oaxaca"            → cobertura a lo largo de la ruta
 *   - prefijo "3g" (ej. "3g ruta CDMX > Oaxaca" o "3g 19.43,-99.13") → calcula/tip sobre 3G
 *   - cualquier otra cosa / "/ayuda"  → mensaje de ayuda
 * Envía la respuesta con parse_mode: 'Markdown' para que se vean las negritas de la ayuda.
 */
function responderCobertura(message) {
  if (message.location) return coberturaPunto(message.location.latitude, message.location.longitude);
  let t = String(message.text || '').trim(), tec = '4g';
  const mt = t.match(/^\/?(4g|3g)\b\s*/i);           // prefijo opcional "3g" / "4g"
  if (mt) { tec = mt[1].toLowerCase(); t = t.slice(mt[0].length); }
  const m = t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) return coberturaPunto(Number(m[1]), Number(m[2]), tec);
  const r = t.match(/^\/?ruta\s+(.+?)\s*>\s*(.+)$/i);
  if (r) return coberturaRuta(r[1], r[2], tec);
  return ayudaCobertura();
}

function distKm_(a, b) {
  const R = 6371, t = Math.PI / 180;
  const dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Prueba rápida desde el editor */
function testCobertura() {
  Logger.log(coberturaPunto(19.4326, -99.1332));          // CDMX
  Logger.log(coberturaRuta('Ciudad de México', 'Oaxaca, Oax'));
  Logger.log(responderCobertura({ text: '3g ruta Tampico > Monterrey' }));
  Logger.log(ayudaCobertura());
}
