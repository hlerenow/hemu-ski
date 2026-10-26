// Bakes the game's trees from Cenji's Low Poly Winter Nature Pack into
// public/models/trees/trees.glb: for each tree in RECIPES, its parts' plain
// material colours turned into vertex colours (repainted in the game's palette),
// scaled to the species' height, and simplified with meshoptimizer to two
// levels of detail, `<name>_lod0` (~1,400 triangles, near) and `<name>_lod1`
// (~300, mid range). Positions and colours only: the game works out flat normals.
//
//   node tools/trees/bake.mjs <pack folder>   (the folder holding GLB/)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MeshoptSimplifier } from 'meshoptimizer';

const OUT = new URL('../../public/models/trees/trees.glb', import.meta.url);
const LODS = [1400, 300]; // target triangles

const SNOW = '#f6f7f2';
const BARK = '#6b5248';
// Each tree: the species and variant it becomes, the pack's file, its height
// in metres at size 1, and the colour for each of the pack's materials (a hex,
// or a function of the height up the tree, 0 at the foot and 1 at the tip).
const RECIPES = [
  // Siberian spruce and fir: dark, narrow spires.
  { name: 'spruce-a', file: 'TREE_09_FirLargeSnowy', height: 14, colors: { CENJI_Snow: SNOW, CENJI_BlueGreen: '#41685f', CENJI_Bark: BARK } },
  { name: 'spruce-b', file: 'TREE_10_FirMediumSnowy', height: 11.5, colors: { CENJI_Snow: SNOW, CENJI_BlueGreen: '#456d62', CENJI_Bark: BARK } },
  { name: 'spruce-c', file: 'TREE_04_PineTallThin', height: 15, colors: { CENJI_Snow: SNOW, CENJI_Evergreen: '#4b725e', CENJI_Bark: BARK } },
  // Siberian larch: needleless in winter, its twigs a warm grey-brown under the snow.
  { name: 'larch-a', file: 'TREE_07_PineSparse', height: 15, colors: { CENJI_Snow: SNOW, CENJI_Evergreen: '#8f7d72', CENJI_Bark: '#6a5246' } },
  { name: 'larch-b', file: 'TREE_08_PineYoung', height: 9, colors: { CENJI_Snow: SNOW, CENJI_PineGreen: '#937f73', CENJI_Bark: '#6a5246' } },
  // Siberian stone pine: broad, bushy crowns, up toward the treeline.
  { name: 'pine-a', file: 'TREE_05_PineWide', height: 11, colors: { CENJI_Snow: SNOW, CENJI_Evergreen: '#3e6650', CENJI_Bark: BARK } },
  { name: 'pine-b', file: 'TREE_12_EvergreenWindblown', height: 10, colors: { CENJI_Snow: SNOW, CENJI_Evergreen: '#43694f', CENJI_Bark: BARK } },
  // Silver birch: bare, a white trunk under dark red-brown twigs.
  { name: 'birch-a', file: 'TREE_13_BareLarge', height: 11, colors: { CENJI_Snow: SNOW, CENJI_Bark: (t) => (t < 0.42 ? '#e9e5dc' : '#7c6257') } },
  { name: 'birch-b', file: 'TREE_16_TwistedWinter', height: 9, colors: { CENJI_Snow: SNOW, CENJI_Bark: (t) => (t < 0.38 ? '#e9e5dc' : '#7c6257') } },
];

const linear = (hex) => {
  const c = parseInt(hex.slice(1), 16);
  return [c >> 16, (c >> 8) & 255, c & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
};

// A GLB's triangles: [{ material, positions (Float32Array), indices (Uint32Array) }].
function readGlb(file) {
  const b = fs.readFileSync(file);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  const read = (ai, Type, comps) => {
    const a = json.accessors[ai], v = json.bufferViews[a.bufferView];
    const size = Type.BYTES_PER_ELEMENT, stride = v.byteStride || size * comps;
    const out = new Type(a.count * comps);
    const base = binStart + (v.byteOffset || 0) + (a.byteOffset || 0);
    for (let i = 0; i < a.count; i++)
      for (let c = 0; c < comps; c++) {
        const o = base + i * stride + c * size;
        out[i * comps + c] = Type === Float32Array ? b.readFloatLE(o) : size === 2 ? b.readUInt16LE(o) : b.readUInt32LE(o);
      }
    return out;
  };
  for (const n of json.nodes) if (n.matrix || n.rotation || n.scale || n.translation) throw new Error(`${file}: node transforms aren't handled`);
  return json.meshes[0].primitives.map((p) => {
    const positions = read(p.attributes.POSITION, Float32Array, 3);
    const ia = json.accessors[p.indices];
    const indices = Uint32Array.from(read(p.indices, ia.componentType === 5123 ? Uint16Array : Uint32Array, 1));
    return { material: json.materials[p.material].name, positions, indices };
  });
}

// One welded mesh (vertices shared where position and colour match), scaled to `height`.
function bake(recipe, prims) {
  let top = 0;
  for (const p of prims) for (let i = 1; i < p.positions.length; i += 3) top = Math.max(top, p.positions[i]);
  const k = recipe.height / top;
  const pos = [], col = [], idx = [], seen = new Map();
  for (const p of prims) {
    const paint = recipe.colors[p.material];
    if (!paint) throw new Error(`${recipe.file}: no colour for ${p.material}`);
    const local = new Uint32Array(p.positions.length / 3);
    for (let i = 0; i < local.length; i++) {
      const x = p.positions[i * 3] * k, y = p.positions[i * 3 + 1] * k, z = p.positions[i * 3 + 2] * k;
      const hex = typeof paint === 'function' ? paint(y / recipe.height) : paint;
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)},${hex}`;
      let v = seen.get(key);
      if (v === undefined) {
        v = pos.length / 3;
        seen.set(key, v);
        pos.push(x, y, z);
        col.push(...linear(hex));
      }
      local[i] = v;
    }
    for (const i of p.indices) idx.push(local[i]);
  }
  return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: new Uint32Array(idx) };
}

// Simplified to about `tris` triangles, unused vertices dropped.
function simplify(mesh, tris) {
  const target = Math.min(tris * 3, mesh.indices.length);
  let [idx] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, 1, ['LockBorder']);
  if (idx.length > target * 1.3) [idx] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, 1);
  if (idx.length > target * 1.3) [idx] = MeshoptSimplifier.simplifySloppy(mesh.indices, mesh.positions, 3, target, 1);
  const remap = new Map(), pos = [], col = [];
  const out = new Uint16Array(idx.length);
  idx.forEach((v, i) => {
    let n = remap.get(v);
    if (n === undefined) {
      n = remap.size;
      remap.set(v, n);
      pos.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
      col.push(mesh.colors[v * 3], mesh.colors[v * 3 + 1], mesh.colors[v * 3 + 2]);
    }
    out[i] = n;
  });
  if (remap.size > 65535) throw new Error('too many vertices for 16-bit indices');
  return { positions: new Float32Array(pos), colors: new Float32Array(col), indices: out };
}

// The meshes as one GLB, each its own node: POSITION, COLOR_0 (normalised bytes), 16-bit indices.
function writeGlb(meshes) {
  const chunks = [], json = { asset: { version: '2.0', generator: 'tools/trees/bake.mjs' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [] };
  let offset = 0;
  const view = (buf, target) => {
    const pad = (4 - (buf.byteLength % 4)) % 4;
    chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), Buffer.alloc(pad));
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.byteLength, target });
    offset += buf.byteLength + pad;
    return json.bufferViews.length - 1;
  };
  for (const { name, positions, colors, indices } of meshes) {
    const n = positions.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], positions[i * 3 + c]);
        max[c] = Math.max(max[c], positions[i * 3 + c]);
      }
    const rgba = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(colors[i * 3 + c] * 255);
      rgba[i * 4 + 3] = 255;
    }
    const a = json.accessors.length;
    json.accessors.push(
      { bufferView: view(positions, 34962), componentType: 5126, count: n, type: 'VEC3', min, max },
      { bufferView: view(rgba, 34962), componentType: 5121, normalized: true, count: n, type: 'VEC4' },
      { bufferView: view(indices, 34963), componentType: 5123, count: indices.length, type: 'SCALAR' },
    );
    json.meshes.push({ name, primitives: [{ attributes: { POSITION: a, COLOR_0: a + 1 }, indices: a + 2 }] });
    json.nodes.push({ name, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  const bin = Buffer.concat(chunks);
  json.buffers.push({ byteLength: bin.length });
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const chunk = (type, data) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]);
}

const pack = process.argv[2];
if (!pack) {
  console.error('usage: node tools/trees/bake.mjs <Cenji pack folder>');
  process.exit(1);
}
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
const meshes = [];
for (const r of RECIPES) {
  const full = bake(r, readGlb(path.join(pack, 'GLB', `${r.file}.glb`)));
  const lods = LODS.map((t) => simplify(full, t));
  lods.forEach((m, i) => meshes.push({ name: `${r.name}_lod${i}`, ...m }));
  console.log(`${r.name.padEnd(9)} ${r.file.padEnd(28)} ${full.indices.length / 3} → ${lods.map((m) => m.indices.length / 3).join(' / ')} triangles`);
}
const glb = writeGlb(meshes);
fs.mkdirSync(new URL('.', OUT), { recursive: true });
fs.writeFileSync(OUT, glb);
console.log(`${OUT.pathname}: ${(glb.length / 1024).toFixed(0)} KB, SHA-256 ${crypto.createHash('sha256').update(glb).digest('hex')}`);
