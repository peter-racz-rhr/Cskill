// Safe bridge between Jarvis's windows (blob, brain, panel, cursor) and the main process.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("jarvis", {
  // conversation (brain)
  send: (text, withScreen) => ipcRenderer.invoke("chat:send", { text, withScreen }),
  stop: () => ipcRenderer.send("chat:stop"),
  reset: () => ipcRenderer.send("chat:reset"),
  transcribe: (samples) => ipcRenderer.invoke("stt:transcribe", samples),
  tts: (text) => ipcRenderer.invoke("tts:speak", text),
  warmup: () => ipcRenderer.invoke("stt:warmup"),
  state: (st) => ipcRenderer.send("brain:state", st),
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
  onAgent: on("agent"),
  onTalk: on("brain:talk"),

  // blob windows
  hover: (on) => ipcRenderer.send("blob:hover", on),
  click: () => ipcRenderer.send("blob:click"),
  menu: () => ipcRenderer.send("blob:menu"),
  tear: () => ipcRenderer.send("blob:tear"),
  dragStart: () => ipcRenderer.send("blob:dragStart"),
  dragEnd: () => ipcRenderer.send("blob:dragEnd"),
  dockMode: () => ipcRenderer.invoke("blob:dockMode"),
  onBlobState: on("blob:state"),
  onDock: on("blob:dock"),

  // panel: setup, settings, memory, approvals
  openPanel: (view) => ipcRenderer.send("panel:open", view),
  closePanel: () => ipcRenderer.send("panel:close"),
  resizePanel: (h) => ipcRenderer.send("panel:resize", h),
  setupDone: () => ipcRenderer.send("setup:done"),
  onPanel: on("panel:open"),
  approve: (id, approved) => ipcRenderer.send("approval:respond", { id, approved }),
  onApprovalResolved: on("approval:resolved"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getMemory: () => ipcRenderer.invoke("memory:get"),
  deleteMemory: (i) => ipcRenderer.invoke("memory:delete", i),
  onMemory: on("memory"),
  claudeSignIn: () => ipcRenderer.invoke("claude:signin"),
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  onSttProgress: on("stt:progress"),
  onSetupDone: on("setup:done"),
  quit: () => ipcRenderer.send("app:quit"),

  // cursor overlay
  onCursor: on("cursor"),
});
