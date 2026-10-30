import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Rider } from '../../src/player/rider.js';
import { retarget } from '../../src/player/rider-model.js';
const names=['booty-hip-hop-dance','macarena-dance','breakdance-freezes','moonwalk','golf-drive','gunplay','fireball','roundhouse-kick','guitar-playing','kneeling-down'];
const select=document.querySelector('#action'); for(const n of names) select.add(new Option(n,n));
const scene=new THREE.Scene(); scene.background=new THREE.Color('#e5eef1');
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); document.body.append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(35,1,.01,100); const light=new THREE.HemisphereLight(0xffffff,0x829ba7,2);scene.add(light);const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(3,5,5);scene.add(sun);scene.add(new THREE.GridHelper(8,32,0x9daeb6,0xd4dfe2));
const riders=[new Rider(),new Rider()]; riders.forEach((r,i)=>{scene.add(r.root);r.root.position.x=(i?1:-1)*.85;});
let clips=[], duration=1, fraction=.3, playing=false, generation=0;
const input=document.querySelector('#frame'), status=document.querySelector('#status');
async function load(){const g=++generation; status.textContent='Loading…'; await Promise.all(riders.map(r=>r.selectModel(document.querySelector('#rider').value))); if(g!==generation)return; for(const r of riders){r.setLocomotion('walk'); for(let i=0;i<60;i++)r.update(1/60,{crouch:0,lean:0,twist:0,air:false,speed:2,locomotion:'walk'});}
const source=await new GLTFLoader().loadAsync(`/models/motions/special-actions-v01/${select.value}.glb`);if(g!==generation)return;
clips=riders.map((r,i)=>retarget(source.animations[0],source.scene,i?r.model.bindScene:r.model.animationScene)); duration=clips[0].duration; riders.forEach((r,i)=>{r.play(clips[i],fraction*duration);r.update(.3,{crouch:0,lean:0,twist:0,air:false,speed:0,locomotion:'act'});}); renderer.render(scene,camera); status.textContent=`${select.value} · ${duration.toFixed(2)} seconds`;}
select.onchange=load; document.querySelector('#rider').onchange=load; input.oninput=()=>{playing=false;fraction=Number(input.value)/100};document.querySelector('#play').onclick=()=>{playing=!playing};
function view(side=false){camera.position.set(side?5:0,1.25,side?0:-5.5);camera.lookAt(0,.9,0)}view();document.querySelector('#front').onclick=()=>view();document.querySelector('#side').onclick=()=>view(true);
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}window.addEventListener('resize',resize);resize();await load();let prev=performance.now();function frame(now){const dt=Math.min((now-prev)/1000,.05);prev=now;if(playing){fraction=(fraction+dt/duration)%1;input.value=fraction*100}riders.forEach((r,i)=>{if(!clips[i])return;r.play(clips[i],fraction*duration);r.update(dt,{crouch:0,lean:0,twist:0,air:false,speed:0,locomotion:'act'});});renderer.render(scene,camera);requestAnimationFrame(frame)}requestAnimationFrame(frame);
