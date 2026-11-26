#!/usr/bin/env node
// Folk and underground radio for every country, from the open Radio Browser directory
// (https://www.radio-browser.info). Keeps only working stations with https streams,
// because browsers block http audio on an https page.
// Output: data/radio/index.json ({cc: {f, u}} counts) + data/radio/<cc>.json   (Node 18+)

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'radio');
const MIRRORS = ['de1', 'de2', 'fi1', 'nl1', 'at1'].map(m => `https://${m}.api.radio-browser.info`);
const PER = 8;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const KINDS = {
  folk: ['folk', 'traditional', 'folklore', 'ethnic'],
  underground: ['underground', 'indie', 'alternative', 'experimental', 'independent']
};

const src = await readFile(join(ROOT, 'vendor/countries.js'), 'utf8');
const geo = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
const codes = [...new Set(geo.features.map(f => f.properties.iso2).filter(Boolean))].sort();
const only = process.argv.slice(2).map(c => c.toUpperCase());
const todo = only.length ? codes.filter(c => only.includes(c)) : codes;

let mirror = 0;
async function search(params){
  const qs = new URLSearchParams({ hidebroken: 'true', order: 'votes', reverse: 'true', limit: '25', ...params });
  for (let tries = 0; tries < MIRRORS.length; tries++){
    const base = MIRRORS[(mirror + tries) % MIRRORS.length];
    try {
      const r = await fetch(`${base}/json/stations/search?${qs}`, { headers: { 'User-Agent': 'GlobeTunes/1.0 (open-source music globe)' }, signal: AbortSignal.timeout(12000) });
      if (r.ok){ mirror = (mirror + tries) % MIRRORS.length; return r.json(); }
    } catch {}
  }
  return [];
}
const https = u => typeof u === 'string' && u.startsWith('https://');
const clean = s => ({
  id: s.stationuuid,
  n: (s.name || '').trim().replace(/\s+/g, ' ').slice(0, 60),
  u: https(s.url_resolved) ? s.url_resolved : s.url,
  h: https(s.homepage) ? s.homepage : '',
  i: https(s.favicon) ? s.favicon : '',
  t: (s.tags || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 4),
  c: [s.state, ''].filter(Boolean)[0] || '',
  k: s.codec || '', b: s.bitrate || 0, v: s.votes || 0
});

await mkdir(OUT, { recursive: true });
let index = {};
try { index = JSON.parse(await readFile(join(OUT, 'index.json'), 'utf8')); } catch {}
for (const cc of todo){
  const out = {};
  for (const [kind, tags] of Object.entries(KINDS)){
    const seen = new Set(), list = [];
    for (const tag of tags){
      if (list.length >= PER) break;
      const rows = await search({ countrycode: cc, tag });
      for (const s of rows){
        if (list.length >= PER) break;
        if (seen.has(s.stationuuid) || s.lastcheckok !== 1) continue;
        if (!https(s.url_resolved) && !https(s.url)) continue;
        seen.add(s.stationuuid); list.push(clean(s));
      }
      await sleep(120);
    }
    out[kind] = list;
  }
  const lc = cc.toLowerCase();
  if (out.folk.length || out.underground.length){
    await writeFile(join(OUT, lc + '.json'), JSON.stringify(out));
    index[lc] = { f: out.folk.length, u: out.underground.length };
  } else delete index[lc];
  console.log(cc, 'folk', out.folk.length, 'underground', out.underground.length);
}
await writeFile(join(OUT, 'index.json'), JSON.stringify(index));
console.log('done:', Object.keys(index).length, 'countries with stations');
