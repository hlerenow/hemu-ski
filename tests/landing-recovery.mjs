import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
import { clearGround, rollAssembly } from '../src/player/rider-contact.js';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const { BoardPhysics } = await server.ssrLoadModule('/src/player/physics.js');
  const hf = { half: 500, center: [0, 0], heightAt: () => 0, normalAt: (x, z, out) => out.set(0, 1, 0), holeAt: () => false };
  const make = () => new BoardPhysics({ hf, piste: { distAt: () => 0, groomAt: () => 1 }, forest: { hit: () => null } });
  function drop({ impact = 20, sideways = false, tuck = false } = {}) {
    const p = make(); p.reset(0, 0, 0); p.grounded = false; p.takeoffYaw = 0;
    p.airTime = 4; p.pos.y = 0.01; p.vel.set(sideways ? 15 : 0, -impact, sideways ? 0 : -15);
    p.step(1 / 120, { steer: 0, tuck }); return p;
  }
  for (const impact of [14, 20, 27]) {
    const p = drop({ impact }); assert.equal(p.crashed, 0); assert(p.landingRecovery > 0); assert(p.grounded);
  }
  assert.equal(drop({ impact: 33, tuck: true }).crashed, 0, 'bracing absorbs harder impact');
  assert(drop({ impact: 42, tuck: true }).crashed > 0, 'extreme drops still crash');
  assert(drop({ sideways: true }).crashed > 0, 'sideways landings still catch an edge');
  const p = make(); p.reset(0, 0, 0); p.grounded = false; p.takeoffYaw = 0; p.pos.y = 4; p.vel.set(0, 9, -12);
  let maxFlip = 0, landed = false;
  for (let i = 0; i < 600; i++) {
    p.step(1 / 120, { steer: 0, tuck: true }); maxFlip = Math.max(maxFlip, p.flip);
    if (p.grounded) { landed = true; break; }
  }
  assert(landed && p.crashed === 0); assert(maxFlip > Math.PI * 4, 'holding forward chains multiple front rolls');
  assert.equal(p.events.find(e => e.type === 'air').frontRolls, Math.floor((maxFlip + Math.PI * 2 / 0.9 / 120 + 1e-8) / (Math.PI * 2)), 'landing reports completed rolls including the landing step'); assert.equal(p.flip, 0);
  const short = make(); short.reset(0, 0, 0); short.grounded = false; short.pos.y = 0.1; short.vel.y = -1;
  short.step(1 / 120, { steer: 0, tuck: true }); assert(short.flip > 0, 'forward starts rolling even late in flight');
  for (let i = 0; i < 30 && !short.grounded; i++) short.step(1 / 120, { steer: 0, tuck: true });
  assert(!short.events.some(e => e.type === 'air' && e.frontRolls > 0), 'partial roll earns no completed roll');
  const released = make(); released.reset(0, 0, 0); released.grounded = false; released.pos.y = 100; released.takeoffYaw = 0;
  for (let i = 0; i < 150; i++) released.step(1 / 120, { steer: 0, tuck: i < 30 });
  assert.equal(released.flip, Math.PI * 2, 'release finishes the current roll then stops');
  released.step(1 / 120, { steer: 0, tuck: true });
  assert(released.flip > Math.PI * 2, 'pressing forward again resumes rolling');
  released.reset(0, 0, 0);
  assert.equal(released.flipTarget, 0, 'reset clears pending rolls');
  p.reset(459.9, 0, 0); p.vel.set(25, -25, 0); p.crash('test');
  for (let i = 0; i < 240; i++) { p.step(1 / 120, { steer: 0 }); assert(p.pos.x <= 460); assert.equal(p.pos.y, 0); }
  const recovery = make(); recovery.reset(0, 0, 0); recovery.vel.set(0, 0, -12); recovery.crash('tree');
  let stopped = null;
  for (let i = 0; i < 380; i++) {
    recovery.step(1 / 120, { steer: 0 });
    if (i === 200) stopped = recovery.pos.clone();
    if (i > 200) assert(recovery.pos.distanceTo(stopped) < 1e-9, 'board stays fixed during get-up');
  }
  assert.equal(recovery.events.filter(e => e.type === 'recovered').length, 1, 'one completion event');
  assert(recovery.shakeOff > 0, 'shake starts after standing');
  recovery.step(1 / 120, { steer: 1 }); assert.equal(recovery.shakeOff, 0, 'steering interrupts shake immediately');
  console.log('PASS stationary get-up, one recovery event and interruptible shake');
  // On a 30° slope: the body slides on down it, swings the board round below,
  // stops across the fall line on the uphill edge, and stays while shaking off.
  const a = Math.PI / 6, slopeN = new THREE.Vector3(0, Math.cos(a), Math.sin(a)); // downhill +z
  const hill = { ...hf, heightAt: (x, z) => -z * Math.tan(a), normalAt: (x, z, out) => out.copy(slopeN) };
  for (const [lateral, rest] of [[8, 1], [-8, -1]]) {
    const s = new BoardPhysics({ hf: hill, piste: { distAt: () => 0, groomAt: () => 1 }, forest: { hit: () => null } });
    s.reset(0, 0, Math.PI); s.vel.set(lateral, 0, 4); s.crash('ground');
    const start = s.pos.clone();
    for (let i = 0; i < 3.1 * 120; i++) s.step(1 / 120, { steer: 0 });
    assert(s.pos.z - start.z > 2, `slid ${(s.pos.z - start.z).toFixed(1)} m down the slope`);
    const chest = -Math.sin(s.yaw); // the chest's downhill (+z) component
    assert(Math.abs(chest - rest) < 0.05, `${s.crashMotion.kind}: board across the fall line, chest ${rest > 0 ? 'down' : 'up'} the hill`);
    const stood = s.pos.clone();
    for (let i = 0; i < 2 * 120; i++) s.step(1 / 120, { steer: 0 });
    assert(s.pos.distanceTo(stood) < 1e-6, 'holds still on the slope while shaking off');
  }
  console.log('PASS slope crash: slides, swings the board below, stops across the fall line and holds');
  // An 8 m kicker: a curved ramp 20 m long up to its lip, flat ground beyond.
  const KICK = { height: 8, length: 20 };
  const kickAt = (z) => (z > 0 && z < KICK.length ? KICK.height * (z / KICK.length) ** 2 : 0);
  const ground = {
    ...hf,
    heightAt: (x, z) => kickAt(z),
    normalAt: (x, z, out) => out.set(0, 1, z > 0 && z < KICK.length ? -2 * KICK.height * z / KICK.length ** 2 : 0).normalize(),
  };
  for (const tuck of [false, true]) {
    const ramp = new BoardPhysics({ hf: ground, piste: { distAt: () => 0, groomAt: () => 1 }, forest: { hit: () => null } });
    ramp.reset(0, -20, Math.PI); ramp.vel.set(0, 0, 32);
    let airtime = 0, tookOff = false, touchedDown = false;
    for (let i = 0; i < 1800; i++) {
      ramp.step(1 / 120, { steer: 0, tuck });
      if (!ramp.grounded) { tookOff = true; airtime += 1 / 120; }
      if (tookOff && ramp.grounded) { touchedDown = true; break; }
    }
    assert(touchedDown && airtime > 2, 'large ramp produces a long flight');
    assert.equal(ramp.crashed, 0, 'aligned long-airtime ramp landing recovers');
    console.log(`PASS 8 m kicker at 32 m/s, forward=${tuck}: ${airtime.toFixed(2)} s airtime, no wipeout`);
  }
  console.log('PASS landing absorption, bracing, edge catches, extreme drops, chained/released/partial rolls, crash bounds');
  const root = new THREE.Group(), edge = new THREE.Group(); root.add(edge);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.7, 0.5)); body.position.y = 0.85; edge.add(body);
  edge.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 1.6)));
  const slope = { heightAt: (x, z) => x * 0.25 + z * 0.4 };
  const v = new THREE.Vector3();
  for (let i = 0; i <= 120; i++) {
    root.position.set(0, 0, 0); rollAssembly(edge, -i / 120 * Math.PI * 4, 0.65); clearGround(root, slope);
    root.traverseVisible(o => { if (!o.isMesh) return; for (let k = 0; k < o.geometry.attributes.position.count; k++) {
      o.getVertexPosition(k, v).applyMatrix4(o.matrixWorld); assert(v.y >= slope.heightAt(v.x, v.z) + 0.0249);
    } });
  }
  console.log('PASS complete assembly rolls stay above sloped terrain');
} finally { await server.close(); }
