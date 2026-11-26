// Unwraps country rings that jump across the 180° meridian (Russia, Fiji) so their
// longitudes run continuously (e.g. 179 → 181). Without this the outline draws
// rings around the pole and the country's centre lands near 0° longitude.
import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../vendor/countries.js', import.meta.url);
const src = await readFile(file, 'utf8');
const fc = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));
let fixed = 0;
for (const f of fc.features){
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) for (let k = 0; k < poly.length; k++){
    const ring = poly[k];
    if (!ring.some((p, i) => i && Math.abs(p[0] - ring[i - 1][0]) > 180)) continue;
    // shift so most of the ring sits on the side where most points are
    const east = ring.filter(p => p[0] > 0).length >= ring.length / 2;
    let off = 0; const out = [ring[0].slice()];
    for (let i = 1; i < ring.length; i++){
      const d = ring[i][0] - ring[i - 1][0];
      if (d > 180) off -= 360; else if (d < -180) off += 360;
      out.push([+(ring[i][0] + off).toFixed(3), ring[i][1]]);
    }
    const closes = Math.abs(out[0][0] - out.at(-1)[0]) < 1e-6;
    if (!closes) continue;                       // rings around a pole (Antarctica) can't be unwrapped
    if (east) for (const p of out) if (p[0] < 0) p[0] += 360;   // keep e.g. Chukotka at 190, not -170
    poly[k] = out; fixed++;
  }
}
await writeFile(file, 'window.COUNTRIES=' + JSON.stringify(fc) + ';\n');
console.log('unwrapped rings:', fixed);
