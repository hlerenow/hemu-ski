// A reproducible, elevation-preserving backdrop bake from the public Skadi DEM.
// Download N48E087.hgt.gz (sourceUrl in public/data/backdrop-dem-v02.json) to .cache/skadi/ first.
// Does not fetch data, modify world.json, or overwrite an existing candidate.
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const meta = JSON.parse(await fs.readFile(path.join(root, 'public/data/world.json')));
const compressed = await fs.readFile(path.join(root, '.cache/skadi/N48E087.hgt.gz'));
const data = gunzipSync(compressed);
const posts = Math.sqrt(data.length / 2);
if (posts !== 3601) throw new Error(`Expected 3601×3601 HGT, got ${posts}`);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const R = 6378137, rad = Math.PI / 180;
const lonLat = (x, z) => [meta.origin.lon + x / (R * Math.cos(meta.origin.lat * rad)) / rad, meta.origin.lat - z / R / rad];
function sample(x, z) {
  const [lon, lat] = lonLat(x, z);
  const fx = (lon - 87) * 3600, fy = (49 - lat) * 3600;
  const i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j;
  if (i < 0 || j < 0 || i >= 3600 || j >= 3600) throw new Error('Sample outside N48E087');
  const at = (i, j) => {
    const h = data.readInt16BE((j * posts + i) * 2);
    if (h === -32768) throw new Error(`Void at ${i},${j}; do not invent replacement heights`);
    return h;
  };
  return at(i, j) * (1 - ax) * (1 - ay) + at(i + 1, j) * ax * (1 - ay)
    + at(i, j + 1) * (1 - ax) * ay + at(i + 1, j + 1) * ax * ay;
}
const size = 40000, cells = 1000, step = size / cells, verts = cells + 1;
const heights = new Float32Array(verts ** 2);
let min = Infinity, max = -Infinity;
const sectors = Array.from({ length: 8 }, (_, i) => ({ bearing: i * 45, elevation: -Infinity }));
for (let j = 0; j < verts; j++) for (let i = 0; i < verts; i++) {
  const x = -size / 2 + i * step, z = -size / 2 + j * step, h = sample(x, z);
  heights[j * verts + i] = h;
  min = Math.min(min, h); max = Math.max(max, h);
  const dx = x - 349.8, dz = z + 403.45, distance = Math.hypot(dx, dz);
  if (distance >= 3000 && distance <= 20000) {
    const bearing = (Math.atan2(dx, -dz) / rad + 360) % 360;
    const s = sectors[Math.round(bearing / 45) % 8];
    if (h > s.elevation) Object.assign(s, { elevation: h, x, z, distance, lonLat: lonLat(x, z) });
  }
}
const bytes = Buffer.alloc(heights.length * 2);
let maxQuantizationError = 0;
for (let k = 0; k < heights.length; k++) {
  const q = Math.round((heights[k] - min) * 65535 / (max - min));
  bytes.writeUInt16LE(q, k * 2);
  maxQuantizationError = Math.max(maxQuantizationError, Math.abs(min + q * (max - min) / 65535 - heights[k]));
}
const result = {
  file: 'backdrop-dem-v02.u16', size, cells, min, max,
  source: 'Mapzen Terrain Tiles / Skadi N48E087, SRTM-derived global DEM',
  sourceUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/skadi/N48/N48E087.hgt.gz',
  sourceSha256: sha256(compressed), sha256: sha256(bytes),
  datum: 'WGS84 horizontal / EGM96 geoid vertical; metres',
  sourcePosts: posts, sourceSpacingArcSeconds: 1, outputSpacingMetres: step,
  processing: 'Bilinear sampling and uint16 quantization only; no smoothing, scale, offset, or procedural displacement',
  maxQuantizationErrorMetres: maxQuantizationError,
  gondola6Top: { lonLat: lonLat(328.8, -397.5), elevation: sample(328.8, -397.5) },
  sectors3to20km: sectors,
};
// Exclusive writes protect existing generated versions.
await fs.writeFile(path.join(root, 'public/data', result.file), bytes, { flag: 'wx' });
await fs.writeFile(path.join(root, 'public/data/backdrop-dem-v02.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result, null, 2));
