// The horse's tack: the Kazakh saddle with its felt cloth (public/models/
// saddle/), brass stirrup irons on leathers, a black bridle (bridle.js), reins
// from the bit to the rider's hands, and the `seat` a rider sits on through
// Rider.setLocomotion('sit'). The saddle is a model; the irons are built
// here, after the stirrup drawn with the saddle's first design sheet, and the
// bridle and reins in code too. The review page (tools/review/horse-tack.js) adds its
// measurements on top of this.
//
// Model frame (the GLB's units): +z forward, +x the horse's left, +y up,
// hooves at y = 0. The saddle GLB is in the same frame and units, fitted to
// this horse's back at rest and skinned to its skeleton: the cloth rides with
// the hide under it, the tree is rigid on spine1, the bone the rider's seat
// follows. The seat is in metres in the same axes, as the
// snowmobile's is, since the rider's body frame matches the vehicle's.
import * as THREE from 'three';
import { loadModel } from '../render/model-loader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeToon } from '../render/toon.js';
import { Bridle } from './bridle.js';

const SADDLE_FILE = import.meta.env.BASE_URL + 'models/saddle/kazakh-saddle.glb';
let loading = null;
export function loadSaddle() {
  loading ||= loadModel(SADDLE_FILE).catch((err) => { loading = null; throw err; });
  return loading;
}

// The riding fit (metres): the stirrups `drop` below the seat's cushion, `out`
// from the middle and `ahead` of the hips; the hands `reach` ahead of the hips,
// `up` above the cushion and `apart`; and how far the knees turn out round the
// barrel. Narrower than about 0.42 at scale 2.6 and the legs run into it.
export const FIT = { drop: 0.57, out: 0.42, ahead: 0.08, reach: 0.44, up: 0.26, apart: 0.28, kneeOut: 0.9 };
// Stirrup length to each rider's legs, as a real rider sets it: the knee
// about 135° bent. The male sits higher on his cushion, so his hang shorter.
export const STIRRUPS = { female: 0.57, male: 0.52 };
// The fit for a rider (Rider.modelId).
export const fitFor = (id) => ({ ...FIT, drop: STIRRUPS[id] ?? FIT.drop });

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

// The bit's rings, either side of the mouth (model units, left first), and
// where each rein lies along the neck on its way back to the hands: just
// outside the neck (±0.08 across there, the mane included) halfway up it.
const BIT = [new THREE.Vector3(0.04, 0.515, 0.435), new THREE.Vector3(-0.04, 0.515, 0.435)];
const REIN = 0.011; // the reins' thickness, round (metres)
const SIZE = 2.6; // metres per model unit, as the game draws the horse (horse.js), for the bridle's straps
const NECK = [new THREE.Vector3(0.095, 0.64, 0.25), new THREE.Vector3(-0.095, 0.64, 0.25)];

export class Tack {
  // `model` the horse's scene at scale 1, `bones` by name, `mesh` its skinned
  // mesh, `saddle` the loaded saddle GLB.
  constructor(model, bones, mesh, saddle) {
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
    const black = makeToon({ color: '#1c1c1c' }, { rim: 0.7, hatch: 0 });
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
    // The bridle rides on the head, its rings at the bit; the reins are
    // rebuilt each frame.
    model.updateMatrixWorld(true);
    this.bridle = new Bridle(mesh.geometry, SIZE, BIT, black, brass);
    const onHead = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(head.matrixWorld).invert();
    this.bridle.group.matrixAutoUpdate = false;
    this.bridle.group.matrix.copy(onHead);
    head.add(this.bridle.group);
    this.bit = BIT.map((p) => head.worldToLocal(model.localToWorld(p.clone())));
    this.head = head;
    this.neck = bones.neck1;
    this.guide = NECK.map((p) => this.neck.worldToLocal(model.localToWorld(p.clone())));
    this.reins = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), black);
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
    this.scale = scale;
    s.feet.forEach((foot, i) => this.hang(i, foot, 0));
    return s;
  }

  // Hangs iron `i` (0 the horse's left) under a sole at `foot` (metres, the
  // horse's frame) pointing `heading` radians left of straight ahead, its
  // leather from where it always leaves the saddle. The fit hangs them under
  // the seat's feet; mounting moves the left one with the foot in it.
  hang(i, foot, heading) {
    const top = _b.copy(this.strapTop(this.seat.feet[i].z / this.scale, i ? -1 : 1)).multiplyScalar(this.scale);
    // The rigged rider's sole sits a board's thickness under the foot's spot
    // (RiderModel's BOARD_TOP): the pad's top goes there.
    this.irons[i].position.copy(foot).y -= 0.025 + TREAD_TOP;
    this.irons[i].rotation.y = heading + THREE.MathUtils.degToRad(i ? -this.toeOut : this.toeOut);
    this.straps[i].set(top, _a.copy(this.irons[i].position).add(_d.set(0, IRON.height + 0.02, 0)));
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
      m.geometry = new THREE.TubeGeometry(curve, 20, REIN, 6, false);
    });
  }
}
