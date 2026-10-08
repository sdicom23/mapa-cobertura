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


  /** Primer layer de etiquetas del mapa base: las capas de cobertura se insertan debajo para no tapar nombres */
  function primeraEtiqueta(map) {
    const l = (map.getStyle().layers || []).find(x => x.type === 'symbol');
    return l ? l.id : undefined;
  }

  /** Nombres de calles visibles desde zoom más bajo y con contorno blanco para leerse sobre la cobertura */
  function mejorarEtiquetas(map) {
    (map.getStyle().layers || []).forEach(l => {
      if (l.type !== 'symbol') return;
      const sl = l['source-layer'] || '';
      try {
        if (sl === 'transportation_name') {
          const menor = /minor|path|service|track/i.test(l.id);
          map.setLayerZoomRange(l.id, menor ? 10 : 8, l.maxzoom || 24);
          map.setLayoutProperty(l.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 8, menor ? 9 : 10, 12, menor ? 11 : 12, 14, menor ? 12 : 13, 17, 15]);
        }
        if (sl === 'transportation_name' || sl === 'place' || sl === 'poi') {
          map.setPaintProperty(l.id, 'text-color', '#222');
          map.setPaintProperty(l.id, 'text-halo-color', 'rgba(255,255,255,0.95)');
          map.setPaintProperty(l.id, 'text-halo-width', 1.6);
        }
      } catch (e) { /* capa sin texto */ }
    });
  }

  // Color de una capa: por nivel de señal (si el operador define "niveles") o por tecnología
  function colorOp(op) {
    if (!op || !op.niveles) return colorTec();
    const pares = [];
    Object.entries(op.niveles).forEach(([k, v]) => pares.push(k, v.color));
    return ['match', ['to-string', ['get', op.campoNivel || 'cat']], ...pares, '#9aa0a6'];
  }

  let cargadas = [];   // operadores reales cargados (para la leyenda)

  /** Agrega las capas de cobertura al mapa. Devuelve { capas:[{id,nombre,layers}], demo:bool }
   *  Un operador puede tener "archivo" (uno) o "archivos" (varios por rango de zoom). */
  async function cargarCoberturas(map, opacidad) {
    const capas = [];
    const debajoDe = primeraEtiqueta(map);
    mejorarEtiquetas(map);
    for (const op of C.OPERADORES) {
      const lista = op.archivos || (op.archivo ? [{ url: op.archivo }] : []);
      const ok = [];
      const ver = C.VERSION_DATOS ? '?v=' + C.VERSION_DATOS : '';
      for (const a of lista) if (await existe(a.url + ver)) ok.push(a);
      if (!ok.length) continue;
      const layers = [];
      ok.forEach((a, i) => {
        const id = 'cob_' + op.id + (i ? '_' + i : '');
        map.addSource(id, { type: 'vector', url: 'pmtiles://' + new URL(a.url + ver, location.href).href });
        const capa = { id, type: 'fill', source: id, 'source-layer': op.capa,
          paint: { 'fill-color': colorOp(op), 'fill-opacity': opacidad, 'fill-antialias': false } };
        if (a.minzoom !== undefined) capa.minzoom = a.minzoom;
        if (a.maxzoom !== undefined) capa.maxzoom = a.maxzoom;
        map.addLayer(capa, debajoDe);
        layers.push(id);
      });
      capas.push({ id: layers[0], nombre: op.nombre, layers, op });
      cargadas.push(op);
    }
    if (capas.length) return { capas, demo: false };

    map.addSource('cob_demo', { type: 'geojson', data: coberturaDemo() });
    C.OPERADORES.forEach(op => {
      map.addLayer({
        id: 'cob_' + op.id, type: 'fill', source: 'cob_demo',
        filter: ['==', ['get', 'operador'], op.nombre],
        paint: { 'fill-color': colorTec(), 'fill-opacity': opacidad }
      }, debajoDe);
      capas.push({ id: 'cob_' + op.id, nombre: op.nombre, layers: ['cob_' + op.id] });
    });
    return { capas, demo: true };
  }

  /** Todos los ids de capa de una lista de operadores */
  function idsCapas(capas) { return capas.flatMap(c => c.layers || [c.id]); }

  /** Coberturas en un punto: [{operador, tecnologia, calidad, etiqueta, color}] — la mejor por operador */
  function coberturaEn(map, lngLat, capas) {
    const ids = idsCapas(capas).filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
    if (!ids.length) return [];
    const fs = map.queryRenderedFeatures(map.project(lngLat), { layers: ids });
    const vistos = new Set();
    const res = [];
    const orden = { buena: 2, regular: 1 };
    fs.forEach(f => {
      const cap = capas.find(c => (c.layers || [c.id]).includes(f.layer.id)) || {};
      const op = cap.op;
      const operador = f.properties.operador || cap.nombre || '';
      let tecnologia, calidad, etiqueta, color, cat = '', rango = 0, n_tip = '';
      if (op && op.niveles) {
        cat = String(f.properties[op.campoNivel || 'cat'] || '');
        const n = op.niveles[cat] || {};
        tecnologia = op.tecnologia || '';
        calidad = n.calidad || 'regular';
        etiqueta = n.etiqueta || '';
        color = n.color;
        n_tip = n.tip || null;
        rango = Number(f.properties.nivel) || 0;
      } else {
        tecnologia = String(f.properties[C.CAMPO_TECNOLOGIA] || '');
        calidad = String(f.properties[C.CAMPO_CALIDAD] || 'buena').toLowerCase();
        color = C.COLORES_TECNOLOGIA[tecnologia];
      }
      if (op && op.niveles) {   // por nivel: quedarse sólo con la mejor señal del operador
        const prev = res.find(r => r.operador === operador);
        if (prev) {
          if (rango > prev._r || (rango === prev._r && orden[calidad] > orden[prev.calidad]))
            Object.assign(prev, { tecnologia, calidad, etiqueta, color, cat, tip: n_tip, _r: rango });
          return;
        }
        res.push({ operador, tecnologia, calidad, etiqueta, color, cat, tip: n_tip, _r: rango });
        return;
      }
      const k = operador + '|' + tecnologia + '|' + calidad;
      if (vistos.has(k)) return;
      vistos.add(k);
      res.push({ operador, tecnologia, calidad, etiqueta: '', color });
    });
    return res;
  }

  /** Botones para elegir operador. onCambio(idSeleccionado) */
  let seleccion = 'todos';   // operador/tecnología visible ('todos' = todas)
  function seleccionado() { return seleccion; }

  /** Botones para elegir operador/tecnología. onCambio(idSeleccionado) */
  function botonesOperador(contenedor, map, capas, onCambio) {
    // ?tec=3g|4g en la URL elige la tecnología al abrir (ver C.TEC_URL)
    const tq = new URLSearchParams(location.search).get('tec');
    const ini = (tq && C.TEC_URL && C.TEC_URL[tq.toLowerCase()]) || C.OPERADOR_INICIAL;
    seleccion = capas.some(c => c.id === 'cob_' + ini) ? 'cob_' + ini : (C.MOSTRAR_TODOS === false && capas.length ? capas[0].id : 'todos');
    const opciones = capas.map(c => ({ k: c.id, n: c.nombre }));
    if (C.MOSTRAR_TODOS !== false || !capas.length) opciones.push({ k: 'todos', n: 'Todos' });
    const aplicar = () => capas.forEach(c => (c.layers || [c.id]).forEach(id =>
      map.setLayoutProperty(id, 'visibility', (seleccion === 'todos' || seleccion === c.id) ? 'visible' : 'none')));
    opciones.forEach(o => {
      const b = document.createElement('button');
      b.className = 'btn' + (o.k === seleccion ? ' on' : '');
      b.textContent = o.n;
      b.onclick = () => {
        seleccion = o.k;
        contenedor.querySelectorAll('.btn').forEach(x => x.classList.toggle('on', x === b));
        aplicar();
        if (onCambio) onCambio(seleccion);
      };
      contenedor.appendChild(b);
    });
    aplicar();
  }

  function leyendaTecnologias(contenedor) {
    contenedor.innerHTML = '';
    const sel = cargadas.find(op => 'cob_' + op.id === seleccion);
    const conNiveles = sel ? (sel.niveles ? [sel] : []) : cargadas.filter(op => op.niveles);
    const pares = conNiveles.length
      ? conNiveles.flatMap(op => Object.values(op.niveles).map(n => [n.etiqueta, n.color]))
      : Object.entries(C.COLORES_TECNOLOGIA);
    pares.forEach(([t, c]) => {
      contenedor.insertAdjacentHTML('beforeend',
        `<span class="ley"><span class="sq" style="background:${c}"></span>${esc(t)}</span>`);
    });
  }

  /** Recuadro "Qué esperar en campo". tip = texto o { telemetria, voz, practica } */
  function tipHTML(tip, titulo) {
    if (!tip) return '';
    const cab = `<b>💡 ${titulo ? esc(titulo) + ' — ' : ''}Qué esperar en campo:</b>`;
    if (typeof tip === 'string') return `<div class="tip">${cab}<br>${esc(tip)}</div>`;
    const li = (t, v) => v ? `<li><b>${t}:</b> ${esc(v)}</li>` : '';
    return `<div class="tip">${cab}<ul>` +
      li('Telemetría IoT (GPS, LTE-M, mensajes cortos)', tip.telemetria) +
      li('Llamadas y datos de celular', tip.voz) +
      li('En la práctica', tip.practica) + `</ul></div>`;
  }

  /** Texto plano del tip (para el title de la leyenda) */
  function tipTexto(tip) {
    if (!tip) return '';
    if (typeof tip === 'string') return tip;
    return `Telemetría: ${tip.telemetria || ''}\nLlamadas y datos: ${tip.voz || ''}\nEn la práctica: ${tip.practica || ''}`;
  }

  /** Tip de la ruta: el del peor nivel con al menos "minKm" km (sin señal → extendidas → baja); si no, el del mejor */
  function tipRuta(km, escala, minKm = 1) {
    for (const e of [...escala].reverse()) {
      if ((km[e.k] || 0) >= minKm && e.tip && !['alta', 'media', 'buena'].includes(e.k))
        return tipHTML(e.tip, `${e.etiqueta} · ${km[e.k].toFixed(km[e.k] < 10 ? 1 : 0)} km`);
    }
    const mejor = escala.find(e => (km[e.k] || 0) > 0);
    return mejor ? tipHTML(mejor.tip, mejor.etiqueta) : '';
  }

  function cuandoListo(map, fn) {
    map.once('idle', fn);
    map.triggerRepaint();
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }


  /***** ESCALA DE COLORES PARA RUTAS *****/
  const SIN_SENAL = { k: 'sin', etiqueta: 'Sin señal', color: '#8b0000' };

  /** Niveles para colorear la ruta, del mejor al peor, terminando en "sin".
   *  Si el operador trae niveles de señal (config "niveles") usa esos mismos colores del fondo. */
  function escalaRuta(capas) {
    const op = (capas.find(c => c.id === seleccion && c.op && c.op.niveles) || capas.find(c => c.op && c.op.niveles) || {}).op;
    const lista = op
      ? Object.entries(op.niveles).map(([k, v]) => ({ k, etiqueta: v.etiqueta, color: v.color, tip: v.tip || null }))
      : [{ k: 'buena', etiqueta: 'Buena', color: '#1D9E75' }, { k: 'regular', etiqueta: 'Regular', color: '#EF9F27' }];
    return [...lista, { ...SIN_SENAL, tip: C.TIP_SIN_SENAL || null }];
  }

  /** Mejor nivel (clave de la escala) en un punto */
  function nivelEn(map, lngLat, capas, escala) {
    let mejor = escala.length - 1;   // "sin"
    coberturaEn(map, lngLat, capas).forEach(c => {
      let i = escala.findIndex(e => e.k === c.cat);
      if (i < 0) i = escala.findIndex(e => e.k === c.calidad);
      if (i < 0) i = 0;
      if (i < mejor) mejor = i;
    });
    return escala[mejor].k;
  }

  /** Expresión de color MapLibre para la propiedad "nivel" de los segmentos */
  function colorEscala(escala) {
    return ['match', ['get', 'nivel'], ...escala.flatMap(e => [e.k, e.color]), '#888'];
  }

  /** Leyenda de líneas */
  function leyendaEscala(contenedor, escala) {
    contenedor.innerHTML = escala.map(e =>
      `<span class="ley" title="${esc(tipTexto(e.tip))}"><span class="linea" style="background:${e.color}"></span>${esc(e.etiqueta)}</span>`).join('');
  }

  /** Resumen "■ 120 km · ■ 30 km ..." (omite niveles en cero) */
  function resumenKm(km, escala) {
    return escala.filter(e => km[e.k] >= 0.05).map(e =>
      `<span class="sq" style="background:${e.color};opacity:1"></span> ${km[e.k] < 10 ? km[e.k].toFixed(1) : km[e.k].toFixed(0)} km`).join(' · ');
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

  window.Comun = { primeraEtiqueta, mejorarEtiquetas, seleccionado, cargarCoberturas, coberturaEn, idsCapas, escalaRuta, nivelEn, colorEscala, leyendaEscala, resumenKm, tipRuta, tipHTML, botonesOperador, leyendaTecnologias, cuandoListo, esc, cargarEventos,
                   cargarRiesgoMunicipal, municipioEn, COLOR_NIVEL, cargarTramos, tramoEn, COLOR_TRAMO };
})();
