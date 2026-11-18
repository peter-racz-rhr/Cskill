// J.A.R.V.I.S. — local server.
// Serves the HUD, holds the API key, and runs Claude's tool loop.
// Streams Server-Sent Events to the browser: text deltas, tool activity, UI actions.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.JARVIS_MODEL || "claude-opus-5-5";
const EFFORT = process.env.JARVIS_EFFORT || "low"; // low = snappy voice replies
const USER_NAME = process.env.JARVIS_USER || "sir";
const MEMORY_FILE = path.join(here, "memory.json");

const client = new Anthropic();

// ---------- memory (persistent notes) ----------
async function loadMemory() {
  try { return JSON.parse(await fs.readFile(MEMORY_FILE, "utf8")); }
  catch { return { notes: [] }; }
}
async function saveMemory(mem) {
  await fs.writeFile(MEMORY_FILE, JSON.stringify(mem, null, 2));
}

// ---------- tools ----------
const tools = [
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
  {
    name: "get_weather",
    description: "Current weather and today's forecast for a city. Use for any weather question.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { city: { type: "string", description: "City name, e.g. 'Budapest'" } },
      required: ["city"],
      additionalProperties: false,
    },
  },
  {
    name: "remember",
    description: "Save a fact, preference, or note about the user for future conversations.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { note: { type: "string" } },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    name: "forget",
    description: "Delete saved notes containing the given text.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { match: { type: "string" } },
      required: ["match"],
      additionalProperties: false,
    },
  },
  {
    name: "open_website",
    description: "Open a website in a new browser tab on the user's screen.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "Full https URL" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "set_timer",
    description: "Start a countdown timer on the HUD; it announces itself when done.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        seconds: { type: "integer", description: "Duration in seconds" },
        label: { type: "string", description: "What the timer is for" },
      },
      required: ["seconds", "label"],
      additionalProperties: false,
    },
  },
  {
    name: "hud_display",
    description:
      "Put a panel on the HUD: a short title plus markdown-ish body (lists, key facts, code). Use for anything that is better read than heard: lists, steps, numbers, links.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
      required: ["title", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "set_theme",
    description: "Change the HUD colour scheme.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { theme: { type: "string", enum: ["arc", "mark42", "stealth", "vibranium"] } },
      required: ["theme"],
      additionalProperties: false,
    },
  },
];

// Tools whose effect happens in the browser: we forward them as "action" events.
const UI_TOOLS = new Set(["open_website", "set_timer", "hud_display", "set_theme"]);

const WMO = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "violent showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm",
};

async function getWeather(city) {
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
  ).then((r) => r.json());
  const place = geo.results?.[0];
  if (!place) return `No location found for "${city}".`;
  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`,
  ).then((r) => r.json());
  const c = w.current, d = w.daily;
  return JSON.stringify({
    place: `${place.name}, ${place.country}`,
    now: `${c.temperature_2m}°C (feels ${c.apparent_temperature}°C), ${WMO[c.weather_code] ?? "code " + c.weather_code}`,
    wind_kmh: c.wind_speed_10m,
    humidity: c.relative_humidity_2m,
    today: `high ${d.temperature_2m_max[0]}°C, low ${d.temperature_2m_min[0]}°C, rain chance ${d.precipitation_probability_max[0]}%`,
  });
}

async function runTool(name, input, send) {
  switch (name) {
    case "get_weather":
      return getWeather(input.city);
    case "remember": {
      const mem = await loadMemory();
      mem.notes.push({ note: input.note, at: new Date().toISOString() });
      await saveMemory(mem);
      send("memory", mem);
      return "Saved.";
    }
    case "forget": {
      const mem = await loadMemory();
      const before = mem.notes.length;
      mem.notes = mem.notes.filter((n) => !n.note.toLowerCase().includes(input.match.toLowerCase()));
      await saveMemory(mem);
      send("memory", mem);
      return `Removed ${before - mem.notes.length} note(s).`;
    }
    default:
      if (UI_TOOLS.has(name)) {
        if (name === "open_website" && !/^https?:\/\//i.test(input.url)) return "Error: URL must start with https://";
        send("action", { name, input });
        return "Done — shown on the user's HUD.";
      }
      return `Unknown tool ${name}`;
  }
}

// ---------- system prompt ----------
const STABLE_SYSTEM = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System — a personal AI assistant with a dry, understated British wit, unfailingly loyal, calm under pressure, and genuinely helpful. You address the user as "${USER_NAME}".

You are speaking out loud through a voice interface. So:
- Default to 1–3 short spoken sentences. Sound natural when read aloud: no markdown, no bullet points, no emoji, no URLs in your spoken reply.
- Anything better read than heard (lists, steps, numbers, code, links, comparisons) goes on the HUD with hud_display; then give a one-line spoken summary.
- Use tools proactively: web_search for anything current or factual you are unsure of, get_weather for weather, remember when the user shares a lasting preference or fact or asks you to remember something, set_timer for timers and reminders, open_website when asked to open or show a site.
- A touch of wit is welcome; never at the expense of being useful. Never claim to have done something you did not do with a tool.`;

function dynamicContext(mem, clientInfo) {
  const notes = mem.notes.length ? mem.notes.map((n) => `- ${n.note}`).join("\n") : "(none yet)";
  return `Current context (for you, not to be read aloud):
- Local time for the user: ${clientInfo.time || new Date().toString()}
- User timezone: ${clientInfo.tz || "unknown"}
Things you remember about the user:
${notes}`;
}

// ---------- conversation loop ----------
const conversations = new Map(); // sessionId -> MessageParam[]

async function handleChat(req, res, body) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const sid = String(body.session || "default");
  if (!conversations.has(sid)) conversations.set(sid, []);
  const messages = conversations.get(sid);
  const mem = await loadMemory();

  messages.push({
    role: "user",
    content: [
      { type: "text", text: dynamicContext(mem, body.client || {}) },
      { type: "text", text: String(body.text || "").slice(0, 8000) },
    ],
  });

  try {
    for (let step = 0; step < 8; step++) {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: EFFORT },
        system: [{ type: "text", text: STABLE_SYSTEM, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });

      stream.on("text", (t) => send("text", t));
      stream.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start") {
          const b = ev.content_block;
          if (b.type === "server_tool_use") send("tool", { name: b.name, status: "running" });
          if (b.type === "tool_use") send("tool", { name: b.name, status: "running" });
        }
      });

      const msg = await stream.finalMessage();
      messages.push({ role: "assistant", content: msg.content });

      if (msg.stop_reason === "refusal") {
        send("text", " I'm afraid I can't help with that one.");
        break;
      }
      if (msg.stop_reason === "pause_turn") continue;
      if (msg.stop_reason !== "tool_use") break;

      const calls = msg.content.filter((b) => b.type === "tool_use");
      const results = await Promise.all(
        calls.map(async (c) => {
          try {
            const out = await runTool(c.name, c.input ?? {}, send);
            send("tool", { name: c.name, status: "done" });
            return { type: "tool_result", tool_use_id: c.id, content: String(out) };
          } catch (err) {
            send("tool", { name: c.name, status: "error" });
            return { type: "tool_result", tool_use_id: c.id, content: `Error: ${err.message}`, is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    console.error(err);
    // Roll back the dangling user turn so the conversation stays valid.
    while (messages.length && messages.at(-1).role === "user") messages.pop();
    let msg = "My apologies, I've lost contact with my core systems.";
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) msg = "I can't authenticate. Please set the ANTHROPIC_API_KEY.";
    else if (err instanceof Anthropic.RateLimitError) msg = "We're being rate limited. Give me a moment.";
    else if (err instanceof Anthropic.APIConnectionError) msg = "I can't reach the network.";
    send("error", { message: msg, detail: String(err.message || err) });
  }
  send("end", {});
  res.end();
}

// ---------- http ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/chat") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      return handleChat(req, res, JSON.parse(raw || "{}"));
    }
    if (req.method === "POST" && url.pathname === "/api/reset") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      conversations.delete(String(JSON.parse(raw || "{}").session || "default"));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end('{"ok":true}');
    }
    if (url.pathname === "/api/memory") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(await loadMemory()));
    }
    if (url.pathname === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ model: MODEL, effort: EFFORT, user: USER_NAME }));
    }
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const full = path.join(here, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
    if (!full.startsWith(path.join(here, "public"))) throw new Error("bad path");
    const data = await fs.readFile(full);
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n  J.A.R.V.I.S. online  →  http://localhost:${PORT}`);
  console.log(`  model ${MODEL} · effort ${EFFORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
    console.warn("  ⚠  ANTHROPIC_API_KEY is not set — export it (or run `ant auth login`) before talking to me.\n");
});
