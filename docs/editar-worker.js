/*
 * Web worker del editor: abrir el .zip y rearmarlo fuera del hilo de la página
 * (punto 5 del plan de EDITOR), para que la pantalla no se congele con un recorrido de 80 MB o más.
 * Mensajes:
 *   { tipo: 'abrir', archivo: File|ArrayBuffer }   → { tipo: 'abierto', textos, raiz, entradas, lotes, whatsapp }
 *   { tipo: 'exportar', cambios }                 → { tipo: 'exportado', zip (transferido), entradas, cambiados, resumen }
 * Errores: { tipo: 'error', codigo }  (la página traduce el código)
 * Lotes reservados: la imagen del polígono se pinta de naranja aquí (OffscreenCanvas) y se guarda
 * con el mismo nombre dentro del .zip; al salir de reservado se pinta de nuevo de rojo.
 */
importScripts('vendor/jszip.min.js', 'analizar.js', 'editar.js');
var original = null, zipAbierto = null, raiz = '', textos = null;
var LEER = ['script_general.js', 'script_mobile.js', 'locale/es.txt', 'locale/en.txt'];

function leerComoBuffer(x) {
  return x && typeof x.arrayBuffer === 'function' ? x.arrayBuffer() : Promise.resolve(x);
}

// Pinta una imagen de polígono de rojo o naranja y la devuelve con el mismo formato (webp si el
// navegador sabe codificarlo; si no, png, que los navegadores muestran igual aunque se llame .webp).
function pintarImagen(ruta, color) {
  var e = zipAbierto.file(raiz + ruta);
  if (!e) return Promise.reject(new Error('no_esta_en_zip:' + ruta));
  return e.async('blob').then(function (blob) {
    return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  }).then(function (bmp) {
    var lienzo = new OffscreenCanvas(bmp.width, bmp.height);
    var ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    var img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    Editor3DVista.recolorearPixeles(img.data, color);
    ctx.putImageData(img, 0, 0);
    var tipo = /\.png$/i.test(ruta) ? 'image/png' : /\.jpe?g$/i.test(ruta) ? 'image/jpeg' : 'image/webp';
    return lienzo.convertToBlob({ type: tipo, quality: 1 });
  }).then(function (b) { return b.arrayBuffer(); }).then(function (ab) { return new Uint8Array(ab); });
}

self.onmessage = function (ev) {
  var m = ev.data || {};
  if (m.tipo === 'abrir') {
    leerComoBuffer(m.archivo).then(function (buf) {
      original = buf;
      return JSZip.loadAsync(buf, { createFolders: false });
    }).then(function (zip) {
      zipAbierto = zip;
      raiz = null;
      zip.forEach(function (ruta) { if (raiz === null && /(^|\/)script_general\.js$/.test(ruta)) raiz = ruta.slice(0, ruta.length - 'script_general.js'.length); });
      if (raiz === null) throw new Error('sin_script_general');
      var entradas = Object.keys(zip.files).length;
      return Promise.all(LEER.map(function (f) { var e = zip.file(raiz + f); return e ? e.async('string') : Promise.resolve(null); }))
        .then(function (v) {
          textos = {}; LEER.forEach(function (f, i) { if (v[i] !== null) textos[f] = v[i]; });
          var lotes = Editor3DVista.lotes(textos);
          if (!lotes.length) throw new Error('sin_lotes');
          self.postMessage({ tipo: 'abierto', raiz: raiz, entradas: entradas, lotes: lotes, whatsapp: Editor3DVista.whatsappActual(textos) });
        });
    }).catch(function (e) { self.postMessage({ tipo: 'error', codigo: /^(sin_script_general|sin_lotes)$/.test(e.message) ? e.message : 'zip_ilegible' }); });
  } else if (m.tipo === 'exportar') {
    if (!original || !textos) { self.postMessage({ tipo: 'error', codigo: 'sin_recorrido' }); return; }
    var r = Editor3DVista.aplicar(textos, m.cambios || {});
    var rutas = Object.keys(r.imagenes);
    Promise.all(rutas.map(function (ruta) {
      return pintarImagen(ruta, r.imagenes[ruta]).then(function (u8) { r.archivos[ruta] = u8; });
    })).catch(function (e) { e.codigo = /no_esta_en_zip/.test(e.message) ? 'no_se_pudo_rearmar' : 'no_se_pudo_pintar'; throw e; })
      .then(function () { return Editor3DVista.rearmar(JSZip, original, r.archivos, raiz); })
      .then(function (s) {
        self.postMessage({ tipo: 'exportado', zip: s.zip, entradas: s.entradas, cambiados: s.cambiados.map(function (c) { return c.slice(raiz.length); }), imagenes: rutas.length, resumen: r.resumen }, [s.zip.buffer]);
      }).catch(function (e) { self.postMessage({ tipo: 'error', codigo: e.codigo || (/identidad_zip/.test(e.message) ? 'identidad_zip' : 'no_se_pudo_rearmar') }); });
  }
};
