# Jarvis for Windows

A small "Dynamic Island" at the top of your screen, powered by Claude. Talk to it, show it your screen, and let it do things on your PC.

- **Hidden:** only a thin notch shows at the top of your screen.
- **Hover:** the pill drips down out of the notch. Click it and start talking.
- **Working:** it shows what it's doing: listening, searching, looking at your screen, using your PC.
- **Answer:** it speaks, and the answer (plus any details or approvals) drops down below the pill, then folds away.
- **Right-click** the pill for Settings, Memory, Stop and Quit.

## Install

1. Download **Jarvis-Setup-x.y.z.exe** (installer) or **Jarvis-x.y.z-portable.exe** (no install) from this repo's
   **Actions → Build Jarvis for Windows → latest run → Artifacts → Jarvis-Windows**.
2. Run it. Windows SmartScreen will warn that the app is unsigned. Click **More info → Run anyway**.
3. Setup opens by itself: **Sign in** (a window installs Claude Code if needed and your browser asks you to log in to your Claude account; Jarvis notices when you're done), then **microphone**, **screen and control**, and the one-time **voice model download** (about 290 MB).

### How the "no API key" mode works

Jarvis runs your own Claude Code in the background, signed in with your Claude account. It isn't billed per message; it counts toward your plan's normal usage limits, the same as using Claude Code yourself. Jarvis gives Claude Code its own tools (screen, PowerShell with approval, clipboard, media, timers, memory) through a small local MCP server that only listens on your PC. Claude Code's built-in tools are limited to web search and page reading, so everything that touches your PC goes through Jarvis's approval prompt.

If you prefer an API key instead, choose **Brain → Anthropic API key** in Settings.

## Using it

| | |
|---|---|
| Hover the top of the screen, click the pill | Talk. It listens until you pause, then answers |
| `Alt+J` | Talk from anywhere |
| Click while it's working or talking | Stop |
| `Esc` | Stop listening, stop talking, or stop controlling your PC |
| Right-click the pill / tray icon | Settings, Memory, Run setup again, Quit |

Hotkeys, model, voice and speech language can be changed in **Settings**.

## What it can do

| Ask | Tool |
|---|---|
| "What's this error on my screen?" / "Summarise this page" | **Sees your screen** (screenshot of the display under your mouse) |
| "Show me where the Wi-Fi settings are" | **Points** with its own glowing cursor and a label. Touches nothing |
| "Rename these files", "Fill in this form", "Fix the typo in this paragraph" | **Uses your mouse and keyboard.** Asks once per task, and `Esc` stops it instantly |
| "Go through my unread emails" | Opens your mail in the browser and **reads it from the screen**. Never sends or deletes without asking |
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

- Default mode uses your Claude account through Claude Code. No key is stored by Jarvis. In API-key mode, the key is encrypted with Windows' own encryption (DPAPI via Electron `safeStorage`).
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

- `src/main.js`: window, hotkeys, tray, all tools, local Whisper, and the API-key backend.
- `src/claude-code.js`: the Claude-account backend (runs the Claude Code CLI) and the local MCP server.
- `src/preload.cjs`: the bridge between the window and the main process.
- `src/renderer/`: the island UI (HTML/CSS/JS, no framework).

To add a tool: add it to `TOOLS` and `runTool()` in `main.js`, plus an icon and label in `island.js`.
