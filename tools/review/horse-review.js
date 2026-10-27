// Dev-only inspection surface for the horse (tools/review/horse.html): the
// rig and body the game will use (src/horse/), toon-shaded and inked as the
// game draws things, with a rider in the saddle or standing beside it. The
// horse walks, trots, canters and gallops in place, the ground running under
// it. The pose sliders turn a few bones on top of that, to check the weights
// bend cleanly. The saddle is the Kazakh saddle model; the stirrups and reins
// are placeholders (horse-tack.js) for checking the riding fit; the rider sits
// through the game's own seated pose.
//
// Model frame: +z forward, +x the horse's left, +y up, hooves at y = 0, about
// a unit from nose to tail.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InkPost } from '../../src/render/post.js';
import { makeToon } from '../../src/render/toon.js';
import { Rider } from '../../src/player/rider.js';
import { loadHorse, HorseRig, LEGS } from '../../src/horse/rig.js';
import { HorseBody, GAIT_NAMES } from '../../src/horse/body.js';
import { Tack, loadSaddle } from './horse-tack.js';

const WITHERS = 0.63; // model units, measured off the mesh
const GRID = 0.5; // metres between the ground's lines
const { degToRad, euclideanModulo: mod } = THREE.MathUtils;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7edf0');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
const post = new InkPost(renderer);
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8b9ca8, 2));
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(3, 5, 4);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
sun.shadow.camera.right = sun.shadow.camera.top = 3;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), makeToon({ color: '#f4f7f9' }, { hatch: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// The lines run back under the horse as fast as it goes.
const grid = new THREE.GridHelper(20, 20 / GRID, 0x80939c, 0xb7c5cb);
grid.position.y = 0.002;
scene.add(grid);

// ---- The horse ----
const rig = new HorseRig(await loadHorse());
const body = new HorseBody(rig);
const model = rig.scene, bones = rig.bones;
const vertices = rig.mesh.geometry.attributes.position.count;
const horse = new THREE.Group();
horse.add(model);
scene.add(horse);
const order = rig.list;
const skeleton = new THREE.SkeletonHelper(model);
skeleton.visible = false;
scene.add(skeleton);
const tack = new Tack(model, bones, rig.mesh, await loadSaddle());
scene.add(...tack.reins);

// ---- The rider, in the saddle or beside it ----
// Standing, on the horse's right just behind its tail and facing the way it
// does, so the side view shows both clear of the panel.
const rider = new Rider();
scene.add(rider.root);
const mounted = document.getElementById('mounted'), showTack = document.getElementById('tack');
function seatRider() {
  if (!rider.model) return;
  if (mounted.checked) rider.setLocomotion('sit', tack.seat);
  else {
    rider.setLocomotion('walk');
    rider.root.position.set(-0.9, 0, -1.7);
    rider.root.rotation.set(0, Math.PI, 0); // her root faces -z
  }
}
async function pickRider(id) {
  rider.root.visible = !!id;
  if (!id) return;
  await rider.selectModel(id);
  seatRider();
}
mounted.onchange = seatRider;

// ---- Gaits ----
// Each gait at the speed it's made for (m/s); the slider goes between.
const SPEEDS = { stand: 0, walk: 1.7, trot: 3.8, canter: 6.5, gallop: 11 };
const gaits = document.getElementById('gaits');
let speed = 0;
const speedLabel = document.createElement('label');
speedLabel.innerHTML = 'm/s<input type="range" min="0" max="13" step="0.1" value="0"><span>0</span>';
const speedInput = speedLabel.querySelector('input'), speedOut = speedLabel.querySelector('span');
speedInput.oninput = () => { speed = Number(speedInput.value); speedOut.textContent = speed.toFixed(1); };
const setSpeed = (v) => { speedInput.value = v; speedInput.oninput(); };
for (const [name, v] of Object.entries(SPEEDS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => setSpeed(v);
  gaits.append(b);
}
gaits.append(speedLabel);

// ---- Test poses ----
// Each slider shares its angle (degrees) over a few bones, about one of the
// model's axes, on top of the gait. A leg's lift runs 0–1 into a lifted step.
const SLIDERS = {
  scale: { min: 1.6, max: 3, step: 0.05, value: 2.6 },
  // Most of it at the base, so the neck drops from the withers rather than
  // curling. Past 48° down the neck folds into the chest.
  neck: { min: -30, max: 48, step: 1, axis: X, bones: [['chest1', 0.45], ['neck', 0.3], ['neck1', 0.15], ['neck2', 0.1]] },
  head: { min: -40, max: 50, step: 1, axis: X, bones: [['head', 1]] },
  turn: { min: -60, max: 60, step: 1, axis: Y, bones: [['neck', 0.25], ['neck1', 0.25], ['neck2', 0.2], ['neck3', 0.15], ['head', 0.15]] },
  ears: { min: -20, max: 70, step: 1, axis: X, bones: [['ear_L', -1], ['ear_R', -1]] },
  tailLift: { min: 0, max: 80, step: 1, axis: X, bones: [['tail', 0.45], ['tail1', 0.3], ['tail2', 0.15], ['tail3', 0.1]] },
  swish: { min: -50, max: 50, step: 1, axis: Z, bones: [['tail', 0.3], ['tail1', 0.25], ['tail2', 0.2], ['tail3', 0.15], ['tail4', 0.1]] },
  LF: { min: 0, max: 1, step: 0.05, leg: 'front', side: 'L' },
  RF: { min: 0, max: 1, step: 0.05, leg: 'front', side: 'R' },
  LH: { min: 0, max: 1, step: 0.05, leg: 'hind', side: 'L' },
  RH: { min: 0, max: 1, step: 0.05, leg: 'hind', side: 'R' },
};
// A lifted step, about the model's x: a front knee folds the cannon back, a
// hind hock swings it forward.
const STEP = {
  front: [['upperArm', -20], ['forearm', -30], ['cannon', 95], ['pastern', 25]],
  hind: [['thigh', -25], ['shin', 35], ['hindCannon', -45], ['hindPastern', 30]],
};
const PRESETS = {
  rest: {},
  graze: { neck: 48, head: 25 },
  alert: { neck: -25, head: -15, ears: -15, tailLift: 25 },
  'front lift': { LF: 1 },
  'hind lift': { LH: 1 },
  'ears back': { ears: 60, head: -10 },
  swish: { swish: 40, tailLift: 15 },
};
const value = {};
const inputs = {};
const sliders = document.getElementById('sliders');
for (const [key, s] of Object.entries(SLIDERS)) {
  const label = document.createElement('label');
  label.innerHTML = `${key}<input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><span></span>`;
  const input = label.querySelector('input'), out = label.querySelector('span');
  input.oninput = () => { value[key] = Number(input.value); out.textContent = input.value; };
  inputs[key] = input;
  sliders.append(label);
}
function set(values) {
  for (const key of Object.keys(SLIDERS)) {
    if (key === 'scale') continue;
    inputs[key].value = values[key] ?? 0;
    inputs[key].oninput();
  }
}
inputs.scale.value = SLIDERS.scale.value;
inputs.scale.onchange = () => place();
inputs.scale.oninput();
set({});
const poses = document.getElementById('poses');
for (const [name, values] of Object.entries(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => set(values);
  poses.append(b);
}

// ---- The riding fit ----
// Metres: the stirrups `drop` below the seat's cushion, `out` from the middle
// and `ahead` of the hips; the hands `reach` ahead of the hips, `up` above the
// cushion and `apart`; and how far the knees turn out round the barrel.
const FIT = {
  drop: { min: 0.3, max: 0.8, step: 0.01, value: 0.55 },
  // Narrower than about 0.42 at scale 2.6 and the legs run into the barrel.
  out: { min: 0.2, max: 0.6, step: 0.01, value: 0.42 },
  ahead: { min: -0.2, max: 0.3, step: 0.01, value: 0.08 },
  reach: { min: 0.1, max: 0.6, step: 0.01, value: 0.32 },
  up: { min: 0, max: 0.5, step: 0.01, value: 0.22 },
  apart: { min: 0.05, max: 0.5, step: 0.01, value: 0.18 },
  kneeOut: { min: 0, max: 2, step: 0.05, value: 0.9 },
};
const fit = {};
const fitInputs = {};
for (const [key, s] of Object.entries(FIT)) {
  const label = document.createElement('label');
  label.innerHTML = `${key}<input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"><span></span>`;
  const input = label.querySelector('input'), out = label.querySelector('span');
  input.oninput = () => { fit[key] = Number(input.value); out.textContent = input.value; };
  input.oninput();
  fitInputs[key] = input;
  document.getElementById('fit').append(label);
}
function setFit(values) {
  for (const [key, v] of Object.entries(values)) {
    fitInputs[key].value = v;
    fitInputs[key].oninput();
  }
}
// Stirrup length to each rider's legs, as a real rider sets it: the knee
// about 135° bent. The male sits higher on his cushion, so his hang shorter.
const STIRRUPS = { female: 0.55, male: 0.5 };
tack.fit(value.scale, fit);
await pickRider('female');
document.getElementById('rider').onchange = async (e) => {
  await pickRider(e.target.value);
  if (STIRRUPS[e.target.value]) setFit({ drop: STIRRUPS[e.target.value] });
};

// Turns a bone about an axis of the model's frame, about its own head, on top
// of the pose it has.
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _m = new THREE.Quaternion(), _a = new THREE.Vector3();
function turn(bone, axis, degrees) {
  if (!degrees) return;
  bone.parent.updateWorldMatrix(true, false);
  model.getWorldQuaternion(_m);
  bone.parent.getWorldQuaternion(_p);
  _a.copy(axis).applyQuaternion(_m).applyQuaternion(_p.invert());
  bone.quaternion.premultiply(_q.setFromAxisAngle(_a, degToRad(degrees)));
}
function overlay() {
  // Parent-first, so each bone turns about where its parent has put it.
  const turns = new Map();
  const add = (name, axis, deg) => {
    const b = bones[name];
    if (!b || !deg) return;
    if (!turns.has(b)) turns.set(b, []);
    turns.get(b).push([axis, deg]);
  };
  for (const [key, s] of Object.entries(SLIDERS)) {
    if (s.bones) for (const [name, share] of s.bones) add(name, s.axis, value[key] * share);
    if (s.leg) for (const [name, deg] of STEP[s.leg]) add(`${name}_${s.side}`, X, value[key] * deg);
  }
  for (const b of order) for (const [axis, deg] of turns.get(b) ?? []) turn(b, axis, deg);
}

// ---- View ----
let view = 'three', paused = false, elapsed = 0, travelled = 0;
const VIEWS = { side: [6.5, 0.9, 0], front: [0, 1.0, 6], three: [4.6, 2, 4.6], top: [0, 8, 0.01], back: [0.4, 1.2, -6] };
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => { view = b.dataset.view; place(); };
document.getElementById('pause').onclick = () => { paused = !paused; };
const ink = document.getElementById('ink'), showBones = document.getElementById('bones');
const idleBox = document.getElementById('idle');
function place() {
  const [x, y, z] = VIEWS[view];
  // Back off for a bigger horse or a narrow space beside the panel.
  const k = (value.scale / 2.3) * Math.max(1, 1.3 / freeAspect());
  orbit.target.set(-0.3, 0.9, 0.3);
  camera.position.copy(orbit.target).add(new THREE.Vector3(x, y, z).multiplyScalar(k));
  orbit.update();
}

const status = document.getElementById('status');
window.__horse = { scene, model, bones, rig, body, rider, tack, value, set, fit, setFit, setSpeed, PRESETS, camera, orbit };

// The seated rider's legs: each knee's angle (180° straight, so the foot falls
// short of its stirrup) and how far the leg runs into the horse.
const LEG_RADIUS = 0.08; // metres, the padded trousers round thigh and shin
const _h = new THREE.Vector3(), _k = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3();
function legs(scale) {
  const b = rider.model.bones;
  return ['Left', 'Right'].map((side) => {
    b[side + 'UpLeg'].bone.getWorldPosition(_h);
    b[side + 'Leg'].bone.getWorldPosition(_k);
    b[side + 'Foot'].bone.getWorldPosition(_f);
    const knee = THREE.MathUtils.radToDeg(_a.subVectors(_h, _k).angleTo(_s.subVectors(_f, _k)));
    return { knee, into: tack.legDepth(_h, _k, _f, LEG_RADIUS, scale) };
  });
}
const palms = [new THREE.Vector3(), new THREE.Vector3()];

// The hooves on the ground: how fast each planted toe slides against the
// ground running under it (m/s; 0 is a clean footfall), the worst over the
// last second, and how far a planted leg fell short of its hoof (cm).
const hoofBones = LEGS.map((l) => bones[l.chain[4]]);
const _t = new THREE.Vector3();
const hoofWas = hoofBones.map(() => new THREE.Vector3());
const plantWas = hoofBones.map(() => false);
const slide = { worst: 0, decay: 0 };
let short = 0;
function footwork(dt) {
  let worst = 0;
  hoofBones.forEach((b, i) => {
    // The toe: down the hoof bone from the coronet. It counts while it was
    // down for the whole frame.
    const p = b.getWorldPosition(_h).addScaledVector(_t.set(0, 1, 0).transformDirection(b.matrixWorld), body.hoofLen[i] * value.scale);
    const plant = !!body.legs[i].plant && body.stride > 0.5;
    if (dt > 0 && plant && plantWas[i]) worst = Math.max(worst, Math.abs((p.z - hoofWas[i].z) / dt + speed));
    hoofWas[i].copy(p);
    plantWas[i] = plant;
  });
  slide.decay += dt;
  if (worst > slide.worst || slide.decay > 1) { slide.worst = worst; slide.decay = 0; }
  // Only a planted leg falling short matters: one in the air just reaches straight.
  short = Math.max(0, ...rig.short.map((d, i) => (body.legs[i].plant ? d : 0))) * value.scale * 100;
}

// What the standing horse is up to (idle.js).
function idleNow() {
  const I = body.idle, doing = [['resting left hind', I.rest.leg === 1], ['resting right hind', I.rest.leg === 2],
    ['stamping', I.stamp.t !== null], ['shaking its head', I.shake.t !== null], ['sniffing', I.sniff.t !== null], ['swishing', I.swish.t !== null]];
  return doing.filter(([, on]) => on).map(([what]) => what).join(', ') || 'square';
}

let previous = performance.now();
function frame(now) {
  step(Math.min((now - previous) / 1000, 0.05));
  previous = now;
  requestAnimationFrame(frame);
}
// One frame, `dt` s on. __horse.step runs it by hand when the page is hidden
// and requestAnimationFrame stops.
function step(dt) {
  if (paused) dt = 0;
  elapsed += dt;
  const scale = value.scale;
  model.scale.setScalar(scale);
  body.scale = scale;
  body.speed = speed / scale;
  body.idling = idleBox.checked;
  body.update(dt);
  overlay();
  travelled += speed * dt;
  grid.position.z = -mod(travelled, GRID);
  skeleton.visible = showBones.checked;
  model.updateMatrixWorld(true);
  footwork(dt);
  const seat = tack.fit(scale, fit);
  for (const o of [tack.saddleMesh, tack.metres, ...tack.reins]) o.visible = showTack.checked;
  const riding = rider.root.visible && rider.model && rider.locomotion === 'sit';
  if (riding) {
    // As the game seats a rider on the snowmobile: the root follows the saddle.
    tack.turned.updateWorldMatrix(true, false);
    tack.turned.matrixWorld.decompose(rider.root.position, rider.root.quaternion, _s);
    rider.update(dt, { crouch: 0, lean: 0, twist: 0, air: false, speed: 0 });
    rider.model.palmAt('Left', palms[0]);
    rider.model.palmAt('Right', palms[1]);
    tack.updateReins(palms);
  } else if (rider.root.visible && rider.model) rider.update(dt, { crouch: 0.35, lean: 0, twist: 0, air: false, speed: 0 });
  for (const r of tack.reins) r.visible &&= riding;
  let fitText = '';
  if (riding) {
    const [l, r] = legs(scale);
    fitText = `\ncushion ${seat.hips.y.toFixed(2)} m · stirrups ${(seat.feet[0].y - 0.025).toFixed(2)} m · fold ${THREE.MathUtils.radToDeg(rider.torso.rotation.x).toFixed(0)}°` +
      `\nknee L ${l.knee.toFixed(0)}° R ${r.knee.toFixed(0)}° · into horse L ${(l.into * 100).toFixed(0)} R ${(r.into * 100).toFixed(0)} cm`;
  }
  const gait = speed > 0 ? `${GAIT_NAMES[Math.round(body.gait)]} (${body.gait.toFixed(2)}) · ${speed.toFixed(1)} m/s · ${body.hz.toFixed(2)} strides/s · ${(speed / body.hz).toFixed(2)} m a stride` : `standing${body.idling ? ` · ${idleNow()}` : ''}`;
  const into = tack.clearance(scale);
  const saddleText = `\nhide into saddle ${(into.into * 100).toFixed(1)} cm (at z ${into.z?.toFixed(2)}, y ${into.y?.toFixed(2)}), through it ${(into.shows * 100).toFixed(1)} cm · seat drift ${(tack.seatDrift() * 100).toFixed(1)} cm`;
  status.textContent = `scale ${scale.toFixed(2)} m per unit · withers ${(WITHERS * scale).toFixed(2)} m\n${gait}\nhooves slide ${slide.worst.toFixed(2)} m/s · legs short ${short.toFixed(1)} cm${saddleText}${fitText}`;
  if (ink.checked) post.render(scene, camera, elapsed);
  else renderer.render(scene, camera);
}
window.__horse.step = step;
// The panel covers the left of the window, so the view is centred on the
// space to its right: the camera sees a frame as much wider as the panel, and
// the window shows its right-hand part.
const nav = document.querySelector('nav');
const panel = () => nav.getBoundingClientRect().right;
const freeAspect = () => (innerWidth - panel()) / innerHeight;
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight, devicePixelRatio);
  const full = innerWidth + panel();
  camera.aspect = full / innerHeight;
  camera.setViewOffset(full, innerHeight, 0, 0, innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
place();
requestAnimationFrame(frame);
