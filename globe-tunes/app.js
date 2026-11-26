/* Globe Tunes — app logic. Vanilla JS, no build step. */
{
const $ = id => document.getElementById(id);
const C = window.COUNTRIES;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const phoneMQ = matchMedia('(max-width: 700px)');
const phone = () => phoneMQ.matches;   // same test as the CSS
const vw = () => document.documentElement.clientWidth, vh = () => document.documentElement.clientHeight;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const FLAGS = new Set(['ad','ae','af','ag','ai','al','am','ao','aq','ar','as','at','au','aw','ax','az','ba','bb','bd','be','bf','bg','bh','bi','bj','bl','bm','bn','bo','bq','br','bs','bt','bv','bw','by','bz','ca','cc','cd','cf','cg','ch','ci','ck','cl','cm','cn','co','cr','cu','cv','cw','cx','cy','cz','de','dj','dk','dm','do','dz','ec','ee','eg','eh','er','es','et','fi','fj','fk','fm','fo','fr','ga','gb','gd','ge','gf','gg','gh','gi','gl','gm','gn','gp','gq','gr','gs','gt','gu','gw','gy','hk','hm','hn','hr','ht','hu','id','ie','il','im','in','io','iq','ir','is','it','je','jm','jo','jp','ke','kg','kh','ki','km','kn','kp','kr','kw','ky','kz','la','lb','lc','li','lk','lr','ls','lt','lu','lv','ly','ma','mc','md','me','mf','mg','mh','mk','ml','mm','mn','mo','mp','mq','mr','ms','mt','mu','mv','mw','mx','my','mz','na','nc','ne','nf','ng','ni','nl','no','np','nr','nu','nz','om','pa','pe','pf','pg','ph','pk','pl','pm','pn','pr','ps','pt','pw','py','qa','re','ro','rs','ru','rw','sa','sb','sc','sd','se','sg','sh','si','sj','sk','sl','sm','sn','so','sr','ss','st','sv','sx','sy','sz','tc','td','tf','tg','th','tj','tk','tl','tm','tn','to','tr','tt','tv','tw','tz','ua','ug','um','us','uy','uz','va','vc','ve','vg','vi','vn','vu','wf','ws','xk','ye','yt','za','zm','zw']);
const GLOBE_SVG = '<svg class="flg globe" viewBox="0 0 24 18" aria-hidden="true"><rect width="24" height="18" rx="3" fill="rgba(118,118,128,.35)"/><circle cx="12" cy="9" r="6" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M6 9h12M12 3c-2.4 2-2.4 10 0 12M12 3c2.4 2 2.4 10 0 12" fill="none" stroke="#fff" stroke-width="1.1"/></svg>';
const flag = iso => { iso = (iso || '').toLowerCase(); return FLAGS.has(iso) ? `<img class="flg" src="vendor/flags/${iso}.svg" alt="" loading="lazy" decoding="async">` : GLOBE_SVG; };
const art = (u, px) => u ? u.replace(/\/\d+x\d+bb\./, `/${px}x${px}bb.`) : '';
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let regionNames; try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
const nice = f => { try { return (f.properties.iso2 && regionNames?.of(f.properties.iso2)) || f.properties.name; } catch { return f.properties.name; } };

/* ---------- icons ---------- */
const I = {
  play: '<path d="M7 4.6v14.8c0 .9 1 1.5 1.8 1l11.6-7.4c.7-.5.7-1.5 0-2L8.8 3.6C8 3.1 7 3.7 7 4.6z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4.2" height="16" rx="1.3" fill="currentColor"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.3" fill="currentColor"/>',
  prev: '<path d="M12.5 12 21 6.4c.6-.4 1.4 0 1.4.8v9.6c0 .8-.8 1.2-1.4.8zM3.6 12 12 6.4c.6-.4 1.4 0 1.4.8v9.6c0 .8-.8 1.2-1.4.8z" fill="currentColor" transform="translate(-1 0)"/>',
  next: '<path d="M11.5 12 3 17.6c-.6.4-1.4 0-1.4-.8V7.2c0-.8.8-1.2 1.4-.8zM20.4 12 12 17.6c-.6.4-1.4 0-1.4-.8V7.2c0-.8.8-1.2 1.4-.8z" fill="currentColor" transform="translate(1 0)"/>',
  spinOn: '<path d="M3.5 10a6.5 6.5 0 0 1 11.3-4.4M16.5 10a6.5 6.5 0 0 1-11.3 4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.4 2.4v3.5h-3.5M4.6 17.6v-3.5h3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  spinOff: '<rect x="5" y="4" width="3.4" height="12" rx="1.1" fill="currentColor"/><rect x="11.6" y="4" width="3.4" height="12" rx="1.1" fill="currentColor"/>',
  ext: '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M5 2h7v7M12 2 3 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  note: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 12.5V3.5l7-1.5v9" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="4.3" cy="12.5" r="1.9" fill="#fff"/><circle cx="11.3" cy="11" r="1.9" fill="#fff"/></svg>',
  chev: '<svg class="chev" width="8" height="13" viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
$('pPrev').firstElementChild.innerHTML = I.prev;
$('pNext').firstElementChild.innerHTML = I.next;

/* ---------- haptics ----------
   Android/Chrome: Vibration API. iOS Safari 18+: toggling a native <input switch>
   gives a system haptic tick, so a hidden one is clicked through its label. */
const hapticLabel = (() => {
  const id = 'hx' + Math.random().toString(36).slice(2);
  const l = document.createElement('label'); l.htmlFor = id; l.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9px';
  const i = document.createElement('input'); i.type = 'checkbox'; i.id = id; i.setAttribute('switch', ''); i.tabIndex = -1; i.setAttribute('aria-hidden', 'true');
  l.append(i); l.setAttribute('aria-hidden', 'true'); document.body.append(l); return l;
})();
const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function haptic(kind = 'light'){
  try {
    if (navigator.vibrate && !iOS){ navigator.vibrate({ light: 8, medium: 16, heavy: [12, 40, 18], success: [10, 50, 10] }[kind] || 8); return; }
    if (iOS){ hapticLabel.click(); if (kind === 'heavy' || kind === 'success') setTimeout(() => hapticLabel.click(), 90); }
  } catch {}
}
window.GT = { haptic };
document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && e.target.closest('button, a, .tr')) haptic('light'); }, { passive: true });

/* ---------- toast ---------- */
let toastT;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- starfield ---------- */
const sc = $('stars'), sx = sc.getContext('2d');
function stars(){
  const d = devicePixelRatio || 1; sc.width = vw() * d; sc.height = vh() * d;
  sc.style.width = vw() + 'px'; sc.style.height = vh() + 'px';
  let s = 11; const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = 0; i < Math.round(vw() * vh() / 2800); i++){
    sx.fillStyle = `rgba(${225 + rnd() * 30 | 0},${230 + rnd() * 25 | 0},255,${0.12 + rnd() ** 2 * 0.8})`;
    sx.beginPath(); sx.arc(rnd() * sc.width, rnd() * sc.height, (rnd() ** 5 * 1.4 + 0.35) * d, 0, 7); sx.fill();
  }
}
stars(); addEventListener('resize', stars);

/* ---------- data ---------- */
const byIso = new Map(), byId = new Map();
for (const f of C.features){ byId.set(f.id, f); if (f.properties.iso2) byIso.set(f.properties.iso2.toLowerCase(), f); }
let INDEX = { countries: {} };
const charts = new Map();
const hasChart = f => !!(f?.properties.iso2 && INDEX.countries[f.properties.iso2.toLowerCase()]);
async function loadChart(cc){
  if (charts.has(cc)) return charts.get(cc);
  const p = fetch(`data/charts/${cc}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  charts.set(cc, p); p.catch(() => charts.delete(cc));
  return p;
}

/* ---------- geometry ---------- */
function mainRing(g){
  if (g.type === 'Polygon') return g.coordinates[0];
  let best = null, area = -1;
  for (const p of g.coordinates){
    const r = p[0]; let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    if (Math.abs(a) > area){ area = Math.abs(a); best = r; }
  }
  return best;
}
const boundsCache = new Map();
function bounds(f){
  if (boundsCache.has(f.id)) return boundsCache.get(f.id);
  const r = mainRing(f.geometry), b = new maplibregl.LngLatBounds(r[0], r[0]);
  r.forEach(p => b.extend(p)); boundsCache.set(f.id, b); return b;
}
function pad(){
  if (phone()) return { top: 70, bottom: Math.round(map.getContainer().clientHeight * 0.6), left: 40, right: 70 };
  return { top: 70, bottom: 130, left: 380 + 60, right: 100 };
}

/* ---------- map ---------- */
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const START_ZOOM = () => phone() ? 1.15 : 2.15;
const map = new maplibregl.Map({
  container: 'map', center: [12, 28], zoom: reduceMotion.matches ? START_ZOOM() : 0.3, maxPitch: 75,
  attributionControl: { compact: true }, fadeDuration: 200,
  pixelRatio: Math.min(devicePixelRatio || 1, 2),   // phones are 3x: 2x looks the same and draws ~45% fewer pixels
  style: {
    version: 8,
    projection: { type: 'globe' },
    sky: {
      'sky-color': '#000510', 'horizon-color': '#4f95ff', 'fog-color': '#a9cdff',
      'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.75, 'fog-ground-blend': 0.92,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
    },
    sources: {
      sat: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: [ESRI + '/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
             attribution: 'Imagery © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics · Charts: Apple Music' },
      ref: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: [ESRI + '/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'] },
      countries: { type: 'geojson', data: C }
    },
    layers: [
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-contrast': 0.08, 'raster-saturation': 0.12, 'raster-brightness-max': 0.96, 'raster-fade-duration': 300 } },
      { id: 'fill', type: 'fill', source: 'countries', paint: {
          'fill-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#ff375f', '#ffffff'],
          'fill-opacity': ['case',
            ['boolean', ['feature-state', 'sel'], false], 0.1,
            ['boolean', ['feature-state', 'hover'], false], ['case', ['boolean', ['feature-state', 'chart'], false], 0.16, 0.06],
            0] } },
      { id: 'borders', type: 'line', source: 'countries', paint: {
          'line-color': '#ffffff',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.2, 6, 0.45],
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.1] } },
      { id: 'sel-glow', type: 'line', source: 'countries', paint: {
          'line-color': '#ff375f', 'line-width': 10, 'line-blur': 8,
          'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 0.6, 0] } },
      { id: 'sel-line', type: 'line', source: 'countries', paint: {
          'line-color': '#ffffff', 'line-width': 2,
          'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0] } },
      { id: 'ref', type: 'raster', source: 'ref', layout: { visibility: 'none' } }
    ]
  }
});
const cv = map.getCanvas();

/* ---------- map controls ---------- */
$('zIn').onclick = () => map.zoomIn();
$('zOut').onclick = () => map.zoomOut();
$('compass').onclick = () => map.easeTo({ bearing: 0, pitch: 0, zoom: Math.min(map.getZoom(), START_ZOOM()), duration: 1200 });
map.on('rotate', () => $('compass').firstElementChild.style.rotate = `${-map.getBearing()}deg`);
function setLabels(on){
  map.setLayoutProperty('ref', 'visibility', on ? 'visible' : 'none');
  $('mSat').setAttribute('aria-pressed', !on); $('mHyb').setAttribute('aria-pressed', on);
}
$('mSat').onclick = () => setLabels(false);
$('mHyb').onclick = () => setLabels(true);

/* ---------- idle rotation ---------- */
let spinning = !reduceMotion.matches, busy = false;
function setSpin(on){
  spinning = on;
  $('spinIc').innerHTML = on ? I.spinOff : I.spinOn;
  $('spinBtn').setAttribute('aria-label', on ? 'Stop globe rotation' : 'Rotate globe');
  if (on){ busy = false; spin(); } else map.stop();
}
function spin(){
  if (!spinning || busy || map.getZoom() > 3.5) return;
  const c = map.getCenter(); c.lng -= 4;
  map.easeTo({ center: c, duration: 1000, easing: t => t });
}
map.on('moveend', spin);
['mousedown', 'touchstart', 'wheel'].forEach(e => cv.addEventListener(e, () => busy = true, { passive: true }));
['mouseup', 'touchend'].forEach(e => cv.addEventListener(e, () => { busy = false; setTimeout(spin, 2000); }));
$('spinBtn').onclick = () => setSpin(!spinning);
setSpin(spinning);

/* ---------- hover ---------- */
let hoverId = null, selId = null;
const tip = $('tip');
map.on('mousemove', 'fill', e => {
  const f = e.features[0];
  cv.style.cursor = 'pointer';
  if (hoverId !== f.id){
    if (hoverId) map.setFeatureState({ source: 'countries', id: hoverId }, { hover: false });
    hoverId = f.id; map.setFeatureState({ source: 'countries', id: hoverId }, { hover: true });
    const full = byId.get(f.id), cc = full.properties.iso2?.toLowerCase(), top = INDEX.countries[cc];
    tip.innerHTML = top
      ? `<img src="${esc(art(top.art, 100))}" alt=""><span><b>${flag(cc)} ${esc(nice(full))}</b><small>No. 1 · ${esc(top.n)} — ${esc(top.a)}</small></span>`
      : `<span class="tf">${flag(cc)}</span><span><b>${esc(nice(full))}</b><small>No chart available</small></span>`;
  }
  tip.hidden = false;
  const x = Math.min(e.point.x, vw() - 320);
  tip.style.left = x + 'px'; tip.style.top = e.point.y + 'px';
});
map.on('mouseleave', 'fill', () => {
  if (hoverId) map.setFeatureState({ source: 'countries', id: hoverId }, { hover: false });
  hoverId = null; tip.hidden = true; cv.style.cursor = '';
});

/* ---------- sheet (desktop sidebar / phone bottom sheet) ---------- */
const sheet = $('sheet');
let sheetState = 'peek';
function setSheet(s){
  sheetState = s;
  sheet.classList.toggle('peek', s === 'peek');
  sheet.classList.toggle('half', s === 'half');
  document.body.classList.toggle('phone-open', phone() && s !== 'peek');
  $('grab').setAttribute('aria-label', s === 'peek' ? 'Expand panel' : 'Collapse panel');
}
$('grab').onclick = () => setSheet(sheetState === 'peek' ? (current ? 'half' : 'full') : 'peek');
{ // drag the grabber
  let y0 = null;
  $('grab').addEventListener('pointerdown', e => { y0 = e.clientY; $('grab').setPointerCapture(e.pointerId); });
  $('grab').addEventListener('pointerup', e => {
    if (y0 == null) return; const dy = e.clientY - y0; y0 = null;
    if (Math.abs(dy) < 30) return;
    const order = ['peek', 'half', 'full'], i = order.indexOf(sheetState);
    setSheet(order[Math.max(0, Math.min(2, i + (dy < 0 ? 1 : -1)))]);
  });
}

/* ---------- views ---------- */
function show(view){
  const el = { home: $('home'), place: $('place'), results: $('results') }[view];
  if (el && el.hidden){ el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  if (view !== 'place') $('heroBg').classList.remove('on'); else if (current && hasChart(current) && $('heroBg').style.backgroundImage) $('heroBg').classList.add('on');
  $('home').hidden = view !== 'home'; $('place').hidden = view !== 'place'; $('results').hidden = view !== 'results';
  if (view !== 'results') $('scrollarea').scrollTop = 0;
}

/* ---------- home ---------- */
const MARKETS = ['us', 'gb', 'br', 'jp', 'kr', 'mx', 'de', 'fr', 'in', 'ng', 'za', 'au'];
function renderHome(){
  const entries = Object.entries(INDEX.countries);
  // unique number ones, local hits first
  const seen = new Set(), cards = [];
  const shuffled = entries.sort(() => Math.random() - .5);
  for (const [cc, t] of shuffled){
    const k = (t.n + t.a).toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    cards.push([cc, t]); if (cards.length >= 14) break;
  }
  $('shelf').innerHTML = cards.map(([cc, t]) => {
    const f = byIso.get(cc);
    return `<button class="card" role="listitem" style="--i:${cards.indexOf(cards.find(c => c[0] === cc))}" data-cc="${cc}" aria-label="${esc(t.n)} by ${esc(t.a)}, number one in ${esc(nice(f))}">
      <span class="ca"><img src="${esc(art(t.art, 300))}" alt="" loading="lazy"><span class="cf">${flag(cc)}</span></span>
      <span class="cn">${esc(t.n)}</span><span class="cs">${esc(t.a)}</span></button>`;
  }).join('');
  $('regions').innerHTML = MARKETS.filter(cc => INDEX.countries[cc] && byIso.get(cc)).slice(0, 10).map(cc =>
    `<button class="region" data-cc="${cc}"><span>${flag(cc)} ${esc(nice(byIso.get(cc)))}</span>${I.chev}</button>`).join('');
  const n = entries.length, d = INDEX.updated ? new Date(INDEX.updated) : null;
  $('fine').textContent = `${n} country charts from Apple Music's most‑played songs${d ? ', updated ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}. 30‑second previews.`;
}
$('shelf').addEventListener('click', e => { const b = e.target.closest('[data-cc]'); if (b) openCountry(byIso.get(b.dataset.cc), { autoplay: 0 }); });
$('regions').addEventListener('click', e => { const b = e.target.closest('[data-cc]'); if (b) openCountry(byIso.get(b.dataset.cc)); });

/* ---------- country page ---------- */
let current = null;   // feature shown in the panel
function select(f){
  if (selId) map.setFeatureState({ source: 'countries', id: selId }, { sel: false });
  selId = f?.id ?? null;
  if (selId) map.setFeatureState({ source: 'countries', id: selId }, { sel: true });
}
function fly(f){
  const b = bounds(f);
  const p = pad();
  let cam; try { cam = map.cameraForBounds(b, { padding: p, maxZoom: 5 }); } catch {}
  if (!cam){ // globe camera maths can fail for huge countries: estimate from the span
    const span = Math.max(b.getEast() - b.getWest(), (b.getNorth() - b.getSouth()) * 1.6, 0.5);
    cam = { zoom: Math.max(1.2, Math.log2(360 / span) + (phone() ? -0.6 : 0.2)) };
  }
  map.flyTo({ center: b.getCenter(), zoom: Math.min(cam?.zoom ?? 4, 5), padding: p, bearing: 0, pitch: 0,
              duration: reduceMotion.matches ? 0 : 2600, essential: true, curve: 1.5 });
}
async function openCountry(f, { autoplay = null, flyTo = true } = {}){
  if (!f) return;
  current = f; select(f); setSpin(false); haptic('medium');
  const cc = f.properties.iso2?.toLowerCase() || '', name = nice(f);
  const c = bounds(f).getCenter();
  $('cflag').innerHTML = flag(cc);
  $('cname').textContent = name;
  $('csub').textContent = `${Math.abs(c.lat).toFixed(1)}° ${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lng).toFixed(1)}° ${c.lng >= 0 ? 'E' : 'W'}`;
  $('heroBg').classList.remove('on'); $('chips').innerHTML = '';
  $('links').innerHTML = services(name).map(([s, sub, col, url]) =>
    `<a class="row" href="${esc(url)}" target="_blank" rel="noopener"><span class="ic" style="background:${col}">${I.note}</span><span class="t">${esc(s)}</span>${I.chev}</a>`).join('');
  show('place'); setSheet(phone() ? 'half' : 'full');
  if (flyTo) fly(f);

  const ok = hasChart(f);
  $('nochart').hidden = ok; $('cta').hidden = !ok; $('tracks').hidden = !ok;
  $('cfine').textContent = '';
  if (!ok){ $('csub').textContent += ' · No chart'; return; }
  $('tracks').innerHTML = Array.from({ length: 8 }, () => '<li class="tr skel"><span class="rk"></span><span class="ar"></span><span class="tt"><div class="tn">.</div><div class="ta">.</div></span><span></span></li>').join('');
  let data;
  try { data = await loadChart(cc); } catch { if (current === f){ $('tracks').innerHTML = ''; toast('Couldn’t load this chart. Check your connection.'); } return; }
  if (current !== f) return;
  renderChart(f, data);
  if (autoplay != null) playAt(cc, autoplay);
}
function renderChart(f, data){
  const cc = data.cc, t = data.tracks;
  $('heroBg').style.backgroundImage = `url("${art(t[0]?.art, 300)}")`;
  requestAnimationFrame(() => $('heroBg').classList.add('on'));
  $('csub').textContent = `Top ${t.length} · Most played this week`;
  const g = {}; t.forEach(x => { if (x.g) g[x.g] = (g[x.g] || 0) + 1; });
  $('chips').innerHTML = Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `<span class="chip">${esc(k)}<i>${Math.round(v / t.length * 100)}%</i></span>`).join('');
  $('tracks').innerHTML = t.map((x, i) => `
    <li class="tr" data-i="${i}" style="--i:${Math.min(i, 14)}">
      <span class="rk">${i + 1}</span>
      <span class="ar"><img src="${esc(art(x.art, 100))}" srcset="${esc(art(x.art, 200))} 2x" alt="" loading="lazy" width="46" height="46"></span>
      <span class="tt"><div class="tn">${esc(x.n)}${x.e ? '<span class="ex" aria-label="Explicit">E</span>' : ''}</div><div class="ta">${esc(x.a)}</div></span>
      <a class="ext" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="Open ${esc(x.n)} in Apple Music">${I.ext}</a>
      <button class="play" aria-label="Play ${esc(x.n)} by ${esc(x.a)}"></button>
    </li>`).join('');
  const d = new Date(data.updated);
  $('cfine').textContent = `Chart updated ${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. Previews courtesy of Apple Music.`;
  markNow();
}
$('tracks').addEventListener('click', e => {
  const b = e.target.closest('.play'); if (!b || !current) return;
  const i = +b.closest('.tr').dataset.i, cc = current.properties.iso2.toLowerCase();
  if (Q.cc === cc && Q.i === i){ toggle(); return; }
  setRadio(false); playAt(cc, i);
});
$('playAll').onclick = () => { setRadio(false); playAt(current.properties.iso2.toLowerCase(), 0); };
$('shuffleAll').onclick = () => { setRadio(false); Q.shuffle = true; const cc = current.properties.iso2.toLowerCase(); loadChart(cc).then(d => playAt(cc, Math.floor(Math.random() * d.tracks.length))); };
function closeCountry(){
  current = null; select(null); show('home'); setSheet('peek');
  map.flyTo({ zoom: Math.min(map.getZoom(), START_ZOOM()), pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduceMotion.matches ? 0 : 1800 });
}
$('closeBtn').onclick = closeCountry;
map.on('click', 'fill', e => openCountry(byId.get(e.features[0].id)));

function services(name){
  return [
    ['Spotify', '', '#1db954', `https://open.spotify.com/search/${enc('Top 50 ' + name)}/playlists`],
    ['Apple Music', '', '#fa2d48', `https://music.apple.com/search?term=${enc('Top 100 ' + name)}`],
    ['YouTube Music', '', '#ff3b30', `https://music.youtube.com/search?q=${enc('Top songs ' + name)}`],
    ['Deezer', '', '#a238ff', `https://www.deezer.com/search/${enc('Top ' + name)}/playlist`]
  ];
}

/* ---------- player ---------- */
const audio = $('audio');
const Q = { cc: null, i: -1, tracks: [], shuffle: false };
let marker = null, radio = false, playToken = 0;

function setPlayIcon(){
  const on = !audio.paused;
  $('pIc').innerHTML = on ? I.pause : I.play;
  $('pPlay').setAttribute('aria-label', on ? 'Pause' : 'Play');
  document.body.classList.toggle('playing', on);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  marker?.getElement().classList.toggle('live', on);
}
async function playAt(cc, i){
  const token = ++playToken;
  let data; try { data = await loadChart(cc); } catch { toast('Couldn’t load that chart.'); return; }
  if (token !== playToken) return;
  const t = data.tracks[i]; if (!t) return;
  Q.cc = cc; Q.i = i; Q.tracks = data.tracks;
  $('player').classList.remove('bump'); void $('player').offsetWidth; $('player').classList.add('bump');
  window.GTglass?.pulse($('pArt'));
  if (!t.p){ toast('No preview for this song, skipping'); return next(); }
  audio.src = t.p; audio.currentTime = 0;
  try { await audio.play(); } catch (err) { if (err.name !== 'AbortError') toast('Tap play to start listening'); }
  const f = byIso.get(cc), country = nice(f);
  $('player').classList.remove('idle');
  $('pImg').src = art(t.art, 200); $('pImg').hidden = false;
  $('pFlag').innerHTML = flag(cc);
  $('pTitle').textContent = t.n;
  $('pSub').textContent = `${t.a} · No. ${i + 1} in ${country}`;
  document.title = `${t.n} · ${t.a} — Globe Tunes`;
  placeMarker(f, t);
  markNow();
  if ('mediaSession' in navigator){
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.n, artist: t.a, album: `Top ${Q.tracks.length} · ${country}`,
      artwork: [100, 300, 600].map(s => ({ src: art(t.art, s), sizes: `${s}x${s}`, type: 'image/jpeg' }))
    });
  }
}
function markNow(){
  if (!current) return;
  const cc = current.properties.iso2?.toLowerCase();
  document.querySelectorAll('.tr.now').forEach(el => el.classList.remove('now'));
  if (cc === Q.cc) document.querySelector(`.tr[data-i="${Q.i}"]`)?.classList.add('now');
}
function placeMarker(f, t){
  const c = bounds(f).getCenter();
  if (!marker){
    const el = document.createElement('div'); el.className = 'mk'; el.innerHTML = '<img alt="">';
    marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
  }
  marker.setLngLat(c); marker.getElement().querySelector('img').src = art(t.art, 100);
}
function toggle(){
  if (!audio.src){ if (current && hasChart(current)) playAt(current.properties.iso2.toLowerCase(), 0); else startRadio(); return; }
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
}
function next(){
  if (radio) return radioStep();
  if (!Q.cc) return;
  const n = Q.shuffle ? Math.floor(Math.random() * Q.tracks.length) : Q.i + 1;
  if (n < Q.tracks.length) playAt(Q.cc, n); else { audio.pause(); toast('End of chart'); }
}
function prev(){
  if (audio.currentTime > 3 || !Q.cc){ audio.currentTime = 0; return; }
  if (Q.i > 0) playAt(Q.cc, Q.i - 1);
}
$('pPlay').onclick = toggle; $('pNext').onclick = next; $('pPrev').onclick = prev;
$('pArt').onclick = () => { if (Q.cc) openCountry(byIso.get(Q.cc)); };
audio.addEventListener('play', setPlayIcon); audio.addEventListener('pause', setPlayIcon);
audio.addEventListener('ended', next);
audio.addEventListener('error', () => { if (audio.src){ toast('Preview unavailable, skipping'); setTimeout(next, 600); } });
const seek = $('seek');
let scrubbing = false;
audio.addEventListener('timeupdate', () => {
  const d = audio.duration || 30, t = audio.currentTime;
  if (!scrubbing){ seek.max = d; seek.value = t; }
  const p = (t / d * 100).toFixed(2) + '%';
  seek.style.setProperty('--p', p); $('player').style.setProperty('--pp', p);
  $('tCur').textContent = fmt(t); $('tDur').textContent = '-' + fmt(d - t);
});
seek.addEventListener('input', () => { scrubbing = true; seek.style.setProperty('--p', (seek.value / seek.max * 100) + '%'); });
seek.addEventListener('change', () => { audio.currentTime = +seek.value; scrubbing = false; });
if ('mediaSession' in navigator){
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => audio.play());
  ms.setActionHandler('pause', () => audio.pause());
  ms.setActionHandler('nexttrack', next);
  ms.setActionHandler('previoustrack', prev);
  try { ms.setActionHandler('seekto', e => { audio.currentTime = e.seekTime; }); } catch {}
}
setPlayIcon();

/* ---------- Around the World radio ---------- */
function setRadio(on){
  radio = on;
  $('radioBtn').classList.toggle('on', on);
  $('radioSub').textContent = on ? 'Playing · tap to stop' : 'A new country’s No. 1 every 30 seconds';
}
const recent = [];
function radioStep(){
  const pool = Object.keys(INDEX.countries).filter(cc => byIso.get(cc) && !recent.includes(cc));
  if (!pool.length) return;
  const cc = pool[Math.floor(Math.random() * pool.length)];
  recent.push(cc); if (recent.length > 30) recent.shift();
  const f = byIso.get(cc);
  if (phone()){ current = f; select(f); fly(f); loadChart(cc).then(d => renderChart(f, d)).catch(() => {}); }
  else openCountry(f, { flyTo: true });
  playAt(cc, 0);
}
function startRadio(){ setRadio(true); Q.shuffle = false; radioStep(); }
$('radioBtn').onclick = () => { if (radio){ setRadio(false); audio.pause(); } else startRadio(); };

/* ---------- search ---------- */
const q = $('q'), res = $('results');
const all = [...C.features].map(f => ({ f, name: nice(f), key: nice(f).toLowerCase() + ' ' + f.properties.name.toLowerCase() }))
  .sort((a, b) => a.name.localeCompare(b.name));
let hits = [], active = 0;
function renderResults(){
  const v = q.value.trim().toLowerCase();
  if (!v){ show(current ? 'place' : 'home'); return; }
  hits = all.filter(x => x.key.includes(v))
    .sort((a, b) => (a.key.startsWith(v) ? 0 : 1) - (b.key.startsWith(v) ? 0 : 1) || a.name.localeCompare(b.name)).slice(0, 10);
  active = 0;
  res.innerHTML = hits.length ? hits.map((x, i) => {
    const cc = x.f.properties.iso2?.toLowerCase(), top = INDEX.countries[cc];
    return `<li><button type="button" role="option" data-i="${i}" aria-selected="${i === 0}"><span class="rf">${flag(cc)}</span>
      <span class="rt">${esc(x.name)}<small>${top ? 'No. 1 · ' + esc(top.n) + ' — ' + esc(top.a) : 'No chart available'}</small></span></button></li>`;
  }).join('') : `<li class="empty">No country matches “${esc(q.value.trim())}”.</li>`;
  show('results');
}
q.addEventListener('input', renderResults);
q.addEventListener('focus', () => { if (phone()) setSheet('full'); if (q.value) renderResults(); });
q.addEventListener('keydown', e => {
  if (res.hidden || !hits.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    res.querySelectorAll('button').forEach((b, i) => { b.setAttribute('aria-selected', i === active); if (i === active) b.scrollIntoView({ block: 'nearest' }); });
  }
});
function pick(i){ const x = hits[i]; if (!x) return; q.value = ''; q.blur(); openCountry(x.f); }
res.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) pick(+b.dataset.i); });
$('searchForm').onsubmit = e => { e.preventDefault(); if (!res.hidden) pick(active); };

/* ---------- keyboard ---------- */
addEventListener('keydown', e => {
  const typing = e.target.matches('input:not([type=range]), textarea');
  if (e.key === 'Escape'){
    if (typing && q.value){ q.value = ''; renderResults(); return; }
    if (typing) return q.blur();
    if (current) closeCountry();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/'){ e.preventDefault(); q.focus(); }
  else if (e.key === ' ' && !e.target.matches('button, a')){ e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowRight' && e.shiftKey) next();
  else if (e.key === 'ArrowLeft' && e.shiftKey) prev();
});

/* ---------- boot ---------- */
setSheet(phone() ? 'peek' : 'full');
addEventListener('resize', () => setSheet(sheetState));
document.body.classList.add('intro');
setTimeout(() => document.body.classList.remove('intro'), 2500);
map.on('load', () => {
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  if (!reduceMotion.matches) map.easeTo({ zoom: START_ZOOM(), center: [19, 30], duration: 3200, easing: t => 1 - (1 - t) ** 4 });
  setTimeout(spin, reduceMotion.matches ? 0 : 3300);
});
fetch('data/index.json').then(r => r.json()).then(d => {
  INDEX = d;
  for (const cc of Object.keys(d.countries)){ const f = byIso.get(cc); if (f) map.setFeatureState({ source: 'countries', id: f.id }, { chart: true }); }
  renderHome();
}).catch(() => {
  $('shelf').innerHTML = '';
  $('fine').textContent = location.protocol === 'file:' ? 'Open this site through a web server (see README) to load the charts.' : 'Charts couldn’t load. Check your connection and reload.';
});
// feature-state needs the source loaded
map.on('sourcedata', function once(e){
  if (e.sourceId === 'countries' && e.isSourceLoaded){
    for (const cc of Object.keys(INDEX.countries)){ const f = byIso.get(cc); if (f) map.setFeatureState({ source: 'countries', id: f.id }, { chart: true }); }
    map.off('sourcedata', once);
  }
});
}
