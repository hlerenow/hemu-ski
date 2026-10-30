// Scene inventory for comparison, not total process memory or an iOS limit.
// Shared backing arrays (e.g. truck submeshes) and images count only once.
export function sceneMemory(scene) {
  const buffers = new Set(), images = new Map(), geometries = new Set();
  let geometryBytes = 0, nonFinitePositions = 0;
  const keep = attribute => {
    const array = attribute?.isInterleavedBufferAttribute ? attribute.data.array : attribute?.array;
    if (array && !buffers.has(array.buffer)) { buffers.add(array.buffer); geometryBytes += array.buffer.byteLength; }
  };
  scene.traverse(o => {
    const geometry = o.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      keep(geometry.index);
      for (const a of Object.values(geometry.attributes)) keep(a);
      for (const list of Object.values(geometry.morphAttributes)) for (const a of list) keep(a);
      const p = geometry.attributes.position;
      if (p) for (let i = 0; i < p.count; i++) {
        if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) nonFinitePositions++;
      }
    }
    keep(o.instanceMatrix); keep(o.instanceColor);
    for (const material of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!material) continue;
      for (const texture of Object.values(material)) {
        const image = texture?.isTexture && texture.image;
        if (!image?.width || !image?.height || texture.isRenderTargetTexture || texture.isDataTexture) continue;
        images.set(image, { width: image.width, height: image.height });
      }
    }
  });
  return {
    geometryArrayBytes: geometryBytes,
    imageRGBABytesEstimate: [...images.values()].reduce((n, i) => n + i.width * i.height * 4, 0),
    imageCount: images.size,
    images: [...images.values()],
    nonFinitePositions,
  };
}
