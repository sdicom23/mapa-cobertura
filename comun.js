/**
 * Funciones compartidas por index.html (punto) y ruta.html (ruta).
 */
(function () {
  const C = window.CONFIG;

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);

  function colorTec() {
    const pares = [];
    Object.entries(C.COLORES_TECNOLOGIA).forEach(([k, v]) => pares.push(k, v));
    return ['match', ['to-string', ['get', C.CAMPO_TECNOLOGIA]], ...pares, '#9aa0a6'];
  }

  async function existe(url) {
    try {
      const r = await fetch(url, { headers: { Range: 'bytes=0-15' } });
      return r.ok;
    } catch (e) { return false; }
  }

  function coberturaDemo() {
    const zonas = [
      [-99.13, 19.43, 70], [-100.39, 20.59, 45], [-98.20, 19.04, 45], [-103.35, 20.67, 60],
      [-100.31, 25.68, 60], [-96.13, 19.18, 35], [-101.68, 21.12, 40], [-89.62, 20.97, 35],
      [-98.75, 20.10, 30], [-97.10, 18.85, 25]
    ];
    const f = [];
    zonas.forEach(([x, y, r]) => {
      f.push(turf.circle([x, y], r, { units: 'kilometers', properties: { operador: 'AT&T', tecnologia: 'LTE', calidad: 'buena' } }));
      f.push(turf.circle([x + 0.05, y - 0.03], r * 0.45, { units: 'kilometers', properties: { operador: 'AT&T', tecnologia: '5G', calidad: 'buena' } }));
      f.push(turf.circle([x - 0.1, y + 0.08], r * 1.25, { units: 'kilometers', properties: { operador: 'AT&T', tecnologia: 'LTE-M', calidad: 'regular' } }));
      f.push(turf.circle([x + 0.08, y + 0.05], r * 1.1, { units: 'kilometers', properties: { operador: 'Telcel', tecnologia: 'LTE', calidad: 'buena' } }));
    });
    return turf.featureCollection(f);
  }

  /** Agrega las capas de cobertura al mapa. Devuelve { capas:[{id,nombre}], demo:bool } */
  async function cargarCoberturas(map, opacidad) {
    const capas = [];
    for (const op of C.OPERADORES) {
      if (!(await existe(op.archivo))) continue;
      const abs = new URL(op.archivo, location.href).href;
      map.addSource('cob_' + op.id, { type: 'vector', url: 'pmtiles://' + abs });
      map.addLayer({
        id: 'cob_' + op.id, type: 'fill', source: 'cob_' + op.id, 'source-layer': op.capa,
        paint: { 'fill-color': colorTec(), 'fill-opacity': opacidad }
      });
      capas.push({ id: 'cob_' + op.id, nombre: op.nombre });
    }
    if (capas.length) return { capas, demo: false };

    map.addSource('cob_demo', { type: 'geojson', data: coberturaDemo() });
    C.OPERADORES.forEach(op => {
      map.addLayer({
        id: 'cob_' + op.id, type: 'fill', source: 'cob_demo',
        filter: ['==', ['get', 'operador'], op.nombre],
        paint: { 'fill-color': colorTec(), 'fill-opacity': opacidad }
      });
      capas.push({ id: 'cob_' + op.id, nombre: op.nombre });
    });
    return { capas, demo: true };
  }

  /** Coberturas en un punto de pantalla: [{operador, tecnologia, calidad}] sin repetir */
  function coberturaEn(map, lngLat, capas) {
    const ids = capas.filter(c => map.getLayoutProperty(c.id, 'visibility') !== 'none').map(c => c.id);
    if (!ids.length) return [];
    const fs = map.queryRenderedFeatures(map.project(lngLat), { layers: ids });
    const vistos = new Set();
    const res = [];
    fs.forEach(f => {
      const operador = f.properties.operador || (capas.find(c => c.id === f.layer.id) || {}).nombre || '';
      const tecnologia = String(f.properties[C.CAMPO_TECNOLOGIA] || '');
      const calidad = String(f.properties[C.CAMPO_CALIDAD] || 'buena').toLowerCase();
      const k = operador + '|' + tecnologia + '|' + calidad;
      if (vistos.has(k)) return;
      vistos.add(k);
      res.push({ operador, tecnologia, calidad });
    });
    return res;
  }

  /** Botones para elegir operador. onCambio(idSeleccionado) */
  function botonesOperador(contenedor, map, capas, onCambio) {
    let sel = 'todos';
    const opciones = [...capas.map(c => ({ k: c.id, n: c.nombre })), { k: 'todos', n: 'Todos' }];
    opciones.forEach(o => {
      const b = document.createElement('button');
      b.className = 'btn' + (o.k === sel ? ' on' : '');
      b.textContent = o.n;
      b.onclick = () => {
        sel = o.k;
        contenedor.querySelectorAll('.btn').forEach(x => x.classList.toggle('on', x === b));
        capas.forEach(c => map.setLayoutProperty(c.id, 'visibility', (sel === 'todos' || sel === c.id) ? 'visible' : 'none'));
        if (onCambio) onCambio(sel);
      };
      contenedor.appendChild(b);
    });
  }

  function leyendaTecnologias(contenedor) {
    Object.entries(C.COLORES_TECNOLOGIA).forEach(([t, c]) => {
      contenedor.insertAdjacentHTML('beforeend',
        `<span class="ley"><span class="sq" style="background:${c}"></span>${esc(t)}</span>`);
    });
  }

  function cuandoListo(map, fn) {
    if (map.isMoving() || !map.areTilesLoaded()) map.once('idle', fn); else fn();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /***** INCIDENCIAS *****/
  // Peso de cada incidente: más reciente, con violencia y de fuente confiable = más peso
  function pesoEvento(p, ahora) {
    const ts = new Date(`${p.fecha}T${p.hora || '12:00'}:00-06:00`).getTime();
    const dias = Math.max(0, (ahora - ts) / 86400000);
    return Math.exp(-dias / C.VIDA_MEDIA_DIAS) * (p.violencia === 'Sí' ? 1.5 : 1) * (Number(p.confianza) || 0.5);
  }

  /** Devuelve { features, demo } con la propiedad "peso" ya calculada */
  async function cargarEventos() {
    // Capa 2: noticias recopiladas (archivo en GitHub) + eventos en vivo de la hoja (bot / lector de noticias)
    const leer = async url => {
      if (!url) return [];
      try {
        const j = await (await fetch(url)).json();
        return j && Array.isArray(j.features) ? j.features : [];
      } catch (e) { console.warn('No se pudo leer', url, e); return []; }
    };
    const [fijas, vivas] = await Promise.all([leer(C.NOTICIAS_URL), leer(C.EVENTOS_URL)]);
    const vistos = new Set();
    const todas = [...vivas, ...fijas].filter(f => {
      const k = f.properties.url || f.properties.id || JSON.stringify(f.geometry.coordinates) + f.properties.fecha;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    let gj = { type: 'FeatureCollection', features: todas }, demo = false;
    if (!todas.length) { gj = eventosDemo(); demo = true; }
    const ahora = Date.now();
    gj.features.forEach(f => { f.properties.peso = Math.max(pesoEvento(f.properties, ahora), 0.05); });
    return { features: gj.features, demo };
  }

  function eventosDemo() {
    const focos = [
      [19.72, -99.22, 9], [20.32, -99.94, 7], [19.60, -99.05, 6], [19.84, -98.98, 3], [19.35, -98.67, 5],
      [19.28, -98.43, 9], [19.04, -98.04, 7], [18.84, -97.55, 8], [18.86, -97.37, 9], [18.81, -97.27, 7],
      [20.52, -100.81, 5], [20.68, -101.35, 4], [22.15, -100.98, 4], [19.59, -98.57, 4], [19.88, -98.90, 2]
    ];
    const tipos = ['Robo de unidad', 'Robo de carga', 'Robo a transportista', 'Bloqueo / ponchallantas',
                   'Enfrentamiento / balacera', 'Retén falso', 'Asalto a autobús'];
    let s = 11;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const features = [];
    focos.forEach(([lat, lon, n]) => {
      for (let i = 0; i < n * 2; i++) {
        const d = new Date(Date.now() - Math.floor(rnd() * 200) * 86400000);
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon + (rnd() - 0.5) * 0.1, lat + (rnd() - 0.5) * 0.1] },
          properties: { fecha: d.toISOString().slice(0, 10), hora: '', tipo: tipos[Math.floor(rnd() * tipos.length)],
                        violencia: rnd() < 0.7 ? 'Sí' : 'No', confianza: 0.6, fuente: 'Ejemplo' }
        });
      }
    });
    return { type: 'FeatureCollection', features };
  }

  /***** ÍNDICE OFICIAL POR MUNICIPIO (SESNSP) *****/
  const COLOR_NIVEL = ['match', ['get', 'nivel'], 1, '#fee08b', 2, '#fdae61', 3, '#f46d43', 4, '#a50026', '#cccccc'];

  /** Agrega la capa si existe capas/riesgo_municipal.geojson. Devuelve { features, periodo } o null */
  async function cargarRiesgoMunicipal(map, opacidad, antesDe) {
    let gj;
    try {
      const r = await fetch(C.RIESGO_MUNICIPAL_URL);
      if (!r.ok) return null;
      gj = await r.json();
    } catch (e) { return null; }
    if (!gj || !Array.isArray(gj.features) || !gj.features.length) return null;
    gj.features.forEach(f => { f.bbox = turf.bbox(f); });
    map.addSource('oficial', { type: 'geojson', data: gj });
    map.addLayer({ id: 'oficial', type: 'fill', source: 'oficial',
      paint: { 'fill-color': COLOR_NIVEL, 'fill-opacity': opacidad } }, antesDe);
    map.addLayer({ id: 'oficial-borde', type: 'line', source: 'oficial', minzoom: 7,
      paint: { 'line-color': '#a50026', 'line-width': 0.4, 'line-opacity': 0.4 } }, antesDe);
    return { features: gj.features, periodo: gj.periodo || '' };
  }

  /** Municipio (con índice) que contiene el punto, o null */
  function municipioEn(features, lngLat) {
    const [x, y] = lngLat;
    for (const f of features) {
      const b = f.bbox;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (turf.booleanPointInPolygon(lngLat, f)) return f.properties;
    }
    return null;
  }

  /***** CAPA 3: TRAMOS DE RIESGO (ANERPV, Overhaul, Canacar, SICT/GN) *****/
  const COLOR_TRAMO = ['match', ['get', 'nivel'], 5, '#a50026', 4, '#e0452c', 3, '#f59e3b', '#f5c26b'];

  async function cargarTramos(map) {
    let gj;
    try {
      const r = await fetch(C.TRAMOS_URL);
      if (!r.ok) return null;
      gj = await r.json();
    } catch (e) { return null; }
    if (!gj || !Array.isArray(gj.features) || !gj.features.length) return null;
    gj.features.forEach(f => { f.bbox = turf.bbox(f); });
    map.addSource('tramos-riesgo', { type: 'geojson', data: gj });
    map.addLayer({ id: 'tramos-riesgo', type: 'line', source: 'tramos-riesgo',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLOR_TRAMO, 'line-opacity': 0.55,
               'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 7, 12, 12] } });
    return { features: gj.features, resumen: gj.resumen || {} };
  }

  /** Tramo de riesgo más alto a menos de "km" del punto, o null */
  function tramoEn(features, lngLat, km) {
    const m = km / 100;   // margen aproximado en grados
    const [x, y] = lngLat;
    let mejor = null;
    for (const f of features) {
      const b = f.bbox;
      if (x < b[0] - m || x > b[2] + m || y < b[1] - m || y > b[3] + m) continue;
      if (mejor && f.properties.nivel <= mejor.nivel) continue;
      if (turf.pointToLineDistance(lngLat, f, { units: 'kilometers' }) <= km) mejor = f.properties;
    }
    return mejor;
  }

  window.Comun = { cargarCoberturas, coberturaEn, botonesOperador, leyendaTecnologias, cuandoListo, esc, cargarEventos,
                   cargarRiesgoMunicipal, municipioEn, COLOR_NIVEL, cargarTramos, tramoEn, COLOR_TRAMO };
})();
