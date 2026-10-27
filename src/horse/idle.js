// What a standing horse does: it never stands frozen. It breathes, shifts its
// weight from side to side, lets its head drift (up and alert, low and easy,
// a look to one side) with a slow bob, flicks each ear on its own, swishes
// its tail, rests one hind leg on its toe with that hip dropped and changes
// legs now and then, and every so often stamps, shakes its head or puts its
// nose down to the ground. Each runs on its own clock with a little chance in
// it, so they overlap differently every time and never loop.
//
// HorseBody (body.js) asks this for the moment's offsets and blends them in
// while the horse stands. Angles are radians, distances model units (the
// horse is about a unit long), as in body.js.
import * as THREE from 'three';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const TAU = Math.PI * 2;

// Mulberry32: a small seeded random, so a review run can be replayed.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value easing toward a target that's picked afresh every so often.
class Drift {
  constructor(rand, lo, hi, every, ease) {
    Object.assign(this, { rand, lo, hi, every, ease });
    this.value = this.target = lerp(lo, hi, 0.5);
    this.wait = 0;
  }
  update(dt, pick = () => lerp(this.lo, this.hi, this.rand())) {
    this.wait -= dt;
    if (this.wait <= 0) {
      this.target = pick();
      this.wait = lerp(this.every[0], this.every[1], this.rand());
    }
    this.value += (this.target - this.value) * (1 - Math.exp(-dt / this.ease));
    return this.value;
  }
}

// Something that happens now and then and lasts a while: `t` runs from 0 to
// `length` while it does.
class Every {
  constructor(rand, every, length) {
    Object.assign(this, { rand, every, length });
    this.wait = lerp(every[0], every[1], rand());
    this.t = null;
    this.which = 0;
  }
  update(dt) {
    if (this.t !== null) {
      this.t += dt;
      if (this.t >= this.length) this.t = null;
    } else if ((this.wait -= dt) <= 0) {
      this.t = 0;
      this.which = this.rand();
      this.wait = lerp(this.every[0], this.every[1], this.rand());
    }
    return this.t;
  }
}

export class HorseIdle {
  constructor(seed = 7) {
    const r = (this.rand = random(seed));
    this.t = 0;
    // The weight, side to side (+ onto its left legs), every few seconds.
    this.sway = new Drift(r, -1, 1, [3, 7], 1.2);
    // Where the head goes: the neck's drop (+ down) and turn (+ to its left).
    this.neck = new Drift(r, -0.15, 0.3, [2.5, 7], 1.0);
    this.turn = new Drift(r, -0.45, 0.45, [2, 6], 0.9);
    this.ears = [new Drift(r, -0.15, 0.45, [1.5, 5], 0.25), new Drift(r, -0.15, 0.45, [1.5, 5], 0.25)];
    this.flicks = [new Every(r, [2, 9], 0.35), new Every(r, [2, 9], 0.35)];
    this.swish = new Every(r, [4, 12], 1.4);
    // Which hind leg rests (0 none, 1 left, 2 right), changing now and then.
    this.rest = { leg: 0, wait: 3, amount: [0, 0] };
    // Now and then: a stamp, a shake of the head, a sniff at the ground.
    this.stamp = new Every(r, [14, 35], 0.6);
    this.shake = new Every(r, [18, 45], 0.9);
    this.sniff = new Every(r, [20, 50], 4.5);
    this.out = {
      sway: 0, roll: 0, drop: 0, breath: 0, neck: 0, turn: 0, head: 0, ears: [0, 0],
      tailLift: 0, tailSwing: 0, rest: [0, 0, 0, 0], lift: [0, 0, 0, 0],
    };
  }

  // The offsets for now, after `dt` s.
  update(dt) {
    const r = this.rand, o = this.out;
    this.t += dt;
    const t = this.t;
    // Breathing, about 12 a minute: the barrel and back rising a little.
    o.breath = Math.sin((TAU * t) / 5);

    // Resting a hind leg: that hip drops and the weight goes onto the other
    // side; it changes, or stands square, every 15–40 s.
    const rest = this.rest;
    if ((rest.wait -= dt) <= 0) {
      rest.leg = rest.leg ? (r() < 0.3 ? 0 : 3 - rest.leg) : 1 + Math.floor(r() * 2);
      rest.wait = lerp(15, 40, r());
    }
    for (let k = 0; k < 2; k++) {
      const want = rest.leg === k + 1 ? 1 : 0;
      rest.amount[k] += (want - rest.amount[k]) * (1 - Math.exp(-dt / 0.6));
    }
    o.rest[2] = rest.amount[0];
    o.rest[3] = rest.amount[1];
    const resting = rest.amount[0] - rest.amount[1]; // + resting the left
    // The weight drifts side to side, leaning away from a resting leg.
    o.sway = this.sway.update(dt) * 0.006 - resting * 0.01;
    o.roll = -resting * 0.035 - o.sway * 1.5; // + its left side up
    o.drop = (rest.amount[0] + rest.amount[1]) * 0.006;

    // The head: drifting between up and alert and low and easy, looking
    // round, with a slow bob; lower while a leg rests.
    const sniff = this.sniff.update(dt);
    const down = sniff === null ? 0 : smoothstep(sniff, 0, 0.8) * (1 - smoothstep(sniff, 3.6, 4.5));
    o.neck = this.neck.update(dt) + 0.12 * (rest.amount[0] + rest.amount[1]) + 0.04 * Math.sin((TAU * t) / 3.1) + 0.02 * Math.sin((TAU * t) / 1.7);
    o.neck = lerp(o.neck, 0.8, down);
    o.turn = this.turn.update(dt) * (1 - down * 0.7);
    o.head = 0.03 * Math.sin((TAU * t) / 2.3 + 1) + down * 0.25;
    const shake = this.shake.update(dt);
    if (shake !== null) {
      const k = Math.sin(Math.PI * (shake / this.shake.length));
      o.turn += 0.35 * k * Math.sin(TAU * 4.5 * shake);
      o.head -= 0.15 * k;
    }

    // Ears: each where it's listening, flicking back and up again now and then.
    for (let k = 0; k < 2; k++) {
      let e = this.ears[k].update(dt);
      const f = this.flicks[k].update(dt);
      if (f !== null) e += 0.7 * Math.sin(Math.PI * (f / this.flicks[k].length));
      if (shake !== null) e += 0.4;
      o.ears[k] = e;
    }

    // The tail hangs, swishing now and then: one or two slow swings.
    const swish = this.swish.update(dt);
    o.tailSwing = 0.03 * Math.sin((TAU * t) / 4.3);
    o.tailLift = 0;
    if (swish !== null) {
      const k = Math.sin(Math.PI * (swish / this.swish.length));
      // To one side or the other, once or one and a half times across.
      const way = this.swish.which < 0.5 ? 1 : -1, swings = this.swish.which % 0.5 < 0.25 ? 1 : 1.5;
      o.tailSwing += way * 0.55 * k * Math.sin((TAU * swings * swish) / this.swish.length);
      o.tailLift = 0.12 * k;
    }

    // A stamp: one foreleg (or now and then a hind) up and down.
    o.lift.fill(0);
    const stamp = this.stamp.update(dt);
    if (stamp !== null) {
      const leg = this.stamp.which < 0.35 ? 0 : this.stamp.which < 0.7 ? 1 : this.stamp.which < 0.85 ? 2 : 3;
      if (o.rest[leg] < 0.1) o.lift[leg] = Math.sin(Math.PI * clamp(stamp / this.stamp.length, 0, 1)) ** 1.5;
    }
    return o;
  }
}
