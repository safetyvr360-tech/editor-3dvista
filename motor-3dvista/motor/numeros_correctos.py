"""Corrige números de lote mal escritos en la beta.

La beta pinta cada número como una imagen de texto aparte del polígono. En algunas vistas el autor
repitió un número y desde ahí todo quedó corrido uno (p. ej. «38, 38, 39…» en vez de «38, 39, 40…»).
Aquí se mira qué polígono contiene de verdad cada número —se proyecta la posición del número sobre la
imagen del polígono y se lee su transparencia— y, si cae dentro de un solo lote distinto, se corrige.
"""
import math
import re
from PIL import Image
from objetos3dv import objetos


def _geometria(s):
    geo = {}
    for _, _, t in objetos(s, 'HotspotPanoramaOverlay'):
        oid = re.search(r'"id":"(overlay_[^"]+)"', t).group(1)
        m = re.search(r'"items":\[\{(.*?)\}\]', t)
        if not m: continue
        it = m.group(1)
        g = {k: re.search(r'"%s":(-?[\d.]+)' % k, it) for k in ('yaw', 'pitch', 'hfov', 'vfov')}
        u = re.search(r'"url":"(media/[^"]+)"', it)
        if g['yaw'] and g['pitch'] and g['hfov'] and u:
            geo[oid] = ({k: float(v.group(1)) if v else 0.0 for k, v in g.items()}, u.group(1))
    return geo


def corregir(tour, s, vistas, mapa):
    geo = _geometria(s)
    imagenes = {}

    def dentro(oid, yaw, pitch):
        if oid not in geo: return False
        g, url = geo[oid]
        im = imagenes.get(url) or imagenes.setdefault(url, Image.open(tour / url).convert('RGBA'))
        W, H = im.size
        r = math.radians
        hf = r(g['hfov']); vf = r(g['vfov']) if g['vfov'] else hf * H / W
        dy = math.atan2(math.sin(r(yaw - g['yaw'])), math.cos(r(yaw - g['yaw'])))
        px = (dy * math.cos(r(pitch)) / hf + 0.5) * W
        py = (0.5 - r(pitch - g['pitch']) / vf) * H
        return 0 <= px < W and 0 <= py < H and im.getpixel((int(px), int(py)))[3] > 20

    cambios = []
    for pid, vista in vistas.items():
        lotes = [(l['lote'], v['rojo']) for l in mapa for v in l['vistas'] if v['pano'] == pid]
        for n in vista['numeros']:
            hits = [lote for lote, oid in lotes if dentro(oid, n['yaw'], n['pitch'])]
            if len(hits) == 1 and hits[0] != n['lote']:
                cambios.append((pid, n['lote'], hits[0]))
                n['lote'] = hits[0]
    return cambios
