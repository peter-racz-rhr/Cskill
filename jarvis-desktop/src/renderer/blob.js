// The Jarvis blob: a liquid ball. Docked, it hangs from the top edge of the screen and joins
// it with a gooey metaball neck; pull it down and the neck stretches, thins and snaps, and the
// ball floats free. Everything is drawn with simple circles + a metaball connector path and
// moved with springs, so it wobbles like liquid. No text, no buttons: the ball is the UI.
const J = window.jarvis;
const MODE = new URLSearchParams(location.search).get("mode") || "dock"; // "dock" | "float"
const $ = (id) => document.getElementById(id);
const W = innerWidth, H = innerHeight;

// ---------- look per state ----------
const COLORS = {
  idle: [61, 109, 255], listening: [40, 170, 255], thinking: [110, 92, 255], speaking: [61, 120, 255],
  control: [139, 92, 255], alert: [255, 176, 32], error: [255, 90, 79],
};
let state = "idle", level = 0, docked = true; // docked: is the ball living in the top edge (dock window)?
let color = [...COLORS.idle];

// ---------- geometry ----------
const A = { x: W / 2, y: -34, r: 40 };          // anchor: a big circle mostly above the screen edge
const TEAR = 135;                               // pull distance at which the neck snaps
const spring = (k, c) => ({ k, c });
const SOFT = spring(170, 13), WOBBLY = spring(260, 9), SNAPPY = spring(420, 26);

const ball = { x: W / 2, y: MODE === "float" ? H / 2 : 14, vx: 0, vy: 0, r: MODE === "float" ? 26 : 14, vr: 0 };
const anchorY = { y: A.y, v: 0 };
let target = { x: ball.x, y: ball.y, r: ball.r }, ballSpring = SOFT, hidden = false;
let hover = false, pulling = false, torn = false, pointer = null, downAt = null, moved = false;

function restTarget() {
  if (MODE === "float") return { x: W / 2, y: H / 2, r: 24 + (state === "idle" ? 0 : 2) + level * 7 };
  if (!docked) return { x: W / 2, y: -30, r: 10 };               // ball is away floating: tuck in
  const active = state !== "idle";
  if (active) return { x: W / 2, y: 30, r: 17 + level * 5 };
  if (hover) return { x: W / 2, y: 26, r: 15.5 };
  return { x: W / 2, y: 13, r: 13.5 };
}

// metaball connector between two circles (after the classic paper.js metaball sketch)
function connector(c1, r1, c2, r2, v, handle = 2.4) {
  const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
  if (d <= Math.abs(r1 - r2) + 0.01) return "";
  let u1 = 0, u2 = 0;
  if (d < r1 + r2) {
    u1 = Math.acos(Math.min(1, Math.max(-1, (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d))));
    u2 = Math.acos(Math.min(1, Math.max(-1, (r2 * r2 + d * d - r1 * r1) / (2 * r2 * d))));
  }
  const ab = Math.atan2(c2.y - c1.y, c2.x - c1.x), spread = Math.acos(Math.min(1, Math.max(-1, (r1 - r2) / d)));
  const a1 = ab + u1 + (spread - u1) * v, a2 = ab - u1 - (spread - u1) * v;
  const a3 = ab + Math.PI - u2 - (Math.PI - u2 - spread) * v, a4 = ab - Math.PI + u2 + (Math.PI - u2 - spread) * v;
  const pt = (c, a, r) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  const p1 = pt(c1, a1, r1), p2 = pt(c1, a2, r1), p3 = pt(c2, a3, r2), p4 = pt(c2, a4, r2);
  const tot = r1 + r2, d2 = Math.min(v * handle, Math.hypot(p3.x - p1.x, p3.y - p1.y) / tot) * Math.min(1, (d * 2) / tot);
  const h1 = pt(p1, a1 - Math.PI / 2, r1 * d2), h2 = pt(p2, a2 + Math.PI / 2, r1 * d2);
  const h3 = pt(p3, a3 + Math.PI / 2, r2 * d2), h4 = pt(p4, a4 - Math.PI / 2, r2 * d2);
  const f = (p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  return `M${f(p1)} C${f(h1)} ${f(h3)} ${f(p3)} L${f(p4)} C${f(h4)} ${f(h2)} ${f(p2)} Z`;
}

// ---------- animation loop (only runs while something moves) ----------
let raf = 0, last = 0, t0 = performance.now();
function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
function step(o, key, vkey, tgt, sp, dt) {
  const a = sp.k * (tgt - o[key]) - sp.c * o[vkey];
  o[vkey] += a * dt; o[key] += o[vkey] * dt;
}
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!pulling) target = restTarget();
  step(ball, "x", "vx", target.x, pulling ? SNAPPY : ballSpring, dt);
  step(ball, "y", "vy", target.y, pulling ? SNAPPY : ballSpring, dt);
  step(ball, "r", "vr", target.r, WOBBLY, dt);
  step(anchorY, "y", "v", A.y + (MODE === "float" || !docked ? -12 : 0), WOBBLY, dt);
  const tc = COLORS[state] || COLORS.idle;
  for (let i = 0; i < 3; i++) color[i] += (tc[i] - color[i]) * Math.min(1, dt * 8);
  draw(now);
  const moving = Math.abs(ball.vx) + Math.abs(ball.vy) + Math.abs(ball.vr) + Math.abs(anchorY.v) > 0.05
    || Math.abs(target.y - ball.y) + Math.abs(target.x - ball.x) + Math.abs(target.r - ball.r) > 0.05
    || tc.some((v, i) => Math.abs(v - color[i]) > 0.5);
  raf = moving || pulling || state !== "idle" ? requestAnimationFrame(frame) : 0;
}

function draw(now) {
  const fill = `rgb(${color.map(Math.round).join(",")})`;
  document.body.style.setProperty("--glow", `rgba(${color.map(Math.round).join(",")},.55)`);
  const r = Math.max(0, ball.r + (state === "speaking" ? level * 4 * Math.sin(now / 70) : 0));
  const showBall = !(MODE === "dock" && (torn || !docked) && ball.y < 4);
  for (const id of ["anchor", "neck", "ball"]) $(id).setAttribute("fill", fill);

  // anchor (only in the dock window)
  const an = $("anchor");
  if (MODE === "dock") { an.setAttribute("cx", A.x); an.setAttribute("cy", anchorY.y); an.setAttribute("r", A.r); }
  else an.setAttribute("r", 0);

  // ball + neck
  const b = $("ball");
  b.setAttribute("cx", ball.x); b.setAttribute("cy", ball.y); b.setAttribute("r", showBall ? r : 0);
  let neck = "";
  if (MODE === "dock" && showBall && !torn) {
    const d = Math.hypot(ball.x - A.x, ball.y - anchorY.y);
    const stretch = Math.max(0, Math.min(1, (d - A.r) / TEAR));
    neck = connector({ x: A.x, y: anchorY.y }, A.r, { x: ball.x, y: ball.y }, r, 0.62 - 0.5 * stretch, 2.4);
  }
  $("neck").setAttribute("d", neck);

  // shading, highlight and state effects ride on the ball
  for (const id of ["shadeC", "shineC"]) { const c = $(id); c.setAttribute("cx", ball.x); c.setAttribute("cy", ball.y); c.setAttribute("r", showBall ? r : 0); }
  const ring = $("ring");
  const ringOn = showBall && (state === "listening" || state === "alert" || state === "control");
  ring.setAttribute("cx", ball.x); ring.setAttribute("cy", ball.y);
  ring.setAttribute("r", r + 4 + (state === "listening" ? level * 12 : 2 + 2 * Math.sin(now / 160)));
  ring.setAttribute("stroke", fill); ring.setAttribute("stroke-opacity", ringOn ? 0.55 : 0);
  const sw = $("swirl");
  const swirlOn = showBall && state === "thinking";
  const sr = Math.max(0, r * 0.62);
  sw.setAttribute("cx", ball.x); sw.setAttribute("cy", ball.y); sw.setAttribute("r", swirlOn ? sr : 0);
  sw.setAttribute("stroke-dasharray", `${(sr * 2 * Math.PI * 0.28).toFixed(1)} ${(sr * 2 * Math.PI).toFixed(1)}`);
  sw.setAttribute("transform", `rotate(${((now - t0) / 3) % 360} ${ball.x} ${ball.y})`);
}

// ---------- pointer: hover, click, pull / drag ----------
const inBall = (x, y) => Math.hypot(x - ball.x, y - ball.y) < ball.r + 10 || (MODE === "dock" && docked && y < 16 && Math.abs(x - A.x) < 34);
let interactive = false;
function setInteractive(on) { if (on !== interactive) { interactive = on; J.hover(on); } }

addEventListener("mousemove", (e) => {
  if (pulling || downAt) return;
  const over = inBall(e.clientX, e.clientY) && (MODE === "float" || docked);
  setInteractive(over);
  document.body.classList.toggle("grab", over);
  if (MODE === "dock" && over !== hover) { hover = over; kick(); }
});
addEventListener("mouseleave", () => { if (!pulling && !downAt) { setInteractive(false); if (hover) { hover = false; kick(); } } });

addEventListener("pointerdown", (e) => {
  if (!interactive) return;
  if (e.button === 2) return;
  downAt = { x: e.clientX, y: e.clientY, sx: e.screenX, sy: e.screenY };
  moved = false;
  document.body.setPointerCapture(e.pointerId);
});
addEventListener("pointermove", (e) => {
  if (!downAt) return;
  const dx = e.screenX - downAt.sx, dy = e.screenY - downAt.sy;
  if (!moved && Math.hypot(dx, dy) < 6) return;
  if (!moved) {
    moved = true;
    document.body.classList.add("grabbing");
    if (MODE === "float") { J.dragStart(); return; }  // main moves the window with the cursor
    pulling = true; torn = false;
  }
  if (MODE !== "dock" || torn) return;
  // the ball follows the pointer with a little resistance; the neck stretches behind it
  const px = A.x + (e.clientX - A.x) * 0.85, py = Math.max(10, e.clientY);
  target = { x: px, y: py, r: 16 };
  kick();
  if (Math.hypot(px - A.x, py - anchorY.y) - A.r > TEAR) {
    torn = true; pulling = false;              // snap! the drip springs back up, the ball flies off with the mouse
    anchorY.v = 260;                            // jiggle the edge
    ball.y = -30; ball.vy = 0; ball.r = 10; docked = false;
    J.tear();
    kick();
  }
});
function release(e) {
  if (!downAt) return;
  const wasMoved = moved; downAt = null; moved = false;
  document.body.classList.remove("grabbing");
  if (!wasMoved) { if (e.button === 0) J.click(); return; }
  if (MODE === "float" || torn) { J.dragEnd(); interactive = false; setInteractive(false); return; } // re-arm hover after the window moved
  pulling = false; ballSpring = WOBBLY; kick();  // let go early: wobble back up
  setTimeout(() => (ballSpring = SOFT), 900);
}
addEventListener("pointerup", release);
addEventListener("pointercancel", release);
addEventListener("contextmenu", (e) => { e.preventDefault(); if (interactive) J.menu(); });

// ---------- messages ----------
J.onBlobState((st) => {
  const changed = st.s !== state;
  state = st.s; level = Math.max(0, Math.min(1, st.level || 0));
  if (changed || state !== "idle") kick();
});
J.onDock((mode) => {
  if (MODE === "dock") {
    if (mode === "top") {                       // merge back in: the ball drops from the edge and settles
      docked = true; torn = false; ball.x = W / 2; ball.y = 70; ball.vy = -120; ball.r = 15; ballSpring = WOBBLY;
      setTimeout(() => (ballSpring = SOFT), 900);
    } else { docked = false; torn = true; }
  } else if (mode === "float") { ball.r = 10; ball.vr = 120; }  // pop in
  kick();
});
(async () => {
  const m = await J.dockMode();
  if (MODE === "dock" && m === "float") { docked = false; torn = true; ball.y = -30; }
  kick();
})();
