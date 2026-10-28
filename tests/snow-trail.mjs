import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BoardTrail } from '../src/player/fx.js';

const trail = new BoardTrail();
const side = new THREE.Vector3(1, 0, 0);
const start = new THREE.Vector3(0, 0, 0);
const near = new THREE.Vector3(0, 0, 0.2);
const summit = new THREE.Vector3(500, 200, 500);
trail.add(start, side, 0.28);
// Boarding very close to the last point must still end the strip.
trail.gap(near);
trail.gap(summit);
trail.add(summit, side, 0.28);
const points = trail.line.pts;
assert.deepEqual(points.map(p => p.w), [0.28, 0, 0, 0.28]);
assert.equal(points[1].x, start.x);
assert.equal(points[2].x, summit.x);
// Every triangle between distant segments has zero width at both ends.
assert.equal(points[1].w, 0);
assert.equal(points[2].w, 0);
trail.clear();
trail.add(start, side, 0.09, 0, 0.25);
trail.gap(near);
trail.add(summit, side, 0.09, 0, 0.25);
for (const line of [trail.line, trail.line2]) {
  assert.deepEqual(line.pts.map(p => p.w), [0.09, 0, 0, 0.09]);
}
trail.clear();
trail.add(start, side, 0.28, 0.42);
trail.gap(near);
trail.add(summit, side, 0.28, 0.42);
assert.deepEqual(trail.furrow.pts.map(p => p.w), [0.42, 0, 0, 0.42]);
console.log('PASS snow trails break across lift rides for boards, skis and powder');
