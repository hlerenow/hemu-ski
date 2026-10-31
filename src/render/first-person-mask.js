import * as THREE from 'three';

let nextId = 1;
const CLEARANCE = 0.24;

// Use exactly the same cutout in color/depth and the outline's normal pass.
// IDs keep the cutout local to the player rather than masking nearby NPCs.
export function patchFirstPersonMaterial(material, activeId) {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.defaultAttributeValues = {
    ...material.defaultAttributeValues, aHeadWeight: [0], aFirstPersonId: [0],
  };
  material.onBeforeCompile = shader => {
    compile.call(material, shader);
    shader.uniforms.uFirstPersonId = activeId;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aHeadWeight;
attribute float aFirstPersonId;
varying float vHeadWeight;
varying float vFirstPersonId;
varying vec3 vFirstPersonView;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vHeadWeight = aHeadWeight;
vFirstPersonId = aFirstPersonId;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vFirstPersonView = mvPosition.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uFirstPersonId;
varying float vHeadWeight;
varying float vFirstPersonId;
varying vec3 vFirstPersonView;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (uFirstPersonId > 0.5 && abs(vFirstPersonId - uFirstPersonId) < 0.25 &&
    (vHeadWeight > 0.25 || length(vFirstPersonView) < ${CLEARANCE.toFixed(2)})) discard;`);
  };
  material.customProgramCacheKey = () => key + '-first-person-v2';
}

export function installFirstPersonMask(root, head) {
  const activeId = { value: 0, id: nextId++ };
  const headObjects = new Set(); head.traverse(object => headObjects.add(object));
  const materials = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone();
    const count = geometry.attributes.position.count;
    const weights = new Float32Array(count);
    if (mesh.isSkinnedMesh) {
      const indices = geometry.attributes.skinIndex, skinWeights = geometry.attributes.skinWeight;
      for (let i = 0; i < count; i++) for (let j = 0; j < 4; j++) {
        if (headObjects.has(mesh.skeleton.bones[indices.getComponent(i, j)])) weights[i] += skinWeights.getComponent(i, j);
      }
    } else if (headObjects.has(mesh)) weights.fill(1);
    geometry.setAttribute('aHeadWeight', new THREE.BufferAttribute(weights, 1));
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
