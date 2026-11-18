// Jarvis's ears and voice (a hidden window). It records you, hands the audio to the local
// speech model, sends the text to Claude, speaks the answer with the neural voice, then
// listens again so you can just keep talking. It tells the blob what it's doing (state +
// loudness) so the ball can react. Approvals can be answered by voice ("yes" / "no").
const J = window.jarvis;
let settings = {};
let state = "idle", busy = false, listening = false, speaking = 0, convo = false, control = false;
let pendingApproval = null;   // { id, kind } while waiting for a yes/no
let spokenOut = "", spoken = 0;

// ---------------------------------------------------------- state → blob
let level = 0, levelTimer = null;
function setState(s) { state = s; pushState(); }
function pushState() { J.state({ s: state, level }); }
function settle() {
  if (pendingApproval) return setState("alert");
  if (control) return setState("control");
  if (listening) return setState("listening");
  if (busy) return setState("thinking");
  if (speaking) return setState("speaking");
  setState("idle");
}
function startLevelFeed(read) {
  clearInterval(levelTimer);
  levelTimer = setInterval(() => { level = read(); pushState(); }, 33);
}
function stopLevelFeed() { clearInterval(levelTimer); levelTimer = null; level = 0; pushState(); }

// ---------------------------------------------------------- voice out (Kokoro → Web Audio)
let ctx = null, gain = null, analyser = null, playHead = 0, sources = [], gen = 0, chain = Promise.resolve(), kokoroOk = true;
function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    gain = ctx.createGain(); gain.gain.value = 1;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    gain.connect(analyser); analyser.connect(ctx.destination);
  }
  return ctx;
}
const outLevel = () => {
  if (!analyser) return 0;
  const buf = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(buf);
  let s = 0; for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
  return Math.min(1, Math.sqrt(s / buf.length) * 4);
};
function speak(text, after) {
  text = text.replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return after?.();
  if (!settings.voice) return after?.();
  const g = gen;
  speaking++; settle();
  startLevelFeed(outLevel);
  const synth = kokoroOk ? J.tts(text).catch((e) => { console.warn("Neural voice unavailable, using Windows voice:", e); kokoroOk = false; return null; }) : Promise.resolve(null);
  chain = chain.then(async () => {
    const res = await synth;
    if (g !== gen) return finished(after);
    if (!res) return windowsVoice(text, g, after);
    const c = audio(); if (c.state === "suspended") await c.resume();
    const buf = c.createBuffer(1, res.audio.length, res.sampleRate);
    buf.copyToChannel(res.audio instanceof Float32Array ? res.audio : new Float32Array(res.audio), 0);
    const src = c.createBufferSource(); src.buffer = buf; src.connect(gain);
    const start = Math.max(c.currentTime + 0.02, playHead);
    src.start(start); playHead = start + buf.duration + 0.06;
    sources.push(src);
    await new Promise((r) => (src.onended = r));
    sources = sources.filter((x) => x !== src);
    finished(after);
  });
}
function windowsVoice(text, g, after) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const vs = speechSynthesis.getVoices();
    const v = [/Ryan|George|Thomas/i, /en-GB/i, /^en/i].map((p) => vs.find((x) => p.test(x.name) || p.test(x.lang))).find(Boolean);
    if (v) u.voice = v;
    u.rate = 1.15; u.volume = 1;
    u.onend = u.onerror = () => { finished(after); resolve(); };
    if (g !== gen) { finished(after); return resolve(); }
    speechSynthesis.speak(u);
  });
}
function finished(after) {
  speaking = Math.max(0, speaking - 1);
  if (speaking) return;
  stopLevelFeed(); settle();
  if (after) return after();
  if (!busy) continueConversation();
}
function hush() {
  gen++; speaking = 0; chain = Promise.resolve();
  for (const s of sources) { try { s.onended?.(); s.stop(); } catch {} }
  sources = []; playHead = 0; speechSynthesis.cancel(); stopLevelFeed();
}
function flushSpeech(final) {
  for (;;) {
    const pending = spokenOut.slice(spoken);
    const s = final ? pending : pending.match(/^[\s\S]*?[.!?…](?=\s)/)?.[0];
    if (!s || !s.trim()) { if (final) spoken = spokenOut.length; return; }
    speak(s); spoken += s.length; if (final) return;
  }
}

// ---------------------------------------------------------- voice in (mic → VAD → Whisper)
const WORKLET = URL.createObjectURL(new Blob([`
  class R extends AudioWorkletProcessor { process(i) { const c = i[0] && i[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } }
  registerProcessor("rec", R);`], { type: "text/javascript" }));
let rec = null;
async function listen({ followUp = false, yesNo = false } = {}) {
  if (listening || (busy && !yesNo)) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const c = new AudioContext({ sampleRate: 16000 });
    const src = c.createMediaStreamSource(stream);
    let node, port;
    try { await c.audioWorklet.addModule(WORKLET); node = new AudioWorkletNode(c, "rec"); port = node.port; src.connect(node); }
    catch {
      node = c.createScriptProcessor(2048, 1, 1);
      port = { set onmessage(fn) { node.onaudioprocess = fn ? (e) => fn({ data: e.inputBuffer.getChannelData(0).slice(0) }) : null; } };
      const mute = c.createGain(); mute.gain.value = 0; src.connect(node); node.connect(mute); mute.connect(c.destination);
    }
    rec = { stream, c, node, port, chunks: [], n: 0, t0: performance.now(), speechAt: 0, lastVoice: 0, floor: 0, fN: 0, followUp, yesNo, rms: 0 };
    port.onmessage = ({ data }) => onAudio(data);
  } catch {
    J.notify("Jarvis", "I can't use the microphone. Allow it in Windows Settings → Privacy & security → Microphone.");
    convo = false; settle(); return;
  }
  listening = true; settle();
  startLevelFeed(() => Math.min(1, (rec?.rms || 0) * 9));
}
function onAudio(chunk) {
  if (!rec) return;
  rec.chunks.push(chunk); rec.n += chunk.length;
  let s = 0; for (const x of chunk) s += x * x;
  const rms = Math.sqrt(s / chunk.length), now = performance.now(), t = now - rec.t0;
  rec.rms = rms;
  if (t < 300) rec.floor = (rec.floor * rec.fN + rms) / ++rec.fN;
  if (rms > Math.max(0.012, rec.floor * 2.5)) { rec.lastVoice = now; if (!rec.speechAt) rec.speechAt = now; }
  if (rec.speechAt && now - rec.lastVoice > 850) stopListening();                       // you paused → go
  else if (!rec.speechAt && t > (rec.followUp || rec.yesNo ? 6000 : 8000)) stopListening(true); // silence → done
  else if (t > 45000) stopListening();
}
async function stopListening(silent = false) {
  if (!rec) return;
  const r = rec; rec = null; listening = false;
  r.port.onmessage = null; r.stream.getTracks().forEach((t) => t.stop()); r.c.close();
  stopLevelFeed();
  if (silent || !r.speechAt || r.n < 16000 * 0.35) { if (!r.yesNo) convo = false; settle(); return; }
  const a = new Float32Array(r.n); let o = 0; for (const c of r.chunks) { a.set(c, o); o += c.length; }
  setState("thinking");
  let text = "";
  try { text = await J.transcribe(a); } catch (e) { console.warn(e); speak("Sorry, my hearing isn't working right now."); settle(); return; }
  if (r.yesNo) return answerApproval(text);
  if (!text || /^\[.*\]$|^\(.*\)$/.test(text)) { settle(); return continueConversation(); }
  ask(text);
}

// ---------------------------------------------------------- conversation
function continueConversation() {
  if (!convo || listening || busy || speaking || pendingApproval) return;
  setTimeout(() => { if (convo && !listening && !busy && !speaking && !pendingApproval) listen({ followUp: true }); }, 200);
}
async function ask(text) {
  if (!text.trim() || busy) return;
  hush(); busy = true; spokenOut = ""; spoken = 0; settle();
  await J.send(text.trim(), false);
  flushSpeech(true);
  busy = false; settle();
  if (!speaking) continueConversation();
}

J.onAgent((ev) => {
  switch (ev.type) {
    case "text": spokenOut += ev.text; flushSpeech(false); break;
    case "tool": if (ev.status === "running" && spokenOut && !/\s$/.test(spokenOut)) spokenOut += " "; break;
    case "action": if (ev.name === "set_timer") addTimer(ev.input.seconds, ev.input.label); break;
    case "control": control = ev.on; settle(); break;
    case "approval": askApproval(ev); break;
    case "error":
      spokenOut += (spokenOut ? " " : "") + ev.message + " ";
      if (ev.code === "SETUP") { convo = false; J.openPanel("setup"); }
      break;
  }
});

// approvals: Jarvis asks out loud and listens for yes/no; the panel shows the details + buttons
function askApproval({ id, kind, reason }) {
  pendingApproval = { id, kind };
  if (listening) stopListening(true);
  settle();
  const q = kind === "control" ? "May I use your mouse and keyboard for this?" : `I'd like to ${reason ? reason.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase()) : "run a command on your PC"}. Shall I go ahead?`;
  speak(q, () => { if (pendingApproval?.id === id) { listening = false; listen({ yesNo: true }); } });
}
function answerApproval(text) {
  const t = text.toLowerCase();
  if (!pendingApproval) return settle();
  if (/\b(yes|yeah|yep|sure|go ahead|do it|okay|ok|please|allow|fine|igen|persze|mehet)\b/.test(t)) J.approve(pendingApproval.id, true);
  else if (/\b(no|nope|don't|do not|stop|cancel|nem|ne)\b/.test(t)) J.approve(pendingApproval.id, false);
  else { speak("Sorry, was that a yes or a no?", () => pendingApproval && listen({ yesNo: true })); return; }
}
J.onApprovalResolved(({ id, approved }) => {
  if (pendingApproval?.id !== id) return;
  pendingApproval = null;
  if (listening && rec?.yesNo) stopListening(true);
  settle();
});

// ---------------------------------------------------------- timers (spoken + notification)
function addTimer(seconds, label) {
  setTimeout(() => {
    J.notify("Jarvis", `${label}: time's up`);
    speak(`Pardon me. Your ${label} timer is done.`);
  }, seconds * 1000);
}

// ---------------------------------------------------------- talk button / hotkey
J.onTalk(() => {
  if (pendingApproval) return;
  if (busy) { convo = false; J.stop(); hush(); settle(); return; }
  if (speaking) { convo = false; hush(); settle(); return; }
  if (listening) return stopListening(!rec?.speechAt);
  if (settings.ready === false) return J.openPanel("setup");
  convo = true; hush(); listen();
});
J.onSetupDone(async () => { settings = await J.getSettings(); speak(`I'm ready${settings.name ? ", " + settings.name : ""}. Click me whenever you need me.`); });

(async () => {
  settings = await J.getSettings();
  setInterval(async () => { settings = await J.getSettings(); }, 15000); // pick up settings changes
  settle();
})();
