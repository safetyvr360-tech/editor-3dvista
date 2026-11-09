"""
Arma docs/ (lo que publica GitHub Pages) a partir del motor y de los proyectos.

  python3 -I herramientas/publicar-docs.py <exportacion-3dvista-de-cayman-creek>

Deja en docs/:
  cayman-creek/            el aplicativo de Cayman Creek construido con el motor (abre con el botón)
  analizar.js              el analizador del motor (el mismo archivo que motor-3dvista/analizador)
  ejemplo/cayman-creek/    los archivos de texto de la exportación que el analizador lee en la demo
                           (script.js sin removeWatermarks: eso no se publica)
La exportación completa (fotos) no se sube al repositorio: solo el sitio ya construido.
"""
import re, shutil, subprocess, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DOCS = RAIZ / 'docs'


def main(exportacion):
    exp = Path(exportacion)
    # 1) Cayman Creek con el motor
    salida = RAIZ / 'proyectos' / 'cayman-creek' / 'salida'
    r = subprocess.run([sys.executable, '-I', str(RAIZ / 'motor-3dvista' / 'motor' / 'construir.py'),
                        str(RAIZ / 'proyectos' / 'cayman-creek'), str(exp), str(salida)])
    if r.returncode: raise SystemExit('el motor no pudo construir Cayman Creek')
    destino = DOCS / 'cayman-creek'
    if destino.exists(): shutil.rmtree(destino)
    shutil.copytree(salida / 'tour', destino)
    # 2) analizador
    shutil.copy(RAIZ / 'motor-3dvista' / 'analizador' / 'analizar.js', DOCS / 'analizar.js')
    shutil.copy(RAIZ / 'motor-3dvista' / 'editor' / 'editar.js', DOCS / 'editar.js')
    # 3) ejemplo para el botón «Ver el proceso con Cayman Creek»
    ej = DOCS / 'ejemplo' / 'cayman-creek'
    if ej.exists(): shutil.rmtree(ej)
    (ej / 'locale').mkdir(parents=True)
    for f in ('script_general.js', 'index.htm', 'locale/es.txt'):
        shutil.copy(exp / f, ej / f)
    sj = (exp / 'script.js').read_text(encoding='utf-8')
    sj = re.sub(r'\n(?:async )?function removeWatermarks\(\)\s*\{[\s\S]*?\n\}\n', '\n', sj, count=1)
    sj = re.sub(r'\n\s*removeWatermarks\(\);', '', sj)
    if 'removeWatermarks' in sj: raise SystemExit('no pude quitar removeWatermarks del ejemplo')
    (ej / 'script.js').write_text(sj, encoding='utf-8')
    # la configuración revisada de Cayman Creek, para comparar con la propuesta del analizador
    shutil.copy(RAIZ / 'proyectos' / 'cayman-creek' / 'proyecto.json', ej / 'proyecto.json')
    total = sum(f.stat().st_size for f in destino.rglob('*') if f.is_file())
    print('docs listo · Cayman Creek: %d archivos, %.0f MB' % (sum(1 for f in destino.rglob('*') if f.is_file()), total / 1e6))


if __name__ == '__main__':
    if len(sys.argv) != 2: raise SystemExit(__doc__)
    main(sys.argv[1])
