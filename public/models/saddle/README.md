# Kazakh saddle

`kazakh-saddle.glb`: the saddle for the Altai horse (`public/models/horse/`), not yet in the game. A Kazakh saddle in one piece: a painted ochre wooden tree with brass studs, a low pommel with a brass knob, a raised cantle and a dark leather seat cushion, over a thin deep-red felt cloth (tokym) with a dark blue border of cream ram's-horn scrolls. Generated with Tripo (Smart Mesh, four views drawn in ChatGPT from the horse's approved side view), then fitted to this horse's back and skinned to its skeleton in Blender by the asset lab's `03-tripo-exports/saddle-v01/fit_saddle_v01.py`, from the Tripo export `saddle-v01.glb` beside it. The lab is local only, in `~/Developer/hemu-ski-asset-lab` beside this repo; the command is at the top of the script, and the review is in its `04-reviews/saddle-v01/`.

SHA-256 `1e3192982d4bfb759fa7b73c833bf1d6eec11a711085c160b9a6bd48e569ec71`, 1.3 MB. One skinned mesh (8,326 vertices after UV seams, 9,873 triangles), one material with Tripo's 2K JPEG base colour, the horse's 43-bone armature, no animations, no Draco, Meshopt or KTX2.

It is in the horse model's own frame and units, fitted to it at rest: facing +z with its left toward +x, the cloth from z +0.022 (just behind where the mane ends) to −0.259, its lower edge at y 0.365. At the game's 2.6 that is 0.73 m long, 0.87 m across the cloth's lower edges, the cloth hanging to 0.95 m off the ground. The seat's low point is at z −0.103, its cushion 1.56 m up and 6 cm over the spine; the pommel stands 9 cm over it and the cantle 17 cm.

The fit, from Tripo's model:

- Turned to face +z (Tripo's front was −x) and scaled so the cloth is 0.73 m long.
- Bent along its length so the cloth's underside follows the back, 11 mm over the spine and 15 mm more over the withers, where the shoulder blades lift at the gallop.
- Widened at each height so the cloth's inside clears the hide by 11 mm, hanging straight below the barrel's widest point. The tree and studs move with the cloth under them. At rest the cloth is at least 4 mm clear of the hide everywhere (median 22 mm).
- Skinned to the horse's bones, named as the horse's are. The cloth takes the weights of the hide under it, smoothed, so its lower back corners ride with the thighs. The tree, the seat and the cloth under them take only the topline's spine weights (hips to chest), so the saddle bends with the back as the hide does. At the seat that is `spine` 54%, `spine1` 37%.

Bind it to the horse's own skeleton: renumber its joints to the horse's by bone name and `bind(horseMesh.skeleton, horseMesh.bindMatrix)` beside the horse's mesh, as `tools/review/horse-tack.js` does. Its material is double-sided; cast its shadow from the back faces only (`shadowSide = BackSide`), or the thin felt shades itself in stripes.

## Riding fit

Checked 2026-10-27 on the review page (`/tools/review/horse.html`) at 2.6, headless, each gait run 5 s, with both riders seated through `Rider.setLocomotion('sit', seat)`:

| | stand | walk | trot | canter | gallop |
| --- | --- | --- | --- | --- | --- |
| hide into the cloth's inside | 0.1 cm | 0.2 | 0.2 | 0.4 | 0.5 |
| hide clear of the cloth's outside | 0.7 cm | 0.5 | 0.5 | 0.4 | 0.3 |
| seat's drift from the rider's frame (`spine1`) | 0 | 0 | 0 | 0 | 0.1 cm |

The hide never shows through the felt. Its worst moving spot is the side just behind the shoulder blade (model z −0.02, y 0.55).

The rider sits as with the placeholder seat: cushion 1.56 m, stirrups 0.99 m (female) and 1.04 m (male), knees 133° and 137°. A rider's mesh overlaps the saddle a few centimetres where the thick trousers straddle it, the same at every gait since the rider rides with it. The worst is 5 cm (female) and 6 cm (male) of inner thigh against the pommel, 2–4 cm into the seat's sides and cantle, 1–4 cm into the cloth. All of it is inside the trousers; none of it shows from the side, front, back or above.

The stirrup irons, stirrup leathers, girth, bridle and reins are not part of it. The irons and leathers are built in code (`tools/review/horse-tack.js`): brass irons after the stirrup drawn with the saddle's first design sheet, 0.27 m wide and tall, turned 15° toes-out as the boots are, their leathers hanging from the tree's side under the seat and wrapped round each iron's top bar. Neither rider's boot touches an iron's bars, and the soles rest on the treads' pads. The reins are still placeholders and the bridle is yet to be made.
