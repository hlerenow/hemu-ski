# Model tools

## mobile-assets.py

```bash
python3 tools/models/mobile-assets.py
```

Requires Pillow. Builds new files under `public/models/mobile-v01/`, leaving the
source GLBs intact. Embedded images larger than 1024 px are resized with LANCZOS;
JPEG output uses quality 95 and 4:4:4 chroma. All other buffer views, accessors,
nodes, meshes, skins, materials and animation metadata are checked against the
source. `manifest.json` records source/output hashes, sizes and dimensions.
Existing assets are accepted only if byte-identical; use a new version for a
changed source or recipe.

Also extracts the female walk/run hierarchy and clips to
`motions/rider-locomotion-v02/`, without meshes or textures. Joint declarations
are retained so GLTFLoader creates Bones. The male rider uses this reference
instead of loading the whole female model. The regression test compares the
resulting retargeted tracks to the original.

All shipped GLBs go through `src/render/model-loader.js`: phones select the
manifest variant before loading, with at most two downloads/decodes in flight.
Desktop keeps the original files and concurrency. The completed result does
not retain GLTFLoader's parser cache; images/vertex arrays remain available for
context recovery. Per-model promise caches remain shared and release failed
requests for retry.

`?quality=mobile` and `?quality=desktop` force a profile for comparison. Otherwise
mobile user agents and touch/coarse devices with a short screen side <=1024 px
use mobile resources. Selection is fixed for the page lifetime, including
rotation. Resizing a desktop window alone does not select phone assets.

`npm test` includes `tests/mobile-memory.mjs`: immutable asset hashes/non-image
bytes, subpath URLs, a failing queued load, exact DEM posts, finite attributes,
fixed forest capacity and byte-identical retargeted locomotion. For the running
game, `window.__game.memory()` returns a scene inventory; it excludes unattached
caches, renderer internals and audio, and is not total CPU/GPU process memory.

Implementation, measured comparisons, screenshots, review scope and pending
device checks: [mobile-memory-v01 review](review/mobile-memory-v01/README.md).

## strip-maps.mjs

```bash
node tools/models/strip-maps.mjs public/models/<name>/<file>.glb
```

The toon shader (`src/render/toon.js`) draws only a material's base colour map, so the normal, metallic-roughness and occlusion maps Tripo bakes into a GLB are downloaded and decoded on every load for nothing. On a phone that is memory the game can't spare. The script removes those slots, then every texture, image and buffer view nothing refers to any more, and repacks the binary in place. Geometry, skins, animations and the base colour image come through byte for byte. It prints the size and SHA-256 before and after, for the model's README.

Run it on a GLB when it comes over from the asset lab, before committing it. The lab keeps the full original.

Stripped on 2026-10-29 (each dropped a normal map and a metallic-roughness map):

| File | Before | After | SHA-256 after |
| --- | --- | --- | --- |
| `public/models/player.glb` | 9,568,080 B, `5f53e2d0…6a63748` | 2,549,476 B | `be5648986a83685d2fb7c45be9885976204aad26340e4817e22bd7c797035e6c` |
| `public/models/lifts/station.glb` | 1,959,300 B, `cac827e9…3a3343f` | 1,033,016 B | `c5fa5bd0d4f0c066b1c0b6a7e6b8160bfff77f83a76f43efa56ba3d0578bce42` |
| `public/models/lifts/chair.glb` | 539,240 B, `4613dafa…26174ee` | 251,252 B | `3c67c7305c40425a4818d0614dd612a3159cf5b3a876735042db78c2f438a860` |
| `public/models/snowmobile/snowmobile.glb` | 3,389,972 B, `81ba31bd…c6a50424` | 1,978,420 B | `34ff826815f885d3c17b42aee14a7a1b902917b0d0a2bd2c2d11366ca6ada45c` |
