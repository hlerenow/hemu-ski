import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {makeActionLoop} from '../src/player/action-loop.js';
const root=fileURLToPath(new URL('../',import.meta.url));
async function load(path) {const src=await readFile(`${root}/public/models/${path}`);const n=src.readUInt32LE(12),j=JSON.parse(src.subarray(20,20+n));j.materials=(j.materials||[]).map(()=>({}));const b=Buffer.from(JSON.stringify(j));const p=Buffer.concat([b,Buffer.alloc((4-b.length%4)%4,32)]), tail=src.subarray(20+n), h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+p.length+tail.length,8);h.writeUInt32LE(p.length,12);h.writeUInt32LE(0x4e4f534a,16);const out=Buffer.concat([h,p,tail]);return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');}
const server=await createServer({root,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});const {retarget}=await server.ssrLoadModule('/src/player/rider-model.js');
for (const path of ['female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb','player.glb']) {
 const target=await load(path); let skin=0,verts=0,bad=0;target.scene.traverse(o=>{if(!o.isSkinnedMesh)return;skin++;const a=o.geometry.attributes.skinWeight;for(let i=0;i<a.count;i++){verts++;const sum=a.getX(i)+a.getY(i)+a.getZ(i)+a.getW(i);if(Math.abs(sum-1)>0.01)bad++;}});assert(skin && verts && bad === 0, `${path}: missing skin or invalid weight sums`); console.log(path,'skinned meshes',skin,'vertices',verts,'non-normalized',bad);
 for (const file of (await readdir(`${root}/public/models/motions/special-actions-v01`)).filter(x=>x.endsWith('.glb'))) {
  const source=await load(`motions/special-actions-v01/${file}`), bindS=source.scene, bindT=target.scene;bindS.updateMatrixWorld(true);bindT.updateMatrixWorld(true);
  const names=['mixamorigLeftArm','mixamorigLeftForeArm','mixamorigRightArm','mixamorigRightForeArm'];
  const sb=names.map(n=>bindS.getObjectByName(n).getWorldQuaternion(new THREE.Quaternion()));const tb=names.map(n=>bindT.getObjectByName(n).getWorldQuaternion(new THREE.Quaternion()));
  const clip=retarget(source.animations[0],bindS,bindT), sm=new THREE.AnimationMixer(bindS),tm=new THREE.AnimationMixer(bindT);sm.clipAction(source.animations[0]).play();tm.clipAction(clip).play();let max=0;
  for(const t of [0,0.25,0.5,0.75,0.99]){sm.setTime(source.animations[0].duration*t);tm.setTime(clip.duration*t);bindS.updateMatrixWorld(true);bindT.updateMatrixWorld(true);names.forEach((n,i)=>{const s=bindS.getObjectByName(n).getWorldQuaternion(new THREE.Quaternion());const actual=bindT.getObjectByName(n).getWorldQuaternion(new THREE.Quaternion());const expected=s.multiply(sb[i].clone().invert()).multiply(tb[i]);max=Math.max(max,actual.angleTo(expected));});} assert(max < THREE.MathUtils.degToRad(0.1), `${path} ${file}: arm orientation drift`); assert.equal(clip.tracks.length,66); const loop=makeActionLoop(clip); assert(loop.duration > clip.duration); for(const track of loop.tracks){ const n=track.getValueSize(); assert.equal(track.times.at(-1),Math.fround(loop.duration)); for(let i=0;i<n;i++) assert.equal(track.values[i],track.values[track.values.length-n+i]); } sm.stopAllAction();tm.stopAllAction();console.log(file,'max arm orientation error deg',THREE.MathUtils.radToDeg(max).toFixed(4),'tracks',clip.tracks.length);
 }
}
await server.close();
