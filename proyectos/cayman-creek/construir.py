"""
Construye el sitio de Cayman Creek con el motor 3DVista de EDITOR.

  python construir.py <exportacion-3dvista>            → salida/tour
  python construir.py <exportacion-3dvista> <salida>

El motor se busca en este orden:
  1. la variable de entorno MOTOR_3DVISTA
  2. ../../motor-3dvista                 (repositorio editor-3dvista: proyectos/cayman-creek)
  3. ../03-EDITOR/editor/motor-3dvista   (carpetas de ULTRAMEDIA en F:)
  4. ../motor-3dvista                    (carpeta hermana)

El sitio que sale (salida/tour) es estático y no necesita ni el motor ni EDITOR:
se publica tal cual (GitHub Pages o cualquier hosting).
"""
import os, subprocess, sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def buscar_motor():
    candidatos = [os.environ.get('MOTOR_3DVISTA'), AQUI.parent.parent / 'motor-3dvista',
                  AQUI.parent / '03-EDITOR' / 'editor' / 'motor-3dvista', AQUI.parent / 'motor-3dvista']
    for c in candidatos:
        if c and (Path(c) / 'motor' / 'construir.py').exists():
            return Path(c)
    raise SystemExit('No encontré el motor 3DVista. Defina MOTOR_3DVISTA con la ruta de la carpeta motor-3dvista.')


if __name__ == '__main__':
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    motor = buscar_motor()
    salida = sys.argv[2] if len(sys.argv) == 3 else str(AQUI / 'salida')
    print('motor:', motor)
    sys.exit(subprocess.call([sys.executable, '-I', str(motor / 'motor' / 'construir.py'), str(AQUI), sys.argv[1], salida]))
