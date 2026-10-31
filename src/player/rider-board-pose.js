// Board frame: body +z points over the toes. Negative edge roll inclines
// toward the toe edge; Shift deepens the turn while keeping the spine tall.
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const TOE_ARCH = 4; // Multiplier of the original hip/spine back-arch angles.
export class BoardPose {
  constructor() {
    this.state = { edge: 0, deep: 0, tuck: 0, compression: 0, air: 0, grab: 0, touch: 0, twist: 0 };
    this.snap = true;
    this.x = {};
  }
  update(dt, s, time = 0) {
    const air = !!s.air, speed = clamp((s.speed || 0) / 12);
    const lean = clamp(s.lean || 0, -1, 1);
    const deepTarget = s.carve && !air && !s.brake && !s.charge && !s.landing
      ? clamp(Math.abs(lean) / 0.75) * speed : 0;
    const touchTarget = deepTarget && lean > 0.55
      ? deepTarget * (s.snowTouch ? 1 : clamp((lean - 0.65) / 0.3) * clamp(((s.speed || 0) - 7) / 5)) : 0;
    const targets = {
      edge: air ? 0 : lean * speed * (0.35 + deepTarget * 0.95),
      deep: deepTarget, touch: touchTarget,
      tuck: s.tuck && !air && !s.brake ? 1 : 0,
      compression: Math.max(s.charge || 0, clamp((s.landing || 0) / 0.6), s.brake ? 0.5 : 0),
      air: air ? 1 : 0, grab: air && s.grab ? 1 : 0,
      twist: clamp(s.twist || 0, -1, 1),
    };
    for (const key of Object.keys(targets)) {
      const rate = key === 'edge' ? 9 : key === 'compression' ? 16 : 10;
      this.state[key] = this.snap ? targets[key] : this.state[key] + (targets[key] - this.state[key]) * (1 - Math.exp(-Math.max(0, dt) * rate));
    }
    this.snap = false;
    const { edge, deep, tuck, compression, air: flight, grab, touch, twist } = this.state;
    const carve = Math.abs(edge), heel = Math.max(0, edge), toe = Math.max(0, -edge);
    const crouch = clamp(0.08 + heel * 0.25 + toe * 0.2 + tuck * 0.65 + compression * 0.78 + flight * 0.3 + grab * 0.45);
    const breath = Math.sin(time * 2.5) * 0.006 * (1 - tuck) * (1 - flight);
    const x = this.x;
    Object.assign(x, {
      edge, deep, crouch, grab, touch: edge > 0 && lean > 0.55 ? touch : 0,
      px: 0.02 + twist * 0.055, py: 0.78 - crouch * 0.26 - grab * 0.12 + breath,
      pz: -0.055 - crouch * 0.08 - heel * 0.06 + toe * 0.055,
      pPitch: toe * 0.1, pYaw: 0.22 + twist * 0.22, pRoll: -twist * 0.09,
      tPitch: 0.16 + crouch * 0.48 + tuck * 0.33 + heel * 0.1 + grab * 0.8,
      tYaw: 0.22 - twist * 0.32, tRoll: -edge * 0.15,
      hPitch: -0.12 - crouch * 0.35 - tuck * 0.2 - grab * 0.6,
      hYaw: 0.55 - twist * 0.16, hRoll: edge * 0.08,
      kneeOut: 0.12 + carve * 0.1, kneeShift: twist * 0.04, legExtension: 0.96,
      lPitch: -0.45 - toe * 0.2 - flight * 0.3 - tuck * 0.6,
      lRoll: 0.9 + carve * 0.3 - tuck * 0.75 - flight * 0.15,
      lElbow: -0.45 - tuck * 0.95 - flight * 0.3,
      rPitch: -0.65 + heel * 0.15 - tuck * 0.5,
      rRoll: -0.85 - carve * 0.3 + tuck * 0.72 + flight * 0.15,
      rElbow: -0.65 - tuck * 0.85 - flight * 0.3,
    });
    // Toe edge keeps the back arch. Heel contact uses the reference's flexed
    // knees, low left shoulder and relaxed right arm opened up behind it.
    const tall = { py: 0.74 + breath, pz: edge < 0 ? 0.015 : -0.045,
      pPitch: edge < 0 ? -0.06 * TOE_ARCH : 0.12, pRoll: 0,
      tPitch: edge < 0 ? -0.16 * TOE_ARCH - 0.12 : 0.22, tYaw: 0.12, tRoll: edge < 0 ? 0 : -0.18,
      hPitch: -0.08, kneeOut: 0.1, kneeShift: 0,
      legExtension: edge < 0 ? 0.9 : 0.86, crouch: 0.14 };
    for (const [key, target] of Object.entries(tall)) x[key] += (target - x[key]) * deep;
    if (edge > 0) for (const [key, target] of Object.entries({rPitch: -0.35, rRoll: -1.3, rElbow: -0.55})) {
      x[key] += (target - x[key]) * deep;
    }
    return x;
  }
}
