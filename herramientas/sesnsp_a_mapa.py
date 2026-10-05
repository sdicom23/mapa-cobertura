#!/usr/bin/env python3
"""
SESNSP (incidencia delictiva MUNICIPAL, fuero común) -> capa de riesgo para el mapa
====================================================================================
Toma TODO lo relacionado con robo a transporte, lo suma por municipio y genera la capa
que usan rutasegura.html y mapa.html.

Uso:
    python sesnsp_a_mapa.py RNID-Delitos_Municipal-2026-ago2026.xlsx [--meses 12]
    (acepta .xlsx, .xls, .csv o .zip con el CSV)

Salidas (carpeta actual):
    riesgo_municipal.geojson -> súbelo a capas/ del repositorio
    riesgo_municipal.csv     -> resumen por municipio (para revisar o pegar en Google Sheets)

Necesita municipios_base.geojson en la misma carpeta.
"""
import argparse, json, re, sys, unicodedata
import pandas as pd

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
         'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

# Categorías: (campo, texto a buscar en "Subtipo de delito", peso con violencia, peso sin violencia)
# Pesos = qué tanto afecta a una ruta de carga. Ajústalos si quieres.
CATEGORIAS = [
    ('transportista',         r'robo a transportista',                 1.5, 1.0),
    ('transporte_colectivo',  r'robo en transporte publico colectivo', 0.3, 0.05),
    ('transporte_pub_indiv',  r'robo en transporte publico individual', 0.2, 0.05),
    ('transporte_individual', r'robo en transporte individual',        0.2, 0.05),
    ('vehiculo',              r'robo de vehiculo automotor - coche',   0.05, 0.0),
]
NOMBRES = {
    'transportista': 'Robo a transportista',
    'transporte_colectivo': 'Robo en transporte público colectivo',
    'transporte_pub_indiv': 'Robo en transporte público individual',
    'transporte_individual': 'Robo en transporte individual',
    'vehiculo': 'Robo de vehículo (4 ruedas)',
}


def norm(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()


def leer(ruta):
    r = ruta.lower()
    if r.endswith(('.xlsx', '.xls')):
        return pd.read_excel(ruta, dtype=str)
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            return pd.read_csv(ruta, dtype=str, encoding=enc, sep=None, engine='python')
        except UnicodeDecodeError:
            continue
    sys.exit('No pude leer el archivo')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('archivos', nargs='+')
    ap.add_argument('--meses', type=int, default=12)
    ap.add_argument('--base', default='municipios_base.geojson')
    a = ap.parse_args()

    largo = []
    for ruta in a.archivos:
        print(f'Leyendo {ruta} ...')
        df = leer(ruta)
        col = {norm(c): c for c in df.columns}
        c_anio = next(col[k] for k in col if k in ('ano', 'anio') or k.startswith('ano'))
        c_cve = next(col[k] for k in col if 'mun' in k and ('cve' in k or 'clave' in k))
        c_sub = next(col[k] for k in col if 'subtipo' in k)
        c_mod = next(col[k] for k in col if 'modalidad' in k)
        meses = [(col[k], MESES.index(k) + 1) for k in col if k in MESES]
        for c, m in meses:
            df[c] = pd.to_numeric(df[c], errors='coerce')
        # Meses con datos en el país (los vacíos son meses aún no publicados)
        for c, m in meses:
            if df[c].notna().any() and df[c].fillna(0).sum() > 0:
                pass
        sub = df[c_sub].map(norm)
        viol = df[c_mod].map(norm).str.contains('con violencia')
        for campo, patron, _, _ in CATEGORIAS:
            sel = sub.str.contains(patron, regex=True)
            if not sel.any():
                continue
            parte = df[sel]
            for c, m in meses:
                v = parte[c]
                if v.isna().all():
                    continue
                largo.append(pd.DataFrame({
                    'periodo': (pd.to_numeric(parte[c_anio]).astype(int) * 100 + m).values,
                    'cve': parte[c_cve].str.replace(r'\D', '', regex=True).str.zfill(5).values,
                    'campo': campo, 'violencia': viol[sel].values, 'n': v.fillna(0).values}))
    if not largo:
        sys.exit('No encontré delitos de robo a transporte en el archivo.')
    d = pd.concat(largo)
    periodos = sorted(p for p, n in d.groupby('periodo')['n'].sum().items() if n > 0)[-a.meses:]
    d = d[d.periodo.isin(periodos)]
    ini, fin = periodos[0], periodos[-1]
    etiqueta = f'{MESES[ini % 100 - 1][:3]} {ini // 100} - {MESES[fin % 100 - 1][:3]} {fin // 100}'
    print(f'Periodo: {etiqueta} ({len(periodos)} meses)')

    tabla = d.pivot_table(index='cve', columns=['campo', 'violencia'], values='n', aggfunc='sum', fill_value=0)

    def val(cve, campo, v):
        try:
            return float(tabla.loc[cve, (campo, v)])
        except KeyError:
            return 0.0

    base = json.load(open(a.base, encoding='utf-8'))
    geo = {f['properties']['cve']: f for f in base['features']}

    filas = []
    for cve in tabla.index:
        p = {'cve': cve}
        indice = robos = cv = 0.0
        for campo, _, pcv, psv in CATEGORIAS:
            c, s = val(cve, campo, True), val(cve, campo, False)
            p[campo] = int(c + s)
            p[campo + '_cv'] = int(c)
            indice += c * pcv + s * psv
            robos += c + s
            cv += c
        if robos == 0:
            continue
        p.update({'robos': int(robos), 'con_violencia': int(cv), 'indice': round(indice, 1)})
        filas.append(p)

    # Nivel 1-4 por percentiles del índice (sólo municipios con índice > 0)
    vals = sorted(f['indice'] for f in filas if f['indice'] > 0)
    corte = lambda q: vals[min(len(vals) - 1, int(q * len(vals)))]
    c50, c80, c95 = corte(0.5), corte(0.8), corte(0.95)
    for f in filas:
        x = f['indice']
        f['nivel'] = 0 if x == 0 else 4 if x >= c95 else 3 if x >= c80 else 2 if x >= c50 else 1
        if f['transportista'] == 0:      # sin robo a transportista no puede ser nivel alto para carga
            f['nivel'] = min(f['nivel'], 2)

    salida, sin_mapa = [], []
    for f in filas:
        g = geo.get(f['cve'])
        if not g:
            sin_mapa.append(f['cve'])
            continue
        f['municipio'] = g['properties']['municipio']
        f['estado'] = g['properties']['estado']
        f['periodo'] = etiqueta
        if f['nivel'] == 0:
            continue
        salida.append({'type': 'Feature', 'geometry': g['geometry'], 'properties': f})

    json.dump({'type': 'FeatureCollection', 'periodo': etiqueta, 'escala': 'municipal',
               'categorias': NOMBRES, 'features': salida},
              open('riesgo_municipal.geojson', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    cols = ['cve', 'municipio', 'estado', 'nivel', 'indice', 'robos', 'con_violencia'] + \
           [x for c in CATEGORIAS for x in (c[0], c[0] + '_cv')]
    out = pd.DataFrame([f for f in filas if 'municipio' in f])[cols].sort_values('indice', ascending=False)
    out.to_csv('riesgo_municipal.csv', index=False, encoding='utf-8')

    print(f'Municipios en el mapa: {len(salida)} | sin polígono: {len(sin_mapa)} {sin_mapa[:8]}')
    print('Totales en el país:')
    for campo, _, _, _ in CATEGORIAS:
        print(f"  {NOMBRES[campo]:<40} {int(out[campo].sum()):>7}  ({int(out[campo + '_cv'].sum())} con violencia)")
    print('Top 15 por índice de riesgo para transporte:')
    for _, r in out.head(15).iterrows():
        print(f"  {r.municipio + ', ' + r.estado:<45} transportista {r.transportista:>4} | índice {r.indice:>7} | nivel {r.nivel}")


if __name__ == '__main__':
    main()
