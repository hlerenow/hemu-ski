# Chairlift Sitting v01

Mixamo “Sitting”, described as “Little Girl Sitting On A Bench Swinging Her Legs”, on SNOWBOARDER_GIRL_FIXED_V2. Posture 63, Swing 6, Overdrive 12, Character Arm-Space 69, Trim 0–48, Mirror off. FBX Binary, Without Skin, 30 fps, no keyframe reduction; Blender 5.2.1 conversion with the asset lab's `Motion Lab/convert-mixamo.py`.

- Source FBX SHA-256: `6bc20a809cd14045ab251e04a8f3677513f3d5ee66034bdbb6b8a28e1e3e5405`
- GLB SHA-256: `f6f7733e697af709cc28e276595df1a44a9d18539ec2094c24d3a595ffaf21e9`
- Animation-only skeleton, 65 bones, 1.5667 s, 30 fps; +Z character forward. No mesh dimensions (skeleton is retargeted to the rider).
- Original and conversion kept in the asset lab at `Motion Lab/chairlift-sitting-v01/`.
- Candidate: female rider with skis on the No. 5 chairlift. Retargeted from immutable bind poses; seated hips anchored to the cushion, hips spread slightly, ski boots constrained forward, skis attached to the moving feet. Clip plays forwards and backwards for a continuous cycle. Other riders, snowboard and other seats retain their prior pose.
- A two-bone leg correction retains the kick while moving each ankle down and back to clear the footrest. Real-chair side and front previews cover eight sampled poses; a regression checks nine lines per ski against the chair mesh at 120 times across the loop, with no sampled intersections. This is not a continuous or full-volume collision proof. Debug-assisted game boarding and arrival were observed; user visual acceptance remains open.
