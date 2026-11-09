# Motor 3DVista (módulo de EDITOR)

Convierte una exportación de 3DVista en un aplicativo de venta de lotes optimizado:
lotes de colores según una hoja de cálculo (verde disponible, naranja reservado,
rojo vendido), ficha del lote al tocarlo, etiquetas nítidas que siguen la cámara,
pantalla de carga propia y versión móvil revisada. No agrega fotos ni panoramas.

El motor es **genérico**: no sabe nada de ningún proyecto. Todo lo propio de un
proyecto (nombre, manzanas, lugares, cámaras, contacto, logos) vive en el
`proyecto.json` de ese proyecto. El primer proyecto, y la demo de EDITOR, es
**Cayman Creek** (carpeta aparte).

## Uso

```text
python3 -I motor/construir.py <carpeta-del-proyecto> <exportacion-3dvista> <salida>
```

El resultado, `<salida>/tour`, es un sitio estático que se publica tal cual.

## Qué necesita del recorrido en 3DVista

- Un overlay **«rojo N»** por lote y por vista (la marca de vendido, apagada).
- Opcional: overlays **«Polígono»** (o «blanco N») como forma clicable del lote.
- Opcional: textos «Manzana X» (o el `textoGrupo` del proyecto) y números de lote.
- La hoja de estados publicada como CSV: columna 1 = lote, columna 2 = estado.

## proyecto.json

| Clave | Para qué |
|---|---|
| `nombre`, `subtitulo`, `titulo` | textos de la carga, la ficha y la pestaña |
| `lotes.textoGrupo`, `lotes.grupos`, `lotes.coloresGrupos` | manzanas: qué lotes van en cada una y su color |
| `lugares` | etiqueta de la placa en 3DVista → texto que se muestra |
| `destinos`, `volver`, `panoramas` | nombres de la navegación entre vistas |
| `camaras`, `camaraMovilPitch` | hacia dónde abre cada vista con lotes (y cuánto más abajo en el teléfono) |
| `apagarOverlays` | overlays de la exportación que sobran |
| `pielVieja` | piel anterior que se oculta y ya no se descarga |
| `ux` | hoja CSV, WhatsApp, teléfono, año y rentabilidad de la ficha, separación |
| `marca` | logos del proyecto |

Ejemplo completo: `../../04-CAYMAN-CREEK/proyecto.json`. Ejemplo mínimo:
`pruebas/proyecto-ficticio/proyecto.json`.

## Pruebas

```text
python3 -I pruebas/prueba-motor.py <exportacion-3dvista>
```

Construye con un proyecto ficticio y comprueba que el motor no trae nada de
ningún proyecto metido en el código. Las pruebas de punta a punta en navegador
(52) viven en cada proyecto: `04-CAYMAN-CREEK/pruebas/prueba-cayman.js`.

## Relación con el resto de EDITOR

Este módulo **no** es el camino de «republicar» de EDITOR. Ese camino exige la
identidad del `.zip` (sale entrada por entrada igual que entró); el motor, en
cambio, agrega archivos (colores de lotes, capa UX) y quita imágenes que ya no se
ven. Es una herramienta de **optimización** que produce un sitio derivado.
Está en Python + JavaScript de navegador, fuera de `src/`. Ver `docs/05-estado.md`.
