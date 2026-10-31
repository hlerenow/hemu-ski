// The red fox's skeleton (public/models/fox/, exported from its Rigify rig by
// the asset lab's scripts/export-fox.py). Its bones are named and chained as
// the dog's are, so the dog's rig (src/dog/rig.js) poses it; this adds what a
// fox has that the dog doesn't show: ears (posed by DogRig from P.ears) and
// eyes that blink.
//
// The eyes are painted on the texture, so a blink is drawn in the shader: a
// fur-coloured lid comes down over each eye, from the top, with a dark line
// along its edge. Each eye is found by the mesh's rest position, so the lid
// stays on it however the head moves.
import * as THREE from 'three';
import { loadModel } from '../render/model-loader.js';
import { DogRig } from '../dog/rig.js';

const FILE = import.meta.env.BASE_URL + 'models/fox/red-fox.glb';
let loading = null;
export function loadFox() {
  loading ||= loadModel(FILE).catch((err) => { loading = null; throw err; });
  return loading;
}

// Model frame (see the model's README): the eye centres, from the Rigify
// rig's eyelid bones, and each eye's half-size across, up and down, and front
// to back (a little more than the painted eye, so the lid covers it).
const EYES = [new THREE.Vector3(0.095, 0.526, 0.402), new THREE.Vector3(-0.018, 0.526, 0.402)];
const EYE = new THREE.Vector3(0.032, 0.021, 0.032);
const LID = new THREE.Color('#cc7034');

export class FoxRig extends DogRig {
  constructor(gltf) {
    super(gltf);
    // 0 open … 1 shut, left and right.
    this.lids = { value: new THREE.Vector2() };
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material, toon = mat.onBeforeCompile, key = mat.customProgramCacheKey;
      mat.onBeforeCompile = (shader, renderer) => {
        toon(shader, renderer);
        shader.uniforms.uLids = this.lids;
        shader.uniforms.uEyeL = { value: EYES[0] };
        shader.uniforms.uEyeR = { value: EYES[1] };
        shader.uniforms.uEye = { value: EYE };
        shader.uniforms.uLid = { value: LID };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
            varying vec3 vRest;
            uniform vec2 uLids;
            uniform vec3 uEyeL, uEyeR, uEye, uLid;
            // The lid's edge comes down from above the eye to below it as it
            // shuts, curved (lowest in the middle); above the edge is lid,
            // along it a dark line. The lid fades into the fur at its rim.
            vec3 lid(vec3 color, vec3 centre, float shut) {
              vec3 e = (vRest - centre) / uEye;
              float r = dot(e, e);
              if (shut < 0.02 || r > 1.0) return color;
              float edge = mix(1.0, -0.8, shut) + 0.35 * e.x * e.x;
              vec3 lidColor = mix(uLid, color, smoothstep(0.75, 1.0, r));
              if (e.y > edge + 0.12) return lidColor;
              if (e.y > edge - 0.1) return mix(color, uLid * 0.15, smoothstep(1.0, 0.85, r));
              return color;
            }`,
          )
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            diffuseColor.rgb = lid(diffuseColor.rgb, uEyeL, uLids.x);
            diffuseColor.rgb = lid(diffuseColor.rgb, uEyeR, uLids.y);`,
          );
      };
      mat.customProgramCacheKey = () => `${key.call(mat)}-fox-lids`;
    });
  }
}
