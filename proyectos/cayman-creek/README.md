# Cayman Creek · aplicativo 3DVista optimizado

Recorrido de venta de lotes de Cayman Creek (Km 30 Vía al Mar): los lotes se
pintan en vivo según la hoja de Google (verde disponible, naranja reservado, rojo
vendido); al tocar un lote se abre su ficha con WhatsApp.

Es un proyecto **independiente** y, a la vez, la **demo** de EDITOR: se construye
con el motor 3DVista de EDITOR, pero el sitio que sale no depende de EDITOR.

## Carpeta

```text
proyecto.json          todo lo propio de Cayman Creek (manzanas, lugares, cámaras, contacto…)
marca/                 logos
construir.py           construye el sitio con el motor de EDITOR
pruebas/               52 verificaciones en navegador real y capturas de cada parte
salida/tour            el sitio listo (se genera; es lo que se publica)
```

## Construir

```text
python construir.py "<carpeta de la exportación de 3DVista>"
```

Busca el motor en `MOTOR_3DVISTA`, luego en `..\03-EDITOR\editor\motor-3dvista`.

## Probar

```text
python -m http.server 8770 --directory salida/tour
node pruebas/prueba-cayman.js http://localhost:8770/index.htm capturas
node pruebas/previsualizar.js http://localhost:8770/index.htm previsualizaciones
```

## Cambiar datos sin programar

- **Estados de los lotes:** en la hoja de Google (se refresca cada 15 s).
- **Contacto, año, rentabilidad, separación:** `proyecto.json` → `ux`; luego construir otra vez.

## Publicar

Se sube el contenido de `salida/tour` (con un archivo `.nojekyll`) a GitHub Pages.

## Pendientes que dependen del cliente

- Marca de agua «3dvista Academic»: requiere licencia comercial de 3DVista.
- Página 9 del álbum móvil: la exportación no trae la imagen grande (se usa la miniatura).
