// Exercise the real entry-point handlers: pose module tests alone missed a
// merge which left all modules intact but disconnected them from the game.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from 'three';
import { firstPersonTarget } from '../src/player/ride-camera.js';
import { installFirstPersonMask, patchFirstPersonMaterial } from '../src/render/first-person-mask.js';
import { InkPost } from '../src/render/post.js';

const source = await readFile(new URL('../src/main.js',import.meta.url),'utf8');
function handler(name) {
  const match = source.match(new RegExp(`^function ${name}\\([^\\n]*\\n[\\s\\S]*?^}`, 'm'));
  assert(match, `entry point still defines ${name}`);
  return match[0];
}
const keys = new Set(), input = {}, touchState = {steer:0,up:false,down:false,big:false,alt:false,low:false,full:false};
const controls = vm.createContext({THREE, keys, input, pedals:{}, touch:{read:()=>touchState}, specialAction:null, rider:{throwT:null,locomotion:'ride'}});
vm.runInContext(handler('readInput'),controls);
keys.add('ShiftLeft'); keys.add('ArrowLeft'); keys.add('KeyX');
controls.readInput();
assert.equal(input.carve,true); assert.equal(input.grab,true); assert.equal(input.flip,true); assert.equal(input.steer,1);
keys.clear(); controls.readInput(); assert.equal(input.carve,false); assert.equal(input.flip,false);
touchState.low=true; controls.readInput(); assert.equal(input.carve,true); assert.equal(input.grab,true);
console.log('PASS game input routes Shift, arrows, X and touch holds into the ride controls');

let snapped=0;
const view = vm.createContext({URL,firstPerson:false,state:'ride',specialAction:null,pendingAction:null,
  location:{href:'http://localhost:5190/?map=koktokay'},history:{replaceState:(a,b,url)=>{view.location.href=String(url);}},
  viewButton:{setAttribute:(name,value)=>{view.viewButton[name]=value;}},
  mouseLook:{on:false,set:()=>{},reset:()=>{}},snapCamera:()=>{snapped++;}});
vm.runInContext(['updateViewButton','toggleView','act'].map(handler).join('\n'),view);
view.act('KeyV'); assert.equal(view.firstPerson,true); assert.equal(view.mouseLook.force,true);
assert.equal(new URL(view.location.href).searchParams.get('view'),'first'); assert.equal(view.viewButton['aria-pressed'],'true');
view.act('KeyV',true); assert.equal(view.firstPerson,true,'holding V must not toggle repeatedly');
view.act('KeyV'); assert.equal(view.firstPerson,false); assert.equal(snapped,2);
console.log('PASS V toggles the actual view handler, URL, UI and camera force');

let posed;
const physics = {grounded:true,normal:new THREE.Vector3(0,1,0),pos:new THREE.Vector3(),speed:16,yawRate:0.5,
  jumpCharge:0,flip:0,flipTarget:0,crashed:0,landingRecovery:0,shakeOff:0,slip:0,forward:out=>out.set(0,0,-1)};
const rider = {root:new THREE.Group(),pose:{},locomotion:'ride',gear:'board',boardPose:{x:{deep:0}},snowTouch:{weight:0},update:(dt,state)=>{posed=state;}};
const posing = vm.createContext({THREE,phys:physics,rider,input:{carve:true,grab:true},specialAction:null,petT:0,hop:null,sink:0,G:9.81,FALL_DURATION:5,SHAKE_DURATION:1,state:'ride',
  _m:new THREE.Matrix4(),_q:new THREE.Quaternion(),_f:new THREE.Vector3(),_x:new THREE.Vector3(),_up:new THREE.Vector3(),_w:new THREE.Vector3()});
vm.runInContext(handler('poseRider'),posing); posing.poseRider(1/60);
assert.equal(posed.carve,true); assert.equal(posed.grab,false);
physics.grounded=false; posing.poseRider(1/60); assert.equal(posed.carve,false); assert.equal(posed.grab,true);
console.log('PASS game passes carving and airborne grabs into the actual rider pose');

const eye = new THREE.Vector3(0.1,1.7,-0.2), camera = new THREE.PerspectiveCamera();
const cameraContext = vm.createContext({THREE,camera,camLook:new THREE.Vector3(),firstPersonTarget,firstPerson:true,state:'ride',phys:physics,
  rider:{locomotion:'ride',eyePosition:out=>out.copy(eye)},eye:new THREE.Vector3(),camDir:new THREE.Vector3(0,0,-1),
  mouseLook:{yaw:0,pitch:0,take:()=>{}},detail:{heightAt:()=>0},indoors:0,roomAt:()=>0,_v:new THREE.Vector3()});
physics.vel=new THREE.Vector3(0,0,-16);
vm.runInContext(handler('cameraTarget')+'\n'+handler('updateRideCamera'),cameraContext);
cameraContext.updateRideCamera(1/60);
assert(camera.position.distanceTo(eye)<1e-9); assert(camera.fov>=96); assert(camera.near<0.1);
console.log('PASS first-person camera uses the forehead anchor and wide lens in the real game loop');

// The same cutout must be present in the lit/depth and outline normal passes.
const root = new THREE.Group(), head = new THREE.Group(); root.add(head);
const original = new THREE.MeshLambertMaterial();
const headMesh = new THREE.Mesh(new THREE.BoxGeometry(),original), arm = new THREE.Mesh(new THREE.BoxGeometry(),original);
head.add(headMesh); root.add(arm);
const mask = installFirstPersonMask(root,head);
const npc = new THREE.Group(), npcHead=new THREE.Group(); npc.add(npcHead);
npcHead.add(new THREE.Mesh(new THREE.BoxGeometry(),original));
const other = installFirstPersonMask(npc,npcHead);
assert.notEqual(mask.id,other.id); assert.notEqual(arm.material,original);
assert.equal(headMesh.geometry.attributes.aHeadWeight.getX(0),1); assert.equal(arm.geometry.attributes.aHeadWeight.getX(0),0);
for(const [material,shaderName] of [[arm.material,'lambert'],[new THREE.MeshNormalMaterial(),'normal']]) {
  if(shaderName==='normal') patchFirstPersonMaterial(material,mask);
  const lib=THREE.ShaderLib[shaderName], shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uFirstPersonId,mask);
  assert(shader.fragmentShader.includes('length(vFirstPersonView) < 0.24'));
  assert(shader.fragmentShader.includes('abs(vFirstPersonId - uFirstPersonId)'));
}
let normalId;
const renderer={shadowMap:{autoUpdate:true},setRenderTarget:()=>{},setClearColor:()=>{},getClearColor:out=>out.set(0),getClearAlpha:()=>1,clear:()=>{},render:scene=>{if(scene.overrideMaterial)normalId=post.firstPersonId.value;}};
const post=new InkPost(renderer); post.render(new THREE.Scene(),camera,0,[],mask.id);
assert.equal(normalId,mask.id); post.render(new THREE.Scene(),camera,0); assert.equal(normalId,0);
console.log('PASS player-only camera clearance and matching color/depth/normal masks; NPCs remain independent');
