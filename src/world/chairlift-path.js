import * as THREE from 'three';

// A fixed-grip rope is one closed loop. Distances along this polyline are shared
// by every grip, including the half turns around the two terminal bullwheels.
export function chairliftPath(hf, A, B, scale = 1) {
  const dir = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const length = Math.hypot(B.x - A.x, B.z - A.z);
  const count = Math.max(2, Math.ceil(length / 60));
  const radius = 3 * scale;
  const supports = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count, x = THREE.MathUtils.lerp(A.x, B.x, t), z = THREE.MathUtils.lerp(A.z, B.z, t);
    const ground = hf.heightAt(x, z);
    return new THREE.Vector3(x, ground + (i === 0 || i === count ? 3.7 : 9) * scale, z);
  });
  // Check both strands between each pair of towers, not only the tower bases.
  // Raise the adjacent towers to provide clearance; terminal heights stay tied
  // to the boarding surface, so their approach is handled by the first tower.
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < count; i++) {
    const p = supports[i], q = supports[i + 1];
    for (let j = 1; j < 20; j++) {
      const t = j / 20;
      if ((i === 0 && t < 0.08) || (i === count - 1 && t > 0.92)) continue;
      for (const sign of [-1, 1]) {
        const x = THREE.MathUtils.lerp(p.x, q.x, t) + side.x * radius * sign;
        const z = THREE.MathUtils.lerp(p.z, q.z, t) + side.z * radius * sign;
        const clearance = THREE.MathUtils.lerp(p.y, q.y, t) - hf.heightAt(x, z);
        const deficit = 5 * scale - clearance;
        if (deficit <= 0) continue;
        if (i === 0) q.y += deficit / t;
        else if (i === count - 1) p.y += deficit / (1 - t);
        else { p.y += deficit; q.y += deficit; }
      }
    }
  }
  const lane = (sign) => supports.map(p => p.clone().addScaledVector(side, sign * radius));
  const up = lane(-1), down = lane(1), points = [...up];
  // The outer halves of the bullwheels turn each grip smoothly onto the other strand.
  for (let i = 1; i <= 12; i++) {
    const angle = Math.PI * i / 12;
    points.push(B.clone().setY(supports[count].y).addScaledVector(side, -radius * Math.cos(angle)).addScaledVector(dir, radius * Math.sin(angle)));
  }
  points.push(...down.slice(0, -1).reverse());
  for (let i = 1; i <= 12; i++) {
    const angle = Math.PI * i / 12;
    points.push(A.clone().setY(supports[0].y).addScaledVector(side, radius * Math.cos(angle)).addScaledVector(dir, -radius * Math.sin(angle)));
  }
  const acc = [0];
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, acc, total: acc.at(-1), upLength: up.reduce((sum, p, i) => sum + (i ? p.distanceTo(up[i - 1]) : 0), 0), supports, side, dir };
}

function samplePosition(path, distance, position) {
  const s = ((distance % path.total) + path.total) % path.total;
  let i = 1;
  while (i < path.acc.length - 1 && path.acc[i] < s) i++;
  const a = path.points[i - 1], b = path.points[i];
  position.lerpVectors(a, b, (s - path.acc[i - 1]) / (path.acc[i] - path.acc[i - 1]));
  return s;
}

const before = new THREE.Vector3(), after = new THREE.Vector3();
export function sampleChairlift(path, distance, position, tangent) {
  const s = samplePosition(path, distance, position);
  // Blend the direction across polyline joints, especially the bullwheel turns.
  samplePosition(path, distance - 0.5, before);
  samplePosition(path, distance + 0.5, after);
  tangent.subVectors(after, before).normalize();
  return s;
}

// Detect a point passed on the closed rope even when this frame wraps around
// the loop. Frame travel is bounded below one full revolution by the caller.
export function crossedChairliftPoint(previous, current, point, total) {
  const travelled = (current - previous + total) % total;
  const toPoint = (point - previous + total) % total;
  return travelled > 0 && toPoint <= travelled;
}

// Integrate acceleration exactly even if the target is reached within a frame.
// This keeps the haul-rope phase consistent at different frame rates.
export function advanceChairlift(system, dt) {
  const target = Math.max(0, system.targetSpeed), speed = system.speed;
  const acceleration = 3;
  const reach = Math.abs(target - speed) / acceleration;
  const ramp = Math.min(dt, reach);
  const next = speed + Math.sign(target - speed) * acceleration * ramp;
  const distance = (speed + next) * 0.5 * ramp + target * (dt - ramp);
  system.speed = next;
  system.phase = (system.phase + distance) % system.path.total;
}
