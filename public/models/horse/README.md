# Altai horse

`altai-horse.glb`: a rideable horse for the riders (`src/horse/`), not yet in the game. A Tripo-made stocky bay mountain horse, rigged in Blender with Rigify's horse rig, exported by the asset lab's `scripts/export-horse.py` from its `03-tripo-exports/horse-rig-v01/horse-rig-v01.blend` (built from the Tripo model by `build_horse_rig_v01.py` beside it). The lab is local only, in `~/Developer/hemu-ski-asset-lab` beside this repo; the commands are at the top of the scripts. The .blend is read and never saved.

SHA-256 `ee47a4aa73ea2b10d0f0de944067c2db27a523068fc6076b2b2ee16f0d072bd1`, 1.7 MB. One mesh (7,664 vertices, 16,158 after UV seams, 14,999 triangles, down from Tripo's 40k; every vertex weighted, four weights each at most), one material with the source's 2K JPEG base colour, no animations. About a unit long nose to tail and 0.807 tall to its ear tips, hooves on the ground at y = 0, facing +z with its left toward +x, as the dog and fox do. The game shows it at 2.6 times that: about 1.64 m at the withers, 0.69 m across the barrel and 2.6 m long, a full-sized riding horse beside the 1.80 m riders, whose feet reach about its belly line in the saddle.

The skeleton is 43 bones, every one a deform bone, each pointing along its own +y to the next joint:

- `root` (on the ground under the middle) → `hips` → `spine` → `spine1` → `spine2` → `chest` → `chest1` → `neck` → `neck1` → `neck2` → `neck3` → `head` → `ear_L` → `ear1_L`, and `_R`
- `hips` → `tail` → `tail1` → `tail2` → `tail3` → `tail4` (root to tip)
- `chest` → `shoulder_L` → `upperArm_L` → `forearm_L` (elbow to knee) → `cannon_L` (knee to fetlock) → `pastern_L` → `hoof_L`, and `_R`
- `hips` → `thigh_L` (hip to stifle) → `shin_L` (stifle to hock) → `hindCannon_L` (hock to fetlock) → `hindPastern_L` → `hindHoof_L`, and `_R`

The mane (with the forelock) and the tail are their own shells. The mane is weighted only to the spine, neck and head, so it doesn't move with a shoulder; the closed mouth and the eyes move with the head. `root` carries no weights.

Lowering the neck more than about 48° from where it stands (shared from the base: `chest1` 45%, `neck` 30%, `neck1` 15%, `neck2` 10%) folds it into the chest, so a grazing head reaches about the knees; lower than that needs the front legs spread.

## Riding fit

Checked 2026-10-27 with placeholder tack on the review page: a pad and seat moulded to the back, stirrups and reins, the rider seated through the game's own seated pose (`Rider.setLocomotion('sit', seat)`, as on the snowmobile). At 2.6:

- The seat's low point, between pommel and cantle, is 0.25 m behind the middle of the horse (model z −0.095) with its cushion 1.56 m up. The seat runs from model z +0.015 to −0.21 (0.59 m), the pad from +0.03 to −0.25; in front of that the mane starts.
- Stirrups 0.42 m out from the middle: any narrower and the riders' legs run into the 0.69 m barrel. Their legs spread round it and the knees turn out, as short chibi legs must.
- Stirrup treads 0.98 m up for the female rider and 1.03 m for the male, who sits higher on his cushion: about 0.55 and 0.50 m under the cushion, a little ahead of the hips. Both knees are then about 135° bent, and the legs stay within 2 cm of the hide. At 0.60 the male's foot no longer reaches.
- Hands 0.22 m over the cushion and 0.32 m ahead of the hips; the reins run from the bit back along the outside of the neck.

The placeholder pad and seat have since given way to the Kazakh saddle (`public/models/saddle/`), fitted and skinned to this horse, its cushion at the same 1.56 m and its low point at z −0.103; its README has the fit through the gaits.

## Gaits

`src/horse/` poses it in code every frame, as the dog is posed: no clips. `rig.js` (HorseRig) turns the bones to a pose: each leg reaches its hoof by two-bone IK to the top of the cannon, with the cannon, pastern and hoof pointed below it, and a foreleg's shoulder blade swinging with it. The forelegs stand almost straight (0.38 of their 0.39 reach), so when one can't reach, the fetlock straightens and the hoof stays planted. `body.js` (HorseBody) works out the pose from `speed` and `turnRate`: walk, trot, canter (left lead) and gallop (left lead), blending as the speed changes, with Muybridge's footfall timings. At 2.6:

| Gait | Speed | Strides/s | Stride | Down for |
| --- | --- | --- | --- | --- |
| walk | 1.7 m/s | 1.0 | 1.7 m | 62% |
| trot | 3.8 | 1.45 | 2.6 | 38% |
| canter | 6.5 | 1.7 | 3.8 | 33% |
| gallop | 11 | 2.0 | 5.5 | 25% |

It changes gait at about 2.5, 5.2 and 8.7 m/s. Checked side by side against Muybridge's *Animal Locomotion* plates (626 gallop, 618 and 620 canter, 591 trot; 1887, public domain): the topline stays near level (a pitching, arching back made it bound like a dog), the legs sweep long, a foreleg reaching out straight past where it lands and a hind leg trailing straight behind as it pushes off, folding tight only in the gathered moment; in the air each knee or hock follows a smooth path through keyframes. The neck is up and arched at the canter and reaches out low at the gallop, the head stretched on it; the tail is carried out behind at the gallop and arched at the canter. The neck, head and tail follow on damped springs, a moment behind the body. A planted hoof's toe holds still on the ground through its stance (at most 0.2 m/s of slip in a frame, a planted leg at most 1.2 cm short).

## Standing

Standing, it never freezes (`src/horse/idle.js`, after how relaxed horses stand): it breathes about 12 times a minute, shifts its weight side to side every few seconds, lets its head drift between up and alert, low and easy, and a look to one side, with a slow bob, flicks each ear on its own, swishes its tail every 4–12 s, rests a hind leg on its toe with that hip dropped and changes legs every 15–40 s, and now and then stamps, shakes its head or sniffs the ground. Each runs on its own clock from a seeded random, so they overlap differently every time and never loop. `HorseBody.idling = false` holds it still.

Dev inspection: `/tools/review/horse.html` (dev server only) shows it toon-shaded and inked as the game draws things, with a rider in the saddle or beside it, each gait in place on a treadmill (with how fast the planted hooves slide and how far a planted leg falls short), standing idle (what it's doing, and a switch to hold it still), sliders for the neck, head, ears, tail and each leg on top, and the riding fit's sliders and readouts (knee angles, how far each leg runs into the horse). `__horse.step(dt)` runs a frame by hand when the page is hidden.
