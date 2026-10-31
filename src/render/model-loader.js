import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import manifest from '../../public/models/mobile-v01/manifest.json';
import { MOBILE } from './quality.js';

// A slot covers download AND GLTF/image decoding. Limiting fetch alone would
// still let all the images decode at once. Failed loads release their slot.
export function loadQueue(limit) {
  let active = 0;
  const pending = [];
  function drain() {
    while (active < limit && pending.length) {
      const { task, resolve, reject } = pending.shift();
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
    }
  }
  return task => new Promise((resolve, reject) => { pending.push({ task, resolve, reject }); drain(); });
}

export function modelURL(url, mobile = MOBILE, base = import.meta.env.BASE_URL) {
  const prefix = base + 'models/';
  if (!mobile || !url.startsWith(prefix)) return url;
  const entry = manifest[url.slice(prefix.length)];
  return entry ? prefix + entry.file : url;
}

const queued = loadQueue(MOBILE ? 2 : Infinity);
export const modelLoads = { active: 0, peak: 0, completed: 0, failed: 0 };

export function loadModel(url) {
  return queued(async () => {
    modelLoads.active++;
    modelLoads.peak = Math.max(modelLoads.peak, modelLoads.active);
    try {
      const gltf = await new GLTFLoader().loadAsync(modelURL(url));
      modelLoads.completed++;
      // The runtime consumes the finished scene/clips, never parser.getDependency.
      // Do not retain the parser's decode caches and original GLB for the life
      // of each cached model. Geometry arrays and images remain for context recovery.
      delete gltf.parser;
      return gltf;
    } catch (error) {
      modelLoads.failed++;
      throw error;
    } finally {
      modelLoads.active--;
    }
  });
}
