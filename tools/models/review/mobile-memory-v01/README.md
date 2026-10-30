# Mobile memory changes — Claude review request

Prepared on 2026-10-30. Repository: `/Users/erichua/Developer/threejs-game-dev`.
Base commit: `d725390` (unused-map removal, already pushed by the owner).
Reviewed by Claude on 2026-10-30 (no blocking issue found) and committed on
`main`. Owner visual approval and physical iPhone validation are still pending.

## Problem and scope

An iPhone reportedly returns to the loading screen after a left swipe at the
start. Memory pressure is a hypothesis, not a confirmed diagnosis. Earlier
estimates double-counted shared truck buffers and treated CPU/GPU memory as
simple additive copies; do not repeat those claims. A desktop browser resized
to phone dimensions cannot establish Safari's process budget or prove a fix.

This batch implements the next resource reductions and loading controls. It
does not change the shadow/hatching shader, sound, physics or input behavior.
Original GLBs and the DEM stay intact. Desktop retains original-resolution
model images and the original backdrop grid. Mesh-free borrowed locomotion
and parser-cache release apply on both profiles.

## Implemented

1. **Versioned 1K phone assets.** `tools/models/mobile-assets.py` creates 15 GLBs
   under `public/models/mobile-v01/`, including optional female/outfit/board
   assets. It resizes images above 1024 px and repacks embedded buffer views.
   Existing 1K/smaller maps remain unchanged. Non-image bytes, accessors,
   hierarchy, skins, animations, texture/material metadata and native axes
   are checked against the source. Manifests and READMEs record hashes,
   dimensions, byte sizes and source paths. Original inputs total 30,797,720 B;
   variants total 22,759,820 B. The important memory reduction comes from pixel
   dimensions, not the comparatively small download reduction. New output is
   accepted on rerun only if byte-identical. Requires Pillow; no runtime
   dependency was added.
2. **Central GLB loader.** `src/render/model-loader.js` routes all shipped GLB
   loads through the manifest and limits mobile download/decode jobs to two.
   Failed jobs release slots; existing per-model promise caches and retry
   behavior remain. Desktop concurrency is unrestricted. The finished result
   drops its `parser` reference because consumers use scenes/clips, never
   parser dependencies. It retains images and geometry arrays needed by
   WebGL context recovery. No memory saving is attributed numerically to
   dropping the parser; reclamation depends on reachability and garbage
   collection. The two-job queue can increase cold-start duration; no timing
   claim has been established.
3. **Stable profile selection.** `src/render/quality.js` chooses once per page
   load, from mobile UA or touch/coarse input with a short screen side <=1024.
   `?quality=mobile` and `?quality=desktop` provide explicit review overrides.
   Resizing a desktop window alone does not opt it in; rotation does not mix
   two asset qualities within existing caches. URL mapping is tested with
   `/`, `./` and `/hemu-ski/` bases.
4. **Lighter phone backdrop.** `createBackdrop(..., { stride: 2 })` samples
   every second original DEM post before allocating the mesh, blur and flow
   arrays: 1001×1001 becomes 501×501 (40 m becomes 80 m spacing). Source DEM,
   physics heights, vertical scale and hidden-overlap sinking are unchanged.
   Mesh array bytes fall from 68,088,044 to 17,044,044. Rock/flow attributes are
   recalculated at the coarse grid, so ridgelines and rock streaks still need
   visual review. No measured total peak-allocation reduction is claimed.
5. **Bounded near-tree instances on phones.** Mobile uses a fixed capacity of
   4096; nearest whole chunks that fit use the near models, and overflow
   chunks retain far-tree coverage. Collision data is independent of this
   selection. Departing chunks are removed before replacements are added.
   Desktop retains dynamic growth. This is a bound on future growth, not a
   large startup-memory saving; preallocating 4096 can use more instance
   storage than the old initial capacity of 2048 in a sparse area.
6. **Mesh-free borrowed walk/run reference.** Male previously loaded the full
   female GLB to borrow two clips. It now loads the 143,436 B
   `motions/rider-locomotion-v02/female-locomotion-v02.glb`. Original node
   transforms and joint declarations are retained so GLTFLoader creates
   Bones, without a character mesh/image. Retargeted male track names, times
   and values match the full source byte-for-byte. A rejected v01 without
   joint declarations is kept only in ignored local output, not shipped.
7. **Manual comparison diagnostics.** `window.__game.memory()` inventories
   unique scene backing buffers and image objects, reports load counters,
   near-tree capacity, and non-finite geometry positions. Shared truck
   submeshes count once. This function is called manually, not per frame.

## Measured comparison

Built preview, same 390×844 viewport, male, intro state, explicit profile
override: `/?quality=desktop&rider=male&notitle` versus
`/?quality=mobile&rider=male&notitle`. Both use this new code, including the
mesh-free animation reference; these figures are not a pre/post process-memory
measurement against the old commit.

| Scene inventory | Desktop | Mobile | Difference |
| --- | ---: | ---: | ---: |
| Unique geometry backing arrays | 166,532,172 B | 115,488,172 B | −51,044,000 B |
| Image RGBA pixel estimate, before mipmaps | 231,346,176 B | 80,351,232 B | −150,994,944 B (144 MiB) |
| Unique image objects | 55 | 55 | 0 |
| Observed peak concurrent GLB jobs | 18 | 2 | bounded on mobile |
| Completed / failed GLB jobs | 20 / 0 | 20 / 0 | no load failures |

See [comparison.json](comparison.json), [desktop-start.json](desktop-start.json)
and [mobile-start.json](mobile-start.json), including fetched GLB paths.
The male run did not fetch the full female GLB. Twelve of the 15 variants are
used at this start; the full manifest's potential RGBA reduction is 180 MiB
before mipmaps when all 15 changed images are present.

These are **scene inventories, not total CPU RAM, measured GPU allocation, or
Safari process memory**. Unattached caches, renderer internals/render targets,
audio, driver overhead and temporary decode allocations are excluded. Do not
multiply the image estimate by two or add these columns into an iOS crash
threshold. Images may be represented differently by the browser/driver.

## Checked

- `npm test` passed, including existing animation/clearance suites and the new
  `tests/mobile-memory.mjs`. After adding explicit motion-manifest hash and
  track-count checks, the focused mobile suite passed again.
- `npm run build` passed; the existing large-bundle warning remains.
- `git diff --check` passed.
- Generator rerun produced byte-identical outputs. Tests verify every source
  and mobile SHA, non-image bytes, kept metadata, profile/base-path routing,
  queued-load failure recovery, shared-buffer deduplication, exact DEM posts,
  finite backdrop attributes, fixed tree capacity across chunk changes,
  retained far trees/collisions, and identical retargeted animation tracks.
- Existing `tests/chair-sitting-animation.mjs` still matches the pre-task copy.

## Observed in the desktop browser

- Normal title/intro/drop-in flow, textured male and female riders, male
  on-foot movement, and the built diorama rendered. Diorama console had no
  warnings/errors in the final session.
- A simulated left drag exercised the touch stick and steered off the run
  without an observed reload. It did **not** establish reproduction of the
  exact reported ~70 km/h fall. Synthetic pointer events on this Mac are not
  physical iPhone touch or Safari validation.
- Five quick menu restarts kept 55 images, 80,351,232 estimated image bytes,
  20 completed GLB jobs, zero failed jobs, and a near-tree capacity of 4096.
  Scene geometry stayed at 115,500,460 B across those samples. This is a short
  smoke check, not an extended leak test: see [restarts.json](restarts.json).
- A forced `WEBGL_lose_context` loss/restore returned to a rendered game with
  `isContextLost() === false`. This checks resource availability for a
  recoverable context loss; an OS-killed tab is a different failure mode.
- No new audio non-finite error was observed in these normal flows. The earlier
  script-teleport audio/mesh NaNs were not reproduced or fixed. The diagnostic
  position scan does not prove every animated transform/physics value is finite.

Screenshots: [male movement](mobile-walk.png), [female](mobile-female.png),
[after left drag](mobile-left-swipe.png), [context restored](mobile-context-restored.png),
[diorama](mobile-diorama.png). Intro comparisons:
[desktop profile](desktop-start.png), [mobile profile](mobile-start.png).

## Pending / deliberately deferred

- Owner visual approval has not happened (Claude's code review is done).
- Physical iPhone Safari validation: measure actual page/process memory and
  loading behavior on cold start, first left-swipe fall, several minutes in
  dense forest, and five restarts. Record device, iOS/browser version, any
  reload message, JavaScript exceptions, and context-loss events. There is no
  confirmed crash fix yet.
- Far mountain ridgelines/rock grain and close-up model textures need visual
  comparison, including the original phone-specific diagonal-line report.
  This batch leaves hatching/shadow settings untouched.
- 512 px small-prop variants remain low priority, per the revised plan.
- KTX2 remains a separate later change. No encoder/runtime decoder was added.
  The cabin repaint currently draws on the source image; compressed textures
  require a compatible repaint/tint design and separate visual comparison.
- Do not discard uploaded images/vertex arrays or enable aggressive disposal
  without proving all consumers and context recovery remain supported.

## Diff ownership

Pre-existing uncommitted chair-seat work in `src/main.js`,
`src/player/rider-model.js`, and `tests/chair-sitting-animation.mjs` was retained.
It is outside this review's scope. In particular `chairHips` and ankle-offset
changes belong to that earlier work, not to the mobile-memory patch. Local
pre-task copies and `preexisting.patch` are in ignored
`output/mobile-memory/baseline/`. Other pre-existing untracked tools/art/docs
are unrelated; do not add them to a commit.

New deliverables are `src/render/{quality,model-loader,memory}.js`,
`tests/mobile-memory.mjs`, `tools/models/mobile-assets.py`, the mobile and
locomotion asset folders, and this evidence folder. Existing runtime edits
route loader calls, select the backdrop/forest settings and borrow the new
motion reference; package/docs register the tests and tool.

## Please review

Review the working tree against `d725390`, excluding the pre-existing chair
hunks above. Inspect actual source and assets rather than accepting this
write-up as proof. Prioritize:

1. URL/profile correctness for GitHub Pages, all load sites, promise-cache
   retries, and whether the two-job queue can stall or leave late consumers
   unready. Check decoder failures and load-order dependencies.
2. GLB repacking integrity, image color/alpha behavior, preservation of source
   assets, and bone/retarget behavior of the mesh-free motion reference.
3. Backdrop sampling/extent/overlap, changed rock-flow appearance, tree LOD
   coverage and capacity across dense chunk boundaries.
4. Whether dropping `gltf.parser` has an overlooked consumer or recovery risk.
   Do not replace retained images/arrays with an unverified disposal scheme.
5. Any claim above that overstates the measured memory saving, crash diagnosis,
   device validation or visual approval.

Return actionable findings first, with severity and file/line references;
separate confirmed issues from hypotheses and remaining phone tests. If no
blocking issue is found, say so explicitly while preserving the pending real
device and visual checks. Review only; do not commit or deploy.
