// Jarvis desktop — main process.
// Windows:  island – the black island at the top of the screen (pull it down to tear it off
//                    into a floating widget); it listens, shows answers, live activities
//           panel  – small card for setup, settings and memory
//           cursor – Jarvis's own pointer when it shows or does things on screen
// This process owns the Claude connection and every tool that touches the computer.
// Speech models run in a separate utility process (ml-worker.js) so nothing here stutters.

import {
  app, BrowserWindow, screen, globalShortcut, ipcMain, desktopCapturer, shell,
  clipboard, Tray, Menu, nativeImage, safeStorage, Notification, session, utilityProcess,
} from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeCodeSession, startMcpServer, findClaude, openSignInTerminal, claudeAuthStatus } from "./claude-code.js";
import { InputDriver } from "./input-driver.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === "win32";
const USER_DIR = () => app.getPath("userData");

// ---------------------------------------------------------------- settings
const DEFAULTS = {
  backend: "claude", // "claude" = your Claude account via Claude Code · "api" = Anthropic API key
  model: "claude-sonnet-5-5", // fast enough for conversation; Opus is one click away in Settings
  effort: "low",
  voiceName: "bm_george",     // Kokoro neural voice (British male)
  settingsVersion: 2,
  dock: "top",          // "top" = blob in the screen edge · "float" = torn-off ball
  floatX: null, floatY: null,
  setupDone: 0,         // version of the setup flow the user finished
  name: "sir",
  speechModel: "onnx-community/whisper-base",
  language: "auto",
  hotkeyTalk: "Alt+J",
  voice: true,
  confirmCommands: true,
  allowControl: true,   // may Jarvis use mouse & keyboard when asked (still asks once per task)
  onboarded: false,
};
let settings = { ...DEFAULTS };
let apiKey = "";

async function loadSettings() {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(USER_DIR(), "settings.json"), "utf8"));
    settings = { ...DEFAULTS, ...raw.settings };
    if ((raw.settings?.settingsVersion || 1) < 2) { // v1 → v2: faster voice defaults
      settings.model = DEFAULTS.model; settings.effort = "low"; settings.settingsVersion = 2;
    }
    if (raw.apiKey) {
      apiKey = raw.encrypted && safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(raw.apiKey, "base64"))
        : raw.apiKey;
    }
  } catch { /* first run */ }
  if (!apiKey && process.env.ANTHROPIC_API_KEY) apiKey = process.env.ANTHROPIC_API_KEY;
}
async function saveSettings() {
  const enc = safeStorage.isEncryptionAvailable();
  const stored = apiKey ? (enc ? safeStorage.encryptString(apiKey).toString("base64") : apiKey) : "";
  await fs.writeFile(path.join(USER_DIR(), "settings.json"),
    JSON.stringify({ settings, apiKey: stored, encrypted: enc }, null, 2));
}
const SETUP_VERSION = 3;
const publicSettings = async () => {
  const claudePath = await findClaude();
  return {
  ...settings,
  claudePath,
  ready: settings.backend === "claude" ? !!claudePath : !!apiKey, // fast; sign-in is checked separately
  hasKey: !!apiKey,
  keyHint: apiKey ? "…" + apiKey.slice(-4) : "",
  openAtLogin: app.getLoginItemSettings().openAtLogin,
  platform: process.platform,
  };
};

// ---------------------------------------------------------------- memory
const MEM = () => path.join(USER_DIR(), "memory.json");
async function loadMemory() { try { return JSON.parse(await fs.readFile(MEM(), "utf8")); } catch { return { notes: [] }; } }
async function saveMemory(m) { await fs.writeFile(MEM(), JSON.stringify(m, null, 2)); }

// ---------------------------------------------------------------- windows
let islandWin, panelWin, tray;
const DOCK = { w: 560, h: 760 }, WIDGET = { w: 440, h: 720 }, PANEL_W = 440;
let dock = "top";

const prefs = (extra = {}) => ({
  preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true, backgroundThrottling: false, ...extra,
});
const overlay = { frame: false, transparent: true, resizable: false, movable: false, skipTaskbar: true, hasShadow: false,
  alwaysOnTop: true, show: false, fullscreenable: false, maximizable: false, minimizable: false, backgroundColor: "#00000000" };

function dockBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: Math.round(workArea.x + (workArea.width - DOCK.w) / 2), y: workArea.y, width: DOCK.w, height: DOCK.h };
}
function createWindows() {
  islandWin = new BrowserWindow({ ...overlay, ...dockBounds(), focusable: true, webPreferences: prefs() });
  islandWin.setAlwaysOnTop(true, "screen-saver");
  islandWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  islandWin.setContentProtection(true);                   // never in Jarvis's own screenshots
  islandWin.setIgnoreMouseEvents(true, { forward: true }); // click-through except over the island
  islandWin.loadFile(path.join(here, "renderer", "island.html"));
  islandWin.once("ready-to-show", () => {
    islandWin.showInactive();
    if (settings.dock === "float") toWidget(settings.floatX, settings.floatY, false);
  });
}

// broadcast to every Jarvis window; each one ignores what it doesn't need
const send = (channel, payload) => {
  for (const w of [islandWin, panelWin]) if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
};

// ---- dock ↔ widget (one window: docked at the top edge, or torn off anywhere)
function clampWidget(x, y) {
  const d = screen.getDisplayNearestPoint({ x: x + 200, y: y + 40 }).workArea;
  return { x: Math.round(Math.min(Math.max(x, d.x - 20), d.x + d.width - 420)), y: Math.round(Math.min(Math.max(y, d.y - 10), d.y + d.height - 160)) };
}
function toWidget(x, y, save = true) {
  const b = dockBounds();
  const p = clampWidget(x ?? b.x + 60, y ?? b.y + 120);
  islandWin.setBounds({ ...p, width: WIDGET.w, height: WIDGET.h });
  dock = "float"; settings.dock = "float"; settings.floatX = p.x; settings.floatY = p.y;
  send("island:mode", "widget");
  if (save) saveSettings().catch(() => {});
}
function toDock(save = true) {
  stopFollow();
  islandWin.setBounds(dockBounds());
  dock = "top"; settings.dock = "top";
  send("island:mode", "dock");
  if (save) saveSettings().catch(() => {});
}
// While the mouse button is held the widget follows the cursor (driven from here: smooth).
let follow = null;
function startFollow(offX, offY) {
  stopFollow();
  follow = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    islandWin.setPosition(Math.round(c.x - offX), Math.round(c.y - offY));
  }, 8);
}
function stopFollow() { if (follow) clearInterval(follow); follow = null; }

ipcMain.on("island:hover", (_e, on) => islandWin?.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.on("island:menu", () => {
  Menu.buildFromTemplate([
    { label: "Settings", click: () => openPanel("settings") },
    { label: "Memory", click: () => openPanel("memory") },
    { label: dock === "top" ? "Float as widget" : "Dock to top", click: () => (dock === "top" ? toWidget() : toDock()) },
    { type: "separator" },
    { label: "Quit Jarvis", click: () => app.quit() },
  ]).popup();
});
ipcMain.on("island:tear", () => {        // pulled hard enough: tear off and follow the mouse
  const c = screen.getCursorScreenPoint();
  toWidget(c.x - 220, c.y - 30, false);
  islandWin.setIgnoreMouseEvents(false);
  startFollow(220, 30);
});
ipcMain.on("island:dragStart", () => {
  if (dock !== "float") return;
  const c = screen.getCursorScreenPoint(), [x, y] = islandWin.getPosition();
  islandWin.setIgnoreMouseEvents(false);
  startFollow(c.x - x, c.y - y);
});
ipcMain.on("island:dragEnd", () => {
  if (!follow) return;
  stopFollow();
  const [x, y] = islandWin.getPosition();
  const top = screen.getDisplayNearestPoint({ x: x + 200, y }).workArea.y;
  if (y < top + 24) return toDock();     // dropped on the top edge → dock
  const p = clampWidget(x, y);
  islandWin.setPosition(p.x, p.y);
  settings.floatX = p.x; settings.floatY = p.y; saveSettings().catch(() => {});
  islandWin.setIgnoreMouseEvents(true, { forward: true });
});
ipcMain.handle("island:mode", () => (dock === "top" ? "dock" : "widget"));
ipcMain.on("island:focus", () => islandWin?.focus());

// ---- things the island does directly on the PC (no Claude needed)
ipcMain.on("pc:mediaKey", (_e, action) => { if (MEDIA_VK[action]) pressMediaKey(action, action.startsWith("volume") ? 2 : 1); });
ipcMain.on("pc:openExternal", (_e, url) => { if (/^(https?:|spotify:)/i.test(url)) shell.openExternal(url); });
ipcMain.handle("pc:openPath", async (_e, p) => {
  try { await fs.access(p); } catch { return "That file isn't there any more."; }
  return shell.openPath(p);
});

// ---- now playing: read the current Windows media session (Spotify, YouTube in a browser, …)
const MEDIA_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
while ($true) {
  try {
    $s = $mgr.GetCurrentSession()
    if ($s) {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $pb = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
      $o = @{ title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId; playing = ($pb.PlaybackStatus.ToString() -eq 'Playing'); pos = $tl.Position.TotalSeconds; dur = $tl.EndTime.TotalSeconds }
      [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
    } else { [Console]::Out.WriteLine('{}') }
  } catch { [Console]::Out.WriteLine('{}') }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 1500
}`;
let mediaProc = null, lastMedia = "";
function startMediaWatch() {
  if (!IS_WIN || mediaProc) return;
  const encoded = Buffer.from(MEDIA_PS, "utf16le").toString("base64");
  mediaProc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], { windowsHide: true });
  let buf = "";
  mediaProc.stdout.setEncoding("utf8");
  mediaProc.stdout.on("data", (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("{") || line === lastMedia) continue;
      lastMedia = line;
      try { send("media:now", JSON.parse(line)); } catch {}
    }
  });
  mediaProc.on("exit", () => { mediaProc = null; });   // not supported on this Windows build: no music pill, nothing else breaks
}

// ---- panel: setup, settings, memory, approvals
let panelView = null;
function openPanel(view, data) {
  const { workArea } = screen.getPrimaryDisplay();
  if (!panelWin || panelWin.isDestroyed()) {
    panelWin = new BrowserWindow({ ...overlay, width: PANEL_W, height: 200, focusable: true, webPreferences: prefs() });
    panelWin.setAlwaysOnTop(true, "floating");
    panelWin.loadFile(path.join(here, "renderer", "panel.html"));
    panelWin.on("blur", () => { if (panelView === "settings" || panelView === "memory") closePanel(); });
    panelWin.on("closed", () => (panelWin = null));
  }
  panelView = view;
  const anchor = dock === "float" ? islandWin.getBounds() : { ...dockBounds(), height: 60 };
  const x = Math.round(Math.min(Math.max(anchor.x + anchor.width / 2 - PANEL_W / 2, workArea.x + 8), workArea.x + workArea.width - PANEL_W - 8));
  const y = dock === "float" ? Math.min(anchor.y + anchor.height - 10, workArea.y + workArea.height - 420) : workArea.y + 56;
  panelWin.setPosition(x, Math.round(y));
  const show = () => { panelWin.webContents.send("panel:open", { view, data }); panelWin.show(); panelWin.focus(); };
  panelWin.webContents.isLoading() ? panelWin.webContents.once("did-finish-load", show) : show();
}
function closePanel() { panelView = null; if (panelWin && !panelWin.isDestroyed()) panelWin.hide(); }
ipcMain.on("panel:resize", (_e, h) => { if (panelWin && !panelWin.isDestroyed()) panelWin.setSize(PANEL_W, Math.min(Math.max(80, Math.round(h)), 640)); });
ipcMain.on("panel:close", () => closePanel());
ipcMain.on("setup:done", async () => { settings.setupDone = SETUP_VERSION; settings.onboarded = true; await saveSettings(); closePanel(); send("setup:done"); });

function createTray() {
  const img = nativeImage.createFromPath(path.join(here, "..", "assets", "tray.png"));
  tray = new Tray(img);
  tray.setToolTip("Jarvis");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Talk", click: () => send("island:talk") },
    { label: "Settings", click: () => openPanel("settings") },
    { label: "Memory", click: () => openPanel("memory") },
    { label: "Run setup again", click: () => openPanel("setup") },
    { label: "Float / dock", click: () => (dock === "top" ? toWidget() : toDock()) },
    { type: "separator" },
    { label: "Start with Windows", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: "Quit Jarvis", click: () => app.quit() },
  ]));
  tray.on("click", () => send("island:talk"));
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const ok = [];
  try { ok.push(globalShortcut.register(settings.hotkeyTalk, () => send("island:talk")) ? settings.hotkeyTalk : `${settings.hotkeyTalk} (in use)`); }
  catch { ok.push(`${settings.hotkeyTalk} (invalid)`); }
  return ok;
}

// ---------------------------------------------------------------- screen
async function captureScreen() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const scale = Math.min(1, 1568 / Math.max(width, height));
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
  });
  const src = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!src) throw new Error("No screen available to capture");
  const img = src.thumbnail.getSize();
  lastShot = { display, w: img.width, h: img.height };
  return { data: src.thumbnail.toJPEG(80).toString("base64"), label: `display (screenshot is ${img.width}×${img.height} px; give coordinates in these pixels)` };
}

// ---------------------------------------------------------------- cursor overlay + mouse/keyboard control
let lastShot = null;          // maps screenshot pixels back to the screen
let cursorWin = null;
const input = new InputDriver();
let controlGranted = false;   // granted once per task, reset when the turn ends
let injecting = false;        // true while we send synthetic keys (so our own Esc doesn't abort)

function shotToScreen(x, y) {
  if (!lastShot) throw new Error("Take a screenshot with look_at_screen first, then use its pixel coordinates.");
  const { display, w, h } = lastShot, b = display.bounds;
  const dip = { x: Math.round(b.x + (x / w) * b.width), y: Math.round(b.y + (y / h) * b.height) };
  const phys = IS_WIN ? screen.dipToScreenPoint(dip) : dip;
  return { dip, phys, display };
}

function ensureCursorWindow(display) {
  if (!cursorWin || cursorWin.isDestroyed()) {
    cursorWin = new BrowserWindow({
      ...display.bounds, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, backgroundColor: "#00000000",
      webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true },
    });
    cursorWin.setIgnoreMouseEvents(true);
    cursorWin.setAlwaysOnTop(true, "screen-saver");
    cursorWin.setContentProtection(true); // never appears in Jarvis's own screenshots
    cursorWin.loadFile(path.join(here, "renderer", "cursor.html"));
  } else cursorWin.setBounds(display.bounds);
  if (!cursorWin.isVisible()) cursorWin.showInactive();
  return cursorWin;
}

async function showCursor(x, y, text, { click = false, holdMs = 4000 } = {}) {
  const { dip, display } = shotToScreen(x, y);
  const w = ensureCursorWindow(display);
  if (w.webContents.isLoading()) await new Promise((r) => w.webContents.once("did-finish-load", r));
  w.webContents.send("cursor", { x: dip.x - display.bounds.x, y: dip.y - display.bounds.y, text, click, holdMs });
}

function onEscape() { if (!injecting) { controlGranted = false; send("agent", { type: "control", on: false }); stopAll(); } }
function controlStarted() {
  send("agent", { type: "control", on: true });
  if (!globalShortcut.isRegistered("Escape")) globalShortcut.register("Escape", onEscape);
}
function controlEnded() {
  controlGranted = false;
  if (globalShortcut.isRegistered("Escape")) globalShortcut.unregister("Escape");
  send("agent", { type: "control", on: false });
}

async function computerAction(a) {
  if (!settings.allowControl) return "The user has turned off mouse and keyboard control in Settings. Use point_at to show them instead.";
  if (!controlGranted) {
    const ok = await askApproval("", "Let Jarvis use your mouse and keyboard for this task? Press Esc any time to stop.", "control");
    if (!ok) return "The user didn't allow mouse and keyboard control for this task.";
    controlGranted = true;
  }
  controlStarted();
  const needsXY = ["click", "double_click", "right_click", "move", "scroll", "drag"].includes(a.action);
  let p = null;
  if (needsXY) {
    p = shotToScreen(a.x, a.y);
    await showCursor(a.x, a.y, a.label || "", { click: a.action.includes("click"), holdMs: 2500 });
    await new Promise((r) => setTimeout(r, 560)); // let the user see where it's going
  }
  injecting = true;
  try {
    switch (a.action) {
      case "click": await input.click(p.phys.x, p.phys.y, 0, 1); break;
      case "double_click": await input.click(p.phys.x, p.phys.y, 0, 2); break;
      case "right_click": await input.click(p.phys.x, p.phys.y, 1, 1); break;
      case "move": await input.move(p.phys.x, p.phys.y); break;
      case "drag": { const q = shotToScreen(a.to_x, a.to_y); await input.drag(p.phys.x, p.phys.y, q.phys.x, q.phys.y); break; }
      case "scroll": await input.scroll(p.phys.x, p.phys.y, a.amount || -3); break;
      case "type": await input.type(a.text || ""); break;
      case "key": await input.key(a.keys || ""); break;
      case "wait": break;
      default: return `Unknown action ${a.action}`;
    }
  } finally { setTimeout(() => (injecting = false), 150); }
  await new Promise((r) => setTimeout(r, a.action === "wait" ? Math.min(a.amount || 1, 10) * 1000 : 700));
  const shot = await captureScreen();
  return [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.data } },
    { type: "text", text: `Done: ${a.action}. New screenshot of the ${shot.label}. Check it worked before the next step.` },
  ];
}

// ---------------------------------------------------------------- shell helpers
function runShell(command, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const child = IS_WIN
      ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true })
      : spawn("bash", ["-lc", command]);
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); err += "\n[timed out]"; }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = (out + (err ? `\n[stderr]\n${err}` : "")).trim() || `(no output, exit code ${code})`;
      resolve(text.length > 12000 ? text.slice(0, 12000) + "\n…[truncated]" : text);
    });
    child.on("error", (e) => { clearTimeout(timer); resolve(`Failed to start: ${e.message}`); });
  });
}

const MEDIA_VK = { play_pause: 0xB3, next: 0xB0, previous: 0xB1, mute: 0xAD, volume_up: 0xAF, volume_down: 0xAE };
function pressMediaKey(action, times = 1) {
  if (!IS_WIN) return Promise.resolve("Media keys are only supported on Windows.");
  const vk = MEDIA_VK[action];
  const ps = `Add-Type -Namespace J -Name K -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, System.UIntPtr e);';` +
    `1..${times} | % { [J.K]::keybd_event(${vk},0,0,[UIntPtr]::Zero); [J.K]::keybd_event(${vk},0,2,[UIntPtr]::Zero); Start-Sleep -Milliseconds 30 }`;
  return runShell(ps, 10000).then(() => "Done.");
}

// ---------------------------------------------------------------- approvals
const pendingApprovals = new Map();
function askApproval(command, reason, kind = "command") {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    pendingApprovals.set(id, resolve);
    send("agent", { type: "approval", id, command, reason, kind });
    islandWin?.showInactive();
  });
}
ipcMain.on("approval:respond", (_e, { id, approved }) => {
  if (!pendingApprovals.has(id)) return;
  pendingApprovals.get(id)(approved);
  pendingApprovals.delete(id);
  send("approval:resolved", { id, approved });
  if (panelView === "approval") closePanel();
});

// ---------------------------------------------------------------- tools
const s = (props, required = Object.keys(props)) => ({ type: "object", properties: props, required, additionalProperties: false });
const TOOLS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
  { name: "look_at_screen", strict: true,
    description: "Take a screenshot of the user's current screen and look at it. Use whenever the user refers to what they are looking at (this, here, this error, this page, my screen) or when seeing the screen would help.",
    input_schema: s({}) },
  { name: "point_at",
    description: "Show the user where something is: moves Jarvis's own glowing cursor (not the real mouse) to a spot with a short label. x, y are pixel coordinates in the most recent screenshot. Use this to show things without touching anything.",
    input_schema: { type: "object", properties: { x: { type: "integer" }, y: { type: "integer" }, label: { type: "string", description: "Short caption, e.g. 'Settings is here'" } }, required: ["x", "y", "label"], additionalProperties: false } },
  { name: "computer",
    description: "Use the real mouse and keyboard to do something on screen for the user (only when they asked you to do or edit something). x, y (and to_x, to_y for drag) are pixel coordinates in the most recent screenshot. Each call returns a fresh screenshot so you can check the result. The user is asked once per task to allow control and can press Esc to stop.",
    input_schema: { type: "object", properties: {
      action: { type: "string", enum: ["click", "double_click", "right_click", "move", "drag", "scroll", "type", "key", "wait"] },
      x: { type: "integer" }, y: { type: "integer" }, to_x: { type: "integer" }, to_y: { type: "integer" },
      text: { type: "string", description: "For type" },
      keys: { type: "string", description: "For key, e.g. 'enter', 'ctrl+s', 'alt+tab', 'win+d'" },
      amount: { type: "integer", description: "For scroll: notches, negative = down. For wait: seconds" },
      label: { type: "string", description: "Optional caption shown next to Jarvis's cursor" },
    }, required: ["action"], additionalProperties: false } },
  { name: "run_powershell", strict: true,
    description: "Run a PowerShell command on the user's Windows PC and get its output. Use it to do things for the user: find or organise files, launch apps, check system state, change settings, automate tasks. The user may be asked to approve it first. Prefer safe, read-only commands. Never delete or overwrite data unless the user explicitly asked for exactly that.",
    input_schema: s({ command: { type: "string" }, reason: { type: "string", description: "One short sentence telling the user what this does" } }) },
  { name: "open", strict: true,
    description: "Open a URL in the browser, a file or folder in its default app, or launch an application by name (e.g. 'spotify', 'notepad', 'C:\\Users\\me\\Downloads').",
    input_schema: s({ target: { type: "string" } }) },
  { name: "clipboard", strict: true,
    description: "Read the clipboard text, or write text to it (for example a drafted email or a command for the user to paste).",
    input_schema: s({ action: { type: "string", enum: ["read", "write"] }, text: { type: "string", description: "Text to write; empty for read" } }) },
  { name: "media_control", strict: true,
    description: "Control music/video playback and system volume.",
    input_schema: s({ action: { type: "string", enum: Object.keys(MEDIA_VK) }, times: { type: "integer", description: "Repeat count, e.g. 5 volume steps; use 1 otherwise" } }) },
  { name: "system_status", strict: true,
    description: "Battery, CPU load, memory, uptime and disk space of this computer.",
    input_schema: s({}) },
  { name: "get_weather", strict: true,
    description: "Current weather and today's forecast for a city.",
    input_schema: s({ city: { type: "string" } }) },
  { name: "set_timer", strict: true,
    description: "Start a countdown; Jarvis says out loud when it's done and shows a notification. Also use for reminders ('remind me at 3pm' → compute seconds from the current time).",
    input_schema: s({ seconds: { type: "integer" }, label: { type: "string" } }) },
  { name: "remember", strict: true,
    description: "Save a lasting fact or preference about the user for future conversations.",
    input_schema: s({ note: { type: "string" } }) },
  { name: "forget", strict: true,
    description: "Delete saved notes containing the given text.",
    input_schema: s({ match: { type: "string" } }) },
];
const UI_TOOLS = new Set(["set_timer"]);

const WMO = { 0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail" };
async function getWeather(city) {
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`).then((r) => r.json());
  const p = geo.results?.[0];
  if (!p) return `No location found for "${city}".`;
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`).then((r) => r.json());
  return JSON.stringify({
    place: `${p.name}, ${p.country}`,
    now: `${w.current.temperature_2m}°C (feels ${w.current.apparent_temperature}°C), ${WMO[w.current.weather_code] ?? "?"}`,
    wind_kmh: w.current.wind_speed_10m,
    today: `high ${w.daily.temperature_2m_max[0]}°C, low ${w.daily.temperature_2m_min[0]}°C, rain ${w.daily.precipitation_probability_max[0]}%`,
  });
}

async function systemStatus() {
  const gb = (b) => (b / 1024 ** 3).toFixed(1) + " GB";
  const info = {
    os: `${os.type()} ${os.release()}`,
    cpu: `${os.cpus()[0]?.model} × ${os.cpus().length}`,
    memory: `${gb(os.totalmem() - os.freemem())} used of ${gb(os.totalmem())}`,
    uptime_hours: (os.uptime() / 3600).toFixed(1),
  };
  if (IS_WIN) {
    info.battery = await runShell("$b = Get-CimInstance Win32_Battery; if ($b) { \"$($b.EstimatedChargeRemaining)% (status $($b.BatteryStatus))\" } else { 'no battery' }", 15000);
    info.disks = await runShell("Get-PSDrive -PSProvider FileSystem | % { '{0}: {1:N0} GB free of {2:N0} GB' -f $_.Name, ($_.Free/1GB), (($_.Used+$_.Free)/1GB) }", 15000);
    info.cpu_load = await runShell("(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average", 15000) + "%";
  } else info.load = os.loadavg().map((x) => x.toFixed(2)).join(" ");
  return JSON.stringify(info, null, 1);
}

async function runTool(name, input) {
  switch (name) {
    case "look_at_screen": {
      const shot = await captureScreen();
      return [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.data } },
        { type: "text", text: `Screenshot of the user's ${shot.label}, taken just now.` },
      ];
    }
    case "point_at":
      await showCursor(input.x, input.y, input.label, { holdMs: 6000 });
      return "Pointed it out to the user.";
    case "computer":
      return computerAction(input);
    case "run_powershell": {
      if (settings.confirmCommands && !(await askApproval(input.command, input.reason)))
        return "The user declined to run this command.";
      send("agent", { type: "tool", name, status: "running", detail: input.reason });
      return runShell(input.command);
    }
    case "open": {
      const t = input.target.trim();
      if (/^(https?|mailto):/i.test(t)) { await shell.openExternal(t); return "Opened."; }
      if (/[\\/]/.test(t) || /^[a-z]:/i.test(t)) {
        const err = await shell.openPath(t.replace(/^~/, os.homedir()));
        return err ? `Could not open: ${err}` : "Opened.";
      }
      if (!IS_WIN) return "Launching apps by name is only supported on Windows.";
      const out = await runShell(`Start-Process '${t.replace(/'/g, "''")}' -ErrorAction Stop`, 15000);
      return /error|cannot|not recognized/i.test(out) && !/no output/.test(out)
        ? `Could not launch "${t}". ${out.slice(0, 300)} Try run_powershell to locate it.` : `Launched ${t}.`;
    }
    case "clipboard":
      if (input.action === "write") { clipboard.writeText(input.text); return "Copied to clipboard."; }
      return clipboard.readText() || "(clipboard is empty or not text)";
    case "media_control": return pressMediaKey(input.action, Math.min(Math.max(input.times || 1, 1), 25));
    case "system_status": return systemStatus();
    case "get_weather": return getWeather(input.city);
    case "remember": {
      const m = await loadMemory();
      m.notes.push({ note: input.note, at: new Date().toISOString() });
      await saveMemory(m); send("memory", m); return "Saved.";
    }
    case "forget": {
      const m = await loadMemory(); const n = m.notes.length;
      m.notes = m.notes.filter((x) => !x.note.toLowerCase().includes(input.match.toLowerCase()));
      await saveMemory(m); send("memory", m); return `Removed ${n - m.notes.length} note(s).`;
    }
    default:
      if (UI_TOOLS.has(name)) { send("agent", { type: "action", name, input }); return "Shown to the user."; }
      return `Unknown tool ${name}`;
  }
}

// ---------------------------------------------------------------- agent
const systemPrompt = () => `You are Jarvis, a personal AI assistant living in a small black island at the top of the user's computer screen. You have a calm, dry, understated British wit, and you are genuinely useful. Address the user as "${settings.name}".

The user asks by voice or text, and your reply is shown as text in a small card that drops down from the island. So:
- Lead with the answer in one or two short sentences. Then, only if it helps, up to 6 short lines starting with "- ".
- Plain text: no headings, tables, bold or code blocks. Keep the whole reply under about 90 words unless the user asks for more.
- When something is long (code, a full article, research with many sources), give the gist and offer to copy the details to the clipboard or open the page.

You can act on this computer:
- look_at_screen when the user refers to what they're looking at, or when seeing it would help. Describe only what matters.
- run_powershell to do things: find files, launch or close apps, check settings, automate tasks. Explain in "reason" what it does. Prefer read-only commands. Never delete, overwrite or send anything unless the user clearly asked for exactly that.
- open for URLs, files, folders and apps; clipboard to read or hand over text; media_control for music and volume; set_timer for timers and reminders; remember for lasting preferences.
- point_at to show the user where something is on screen (your own cursor with a label; touches nothing). Use it whenever they ask "where is…" or "show me…".
- computer to use the real mouse and keyboard, only when the user asks you to do or edit something on screen. Take a screenshot first, act in small steps, and check each new screenshot. Prefer keyboard shortcuts where reliable.
- Email and other websites: open them in the browser (for example https://mail.google.com or https://outlook.live.com), then read them with screenshots and scroll as needed. Never send, delete, buy, or post anything without the user's explicit confirmation of that exact action.
- web search and web fetch for research and anything current. For research, search several angles, then summarise in a card with sources.

Do the task rather than describing how the user could do it. Never claim to have done something you didn't do with a tool. If a request is ambiguous and acting wrongly would cost something, ask one short question.`;

let client = null, clientKey = "";
function getClient() {
  if (!apiKey) throw Object.assign(new Error("NO_KEY"), { code: "NO_KEY" });
  if (!client || clientKey !== apiKey) { client = new Anthropic({ apiKey }); clientKey = apiKey; }
  return client;
}

let messages = [];
let abort = null;

// ---- Claude account backend (Claude Code CLI + local MCP server for Jarvis's tools)
let mcp = null, cc = null;
async function claudeSession() {
  mcp ||= await startMcpServer({ tools: TOOLS, runTool });
  cc ||= new ClaudeCodeSession({ send, mcpUrl: mcp.url, systemPrompt: systemPrompt(), model: settings.model, effort: settings.effort, userDir: USER_DIR() });
  return cc;
}
function resetClaudeSession() { cc?.kill(); cc = null; }

async function chatViaClaudeCode(content) {
  try {
    await (await claudeSession()).ask(content);
  } catch (err) {
    const msg = {
      NO_CLAUDE: "To use your Claude account I need Claude Code. Open settings and press “Connect Claude account”.",
      NO_LOGIN: "Claude Code isn't signed in. Open settings and press “Connect Claude account”.",
      LIMIT: "You've hit your Claude plan's usage limit for now. " + err.message,
    }[err.code];
    send("agent", { type: "error", code: err.code === "NO_CLAUDE" || err.code === "NO_LOGIN" ? "SETUP" : undefined, message: msg || "Claude Code ran into a problem.", detail: err.message });
  } finally {
    controlEnded();
    send("agent", { type: "end" });
  }
}

function stopAll() { abort?.abort(); cc?.interrupt(); }

async function chat({ text, withScreen }) {
  const mem = await loadMemory();
  const context = `Context (not to be read aloud): local time ${new Date().toString()}; OS ${os.type()} ${os.release()}; user home ${os.homedir()}.\nThings you remember about the user:\n${mem.notes.map((n) => "- " + n.note).join("\n") || "(none yet)"}`;
  const content = [{ type: "text", text: context }];
  if (withScreen) {
    try {
      const shot = await captureScreen();
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.data } });
      content.push({ type: "text", text: "(Attached: a screenshot of the user's screen right now.)" });
    } catch (e) { content.push({ type: "text", text: `(Screen capture failed: ${e.message})` }); }
  }
  content.push({ type: "text", text });
  if (settings.backend === "claude") return chatViaClaudeCode(content);
  messages.push({ role: "user", content });

  abort = new AbortController();
  try {
    const anthropic = getClient();
    for (let step = 0; step < 12; step++) {
      const stream = anthropic.beta.messages.stream({
        model: settings.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: settings.effort },
        system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      }, { signal: abort.signal });

      stream.on("text", (t) => send("agent", { type: "text", text: t }));
      stream.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start" && (ev.content_block.type === "tool_use" || ev.content_block.type === "server_tool_use"))
          send("agent", { type: "tool", name: ev.content_block.name, status: "running" });
      });

      const msg = await stream.finalMessage();
      messages.push({ role: "assistant", content: msg.content });
      if (msg.stop_reason === "refusal") { send("agent", { type: "text", text: "I'm afraid I can't help with that one." }); break; }
      if (msg.stop_reason === "pause_turn") continue;
      if (msg.stop_reason !== "tool_use") break;

      const calls = msg.content.filter((b) => b.type === "tool_use");
      const results = [];
      for (const c of calls) { // sequential: approvals and UI actions stay in order
        try {
          const out = await runTool(c.name, c.input ?? {});
          send("agent", { type: "tool", name: c.name, status: "done" });
          results.push({ type: "tool_result", tool_use_id: c.id, content: out });
        } catch (e) {
          send("agent", { type: "tool", name: c.name, status: "error" });
          results.push({ type: "tool_result", tool_use_id: c.id, content: `Error: ${e.message}`, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    while (messages.length && messages.at(-1).role === "user") messages.pop(); // keep history valid
    if (err.code === "NO_KEY") return send("agent", { type: "error", code: "SETUP", message: "I need an Anthropic API key first, or switch to your Claude account in settings." });
    if (err.name === "AbortError" || err instanceof Anthropic.APIUserAbortError) return send("agent", { type: "error", message: "Stopped." });
    let message = "Something went wrong reaching my core.";
    if (err instanceof Anthropic.AuthenticationError) message = "That API key was rejected. Check it in settings.";
    else if (err instanceof Anthropic.RateLimitError) message = "I'm being rate limited. Give me a moment.";
    else if (err instanceof Anthropic.APIConnectionError) message = "I can't reach the internet.";
    send("agent", { type: "error", message, detail: String(err.message || err) });
  } finally {
    abort = null;
    controlEnded();
    send("agent", { type: "end" });
  }
}

// ---------------------------------------------------------------- speech models (separate process)
let ml = null, mlSeq = 0;
const mlCalls = new Map();
function mlProc() {
  if (ml) return ml;
  ml = utilityProcess.fork(path.join(here, "ml-worker.js"), [], { serviceName: "Jarvis speech" });
  ml.on("message", (m) => {
    if (m.type === "progress") return send("stt:progress", { pct: m.pct });
    if (m.type === "ready") return send("stt:progress", { pct: 100, ready: true });
    const c = mlCalls.get(m.id); if (!c) return;
    mlCalls.delete(m.id);
    m.ok ? c.resolve(m.result) : c.reject(new Error(m.error));
  });
  ml.on("exit", () => { ml = null; for (const c of mlCalls.values()) c.reject(new Error("Speech engine stopped")); mlCalls.clear(); });
  ml.postMessage({ id: 0, type: "init", dir: path.join(USER_DIR(), "models") });
  return ml;
}
function mlCall(type, args = {}) {
  return new Promise((resolve, reject) => {
    const id = ++mlSeq;
    mlCalls.set(id, { resolve, reject });
    mlProc().postMessage({ id, type, ...args });
  });
}
ipcMain.handle("stt:transcribe", (_e, audio) => mlCall("transcribe", { audio, speechModel: settings.speechModel, language: settings.language }));
ipcMain.handle("tts:speak", (_e, text) => mlCall("speak", { text, voice: settings.voiceName }));
ipcMain.handle("stt:warmup", () => mlCall("warmup", { speechModel: settings.speechModel, tts: false }).then(() => true).catch((e) => { send("stt:progress", { error: e.message }); return false; }));

// ---------------------------------------------------------------- ipc
ipcMain.handle("chat:send", (_e, payload) => chat(payload));
ipcMain.on("chat:stop", () => stopAll());
ipcMain.on("chat:reset", () => { messages = []; resetClaudeSession(); });
ipcMain.handle("settings:get", () => publicSettings());
ipcMain.handle("claude:signin", async () => { openSignInTerminal(await findClaude()); resetClaudeSession(); return true; });
ipcMain.handle("claude:status", async () => {
  const bin = await findClaude();
  return { installed: !!bin, loggedIn: bin ? await claudeAuthStatus(bin) : false };
});
ipcMain.on("panel:open", (_e, v) => openPanel(v));
ipcMain.handle("settings:set", async (_e, patch) => {
  if (typeof patch.apiKey === "string" && patch.apiKey.trim()) apiKey = patch.apiKey.trim();
  if (typeof patch.openAtLogin === "boolean") app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
  for (const k of Object.keys(DEFAULTS)) if (k in patch) settings[k] = patch[k];
  await saveSettings();
  resetClaudeSession(); // pick up model / name changes
  const hotkeys = registerHotkeys();
  return { ...(await publicSettings()), hotkeys };
});
ipcMain.handle("memory:get", () => loadMemory());
ipcMain.handle("memory:delete", async (_e, i) => { const m = await loadMemory(); m.notes.splice(i, 1); await saveMemory(m); return m; });
ipcMain.on("notify", (_e, { title, body }) => { if (Notification.isSupported()) new Notification({ title, body, silent: false }).show(); });
ipcMain.on("app:quit", () => app.quit());

// ---------------------------------------------------------------- lifecycle
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => send("island:talk"));
  app.whenReady().then(async () => {
    if (IS_WIN) app.setAppUserModelId("com.jarvis.desktop");
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(["media", "notifications"].includes(perm)));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => ["media", "notifications"].includes(perm));
    await loadSettings();
    createWindows();
    createTray();
    registerHotkeys();
    if ((settings.setupDone || 0) < SETUP_VERSION) {
      setTimeout(() => openPanel("setup"), 900);      // first launch of this version: walk through setup
    } else {
      mlCall("warmup", { speechModel: settings.speechModel, tts: false }).catch(() => {}); // hearing ready before the first click
      if (settings.backend === "claude") claudeSession().then((s) => s.proc || s.start()).catch(() => {});
    }
    startMediaWatch();
    screen.on("display-metrics-changed", () => { if (dock === "top") islandWin?.setBounds(dockBounds()); });
  });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); cc?.kill(); mcp?.close(); input.stop(); ml?.kill(); mediaProc?.kill(); });
  app.on("window-all-closed", () => app.quit());
}
