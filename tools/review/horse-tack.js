// Tack for the horse review (tools/review/horse.html): the Kazakh saddle with
// its felt cloth (public/models/saddle/), brass stirrup irons on leathers,
// reins from the bit to the rider's hands, and the `seat` a rider sits on
// through Rider.setLocomotion('sit'). The saddle is a model; the irons are
// built here, after the stirrup drawn with the saddle's first design sheet;
// the reins are stand-ins until the bridle is made.
//
// Model frame (the GLB's units): +z forward, +x the horse's left, +y up,
// hooves at y = 0. The saddle GLB is in the same frame and units, fitted to
// this horse's back at rest and skinned to its skeleton: the cloth rides with
// the hide under it, the tree is rigid on spine1, the bone the rider's seat
// follows. The seat is in metres in the same axes, as the
// snowmobile's is, since the rider's body frame matches the vehicle's.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeToon } from '../../src/render/toon.js';

const SADDLE_FILE = import.meta.env.BASE_URL + 'models/saddle/kazakh-saddle.glb';
export const loadSaddle = () => new GLTFLoader().loadAsync(SADDLE_FILE);

const { degToRad, clamp } = THREE.MathUtils;

// ---- The back's cross-sections ----
// Each slice across the body (constant z) as a radius about a line along the
// barrel at height CY, for angles from straight up (0) toward the horse's
// left (+): how far out the hide is in each direction.
const CY = 0.42;
const Z0 = 0.14, Z1 = -0.32, DZ = 0.02;
const T0 = -110, T1 = 110, DT = 5;
const NZ = Math.round((Z0 - Z1) / DZ) + 1, NT = Math.round((T1 - T0) / DT) + 1;

export function backProfile(positions) {
  const r = Array.from({ length: NZ }, () => new Float32Array(NT).fill(NaN));
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (y < 0.25) continue; // the legs
    const zi = Math.round((Z0 - z) / DZ);
    if (zi < 0 || zi >= NZ || Math.abs(Z0 - zi * DZ - z) > DZ * 0.55) continue;
    const t = THREE.MathUtils.radToDeg(Math.atan2(x, y - CY));
    const ti = Math.round((t - T0) / DT);
    if (ti < 0 || ti >= NT) continue;
    const d = Math.hypot(x, y - CY);
    if (!(d <= r[zi][ti])) r[zi][ti] = Math.max(d, Number.isNaN(r[zi][ti]) ? 0 : r[zi][ti]);
  }
  // Fill the gaps along each slice, then from the neighbouring slice.
  for (const row of r) {
    for (let j = 0; j < NT; j++) {
      if (!Number.isNaN(row[j])) continue;
      let a = j - 1, b = j + 1;
      while (a >= 0 && Number.isNaN(row[a])) a--;
      while (b < NT && Number.isNaN(row[b])) b++;
      if (a >= 0 && b < NT) row[j] = row[a] + ((row[b] - row[a]) * (j - a)) / (b - a);
      else if (a >= 0) row[j] = row[a];
      else if (b < NT) row[j] = row[b];
    }
  }
  for (let i = 0; i < NZ; i++) if (Number.isNaN(r[i][0])) r[i] = Float32Array.from(r[i > 0 ? i - 1 : i + 1]);
  // Smooth across both ways, so the tack lies over the hide's small bumps.
  const smooth = (get, set, n, m) => {
    for (let i = 0; i < n; i++) {
      const row = Array.from({ length: m }, (_, j) => get(i, j));
      for (let j = 0; j < m; j++) set(i, j, (row[Math.max(0, j - 1)] + 2 * row[j] + row[Math.min(m - 1, j + 1)]) / 4);
    }
  };
  for (let k = 0; k < 2; k++) {
    smooth((i, j) => r[i][j], (i, j, v) => { r[i][j] = v; }, NZ, NT);
    smooth((j, i) => r[i][j], (j, i, v) => { r[i][j] = v; }, NT, NZ);
  }
  // The hide's distance from the barrel line at z, `deg` from straight up.
  const at = (z, deg) => {
    const fz = clamp((Z0 - z) / DZ, 0, NZ - 1), ft = clamp((deg - T0) / DT, 0, NT - 1);
    const i = Math.min(Math.floor(fz), NZ - 2), j = Math.min(Math.floor(ft), NT - 2);
    const u = fz - i, v = ft - j;
    return (r[i][j] * (1 - u) + r[i + 1][j] * u) * (1 - v) + (r[i][j + 1] * (1 - u) + r[i + 1][j + 1] * u) * v;
  };
  // A point (model units) `lift` off the hide at z, `deg` from straight up.
  const point = (z, deg, lift, out = new THREE.Vector3()) => {
    const a = degToRad(deg), d = at(z, deg) + lift;
    return out.set(Math.sin(a) * d, CY + Math.cos(a) * d, z);
  };
  // How far a point (model units) is inside the hide, or < 0 outside it.
  const depth = (p) => {
    if (p.z > Z0 || p.z < Z1) return -1;
    const deg = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.y - CY));
    if (deg < T0 || deg > T1) return -1;
    return at(p.z, deg) - Math.hypot(p.x, p.y - CY);
  };
  return { at, point, depth };
}

// A stirrup iron, in metres, standing on the ground at y = 0, its opening
// facing ±z, after the stirrup drawn with the saddle's first design sheet: a
// brass loop whose sides rise nearly straight, then curve in to a rounded top;
// its bars flat bands, as deep as the tread at the foot and tapering up the
// sides; a dark leather pad on the tread. Sized round the riders' snow boots.
export const IRON = { width: 0.27, height: 0.27, top: 0.16, bar: 0.022, tread: 0.024, depth: 0.12, taper: 0.4, pad: 0.008 };
// A closed path through the corners `pts`, each rounded off over `radii`
// (at most about half of each edge beside it).
function roundedPath(path, pts, radii) {
  const n = pts.length;
  const at = (a, b, r) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + ((b[0] - a[0]) * r) / d, a[1] + ((b[1] - a[1]) * r) / d]; };
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  pts.forEach((p, i) => {
    const prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n];
    const r = Math.min(radii[i], 0.48 * len(p, prev), 0.48 * len(p, next));
    const a = at(p, prev, r), b = at(p, next, r);
    if (i === 0) path.moveTo(...a); else path.lineTo(...a);
    path.quadraticCurveTo(p[0], p[1], ...b);
  });
  path.closePath();
  return path;
}
// A convex polygon (counter-clockwise) with each edge moved in by its distance.
function inset(pts, dist) {
  const n = pts.length, lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len; // inward, for counter-clockwise
    return [p[0] + nx * dist[i], p[1] + ny * dist[i], dx, dy];
  });
  return lines.map((l, i) => {
    const [x1, y1, dx1, dy1] = lines[(i + n - 1) % n], [x2, y2, dx2, dy2] = l;
    const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / (dx1 * dy2 - dy1 * dx2);
    return [x1 + dx1 * t, y1 + dy1 * t];
  });
}
export function stirrupIron(brass, pad) {
  const { width: W, height: H, top: T, bar: t, tread, depth: D, taper, pad: P } = IRON;
  // Bottom corners, the shoulders where the sides start to curve in, the top.
  const outer = [[-W / 2, 0], [W / 2, 0], [W / 2 - 0.012, H * 0.6], [T / 2, H], [-T / 2, H], [-W / 2 + 0.012, H * 0.6]];
  const inner = inset(outer, [tread, t, t, t, t, t]);
  const shape = roundedPath(new THREE.Shape(), outer, [0.02, 0.02, 0.12, 0.06, 0.06, 0.12]);
  shape.holes.push(roundedPath(new THREE.Path(), inner, [0.01, 0.01, 0.11, 0.045, 0.045, 0.11]));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -D / 2);
  // Deep at the tread, the band narrowing up the sides to `taper` of that.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.smoothstep(pos.getY(i), tread, H * 0.85);
    pos.setZ(i, pos.getZ(i) * (1 - (1 - taper) * k));
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const loop = new THREE.Mesh(geo, brass);
  const mat = new THREE.Mesh(new RoundedBoxGeometry(inner[1][0] - inner[0][0] - 0.01, P * 2, D - 0.012, 2, P * 0.9), pad);
  mat.position.y = tread;
  for (const m of [loop, mat]) { m.castShadow = true; g.add(m); }
  return g;
}
// The sole stands on the pad.
export const TREAD_TOP = IRON.tread + IRON.pad;

// A box placed between two points each frame: straps.
class Strap {
  constructor(parent, width, thick, material) {
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 1, thick).translate(0, 0.5, 0), material);
    this.mesh.castShadow = true;
    parent.add(this.mesh);
  }
  set(a, b) {
    const d = _d.subVectors(b, a), len = d.length();
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len || 1));
    this.mesh.scale.set(1, len, 1);
  }
}
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();

// The saddle's cloth, front and back (model units), and how far its outside
// stands off the hide (the fit's gap and the felt, metres).
const CLOTH = { front: 0.022, back: -0.259, bottom: 0.365, off: 0.026 };
// The bit's rings, either side of the mouth (model units, left first), and
// where each rein lies along the neck on its way back to the hands: just
// outside the neck (±0.08 across there, the mane included) halfway up it.
const BIT = [new THREE.Vector3(0.04, 0.515, 0.435), new THREE.Vector3(-0.04, 0.515, 0.435)];
const NECK = [new THREE.Vector3(0.095, 0.64, 0.25), new THREE.Vector3(-0.095, 0.64, 0.25)];

export class Tack {
  // `model` the horse's scene at scale 1, `bones` by name, `mesh` its skinned
  // mesh, `saddle` the loaded saddle GLB.
  constructor(model, bones, mesh, saddle) {
    this.profile = backProfile(mesh.geometry.attributes.position);
    const back = bones.spine1, head = bones.head;
    model.updateMatrixWorld(true);
    // The back bone's rest pose in the model frame: things on the back are
    // children of it, placed back into the model frame at rest.
    const inModel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(back.matrixWorld);
    this.toModel = inModel.clone().invert();
    const onBack = (o) => { o.matrixAutoUpdate = false; o.matrix.copy(this.toModel); back.add(o); return o; };

    const leather = makeToon({ color: '#7a4a2a', side: THREE.DoubleSide }, { rim: 0.8, hatch: 0 });
    const brass = makeToon({ color: '#c9a24e' }, { rim: 1, hatch: 0 });
    const padding = makeToon({ color: '#4a3326' }, { rim: 0.4, hatch: 0 });
    const rein = makeToon({ color: '#3b2414' }, { rim: 0.6, hatch: 0 });
    // The saddle, bound to the horse's own skeleton beside its mesh: its
    // joints renumbered from its copy of the armature to the horse's by name.
    let src = null;
    saddle.scene.traverse((o) => { if (o.isSkinnedMesh) src = o; });
    const geometry = src.geometry.clone();
    const index = src.skeleton.bones.map((b) => mesh.skeleton.bones.findIndex((h) => h.name === b.name));
    const joints = geometry.attributes.skinIndex;
    for (let i = 0; i < joints.array.length; i++) joints.array[i] = index[joints.array[i]];
    this.saddleMesh = new THREE.SkinnedMesh(geometry, makeToon({ map: src.material.map, side: THREE.DoubleSide }, { rim: 0.8, hatch: 0 }));
    this.saddleMesh.castShadow = this.saddleMesh.receiveShadow = true;
    // Thin double-sided felt shades itself in stripes unless only its back
    // faces cast.
    this.saddleMesh.material.shadowSide = THREE.BackSide;
    this.saddleMesh.frustumCulled = false;
    this.saddleMesh.matrix.copy(mesh.matrix);
    this.saddleMesh.matrix.decompose(this.saddleMesh.position, this.saddleMesh.quaternion, this.saddleMesh.scale);
    mesh.parent.add(this.saddleMesh);
    this.saddleMesh.bind(mesh.skeleton, mesh.bindMatrix);
    // A copy left in the model frame, to measure the saddle against at rest.
    this.probe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    this.ray = new THREE.Raycaster();
    // The seat's low point between pommel and cantle, down the middle: where the
    // rider's hips go.
    this.low = new THREE.Vector3(0, Infinity, 0);
    for (let z = -0.16; z <= -0.04; z += 0.002) {
      const hit = this.cast(_a.set(0, 1, z), _b.set(0, -1, 0));
      if (hit && hit.y < this.low.y) this.low.set(0, hit.y, z);
    }
    this.strapTops = new Map();
    this.hideUnder(mesh);
    // The saddle's vertex nearest the seat's low point, to see how far the
    // skinned seat strays from the rider's frame on spine1.
    const sp = geometry.attributes.position;
    let best = Infinity;
    for (let i = 0; i < sp.count; i++) {
      const d = _a.fromBufferAttribute(sp, i).distanceTo(this.low);
      if (d < best) { best = d; this.lowVertex = i; }
    }
    // The rider's frame follows the back: the horse's at the ground under its
    // middle, turned to face as the rider's root does (-z forward).
    this.saddle = onBack(new THREE.Object3D());
    this.turned = new THREE.Object3D();
    this.turned.rotation.y = Math.PI;
    this.saddle.add(this.turned);
    // Stirrups and their straps hang in metres, in a frame that follows the
    // back but not the model's scale.
    this.metres = onBack(new THREE.Group());
    this.straps = [0, 1].map(() => new Strap(this.metres, 0.045, 0.012, leather));
    // Each iron turned as the boot in it is, toes out (degrees, the horse's
    // left iron first), the leather looped round its top bar.
    this.toeOut = 15;
    this.irons = [0, 1].map(() => {
      const g = stirrupIron(brass, padding);
      const loop = new THREE.Mesh(new RoundedBoxGeometry(0.052, 0.07, 0.036, 2, 0.014), leather);
      loop.position.y = IRON.height - IRON.bar / 2 + 0.012;
      loop.castShadow = true;
      g.add(loop);
      this.metres.add(g);
      return g;
    });
    // The bit's rings ride on the head; the reins are rebuilt each frame.
    model.updateMatrixWorld(true);
    this.bit = BIT.map((p) => head.worldToLocal(model.localToWorld(p.clone())));
    this.head = head;
    this.neck = bones.neck1;
    this.guide = NECK.map((p) => this.neck.worldToLocal(model.localToWorld(p.clone())));
    this.reins = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), rein);
      m.castShadow = true;
      m.frustumCulled = false;
      return m;
    });
    this.model = model;
    // The seat, in metres in the horse's frame (see Rider.setLocomotion).
    this.seat = { hips: new THREE.Vector3(), feet: [new THREE.Vector3(), new THREE.Vector3()], grips: [new THREE.Vector3(), new THREE.Vector3()], kneeOut: 0.45 };
  }

  // The seat for `scale` (metres per model unit) and the fit: stirrups `drop`
  // below the cushion, `out` from the middle, `ahead` of the hips; hands
  // `reach` ahead of the hips and `up` above the cushion, `apart` (all metres).
  fit(scale, f) {
    const s = this.seat;
    s.hips.set(0, this.low.y * scale, this.low.z * scale);
    s.kneeOut = f.kneeOut;
    s.feet.forEach((p, i) => p.set((i ? -1 : 1) * f.out, s.hips.y - f.drop, s.hips.z + f.ahead));
    s.grips.forEach((p, i) => p.set((i ? -1 : 1) * f.apart / 2, s.hips.y + f.up, s.hips.z + f.reach));
    // The stirrup straps hang from the side of the saddle's tree above each
    // foot, over the cloth.
    this.metres.matrix.copy(this.toModel).multiply(_m.makeScale(1 / scale, 1 / scale, 1 / scale));
    s.feet.forEach((foot, i) => {
      const top = _b.copy(this.strapTop(foot.z / scale, i ? -1 : 1)).multiplyScalar(scale);
      // The rigged rider's sole sits a board's thickness under the foot's spot
      // (RiderModel's BOARD_TOP): the pad's top goes there.
      this.irons[i].position.copy(foot).y -= 0.025 + TREAD_TOP;
      this.irons[i].rotation.y = THREE.MathUtils.degToRad(i ? -this.toeOut : this.toeOut);
      this.straps[i].set(top, _a.copy(this.irons[i].position).add(_d.set(0, IRON.height + 0.02, 0)));
    });
    return s;
  }

  // The first point the saddle has along a ray (model frame, at rest), or null.
  cast(origin, dir) {
    this.ray.set(origin, dir);
    const hit = this.ray.intersectObject(this.probe, false)[0];
    return hit ? hit.point : null;
  }

  // Where a stirrup strap leaves the saddle's side at z (model units), `side`
  // +1 the horse's left: on the outside, a little under the seat, where the
  // stirrup bar is on the tree.
  strapTop(z, side) {
    const key = Math.round(z * 500) * side;
    if (!this.strapTops.has(key)) {
      const hit = this.cast(_a.set(side * 0.5, this.low.y - 0.03, z), _b.set(-side, 0, 0));
      this.strapTops.set(key, hit ? hit.clone() : new THREE.Vector3(side * 0.15, this.low.y - 0.03, z));
    }
    return this.strapTops.get(key);
  }

  // The hide under the cloth: each vertex at rest, its outward normal, and
  // the points it faces on the inside and the outside of the cloth (a
  // triangle of the saddle's and where in it). A frame's pose moves them all;
  // clearance() says how far the hide passes through.
  hideUnder(mesh) {
    const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
    this.mesh = mesh;
    this.under = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (p.z > CLOTH.front + 0.01 || p.z < CLOTH.back - 0.01 || p.y < CLOTH.bottom) continue;
      n.fromBufferAttribute(nor, i).normalize();
      this.ray.set(_a.copy(p).addScaledVector(n, 0.0005), n);
      const [hit, out] = this.ray.intersectObject(this.probe, false);
      if (!hit || hit.distance > 0.03 || !out) continue; // under the tree's arch or the seat, not the cloth
      const point = (h) => ({ face: [h.face.a, h.face.b, h.face.c], at: h.barycoord.clone() });
      this.under.push({ i, inner: point(hit), outer: point(out), n: n.clone() });
    }
  }

  // How far (metres) the posed hide passes through the inside of the saddle's
  // cloth, worst first, and where (model z, y at rest), and how far through
  // its outside, where it would show; < 0 is clear by that much. Both are
  // skinned to the one skeleton, so both are in its frame.
  clearance(scale) {
    let worst = -Infinity, where = null, shows = -Infinity;
    const along = (u, pt) => {
      _b.set(0, 0, 0);
      pt.face.forEach((j, k) => _b.addScaledVector(this.saddleMesh.getVertexPosition(j, _d), pt.at.getComponent(k)));
      return -_b.sub(_a).dot(u.n);
    };
    for (const u of this.under) {
      this.mesh.getVertexPosition(u.i, _a);
      const d = along(u, u.inner);
      if (d > worst) { worst = d; where = u; }
      shows = Math.max(shows, along(u, u.outer));
    }
    const rest = where && _a.fromBufferAttribute(this.mesh.geometry.attributes.position, where.i);
    return { into: worst * scale, shows: shows * scale, z: rest?.z, y: rest?.y };
  }

  // How far (metres) the seat's low point on the skinned saddle is from where
  // the rider's frame, rigid on spine1, puts it.
  seatDrift() {
    this.saddleMesh.getVertexPosition(this.lowVertex, _a);
    this.saddleMesh.updateWorldMatrix(true, false);
    _a.applyMatrix4(this.saddleMesh.matrixWorld);
    this.saddle.updateWorldMatrix(true, false);
    _b.fromBufferAttribute(this.saddleMesh.geometry.attributes.position, this.lowVertex);
    return _a.distanceTo(this.saddle.localToWorld(_b));
  }

  // The reins, from the bit along the side of the neck to each palm (world
  // points), sagging a little on the way back.
  updateReins(palms) {
    this.head.updateWorldMatrix(true, false);
    this.neck.updateWorldMatrix(true, false);
    this.reins.forEach((m, i) => {
      const bit = this.head.localToWorld(this.bit[i].clone());
      const guide = this.neck.localToWorld(this.guide[i].clone());
      const palm = palms[i];
      const mid = guide.clone().lerp(palm, 0.5);
      mid.y -= 0.03;
      const curve = new THREE.CatmullRomCurve3([bit, guide, mid, palm.clone()]);
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(curve, 16, 0.008, 5, false);
    });
  }

  // How far the leg runs inside the horse or its saddle cloth (metres, < 0
  // clear): the thigh and shin from `hip` to `knee` to `ankle` (world points),
  // each `radius` round, skipping the top of the thigh, which sits on the
  // saddle.
  legDepth(hip, knee, ankle, radius, scale) {
    let worst = -Infinity;
    for (const [a, b, from] of [[hip, knee, 0.3], [knee, ankle, 0]]) {
      for (let k = from; k <= 1.0001; k += 0.1) {
        const p = this.model.worldToLocal(_a.copy(a).lerp(b, k));
        const cloth = p.z <= CLOTH.front && p.z >= CLOTH.back && p.y >= CLOTH.bottom ? CLOTH.off : 0;
        worst = Math.max(worst, this.profile.depth(p) * scale + cloth + radius);
      }
    }
    return worst;
  }
}
