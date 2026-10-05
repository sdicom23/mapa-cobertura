#!/usr/bin/env python3
"""
SESNSP -> capa de riesgo municipal para el mapa
================================================
Lee la base de datos abiertos del SESNSP (incidencia delictiva municipal, fuero común),
toma los delitos de ROBO A TRANSPORTISTA de los últimos N meses, los suma por municipio
y genera la capa que usan rutasegura.html y mapa.html.

Uso:
    python sesnsp_a_mapa.py ARCHIVO_SESNSP.csv [otro.csv ...] --meses 12

Salidas (en la carpeta actual):
    riesgo_municipal.geojson  -> súbelo a capas/ del repositorio
    riesgo_municipal.csv      -> resumen para revisar o pegar en Google Sheets (hoja "RiesgoMunicipal")

Necesita municipios_base.geojson en la misma carpeta.
Acepta el formato ancho (columnas Enero..Diciembre) y el formato largo (columna de mes + total).
"""
import argparse, csv, io, json, re, sys, unicodedata, zipfile
from collections import defaultdict

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
         'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
DELITO = re.compile(r'transportista')          # robo a transportista
VIOLENCIA = re.compile(r'con violencia')
SIN_VIOLENCIA = re.compile(r'sin violencia')


def norm(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def abrir_excel(ruta):
    """Lee un .xls/.xlsx. Busca la fila de encabezados (la que menciona 'municipio') y une todas las hojas."""
    import pandas as pd
    hojas = pd.read_excel(ruta, sheet_name=None, header=None, dtype=str)
    filas, encabezado = [], None
    for df in hojas.values():
        df = df.fillna('')
        datos = df.values.tolist()
        idx = next((i for i, r in enumerate(datos[:40])
                    if any('municipio' in norm(c) for c in r) and any(norm(c) in MESES or 'delito' in norm(c) for c in r)), None)
        if idx is None:
            continue
        if encabezado is None:
            encabezado = [str(c) for c in datos[idx]]
            filas.append(encabezado)
        filas.extend([str(c) for c in r] for r in datos[idx + 1:] if any(str(c).strip() for c in r))
    if not filas:
        sys.exit('No encontré en el Excel una tabla con columnas de municipio y meses/delitos.')
    return filas


def abrir(ruta):
    """Devuelve las filas de un CSV (también dentro de un .zip) o de un Excel."""
    if ruta.lower().endswith(('.xls', '.xlsx')):
        return abrir_excel(ruta)
    if ruta.lower().endswith('.zip'):
        z = zipfile.ZipFile(ruta)
        nombre = next(n for n in z.namelist() if n.lower().endswith('.csv'))
        datos = z.read(nombre)
    else:
        datos = open(ruta, 'rb').read()
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            texto = datos.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    muestra = texto[:5000]
    sep = ';' if muestra.count(';') > muestra.count(',') else ','
    return list(csv.reader(io.StringIO(texto), delimiter=sep))


def numero(v):
    v = str(v).strip().replace(',', '')
    try:
        return float(v) if v else 0.0
    except ValueError:
        return 0.0


def procesar(filas):
    """Devuelve dict {(anio, mes): {cve: [con_violencia, sin_violencia, sin_dato]}}"""
    enc = [norm(h) for h in filas[0]]
    col_cve = next((i for i, h in enumerate(enc) if ('mun' in h and ('cve' in h or 'clave' in h))), None)
    col_anio = next((i for i, h in enumerate(enc) if h in ('ano', 'anio', 'year') or h.startswith('ano')), None)
    cols_texto = [i for i, h in enumerate(enc) if any(k in h for k in ('delito', 'subtipo', 'modalidad', 'tipo', 'bien juridico'))]
    cols_mes = {i: MESES.index(h) + 1 for i, h in enumerate(enc) if h in MESES}
    col_mes = next((i for i, h in enumerate(enc) if h == 'mes'), None)
    col_total = next((i for i, h in enumerate(enc) if h in ('total', 'incidencia', 'delitos', 'numero de delitos', 'cantidad')), None)
    col_fecha = next((i for i, h in enumerate(enc) if 'fecha' in h or 'periodo' in h), None)

    if col_cve is None or not cols_texto:
        sys.exit(f'No reconozco las columnas de este archivo: {filas[0]}')
    if not cols_mes and (col_total is None or (col_mes is None and col_fecha is None)):
        sys.exit(f'No encuentro columnas de meses ni de total: {filas[0]}')

    res = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0]))
    nacional = defaultdict(float)
    for f in filas[1:]:
        if len(f) < len(enc):
            continue
        texto = norm(' '.join(f[i] for i in cols_texto))
        cve = re.sub(r'\D', '', f[col_cve]).zfill(5)
        if cols_mes:
            anio = int(numero(f[col_anio])) if col_anio is not None else 0
            pares = [(m, numero(f[i])) for i, m in cols_mes.items()]
        else:
            if col_mes is not None:
                anio = int(numero(f[col_anio])) if col_anio is not None else 0
                mv = norm(f[col_mes])
                m = MESES.index(mv) + 1 if mv in MESES else int(numero(mv))
            else:
                fe = re.findall(r'\d+', f[col_fecha])
                anio, m = (int(fe[0]), int(fe[1])) if len(fe) >= 2 else (0, 0)
            pares = [(m, numero(f[col_total]))]
        for m, v in pares:
            nacional[(anio, m)] += v          # para saber qué meses ya tienen datos
            if not v or not DELITO.search(texto):
                continue
            k = 0 if VIOLENCIA.search(texto) and not SIN_VIOLENCIA.search(texto) else (1 if SIN_VIOLENCIA.search(texto) else 2)
            res[(anio, m)][cve][k] += v
    return res, nacional


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('archivos', nargs='+')
    ap.add_argument('--meses', type=int, default=12)
    ap.add_argument('--base', default='municipios_base.geojson')
    a = ap.parse_args()

    total = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0]))
    nacional = defaultdict(float)
    for ruta in a.archivos:
        print(f'Leyendo {ruta} ...')
        r, n = procesar(abrir(ruta))
        for p, d in r.items():
            for cve, v in d.items():
                for k in range(3):
                    total[p][cve][k] += v[k]
        for p, v in n.items():
            nacional[p] += v

    con_datos = sorted(p for p, v in nacional.items() if v > 0)
    if not con_datos:
        sys.exit('El archivo no tiene meses con datos.')
    ventana = con_datos[-a.meses:]
    print(f'Periodo: {ventana[0][1]:02d}/{ventana[0][0]} a {ventana[-1][1]:02d}/{ventana[-1][0]} ({len(ventana)} meses)')

    suma = defaultdict(lambda: [0.0, 0.0, 0.0])
    for p in ventana:
        for cve, v in total.get(p, {}).items():
            for k in range(3):
                suma[cve][k] += v[k]

    base = json.load(open(a.base, encoding='utf-8'))
    nombres = {f['properties']['cve']: f['properties'] for f in base['features']}

    # Índice: con violencia pesa 1.5
    indices = {cve: v[0] * 1.5 + v[1] + v[2] for cve, v in suma.items() if sum(v) > 0}
    valores = sorted(indices.values())

    def corte(q):
        return valores[min(len(valores) - 1, int(q * len(valores)))] if valores else 0
    c50, c80, c95 = corte(0.5), corte(0.8), corte(0.95)

    def nivel(x):
        return 4 if x >= c95 else 3 if x >= c80 else 2 if x >= c50 else 1

    periodo = f'{ventana[0][1]:02d}/{ventana[0][0]}-{ventana[-1][1]:02d}/{ventana[-1][0]}'
    salida, filas = [], []
    for f in base['features']:
        cve = f['properties']['cve']
        if cve not in indices:
            continue
        v = suma[cve]
        props = {
            'cve': cve, 'municipio': f['properties']['municipio'], 'estado': f['properties']['estado'],
            'robos': int(round(sum(v))), 'con_violencia': int(round(v[0])),
            'indice': round(indices[cve], 1), 'nivel': nivel(indices[cve]), 'periodo': periodo
        }
        salida.append({'type': 'Feature', 'geometry': f['geometry'], 'properties': props})
        filas.append(props)

    sin_mapa = [c for c in indices if c not in nombres]
    json.dump({'type': 'FeatureCollection', 'periodo': periodo, 'features': salida},
              open('riesgo_municipal.geojson', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    filas.sort(key=lambda r: -r['indice'])
    with open('riesgo_municipal.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()) if filas else ['cve'])
        w.writeheader()
        w.writerows(filas)

    print(f'Municipios con robo a transportista: {len(salida)}  |  total robos: {int(sum(sum(v) for v in suma.values()))}')
    if sin_mapa:
        print(f'Aviso: {len(sin_mapa)} claves sin polígono (municipios nuevos o "otros"): {sin_mapa[:10]}')
    print('Top 10:')
    for r in filas[:10]:
        print(f"  {r['municipio']}, {r['estado']}: {r['robos']} robos ({r['con_violencia']} con violencia)")


if __name__ == '__main__':
    main()
