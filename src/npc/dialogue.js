// What the cast say: a paper box at the foot of the screen with the speaker's
// name on a tab, each line typed out a letter at a time. E (or a tap on the
// box) shows the whole line at once, then the next, and after the last closes
// it. A line can carry links, written [text](url) as in Markdown: they open in
// a new tab, and tapping one doesn't move the dialogue on.
const RATE = 40; // letters a second

// A line as its runs of text, each with the link it's part of, if any, and
// how many letters it shows.
function parse(line) {
  const parts = [], re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let at = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > at) parts.push({ text: line.slice(at, m.index) });
    parts.push({ text: m[1], href: m[2] });
    at = m.index + m[0].length;
  }
  if (at < line.length) parts.push({ text: line.slice(at) });
  return { parts, length: parts.reduce((n, p) => n + p.text.length, 0) };
}

export class Dialogue {
  constructor(parent = document.body) {
    this.el = document.createElement('div');
    this.el.id = 'dialogue';
    this.el.innerHTML = '<span class="who"></span><p class="line"></p><span class="more"><kbd>E</kbd>&nbsp;▸</span>';
    this.whoEl = this.el.querySelector('.who');
    this.lineEl = this.el.querySelector('.line');
    this.el.addEventListener('mousedown', (e) => { if (!e.target.closest('a')) e.preventDefault(); }); // keep Space for the ollie
    this.el.addEventListener('click', (e) => { if (!e.target.closest('a')) this.next(); });
    parent.appendChild(this.el);
    this.lines = [];
    this.i = 0;
    this.shown = 0; // letters of the line shown so far
    this.onEnd = null;
  }

  get open() { return this.lines.length > 0; }

  // `who` says `lines`, from the first; `onEnd` is called once they're done
  // (or cut off).
  say(who, lines, onEnd = null) {
    this.whoEl.textContent = who;
    this.lines = lines.map(parse);
    this.onEnd = onEnd;
    this.#show(0);
    this.el.classList.add('show');
  }

  next() {
    if (!this.open) return;
    const line = this.lines[this.i];
    if (this.shown < line.length) {
      this.shown = line.length;
      this.#render();
    } else if (this.i + 1 < this.lines.length) this.#show(this.i + 1);
    else this.close();
  }

  close() {
    if (!this.open) return;
    this.lines = [];
    this.el.classList.remove('show', 'done');
    const f = this.onEnd;
    this.onEnd = null;
    f?.();
  }

  update(dt) {
    if (!this.open) return;
    const line = this.lines[this.i];
    if (this.shown >= line.length) return;
    const was = Math.floor(this.shown);
    this.shown = Math.min(line.length, this.shown + dt * RATE);
    if (Math.floor(this.shown) !== was) this.#render();
  }

  #show(i) {
    this.i = i;
    this.shown = 0;
    this.#render();
  }

  // The line as far as it's been typed.
  #render() {
    const line = this.lines[this.i];
    let left = Math.floor(this.shown);
    this.lineEl.replaceChildren();
    for (const { text, href } of line.parts) {
      if (left <= 0) break;
      const t = text.slice(0, left);
      left -= t.length;
      if (!href) { this.lineEl.append(t); continue; }
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = t;
      this.lineEl.append(a);
    }
    this.el.classList.toggle('done', this.shown >= line.length);
  }
}
