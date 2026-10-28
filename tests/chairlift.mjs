import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chairliftPath, sampleChairlift, advanceChairlift, crossedChairliftPoint } from '../src/world/chairlift-path.js';
import { boardingPath } from '../src/world/chairlift-boarding.js';

const hf = { heightAt: (x, z) => 0.08 * z + 3 * Math.exp(-(((z - 450) / 40) ** 2)) };
const path = chairliftPath(hf, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 48, 600));
assert.ok(path.points[0].distanceTo(path.points.at(-1)) < 1e-8, 'rope loop closes');
const p = new THREE.Vector3(), t = new THREE.Vector3();
sampleChairlift(path, 10, p, t);
assert.ok(Math.abs(t.length() - 1) < 1e-9);
const left = new THREE.Vector3(), right = new THREE.Vector3();
sampleChairlift(path, path.upLength - 0.001, p, left);
sampleChairlift(path, path.upLength + 0.001, p, right);
assert.ok(left.angleTo(right) < 0.01, 'direction is continuous at the terminal');
const simulate = fps => {
  const sys = { path, phase: 0, speed: 5, targetSpeed: 20 };
  for (let i = 0; i < 7 * fps; i++) advanceChairlift(sys, 1 / fps);
  sys.targetSpeed = 0;
  for (let i = 0; i < 8 * fps; i++) advanceChairlift(sys, 1 / fps);
  return sys;
};
const a = simulate(30), b = simulate(144), low = simulate(10);
assert.ok(Math.abs(a.phase - b.phase) < 1e-7, 'distance independent of frame rate');
assert.ok(Math.abs(a.phase - low.phase) < 1e-7, 'acceleration and stopping preserve distance at low frame rates');
assert.equal(a.speed, 0);
assert.ok(crossedChairliftPoint(98, 0.3, 98.8, 100), 'catch point is detected when a frame crosses the loop seam');
assert.ok(!crossedChairliftPoint(98, 98, 98.8, 100), 'a stationary chair does not board a rider');
assert.ok(!crossedChairliftPoint(99, 0.3, 98.8, 100), 'a chair that passed the catch point waits for its next circuit');
const offsets = [0, path.total / 40, path.total / 20];
const positions = offsets.map(offset => (a.phase + offset) % path.total);
assert.ok(Math.abs(((positions[1] - positions[0] + path.total) % path.total) - path.total / 40) < 1e-8);
const posts = [{ x: -5, z: 4, yaw: 0, hw: 0.125, hd: 0.125 }];
const route = boardingPath({ x: -13, z: 8 }, { x: 3, z: 0 }, posts);
assert.ok(route.length > 2, 'approach detours around the station post');
assert.equal(boardingPath({ x: 0, z: 0 }, { x: 3, z: 0 }, []).length, 2, 'clear approaches stay direct');
assert.equal(boardingPath({ x: -5, z: 4 }, { x: 3, z: 0 }, posts), null, 'do not walk through a post when starting inside it');
for (let i = 1; i < route.length; i++) for (let j = 0; j <= 100; j++) {
  const x = THREE.MathUtils.lerp(route[i - 1].x, route[i].x, j / 100);
  const z = THREE.MathUtils.lerp(route[i - 1].z, route[i].z, j / 100);
  assert.ok(Math.abs(x + 5) > 0.67 || Math.abs(z - 4) > 0.67, 'the walking route leaves room around the post');
}
console.log('PASS chairlift loop, grip spacing and smooth acceleration/stop at 10, 30 and 144 fps');
