// Prueba de la plataforma (docs/index.html) en un Chromium real.
//   node herramientas/prueba-plataforma.js <url-de-docs> <exportacion-3dvista-de-cayman>
// La URL es la de docs/ servida (local o GitHub Pages). La exportación se usa para armar .zip de prueba.
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require(['/opt/node-tools/node_modules/jszip', 'jszip'].find((m) => { try { require.resolve(m); return true; } catch (e) { return false; } }));

const URL = (process.argv[2] || 'http://localhost:8780/').replace(/\/?$/, '/');
const EXP = process.argv[3];
const RAIZ = path.join(__dirname, '..');
let pasos = 0, fallas = 0;
const ok = (c, t) => { pasos++; if (!c) fallas++; console.log((c ? 'OK    ' : 'FALLA ') + t); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plataforma-'));

async function zipDe(nombre, archivos) {
  const z = new JSZip();
  for (const [ruta, contenido] of Object.entries(archivos)) z.file(ruta, contenido);
  const f = path.join(tmp, nombre); fs.writeFileSync(f, await z.generateAsync({ type: 'nodebuffer' })); return f;
}

(async () => {
  const leer = (f) => fs.readFileSync(path.join(EXP, f), 'utf8');
  const textos = { 'script_general.js': leer('script_general.js'), 'locale/es.txt': leer('locale/es.txt'), 'script.js': leer('script.js'), 'index.htm': leer('index.htm') };
  const zOtro = await zipDe('parque-ficticio.zip', Object.fromEntries(Object.entries(textos).map(([k, v]) => ['parque-ficticio/' + k, v])));
  const zNada = await zipDe('fotos.zip', { 'foto.txt': 'no es un recorrido' });
  const zSinLotes = await zipDe('sin-lotes.zip', Object.assign({}, textos, { 'script_general.js': textos['script_general.js'].replace(/"label":"rojo /g, '"label":"lote ') }));

  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.|ERR_|net::/.test(m.text())) errores.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.route(/docs\.google\.com\/spreadsheets/, (r) => r.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: 'Lote,Estado\n17,Disponible\n44,Reservado\n19,Vendido\n' }));
  await p.goto(URL);

  // 1. Portada
  ok(await p.isVisible('#b-ver-cayman') && await p.isVisible('#b-otro'), 'PORTADA: botones «Ver el proceso con Cayman Creek» y «Usar con otro recorrido»');
  ok((await p.getAttribute('#b-abrir-cayman', 'href')) === 'cayman-creek/index.htm', 'PORTADA: enlace al Cayman Creek terminado');

  // 2. Proceso con Cayman Creek
  await p.click('#b-ver-cayman');
  await p.waitForSelector('#paso-2:not([hidden])', { timeout: 15000 });
  ok(/Compatible/.test(await p.textContent('#veredicto')), 'CAYMAN · REVISIÓN: el analizador lo declara compatible');
  const cifras = await p.$$eval('#cifras li', (ls) => ls.map((l) => l.textContent));
  ok(cifras.some((c) => /^45\s*lotes/.test(c)) && cifras.some((c) => /^2\s*vistas con lotes/.test(c)), 'CAYMAN · REVISIÓN: 45 lotes en 2 vistas (' + cifras.join(' · ') + ')');
  ok((await p.$$eval('#requisitos li.no', (l) => l.length)) === 0, 'CAYMAN · REVISIÓN: todos los requisitos en verde');
  await p.click('#b-a-config');
  ok(await p.isVisible('#paso-3'), 'CAYMAN · CONFIGURACIÓN: aparece el paso 3');
  ok(/33 de 45/.test(await p.textContent('#comparacion')), 'CAYMAN · CONFIGURACIÓN: muestra cuántas manzanas acertó el analizador (33 de 45) y que se revisaron');
  const jsonCayman = JSON.parse(await p.textContent('#json'));
  const real = JSON.parse(fs.readFileSync(path.join(RAIZ, 'proyectos', 'cayman-creek', 'proyecto.json'), 'utf8'));
  ok(JSON.stringify(jsonCayman) === JSON.stringify(real), 'CAYMAN · CONFIGURACIÓN: el proyecto.json mostrado es el mismo con que se construyó el aplicativo');
  await p.click('#b-a-resultado');
  ok(await p.isVisible('#res-cayman') && !(await p.isVisible('#res-otro')), 'CAYMAN · RESULTADO: muestra el aplicativo terminado');
  const [nueva] = await Promise.all([p.waitForEvent('framenavigated'), p.click('#b-res-abrir')]);
  await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 });
  ok(/cayman-creek\/index\.htm$/.test(p.url()) && /Cayman Creek/.test(await p.title()), 'CAYMAN · RESULTADO: «Abrir el aplicativo» abre el recorrido y carga');
  await p.goBack(); await p.waitForSelector('#b-otro');

  // 3. Otro recorrido (.zip)
  await p.click('#b-reiniciar-4').catch(() => {});
  await p.setInputFiles('#f-zip', zOtro);
  await p.waitForSelector('#paso-2:not([hidden])', { timeout: 20000 });
  ok(/Compatible/.test(await p.textContent('#veredicto')) && /Parque ficticio/i.test(await p.textContent('#r-nombre')), 'OTRO · REVISIÓN: un .zip con otra carpeta y otro nombre se analiza en el navegador');
  await p.click('#b-a-config');
  ok(!(await p.isVisible('#comparacion')), 'OTRO · CONFIGURACIÓN: sin comparación (no hay configuración revisada)');
  await p.fill('#c-nombre', 'Parque Ficticio'); await p.fill('#c-wa', '+57 300 000 0000');
  const jsonOtro = JSON.parse(await p.textContent('#json'));
  ok(jsonOtro.nombre === 'Parque Ficticio' && jsonOtro.ux.whatsapp === '573000000000', 'OTRO · CONFIGURACIÓN: el formulario actualiza el proyecto.json (WhatsApp solo con dígitos)');
  await p.fill('#c-grupos', 'A: 1-10');
  ok(/Lotes sin grupo/.test(await p.textContent('#aviso-copia')), 'OTRO · CONFIGURACIÓN: avisa si quedan lotes sin grupo');
  await p.click('#b-a-resultado');
  ok(await p.isVisible('#paso-3'), 'OTRO · CONFIGURACIÓN: no deja seguir con lotes sin grupo');
  await p.fill('#c-grupos', 'A: 1-23\nB: 24-45');
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('#b-descargar')]);
  const proyDir = path.join(tmp, 'proyecto-descargado'); fs.mkdirSync(proyDir);
  await descarga.saveAs(path.join(proyDir, 'proyecto.json'));
  ok(descarga.suggestedFilename() === 'proyecto.json', 'OTRO · CONFIGURACIÓN: «Descargar proyecto.json» entrega el archivo');
  await p.click('#b-a-resultado');
  ok(await p.isVisible('#res-otro') && /proyectos\/parque-ficticio/.test(await p.textContent('#orden-construir')), 'OTRO · RESULTADO: muestra cómo construirlo con el motor');

  // 4. De punta a punta: lo descargado construye con el motor
  let construyo = false, salida = '';
  try {
    salida = execFileSync('python3', ['-I', path.join(RAIZ, 'motor-3dvista', 'motor', 'construir.py'), proyDir, EXP, path.join(tmp, 'salida')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    construyo = /listo:/.test(salida);
  } catch (e) { salida = String(e.stdout || '') + String(e.stderr || ''); }
  ok(construyo && fs.existsSync(path.join(tmp, 'salida', 'tour', 'ux', 'ux-config.js')), 'PUNTA A PUNTA: el proyecto.json descargado de la página construye con el motor' + (construyo ? '' : ': ' + salida.slice(-200)));
  if (construyo) {
    const cfg = fs.readFileSync(path.join(tmp, 'salida', 'tour', 'ux', 'ux-config.js'), 'utf8');
    ok(/"nombre": "Parque Ficticio"/.test(cfg) && /573000000000/.test(cfg), 'PUNTA A PUNTA: el aplicativo construido lleva el nombre y el WhatsApp del formulario');
  }

  // 5. Archivos que no sirven
  await p.click('#b-reiniciar-4');
  await p.setInputFiles('#f-zip', zNada);
  await p.waitForFunction(() => /script_general/.test(document.querySelector('#estado-carga').textContent), null, { timeout: 15000 });
  ok(await p.isVisible('#paso-1') && /no parece una exportación/.test(await p.textContent('#estado-carga')), 'NO COMPATIBLE: un .zip que no es de 3DVista lo dice claro y no avanza');
  await p.setInputFiles('#f-zip', zSinLotes);
  await p.waitForSelector('#paso-2:not([hidden])', { timeout: 15000 });
  ok(/Todavía no es compatible/.test(await p.textContent('#veredicto')) && await p.isDisabled('#b-a-config'), 'NO COMPATIBLE: sin polígonos «rojo N» lo marca en rojo y no deja seguir');
  ok(/rojo 1/.test(await p.textContent('#requisitos')), 'NO COMPATIBLE: explica qué hacer en 3DVista (overlays «rojo 1», «rojo 2»…)');

  // 6. Teléfono
  const m = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await m.route(/fonts\./, (r) => r.abort());
  await m.goto(URL);
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'TELÉFONO: la plataforma no se desborda a lo ancho');
  await m.click('#b-ver-cayman'); await m.waitForSelector('#paso-2:not([hidden])', { timeout: 15000 });
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'TELÉFONO: el proceso con Cayman Creek tampoco se desborda');
  await m.screenshot({ path: path.join(tmp, 'telefono.png') });

  ok(errores.length === 0, 'SIN ERRORES de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(`\n${pasos - fallas}/${pasos} verificaciones pasaron`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
