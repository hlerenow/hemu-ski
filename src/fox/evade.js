// How a fox gets away from someone chasing it (a skier, in the game): where
// to run and how fast, decided afresh every frame from where the chaser is
// and how it's moving.
//
// A skier is faster than a fox on the straight but can't turn anything like
// as tight. So the fox doesn't just run straight away down the skier's line,
// where it would be run down: it runs off at an angle, to the side of the
// line it's already on. And when the skier closes in, it jukes: a hard cut
// sideways and a little back past the skier, held for a moment, so the skier
// overshoots and has to carve round to come again. Each juke goes to
// whichever side leaves the skier the most turning to do. It keeps near
// home: the further out past `range` it gets, the more its runs bend back
// round.
//
// Ground plane only (x, z), metres and seconds. Headings as three.js turns
// about +y: 0 is +z, π/2 is +x.
import * as THREE from 'three';

const { clamp, smoothstep } = THREE.MathUtils;
const _rel = new THREE.Vector2(), _dir = new THREE.Vector2(), _side = new THREE.Vector2(), _v = new THREE.Vector2();

export const EVADE = {
  top: 8.5, // flat out, m/s (a red fox can do more, briefly)
  trot: 3, // getting clear of someone who isn't coming fast
  wary: 22, // closer than this and coming on, it runs
  safe: 30, // further than this, it can stop
  juke: 5, // m: a chaser this close and closing within `jukeTtc` sets off a juke
  jukeTtc: 2.5, // s to contact
  jukeFor: 0.5, // s the cut is held
  jukeRest: 0.9, // s before another
  // For skiers coming much faster than the fox (the game's downhill riders);
  // the defaults leave them out.
  jukeLead: 0, // s to contact that sets off a juke however far off the chaser still is…
  jukeMiss: 3, // m: …if it's going to pass this close
  waryLead: 0, // s: also runs from a chaser this long off, coming on
  miss: Infinity, // m: a chaser that'll pass further off than this isn't coming at it
  offLine: 0.8, // how hard it runs off the chaser's line, against straight away
  jukeRead: false, // juke on across the chaser's line or cut back, whichever ends further off it
};

export function evadeState() {
  return { mode: 'calm', juke: 0, rest: 0, cut: new THREE.Vector2(), jukes: 0, side: 1 };
}

// `me`: { pos: Vector3, vel: Vector3 }, the fox. `chaser`: { pos, vel }.
// `home`: Vector3 and `range` (m), where it keeps to. `S`: evadeState(),
// kept between frames. Returns { heading, speed, mode } (mode 'calm',
// 'wary', 'flee' or 'juke').
export function evade(dt, me, chaser, S, home = null, range = 40, o = EVADE) {
  _rel.set(me.pos.x - chaser.pos.x, me.pos.z - chaser.pos.z);
  const d = Math.max(_rel.length(), 1e-3);
  _rel.divideScalar(d);
  _v.set(chaser.vel.x - me.vel.x, chaser.vel.z - me.vel.z);
  const closing = _v.dot(_rel); // m/s the gap shrinks
  const ttc = closing > 0.1 ? d / closing : Infinity;
  const cv = Math.hypot(chaser.vel.x, chaser.vel.z);
  // How close the chaser passes if neither turns (the gap at closest approach).
  const vv = _v.lengthSq(), tca = vv > 1e-4 ? (closing * d) / vv : 0;
  const miss = Math.hypot(_rel.x * d - _v.x * tca, _rel.y * d - _v.y * tca);
  S.rest = Math.max(0, S.rest - dt);
  S.juke = Math.max(0, S.juke - dt);

  // The chaser's line, and which side of it the fox is on.
  const line = cv > 0.5 ? _side.set(chaser.vel.x / cv, chaser.vel.z / cv) : _side.copy(_rel).negate();
  const across = new THREE.Vector2(line.y, -line.x); // the line's left (heading +z has its left at +x)
  // Which side it's running off to: kept until it's well over on the other
  // side, so it doesn't swerve back and forth as it crosses the line.
  const off = across.dot(_rel);
  if (Math.abs(off) > 0.35) S.side = Math.sign(off);
  const sideOf = S.side;

  // Juking: a hard cut across the chaser's line, a little back toward where
  // it's come from. To the side the fox is on, unless it's nearly on the line,
  // when it goes to the side away from the chaser's turn.
  const near = (d < o.juke && ttc < o.jukeTtc) || (ttc < o.jukeLead && miss < o.jukeMiss);
  if (!S.juke && !S.rest && near) {
    let side = sideOf;
    if (Math.abs(across.dot(_rel)) < 0.25 && chaser.turn) side = -Math.sign(chaser.turn) || side;
    // Running across the line, it either carries on across or cuts back the
    // way it came. If its run has yet to take it over the chaser's line,
    // they're aiming ahead of it, at where it'll cross: it cuts back, and they
    // have to swing their turn round the other way. On their line already, or
    // past it, it carries on clear.
    const crossing = me.vel.x * across.x + me.vel.z * across.y;
    if (o.jukeRead && Math.abs(crossing) > 1) {
      const tCross = (-off * d) / crossing; // s until it's over the line
      side = Math.sign(crossing) * (tCross > 0.1 && tCross < ttc + 0.5 ? -1 : 1);
    }
    S.cut.copy(across).multiplyScalar(side).addScaledVector(line, -0.35).normalize();
    S.juke = o.jukeFor;
    S.rest = o.jukeFor + o.jukeRest;
    S.jukes++;
  }
  if (S.juke > 0) {
    S.mode = 'juke';
    return out(S.cut, o.top, S);
  }

  // Calm, wary or running.
  // Coming at it; once it's running, it runs until the chaser has stopped
  // gaining or is well back.
  const coming = (closing > 1.5 || (cv > 3 && d < o.wary * 0.6) || (S.mode !== 'wary' && S.mode !== 'calm' && closing > 0 && d < 14))
    && (miss < o.miss || d < o.juke);
  const wary = Math.max(o.wary, closing * o.waryLead);
  if (S.mode === 'calm' && !(d < wary && coming)) return out(null, 0, S);
  if (d > o.safe && !coming) {
    S.mode = 'calm';
    return out(null, 0, S);
  }
  S.mode = coming ? 'flee' : 'wary';
  // Away, and off the chaser's line to the side it's on: more so the faster
  // the chaser comes, since that's where a skier can't follow.
  _dir.copy(_rel).addScaledVector(across, sideOf * clamp(cv / 8, 0, 1) * o.offLine);
  // Bent back round toward home past its range.
  if (home) {
    const hx = home.x - me.pos.x, hz = home.z - me.pos.z, hd = Math.hypot(hx, hz);
    const pull = smoothstep(hd, range * 0.6, range * 1.2) * 1.6;
    if (hd > 1e-3) _dir.x += (hx / hd) * pull, _dir.y += (hz / hd) * pull;
  }
  _dir.normalize();
  const speed = coming ? clamp(o.trot + (wary - d) * 0.6 + closing * 0.4, o.trot, o.top) : o.trot;
  return out(_dir, speed, S);
}

function out(dir, speed, S) {
  return { heading: dir ? Math.atan2(dir.x, dir.y) : null, speed, mode: S.mode };
}
