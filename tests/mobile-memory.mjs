import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function glb(file) {
  const bytes = fs.readFileSync(file), n = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  return { bytes, json: JSON.parse(bytes.subarray(20, 20 + n)), binary: bytes.subarray(28 + n) };
}
function view(glb, index) {
  const v = glb.json.bufferViews[index], start = v.byteOffset ?? 0;
  return glb.binary.subarray(start, start + v.byteLength);
}
async function parseWithoutImages(file) {
  const { json, binary } = glb(file);
  json.materials = (json.materials ?? []).map(() => ({}));
  delete json.images; delete json.textures; delete json.samplers;
  const j = Buffer.from(JSON.stringify(json)), padded = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 32)]);
  const head = Buffer.alloc(20), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + padded.length + binary.length, 8);
  head.writeUInt32LE(padded.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  bh.writeUInt32LE(binary.length); bh.writeUInt32LE(0x004e4942, 4);
  const data = Buffer.concat([head, padded, bh, binary]);
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}

try {
  const { mobileProfile } = await server.ssrLoadModule('/src/render/quality.js');
  const { modelURL, loadQueue } = await server.ssrLoadModule('/src/render/model-loader.js');
  assert(mobileProfile({ userAgent: 'Mozilla iPhone' }));
  assert(mobileProfile({ coarse: true, touchPoints: 5, width: 1024, height: 1366 }));
  assert(!mobileProfile({ width: 390, height: 844 }), 'desktop resizing does not change resource quality');
  assert(!mobileProfile({ search: '?quality=desktop', userAgent: 'iPhone' }));
  assert(mobileProfile({ search: '?quality=mobile' }));
  const manifest = JSON.parse(fs.readFileSync('public/models/mobile-v01/manifest.json'));
  let originalPixels = 0, mobilePixels = 0;
  for (const [file, entry] of Object.entries(manifest)) {
    const source = glb('public/models/' + file), mobile = glb('public/models/' + entry.file);
    assert.equal(hash(source.bytes), entry.sourceSha256);
    assert.equal(hash(mobile.bytes), entry.sha256);
    for (const key of ['accessors', 'nodes', 'meshes', 'skins', 'animations', 'materials', 'textures', 'images', 'scenes']) {
      assert.deepEqual(mobile.json[key], source.json[key], `${file}: ${key}`);
    }
    const changed = new Set(entry.images.map(i => i.view));
    source.json.bufferViews.forEach((_, i) => { if (!changed.has(i)) assert.deepEqual(view(source, i), view(mobile, i), `${file}: non-image bytes`); });
    for (const image of entry.images) {
      assert(Math.max(...image.after) <= 1024);
      originalPixels += image.before[0] * image.before[1];
      mobilePixels += image.after[0] * image.after[1];
    }
    for (const base of ['/', './', '/hemu-ski/']) {
      assert.equal(modelURL(base + 'models/' + file, true, base), base + 'models/' + entry.file);
      assert.equal(modelURL(base + 'models/' + file, false, base), base + 'models/' + file);
    }
  }
  assert.equal(modelURL('./models/fox/red-fox.glb', true, './'), './models/fox/red-fox.glb');
  let active = 0, peak = 0;
  const queued = loadQueue(2), gates = [];
  const jobs = Array.from({ length: 5 }, (_, i) => queued(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => gates.push(resolve)); active--;
    if (i === 1) throw new Error('expected decode failure');
    return i;
  }));
  const settled = Promise.allSettled(jobs);
  for (let i = 0; i < 5; i++) {
    while (!gates.length) await new Promise(resolve => setImmediate(resolve));
    gates.shift()();
  }
  assert.equal((await settled).filter(x => x.status === 'fulfilled').length, 4);
  assert.equal(peak, 2); assert.equal(active, 0);
  console.log(`PASS ${Object.keys(manifest).length} immutable 1K assets, preserved non-image data, subpath URLs, profile selection and failure-safe two-load queue; RGBA saving ${(originalPixels - mobilePixels) * 4} B (before mipmaps)`);

  const { sceneMemory } = await server.ssrLoadModule('/src/render/memory.js');
  const inventoryScene = new THREE.Scene();
  const shared = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1]), 3));
  const sameBuffer = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(shared.attributes.position.array, 3));
  const image = { width: 1024, height: 1024 };
  const material = new THREE.MeshBasicMaterial({ map: new THREE.Texture(image) });
  inventoryScene.add(new THREE.Mesh(shared, material), new THREE.Mesh(sameBuffer, material));
  const inventory = sceneMemory(inventoryScene);
  assert.equal(inventory.geometryArrayBytes, 24); assert.equal(inventory.imageCount, 1);
  shared.attributes.position.array[0] = NaN;
  assert.equal(sceneMemory(inventoryScene).nonFinitePositions, 2);
  console.log('PASS inventory deduplicates shared backing buffers/images and detects non-finite positions');

  const { Heightfield } = await server.ssrLoadModule('/src/world/data.js');
  const { createBackdrop } = await server.ssrLoadModule('/src/world/terrain.js');
  const meta = JSON.parse(fs.readFileSync('public/data/world.json')).backdrop;
  const data = fs.readFileSync('public/data/' + meta.file);
  const q = new Uint16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  const heights = Float32Array.from(q, v => meta.min + v * (meta.max - meta.min) / 65535);
  const original = heights.slice();
  const hf = new Heightfield(meta.size, meta.cells, heights);
  const detail = { inside: (x, z) => Math.abs(x) < 100 && Math.abs(z) < 100 };
  const full = createBackdrop(hf, detail), small = createBackdrop(hf, detail, { stride: 2 });
  const n = meta.cells / 2 + 1, positions = small.geometry.attributes.position;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const y = heights[j * 2 * hf.verts + i * 2] + (detail.inside(positions.getX(k), positions.getZ(k)) ? -80 : 0);
    assert(Math.abs(positions.getY(k) - y) < 0.001, 'original DEM posts retained');
  }
  assert.deepEqual(hf.h, original, 'source DEM unchanged');
  for (const a of Object.values(small.geometry.attributes)) for (const v of a.array) assert(Number.isFinite(v));
  const bytes = g => g.index.array.byteLength + Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0);
  assert(bytes(small.geometry) < bytes(full.geometry) * 0.252);
  console.log(`PASS real DEM unchanged, sampled heights and all attributes finite; backdrop ${bytes(full.geometry)} → ${bytes(small.geometry)} B`);
  full.geometry.dispose(); small.geometry.dispose();

  const { createForest } = await server.ssrLoadModule('/src/world/trees.js');
  const trees = Array.from({ length: 12 }, (_, i) => ({ x: Math.floor(i / 4) * 100 + i % 4, z: 0, sp: 0, v: 0, rot: 0, s: 1, sy: 1 }));
  const forest = createForest({ heightAt: () => 0 }, trees, { chunk: 100, lodDistance: 1000, maxNearInstances: 4 });
  const near = forest.group.children.find(c => c.isBatchedMesh);
  for (const x of [0, 200, 100, 0, 10000, 0]) {
    forest.update(new THREE.Vector3(x, 0, 0));
    assert(near.instanceCount <= 4); assert.equal(near.maxInstanceCount, 4);
    assert(forest.hit(0, 0, 1), 'collision remains even when a chunk uses far LOD');
    if (x < 1000) assert(forest.farMeshes.some(m => m.visible), 'overflow chunks retain far trees');
  }
  console.log('PASS fixed near-tree budget across chunk crossings; far coverage and collision preserved');

  const female = await parseWithoutImages('public/models/female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb');
  const motionFile = 'public/models/motions/rider-locomotion-v02/female-locomotion-v02.glb';
  const motionManifest = JSON.parse(fs.readFileSync('public/models/motions/rider-locomotion-v02/manifest.json'));
  assert.equal(hash(fs.readFileSync(motionFile)), motionManifest.sha256);
  assert.equal(hash(fs.readFileSync('public/models/' + motionManifest.source)), motionManifest.sourceSha256);
  const motion = await parseWithoutImages(motionFile);
  let meshes = 0; motion.scene.traverse(o => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 0); assert.equal(motion.animations.length, 2);
  const { retarget } = await server.ssrLoadModule('/src/player/rider-model.js');
  const male = await parseWithoutImages('public/models/player.glb');
  for (let i = 0; i < female.animations.length; i++) {
    const a = retarget(female.animations[i], female.scene, male.scene);
    const b = retarget(motion.animations[i], motion.scene, male.scene);
    assert.equal(a.duration, b.duration);
    assert.equal(a.tracks.length, b.tracks.length);
    a.tracks.forEach((track, k) => {
      assert.equal(track.name, b.tracks[k].name);
      assert.deepEqual(track.times, b.tracks[k].times);
      assert.deepEqual(track.values, b.tracks[k].values);
    });
  }
  console.log('PASS mesh-free locomotion retargets byte-identical track values for the male rider');
} finally { await server.close(); }
