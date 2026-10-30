// Preserve the full source motion, then blend its final pose back to its
// first pose. Many Mixamo actions are one-shots rather than seamless loops.
export function makeActionLoop(clip) {
  const blend = Math.min(0.35, Math.max(0.12, clip.duration * 0.2));
  const end = clip.duration + blend;
  const tracks = clip.tracks.map((track) => {
    const size = track.getValueSize();
    const times = Array.from(track.times);
    const values = Array.from(track.values);
    // Hold the last keyed value up to the clip end if this track ends early.
    if (times[times.length - 1] < clip.duration - 1e-6) {
      times.push(clip.duration);
      values.push(...values.slice(-size));
    }
    times.push(end);
    values.push(...values.slice(0, size));
    return new track.constructor(track.name, times, values, track.getInterpolation());
  });
  return new clip.constructor(clip.name, end, tracks);
}
