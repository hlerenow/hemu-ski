import * as THREE from 'three';

let nextId = 1;
const CLEARANCE = 0.24;

// Use exactly the same cutout in color/depth and the outline's normal pass.
// IDs keep the cutout local to the player rather than masking nearby NPCs.
export function patchFirstPersonMaterial(material, activeId) {
  activeId.rear ||= { value: 0 };
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.defaultAttributeValues = {
    ...material.defaultAttributeValues, aHeadWeight: [0], aFirstPersonBody: [0], aFirstPersonId: [0],
  };
  material.onBeforeCompile = shader => {
    compile.call(material, shader);
    shader.uniforms.uFirstPersonId = activeId;
    shader.uniforms.uFirstPersonRear = activeId.rear;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aHeadWeight;
attribute float aFirstPersonBody;
attribute float aFirstPersonId;
varying float vHeadWeight;
varying float vFirstPersonBody;
varying float vFirstPersonId;
varying vec3 vFirstPersonView;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHeadWeight = aHeadWeight;
vFirstPersonBody = aFirstPersonBody;
vFirstPersonId = aFirstPersonId;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vFirstPersonView = mvPosition.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uFirstPersonId;
uniform float uFirstPersonRear;
varying float vHeadWeight;
varying float vFirstPersonBody;
varying float vFirstPersonId;
varying vec3 vFirstPersonView;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (uFirstPersonId > 0.5 && abs(vFirstPersonId - uFirstPersonId) < 0.25) {
  if (vHeadWeight > 0.25 || length(vFirstPersonView) < ${CLEARANCE.toFixed(2)}) discard;
  float fpDither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (vFirstPersonBody > 0.25 && fpDither < uFirstPersonRear) discard;
}`);
  };
  material.customProgramCacheKey = () => key + '-first-person-v3';
}

export function installFirstPersonMask(root, head, { torso = null, arms = [] } = {}) {
  const activeId = { value: 0, id: nextId++, rear: { value: 0 } };
  const headObjects = new Set(); head.traverse(object => headObjects.add(object));
  const bodyObjects = new Set();
  torso?.traverse(object => bodyObjects.add(object));
  for (const arm of arms) arm.traverse(object => bodyObjects.delete(object));
  const materials = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    const count = geometry.attributes.position.count;
    const weights = new Float32Array(count);
    const bodyWeights = new Float32Array(count);
    if (mesh.isSkinnedMesh) {
      const indices = geometry.attributes.skinIndex, skinWeights = geometry.attributes.skinWeight;
      const bodyBones = new Set(mesh.skeleton.bones.filter(bone => /^(Spine\d*|Neck|Head|LeftShoulder|RightShoulder)$/.test(bone.name.replace(/^mixamorig:?/,''))));
      for (let i = 0; i < count; i++) for (let j = 0; j < 4; j++) {
        const bone = mesh.skeleton.bones[indices.getComponent(i, j)], weight = skinWeights.getComponent(i,j);
        if (headObjects.has(bone)) weights[i] += weight;
        if (bodyBones.has(bone)) bodyWeights[i] += weight;
      }
    } else {
      if (headObjects.has(mesh)) weights.fill(1);
      if (bodyObjects.has(mesh)) bodyWeights.fill(1);
    }
    geometry.setAttribute('aHeadWeight', new THREE.BufferAttribute(weights, 1));
    geometry.setAttribute('aFirstPersonBody', new THREE.BufferAttribute(bodyWeights, 1));
    geometry.setAttribute('aFirstPersonId', new THREE.BufferAttribute(new Float32Array(count).fill(activeId.id), 1));
    mesh.geometry = geometry;
    const masked = source => {
      if (!materials.has(source)) {
        const material = source.clone();
        material.onBeforeCompile = source.onBeforeCompile;
        material.customProgramCacheKey = source.customProgramCacheKey;
        patchFirstPersonMaterial(material, activeId);
        materials.set(source, material);
      }
      return materials.get(source);
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(masked) : masked(mesh.material);
  });
  return activeId;
}
