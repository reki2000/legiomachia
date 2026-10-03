// Battle stages: analytic terrain + a raster of man-made floors (walls, bridges,
// ladders, pontoons...). Everything walkable is a single height field, so walls
// are plateaus, ladders are steep ramps and a bridge is a causeway over water.
import { smoothstep, clamp, rand, setSeed, randRange } from '../util.js';

export const F_LADDER = 1, F_GATE = 2, F_BRIDGE = 4, F_WALL = 8, F_RAMP = 16, F_PONTOON = 32, F_HOUSE = 64, F_TOWER = 128;

export const STAGE_NAMES = { field: '平原の会戦', river: '渡河戦', siege: '攻城戦' };

export class Stage {
  constructor(kind, scale = 1) {
    this.kind = kind;
    this.scale = scale;
    this.S = Math.max(1, Math.sqrt(scale) * 0.8); // geometric widening for big armies
    this.flatR = 160 * this.S;
    this.WL = -1e9; this.hasWater = false;
    this.res = 0.5; this.rx0 = 0; this.rz0 = 0; this.rw = 0; this.rh = 0;
    this.floor = null; this.flags = null;
    this.structs = []; this.gates = []; this.bridges = []; this.ladders = []; this.pontoons = []; this.stakes = [];
    this.stakeGrid = new Map();
    this.river = null; this.city = null;
    this.version = 0;
    this.listeners = [];
  }

  // ---------------------------------------------------------------- terrain
  base(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const hills = smoothstep(this.flatR, this.flatR + 180, r);
    const small = 0.7 * Math.sin(x * 0.019 + 0.5) * Math.cos(z * 0.016) + 0.35 * Math.sin(x * 0.047 + z * 0.041);
    const big = 9 * Math.sin(x * 0.009 + 1.3) * Math.cos(z * 0.011 - 0.4) + 6 * Math.sin(x * 0.021 - z * 0.017) + 7;
    return small + hills * big;
  }
  riverZ(x) { return this.river.amp * Math.sin(x * this.river.freq); }
  // terrain is sampled into a 1 m grid once; lookups are bilinear
  bakeTerrain() {
    const N = 1001;
    const g = new Float32Array(N * N);
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) g[iz * N + ix] = this.terrainExact(ix - 500, iz - 500);
    this.tg = g;
  }
  terrain(x, z) {
    const g = this.tg;
    if (!g) return this.terrainExact(x, z);
    let fx = x + 500, fz = z + 500;
    if (fx < 0) fx = 0; else if (fx > 999.999) fx = 999.999;
    if (fz < 0) fz = 0; else if (fz > 999.999) fz = 999.999;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const i = iz * 1001 + ix;
    const a = g[i] + (g[i + 1] - g[i]) * tx, b = g[i + 1001] + (g[i + 1002] - g[i + 1001]) * tx;
    return a + (b - a) * tz;
  }
  terrainExact(x, z) {
    let h = this.base(x, z);
    const R = this.river;
    if (R) {
      const d = Math.abs(z - this.riverZ(x));
      const ch = smoothstep(R.half + 7, R.half - 2, d);
      if (ch > 0) {
        const f = smoothstep(R.fordHalf + 12, R.fordHalf, Math.abs(x - R.fordX));
        const bed = R.bed + (R.fordBed - R.bed) * f + 0.9 * (d / R.half) * (d / R.half);
        h = h * 0.4 + (bed - h * 0.4) * ch;
      } else h *= 0.4 + 0.6 * smoothstep(R.half + 7, R.half + 60, d);
    }
    const C = this.city;
    if (C) {
      // the city sits on a levelled plateau
      const m = smoothstep(18, 4, Math.max(Math.abs(x) - C.L - 4, C.z0 - z, z - C.zb - 4, 0));
      h = h * (1 - m);
    }
    return h;
  }

  // ---------------------------------------------------------------- raster
  initRaster(x0, z0, x1, z1) {
    this.rx0 = x0; this.rz0 = z0;
    this.rw = Math.ceil((x1 - x0) / this.res); this.rh = Math.ceil((z1 - z0) / this.res);
    this.floor = new Float32Array(this.rw * this.rh).fill(NaN);
    this.flags = new Uint8Array(this.rw * this.rh);
  }
  idx(x, z) {
    if (!this.floor) return -1;
    const ix = Math.floor((x - this.rx0) / this.res), iz = Math.floor((z - this.rz0) / this.res);
    if (ix < 0 || iz < 0 || ix >= this.rw || iz >= this.rh) return -1;
    return iz * this.rw + ix;
  }
  floorAt(x, z) {
    const i = this.idx(x, z);
    if (i >= 0) { const f = this.floor[i]; if (f === f) return f; }
    return this.terrain(x, z);
  }
  flagAt(x, z) { const i = this.idx(x, z); return i >= 0 ? this.flags[i] : 0; }
  // hfn(x, z) -> height, or null to clear the cell back to terrain
  setRect(x0, z0, x1, z1, hfn, flag = 0) {
    if (!this.floor) return;
    const r = this.res;
    const ix0 = Math.max(0, Math.floor((x0 - this.rx0) / r)), ix1 = Math.min(this.rw - 1, Math.ceil((x1 - this.rx0) / r) - 1);
    const iz0 = Math.max(0, Math.floor((z0 - this.rz0) / r)), iz1 = Math.min(this.rh - 1, Math.ceil((z1 - this.rz0) / r) - 1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = this.rx0 + (ix + 0.5) * r, z = this.rz0 + (iz + 0.5) * r;
        const i = iz * this.rw + ix;
        if (hfn === null) { this.floor[i] = NaN; this.flags[i] = 0; continue; }
        const h = typeof hfn === 'number' ? hfn : hfn(x, z);
        this.floor[i] = h; this.flags[i] = flag;
      }
    }
  }
  changed(x0, z0, x1, z1) {
    this.version++;
    for (const l of this.listeners) l(x0, z0, x1, z1);
  }
  waterDepth(x, z) { return this.WL - this.floorAt(x, z); }

  // ---------------------------------------------------------------- stakes (hazards)
  addStake(x, z, heading) {
    const s = { x, z, heading, alive: true, hp: 1 };
    this.stakes.push(s);
    const k = (Math.floor(x / 4) + 1000) * 4096 + Math.floor(z / 4) + 1000;
    let b = this.stakeGrid.get(k);
    if (!b) { b = []; this.stakeGrid.set(k, b); }
    b.push(s);
    return s;
  }
  stakesNear(x, z, out) {
    out.length = 0;
    const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const b = this.stakeGrid.get((cx + dx + 1000) * 4096 + cz + dz + 1000);
      if (b) for (const s of b) if (s.alive) out.push(s);
    }
    return out;
  }

  // ---------------------------------------------------------------- bridges
  addBridge(cx, width, wood) {
    const R = this.river;
    const zc = this.riverZ(cx);
    const halfL = R.half + 8;
    const b = {
      x0: cx - width / 2, x1: cx + width / 2, z0: zc - halfL, z1: zc + halfL, cx, zc, width, wood,
      alive: true, progress: 0, name: wood ? '木橋' : '石橋',
    };
    b.deck = (x, z) => Math.max(this.terrain(x, z) + 0.05, (wood ? 0.25 : 0.3) + (wood ? 0.15 : 0.6) * (1 - ((z - zc) / halfL) ** 2));
    this.setRect(b.x0, b.z0, b.x1, b.z1, b.deck, F_BRIDGE);
    this.bridges.push(b);
    return b;
  }
  destroyBridge(b) {
    if (!b.alive) return;
    b.alive = false;
    this.setRect(b.x0, b.z0, b.x1, b.z1, null);
    this.changed(b.x0, b.z0, b.x1, b.z1);
  }
  // pontoon: grows from the bank at z0 in direction dir (+1 / -1)
  startPontoon(x, team) {
    const R = this.river;
    const zc = this.riverZ(x);
    const dir = team === 0 ? 1 : -1;
    const p = { x, zc, dir, z0: zc - dir * (R.half + 6), len: 0, total: 2 * R.half + 12, width: 4, done: false, team };
    this.pontoons.push(p);
    return p;
  }
  growPontoon(p, dl) {
    if (p.done) return;
    const old = p.len;
    p.len = Math.min(p.total, p.len + dl);
    const a = p.z0 + p.dir * old, b = p.z0 + p.dir * p.len;
    const zA = Math.min(a, b), zB = Math.max(a, b);
    const WL = this.WL;
    this.setRect(p.x - p.width / 2, zA, p.x + p.width / 2, zB, (x, z) => Math.max(this.terrain(x, z) + 0.05, WL + 0.3), F_PONTOON);
    if (p.len >= p.total) p.done = true;
    // only report to navigation once a meaningful piece is added
    if (Math.floor(p.len / 4) !== Math.floor(old / 4) || p.done) this.changed(p.x - 3, zA - 4, p.x + 3, zB + 4);
  }

  // ---------------------------------------------------------------- siege works
  wallTop() { return this.city.H; }
  addLadder(x, team) {
    const C = this.city;
    const l = { x, team, state: 'carried', angle: 0, t: 0, alive: true, z1: C.z0, z0: C.z0 - 5, cx: x, cz: C.z0 - 8, heading: 0, carriers: [] };
    this.ladders.push(l);
    return l;
  }
  raiseLadder(l) {
    const C = this.city, H = C.H;
    l.state = 'up'; l.angle = 1;
    this.setRect(l.x - 1, l.z0, l.x + 1, l.z1, (x, z) => this.terrain(x, z) + (H - this.terrain(x, z)) * clamp((z - l.z0) / (l.z1 - l.z0), 0, 1), F_LADDER);
    this.changed(l.x - 2, l.z0 - 2, l.x + 2, l.z1 + 2);
  }
  dropLadder(l) {
    if (l.state !== 'up') return;
    l.state = 'falling'; l.t = 0;
    this.setRect(l.x - 1, l.z0, l.x + 1, l.z1, null);
    this.changed(l.x - 2, l.z0 - 2, l.x + 2, l.z1 + 2);
  }
  breakGate(g) {
    if (!g.alive) return;
    g.alive = false;
    this.setRect(g.x0, g.z0, g.x1, g.z1, null);
    this.changed(g.x0, g.z0 - 2, g.x1, g.z1 + 2);
  }
  insideCity(x, z) {
    const C = this.city;
    return C && Math.abs(x) < C.L && z > C.z1 && z < C.zb;
  }
}

// ------------------------------------------------------------------ builders
export function buildStage(kind, scale) {
  setSeed(4242);
  const st = new Stage(kind, scale);
  if (kind === 'river') buildRiver(st);
  else if (kind === 'siege') buildSiege(st);
  st.bakeTerrain();
  return st;
}

function buildRiver(st) {
  const S = st.S;
  st.river = { amp: 4, freq: 0.012, half: 13, fordX: 150 * S, fordHalf: 20, bed: -3.0, fordBed: -1.05 };
  st.WL = -0.45; st.hasWater = true;
  const X = Math.min(490, 420 * S);
  st.initRaster(-X, -40, X, 40);
  st.stoneBridge = st.addBridge(0, 10, false);
  st.woodBridge = st.addBridge(-150 * S, 5, true);
}

function buildSiege(st) {
  const S = st.S;
  const L = Math.round(120 * S / 2) * 2;
  const C = st.city = { L, z0: 40, z1: 44, zb: 40 + Math.round(110 * S / 2) * 2, H: 7, T: 4 };
  const H = C.H;
  st.initRaster(-L - 20, C.z0 - 16, L + 20, C.zb + 16);
  const wall = (x0, z0, x1, z1) => { st.setRect(x0, z0, x1, z1, H, F_WALL); st.structs.push({ type: 'wall', x0, z0, x1, z1, h: H }); };
  // south wall (facing the attacker), drawn in two pieces so the gate can open a real hole
  st.setRect(-L - 4, C.z0, L + 4, C.z1, H, F_WALL);
  st.structs.push({ type: 'wall', x0: -L - 4, z0: C.z0, x1: -4, z1: C.z1, h: H });
  st.structs.push({ type: 'wall', x0: 4, z0: C.z0, x1: L + 4, z1: C.z1, h: H });
  wall(-L - 4, C.z0, -L, C.zb + 4);          // west
  wall(L, C.z0, L + 4, C.zb + 4);            // east
  wall(-L - 4, C.zb, L + 4, C.zb + 4);       // north
  // towers along the south wall
  const towerX = [-L, -8, 8, L];
  for (let x = -L + 40; x < -12; x += 40) towerX.push(x);
  for (let x = L - 40; x > 12; x -= 40) towerX.push(x);
  for (const tx of towerX) {
    st.setRect(tx - 4, C.z0 - 2, tx + 4, C.z1 + 2, H, F_TOWER);
    st.structs.push({ type: 'tower', x0: tx - 4, z0: C.z0 - 2, x1: tx + 4, z1: C.z1 + 2, h: H + 4 });
  }
  // gate (a solid block in the wall until it is broken)
  const g = { x0: -4, x1: 4, z0: C.z0, z1: C.z1, hp: 2600, maxHp: 2600, alive: true, cx: 0, cz: C.z0 };
  st.setRect(g.x0, g.z0, g.x1, g.z1, H, F_GATE);
  st.gates.push(g);
  // stair ramps on the inner face of the south wall
  for (const x0 of [-L + 10, -60 * S, 44 * S, L - 26]) {
    const xs = Math.round(x0 / 2) * 2;
    st.setRect(xs, C.z1, xs + 16, C.z1 + 4, (x) => H * clamp((x - xs) / 16, 0, 1), F_RAMP);
    st.structs.push({ type: 'ramp', x0: xs, z0: C.z1, x1: xs + 16, z1: C.z1 + 4, h: H });
  }
  // houses
  for (let z = C.z1 + 16; z < C.zb - 12; z += 18) {
    for (let x = -L + 10; x < L - 14; x += 18) {
      if (Math.abs(x + 6) < 26 && z < C.z1 + 50) continue; // square behind the gate
      if (Math.abs(x + 6) < 5) continue;                   // main street
      if (rand() < 0.15) continue;
      const w = randRange(9, 13), d = randRange(9, 13), h = randRange(3.5, 6);
      const x0 = x + randRange(0, 2), z0 = z + randRange(0, 2);
      st.setRect(x0, z0, x0 + w, z0 + d, h, F_HOUSE);
      st.structs.push({ type: 'house', x0, z0, x1: x0 + w, z1: z0 + d, h, roof: rand() });
    }
  }
}
