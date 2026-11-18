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
3. Click the pill → **Connect Claude account**. A PowerShell window opens that installs Claude Code (if needed) and asks you to log in with your Claude account (Pro or Max). Log in, close the window, then press **Save**.
4. The first time you talk, it downloads the speech model once (about 290 MB). After that, speech recognition runs on your PC.

### How the "no API key" mode works

Jarvis runs your own Claude Code in the background, signed in with your Claude account. It isn't billed per message; it counts toward your plan's normal usage limits, the same as using Claude Code yourself. Jarvis gives Claude Code its own tools (screen, PowerShell with approval, clipboard, media, timers, memory) through a small local MCP server that only listens on your PC. Claude Code's built-in tools are limited to web search and page reading, so everything that touches your PC goes through Jarvis's approval prompt.

If you prefer an API key instead, choose **Brain → Anthropic API key** in Settings.

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
