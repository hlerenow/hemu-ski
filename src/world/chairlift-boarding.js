// Find a short pedestrian route around the loading terminal's posts. Boxes use
// the same orientation as the game's physical obstacles; margin includes the
// rider's body rather than treating them as a point.
export function boardingPath(start, end, obstacles, margin = 0.55) {
  const nodes = [{ x: start.x, z: start.z }, { x: end.x, z: end.z }];
  for (const o of obstacles) {
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (o.hw + margin + 0.1), z = sz * (o.hd + margin + 0.1);
      nodes.push({ x: o.x + c * x + s * z, z: o.z - s * x + c * z });
    }
  }
  const clear = (a, b) => obstacles.every(o => !crossesBox(a, b, o, margin));
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), seen = nodes.map(() => false);
  costs[0] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!seen[i] && (u < 0 || costs[i] < costs[u])) u = i;
    if (u < 0 || !Number.isFinite(costs[u]) || u === 1) break;
    seen[u] = true;
    for (let v = 0; v < nodes.length; v++) {
      if (seen[v] || v === u || !clear(nodes[u], nodes[v])) continue;
      const d = costs[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].z - nodes[u].z);
      if (d < costs[v]) { costs[v] = d; previous[v] = u; }
    }
  }
  if (!Number.isFinite(costs[1])) return null;
  const path = [];
  for (let i = 1; i >= 0; i = previous[i]) path.push(nodes[i]);
  return path.reverse();
}

function crossesBox(a, b, o, margin) {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  const local = p => ({ x: (p.x - o.x) * c - (p.z - o.z) * s, z: (p.x - o.x) * s + (p.z - o.z) * c });
  const p = local(a), q = local(b);
  let lo = 0, hi = 1;
  for (const [origin, delta, half] of [[p.x, q.x - p.x, o.hw + margin], [p.z, q.z - p.z, o.hd + margin]]) {
    if (Math.abs(delta) < 1e-9) { if (Math.abs(origin) > half) return false; continue; }
    let t0 = (-half - origin) / delta, t1 = (half - origin) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0); hi = Math.min(hi, t1);
    if (lo > hi) return false;
  }
  return true;
}
