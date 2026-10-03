// RTS camera with follow and an automatic "film director" mode.
import * as THREE from 'three';
import { clamp, lerp, rand, randRange, wrapAngle } from './util.js';
import { groundHeight } from './terrain.js';
import { K_INF, K_CAV, K_ELE, K_CHR } from './sim/defs.js';
import { isActive } from './sim/world.js';

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0, -30);
    this.yaw = Math.PI; this.pitch = 0.32; this.dist = 95;
    this.mode = 'free';
    this.keys = new Set();
    this.follow = null;
    this.shot = null; this.shotT = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this.first = true;
    this.rotating = false;
    window.addEventListener('keydown', e => { if (!e.target.closest || !e.target.closest('input,select')) this.keys.add(e.code); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.mode !== 'free') this.setMode('free');
      this.dist = clamp(this.dist * Math.pow(1.0015, e.deltaY), 4, 450);
    }, { passive: false });
    dom.addEventListener('mousedown', e => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) { this.rotating = true; e.preventDefault(); }
    });
    window.addEventListener('mouseup', () => { this.rotating = false; });
    window.addEventListener('mousemove', e => {
      if (!this.rotating) return;
      if (this.mode !== 'free') this.setMode('free');
      this.yaw -= e.movementX * 0.005;
      this.pitch = clamp(this.pitch + e.movementY * 0.004, 0.03, 1.45);
    });
  }
  setMode(m, world) {
    if (m === 'free' && this.mode !== 'free') {
      // hand control back from wherever the camera currently is
      this.target.copy(this.smoothLook);
      this.target.y = 0;
      const d = new THREE.Vector3().subVectors(this.smoothPos, this.smoothLook);
      this.dist = clamp(d.length(), 8, 300);
      this.yaw = Math.atan2(d.x, d.z);
      this.pitch = clamp(Math.asin(clamp(d.y / (d.length() || 1), -1, 1)), 0.05, 1.4);
    }
    this.mode = m;
    this.shotT = 0;
    if (m === 'follow' && world && (!this.follow || !isActive(this.follow))) this.follow = this.pickInteresting(world);
  }
  followAgent(a) { this.follow = a; this.mode = 'follow'; }

  pickInteresting(world) {
    const cands = [];
    for (const a of world.agents) {
      if (!isActive(a)) continue;
      let s = 0;
      const sp = Math.hypot(a.vx, a.vz);
      if (a.kind === K_CAV && a.mode === 'charge') s += 3 + sp * 0.3;
      if (a.kind === K_ELE && a.mode === 'charge') s += 4;
      if (a.kind === K_CHR && a.mode === 'charge') s += 3;
      if (a.kind === K_INF) {
        if (a.reg.charging && sp > 3) s += 2;
        if (a.target && a.tdist < 6) s += 2.5;
        if (a.slot < a.reg.cols) s += 0.5; // front rank
      }
      if (a.climbing) s += 5;
      if (a.swimming) s += 2;
      if (a.job) s += 1.5;
      if (a.kind === 5 && (a.mode === 'batter' || a.mode === 'approach')) s += 4;
      if (a.rank >= 2 && a.target) s += 3;
      if (s > 0) cands.push([s + rand() * 2, a]);
    }
    if (!cands.length) {
      const al = world.agents.filter(isActive);
      return al.length ? al[Math.floor(rand() * al.length)] : null;
    }
    cands.sort((x, y) => y[0] - x[0]);
    return cands[Math.floor(rand() * Math.min(12, cands.length))][1];
  }

  update(dt, world) {
    const k = this.keys;
    if (this.mode === 'free') {
      const sp = this.dist * 0.9 * dt * (k.has('ShiftLeft') ? 3 : 1);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = -fz, rz = fx;
      if (k.has('KeyW') || k.has('ArrowUp')) { this.target.x += fx * sp; this.target.z += fz * sp; }
      if (k.has('KeyS') || k.has('ArrowDown')) { this.target.x -= fx * sp; this.target.z -= fz * sp; }
      if (k.has('KeyD') || k.has('ArrowRight')) { this.target.x += rx * sp; this.target.z += rz * sp; }
      if (k.has('KeyA') || k.has('ArrowLeft')) { this.target.x -= rx * sp; this.target.z -= rz * sp; }
      if (k.has('KeyQ')) this.yaw += dt * 1.4;
      if (k.has('KeyE')) this.yaw -= dt * 1.4;
      if (k.has('KeyR')) this.pitch = clamp(this.pitch + dt, 0.03, 1.45);
      if (k.has('KeyF')) this.pitch = clamp(this.pitch - dt, 0.03, 1.45);
      this.target.x = clamp(this.target.x, -450, 450); this.target.z = clamp(this.target.z, -450, 450);
      this.target.y = groundHeight(this.target.x, this.target.z);
      const cp = Math.cos(this.pitch);
      this.pos.set(
        this.target.x + Math.sin(this.yaw) * cp * this.dist,
        this.target.y + Math.sin(this.pitch) * this.dist + 1.5,
        this.target.z + Math.cos(this.yaw) * cp * this.dist,
      );
      this.look.copy(this.target); this.look.y += 1.5;
      this.apply(dt, 12);
      return;
    }
    if (this.mode === 'follow') {
      const a = this.follow;
      if (!a || a.state === 4) { this.follow = this.pickInteresting(world); return; }
      const ax = a.rag ? a.rag.x[0] : a.x, az = a.rag ? a.rag.x[2] : a.z;
      const gy = groundHeight(ax, az);
      const h = a.kind === K_INF ? 2.6 : a.kind === K_ELE ? 5.5 : 3.2;
      const back = a.kind === K_INF ? 6 : a.kind === K_ELE ? 14 : 9;
      const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
      if (k.has('KeyQ')) this.yaw += dt * 1.4;
      if (k.has('KeyE')) this.yaw -= dt * 1.4;
      const orbit = this.yaw - Math.PI;
      const ox = -(fx * Math.cos(orbit) - fz * Math.sin(orbit)), oz = -(fz * Math.cos(orbit) + fx * Math.sin(orbit));
      this.pos.set(ax + ox * back, gy + h + 0.8, az + oz * back);
      this.look.set(ax + fx * 8, gy + 1.0, az + fz * 8);
      this.apply(dt, 4);
      if (!isActive(a)) {
        this.shotT += dt;
        if (this.shotT > 3.5) { this.follow = this.pickInteresting(world); this.shotT = 0; }
      }
      return;
    }
    // cinematic director
    this.shotT -= dt;
    if (this.shotT <= 0 || !this.shot || !this.shot.a || this.shot.a.state === 4) {
      const a = this.pickInteresting(world);
      if (!a) return;
      const types = a.kind === K_INF ? ['chase', 'side', 'front', 'crane', 'high', 'side'] : ['chase', 'side', 'front', 'crane', 'low', 'high'];
      this.shot = { a, type: types[Math.floor(rand() * types.length)], side: rand() < 0.5 ? 1 : -1, t: 0, ang: rand() * 6.28 };
      this.shotT = randRange(5, 8);
      // now and then pull right back to show the whole engagement
      if (rand() < 0.2) {
        const r = a.reg;
        let er = null, ed = 1e9;
        if (r) for (const o of world.regs) {
          if (o.team === r.team || o.alive === 0) continue;
          const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
          if (d < ed) { ed = d; er = o; }
        }
        if (r && er) {
          const sh = this.shot;
          sh.type = rand() < 0.45 ? 'wide' : 'vista';
          sh.r = r; sh.er = er;
          sh.fx = (r.cx + er.cx) / 2; sh.fz = (r.cz + er.cz) / 2;     // middle of the clash
          sh.rx = r.cx; sh.rz = r.cz; sh.ex = er.cx; sh.ez = er.cz;
          sh.span = Math.max(40, Math.min(160, ed));                    // how far apart the two sides are
          this.shotT = randRange(9, 13);
        }
      }
      this.cut = true;
    }
    const s = this.shot, a = s.a;
    s.t += dt;
    if (s.r && s.er && s.r.alive && s.er.alive) {
      // the two lines keep moving: let the framing follow them
      const k = 1 - Math.exp(-dt * 0.8);
      s.rx += (s.r.cx - s.rx) * k; s.rz += (s.r.cz - s.rz) * k; s.ex += (s.er.cx - s.ex) * k; s.ez += (s.er.cz - s.ez) * k;
      s.fx = (s.rx + s.ex) / 2; s.fz = (s.rz + s.ez) / 2;
    }
    const ax = a.rag ? a.rag.x[0] : a.x, az = a.rag ? a.rag.x[2] : a.z;
    const gy = groundHeight(ax, az);
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    const rx = -fz, rz = fx;
    const h = a.kind === K_INF ? 1.6 : a.kind === K_ELE ? 4.5 : 2.4;
    const sc = a.kind === K_INF ? 1 : a.kind === K_ELE ? 2.2 : 1.5;
    switch (s.type) {
      case 'chase':
        // over the shoulder, high enough to see over the ranks
        this.pos.set(ax - fx * 8 * sc + rx * 1.5 * s.side, gy + 2.6 * sc + 0.8, az - fz * 8 * sc + rz * 1.5 * s.side);
        this.look.set(ax + fx * 12, gy + 0.8, az + fz * 12);
        break;
      case 'side': {
        // tracking shot from outside the unit's flank
        const r = a.reg;
        let off = 12 * sc;
        if (a.kind === K_INF && r) {
          const half = r.cols * r.spX * 0.5;
          const lat = (ax - r.cx) * rx + (az - r.cz) * rz;
          off = Math.max(10, half - lat * s.side + 9);
        }
        this.pos.set(ax + rx * off * s.side + fx * 3, gy + 2.0, az + rz * off * s.side + fz * 3);
        this.look.set(ax + fx * 2, gy + h * 0.6, az + fz * 2);
        break;
      }
      case 'front': {
        // camera planted ahead of the charge; the unit comes straight at it
        if (!s.px) { s.px = ax + fx * 30 * sc + rx * 4 * s.side; s.pz = az + fz * 30 * sc + rz * 4 * s.side; }
        this.pos.set(s.px, groundHeight(s.px, s.pz) + 1.2, s.pz);
        this.look.set(ax, gy + h * 0.7, az);
        break;
      }
      case 'low':
        this.pos.set(ax + fx * 8 * sc + rx * 5 * s.side, gy + 0.8, az + fz * 8 * sc + rz * 5 * s.side);
        this.look.set(ax, gy + h, az);
        break;
      case 'high':
        this.pos.set(ax - fx * 22 + rx * 8 * s.side, gy + 16, az - fz * 22 + rz * 8 * s.side);
        this.look.set(ax + fx * 10, gy, az + fz * 10);
        break;
      case 'wide': {
        // high, slowly orbiting and backing off: the whole clash in frame
        const R = 50 + s.span * 0.5 + s.t * 2, ang = s.ang + s.t * 0.07;
        this.pos.set(s.fx + Math.cos(ang) * R, gy + 28 + s.span * 0.2 + s.t, s.fz + Math.sin(ang) * R);
        this.look.set(s.fx, 2, s.fz);
        break;
      }
      case 'vista': {
        // from behind one army, over the heads, looking across at the other; drifts sideways
        let dx = s.ex - s.rx, dz = s.ez - s.rz;
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const sx = -dz * s.side, sz = dx * s.side;
        const back = 55 + s.span * 0.3, drift = -12 + s.t * 2.2;
        const px = s.rx - dx * back + sx * (20 + drift), pz = s.rz - dz * back + sz * (20 + drift);
        this.pos.set(px, groundHeight(px, pz) + 20 + s.span * 0.12, pz);
        this.look.set(s.fx + dx * 10, 2, s.fz + dz * 10);
        break;
      }
      case 'crane': {
        const ang = s.ang + s.t * 0.12;
        this.pos.set(ax + Math.cos(ang) * 30, gy + 14 + s.t * 1.2, az + Math.sin(ang) * 30);
        this.look.set(ax, gy + 1, az);
        break;
      }
    }
    if (this.cut) { this.smoothPos.copy(this.pos); this.smoothLook.copy(this.look); this.cut = false; }
    this.apply(dt, s.type === 'front' ? 30 : s.type === 'wide' || s.type === 'vista' ? 3 : 5);
  }
  apply(dt, stiffness) {
    const k = this.first ? 1 : 1 - Math.exp(-stiffness * dt);
    this.first = false;
    this.smoothPos.lerp(this.pos, k);
    this.smoothLook.lerp(this.look, k);
    const g = groundHeight(this.smoothPos.x, this.smoothPos.z) + 0.4;
    if (this.smoothPos.y < g) this.smoothPos.y = g;
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothLook);
  }
}
