// Run: npm test (node tests/rider-animation.mjs)
// Uses the actual female GLB rigs/clips (ski gear and swimsuit); omits only texture material references
// so the regression runs in Node without browser image loaders or a WebGL context.
import assert from 'node:assert/strict';
import { BoardPose } from '../src/player/rider-board-pose.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createServer } from 'vite';
import { fallPose, fallKind, applyFallPose, placeAssembly, handOnSnow, shakePose, FALL_DURATION, SHAKE_DURATION, FALL_KINDS } from '../src/player/fall.js';
import { clearGround, rollAssembly } from '../src/player/rider-contact.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { RiderModel } = await server.ssrLoadModule('/src/player/rider-model.js');
  // The GLB with its textures left out.
  async function load(file) {
    const source = await readFile(new URL(`../public/models/${file.includes('/') ? file : `female-rider/${file}`}`, import.meta.url));
    const jsonLength = source.readUInt32LE(12);
    const json = JSON.parse(source.subarray(20, 20 + jsonLength));
    json.materials = (json.materials || []).map(() => ({ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }));
    const jsonBytes = Buffer.from(JSON.stringify(json));
    const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
    const binaryChunk = source.subarray(20 + jsonLength);
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0); // glTF
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + paddedJson.length + binaryChunk.length, 8);
    header.writeUInt32LE(paddedJson.length, 12);
    header.writeUInt32LE(0x4e4f534a, 16); // JSON
    const bytes = Buffer.concat([header, paddedJson, binaryChunk]);
    return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  }
  const gltf = await load('female-rider-rigfix-walk-run-tex2k-v03.glb');

  const group = () => new THREE.Group();
  const rider = {
    hips: group(), torso: group(), head: group(),
    armL: { sh: group(), el: group() }, armR: { sh: group(), el: group() },
    feet: [group(), group()],
  };
  rider.hips.position.set(0.02, 0.6, -0.15);
  rider.hips.rotation.set(0, 0.3, 0);
  rider.torso.rotation.set(0.7, 0.25, 0);
  rider.head.rotation.set(-0.5, 0.55, 0);
  rider.armL.sh.rotation.set(-0.5, 0, 1.15);
  rider.armR.sh.rotation.set(-0.9, 0, -0.75);
  rider.feet[0].position.set(0.26, 0.025, 0);
  rider.feet[1].position.set(-0.26, 0.025, 0);

  const idleAsset = await load('motions/weight-shift-idle-v01/weight-shift-idle-v01.glb');
  assert.equal(idleAsset.animations.length, 1);
  const idleModel = new RiderModel(gltf, 'female', { idle: idleAsset });
  for (let i = 0; i < 120; i++) idleModel.update(1 / 60, rider, 'walk', 0);
  assert(idleModel.idle.getEffectiveWeight() > 0.99, 'standing uses idle');
  const idleTime = idleModel.idle.time;
  idleModel.update(1 / 60, rider, 'walk', 0);
  assert.notEqual(idleModel.idle.time, idleTime, 'idle continues animating while stopped');
  for (let i = 0; i < 120; i++) idleModel.update(1 / 60, rider, 'walk', 2);
  assert(idleModel.idle.getEffectiveWeight() < 0.01, 'movement blends out idle');
  console.log('PASS standing idle advances and blends into walking');

  const model = new RiderModel(gltf, 'female');
  assert.equal(model.canWalk, true, 'actual female asset must provide both walk and run');
  const frames = (mode, speed, count = 60, subject = model) => {
    for (let i = 0; i < count; i++) subject.update(1 / 60, rider, mode, speed);
  };
  function assertPose(expected, label, subject = model) {
    let count = 0;
    expected.traverse((bone) => {
      if (!bone.isBone) return;
      count++;
      const actual = subject.root.getObjectByName(bone.name);
      assert(actual, `${label}: missing ${bone.name}`);
      assert(actual.position.distanceTo(bone.position) < 1e-6, `${label}: ${bone.name} position`);
      // GLB float quaternions can be slightly non-unit even when identical.
      assert(actual.quaternion.clone().normalize().angleTo(bone.quaternion.clone().normalize()) < 1e-5,
        `${label}: ${bone.name} rotation`);
      assert(actual.scale.distanceTo(bone.scale) < 1e-6, `${label}: ${bone.name} scale`);
    });
    assert.equal(count, 65, `${label}: expected every actual asset bone`);
    console.log(`PASS ${label}: all ${count} bones`);
  }
  function assertAuthoredPose(speed, label) {
    const expected = clone(gltf.scene);
    const mixer = new THREE.AnimationMixer(expected);
    const blend = THREE.MathUtils.smoothstep(speed, 1.5, 4);
    const walk = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'walk.001')).play();
    const run = mixer.clipAction(gltf.animations.find((clip) => clip.name === 'run.001')).play();
    walk.setEffectiveWeight(1 - blend); run.setEffectiveWeight(blend);
    walk.time = model.walk.time; run.time = model.run.time;
    mixer.update(0);
    assertPose(expected, label);
  }

  frames('ride', 0);
  frames('walk', 0);
  assertAuthoredPose(0, 'ride -> frozen idle');
  frames('walk', 1.4);
  assertAuthoredPose(1.4, 'walking target');
  frames('walk', 2.7);
  assertAuthoredPose(2.7, 'walk/run blend target');
  frames('walk', 4);
  assertAuthoredPose(4, 'running target');
  frames('ride', 0);
  const freshRide = new RiderModel(gltf, 'female');
  freshRide.update(1 / 60, rider, 'ride', 0);
  assertPose(freshRide.root, 'run -> ride restores all bones including undriven bones');
  frames('walk', 0);
  assertAuthoredPose(0, 'walk/run -> ride -> frozen idle');

  // Real skinned geometry (all clothing vertices), rolled with its bindings.
  const contactRoot = group(), assembly = group(); contactRoot.add(assembly); assembly.add(model.root);
  const terrain = { heightAt: (x, z) => 0.2 * x + 0.3 * z };
  const vertex = new THREE.Vector3();
  for (let frame = 0; frame <= 32; frame++) {
    contactRoot.position.set(0, 0, 0);
    rollAssembly(assembly, -frame / 32 * Math.PI * 4, 0.65);
    model.update(1 / 60, rider, 'ride', 0);
    clearGround(contactRoot, terrain, true);
    let minimum = Infinity;
    contactRoot.traverseVisible((o) => {
      if (!o.isMesh) return;
      for (let i = 0; i < o.geometry.attributes.position.count; i++) {
        o.getVertexPosition(i, vertex).applyMatrix4(o.matrixWorld);
        minimum = Math.min(minimum, vertex.y - terrain.heightAt(vertex.x, vertex.z));
      }
    });
    assert(Math.abs(minimum - 0.025) < 1e-5, 'actual rig rests above snow throughout two rotations');
  }
  assembly.remove(model.root);
  console.log('PASS actual skinned rider contact throughout two complete rolls on a slope');

  // Every kind of fall on the real rig, on sloped snow: clothing above it,
  // planted hands on it, and an edge fall's boots kept down.
  const fallModel = new RiderModel(gltf, 'female');
  const fallRoot = group(), fallEdge = group(), fallBody = group();
  fallRoot.add(fallEdge); fallEdge.add(fallBody); fallBody.rotation.y = Math.PI / 2;
  fallBody.add(fallModel.root);
  const snow = { heightAt: (x, z) => 0.1 * x };
  // applyFallPose poses the shared mock rider; put it back for the tests after.
  const riderPose = [rider.hips, rider.torso, rider.head, rider.armL.sh, rider.armL.el, rider.armR.sh, rider.armR.el]
    .map(o => [o, o.position.clone(), o.rotation.clone()]);
  for (const kind of Object.keys(FALL_KINDS)) {
    const motion = { kind, forward: kind === 'tail' ? -1 : 1, speed: 12 };
    for (let i = 0; i <= 62; i++) {
      const t = i / 20, pose = fallPose(t, motion);
      fallRoot.position.set(0, 0, 0);
      applyFallPose(rider, pose);
      placeAssembly(fallEdge, pose);
      fallModel.update(1 / 20, rider, 'ride', 0);
      clearGround(fallRoot, snow, true);
      if (pose.plant > 0) {
        const targets = pose.hands.map(h => handOnSnow(fallRoot, h, snow));
        pose.hands.forEach((h, k) => { if (h[0] > 0) fallModel.plantHand(targets[k], h[0], k ? 'Right' : 'Left'); });
        clearGround(fallRoot, snow);
        pose.hands.forEach((h, k) => {
          if (h[0] < 1) return;
          const wrist = fallModel.bones[k ? 'RightHand' : 'LeftHand'].bone.getWorldPosition(new THREE.Vector3());
          assert(wrist.distanceTo(targets[k]) < 0.15, `${kind} ${t}s: planted wrist on its snow contact (${wrist.distanceTo(targets[k]).toFixed(3)} m)`);
        });
      }
      // The board stays down: an edge fall never lifts the boots off the snow.
      if (['toe', 'heel', 'slam'].includes(kind)) {
        for (const foot of ['LeftFoot', 'RightFoot']) {
          const f = fallModel.bones[foot].bone.getWorldPosition(new THREE.Vector3());
          assert(f.y - snow.heightAt(f.x, f.z) < 0.4, `${kind} ${t}s: ${foot} ${(f.y - snow.heightAt(f.x, f.z)).toFixed(2)} m off the snow`);
        }
      }
      fallRoot.traverseVisible(o => {
        if (!o.isMesh) return;
        for (let j = 0; j < o.geometry.attributes.position.count; j++) {
          o.getVertexPosition(j, vertex).applyMatrix4(o.matrixWorld);
          assert(vertex.y >= snow.heightAt(vertex.x, vertex.z) + 0.0249, 'posed fall clothing stays above sloped snow');
        }
      });
    }
  }
  for (const [o, position, rotation] of riderPose) { o.position.copy(position); o.rotation.copy(rotation); }
  assert.equal(fallPose(0).phase, 'impact');
  assert.equal(fallPose(1.2).phase, 'settle');
  assert.equal(fallPose(FALL_DURATION, { kind: 'heel' }).hip[0], 0.67);
  assert.deepEqual([{ side: 1 }, { side: -1 }, { reason: 'hard landing' }, { forward: -1 }, { speed: 25 }, { speed: 10 }].map(fallKind),
    ['toe', 'heel', 'slam', 'tail', 'roll', 'nose'], 'falls picked by direction');
  assert(shakePose(0.3).head * shakePose(0.45).head < 0, 'head changes direction during shake');
  assert(Math.abs(shakePose(1.1).head) < 1e-6, 'shake settles to neutral');
  assert(shakePose(1.1).sleeve === 1 && shakePose(1.8).thighs === 1, 'brushes the sleeve, then dusts the thighs');
  assert(shakePose(SHAKE_DURATION).thighs === 0, 'dusting finishes by the end');
  console.log('PASS actual rig impact/slide/get-up contact and diminishing head shake');

  // The swimsuit's clips, as the hot spring plays them: 'act', at a set time.
  const swimGltf = await load('female-rider-swim-v01.glb');
  const swim = new RiderModel(swimGltf, 'female', { outfit: 'swim', fit: model });
  assert.deepEqual(Object.keys(swim.clips).sort(), ['ledge', 'sitDown', 'wade'], 'swimsuit clips found by role');
  function assertClipPose(subject, source, clip, time, label) {
    const expected = clone(source.scene);
    const mixer = new THREE.AnimationMixer(expected);
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play().time = time;
    mixer.update(0);
    assertPose(expected, label, subject);
  }
  const act = (subject, clip, time) => {
    rider.act = { clip, time };
    frames('act', 0, 30, subject);
  };
  const { ledge, sitDown } = swim.clips;
  act(swim, ledge, 1.5);
  assertClipPose(swim, swimGltf, ledge, 1.5, 'act: ledge clip mid-way');
  act(swim, sitDown, sitDown.duration);
  assertClipPose(swim, swimGltf, sitDown, sitDown.duration, 'act: the end of a clip holds its last frame');
  // The ski model plays them too (same skeleton), as it does while the puff covers the change.
  act(model, ledge, 0);
  assertClipPose(model, gltf, ledge, 0, 'act: a swimsuit clip on the ski model');
  frames('walk', 1.4);
  assertAuthoredPose(1.4, 'act -> walking, the clip let go');
  frames('ride', 0);
  assertPose(freshRide.root, 'act -> ride restores all bones');
  // What getting in fits to the pool: the step up, and how low she sits.
  const top = Math.max(...Array.from({ length: 151 }, (_, i) => swim.rise(ledge, (i / 150) * ledge.duration)));
  assert(top > 0.3 && top < 0.6, `ledge clip steps up ${top.toFixed(3)} m`);
  const sat = swim.heightIn(sitDown, sitDown.duration, 'LeftArm'), stood = swim.heightIn(sitDown, 0, 'LeftArm');
  assert(stood - sat > 0.6 && sat > 0.3, `shoulders ${stood.toFixed(2)} m standing, ${sat.toFixed(2)} m sat down`);
  console.log(`PASS fitting: steps up ${top.toFixed(2)} m; shoulders ${stood.toFixed(2)} m standing, ${sat.toFixed(2)} m sat down`);

  // The male rider borrows her walk and run, retargeted to his own bind pose:
  // each limb points the way hers does at the same moment, and the hips lift
  // and dip by the same share of his height.
  const maleGltf = await load('./player.glb');
  const male = new RiderModel(maleGltf, 'male', { borrow: gltf });
  assert.equal(male.canWalk, true, 'male rider must walk with the borrowed clips');
  // The new board grab must make contact on both actual skinned body builds.
  const joints = [rider.hips, rider.torso, rider.head, rider.armL.sh, rider.armL.el, rider.armR.sh, rider.armR.el];
  const savedJoints = joints.map(j => ({ p: j.position.clone(), q: j.quaternion.clone() }));
  const grabPose = new BoardPose().update(0, { air: true, grab: true, speed: 16 });
  rider.hips.position.set(grabPose.px, grabPose.py, grabPose.pz);
  rider.hips.rotation.set(grabPose.pPitch, grabPose.pYaw, grabPose.pRoll);
  rider.torso.rotation.set(grabPose.tPitch, grabPose.tYaw, grabPose.tRoll);
  rider.head.rotation.set(grabPose.hPitch, grabPose.hYaw, grabPose.hRoll);
  rider.boardGrab = { weight: 1, target: new THREE.Vector3(-0.06, 0.15, 0.15) };
  for (const [label, subject] of [['female', model], ['male', male]]) {
    subject.apply(rider);
    subject.root.updateMatrixWorld(true);
    const gap = subject.palmAt('Right', new THREE.Vector3()).distanceTo(rider.boardGrab.target);
    assert(gap < 0.13, `${label} grab palm reaches board edge: ${gap.toFixed(3)} m`);
    console.log(`PASS ${label} snowboard grab: palm within ${(gap*100).toFixed(1)} cm of board edge`);
  }
  delete rider.boardGrab;
  for (const [label, subject] of [['female', model], ['male', male]]) {
    const pose = new BoardPose().update(0,{carve:true,lean:1,snowTouch:true,speed:16});
    const b = subject.build;
    rider.hips.position.set(pose.px, b.leg*pose.legExtension+b.ankle+b.hip[1], pose.pz);
    rider.hips.rotation.set(pose.pPitch,pose.pYaw,pose.pRoll);
    rider.torso.rotation.set(pose.tPitch,pose.tYaw,pose.tRoll);
    const edge = new THREE.Group(), body = new THREE.Group();
    edge.rotation.z = pose.edge; body.rotation.y = Math.PI/2; edge.add(body); body.add(subject.root);
    rider.armL.sh.rotation.set(pose.lPitch,0,pose.lRoll);
    rider.armL.el.rotation.set(pose.lElbow,0,0.1);
    rider.armR.sh.rotation.set(pose.rPitch,0,pose.rRoll);
    rider.armR.el.rotation.set(pose.rElbow,0,-0.1);
    subject.apply(rider); clearGround(edge,{heightAt:()=>0});
    const up = new THREE.Vector3(0,1,0).applyQuaternion(body.getWorldQuaternion(new THREE.Quaternion()));
    const facing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0,0,-1), new THREE.Vector3(), up));
    subject.lookAhead(facing);
    const oriented = subject.bones.Head.bone.getWorldQuaternion(new THREE.Quaternion()).multiply(subject.bones.Head.modelQ.clone().invert());
    assert(new THREE.Vector3(0,1,0).applyQuaternion(oriented).dot(up) > 0.99, `${label} head follows body inclination`);
    const raised = ['RightArm','RightForeArm','RightHand'].map(n=>subject.bones[n].bone.quaternion.clone());
    const front = ['LeftArm','LeftForeArm'].map(n=>subject.bones[n].bone.quaternion.clone());
    const naturalTip = subject.fingerTips.Left.getWorldPosition(new THREE.Vector3());
    assert(naturalTip.y < 0.15, `${label} waist fold brings the naturally bent front hand close to snow: ${naturalTip.y.toFixed(3)}`);
    const wrist = subject.bones.LeftHand.bone.getWorldPosition(new THREE.Vector3());
    const length = subject.fingerTips.Left.getWorldPosition(new THREE.Vector3()).distanceTo(wrist);
    const handQ = subject.bones.LeftHand.bone.quaternion.clone();
    assert.equal(subject.touchSnowTip(wrist.clone().add(new THREE.Vector3(0,-1,0)),new THREE.Vector3(0,1,0),1,'Left'),false, `${label} unreachable snow never pulls the arm down`);
    assert(subject.bones.LeftHand.bone.quaternion.equals(handQ), `${label} unreachable snow leaves the wrist alone`);
    const limitTarget = wrist.clone().add(new THREE.Vector3(0,-length-0.0249,0));
    subject.touchSnowTip(limitTarget,new THREE.Vector3(0,1,0),1,'Left');
    assert(subject.bones.LeftHand.bone.quaternion.clone().normalize().angleTo(handQ.clone().normalize()) < 0.001, `${label} fingertip contact fades in at the reach limit without a wrist snap`);
    subject.bones.LeftHand.bone.quaternion.copy(handQ); subject.root.updateMatrixWorld(true);
    const target = wrist.clone().add(new THREE.Vector3(0,-length,0));
    assert(subject.touchSnowTip(target,new THREE.Vector3(0,1,0),1,'Left'), `${label} reachable snow gets fingertip-only contact`);
    const tip = subject.fingerTips.Left.getWorldPosition(new THREE.Vector3());
    const palm = subject.palmAt('Left',new THREE.Vector3());
    assert(tip.distanceTo(target) < 0.001, `${label} left fingertip brushes its target`);
    assert(palm.y > tip.y + 0.03, `${label} palm remains above fingertips`);
    ['RightArm','RightForeArm','RightHand'].forEach((n,i)=>assert(subject.bones[n].bone.quaternion.equals(raised[i]), `${label} raised right arm is unchanged by contact`));
    ['LeftArm','LeftForeArm'].forEach((n,i)=>assert(subject.bones[n].bone.quaternion.equals(front[i]), `${label} front arm retains its original bend`));
    body.remove(subject.root);
    console.log(`PASS ${label} heel carve: wrist-only fingertip touch, raised palm, natural arm bends and no unreachable ground planting`);
  }

  joints.forEach((j,i) => { j.position.copy(savedJoints[i].p); j.quaternion.copy(savedJoints[i].q); });

  const her = new RiderModel(gltf, 'female');
  const limbs = ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'Spine1'];
  const dirOf = (subject, name) => {
    const bone = subject.root.getObjectByName(`mixamorig${name}`) ?? subject.root.getObjectByName(`mixamorig:${name}`);
    const child = bone.children.find((c) => c.isBone);
    return child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
  };
  for (const speed of [1.4, 4]) {
    for (const subject of [male, her]) { frames('ride', 0, 1, subject); frames('walk', speed, 37, subject); subject.root.updateMatrixWorld(true); }
    let worst = 0;
    for (const name of limbs) worst = Math.max(worst, dirOf(male, name).angleTo(dirOf(her, name)));
    const deg = THREE.MathUtils.radToDeg(worst);
    assert(deg < 12, `male limbs follow hers at ${speed} m/s (worst ${deg.toFixed(1)}°)`);
    console.log(`PASS male walks at ${speed} m/s: limbs within ${deg.toFixed(1)}° of hers`);
  }

  // On skis the hands close round the poles: the fingers curl one way round
  // the fist, from the knuckles, and the thumb the other way, from the heel of
  // the hand, until its tip is round the far side from the palm.
  for (const [label, subject] of [['female', her], ['male', male]]) {
    const skier = { ...rider, skiing: true };
    for (let i = 0; i < 30; i++) subject.update(1 / 60, skier, 'ride', 0); // past the fade from walking
    subject.root.updateMatrixWorld(true);
    for (const side of ['Left', 'Right']) {
      const at = (name) => (subject.root.getObjectByName(`mixamorig${side}Hand${name}`) ?? subject.root.getObjectByName(`mixamorig:${side}Hand${name}`)).getWorldPosition(new THREE.Vector3());
      const palm = subject.palmAt(side, new THREE.Vector3()), hole = palm.clone().lerp(at('Middle2'), 0.5);
      const middle = subject.fingers.find((f) => f.bone.name.endsWith(`${side}HandMiddle1`));
      const axis = middle.axis.clone().applyQuaternion(middle.bone.getWorldQuaternion(new THREE.Quaternion()));
      const flat = (p) => { const v = p.sub(hole); return v.addScaledVector(axis, -v.dot(axis)); };
      const toPalm = flat(palm.clone());
      const round = (name) => { const v = flat(at(name)); return THREE.MathUtils.radToDeg(Math.atan2(toPalm.clone().cross(v).dot(axis), toPalm.dot(v))); };
      const knuckle = round('Index1'), thumbMid = round('Thumb2'), thumbTip = round('Thumb4');
      assert(knuckle > 30 && thumbMid < -30, `${label} ${side}: thumb (${thumbMid.toFixed(0)}°) comes round the other way from the fingers (${knuckle.toFixed(0)}°)`);
      assert(thumbTip < -130, `${label} ${side}: thumb tip round the far side (${thumbTip.toFixed(0)}°)`);
      console.log(`PASS ${label} ${side} ski grip: fingers from ${knuckle.toFixed(0)}°, thumb tip at ${thumbTip.toFixed(0)}° round the fist`);
    }
  }
  // The real Mixamo pitching asset drives both riders and gives control back
  // to the walk mixer; on the board, the original pose must remain unchanged.
  const pitching = await load('motions/baseball-pitching-v01/baseball-pitching-v01.glb');
  for (const [id, asset] of [['female', gltf], ['male', maleGltf]]) {
    const subject = new RiderModel(asset, id, { pitching, borrow: id === 'male' ? gltf : null });
    assert(subject.pitching.clip.tracks.length > 50, `${id}: pitching tracks retargeted`);
    const state = { ...rider, throwT: null, throwUsesPitch: true };
    for (let i = 0; i < 30; i++) subject.update(1 / 60, state, 'walk', 0);
    const shoulder = subject.bones.RightArm.bone;
    const idle = shoulder.quaternion.clone();
    state.throwT = 1.5; subject.update(1 / 60, state, 'walk', 0);
    assert(shoulder.quaternion.angleTo(idle) > 0.3, `${id}: throw changes the right arm`);
    state.throwT = null; subject.update(1 / 60, state, 'walk', 0);
    assert(shoulder.quaternion.angleTo(idle) < 0.01, `${id}: walk pose restored`);
    const original = new RiderModel(asset, id, { borrow: id === 'male' ? gltf : null });
    state.throwT = 0.4;
    subject.update(1, state, 'ride', 0); original.update(1, state, 'ride', 0);
    for (const { bone } of subject.rest) {
      const oldBone = original.root.getObjectByName(bone.name);
      assert(bone.quaternion.clone().normalize().angleTo(oldBone.quaternion.clone().normalize()) < 1e-5, `${id}: board pose unchanged for ${bone.name}`);
    }
    console.log(`PASS ${id} pitching: walk retarget, recovery, unchanged board pose`);
  }
  const swimPitch = new RiderModel(swimGltf, 'female', { outfit: 'swim', fit: model, pitching });
  assert(swimPitch.pitching.clip.tracks.length > 50, 'swimsuit: pitching tracks retargeted');
  console.log('PASS swimsuit pitching tracks retargeted');
} finally {
  await server.close();
}
