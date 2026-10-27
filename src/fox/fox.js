// A skulk of red foxes (赤狐), a small Easter egg: two or three of them live by
// the bottom station of Cable Car No. 6 in Jingquan Valley, and the first one
// to get a good look at you counts as found (the start of a collection).
// Everything they do is decided here and posed in code (body.js, rig.js, on
// the dog's: src/dog/); there are no animation clips. The moves are the ones
// played out on the review page (tools/review/fox.html).
//
// On their own they potter about: nose in the snow, look about, flick their
// ears, sit, and after a while curl up asleep. When someone comes by they
// notice: ears up, a stare. Unlike Mantou a fox keeps its distance: it trots
// to somewhere five to eight metres off and sits to watch, now and then
// stretching into a play bow and shaking itself off. Come closer than about
// four metres and it starts and trots off, then hovers: creeping back low,
// stretching its neck to sniff, losing its nerve and backing off, until it
// settles to watch from a safe way off. Ski at one and it bolts off your line
// and jukes when you close in (evade.js), keeping near home, and once you've
// gone by it looks back and shakes. When you leave they drift home.
//
// Each fox has its own nerve and timing, so the three never move in step.
//
// The world frame: each Fox.root stands on the snow under the fox, turned to
// its heading (+z forward), and holds the model at its size.
import * as THREE from 'three';
import { loadFox, FoxRig } from './rig.js';
import { FoxBody } from './body.js';
import { evade, evadeState, EVADE } from './evade.js';
import { liftStations } from '../world/stations.js';
import { Spray } from '../player/fx.js';

export const FOX = { en: 'Red fox', zh: '赤狐', id: 'red-fox' };
const SIZE = 0.9; // metres per model unit: about 0.4 m at the shoulder
// Where they live: about 50 m up the slope from No. 6's bottom station, beside
// the run down to it but off it (m from the station, world x, z).
const DEN = { lift: '6号索道', off: [3.0, 51.9] };
const LEAVE = 40; // m: someone further than this has gone
const FOUND = 10; // m: a fox this close, facing you, has seen you
// The game's skiers come downhill far faster than the review page's (10–30
// m/s) and carve far wider (20 m and more): they're dodged by time to
// contact, not distance, juking a second before they'd arrive to whichever
// side beats their aim, and one that's going to pass well wide is watched
// rather than run from. Tuned by simulation against boards that aim at the
// fox, ahead of it or in between: none passes within a metre.
const GAME_EVADE = { ...EVADE, jukeLead: 1.0, jukeMiss: 5, jukeRead: true, waryLead: 1.8, miss: 9, offLine: 1.6, safe: 34 };
const { clamp, randFloat: rand, smoothstep, euclideanModulo: mod } = THREE.MathUtils;
const wrap = (a) => mod(a + Math.PI, Math.PI * 2) - Math.PI;
const headingTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// Where the den is, from the lifts' map lines; null if the map has no No. 6.
export function foxDen(lifts) {
  const i = lifts.findIndex((l) => l.name === DEN.lift);
  if (i < 0) return null;
  const [x, z] = liftStations(lifts)[i][0];
  return { x: x + DEN.off[0], z: z + DEN.off[1], yaw: Math.atan2(-DEN.off[0], -DEN.off[1]) };
}

export class Foxes {
  // `den`: { x, z, yaw } (foxDen). `obstacles`: rotated boxes they keep out
  // of (the game's footprints, a live list); they go round trees too.
  constructor({ hf, forest, obstacles = [], den, count = 3 }) {
    this.root = new THREE.Group();
    this.root.name = 'Foxes';
    this.events = []; // { type: 'found', at } for the game to record
    this.spray = new Spray(120); // snow shaken off their coats, kicked up running
    this.spray.points.material.size = 0.12;
    // Spread a few metres apart round the den, each with its own nerve: the
    // boldest comes nearest and is slowest to start.
    const spots = [[0, 0], [2.6, -1.7], [-2.2, 2.4]];
    const nerves = [0.25, 0.55, 0.85].sort(() => Math.random() - 0.5);
    const c = Math.cos(den.yaw), s = Math.sin(den.yaw);
    this.foxes = spots.slice(0, count).map(([ox, oz], i) => new Fox({
      hf, forest, obstacles, pack: this, nerve: nerves[i], slot: [0.5, -0.5, -1.0][i],
      home: { x: den.x + ox * c + oz * s, z: den.z - ox * s + oz * c, yaw: den.yaw + rand(-0.5, 0.5) },
    }));
    for (const f of this.foxes) this.root.add(f.root);
    this.ready = Promise.all(this.foxes.map((f) => f.ready)).then(() => this);
  }

  // `who`: the person as Mantou sees them (main.js forDog, plus `turn`, their
  // turn rate), or null when there's nobody about.
  update(dt, time, who, camera) {
    for (const f of this.foxes) f.update(dt, time, who, camera);
    this.spray.update(dt);
  }

  // A fox has had a good look at you: found, once per visit to their spot.
  saw(fox) {
    if (this.seen) return;
    this.seen = true;
    this.events.push({ type: 'found', at: fox.pos.clone() });
  }
}

class Fox {
  constructor({ hf, forest, obstacles, home, nerve, pack, slot }) {
    this.hf = hf;
    this.forest = forest;
    this.obstacles = obstacles;
    this.home = home;
    this.pack = pack;
    // Its own temper: how near it'll come (the comfort ring, m), how near is
    // too near, how far off it notices, how quick it is to react, its pace.
    this.nerve = nerve;
    this.ring = 8 - nerve * 3;
    this.tooNear = 4.5 - nerve * 0.9;
    // Someone who stands still it comes right up to, in front of them and
    // off to one side, where they can see it past themselves: each fox to its
    // own place (`slot`, radians off the way they face), the boldest nearest.
    this.close = 1.6 + nerve * 0.6;
    this.slot = slot;
    this.still = 0; // s they've stood still
    this.notice = rand(22, 25);
    this.react = rand(0.1, 0.55) + (1 - nerve) * 0.2;
    this.pace = rand(0.92, 1.08);
    this.restAfter = rand(25, 45);

    this.root = new THREE.Group();
    this.root.name = 'Fox';
    this.pos = new THREE.Vector3(home.x, hf.heightAt(home.x, home.z), home.z);
    this.yaw = home.yaw;
    // The steering (as the review page's): a target to go to at a speed
    // (braking to stop on it), a heading at a speed (negative backs up), or a
    // point to turn and face. `target` and `face` may be functions, for
    // somewhere that moves.
    this.motor = { target: null, speed: 0, heading: null, face: null, v: 0, yawRate: 0, turnMax: 5, accel: 6 };
    this.vel = new THREE.Vector3();
    this.lookAt = null; // a world point to look at, or null for ahead
    this.mode = 'home';
    this.script = null;
    this.ready = loadFox().then((gltf) => {
      this.rig = new FoxRig(gltf); // its own copy of the model, and its own eyelids
      this.body = new FoxBody(this.rig);
      this.body.scale = SIZE;
      this.rig.scene.scale.setScalar(SIZE);
      this.root.add(this.rig.scene);
      this.#place();
      this.#start('home', this.#home());
      return this;
    });
  }

  update(dt, time, who, camera) {
    if (!this.body) return;
    this.time = time;
    this.#think(dt, who);
    this.#steer(dt);
    this.#place();
    const far = camera && camera.position.distanceTo(this.pos) > 250;
    this.root.visible = !far;
    if (far) return;
    this.#look();
    this.body.speed = this.motor.v / SIZE;
    this.body.turnRate = this.motor.yawRate;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), y0 = this.pos.y;
    this.body.update(dt, (mx, mz) => (this.hf.heightAt(this.pos.x + (mx * c + mz * s) * SIZE, this.pos.z + (-mx * s + mz * c) * SIZE) - y0) / SIZE);
    this.#snow(dt);
  }

  // ---- What it's up to ----
  // What it's doing is a script (a generator, as on the review page) that
  // yields every frame; something happening swaps in another.
  #start(mode, script) {
    this.mode = mode;
    this.script = script;
  }

  #think(dt, who) {
    this.who = who;
    const d = who ? Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z) : Infinity;
    const sp = who ? Math.hypot(who.vel.x, who.vel.z) : 0;
    const b = this.body, asleep = b.posture === 'sleep';
    this.chase ??= evadeState();

    // Someone coming fast at it (skiing, not on foot): it runs. Asleep, it
    // only wakes to them close by.
    if (who && sp > 4 && this.mode !== 'flee' && !(asleep && d > 14)) {
      const r = evade(dt, this.#me(), this.#chaser(who), this.chase, this.home, 30, GAME_EVADE);
      if (r.mode === 'flee' || r.mode === 'juke') this.#start('flee', this.#flee());
    } else if (this.mode !== 'flee') this.chase = evadeState();

    this.still = sp < 0.4 ? this.still + dt : 0;
    if (this.mode !== 'flee') {
      // Come at too near (nearer still the faster they come): a start, and
      // off. Standing still, they can have it right by them.
      const closing = who ? ((this.pos.x - who.pos.x) * who.vel.x + (this.pos.z - who.pos.z) * who.vel.z) / Math.max(d, 0.1) : 0;
      const near = this.tooNear + clamp(closing, 0, 3) * 0.8;
      if (who && closing > 0.4 && d < near && (this.mode !== 'shy' || this.settled)) this.#start('shy', this.#shy());
      // Gone: home.
      else if ((!who || d > LEAVE) && !['home', 'rest', 'return', 'safe'].includes(this.mode)) this.#start('return', this.#return());
      // Noticed (asleep, only close by).
      else if (who && ['home', 'rest', 'return'].includes(this.mode) && d < (asleep ? 12 : this.notice)) this.#start('spot', this.#curious(asleep));
    }

    // Found: close by, awake, and facing you.
    if (who && d < FOUND && !asleep && this.mode !== 'flee' && Math.abs(wrap(headingTo(this.pos, who.pos) - this.yaw)) < 0.6) this.pack.saw(this);
    if (!who || d > LEAVE + 20) this.pack.seen = false;

    const r = this.script?.next(dt);
    if (r?.done) this.#start('home', this.#home());
  }

  // ---- Its scripts ----
  // Pottering about its spot: whims every few seconds, and after a while a
  // rest, sitting, then curled up asleep.
  *#home() {
    const b = this.body;
    this.#settle();
    this.lookAt = null;
    let idle = 0;
    for (;;) {
      const t0 = this.time;
      yield* this.#wait(rand(1.5, 4) / this.pace);
      const w = Math.random();
      if (w < 0.3) {
        // A wander and a sniff: nose down, along the snow to somewhere else.
        const a = Math.random() * Math.PI * 2, r = rand(1, 4);
        const to = { x: this.home.x + Math.sin(a) * r, z: this.home.z + Math.cos(a) * r };
        if (this.#clear(to.x, to.z, 0.4)) {
          b.sniff = 0.8;
          yield* this.#go(to, 0.7 * this.pace, 0.3);
          yield* this.#wait(rand(0.8, 2));
          b.sniff = 0;
        }
      } else if (w < 0.5) {
        // A sound off to one side: the ears turn first, then the head.
        const side = pick([-1, 1]);
        b.earTurn = side;
        yield* this.#wait(0.5);
        this.lookAt = this.root.localToWorld(new THREE.Vector3(3 * side, 0.3, rand(0, 2)));
        b.alert = 0.6;
        yield* this.#wait(rand(1.2, 2));
        b.earTurn = 0;
        b.alert = 0;
        this.lookAt = null;
      } else if (w < 0.62) b.play(pick(['flickL', 'flickR', 'flick']));
      else if (w < 0.72) b.play('shake');
      else if (w < 0.9) {
        // Sits a while, an ear going now and then.
        b.posture = 'sit';
        yield* this.#wait(rand(2, 4));
        b.play(pick(['flickL', 'flickR']));
        yield* this.#wait(rand(2, 4));
        b.posture = 'stand';
      } else {
        b.tilt = pick([-0.3, 0.3]);
        yield* this.#wait(1.2);
        b.tilt = 0;
      }
      idle += this.time - t0;
      // Drifted off: back to its spot.
      if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 6) yield* this.#go(this.home, 1.0, 0.5);
      if (idle > this.restAfter) {
        this.mode = 'rest';
        yield* this.#rest();
        this.mode = 'home';
        idle = 0;
      }
    }
  }

  // Sat, drowsy, then curled up asleep a good while, and up with a shake.
  *#rest() {
    const b = this.body;
    b.posture = 'sit';
    yield* this.#wait(rand(4, 7));
    b.drowsy = 1;
    b.earsBack = 0.4;
    yield* this.#wait(rand(3, 5));
    b.posture = 'sleep';
    let left = rand(40, 80);
    while (left > 0) {
      const s = rand(4, 9);
      yield* this.#wait(s);
      left -= s;
      b.play(pick(['flickL', 'flickR'])); // twitching in its sleep
    }
    b.drowsy = 0;
    b.earsBack = 0;
    b.posture = 'stand';
    yield* this.#wait(0.8);
    b.play('shake');
    yield* this.#wait(1.6);
  }

  // Noticed someone: ears up, head up, a stare, then over to keep an eye on
  // them from its comfort ring, and watching from there.
  *#curious(woke) {
    const b = this.body, who = () => this.who;
    this.#settle();
    if (woke) {
      // Head up first, a look, then up on its feet with a shake.
      b.posture = 'sit';
      this.lookAt = who().head;
      yield* this.#wait(1 + this.react);
      b.posture = 'stand';
      b.play('shake');
      yield* this.#wait(1.2);
    }
    // Stops dead, ears up, stares.
    this.#halt();
    b.alert = 1;
    b.tailUp = 0;
    yield* this.#wait(this.react);
    this.lookAt = who().head;
    yield* this.#face(() => who().pos);
    yield* this.#wait(rand(0.8, 1.4));
    if (Math.random() < 0.6) {
      b.tilt = pick([-0.3, 0.3]);
      yield* this.#wait(0.9);
      b.tilt = 0;
    }
    yield* this.#watch(this.ring, true);
  }

  // Keeping an eye on them from `ring` m off: trots over (or back) to it when
  // they've moved, sits to watch, and now and then stretches and shakes.
  *#watch(ring, greet) {
    const b = this.body, who = () => this.who;
    this.mode = 'watch';
    this.settled = true;
    let next = rand(4, 9);
    for (;;) {
      const d = this.#dist();
      if (Math.hypot(who().vel.x, who().vel.z) > 2.5) {
        // Someone going by: it stands and watches them go, and comes over only
        // once they've stopped.
        b.posture = 'stand';
        b.alert = 0.6;
        this.lookAt = who().head;
        if (Math.abs(wrap(headingTo(this.pos, who().pos) - this.yaw)) > 1) yield* this.#face(() => who().pos);
        yield;
        continue;
      }
      const still = this.still > 0.8;
      if (still && this.#gap(this.#before()) > 0.6) {
        // They've stopped: up close, in front of them, the last of the way
        // slow and a little low, ears forward, nose out.
        b.posture = 'stand';
        b.alert = 0.8;
        this.lookAt = who().head;
        const changed = () => this.still <= 0.8;
        if (d > 4) yield* this.#go(() => this.#before(), (d > 14 ? 3.4 : 2.4) * this.pace, 3.2, () => changed() || this.#dist() < 4);
        b.cower = 0.25;
        if (!changed()) yield* this.#go(() => this.#before(), 0.7 * this.pace, 0.35, changed);
        b.cower = 0;
        if (changed()) continue;
        yield* this.#face(() => who().pos);
        b.alert = 0.5;
        b.posture = Math.random() < 0.6 ? 'sit' : 'stand';
      } else if (!still && (d > ring + 3 || d < ring - 2)) {
        // Over to the ring, on the side it's on (back out to it, if they've
        // moved off again from close by).
        b.posture = 'stand';
        b.alert = 0.4;
        this.lookAt = d < 12 ? who().head : null;
        yield* this.#go(() => this.#offWho(ring), (d > 14 ? 3.4 : d > ring ? 2.4 : 1.2) * this.pace, 0.5,
          () => Math.abs(this.#dist() - ring) < 0.8 || this.still > 0.8);
        this.lookAt = who().head;
        yield* this.#face(() => who().pos);
        yield* this.#wait(0.3);
        if (greet && Math.random() < 0.55) {
          // Stretches into a play bow, front down, rump up, then shakes.
          greet = false;
          yield* this.#bow();
        }
        b.alert = 0.2;
        b.posture = 'sit';
      }
      // Sat watching them; it shifts round if they go off to one side.
      this.lookAt = who().head;
      if (Math.abs(wrap(headingTo(this.pos, who().pos) - this.yaw)) > 0.7) {
        b.posture = 'stand';
        yield* this.#face(() => who().pos);
        b.posture = 'sit';
      }
      next -= yield;
      if (next <= 0) {
        next = rand(3, 8) / this.pace;
        const w = Math.random();
        if (w < 0.35) b.play(pick(['flickL', 'flickR', 'flick']));
        else if (w < 0.6) { b.tilt = pick([-0.25, 0.3]); yield* this.#wait(1.3); b.tilt = 0; }
        else if (w < 0.72) { b.posture = 'stand'; yield* this.#bow(); b.posture = 'sit'; }
        else if (w < 0.82) b.play('wink');
      }
    }
  }

  *#bow() {
    const b = this.body;
    b.posture = 'bow';
    b.wag = 0.35;
    b.earsBack = 0;
    b.alert = 0.6;
    yield* this.#wait(2);
    b.posture = 'stand';
    b.wag = 0.05;
    yield* this.#wait(0.6);
    b.alert = 0;
    b.play('shake');
    yield* this.#wait(1.8);
    b.play('flick');
  }

  // Too near: a start, and it trots off; then hovers, creeping back low and
  // backing off again, and settles to watch from further off.
  *#shy() {
    const b = this.body, who = () => this.who;
    this.settled = false;
    b.posture = 'stand';
    b.sniff = b.tilt = 0;
    b.play('startle');
    this.lookAt = who().head;
    b.earsBack = 0.5;
    b.alert = 0;
    yield* this.#wait(0.35);
    // Eyes on where it's going, not back over its shoulder.
    b.tailUp = -0.3;
    this.lookAt = null;
    yield* this.#go(this.#offWho(9 + this.nerve * 2), 3.2 * this.pace, 0.4);
    this.settled = true; // too near again from here, and it starts again
    yield* this.#face(() => who().pos);
    this.lookAt = who().head;
    // Curious, but wary.
    b.cower = 0.35;
    b.earsBack = 0.5;
    b.wag = 0.3; // a low, nervous swish
    yield* this.#wait(rand(1, 1.8));
    b.play(pick(['flickL', 'flickR']));
    yield* this.#wait(0.8);
    // Creeps a few steps closer, low to the snow.
    b.cower = 0.6;
    yield* this.#go(() => this.#offWho(7.2), 0.55, 0.15, () => this.#dist() < 7.3);
    yield* this.#face(() => who().pos);
    // Stretches its neck out, ears forward, sniffing the air.
    b.cower = 0.4;
    b.earsBack = 0;
    b.alert = 0.5;
    yield* this.#wait(1.5);
    b.play('blink');
    yield* this.#wait(0.6);
    if (Math.random() < 0.3 + this.nerve * 0.5) {
      // Loses its nerve: flinches and backs off…
      b.play('startle');
      b.alert = 0;
      b.cower = 0.8;
      b.earsBack = 0.8;
      yield* this.#wait(0.25);
      yield* this.#back(1.1, 0.7);
      yield* this.#wait(0.8);
      // …edges round to the side, and tries again.
      b.cower = 0.45;
      b.earsBack = 0.4;
      const a = headingTo(who().pos, this.pos) + pick([-0.45, 0.45]);
      yield* this.#go({ x: who().pos.x + Math.sin(a) * 7.5, z: who().pos.z + Math.cos(a) * 7.5 }, 0.9, 0.2);
      yield* this.#face(() => who().pos);
    }
    yield* this.#go(() => this.#offWho(6), 0.5, 0.15, () => this.#dist() < 6.1);
    yield* this.#face(() => who().pos);
    // Settles at a safe distance, watching.
    b.cower = 0;
    b.earsBack = 0.15;
    b.wag = 0.1;
    b.posture = 'sit';
    yield* this.#wait(1.8);
    b.play('flick');
    yield* this.#watch(Math.max(this.ring, 6), false);
  }

  // Chased: off the skier's line, juking when they close in, keeping near
  // home; once they've gone by, a look back, and a shake.
  *#flee() {
    const b = this.body, m = this.motor;
    this.settled = false;
    this.#settle();
    b.alert = 1;
    if (this.who) this.lookAt = this.who.head;
    yield* this.#wait(this.react * 0.25);
    // Off the mark as hard as it can go.
    m.turnMax = 8;
    m.accel = 11;
    let calm = 0, t = 0;
    while (calm < 0.8 && t < 30) {
      const dt = yield;
      t += dt;
      const who = this.who;
      const r = who ? evade(dt, this.#me(), this.#chaser(who), this.chase, this.home, 30, GAME_EVADE) : { mode: 'calm', heading: null, speed: 0 };
      calm = r.mode === 'calm' ? calm + dt : 0;
      this.lookAt = null; // looking where it's going, not back
      b.alert = 0;
      b.earsBack = r.mode === 'wary' ? 0.5 : 0.9;
      b.tailUp = 0.2;
      m.target = m.face = null;
      m.heading = r.heading ?? this.yaw;
      m.speed = r.speed * (r.mode === 'calm' ? 0 : this.pace);
    }
    m.turnMax = 5;
    m.accel = 6;
    this.chase = evadeState();
    this.mode = 'safe'; // a second run at it sets it off again
    this.#halt();
    yield* this.#wait(0.8);
    if (this.who) {
      yield* this.#face(() => this.who.pos);
      this.lookAt = this.who.head;
    }
    // Safe: it looks back, ears still flat.
    b.earsBack = 0.5;
    yield* this.#wait(1.4);
    b.earsBack = 0.2;
    b.play('shake');
    yield* this.#wait(1.8);
    b.posture = 'sit';
    yield* this.#wait(rand(1.5, 2.5));
    b.posture = 'stand';
    this.mode = 'return';
    yield* this.#return();
  }

  // Home at a trot, walking the last of it.
  *#return() {
    this.#settle();
    this.lookAt = null;
    const near = () => this.#gap(this.home) < 6;
    if (!near()) yield* this.#go(this.home, 2.4 * this.pace, 0.5, near);
    yield* this.#go(this.home, 1.0 * this.pace, 0.5);
    yield* this.#face({ x: this.home.x + Math.sin(this.home.yaw), z: this.home.z + Math.cos(this.home.yaw) });
  }

  // Back to its everyday self.
  #settle() {
    Object.assign(this.body, { posture: 'stand', alert: 0, cower: 0, earsBack: 0, earTurn: 0, drowsy: 0, tilt: 0, wag: 0.05, tailUp: 0, sniff: 0 });
  }

  // ---- Beats ----
  // Each yields until it's done; the frame's dt comes back from each yield.
  *#wait(s) { while (s > 0) s -= yield; }
  // There, or until `stop()` says so first.
  *#go(to, speed, near = 0.15, stop = () => false) {
    const m = this.motor;
    m.heading = m.face = null;
    m.target = to;
    m.speed = speed;
    let t = 0;
    while (!stop() && this.#gap(m.target) > near && t < 20) t += yield;
    this.#halt();
  }
  *#face(p) {
    const m = this.motor;
    m.target = m.heading = null;
    m.speed = 0;
    m.face = p;
    let t = 0;
    while (Math.abs(wrap(headingTo(this.pos, at(p)) - this.yaw)) > 0.08 && t < 3) t += yield;
    m.face = null;
  }
  *#back(dist, speed) {
    const m = this.motor, from = this.pos.clone();
    m.target = m.face = null;
    m.heading = this.yaw;
    m.speed = -speed;
    let t = 0;
    while (Math.hypot(this.pos.x - from.x, this.pos.z - from.z) < dist && t < 4) t += yield;
    m.speed = 0;
  }
  #halt() {
    const m = this.motor;
    m.target = m.face = null;
    m.heading = this.yaw;
    m.speed = 0;
  }

  // ---- Getting about ----
  // `gap` m from them, on the side the fox is on.
  // Its place in front of them, close up.
  #before() {
    const who = this.who;
    if (!who) return this.home;
    const a = Math.atan2(who.facing.x, who.facing.z) + this.slot;
    return { x: who.pos.x + Math.sin(a) * this.close, z: who.pos.z + Math.cos(a) * this.close };
  }
  #offWho(gap) {
    const p = this.who?.pos ?? this.home, a = headingTo(p, this.pos);
    return { x: p.x + Math.sin(a) * gap, z: p.z + Math.cos(a) * gap };
  }
  #dist() {
    return this.who ? Math.hypot(this.who.pos.x - this.pos.x, this.who.pos.z - this.pos.z) : Infinity;
  }
  #gap(p) {
    const q = at(p);
    return Math.hypot(q.x - this.pos.x, q.z - this.pos.z);
  }
  #me() {
    return { pos: this.pos, vel: this.vel };
  }
  #chaser(who) {
    return { pos: who.pos, vel: who.vel, turn: who.turn ?? 0 };
  }

  // The review page's steering, on the snow: turns toward its target (slower
  // while it still has a lot of turning to do, braking to stop on it), or
  // runs on a heading (a sharp cut costs it some speed), or turns on the spot
  // to face something. It accelerates briskly and stops harder still. Uphill
  // slows it; trees, buildings, the map's edge, the other foxes and the
  // person it goes round.
  #steer(dt) {
    const m = this.motor;
    let want = 0, aim = this.yaw;
    if (m.target) {
      const p = at(m.target), d = this.#gap(p);
      aim = headingTo(this.pos, p);
      // The person in the way: round them, on a line just clear of them.
      const who = this.who;
      if (who) {
        const dp = Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z), bp = headingTo(this.pos, who.pos), off = wrap(aim - bp);
        const clear = dp > 1.4 ? Math.asin(1.4 / dp) : Math.PI / 2;
        if (dp < d && Math.abs(off) < clear) aim = bp + (Math.sign(off) || 1) * clear;
      }
      const turning = Math.abs(wrap(aim - this.yaw));
      want = Math.min(m.speed * clamp(1.4 - turning, 0.15, 1), Math.sqrt(2 * 7 * Math.max(0, d - 0.05)));
    } else if (m.heading !== null) {
      aim = m.heading;
      want = m.speed * clamp(1.25 - Math.abs(wrap(aim - this.yaw)) * 0.6, 0.5, 1);
    } else if (m.face) aim = headingTo(this.pos, at(m.face));
    if (Math.abs(want) > 0.05) aim = this.#clearWay(aim, Math.max(1, Math.abs(m.v) * 0.5) * Math.sign(want));
    const dy = wrap(aim - this.yaw);
    const rate = clamp(dy * 7, -m.turnMax, m.turnMax);
    m.yawRate += (rate - m.yawRate) * (1 - Math.exp(-dt * 14));
    this.yaw = wrap(this.yaw + m.yawRate * dt);
    m.v += clamp(want - m.v, -9 * dt, m.accel * dt);
    // Up a slope it makes less ground (and a little more down one).
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const grade = (this.hf.heightAt(this.pos.x + fx, this.pos.z + fz) - this.hf.heightAt(this.pos.x - fx, this.pos.z - fz)) / 2;
    const v = m.v * clamp(1 - grade * Math.sign(m.v) * 1.2, 0.55, 1.15);
    let nx = this.pos.x + fx * v * dt, nz = this.pos.z + fz * v * dt;
    // Out of the others' way, and round the person's feet, not through them.
    const keep = (p, r) => {
      const dx = nx - p.x, dz = nz - p.z, dd = Math.hypot(dx, dz);
      if (dd < r && dd > 1e-3) { nx += (dx / dd) * (r - dd) * Math.min(1, dt * 6); nz += (dz / dd) * (r - dd) * Math.min(1, dt * 6); }
    };
    for (const o of this.pack.foxes) if (o !== this) keep(o.pos, 0.9);
    if (this.who) keep(this.who.pos, 1.0);
    if (this.#clear(nx, nz, 0.3)) { this.pos.x = nx; this.pos.z = nz; }
    else m.v *= 0.5;
    this.pos.y = this.hf.heightAt(this.pos.x, this.pos.z);
    this.vel.set(fx * v, 0, fz * v);
  }

  // The heading nearest `yaw` that's clear `look` m ahead (behind, backing up).
  #clearWay(yaw, look) {
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
      const a = yaw + off;
      if (this.#clear(this.pos.x + Math.sin(a) * look, this.pos.z + Math.cos(a) * look, 0.4)) return a;
    }
    return yaw;
  }

  #clear(x, z, r) {
    const hf = this.hf;
    if (!hf.inside(x, z, 40) || hf.holeAt(x, z)) return false;
    if (this.forest.hit(x, z, r)) return false;
    return this.obstacles.every((o) => boxGap(o, x, z) > r);
  }

  #place() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
  }

  // Where it looks: a point in the world, or straight ahead (into its turns).
  // The neck turns the head about 75° at most. Something further round than
  // that it gives up on: the head comes back to straight ahead as the target
  // goes behind it, rather than wringing the neck after it.
  #look() {
    const b = this.body;
    if (!this.lookAt) {
      const yaw = clamp(this.motor.yawRate * 0.15, -0.5, 0.5);
      b.lookAt.set(Math.sin(yaw), -0.05, Math.cos(yaw)).normalize();
      return;
    }
    this.root.updateMatrixWorld(true);
    const head = this.root.localToWorld(_w.set(0, 0.55 * SIZE, 0.4 * SIZE));
    const d = _v.copy(this.lookAt).sub(head).applyAxisAngle(_up, -this.yaw).normalize();
    const a = Math.atan2(d.x, d.z), give = 1 - smoothstep(Math.abs(a), 1.3, 2.1);
    const yaw = clamp(a, -1.3, 1.3) * give, pitch = Math.asin(clamp(d.y, -1, 1)) * give;
    b.lookAt.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }

  // Snow shaken off its coat, and kicked up behind it running flat out.
  #snow(dt) {
    const spray = this.pack.spray;
    if (this.body.playing('shake')) {
      const n = Math.floor(dt * 40 + Math.random());
      _v.set(this.pos.x, this.pos.y + 0.32, this.pos.z);
      if (n > 0) spray.emit(_v, _w.set(0, 0.4, 0), n, 1.8);
    }
    if (this.motor.v > 5) {
      const n = Math.floor(dt * this.motor.v * 1.2 + Math.random() * 0.5);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      _v.set(this.pos.x - fx * 0.35, this.pos.y, this.pos.z - fz * 0.35);
      if (n > 0) spray.emit(_v, _w.set(-fx * 1.2, 0.4, -fz * 1.2), n, 0.6);
    }
  }
}

// A place, or a function giving one.
const at = (p) => (typeof p === 'function' ? p() : p);

// How far (x, z) is outside a rotated box { x, z, yaw, hw, hd }; 0 inside it.
function boxGap(o, x, z) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z;
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - o.hw), Math.max(0, Math.abs(dx * s + dz * c) - o.hd));
}
