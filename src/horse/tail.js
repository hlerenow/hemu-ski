// The horse's tail hanging and swinging: the follow-through Blender's Damped
// Track down a wiggle chain would give, but worked out live, so it answers the
// gait, the speed, the turns and the standing swishes. HorseRig (rig.js) poses
// the tail where the horse holds it; this hangs the hair from that, and the
// rig points each bone at the next joint.
//
// Model frame and units, as in rig.js.
import * as THREE from 'three';

const { clamp } = THREE.MathUtils;
const TAU = Math.PI * 2;
// Each segment, root to tip, follows the one before on a spring: how fast it
// swings back (hz) and how soon it settles (1 at once, less overshoots).
// Stiff at the dock, which the horse holds with its muscles; looser down the
// hair, which only hangs.
const HZ = [6, 4.5, 2.6, 2.2, 2.0];
const DAMP = [0.7, 0.6, 0.6, 0.6, 0.55];
// How thick the hair is round its bones, and the hind legs round the shin,
// cannon and pastern, seen from the side; and how far either side of a leg
// the hair spreads across it. A leg running into the hair pushes it back, on
// a stiff spring (BUMP hz), so it gives rather than bounces.
const HAIR = 0.04, LEG = [0.035, 0.03, 0.03], SPREAD = 0.11, BUMP = 9;
// How hard the wind shakes the end of the hair at full flutter (units/s²).
const FLUTTER = 8;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = [0, 1, 2, 3].map(() => new THREE.Vector3()), _on = new THREE.Vector3(), _to = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _q1 = new THREE.Vector3();

export class TailChain {
  // `len` each segment's length, root to tip.
  constructor(len) {
    this.len = len;
    const joints = () => Array.from({ length: len.length + 1 }, () => new THREE.Vector3());
    this.at = joints(); // where each joint is now
    this.v = joints(); // and how fast it's going
    this.was = new THREE.Vector3(); // the root, last frame
    this.t = 0;
    this.live = false;
  }

  // Each joint past the root is a weight on a damped spring, pulled to where
  // the held pose (`want`, root to tip) puts it from the joint before, turned
  // round with that segment as it hangs now: so a bob of the hips or a quick
  // turn runs down the tail as a wave, each segment a little later and looser
  // than the one before. Gravity and the horse's own going (`push`, `spin`)
  // pull on every joint, so the hair droops behind a raised dock and streams
  // back at speed; `flutter` shakes its end. `legs` are the hind legs' joints
  // (hip end to hoof), for the hair to keep behind. `dt` 0 holds it still.
  follow(want, legs, { push, spin, flutter }, dt) {
    const { at, v, len } = this, n = len.length;
    if (!this.live) {
      at.forEach((p, i) => p.copy(want[i]));
      v.forEach((u) => u.set(0, 0, 0));
      this.was.copy(want[0]);
      this.live = true;
    }
    if (!(dt > 0)) return at;
    const steps = Math.ceil(dt * 120), h = dt / steps;
    v[0].subVectors(want[0], this.was).divideScalar(dt);
    for (let k = 1; k <= steps; k++) {
      this.t += h;
      at[0].lerpVectors(this.was, want[0], k / steps);
      for (let i = 1; i <= n; i++) {
        const s = i - 1, w = TAU * HZ[s];
        const dir = _a.subVectors(want[i], want[i - 1]).normalize();
        if (i > 1) dir.applyQuaternion(_q.setFromUnitVectors(_b.subVectors(want[i - 1], want[i - 2]).normalize(), _c.subVectors(at[i - 1], at[i - 2]).normalize()));
        const acc = _d.copy(at[i - 1]).addScaledVector(dir, len[s]).sub(at[i]).multiplyScalar(w * w)
          .addScaledVector(_b.subVectors(v[i], v[i - 1]), -2 * DAMP[s] * w)
          .add(push);
        // Turning faster or slower, the horse swings round under the hair.
        acc.x -= spin * at[i].z;
        acc.z += spin * at[i].x;
        if (flutter) {
          const f = flutter * FLUTTER * (i / n) ** 2, t = this.t;
          acc.x += f * (Math.sin(TAU * 4.7 * t + i * 1.7) + 0.6 * Math.sin(TAU * 7.9 * t + i * 2.9));
          acc.y += f * (Math.sin(TAU * 3.9 * t + i * 2.3) + 0.6 * Math.sin(TAU * 6.8 * t + i * 0.7));
        }
        if (i > 1) for (const leg of legs) this.#bump(i, leg, acc);
        const from = _c.copy(at[i]);
        v[i].addScaledVector(acc, h);
        at[i].addScaledVector(v[i], h);
        this.#keep(i);
        v[i].subVectors(at[i], from).divideScalar(h);
      }
    }
    this.was.copy(want[0]);
    return at;
  }

  // Joint i keeps its segment's length from the joint before.
  #keep(i) {
    const { at } = this;
    at[i].sub(at[i - 1]).setLength(this.len[i - 1]).add(at[i - 1]);
  }

  // A hind leg's shin, cannon or pastern running into the hair's segment
  // ending at joint i (seen from the side) pushes that joint back off it. The
  // hair belongs behind the legs: a leg that has swung through it still
  // pushes it back, not on forward, but no harder than a little way in.
  #bump(i, leg, acc) {
    const { at, v } = this, [p0, p1, q0, q1] = _p, w = TAU * BUMP;
    p0.copy(at[i - 1]).setX(0);
    p1.copy(at[i]).setX(0);
    for (let k = 0; k < 3; k++) {
      q0.copy(leg[k]).setX(0);
      q1.copy(leg[k + 1]).setX(0);
      const s = closest(p0, p1, q0, q1, _on, _to);
      const across = Math.abs(at[i - 1].x + (at[i].x - at[i - 1].x) * s - (leg[k].x + leg[k + 1].x) / 2);
      if (across > SPREAD) continue;
      // Behind the leg, the hair is pushed straight off it; caught in front
      // of it (within a hair's breadth), it's pushed square off the leg toward
      // its back.
      const off = _on.sub(_to), back = _q1.set(0, q0.z - q1.z, q1.y - q0.y).normalize();
      if (back.z > 0) back.negate();
      const R = HAIR + LEG[k], d = off.length(), front = back.z < -0.3 && off.dot(back) < 0;
      if (front ? d > 2 * R : d >= R) continue;
      const gap = Math.min(front ? R + d : R - d, 0.06);
      if (front || d < 1e-5) off.copy(back);
      else off.divideScalar(d);
      // The joint takes its share of the push where the leg meets the
      // segment (the joint before takes the rest, as the end of its own), and
      // is slowed going into it.
      acc.addScaledVector(off, s * (w * w * gap - 2 * 0.8 * w * Math.min(0, v[i].dot(off))));
    }
  }
}

// The closest points of segments p0–p1 and q0–q1: `on` on the first, `to` on
// the second. Returns how far along the first it is (0–1).
function closest(p0, p1, q0, q1, on, to) {
  const d1 = _u.subVectors(p1, p0), d2 = _w.subVectors(q1, q0), r = _x.subVectors(p0, q0);
  const a = d1.dot(d1), e = Math.max(d2.dot(d2), 1e-12), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2);
  const den = a * e - b * b;
  let s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = clamp(-c / a, 0, 1);
  } else if (t > 1) {
    t = 1;
    s = clamp((b - c) / a, 0, 1);
  }
  on.copy(p0).addScaledVector(d1, s);
  to.copy(q0).addScaledVector(d2, t);
  return s;
}
