# Mapa de cobertura y seguridad

Mini App para el bot de Telegram. Se publica gratis con GitHub Pages.

| Página | Para qué | Parámetros |
|---|---|---|
| `index.html` | Cobertura en un punto | `?lat=19.43&lon=-99.13` |
| `ruta.html` | Cobertura a lo largo de una ruta | `?o=19.49,-99.11&d=20.10,-98.75` (lat,lon) |
| `mapa.html` | Incidencias de seguridad (mapa de calor) | — |
| `rutasegura.html` | Compara rutas por incidencias y cobertura, recomienda la mejor | `?o=19.43,-99.13&d=18.88,-96.92` (lat,lon) |

Sin capas cargadas, las páginas muestran **datos de ejemplo** (etiqueta amarilla).

## Archivos

- `config.js` → lo único que se edita: capas, colores, campos.
- `comun.js`, `estilos.css` → código compartido.
- `capas/` → aquí van los `.pmtiles` de cobertura.

## Agregar la cobertura real

1. Genera un archivo por operador con tippecanoe:

   ```bash
   tippecanoe -o cobertura_att.pmtiles -l cobertura -Z4 -z12 \
     --simplification=10 --drop-densest-as-needed \
     -y tecnologia -y calidad cobertura_att.geojson
   ```

2. Revisa que cada archivo pese **menos de 100 MB** (límite de GitHub). No uses Git LFS.
3. Súbelos a la carpeta `capas/` con los nombres de `config.js`.
4. Ajusta en `config.js` los valores de `COLORES_TECNOLOGIA` si tus tecnologías se llaman distinto.

## Conectar el mapa de incidencias

Pega la URL `/exec` de tu Apps Script con `?accion=eventos&dias=365` en:
- `config.js` → `EVENTOS_URL` (para `rutasegura.html`)
- `mapa.html` → `const DATA_URL`

## Conectar con el bot

En `Cobertura.gs`, cambia `CFG.MAPA_URL` por la dirección de este sitio, terminada en `/`:

```
https://sdicom23.github.io/mapa-cobertura/
```

## Índice oficial SESNSP (robo a transporte por municipio)

Incluye: robo a transportista (peso principal), robo en transporte público colectivo e individual,
robo en transporte individual y robo de vehículo de 4 ruedas. Los pesos están al inicio de `sesnsp_a_mapa.py`.

1. Descarga del SESNSP, sección **Datos abiertos → metodología 2026**, el archivo **"Fuero común – Delitos. Incidencia delictiva municipal"** (XLSX, ej. `RNID-Delitos_Municipal-2026-ago2026.xlsx`). Sale cada mes.
2. En la carpeta `herramientas/` ejecuta:

   ```bash
   python sesnsp_a_mapa.py RNID-Delitos_Municipal-2026-ago2026.xlsx --meses 12
   ```

3. Sube el `riesgo_municipal.geojson` que genera a la carpeta `capas/`.

`rutasegura.html` y `mapa.html` lo detectan solos: aparece el botón "SESNSP" y la ruta recomendada
toma en cuenta los municipios de alto riesgo por los que pasa.
