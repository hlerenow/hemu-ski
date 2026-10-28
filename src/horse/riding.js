// How a rider rides the horse: the seat they're given (the saddle's cushion,
// stirrups and rein hands, as Rider.setLocomotion('sit') takes it) moved each
// frame as a rider's body goes with the horse, after Muybridge's plates of
// horses ridden at each gait (Animal Locomotion, 1887: 577 walking, 601
// trotting, 618 cantering, 626 and 634 galloping) and the feel of Red Dead
// Redemption's riders.
//
//   walk: sat quiet and upright, the pelvis going with the back's swing, the
//     upper body loose over it, the hands following the head's nod.
//   trot: a sitting trot: the pelvis and the small of the back take the
//     bounce, the shoulders nodding a little at each beat, the head level.
//   canter: sat deep, the pelvis rocking with the stride and the hips
//     sliding with it, the upper body staying upright over them.
//   gallop: a half-seat: up off the cushion as far as the stirrups let,
//     folded forward with the hands down by the crest, the legs taking the
//     bounce so the body rides steady while the horse moves under it.
//
// On top of that the rider leans into a turn, sits back as the horse slows
// and forward as it quickens, and while it stands, fidgets (looks round,
// shifts in the saddle, pats the neck, stretches).
//
// The reactions come from how the saddle itself moves (its bounce, pitch and
// roll against their running averages, and how hard it heaves up) and from
// the bit's nod, so they keep in step with whatever the gaits do. Metres and
// radians, in the saddle's frame (+z forward, +x the horse's left, +y up).
import * as THREE from 'three';
import { reachFold } from '../player/rider.js';
import { random, Drift, Every } from './idle.js';
import { spring, GAIT_NAMES } from './body.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const TAU = Math.PI * 2;
const G = 9.81;
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _h = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();

// Each gait's way of riding: how far the pelvis follows the saddle's pitch and
// roll (times the saddle's own), how far it swings round with the walk
// (radians) and the hips slide with the pitch (metres a radian); how much the
// shoulders nod at the saddle's heave (radians a g) and how much of the
// saddle's and pelvis's pitch the upper body takes back to stay upright; the
// fold forward (radians, beyond what the hands need) and the least it folds
// (the half-seat's lean, whatever the rider's arms); the half-seat's lift off
// the cushion (metres, as far as the legs reach) and back over the stirrups,
// and how much of the saddle's bounce the legs take out; how far the hands
// follow the bit's nod, and reach forward and down (metres) from where they
// ride (HANDS) toward the crest.
const STYLE = {
  walk: { pitch: 1.0, roll: 1.4, swing: 0.06, slide: 0, nod: 0.12, upright: 0.6, fold: 0.02, least: 0, lift: 0, back: 0, absorb: 0, hands: 0.7, reach: 0, drop: 0 },
  trot: { pitch: 2.0, roll: 1.0, swing: 0, slide: 0, nod: 0.09, upright: 0.7, fold: 0.06, least: 0, lift: 0, back: 0, absorb: 0, hands: 0.3, reach: 0, drop: 0 },
  canter: { pitch: 3.5, roll: 1.0, swing: 0, slide: 0.5, nod: 0.05, upright: 0.85, fold: 0.04, least: 0, lift: 0, back: 0, absorb: 0, hands: 0.7, reach: 0.01, drop: 0 },
  gallop: { pitch: 0.6, roll: 0.5, swing: 0, slide: 0, nod: 0.03, upright: 0.5, fold: 0, least: 0.8, lift: 0.1, back: 0.03, absorb: 0.75, hands: 0.3, reach: 0.1, drop: 0.03 },
};
const KEYS = Object.keys(STYLE.walk);

// Where the hands ride, from the seat's grips (metres: forward, up): in and
// low over the pommel, so the rider sits up as Muybridge's do rather than
// leaning after reins held out in front.
const HANDS = [-0.15, 0.01];

// Where the right hand pats the neck, just in front of the pommel on the
// horse's right (metres, the saddle's frame).
const NECK = new THREE.Vector3(-0.07, 1.66, 0.14);

// How far a knee may open in the half-seat, standing in the stirrups at
// their riding length: the hip joint to the ankle no more than this much of
// the leg, straight (about 157° at the knee).
const REACH = 0.985;

// Exponentially weighted average, `tau` seconds.
const follow = (avg, x, dt, tau) => avg + (x - avg) * (1 - Math.exp(-dt / tau));

export class RidingMotion {
  constructor(seed = 11) {
    // The seat to give the rider: `base` moved, with `tilt` (the pelvis's
    // pitch, turn and roll) and `look` (the head's) on top of the seated pose.
    this.seat = { hips: new THREE.Vector3(), feet: [new THREE.Vector3(), new THREE.Vector3()], grips: [new THREE.Vector3(), new THREE.Vector3()],
      kneeOut: 0.45, fold: 0, tilt: new THREE.Euler(), look: new THREE.Euler() };
    this.lean = 0; // for the rider's state: + to the left, into a turn
    this.twist = 0; // the shoulders turning (+ left), as Rider's steering twist
    this.style = { ...STYLE.walk };
    this.styles = structuredClone(STYLE); // each gait's, to adjust while reviewing
    // The saddle's motion against its running average.
    this.avg = null;
    this.was = { y: 0, v: 0 };
    this.heave = 0; // vertical acceleration, g, a little smoothed
    this.bitAvg = new THREE.Vector3();
    this.springs = { shoulders: spring(2.6, 0.45), speed: spring(0.7, 0.9), bank: spring(1.2, 0.8) };
    this.speedWas = null;
    // Standing fidgets.
    const r = (this.rand = random(seed));
    this.idle = {
      lookTurn: new Drift(r, -0.55, 0.55, [2, 6], 0.45),
      lookUp: new Drift(r, -0.12, 0.12, [3, 7], 0.6),
      shift: new Drift(r, -1, 1, [3, 9], 0.9),
      pat: new Every(r, [10, 28], 3.2),
      stretch: new Every(r, [18, 40], 2.6),
      glance: new Every(r, [12, 30], 2.4),
      settle: new Every(r, [20, 50], 1.3),
      gather: new Every(r, [7, 18], 1.0),
    };
    this.t = 0;
    this.weight = 0; // eases the riding in once seated
  }

  // Starts again from the saddle as it is, as after mounting.
  reset() {
    this.avg = null;
    this.speedWas = null;
  }

  // How the rider sits on `base` (the tack's seat) on a horse standing
  // still, hands where they ride: where mounting ends and dismounting starts.
  rest(base, build) {
    const seat = { hips: base.hips.clone(), feet: base.feet.map((p) => p.clone()), grips: base.grips.map((p) => p.clone().add(_t.set(0, HANDS[1], HANDS[0]))), kneeOut: base.kneeOut };
    seat.fold = reachFold(build, _h.copy(seat.hips).setY(seat.hips.y + build.seat), seat.grips[0]);
    return seat;
  }

  // The seat for now, `dt` s on: `body` the HorseBody, `base` the tack's seat,
  // `saddle` its metre frame's world matrix, `bit` the bit's middle in that
  // frame, `build` the rider's (Rider.build).
  update(dt, body, base, saddle, bit, build) {
    this.t += dt;
    this.weight = Math.min(1, this.weight + dt / 0.6);
    const w = smoothstep(this.weight, 0, 1);
    const st = this.style, s = body.stride, still = 1 - s;
    // The gaits' ways of riding, blended as the horse changes between them.
    const g = clamp(body.gait, 0, 3), i = Math.min(2, Math.floor(g)), f = g - i;
    const a = this.styles[GAIT_NAMES[i]], b = this.styles[GAIT_NAMES[i + 1]];
    for (const k of KEYS) st[k] = lerp(a[k], b[k], f) * s;

    // The saddle: where the seat is (world) and how it's turned, against
    // their averages over the last half second or so.
    _p.copy(base.hips).applyMatrix4(saddle);
    _e.setFromRotationMatrix(_m.extractRotation(saddle));
    const now = { y: _p.y, pitch: _e.x, roll: _e.z };
    if (!this.avg) {
      this.avg = { ...now };
      this.was = { y: now.y, v: 0 };
      this.bitAvg.copy(bit);
    }
    const tau = 0.6;
    for (const k of ['y', 'pitch', 'roll']) this.avg[k] = follow(this.avg[k], now[k], dt, tau);
    this.bitAvg.set(follow(this.bitAvg.x, bit.x, dt, tau), follow(this.bitAvg.y, bit.y, dt, tau), follow(this.bitAvg.z, bit.z, dt, tau));
    const bob = now.y - this.avg.y, pitch = now.pitch - this.avg.pitch, roll = now.roll - this.avg.roll;
    if (dt > 0) {
      const v = (now.y - this.was.y) / dt;
      this.heave = follow(this.heave, (v - this.was.v) / dt / G, dt, 0.04);
      this.was = { y: now.y, v };
    }
    const nod = _n.subVectors(bit, this.bitAvg); // the bit against its average

    // The pelvis goes with the saddle: rocking with its pitch, rolling with
    // its roll, swinging round with the walk; the hips slide with the rock.
    const tilt = this.seat.tilt;
    tilt.x = st.pitch * pitch;
    tilt.z = st.roll * roll;
    tilt.y = st.swing * Math.sin(TAU * (body.phase + 0.25));
    // The upper body: back upright over the pelvis's and saddle's pitch, and
    // nodding forward as the saddle heaves up under it, a moment late.
    const shoulders = this.springs.shoulders.step(-st.upright * (tilt.x + pitch) + st.nod * this.heave, dt);

    // Quickening leans the rider forward, slowing sits them back and the
    // hands come back on the reins; a turn leans them into it.
    const speed = Math.abs(body.speed) * body.scale;
    const smooth = this.springs.speed.step(speed, dt);
    const accel = dt > 0 && this.speedWas !== null ? (smooth - this.speedWas) / dt : 0;
    this.speedWas = smooth;
    const urge = clamp(accel * 0.05, -0.22, 0.18);
    const brake = clamp(-accel * 0.012, 0, 0.06);
    const bank = this.springs.bank.step(clamp(body.turnRate * speed * 0.06, -0.3, 0.3), dt);

    // Standing: fidgets.
    const fid = this.#fidget(dt, still);

    // The seat: hips, hands and feet.
    const seat = this.seat;
    seat.kneeOut = base.kneeOut;
    seat.feet.forEach((p, k) => p.copy(base.feet[k]));
    seat.hips.copy(base.hips);
    seat.hips.z += (-st.back + st.slide * pitch) * w;
    // Up off the cushion as far as the legs reach, the legs taking out the
    // saddle's bounce; never down into it.
    const most = this.#lift(seat.hips, base, build);
    seat.hips.y += (clamp(Math.min(st.lift, most) - st.absorb * bob, 0, most) + fid.settle) * w;
    seat.hips.x += fid.shift * 0.015 * still * w;
    seat.grips.forEach((p, k) => {
      p.copy(base.grips[k]);
      // The hands follow the bit: down and forward as the head goes down.
      p.y += (HANDS[1] + st.hands * 0.5 * nod.y - st.drop) * w;
      p.z += (HANDS[0] - st.hands * 0.6 * nod.y + st.reach - brake + fid.gather) * w;
      p.y += fid.gather * 0.5 * w;
    });
    if (fid.pat > 0) seat.grips[1].lerp(_t.copy(NECK).setY(NECK.y + 0.03 * Math.abs(Math.sin(TAU * 1.6 * fid.patT))), fid.pat * w);

    // The fold: as far as the hands need (reachFold), the gait's, the
    // shoulders', quickening and slowing (sitting back a little past where
    // the arms reach, braced on the reins), fidgets; the half-seat's lean.
    const hips = _h.copy(seat.hips).setY(seat.hips.y + build.seat);
    const need = reachFold(build, hips, seat.grips[0]), dyn = (shoulders + urge) * w;
    const own = reachFold(build, _p.copy(base.hips).setY(base.hips.y + build.seat), base.grips[0]);
    seat.fold = Math.max(lerp(own, need, w) + (st.fold + fid.fold) * w + dyn, lerp(own, st.least, w) + dyn);
    if (fid.pat > 0) seat.fold = Math.max(seat.fold, reachFold(build, hips, seat.grips[1]));

    // Shoulders square over the rolling pelvis and saddle; into a turn.
    this.lean = ((roll + tilt.z) * st.upright * 0.8 + bank + fid.lean) * w;
    this.twist = (-tilt.y * 4 + fid.twist) * w;
    tilt.x *= w; tilt.y *= w; tilt.z *= w;
    // The head keeps the eyes level and looks where the rider looks.
    const look = seat.look;
    look.x = (-0.85 * (pitch + tilt.x) + fid.lookUp) * w;
    look.y = (fid.lookTurn + body.turnRate * 0.25) * w;
    look.z = 0;
    return seat;
  }

  // How far the hips can rise from `hips` (metres) with the feet still in
  // their stirrups and the knees no straighter than REACH.
  #lift(hips, base, build) {
    if (!build.leg || !build.hip) return 0;
    let most = 0.3;
    for (const [k, side] of [[0, 1], [1, -1]]) {
      const foot = base.feet[k];
      const [out, down] = build.hip;
      const dx = hips.x + side * out - foot.x, dz = hips.z - foot.z;
      const y0 = hips.y + build.seat - down - (foot.y + build.ankle);
      const room = (REACH * build.leg) ** 2 - dx * dx - dz * dz;
      most = Math.min(most, room > 0 ? Math.sqrt(room) - y0 : 0);
    }
    return Math.max(0, most);
  }

  // What a rider does sitting on a standing horse, `quiet` (1 standing … 0
  // moving): looks round, shifts their weight, now and then pats its neck,
  // stretches, glances back, settles in the saddle, gathers the reins. One at
  // a time.
  #fidget(dt, quiet) {
    const I = this.idle, out = { lookTurn: 0, lookUp: 0, shift: 0, fold: 0, lean: 0, twist: 0, settle: 0, gather: 0, pat: 0, patT: 0 };
    out.lookTurn = I.lookTurn.update(dt);
    out.lookUp = I.lookUp.update(dt);
    out.shift = I.shift.update(dt);
    out.lean = -out.shift * 0.04;
    out.fold = 0.012 * Math.sin((TAU * this.t) / 4.5); // breathing
    // Only one of the bigger moves at a time, and only standing: the others
    // wait their turn.
    const busy = ['pat', 'stretch', 'glance', 'settle', 'gather'].find((k) => I[k].t !== null);
    for (const k of ['pat', 'stretch', 'glance', 'settle', 'gather']) {
      if ((busy && busy !== k) || (quiet < 0.9 && I[k].t === null)) { I[k].wait = Math.max(I[k].wait, 1); continue; }
      const t = I[k].update(dt);
      if (t === null) continue;
      const len = I[k].length, k1 = Math.sin(Math.PI * clamp(t / len, 0, 1)), on = smoothstep(t, 0, 0.5) * (1 - smoothstep(t, len - 0.5, len));
      if (k === 'pat') { out.pat = on; out.patT = t; out.lookTurn = lerp(out.lookTurn, -0.35, on); out.lookUp += 0.25 * on; }
      if (k === 'stretch') { out.fold -= 0.16 * k1; out.lookUp -= 0.2 * k1; out.twist += 0.4 * Math.sin(TAU * t / len) * k1; }
      if (k === 'glance') { const way = I.glance.which < 0.5 ? 1 : -1; out.twist += way * 1.6 * k1; out.lookTurn = lerp(out.lookTurn, way * 1.1, k1); }
      if (k === 'settle') out.settle = 0.03 * Math.sin(Math.PI * clamp(t / len, 0, 1));
      if (k === 'gather') out.gather = -0.04 * k1;
    }
    for (const k of Object.keys(out)) if (k !== 'patT') out[k] *= quiet;
    return out;
  }
}
