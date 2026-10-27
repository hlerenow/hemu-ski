// What the player has found about the resort (so far, the red foxes): the
// start of a collection. Kept in this browser only, as { id: when first found
// (ISO time) }.
const KEY = 'hemu-ski.found';

export function foundSoFar() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

// Records `id` as found; true the first time.
export function find(id) {
  const all = foundSoFar();
  if (all[id]) return false;
  all[id] = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: found for this visit only.
  }
  return true;
}
