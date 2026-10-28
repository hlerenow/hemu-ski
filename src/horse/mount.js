// Mounting and dismounting the horse (the game's, and its review page's):
// the rider stays in the seated pose throughout, but the seat's targets
// travel. Standing on the horse's left facing it, the left hand on the front
// of the saddle and the right on the back, the left foot goes into its
// stirrup; the rider pushes up, swings the right leg over the croup, turns to
// face forward and settles into the saddle, the right foot finding its
// stirrup. The game's own seated IK does the posing. Dismounting plays the
// same tracks backwards.
//
// Everything is in metres in the horse's frame, as the tack's seat is
// (tack.js): +z forward, +x the horse's left, +y up. Throughout, the
// rider's root stays where the rider stands, turning about it, so neither end
// jumps: standing there is the same root, and the seat at the end is the same
// pose from another root.
import * as THREE from 'three';
import { reachFold } from '../player/rider.js';

const Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Vector3();
export const MOUNT_TIME = 3; // seconds
const TOE_OUT = THREE.MathUtils.degToRad(15); // as the tack hangs the irons, and the boots turn
// Which way the left boot points as it goes into its iron (radians left of
// straight ahead): a little in toward the horse, the iron turned to meet it,
// so the boot comes in from behind and outside the cloth.
const ENTRY = -0.2;
// Where a rider stands to mount: beside the horse's left, by the stirrup, facing
// it (turned -90° from facing forward), between the saddle's pommel and cantle.
export const STAND_AT = new THREE.Vector3(0.64, 0, -0.34);

// Where the hands hold the saddle (the palms' middles, metres): on the ground,
// the wooden arch of the pommel's left side and the cantle's left wing, as
// high as the riders' short arms reach from there; risen in the stirrup, the
// pommel's knob and the cantle's top. A palm's middle is about 2 cm off what
// the hand holds.
const HOLD = {
  pommelSide: [0.215, 1.47, -0.05], cantleSide: [0.25, 1.52, -0.55],
  pommel: [0.035, 1.675, -0.05], cantle: [0.04, 1.75, -0.585],
  // The right hand moves off the cantle before the right leg comes over it,
  // onto the back of the pommel's knob beside the left.
  pommelBack: [-0.045, 1.665, -0.10],
};

// A keyframed track: [[u, x, y, z], ...] through each key on a monotone cubic
// (Fritsch–Carlson) per axis, so it flows on through a key rather than
// stopping at each, never overshoots one (a hand stays on its hold, a foot
// out of its iron's bars), stays put between equal keys, and eases in and out
// at the ends.
function trackOf(keys) {
  const n = keys.length, us = keys.map((k) => k[0]);
  const slopes = [1, 2, 3].map((c) => {
    const d = [];
    for (let j = 0; j < n - 1; j++) d.push((keys[j + 1][c] - keys[j][c]) / (us[j + 1] - us[j]));
    const m = [0];
    for (let j = 1; j < n - 1; j++) m.push(d[j - 1] * d[j] <= 0 ? 0 : (d[j - 1] + d[j]) / 2);
    m.push(0);
    for (let j = 0; j < n - 1; j++) {
      if (d[j] === 0) { m[j] = m[j + 1] = 0; continue; }
      const a = m[j] / d[j], b = m[j + 1] / d[j], h = Math.hypot(a, b);
      if (h > 3) { m[j] = (3 * a * d[j]) / h; m[j + 1] = (3 * b * d[j]) / h; }
    }
    return m;
  });
  return (u, out) => {
    if (u <= us[0]) return out.set(keys[0][1], keys[0][2], keys[0][3]);
    if (u >= us[n - 1]) return out.set(keys[n - 1][1], keys[n - 1][2], keys[n - 1][3]);
    let j = 0;
    while (u > us[j + 1]) j++;
    const w = us[j + 1] - us[j], t = (u - us[j]) / w, t2 = t * t, t3 = t2 * t;
    const v = [1, 2, 3].map((c, i) => (2 * t3 - 3 * t2 + 1) * keys[j][c] + (t3 - 2 * t2 + t) * w * slopes[i][j]
      + (-2 * t3 + 3 * t2) * keys[j + 1][c] + (t3 - t2) * w * slopes[i][j + 1]);
    return out.set(v[0], v[1], v[2]);
  };
}

// The tracks, from standing (u 0) with the hips `standY` over the ground (as the
// seat places them, less the build's lift) to seated on `S`, the tack's seat
// (u 1), where the torso folds `seatFold` forward.
function mountTracks(S, standY, seatFold) {
  const v = (p) => [p.x, p.y, p.z];
  const { x: sx, z: sz } = STAND_AT, sy = standY;
  const L = v(S.feet[0]), R = v(S.feet[1]);
  // On the left iron's line as the foot goes in, `back` metres behind where
  // the foot rests in it and `up` above: the boot's middle sits 3 cm out from
  // the spot its sole is placed by while it points across the body.
  const onIron = (back, up) => [L[0] - back * Math.sin(ENTRY) - 0.03 * Math.min(1, back / 0.1), L[1] + up, L[2] - back * Math.cos(ENTRY)];
  return {
    // Keep the grounded foot down while both hands settle on the saddle and
    // the left foot finds the stirrup, leaning back off the horse to lift it.
    // Only then does the rider push up,
    // rising beside the horse until the left leg is straight in its stirrup,
    // then leaning over the saddle,
    // crouched low enough for the hands to stay on it, and settle in.
    hips: trackOf([[0, sx, sy, sz], [0.18, sx, sy, sz], [0.25, sx + 0.06, sy - 0.01, sz], [0.34, sx - 0.02, sy + 0.02, sz], [0.47, sx - 0.07, 1.06, sz], [0.53, 0.52, 1.45, sz - 0.01], [0.60, 0.42, 1.66, sz - 0.01], [0.67, 0.24, 1.66, sz - 0.02],
      [0.78, 0.12, 1.68, sz - 0.03], [0.94, S.hips.x, S.hips.y - 0.03, S.hips.z], [1, ...v(S.hips)]]),
    feet: [
      // The left foot comes up in front of the rider, clear of the iron, to
      // just behind it, the toe clear of the tread; slides in toe first through
      // its window, above the tread; settles onto it, and stays in it.
      trackOf([[0, sx + 0.06, 0.03, sz + 0.13], [0.13, sx + 0.06, 0.03, sz + 0.13], [0.22, sx - 0.06, 0.74, onIron(0.26, 0)[2]],
        [0.28, ...onIron(0.24, 0.07)], [0.32, ...onIron(0.01, 0.045)], [0.34, ...L], [1, ...L]]),
      // The right foot pushes off, swings up behind and over the croup clear
      // of the cantle, and comes into its iron from behind.
      trackOf([[0, sx - 0.05, 0.03, sz - 0.13], [0.40, sx - 0.05, 0.03, sz - 0.13], [0.55, sx - 0.08, 0.55, sz - 0.26], [0.66, 0.36, 1.45, -0.80],
        [0.76, 0.05, 1.74, -0.86], [0.85, -0.28, 1.58, -0.66], [0.93, R[0] - 0.01, R[1] + 0.05, R[2] - 0.13], [1, ...R]]),
    ],
    // Which way each foot points (radians left of straight ahead, in the
    // horse's frame, before the boots' own turn out; x only). On the ground
    // with the body; the left one toward the girth going into its iron, not
    // into the horse, then straight as the rider comes round.
    headings: [trackOf([[0, -Math.PI / 2, 0, 0], [0.14, -Math.PI / 2, 0, 0], [0.27, ENTRY - TOE_OUT, 0, 0], [0.34, ENTRY - TOE_OUT, 0, 0], [0.6, -0.1, 0, 0], [0.92, 0, 0, 0]]), null],
    // The hands, from just in front of the thighs (not hanging straight down
    // and back, where the arm can't tell which way its elbow bends), come up
    // in front of the chest, over the left iron, to the saddle.
    grips: [trackOf([[0, sx - 0.1, 0.95, sz + 0.2], [0.10, sx - 0.12, 1.28, sz + 0.22], [0.20, ...HOLD.pommelSide], [0.40, ...HOLD.pommelSide], [0.55, ...HOLD.pommel], [0.76, ...HOLD.pommel], [1, ...v(S.grips[0])]]),
      trackOf([[0, sx - 0.1, 0.95, sz - 0.2], [0.10, sx - 0.12, 1.28, sz - 0.18], [0.20, ...HOLD.cantleSide], [0.40, ...HOLD.cantleSide], [0.55, ...HOLD.cantle], [0.62, ...HOLD.cantle], [0.70, ...HOLD.pommelBack], [0.84, ...HOLD.pommelBack], [1, ...v(S.grips[1])]])],
    // How far the torso folds forward (radians; x only), not left to the
    // hands' reach, which can't reach some holds from where the hips are and
    // would bow right over: a little leaning in to the saddle, more pushing
    // up, right over it crouched in the stirrup, then into the seated lean.
    fold: trackOf([[0, 0.12, 0, 0], [0.18, 0.25, 0, 0], [0.24, 0.4, 0, 0], [0.3, 0.4, 0, 0], [0.38, 0.28, 0, 0], [0.46, 0.4, 0, 0],
      [0.54, 0.85, 0, 0], [0.6, 1.1, 0, 0], [0.8, 1.1, 0, 0], [0.87, 0.75, 0, 0], [0.94, seatFold, 0, 0]]),
    kneeOut: trackOf([[0, 0.15, 0, 0], [0.2, 1.4, 0, 0], [0.40, 1.2, 0, 0], [0.62, 0.8, 0, 0], [0.80, 0.55, 0, 0], [1, S.kneeOut, 0, 0]]),
  };
}

export class Mount {
  // `rider` a Rider, `tack` the horse's Tack, `seated()` the seat a
  // rider sits on once up (in the tack's frame, with its `fold`).
  constructor(rider, tack, seated) {
    this.rider = rider;
    this.tack = tack;
    this.seated = seated;
    // The seat whose targets the tracks move.
    this.seat = { hips: new THREE.Vector3(), feet: [new THREE.Vector3(), new THREE.Vector3()], grips: [new THREE.Vector3(), new THREE.Vector3()], kneeOut: 0.15, toes: [0, 0],
      tilt: new THREE.Euler(), look: new THREE.Euler() };
    this.from = null; // the pose a dismount eases out of
    this.leftIron = new THREE.Vector3(); // where the left iron hangs, in the horse's frame
    this.leftHeading = 0;
    this.u = 0;
    this.dir = 0; // 1 mounting, -1 dismounting, 0 not moving
    this.yaw = 0; // how far the body is turned from facing forward (about +y)
    this._k = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  get active() {
    return this.dir !== 0;
  }

  // Starts mounting (dir 1) or dismounting (-1), or turns round one under way.
  begin(dir) {
    if (this.active) { this.dir = dir; return; }
    this.u = dir > 0 ? 0 : 1;
    this.dir = dir;
    const S = (this.end = this.seated()), { build, model } = this.rider;
    // Standing, the hips as high as the rider's own, knees a touch soft.
    const standY = model.hipsBind.y * model.scale - build.seat - 0.01;
    this.tracks = mountTracks(S, standY, S.fold ?? reachFold(build, this._k.copy(S.hips).setY(S.hips.y + build.seat), S.grips[0]));
    // Getting off, start from however the rider sits now (riding fidgets and
    // all), easing into the tracks.
    const now = this.rider.seat;
    this.from = dir < 0 && now ? { hips: now.hips.clone(), grips: now.grips.map((p) => p.clone()), fold: now.fold ?? S.fold, tilt: now.tilt?.clone(), look: now.look?.clone() } : null;
    this.rider.setLocomotion('sit', this.seat);
    this.#sample();
  }

  // Standing beside the horse, not mounting.
  stand() {
    this.dir = 0;
    this.yaw = -Math.PI / 2;
    this.rider.setLocomotion('walk');
    this.#place(this.rider.root);
  }

  // `dt` s on. At the ends it hands over to the saddle's seat, or to standing.
  // Call after the tack's fit: the left iron turns to meet the toe coming
  // for it, and points where the foot in it does.
  update(dt) {
    if (!this.active) return;
    this.u += (this.dir * dt) / MOUNT_TIME;
    if (this.dir > 0 && this.u >= 1) { this.dir = 0; this.u = 1; this.rider.setLocomotion('sit', this.end); }
    else if (this.dir < 0 && this.u <= 0) { this.u = 0; this.stand(); }
    else this.#sample();
    if (this.active) this.tack.hang(0, this.leftIron, this.leftHeading * THREE.MathUtils.smoothstep(this.u, 0.2, 0.27));
  }

  // Places the rider's root while mounting (instead of on the saddle).
  placeRoot(root) {
    if (this.active) this.#place(root);
  }

  // The root where the rider stands, turned `yaw` from facing forward, in the
  // tack's metre frame (the horse's, at its back); its body turns half round
  // inside it.
  #place(root) {
    this.tack.metres.updateWorldMatrix(true, false);
    _m.copy(this.tack.metres.matrixWorld).multiply(_r.makeTranslation(STAND_AT)).multiply(_r.makeRotationY(this.yaw + Math.PI));
    _m.decompose(root.position, root.quaternion, _s);
  }

  #sample() {
    const { u, tracks, seat } = this;
    tracks.hips(u, seat.hips);
    tracks.feet[0](u, seat.feet[0]);
    tracks.feet[1](u, seat.feet[1]);
    tracks.grips[0](u, seat.grips[0]);
    tracks.grips[1](u, seat.grips[1]);
    seat.kneeOut = tracks.kneeOut(u, this._k).x;
    seat.fold = tracks.fold(u, this._k).x;
    seat.tilt.set(0, 0, 0);
    seat.look.set(0, 0, 0);
    const from = this.from, k = from ? 1 - THREE.MathUtils.smoothstep(u, 0.88, 1) : 1;
    if (k < 1) {
      seat.hips.lerp(from.hips, 1 - k);
      seat.grips.forEach((p, i) => p.lerp(from.grips[i], 1 - k));
      seat.fold += (from.fold - seat.fold) * (1 - k);
      if (from.tilt) seat.tilt.set(from.tilt.x * (1 - k), from.tilt.y * (1 - k), from.tilt.z * (1 - k));
      if (from.look) seat.look.set(from.look.x * (1 - k), from.look.y * (1 - k), from.look.z * (1 - k));
    }
    this.leftIron.copy(this.tack.seat.feet[0]);
    this.leftHeading = tracks.headings[0](u, this._k).x;
    // The body turns from facing the horse to facing forward while crossing;
    // the targets stay put in the horse's frame, seen from the root.
    this.yaw = -Math.PI / 2 * (1 - THREE.MathUtils.smoothstep(u, 0.55, 0.85));
    const undo = this._q.setFromAxisAngle(Y, -this.yaw);
    for (const p of [seat.hips, ...seat.feet, ...seat.grips]) p.sub(STAND_AT).applyQuaternion(undo);
    seat.toes[0] = this.leftHeading - this.yaw;
  }
}

// A rider in the saddle (seated, or mounting or dismounting), `dt` s on, as
// the game and the review page both seat them: the root follows the saddle
// (or stands beside the horse while mounting); seated and not mounting, they
// ride with the horse (riding.js); the reins run from the bit to their hands.
// Call after the horse is posed, the tack fitted and the mount updated.
// `horse` holds the HorseBody, Tack, Mount and RidingMotion.
const _palms = [new THREE.Vector3(), new THREE.Vector3()], _bit = new THREE.Vector3(), _inv = new THREE.Matrix4();
export function seatRider(dt, rider, { body, tack, mount, riding }) {
  // As the game seats a rider on the snowmobile: the root follows the saddle.
  tack.turned.updateWorldMatrix(true, false);
  tack.turned.matrixWorld.decompose(rider.root.position, rider.root.quaternion, _s);
  mount.placeRoot(rider.root);
  if (mount.active) riding.reset();
  else {
    // The bit's middle in the saddle's metre frame, for the hands to follow.
    tack.head.updateWorldMatrix(true, false);
    _bit.copy(tack.bit[0]).add(tack.bit[1]).multiplyScalar(0.5).applyMatrix4(tack.head.matrixWorld)
      .applyMatrix4(_inv.copy(tack.metres.matrixWorld).invert());
    riding.update(dt, body, tack.seat, tack.metres.matrixWorld, _bit, rider.build);
    if (rider.seat !== riding.seat) rider.setLocomotion('sit', riding.seat);
  }
  rider.update(dt, { crouch: 0, lean: mount.active ? 0 : riding.lean, twist: mount.active ? 0 : riding.twist, air: false, speed: 0 });
  if (rider.model) {
    rider.model.palmAt('Left', _palms[0]);
    rider.model.palmAt('Right', _palms[1]);
  } else rider.seat.grips.forEach((p, i) => tack.metres.localToWorld(_palms[i].copy(p)));
  // Mounting, the left hand holds both reins; the right takes its own once
  // in the saddle.
  if (mount.active) _palms[1].lerp(_palms[0], 1 - THREE.MathUtils.smoothstep(mount.u, 0.84, 1));
  tack.updateReins(_palms);
}
