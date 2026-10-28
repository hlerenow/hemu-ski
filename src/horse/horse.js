// The Altai horse that roams the ridge out past the summit's ovoo, saddled
// and bridled, for anyone to ride. Everything it does is decided here and
// posed in code (body.js, rig.js); its tack, the mount and the rider's riding
// are tack.js, mount.js and riding.js.
//
// On its own it grazes, nosing through the snow and taking a step now and
// then, wanders off to another spot, or stands, fidgeting. When someone comes
// within NOTICE metres, it looks up, ears pricked, and watches them; if they
// stop (or walk, or come slowly), it walks over (trotting from further off)
// and stops beside them, its left side to them, where you get on. It waits
// there, watching them, until they mount (E) or go off, when it goes back to
// grazing. Mounting, it turns its left side to them if it has to and stands
// for it. Ridden, it goes at the gait it's asked for (gear) and turns as
// it's steered, as fast as the ground lets it: slower up and down steep snow,
// not at all where it's too steep, and it stops short of trees, buildings,
// water and the map's edge. Got off, it stays where it was left, and goes
// back to its pasture once nobody's about to see.
//
// Each hoof that comes down kicks up a little snow, far finer than a board's
// spray: on a groomed run a few crisp chips that drop at once, in powder a
// soft puff, and at the canter and gallop a flick thrown back off the toe as
// it lifts. In powder the hooves sink in. The game hears each footfall
// (`hoof` events), and at the canter and gallop its breathing, a breath to
// each stride (out as the leading foreleg lands, in as it lifts), heavier
// the longer it's run, blowing on for a while once it stops (`breath`).
//
// The world frame: Horse.root stands on the snow under the horse, turned to
// its heading (+z forward) and tilted to the ground under its hooves, and
// holds the model at its size.
import * as THREE from 'three';
import { loadHorse, HorseRig, LEGS } from './rig.js';
import { HorseBody } from './body.js';
import { Tack, loadSaddle, fitFor } from './tack.js';
import { Mount, seatRider, STAND_AT } from './mount.js';
import { RidingMotion } from './riding.js';
import { shoreAt } from '../world/lakes.js';
import { PISTE_HALF_WIDTH } from '../world/data.js';
import { Spray } from '../player/fx.js';

export const HORSE = { en: 'Altai horse', zh: '阿勒泰马' };
export const SIZE = 2.6; // metres per model unit: 1.64 m at the withers, 2.6 m nose to tail
// The gaits it can be asked for, and the speed each goes at (m/s, body.js's).
export const PACES = [
  { name: 'stand', speed: 0 }, { name: 'walk', speed: 1.7 }, { name: 'trot', speed: 3.8 },
  { name: 'canter', speed: 6.5 }, { name: 'gallop', speed: 11 },
];
// Its pasture: the flat ridge out past the ovoo, west of the top stations (m
// from the summit's origin, see world/summit-layout.js), and how far it roams.
const PASTURE = { at: [-135, 11], r: 32 };
const NOTICE = 25; // m it notices someone from
const PASSING = 4; // m/s: someone going faster is passing by, and it only watches
const REACH = 2.5; // m from its side you can get on from
// Where it stops beside someone: them this far to its left, and this far back
// from its middle (m): just out from where they stand to mount (STAND_AT).
const BESIDE = [1.0, -0.3];
// Its box, for the riders and the dog to keep out of (half width, half length,
// and how far behind its middle, m): its barrel is 0.41 m either side, but a
// rider keeps 0.5 m off a box, so it's narrower, to let them stand where they
// get on and off (STAND_AT, 0.64 m out).
const BOX = { hw: 0.14, hd: 1.25, back: 0.15 };
// How fast it may go up (+) or down (−) a slope (degrees → m/s): it gallops
// up to about 12° and down to about 15°, walks up to 32° and down to 36°, and
// won't go further.
const UPHILL = [[12, 11], [18, 6.5], [24, 3.8], [32, 1.7], [35, 0]];
const DOWNHILL = [[15, 11], [22, 6.5], [28, 3.8], [36, 1.7], [38, 0]];
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _palms = [new THREE.Vector3(), new THREE.Vector3()], _h = new THREE.Vector3(), _k = new THREE.Vector3();
// How far the hooves sink into powder (m).
const SINK = 0.07;
const { clamp, lerp, randFloat: rand, euclideanModulo: mod, smoothstep, radToDeg } = THREE.MathUtils;
const angleTo = (from, to) => mod(to - from + Math.PI, Math.PI * 2) - Math.PI;
const pick = (weights) => { let r = Math.random() * weights.reduce((s, [, w]) => s + w, 0); for (const [k, w] of weights) if ((r -= w) <= 0) return k; return weights[0][0]; };

// The pasture's middle in the world (x, z), from the summit's frame (shapeSummit).
export function horsePasture(frame) {
  if (!frame) return null;
  const [ox, oz] = frame.origin;
  return { x: ox + PASTURE.at[0], z: oz + PASTURE.at[1], r: PASTURE.r };
}

// The fastest the ground at `deg` (+ up, − down) lets it go (m/s).
function slopeLimit(deg) {
  const table = deg >= 0 ? UPHILL : DOWNHILL, a = Math.abs(deg);
  if (a <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [a0, v0] = table[i - 1], [a1, v1] = table[i];
    if (a <= a1) return lerp(v0, v1, (a - a0) / (a1 - a0));
  }
  return 0;
}

export class Horse {
  // `home`: horsePasture(); `obstacles` rotated boxes it keeps out of (the
  // game's footprints, a live list, which its own box joins); it goes round
  // trees too, and keeps out of `lakes`. `rider` is the game's Rider, whom
  // it carries.
  constructor({ hf, piste, forest, obstacles = [], lakes = [], home, rider }) {
    Object.assign(this, { hf, piste, forest, obstacles, lakes, home, rider });
    this.root = new THREE.Group();
    this.root.name = 'Horse';
    this.pos = new THREE.Vector3(home.x, hf.heightAt(home.x, home.z), home.z);
    this.yaw = rand(-Math.PI, Math.PI);
    this.speed = 0; // m/s, forward
    this.turnRate = 0; // rad/s, + to its left
    this.vel = new THREE.Vector3();
    this.tilt = { pitch: 0, roll: 0 }; // the ground under it
    this.centre = { x: home.x, z: home.z }; // where it roams round now
    this.goal = null; // { x, z, speed, stop, face } it heads for
    this.state = 'roam'; // roam, notice, come, wait, present, mount, ridden, pullup, dismount
    this.doing = 'graze'; // roaming: graze, walk or stand
    this.t = 0; // s in this state
    this.next = rand(8, 20); // s left of what it's doing, roaming
    this.calm = 0; // s before it takes notice of anyone again
    this.attention = { graze: 1, alert: 0, look: 0 }; // what it wants, eased into body.attention
    this.gear = 0; // ridden: PACES index asked for
    this.reins = { steer: 0, brake: false }; // ridden: A/D (+ to its left) and S held
    this.blocked = false; // ridden: stopped short of something
    this.events = []; // { type: 'hello' | 'mounting' | 'seated' | 'dismounted' | 'hoof' | 'breath', at, ... } for the game
    // Snow off the hooves: crisp chips off a groomed run, soft puffs of
    // powder, shaded the blue of the snow's shadows so they show against it.
    this.chips = new Spray(240, { size: 0.055, gravity: 9, life: 0.4, scatter: 0.12, lift: 0.8, settle: true, color: '#b9cad8' });
    this.puffs = new Spray(480, { size: 0.09, gravity: 4, life: 0.7, scatter: 0.2, lift: 0.9, settle: true, color: '#cddbe6' });
    this.sprays = [this.chips.points, this.puffs.points];
    // What's drawn in the world's own frame, not the horse's: the snow off
    // its hooves, and the reins, rebuilt each frame from world points.
    this.loose = new THREE.Group();
    this.loose.name = 'Horse, loose';
    this.loose.add(...this.sprays);
    this.powder = 0; // how deep the snow underfoot is, 0 (groomed) to 1 (powder), as the board feels it
    this.sink = 0; // m the hooves are down in it
    this.planted = [1, 1, 1, 1]; // each hoof down last frame
    this.blow = 0; // how hard it's breathing, 0–1, after running
    this.breathT = 0; // s to its next breath standing, blowing
    this.footprint = { x: this.pos.x, z: this.pos.z, yaw: this.yaw, hw: BOX.hw, hd: BOX.hd };
    obstacles.push(this.footprint);
    this.spots = this.#pasture(); // clear, gentle spots to wander to
    this.ready = Promise.all([loadHorse(), loadSaddle()]).then(([gltf, saddle]) => {
      this.rig = new HorseRig(gltf);
      this.body = new HorseBody(this.rig);
      this.body.scale = SIZE;
      this.rig.scene.scale.setScalar(SIZE);
      this.root.add(this.rig.scene);
      this.tack = new Tack(this.rig.scene, this.rig.bones, this.rig.mesh, saddle);
      this.loose.add(...this.tack.reins);
      this.riding = new RidingMotion();
      this.mount = new Mount(rider, this.tack, () => this.riding.rest(this.tack.seat, rider.build));
      this.#place();
      return this;
    });
  }

  // Whether someone at `pos` can get on: beside it, and it standing (or about to).
  canMount(pos) {
    if (!this.body || !['roam', 'notice', 'come', 'wait'].includes(this.state) || this.speed > 1.2) return false;
    return boxGap(this.footprint, pos.x, pos.z) < REACH;
  }

  // The rider at `pos` (kept up to date) is getting on: it stands while they
  // come round to its left (wayRound), then for them to mount (mountNow).
  beginMount(pos) {
    this.#to('present');
    this.who = { pos };
  }

  // Where a rider at `p` walks next to get to where they mount (STAND_AT,
  // on its left): straight there along its left side, or round its front
  // (round its back if they're behind it) from its right; null once there.
  // Clear of its box by the rider's half metre.
  wayRound(p, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const x = dx * c - dz * s, z = dx * s + dz * c; // in its frame: +x its left, +z ahead
    if (Math.hypot(x - STAND_AT.x, z - STAND_AT.z) < 0.15) return null;
    let wx = STAND_AT.x, wz = STAND_AT.z;
    const front = z > -0.8;
    if (x < 0.6) {
      if (front ? z > 1.8 : z < -2.2) { wx = 0.8; wz = front ? 1.95 : -2.35; } // across its nose or tail
      else { wx = Math.min(x, -0.8); wz = front ? 2.0 : -2.4; } // along its right side
    }
    return out.set(this.pos.x + wx * c + wz * s, 0, this.pos.z - wx * s + wz * c);
  }

  // They're beside it: up they get.
  mountNow() {
    if (this.state !== 'present') return;
    this.#to('mount');
    this.speed = this.turnRate = 0;
    this.attention.alert = 0;
    this.events.push({ type: 'mounting' });
    if (this.rider.model) this.mount.begin(1);
    else this.rider.setLocomotion('sit', this.riding.rest(this.tack.seat, this.rider.build));
  }

  // Off: it pulls up, then the rider gets down on its left.
  dismount() {
    if (this.state === 'ridden') this.#to('pullup');
  }

  // A gait faster (+1) or slower (−1), ridden.
  shift(step) {
    this.gear = clamp(this.gear + step, 0, PACES.length - 1);
  }

  // The rider is on it (mounting, in the saddle or getting off).
  get carrying() {
    return ['mount', 'ridden', 'pullup', 'dismount'].includes(this.state);
  }

  // `who`: someone about, as Mantou sees them (main.js forDog: { pos, vel,
  // head }), or null; `camera` for whether anyone would see it.
  update(dt, time, who, camera) {
    this.chips.update(dt);
    this.puffs.update(dt);
    if (!this.body) return;
    this.#think(dt, who, camera);
    this.#move(dt);
    this.#place();
    const far = camera && camera.position.distanceTo(this.pos) > 400 && !this.carrying;
    this.root.visible = !far;
    for (const r of this.tack.reins) r.visible = !far;
    if (far) return;
    // Its gait from how fast it goes, and turning on the spot it steps round.
    const body = this.body;
    body.speed = Math.max(this.speed, Math.abs(this.turnRate) * 0.7) / SIZE;
    body.turnRate = this.turnRate;
    body.idling = !['present', 'mount', 'dismount'].includes(this.state);
    const a = this.attention, b = body.attention, k = 1 - Math.exp(-dt * 2.5);
    b.graze += (a.graze - b.graze) * k;
    b.alert += (a.alert - b.alert) * k;
    b.look += (a.look - b.look) * (1 - Math.exp(-dt * 4));
    body.update(dt);
    this.root.updateMatrixWorld(true);
    this.#hooves();
    this.#breathe(dt);
    this.tack.fit(SIZE, fitFor(this.rider.modelId));
    if (this.mount.active) this.mount.update(dt);
    this.#settle();
    // Nobody holding them, the reins lie over its neck to the front of the saddle.
    if (!this.carrying && camera && camera.position.distanceTo(this.pos) < 80) {
      const s = this.tack.seat;
      [1, -1].forEach((side, i) => this.tack.metres.localToWorld(_palms[i].set(side * 0.06, s.hips.y + 0.1, s.hips.z + 0.3)));
      this.tack.updateReins(_palms);
    }
    for (const r of this.tack.reins) r.visible = this.carrying || (camera && camera.position.distanceTo(this.pos) < 80);
  }

  // The rider in the saddle, mounting or getting off, `dt` s on (after update).
  seat(dt, rider) {
    seatRider(dt, rider, this);
  }

  // ---- Snow and breath ----
  // Each hoof as it lands and lifts: snow kicked up, and the footfall heard.
  #hooves() {
    const body = this.body, k = clamp(this.speed / 11, 0, 1), p = this.powder;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    LEGS.forEach((leg, i) => {
      const plant = body.legs[i].plant, was = this.planted[i];
      this.planted[i] = plant;
      if (plant === was) return;
      const at = this.rig.bones[leg.chain[4]].getWorldPosition(_h);
      at.y = this.hf.heightAt(at.x, at.z);
      if (plant) {
        // Down: chips or a puff round the hoof, thrown on a little the way it goes.
        this.events.push({ type: 'hoof', at: at.clone(), level: 0.35 + 0.65 * k, powder: p });
        const chips = Math.round((3 + 8 * k) * (1 - p)), puffs = Math.round((6 + 16 * k) * p);
        if (chips) this.chips.emit(at, _k.set(fx * this.speed * 0.08, 0.1 + 0.4 * k, fz * this.speed * 0.08), chips, 0.5 + 0.8 * k);
        if (puffs) this.puffs.emit(at, _k.set(fx * this.speed * 0.05, 0.2 + 0.5 * k, fz * this.speed * 0.05), puffs, 0.5 + 0.9 * k);
        if (i === 0 && body.gait > 1.5) this.#breath(true, k);
      } else {
        // Up, going: the toe flicks snow back behind it.
        if (k > 0.3) {
          const chips = Math.round(5 * k * (1 - p)), puffs = Math.round(10 * k * p);
          if (chips) this.chips.emit(at, _k.set(-fx * (1 + 2 * k), 0.3, -fz * (1 + 2 * k)), chips, 0.6);
          if (puffs) this.puffs.emit(at, _k.set(-fx * (1.2 + 2.5 * k), 0.5, -fz * (1.2 + 2.5 * k)), puffs, 0.8);
        }
        if (i === 0 && body.gait > 1.5) this.#breath(false, k);
      }
    });
  }

  // Running hard, its breath comes heavier (in time with the stride, see
  // #hooves); stopped, it goes on blowing, slower and slower, till it has
  // its wind back.
  #breathe(dt) {
    const run = this.body.gait > 1.5 && this.speed > 4;
    this.blow = clamp(this.blow + dt * (run ? 0.05 * (this.body.gait - 1) : -0.03), 0, 1);
    if (run || this.blow < 0.12) { this.breathT = 0.5; return; }
    if ((this.breathT -= dt) > 0) return;
    // Out, then in: a long blow and a shorter draw, every 1.3–3 s.
    this.exhale = !this.exhale;
    this.#breath(this.exhale, 0);
    const every = lerp(3, 1.3, this.blow);
    this.breathT = every * (this.exhale ? 0.4 : 0.6);
  }

  #breath(out, k) {
    const at = this.rig.bones.head.getWorldPosition(_h).clone();
    this.events.push({ type: 'breath', at, out, level: clamp(0.3 + 0.4 * k + 0.5 * this.blow, 0, 1) });
  }

  // ---- What it's up to ----
  #to(state) {
    this.state = state;
    this.t = 0;
    this.goal = null;
    this.comeYaw = undefined;
  }

  #think(dt, who, camera) {
    this.t += dt;
    this.calm -= dt;
    const a = this.attention;
    const d = who ? Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z) : Infinity;
    const sp = who ? Math.hypot(who.vel.x, who.vel.z) : 0;
    // Someone it knows about walked off, or got into something.
    if (!who && ['notice', 'come', 'wait'].includes(this.state)) { this.#roam(); this.calm = 5; }

    switch (this.state) {
      case 'roam': {
        this.#roaming(dt);
        a.alert = 0;
        // Left far from its pasture with nobody to see: back home.
        const away = Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z);
        if (away > this.home.r * 1.5 && (!camera || camera.position.distanceTo(this.pos) > 300)) this.#home();
        if (who && d < NOTICE && this.calm <= 0) {
          this.#to('notice');
          this.events.push({ type: 'hello', at: this.pos.clone() });
        }
        break;
      }
      case 'notice': {
        // Head up, ears pricked, it watches them; turns to if they're behind it.
        a.graze = 0;
        a.alert = 1;
        this.#lookAt(who.pos);
        if (Math.abs(this.#bearing(who.pos)) > 1.3) this.goal = { x: this.pos.x, z: this.pos.z, speed: 0, stop: 1, face: Math.atan2(who.pos.x - this.pos.x, who.pos.z - this.pos.z) };
        else this.goal = null;
        if (d > NOTICE * 1.5) { this.#roam(); this.calm = 8; }
        else if (this.t > 1.6 && sp < PASSING) this.#to('come');
        break;
      }
      case 'come': {
        // Over to them, its left side to them, trotting from further off.
        a.graze = 0;
        // Heading the way it comes from, so it walks up alongside them; the
        // last few metres it keeps to that line.
        const far = Math.hypot(who.pos.x - this.pos.x, who.pos.z - this.pos.z) > 6;
        if (far || this.comeYaw === undefined) this.comeYaw = far ? Math.atan2(who.pos.x - this.pos.x, who.pos.z - this.pos.z) : this.yaw;
        const spot = this.#beside(who.pos, this.comeYaw);
        const gap = Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z);
        a.alert = d < 7 ? 0.8 : 0.35;
        this.#lookAt(who.pos);
        this.goal = { x: spot.x, z: spot.z, speed: gap > 12 ? 3.2 : 1.5, stop: 0.25, face: spot.yaw };
        if (gap < 0.4 && this.speed < 0.3 && Math.abs(angleTo(this.yaw, spot.yaw)) < 0.35) this.#to('wait');
        else if (d > NOTICE * 1.6 || sp > 7 || (this.t > 30 && d > 6)) { this.#roam(); this.calm = 15; }
        break;
      }
      case 'wait': {
        // Beside them, watching them, until they get on or go.
        a.graze = 0;
        a.alert = d < 8 ? 0.6 : 0.3;
        this.#lookAt(who.pos);
        const spot = this.#beside(who.pos, this.yaw);
        if (Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z) > 3 && sp < 1) this.#to('come');
        if (d > NOTICE * 1.2) { if (this.t > 6 || d > NOTICE * 2) { this.#roam(); this.calm = 20; } } else this.t = Math.min(this.t, 1);
        break;
      }
      case 'present':
        // Standing for them while they come round to its left (wayRound).
        a.graze = 0;
        a.alert = 0.4;
        this.#lookAt(this.who.pos);
        if (this.t > 8) this.mountNow(); // however far they got
        break;
      case 'mount':
      case 'dismount':
        a.graze = a.alert = 0;
        break;
      case 'ridden':
        a.graze = a.alert = 0;
        break;
      case 'pullup': {
        a.graze = a.alert = 0;
        this.gear = 0;
        if (this.speed < 0.15 && Math.abs(this.turnRate) < 0.15) {
          this.#to('dismount');
          this.speed = this.turnRate = 0;
          if (this.rider.model) this.mount.begin(-1);
        }
        break;
      }
    }
  }

  // Roaming: grazing, nose in the snow with a step now and then; wandering to
  // another spot; standing, fidgeting (idle.js). Each for a while, then another.
  #roaming(dt) {
    const a = this.attention;
    this.next -= dt;
    if (this.doing === 'graze') {
      a.graze = 1;
      // A slow step or two on, head down.
      if (!this.goal && Math.random() < dt / 6) this.goal = this.#ahead(rand(0.8, 2), 0.5);
      if (this.goal && this.#near(this.goal, 0.3)) this.goal = null;
    } else if (this.doing === 'walk') {
      a.graze = 0.15;
      if (!this.goal || this.#near(this.goal, 0.6)) this.next = 0;
    } else a.graze = 0;
    if (this.next > 0) return;
    this.doing = pick(this.doing === 'graze' ? [['walk', 6], ['stand', 4]] : this.doing === 'walk' ? [['graze', 7], ['stand', 3]] : [['graze', 6], ['walk', 4]]);
    this.goal = null;
    if (this.doing === 'graze') this.next = rand(15, 40);
    else if (this.doing === 'stand') this.next = rand(6, 16);
    else {
      const s = this.#spot();
      this.goal = { x: s.x, z: s.z, speed: rand(1.2, 1.7), stop: 0.4 };
      this.next = 40;
    }
  }

  // Up in the saddle, or down beside it, once the mount (or dismount) is done.
  #settle() {
    if (this.mount.active) return;
    if (this.state === 'mount' && this.rider.locomotion === 'sit') {
      this.#to('ridden');
      this.gear = 0;
      this.riding.reset();
      this.events.push({ type: 'seated' });
    } else if (this.state === 'dismount') {
      this.#to('wait');
      this.centre = { x: this.pos.x, z: this.pos.z };
      this.calm = 10;
      this.events.push({ type: 'dismounted' });
    }
  }

  // Where a rider stands beside it to get on and off (world; STAND_AT).
  standSpot(out = new THREE.Vector3()) {
    this.tack.metres.updateWorldMatrix(true, false);
    out.copy(STAND_AT).applyMatrix4(this.tack.metres.matrixWorld);
    out.y = this.hf.heightAt(out.x, out.z);
    return out;
  }

  #roam() {
    this.#to('roam');
    this.doing = 'stand';
    this.next = rand(3, 8);
  }

  // Back to its pasture, where nobody sees it go.
  #home() {
    const s = this.#spot(this.home);
    this.pos.set(s.x, this.hf.heightAt(s.x, s.z), s.z);
    this.centre = { x: this.home.x, z: this.home.z };
    this.speed = this.turnRate = 0;
    this.goal = null;
    this.#roam();
  }

  // Where to stand beside someone at `p`, them off its left, heading `yaw`:
  // { x, z, yaw }.
  #beside(p, yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
    return { x: p.x - lx * BESIDE[0] - fx * BESIDE[1], z: p.z - lz * BESIDE[0] - fz * BESIDE[1], yaw };
  }

  // How far round from straight ahead `p` is (+ to its left).
  #bearing(p) {
    return angleTo(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z));
  }

  // Looks round at `p`, from the base of its neck.
  #lookAt(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // in its frame: +x its left, +z ahead
    const a = Math.atan2(lx, lz - 0.5);
    // Behind it, it gives up and looks ahead again.
    this.attention.look = clamp(a, -1.2, 1.2) * (1 - smoothstep(Math.abs(a), 1.8, 2.6));
  }

  // A spot `dist` m straight ahead, to step to at `speed`.
  #ahead(dist, speed) {
    return { x: this.pos.x + Math.sin(this.yaw) * dist, z: this.pos.z + Math.cos(this.yaw) * dist, speed, stop: 0.1 };
  }

  #near(p, r) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r;
  }

  // Clear, gentle spots on its pasture to wander between (m, world).
  #pasture() {
    const { x, z, r } = this.home, out = [];
    for (let i = 0; i < 400 && out.length < 40; i++) {
      const a = rand(0, Math.PI * 2), d = r * Math.sqrt(Math.random()), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (radToDeg(Math.acos(this.hf.normalAt(px, pz, _v).y)) < 12 && this.#clear(px, pz, 1.5)) out.push({ x: px, z: pz });
    }
    return out.length ? out : [{ x, z }];
  }

  // A spot to wander to round `about` (where it roams now).
  #spot(about = this.centre) {
    const near = this.spots.filter((s) => Math.hypot(s.x - about.x, s.z - about.z) < this.home.r);
    if (near.length && Math.hypot(about.x - this.home.x, about.z - this.home.z) < this.home.r) return near[Math.floor(Math.random() * near.length)];
    // Away from its pasture: anywhere clear a few metres round.
    for (let i = 0; i < 12; i++) {
      const a = rand(0, Math.PI * 2), d = rand(4, 12), x = about.x + Math.cos(a) * d, z = about.z + Math.sin(a) * d;
      if (this.#clear(x, z, 1) && radToDeg(Math.acos(this.hf.normalAt(x, z, _v).y)) < 20) return { x, z };
    }
    return { x: about.x, z: about.z };
  }

  // ---- Going ----
  // How fast it wants to go and turn: ridden, as the rider asks; otherwise
  // toward its goal (on the spot when it's well round, wider at speed), round
  // trees and buildings. Then as fast as the ground lets it, stopping short of
  // anything in the way, and onto the ground under it.
  #move(dt) {
    let want = 0, turn = 0;
    const fast = Math.max(Math.abs(this.speed), 0.5);
    const most = this.speed < 0.6 ? 1.3 : clamp(9 / fast, 0.8, 1.5); // rad/s it turns at most
    if (this.state === 'ridden' || this.state === 'pullup') {
      want = PACES[this.gear].speed;
      turn = this.state === 'ridden' ? this.reins.steer * most : 0;
    } else if (this.goal) {
      const g = this.goal, dx = g.x - this.pos.x, dz = g.z - this.pos.z, dist = Math.hypot(dx, dz);
      let aim;
      if (dist > g.stop) {
        aim = Math.atan2(dx, dz);
        want = Math.min(g.speed, Math.sqrt(2 * 1.2 * Math.max(0, dist - g.stop)));
        if (want > 0.3) aim = this.#steer(aim, Math.max(2, this.speed * 0.8));
      } else aim = g.face ?? this.yaw;
      const err = angleTo(this.yaw, aim);
      turn = clamp(err * 2.5, -most, most);
      if (Math.abs(err) > 1.0) want = Math.min(want, 0.6); // well round: turn first
    }
    // The ground ahead, along its heading: no faster than the slope lets it.
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), dir = Math.sign(want || this.speed) || 1;
    const rise = this.hf.heightAt(this.pos.x + fx * 1.5 * dir, this.pos.z + fz * 1.5 * dir) - this.hf.heightAt(this.pos.x, this.pos.z);
    want = Math.min(want, slopeLimit(radToDeg(Math.atan2(rise, 1.5))));
    // Something in the way: it stops short, seeing it as far off as it
    // needs to pull up from the speed it's going.
    const look = 1.4 + this.speed ** 2 / 12;
    this.blocked = want > 0 && [0.5, 1].some((k) => !this.#clear(this.pos.x + fx * look * k, this.pos.z + fz * look * k, 0.45));
    if (this.blocked) want = 0;
    const brake = this.blocked ? 6 : this.reins.brake && this.state === 'ridden' ? 5.5 : 3;
    this.speed += clamp(want - this.speed, -brake * dt, 2.6 * dt);
    this.turnRate += (turn - this.turnRate) * (1 - Math.exp(-dt * 6));
    this.yaw = mod(this.yaw + this.turnRate * dt + Math.PI, Math.PI * 2) - Math.PI;
    if (this.speed > 0.001) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      if (this.#clear(nx, nz, 0.4)) { this.pos.x = nx; this.pos.z = nz; }
      else this.speed = 0;
    }
    this.vel.set(Math.sin(this.yaw) * this.speed, 0, Math.cos(this.yaw) * this.speed);
    // Onto the ground under its hooves: their middle's height, tilted to the
    // slope front to back and (less) side to side.
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), h = (along, across) => this.hf.heightAt(this.pos.x + s * along + c * across, this.pos.z + c * along - s * across);
    const front = h(0.35, 0), back = h(-0.87, 0), left = h(-0.26, 0.5), right = h(-0.26, -0.5);
    // In powder the hooves sink in a little.
    const groomed = 1 - smoothstep(this.piste.distAt(this.pos.x, this.pos.z), PISTE_HALF_WIDTH - 1, PISTE_HALF_WIDTH + 3);
    this.powder = (1 - groomed) * (1 - 0.7 * (1 - smoothstep(this.hf.normalAt(this.pos.x, this.pos.z, _v).y, 0.77, 0.83)));
    this.sink += (this.powder * SINK - this.sink) * (1 - Math.exp(-dt * 4));
    this.pos.y = (front + back) / 2 - this.sink;
    this.tilt.pitch = Math.atan2(back - front, 1.22);
    this.tilt.roll = Math.atan2(left - right, 1.0) * 0.6;
  }

  // The heading nearest `yaw` that's clear `look` m ahead.
  #steer(yaw, look) {
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
      const a = yaw + off;
      if (this.#clear(this.pos.x + Math.sin(a) * look, this.pos.z + Math.cos(a) * look, 0.6)) return a;
    }
    return yaw;
  }

  #clear(x, z, r) {
    const hf = this.hf;
    if (!hf.inside(x, z, 40) || hf.holeAt(x, z)) return false;
    if (this.forest.hit(x, z, r)) return false;
    if ((shoreAt(this.lakes, x, z, 2)?.d ?? 1) < 0.5) return false;
    return this.obstacles.every((o) => o === this.footprint || boxGap(o, x, z) > r);
  }

  #place() {
    this.root.position.copy(this.pos);
    this.root.quaternion.setFromEuler(_e.set(this.tilt.pitch, this.yaw, this.tilt.roll));
    // Its box, round its barrel (a little behind the model's middle).
    const f = this.footprint;
    f.x = this.pos.x - Math.sin(this.yaw) * BOX.back;
    f.z = this.pos.z - Math.cos(this.yaw) * BOX.back;
    f.yaw = this.yaw;
  }
}

// How far (x, z) is outside a rotated box { x, z, yaw, hw, hd }; 0 inside it.
function boxGap(o, x, z) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z;
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - o.hw), Math.max(0, Math.abs(dx * s + dz * c) - o.hd));
}
