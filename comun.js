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

  window.Comun = { cargarCoberturas, coberturaEn, botonesOperador, leyendaTecnologias, cuandoListo, esc };
})();
