// Skiing: stand-in twin-tip skis and poles, and the skier's pose.
// The skis and poles are built from primitives until the Tripo ones arrive
// (asset lab 01-prompts/twin-tip-skis-v01.md): one ski with its binding, used
// for both feet, and one pole for both hands, in the same colours. A model
// that replaces them keeps the same frames (see makeSki and makePole).
//
// The pose follows bonvo.ski's skier: parallel skis a hip width apart, the
// hips moving into a turn while the upper body stays upright and faces down
// the hill, the inside ski a little ahead, a pole planted at the start of
// every turn, a snowplough to brake and a tuck for speed. Each part of the
// pose is a channel eased toward its target by a damped spring, the hands
// and head looser than the hips, so they overshoot a little and look alive.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

// Metres. `sole`: how high the boot soles stand above the snow, on the ski
// and the binding's plate.
export const SKI = { length: 1.4, waist: 0.11, tip: 0.13, thick: 0.02, sole: 0.035 };
export const POLE = { length: 0.82 }; // the hand to the tip
const STANCE = 0.125; // each foot out from the middle

const C = {
  top: '#3d6fa6', // muted mid-blue, as the female rider's board
  stripe: '#b9d4ee', // pale ice blue
  accent: '#f2a7b9', // pale pink
  navy: '#1f2a44',
  binding: '#efe9dc', // off-white, as the board's bindings
  steel: '#a9b2b8',
};
const M = Object.fromEntries(Object.entries(C).map(([k, c]) => [k, makeToon({ color: c }, { rim: 1, hatch: 0 })]));

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// A ski's body: waisted, rounded at both ends, tip and tail turned up (the
// tail a little lower), its base on y = 0, the tip toward +z.
function skiGeometry(width = 1, thick = SKI.thick) {
  const L = SKI.length, half = L / 2, rise = 0.2, round = 0.1;
  const g = new THREE.BoxGeometry(1, thick, L, 4, 1, 56).translate(0, thick / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i), a = Math.abs(z) / half;
    const end = Math.max(0, Math.abs(z) - (half - round)) / round;
    const w = (SKI.waist + (SKI.tip - SKI.waist) * a * a) * Math.sqrt(Math.max(0.05, 1 - end ** 4)) * width;
    pos.setX(i, pos.getX(i) * w);
    const over = Math.max(0, Math.abs(z) - (half - rise));
    pos.setY(i, pos.getY(i) + over * over * (z > 0 ? 1.9 : 1.6));
  }
  g.computeVertexNormals();
  return g;
}

// One ski with its binding, in the foot's frame: the boot centre over the
// binding's middle at the origin, the soles at y = 0, the base SKI.sole below.
export function makeSki() {
  const ski = new THREE.Group();
  ski.name = 'Ski';
  const body = new THREE.Group();
  body.position.y = -SKI.sole;
  ski.add(body);
  part(skiGeometry(), M.top, body).receiveShadow = true;
  part(skiGeometry(1.04, 0.007), M.navy, body, 0, -0.002, 0).castShadow = false; // base and edges
  const flat = SKI.length - 0.42;
  part(new THREE.BoxGeometry(0.026, 0.003, flat), M.stripe, body, 0, SKI.thick + 0.001, 0);
  for (const z of [-1, 1]) part(new THREE.BoxGeometry(0.06, 0.003, 0.05), M.accent, body, 0, SKI.thick + 0.002, z * (flat / 2 - 0.08));
  // The binding: a plate, the toe piece and heel piece either end of the boot
  // (whose sole runs about 0.17 m each way), brakes folded up at the heel.
  const b = new THREE.Group();
  b.position.y = SKI.thick;
  body.add(b);
  part(new THREE.BoxGeometry(0.075, 0.015, 0.44), M.binding, b, 0, 0.0075, 0);
  part(new THREE.BoxGeometry(0.09, 0.045, 0.07), M.binding, b, 0, 0.036, 0.205);
  part(new THREE.BoxGeometry(0.06, 0.012, 0.05), M.navy, b, 0, 0.064, 0.21);
  part(new THREE.BoxGeometry(0.095, 0.06, 0.085), M.binding, b, 0, 0.044, -0.2);
  part(new THREE.BoxGeometry(0.05, 0.016, 0.085), M.navy, b, 0, 0.08, -0.215).rotation.x = -0.25;
  for (const x of [-1, 1]) part(new THREE.BoxGeometry(0.012, 0.03, 0.07), M.navy, b, x * 0.052, 0.03, -0.15);
  return ski;
}

// One pole, its grip at the origin, the shaft down -y to the tip POLE.length below.
export function makePole() {
  const pole = new THREE.Group();
  pole.name = 'Pole';
  const L = POLE.length;
  part(new THREE.CylinderGeometry(0.011, 0.009, L - 0.06, 7).translate(0, -(L + 0.06) / 2, 0), M.steel, pole);
  part(new THREE.CylinderGeometry(0.024, 0.02, 0.15, 9), M.navy, pole, 0, 0, 0);
  part(new THREE.SphereGeometry(0.026, 9, 6), M.navy, pole, 0, 0.075, 0);
  part(new THREE.CylinderGeometry(0.017, 0.017, 0.015, 9), M.accent, pole, 0, -0.082, 0);
  part(new THREE.TorusGeometry(0.035, 0.007, 5, 12), M.binding, pole, 0, 0.06, 0.028).rotation.x = 1.2; // wrist strap
  part(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 14), M.navy, pole, 0, -L + 0.09, 0);
  part(new THREE.TorusGeometry(0.055, 0.006, 5, 16), M.binding, pole, 0, -L + 0.09, 0).rotation.x = Math.PI / 2;
  part(new THREE.ConeGeometry(0.009, 0.05, 6).rotateX(Math.PI), M.steel, pole, 0, -L + 0.025, 0);
  return pole;
}

// ---------- The pose ----------
// Body frame: +z the way the skier faces, +x their left, y up from the snow.
// Hips (p*), torso on the hips (t*), head on the torso (h*), hands from the
// hips (hl*, hr*), the knees, each foot (l*, r*: place and yaw, pitch, roll),
// the pole tips (pl*, pr*, from the snow under the skier) and how far the
// whole skier leans into the turn (roll). Each channel's spring: [ω, ζ].
const SPRINGS = { p: [21, 0.88], t: [17, 0.78], h: [15, 0.7], hand: [24, 0.62], pole: [38, 0.9], foot: [23, 1], knee: [23, 1], roll: [12, 1] };
const CHANNELS = {
  px: 'p', py: 'p', pz: 'p', pPitch: 'p', pYaw: 'p', pRoll: 'p',
  tPitch: 't', tYaw: 't', tRoll: 't',
  hPitch: 'h', hYaw: 'h', hRoll: 'h',
  hlx: 'hand', hly: 'hand', hlz: 'hand', hrx: 'hand', hry: 'hand', hrz: 'hand',
  kneeOut: 'knee', kneeShift: 'knee',
  lx: 'foot', ly: 'foot', lz: 'foot', lYaw: 'foot', lPitch: 'foot', lRoll: 'foot',
  rx: 'foot', ry: 'foot', rz: 'foot', rYaw: 'foot', rPitch: 'foot', rRoll: 'foot',
  plx: 'pole', ply: 'pole', plz: 'pole', prx: 'pole', pry: 'pole', prz: 'pole',
  roll: 'roll',
};
const NAMES = Object.keys(CHANNELS);
const MU = THREE.MathUtils;

export class SkiPose {
  constructor() {
    this.x = {}; // the pose now
    this.v = {};
    this.tgt = {};
    for (const k of NAMES) this.x[k] = this.v[k] = this.tgt[k] = 0;
    this.snap = true; // take the next targets at once (a new rider, new gear)
    this.ground = 1; // eases to 0 in the air
    this.plantT = 9; // s since the last pole plant
    this.plantSide = 1; // 1 left, -1 right
    this.turnSide = 0; // the way the last turn went
  }

  // `s`: { lean (rad, + to the left), speed, air, brake, tuck, charge (0–1),
  // slip (m/s sideways), landing (s of landing recovery left) }; `t`: a clock.
  update(dt, s, t) {
    this.ground += ((s.air ? 0 : 1) - this.ground) * (1 - Math.exp(-dt * 10));
    this.#targets(dt, s, t);
    const { x, v, tgt } = this;
    if (this.snap) {
      for (const k of NAMES) { x[k] = tgt[k]; v[k] = 0; }
      this.snap = false;
      return x;
    }
    // Semi-implicit steps short enough for the stiffest spring.
    const n = Math.max(1, Math.ceil(dt * 38 / 0.25)), h = dt / n;
    for (const k of NAMES) {
      const [w, z] = SPRINGS[CHANNELS[k]];
      let xk = x[k], vk = v[k];
      for (let i = 0; i < n; i++) {
        vk += (w * w * (tgt[k] - xk) - 2 * z * w * vk) * h;
        xk += vk * h;
      }
      x[k] = xk; v[k] = vk;
    }
    return x;
  }

  #hands(lx, ly, lz, rx, ry, rz, w) {
    if (w <= 0) return;
    const o = this.tgt;
    o.hlx += (lx - o.hlx) * w; o.hly += (ly - o.hly) * w; o.hlz += (lz - o.hlz) * w;
    o.hrx += (rx - o.hrx) * w; o.hry += (ry - o.hry) * w; o.hrz += (rz - o.hrz) * w;
  }

  #tips(lx, ly, lz, rx, ry, rz, w) {
    if (w <= 0) return;
    const o = this.tgt;
    o.plx += (lx - o.plx) * w; o.ply += (ly - o.ply) * w; o.plz += (lz - o.plz) * w;
    o.prx += (rx - o.prx) * w; o.pry += (ry - o.pry) * w; o.prz += (rz - o.prz) * w;
  }

  #targets(dt, s, t) {
    const o = this.tgt, g = this.ground, air = 1 - g;
    const e = MU.clamp(s.lean / 0.7, -1, 1) * g; // the turn: + to the left
    const brake = (s.brake ? 1 : 0) * g;
    const tuck = Math.max(s.tuck ? 1 : 0, 0.5 * MU.smoothstep(s.speed, 16, 28)) * g * (1 - brake);
    const charge = (s.charge || 0) * g;
    const idle = g * (1 - MU.smoothstep(s.speed, 0.3, 1.2)) * (1 - brake);
    const roll = 0.75 * s.lean * g;

    // Standing: skis parallel, a little forward over them, hands out in
    // front, the poles trailing out behind.
    o.roll = roll;
    o.px = 0.06 * e; o.py = 0.69 - 0.07 * Math.abs(e); o.pz = -0.04;
    o.pPitch = 0.12; o.pYaw = -0.15 * e; o.pRoll = 0.15 * roll; // the hips face out of the turn
    o.tPitch = 0.18; o.tYaw = -0.05 * e; o.tRoll = 0.35 * roll; // the upper body stays upright
    o.hPitch = -0.28; o.hYaw = 0.35 * e; o.hRoll = 0.3 * roll; // head level, looking into the turn
    o.hlx = 0.3; o.hly = 0.1; o.hlz = 0.3 + 0.06 * e;
    o.hrx = -0.3; o.hry = 0.1; o.hrz = 0.3 - 0.06 * e;
    o.plx = 0.45; o.ply = 0.05; o.plz = -0.55;
    o.prx = -0.45; o.pry = 0.05; o.prz = -0.55;
    o.kneeOut = 0.06; o.kneeShift = 0.5 * e; // knees into the turn
    o.lx = STANCE; o.ly = 0; o.lz = 0.06 * Math.max(0, e); // the inside ski leads
    o.rx = -STANCE; o.ry = 0; o.rz = 0.06 * Math.max(0, -e);
    o.lYaw = o.rYaw = o.lPitch = o.rPitch = 0;
    o.lRoll = o.rRoll = -0.15 * e; // further on edge than the body leans

    // A pole planted at the start of each turn, on its inside: the hand
    // reaches forward and down, the tip touches the snow ahead, for half a second.
    const side = Math.abs(e) > 0.18 ? Math.sign(e) : 0;
    if (side && side !== this.turnSide && g > 0.9 && !brake && s.speed > 2.5 && this.plantT > 0.55) {
      this.plantT = 0;
      this.plantSide = side;
    }
    if (side) this.turnSide = side;
    this.plantT = Math.min(this.plantT + dt, 9);
    if (this.plantT < 0.5) {
      const k = Math.sin(Math.PI * this.plantT / 0.5) * g;
      if (this.plantSide > 0) {
        o.hlx += (0.3 - o.hlx) * k; o.hly += (-0.02 - o.hly) * k; o.hlz += (0.44 - o.hlz) * k;
        o.plx += (0.34 - o.plx) * k; o.ply += (0 - o.ply) * k; o.plz += (0.62 - o.plz) * k;
      } else {
        o.hrx += (-0.3 - o.hrx) * k; o.hry += (-0.02 - o.hry) * k; o.hrz += (0.44 - o.hrz) * k;
        o.prx += (-0.34 - o.prx) * k; o.pry += (0 - o.pry) * k; o.prz += (0.62 - o.prz) * k;
      }
    }

    // Tuck: folded low over the skis, head up, hands together in front of the
    // chin, the elbows down by the knees, the poles tucked back under the arms.
    // The fold brings the shoulders about 0.2 up and 0.43 ahead of the hips:
    // the hands go well ahead of them, or the elbows fold back past the body.
    if (tuck > 0) {
      o.py -= 0.2 * tuck; o.pz -= 0.07 * tuck;
      o.pPitch += 0.45 * tuck; o.tPitch += 0.55 * tuck; o.hPitch -= 0.75 * tuck;
      this.#hands(0.08, 0.11, 0.7, -0.08, 0.11, 0.7, tuck);
      this.#tips(0.42, 0.85, -0.9, -0.42, 0.85, -0.9, tuck);
    }
    // Loading a jump.
    if (charge > 0.001) {
      o.py -= 0.06 * charge; o.tPitch += 0.08 * charge;
      this.#hands(0.24, 0.02, 0.38, -0.24, 0.02, 0.38, 0.6 * charge);
      this.#tips(0.4, 0.25, -0.9, -0.4, 0.25, -0.9, 0.6 * charge);
    }
    // Snowplough: tips in, tails out, on the inside edges, knees in, arms out wide.
    if (brake > 0) {
      o.lYaw -= 0.22 * brake; o.rYaw += 0.22 * brake;
      o.lx += 0.11 * brake; o.rx -= 0.11 * brake;
      o.lRoll += 0.15 * brake; o.rRoll -= 0.15 * brake;
      o.kneeOut -= 0.45 * brake;
      o.py -= 0.05 * brake; o.pz -= 0.03 * brake;
      this.#hands(0.34, 0.08, 0.2, -0.34, 0.08, 0.2, brake);
      this.#tips(0.64, 0.02, -0.1, -0.64, 0.02, -0.1, brake);
    }
    // In the air: skis drawn up, tips up and scissoring slowly, arms circling.
    if (air > 0.001) {
      const sc = 0.07 * Math.sin(5.2 * t);
      o.ly += 0.08 * air; o.ry += 0.08 * air;
      o.lPitch -= (0.1 + sc) * air; o.rPitch -= (0.1 - sc) * air;
      o.py -= 0.04 * air; o.tPitch += 0.1 * air;
      const u = t * 6.5, m = 0.08;
      this.#hands(0.42 + Math.sin(u) * m, 0.26 + Math.cos(u) * m, 0.12, -0.42 - Math.sin(u + 2.1) * m, 0.26 + Math.cos(u + 2.1) * m, 0.1, 0.55 * air);
      this.#tips(0.46, 0.1, -0.75, -0.46, 0.1, -0.75, air);
    }
    // Absorbing a landing.
    if (s.landing > 0) { o.py -= 0.12 * Math.min(1, s.landing * 2) * g; o.tPitch += 0.1 * g; }
    // Skidding: the skis chatter, arms out.
    const skid = MU.smoothstep(s.slip || 0, 1.5, 5) * g;
    if (skid > 0.001) {
      o.py -= 0.03 * skid - (0.6 * Math.sin(21 * t) + 0.4 * Math.sin(33 * t + 2)) * 0.012 * skid;
      o.hlx += 0.08 * skid; o.hrx -= 0.08 * skid; o.hly += 0.1 * skid; o.hry += 0.1 * skid;
    }
    // Standing still: leaning on the poles beside the boots, looking round.
    if (idle > 0.001) {
      o.py += 0.02 * idle; o.tPitch -= 0.08 * idle;
      o.hYaw += (0.5 * Math.sin(0.55 * t) + 0.14 * Math.sin(1.31 * t)) * idle;
      o.px += 0.02 * Math.sin(0.37 * t) * idle;
      this.#hands(0.26, 0.02, 0.2, -0.26, 0.02, 0.2, 0.7 * idle);
      this.#tips(0.42, 0, 0.12, -0.42, 0, 0.12, idle);
    }
  }
}
