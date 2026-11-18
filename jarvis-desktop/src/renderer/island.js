// Jarvis island UI. Talks to the main process through window.jarvis (see preload.cjs).
const J = window.jarvis;
const $ = (id) => document.getElementById(id);
const island = $("island"), panel = $("panel"), toastEl = $("toast"), thread = $("thread"), input = $("input");

let settings = {}, mode = "compact", hover = false, busy = false, listening = false;
let speaking = 0, pendingApprovals = 0, activityLabel = "", toastTimer = null, cur = null;

// ------------------------------------------------------------- icons & labels
const SVG = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICON = {
  web_search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  web_fetch: SVG('<path d="M4 4h16v16H4zM4 9h16"/>'),
  look_at_screen: SVG('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  run_powershell: SVG('<path d="m5 8 4 4-4 4M12 16h7"/>'),
  open: SVG('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
  clipboard: SVG('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/>'),
  media_control: SVG('<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
  system_status: SVG('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/>'),
  get_weather: SVG('<path d="M7 18a4 4 0 0 1 0-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 18 18z"/>'),
  set_timer: SVG('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  remember: SVG('<path d="M5 12l5 5L20 7"/>'),
  forget: SVG('<path d="M6 6l12 12M18 6 6 18"/>'),
  show_card: SVG('<rect x="4" y="5" width="16" height="14" rx="2"/>'),
};
const RUN = { web_search: "Searching the web", web_fetch: "Reading a page", look_at_screen: "Looking at your screen", run_powershell: "Running a command", open: "Opening", clipboard: "Using the clipboard", media_control: "Controlling media", system_status: "Checking your PC", get_weather: "Checking the weather", set_timer: "Setting a timer", remember: "Remembering", forget: "Forgetting", show_card: "Preparing details" };
const DONE = { web_search: "Searched the web", web_fetch: "Read a page", look_at_screen: "Looked at your screen", run_powershell: "Ran a command", open: "Opened", clipboard: "Used the clipboard", media_control: "Media controlled", system_status: "Checked your PC", get_weather: "Checked the weather", set_timer: "Timer set", remember: "Saved to memory", forget: "Updated memory", show_card: "Details below" };

// ------------------------------------------------------------- helpers
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
const scrollDown = () => (thread.scrollTop = thread.scrollHeight);
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// ------------------------------------------------------------- island geometry
function layout() {
  let w = 168, h = 34;
  if (mode === "compact") { w = timers.length ? 230 : 168; if (hover) { w += 16; h = 36; } }
  else if (mode === "activity") { w = 330; h = 38; }
  else if (mode === "toast") { w = 400; h = 38 + toastEl.offsetHeight; }
  else if (mode === "expanded") { w = 520; h = Math.min(panel.offsetHeight, 690); }
  island.style.width = w + "px";
  island.style.height = h + "px";
}
new ResizeObserver(() => (mode === "expanded" || mode === "toast") && layout()).observe(panel);
new ResizeObserver(() => mode === "toast" && layout()).observe(toastEl);

function setMode(m) { mode = m; island.dataset.mode = m; updateBar(); layout(); }
function setState(s, label) {
  island.dataset.state = s;
  activityLabel = label ?? ({ idle: "", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking", alert: "" })[s];
  $("status").textContent = label ?? ({ idle: "Ready", listening: "Listening", thinking: "Thinking", speaking: "Speaking", alert: "" })[s];
  updateBar();
}
function updateBar() {
  const t = timers.find((x) => !x.done) || timers[0];
  if (mode === "compact") {
    $("barLabel").textContent = settings.hasKey === false ? "Set up Jarvis" : (t ? t.label : clock());
    $("barRight").textContent = t ? (t.done ? "Done" : fmt(remaining(t))) : "";
  } else if (mode === "activity") {
    $("barLabel").textContent = activityLabel || "Jarvis";
    $("barRight").textContent = "";
  } else if (mode === "toast") {
    $("barLabel").textContent = "Jarvis";
    $("barRight").textContent = t && !t.done ? fmt(remaining(t)) : "";
  }
}
const idle = () => { if (!busy && !listening && !speaking) { setState("idle"); if (mode === "activity") setMode("compact"); } };

function expand(view = "chat") {
  clearTimeout(toastTimer);
  showView(view);
  setMode("expanded");
  J.focus();
  if (view === "chat") setTimeout(() => input.focus(), 120);
}
function collapse() {
  if (pendingApprovals) return;
  setMode(busy || listening ? "activity" : "compact");
  J.release();
}
function toast(text, hint = "", ms) {
  if (mode === "expanded") return;
  $("toastText").textContent = text;
  $("toastHint").textContent = hint;
  setMode("toast");
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(endToast, ms);
}
function endToast() { if (mode === "toast" && !speaking && !hover) setMode(busy || listening ? "activity" : "compact"); else if (mode === "toast") toastTimer = setTimeout(endToast, 1500); }

// pointer: the window is click-through except over the island
island.addEventListener("mouseenter", () => { hover = true; J.interactive(true); if (mode === "compact") layout(); });
island.addEventListener("mouseleave", () => { hover = false; J.interactive(false); if (mode === "compact") layout(); });
island.addEventListener("click", (e) => {
  if (mode === "expanded" || e.composedPath().includes(panel)) return; // clicks inside the panel never re-open it
  expand(settings.hasKey === false ? "settings" : "chat");
});

function showView(v) {
  $("chatView").hidden = v !== "chat"; $("memView").hidden = v !== "memory"; $("setView").hidden = v !== "settings";
  $("composer").hidden = v !== "chat"; $("timers").hidden = v !== "chat";
  if (v === "memory") loadMemory();
  if (v === "settings") fillSettings();
}
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => showView("chat")));

// ------------------------------------------------------------- speech out
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  for (const p of [/George/i, /Ryan/i, /Thomas/i, /Daniel/i, /Google UK English Male/i, /en-GB/i, /David/i, /^en/i]) {
    const v = vs.find((v) => p.test(v.name) || p.test(v.lang)); if (v) return v;
  }
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
  u.onstart = () => setState("speaking");
  u.onend = u.onerror = () => {
    speaking = Math.max(0, speaking - 1);
    if (!speaking) { if (busy) setState("thinking"); else { idle(); if (mode === "toast") toastTimer = setTimeout(endToast, 3500); } }
  };
  speechSynthesis.speak(u);
}
function hush() { speechSynthesis.cancel(); speaking = 0; }

// ------------------------------------------------------------- chat
function addUser(text, withScreen) {
  $("empty")?.remove();
  const m = document.createElement("div"); m.className = "msg user";
  m.textContent = text;
  if (withScreen) m.insertAdjacentHTML("beforeend", `<span class="shot">+ screenshot</span>`);
  thread.appendChild(m); scrollDown();
}
function addBot() {
  const m = document.createElement("div"); m.className = "msg bot";
  m.innerHTML = `<div class="steps"></div><div class="typing"><i></i><i></i><i></i></div><div class="text"></div><div class="extras"></div>`;
  thread.appendChild(m); scrollDown();
  return { el: m, text: m.querySelector(".text"), steps: m.querySelector(".steps"), extras: m.querySelector(".extras"), stepEls: {}, out: "", spoken: 0, card: false };
}
const stopTyping = () => cur?.el.querySelector(".typing")?.remove();

function flushSpeech(final) {
  for (;;) {
    const pending = cur.out.slice(cur.spoken);
    const s = final ? pending : pending.match(/^[\s\S]*?[.!?…](?=\s)/)?.[0];
    if (!s || !s.trim()) { if (final) cur.spoken = cur.out.length; return; }
    speak(s); cur.spoken += s.length; if (final) return;
  }
}

async function ask(text, withScreen = false) {
  text = text.trim();
  if (!text || busy) return;
  hush(); busy = true;
  setEye(false);
  addUser(text, withScreen);
  cur = addBot();
  setState("thinking", withScreen ? "Looking at your screen" : "Thinking…");
  if (mode !== "expanded") setMode("activity");
  setSendMode();
  await J.send(text, withScreen);
  // finished
  for (const [name, el] of Object.entries(cur.stepEls)) if (el.classList.contains("running")) setStep(name, "done");
  stopTyping(); flushSpeech(true);
  busy = false; setSendMode();
  if (mode !== "expanded" && cur.out.trim()) {
    toast(cur.out.trim(), cur.card ? "Details in the panel · click to open" : "", settings.voice ? 0 : 6000 + cur.out.length * 40);
  } else if (mode === "activity") setMode("compact");
  if (!speaking) idle();
}

function setStep(name, status) {
  let el = cur.stepEls[name];
  if (!el) { el = cur.stepEls[name] = document.createElement("div"); cur.steps.appendChild(el); }
  el.className = "step " + status;
  el.innerHTML = (ICON[name] || "") + `<span>${esc(status === "running" ? RUN[name] || name : status === "error" ? `${RUN[name] || name} failed` : DONE[name] || name)}</span>`;
}

J.onAgent((ev) => {
  if (!cur) return;
  switch (ev.type) {
    case "text":
      stopTyping(); cur.out += ev.text; cur.text.textContent = cur.out; flushSpeech(false); scrollDown(); break;
    case "tool":
      setStep(ev.name, ev.status);
      if (ev.status === "running") { setState("thinking", ev.detail || RUN[ev.name] || "Working…"); if (cur.out && !/\s$/.test(cur.out)) cur.out += " "; }
      scrollDown(); break;
    case "action":
      if (ev.name === "set_timer") addTimer(ev.input.seconds, ev.input.label);
      if (ev.name === "show_card") { addCard(ev.input.title, ev.input.body); cur.card = true; }
      break;
    case "approval": approvalCard(ev); break;
    case "error":
      stopTyping(); cur.el.classList.add("error");
      cur.out += (cur.out ? "\n" : "") + ev.message; cur.text.textContent = cur.out;
      if (ev.code === "NO_KEY") { busy = false; expand("settings"); }
      if (ev.detail) console.warn(ev.detail);
      break;
  }
});

function addCard(title, body) {
  const c = document.createElement("div"); c.className = "card";
  c.innerHTML = `<h4>${esc(title)}</h4><div class="body">${md(body)}</div>`;
  cur.extras.appendChild(c); scrollDown();
}
function approvalCard({ id, command, reason }) {
  pendingApprovals++;
  const c = document.createElement("div"); c.className = "approve";
  c.innerHTML = `<p><b>Run this on your PC?</b> ${esc(reason || "")}</p><pre>${esc(command)}</pre><div class="btns"><button class="ghost" data-a="0">Don't run</button><button class="primary" data-a="1">Run</button></div>`;
  c.onclick = (e) => {
    const b = e.target.closest("button[data-a]"); if (!b) return;
    const ok = b.dataset.a === "1";
    J.approve(id, ok); pendingApprovals--;
    c.classList.add("done"); c.querySelector("p b").textContent = ok ? "Approved:" : "Declined:";
  };
  cur.extras.appendChild(c);
  setState("alert", "Waiting for your approval");
  expand(); scrollDown();
  speak("I need your go-ahead for that.");
}

// ------------------------------------------------------------- composer
const grow = () => { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; setSendMode(); };
function setSendMode() {
  const b = $("btnSend");
  if (busy) { b.disabled = false; b.innerHTML = SVG('<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>'); b.title = "Stop"; }
  else { b.disabled = !input.value.trim(); b.innerHTML = SVG('<path d="M12 19V5M5 12l7-7 7 7"/>'); b.title = "Send"; }
}
let eye = false;
function setEye(on) { eye = on; $("btnEye").setAttribute("aria-pressed", on); }
$("btnEye").onclick = () => setEye(!eye);
input.oninput = grow;
input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); } };
$("composer").onsubmit = (e) => {
  e.preventDefault();
  if (busy) { J.stop(); hush(); return; }
  const t = input.value; input.value = ""; grow(); ask(t, eye);
};
document.querySelectorAll(".chip").forEach((c) => (c.onclick = () => ask(c.textContent, !!c.dataset.screen)));
$("btnClose").onclick = collapse;
$("btnNew").onclick = () => { if (busy) return; J.reset(); hush(); location.reload(); };
$("btnMem").onclick = () => showView($("memView").hidden ? "memory" : "chat");
$("btnSet").onclick = () => showView($("setView").hidden ? "settings" : "chat");
$("btnMic").onclick = () => (listening ? stopListening() : startListening());

// ------------------------------------------------------------- speech in (local Whisper via main process)
let rec = null;
// The worklet streams raw 16 kHz mic samples to the page (inline so it loads from file:// in the packaged app).
const WORKLET_URL = URL.createObjectURL(new Blob([`
  class Recorder extends AudioWorkletProcessor {
    process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
  }
  registerProcessor("recorder", Recorder);`], { type: "text/javascript" }));
async function startListening() {
  if (listening) return stopListening();
  if (busy) return;
  hush();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(WORKLET_URL);
    const src = ctx.createMediaStreamSource(stream), node = new AudioWorkletNode(ctx, "recorder");
    src.connect(node);
    rec = { stream, ctx, node, chunks: [], samples: 0, started: performance.now(), speechAt: 0, lastVoice: 0, floor: 0, floorN: 0 };
    node.port.onmessage = ({ data }) => onAudio(data);
  } catch (e) {
    toast("I can't access the microphone. Check Windows Settings → Privacy → Microphone.", "", 6000);
    return;
  }
  listening = true;
  $("btnMic").classList.add("on");
  setState("listening");
  if (mode !== "expanded") setMode("activity");
}
function onAudio(chunk) {
  if (!rec) return;
  rec.chunks.push(chunk); rec.samples += chunk.length;
  let sum = 0; for (const x of chunk) sum += x * x;
  const rms = Math.sqrt(sum / chunk.length), now = performance.now(), t = now - rec.started;
  if (t < 300) { rec.floor = (rec.floor * rec.floorN + rms) / ++rec.floorN; }
  const threshold = Math.max(0.012, rec.floor * 2.5);
  if (rms > threshold) { rec.lastVoice = now; if (!rec.speechAt) rec.speechAt = now; }
  // waveform
  document.querySelectorAll("#wave i").forEach((b, i) => (b.style.height = 4 + Math.min(12, rms * 260 * (0.6 + 0.4 * Math.sin(now / 90 + i))) + "px"));
  if (rec.speechAt && now - rec.lastVoice > 1300) stopListening();          // pause after speaking → done
  else if (!rec.speechAt && t > 8000) stopListening(true);                   // never spoke
  else if (t > 45000) stopListening();                                       // hard cap
}
async function stopListening(cancel = false) {
  if (!rec) return;
  const r = rec; rec = null; listening = false;
  $("btnMic").classList.remove("on");
  r.node.port.onmessage = null; r.stream.getTracks().forEach((t) => t.stop()); r.ctx.close();
  document.querySelectorAll("#wave i").forEach((b) => (b.style.height = "4px"));
  if (cancel || !r.speechAt || r.samples < 16000 * 0.4) { setState("idle"); if (mode === "activity") toast("Didn't catch that.", "", 1800); return; }
  const audio = new Float32Array(r.samples);
  let o = 0; for (const c of r.chunks) { audio.set(c, o); o += c.length; }
  setState("thinking", "Transcribing…");
  try {
    const text = await J.transcribe(audio);
    if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) { setState("idle"); if (mode !== "expanded") toast("Didn't catch that.", "", 1800); return; }
    ask(text, eye);
  } catch (e) {
    setState("idle");
    toast("Speech recognition failed: " + (e.message || e).toString().replace(/^Error invoking remote method '[^']+': /, ""), "", 6000);
  }
}
J.onSttProgress((p) => {
  if (p.error) { toast("Couldn't load the voice model: " + p.error, "", 6000); return; }
  if (!p.ready) { setState("thinking", `Downloading voice model ${p.pct}% (one time)`); }
});

// ------------------------------------------------------------- timers
const timers = [];
const remaining = (t) => Math.max(0, Math.ceil((t.end - Date.now()) / 1000));
function fmt(r) { const h = Math.floor(r / 3600), m = Math.floor(r / 60) % 60, s = r % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); }
function addTimer(seconds, label) { timers.push({ id: String(Math.random()), end: Date.now() + seconds * 1000, label, done: false }); renderTimers(); layout(); }
function renderTimers() {
  $("timers").innerHTML = timers.map((t) => `<span class="timer ${t.done ? "done" : ""}">${esc(t.label)} <b>${t.done ? "Done" : fmt(remaining(t))}</b><button data-id="${t.id}" title="Dismiss">${SVG('<path d="M6 6l12 12M18 6 6 18"/>')}</button></span>`).join("");
  updateBar();
}
$("timers").onclick = (e) => { const b = e.target.closest("button[data-id]"); if (!b) return; timers.splice(timers.findIndex((t) => t.id === b.dataset.id), 1); renderTimers(); layout(); };
setInterval(() => {
  for (const t of timers) if (!t.done && Date.now() >= t.end) {
    t.done = true;
    J.notify("Jarvis", `${t.label}: time's up`);
    speak(`Your ${t.label} timer is done.`);
    setState("alert"); toast(`⏱  ${t.label}: time's up`, "", 8000);
    setTimeout(() => { const i = timers.indexOf(t); if (i >= 0) { timers.splice(i, 1); renderTimers(); layout(); } idle(); }, 60000);
  }
  if (timers.length) renderTimers(); else if (mode === "compact") updateBar();
}, 500);

// ------------------------------------------------------------- memory
async function loadMemory() { renderMemory(await J.getMemory()); }
function renderMemory(mem) {
  $("memList").innerHTML = mem.notes.length
    ? mem.notes.map((n, i) => `<li><div>${esc(n.note)}<small>${new Date(n.at).toLocaleDateString()}</small></div><button data-i="${i}" title="Forget">${SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}</button></li>`).reverse().join("")
    : `<li class="none">Nothing yet. Say “remember that…” and it will appear here.</li>`;
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
}
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
  fillSettings();
  if (patch.speechModel) J.warmup(); // start downloading the voice model in the background
};
$("btnQuit").onclick = () => J.quit();
function applySettings(s) {
  settings = s;
  $("kTalk").textContent = s.hotkeyTalk;
  if (!s.voice) hush();
  updateBar(); layout();
}

// ------------------------------------------------------------- global events
J.onHotkeyTalk(() => (listening ? stopListening() : startListening()));
J.onHotkeyPanel(() => (mode === "expanded" ? collapse() : expand()));
J.onSettingsOpen(() => expand("settings"));
J.onBlur(() => { if (mode === "expanded" && !pendingApprovals) collapse(); });
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (listening) stopListening(true);
  else if (speaking) { hush(); idle(); }
  else if (mode === "expanded") collapse();
});

// ------------------------------------------------------------- start
(async () => {
  const hr = new Date().getHours();
  $("hello").textContent = `Good ${hr < 5 ? "evening" : hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening"}.`;
  applySettings(await J.getSettings());
  setState("idle"); setMode("compact");
  if (!settings.hasKey) setTimeout(() => toast("Welcome. Click here to add your API key.", "", 9000), 800);
  else J.warmup(); // preload the voice model so the first "Alt+J" is quick
})();
