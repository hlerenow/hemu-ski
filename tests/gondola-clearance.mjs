import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { liftStations } from '../src/world/stations.js';
import { MODERN_GONDOLAS, CABIN_DEPTH, gondolaLayout, gondolaLoop, ropeDeflection, shapeGondolaStations, offPisteSites } from '../src/world/gondola-path.js';

// The map editor's ground and runs (without the game's banks and summit shaping).
const meta = JSON.parse(readFileSync('public/data/world.json'));
const edits = JSON.parse(readFileSync('public/data/edits/edits.json'));
const d = { ...meta.detail, ...edits.detail };
const bytes = readFileSync('public/data/edits/' + edits.detail.file);
const q = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
const verts = d.cells + 1, step = d.size / d.cells;
const hf = { h: Float32Array.from(q, v => d.min + v * (d.max - d.min) / 65535), verts, cells: d.cells, step,
  x0: d.center[0] - d.size / 2, z0: d.center[1] - d.size / 2,
  heightAt(x, z) {
    const fx = Math.max(0, Math.min(this.cells - 1e-6, (x - this.x0) / step));
    const fz = Math.max(0, Math.min(this.cells - 1e-6, (z - this.z0) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * verts + i, h = this.h;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + verts] * (1 - u) + h[k + verts + 1] * u) * v;
  } };
// Exact distance to the nearest run's centreline, standing in for the game's PisteField.
const runs = edits.runs || meta.runs;
const piste = { distAt(x, z) {
  let best = Infinity;
  for (const { points: p } of runs) for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], dx = p[i][0] - ax, dz = p[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
} };
const HALF_WIDTH = 17; // PISTE_HALF_WIDTH (data.js reads Vite's env, so isn't imported here)
const offPiste = offPisteSites(piste, HALF_WIDTH);

// The shipped station and cabin, as the game sizes them.
function glbMesh(name) {
  const file = readFileSync(`public/models/lifts/${name}.glb`);
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength));
  const binOffset = 20 + jsonLength + 8;
  const read = index => {
    const a = json.accessors[index], view = json.bufferViews[a.bufferView];
    const size = { 5126: 4, 5123: 2, 5125: 4 }[a.componentType];
    const components = { SCALAR: 1, VEC3: 3 }[a.type], stride = view.byteStride || size * components;
    assert.ok(size && components, `unexpected ${name} geometry`);
    const start = binOffset + (view.byteOffset || 0) + (a.byteOffset || 0), values = [];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < components; k++) {
      const at = start + i * stride + k * size;
      values.push(a.componentType === 5126 ? file.readFloatLE(at) : size === 2 ? file.readUInt16LE(at) : file.readUInt32LE(at));
    }
    return values;
  };
  const primitive = json.meshes[0].primitives[0];
  const vertices = read(primitive.attributes.POSITION), points = [];
  for (let i = 0; i < vertices.length; i += 3) points.push(new THREE.Vector3(...vertices.slice(i, i + 3)));
  return { points, indices: read(primitive.indices) };
}
// The cabin hung from its grip, 4.2 m tall (hangFromGrip); its body, and the hanger above it.
const cabin = glbMesh('cabin');
const cb = new THREE.Box3().setFromPoints(cabin.points), cs = 4.2 / (cb.max.y - cb.min.y);
const grip = new THREE.Box3().setFromPoints(cabin.points.filter(p => p.y >= cb.max.y - (cb.max.y - cb.min.y) * 0.05)).getCenter(new THREE.Vector3());
const hung = cabin.points.map(p => p.clone().sub(grip).multiplyScalar(cs));
const body = new THREE.Box3().setFromPoints(hung.filter(p => p.y < -1.8)).expandByScalar(0.05);
const hanger = new THREE.Box3().setFromPoints(hung.filter(p => p.y >= -1.8 && p.y < -0.6));
assert.ok(Math.abs(-body.min.y - 0.05 - CABIN_DEPTH) < 0.05, 'CABIN_DEPTH matches the cabin model');
// The station, 18 m long, centred, standing on y = 0.
const station = glbMesh('station');
const sb = new THREE.Box3().setFromPoints(station.points), ss = 18 / (sb.max.z - sb.min.z);
const sp = station.points.map(p => new THREE.Vector3((p.x - (sb.min.x + sb.max.x) / 2) * ss, (p.y - sb.min.y) * ss, (p.z - (sb.min.z + sb.max.z) / 2) * ss));
const stationTris = [];
for (let i = 0; i < station.indices.length; i += 3) stationTris.push(new THREE.Triangle(...station.indices.slice(i, i + 3).map(k => sp[k])));

const lifts = edits.lifts || meta.lifts, stations = liftStations(lifts);
const approach = new Map();
const ends = MODERN_GONDOLAS.map(name => {
  const i = lifts.findIndex(l => l.name === name); assert.ok(i >= 0, name);
  return stations[i].map(([x, z]) => new THREE.Vector3(x, hf.heightAt(x, z), z));
});
for (const [a, b] of ends) shapeGondolaStations(hf, a, b, offPiste, approach);

const degrees = r => r * 180 / Math.PI;
for (const [n, name] of MODERN_GONDOLAS.entries()) {
  const [a, b] = ends[n].map(p => new THREE.Vector3(p.x, hf.heightAt(p.x, p.z), p.z));
  const layout = gondolaLayout(hf, a, b, { offPiste, approach });
  const { supports } = layout;

  // Towers keep off the runs, and none is taller than 40 m.
  for (let i = 1; i < supports.length - 1; i++) {
    const p = supports[i];
    assert.ok(piste.distAt(p.x, p.z) >= HALF_WIDTH + 5, `${name}: tower ${i} stands on a run (${piste.distAt(p.x, p.z).toFixed(1)} m from its line)`);
    assert.ok(p.y - hf.heightAt(p.x, p.z) <= 40.5, `${name}: tower ${i} is ${(p.y - hf.heightAt(p.x, p.z)).toFixed(1)} m tall`);
  }
  // The rope enters each station all but level, and the last two towers before
  // it turn the rope by 15° at most each, as do all the others.
  for (const [mouth, t1] of [[0, 1], [supports.length - 1, supports.length - 2]]) {
    const m = supports[mouth], t = supports[t1];
    const entry = degrees(Math.atan2(Math.abs(t.y - m.y), Math.hypot(t.x - m.x, t.z - m.z)));
    assert.ok(entry <= 1.5, `${name}: rope enters at ${entry.toFixed(1)}°`);
  }
  const bends = supports.slice(1, -1).map((_, k) => degrees(ropeDeflection(supports, k + 1)));
  bends.forEach((bend, k) => assert.ok(Math.abs(bend) <= 15.05, `${name}: tower ${k + 1} turns the rope ${bend.toFixed(1)}°`));

  const loop = gondolaLoop(layout);
  assert.ok(loop.points[0].distanceTo(loop.points.at(-1)) < 1e-8, `${name}: loop must close`);
  assert.ok(loop.acc.every((v, i) => i === 0 || v > loop.acc[i - 1]), `${name}: loop contains a zero-length segment`);

  // Walk a cabin round the whole loop: in each station it must miss the
  // station's mesh (the hanger may reach into the canopy, so only what stands
  // below it counts there), and out on the line its floor must clear the snow.
  const frames = layout.ends.map(end => new THREE.Matrix4().makeRotationY(Math.atan2(end.out.x, end.out.z) + Math.PI).setPosition(end.P.x, end.base, end.P.z));
  const low = stationTris.filter(t => Math.max(t.a.y, t.b.y, t.c.y) < 4.0);
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3(), behind = new THREE.Vector3(), local = new THREE.Matrix4();
  let inStation = 0, lowest = Infinity;
  for (let s = 0; s < loop.total; s += 0.5) {
    const sample = (t, out) => {
      const u = ((t % loop.total) + loop.total) % loop.total;
      let i = 1; while (i < loop.acc.length - 1 && loop.acc[i] < u) i++;
      return out.lerpVectors(loop.points[i - 1], loop.points[i], (u - loop.acc[i - 1]) / (loop.acc[i] - loop.acc[i - 1]));
    };
    sample(s, pos); sample(s + 0.5, ahead); sample(s - 0.5, behind);
    const yaw = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    const car = new THREE.Matrix4().makeRotationY(yaw).setPosition(pos);
    const near = layout.ends.findIndex(end => Math.hypot(pos.x - end.P.x, pos.z - end.P.z) < 16);
    if (near >= 0) {
      inStation++;
      // The station's triangles in the cabin's frame, against its body and hanger.
      local.copy(car).invert().multiply(frames[near]);
      const hit = (tris, box) => tris.some(t => box.intersectsTriangle(new THREE.Triangle(t.a.clone().applyMatrix4(local), t.b.clone().applyMatrix4(local), t.c.clone().applyMatrix4(local))));
      assert.ok(!hit(stationTris, body), `${name}: cabin body hits the station ${s.toFixed(1)} m round the loop`);
      assert.ok(!hit(low, hanger), `${name}: cabin hanger hits the station ${s.toFixed(1)} m round the loop`);
    } else {
      for (const [x, z] of [[body.min.x, body.min.z], [body.min.x, body.max.z], [body.max.x, body.min.z], [body.max.x, body.max.z], [0, 0]]) {
        const corner = new THREE.Vector3(x, body.min.y, z).applyMatrix4(car);
        lowest = Math.min(lowest, corner.y - hf.heightAt(corner.x, corner.z));
      }
    }
  }
  assert.ok(inStation > 40, `${name}: the cabins run into the stations`);
  assert.ok(lowest >= 0.5, `${name}: a cabin passes ${lowest.toFixed(2)} m over the snow`);
  console.log(`PASS ${name}: ${supports.length - 2} towers off the runs, rope enters level, bends ≤ ${Math.max(...bends.map(Math.abs)).toFixed(1)}°, cabins ≥ ${lowest.toFixed(1)} m over the snow`);
}
const v = (z, y) => new THREE.Vector3(0, y, z);
assert.ok(Math.abs(ropeDeflection([v(0, 0), v(10, 0), v(20, 10)], 1) - Math.PI / 4) < 1e-9);
console.log('PASS rope deflection measures the turn at a tower');
