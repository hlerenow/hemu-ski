# Rider model sheets

Run `npm run dev` and open `/tools/model-sheet/`.

The page draws model sheets of the two riders from the same GLBs, materials
and ink the game uses (`RiderModel`, `makeToon`, `InkPost`). Every view is
orthographic, at one scale and on one ground line, so proportions can be
measured across the views. The sheets are made to give an image model (GPT and
the like) a reference that holds proportions and colours, which prompts alone
can't do.

## Controls

- **Sheet**: the female rider, the male rider, or both side by side (front and
  left of each, at their real heights).
- **Views**: FRONT, 3/4, LEFT, 3/4 BACK, BACK, RIGHT. LEFT shows the rider's
  left side, facing the left of the picture, as on the asset lab's four-view
  sheets.
- **Arms**: T-pose (arms level), A-pose (45° down), or as modelled (both GLBs are
  bound in a near T-pose). Only the upper arms turn; the rest stays in the bind
  pose.
- **Shading**: the game's three-tone toon, or the textures' flat colours, unlit.
  The sun follows the camera, in front and a little above and to the left, so
  every side is lit the way the front is.
- **Ink**: the game's outlines. **Height guides**: dashed lines at the top of the
  head (beanie and ears included), neck, shoulder, hip, knee and ankle joints,
  measured from the skeleton. **Palette**: see below.
- **Scale**: pixels per metre (600 makes the female 1080 px tall).
- **Save sheet PNG** downloads the whole sheet. **Save each view** downloads
  every view as its own PNG, with no labels, named
  `hemu-ski-<rider>-<view>.png`. The browser may ask once to allow multiple
  downloads.

The palette lists the colours the textures are painted in, by how much of the
figure each one covers in the front, left, back and right views, unlit.
Similar colours are grouped (k-means in OKLab), and each group is shown as the
colour most of it is painted, not as its average, so baked shading doesn't
muddy it. Small parts under 0.6% of the figure are dropped. The same hex
values are printed as text under the sheet, ready to copy.

`window.__sheet` exposes `render(settings)`, `settings()`, `tiles` and
`canvas` for headless capture.

## Using a sheet with an image model

1. Save the sheet, or single views, at 600–900 px/m.
2. Give the model the render as the picture to redraw, plus one style reference
   (the approved 2D master from the asset lab). Say what each image is for:
   "Redraw image 1 as a clean illustrated model sheet. Keep every silhouette,
   proportion, height and colour block exactly. Use the line and cel shading of
   image 2. Change nothing else."
3. Paste the palette's hex values into the prompt for the main parts.
4. Do one rider per generation. Get the front approved first, then fix things
   by editing that image, not by generating from scratch.

## How it works

`InkPost` is written for the game's perspective camera, and lays paper grain
and a vignette over the frame. This page swaps three lines of its fragment
shader at load: depth is read as an orthographic camera's, and the grain and
vignette go, so the background stays one flat colour. If `src/render/post.js`
changes those lines, the page stops with an error that names the missing line.
Nothing in `src/` was changed for this tool.
