# Jarvis

A black island at the top of your Windows screen, powered by your own Claude account. Click it (or press **Alt+J**) and ask anything by voice. You can also press **T** to type. Answers drop down as clean cards. It shows what Claude is doing while it works, plays nicely with your music, and can do things on your PC when you allow it.

## The island

- **Idle:** a small black pill. **Hover** and it grows; **click** and it listens (red light, bars follow your voice).
- **Answers** drop down as cards. Click anywhere outside to shrink it back.
- **Claude working:** a spinner with the current step and a timer. Click it for the step list. **Needs your OK** opens a card with the exact command and **Run it / Don't**. **Ready** shows a green tick, then the answer.
- **Your Claude Code sessions:** when Claude Code works on a project (in the Claude app, the terminal or VS Code), the island shows it live: project name, each step (Reading…, Editing…, Running the tests), amber when it needs your permission, and a notification with its final message when it's done. Jarvis adds small hooks to `~/.claude/settings.json` for this (backup kept as `settings.json.jarvis-backup`); turn it off in Settings and they're removed.
- **Music:** whatever plays on Windows (Spotify, YouTube in the browser…) shows as a mini player: the real album cover, progress, equaliser. Click it for the player with ⏮ ⏯ ⏭ (real media keys).
- **Timers:** an orange ring that drains. With music playing, the timer sits in its own little bubble.
- **Shelf:** drag files onto the island; click one later to open it.
- **Notifications:** Claude finishing, timers and approvals drop in from the island; the unread count stays as a red badge. Click the island to see them all.
- **Flick it up** to hide it (only a faint line stays in the top edge; rest the mouse there, press Alt+J, or use the tray to bring it back). It still pops out for things that need you.
- **Pull it down hard** to tear it off into a floating widget; drag it back to the top edge to dock. Right-click for Settings, Memory, Float/Dock and Quit.

Quick things run instantly on your PC without using Claude: weather (with the next hours), timers, maths, currency, notes, translation, play/pause/next, volume. Everything else goes to Claude.

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

## Troubleshooting

Jarvis keeps a small diagnostics log at `%APPDATA%\Jarvis\jarvis.log` (cover art and Claude Code hook status, no personal content).
