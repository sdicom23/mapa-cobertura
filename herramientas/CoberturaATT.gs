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
  2: '🔵 Extendida (≈ -101 dBm)',
  3: '🟠 Baja (-121 a -111 dBm)',
  4: '🟡 Media (-111 a -100 dBm)',
  5: '🟢 Alta (≥ -100 dBm)'
};

function cobTile_(lonF, latF) {
  const key = 'cob_' + lonF + '_' + latF;
  const cache = CacheService.getScriptCache();
  let txt = cache.get(key);
  if (txt === null) {
    const r = UrlFetchApp.fetch(COB_BASE + 'capas/grid_att4g/' + lonF + '_' + latF + '.txt', {muteHttpExceptions: true});
    txt = r.getResponseCode() === 200 ? r.getContentText() : '';   // 404 = sin cobertura en ese cuadro
    cache.put(key, txt, 21600); // 6 h
  }
  return txt ? txt.split('\n') : null;
}

/** Devuelve el código 0-5 para un punto. */
function coberturaCodigo(lat, lon) {
  const latF = Math.floor(lat), lonF = Math.floor(lon);
  const rows = cobTile_(lonF, latF);
  if (!rows) return 0;
  const row = Math.min(199, Math.floor((latF + 1 - lat) / COB_RES));
  const col = Math.min(199, Math.floor((lon - lonF) / COB_RES));
  return Number(rows[row].charAt(col)) || 0;
}

/** Texto listo para Telegram para un punto. */
function coberturaPunto(lat, lon) {
  const c = coberturaCodigo(lat, lon);
  return '📍 ' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '\n' +
         'AT&T 4G: ' + COB_TXT[c] + '\n' +
         '🗺️ ' + COB_BASE + '?lat=' + lat + '&lon=' + lon;
}

/** Cobertura a lo largo de una ruta (origen/destino: texto o "lat,lon"). Usa Maps de Apps Script. */
function coberturaRuta(origen, destino) {
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
    const c = coberturaCodigo(p[0], p[1]);
    cuenta[c]++;
    if (c === 0 && enHueco === null) enHueco = i;
    if (c !== 0 && enHueco !== null) { huecos.push([enHueco, i - 1]); enHueco = null; }
  });
  if (enHueco !== null) huecos.push([enHueco, muestras.length - 1]);

  const n = muestras.length;
  const pct = c => Math.round(100 * cuenta[c] / n) + '%';
  let msg = '🛣️ ' + route.legs[0].start_address + ' → ' + route.legs[route.legs.length - 1].end_address +
            '\n' + km.toFixed(0) + ' km · AT&T 4G\n' +
            '🟢 Alta ' + pct(5) + '  🟡 Media ' + pct(4) + '  🟠 Baja ' + pct(3) + '\n' +
            '🔵 Extendida ' + Math.round(100 * (cuenta[1] + cuenta[2]) / n) + '%  ⚫ Sin cobertura ' + pct(0);
  const largos = huecos.filter(h => h[1] - h[0] >= 4)   // ≥ ~5 km
                       .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 5);
  if (largos.length) {
    msg += '\n\nTramos sin cobertura más largos:';
    largos.forEach(h => {
      const a = muestras[h[0]];
      msg += '\n• ~' + (h[1] - h[0] + 1) + ' km desde ' + a[0].toFixed(4) + ',' + a[1].toFixed(4);
    });
  }
  return msg;
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
  Logger.log(coberturaRuta('Querétaro, Qro', 'San Luis Potosí, SLP'));
}
