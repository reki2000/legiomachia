// Procedural quadrupeds: one parametric rig for horse / camel / dog, plus the elephant.
import { TAU, lerp, smoothstep, ik2 } from '../util.js';

export class QuadState {
  constructor(phase = Math.random()) {
    this.phase = phase; this.speed = 0; this.t = Math.random() * 10;
    this.rear = 0;   // rearing (horse) / lunge (dog) 0..1
    this.wheel = 0;  // chariot wheel angle
    this.swing = 0;  // engine animation (ram beam / onager arm)
  }
  tick(dt, stride) {
    this.phase += (dt * this.speed) / stride;
    if (this.phase > 1) this.phase -= Math.floor(this.phase);
    this.t += dt;
    this.rear = Math.max(0, this.rear - dt * 0.9);
  }
}

export const Q = {
  RUMP: 0, CHEST: 1, NECK: 2, NECKMID: 3, POLL: 4, MUZZLE: 5, TAIL0: 6, TAIL1: 7,
  FL0: 8, FL1: 9, FL2: 10, FR0: 11, FR1: 12, FR2: 13,
  HL0: 14, HL1: 15, HL2: 16, HR0: 17, HR1: 18, HR2: 19,
  SADDLE: 20, CENTER: 21,
};
export const NQ = 22;
// back-compat alias for the horse rig
export const H = Q;
export const NH = NQ;

// body presets (metres). front/hind leg roots are for the left side (x<0)
export const ANIMALS = {
  horse: {
    rump: [0, 1.38, -0.85], chest: [0, 1.33, 0.8], center: [0, 1.3, 0], saddle: [0, 1.64, 0.02],
    neck: [0, 1.47, 0.72], neckLen: 0.8, neckA: 0.9, neckBend: 0, headLen: 0.6, headA: -1.95,
    tail0: [0, 1.36, -0.92], tail: [0.66, 1.25],
    legF: [0.19, 1.12, 0.62], legH: [0.19, 1.15, -0.68], lF: [0.56, 0.6], lH: [0.62, 0.6], hoofY: 0.06,
    walkOff: [0.25, 0.75, 0.0, 0.5], galOff: [0.52, 0.64, 0.0, 0.1],
    stride: [1.4, 0.45], galFrom: [2.5, 8], pivot: [1.2, -0.65], bob: 0.08, pitch: 0.08,
    w: { body: [0.58, 0.74], neck: [0.3, 0.56], head: [0.2, 0.32], leg1: [0.14, 0.18], leg2: [0.09, 0.1], hoof: 0.12, tail: [0.13, 0.09] },
  },
  camel: {
    rump: [0, 1.85, -0.8], chest: [0, 1.8, 0.72], center: [0, 1.78, 0], saddle: [0, 2.42, -0.1],
    neck: [0, 1.75, 0.9], neckLen: 0.6, neckA: -0.35, neckBend: 1.45, headLen: 0.5, headA: -1.35,
    tail0: [0, 1.85, -0.9], tail: [0.5, 1.5],
    legF: [0.22, 1.55, 0.6], legH: [0.22, 1.6, -0.7], lF: [0.78, 0.78], lH: [0.82, 0.8], hoofY: 0.05,
    walkOff: [0.0, 0.5, 0.03, 0.53], galOff: [0.5, 0.62, 0.0, 0.1],
    stride: [1.8, 0.5], galFrom: [3, 9], pivot: [1.6, -0.6], bob: 0.1, pitch: 0.06,
    w: { body: [0.62, 0.72], neck: [0.2, 0.3], head: [0.2, 0.28], leg1: [0.14, 0.18], leg2: [0.08, 0.09], hoof: 0.14, tail: [0.08, 0.06] },
    hump: true,
  },
  dog: {
    rump: [0, 0.55, -0.36], chest: [0, 0.58, 0.3], center: [0, 0.55, 0], saddle: [0, 0.7, 0],
    neck: [0, 0.64, 0.33], neckLen: 0.24, neckA: 0.7, neckBend: 0, headLen: 0.26, headA: -1.35,
    tail0: [0, 0.62, -0.4], tail: [0.28, 0.9], tailUp: true,
    legF: [0.09, 0.48, 0.28], legH: [0.09, 0.5, -0.32], lF: [0.23, 0.25], lH: [0.26, 0.24], hoofY: 0.03,
    walkOff: [0.25, 0.75, 0.0, 0.5], galOff: [0.5, 0.58, 0.0, 0.08],
    stride: [0.45, 0.13], galFrom: [1.5, 5], pivot: [0.55, -0.3], bob: 0.05, pitch: 0.14,
    w: { body: [0.26, 0.3], neck: [0.14, 0.2], head: [0.13, 0.16], leg1: [0.07, 0.08], leg2: [0.05, 0.05], hoof: 0.06, tail: [0.05, 0.04] },
    ears: true,
  },
};
export function quadStride(P, sp) { return P.stride[0] + Math.min(sp, 14) * P.stride[1]; }
export function horseStride(sp) { return quadStride(ANIMALS.horse, sp); }

const QL = new Float32Array(NQ * 3);

function toWorld(out, Lc, n, B) {
  const { ox, oy, oz, rx, ry, rz, ux, uy, uz, fx, fy, fz } = B;
  for (let i = 0; i < n * 3; i += 3) {
    const x = Lc[i], y = Lc[i + 1], z = Lc[i + 2];
    out[i] = ox + rx * x + ux * y + fx * z;
    out[i + 1] = oy + ry * x + uy * y + fy * z;
    out[i + 2] = oz + rz * x + uz * y + fz * z;
  }
}

export function poseQuad(out, st, B, P, dead = false) {
  const L = QL;
  const sp = st.speed, g = smoothstep(P.galFrom[0], P.galFrom[1], sp), move = smoothstep(0.05, 0.8, sp);
  const ph = st.phase;
  const duty = lerp(0.62, 0.34, g);
  const A = duty * quadStride(P, sp) * 0.5 * move;
  const lift = lerp(0.14, 0.42, g) * move * (P.lF[0] + P.lF[1]) / 1.16;
  const bob = P.bob * g * Math.sin(TAU * (ph + 0.25)) + P.bob * 0.25 * (1 - g) * Math.sin(2 * TAU * ph) * move;
  const rear = st.rear > 0 ? Math.sin(Math.min(1, st.rear) * Math.PI * 0.5) : 0;
  const pitch = P.pitch * g * Math.sin(TAU * (ph + 0.1)) + rear * (P.ears ? 0.45 : 0.75);
  const cp = Math.cos(pitch), spc = Math.sin(pitch);
  const pcy = P.pivot[0], pcz = P.pivot[1];
  const lunge = P.ears ? rear * 0.35 : 0;
  const set = (i, x, y, z) => {
    y += bob; z += lunge;
    const dy = y - pcy, dz = z - pcz;
    L[i * 3] = x; L[i * 3 + 1] = pcy + dy * cp + dz * spc; L[i * 3 + 2] = pcz - dy * spc + dz * cp;
  };
  set(Q.RUMP, P.rump[0], P.rump[1], P.rump[2]);
  set(Q.CHEST, P.chest[0], P.chest[1], P.chest[2]);
  set(Q.CENTER, P.center[0], P.center[1], P.center[2]);
  set(Q.SADDLE, P.saddle[0], P.saddle[1], P.saddle[2]);
  const neckA = P.neckA - 0.3 * g + 0.12 * Math.sin(TAU * ph + 2) * g + (dead ? -0.6 : 0) + rear * 0.3;
  const nb = P.neck;
  set(Q.NECK, nb[0], nb[1], nb[2]);
  const look = Math.sin(st.t * 0.4) * 0.05 * (1 - g);
  let mx = look * 0.5, my = nb[1] + Math.sin(neckA) * P.neckLen, mz = nb[2] + Math.cos(neckA) * P.neckLen;
  set(Q.NECKMID, mx, my, mz);
  const a2 = neckA + P.neckBend + (P.neckBend ? 0.1 * Math.sin(TAU * ph) * g : 0);
  const l2 = P.neckBend ? P.neckLen * 1.1 : P.neckLen * 0.001;
  const py = my + Math.sin(a2) * l2 + (P.neckBend ? 0 : 0), pz = mz + Math.cos(a2) * l2;
  set(Q.POLL, look, py, pz);
  const hA = (P.neckBend ? a2 : neckA) + P.headA - (dead ? 0.4 : 0) + (P.ears ? rear * 0.6 : 0);
  set(Q.MUZZLE, look * 1.5, py + Math.sin(hA) * P.headLen, pz + Math.cos(hA) * P.headLen);
  const sway = Math.sin(st.t * 1.3) * 0.12 + Math.sin(TAU * ph) * 0.1 * move;
  set(Q.TAIL0, P.tail0[0], P.tail0[1], P.tail0[2]);
  const tl = P.tail[0], ta = P.tailUp ? 0.9 - 0.3 * move : -P.tail[1] + 0.5 * g;
  set(Q.TAIL1, sway * tl, P.tail0[1] + Math.sin(ta) * tl, P.tail0[2] - Math.abs(Math.cos(ta)) * tl);

  for (let k = 0; k < 4; k++) {
    const front = k < 2, side = k % 2 === 0 ? -1 : 1;
    const r = front ? P.legF : P.legH;
    const i0 = Q.FL0 + k * 3;
    const rx = r[0] * side;
    set(i0, rx, r[1], r[2]);
    const p = (ph + lerp(P.walkOff[k], P.galOff[k], g)) % 1;
    let o, y = 0;
    if (p < duty) o = A * (1 - 2 * (p / duty));
    else {
      const t = (p - duty) / (1 - duty);
      o = -A + 2 * A * t * t * (3 - 2 * t);
      y = lift * Math.sin(Math.PI * t);
    }
    let fx = rx, fy = P.hoofY + y, fz = r[2] + o + lunge;
    if (front && rear > 0) {
      fy += rear * (P.lF[0] + P.lF[1]) * 0.8; fz += rear * 0.25;
      const dy = fy - pcy, dz = fz - pcz;
      fy = pcy + dy * cp + dz * spc - rear * 0.2; fz = pcz - dy * spc + dz * cp;
    }
    L[(i0 + 2) * 3] = fx; L[(i0 + 2) * 3 + 1] = fy; L[(i0 + 2) * 3 + 2] = fz;
    const l = front ? P.lF : P.lH;
    ik2(L, (i0 + 1) * 3, (i0 + 2) * 3, L[i0 * 3], L[i0 * 3 + 1], L[i0 * 3 + 2], fx, fy, fz, l[0], l[1], 0, 0, front ? 1 : -1);
  }
  toWorld(out, L, NQ, B);
}

export function poseHorse(out, st, B, dead = false) { poseQuad(out, st, B, ANIMALS.horse, dead); }

// ---------------- elephant ----------------
export const E = {
  RUMP: 0, CHEST: 1, HEADTOP: 2, HEADLOW: 3, T1: 4, T2: 5, T3: 6, T4: 7,
  TUSKL: 8, TUSKR: 9,
  FL0: 10, FL1: 11, FL2: 12, FR0: 13, FR1: 14, FR2: 15,
  HL0: 16, HL1: 17, HL2: 18, HR0: 19, HR1: 20, HR2: 21,
  TAIL0: 22, TAIL1: 23, HOWDAH: 24, MAHOUT: 25, EARL: 26, EARR: 27,
  EARLR: 28, EARRR: 29, TUSKLR: 30, TUSKRR: 31,
};
export const NE = 32;
export function eleStride(sp) { return 2.0 + Math.min(sp, 8) * 0.55; }
const EL_ = new Float32Array(NE * 3);
const E_OFF = [0.25, 0.75, 0.0, 0.5];
const E_ROOT = [[-0.6, 2.05, 1.0], [0.6, 2.05, 1.0], [-0.6, 2.15, -1.1], [0.6, 2.15, -1.1]];

export function poseElephant(out, st, B, rage = 0) {
  const L = EL_;
  const sp = st.speed, move = smoothstep(0.05, 0.6, sp), g = smoothstep(1, 5, sp);
  const ph = st.phase, t = st.t;
  const duty = lerp(0.72, 0.5, g);
  const A = duty * eleStride(sp) * 0.5 * move;
  const lift = lerp(0.18, 0.35, g) * move;
  const bob = 0.05 * Math.sin(2 * TAU * ph) * move;
  const set = (i, x, y, z) => { L[i * 3] = x; L[i * 3 + 1] = y + bob; L[i * 3 + 2] = z; };
  set(E.RUMP, 0, 2.45, -1.55);
  set(E.CHEST, 0, 2.5, 1.3);
  const nod = 0.06 * Math.sin(2 * TAU * ph) * move + rage * 0.25;
  set(E.HEADTOP, 0, 3.2 + nod * 0.5, 1.75);
  set(E.HEADLOW, 0, 2.25 + nod, 2.4);
  let x = 0, y = 2.25 + nod, z = 2.4, a = -1.2 + rage * 1.4;
  for (let i = 0; i < 4; i++) {
    a -= 0.12 + 0.13 * Math.sin(t * 1.3 + i * 0.7) - rage * 0.35;
    const len = 0.55 - i * 0.06;
    x += Math.sin(t * 0.9 + i * 0.6) * 0.09 * (i + 1) * 0.5;
    y += Math.sin(a) * len; z += Math.cos(a) * len;
    set(E.T1 + i, x, y, z);
  }
  set(E.TUSKLR, -0.28, 2.35 + nod, 2.2); set(E.TUSKL, -0.36, 2.0 + nod * 1.5, 3.0);
  set(E.TUSKRR, 0.28, 2.35 + nod, 2.2); set(E.TUSKR, 0.36, 2.0 + nod * 1.5, 3.0);
  const flap = Math.sin(t * 2.2) * 0.25 + rage * 0.3;
  set(E.EARLR, -0.55, 2.95, 1.75); set(E.EARL, -1.15 - flap * 0.3, 2.25, 1.45 + flap);
  set(E.EARRR, 0.55, 2.95, 1.75); set(E.EARR, 1.15 + flap * 0.3, 2.25, 1.45 + flap);
  set(E.TAIL0, 0, 2.6, -1.62);
  set(E.TAIL1, Math.sin(t * 1.7) * 0.25, 1.55, -1.8);
  set(E.HOWDAH, 0, 3.47, -0.3);
  set(E.MAHOUT, 0, 3.32, 1.2);
  for (let k = 0; k < 4; k++) {
    const r = E_ROOT[k], i0 = E.FL0 + k * 3;
    set(i0, r[0], r[1], r[2]);
    const p = (ph + E_OFF[k]) % 1;
    let o, yy = 0;
    if (p < duty) o = A * (1 - 2 * (p / duty));
    else {
      const tt = (p - duty) / (1 - duty);
      o = -A + 2 * A * tt * tt * (3 - 2 * tt);
      yy = lift * Math.sin(Math.PI * tt);
    }
    const fy = 0.12 + yy, fz = r[2] + o;
    L[(i0 + 2) * 3] = r[0]; L[(i0 + 2) * 3 + 1] = fy; L[(i0 + 2) * 3 + 2] = fz;
    ik2(L, (i0 + 1) * 3, (i0 + 2) * 3, L[i0 * 3], L[i0 * 3 + 1], L[i0 * 3 + 2], r[0], fy, fz, 1.02, 0.98, 0, 0, 1);
  }
  toWorld(out, L, NE, B);
}
