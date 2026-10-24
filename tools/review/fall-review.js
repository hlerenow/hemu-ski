import * as THREE from 'three';
import { Rider } from '../../src/player/rider.js';
import { FALL_DURATION, SHAKE_DURATION, FALL_KINDS, fallPose } from '../../src/player/fall.js';
const scene = new THREE.Scene(); scene.background = new THREE.Color('#deebf0');
scene.add(new THREE.HemisphereLight(0xffffff, 0x7896a3, 3));
const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 7, 4); scene.add(light);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100);
// The snow: a plane falling away toward -z (the way the rider travels).
const snow = new THREE.Group(); scene.add(snow);
const plane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 1 }));
plane.rotation.x = -Math.PI / 2; snow.add(plane);
const grid = new THREE.GridHelper(30, 60, 0x9baeb8, 0xc9d8e0); grid.position.y = 0.001; snow.add(grid);
const rider = new Rider(); await rider.selectModel('female'); scene.add(rider.root);
const time = document.querySelector('#time'), info = document.querySelector('#info'), kind = document.querySelector('#kind');
const slope = document.querySelector('#slope'), view = document.querySelector('#view');
for (const [value, { label }] of Object.entries(FALL_KINDS)) kind.add(new Option(label, value));
time.max = FALL_DURATION + SHAKE_DURATION;
let hf;
const setSlope = () => {
  const a = THREE.MathUtils.degToRad(Number(slope.value));
  snow.rotation.x = -a; // down toward -z
  hf = { heightAt: (x, z) => z * Math.tan(a) };
  rider.root.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a);
};
slope.onchange = () => { setSlope(); aim(); }; setSlope();
// The rider faces +x (the toe edge) and travels along -z.
const VIEWS = { '3/4': [2.4, 1.6, 3.4], front: [3.6, 0.9, 0.2], back: [-3.6, 0.9, 0.2], along: [0.2, 1.0, -3.8] };
// Set in the slope's frame, so a view looks the same on any slope.
const aim = () => {
  camera.position.set(...VIEWS[view.value]).applyQuaternion(rider.root.quaternion);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3(0, 0.35, 0).applyQuaternion(rider.root.quaternion));
};
view.onchange = aim; aim();
let t = 0, paused = false;
document.querySelector('#play').onclick = () => { t = 0; paused = false; };
document.querySelector('#pause').onclick = () => { paused = !paused; };
time.oninput = () => { t = Number(time.value); paused = true; };
kind.onchange = () => { t = 0; paused = false; };
document.querySelector('#model').onchange = async (e) => { await rider.selectModel(e.target.value); };
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const clock = new THREE.Clock();
function draw(dt) {
  const falling = t < FALL_DURATION;
  rider.root.position.set(0, 0, 0);
  rider.update(dt, { crouch: 0.35, lean: 0, twist: 0, speed: 0, air: false, roll: 0,
    fall: falling ? { time: t, motion: { kind: kind.value } } : null, shakeTime: !falling ? t - FALL_DURATION : null });
  rider.clearGround(hf, falling);
  const s = t - FALL_DURATION;
  info.textContent = `${t.toFixed(2)} s · ${falling ? fallPose(t, { kind: kind.value }).phase : s < 0.9 ? 'head shake' : s < 1.45 ? 'brushing the sleeve' : 'dusting the thighs'}`;
  renderer.render(scene, camera);
}
window.__review = { draw, set: (k, tt, v, sl) => { kind.value = k; t = tt; paused = true; if (v) { view.value = v; aim(); } if (sl != null) { slope.value = sl; setSlope(); } draw(1 / 60); } };
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.033);
  if (!paused) t = Math.min(FALL_DURATION + SHAKE_DURATION, t + dt);
  time.value = t;
  draw(dt);
}
frame();
