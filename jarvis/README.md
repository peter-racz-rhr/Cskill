# J.A.R.V.I.S.

A voice-driven personal assistant powered by Claude. It has a clean, minimal chat interface (light and dark), a British voice, and tools it actually uses.

## Run it (2 minutes)

```bash
cd jarvis
npm install
export ANTHROPIC_API_KEY=sk-ant-...      # get one at console.anthropic.com
npm start
```

Open **http://localhost:3000** in **Chrome or Edge** and allow the microphone when asked.

## Talking to it

| How | What |
|---|---|
| Click the mic | Talk once, and it sends when you pause |
| Hold **Space** | Push-to-talk (release to send) |
| **Hands-free** button | Always listening: say *"Jarvis, what's the weather in Budapest?"* |
| Start talking while it speaks | Interrupts it (barge-in). **Esc** also silences it |
| Type in the bar | Works anywhere, no mic needed |

## What it can do

- **Web search**: current news, facts, prices
- **Weather**: any city, live (Open-Meteo, no key needed)
- **Memory**: "Remember I take my coffee black". This is saved to `memory.json` and kept across restarts. Open **Memory** to see or delete notes
- **Timers**: "Set a 10 minute timer for the pasta". It appears above the input bar and is announced when the time is up
- **Open websites**: "Open YouTube"
- **Cards**: lists, steps, code, and comparisons appear as a card in the chat, and it speaks a short summary

## Config (env vars)

| Var | Default | |
|---|---|---|
| `JARVIS_MODEL` | `claude-opus-5-5` | e.g. `claude-sonnet-5-5` for cheaper and faster replies |
| `JARVIS_EFFORT` | `low` | `low` keeps voice replies fast. Raise to `medium`/`high` for harder questions |
| `JARVIS_USER` | `sir` | What it calls you |
| `PORT` | `3000` | |

## Adding a tool

In `server.js`, add a schema to `tools` and a `case` in `runTool`. To add a browser-side effect, put the name in `UI_TOOLS` and handle it in `doAction()` in `public/index.html`.

## Notes

- Speech recognition uses the browser's Web Speech API, which works best in Chrome or Edge. Firefox can only type.
- Refusals fall back automatically to another model (server-side `fallbacks: "default"`).
- `memory.json` holds personal notes and is git-ignored.
