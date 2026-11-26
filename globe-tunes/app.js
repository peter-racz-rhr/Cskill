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
    if (iOS){
      const tick = () => { const a = document.activeElement; hapticLabel.click(); if (a && a !== document.body && a !== hapticLabel.firstChild) a.focus({ preventScroll: true }); else hapticLabel.firstChild.blur(); };
      tick(); if (kind === 'heavy' || kind === 'success') setTimeout(tick, 90);
    }
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
          'fill-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#5e5ce6', '#ffffff'],
          'fill-opacity': ['case',
            ['boolean', ['feature-state', 'sel'], false], 0.1,
            ['boolean', ['feature-state', 'hover'], false], ['case', ['boolean', ['feature-state', 'chart'], false], 0.16, 0.06],
            0] } },
      { id: 'borders', type: 'line', source: 'countries', paint: {
          'line-color': '#ffffff',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.2, 6, 0.45],
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.1] } },
      // selection outline: filtered to the one selected country, so the GPU doesn't
      // draw 241 invisible blurred borders every frame
      { id: 'sel-glow', type: 'line', source: 'countries', filter: ['==', ['id'], -1], paint: {
          'line-color': '#5e5ce6', 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.6 } },
      { id: 'sel-line', type: 'line', source: 'countries', filter: ['==', ['id'], -1], paint: {
          'line-color': '#ffffff', 'line-width': 2 } },
      { id: 'ref', type: 'raster', source: 'ref', layout: { visibility: 'none' } }
    ]
  }
});
const cv = map.getCanvas();
window.GT.map = map;   // handy for debugging from the console

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

/* ---------- idle rotation ----------
   A tiny per-frame nudge, skipped whenever MapLibre says the camera is busy (a finger on
   the globe, inertia after a flick, a fly-to). It never starts animations and never calls
   map.stop(), because map.stop() also resets the touch handlers and cancels the gesture. */
let spinning = !reduceMotion.matches, busy = false, spinRaf = 0, spinLast = 0;
const SPIN_DEG_PER_MS = 0.004;   // about 4° a second
function spinLoop(t){
  spinRaf = requestAnimationFrame(spinLoop);
  const dt = Math.min(t - (spinLast || t), 50); spinLast = t;
  if (!spinning || busy || document.hidden || map.isMoving() || map.getZoom() > 3.5) return;
  const c = map.getCenter();
  map.jumpTo({ center: [c.lng - dt * SPIN_DEG_PER_MS, c.lat] });
}
function spin(){ if (!spinRaf) spinRaf = requestAnimationFrame(spinLoop); }
function setSpin(on){
  spinning = on;
  $('spinIc').innerHTML = on ? I.spinOff : I.spinOn;
  $('spinBtn').setAttribute('aria-label', on ? 'Stop globe rotation' : 'Rotate globe');
  if (on){ busy = false; spin(); }
}
// a touch pauses the spin; it comes back after 6 s of no interaction
let resumeT = 0;
const takeOver = () => { busy = true; clearTimeout(resumeT); };
const letGo = () => { clearTimeout(resumeT); resumeT = setTimeout(() => { busy = false; }, 6000); };
['mousedown', 'touchstart', 'wheel', 'pointerdown'].forEach(e => cv.addEventListener(e, takeOver, { passive: true }));
['mouseup', 'touchend', 'touchcancel', 'wheel', 'pointerup'].forEach(e => cv.addEventListener(e, letGo, { passive: true }));
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
  sheet.style.translate = '';
  sheet.classList.toggle('peek', s === 'peek');
  sheet.classList.toggle('half', s === 'half');
  document.body.classList.toggle('phone-open', phone() && s !== 'peek');
  document.body.classList.toggle('sheet-full', phone() && s === 'full');
  $('grab').setAttribute('aria-label', s === 'peek' ? 'Expand panel' : 'Collapse panel');
}
$('grab').onclick = () => setSheet(sheetState === 'peek' ? (current ? 'half' : 'full') : 'peek');
/* ---------- bottom sheet gestures (phone) ----------
   The sheet follows the finger 1:1 from the handle, the search bar and the header, and from
   the list when that can't scroll any further in the drag direction. On release it snaps to
   the nearest stop, or to the next one in the flick direction when the flick is fast. */
{
  const DETENTS = () => {
    const H = sheet.offsetHeight;
    return { full: 0, half: Math.round(H * 0.42), peek: H + 20 };
  };
  const area = $('scrollarea');
  let g = null;   // active gesture
  const posOf = s => DETENTS()[s];
  function begin(y, fromList){
    g = { y0: y, base: posOf(sheetState), pos: posOf(sheetState), fromList, dragging: false, samples: [[performance.now(), y]] };
  }
  function moveTo(y, ev){
    if (!g) return;
    const dy = y - g.y0;
    if (!g.dragging){
      if (Math.abs(dy) < 6) return;
      if (g.fromList){
        const atTop = area.scrollTop <= 0;
        // list: pull down only from the very top; push up only while the sheet isn't full
        if (!((dy > 0 && atTop) || (dy < 0 && sheetState !== 'full'))){ g = null; return; }
      }
      g.dragging = true; g.y0 = y; sheet.classList.add('dragging');
      if (document.activeElement === q) q.blur();
    }
    ev?.cancelable && ev.preventDefault();
    let pos = g.base + (y - g.y0);
    if (pos < 0) pos = pos * 0.25;                         // rubber band above full height
    g.pos = pos; sheet.style.translate = `0 ${pos}px`;
    g.samples.push([performance.now(), y]); if (g.samples.length > 6) g.samples.shift();
  }
  function end(){
    if (!g) return;
    const was = g; g = null;
    if (!was.dragging) return;
    // speed over the last ~100 ms only (like iOS), so a pause before the flick doesn't count
    const last = was.samples.at(-1), recent = was.samples.filter(s => last[0] - s[0] <= 100);
    const first = recent.length > 1 ? recent[0] : was.samples.at(-2) || last;
    const v = (last[1] - first[1]) / Math.max(last[0] - first[0], 1);   // px per ms, + = down
    const moved = was.pos - was.base;
    const d = DETENTS();
    const order = ['full', 'half', 'peek'];
    let target;
    if (Math.abs(v) > 0.35 || Math.abs(moved) > 50){
      // a flick, or a drag of more than 50px: go to the next stop in that direction
      // fast flick: go to the next stop in that direction from where the finger let go
      const sorted = order.map(k => [k, d[k]]).sort((a, b) => a[1] - b[1]);
      const down = Math.abs(v) > 0.35 ? v > 0 : moved > 0;
      target = down ? (sorted.find(([, y]) => y > was.pos + 10) || sorted.at(-1))[0]
                     : ([...sorted].reverse().find(([, y]) => y < was.pos - 10) || sorted[0])[0];
    } else {
      const projected = was.pos + v * 180;
      target = order.reduce((best, k) => Math.abs(d[k] - projected) < Math.abs(d[best] - projected) ? k : best, 'full');
    }
    sheet.classList.remove('dragging');
    sheet.style.translate = '';                             // CSS class position takes over, animated
    setSheet(target);
    haptic('light');
  }
  // handle + header: always drag
  const head = [$('grab'), $('searchForm')];
  for (const el of head){
    el.addEventListener('touchstart', e => { if (phone()) begin(e.touches[0].clientY, false); }, { passive: true });
  }
  // list: drag only at its scroll edge
  area.addEventListener('touchstart', e => { if (phone()) begin(e.touches[0].clientY, true); }, { passive: true });
  addEventListener('touchmove', e => { if (g) moveTo(e.touches[0].clientY, e); }, { passive: false });
  addEventListener('touchend', end, { passive: true });
  addEventListener('touchcancel', end, { passive: true });
  // a drag shouldn't also count as a tap on the handle
  $('grab').addEventListener('click', e => { if (sheet.dataset.justDragged){ e.stopImmediatePropagation(); } }, true);
}

/* ---------- views ---------- */
function show(view){
  const VIEWS = ['home', 'place', 'results', 'game', 'travel'];
  const el = $(view);
  if (el && el.hidden){ el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
  if (view !== 'place') $('heroBg').classList.remove('on'); else if (current && hasChart(current) && $('heroBg').style.backgroundImage) $('heroBg').classList.add('on');
  VIEWS.forEach(v => $(v).hidden = v !== view);
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
  requestAnimationFrame(() => $('shelf').dispatchEvent(new Event('scroll')));
  $('regions').innerHTML = MARKETS.filter(cc => INDEX.countries[cc] && byIso.get(cc)).slice(0, 10).map(cc =>
    `<button class="region" data-cc="${cc}"><span>${flag(cc)} ${esc(nice(byIso.get(cc)))}</span>${I.chev}</button>`).join('');
  const n = entries.length, d = INDEX.updated ? new Date(INDEX.updated) : null;
  $('fine').textContent = `${n} country charts from Apple Music's most‑played songs${d ? ', updated ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}. 30‑second previews.`;
}
$('shelf').addEventListener('click', e => { if (shelfDragged){ e.preventDefault(); e.stopPropagation(); return; } const b = e.target.closest('[data-cc]'); if (b) openCountry(byIso.get(b.dataset.cc), { autoplay: 0 }); }, true);

/* shelf sliding: mouse drag with momentum, vertical wheel → horizontal, arrow buttons.
   Touch already scrolls natively. */
let shelfDragged = false;
{
  const sh = $('shelf');
  let x0 = 0, s0 = 0, down = false, lastX = 0, lastT = 0, vel = 0, raf = 0;
  const updateNav = () => {
    $('shelfPrev').disabled = sh.scrollLeft < 4;
    $('shelfNext').disabled = sh.scrollLeft > sh.scrollWidth - sh.clientWidth - 4;
  };
  sh.addEventListener('scroll', updateNav, { passive: true });
  new ResizeObserver(updateNav).observe(sh);
  sh.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    cancelAnimationFrame(raf); down = true; shelfDragged = false;
    x0 = lastX = e.clientX; s0 = sh.scrollLeft; lastT = performance.now(); vel = 0;
  });
  addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - x0;
    if (!shelfDragged && Math.abs(dx) > 5){ shelfDragged = true; sh.classList.add('dragging'); }
    if (!shelfDragged) return;
    sh.scrollLeft = s0 - dx;
    const now = performance.now(); vel = (e.clientX - lastX) / Math.max(now - lastT, 1); lastX = e.clientX; lastT = now;
  });
  addEventListener('pointerup', () => {
    if (!down) return; down = false;
    if (!shelfDragged) return;
    // glide, then let scroll-snap settle on a card
    let v = -vel * 16;
    const glide = () => {
      v *= 0.92; sh.scrollLeft += v;
      if (Math.abs(v) > 0.5 && !reduceMotion.matches) raf = requestAnimationFrame(glide);
      else { sh.classList.remove('dragging'); setTimeout(() => shelfDragged = false, 0); }
    };
    raf = requestAnimationFrame(glide);
  });
  sh.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // trackpads already scroll sideways
    const max = sh.scrollWidth - sh.clientWidth;
    if ((e.deltaY < 0 && sh.scrollLeft <= 0) || (e.deltaY > 0 && sh.scrollLeft >= max)) return;
    e.preventDefault(); sh.scrollBy({ left: e.deltaY, behavior: 'auto' });
  }, { passive: false });
  const page = dir => { sh.scrollBy({ left: dir * (sh.clientWidth - 40), behavior: reduceMotion.matches ? 'auto' : 'smooth' }); haptic('light'); };
  $('shelfPrev').onclick = () => page(-1);
  $('shelfNext').onclick = () => page(1);
}
$('regions').addEventListener('click', e => { const b = e.target.closest('[data-cc]'); if (b) openCountry(byIso.get(b.dataset.cc)); });

/* ---------- country page ---------- */
let current = null;   // feature shown in the panel
function select(f){
  if (selId) map.setFeatureState({ source: 'countries', id: selId }, { sel: false });
  selId = f?.id ?? null;
  if (selId) map.setFeatureState({ source: 'countries', id: selId }, { sel: true });
  const flt = ['==', ['id'], selId ?? -1];
  map.setFilter('sel-glow', flt); map.setFilter('sel-line', flt);
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
  if (typeof gameOn !== 'undefined' && gameOn) endGameMode();
  current = f; select(f); setSpin(false); haptic('medium');
  const cc = f.properties.iso2?.toLowerCase() || '', name = nice(f);
  const c = bounds(f).getCenter();
  $('cflag').innerHTML = flag(cc);
  $('cname').textContent = name;
  $('csub').textContent = `${Math.abs(c.lat).toFixed(1)}° ${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lng).toFixed(1)}° ${c.lng >= 0 ? 'E' : 'W'}`;
  $('heroBg').classList.remove('on'); $('chips').innerHTML = '';
  $('links').innerHTML = services(name).map(([s, sub, col, url]) =>
    `<a class="row" href="${esc(url)}" target="_blank" rel="noopener"><span class="ic" style="background:${col}">${I.note}</span><span class="t">${esc(s)}</span>${I.chev}</a>`).join('');
  $('spotLink')?.remove();
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
  const v = vibe(data); $('vibe').textContent = v; $('vibe').hidden = !v;
  const local = t.filter(x => x.x === 1).length;
  $('localN').textContent = t[0]?.x ? local : '';
  $('ctabs').hidden = !t[0]?.x;
  setTab('top', true);
  $('tracks').innerHTML = t.map((x, i) => `
    <li class="tr${x.x === 1 ? ' only' : ''}" data-i="${i}" style="--i:${Math.min(i, 14)}">
      <span class="rk">${i + 1}${move(x, i)}</span>
      <span class="ar"><img src="${esc(art(x.art, 100))}" srcset="${esc(art(x.art, 200))} 2x" alt="" loading="lazy" width="46" height="46"></span>
      <span class="tt"><div class="tn">${esc(x.n)}${x.e ? '<span class="ex" aria-label="Explicit">E</span>' : ''}</div><div class="ta">${esc(x.a)}</div></span>
      <a class="ext" href="${esc(x.url)}" target="_blank" rel="noopener" aria-label="Open ${esc(x.n)}">${I.ext}</a>
      <button class="play" aria-label="Play ${esc(x.n)} by ${esc(x.a)}"></button>
    </li>`).join('');
  spotifyLinks(data);
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
  const c = map.getCenter();
  map.flyTo({ center: [c.lng, Math.max(-25, Math.min(30, c.lat))], zoom: Math.min(map.getZoom(), START_ZOOM()), pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduceMotion.matches ? 0 : 1800 });
  setTimeout(() => { if (!current && phone() && !reduceMotion.matches) setSpin(true); }, 2000);
}
$('closeBtn').onclick = closeCountry;
map.on('click', 'fill', e => { const f = byId.get(e.features[0].id); if (gameOn) guess(f); else openCountry(f); });

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
const Q = { cc: null, i: -1, tracks: [], shuffle: false, list: null, li: 0 };
let engine = 'preview', spPlaying = false, spUri = null, spWas = false;
const isPlaying = () => engine === 'spotify' ? spPlaying : !audio.paused;
let marker = null, radio = false, playToken = 0;

function setPlayIcon(){
  const on = isPlaying();
  $('pIc').innerHTML = on ? I.pause : I.play;
  $('pPlay').setAttribute('aria-label', on ? 'Pause' : 'Play');
  document.body.classList.toggle('playing', on);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  marker?.getElement().classList.toggle('live', on);
}
async function playAt(cc, i, keepList){
  if (!keepList) Q.list = null;
  const token = ++playToken;
  let data; try { data = await loadChart(cc); } catch { toast('Couldn’t load that chart.'); return; }
  if (token !== playToken) return;
  const t = data.tracks[i]; if (!t) return;
  Q.cc = cc; Q.i = i; Q.tracks = data.tracks;
  $('player').classList.remove('bump'); void $('player').offsetWidth; $('player').classList.add('bump');
  window.GTglass?.pulse($('pArt'));
  // full song through Spotify when this browser can play it, else the 30 s preview
  engine = 'preview';
  if (window.GTSpotify?.canPlayFull()){
    try { const m = await GTSpotify.playFull(t, cc); if (token !== playToken) return; if (m){ engine = 'spotify'; spUri = m.uri; spWas = false; audio.pause(); } } catch {}
  }
  if (engine === 'preview'){
    if (!t.p){ toast('No preview for this song, skipping'); return next(); }
    audio.src = t.p; audio.currentTime = 0;
    try { await audio.play(); } catch (err) { if (err.name !== 'AbortError') toast('Tap play to start listening'); }
  }
  const f = byIso.get(cc), country = nice(f);
  $('player').classList.remove('idle');
  $('pImg').src = art(t.art, 200); $('pImg').hidden = false;
  $('pFlag').innerHTML = flag(cc);
  $('pTitle').textContent = t.n;
  $('pSub').textContent = `${t.a} · No. ${i + 1} in ${country}${engine === 'spotify' ? ' · Spotify' : ''}`;
  setPlayIcon();
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
  if (engine === 'spotify'){ GTSpotify.toggle(); return; }
  if (!audio.src){ if (current && hasChart(current)) playAt(current.properties.iso2.toLowerCase(), 0); else startRadio(); return; }
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
}
function next(){
  if (radio) return radioStep();
  if (Q.list){ if (Q.li + 1 < Q.list.length){ Q.li++; return playAt(Q.list[Q.li].cc, Q.list[Q.li].i, true); } stopAll(); return toast('End of your mix'); }
  if (!Q.cc) return;
  const n = Q.shuffle ? Math.floor(Math.random() * Q.tracks.length) : Q.i + 1;
  if (n < Q.tracks.length) playAt(Q.cc, n); else { audio.pause(); toast('End of chart'); }
}
function prev(){
  if (Q.list && Q.li > 0 && (engine === 'spotify' || audio.currentTime <= 3)){ Q.li--; return playAt(Q.list[Q.li].cc, Q.list[Q.li].i, true); }
  if (engine === 'spotify'){ GTSpotify.seek(0); return; }
  if (audio.currentTime > 3 || !Q.cc){ audio.currentTime = 0; return; }
  if (Q.i > 0) playAt(Q.cc, Q.i - 1);
}
$('pPlay').onclick = toggle; $('pNext').onclick = next; $('pPrev').onclick = prev;
$('pArt').onclick = () => { if (Q.cc) openCountry(byIso.get(Q.cc)); };
audio.addEventListener('play', setPlayIcon); audio.addEventListener('pause', setPlayIcon);
audio.addEventListener('ended', () => { if (engine === 'preview') next(); });
function stopAll(){ if (engine === 'spotify') GTSpotify.pause(); audio.pause(); }
audio.addEventListener('error', () => { if (audio.src && engine === 'preview'){ toast('Preview unavailable, skipping'); setTimeout(next, 600); } });
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
seek.addEventListener('change', () => { if (engine === 'spotify') GTSpotify.seek(+seek.value * 1000); else audio.currentTime = +seek.value; scrubbing = false; });
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
  $('dockRadio').setAttribute('aria-pressed', String(on));
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
$('radioBtn').onclick = () => { if (radio){ setRadio(false); stopAll(); } else startRadio(); };
$('dockRadio').onclick = () => { haptic('medium'); $('radioBtn').click(); };
// focus in the same tap so the phone keyboard opens
$('dockSearch').onclick = () => { setSheet('full'); show(q.value ? 'results' : (current ? 'place' : 'home')); q.focus({ preventScroll: true }); };

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
function pick(i){ const x = hits[i]; if (!x) return; q.value = ''; q.blur(); if (gameOn){ show('game'); setSheet(phone() ? 'half' : 'full'); guess(x.f); } else openCountry(x.f); }
res.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) pick(+b.dataset.i); });
$('searchForm').onsubmit = e => { e.preventDefault(); if (!res.hidden) pick(active); };

/* =====================================================================
   NEW FEATURES: vibe line · genre map · only-here · travel mode · daily game · Spotify
   ===================================================================== */

/* ---------- helpers: distance between countries ---------- */
const centre = f => bounds(f).getCenter();
function km(a, b){
  const R = 6371, r = d => d * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearing(a, b){
  const r = d => d * Math.PI / 180;
  const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const chartCountries = () => Object.keys(INDEX.countries).filter(cc => byIso.get(cc));

/* ---------- #2 vibe line: one sentence from the chart itself ---------- */
function vibe(data){
  const t = data.tracks; if (!t?.length) return '';
  const parts = [];
  const g = {}; t.forEach(x => { if (x.g) g[x.g] = (g[x.g] || 0) + 1; });
  const [tg, tn] = Object.entries(g).sort((a, b) => b[1] - a[1])[0] || [];
  if (tg){
    const pct = Math.round(tn / t.length * 100);
    parts.push(pct >= 50 ? `${tg} rules here, with ${pct}% of the top ${t.length}.` : pct >= 30 ? `${tg} leads a mixed chart (${pct}%).` : `No single genre dominates; ${tg} edges ahead at ${pct}%.`);
  }
  const a = {}; t.forEach(x => x.a.split(/,|&| x |feat\./i).map(s => s.trim()).filter(Boolean).forEach(n => a[n] = (a[n] || 0) + 1));
  const [ta, an] = Object.entries(a).sort((x, y) => y[1] - x[1])[0] || [];
  if (an >= 3) parts.push(`${ta} has ${an} songs in it.`);
  if (t[0].x){
    const local = t.filter(x => x.x === 1).length;
    if (local >= 12) parts.push(`Mostly homegrown: ${local} songs chart nowhere else.`);
    else if (local <= 3) parts.push(`Global taste: almost every song here charts abroad too.`);
    else parts.push(`${local} of these songs chart only here.`);
  }
  const fresh = t.filter(x => x.pr === 0).length;
  if (t[0].pr !== undefined && fresh >= 3) parts.push(`${fresh} new entries since the last update.`);
  return parts.slice(0, 3).join(' ');
}

/* ---------- #9 movement + "only here" tab ---------- */
function move(x, i){
  if (x.pr === undefined) return '';
  if (x.pr === 0) return '<span class="mv new">NEW</span>';
  const d = x.pr - (i + 1);
  return d > 0 ? `<span class="mv up" aria-label="up ${d}">▲${d}</span>` : d < 0 ? `<span class="mv dn" aria-label="down ${-d}">▼${-d}</span>` : '';
}
let ctab = 'top';
function setTab(t, quiet){
  ctab = t;
  $('ctabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
  $('tracks').classList.toggle('local', t === 'local');
  if (!quiet) haptic('light');
  const empty = t === 'local' && !$('tracks').querySelector('.tr.only');
  $('tracks').dataset.empty = empty ? 'Every song in this chart also charts in other countries.' : '';
}
$('ctabs').addEventListener('click', e => { const b = e.target.closest('button[data-t]'); if (b) setTab(b.dataset.t); });

/* ---------- #3 genre map ---------- */
const GENRES = [
  ['Pop', '#5e5ce6', /^(pop|k-pop|j-pop|c-pop|mandopop|cantopop|t-pop|thai pop|indo pop|pop latino|russian pop|turkish pop|arabic pop|pop in spanish|french pop|german pop|v-pop|original pilipino music|opm)$/i, ['K-Pop','J-Pop']],
  ['Hip-Hop', '#ff9f0a', /hip.?hop|rap|drill|trap/i],
  ['Latin', '#ff453a', /latin|reggaeton|urbano|música mexicana|regional mexican|cumbia|sertanejo|brazilian|funk|samba|pagode|bachata|salsa|tropical|banda/i],
  ['African', '#30d158', /afro|african|amapiano|highlife|bongo|gqom|kwaito|zouk|naija/i],
  ['Dance', '#64d2ff', /dance|electronic|house|techno|edm/i],
  ['Rock', '#a2845e', /rock|alternative|metal|punk|indie/i],
  ['R&B', '#bf5af2', /r&b|soul/i],
  ['Regional', '#ffd60a', /arabic|khaleeji|indian|bollywood|punjabi|tamil|telugu|turkish|world|folk|chanson|schlager|enka|dangdut|tango|reggae|dancehall|soca|calypso|middle eastern|persian|greek|balkan|turbo/i],
  ['Other', '#8e8e93', /./]
];
const groupOf = name => { if (!name) return 8; for (let k = 0; k < GENRES.length; k++) if (GENRES[k][2].test(name)) return k; return 8; };
let genreOn = false;
const BASE_FILL = { color: null, opacity: null };
function applyGenres(){
  for (const cc of chartCountries()){
    const f = byIso.get(cc), dg = INDEX.countries[cc].dg || INDEX.countries[cc].g;
    map.setFeatureState({ source: 'countries', id: f.id }, { gi: groupOf(dg) });
  }
}
function setGenreMap(on){
  genreOn = on; $('genreToggle').checked = on;
  if (!BASE_FILL.color){ BASE_FILL.color = map.getPaintProperty('fill', 'fill-color'); BASE_FILL.opacity = map.getPaintProperty('fill', 'fill-opacity'); }
  if (on){
    applyGenres();
    map.setPaintProperty('fill', 'fill-color', ['case', ['boolean', ['feature-state', 'sel'], false], '#ffffff',
      ['match', ['coalesce', ['feature-state', 'gi'], -1], ...GENRES.flatMap(([, c], k) => [k, c]), 'rgba(0,0,0,0)']]);
    map.setPaintProperty('fill', 'fill-opacity', ['case', ['boolean', ['feature-state', 'hover'], false], 0.75, ['boolean', ['feature-state', 'chart'], false], 0.55, 0]);
    const used = new Set(chartCountries().map(cc => groupOf(INDEX.countries[cc].dg || INDEX.countries[cc].g)));
    $('legend').innerHTML = GENRES.map(([n, c], k) => used.has(k) ? `<span><i style="background:${c}"></i>${n}</span>` : '').join('');
    $('legend').hidden = false;
  } else {
    map.setPaintProperty('fill', 'fill-color', BASE_FILL.color); map.setPaintProperty('fill', 'fill-opacity', BASE_FILL.opacity);
    $('legend').hidden = true;
  }
  try { localStorage.setItem('gt-genres', on ? '1' : '0'); } catch {}
}
$('genreToggle').addEventListener('change', e => { haptic('medium'); setGenreMap(e.target.checked); if (e.target.checked && phone()) setSheet('peek'); });

/* ---------- #10 travel mode ---------- */
function countryAt(lng, lat){
  const inside = (pt, ring) => { let c = false; for (let i = 0, k = ring.length - 1; i < ring.length; k = i++){ const [xi, yi] = ring[i], [xk, yk] = ring[k]; if ((yi > pt[1]) !== (yk > pt[1]) && pt[0] < (xk - xi) * (pt[1] - yi) / (yk - yi) + xi) c = !c; } return c; };
  for (const f of C.features){
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) for (const L of [lng, lng + 360, lng - 360]) if (inside([L, lat], p[0])) return f;
  }
  return null;
}
function nearestCharts(f, n){
  const c = centre(f), me = f.properties.iso2?.toLowerCase();
  return chartCountries().filter(cc => cc !== me).map(cc => [cc, km(c, centre(byIso.get(cc)))]).sort((a, b) => a[1] - b[1]).slice(0, n);
}
async function buildTrip(f){
  if (!f) return;
  let dest = f, cc = f.properties.iso2?.toLowerCase(), note = '';
  if (!INDEX.countries[cc]){ const [near] = nearestCharts(f, 1); note = `${nice(f)} has no chart, so we start from ${nice(byIso.get(near[0]))} next door.`; dest = byIso.get(near[0]); cc = near[0]; }
  select(dest); fly(dest); setSpin(false);
  const neigh = nearestCharts(dest, 3).filter(([, d]) => d < 3500).slice(0, 3);
  const parts = [[cc, 6], ...neigh.map(([n]) => [n, 3])];
  $('tOut').innerHTML = '<p class="vsub">Building your mix…</p>';
  const charts = await Promise.all(parts.map(([c]) => loadChart(c).catch(() => null)));
  const pools = parts.map(([c, n], k) => (charts[k]?.tracks || []).map((t, i) => ({ cc: c, i, t })).filter(x => x.t.p).slice(0, n));
  const list = []; let added = true;
  for (let r = 0; added; r++){ added = false; for (const p of pools) if (p[r]){ list.push(p[r]); added = true; } }
  if (!list.length){ $('tOut').innerHTML = '<p class="vsub">Couldn’t load those charts. Try again.</p>'; return; }
  const names = [cc, ...neigh.map(([n]) => n)];
  $('tOut').innerHTML = `
    ${note ? `<p class="vsub">${esc(note)}</p>` : ''}
    <div class="trip"><div class="trip-flags">${names.map(c => flag(c)).join('')}</div>
      <div class="trip-t"><b>Your ${esc(nice(dest))} trip mix</b><small>${list.length} songs · ${names.map(c => esc(nice(byIso.get(c)))).join(', ')}</small></div></div>
    <button class="btn primary wide" id="tPlay">${'<svg width="15" height="15" viewBox="0 0 18 18"><path d="M5 3.2v11.6c0 .7.8 1.2 1.4.8l9-5.8c.6-.4.6-1.2 0-1.6l-9-5.8C5.8 2 5 2.5 5 3.2z" fill="currentColor"/></svg>'}Play the mix</button>
    <ol class="tracks mix">${list.map((x, k) => `<li class="tr" data-k="${k}"><span class="rk">${flag(x.cc)}</span><span class="ar"><img src="${esc(art(x.t.art, 100))}" alt="" loading="lazy" width="46" height="46"></span><span class="tt"><div class="tn">${esc(x.t.n)}</div><div class="ta">${esc(x.t.a)} · ${esc(nice(byIso.get(x.cc)))}</div></span><span></span><button class="play" aria-label="Play ${esc(x.t.n)}"></button></li>`).join('')}</ol>`;
  const q2 = list.map(({ cc, i }) => ({ cc, i }));
  const start = k => { setRadio(false); Q.list = q2; Q.li = k; playAt(q2[k].cc, q2[k].i, true); haptic('success'); };
  $('tPlay').onclick = () => start(0);
  $('tOut').querySelector('.mix').addEventListener('click', e => { const b = e.target.closest('.play'); if (b) start(+b.closest('.tr').dataset.k); });
}
function openTravel(){
  show('travel'); setSheet(phone() ? 'full' : 'full');
  $('tlist').innerHTML = all.map(x => `<option value="${esc(x.name)}">`).join('');
}
$('travelBtn').onclick = () => { haptic('light'); openTravel(); };
$('travelBack').onclick = () => { show(current ? 'place' : 'home'); };
$('tq').addEventListener('change', () => {
  const v = $('tq').value.trim().toLowerCase(); if (!v) return;
  const x = all.find(a => a.name.toLowerCase() === v) || all.find(a => a.key.includes(v));
  if (x){ $('tq').blur(); buildTrip(x.f); } else toast('Pick a country from the list');
});
$('tHere').onclick = () => {
  if (!navigator.geolocation) return toast('Location isn’t available in this browser');
  $('tHere').textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(p => {
    $('tHere').textContent = 'Use my location';
    const f = countryAt(p.coords.longitude, p.coords.latitude);
    if (!f) return toast('Couldn’t tell which country you’re in');
    $('tq').value = nice(f); buildTrip(f);
  }, () => { $('tHere').textContent = 'Use my location'; toast('Location permission was declined'); }, { timeout: 10000, maximumAge: 600000 });
};

/* ---------- #7 daily game ---------- */
let gameOn = false, game = null;
const clip = new Audio(); clip.preload = 'none';
const dayNo = () => Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 864e5) + 1;
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gstore = { get(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
async function makePuzzle(day){
  const r = rng(day * 7919);
  const pool = chartCountries().sort();
  for (let tries = 0; tries < 20; tries++){
    const cc = pool[Math.floor(r() * pool.length)];
    let data; try { data = await loadChart(cc); } catch { continue; }
    const cands = data.tracks.map((t, i) => ({ t, i })).filter(x => x.t.p && (x.t.x === 1 || x.t.x === undefined)).slice(0, 12);
    if (!cands.length) continue;
    const pick = cands[Math.floor(r() * cands.length)];
    return { day, cc, i: pick.i, t: pick.t };
  }
  return null;
}
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
async function openGame(){
  show('game'); setSheet(phone() ? 'half' : 'full'); setSpin(false); stopAll(); setRadio(false);
  const day = dayNo();
  $('gameNum').textContent = '#' + day;
  if (!game || game.day !== day){
    $('guesses').innerHTML = '<li class="hint">Loading today’s song…</li>';
    game = await makePuzzle(day);
    if (!game){ $('guesses').innerHTML = '<li class="hint">Couldn’t load today’s puzzle. Try again later.</li>'; return; }
    const saved = gstore.get('gt-game', null);
    game.guesses = saved?.day === day ? saved.guesses : [];
    game.done = saved?.day === day ? saved.done : false;
  }
  gameOn = !game.done;
  clip.src = game.t.p;
  renderGame();
  if (gameOn) toast(phone() ? 'Play the clip, then tap a country' : 'Play the clip, then click a country');
}
function endGameMode(){ gameOn = false; clip.pause(); }
function renderGame(){
  const ans = byIso.get(game.cc), ac = centre(ans);
  $('guesses').innerHTML = game.guesses.map(cc => {
    const f = byIso.get(cc), c = centre(f), d = Math.round(km(c, ac)), hit = cc === game.cc;
    const pct = hit ? 100 : Math.max(0, Math.round((1 - d / 20037) * 100));
    return `<li class="g${hit ? ' hit' : ''}"><span class="gf">${flag(cc)}</span><span class="gn">${esc(nice(f))}</span>
      <span class="gd">${hit ? 'Got it' : d.toLocaleString() + ' km'}</span><span class="ga">${hit ? '✓' : ARROWS[Math.round(bearing(c, ac) / 45) % 8]}</span><span class="gp" style="--p:${pct}%">${pct}%</span></li>`;
  }).join('') + (game.done ? '' : Array.from({ length: 6 - game.guesses.length }, () => '<li class="g empty"></li>').join(''));
  const st = gstore.get('gt-stats', { played: 0, won: 0, streak: 0, best: 0 });
  $('gameStats').textContent = st.played ? `Played ${st.played} · won ${Math.round(st.won / st.played * 100)}% · streak ${st.streak} · best ${st.best}` : '';
  $('gameSub').textContent = game.done ? 'Done for today · new song tomorrow' : 'Guess the country';
  if (!game.done){ $('gameEnd').hidden = true; return; }
  const won = game.guesses.at(-1) === game.cc;
  $('gameEnd').hidden = false;
  $('gameEnd').innerHTML = `
    <p class="gres">${won ? `You got it in ${game.guesses.length}!` : 'Out of guesses. It was…'}</p>
    <div class="gsong"><img src="${esc(art(game.t.art, 200))}" alt="" width="64" height="64"><div><b>${esc(game.t.n)}</b><small>${esc(game.t.a)}</small><small>${flag(game.cc)} No. ${game.i + 1} in ${esc(nice(ans))}${game.t.x === 1 ? ' · charts nowhere else' : ''}</small></div></div>
    <div class="cta"><button class="btn primary" id="gPlay">Play it</button><button class="btn" id="gShare">Share</button></div>`;
  $('gPlay').onclick = () => { setRadio(false); playAt(game.cc, game.i); };
  $('gShare').onclick = async () => {
    const sq = game.guesses.map(cc => { if (cc === game.cc) return '🟩'; const p = 1 - km(centre(byIso.get(cc)), ac) / 20037; return p > .9 ? '🟨' : p > .75 ? '🟧' : '🟥'; }).join('');
    const text = `Globe Tunes #${game.day} 🎵 ${won ? game.guesses.length : 'X'}/6\n${sq}\n${location.origin + location.pathname}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Result copied'); } } catch {}
  };
}
function guess(f){
  if (!gameOn || !f) return;
  const cc = f.properties.iso2?.toLowerCase(); if (!cc || game.guesses.includes(cc)) return;
  game.guesses.push(cc); select(f);
  const won = cc === game.cc;
  if (won || game.guesses.length >= 6){
    game.done = true; gameOn = false; clip.pause();
    const st = gstore.get('gt-stats', { played: 0, won: 0, streak: 0, best: 0, last: 0 });
    st.played++; if (won){ st.won++; st.streak = st.last === game.day - 1 ? st.streak + 1 : 1; st.best = Math.max(st.best, st.streak); } else st.streak = 0;
    st.last = game.day; gstore.set('gt-stats', st);
    const a = byIso.get(game.cc); select(a); fly(a);
    haptic(won ? 'success' : 'heavy');
  } else haptic('light');
  gstore.set('gt-game', { day: game.day, guesses: game.guesses, done: game.done });
  renderGame();
}
let clipRaf = 0;
$('clipBtn').onclick = () => {
  if (!game) return;
  if (!clip.paused){ clip.pause(); return; }
  stopAll(); clip.currentTime = 0;
  clip.play().catch(() => toast('Tap again to play'));
};
clip.addEventListener('play', () => {
  $('clipIc').innerHTML = I.pause;
  const tick = () => {
    const t = clip.currentTime, lim = game?.done ? (clip.duration || 30) : 10;
    $('clipFill').style.width = Math.min(100, t / lim * 100) + '%';
    $('clipT').textContent = `${Math.min(lim, t).toFixed(0)}s / ${lim.toFixed(0)}s`;
    if (t >= lim){ clip.pause(); return; }
    if (!clip.paused) clipRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(clipRaf); tick();
});
clip.addEventListener('pause', () => { $('clipIc').innerHTML = I.play; });
$('gameBtn').onclick = () => { haptic('light'); openGame(); };
$('gameBack').onclick = () => { endGameMode(); show(current ? 'place' : 'home'); };
{ const s = gstore.get('gt-game', null); if (s?.day === dayNo() && s.done) $('gameSub').textContent = 'Done for today · new song tomorrow'; }

/* ---------- #1 Spotify ---------- */
const SP = window.GTSpotify;
if (SP?.configured){
  $('spotBox').hidden = false;
  SP.onChange(s => {
    $('spotBtn').textContent = s.connected ? 'Disconnect' : 'Connect';
    $('spotTitle').textContent = s.connected ? `Spotify connected${s.name ? ' · ' + s.name : ''}` : 'Full songs with Spotify';
    $('spotSub').textContent = !s.connected ? 'Connect to play whole tracks and save charts as playlists'
      : s.full ? 'Full songs play right here (Premium)'
      : s.premium && s.mobile ? 'Song links open full tracks in the Spotify app'
      : s.premium ? 'Getting the player ready…'
      : 'Previews play here · full songs open in Spotify · save charts as playlists';
    $('spotSave').hidden = !s.connected;
    if (s.connected && current && hasChart(current)) loadChart(current.properties.iso2.toLowerCase()).then(spotifyLinks).catch(() => {});
  });
  $('spotBtn').onclick = () => { if (SP.connected()) SP.logout(); else SP.login().catch(() => toast('Spotify isn’t set up yet')); };
  $('spotSave').onclick = async () => {
    if (!current) return;
    const cc = current.properties.iso2.toLowerCase();
    const b = $('spotSave'); b.disabled = true; const old = b.lastChild.textContent; b.lastChild.textContent = 'Saving…';
    try {
      const data = await loadChart(cc);
      const r = await SP.savePlaylist(`Top ${data.tracks.length} · ${nice(current)}`, `Most played in ${nice(current)} right now, via Globe Tunes`, data.tracks, cc);
      haptic('success'); toast(`Saved ${r.count} of ${r.of} songs to Spotify`);
      if (r.url && /^https:\/\//.test(r.url)){
        let l = $('spotLink'); if (!l){ l = document.createElement('a'); l.id = 'spotLink'; l.className = 'spot-link'; l.target = '_blank'; l.rel = 'noopener'; $('cta').after(l); }
        l.href = r.url; l.textContent = 'Open the playlist in Spotify ↗';
      }
    } catch { toast('Couldn’t save the playlist'); }
    b.disabled = false; b.lastChild.textContent = old;
  };
  // full-length state from the in-page Spotify player
  SP._onState = s => {
    if (engine !== 'spotify' || !s) return;
    const playing = !s.paused;
    if (spWas && s.paused && s.position === 0 && s.track_window?.previous_tracks?.some(x => x.uri === spUri)){ spWas = false; next(); return; }
    spWas = spWas || playing;
    spPlaying = playing; setPlayIcon();
  };
  setInterval(async () => {
    if (engine !== 'spotify') return;
    const s = await SP.current(); if (!s) return;
    const d = s.duration / 1000, t = s.position / 1000;
    if (!scrubbing){ seek.max = d; seek.value = t; }
    const p = (t / d * 100).toFixed(2) + '%'; seek.style.setProperty('--p', p); $('player').style.setProperty('--pp', p);
    $('tCur').textContent = fmt(t); $('tDur').textContent = '-' + fmt(d - t);
  }, 500);
}
// when connected, each song's ↗ opens it in Spotify instead of Apple Music
async function spotifyLinks(data){
  if (!SP?.connected?.()) return;
  const rows = [...$('tracks').querySelectorAll('.tr')];
  for (const [k, row] of rows.entries()){
    const t = data.tracks[+row.dataset.i]; if (!t) continue;
    const m = await SP.match(t, data.cc); if (!m?.url) continue;
    const a = row.querySelector('.ext'); if (a){ a.href = m.url; a.setAttribute('aria-label', `Open ${t.n} in Spotify`); a.classList.add('sp'); }
    if (!current || current.properties.iso2?.toLowerCase() !== data.cc) break;
  }
}

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

/* ---------- effects mode ----------
   Lite is the default: solid panels, 1x map, no auto-spin. The ✨ button turns the
   full glass effects on (remembered per browser). ?full / ?lite override for one visit. */
const params = new URLSearchParams(location.search);
let savedFx = null; try { savedFx = localStorage.getItem('gt-fx'); } catch {}
const fxMode = params.has('full') ? 'full' : params.has('lite') ? 'lite' : (savedFx === 'full' ? 'full' : 'lite');
function goLite(auto){
  if (document.documentElement.classList.contains('lite')) return;
  document.documentElement.classList.add('lite');
  try { map.setPixelRatio(1); } catch {}
  setSpin(false);
  $('fxBtn').setAttribute('aria-pressed', 'false');
  if (auto){ toast('Switched to smooth mode for this device'); try { localStorage.setItem('gt-fx', 'lite'); } catch {} }
}
if (fxMode === 'lite'){ goLite(false); if (phone() && !reduceMotion.matches) setSpin(true); }   // phones: GPU handles the spin fine, and it's the first impression
else $('fxBtn').setAttribute('aria-pressed', 'true');
$('fxBtn').onclick = () => {
  const next = document.documentElement.classList.contains('lite') ? 'full' : 'lite';
  try { localStorage.setItem('gt-fx', next); } catch {}
  haptic('medium');
  toast(next === 'full' ? 'High quality on' : 'Smooth mode on');
  setTimeout(() => { if (location.search) location.search = ''; else location.reload(); }, 600);   // reload in the new mode
};
function checkSpeed(){
  if (params.has('full')) return;
  if (fxMode !== 'full'){
    // smooth mode on a phone still spins: stop the spin if the phone can't keep 30 fps
    if (!phone() || !spinning) return;
    let n = 0; const t0 = performance.now(); const f = () => n++;
    map.on('render', f);
    setTimeout(() => { map.off('render', f); const fps = n / ((performance.now() - t0) / 1000); window.GT_FPS = fps; if (spinning && !busy && fps < 30) setSpin(false); }, 2500);
    return;
  }
  // full effects chosen: bail out to lite if the map can't draw 24 fps while spinning
  let frames = 0; const t0 = performance.now();
  const onRender = () => frames++;
  map.on('render', onRender);
  setTimeout(() => {
    map.off('render', onRender);
    const fps = frames / ((performance.now() - t0) / 1000);
    window.GT_FPS = fps;
    if ((map.isMoving() || spinning) && fps < 24) goLite(true);
  }, 2500);
}

/* ---------- boot ---------- */
setSheet(phone() ? 'peek' : 'full');
addEventListener('resize', () => setSheet(sheetState));
document.body.classList.add('intro');
setTimeout(() => document.body.classList.remove('intro'), 2500);
map.on('load', () => {
  document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  if (!reduceMotion.matches) map.easeTo({ zoom: START_ZOOM(), center: [19, 30], duration: 3200, easing: t => 1 - (1 - t) ** 4 });
  setTimeout(spin, reduceMotion.matches ? 0 : 3300);
  setTimeout(checkSpeed, 3600);   // measure while the globe is spinning
});
let seenHint = false; try { seenHint = localStorage.getItem('gt-hint') === '1'; } catch {}
if (!seenHint) setTimeout(() => { if (!current){ toast(phone() ? 'Tap any country to hear its charts' : 'Click any country to hear its charts'); try { localStorage.setItem('gt-hint', '1'); } catch {} } }, 4200);
fetch('data/index.json').then(r => r.json()).then(d => {
  INDEX = d;
  for (const cc of Object.keys(d.countries)){ const f = byIso.get(cc); if (f) map.setFeatureState({ source: 'countries', id: f.id }, { chart: true }); }
  renderHome();
  try { if (localStorage.getItem('gt-genres') === '1') setGenreMap(true); } catch {}
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
