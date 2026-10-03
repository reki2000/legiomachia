// Procedural human animation.
// A pose is 18 joint positions. The same joint set is used by the ragdoll,
// so a soldier can be switched from animation to physics (and back) at any frame.
import { TAU, clamp, lerp, smoothstep, rand, randRange, ik2 } from '../util.js';

export const J = {
  PELVIS: 0, NECK: 1, HEAD: 2,
  LSHO: 3, LELB: 4, LHAND: 5,
  RSHO: 6, RELB: 7, RHAND: 8,
  LHIP: 9, LKNEE: 10, LFOOT: 11,
  RHIP: 12, RKNEE: 13, RFOOT: 14,
  WBASE: 15, WTIP: 16, SHN: 17,
};
export const NJ = 18;

export const W_SWORD = 0, W_SPEAR = 1, W_BOW = 2, W_AXE = 3, W_MACE = 4, W_PIKE = 5,
  W_JAV = 6, W_SLING = 7, W_XBOW = 8, W_HAMMER = 9, W_BANNER = 10, W_NONE = 11;
export const SH_NONE = 0, SH_ROUND = 1, SH_RECT = 2, SH_SMALL = 3;
export const SEAT_GROUND = 0, SEAT_RIDE = 1, SEAT_STAND = 2;

export const ACT_NONE = 0, ACT_ATTACK = 1, ACT_BLOCK = 2, ACT_SHOOT = 3, ACT_CHEER = 4,
  ACT_THROW = 5, ACT_SLING = 6, ACT_RELOAD = 7, ACT_WORK = 8;

// weapon -> pose family
const G_ONE = 0, G_SPEAR = 1, G_BOW = 2, G_PIKE = 3, G_JAV = 4, G_SLING = 5, G_XBOW = 6, G_BANNER = 7, G_NONE = 8;
const GROUP = [G_ONE, G_SPEAR, G_BOW, G_ONE, G_ONE, G_PIKE, G_JAV, G_SLING, G_XBOW, G_ONE, G_BANNER, G_NONE];
export const ONE_HANDED = w => GROUP[w] === G_ONE;

export const ATTACK_EVT = 0.47, SHOOT_EVT = 0.78, THROW_EVT = 0.52, SLING_EVT = 0.78, WORK_EVT = 0.5;
export function evtTime(act) {
  switch (act) {
    case ACT_ATTACK: return ATTACK_EVT;
    case ACT_SHOOT: return SHOOT_EVT;
    case ACT_THROW: return THROW_EVT;
    case ACT_SLING: return SLING_EVT;
    case ACT_WORK: return WORK_EVT;
    default: return 2;
  }
}

// full gait cycle length (two steps) as a function of speed; the sim advances
// phase by speed/stride so that planted feet never slide.
export function strideLen(sp) {
  return 0.9 + Math.min(sp, 7.5) * 0.45;
}

export class AnimState {
  constructor() {
    this.phase = rand();
    this.speed = 0; this.vx = 0; this.vz = 0; // local velocity (x=right, z=fwd)
    this.run = 0; this.combat = 0; this.raise = 0; this.brace = 0;
    this.action = ACT_NONE; this.actionT = 0; this.actionDur = 1; this.actionKind = 0; this.actionEvt = false;
    this.flinch = 0; this.lean = 0; this.aimPitch = 0.5; this.aimYaw = 0;
    this.carry = 0; this.push = 0; this.climb = 0; this.climbPh = 0; this.swim = 0; this.point = 0;
    this.hideW = false; this.loaded = true;
    this.scale = randRange(0.93, 1.07);
    this.armAmp = randRange(0.8, 1.2);
    this.idleT = rand() * 10;
  }
  start(action, dur, kind = 0) {
    this.action = action; this.actionT = 0; this.actionDur = dur; this.actionKind = kind; this.actionEvt = false;
  }
  // advance animation clocks; returns true on the frame the action's "event"
  // (blade impact / release / hammer blow) happens
  tick(dt) {
    this.phase += (dt * this.speed) / strideLen(this.speed);
    if (this.phase > 1) this.phase -= Math.floor(this.phase);
    this.flinch = Math.max(0, this.flinch - dt * 2.2);
    this.idleT += dt;
    let evt = false;
    if (this.action !== ACT_NONE) {
      this.actionT += dt / this.actionDur;
      if (!this.actionEvt && this.actionT >= evtTime(this.action)) { this.actionEvt = true; evt = true; }
      if (this.actionT >= 1) { this.action = ACT_NONE; this.actionT = 0; }
    }
    return evt;
  }
}

// weapon not in hand (javelin just thrown, tools stowed while carrying...)
export function weaponHidden(st, weapon) {
  if (st.hideW) return true;
  if (weapon === W_JAV && st.action === ACT_THROW && st.actionT > 0.52 && st.actionT < 0.92) return true;
  return false;
}

// ---- scratch ----
const L = new Float32Array(NJ * 3);
const rh = [0, 0, 0], wd = [0, 0, 0], lh = [0, 0, 0], sn = [0, 0, 0], bu = [0, 0, 0], aim = [0, 0, 1];
const tA = [0, 0, 0];

function setL(i, x, y, z) { L[i * 3] = x; L[i * 3 + 1] = y; L[i * 3 + 2] = z; }
function rel(o, i, x, y, z) { o[0] = L[i * 3] + x; o[1] = L[i * 3 + 1] + y; o[2] = L[i * 3 + 2] + z; }
function mixTo(o, x, y, z, t) { o[0] += (x - o[0]) * t; o[1] += (y - o[1]) * t; o[2] += (z - o[2]) * t; }
function mixRel(o, i, x, y, z, t) { mixTo(o, L[i * 3] + x, L[i * 3 + 1] + y, L[i * 3 + 2] + z, t); }
function norm(o) { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; }

function footTarget(p, duty, A, lift, mdx, mdz, sideX, extraZ, idx) {
  let off, y = 0;
  if (p < duty) {
    off = A * (1 - 2 * (p / duty));
  } else {
    const t = (p - duty) / (1 - duty);
    off = -A + 2 * A * (t * t * (3 - 2 * t));
    y = lift * Math.sin(Math.PI * t);
  }
  setL(idx, sideX + mdx * off, 0.07 + y, mdz * off + extraZ);
}

// Compute a pose into `out` (world space) given basis B:
// origin (ox,oy,oz) and axes r (right), u (up), f (forward).
export function poseHuman(out, st, weapon, shield, seat, B) {
  const grp = GROUP[weapon];
  const s = st.scale;
  const run = st.run, cb = st.combat, fl = st.flinch;
  const ph = st.phase;
  const climb = st.climb, swim = st.swim, carry = st.carry, push = st.push;
  const sp = seat === SEAT_GROUND ? st.speed * (1 - climb) : 0;
  const move = smoothstep(0.05, 0.8, sp);
  let mdx = 0, mdz = 1;
  if (sp > 0.02) { mdx = st.vx / st.speed; mdz = st.vz / st.speed; }
  const duty = lerp(0.6, 0.36, run);
  const A = duty * strideLen(sp) * 0.5 * move;
  const lift = lerp(0.1, 0.3, run) * move;
  const c1 = Math.cos(TAU * ph);
  const breathe = Math.sin(st.idleT * 1.7) * 0.012 * (1 - move);

  // aim direction (local), used by all missile weapons
  {
    const p = st.aimPitch, y = st.aimYaw, cp = Math.cos(p);
    aim[0] = Math.sin(y) * cp; aim[1] = Math.sin(p); aim[2] = Math.cos(y) * cp;
  }

  // ---- action curves ----
  let aTw = 0, aLean = 0, aw = 0, as = 0, ar = 0, crouch = 0;
  const act = st.action, at = st.actionT;
  if (act === ACT_ATTACK) {
    aw = smoothstep(0, 0.38, at); as = smoothstep(0.38, 0.52, at); ar = smoothstep(0.6, 1, at);
    const k = 1 - ar;
    if (grp === G_SPEAR || grp === G_PIKE || grp === G_JAV) { aTw = (0.35 * aw - 0.5 * as) * k; aLean = 0.22 * as * k; }
    else { aTw = (0.55 * aw - 1.0 * as) * k; aLean = (0.08 * aw + 0.22 * as) * k; }
  }
  let draw = 0;
  if (act === ACT_SHOOT && grp === G_BOW) {
    draw = smoothstep(0, 0.22, at) * (1 - smoothstep(0.86, 1, at));
    aTw = (0.75 + st.aimYaw * 0.8) * draw;
  }
  if (act === ACT_SHOOT && grp === G_XBOW) aTw = st.aimYaw * 0.7 * smoothstep(0, 0.3, at);
  if (act === ACT_THROW) {
    const w = smoothstep(0, 0.45, at), r = smoothstep(0.45, 0.6, at), b = smoothstep(0.7, 1, at);
    aTw = (0.6 * w - 1.1 * r) * (1 - b) + st.aimYaw * 0.6; aLean = 0.2 * r * (1 - b);
  }
  if (act === ACT_SLING) aTw = st.aimYaw * 0.6 + 0.25 * Math.sin(at * TAU * 4) * (1 - smoothstep(0.7, 0.8, at));
  if (act === ACT_RELOAD) { crouch = 0.12; aLean = 0.35; }
  let work = 0, hw = 0;
  if (act === ACT_WORK) {
    work = 1;
    hw = at < 0.4 ? smoothstep(0, 0.4, at) : 1 - smoothstep(0.4, 0.5, at);
    crouch = 0.28; aLean = 0.5;
  }

  // ---- pelvis & legs ----
  let px = 0, py = 0, pz = 0;
  const hipYaw = -0.15 * c1 * move;
  if (seat !== SEAT_RIDE) {
    const bob = Math.cos(2 * TAU * (ph - duty * 0.5)) * (0.02 * (1 - run) - 0.045 * run) * move;
    py = 0.93 * s - 0.06 * run * move - 0.09 * cb - 0.07 * fl - crouch + bob + breathe * 0.5;
    px = 0.02 * Math.sin(TAU * ph) * move * (1 - run);
    pz = -0.08 * fl + 0.06 * run * move - 0.1 * crouch;
  }
  setL(J.PELVIS, px, py, pz);
  const hc = Math.cos(hipYaw), hs = Math.sin(hipYaw);
  const hw2 = 0.1 * s;
  setL(J.RHIP, px + hc * hw2, py - 0.05, pz - hs * hw2);
  setL(J.LHIP, px - hc * hw2, py - 0.05, pz + hs * hw2);

  const thigh = 0.44 * s, shin = 0.43 * s;
  if (seat === SEAT_RIDE) {
    setL(J.RFOOT, 0.27 * s, -0.6 * s, 0.1);
    setL(J.LFOOT, -0.27 * s, -0.6 * s, 0.1);
    ik2(L, J.RKNEE * 3, J.RFOOT * 3, L[36], L[37], L[38], L[42], L[43], L[44], thigh, shin, 0.6, 0, 1);
    ik2(L, J.LKNEE * 3, J.LFOOT * 3, L[27], L[28], L[29], L[33], L[34], L[35], thigh, shin, -0.6, 0, 1);
  } else {
    const stanceW = 0.11 * s + 0.07 * cb + 0.05 * work;
    footTarget(ph % 1, duty, A, lift, mdx, mdz, stanceW, -0.17 * cb - 0.05 * draw + 0.25 * work, J.RFOOT);
    footTarget((ph + 0.5) % 1, duty, A, lift, mdx, mdz, -stanceW, 0.2 * cb + 0.12 * draw - 0.2 * work, J.LFOOT);
    if (climb > 0) {
      // rungs: feet alternate stepping up in front of the body
      const cp = st.climbPh;
      mixTo(tA, 0, 0, 0, 0);
      const ry = 0.07 + 0.38 * Math.max(0, Math.sin(cp)), ly = 0.07 + 0.38 * Math.max(0, Math.sin(cp + Math.PI));
      L[42] += (0.12 - L[42]) * climb; L[43] += (ry - L[43]) * climb; L[44] += (0.22 - L[44]) * climb;
      L[33] += (-0.12 - L[33]) * climb; L[34] += (ly - L[34]) * climb; L[35] += (0.22 - L[35]) * climb;
    }
    const kx = 0.12;
    ik2(L, J.RKNEE * 3, J.RFOOT * 3, L[36], L[37], L[38], L[42], L[43], L[44], thigh, shin, kx, 0, 1);
    ik2(L, J.LKNEE * 3, J.LFOOT * 3, L[27], L[28], L[29], L[33], L[34], L[35], thigh, shin, -kx, 0, 1);
  }

  // ---- torso ----
  let lean = 0.3 * run * move + 0.12 * cb + st.lean - 0.45 * fl + aLean + 0.4 * push + 0.12 * climb - 0.1 * carry;
  if (seat === SEAT_RIDE) lean += 0.08 + 0.15 * run;
  const cdy = Math.cos(lean), cdz = Math.sin(lean);
  const tl = 0.5 * s;
  const nx = px, ny = py + cdy * tl + breathe, nz = pz + cdz * tl;
  setL(J.NECK, nx, ny, nz);
  const tw = -hipYaw * 0.8 + aTw;
  const sc = Math.cos(tw), ss = Math.sin(tw), sw = 0.18 * s;
  const scx = nx, scy = ny - cdy * 0.06 * s, scz = nz - cdz * 0.06 * s;
  setL(J.RSHO, scx + sc * sw, scy, scz - ss * sw);
  setL(J.LSHO, scx - sc * sw, scy, scz + ss * sw);
  {
    let hx = ss * 0.3, hy = 1, hz = lean * 0.35 + 0.05 - 0.45 * fl - 0.3 * work + 0.2 * carry;
    const hl = Math.hypot(hx, hy, hz);
    const hL = 0.27 * s / hl;
    setL(J.HEAD, nx + hx * hL, ny + hy * hL, nz + hz * hL);
  }

  // ---- arms ----
  const armR = -0.32 * c1 * move * st.armAmp, armL = -armR;
  let hasShield = shield !== SH_NONE;
  rel(rh, J.RSHO, 0.05, -0.47 + 0.2 * run, armR + 0.1 * run);
  rel(lh, J.LSHO, -0.05, -0.47 + 0.2 * run, armL + 0.1 * run);
  wd[0] = 0; wd[1] = 1; wd[2] = 0.3;
  sn[0] = -0.35; sn[1] = 0; sn[2] = 1;
  bu[0] = 0; bu[1] = 1; bu[2] = 0;
  let twoHand = 0; // left hand follows the weapon shaft
  let shaftK = 0.5;

  if (grp === G_ONE) {
    rel(rh, J.RSHO, 0.07, -0.4 + 0.13 * run, 0.08 + armR * 0.9);
    wd[0] = 0.05; wd[1] = 1; wd[2] = 0.25 + 0.6 * run;
    if (weapon === W_HAMMER) { wd[1] = -0.3; wd[2] = 0.6; }
    mixRel(rh, J.RSHO, 0.08, -0.17, 0.3, cb);
    mixTo(wd, 0.15, 0.6, 0.8, cb);
    const rz = Math.max(st.raise, st.point);
    if (rz > 0) {
      const wave = Math.sin(st.idleT * 9) * 0.06 * st.raise;
      if (st.point > st.raise) { mixRel(rh, J.RSHO, 0.0, 0.3, 0.48, rz); mixTo(wd, 0, 0.35, 1, rz); }
      else { mixRel(rh, J.RSHO, 0.03, 0.5 + wave, 0.12, rz); mixTo(wd, 0, 1, 0.3, rz); }
    }
    if (act === ACT_ATTACK) {
      const low = seat === SEAT_RIDE ? -0.35 : 0;
      if (st.actionKind === 0) {
        mixRel(rh, J.RSHO, 0.12, 0.33, -0.12, aw); mixTo(wd, 0.35, 0.55, -0.75, aw);
        mixRel(rh, J.RSHO, -0.3 + (low ? 0.4 : 0), -0.45 + low, 0.45, as); mixTo(wd, -0.4, -0.35 + low, 0.85, as);
      } else {
        mixRel(rh, J.RSHO, 0.28, 0.02, -0.08, aw); mixTo(wd, 0.9, 0.2, -0.3, aw);
        mixRel(rh, J.RSHO, -0.35, -0.15 + low, 0.45, as); mixTo(wd, -0.7, 0.05 + low, 0.7, as);
      }
      mixRel(rh, J.RSHO, 0.08, -0.17, 0.3, ar); mixTo(wd, 0.15, 0.6, 0.8, ar);
    }
    if (work) {
      // hammering stakes / planks in front of the feet
      rel(rh, J.RSHO, 0.02, -0.25 + 0.5 * hw, 0.35 + 0.1 * (1 - hw));
      wd[0] = 0; wd[1] = -0.4 + 1.2 * hw; wd[2] = 0.8 - 0.9 * hw;
      rel(lh, J.LSHO, 0.12, -0.6, 0.45);
    }
  } else if (grp === G_SPEAR || grp === G_JAV) {
    const lower = grp === G_SPEAR ? smoothstep(0.25, 0.7, run) : 0;
    rel(rh, J.RSHO, 0.08, -0.4, 0.1 + armR * 0.5);
    wd[0] = 0; wd[1] = 1; wd[2] = 0.08;
    mixRel(rh, J.RSHO, 0.05, -0.2, 0.22, lower); mixTo(wd, 0, 0.03, 1, lower);
    mixRel(rh, J.RSHO, 0.03, 0.12, 0.02, cb); mixTo(wd, -0.03, -0.14, 1, cb);
    if (st.brace > 0) { mixRel(rh, J.RSHO, 0.06, -0.3, 0.12, st.brace); mixTo(wd, 0, 0.3, 1, st.brace); }
    if (seat === SEAT_RIDE) { mixRel(rh, J.RSHO, 0.05, -0.2, 0.05, run); mixTo(wd, 0.02, -0.02, 1, run); }
    if (st.raise > 0) { mixRel(rh, J.RSHO, 0.05, 0.45, 0.05, st.raise); mixTo(wd, 0, 1, 0.15, st.raise); }
    if (act === ACT_ATTACK) {
      const low = seat === SEAT_RIDE ? -0.3 : 0;
      mixRel(rh, J.RSHO, 0.06, 0.16 + low * 0.3, -0.32, aw); mixTo(wd, -0.02, -0.12 + low, 1, aw);
      mixRel(rh, J.RSHO, -0.03, 0.06 + low, 0.62, as); mixTo(wd, -0.05, -0.18 + low, 1, as);
      mixRel(rh, J.RSHO, 0.03, 0.12, 0.02, ar);
    }
    if (act === ACT_THROW) {
      const w = smoothstep(0, 0.45, at), r = smoothstep(0.45, 0.6, at), b = smoothstep(0.7, 1, at);
      mixRel(rh, J.RSHO, 0.1, 0.24, -0.4, w * (1 - b)); mixTo(wd, aim[0], aim[1] + 0.3, aim[2], w * (1 - b));
      mixRel(rh, J.RSHO, -0.06, 0.1 + aim[1] * 0.3, 0.55, r * (1 - b));
      mixRel(lh, J.LSHO, aim[0] * 0.5, 0.05 + aim[1] * 0.4, 0.45, w * (1 - r * 0.7) * (1 - b));
      hasShield = hasShield && w < 0.3;
    }
  } else if (grp === G_PIKE) {
    // two-handed pike: upright on the march, levelled in combat
    const level = Math.max(cb, smoothstep(0.25, 0.7, run), st.brace);
    rel(rh, J.RSHO, 0.08, -0.36, 0.1 + armR * 0.3);
    wd[0] = 0; wd[1] = 1; wd[2] = 0.05;
    mixRel(rh, J.RSHO, 0.06, -0.2, -0.02, level); mixTo(wd, 0, 0.07 + 0.2 * st.brace, 1, level);
    if (st.raise > 0 && level < 0.5) mixTo(wd, 0, 1, 0.3, st.raise);
    if (act === ACT_ATTACK) {
      mixRel(rh, J.RSHO, 0.06, -0.18, -0.3, aw);
      mixRel(rh, J.RSHO, 0.04, -0.14, 0.35, as);
      mixRel(rh, J.RSHO, 0.06, -0.2, -0.02, ar);
    }
    twoHand = 1; shaftK = level > 0.5 ? 0.62 : 0.4;
    hasShield = false;
  } else if (grp === G_BOW) {
    rel(lh, J.LSHO, -0.04, -0.47 + 0.15 * run, 0.06 + armL * 0.9);
    bu[0] = 0; bu[1] = 1; bu[2] = 0.35;
    if (st.raise > 0) mixRel(lh, J.LSHO, -0.02, 0.45, 0.1, st.raise);
    if (act === ACT_SHOOT) {
      mixRel(lh, J.LSHO, aim[0] * 0.62 + 0.08, aim[1] * 0.62, aim[2] * 0.62, draw);
      mixTo(bu, 0.15, Math.cos(st.aimPitch), -Math.sin(st.aimPitch), draw);
      const nock = smoothstep(0.05, 0.25, at), pull = smoothstep(0.3, 0.6, at), rel2 = smoothstep(0.78, 0.84, at);
      tA[0] = lh[0] - aim[0] * 0.05; tA[1] = lh[1] - aim[1] * 0.05; tA[2] = lh[2] - aim[2] * 0.05;
      mixTo(rh, tA[0], tA[1], tA[2], nock);
      mixTo(rh, nx + 0.06 - aim[0] * 0.1, ny + 0.06 + aim[1] * 0.05, nz + 0.1 - aim[2] * 0.05, pull);
      mixTo(rh, nx + 0.2 - aim[0] * 0.3, ny + 0.02, nz - 0.12, rel2);
    }
    if (act === ACT_ATTACK) {
      mixRel(rh, J.RSHO, 0.1, 0.1, -0.2, aw);
      mixRel(rh, J.RSHO, -0.08, -0.05, 0.55, as);
      mixRel(rh, J.RSHO, 0.05, -0.45, 0.05, ar);
    }
    hasShield = false;
  } else if (grp === G_SLING) {
    rel(rh, J.RSHO, 0.06, -0.45, 0.05 + armR * 0.8);
    if (act === ACT_SLING) {
      const whirl = smoothstep(0, 0.12, at) * (1 - smoothstep(0.75, 0.8, at));
      const fling = smoothstep(0.76, 0.84, at) * (1 - smoothstep(0.9, 1, at));
      mixRel(rh, J.RSHO, 0.02 + Math.cos(at * TAU * 5) * 0.06, 0.45, 0.05 + Math.sin(at * TAU * 5) * 0.06, whirl);
      mixRel(rh, J.RSHO, -0.05 + aim[0] * 0.2, 0.15 + aim[1] * 0.3, 0.55, fling);
      mixRel(lh, J.LSHO, aim[0] * 0.5, aim[1] * 0.5 + 0.05, aim[2] * 0.5, whirl);
    }
    if (act === ACT_ATTACK) {
      mixRel(rh, J.RSHO, 0.1, 0.1, -0.2, aw);
      mixRel(rh, J.RSHO, -0.08, -0.05, 0.55, as);
      mixRel(rh, J.RSHO, 0.05, -0.45, 0.05, ar);
    }
  } else if (grp === G_XBOW) {
    rel(rh, J.RSHO, 0.05, -0.33, 0.2);
    wd[0] = 0; wd[1] = 0.25; wd[2] = 1;
    if (act === ACT_SHOOT) {
      const w = smoothstep(0, 0.3, at) * (1 - smoothstep(0.88, 1, at));
      mixRel(rh, J.RSHO, -0.1, -0.03, 0.12, w); mixTo(wd, aim[0], aim[1], aim[2], w);
    }
    if (act === ACT_RELOAD) {
      const pullk = 0.5 - 0.5 * Math.cos(at * TAU * 2);
      rel(rh, J.RSHO, 0.0, -0.55 + 0.25 * pullk, 0.35);
      wd[0] = 0; wd[1] = -0.85; wd[2] = 0.55;
    }
    twoHand = 1; shaftK = 0.45;
    hasShield = false;
  } else if (grp === G_BANNER) {
    rel(rh, J.RSHO, 0.08, -0.12, 0.18);
    wd[0] = 0.03 + Math.sin(st.idleT * 1.1) * 0.03; wd[1] = 1; wd[2] = 0.1 + 0.4 * run * move + st.raise * 0.2;
    twoHand = -1; shaftK = 0.35; // left hand lower on the pole
    hasShield = false;
  }

  if (hasShield) {
    const small = shield === SH_SMALL;
    rel(lh, J.LSHO, -0.03, -0.33 + 0.1 * run, 0.24 + armL * 0.3);
    mixRel(lh, J.LSHO, 0.1, -0.22, 0.38, cb);
    mixTo(sn, -0.1, 0.05, 1, cb);
    if (act === ACT_BLOCK) {
      const b = Math.sin(Math.PI * Math.min(1, at * 1.3));
      mixRel(lh, J.LSHO, 0.14, 0.02, 0.42, b); mixTo(sn, 0.05, 0.25, 1, b);
    }
    if (st.brace > 0) { mixRel(lh, J.LSHO, 0.12, -0.15, 0.4, st.brace); mixTo(sn, 0, 0.1, 1, st.brace); }
    if (act === ACT_ATTACK && grp === G_ONE) mixRel(lh, J.LSHO, -0.12, -0.3, 0.25, as * (1 - ar));
    if (small && act === ACT_NONE && cb < 0.5) mixTo(sn, -1, 0, 0.3, 0.5 * (1 - cb));
  }
  if (twoHand) {
    norm(wd);
    const k = twoHand > 0 ? shaftK : -shaftK;
    lh[0] = rh[0] + wd[0] * k; lh[1] = rh[1] + wd[1] * k; lh[2] = rh[2] + wd[2] * k;
  }

  // ---- whole-body overrides ----
  if (carry > 0) {
    mixRel(rh, J.RSHO, -0.03, 0.02, 0.05, carry);
    mixRel(lh, J.LSHO, 0.03, 0.02, 0.05, carry);
  }
  if (push > 0) {
    mixRel(rh, J.RSHO, -0.07, -0.1, 0.48, push);
    mixRel(lh, J.LSHO, 0.07, -0.1, 0.48, push);
  }
  if (climb > 0) {
    const cp = st.climbPh;
    mixRel(rh, J.RSHO, 0.02, 0.28 + 0.22 * Math.sin(cp + Math.PI), 0.28, climb);
    mixRel(lh, J.LSHO, -0.02, 0.28 + 0.22 * Math.sin(cp), 0.28, climb);
  }
  if (swim > 0) {
    const t = st.idleT * 5;
    mixRel(rh, J.RSHO, 0.25, 0.15 + 0.2 * Math.sin(t), 0.25, swim);
    mixRel(lh, J.LSHO, -0.25, 0.15 + 0.2 * Math.cos(t), 0.25, swim);
  }
  if (fl > 0) {
    rh[1] += 0.12 * fl; rh[2] -= 0.15 * fl; rh[0] += 0.1 * fl;
    lh[1] += 0.12 * fl; lh[2] -= 0.1 * fl; lh[0] -= 0.1 * fl;
  }

  const ua = 0.29 * s, fa = 0.28 * s;
  ik2(L, J.RELB * 3, J.RHAND * 3, L[18], L[19], L[20], rh[0], rh[1], rh[2], ua, fa, 0.5, -0.6, -0.5);
  ik2(L, J.LELB * 3, J.LHAND * 3, L[9], L[10], L[11], lh[0], lh[1], lh[2], ua, fa, -0.5, -0.6, -0.5);

  // ---- weapon / shield joints ----
  const hr = J.RHAND * 3, hl = J.LHAND * 3;
  if (grp === G_BOW) {
    norm(bu);
    setL(J.WBASE, L[hl] - bu[0] * 0.66, L[hl + 1] - bu[1] * 0.66, L[hl + 2] - bu[2] * 0.66);
    setL(J.WTIP, L[hl] + bu[0] * 0.66, L[hl + 1] + bu[1] * 0.66, L[hl + 2] + bu[2] * 0.66);
  } else if (grp === G_SLING) {
    let px2 = 0, py2 = -0.55, pz2 = 0.05;
    if (act === ACT_SLING) {
      const whirl = smoothstep(0, 0.12, at) * (1 - smoothstep(0.75, 0.8, at));
      const a = at * TAU * 5;
      px2 += (Math.cos(a) * 0.62 - px2) * whirl; py2 += (0.1 - py2) * whirl; pz2 += (Math.sin(a) * 0.62 - pz2) * whirl;
      if (at > 0.76) { px2 = aim[0] * 0.6; py2 = aim[1] * 0.6 - 0.1; pz2 = aim[2] * 0.6; }
    }
    setL(J.WBASE, L[hr], L[hr + 1], L[hr + 2]);
    setL(J.WTIP, L[hr] + px2, L[hr + 1] + py2, L[hr + 2] + pz2);
  } else {
    norm(wd);
    let back = 0.12, fwd = 0.82;
    switch (weapon) {
      case W_SPEAR: back = 0.9; fwd = 1.85; break;
      case W_PIKE: back = 1.3; fwd = 3.9; break;
      case W_JAV: back = 0.7; fwd = 1.15; break;
      case W_AXE: back = 0.1; fwd = 0.7; break;
      case W_MACE: back = 0.1; fwd = 0.65; break;
      case W_HAMMER: back = 0.08; fwd = 0.55; break;
      case W_XBOW: back = 0.2; fwd = 0.7; break;
      case W_BANNER: back = 1.0; fwd = 2.5; break;
    }
    setL(J.WBASE, L[hr] - wd[0] * back, L[hr + 1] - wd[1] * back, L[hr + 2] - wd[2] * back);
    setL(J.WTIP, L[hr] + wd[0] * fwd, L[hr + 1] + wd[1] * fwd, L[hr + 2] + wd[2] * fwd);
  }
  norm(sn);
  setL(J.SHN, L[hl] + sn[0] * 0.12, L[hl + 1] + sn[1] * 0.12, L[hl + 2] + sn[2] * 0.12);

  // ---- to world ----
  const { ox, oy, oz, rx, ry, rz, ux, uy, uz, fx, fy, fz } = B;
  for (let i = 0; i < NJ * 3; i += 3) {
    const x = L[i], y = L[i + 1], z = L[i + 2];
    out[i] = ox + rx * x + ux * y + fx * z;
    out[i + 1] = oy + ry * x + uy * y + fy * z;
    out[i + 2] = oz + rz * x + uz * y + fz * z;
  }
}

// Cheap far-LOD pose: no IK, just swinging limbs (used beyond ~170 m).
export function poseHumanFar(out, st, weapon, B) {
  const s = st.scale, sp = st.speed, move = Math.min(1, sp);
  const sw = Math.sin(TAU * st.phase) * 0.35 * move;
  const py = 0.93 * s, lean = 0.25 * st.run * move + 0.1 * st.combat;
  const set = (i, x, y, z) => { L[i * 3] = x; L[i * 3 + 1] = y; L[i * 3 + 2] = z; };
  set(J.PELVIS, 0, py, 0);
  set(J.NECK, 0, py + 0.5 * s, lean * 0.5);
  set(J.HEAD, 0, py + 0.77 * s, lean * 0.55);
  set(J.LSHO, -0.18 * s, py + 0.44 * s, lean * 0.45); set(J.RSHO, 0.18 * s, py + 0.44 * s, lean * 0.45);
  set(J.LHAND, -0.22 * s, py - 0.05, sw * 0.8 + 0.1); set(J.RHAND, 0.22 * s, py - 0.05, -sw * 0.8 + 0.1 + st.combat * 0.3);
  set(J.LELB, -0.21 * s, py + 0.2, sw * 0.3); set(J.RELB, 0.21 * s, py + 0.2, -sw * 0.3);
  set(J.LHIP, -0.1 * s, py - 0.05, 0); set(J.RHIP, 0.1 * s, py - 0.05, 0);
  set(J.LFOOT, -0.12 * s, 0.07, -sw); set(J.RFOOT, 0.12 * s, 0.07, sw);
  set(J.LKNEE, -0.11 * s, 0.5 * s, -sw * 0.5 + 0.04); set(J.RKNEE, 0.11 * s, 0.5 * s, sw * 0.5 + 0.04);
  const up = weapon === W_PIKE || weapon === W_SPEAR || weapon === W_BANNER;
  const lev = st.combat > 0.5 || st.run > 0.5;
  const hx = L[24], hy = L[25], hz = L[26];
  const len = weapon === W_PIKE ? 4.5 : weapon === W_SPEAR ? 2.6 : weapon === W_BANNER ? 3.4 : 0.8;
  const dy = up && !lev ? 1 : 0.2, dz = up && !lev ? 0.1 : 1;
  set(J.WBASE, hx, hy - dy * len * 0.3, hz - dz * len * 0.3);
  set(J.WTIP, hx, hy + dy * len * 0.7, hz + dz * len * 0.7);
  set(J.SHN, L[15], L[16], L[17] + 0.12);
  const { ox, oy, oz, rx, ry, rz, ux, uy, uz, fx, fy, fz } = B;
  for (let i = 0; i < NJ * 3; i += 3) {
    const x = L[i], y = L[i + 1], z = L[i + 2];
    out[i] = ox + rx * x + ux * y + fx * z;
    out[i + 1] = oy + ry * x + uy * y + fy * z;
    out[i + 2] = oz + rz * x + uz * y + fz * z;
  }
}

export function makeBasis() {
  return { ox: 0, oy: 0, oz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
}
export function setBasisYaw(B, x, y, z, heading) {
  const s = Math.sin(heading), c = Math.cos(heading);
  B.ox = x; B.oy = y; B.oz = z;
  B.fx = s; B.fy = 0; B.fz = c;
  B.rx = -c; B.ry = 0; B.rz = s;
  B.ux = 0; B.uy = 1; B.uz = 0;
  return B;
}
export function offsetBasis(dst, B, x, y, z) {
  dst.ox = B.ox + B.rx * x + B.ux * y + B.fx * z;
  dst.oy = B.oy + B.ry * x + B.uy * y + B.fy * z;
  dst.oz = B.oz + B.rz * x + B.uz * y + B.fz * z;
  dst.rx = B.rx; dst.ry = B.ry; dst.rz = B.rz;
  dst.ux = B.ux; dst.uy = B.uy; dst.uz = B.uz;
  dst.fx = B.fx; dst.fy = B.fy; dst.fz = B.fz;
  return dst;
}
export { clamp };
