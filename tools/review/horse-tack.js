// The horse review's tack (tools/review/horse.html): the game's own (src/
// horse/tack.js: the Kazakh saddle, its stirrup irons and reins, the rider's
// seat) with what the review measures on top: how far the hide runs into the
// saddle's cloth, how far the seat drifts off the rider's frame, and how far a
// rider's legs run into the horse.
//
// Model frame (the GLB's units): +z forward, +x the horse's left, +y up,
// hooves at y = 0, as in the game's tack.
import * as THREE from 'three';
import { Tack as GameTack } from '../../src/horse/tack.js';

export { loadSaddle, IRON, stirrupIron, TREAD_TOP, FIT, STIRRUPS } from '../../src/horse/tack.js';

const { degToRad, clamp } = THREE.MathUtils;
const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// ---- The back's cross-sections ----
// Each slice across the body (constant z) as a radius about a line along the
// barrel at height CY, for angles from straight up (0) toward the horse's
// left (+): how far out the hide is in each direction.
const CY = 0.42;
const Z0 = 0.14, Z1 = -0.32, DZ = 0.02;
const T0 = -110, T1 = 110, DT = 5;
const NZ = Math.round((Z0 - Z1) / DZ) + 1, NT = Math.round((T1 - T0) / DT) + 1;

export function backProfile(positions) {
  const r = Array.from({ length: NZ }, () => new Float32Array(NT).fill(NaN));
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (y < 0.25) continue; // the legs
    const zi = Math.round((Z0 - z) / DZ);
    if (zi < 0 || zi >= NZ || Math.abs(Z0 - zi * DZ - z) > DZ * 0.55) continue;
    const t = THREE.MathUtils.radToDeg(Math.atan2(x, y - CY));
    const ti = Math.round((t - T0) / DT);
    if (ti < 0 || ti >= NT) continue;
    const d = Math.hypot(x, y - CY);
    if (!(d <= r[zi][ti])) r[zi][ti] = Math.max(d, Number.isNaN(r[zi][ti]) ? 0 : r[zi][ti]);
  }
  // Fill the gaps along each slice, then from the neighbouring slice.
  for (const row of r) {
    for (let j = 0; j < NT; j++) {
      if (!Number.isNaN(row[j])) continue;
      let a = j - 1, b = j + 1;
      while (a >= 0 && Number.isNaN(row[a])) a--;
      while (b < NT && Number.isNaN(row[b])) b++;
      if (a >= 0 && b < NT) row[j] = row[a] + ((row[b] - row[a]) * (j - a)) / (b - a);
      else if (a >= 0) row[j] = row[a];
      else if (b < NT) row[j] = row[b];
    }
  }
  for (let i = 0; i < NZ; i++) if (Number.isNaN(r[i][0])) r[i] = Float32Array.from(r[i > 0 ? i - 1 : i + 1]);
  // Smooth across both ways, so the tack lies over the hide's small bumps.
  const smooth = (get, set, n, m) => {
    for (let i = 0; i < n; i++) {
      const row = Array.from({ length: m }, (_, j) => get(i, j));
      for (let j = 0; j < m; j++) set(i, j, (row[Math.max(0, j - 1)] + 2 * row[j] + row[Math.min(m - 1, j + 1)]) / 4);
    }
  };
  for (let k = 0; k < 2; k++) {
    smooth((i, j) => r[i][j], (i, j, v) => { r[i][j] = v; }, NZ, NT);
    smooth((j, i) => r[i][j], (j, i, v) => { r[i][j] = v; }, NT, NZ);
  }
  // The hide's distance from the barrel line at z, `deg` from straight up.
  const at = (z, deg) => {
    const fz = clamp((Z0 - z) / DZ, 0, NZ - 1), ft = clamp((deg - T0) / DT, 0, NT - 1);
    const i = Math.min(Math.floor(fz), NZ - 2), j = Math.min(Math.floor(ft), NT - 2);
    const u = fz - i, v = ft - j;
    return (r[i][j] * (1 - u) + r[i + 1][j] * u) * (1 - v) + (r[i][j + 1] * (1 - u) + r[i + 1][j + 1] * u) * v;
  };
  // A point (model units) `lift` off the hide at z, `deg` from straight up.
  const point = (z, deg, lift, out = new THREE.Vector3()) => {
    const a = degToRad(deg), d = at(z, deg) + lift;
    return out.set(Math.sin(a) * d, CY + Math.cos(a) * d, z);
  };
  // How far a point (model units) is inside the hide, or < 0 outside it.
  const depth = (p) => {
    if (p.z > Z0 || p.z < Z1) return -1;
    const deg = THREE.MathUtils.radToDeg(Math.atan2(p.x, p.y - CY));
    if (deg < T0 || deg > T1) return -1;
    return at(p.z, deg) - Math.hypot(p.x, p.y - CY);
  };
  return { at, point, depth };
}

// The saddle's cloth, front and back (model units), and how far its outside
// stands off the hide (the fit's gap and the felt, metres).
const CLOTH = { front: 0.022, back: -0.259, bottom: 0.365, off: 0.026 };

export class Tack extends GameTack {
  constructor(model, bones, mesh, saddle) {
    super(model, bones, mesh, saddle);
    this.profile = backProfile(mesh.geometry.attributes.position);
    this.hideUnder(mesh);
    // The saddle's vertex nearest the seat's low point, to see how far the
    // skinned seat strays from the rider's frame on spine1.
    const sp = this.probe.geometry.attributes.position;
    let best = Infinity;
    for (let i = 0; i < sp.count; i++) {
      const d = _a.fromBufferAttribute(sp, i).distanceTo(this.low);
      if (d < best) { best = d; this.lowVertex = i; }
    }
  }

  // The hide under the cloth: each vertex at rest, its outward normal, and
  // the points it faces on the inside and the outside of the cloth (a
  // triangle of the saddle's and where in it). A frame's pose moves them all;
  // clearance() says how far the hide passes through.
  hideUnder(mesh) {
    const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
    this.mesh = mesh;
    this.under = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (p.z > CLOTH.front + 0.01 || p.z < CLOTH.back - 0.01 || p.y < CLOTH.bottom) continue;
      n.fromBufferAttribute(nor, i).normalize();
      this.ray.set(_a.copy(p).addScaledVector(n, 0.0005), n);
      const [hit, out] = this.ray.intersectObject(this.probe, false);
      if (!hit || hit.distance > 0.03 || !out) continue; // under the tree's arch or the seat, not the cloth
      const point = (h) => ({ face: [h.face.a, h.face.b, h.face.c], at: h.barycoord.clone() });
      this.under.push({ i, inner: point(hit), outer: point(out), n: n.clone() });
    }
  }

  // How far (metres) the posed hide passes through the inside of the saddle's
  // cloth, worst first, and where (model z, y at rest), and how far through
  // its outside, where it would show; < 0 is clear by that much. Both are
  // skinned to the one skeleton, so both are in its frame.
  clearance(scale) {
    let worst = -Infinity, where = null, shows = -Infinity;
    const along = (u, pt) => {
      _b.set(0, 0, 0);
      pt.face.forEach((j, k) => _b.addScaledVector(this.saddleMesh.getVertexPosition(j, _d), pt.at.getComponent(k)));
      return -_b.sub(_a).dot(u.n);
    };
    for (const u of this.under) {
      this.mesh.getVertexPosition(u.i, _a);
      const d = along(u, u.inner);
      if (d > worst) { worst = d; where = u; }
      shows = Math.max(shows, along(u, u.outer));
    }
    const rest = where && _a.fromBufferAttribute(this.mesh.geometry.attributes.position, where.i);
    return { into: worst * scale, shows: shows * scale, z: rest?.z, y: rest?.y };
  }

  // How far (metres) the seat's low point on the skinned saddle is from where
  // the rider's frame, rigid on spine1, puts it.
  seatDrift() {
    this.saddleMesh.getVertexPosition(this.lowVertex, _a);
    this.saddleMesh.updateWorldMatrix(true, false);
    _a.applyMatrix4(this.saddleMesh.matrixWorld);
    this.saddle.updateWorldMatrix(true, false);
    _b.fromBufferAttribute(this.saddleMesh.geometry.attributes.position, this.lowVertex);
    return _a.distanceTo(this.saddle.localToWorld(_b));
  }

  // How far the leg runs inside the horse or its saddle cloth (metres, < 0
  // clear): the thigh and shin from `hip` to `knee` to `ankle` (world points),
  // each `radius` round, skipping the top of the thigh, which sits on the
  // saddle.
  legDepth(hip, knee, ankle, radius, scale) {
    let worst = -Infinity;
    for (const [a, b, from] of [[hip, knee, 0.3], [knee, ankle, 0]]) {
      for (let k = from; k <= 1.0001; k += 0.1) {
        const p = this.model.worldToLocal(_a.copy(a).lerp(b, k));
        const cloth = p.z <= CLOTH.front && p.z >= CLOTH.back && p.y >= CLOTH.bottom ? CLOTH.off : 0;
        worst = Math.max(worst, this.profile.depth(p) * scale + cloth + radius);
      }
    }
    return worst;
  }
}
