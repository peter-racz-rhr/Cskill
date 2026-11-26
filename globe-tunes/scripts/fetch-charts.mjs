#!/usr/bin/env node
// Downloads Apple Music "most played" charts for every storefront and adds
// 30-second preview URLs via the iTunes lookup API.
// Output: data/index.json + data/charts/<cc>.json   (Node 18+, no dependencies)
//   per track: g = English genre, x = in how many countries' charts it appears,
//              pr = rank in the previous snapshot (0 = new entry)
//   per country in the index: dg = dominant genre, ds = its share of the top 25
// `node fetch-charts.mjs --post` only recomputes x / dg / ds from the files on disk.
//
// Apple's chart feed rejects browser (CORS) requests, so the site reads these
// pre-built files instead. Run daily (see .github/workflows/globe-tunes.yml).

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data');
const LIMIT = 25;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// country list = the same borders file the globe uses
const src = await readFile(join(ROOT, 'vendor/countries.js'), 'utf8');
const geo = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const codes = [...new Set(geo.features.map(f => f.properties.iso2).filter(Boolean))].map(c => c.toLowerCase()).sort();
const args = process.argv.slice(2);
const POST_ONLY = args.includes('--post');
const only = args.filter(a => !a.startsWith('--')).map(c => c.toLowerCase());
const todo = POST_ONLY ? [] : only.length ? codes.filter(c => only.includes(c)) : codes;

async function get(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    let r;
    try { r = await fetch(url, { headers: { 'User-Agent': 'globe-tunes-chart-fetcher/1.0' }, signal: AbortSignal.timeout(8000) }); }
    catch { await sleep(1000); continue; }   // timeout/network: retry, then throw (keeps old data)
    if (r.ok) return r.json();
    if (r.status === 404 || r.status === 403) return null;   // no such storefront
    if (r.status === 500 && i >= 1) return null;             // Apple answers 500 for storefronts without charts
    await sleep(r.status === 429 ? 15000 : 1500);
  }
  throw new Error('failed ' + url);
}

await mkdir(join(OUT, 'charts'), { recursive: true });
let index = { countries: {} };
try { index = JSON.parse(await readFile(join(OUT, 'index.json'), 'utf8')); } catch {}

let ok = 0;
for (const cc of todo) {
  let feed;
  try { feed = await get(`https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/${LIMIT}/songs.json`); }
  catch (e) { console.warn(cc, e.message); continue; }
  const rows = feed?.feed?.results;
  if (!rows?.length) { delete index.countries[cc]; continue; }

  // previews: one batched lookup per storefront (iTunes allows ~20 calls/min)
  const prev = {};
  try {
    const lk = await get(`https://itunes.apple.com/lookup?country=${cc}&lang=en_us&id=${rows.map(r => r.id).join(',')}`);
    for (const t of lk?.results ?? []) prev[t.trackId] = t;
  } catch (e) { console.warn(cc, 'lookup', e.message); }
  await sleep(3200);

  // previous snapshot, for movement arrows
  const before = {};
  try { JSON.parse(await readFile(join(OUT, 'charts', cc + '.json'), 'utf8')).tracks.forEach((t, i) => before[t.id] = i + 1); } catch {}
  const tracks = rows.map((r, i) => {
    const t = prev[r.id] || {};
    return {
      id: r.id,
      n: r.name,
      a: r.artistName,
      art: r.artworkUrl100,
      url: r.url,
      g: t.primaryGenreName || r.genres?.find(g => g.genreId !== '34')?.name || '',
      pr: before[r.id] || 0,
      p: t.previewUrl || '',
      ms: t.trackTimeMillis || 0,
      e: r.contentAdvisoryRating ? 1 : 0
    };
  });
  const updated = new Date(feed.feed.updated || Date.now()).toISOString();
  await writeFile(join(OUT, 'charts', cc + '.json'), JSON.stringify({ cc, updated, tracks }));
  const top = tracks[0];
  index.countries[cc] = { n: top.n, a: top.a, art: top.art, g: top.g };
  ok++;
  console.log(cc, tracks.length, '·', top.n, '—', top.a);
}
/* ---------- post-pass: spread across countries + dominant genre ---------- */
const { readdir } = await import('node:fs/promises');
const files = (await readdir(join(OUT, 'charts'))).filter(f => f.endsWith('.json'));
const charts = {};
for (const f of files) charts[f.slice(0, -5)] = JSON.parse(await readFile(join(OUT, 'charts', f), 'utf8'));
const spread = {};
for (const c of Object.values(charts)) for (const t of new Set(c.tracks.map(t => t.id))) spread[t] = (spread[t] || 0) + 1;
for (const [cc, c] of Object.entries(charts)) {
  for (const t of c.tracks) t.x = spread[t.id] || 1;
  await writeFile(join(OUT, 'charts', cc + '.json'), JSON.stringify(c));
  if (!index.countries[cc]) continue;
  const count = {};
  for (const t of c.tracks) if (t.g) count[t.g] = (count[t.g] || 0) + 1;
  const [dg, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  index.countries[cc].dg = dg; index.countries[cc].ds = +(n / c.tracks.length).toFixed(2);
  index.countries[cc].g = c.tracks[0]?.g || index.countries[cc].g;
}
index.updated = new Date().toISOString();
await writeFile(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`done: ${ok} charts, ${Object.keys(index.countries).length} in index`);
