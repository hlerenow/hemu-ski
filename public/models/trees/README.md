# Trees

`trees.glb`: the forest's trees (`src/world/trees.js`, `loadTreeModels()`), baked by `tools/trees/bake.mjs` from Cenji's Low Poly Winter Nature Pack (free edition, `GLB/` folder; kept outside this repo). SHA-256 `ba59cc9789d5060a099d9b7604b5bab54dee0983400397f8ef9d71de3bfc352f`, 274 KB (the nine source files are 18 MB).

Nine trees, each a node and mesh named `<species>-<variant>_lod<n>`: `lod0` about 1,400 triangles (the birches keep their 1,032), `lod1` about 300, simplified with meshoptimizer. Each holds positions, `COLOR_0` (normalised bytes; the pack's plain material colours repainted in the game's palette) and 16-bit indices, with no normals, materials or textures: the game makes them flat-shaded and draws them with its toon material.

| Name | Pack file | Height |
| --- | --- | --- |
| `spruce-a` | `TREE_09_FirLargeSnowy` | 14 m |
| `spruce-b` | `TREE_10_FirMediumSnowy` | 11.5 m |
| `spruce-c` | `TREE_04_PineTallThin` | 15 m |
| `larch-a` | `TREE_07_PineSparse`, needles turned bare grey-brown | 15 m |
| `larch-b` | `TREE_08_PineYoung`, the same | 9 m |
| `pine-a` (Siberian stone pine) | `TREE_05_PineWide` | 11 m |
| `pine-b` | `TREE_12_EvergreenWindblown` | 10 m |
| `birch-a` | `TREE_13_BareLarge`, white trunk below 42% of its height | 11 m |
| `birch-b` | `TREE_16_TwistedWinter`, white below 38% | 9 m |

Each stands on its foot at y = 0, at its height for size 1; facing doesn't matter (the forest turns each tree at random).

Licence: Cenji's, allowing use in personal and commercial projects and modification, but not redistributing the assets, raw or modified, as a standalone pack. This file is shipped as part of the game.
