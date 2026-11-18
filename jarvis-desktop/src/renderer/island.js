// Jarvis island UI: hidden notch → hover drops the pill → click to talk → spoken answer.
// Talks to the main process through window.jarvis (preload.cjs).
const J = window.jarvis;
const $ = (id) => document.getElementById(id);
const root = document.documentElement, island = $("island");

let settings = {};
let view = "answer";            // answer | settings | memory | setup
let hover = false, listening = false, busy = false, speaking = 0, control = false;
let answerShown = false, pendingApprovals = 0, flash = "", flashTimer = null, dismissTimer = null, label = "";
let dl = { active: false, pct: 0, waiting: false };
let floating = false;            // torn off the top edge into a widget
let pull = 0;                    // how far the blob is being pulled down (px)
const TEAR_AT = 150;

// ------------------------------------------------------------- labels
const RUN = { web_search: "Searching the web", web_fetch: "Reading a page", look_at_screen: "Looking at your screen", point_at: "Pointing it out", computer: "Using your PC", run_powershell: "Running a command", open: "Opening", clipboard: "Using the clipboard", media_control: "Controlling media", system_status: "Checking your PC", get_weather: "Checking the weather", set_timer: "Setting a timer", remember: "Remembering", forget: "Forgetting", show_card: "Preparing details" };
const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function md(src) {
  let h = esc(src);
  h = h.replace(/```\w*\n?([\s\S]*?)```/g, (_, c) => `<pre>${c.replace(/\n$/, "")}</pre>`);
  h = h.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/(^|\n)((?:[-*•] .*(?:\n|$))+)/g, (_, p, b) => p + "<ul>" + b.trim().split("\n").map((l) => `<li>${l.replace(/^[-*•] /, "")}</li>`).join("") + "</ul>");
  h = h.replace(/(^|\n)((?:\d+\. .*(?:\n|$))+)/g, (_, p, b) => p + "<ol>" + b.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("") + "</ol>");
  return h.split(/(<pre>[\s\S]*?<\/pre>)/).map((x) => (x.startsWith("<pre>") ? x : x.replace(/\n/g, "<br>"))).join("").replace(/<\/(ul|ol)><br>/g, "</$1>");
}
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// ------------------------------------------------------------- mode + geometry
function currentMode() {
  if (pull > 0) return "peek";
  if (view !== "answer") return "panel";
  if (answerShown || pendingApprovals) return "panel";
  if (listening || busy || speaking || control || flash || dl.waiting) return "active";
  if (hover) return "peek";
  return "hidden";
}
function render() {
  if (floating) return renderWidget();
  const mode = currentMode();
  island.dataset.mode = mode;
    for (const [id, v] of [["answerView", "answer"], ["setView", "settings"], ["memView", "memory"], ["setupView", "setup"]]) $(id).hidden = view !== v;

  // hidden: a thin notch in the top edge · peek/active: it stretches down · panel: a big rounded drop
  let w = 150, h = 7, r = 7, sh = 8, pad = 0;
  if (mode === "peek") { w = 240; h = 46; r = 23; sh = 14; pad = 8; }
  if (mode === "active") { w = 350; h = 46; r = 23; sh = 14; pad = 8; }
  if (mode === "panel") {
    const sec = { answer: "answerView", settings: "setView", memory: "memView", setup: "setupView" }[view];
    w = view === "answer" ? ($("extras").children.length ? 480 : 420) : 480;
    pad = 8; h = Math.min(pad + 38 + $(sec).offsetHeight, 690); r = 28; sh = 18;
  }
  if (pull > 0) {                 // stretch: longer, thinner, rounder, like pulling honey
    const t = Math.min(1, pull / TEAR_AT);
    h += pull; w = Math.max(90, w * (1 - 0.42 * t)); r = Math.min(w / 2, r + pull * 0.35); sh = sh + 10 * t;
  }
  for (const [k, v] of [["--w", w], ["--h", h], ["--r", r], ["--s", sh], ["--pad", pad]]) root.style.setProperty(k, v + "px");
  renderBar(mode);
}
new ResizeObserver(() => render()).observe($("body"));
["answerView", "setView", "memView", "setupView"].forEach((id) => new ResizeObserver(() => island.dataset.mode === "panel" && render()).observe($(id)));

function renderBar(mode) {
  const t = timers.find((x) => !x.done);
  let text = label, right = "";
  if (pull > 0) text = pull >= TEAR_AT ? "Let go to float" : "Pull…";
  else if (flash) text = flash;
  else if (dl.waiting) text = `Getting my voice ready · ${dl.pct}%`;
  else if (control) text = label || "Using your PC · Esc to stop";
  else if (mode === "peek") text = settings.ready === false ? "Click to set me up" : "Click to talk";
  else if (mode === "panel" && view !== "answer") text = { settings: "Settings", memory: "Memory", setup: "Setup" }[view];
  else if (!text) text = "Jarvis";
  if ((mode === "peek" || mode === "active") && !pull) right = t ? fmt(remaining(t)) : mode === "peek" ? clock() : "";
  $("barLabel").textContent = text;
  if (floating) $("wStatus").textContent = text === "Jarvis" ? "Ready" : text;
  $("barRight").textContent = right;
  $("barRight").classList.toggle("timer", !!t);
  $("progress").classList.toggle("on", dl.active && mode !== "hidden");
}

function setState(s, text = "") { island.dataset.state = s; $("widget").dataset.state = s; label = text; render(); }
function settle() {
  if (control) return setState("control", "Using your PC · Esc to stop");
  if (listening) return setState("listening", "Listening…");
  if (busy) return; // keep the current tool label
  if (speaking) return setState("speaking", "Jarvis");
  setState("idle", "");
}
function flashBar(text, ms = 2200, state = "alert") {
  clearTimeout(flashTimer); flash = text; island.dataset.state = state; $("widget").dataset.state = state; render();
  flashTimer = setTimeout(() => { flash = ""; settle(); }, ms);
}

// ------------------------------------------------------------- pointer
let inside = 0, leaveTimer = null;
function enter() { inside++; clearTimeout(leaveTimer); if (!hover) { hover = true; J.interactive(true); render(); } pauseDismiss(); }
function leave() {
  inside = Math.max(0, inside - 1);
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { if (inside) return; hover = false; J.interactive(false); render(); resumeDismiss(); }, 300);
}
for (const el of [$("hotzone"), island]) { el.addEventListener("mouseenter", enter); el.addEventListener("mouseleave", leave); }
let suppressClick = false;
island.querySelector(".bar").addEventListener("click", () => {
  if (suppressClick) { suppressClick = false; return; }
  talkClick();
});
function talkClick() {
  if (view === "setup") return;
  if (settings.ready === false) return openView("setup");
  if (busy) { endConversation(); J.stop(); hush(); return; }
  if (speaking) { endConversation(); hush(); settle(); return; }
  listening ? stopListening(!rec?.speechAt) : startListening();
}
island.addEventListener("contextmenu", (e) => { e.preventDefault(); J.menu(); });

function openView(v) { view = v; if (v === "memory") loadMemory(); if (v === "settings") fillSettings(); if (v === "setup") startSetup(); J.focus(); render(); }
function closeView() { view = "answer"; J.release(); render(); }
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeView));

// answer panel lifecycle: stays while you read it, folds away after
function showAnswer() { answerShown = true; clearTimeout(dismissTimer); render(); }
function scheduleDismiss(ms) { clearTimeout(dismissTimer); if (floating) return; if (!hover && !pendingApprovals) dismissTimer = setTimeout(dismissAnswer, ms); }
function pauseDismiss() { clearTimeout(dismissTimer); }
function resumeDismiss() { if (answerShown && !busy && !speaking) scheduleDismiss($("extras").children.length ? 2500 : 1500); }
function dismissAnswer() { if (pendingApprovals || busy) return; answerShown = false; render(); }

// ------------------------------------------------------------- speech out
// Sentences are synthesised by Kokoro (a local neural voice) as soon as they arrive, and played
// back in order, so Jarvis starts talking after the first sentence. If Kokoro isn't available,
// the Windows voice is used instead.
let audioCtx = null, gainNode = null, playHead = 0, sources = [], ttsGen = 0, kokoroOk = true;
let chain = Promise.resolve();
function audio() {
  if (!audioCtx) { audioCtx = new AudioContext(); gainNode = audioCtx.createGain(); gainNode.gain.value = 1.0; gainNode.connect(audioCtx.destination); }
  return audioCtx;
}
function speak(text) {
  text = text.replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  if (!settings.voice || !text) return;
  const gen = ttsGen;
  speaking++;
  if (!busy && !control) setState("speaking", "Jarvis");
  const synth = kokoroOk ? J.tts(text).catch((e) => { console.warn("Kokoro failed, using Windows voice", e); kokoroOk = false; return null; }) : Promise.resolve(null);
  chain = chain.then(async () => {
    const res = await synth;
    if (gen !== ttsGen) return doneOne();
    if (!res) return fallbackSpeak(text, gen);
    const ctx = audio();
    if (ctx.state === "suspended") await ctx.resume();
    const buf = ctx.createBuffer(1, res.audio.length, res.sampleRate);
    buf.copyToChannel(res.audio instanceof Float32Array ? res.audio : new Float32Array(res.audio), 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(gainNode);
    const start = Math.max(ctx.currentTime + 0.02, playHead);
    src.start(start); playHead = start + buf.duration + 0.08;
    sources.push(src);
    src.onended = () => { sources = sources.filter((x) => x !== src); doneOne(); };
  });
}
function fallbackSpeak(text, gen) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const vs = speechSynthesis.getVoices();
    const v = [/Ryan|George|Thomas/i, /en-GB/i, /^en/i].map((p) => vs.find((x) => p.test(x.name) || p.test(x.lang))).find(Boolean);
    if (v) u.voice = v;
    u.rate = 1.15; u.volume = 1;
    u.onend = u.onerror = () => { doneOne(); resolve(); };
    if (gen !== ttsGen) { doneOne(); return resolve(); }
    speechSynthesis.speak(u);
  });
}
function doneOne() {
  speaking = Math.max(0, speaking - 1);
  if (speaking) return;
  settle();
  if (!busy) { scheduleDismiss(afterReadMs()); continueConversation(); }
}
function hush() {
  ttsGen++; speaking = 0; chain = Promise.resolve();
  for (const s of sources) { try { s.onended = null; s.stop(); } catch {} }
  sources = []; playHead = 0; speechSynthesis.cancel();
}
const afterReadMs = () => ($("extras").children.length ? 14000 : 5000);

// ------------------------------------------------------------- conversation mode
// One click starts a conversation: after each answer Jarvis listens again by itself.
// Silence for a few seconds (or Esc / a click) ends it.
let convo = false;
function continueConversation() {
  if (!convo || listening || busy || pendingApprovals || view !== "answer") return;
  setTimeout(() => { if (convo && !listening && !busy && !speaking) startListening(true); }, 250);
}
function endConversation() { convo = false; }

// ------------------------------------------------------------- asking
let out = "", spoken = 0;
function flushSpeech(final) {
  for (;;) {
    const pending = out.slice(spoken);
    const s = final ? pending : pending.match(/^[\s\S]*?[.!?…](?=\s)/)?.[0];
    if (!s || !s.trim()) { if (final) spoken = out.length; return; }
    speak(s); spoken += s.length; if (final) return;
  }
}
async function ask(text) {
  text = text.trim();
  if (!text || busy) return;
  hush(); busy = true; out = ""; spoken = 0;
  answerShown = false; $("answer").textContent = ""; $("extras").innerHTML = "";
  setState("thinking", `“${text.length > 38 ? text.slice(0, 36) + "…" : text}”`);
  await J.send(text, false);
  flushSpeech(true);
  busy = false;
  settle();
  if (answerShown && !speaking) scheduleDismiss(settings.voice ? afterReadMs() : 6000 + out.length * 45);
  if (!speaking) continueConversation();
}

J.onAgent((ev) => {
  switch (ev.type) {
    case "text":
      out += ev.text; $("answer").textContent = out.trim(); if (out.trim()) showAnswer(); flushSpeech(false); break;
    case "tool":
      if (ev.status === "running" && !control) { setState("thinking", ev.detail || RUN[ev.name] || "Working…"); if (out && !/\s$/.test(out)) out += " "; }
      break;
    case "action":
      if (ev.name === "set_timer") addTimer(ev.input.seconds, ev.input.label);
      if (ev.name === "show_card") addCard(ev.input.title, ev.input.body);
      break;
    case "approval": approvalCard(ev); break;
    case "control":
      control = ev.on; settle(); break;
    case "error":
      out += (out ? "\n" : "") + ev.message; $("answer").textContent = out.trim(); showAnswer();
      if (ev.code === "SETUP") setTimeout(() => openView("setup"), 1800);
      if (ev.detail) console.warn(ev.detail);
      break;
  }
});
function addCard(title, body) {
  const c = document.createElement("div"); c.className = "card";
  c.innerHTML = `<h4>${esc(title)}</h4><div class="md">${md(body)}</div>`;
  $("extras").appendChild(c); showAnswer();
}
function approvalCard({ id, command, reason, kind }) {
  pendingApprovals++;
  const c = document.createElement("div"); c.className = "approve" + (kind === "control" ? " control" : "");
  c.innerHTML = kind === "control"
    ? `<p><b>${esc(reason)}</b></p><div class="btns"><button class="ghost" data-a="0">Not now</button><button class="primary" data-a="1">Allow</button></div>`
    : `<p><b>Run this on your PC?</b> ${esc(reason || "")}</p><pre>${esc(command)}</pre><div class="btns"><button class="ghost" data-a="0">Don't run</button><button class="primary" data-a="1">Run</button></div>`;
  c.onclick = (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const ok = b.dataset.a === "1";
    J.approve(id, ok); pendingApprovals--; c.classList.add("done");
    c.querySelector("p b").textContent = ok ? (kind === "control" ? "Control allowed for this task. Esc stops me." : "Approved.") : "Declined.";
    J.release(); render();
  };
  $("extras").appendChild(c); showAnswer();
  setState("alert", "Needs your OK");
  J.focus();
  speak(kind === "control" ? "May I use your mouse and keyboard for this?" : "I need your go-ahead for that.");
}

// ------------------------------------------------------------- listening (local Whisper in the main process)
const WORKLET_URL = URL.createObjectURL(new Blob([`
  class Recorder extends AudioWorkletProcessor {
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
  }
  registerProcessor("recorder", Recorder);`], { type: "text/javascript" }));
let rec = null;
async function startListening(followUp = false) {
  if (listening || busy) return;
  if (!followUp) { convo = true; hush(); answerShown = false; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    let node, port;
    try {                                   // preferred: AudioWorklet (off the main thread)
      await ctx.audioWorklet.addModule(WORKLET_URL);
      node = new AudioWorkletNode(ctx, "recorder"); port = node.port;
      src.connect(node);
    } catch {                               // fallback: ScriptProcessor (works everywhere)
      node = ctx.createScriptProcessor(2048, 1, 1);
      port = { set onmessage(fn) { node.onaudioprocess = fn ? (e) => fn({ data: e.inputBuffer.getChannelData(0).slice(0) }) : null; } };
      const mute = ctx.createGain(); mute.gain.value = 0;
      src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    }
    rec = { stream, ctx, node, port, chunks: [], samples: 0, started: performance.now(), speechAt: 0, lastVoice: 0, floor: 0, floorN: 0, followUp };
    port.onmessage = ({ data }) => onAudio(data);
  } catch {
    flashBar("Microphone blocked · Windows Settings → Privacy → Microphone", 5000);
    return;
  }
  listening = true; settle();
}
function onAudio(chunk) {
  if (!rec) return;
  rec.chunks.push(chunk); rec.samples += chunk.length;
  let sum = 0; for (const x of chunk) sum += x * x;
  const rms = Math.sqrt(sum / chunk.length), now = performance.now(), t = now - rec.started;
  if (t < 300) rec.floor = (rec.floor * rec.floorN + rms) / ++rec.floorN;
  if (rms > Math.max(0.012, rec.floor * 2.5)) { rec.lastVoice = now; if (!rec.speechAt) rec.speechAt = now; }
  document.querySelectorAll(".wave i").forEach((b, i) => (b.style.height = 4 + Math.min(12, rms * 260 * (0.6 + 0.4 * Math.sin(now / 90 + i))) + "px"));
  if (rec.speechAt && now - rec.lastVoice > 900) stopListening();          // you paused → send
  else if (!rec.speechAt && t > (rec.followUp ? 6000 : 8000)) stopListening(true, true); // silence → conversation over
  else if (t > 45000) stopListening();
}
async function stopListening(cancel = false, quiet = false) {
  if (!rec) return;
  const r = rec; rec = null; listening = false;
  if (cancel) endConversation();
  r.port.onmessage = null; r.stream.getTracks().forEach((t) => t.stop()); r.ctx.close();
  document.querySelectorAll(".wave i").forEach((b) => (b.style.height = "4px"));
  if (cancel || !r.speechAt || r.samples < 16000 * 0.4) { settle(); if (!quiet) flashBar("Didn't catch that", 1800, "idle"); return; }
  const audio = new Float32Array(r.samples);
  let o = 0; for (const c of r.chunks) { audio.set(c, o); o += c.length; }
  setState("thinking", "Transcribing…");
  if (dl.active) { dl.waiting = true; render(); }
  try {
    const text = await J.transcribe(audio);
    dl.waiting = false;
    if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) { settle(); flashBar("Didn't catch that", 1800, "idle"); continueConversation(); return; }
    ask(text);
  } catch (e) {
    dl.waiting = false; settle();
    flashBar("Speech recognition failed: " + String(e.message || e).replace(/^Error invoking remote method '[^']+': /, ""), 6000);
  }
}

// voice model download: one steady, monotonic progress line
J.onSttProgress((p) => {
  if (p.error) { dl = { active: false, pct: 0, waiting: false }; flashBar("Couldn't download the voice model. Check your internet.", 6000); setupDl(); return; }
  if (p.ready) { dl.active = false; dl.pct = 100; dl.waiting = false; }
  else { dl.active = true; const pct = Math.min(99, Math.max(dl.pct, Math.floor(p.pct))); if (pct === dl.pct && island.dataset.mode !== "hidden") return; dl.pct = pct; }
  $("progressFill").style.width = dl.pct + "%";
  setupDl(); render();
});

// ------------------------------------------------------------- timers
const timers = [];
const remaining = (t) => Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
function fmt(r) { const h = Math.floor(r / 3600), m = Math.floor(r / 60) % 60, s = r % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); }
function addTimer(seconds, lbl) { timers.push({ end: Date.now() + seconds * 1000, label: lbl, done: false }); }
setInterval(() => {
  for (const t of timers) if (!t.done && Date.now() >= t.end) {
    t.done = true;
    J.notify("Jarvis", `${t.label}: time's up`);
    speak(`Your ${t.label} timer is done.`);
    flashBar(`⏱  ${t.label}: time's up`, 9000);
  }
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].done) timers.splice(i, 1);
  if (floating) renderWidget(); else if (island.dataset.mode !== "hidden") renderBar(island.dataset.mode);
}, 500);

// ------------------------------------------------------------- memory
async function loadMemory() { renderMemory(await J.getMemory()); }
function renderMemory(mem) {
  $("memList").innerHTML = mem.notes.length
    ? mem.notes.map((n, i) => `<li><div>${esc(n.note)}<small>${new Date(n.at).toLocaleDateString()}</small></div><button data-i="${i}" title="Forget">${SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button></li>`).reverse().join("")
    : `<li class="none">Nothing yet. Say “remember that…” and it shows up here.</li>`;
}
$("memList").onclick = async (e) => { const b = e.target.closest("button[data-i]"); if (b) renderMemory(await J.deleteMemory(+b.dataset.i)); };
J.onMemory(renderMemory);

// ------------------------------------------------------------- settings
const form = $("setForm");
function fillSettings() {
  for (const el of form.elements) {
    if (!el.name || el.name === "apiKey") continue;
    if (el.type === "checkbox") el.checked = !!settings[el.name]; else el.value = settings[el.name] ?? "";
  }
  form.apiKey.value = "";
  form.apiKey.placeholder = settings.hasKey ? `Saved (${settings.keyHint}). Paste a new key to replace it` : "sk-ant-…";
  $("setMsg").textContent = "";
  syncBackend();
}
async function syncBackend() {
  const acct = form.backend.value === "claude";
  $("acctBox").hidden = !acct; $("keyRow").hidden = acct;
  if (!acct) return;
  $("acctStatus").textContent = "Checking…";
  const st = await J.claudeStatus();
  $("acctStatus").innerHTML = st.loggedIn ? "<b>Connected</b> to your Claude account."
    : st.installed ? "<b>Not signed in.</b> Press Sign in and log in with your Claude account."
    : "<b>Claude Code isn't installed.</b> Sign in installs it first.";
  $("btnSignIn").textContent = st.loggedIn ? "Switch account" : "Sign in";
}
form.backend.onchange = syncBackend;
$("btnSignIn").onclick = async () => { await J.claudeSignIn(); $("setMsg").textContent = "Finish signing in in the window that opened."; pollUntilSignedIn(() => syncBackend()); };
form.onsubmit = async (e) => {
  e.preventDefault();
  const patch = {};
  for (const el of form.elements) if (el.name) patch[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  if (!patch.apiKey) delete patch.apiKey;
  const res = await J.setSettings(patch);
  applySettings(res);
  const bad = (res.hotkeys || []).filter((h) => /\(/.test(h));
  $("setMsg").textContent = bad.length ? `Hotkey problem: ${bad.join(", ")}` : "Saved";
  $("setMsg").style.color = bad.length ? "var(--warn)" : "";
  if (patch.speechModel) J.warmup();
  if (floating) refreshWeather();
};
$("btnQuit").onclick = () => J.quit();
function applySettings(s) { settings = s; $("kTalk").textContent = s.hotkeyTalk; if (!s.voice) hush(); render(); }

let pollTimer = null;
function pollUntilSignedIn(onDone) {
  clearInterval(pollTimer);
  const started = Date.now();
  pollTimer = setInterval(async () => {
    const st = await J.claudeStatus();
    if (st.loggedIn || Date.now() - started > 10 * 60000) { clearInterval(pollTimer); if (st.loggedIn) { applySettings(await J.getSettings()); onDone(st); } }
  }, 2500);
}

// ------------------------------------------------------------- first-run setup
let step = 0, micTest = null;
function startSetup() { goStep(0); }
function goStep(n) {
  step = n;
  document.querySelectorAll(".step").forEach((s) => s.classList.toggle("on", +s.dataset.step === n));
  if (n !== 2) stopMicTest();
  if (n === 1) checkAccount();
  if (n === 4) { J.warmup(); setupDl(); }
  render();
}
document.querySelectorAll("[data-next]").forEach((b) => (b.onclick = () => goStep(step + 1)));

async function checkAccount() {
  if (settings.backend === "api" && settings.hasKey) return markConnected("Using your API key.");
  const st = await J.claudeStatus();
  if (st.loggedIn) markConnected("Connected to your Claude account.");
  else $("acctStep").innerHTML = st.installed
    ? "Press <b>Sign in</b>. Your browser opens and asks you to log in to your Claude account. No API key needed: I use your Claude plan."
    : "Press <b>Sign in</b>. A window installs Claude Code (about a minute), then your browser asks you to log in to your Claude account. No API key needed: I use your Claude plan.";
}
function markConnected(msg) {
  $("acctOk").textContent = "✓ " + msg;
  $("acctSkip").hidden = true;
  const b = $("btnSetupSignIn"); b.textContent = "Continue"; b.onclick = () => goStep(2);
}
$("btnSetupSignIn").onclick = async () => {
  await J.claudeSignIn();
  $("acctOk").textContent = "Waiting for you to sign in…";
  pollUntilSignedIn(() => markConnected("Connected to your Claude account."));
};

$("btnMic").onclick = async () => {
  if (micTest) return goStep(3);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext(), an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize); let heard = false;
    micTest = { stream, ctx, raf: 0 };
    $("micHint").textContent = "Say something…";
    const loop = () => {
      an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5);
      $("micMeter").style.width = lvl * 100 + "%";
      if (lvl > 0.15 && !heard) { heard = true; $("micHint").textContent = "✓ I can hear you."; $("btnMic").textContent = "Continue"; }
      micTest.raf = requestAnimationFrame(loop);
    };
    loop();
    $("btnMic").textContent = "Continue";
  } catch {
    $("micHint").textContent = "Blocked. Open Windows Settings → Privacy & security → Microphone, and turn on “Let desktop apps access your microphone”.";
  }
};
function stopMicTest() { if (!micTest) return; cancelAnimationFrame(micTest.raf); micTest.stream.getTracks().forEach((t) => t.stop()); micTest.ctx.close(); micTest = null; }

function setupDl() {
  if (view !== "setup") return;
  $("dlMeter").style.width = dl.pct + "%";
  $("dlHint").textContent = dl.pct >= 100 && !dl.active ? "✓ Voice ready." : dl.active ? `Downloading · ${dl.pct}%  (you can continue; it finishes in the background)` : "Starting…";
}
$("btnFinish").onclick = async () => {
  applySettings(await J.setSettings({ onboarded: true, allowControl: $("setupControl").checked }));
  view = "answer"; J.release(); render();
  flashBar(`Ready · click me or press ${settings.hotkeyTalk}`, 4000, "speaking");
};

// ------------------------------------------------------------- pull the blob down → tear it off
let drag = null;
island.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || floating || view === "setup" || e.target.closest(".body")) return;
  drag = { y0: e.screenY, moved: false, id: e.pointerId };
  island.setPointerCapture(e.pointerId);
});
island.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dy = e.screenY - drag.y0;
  if (!drag.moved && dy < 6) return;
  drag.moved = true;
  pull = Math.max(0, dy < TEAR_AT ? dy : TEAR_AT + (dy - TEAR_AT) * 0.5); // a bit of resistance past the tear point
  island.classList.add("pulling");
  island.classList.toggle("ready", dy >= TEAR_AT);
  render();
});
function endPull(e) {
  if (!drag) return;
  const d = drag; drag = null;
  try { island.releasePointerCapture(d.id); } catch {}
  island.classList.remove("pulling", "ready");
  if (!d.moved) return;                       // it was a click → the click handler talks
  suppressClick = true; setTimeout(() => (suppressClick = false), 50);
  const torn = e.screenY - d.y0 >= TEAR_AT;
  pull = 0;
  if (torn) {                                 // snap: the blob shoots back into the edge, the widget pops out
    island.classList.add("tearing"); hover = false; J.interactive(false);
    render();
    J.tear(e.screenX, e.screenY);
    setTimeout(() => island.classList.remove("tearing"), 400);
  } else render();                            // springs back up
}
island.addEventListener("pointerup", endPull);
island.addEventListener("pointercancel", endPull);

// ------------------------------------------------------------- floating widget
const widget = $("widget");
function applyDock(mode) {
  floating = mode === "float";
  document.body.classList.toggle("float", floating);
  widget.hidden = !floating;
  widget.classList.remove("leaving");
  (floating ? $("wBody") : $("island").querySelector(".inner")).appendChild($("body"));
  if (floating) { answerShown = true; widget.style.animation = "none"; void widget.offsetWidth; widget.style.animation = ""; refreshWeather(); }
  else { answerShown = false; hover = false; }
  J.interactive(false);
  render();
}
function renderWidget() {
  for (const [id, v] of [["answerView", "answer"], ["setView", "settings"], ["memView", "memory"], ["setupView", "setup"]]) $(id).hidden = view !== v;
  renderBar("active");
  $("wTimers").innerHTML = timers.filter((t) => !t.done).map((t) => `<span class="w-timer">${esc(t.label)}<b>${fmt(remaining(t))}</b></span>`).join("");
}
widget.addEventListener("mouseenter", () => J.interactive(true));
widget.addEventListener("mouseleave", () => { if (!wdrag) J.interactive(false); });
widget.addEventListener("contextmenu", (e) => { e.preventDefault(); J.menu(); });
$("wTalk").onclick = () => talkClick();
$("wDock").onclick = () => { widget.classList.add("leaving"); setTimeout(() => J.dockTop(), 260); };
document.querySelectorAll("[data-media]").forEach((b) => (b.onclick = () => J.media(b.dataset.media)));
document.querySelectorAll("[data-ask]").forEach((b) => (b.onclick = () => { endConversation(); ask(b.dataset.ask); }));

// drag the widget by its header; push it into the top edge to dock
let wdrag = null;
$("wHead").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest("button")) return;
  wdrag = { id: e.pointerId };
  $("wHead").setPointerCapture(e.pointerId);
  J.dragStart(e.screenX - window.screenX, e.screenY - window.screenY);
});
$("wHead").addEventListener("pointermove", (e) => { if (wdrag) J.dragMove(e.screenX, e.screenY); });
const endWDrag = () => { if (!wdrag) return; try { $("wHead").releasePointerCapture(wdrag.id); } catch {} wdrag = null; J.dragEnd(); };
$("wHead").addEventListener("pointerup", endWDrag);
$("wHead").addEventListener("pointercancel", endWDrag);

function tickWidget() {
  if (!floating) return;
  const d = new Date();
  $("wTime").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  $("wDate").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}
setInterval(tickWidget, 1000);
async function refreshWeather() {
  tickWidget();
  try {
    const w = await J.weather();
    if (!w) { $("wWeather").textContent = settings.city ? "" : "Set your city in Settings for weather"; return; }
    const o = JSON.parse(w);
    $("wWeather").textContent = o.now ? `${o.now.replace(/\s*\(feels[^)]*\)/, "")} · ${o.place.split(",")[0]}` : "";
  } catch { $("wWeather").textContent = ""; }
}
setInterval(() => floating && refreshWeather(), 15 * 60000);
J.onDock(applyDock);

// ------------------------------------------------------------- global events
J.onHotkeyTalk(() => {
  if (settings.ready === false || !settings.onboarded) return openView("setup");
  if (busy) { endConversation(); J.stop(); hush(); return; }
  if (speaking) { endConversation(); hush(); settle(); return; }
  listening ? stopListening(!rec?.speechAt) : startListening();
});
J.onHotkeyPanel(() => { if ($("answer").textContent || $("extras").children.length) { answerShown = !answerShown; render(); if (answerShown) scheduleDismiss(10000); } });
J.onView((v) => {
  if (v === "stop") { endConversation(); hush(); if (listening) stopListening(true); return; }
  openView(v === "onboarding" ? "setup" : v);
});
J.onSettingsOpen(() => openView("settings"));
J.onBlur(() => { if (view === "settings" || view === "memory") closeView(); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  endConversation();
  if (listening) stopListening(true);
  else if (speaking) { hush(); settle(); }
  else if (view !== "answer" && view !== "setup") closeView();
  else if (answerShown) dismissAnswer();
});

// ------------------------------------------------------------- start
(async () => {
  applySettings(await J.getSettings());
  settle();
  if ((await J.dockMode()) === "float") applyDock("float");
  if (!settings.onboarded) setTimeout(() => openView("setup"), 600);
  else J.warmup(); // make sure the voice model is ready before the first click
})();
