// Procedural WebAudio sound: no assets. Metal clashes, horns, war cries,
// hoof rumble and arrow volleys, attenuated by distance to the camera.
import { Music } from './music.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.budget = {};
    this.rumbleLevel = 0;
    this.musicOn = false;
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.setEnabled(on);
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.music = new Music(ctx, buf, this.master);
    if (this.musicOn) this.music.setEnabled(true);
    // continuous battle bed: filtered noise (crowd + hooves)
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    this.bed = ctx.createGain(); this.bed.gain.value = 0;
    src.connect(lp).connect(this.bed).connect(this.master); src.start();
    const src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.playbackRate.value = 0.5;
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 90;
    this.hoof = ctx.createGain(); this.hoof.gain.value = 0;
    src2.connect(lp2).connect(this.hoof).connect(this.master); src2.start();
  }
  gainAt(data, camera) {
    if (!data || data.x === undefined && data.cx === undefined) return 0.6;
    const x = data.cx !== undefined ? data.cx : data.x, z = data.cz !== undefined ? data.cz : data.z;
    const d = Math.hypot(x - camera.position.x, z - camera.position.z, camera.position.y * 0.5);
    return Math.min(1, 18 / (d + 6));
  }
  allow(type, max) {
    const t = this.ctx.currentTime;
    const b = this.budget[type] || (this.budget[type] = { t: 0, n: 0 });
    if (t - b.t > 0.12) { b.t = t; b.n = 0; }
    if (b.n >= max) return false;
    b.n++; return true;
  }
  noiseBurst(g, dur, f, q, type = 'bandpass', delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(flt).connect(gn).connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  metal(g) {
    const ctx = this.ctx, t = ctx.currentTime;
    const base = 900 + Math.random() * 1400;
    for (const m of [1, 2.76, 5.4]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = base * m;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(g * 0.05 / m, t); gn.gain.exponentialRampToValueAtTime(0.0005, t + 0.25 / m + 0.05);
      o.connect(gn).connect(this.master); o.start(t); o.stop(t + 0.35);
    }
    this.noiseBurst(g * 0.5, 0.08, 3500, 1.5);
  }
  horn(g, pitch = 110, dur = 2.2) {
    const ctx = this.ctx, t = ctx.currentTime;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g * 0.2, t + 0.25);
    gn.gain.setValueAtTime(g * 0.2, t + dur - 0.4); gn.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(gn).connect(this.master);
    for (const [m, det] of [[1, 0], [1.5, 3], [2, -4]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(pitch * m * 0.94, t); o.frequency.linearRampToValueAtTime(pitch * m, t + 0.3);
      o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  cry(g) {
    // many voices shouting: detuned formant-filtered noise swell
    const ctx = this.ctx, t = ctx.currentTime;
    for (const f of [520, 900, 1400]) {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f; flt.Q.value = 4;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g * 0.5, t + 0.5);
      gn.gain.linearRampToValueAtTime(0, t + 2.6);
      s.connect(flt).connect(gn).connect(this.master); s.start(t); s.stop(t + 2.7);
    }
  }
  trumpet(g) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, t); o.frequency.linearRampToValueAtTime(620, t + 0.3); o.frequency.linearRampToValueAtTime(480, t + 1.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g * 0.35, t + 0.1); gn.gain.linearRampToValueAtTime(0, t + 1.2);
    o.connect(bp).connect(gn).connect(this.master); o.start(t); o.stop(t + 1.3);
  }
  event(type, data, camera) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const g = this.gainAt(data, camera);
    switch (type) {
      case 'start': this.horn(0.9, 98, 2.8); setTimeout(() => this.ctx && this.horn(0.6, 131, 2.0), 900); break;
      case 'charge': if (this.allow('charge', 1)) { this.cry(g * 1.5); if (data.team === 1) this.horn(g, 147, 1.6); } break;
      case 'volley': if (this.allow('volley', 1)) this.noiseBurst(g * 0.6, 1.2, 2500, 0.7, 'highpass', 0.4); break;
      case 'block': case 'clash': if (g > 0.08 && this.allow('metal', 3)) this.metal(g); break;
      case 'hurt': case 'death': if (g > 0.1 && this.allow('hit', 3)) this.noiseBurst(g * 0.5, 0.12, 300, 1.2); break;
      case 'crash': if (this.allow('crash', 2)) { this.noiseBurst(g * 1.2, 0.35, 160, 0.8, 'lowpass'); this.metal(g * 0.5); } break;
      case 'impale': case 'mountdeath': if (this.allow('md', 2)) this.noiseBurst(g, 0.5, 120, 0.7, 'lowpass'); break;
      case 'thud': if (this.allow('thud', 2)) this.noiseBurst(g * 1.3, 0.4, 80, 0.7, 'lowpass'); break;
      case 'trumpet': if (this.allow('trumpet', 1)) this.trumpet(g); break;
      case 'gatehit': if (this.allow('gate', 1)) { this.noiseBurst(g * 1.6, 0.6, 70, 0.8, 'lowpass'); this.noiseBurst(g * 0.6, 0.2, 400, 1); } break;
      case 'gatebreak': this.noiseBurst(1.2, 1.5, 90, 0.6, 'lowpass'); this.cry(0.8); break;
      case 'bridge': this.noiseBurst(1.0, 2.0, 200, 0.5, 'lowpass'); break;
      case 'rock': if (this.allow('rock', 2)) this.noiseBurst(g * 1.4, 0.5, 90, 0.7, 'lowpass'); break;
      case 'onager': if (this.allow('onager', 1)) this.noiseBurst(g * 0.8, 0.25, 250, 1.2); break;
      case 'sling': if (this.allow('sling', 2)) this.noiseBurst(g * 0.25, 0.15, 1800, 3); break;
      case 'javelin': if (this.allow('jav', 2)) this.noiseBurst(g * 0.3, 0.3, 900, 2, 'bandpass'); break;
      case 'work': if (g > 0.15 && this.allow('work', 2)) this.noiseBurst(g * 0.35, 0.06, 1400, 4); break;
      case 'bite': if (g > 0.15 && this.allow('bite', 2)) this.noiseBurst(g * 0.5, 0.12, 700, 3); break;
      case 'ladderfall': case 'fall': if (this.allow('fall', 2)) this.noiseBurst(g * 0.8, 0.3, 150, 0.8, 'lowpass'); break;
      case 'generaldeath': case 'officerdeath': this.horn(0.5, 82, 2.4); break;
      case 'reserve': this.horn(0.5, 123, 1.5); break;
    }
  }
  update(dt, world, camera, ts) {
    if (!this.ctx) return;
    this.music.setIntensity(world.phase === 'battle' ? 1 : 0.3);
    // ambient bed follows how much fighting / galloping is near the camera
    let fight = 0, gallop = 0;
    const cx = camera.position.x, cz = camera.position.z;
    const A = world.agents;
    for (let i = 0; i < A.length; i += 3) {
      const a = A[i];
      if (a.state !== 0) continue;
      const d = Math.hypot(a.x - cx, a.z - cz) + camera.position.y * 0.5;
      const w = 30 / (d + 30);
      if (a.target && a.tdist < 5) fight += w;
      if (a.kind !== 0 && Math.hypot(a.vx, a.vz) > 4) gallop += w * 4;
      else if (Math.hypot(a.vx, a.vz) > 3.5) gallop += w * 0.3;
    }
    const k = Math.min(1, ts);
    this.bed.gain.value += (Math.min(0.5, fight * 0.006) * k - this.bed.gain.value) * Math.min(1, dt * 2);
    this.hoof.gain.value += (Math.min(1.2, gallop * 0.02) * k - this.hoof.gain.value) * Math.min(1, dt * 2);
    // random clashes proportional to fighting density
    if (ts > 0 && this.ctx.state === 'running' && Math.random() < fight * dt * 0.15 * ts) this.metal(Math.min(0.6, 0.1 + fight * 0.004));
  }
}
