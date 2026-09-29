// Frames for mounted units and engines, and the crews riding / working them.
import { poseQuad, poseElephant, NQ, NE, Q, E, ANIMALS } from '../anim/quadruped.js';
import { poseHuman, makeBasis, offsetBasis, NJ, SEAT_RIDE, SEAT_GROUND } from '../anim/human.js';
import { K_CAV, K_ELE, K_CHR, K_DOG, K_ENG } from './defs.js';

const tmpB = makeBasis();

// yaw basis at the unit position plus the death roll (falling onto its side)
export function unitBasis(a, B) {
  const s = Math.sin(a.heading), c = Math.cos(a.heading);
  B.ox = a.x; B.oy = a.y; B.oz = a.z;
  B.fx = s; B.fy = 0; B.fz = c; B.rx = -c; B.ry = 0; B.rz = s; B.ux = 0; B.uy = 1; B.uz = 0;
  if (a.roll !== 0) {
    const cr = Math.cos(a.roll), sr = Math.sin(a.roll) * a.rollSide;
    const rx = B.rx * cr - B.ux * sr, ry = B.ry * cr - B.uy * sr, rz = B.rz * cr - B.uz * sr;
    const ux = B.ux * cr + B.rx * sr, uy = B.uy * cr + B.ry * sr, uz = B.uz * cr + B.rz * sr;
    const pv = a.rollPivot * a.rollSide;
    B.ox += (B.rx - rx) * pv; B.oy += (B.ry - ry) * pv; B.oz += (B.rz - rz) * pv;
    B.rx = rx; B.ry = ry; B.rz = rz; B.ux = ux; B.uy = uy; B.uz = uz;
  }
  return B;
}

export const CHARIOT_CAR_Z = -1.15;
export const CHARIOT_HORSE_Z = 1.1;
export const CHARIOT_HORSE_X = 0.52;

export function allocMount(a) {
  if (a.kind === K_CAV || a.kind === K_DOG) a.mj = new Float32Array(NQ * 3);
  else if (a.kind === K_ELE) a.mj = new Float32Array(NE * 3);
  else if (a.kind === K_CHR) { a.mj = new Float32Array(NQ * 3); a.mj2 = new Float32Array(NQ * 3); }
}

export function computeMount(a) {
  const B = unitBasis(a, a.basis);
  const dead = a.state === 3;
  if (a.kind === K_CAV) poseQuad(a.mj, a.q, B, ANIMALS[a.T.animal], dead);
  else if (a.kind === K_DOG) poseQuad(a.mj, a.q, B, ANIMALS.dog, dead);
  else if (a.kind === K_ELE) poseElephant(a.mj, a.q, B, a.rage);
  else if (a.kind === K_CHR) {
    poseQuad(a.mj, a.q, offsetBasis(tmpB, B, -CHARIOT_HORSE_X, 0, CHARIOT_HORSE_Z), ANIMALS.horse, dead);
    const ph = a.q.phase;
    a.q.phase = (ph + 0.23) % 1;
    poseQuad(a.mj2, a.q, offsetBasis(tmpB, B, CHARIOT_HORSE_X, 0, CHARIOT_HORSE_Z), ANIMALS.horse, dead);
    a.q.phase = ph;
  }
}

export function crewBasis(a, ci, out) {
  const B = a.basis, c = a.crew[ci];
  if (a.kind === K_CAV) {
    const j = Q.SADDLE * 3;
    Object.assign(out, B);
    out.ox = a.mj[j]; out.oy = a.mj[j + 1]; out.oz = a.mj[j + 2];
  } else if (a.kind === K_ELE) {
    const base = c.seat === SEAT_RIDE ? E.MAHOUT : E.HOWDAH;
    const j = base * 3;
    Object.assign(out, B);
    out.ox = a.mj[j] + B.rx * c.ox + B.fx * c.oz;
    out.oy = a.mj[j + 1] + B.ry * c.ox + B.fy * c.oz;
    out.oz = a.mj[j + 2] + B.rz * c.ox + B.fz * c.oz;
  } else if (a.kind === K_ENG) {
    offsetBasis(out, B, c.ox, 0, c.oz);
    // crews working an engine face it
    if (c.face) {
      const s = Math.sin(c.face), co = Math.cos(c.face);
      const fx = B.fx * co + B.rx * s, fz = B.fz * co + B.rz * s;
      out.fx = fx; out.fz = fz; out.rx = -fz; out.rz = fx;
    }
  } else {
    const bounce = 0.03 * Math.sin(a.q.phase * Math.PI * 4) * Math.min(1, a.q.speed / 4);
    offsetBasis(out, B, c.ox, 0.78 + bounce, CHARIOT_CAR_Z + c.oz);
  }
  return out;
}

const cb = makeBasis();
export function computeCrew(a, ci) {
  const c = a.crew[ci];
  crewBasis(a, ci, cb);
  poseHuman(c.joints, c.st, c.weapon, c.shield, c.seat, cb);
  return c.joints;
}

export function newCrewJoints() { return new Float32Array(NJ * 3); }
export { SEAT_GROUND };
