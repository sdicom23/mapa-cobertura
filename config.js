/**
 * CONFIGURACIÓN DEL SITIO — es el único archivo que necesitas editar.
 */
window.CONFIG = {
  // Mapa base gratuito, sin registro
  MAPA_BASE: 'https://tiles.openfreemap.org/styles/positron',
  CENTRO: [-102.5, 23.6],
  ZOOM: 4.6,

  // Capas de cobertura. Sube cada .pmtiles a la carpeta "capas/" del repositorio.
  // "capa" es el nombre que usaste con tippecanoe -l <capa>
  OPERADORES: [
    // AT&T 4G (CRT, 2T 2026). Va en 2 archivos por el límite de 100 MB de GitHub:
    // zoom 4-8 (rejilla ~550 m) y zoom 9-11 (detalle; se sobre-escala al acercar más).
    { id: 'att', nombre: 'AT&T', capa: 'cobertura', tecnologia: 'LTE',
      archivos: [
        { url: 'capas/att4g_low.pmtiles',  maxzoom: 9 },
        { url: 'capas/att4g_high.pmtiles', minzoom: 9 }
      ],
      campoNivel: 'cat',   // la capa trae niveles de señal en vez de tecnología
      niveles: {
        alta:          { etiqueta: 'Alta (≥ -100 dBm)',        color: '#1a9850', calidad: 'buena',
                         tip: { telemetria: 'Funciona sin problema, con reportes en tiempo real.',
                           voz: 'Estables, incluso dentro de la cabina y en interiores.',
                           practica: 'Cualquier equipo con antena interna trabaja bien.' } },
        media:         { etiqueta: 'Media (-111 a -100 dBm)',  color: '#d9b81f', calidad: 'buena',
                         tip: { telemetria: 'Funciona bien; en interiores puede haber algún reintento ocasional.',
                           voz: 'Estables en exteriores; en sótanos, edificios o cabinas blindadas puede bajar la calidad.',
                           practica: 'La antena interna suele bastar; para equipos fijos en interior conviene antena externa.' } },
        baja:          { etiqueta: 'Baja (-121 a -111 dBm)',   color: '#f46d43', calidad: 'regular',
                         tip: { telemetria: 'Normalmente funciona, aunque puede haber reintentos o reportes atrasados.',
                           voz: 'Pueden fallar, sobre todo dentro de la cabina o con antenas de poca ganancia.',
                           practica: 'Un equipo con antena externa o con LTE B28/700 MHz responde mejor ahí.' } },
        extendida:     { etiqueta: 'Extendida (≈ -101 dBm)',   color: '#4f8fc0', calidad: 'regular',
                         tip: { telemetria: 'Funciona en exteriores con reintentos frecuentes; usa un equipo con buffer para no perder reportes.',
                           voz: 'Poco confiables; son probables los cortes.',
                           practica: 'Antena externa de buena ganancia y equipo con LTE B28/700 MHz.' } },
        extendida_alt: { etiqueta: 'Extendida alterna',        color: '#9ec3e0', calidad: 'regular',
                         tip: { telemetria: 'Posible en exteriores, sin garantía; espera reportes atrasados.',
                           voz: 'Es muy probable que fallen.',
                           practica: 'Antena externa y buffer en el equipo; no se recomienda para equipos en interior.' } }
      } },
    { id: 'telcel', nombre: 'Telcel', archivo: 'capas/cobertura_telcel.pmtiles', capa: 'cobertura' }
  ],

  // Tip (qué esperar en campo) para tramos o puntos sin cobertura (los de cada nivel están en "niveles" del operador)
  TIP_SIN_SENAL: { telemetria: 'No hay transmisión; el equipo debe guardar posiciones (buffer) y enviarlas al recuperar señal.',
                   voz: 'Sin servicio AT&T.',
                   practica: 'Si el tramo es crítico, considera SIM multi-operador o respaldo satelital.' },

  // Nombres de los campos en tus capas
  CAMPO_TECNOLOGIA: 'tecnologia',
  CAMPO_CALIDAD: 'calidad',        // opcional: buena | regular

  // Color por tecnología (debe coincidir con los valores del campo)
  COLORES_TECNOLOGIA: {
    'LTE':   '#378ADD',
    '5G':    '#1D9E75',
    'LTE-M': '#EF9F27'
  },

  // Ruta: servicio gratuito de rutas (demo pública de OSRM)
  OSRM_URL: 'https://router.project-osrm.org/route/v1/driving/',
  PASO_RUTA_KM: 0.5,

  // Incidencias: URL /exec de tu Apps Script con ?accion=eventos&dias=365
  // Vacía = datos de ejemplo
  EVENTOS_URL: '',
  // Capa 2: noticias de robo a transportista ya verificadas (se actualiza en GitHub)
  NOTICIAS_URL: 'capas/noticias.geojson',
  VIDA_MEDIA_DIAS: 90,     // un incidente de hace 90 días pesa ~37% de uno de hoy
  RADIO_RIESGO_KM: 5,      // incidentes a menos de esta distancia de la ruta cuentan (las noticias se ubican en el poblado)

  // Índice oficial por municipio (generado con sesnsp_a_mapa.py)
  RIESGO_MUNICIPAL_URL: 'capas/riesgo_municipal.geojson',
  // Capa 3: tramos de riesgo según asociaciones (ANERPV, Overhaul, Canacar, SICT/GN)
  TRAMOS_URL: 'capas/tramos.geojson',
  DISTANCIA_TRAMO_KM: 3,

  // Cómo se elige la ruta recomendada (deben sumar 1)
  PESO_SEGURIDAD: 0.7,
  PESO_COBERTURA: 0.3,

  // Dentro de seguridad (se reparten entre las capas disponibles):
  PESO_INCIDENTES: 0.4,    // capa 2: noticias, X y reportes del bot
  PESO_OFICIAL: 0.3,       // capa 1: SESNSP por municipio
  PESO_TRAMOS: 0.3         // capa 3: tramos señalados por asociaciones
};
