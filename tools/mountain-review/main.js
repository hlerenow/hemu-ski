// Dev-only A/B comparison: identical game ground, camera, weather and post.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadResort, createResort, TREELINE } from '../../src/world/resort.js';
import { createBackdrop } from '../../src/world/terrain.js';
import { createBackdrop as createBefore } from './baseline.js';
import { createSky } from '../../src/world/sky.js';
import { Weather } from '../../src/world/weather.js';
import { toonUniforms } from '../../src/render/toon.js';
import { InkPost } from '../../src/render/post.js';
import { Heightfield } from '../../src/world/data.js';

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = new InkPost(renderer);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bfe2da', 900, 17000);
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 60000);
const sun = new THREE.DirectionalLight('#fff', 3);
const sky = createSky();
scene.add(sun, sun.target, sky);
const resort = await loadResort();
const scenery = createResort(resort, { terrain: { tiles: 9, lodDistance: 1200, nearDistance: 300, corduroy: true } });
const oldMeta = { size: 40000, cells: 320, min: 967.6832275390625, max: 3110.6298828125 };
const oldBytes = new Uint16Array(await (await fetch('/data/backdrop.u16')).arrayBuffer());
const oldField = new Heightfield(oldMeta.size, oldMeta.cells,
  Float32Array.from(oldBytes, (q) => oldMeta.min + q * (oldMeta.max - oldMeta.min) / 65535));
const before = createBefore(oldField, resort.ground, TREELINE);
const after = createBackdrop(resort.backdrop, resort.ground);
before.visible = false;
scene.add(scenery.group, before, after);
const weather = new Weather({ scene, sky, sun, post, toon: toonUniforms, water: scenery.water });
weather.running = false;
function lighting() {
  weather.hour = $('light').value === 'night' ? 23 : 12;
  weather.set($('light').value === 'cloudy' ? 'cloudy' : 'clear');
  weather.settle();
}
$('light').onchange = lighting;
lighting();
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enablePan = false;
orbit.minDistance = 20;
orbit.maxDistance = 9000;
const [ox, oz] = resort.summitFrame.origin;
const views = {
  north: [ox, oz - 150, 0, -1],
  east: [ox + 180, oz, 1, 0],
  west: [ox - 200, oz, -1, 0],
  valley: [ox + 300, oz + 800, 0.4, 1],
};
function setView() {
  $('reference').hidden = true;
  $('photo').setAttribute('aria-pressed', 'false');
  if ($('view').value === 'photo') {
    // User confirms NE -> SW. Reuse the existing summit review's approximate
    // C camera, fitted to the stations; this is not a surveyed photo pose.
    camera.position.set(ox + 84.37, 2778.89, oz - 81.03);
    const yaw = 4.0724, pitch = 0.1773;
    const forward = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    orbit.target.copy(camera.position).addScaledVector(forward, 500);
    camera.fov = 2 * Math.atan(2160 / (2 * 3876.3)) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    orbit.update();
    return;
  }
  camera.fov = 58;
  camera.updateProjectionMatrix();
  const [x, z, dx, dz] = views[$('view').value];
  const y = resort.ground.heightAt(x, z) + 6;
  camera.position.set(x, y, z);
  orbit.target.set(x + dx * 3500, y - 220, z + dz * 3500);
  orbit.update();
}
$('view').onchange = setView;
setView();
function compare(useAfter) {
  before.visible = !useAfter;
  after.visible = useAfter;
  $('before').setAttribute('aria-pressed', String(!useAfter));
  $('after').setAttribute('aria-pressed', String(useAfter));
  $('status').textContent = `${useAfter ? '40 m DEM · 原高程 · 积雪 / 陡坡岩脊' : '旧版 125 m 平滑 DEM / 旧材质'} ｜ 实拍机位仅近似匹配；拖动环看，滚轮缩放。`;
}
$('before').onclick = () => compare(false);
$('after').onclick = () => compare(true);
compare(true);
$('photo').onclick = () => {
  $('reference').hidden = !$('reference').hidden;
  $('photo').setAttribute('aria-pressed', String(!$('reference').hidden));
};
function resize() {
  const pr = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight, pr);
  toonUniforms.uPixelRatio.value = pr;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => {
  scenery.terrain.update(camera.position);
  scenery.forest.update(camera.position);
  sky.position.copy(camera.position);
  weather.update(0, { time: 0, camera, viewHeight: renderer.domElement.height, focus: camera.position });
  post.render(scene, camera, 0, [sky, before, after, weather.snowfall.points, ...scenery.forest.farMeshes]);
});
