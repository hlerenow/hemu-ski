import * as THREE from 'three';
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
// The eye follows the posed head; mouse look keeps a readable horizon during
// tricks. A slight downward gaze and wide lens include hands and the nose.
export function firstPersonTarget(s, position, look) {
  const crouch = THREE.MathUtils.clamp(s.crouch || 0, 0, 1);
  direction.copy(s.forward).setY(0).normalize();
  if (direction.lengthSq() < 0.1) direction.set(0, 0, -1);
  direction.applyAxisAngle(up, s.yaw || 0);
  if (s.eye) position.copy(s.eye);
  else {
    position.copy(s.position).addScaledVector(direction, 0.1);
    position.y += 1.48 - crouch * 0.4;
  }
  const slope = s.normal ? Math.atan2(direction.dot(s.normal), s.normal.y) : 0;
  const pitch = THREE.MathUtils.clamp(0.48 + slope + (s.pitch || 0), -1.2, 1.45);
  look.copy(position).addScaledVector(direction, 15 * Math.cos(pitch));
  look.y -= 15 * Math.sin(pitch);
}

// Hide only head-weighted fragments in the first-person color pass. Keep the
// actual body/arms, skeleton and head shadow intact, including shared assets.
export function installHeadMask(root, head) {
  const enabled = { value: 0 };
  const headBones = new Set(); head.traverse(bone => headBones.add(bone));
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry.clone();
    const indices = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight;
    const mask = new Float32Array(indices.count);
    for (let i = 0; i < mask.length; i++) for (let j = 0; j < 4; j++) {
      if (headBones.has(mesh.skeleton.bones[indices.getComponent(i, j)])) mask[i] += weights.getComponent(i, j);
    }
    geometry.setAttribute('aHeadWeight', new THREE.BufferAttribute(mask, 1));
    mesh.geometry = geometry;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const compile = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
      material.onBeforeCompile = shader => {
        compile.call(material, shader);
        shader.uniforms.uFirstPerson = enabled;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aHeadWeight;\nvarying float vHeadWeight;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeadWeight = aHeadWeight;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFirstPerson;\nvarying float vHeadWeight;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uFirstPerson > 0.5 && vHeadWeight > 0.25) discard;');
      };
      material.customProgramCacheKey = () => cacheKey + '-head-mask';
    }
  });
  return enabled;
}
