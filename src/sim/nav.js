// Navigation grid (2 m cells) built from the stage height field.
// Two movement classes: 0 = on foot (ramps, ladders), 1 = mounted/vehicles.
import { F_LADDER } from './stage.js';

const DEEP = 1, SHALLOW = 2, LADDER = 4;
const SQ2 = Math.SQRT2;

export class Nav {
  constructor(stage) {
    this.stage = stage;
    this.cell = 2; this.half = 500;
    this.N = (this.half * 2) / this.cell;
    const n = this.N * this.N;
    this.H = new Float32Array(n);
    this.F = new Uint8Array(n);
    this.clear = new Float32Array(n);
    this.comp = [new Int32Array(n), new Int32Array(n)]; // connected components per movement class
    this.bfs = new Int32Array(n);
    this.trivial = stage.kind === 'field';
    this.version = 0;
    // A* scratch
    this.g = new Float32Array(n);
    this.par = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.search = 1;
    this.heapN = new Int32Array(1 << 16);
    this.heapK = new Float32Array(1 << 16);
    if (!this.trivial) this.build();
    stage.listeners.push((x0, z0, x1, z1) => this.update(x0, z0, x1, z1));
  }
  cellOf(x, z) {
    const N = this.N;
    let cx = Math.floor((x + this.half) / this.cell), cz = Math.floor((z + this.half) / this.cell);
    if (cx < 0) cx = 0; else if (cx >= N) cx = N - 1;
    if (cz < 0) cz = 0; else if (cz >= N) cz = N - 1;
    return cz * N + cx;
  }
  center(c, out) {
    out.x = (c % this.N + 0.5) * this.cell - this.half;
    out.z = (Math.floor(c / this.N) + 0.5) * this.cell - this.half;
    return out;
  }
  sample(c) {
    const x = (c % this.N + 0.5) * this.cell - this.half, z = (Math.floor(c / this.N) + 0.5) * this.cell - this.half;
    const st = this.stage;
    const h = st.floorAt(x, z);
    this.H[c] = h;
    let f = 0;
    if (st.hasWater) {
      const d = st.WL - h;
      if (d > 1.1) f |= DEEP; else if (d > 0.15) f |= SHALLOW;
    }
    // ladders are narrower than a cell: probe across it
    if (st.flagAt(x, z) & F_LADDER || st.flagAt(x - 0.6, z) & F_LADDER || st.flagAt(x + 0.6, z) & F_LADDER) f |= LADDER;
    this.F[c] = f;
  }
  build() {
    const n = this.N * this.N;
    for (let c = 0; c < n; c++) this.sample(c);
    this.computeClearance();
    this.label(0); this.label(1);
  }
  // flood-fill connected regions so impossible path queries fail instantly
  label(cls) {
    const N = this.N, n = N * N, comp = this.comp[cls], q = this.bfs;
    comp.fill(0);
    let id = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] || (this.F[s] & DEEP)) continue;
      id++;
      let h = 0, t = 0;
      q[t++] = s; comp[s] = id;
      while (h < t) {
        const c = q[h++];
        const cx = c % N;
        if (cx > 0) { const m = c - 1; if (!comp[m] && this.stepOK(c, m, cls)) { comp[m] = id; q[t++] = m; } }
        if (cx < N - 1) { const m = c + 1; if (!comp[m] && this.stepOK(c, m, cls)) { comp[m] = id; q[t++] = m; } }
        if (c >= N) { const m = c - N; if (!comp[m] && this.stepOK(c, m, cls)) { comp[m] = id; q[t++] = m; } }
        if (c < n - N) { const m = c + N; if (!comp[m] && this.stepOK(c, m, cls)) { comp[m] = id; q[t++] = m; } }
      }
    }
  }
  // component of a cell; swimmers belong to the nearest dry cell's region
  compOf(c, cls) {
    const v = this.comp[cls][c];
    return v || this.comp[cls][this.nearestOpen(c, cls)];
  }
  reachable(x0, z0, x1, z1, cls) {
    if (this.trivial) return true;
    const a = this.compOf(this.cellOf(x0, z0), cls), b = this.compOf(this.cellOf(x1, z1), cls);
    return a !== 0 && a === b;
  }
  update(x0, z0, x1, z1) {
    if (this.trivial) return;
    const a = this.cellOf(x0 - 2, z0 - 2), b = this.cellOf(x1 + 2, z1 + 2);
    const N = this.N;
    for (let cz = Math.floor(a / N); cz <= Math.floor(b / N); cz++)
      for (let cx = a % N; cx <= b % N; cx++) this.sample(cz * N + cx);
    this.computeClearance();
    this.label(0); this.label(1);
    this.version++;
  }
  stepOK(c1, c2, cls) {
    const f2 = this.F[c2];
    if (f2 & DEEP) return false;
    const f = this.F[c1] | f2;
    if (cls === 1 && (f & LADDER)) return false;
    const lim = f & LADDER ? 3.8 : cls === 0 ? 1.05 : 0.6;
    const d = this.H[c2] - this.H[c1];
    return d <= lim && d >= -lim;
  }
  passable(x, z, cls) {
    if (this.trivial) return true;
    return !(this.F[this.cellOf(x, z)] & DEEP);
  }
  computeClearance() {
    const N = this.N, C = this.clear, H = this.H, F = this.F;
    const INF = 1e6;
    for (let cz = 0; cz < N; cz++) {
      for (let cx = 0; cx < N; cx++) {
        const c = cz * N + cx;
        if (F[c] & DEEP) { C[c] = 0; continue; }
        let v = INF;
        if (cx === 0 || cz === 0 || cx === N - 1 || cz === N - 1) v = 1;
        else {
          const h = H[c];
          if (Math.abs(H[c - 1] - h) > 1.05 || Math.abs(H[c + 1] - h) > 1.05 ||
            Math.abs(H[c - N] - h) > 1.05 || Math.abs(H[c + N] - h) > 1.05 ||
            (F[c - 1] | F[c + 1] | F[c - N] | F[c + N]) & DEEP) v = 1;
        }
        C[c] = v;
      }
    }
    const o = this.cell, d = this.cell * SQ2;
    for (let cz = 1; cz < N; cz++) for (let cx = 1; cx < N - 1; cx++) {
      const c = cz * N + cx;
      let v = C[c];
      if (C[c - 1] + o < v) v = C[c - 1] + o;
      if (C[c - N] + o < v) v = C[c - N] + o;
      if (C[c - N - 1] + d < v) v = C[c - N - 1] + d;
      if (C[c - N + 1] + d < v) v = C[c - N + 1] + d;
      C[c] = v;
    }
    for (let cz = N - 2; cz >= 0; cz--) for (let cx = N - 2; cx > 0; cx--) {
      const c = cz * N + cx;
      let v = C[c];
      if (C[c + 1] + o < v) v = C[c + 1] + o;
      if (C[c + N] + o < v) v = C[c + N] + o;
      if (C[c + N + 1] + d < v) v = C[c + N + 1] + d;
      if (C[c + N - 1] + d < v) v = C[c + N - 1] + d;
      C[c] = v;
    }
  }
  clearanceAt(x, z) {
    if (this.trivial) return 1e6;
    return this.clear[this.cellOf(x, z)];
  }
  // can a unit walk straight from A to B?
  raycast(x0, z0, x1, z1, cls) {
    if (this.trivial) return true;
    const dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz);
    const n = Math.ceil(L / 0.9);
    let c = this.cellOf(x0, z0);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const c2 = this.cellOf(x0 + dx * t, z0 + dz * t);
      if (c2 !== c) {
        if (!this.stepOK(c, c2, cls)) return false;
        c = c2;
      }
    }
    return true;
  }
  nearestOpen(c, cls) {
    if (!(this.F[c] & DEEP)) return c;
    const N = this.N;
    for (let r = 1; r < 12; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const n = c + dz * N + dx;
        if (n >= 0 && n < N * N && !(this.F[n] & DEEP)) return n;
      }
    }
    return c;
  }
  // A* over the grid. Returns an array of {x,z} waypoints (smoothed) or null.
  findPath(x0, z0, x1, z1, cls, maxExpand = 90000) {
    if (this.trivial || this.raycast(x0, z0, x1, z1, cls)) return [{ x: x1, z: z1 }];
    const N = this.N, H = this.H, F = this.F;
    const s = this.cellOf(x0, z0);
    const goal = this.nearestOpen(this.cellOf(x1, z1), cls);
    if (this.compOf(s, cls) !== this.comp[cls][goal] || !this.comp[cls][goal]) return null;
    const gx = goal % N, gz = Math.floor(goal / N);
    const id = ++this.search;
    const g = this.g, par = this.par, stamp = this.stamp, closed = this.closed;
    let hn = 0;
    const hN = this.heapN, hK = this.heapK;
    const push = (node, k) => {
      if (hn >= hN.length) return;
      let i = hn++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hK[p] <= k) break;
        hN[i] = hN[p]; hK[i] = hK[p]; i = p;
      }
      hN[i] = node; hK[i] = k;
    };
    const pop = () => {
      const top = hN[0];
      const ln = hN[--hn], lk = hK[hn];
      let i = 0;
      for (;;) {
        let l = i * 2 + 1;
        if (l >= hn) break;
        if (l + 1 < hn && hK[l + 1] < hK[l]) l++;
        if (hK[l] >= lk) break;
        hN[i] = hN[l]; hK[i] = hK[l]; i = l;
      }
      hN[i] = ln; hK[i] = lk;
      return top;
    };
    const heur = c => {
      const dx = Math.abs(c % N - gx), dz = Math.abs(Math.floor(c / N) - gz);
      return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * this.cell;
    };
    stamp[s] = id; g[s] = 0; par[s] = -1;
    push(s, heur(s));
    let found = false, exp = 0, best = s, bestH = heur(s);
    while (hn > 0 && exp < maxExpand) {
      const c = pop();
      if (closed[c] === id) continue;
      closed[c] = id; exp++;
      if (c === goal) { found = true; break; }
      const hc = heur(c);
      if (hc < bestH) { bestH = hc; best = c; }
      const cx = c % N, cz = Math.floor(c / N);
      for (let k = 0; k < 8; k++) {
        const dx = k < 3 ? k - 1 : k < 5 ? (k === 3 ? -1 : 1) : k - 6;
        const dz = k < 3 ? -1 : k < 5 ? 0 : 1;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (closed[n] === id) continue;
        if (!this.stepOK(c, n, cls)) continue;
        const diag = dx !== 0 && dz !== 0;
        if (diag && (!this.stepOK(c, cz * N + nx, cls) || !this.stepOK(c, nz * N + cx, cls))) continue;
        let cost = diag ? this.cell * SQ2 : this.cell;
        if (F[n] & SHALLOW) cost *= 2.5;
        if (F[n] & LADDER) cost *= 2;
        cost += Math.abs(H[n] - H[c]) * 0.5;
        const ng = g[c] + cost;
        if (stamp[n] !== id || ng < g[n]) {
          stamp[n] = id; g[n] = ng; par[n] = c;
          push(n, ng + heur(n));
        }
      }
    }
    if (!found) return null;
    // walk back
    const cells = [];
    for (let c = goal; c !== -1; c = par[c]) cells.push(c);
    cells.reverse();
    const pts = [];
    const p = { x: 0, z: 0 };
    let ax = x0, az = z0;
    let i = 1;
    // string pulling
    while (i < cells.length) {
      let j = cells.length - 1;
      for (; j > i; j--) {
        this.center(cells[j], p);
        if (this.raycast(ax, az, p.x, p.z, cls)) break;
      }
      this.center(cells[j], p);
      pts.push({ x: p.x, z: p.z });
      ax = p.x; az = p.z; i = j + 1;
    }
    if (pts.length) { pts[pts.length - 1] = { x: x1, z: z1 }; }
    else pts.push({ x: x1, z: z1 });
    // if the exact goal is not walkable keep the cell centre
    if (!this.raycast(ax, az, x1, z1, cls) && pts.length) this.center(goal, pts[pts.length - 1]);
    return pts;
  }
}
