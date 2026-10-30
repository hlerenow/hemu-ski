// A groomed loading/unloading pad at each end of No. 5. Work on the final
// heightfield so rendering, player physics and the rope share the same snow.
export function shapeChairliftStations(hf, lifts) {
  const lift = lifts.find(l => l.name === '5号索道' && l.type === 'chair_lift');
  if (!lift) return;
  for (const [x, z] of [lift.points[0], lift.points.at(-1)]) {
    const level = hf.heightAt(x, z), inner = 13, outer = 26;
    const i0 = Math.max(0, Math.floor((x - outer - hf.x0) / hf.step));
    const i1 = Math.min(hf.cells, Math.ceil((x + outer - hf.x0) / hf.step));
    const j0 = Math.max(0, Math.floor((z - outer - hf.z0) / hf.step));
    const j1 = Math.min(hf.cells, Math.ceil((z + outer - hf.z0) / hf.step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(hf.x0 + i * hf.step - x, hf.z0 + j * hf.step - z);
      const t = Math.max(0, Math.min(1, (d - inner) / (outer - inner)));
      const weight = 1 - t * t * (3 - 2 * t);
      const k = j * hf.verts + i;
      hf.h[k] += (level - hf.h[k]) * weight;
    }
  }
}
