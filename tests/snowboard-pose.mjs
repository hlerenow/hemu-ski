import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
import { BoardPose } from '../src/player/rider-board-pose.js';
import { firstPersonTarget } from '../src/player/ride-camera.js';

const idle = { speed: 14, lean: 0, twist: 0, crouch: 0.35 };
const pose = s => new BoardPose().update(0, { ...idle, ...s });
const standing = pose({}), tuck = pose({ tuck: true });
assert(tuck.py < standing.py - 0.12 && tuck.tPitch > standing.tPitch + 0.4, 'tuck clearly lowers and folds the torso');
const left = pose({ lean: 0.8, carve: true }), right = pose({ lean: -0.8, carve: true });
assert(left.edge > 0.7 && right.edge < -0.7, 'heel and toe edges carve both ways');
assert(left.pz < 0 && right.pz > 0, 'toe/heel turns shift the hips in opposite directions');
assert(pose({ air: true, lean: 1 }).edge === 0, 'neutral air levels the board');
assert(pose({ air: true, grab: true }).py < pose({ air: true }).py - 0.08, 'grab compresses legs separately from a flip');
const ordinary = pose({lean:-1}), snow = pose({lean:-1,carve:true,snowTouch:true}), back = pose({lean:1,carve:true});
assert(Math.abs(ordinary.edge) <= 0.35 && ordinary.touch === 0, 'normal edge changes never deep-carve or touch without Shift');
assert(snow.edge < -1.2 && back.edge > 0.9 && back.edge < 1.15, 'heel edge stays inclined without laying the whole body down');
assert(snow.py > 0.72 && back.py > 0.72 && snow.tPitch < 0.12 && back.tPitch > 0.15, 'toe arches back while heel contact inclines the torso');
assert(snow.touch === 0 && back.touch > 0.9, 'only heel carving requests snow contact');
assert(snow.tPitch < -0.1 && snow.pPitch < 0, 'toe carve extends and arches back instead of folding forward');
assert(back.rRoll < -1 && Math.abs(back.rElbow) < 0.8 && back.tRoll < 0, 'heel contact opens the relaxed right arm and lowers the left shoulder');
assert(pose({lean:1,carve:true,air:true}).touch === 0, 'snow contact is disabled in flight');
const switchEdge = new BoardPose(); switchEdge.update(0,{...idle,lean:1,carve:true});
for (let i = 0; i < 60; i++) {
  const x = switchEdge.update(1/60,{...idle,lean:-1,carve:true});
  if (x.edge <= 0) assert.equal(x.touch,0,'snow contact is released before the toe edge is loaded');
}
for (const fps of [30,60,144]) for (const from of [-1,1]) {
  const p = new BoardPose();
  let previous = {...p.update(0,{...idle,lean:from,carve:true})};
  let peak = 0;
  for (let i = 0; i < fps * 2; i++) {
    // Include repeated reversals before the previous pose has settled.
    const lean = (Math.floor(i / (fps / 4)) % 2 ? from : -from);
    const x = p.update(1/fps,{...idle,lean,carve:true});
    for (const key of ['pPitch','tPitch','tRoll','lPitch','lRoll','lElbow','rPitch','rRoll','rElbow']) {
      peak = Math.max(peak,Math.abs(x[key]-previous[key])*fps);
      assert(Math.abs(x[key]-previous[key]) < 12/fps, `${key} cannot snap when changing edges at ${fps} fps`);
    }
    previous = {...x};
  }
  console.log(`PASS ${fps} fps carve reversals from ${from}: peak pose speed ${peak.toFixed(2)} rad/s`);
}
const transition = fps => {
  const p = new BoardPose(); p.update(0, idle);
  for (let i=0; i<fps; i++) p.update(1/fps, { ...idle, lean: 0.8, carve: true, tuck: true });
  return { ...p.x };
};
for (const key of Object.keys(transition(30))) assert(Math.abs(transition(30)[key]-transition(144)[key]) < 1e-8, `frame independent ${key}`);
const pos = new THREE.Vector3(), look = new THREE.Vector3();
firstPersonTarget({position: new THREE.Vector3(10, 20, 30), forward: new THREE.Vector3(0,0,-1), crouch: 1, pitch: 0.5}, pos, look);
assert(pos.y > 21.1 && pos.y < 21.3 && look.y < pos.y, 'forehead camera height follows crouch and looks down');
assert(Math.abs(look.x-pos.x) < 1e-8 && look.z < pos.z, 'first person looks along travel');
const socket = new THREE.Vector3(2, 0.6, -1);
firstPersonTarget({eye: socket, forward: new THREE.Vector3(0,0,-1)}, pos, look);
assert(pos.equals(socket), 'first person uses the actual head socket even during low carves');
assert(look.y < pos.y && look.z < pos.z, 'default view includes the slope and board below the horizon');
const flatGaze = look.clone().sub(pos).normalize();
firstPersonTarget({eye: socket, forward: new THREE.Vector3(0,0,-1), normal: new THREE.Vector3(0,1,-0.5).normalize()}, pos, look);
assert(pos.equals(socket) && look.clone().sub(pos).normalize().y < flatGaze.y, 'downhill gaze follows the slope without moving the head mount');

// Exercise the actual articulated rider, not just its pose targets. Canvas
// painting is irrelevant to joint transforms, so leave it out in Node.
const originalDocument = globalThis.document;
globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})};
const server = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
try {
  const {Rider} = await server.ssrLoadModule('/src/player/rider.js');
  const rider = new Rider();
  rider.update(0,idle);
  const uprightEye = rider.eyePosition(new THREE.Vector3());
  for (let i = 0; i < 90; i++) rider.update(1/60,{...idle,tuck:true});
  const lowEye = rider.eyePosition(new THREE.Vector3());
  assert(lowEye.y < uprightEye.y - 0.1, 'eye is attached to the posed head rather than a fixed world height');
  rider.firstPersonBody(true);
  assert(!rider.head.visible && rider.classic.visible, 'first person hides the head while retaining arms/body');
  rider.firstPersonBody(false);
  const fixed = rider.feet.map(f=>f.position.clone());
  for (const state of [{}, {tuck:true}, {lean:1,twist:0.5,carve:true}, {lean:-1,twist:-0.5,carve:true,snowTouch:true}, {charge:1}, {air:true}, {air:true,grab:true}, {landing:0.6}]) {
    for (let i=0;i<90;i++) rider.update(1/60,{...idle,...state});
    rider.root.updateMatrixWorld(true);
    rider.feet.forEach((f,i)=>assert(f.position.distanceTo(fixed[i]) < 1e-9, 'boots remain fixed to the bindings'));
    rider.root.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite), 'all joint transforms stay finite'));
  }
  for(let i=0;i<120;i++) rider.update(1/60,{...idle,lean:1,twist:0.5,carve:true,snowTouch:true});
  const front = [rider.armL.sh.quaternion.clone(), rider.armL.el.quaternion.clone()];
  const raised = [rider.armR.sh.quaternion.clone(), rider.armR.el.quaternion.clone()];
  rider.root.position.set(0,0,0);
  rider.clearGround({heightAt:()=>0});
  [rider.armR.sh,rider.armR.el].forEach((j,i)=>assert(j.quaternion.equals(raised[i]), 'right arm is unchanged by left snow contact'));
  [rider.armL.sh,rider.armL.el].forEach((j,i)=>assert(j.quaternion.equals(front[i]), 'front arm keeps its natural bend instead of reaching down'));
  const gaze = new THREE.Vector3(0,0,1).applyQuaternion(rider.head.getWorldQuaternion(new THREE.Quaternion()));
  assert(gaze.dot(new THREE.Vector3(0,0,-1)) > 0.99, 'head looks forward');
  const headUp = new THREE.Vector3(0,1,0).applyQuaternion(rider.head.getWorldQuaternion(new THREE.Quaternion()));
  const spineUp = new THREE.Vector3(0,1,0).applyQuaternion(rider.torso.getWorldQuaternion(new THREE.Quaternion()));
  assert(spineUp.y > 0.35 && rider.torso.rotation.x > rider.hips.rotation.x + 0.5, 'heel carve folds deeply at the waist while keeping the torso above the snow');
  spineUp.addScaledVector(gaze,-spineUp.dot(gaze)).normalize();
  assert(headUp.dot(spineUp) > 0.98, 'head keeps the spine inclination while looking along travel');
  console.log('PASS Shift-only tall toe/heel carves, left-hand heel contact, raised right arm and forward gaze');
  console.log('PASS snowboard upright/tuck, heel/toe carve, neutral air, grab, landing, fixed bindings and first-person targets');
} finally { globalThis.document = originalDocument; await server.close(); }
