// Prueba del editor dentro de los archivos (motor-3dvista/editor/editar.js) con una exportación real.
//   node motor-3dvista/pruebas/prueba-editor.js <carpeta-exportacion-3dvista>
// Arma un .zip de la exportación (con sus entradas de carpeta), lo edita y comprueba la identidad
// del .zip y que el reproductor real de 3DVista muestre los cambios.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const JSZip = require(['/opt/node-tools/node_modules/jszip', 'jszip'].find((m) => { try { require.resolve(m); return true; } catch (e) { return false; } }));
const E = require('../editor/editar.js');

const EXP = process.argv[2];
let pasos = 0, fallas = 0;
const ok = (c, t) => { pasos++; if (!c) fallas++; console.log((c ? 'OK    ' : 'FALLA ') + t); };

async function zipDeCarpeta(dir, raiz) {
  const z = new JSZip(); const orden = [];
  (function andar(rel) {
    const abs = path.join(dir, rel);
    for (const n of fs.readdirSync(abs).sort()) {
      const r = rel ? rel + '/' + n : n;
      if (fs.statSync(path.join(dir, r)).isDirectory()) { z.folder(raiz + r); orden.push(raiz + r + '/'); andar(r); }
      else { z.file(raiz + r, fs.readFileSync(path.join(dir, r))); orden.push(raiz + r); }
    }
  })('');
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-'));
  const original = await zipDeCarpeta(EXP, 'recorrido/');
  const zOrig = await JSZip.loadAsync(original, { createFolders: false });
  const nombres = Object.keys(zOrig.files);
  const leer = (z, f) => z.file('recorrido/' + f).async('string');
  const textos = {};
  for (const f of ['script_general.js', 'script_mobile.js', 'locale/es.txt']) textos[f] = await leer(zOrig, f);

  // 1. Lectura
  const lotes = E.lotes(textos);
  ok(lotes.length === 45 && lotes.every((l) => l.estado === 'disponible' && l.poligonos === 4), 'LECTURA: 45 lotes con 4 polígonos cada uno (2 vistas × computador y teléfono), todos disponibles en el original');
  ok(E.whatsappActual(textos) === '573054443180', 'LECTURA: encuentra el WhatsApp del recorrido (' + E.whatsappActual(textos) + ')');

  // 2. Cambios dentro de los archivos
  const r = E.aplicar(textos, { estados: { 3: 'vendido', 9: 'vendido', 44: 'vendido', 5: 'disponible' }, whatsapp: '+57 300 111 2233' });
  ok(JSON.stringify(Object.keys(r.archivos).sort()) === JSON.stringify(['locale/es.txt', 'script_general.js', 'script_mobile.js']), 'CAMBIOS: solo se tocan los dos scripts y el texto (' + Object.keys(r.archivos).join(', ') + ')');
  ok(r.resumen.lotes.map((l) => l.lote).join(',') === '3,9,44', 'CAMBIOS: el 5 ya estaba disponible y no cuenta como cambio');
  const despues = Object.assign({}, textos, r.archivos);
  const est = Object.fromEntries(E.lotes(despues).map((l) => [l.lote, l.estado]));
  ok(est[3] === 'vendido' && est[9] === 'vendido' && est[44] === 'vendido' && est[4] === 'disponible', 'CAMBIOS: al releer, 3, 9 y 44 quedan vendidos y el resto disponible');
  ok(r.resumen.whatsapp === 2 && !/573054443180/.test(despues['locale/es.txt']) && /wa\.me\/573001112233/.test(despues['locale/es.txt']), 'CAMBIOS: el WhatsApp cambia en sus 2 enlaces');
  const largo = (a, b) => Math.abs(a.length - b.length);
  ok(largo(despues['script_general.js'], textos['script_general.js']) === 0, 'CAMBIOS: el script cambia solo por dentro (mismo tamaño: true/false y false/true se compensan en cada polígono)');

  // 3. Ida y vuelta
  const vuelta = E.aplicar(despues, { estados: { 3: 'disponible', 9: 'disponible', 44: 'disponible' }, whatsapp: '573054443180' });
  const final = Object.assign({}, despues, vuelta.archivos);
  ok(['script_general.js', 'script_mobile.js', 'locale/es.txt'].every((f) => final[f] === textos[f]), 'IDA Y VUELTA: vender y volver a dejar disponible devuelve los archivos originales byte a byte');

  // 3b. Reservado: mismo polígono encendido, imagen pintada de naranja dentro del mismo archivo
  const res = E.aplicar(textos, { estados: { 44: 'reservado', 3: 'vendido' } });
  const conRes = Object.assign({}, textos, res.archivos);
  const estR = Object.fromEntries(E.lotes(conRes).map((l) => [l.lote, l.estado]));
  ok(estR[44] === 'reservado' && estR[3] === 'vendido' && estR[4] === 'disponible', 'RESERVADO: al releer, el 44 queda reservado, el 3 vendido y el resto disponible');
  const imgs = Object.entries(res.imagenes);
  ok(imgs.length === 2 && imgs.every(([ruta, c]) => c === 'naranja' && /^media\/.+\.webp$/.test(ruta) && conRes['script_general.js'].includes('"url":"' + ruta + '?reservado"')), 'RESERVADO: pide pintar de naranja solo las 2 imágenes del lote 44 (una por vista), marcadas con «?reservado» en la URL');
  const salirRes = E.aplicar(conRes, { estados: { 44: 'disponible', 3: 'disponible' } });
  const tras = Object.assign({}, conRes, salirRes.archivos);
  ok(['script_general.js', 'script_mobile.js'].every((f) => tras[f] === textos[f]) && Object.values(salirRes.imagenes).length === 2 && Object.values(salirRes.imagenes).every((c) => c === 'rojo'), 'RESERVADO · IDA Y VUELTA: al volver a disponible los scripts quedan idénticos al original y las 2 imágenes vuelven a rojo');
  const v44 = Object.assign({}, textos, E.aplicar(textos, { estados: { 44: 'vendido' } }).archivos);
  const deVaR = E.aplicar(v44, { estados: { 44: 'reservado' } }), deRaV = E.aplicar(Object.assign({}, v44, deVaR.archivos), { estados: { 44: 'vendido' } });
  ok(Object.assign({}, v44, deVaR.archivos, deRaV.archivos)['script_general.js'] === v44['script_general.js'] && Object.values(deVaR.imagenes).every((c) => c === 'naranja') && Object.values(deRaV.imagenes).every((c) => c === 'rojo'), 'RESERVADO: de vendido a reservado y de vuelta a vendido, el script queda igual y la imagen va a naranja y vuelve a rojo');
  const px = new Uint8ClampedArray([200, 0, 0, 100, 128, 128, 128, 255, 0, 0, 0, 0]);
  E.recolorearPixeles(px, 'naranja'); const naranja = Array.from(px);
  E.recolorearPixeles(px, 'rojo');
  ok(naranja.join() === '200,100,0,100,128,128,128,255,0,0,0,0' && Array.from(px).join() === '200,0,0,100,128,128,128,255,0,0,0,0', 'RESERVADO · COLOR: el rojo puro pasa a naranja (tono 30°) y vuelve a rojo; grises y transparentes no se tocan');

  // 4. Identidad del .zip
  const t0 = Date.now();
  const sal = await E.rearmar(JSZip, original, r.archivos, 'recorrido/');
  const ms = Date.now() - t0;
  const zNuevo = await JSZip.loadAsync(sal.zip, { createFolders: false });
  const nuevos = Object.keys(zNuevo.files);
  ok(nuevos.length === nombres.length && nuevos.every((n, i) => n === nombres[i]), 'IDENTIDAD: ' + nombres.length + ' entradas entran y ' + nuevos.length + ' salen, mismos nombres y mismo orden (carpetas incluidas: ' + nombres.filter((n) => n.endsWith('/')).length + ')');
  let distintos = [];
  for (const n of nombres) {
    if (zOrig.files[n].dir) continue;
    const [a, b] = await Promise.all([zOrig.file(n).async('nodebuffer'), zNuevo.file(n).async('nodebuffer')]);
    if (!a.equals(b)) distintos.push(n.replace('recorrido/', ''));
  }
  ok(JSON.stringify(distintos.sort()) === JSON.stringify(['locale/es.txt', 'script_general.js', 'script_mobile.js']), 'IDENTIDAD: solo ' + distintos.length + ' archivos difieren por dentro (' + distintos.join(', ') + ')');
  let rechazado = false;
  try { await E.rearmar(JSZip, original, { 'no-existe.js': 'x' }, 'recorrido/'); } catch (e) { rechazado = /no_esta_en_zip/.test(e.message); }
  ok(rechazado, 'IDENTIDAD: no deja agregar un archivo que el .zip no tenía');
  console.log('      rearmar ' + (original.length / 1e6).toFixed(0) + ' MB tardó ' + (ms / 1000).toFixed(1) + ' s');

  // 5. El reproductor real de 3DVista
  const dir = path.join(tmp, 'sitio');
  for (const n of nuevos) {
    const destino = path.join(dir, n.replace('recorrido/', ''));
    if (zNuevo.files[n].dir) { fs.mkdirSync(destino, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, await zNuevo.file(n).async('nodebuffer'));
  }
  const tipos = { '.htm': 'text/html', '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const srv = http.createServer((q, s) => {
    const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => { if (e) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); s.end(d); });
  }).listen(0);
  const puerto = srv.address().port;
  const { chromium } = require('playwright');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errores = []; p.on('pageerror', (e) => errores.push(e.message));
  // la hoja de la beta sobrescribiría los estados: aquí no hay hoja (el editor guarda el estado en los archivos)
  await p.route(/docs\.google\.com/, (q) => q.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: 'Lote,Estado\n' }));
  await p.goto('http://localhost:' + puerto + '/index.htm');
  await p.waitForFunction(() => window.tour && window.tour.player && window.tour.player.getById('mainPlayList'), null, { timeout: 90000 });
  await p.waitForTimeout(8000);
  const vivo = await p.evaluate(() => {
    const P = window.tour.player, o = {};
    P.getByClassName('HotspotPanoramaOverlay').forEach((x) => { const d = x.get('data') || {}; const m = /^rojo (\d+)$/.exec(d.label || ''); if (m) (o[m[1]] = o[m[1]] || []).push(x.get('enabled')); });
    return o;
  });
  ok(vivo[3] && vivo[3].every(Boolean) && vivo[44].every(Boolean) && vivo[4].every((v) => !v), 'REPRODUCTOR: el 3DVista real abre el .zip editado con 3 y 44 vendidos y el 4 disponible');
  ok(errores.length === 0, 'REPRODUCTOR: sin errores de página' + (errores.length ? ': ' + errores.slice(0, 2).join(' | ') : ''));
  await b.close(); srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${pasos - fallas}/${pasos} verificaciones pasaron`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
