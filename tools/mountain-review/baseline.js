// Frozen pre-change backdrop, used only by the visual comparison tool.
import * as THREE from 'three';
import { makeToon } from '../../src/render/toon.js';
import { PISTE_HALF_WIDTH } from '../../src/world/data.js';

const C = {
  snow: new THREE.Color('#fbfaf4'),
  snowShade: new THREE.Color('#eef1ec'),
  groomed: new THREE.Color('#e6eef0'),
  hollow: new THREE.Color('#cbdce2'),
  crest: new THREE.Color('#ffffff'),
  rock: new THREE.Color('#8f8c86'),
  rockDark: new THREE.Color('#6f7472'),
  forest: new THREE.Color('#4f6f5e'),
  forestDark: new THREE.Color('#3e5a4f'),
};

import { vnoise } from '../../src/world/terrain.js';
function gridGeometry(hf, yOffset) {
  const { verts, size } = hf;
  const pos = new Float32Array(verts * verts * 3);
  for (let j = 0; j < verts; j++)
    for (let i = 0; i < verts; i++) {
      const k = j * verts + i;
      const x = hf.x0 + (i / hf.cells) * size, z = hf.z0 + (j / hf.cells) * size;
      pos[k * 3] = x;
      pos[k * 3 + 1] = hf.h[k] + (yOffset ? yOffset(x, z) : 0);
      pos[k * 3 + 2] = z;
    }
  const idx = new Uint32Array(hf.cells * hf.cells * 6);
  let t = 0;
  for (let j = 0; j < hf.cells; j++)
    for (let i = 0; i < hf.cells; i++) {
      if (hf.cellIsHole(i, j)) continue; // tiles deleted in the map editor
      const a = j * verts + i, b = a + 1, c = a + verts, d = c + 1;
      idx[t++] = a; idx[t++] = c; idx[t++] = b;
      idx[t++] = b; idx[t++] = c; idx[t++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, t), 1));
  g.computeVertexNormals();
  return g;
}

// `clearings` ([{ x, z, r }]) open the taiga up around buildings.
export function createBackdrop(hf, detail, treeline, clearings = []) {
  // Sink the part that sits under the detailed terrain.
  const g = gridGeometry(hf, (x, z) => (detail.inside(x, z, 20) ? -80 : 0));
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const slope = (Math.acos(Math.min(1, nrm.getY(k))) * 180) / Math.PI;
    const n = vnoise(x * 0.0015, z * 0.0015);
    c.copy(C.snow).lerp(C.snowShade, n);
    // Taiga covers the valleys and lower slopes of the Altai.
    let forest = THREE.MathUtils.smoothstep(treeline + 120 - y + (n - 0.5) * 250, 0, 150) *
      (1 - THREE.MathUtils.smoothstep(slope, 30, 40));
    // Stands of trees with snowy meadows between them, as on the trail map.
    forest *= 0.3 + 0.7 * THREE.MathUtils.smoothstep(vnoise(x * 0.0011 + 7, z * 0.0011), 0.38, 0.62);
    for (const cl of clearings) forest *= 0.3 + 0.7 * THREE.MathUtils.smoothstep(Math.hypot(x - cl.x, z - cl.z), cl.r, cl.r * 3);
    c.lerp(n > 0.5 ? C.forest : C.forestDark, forest * 0.85);
    const rockT = THREE.MathUtils.smoothstep(slope, 33, 42);
    c.lerp(C.rockDark, rockT * 0.8);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(g, makeToon({ vertexColors: true }, { hatch: 0 }));
}
