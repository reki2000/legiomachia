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
      this.dist = clamp(this.dist * Math.pow(1.0015, e.deltaY), 4, Math.max(450, this.overviewDist || 0));
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
    // touch: one finger pans along the camera's ground axes, two fingers pinch-zoom and
    // twist to yaw. Touches are tracked by identifier; a drag hands control to free mode.
    this.touches = new Map();
    this.pinch = null; // { d, a } last pinch distance / angle
    const onTouch = e => {
      if (e.type === 'touchstart') for (const t of e.changedTouches) this.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (this.touches.size) e.preventDefault();
      if (e.type === 'touchmove') {
        for (const t of e.changedTouches) {
          const p = this.touches.get(t.identifier);
          if (!p) continue;
          if (this.touches.size === 1) {
            if (this.mode !== 'free') this.setMode('free');
            const dx = t.clientX - p.x, dy = t.clientY - p.y;
            const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
            const rx = -fz, rz = fx;
            const s = this.dist * 0.0016;
            this.target.x -= (rx * dx + fx * dy) * s;
            this.target.z -= (rz * dx + fz * dy) * s;
            this.target.x = clamp(this.target.x, -450, 450); this.target.z = clamp(this.target.z, -450, 450);
          }
          p.x = t.clientX; p.y = t.clientY;
        }
        if (this.touches.size === 2) {
          if (this.mode !== 'free') this.setMode('free');
          const [p, q] = [...this.touches.values()];
          const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
          const a = Math.atan2(p.y - q.y, p.x - q.x);
          if (this.pinch) {
            this.dist = clamp(this.dist * this.pinch.d / d, 4, Math.max(450, this.overviewDist || 0));
            let da = a - this.pinch.a;
            if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
            this.yaw += da;
          }
          this.pinch = { d, a };
        }
      }
      if (e.type === 'touchend' || e.type === 'touchcancel') {
        for (const t of e.changedTouches) this.touches.delete(t.identifier);
        if (this.touches.size < 2) this.pinch = null;
      }
    };
    dom.addEventListener('touchstart', onTouch, { passive: false });
    dom.addEventListener('touchmove', onTouch, { passive: false });
    dom.addEventListener('touchend', onTouch, { passive: false });
    dom.addEventListener('touchcancel', onTouch, { passive: false });
  }
  setMode(m, world) {
    if (m === 'overview' && world) {
      // start over the busiest spot, looking north over the Legion's back
      this.tour = null; this.tourT = 0;
      this.nextStop(world, true);
      this.yaw = Math.PI; this.pitch = 0.95; this.first = true;
    } else if (m === 'free' && this.mode !== 'free' && this.mode !== 'overview') {
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
  // the box round every man still on the field, as a target and distance for the overview
  frameAll(world) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const a of world.agents) {
      if (!isActive(a)) continue;
      if (a.x < x0) x0 = a.x; if (a.x > x1) x1 = a.x;
      if (a.z < z0) z0 = a.z; if (a.z > z1) z1 = a.z;
    }
    // and the boats of a landing, with the men still in them
    if (world.landing) for (const b of world.landing.boats) {
      if (!b.cargo.length) continue;
      if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x;
      if (b.z < z0) z0 = b.z; if (b.z > z1) z1 = b.z;
    }
    if (x0 > x1) return null;
    // the frame is about 85 degrees wide and 55 high; the tilt stretches the depth
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, dist: Math.max(120, (x1 - x0 + 50) * 0.6, (z1 - z0 + 50) * 1.15) };
  }
  // Overview tour: a high view showing about a ninth of the whole field, moving slowly from one
  // crowd of men to the next. Crowds are found by counting men in cells the size of the view.
  nextStop(world, jump) {
    const f = this.frameAll(world);
    if (!f) return;
    const dist = Math.max(90, f.dist / 3), cell = dist * 0.8;
    const bins = new Map();
    for (const a of world.agents) {
      if (!isActive(a)) continue;
      const k = Math.floor(a.x / cell) * 4096 + Math.floor(a.z / cell);
      let c = bins.get(k);
      if (!c) { c = { n: 0, x: 0, z: 0 }; bins.set(k, c); }
      c.n++; c.x += a.x; c.z += a.z;
    }
    // men in the landing boats count as well
    if (world.landing) for (const b of world.landing.boats) {
      if (!b.cargo.length) continue;
      const k = Math.floor(b.x / cell) * 4096 + Math.floor(b.z / cell);
      let c = bins.get(k);
      if (!c) { c = { n: 0, x: 0, z: 0 }; bins.set(k, c); }
      const n = b.cargo.length * 1.5;
      c.n += n; c.x += b.x * n; c.z += b.z * n; c.boats = (c.boats || 0) + n;
    }
    // where the two armies meet counts double
    const spots = [...bins.values()].map(c => ({ x: c.x / c.n, z: c.z / c.n, n: c.n, boats: c.boats || 0 }));
    for (const sp of spots) for (const o of spots) if (o !== sp && Math.hypot(o.x - sp.x, o.z - sp.z) < cell * 1.5) sp.n += o.n * 0.5;
    spots.sort((a, b) => b.n - a.n);
    const top = spots.slice(0, 6);
    // go somewhere not seen lately, the busier the likelier
    const seen = this.tourSeen || (this.tourSeen = []);
    const fresh = top.filter(sp => !seen.some(v => Math.hypot(v.x - sp.x, v.z - sp.z) < cell));
    const pool = fresh.length ? fresh : top;
    let pick = pool[0];
    // the first look before a landing goes to the boats
    if (jump) for (const sp of spots) if (sp.boats > (pick.boats || 0)) pick = sp;
    if (!jump && pool.length > 1) { let r = rand() * pool.reduce((t, sp) => t + sp.n, 0); for (const sp of pool) { r -= sp.n; if (r <= 0) { pick = sp; break; } } }
    seen.push({ x: pick.x, z: pick.z });
    if (seen.length > 3) seen.shift();
    this.tour = { x: pick.x, z: pick.z, dist, yaw0: this.yaw, spin: (rand() < 0.5 ? -1 : 1) * 0.025 };
    this.tourT = randRange(9, 13);
    if (jump) { this.target.set(pick.x, 0, pick.z); this.dist = dist; }
  }
  followAgent(a) { this.follow = a; this.mode = 'follow'; }

  // a living general or wing commander with the enemy at his horse's head, wounded, or just hit
  commanderInDanger(world) {
    let best = null, bs = 0;
    for (const army of world.armies) {
      if (!army) continue;
      for (const c of [army.general, ...army.wings.map(w => w.commander)]) {
        if (!c || !isActive(c) || !c.crew || !c.crew[0] || !c.crew[0].alive) continue;
        const r = c.crew[0];
        let s = 0;
        const e = world.nearestEnemy(c, 22);
        if (e) s += 3 + (22 - Math.hypot(e.x - c.x, e.z - c.z)) * 0.2;
        if (r.hp < r.maxHp * 0.6) s += 2;
        if (world.time - (c.lastHitT === undefined ? -10 : c.lastHitT) < 4) s += 2;
        if (s > 0 && c.rank >= 3) s += 2; // the general above all
        if (s > bs) { bs = s; best = c; }
      }
    }
    return bs >= 3 ? best : null;
  }
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
    if (this.mode === 'overview') {
      // glide to the next crowd and turn slowly round it
      this.tourT -= dt;
      if (this.tourT <= 0 || !this.tour) this.nextStop(world, false);
      const t = this.tour;
      if (t) {
        const e = 1 - Math.exp(-dt * 0.45);
        this.target.x += (t.x - this.target.x) * e; this.target.z += (t.z - this.target.z) * e;
        this.dist += (t.dist - this.dist) * e;
        this.yaw += t.spin * dt;
        this.yaw += (Math.PI - this.yaw) * dt * 0.02; // never far from looking north
        this.overviewDist = Math.max(this.dist, t.dist);
      }
    }
    if (this.mode === 'free' || this.mode === 'overview') {
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
    // cut away at once when a commander gets into trouble
    this.dangerT = (this.dangerT || 0) - dt;
    if (this.dangerT <= 0) {
      this.dangerT = 1;
      if (!(this.shot && this.shot.danger) && this.commanderInDanger(world)) this.shotT = 0;
    }
    if (this.shotT <= 0 || !this.shot || (!this.shot.boat && (!this.shot.a || this.shot.a.state === 4))) {
      // a landing under way: boats pulling for the beach and men jumping out into the surf
      // a general or a wing commander in danger comes before anything else
      const cmd = this.commanderInDanger(world);
      const L = world.landing;
      const boats = L ? L.boats.filter(b => b.state === 'out' || b.state === 'unload') : [];
      const fighting = world.regs.some(r => r.engaged);
      if (cmd) {
        const types = ['side', 'high', 'crane', 'chase'];
        this.shot = { a: cmd, danger: true, type: types[Math.floor(rand() * types.length)], side: rand() < 0.5 ? 1 : -1, t: 0, ang: rand() * 6.28 };
        this.shotT = randRange(6, 9);
        this.cut = true;
      } else if (boats.length && rand() < (fighting ? 0.12 : 0.35)) {
        const b = boats[Math.floor(rand() * boats.length)];
        const types = b.state === 'unload' ? ['beach', 'beach', 'boatHigh'] : ['boatChase', 'boatSide', 'boatHigh', 'boatFront'];
        this.shot = { boat: b, type: types[Math.floor(rand() * types.length)], side: rand() < 0.5 ? 1 : -1, t: 0, ang: rand() * 6.28 };
        this.shotT = randRange(6, 9);
        this.cut = true;
      } else this.shot = null; // an ordinary shot, picked below
    }
    if (this.shot && this.shot.boat) { this.boatShot(dt, world); return; }
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
  boatShot(dt, world) {
    const s = this.shot, b = s.boat, WL = world.stage.WL;
    s.t += dt;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading), rx = fz, rz = -fx;
    const bowX = b.x + fx * b.len * 0.5, bowZ = b.z + fz * b.len * 0.5;
    switch (s.type) {
      case 'boatChase':
        // astern and a little above: the boat's crowd and the beach ahead
        this.pos.set(b.x - fx * 15 + rx * 4 * s.side, WL + 5, b.z - fz * 15 + rz * 4 * s.side);
        this.look.set(b.x + fx * 14, WL + 1, b.z + fz * 14);
        break;
      case 'boatSide':
        this.pos.set(b.x + rx * 17 * s.side + fx * 5, WL + 2.6, b.z + rz * 17 * s.side + fz * 5);
        this.look.set(b.x + fx * 2, WL + 1, b.z + fz * 2);
        break;
      case 'boatFront':
        // from the beach, looking out at the boats coming in
        if (s.px === undefined) { s.px = b.dx + rx * 10 * s.side; s.pz = b.dz + 9; }
        this.pos.set(s.px, groundHeight(s.px, s.pz) + 1.8, s.pz);
        this.look.set(b.x, WL + 1.2, b.z);
        break;
      case 'beach':
        // on the sand beside the bow as the men step out
        if (s.px === undefined) { s.px = bowX + fx * 12 + rx * 9 * s.side; s.pz = bowZ + fz * 12 + rz * 9 * s.side; }
        this.pos.set(s.px, groundHeight(s.px, s.pz) + 1.7, s.pz);
        this.look.set(bowX - fx * 1, WL + 0.9, bowZ - fz * 1);
        break;
      default: { // boatHigh: slow crane round the boat
        const ang = s.ang + s.t * 0.1;
        this.pos.set(b.x + Math.cos(ang) * 26, WL + 15 + s.t, b.z + Math.sin(ang) * 26);
        this.look.set(b.x, WL, b.z);
      }
    }
    if (this.cut) { this.smoothPos.copy(this.pos); this.smoothLook.copy(this.look); this.cut = false; }
    this.apply(dt, s.type === 'beach' || s.type === 'boatFront' ? 30 : 5);
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
