// Run: npm test (node tests/rider-animation.mjs)
// Uses the actual female GLB rigs/clips (ski gear and swimsuit); omits only texture material references
// so the regression runs in Node without browser image loaders or a WebGL context.
import assert from 'node:assert/strict';
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
    const source = await readFile(new URL(`../public/models/female-rider/${file}`, import.meta.url));
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
} finally {
  await server.close();
}
