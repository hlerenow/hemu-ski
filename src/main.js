import './ui-zh.js';
import { setLoadingProgress, setLoadingArrival, finishLoading } from './loading.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retarget } from './player/rider-model.js';
import { makeActionLoop } from './player/action-loop.js';
import { SERVICE_CENTRES, PISTE_HALF_WIDTH, ONSEN } from './world/data.js';
import { loadResort, createResort, along, MAIN_RUN, TREELINE, startingRun } from './world/resort.js';
import { createBackdrop } from './world/terrain.js';
import { gondolaCabin } from './world/props.js';
import { boardingPath } from './world/chairlift-boarding.js';
import { crossedChairliftPoint } from './world/chairlift-path.js';
import { createSky, SKY } from './world/sky.js';
import { Weather, WEATHERS, SUNRISE, SUNSET } from './world/weather.js';
import { PUFF_COVER } from './world/onsen.js';
import { cabinSpace, yurtSpace } from './world/summit.js';
import { SUMMIT } from './world/summit-layout.js';
import { shoreAt, Ripples } from './world/lakes.js';
import { PrayerWheels } from './world/prayer-wheels.js';
import { Dog, DOG } from './dog/dog.js';
import { Foxes, FOX, foxDen } from './fox/fox.js';
import { Horse, HORSE, PACES, horsePasture } from './horse/horse.js';
import { find } from './collection.js';
import { Npc } from './npc/npc.js';
import { CAST } from './npc/cast.js';
import { Dialogue } from './npc/dialogue.js';
import { InkPost } from './render/post.js';
import { toonUniforms } from './render/toon.js';
import { Rider } from './player/rider.js';
import { FALL_DURATION, SHAKE_DURATION } from './player/fall.js';
import { BoardPhysics } from './player/physics.js';
import { Trail, BoardTrail, Spray, SnowCollar } from './player/fx.js';
import { Hud } from './hud.js';
import { BigMap } from './bigmap.js';
import { Navigator } from './gps/navigator.js';
import { RouteMarks } from './gps/marks.js';
import { Sound } from './audio.js';
import { createMenu } from './menu.js';
import { TouchPad } from './touch.js';
import { MouseLook, swing } from './mouse-look.js';
import { createIsland, createTitleLetters, createSnowSpecks, createCloudWipe } from './intro.js';
import {
  destinationFromURL, destinationKey, runTop, noteArrival, takeArrivalNote, whereaboutsParam, saveWhereabouts,
} from './destinations.js';
import { liftTitle } from './diorama/names.js';

const G = 9.81;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = new InkPost(renderer);

const scene = new THREE.Scene();
scene.background = SKY.horizon.clone();
scene.fog = new THREE.Fog(SKY.horizon.clone().lerp(new THREE.Color('#ffffff'), 0.15), 900, 17000);
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 60000);

const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const pr = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  post.setSize(w, h, pr);
  toonUniforms.uPixelRatio.value = pr;
  // A phone-sized view keeps only the corduroy right in front of you; further
  // off, the ribs, sharp as they are, become a field of fine stripes there.
  toonUniforms.uRibScale.value = Math.min(w, h) < 600 ? 12 : 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- World ----------
// Sent from the diorama, the loading screen says where to.
const arrivalNote = takeArrivalNote();
if (arrivalNote) setLoadingArrival(arrivalNote);
// The game's world (see world/resort.js, which the diorama builds from too):
// the map editor's saved edits apply unless the URL says ?original.
const dataset = new URLSearchParams(location.search).get('map') === 'koktokay' ? 'koktokay' : 'hemu';
const koktokay = dataset === 'koktokay';
const resort = await loadResort({ original: new URLSearchParams(location.search).has('original'), dataset, onProgress: (p) => setLoadingProgress(p * 0.75) });
document.title = koktokay ? '可可托海滑雪' : '禾木滑雪';
document.querySelector('#title .where').textContent = koktokay ? '可可托海国际滑雪场 · 阿勒泰' : '禾木吉克普林 · 阿勒泰';
document.getElementById('bigmap-tab').textContent = koktokay ? '地图 · 可可托海' : '地图 · 禾木';
const mapChoice = document.getElementById('game-map');
mapChoice.value = dataset;
mapChoice.addEventListener('change', () => {
  const next = new URL(location.href);
  next.searchParams.set('map', mapChoice.value);
  for (const key of ['at', 'you']) next.searchParams.delete(key);
  location.href = next.href;
});
await Promise.all([document.fonts.load('40px "Patrick Hand SC"'), document.fonts.load('20px "Patrick Hand"')]).catch(() => {});
setLoadingProgress(0.875);
const { meta, piste, lakes } = resort;
// The ground everything stands on: the snow banked up beside the runs, the
// summit and Cloud Lake shaped.
const detail = resort.ground;
const mainRun = startingRun(resort);

// The ride area runs from the summit down the valley to both service centres:
// the terrain, the service centres, the forest, the lifts, the hot spring
// hidden in the trees behind the East Service Centre (see Soaking), the
// summit's landmarks (for now stand-ins; ?labels shows their numbers), the
// lakes' water, the piste markers and the start banner.
const scenery = createResort(resort, {
  terrain: { tiles: 9, lodDistance: 1200, nearDistance: 300, corduroy: true },
  labels: new URLSearchParams(location.search).has('labels'),
});
const { terrain, lodges, forest, lifts, onsen, summit, water } = scenery;
scene.add(scenery.group);
const backdrop = createBackdrop(resort.backdrop, detail, koktokay ? { clipDetail: true } : undefined);
scene.add(backdrop);
// The rings that spread on the water from the boat's oars.
const ripples = new Ripples();
scene.add(ripples.group);
const hallHome = SERVICE_CENTRES[0];
const cabinRoom = koktokay ? { home: { x: hallHome.x + 55, z: hallHome.z, yaw: 0, roam: 8, inside: () => false }, room: () => 0, inside: () => false } : cabinSpace(summit.byId.get('summit:object-7')); // the coffee cabin's room, for the dog's home and the camera
const yurtRoom = koktokay ? { room: () => 0, inside: () => false } : yurtSpace(summit.byId.get('summit:object-1')); // the yurt's, for the camera and Eric's seat
// The rooms you can walk into, by the landmark they're in: the camera comes in
// close inside them, and the cast sit in them (see NPCs).
const rooms = new Map([['summit:object-7', cabinRoom], ['summit:object-1', yurtRoom]]);
const roomAt = (x, z) => Math.max(...[...rooms.values()].map((r) => r.room(x, z)));
const roomAround = (x, z) => [...rooms.values()].find((r) => r.inside(x, z)) ?? null;
const sky = createSky();
scene.add(sky);
// The time of day and the weather (world/weather.js): they light everything
// and move the sun, so the sun's light is theirs to place. Chosen under
// Weather in the menu (see below), or ?time=17.2 and ?weather=snow.
const weather = new Weather({ scene, sky, sun, post, toon: toonUniforms, water });

// Start a few metres below 6号's top station, at the head of Yunxiaofeng.
// From there the whole mountain is open: there is no finish line.
const runLength = mainRun.points.reduce((s, p, i, a) => (i ? s + Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) : 0), 0);
const startAt = along(mainRun.points, 14);
const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
// Where a run starts and R takes you back to: here, unless the diorama sent
// you somewhere else (see Destinations, below).
let spawn = { key: `run:${mainRun.id}`, x: startAt.x, z: startAt.z, dx: startAt.dx, dz: startAt.dz, toast: 'Drop in!' };

// Lifts you can ride: each one's cable from its bottom station to its top.
// You board at the bottom station, within BOARD_REACH m of its walls. (A
// service centre's hall boards nothing: its gondola's station is out front.)
const rides = lifts.lines.map((l) => {
  const up = l.a.y <= l.b.y;
  const cable = up ? l.cable : [...l.cable].reverse();
  const acc = [0];
  for (let i = 1; i < cable.length; i++) acc.push(acc[i - 1] + cable[i].distanceTo(cable[i - 1]));
  const bottom = up ? l.a : l.b, top = up ? l.b : l.a;
  const dir = new THREE.Vector3(top.x - bottom.x, 0, top.z - bottom.z).normalize();
  const label = l.name || (l.type === 'gondola' ? 'Gondola' : 'Chair lift');
  return { id: l.id, label, bottom, top, dir, cable, acc, length: acc[acc.length - 1], fixedChair: lifts.chairSystems.some(s => s.id === l.id) };
});
const BOARD_REACH = 10;
const boardSpots = rides.map((ride) => ({
  ride, station: lifts.footprints.find((f) => Math.hypot(f.x - ride.bottom.x, f.z - ride.bottom.z) < 1),
})).filter((s) => s.station);
const cabin = gondolaCabin();
cabin.visible = false;
scene.add(cabin);

// ---------- Player ----------
// Choose a rider under Rider in the menu (see below), or deep-link with
// ?rider=female/male/classic.
const rider = new Rider({ model: false });
scene.add(rider.root);
const phys = new BoardPhysics({ hf: detail, piste, forest, lakes, obstacles: [...scenery.obstacles] });
const trail = new BoardTrail();
const spray = new Spray();
const powderSpray = new Spray(500, { size: 0.34, gravity: 4, life: 0.6 });
const collar = new SnowCollar();
scene.add(trail.mesh, spray.points, powderSpray.points, collar.mesh);
let sink = 0; // how far the board rides down in the powder (see Powder, below)
const hud = new Hud(resort, piste, lakes);
const sound = new Sound();
sound.listen();
// Coming back to the tab (or back from the diorama, with the page kept) tries
// to revive the audio the browser suspended while the page was hidden; where
// that needs a gesture, the next tap or key does it (see Sound.listen).
document.addEventListener('visibilitychange', () => { if (!document.hidden) sound.resume(); });
window.addEventListener('pageshow', () => sound.resume());
const ACTIONS = [
  ['booty-hip-hop-dance', 'Booty Hip Hop Dance'], ['macarena-dance', 'Macarena Dance'],
  ['breakdance-freezes', 'Breakdance Freezes'], ['moonwalk', 'Moonwalk'],
  ['golf-drive', 'Golf Drive'], ['gunplay', 'Gunplay'], ['fireball', 'Fireball'],
  ['roundhouse-kick', 'Roundhouse Kick'], ['guitar-playing', 'Guitar Playing'],
  ['kneeling-down', 'Kneeling Down'],
].map(([id, label]) => ({ id, label }));
const actionFiles = new Map();
let specialAction = null, pendingAction = null, actionRequest = 0;
const actionStatus = document.getElementById('action-status');
const menu = createMenu(sound, { actions: ACTIONS, playAction: playSpecialAction });
document.getElementById('action-stop').addEventListener('click', stopSpecialAction);
async function playSpecialAction(id) {
  const item = ACTIONS.find((entry) => entry.id === id);
  if (!item) return;
  if (specialAction?.id === id || pendingAction === id) { stopSpecialAction(); return; }
  if (state !== 'ride' || (rider.locomotion !== 'walk' && !(specialAction && rider.locomotion === 'act')) || !rider.model || !phys.grounded || phys.crashed > 0 || rider.throwT !== null) {
    actionStatus.textContent = 'Switch to on foot and stop before playing an action.';
    hud.toast('Actions are available on foot');
    return;
  }
  const request = ++actionRequest, model = rider.model;
  pendingAction = id;
  actionStatus.textContent = `Loading ${item.label}…`;
  try {
    if (!actionFiles.has(id)) actionFiles.set(id, new GLTFLoader().loadAsync(import.meta.env.BASE_URL + `models/motions/special-actions-v01/${id}.glb`).catch((err) => { actionFiles.delete(id); throw err; }));
    const source = await actionFiles.get(id);
    if (request !== actionRequest) return;
    pendingAction = null;
    if (state !== 'ride' || rider.model !== model || !phys.grounded || phys.crashed > 0 || rider.throwT !== null || (rider.locomotion !== 'walk' && !(specialAction && rider.locomotion === 'act'))) {
      actionStatus.textContent = specialAction ? `Playing ${ACTIONS.find((entry) => entry.id === specialAction.id).label}` : 'Action stopped.';
      return;
    }
    const clip = makeActionLoop(retarget(source.animations[0], source.scene, model.bindScene));
    if (!clip.tracks.length || !clip.duration) throw new Error('No usable animation tracks');
    phys.vel.set(0, 0, 0); phys.yawRate = 0;
    specialAction = { id, clip, time: 0, model };
    rider.play(clip, 0);
    actionStatus.textContent = `Playing ${item.label}`;
  } catch (error) {
    console.warn('Action unavailable:', id, error);
    if (request === actionRequest) { pendingAction = null; actionStatus.textContent = `${item.label} could not be loaded.`; }
  }
}
function stopSpecialAction() {
  ++actionRequest;
  if (!specialAction && !pendingAction) return;
  pendingAction = null;
  specialAction = null;
  actionStatus.textContent = 'Action stopped.';
  if (rider.locomotion === 'act') rider.setLocomotion('walk');
}

// The GPS: pick a destination on the big map and it routes you there.
const gps = new Navigator({ hf: detail, runs: meta.runs, rides });
hud.gps = gps;
// Where you are, for the GPS: on the snow, or riding a lift up.
const gpsFrom = () => ({ x: phys.pos.x, z: phys.pos.z, y: phys.pos.y, lift: state === 'lift' ? liftRide.ride.id : null });
const marks = new RouteMarks(detail);
scene.add(marks.group);

// ---------- Vehicles ----------
// Parked for now in front of the East Service Centre, nose out: a pickup to the
// left of the entrance, a snowmobile to the right, and a Jetson ONE, a
// one-person aircraft, out beyond them (or wherever the map editor moved them;
// see Places in world/data.js). Any rider can take any of them: E beside
// it gets in (or on), E again gets out (see Driving). In the pickup the rider is
// out of sight in the cab; on the snowmobile they sit on it, hands on the grips,
// and in the Jetson they sit in its seat, hands on its two sticks.
// On Cloud Lake there's a rowing boat, drawn up at the shore nearest a run (see
// Rowing): the rider sits facing its stern, hands on the oars.
// The resort parks them (see world/resort.js); this is how each one plays.
const eastHall = SERVICE_CENTRES.find((c) => c.id === 'east') || SERVICE_CENTRES[0];
// `cam`: the chase camera's distance back, height and look-ahead, the height it
// looks at, how far round to the side it hangs at a crawl (radians, + to the
// right) and how quickly it follows (6 if it doesn't say: the faster the
// vehicle, the further it trails); `wind`: how much of the wind you hear; `lean`: how far the rider
// leans into a turn; `hintLanded`: an aircraft's hint on the ground; `touch`:
// its prompt and hints on a touch screen, and what the button by your thumb
// says to get in and out. A boat's `home` is its lake's name.
const CONTROLS = {
  pickup: {
    hall: eastHall,
    cam: { back: 9, up: 3.4, ahead: 5, look: 1.4 }, wind: 0.5, // muffled by the cab
    title: 'Pickup', prompt: '<kbd>E</kbd> drive the <b>pickup</b>',
    hint: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive · <kbd>Space</kbd> handbrake · <kbd>E</kbd> get out',
    touch: { prompt: 'Drive the <b>pickup</b> ▸', enter: 'Drive', exit: 'Get out', hint: 'Stick up to drive, down to brake · sideways to steer' },
  },
  snowmobile: {
    hall: eastHall,
    cam: { back: 5.6, up: 2.4, ahead: 4, look: 1.1 }, wind: 1,
    title: 'Snowmobile', prompt: '<kbd>E</kbd> ride the <b>snowmobile</b>',
    hint: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ride · <kbd>Space</kbd> handbrake · <kbd>E</kbd> get off',
    touch: { prompt: 'Ride the <b>snowmobile</b> ▸', enter: 'Ride', exit: 'Get off', hint: 'Stick up to ride, down to brake · sideways to steer' },
  },
  jetson: {
    hall: eastHall,
    cam: { back: 6.5, up: 3.4, ahead: 4, look: 0.9, side: -0.5, follow: 12 }, wind: 1, lean: 0.012,
    title: 'Jetson ONE', prompt: '<kbd>E</kbd> fly the <b>Jetson ONE</b>',
    hintLanded: '<kbd>Space</kbd> take off · <kbd>E</kbd> get out',
    hint: '<kbd>W</kbd><kbd>S</kbd> fly · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> up · <kbd>Shift</kbd> down and land',
    touch: {
      prompt: 'Fly the <b>Jetson ONE</b> ▸', enter: 'Fly', exit: 'Get out',
      hint: 'The stick flies and turns · hold Up to climb, Down to land', hintLanded: 'Hold Up to take off',
    },
  },
  rowboat: {
    cam: { back: 6, up: 2.5, ahead: 2.5, look: 0.6, side: 0.5, follow: 3 }, wind: 0.6, lean: 0.01,
    title: 'Rowing boat', prompt: '<kbd>E</kbd> take the <b>rowing boat</b>',
    hint: '<kbd>W</kbd> row · <kbd>S</kbd> back water · <kbd>A</kbd><kbd>D</kbd> turn · <kbd>Space</kbd> hold water · <kbd>E</kbd> step out at the shore',
    touch: { prompt: 'Take the <b>rowing boat</b> ▸', enter: 'Row', exit: 'Step out', hint: 'Stick up to row, down to back water · sideways to turn' },
  },
};
const vehicles = scenery.vehicles.map((v) => Object.assign(v, CONTROLS[v.name], v.lake && { home: v.lake.name }));
const parked = () => vehicles.filter((v) => v.phys && v !== car).map((v) => v.model.footprint);
for (const v of vehicles) {
  scene.add(v.model.root);
  v.phys = null; // once the model is in
  // Its lines in the snow: a pickup's rear tyres, a snowmobile's track and skis
  // (the Jetson leaves none).
  v.tracks = [];
  v.model.ready.then(() => {
    // Parked on its spot (the Jetson can come down on the water, but you can't get out there).
    v.phys = scenery.parkVehicle(v);
    v.tracks = v.model.marks.map(() => new Trail());
    if (v.tracks.length) scene.add(...v.tracks.map((t) => t.mesh));
    phys.obstacles.push(v.model.footprint); // the rider runs into it
    // The vehicles bump into each other.
    for (const o of vehicles) if (o !== v && o.phys) { o.phys.obstacles.push(v.model.footprint); v.phys.obstacles.push(o.model.footprint); }
    hud.parked = parked();
  }).catch((err) => console.warn(`The ${v.name} failed to load; it stays out of the game.`, err));
}
let car = null; // the vehicle you're in or on
const bigMap = new BigMap({
  hud, detail, runs: meta.runs, lifts: rides, lines: meta.lifts, gps, onClose: closeMap,
  onDiorama: () => leaveFor(dioramaHref('you'), 'Finding you on the diorama'),
});

const keys = new Set();
const isControl = (target) => target instanceof Element
  && !!target.closest('input, select, textarea, button, a, [contenteditable="true"]');
window.addEventListener('keydown', (e) => {
  // Cmd+key is the browser's or the OS's (Cmd+F finds, Cmd+M minimises), not
  // the rider's, as in the diorama; its keyup may never come anyway.
  if (e.metaKey) return;
  // The big map takes the keys while it's open; Escape or M closes it.
  if (bigMap.isOpen) {
    if ((e.code === 'Escape' || e.code === 'KeyM') && !e.repeat) closeMap();
    else if ((e.code === 'Delete' || e.code === 'Backspace') && !isControl(e.target)) bigMap.clearRoute();
    else if (!isControl(e.target) && bigMap.key(e.code)) e.preventDefault();
    return;
  }
  if (isControl(e.target)) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  sound.start();
  act(e.code, e.repeat);
});
// What a key press does, beyond the key being held. The touch buttons, the
// prompt and the menu press keys through here too, so a tap does what the key does.
function act(code, repeat = false) {
  if ((code === 'Enter' || code === 'Space') && state === 'title') { begin(); return; }
  if ((code === 'Enter' || code === 'Space' || code === 'Escape') && state === 'swoop') { swoop.t = 1; return; }
  if ((code === 'Enter' || code === 'Space' || code === 'Escape') && state === 'arrive') { arrival.t = 1; return; }
  if (!repeat && /^Digit[123]$/.test(code)) { const id = menu.actionForKey(Number(code.slice(-1)) - 1); if (id) playSpecialAction(id); return; }
  if ((specialAction || pendingAction) && code === 'KeyX' && !repeat) { stopSpecialAction(); return; }
  if (specialAction) { if (code === 'KeyF' && !repeat) { stopSpecialAction(); toggleLocomotion(); } return; }
  if (code === 'KeyR' && !repeat && state === 'ride') startRun();
  if (code === 'KeyR' && !repeat && state === 'drive') carHome();
  if (code === 'KeyF' && !repeat && state === 'ride') toggleLocomotion();
  if (code === 'KeyM' && !repeat) openMap();
  if (code === 'KeyQ' && !repeat && state === 'ride') throwSnowball();
  if (code === 'KeyE' && !repeat && dialogue.open) dialogue.next();
  else if (code === 'KeyE' && !repeat && state === 'drive') {
    if (car.phys.canExit === false) hud.toast(car.floats ? 'Row to the shore to step out' : touch.on ? 'Land first · hold Down' : 'Land first · hold Shift', 1600);
    else if (!getOut()) hud.toast(car.floats ? 'Row to the shore to step out' : 'Not over the water', 1600);
  }
  else if (code === 'KeyE' && !repeat && state === 'soak') leavePool();
  else if (code === 'KeyE' && !repeat && state === 'horse') getOffHorse();
  else if (code === 'KeyE' && !repeat && state === 'ride' && nearCar) getIn(nearCar);
  else if (code === 'KeyE' && !repeat && state === 'ride' && nearHorse) mountHorse();
  else if (code === 'KeyE' && !repeat && state === 'ride' && nearPool) soak();
  else if (code === 'KeyE' && !repeat && state === 'ride' && nearDog) petDog();
  else if (code === 'KeyE' && !repeat && state === 'ride' && nearWheel) turnWheel(nearWheel);
  else if (code === 'KeyE' && state === 'ride' && boardable) board(boardable.ride);
  else if ((code === 'KeyE' || code === 'Space') && state === 'lift' && liftRide.t > 0.5) { if (liftRide.system) { if (!liftRide.waiting) liftRide.system.targetSpeed = 20; } else if (liftRide.gondolaSystem) unload(liftRide.ride); else liftRide.t = liftRide.dur; }
  if ((code === 'Enter' || code === 'Space') && panelNext) { const f = panelNext; panelNext = null; f(); }
}
const pressE = () => { sound.start(); act('KeyE'); }; // a tapped prompt
const pressQ = () => { sound.start(); act('KeyQ'); };
window.addEventListener('keyup', (e) => {
  // macOS drops other keys' keyups while Cmd is down, so letting go of Cmd
  // lets go of everything; otherwise a W released mid-shortcut rides on alone
  // (the same fix the diorama's fly keys already have, diorama/main.js).
  if (e.key === 'Meta') keys.clear();
  else keys.delete(e.code);
});
window.addEventListener('blur', () => keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
window.addEventListener('focusin', (e) => { if (isControl(e.target)) keys.clear(); });
// A tap skips the flight down from the title and the drop out of the cloud, as Space does.
canvas.addEventListener('pointerdown', () => {
  if (state === 'swoop' || state === 'arrive') act('Space');
});
// The menu's way back to the start, for a touch screen as much as for R.
document.getElementById('mi-restart').addEventListener('click', () => {
  menu.close();
  sound.start();
  act('KeyR');
});

// Touch controls (touch.js): the stick and the held buttons are read with the
// keys, below; a tapped button presses E (the one by your thumb: board, get in
// or out, pet the dog, skip the ride), Q (throw a snowball) or F (on foot, or
// back on the board). What they show follows what you're doing (see touchLayout).
const TAPS = { act: 'KeyE', alt: 'KeyQ' };
const touch = new TouchPad({
  onTap: (name) => act(TAPS[name] ?? 'KeyF'),
  onPress: () => sound.start(),
  onMode: (on) => hud.setTouch(on),
});
hud.setTouch(touch.on);
const input = { steer: 0, tuck: false, brake: false, jump: false, walk: false, run: false };
const pedals = { throttle: false, reverse: false, steer: 0, handbrake: false, climb: false, sink: false }; // driving and flying
function readInput() {
  const L = keys.has('KeyA') || keys.has('ArrowLeft');
  const R = keys.has('KeyD') || keys.has('ArrowRight');
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const t = touch.read(); // the stick steers by how far it's pushed
  input.steer = THREE.MathUtils.clamp((L ? 1 : 0) - (R ? 1 : 0) + t.steer, -1, 1);
  input.tuck = keys.has('KeyW') || keys.has('ArrowUp') || t.up;
  input.brake = keys.has('KeyS') || keys.has('ArrowDown') || t.down;
  input.jump = keys.has('Space') || t.big;
  input.walk = input.tuck;
  input.run = shift || t.full; // on foot, the stick pushed all the way out runs
  // Throwing on foot, the feet are busy with the throw.
  if (specialAction || (rider.throwT !== null && rider.locomotion === 'walk')) { input.walk = input.run = false; input.steer = 0; input.jump = false; }
  pedals.throttle = input.tuck;
  pedals.reverse = input.brake;
  pedals.steer = input.steer;
  pedals.handbrake = input.jump;
  pedals.climb = input.jump;
  pedals.sink = shift || t.low;
}

// Back on the board. A rider seated on the snowmobile or in the Jetson stays
// there; getting off stands them up (see Driving).
function restoreRide() {
  if (rider.locomotion === 'sit') return;
  const wasWalking = rider.locomotion === 'walk';
  rider.setLocomotion('ride');
  if (wasWalking) {
    phys.vel.set(0, 0, 0);
    phys.yawRate = 0;
    phys.jumpCharge = 0;
    trail.gap(phys.pos);
  }
}
function toggleLocomotion() {
  stopSpecialAction();
  if (!phys.grounded || phys.crashed > 0 || (rider.throwT !== null && rider.locomotion === 'walk' && rider.throwUsesPitch)) return;
  if (rider.locomotion === 'walk') {
    restoreRide();
    hud.toast(touch.on ? 'On board' : 'On board · W push / tuck');
    return;
  }
  if (!rider.setLocomotion('walk')) {
    hud.toast('Choose a rider who can walk under Rider in the menu');
    return;
  }
  phys.vel.set(0, 0, 0);
  phys.yawRate = phys.jumpCharge = phys.slip = 0;
  trail.gap(phys.pos);
  hud.toast(touch.on ? 'On foot · push the stick out to run' : 'On foot · W walk · Shift run · F board');
}

// ---------- Rider ----------
// The menu's Rider panel has a button per rider. The game remembers the one you
// ride (with the music and sound settings), so it's the same rider after a trip
// to the diorama, a reload or the map editor's Ride button; ?rider= picks one too.
const RIDERS = ['male', 'female', 'classic'];
const riderGroup = document.querySelector('#fly-rider .riders');
const riderButtons = [...riderGroup.querySelectorAll('[data-rider]')];
const riderStatus = document.getElementById('rider-status');
const showRider = (id) => {
  for (const b of riderButtons) b.setAttribute('aria-pressed', String(b.dataset.rider === id));
};
let riderSelection = 0, riderWanted = null;
async function chooseRider(id) {
  const selection = ++riderSelection;
  riderWanted = id;
  restoreRide();
  showRider(id);
  riderGroup.setAttribute('aria-busy', 'true');
  riderStatus.textContent = 'Loading rider…';
  let loaded = false;
  try { loaded = await rider.selectModel(id); }
  catch (err) { console.warn('Could not switch rider.', err); }
  if (selection !== riderSelection) return;
  // A failed load keeps the effective rider selected; an older request cannot
  // overwrite the status of the latest choice.
  riderWanted = rider.modelId;
  showRider(rider.modelId);
  riderGroup.removeAttribute('aria-busy');
  if (loaded && menu.prefs.rider !== rider.modelId) {
    menu.prefs.rider = rider.modelId;
    menu.save();
  }
  if (loaded && state === 'soak') {
    if (goingIn) settle(); // a rider chosen while getting in is in at once
    changeInto(SOAK_OUTFIT); // and one chosen mid-soak changes too
  }
  riderStatus.textContent = loaded
    ? (rider.canWalk ? `Ready · ${touch.on ? 'On foot' : 'F'} switches board / on foot` : 'Ready · snowboarding')
    : 'Could not load that rider. Previous rider kept; choose again to retry.';
}
for (const b of riderButtons)
  b.addEventListener('click', () => {
    if (b.dataset.rider !== riderWanted) void chooseRider(b.dataset.rider);
  });

// ---------- Weather ----------
// The menu's Weather panel: the clock (a slider, and quick jumps to sunrise,
// noon, sunset and night), whether the day goes by on its own, the kind of
// weather and whether there's an aurora by night. Remembered between visits,
// like the rider; ?time=, ?weather= and ?aurora=1 choose too, for that visit
// only (a time from the address holds still).
const wxAddress = new URLSearchParams(location.search);
const wxClock = document.getElementById('wx-clock'), wxPhase = document.getElementById('wx-phase');
const wxHour = document.getElementById('wx-hour'), wxRun = document.getElementById('wx-run');
const wxAurora = document.getElementById('wx-aurora');
const wxKinds = [...document.querySelectorAll('#fly-weather [data-weather]')];
const WX_HOURS = { sunrise: SUNRISE + 0.25, noon: 12, sunset: SUNSET - 0.35, night: 22.5 };
const showWeather = () => {
  for (const b of wxKinds) b.setAttribute('aria-pressed', String(b.dataset.weather === weather.kind));
};
let wxFromAddress = ['time', 'weather', 'aurora'].some((k) => wxAddress.has(k));
function saveWeather() {
  if (wxFromAddress) return;
  Object.assign(menu.prefs, { weather: weather.kind, hour: Math.round(weather.hour * 100) / 100, dayGoesBy: weather.running, aurora: weather.aurora });
  menu.save();
}
{
  const hourParam = parseFloat(wxAddress.get('time'));
  const kind = [wxAddress.get('weather'), menu.prefs.weather].find((k) => k === 'changeable' || k in WEATHERS);
  if (kind) weather.set(kind);
  weather.aurora = wxAddress.has('aurora') ? !['0', 'false', 'no', 'off'].includes(wxAddress.get('aurora')) : menu.prefs.aurora === true;
  weather.settle();
  if (Number.isFinite(hourParam)) {
    weather.hour = THREE.MathUtils.euclideanModulo(hourParam, 24);
    weather.running = false;
  } else {
    if (Number.isFinite(menu.prefs.hour)) weather.hour = menu.prefs.hour;
    weather.running = menu.prefs.dayGoesBy !== false;
  }
  wxRun.checked = weather.running;
  wxAurora.checked = weather.aurora;
  showWeather();
}
let wxDragging = false;
wxHour.addEventListener('pointerdown', () => (wxDragging = true));
window.addEventListener('pointerup', () => (wxDragging = false));
wxHour.addEventListener('input', () => {
  weather.hour = parseFloat(wxHour.value) % 24;
  wxFromAddress = false;
  saveWeather();
});
for (const b of document.querySelectorAll('#fly-weather [data-hour]'))
  b.addEventListener('click', () => {
    weather.hour = WX_HOURS[b.dataset.hour];
    wxFromAddress = false;
    saveWeather();
  });
wxRun.addEventListener('change', () => {
  weather.running = wxRun.checked;
  wxFromAddress = false;
  saveWeather();
});
wxAurora.addEventListener('change', () => {
  weather.aurora = wxAurora.checked;
  wxFromAddress = false;
  saveWeather();
});
for (const b of wxKinds)
  b.addEventListener('click', () => {
    weather.set(b.dataset.weather);
    showWeather();
    wxFromAddress = false;
    saveWeather();
  });
window.addEventListener('pagehide', saveWeather);

// ---------- Settings ----------
// Mouse look (see mouse-look.js): on, a click on the view while you're riding,
// driving or soaking takes the pointer and the mouse swings the camera round
// you. Remembered between visits.
const mouseLook = new MouseLook(canvas);
mouseLook.wanted = () => state === 'ride' || state === 'drive' || state === 'horse' || state === 'soak' || state === 'lift';
{
  const box = document.getElementById('set-mouselook');
  const set = (on) => { mouseLook.set(on); box.checked = on; };
  set(menu.prefs.mouseLook === true);
  box.addEventListener('change', () => {
    set(box.checked);
    menu.prefs.mouseLook = box.checked;
    menu.save();
    if (box.checked) hud.toast('Click the view to look around · Esc frees the mouse', 2600);
  });
}
// The clock, kept up while the panel's open (and the slider with it, unless
// it's in your hand).
function updateWeatherPanel() {
  if (document.getElementById('fly-weather').classList.contains('hidden')) return;
  const m = Math.floor(weather.hour * 60);
  wxClock.value = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  wxPhase.textContent = weather.kind === 'changeable' ? `${weather.phase} · ${WEATHERS[weather.current].label.toLowerCase()}` : weather.phase;
  if (!wxDragging) wxHour.value = weather.hour.toFixed(2);
}

const riderParam = new URLSearchParams(location.search).get('rider');
void chooseRider([riderParam, menu.prefs.rider].find((id) => RIDERS.includes(id)) ?? 'male');

// ---------- Gear ----------
// The menu's Outfit & gear panel: a snowboard or skis (stand-ins for now, see
// player/rider-skis.js). Remembered like the rider; ?gear=ski picks too.
const GEARS = ['board', 'ski'];
const gearButtons = [...document.querySelectorAll('#fly-outfit [data-gear]')];
function chooseGear(gear) {
  rider.setGear(gear);
  phys.gear = rider.gear;
  trail.gap(phys.pos);
  for (const b of gearButtons) b.setAttribute('aria-pressed', String(b.dataset.gear === rider.gear));
  if (menu.prefs.gear !== rider.gear) {
    menu.prefs.gear = rider.gear;
    menu.save();
  }
}
for (const b of gearButtons) b.addEventListener('click', () => chooseGear(b.dataset.gear));
chooseGear([new URLSearchParams(location.search).get('gear'), menu.prefs.gear].find((g) => GEARS.includes(g)) ?? 'board');

// ---------- Panels ----------
const panel = document.getElementById('panel');
const panelNextBtn = document.getElementById('panel-next');
let panelNext = null;
// `label`, if given, is written on the next button, which then runs the panel's width.
function showPanel(tab, html, next, label = null) {
  document.getElementById('panel-tab').textContent = tab;
  document.getElementById('panel-body').innerHTML = html;
  panelNextBtn.textContent = label ?? '▶';
  panelNextBtn.classList.toggle('wide', !!label);
  panel.classList.remove('hidden');
  panelNext = () => { panel.classList.add('hidden'); next(); };
}
panelNextBtn.addEventListener('click', () => {
  sound.start();
  if (panelNext) { const f = panelNext; panelNext = null; f(); }
});

// ---------- Game state ----------
let state = 'title'; // title → swoop → intro → ride ⇄ lift / drive / soak, or arrive → ride from the diorama
let elapsed = 0, timing = false, falls = 0;
let camDir = new THREE.Vector3(startAt.dx, 0, startAt.dz);

// From your spawn, or from `at` ({ x, z, dx, dz, toast }) coming back to where you left off.
function startRun(at = spawn) {
  restoreRide();
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  trail.clear();
  elapsed = 0; timing = false; falls = 0;
  rider.pose.tumble = 0;
  camDir.set(at.dx, 0, at.dz);
  mouseLook.reset();
  snapCamera();
  state = 'ride';
  hud.show(true);
  hud.toast(at.toast, 2000);
  gps.reroute(gpsFrom());
}

phys.reset(startAt.x, startAt.z, yawOf(startAt.dx, startAt.dz));
gps.restore(gpsFrom()); // a destination set before a reload or a trip to the diorama
// On a touch screen the keys give way to the four moves, drawn.
const MOVES = {
  stick: '<circle cx="26" cy="26" r="22" stroke-dasharray="3 3"/><circle cx="19" cy="22" r="9" fill="#fff" stroke-width="2.4"/>'
    + '<path d="M26 9l-3 3M26 9l3 3M26 43l-3-3M26 43l3-3M9 26l3-3M9 26l3 3M43 26l-3-3M43 26l-3 3"/>',
  speed: '<path d="M8 34a19 19 0 1 1 36 0M12 34h28M26 30l9-12"/><circle cx="26" cy="30" r="2.5" fill="#f0c24a"/>',
  home: '<path d="M12 24a15 15 0 1 1 3 12M12 13v11h11"/>',
  ollie: '<circle cx="26" cy="26" r="21" fill="#f0c24a" stroke-width="2.4"/><path d="M15 33h22M26 29V15M20.5 20.5 26 15l5.5 5.5"/>',
  card: '<rect x="4" y="15" width="44" height="22" fill="#fff" stroke-width="2.4"/><path d="M11 26h20M37 21l5 5-5 5"/>',
  map: '<circle cx="26" cy="26" r="21" fill="#fff" stroke-width="2.4"/><path d="M17 37c3-8 6-13 9-20M30 38c-1-7 0-14 4-21" stroke="#4f8fd6"/>'
    + '<path d="M26 15l5 13-5-3-5 3z" fill="#f0c24a"/>',
};
const move = (name) => `<svg viewBox="0 0 52 52" aria-hidden="true">${MOVES[name]}</svg>`;
// A compact first-run field guide: keep the essentials visible and the less
// frequent controls available without covering the mountain with instructions.
const introTile = (icon, title, instruction) => `<div class="intro-tile">${move(icon)}<div><b>${title}</b><span>${instruction}</span></div></div>`;
const introPanel = () => showPanel(koktokay ? '可可托海国际滑雪场' : '禾木吉克普林', `
  <div class="intro-guide">
    <p class="intro-place">${mainRun.name} · ${Math.round(detail.heightAt(startAt.x, startAt.z))} 米 <span>— 开始探索雪山</span></p>
    <div class="intro-tiles">
      ${touch.on ? `
        ${introTile('stick', '转弯与速度', '拖动左下方转弯，向上加速，向后刹车')}
        ${introTile('ollie', '跳跃', '按住起跳后松开，在空中转向')}
        ${introTile('card', '互动', '点击提示卡与附近物体互动')}
        ${introTile('map', '查看路线', '点击地图查看全图与导航')}
      ` : `
        ${introTile('stick', '转弯', '<kbd>A</kbd> <kbd>D</kbd> 向左 / 向右转弯')}
        ${introTile('speed', '速度', '<kbd>W</kbd> 压低重心 / 蹬行 · <kbd>S</kbd> 侧滑刹车')}
        ${introTile('ollie', '跳跃', '<kbd>Space</kbd> 按住后松开起跳，在空中旋转')}
        ${introTile('card', '互动', '<kbd>E</kbd> 与附近物体互动')}
        ${introTile('map', '地图与导航', '<kbd>M</kbd> 或点击小地图')}
        ${introTile('home', '返回起点', '<kbd>R</kbd> 返回出发点')}
      `}
    </div>
    ${touch.on ? '' : `<details class="intro-more"><summary>更多操作</summary>
      <p><kbd>F</kbd> 切换滑行 / 步行（需支持步行的滑手） · <kbd>W</kbd> 步行， <kbd>Shift</kbd> 奔跑， <kbd>A</kbd> / <kbd>D</kbd> 转向， <kbd>S</kbd> 停止</p>
      <p><kbd>E</kbd> 抚摸牧羊犬 · <kbd>Q</kbd> 投掷雪球</p>
      <p>Jetson ONE: <kbd>Space</kbd> 起飞 / 爬升 · <kbd>Shift</kbd> 下降 / 着陆</p>
    </details>`}
    <p class="intro-credit">地形：真实高程数据 · 雪道与索道：OpenStreetMap / OpenSkiMap</p>
  </div>`, startRun, '开始滑行 ▸');

// ---------- Camera ----------
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _look = new THREE.Vector3();
const camLook = new THREE.Vector3();
// How far the screen is toward a phone held upright: 0 when it's square or
// wider, 1 at 9:19.5. A tall, narrow view sees little of the slope either side,
// so as this grows the cameras pull back, rise, look further ahead and widen
// their lens, keeping you low in the frame with the run ahead above you.
const portrait = () => THREE.MathUtils.clamp((1 - camera.aspect) / 0.54, 0, 1);
// Indoors (the coffee cabin, the yurt) it comes in close behind them, low and wide, like
// a following shot, staying inside the room's walls: `indoors` eases 0 to 1 as
// they go in through the door, and back out.
let indoors = 0;
const INDOORS = { dist: 2.4, up: 0.55, ahead: 1.6, look: 0.35 };
function cameraTarget(out, look) {
  const sp = phys.speed, p = portrait(), k = indoors;
  const d = THREE.MathUtils.lerp(4.6 + p * 3.4 + Math.min(sp, 30) * 0.07, INDOORS.dist, k);
  out.copy(phys.pos).addScaledVector(camDir, -d);
  out.y += THREE.MathUtils.lerp(1.9 + p * 2.1 + Math.min(sp, 30) * 0.025, INDOORS.up + 0.9, k);
  look.copy(phys.pos).addScaledVector(camDir, THREE.MathUtils.lerp(3.5 + p * 6.5, INDOORS.ahead, k));
  look.y += THREE.MathUtils.lerp(0.7 - p * 0.3, INDOORS.look + 0.7, k);
  if (mouseLook.yaw || mouseLook.pitch) {
    ridePivot(_pv);
    swing(out, _pv, camDir, mouseLook.yaw, mouseLook.pitch);
    swing(look, _pv, camDir, mouseLook.yaw, mouseLook.pitch);
  }
  const room = k > 0.5 ? roomAround(phys.pos.x, phys.pos.z) : null;
  if (room) room.keepIn(out, 0.6);
  out.y = Math.max(out.y, detail.heightAt(out.x, out.z) + THREE.MathUtils.lerp(1.5, 0.9, k));
}
// Mouse look swings the camera round the rider's chest (or the vehicle's look
// point), and turns the camera on the screen at once by however far the mouse
// moved since the last frame, so the follow below has nothing to catch up.
const _pv = new THREE.Vector3(), _ld = new THREE.Vector3();
const ridePivot = (out) => out.copy(phys.pos).setY(phys.pos.y + 1.1);
function swingCamera(pivot) {
  const d = mouseLook.take();
  if (!d.yaw && !d.pitch) return;
  _ld.subVectors(camLook, camera.position).setY(0).normalize();
  swing(camera.position, pivot, _ld, d.yaw, d.pitch);
  swing(camLook, pivot, _ld, d.yaw, d.pitch);
}
function snapCamera() {
  cameraTarget(camera.position, camLook);
  camera.lookAt(camLook);
}

let introT = 0;
// Slow orbit around the rider's toe side — a portrait shot with the run behind.
function introPose(t, pos, look) {
  const a = Math.sin(t * 0.25) * 0.6;
  pos.set(Math.cos(a) * 5.5, 1.6, Math.sin(a) * 5.5 - 1.5).applyQuaternion(rider.root.quaternion).add(phys.pos);
  pos.y = Math.max(pos.y, detail.heightAt(pos.x, pos.z) + 1);
  look.copy(phys.pos);
  look.y -= 0.6; // keeps the rider in the upper half, clear of the panel
}
function updateIntroCamera(dt) {
  introT += dt;
  introPose(introT, camera.position, _look);
  camera.lookAt(_look);
  setLens(50 + portrait() * 10, 6);
}

// The title and the flight down scale the near plane and the ink pass's line
// thresholds with distance, so a 20 km view draws like a close-up.
function setLens(fov, dist) {
  camera.fov = fov;
  camera.near = THREE.MathUtils.clamp(dist / 400, 0.3, 50);
  camera.updateProjectionMatrix();
  post.material.uniforms.uDepthScale.value = THREE.MathUtils.clamp(150 / dist, 0.005, 1);
}

// ---------- Title ----------
// ?notitle skips straight to the panel at the top station.
const TITLE_FOV = 30;
const TITLE_ELEVATION = THREE.MathUtils.degToRad(24);
const island = createIsland(detail, piste, { ...meta.detail, treeline: TREELINE });
const letters = createTitleLetters();
const specks = createSnowSpecks();
const setCloud = createCloudWipe(document.getElementById('cloud'));
const titleEl = document.getElementById('title');
if (koktokay) letters.group.visible = false;
scene.add(island, camera);
camera.add(letters.group, specks.points);
const pointer = new THREE.Vector2();
window.addEventListener('pointermove', (e) => pointer.set((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2));
document.getElementById('begin').addEventListener('click', () => begin());

let orbitA = 0.5; // 0 looks up the valley from the south
// Far enough out for the island's bounding sphere to fill the narrower field of view.
function titleDistance() {
  const vf = THREE.MathUtils.degToRad(TITLE_FOV) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  return (island.userData.radius / Math.sin(Math.min(vf, hf))) * (camera.aspect < 1 ? 1 : 0.9);
}
function titlePose(pos, look) {
  const D = titleDistance(), c = island.userData.center;
  pos.set(Math.sin(orbitA) * Math.cos(TITLE_ELEVATION), Math.sin(TITLE_ELEVATION), Math.cos(orbitA) * Math.cos(TITLE_ELEVATION))
    .multiplyScalar(D).add(c);
  look.copy(c);
  return D;
}
function setTitleWorld(on) {
  island.visible = on;
  backdrop.visible = !on;
  sky.material.uniforms.uFloat.value = on ? 1 : 0;
  weather.title = on;
}
let titleDist = 1;
function updateTitleCamera(dt) {
  orbitA += dt * 0.035;
  titleDist = titlePose(camera.position, camLook);
  camera.lookAt(camLook);
  setLens(TITLE_FOV, titleDist);
}

// Begin: the letters scatter and the camera dives from the title orbit to the
// portrait shot at the top station. Distance shrinks exponentially (so each
// second covers the same share of the way, from 20 km down to 6 m), the camera
// circles round to the rider's side, diving steeper midway, and a cloud 4.5 km
// out hides the swap from the island to the full valley.
let swoop = null;
function begin() {
  if (state !== 'title') return;
  state = 'swoop';
  sound.start();
  titleEl.classList.add('gone');
  letters.leave();
  const pos1 = new THREE.Vector3(), anchor = new THREE.Vector3();
  introPose(0, pos1, anchor);
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(anchor));
  const to = new THREE.Spherical().setFromVector3(pos1.clone().sub(anchor));
  // Turn the short way round.
  to.theta = from.theta + THREE.MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI;
  const l0 = from.radius, l1 = to.radius;
  swoop = {
    t: 0, dur: 6.5, anchor, l0, l1, from, to,
    lookOff: camLook.clone().sub(anchor),
    clearAt: Math.log(l0 / 4500) / Math.log(l0 / l1), // progress when 4.5 km out
    cleared: false,
  };
}
const _sph = new THREE.Spherical();
function updateSwoop(dt) {
  const S = swoop;
  S.t = Math.min(1, S.t + dt / S.dur);
  const e = S.t * S.t * S.t * (S.t * (S.t * 6 - 15) + 10); // smootherstep
  const u = THREE.MathUtils.smoothstep(S.t, 0, 0.85);
  _sph.set(
    S.l0 * Math.pow(S.l1 / S.l0, e),
    THREE.MathUtils.lerp(S.from.phi, S.to.phi, u) - Math.sin(Math.PI * u) * 0.45, // dive steeper midway
    THREE.MathUtils.lerp(S.from.theta, S.to.theta, u),
  );
  const len = _sph.radius;
  camera.position.setFromSpherical(_sph).add(S.anchor);
  if (detail.inside(camera.position.x, camera.position.z))
    camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 2);
  // The look point starts on the island's middle and closes on the rider as fast as the camera does.
  camLook.copy(S.anchor).addScaledVector(S.lookOff, (len / S.l0) * (1 - e));
  camera.lookAt(camLook);
  setLens(THREE.MathUtils.lerp(TITLE_FOV, 50, e), len);

  setCloud(THREE.MathUtils.clamp((0.1 - Math.abs(e - S.clearAt)) / 0.07, 0, 1));
  specks.opacity = 1 - THREE.MathUtils.smoothstep(S.t, 0.05, 0.3);
  if (!S.cleared && e >= S.clearAt) {
    S.cleared = true;
    setTitleWorld(false);
  }
  if (S.t >= 1) {
    setCloud(0);
    letters.group.visible = false; // still tumbling if the flight was skipped
    titleEl.classList.add('hidden');
    swoop = null;
    state = 'intro';
    introT = 0;
    introPanel();
  }
}

if (new URLSearchParams(location.search).has('notitle')) {
  state = 'intro';
  setTitleWorld(false);
  letters.group.visible = false;
  specks.opacity = 0;
  titleEl.classList.add('hidden');
  introPanel();
} else {
  setTitleWorld(true);
}

function updateRideCamera(dt) {
  const sp = phys.speed;
  _v.copy(phys.vel).setY(0);
  if (rider.locomotion === 'walk') {
    phys.forward(_v);
    camDir.lerp(_v, 1 - Math.exp(-dt * 2.2)).normalize();
  } else if (sp > 2 && phys.crashed <= 0) {
    _v.normalize();
    camDir.lerp(_v, 1 - Math.exp(-dt * 2.2)).normalize();
  }
  indoors += (roomAt(phys.pos.x, phys.pos.z) - indoors) * (1 - Math.exp(-dt * 2.5));
  swingCamera(ridePivot(_pv));
  cameraTarget(_w, _look);
  camera.position.lerp(_w, 1 - Math.exp(-dt * (6 + indoors * 3)));
  const room = indoors > 0.5 ? roomAround(phys.pos.x, phys.pos.z) : null;
  if (room) room.keepIn(camera.position, 0.5);
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 1.2 - indoors * 0.4);
  camLook.lerp(_look, 1 - Math.exp(-dt * (10 + indoors * 4)));
  camera.lookAt(camLook);
  camera.fov = 60 + portrait() * 15 + Math.min(sp, 30) * 0.45 + indoors * 14;
  camera.near = THREE.MathUtils.lerp(0.3, 0.08, indoors);
  camera.updateProjectionMatrix();
}

// ---------- Rider pose from physics ----------
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _f = new THREE.Vector3(), _x = new THREE.Vector3(), _up = new THREE.Vector3();
function poseRider(dt, snap = false) {
  const walking = rider.locomotion === 'walk' || !!specialAction;
  if (walking || !phys.grounded) _up.set(0, 1, 0);
  else _up.copy(phys.normal);
  phys.forward(_f);
  _f.addScaledVector(_up, -_f.dot(_up)).normalize();
  _x.crossVectors(_f, _up);
  _m.makeBasis(_x, _up, _w.copy(_f).negate());
  _q.setFromRotationMatrix(_m);
  if (walking || snap || hop) rider.root.quaternion.copy(_q);
  else rider.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 14));
  rider.root.position.copy(phys.pos);
  rider.root.position.y -= sink;
  if (hop) hopping(dt);

  const sp = phys.speed;
  let lean = Math.atan2(sp * phys.yawRate, G);
  if (input.brake && phys.grounded && rider.gear !== 'ski') lean -= 0.35; // sit on the heel edge (skis snowplough)
  lean = THREE.MathUtils.clamp(lean, -1.0, 1.0);
  if (!phys.grounded) lean *= 0.3;
  const falling = phys.crashed > 0;
  const fallTime = falling ? FALL_DURATION - phys.crashed : 0;
  rider.pose.tumble = 0;
  rider.update(dt, {
    crouch: falling || phys.landingRecovery > 0 ? 1 : walking ? 0 : petT > 0 ? 1 : input.tuck ? 0.9 : input.brake ? 0.6 : 0.35 + phys.jumpCharge * 0.5,
    lean: walking || falling ? 0 : lean,
    twist: walking || falling ? 0 : input.steer * 0.5,
    roll: -phys.flip,
    fall: falling ? { time: fallTime, motion: phys.crashMotion } : null,
    shakeTime: phys.shakeOff > 0 ? SHAKE_DURATION - phys.shakeOff : null,
    protective: falling ? 0 : (phys.flip > 0 && (input.tuck || phys.flip < phys.flipTarget) ? 1 : 0),
    air: !walking && !phys.grounded,
    locomotion: rider.locomotion,
    speed: sp,
    // For the skier's pose (rider-skis.js).
    brake: state === 'ride' && input.brake && phys.grounded,
    tuck: state === 'ride' && input.tuck,
    charge: phys.jumpCharge,
    slip: phys.slip,
    landing: phys.landingRecovery,
  });
  if (falling || phys.flip > 0 || phys.landingRecovery > 0) rider.clearGround(phys.hf, falling);
}

// ---------- Powder ----------
// Off the runs the board rides in the snow rather than on it (phys.powder): it
// sinks to just over the ankles at speed, planing up on the snow, and to the
// lower calf slowing down or braking, with the snow heaped round it.
const POWDER = { slow: 0.22, fast: 0.12, brake: 0.04 }; // m deep
function updateSink(dt, onBoard) {
  const MU = THREE.MathUtils;
  const want = onBoard
    ? phys.powder * (MU.lerp(POWDER.slow, POWDER.fast, MU.smoothstep(phys.speed, 3, 14)) + (input.brake ? POWDER.brake : 0))
    : 0;
  sink += (want - sink) * Math.min(1, dt * (!phys.grounded ? 14 : want > sink ? 5 : 2.5));
}
function placeCollar() {
  collar.set(THREE.MathUtils.clamp(sink / 0.18, 0, 1));
  if (!collar.mesh.visible) return;
  collar.mesh.position.copy(phys.pos);
  collar.mesh.quaternion.copy(rider.root.quaternion);
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let acc = 0, time = 0;
const STEP = 1 / 120;
const _side = new THREE.Vector3(), _tail = new THREE.Vector3(), _sv = new THREE.Vector3();

function frame() {
  const elapsedFrame = clock.getDelta();
  const dt = Math.min(elapsedFrame, 0.05);
  // The rope must cover the same distance at low rendering frame rates. Bound
  // long tab stalls without changing the game's existing physics time step.
  const chairDt = Math.min(elapsedFrame, 0.25);
  time += dt;
  if (specialAction) {
    if (state !== 'ride' || rider.model !== specialAction.model || rider.locomotion !== 'act') stopSpecialAction();
    else {
      specialAction.time = (specialAction.time + dt) % specialAction.clip.duration;
      rider.play(specialAction.clip, specialAction.time);
    }
  }
  readInput();
  lifts.update(dt, chairDt);

  if (bigMap.isOpen && state !== 'lift') {
    sound.update(0, 0, false); // the ride holds still under the map
  } else if (state === 'ride') {
    acc += dt;
    while (acc >= STEP) {
      if (rider.locomotion === 'walk' || specialAction) phys.stepWalk(STEP, input);
      else phys.step(STEP, input);
      acc -= STEP;
    }
    for (const ev of phys.events.splice(0)) {
      if (ev.type === 'crash') { falls++; hud.toast(ev.reason === 'tree' ? 'Tree!' : 'Wipeout!'); trail.gap(phys.pos); }
      if (ev.type === 'respawn') respawnInPlace();
      if (ev.type === 'recovered') {
        trail.gap(phys.pos);
        _sv.copy(phys.pos).y += 1.05;
        powderSpray.emit(_sv, _w.set(0, 0.4, 0), 12, 0.65);
      }
      if (ev.type === 'air') {
        const tricks = [];
        if (ev.frontRolls > 0) tricks.push(`Front Roll ×${ev.frontRolls} (${ev.frontRolls * 360}°)`);
        if (ev.spin >= 180) tricks.push(`${ev.spin}°`);
        hud.toast(tricks.length ? `${tricks.join(' + ')}!` : `Air ${ev.time.toFixed(1)}s`);
      }
      if (ev.type === 'land' && phys.powder > 0.3) {
        _sv.copy(phys.vel).multiplyScalar(0.15);
        powderSpray.emit(phys.pos, _sv, Math.round(Math.min(40, 10 + ev.impact * 4) * phys.powder), 3);
      }
    }
    if (!timing && phys.pos.distanceTo(new THREE.Vector3(spawn.x, phys.pos.y, spawn.z)) > 3) timing = true;
    if (timing) elapsed += dt;
    updateBoarding();

    // Board track + spray. In powder the track is a furrow, and the board
    // throws up a plume as it goes, more when it turns or skids.
    phys.forward(_f);
    _side.set(-_f.z, 0, _f.x);
    const onBoard = rider.locomotion !== 'walk' && !specialAction && phys.grounded && phys.crashed <= 0;
    updateSink(dt, onBoard);
    if (onBoard) {
      if (rider.gear === 'ski') trail.add(phys.pos, _side, 0.09, phys.powder > 0.5 ? 0.42 + sink : 0, 0.25);
      else trail.add(phys.pos, _side, 0.28, phys.powder > 0.5 ? 0.36 + sink : 0);
      const kick = phys.slip * 0.6 + (input.brake ? 3 : 0) + Math.abs(phys.yawRate) * phys.speed * 0.08;
      const n = Math.min(6, Math.floor(kick * dt * 22 + Math.random()));
      if (n > 0 && phys.speed > 2) {
        _tail.copy(phys.pos).addScaledVector(_f, -0.5);
        _sv.copy(phys.vel).multiplyScalar(0.35).addScaledVector(_side, -Math.sign(phys.yawRate || 1) * 1.5);
        spray.emit(_tail, _sv, n, 2.2);
      }
      const plume = phys.powder * (Math.max(0, phys.speed - 3) * 0.1 + kick * 0.6);
      const m = Math.min(5, Math.floor(plume * dt * 12 + Math.random() * 0.6));
      if (m > 0) {
        _tail.copy(phys.pos).addScaledVector(_f, -0.4);
        _sv.copy(phys.vel).multiplyScalar(0.25).addScaledVector(_side, -Math.sign(phys.yawRate || 1) * 1.2);
        _sv.y -= 0.4;
        powderSpray.emit(_tail, _sv, m, 1.4);
      }
    } else if (!phys.grounded) trail.gap(phys.pos);
    poseRider(dt);
    placeCollar();
    updateRideCamera(dt);
    hud.update(phys, elapsed);
    sound.update(phys.speed, phys.slip + (input.brake ? 4 : 0), phys.grounded && rider.locomotion !== 'walk' && !specialAction);
  } else if (state === 'drive') {
    const drive = car.phys;
    acc += dt;
    while (acc >= STEP) {
      drive.step(STEP, pedals);
      acc -= STEP;
    }
    for (const ev of drive.events.splice(0)) {
      if (ev.type === 'crash') hud.toast(ev.reason === 'tree' ? 'Tree!' : ev.reason === 'ground' ? 'Bump!' : 'Crunch!');
      if (ev.type === 'landed') hud.toast('Landed', 1200);
      if (ev.type === 'catch' || ev.type === 'release') dipOars(ev);
    }
    car.model.update(dt, drive);
    followCar();
    if (car.model.saddle) poseSeated(dt);
    layTracks();
    if (car.floats) leaveWake(dt);
    if (timing) elapsed += dt;
    updateDriveCamera(dt);
    hud.update(phys, elapsed);
    driveT += dt;
    hud.prompt(...carHint(car));
    // The rotors' wash is a wind of its own.
    sound.update(drive.speed * car.wind + (car.flies ? drive.spool * 12 : 0), 0, false, car.floats ? null : {
      kind: car.name, speed: Math.abs(drive.vel.dot(drive.forward(_f))), spool: drive.spool, load: drive.load,
      throttle: pedals.throttle || pedals.reverse || (car.flies && pedals.climb),
    });
  } else if (state === 'horse') {
    rideHorse(dt);
    if (timing) elapsed += dt;
    hud.update(phys, elapsed);
    sound.update(horse.speed * 0.6, 0, false);
  } else if (state === 'soak') {
    if (goingIn) gettingIn(dt);
    else poseSoak(dt);
    updateSoakCamera(dt);
    if (timing) elapsed += dt;
    hud.update(phys, elapsed);
    sound.update(0, 0, false);
  } else if (state === 'lift') {
    const label = `${liftRide.ride.label} ↑`;
    updateLift(liftRide.system ? chairDt : dt); // may step you off at the top
    if (timing) elapsed += dt;
    hud.update(phys, elapsed, state === 'lift' ? label : null);
    sound.update(0, 0, false);
  } else {
    poseRider(dt);
    if (state === 'intro') updateIntroCamera(dt);
    else if (state === 'title') updateTitleCamera(dt);
    else if (state === 'swoop') updateSwoop(dt);
    else if (state === 'arrive') updateArrival(dt);
    sound.update(0, 0, false);
  }
  if (state !== 'ride') {
    sink = 0;
    collar.set(0);
  }
  const onMountain = state === 'ride' || state === 'lift' || state === 'drive' || state === 'horse' || state === 'soak';
  if (onMountain && !bigMap.isOpen) {
    const ev = gps.update(dt, gpsFrom());
    if (ev?.type === 'arrived') hud.toast(`Arrived · ${ev.name}`, 2600);
  }
  marks.group.visible = onMountain;
  if (onMountain) marks.update(gps, time, state === 'lift', phys.pos);
  if (onMountain && (whereT -= dt) <= 0) {
    whereT = 0.25;
    saveWhereabouts(whereabouts());
  }
  if (leaving) updateLeaving(dt);
  touchLayout();
  letters.update(dt, time, camera, titleDist * 0.45, pointer);
  specks.update(dt, time, camera, titleDist, renderer.getPixelRatio());
  if (island.visible) island.update(time);

  for (const v of vehicles) if (v !== car && v.phys && (v.floats || v.phys.spool > 0)) { v.phys.coast(dt); v.model.update(dt, v.phys); }
  // The boats' insides kept dry: cut out of the water and its rings.
  const dry = vehicles.filter((v) => v.floats && v.phys).map((v) => v.model.waterline(v.lake.level));
  water.update(time, dry);
  ripples.update(dt, dry);
  spray.update(dt);
  powderSpray.update(dt);
  if (change && time >= change.at) {
    rider.wear(change.outfit);
    change = null;
  }
  onsen.update(dt, time, state === 'soak' && (!goingIn || goingIn.wet) ? rider.root.position : null);
  updateDog(dt);
  updateFoxes(dt);
  if (state !== 'horse') updateHorse(dt);
  updateWheels(dt);
  updateNpcs(dt);
  // The spout pouring into the pool, heard from 30 m off.
  const { fall } = onsen;
  const spout = fall ? 1 - THREE.MathUtils.smoothstep(Math.hypot(phys.pos.x - fall.x, phys.pos.z - fall.z), 3, 30) : 0;
  // And the lake lapping at its shore, and at the boat, louder as the oars dip.
  splash = Math.max(0, splash - dt * 1.5);
  const edge = state === 'ride' ? shoreAt(lakes, phys.pos.x, phys.pos.z, 25) : null;
  const lap = car?.floats ? 0.3 + splash : edge ? 0.3 * (1 - THREE.MathUtils.smoothstep(Math.abs(edge.d), 2, 25)) : 0;
  sound.setWater(Math.max(spout, lap));
  forest.update(camera.position);
  terrain.update(camera.position);
  if (debug.cam) debug.cam(camera, phys);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = time;
  weather.update(dt, { time, camera, viewHeight: renderer.domElement.height, focus: phys.pos });
  updateWeatherPanel();

  // Normal-edge lines fade out by ~600 m, so far geometry can skip that pass.
  post.render(scene, camera, time, [sky, weather.snowfall.points, spray.points, dog.spray.points, ...(foxes ? [foxes.spray.points] : []), ...(horse ? horse.sprays : []), specks.points, backdrop, ripples.group, ...forest.farMeshes, ...marks.hidden]);
  requestAnimationFrame(frame);
}

// What the touch controls show (touch.js): on the board the stick and Ollie,
// with On foot beside it for a rider who can walk; on foot Board in Ollie's
// place; in a vehicle its handbrake (flying, Up and Down) and the way out; on a
// lift only Skip. The button above them does what E would where you are, and
// while the dog's about Throw, beside it, does what Q would.
function touchLayout() {
  const shown = touch.on && !bigMap.isOpen && !leaving && (state === 'ride' || state === 'drive' || state === 'horse' || state === 'lift' || state === 'soak');
  touch.show(shown);
  if (!shown) return;
  if (state === 'ride') {
    const walking = rider.locomotion === 'walk';
    const act = dialogue.open ? { label: 'Next', icon: 'talk', lit: true }
      : nearCar ? { label: nearCar.touch.enter, icon: 'in', lit: true }
      : nearHorse ? { label: 'Ride', icon: 'in', lit: true }
      : nearPool ? { label: 'Soak', icon: 'in', lit: true }
        : nearDog ? { label: 'Pet', icon: 'paw', lit: true }
          : nearWheel ? { label: 'Turn', icon: 'wheel', lit: true }
            : boardable ? { label: 'Ride up', icon: 'lift', lit: true } : null;
    touch.layout({
      layout: walking ? 'walk' : 'board',
      big: walking ? 'board' : 'ollie',
      alt: dogAround ? 'throw' : null,
      aux: !walking && rider.canWalk ? 'foot' : null,
      act,
    });
  } else if (state === 'drive') {
    touch.layout({
      layout: car.flies ? 'fly' : 'drive',
      big: car.flies ? 'up' : car.floats ? 'hold' : 'handbrake',
      low: car.flies ? 'down' : null,
      act: { label: car.touch.exit, icon: 'out', dim: car.phys.canExit === false },
    });
  } else if (state === 'horse') {
    touch.layout({ layout: 'drive', act: { label: 'Get off', icon: 'out', dim: horse.state !== 'ridden' } });
  } else if (state === 'soak') {
    touch.layout({ layout: 'lift', act: { label: 'Get out', icon: 'out' } });
  } else {
    touch.layout({ layout: 'lift', stick: false, act: liftRide.t > 0.5 && !liftRide.waiting ? { label: liftRide.system ? 'Faster' : 'Skip', icon: 'skip' } : null });
  }
}

// Back on your feet where you came to rest, heading the way you were going.
// After a tree you're set beside its trunk, on the side you were passing it.
const _n = new THREE.Vector3(), _d = new THREE.Vector3();
function respawnInPlace() {
  restoreRide();
  const dir = _d.copy(phys.crashDir);
  let x = phys.pos.x, z = phys.pos.z;
  for (let i = 0; i < 6; i++) {
    const t = forest.hit(x, z, 1.2);
    if (!t) break;
    const sx = -dir.z, sz = dir.x;
    const side = Math.sign((x - t.x) * sx + (z - t.z) * sz) || 1;
    x = t.x + sx * side * (t.r + 1.5);
    z = t.z + sz * side * (t.r + 1.5);
  }
  // Don't restart facing up the hill: turn across it instead.
  detail.normalAt(x, z, _n);
  const fall = _w.set(_n.x, 0, _n.z);
  if (fall.lengthSq() > 1e-4) {
    fall.normalize();
    const d = dir.dot(fall);
    if (d < 0.1) dir.addScaledVector(fall, 0.4 - d).normalize();
  }
  phys.reset(x, z, yawOf(dir.x, dir.z));
  camDir.copy(dir);
  snapCamera();
  trail.gap(phys.pos);
}

// ---------- Lifts ----------
let boardable = null, atHall = null, nearCar = null, nearHorse = false, nearPool = false, nearDog = false, dogAround = false, nearWheel = null;
function updateBoarding() {
  boardable = null;
  nearCar = null;
  nearHorse = false;
  nearPool = false;
  nearDog = dogAround = false;
  nearWheel = null;
  if (phys.crashed <= 0 && phys.grounded) {
    let bestD = 2.5;
    for (const v of vehicles) {
      const d = v.phys ? boxGap(v.model.footprint, phys.pos.x, phys.pos.z) : Infinity;
      if (d < bestD) { bestD = d; nearCar = v; }
    }
    nearHorse = !nearCar && !!horse && phys.speed < 3 && horse.canMount(phys.pos);
    nearPool = !nearCar && !nearHorse && onsen.near(phys.pos.x, phys.pos.z);
    if (nearPool) rider.preloadOutfit(SOAK_OUTFIT); // ready by the time you get in
    nearDog = !nearCar && !nearHorse && !nearPool && phys.speed < 3 && dog.canPet(phys.pos);
    dogAround = phys.speed < 3 && dog.canFetch(phys.pos) && phys.pos.distanceTo(dog.pos) < 15; // near enough to throw for, even right by it
    // Standing by a prayer wheel (walking past, the hand turns them anyway).
    if (!nearCar && !nearHorse && !nearPool && !nearDog && rider.locomotion === 'walk' && phys.speed < 0.5 && turnT <= 0) nearWheel = wheels.near(phys.pos, phys.forward(_face));
  }
  if (phys.crashed <= 0 && phys.grounded) {
    let bestD = BOARD_REACH;
    for (const s of boardSpots) {
      const d = boxGap(s.station, phys.pos.x, phys.pos.z);
      if (d < bestD) { bestD = d; boardable = s; }
    }
  }
  // Coming up to a service centre puts its name up.
  const hall = SERVICE_CENTRES.find((c) => Math.hypot(phys.pos.x - c.x, phys.pos.z - c.z) < 150) ?? null;
  if (hall && hall !== atHall) hud.toast(hall.zh, 2200);
  atHall = hall;
  if (dialogue.open) hud.prompt(''); // the box says E itself
  else if (nearCar) hud.prompt(nearCar.prompt, nearCar.touch.prompt, pressE);
  else if (nearHorse) hud.prompt('<kbd>E</kbd> ride the <b>horse</b>', 'Ride the <b>horse</b> ▸', pressE);
  else if (nearPool) hud.prompt('<kbd>E</kbd> soak in the <b>hot spring</b>', 'Soak in the <b>hot spring</b> ▸', pressE);
  else if (nearDog) hud.prompt(`<kbd>E</kbd> pet <b>${DOG.en}</b> · <kbd>Q</kbd> throw a snowball`, `Pet <b>${DOG.en}</b> ▸`, pressE);
  else if (nearWheel) hud.prompt('<kbd>E</kbd> turn the <b>prayer wheel</b>', 'Turn the <b>prayer wheel</b> ▸', pressE);
  else if (boardable) {
    const up = `<b>${boardable.ride.label}</b> up to ${Math.round(boardable.ride.top.y).toLocaleString()} m`;
    hud.prompt(`<kbd>E</kbd> ride ${up}`, `Ride ${up} ▸`, pressE);
  } else if (!timing && spawn.hint) hud.prompt(spawn.hint, spawn.touchHint);
  else if (dogAround) hud.prompt(`<kbd>Q</kbd> throw a snowball for <b>${DOG.en}</b>`, `Throw a snowball for <b>${DOG.en}</b> ▸`, pressQ);
  else hud.prompt('');
}

let liftRide = null;
const _c = new THREE.Vector3();
function board(ride) {
  const system = lifts.chairSystems.find(s => s.id === ride.id);
  if (system) { boardChair(ride, system); return; }
  const gondolaSystem = lifts.gondolaSystems.find(s => s.id === ride.id);
  restoreRide();
  state = 'lift';
  // Sped up: 1–2 km of cable in 10–22 s.
  liftRide = { ride, t: 0, dur: THREE.MathUtils.clamp(ride.length / 110, 10, 22) };
  if (gondolaSystem) {
    lifts.update(0);
    // Bring the next cabin round to the boarding point under the canopy.
    const { path } = gondolaSystem;
    const toBoarding = (c) => ((path.boarding - c.distance) % path.total + path.total) % path.total;
    const car = gondolaSystem.cars.reduce((a, b) => toBoarding(b) < toBoarding(a) ? b : a);
    gondolaSystem.phase = (gondolaSystem.phase + toBoarding(car)) % path.total;
    lifts.update(0);
    gondolaSystem.passenger = car;
    gondolaSystem.speed = gondolaSystem.targetSpeed = ride.length / liftRide.dur;
    Object.assign(liftRide, { gondolaSystem, car, previous: car.distance });
    lifts.update(0);
  }
  rider.root.visible = false;
  cabin.visible = true;
  cabin.setLine(ride.label);
  cabin.rotation.set(0, Math.atan2(ride.dir.x, ride.dir.z), 0);
  phys.vel.set(0, 0, 0);
  trail.gap(phys.pos);
  hud.prompt('<kbd>Space</kbd> skip the ride', 'Skip the ride ▸', pressE);
  updateLift(0);
  camera.position.copy(_w);
}

function updateLift(dt) {
  const L = liftRide, { ride } = L;
  if (L.system) { updateChairRide(dt); return; }
  L.t = Math.min(L.dur, L.t + dt);
  if (L.gondolaSystem) {
    cabin.position.copy(L.car.position);
    cabin.rotation.y = L.car.yaw;
    if (crossedChairliftPoint(L.previous, L.car.distance, L.gondolaSystem.path.upLength, L.gondolaSystem.path.total)) { unload(ride); return; }
    L.previous = L.car.distance;
  } else {
    const u = L.t / L.dur;
    const s = (u - Math.sin(u * Math.PI * 2) / (Math.PI * 2)) * ride.length; // eased start and stop
    let i = 1;
    while (i < ride.acc.length - 1 && ride.acc[i] < s) i++;
    cabin.position.lerpVectors(ride.cable[i - 1], ride.cable[i], (s - ride.acc[i - 1]) / (ride.acc[i] - ride.acc[i - 1]));
  }
  cabin.rotation.z = Math.sin(L.t * 1.3) * 0.02;
  phys.pos.copy(cabin.position);
  // Camera off the cabin's flank, looking up the line past it.
  _c.set(-ride.dir.z, 0, ride.dir.x);
  _w.copy(cabin.position).addScaledVector(ride.dir, -14).addScaledVector(_c, 5);
  _w.y = Math.max(_w.y + 1, detail.heightAt(_w.x, _w.z) + 2);
  camera.position.lerp(_w, 1 - Math.exp(-dt * 4));
  _look.copy(cabin.position).addScaledVector(ride.dir, 6);
  _look.y -= 3;
  camLook.copy(_look);
  camera.lookAt(camLook);
  camera.fov = 58 + portrait() * 12;
  camera.updateProjectionMatrix();
  if (!L.gondolaSystem && L.t >= L.dur) unload(ride);
}

// Seat coordinates are in Rider's body frame. Both Mixamo riders use the same
// seated IK, with their own measured hip and leg proportions.
const chairSeat = {
  hips: new THREE.Vector3(0, 0, 0),
  feet: [new THREE.Vector3(0.18, -0.48, 0.48), new THREE.Vector3(-0.18, -0.48, 0.48)],
  grips: [new THREE.Vector3(0.35, 0.18, 0.22), new THREE.Vector3(-0.35, 0.18, 0.22)],
  kneeOut: 0.12, fold: 0.05, lift: true, chairAnimation: true,
};
function boardChair(ride, system) {
  lifts.update(0); // Populate grip positions even if boarding before the first frame.
  const start = phys.pos.clone();
  const target = system.path.points[0].clone();
  target.y = detail.heightAt(target.x, target.z);
  const posts = lifts.collisionParts.filter(o => Math.hypot(o.x - ride.bottom.x, o.z - ride.bottom.z) < 9);
  const waypoints = boardingPath(start, target, posts);
  if (!waypoints) { hud.toast('Move clear of the station posts to board', 2000); return; }
  restoreRide();
  const walkLength = waypoints.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - waypoints[i].x, p.z - waypoints[i].z), 0);
  const walkTime = Math.max(1, walkLength / 3);
  state = 'lift';
  mouseLook.force = true;
  mouseLook.reset();
  rider.setLocomotion('walk');
  // Start sitting just before the grip reaches the outgoing strand, so the
  // moving cushion picks the rider up instead of passing through their body.
  const catchAt = system.path.total - 1.2;
  const chair = system.chairs.map(c => ({ c, wait: ((catchAt - c.distance + system.path.total) % system.path.total) / Math.max(system.speed, 0.1) }))
    .filter(x => x.wait >= walkTime + 0.5).sort((a, b) => a.wait - b.wait)[0]?.c ?? system.chairs[0];
  liftRide = { ride, system, chair, catchAt, t: 0, waiting: true, waypoints, walkLength, walkTime, previous: chair.distance };
  phys.vel.set(0, 0, 0);
  trail.gap(phys.pos);
  cabin.visible = false;
  hud.prompt('Walk to the loading point · wait for your chair', 'Wait for your chair');
}
function updateChairRide(dt) {
  const L = liftRide, { chair, system, ride } = L;
  L.t += dt;
  if (L.waiting) {
    const k = THREE.MathUtils.smootherstep(L.t / L.walkTime, 0, 1);
    let distance = k * L.walkLength, a = L.waypoints[0], b = L.waypoints.at(-1);
    for (let i = 1; i < L.waypoints.length; i++) {
      const next = L.waypoints[i], length = Math.hypot(next.x - a.x, next.z - a.z);
      b = next;
      if (distance <= length || i === L.waypoints.length - 1) {
        const t = length ? Math.min(1, distance / length) : 1;
        phys.pos.x = THREE.MathUtils.lerp(a.x, b.x, t);
        phys.pos.z = THREE.MathUtils.lerp(a.z, b.z, t);
        break;
      }
      distance -= length; a = next;
    }
    phys.pos.y = detail.heightAt(phys.pos.x, phys.pos.z);
    const dx = b.x - a.x, dz = b.z - a.z;
    phys.yaw = yawOf(dx, dz);
    phys.vel.set(dx, 0, dz).normalize().multiplyScalar(L.t < L.walkTime ? 3 : 0);
    poseRider(dt);
    if (crossedChairliftPoint(L.previous, chair.distance, L.catchAt, system.path.total)) {
      L.waiting = false;
      phys.vel.set(0, 0, 0);
      startHop();
      rider.setLocomotion('sit', chairSeat);
      hud.prompt('<kbd>Space</kbd> speed up the lift · mouse / arrows look around', 'Speed up the lift ▸', pressE);
    }
    L.previous = chair.distance;
  } else {
    // The seat offset turns with the chair through the terminal bullwheel.
    const c = Math.cos(chair.yaw), s = Math.sin(chair.yaw);
    rider.root.position.copy(chair.position);
    rider.root.position.x += c * 0.55 + s * 0.08;
    rider.root.position.z += -s * 0.55 + c * 0.08;
    rider.root.position.y -= 2.25;
    rider.root.quaternion.setFromAxisAngle(Y_AXIS, chair.yaw + Math.PI);
    if (hop) hopping(dt);
    rider.update(dt, { crouch: 0, air: false, speed: 0, lean: 0, twist: 0 });
    phys.pos.copy(rider.root.position);
    if (system.path.upLength - chair.distance < 75) system.targetSpeed = 5;
    if (chair.distance >= system.path.upLength - 0.8 && chair.distance < system.path.upLength + 10) {
      unloadChair(ride, chair, system); return;
    }
  }
  if (keys.has('ArrowLeft')) mouseLook.turn(1.15 * dt, 0);
  if (keys.has('ArrowRight')) mouseLook.turn(-1.15 * dt, 0);
  _look.copy(L.waiting ? phys.pos : chair.position);
  _look.y += L.waiting ? 1 : -1.75;
  _w.copy(_look).addScaledVector(ride.dir, -6).addScaledVector(system.path.side, 3); _w.y += 2;
  swing(_w, _look, ride.dir, mouseLook.yaw, mouseLook.pitch);
  _w.y = Math.max(_w.y, detail.heightAt(_w.x, _w.z) + 1.2);
  // The terminal bullwheel is at rope height. Keep the station camera below
  // it and the roof, so a close orbit does not put that machinery across the rider.
  const station = Math.hypot(_look.x - ride.bottom.x, _look.z - ride.bottom.z) < 10 ? ride.bottom
    : Math.hypot(_look.x - ride.top.x, _look.z - ride.top.z) < 10 ? ride.top : null;
  if (station) _w.y = Math.min(_w.y, station.y + 2.8);
  // Shorten the orbit before nearby trunks, posts or other moving chairs can
  // cross the view. Anticipate the next half second of each chair's travel.
  for (let u = 0.3; u <= 1; u += 0.08) {
    _c.lerpVectors(_look, _w, u);
    const tree = forest.hit(_c.x, _c.z, 0.45);
    const wall = phys.obstacles.some(o => _c.y < o.top + 0.4 && boxGap(o, _c.x, _c.z) < 0.45);
    let chairNear = false;
    for (const other of system.chairs) {
      if (!L.waiting && other === chair) continue;
      const p = other.position;
      if (_c.y < p.y - 3.4 || _c.y > p.y + 0.6) continue;
      const dx = other.tangent.x * system.speed * 0.5, dz = other.tangent.z * system.speed * 0.5;
      const length2 = dx * dx + dz * dz;
      const k = length2 ? THREE.MathUtils.clamp(((_c.x - p.x) * dx + (_c.z - p.z) * dz) / length2, 0, 1) : 0;
      if (Math.hypot(_c.x - p.x - dx * k, _c.z - p.z - dz * k) < 2.1) { chairNear = true; break; }
    }
    if ((tree && _c.y < tree.top + 0.4) || wall || chairNear) { _w.lerpVectors(_look, _w, Math.max(0.22, u - 0.12)); break; }
  }
  camera.position.lerp(_w, 1 - Math.exp(-dt * (station ? 9 : 5)));
  camLook.lerp(_look, 1 - Math.exp(-dt * 8));
  camera.lookAt(camLook); camera.fov = 58 + portrait() * 12; camera.updateProjectionMatrix();
}
function unloadChair(ride, chair, system) {
  system.targetSpeed = 5;
  mouseLook.force = false;
  if (!mouseLook.on && mouseLook.locked) document.exitPointerLock();
  mouseLook.reset();
  startHop();
  rider.setLocomotion('ride');
  // Step outward from the uphill strand, clear of following chairs and the
  // terminal posts. The existing hop blends the rider onto the groomed snow.
  const x = chair.position.x + ride.dir.x * 2 - system.path.side.x * 3.5;
  const z = chair.position.z + ride.dir.z * 2 - system.path.side.z * 3.5;
  phys.reset(x, z, yawOf(ride.dir.x, ride.dir.z));
  camDir.copy(ride.dir);
  liftRide = null; state = 'ride';
  hud.prompt(''); hud.toast(`${ride.label} · ${Math.round(ride.top.y).toLocaleString()} m`, 2000);
  trail.gap(phys.pos); gps.reroute(gpsFrom());
}

// Step off at the top station onto the best open snow nearby, facing downhill.
function unload(ride) {
  if (liftRide?.gondolaSystem) {
    liftRide.gondolaSystem.passenger = null;
    liftRide.gondolaSystem.speed = liftRide.gondolaSystem.targetSpeed = 5;
  }
  restoreRide();
  const P = ride.top;
  const at = topSpot(ride);
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  camDir.set(at.dx, 0, at.dz);
  snapCamera();
  rider.root.visible = true;
  cabin.visible = false;
  liftRide = null;
  state = 'ride';
  hud.prompt('');
  hud.toast(`${ride.label} · ${Math.round(P.y).toLocaleString()} m`, 2000);
  gps.reroute(gpsFrom()); // stepped off at the top: on from here
}
function topSpot(ride) {
  const P = ride.top;
  const best = openSpot(P, [26, 36, 48], (x, z, n, R) => // within reach of a lift that starts here
    (piste.distAt(x, z) < PISTE_HALF_WIDTH ? 1 : 0) + Math.min(1 - n.y, 0.12) * 6 - R * 0.004);
  return best
    ? facing({ x: best.x, z: best.z, dx: best.nx, dz: best.nz }, ride.dir)
    : { x: P.x + ride.dir.x * 30, z: P.z + ride.dir.z * 30, dx: ride.dir.x, dz: ride.dir.z };
}

// Open snow: on the map, not in a deleted tile, clear of buildings and trees.
const blocked = (x, z) => phys.obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < Math.hypot(o.hw, o.hd) + 3);
const openGround = (x, z) => detail.inside(x, z, 60) && !detail.holeAt(x, z) && !blocked(x, z) && !forest.hit(x, z, 3);
// The best open snow on rings round P, ranked by score(x, z, groundNormal, R).
function openSpot(P, radii, score) {
  let best = null;
  for (const R of radii)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      if (!openGround(x, z)) continue;
      detail.normalAt(x, z, _n);
      const sc = score(x, z, _n, R);
      if (!best || sc > best.score) best = { x, z, score: sc, nx: _n.x, nz: _n.z };
    }
  return best;
}
// Makes a spot's heading a unit vector; on dead-flat ground, where there's no
// downhill to face, it takes `or` instead.
function facing(at, or) {
  const len = Math.hypot(at.dx, at.dz);
  if (len < 1e-4) { at.dx = or.x; at.dz = or.z; } else { at.dx /= len; at.dz /= len; }
  return at;
}

// ---------- Mantou ----------
// The resort's Old English Sheepdog lives up at the top, in the coffee cabin
// on the shoulder by the summit, and comes out to meet you (see src/dog/dog.js). It notices you, comes over, keeps you company and chases
// after you. E beside it pets it (the rider reaches down to it); Q throws a
// snowball for it, wherever you are, in the way the camera looks.
const dogHome = cabinRoom.home;
const dog = new Dog({ hf: detail, forest, obstacles: phys.obstacles, home: dogHome });
scene.add(dog.root, dog.spray.points, dog.ball.mesh);
dog.ready.catch((err) => console.warn('The dog failed to load; it stays out of the game.', err));
// You, as the dog sees you: there on the snow (or about to drop in), or nowhere.
const dogSees = { pos: phys.pos, vel: phys.vel, head: new THREE.Vector3(), facing: new THREE.Vector3(), crashed: false };
function forDog() {
  if (state !== 'ride' && state !== 'intro') return null;
  dogSees.head.copy(phys.pos).y += phys.crashed > 0 ? 0.4 : 1.45; // down on the snow after a fall
  // The way your chest faces: ahead on foot, the toe side on the board.
  if (rider.locomotion === 'walk') phys.forward(dogSees.facing);
  else dogSees.facing.set(1, 0, 0).applyQuaternion(rider.root.quaternion);
  dogSees.facing.setY(0).normalize();
  dogSees.crashed = phys.crashed > 0;
  return dogSees;
}
let petT = 0; // s left of the rider's reach down to the dog
let helloT = -1e9; // when it last came to say hello
function updateDog(dt) {
  // A snowball being thrown is in the hand until it's let go, and a rider on
  // foot turns to face where it's going.
  if (rider.throwT !== null) {
    dog.ball.hold(rider.hand(_hand));
    if (rider.locomotion === 'walk') {
      const err = THREE.MathUtils.euclideanModulo(yawOf(throwDir.x, throwDir.z) - phys.yaw + Math.PI, Math.PI * 2) - Math.PI;
      phys.yaw += err * (1 - Math.exp(-dt * 12));
    }
  }
  dog.update(dt, time, forDog(), camera);
  // Heard from where the camera is: a bark carries 60 m.
  const hear = (p) => 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(p), 4, 60);
  for (const ev of dog.events.splice(0)) {
    if (ev.type === 'hello') { if (time - helloT > 60) hud.toast(`${DOG.zh} · ${DOG.en}`, 2000); helloT = time; } // its name, once in a while
    else sound[ev.type]?.(hear(ev.at));
  }
  sound.setPant(dog.body ? dog.body.eased.pant * (1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(dog.pos), 2, 14)) : 0);
  // Petting, the rider's hand goes to the top of its head once it's sat down
  // by them (the pet lasts from then on).
  const petted = dog.state === 'petted' || dog.state === 'belly';
  const close = petted && dog.speed < 0.3 && phys.pos.distanceTo(dog.pos) < 1.4;
  if (!petted) petT = 0;
  else if (close) petT = Math.max(0, petT - dt);
  rider.reach = petT > 0 && close && state === 'ride' ? dog.headTop(_reach) : null;
  if (rider.reach) rider.reachLeft = false;
}
const _reach = new THREE.Vector3(), _hand = new THREE.Vector3();
function petDog() {
  dog.pet(forDog());
  petT = 2.2;
}
// ---------- The red foxes ----------
// A skulk of two or three by No. 6's bottom station in Jingquan Valley, an
// Easter egg (see src/fox/fox.js). They watch you from a safe way off, shy
// off if you come too near and bolt if you ski at them. The first time one
// gets a good look at you, it's found.
const den = foxDen(meta.lifts);
const foxes = den && new Foxes({ hf: detail, forest, obstacles: phys.obstacles, den });
if (foxes) {
  scene.add(foxes.root, foxes.spray.points);
  foxes.ready.catch((err) => console.warn('The foxes failed to load; they stay out of the game.', err));
}
function updateFoxes(dt) {
  if (!foxes) return;
  const who = forDog();
  if (who) who.turn = phys.yawRate;
  foxes.update(dt, time, who, camera);
  for (const ev of foxes.events.splice(0)) if (ev.type === 'found' && find(FOX.id)) hud.toast(`Found: ${FOX.zh} · ${FOX.en}`, 3000);
}

// ---------- The horse ----------
// An Altai horse, saddled and bridled, roams the ridge out past the ovoo (see
// src/horse/horse.js): it grazes, wanders and stands about. Come near and it
// looks up and walks over to you, stopping with its left side to you; E
// beside it gets on (the rider climbs up into the saddle). Riding, W asks for
// a faster gait (walk, trot, canter, gallop) and S a slower one, and it keeps
// the gait it's asked for; holding S pulls it up. A/D steer it, round on the
// spot when it's standing. E gets off: it pulls up and the rider climbs down
// on its left, on foot if they walked up, on the board if not. It stays where
// it was left.
const pasture = horsePasture(resort.summitFrame);
const horse = pasture && new Horse({ hf: detail, piste, forest, obstacles: phys.obstacles, lakes, home: pasture, rider });
if (horse) {
  scene.add(horse.root, horse.loose);
  horse.ready.catch((err) => console.warn('The horse failed to load; it stays out of the game.', err));
}
let horseHelloT = -1e9; // when it last came over: its name, once in a while
// Its hooves and breath heard from where the camera is, out to 50 m.
const heard = (p) => 1 - THREE.MathUtils.smoothstep(camera.position.distanceTo(p), 4, 50);
function horseEvent(ev) {
  if (ev.type === 'hoof') sound.hoof(heard(ev.at) * ev.level, ev.powder);
  if (ev.type === 'breath') sound.breath(heard(ev.at) * ev.level, ev.out);
  if (ev.type === 'hello' && time - horseHelloT > 60) { hud.toast(`${HORSE.zh} · ${HORSE.en}`, 2000); horseHelloT = time; }
  if (ev.type === 'mounting') startHop(); // from where they stood to beside it
  if (ev.type === 'seated') {
    horseT = 0;
    hud.toast(touch.on ? 'Stick up: faster · down: slower' : 'W faster · S slower', 2200);
  }
  if (ev.type === 'dismounted') leaveHorse();
}
// Roaming, with you about on the snow (or nowhere).
function updateHorse(dt) {
  if (!horse) return;
  horse.update(dt, time, forDog(), camera);
  for (const ev of horse.events.splice(0)) horseEvent(ev);
}
function mountHorse() {
  walkAfter = rider.locomotion === 'walk';
  state = 'horse';
  phys.vel.set(0, 0, 0);
  phys.yawRate = phys.jumpCharge = phys.slip = 0;
  trail.gap(phys.pos);
  reins.up = reins.down = true; // a key still down from before doesn't count
  reins.held = 0;
  horse.beginMount(phys.pos);
  hud.prompt('');
}
function getOffHorse() {
  if (horse.state === 'ridden') horse.dismount();
}
// Round to where you get on, on foot (off the board, if you rode up), along
// its left side or round its front or back; then up. A rider who can't walk
// gets straight on.
const _way = new THREE.Vector3();
function walkRound(dt) {
  if (rider.locomotion !== 'walk' && !rider.setLocomotion('walk')) { horse.mountNow(); return; }
  acc += dt;
  for (; acc >= STEP; acc -= STEP) {
    const way = horse.wayRound(phys.pos, _way);
    if (!way) { horse.mountNow(); acc = 0; return; }
    const err = THREE.MathUtils.euclideanModulo(yawOf(way.x - phys.pos.x, way.z - phys.pos.z) - phys.yaw + Math.PI, Math.PI * 2) - Math.PI;
    phys.yaw += THREE.MathUtils.clamp(err, -6 * STEP, 6 * STEP);
    phys.stepWalk(STEP, { walk: Math.abs(err) < 1.2, run: false, steer: 0, brake: false });
  }
}
// Down beside it: back on the snow, facing it.
function leaveHorse() {
  const at = rider.locomotion === 'walk' ? _c.copy(rider.root.position) : horse.standSpot(_c);
  state = 'ride';
  phys.reset(at.x, at.z, yawOf(horse.pos.x - at.x, horse.pos.z - at.z));
  rider.setLocomotion(walkAfter ? 'walk' : 'ride');
  poseRider(0, true);
  hud.prompt('');
  trail.gap(phys.pos);
}
// Riding: W and S (or the stick, up and down) ask for a gait faster or
// slower, each press; S held pulls it up. A/D steer.
const reins = { up: false, down: false, held: 0 };
function rein(dt) {
  if (horse.state !== 'ridden') {
    reins.up = input.tuck;
    reins.down = input.brake;
    horse.reins.steer = 0;
    horse.reins.brake = false;
    return;
  }
  const was = horse.gear;
  if (input.tuck && !reins.up) horse.shift(1);
  if (input.brake && !reins.down) horse.shift(-1);
  reins.up = input.tuck;
  reins.down = input.brake;
  reins.held = input.brake ? reins.held + dt : 0;
  if (reins.held > 0.35) horse.gear = 0;
  horse.reins.brake = reins.held > 0.35;
  horse.reins.steer = input.steer;
  if (horse.gear !== was) hud.toast(PACES[horse.gear].name.replace(/^./, (c) => c.toUpperCase()), 900);
}
let horseT = 0; // s in the saddle, for the touch screen's hint
function rideHorse(dt) {
  horseT += dt;
  rein(dt);
  horse.update(dt, time, null, camera);
  for (const ev of horse.events.splice(0)) horseEvent(ev);
  if (state !== 'horse') return; // got off
  // On it (getting on, riding, getting off), the rider goes with the saddle;
  // before that, they walk round to its left side.
  if (horse.carrying && rider.locomotion === 'sit') {
    horse.seat(dt, rider);
    if (hop) hopping(dt);
  } else {
    if (horse.state === 'present') walkRound(dt);
    poseRider(dt);
    for (const ev of horse.events.splice(0)) horseEvent(ev);
  }
  if (horse.carrying) {
    phys.pos.copy(horse.pos);
    phys.vel.copy(horse.vel); // the HUD shows its speed over the ground
    phys.yaw = yawOf(Math.sin(horse.yaw), Math.cos(horse.yaw));
  }
  updateHorseCamera(dt);
  const riding = horse.state === 'ridden';
  hud.prompt(riding ? '<kbd>W</kbd> faster · <kbd>S</kbd> slower, hold to stop · <kbd>A</kbd><kbd>D</kbd> steer · <kbd>E</kbd> get off' : '',
    riding && horseT < 6 ? 'Stick up: faster · down: slower, hold to stop' : '');
}
// The camera on horseback: behind and above, looking at the rider's head and
// on ahead, pulling back and widening as it speeds up. Standing, it hangs off
// to the horse's left, the side you get on and off, and swings in behind as
// it gets going.
const HORSE_CAM = { back: 6.5, up: 3, ahead: 2.5, look: 2.3, side: -0.45 };
function horseCameraTarget(out, look) {
  const sp = Math.min(horse.speed, 12), p = portrait(), far = 1 + p * 0.5, c = HORSE_CAM;
  _cd.copy(camDir).applyAxisAngle(Y_AXIS, c.side * (1 - THREE.MathUtils.smoothstep(sp, 1, 5)));
  out.copy(horse.pos).addScaledVector(_cd, -(c.back * far + sp * 0.18));
  out.y += c.up * far + sp * 0.05;
  look.copy(horse.pos).addScaledVector(camDir, c.ahead * (1 + p * 0.6));
  look.y += c.look;
  if (mouseLook.yaw || mouseLook.pitch) {
    _pv.copy(horse.pos).y += c.look;
    swing(out, _pv, camDir, mouseLook.yaw, mouseLook.pitch);
    swing(look, _pv, camDir, mouseLook.yaw, mouseLook.pitch);
  }
  out.y = Math.max(out.y, detail.heightAt(out.x, out.z) + 1.5);
}
function updateHorseCamera(dt) {
  camDir.lerp(_v.set(Math.sin(horse.yaw), 0, Math.cos(horse.yaw)), 1 - Math.exp(-dt * 2.5)).normalize();
  _pv.copy(horse.pos).y += HORSE_CAM.look;
  swingCamera(_pv);
  horseCameraTarget(_w, _look);
  camera.position.lerp(_w, 1 - Math.exp(-dt * 5));
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 1.2);
  camLook.lerp(_look, 1 - Math.exp(-dt * 10));
  camera.lookAt(camLook);
  camera.fov = 60 + portrait() * 15 + Math.min(horse.speed, 12) * 0.6;
  camera.updateProjectionMatrix();
}

// ---------- NPCs ----------
// The cast (npc/cast.js), each sat in the room of their landmark: walking in
// (on foot or on the board), they look up at you and start talking. Leaving
// cuts them off; coming back in starts them again.
const dialogue = new Dialogue(document.getElementById('hud'));
const npcs = (koktokay ? [] : CAST).map((spec) => {
  const room = rooms.get(spec.home), { seat } = room;
  const npc = new Npc(spec, { cushion: seat.cushion });
  npc.root.position.set(seat.x, seat.y, seat.z);
  npc.root.rotation.y = seat.yaw;
  scene.add(npc.root);
  npc.ready.catch((err) => console.warn(`${spec.name} failed to load; they stay out of the game.`, err));
  return { npc, spec, room, in: false };
});
let talking = null; // the one talking
const _eyes = new THREE.Vector3();
function updateNpcs(dt) {
  dialogue.update(dt);
  const here = state === 'ride' || state === 'intro';
  _eyes.copy(phys.pos).y += rider.locomotion === 'walk' ? 1.6 : 1.4;
  for (const n of npcs) {
    const inside = here && n.room.inside(phys.pos.x, phys.pos.z);
    if (inside && !n.in && !talking && state === 'ride') {
      talking = n;
      dialogue.say(n.spec.name, n.spec.lines, () => { talking = null; });
    }
    if (!inside && talking === n) dialogue.close();
    n.in = inside;
    n.npc.update(dt, here ? _eyes : null);
  }
}

// ---------- The prayer wheels ----------
// Three racks of seven on the path from 6号's top out to the ovoo (see
// world/prayer-wheels.js). Walking past them on foot, the hand on their side
// reaches out and brushes each wheel it passes, setting it turning as fast as
// you go by; standing beside one, E gives it a push, the hand sweeping across
// its face the way it turns. While they turn, the mantra is heard.
const wheels = new PrayerWheels((koktokay ? [] : SUMMIT.objects).filter((o) => o.kind === 'prayerWheels').map((o) => summit.byId.get(o.id)));
const TURN = 0.9; // s a push with E takes
let turnT = 0, turning = null, pushed = false; // the push: s left of it, the wheel, and whether it's been given
let wheelsT = -1e9; // when they were last named
const _face = new THREE.Vector3(), _palm = new THREE.Vector3();
function turnWheel(near) {
  turning = near.wheel;
  turnT = TURN;
  pushed = false;
}
function updateWheels(dt) {
  turnT = Math.max(0, turnT - dt);
  const afoot = state === 'ride' && rider.locomotion === 'walk' && phys.grounded && phys.crashed <= 0 && rider.throwT === null;
  const near = afoot && !rider.reach ? wheels.near(phys.pos, phys.forward(_face)) : null;
  if (near && time - wheelsT > 60) hud.toast('转经轮 · Prayer wheels', 2000);
  if (near) wheelsT = time;
  if (!near || near.wheel.mesh.parent !== turning?.mesh.parent) turnT = 0; // walked off from the one being pushed
  if (near) {
    const yaw = near.rack.root.rotation.y;
    const pace = phys.vel.x * Math.cos(yaw) - phys.vel.z * Math.sin(yaw); // m/s along the rack
    let x = null, wheel = null;
    if (turnT > 0) {
      // Across its face the way it turns, clockwise from above: toward -x on
      // the rack's front, +x on its back.
      x = turning.x - near.side * 0.15 * (1 - (2 * turnT) / TURN);
      wheel = turning;
    } else if (Math.abs(pace) > 0.4) {
      x = near.along + Math.sign(pace) * 0.2; // a little ahead of you
      wheel = wheels.wheelAt(near, x);
    }
    if (wheel) {
      rider.reach = wheels.handAt(near, x, _palm);
      rider.reachLeft = near.left;
      // Once the hand's there: a brush turns it as fast as its face goes by
      // the hand; a push, one good shove.
      if (rider.reachW > 0.6 && turnT > 0 && !pushed) { wheels.push(wheel, { add: 6 }); pushed = true; }
      else if (rider.reachW > 0.6 && turnT <= 0) wheels.push(wheel, { rate: Math.abs(pace) / wheel.r });
    }
  }
  sound.setMantra(wheels.update(dt, phys.pos));
}

// A snowball, thrown overarm the way the camera looks (see throw.js): it
// leaves the hand at the selected animation’s release time; the dog is off at the wind-up.
const throwDir = new THREE.Vector3();
const _throw = new THREE.Vector3();
function throwSnowball() {
  if (!phys.grounded || phys.crashed > 0 || dog.ball.busy || rider.throwT !== null) return;
  if (mouseLook.on) camera.getWorldDirection(throwDir); // where you're looking
  else throwDir.copy(camDir);
  throwDir.setY(0).normalize();
  if (!rider.startThrow()) return;
  _throw.copy(phys.pos).addScaledVector(throwDir, 0.3).y += 1.5; // about where it'll leave the hand
  dog.throwBall(_throw, throwDir, rider.throwRelease);
}

// ---------- Driving ----------
// E beside a vehicle gets in: into the pickup's cab, out of sight, onto the
// snowmobile's seat or into the Jetson's, and the camera swings round behind
// it. W drives, S brakes and then reverses, A/D steer, Space is the handbrake,
// R takes it back to its spot by the hall. E gets out at the driver's door (or the nearest clear
// side), on foot if you walked up, and the vehicle stays where you left it.
// In the Jetson ONE you sit in its seat: Space lifts off and climbs, Shift comes
// down and lands, W/S fly forward and back and A/D turn; you get out once it's
// down, or hovering just above the snow.
// In the rowing boat W rows, S backs water, A/D turn and Space holds the oars
// in the water to stop (see vehicle/rowing.js); you step out once you're at the
// shore, and the boat stays there, rocking.
// While you drive, `phys` follows the vehicle, so the HUD, the GPS, the maps
// and the diorama's "You" pin all see you where it is.
let walkAfter = false; // walked up to it, so walk away from it
function getIn(v) {
  walkAfter = rider.locomotion === 'walk';
  restoreRide();
  car = v;
  state = 'drive';
  if (v.model.saddle) {
    startHop();
    rider.setLocomotion('sit', v.model.seat);
  } else rider.root.visible = false;
  // Stepping into the boat rocks it toward the side you came from.
  v.phys.nudge?.(Math.sign(_w.subVectors(phys.pos, v.phys.pos).dot(v.phys.left(_x))) || 1);
  hud.parked = parked(); // you're the arrow now
  trail.gap(phys.pos);
  for (const t of v.tracks) t.gap(v.phys.pos);
  acc = 0;
  driveT = 0;
  hud.prompt(...carHint(v));
  hud.toast(v.title, 1600);
}
// The hint while you drive or fly, for the keys and for a touch screen, where
// the buttons say what they do and it shows only for the first few seconds.
let driveT = 0;
function carHint(v) {
  const [keys, touchHint] = v.flies && v.phys.landed ? [v.hintLanded, v.touch.hintLanded] : [v.hint, v.touch.hint];
  return [keys, driveT < 6 ? touchHint : ''];
}
// False if there's nowhere to step out: no dry land beside the boat, or under the Jetson.
function getOut() {
  const at = exitSpot();
  if (!at) return false;
  car.phys.land?.(); // hovering just above the snow, it sets down first
  const drive = car.phys;
  drive.nudge?.(Math.sign(_w.set(at.x - drive.pos.x, 0, at.z - drive.pos.z).dot(drive.left(_x))) || 1);
  if (car.floats) drive.vel.multiplyScalar(0.3); // pushed off a little as you step out
  else drive.vel.set(0, 0, 0);
  drive.yawRate = drive.accel = drive.lateral = 0;
  state = 'ride';
  phys.reset(at.x, at.z, drive.yaw);
  if (car.model.saddle) startHop();
  rider.setLocomotion(walkAfter ? 'walk' : 'ride');
  rider.root.visible = true;
  poseRider(0, true);
  car = null;
  hud.parked = parked();
  hud.prompt('');
  trail.gap(phys.pos);
  return true;
}
// The first of the vehicle's exits that's clear: the driver's side first. Never
// into a lake: none if they're all wet.
function exitSpot() {
  const drive = car.phys, f = drive.forward(_f), l = drive.left(_x);
  const spots = car.model.exits.map(({ along, left }) => ({ x: drive.pos.x + f.x * along + l.x * left, z: drive.pos.z + f.z * along + l.z * left }));
  const dry = ({ x, z }) => !(shoreAt(lakes, x, z, 1)?.d < 0.3);
  return spots.find((p) => dry(p) && detail.inside(p.x, p.z, 60) && !detail.holeAt(p.x, p.z) && !forest.hit(p.x, p.z, 0.6)
    && phys.obstacles.every((o) => boxGap(o, p.x, p.z) > 0.6)) ?? spots.find(dry) ?? null;
}
function followCar() {
  phys.pos.copy(car.phys.pos);
  phys.vel.set(car.phys.vel.x, 0, car.phys.vel.z); // the HUD shows the speed over the ground
  phys.yaw = car.phys.yaw;
}
// Back to its spot by the hall, with you still at the wheel.
function carHome() {
  const { park } = car;
  car.phys.reset(park.x, park.z, yawOf(park.dx, park.dz));
  car.model.update(0, car.phys);
  followCar();
  for (const t of car.tracks) t.gap(car.phys.pos);
  camDir.set(park.dx, 0, park.dz);
  driveCameraTarget(camera.position, camLook);
  camera.lookAt(camLook);
  hud.toast(car.hall?.zh ?? car.home, 2000);
}
// On the snowmobile or in the Jetson: the rider's root follows its saddle, and
// they lean into the turn and a little toward the steering (see Rider's seated
// pose).
const _hs = new THREE.Vector3();
function poseSeated(dt) {
  const { saddle } = car.model;
  saddle.updateWorldMatrix(true, false);
  saddle.matrixWorld.decompose(rider.root.position, rider.root.quaternion, _hs);
  if (hop) hopping(dt);
  rider.update(dt, {
    crouch: 0, air: false, speed: car.phys.speed,
    lean: THREE.MathUtils.clamp(car.phys.lateral * (car.lean ?? 0.04), -0.45, 0.45),
    twist: car.phys.steer / (car.handling.steer ?? 1),
  });
}
// Getting on or off the snowmobile (or into or out of the Jetson), the rider
// slides from where they were to where they're going, while their pose blends
// from standing to sitting (or back).
const HOP = 0.35;
let hop = null;
const _hq = new THREE.Quaternion();
function startHop() {
  hop = { t: 0, pos: rider.root.position.clone(), quat: rider.root.quaternion.clone() };
}
function hopping(dt) {
  hop.t += dt;
  const k = THREE.MathUtils.smootherstep(hop.t, 0, HOP);
  rider.root.position.lerpVectors(hop.pos, rider.root.position, k);
  rider.root.quaternion.slerpQuaternions(hop.quat, _hq.copy(rider.root.quaternion), k);
  if (hop.t >= HOP) hop = null;
}
// Chase camera: behind and above, pulling back with speed; it stays behind the
// tail when you reverse. The Jetson's hangs off to its left at a hover, where
// you see the pilot past the seat back, and swings in behind as it speeds up.
const Y_AXIS = new THREE.Vector3(0, 1, 0), _cd = new THREE.Vector3();
function driveCameraTarget(out, look) {
  const drive = car.phys, { cam } = car;
  const sp = Math.min(drive.speed, 30), p = portrait(), far = 1 + p * 0.5;
  _cd.copy(camDir);
  if (cam.side) _cd.applyAxisAngle(Y_AXIS, cam.side * (1 - THREE.MathUtils.smoothstep(sp, 4, 20)));
  out.copy(drive.pos).addScaledVector(_cd, -(cam.back * far + sp * 0.08));
  out.y += cam.up * far + sp * 0.02;
  out.y = Math.max(out.y, detail.heightAt(out.x, out.z) + 1.5);
  look.copy(drive.pos).addScaledVector(camDir, cam.ahead * (1 + p * 0.6));
  look.y += cam.look;
  if (mouseLook.yaw || mouseLook.pitch) {
    _pv.copy(drive.pos).y += cam.look;
    swing(out, _pv, camDir, mouseLook.yaw, mouseLook.pitch);
    swing(look, _pv, camDir, mouseLook.yaw, mouseLook.pitch);
    out.y = Math.max(out.y, detail.heightAt(out.x, out.z) + 1.5);
  }
}
function updateDriveCamera(dt) {
  const drive = car.phys;
  camDir.lerp(drive.forward(_v), 1 - Math.exp(-dt * 3)).normalize();
  _pv.copy(drive.pos).y += car.cam.look;
  swingCamera(_pv);
  driveCameraTarget(_w, _look);
  const follow = car.cam.follow ?? 6;
  camera.position.lerp(_w, 1 - Math.exp(-dt * follow));
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 1.2);
  camLook.lerp(_look, 1 - Math.exp(-dt * Math.max(10, follow)));
  camera.lookAt(camLook);
  camera.fov = 60 + portrait() * 15 + Math.min(drive.speed, 30) * 0.35;
  camera.updateProjectionMatrix();
}
// Rowing: rings where the blades dip in and come out, and a line of them
// spreading behind the stern as the boat goes. `splash` is for the sound.
let splash = 0, wakeRun = 0;
const _bl = new THREE.Vector3();
function dipOars(ev) {
  const level = car.lake.level;
  ev.oars.forEach((on, i) => {
    if (!on) return;
    car.model.bladeAt(i, _bl);
    ripples.emit(_bl.x, level, _bl.z, 0.12, ev.type === 'catch' ? 1.3 : 0.9, 1.7, 0.75);
  });
  if (ev.type === 'catch') splash = 0.4;
}
function leaveWake(dt) {
  const drive = car.phys, sp = drive.speed;
  wakeRun += sp * dt;
  if (wakeRun < 0.8 || sp < 0.25) return;
  wakeRun = 0;
  const f = drive.forward(_f), back = car.model.dims.halfLength;
  ripples.emit(drive.pos.x - f.x * back, car.lake.level, drive.pos.z - f.z * back, 0.4, 1.4 + sp * 0.8, 2.6, Math.min(0.45, sp * 0.25));
}
function layTracks() {
  const drive = car.phys, f = drive.forward(_f), l = drive.left(_x);
  car.model.marks.forEach(({ along, left, width }, i) => {
    _sv.set(drive.pos.x + f.x * along + l.x * left, 0, drive.pos.z + f.z * along + l.z * left);
    _sv.y = detail.heightAt(_sv.x, _sv.z);
    car.tracks[i].add(_sv, l, width);
  });
}
// How far (x, z) is outside a rotated box { x, z, yaw, hw, hd }; 0 inside it.
function boxGap(o, x, z) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw), dx = x - o.x, dz = z - o.z;
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - o.hw), Math.max(0, Math.abs(dx * s + dz * c) - o.hd));
}

// ---------- Soaking ----------
// E beside the hot spring's rocks gets you in: you slide down into the water
// and sit back against the rocks across from the spout, shoulders just out of
// it, arms resting on the surface, swaying a little. A and D (or the stick) turn
// the camera round the pool; E gets you out at the gap in the rocks, on foot if
// you walked up. Seated, the rider takes `SOAK` as its seat (see
// Rider.setLocomotion): hips on the pool floor, legs out along it.
const SOAK = {
  hips: new THREE.Vector3(),
  feet: [new THREE.Vector3(0.17, 0, 0.6), new THREE.Vector3(-0.17, 0, 0.6)],
  grips: [new THREE.Vector3(), new THREE.Vector3()],
  kneeOut: 0.3,
};
let soakWalk = false, soakLook = 0; // walked up to it; the camera's turn round the pool, 0 right behind you
let soakSide = 0; // the camera's swing out to the side while getting in, 0–1
// In the water a rider wears their swimsuit, if they have one (the `swim`
// outfit, see RIDER_MODELS): getting in, and again getting out, a puff of
// steam goes up round them and they change inside it. If it hasn't loaded yet
// they change when it has; if it won't, they soak as they are.
const SOAK_OUTFIT = 'swim';
let changing = 0, change = null; // the latest change asked for; the one waiting for its puff to thicken
function changeInto(outfit) {
  const asked = ++changing;
  change = null;
  void rider.loadOutfit(outfit).then((ready) => {
    if (!ready || asked !== changing) return;
    onsen.puff(rider.root.position);
    change = { outfit, at: time + PUFF_COVER };
  });
}
function soak() {
  soakWalk = rider.locomotion === 'walk';
  trail.gap(phys.pos);
  state = 'soak';
  startHop();
  const suit = rider.outfitModel(SOAK_OUTFIT);
  if (onsen.way && suit && GET_IN_CLIPS.every((role) => suit.clips[role])) startGettingIn(suit);
  else rider.setLocomotion('sit', SOAK);
  changeInto(SOAK_OUTFIT);
  const { seat } = onsen;
  phys.reset(seat.x, seat.z, yawOf(seat.dx, seat.dz));
  soakLook = 0.35;
  hud.prompt('<kbd>A</kbd><kbd>D</kbd> look around · <kbd>E</kbd> get out', 'The stick looks around');
  hud.toast(`${ONSEN.zh} · ${ONSEN.en}`, 2000);
}
function leavePool() {
  const at = onsen.exit;
  state = 'ride';
  goingIn = null;
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  startHop();
  rider.setLocomotion(soakWalk ? 'walk' : 'ride');
  changeInto(null);
  poseRider(0, true);
  camDir.set(at.dx, 0, at.dz);
  hud.prompt('');
  trail.gap(phys.pos);
}
// Seated, the root goes this high: shoulders just out of the water.
function soakRootY() {
  const b = rider.build;
  return onsen.waterY - (b.seat + b.pivot + b.shoulder[1]) + 0.04;
}
function poseSoak(dt) {
  const b = rider.build, { seat } = onsen;
  const shoulder = b.seat + b.pivot + b.shoulder[1]; // above the pool floor
  // Hands out to the sides, just under the surface.
  SOAK.grips[0].set(b.shoulder[0] + 0.28, shoulder - 0.1, 0.12);
  SOAK.grips[1].set(-b.shoulder[0] - 0.28, shoulder - 0.1, 0.12);
  rider.root.position.set(seat.x, soakRootY(), seat.z);
  rider.root.quaternion.setFromAxisAngle(Y_AXIS, yawOf(seat.dx, seat.dz));
  if (hop) hopping(dt);
  rider.update(dt, { crouch: 0, air: false, speed: 0, lean: Math.sin(time * 0.5) * 0.04, twist: Math.sin(time * 0.23) * 0.6 });
}

// Getting in, for a rider whose swimsuit comes with clips for it (`clips` on
// the outfit in RIDER_MODELS): she changes in a puff of steam on the snow by
// the gap, steps up onto the flat stone across it and down into the water
// (`ledge`), wades over to her seat (`wade`), turns round to face the spout,
// then stretches and sits down in the water (`sitDown`), and soaks as anyone
// does. The clips were made in place on flat ground, so the root carries her
// along, and lifts or lowers her by however much the real steps differ from
// the clip's. Riders without them slide straight into their seat.
const GET_IN_CLIPS = ['ledge', 'wade', 'sitDown'];
const GET_IN = {
  change: 0.7, // s standing in the puff
  wade: 0.85, // m/s through the water
  stride: 1.4, // m/s the walk clip is made for
  turn: 1.1, // s turning round at the seat
  sink: [1.2, 2.4], // s into sitDown: she sinks to her shoulders as she squats
};
let goingIn = null;
function startGettingIn(suit) {
  const { ledge, wade, sitDown } = suit.clips;
  const { way, seat } = onsen;
  // Where the clip's step up tops out, and how high it ends.
  let top = 0, rTop = 0;
  for (let t = 0; t <= ledge.duration; t += 1 / 30) {
    const r = suit.rise(ledge, t);
    if (r > rTop) { rTop = r; top = t; }
  }
  const rEnd = suit.rise(ledge, ledge.duration);
  const wadeAt = GET_IN.change + ledge.duration;
  goingIn = {
    suit, ledge, wade, sitDown, top, rTop, rEnd,
    // The root's height sat down, shoulders just out of the water as when
    // soaking (the clip sits lower than the seated pose does).
    sunk: onsen.waterY + 0.04 - suit.heightIn(sitDown, sitDown.duration, 'LeftArm'),
    t: 0,
    walked: 0, // the wade clip's time so far
    wadeAt, // s, from the foot of the stone over to the seat
    wadeEnd: wadeAt + Math.hypot(seat.x - way.water.x, seat.z - way.water.z) / GET_IN.wade,
    // The root's height wading (from where the ledge clip leaves it), and the
    // pool floor it eases onto, as the walk clip fades in.
    y: way.water.y - rEnd,
    floor: way.water.y,
    dx: way.dx, dz: way.dz, // the way she's facing
    wet: false, // she's in the water
  };
  rider.play(ledge, 0);
}
function gettingIn(dt) {
  const g = goingIn, { way, seat } = onsen, MU = THREE.MathUtils;
  g.t += dt;
  const at = rider.root.position;
  let t = g.t - GET_IN.change;
  if (t < 0) {
    // Changing on the snow, the ledge clip's first frame.
    at.copy(way.shore);
    rider.play(g.ledge, 0);
  } else if (t < g.ledge.duration) {
    // Up onto the stone, as far as the clip's foot goes forward (and as high
    // as the stone really is), then down off its far side onto the pool floor.
    const r = g.suit.rise(g.ledge, t);
    if (t <= g.top) {
      const k = MU.clamp(r / g.rTop, 0, 1);
      at.lerpVectors(way.shore, way.stone, k);
      at.y = way.shore.y + k * (way.stone.y - way.shore.y - g.rTop);
    } else {
      const k = MU.clamp((g.rTop - r) / (g.rTop - g.rEnd), 0, 1);
      at.lerpVectors(way.stone, way.water, MU.smoothstep(k, 0, 0.45)); // off the stone before the first step down
      at.y = MU.lerp(way.stone.y - g.rTop, way.water.y - g.rEnd, k);
      g.wet ||= k > 0.3;
    }
    rider.play(g.ledge, t);
  } else if (g.t < g.wadeEnd + GET_IN.turn) {
    // Wading over to the seat, turning toward it as she goes; then round to
    // face the spout, feet shuffling.
    const s = MU.smootherstep(g.t, g.wadeAt, g.wadeEnd);
    const x = MU.lerp(way.water.x, seat.x, s), z = MU.lerp(way.water.z, seat.z, s);
    const step = Math.hypot(x - at.x, z - at.z);
    const turning = g.t > g.wadeEnd;
    g.walked += turning ? dt * 0.35 : step / GET_IN.stride;
    const floor = onsen.floorAt(x, z);
    if (floor !== null && floor < onsen.waterY - 0.1) g.floor = floor; // not up onto a rock showing through
    g.y += (g.floor - g.y) * (1 - Math.exp(-dt * 8));
    at.set(x, g.y, z);
    const yaw = Math.atan2(g.dx, g.dz);
    const goal = turning ? Math.atan2(seat.dx, seat.dz) : Math.atan2(seat.x - way.water.x, seat.z - way.water.z);
    const turned = MU.euclideanModulo(goal - yaw + Math.PI, Math.PI * 2) - Math.PI;
    const a = yaw + turned * (1 - Math.exp(-dt * (turning ? 5 : 3)));
    g.dx = Math.sin(a);
    g.dz = Math.cos(a);
    rider.play(g.wade, g.walked % g.wade.duration);
  } else {
    // Sitting down where she stands, sinking to her shoulders as she goes.
    t = g.t - g.wadeEnd - GET_IN.turn;
    g.dx = seat.dx;
    g.dz = seat.dz;
    at.set(seat.x, MU.lerp(g.y, g.sunk, MU.smoothstep(t, ...GET_IN.sink)), seat.z);
    if (t >= g.sitDown.duration) return settle();
    rider.play(g.sitDown, t);
  }
  rider.root.quaternion.setFromAxisAngle(Y_AXIS, yawOf(g.dx, g.dz));
  if (hop) hopping(dt);
  rider.update(dt, { crouch: 0, air: false, speed: 0, lean: 0, twist: 0 });
}
// Seated, from here on as any rider soaks, the root sliding from the clip's
// height to the seated pose's.
function settle() {
  goingIn = null;
  startHop();
  rider.setLocomotion('sit', SOAK);
  poseSoak(0);
}

function updateSoakCamera(dt) {
  const { seat } = onsen, p = portrait();
  soakLook += input.steer * dt * 1.1 + mouseLook.take().yaw;
  // Getting in, after her as she goes, from off to her side (to see her steps)
  // and further back; swinging round behind her seat once she's sat down.
  const g = goingIn, at = g ? rider.root.position : seat;
  const dx = g ? g.dx : seat.dx, dz = g ? g.dz : seat.dz;
  const y = g ? Math.max(onsen.waterY, at.y + 0.4) : onsen.waterY;
  soakSide += ((g ? 1 : 0) - soakSide) * (1 - Math.exp(-dt * 1.5));
  _v.set(-dx, 0, -dz).applyAxisAngle(Y_AXIS, soakLook + soakSide * 1.1);
  // Close behind and above, clear of the rocks at your back.
  _w.set(at.x, y + 1.9 + p, at.z).addScaledVector(_v, 2.3 + p * 1.5 + soakSide * 0.7);
  _look.set(at.x + dx * 1.4, y + 0.45 + soakSide * 0.25, at.z + dz * 1.4);
  camera.position.lerp(_w, 1 - Math.exp(-dt * 3));
  camLook.lerp(_look, 1 - Math.exp(-dt * 4));
  camera.lookAt(camLook);
  camera.fov = 55 + p * 15;
  camera.updateProjectionMatrix();
}

// ---------- Destinations ----------
// The diorama sends you here with ?at=<key> (see destinations.js): to the top
// of a run, beside a lift station, or outside a service centre. It becomes your
// spawn, where R takes you back to, and the menu's way back to the diorama
// opens on it. Returns the spawn, or null if the key names nothing here.
const HINT = '<kbd>A</kbd><kbd>D</kbd> carve · <kbd>W</kbd> tuck or push · <kbd>R</kbd> back here';
const TOUCH_HINT = 'drag low on the left to carve · push up to tuck';
function resolveDestination(dest) {
  const key = destinationKey(dest);
  if (dest.kind === 'run') {
    const top = runTop(detail, meta.runs, dest.id);
    if (!top) return null;
    // A few metres down from the top, past any lift station there and any
    // rise the smoothed terrain leaves at the very top, so you set off downhill.
    const rises = (a) => detail.heightAt(a.x + a.dx * 15, a.z + a.dz * 15) > detail.heightAt(a.x, a.z) - 0.3;
    let d = 14, at = along(top.points, d);
    while (d < 120 && (!openGround(at.x, at.z) || rises(at))) at = along(top.points, (d += 6));
    return { key, x: at.x, z: at.z, dx: at.dx, dz: at.dz, toast: 'Drop in!',
      hint: `<b>${top.run.name || 'Unnamed run'}</b> · ${HINT}`, touchHint: `<b>${top.run.name || 'Unnamed run'}</b> · ${TOUCH_HINT}` };
  }
  if (dest.kind === 'lodge') {
    const c = SERVICE_CENTRES.find((sc) => sc.id === dest.id);
    if (!c) return null;
    // Out the front, on level ground, facing its gondola's bottom station.
    const fx = c.faceTo[0] - c.x, fz = c.faceTo[1] - c.z, fl = Math.hypot(fx, fz);
    const at = openSpot(c, [80, 95, 110, 130], (x, z, n, R) => (((x - c.x) * fx + (z - c.z) * fz) / (R * fl)) * 2 - (1 - n.y) * 8 - R * 0.01);
    if (!at) return null;
    return facing({ key, x: at.x, z: at.z, dx: c.faceTo[0] - at.x, dz: c.faceTo[1] - at.z, toast: c.zh, hint: HINT, touchHint: TOUCH_HINT }, camDir);
  }
  const lift = meta.lifts.find((l) => String(l.id) === dest.id);
  if (!lift) return null;
  // Magic carpets aren't rides; their ends still make places to start from.
  const ride = rides.find((r) => String(r.id) === dest.id) ?? liftEnds(lift);
  const { zh } = liftTitle(lift);
  if (dest.end === 'top') {
    return { key, ...topSpot(ride), toast: `${zh} · ${Math.round(ride.top.y).toLocaleString()} m`, hint: HINT, touchHint: TOUCH_HINT };
  }
  // Beside the bottom station on the side you'd queue from, facing it, near
  // enough to board (16–18 m out from its middle is within BOARD_REACH).
  const P = ride.bottom;
  const at = openSpot(P, [16, 18, 22, 30], (x, z, n, R) =>
    -(((x - P.x) * ride.dir.x + (z - P.z) * ride.dir.z) / R) * 0.5 - (1 - n.y) * 6 - R * 0.01);
  if (!at) return null;
  return facing({
    key, x: at.x, z: at.z, dx: P.x - at.x, dz: P.z - at.z,
    toast: `${zh} · ${Math.round(P.y).toLocaleString()} m`, hint: HINT, touchHint: TOUCH_HINT,
    board: dest.end === 'ride' && ride.cable ? ride : null,
  }, ride.dir);
}
function liftEnds(lift) {
  const [a, b] = [lift.points[0], lift.points[lift.points.length - 1]].map(([x, z]) => new THREE.Vector3(x, detail.heightAt(x, z), z));
  const [bottom, top] = a.y <= b.y ? [a, b] : [b, a];
  return { bottom, top, dir: new THREE.Vector3(top.x - bottom.x, 0, top.z - bottom.z).normalize() };
}

// ---------- Arrival ----------
// From the diorama the page opens inside the cloud the diorama dived into. The
// camera drops out of it, from high over the spot to just behind the rider,
// and you're off (or, for "Board and ride up", straight onto the lift).
// Space, Enter or Escape skips the drop. `dest` becomes your spawn; coming back
// to where you left off, you drop at `at` instead.
let arrival = null;
function arrive(dest, at = dest) {
  restoreRide();
  spawn = dest;
  linkDiorama();
  state = 'arrive';
  setTitleWorld(false);
  letters.group.visible = false;
  specks.opacity = 0;
  titleEl.classList.add('hidden');
  panel.classList.add('hidden'); // ?notitle opens on the intro panel
  panelNext = null;
  phys.reset(at.x, at.z, yawOf(at.dx, at.dz));
  camDir.set(at.dx, 0, at.dz);
  const end = new THREE.Vector3(), look = new THREE.Vector3();
  cameraTarget(end, look);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = end.clone();
  if (!reducedMotion) { from.addScaledVector(camDir, -260); from.y += 380; }
  // A beat in the cloud first while the loading screen fades.
  arrival = { t: -0.25, dur: reducedMotion ? 0.65 : 2.8, end, look, from, at };
  setCloud(1);
  updateArrival(0);
}
function updateArrival(dt) {
  const A = arrival;
  A.t = Math.min(1, A.t + dt / A.dur);
  const u = Math.max(0, A.t);
  const e = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep
  // The gap closes by the same share each moment, as on the title's flight.
  const k = (Math.pow(0.01, e) - 0.01) / 0.99;
  camera.position.lerpVectors(A.end, A.from, k);
  camera.position.y = Math.max(camera.position.y, detail.heightAt(camera.position.x, camera.position.z) + 2);
  camLook.copy(A.look);
  camera.lookAt(camLook);
  setLens(60 + portrait() * 15, Math.max(6, camera.position.distanceTo(A.look)));
  setCloud(1 - THREE.MathUtils.smoothstep(u, 0, 0.4));
  if (A.t < 1) return;
  setCloud(0);
  setLens(60 + portrait() * 15, 6);
  arrival = null;
  startRun(A.at);
  if (A.at === spawn && spawn.board) board(spawn.board);
}

// ---------- Whereabouts ----------
// Where you are, for the big map and the diorama's "You" pin (see
// destinations.js). Saved a few times a second while you ride, so a diorama
// open in another window follows you; a fresh page clears the last one.
const _fw = new THREE.Vector3();
let whereT = 0;
saveWhereabouts(null);
function whereabouts() {
  const ride = state === 'lift' ? liftRide.ride : null;
  const f = ride ? ride.dir : phys.forward(_fw);
  const bearing = THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z)), 360);
  return { x: phys.pos.x, z: phys.pos.z, bearing, lift: ride?.id ?? null };
}

// ---------- Big map ----------
// Click the mini-map (or press M) while riding: the whole map, with you on it.
const minimapBtn = document.getElementById('minimap-open');
minimapBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep Space for the ollie
minimapBtn.addEventListener('click', () => openMap());
function openMap() {
  if (bigMap.isOpen || leaving || (state !== 'ride' && state !== 'lift' && state !== 'drive' && state !== 'horse' && state !== 'soak')) return;
  const at = whereabouts();
  bigMap.open(at, hud.place, phys.pos.y);
  minimapBtn.setAttribute('aria-expanded', 'true');
  saveWhereabouts(at);
}
function closeMap() {
  bigMap.close();
  minimapBtn.setAttribute('aria-expanded', 'false');
}

// ---------- Back to the diorama ----------
// The menu's diorama button opens it on your spawn, after the cloud closes
// over the slope the way the diorama's own dive does; the big map's opens it
// on you. Either way the diorama puts its "You" pin where you are.
const dioramaLink = document.querySelector('#menu a.go');
function dioramaHref(at = spawn.key) {
  if (koktokay) return './tools/map-editor/?map=koktokay';
  const placed = state !== 'title' && state !== 'swoop'; // not on the mountain yet
  return `./diorama.html?map=${dataset}&at=${at}${placed ? `&you=${whereaboutsParam(whereabouts())}` : ''}`;
}
function linkDiorama() {
  dioramaLink.href = dioramaHref();
}
// A new tab or window opens straight from the link, so it's kept current.
dioramaLink.addEventListener('pointerdown', linkDiorama);
dioramaLink.addEventListener('focus', linkDiorama);
let leaving = null;
dioramaLink.addEventListener('click', (e) => {
  if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab or window
  e.preventDefault();
  leaveFor(dioramaHref(), 'Back to the diorama');
});
function leaveFor(href, note) {
  if (leaving) return;
  noteArrival(note);
  keepResume();
  leaving = { t: 0, href };
}
function updateLeaving(dt) {
  leaving.t = Math.min(1, leaving.t + dt / (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.45 : 0.7));
  setCloud(THREE.MathUtils.smoothstep(leaving.t, 0, 1));
  if (leaving.t >= 1) {
    closeMap(); // back from the diorama, you ride on
    location.assign(leaving.href);
    leaving = null;
  }
}
// Back here with the page kept as it was: it's still in the cloud, and you ride
// on from where you were.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  setCloud(0);
  takeResume();
  takeArrivalNote();
});

// If the browser reloads the page instead (Back, or the diorama's "Back to
// riding"), it drops you where you left off: on the snow where you were, or
// at the top if you were riding a lift up. Your spawn stays as it was.
const RESUME_KEY = 'hemu-ski.resume';
function keepResume() {
  try {
    if (state === 'ride' || state === 'lift' || state === 'drive' || state === 'horse' || state === 'soak') sessionStorage.setItem(RESUME_KEY, JSON.stringify(whereabouts()));
    else sessionStorage.removeItem(RESUME_KEY); // from the title, Back is the title again
  } catch {}
}
function takeResume() {
  try {
    const w = JSON.parse(sessionStorage.getItem(RESUME_KEY));
    sessionStorage.removeItem(RESUME_KEY);
    return w && performance.getEntriesByType('navigation')[0]?.type === 'back_forward' ? w : null;
  } catch {
    return null;
  }
}
function resumeSpot(w) {
  if (w.lift) return resolveDestination({ kind: 'lift', id: String(w.lift), end: 'top' });
  const b = THREE.MathUtils.degToRad(w.bearing);
  return detail.inside(w.x, w.z) ? { x: w.x, z: w.z, dx: Math.sin(b), dz: -Math.cos(b), toast: 'Back on the snow' } : null;
}

linkDiorama();
const asked = destinationFromURL();
const askedDest = asked && resolveDestination(asked);
if (asked && !askedDest) console.warn(`No ${asked.kind} ${asked.id} on this map; starting at the top.`);
const back = takeResume();
const backAt = back && resumeSpot(back);
if (askedDest || backAt) arrive(askedDest ?? spawn, backAt ?? askedDest);

// Handy for poking at things from the console.
const debug = { cam: null };
window.__game = { npcs, dialogue, phys, rider, camera, mouseLook, scene, weather, input, startRun, debug, cabin, forest, resolveDestination, bigMap, openMap, whereabouts, gps, vehicles, getIn, getOut, lakes, ripples, onsen, soak, leavePool, dog, petDog, throwSnowball, foxes, horse, mountHorse, getOffHorse, summit, wheels, turnWheel, sound, rides, lifts, board, get liftRide() { return liftRide; }, get car() { return car; }, get state() { return state; }, get spawn() { return spawn; } };
await finishLoading();
requestAnimationFrame(frame);
