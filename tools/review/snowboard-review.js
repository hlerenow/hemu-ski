import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Rider } from '../../src/player/rider.js';
const renderer = new THREE.WebGLRenderer({canvas:document.getElementById('view'),antialias:true});
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e7efec');
scene.add(new THREE.HemisphereLight(0xffffff,0x7d9691,2));
const sun = new THREE.DirectionalLight(0xffffff,2); sun.position.set(-3,7,4); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshLambertMaterial({color:0xfbfaf5})); ground.rotation.x=-Math.PI/2;ground.position.y=-0.06;scene.add(ground);
scene.add(new THREE.GridHelper(40,40,0xc2cfcc,0xdce4e0));
const camera = new THREE.PerspectiveCamera(40,1,0.03,200); camera.position.set(3.1,2.2,-3.5);
const orbit = new OrbitControls(camera,renderer.domElement); orbit.target.set(0,0.8,0); orbit.enableDamping=true;
const rider = new Rider();scene.add(rider.root);
const options = {
  glide:['直立滑行',{}], edge:['正常换刃',{lean:-1,twist:-0.5}], toe:['前刃反弓刻滑',{lean:-1,twist:-0.5,carve:true}], heel:['后刃刻滑摸雪',{lean:1,twist:0.5,carve:true,snowTouch:true}],
  tuck:['俯身加速',{tuck:true}], charge:['蓄力起跳',{charge:1}], air:['收腿平跳',{air:true}], grab:['空中抓板',{air:true,grab:true}], landing:['落地缓冲',{landing:0.6}],
};
let pose = new URLSearchParams(location.search).get('pose') || 'glide';
if(pose==='touch'){
  pose='heel';
  const url=new URL(location.href);url.searchParams.set('pose',pose);history.replaceState(null,'',url);
}
if(!options[pose])pose='glide';
function selectPose(key){pose=key;document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===pose)));}
for(const [key,[label]] of Object.entries(options)){const b=document.createElement('button');b.textContent=label;b.dataset.pose=key;b.onclick=()=>{selectPose(key);const url=new URL(location.href);url.searchParams.set('pose',key);history.replaceState(null,'',url);};document.getElementById('presets').append(b);} selectPose(pose);
async function selectRider(id){document.getElementById('status').textContent='正在加载模型…';try{await rider.selectModel(id);document.getElementById('status').textContent='模型就绪；姿态实时过渡。';}catch(e){document.getElementById('status').textContent='模型加载失败：'+e.message;}}
document.getElementById('rider').onchange=e=>selectRider(e.target.value);selectRider('male');
function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),0.05);const state=options[pose][1];rider.update(dt,{crouch:0.35,lean:0,twist:0,speed:16,...state});rider.root.position.y=state.air?0.9:0;rider.clearGround({heightAt:()=>0});orbit.update();renderer.render(scene,camera);});
