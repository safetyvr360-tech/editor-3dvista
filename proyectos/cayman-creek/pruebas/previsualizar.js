// Captura cada parte de Cayman Creek para revisión visual.
//   node herramientas/previsualizar.js <url-del-tour> <carpeta>
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8770/index.htm';
const DIR = process.argv[3] || 'previsualizaciones';
fs.mkdirSync(DIR, { recursive: true });
const hoja = 'Lote,Estado,Precio,Nota\n' + Array.from({ length: 45 }, (_, i) => {
  const n = i + 1; const e = [19, 20, 21, 18, 3, 9, 33, 30].includes(n) ? 'Vendido' : [44, 45, 25, 12, 36].includes(n) ? 'Reservado' : 'Disponible';
  return `${n},${e},,`;
}).join('\n');

async function pagina(b, opts) {
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  await p.route(/docs\.google\.com\/spreadsheets/, (r) => r.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: hoja }));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(URL);
  return p;
}
const shot = (p, n) => p.screenshot({ path: path.join(DIR, n) });
const icono = (p, nombre) => p.evaluate((n) => { const b = window.tour.player.getByClassName('IconButton').find((x) => ((x.get('data') || {}).name || '') === 'IconButton ' + n); b.trigger('click'); }, nombre);
const lote = (p, n, color) => p.evaluate(([n, color]) => fetch('ux/ux-datos.json').then((r) => r.json()).then((d) => { window.tour.player.getById(d.lotes[n].vistas[0][color]).get('areas')[0].trigger('click'); }), [n, color]);
const estadoLote = (p, n) => p.evaluate((n) => fetch('ux/ux-datos.json').then((r) => r.json()).then((d) => d.lotes[n].vistas.map((v) => ['verde', 'naranja', 'rojo'].filter((k) => window.tour.player.getById(v[k]).get('enabled')).join('') || 'ninguno')), n);

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await pagina(b, { viewport: { width: 1440, height: 900 } });
  await p.waitForTimeout(1200); await shot(p, '01-pantalla-de-carga.png');
  await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 });
  await p.waitForTimeout(12000);
  console.log('lotes cercanos al capturar:', JSON.stringify({ 15: await estadoLote(p, 15), 42: await estadoLote(p, 42), 44: await estadoLote(p, 44), 19: await estadoLote(p, 19) }));
  await shot(p, '02-vista-aerea-1.png');
  await lote(p, 17, 'verde'); await p.waitForTimeout(700); await shot(p, '03-ficha-lote-disponible.png'); await p.keyboard.press('Escape');
  await lote(p, 44, 'naranja'); await p.waitForTimeout(700); await shot(p, '04-ficha-lote-reservado.png'); await p.keyboard.press('Escape');
  await lote(p, 19, 'rojo'); await p.waitForTimeout(700); await shot(p, '05-ficha-lote-vendido.png'); await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  await icono(p, 'Location'); await p.waitForTimeout(4000); await shot(p, '06-ubicacion.png');
  await p.goto(URL); await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 }); await p.waitForTimeout(3000);
  await icono(p, 'Photoalbum'); await p.waitForTimeout(5000); await shot(p, '07-galeria.png');
  await p.goto(URL); await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 }); await p.waitForTimeout(3000);
  await icono(p, 'Floorplan'); await p.waitForTimeout(5000); await shot(p, '08-plano-maestro.png');
  await p.goto(URL); await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 }); await p.waitForTimeout(3000);
  await icono(p, 'Info'); await p.waitForTimeout(5000); await shot(p, '09-informacion.png');
  await p.goto(URL); await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 }); await p.waitForTimeout(4000);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.ux-nav')].find((e) => /Vista aérea 2/.test(e.textContent) && !e.hidden); if (b) b.click(); });
  await p.waitForTimeout(22000); await shot(p, '10-vista-aerea-2.png');
  await p.goto(URL); await p.waitForFunction(() => window.__uxListo, null, { timeout: 90000 }); await p.waitForTimeout(3000);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.ux-nav')].find((e) => /Cartagena/.test(e.textContent) && !e.hidden); if (b) b.click(); });
  await p.waitForTimeout(16000); await shot(p, '11-cartagena.png');

  const m = await pagina(b, { ...devices['iPhone 13'] });
  await m.waitForFunction(() => window.__uxListo, null, { timeout: 90000 });
  await m.waitForTimeout(25000); await shot(m, '12-telefono.png');
  await lote(m, 44, 'naranja'); await m.waitForTimeout(800); await shot(m, '13-telefono-ficha.png');
  await b.close();
  console.log('listo');
})().catch((e) => { console.error(e); process.exit(1); });
