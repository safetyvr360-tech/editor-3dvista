"""
Motor 3DVista · construye un aplicativo optimizado a partir de una exportación de
3DVista (que no se modifica) y de la configuración del proyecto.

  python3 -I motor/construir.py <proyecto> <exportacion-3dvista> <carpeta-salida>

<proyecto> es la carpeta del proyecto: su proyecto.json (manzanas, lugares, cámaras,
contacto…) y su marca (logos). El motor no sabe nada de ningún proyecto en particular.

Cambios sobre la exportación (estéticos y de funcionamiento; no agrega fotos ni panoramas):
  - Lotes: gemelos verde y naranja de cada polígono «rojo N»; el clic abre la ficha del lote.
  - Placas de lugares y textos de grupo («Manzana X»): se apagan; la capa UX los dibuja
    como etiquetas nítidas que siguen la cámara.
  - Números de lote: corregidos cuando la exportación los trae corridos y regenerados nítidos.
  - Cámaras de las vistas con lotes: fijas, mirando a los lotes (sin giro de 360°).
  - Piel vieja que ya no se muestra: no se descarga.
  - Archivos que faltan en la exportación: se usa su miniatura y se avisa.
  - script.js: fuera removeWatermarks (no va a producción); la capa UX lee la hoja de estados.
  - index.htm: pantalla de carga propia y la capa UX (ux/).
"""
import json, re, shutil, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

AQUI = Path(__file__).resolve().parent
MOTOR = AQUI.parent
sys.path.insert(0, str(AQUI))
import lotes as base  # noqa: E402
from objetos3dv import objetos  # noqa: E402
from numeros_correctos import corregir  # noqa: E402

VERSION = '1.0'
SCRIPTS = ('script_general.js', 'script_mobile.js')


class Proyecto:
    """La configuración de un proyecto (proyecto.json), con lo que el motor necesita ya calculado."""

    def __init__(self, carpeta):
        self.carpeta = Path(carpeta)
        self.p = json.loads((self.carpeta / 'proyecto.json').read_text(encoding='utf-8'))
        p = self.p
        lotes = p['lotes']
        self.texto_grupo = lotes.get('textoGrupo', 'Manzana')
        self.grupo_de = {}
        for letra, rangos in lotes['grupos'].items():
            for a, b in rangos:
                for n in range(a, b + 1):
                    self.grupo_de[n] = letra
        self.lugares = p.get('lugares', {})
        self.destinos = {int(k): v for k, v in p.get('destinos', {}).items()}
        self.volver_texto = p.get('volver', {}).get('texto', '')
        self.volver_desde = set(p.get('volver', {}).get('desde', []))
        self.panoramas = p.get('panoramas', {})
        self.camaras = {k: tuple(v) for k, v in p.get('camaras', {}).items()}
        self.camara_movil_pitch = p.get('camaraMovilPitch', 0)
        self.apagar = p.get('apagarOverlays', [])
        piel = p.get('pielVieja', {})
        self.piel_contenedores = piel.get('contenedores', [])
        self.piel_ocultar = piel.get('ocultarContenedores', [])
        self.piel_imagenes = piel.get('imagenes', [])

    def config_ux(self):
        """window.UX_CONFIG para la capa UX: datos de contacto y de la ficha, y textos del proyecto."""
        c = dict(self.p.get('ux', {}))
        c.update(nombre=self.p['nombre'], titulo=self.p.get('titulo', self.p['nombre']), textoGrupo=self.texto_grupo,
                 coloresGrupos=self.p['lotes'].get('coloresGrupos', {}),
                 pielOcultarContenedores=self.piel_ocultar, pielOcultarImagenes=self.piel_imagenes)
        return ('// Generado por el motor 3DVista desde proyecto.json: cambie allá, no aquí.\n'
                'window.UX_CONFIG = ' + json.dumps(c, ensure_ascii=False, indent=2) + ';\n')


def camaras(s, P, movil=False):
    cambios = []
    for a, b, t in objetos(s, 'PanoramaCamera'):
        m = re.search(r'"id":"(panorama_[A-Z0-9_]+)_camera"', t)
        if not m or m.group(1) not in P.camaras: continue
        yaw, pitch = P.camaras[m.group(1)]
        if movil: pitch += P.camara_movil_pitch
        nuevo, n = re.subn(r'"initialPosition":\{[^{}]*\}', '"initialPosition":{"pitch":%s,"class":"PanoramaCameraPosition","yaw":%s}' % (pitch, yaw), t)
        if n != 1: raise SystemExit('cámara sin initialPosition: ' + m.group(1))
        # 3DVista suele girar 360° al entrar y apuntar al horizonte: los lotes se salen de cuadro
        nuevo = re.sub(r',"initialSequence":"this\.sequence_[A-Z0-9_]+"', '', nuevo)
        nuevo = nuevo.replace('"enterPointingToHorizon":true', '"enterPointingToHorizon":false')
        cambios.append((a, b, nuevo))
    if len(cambios) != len(P.camaras): raise SystemExit('no encontré todas las cámaras de proyecto.json')
    for a, b, nuevo in sorted(cambios, reverse=True):
        s = s[:a] + nuevo + s[b:]
    if P.camaras:
        # al llegar a una de esas vistas desde otro panorama, el reproductor conserva el rumbo (backwardYaw)
        # y la cámara queda de espaldas a los lotes; sin backwardYaw abre en la posición inicial
        s = re.sub(r'("panorama":"this\.(?:%s)","yaw":-?[\d.]+),"backwardYaw":-?[\d.]+' % '|'.join(P.camaras), r'\1', s)
    return s


def etiqueta(t):
    m = re.findall(r'"data":\{[^{}]*?"label":"([^"]*)"', t)
    return m[-1] if m else ''


class Script:
    """Un script de 3DVista con índices por id para resolver referencias."""

    def __init__(self, s):
        self.s = s
        self.ov = objetos(s, 'HotspotPanoramaOverlay')
        self.areas = {re.search(r'"id":"([^"]+)"', t).group(1): t for _, _, t in objetos(s, 'HotspotPanoramaOverlayArea')}
        self.items = {}
        for clase in ('HotspotPanoramaOverlayImage', 'QuadHotspotPanoramaOverlayImage'):
            for _, _, t in objetos(s, clase):
                m = re.search(r'"id":"([^"]+)"', t)
                if m: self.items[m.group(1)] = t
        self.pano_de = {}
        for _, _, t in objetos(s, 'Panorama'):
            pid = re.search(r'"id":"([^"]+)"', t).group(1)
            m = re.search(r'"overlays":\[([^\]]*)\]', t)
            for ref in re.findall(r'this\.(overlay_[A-Z0-9_]+)', m.group(1) if m else ''):
                self.pano_de[ref] = pid

    def item(self, t):
        m = re.search(r'"items":\["this\.([^"]+)"', t)
        return self.items.get(m.group(1), '') if m else t

    def posicion(self, t):
        it = self.item(t)
        y = re.search(r'"yaw":(-?[\d.]+)', it); p = re.search(r'"pitch":(-?[\d.]+)', it)
        return (float(y.group(1)), float(p.group(1))) if y and p else None

    def clic(self, t):
        a = re.search(r'"areas":\["this\.([^"]+)"', t)
        if not a or a.group(1) not in self.areas: return ''
        m = re.search(r'"click":"((?:[^"\\]|\\.)*)"', self.areas[a.group(1)])
        return m.group(1) if m else ''


def apagar(s, ids):
    """Pone "enabled":false en los overlays indicados, usando los límites reales de cada objeto."""
    pendientes = set(ids)
    cambios = []
    for a, b, t in objetos(s, 'HotspotPanoramaOverlay'):
        m = re.search(r'"id":"(overlay_[^"]+)"', t)
        if not m or m.group(1) not in pendientes: continue
        pendientes.discard(m.group(1))
        if '"enabled":false' in t: continue
        nuevo = t.replace('"enabled":true', '"enabled":false') if '"enabled":true' in t else '{"enabled":false,' + t[1:]
        cambios.append((a, b, nuevo))
    if pendientes: raise SystemExit(f'no encontré {sorted(pendientes)[:3]}')
    for a, b, nuevo in sorted(cambios, reverse=True):
        s = s[:a] + nuevo + s[b:]
    return s


def numeros_nitidos(tour, s, loc, numericos):
    """Regenera las imágenes de los números de lote: blanco grueso con borde, del tamaño original."""
    fuente = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    hechos = set()
    for tid, texto in numericos:
        i = s.find(f'"id":"{tid}"')
        a = s.rfind('{', 0, i); b = s.find('}', s.find('"levels"', a))
        for lv in re.findall(r'this\.(imlevel_[A-Z0-9_]+)', s[a:b]):
            ruta = loc.get(f'{lv}.url')
            if not ruta or ruta in hechos: continue
            archivo = tour / ruta.split('?')[0]
            if not archivo.exists(): continue
            orig = Image.open(archivo).convert('RGBA')
            w, h = orig.size
            caja = orig.getbbox()          # dónde estaba el número original dentro del lienzo
            if not caja: continue
            alto = caja[3] - caja[1]
            im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            tam = max(8, int(alto * 1.25))
            f = ImageFont.truetype(fuente, tam)
            while tam > 8 and (d.textbbox((0, 0), texto, font=f)[3] - d.textbbox((0, 0), texto, font=f)[1]) > alto:
                tam -= 1; f = ImageFont.truetype(fuente, tam)
            ancho = d.textlength(texto, font=f)
            while tam > 8 and caja[0] + ancho > w - 2:
                tam -= 1; f = ImageFont.truetype(fuente, tam); ancho = d.textlength(texto, font=f)
            borde = max(2, tam // 10)
            cx = (caja[0] + caja[2]) / 2; cy = (caja[1] + caja[3]) / 2
            d.text((cx, cy), texto, font=f, fill=(255, 255, 255, 255), anchor='mm',
                   stroke_width=borde, stroke_fill=(8, 28, 20, 230))
            im.save(archivo)
            hechos.add(ruta)
    return len(hechos)


def logo_generico(nombre, redondo):
    """Logo provisional para proyectos sin marca: iniciales en un círculo, o el nombre en blanco."""
    fuente = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if redondo:
        im = Image.new('RGBA', (296, 296), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.ellipse((4, 4, 292, 292), fill=(31, 92, 72, 255), outline=(255, 255, 255, 230), width=6)
        ini = ''.join(p[0] for p in nombre.split()[:2]).upper() or '?'
        d.text((148, 150), ini, font=ImageFont.truetype(fuente, 110), fill=(255, 255, 255, 255), anchor='mm')
        return im
    f = ImageFont.truetype(fuente, 64)
    ancho = int(ImageDraw.Draw(Image.new('RGBA', (1, 1))).textlength(nombre.upper(), font=f)) + 40
    im = Image.new('RGBA', (max(200, ancho), 110), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((im.width // 2, 55), nombre.upper(), font=f, fill=(255, 255, 255, 255), anchor='mm')
    return im


def miniaturas_por_faltantes(tour):
    """Archivos que el recorrido referencia pero no vienen en la exportación: se usa la miniatura."""
    for nombre in SCRIPTS:
        sx = (tour / nombre).read_text(encoding='utf-8')
        faltan = sorted({u for u in re.findall(r'"url":"(media/[^"{}]+\.(?:webp|jpg|png))"', sx) if not (tour / u).exists()})
        for u in faltan:
            mini = re.sub(r'\.(webp|jpg|png)$', r'_t.\1', u)
            if (tour / mini).exists():
                sx = sx.replace('"url":"%s"' % u, '"url":"%s"' % mini)
                print('FALTA EN LA EXPORTACIÓN (se usa la miniatura):', nombre, u)
            else:
                print('FALTA EN LA EXPORTACIÓN (sin reemplazo):', nombre, u)
        (tour / nombre).write_text(sx, encoding='utf-8')


def sin_piel_vieja(tour, P):
    """Imágenes de la piel vieja que la capa UX oculta siempre: se cambian por un PNG transparente de 1×1
    para no descargarlas. El nombre conserva la marca (vacio-XXXXXXXX.png) porque la capa UX oculta esas
    imágenes por su url."""
    if not (P.piel_contenedores or P.piel_imagenes): return
    muertas = set()
    ids = '|'.join(re.escape(c) for c in P.piel_contenedores)
    for nombre in SCRIPTS:
        sx = (tour / nombre).read_text(encoding='utf-8')
        if ids:
            for _, _, tc in objetos(sx, 'Container'):
                if re.search(r'"id":"(?:%s)(?:_mobile)?"' % ids, tc):
                    m = re.search(r'"backgroundImageUrl":"(skin/[^"]+)"', tc)
                    if m: muertas.add(m.group(1))
    textos = [tour / n for n in SCRIPTS] + sorted((tour / 'locale').glob('*.txt'))
    if P.piel_imagenes:
        marcas = '|'.join(re.escape(m) for m in P.piel_imagenes)
        for t in textos:
            muertas |= set(re.findall(r'skin/Image_(?:%s)_[A-Za-z0-9_]+\.png' % marcas, t.read_text(encoding='utf-8')))
    ahorro = 0
    (tour / 'ux').mkdir(exist_ok=True)
    for u in sorted(muertas):
        vacio = 'ux/vacio-%s.png' % re.search(r'_([0-9A-F]{8})_', u).group(1)
        Image.new('RGBA', (1, 1), (0, 0, 0, 0)).save(tour / vacio)
        for t in textos:
            tx = t.read_text(encoding='utf-8')
            if u in tx: t.write_text(tx.replace(u, vacio), encoding='utf-8')
        if (tour / u).exists():
            ahorro += (tour / u).stat().st_size; (tour / u).unlink()
    print('piel vieja sin descargar: %d imágenes, %.1f MB menos' % (len(muertas), ahorro / 1e6))


def main(proyecto, origen, salida):
    P = Proyecto(proyecto)
    origen, salida = Path(origen), Path(salida)
    if salida.exists(): shutil.rmtree(salida)
    salida.mkdir(parents=True)
    print(f'motor 3DVista {VERSION} · proyecto {P.p["nombre"]}')
    # 1) lotes: copia la exportación a salida/tour y crea los gemelos de color
    base.main(origen, salida)
    tour = salida / 'tour'
    mapa = json.loads((salida / 'lotes-mapa.json').read_text(encoding='utf-8'))
    loc = dict(l.split(' = ', 1) for l in (origen / 'locale' / 'es.txt').read_text(encoding='utf-8').splitlines() if ' = ' in l)
    sin_grupo = [l['lote'] for l in mapa if l['lote'] not in P.grupo_de]
    if sin_grupo: raise SystemExit(f'lotes sin {P.texto_grupo.lower()} en proyecto.json: {sin_grupo}')

    datos = {'panoramas': {}, 'lotes': {}}
    for nombre in SCRIPTS:
        sc = Script((tour / nombre).read_text(encoding='utf-8'))
        apagados = []
        vistas = {}

        def vista(pid):
            return vistas.setdefault(pid, {'nombre': P.panoramas.get(pid, ''), 'lugares': [], 'navegacion': [], 'manzanas': [], 'numeros': []})
        for _, _, t in sc.ov:
            lab = etiqueta(t)
            oid = re.search(r'"id":"(overlay_[^"]+)"', t).group(1)
            pid = sc.pano_de.get(oid)
            if not pid: continue
            if lab in P.lugares:
                pos = sc.posicion(t)
                if pos:
                    vista(pid)['lugares'].append({'texto': P.lugares[lab], 'yaw': pos[0], 'pitch': pos[1]})
                    apagados.append(oid)
                continue
            m = re.search(r"setPlayListSelectedIndex\(this\.mainPlayList, (\d+)\)", sc.clic(t))
            if m:
                pos = sc.posicion(t)
                k = int(m.group(1))
                texto = P.volver_texto if pid in P.volver_desde and P.volver_texto else P.destinos.get(k, '')
                if pos and texto:
                    vista(pid)['navegacion'].append({'texto': texto, 'yaw': pos[0], 'pitch': pos[1], 'overlay': oid, 'destino': k})
                continue
            mt = re.search(r'"items":\["this\.(HotspotPanoramaOverlayTextImage_[A-Z0-9_]+)"', t)
            if mt:
                texto = loc.get(mt.group(1) + '.text', '').strip()
                pos = sc.posicion(t)
                if not pos: continue
                if texto.startswith(P.texto_grupo):
                    vista(pid)['manzanas'].append({'letra': texto[len(P.texto_grupo):].strip(), 'yaw': pos[0], 'pitch': pos[1]})
                    apagados.append(oid)
                elif texto.isdigit():
                    vista(pid)['numeros'].append({'lote': int(texto), 'yaw': pos[0], 'pitch': pos[1], 'imagen': mt.group(1)})
        apagados += [o for o in P.apagar if '"id":"%s"' % o in sc.s]
        s = camaras(apagar(sc.s, apagados), P, movil=(nombre == 'script_mobile.js'))
        # números más opacos (0.7 → 1) para que se lean sobre el terreno
        s = re.sub(r'("opacity":)0\.7(,"hfov":[\d.]+,"class":"HotspotPanoramaOverlayImage","id":"HotspotPanoramaOverlayTextImage_)', r'\g<1>1\2', s)
        (tour / nombre).write_text(s, encoding='utf-8')
        if nombre == 'script_general.js':
            datos['panoramas'] = vistas
            print('números corregidos (exportación):', corregir(tour, s, vistas, mapa))
            numericos = sorted({(n['imagen'], str(n['lote'])) for v in vistas.values() for n in v['numeros']})
            print('números regenerados:', numeros_nitidos(tour, s, loc, numericos))
            print('apagados en la vista:', len(apagados))

    for l in mapa:
        datos['lotes'][str(l['lote'])] = {'manzana': P.grupo_de[l['lote']], 'area_m2': l['area_m2'], 'vistas': l['vistas']}
    (tour / 'ux').mkdir(exist_ok=True)
    (tour / 'ux' / 'ux-datos.json').write_text(json.dumps(datos, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    miniaturas_por_faltantes(tour)
    sin_piel_vieja(tour, P)

    # 2) script.js: al cargar, solo se retira el precargador y se avisa a la capa UX.
    #    Lo que la exportación hiciera ahí (p. ej. removeWatermarks, que no va a producción) se quita.
    sj = (tour / 'script.js').read_text(encoding='utf-8')
    sj, n = re.subn(r'function onVirtualTourLoaded\(\)\s*\{[^{}]*\}',
                    'function onVirtualTourLoaded()\n{\n    disposePreloader();\n    if (window.UX) window.UX.tourListo();\n}', sj, count=1)
    if n != 1: raise SystemExit('script.js no tiene onVirtualTourLoaded')
    # funciones agregadas a mano en la exportación que no van a producción: quitar la marca de agua
    # (requiere licencia comercial) y el lector viejo de la hoja (lo reemplaza la capa UX)
    for nombre_fn in ('removeWatermarks', 'cargarEstadosLotes'):
        sj, n = re.subn(r'\n(?:async )?function %s\(\)\s*\{[\s\S]*?\n\}\n' % nombre_fn, '\n', sj, count=1)
        if n: print('fuera de script.js:', nombre_fn)
    if re.search(r'removeWatermarks|cargarEstadosLotes', sj): raise SystemExit('script.js todavía llama funciones que no van a producción')
    (tour / 'script.js').write_text(sj, encoding='utf-8')

    # 3) index.htm: título, pantalla de carga y capa UX
    ih = (tour / 'index.htm').read_text(encoding='utf-8')
    ih = re.sub(r'<title>[^<]*</title>', '<title>%s</title>' % P.p.get('titulo', P.p['nombre']), ih)
    cabeza = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
              '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">'
              '<link rel="stylesheet" href="ux/ux.css">')
    ih = ih.replace('</head>', cabeza + '\n</head>', 1)
    carga = (MOTOR / 'capa-ux' / 'carga.html').read_text(encoding='utf-8')
    carga = carga.replace('{{nombre}}', P.p['nombre']).replace('{{subtitulo}}', P.p.get('subtitulo', ''))
    ih = re.sub(r'<div id="preloadContainer"[\s\S]*?</div></div></div></div>', carga, ih, count=1, flags=re.IGNORECASE)
    if 'id="ux-carga"' not in ih: raise SystemExit('no pude poner la pantalla de carga en index.htm')
    ih = ih.replace('</body>', '<script src="ux/ux-config.js"></script>\n<script src="ux/ux.js"></script>\n</body>', 1)
    (tour / 'index.htm').write_text(ih, encoding='utf-8')
    for f in ('ux.css', 'ux.js'):
        shutil.copy(MOTOR / 'capa-ux' / f, tour / 'ux' / f)
    marca = P.p.get('marca', {})
    for clave, destino in (('logoRedondo', 'logo-redondo.png'), ('logoBlanco', 'logo-blanco.png')):
        origen_logo = P.carpeta / marca[clave] if marca.get(clave) else None
        if origen_logo and origen_logo.exists():
            shutil.copy(origen_logo, tour / 'ux' / destino)
        else:
            logo_generico(P.p['nombre'], clave == 'logoRedondo').save(tour / 'ux' / destino)
            print('sin %s en proyecto.json: se genera uno con las iniciales' % clave)
    (tour / 'ux' / 'ux-config.js').write_text(P.config_ux(), encoding='utf-8')
    (salida / 'lotes-mapa.json').unlink()
    print('listo:', tour)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
