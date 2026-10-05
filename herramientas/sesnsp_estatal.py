#!/usr/bin/env python3
"""
SESNSP (reporte RNID por estado, una hoja por entidad) -> capa de riesgo por estado
=================================================================================
Uso:
    python sesnsp_estatal.py RNID-Delitos-2026_ago26.xlsx

Salida: riesgo_municipal.geojson (mismo formato que usa el mapa; cada polígono es un estado)
        riesgo_estatal.csv
Necesita municipios_base.geojson (se disuelve por estado).

Cuando tengas el reporte MUNICIPAL usa sesnsp_a_mapa.py: da más detalle y reemplaza esta capa.
"""
import csv, json, re, subprocess, sys, unicodedata
import openpyxl

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()

def main(ruta):
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    datos, periodo = {}, ''
    for ws in wb.worksheets:
        m = re.match(r'(\d{2})\.\s*(.+)', ws.title)
        if not m:
            continue
        cve_ent = m.group(1)
        filas = list(ws.iter_rows(values_only=True))
        # columnas de meses
        enc = next(r for r in filas if any(norm(c) == 'enero' for c in r))
        cols = [i for i, c in enumerate(enc) if norm(c) in ('enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                                                           'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre')]
        i = next(k for k, r in enumerate(filas) if any(norm(c) == 'robo a transportista' for c in r))
        def suma(r):
            return sum(float(r[c]) for c in cols if isinstance(r[c], (int, float)))
        total, con, sin = suma(filas[i]), 0.0, 0.0
        for r in filas[i + 1:i + 4]:
            t = ' '.join(norm(c) for c in r if isinstance(c, str))
            if 'con violencia' in t: con = suma(r)
            elif 'sin violencia' in t: sin = suma(r)
        meses = [norm(enc[c]) for c in cols if isinstance(filas[i][c], (int, float))]
        if meses and not periodo:
            periodo = f'{meses[0][:3]}-{meses[-1][:3]} ' + re.findall(r'20\d\d', ' '.join(str(c) for c in filas[4] if c))[0]
        datos[cve_ent] = {'robos': int(total), 'con_violencia': int(con), 'sin_violencia': int(sin)}

    # Polígonos de estados (disolviendo municipios)
    subprocess.run(['npx', '-y', 'mapshaper@0.6', 'municipios_base.geojson',
                    '-each', 'ent=cve.substr(0,2)', '-dissolve', 'ent', 'copy-fields=estado',
                    '-simplify', '40%', 'keep-shapes', '-o', 'precision=0.0001', 'format=geojson', 'estados_base.geojson'],
                   check=True, capture_output=True)
    estados = json.load(open('estados_base.geojson', encoding='utf-8'))

    idx = {k: v['con_violencia'] * 1.5 + v['sin_violencia'] for k, v in datos.items()}
    vals = sorted(x for x in idx.values() if x > 0)
    corte = lambda q: vals[min(len(vals) - 1, int(q * len(vals)))]
    c50, c80, c95 = corte(0.5), corte(0.8), corte(0.95)
    nivel = lambda x: 4 if x >= c95 else 3 if x >= c80 else 2 if x >= c50 else 1

    salida, filas_csv = [], []
    for f in estados['features']:
        e = f['properties']['ent']
        d = datos.get(e)
        if not d or not d['robos']:
            continue
        p = {'cve': e, 'municipio': '', 'estado': f['properties']['estado'], 'robos': d['robos'],
             'con_violencia': d['con_violencia'], 'indice': round(idx[e], 1), 'nivel': nivel(idx[e]),
             'periodo': periodo, 'escala': 'estatal'}
        salida.append({'type': 'Feature', 'geometry': f['geometry'], 'properties': p})
        filas_csv.append(p)
    json.dump({'type': 'FeatureCollection', 'periodo': periodo, 'escala': 'estatal', 'features': salida},
              open('riesgo_municipal.geojson', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    filas_csv.sort(key=lambda r: -r['robos'])
    with open('riesgo_estatal.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas_csv[0].keys()))
        w.writeheader(); w.writerows(filas_csv)
    tot = sum(d['robos'] for d in datos.values())
    print(f'Periodo: {periodo} | Robo a transportista en el país: {tot}')
    for r in filas_csv:
        print(f"  {r['estado']:<35} {r['robos']:>5}  ({r['con_violencia']} con violencia, {r['robos']/tot*100:4.1f}%)  nivel {r['nivel']}")

if __name__ == '__main__':
    main(sys.argv[1])
