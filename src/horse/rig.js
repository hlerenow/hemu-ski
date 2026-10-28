// The horse's skeleton, posed in code every frame rather than from clips
// (public/models/horse/, exported from its Rigify rig by the asset lab's
// scripts/export-horse.py). HorseBody (body.js) works out the pose; this turns
// the bones to match. The machinery is the dog's (src/dog/rig.js); a horse's
// legs have a bone more, and its shoulder blades swing with the forelegs.
//
// Model frame: +z forward, +x the horse's left, +y up, hooves on the ground at
// y = 0, about a unit from nose to tail. Every bone points along its own +y,
// toward the next joint.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeToon } from '../render/toon.js';
import { TailChain } from './tail.js';

const FILE = import.meta.env.BASE_URL + 'models/horse/altai-horse.glb';
let loading = null;
export function loadHorse() {
  loading ||= new GLTFLoader().loadAsync(FILE).catch((err) => { loading = null; throw err; });
  return loading;
}

// Front left, front right, hind left, hind right, each from its upper bone to
// its hoof: the upper arm or thigh, the forearm (elbow to knee) or shin (stifle
// to hock), the cannon down to the fetlock, the pastern down to the coronet,
// and the hoof. A foreleg's elbow bends back, a hind leg's stifle forward.
export const LEGS = [
  { id: 'LF', chain: ['upperArm_L', 'forearm_L', 'cannon_L', 'pastern_L', 'hoof_L'], blade: 'shoulder_L', front: true, side: 1 },
  { id: 'RF', chain: ['upperArm_R', 'forearm_R', 'cannon_R', 'pastern_R', 'hoof_R'], blade: 'shoulder_R', front: true, side: -1 },
  { id: 'LH', chain: ['thigh_L', 'shin_L', 'hindCannon_L', 'hindPastern_L', 'hindHoof_L'], blade: null, front: false, side: 1 },
  { id: 'RH', chain: ['thigh_R', 'shin_R', 'hindCannon_R', 'hindPastern_R', 'hindHoof_R'], blade: null, front: false, side: -1 },
];
const SPINE = ['spine', 'spine1', 'spine2', 'chest'];
// The neck's pitch and turn, shared from its base: most at the withers, so it
// drops from there rather than curling. Past about 0.85 rad down it folds into
// the chest.
const NECK = [['chest1', 0.45], ['neck', 0.3], ['neck1', 0.15], ['neck2', 0.1]];
const TURN = [['neck', 0.25], ['neck1', 0.25], ['neck2', 0.2], ['neck3', 0.15], ['head', 0.15]];
const TAIL = ['tail', 'tail1', 'tail2', 'tail3', 'tail4'];
// How a raised tail shares its lift, root to tip: the dock (the first two) is
// lifted by its muscles; the hair beyond only straightens behind it, a touch
// less at the end, and droops under its own weight (tail.js).
const LIFT = [1.0, 0.3, 0, 0, 0];
const SWING = [0.3, 0.25, 0.2, 0.15, 0.1];
const TIP = 0.11; // how far the hair runs on past tail4's joint
// How far the tail's locks ripple at their ends in full flutter (model units;
// toon.js `strands`), and where the hair hangs from and down to at rest.
const STRANDS = 0.012, HAIR_TOP = 0.53, HAIR_END = 0.1;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _s = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _cannon = new THREE.Vector3(), _pastern = new THREE.Vector3();

// A pose, all in the model frame (see HorseRig.pose):
//   hips: { pos, quat }   where the hips joint (the rump, at the root of the
//                          tail) goes, and the body's turn about it
//   bend: Vector3          the spine's arch (x, + nose down), sideways curve
//                          (y, + toward its left) and twist (z), shared from the
//                          hips to the chest
//   neck: { pitch, turn }  radians, + down and + to its left, shared up the neck
//   head: pitch, + nose down, on top
//   ears: [left, right]    radians tipped back
//   tail: { lift, swing,   raised from hanging (most at the root); swung to its
//           push, spin,    left, shared root to tip. What the tail feels of the
//           flutter }      horse's going: `push` the model frame's own
//                          acceleration turned round, gravity in it (model
//                          units/s²), `spin` how fast its turn quickens (rad/s²),
//                          `flutter` 0–1 the wind in the hair
//   legs: [4 × { hoof, cannon, pastern, toe, blade }]  where each coronet goes
//                          (the hoof's top), the way the cannon, pastern and
//                          hoof point, and how far a shoulder blade swings back
export function restPose(rig) {
  const r = rig.ref;
  return {
    hips: { pos: r.hips.clone(), quat: new THREE.Quaternion() },
    bend: new THREE.Vector3(),
    neck: { pitch: 0, turn: 0 },
    head: 0,
    ears: [0, 0],
    tail: { lift: 0, swing: 0, push: new THREE.Vector3(), spin: 0, flutter: 0 },
    legs: r.legs.map((l) => ({ hoof: l.hoof.clone(), cannon: l.cannon.clone(), pastern: l.pastern.clone(), toe: l.toe.clone(), blade: 0 })),
  };
}

export class HorseRig {
  constructor(gltf) {
    this.scene = clone(gltf.scene);
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) tailStrands(o);
      o.material = makeToon({ map: o.material.map, side: o.material.side }, { rim: 1, hatch: 0, strands: o.isSkinnedMesh ? 1 : 0 });
      o.castShadow = true;
      o.frustumCulled = false; // bind-pose bounds don't follow a galloping leg
      this.mesh = o;
    });
    // Bones parent-first. Each keeps its rest pose (local), and its pose in the
    // model frame now (`mq`, `mp`, kept by #fk) and at rest.
    this.bones = {};
    this.list = [];
    this.scene.traverse((o) => { if (o.isBone) { this.bones[o.name] = o; this.list.push(o); } });
    this.list.forEach((b, i) => {
      b.userData.i = i;
      b.userData.mq = new THREE.Quaternion();
      b.userData.mp = new THREE.Vector3();
    });
    this.list.forEach((b, i) => {
      let end = i + 1;
      while (end < this.list.length && isUnder(this.list[end], b)) end++;
      b.userData.end = end;
    });
    this.scene.updateMatrixWorld(true);
    const armature = this.bones.root.parent;
    const m = new THREE.Matrix4().copy(this.scene.matrixWorld).invert().multiply(armature.matrixWorld);
    this.base = { mq: new THREE.Quaternion(), mp: new THREE.Vector3() };
    m.decompose(this.base.mp, this.base.mq, _a);
    this.#fk(0, this.list.length);
    for (const b of this.list) {
      b.userData.rest = {
        p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone(),
        mq: b.userData.mq.clone(), mp: b.userData.mp.clone(),
      };
    }

    // What HorseBody needs to know of the horse at rest (model frame).
    const B = this.bones, at = (n) => B[n].userData.rest.mp.clone(), dir = (n) => Y.clone().applyQuaternion(B[n].userData.rest.mq);
    this.legs = LEGS.map((leg) => {
      const bones = leg.chain.map((n) => B[n]);
      const [A, Bn, C, D, E] = bones;
      const socket = at(A.name), joint = at(Bn.name), ankle = at(C.name);
      const line = _a.subVectors(ankle, socket).normalize();
      const hint = joint.clone().sub(socket);
      hint.addScaledVector(line, -hint.dot(line)).normalize();
      return {
        ...leg, bones, blade: leg.blade ? B[leg.blade] : null,
        // upper, middle, cannon, pastern
        len: [Bn.position.length(), C.position.length(), D.position.length(), E.position.length()],
        hint, // the way the elbow or stifle bends, in its parent's rest frame (model)
      };
    });
    this.ref = {
      hips: at('hips'),
      withers: at('chest1'),
      head: at('head'),
      legs: this.legs.map(({ bones: [A, , C, D, E], blade, side, front, len }) => ({
        side, front, socket: at(A.name), top: blade ? at(blade.name) : at(A.name),
        hoof: at(E.name), cannon: dir(C.name), pastern: dir(D.name), toe: dir(E.name),
        reach: len[0] + len[1], // socket to the top of the cannon, straight
      })),
    };
    this.short = [0, 0, 0, 0]; // how far each leg fell short of its hoof last pose (model units)
    // The tail's hair, hanging from where it's held (tail.js): its joints root
    // to tip, where the pose holds them; and the hind legs' joints, hip end to
    // hoof, for it to keep behind.
    this.tail = new TailChain(TAIL.map((n, i) => (i < TAIL.length - 1 ? B[TAIL[i + 1]].position.length() : TIP)));
    this.held = Array.from({ length: TAIL.length + 1 }, () => new THREE.Vector3());
    this.hind = this.legs.filter((l) => !l.front).map(() => [0, 1, 2, 3].map(() => new THREE.Vector3()));
  }

  // Turns the bones to `P` (see restPose), `dt` s after the last pose (0
  // holds the tail where it hangs).
  pose(P, dt = 0) {
    for (const b of this.list) {
      const r = b.userData.rest;
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
      b.scale.copy(r.s);
    }
    const B = this.bones;
    // The body: the hips joint placed, the hips turned about it.
    this.#place(B.hips, P.hips.pos, _q.copy(P.hips.quat).multiply(B.hips.userData.rest.mq));
    _q.setFromEuler(_e.set(P.bend.x / SPINE.length, P.bend.y / SPINE.length, P.bend.z / SPINE.length));
    for (const n of SPINE) this.#turn(B[n], _q);
    // The neck and head: pitched about the model's x, turned about its up,
    // shared from the base.
    for (const [n, share] of NECK) this.#turn(B[n], _q.setFromAxisAngle(X, P.neck.pitch * share));
    this.#turn(B.head, _q.setFromAxisAngle(X, P.head));
    this.#fk(0, this.list.length);
    for (const [n, share] of TURN) this.#rotate(B[n], _q.setFromAxisAngle(this.#up(B[n], _a), P.neck.turn * share));
    // Ears tip back about the head's x.
    ['ear_L', 'ear_R'].forEach((n, i) => {
      if (!P.ears[i]) return;
      this.#turn(B[n], _q.setFromAxisAngle(X, -P.ears[i]));
      this.#fk(B[n].userData.i, B[n].userData.end);
    });
    // The tail: raised, most at the root, then swung across. That's where it's
    // held; the hair follows it a moment late, once the legs are placed.
    const { tail } = P;
    TAIL.forEach((n, i) => this.#turn(B[n], _q.setFromAxisAngle(X, tail.lift * LIFT[i])));
    this.#fk(B.tail.userData.i, B.tail.userData.end);
    if (tail.swing) {
      TAIL.forEach((n, i) => this.#rotate(B[n], _q.setFromAxisAngle(this.#forward(B.hips, _a), tail.swing * SWING[i])));
    }
    TAIL.forEach((n, i) => this.held[i].copy(B[n].userData.mp));
    this.held[TAIL.length].copy(Y).applyQuaternion(B.tail4.userData.mq).multiplyScalar(TIP).add(this.held[TAIL.length - 1]);
    // Each leg reaches its hoof (see #reach).
    this.legs.forEach((leg, i) => { this.short[i] = this.#reach(leg, P.legs[i]); });
    // The hair hangs from where the tail's held, and each bone points at the
    // joint after it.
    this.legs.filter((l) => !l.front).forEach((leg, k) => leg.bones.slice(1).forEach((b, j) => this.hind[k][j].copy(b.userData.mp)));
    const at = this.tail.follow(this.held, this.hind, tail, dt);
    TAIL.forEach((n, i) => this.#aim(B[n], _a.subVectors(at[i + 1], B[n].userData.mp)));
    // And the locks of hair flutter in the wind.
    const strands = this.mesh.material.userData.strands;
    if (strands) {
      strands.amount.value = tail.flutter * STRANDS;
      strands.time.value += dt;
    }
  }

  // A foreleg's shoulder blade swings back about its top by `blade`. Then
  // two-bone IK from the socket to the top of the cannon, set back from the
  // coronet along the pastern and cannon; the elbow or stifle bends the way it
  // does at rest, carried round with the body. Then the cannon, pastern and
  // hoof are pointed. Returns how far the cannon's top fell short.
  #reach(leg, { hoof, cannon: wantCannon, pastern: wantPastern, toe, blade }) {
    const [A, Bn, C, D, E] = leg.bones, [la, lb, lc, lp] = leg.len;
    if (leg.blade && blade) this.#rotate(leg.blade, _q.setFromAxisAngle(this.#side(leg.blade.parent, _a), blade));
    const socket = A.userData.mp;
    const cannon = _cannon.copy(wantCannon), pastern = _pastern.copy(wantPastern);
    const ankle = _a.copy(hoof).addScaledVector(pastern, -lp).addScaledVector(cannon, -lc);
    // Out of reach, the cannon and pastern swing together about the coronet
    // toward the socket, straightening the fetlock, until the top of the cannon
    // is in reach: the hoof stays where it stands.
    const reach = la + lb - 1e-3;
    if (ankle.distanceTo(socket) > reach) {
      const low = _b.subVectors(ankle, hoof), toward = _c.subVectors(socket, hoof);
      const axis = _d.crossVectors(low, toward);
      if (axis.lengthSq() > 1e-12 && toward.length() < reach + low.length()) {
        axis.normalize();
        let lo = 0, hi = low.angleTo(toward);
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          _e2.copy(low).applyAxisAngle(axis, mid).add(hoof);
          if (_e2.distanceTo(socket) > reach) lo = mid;
          else hi = mid;
        }
        _q.setFromAxisAngle(axis, hi);
        cannon.applyQuaternion(_q);
        pastern.applyQuaternion(_q);
        ankle.copy(hoof).addScaledVector(pastern, -lp).addScaledVector(cannon, -lc);
      }
    }
    const d = _b.subVectors(ankle, socket);
    const want = d.length();
    const dist = THREE.MathUtils.clamp(want, Math.abs(la - lb) + 1e-4, la + lb - 1e-4);
    d.normalize();
    const bend = _c.copy(leg.hint).applyQuaternion(this.#turned(A.parent, _q));
    bend.addScaledVector(d, -bend.dot(d));
    if (bend.lengthSq() < 1e-8) bend.set(0, 0, leg.front ? -1 : 1);
    bend.normalize();
    const along = (la * la - lb * lb + dist * dist) / (2 * dist);
    const out = Math.sqrt(Math.max(0, la * la - along * along));
    const joint = _d.copy(socket).addScaledVector(d, along).addScaledVector(bend, out);
    const end = d.multiplyScalar(dist).add(socket); // the cannon's top, as near as the leg reaches
    this.#aim(A, joint.clone().sub(socket));
    this.#aim(Bn, end.sub(Bn.userData.mp));
    this.#aim(C, cannon.clone());
    this.#aim(D, pastern.clone());
    this.#aim(E, toe.clone());
    return Math.max(0, want - dist);
  }

  // The model's x and z, carried round by a bone's turn (for turning about its side or length).
  #side(b, out) {
    return out.copy(X).applyQuaternion(this.#turned(b, _r));
  }

  #forward(b, out) {
    return out.copy(Z).applyQuaternion(this.#turned(b, _r));
  }

  #up(b, out) {
    return out.copy(Y).applyQuaternion(this.#turned(b.parent, _r));
  }

  // A bone's turn from rest, in the model frame.
  #turned(b, out) {
    if (!b.isBone) return out.identity();
    return out.copy(b.userData.mq).multiply(_s.copy(b.userData.rest.mq).invert());
  }

  // Puts a bone's joint at `mp` turned to `mq` (model frame).
  #place(b, mp, mq) {
    const p = b.parent.isBone ? b.parent.userData : this.base;
    const inv = _r.copy(p.mq).invert();
    b.quaternion.copy(inv).multiply(mq);
    b.position.copy(mp).sub(p.mp).applyQuaternion(inv);
    this.#fk(b.userData.i, b.userData.end);
  }

  // Turns a bone by `d`, a turn in its parent's rest frame (model axes), on
  // top of its rest pose.
  #turn(b, d) {
    const pq = b.parent.isBone ? b.parent.userData.rest.mq : this.base.mq;
    b.quaternion.copy(pq).invert().multiply(d).multiply(pq).multiply(b.userData.rest.q);
  }

  // Turns a bone (and everything under it) about its joint by `q`, a turn in
  // the model frame, on top of how it's turned now.
  #rotate(b, q) {
    const pq = b.parent.isBone ? b.parent.userData.mq : this.base.mq;
    b.quaternion.copy(pq).invert().multiply(q).multiply(b.userData.mq);
    this.#fk(b.userData.i, b.userData.end);
  }

  // Swings a bone so it points along `dir` (model frame), the shortest way.
  #aim(b, dir) {
    _c.copy(Y).applyQuaternion(b.userData.mq);
    this.#rotate(b, _q.setFromUnitVectors(_c, dir.normalize()));
  }

  // The bones from list[i] to list[end - 1], in the model frame.
  #fk(i, end) {
    for (let k = i; k < end; k++) {
      const b = this.list[k], d = b.userData, p = b.parent.isBone ? b.parent.userData : this.base;
      d.mq.copy(p.mq).multiply(b.quaternion);
      d.mp.copy(b.position).applyQuaternion(p.mq).add(p.mp);
    }
  }

  // Where a bone's joint is now, in the model frame.
  at(name, out = new THREE.Vector3()) {
    return out.copy(this.bones[name].userData.mp);
  }
}

// Each vertex of the tail's hair: how far down it is, 0 at the dock (or off
// the tail) … 1 at its end, as it hangs at rest; and its lock's phase, from
// where it hangs across and front to back, so neighbouring locks ripple a
// little out of step (toon.js `strands`).
function tailStrands(mesh) {
  const g = mesh.geometry;
  if (g.attributes.aStrand) return;
  const pos = g.attributes.position, index = g.attributes.skinIndex, weight = g.attributes.skinWeight;
  const tail = new Set(mesh.skeleton.bones.flatMap((b, i) => (TAIL.includes(b.name) ? [i] : [])));
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (tail.has(index.getComponent(i, k))) w += weight.getComponent(i, k);
    const down = THREE.MathUtils.clamp((HAIR_TOP - pos.getY(i)) / (HAIR_TOP - HAIR_END), 0, 1);
    out[i * 2] = down * THREE.MathUtils.smoothstep(w, 0.5, 0.9);
    out[i * 2 + 1] = pos.getX(i) * 60 + pos.getZ(i) * 35;
  }
  g.setAttribute('aStrand', new THREE.BufferAttribute(out, 2));
}

function isUnder(o, b) {
  for (let p = o.parent; p; p = p.parent) if (p === b) return true;
  return false;
}
