// Arcade-plausible snowboard physics on the real heightfield.
// The board slides along the slope under gravity; the active edge bleeds off
// sideways velocity and feeds most of it back along the board (carving), so
// turning costs a little speed rather than a lot. Leaving the ground happens
// naturally when the terrain falls away faster than gravity can follow.
// The edge of the heightfield, tiles deleted in the map editor and the
// buildings (`obstacles`, rotated boxes { x, z, yaw, hw, hd }) are walls you
// slide along; only trees and bad landings knock you over.
import * as THREE from 'three';
import { PISTE_HALF_WIDTH } from '../world/data.js';
import { FALL_DURATION, SHAKE_DURATION, FALL_SLIDE, FALL_REST, FALL_KINDS, fallKind } from './fall.js';
import { shoreAt } from '../world/lakes.js';

const G = 9.81;
const SKATE_SPEED = 4.5; // W on the flat pushes you along up to this (m/s)
const EDGE = 40; // metres kept clear of the heightfield's edge
const SNOW_GRIP = 0.5; // a body sliding on snow: friction against its weight
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
const _g = new THREE.Vector3(), _t = new THREE.Vector3();

export class BoardPhysics {
  constructor({ hf, piste, forest, obstacles = [], lakes = [] }) {
    this.hf = hf;
    this.piste = piste;
    this.forest = forest;
    this.obstacles = obstacles;
    this.lakes = lakes; // open water: their shores are walls (see world/lakes.js)
    this.crashDir = new THREE.Vector3(); // travel direction when you went down
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3(); // position at the start of the step, for the hole walls
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.yaw = 0;
    this.yawRate = 0;
    this.grounded = true;
    this.airTime = 0;
    this.crashed = 0;
    this.shakeOff = 0;
    this.crashMotion = { side: 0, forward: 1, speed: 0 };
    this.slip = 0; // sideways skid speed, drives spray + sound
    this.powder = 0; // how deep the snow underfoot is, 0 (groomed) to 1 (powder)
    this.jumpCharge = 0;
    this.flip = 0;
    this.flipTarget = 0;
    this.landingRecovery = 0;
    this.events = [];
  }

  reset(x, z, yaw) {
    this.pos.set(x, this.hf.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = 0;
    this.grounded = true;
    this.crashed = this.shakeOff = 0;
    this.airTime = 0;
    this.flip = this.landingRecovery = this.jumpCharge = 0;
    this.flipTarget = 0;
    this.hf.normalAt(x, z, this.normal);
  }

  get speed() { return this.vel.length(); }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  crash(reason, tree = null) {
    if (this.crashed > 0) return;
    this.crashed = FALL_DURATION;
    this.shakeOff = 0;
    const lateral = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const along = -this.vel.x * Math.sin(this.yaw) - this.vel.z * Math.cos(this.yaw);
    this.crashMotion = {
      side: reason === 'sideways landing' || Math.abs(lateral) > Math.abs(along) ? Math.sign(lateral) || 1 : 0,
      forward: Math.sign(along) || 1,
      speed: this.speed,
      reason,
    };
    this.crashMotion.kind = fallKind(this.crashMotion);
    this.vel.y = 0;
    this.vel.multiplyScalar(0.7); // the catch itself takes the edge off
    this.flip = this.flipTarget = 0;
    this.crashDir.set(this.vel.x, 0, this.vel.z);
    if (this.crashDir.lengthSq() < 1) this.forward(this.crashDir);
    this.crashDir.normalize();
    this.events.push({ type: 'crash', reason, tree });
  }

  step(dt, input) {
    const hf = this.hf;
    this.prev.copy(this.pos);
    // Cosmetic recovery yields to steering, skating, braking or jumping.
    this.shakeOff = input.steer || input.tuck || input.brake || input.jump ? 0 : Math.max(0, this.shakeOff - dt);
    this.landingRecovery = Math.max(0, this.landingRecovery - dt);
    if (this.crashed > 0) {
      this.crashed = Math.max(0, this.crashed - dt);
      const age = FALL_DURATION - this.crashed;
      const n = hf.normalAt(this.pos.x, this.pos.z, this.normal);
      if (age < FALL_SLIDE) {
        // Sliding on the body: the slope pulls you down it, the snow drags.
        this.vel.x += G * n.y * n.x * dt;
        this.vel.z += G * n.y * n.z * dt;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 0) this.vel.multiplyScalar(Math.max(0, sp - (SNOW_GRIP * G * n.y + 0.02 * sp * sp) * dt) / sp);
      } else {
        this.vel.multiplyScalar(Math.exp(-dt * 9)); // the uphill edge digs in
      }
      if (age >= FALL_REST) this.vel.set(0, 0, 0); // fixed board during the push to standing
      // Sliding, the board swings round below you, across the fall line, so
      // you stop on its uphill edge and stand up facing up the hill (off the
      // knees) or down it (off the seat).
      const fall = Math.hypot(n.x, n.z);
      if (fall > 0.09 && age > 0.3 && age < FALL_REST) {
        const chest = FALL_KINDS[this.crashMotion.kind].rest === 'chest' ? -1 : 1; // chest faces down (1) or up the hill
        const target = Math.atan2(-n.z * chest, n.x * chest);
        let d = target - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * (1 - Math.exp(-dt * 3.5));
      }
      this.pos.addScaledVector(this.vel, dt);
      // A grounded slide, not a second integration of the impact velocity.
      this.grounded = true;
      this.vel.y = 0;
      this.#walls();
      this.pos.y = hf.heightAt(this.pos.x, this.pos.z);
      hf.normalAt(this.pos.x, this.pos.z, this.normal);
      if (this.crashed <= 0) {
        this.shakeOff = SHAKE_DURATION;
        this.events.push({ type: 'recovered' });
      }
      return;
    }

    // Standing on the uphill edge, shaking off: the board holds until you ride.
    if (this.shakeOff > 0 && this.grounded) {
      this.vel.set(0, 0, 0);
      this.pos.y = hf.heightAt(this.pos.x, this.pos.z);
      hf.normalAt(this.pos.x, this.pos.z, this.normal);
      return;
    }

    const speed = this.vel.length();
    // Turn rate limited so lean (v·ω/g) stays under ~55°.
    const maxRate = Math.min(2.2, 14 / Math.max(speed, 1));
    let target = input.steer * maxRate;
    if (!this.grounded) target = input.steer * 4.5; // spins
    this.yawRate += (target - this.yawRate) * (1 - Math.exp(-dt * 7));
    this.yaw += this.yawRate * dt;

    if (this.grounded) this.#ground(dt, input, speed);
    else this.#air(dt, input);

    this.#walls();
    const tree = this.forest.hit(this.pos.x, this.pos.z, 0.35);
    if (tree) {
      if (this.vel.length() > 4.5) this.crash('tree', tree);
      else {
        _t.set(this.pos.x - tree.x, 0, this.pos.z - tree.z).normalize();
        this.pos.addScaledVector(_t, 0.05);
        this.vel.multiplyScalar(0.5);
      }
    }
  }

  // On foot: deliberate ground movement, without the board's downhill gravity.
  // Keep the same map/building walls, and refuse cliffs and unwalkable slopes.
  stepWalk(dt, input) {
    if (dt <= 0) return;
    this.prev.copy(this.pos);
    this.grounded = true;
    this.airTime = this.jumpCharge = this.slip = 0;
    const targetTurn = input.steer * 2.6;
    this.yawRate += (targetTurn - this.yawRate) * (1 - Math.exp(-dt * 10));
    this.yaw += this.yawRate * dt;
    this.hf.normalAt(this.pos.x, this.pos.z, this.normal);
    this.forward(_f).addScaledVector(this.normal, -_f.dot(this.normal)).normalize();
    const speed = input.walk && !input.brake ? (input.run ? 4 : 1.4) : 0;
    const blend = 1 - Math.exp(-dt * (speed > 0 ? 8 : 14));
    this.vel.x += (_f.x * speed - this.vel.x) * blend;
    this.vel.z += (_f.z * speed - this.vel.z) * blend;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.#walls();

    const tree = this.forest.hit(this.pos.x, this.pos.z, 0.35);
    const entersTree = tree && Math.hypot(this.pos.x - tree.x, this.pos.z - tree.z)
      <= Math.hypot(this.prev.x - tree.x, this.prev.z - tree.z);
    const height = this.hf.heightAt(this.pos.x, this.pos.z);
    const distance = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z);
    const normal = this.hf.normalAt(this.pos.x, this.pos.z, _n);
    // 50 degrees is the steepest walkable surface. The small height tolerance
    // absorbs sampled-height noise while still blocking an abrupt ledge.
    if (entersTree || normal.y < Math.cos(Math.PI * 50 / 180)
      || Math.abs(height - this.prev.y) > distance * 1.2 + 0.08) {
      this.pos.copy(this.prev);
      this.vel.set(0, 0, 0);
      this.hf.normalAt(this.pos.x, this.pos.z, this.normal);
    } else {
      this.pos.y = height;
      this.vel.y = (height - this.prev.y) / dt;
      this.normal.copy(normal);
    }
  }

  #ground(dt, input, speed) {
    const n = this.hf.normalAt(this.pos.x, this.pos.z, _n);
    this.normal.copy(n);
    this.forward(_f);
    _f.addScaledVector(n, -_f.dot(n)).normalize();
    _s.crossVectors(n, _f);

    // Gravity along the slope.
    _g.set(0, -G, 0).addScaledVector(n, G * n.y);
    this.vel.addScaledVector(_g, dt);

    // The snow: groomed on the runs, powder off them (less where the wind has
    // scoured the steep faces down to rock, the faces the terrain paints as rock).
    const groomed = 1 - THREE.MathUtils.smoothstep(this.piste.distAt(this.pos.x, this.pos.z), PISTE_HALF_WIDTH - 1, PISTE_HALF_WIDTH + 3);
    this.powder = (1 - groomed) * (1 - 0.7 * (1 - THREE.MathUtils.smoothstep(n.y, 0.77, 0.83)));

    // Edge grip: kill lateral velocity, return most of it along the board.
    // In powder the edge holds less, so the board drifts and sprays.
    let vf = this.vel.dot(_f);
    let vs = this.vel.dot(_s);
    const grip = (input.brake ? 2.2 : 7.5) * (1 - 0.15 * this.powder);
    const newVs = vs * Math.exp(-grip * dt);
    const removed = Math.abs(vs) - Math.abs(newVs);
    vf += Math.sign(vf || 1) * removed * (input.brake ? 0.1 : 0.8);
    this.slip = Math.abs(vs);
    this.vel.copy(_f).multiplyScalar(vf).addScaledVector(_s, newVs);

    // Snow friction + air drag. Powder holds you back most at walking pace and
    // less as the board planes up on it, and over all about as much as before.
    let mu = 0.035 + 0.025 * this.powder;
    if (input.brake) mu += 0.5;
    const drag = input.tuck ? 0.0022 : 0.0042;
    const sp = this.vel.length();
    const plough = 0.06 * this.powder * sp * (1 - 0.55 * THREE.MathUtils.smoothstep(sp, 4, 14));
    const dec = mu * G * n.y + drag * sp * sp + plough;
    if (sp > 0) this.vel.multiplyScalar(Math.max(0, sp - dec * dt) / sp);

    // Skating: on the flat (or to get going), W pushes off along the nose.
    if (input.tuck && !input.brake && this.vel.dot(_f) < SKATE_SPEED) this.vel.addScaledVector(_f, 3.2 * dt);

    // Ollie: hold to load, release to pop.
    if (input.jump) this.jumpCharge = Math.min(1, this.jumpCharge + dt * 2.5);
    else if (this.jumpCharge > 0) {
      this.vel.addScaledVector(n, 2.6 + this.jumpCharge * 2.6);
      this.jumpCharge = 0;
      this.#takeoff();
      this.pos.addScaledVector(this.vel, dt);
      return;
    }

    const y0 = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const h = this.hf.heightAt(this.pos.x, this.pos.z);
    const ballistic = y0 + this.vel.y * dt - 0.5 * G * dt * dt;
    if (h < ballistic - 0.04 && sp > 7) {
      this.pos.y = ballistic;
      this.#takeoff();
    } else {
      this.pos.y = h;
      // Follow the new surface, keeping (most of) the speed.
      const n2 = this.hf.normalAt(this.pos.x, this.pos.z, _t);
      const m = this.vel.length();
      this.vel.addScaledVector(n2, -this.vel.dot(n2));
      const m2 = this.vel.length();
      if (m2 > 1e-4) this.vel.multiplyScalar((m * 0.999) / m2);
    }
  }

  // Slide along the map edge, building walls and lake shores instead of passing through.
  #walls() {
    const { hf, pos, vel } = this;
    const lim = hf.half - EDGE;
    let hitWall = false;
    // A deleted tile: undo the move along whichever axis carried you into it.
    if (hf.holeAt(pos.x, pos.z)) {
      if (hf.holeAt(pos.x, this.prev.z)) { pos.x = this.prev.x; vel.x = 0; }
      if (hf.holeAt(pos.x, pos.z)) { pos.z = this.prev.z; vel.z = 0; }
      hitWall = true;
    }
    for (const [axis, c] of [['x', hf.center[0]], ['z', hf.center[1]]]) {
      const d = pos[axis] - c;
      if (Math.abs(d) <= lim) continue;
      pos[axis] = c + Math.sign(d) * lim;
      if (vel[axis] * d > 0) vel[axis] = 0;
      hitWall = true;
    }
    const r = 0.5;
    for (const o of this.obstacles) {
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c; // box-local
      const px = o.hw + r - Math.abs(lx), pz = o.hd + r - Math.abs(lz);
      if (px <= 0 || pz <= 0) continue;
      // Push out through the nearest face and drop the speed into it.
      const [nx, nz, depth] = px < pz ? [c * Math.sign(lx), -s * Math.sign(lx), px] : [s * Math.sign(lz), c * Math.sign(lz), pz];
      pos.x += nx * depth;
      pos.z += nz * depth;
      const vn = vel.x * nx + vel.z * nz;
      if (vn < 0) { vel.x -= nx * vn; vel.z -= nz * vn; }
      hitWall = true;
    }
    // The water's edge: back onto the bank, losing the speed toward the water.
    const shore = shoreAt(this.lakes, pos.x, pos.z, 2);
    if (shore && shore.d < 0) {
      pos.x -= shore.nx * shore.d;
      pos.z -= shore.nz * shore.d;
      const vn = vel.x * shore.nx + vel.z * shore.nz;
      if (vn < 0) { vel.x -= shore.nx * vn; vel.z -= shore.nz * vn; }
      hitWall = true;
    }
    if (hitWall && this.grounded) pos.y = hf.heightAt(pos.x, pos.z);
  }

  #takeoff() {
    this.grounded = false;
    this.airTime = 0;
    this.slip = 0;
    this.takeoffYaw = this.yaw;
    this.flip = 0;
    this.flipTarget = 0;
  }

  #air(dt, input) {
    this.airTime += dt;
    // Hold forward to chain rolls at a constant rate for the entire flight.
    // Releasing finishes the current rotation, then holds the upright pose.
    const turn = Math.PI * 2;
    if (input.tuck) {
      this.flip += turn / 0.9 * dt;
      this.flipTarget = Math.ceil((this.flip - 1e-8) / turn) * turn;
    } else if (this.flip < this.flipTarget) {
      this.flip = Math.min(this.flipTarget, this.flip + turn / 0.9 * dt);
    }
    this.vel.y -= G * dt;
    const sp = this.vel.length();
    this.vel.multiplyScalar(1 - 0.0035 * sp * dt);
    this.pos.addScaledVector(this.vel, dt);
    const h = this.hf.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y > h) return;

    // Landing.
    this.pos.y = h;
    const n = this.hf.normalAt(this.pos.x, this.pos.z, _n);
    const impact = -this.vel.dot(n);
    this.vel.addScaledVector(n, impact);
    this.grounded = true;
    const flat = _t.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
    const fwd = this.forward(_f);
    const cos = flat.lengthSq() > 1 ? Math.abs(flat.normalize().dot(fwd)) : 1;
    if (cos < 0.45 && this.vel.length() > 7) return this.crash('sideways landing');
    // Legs absorb a straight landing; forward/tuck adds deliberate bracing.
    // Big drops still hurt, and sideways edge catches still cause a wipeout.
    const capacity = input.tuck ? 36 : 28;
    if (impact > capacity) return this.crash('hard landing');
    this.normal.copy(n);
    const frontRolls = Math.floor((this.flip + 1e-8) / (Math.PI * 2));
    this.flip = this.flipTarget = 0;
    this.landingRecovery = THREE.MathUtils.clamp(impact / 24, 0.15, 0.9);
    this.vel.multiplyScalar(THREE.MathUtils.lerp(0.96, 0.72, THREE.MathUtils.smoothstep(impact, 10, capacity)));
    if (this.airTime > 0.25) this.events.push({ type: 'land', impact });
    if (this.airTime > 0.6 || frontRolls > 0) this.events.push({
      type: 'air',
      frontRolls,
      time: this.airTime,
      spin: Math.round(Math.abs(this.yaw - this.takeoffYaw) / Math.PI) * 180,
    });
  }
}
