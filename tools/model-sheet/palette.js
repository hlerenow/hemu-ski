// The few colours an image is painted in, by how much of it each covers:
// weighted k-means in OKLab (where distance follows what the eye sees) over the
// image's colours binned to 5 bits a channel. Each cluster is named by its
// most-painted bin, not its mean, so the baked shading and the blur between
// two colours don't muddy it; clusters whose colours look alike are merged and
// the slivers dropped. Deterministic: the same pixels give the same swatches.

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function oklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// `rgb`: sRGB bytes, three a pixel. `k`: clusters to start from; `merge`: the
// OKLab distance under which two are one colour; `minShare`: the smallest
// share of the pixels a swatch may have.
export function extractPalette(rgb, { k = 16, merge = 0.05, minShare = 0.006 } = {}) {
  const bins = new Map();
  for (let i = 0; i < rgb.length; i += 3) {
    const key = ((rgb[i] >> 3) << 10) | ((rgb[i + 1] >> 3) << 5) | (rgb[i + 2] >> 3);
    const bin = bins.get(key) ?? bins.set(key, { r: 0, g: 0, b: 0, n: 0 }).get(key);
    bin.r += toLinear(rgb[i] / 255);
    bin.g += toLinear(rgb[i + 1] / 255);
    bin.b += toLinear(rgb[i + 2] / 255);
    bin.n++;
  }
  const points = [...bins.values()].map((p) => ({ ...p, lab: oklab(p.r / p.n, p.g / p.n, p.b / p.n) }));
  const total = rgb.length / 3;
  if (!points.length) return [];

  // k-means++, made deterministic: the heaviest bin, then each time the bin
  // with the most weight far from every centre so far.
  points.sort((a, b) => b.n - a.n);
  const centres = [points[0].lab];
  while (centres.length < Math.min(k, points.length)) {
    let best = null, score = -1;
    for (const p of points) {
      const s = p.n * Math.min(...centres.map((c) => dist2(p.lab, c)));
      if (s > score) { score = s; best = p; }
    }
    if (score <= 0) break;
    centres.push(best.lab);
  }
  let clusters;
  for (let pass = 0; pass < 24; pass++) {
    clusters = centres.map(() => ({ l: [0, 0, 0], n: 0, mode: null }));
    for (const p of points) {
      let best = 0;
      for (let c = 1; c < centres.length; c++) if (dist2(p.lab, centres[c]) < dist2(p.lab, centres[best])) best = c;
      const cl = clusters[best];
      for (let j = 0; j < 3; j++) cl.l[j] += p.lab[j] * p.n;
      cl.n += p.n;
      if (!cl.mode || p.n > cl.mode.n) cl.mode = p;
    }
    clusters.forEach((cl, c) => { if (cl.n) centres[c] = cl.l.map((v) => v / cl.n); });
  }
  clusters = clusters.filter((cl) => cl.n);

  // Merge the closest pair while any two are painted the same colour to the
  // eye; the bigger keeps its name.
  for (;;) {
    let pair = null, closest = merge * merge;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = dist2(clusters[i].mode.lab, clusters[j].mode.lab);
        if (d < closest) { closest = d; pair = [i, j]; }
      }
    if (!pair) break;
    const [a, b] = pair.map((i) => clusters[i]);
    if (b.n > a.n) a.mode = b.mode;
    a.n += b.n;
    clusters.splice(pair[1], 1);
  }

  return clusters
    .filter((cl) => cl.n / total >= minShare)
    .sort((a, b) => b.n - a.n)
    .map(({ mode: { r, g, b, n }, n: count }) => {
      const bytes = [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, toSrgb(v / n))) * 255));
      return { hex: '#' + bytes.map((v) => v.toString(16).padStart(2, '0')).join(''), share: count / total };
    });
}
