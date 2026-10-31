// Strips the texture maps the game never draws from GLBs, in place:
//   node tools/models/strip-maps.mjs public/models/player.glb [more.glb …]
// The toon shader (src/render/toon.js) takes only a material's base colour
// map, so Tripo's normal, metallic-roughness and occlusion maps are downloaded
// and decoded for nothing. This drops those slots, then every texture, image
// and buffer view nothing refers to any more, and repacks the binary chunk.
// Geometry, skins, animations and the base colour map come through unchanged,
// byte for byte. Prints each file's size and SHA-256 before and after, for the
// model's README.
import fs from 'node:fs';
import crypto from 'node:crypto';

const UNUSED = ['normalTexture', 'occlusionTexture'];
const UNUSED_PBR = ['metallicRoughnessTexture'];

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const pad4 = (n) => (n + 3) & ~3;

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4);
    const chunk = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    o += 8 + len;
  }
  return { json, bin };
}

function writeGlb(json, bin) {
  const j = Buffer.from(JSON.stringify(json), 'utf8');
  const jPad = Buffer.concat([j, Buffer.alloc(pad4(j.length) - j.length, 0x20)]);
  const bPad = Buffer.concat([bin, Buffer.alloc(pad4(bin.length) - bin.length)]);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jPad.length + 8 + bPad.length, 8);
  jh.writeUInt32LE(jPad.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bPad.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, jPad, bh, bPad]);
}

// Every `{ index }` texture reference left in the materials.
function usedTextures(json) {
  const used = new Set();
  const walk = (v, key) => {
    if (!v || typeof v !== 'object') return;
    if (/Texture$/.test(key ?? '') && Number.isInteger(v.index)) used.add(v.index);
    for (const [k, c] of Object.entries(v)) walk(c, k);
  };
  walk(json.materials);
  return used;
}

function strip(json, bin) {
  if (json.buffers?.length !== 1 || json.buffers[0].uri) throw new Error('expected one embedded buffer');
  const dropped = [];
  for (const m of json.materials ?? []) {
    for (const k of UNUSED) if (m[k]) { dropped.push(k); delete m[k]; }
    for (const k of UNUSED_PBR) if (m.pbrMetallicRoughness?.[k]) { dropped.push(k); delete m.pbrMetallicRoughness[k]; }
  }
  // Textures nothing points at, then their images, then the buffer views
  // nothing (accessor or image) points at.
  const keepTex = usedTextures(json);
  const texMap = new Map();
  json.textures = (json.textures ?? []).filter((t, i) => keepTex.has(i) && texMap.set(i, texMap.size));
  const keepImg = new Set(json.textures.map((t) => t.source));
  const imgMap = new Map();
  json.images = (json.images ?? []).filter((im, i) => keepImg.has(i) && imgMap.set(i, imgMap.size));
  for (const t of json.textures) t.source = imgMap.get(t.source);
  const remapTex = (v, key) => {
    if (!v || typeof v !== 'object') return;
    if (/Texture$/.test(key ?? '') && Number.isInteger(v.index)) v.index = texMap.get(v.index);
    for (const [k, c] of Object.entries(v)) remapTex(c, k);
  };
  remapTex(json.materials);

  const keepView = new Set();
  for (const a of json.accessors ?? []) {
    if (a.bufferView !== undefined) keepView.add(a.bufferView);
    if (a.sparse) { keepView.add(a.sparse.indices.bufferView); keepView.add(a.sparse.values.bufferView); }
  }
  for (const im of json.images) if (im.bufferView !== undefined) keepView.add(im.bufferView);
  // Repack the kept views in their old order, each on a 4-byte boundary.
  const viewMap = new Map(), parts = [];
  let off = 0;
  json.bufferViews = json.bufferViews.filter((v, i) => {
    if (!keepView.has(i)) return false;
    viewMap.set(i, viewMap.size);
    const start = v.byteOffset ?? 0, data = bin.subarray(start, start + v.byteLength);
    const at = pad4(off);
    if (at > off) parts.push(Buffer.alloc(at - off));
    parts.push(data);
    v.byteOffset = at;
    off = at + data.length;
    return true;
  });
  for (const a of json.accessors ?? []) {
    if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = viewMap.get(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = viewMap.get(a.sparse.values.bufferView);
    }
  }
  for (const im of json.images) if (im.bufferView !== undefined) im.bufferView = viewMap.get(im.bufferView);
  const out = Buffer.concat(parts);
  json.buffers[0].byteLength = out.length;
  if (!json.textures.length) delete json.textures;
  if (!json.images.length) delete json.images;
  return { bin: out, dropped };
}

for (const file of process.argv.slice(2)) {
  const before = fs.readFileSync(file);
  const { json, bin } = readGlb(before);
  const { bin: out, dropped } = strip(json, bin);
  if (!dropped.length) { console.log(`${file}: nothing to strip`); continue; }
  const after = writeGlb(json, out);
  fs.writeFileSync(file, after);
  console.log(`${file}: dropped ${dropped.join(', ')}`);
  console.log(`  before ${before.length} B  ${sha(before)}`);
  console.log(`  after  ${after.length} B  ${sha(after)}`);
}
