import * as THREE from 'three';

const vertex = new THREE.Vector3();
const pivot = new THREE.Vector3();

// Compensate rotation around the board origin so the hip region stays put.
export function rollAssembly(edge, angle, height) {
  edge.rotation.x = angle;
  if (Math.abs(angle % (Math.PI * 2)) < 1e-6) {
    edge.position.set(0, 0, 0);
    return;
  }
  pivot.set(0, height, 0).applyQuaternion(edge.quaternion);
  edge.position.set(-pivot.x, height - pivot.y, -pivot.z);
}

// Only used during rolls/impact recovery. Use posed vertices, including the
// skinned clothing and board, rather than the GLB's stale bind-pose bounds.
// Sampling the actual heightfield also handles slopes and ramp transitions.
export function clearGround(root, hf, settle = false) {
  root.updateMatrixWorld(true);
  root.traverseVisible((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  let lift = -Infinity;
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    for (let i = 0; i < o.geometry.attributes.position.count; i++) {
      o.getVertexPosition(i, vertex).applyMatrix4(o.matrixWorld);
      lift = Math.max(lift, hf.heightAt(vertex.x, vertex.z) + 0.025 - vertex.y);
    }
  });
  lift = Number.isFinite(lift) ? (settle ? lift : Math.max(0, lift)) : 0;
  root.position.y += lift;
  root.updateMatrixWorld(true);
  return lift;
}
