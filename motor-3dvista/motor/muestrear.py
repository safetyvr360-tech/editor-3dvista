# Promedia un cuadrito de 9x9 píxeles en cada punto y devuelve el tono (0-360°).
import sys, json, colorsys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size
out = {}
def tono(x, y):
    px = [im.getpixel((min(W - 1, max(0, int(x) + dx)), min(H - 1, max(0, int(y) + dy)))) for dx in range(-4, 5) for dy in range(-4, 5)]
    r, g, b = (sum(c[i] for c in px) / len(px) / 255 for i in range(3))
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    return [round(h * 360), round(s, 2), round(v, 2)]
# cinco puntos por lote (centro y alrededor): el número blanco o la marca de agua pueden tapar uno.
# Se devuelve el más saturado, que es el que muestra el color del polígono.
for k, (x, y) in json.loads(sys.argv[2]).items():
    muestras = [tono(x + dx, y + dy) for dx, dy in ((0, 0), (-14, 0), (14, 0), (0, -9), (0, 9))]
    out[k] = max(muestras, key=lambda t: t[1])
print(json.dumps(out))
