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
  if (view !== "answer") return "panel";
  if (answerShown || pendingApprovals) return "panel";
  if (listening || busy || speaking || control || flash || dl.waiting) return "active";
  if (hover) return "peek";
  return "hidden";
}
function render() {
  const mode = currentMode();
  island.dataset.mode = mode;
  document.body.classList.toggle("big", mode === "panel");
  for (const [id, v] of [["answerView", "answer"], ["setView", "settings"], ["memView", "memory"], ["setupView", "setup"]]) $(id).hidden = view !== v;

  let w = 120, h = 30, y = -26;
  if (mode === "peek") { w = 230; h = 38; y = 14; }
  if (mode === "active") { w = 340; h = 38; y = 14; }
  if (mode === "panel") {
    const sec = { answer: "answerView", settings: "setView", memory: "memView", setup: "setupView" }[view];
    w = view === "answer" ? ($("extras").children.length ? 480 : 420) : 480;
    h = Math.min(38 + $(sec).offsetHeight, 680); y = 14;
  }
  root.style.setProperty("--w", w + "px");
  root.style.setProperty("--h", h + "px");
  root.style.setProperty("--y", y + "px");
  renderBar(mode);
}
new ResizeObserver(() => render()).observe($("body"));
["answerView", "setView", "memView", "setupView"].forEach((id) => new ResizeObserver(() => island.dataset.mode === "panel" && render()).observe($(id)));

function renderBar(mode) {
  const t = timers.find((x) => !x.done);
  let text = label, right = "";
  if (flash) text = flash;
  else if (dl.waiting) text = `Getting my voice ready · ${dl.pct}%`;
  else if (control) text = label || "Using your PC · Esc to stop";
  else if (mode === "peek") text = settings.ready === false ? "Click to set me up" : "Click to talk";
  else if (mode === "panel" && view !== "answer") text = { settings: "Settings", memory: "Memory", setup: "Setup" }[view];
  else if (!text) text = "Jarvis";
  if (mode === "peek" || mode === "active") right = t ? fmt(remaining(t)) : mode === "peek" ? clock() : "";
  $("barLabel").textContent = text;
  $("barRight").textContent = right;
  $("barRight").classList.toggle("timer", !!t);
  $("progress").classList.toggle("on", dl.active && mode !== "hidden");
}

function setState(s, text = "") { island.dataset.state = s; label = text; render(); }
function settle() {
  if (control) return setState("control", "Using your PC · Esc to stop");
  if (listening) return setState("listening", "Listening…");
  if (busy) return; // keep the current tool label
  if (speaking) return setState("speaking", "Jarvis");
  setState("idle", "");
}
function flashBar(text, ms = 2200, state = "alert") {
  clearTimeout(flashTimer); flash = text; island.dataset.state = state; render();
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
island.querySelector(".bar").addEventListener("click", () => {
  if (view === "setup") return;
  if (settings.ready === false) return openView("setup");
  if (busy) { J.stop(); hush(); return; }
  if (speaking) { hush(); settle(); return; }
  listening ? stopListening() : startListening();
});
island.addEventListener("contextmenu", (e) => { e.preventDefault(); J.menu(); });

function openView(v) { view = v; if (v === "memory") loadMemory(); if (v === "settings") fillSettings(); if (v === "setup") startSetup(); J.focus(); render(); }
function closeView() { view = "answer"; J.release(); render(); }
document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeView));

// answer panel lifecycle: stays while you read it, folds away after
function showAnswer() { answerShown = true; clearTimeout(dismissTimer); render(); }
function scheduleDismiss(ms) { clearTimeout(dismissTimer); if (!hover && !pendingApprovals) dismissTimer = setTimeout(dismissAnswer, ms); }
function pauseDismiss() { clearTimeout(dismissTimer); }
function resumeDismiss() { if (answerShown && !busy && !speaking) scheduleDismiss($("extras").children.length ? 2500 : 1500); }
function dismissAnswer() { if (pendingApprovals || busy) return; answerShown = false; render(); }

// ------------------------------------------------------------- speech out
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  for (const p of [/George/i, /Ryan/i, /Thomas/i, /Daniel/i, /Google UK English Male/i, /en-GB/i, /David/i, /^en/i]) { const v = vs.find((v) => p.test(v.name) || p.test(v.lang)); if (v) return v; }
  return null;
}
voice = pickVoice(); speechSynthesis.onvoiceschanged = () => (voice = pickVoice());
function speak(text) {
  text = text.replace(/[*_#`>]/g, "").trim();
  if (!settings.voice || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.rate = 1.05;
  speaking++;
  u.onstart = () => { if (!busy && !control) setState("speaking", "Jarvis"); };
  u.onend = u.onerror = () => { speaking = Math.max(0, speaking - 1); if (!speaking) { settle(); if (!busy) scheduleDismiss(afterReadMs()); } };
  speechSynthesis.speak(u);
}
function hush() { speechSynthesis.cancel(); speaking = 0; }
const afterReadMs = () => ($("extras").children.length ? 14000 : 5000);

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
async function startListening() {
  if (listening || busy) return;
  hush(); answerShown = false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(WORKLET_URL);
    const src = ctx.createMediaStreamSource(stream), node = new AudioWorkletNode(ctx, "recorder");
    src.connect(node);
    rec = { stream, ctx, node, chunks: [], samples: 0, started: performance.now(), speechAt: 0, lastVoice: 0, floor: 0, floorN: 0 };
    node.port.onmessage = ({ data }) => onAudio(data);
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
  if (rec.speechAt && now - rec.lastVoice > 1300) stopListening();
  else if (!rec.speechAt && t > 8000) stopListening(true);
  else if (t > 45000) stopListening();
}
async function stopListening(cancel = false) {
  if (!rec) return;
  const r = rec; rec = null; listening = false;
  r.node.port.onmessage = null; r.stream.getTracks().forEach((t) => t.stop()); r.ctx.close();
  document.querySelectorAll(".wave i").forEach((b) => (b.style.height = "4px"));
  if (cancel || !r.speechAt || r.samples < 16000 * 0.4) { settle(); flashBar("Didn't catch that", 1800, "idle"); return; }
  const audio = new Float32Array(r.samples);
  let o = 0; for (const c of r.chunks) { audio.set(c, o); o += c.length; }
  setState("thinking", "Transcribing…");
  if (dl.active) { dl.waiting = true; render(); }
  try {
    const text = await J.transcribe(audio);
    dl.waiting = false;
    if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) { settle(); flashBar("Didn't catch that", 1800, "idle"); return; }
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
  if (island.dataset.mode !== "hidden") renderBar(island.dataset.mode);
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

// ------------------------------------------------------------- global events
J.onHotkeyTalk(() => {
  if (settings.ready === false || !settings.onboarded) return openView("setup");
  if (busy) { J.stop(); hush(); return; }
  listening ? stopListening() : startListening();
});
J.onHotkeyPanel(() => { if ($("answer").textContent || $("extras").children.length) { answerShown = !answerShown; render(); if (answerShown) scheduleDismiss(10000); } });
J.onView((v) => {
  if (v === "stop") { hush(); if (listening) stopListening(true); return; }
  openView(v === "onboarding" ? "setup" : v);
});
J.onSettingsOpen(() => openView("settings"));
J.onBlur(() => { if (view === "settings" || view === "memory") closeView(); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (listening) stopListening(true);
  else if (speaking) { hush(); settle(); }
  else if (view !== "answer" && view !== "setup") closeView();
  else if (answerShown) dismissAnswer();
});

// ------------------------------------------------------------- start
(async () => {
  applySettings(await J.getSettings());
  settle();
  if (!settings.onboarded) setTimeout(() => openView("setup"), 600);
  else J.warmup(); // make sure the voice model is ready before the first click
})();
