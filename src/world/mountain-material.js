// The far mountains: deep winter snow over all of them. The tops are always
// white; dark rock shows through only lower down, in broken streaks down some
// of the gullies. Where is read off the DEM's own relief and flow map
// (`aRelief` and `aFlow`, from createBackdrop in terrain.js). Flat toon tones like the rest of the game. Every edge is
// widened to at least its own size on screen, so detail far finer than a
// pixel averages out instead of turning to grain. Snow cover is an appearance
// model, not winter imagery; the geometry and its silhouette are the DEM's,
// unchanged.
import * as THREE from 'three';
import { makeToon } from '../render/toon.js';

export function mountainMaterial() {
  const mat = makeToon({}, { hatch: 0 });
  const toonCompile = mat.onBeforeCompile;
  const snow = new THREE.Color('#fbfaf4'); // the near terrain's snow
  const rock = new THREE.Color('#4f5358');
  mat.onBeforeCompile = (shader) => {
    toonCompile(shader);
    Object.assign(shader.uniforms, { uMountainSnow: { value: snow }, uMountainRock: { value: rock } });
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aRelief;
      attribute float aFlow;
      varying vec4 vRelief;
      varying float vFlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRelief = aRelief;
        vFlow = aFlow;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uMountainSnow, uMountainRock;
      varying vec4 vRelief;
      varying float vFlow;
      // 0 to 1 across e ± w, and never sharper than a pixel.
      float mStep(float e, float w, float x) {
        float f = fwidth(x);
        return smoothstep(e - w - f, e + w + f, x);
      }`)
      .replace('vec3 base = diffuseColor.rgb;', `
        // Wobble, 125 m and 30 m across, rounds off the edges between DEM
        // posts. Each fades out before it gets finer than a few pixels.
        vec2 wp = vTWorld.xz * 0.008, wq = vTWorld.xz * 0.033 + 3.1;
        float wobble = (tNoise(wp) - 0.5) * 0.5 * (1.0 - smoothstep(0.15, 0.35, length(fwidth(wp))))
          + (tNoise(wq) - 0.5) * 0.35 * (1.0 - smoothstep(0.15, 0.35, length(fwidth(wq))));
        // Rock shows only in the lower part of each mountain: below the
        // ground about 1.5 km round (vRelief.z, ±300 m or so) and 500 m round
        // (vRelief.w), so every top and crest, the lesser ones too, is all
        // snow, with a ragged edge.
        float low = (1.0 - smoothstep(-100.0, 0.0, vRelief.z + wobble * 80.0))
          * (1.0 - smoothstep(-30.0, 20.0, vRelief.w + wobble * 40.0));
        // There it runs in streaks down the gullies the ground drains
        // through (vFlow: log2 of the 40 m posts upstream): the middling
        // ones, which branch and break off at every length. The big
        // channels on the valley floors stay white, and so does gentle
        // ground.
        float gully = smoothstep(4.3, 4.9, vFlow + wobble * 0.5) * (1.0 - smoothstep(5.8, 6.4, vFlow));
        float steep = smoothstep(14.0, 22.0, vRelief.y);
        // Not every gully: some stretches of mountain have none, chosen by
        // domain-warped noise 800 m or so across.
        vec2 q = vTWorld.xz * 0.0012;
        q += vec2(tNoise(q * 1.7 + 3.1), tNoise(q * 1.7 + 8.4)) * 1.6 - 0.8;
        float clusters = smoothstep(0.26, 0.42, tNoise(q) * 0.65 + tNoise(q * 2.3 + 1.3) * 0.35);
        // And a gap here and there along a streak, 170 m or so, fading out
        // before the gaps get finer than a few pixels.
        vec2 b = vTWorld.xz * 0.006 + q * 3.0;
        float fb = 1.0 - smoothstep(0.3, 0.6, length(fwidth(vTWorld.xz)) * 0.006);
        float broken = smoothstep(0.26, 0.36, 0.5 + (tNoise(b) - 0.5) * fb);
        // Together they give how strongly rock shows; past halfway it does, with
        // a crisp edge.
        float rock = mStep(0.5, 0.03, gully * steep * low * clusters * broken);
        vec3 base = mix(uMountainSnow, uMountainRock, rock);
      `)
      // The game's three tones, but the terminator is widened to a pixel and
      // wobbles slowly: the toon's own wobble is finer than a pixel out here.
      .replace('float wob = (tNoise(vTWorld.xz * 0.35 + vTWorld.y * 0.2) - 0.5) * 0.08;', `
        float wob = wobble * 0.1, dw = fwidth(direct);`)
      .replace('float lit = smoothstep(0.24 + wob, 0.30 + wob, direct);', 'float lit = smoothstep(0.24 + wob - dw, 0.30 + wob + dw, direct);')
      .replace('float full = smoothstep(0.55 + wob, 0.6 + wob, direct);', 'float full = smoothstep(0.55 + wob - dw, 0.6 + wob + dw, direct);')
      .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment
        .replace('fogFar, vFogDepth', 'fogFar * (1.0 + 0.8 * smoothstep(9000.0, 17000.0, fogFar)), vFogDepth')
        .replace('fogColor, fogFactor', `mix(fogColor,
        vec3(dot(fogColor, vec3(0.299, 0.587, 0.114))) * vec3(0.91, 0.97, 1.04), 0.5), fogFactor`));
  };
  mat.customProgramCacheKey = () => 'dem-rock-v7';
  return mat;
}
