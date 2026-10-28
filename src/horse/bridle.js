// The horse's bridle, built in code: black leather straps lying on its face,
// and the bit's rings at the corners of its mouth, where the reins (tack.js)
// are buckled on. The headstall goes over the poll just behind the ears and
// down each cheek to the bit; the browband crosses the forehead in front of
// the ears; the noseband rings the nose below the cheekbones; the
// throatlatch runs from behind the ears down round under the throat.
//
// Each strap is drawn through a few points round the head, each cast onto
// the hide (the horse's mesh at rest) along the way in from outside and set
// just off it, so it lies on the face whatever its shape. They're built in
// the model frame (+z forward, +x the horse's left, +y up, model units) and
// ride on the head bone.
import * as THREE from 'three';

// The head's own frame at rest (model units): the poll (the head bone's
// joint), the way down the face to the muzzle, and the way the face looks
// (square to that, toward the forehead).
const POLL = new THREE.Vector3(0, 0.705, 0.335);
const DOWN = new THREE.Vector3(0, -0.73, 0.68).normalize();
const FACE = new THREE.Vector3(0, 0.68, 0.73).normalize();
const SIDE = new THREE.Vector3(1, 0, 0);
// How far down the face (from the poll, model units) each strap goes round:
// the headstall just behind the ears, the browband just in front, the
// noseband below the cheekbones; the bit's rings are at the mouth's corners.
const AT = { crown: -0.022, brow: 0.045, nose: 0.15 };
// The throatlatch, from the headstall under each ear down the back of the jaw
// and round under the throat (model units, the horse's left; mirrored).
const THROAT = [[0.07, 0.66, 0.318], [0.06, 0.61, 0.322], [0.035, 0.578, 0.326]];
// Strap widths and thickness, and how far off the hide they lie (metres).
const WIDE = { strap: 0.028, nose: 0.038, thick: 0.006, gap: 0.004 };
// The bit's rings: their middles (model units, left first; tack.js's BIT) and size (metres).
export const RING = { radius: 0.034, wire: 0.006 };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

// A way round the head at `t` down the face, `deg` from the face (0) toward
// the horse's left (+90) and on round under the jaw (±180).
const around = (deg, out = new THREE.Vector3()) => {
  const r = THREE.MathUtils.degToRad(deg);
  return out.copy(FACE).multiplyScalar(Math.cos(r)).addScaledVector(SIDE, Math.sin(r));
};

export class Bridle {
  // `geometry` the horse's skinned mesh's (its rest pose, in the model
  // frame), `scale` metres per model unit, `bit` the rings' middles (model
  // units), `leather` and `metal` materials. `group` holds it all, in the
  // model frame at rest: parent it to the head bone with that put back.
  constructor(geometry, scale, bit, leather, metal) {
    this.scale = scale;
    this.probe = headOnly(geometry);
    this.ray = new THREE.Raycaster();
    this.group = new THREE.Group();
    this.group.name = 'Bridle';
    const m = 1 / scale, w = WIDE.strap * m;
    const crown = (deg) => this.#onto(_a.copy(POLL).addScaledVector(DOWN, AT.crown), around(deg));
    // The headstall: from the top of each ring up the cheek, behind the eye,
    // over the poll and down the other side.
    const ringAt = (side) => ({ p: new THREE.Vector3().copy(bit[side > 0 ? 0 : 1]).add(_b.set(side * 0.004, RING.radius * m * 0.9, 0)), n: new THREE.Vector3(side, 0, 0) });
    const cheek = (side) => {
      const ring = ringAt(side).p, top = crown(side * 88).p;
      return [0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88].map((k) => this.#onto(_a.lerpVectors(ring, top, k), _n.set(side, 0, 0)));
    };
    const overPoll = [88, 60, 30, 0, -30, -60, -88].map(crown);
    this.#strap([ringAt(1), ...cheek(1), ...overPoll, ...cheek(-1).reverse(), ringAt(-1)], w, leather);
    // The browband, across the forehead in front of the ears, its ends at the headstall.
    const brow = [-80, -55, -25, 0, 25, 55, 80].map((deg) => {
      const t = THREE.MathUtils.lerp(AT.crown, AT.brow, Math.cos(THREE.MathUtils.degToRad(deg)) ** 2);
      return this.#onto(_a.copy(POLL).addScaledVector(DOWN, t), around(deg));
    });
    this.#strap(brow, w * 0.85, leather);
    // The noseband, right round the nose.
    const nose = Array.from({ length: 16 }, (_, i) => this.#onto(_a.copy(POLL).addScaledVector(DOWN, AT.nose), around(i * 22.5)));
    this.#strap(nose, WIDE.nose * m, leather, true);
    // The throatlatch: from the headstall below each ear, back and down round
    // under the throat, behind the jaw.
    const side = (k) => THROAT.map(([x, y, z]) => this.#onto(_a.set(x * k, y, z), _n.set(k, -0.4, 0)));
    const under = this.#onto(_a.set(0, 0.56, 0.33), _n.set(0, -1, 0));
    const throat = [crown(100), ...side(1), under, ...side(-1).reverse(), crown(-100)];
    this.#strap(throat, w * 0.8, leather);
    // The bit's rings, standing square to the cheeks, and the mouthpiece
    // between them (in the mouth, mostly out of sight).
    for (const p of bit) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RING.radius * m, RING.wire * m, 8, 24), metal);
      ring.position.copy(p).add(_b.set(Math.sign(p.x) * 0.004, 0, 0));
      ring.rotation.y = Math.PI / 2;
      ring.castShadow = true;
      this.group.add(ring);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(RING.wire * m, RING.wire * m, Math.abs(bit[0].x - bit[1].x), 8), metal);
    bar.position.lerpVectors(bit[0], bit[1], 0.5);
    bar.rotation.z = Math.PI / 2;
    this.group.add(bar);
    this.probe.geometry.dispose();
    this.probe = null;
  }

  // `p` brought onto the hide, coming in from outside along -`out`: the
  // first hide a ray meets coming in, set the strap's gap and half its
  // thickness off it. `reach` how far outside to start (model units).
  #onto(p, out, reach = 0.25) {
    const n = out.clone().normalize();
    const from = _b.copy(p).addScaledVector(n, reach || 0.2);
    this.ray.set(from, n.clone().negate());
    const hit = this.ray.intersectObject(this.probe, false)[0];
    const lift = (WIDE.gap + WIDE.thick / 2) / this.scale;
    return { p: hit ? hit.point.clone().addScaledVector(n, lift) : p.clone(), n };
  }

  // A flat strap through `points` ({ p, n }: where, and the way out from the
  // hide there), `width` across (model units), lying flat on the hide.
  #strap(points, width, material, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map((o) => o.p), closed, 'centripetal');
    const outs = new THREE.CatmullRomCurve3(points.map((o) => o.n), closed);
    const steps = points.length * 6, thick = WIDE.thick / this.scale;
    const pos = [], index = [];
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3();
    const rings = closed ? steps : steps + 1;
    for (let i = 0; i < rings; i++) {
      const u = i / steps;
      curve.getPointAt(u, P);
      curve.getTangentAt(u, T);
      outs.getPoint(curve.getUtoTmapping(u), N);
      B.crossVectors(T, N).normalize();
      N.crossVectors(B, T).normalize();
      for (const [a, b] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        pos.push(P.x + B.x * a * width / 2 + N.x * b * thick / 2, P.y + B.y * a * width / 2 + N.y * b * thick / 2, P.z + B.z * a * width / 2 + N.z * b * thick / 2);
      }
    }
    for (let i = 0; i < steps; i++) {
      const j = closed ? (i + 1) % rings : i + 1;
      for (let k = 0; k < 4; k++) {
        const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), c = j * 4 + ((k + 1) % 4), d = j * 4 + k;
        index.push(a, d, b, b, d, c);
      }
    }
    if (!closed) for (const [s, flip] of [[0, false], [steps * 4, true]]) index.push(...(flip ? [s, s + 1, s + 2, s, s + 2, s + 3] : [s, s + 2, s + 1, s, s + 3, s + 2]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    this.group.add(mesh);
    return mesh;
  }
}

// The head's triangles only (all three corners ahead of the withers), to cast
// onto quickly.
function headOnly(geometry) {
  const pos = geometry.attributes.position, idx = geometry.index;
  const keep = [];
  const count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const v = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k));
    if (v.every((j) => pos.getZ(j) > 0.2 && pos.getY(j) > 0.42)) keep.push(...v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pos);
  g.setIndex(keep);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}
