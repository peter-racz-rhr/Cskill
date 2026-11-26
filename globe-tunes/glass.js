// Liquid Glass layer: real refraction (Chromium) + spring "jelly" press physics (all browsers),
// powered by @liquefy-ui/core (MIT, vendored in vendor/liquefy-core.mjs).
import { attachLiquidLens, attachLiquidMotion, isLensSupported } from './vendor/liquefy-core.mjs';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lensOK = isLensSupported();
document.documentElement.classList.toggle('lq-lens', lensOK);

/* ---------- refraction lens on glass surfaces ----------
   bezel = width of the bending band at the rim; small controls bend almost to the centre. */
const LENSES = [
  ['#sheet',            { bezel: 26, blur: 1.2, saturation: 1.5, dispersion: .35, strength: .9 }],
  ['#player',           { bezel: 22, blur: 1,   saturation: 1.5, dispersion: .4,  strength: .9 }],
  ['.seg',              { bezel: 12, blur: .6,  saturation: 1.6, dispersion: .5 }],
  ['.stack',            { bezel: 16, blur: .6,  saturation: 1.6, dispersion: .5 }],
  ['.solo',             { bezel: 16, blur: .6,  saturation: 1.6, dispersion: .5 }],
  ['#tip',              { bezel: 12, blur: .8,  saturation: 1.5, dispersion: .3 }],
];
if (lensOK) for (const [sel, opts] of LENSES)
  document.querySelectorAll(sel).forEach(el => attachLiquidLens(el, { respectReducedTransparency: true, ...opts }));

/* ---------- press physics ----------
   Every button gets the jelly squash + magnetic lean; the hero buttons also get the
   WebGL rim light that follows the pointer and a ripple on press. */
const MOTION = '.btn, .pb, .solo, .stack button, .seg button, .radio, .card .ca, .region, .iconbtn, .p-art, #results button, .row';
const LIT = '.btn.primary, .radio, #pPlay';
const controllers = new WeakMap();

function attach(el){
  if (controllers.has(el) || reduce) return;
  const lit = el.matches(LIT);
  let canvas = null;
  if (lit){
    canvas = document.createElement('canvas');
    canvas.className = 'lq-canvas'; canvas.setAttribute('aria-hidden', 'true');
    el.prepend(canvas);
  }
  const small = el.offsetWidth < 60;
  controllers.set(el, attachLiquidMotion(el, canvas, {
    wobbliness: small ? .55 : .35, bounce: small ? .12 : .07, tilt: small ? 0 : 3,
    glow: lit, ripple: lit, sparkle: lit, shimmer: lit, tint: '#ff375f',
    respectReducedMotion: true, elasticity: small ? .25 : 0, reach: 40
  }));
}
const scan = root => root.querySelectorAll?.(MOTION).forEach(attach);
scan(document);
new MutationObserver(list => {
  for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1){ if (n.matches(MOTION)) attach(n); scan(n); }
}).observe(document.body, { childList: true, subtree: true });

/* app.js calls this when a new song starts: the artwork tile wobbles */
window.GTglass = { pulse: el => controllers.get(el)?.pulse(1) };
