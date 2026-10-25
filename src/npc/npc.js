// One of the cast (cast.js): a rider's model, posed once from its T-pose by
// placing its joints and aiming its bones at them, since the models carry no
// clips for sitting about. Only the head moves after that, turning to look at
// whoever's near.
//
// The body frame is the model's own: +z the way they face, +x their left,
// metres up from the floor under them.
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { makeToon } from '../render/toon.js';
import { RIDER_MODELS, loadRiderModel } from '../player/rider-model.js';

// How each pose places the joints (body frame, metres, heights over the
// cushion or mat they sit on).
export const POSES = {
  // Sitting cross-legged: knees out to the sides, the left shin crossed in
  // front of the right, each foot on its outer edge; hands resting on the
  // knees, leaning forward a little from the hips, head up. The rider models
  // are chibi, a thigh and a shin each under 0.3 m, so the feet only just
  // cross the middle.
  crossLegged: {
    hips: 0.15, // the Hips joint over the cushion, for the thighs' thickness
    lean: 0.1,
    head: -0.12, // how far the head tips back up, as a share of the lean
    ankles: [[-0.03, 0.06, 0.3], [0.03, 0.05, 0.19]], // left, right
    knee: [1, 0.1, -0.15], // which way the knees go (left; the right's mirrored)
    elbow: [0.6, -0.3, -1], // and the elbows
    wrist: [0.02, 0.07, -0.06], // where the wrists rest, off the knees (outward, up, back)
    point: 0.45, // how far the feet point on along the shins
  },
};

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

// The turn taking a bone along `d0` with `s0` to one side of it (bind) to along
// `d1` with `s1` to that side (posed): each side made square to its bone.
function swing(d0, s0, d1, s1) {
  const basis = (m, d, s) => {
    const side = _u.copy(s).addScaledVector(d, -s.dot(d)).normalize();
    return m.makeBasis(d, side, _w.crossVectors(d, side));
  };
  basis(_m, d0, s0);
  basis(_n, d1, s1);
  return new THREE.Quaternion().setFromRotationMatrix(_n.multiply(_m.transpose()));
}

// The knee (or elbow) between `a` and `b`, `l1` from a and `l2` from b, bent
// toward `pole`; `b` is pulled in if it's out of reach.
function joint(a, b, l1, l2, pole) {
  const d = _v.subVectors(b, a), len = THREE.MathUtils.clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  d.normalize();
  b.copy(a).addScaledVector(d, len);
  const along = (l1 * l1 - l2 * l2 + len * len) / (2 * len), out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const bend = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
  return a.clone().addScaledVector(d, along).addScaledVector(bend, out);
}

export class Npc {
  constructor(spec, { cushion = 0 } = {}) {
    this.spec = spec;
    this.cushion = cushion;
    this.root = new THREE.Group();
    this.root.name = `npc:${spec.id}`;
    this.look = { yaw: 0, pitch: 0 };
    this.head = null;
    this.ready = loadRiderModel(spec.rider).then((gltf) => this.#build(gltf));
  }

  #build(gltf) {
    const scene = clone(gltf.scene);
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      o.material = makeToon({ map: src.map, color: src.color, side: src.side }, { rim: 1, hatch: 0 });
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false; // the bind pose's bounds don't follow the pose
    });
    const box = new THREE.Box3().setFromObject(scene), S = RIDER_MODELS[this.spec.rider].height / (box.max.y - box.min.y);
    scene.scale.setScalar(S);
    scene.position.y = -box.min.y * S;
    // Posed on its own, so world space is the body frame.
    const body = new THREE.Group();
    body.add(scene);
    body.updateMatrixWorld(true);
    const bones = {};
    scene.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    this.#pose(bones, POSES[this.spec.pose]);
    this.root.add(body);
  }

  // Each bone's target is a turn from its bind orientation (`bindQ`), so the
  // pose doesn't depend on the order it's built in, as long as parents go first.
  #pose(B, P) {
    const at = (name) => B[name].getWorldPosition(new THREE.Vector3());
    const bind = {};
    for (const [name, bone] of Object.entries(B)) bind[name] = { p: at(name), q: bone.getWorldQuaternion(new THREE.Quaternion()) };
    const set = (name, turn) => {
      const bone = B[name], q = turn.clone().multiply(bind[name].q);
      bone.quaternion.copy(bone.parent.getWorldQuaternion(_q).invert().multiply(q));
      bone.updateMatrixWorld(true);
    };
    const dir = (a, b) => new THREE.Vector3().subVectors(bind[b].p, bind[a].p).normalize();
    const len = (a, b) => bind[a].p.distanceTo(bind[b].p);

    // Down onto the cushion, leaning forward over the two spine bones, the head
    // tipped back up.
    const hips = B.Hips, hp = bind.Hips.p.clone().setY(this.cushion + P.hips);
    hips.position.copy(hips.parent.worldToLocal(hp));
    hips.updateMatrixWorld(true);
    const lean = (k) => new THREE.Quaternion().setFromAxisAngle(X, P.lean * k);
    set('Spine', lean(0.5));
    set('Spine1', lean(1));
    set('Head', lean(P.head));

    // Legs: the knee placed between the hip and the ankle, each knee hinged
    // about the one axis square to its thigh and shin.
    for (const [side, s] of [['Left', 1], ['Right', -1]]) {
      const hip = at(`${side}UpLeg`), ankle = new THREE.Vector3(...P.ankles[s > 0 ? 0 : 1]);
      ankle.y += this.cushion;
      const pole = new THREE.Vector3(P.knee[0] * s, P.knee[1], P.knee[2]);
      const knee = joint(hip, ankle, len(`${side}UpLeg`, `${side}Leg`), len(`${side}Leg`, `${side}Foot`), pole);
      const thigh = knee.clone().sub(hip).normalize(), shin = ankle.clone().sub(knee).normalize();
      const hinge = new THREE.Vector3().crossVectors(thigh, shin).normalize();
      set(`${side}UpLeg`, swing(dir(`${side}UpLeg`, `${side}Leg`), X, thigh, hinge));
      set(`${side}Leg`, swing(dir(`${side}Leg`, `${side}Foot`), X, shin, hinge));
      const toe = shin.clone().addScaledVector(Z, P.point).normalize();
      set(`${side}Foot`, swing(dir(`${side}Foot`, `${side}ToeBase`), X, toe, hinge));
      (this.knees ||= {})[side] = knee;
    }

    // Arms: the wrists resting on the knees, palms down, each elbow hinged as
    // the knees are, the forearm turned for the palm.
    for (const [side, s] of [['Left', 1], ['Right', -1]]) {
      const shoulder = at(`${side}Arm`), knee = this.knees[side];
      const wrist = knee.clone().add(new THREE.Vector3(P.wrist[0] * s, P.wrist[1], P.wrist[2]));
      const pole = new THREE.Vector3(P.elbow[0] * s, P.elbow[1], P.elbow[2]);
      const elbow = joint(shoulder, wrist, len(`${side}Arm`, `${side}ForeArm`), len(`${side}ForeArm`, `${side}Hand`), pole);
      const upper = elbow.clone().sub(shoulder).normalize(), fore = wrist.clone().sub(elbow).normalize();
      // In the T-pose the elbow's hinge is -y on the left, +y on the right,
      // and the palms face down.
      const hinge0 = Y.clone().multiplyScalar(-s), palm = Y.clone().negate();
      const hinge = new THREE.Vector3().crossVectors(upper, fore).normalize();
      set(`${side}Arm`, swing(dir(`${side}Arm`, `${side}ForeArm`), hinge0, upper, hinge));
      set(`${side}ForeArm`, swing(dir(`${side}ForeArm`, `${side}Hand`), palm, fore, palm));
      const fingers = fore.clone().lerp(Y.clone().negate(), 0.6).normalize();
      set(`${side}Hand`, swing(dir(`${side}Hand`, `${side}HandMiddle1`), palm, fingers, palm));
    }

    // The head, as posed, for turning it later.
    const head = B.Head;
    this.head = { bone: head, q: head.getWorldQuaternion(new THREE.Quaternion()), parentQ: head.parent.getWorldQuaternion(new THREE.Quaternion()).invert(), at: at('Head') };
  }

  // Turns the head toward `target` (a world point), if it's in front and
  // within `reach` m; back to the front otherwise.
  update(dt, target, reach = 7) {
    const h = this.head;
    if (!h) return;
    let yaw = 0, pitch = 0;
    if (target) {
      const t = this.root.worldToLocal(_v.copy(target)).sub(h.at), flat = Math.hypot(t.x, t.z);
      const y = Math.atan2(t.x, t.z);
      if (flat < reach && Math.abs(y) < 2) {
        yaw = THREE.MathUtils.clamp(y, -1.1, 1.1);
        pitch = THREE.MathUtils.clamp(Math.atan2(t.y, flat), -0.35, 0.45);
      }
    }
    const k = 1 - Math.exp(-dt * 4);
    this.look.yaw += (yaw - this.look.yaw) * k;
    this.look.pitch += (pitch - this.look.pitch) * k;
    _q.setFromEuler(_e.set(-this.look.pitch, this.look.yaw, 0));
    h.bone.quaternion.copy(h.parentQ).multiply(_q).multiply(h.q);
  }
}
