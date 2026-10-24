// Falling snow: flat white flakes in a box of air round the camera. Each flake
// keeps its place in the world (the box wraps round as the camera moves, so you
// ride through the snow rather than carrying it with you), falls at its own
// pace, flutters, and drifts with the wind. `density` thins it out, 0 to 1:
// flakes past it aren't drawn.
import * as THREE from 'three';

const BOX = new THREE.Vector3(72, 40, 72); // metres
const COUNT = 40000;

export class Snowfall {
  constructor() {
    const seed = new Float32Array(COUNT * 4);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COUNT * 4; i++) seed[i] = rnd();
    const geo = new THREE.BufferGeometry();
    // Positions are made in the shader; three still wants a position attribute.
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.uniforms = {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uTime: { value: 0 },
      uFall: { value: 0 }, // how far the snow has fallen, m
      uDrift: { value: new THREE.Vector3() }, // and blown, m
      uDensity: { value: 0 },
      uPx: { value: 800 }, // pixels per metre at 1 m
      uColor: { value: new THREE.Color('#ffffff') },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform vec3 uCam, uBox, uDrift;
        uniform float uTime, uFall, uDensity, uPx;
        varying float vAlpha, vRim;
        void main() {
          if (aSeed.w > uDensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = vRim = 0.0; return; }
          float r = fract(aSeed.w * 97.13 + aSeed.x * 13.7);
          vec3 p = aSeed.xyz * uBox;
          p.y -= uFall * (0.7 + 0.6 * r);
          p += uDrift * (0.8 + 0.4 * r);
          p.x += sin(uTime * (0.9 + r) + r * 40.0) * 0.5;
          p.z += cos(uTime * (0.7 + r) + r * 31.0) * 0.5;
          vec3 o = uCam - uBox * 0.5;
          p = o + mod(p - o, uBox);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = max(-mv.z, 0.01);
          // Faded out toward the box's walls, so nothing pops as it wraps, and
          // right in front of the lens.
          vec3 rel = abs(p - uCam) / (uBox * 0.5);
          float edge = max(rel.x, max(rel.y, rel.z));
          vAlpha = (1.0 - smoothstep(0.7, 1.0, edge)) * smoothstep(0.4, 1.5, dist);
          float size = mix(0.06, 0.15, fract(r * 13.1)) * uPx / dist;
          vRim = smoothstep(4.0, 9.0, size);
          // Too small to draw whole: drawn at a pixel and a half, fainter.
          vAlpha *= clamp(size / 1.5, 0.0, 1.0);
          gl_PointSize = clamp(size, 1.5, 16.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha, vRim;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.4, 0.5, r);
          if (a * vAlpha <= 0.01) discard;
          // The nearer flakes get a grey edge, to read against a white sky.
          float rim = smoothstep(0.25, 0.37, r) * vRim;
          gl_FragColor = vec4(uColor * (1.0 - rim * 0.2), a * vAlpha);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.points.visible = false;
  }

  set density(d) {
    this.uniforms.uDensity.value = d;
    this.points.visible = d > 0.002;
  }

  // `wind` in m/s (x, z); `fall` in m/s.
  update(dt, time, camera, viewHeight, { wind, fall }) {
    const u = this.uniforms;
    u.uCam.value.copy(camera.position);
    u.uTime.value = time;
    // Wrapped, so the numbers stay small enough for the GPU's floats.
    u.uFall.value = (u.uFall.value + fall * dt) % (BOX.y * 1000);
    u.uDrift.value.x = (u.uDrift.value.x + wind.x * dt) % (BOX.x * 1000);
    u.uDrift.value.z = (u.uDrift.value.z + wind.y * dt) % (BOX.z * 1000);
    u.uPx.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
}
