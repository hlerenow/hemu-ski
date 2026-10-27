// Dev-only demonstration of the fox (tools/review/fox.html): the rig and body
// the game will use, acted out in three short scenes, each a script the fox
// (and a person standing in for the player) plays through:
//   1. Ears and eyes: flicks, swivels toward a sound, blinks, a wink.
//   2. Running past, it spots someone: stops dead, stares, trots closer, then
//      play-bows (front down, rump up) and shakes itself off.
//   3. Someone walks up and it trots off; then it hovers, creeping closer low
//      and backing off again, and settles to watch from a distance.
//   4. A skier chases it: it bolts off the skier's line and jukes whenever
//      the skier closes in (src/fox/evade.js), until the skier gives up.
// The fox moves by steering toward where the script sends it, so its gait,
// turns and stops come from the body code, as they will in the game.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InkPost } from '../../src/render/post.js';
import { makeToon } from '../../src/render/toon.js';
import { loadFox, FoxRig } from '../../src/fox/rig.js';
import { FoxBody } from '../../src/fox/body.js';
import { evade, evadeState } from '../../src/fox/evade.js';

const SCALE = 0.9; // metres per model unit: about 0.4 m at the shoulder
const { clamp, euclideanModulo: mod } = THREE.MathUtils;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9eff2');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
const post = new InkPost(renderer);
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b9ca8, 2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(6, 10, 5);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -16;
sun.shadow.camera.right = sun.shadow.camera.top = 16;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const snow = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), makeToon({ color: '#f4f7f9' }, { hatch: 0 }));
snow.rotation.x = -Math.PI / 2;
snow.receiveShadow = true;
scene.add(snow);
const grid = new THREE.GridHelper(80, 80, 0xc9d5db, 0xdde5e9);
grid.position.y = 0.002;
scene.add(grid);

// ---- The fox ----
const rig = new FoxRig(await loadFox());
const body = new FoxBody(rig);
body.scale = SCALE;
const fox = new THREE.Group();
rig.scene.scale.setScalar(SCALE);
fox.add(rig.scene);
scene.add(fox);

// ---- A person, standing in for the player ----
const person = new THREE.Group();
const part = (geo, color, y, x = 0) => {
  const m = new THREE.Mesh(geo, makeToon({ color }, { rim: 1, hatch: 0 }));
  m.position.set(x, y, 0);
  m.castShadow = true;
  person.add(m);
  return m;
};
const legs = [-1, 1].map((s) => {
  const hip = new THREE.Group();
  hip.position.set(0.11 * s, 0.86, 0);
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.68, 4, 8), makeToon({ color: '#2b3440' }, { rim: 1, hatch: 0 }));
  leg.position.y = -0.42;
  leg.castShadow = true;
  hip.add(leg);
  person.add(hip);
  return hip;
});
part(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), '#c8463b', 1.18);
part(new THREE.SphereGeometry(0.12, 16, 12), '#f1c9a5', 1.6);
part(new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#2f6f8f', 1.62); // beanie
scene.add(person);

// ---- A skier, crouched on skis, who leans into their turns ----
const skier = new THREE.Group();
const skierBody = new THREE.Group();
skier.add(skierBody);
{
  const mat = (color) => makeToon({ color }, { rim: 1, hatch: 0 });
  const add = (geo, color, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = true;
    skierBody.add(m);
  };
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.09, 0.03, 1.7), '#e2b23a', [0.14 * s, 0.03, 0.1]); // ski
    add(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8), '#2b3440', [0.14 * s, 0.32, 0.12], [-0.45, 0, 0]); // shin
    add(new THREE.CapsuleGeometry(0.08, 0.36, 4, 8), '#2b3440', [0.13 * s, 0.68, 0.05], [0.7, 0, 0]); // thigh
    add(new THREE.CylinderGeometry(0.01, 0.01, 1.15), '#555', [0.36 * s, 0.6, -0.1], [-0.5, 0, 0.15 * s]); // pole
  }
  add(new THREE.CapsuleGeometry(0.19, 0.38, 4, 10), '#2f6f8f', [0, 1.05, 0.12], [0.55, 0, 0]);
  add(new THREE.SphereGeometry(0.12, 16, 12), '#f1c9a5', [0, 1.42, 0.32]);
  add(new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#c8463b', [0, 1.44, 0.32]);
}
skier.visible = false;
scene.add(skier);

// ---- Moving ----
// The fox steers: toward a target at a speed (braking to stop on it), or at a
// speed on a heading (negative backs it up), or turning on the spot to face a
// point. It accelerates briskly and stops harder still, as a fox does.
const motor = { target: null, speed: 0, heading: null, face: null, v: 0, yawRate: 0, turnMax: 5 };
const flat = (p) => new THREE.Vector3(p.x, 0, p.z);
const headingTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => mod(a + Math.PI, Math.PI * 2) - Math.PI;
function steer(dt) {
  let want = 0, aim = fox.rotation.y;
  if (motor.target) {
    const d = fox.position.distanceTo(motor.target);
    aim = headingTo(fox.position, motor.target);
    // Slower while it still has a lot of turning to do, and braking to stop on the spot.
    const turning = Math.abs(wrap(aim - fox.rotation.y));
    want = Math.min(motor.speed * clamp(1.4 - turning, 0.15, 1), Math.sqrt(2 * 7 * Math.max(0, d - 0.05)));
  } else if (motor.heading !== null) {
    aim = motor.heading;
    // A sharp cut costs it some speed: it plants and pushes off the new way.
    want = motor.speed * clamp(1.25 - Math.abs(wrap(aim - fox.rotation.y)) * 0.6, 0.5, 1);
  } else if (motor.face) {
    aim = headingTo(fox.position, motor.face);
  }
  const dy = wrap(aim - fox.rotation.y);
  const rate = clamp(dy * 7, -motor.turnMax, motor.turnMax);
  motor.yawRate += (rate - motor.yawRate) * (1 - Math.exp(-dt * 14));
  fox.rotation.y += motor.yawRate * dt;
  motor.v += clamp(want - motor.v, -9 * dt, 6 * dt);
  fox.position.x += Math.sin(fox.rotation.y) * motor.v * dt;
  fox.position.z += Math.cos(fox.rotation.y) * motor.v * dt;
  body.speed = motor.v / SCALE;
  body.turnRate = motor.yawRate;
}

// Where the fox looks: a point in the world (null: straight ahead).
let lookAt = null;
function look(dt) {
  if (!lookAt) return body.lookAt.set(0, 0, 1);
  const head = fox.localToWorld(new THREE.Vector3(0, 0.55 * SCALE, 0.4 * SCALE));
  const d = lookAt.clone().sub(head);
  d.applyAxisAngle(new THREE.Vector3(0, 1, 0), -fox.rotation.y).normalize();
  // The neck turns the head about 75° at most. Something further round than
  // that, it gives up on: the head comes back to straight ahead as the target
  // goes behind it, rather than wringing the neck after it.
  const a = Math.atan2(d.x, d.z), give = 1 - THREE.MathUtils.smoothstep(Math.abs(a), 1.3, 2.1);
  const yaw = clamp(a, -1.3, 1.3) * give, pitch = Math.asin(clamp(d.y, -1, 1)) * give;
  body.lookAt.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

// The person walks by the same kind of steering, legs swinging.
const walker = { target: null, speed: 0, v: 0, step: 0 };
function walk(dt) {
  let want = 0;
  if (walker.target) {
    const d = person.position.distanceTo(walker.target);
    if (d > 0.05) {
      person.rotation.y += wrap(headingTo(person.position, walker.target) - person.rotation.y) * Math.min(1, dt * 6);
      want = Math.min(walker.speed, d * 2);
    }
  }
  walker.v += clamp(want - walker.v, -4 * dt, 3 * dt);
  person.position.x += Math.sin(person.rotation.y) * walker.v * dt;
  person.position.z += Math.cos(person.rotation.y) * walker.v * dt;
  walker.step += walker.v * dt * 1.7;
  const swing = Math.sin(walker.step * Math.PI) * Math.min(1, walker.v * 1.5) * 0.45;
  legs[0].rotation.x = swing;
  legs[1].rotation.x = -swing;
}

// The skier carves: no tighter than about a 6.5 m circle however hard they
// try, speeding up on the straight and scrubbing a little speed in a hard
// turn. Chasing, they aim a little ahead of the fox; stopping, they snowplough.
const SKI = { top: 10.5, radius: 6.5 };
const ski = { mode: 'off', v: 0, yawRate: 0, aim: 0 };
const foxVel = () => new THREE.Vector3(Math.sin(fox.rotation.y), 0, Math.cos(fox.rotation.y)).multiplyScalar(motor.v);
const skierVel = () => new THREE.Vector3(Math.sin(skier.rotation.y), 0, Math.cos(skier.rotation.y)).multiplyScalar(ski.v);
function glide(dt) {
  if (ski.mode === 'off') return;
  let want = ski.v, aim = skier.rotation.y;
  if (ski.mode === 'chase' || ski.mode === 'cruise') {
    const d = skier.position.distanceTo(fox.position);
    const lead = ski.mode === 'chase' ? clamp(d / Math.max(ski.v, 1), 0, 0.7) : 0;
    aim = headingTo(skier.position, fox.position.clone().addScaledVector(foxVel(), lead));
    want = ski.mode === 'chase' ? SKI.top : 7;
  } else if (ski.mode === 'stop') want = 0;
  const most = Math.max(0.6, ski.v / SKI.radius);
  const rate = clamp(wrap(aim - skier.rotation.y) * 3, -most, most);
  ski.yawRate += (rate - ski.yawRate) * (1 - Math.exp(-dt * 5));
  skier.rotation.y += ski.yawRate * dt;
  const scrub = Math.abs(ski.yawRate) / most > 0.8 ? 1.2 : 0;
  ski.v += clamp(want - ski.v, -4 * dt, 2.5 * dt) - scrub * dt;
  ski.v = Math.max(0, ski.v);
  skier.position.addScaledVector(skierVel(), dt);
  skierBody.rotation.z = -clamp(ski.yawRate * ski.v * 0.06, -0.6, 0.6);
}

// ---- Scripts ----
// Each beat yields until it's done; the frame's dt comes back from each yield.
const caption = document.getElementById('caption');
const say = (text) => { caption.textContent = text; };
function* wait(s) { while (s > 0) s -= yield; }
function* until(test) { while (!test()) yield; }
// Until it's there, or `stop()` says so first.
function* go(to, speed, near = 0.15, stop = () => false) {
  motor.heading = motor.face = null;
  motor.target = flat(to);
  motor.speed = speed;
  yield* until(() => stop() || fox.position.distanceTo(motor.target) < near);
  motor.face = null;
  motor.heading = fox.rotation.y;
  motor.speed = 0;
  motor.target = null;
}
function* face(p) {
  motor.target = null;
  motor.heading = null;
  motor.speed = 0;
  motor.face = flat(p);
  yield* until(() => Math.abs(wrap(headingTo(fox.position, motor.face) - fox.rotation.y)) < 0.08);
}
function* back(dist, speed) {
  const from = fox.position.clone();
  motor.target = motor.face = null;
  motor.heading = fox.rotation.y;
  motor.speed = -speed;
  yield* until(() => fox.position.distanceTo(from) >= dist);
  motor.speed = 0;
}
const headOf = (o, h = 1.6) => new THREE.Vector3(o.position.x, h, o.position.z);
const around = (p, dist, ang) => new THREE.Vector3(p.x + Math.sin(ang) * dist, 0, p.z + Math.cos(ang) * dist);
// Some way from the person, toward or away from the fox.
const offPerson = (dist) => {
  const a = headingTo(person.position, fox.position);
  return around(person.position, dist, a);
};

function reset({ fx = 0, fz = 0, fh = 0, px = 0, pz = 0, ph = 0, showPerson = true }) {
  Object.assign(motor, { target: null, speed: 0, heading: null, face: null, v: 0, yawRate: 0 });
  Object.assign(walker, { target: null, speed: 0, v: 0 });
  fox.position.set(fx, 0, fz);
  fox.rotation.y = fh;
  person.position.set(px, 0, pz);
  person.rotation.y = ph;
  person.visible = showPerson;
  skier.visible = false;
  Object.assign(ski, { mode: 'off', v: 0, yawRate: 0 });
  motor.turnMax = 5;
  Object.assign(body, { posture: 'stand', alert: 0, cower: 0, earsBack: 0, earTurn: 0, drowsy: 0, tilt: 0, wag: 0.05, tailUp: 0, sniff: 0, blinks: true });
  lookAt = null;
}

const SCENES = {
  'Ears & eyes': {
    start: () => reset({ fh: 0.5, showPerson: false }),
    *fox() {
      say('Standing: ears drift, it blinks every few seconds');
      yield* wait(2.4);
      say('Left ear flicks');
      body.play('flickL');
      yield* wait(1.1);
      say('Right ear flicks');
      body.play('flickR');
      yield* wait(1.1);
      say('Both ears flick');
      body.play('flick');
      yield* wait(1.3);
      say('A sound off to its left: the ears turn first, then the head');
      body.earTurn = 1;
      yield* wait(0.5);
      lookAt = fox.localToWorld(new THREE.Vector3(3, 0.3, 0.8));
      body.alert = 0.6;
      yield* wait(1.6);
      body.play('blink');
      yield* wait(0.8);
      body.earTurn = 0;
      body.alert = 0;
      lookAt = null;
      yield* wait(0.8);
      say('Curious: head cocked, ears pricked forward');
      body.alert = 1;
      body.tilt = 0.35;
      yield* wait(1.8);
      body.tilt = -0.2;
      yield* wait(1.0);
      body.tilt = 0;
      body.alert = 0;
      say('A double blink');
      body.blinks = false;
      yield* wait(0.5);
      body.play('blink');
      yield* wait(0.28);
      body.play('blink');
      yield* wait(1.2);
      say('A wink');
      body.play('wink');
      yield* wait(1.2);
      say('Drowsy: lids half down, ears eased back');
      body.drowsy = 1;
      body.earsBack = 0.45;
      yield* wait(1.2);
      body.play('blink', { dur: 0.5 });
      yield* wait(1.6);
      body.drowsy = 0;
      body.earsBack = 0;
      body.blinks = true;
      body.play('flickR');
      say('Awake again: one ear twitches');
      yield* wait(1.6);
    },
  },
  'Spot, stretch, shake': {
    start: () => reset({ fx: -13, fz: 6, fh: Math.PI / 2, px: 0, pz: 0, ph: -Math.PI / 2 }),
    *fox() {
      say('Running across the snow');
      body.tailUp = 0.2;
      yield* go(new THREE.Vector3(8, 0, 6), 6.5, 0.5, () => fox.position.x > -4.5);
      say('Spots someone: stops dead, ears up, stares');
      body.alert = 1;
      body.tailUp = 0;
      lookAt = headOf(person);
      yield* wait(0.6);
      yield* face(person.position);
      yield* wait(1.0);
      body.tilt = 0.3;
      yield* wait(0.9);
      body.tilt = 0;
      say('Trots over, but not too close');
      body.alert = 0.4;
      yield* go(offPerson(2.6), 2.4);
      yield* face(person.position);
      yield* wait(0.4);
      say('Stretches into a play bow: front down, rump up, tail high');
      body.posture = 'bow';
      body.wag = 0.35;
      body.earsBack = 0;
      body.alert = 0.6;
      yield* wait(2.0);
      body.posture = 'stand';
      body.wag = 0.05;
      yield* wait(0.6);
      say('Shakes the snow off its coat');
      body.alert = 0;
      body.play('shake');
      yield* wait(1.8);
      say('An ear flick, and it sits to watch');
      body.play('flick');
      yield* wait(0.5);
      body.posture = 'sit';
      yield* wait(2.4);
    },
  },
  'Shy: off, then back': {
    start: () => reset({ fx: 0, fz: 3, fh: Math.PI / 2, px: -1, pz: -7, ph: 0 }),
    *person() {
      yield* wait(0.8);
      walker.target = new THREE.Vector3(0, 0, 3);
      walker.speed = 1.2;
      yield* until(() => motor.v > 1);
      walker.target = person.position.clone(); // stops where it is when the fox runs
    },
    *fox() {
      say('Nosing about in the snow');
      body.sniff = 0.8;
      yield* until(() => person.position.distanceTo(fox.position) < 4.5);
      say('Someone comes too close: a start…');
      body.sniff = 0;
      body.play('startle');
      lookAt = headOf(person);
      body.earsBack = 0.5;
      yield* wait(0.35);
      say('…and it trots away');
      body.tailUp = -0.3;
      lookAt = null; // eyes on where it's going, not back over its shoulder
      yield* go(offPerson(9), 3.2, 0.3);
      motor.heading = null;
      yield* face(person.position);
      lookAt = headOf(person);
      say('Turns back to look: curious, but wary');
      body.cower = 0.35;
      body.earsBack = 0.5;
      body.wag = 0.3; // a low, nervous swish
      yield* wait(1.4);
      body.play('flickL');
      yield* wait(0.8);
      say('Creeps a few steps closer, low to the snow');
      body.cower = 0.6;
      yield* go(offPerson(7.2), 0.55);
      yield* face(person.position);
      say('Stretches its neck out, ears forward, sniffing the air');
      body.cower = 0.4;
      body.earsBack = 0;
      body.alert = 0.5;
      yield* wait(1.5);
      body.play('blink');
      yield* wait(0.6);
      say('Loses its nerve: flinches and backs off');
      body.play('startle');
      body.alert = 0;
      body.cower = 0.8;
      body.earsBack = 0.8;
      yield* wait(0.25);
      yield* back(1.1, 0.7);
      yield* wait(0.8);
      say('Edges round to the side, then tries again');
      body.cower = 0.45;
      body.earsBack = 0.4;
      const a = headingTo(person.position, fox.position);
      yield* go(around(person.position, 7.5, a + 0.45), 0.9);
      yield* face(person.position);
      yield* go(offPerson(6), 0.5);
      yield* face(person.position);
      say('Settles at a safe distance, watching');
      body.cower = 0;
      body.earsBack = 0.15;
      body.wag = 0.1;
      body.posture = 'sit';
      yield* wait(1.8);
      body.play('flick');
      body.tilt = 0.25;
      yield* wait(1.6);
      body.tilt = 0;
      yield* wait(1.0);
    },
  },
  'Chased by a skier': {
    view: [7, 8, 13],
    start: () => {
      reset({ fx: 0, fz: 0, fh: Math.PI / 2, showPerson: false });
      skier.visible = true;
      skier.position.set(-26, 0, -18);
      skier.rotation.y = headingTo(skier.position, fox.position);
      Object.assign(ski, { mode: 'cruise', v: 7 });
      stats.closest = Infinity;
      stats.jukes = 0;
    },
    *person() {
      yield* until(() => skier.position.distanceTo(fox.position) < 16);
      ski.mode = 'chase';
      yield* wait(15);
      ski.mode = 'stop';
      say('The skier gives up');
    },
    *fox() {
      say('Nosing about in the snow');
      body.sniff = 0.8;
      yield* until(() => skier.position.distanceTo(fox.position) < 24);
      say('A skier coming fast: it looks up');
      body.sniff = 0;
      body.alert = 1;
      lookAt = skier.position.clone().setY(1.2);
      yield* wait(0.5);
      const home = fox.position.clone(), E = evadeState();
      motor.turnMax = 8;
      let was = 'calm', t = 0;
      for (;;) {
        const dt = yield;
        t += dt;
        const r = evade(dt, { pos: fox.position, vel: foxVel() }, { pos: skier.position, vel: skierVel(), turn: ski.yawRate }, E, home, 32);
        if (r.mode !== was) {
          if (r.mode === 'flee') say('It bolts: away, and off the skier\'s line');
          if (r.mode === 'juke') say(`The skier closes in: a hard cut sideways (dodge ${E.jukes}), and the skier overshoots`);
          if (r.mode === 'wary') say('Trots clear, keeping an eye out');
          was = r.mode;
        }
        if (r.mode !== 'calm') {
          lookAt = null;
          body.alert = 0;
          body.earsBack = r.mode === 'wary' ? 0.5 : 0.9;
          body.tailUp = 0.2;
        }
        motor.target = motor.face = null;
        motor.heading = r.heading ?? fox.rotation.y;
        motor.speed = r.speed;
        stats.closest = Math.min(stats.closest, skier.position.distanceTo(fox.position));
        stats.jukes = E.jukes;
        if ((r.mode === 'calm' && ski.mode === 'stop' && ski.v < 0.5) || t > 30) break;
      }
      motor.turnMax = 5;
      motor.speed = 0;
      yield* wait(0.8);
      yield* face(skier.position);
      say('Safe: it looks back, ears still flat');
      lookAt = skier.position.clone().setY(1.2);
      body.earsBack = 0.5;
      yield* wait(1.4);
      say('Shakes the snow off, and sits to watch');
      body.earsBack = 0.2;
      body.play('shake');
      yield* wait(1.8);
      body.posture = 'sit';
      yield* wait(2.2);
    },
  },
};
const stats = { closest: Infinity, jukes: 0 };

// ---- Running a scene ----
let current = Object.keys(SCENES)[0], scripts = [], paused = false, rate = 1, elapsed = 0;
const sceneButtons = {};
function start(name) {
  current = name;
  for (const [n, b] of Object.entries(sceneButtons)) b.classList.toggle('on', n === name);
  const S = SCENES[name];
  S.start();
  // The fox's script and the person's run side by side; the scene is over
  // when the fox's is.
  scripts = ['fox', 'person'].filter((k) => S[k]).map((k) => {
    const g = S[k]();
    g.next();
    return { key: k, g, done: false };
  });
  snapCamera();
}
const scenesEl = document.getElementById('scenes');
for (const name of Object.keys(SCENES)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => start(name);
  scenesEl.append(b);
  sceneButtons[name] = b;
}
document.getElementById('restart').onclick = () => start(current);
document.getElementById('pause').onclick = (e) => { paused = !paused; e.target.classList.toggle('on', paused); };
document.getElementById('slow').onclick = (e) => { rate = rate === 1 ? 0.5 : 1; e.target.classList.toggle('on', rate !== 1); };
const loop = document.getElementById('loop'), close = document.getElementById('close');
close.onchange = snapCamera;

// The camera follows what's happening: the fox, and the person or skier if
// they're in it.
function focus() {
  const f = fox.position.clone().setY(0.35);
  if (close.checked) return f;
  if (skier.visible) return f.lerp(skier.position.clone().setY(0.6), 0.5);
  if (!person.visible) return f;
  return f.lerp(person.position.clone().setY(0.6), 0.25);
}
function snapCamera() {
  const t = focus();
  const view = SCENES[current].view;
  const off = close.checked ? new THREE.Vector3(1.0, 0.35, 1.5) : view ? new THREE.Vector3(...view) : person.visible ? new THREE.Vector3(3, 1.7, 5.2) : new THREE.Vector3(1.8, 0.7, 2.6);
  camera.position.copy(t).add(off);
  orbit.target.copy(t);
  orbit.update();
}

const status = document.getElementById('status');
let previous = performance.now(), finishedAt = 0;
window.__fox = { rig, body, fox, person, skier, ski, motor, stats, start, camera, orbit };
function frame(now) {
  const raw = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (!paused) {
    const dt = raw * rate;
    elapsed += dt;
    for (const s of scripts) if (!s.done) s.done = s.g.next(dt).done;
    const over = scripts.filter((s) => s.key !== 'person').every((s) => s.done);
    if (over && !finishedAt) finishedAt = elapsed;
    if (over && loop.checked && elapsed - finishedAt > 1) { finishedAt = 0; start(current); }
    steer(dt);
    walk(dt);
    glide(dt);
    look(dt);
    body.update(dt, () => 0);
    const t = focus(), before = orbit.target.clone();
    orbit.target.lerp(t, 1 - Math.exp(-dt * (skier.visible ? 6 : 3)));
    camera.position.add(orbit.target.clone().sub(before));
    // In the chase, far enough back to keep both the fox and the skier in shot.
    if (skier.visible && !close.checked) {
      const off = camera.position.clone().sub(orbit.target);
      const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1));
      const want = Math.max(new THREE.Vector3(...SCENES[current].view).length(), (skier.position.distanceTo(fox.position) / 2 + 4) / Math.tan(half));
      off.setLength(off.length() + (want - off.length()) * (1 - Math.exp(-dt * 2)));
      camera.position.copy(orbit.target).add(off);
    }
    orbit.update();
  }
  const w = Object.entries(body.w).filter(([, v]) => v > 0.01).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ');
  status.textContent = `${w}\n${motor.v.toFixed(2)} m/s · gait ${body.gait.toFixed(2)} · ${body.hz?.toFixed(2)} Hz\nlids ${body.lids.map((l) => l.toFixed(2)).join(' ')} · acts ${body.acts.map((a) => a.kind).join(',')}`;
  if (document.getElementById('ink').checked) post.render(scene, camera, elapsed);
  else renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight, devicePixelRatio);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
start(current);
requestAnimationFrame(frame);
