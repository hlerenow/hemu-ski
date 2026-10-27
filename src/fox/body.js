// How the fox holds itself and moves: the dog's body (src/dog/body.js), its
// postures, gaits and one-offs, with what a fox adds on top. Its ears are
// never still: they flick, swivel toward a sound, prick up when it's alert
// and flatten when it's scared. It blinks. It steps quicker than the
// sheepdog, being smaller. And when it's unsure of someone it slinks: body
// low, head down and out in front, ears back, tail tucked.
//
// Model frame and units as the dog's: the fox is about a unit long.
import * as THREE from 'three';
import { DogBody } from '../dog/body.js';

const { clamp, smoothstep } = THREE.MathUtils;
// How long the fox's own one-offs take (s).
const DUR = { flickL: 0.34, flickR: 0.34, flick: 0.4, blink: 0.17, wink: 0.3, startle: 0.5 };

export class FoxBody extends DogBody {
  constructor(rig) {
    super(rig);
    this.cadence = 1.3;
    this.wag = 0.05; // a fox's tail mostly hangs still, or swishes low
    // Set by whoever drives the fox (0 … 1 unless said):
    this.alert = 0; // ears up and forward, standing tall, head up
    this.cower = 0; // slinking: low, head out, ears flat, tail tucked
    this.earsBack = 0; // ears laid back (wary, or content)
    this.earTurn = 0; // both ears turned toward a sound, + to its left (−1 … 1)
    this.drowsy = 0; // lids half down
    this.blinks = true; // blinks on its own every few seconds
    this.lids = [0, 0]; // out: each eye, 0 open … 1 shut, for FoxRig
    this.nextBlink = 1.5;
    this.fox = { alert: 0, cower: 0, earsBack: 0, earTurn: 0, drowsy: 0 };
  }

  // The dog's one-offs, and: 'flickL', 'flickR' (one ear twitches back and
  // springs up), 'flick' (both), 'blink', 'wink' (its left eye), 'startle'
  // (a jolt: ears back, head up, body drops).
  play(kind, opts = {}) {
    super.play(kind, { dur: DUR[kind], ...opts });
  }

  update(dt, ground) {
    super.update(dt, ground);
    this.rig.lids?.value.set(this.lids[0], this.lids[1]);
  }

  adjust(F, dt) {
    const k = (s) => 1 - Math.exp(-dt / s);
    const e = this.fox;
    e.alert += (this.alert - e.alert) * k(0.18);
    e.cower += (this.cower - e.cower) * k(0.3);
    e.earsBack += (this.earsBack - e.earsBack) * k(0.12);
    e.earTurn += (this.earTurn - e.earTurn) * k(0.1);
    e.drowsy += (this.drowsy - e.drowsy) * k(0.5);
    const t = this.t, up = 1 - this.w.sleep - this.w.side - this.w.belly;

    // Leaning into its turns, the faster it goes the more (turning to its
    // left, + turnRate, it banks onto its left side, − roll).
    F.roll -= clamp(this.turnRate * this.speed * 0.022, -0.35, 0.35) * this.stride * this.w.stand;

    // Alert: standing tall, head up.
    F.hp.y += 0.012 * e.alert * this.w.stand;
    F.nod += 0.14 * e.alert * up;
    // Slinking: the body sinks (the legs fold to keep the paws where they
    // are), the hind end lowest, head down and stretched out in front, the
    // tail tucked down between the hind legs.
    const c = e.cower * this.w.stand;
    F.hp.y -= 0.11 * c;
    F.pitch += 0.06 * c;
    F.bend.x += 0.08 * c;
    F.nod -= 0.45 * c;
    F.lift -= 0.8 * e.cower * up;

    // Ears. At rest they turn a little out and wander; on top of that the
    // mood, a sound off to one side and any flicks.
    let back = e.earsBack * 0.6 + e.cower * 0.35 - e.alert * 0.12 + 0.03 * Math.sin(t * 0.7);
    let flat = e.cower * 0.45 + e.earsBack * 0.12;
    const out = 0.1 * (1 - e.alert);
    const flick = [0, 0];
    let jolt = 0;
    for (const a of this.acts) {
      const u = a.t / a.dur;
      if (a.kind === 'flickL' || a.kind === 'flickR' || a.kind === 'flick') {
        // Snapped back fast, then springing up past rest and settling.
        const s = u < 0.3 ? Math.sin((u / 0.3) * Math.PI * 0.5) : Math.cos(((u - 0.3) / 0.7) * Math.PI * 1.5) * (1 - u) * 1.4;
        if (a.kind !== 'flickR') flick[0] += s;
        if (a.kind !== 'flickL') flick[1] += s;
      } else if (a.kind === 'startle') {
        jolt = Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u * 0.5);
      }
    }
    // A startle: ears back, head up, the body ducking.
    back += jolt * 0.5;
    F.nod += jolt * 0.25;
    F.hp.y -= jolt * 0.04 * this.w.stand;
    if (this.P.ears) {
      this.P.ears.forEach((ear, i) => {
        const side = i === 0 ? 1 : -1;
        ear.back = clamp(back + flick[i] * 0.55 + 0.03 * Math.sin(t * 1.3 + i * 2), -0.3, 0.75);
        ear.swivel = out + side * e.earTurn * 0.7 + flick[i] * 0.35;
        ear.flat = clamp(flat, 0, 0.6);
      });
    }

    // Eyes: its own blinks every few seconds (now and then two together),
    // shut asleep, half down drowsy.
    if (this.blinks && up > 0.5) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.play('blink');
        this.nextBlink = Math.random() < 0.18 ? 0.28 : 2 + Math.random() * 3.5;
      }
    }
    let shut = Math.max(e.drowsy * 0.55, this.w.sleep);
    let wink = 0;
    for (const a of this.acts) {
      const u = a.t / a.dur;
      // Down fast, up a little slower.
      const s = u < 0.4 ? smoothstep(u, 0, 0.4) : 1 - smoothstep(u, 0.4, 1);
      if (a.kind === 'blink') shut = Math.max(shut, s);
      else if (a.kind === 'wink') wink = Math.max(wink, s);
    }
    this.lids[0] = Math.max(shut, wink);
    this.lids[1] = shut;
  }
}
