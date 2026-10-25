// Time of day and weather. The sun keeps Hemu's real path for the 1st of
// March (48.7°N; the clock is local solar time, noon with the sun due south),
// and how high it stands picks the colors: the sky, the haze, the clouds, and
// the toon tones every lit surface is painted in (render/toon.js), warm at
// sunrise and sunset and blue by moonlight. The weather lays cloud, flat light,
// haze and falling snow (world/snowfall.js) over that, easing from one kind to
// the next. An aurora can hang in the northern sky through the night, behind
// whatever cloud there is. Painted rather than simulated, so it keeps the
// game's look.
import * as THREE from 'three';
import { Snowfall } from './snowfall.js';

const DEG = Math.PI / 180;
const LAT = 48.7 * DEG;
const DECL = -7.8 * DEG; // the sun's declination on the 1st of March
const HORIZON = -0.83 * DEG; // the sun's top edge, refracted, at sunrise and sunset

// Where the sun is at `hour` (solar time), as a unit vector: x east, y up,
// z south. `decl` puts the moon (full, so twelve hours round) on its own path.
export function sunDirection(hour, out = new THREE.Vector3(), decl = DECL) {
  const H = ((hour - 12) / 24) * Math.PI * 2;
  const east = -Math.cos(decl) * Math.sin(H);
  const north = Math.cos(LAT) * Math.sin(decl) - Math.sin(LAT) * Math.cos(decl) * Math.cos(H);
  const up = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
  return out.set(east, up, -north);
}

// The hours the sun rises and sets.
export const SUNRISE = 12 - Math.acos((Math.sin(HORIZON) - Math.sin(LAT) * Math.sin(DECL)) / (Math.cos(LAT) * Math.cos(DECL))) / DEG / 15;
export const SUNSET = 24 - SUNRISE;

// The day's colors, by how high the sun stands (degrees). `glow` is the
// horizon toward the sun, `lit` and `shadow` the toon tones, `fogInk` the color
// far ink lines fade to.
const KEYS = [
  { alt: -14, zenith: '#16223d', horizon: '#2c3d63', glow: '#2c3d63', glowAmount: 0, cloudLight: '#3d5079', cloudDark: '#1d2b4b', lit: '#a9b9e0', shadow: '#5a6c96', sun: '#ff9a5c', fogInk: '#22304d', night: 1 },
  { alt: -7, zenith: '#2a3766', horizon: '#7d6f9e', glow: '#d98a86', glowAmount: 0.8, cloudLight: '#a07fa8', cloudDark: '#3c4777', lit: '#b4b3d6', shadow: '#6c74a4', sun: '#ff9a5c', fogInk: '#3d4670', night: 0.45 },
  { alt: -1.5, zenith: '#46609a', horizon: '#e6a39a', glow: '#ffb27a', glowAmount: 1, cloudLight: '#f6b9a4', cloudDark: '#7c6e9c', lit: '#e8c0b8', shadow: '#7d86b4', sun: '#ffe2b8', fogInk: '#6a6890', night: 0 },
  { alt: 4, zenith: '#5c8fbf', horizon: '#f5c79a', glow: '#ffb06a', glowAmount: 1, cloudLight: '#ffd9b2', cloudDark: '#b98a99', lit: '#ffcf9a', shadow: '#8d99c6', sun: '#fff0d0', fogInk: '#7d7f9a', night: 0 },
  { alt: 12, zenith: '#68aebb', horizon: '#dbe6cf', glow: '#f8e2b8', glowAmount: 0.6, cloudLight: '#f7f0de', cloudDark: '#6ca4aa', lit: '#ffefd6', shadow: '#9dbfcc', sun: '#fff8e4', fogInk: '#62909a', night: 0 },
  { alt: 25, zenith: '#6dbbb8', horizon: '#bfe2da', glow: '#e4efdc', glowAmount: 0.3, cloudLight: '#e8f5ef', cloudDark: '#58a7a8', lit: '#fff6e6', shadow: '#9fc4cc', sun: '#fffbea', fogInk: '#5d8f97', night: 0 },
].map((k) => Object.fromEntries(Object.entries(k).map(([key, v]) => [key, typeof v === 'string' ? new THREE.Color(v) : v])));
const COLORS = ['zenith', 'horizon', 'glow', 'cloudLight', 'cloudDark', 'lit', 'shadow', 'sun', 'fogInk'];

// The kinds of weather. `cover` is the sky's cloud, `overcast` how flat the
// light goes, `snow` how thick the snowfall, `wind` m/s from the west-north-
// west, `fog` the haze's near and far, m.
export const WEATHERS = {
  clear: { label: 'Clear', cover: 0, overcast: 0, snow: 0, wind: 0.5, fog: [900, 17000] },
  cloudy: { label: 'Cloudy', cover: 0.7, overcast: 0.45, snow: 0, wind: 2, fog: [700, 9000] },
  snow: { label: 'Snowing', cover: 0.95, overcast: 0.8, snow: 0.3, wind: 1.5, fog: [160, 2400] },
  blizzard: { label: 'Blizzard', cover: 1, overcast: 1, snow: 1, wind: 9, fog: [25, 420] },
};
// What "changeable" weather may turn into next.
const NEXT = { clear: ['clear', 'cloudy'], cloudy: ['clear', 'snow', 'cloudy'], snow: ['cloudy', 'blizzard', 'snow'], blizzard: ['snow'] };
const WIND_DIR = new THREE.Vector2(0.92, 0.38).normalize(); // blowing toward the east-south-east
const AURORA = new THREE.Color('#5fd99a'); // the green it casts on the snow

// How fast the day goes by: a game minute a second, slower round sunrise and
// sunset so they linger, and much quicker through the dark.
function pace(alt) {
  if (alt < -9) return 6;
  if (alt > -6 && alt < 8) return 0.5;
  return 1;
}

const _c = new THREE.Color(), _grey = new THREE.Color(), _wind = new THREE.Vector2();
const lum = (c) => c.r * 0.299 + c.g * 0.587 + c.b * 0.114;

export class Weather {
  // `sky` from world/sky.js, `sun` the DirectionalLight, `post` the InkPost,
  // `toon` its toonUniforms, `water` the lakes (world/lakes.js).
  constructor({ scene, sky, sun, post, toon, water }) {
    Object.assign(this, { scene, sky, sun, post, toon, water });
    this.hour = 10.5;
    this.running = true;
    this.kind = 'clear'; // or 'changeable'
    this.title = false; // the title's island in the clouds: no haze, no snow
    this.aurora = false; // whether there's an aurora tonight
    this.auroraNow = 0; // how much of it's showing, easing in and out
    this.sunDir = new THREE.Vector3(); // where the sun really is
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3(); // where the light comes from: the sun, or by night the moon
    this.altitude = 0; // the sun's, degrees
    this.snowfall = new Snowfall();
    scene.add(this.snowfall.points);
    // What's showing now, easing toward the kind of weather wanted.
    this.now = { ...WEATHERS.clear, fog: [...WEATHERS.clear.fog] };
    this.current = 'clear'; // the kind it's turning into
    this.changeIn = 0;
    this.c = Object.fromEntries(COLORS.map((k) => [k, new THREE.Color()]));
    this.haze = new THREE.Color();
    this.update(0);
    this.settle();
  }

  set(kind) {
    this.kind = kind;
    if (kind !== 'changeable') this.current = kind;
    else this.changeIn = 0;
  }

  // Jump straight to the weather wanted, without easing into it.
  settle() {
    const w = WEATHERS[this.current];
    Object.assign(this.now, w, { fog: [...w.fog] });
    this.auroraNow = this.aurora ? 1 : 0;
  }

  // What part of the day it is, for the menu.
  get phase() {
    const a = this.altitude, am = this.hour < 12;
    if (a < -12) return 'Night';
    if (a < -0.83) return am ? 'Dawn' : 'Dusk';
    if (a < 6) return am ? 'Sunrise' : 'Sunset';
    return this.hour < 11 ? 'Morning' : this.hour < 13.5 ? 'Midday' : 'Afternoon';
  }

  // `camera` (and its view's height, px) for the snowfall; `focus` is where the
  // sun's shadows are needed.
  update(dt, { time = 0, camera, viewHeight, focus } = {}) {
    sunDirection(this.hour, this.sunDir);
    this.altitude = Math.asin(this.sunDir.y) / DEG;
    if (this.running) this.hour = (this.hour + (dt * pace(this.altitude)) / 60) % 24;
    sunDirection(this.hour + 12, this.moonDir, -DECL);
    const alt = this.altitude;

    // Changeable weather moves on every two to four minutes.
    if (this.kind === 'changeable' && (this.changeIn -= dt) <= 0) {
      const next = NEXT[this.current];
      this.current = next[Math.floor(Math.random() * next.length)];
      this.changeIn = 120 + Math.random() * 120;
    }
    const want = WEATHERS[this.current], now = this.now;
    const k = 1 - Math.exp(-dt / 5);
    for (const key of ['cover', 'overcast', 'snow', 'wind']) now[key] += (want[key] - now[key]) * k;
    // The haze closes in and clears on a log scale, as you'd see it.
    for (let i = 0; i < 2; i++) now.fog[i] = Math.exp(Math.log(now.fog[i]) + (Math.log(want.fog[i]) - Math.log(now.fog[i])) * k);
    this.auroraNow += ((this.aurora ? 1 : 0) - this.auroraNow) * k;

    // The time of day's colors.
    let i = 0;
    while (i < KEYS.length - 2 && alt > KEYS[i + 1].alt) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(alt, a.alt, b.alt);
    const c = this.c;
    for (const key of COLORS) c[key].lerpColors(a[key], b[key], t);
    const glowAmount = THREE.MathUtils.lerp(a.glowAmount, b.glowAmount, t);
    const night = THREE.MathUtils.lerp(a.night, b.night, t);

    // Cloud greys them: toward their own brightness, a touch cool.
    const grey = now.overcast * 0.75;
    for (const key of ['zenith', 'horizon', 'cloudLight', 'cloudDark', 'lit', 'shadow', 'fogInk']) {
      const v = lum(c[key]);
      c[key].lerp(_grey.setRGB(v * 0.97, v, v * 1.04), grey);
    }
    // The aurora, out once it's properly dark and hidden by cloud, as the stars
    // are, puts a little of its green on the snow and the lakes.
    const aurora = this.auroraNow * THREE.MathUtils.smoothstep(night, 0.4, 1) * (1 - now.cover);
    for (const key of ['lit', 'shadow', 'horizon']) c[key].lerp(AURORA, aurora * (key === 'horizon' ? 0.08 : 0.14));
    // Snow lightens the air: the haze goes pale, as the falling snow is.
    this.haze.copy(c.horizon).lerp(_c.setRGB(1, 1, 1), 0.15 + now.snow * 0.25);
    if (now.snow > 0) c.zenith.lerp(this.haze, now.snow * 0.5);

    // The light: from the sun while it's up, from the moon at night. The
    // contrast between lit and shadow sinks to nothing between the two, so the
    // swap doesn't show, and thins under cloud.
    const sunUp = alt > -4;
    this.lightDir.copy(sunUp ? this.sunDir : this.moonDir);
    this.lightDir.y = Math.max(this.lightDir.y, 0.06);
    this.lightDir.normalize();
    const contrast = (sunUp ? THREE.MathUtils.smoothstep(alt, -4, 0) : THREE.MathUtils.smoothstep(-alt, 4, 9) * 0.7)
      * (1 - now.overcast * 0.85);
    this.toon.uShadowTint.value.copy(c.shadow);
    this.toon.uLitTint.value.copy(c.shadow).lerp(c.lit, contrast);

    // The sky.
    const u = this.sky.material.uniforms;
    u.uZenith.value.copy(c.zenith);
    u.uHorizon.value.copy(c.horizon);
    u.uCloudLight.value.copy(c.cloudLight);
    u.uCloudDark.value.copy(c.cloudDark);
    u.uGlow.value.copy(c.glow);
    u.uGlowAmount.value = glowAmount * (1 - now.overcast * 0.8);
    u.uSunColor.value.copy(c.sun);
    u.uSunDir.value.copy(this.sunDir);
    u.uSun.value = THREE.MathUtils.smoothstep(this.sunDir.y, -0.04, 0.0) * (1 - now.cover);
    u.uMoonDir.value.copy(this.moonDir);
    u.uNight.value = night * (1 - now.cover);
    u.uAurora.value = aurora;
    u.uCover.value = now.cover;

    // The haze, and the far ink lines fading into it.
    const fog = this.scene.fog;
    fog.color.copy(this.haze);
    fog.near = this.title ? 1e7 : now.fog[0];
    fog.far = this.title ? 2e7 : now.fog[1];
    if (this.scene.background?.isColor) this.scene.background.copy(c.horizon);
    const pu = this.post.material.uniforms;
    pu.uFogInk.value.copy(c.fogInk).lerp(this.haze, now.overcast * 0.6);
    pu.uFogRange.value.set(fog.near * 0.9, fog.far * 0.82);
    this.water?.setSky(_c.copy(c.horizon).lerp(c.zenith, 0.3));

    // The sun (or moon) follows you, for the shadows round you.
    if (focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(this.lightDir, 250);
    }

    // The snow, lit as the snow on the ground is.
    const snow = this.snowfall;
    snow.density = this.title ? 0 : now.snow;
    if (camera) {
      snow.uniforms.uColor.value.copy(this.toon.uLitTint.value).lerp(_c.setRGB(1, 1, 1), 0.65);
      _wind.copy(WIND_DIR).multiplyScalar(now.wind);
      snow.update(dt, time, camera, viewHeight, { wind: _wind, fall: 1.1 + now.wind * 0.08 });
    }
  }
}
