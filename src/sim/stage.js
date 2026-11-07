// Battle stages: analytic terrain + a raster of man-made floors (walls, bridges,
// ladders, pontoons...). Everything walkable is a single height field, so walls
// are plateaus, ladders are steep ramps and a bridge is a causeway over water.
import { smoothstep, clamp, rand, setSeed, randRange } from '../util.js';

export const F_LADDER = 1, F_GATE = 2, F_BRIDGE = 4, F_WALL = 8, F_RAMP = 16, F_PONTOON = 32, F_HOUSE = 64, F_TOWER = 128, F_ICE = 256;

export const STAGE_NAMES = {
  field: '平原の会戦', hills: '丘陵の会戦', forest: '森の会戦', canyon: '峡谷の隘路',
  river: '渡河戦', ford: '浅瀬の渡河戦', bridge: '落橋の渡河戦', harbor: '港の上陸戦',
  siege: '攻城戦', camp: '野営地襲撃',
  marsh: '沼地の戦い', village: '村落戦', ambush: '峠の伏撃', frozen: '凍河の戦い',
  flood: '決壊洪水', firestorm: '燃える都', landslide: '崩れる峠', naval: '海戦接舷',
  burnforest: '火攻めの森',
};
// the families share behaviour (AI, engineering tasks, navigation); the id picks the variant
export const STAGE_FAMILY = {
  field: 'field', hills: 'field', forest: 'field', canyon: 'field',
  river: 'river', ford: 'river', bridge: 'river', harbor: 'harbor',
  siege: 'siege', camp: 'siege',
  marsh: 'river', village: 'field', ambush: 'field', frozen: 'river',
  flood: 'river', firestorm: 'siege', landslide: 'field', naval: 'harbor',
  burnforest: 'field',
};

export class Stage {
  constructor(id, scale = 1) {
    this.id = id;
    this.kind = STAGE_FAMILY[id] || id;
    this.needsNav = false;   // open ground needs no navigation grid; obstacles and cliffs do
    this.hilly = false;      // height decides: uphill is slower, the high ground hits harder
    this.trees = null;       // [{x, z, s}] solid trees (forest)
    this.decor = [];         // purely visual props (moored boats)
    this.pontoonXs = null;
    this.scale = scale;
    this.S = Math.max(1, Math.sqrt(scale) * 0.8); // geometric widening for big armies
    this.flatR = 160 * this.S;
    this.WL = -1e9; this.hasWater = false;
    this.res = 0.5; this.rx0 = 0; this.rz0 = 0; this.rw = 0; this.rh = 0;
    this.floor = null; this.flags = null;
    this.structs = []; this.gates = []; this.bridges = []; this.ladders = []; this.pontoons = []; this.stakes = [];
    this.stakeGrid = new Map();
    this.river = null; this.city = null; this.harbor = null;
    this.canyon = false;        // sheer canyon walls (canyon / ambush / landslide)
    this.mudAreas = null;       // [{x, z, r, depth}] marsh: deep mud patches
    this.ice = false;           // frozen: the river surface is an ice sheet (F_ICE cells)
    this.villageSquare = null;  // village: the capture point
    this.galleys = null;        // naval: Kingdom war galleys [{x, z, heading, berthX}]
    this.rubble = null;         // landslide: the rockfall block, cleared by engineers
    this.version = 0;
    this.listeners = [];
  }

  // ---------------------------------------------------------------- terrain
  base(x, z) {
    const r = Math.sqrt(x * x + z * z);
    const hills = smoothstep(this.flatR, this.flatR + 180, r);
    let small = 0.7 * Math.sin(x * 0.019 + 0.5) * Math.cos(z * 0.016) + 0.35 * Math.sin(x * 0.047 + z * 0.041);
    if (this.id === 'hills') {
      // broad round hills on both flanks and a gentle swell in the middle
      for (const [hx, hz, hh, hs] of HILLS) small += hh * Math.exp(-((x - hx) * (x - hx) + (z - hz) * (z - hz)) / (2 * hs * hs));
    }
    const big = 9 * Math.sin(x * 0.009 + 1.3) * Math.cos(z * 0.011 - 0.4) + 6 * Math.sin(x * 0.021 - z * 0.017) + 7;
    return small + hills * big;
  }
  canyonHalf(z) { return 15 + 62 * smoothstep(12, 125, Math.abs(z)) * this.S; }
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
    if (this.harbor) return this.harborHeight(x, z);
    let h = this.base(x, z);
    const R = this.river;
    if (R) {
      const d = Math.abs(z - this.riverZ(x));
      const ch = smoothstep(R.half + 7, R.half - 2, d);
      if (ch > 0) {
        const f = smoothstep(R.fordHalf + 12, R.fordHalf, Math.abs(x - R.fordX));
        let bed = R.bed + (R.fordBed - R.bed) * f + 0.9 * (d / R.half) * (d / R.half);
        // deep pools break up a ford
        if (this.pools) for (const px of this.pools) bed -= 2.2 * Math.exp(-((x - px) * (x - px) + d * d) / 128);
        h = h * 0.4 + (bed - h * 0.4) * ch;
      } else h *= 0.4 + 0.6 * smoothstep(R.half + 7, R.half + 60, d);
    }
    if (this.canyon) {
      // sheer rock walls close in to a narrow neck in the middle
      const d = Math.abs(x) - this.canyonHalf(z);
      h += smoothstep(0, 9, d) * (24 + 5 * Math.sin(z * 0.05 + x * 0.03));
    }
    const C = this.city;
    if (C) {
      // the city sits on a levelled plateau
      const m = smoothstep(18, 4, Math.max(Math.abs(x) - C.L - 4, C.z0 - z, z - C.zb - 4, 0));
      h = h * (1 - m);
    }
    return h;
  }

  // ---------------------------------------------------------------- harbour
  // The sea lies to the south. A rectangular basin with stone quays is cut into the coast and
  // closed off by a mole with a narrow mouth; the town stands on the level ground behind it.
  shoreZ(x) { return this.harbor.shore + 5 * Math.sin(x * 0.011 + 0.7) + 2.5 * Math.sin(x * 0.031 + 2); }
  // signed distance to the basin's water edge (negative inside the basin)
  basinD(x, z) {
    const H = this.harbor;
    const qx = Math.abs(x) - H.Bw + H.r, qz = Math.abs(z - (H.zS + H.zN) / 2) - (H.zN - H.zS) / 2 + H.r;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - H.r;
  }
  // the gap in the mole through which ships come in
  harborMouth(x, z) { const H = this.harbor; return Math.abs(x) < H.E && z < H.zS + 4; }
  // stone pier ground: the quay coping round the basin and the mole out at sea
  onMole(x, z) {
    const H = this.harbor, d = this.basinD(x, z);
    if (d < -H.cope || this.harborMouth(x, z)) return false;
    return d < 1.5 || (d < H.moleW && z < this.shoreZ(x) + 4);
  }
  harborHeight(x, z) {
    const H = this.harbor, WL = this.WL;
    const small = 0.5 * Math.sin(x * 0.019 + 0.5) * Math.cos(z * 0.016) + 0.25 * Math.sin(x * 0.047 + z * 0.041);
    const hills = smoothstep(150 * this.S, 320 * this.S, z + 0.3 * Math.abs(x));
    const big = 9 * Math.sin(x * 0.009 + 1.3) * Math.cos(z * 0.011 - 0.4) + 6 * Math.sin(x * 0.021 - z * 0.017) + 9;
    const land = 1.4 + small + hills * big;
    // a sandy beach shelving gently into the sea
    const s = z - this.shoreZ(x);
    let h = s >= 0 ? WL + 0.15 + (land - WL - 0.15) * smoothstep(0, 34, s) : Math.max(H.seaBed, WL + 0.15 + s * 0.09);
    const d = this.basinD(x, z);
    if (d < -0.5) return H.Q + (H.bed - H.Q) * smoothstep(-0.5, -1.5, d);
    if (d < 6 && !this.harborMouth(x, z)) return H.Q; // hidden under the quay stones (the renderer draws them)
    // the ground round the basin is levelled for the quays
    if (d < 30) h += (H.Q - h) * smoothstep(30, 6, d) * smoothstep(-6, 4, s);
    return h;
  }
  // which way a swimmer should strike out for land
  landDir(x, z, out) {
    const d = this.basinD(x, z);
    let gx, gz;
    if (d < 0) { gx = this.basinD(x + 1, z) - this.basinD(x - 1, z); gz = this.basinD(x, z + 1) - this.basinD(x, z - 1); }
    else { gx = this.terrain(x + 2, z) - this.terrain(x - 2, z); gz = this.terrain(x, z + 2) - this.terrain(x, z - 2); }
    const l = Math.hypot(gx, gz);
    if (l < 1e-4) { out.x = 0; out.z = 1; } else { out.x = gx / l; out.z = gz / l; }
    return out;
  }

  // ---------------------------------------------------------------- raster
  initRaster(x0, z0, x1, z1) {
    this.rx0 = x0; this.rz0 = z0;
    this.rw = Math.ceil((x1 - x0) / this.res); this.rh = Math.ceil((z1 - z0) / this.res);
    this.floor = new Float32Array(this.rw * this.rh).fill(NaN);
    this.flags = new Uint16Array(this.rw * this.rh); // 16-bit: F_ICE is bit 256
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
  // marsh mud: 0 = firm ground, up to ~1 in the middle of a patch
  mudAt(x, z) {
    if (!this.mudAreas) return 0;
    let d = 0;
    for (const m of this.mudAreas) {
      const dd = Math.hypot(x - m.x, z - m.z);
      if (dd < m.r) d = Math.max(d, m.depth * (1 - dd / m.r * 0.45));
    }
    return d;
  }
  iceAt(x, z) { return this.ice && (this.flagAt(x, z) & F_ICE) !== 0; }

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

const HILLS = [[-100, -12, 21, 46], [96, 30, 18, 44], [0, 0, 5, 85]];

// ------------------------------------------------------------------ builders
export function buildStage(id, scale) {
  setSeed(4242);
  const st = new Stage(id, scale);
  if (st.kind === 'river') buildRiver(st);
  else if (st.kind === 'harbor') buildHarbor(st);
  else if (st.kind === 'siege') buildSiege(st);
  if (id === 'hills') st.hilly = true;
  if (id === 'canyon' || id === 'ambush' || id === 'landslide') { st.needsNav = true; st.canyon = true; st.initRaster(-90, -300, 90, 300); } // raster so the landslide rubble (and any pass works) can block the neck
  if (id === 'marsh') buildMarsh(st);
  if (id === 'frozen') buildIce(st);
  if (id === 'village') buildVillage(st);
  if (id === 'naval') {
    const H = st.harbor;
    st.galleys = [
      { x: -120 * st.S, z: H.shore - 105, heading: 0, berthX: -105 * st.S, oar: 0 },
      { x: 130 * st.S, z: H.shore - 120, heading: 0, berthX: 115 * st.S, oar: 2 },
    ];
  }
  st.bakeTerrain();
  if (id === 'forest' || id === 'burnforest') buildForest(st);
  return st;
}

// Marsh: a ford river (built by buildRiver with ford parameters) plus broad patches of
// deep mud on both banks and in the shallows. Mud is a movement effect only (stage.mudAt,
// applied in World.maxSpeed / moveMount): it does not change the height field.
function buildMarsh(st) {
  const S = st.S;
  st.mudAreas = [];
  const spots = [[-120, -34], [-40, -30], [50, -36], [130, -28], [-90, 34], [0, 30], [90, 38], [-170, 0], [170, -4], [-20, -58], [60, 60], [-60, -64]];
  for (const [x, z] of spots) st.mudAreas.push({ x: x * S, z, r: randRange(13, 25), depth: randRange(0.65, 1) });
}

// Frozen river: an ice sheet over the whole channel (the bridges from buildRiver stand
// above it). The sheet is a raster floor at WL - 0.08 flagged F_ICE; dynamics can crack it.
function buildIce(st) {
  st.ice = true;
  const R = st.river;
  for (let iz = 0; iz < st.rh; iz++) {
    for (let ix = 0; ix < st.rw; ix++) {
      const x = st.rx0 + (ix + 0.5) * st.res, z = st.rz0 + (iz + 0.5) * st.res;
      if (Math.abs(z - st.riverZ(x)) > R.half + 2) continue;
      let onBridge = false;
      for (const b of st.bridges) if (x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 && z < b.z1) { onBridge = true; break; }
      if (onBridge) continue;
      const i = iz * st.rw + ix;
      st.floor[i] = st.WL - 0.08; st.flags[i] = F_ICE;
    }
  }
}

// Village: houses and fences round a square, on field-family ground. Houses are raster
// blocks (F_HOUSE) exactly like the forest's trees and the city's houses; fences are low
// blocks (1 m: over the infantry step limit, so they block, but they stop no arrows high).
function buildVillage(st) {
  st.needsNav = true;
  st.initRaster(-200, -160, 200, 180);
  const sq = st.villageSquare = { x: 0, z: 10, r: 24 };
  const block = (x0, z0, x1, z1, h, type = 'house') => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, top = st.terrain(cx, cz) + h;
    st.setRect(x0, z0, x1, z1, top, F_HOUSE);
    st.structs.push({ type, x0, z0, x1, z1, h: top, roof: rand() });
  };
  for (let z = -104; z < 128; z += 17) {
    for (let x = -136; x < 128; x += 17) {
      const w = randRange(8, 11.5), d = randRange(8, 11), x0 = x + randRange(0, 2.5), z0 = z + randRange(0, 2.5);
      if (Math.abs(x0 + w / 2) < 8 + w / 2) continue;                       // main street (north-south)
      if (Math.abs(z0 + d / 2 - 52) < 5 + d / 2) continue;                 // cross street
      if (Math.hypot(Math.max(0, Math.abs(x0 + w / 2 - sq.x) - w / 2), Math.max(0, Math.abs(z0 + d / 2 - sq.z) - d / 2)) < sq.r + 2) continue;
      if (rand() < 0.22) continue;
      block(x0, z0, x0 + w, z0 + d, randRange(3.4, 5.4));
    }
  }
  // fences along the south edge and the square: low walls men must go round
  for (const [x0, z0, x1, z1] of [[-70, -118, -18, -117], [20, -118, 74, -117], [-52, 96, -14, 97], [16, 96, 58, 97], [-88, -40, -87, 8], [88, -30, 89, 18]]) {
    block(x0, z0, x1, z1, 1.0, 'fence');
  }
}

// Woods across the middle of the field. Every tree is a 2 m block of the raster (the size of a
// navigation cell), so men walk around trees and arrows stop in them. Open lanes and glades
// are left, so the armies must funnel through them.
function buildForest(st) {
  st.needsNav = true;
  const S = st.S, half = Math.min(470, Math.round(215 * S)), band = 36;
  st.initRaster(-half, -band - 8, half, band + 8);
  const lanes = [-0.62 * half, 0.04 * half, 0.55 * half];
  st.forestLaneX = lanes[1];
  const glades = [[-0.3 * half, 6, 22], [0.3 * half, -8, 20]];
  st.trees = [];
  for (let cx = -half; cx < half; cx += 2) {
    for (let cz = -band - 6; cz < band + 6; cz += 2) {
      const x = cx + 1, z = cz + 1;
      const edge = smoothstep(band, band - 12, Math.abs(z));
      if (edge <= 0) continue;
      let lane = 1e9;
      for (const l of lanes) lane = Math.min(lane, Math.abs(x - l - 4 * Math.sin(z * 0.08)));
      let open = smoothstep(6, 11, lane);
      for (const [gx, gz, gr] of glades) open = Math.min(open, smoothstep(gr * 0.8, gr * 1.15, Math.hypot(x - gx, (z - gz) * 1.3)));
      const clump = 0.5 + 0.5 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.11);
      if (rand() < 0.66 * edge * open * (0.35 + 0.65 * clump)) {
        st.trees.push({ x: x + randRange(-0.3, 0.3), z: z + randRange(-0.3, 0.3), s: randRange(0.9, 1.7) });
        st.setRect(cx, cz, cx + 2, cz + 2, st.terrain(x, z) + 3.2, F_HOUSE);
      }
    }
  }
}

// River family. river: a stone bridge, a wooden bridge and a ford. ford: shallows all along, with a
// few deep pools. bridge: deep water and a single wooden bridge that can be torn down.
function buildRiver(st) {
  const S = st.S, id = st.id;
  const X = Math.min(490, 420 * S);
  let half = 13, zr = 40;
  if (id === 'ford' || id === 'marsh') {
    st.river = { amp: 5, freq: 0.012, half: 22, fordX: 0, fordHalf: 1e5, bed: -1.05, fordBed: -1.05 };
    st.pools = [-0.5, -0.18, 0.2, 0.55].map(f => f * X);
    half = 22;
  } else if (id === 'bridge') {
    st.river = { amp: 4, freq: 0.012, half: 15, fordX: 0, fordHalf: -1e5, bed: -3.2, fordBed: -3.2 };
    half = 15;
  } else {
    st.river = { amp: 4, freq: 0.012, half: 13, fordX: 150 * S, fordHalf: 20, bed: -3.0, fordBed: -1.05 };
  }
  st.WL = -0.45; st.hasWater = true;
  zr = half + 30;
  st.initRaster(-X, -zr, X, zr);
  if (id === 'river' || id === 'frozen' || id === 'flood') {
    st.stoneBridge = st.addBridge(0, 10, false);
    st.woodBridge = st.addBridge(-150 * S, 5, true);
  } else if (id === 'bridge') {
    st.woodBridge = st.addBridge(0, 6, true);
    st.pontoonXs = [-45 * S, 45 * S];
  }
}

// Harbour: the Legion has come ashore on the beaches either side of a port and must take the
// town. The basin between the landing beaches splits the attack in two; the quays and the
// warehouses round it are the defenders' line.
function buildHarbor(st) {
  const S = st.S;
  const Bw = Math.round(46 * S);
  // the whole port grows with the armies, along the coast and inland
  const Z = v => Math.round(v * S);
  const H = st.harbor = {
    shore: Z(-135), Bw, zS: Z(-182), zN: Z(-40), r: 8, E: 12, Q: 1.1, bed: -3.6, seaBed: -6,
    cope: 3.6, moleW: 9, townX: Math.round(Bw + 50 * S), townZ0: Z(-22), townZ1: Z(64), square: { x: 0, z: Z(10), r: Z(22) },
  };
  st.WL = -0.45; st.hasWater = true; st.needsNav = true;
  const X = Math.round(H.townX + 30);
  st.initRaster(-X, H.zS - H.moleW - 6, X, H.townZ1 + 10);
  // the quay coping and the mole: crisp stone tops a little above the levelled ground
  for (let iz = 0; iz < st.rh; iz++) {
    for (let ix = 0; ix < st.rw; ix++) {
      const x = st.rx0 + (ix + 0.5) * st.res, z = st.rz0 + (iz + 0.5) * st.res;
      if (z < H.zN + 4 && st.onMole(x, z)) st.floor[iz * st.rw + ix] = H.Q + 0.08;
    }
  }
  const Q = H.Q;
  const block = (x0, z0, x1, z1, h, type = 'house') => {
    st.setRect(x0, z0, x1, z1, Q + h, F_HOUSE);
    st.structs.push({ type, x0, z0, x1, z1, h: Q + h, roof: rand() });
  };
  // warehouses along the north quay, with lanes through to the town
  for (let x = -H.townX + 4; x < H.townX - 14;) {
    const len = randRange(14, 22);
    if (Math.abs(x + len / 2) < 12 + len / 2) { x += 6; continue; } // the street up from the quay
    block(x, H.townZ0 - 2, x + len, H.townZ0 + 9, randRange(4.5, 6), 'warehouse');
    x += len + randRange(5, 8);
  }
  // and along the side quays
  for (const sx of [-1, 1]) {
    for (let z = Z(-98); z < Z(-50);) {
      const len = randRange(12, 16);
      const x0 = sx > 0 ? Bw + 16 : -Bw - 28;
      block(x0, z, x0 + 12, z + len, randRange(4, 5.5), 'warehouse');
      z += len + randRange(6, 9);
    }
  }
  // the town: houses round a square, a main street up from the quay and a cross street
  const sq = H.square;
  for (let z = H.townZ0 + 16; z < H.townZ1 - 8; z += 15) {
    for (let x = -H.townX + 4; x < H.townX - 12; x += 15) {
      const w = randRange(8, 11.5), d = randRange(8, 11), x0 = x + randRange(0, 2), z0 = z + randRange(0, 2);
      if (Math.abs(x0 + w / 2) < 9 * S + w / 2) continue;                              // main street
      if (Math.abs(z0 + d / 2 - Z(42)) < 6 * S + d / 2) continue;                       // cross street
      if (Math.hypot(Math.max(0, Math.abs(x0 + w / 2 - sq.x) - w / 2), Math.max(0, Math.abs(z0 + d / 2 - sq.z) - d / 2)) < sq.r) continue;
      if (rand() < 0.12) continue;
      block(x0, z0, x0 + w, z0 + d, randRange(3.5, 5.5));
    }
  }
  // lighthouse on the western mole head
  const lx = -H.E - 7, lz = H.zS - 3;
  st.setRect(lx - 3.5, lz - 3.5, lx + 3.5, lz + 3.5, Q + 14, F_HOUSE);
  st.structs.push({ type: 'lighthouse', x0: lx - 3.5, z0: lz - 3.5, x1: lx + 3.5, z1: lz + 3.5, h: Q + 14 });
  // boats moored in the basin, landing boats run up on the beaches, ships riding at anchor
  for (let z = H.zN - 14; z > H.zS + 16; z -= randRange(11, 15)) {
    for (const sx of [-1, 1]) if (rand() < 0.75) st.decor.push({ type: 'boat', x: sx * (Bw - 6.5), z, heading: randRange(-0.08, 0.08) });
  }
  for (let x = -Bw + 18; x < Bw - 16; x += randRange(21, 25)) st.decor.push({ type: 'ship', x, z: H.zN - 8.5, heading: Math.PI / 2 + randRange(-0.05, 0.05) });
  // the Legion's transports ride at anchor off the landing beaches
  st.transports = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = sx * (Bw + 70 * S + k * 72 * S), z = Math.max(-480, H.shore - 62 - (k % 2) * 14);
      st.transports.push({ x, z, side: sx < 0 ? 0 : 1 });
      st.decor.push({ type: 'ship', x, z, heading: Math.PI / 2 + randRange(-0.08, 0.08), big: true });
    }
  }
}

// Siege family. siege: a walled city. camp: a palisaded army camp, much smaller and lower,
// with tents instead of houses (the ladders, gate and ram work the same way).
function buildSiege(st) {
  const S = st.S, camp = st.id === 'camp';
  const L = camp ? Math.round(56 * S / 2) * 2 : Math.round(120 * S / 2) * 2;
  const depth = camp ? Math.round(72 * S / 2) * 2 : Math.round(110 * S / 2) * 2;
  const C = st.city = { L, z0: 40, z1: 44, zb: 40 + depth, H: camp ? 3.4 : 7, T: 4, camp };
  const H = C.H;
  st.initRaster(-L - 20, C.z0 - 16, L + 20, C.zb + 16);
  const wall = (x0, z0, x1, z1) => { st.setRect(x0, z0, x1, z1, H, F_WALL); st.structs.push({ type: 'wall', x0, z0, x1, z1, h: H, palisade: camp }); };
  // south wall (facing the attacker), drawn in two pieces so the gate can open a real hole
  st.setRect(-L - 4, C.z0, L + 4, C.z1, H, F_WALL);
  st.structs.push({ type: 'wall', x0: -L - 4, z0: C.z0, x1: -4, z1: C.z1, h: H, palisade: camp });
  st.structs.push({ type: 'wall', x0: 4, z0: C.z0, x1: L + 4, z1: C.z1, h: H, palisade: camp });
  wall(-L - 4, C.z0, -L, C.zb + 4);          // west
  wall(L, C.z0, L + 4, C.zb + 4);            // east
  wall(-L - 4, C.zb, L + 4, C.zb + 4);       // north
  // towers along the south wall
  const towerX = [-L, -8, 8, L];
  if (!camp) {
    for (let x = -L + 40; x < -12; x += 40) towerX.push(x);
    for (let x = L - 40; x > 12; x -= 40) towerX.push(x);
  }
  for (const tx of towerX) {
    st.setRect(tx - 4, C.z0 - 2, tx + 4, C.z1 + 2, H, F_TOWER);
    st.structs.push({ type: 'tower', x0: tx - 4, z0: C.z0 - 2, x1: tx + 4, z1: C.z1 + 2, h: H + 4, palisade: camp });
  }
  // gate (a solid block in the wall until it is broken)
  const gp = camp ? 1500 : 2600;
  const g = { x0: -4, x1: 4, z0: C.z0, z1: C.z1, hp: gp, maxHp: gp, alive: true, cx: 0, cz: C.z0 };
  st.setRect(g.x0, g.z0, g.x1, g.z1, H, F_GATE);
  st.gates.push(g);
  // stair ramps on the inner face of the south wall
  const ramps = camp ? [-L + 8, L - 24] : [-L + 10, -60 * S, 44 * S, L - 26];
  for (const x0 of ramps) {
    const xs = Math.round(x0 / 2) * 2;
    st.setRect(xs, C.z1, xs + 16, C.z1 + 4, (x) => H * clamp((x - xs) / 16, 0, 1), F_RAMP);
    st.structs.push({ type: 'ramp', x0: xs, z0: C.z1, x1: xs + 16, z1: C.z1 + 4, h: H });
  }
  if (camp) {
    // tents in rows, a wide lane behind the gate and a big command tent at the back
    for (let z = C.z1 + 12; z < C.zb - 16; z += 11) {
      for (let x = -L + 10; x < L - 12; x += 11) {
        if (Math.abs(x + 2) < 14 && z < C.z1 + 44) continue;
        if (Math.abs(x + 2) < 4) continue;
        if (rand() < 0.2) continue;
        const w = randRange(4.5, 6), d = randRange(4, 5.5), h = randRange(2.2, 3);
        const x0 = x + randRange(0, 2), z0 = z + randRange(0, 2);
        st.setRect(x0, z0, x0 + w, z0 + d, h, F_HOUSE);
        st.structs.push({ type: 'tent', x0, z0, x1: x0 + w, z1: z0 + d, h });
      }
    }
    st.setRect(-6, C.zb - 18, 6, C.zb - 8, 4.2, F_HOUSE);
    st.structs.push({ type: 'tent', x0: -6, z0: C.zb - 18, x1: 6, z1: C.zb - 8, h: 4.2, big: true });
    return;
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
