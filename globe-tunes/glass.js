// Liquid Glass layer: spring "jelly" press physics on every button (all browsers),
// powered by @liquefy-ui/core (MIT, vendored in vendor/liquefy-core.mjs).
import { attachLiquidMotion } from './vendor/liquefy-core.mjs';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The SVG refraction lens (attachLiquidLens) was removed: it re-filters the moving
   globe behind it on every frame and froze some Windows PCs. */

/* ---------- press physics ----------
   Every button gets the jelly squash and a slight tilt; the hero buttons get a
   CSS pointer shine (see app.css). */
const MOTION = '.btn, .pb, .solo, .stack button, .seg button, .radio, .card .ca, .region, .iconbtn, .p-art, #results button, .row';
const controllers = new WeakMap();

function attach(el){
  if (controllers.has(el) || reduce || document.documentElement.classList.contains('lite')) return;
  const small = el.offsetWidth < 60;
  // No WebGL canvas: its renderer copies every frame out of the GPU (drawImage),
  // which stalls the map. The pointer shine is done in CSS instead.
  controllers.set(el, attachLiquidMotion(el, null, {
    wobbliness: small ? .55 : .35, bounce: small ? .12 : .07, tilt: small ? 0 : 2.5,
    webgl: false, respectReducedMotion: true, elasticity: 0
  }));
}
const scan = root => root.querySelectorAll?.(MOTION).forEach(attach);
scan(document);
new MutationObserver(list => {
  for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1){ if (n.matches(MOTION)) attach(n); scan(n); }
}).observe(document.body, { childList: true, subtree: true });

/* app.js calls this when a new song starts: the artwork tile wobbles */
window.GTglass = { pulse: el => controllers.get(el)?.pulse(1) };
