# Mobile 1K model variants · v01

Derived locally from the shipped models after `d725390`. Only embedded images larger than 1024 px were resized with Pillow LANCZOS (JPEG quality 95, 4:4:4). Original GLBs remain unchanged. No paid generation.

Geometry, skins, animation data, node transforms, materials, texture assignments, native dimensions and facing are unchanged. The runtime applies the same sizing/orientation as to each source. All non-image buffer views are verified byte-for-byte. These candidates need phone visual acceptance.

`manifest.json` records full source/output SHA-256, sizes and image dimensions. The runtime reads it to select these files before download. Devices already using 1K textures keep their existing models.

| Source under models/ | Mobile file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `coffee-cabin/coffee-cabin.glb` | `coffee-cabin/coffee-cabin-mobile-v01.glb` | 3,683,260 | `c92e2ab449da33edccae6678a66e20a76ca6b5f46193cb05a72447a03eca521e` |
| `dog/old-english-sheepdog.glb` | `dog/old-english-sheepdog-mobile-v01.glb` | 1,574,444 | `516d9f290fd03dcb06c2b91e44988e72369bc93b067042cefb45bc58766bb18f` |
| `female-rider/board-assembly-seg-tex2k-v01.glb` | `female-rider/board-assembly-seg-tex1k-v01-mobile-v01.glb` | 891,132 | `cdf8041de7fe7d07022664fb215b99c657b376ab74bef351892950a8cd74de55` |
| `female-rider/female-rider-rigfix-walk-run-tex2k-v03.glb` | `female-rider/female-rider-rigfix-walk-run-tex1k-v03-mobile-v01.glb` | 1,697,408 | `9e0ceaa70d6907af40659deb8aa27f9284c32405f3b8273fc95e6b0b2d94ee7a` |
| `female-rider/female-rider-swim-v01.glb` | `female-rider/female-rider-swim-v01-mobile-v01.glb` | 1,730,460 | `29abf02ef631837b5cb5a4a294b61369da6ed1b3b2e8919fe27fc4f83f598fef` |
| `horse/altai-horse.glb` | `horse/altai-horse-mobile-v01.glb` | 1,311,560 | `da287fbb027ad8926f505fc74febfb073a829f931f620cdfe0b978d3082f6c5c` |
| `jetson/jetson-one.glb` | `jetson/jetson-one-mobile-v01.glb` | 1,673,248 | `c4356af6241adec76a92c2a89cf3436eac5ba49ff8d829ec5777b98959d10deb` |
| `lifts/station.glb` | `lifts/station-mobile-v01.glb` | 648,452 | `df30e5c407d846bb998267b05e6e51aaef13dadaa922756e241c05248609ad48` |
| `onsen/cave-rock.glb` | `onsen/cave-rock-mobile-v01.glb` | 450,804 | `cf320ddf2a99662e60d02eb963376f484f0d2c9e03989e1482ad8dcf6fdf1934` |
| `onsen/stone-arena.glb` | `onsen/stone-arena-mobile-v01.glb` | 1,062,588 | `b75949acac32be31830973565bb91506f9ad9e133a1e3087016354f27a2f95d0` |
| `player.glb` | `player-mobile-v01.glb` | 1,649,732 | `7f7743b5625dbd5fd8eb11d1580b303c57f3385b8c5794f835e31c5ed8f969ba` |
| `prayer-wheels/prayer-wheels.glb` | `prayer-wheels/prayer-wheels-mobile-v01.glb` | 1,134,896 | `404958ec5c445baf63e21e1bb3edc396cc7a852a87e58efa936c654f07e1c5b1` |
| `saddle/kazakh-saddle.glb` | `saddle/kazakh-saddle-mobile-v01.glb` | 881,492 | `03224770ac69e13914724387bb8e0526fcdb0f266ea87caf4ed81f82c86a2968` |
| `snowmobile/snowmobile.glb` | `snowmobile/snowmobile-mobile-v01.glb` | 1,453,368 | `c11c5ea331ce43d3cc19ee7ccce0c36c3431125f87d89535f13ea8d18baac74d` |
| `truck/pickup.glb` | `truck/pickup-mobile-v01.glb` | 2,916,976 | `65cb7587a0396f7463c10543547da4c0029bd3ecea177074dfdf1ec875a568c9` |

Native bounds for player-mobile-v01.glb (unchanged model units): X × Y × Z = 0.939786 × 0.978067 × 0.354095. Facing/orientation: exactly the source asset; no node rotation, axis conversion or runtime fitting changed.
