# render-360 · una vista del recorrido sin pasar por el reproductor de 3DVista

Arma una vista (antes / después) a partir de las **fotos 360 originales** de la exportación y de los
polígonos de los lotes en su posición exacta. Sirve para imágenes de la plataforma y la página de venta
sin la marca que el reproductor dibuja con una licencia académica (la imagen nunca pasa por el reproductor).

Calibrado contra la app real (`getScreenPosition` del reproductor, al píxel):
- cámara: rumbo positivo a la derecha, inclinación positiva arriba, `hfov` horizontal;
- caras del cubo en el orden de three.js `px,nx,py,ny,pz,nz` = `l, r, u (girada 180°), d (girada 180°), b, f`;
- cada pieza es una lámina de frente al centro, de `2·50·tan(hfov/2)` por `2·50·tan(vfov/2)`.

Pasos (desde la raíz del repositorio, Node con three y playwright en `NODE_PATH`):
1. Armar las caras de nivel 1 (`media/<panorama>_0/{f,b,l,r,u,d}/1/{fila}_{col}.webp`, 4 × 4 mosaicos de 512)
   en `<trabajo>/caras/{f,b,l,r,d,u}.jpg` y guardar además `u180.jpg` y `d180.jpg` (giradas 180°).
2. `node herramientas/render-360/especificar.js "<exportación>" proyectos/<proyecto>/salida/tour <id panorama> <trabajo>`
   (los estados del «después» están arriba en el script).
3. Copiar `render.html` y `three.module.js` a `<trabajo>`, servirlo por http y abrir
   `render.html?cual=antes|despues&yaw=..&pitch=..&hfov=..&w=1440&h=900`; la imagen está lista cuando `window.__listo`.

Las imágenes del comparador de `docs/` (10/11/2026) salieron de la vista que abre la app:
`panorama_357F5D76_3823_7B2D_41C6_9C951179D2D9`, yaw −35,5, pitch −20, hfov 110.
