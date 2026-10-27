// How the horse moves: a gait whose footfalls, stride and timing follow its
// speed (walk, trot, canter, gallop), the body riding the stride, and the
// neck, tail and ears with it. The footfall timings are Muybridge's, from
// his photographs of horses in motion. Whoever drives the horse sets `speed`
// and `turnRate`; this poses the rig (rig.js) every frame.
//
// Everything here is in the model frame (see rig.js), in model units: the
// horse is about a unit long; `scale` says how many metres that is.
import * as THREE from 'three';
import { restPose } from './rig.js';
import { HorseIdle } from './idle.js';

const { clamp, lerp, smoothstep, euclideanModulo: mod } = THREE.MathUtils;
const TAU = Math.PI * 2;
const X = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// A leg's angles and joints, worked out by HorseBody's #stance.
const legAt = () => ({ hoof: new THREE.Vector3(), knee: new THREE.Vector3(), cannon: 0, pastern: 0, toe: 0, blade: 0 });
const _A = legAt(), _B = legAt(), _C = legAt(), _D = legAt(), _E = legAt();
const KEYS_AT = Array.from({ length: 7 }, legAt); // a swing's keyframes, with one beyond each end
const ANGLES = ['cannon', 'pastern', 'toe', 'blade'];

// A damped spring that follows a target: `hz` its own swing, `damp` how soon
// it settles (1 at once, less overshoots).
function spring(hz, damp) {
  return {
    x: 0, v: 0, hz, damp,
    step(target, dt, kick = 0) {
      const w = TAU * this.hz;
      this.v += (w * w * (target - this.x) - 2 * this.damp * w * this.v + kick) * dt;
      this.x += this.v * dt;
      return this.x;
    },
  };
}

// Catmull-Rom through p1 → p2, `t` of the way, p0 and p3 either side.
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

// The gaits, each as it goes at `speed` (m/s, at the game's size) and `hz`
// strides a second. By leg (front left, front right, hind left, hind right):
// when in the stride each hoof lands (`phase`), and how much of the stride
// it's down for (`duty`). Then, front and hind, how high a hoof lifts and how
// far the knee or hock folds in the swing, and how far past its landing a
// leg reaches before it comes back to land; how the body rides it (`bob2`
// dips twice a stride, `bob1` once, `low` carries it lower, `pitch` rocks it
// nose down, `flex` arches the back) and how the neck and tail go (radians
// down from standing, and raised from hanging).
//
// Matched against Muybridge's plates (626 gallop, 618 and 620 canter, 591
// trot): a horse runs on its legs, not its back. The topline stays level; the
// legs sweep long, the forelegs reaching out straight before they land and
// the hind legs trailing straight behind as they push off, folding tight only
// in the moment the four are gathered under the body. The neck is carried up
// and arched at the canter and reaches out low at the gallop, the head
// stretched out on it; the tail is carried out behind at the gallop and
// arched up at the canter.
//   walk: four beats, each hind followed by the fore on its side.
//   trot: diagonal pairs together, with a moment in the air between.
//   canter: three beats on the left lead: right hind, then left hind with
//     right fore, then the leading left fore, then in the air.
//   gallop: four beats on the left lead: right hind, left hind, right fore,
//     left fore, then in the air.
const GAITS = {
  walk: { phase: [0.25, 0.75, 0, 0.5], duty: 0.62, speed: 1.7, hz: 1.0, lift: [0.07, 0.05], fold: [1.0, 0.55], reach: [0.02, 0.01], bob2: 0.006, bob1: 0, low: 0, pitch: 0, flex: 0, roll: 0.02, neck: 0.06, nod2: 0.05, nod1: 0, rock: 0.25, tail: 0.1, ears: 0 },
  trot: { phase: [0, 0.5, 0.5, 0], duty: 0.38, speed: 3.8, hz: 1.45, lift: [0.1, 0.075], fold: [1.6, 0.85], reach: [0.04, 0.02], bob2: 0.012, bob1: 0, low: 0.004, pitch: 0.008, flex: 0, roll: 0, neck: 0.15, nod2: 0.015, nod1: 0, rock: 0.25, tail: 0.45, ears: 0 },
  canter: { phase: [0.6, 0.33, 0.33, 0], duty: 0.33, speed: 6.5, hz: 1.7, lift: [0.11, 0.08], fold: [1.6, 0.95], reach: [0.06, 0.03], bob2: 0.004, bob1: 0.012, low: 0.014, pitch: 0.02, flex: 0.01, roll: 0, neck: 0.1, nod2: 0, nod1: 0.08, rock: 0.32, tail: 1.0, ears: 0.1 },
  gallop: { phase: [0.5, 0.38, 0.12, 0], duty: 0.25, speed: 11, hz: 2.0, lift: [0.1, 0.08], fold: [1.7, 1.0], reach: [0.08, 0.04], bob2: 0.004, bob1: 0.012, low: 0.022, pitch: 0.02, flex: 0.015, roll: 0, neck: 0.4, nod2: 0, nod1: 0.08, rock: 0.2, tail: 1.3, ears: 0.15 },
};
export const GAIT_NAMES = Object.keys(GAITS);
const KEYS = ['duty', 'speed', 'hz', 'bob2', 'bob1', 'low', 'pitch', 'flex', 'roll', 'neck', 'nod2', 'nod1', 'rock', 'tail', 'ears'];

export class HorseBody {
  constructor(rig) {
    this.rig = rig;
    this.ref = rig.ref;
    this.P = restPose(rig);
    this.scale = 2.6; // metres per model unit
    this.speed = 0; // forward, model units/s
    this.turnRate = 0; // rad/s, + to its left
    this.phase = 0;
    this.gait = 0; // 0 walk … 1 trot … 2 canter … 3 gallop
    this.stride = 0; // how far into a stride the legs are (0 standing still … 1 striding)
    this.hz = 0;
    this.t = 0;
    // Each leg's place in its stride: down (1) or swinging (0), and where in it (0–1).
    this.legs = this.ref.legs.map(() => ({ plant: 1, at: 0 }));
    // Coronet to toe: at rest the toe is on the ground under the coronet.
    this.hoofLen = this.ref.legs.map((l) => l.hoof.y / Math.max(0.1, -l.toe.y));
    // Springs that make the neck and tail follow the body a moment late.
    this.springs = { neck: spring(3, 0.55), head: spring(3.5, 0.5), tail: spring(2.2, 0.35), swing: spring(1.8, 0.3) };
    this.hipsWas = this.ref.hips.y;
    // Standing, it fidgets (idle.js); `idling` off holds it still, to compare.
    this.idle = new HorseIdle();
    this.idling = true;
    this.I = this.idle.out;
    this.still = 1; // how much it's standing: 1 - stride, eased
  }

  // The gait the horse is in, by name (between two while it changes).
  get gaitName() {
    return GAIT_NAMES[Math.round(this.gait)];
  }

  update(dt) {
    this.t += dt;
    this.#gait(dt);
    this.I = this.idle.update(dt);
    this.still = this.idling ? 1 - this.stride : 0;
    this.#pose(this.#mix(), dt);
    this.rig.pose(this.P);
  }

  // The stride's timing follows the speed: walking, then trotting from about
  // 2.5 m/s, cantering from about 5, galloping from about 8.5.
  #gait(dt) {
    const u = Math.abs(this.speed) * this.scale; // m/s
    const want = smoothstep(u, 2.2, 2.8) + smoothstep(u, 4.8, 5.6) + smoothstep(u, 8, 9.5);
    this.gait += (want - this.gait) * (1 - Math.exp(-dt * 3));
    const moving = u > 0.1;
    this.stride += ((moving ? 1 : 0) - this.stride) * (1 - Math.exp(-dt * (moving ? 6 : 4)));
    const m = this.#mix();
    // Faster within a gait is mostly longer strides, a little quicker ones.
    this.hz = m.hz * clamp((Math.max(u, 0.3) / m.speed) ** 0.3, 0.7, 1.25);
    if (this.stride > 0.01) this.phase = mod(this.phase + this.hz * dt, 1);
    else this.phase = 0;
  }

  // The mix of the two gaits the horse is between.
  #mix() {
    const g = clamp(this.gait, 0, 3), i = Math.min(2, Math.floor(g)), f = g - i;
    const a = GAITS[GAIT_NAMES[i]], b = GAITS[GAIT_NAMES[i + 1]];
    const m = { phase: a.phase.map((p, k) => p + (mod(b.phase[k] - p + 0.5, 1) - 0.5) * f) };
    for (const k of KEYS) m[k] = lerp(a[k], b[k], f);
    m.lift = [0, 1].map((k) => lerp(a.lift[k], b.lift[k], f));
    m.fold = [0, 1].map((k) => lerp(a.fold[k], b.fold[k], f));
    m.reach = [0, 1].map((k) => lerp(a.reach[k], b.reach[k], f));
    return m;
  }

  // A planted hoof's leg, `along` its stance (0.5 landing … −0.5 lifting off)
  // and `at` that far through it: where the toe stands, the leg's sweep from
  // its top (the cannon follows it, the pastern a little less, sinking under
  // the weight), the hoof rolling over its toe at the end of the stance, the
  // shoulder blade swinging back with a foreleg. Angles about the model's x
  // from rest; then the coronet, and the top of the cannon (the knee or hock).
  #stance(i, along, at, m, out) {
    const leg = this.ref.legs[i], s = this.stride, [, , lc, lp] = this.rig.legs[i].len;
    const travel = (Math.abs(this.speed) * m.duty) / Math.max(this.hz, 0.1); // how far the body goes over a planted hoof
    // Forelegs land a little ahead of where they stand; hind legs push from a
    // little behind.
    const centre = (leg.front ? 0.015 : -0.01) * Math.min(1, travel * 4);
    const dz = (along * travel * (Math.sign(this.speed) || 1) + centre) * s;
    const sweep = Math.atan2(dz, leg.top.y - leg.hoof.y);
    const roll = smoothstep(at, 0.6, 1) * (leg.front ? 0.9 : 0.7) * s;
    const sink = (0.2 + 0.12 * this.gait) * Math.sin(Math.PI * at) * s; // deeper the faster it goes
    out.cannon = -sweep * 0.9;
    out.pastern = -sweep * 0.6 - sink + roll * 0.6;
    out.toe = roll;
    // (It swings back further than forward: forward, it would lift the shoulder
    // away from the ground.)
    out.blade = leg.front ? -sweep * (sweep < 0 ? 0.9 : 0.25) : 0;
    // The toe's spot on the ground, swinging round under the body against a turn.
    const tip = _v.copy(leg.hoof).addScaledVector(leg.toe, this.hoofLen[i]);
    tip.z += dz;
    tip.x -= this.turnRate * leg.hoof.z * along * (m.duty / Math.max(this.hz, 0.1)) * s;
    tip.y = 0;
    out.hoof.copy(tip).addScaledVector(_w.copy(leg.toe).applyQuaternion(_q.setFromAxisAngle(X, out.toe)), -this.hoofLen[i]);
    out.knee.copy(out.hoof)
      .addScaledVector(_w.copy(leg.pastern).applyQuaternion(_q.setFromAxisAngle(X, out.pastern)), -lp)
      .addScaledVector(_w.copy(leg.cannon).applyQuaternion(_q.setFromAxisAngle(X, out.cannon)), -lc);
    return out;
  }

  // A leg in the air, `q` of the way from lifting off to landing: its knee (or
  // hock) on a smooth path through keyframes, the cannon, pastern and hoof
  // turning through theirs. A foreleg folds up and forward under the chest,
  // then reaches out straight past where it will land and comes back to it. A
  // hind leg first trails out straight behind, then swings forward under the
  // belly, folding at the hock, and reaches. The paths run on from the stance
  // either side, so the leg doesn't jerk as it leaves or meets the ground.
  #swing(i, q, m, out) {
    const leg = this.ref.legs[i], k = leg.front ? 0 : 1, s = this.stride;
    const from = this.#stance(i, -0.5, 1, m, _A), to = this.#stance(i, 0.5, 0, m, _B);
    const before = this.#stance(i, -0.3, 0.8, m, _D), after = this.#stance(i, 0.3, 0.2, m, _E);
    const lift = m.lift[k] * s, reach = m.reach[k] * s, F = m.fold[k] * s;
    const key = (n, base, w, up, ahead, angles) => {
      const o = KEYS_AT[n];
      o.knee.lerpVectors(from.knee, to.knee, w);
      o.knee.y += up;
      o.knee.z += ahead;
      for (const a of ANGLES) o[a] = lerp(from[a], to[a], w) + (angles[a] ?? 0);
      return o;
    };
    const copy = (n, src) => { const o = KEYS_AT[n]; o.knee.copy(src.knee); for (const a of ANGLES) o[a] = src[a]; return o; };
    let times;
    copy(0, before);
    copy(1, from);
    if (leg.front) {
      times = [0, 0.4, 0.78, 1];
      key(2, from, 0.45, lift, 0, { cannon: F, pastern: 1.5 * F, toe: 1.7 * F });
      key(3, to, 1, lift * 0.3, reach, { cannon: -3 * reach, pastern: -4 * reach, toe: -3 * reach });
      copy(4, to);
      copy(5, after);
    } else {
      times = [0, 0.18, 0.55, 0.82, 1];
      key(2, from, 0, lift * 0.25, -reach * 0.6, { cannon: 2 * reach, pastern: 6 * reach, toe: 9 * reach });
      key(3, from, 0.6, lift, 0, { cannon: -0.45 * F, pastern: 1.2 * F, toe: 1.4 * F });
      key(4, to, 1, lift * 0.25, reach, { cannon: -3 * reach, pastern: -4 * reach, toe: -3 * reach });
      copy(5, to);
      copy(6, after);
    }
    // Which stretch of the path, and how far along it.
    let j = 0;
    while (j < times.length - 2 && q > times[j + 1]) j++;
    const t = clamp((q - times[j]) / (times[j + 1] - times[j]), 0, 1);
    const [p0, p1, p2, p3] = [KEYS_AT[j], KEYS_AT[j + 1], KEYS_AT[j + 2], KEYS_AT[j + 3]];
    out.knee.set(cr(p0.knee.x, p1.knee.x, p2.knee.x, p3.knee.x, t), cr(p0.knee.y, p1.knee.y, p2.knee.y, p3.knee.y, t), cr(p0.knee.z, p1.knee.z, p2.knee.z, p3.knee.z, t));
    for (const a of ANGLES) out[a] = cr(p0[a], p1[a], p2[a], p3[a], t);
    return out;
  }

  // A standing leg, fidgeting (see idle.js): a resting hind leg tips onto the
  // toe of its hoof, a little forward, the fetlock and hock bending; a stamp
  // lifts a hoof and puts it down again.
  #fidget(i, a, state) {
    const leg = this.ref.legs[i], w = this.still, [, , lc, lp] = this.rig.legs[i].len, len = this.hoofLen[i];
    const rest = this.I.rest[i] * w, lift = this.I.lift[i] * w;
    if (rest < 0.001 && lift < 0.001) return a;
    const tip = _v.copy(a.hoof).addScaledVector(_w.copy(leg.toe).applyQuaternion(_q.setFromAxisAngle(X, a.toe)), len);
    tip.z += 0.03 * rest;
    a.toe += 1.1 * rest + 0.9 * lift;
    a.pastern += 0.75 * rest + 0.8 * lift;
    a.cannon += -0.15 * rest + (leg.front ? 0.9 : -0.3) * lift;
    tip.y += 0.07 * lift;
    a.hoof.copy(tip).addScaledVector(_w.copy(leg.toe).applyQuaternion(_q.setFromAxisAngle(X, a.toe)), -len);
    a.knee.copy(a.hoof)
      .addScaledVector(_w.copy(leg.pastern).applyQuaternion(_q.setFromAxisAngle(X, a.pastern)), -lp)
      .addScaledVector(_w.copy(leg.cannon).applyQuaternion(_q.setFromAxisAngle(X, a.cannon)), -lc);
    if (lift > 0.05) state.plant = 0;
    return a;
  }

  // Each hoof slides back under the body as fast as the body goes over it while
  // it's down. Then the knee (or hock) carries it forward to land half a stride
  // ahead, rising, the cannon, pastern and hoof folding back under it and
  // opening again to land. The body rides it.
  #pose(m, dt) {
    const r = this.ref, P = this.P, s = this.stride;
    r.legs.forEach((leg, i) => {
      const L = P.legs[i], k = leg.front ? 0 : 1, state = this.legs[i], [, , lc, lp] = this.rig.legs[i].len;
      const p = mod(this.phase - m.phase[i], 1); // it lands as the stride reaches its phase
      let a;
      if (p < m.duty || s < 0.001) {
        state.plant = 1;
        state.at = s < 0.001 ? 0 : p / m.duty;
        a = this.#stance(i, 0.5 - state.at, state.at, m, _A);
      } else {
        state.plant = 0;
        state.at = (p - m.duty) / (1 - m.duty);
        a = this.#swing(i, state.at, m, _C);
      }
      if (state.plant && this.still > 0.001) a = this.#fidget(i, a, state);
      L.cannon.copy(leg.cannon).applyQuaternion(_q.setFromAxisAngle(X, a.cannon));
      L.pastern.copy(leg.pastern).applyQuaternion(_q.setFromAxisAngle(X, a.pastern));
      L.toe.copy(leg.toe).applyQuaternion(_q.setFromAxisAngle(X, a.toe));
      // In the air the hoof hangs from the knee; on the ground it stands.
      if (state.plant) L.hoof.copy(a.hoof);
      else {
        L.hoof.copy(a.knee).addScaledVector(L.cannon, lc).addScaledVector(L.pastern, lp);
        // A swinging toe never dips under the ground.
        L.hoof.y = Math.max(L.hoof.y, -L.toe.y * this.hoofLen[i]);
      }
      L.blade = a.blade;
    });

    // The body: dipping a little at each mid-stance at the walk and trot,
    // carried lower and rocking only gently at the canter and gallop. The
    // topline stays near level, as in Muybridge's plates: rocking it more is
    // what made it bound like a dog.
    const ph = this.phase;
    const first = m.phase.indexOf(Math.min(...m.phase)); // the leg that starts the stride
    const mid = ph - (m.phase[first] + m.duty / 2);
    P.hips.pos.copy(r.hips);
    P.hips.pos.y -= s * (m.low + m.bob2 * (0.5 + 0.5 * Math.cos(2 * TAU * mid)) + m.bob1 * (0.5 + 0.5 * Math.cos(TAU * (ph - 0.5))));
    const pitch = m.pitch * s * Math.sin(TAU * (ph - m.rock));
    const roll = m.roll * s * Math.sin(TAU * ph);
    // Standing, it breathes and shifts its weight, a hip dropped over a
    // resting leg.
    const I = this.I, w = this.still;
    P.hips.pos.x += I.sway * w;
    P.hips.pos.y += (0.0015 * I.breath - I.drop) * w;
    P.hips.quat.setFromEuler(_e.set(pitch, -this.turnRate * 0.05, roll + I.roll * w));
    // The back rounds a touch as the forelegs take the weight and stretches as
    // the hind legs reach under.
    P.bend.set(m.flex * s * Math.cos(TAU * (ph - m.rock - 0.33)) + 0.006 * I.breath * w, 0.15 * this.turnRate, 0);
    // The neck lowers with the speed, most at the gallop, dipping as the
    // forelegs land; at the gallop the head stretches out on it, nose forward,
    // a moment behind. Both follow on springs, so they flow rather than tick.
    const front = Math.min(m.phase[0], m.phase[1]);
    const run = clamp(this.gait - 2, 0, 1); // 0 cantering, with the neck up and arched … 1 galloping
    const hipsV = dt > 0 ? (P.hips.pos.y - this.hipsWas) / dt : 0;
    this.hipsWas = P.hips.pos.y;
    const sp = this.springs, h = Math.min(dt, 1 / 30);
    const neck = s * (m.neck + m.nod2 * Math.cos(2 * TAU * (ph - front - m.duty * 0.3)) + m.nod1 * Math.sin(TAU * (ph - m.rock))) - pitch * 0.6;
    P.neck.pitch = sp.neck.step(neck + I.neck * w, h);
    P.neck.turn = clamp(0.4 * this.turnRate, -0.5, 0.5) + I.turn * w;
    P.head = sp.head.step(-0.7 * s * m.neck - 0.15 * run * s + I.head * w, h) - 0.2 * (P.neck.pitch - s * m.neck - I.neck * w);
    P.ears[0] = m.ears * s + I.ears[0] * w;
    P.ears[1] = m.ears * s + I.ears[1] * w;
    // The tail lifts with the speed, out behind at the gallop, bouncing as the
    // body rises and falls, and swings a little with the stride and the turn.
    P.tail.lift = sp.tail.step(s * m.tail + I.tailLift * w, h, -hipsV * 40);
    P.tail.swing = sp.swing.step(s * 0.05 * Math.sin(TAU * ph) - 0.3 * this.turnRate + I.tailSwing * w, h);
  }
}
