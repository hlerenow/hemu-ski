import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const server = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try {
  const {RiderModel} = await server.ssrLoadModule('/src/player/rider-model.js');
  const {Rider} = await server.ssrLoadModule('/src/player/rider.js');
  async function load(path) {
    const b = await readFile(path); const n = b.readUInt32LE(12); const json = JSON.parse(b.subarray(20,20+n));
    json.materials=(json.materials||[]).map(()=>({pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
    const data=Buffer.from(JSON.stringify(json)); const padded=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,32)]); const tail=b.subarray(20+n); const head=Buffer.alloc(20);
    head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(20+padded.length+tail.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
    const out=Buffer.concat([head,padded,tail]); return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
  }
  const gltf=await load('public/models/female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb');
  const chair=await load('public/models/motions/chairlift-sitting-v01/chairlift-sitting-v01.glb');
  assert.equal(chair.animations.length,1);assert(Math.abs(chair.animations[0].duration-47/30)<1e-4);
  globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:(o,k)=>o[k] ?? (()=>{}),set:(o,k,v)=>(o[k]=v,true)})})};
  const rider=new Rider(); rider.model=new RiderModel(gltf,'female',{chair});rider.base=rider.model;rider.modelId='female';rider.body.add(rider.model.root);
  const seat={hips:new THREE.Vector3(),feet:[new THREE.Vector3(.18,-.48,.48),new THREE.Vector3(-.18,-.48,.48)],grips:[new THREE.Vector3(.35,.18,.22),new THREE.Vector3(-.35,.18,.22)],fold:.05,kneeOut:.12,lift:true,chairAnimation:true};
  const state={crouch:0,lean:0,twist:0,air:false,speed:0};
  rider.setGear('ski');rider.setLocomotion('sit',seat);
  for(let i=0;i<40;i++) rider.update(1/60,state);
  assert.equal(rider.model.chairActive,true); const a=rider.feet.map(f=>f.position.clone());
  for(let i=0;i<35;i++) rider.update(1/60,state);
  assert(a.some((p,i)=>p.distanceTo(rider.feet[i].position)>.025),'feet and attached skis follow kick');
  assert(rider.model.bones.Hips.bone.position.distanceTo(rider.model.bones.Hips.p)>0.01,'hips use seat anchor');
  rider.setGear('board');rider.update(1/60,state);assert.equal(rider.model.chairActive,false,'snowboard keeps existing sit');
  rider.setGear('ski');seat.chairAnimation=false;rider.update(1/60,state);assert.equal(rider.model.chairActive,false,'other seats keep existing sit');
  rider.setLocomotion('ride');for(let i=0;i<30;i++)rider.update(1/60,state);assert.equal(rider.model.chairActive,false,'leaving chair stops animation');
  console.log('PASS chair sitting asset, ski motion, scope and exit');
} finally {await server.close();}
