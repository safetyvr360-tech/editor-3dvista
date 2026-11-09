# EDITOR · Motor 3DVista

Convierte una exportación de 3DVista en un aplicativo de venta de lotes: cada lote
se pinta según una hoja de cálculo (verde disponible, naranja reservado, rojo
vendido) y al tocarlo abre su ficha con WhatsApp. No agrega fotos ni panoramas.

**Plataforma en vivo:** la carpeta `docs/` se publica con GitHub Pages. Ahí:

- **«Ver el proceso con Cayman Creek»** recorre los cuatro pasos con un proyecto real
  y termina en el aplicativo funcionando (`docs/cayman-creek/`).
- **«Usar con otro recorrido»**: se arrastra el `.zip` de cualquier exportación; la
  página revisa en el navegador si es compatible y arma su `proyecto.json`.
- **«Editar lotes sin tocar el .zip»**: marca lotes vendidos o disponibles y cambia el
  WhatsApp escribiendo dentro de los archivos del recorrido. El `.zip` sale con las
  mismas entradas en el mismo orden (Cayman Creek: 3.059 entran y 3.059 salen, solo 3
  archivos cambian por dentro). En español de Colombia y en inglés.

## Carpetas

```text
motor-3dvista/              el motor (genérico: no trae datos de ningún proyecto)
  motor/construir.py        construye el aplicativo: proyecto + exportación → sitio
  analizador/analizar.js    revisa la compatibilidad y propone proyecto.json (lo usa la plataforma)
  editor/editar.js          edita dentro de los archivos y rearma el mismo .zip (identidad del .zip)
  capa-ux/                  la interfaz que se monta sobre el recorrido
  pruebas/                  12 pruebas del motor (proyecto ficticio) y 13 del editor (.zip real)
proyectos/cayman-creek/     el ejemplo: proyecto.json, marca y 53 pruebas en navegador
docs/                       la plataforma publicada (GitHub Pages)
herramientas/               publicar-docs.py y las 34 pruebas de la plataforma
```

## Qué necesita un recorrido para ser compatible

- Un overlay **«rojo N»** por lote y por vista (la marca de vendido, apagada).
- `script.js` con `onVirtualTourLoaded` e `index.htm` con la pantalla de carga de 3DVista
  (vienen así en toda exportación web).
- Opcional: «Polígono» clicables, textos «Manzana X», números de lote y una hoja de Google
  publicada como CSV (columna 1 lote, columna 2 estado).

## Dos caminos

| | Optimizar (`motor/construir.py`) | Editar (`editor/editar.js`) |
|---|---|---|
| Para qué | entregar un aplicativo de venta nuevo | que el cliente cambie lotes de su recorrido ya publicado |
| El .zip | sale un sitio derivado: agrega la capa y colores | sale **el mismo .zip**: mismas entradas, mismo orden |
| Estados | en vivo desde una hoja de Google | escritos dentro de los archivos |

## Construir un proyecto

```text
python3 -I motor-3dvista/motor/construir.py proyectos/<proyecto> "<exportación de 3DVista>" proyectos/<proyecto>/salida
```

`salida/tour` es un sitio estático: se publica tal cual.

## Probar

```text
python3 -I motor-3dvista/pruebas/prueba-motor.py "<exportación>"
node motor-3dvista/pruebas/prueba-editor.js "<exportación>"
python3 -m http.server 8780 --directory docs
node proyectos/cayman-creek/pruebas/prueba-cayman.js http://localhost:8780/cayman-creek/index.htm capturas
node herramientas/prueba-plataforma.js http://localhost:8780/ "<exportación de Cayman Creek>"
```

## Actualizar la plataforma

```text
python3 -I herramientas/publicar-docs.py "<exportación de Cayman Creek>"
```

Reconstruye `docs/cayman-creek` con el motor y copia el analizador. La exportación
original (fotos) no se sube al repositorio, solo el sitio construido.

## Lo que depende del cliente

- La marca de agua «3dvista Academic» se quita exportando con licencia comercial de 3DVista.
- Las manzanas que propone el analizador hay que revisarlas (en Cayman Creek acertó 33 de 45).

ULTRAMEDIA COMPANY · EDITOR
