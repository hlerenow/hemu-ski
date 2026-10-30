// Mouse look (the menu's Settings): a click on the view takes the pointer, as
// in a third-person shooter, and then the mouse swings the camera round the
// rider, left and right all the way round and up and down from under the
// rider's chin to nearly overhead. Esc gives the pointer back. `yaw` and
// `pitch` are how far it's swung from the chase camera's own view (radians;
// + yaw to the left, + pitch up over the rider); take() hands over how far it
// moved since last asked, so the camera can follow at once rather than catch up.
import * as THREE from 'three';

const SENSITIVITY = 0.0025; // radians a pixel
const TOUCH_SENSITIVITY = 0.006; // a finger's drag swings further than a mouse's
const PITCH = { min: -1, max: 1.05 };

export class MouseLook {
  constructor(canvas) {
    this.canvas = canvas;
    this.on = false;
    this.force = false;
    this.yaw = 0;
    this.pitch = 0;
    this.dYaw = 0;
    this.dPitch = 0;
    this.wanted = () => true; // whether a click on the view should take the pointer now
    canvas.addEventListener('click', () => {
      if ((this.on || this.force) && !this.locked && this.wanted()) canvas.requestPointerLock?.()?.catch?.(() => {});
    });
    // Where the browser won't hand over the pointer (some embedded views), a
    // drag across the view looks round instead.
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = (this.on || this.force) && e.pointerType === 'mouse' && this.wanted();
    });
    window.addEventListener('pointerup', () => (dragging = false));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !(dragging && e.buttons)) return;
      this.turn(-e.movementX * SENSITIVITY, e.movementY * SENSITIVITY);
    });
    // On a touch screen, where the view must look round (riding a chairlift,
    // with no stick on screen), one finger dragged across it swings the camera.
    let finger = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || finger || !this.force || !this.wanted()) return;
      finger = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== finger?.id) return;
      this.turn(-(e.clientX - finger.x) * TOUCH_SENSITIVITY, (e.clientY - finger.y) * TOUCH_SENSITIVITY);
      finger.x = e.clientX; finger.y = e.clientY;
    });
    const lift = (e) => { if (e.pointerId === finger?.id) finger = null; };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  set(on) {
    this.on = on;
    if (on) return;
    if (this.locked) document.exitPointerLock();
    // The chase camera eases back to its own view.
    this.yaw = this.pitch = this.dYaw = this.dPitch = 0;
  }

  turn(dYaw, dPitch) {
    const pitch = THREE.MathUtils.clamp(this.pitch + dPitch, PITCH.min, PITCH.max);
    this.dPitch += pitch - this.pitch;
    this.pitch = pitch;
    this.yaw += dYaw;
    this.dYaw += dYaw;
  }

  // Back behind the rider, as at a new start.
  reset() {
    this.yaw = this.pitch = this.dYaw = this.dPitch = 0;
  }

  take() {
    const d = { yaw: this.dYaw, pitch: this.dPitch };
    this.dYaw = this.dPitch = 0;
    return d;
  }
}

// Swings `p` round `pivot`: up over it by `pitch` (about the level axis across
// `dir`, the way the view looks), then round it by `yaw`.
const UP = new THREE.Vector3(0, 1, 0), _axis = new THREE.Vector3();
export function swing(p, pivot, dir, yaw, pitch) {
  p.sub(pivot);
  if (pitch) p.applyAxisAngle(_axis.set(dir.z, 0, -dir.x).normalize(), pitch);
  if (yaw) p.applyAxisAngle(UP, yaw);
  return p.add(pivot);
}
