# Jarvis

A voice assistant for Windows that lives at the top of your screen as a small liquid ball. Click it and talk. It answers out loud, keeps listening so you can just keep talking, and can look at your screen and do things for you. It runs on your own Claude account, so there's no API key.

## The ball

- **Docked:** a blue drop hanging from the top edge of your screen. Hover over it and it droops a little.
- **Click it** and talk. When you stop, Jarvis answers out loud, then listens again. Stay quiet for a few seconds and the conversation ends.
- **Pull it down:** it stretches on a liquid neck and **snaps off** into a floating ball you can put anywhere. Drag it back into the top edge to merge it in again.
- **What the ball shows:**
  - it reacts to your voice while listening (cyan ring)
  - a purple swirl while thinking
  - it pulses with Jarvis's voice while speaking
  - violet while it's using your mouse and keyboard
  - amber while it's waiting for your OK
- **Right-click** it for Settings, Memory, Float/Dock and Quit.

There are no text panels and no buttons, apart from setup, settings, and the permission card when Jarvis wants to act on your PC.

## Install

1. Download **Jarvis-Setup-x.y.z.exe** from the latest release, or from this repo's **Actions → Build Jarvis for Windows → Artifacts**.
2. Run it. Windows will warn that the app is unsigned: click **More info → Run anyway**.
3. Setup walks you through four steps:
   - **Sign in to your Claude account.** Claude Code is installed if needed, and Jarvis notices when you're done.
   - **Microphone test.**
   - **Screen and control permission.**
   - **Voice download.** About 400 MB, one time; it runs in the background.

## What you can ask

| Say | What happens |
|---|---|
| "What's on my screen?" / "What does this error mean?" | Looks at your screen and explains |
| "Show me where the Wi-Fi settings are" | Points with its own glowing cursor. Touches nothing |
| "Fill in this form" / "Fix the typo in this paragraph" | Uses your mouse and keyboard. Asks first; **Esc** stops it |
| "Go through my unread emails" | Opens your mail in the browser and reads it to you. Never sends or deletes without asking |
| "Research the best budget monitors" | Searches the web and gives you the gist; offers to copy the details |
| "Find the biggest files in my Downloads" / "Open Spotify" | Runs PowerShell or opens things. Commands need your OK, by voice ("yes") or button |
| "Pause the music" / "Next song" / "Volume down" | Media keys |
| "25 minute focus timer" / "Remind me at 3pm to call Anna" | Speaks up and shows a notification when it's time |
| "Remember I prefer short answers" | Remembers across restarts (right-click → Memory to view or delete) |

The talk hotkey is **Alt+J** by default. You can change it in Settings.

## Privacy

- **Hearing and voice run on your PC.** Speech recognition uses Whisper and the voice uses Kokoro, so audio never leaves your computer. Only the text of what you say is sent to Claude.
- **Screenshots** are taken only when Jarvis needs to look, and are sent to Claude for that request.
- **Commands and mouse/keyboard control** always ask first. **Esc** stops control instantly.
- **Your Claude account:** Jarvis uses Claude Code signed in with your account, and it counts toward your plan's usage like normal Claude use.

## How it's built

| File | What it does |
|---|---|
| `src/main.js` | Windows, tray, hotkey, the Claude connection and every tool that touches the PC |
| `src/claude-code.js` | Runs Claude Code with your account, and gives it Jarvis's tools via a local MCP server |
| `src/ml-worker.js` | Whisper and Kokoro in their own process, so the UI never stutters |
| `src/input-driver.js` | Mouse and keyboard control (Windows) |
| `src/renderer/blob.*` | The liquid ball: metaball geometry and spring physics |
| `src/renderer/brain.*` | Hidden window: microphone, voice-activity detection, playback, conversation, voice approvals |
| `src/renderer/panel.*` | Setup, settings, memory and the approval card |
| `src/renderer/cursor.*` | Jarvis's own on-screen cursor |

```bash
cd jarvis-desktop
npm install
npm start        # run from source
npm run dist     # build the installer (on Windows)
```
