# editor-3dvista — instrucciones para Claude Code

Responder siempre en español. Backup antes de cambiar. Vista previa al terminar cada acción.
Método de Ruptura: una tarea no está terminada solo porque pasen las pruebas; romper a propósito
y comprobar que la prueba falla por la razón correcta. Textos de producto en es-CO («usted») y en.

## Qué es
Motor genérico que convierte una exportación de 3DVista en aplicativo de venta de lotes, más la
plataforma web (`docs/`, GitHub Pages) con Cayman Creek como ejemplo del proceso. Ver `README.md`.

## Dos caminos (no mezclarlos)
- **Optimizar** `motor-3dvista/motor/construir.py`: sitio derivado (agrega capa UX `capa-ux/ux.js`,
  quita piel vieja, estados en vivo desde hoja de Google).
- **Editar** `motor-3dvista/editor/editar.js`: identidad del .zip (ADR-001 opción B): mismas entradas,
  mismo orden. Vendido = `"enabled":true` + `"rollOverDisplay":false` en los overlays «rojo N»;
  disponible = al revés (ida y vuelta byte a byte). Cayman: 3.059 entran / 3.059 salen, cambian solo
  `locale/es.txt`, `script_general.js`, `script_mobile.js`. En el navegador corre en `docs/editar-worker.js`.

## Reglas
- `motor-3dvista/` no puede llevar nombres ni datos de ningún proyecto (la prueba del motor lo revisa).
- Los datos de cada proyecto viven en `proyectos/<nombre>/proyecto.json` + `marca/`.
- `docs/analizar.js` y `docs/editar.js` son copias: se regeneran con `herramientas/publicar-docs.py`, no editarlas a mano.
- Zips con JSZip usando `createFolders:false` (si no, agrega entradas de carpeta y rompe la identidad).
- La exportación original (fotos) no se sube al repo. En el PC del usuario está en
  `F:\cayman descargado\caymanCreek3dvista-main` (y `.zip`).

## Probar (todo debe quedar en verde)
```text
python3 -I motor-3dvista/pruebas/prueba-motor.py "<exportación>"        # 12
node motor-3dvista/pruebas/prueba-editor.js "<exportación>"             # 13
python3 -m http.server 8780 --directory docs
node proyectos/cayman-creek/pruebas/prueba-cayman.js http://localhost:8780/cayman-creek/index.htm capturas   # 53
node herramientas/prueba-plataforma.js http://localhost:8780/ "<exportación de Cayman Creek>"                 # 34
```
Las pruebas de navegador usan Playwright (Chromium).

## Estado (9/11/2026)
Hecho: motor genérico, analizador UMD (acierta 33/45 manzanas en Cayman: hay aviso de revisión),
editor en worker (punto 5), probado con recorrido sintético 4× (275 MB, 11.921 entradas: abre 0,9 s,
rearma 13 s), sección `#editar` bilingüe, botones de demo con Cayman Creek.

Pendiente: resto de la plataforma bilingüe; puntos 3 y 4 del plan de EDITOR (sesión, rol, app Next.js
en el portal del Cliente leyendo del almacenamiento); conectar `editar.js` al worker de publicación
(`app.confirmar_publicacion`). Decisiones abiertas: Python vs directiva TypeScript; si el distribuidor ve
`costo_licencia`. Del cliente: licencia comercial de 3DVista (marca de agua), re-exportar página 9 del álbum.

## Enlaces
- Plataforma: https://safetyvr360-tech.github.io/editor-3dvista/ (`#probar-cayman`, `#probador`, `#editar`)
- App Cayman Creek: https://safetyvr360-tech.github.io/editor-3dvista/cayman-creek/index.htm
