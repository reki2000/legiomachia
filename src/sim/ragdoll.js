// Position-based-dynamics ragdoll over the same 18 joints used by the animator.
import { J, NJ } from '../anim/human.js';
import { floorBelow, waterLevel } from '../terrain.js';

// [a, b, minFactor, maxFactor] relative to rest length taken from the initial pose
const RIGID = 1;
const MAX_UP = 6, MAX_H = 14; // m/s caps on the velocity a body may pick up from constraint corrections
function buildConstraints(weaponHand) {
  const c = [];
  const add = (a, b, mn = RIGID, mx = RIGID) => c.push(a, b, mn, mx);
  // bones
  add(J.PELVIS, J.NECK); add(J.NECK, J.HEAD, 0.95, 1);
  add(J.NECK, J.LSHO); add(J.NECK, J.RSHO); add(J.LSHO, J.RSHO);
  add(J.LSHO, J.LELB); add(J.LELB, J.LHAND); add(J.RSHO, J.RELB); add(J.RELB, J.RHAND);
  add(J.PELVIS, J.LHIP); add(J.PELVIS, J.RHIP); add(J.LHIP, J.RHIP);
  add(J.LHIP, J.LKNEE); add(J.LKNEE, J.LFOOT); add(J.RHIP, J.RKNEE); add(J.RKNEE, J.RFOOT);
  // torso braces keep the trunk a (slightly flexible) rigid block
  add(J.LSHO, J.PELVIS, 0.92, 1.05); add(J.RSHO, J.PELVIS, 0.92, 1.05);
  add(J.LHIP, J.NECK, 0.92, 1.05); add(J.RHIP, J.NECK, 0.92, 1.05);
  add(J.LHIP, J.RSHO, 0.9, 1.06); add(J.RHIP, J.LSHO, 0.9, 1.06);
  add(J.HEAD, J.LSHO, 0.8, 1.1); add(J.HEAD, J.RSHO, 0.8, 1.1); add(J.HEAD, J.PELVIS, 0.85, 1.02);
  // joint range limits (stop limbs folding through themselves)
  add(J.LHIP, J.LFOOT, 0.35, 1); add(J.RHIP, J.RFOOT, 0.35, 1);
  add(J.LSHO, J.LHAND, 0.3, 1); add(J.RSHO, J.RHAND, 0.3, 1);
  add(J.LKNEE, J.NECK, 0.5, 1.2); add(J.RKNEE, J.NECK, 0.5, 1.2);
  // hand-held weapon stays rigid with the forearm
  const hand = weaponHand === 'l' ? J.LHAND : J.RHAND, elb = weaponHand === 'l' ? J.LELB : J.RELB;
  add(J.WBASE, hand); add(J.WTIP, hand); add(J.WBASE, J.WTIP); add(J.WTIP, elb); add(J.WBASE, elb);
  add(J.SHN, J.LHAND); add(J.SHN, J.LELB);
  return c;
}
const CON_R = buildConstraints('r');
const CON_L = buildConstraints('l');

const RADIUS = new Float32Array(NJ).fill(0.05);
RADIUS[J.HEAD] = 0.11; RADIUS[J.PELVIS] = 0.1; RADIUS[J.NECK] = 0.09;
RADIUS[J.WTIP] = 0.02; RADIUS[J.WBASE] = 0.02; RADIUS[J.SHN] = 0.03;
// upper body joints get the "bias" share of an impulse (topples the body)
const UPPER = new Float32Array(NJ);
[J.NECK, J.HEAD, J.LSHO, J.RSHO, J.LELB, J.RELB, J.LHAND, J.RHAND, J.WBASE, J.WTIP, J.SHN].forEach(i => (UPPER[i] = 1));
[J.PELVIS].forEach(i => (UPPER[i] = 0.5));

export class Ragdoll {
  constructor(joints, weaponHand) {
    this.x = new Float32Array(joints);
    this.v = new Float32Array(NJ * 3);
    this.p = new Float32Array(NJ * 3);
    const con = weaponHand === 'l' ? CON_L : CON_R;
    this.con = con;
    const nc = con.length / 4;
    this.rest = new Float32Array(nc);
    for (let k = 0; k < nc; k++) {
      const a = con[k * 4] * 3, b = con[k * 4 + 1] * 3;
      this.rest[k] = Math.hypot(joints[a] - joints[b], joints[a + 1] - joints[b + 1], joints[a + 2] - joints[b + 2]);
    }
    this.sleeping = false;
    this.calm = 0;
    this.age = 0;
    this.gh = new Float32Array(NJ);
  }
  // base velocity + impulse, split between upper and lower body by `topple`
  // (topple>0 : upper body gets more => body rotates in impulse direction)
  kick(vx, vy, vz, ix, iy, iz, topple) {
    const v = this.v;
    for (let i = 0; i < NJ; i++) {
      const w = 1 + topple * (UPPER[i] * 2 - 1);
      const j = i * 3;
      v[j] = vx + ix * w + (Math.random() - 0.5) * 0.4;
      v[j + 1] = vy + iy * w + (Math.random() - 0.5) * 0.3;
      v[j + 2] = vz + iz * w + (Math.random() - 0.5) * 0.4;
    }
    this.sleeping = false; this.calm = 0;
  }
  step(dt) {
    if (this.sleeping) return;
    this.age += dt;
    const x = this.x, v = this.v, p = this.p;
    const n3 = NJ * 3;
    const damp = Math.pow(0.985, dt * 60);
    const WL = waterLevel();
    const wdamp = Math.pow(0.9, dt * 60);
    for (let i = 0; i < n3; i += 3) {
      v[i + 1] -= 9.8 * dt;
      if (x[i + 1] < WL) {
        // water: heavy drag, bodies sink slowly
        v[i] *= wdamp; v[i + 2] *= wdamp; v[i + 1] = Math.max(v[i + 1] * wdamp, -0.6);
      }
      p[i] = x[i] + v[i] * dt * damp;
      p[i + 1] = x[i + 1] + v[i + 1] * dt * damp;
      p[i + 2] = x[i + 2] + v[i + 2] * dt * damp;
    }
    const con = this.con, rest = this.rest, nc = rest.length;
    // ground height sampled once per step (particles move only cm per step)
    const gh = this.gh;
    for (let i = 0; i < NJ; i++) gh[i] = floorBelow(p[i * 3], p[i * 3 + 2], x[i * 3 + 1]) + RADIUS[i];
    for (let it = 0; it < 5; it++) {
      for (let k = 0; k < nc; k++) {
        const a = con[k * 4] * 3, b = con[k * 4 + 1] * 3;
        const r = rest[k], mn = r * con[k * 4 + 2], mx = r * con[k * 4 + 3];
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) continue;
        let tgt;
        if (d < mn) tgt = mn; else if (d > mx) tgt = mx; else continue;
        const f = ((d - tgt) / d) * 0.5;
        p[a] += dx * f; p[a + 1] += dy * f; p[a + 2] += dz * f;
        p[b] -= dx * f; p[b + 1] -= dy * f; p[b + 2] -= dz * f;
      }
      // ground
      for (let i = 0; i < NJ; i++) {
        const j = i * 3;
        const g = gh[i];
        if (p[j + 1] < g) {
          p[j + 1] = g;
          // friction: pull back towards previous horizontal position
          p[j] = x[j] + (p[j] - x[j]) * 0.75;
          p[j + 2] = x[j + 2] + (p[j + 2] - x[j + 2]) * 0.75;
        }
      }
    }
    let maxV2 = 0;
    const inv = 1 / dt;
    for (let i = 0; i < n3; i += 3) {
      let vx = (p[i] - x[i]) * inv, vy = (p[i + 1] - x[i + 1]) * inv, vz = (p[i + 2] - x[i + 2]) * inv;
      // position corrections (a limb dragged back over a wall edge, a foot pushed out of the
      // floor) turn into velocity here; without a cap they launch the body tens of metres
      if (vy > MAX_UP) vy = MAX_UP;
      const h2 = vx * vx + vz * vz;
      if (h2 > MAX_H * MAX_H) { const k = MAX_H / Math.sqrt(h2); vx *= k; vz *= k; }
      v[i] = vx; v[i + 1] = vy; v[i + 2] = vz;
      x[i] = p[i]; x[i + 1] = p[i + 1]; x[i + 2] = p[i + 2];
      const s2 = vx * vx + vy * vy + vz * vz;
      if (s2 > maxV2) maxV2 = s2;
    }
    if (maxV2 < 0.04 && this.age > 0.5) {
      this.calm += dt;
      if (this.calm > 0.6) this.sleeping = true;
    } else this.calm = 0;
  }
}
