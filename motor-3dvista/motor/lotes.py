"""
Motor 3DVista · lotes por estado.

A partir de una exportación de 3DVista (que no se modifica), en <sitio>/tour:
  1. Copia la exportación.
  2. Por cada lote N toma su polígono «rojo N» (la marca de vendido que trae el
     recorrido, apagada) y genera dos gemelos con la MISMA forma: «verde N» y
     «naranja N» (imágenes recoloreadas en media/estados/). Si un «rojo N» no es
     rojo (error de la exportación), también genera su versión roja.
  3. Empareja cada «Polígono» clicable con su lote por cercanía en la vista.
  4. Al hacer clic en cualquiera de ellos, el recorrido emite el evento
     'ux-lote' con el número del lote (lo atiende la capa UX).
  5. Escribe lotes-mapa.json: lote → ids de sus polígonos en cada vista.

Convención que debe cumplir el recorrido en 3DVista: un overlay «rojo N» por lote
y vista, y opcionalmente overlays «Polígono» (o «blanco N») como forma base.
"""
import json, math, re, shutil, sys
from pathlib import Path
from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from objetos3dv import objetos  # noqa: E402

COLORES = {'VERDE': (22, 163, 74), 'NARANJA': (234, 128, 12)}
EXCLUIR = {'script_general.js.bak', 'server.js', 'package.json'}


def etiqueta(t):
    m = re.findall(r'"data":\{[^{}]*?"label":"([^"]*)"', t)
    return m[-1] if m else ''


def posicion(t):
    yaw = float(re.search(r'"yaw":(-?[\d.]+)', t).group(1))
    pitch = float(re.search(r'"pitch":(-?[\d.]+)', t).group(1))
    return yaw, pitch


def distancia(a, b):
    dy = (a[0] - b[0] + 180) % 360 - 180
    return math.hypot(dy * math.cos(math.radians((a[1] + b[1]) / 2)), a[1] - b[1])


def es_relleno(r, g, b, a):
    """Píxel de relleno del polígono: rojo (la mayoría) o gris claro (rojo 6 y rojo 39 de la beta
    vienen grises por error). El borde oscuro no es relleno y se conserva."""
    if not a: return False
    if r > 40 and r > g * 2 and r > b * 2: return True
    return min(r, g, b) > 110 and max(r, g, b) - min(r, g, b) < 40


def es_roja(origen):
    im = Image.open(origen).convert('RGBA')
    px = [p for p in im.getdata() if p[3] > 30]
    rojos = sum(1 for p in px if p[0] > 40 and p[0] > 2 * p[1] and p[0] > 2 * p[2])
    return rojos >= 0.3 * max(1, len(px))


def recolorear(origen, destino, rgb):
    im = Image.open(origen).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if es_relleno(r, g, b, a):
                k = (r / 150.0) if (r > g * 2 and r > b * 2) else 0.95
                px[x, y] = (min(255, int(rgb[0] * k)), min(255, int(rgb[1] * k)), min(255, int(rgb[2] * k)), a)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, 'WEBP', lossless=True)


def clic(lote):
    return "window.dispatchEvent(new CustomEvent('ux-lote',{detail:%d}))" % lote


def analizar(s):
    ov = objetos(s, 'HotspotPanoramaOverlay')
    pano_de = {}
    for _, _, t in objetos(s, 'Panorama'):
        pid = re.search(r'"id":"([^"]+)"', t).group(1)
        m = re.search(r'"overlays":\[([^\]]*)\]', t)
        for ref in re.findall(r'this\.(overlay_[A-Z0-9_]+)', m.group(1) if m else ''):
            pano_de[ref] = pid
    rojos, poligonos = [], []
    for a, b, t in ov:
        oid = re.search(r'"id":"(overlay_[^"]+)"', t).group(1)
        lab = etiqueta(t)
        es_rojo = re.fullmatch(r'rojo \d+', lab)
        # «blanco N» también sirve de polígono base (así viene en algunas vistas)
        es_poligono = lab.lower() in ('polígono', 'poligono', 'pol\\u00edgono') or bool(re.fullmatch(r'blanco \d+', lab))
        if not (es_rojo or es_poligono):
            continue
        rec = {'a': a, 'b': b, 't': t, 'id': oid, 'pano': pano_de.get(oid), 'pos': posicion(t)}
        if es_rojo:
            rec['lote'] = int(lab.split()[1]); rojos.append(rec)
        else:
            poligonos.append(rec)
    return rojos, poligonos


def emparejar(rojos, poligonos):
    for p in poligonos:
        candidatos = [r for r in rojos if r['pano'] == p['pano']]
        mejor = min(candidatos, key=lambda r: distancia(r['pos'], p['pos']))
        p['lote'] = mejor['lote']; p['dist'] = round(distancia(mejor['pos'], p['pos']), 2)


def con_clic(t, lote):
    """Agrega el aviso a la capa UX en la acción de clic de un ÁREA de 3DVista
    (en 3DVista el clic vive en HotspotPanoramaOverlayArea, no en el overlay).
    Si el área ya tenía una acción, se conserva y la nuestra va primero."""
    nuestro = clic(lote)
    if '"click":"' in t:
        if nuestro in t:
            return t
        return t.replace('"click":"', '"click":"%s; ' % nuestro, 1)
    return t[:-1] + ',"click":"%s"}' % nuestro


def transformar(s, rojos, poligonos, url_de):
    areas = {re.search(r'"id":"([^"]+)"', t).group(1): (a, b, t) for a, b, t in objetos(s, 'HotspotPanoramaOverlayArea')}
    lote_de_area = {}
    for r in rojos + poligonos:
        aid = re.search(r'"areas":\["this\.([^"]+)"', r['t']).group(1)
        if lote_de_area.setdefault(aid, r['lote']) != r['lote']:
            raise SystemExit(f'el área {aid} la comparten lotes distintos')
    cambios = []  # (a, b, nuevo_texto)
    for aid, lote in lote_de_area.items():
        a, b, t = areas[aid]
        cambios.append((a, b, con_clic(t, lote)))
    for r in rojos:
        base = r['t'].replace('"rollOverDisplay":true', '"rollOverDisplay":false')
        url_rojo = re.search(r'"url":"([^"]+)"', base).group(1)
        corregida = url_de.get(url_rojo, {}).get('ROJO')
        partes = [base.replace(url_rojo, corregida) if corregida else base]
        for nombre in COLORES:
            g = base.replace(f'"id":"{r["id"]}"', f'"id":"{r["id"]}_{nombre}"')
            g = g.replace(f'rojo {r["lote"]}', f'{nombre.lower()} {r["lote"]}')
            g = re.sub(r'"tags":\["rojo', f'"tags":["{nombre.lower()}', g)
            vieja = re.search(r'"url":"([^"]+)"', g).group(1)
            g = g.replace(vieja, url_de[vieja][nombre])
            partes.append(g)   # el gemelo usa la misma área que el rojo: mismo clic, mismo tooltip
        cambios.append((r['a'], r['b'], ','.join(partes)))
    for a, b, nuevo in sorted(cambios, reverse=True):
        s = s[:a] + nuevo + s[b:]
    # los gemelos entran a la lista de overlays de su panorama, junto al rojo
    def ampliar(m):
        lista = m.group(0)
        for r in rojos:
            ref = f'"this.{r["id"]}"'
            if ref in lista:
                lista = lista.replace(ref, ref + ''.join(f',"this.{r["id"]}_{n}"' for n in COLORES))
        return lista
    return re.sub(r'"overlays":\[[^\]]*\]', ampliar, s)


def main(origen, sitio):
    origen, sitio = Path(origen), Path(sitio)
    tour = sitio / 'tour'
    if tour.exists():
        shutil.rmtree(tour)
    shutil.copytree(origen, tour, ignore=lambda d, n: [x for x in n if x in EXCLUIR])

    general = (origen / 'script_general.js').read_text(encoding='utf-8')
    rojos, poligonos = analizar(general)
    emparejar(rojos, poligonos)

    url_de = {}
    for r in rojos:
        u = re.search(r'"url":"([^"]+)"', r['t']).group(1)
        url_de[u] = {}
        for nombre, rgb in COLORES.items():
            nueva = f'media/estados/{Path(u).stem}_{nombre.lower()}.webp'
            recolorear(origen / u, tour / nueva, rgb)
            url_de[u][nombre] = nueva
        if not es_roja(origen / u):
            nueva = f'media/estados/{Path(u).stem}_rojo.webp'
            recolorear(origen / u, tour / nueva, (200, 24, 24))
            url_de[u]['ROJO'] = nueva
            print('rojo corregido (venía gris en la beta):', etiqueta(r['t']))

    areas = {}
    for linea in (origen / 'locale' / 'es.txt').read_text(encoding='utf-8').splitlines():
        m = re.match(r'(HotspotPanoramaOverlayArea_[A-Z0-9_]+)\.toolTip = (\d+)\s*m2', linea)
        if m:
            areas[m.group(1)] = int(m.group(2))

    for nombre in ('script_general.js', 'script_mobile.js'):
        s = (origen / nombre).read_text(encoding='utf-8')
        ro, po = analizar(s)
        emparejar(ro, po)
        if sorted((r['id'], r['lote']) for r in ro) != sorted((r['id'], r['lote']) for r in rojos):
            raise SystemExit(f'{nombre}: los polígonos rojos no coinciden con script_general.js')
        (tour / nombre).write_text(transformar(s, ro, po, url_de), encoding='utf-8')

    lotes = {}
    for r in rojos:
        area_id = re.search(r'"areas":\["this\.([^"]+)"', r['t']).group(1)
        l = lotes.setdefault(r['lote'], {'lote': r['lote'], 'area_m2': areas.get(area_id), 'vistas': {}})
        v = l['vistas'].setdefault(r['pano'], {'poligonos': []})
        v.update(rojo=r['id'], verde=r['id'] + '_VERDE', naranja=r['id'] + '_NARANJA')
    for p in poligonos:
        lotes[p['lote']]['vistas'].setdefault(p['pano'], {'poligonos': []})['poligonos'].append(p['id'])
    mapa = [dict(l, vistas=[dict(pano=k, **v) for k, v in l['vistas'].items()]) for l in sorted(lotes.values(), key=lambda x: x['lote'])]
    (sitio / 'lotes-mapa.json').write_text(json.dumps(mapa, ensure_ascii=False, indent=1), encoding='utf-8')

    lejos = sorted((p['dist'], p['lote'], p['id']) for p in poligonos)[-5:]
    print(f'{len(lotes)} lotes · {len(rojos)} polígonos rojos · {len(poligonos)} polígonos clicables')
    print('emparejamientos más lejanos (grados):', lejos)
    sin_poligono = [l['lote'] for l in mapa if not any(v['poligonos'] for v in l['vistas'])]
    print('lotes sin polígono clicable:', sin_poligono)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
