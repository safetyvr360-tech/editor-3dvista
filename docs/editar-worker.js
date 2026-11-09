/*
 * Web worker del editor: abrir el .zip y rearmarlo fuera del hilo de la página
 * (punto 5 del plan de EDITOR), para que la pantalla no se congele con un recorrido de 80 MB o más.
 * Mensajes:
 *   { tipo: 'abrir', archivo: File|ArrayBuffer }   → { tipo: 'abierto', textos, raiz, entradas, lotes, whatsapp }
 *   { tipo: 'exportar', cambios }                 → { tipo: 'exportado', zip (transferido), entradas, cambiados, resumen }
 * Errores: { tipo: 'error', codigo }  (la página traduce el código)
 */
importScripts('vendor/jszip.min.js', 'analizar.js', 'editar.js');
var original = null, raiz = '', textos = null;
var LEER = ['script_general.js', 'script_mobile.js', 'locale/es.txt', 'locale/en.txt'];

function leerComoBuffer(x) {
  return x && typeof x.arrayBuffer === 'function' ? x.arrayBuffer() : Promise.resolve(x);
}

self.onmessage = function (ev) {
  var m = ev.data || {};
  if (m.tipo === 'abrir') {
    leerComoBuffer(m.archivo).then(function (buf) {
      original = buf;
      return JSZip.loadAsync(buf, { createFolders: false });
    }).then(function (zip) {
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
    Editor3DVista.rearmar(JSZip, original, r.archivos, raiz).then(function (s) {
      self.postMessage({ tipo: 'exportado', zip: s.zip, entradas: s.entradas, cambiados: s.cambiados.map(function (c) { return c.slice(raiz.length); }), resumen: r.resumen }, [s.zip.buffer]);
    }).catch(function (e) { self.postMessage({ tipo: 'error', codigo: /identidad_zip/.test(e.message) ? 'identidad_zip' : 'no_se_pudo_rearmar' }); });
  }
};
