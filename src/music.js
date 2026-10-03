// Procedural background music: no assets. A driving bass line and war drums carry the
// piece, with a short melody over a drone in D phrygian dominant that comes and goes.
// Scheduled with a small look-ahead on the shared AudioContext.
const BPM = 92;
const STEP = 60 / BPM / 4;            // one sixteenth note
const BARS = 8;                        // length of the loop
const D2 = 73.416;

const hz = (root, semis) => root * Math.pow(2, semis / 12);

// bass root per bar, in semitones above D2 (D D Eb D | D D C D)
const BASS_ROOT = [0, 0, 1, 0, 0, 0, -2, 0];
// 16th-step -> interval above the bar's root (semitones)
const BASS_PAT = { 0: 0, 3: 0, 6: 12, 8: 0, 10: 7, 11: 0, 14: 12 };
const BASS_PAT_B = { 0: 0, 2: 0, 4: 12, 6: 0, 8: 0, 11: 7, 12: 0, 14: -2 };

const KICK = new Set([0, 3, 8, 11]);
const CLAP = new Set([4, 12]);
const TOM = { 6: 1.0, 10: 0.8, 14: 1.2 };

// melody, bars 4-7 of each loop: [step, semitones above D4, length in steps]
const MELODY = {
  4: [[0, 7, 3], [3, 8, 1], [4, 7, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 1, 2]],
  5: [[0, 0, 6], [8, 4, 2], [10, 5, 2], [12, 7, 4]],
  6: [[0, 12, 3], [3, 11, 1], [4, 8, 2], [6, 7, 2], [8, 5, 3], [11, 4, 1], [12, 5, 2], [14, 7, 2]],
  7: [[0, 4, 4], [4, 1, 2], [6, 0, 10]],
};

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
    const bar = Math.floor(n / 16), s = n % 16;
    // ease the felt intensity so the music swells and settles instead of switching
    this.level += (this.intensity - this.level) * 0.004;
    const lv = this.level, full = lv > 0.55;
    // bass
    const pat = bar % 4 === 3 ? BASS_PAT_B : BASS_PAT;
    const iv = pat[s];
    if (iv !== undefined && (full || s % 8 === 0)) this.bass(hz(D2, BASS_ROOT[bar] + iv), t, STEP * (s === 0 ? 2.6 : 1.6), full ? 0.34 : 0.26);
    // drums
    const fill = bar % 4 === 3 && s >= 12;
    if (KICK.has(s) && (full || s % 8 === 0) && !fill) this.kick(t, full ? 0.9 : 0.6);
    if (full) {
      if (CLAP.has(s)) this.clap(t, 0.5);
      if (TOM[s] && !fill) this.tom(t, TOM[s], 0.5);
      if (fill) this.tom(t, 0.9 + (s - 12) * 0.12, 0.6, 1.4 - (s - 12) * 0.12);
      if (s % 2 === 0) this.shaker(t, s % 4 === 0 ? 0.16 : 0.09);
    } else if (s === 8) this.tom(t, 0.8, 0.3);
    // melody
    if (full && bar >= 4) for (const [st, semi, len] of MELODY[bar]) if (st === s) this.lead(hz(293.66, semi), t, STEP * len);
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
  lead(f, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.004;
    // gentle vibrato that sets in after the attack
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.008, t + 0.25);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; lp.Q.value = 1.2;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.13, t + 0.03);
    gn.gain.setValueAtTime(0.13, t + Math.max(0.04, dur - 0.08));
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(lp); o2.connect(lp); lp.connect(gn);
    gn.connect(this.out); gn.connect(this.echo);
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
}
