import * as THREE from 'three';

// Gondolas No. 6 and No. 7 run as one detachable loop each: the cabins come
// into the stations under the canopy and round a bullwheel inside, and the
// rope enters each station level, its bend into the line taken by the two
// towers outside. Towers stand only off the runs.
export const MODERN_GONDOLAS = ['6号索道', '7号索道'];

// station.glb at full size, turned with its open back (model -z) to the line.
// In a station's frame `u` is metres from its centre out toward the line and
// `x` metres across (see stationPoint). A full-height column stands deep in
// the model's other end, so the cabins turn short of it: two lanes 3.5 m apart
// under the canopy, at the platform's height, round a wheel 1 m in from the
// centre. The canopy's underside is 4.2 m up; the hanger reaches into it.
export const STATION = { mouth: 9, floor: 1.3, wheel: { u: 1, x: 0.2, r: 1.75 } };
export const CABIN_DEPTH = 4.11; // grip to the cabin's floor
const GAUGE = 3; // half the rope spacing on the line (the pylon heads)
const deg = THREE.MathUtils.degToRad;
// The entry span is all but level; the last two towers share the bend into
// the line, each turning the rope at most BEND (a long sheave train's worth;
// the station end of a lift on a steep slope needs it).
const ENTRY = deg(1), BEND = deg(15);
// Where the first two towers stand, out from the station's mouth: target and range.
const T1 = [12, 8, 25], T2 = [28, 20, 50];
// How much higher than its ground a station may stand on a filled pad.
const MAX_FILL = 8;
// Spans between the line's towers: what they aim for, and the least and most.
const SPAN = [130, 40, 450];
const LINE_CLEARANCE = 6.5; // rope above snow, under both lanes' cabins (2.4 m under their floors)
// The tallest a line tower grows to keep the rope straight over a dip.
const TALLEST = 40;
// A line tower bending the rope more than this gets a neighbour where it can.
const KINK = THREE.MathUtils.degToRad(12);

// Where a tower may stand: its foot 5 m clear of a run's edge, the ends of its
// arms 2 m (`halfWidth`: a run's, from its centreline; `piste`: a PisteField).
export const offPisteSites = (piste, halfWidth) => (x, z, lat) => piste.distAt(x, z) >= halfWidth + 5
  && [-4, 4].every(o => piste.distAt(x + lat.x * o, z + lat.z * o) >= halfWidth + 2);

// A point in the station's frame (see STATION).
export function stationPoint(end, u, x, y, out = new THREE.Vector3()) {
  return out.set(end.P.x + end.out.x * u + end.lat.x * x, y, end.P.z + end.out.z * u + end.lat.z * x);
}

// One station of the line: where it stands and how the rope leaves it. The
// rope runs level through the station at the cabins' platform height, leaves
// the mouth all but level (ENTRY) to T1, and T1 and T2 each turn it by half of
// what the line needs (at most BEND each), so it climbs or falls past T2 at
// `a3`. A station on a slope may stand up to MAX_FILL higher on a filled pad,
// which spares digging out the slope in front of it.
// `inside`: cabins and station drawn at one scale, so the cabins can run in;
// the diorama's toy cabins are bigger than its stations and turn outside.
// `preset` (an approach from shapeGondolaStations) keeps the approach the
// grading was cut for.
function stationEnd(hf, P, toward, { scale, stationScale, offPiste, approach }) {
  const out = new THREE.Vector3(toward.x - P.x, 0, toward.z - P.z).normalize();
  const lat = new THREE.Vector3(-out.z, 0, out.x);
  const length = Math.hypot(toward.x - P.x, toward.z - P.z);
  const inside = Math.abs(scale - stationScale) < 1e-9;
  const mouth = STATION.mouth * stationScale;
  const wheel = inside
    ? { u: STATION.wheel.u * scale, x: STATION.wheel.x * scale, r: STATION.wheel.r * scale }
    : { u: mouth + 6 * scale, x: 0, r: GAUGE * scale };
  const end = { P, out, lat, wheel, mouth: Math.max(mouth, wheel.u) };
  const ground = (u) => hf.heightAt(P.x + out.x * u, P.z + out.z * u);
  const preset = approach?.get(stationKey(P));
  if (preset) Object.assign(end, preset);
  else {
    // A tower site off the runs, as near the target as the range allows.
    const site = ([target, lo, hi], from) => {
      for (let d = 0; d <= Math.max(target - lo, hi - target); d += 1) {
        for (const u of [from + target + d, from + target - d]) {
          if (u < from + lo || u > from + hi) continue;
          if (offPiste(P.x + out.x * u, P.z + out.z * u, lat)) return u;
        }
      }
      return from + target;
    };
    end.u1 = site(T1, end.mouth);
    end.u2 = site(T2, end.u1);
    end.a1 = Math.sign(ground(end.u2 + 80) - P.y) * ENTRY;
    // The station's height and the grade past T2 that need the least digging
    // and filling, without towers much taller than 25 m over the approach.
    let best = Infinity;
    for (let fill = 0; fill <= (inside ? MAX_FILL : 0); fill += 0.5) {
      end.base = P.y + fill;
      for (let a3 = end.a1 - 2 * BEND; a3 <= end.a1 + 2 * BEND + 1e-9; a3 += deg(0.25)) {
        const rope = approachRope(end, a3, scale, stationScale);
        let cost = 10 * fill * fill;
        for (let u = end.mouth; u <= Math.min(end.u2 + CUT_PAST_T2, length / 2); u += 5) {
          const g = ground(u), y = rope(u);
          cost += Math.max(0, g - (y - LINE_CLEARANCE * scale)) ** 2 + 0.2 * Math.max(0, y - g - 25 * scale) ** 2;
        }
        if (cost < best - 1e-9) { best = cost; end.a3 = a3; end.fill = fill; }
      }
    }
    end.base = P.y + end.fill;
  }
  end.rope = end.base + STATION.floor * stationScale + CABIN_DEPTH * scale;
  end.ropeAt = approachRope(end, end.a3, scale, stationScale);
  end.y1 = end.ropeAt(end.u1);
  end.y2 = end.ropeAt(end.u2);
  return end;
}

// How far out past T2 the approach (and the grading under it) carries on at a3.
const CUT_PAST_T2 = 200;

// The rope's height over a station's approach, `u` metres out from its centre.
function approachRope(end, a3, scale, stationScale) {
  const rope = end.base + STATION.floor * stationScale + CABIN_DEPTH * scale;
  const t1 = Math.tan(end.a1), t2 = Math.tan((end.a1 + a3) / 2), t3 = Math.tan(a3);
  const y1 = rope + (end.u1 - end.mouth) * t1, y2 = y1 + (end.u2 - end.u1) * t2;
  return (u) => u <= end.mouth ? rope
    : u <= end.u1 ? rope + (u - end.mouth) * t1
    : u <= end.u2 ? y1 + (u - end.u1) * t2
    : y2 + (u - end.u2) * t3;
}

const stationKey = (P) => `${P.x.toFixed(1)},${P.z.toFixed(1)}`;

// The stations, towers and rope heights of a gondola from A to B (the station
// centres). `offPiste(x, z, lat)` says whether a tower may stand there;
// `approach` is shapeGondolaStations()'s. Returns the rope's axis from mouth
// to mouth as `supports` (the towers are all but its ends) and the two
// stations as `ends` (each with its `base`, the height it stands at).
export function gondolaLayout(hf, A, B, { scale = 1, stationScale = scale, offPiste = () => true, approach = null } = {}) {
  const opts = { scale, stationScale, offPiste, approach };
  const ends = [stationEnd(hf, A, B, opts), stationEnd(hf, B, A, opts)];
  const [ea, eb] = ends;
  const length = Math.hypot(B.x - A.x, B.z - A.z);
  const dir = ea.out, side = ea.lat;
  const at = (s, y) => new THREE.Vector3(A.x + dir.x * s, y, A.z + dir.z * s);
  const ground = (s) => hf.heightAt(A.x + dir.x * s, A.z + dir.z * s);
  // The line's towers between the two T2s: sites off the runs, chosen for
  // spans near SPAN[0]. Where the line follows a run there's none for a while,
  // and the span stretches over it.
  const s0 = ea.u2, s1 = length - eb.u2;
  const sites = [s0];
  for (let s = s0 + SPAN[1]; s <= s1 - SPAN[1]; s += 2) {
    if (offPiste(A.x + dir.x * s, A.z + dir.z * s, side)) sites.push(s);
  }
  sites.push(s1);
  const spanCost = (L) => (L / SPAN[0] - 1) ** 2 + 0.3 + (L > 250 ? ((L - 250) / 50) ** 2 : 0);
  const best = sites.map(() => Infinity), from = sites.map(() => -1);
  best[0] = 0;
  for (let j = 1; j < sites.length; j++) for (let i = j - 1; i >= 0; i--) {
    const L = sites[j] - sites[i];
    if (L > SPAN[2]) break;
    const c = best[i] + spanCost(L);
    if (c < best[j]) { best[j] = c; from[j] = i; }
  }
  const chosen = [];
  for (let j = sites.length - 1; j >= 0; j = from[j]) { chosen.unshift(sites[j]); if (j === 0) break; }

  // The line's towers start on the approach ropes where those reach (or
  // 12 m up), then settle: each moves onto the straight line between its
  // neighbours (no more than TALLEST up) and rises wherever a span would
  // bring either lane's cabins too near the snow. The first and last of them
  // keep the T2s' bends within BEND, as the grading was cut for.
  const settle = (chosen) => {
    const supports = [at(ea.mouth, ea.rope), at(ea.u1, ea.y1)];
    for (const s of chosen) {
      const fromB = length - s;
      const y = s <= ea.u2 + CUT_PAST_T2 && s <= fromB ? ea.ropeAt(s)
        : fromB <= eb.u2 + CUT_PAST_T2 ? eb.ropeAt(fromB) : ground(s) + 12 * scale;
      supports.push(at(s, y));
    }
    supports.push(at(length - eb.u1, eb.y1), at(length - eb.mouth, eb.rope));
    const n = supports.length, first = 3, last = n - 4;
    const run = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
    const offsets = [-GAUGE - 1.3, -GAUGE, -GAUGE + 1.3, GAUGE - 1.3, GAUGE, GAUGE + 1.3].map(o => o * scale);
    const clear = () => {
      for (let i = 2; i < n - 3; i++) {
        const p = supports[i], q = supports[i + 1];
        const steps = Math.ceil(run(p, q) / (2 * scale));
        for (let j = 1; j < steps; j++) {
          const t = j / steps;
          let deficit = -Infinity;
          for (const o of offsets) {
            const x = THREE.MathUtils.lerp(p.x, q.x, t) + side.x * o, z = THREE.MathUtils.lerp(p.z, q.z, t) + side.z * o;
            deficit = Math.max(deficit, hf.heightAt(x, z) + LINE_CLEARANCE * scale - THREE.MathUtils.lerp(p.y, q.y, t));
          }
          if (deficit <= 0) continue;
          if (i === 2) { if (t > 0.1) q.y += deficit / t; }
          else if (i + 1 === n - 3) { if (t < 0.9) p.y += deficit / (1 - t); }
          else { p.y += deficit; q.y += deficit; }
        }
      }
      for (let i = first; i <= last; i++) {
        const p = supports[i];
        p.y = Math.max(p.y, hf.heightAt(p.x, p.z) + 6 * scale);
      }
    };
    // Keep the T2s' bends (toward the next tower) within BEND.
    const bendLimit = (i, t2, t1) => {
      const p = supports[i], a = supports[t2], d = run(a, p);
      const into = Math.atan2(a.y - supports[t1].y, run(supports[t1], a));
      p.y = THREE.MathUtils.clamp(p.y, a.y + d * Math.tan(into - BEND), a.y + d * Math.tan(into + BEND));
    };
    if (first <= last) for (let pass = 0; pass < 120; pass++) {
      for (let i = first; i <= last; i++) {
        const a = supports[i - 1], p = supports[i], b = supports[i + 1];
        const w = run(a, p) / (run(a, p) + run(p, b));
        p.y = Math.min(a.y + (b.y - a.y) * w, hf.heightAt(p.x, p.z) + TALLEST * scale);
      }
      clear();
      bendLimit(first, 2, 1);
      bendLimit(last, n - 3, n - 2);
    }
    clear();
    return supports;
  };
  // Where a line tower still kinks the rope, add a tower off the runs in the
  // middle third of its longer span, and settle again.
  let supports = settle(chosen);
  for (let round = 0; round < 6; round++) {
    let added = false;
    for (let i = 3; i < supports.length - 3 && !added; i++) {
      if (Math.abs(ropeDeflection(supports, i)) <= KINK) continue;
      const c = i - 2; // supports[i] stands at chosen[c]
      const before = chosen[c] - chosen[c - 1], after = chosen[c + 1] - chosen[c];
      const [lo, hi] = before >= after ? [chosen[c - 1], chosen[c]] : [chosen[c], chosen[c + 1]];
      if (!(hi - lo >= 3 * SPAN[1])) continue;
      const mid = (lo + hi) / 2;
      for (let d = 0; d <= (hi - lo) / 6 && !added; d += 2) for (const s of [mid + d, mid - d]) {
        if (!added && offPiste(A.x + dir.x * s, A.z + dir.z * s, side)) { chosen.splice(lo === chosen[c] ? c + 1 : c, 0, s); added = true; }
      }
    }
    if (!added) break;
    supports = settle(chosen);
  }
  return { supports, ends, side, dir, length };
}

// A rocking sheave train bisects the incoming and outgoing rope slopes.
export function sheavePitch(points, i) {
  const a = points[i - 1], b = points[i], c = points[i + 1];
  const angle = (p, q) => Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
  return -(angle(a, b) + angle(b, c)) / 2;
}

// How far the rope turns at support i, up or down (radians).
export function ropeDeflection(points, i) {
  const a = points[i - 1], b = points[i], c = points[i + 1];
  const angle = (p, q) => Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
  return angle(b, c) - angle(a, b);
}

// The closed rope, from the bottom station's wheel up the line on one lane
// and back down the other: in through each station's mouth onto its lanes and
// half round its wheel. `layout` is gondolaLayout()'s; distance 0 is the
// bottom station's wheel on the up lane, `upLength` the top station's, and
// `boarding` where riders get in, under the bottom station's canopy.
export function gondolaLoop(layout, scale = 1) {
  const { supports, side } = layout;
  const up = layout.ends[0].P.y <= layout.ends[1].P.y;
  const [bottom, top] = up ? layout.ends : [layout.ends[1], layout.ends[0]];
  const line = up ? supports.slice(1, -1) : supports.slice(1, -1).reverse();
  const lineSide = up ? side : side.clone().negate();
  const g = GAUGE * scale;
  // A station lane: the line's lane `sign` (-1 up, +1 down) in that station's
  // frame, whose `lat` is the line's side at the bottom and the reverse at the top.
  const laneX = (end, sign) => end.wheel.x + sign * (end === bottom ? 1 : -1) * end.wheel.r;
  const strand = (sign) => {
    const pts = [];
    const lane = (end) => { const x = laneX(end, sign); return [stationPoint(end, end.wheel.u, x, end.rope), stationPoint(end, end.mouth, x, end.rope)]; };
    const [bw, bm] = lane(bottom), [tw, tm] = lane(top);
    pts.push(bw);
    if (bm.distanceTo(bw) > 1e-6) pts.push(bm);
    for (const p of line) pts.push(p.clone().addScaledVector(lineSide, sign * g));
    if (tm.distanceTo(tw) > 1e-6) pts.push(tm);
    pts.push(tw);
    return pts;
  };
  // Half round a station's wheel, bulging in toward the station's far end.
  const turn = (end, fromX) => {
    const pts = [], { u, x, r } = end.wheel, s = Math.sign(fromX - x);
    for (let i = 1; i <= 24; i++) {
      const a = Math.PI * i / 24;
      pts.push(stationPoint(end, u - r * Math.sin(a), x + s * r * Math.cos(a), end.rope));
    }
    return pts;
  };
  const upStrand = strand(-1), downStrand = strand(1).reverse();
  const points = [...upStrand, ...turn(top, laneX(top, -1)).slice(0, -1), ...downStrand, ...turn(bottom, laneX(bottom, 1))];
  const acc = [0];
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1] + points[i].distanceTo(points[i - 1]));
  const upLength = upStrand.reduce((sum, p, i) => sum + (i ? p.distanceTo(upStrand[i - 1]) : 0), 0);
  const boarding = (bottom.mouth - bottom.wheel.u) / 2;
  return { points, up: upStrand, acc, total: acc.at(-1), upLength, boarding, bottom, top };
}

// Grade each station's ground: a level pad under it at its `base`, and out
// along the line a cut deep enough for the cabins to leave at the platform's
// height and pass the approach towers (it only lowers the snow out there).
// Full-size stations only (the game's ground); `offPiste` as gondolaLayout's.
// Records each station's approach in `approach` (a Map) for gondolaLayout.
export function shapeGondolaStations(hf, A, B, offPiste, approach) {
  for (const end of gondolaLayout(hf, A, B, { offPiste }).ends) {
    const { P, out, lat, base } = end, reach = end.u2 + CUT_PAST_T2 + 30;
    approach.set(stationKey(P), { base, u1: end.u1, u2: end.u2, a1: end.a1, a3: end.a3 });
    const smooth = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return 1 - t * t * (3 - 2 * t); };
    const i0 = Math.max(0, Math.floor((P.x - reach - hf.x0) / hf.step)), i1 = Math.min(hf.cells, Math.ceil((P.x + reach - hf.x0) / hf.step));
    const j0 = Math.max(0, Math.floor((P.z - reach - hf.z0) / hf.step)), j1 = Math.min(hf.cells, Math.ceil((P.z + reach - hf.z0) / hf.step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = hf.x0 + i * hf.step - P.x, dz = hf.z0 + j * hf.step - P.z;
      const u = dx * out.x + dz * out.z, x = dx * lat.x + dz * lat.z;
      const k = j * hf.verts + i;
      // The pad: the station's footprint and a margin, blending out over 12 m.
      const outside = Math.hypot(Math.max(0, Math.abs(u) - 11), Math.max(0, Math.abs(x) - 10));
      hf.h[k] += (base - hf.h[k]) * smooth(outside / 12);
      // The cut: under the cabins (9 m each side of the axis, a grid cell past
      // the outer cabins) from the mouth on along the approach, blending out
      // over 12 m across and 15 m along. The cabins leave at the platform's
      // height, and from T1 on have the line's clearance and a little more
      // (the grid's interpolation rounds it off).
      if (u < end.mouth - 2) continue;
      const leaving = THREE.MathUtils.clamp((u - end.mouth) / (end.u1 - end.mouth), 0, 1);
      const cap = end.ropeAt(u) - THREE.MathUtils.lerp(CABIN_DEPTH + STATION.floor, LINE_CLEARANCE + 0.3, leaving);
      const w = smooth((Math.abs(x) - 9) / 12) * smooth((u - end.u2 - CUT_PAST_T2) / 15);
      if (hf.h[k] > cap) hf.h[k] -= (hf.h[k] - cap) * w;
    }
  }
}
