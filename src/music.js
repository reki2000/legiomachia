// Procedural background music: no assets. A driving bass line and war drums carry the
// piece; a melody over a drone in D phrygian dominant comes and goes across a song of
// about three minutes (intro, march, melody, break, lift, bridge, climax, outro).
// Scheduled with a small look-ahead on the shared AudioContext.
const BPM = 92;
const STEP = 60 / BPM / 4;            // one sixteenth note
const D2 = 73.416;

const hz = (root, semis) => root * Math.pow(2, semis / 12);

// ---------------------------------------------------------------- composition
// Everything is D phrygian dominant (D Eb F# G A Bb C). A song is a list of sections;
// each one picks a key, a bass line, a drum feel and which phrases the lead plays.

// bass: 16th-step -> interval above the bar's root (semitones)
const BASS = {
  A: { 0: 0, 3: 0, 6: 12, 8: 0, 10: 7, 11: 0, 14: 12 },
  B: { 0: 0, 2: 0, 4: 12, 6: 0, 8: 0, 11: 7, 12: 0, 14: -2 },
  drive: { 0: 0, 2: 0, 4: 12, 6: 0, 8: 7, 10: 0, 12: 12, 14: 10 },
  long: { 0: 0 },
  sparse: { 0: 0, 8: 0 },
};
const BASS_LEN = { long: 14 };

// melody phrases: four bars each, [step, semitones above D4, length in steps]
const PHRASE = {
  m1: [
    [[0, 7, 3], [3, 8, 1], [4, 7, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 1, 2]],
    [[0, 0, 6], [8, 4, 2], [10, 5, 2], [12, 7, 4]],
    [[0, 12, 3], [3, 11, 1], [4, 8, 2], [6, 7, 2], [8, 5, 3], [11, 4, 1], [12, 5, 2], [14, 7, 2]],
    [[0, 4, 4], [4, 1, 2], [6, 0, 10]],
  ],
  m1b: [
    [[0, 7, 3], [3, 8, 1], [4, 7, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 1, 2]],
    [[0, 0, 6], [8, 4, 2], [10, 5, 2], [12, 8, 4]],
    [[0, 12, 3], [3, 11, 1], [4, 8, 2], [6, 7, 2], [8, 5, 3], [11, 4, 1], [12, 5, 2], [14, 7, 2]],
    [[0, 5, 4], [4, 4, 2], [6, 1, 2], [8, 0, 8]],
  ],
  // higher and more rhythmic: used when the song lifts
  m2: [
    [[0, 12, 2], [2, 12, 2], [4, 13, 2], [6, 12, 2], [8, 8, 4], [12, 7, 4]],
    [[0, 8, 2], [2, 7, 2], [4, 5, 4], [8, 4, 2], [10, 5, 2], [12, 7, 4]],
    [[0, 12, 2], [2, 12, 2], [4, 13, 2], [6, 12, 2], [8, 16, 4], [12, 13, 2], [14, 12, 2]],
    [[0, 12, 6], [8, 8, 2], [10, 7, 2], [12, 4, 4]],
  ],
  // slow and lyrical, over the half-time bridge
  m3: [
    [[0, 7, 8], [8, 8, 4], [12, 7, 4]],
    [[0, 4, 8], [8, 5, 8]],
    [[0, 7, 6], [6, 8, 2], [8, 12, 8]],
    [[0, 11, 8], [8, 7, 8]],
  ],
};

// drum feels: which sixteenths carry what
const KICK = {
  groove: [0, 3, 8, 11], dbl: [0, 3, 6, 8, 11, 14], half: [0], sparse: [0],
};
const CLAP = { groove: [4, 12], dbl: [4, 12], half: [8], sparse: [] };
const TOM = {
  groove: { 6: 1.0, 10: 0.8, 14: 1.2 },
  dbl: { 2: 0.7, 10: 0.8, 15: 1.1 },
  half: { 12: 1.0, 14: 1.2 },
  sparse: { 8: 0.8 },
};

// [bars, key (semitones above D), bass, drums, roots per bar (semitones above the key), lead phrase(s), options]
const SECTIONS = [
  // intro: a pulse and a drone
  { bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 0, 0, 0, 0, 1, 0], pad: true },
  // the march gets going
  { bars: 8, key: 0, bass: 'A', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0] },
  // first melody
  { bars: 8, key: 0, bass: 'A', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m1', 'm1b'], pad: true },
  // break: drums drop out, tom roll into the lift
  { bars: 4, key: 0, bass: 'long', drums: 'roll', roots: [0, 1, 0, -2], pad: true },
  // lifted section a fourth higher, busier drums, higher melody
  { bars: 16, key: 5, bass: 'drive', drums: 'dbl', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m2', 'm2', 'm1', 'm2'], pad: true },
  // bridge: half time, long bass notes, slow melody
  { bars: 8, key: 0, bass: 'long', drums: 'half', roots: [0, 1, 0, -2, 0, 1, 0, 0], lead: ['m3', 'm3'], pad: true },
  // climax: back home, busiest, lead doubled
  { bars: 16, key: 0, bass: 'B', drums: 'dbl', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m2', 'm1b', 'm2', 'm1'], pad: true, harm: true },
  // outro: thin out and fall back into the loop
  { bars: 8, key: 0, bass: 'sparse', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, 0, 0], pad: true },
];

// flatten into one entry per bar
const SONG = [];
for (const sec of SECTIONS) {
  for (let i = 0; i < sec.bars; i++) {
    const phrase = sec.lead && sec.lead[Math.floor(i / 4)];
    SONG.push({
      key: sec.key, root: sec.key + sec.roots[i % sec.roots.length], bass: sec.bass, drums: sec.drums,
      lead: phrase ? PHRASE[phrase][i % 4] : null, pad: !!sec.pad, harm: !!sec.harm,
      last: i === sec.bars - 1, firstOfSection: i === 0,
    });
  }
}
const BARS = SONG.length;             // ~ 3 minutes before the loop comes round

export class Music {
  constructor(ctx, noise, dest) {
    this.ctx = ctx; this.noise = noise;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(dest);
    // echo for the melody
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const echoLp = ctx.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = 1800;
    this.echo.connect(echoLp).connect(fb).connect(this.echo);
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    echoLp.connect(wet).connect(this.out);
    this.enabled = false; this.running = false;
    this.intensity = 0.4; this.level = 0.4;
    this.step = 0; this.next = 0; this.timer = null;
  }

  setEnabled(on) {
    this.enabled = on;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(on ? 0.7 : 0, t, on ? 0.6 : 0.2);
    if (on) this.start(); else this.stop();
  }
  // 0 = calm (drone and a slow pulse), 1 = full battle
  setIntensity(v) { this.intensity = v; }

  start() {
    if (this.running) return;
    this.running = true;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 60);
  }
  stop() {
    // let the fade-out finish before the scheduler goes quiet
    setTimeout(() => { if (!this.enabled && this.timer) { clearInterval(this.timer); this.timer = null; this.running = false; } }, 900);
  }
  pump() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') { this.next = ctx.currentTime + 0.1; return; }
    while (this.next < ctx.currentTime + 0.25) {
      this.schedule(this.step, this.next);
      this.step = (this.step + 1) % (BARS * 16);
      this.next += STEP;
    }
  }

  schedule(n, t) {
    const bar = Math.floor(n / 16) % BARS, s = n % 16;
    const B = SONG[bar];
    // ease the felt intensity so the music swells and settles instead of switching
    this.level += (this.intensity - this.level) * 0.004;
    const full = this.level > 0.55;
    // before the battle only the pulse and the drone play
    const drums = full ? B.drums : 'sparse', bassKind = full ? B.bass : 'sparse';
    // pad: a held chord under the bar
    if (s === 0 && B.pad) this.pad(B.root, t, STEP * 16, full ? 0.07 : 0.05);
    // bass
    const iv = BASS[bassKind][s];
    if (iv !== undefined) this.bass(hz(D2, B.root + iv), t, STEP * (BASS_LEN[bassKind] || (s === 0 ? 2.6 : 1.6)), full ? 0.34 : 0.26);
    // drums
    const fillBar = full && (bar % 4 === 3 || B.last) && drums !== 'roll' && drums !== 'half';
    const fill = fillBar && s >= 12;
    if (drums === 'roll') {
      // build: toms every sixteenth, getting louder and higher through the section
      const k = (n % (16 * 4)) / (16 * 4);
      if (full) this.tom(t, 0.8 + k * 0.5, 0.25 + k * 0.45, 1.1 - k * 0.2 + (s % 4 === 0 ? 0.15 : 0));
      if (s === 0 && B.firstOfSection) this.kick(t, 0.9);
    } else {
      if (KICK[drums].includes(s) && !fill) this.kick(t, full ? 0.9 : 0.6);
      if (CLAP[drums].includes(s)) this.clap(t, 0.5);
      if (TOM[drums][s] && !fill) this.tom(t, TOM[drums][s], full ? 0.5 : 0.3);
      if (fill) this.tom(t, 0.9 + (s - 12) * 0.12, 0.6, 1.4 - (s - 12) * 0.12);
      if (full && (drums === 'dbl' ? true : s % 2 === 0)) this.shaker(t, s % 4 === 0 ? 0.16 : 0.09);
    }
    // melody (and a lower second voice in the climax)
    if (full && B.lead) for (const [st, semi, len] of B.lead) if (st === s) {
      const f = hz(293.66, semi + B.key);
      this.lead(f, t, STEP * len);
      if (B.harm) this.lead(f * 0.75, t, STEP * len, 0.07);
    }
  }

  // sustained chord (root, fifth, major third an octave up), slow attack
  pad(root, t, dur, g) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.6);
    lp.frequency.linearRampToValueAtTime(420, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + dur * 0.35);
    gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    lp.connect(gn).connect(this.out);
    for (const [iv, det] of [[0, -6], [0, 6], [7, -4], [7, 5], [16, 0]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(D2 * 2, root + iv); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.3);
    }
  }

  bass(f, t, dur, g) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.6;
    o.connect(lp); o2.connect(g2).connect(lp);
    lp.connect(gn).connect(this.out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  kick(t, g) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(gn).connect(this.out); o.start(t); o.stop(t + 0.4);
    this.burst(t, 0.05, 0.25 * g, 2200, 0.8, 'lowpass');
  }
  tom(t, k, g, pitch = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 95 * pitch * (0.9 + k * 0.15);
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(g * 0.9, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(gn).connect(this.out); o.start(t); o.stop(t + 0.32);
  }
  clap(t, g) { this.burst(t, 0.16, g, 1500, 0.9, 'bandpass'); this.burst(t + 0.012, 0.1, g * 0.6, 900, 0.7, 'bandpass'); }
  shaker(t, g) { this.burst(t, 0.045, g, 7000, 1.2, 'highpass'); }
  burst(t, dur, g, f, q, type) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(flt).connect(gn).connect(this.out);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  lead(f, t, dur, g = 0.13) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.004;
    // gentle vibrato that sets in after the attack
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.008, t + 0.25);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 1.2;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.03);
    gn.gain.setValueAtTime(g, t + Math.max(0.04, dur - 0.08));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(lp); o2.connect(lp); lp.connect(gn);
    gn.connect(this.out); gn.connect(this.echo);
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
}
