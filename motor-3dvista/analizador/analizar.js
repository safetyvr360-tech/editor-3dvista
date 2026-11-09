/*
 * Motor 3DVista · analizador de compatibilidad.
 *
 * Lee los archivos de texto de una exportación de 3DVista (script_general.js, locale/es.txt,
 * script.js, index.htm) y dice si el motor puede construir el aplicativo con ella. Además arma un
 * borrador de proyecto.json con lo que se puede deducir del recorrido.
 *
 * Funciona igual en el navegador (window.Analizador3DVista) y en Node (require). No lee fotos.
 * Sigue las mismas reglas que motor/lotes.py y motor/construir.py: si algo cambia allá, cambia aquí.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Analizador3DVista = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- lectura de objetos 3DVista
  // Igual que motor/objetos3dv.py: cada {…"class":"X"…} con sus llaves balanceadas, respetando cadenas.
  function objetos(s, clase) {
    var pat = '"class":"' + clase + '"', out = [], i = -1;
    while ((i = s.indexOf(pat, i + 1)) >= 0) {
      var sig = s.charAt(i + pat.length);
      if (sig !== ',' && sig !== '}') continue;
      var k = i, d = 0, enstr = false, ch;
      while (k > 0) {
        k--; ch = s.charAt(k);
        if (ch === '"' && s.charAt(k - 1) !== '\\') { enstr = !enstr; continue; }
        if (enstr) continue;
        if (ch === '}') d++;
        else if (ch === '{') { if (d === 0) break; d--; }
      }
      var a = k; d = 0; enstr = false;
      for (k = a; k < s.length; k++) {
        ch = s.charAt(k);
        if (ch === '"' && s.charAt(k - 1) !== '\\') enstr = !enstr;
        else if (!enstr) {
          if (ch === '{') d++;
          else if (ch === '}') { d--; if (d === 0) break; }
        }
      }
      out.push(s.slice(a, k + 1));
    }
    return out;
  }
  function id(t) { var m = /"id":"([^"]+)"/.exec(t); return m ? m[1] : ''; }
  function etiqueta(t) {
    var re = /"data":\{[^{}]*?"label":"([^"]*)"/g, m, ult = '';
    while ((m = re.exec(t))) ult = m[1];
    return ult.replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function num(re, t) { var m = re.exec(t); return m ? parseFloat(m[1]) : null; }
  function leerLocale(txt) {
    var loc = {};
    String(txt || '').split(/\r?\n/).forEach(function (l) { var i = l.indexOf(' = '); if (i > 0) loc[l.slice(0, i)] = l.slice(i + 3); });
    return loc;
  }
  function distancia(a, b) {
    var dy = ((a[0] - b[0] + 540) % 360) - 180;
    return Math.hypot(dy * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180), a[1] - b[1]);
  }
  function mediaAngular(yaws) {
    var x = 0, y = 0;
    yaws.forEach(function (g) { x += Math.cos(g * Math.PI / 180); y += Math.sin(g * Math.PI / 180); });
    return Math.atan2(y, x) * 180 / Math.PI;
  }
  // Elementos de "items":[…] de una lista, en orden. Los ítems pueden venir en línea ({…}) o como
  // referencias ("this.X"), y sus textos pueden traer corchetes: se recorre respetando cadenas.
  function elementosDeLista(t) {
    var out = [], i = t.indexOf('"items":['); if (i < 0) return out;
    var k = i + 9, d = 0, enstr = false, ini = -1;
    for (; k < t.length; k++) {
      var ch = t.charAt(k);
      if (ch === '"' && t.charAt(k - 1) !== '\\') { enstr = !enstr; if (d === 0 && enstr) ini = k; else if (d === 0 && !enstr && ini >= 0) { var ref = /^"this\.([^"]+)"$/.exec(t.slice(ini, k + 1)); if (ref) out.push(ref[1]); ini = -1; } continue; }
      if (enstr) continue;
      if (ch === '{') { if (d === 0) ini = k; d++; }
      else if (ch === '}') { d--; if (d === 0) { var m = /"media":"this\.([^"]+)"/.exec(t.slice(ini, k + 1)); out.push(m ? m[1] : ''); ini = -1; } }
      else if (ch === ']' && d === 0) break;
    }
    return out;
  }
  // «VIA AL MAR - BAQ» → «Via al Mar · BAQ»: palabras en mayúscula inicial, conectores en minúscula,
  // y lo que va después de un guion (códigos como BAQ o CTG) se deja en mayúsculas.
  function nombreDeLugar(lab) {
    var conect = { de: 1, del: 1, la: 1, las: 1, los: 1, al: 1, el: 1, y: 1, en: 1 };
    return lab.split(/\s+-\s+/).map(function (parte, i) {
      if (i > 0 && parte.length <= 4) return parte;
      return parte.toLowerCase().split(' ').map(function (w, j) { return j > 0 && conect[w] ? w : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
    }).join(' · ');
  }
  function redondear(v) { return Math.round(v * 2) / 2; }
  function titulo(t) {
    t = String(t).toLowerCase().replace(/\s+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // ---------------------------------------------------------------- análisis
  function analizar(archivos) {
    var sg = archivos.scriptGeneral || '', loc = leerLocale(archivos.locale), sj = archivos.script || '', ih = archivos.index || '';
    var r = { requisitos: [], avisos: [], lotes: [], panoramas: [], resumen: {} };
    function req(ok, texto, detalle) { r.requisitos.push({ ok: !!ok, texto: texto, detalle: detalle || '' }); }

    req(sg.length > 0, 'La exportación trae script_general.js', 'Es el archivo con todo el recorrido; viene en la raíz de la exportación de 3DVista.');
    if (!sg) { r.compatible = false; return r; }

    // panoramas y a cuál pertenece cada overlay
    var panos = {}, panoDe = {};
    objetos(sg, 'Panorama').forEach(function (t) {
      var pid = id(t); if (!pid) return;
      panos[pid] = { id: pid, etiqueta: loc[pid + '.label'] || pid, lotes: [], grupos: [], lugares: [], nav: [] };
      var m = /"overlays":\[([^\]]*)\]/.exec(t);
      (m ? m[1] : '').replace(/this\.(overlay_[A-Z0-9_]+)/g, function (_, o) { panoDe[o] = pid; return _; });
    });

    // lista principal: índice → panorama
    var lista = [];
    var ml = objetos(sg, 'PlayList').filter(function (t) { return id(t) === 'mainPlayList'; })[0] || '';
    lista = elementosDeLista(ml);
    req(lista.length > 0, 'Tiene la lista principal de vistas (mainPlayList)', lista.length + ' elementos');

    // áreas y su clic
    var clicDeArea = {};
    objetos(sg, 'HotspotPanoramaOverlayArea').forEach(function (t) { var m = /"click":"((?:[^"\\]|\\.)*)"/.exec(t); clicDeArea[id(t)] = m ? m[1] : ''; });

    // overlays: lotes, polígonos, números, textos de grupo, placas de lugares, navegación
    var rojos = [], poligonos = [], numeros = [], textosGrupo = [], lugares = {}, navs = [];
    objetos(sg, 'HotspotPanoramaOverlay').forEach(function (t) {
      var oid = id(t), pid = panoDe[oid], lab = etiqueta(t);
      var pos = [num(/"yaw":(-?[\d.]+)/, t), num(/"pitch":(-?[\d.]+)/, t)];
      var area = /"areas":\["this\.([^"]+)"/.exec(t), clic = area ? clicDeArea[area[1]] || '' : '';
      var nav = /setPlayListSelectedIndex\(this\.mainPlayList, (\d+)\)/.exec(clic);
      var ti = /"items":\["this\.(HotspotPanoramaOverlayTextImage_[A-Z0-9_]+)"/.exec(t);
      if (/^rojo \d+$/.test(lab)) { rojos.push({ lote: +lab.split(' ')[1], pano: pid, pos: pos, area: area && area[1] }); return; }
      if (/^pol[ií]gono$/i.test(lab) || /^blanco \d+$/.test(lab)) { poligonos.push({ pano: pid, pos: pos }); return; }
      if (!pid) return;
      if (nav) { navs.push({ pano: pid, destino: +nav[1] }); return; }
      if (ti) {
        var texto = (loc[ti[1] + '.text'] || '').trim();
        if (/^\d+$/.test(texto)) numeros.push({ lote: +texto, pano: pid });
        return;   // los textos de grupo («Manzana A») se leen más abajo
      }
      // placa de lugar: etiqueta en MAYÚSCULAS (como las nombra quien arma el recorrido)
      if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ \-]{2,}$/.test(lab) && pos[0] !== null) {
        lugares[lab] = lugares[lab] || nombreDeLugar(lab);
        panos[pid].lugares.push(lab);
      }
    });

    req(rojos.length > 0, 'Cada lote tiene su polígono «rojo N»', rojos.length ? rojos.length + ' polígonos rojos' : 'No hay overlays con la etiqueta «rojo N». En 3DVista, marque la forma de cada lote con un overlay llamado «rojo 1», «rojo 2»…');

    // textos de grupo («Manzana A»): su posición es la del ítem de texto que el overlay muestra
    var itemsTexto = {};
    ['HotspotPanoramaOverlayImage', 'QuadHotspotPanoramaOverlayImage'].forEach(function (c) {
      objetos(sg, c).forEach(function (x) { if (/^HotspotPanoramaOverlayTextImage_/.test(id(x))) itemsTexto[id(x)] = x; });
    });
    objetos(sg, 'HotspotPanoramaOverlay').forEach(function (t) {
      var ti = /"items":\["this\.(HotspotPanoramaOverlayTextImage_[A-Z0-9_]+)"/.exec(t); if (!ti) return;
      var texto = (loc[ti[1] + '.text'] || '').trim(), pid = panoDe[id(t)];
      if (!pid || !/^\S+ [A-Z0-9]{1,3}$/.test(texto)) return;
      var obj = itemsTexto[ti[1]] || t;
      textosGrupo.push({ texto: texto, pano: pid, pos: [num(/"yaw":(-?[\d.]+)/, obj), num(/"pitch":(-?[\d.]+)/, obj)] });
    });
    var palabra = null, cuenta = {};
    textosGrupo.forEach(function (g) { var w = g.texto.split(' ')[0]; cuenta[w] = (cuenta[w] || 0) + 1; });
    Object.keys(cuenta).forEach(function (w) { if (!palabra || cuenta[w] > cuenta[palabra]) palabra = w; });
    textosGrupo = textosGrupo.filter(function (g) { return g.texto.split(' ')[0] === palabra; });

    // lotes
    var areas = {};
    Object.keys(loc).forEach(function (k) { var m = /^(HotspotPanoramaOverlayArea_[A-Z0-9_]+)\.toolTip$/.exec(k); if (m) { var a = /(\d+)\s*m2/i.exec(loc[k]); if (a) areas[m[1]] = +a[1]; } });
    var porLote = {};
    rojos.forEach(function (x) {
      var l = porLote[x.lote] = porLote[x.lote] || { lote: x.lote, vistas: [], area_m2: null, votos: {} };
      l.vistas.push(x.pano); if (x.area && areas[x.area]) l.area_m2 = areas[x.area];
      panos[x.pano] && panos[x.pano].lotes.push(x.lote);
    });
    // grupo de cada lote: el texto «Manzana X» más cercano en cada vista; gana la letra con más votos.
    // Es una propuesta: el texto suele quedar en un extremo de la manzana, así que hay que revisarla.
    rojos.forEach(function (x) {
      var cerca = null, dmin = 1e9;
      textosGrupo.forEach(function (g) { if (g.pano !== x.pano || g.pos[0] === null || x.pos[0] === null) return; var d = distancia(g.pos, x.pos); if (d < dmin) { dmin = d; cerca = g; } });
      if (cerca) { var l = porLote[x.lote], letra = cerca.texto.split(' ')[1]; l.votos[letra] = (l.votos[letra] || 0) + 1; }
    });
    var lotesOrden = Object.keys(porLote).map(Number).sort(function (a, b) { return a - b; });
    lotesOrden.forEach(function (n) {
      var l = porLote[n], g = null;
      Object.keys(l.votos).forEach(function (k) { if (!g || l.votos[k] > l.votos[g]) g = k; });
      l.grupo = g || 'A';
      r.lotes.push({ lote: n, grupo: l.grupo, area_m2: l.area_m2, vistas: l.vistas.length });
    });
    var huecos = [];
    for (var n = 1; lotesOrden.length && n <= lotesOrden[lotesOrden.length - 1]; n++) if (!porLote[n]) huecos.push(n);
    if (huecos.length) r.avisos.push('Faltan números de lote en la secuencia: ' + huecos.join(', ') + '.');
    var sinArea = lotesOrden.filter(function (n) { return !porLote[n].area_m2; });
    if (sinArea.length) r.avisos.push(sinArea.length + ' lotes sin área en m² (se lee del texto emergente del área: «887 m2»). La ficha mostrará el área vacía.');

    // polígonos clicables, números repetidos y grupos
    if (!poligonos.length) r.avisos.push('No hay «Polígono» clicables: el clic funcionará sobre el polígono rojo/verde/naranja del lote.');
    var dup = {};
    numeros.forEach(function (x) { var k = x.pano + '|' + x.lote; dup[k] = (dup[k] || 0) + 1; });
    var repetidos = Object.keys(dup).filter(function (k) { return dup[k] > 1; }).map(function (k) { return k.split('|')[1]; });
    if (repetidos.length) r.avisos.push('Números de lote repetidos en una misma vista (' + repetidos.join(', ') + '): el motor los corrige mirando qué polígono contiene cada número.');
    if (palabra) r.avisos.push('Las ' + palabra.toLowerCase() + 's se proponen según el texto «' + palabra + ' X» más cercano a cada lote: revíselas antes de construir.');
    if (!palabra) r.avisos.push('No hay textos de grupo («Manzana A»…): todos los lotes quedan en un solo grupo; puede repartirlos a mano en proyecto.json.');

    // panoramas: nombre sugerido y cámara hacia los lotes
    var conLotes = Object.keys(panos).filter(function (p) { return panos[p].lotes.length; });
    // las vistas con lotes se numeran en el orden del recorrido (la primera de la lista es la 1)
    var ordenAereas = conLotes.slice().sort(function (x, y) { var a = lista.indexOf(x), b = lista.indexOf(y); return (a < 0 ? 1e9 : a) - (b < 0 ? 1e9 : b); });
    var nombres = {}, camaras = {};
    Object.keys(panos).forEach(function (pid) {
      var p = panos[pid], et = String(p.etiqueta);
      var limpio = et.replace(/^(DJI|IMG|PANO|DSC|GOPR|R00)[_\-]?[0-9_\-A-Z]*\s*/i, '').trim();
      if (p.lotes.length) p.nombre = conLotes.length > 1 ? 'Vista aérea ' + (ordenAereas.indexOf(pid) + 1) : 'Vista aérea';
      else p.nombre = limpio ? titulo(limpio) : 'Vista ' + (Object.keys(nombres).length + 1);
      nombres[pid] = p.nombre;
      if (p.lotes.length) {
        var ys = rojos.filter(function (x) { return x.pano === pid; });
        var yaw = mediaAngular(ys.map(function (x) { return x.pos[0]; }));
        var pitch = ys.reduce(function (a, x) { return a + x.pos[1]; }, 0) / ys.length;
        camaras[pid] = [redondear(yaw), redondear(Math.max(-45, Math.min(-12, pitch + 12)))];
      }
      r.panoramas.push({ id: pid, etiqueta: et, nombre: p.nombre, lotes: p.lotes.length, lugares: p.lugares.length });
    });
    req(conLotes.length > 0, 'Hay al menos una vista con lotes', conLotes.length + ' vista(s) con lotes');

    // navegación entre vistas
    var destinos = {};
    navs.forEach(function (x) { var pid = lista[x.destino]; if (pid && nombres[pid]) destinos[x.destino] = nombres[pid]; });
    var desde = Object.keys(panos).filter(function (p) { return !panos[p].lotes.length && navs.some(function (x) { return x.pano === p && panos[lista[x.destino]] && panos[lista[x.destino]].lotes.length; }); });

    // lo que el motor necesita de script.js e index.htm
    req(/function onVirtualTourLoaded\(\)\s*\{[^{}]*\}/.test(sj), 'script.js tiene onVirtualTourLoaded (ahí se engancha la capa nueva)', sj ? '' : 'Falta script.js en la exportación.');
    req(/<div id="preloadContainer"/i.test(ih), 'index.htm tiene la pantalla de carga de 3DVista (se reemplaza por la nueva)', ih ? '' : 'Falta index.htm en la exportación.');
    if (/removeWatermarks/.test(sj)) r.avisos.push('script.js trae código para quitar la marca de agua de 3DVista: el motor lo elimina (quitarla requiere licencia comercial).');
    var hoja = /(https:\/\/docs\.google\.com\/spreadsheets\/[^"'\s]*?output=csv)/.exec(sj + ' ' + sg);
    if (!hoja) r.avisos.push('No encontré una hoja de Google publicada como CSV: escriba su enlace en proyecto.json → ux.hojaCsv.');

    // borrador de proyecto.json
    var grupos = {};
    lotesOrden.forEach(function (n) { var g = porLote[n].grupo; (grupos[g] = grupos[g] || []).push(n); });
    Object.keys(grupos).forEach(function (g) {
      var rangos = [], ini = null, ant = null;
      grupos[g].forEach(function (n) { if (ini === null) ini = ant = n; else if (n === ant + 1) ant = n; else { rangos.push([ini, ant]); ini = ant = n; } });
      if (ini !== null) rangos.push([ini, ant]);
      grupos[g] = rangos;
    });
    var orden = {};
    Object.keys(grupos).sort().forEach(function (g) { orden[g] = grupos[g]; });
    r.proyecto = {
      nombre: archivos.nombre || 'Mi proyecto',
      subtitulo: '',
      motor: '1.0',
      lotes: { textoGrupo: palabra || 'Manzana', grupos: orden },
      lugares: lugares,
      destinos: destinos,
      volver: desde.length ? { texto: 'Volver a la vista aérea', desde: desde } : undefined,
      panoramas: nombres,
      camaras: camaras,
      camaraMovilPitch: -12,
      ux: {
        hojaCsv: hoja ? hoja[1] : '',
        refrescoSegundos: 15,
        whatsapp: '',
        telefonoVisible: '',
        anioProyeccion: new Date().getFullYear() + 2,
        rentabilidadProyectada: '',
        separacion: '',
        lotesDisponiblesSinHoja: lotesOrden.length
      }
    };
    if (!r.proyecto.volver) delete r.proyecto.volver;

    r.resumen = {
      lotes: lotesOrden.length, poligonosRojos: rojos.length, poligonosClicables: poligonos.length,
      vistas: Object.keys(panos).length, vistasConLotes: conLotes.length, grupos: Object.keys(orden).length,
      lugares: Object.keys(lugares).length, navegacion: navs.length, hoja: !!hoja
    };
    r.compatible = r.requisitos.every(function (q) { return q.ok; });
    return r;
  }

  return { analizar: analizar, objetos: objetos };
});
