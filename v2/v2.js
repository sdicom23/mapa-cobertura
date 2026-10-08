/**
 * Mapa v2 — AT&T 4G / 3G a partir de los KMZ 2026 (Total con CobEx + Garantizada).
 * Consulta de puntos y rutas con la rejilla grid_{4g|3g}/ (celdas 0.005° ≈ 550 m), igual que el bot.
 */
(function () {
  const C = window.CONFIG;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);

  const TEC = {
    '4g': { nombre: '4G LTE', fecha: 'mar 2026' },
    '3g': { nombre: '3G',     fecha: 'Total mar 2025 · Garantizada mar 2026' }
  };

  // Niveles por tecnología (código de la rejilla: 0 sin, 1 cobertura, 2 garantizada)
  const NIV = {
    '4g': {
      2: { k: 'garantizada', etiqueta: 'Garantizada', color: '#1a9850',
           tip: { telemetria: 'Funciona sin problema, con reportes en tiempo real.',
                  voz: 'Estables, incluso dentro de la cabina y en interiores.',
                  practica: 'Cualquier equipo LTE con antena interna trabaja bien.' } },
      1: { k: 'cobertura', etiqueta: 'Con cobertura (incluye CobEx)', color: '#3d7fc0',
           tip: { telemetria: 'Funciona; en orillas y zonas CobEx puede haber reintentos o reportes atrasados.',
                  voz: 'Estables en exteriores; pueden fallar dentro de la cabina o lejos del centro de población.',
                  practica: 'Fuera de ciudades conviene antena externa y equipo con LTE B28/700 MHz.' } },
      0: { k: 'sin', etiqueta: 'Sin cobertura 4G', color: '#8b0000',
           tip: { telemetria: 'No hay transmisión 4G; el equipo debe guardar posiciones (buffer) y enviarlas al recuperar señal.',
                  voz: 'Sin servicio 4G AT&T.',
                  practica: 'Revisa si hay 3G en la zona (sólo para equipos con 3G) o considera SIM multi-operador o satelital.' } }
    },
    '3g': {
      2: { k: 'garantizada', etiqueta: 'Garantizada', color: '#1a9850',
           tip: { telemetria: 'Funciona en equipos con 3G (UMTS). Equipos sólo LTE (LTE-M, Cat-1) no se conectan en 3G.',
                  voz: 'Estables, incluso en interiores.',
                  practica: 'Confirma que el equipo soporte 3G y la banda de AT&T.' } },
      1: { k: 'cobertura', etiqueta: 'Con cobertura (incluye CobEx)', color: '#8e5bb5',
           tip: { telemetria: 'Sólo equipos con 3G; en orillas y zonas CobEx espera reintentos o reportes atrasados.',
                  voz: 'Pueden fallar dentro de la cabina o con antenas de poca ganancia.',
                  practica: 'Equipos sólo LTE no funcionan aquí aunque haya 3G. Antena externa ayuda en orillas.' } },
      0: { k: 'sin', etiqueta: 'Sin cobertura 3G', color: '#8b0000',
           tip: { telemetria: 'No hay transmisión 3G; el equipo debe guardar posiciones (buffer).',
                  voz: 'Sin servicio 3G AT&T.',
                  practica: 'Si el tramo es crítico, considera SIM multi-operador o respaldo satelital.' } }
    }
  };

  const RES = 0.005, cache = {};
  async function tile(tec, lonF, latF) {
    const k = tec + lonF + '_' + latF;
    if (!(k in cache)) cache[k] = fetch(`grid_${tec}/${lonF}_${latF}.txt`)
      .then(r => r.ok ? r.text() : '').then(t => t ? t.split('\n') : null).catch(() => null);
    return cache[k];
  }
  /** Código 0/1/2 en un punto */
  async function codigo(tec, lat, lon) {
    const latF = Math.floor(lat), lonF = Math.floor(lon);
    const rows = await tile(tec, lonF, latF);
    if (!rows) return 0;
    const r = Math.min(199, Math.floor((latF + 1 - lat) / RES)), c = Math.min(199, Math.floor((lon - lonF) / RES));
    return Number(rows[r].charAt(c)) || 0;
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function tipHTML(n, titulo) {
    const t = n.tip;
    return `<div class="tip"><b>💡 ${titulo ? esc(titulo) + ' — ' : ''}Qué esperar en campo:</b><ul>` +
      `<li><b>Telemetría IoT (GPS, LTE-M, mensajes cortos):</b> ${esc(t.telemetria)}</li>` +
      `<li><b>Llamadas y datos de celular:</b> ${esc(t.voz)}</li>` +
      `<li><b>En la práctica:</b> ${esc(t.practica)}</li></ul></div>`;
  }


  function mejorarEtiquetas(map) {
    (map.getStyle().layers || []).forEach(l => {
      if (l.type !== 'symbol') return;
      const sl = l['source-layer'] || '';
      try {
        if (sl === 'transportation_name') {
          const menor = /minor|path|service|track/i.test(l.id);
          map.setLayerZoomRange(l.id, menor ? 13 : 10, l.maxzoom || 24);
          map.setLayoutProperty(l.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 10, menor ? 10 : 11, 14, menor ? 12 : 13, 17, 15]);
        }
        if (sl === 'transportation_name' || sl === 'place' || sl === 'poi') {
          map.setPaintProperty(l.id, 'text-color', '#222');
          map.setPaintProperty(l.id, 'text-halo-color', 'rgba(255,255,255,0.95)');
          map.setPaintProperty(l.id, 'text-halo-width', 1.6);
        }
      } catch (e) {}
    });
  }

  /** Agrega la capa vectorial (ambas tecnologías, filtradas) */
  function agregarCapas(map, opacidad) {
    const sym = (map.getStyle().layers || []).find(x => x.type === 'symbol');
    mejorarEtiquetas(map);
    map.addSource('kmz', { type: 'vector', url: 'pmtiles://' + new URL('att_kmz_2026.pmtiles', location.href).href });
    ['4g', '3g'].forEach(tec => {
      map.addLayer({ id: 'cob_' + tec, type: 'fill', source: 'kmz', 'source-layer': 'cobertura',
        filter: ['==', ['get', 'tech'], tec],
        paint: { 'fill-color': ['match', ['get', 'nivel'], 2, NIV[tec][2].color, NIV[tec][1].color],
                 'fill-opacity': opacidad, 'fill-antialias': false } }, sym ? sym.id : undefined);
    });
  }
  function mostrarTec(map, tec) {
    ['4g', '3g'].forEach(t => map.getLayer('cob_' + t) && map.setLayoutProperty('cob_' + t, 'visibility', t === tec ? 'visible' : 'none'));
  }

  /** Botones 4G / 3G; recuerda la elección en la URL (?tec=) */
  function selectorTec(cont, inicial, onCambio) {
    let sel = inicial;
    ['4g', '3g'].forEach(t => {
      const b = document.createElement('button');
      b.className = 'btn' + (t === sel ? ' on' : '');
      b.textContent = TEC[t].nombre;
      b.onclick = () => {
        sel = t;
        cont.querySelectorAll('.btn').forEach(x => x.classList.toggle('on', x === b));
        const u = new URL(location.href); u.searchParams.set('tec', t); history.replaceState(null, '', u);
        onCambio(t);
      };
      cont.appendChild(b);
    });
  }
  function leyenda(cont, tec, tipo) {
    const n = NIV[tec];
    const sw = tipo === 'linea' ? 'linea' : 'sq';
    cont.innerHTML = [2, 1, 0].map(c =>
      `<span class="ley" title="${esc(n[c].tip.practica)}"><span class="${sw}" style="background:${n[c].color};opacity:${c ? .8 : 1}"></span>${esc(n[c].etiqueta)}</span>`).join('') +
      `<span class="ley sub">AT&T · ${esc(TEC[tec].fecha)}</span>`;
  }
  function tecInicial() {
    const t = new URLSearchParams(location.search).get('tec');
    return t === '3g' ? '3g' : '4g';
  }

  window.V2 = { TEC, NIV, codigo, tipHTML, esc, agregarCapas, mostrarTec, selectorTec, leyenda, tecInicial };
})();
