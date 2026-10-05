# Mapa de cobertura y seguridad

Mini App para el bot de Telegram. Se publica gratis con GitHub Pages.

| Página | Para qué | Parámetros |
|---|---|---|
| `index.html` | Cobertura en un punto | `?lat=19.43&lon=-99.13` |
| `ruta.html` | Cobertura a lo largo de una ruta | `?o=19.49,-99.11&d=20.10,-98.75` (lat,lon) |
| `mapa.html` | Incidencias de seguridad (mapa de calor) | — |

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

En `mapa.html`, cambia `const DATA_URL = '';` por la URL `/exec` de tu Apps Script con
`?accion=eventos&dias=365`.

## Conectar con el bot

En `Cobertura.gs`, cambia `CFG.MAPA_URL` por la dirección de este sitio, terminada en `/`:

```
https://sdicom23.github.io/mapa-cobertura/
```
