# Red fox

`red-fox.glb`: the red fox (`src/fox/`), a small Easter egg for players to find. A Tripo-made low-poly fox, rigged in Blender with Rigify's wolf rig, exported by the asset lab's `scripts/export-fox.py` from its `03-tripo-exports/fox-v01/fox-game-test-v01.blend`. The lab is local only, in `~/Developer/hemu-ski-asset-lab` beside this repo; the command is at the top of the script. The .blend is read and never saved.

SHA-256 `bcedd9d0c80c935041cd221bf22cdf3e50bc0450118a3a42682129f7c57e3365`, 287 KB. One mesh (940 vertices, 1,292 after UV seams, 1,876 triangles, every vertex weighted, four weights each at most), one material with a 1K JPEG base colour (the source's normal, roughness and metallic maps are dropped). Scaled up 2.4 times from the Tripo model so it's the dog's size in its own frame, about a unit nose to tail and 0.70 tall to its ear tips: 0.99 × 0.70 × 0.31. Its paws are on the ground at y = 0, facing +z with its left toward +x. The game shows it at 0.9 times that: about 0.4 m at the shoulder.

The skeleton is 33 bones, every one a deform bone, named and chained as the dog's are (`public/models/dog/README.md`) so the dog's rig code drives it:

- `root` (on the ground under the hips) → `hips` → `spine` → `spine1` → `spine2` → `chest` → `neck` → `neck1` → `head` → `ear_L`, `ear_R`
- `hips` → `tail` → `tail1` → `tail2` → `tail3` (root to tip)
- `chest` → `shoulder_L` → `upperArm_L` → `forearm_L` → `pastern_L` → `paw_L`, and `_R`
- `hips` → `thigh_L` → `shin_L` → `hock_L` → `hindPaw_L`, and `_R`

The Rigify rig has 197 deform bones, and the automatic weights use 123 of them. The exporter folds each into the bone it moves with: the toes and pads into the paw, the second half of each limb bone into the first, the pelvis into the hips, the breast into the chest, each ear's five bones into one, and the whole face (jaw, lips, eyelids, brows, nose) into the head. The mesh has no inside to its mouth, so there's no jaw or tongue. `root` and `neck1` carry no weights.

The face is modelled a little off-centre, toward the fox's left: the nose is about 0.04 to its left of the body's centre line. The rig follows the mesh. The fox's right eye looks half shut in the base colour; that's the Tripo texture.

The eyes are painted on, so the game blinks them in the shader: a fur-coloured lid drawn down over each eye, found by the mesh's rest position (`src/fox/rig.js`). The eye centres there are the mean of the Rigify rig's eyelid bones, at (0.095, 0.526, 0.402) and (−0.018, 0.526, 0.402), and they agree with where the pupils are painted.

The game poses the fox in code each frame, as it does the dog: no clips. The source .blend's two actions (a Tripo quadruped walk and a Rigify alignment test) aren't used.

Dev inspection: `/tools/review/fox.html` (dev server only) plays the fox's demonstration scenes.

In the game, `src/fox/fox.js` puts three of them beside the run about 50 m above Cable Car No. 6's bottom station in Jingquan Valley.
