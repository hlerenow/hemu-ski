import * as THREE from 'three';

// The Mixamo Fireball hands extend between 1.8 and 2.2 seconds. Keep these
// cues on the animation clock so a slow frame cannot leave sound behind.
export const FIREBALL = { charge: 1.15, voice: 1.45, release: 2.02, flight: 1.15 };
export function crossedCue(previous, current, cue, duration) {
  return current >= previous ? previous < cue && current >= cue : previous < cue || current >= cue;
}

export class Fireball {
  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 2), new THREE.MeshBasicMaterial({ color: 0xd5ffff }));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.30, 2), new THREE.MeshBasicMaterial({ color: 0x32d9ff, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(core, shell);
    this.shell = shell;
    const positions = new Float32Array(36 * 3);
    for (let i = 0; i < 36; i++) {
      const a = i * 2.399, r = 0.22 + (i % 4) * 0.055;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.sin(a) * r;
      positions[i * 3 + 2] = (i % 9) * 0.12 - 0.45;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sparks = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x8cf8ff, size: 0.075, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.sparks);
    this.left = new THREE.Vector3(); this.right = new THREE.Vector3();
    this.origin = new THREE.Vector3(); this.direction = new THREE.Vector3();
    this.age = -1;
  }
  reset() { this.age = -1; this.group.visible = false; }
  update(dt, action, rider, forward) {
    if (!action || action.id !== 'fireball' || !rider.model) { this.reset(); return []; }
    const { previous, time, clip } = action;
    const events = [];
    if (crossedCue(previous, time, FIREBALL.voice, clip.duration)) events.push('voice');
    const release = crossedCue(previous, time, FIREBALL.release, clip.duration);
    rider.root.updateWorldMatrix(true, true);
    rider.model.palmAt('Left', this.left);
    rider.model.palmAt('Right', this.right);
    const charging = time >= FIREBALL.charge && time < FIREBALL.release;
    if (charging) {
      this.group.visible = true;
      this.group.position.copy(this.left).add(this.right).multiplyScalar(0.5);
      const scale = THREE.MathUtils.lerp(0.16, 1, (time - FIREBALL.charge) / (FIREBALL.release - FIREBALL.charge));
      this.group.scale.setScalar(scale);
      this.age = -1;
    }
    if (release) {
      this.origin.copy(this.left).add(this.right).multiplyScalar(0.5);
      this.direction.copy(forward).normalize();
      this.age = 0;
      events.push('release');
    }
    if (this.age >= 0) {
      this.age += dt;
      if (this.age >= FIREBALL.flight) this.reset();
      else {
        this.group.visible = true;
        this.group.position.copy(this.origin).addScaledVector(this.direction, this.age * 9);
        this.group.scale.setScalar(Math.min(1, (FIREBALL.flight - this.age) * 4));
        this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.direction);
      }
    } else if (!charging) this.group.visible = false;
    this.shell.rotation.y += dt * 3;
    this.sparks.rotation.z += dt * 4;
    return events;
  }
}
