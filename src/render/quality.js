// Select once per page load: rotation/resizing must not mix full-size and
// mobile resources in the same caches. Explicit overrides are for review.
export function mobileProfile({ search = '', userAgent = '', coarse = false, touchPoints = 0, width = Infinity, height = Infinity } = {}) {
  const override = new URLSearchParams(search).get('quality');
  if (override === 'mobile' || override === 'desktop') return override === 'mobile';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (coarse && touchPoints > 0 && Math.min(width, height) <= 1024);
}

export const MOBILE = typeof window !== 'undefined' && mobileProfile({
  search: window.location.search,
  userAgent: window.navigator.userAgent,
  coarse: window.matchMedia('(pointer: coarse)').matches,
  touchPoints: window.navigator.maxTouchPoints,
  width: window.screen.width,
  height: window.screen.height,
});
