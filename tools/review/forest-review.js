// The forest from fixed cameras, with the game's renderer, shadows, weather and
// ink pass, and what each view costs: draw calls, triangles, the CPU's time to
// draw a frame and the GPU's (from a timer query, where the browser has one).
// ?view=<name> opens on a view, ?clean hides the panel (for screenshots).
// ?only=forest draws nothing else. window.__review.bench() measures every view.
import * as THREE from 'three';
import { loadResort, createResort } from '../../src/world/resort.js';
import { createBackdrop } from '../../src/world/terrain.js';
import { createSky } from '../../src/world/sky.js';
import { Weather } from '../../src/world/weather.js';
import { toonUniforms } from '../../src/render/toon.js';
import { InkPost } from '../../src/render/post.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.has('clean')) document.body.classList.add('clean');
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
const post = new InkPost(renderer);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#d6e8ee', 900, 17000);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 60000);
const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
const sky = createSky();
scene.add(sun, sun.target, sky);

const resort = await loadResort();
let t0 = performance.now();
// ?hi=<m> moves where the near trees drop to their lighter detail.
const scenery = createResort(resort, params.has('hi') ? { forest: { hiDistance: +params.get('hi') } } : {});
const buildMs = performance.now() - t0;
const backdrop = createBackdrop(resort.backdrop, resort.ground);
scene.add(scenery.group, backdrop);
// ?only=forest leaves the forest and the sky alone, to time the forest by itself.
if (params.get('only') === 'forest') {
  for (const o of scenery.group.children) o.visible = o === scenery.forest.group;
  backdrop.visible = false;
}
const weather = new Weather({ scene, sky, sun, post, toon: toonUniforms, water: scenery.water });
weather.running = false;
weather.hour = 12;
weather.set('clear');
weather.settle();

// Fixed views: [x, z, height above the ground, heading x, heading z, pitch].
// Picked on the run past the old forest's thickest stretch (Huaqiu, 1,921 trees
// within 450 m, 241 within 150) and kept for every version, so the numbers compare.
const VIEWS = {
  run: [1230.6, 1402.2, 3, 27.7, 27.1, -0.08],
  treetops: [1230.6, 1402.2, 45, 27.7, 27.1, -0.25],
  valley: [1000, 1180, 600, 27.7, 27.1, -0.3],
};
const hf = resort.ground;
function setView(name) {
  const [x, z, h, dx, dz, pitch] = VIEWS[name];
  camera.position.set(x, hf.heightAt(x, z) + h, z);
  const d = new THREE.Vector3(dx, 0, dz).normalize();
  d.y = Math.tan(pitch);
  camera.lookAt(camera.position.clone().add(d));
  for (const b of $('views').children) b.classList.toggle('on', b.textContent === name);
  current = name;
}
let current = null;
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.onclick = () => setView(name);
  $('views').append(b);
}

function resize() {
  const pr = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight, false);
  post.setSize(innerWidth, innerHeight, pr);
  toonUniforms.uPixelRatio.value = pr;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const gl = renderer.getContext();
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
let queries = []; // [query, frame's GPU ms once known]
// One frame, as the game draws it; returns the CPU's time for it in ms.
function frame() {
  const start = performance.now();
  const query = timer && gl.createQuery();
  if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
  renderer.info.reset();
  scenery.terrain.update(camera.position);
  scenery.forest.update(camera.position);
  sky.position.copy(camera.position);
  weather.update(0, { time: 0, camera, viewHeight: renderer.domElement.height, focus: camera.position });
  post.render(scene, camera, 0, [sky, backdrop, weather.snowfall.points, ...scenery.forest.farMeshes]);
  if (query) {
    gl.endQuery(timer.TIME_ELAPSED_EXT);
    queries.push(query);
  }
  return performance.now() - start;
}
// The GPU times of the frames drawn since the last call, once they're all in.
async function gpuTimes() {
  const list = queries;
  queries = [];
  if (!timer) return [];
  while (!list.every((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE))) await new Promise((r) => setTimeout(r, 20));
  const bad = gl.getParameter(timer.GPU_DISJOINT_EXT);
  const ms = list.map((q) => gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
  list.forEach((q) => gl.deleteQuery(q));
  return bad ? [] : ms;
}
const median = (a) => (a.length ? +a.sort((x, y) => x - y)[a.length >> 1].toFixed(2) : null);

const summary = () => `${scenery.forest.count} trees, built in ${buildMs | 0} ms · ${innerWidth}×${innerHeight} @${renderer.getPixelRatio()}`;
// Each view: 20 frames to settle, then the median of 60.
async function bench() {
  const out = {};
  for (const name of Object.keys(VIEWS)) {
    setView(name);
    for (let i = 0; i < 20; i++) frame();
    await gpuTimes();
    const cpu = [];
    for (let i = 0; i < 60; i++) {
      cpu.push(frame());
      await new Promise((r) => setTimeout(r, 16)); // (rAF stops in a hidden tab)
    }
    out[name] = { gpu: median(await gpuTimes()), cpu: median(cpu), calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  }
  $('status').textContent = summary() + '\n' + Object.entries(out).map(([k, v]) => `${k}: GPU ${v.gpu} ms, CPU ${v.cpu} ms, ${v.calls} calls, ${(v.tris / 1e6).toFixed(2)}M tris`).join('\n');
  window.__bench = { trees: scenery.forest.count, buildMs: buildMs | 0, ...out };
  return window.__bench;
}
window.__review = { bench, setView, frame, gpuTimes, scenery, resort, camera, VIEWS };
setView(params.get('view') in VIEWS ? params.get('view') : 'run');
$('status').textContent = summary();
let benching = false;
$('bench').onclick = window.__review.bench = async () => {
  benching = true;
  try { return await bench(); } finally { benching = false; }
};
renderer.setAnimationLoop(() => {
  if (benching) return;
  frame();
  queries.splice(0).forEach((q) => gl.deleteQuery(q));
});
