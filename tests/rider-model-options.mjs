// Builds each rider the way Rider.selectModel does, with the clips it doesn't
// load passed as null or false, so a missing clip can't stop a rider loading
// (issue #3: `chair: false` threw and left the male rider as classic).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

const server = await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try {
  const {RiderModel, RIDER_MODELS} = await server.ssrLoadModule('/src/player/rider-model.js');
  async function load(path) {
    const b = await readFile(path); const n = b.readUInt32LE(12); const json = JSON.parse(b.subarray(20,20+n));
    json.materials=(json.materials||[]).map(()=>({pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
    delete json.textures; delete json.images; delete json.samplers;
    const data=Buffer.from(JSON.stringify(json)); const padded=Buffer.concat([data,Buffer.alloc((4-data.length%4)%4,32)]); const tail=b.subarray(20+n); const head=Buffer.alloc(20);
    head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(20+padded.length+tail.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
    const out=Buffer.concat([head,padded,tail]); return new GLTFLoader().parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),'');
  }
  globalThis.document={createElement:()=>({getContext:()=>new Proxy({}, {get:(o,k)=>o[k] ?? (()=>{}),set:(o,k,v)=>(o[k]=v,true)})})};
  const female=await load('public/models/'+RIDER_MODELS.female.file);
  const male=await load('public/models/'+RIDER_MODELS.male.file);
  for (const missing of [null, undefined, false]) {
    const model=new RiderModel(male,'male',{borrow:female,pitching:missing,idle:missing,chair:missing});
    assert.equal(model.chair,null); assert(model.walk,'male borrows the female walk');
    new RiderModel(female,'female',{borrow:missing,pitching:missing,idle:missing,chair:missing});
  }
  console.log('Rider model options: every rider builds with absent clips');
} finally { await server.close(); }
