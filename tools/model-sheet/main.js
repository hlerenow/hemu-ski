// Model sheets of the two riders, drawn from the game's own GLBs with its toon
// shading and ink: orthographic views at one scale on one ground line, height
// guides from the skeleton, and the colours the textures are painted in. Made
// to hand an image model as the reference that pins proportions and colours.
import * as THREE from 'three';
import { InkPost } from '../../src/render/post.js';
import { toonUniforms } from '../../src/render/toon.js';
import { RIDER_MODELS, RiderModel, loadRiderModel } from '../../src/player/rider-model.js';
import { extractPalette } from './palette.js';

// Where the camera stands: its bearing from the rider's front, in degrees
// toward the rider's left (the rider faces +Z, their left is +X). LEFT shows
// the rider's left side, facing the left of the picture.
const VIEWS = [
  { id: 'front', label: 'FRONT', bearing: 0 },
  { id: 'three-quarter', label: '3/4', bearing: 45 },
  { id: 'left', label: 'LEFT', bearing: 90 },
  { id: 'back-three-quarter', label: '3/4 BACK', bearing: 135 },
  { id: 'back', label: 'BACK', bearing: 180 },
  { id: 'right', label: 'RIGHT', bearing: 270 },
];
const RIDERS = {
  female: { name: 'Female rider', note: 'cat ears included' },
  male: { name: 'Male rider', note: 'beanie included' },
};
const ARMS = { t: 0, a: 45, bind: null }; // degrees below level; null: as modelled
const LINEUP = ['front', 'left'];
const PAD = 0.08; // m of background round each figure
const CAMERA = 5; // m from the rider's axis
const LINE = 220; // px a metre for each pixel of ink

const $ = (id) => document.getElementById(id);
const status = $('status');
const sheet = $('sheet-canvas');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const post = orthoInk(renderer);
const scene = new THREE.Scene();
const sun = new THREE.DirectionalLight('#ffffff', toonUniforms.uSunIntensity.value);
scene.add(sun, sun.target);
const camera = new THREE.OrthographicCamera();
const _v = new THREE.Vector3();

// InkPost reads depth as a perspective camera's, and lays paper grain and a
// vignette over the frame. Here the camera is orthographic, and the sheet's
// background has to stay one flat colour.
function orthoInk(renderer) {
  const ink = new InkPost(renderer);
  let src = ink.material.fragmentShader;
  for (const [from, to] of [
    ['perspectiveDepthToViewZ(z, uNear, uFar)', 'orthographicDepthToViewZ(z, uNear, uFar)'],
    ['col *= 1.0 + grain * 0.05;', ''],
    ['col *= mix(0.9, 1.0, vig);', ''],
  ]) {
    if (!src.includes(from)) throw new Error(`InkPost has changed: no "${from}" to replace`);
    src = src.replace(from, to);
  }
  ink.material.fragmentShader = src;
  return ink;
}

async function loadRider(id) {
  const model = new RiderModel(await loadRiderModel(id), id);
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    const toon = o.material;
    o.userData.shading = { toon, flat: new THREE.MeshBasicMaterial({ map: toon.map, color: toon.color, side: toon.side }) };
  });
  return { id, model, ...RIDERS[id], file: RIDER_MODELS[id].file, palettes: new Map() };
}

// Puts the arms `drop` degrees below level (null: as modelled) and stands the
// rider on y = 0; keeps the posed mesh's vertices and the joints' heights.
function pose(rider, drop) {
  const { model } = rider;
  for (const side of ['Left', 'Right']) {
    const arm = model.bones[`${side}Arm`];
    arm.bone.quaternion.copy(arm.q);
    if (drop == null) continue;
    const a = THREE.MathUtils.degToRad(drop);
    const level = new THREE.Vector3(side === 'Left' ? Math.cos(a) : -Math.cos(a), -Math.sin(a), 0);
    const turn = new THREE.Quaternion().setFromUnitVectors(model.armDir[side][0], level);
    arm.bone.quaternion.copy(arm.parentQinv).multiply(turn).multiply(arm.modelQ);
  }
  model.root.position.set(0, 0, 0);
  model.root.updateMatrixWorld(true);
  const points = [];
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, _v).applyMatrix4(o.matrixWorld);
      points.push(_v.x, _v.y, _v.z);
    }
  });
  let low = Infinity, high = -Infinity;
  for (let i = 1; i < points.length; i += 3) { low = Math.min(low, points[i]); high = Math.max(high, points[i]); }
  for (let i = 1; i < points.length; i += 3) points[i] -= low;
  model.root.position.y = -low;
  model.root.updateMatrixWorld(true);
  const at = (bone) => model.bones[bone].bone.getWorldPosition(_v).y;
  rider.points = points;
  rider.height = high - low;
  rider.marks = [['top', rider.height], ['neck', at('Head')], ['shoulder', at('LeftArm')], ['hip', at('LeftUpLeg')], ['knee', at('LeftLeg')], ['ankle', at('LeftFoot')]];
}

function shade(rider, shading) {
  rider.model.root.traverse((o) => { if (o.isMesh) o.material = o.userData.shading[shading]; });
}

// One view, `ppm` pixels a metre, from `bottom` to `top` (m): a canvas.
function shoot(rider, view, { ppm, bottom, top, ink }) {
  const b = THREE.MathUtils.degToRad(view.bearing);
  const toward = new THREE.Vector3(Math.sin(b), 0, Math.cos(b));
  const right = new THREE.Vector3(Math.cos(b), 0, -Math.sin(b));
  let lo = Infinity, hi = -Infinity;
  const p = rider.points;
  for (let i = 0; i < p.length; i += 3) {
    const s = p[i] * right.x + p[i + 2] * right.z;
    lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  const w = Math.round((hi - lo + 2 * PAD) * ppm), h = Math.round((top - bottom) * ppm);
  camera.left = (lo + hi) / 2 - w / ppm / 2;
  camera.right = camera.left + w / ppm;
  camera.bottom = bottom;
  camera.top = bottom + h / ppm;
  camera.near = 1;
  camera.far = 2 * CAMERA - 1;
  camera.position.copy(toward).multiplyScalar(CAMERA);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  // The sun keeps to the camera, in front of the rider and a little above and
  // to the left: the side facing the camera is lit, and every side is lit the
  // same way.
  sun.position.copy(right).multiplyScalar(-0.3).addScaledVector(toward, 0.8).add(_v.set(0, 0.5, 0)).multiplyScalar(CAMERA);
  sun.target.position.set(0, 0, 0);
  sun.target.updateMatrixWorld();

  scene.add(rider.model.root);
  renderer.setSize(w, h, false);
  if (ink) {
    post.material.uniforms.uLineWidth.value = ppm / LINE;
    post.setSize(w, h, 1);
    post.render(scene, camera, 0);
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
  scene.remove(rider.model.root);
  const tile = document.createElement('canvas');
  tile.width = w;
  tile.height = h;
  tile.getContext('2d').drawImage(renderer.domElement, 0, 0);
  return tile;
}

// The colours of the rider's textures by how much of the four sides they
// cover, unlit: what each part is painted, not how it's lit.
function palette(rider, arms) {
  if (rider.palettes.has(arms)) return rider.palettes.get(arms);
  const background = scene.background;
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  shade(rider, 'flat');
  const rgb = [];
  for (const id of ['front', 'left', 'back', 'right']) {
    const tile = shoot(rider, VIEWS.find((v) => v.id === id), { ppm: 160, bottom: -PAD, top: rider.height + PAD, ink: false });
    const { data } = tile.getContext('2d').getImageData(0, 0, tile.width, tile.height);
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) rgb.push(data[i], data[i + 1], data[i + 2]);
  }
  scene.background = background;
  const swatches = extractPalette(rgb);
  rider.palettes.set(arms, swatches);
  return swatches;
}

function settings() {
  return {
    sheet: $('sheet').value,
    views: VIEWS.filter((v) => $(`view-${v.id}`).checked),
    arms: $('arms').value,
    shading: $('shading').value,
    ink: $('ink').checked,
    guides: $('guides').checked,
    showPalette: $('palette').checked,
    background: $('background').value,
    ppm: Number($('scale').value),
  };
}

let riders = {};
let tiles = [];

function render(s = settings()) {
  const group = s.sheet === 'lineup' ? [riders.female, riders.male] : [riders[s.sheet]];
  for (const rider of group) pose(rider, ARMS[s.arms]);
  const top = Math.max(...group.map((r) => r.height)) + PAD;
  const shots = [];
  for (const rider of group) {
    const swatches = s.showPalette && s.sheet !== 'lineup' ? palette(rider, s.arms) : null;
    shade(rider, s.shading);
    scene.background = new THREE.Color(s.background);
    renderer.setClearColor(s.background, 1);
    const views = s.sheet === 'lineup' ? VIEWS.filter((v) => LINEUP.includes(v.id)) : s.views;
    for (const view of views) shots.push({ rider, view, swatches, tile: shoot(rider, view, { ppm: s.ppm, bottom: -PAD, top, ink: s.ink }) });
  }
  tiles = shots;
  compose(shots, group, top, s);
  const lines = group.map((r) => `${r.name}: ${r.height.toFixed(2)} m · ${r.file}\n` + (palette(r, s.arms).map((c) => `  ${c.hex}  ${(c.share * 100).toFixed(1)}%`).join('\n')));
  $('palette-text').textContent = lines.join('\n\n');
  status.textContent = `${shots.length} views · ${sheet.width} × ${sheet.height} px`;
}

// Lays the views out in a row on one ground line, with a title, the height
// guides, each view's name and the palette.
function compose(shots, group, top, s) {
  const u = s.ppm;
  const font = Math.round(u * 0.045);
  const margin = Math.round(u * 0.12), gap = Math.round(u * 0.06);
  const lineup = s.sheet === 'lineup';
  const labelColumn = s.guides && !lineup ? Math.round(u * 0.42) : 0;
  const header = Math.round(font * 3.4);
  const tileH = shots[0].tile.height;
  const swatches = shots[0].swatches;
  const swatch = Math.round(u * 0.15);
  const paletteH = swatches ? Math.round(font * 2.4 + swatch + font * 2.6) : 0;
  const footer = Math.round(font * 1.8);
  const band = shots.reduce((w, shot) => w + shot.tile.width, 0) + gap * (shots.length - 1);
  sheet.width = Math.max(margin * 2 + labelColumn + band, margin * 2 + (swatches?.length ?? 0) * (swatch + gap * 2));
  sheet.height = margin + header + tileH + font * 2 + paletteH + footer + margin;
  const ctx = sheet.getContext('2d');
  const ink = '#1f2a33', grey = '#5b6870';
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  const title = lineup ? 'THE RIDERS, SIDE BY SIDE' : `${group[0].name.toUpperCase()} · MODEL SHEET`;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 ${Math.round(font * 1.3)}px system-ui, sans-serif`;
  ctx.fillText(`HEMU SKI · ${title}`, margin, margin + font * 1.3);
  ctx.fillStyle = grey;
  ctx.font = `${Math.round(font * 0.8)}px system-ui, sans-serif`;
  const heights = group.map((r) => `${lineup ? r.name.toLowerCase() + ' ' : ''}${r.height.toFixed(2)} m tall (${r.note})`).join(', ');
  const arms = { t: 'T-pose', a: 'A-pose', bind: 'pose as modelled' }[s.arms];
  ctx.fillText(`${heights} · orthographic, all views at one scale · ${arms} · ${s.shading === 'toon' ? 'game toon shading' : 'flat texture colours'}`, margin, margin + font * 2.7);

  const y0 = margin + header;
  const ground = y0 + top * u;
  let x = margin + labelColumn;
  for (const shot of shots) {
    shot.x = x;
    ctx.drawImage(shot.tile, x, y0);
    x += shot.tile.width + gap;
  }
  const right = x - gap;

  ctx.setLineDash([]);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, u / 300);
  ctx.beginPath();
  ctx.moveTo(margin + labelColumn, ground);
  ctx.lineTo(right, ground);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (s.guides) {
    ctx.font = `${Math.round(font * 0.72)}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.setLineDash([u / 60, u / 90]);
    for (const rider of group) {
      const own = shots.filter((shot) => shot.rider === rider);
      const from = lineup ? own[0].x : margin + labelColumn;
      const to = lineup ? own.at(-1).x + own.at(-1).tile.width : right;
      for (const [mark, height] of lineup ? rider.marks.slice(0, 1) : rider.marks) {
        const y = ground - height * u;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(from, y);
        ctx.lineTo(to, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = grey;
        if (lineup) {
          ctx.textAlign = 'left';
          ctx.fillText(`${height.toFixed(2)} m`, from + font * 0.3, y - font * 0.6);
        } else {
          ctx.textAlign = 'right';
          ctx.fillText(`${mark} ${height.toFixed(2)} m`, margin + labelColumn - font * 0.4, y);
        }
      }
    }
    ctx.setLineDash([]);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(font * 0.85)}px system-ui, sans-serif`;
  ctx.letterSpacing = `${Math.round(font * 0.12)}px`;
  for (const shot of shots) {
    const label = lineup ? `${shot.rider.id.toUpperCase()} · ${shot.view.label}` : shot.view.label;
    ctx.fillText(label, shot.x + shot.tile.width / 2, y0 + tileH + font * 1.4);
  }
  ctx.letterSpacing = '0px';

  let y = y0 + tileH + font * 2;
  if (swatches) {
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.font = `600 ${Math.round(font * 0.8)}px system-ui, sans-serif`;
    ctx.fillText('PALETTE', margin, y + font * 1.2);
    ctx.fillStyle = grey;
    ctx.font = `${Math.round(font * 0.72)}px system-ui, sans-serif`;
    ctx.fillText('the textures’ own colours, unlit, by how much of the figure each covers', margin + font * 5, y + font * 1.2);
    y += font * 2.4;
    let sx = margin;
    for (const { hex, share } of swatches) {
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.roundRect(sx, y, swatch, swatch, swatch * 0.1);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = Math.max(1, u / 400);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.fillStyle = ink;
      ctx.font = `${Math.round(font * 0.72)}px ui-monospace, monospace`;
      ctx.fillText(hex, sx + swatch / 2, y + swatch + font * 1.0);
      ctx.fillStyle = grey;
      ctx.font = `${Math.round(font * 0.62)}px system-ui, sans-serif`;
      ctx.fillText(`${(share * 100).toFixed(1)}%`, sx + swatch / 2, y + swatch + font * 1.9);
      sx += swatch + gap * 2;
    }
    y += swatch + font * 2.6;
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = grey;
  ctx.font = `${Math.round(font * 0.62)}px system-ui, sans-serif`;
  const files = group.map((r) => `public/models/${r.file}`).join(', ');
  ctx.fillText(`Rendered by tools/model-sheet from ${files}, ${new Date().toISOString().slice(0, 10)}`, margin, y + font * 1.1);
}

function save(canvas, name) {
  return new Promise((resolve) => canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); resolve(); }, 400);
  }, 'image/png'));
}

$('views').append(...VIEWS.map((v) => {
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" id="view-${v.id}"${v.id === 'back-three-quarter' ? '' : ' checked'}> ${v.label}`;
  return label;
}));
for (const input of document.querySelectorAll('nav select, nav input')) input.addEventListener('change', () => render());
$('save-sheet').onclick = () => save(sheet, `hemu-ski-${settings().sheet}-sheet.png`);
$('save-views').onclick = async () => {
  for (const { rider, view, tile } of tiles) await save(tile, `hemu-ski-${rider.id}-${view.id}.png`);
};

[riders.female, riders.male] = await Promise.all([loadRider('female'), loadRider('male')]);
render();
window.__sheet = { render, settings, riders, VIEWS, get tiles() { return tiles; }, canvas: sheet };
