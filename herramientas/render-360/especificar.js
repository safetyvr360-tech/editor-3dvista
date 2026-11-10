// Arma la lista de imágenes a dibujar sobre la foto 360 (antes y después) de una vista.
//   node especificar.js <exportación original> <salida del motor/tour> <id panorama> <carpeta de trabajo>
const fs = require('fs'), path = require('path');
const [ORIG, SALIDA, PID, OUT] = process.argv.slice(2);
const A = require(path.resolve('motor-3dvista/analizador/analizar.js'));
const vendidos = new Set([15, 23, 37, 38]);           // estado real corregido (hoja del 10/11/2026)
fs.mkdirSync(path.join(OUT, 'ov'), { recursive: true });

const cache = {};
function contexto(dir) {
  if (cache[dir]) return cache[dir];
  const s = fs.readFileSync(path.join(dir, 'script_general.js'), 'utf8');
  const loc = {};
  try {
    for (const l of fs.readFileSync(path.join(dir, 'locale', 'es.txt'), 'utf8').split(/\r?\n/)) {
      const k = l.indexOf(' = '); if (k > 0) loc[l.slice(0, k).trim()] = l.slice(k + 3).trim();
    }
  } catch (e) {}
  return (cache[dir] = { s, loc });
}
// el objeto { ... } que contiene "id":"<id>"
function objetoPorId(s, id) {
  const i = s.indexOf('"id":"' + id + '"'); if (i < 0) return null;
  let a = i, d = 0; for (; a >= 0; a--) { if (s[a] === '}') d++; else if (s[a] === '{') { if (d === 0) break; d--; } }
  let b = i, e = 0; for (; b < s.length; b++) { if (s[b] === '{') e++; else if (s[b] === '}') { if (e === 0) break; e--; } }
  return s.slice(a, b + 1);
}
function overlaysDe(dir) {
  const { s } = contexto(dir);
  const i = s.indexOf('"id":"' + PID + '"'); const o = s.indexOf('"overlays":[', i);
  const ids = s.slice(o, s.indexOf(']', o)).match(/overlay_[A-Z0-9_]+/g);
  const porId = {}; for (const t of A.objetos(s, 'HotspotPanoramaOverlay')) { const m = /"id":"(overlay_[^"]+)"/.exec(t); if (m) porId[m[1]] = t; }
  return ids.map((id) => ({ id, t: porId[id] })).filter((x) => x.t);
}
// los ítems de imagen de un overlay: en línea dentro de "items" o referidos por id
function items(t, s) {
  const out = [];
  const ini = t.indexOf('"items":['); if (ini < 0) return out;
  let i = ini + 9, d = 0, cur = '';
  for (; i < t.length; i++) {
    const c = t[i];
    if (d === 0 && c === ']') break;
    if (c === '{') { d++; }
    if (d > 0) cur += c;
    if (c === '}') { d--; if (d === 0) { out.push(cur); cur = ''; } }
    if (d === 0 && c === '"') { const f = t.indexOf('"', i + 1); const ref = t.slice(i + 1, f); if (ref.startsWith('this.')) { const o = objetoPorId(s, ref.slice(5)); if (o) out.push(o); } i = f; }
  }
  return out;
}
function piezas(t, dir, pref) {
  const { s, loc } = contexto(dir);
  const out = [];
  for (const it of items(t, s)) {
    if (!/"class":"HotspotPanoramaOverlay(Text)?Image"/.test(it)) continue;
    const num = (k) => { const r = new RegExp('"' + k + '":(-?[0-9.]+)').exec(it); return r ? +r[1] : null; };
    let url = (/"url":"([^"]+)"/.exec(it) || [])[1];
    if (!url) { const lv = (/this\.(imlevel_[A-Z0-9_]+)/.exec(it) || [])[1]; if (lv) url = loc[lv + '.url']; }
    if (!url) continue;
    const src = path.join(dir, url.split('?')[0]); if (!fs.existsSync(src)) continue;
    const nombre = pref + path.basename(src); fs.copyFileSync(src, path.join(OUT, 'ov', nombre));
    out.push({ img: 'ov/' + nombre, yaw: num('yaw'), pitch: num('pitch'), hfov: num('hfov'), vfov: num('vfov'), roll: num('roll') || 0 });
  }
  return out;
}
const visible = (t) => !/"enabled":false/.test(t) && !/"rollOverDisplay":true/.test(t);

// ANTES: la exportación tal cual (lo que se ve sin pasar el mouse)
const antes = []; for (const x of overlaysDe(ORIG)) if (visible(x.t)) antes.push(...piezas(x.t, ORIG, 'a_'));
// DESPUÉS: la salida del motor con los estados aplicados, como lo hace la capa UX
const datos = JSON.parse(fs.readFileSync(path.join(SALIDA, 'ux', 'ux-datos.json'), 'utf8'));
const encender = {}, apagar = new Set();
for (const [n, L] of Object.entries(datos.lotes)) for (const v of L.vistas) {
  if (v.pano !== PID) continue;
  const e = vendidos.has(+n) ? 'rojo' : 'verde';
  encender[v[e]] = true; for (const p of v.poligonos) apagar.add(p);
  for (const k of ['verde', 'naranja', 'rojo']) if (k !== e) apagar.add(v[k]);
}
const despues = [];
for (const x of overlaysDe(SALIDA)) { const on = encender[x.id] || (visible(x.t) && !apagar.has(x.id)); if (on) despues.push(...piezas(x.t, SALIDA, 'd_')); }
fs.writeFileSync(path.join(OUT, 'spec.json'), JSON.stringify({ antes, despues }));
console.log('antes', antes.length, 'piezas; después', despues.length, 'piezas; lotes encendidos', Object.keys(encender).length);
