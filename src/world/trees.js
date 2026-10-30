// The forest, as the Altai grows it round Hemu: Siberian larch (bare in winter)
// on most slopes, dark spruce and fir thick on the shaded north faces, stone
// pine up toward the treeline and birch on the valley floor, in stands with
// meadow between them, and only a scatter of trees on the sunny south faces.
// Cleared along pistes, lift lines and around buildings, thinning out toward
// the treeline, plus whatever the map editor removed or planted.
//
// The trees are the Cenji winter pack's, baked by tools/trees/bake.mjs into
// two levels of detail (public/models/trees/trees.glb, loadTreeModels()). Near
// the camera they're one BatchedMesh, each tree swapping its own detail with
// distance; past that, one tinted cone per tree, instanced per 250 m chunk so
// frustum and shadow culling work, and far away 4 × 4 chunks share one mesh to
// keep the draw calls down. The diorama's toy forest is drawn from the game's
// trees (toyForest).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel } from '../render/model-loader.js';
import { makeToon } from '../render/toon.js';
import { vnoise } from './terrain.js';
import { PISTE_HALF_WIDTH, SERVICE_CENTRES, ONSEN } from './data.js';

const GREEN = new THREE.Color('#4d7560');
const GREEN_DARK = new THREE.Color('#3d6352');
const SNOW = new THREE.Color('#f6f7f2');
const TRUNK = new THREE.Color('#6b5248');
const TREE_HEIGHT = 11.8; // the procedural tree's tip, before scaling

export const SPECIES = ['spruce', 'larch', 'pine', 'birch'];
// Per species: the far cone's tint and how much of it the snow covers (the
// bare trees hold little), how much of the tree's width the cone fills (the
// pack's trees are open, a cone is solid), and the trunk's radius at size 1
// (for collisions).
const KINDS = {
  spruce: { far: new THREE.Color('#46705f'), snow: 1, fill: 0.75, trunk: 0.45 },
  larch: { far: new THREE.Color('#76665d'), snow: 0.3, fill: 0.7, trunk: 0.45 },
  pine: { far: new THREE.Color('#3f6650'), snow: 1, fill: 0.8, trunk: 0.5 },
  birch: { far: new THREE.Color('#7b675b'), snow: 0.25, fill: 0.6, trunk: 0.3 },
};

function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < pos.count / 3; f++) {
    const cy = (pos.getY(f * 3) + pos.getY(f * 3 + 1) + pos.getY(f * 3 + 2)) / 3;
    fn(c, cy, f);
    for (let v = 0; v < 3; v++) c.toArray(col, (f * 3 + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// One cone of branches; `colors(snowy, face)` paints a face.
function tierGeometry(radius, height, y, segs, rot, hsegs, colors) {
  const g = new THREE.ConeGeometry(radius, height, segs, hsegs, true);
  // Jag the hem so the silhouette looks like drooping branches.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -height / 2 + 0.01) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const s = 1 + 0.12 * Math.sin(a * 5 + rot * 3);
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s);
      pos.setY(i, pos.getY(i) - 0.25 * Math.abs(Math.sin(a * 2.5 + rot)));
    }
  }
  g.rotateY(rot);
  g.translate(0, y, 0);
  return paint(g, (c, cy, f) => {
    const t = (cy - (y - height / 2)) / height; // 0 bottom … 1 top of tier
    colors(c, t > 0.6 || (t > 0.3 && f % 3 === 0), f);
  });
}

// The procedural tree, for a forest built without the baked models: three
// jagged tiers on a trunk. `lod` 1 gives the far cone instead, two plain tiers
// (12 triangles) a unit wide and a unit tall, painted as a mask for farMaterial:
// red for snow, green for the darker faces.
function buildTreeGeometry(lod) {
  const parts = [];
  if (!lod) {
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3, 5, 1, true).translate(0, 1.5, 0);
    parts.push(paint(trunk, (c) => c.copy(TRUNK)));
  }
  const colors = lod
    ? (c, snowy, f) => c.setRGB(snowy ? 1 : 0, f % 2, 0)
    : (c, snowy, f) => c.copy(snowy ? SNOW : f % 2 ? GREEN : GREEN_DARK);
  const tiers = lod ? [[2.7, 7.0, 4.6], [1.7, 5.8, 8.8]] : [[2.8, 4.6, 3.8], [2.1, 4.4, 7.0], [1.3, 3.8, 9.9]];
  tiers.forEach(([r, h, y], i) => parts.push(tierGeometry(r, h, y, lod ? 6 : 7, i * 1.3, lod ? 1 : 2, colors)));
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  if (lod) g.scale(1 / 2.7, 1 / TREE_HEIGHT, 1 / 2.7);
  g.computeBoundingSphere();
  return g;
}

// The far cones' material: each instance's colour is its species' tint and its
// `aSnow` how much of the cone's snow it keeps, the geometry's colour a mask
// (see buildTreeGeometry), so one mesh draws every species.
function farMaterial() {
  const mat = makeToon({ vertexColors: true }, { hatch: 1 });
  const toon = mat.onBeforeCompile;
  const snow = SNOW.clone();
  mat.onBeforeCompile = (shader, r) => {
    toon(shader, r);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSnow;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(mix(instanceColor.rgb * (1.0 - 0.18 * color.g), vec3(${snow.r}, ${snow.g}, ${snow.b}), color.r * aSnow), 1.0);`,
      );
  };
  mat.customProgramCacheKey = () => 'tree-far';
  return mat;
}

// The baked trees (tools/trees/bake.mjs) for createForest: for each species,
// its variants, each { lod0, lod1, height, radius }. Flat-shaded, as the rest
// of the world is.
export async function loadTreeModels() {
  const gltf = await loadModel(import.meta.env.BASE_URL + 'models/trees/trees.glb');
  const models = Object.fromEntries(SPECIES.map((s) => [s, []]));
  const byName = new Map();
  gltf.scene.traverse((o) => {
    const m = o.isMesh && o.name.match(/^(\w+)-(\w+)_lod(\d)$/);
    if (!m || !models[m[1]]) return;
    const key = `${m[1]}-${m[2]}`;
    if (!byName.has(key)) {
      const v = {};
      byName.set(key, v);
      models[m[1]].push(v);
    }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const src = g.attributes.color, col = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) col.set([src.getX(i), src.getY(i), src.getZ(i)], i * 3);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals();
    out.computeBoundingBox();
    byName.get(key)[`lod${m[3]}`] = out;
  });
  for (const list of Object.values(models))
    for (const v of list) {
      const b = v.lod0.boundingBox;
      v.height = b.max.y;
      v.radius = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
    }
  return models;
}

// Stand-ins for the baked trees: the procedural tree for every species.
function proceduralModels() {
  const g = buildTreeGeometry(0);
  return Object.fromEntries(SPECIES.map((s) => [s, [{ lod0: g, lod1: g, height: TREE_HEIGHT, radius: 2.8 }]]));
}

// The game's forest settings, shared with the map editor so it shows the same trees.
// The clearings are read when the forest is placed, so they follow the map
// editor's moves (see Places in data.js).
export const GAME_FOREST = {
  treeline: 2350,
  spacing: 10,
  density: 0.25,
  get clearings() {
    return [...SERVICE_CENTRES.map((c) => ({ x: c.x, z: c.z, r: 110 })), { x: ONSEN.x, z: ONSEN.z, r: ONSEN.clearing }];
  },
};

// Distance from (x, z) to the nearest lift's line, station to station.
function liftDistance(lifts) {
  const liftSegs = lifts.map((l) => [l.points[0], l.points[l.points.length - 1]]);
  return (x, z) => {
    let best = Infinity;
    for (const [a, b] of liftSegs) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz);
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
    }
    return best;
  };
}
// A tree's room: how far off a run's centreline and a lift's line it stands,
// with `clear` more for a bigger canopy.
const PISTE_ROOM = PISTE_HALF_WIDTH + 2, LIFT_ROOM = 9;
const smooth = THREE.MathUtils.smoothstep;

// Which way the ground at a normal faces: `north` 1 facing north (-z) … -1
// facing south, `steep` 0 on the flat … 1 on a real slope, where the facing counts.
function facing(nrm) {
  const h = Math.hypot(nrm.x, nrm.z);
  return { north: h > 1e-4 ? -nrm.z / h : 0, steep: smooth(h, 0.04, 0.2) };
}

// How many of a spot's trees the ground keeps, 0.2 on a sunny south face to
// 1.5 on a shaded north one (0.6 on the flat), times the stands: patches of
// forest with meadow between, from a slow noise.
function cover(x, z, { north, steep }) {
  const aspect = THREE.MathUtils.lerp(0.6, THREE.MathUtils.lerp(0.2, 1.5, smooth(north, -0.7, 0.5)), steep);
  const stand = 0.35 + 0.65 * smooth(vnoise(x * 0.004 + 7, z * 0.004 - 3), 0.3, 0.7);
  return aspect * stand;
}

// The species (an index into SPECIES) growing at (x, z), `y` up, facing as
// facing() says, `nearLine` 0 … 1 approaching the treeline. Larch everywhere,
// spruce and fir on the shaded faces and down in the valley, stone pine up
// high, birch on the valley floor; each in stands of its own (a slow noise per
// species), then picked by the spot's hash.
function speciesAt(x, z, y, { north, steep }, nearLine) {
  const low = 1 - smooth(y, 1380, 1520), high = smooth(y, 1950, 2250);
  const shade = Math.max(0, north) * steep;
  const w = [
    (0.25 + 1.1 * shade + 0.5 * low) * (1 - 0.8 * high),
    1,
    0.05 + 1.3 * high + nearLine,
    0.02 + 1.2 * low * (1 - shade),
  ].map((v, k) => v * (0.3 + 1.4 * vnoise(x * 0.005 + k * 31, z * 0.005 - k * 17)));
  let r = hash(x * 0.37 + 1.9, z * 1.1) * w.reduce((a, b) => a + b);
  for (let k = 0; k < w.length; k++) if ((r -= w[k]) < 0) return k;
  return 1;
}

// Every spot the forest would put a tree: one jittered candidate per `spacing`
// grid cell, kept unless it's above the treeline, on a run, under a lift, on a
// cliff, in a glade or a clearing, and then as often as the ground's cover()
// says. A spot's `id` is its grid cell (row-major from the north-west corner),
// so it stays the same when other trees come and go; the map editor's removals
// refer to it. `density` is the share of grid spots that get a tree on an
// average slope; `clearings` are [{ x, z, r }] circles kept free (e.g. around
// base lodges). `area` ([x0, z0, x1, z1]) limits it to the grid cells whose
// corner falls inside, for redoing part of the forest.
export function forestSpots(hf, piste, lifts, { treeline, spacing = 10, density = 0.5, clearings = [], area = null }) {
  const liftDist = liftDistance(lifts);
  const nrm = new THREE.Vector3();
  const cols = Math.ceil(hf.size / spacing);
  const lo = (v, v0) => Math.max(0, Math.ceil((v - v0) / spacing));
  const hi = (v, v0) => Math.min(cols - 1, Math.floor((v - v0) / spacing));
  const [gi0, gj0, gi1, gj1] = area ? [lo(area[0], hf.x0), lo(area[1], hf.z0), hi(area[2], hf.x0), hi(area[3], hf.z0)] : [0, 0, cols - 1, cols - 1];
  const spots = [];
  for (let gj = gj0; gj <= gj1; gj++) {
    const z = hf.z0 + gj * spacing;
    for (let gi = gi0; gi <= gi1; gi++) {
      const x = hf.x0 + gi * spacing;
      const jx = x + (hash(x, z) - 0.5) * spacing * 0.9;
      const jz = z + (hash(z + 3.3, x) - 0.5) * spacing * 0.9;
      if (!hf.inside(jx, jz, 30) || hf.holeAt(jx, jz)) continue;
      const y = hf.heightAt(jx, jz);
      const tl = treeline + (vnoise(jx * 0.006, jz * 0.006) - 0.5) * 160;
      if (y > tl) continue;
      // Sparse, stunted trees just under the line.
      const nearLine = smooth(y, tl - 120, tl);
      if (hash(jx * 1.7, jz) < nearLine * 0.85) continue;
      const pd = piste.distAt(jx, jz);
      if (pd < PISTE_ROOM + hash(jx, jz * 1.3) * 6) continue;
      if (liftDist(jx, jz) < LIFT_ROOM) continue;
      hf.normalAt(jx, jz, nrm);
      if (nrm.y < 0.78) continue; // cliffs
      if (vnoise(jx * 0.012 + 40, jz * 0.012) < 0.42) continue; // glades
      const face = facing(nrm);
      if (hash(jx + 5.1, jz * 0.7) > density * cover(jx, jz, face)) continue;
      if (clearings.some((c) => Math.hypot(jx - c.x, jz - c.z) < c.r)) continue;
      const sp = speciesAt(jx, jz, y, face, nearLine);
      spots.push(tree(gj * cols + gi, jx, jz, (0.75 + hash(jz, jx * 2.1) * 0.55) * (1 - nearLine * 0.4), sp));
    }
  }
  return spots;
}

// The map editor's changes to the forest (all optional):
//   density  replaces the forest's `density`
//   removed  spot ids with no tree
//   added    planted trees, [x, z, size] (size 1 is an average tree), of
//            whatever species grows there
// Planted trees get negative ids (-1 for added[0], -2 for added[1], ...). Returns
// the trees that stand, and the removed spots (which the editor shows, to restore).
export function applyTreeEdits(spots, hf, edits) {
  if (!edits) return { trees: spots, removed: [] };
  const gone = edits.removed instanceof Set ? edits.removed : new Set(edits.removed || []);
  const trees = [], removed = [];
  for (const t of spots) (gone.has(t.id) ? removed : trees).push(t);
  const nrm = new THREE.Vector3();
  (edits.added || []).forEach(([x, z, size], k) => {
    if (!hf.inside(x, z) || hf.holeAt(x, z)) return;
    const sp = speciesAt(x, z, hf.heightAt(x, z), facing(hf.normalAt(x, z, nrm)), 0);
    trees.push(tree(-1 - k, x, z, size, sp));
  });
  return { trees, removed };
}

// `sp` the species (an index into SPECIES), `v` picks its variant.
function tree(id, x, z, s, sp) {
  return { id, x, z, s, sp, v: hash(x * 2.3, z + 5.7), sy: s * (0.9 + hash(x + 2, z) * 0.3), rot: hash(x, z + 9) * Math.PI * 2 };
}

// The game's trees: GAME_FOREST's spots with the map editor's `edits` (see
// applyTreeEdits), which can change its density too.
export function gameTrees(hf, piste, lifts, edits = null) {
  const spots = forestSpots(hf, piste, lifts, { ...GAME_FOREST, density: edits?.density ?? GAME_FOREST.density });
  return applyTreeEdits(spots, hf, edits).trees;
}

// The diorama's toy forest, drawn from the game's `trees`: grown `scale` times
// and thinned to at most one per `cell` metres. A toy tree stands for `per` of
// the game's (its canopy alone would cover scale² of them; more keeps the toy
// forest open), so a cell gets one as often as the game's trees in it make
// that up, and it stands on one of them: the one nearest a jittered point in
// the cell, of those its bigger canopy leaves clear of the runs, the lift lines
// and the `keepOff` boxes ({ x, z, yaw, hw, hd }, as the physics' obstacles:
// the diorama's oversized stations and halls, and whatever stands among the
// trees), with `room` metres to spare round those.
export function toyForest(trees, hf, piste, lifts, { scale, cell, per = scale * scale, keepOff = [], room = 12 }) {
  const clear = 2.8 * (scale - 1); // the canopy's reach past a normal tree's
  const liftDist = liftDistance(lifts);
  const cols = Math.ceil(hf.size / cell);
  const byCell = new Map();
  for (const t of trees) {
    const k = Math.floor((t.z - hf.z0) / cell) * cols + Math.floor((t.x - hf.x0) / cell);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(t);
  }
  const blocked = (b, x, z, r) => {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = x - b.x, dz = z - b.z;
    return Math.abs(dx * c - dz * s) < b.hw + r && Math.abs(dx * s + dz * c) < b.hd + r;
  };
  const toy = [];
  for (const [k, list] of byCell) {
    const x = hf.x0 + (k % cols) * cell, z = hf.z0 + Math.floor(k / cols) * cell;
    if (hash(x + 1.7, z + 4.1) * per >= list.length) continue;
    const jx = x + hash(x, z) * cell, jz = z + hash(z + 3.3, x) * cell;
    let best = null, bestD = Infinity;
    for (const t of list) {
      const d = Math.hypot(t.x - jx, t.z - jz);
      if (d >= bestD) continue;
      if (piste.distAt(t.x, t.z) < PISTE_ROOM + clear || liftDist(t.x, t.z) < LIFT_ROOM + clear) continue;
      const r = 2.8 * t.s * scale + room;
      if (keepOff.some((b) => blocked(b, t.x, t.z, r))) continue;
      best = t;
      bestD = d;
    }
    if (best) toy.push(tree(best.id, best.x, best.z, best.s * scale, best.sp));
  }
  return toy;
}

// `trees` as gameTrees() or toyForest() give them; `models` as loadTreeModels()
// gives them (without, every species is the procedural tree). `chunk` and
// `lodDistance` tune batching and where the far cones take over; `hiDistance`
// is where the near trees drop to their lighter detail.
export function createForest(hf, trees, { models = null, chunk = 250, lodDistance = 450, hiDistance = 160, maxNearInstances = Infinity } = {}) {
  if (maxNearInstances !== Infinity && (!Number.isInteger(maxNearInstances) || maxNearInstances < 1)) throw new Error('Invalid near-tree budget');
  models ??= proceduralModels();
  const farGeo = buildTreeGeometry(1);
  const mat = makeToon({ vertexColors: true }, { hatch: 1 });
  const farMat = farMaterial();

  // The near trees' BatchedMesh: every variant's two details, each a geometry.
  const variants = SPECIES.map((s) => models[s]);
  let verts = 0;
  for (const list of variants) for (const v of list) verts += v.lod0.attributes.position.count + v.lod1.attributes.position.count;
  const near = new THREE.BatchedMesh(Number.isFinite(maxNearInstances) ? maxNearInstances : 2048, verts, 0, mat);
  const geoIds = variants.map((list) => list.map((v) => [near.addGeometry(v.lod0), near.addGeometry(v.lod1)]));
  near.castShadow = true;
  near.receiveShadow = false;
  near.frustumCulled = false; // its trees come and go; each is culled on its own

  const CH = chunk;
  const chunks = new Map();
  const colliders = new Map(); // 10 m spatial hash of trunks
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  for (const t of trees) {
    const list = variants[t.sp];
    const vi = Math.floor(t.v * list.length) % list.length;
    const v = list[vi], kind = KINDS[SPECIES[t.sp]];
    q.setFromAxisAngle(up, t.rot);
    p.set(t.x, hf.heightAt(t.x, t.z) - 0.3, t.z);
    // Near, the model at its size; far, the unit cone stretched to the model's shape.
    const m = new THREE.Matrix4().compose(p, q, s.set(t.s, t.sy, t.s));
    const fw = v.radius * kind.fill * t.s;
    const fm = new THREE.Matrix4().compose(p, q, s.set(fw, v.height * t.sy, fw));

    const key = `${Math.floor(t.x / CH)},${Math.floor(t.z / CH)}`;
    let c = chunks.get(key);
    if (!c) chunks.set(key, (c = []));
    c.push({ m, fm, pos: p.clone(), geo: geoIds[t.sp][vi], kind });
    const ck = `${Math.floor(t.x / 10)},${Math.floor(t.z / 10)}`;
    let cl = colliders.get(ck);
    if (!cl) colliders.set(ck, (cl = []));
    cl.push({ x: t.x, z: t.z, r: kind.trunk * t.s + 0.15, top: p.y + v.height * t.sy });
  }
  const count = trees.length;

  const group = new THREE.Group();
  group.add(near);
  const tint = new THREE.Color();
  const makeFar = (list) => {
    // The cone's attributes, shared, plus this mesh's own snow per tree.
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(farGeo.attributes)) geo.setAttribute(name, attr);
    geo.setAttribute('aSnow', new THREE.InstancedBufferAttribute(Float32Array.from(list, (t) => t.kind.snow), 1));
    geo.boundingSphere = farGeo.boundingSphere;
    const im = new THREE.InstancedMesh(geo, farMat, list.length);
    list.forEach((t, i) => {
      im.setMatrixAt(i, t.fm);
      // A touch of variety, tree to tree.
      im.setColorAt(i, tint.copy(t.kind.far).multiplyScalar(0.92 + 0.16 * hash(t.pos.x, t.pos.z * 1.3)));
    });
    im.castShadow = false;
    im.receiveShadow = false;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  };
  const SUPER = 4; // chunks per side of a far batch
  const batches = new Map();
  for (const [key, list] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    const center = new THREE.Vector3((cx + 0.5) * CH, 0, (cz + 0.5) * CH);
    center.y = hf.heightAt(center.x, center.z);
    const bk = `${Math.floor(cx / SUPER)},${Math.floor(cz / SUPER)}`;
    let b = batches.get(bk);
    if (!b) batches.set(bk, (b = { chunks: [], trees: [] }));
    b.chunks.push({ center, trees: list, lo: makeFar(list), ids: null, lods: null });
    b.trees.push(...list);
  }
  for (const [bk, b] of batches) {
    const [bx, bz] = bk.split(',').map(Number);
    b.center = new THREE.Vector3((bx + 0.5) * CH * SUPER, 0, (bz + 0.5) * CH * SUPER);
    b.center.y = hf.heightAt(b.center.x, b.center.z);
    b.lo = makeFar(b.trees);
  }
  // A batch takes over once all of its chunks are past the near-tree range.
  const batchDistance = lodDistance + CH * SUPER * 0.75;
  console.log(`forest: ${count} trees in ${chunks.size} chunks, ${batches.size} far batches`);

  // Which detail a near tree at distance `d` wants, given the one it has
  // (20 m of slack, so trees on the line don't flicker).
  const lodFor = (d, had) => (d < hiDistance ? 0 : d > hiDistance + 20 ? 1 : had);
  const nearChunks = new Set();
  function addChunk(c, camPos) {
    const need = near.instanceCount + c.trees.length;
    if (need > near.maxInstanceCount) near.setInstanceCount(Math.max(need, Math.ceil(near.maxInstanceCount * 1.5)));
    c.ids = new Int32Array(c.trees.length);
    c.lods = new Uint8Array(c.trees.length);
    c.trees.forEach((t, i) => {
      const lod = lodFor(t.pos.distanceTo(camPos), 1);
      c.ids[i] = near.addInstance(t.geo[lod]);
      c.lods[i] = lod;
      near.setMatrixAt(c.ids[i], t.m);
    });
    nearChunks.add(c);
  }
  function dropChunk(c) {
    for (const id of c.ids) near.deleteInstance(id);
    c.ids = c.lods = null;
    nearChunks.delete(c);
  }
  const lastLod = new THREE.Vector3(Infinity, 0, 0);

  return {
    group,
    count,
    farMeshes: [...batches.values()].flatMap((b) => [b.lo, ...b.chunks.map((c) => c.lo)]),
    update(camPos) {
      let changed = false;
      const candidates = [];
      for (const b of batches.values()) {
        const far = b.center.distanceTo(camPos) > batchDistance;
        b.lo.visible = far;
        for (const c of b.chunks) {
          const distance = c.center.distanceTo(camPos);
          c.lo.visible = !far;
          if (!far && distance < lodDistance) candidates.push({ c, distance });
        }
      }
      // Nearest chunks win the fixed mobile budget. Keep far-tree coverage
      // for every overflow chunk; collision data never depends on its LOD.
      if (Number.isFinite(maxNearInstances)) candidates.sort((a, b) => a.distance - b.distance);
      const selected = new Set();
      let remaining = maxNearInstances;
      for (const { c } of candidates) {
        if (c.trees.length > remaining) continue;
        selected.add(c);
        remaining -= c.trees.length;
        c.lo.visible = false;
      }
      // Free departing ids first, so crossing a boundary cannot temporarily
      // need both the previous and next neighbourhood's capacity.
      for (const c of nearChunks) if (!selected.has(c)) { dropChunk(c); changed = true; }
      for (const c of selected) if (!c.ids) { addChunk(c, camPos); changed = true; }
      // Each near tree's detail, whenever the camera has moved a few metres.
      if (!changed && lastLod.distanceToSquared(camPos) < 16) return;
      lastLod.copy(camPos);
      for (const c of nearChunks)
        c.trees.forEach((t, i) => {
          const lod = lodFor(t.pos.distanceTo(camPos), c.lods[i]);
          if (lod === c.lods[i]) return;
          c.lods[i] = lod;
          near.setGeometryIdAt(c.ids[i], t.geo[lod]);
        });
    },
    // Nearest trunk overlap with a circle at (x, z), or null: { x, z, r, top },
    // `top` the height of its tip.
    hit(x, z, r) {
      const i0 = Math.floor(x / 10), j0 = Math.floor(z / 10);
      for (let j = j0 - 1; j <= j0 + 1; j++)
        for (let i = i0 - 1; i <= i0 + 1; i++) {
          const cl = colliders.get(`${i},${j}`);
          if (!cl) continue;
          for (const t of cl) {
            const dx = x - t.x, dz = z - t.z;
            const rr = r + t.r;
            if (dx * dx + dz * dz < rr * rr) return t;
          }
        }
      return null;
    },
  };
}

function hash(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
