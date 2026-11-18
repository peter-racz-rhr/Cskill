// Safe bridge between the island UI and the main process.
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld("jarvis", {
  send: (text, withScreen) => ipcRenderer.invoke("chat:send", { text, withScreen }),
  stop: () => ipcRenderer.send("chat:stop"),
  reset: () => ipcRenderer.send("chat:reset"),
  transcribe: (samples) => ipcRenderer.invoke("stt:transcribe", samples),
  warmup: () => ipcRenderer.invoke("stt:warmup"),
  tts: (text) => ipcRenderer.invoke("tts:speak", text),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getMemory: () => ipcRenderer.invoke("memory:get"),
  deleteMemory: (i) => ipcRenderer.invoke("memory:delete", i),
  approve: (id, approved) => ipcRenderer.send("approval:respond", { id, approved }),
  interactive: (on) => ipcRenderer.send("ui:interactive", on),
  focus: () => ipcRenderer.send("ui:focus"),
  release: () => ipcRenderer.send("ui:release"),
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
  quit: () => ipcRenderer.send("app:quit"),
  claudeSignIn: () => ipcRenderer.invoke("claude:signin"),
  claudeStatus: () => ipcRenderer.invoke("claude:status"),
  menu: () => ipcRenderer.send("ui:menu"),
  tear: (x, y) => ipcRenderer.send("ui:tear", { x, y }),
  dockTop: () => ipcRenderer.send("ui:dockTop"),
  dragStart: (offX, offY) => ipcRenderer.send("ui:dragStart", { offX, offY }),
  dragMove: (x, y) => ipcRenderer.send("ui:dragMove", { x, y }),
  dragEnd: () => ipcRenderer.send("ui:dragEnd"),
  dockMode: () => ipcRenderer.invoke("ui:dockMode"),
  weather: () => ipcRenderer.invoke("weather:get"),
  media: (action) => ipcRenderer.send("media:key", action),
  onDock: on("ui:dock"),
  onCursor: on("cursor"),
  onView: on("ui:view"),
  onAgent: on("agent"),
  onMemory: on("memory"),
  onHotkeyTalk: on("hotkey:talk"),
  onHotkeyPanel: on("hotkey:panel"),
  onSettingsOpen: on("ui:settings"),
  onBlur: on("ui:blurred"),
  onSttProgress: on("stt:progress"),
});
