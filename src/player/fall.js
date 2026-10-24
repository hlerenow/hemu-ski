// Snowboard crashes: how each kind of fall goes down, lies, and gets back up,
// then the head shake and dusting off. Shared by physics, posing and review.
//
// A fall is keyed in an upright frame on the snow: y up from the board's base,
// z toward the chest (the toe edge), x toward the nose. The board and the body
// on it turn about whatever is touching the snow (an edge, the nose or tail),
// and the body is posed in the upright frame, so a hip at y 0.2 is 0.2 m off
// the snow whichever way the board has gone over.
import * as THREE from 'three';

export const FALL_DURATION = 3.1;
export const SHAKE_DURATION = 2.4;
// When the slide ends and the board digs in; from REST on it stays put.
export const FALL_SLIDE = 1.05;
export const FALL_REST = 1.5;

const smooth = (t, a, b) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// Controls:
// bank   board rolled about its length: − over the toe edge (onto the chest), + the heel edge (onto the back)
// pitch  board tipped over its nose (−) or tail (+)
// spin   a tumble end over end about the middle of the body
// hip    [height off the snow, toward the chest, toward the nose]
// pelvis, tilt  pelvis and chest leaned from upright, + toward the chest
// side   chest leaned toward the nose; turn: hips and chest turned toward the nose
// chin, look: the head nodded and turned
// armL, armR  [shoulder forward(−)/back(+), shoulder out, elbow bend(−)]
// handL, handR  [weight, x, z]: a hand planted on the snow, at x, z
const RIDE = {
  bank: 0, pitch: 0, spin: 0, hip: [0.67, -0.13, 0.02], pelvis: 0, tilt: 0.62, side: 0, turn: 0.3, chin: -0.46, look: 0.35,
  armL: [-0.5, 1.15, -0.35], armR: [-0.9, 0.75, -1.0], handL: [0, 0, 0], handR: [0, 0, 0],
};
const GUARD = { armL: [-1.1, 0.35, -1.7], armR: [-1.1, 0.35, -1.7] };
const BRACE_BACK = { armL: [0.75, 0.5, -0.15], armR: [0.75, 0.5, -0.15] };

// Down on the knees and chest, hands by the shoulders, the board up on its toe edge behind.
const CHEST = {
  bank: -1.4, pitch: 0, hip: [0.42, 0.55, 0.02], pelvis: 0.7, tilt: 1.5, side: 0, turn: 0.05, chin: 0.6, look: 0.05,
  armL: [-0.6, 0.25, -1.5], armR: [-0.6, 0.25, -1.5], handL: [1, 0.3, 0.98], handR: [1, -0.26, 0.98],
};
// Flat on the back, knees up, the board on its heel edge below.
const BACK = {
  bank: 0.95, pitch: 0, hip: [0.13, -0.62, 0.02], pelvis: -1.1, tilt: -1.45, side: 0, turn: 0.05, chin: -0.55, look: 0.15,
  armL: [0.1, 1.35, -0.25], armR: [0.1, 1.35, -0.25], handL: [0, 0, 0], handR: [0, 0, 0],
};

const GET_UP = {
  // Push up off both hands to kneeling, then bring the board flat under you.
  chest: [
    [FALL_REST, CHEST],
    [1.8, { tilt: 1.05, hip: [0.5, 0.55, 0.02], pelvis: 0.45, chin: 0.2, handL: [0.6, 0.3, 0.98], handR: [0.6, -0.26, 0.98] }],
    [2.1, { tilt: 0.3, hip: [0.6, 0.52, 0.02], pelvis: 0.1, handL: [0, 0.3, 0.98], handR: [0, -0.26, 0.98], chin: -0.2,
      armL: [-0.7, 0.6, -0.8], armR: [-0.7, 0.6, -0.8] }],
    [2.6, { bank: -0.55, tilt: 0.75, hip: [0.55, 0.25, 0.02], pelvis: 0.2, chin: -0.4, armL: [-0.6, 1.0, -0.5], armR: [-0.8, 0.8, -0.8] }],
    [FALL_DURATION, { ...RIDE, bank: -0.1, hip: [0.67, -0.08, 0.02] }],
  ],
  // Sit up, plant the uphill hand behind, knees in, and push up over the board.
  back: [
    [FALL_REST, BACK],
    [1.85, { tilt: -1.05, pelvis: -0.7, bank: 0.45, hip: [0.15, -0.52, 0.02], turn: 0.15, chin: -0.5,
      armL: [0.6, 0.4, -0.2], armR: [-0.9, 0.5, -0.6], handL: [1, 0.3, -0.92] }],
    [2.3, { tilt: 0.3, pelvis: -0.2, bank: 0.25, hip: [0.24, -0.38, 0.02], turn: 0.3, chin: -0.5, handL: [0.4, 0.3, -0.9],
      armR: [-1.2, 0.5, -0.5] }],
    [2.75, { tilt: 0.85, pelvis: 0.05, bank: 0.1, hip: [0.52, -0.2, 0.02], handL: [0, 0.3, -0.9], armL: [-0.3, 0.9, -0.4] }],
    [FALL_DURATION, { ...RIDE, bank: 0.06 }],
  ],
};

// How each kind goes down. `rest`: which way up the rider ends, and so how
// they get up. `pitch` is keyed for travelling forward.
export const FALL_KINDS = {
  toe: { label: 'Toe edge: onto the knees and chest', rest: 'chest', keys: [
    [0.12, { bank: -0.3, hip: [0.6, 0.02, 0.02], tilt: 0.95, chin: -0.2, armL: [-1.25, 0.45, -0.4], armR: [-1.25, 0.45, -0.4] }],
    [0.32, { bank: -1.05, hip: [0.45, 0.42, 0.02], pelvis: 0.4, tilt: 0.85, chin: 0.1, armL: [-1.5, 0.35, -0.2], armR: [-1.5, 0.35, -0.2] }],
    [0.55, { ...CHEST, tilt: 1.58, chin: 0.45, hip: [0.4, 0.58, 0.02] }],
    [0.8, CHEST],
  ] },
  heel: { label: 'Heel edge: onto the seat and back', rest: 'back', keys: [
    [0.1, { bank: 0.25, hip: [0.58, -0.25, 0.02], tilt: 0.3, chin: -0.2, armL: [-2.0, 0.6, -0.4], armR: [-2.0, 0.6, -0.4] }],
    [0.3, { bank: 0.7, hip: [0.18, -0.45, 0.02], pelvis: -0.6, tilt: -0.35, chin: -0.65, ...BRACE_BACK }],
    [0.5, { ...BACK, chin: -0.85 }],
    [0.7, { ...BACK, chin: -0.4, tilt: -1.38 }],
    [0.9, BACK],
  ] },
  nose: { label: 'Nose catch: onto the front shoulder, then the back', rest: 'back', keys: [
    [0.12, { pitch: -0.3, hip: [0.55, -0.05, 0.15], tilt: 0.8, side: 0.35, chin: -0.3, ...GUARD }],
    [0.35, { pitch: -0.4, hip: [0.28, -0.05, 0.45], pelvis: 0.2, tilt: 0.4, side: 1.35, chin: -0.2, look: 0.6 }],
    [0.6, { pitch: -0.15, bank: 0.6, hip: [0.2, -0.4, 0.25], pelvis: -0.6, tilt: -0.8, side: 0.6, chin: -0.7 }],
    [0.9, { ...BACK, pitch: 0 }],
  ] },
  tail: { label: 'Riding backward: onto the back shoulder, then the back', rest: 'back', keys: [
    [0.12, { pitch: 0.3, hip: [0.55, -0.15, -0.15], tilt: 0.4, side: -0.35, chin: -0.5, ...BRACE_BACK }],
    [0.35, { pitch: 0.4, hip: [0.28, -0.2, -0.45], pelvis: -0.2, tilt: 0.0, side: -1.35, chin: -0.6, look: 0.0 }],
    [0.6, { pitch: 0.15, bank: 0.65, hip: [0.2, -0.45, -0.25], pelvis: -0.8, tilt: -1.0, side: -0.6, chin: -0.8 }],
    [0.9, BACK],
  ] },
  roll: { label: 'Fast: a tumble, landing on the back', rest: 'back', keys: [
    [0.12, { spin: -0.35, hip: [0.45, -0.05, 0.02], pelvis: 0.5, tilt: 1.15, chin: -0.6, ...GUARD }],
    [0.35, { spin: -1.7 }],
    [0.6, { spin: -3.7 }],
    [0.85, { spin: -5.6, pelvis: 0.2, tilt: 0.6 }],
    [1.0, { spin: -Math.PI * 2, bank: 0.5, hip: [0.25, -0.4, 0.02], pelvis: -0.6, tilt: -0.8, chin: -0.7, ...BRACE_BACK }],
    [1.25, BACK],
  ] },
  slam: { label: 'Hard landing: down on the seat', rest: 'back', keys: [
    [0.08, { hip: [0.36, -0.18, 0.02], tilt: 1.0, chin: -0.6, bank: 0.08 }],
    [0.25, { hip: [0.15, -0.45, 0.02], pelvis: -0.5, tilt: -0.25, bank: 0.4, chin: -0.5, ...BRACE_BACK }],
    [0.5, { tilt: -1.15, bank: 0.7, chin: -0.85, hip: [0.13, -0.55, 0.02], pelvis: -0.9,
      armL: [0.2, 1.2, -0.25], armR: [0.2, 1.2, -0.25] }],
    [0.8, BACK],
  ] },
};

// Picks the fall from how the rider was moving: sideways slides catch an
// edge (toward the chest: toe edge), straight-down drops sit you down, going
// backward goes over the tail, and only real speed carries a full tumble.
export function fallKind({ side = 0, forward = 1, speed = 0, reason = '' } = {}) {
  if (side > 0) return 'toe';
  if (side < 0) return 'heel';
  if (reason === 'hard landing') return 'slam';
  if (forward < 0) return 'tail';
  return speed > 19 ? 'roll' : 'nose';
}

// Every key filled in from the one before, so each control eases key to key.
const TRACKS = Object.fromEntries(Object.entries(FALL_KINDS).map(([kind, k]) => {
  let state = RIDE;
  const keys = [[0, RIDE], ...k.keys, ...GET_UP[k.rest]].map(([t, v]) => {
    const next = { ...state, ...v };
    // A whole turn is no turn: the spin eases the short way to each key.
    next.spin = state.spin + Math.atan2(Math.sin(next.spin - state.spin), Math.cos(next.spin - state.spin));
    return [t, state = next];
  });
  return [kind, keys];
}));
const mix = (a, b, s) => Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], s)) : lerp(a, b, s);

export function fallPose(time, motion = {}) {
  const kind = motion.kind || fallKind(motion);
  const keys = TRACKS[kind];
  let i = 0;
  while (i < keys.length - 2 && time >= keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  const s = smooth(time, t0, t1);
  const pose = {};
  for (const key of Object.keys(a)) pose[key] = mix(a[key], b[key], s);
  pose.kind = kind;
  pose.rest = FALL_KINDS[kind].rest;
  pose.phase = time < 0.28 ? 'impact' : time < FALL_SLIDE ? 'slide' : time < FALL_REST ? 'settle' : 'get-up';
  pose.hands = [pose.handL, pose.handR];
  // The left hand's planted weight, kept for the review and the tests.
  pose.plant = Math.max(pose.handL[0], pose.handR[0]);
  return pose;
}

// ---------- Placing it ----------
// Over on an edge the boots, which stand out past the board, touch first.
const HALF_WIDTH = 0.2, NOSE = 0.72, MIDDLE = 0.55;
const _R = new THREE.Quaternion(), _S = new THREE.Quaternion(), _Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const _e = new THREE.Euler(), _p = new THREE.Vector3(), _c = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

// The board's turn about what's touching the snow, in the board's (edge) frame:
// R and the offset that keeps the contact still.
function contact(pose, outQ, outOffset) {
  outQ.setFromEuler(_e.set(pose.pitch, 0, pose.bank));
  _p.set(-Math.sign(pose.bank) * HALF_WIDTH * Math.min(1, Math.abs(pose.bank) / 0.25), 0,
    Math.sign(pose.pitch) * NOSE * Math.min(1, Math.abs(pose.pitch) / 0.25));
  return outOffset.copy(_p).sub(_v.copy(_p).applyQuaternion(outQ));
}

// The board group (rider.edge): turned about its contact, then tumbled about the middle.
export function placeAssembly(edge, pose) {
  contact(pose, _R, _c);
  _S.setFromAxisAngle(X, pose.spin);
  edge.quaternion.copy(_S).multiply(_R);
  _p.set(0, MIDDLE, 0);
  edge.position.copy(_c).sub(_p).applyQuaternion(_S).add(_p);
}

// The pose controls, both riders' (the primitive one and the rig) shared
// handles: hips, torso, head and arms, in the body frame on the turned board.
export function applyFallPose(rider, pose) {
  contact(pose, _R, _c);
  // From the upright frame (body axes, on the snow) into the turned body's.
  const toBody = _q.copy(_Y).invert().multiply(_R.clone().invert());
  const hip = _v.set(pose.hip[2], pose.hip[0], pose.hip[1]).applyQuaternion(_Y).sub(_c).applyQuaternion(toBody);
  rider.hips.position.copy(hip);
  const hipsUp = new THREE.Quaternion().setFromEuler(_e.set(pose.pelvis, pose.turn, -pose.side * 0.6));
  rider.hips.quaternion.copy(toBody).multiply(_Y).multiply(hipsUp);
  const torsoUp = new THREE.Quaternion().setFromEuler(_e.set(pose.tilt, pose.turn * 1.5, -pose.side));
  rider.torso.quaternion.copy(hipsUp).invert().multiply(torsoUp);
  rider.head.rotation.set(pose.chin, pose.look, pose.side * 0.3);
  for (const [arm, [x, out, el], sign] of [[rider.armL, pose.armL, 1], [rider.armR, pose.armR, -1]]) {
    arm.sh.rotation.set(x, 0, sign * out);
    arm.el.rotation.set(el, 0, sign * 0.1);
  }
}

// Where a planted hand goes: x, z in the upright frame, on the snow.
export function handOnSnow(root, hand, hf, out = new THREE.Vector3()) {
  root.localToWorld(out.set(hand[2], 0, -hand[1]));
  out.y = hf.heightAt(out.x, out.z) + 0.06;
  return out;
}

// ---------- Shaking it off ----------
// After standing: a dog-like head shake, a brush down the sleeve and chest,
// then both hands sweeping snow off the thighs.
export function shakePose(time) {
  const t = Math.max(0, time);
  const shake = smooth(t, 0, 0.12) * (1 - smooth(t, 0.7, 1.0));
  const sleeve = smooth(t, 0.75, 0.9) * (1 - smooth(t, 1.35, 1.5));
  const thighs = smooth(t, 1.4, 1.55) * (1 - smooth(t, 2.15, SHAKE_DURATION));
  return {
    head: Math.sin(t * Math.PI * 2 * 3.2) * 0.55 * shake,
    nod: Math.sin(t * Math.PI * 2 * 6.4) * 0.08 * shake,
    shoulder: Math.sin(t * 23) * 0.09 * shake,
    sleeve,
    sleeveStroke: Math.sin((t - 0.75) * Math.PI * 2 * 2.6),
    thighs,
    thighStroke: Math.sin((t - 1.4) * Math.PI * 2 * 2.4),
  };
}

export function applyShakePose(rider, time) {
  const p = shakePose(time);
  rider.head.rotation.y += p.head;
  rider.head.rotation.x += p.nod;
  rider.head.rotation.z += p.shoulder * 0.5;
  rider.torso.rotation.z += p.shoulder;
  const blend = (arm, sh, el, w) => {
    arm.sh.rotation.set(lerp(arm.sh.rotation.x, sh[0], w), lerp(arm.sh.rotation.y, sh[1], w), lerp(arm.sh.rotation.z, sh[2], w));
    arm.el.rotation.set(lerp(arm.el.rotation.x, el[0], w), lerp(arm.el.rotation.y, el[1], w), lerp(arm.el.rotation.z, el[2], w));
  };
  // The right mitt crosses the body and sweeps down the left sleeve and chest;
  // the left arm holds out of its way.
  if (p.sleeve > 0) {
    const s = p.sleeveStroke;
    blend(rider.armR, [-0.85 + s * 0.35, 0, 0.55 + s * 0.15], [-1.55 - s * 0.25, 0, 0], p.sleeve);
    blend(rider.armL, [-0.35, 0, 0.55], [-0.3, 0, 0.1], p.sleeve);
    rider.head.rotation.x += -0.25 * p.sleeve; // watching the brush
    rider.head.rotation.y += -0.3 * p.sleeve;
  }
  // Bent over a little, both hands brush down the fronts of the thighs, in turn.
  if (p.thighs > 0) {
    const s = p.thighStroke;
    rider.torso.rotation.x += 0.35 * p.thighs;
    rider.head.rotation.x += -0.2 * p.thighs;
    blend(rider.armL, [-0.45 + s * 0.3, 0, 0.12], [-0.35 - s * 0.2, 0, 0], p.thighs);
    blend(rider.armR, [-0.45 - s * 0.3, 0, -0.12], [-0.35 + s * 0.2, 0, 0], p.thighs);
  }
}
