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
    { id: 'att',    nombre: 'AT&T',   archivo: 'capas/cobertura_att.pmtiles',    capa: 'cobertura' },
    { id: 'telcel', nombre: 'Telcel', archivo: 'capas/cobertura_telcel.pmtiles', capa: 'cobertura' }
  ],

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
  VIDA_MEDIA_DIAS: 90,     // un incidente de hace 90 días pesa ~37% de uno de hoy
  RADIO_RIESGO_KM: 3,      // incidentes a menos de esta distancia de la ruta cuentan para su riesgo

  // Cómo se elige la ruta recomendada (deben sumar 1)
  PESO_SEGURIDAD: 0.7,
  PESO_COBERTURA: 0.3
};
