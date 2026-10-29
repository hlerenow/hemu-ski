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

  // Use the same scaled, grip-centred mesh and rider placement as the actual
  // lift. Sample lines across the skis' width and thickness over a full cycle.
  const chairGltf=await load('public/models/lifts/chair.glb');
  chairGltf.scene.updateMatrixWorld(true); let mesh;
  chairGltf.scene.traverse(o=>{if(o.isMesh&&!mesh)mesh=o;});
  const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox(); const {min,max}=geometry.boundingBox;
  const scale=3/(max.y-min.y),cut=(max.y-(max.y-min.y)*.05)*scale;
  geometry.scale(scale,scale,scale);
  const lo=new THREE.Vector3(Infinity,Infinity,Infinity),hi=lo.clone().negate(),v=new THREE.Vector3(),pos=geometry.attributes.position;
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i);if(v.y>=cut){lo.min(v);hi.max(v);}}
  geometry.translate(-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-(lo.z+hi.z)/2);
  const chairMesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  const scene=new THREE.Group();scene.add(chairMesh,rider.root);rider.root.position.set(.55,-2.25,.08);rider.root.rotation.y=Math.PI;rider.body.rotation.y=Math.PI;
  rider.model.chair.action.reset().play();rider.update(0,state);
  const ray=new THREE.Raycaster();
  for(let frame=0;frame<120;frame++){
    rider.update(chair.animations[0].duration*2/120,state);scene.updateMatrixWorld(true);
    for(const ski of rider.skis)for(const x of [-.05,0,.05])for(const y of [-.035,-.015,.005]){
      const start=ski.localToWorld(new THREE.Vector3(x,y,-.68)),end=ski.localToWorld(new THREE.Vector3(x,y,.68));
      const d=end.clone().sub(start);ray.set(start,d.clone().normalize());ray.far=d.length();
      assert.equal(ray.intersectObject(chairMesh).length,0,`ski crosses chair at sampled frame ${frame}`);
    }
  }
  console.log('PASS sampled ski clearance against actual chair mesh through the full loop');
  rider.setGear('board');rider.update(1/60,state);assert.equal(rider.model.chairActive,false,'snowboard keeps existing sit');
  rider.setGear('ski');seat.chairAnimation=false;rider.update(1/60,state);assert.equal(rider.model.chairActive,false,'other seats keep existing sit');
  rider.setLocomotion('ride');for(let i=0;i<30;i++)rider.update(1/60,state);assert.equal(rider.model.chairActive,false,'leaving chair stops animation');
  console.log('PASS chair sitting asset, ski motion, scope and exit');
} finally {await server.close();}
