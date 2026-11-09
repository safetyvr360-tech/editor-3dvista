// Motor 3DVista · capa de interfaz sobre el recorrido. Los datos del proyecto llegan en window.UX_CONFIG.
// Carga, encabezado, etiquetas que siguen la cámara, estados desde la hoja,
// colores de los lotes y ficha del lote. Sin dependencias.
(function () {
  'use strict';
  var C = window.UX_CONFIG || {};
  var NOMBRE_ESTADO = { disponible: 'Disponible', reservado: 'Reservado', vendido: 'Vendido', sin: 'Consultar' };
  var datos = null, estados = {}, extra = {}, hayHoja = false;
  var player = null, pano = null, panoActual = null;
  var elementos = [];            // etiquetas de la vista actual
  var loteAbierto = null;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  // escapa texto que va dentro de innerHTML (los nombres vienen de proyecto.json o de la hoja)
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var NOMBRE = C.nombre || 'Proyecto';
  var GRUPO = C.textoGrupo || 'Manzana';
  var reEsc = function (t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var PIEL_CONT = (C.pielOcultarContenedores || []).length ? new RegExp('(' + C.pielOcultarContenedores.map(reEsc).join('|') + ')(_mobile)?$') : null;
  var PIEL_IMG = (C.pielOcultarImagenes || []).length ? new RegExp(C.pielOcultarImagenes.map(reEsc).join('|')) : null;
  var PALETA = ['#7fd1a8', '#3fb27a', '#f0a06a', '#ef8fb0', '#8fb4ef', '#e6d36a', '#c39bea', '#6fd6d6'];
  function colorGrupo(letra) {
    var c = (C.coloresGrupos || {})[letra];
    if (c && /^#[0-9a-f]{3,8}$/i.test(c)) return c;
    var k = String(letra).charCodeAt(0) || 0; return PALETA[k % PALETA.length];
  }

  // ------------------------------------------------------------ íconos (SVG en línea)
  var I = {
    flecha: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cerrar: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3z"/></svg>',
    lote: '<svg viewBox="0 0 70 70" aria-hidden="true"><rect x="12" y="12" width="46" height="46" fill="none" stroke="#e8c37a" stroke-width="2.5"/><g fill="#0c231a" stroke="#a9c6b6" stroke-width="2.5"><circle cx="12" cy="12" r="5"/><circle cx="58" cy="12" r="5"/><circle cx="12" cy="58" r="5"/><circle cx="58" cy="58" r="5"/></g></svg>',
    renta: '<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="#a9c6b6" stroke-width="1.6"/><path d="M15 7v16M19 10.5c-.8-1.2-2.2-1.8-4-1.8-2.3 0-3.8 1.2-3.8 2.9 0 4 7.8 2 7.8 6.1 0 1.8-1.6 3-4 3-1.9 0-3.5-.7-4.3-2" fill="none" stroke="#e8c37a" stroke-width="1.6" stroke-linecap="round"/></svg>',
    lotes: '<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="#a9c6b6" stroke-width="1.6"/><path d="M15 23s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z" fill="none" stroke="#e8c37a" stroke-width="1.6"/><circle cx="15" cy="13" r="2" fill="#e8c37a"/></svg>',
    segura: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2l6 2.5v5c0 4-2.7 6.8-6 8.5-3.3-1.7-6-4.5-6-8.5v-5z" fill="none" stroke="#a9c6b6" stroke-width="1.5"/><path d="M7 10l2 2 4-4" fill="none" stroke="#a9c6b6" stroke-width="1.5" stroke-linecap="round"/></svg>',
    alta: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 17V11M8 17V8M13 17V5M3 7l5-3 5 2 4-3" fill="none" stroke="#a9c6b6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ubicacion: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 18s-5.5-4.6-5.5-9a5.5 5.5 0 0 1 11 0c0 4.4-5.5 9-5.5 9z" fill="none" stroke="#a9c6b6" stroke-width="1.5"/><circle cx="10" cy="9" r="2" fill="#a9c6b6"/></svg>',
  };

  // ------------------------------------------------------------ pantalla de carga
  var carga = { pct: 0, listo: false, inicio: Date.now() };
  var TEXTOS_CARGA = ['Preparando el recorrido', 'Cargando las vistas aéreas', 'Ubicando los lotes', 'Casi listo'];
  function pintarCarga(p) {
    carga.pct = Math.max(carga.pct, Math.min(100, Math.round(p)));
    var b = document.getElementById('ux-carga-progreso'); if (b) b.style.width = carga.pct + '%';
    var t = document.getElementById('ux-carga-pct'); if (t) t.textContent = carga.pct;
    var x = document.getElementById('ux-carga-texto'); if (x) x.textContent = TEXTOS_CARGA[Math.min(3, Math.floor(carga.pct / 26))];
  }
  // Progreso real: recursos del recorrido descargados, con un techo hasta que el reproductor avise.
  var recursos = 0;
  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) { if (/\/(media|skin|lib|locale)\/|script/.test(e.name)) recursos++; });
      if (!carga.listo) pintarCarga(Math.min(88, 8 + recursos * 2.2));
    }).observe({ type: 'resource', buffered: true });
  } catch (e) { /* navegadores viejos: queda el avance por tiempo */ }
  var avancePorTiempo = setInterval(function () { if (!carga.listo) pintarCarga(Math.min(80, carga.pct + 1)); }, 400);
  function cerrarCarga() {
    if (carga.listo) return;
    carga.listo = true; clearInterval(avancePorTiempo); pintarCarga(100);
    var espera = Math.max(0, 900 - (Date.now() - carga.inicio));
    setTimeout(function () {
      var c = document.getElementById('ux-carga');
      if (c) c.classList.add('ux-oculta');
      // al terminar el desvanecido sale del todo: no queda una capa invisible encima del recorrido
      setTimeout(function () { if (c) c.style.display = 'none'; window.__uxListo = Date.now(); }, 800);
    }, espera + 350);
  }
  setTimeout(function () { if (!carga.listo && player) cerrarCarga(); }, 30000);   // red lenta: no dejar al visitante esperando

  // ------------------------------------------------------------ hoja de estados
  function normalizar(v) {
    var t = String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!t) return 'sin';
    if (/^(vendid|venta|sold)/.test(t)) return 'vendido';
    if (/^(reservad|separad|apartad|reserv|hold)/.test(t)) return 'reservado';
    if (/^(disponib|libre|avail)/.test(t)) return 'disponible';
    return 'sin';
  }
  function leerCsv(texto) {
    texto = texto.replace(/^﻿/, '');
    var primera = texto.split(/\r?\n/, 1)[0];
    var sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
    var filas = [], fila = [], celda = '', q = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (q) { if (c === '"' && texto[i + 1] === '"') { celda += '"'; i++; } else if (c === '"') q = false; else celda += c; }
      else if (c === '"') q = true;
      else if (c === sep) { fila.push(celda); celda = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(celda); filas.push(fila); fila = []; celda = ''; }
      else celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    var cab = (filas[0] || []).map(function (h) { return h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_'); });
    var idx = function (ns, porDefecto) { for (var k = 0; k < ns.length; k++) { var j = cab.indexOf(ns[k]); if (j >= 0) return j; } return porDefecto; };
    // Por nombre si hay encabezados reconocibles; si no, por posición como la beta (lote, estado).
    var iL = idx(['lote', 'numero', 'n', 'no', 'lotes'], 0), iE = idx(['estado', 'status'], 1);
    var iP = idx(['precio', 'valor', 'precio_cop'], -1), iN = idx(['nota', 'notas', 'observaciones'], -1);
    var est = {}, ext = {};
    filas.slice(1).forEach(function (f) {
      var n = parseInt(String(f[iL] || '').replace(/\D/g, ''), 10);
      if (!n) return;
      est[n] = normalizar(f[iE]);
      ext[n] = { precio: iP >= 0 ? String(f[iP] || '').trim() : '', nota: iN >= 0 ? String(f[iN] || '').trim() : '' };
    });
    return { estados: est, extra: ext };
  }
  function leerHoja() {
    if (!C.hojaCsv) return Promise.resolve();
    var url = C.hojaCsv + (C.hojaCsv.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) {
        var r = leerCsv(t);
        if (JSON.stringify(r.estados) !== JSON.stringify(estados)) redibujarPor(10000);   // cambió la hoja
        estados = r.estados; extra = r.extra;
        hayHoja = Object.keys(estados).some(function (k) { return estados[k] !== 'sin'; });
        aplicarEstados(); if (loteAbierto) llenarFicha(loteAbierto);
        window.__uxHoja = Date.now();
      })
      .catch(function (e) { console.warn('[' + NOMBRE + '] No se pudo leer la hoja de estados; se mantienen los últimos.', e.message); });
  }
  function estadoDe(n) { return estados[n] || 'sin'; }
  // forzar: al entrar a un panorama 3DVista reconstruye sus overlays y no dibuja los que ya
  // estaban encendidos; hay que apagarlos y volver a encenderlos para que aparezcan.
  function encender(id, si, forzar) {
    var o = id && player.getById(id); if (!o) return;
    if (forzar && si) { o.set('enabled', false); o.set('enabled', true); }
    else if (o.get('enabled') !== si) o.set('enabled', si);
  }
  var redibujarHasta = 0;
  function redibujarPor(ms) { redibujarHasta = Math.max(redibujarHasta, Date.now() + ms); }
  function aplicarEstados(forzar) {
    if (!player || !datos) return;
    Object.keys(datos.lotes).forEach(function (k) {
      var e = estadoDe(+k);
      datos.lotes[k].vistas.forEach(function (v) {
        var aqui = forzar && v.pano === forzar;
        encender(v.verde, e === 'disponible', aqui); encender(v.naranja, e === 'reservado', aqui); encender(v.rojo, e === 'vendido', aqui);
        v.poligonos.forEach(function (id) { encender(id, e === 'sin', aqui); });
      });
    });
    window.__uxEstados = Date.now();
  }
  function disponibles() {
    if (!hayHoja) return C.lotesDisponiblesSinHoja;
    return Object.keys(datos.lotes).filter(function (k) { return estadoDe(+k) === 'disponible'; }).length;
  }

  // ------------------------------------------------------------ encabezado
  function iconoBeta(nombre) {
    return (player.getByClassName('IconButton') || []).filter(function (b) { return ((b.get('data') || {}).name || '') === 'IconButton ' + nombre; })[0];
  }
  function waUrl(texto) { return 'https://wa.me/' + (C.whatsapp || '') + '?text=' + encodeURIComponent(texto); }
  function montarCapa() {
    var capa = document.createElement('div');
    capa.id = 'ux-capa';
    capa.innerHTML =
      '<div id="ux-etiquetas"></div>' +
      '<div class="ux-cabeza">' +
        '<nav class="ux-iconos" aria-label="Información del proyecto"></nav>' +
        '<button type="button" class="ux-logo" aria-label="Ver información de ' + esc(NOMBRE) + '"></button>' +
        '<a class="ux-contacto" target="_blank" rel="noopener">' + I.wa + '<span>Contactar con asesor</span></a>' +
      '</div>' +
      '<ul class="ux-leyenda" aria-label="Colores de los lotes"><li><i class="ux-p-verde"></i>Disponible</li><li><i class="ux-p-naranja"></i>Reservado</li><li><i class="ux-p-rojo"></i>Vendido</li></ul>';
    document.body.appendChild(capa);
    $('.ux-contacto', capa).href = waUrl('Hola, quiero información de ' + NOMBRE + '.');
    var nav = $('.ux-iconos', capa);
    [['Info', 'Información del proyecto'], ['Location', 'Ubicación'], ['Photoalbum', 'Galería de fotos'], ['Floorplan', 'Plano del proyecto']].forEach(function (par) {
      var b = iconoBeta(par[0]); if (!b) return;
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'ux-icono'; el.title = par[1]; el.setAttribute('aria-label', par[1]);
      var u = b.get('iconURL'); if (u) el.style.backgroundImage = 'url("' + u + '")';
      el.addEventListener('click', function () { b.trigger('click'); });
      nav.appendChild(el);
    });
    $('.ux-logo', capa).addEventListener('click', function () { var b = iconoBeta('Info'); if (b) b.trigger('click'); });
  }
  // La piel vieja (franja verde con hojas, íconos, logo y botón) se oculta; la capa la reemplaza.
  function ocultarPielBeta() {
    (player.getByClassName('Container') || []).forEach(function (c) {
      var id = c.get('id') || '', nombre = ((c.get('data') || {}).name || '');
      // contenedores de la piel vieja (proyecto.json → pielVieja.ocultarContenedores), en computador y teléfono
      if (PIEL_CONT && PIEL_CONT.test(id) || /Container Icons/.test(nombre)) { if (c.get('visible')) c.set('visible', false); }
    });
    (player.getByClassName('Image') || []).forEach(function (im) {
      var u = String(im.get('url') || '');
      if (PIEL_IMG && PIEL_IMG.test(u)) im.set('visible', false);   // imágenes de la piel vieja (botones, logo)
    });
  }

  // ------------------------------------------------------------ etiquetas que siguen la cámara
  function hacerElemento(html, clase, extraFn) {
    var el = document.createElement(clase === 'nav' ? 'button' : 'div');
    if (clase === 'nav') el.type = 'button';
    el.className = 'ux-e';
    el.innerHTML = html;
    if (extraFn) extraFn(el);
    $('#ux-etiquetas').appendChild(el);
    return el;
  }
  function construirVista(pid) {
    var cont = $('#ux-etiquetas'); cont.replaceChildren(); elementos = [];
    var v = datos.panoramas[pid]; if (!v) return;
    v.lugares.forEach(function (l) {
      elementos.push({ yaw: l.yaw, pitch: l.pitch, tipo: 'lugar', prioridad: 1, el: hacerElemento('<span class="ux-pildora"><i class="ux-punto"></i>' + esc(l.texto) + '</span>') });
    });
    v.navegacion.forEach(function (n) {
      var el = document.createElement('button');
      el.type = 'button'; el.className = 'ux-e ux-nav ux-pildora';
      el.innerHTML = '<i class="ux-flecha">' + I.flecha + '</i>';
      el.appendChild(document.createTextNode(n.texto));
      el.style.transform = 'none';
      el.setAttribute('aria-label', 'Ir a ' + n.texto);
      el.addEventListener('click', function () {
        var o = player.getById(n.overlay); var a = o && (o.get('areas') || [])[0];
        if (a) a.trigger('click');
      });
      cont.appendChild(el);
      elementos.push({ yaw: n.yaw, pitch: n.pitch, el: el, centrar: true, desplazar: -34, tipo: 'nav', prioridad: 3 });
    });
    v.manzanas.forEach(function (m) {
      var el = hacerElemento('<div class="ux-manzana" style="--mz: ' + colorGrupo(m.letra) + '"><span class="ux-pildora"><i class="ux-punto"></i>' + esc(GRUPO) + ' ' + esc(m.letra) + '</span><i class="ux-guia"></i><i class="ux-ancla"></i></div>');
      elementos.push({ yaw: m.yaw, pitch: m.pitch, el: el, tipo: 'manzana', prioridad: 2 });
    });
    v.numeros.forEach(function (n) {
      var el = hacerElemento('<span class="ux-marca"></span>');
      elementos.push({ yaw: n.yaw, pitch: n.pitch, el: el, lote: n.lote, tipo: 'marca', prioridad: 0.5 });
    });
  }
  var fijas = null, fijasW = 0;
  function zonasFijas() {
    if (!fijas || fijasW !== window.innerWidth) {
      fijasW = window.innerWidth;
      fijas = ['.ux-logo', '.ux-iconos', '.ux-contacto', '.ux-leyenda'].map(function (sel) {
        var el = document.querySelector(sel); if (!el) return null;
        var r = el.getBoundingClientRect(); return [r.left - 6, r.top - 6, r.right + 6, r.bottom + 6];
      }).filter(Boolean);
    }
    return fijas.slice();
  }
  function frente(yaw, pitch, cy, cp) {
    var r = Math.PI / 180;
    var a = [Math.cos(pitch * r) * Math.sin(yaw * r), Math.sin(pitch * r), Math.cos(pitch * r) * Math.cos(yaw * r)];
    var b = [Math.cos(cp * r) * Math.sin(cy * r), Math.sin(cp * r), Math.cos(cp * r) * Math.cos(cy * r)];
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  var ventanaAbierta = false, revisadoVentana = 0;
  function cuadro() {
    requestAnimationFrame(cuadro);
    if (!pano) return;
    var media = pano.get('panorama'); var pid = media && media.get('id');
    if (pid !== panoActual) {
      panoActual = pid; construirVista(pid); aplicarEstados(); redibujarPor(10000);
    }
    // con una ventana de la beta abierta (ubicación, galería, plano, información) las etiquetas se ocultan
    var ahora = Date.now();
    if (ahora - revisadoVentana > 250) {
      revisadoVentana = ahora;
      ventanaAbierta = player.getByClassName('Window').some(function (w) { return w.get('visible'); });
      var capa = $('#ux-etiquetas'); if (capa.hidden !== ventanaAbierta) capa.hidden = ventanaAbierta;
      document.documentElement.classList.toggle('ux-ventana', ventanaAbierta);
      if (ventanaAbierta) ocultarPielBeta();   // la beta vuelve a mostrar su franja vieja al abrir una ventana
    }
    if (ventanaAbierta) return;
    var cy = pano.get('yaw'), cp = pano.get('pitch'), W = window.innerWidth, H = window.innerHeight;
    var fichaAbierta = !!loteAbierto;
    var colocar = [];
    for (var i = 0; i < elementos.length; i++) {
      var e = elementos[i];
      if (e.lote) {
        var est = estadoDe(e.lote);
        var mostrar = est === 'reservado' || est === 'vendido';
        var marca = e.el.firstChild;
        if (marca.dataset.e !== est) { marca.dataset.e = est; marca.className = 'ux-marca ' + est; marca.textContent = mostrar ? NOMBRE_ESTADO[est] : ''; }
        if (!mostrar) { e.el.hidden = true; continue; }
      }
      if (fichaAbierta || frente(e.yaw, e.pitch, cy, cp) < 0.2) { e.el.hidden = true; continue; }
      var p = pano.getScreenPosition(e.yaw, e.pitch);
      if (!p || !isFinite(p.x) || p.x < -200 || p.x > W + 200 || p.y < -100 || p.y > H + 100) { e.el.hidden = true; continue; }
      e.x = Math.round(p.x); e.y = Math.round(p.y + (e.desplazar || 0));
      colocar.push(e);
    }
    // Las etiquetas no se enciman: primero las de más prioridad; la que choca se corre hacia arriba o se oculta.
    colocar.sort(function (a, b) { return (b.prioridad || 0) - (a.prioridad || 0); });
    // el encabezado y la leyenda también ocupan lugar: las etiquetas los esquivan
    var puestas = zonasFijas();
    for (var j = 0; j < colocar.length; j++) {
      var c = colocar[j];
      if (c.prioridad) {
        if (c.el.hidden) c.el.hidden = false;
        if (!c.w) { c.w = c.el.offsetWidth || (c.el.firstChild && c.el.firstChild.offsetWidth) || 120; c.h = c.el.offsetHeight || 30; }
        var interior = (c.tipo === 'lugar' || c.tipo === 'marca') ? c.el.firstChild : c.el;
        var w = interior.offsetWidth || c.w, h = interior.offsetHeight || c.h;
        // a dónde puede correrse cada tipo (px en vertical); la navegación también hacia abajo, para salir de debajo del logo
        var pasos = c.tipo === 'nav' ? [0, h + 10, 2 * (h + 10), -(h + 8)] : c.tipo === 'lugar' ? [0, -(h + 6), h + 6] : c.tipo === 'manzana' ? [0, -(h + 6)] : [0];
        var libre = false;
        for (var intento = 0; intento < pasos.length && !libre; intento++) {
          var dy = pasos[intento];
          var r = c.tipo === 'manzana' ? [c.x - w / 2, c.y - h + dy, c.x + w / 2, c.y + dy]
                : c.tipo === 'marca' ? [c.x - w / 2, c.y + dy, c.x + w / 2, c.y + 1.6 * h + dy]
                : [c.x - w / 2, c.y - h / 2 + dy, c.x + w / 2, c.y + h / 2 + dy];
          libre = !puestas.some(function (q) { return r[0] < q[2] + 4 && r[2] + 4 > q[0] && r[1] < q[3] + 3 && r[3] + 3 > q[1]; });
          if (libre) { puestas.push(r); c.y += dy; }
        }
        if (!libre && c.tipo === 'nav') { libre = true; }   // un acceso de navegación nunca se oculta
        if (!libre) { c.el.hidden = true; continue; }
      }
      c.el.hidden = false;
      c.el.style.transform = c.centrar ? 'translate(' + c.x + 'px,' + c.y + 'px) translate(-50%,-50%)' : 'translate(' + c.x + 'px,' + c.y + 'px)';
    }
  }

  // ------------------------------------------------------------ ficha del lote
  var velo = null;
  function montarFicha() {
    velo = document.createElement('div');
    velo.className = 'ux-velo';
    velo.setAttribute('aria-hidden', 'true');
    velo.innerHTML =
      '<section class="ux-ficha" role="dialog" aria-modal="true" aria-labelledby="ux-f-titulo">' +
        '<button type="button" class="ux-cerrar" aria-label="Cerrar la ficha">' + I.cerrar + '</button>' +
        '<header class="ux-ficha-cabeza"><img src="ux/logo-blanco.png" alt="' + esc(NOMBRE) + '"></header>' +
        '<div class="ux-ficha-cuerpo">' +
          '<h2 class="ux-titulo" id="ux-f-titulo">Proyección de Ganancias<br>' + esc(NOMBRE) + ' a <span id="ux-f-anio"></span> <small>(COP)</small></h2>' +
          '<div class="ux-lote-linea"><span id="ux-f-lote"></span><span aria-hidden="true">·</span><span id="ux-f-manzana"></span><span class="ux-estado" id="ux-f-estado"></span></div>' +
          '<div class="ux-area">' + I.lote + '<p>Tamaño del lote<br>individual<b id="ux-f-area"></b></p></div>' +
          '<div class="ux-datos">' +
            '<div class="ux-dato">' + I.renta + '<span>Rentabilidad proyectada<b id="ux-f-renta"></b></span></div>' +
            '<div class="ux-dato">' + I.lotes + '<span>Lotes disponibles<b id="ux-f-disp"></b></span></div>' +
          '</div>' +
          '<p class="ux-separa" id="ux-f-separa"></p>' +
          '<p class="ux-nota" id="ux-f-nota" hidden></p>' +
          '<div class="ux-aparta"><p id="ux-f-llamado">¡APARTA EL TUYO AHORA!</p><span class="ux-tel">' + I.wa + '<span id="ux-f-tel"></span></span></div>' +
          '<ul class="ux-sellos"><li>' + I.segura + 'Inversión segura</li><li>' + I.alta + 'Alta proyección</li><li>' + I.ubicacion + 'Ubicación privilegiada</li></ul>' +
          '<a class="ux-wa" id="ux-f-wa" target="_blank" rel="noopener">' + I.wa + '<span id="ux-f-wa-texto">Escribir por WhatsApp</span></a>' +
        '</div>' +
      '</section>';
    document.body.appendChild(velo);
    $('.ux-cerrar', velo).addEventListener('click', cerrarFicha);
    velo.addEventListener('click', function (e) { if (e.target === velo) cerrarFicha(); });
    document.addEventListener('keydown', function (e) {
      if (!loteAbierto) return;
      if (e.key === 'Escape') { cerrarFicha(); return; }
      if (e.key !== 'Tab') return;
      // la ficha es modal: el Tab da la vuelta dentro de ella y no se va al recorrido de atrás
      var focos = [].slice.call(document.querySelectorAll('.ux-ficha a[href], .ux-ficha button:not([disabled])')).filter(function (el) { return el.offsetParent !== null; });
      if (!focos.length) return;
      var primero = focos[0], ultimo = focos[focos.length - 1], dentro = document.activeElement && document.activeElement.closest && document.activeElement.closest('.ux-ficha');
      if (e.shiftKey && (document.activeElement === primero || !dentro)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) { e.preventDefault(); primero.focus(); }
    });
  }
  function formatoPrecio(p) {
    var n = Number(String(p || '').replace(/[^\d]/g, ''));
    return n ? '$ ' + n.toLocaleString('es-CO') : '';
  }
  function llenarFicha(n) {
    var l = datos.lotes[n]; if (!l) return;
    var est = estadoDe(n), ex = extra[n] || {};
    $('#ux-f-anio').textContent = C.anioProyeccion || '';
    $('#ux-f-lote').textContent = 'Lote ' + n;
    $('#ux-f-manzana').textContent = GRUPO + ' ' + l.manzana;
    var pe = $('#ux-f-estado'); pe.textContent = est === 'sin' ? '' : NOMBRE_ESTADO[est]; pe.hidden = est === 'sin'; pe.className = 'ux-estado ' + est;
    $('#ux-f-area').textContent = l.area_m2 ? Number(l.area_m2).toLocaleString('es-CO') + ' m²' : '—';
    $('#ux-f-renta').textContent = C.rentabilidadProyectada || '—';
    $('#ux-f-disp').textContent = disponibles();
    var precio = formatoPrecio(ex.precio);
    var sep = $('#ux-f-separa');
    sep.innerHTML = '';
    if (precio) { sep.append('Precio: '); var b = document.createElement('b'); b.textContent = precio; sep.append(b); }
    if (C.separacion && est !== 'vendido') { if (precio) sep.append(' · '); sep.append('Sepáralo con '); var b2 = document.createElement('b'); b2.textContent = C.separacion; sep.append(b2); }
    sep.hidden = !sep.textContent;
    var nota = $('#ux-f-nota'); nota.textContent = ex.nota || ''; nota.hidden = !ex.nota;
    $('#ux-f-tel').textContent = C.telefonoVisible || '';
    var wa = $('#ux-f-wa');
    if (est === 'vendido') {
      $('#ux-f-llamado').textContent = 'Este lote ya fue vendido';
      $('#ux-f-wa-texto').textContent = 'Preguntar por lotes disponibles';
      wa.classList.add('ux-vendido');
      wa.href = waUrl('Hola, el lote ' + n + ' de ' + NOMBRE + ' aparece vendido. ¿Qué lotes similares tienen disponibles?');
    } else {
      $('#ux-f-llamado').textContent = est === 'reservado' ? 'Lote reservado · pregunte por él' : '¡APARTA EL TUYO AHORA!';
      $('#ux-f-wa-texto').textContent = 'Escribir por WhatsApp';
      wa.classList.remove('ux-vendido');
      wa.href = waUrl('Hola, me interesa el lote ' + n + ' (' + GRUPO + ' ' + l.manzana + ', ' + (l.area_m2 || '') + ' m²) de ' + NOMBRE + '.');
    }
  }
  var focoAntes = null;
  function abrirFicha(n) {
    n = Number(n); if (!datos || !datos.lotes[n]) return;
    loteAbierto = n; llenarFicha(n);
    focoAntes = document.activeElement;
    velo.classList.add('ux-abierta'); velo.setAttribute('aria-hidden', 'false');
    setTimeout(function () { $('.ux-cerrar', velo).focus(); }, 50);
    window.__uxFicha = n;
  }
  function cerrarFicha() {
    loteAbierto = null; velo.classList.remove('ux-abierta'); velo.setAttribute('aria-hidden', 'true');
    if (focoAntes && focoAntes.focus) focoAntes.focus();
    window.__uxFicha = null;
  }

  // ------------------------------------------------------------ arranque
  var iniciado = false;
  // 3DVista pone en la pestaña el nombre interno del recorrido: se deja el del proyecto
  function fijarTitulo() { var t = C.titulo || C.nombre; if (t && document.title !== t) document.title = t; }
  function iniciar() {
    if (iniciado) return; iniciado = true;
    fijarTitulo(); [500, 2000, 5000].forEach(function (ms) { setTimeout(fijarTitulo, ms); });
    player = window.tour.player;
    pano = (player.getByClassName('PanoramaPlayer') || [])[0];
    fetch('ux/ux-datos.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        datos = d;
        ocultarPielBeta(); montarCapa(); montarFicha();
        // sin fundido (200 ms por defecto) en los polígonos de lote: así redibujar no hace parpadear
        Object.keys(datos.lotes).forEach(function (k) {
          datos.lotes[k].vistas.forEach(function (v) {
            [v.verde, v.naranja, v.rojo].concat(v.poligonos).forEach(function (id) {
              var o = id && player.getById(id); if (o) { o.set('fadeInDuration', 0); o.set('fadeOutDuration', 0); }
            });
          });
        });
        requestAnimationFrame(cuadro);
        aplicarEstados();
        // 3DVista a veces no pinta un lote que se encendió mientras la vista o su imagen cargaban (en una red
        // lenta puede tardar). Por eso la vista actual se redibuja siempre: cada 1,5 s, y cada segundo durante
        // los primeros segundos de una vista nueva o de un cambio en la hoja. Sin fundido no parpadea
        // (medido: el lote no queda en blanco ni un cuadro al apagarlo y encenderlo).
        var ultimoRedibujo = 0;
        setInterval(function () {
          var ahora = Date.now();
          if (ahora < redibujarHasta || ahora - ultimoRedibujo >= 1500) { ultimoRedibujo = ahora; aplicarEstados(panoActual); }
          else aplicarEstados();
        }, 500);
        redibujarPor(10000);
        // cuando un panorama termina de cargar (evento «begin» del ítem) se redibujan sus lotes
        var lista = player.getById('mainPlayList');
        ((lista && lista.get('items')) || []).forEach(function (it) {
          it.bind('begin', function () {
            var m = it.get('media'); var pid = m && m.get && m.get('id'); if (!pid) return;
            redibujarPor(10000);
          });
        });
        return leerHoja();
      })
      .then(function () {
        setInterval(leerHoja, Math.max(10, C.refrescoSegundos || 15) * 1000);
        cerrarCarga();
      })
      .catch(function (e) { console.error('[' + NOMBRE + '] Error al iniciar la capa', e); cerrarCarga(); });
  }
  window.addEventListener('ux-lote', function (e) { abrirFicha(e.detail); });
  window.UX = {
    tourListo: function () { pintarCarga(90); iniciar(); },
    abrirFicha: abrirFicha, cerrarFicha: cerrarFicha, leerHoja: leerHoja, leerCsv: leerCsv, normalizar: normalizar,
    _estado: function () { return { estados: estados, hayHoja: hayHoja, panoActual: panoActual, etiquetas: elementos.length }; },
  };
  // Respaldo por si el aviso de script.js no llega (p. ej. una versión exportada de nuevo).
  var espera = setInterval(function () {
    if (window.tour && window.tour.player && (window.tour.player.getByClassName('PanoramaPlayer') || [])[0]) {
      clearInterval(espera); setTimeout(function () { if (!iniciado) { pintarCarga(90); iniciar(); } }, 4000);
    }
  }, 500);
})();
