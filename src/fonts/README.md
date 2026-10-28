# Fonts

Patrick Hand and Patrick Hand SC by Patrick Wagesreiter, under the SIL Open Font License 1.1. `src/style.css` declares them (`@font-face`, split by `unicode-range` as Google Fonts serves them), and the build copies them into `assets/` with a hash in the name. The license texts ship beside the game as `public/fonts/OFL-Patrick-Hand.txt` and `OFL-Patrick-Hand-SC.txt`, so every copy of the fonts goes out with its license, as the OFL asks.

Each file is Google Fonts' woff2 for one subset, unmodified:

| File | Subset | Size | SHA-256 |
| --- | --- | --- | --- |
| `patrick-hand-latin.woff2` | latin | 14,224 B | `42156e008dd5fc3000679ff4e9ba9cbd3f417b6317c6dcbe11a12e9c87a09b28` |
| `patrick-hand-latin-ext.woff2` | latin-ext | 10,604 B | `670f39d1fb3f168229c65b6af8b9016a61915731709c8a1da689e74394bc666f` |
| `patrick-hand-sc-latin.woff2` | latin | 14,292 B | `b72359aef528cf42f0c1822617549d79308e60b0b3dd8a330590237ea7676429` |
| `patrick-hand-sc-latin-ext.woff2` | latin-ext | 10,152 B | `8d2b45858ce928be113004e7ac53be07b302b19abb6b6c9bbcebc8c6d2bf6ce3` |

Neither font has Chinese glyphs; Chinese text falls back to the system's own font.
