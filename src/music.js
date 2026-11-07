// Procedural background music: no assets. A driving bass line and war drums carry the
// piece; a melody over a drone in D phrygian dominant comes and goes across a song of
// about three minutes (intro, march, melody, break, lift, bridge, climax, outro).
// The composition lives in tracks.js, one track per stage family; this class turns a
// track into sound with a small look-ahead scheduler on the shared AudioContext.
//
// Intensity is layered, not binary: the pad always plays, the full bass pattern
// enters above 0.25, the drums above 0.35, the lead above 0.55 and the harmony
// voice above 0.8, all eased smoothly towards the target level.
import { TRACKS, JINGLES } from './tracks.js';

const hz = (root, semis) => root * Math.pow(2, semis / 12);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Private mulberry32 (same algorithm as util.js rand, copied on purpose: the
// music must never consume the battle PRNG stream, composition choices come
// from the world seed alone).
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveTrack(track) {
  if (!track) return TRACKS.field;
  if (typeof track === 'string') return TRACKS[track] || TRACKS.field;
  return track;
}

// Flatten a section list into one entry per bar. With a seed, deterministic
// variations are applied before flattening (see Music): m1<->m1b swaps and a
// fill-pattern variant from the private PRNG, climax harmony on even seeds and
// off on odd ones. Without a seed the sections are used exactly as written.
function buildSong(track, sections, seed) {
  const hasSeed = seed !== undefined && seed !== null;
  let fillVariant = 0;
  const secs = sections.map((sec) => ({ ...sec, lead: sec.lead ? [...sec.lead] : undefined, roots: [...sec.roots] }));
  if (hasSeed) {
    const rng = mulberry32(seed);
    const swapLead = rng() < 0.5;
    fillVariant = Math.floor(rng() * 2);
    if (swapLead) {
      for (const sec of secs) {
        if (!sec.lead) continue;
        sec.lead = sec.lead.map((p) => (p === 'm1' ? 'm1b' : p === 'm1b' ? 'm1' : p));
      }
    }
    for (const sec of secs) if (sec.name === 'climax') sec.harm = ((seed >>> 0) % 2 === 0);
  }
  const bars = [];
  const sectionStarts = [];
  secs.forEach((sec, si) => {
    sectionStarts.push(bars.length);
    for (let i = 0; i < sec.bars; i++) {
      const phraseName = sec.lead && sec.lead[Math.floor(i / 4)];
      let lead = null;
      if (phraseName && track.phrases[phraseName]) {
        const ph = track.phrases[phraseName];
        // a two-bar fragment phrase sounds for its two bars only, then silence
        lead = ph.length === 2 ? (i % 4 < 2 ? ph[i % 2] : null) : ph[i % ph.length];
      }
      bars.push({
        key: sec.key, root: sec.key + sec.roots[i % sec.roots.length], bass: sec.bass, drums: sec.drums,
        lead, pad: !!sec.pad, harm: !!sec.harm,
        last: i === sec.bars - 1, firstOfSection: i === 0, section: si, sectionName: sec.name || '',
      });
    }
  });
  return { bars, sections: secs, sectionStarts, fillVariant };
}

export class Music {
  constructor(ctx, noise, dest, opts = {}) {
    this.ctx = ctx; this.noise = noise;
    this.track = resolveTrack(opts.track);
    this.seed = opts.seed;
    const built = buildSong(this.track, this.track.sections, this.seed);
    this.song = built.bars; this.sections = built.sections;
    this.sectionStarts = built.sectionStarts; this.fillVariant = built.fillVariant;
    this.stepDur = 60 / this.track.bpm / 4;   // one sixteenth note

    // music bus: a lowpass between the music output and the destination, so
    // weather can muffle the whole song (rain) without touching the instruments
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.bus = ctx.createBiquadFilter(); this.bus.type = 'lowpass'; this.bus.frequency.value = 18000;
    this.out.connect(this.bus); this.bus.connect(dest);
    // echo for the melody
    this.echo = ctx.createDelay(1); this.echo.delayTime.value = this.stepDur * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const echoLp = ctx.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = 1800;
    this.echo.connect(echoLp).connect(fb).connect(this.echo);
    this.echoWetGain = ctx.createGain(); this.echoWetGain.gain.value = this.track.echoWet ?? 0.5;
    echoLp.connect(this.echoWetGain).connect(this.out);
    this.enabled = false; this.running = false;
    this.intensity = 0.4; this.level = 0.4;
    this.step = 0; this.next = 0; this.timer = null;
    this.mode = 'song';               // 'song' | 'jingle'
    this.jingleSong = null; this.jingleBars = 0; this.resumeAfterJingle = false;
    this.pendingSection = null;
    this.rollNextBar = false; this.rollBar = false;
    this.dip = 0;
    this.thin = false; this.padGainMul = 1; this.weather = 'clear';
    if (opts.weather) this.setWeatherMode(opts.weather);
  }

  // Rebuild the song from a new track (and optionally a new seed), from bar 0.
  setTrack(track, seed) {
    this.track = resolveTrack(track);
    if (seed !== undefined) this.seed = seed;
    const built = buildSong(this.track, this.track.sections, this.seed);
    this.song = built.bars; this.sections = built.sections;
    this.sectionStarts = built.sectionStarts; this.fillVariant = built.fillVariant;
    this.stepDur = 60 / this.track.bpm / 4;
    if (this.echo) this.echo.delayTime.value = this.stepDur * 3;
    if (this.echoWetGain) this.echoWetGain.gain.value = this.track.echoWet ?? 0.5;
    this.step = 0; this.pendingSection = null; this.mode = 'song';
    this.rollNextBar = false; this.rollBar = false;
  }

  // Weather colouring: rain muffles through the bus, snow and night thin the
  // arrangement to pad + sparse layers, dusk warms the pad, anything else resets.
  setWeatherMode(key) {
    this.weather = key;
    this.thin = false; this.padGainMul = 1;
    let freq = 18000;
    if (key === 'rain') freq = 2400;
    else if (key === 'snow' || key === 'night') this.thin = true;
    else if (key === 'dusk') this.padGainMul = 1.25;
    if (this.bus) this.bus.frequency.value = freq;
  }

  setEnabled(on) {
    if (on && this.mode === 'jingle') this.resumeAfterJingle = true;
    this.enabled = on;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(on ? 0.7 : 0, t, on ? 0.6 : 0.2);
    if (on) this.start(); else this.stop();
  }
  // 0 = calm (drone and a slow pulse), 1 = full battle
  setIntensity(v) { this.intensity = clamp01(Number.isFinite(v) ? v : 0); }

  // Jump to a section (by name or index) at the next bar boundary.
  queueSection(nameOrIndex) {
    let idx = -1;
    if (typeof nameOrIndex === 'number') idx = nameOrIndex;
    else idx = this.sections.findIndex((s) => s.name === nameOrIndex);
    if (idx < 0 || idx >= this.sections.length) return false;
    this.pendingSection = idx;
    return true;
  }

  // One-off musical reactions to battle events.
  stinger(type) {
    if (type === 'gatebreak' || type === 'reinforce') {
      this.queueSection('climax');
      this.rollNextBar = true;      // drum roll across the next bar
    } else if (type === 'generaldeath') {
      this.queueSection('bridge');
      this.dip = 1;                 // drums and bass duck, then recover
    }
  }

  // Play the win/lose jingle (eight bars), then fade out and stop the song
  // scheduler — unless setEnabled(true) is called again, which resumes the song.
  playJingle(win) {
    const built = buildSong(this.track, win ? JINGLES.win : JINGLES.lose, null);
    this.jingleSong = built.bars; this.jingleBars = built.bars.length;
    this.mode = 'jingle'; this.step = 0; this.pendingSection = null;
    this.resumeAfterJingle = false;
    this.next = this.ctx.currentTime + 0.06;
    this.start();
  }
  endJingle() {
    const t = this.ctx.currentTime;
    this.mode = 'song'; this.step = 0; this.jingleSong = null; this.jingleBars = 0;
    if (this.resumeAfterJingle) {
      this.resumeAfterJingle = false;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(0.7, t, 0.4);
      return;                       // keep pumping the song
    }
    this.enabled = false;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.25);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.running = false;
  }

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
      if (this.step % 16 === 0) {
        // bar boundary: a queued section jump and a stinger drum roll land here
        if (this.mode === 'song' && this.pendingSection !== null) {
          this.step = this.sectionStarts[this.pendingSection] * 16;
          this.pendingSection = null;
        }
        this.rollBar = this.rollNextBar; this.rollNextBar = false;
      }
      const totalSteps = (this.mode === 'jingle' ? this.jingleBars : this.song.length) * 16;
      if (this.mode === 'jingle' && this.step >= totalSteps) { this.endJingle(); break; }
      this.schedule(this.step, this.next);
      this.step++;
      if (this.mode === 'song') this.step %= totalSteps;
      this.next += this.stepDur;
    }
  }

  schedule(n, t) {
    const STEP = this.stepDur;
    const total = this.mode === 'jingle' ? this.jingleBars : this.song.length;
    const song = this.mode === 'jingle' ? this.jingleSong : this.song;
    const bar = Math.floor(n / 16) % total, s = n % 16;
    const B = song[bar];
    const track = this.track;
    // ease the felt intensity so the music swells and settles instead of switching
    this.level += (this.intensity - this.level) * 0.004;
    const lvl = this.level;
    if (this.dip > 0) this.dip *= 0.997;    // the generaldeath dip recovers slowly
    const dipMul = 1 - 0.7 * this.dip;
    const drumScale = track.drumScale ?? 1;

    // layers by level: pad always; in thin weather only pad + sparse layers play
    const bassKind = this.thin ? 'sparse' : (lvl > 0.25 ? B.bass : 'sparse');
    const drumsKind = this.thin ? 'sparse' : (lvl > 0.35 ? B.drums : 'sparse');
    // pad: a held chord under the bar
    if (s === 0 && B.pad) this.pad(B.root, t, STEP * 16, (0.05 + 0.02 * lvl) * this.padGainMul);
    // bass (sparse pattern below 0.25, the section's own pattern above it)
    const bassMap = track.bass[bassKind] || track.bass.sparse;
    const iv = bassMap[s];
    if (iv !== undefined) this.bass(hz(track.root, B.root + iv), t, STEP * (track.bassLen[bassKind] || (s === 0 ? 2.6 : 1.6)), (0.26 + 0.08 * lvl) * dipMul);
    // drums (full feel above 0.35, scaled by the track's drumScale and the level)
    const drumMul = drumScale * dipMul * (drumsKind === 'sparse' ? 0.55 + 0.45 * lvl : 0.45 + 0.55 * lvl);
    if (drumsKind === 'roll' || this.rollBar) {
      // build: toms every sixteenth, getting louder and higher through the build
      const k = drumsKind === 'roll' ? (n % (16 * 4)) / (16 * 4) : s / 16;
      if (lvl > 0.35 || this.rollBar) this.tom(t, 0.8 + k * 0.5, (0.25 + k * 0.45) * drumScale * dipMul, 1.1 - k * 0.2 + (s % 4 === 0 ? 0.15 : 0));
      if (s === 0 && (B.firstOfSection || this.rollBar)) this.kickOrFrame(t, 0.9 * drumMul, drumsKind);
    } else {
      const fillBar = !this.thin && lvl > 0.35 && (bar % 4 === 3 || B.last) && drumsKind !== 'half';
      const fill = fillBar && s >= 12;
      const kicks = track.kick[drumsKind] || track.kick.sparse;
      const claps = track.clap[drumsKind] || track.clap.sparse;
      const toms = track.tom[drumsKind] || track.tom.sparse;
      if (kicks.includes(s) && !fill) this.kickOrFrame(t, 0.9 * drumMul, drumsKind);
      if (claps.includes(s)) this.clap(t, 0.5 * drumMul);
      if (toms[s] && !fill) this.tom(t, toms[s], 0.5 * drumMul);
      if (fill) {
        if (this.fillVariant === 1) {
          // seeded variant fill: even steps only, pitch falling, kick on the downbeat
          if (s === 12) this.kickOrFrame(t, 0.8 * drumMul, drumsKind);
          else if (s % 2 === 0) this.tom(t, 0.9, 0.6 * drumMul, 0.9 + (15 - s) * 0.08);
        } else {
          this.tom(t, 0.9 + (s - 12) * 0.12, 0.6 * drumMul, 1.4 - (s - 12) * 0.12);
        }
      }
      if (!this.thin && lvl > 0.5 && (drumsKind === 'dbl' ? true : s % 2 === 0)) this.shaker(t, (s % 4 === 0 ? 0.16 : 0.09) * drumMul);
    }
    // melody above 0.55 (and a lower second voice in the climax above 0.8)
    if (!this.thin && lvl > 0.55 && B.lead) for (const [st, semi, len] of B.lead) if (st === s) {
      const f = hz(track.leadRoot || track.root * 4, semi + B.key);
      this.playLead(f, t, STEP * len, 0.13);
      if (lvl > 0.8 && B.harm) this.playLead(f * 0.75, t, STEP * len, 0.07);
    }
  }

  // the section's kick, or a frame drum on tracks that use one for quiet feels
  kickOrFrame(t, g, drumsKind) {
    if (this.track.frameDrum && (drumsKind === 'sparse' || drumsKind === 'half')) this.frameDrum(t, g);
    else this.kick(t, g);
  }
  // the track's lead voice: original saw lead, pluck, or chant
  playLead(f, t, dur, g = 0.13) {
    const inst = this.track.leadInstrument;
    if (inst === 'pluck') this.pluck(f, t, dur, g);
    else if (inst === 'chant') this.chant(f, t, dur, g);
    else this.lead(f, t, dur, g);
  }

  // sustained chord (root, fifth, major third an octave up), slow attack.
  // On chant tracks the chord sings through a formant bandpass instead.
  pad(root, t, dur, g) {
    const ctx = this.ctx;
    const chantPad = this.track.leadInstrument === 'chant';
    const lp = ctx.createBiquadFilter(); lp.Q.value = chantPad ? 2 : 0.7;
    if (chantPad) { lp.type = 'bandpass'; lp.frequency.value = 800; }
    else {
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.6);
      lp.frequency.linearRampToValueAtTime(420, t + dur);
    }
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + dur * 0.35);
    gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    lp.connect(gn).connect(this.out);
    for (const [iv, det] of [[0, -6], [0, 6], [7, -4], [7, 5], [16, 0]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(this.track.root * 2, root + iv); o.detune.value = det;
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
  // frame drum: a tom voiced higher and shorter (river / harbour / forest drums)
  frameDrum(t, g) { this.tom(t, 1.2, g * 0.85, 1.6, 0.16); }
  tom(t, k, g, pitch = 1, decay = 0.28) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 95 * pitch * (0.9 + k * 0.15);
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(g * 0.9, t); gn.gain.exponentialRampToValueAtTime(0.001, t + decay);
    o.connect(gn).connect(this.out); o.start(t); o.stop(t + decay + 0.04);
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
  // plucked string: triangle with a fast decay and a slightly detuned twin
  pluck(f, t, dur, g = 0.13) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.007;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.8;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, dur * 0.9));
    o.connect(lp); o2.connect(lp); lp.connect(gn);
    gn.connect(this.out); gn.connect(this.echo);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  // chant: two saws through a formant bandpass, swelling in slowly (siege voices)
  chant(f, t, dur, g = 0.13) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 2;
    const gn = ctx.createGain();
    const atk = Math.min(0.45, dur * 0.35);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(g, t + atk);
    gn.gain.setValueAtTime(g, t + Math.max(atk, dur - 0.12));
    gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.08);
    bp.connect(gn);
    gn.connect(this.out); gn.connect(this.echo);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(bp); o.start(t); o.stop(t + dur + 0.12);
    }
  }
}
