// Turns skeleton joints into instanced segments (people, animals, vehicles, engines).
import * as THREE from 'three';
import {
  J, poseHuman, poseHumanFar, setBasisYaw, weaponHidden, SEAT_GROUND,
  W_SWORD, W_SPEAR, W_BOW, W_AXE, W_MACE, W_PIKE, W_JAV, W_SLING, W_XBOW, W_HAMMER, W_BANNER,
  SH_ROUND, SH_RECT, SH_SMALL, SH_NONE, ACT_SHOOT, ACT_RELOAD,
} from '../anim/human.js';
import { Q, E, ANIMALS } from '../anim/quadruped.js';
import { K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, TEAM_FLAG } from '../sim/defs.js';
import { S_ALIVE, S_DOWN, S_GETUP, S_DEAD, S_GONE } from '../sim/agent.js';
import { computeMount, computeCrew, CHARIOT_CAR_Z, CHARIOT_HORSE_Z, CHARIOT_HORSE_X } from '../sim/mounts.js';
import { col } from './segments.js';

const C_STRING = col(0xe8e0c8);
const C_ARROW = col(0x8a6a40);
const C_ROPE = col(0x5a4630);
const C_GOLD = col(0xe0c050);
const C_IRON = col(0x5a5a60);
const C_STONE = col(0x8a8478);

let T_NOW = 0;

// flag hanging from the top of a pole, waving in the wind
function emitFlag(S, tx, ty, tz, px, py, pz, colr, size, phase) {
  // (px,py,pz) = pole direction (unit)
  let wx = 0.9, wy = 0, wz = 0.4 + 0.3 * Math.sin(T_NOW * 1.3 + phase);
  const d = wx * px + wy * py + wz * pz;
  wx -= px * d; wy -= py * d; wz -= pz * d;
  const wl = Math.hypot(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl;
  const h = 0.75 * size, w = 1.1 * size;
  const ax = tx - px * h * 0.5, ay = ty - py * h * 0.5, az = tz - pz * h * 0.5;
  const wave = Math.sin(T_NOW * 4 + phase) * 0.12 * size;
  const nx = wz, nz = -wx; // normal-ish in the horizontal plane
  const mx = ax + wx * w * 0.5 + nx * wave, my = ay + wy * w * 0.5, mz = az + wz * w * 0.5 + nz * wave;
  const bx = ax + wx * w - nx * wave * 0.5, by = ay + wy * w, bz = az + wz * w - nz * wave * 0.5;
  S.box.seg(ax, ay, az, mx, my, mz, px, py, pz, h, 0.03, colr);
  S.box.seg(mx, my, mz, bx, by, bz, px, py, pz, h * 0.9, 0.03, colr);
}

// ---------------------------------------------------------------- human
export function emitHuman(S, j, L, weapon, shield, hideWeapon, nocked, lod, extra) {
  const box = S.box, taper = S.taper, cyl = S.cyl;
  const px = j[0], py = j[1], pz = j[2];
  const nx = j[3], ny = j[4], nz = j[5];
  const hx = j[6], hy = j[7], hz = j[8];
  const rx = j[18] - j[9], ry = j[19] - j[10], rz = j[20] - j[11];
  let ux = nx - px, uy = ny - py, uz = nz - pz;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  // body forward = up x right (right is RSHO - LSHO)
  let fx = uy * rz - uz * ry, fy = uz * rx - ux * rz, fz = ux * ry - uy * rx;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;

  taper.seg(px, py, pz, nx, ny, nz, rx, ry, rz, 0.42, 0.25, L.armor);
  box.seg(nx, ny, nz, hx, hy, hz, rx, ry, rz, 0.19, 0.22, L.skin);
  if (lod === 2) {
    box.seg(j[9], j[10], j[11], j[15], j[16], j[17], fx, fy, fz, 0.1, 0.1, L.sleeve);
    box.seg(j[18], j[19], j[20], j[24], j[25], j[26], fx, fy, fz, 0.1, 0.1, L.sleeve);
    box.seg(j[27], j[28], j[29], j[33], j[34], j[35], rx, ry, rz, 0.13, 0.13, L.legs);
    box.seg(j[36], j[37], j[38], j[42], j[43], j[44], rx, ry, rz, 0.13, 0.13, L.legs);
    taper.seg(px, py + 0.06, pz, px, py - 0.3, pz, rx, ry, rz, 0.4, 0.3, L.tunic);
  } else {
    taper.seg(px + ux * 0.06, py + uy * 0.06, pz + uz * 0.06, px - ux * 0.3, py - uy * 0.3, pz - uz * 0.3, rx, ry, rz, 0.4, 0.3, L.tunic);
    // hips: block across the hip joints, belt at the waist
    {
      let hx2 = j[36] - j[27], hy2 = j[37] - j[28], hz2 = j[38] - j[29];
      const hl2 = Math.sqrt(hx2 * hx2 + hy2 * hy2 + hz2 * hz2) || 1;
      hx2 /= hl2; hy2 /= hl2; hz2 /= hl2;
      const e = 0.07;
      box.seg(j[27] - hx2 * e, j[28] - hy2 * e, j[29] - hz2 * e, j[36] + hx2 * e, j[37] + hy2 * e, j[38] + hz2 * e, ux, uy, uz, 0.2, 0.23, L.hips || L.legs);
      if (lod === 0) box.seg(px - rx * 0.6, py + uy * 0.04, pz - rz * 0.6, px + rx * 0.6, py + uy * 0.04, pz + rz * 0.6, ux, uy, uz, 0.07, 0.27, L.belt || L.wood);
    }
    box.seg(j[9], j[10], j[11], j[12], j[13], j[14], fx, fy, fz, 0.1, 0.1, L.sleeve);
    box.seg(j[12], j[13], j[14], j[15], j[16], j[17], fx, fy, fz, 0.08, 0.08, L.skin);
    box.seg(j[18], j[19], j[20], j[21], j[22], j[23], fx, fy, fz, 0.1, 0.1, L.sleeve);
    box.seg(j[21], j[22], j[23], j[24], j[25], j[26], fx, fy, fz, 0.08, 0.08, L.skin);
    box.seg(j[27], j[28], j[29], j[30], j[31], j[32], rx, ry, rz, 0.14, 0.14, L.skin);
    box.seg(j[30], j[31], j[32], j[33], j[34], j[35], rx, ry, rz, 0.1, 0.1, L.legs);
    box.seg(j[36], j[37], j[38], j[39], j[40], j[41], rx, ry, rz, 0.14, 0.14, L.skin);
    box.seg(j[39], j[40], j[41], j[42], j[43], j[44], rx, ry, rz, 0.1, 0.1, L.legs);
  }
  let hdx = hx - nx, hdy = hy - ny, hdz = hz - nz;
  const hl = Math.sqrt(hdx * hdx + hdy * hdy + hdz * hdz) || 1;
  hdx /= hl; hdy /= hl; hdz /= hl;
  if (L.helm === 1) {
    cyl.seg(hx - hdx * 0.13, hy - hdy * 0.13, hz - hdz * 0.13, hx + hdx * 0.02, hy + hdy * 0.02, hz + hdz * 0.02, rx, ry, rz, 0.25, 0.27, L.helmCol);
    if (lod === 0 && L.crest) {
      if (L.bigCrest) box.seg(hx - fx * 0.05, hy - fy * 0.05, hz - fz * 0.05, hx + hdx * 0.18, hy + hdy * 0.18, hz + hdz * 0.18, rx, ry, rz, 0.06, 0.34, L.crest);
      else box.seg(hx, hy, hz, hx + hdx * 0.09, hy + hdy * 0.09, hz + hdz * 0.09, rx, ry, rz, 0.035, 0.24, L.crest);
    }
  } else if (L.helm === 2) {
    cyl.seg(hx - hdx * 0.12, hy - hdy * 0.12, hz - hdz * 0.12, hx, hy, hz, rx, ry, rz, 0.25, 0.26, L.helmCol);
    box.seg(hx, hy, hz, hx + hdx * 0.13, hy + hdy * 0.13, hz + hdz * 0.13, rx, ry, rz, 0.12, 0.12, L.helmCol);
    if (L.bigCrest && lod === 0) box.seg(hx + hdx * 0.1, hy + hdy * 0.1, hz + hdz * 0.1, hx + hdx * 0.3 - fx * 0.1, hy + hdy * 0.3 - fy * 0.1, hz + hdz * 0.3 - fz * 0.1, rx, ry, rz, 0.05, 0.1, L.crest);
  } else if (L.helm === 3) {
    cyl.seg(hx - hdx * 0.08, hy - hdy * 0.08, hz - hdz * 0.08, hx + hdx * 0.02, hy + hdy * 0.02, hz + hdz * 0.02, rx, ry, rz, 0.23, 0.24, L.helmCol);
  } else if (L.helm === 4) {
    cyl.seg(hx - hdx * 0.06, hy - hdy * 0.06, hz - hdz * 0.06, hx + hdx * 0.03, hy + hdy * 0.03, hz + hdz * 0.03, rx, ry, rz, 0.22, 0.22, L.helmCol);
  }
  if (L.cape && lod < 2) {
    const ax = nx - fx * 0.13, ay = ny - fy * 0.13, az = nz - fz * 0.13;
    const sway = extra && extra.run ? 0.35 * extra.run : 0;
    box.seg(ax, ay, az, px - fx * (0.22 + sway) - ux * 0.35, py - fy * 0.22 - uy * 0.35 + sway * 0.3, pz - fz * (0.22 + sway) - uz * 0.35, rx, ry, rz, 0.44, 0.03, L.cape);
  }
  if (lod === 0) {
    let gx = fx, gz = fz, gy = 0;
    const gl = Math.sqrt(gx * gx + gz * gz);
    if (gl > 0.3) { gx /= gl; gz /= gl; } else { gx = fx; gy = fy; gz = fz; }
    for (const f of [33, 42]) {
      const ax = j[f] - gx * 0.04, ay = j[f + 1] - 0.05 - gy * 0.04, az = j[f + 2] - gz * 0.04;
      box.seg(ax, ay, az, ax + gx * 0.2, ay + gy * 0.2, az + gz * 0.2, rx, ry, rz, 0.09, 0.06, L.legs);
    }
  }
  // ---- weapon
  const wb = J.WBASE * 3, wt = J.WTIP * 3;
  if (!hideWeapon) {
    let dx = j[wt] - j[wb], dy = j[wt + 1] - j[wb + 1], dz = j[wt + 2] - j[wb + 2];
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const tip = (k, w, d, c) => {
      const mx = j[wt] - dx * k, my = j[wt + 1] - dy * k, mz = j[wt + 2] - dz * k;
      box.seg(mx, my, mz, j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, w, d, c);
      return [mx, my, mz];
    };
    switch (weapon) {
      case W_SWORD:
        box.seg(j[wb], j[wb + 1], j[wb + 2], j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.05, 0.014, L.metal);
        break;
      case W_SPEAR: case W_PIKE: case W_JAV: {
        const k = weapon === W_PIKE ? 0.3 : weapon === W_JAV ? 0.18 : 0.24;
        const m = [j[wt] - dx * k, j[wt + 1] - dy * k, j[wt + 2] - dz * k];
        box.seg(j[wb], j[wb + 1], j[wb + 2], m[0], m[1], m[2], rx, ry, rz, weapon === W_JAV ? 0.025 : 0.035, weapon === W_JAV ? 0.025 : 0.035, L.wood);
        tip(k, 0.055, 0.016, L.metal);
        break;
      }
      case W_AXE: case W_HAMMER: case W_MACE: {
        box.seg(j[wb], j[wb + 1], j[wb + 2], j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.04, 0.04, L.wood);
        if (weapon === W_MACE) cyl.seg(j[wt] - dx * 0.16, j[wt + 1] - dy * 0.16, j[wt + 2] - dz * 0.16, j[wt] + dx * 0.02, j[wt + 1] + dy * 0.02, j[wt + 2] + dz * 0.02, rx, ry, rz, 0.13, 0.13, C_IRON);
        else {
          // head sticks out sideways from the haft
          let sx = ry * dz - rz * dy, sy = rz * dx - rx * dz, sz = rx * dy - ry * dx;
          const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
          const hx2 = j[wt] - dx * 0.08, hy2 = j[wt + 1] - dy * 0.08, hz2 = j[wt + 2] - dz * 0.08;
          const len = weapon === W_AXE ? 0.24 : 0.16;
          box.seg(hx2 - sx * 0.05, hy2 - sy * 0.05, hz2 - sz * 0.05, hx2 + sx * len, hy2 + sy * len, hz2 + sz * len, dx, dy, dz, weapon === W_AXE ? 0.17 : 0.08, 0.03, weapon === W_AXE ? L.metal : C_IRON);
        }
        break;
      }
      case W_BOW: {
        const lh = J.LHAND * 3;
        let bx = j[lh] - j[24], by = j[lh + 1] - j[25], bz = j[lh + 2] - j[26];
        const bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        const k = nocked ? 0.12 / bl : 0;
        const mx = j[lh] + bx * k, my = j[lh + 1] + by * k, mz = j[lh + 2] + bz * k;
        box.seg(j[wb], j[wb + 1], j[wb + 2], mx, my, mz, rx, ry, rz, 0.03, 0.03, L.wood);
        box.seg(mx, my, mz, j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.03, 0.03, L.wood);
        if (nocked && lod === 0) {
          box.seg(j[wb], j[wb + 1], j[wb + 2], j[24], j[25], j[26], rx, ry, rz, 0.01, 0.01, C_STRING);
          box.seg(j[24], j[25], j[26], j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.01, 0.01, C_STRING);
          box.seg(j[24], j[25], j[26], j[lh] + bx / bl * 0.2, j[lh + 1] + by / bl * 0.2, j[lh + 2] + bz / bl * 0.2, rx, ry, rz, 0.02, 0.02, C_ARROW);
        }
        break;
      }
      case W_XBOW: {
        box.seg(j[wb], j[wb + 1], j[wb + 2], j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.06, 0.06, L.wood);
        // prod across the front
        let sx = ry * dz - rz * dy, sy = rz * dx - rx * dz, sz = rx * dy - ry * dx;
        const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        const cx = j[wt] - dx * 0.08, cy = j[wt + 1] - dy * 0.08, cz = j[wt + 2] - dz * 0.08;
        box.seg(cx - sx * 0.35 - dx * 0.08, cy - sy * 0.35 - dy * 0.08, cz - sz * 0.35 - dz * 0.08, cx, cy, cz, dx, dy, dz, 0.03, 0.03, L.wood);
        box.seg(cx, cy, cz, cx + sx * 0.35 - dx * 0.08, cy + sy * 0.35 - dy * 0.08, cz + sz * 0.35 - dz * 0.08, dx, dy, dz, 0.03, 0.03, L.wood);
        break;
      }
      case W_SLING: {
        box.seg(j[wb], j[wb + 1], j[wb + 2], j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.012, 0.012, C_ROPE);
        cyl.seg(j[wt], j[wt + 1] - 0.03, j[wt + 2], j[wt], j[wt + 1] + 0.03, j[wt + 2], rx, ry, rz, 0.07, 0.07, C_ROPE);
        break;
      }
      case W_BANNER: {
        box.seg(j[wb], j[wb + 1], j[wb + 2], j[wt], j[wt + 1], j[wt + 2], rx, ry, rz, 0.04, 0.04, L.wood);
        cyl.seg(j[wt], j[wt + 1], j[wt + 2], j[wt] + dx * 0.15, j[wt + 1] + dy * 0.15, j[wt + 2] + dz * 0.15, rx, ry, rz, 0.12, 0.12, C_GOLD);
        if (L.flag) emitFlag(S, j[wt] - dx * 0.1, j[wt + 1] - dy * 0.1, j[wt + 2] - dz * 0.1, dx, dy, dz, L.flag, 1, j[0]);
        break;
      }
    }
  }
  // ---- shield
  if (shield !== SH_NONE) {
    const lh = J.LHAND * 3, sn = J.SHN * 3;
    let sx = j[sn] - j[lh], sy = j[sn + 1] - j[lh + 1], sz = j[sn + 2] - j[lh + 2];
    const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    sx /= sl; sy /= sl; sz /= sl;
    const ax = j[lh] + sx * 0.03, ay = j[lh + 1] + sy * 0.03, az = j[lh + 2] + sz * 0.03;
    if (shield === SH_ROUND || shield === SH_SMALL) {
      const dmt = shield === SH_SMALL ? 0.56 : 0.86;
      cyl.seg(ax, ay, az, ax + sx * 0.06, ay + sy * 0.06, az + sz * 0.06, ux, uy, uz, dmt, dmt, L.shield);
      if (lod === 0) cyl.seg(ax + sx * 0.06, ay + sy * 0.06, az + sz * 0.06, ax + sx * 0.1, ay + sy * 0.1, az + sz * 0.1, ux, uy, uz, 0.18, 0.18, L.shieldRim);
    } else {
      box.seg(ax, ay, az, ax + sx * 0.07, ay + sy * 0.07, az + sz * 0.07, rx, ry, rz, 0.64, 1.05, L.shield);
      if (lod === 0) cyl.seg(ax + sx * 0.07, ay + sy * 0.07, az + sz * 0.07, ax + sx * 0.11, ay + sy * 0.11, az + sz * 0.11, ux, uy, uz, 0.16, 0.16, L.shieldRim);
    }
  }
}

// ---------------------------------------------------------------- quadrupeds
function jseg(pool, j, a, b, sx, sy, sz, w, d, c) {
  pool.seg(j[a * 3], j[a * 3 + 1], j[a * 3 + 2], j[b * 3], j[b * 3 + 1], j[b * 3 + 2], sx, sy, sz, w, d, c);
}

export function emitQuad(S, j, L, B, P, cloth, lod) {
  const box = S.box, taper = S.taper;
  const rx = B.rx, ry = B.ry, rz = B.rz;
  const W = P.w;
  const coat = L.barding || L.coat;
  jseg(box, j, Q.RUMP, Q.CHEST, rx, ry, rz, W.body[0], W.body[1], coat);
  jseg(taper, j, Q.MUZZLE, Q.POLL, rx, ry, rz, W.head[0], W.head[1], L.coat);
  if (P.neckBend) {
    jseg(box, j, Q.NECK, Q.NECKMID, rx, ry, rz, W.neck[0], W.neck[1], L.coat);
    jseg(box, j, Q.NECKMID, Q.POLL, rx, ry, rz, W.neck[0] * 0.9, W.neck[1] * 0.8, L.coat);
  } else jseg(taper, j, Q.POLL, Q.NECK, rx, ry, rz, W.neck[0], W.neck[1], L.barding || L.coat);
  if (P.hump) {
    const c = Q.CENTER * 3;
    box.seg(j[c] + B.ux * 0.2 - B.fx * 0.45, j[c + 1] + B.uy * 0.2 - B.fy * 0.45, j[c + 2] + B.uz * 0.2 - B.fz * 0.45,
      j[c] + B.ux * 0.55 + B.fx * 0.2, j[c + 1] + B.uy * 0.55 + B.fy * 0.2, j[c + 2] + B.uz * 0.55 + B.fz * 0.2, rx, ry, rz, 0.45, 0.5, L.coat);
  }
  if (P.ears && lod === 0) {
    const p = Q.POLL * 3;
    for (const s of [-1, 1]) box.seg(j[p] + rx * s * 0.05, j[p + 1], j[p + 2] + rz * s * 0.05, j[p] + rx * s * 0.07 + B.ux * 0.09, j[p + 1] + B.uy * 0.09, j[p + 2] + rz * s * 0.07 + B.uz * 0.09, B.fx, B.fy, B.fz, 0.05, 0.02, L.mane);
  }
  if (lod === 0 && !P.ears && !P.hump) {
    const ux = B.ux, uy = B.uy, uz = B.uz;
    const n = Q.NECK * 3, p = Q.POLL * 3;
    box.seg(j[n] + ux * 0.2, j[n + 1] + uy * 0.2, j[n + 2] + uz * 0.2, j[p] + ux * 0.08, j[p + 1] + uy * 0.08, j[p + 2] + uz * 0.08, rx, ry, rz, 0.07, 0.18, L.mane);
  }
  jseg(box, j, Q.TAIL0, Q.TAIL1, rx, ry, rz, W.tail[0], W.tail[1], L.mane);
  for (let k = 0; k < 4; k++) {
    const i0 = Q.FL0 + k * 3;
    jseg(box, j, i0, i0 + 1, rx, ry, rz, W.leg1[0], W.leg1[1], L.barding && k < 2 ? L.barding : L.coat);
    jseg(box, j, i0 + 1, i0 + 2, rx, ry, rz, W.leg2[0], W.leg2[1], L.coat);
    if (lod === 0) {
      const h = (i0 + 2) * 3;
      box.seg(j[h], j[h + 1] - P.hoofY, j[h + 2], j[h], j[h + 1] + P.hoofY * 0.8, j[h + 2], rx, ry, rz, W.hoof, W.hoof * 1.1, L.hoof);
    }
  }
  if (cloth && !P.ears) {
    const r = Q.RUMP * 3, c = Q.CHEST * 3;
    const lift = P.hump ? 0.3 : 0.08;
    const ax = j[r] + (j[c] - j[r]) * 0.3, ay = j[r + 1] + (j[c + 1] - j[r + 1]) * 0.3, az = j[r + 2] + (j[c + 2] - j[r + 2]) * 0.3;
    const bx = j[r] + (j[c] - j[r]) * 0.72, by = j[r + 1] + (j[c + 1] - j[r + 1]) * 0.72, bz = j[r + 2] + (j[c + 2] - j[r + 2]) * 0.72;
    box.seg(ax + B.ux * lift, ay + B.uy * lift, az + B.uz * lift, bx + B.ux * lift, by + B.uy * lift, bz + B.uz * lift, rx, ry, rz, W.body[0] + 0.06, W.body[1] * 0.9, L.cloth);
  }
}

// ---------------------------------------------------------------- elephant
export function emitElephant(S, j, L, B, lod) {
  const box = S.box, cyl = S.cyl;
  const rx = B.rx, ry = B.ry, rz = B.rz, fx = B.fx, fy = B.fy, fz = B.fz, ux = B.ux, uy = B.uy, uz = B.uz;
  jseg(box, j, E.RUMP, E.CHEST, rx, ry, rz, 1.9, 2.1, L.skin);
  jseg(box, j, E.HEADTOP, E.HEADLOW, rx, ry, rz, 1.1, 1.0, L.skin);
  jseg(box, j, E.HEADLOW, E.T1, rx, ry, rz, 0.42, 0.42, L.skin);
  jseg(box, j, E.T1, E.T2, rx, ry, rz, 0.34, 0.34, L.skin);
  jseg(box, j, E.T2, E.T3, rx, ry, rz, 0.27, 0.27, L.skin);
  jseg(box, j, E.T3, E.T4, rx, ry, rz, 0.21, 0.21, L.skin);
  jseg(box, j, E.TUSKLR, E.TUSKL, rx, ry, rz, 0.1, 0.1, L.tusk);
  jseg(box, j, E.TUSKRR, E.TUSKR, rx, ry, rz, 0.1, 0.1, L.tusk);
  jseg(box, j, E.EARLR, E.EARL, fx, fy, fz, 0.95, 0.08, L.dark);
  jseg(box, j, E.EARRR, E.EARR, fx, fy, fz, 0.95, 0.08, L.dark);
  jseg(box, j, E.TAIL0, E.TAIL1, rx, ry, rz, 0.1, 0.1, L.dark);
  for (let k = 0; k < 4; k++) {
    const i0 = E.FL0 + k * 3;
    jseg(box, j, i0, i0 + 1, rx, ry, rz, 0.55, 0.6, L.skin);
    jseg(box, j, i0 + 1, i0 + 2, rx, ry, rz, 0.46, 0.5, L.skin);
    const h = (i0 + 2) * 3;
    cyl.seg(j[h] - ux * 0.12, j[h + 1] - uy * 0.12, j[h + 2] - uz * 0.12, j[h] + ux * 0.1, j[h + 1] + uy * 0.1, j[h + 2] + uz * 0.1, rx, ry, rz, 0.56, 0.56, L.dark);
  }
  const r = E.RUMP * 3, c = E.CHEST * 3;
  const ax = j[r] + (j[c] - j[r]) * 0.15, ay = j[r + 1] + (j[c + 1] - j[r + 1]) * 0.15, az = j[r + 2] + (j[c + 2] - j[r + 2]) * 0.15;
  const bx = j[r] + (j[c] - j[r]) * 0.8, by = j[r + 1] + (j[c + 1] - j[r + 1]) * 0.8, bz = j[r + 2] + (j[c + 2] - j[r + 2]) * 0.8;
  box.seg(ax + ux * 0.25, ay + uy * 0.25, az + uz * 0.25, bx + ux * 0.25, by + uy * 0.25, bz + uz * 0.25, rx, ry, rz, 1.98, 1.7, L.cloth);
  const hw = E.HOWDAH * 3;
  box.seg(j[hw], j[hw + 1] - 0.1, j[hw + 2], j[hw] + ux * 0.62, j[hw + 1] + uy * 0.62, j[hw + 2] + uz * 0.62, rx, ry, rz, 1.45, 1.6, L.howdah);
  if (lod === 0) {
    box.seg(j[hw] + ux * 0.62, j[hw + 1] + uy * 0.62, j[hw + 2] + uz * 0.62, j[hw] + ux * 0.7, j[hw + 1] + uy * 0.7, j[hw + 2] + uz * 0.7, rx, ry, rz, 1.55, 1.7, L.trim);
  }
}

// ---------------------------------------------------------------- vehicles
let wx = 0, wy = 0, wz = 0;
function lw(B, x, y, z) {
  wx = B.ox + B.rx * x + B.ux * y + B.fx * z;
  wy = B.oy + B.ry * x + B.uy * y + B.fy * z;
  wz = B.oz + B.rz * x + B.uz * y + B.fz * z;
}
function lseg(pool, B, ax, ay, az, bx, by, bz, sx, sy, sz, w, d, c) {
  lw(B, ax, ay, az); const x0 = wx, y0 = wy, z0 = wz;
  lw(B, bx, by, bz);
  const s0 = B.rx * sx + B.ux * sy + B.fx * sz, s1 = B.ry * sx + B.uy * sy + B.fy * sz, s2 = B.rz * sx + B.uz * sy + B.fz * sz;
  pool.seg(x0, y0, z0, wx, wy, wz, s0, s1, s2, w, d, c);
}

export function emitChariot(S, a, lod) {
  const B = a.basis, L = a.look, box = S.box, cyl = S.cyl;
  const cz = CHARIOT_CAR_Z;
  emitQuad(S, a.mj, a.horseLooks[0], B, ANIMALS.horse, true, lod);
  emitQuad(S, a.mj2, a.horseLooks[1], B, ANIMALS.horse, true, lod);
  lseg(box, B, 0, 0.66, cz, 0, 0.76, cz, 1, 0, 0, 1.25, 0.95, L.wood);
  lseg(box, B, 0, 0.76, cz + 0.45, 0, 1.3, cz + 0.45, 1, 0, 0, 1.25, 0.08, L.trim);
  lseg(box, B, -0.62, 0.76, cz, -0.62, 1.1, cz, 1, 0, 0, 0.06, 0.9, L.trim);
  lseg(box, B, 0.62, 0.76, cz, 0.62, 1.1, cz, 1, 0, 0, 0.06, 0.9, L.trim);
  lseg(box, B, -0.85, 0.55, cz, 0.85, 0.55, cz, 0, 1, 0, 0.07, 0.07, L.wood);
  lseg(box, B, 0, 0.7, cz + 0.45, 0, 1.25, CHARIOT_HORSE_Z + 0.75, 1, 0, 0, 0.07, 0.07, L.wood);
  lseg(box, B, -CHARIOT_HORSE_X - 0.1, 1.42, CHARIOT_HORSE_Z + 0.75, CHARIOT_HORSE_X + 0.1, 1.42, CHARIOT_HORSE_Z + 0.75, 0, 1, 0, 0.07, 0.07, L.wood);
  const w = a.q.wheel, cw = Math.cos(w), sw = Math.sin(w);
  for (const s of [-1, 1]) {
    lseg(cyl, B, s * 0.72, 0.55, cz, s * 0.8, 0.55, cz, 0, cw, sw, 1.1, 1.1, L.wheel);
    if (lod === 0) {
      lseg(box, B, s * 0.82, 0.55 - cw * 0.5, cz - sw * 0.5, s * 0.82, 0.55 + cw * 0.5, cz + sw * 0.5, 1, 0, 0, 0.05, 0.05, L.metal);
      lseg(box, B, s * 0.82, 0.55 + sw * 0.5, cz - cw * 0.5, s * 0.82, 0.55 - sw * 0.5, cz + cw * 0.5, 1, 0, 0, 0.05, 0.05, L.metal);
      lseg(box, B, s * 0.85, 0.55, cz, s * 1.5, 0.45, cz - 0.1, 0, 1, 0, 0.05, 0.12, L.metal);
    }
  }
  if (lod === 0 && a.crew[0].alive) {
    const hj = a.mj, p = Q.POLL * 3, c = a.crew[0].joints;
    box.seg(c[15], c[16], c[17], hj[p], hj[p + 1], hj[p + 2], B.rx, B.ry, B.rz, 0.015, 0.015, C_ROPE);
    box.seg(c[24], c[25], c[26], a.mj2[p], a.mj2[p + 1], a.mj2[p + 2], B.rx, B.ry, B.rz, 0.015, 0.015, C_ROPE);
  }
}

export function emitRam(S, a, lod) {
  const B = a.basis, L = a.look, box = S.box, cyl = S.cyl;
  const w = a.q.wheel, cw = Math.cos(w), sw = Math.sin(w);
  for (const sx of [-1.15, 1.15]) for (const sz of [-1.8, 1.8]) {
    lseg(cyl, B, sx - 0.08, 0.5, sz, sx + 0.08, 0.5, sz, 0, cw, sw, 1.0, 1.0, L.dark);
  }
  lseg(box, B, -1.0, 0.7, -2.8, -1.0, 0.7, 2.8, 1, 0, 0, 0.25, 0.25, L.wood);
  lseg(box, B, 1.0, 0.7, -2.8, 1.0, 0.7, 2.8, 1, 0, 0, 0.25, 0.25, L.wood);
  for (const z of [-2.6, 0, 2.6]) {
    lseg(box, B, -1.0, 0.7, z, -1.0, 2.1, z, 1, 0, 0, 0.2, 0.2, L.wood);
    lseg(box, B, 1.0, 0.7, z, 1.0, 2.1, z, 1, 0, 0, 0.2, 0.2, L.wood);
  }
  // hide-covered roof
  for (const s of [-1, 1]) {
    const len = Math.hypot(1.35, 0.9);
    const sx = s * 1.35 / len, sy = -0.9 / len;
    lseg(box, B, s * 0.68, 2.55, -3.0, s * 0.68, 2.55, 3.0, sx, sy, 0, len + 0.1, 0.1, L.hide);
  }
  // swinging beam
  const sgw = a.q.swing * 0.9;
  lseg(cyl, B, 0, 1.45, -2.4 + sgw, 0, 1.45, 3.2 + sgw, 1, 0, 0, 0.42, 0.42, L.wood);
  lseg(box, B, 0, 1.45, 3.2 + sgw, 0, 1.45, 3.6 + sgw, 1, 0, 0, 0.5, 0.5, L.metal);
  if (lod === 0) {
    lseg(box, B, 0, 1.6, -1.2 + sgw, 0, 2.9, -1.2, 1, 0, 0, 0.03, 0.03, L.rope);
    lseg(box, B, 0, 1.6, 1.8 + sgw, 0, 2.9, 1.8, 1, 0, 0, 0.03, 0.03, L.rope);
  }
}

export function emitOnager(S, a, lod) {
  const B = a.basis, L = a.look, box = S.box, cyl = S.cyl;
  lseg(box, B, -0.75, 0.35, -1.8, -0.75, 0.35, 1.6, 1, 0, 0, 0.3, 0.3, L.wood);
  lseg(box, B, 0.75, 0.35, -1.8, 0.75, 0.35, 1.6, 1, 0, 0, 0.3, 0.3, L.wood);
  lseg(box, B, -0.9, 0.35, -1.4, 0.9, 0.35, -1.4, 0, 1, 0, 0.25, 0.25, L.wood);
  lseg(box, B, -0.9, 0.35, 1.2, 0.9, 0.35, 1.2, 0, 1, 0, 0.25, 0.25, L.wood);
  // stop frame
  lseg(box, B, -0.7, 0.4, 0.6, -0.55, 2.1, 0.2, 1, 0, 0, 0.18, 0.18, L.wood);
  lseg(box, B, 0.7, 0.4, 0.6, 0.55, 2.1, 0.2, 1, 0, 0, 0.18, 0.18, L.wood);
  lseg(box, B, -0.65, 2.1, 0.2, 0.65, 2.1, 0.2, 0, 1, 0, 0.22, 0.22, L.hide);
  // throwing arm: cocked (0) lies back, fired (1) up against the stop
  const th = 2.85 - 1.55 * a.q.swing;
  const ax = 0, ay = 0.7, az = -0.9;
  const ex = ay + Math.sin(th) * 2.9, ez = az + Math.cos(th) * 2.9;
  lseg(box, B, ax, ay, az, 0, ex, ez, 1, 0, 0, 0.18, 0.18, L.wood);
  lseg(cyl, B, 0, ex, ez, 0, ex + 0.2, ez, 1, 0, 0, 0.45, 0.45, L.rope);
  lseg(cyl, B, -0.8, ay, az, 0.8, ay, az, 0, 1, 0, 0.35, 0.35, L.rope); // torsion skein
  for (const s of [-1, 1]) for (const z of [-1.5, 1.3]) lseg(cyl, B, s * 0.95 - 0.06, 0.3, z, s * 0.95 + 0.06, 0.3, z, 0, 1, 0, 0.55, 0.55, L.dark);
}

// ---------------------------------------------------------------- world
const sphere = new THREE.Sphere();
const tmpJ = new Float32Array(18 * 3);
const SHADOW = [0, 0, 0];
const SEL = [0.1, 1.0, 0.25];
const SEL_ENEMY = [1.0, 0.25, 0.1];

export class BodyRenderer {
  constructor(dynSet, staticSet, shadows) {
    this.S = dynSet; this.static = staticSet; this.shadows = shadows;
    this.frustum = new THREE.Frustum();
    this.m = new THREE.Matrix4();
    this.visibleCount = 0;
    this.frame = 0;
  }
  visible(x, y, z, r) {
    sphere.center.set(x, y, z); sphere.radius = r;
    return this.frustum.intersectsSphere(sphere);
  }
  emit(world, camera, selection, stageR) {
    T_NOW = world.time;
    this.frame++;
    this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    const S = this.S, sh = this.shadows;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    S.reset(); sh.reset();

    const st = this.static;
    for (const a of world.freezeQueue) {
      if (st.box.n > st.box.cap - 60 || st.taper.n > st.taper.cap - 10 || st.cyl.n > st.cyl.cap - 10) break;
      if (a.kind === K_INF) {
        if (!a.rag) continue;
        emitHuman(st, a.rag.x, a.look, a.weapon, a.shield, false, false, 1, null);
        a.frozen = true; a.rag = null;
      } else {
        computeMount(a);
        this.emitMountBody(st, a, 1);
        a.frozen = true;
      }
    }
    world.freezeQueue.length = 0;
    st.flush();

    let vis = 0;
    const A = world.agents;
    const self = this;
    const vtest = (x, y, z, r) => self.visible(x, y, z, r);
    const frame = this.frame;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state === S_GONE || a.frozen) continue;
      let x = a.x, z = a.z, y = a.y;
      if (a.rag) { x = a.rag.x[0]; y = a.rag.x[1] - 0.9; z = a.rag.x[2]; }
      const big = a.kind !== K_INF && a.kind !== K_DOG;
      if (!this.visible(x, y + (big ? 2 : 1), z, big ? 5 : 1.4)) continue;
      const dist = Math.hypot(x - cx, y - cy, z - cz);
      if (dist > 950) continue;
      vis++;
      const lod = dist > 170 ? 2 : dist > 65 ? 1 : 0;
      const selected = selection && selection.has(a.reg);
      if (a.kind === K_INF) {
        let j = a.joints;
        const st2 = a.st;
        if (a.state === S_ALIVE) {
          const every = lod === 0 ? 1 : lod === 1 ? 2 : 4;
          if (!a.poseValid || (frame + a.id) % every === 0) {
            const B = setBasisYaw(a.basis, a.x, a.y, a.z, a.heading);
            if (lod === 2) poseHumanFar(j, st2, a.weapon, B);
            else poseHuman(j, st2, a.weapon, a.shield, SEAT_GROUND, B);
            a.poseX = a.x; a.poseY = a.y; a.poseZ = a.z; a.poseValid = true;
          } else {
            // reuse last pose, just translated
            const dx = a.x - a.poseX, dy = a.y - a.poseY, dz = a.z - a.poseZ;
            if (dx || dy || dz) {
              for (let k = 0; k < j.length; k += 3) { j[k] += dx; j[k + 1] += dy; j[k + 2] += dz; }
              a.poseX = a.x; a.poseY = a.y; a.poseZ = a.z;
            }
          }
        } else if (a.state === S_GETUP) {
          poseHuman(tmpJ, st2, a.weapon, a.shield, SEAT_GROUND, setBasisYaw(a.basis, a.x, a.y, a.z, a.heading));
          const t = Math.min(1, a.getupT / 1.1);
          const e = t * t * (3 - 2 * t);
          const f = a.blendFrom;
          for (let k = 0; k < j.length; k++) j[k] = f[k] + (tmpJ[k] - f[k]) * e;
          a.poseValid = false;
        } else if (a.rag) { j = a.rag.x; a.poseValid = false; }
        const nocked = st2.action === ACT_SHOOT && st2.actionT > 0.1 && st2.actionT < 0.8;
        emitHuman(S, j, a.look, a.weapon, a.shield, weaponHidden(st2, a.weapon), nocked, a.state === S_ALIVE ? lod : Math.min(lod, 1), st2);
        if (a.carry && a.state === S_ALIVE) { /* ladders drawn by the stage renderer */ }
        if (dist < 160) {
          if (a.state === S_ALIVE || a.state === S_GETUP) {
            sh.disc(a.x, a.y + 0.03, a.z, selected ? 0.8 : 0.55, selected ? 0.8 : 0.55, 1, 0, selected ? (a.team === 0 ? SEL : SEL_ENEMY) : SHADOW);
          } else sh.disc(x, world.stage.floorAt(x, z) + 0.03, z, 0.7, 0.7, 1, 0, SHADOW);
        } else if (selected) sh.disc(a.x, a.y + 0.05, a.z, 1.2, 1.2, 1, 0, a.team === 0 ? SEL : SEL_ENEMY);
      } else {
        if (lod === 2 && a.state === S_ALIVE && (frame + a.id) % 2 && a.poseValid) {
          // far animals: reuse last frame's joints (translated)
          const dx = a.x - a.poseX, dy = a.y - a.poseY, dz = a.z - a.poseZ;
          if (a.mj) for (let k = 0; k < a.mj.length; k += 3) { a.mj[k] += dx; a.mj[k + 1] += dy; a.mj[k + 2] += dz; }
          if (a.mj2) for (let k = 0; k < a.mj2.length; k += 3) { a.mj2[k] += dx; a.mj2[k + 1] += dy; a.mj2[k + 2] += dz; }
          a.basis.ox += dx; a.basis.oy += dy; a.basis.oz += dz;
          if (a.crew) for (const c of a.crew) if (c.alive) for (let k = 0; k < c.joints.length; k += 3) { c.joints[k] += dx; c.joints[k + 1] += dy; c.joints[k + 2] += dz; }
        } else {
          computeMount(a);
          if (a.crew) for (let c = 0; c < a.crew.length; c++) if (a.crew[c].alive) computeCrew(a, c);
        }
        a.poseX = a.x; a.poseY = a.y; a.poseZ = a.z; a.poseValid = true;
        this.emitMountBody(S, a, lod);
        if (a.crew) for (let c = 0; c < a.crew.length; c++) {
          const cr = a.crew[c];
          if (!cr.alive) continue;
          const cj = cr.joints;
          const nocked = cr.st.action === ACT_SHOOT && cr.st.actionT > 0.1 && cr.st.actionT < 0.8;
          emitHuman(S, cj, cr.look, cr.weapon, cr.shield, cr.hideWeapon, nocked, lod, cr.st);
          // commanders carry a banner on their back
          if (a.T.commander && c === 0) {
            const pb = [cj[0] - a.basis.fx * 0.25, cj[1], cj[2] - a.basis.fz * 0.25];
            S.box.seg(pb[0], pb[1], pb[2], pb[0], pb[1] + 2.6, pb[2], 1, 0, 0, 0.05, 0.05, cr.look.wood);
            emitFlag(S, pb[0], pb[1] + 2.55, pb[2], 0, 1, 0, a.T.commander >= 2 ? C_GOLD : TEAM_FLAG[a.team], a.T.commander >= 2 ? 1.1 : 0.8, a.id);
          }
        }
        if (a.state === S_ALIVE && dist < 200) {
          const len = a.kind === K_ELE ? 2.8 : a.kind === K_CHR ? 2.9 : a.kind === K_ENG ? 3.2 : a.kind === K_DOG ? 0.5 : 1.5;
          const wid = a.kind === K_ELE ? 2.2 : a.kind === K_CHR ? 2.0 : a.kind === K_ENG ? 2.2 : a.kind === K_DOG ? 0.3 : 0.8;
          const s = Math.sin(a.heading), c = Math.cos(a.heading);
          const k = selected ? 1.25 : 1;
          sh.disc(a.x, a.y + 0.03, a.z, wid * k, len * k, c, s, selected ? (a.team === 0 ? SEL : SEL_ENEMY) : SHADOW);
        }
      }
    }
    this.visibleCount = vis;

    if (selection) {
      for (const r of selection) {
        if (r.order === 'move' && r.team === 0) sh.disc(r.tx, world.stage.floorAt(r.tx, r.tz) + 0.05, r.tz, 2.5, 2.5, 1, 0, SEL);
      }
    }
    if (world.proj) world.proj.emit(S, vtest);
    if (stageR) stageR.emitDynamic(S, world, vtest);
    S.flush(); sh.flush();
  }
  emitMountBody(S, a, lod) {
    if (a.kind === K_CAV) emitQuad(S, a.mj, a.look, a.basis, ANIMALS[a.T.animal], true, lod);
    else if (a.kind === K_DOG) emitQuad(S, a.mj, a.look, a.basis, ANIMALS.dog, false, lod);
    else if (a.kind === K_ELE) emitElephant(S, a.mj, a.look, a.basis, lod);
    else if (a.kind === K_CHR) emitChariot(S, a, lod);
    else if (a.kind === K_ENG) { if (a.T.sub === 'ram') emitRam(S, a, lod); else emitOnager(S, a, lod); }
  }
}
