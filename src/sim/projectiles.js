// Ballistic missiles in flat typed arrays (ring buffer).
import { groundHeight, waterLevel } from '../terrain.js';
import { P_ARROW, P_JAV, P_STONE, P_BOLT, P_ROCK } from './defs.js';
import { col } from '../render/segments.js';

const CAP = 10000;
const STUCK_LIFE = 35;

// per type: visual length/width, damage, how well shields stop it, stick?
export const PROJ = {
  [P_ARROW]: { len: 0.8, w: 0.02, dmg: [35, 70], shield: 1, stick: true, col: col(0x8a6a40), drag: 0.0 },
  [P_JAV]: { len: 1.8, w: 0.035, dmg: [45, 85], shield: 0.8, stick: true, col: col(0x7a5a38), drag: 0.0, knock: 0.25 },
  [P_STONE]: { len: 0.07, w: 0.07, dmg: [18, 40], shield: 0.9, stick: false, col: col(0x8a8478), drag: 0.0, knock: 0.08 },
  [P_BOLT]: { len: 0.45, w: 0.03, dmg: [45, 85], shield: 0.55, stick: true, col: col(0x5a4a30), drag: 0.0 },
  [P_ROCK]: { len: 0.55, w: 0.55, dmg: [60, 140], shield: 0, stick: false, col: col(0x9a948a), drag: 0.0, splash: 3.2 },
};

export class Projectiles {
  constructor() {
    this.p = new Float32Array(CAP * 3);
    this.v = new Float32Array(CAP * 3);
    this.age = new Float32Array(CAP);
    this.flag = new Uint8Array(CAP); // 0 free, 1 flying, 2 stuck
    this.type = new Uint8Array(CAP);
    this.team = new Int8Array(CAP);
    this.dmg = new Float32Array(CAP);
    this.head = 0;
    this.flying = 0;
  }
  spawn(x, y, z, vx, vy, vz, team, type = P_ARROW, dmgMul = 1) {
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    const j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.age[i] = 0; this.flag[i] = 1; this.team[i] = team; this.type[i] = type; this.dmg[i] = dmgMul;
  }
  step(dt, world) {
    const p = this.p, v = this.v, f = this.flag, age = this.age;
    const WL = waterLevel();
    let flying = 0;
    for (let i = 0; i < CAP; i++) {
      if (f[i] === 0) continue;
      age[i] += dt;
      if (f[i] === 2) { if (age[i] > STUCK_LIFE) f[i] = 0; continue; }
      flying++;
      const j = i * 3, ty = this.type[i];
      v[j + 1] -= 9.8 * dt;
      const nx = p[j] + v[j] * dt, ny = p[j + 1] + v[j + 1] * dt, nz = p[j + 2] + v[j + 2] * dt;
      const gy = groundHeight(nx, nz);
      if (ny - gy < 5.5 && age[i] > 0.12) {
        const steps = ty === P_ROCK ? 1 : 3;
        let hit = null;
        for (let s = 1; s <= steps && !hit; s++) {
          const t = s / steps;
          const sx = p[j] + (nx - p[j]) * t, sy = p[j + 1] + (ny - p[j + 1]) * t, sz = p[j + 2] + (nz - p[j + 2]) * t;
          hit = world.missileHit(sx, sy, sz, v[j], v[j + 1], v[j + 2], this.team[i], ty, this.dmg[i]);
        }
        if (hit) { f[i] = 0; if (ty === P_ROCK) world.rockImpact(nx, ny, nz, v[j], v[j + 2], this.team[i]); continue; }
      }
      p[j] = nx; p[j + 1] = ny; p[j + 2] = nz;
      if (ny <= gy || ny < WL && ty === P_ROCK) {
        p[j + 1] = Math.max(gy, Math.min(ny, WL)) + 0.05;
        if (ty === P_ROCK) { world.rockImpact(nx, gy, nz, v[j], v[j + 2], this.team[i]); f[i] = 2; age[i] = STUCK_LIFE - 20; v[j] = 0; v[j + 1] = 1; v[j + 2] = 0; continue; }
        if (!PROJ[ty].stick || gy < WL - 0.3) { f[i] = 0; if (world.fx && gy < WL) world.fx.splash(nx, WL, nz, 3); continue; }
        f[i] = 2; age[i] = 0;
        if (world.fx && Math.random() < 0.3) world.fx.dust(nx, gy + 0.1, nz, 0.4);
      }
    }
    this.flying = flying;
  }
  emit(pools, visible) {
    const p = this.p, v = this.v, f = this.flag;
    for (let i = 0; i < CAP; i++) {
      if (f[i] === 0) continue;
      const j = i * 3;
      const x = p[j], y = p[j + 1], z = p[j + 2];
      if (!visible(x, y, z, 2)) continue;
      const P = PROJ[this.type[i]];
      if (this.type[i] === P_STONE || this.type[i] === P_ROCK) {
        const r = P.w * 0.5;
        pools.box.seg(x, y - r, z, x, y + r, z, 1, 0, 0, P.w, P.w, P.col);
        continue;
      }
      let dx = v[j], dy = v[j + 1], dz = v[j + 2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const len = P.len;
      const bury = f[i] === 2 ? len * 0.3 : 0;
      pools.box.seg(x - dx * (len - bury), y - dy * (len - bury), z - dz * (len - bury),
        x + dx * bury, y + dy * bury, z + dz * bury, 0, 1, 0, P.w, P.w, P.col);
    }
  }
}
