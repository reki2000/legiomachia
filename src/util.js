// Small math helpers shared by simulation, animation and rendering.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function approach(v, target, rate) {
  return v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);
}
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Deterministic PRNG (mulberry32) so a battle can be replayed from a seed.
let seed = 1234567;
export function setSeed(s) { seed = s >>> 0; }
export function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (a, b) => a + (b - a) * rand();
export const randSign = () => (rand() < 0.5 ? -1 : 1);
export function randNormal() {
  return (rand() + rand() + rand() - 1.5) * 1.1547;
}

// Two-bone IK. Root a, target t, bone lengths l1/l2, bend hint h.
// Writes mid joint to out[mi..] and (reach-clamped) end to out[ei..].
export function ik2(out, mi, ei, ax, ay, az, tx, ty, tz, l1, l2, hx, hy, hz) {
  let dx = tx - ax, dy = ty - ay, dz = tz - az;
  let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 1e-5) { dx = 0; dy = -1; dz = 0; dist = 1e-5; }
  dx /= dist; dy /= dist; dz /= dist;
  const maxR = l1 + l2 - 1e-3, minR = Math.abs(l1 - l2) + 1e-3;
  if (dist > maxR) dist = maxR;
  if (dist < minR) dist = minR;
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const along = l1 * cosA;
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  // bend direction: hint projected perpendicular to the limb axis
  const hd = hx * dx + hy * dy + hz * dz;
  let bx = hx - dx * hd, by = hy - dy * hd, bz = hz - dz * hd;
  let bl = Math.sqrt(bx * bx + by * by + bz * bz);
  if (bl < 1e-5) {
    bx = -dz; by = 0; bz = dx; bl = Math.sqrt(bx * bx + bz * bz) || 1;
  }
  bx /= bl; by /= bl; bz /= bl;
  out[mi] = ax + dx * along + bx * h;
  out[mi + 1] = ay + dy * along + by * h;
  out[mi + 2] = az + dz * along + bz * h;
  out[ei] = ax + dx * dist;
  out[ei + 1] = ay + dy * dist;
  out[ei + 2] = az + dz * dist;
}
