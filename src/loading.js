const root = document.getElementById('loading');
const progressBar = root.querySelector('[role="progressbar"]');
const steps = [...root.querySelectorAll('.step')];
let progress = 0;

// Progress follows completed startup work and never walks backwards.
export function setLoadingProgress(value) {
  if (!Number.isFinite(value)) return;
  progress = Math.max(progress, Math.min(1, Math.max(0, value)));
  const count = Math.floor(progress * steps.length + 1e-8);
  steps.forEach((step, i) => {
    step.classList.toggle('landed', i < count);
    step.classList.toggle('current', i === count - 1);
  });
  progressBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}

export function setLoadingArrival(note) {
  root.querySelector('.loading-arrival').textContent = note;
}

export async function finishLoading() {
  setLoadingProgress(1);
  // Let the completed trail paint before fading into the game.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  root.classList.add('done');
  root.setAttribute('aria-hidden', 'true');
}
