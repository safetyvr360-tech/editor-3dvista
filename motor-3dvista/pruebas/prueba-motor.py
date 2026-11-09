"""
Prueba del motor 3DVista con un proyecto ficticio (no Cayman Creek).

  python3 -I pruebas/prueba-motor.py <exportacion-3dvista>

Usa una exportación real como insumo, pero con otra configuración: otro nombre, otros
grupos, sin cámaras ni piel vieja. Comprueba que el motor no trae nada de ningún proyecto
metido en su código: todo lo del proyecto sale de proyecto.json.
"""
import json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

MOTOR = Path(__file__).resolve().parent.parent
FICTICIO = MOTOR / 'pruebas' / 'proyecto-ficticio'
pasos = fallas = 0


def ok(cond, texto):
    global pasos, fallas
    pasos += 1
    if not cond: fallas += 1
    print(('OK    ' if cond else 'FALLA ') + texto)


# 1. El código del motor no nombra ningún proyecto
codigo = ''.join(p.read_text(encoding='utf-8') for p in list((MOTOR / 'motor').glob('*.py')) + list((MOTOR / 'capa-ux').glob('*')) + list((MOTOR / 'analizador').glob('*.js')))
ok(not re.search(r'cayman|km 30|vía al mar|3054443180', codigo, re.I), 'MOTOR: el código no menciona Cayman Creek ni sus datos')
ok(not re.search(r'panorama_[0-9A-F]{8}_|overlay_[0-9A-F]{8}_|093D90E6482C|42C931DC', codigo), 'MOTOR: el código no trae ids de un recorrido en particular')

# 2. Construir con el proyecto ficticio
salida = Path(tempfile.mkdtemp()) / 'salida'
r = subprocess.run([sys.executable, '-I', str(MOTOR / 'motor' / 'construir.py'), str(FICTICIO), sys.argv[1], str(salida)],
                   capture_output=True, text=True)
ok(r.returncode == 0, 'CONSTRUIR: el motor construye un proyecto distinto' + ('' if r.returncode == 0 else ': ' + (r.stderr or r.stdout)[-300:]))
tour = salida / 'tour'
if r.returncode == 0:
    cfg = (tour / 'ux' / 'ux-config.js').read_text(encoding='utf-8')
    c = json.loads(cfg[cfg.index('{'):cfg.rindex('}') + 1])
    ok(c['nombre'] == 'Parque Ficticio' and c['whatsapp'] == '570000000000', 'CONFIG: la capa UX recibe el nombre y el contacto del proyecto')
    ok(not re.search(r'cayman|3054443180', cfg, re.I), 'CONFIG: nada de Cayman Creek en la configuración generada')
    ih = (tour / 'index.htm').read_text(encoding='utf-8')
    ok('<title>Parque Ficticio</title>' in ih and 'Proyecto de prueba del motor' in ih, 'CARGA: título y pantalla de carga con los textos del proyecto')
    ok(not re.search(r'cayman', re.sub(r'<script[\s\S]*?</script>', '', ih), re.I), 'CARGA: la pantalla de carga no dice Cayman Creek')
    d = json.loads((tour / 'ux' / 'ux-datos.json').read_text(encoding='utf-8'))
    ok(all(l['manzana'] in ('N', 'S') for l in d['lotes'].values()) and len(d['lotes']) == 45, 'LOTES: 45 lotes agrupados según el proyecto (N y S)')
    lug = [l['texto'] for v in d['panoramas'].values() for l in v['lugares']]
    ok(lug and set(lug) == {'Recepción'}, 'LUGARES: solo las placas que el proyecto nombra, con su texto (%s)' % ', '.join(sorted(set(lug))))
    sj = (tour / 'script.js').read_text(encoding='utf-8')
    ok('removeWatermarks' not in sj, 'SCRIPT: removeWatermarks no queda ni en la carga ni definido (no va a producción)')
    ok((tour / 'ux' / 'logo-redondo.png').stat().st_size == (FICTICIO / 'marca' / 'redondo.png').stat().st_size, 'MARCA: usa los logos del proyecto')
    sg = (tour / 'script_general.js').read_text(encoding='utf-8')
    ok('"initialSequence"' in sg, 'CÁMARAS: sin cámaras en proyecto.json, el motor no toca las cámaras del recorrido')
shutil.rmtree(salida.parent, ignore_errors=True)
print(f'\n{pasos - fallas}/{pasos} verificaciones pasaron')
sys.exit(1 if fallas else 0)
