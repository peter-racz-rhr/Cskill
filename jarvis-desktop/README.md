# Jarvis for Windows

A small "Dynamic Island" at the top of your screen, powered by Claude. Talk to it, show it your screen, and let it do things on your PC.

- **Idle:** a small black pill with the clock, or your running timer.
- **Working:** the pill widens to show what it's doing: listening, searching the web, looking at your screen…
- **Reply:** a short bubble drops down while it speaks. Click it to open the full panel.
- **Panel:** click the pill or press `Alt+Shift+J` to open the conversation, cards, approvals, memory and settings.

## Install

1. Download **Jarvis-Setup-x.y.z.exe** (installer) or **Jarvis-x.y.z-portable.exe** (no install) from this repo's
   **Actions → Build Jarvis for Windows → latest run → Artifacts → Jarvis-Windows**.
2. Run it. Windows SmartScreen will warn that the app is unsigned. Click **More info → Run anyway**.
3. Click the pill, paste your Anthropic API key (from console.anthropic.com), and save.
4. The first time you talk, it downloads the speech model once (about 290 MB). After that, speech recognition runs on your PC.

## Using it

| | |
|---|---|
| `Alt+J` | Talk. It listens until you pause, then answers. Press again to stop |
| `Alt+Shift+J` | Open or close the panel |
| Click the pill | Open the panel |
| 👁 button | Attach your screen to the next message |
| `Esc` | Stop listening, stop talking, or close |
| Tray icon | Open, settings, start with Windows, quit |

Hotkeys, model, voice and speech language can be changed in **Settings**.

## What it can do

| Ask | Tool |
|---|---|
| "What's this error on my screen?" / "Summarise this page" | **Sees your screen** (screenshot of the display under your mouse) |
| "Research the best budget monitors and compare them" | **Web search and page reading**, with a summary card and sources |
| "Find the biggest files in Downloads", "Open Spotify", "Turn on dark mode", "Close Chrome" | **Runs PowerShell.** You approve every command first (can be turned off) |
| "Open my Documents folder", "Open youtube.com" | **Opens** files, folders, apps and URLs |
| "Copy that as an email draft", "What's on my clipboard?" | **Clipboard** read and write |
| "Pause the music", "Next song", "Volume down a bit" | **Media keys and volume** |
| "How's my battery and disk space?" | **System status** |
| "Weather in Budapest" | **Weather** (no extra key needed) |
| "25 minute focus timer", "Remind me at 3pm to call Anna" | **Timers and reminders** in the pill, spoken alert and Windows notification |
| "Remember I prefer short answers" | **Memory**, kept across restarts. You can view and delete it in the panel |

## Privacy and safety

- Your API key is encrypted with Windows' own encryption (DPAPI via Electron `safeStorage`).
- Speech is transcribed on your machine with Whisper. Audio never leaves your PC; only the text is sent to Claude.
- Screenshots are taken only when you press 👁 or when Jarvis decides to look. They are sent to Claude for that request.
- PowerShell commands need your approval unless you turn that off in Settings.
- The island hides itself from screen capture, so it never appears in its own screenshots.

## Develop

```bash
cd jarvis-desktop
npm install
npm start          # run from source (Windows, macOS or Linux)
npm run dist       # build the Windows .exe (run on Windows)
```

Files:

- `src/main.js`: window, hotkeys, tray, the Claude tool loop, all tools, and local Whisper.
- `src/preload.cjs`: the bridge between the window and the main process.
- `src/renderer/`: the island UI (HTML/CSS/JS, no framework).

To add a tool: add it to `TOOLS` and `runTool()` in `main.js`, plus an icon and label in `island.js`.
