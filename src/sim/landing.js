// Amphibious landing (harbour stage). The Legion starts aboard transports anchored offshore; the
// ships' boats ferry the men to the beaches a boatload at a time, and wide flat boats bring the
// horses over. Men step out into the shallows, wade ashore and fall in on their standard.
// A regiment is "aboard" while some of its men are still at sea: those men are kept off the field
// (not in world.agents) until their boat runs up on the beach.
import { K_CAV, K_DOG, K_ELE, K_CHR, K_ENG, humanLook } from './defs.js';
import { AnimState, makeBasis, NJ } from '../anim/human.js';
import { randRange } from '../util.js';

const ROW = 4.2;           // m/s under oars
const LOAD = 5, LOAD_HORSE = 7;
const STEP_OUT = 0.15, STEP_OUT_HORSE = 0.6; // seconds between men (horses) leaving a beached boat
const mounted = a => a.kind === K_CAV || a.kind === K_ELE || a.kind === K_CHR || a.kind === K_ENG;

export class Landing {
  constructor(world) {
    const w = this.w = world, st = this.st = world.stage;
    this.boats = [];
    this.queues = [[], []]; // regiments waiting to be carried, west and east
    // take the whole Legion off the field and put it aboard
    w.agents = w.agents.filter(a => a.team !== 0);
    w.agents.forEach((a, i) => { a.idx = i; });
    for (const r of w.regs) {
      if (r.team !== 0) continue;
      // front-line foot first, then the horse, the reserves and last of all the commanders
      const pri = (r.T.commander || r.type === 'guard' ? 3 : 0) + (r.wing && r.wing.role === 'reserve' ? 2 : 0) + (r.agents[0] && mounted(r.agents[0]) ? 1 : 0);
      r.aboard = r.agents.slice();
      r.agents = []; r.slotMap = []; r.alive = 0;
      r.landPri = pri - r.az * 0.001;
      this.queues[r.ax < 0 ? 0 : 1].push(r);
    }
    for (const q of this.queues) q.sort((a, b) => a.landPri - b.landPri);
    // boats: enough to have every man ashore in about two trips
    const ships = st.transports;
    for (let side = 0; side < 2; side++) {
      const mine = ships.filter(s => s.side === side);
      let foot = 0, horse = 0;
      for (const r of this.queues[side]) for (const a of r.aboard) if (mounted(a)) horse++; else foot++;
      const nFoot = Math.max(4, Math.ceil(foot / (24 * 2))), nHorse = Math.max(2, Math.ceil(horse / (5 * 2)));
      for (let i = 0; i < nFoot + nHorse; i++) {
        const horse = i >= nFoot;
        const ship = mine[i % mine.length];
        const j = Math.floor(i / mine.length);
        const b = {
          side, horse, ship, cap: horse ? 5 : 24, cargo: [], reg: null,
          len: horse ? 10.5 : 7, width: horse ? 3.8 : 3.0,
          // a berth alongside the ship, on the landward side
          bx: ship.x - 12 + (j % 6) * 4.8, bz: ship.z + (horse ? 11 : 9.5) + Math.floor(j / 6) * 11,
          x: 0, z: 0, heading: 0, state: 'load', t: randRange(0, 2), dx: 0, dz: 0, oar: randRange(0, 6),
        };
        b.x = b.bx; b.z = b.bz;
        // the crew: oarsmen on both sides, sitting facing the stern
        b.rowers = [];
        const ks = horse ? [-4, -1.4, 1.4, 4] : [-2.6, -0.9, 0.9, 2.6];
        for (const k of ks) for (const sd of [-1, 1]) {
          const st = new AnimState();
          b.rowers.push({ k, s: sd * (b.width / 2 - 0.4), st, joints: new Float32Array(NJ * 3), look: humanLook(0, 'engineer'), basis: makeBasis() });
        }
        this.fill(b);
        this.seat(b);
        this.boats.push(b);
      }
    }
  }
  pending(reg) { return reg.aboard ? reg.aboard.length : 0; }

  // take the next boatload off the ship
  fill(b) {
    const q = this.queues[b.side];
    b.cargo.length = 0; b.reg = null;
    for (const r of q) {
      const left = r.aboard.filter(a => !a.inBoat && mounted(a) === b.horse);
      if (!left.length) continue;
      b.reg = r;
      for (const a of left) { if (b.cargo.length >= b.cap) break; a.inBoat = true; b.cargo.push(a); }
      break;
    }
    if (!b.reg) return false;
    // the stretch of beach in front of the regiment's ground, a different spot each trip
    const r = b.reg, span = Math.max(8, Math.min(60, r.width || r.cols * r.spX));
    r.landK = (r.landK || 0) + 1;
    const x = r.ax + (((r.landK * 7) % 9) / 8 - 0.5) * span;
    b.dx = x; b.dz = this.st.shoreZ(x) - 1.5;
    return true;
  }

  // men stand in the boat in files, horses one behind the other, all facing the bow
  seat(b) {
    const WL = this.st.WL, fx = Math.sin(b.heading), fz = Math.cos(b.heading), rx = fz, rz = -fx;
    const n = b.cargo.length;
    const per = Math.max(1, Math.round((b.len - 1.2) / 0.72));
    for (let i = 0; i < n; i++) {
      const a = b.cargo[i];
      let k, s;
      if (b.horse) { k = (i - (n - 1) / 2) * 2.0; s = 0; }
      else { k = ((i % per) / Math.max(1, per - 1) - 0.5) * (b.len - 1.6); s = (Math.floor(i / per) % 3 - 1) * 0.55; }
      a.x = b.x + fx * k + rx * s; a.z = b.z + fz * k + rz * s; a.y = WL - 0.05;
      a.heading = b.heading; a.vx = a.vz = 0; a.yOff = 0;
    }
  }
  // every man and horse still in a boat (drawn like any other)
  passengers() {
    const out = [];
    for (const b of this.boats) for (const a of b.cargo) out.push(a);
    return out;
  }
  update(dt) {
    for (const b of this.boats) this.seat(b);
    if (this.w.phase !== 'battle') return;
    for (const b of this.boats) {
      b.t -= dt;
      if (b.state === 'load') {
        if (b.t > 0) continue;
        if (!b.cargo.length && !this.fill(b)) { b.state = 'idle'; continue; }
        b.state = 'out';
      } else if (b.state === 'out') {
        // row in until the bow grounds on the beach
        if (this.row(b, b.dx, b.dz, dt, true)) { b.state = 'unload'; b.t = 0.6; }
      } else if (b.state === 'unload') {
        if (b.t > 0) continue;
        b.t = b.horse ? STEP_OUT_HORSE : STEP_OUT;
        const a = b.cargo.shift();
        if (a) this.disembark(b, a);
        if (!b.cargo.length) { b.state = 'back'; b.t = 1.5; }
      } else if (b.state === 'back') {
        if (b.t > 0) continue;
        if (this.row(b, b.bx, b.bz, dt, false)) { b.state = 'load'; b.t = b.horse ? LOAD_HORSE : LOAD; this.fill(b); }
      }
      b.oar += dt * (b.state === 'out' || b.state === 'back' ? 3.2 : 0);
    }
  }
  // move the boat (bow first when landing); true once there
  row(b, tx, tz, dt, bow) {
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    const cx = bow ? tx - fx * b.len * 0.5 : tx, cz = bow ? tz - fz * b.len * 0.5 : tz;
    const dx = cx - b.x, dz = cz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.4) return true;
    // turn towards the goal, then pull
    const want = Math.atan2(dx, dz);
    let da = want - b.heading;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    b.heading += Math.max(-dt * 0.9, Math.min(dt * 0.9, da));
    const v = Math.min(d, ROW * dt * (0.35 + 0.65 * Math.max(0, Math.cos(da))));
    b.x += Math.sin(b.heading) * v; b.z += Math.cos(b.heading) * v;
    return false;
  }
  disembark(b, a) {
    const w = this.w, r = b.reg;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading), side = randRange(-0.5, 0.5) * b.width;
    a.x = b.x + fx * (b.len * 0.5 + 0.8) - fz * side;
    a.z = b.z + fz * (b.len * 0.5 + 0.8) + fx * side;
    a.vx = a.vz = 0; a.heading = 0; a.inBoat = false;
    if (a.px !== undefined && a.rank >= 2) { a.px = a.x; a.pz = a.z + 10; }
    const i = r.aboard.indexOf(a);
    if (i >= 0) r.aboard.splice(i, 1);
    w.addAgent(a);
    a.slot = r.agents.length;
    r.agents.push(a);
    if (r.slotMap) r.slotMap[a.slot] = a;
    if (r.alive === 0) { r.cx = a.x; r.cz = a.z; r.order = 'hold'; }
    if (a.kind === K_DOG) a.heading = 0;
    w.emit('landed', a);
  }
}
