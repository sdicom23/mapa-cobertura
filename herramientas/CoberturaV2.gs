/**
 * Cobertura AT&T 4G / 3G (mapa v2, KMZ 2026) para el bot de Telegram — Google Apps Script.
 * Rejilla: <BASE>v2/grid_{4g|3g}/{lonFloor}_{latFloor}.txt  (200x200 celdas de 0.005° ≈ 550 m, fila 0 = norte)
 * Códigos: 0 sin cobertura | 1 con cobertura (incluye CobEx) | 2 garantizada
 */
const V2_BASE = 'https://sdicom23.github.io/mapa-cobertura/'; // tu sitio de GitHub Pages, terminado en /
const V2_RES = 0.005;
const V2_TEC = { '4g': '4G LTE', '3g': '3G' };
const V2_TXT = {
  '4g': { 0: '⚫ Sin cobertura 4G', 1: '🔵 Con cobertura (incluye CobEx)', 2: '✅ Garantizada' },
  '3g': { 0: '⚫ Sin cobertura 3G', 1: '🟣 Con cobertura (incluye CobEx)', 2: '✅ Garantizada' }
};
// Qué esperar en campo (mismo texto que el mapa v2)
const V2_TIP = {
  '4g': {
    2: { telemetria: 'Funciona sin problema, con reportes en tiempo real.',
         voz: 'Estables, incluso dentro de la cabina y en interiores.',
         practica: 'Cualquier equipo LTE con antena interna trabaja bien.' },
    1: { telemetria: 'Funciona; en orillas y zonas CobEx puede haber reintentos o reportes atrasados.',
         voz: 'Estables en exteriores; pueden fallar dentro de la cabina o lejos del centro de población.',
         practica: 'Fuera de ciudades conviene antena externa y equipo con LTE B28/700 MHz.' },
    0: { telemetria: 'No hay transmisión 4G; el equipo debe guardar posiciones (buffer) y enviarlas al recuperar señal.',
         voz: 'Sin servicio 4G AT&T.',
         practica: 'Revisa si hay 3G en la zona (sólo para equipos con 3G) o considera SIM multi-operador o satelital.' }
  },
  '3g': {
    2: { telemetria: 'Funciona en equipos con 3G (UMTS). Equipos sólo LTE (LTE-M, Cat-1) no se conectan en 3G.',
         voz: 'Estables, incluso en interiores.',
         practica: 'Confirma que el equipo soporte 3G y la banda de AT&T.' },
    1: { telemetria: 'Sólo equipos con 3G; en orillas y zonas CobEx espera reintentos o reportes atrasados.',
         voz: 'Pueden fallar dentro de la cabina o con antenas de poca ganancia.',
         practica: 'Equipos sólo LTE no funcionan aquí aunque haya 3G. Antena externa ayuda en orillas.' },
    0: { telemetria: 'No hay transmisión 3G; el equipo debe guardar posiciones (buffer).',
         voz: 'Sin servicio 3G AT&T.',
         practica: 'Si el tramo es crítico, considera SIM multi-operador o respaldo satelital.' }
  }
};

function v2Tile_(tec, lonF, latF) {
  const key = 'v2_' + tec + '_' + lonF + '_' + latF;
  const cache = CacheService.getScriptCache();
  let txt = cache.get(key);
  if (txt === null) {
    const r = UrlFetchApp.fetch(V2_BASE + 'v2/grid_' + tec + '/' + lonF + '_' + latF + '.txt', { muteHttpExceptions: true });
    txt = r.getResponseCode() === 200 ? r.getContentText() : '';
    cache.put(key, txt, 21600);
  }
  return txt ? txt.split('\n') : null;
}

/** Código 0/1/2 de una tecnología ('4g' | '3g') en un punto */
function v2Codigo(tec, lat, lon) {
  const latF = Math.floor(lat), lonF = Math.floor(lon);
  const rows = v2Tile_(tec, lonF, latF);
  if (!rows) return 0;
  const row = Math.min(199, Math.floor((latF + 1 - lat) / V2_RES));
  const col = Math.min(199, Math.floor((lon - lonF) / V2_RES));
  return Number(rows[row].charAt(col)) || 0;
}

function v2Tip_(tec, c, titulo) {
  const t = V2_TIP[tec][c];
  return '💡 Qué esperar en campo' + (titulo ? ' (' + titulo + ')' : '') + ':\n' +
         '• Telemetría IoT (GPS, LTE-M, mensajes cortos): ' + t.telemetria + '\n' +
         '• Llamadas y datos de celular: ' + t.voz + '\n' +
         '• En la práctica: ' + t.practica;
}

/** Punto: muestra 4G y 3G; el tip es de la tecnología elegida (por defecto 4G) */
function v2Punto(lat, lon, tec) {
  tec = tec || '4g';
  const c4 = v2Codigo('4g', lat, lon), c3 = v2Codigo('3g', lat, lon);
  const c = tec === '4g' ? c4 : c3;
  return '📍 ' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '\n' +
         'AT&T 4G: ' + V2_TXT['4g'][c4] + '\n' +
         'AT&T 3G: ' + V2_TXT['3g'][c3] + '\n' +
         v2Tip_(tec, c, V2_TEC[tec]) + '\n' +
         '🗺️ ' + V2_BASE + 'v2/?tec=' + tec + '&lat=' + lat + '&lon=' + lon;
}

/** Ruta: km por nivel de la tecnología elegida + % de la otra */
function v2Ruta(origen, destino, tec) {
  tec = tec || '4g';
  const dir = Maps.newDirectionFinder().setOrigin(origen).setDestination(destino)
                  .setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
  if (!dir.routes || !dir.routes.length) return 'No encontré ruta.';
  const route = dir.routes[0];
  const pts = Maps.decodePolyline(route.overview_polyline.points);
  const km = route.legs.reduce((s, l) => s + l.distance.value, 0) / 1000;

  const muestras = []; let acum = 0, prev = null;
  for (let i = 0; i < pts.length; i += 2) {
    const p = [pts[i], pts[i + 1]];
    if (prev) acum += v2Dist_(prev, p);
    if (!prev || acum >= 1) { muestras.push(p); acum = 0; }
    prev = p;
  }
  const otra = tec === '4g' ? '3g' : '4g';
  const cuenta = [0, 0, 0]; let sinOtra = 0, tramosSin = 0, enSin = false;
  muestras.forEach(p => {
    const c = v2Codigo(tec, p[0], p[1]); cuenta[c]++;
    if (c === 0 && !enSin) tramosSin++; enSin = c === 0;
    if (v2Codigo(otra, p[0], p[1]) === 0) sinOtra++;
  });
  const n = muestras.length, pct = v => Math.round(100 * v / n);
  const peor = cuenta[0] >= 2 ? 0 : (cuenta[1] >= 2 ? 1 : 2);
  return '🛣️ ' + route.legs[0].start_address + ' → ' + route.legs[route.legs.length - 1].end_address + '\n' +
         km.toFixed(0) + ' km · ' + V2_TEC[tec] + ': ' + (100 - pct(cuenta[0])) + '% con cobertura\n' +
         '✅ Garantizada ' + pct(cuenta[2]) + '%  ' + (tec === '4g' ? '🔵' : '🟣') + ' Con cobertura ' + pct(cuenta[1]) + '%  ⚫ Sin ' + pct(cuenta[0]) + '%' +
         (tramosSin && cuenta[0] ? ' (' + tramosSin + ' tramo' + (tramosSin > 1 ? 's' : '') + ')' : '') + '\n' +
         V2_TEC[otra] + ': ' + (100 - pct(sinOtra)) + '% con cobertura\n\n' +
         v2Tip_(tec, peor, V2_TXT[tec][peor].replace(/^\S+\s/, '') + (peor !== 2 ? ' · ~' + cuenta[peor] + ' km' : '')) + '\n' +
         '🗺️ ' + V2_BASE + 'v2/ruta.html?tec=' + tec + '&o=' + pts[0] + ',' + pts[1] + '&d=' + pts[pts.length - 2] + ',' + pts[pts.length - 1];
}

function v2Dist_(a, b) {
  const R = 6371, t = Math.PI / 180, dLat = (b[0] - a[0]) * t, dLon = (b[1] - a[1]) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function v2Ayuda() {
  return '📶 *Cobertura AT&T 4G / 3G*\n\n' +
    '*Un punto:* comparte tu ubicación 📎 o escribe `lat,lon`\n' +
    '   ej. `19.4326,-99.1332`  ·  para 3G: `3g 19.4326,-99.1332`\n\n' +
    '*Una ruta:* `ruta origen > destino`\n' +
    '   ej. `ruta CDMX > Oaxaca`  ·  para 3G: `3g ruta CDMX > Oaxaca`\n\n' +
    '*Niveles:* ✅ Garantizada · 🔵/🟣 Con cobertura (incluye CobEx) · ⚫ Sin cobertura\n' +
    'Ojo: equipos sólo LTE (LTE-M, Cat-1) no funcionan en 3G.';
}

/**
 * Router para tu doPost: v2Responder(update.message) → texto (envíalo con parse_mode 'Markdown').
 *   "19.43,-99.13" · "3g 19.43,-99.13" · "ruta A > B" · "3g ruta A > B" · ubicación compartida
 */
function v2Responder(message) {
  if (message.location) return v2Punto(message.location.latitude, message.location.longitude, '4g');
  let t = String(message.text || '').trim(), tec = '4g';
  const mt = t.match(/^\/?(4g|3g)\b\s*/i);
  if (mt) { tec = mt[1].toLowerCase(); t = t.slice(mt[0].length); }
  const m = t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) return v2Punto(Number(m[1]), Number(m[2]), tec);
  const r = t.match(/^\/?ruta\s+(.+?)\s*>\s*(.+)$/i);
  if (r) return v2Ruta(r[1], r[2], tec);
  return v2Ayuda();
}

function testV2() {
  Logger.log(v2Responder({ text: '24.8475,-98.155' }));
  Logger.log(v2Responder({ text: '3g 24.8475,-98.155' }));
  Logger.log(v2Responder({ text: 'ruta Ciudad de México > Oaxaca, Oax' }));
}
