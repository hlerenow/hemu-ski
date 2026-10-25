// Flat teal sky with painted, stretched cloud shapes in three tones. `uFloat` 1
// mirrors the sky below the horizon too, for the title's island in the clouds.
// The weather (world/weather.js) paints the rest: a flat sun with a halo, the
// horizon warming toward it at sunrise and sunset, cloud cover, stars and a
// moon at night, and an aurora when it's asked for. Left alone, as the diorama
// and the editor leave it, the sky keeps its plain daytime look.
import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color('#6dbbb8'),
  horizon: new THREE.Color('#bfe2da'),
  cloudLight: new THREE.Color('#e8f5ef'),
  cloudDark: new THREE.Color('#58a7a8'),
};

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith.clone() },
      uHorizon: { value: SKY.horizon.clone() },
      uCloudLight: { value: SKY.cloudLight.clone() },
      uCloudDark: { value: SKY.cloudDark.clone() },
      uTime: { value: 0 },
      uFloat: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.62, 0.55, 0.56).normalize() },
      uSunColor: { value: new THREE.Color('#fffbea') },
      uSun: { value: 0 }, // how much of the sun's disc shows
      uGlow: { value: SKY.horizon.clone() },
      uGlowAmount: { value: 0 },
      uCover: { value: 0 }, // cloud cover, 0 (a few clouds) to 1 (overcast)
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 }, // stars and the moon
      uAurora: { value: 0 }, // the aurora's curtains, in the northern sky
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uCloudLight, uCloudDark;
      uniform float uTime;
      uniform float uFloat;
      uniform vec3 uSunDir, uSunColor, uGlow, uMoonDir;
      uniform float uSun, uGlowAmount, uCover, uNight, uAurora;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
        return s;
      }
      // A flat disc with a crisp edge, as the toon tones are.
      float disc(vec3 d, vec3 c, float r) {
        float a = acos(clamp(dot(d, c), -1.0, 1.0));
        return 1.0 - smoothstep(r - 0.0015, r + 0.0015, a);
      }
      // The aurora: curtains hung east to west across the northern sky, three
      // of them one behind the next. Each is a folded sheet; a ray meets it
      // where it crosses the sheet's line, and how high it crosses says where
      // in the curtain it is: a crisp bright hem along its wavering foot, and
      // above it soft rays fading out, green to violet. Returns how much of the
      // green and of the violet shows.
      vec2 aurora(vec3 d) {
        vec2 a = vec2(0.0);
        if (d.z > -0.02) return a;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float z0 = 0.9 + fi * 0.8; // how far north, in units of the curtains' height
          float t = z0 / -d.z;
          float x = t * d.x;
          // Fold the sheet back and forth, slowly, and cross again where it's moved to.
          float fold = (fbm(vec2(x * 0.3 + fi * 7.3, uTime * 0.015 + fi)) - 0.5) * 2.2;
          t = (z0 + fold) / -d.z;
          x = t * d.x;
          float foot = 0.42 + (fbm(vec2(x * 0.45 + fi * 2.1, uTime * 0.02)) - 0.5) * 0.6;
          float v = t * d.y - foot; // above the curtain's foot, in its heights
          if (v < 0.0 || v > 1.2) continue;
          float rays = noise(vec2(x * 24.0 + fi * 13.0, uTime * 0.2)) * 0.6 + noise(vec2(x * 6.0 - fi * 5.0, uTime * 0.1)) * 0.4;
          rays = smoothstep(0.25, 0.85, rays);
          float hem = smoothstep(0.0, 0.012, v) * (1.0 - smoothstep(0.1, 0.16, v));
          float above = smoothstep(0.0, 0.012, v) * exp(-v / 0.35) * mix(0.3, 1.0, rays);
          // Brighter in stretches along it, gone in others and toward east and west.
          float strength = smoothstep(0.3, 0.55, fbm(vec2(x * 0.2 - uTime * 0.02, fi * 3.7)));
          strength *= (1.0 - smoothstep(2.0, 4.5, abs(x) / z0)) * (1.0 - fi * 0.3);
          float g = clamp(hem * 0.9 + above * 1.1, 0.0, 1.0) * strength;
          float top = smoothstep(0.12, 0.5, v);
          a.x = max(a.x, g * (1.0 - top));
          a.y = max(a.y, g * top * 0.9);
        }
        return a;
      }
      void main() {
        vec3 d = normalize(vDir);
        d.y = mix(d.y, abs(d.y), uFloat);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        col = mix(col, uZenith, uFloat * 0.35);

        // The horizon warms toward the sun: strongest just above it, and round
        // the sky from the sun's side, fading out up toward the zenith.
        vec3 sd = normalize(uSunDir);
        vec2 az = normalize(d.xz + 1e-5), saz = normalize(sd.xz + 1e-5);
        float toward = dot(az, saz) * 0.5 + 0.5;
        float low = 1.0 - smoothstep(0.0, 0.5, h);
        float glow = pow(toward, 2.5) * low * low + pow(max(dot(d, sd), 0.0), 24.0) * 0.6;
        col = mix(col, uGlow, clamp(glow, 0.0, 1.0) * uGlowAmount);

        if (d.y > 0.0) {
          // Stars: one at most to a cell, twinkling, under the clouds.
          if (uNight > 0.0) {
            vec2 suv = d.xz / (d.y + 1.0) * 90.0;
            vec2 cell = floor(suv);
            float s = hash(cell);
            vec2 at = cell + 0.25 + 0.5 * vec2(hash(cell + 3.1), hash(cell + 7.7));
            float r = 0.06 + 0.1 * fract(s * 37.0);
            float star = (1.0 - smoothstep(r * 0.6, r, length(suv - at))) * step(0.93, s);
            star *= 0.6 + 0.4 * sin(uTime * (1.0 + 3.0 * fract(s * 91.0)) + s * 40.0);
            col = mix(col, vec3(1.0, 0.98, 0.9), star * uNight * smoothstep(0.03, 0.2, d.y));
            // The moon, flat and pale, with a soft ring.
            vec3 md = normalize(uMoonDir);
            float halo = pow(max(dot(d, md), 0.0), 300.0);
            col = mix(col, vec3(0.75, 0.8, 0.95), halo * 0.35 * uNight);
            col = mix(col, vec3(0.97, 0.96, 0.88), disc(d, md, 0.026) * uNight);
          }
          // The aurora, over the stars and under the clouds, with a faint
          // green glow along the northern horizon below it.
          if (uAurora > 0.0) {
            float north = smoothstep(0.0, 0.9, -d.z) * (1.0 - smoothstep(0.0, 0.3, h));
            col = mix(col, vec3(0.2, 0.62, 0.48), north * 0.15 * uAurora);
            vec2 a = aurora(d) * uAurora;
            col = mix(col, vec3(0.56, 0.36, 0.78), a.y);
            col = mix(col, vec3(0.42, 1.0, 0.66), a.x * 0.9);
          }
          // The sun, with a ring of halo a step paler than the sky round it.
          float ring = disc(d, sd, 0.075) * 0.22 + disc(d, sd, 0.045) * 0.25;
          col = mix(col, mix(uGlow, uSunColor, 0.5), ring * uSun);
          col = mix(col, uSunColor, disc(d, sd, 0.03) * uSun);

          vec2 uv = d.xz / (d.y + 0.18);
          uv = vec2(uv.x * 0.55, uv.y * 1.3) + vec2(uTime * 0.004, 0.0);
          // Domain warp gives the swirled, brushed look.
          vec2 warp = vec2(fbm(uv * 0.9 + 3.1), fbm(uv * 0.9 + 8.4));
          float n = fbm(uv * 1.1 + warp * 1.2);
          float fade = smoothstep(0.0, 0.25, d.y);
          // More cover lowers the thresholds, until the shapes run together.
          float lt = 0.56 - uCover * 0.2, dt = 0.6 - uCover * 0.22;
          float light = smoothstep(lt, lt + 0.015, n) * fade;
          float dark = smoothstep(dt, dt + 0.015, fbm(uv * 1.6 + warp * 1.6 + 5.0)) * (1.0 - light) * fade;
          // The clouds on the sun's side catch its color.
          vec3 cLight = mix(uCloudLight, uGlow, pow(toward, 3.0) * uGlowAmount * 0.55);
          col = mix(col, uCloudDark, dark * 0.55);
          col = mix(col, cLight, light * 0.85);
          // Overcast: one even layer over all of it.
          col = mix(col, mix(uCloudLight, uHorizon, 0.5), smoothstep(0.6, 1.0, uCover) * 0.7 * fade);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
