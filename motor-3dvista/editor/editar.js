/*
 * Motor 3DVista · editor dentro de los archivos (camino de «republicar» de EDITOR).
 *
 * Marca lotes como disponibles, reservados o vendidos y cambia el WhatsApp ESCRIBIENDO EN LOS ARCHIVOS
 * del propio recorrido, sin capa encima ni script agregado (ADR-001, opción B). Lo que sale tiene las
 * mismas entradas, con los mismos nombres y en el mismo orden; solo cambian por dentro los archivos
 * tocados. Es lo contrario del optimizador (motor/construir.py), que sí agrega una capa.
 *
 * Un lote está vendido cuando sus polígonos «rojo N» están encendidos ("enabled":true) y sin mostrarse
 * al pasar el mouse ("rollOverDisplay":false). Disponible es exactamente lo contrario, así que vender y
 * volver a dejar disponible devuelve el archivo original byte a byte.
 *
 * Reservado: la exportación solo trae polígonos rojos, así que el polígono se enciende como vendido y
 * su imagen se pinta de naranja DENTRO DEL MISMO ARCHIVO (mismo nombre: el .zip no gana entradas). La
 * URL de la imagen lleva «?reservado» como marca (así se reconoce al releer y el navegador no muestra
 * la imagen roja guardada en caché). Al salir de reservado la imagen vuelve a rojo: el script queda
 * idéntico al original, la imagen se ve igual pero no es idéntica byte a byte (se vuelve a codificar).
 *
 * Funciona en el navegador (window.Editor3DVista, necesita Analizador3DVista) y en Node.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../analizador/analizar.js'));
  else raiz.Editor3DVista = fabrica(raiz.Analizador3DVista);
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';
  var SCRIPTS = ['script_general.js', 'script_mobile.js'];

  // posición y texto de cada polígono «rojo N» de un script
  function rojos(s) {
    var out = [], pat = '"class":"HotspotPanoramaOverlay"', i = -1;
    A.objetos(s, 'HotspotPanoramaOverlay').forEach(function (t) {
      var m = /"data":\{[^{}]*?"label":"rojo (\d+)"/.exec(t);
      if (!m) return;
      var ini = s.indexOf(t, i + 1); i = ini;
      out.push({ lote: +m[1], ini: ini, fin: ini + t.length, texto: t });
    });
    return out;
  }
  var ESTADOS = ['disponible', 'reservado', 'vendido'];
  var MARCA = '?reservado';
  function estadoDe(t) {
    if (!/"enabled":true/.test(t)) return 'disponible';
    return t.indexOf(MARCA + '"') >= 0 ? 'reservado' : 'vendido';
  }
  // imágenes (rutas sin la marca) que dibuja un polígono
  function imagenesDe(t) {
    return (t.match(/"url":"[^"]+"/g) || []).map(function (u) { return u.slice(7, -1).split('?')[0]; });
  }

  // Lotes del recorrido y su estado actual en los archivos
  function lotes(textos) {
    var porLote = {};
    SCRIPTS.forEach(function (f) {
      if (!textos[f]) return;
      rojos(textos[f]).forEach(function (r) {
        var l = porLote[r.lote] = porLote[r.lote] || { lote: r.lote, poligonos: 0, cuenta: { disponible: 0, reservado: 0, vendido: 0 } };
        l.poligonos++; l.cuenta[estadoDe(r.texto)]++;
      });
    });
    return Object.keys(porLote).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      var l = porLote[n], estado = 'mixto';
      ESTADOS.forEach(function (e) { if (l.cuenta[e] === l.poligonos) estado = e; });
      return { lote: n, estado: estado, poligonos: l.poligonos };
    });
  }

  function cambiarPoligono(t, deseado) {
    var x = deseado === 'disponible'
      ? t.replace('"enabled":true', '"enabled":false').replace('"rollOverDisplay":false', '"rollOverDisplay":true')
      : t.replace('"enabled":false', '"enabled":true').replace('"rollOverDisplay":true', '"rollOverDisplay":false');
    x = x.split(MARCA + '"').join('"');
    if (deseado === 'reservado') x = x.replace(/("url":"[^"?]+)"/g, '$1' + MARCA + '"');
    return x;
  }

  /*
   * Pinta los píxeles de la imagen de un polígono (RGBA, como ImageData.data) de rojo o de naranja.
   * La exportación dibuja los lotes en rojo puro (tono 0°: verde = azul). Naranja es tono 30°: el verde
   * queda a mitad de camino entre el azul y el rojo. Se puede aplicar las veces que sea (rojo→naranja→rojo).
   */
  function recolorearPixeles(px, color) {
    for (var i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      var r = px[i], b = px[i + 2];
      if (r <= b) continue;                          // grises y blancos se quedan como están
      px[i + 1] = color === 'naranja' ? b + Math.round((r - b) / 2) : b;
    }
    return px;
  }

  function whatsappActual(textos) {
    var todo = Object.keys(textos).filter(function (f) { return /^locale\//.test(f); }).map(function (f) { return textos[f]; }).join('\n');
    var m = /wa\.me\/(\d{8,15})/.exec(todo);
    return m ? m[1] : '';
  }

  /*
   * Aplica los cambios y devuelve solo los archivos que cambiaron.
   *   cambios = { estados: { 17: 'vendido', 3: 'disponible', 44: 'reservado' }, whatsapp: '573001234567' }
   * → { archivos: { 'script_general.js': '…' }, imagenes: { 'media/x.webp': 'naranja' },
   *     resumen: { lotes: [...], whatsapp: n } }
   * `imagenes` son las imágenes de polígono que hay que pintar (naranja al entrar a reservado, rojo al
   * salir); quien rearma el .zip las pinta con recolorearPixeles y las pasa en `archivos`.
   */
  function aplicar(textos, cambios) {
    var estados = (cambios && cambios.estados) || {}, salida = {}, tocados = {}, imagenes = {};
    SCRIPTS.forEach(function (f) {
      var s = textos[f]; if (!s) return;
      var partes = [], desde = 0, cambio = false;
      rojos(s).forEach(function (r) {
        var deseado = estados[r.lote]; if (ESTADOS.indexOf(deseado) < 0) return;
        var nuevo = cambiarPoligono(r.texto, deseado);
        if (nuevo === r.texto) return;
        var antes = estadoDe(r.texto);
        if ((antes === 'reservado') !== (deseado === 'reservado')) {
          imagenesDe(r.texto).forEach(function (ruta) { imagenes[ruta] = deseado === 'reservado' ? 'naranja' : 'rojo'; });
        }
        partes.push(s.slice(desde, r.ini), nuevo); desde = r.fin; cambio = true; tocados[r.lote] = deseado;
      });
      if (cambio) { partes.push(s.slice(desde)); salida[f] = partes.join(''); }
    });
    var wa = cambios && cambios.whatsapp ? String(cambios.whatsapp).replace(/\D/g, '') : '', nWa = 0;
    if (wa) {
      var viejo = whatsappActual(textos);
      if (viejo && viejo !== wa) {
        Object.keys(textos).forEach(function (f) {
          if (!/^locale\//.test(f) && SCRIPTS.indexOf(f) < 0) return;
          var base = salida[f] !== undefined ? salida[f] : textos[f];
          var n = base.split('wa.me/' + viejo).length - 1;
          if (n) { salida[f] = base.split('wa.me/' + viejo).join('wa.me/' + wa); nWa += n; }
        });
      }
    }
    return { archivos: salida, imagenes: imagenes, resumen: { lotes: Object.keys(tocados).map(Number).sort(function (a, b) { return a - b; }).map(function (n) { return { lote: n, estado: tocados[n] }; }), whatsapp: nWa } };
  }

  /*
   * Rearma el .zip con las mismas entradas, en el mismo orden, cambiando solo el contenido de los
   * archivos indicados. `JSZip` es la biblioteca; `datos` el .zip original (ArrayBuffer/Buffer).
   * Devuelve { zip (Uint8Array), entradas, cambiados }.
   */
  function rearmar(JSZip, datos, archivos, raizZip) {
    return JSZip.loadAsync(datos, { createFolders: false }).then(function (zip) {
      var nombres = Object.keys(zip.files), antes = nombres.length, cambiados = [];
      Object.keys(archivos).forEach(function (f) {
        var ruta = (raizZip || '') + f;
        if (!zip.files[ruta]) throw new Error('no_esta_en_zip:' + ruta);
        zip.file(ruta, archivos[f], { date: zip.files[ruta].date });
        cambiados.push(ruta);
      });
      var despues = Object.keys(zip.files);
      if (despues.length !== antes || despues.some(function (n, i) { return n !== nombres[i]; })) throw new Error('identidad_zip');
      return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
        .then(function (u8) { return { zip: u8, entradas: antes, cambiados: cambiados, nombres: nombres }; });
    });
  }

  return { lotes: lotes, aplicar: aplicar, rearmar: rearmar, whatsappActual: whatsappActual, recolorearPixeles: recolorearPixeles, SCRIPTS: SCRIPTS, ESTADOS: ESTADOS };
});
