// Prueba funcional de Cayman Creek optimizado, en un Chromium real.
//   node pruebas/prueba-cayman.js <url-del-tour> <carpeta-capturas>
// Sirve una hoja de prueba en lugar de la hoja publicada y verifica cada parte.
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// el motor 3DVista (de EDITOR): por defecto, carpeta hermana; o la ruta en MOTOR_3DVISTA
const MOTOR = process.env.MOTOR_3DVISTA || [path.join(__dirname, '..', '..', '..', 'motor-3dvista'), path.join(__dirname, '..', '..', '03-EDITOR', 'editor', 'motor-3dvista'), path.join(__dirname, '..', '..', 'motor-3dvista')]
  .find((m) => fs.existsSync(path.join(m, 'motor', 'muestrear.py')));

const URL = process.argv[2] || 'http://localhost:8770/index.htm';
const CAP = process.argv[3] || 'capturas';
fs.mkdirSync(CAP, { recursive: true });
let hoja = 'Lote,Estado,Precio,Nota\n17,Disponible,180000000,Frente a la zona verde\n44,Reservado,,\n19,Vendido,,\n20,Vendido,,\n21,Vendido,,\n40,Disponible,,\n41,Disponible,,\n42,Disponible,,\n43,Disponible,,\n45,Reservado,,\n15,Disponible,,\n16,Disponible,,\n18,Vendido,,\n';
let fallas = 0, pasos = 0;
const ok = (c, m) => { pasos++; console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fallas++; };
const HOJA = /docs\.google\.com\/spreadsheets/;

async function abrir(b, opciones, nombre) {
  const ctx = await b.newContext(opciones);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  // 3DVista avisa que no hay giroscopio en el navegador de prueba (sin sensores): no es un error del recorrido
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|net::|status of 404|Failed to recalculate device parameters|Sensor could not be read/.test(m.text())) errores.push(m.text()); });
  p.on('response', (r) => { if (r.status() === 404 && !/favicon/.test(r.url())) errores.push('404 ' + r.url()); });
  await p.route(HOJA, (r) => r.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: hoja }));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());   // sin red externa en la prueba
  await p.goto(URL);
  return { p, errores, ctx };
}

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { p, errores } = await abrir(b, { viewport: { width: 1440, height: 900 } });

  // 1. Pantalla de carga
  await p.waitForSelector('#ux-carga', { timeout: 10000 });
  await p.waitForTimeout(700);
  ok(await p.isVisible('#ux-carga'), 'CARGA: la pantalla de carga propia aparece al abrir');
  ok(!(await p.$('#preloadContainer')), 'CARGA: ya no está el «Loading virtual tour. Please wait...» de la beta');
  await p.screenshot({ path: path.join(CAP, '01-carga.png') });
  await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 });
  await p.waitForTimeout(900);
  ok(!(await p.isVisible('#ux-carga')), 'CARGA: se retira sola cuando el recorrido está listo');
  ok((await p.textContent('#ux-carga-pct')) === '100', 'CARGA: llega al 100 %');
  await p.waitForTimeout(5500);
  ok((await p.title()) === 'Cayman Creek · Complejo campestre · Km 30 Vía al Mar', 'CARGA: la pestaña muestra el nombre del proyecto, no el interno de 3DVista (' + (await p.title()) + ')');

  // 2. Encabezado
  ok((await p.$$('.ux-icono')).length === 4, 'ENCABEZADO: 4 íconos (info, ubicación, galería, plano)');
  ok(await p.isVisible('.ux-logo'), 'ENCABEZADO: logo flotante arriba al centro');
  ok((await p.getAttribute('.ux-contacto', 'href')).startsWith('https://wa.me/573054443180'), 'ENCABEZADO: «Contactar con asesor» abre WhatsApp 305 444 3180');
  const pielVieja = await p.evaluate(() => {
    const pl = window.tour.player;
    return pl.getByClassName('Container').filter((c) => /093D90E6482C$/.test(c.get('id') || '')).map((c) => c.get('visible'));
  });
  ok(pielVieja.length === 1 && pielVieja[0] === false, 'ENCABEZADO: la franja verde con hojas de la beta queda oculta');

  // 3. Estados de la hoja
  await p.waitForFunction(() => window.__uxHoja, null, { timeout: 20000 });
  const mapa = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'salida', 'tour', 'ux', 'ux-datos.json'), 'utf8'));
  const enc = (n) => p.evaluate((l) => {
    const pl = window.tour.player; const on = (id) => !!(pl.getById(id) && pl.getById(id).get('enabled'));
    return l.vistas.map((v) => ({ verde: on(v.verde), naranja: on(v.naranja), rojo: on(v.rojo), pol: v.poligonos.some(on) }));
  }, mapa.lotes[n]);
  const solo = (vs, k) => vs.length > 0 && vs.every((v) => ['verde', 'naranja', 'rojo', 'pol'].every((x) => v[x] === (x === k)));
  ok(solo(await enc(17), 'verde'), 'LOTES: el 17 «Disponible» queda VERDE en todas sus vistas');
  ok(solo(await enc(44), 'naranja'), 'LOTES: el 44 «Reservado» queda NARANJA');
  ok(solo(await enc(19), 'rojo'), 'LOTES: el 19 «Vendido» queda ROJO');
  ok(solo(await enc(1), 'pol'), 'LOTES: el 1 sin estado conserva su polígono original');

  // 3a. Lo que se VE en pantalla (no solo el estado interno): 3DVista a veces no dibuja un lote encendido
  const colorEsperado = { disponible: 'verde', reservado: 'naranja', vendido: 'rojo' };
  const colorDe = ([h, sat]) => sat < 0.25 ? 'gris' : (h >= 70 && h <= 170 ? 'verde' : h >= 18 && h < 55 ? 'naranja' : (h < 18 || h > 330) ? 'rojo' : 'otro');
  // En un equipo lento 3DVista tarda varios segundos en dibujar un lote ya encendido (medido en Windows:
  // entre 3 y 10 s). Se mira a los 4 s y, si algo no coincide, otra vez cada segundo hasta los 15 s.
  // Un lote que de verdad no se pinta sigue fallando; la foto que queda es la última.
  async function coloresEnPantalla(nombreFoto, limiteMs = 15000) {
    const t0 = Date.now();
    await p.waitForTimeout(4000);
    let c = await muestraDeColores(nombreFoto);
    while (c.malos.length && Date.now() - t0 < limiteMs) {
      await p.waitForTimeout(1000);
      c = await muestraDeColores(nombreFoto);
    }
    c.segundos = Math.round((Date.now() - t0) / 1000);
    return c;
  }
  async function muestraDeColores(nombreFoto) {
    const r = await p.evaluate((lotes) => {
      const P = window.tour.player; const pl = P.getByClassName('PanoramaPlayer')[0]; const pid = pl.get('panorama').get('id');
      const est = window.UX._estado().estados; const out = {};
      Object.keys(lotes).forEach((n) => {
        const e = est[n] || est[+n]; if (!e || e === 'sin') return;
        const v = lotes[n].vistas.find((x) => x.pano === pid); if (!v) return;
        const it = P.getById(v.verde).get('items')[0]; const s = pl.getScreenPosition(it.get('yaw'), it.get('pitch'));
        if (s && s.x > 30 && s.y > 130 && s.x < innerWidth - 30 && s.y < innerHeight - 70) out[n] = { xy: [s.x, s.y], e };
      });
      return out;
    }, mapa.lotes);
    // las etiquetas HTML pueden tapar el centro del polígono: se ocultan solo para la foto
    await p.evaluate(() => { document.getElementById('ux-etiquetas').style.visibility = 'hidden'; });
    await p.waitForTimeout(300);
    const foto = path.join(CAP, nombreFoto); await p.screenshot({ path: foto });
    await p.evaluate(() => { document.getElementById('ux-etiquetas').style.visibility = ''; });
    const pts = Object.fromEntries(Object.entries(r).map(([n, x]) => [n, x.xy]));
    const tonos = JSON.parse(execFileSync('python3', [path.join(MOTOR, 'motor', 'muestrear.py'), foto, JSON.stringify(pts)]).toString());
    const malos = Object.entries(tonos).filter(([n, t]) => colorDe(t) !== colorEsperado[r[n].e]).map(([n, t]) => n + ' ' + r[n].e + '→' + colorDe(t) + JSON.stringify(t));
    return { revisados: Object.keys(tonos).length, malos };
  }
  const c1 = await coloresEnPantalla('02b-colores-vista-1.png');
  ok(c1.revisados >= 5 && c1.malos.length === 0, 'PANTALLA: en la vista aérea 1 los lotes se VEN con el color de la hoja (' + c1.revisados + ' revisados en ' + c1.segundos + ' s' + (c1.malos.length ? '; mal: ' + c1.malos.join(', ') : '') + ')');

  // 3b. Bug de la beta: «rojo 6» y «rojo 39» eran grises; ahora usan un rojo de verdad
  const sg = fs.readFileSync(path.join(__dirname, '..', 'salida', 'tour', 'script_general.js'), 'utf8');
  // todas las apariciones del polígono «rojo N» (una por vista): alguna debe usar la versión roja corregida
  const urlsRojo = (n) => { const out = []; let i = -1; while ((i = sg.indexOf('"label":"rojo ' + n + '"', i + 1)) >= 0) { const ini = sg.lastIndexOf('"url":"', i); out.push(sg.slice(ini + 7, sg.indexOf('"', ini + 7))); } return out; };
  ok([6, 39].every((n) => urlsRojo(n).some((u) => /estados\/.+_rojo\.webp$/.test(u))), 'LOTES: los polígonos rojos de los lotes 6 y 39 (grises en la beta) quedan rojos');

  // 4. Etiquetas, manzanas y navegación de la vista inicial
  const etq = await p.evaluate(() => ({
    pildoras: [...document.querySelectorAll('#ux-etiquetas .ux-e:not([hidden]) .ux-pildora, #ux-etiquetas .ux-nav:not([hidden])')].map((e) => e.textContent.trim()),
    manzanas: [...document.querySelectorAll('#ux-etiquetas .ux-e:not([hidden]) .ux-manzana')].map((e) => e.textContent.trim()),
    marcas: [...document.querySelectorAll('#ux-etiquetas .ux-e:not([hidden]) .ux-marca')].map((e) => e.textContent.trim()),
  }));
  ok(etq.pildoras.some((t) => /Vista aérea/.test(t)), 'NAVEGACIÓN: el acceso «Vista aérea» se ve en la vista inicial (no queda tapado por el logo)');
  ok(etq.pildoras.length >= 4, 'ETIQUETAS: se ven etiquetas de lugares en la vista inicial (' + etq.pildoras.slice(0, 6).join(', ') + ')');
  ok(etq.manzanas.length >= 1, 'MANZANAS: se ven etiquetas de manzana (' + etq.manzanas.join(', ') + ')');
  const placas = await p.evaluate(() => window.tour.player.getByClassName('HotspotPanoramaOverlay').filter((o) => /^(LOBBY|ZONA COMERCIAL)$/.test((o.get('data') || {}).label || '')).map((o) => o.get('enabled')));
  ok(placas.length > 0 && placas.every((x) => x === false), 'ETIQUETAS: las placas verdes 3D de la beta quedan apagadas');
  await p.screenshot({ path: path.join(CAP, '02-vista-inicial.png') });

  // 5. Ficha del lote: clic real en el área del polígono
  const clic = (id) => p.evaluate((oid) => { const a = window.tour.player.getById(oid).get('areas')[0]; if (!a.hasBindings('click')) return false; a.trigger('click'); return true; }, id);
  ok(await clic(mapa.lotes[17].vistas[0].verde), 'FICHA: el polígono del lote 17 tiene acción de clic');
  await p.waitForTimeout(500);
  ok(await p.isVisible('.ux-velo.ux-abierta .ux-ficha'), 'FICHA: se abre al tocar el lote');
  const f = await p.evaluate(() => ({ lote: document.getElementById('ux-f-lote').textContent, mz: document.getElementById('ux-f-manzana').textContent,
    area: document.getElementById('ux-f-area').textContent, est: document.getElementById('ux-f-estado').textContent, disp: document.getElementById('ux-f-disp').textContent,
    renta: document.getElementById('ux-f-renta').textContent, sep: document.getElementById('ux-f-separa').textContent, nota: document.getElementById('ux-f-nota').textContent,
    wa: document.getElementById('ux-f-wa').href, anio: document.getElementById('ux-f-anio').textContent }));
  ok(f.lote === 'Lote 17' && f.mz === 'Manzana D', 'FICHA: «Lote 17 · Manzana D» como en el video');
  ok(f.area.replace(/\s/g, '') === '887m²', 'FICHA: 887 m², el área real del lote 17');
  ok(f.est === 'Disponible' && f.renta === '112,5 %' && f.anio === '2028', 'FICHA: estado, rentabilidad 112,5 % y proyección 2028');
  ok(f.disp === '7', 'FICHA: «Lotes disponibles» se cuenta desde la hoja (7 en la hoja de prueba)');
  ok(f.sep.includes('$ 180.000.000') && f.sep.includes('$5.000.000'), 'FICHA: precio de la hoja y separación de $5.000.000');
  ok(f.nota === 'Frente a la zona verde', 'FICHA: la nota de la hoja aparece');
  ok(f.wa.startsWith('https://wa.me/573054443180') && decodeURIComponent(f.wa).includes('lote 17 (Manzana D'), 'FICHA: WhatsApp con el lote y la manzana en el mensaje');
  await p.screenshot({ path: path.join(CAP, '03-ficha-lote.png') });
  const salida = [];
  for (let k = 0; k < 6; k++) { await p.keyboard.press('Tab'); salida.push(await p.evaluate(() => !!(document.activeElement && document.activeElement.closest('.ux-ficha')))); }
  ok(salida.every(Boolean), 'FICHA: con el teclado, el Tab se queda dentro de la ficha (es modal)');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  ok(!(await p.isVisible('.ux-velo.ux-abierta')), 'FICHA: se cierra con Esc');

  await clic(mapa.lotes[19].vistas[0].rojo); await p.waitForTimeout(400);
  ok((await p.textContent('#ux-f-wa-texto')) === 'Preguntar por lotes disponibles' && (await p.textContent('#ux-f-estado')) === 'Vendido', 'FICHA: un lote vendido lo dice y ofrece lotes disponibles');
  await p.screenshot({ path: path.join(CAP, '04-ficha-vendido.png') });
  await p.click('.ux-cerrar'); await p.waitForTimeout(300);
  ok(!(await p.isVisible('.ux-velo.ux-abierta')), 'FICHA: se cierra con la X');

  // 6. Hoja en vivo
  hoja = 'Lote,Estado\n17,Vendido\n1,Disponible\n';
  await p.evaluate(() => window.UX.leerHoja()); await p.waitForTimeout(500);
  ok(solo(await enc(17), 'rojo') && solo(await enc(1), 'verde'), 'EN VIVO: al cambiar la hoja, el 17 pasa a rojo y el 1 a verde sin recargar');
  hoja = 'lote;estado\n17;Reservado\n';
  await p.evaluate(() => window.UX.leerHoja()); await p.waitForTimeout(500);
  ok(solo(await enc(17), 'naranja'), 'EN VIVO: una hoja de Excel en español (con «;») también se lee');
  hoja = '"Lote","Estado"\n"17","Disponible, con vista"\n';
  await p.evaluate(() => window.UX.leerHoja()); await p.waitForTimeout(500);
  ok(solo(await enc(17), 'verde'), 'HOJA: un estado con coma dentro de comillas no rompe la lectura (bug de la beta)');
  hoja = 'Lote,Estado,Precio,Nota\n17,Disponible,,\n44,Reservado,,\n19,Vendido,,\n20,Vendido,,\n21,Vendido,,\n40,Disponible,,\n41,Disponible,,\n42,Disponible,,\n43,Disponible,,\n45,Reservado,,\n15,Disponible,,\n16,Disponible,,\n18,Vendido,,\n';
  await p.evaluate(() => window.UX.leerHoja()); await p.waitForTimeout(400);

  // 7. Navegación a la otra vista aérea
  const nav = await p.$$eval('.ux-nav', (els) => els.filter((e) => !e.hidden).map((e) => e.textContent.trim()));
  ok(nav.some((t) => /Vista aérea/.test(t)), 'NAVEGACIÓN: hay acceso «Vista aérea · …» (' + nav.join(', ') + ')');
  const pid0 = await p.evaluate(() => window.UX._estado().panoActual);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.ux-nav')].find((e) => /Vista aérea/.test(e.textContent)); b.click(); });
  await p.waitForTimeout(6000);
  const pid1 = await p.evaluate(() => window.UX._estado().panoActual);
  ok(pid1 && pid1 !== pid0, 'NAVEGACIÓN: el acceso lleva a la otra vista aérea y las etiquetas se rehacen');
  await p.waitForFunction((pid) => window.__uxEstados && window.tour.player.getById('mainPlayList').get('selectedIndex') === 2, pid1, { timeout: 30000 });
  await p.waitForTimeout(6000);
  const cam = await p.evaluate(() => { const x = window.tour.player.getByClassName('PanoramaPlayer')[0]; return [x.get('yaw'), x.get('pitch')]; });
  ok(Math.abs(cam[0] - (-18.5)) < 3 && Math.abs(cam[1] - (-24)) < 3, 'NAVEGACIÓN: la vista aérea 2 abre mirando a los lotes (yaw ' + cam.map((v) => v.toFixed(1)).join(', ') + '), sin girar 360°');
  ok(solo(await enc(17), 'verde') && solo(await enc(44), 'naranja') && solo(await enc(19), 'rojo'), 'NAVEGACIÓN: en la vista aérea 2 los lotes conservan su color');
  const c2 = await coloresEnPantalla('05b-colores-vista-2.png');
  ok(c2.revisados >= 8 && c2.malos.length === 0, 'PANTALLA: en la vista aérea 2 los lotes se VEN con el color de la hoja (' + c2.revisados + ' revisados en ' + c2.segundos + ' s' + (c2.malos.length ? '; mal: ' + c2.malos.join(', ') : '') + ')');
  await p.screenshot({ path: path.join(CAP, '05-otra-vista.png') });

  // 7b. Ventanas de la beta: las etiquetas no se montan encima
  await p.evaluate(() => { window.tour.player.getByClassName('IconButton').find((x) => ((x.get('data') || {}).name || '') === 'IconButton Location').trigger('click'); });
  const oculto = await p.waitForFunction(() => document.getElementById('ux-etiquetas').hidden, null, { timeout: 10000 }).then(() => true, () => false);
  ok(await p.evaluate(() => !window.tour.player.getByClassName('Container').some((c) => /093D90E6482C(_mobile)?$/.test(c.get('id') || '') && c.get('visible'))), 'VENTANAS: la franja vieja de la beta no reaparece al abrir una ventana');
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ux-contacto')).pointerEvents === 'none'), 'VENTANAS: el botón de contacto se aparta para no tapar el «×» de la ventana');
  ok(oculto, 'VENTANAS: con «Ubicación» abierta las etiquetas del recorrido se ocultan');

  // 7c. Números de lote: la beta repetía «38» y «34»; ahora cada número aparece una sola vez por vista
  const dup = Object.entries(mapa.panoramas).map(([k, v]) => { const n = v.numeros.map((x) => x.lote); return n.filter((x, i) => n.indexOf(x) !== i); }).flat();
  ok(dup.length === 0, 'NÚMEROS: ningún número de lote repetido en una misma vista' + (dup.length ? ' (' + dup.join(', ') + ')' : ''));

  // 8. Teléfono
  const m = await abrir(b, { ...devices['iPhone 13'] });
  await m.p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 });
  await m.p.waitForTimeout(2500);
  const ancho = await m.p.evaluate(() => document.documentElement.scrollWidth);
  ok(ancho <= 390, 'TELÉFONO: sin desplazamiento horizontal');
  ok(await m.p.evaluate(() => performance.getEntriesByType('resource').some((r) => /script_mobile\.js/.test(r.name))), 'TELÉFONO: carga la versión móvil del recorrido');
  ok(await m.p.evaluate(() => !window.tour.player.getByClassName('Container').some((c) => /093D90E6482C_mobile$/.test(c.get('id') || '') && c.get('visible'))), 'TELÉFONO: la franja vieja de la beta tampoco aparece en la versión móvil');
  ok(await m.p.evaluate(() => !window.tour.player.getByClassName('Container').some((c) => /1F440C77CBF2(_mobile)?$/.test(c.get('id') || '') && c.get('visible'))), 'TELÉFONO: no aparece la bienvenida vieja de la beta con «38 disponibles» fijo');
  const choque = await m.p.evaluate(() => { const l = document.querySelector('.ux-logo').getBoundingClientRect(); return [...document.querySelectorAll('.ux-icono')].some((i) => { const r = i.getBoundingClientRect(); return r.right > l.left && r.left < l.right && r.bottom > l.top && r.top < l.bottom; }); });
  ok(!choque, 'TELÉFONO: el logo no tapa los íconos del encabezado');
  const camMovil = await m.p.evaluate(() => window.tour.player.getByClassName('PanoramaPlayer')[0].get('pitch'));
  ok(camMovil < -25, 'TELÉFONO: la cámara inicial mira a los lotes, no al cielo (pitch ' + camMovil.toFixed(1) + ')');
  await m.p.screenshot({ path: path.join(CAP, '06-telefono.png') });
  await m.p.evaluate((id) => { window.tour.player.getById(id).get('areas')[0].trigger('click'); }, mapa.lotes[44].vistas[0].naranja);
  await m.p.waitForTimeout(600);
  const fichaCabe = await m.p.evaluate(() => { const r = document.querySelector('.ux-ficha').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  ok(fichaCabe, 'TELÉFONO: la ficha cabe en la pantalla');
  await m.p.screenshot({ path: path.join(CAP, '07-telefono-ficha.png') });

  const pielPedida = await p.evaluate(() => performance.getEntriesByType('resource').filter((r) => /skin\/(Container_(705CB726|66DE94D3|6653B3E3)|Image_(42C931DC|6D9F35BF))/.test(r.name)).length)
    + await m.p.evaluate(() => performance.getEntriesByType('resource').filter((r) => /skin\/(Container_(705CB726|66DE94D3|6653B3E3)|Image_(42C931DC|6D9F35BF))/.test(r.name)).length);
  ok(pielPedida === 0, 'PESO: no se descargan las imágenes de la piel vieja (~7 MB que nunca se ven)');
  ok(errores.length === 0 && m.errores.length === 0, 'SIN ERRORES de JavaScript' + (errores.concat(m.errores).length ? ': ' + errores.concat(m.errores).slice(0, 3).join(' | ') : ''));
  console.log(`\n${pasos - fallas}/${pasos} verificaciones pasaron`);
  await b.close();
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('FALLA GENERAL', e); process.exit(1); });
