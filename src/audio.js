// Procedural sound: wind that rises with speed, a scrape for edge/skid, the
// engine of the pickup or the snowmobile, or the Jetson ONE's rotors, the
// hot spring's spout pouring into its pool, the dog: its bark, its whine,
// its panting, and snowballs thrown for it, landing and bursting; the horse's
// hooves on the snow and its breathing; and the mantra chanted while the
// prayer wheels turn (mantra.js).
// Effects and music play through their own buses, switched from the menu.
import { Mantra } from './mantra.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
  }
  start() {
    if (this.ctx) {
      // Phones suspend the context whenever the page loses the audio session
      // (switching apps or tabs, locking the screen, a call coming in, moving
      // between the game and the diorama). Nothing used to wake it again:
      // start() returned early and every effect checks only that the context
      // exists, so the sound stayed gone until a full reload. Any start()
      // call — every tap and keypress makes one — now revives it instead.
      this.resume();
      return;
    }
    const ctx = (this.ctx = new AudioContext());
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(ctx.destination);
    this.music = ctx.createGain(); // nothing plays on it yet
    this.music.gain.value = this.musicOn ? 1 : 0;
    this.music.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.Q.value = 0.7;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    noise().connect(this.windF).connect(this.windG).connect(this.sfx);

    this.scrapeF = ctx.createBiquadFilter();
    this.scrapeF.type = 'highpass';
    this.scrapeF.frequency.value = 1800;
    this.scrapeG = ctx.createGain();
    this.scrapeG.gain.value = 0;
    noise().connect(this.scrapeF).connect(this.scrapeG).connect(this.sfx);

    // The spout: noise through a band-pass that jumps about, so it burbles.
    this.waterF = ctx.createBiquadFilter();
    this.waterF.type = 'bandpass';
    this.waterF.Q.value = 2.5;
    this.waterG = ctx.createGain();
    this.waterG.gain.value = 0;
    noise().connect(this.waterF).connect(this.waterG).connect(this.sfx);

    // The dog panting: breathy noise in a band, puffing in and out.
    this.pantF = ctx.createBiquadFilter();
    this.pantF.type = 'bandpass';
    this.pantF.frequency.value = 1500;
    this.pantF.Q.value = 1.2;
    this.pantG = ctx.createGain();
    this.pantG.gain.value = 0;
    this.pantLfo = ctx.createOscillator();
    this.pantLfo.frequency.value = 2.8;
    this.pantDepth = ctx.createGain();
    this.pantDepth.gain.value = 0;
    this.pantLfo.connect(this.pantDepth).connect(this.pantG.gain);
    this.pantLfo.start();
    noise().connect(this.pantF).connect(this.pantG).connect(this.sfx);

    // Engine: a sawtooth and a square an octave down, through a low-pass that
    // opens on the throttle.
    this.engF = ctx.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.Q.value = 2;
    this.engG = ctx.createGain();
    this.engG.gain.value = 0;
    this.engF.connect(this.engG).connect(this.sfx);
    this.eng = ['sawtooth', 'square'].map((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = i ? 0.6 : 1;
      o.connect(g).connect(this.engF);
      o.start();
      return o;
    });
  }
  // Wakes a suspended (or, on iOS, interrupted) context. Browsers only let it
  // run again inside a user gesture, so outside one this may do nothing.
  resume() {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
  }
  // Starts or revives the sound on every event a browser counts as a gesture.
  // A touch's pointerdown isn't one (only its pointerup and touchend are), and
  // the stick and the touch buttons call start() on pointerdown, so without
  // these a phone could stay silent until something was clicked.
  listen() {
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, () => this.start(), { capture: true, passive: true });
    }
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  // Preload before the action starts so a network delay cannot move the shout
  // away from the animation cue. It still uses the normal effects bus.
  async prepareFireball() {
    if (!this.ctx) return;
    if (!this.fireballVoicePromise) this.fireballVoicePromise = fetch(import.meta.env.BASE_URL + 'audio/fireball-v01/hadouken-voice-v02.mp3')
      .then((response) => { if (!response.ok) throw new Error('Voice unavailable'); return response.arrayBuffer(); })
      .then((bytes) => this.ctx.decodeAudioData(bytes))
      .catch((error) => { console.warn('Fireball voice unavailable:', error); this.fireballVoicePromise = null; return null; });
    this.fireballVoice = await this.fireballVoicePromise;
  }
  fireballShout() {
    if (!this.ctx || !this.fireballVoice) return;
    this.stopFireballShout();
    const source = this.ctx.createBufferSource();
    source.buffer = this.fireballVoice;
    source.connect(this.sfx);
    source.onended = () => { if (this.fireballVoiceSource === source) this.fireballVoiceSource = null; };
    this.fireballVoiceSource = source;
    source.start();
  }
  stopFireballShout() {
    if (!this.fireballVoiceSource) return;
    this.fireballVoiceSource.stop();
    this.fireballVoiceSource = null;
  }
  fireballLaunch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.#puff(t, 0.42, 1300, 0.17, 'bandpass');
    const tone = this.ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(460, t);
    tone.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    tone.connect(this.#envelope(t, 0.008, 0.32, 0.12)).connect(this.sfx);
    tone.start(t); tone.stop(t + 0.34);
  }
  // How loud the hot spring's spout is, 0…1, by how near you are to it.
  setWater(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.waterG.gain.setTargetAtTime(level * 0.08, t, 0.3);
    if (level > 0) this.waterF.frequency.setTargetAtTime(700 + Math.random() * 1600, t, 0.025);
  }
  // The mantra while the prayer wheels turn: `level` (0…1) is how loud, by
  // how many turn and how near they are. It begins at Om, says itself over
  // and over, and stops a while after it has faded away.
  setMantra(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (level > 0.01 && !this.mantra) {
      this.mantra = new Mantra(this.ctx, this.sfx, this.noiseBuf);
      this.mantraNext = t + 0.05;
    }
    const m = this.mantra;
    if (!m) return;
    if (level > 0.01) this.mantraHeard = t;
    else if (t - this.mantraHeard > 3) {
      m.stop();
      this.mantra = null;
      return;
    }
    m.out.gain.setTargetAtTime(level * 0.25, t, 0.35);
    if (this.mantraNext < t) this.mantraNext = t + 0.05; // after a pause (a hidden tab), not in the past
    while (this.mantraNext < t + 0.5) this.mantraNext = m.say(this.mantraNext);
  }
  // The dog. `level` (0…1) is how loud it is where you are.
  // A woof: a buzzy voice that jumps up and falls away through a mouth-shaped
  // band-pass, with a breathy edge.
  bark(level = 1) {
    if (!this.ctx || level <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01, f0 = 300 + Math.random() * 70;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.8, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.2, t + 0.03);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(1100, t);
    bp.frequency.exponentialRampToValueAtTime(520, t + 0.2);
    const g = this.#envelope(t, 0.012, 0.22, 0.5 * level);
    o.connect(bp).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.26);
    this.#puff(t, 0.12, 2400, 0.12 * level, 'highpass');
  }
  // A little whine: a thin rising and falling note, wavering.
  whine(level = 1) {
    if (!this.ctx || level <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(760, t);
    o.frequency.linearRampToValueAtTime(1150, t + 0.25);
    o.frequency.linearRampToValueAtTime(820, t + 0.7);
    const wob = ctx.createOscillator(), depth = ctx.createGain();
    wob.frequency.value = 7;
    depth.gain.value = 25;
    wob.connect(depth).connect(o.frequency);
    const g = this.#envelope(t, 0.08, 0.75, 0.06 * level);
    o.connect(g).connect(this.sfx);
    o.start(t);
    wob.start(t);
    o.stop(t + 0.8);
    wob.stop(t + 0.8);
  }
  // A snowball bursting in the dog's jaws, or thumping into the snow.
  pop(level = 1) { if (this.ctx) this.#puff(this.ctx.currentTime, 0.12, 900, 0.25 * level, 'lowpass'); }
  thud(level = 1) { if (this.ctx) this.#puff(this.ctx.currentTime, 0.09, 380, 0.3 * level, 'lowpass'); }
  // A snowball leaving the hand.
  swish(level = 1) { if (this.ctx) this.#puff(this.ctx.currentTime, 0.14, 2600, 0.06 * level, 'bandpass'); }
  // A hoof coming down on the snow: a dull thump through the ground, and the
  // snow's own sound over it, by how deep it is (`powder`, 0–1): packed snow
  // on a run crunches, short and bright; powder gives a soft, muffled whump.
  hoof(level = 1, powder = 0) {
    if (!this.ctx || level <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.random() * 0.01;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(105 - 25 * powder + Math.random() * 12, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    o.connect(this.#envelope(t, 0.004, 0.12, 0.2 * level * (1 - 0.35 * powder))).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.15);
    if (powder < 0.95) this.#puff(t, 0.055, 2000 + Math.random() * 600, 0.07 * level * (1 - powder), 'bandpass');
    if (powder > 0.05) this.#puff(t, 0.16, 520, 0.11 * level * powder, 'lowpass');
  }
  // A horse's breath, `out` or in: a deep, rough blow out through the
  // nostrils (fluttering, the harder it blows) and a shorter, thinner draw in.
  breath(level = 1, out = true) {
    if (!this.ctx || level <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005, dur = out ? 0.26 : 0.15;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(out ? 560 : 1100, t);
    f.frequency.exponentialRampToValueAtTime(out ? 380 : 1400, t + dur);
    const g = this.#envelope(t, out ? 0.03 : 0.05, dur, (out ? 0.16 : 0.06) * level);
    const flutter = ctx.createGain();
    flutter.gain.value = 1;
    s.connect(f).connect(flutter).connect(g).connect(this.sfx);
    if (out) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 22 + Math.random() * 8;
      depth.gain.value = 0.6 * level;
      lfo.connect(depth).connect(flutter.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
  // Panting, 0…1.
  setPant(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pantG.gain.setTargetAtTime(level * 0.018, t, 0.2);
    this.pantDepth.gain.setTargetAtTime(level * 0.018, t, 0.2);
  }
  // A gain that swells over `attack` s to `peak` and dies away by `end`.
  #envelope(t, attack, end, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + end);
    return g;
  }
  // A short burst of filtered noise.
  #puff(t, dur, hz, peak, type) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    s.connect(f).connect(this.#envelope(t, 0.008, dur, peak)).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  // `engine` ({ kind, speed, throttle, spool?, load? }) while you drive, else
  // null. The pickup's note climbs through its gears; the snowmobile's
  // two-stroke buzzes higher, its belt drive holding the revs up as it gathers
  // speed; the Jetson's eight rotors whine up as they spool (`spool`, 0…1) and
  // as they pull harder (`load`).
  update(speed, slip, grounded, engine = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, speed / 25);
    this.windG.gain.setTargetAtTime(0.02 + w * w * 0.22, t, 0.2);
    this.windF.frequency.setTargetAtTime(300 + w * 900, t, 0.2);
    const s = grounded ? Math.min(1, slip / 6) * Math.min(1, speed / 5) : 0;
    this.scrapeG.gain.setTargetAtTime(grounded ? 0.015 + s * 0.12 : 0, t, 0.05);
    const load = engine?.throttle ? 1 : 0;
    let hz, open;
    if (engine?.kind === 'jetson') {
      const rev = engine.spool * (0.55 + engine.load * 0.45);
      hz = 60 + rev * 120;
      open = 500 + rev * 1700;
    } else if (engine?.kind === 'snowmobile') {
      const rev = load * 0.45 + 0.15 + Math.min(1, engine.speed / 55) * 0.4;
      hz = 58 + rev * 120;
      open = 380 + rev * 900 + load * 300;
    } else {
      // Revs climb through each gear (every 7 m/s) and drop back at the shift.
      const gear = engine ? Math.min(4, Math.floor(engine.speed / 7)) : 0;
      const rev = engine ? Math.min(1.1, (engine.speed - gear * 7) / 7 * (gear ? 0.65 : 1) + (gear ? 0.35 : 0)) : 0;
      hz = 34 + rev * 52 + load * 6;
      open = 220 + rev * 260 + load * 420;
    }
    this.eng.forEach((o, i) => o.frequency.setTargetAtTime(i ? hz / 2 : hz, t, 0.08));
    this.engF.frequency.setTargetAtTime(open, t, 0.08);
    this.engG.gain.setTargetAtTime(engine ? (0.05 + load * 0.05) * (engine.spool ?? 1) : 0, t, engine ? 0.1 : 0.3);
  }
}
