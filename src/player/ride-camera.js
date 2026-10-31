import * as THREE from 'three';
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const riderDirection = new THREE.Vector3();

// Use actual world directions: steering can reverse the rider while the
// camera is still following velocity, even without moving the look controls.
export function firstPersonRearMask(viewDirection, forward) {
  direction.copy(viewDirection).setY(0).normalize();
  riderDirection.copy(forward).setY(0).normalize();
  return THREE.MathUtils.smoothstep(-direction.dot(riderDirection), -0.5, 0.2);
}
// The eye follows the posed head; mouse look keeps a readable horizon during
// tricks. A slight downward gaze and wide lens include hands and the nose.
export function firstPersonTarget(s, position, look) {
  const crouch = THREE.MathUtils.clamp(s.crouch || 0, 0, 1);
  direction.copy(s.forward).setY(0).normalize();
  if (direction.lengthSq() < 0.1) direction.set(0, 0, -1);
  direction.applyAxisAngle(up, s.yaw || 0);
  if (s.eye) position.copy(s.eye);
  else {
    position.copy(s.position).addScaledVector(direction, 0.2);
    position.y += 1.58 - crouch * 0.4;
  }
  const slope = s.normal ? Math.atan2(direction.dot(s.normal), s.normal.y) : 0;
  const pitch = THREE.MathUtils.clamp(0.48 + slope + (s.pitch || 0), -1.2, 1.45);
  look.copy(position).addScaledVector(direction, 15 * Math.cos(pitch));
  look.y -= 15 * Math.sin(pitch);
}

