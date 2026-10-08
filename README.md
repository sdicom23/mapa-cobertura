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

## Cobertura AT&T 4G (CRT, 2T 2026) — ya cargada

- `capas/att4g_low.pmtiles` (zoom 4–8) y `capas/att4g_high.pmtiles` (zoom 9–11, se sobre-escala al acercar).
  Van en dos archivos por el límite de 100 MB de GitHub; `config.js` los declara en `archivos: [...]`.
- `capas/att4g_kmz2026.pmtiles` → relleno con los KMZ de AT&T (mar 2026) sólo donde la CRT no reporta cobertura:
  Garantizada → **Alta**; No garantizada + CobEx → **Extendida (CobEx)** (campo `fuente: att_kmz_2026`).
- La capa trae el campo `cat` con 5 niveles de señal (RSRP): `alta`, `media`, `baja`, `extendida`, `extendida_alt`.
  Colores y etiquetas en `config.js` → `niveles`. Alta/Media cuentan como **buena** en las rutas; el resto como **regular**.
- `capas/grid_att4g/` → rejilla de consulta para el bot (celdas de 0.005° ≈ 550 m; 1 archivo por cuadro de 1°;
  códigos 0 sin cobertura, 1 extendida alt, 2 extendida, 3 baja, 4 media, 5 alta).
- `herramientas/CoberturaATT.gs` → funciones para Apps Script: `coberturaPunto(lat, lon)` y `coberturaRuta(origen, destino)`.

## Mapa v2 — AT&T 4G / 3G (KMZ 2026)  →  `/v2/`

Página aparte para elegir tecnología. Fuente: KMZ de AT&T (4G Total con CobEx y Garantizada, mar 2026;
3G Total con CobEx mar 2025 y Garantizada mar 2026). Sin niveles de RSRP: sólo **Garantizada**, **Con cobertura (incluye CobEx)** y **Sin cobertura**.

| Página | Parámetros |
|---|---|
| `v2/index.html` | `?tec=4g|3g&lat=..&lon=..` |
| `v2/ruta.html` | `?tec=4g|3g&o=lat,lon&d=lat,lon` |

- `v2/att_kmz_2026.pmtiles` → capa `cobertura` con `tech` (4g/3g) y `nivel` (1 cobertura, 2 garantizada).
- `v2/grid_4g/`, `v2/grid_3g/` → rejilla para consultas (0 sin, 1 cobertura, 2 garantizada).
- `herramientas/CoberturaV2.gs` → bot: `v2Responder(message)`; acepta `3g 19.43,-99.13` y `3g ruta A > B`.

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

## Capas de seguridad

| Capa | Archivo | Fuente | Actualización |
|---|---|---|---|
| 1. Índice oficial por municipio | `capas/riesgo_municipal.geojson` | SESNSP (RNID municipal) | Mensual |
| 2. Incidentes puntuales | `capas/noticias.geojson` + hoja "Eventos" | Prensa, X, reportes del bot | Diaria |
| 3. Tramos de riesgo | `capas/tramos.geojson` | ANERPV, Overhaul, Canacar, SICT/Guardia Nacional | Trimestral |

En la ruta segura, la seguridad combina las tres capas con los pesos `PESO_INCIDENTES`, `PESO_OFICIAL` y `PESO_TRAMOS` de `config.js`.
