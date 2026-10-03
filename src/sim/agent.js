// Agents (every soldier, animal and engine) and regiments.
import { clamp, lerp, wrapAngle, rand, randRange } from '../util.js';
import { AnimState, makeBasis, NJ, SEAT_RIDE, SEAT_STAND, SEAT_GROUND, SH_NONE, W_SWORD, W_SPEAR, W_BOW, W_HAMMER, W_BANNER } from '../anim/human.js';
import { QuadState } from '../anim/quadruped.js';
import {
  TYPES, WEAPONS, K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, SHIELD_FOR, genStats, genName,
  humanLook, horseLook, camelLook, dogLook, eleLook, chariotLook, engineLook,
} from './defs.js';
import { allocMount } from './mounts.js';

export const S_ALIVE = 0, S_DOWN = 1, S_GETUP = 2, S_DEAD = 3, S_GONE = 4;
let nextId = 1;

export function isActive(a) {
  return (a.state === S_ALIVE || a.state === S_GETUP) && !a.riderless;
}

export class Agent {
  constructor(team, type, reg, quality = 0.5) {
    const T = TYPES[type];
    this.T = T; this.type = type; this.kind = T.kind;
    this.id = nextId++; this.idx = -1;
    this.team = team; this.reg = reg; this.slot = 0;
    this.x = 0; this.z = 0; this.y = 0; this.vx = 0; this.vz = 0; this.heading = 0;
    this.prevX = 0; this.prevZ = 0;
    this.dvx = 0; this.dvz = 0; this.faceH = NaN; this.dh = 0; this.dspd = 0;
    this.radius = T.radius; this.ext = T.ext || 0;
    this.stats = genStats(quality);
    this.name = genName(team);
    const S = this.stats;
    if (this.kind === K_INF) this.radius *= clamp(0.5 + S.size * 0.5, 0.9, 1.12);
    this.mass = T.mass * S.size * S.size;
    this.maxHp = T.hp * (0.7 + S.vit / 165) * (this.kind === K_INF ? 1 : 1);
    this.hp = this.maxHp; this.state = S_ALIVE;
    this.runMul = 0.84 + S.spd / 300;
    this.dmgMul = 0.65 + S.str / 140;
    this.defBonus = (S.def - 50) / 200;
    this.baseMorale = clamp(0.42 + S.mor / 190 + (T.disc || 0.5) * 0.22, 0.3, 1.1);
    this.morale = this.baseMorale; this.stamina = 1;
    this.fleeing = false; this.rallyT = 0; this.restT = 0;
    this.target = null; this.attackers = 0; this.retarget = rand() * 0.6;
    this.attackCd = rand() * 1.5; this.atkTarget = null; this.tdist = 99;
    this.eager = randRange(0.86, 1.12);
    this.cryT = 0; this.shootDelay = -1; this.shootTarget = null; this.ammo = 0; this.reloadT = 0;
    this.rag = null; this.frozen = false; this.downT = 0; this.getupT = 0; this.blendFrom = null; this.queued = false;
    this.roll = 0; this.rollSide = 1; this.rollPivot = 0; this.rollV = 0; this.dieT = 0;
    this.skirmish = false; this.riderless = false;
    this.rank = 0; this.captain = false; this.bearer = false; this.wing = null;
    this.basis = makeBasis();
    this.hits = 0;
    this.swimming = false; this.climbing = false;
    this.slotBlocked = false; this.slotCheckT = rand(); this.path = null; this.pathI = 0; this.pathT = 0;
    this.job = null; this.carry = null;
    this.poseX = 0; this.poseZ = 0; this.poseY = 0; this.poseValid = false;
    this.lastHitT = -10; this.fallDrop = 0; this.yOff = 0;
    this.think = 0;
    this.weapon = 0; this.shield = 0; this.st = null; this.joints = null; this.look = null;
    this.q = null; this.crew = null; this.rage = 0; this.mode = 'form'; this.modeT = 0; this.lockT = 0;
    this.px = 0; this.pz = 0; this.mj = null; this.mj2 = null; this.horseLooks = null;
    this.gate = null; this.fireT = 3 + rand() * 3;
    this.nearEnemy = false; this.fear = 0; this.shotT = null; this.volleyShot = false;
    this.pointT = 0; this.faceTo = 0; this.deathNoted = false; this.hitDone = false; this.commanderBody = null;
    if (this.kind === K_INF) {
      this.weapon = T.weapon;
      this.shield = (SHIELD_FOR[team] && SHIELD_FOR[team][type]) || SH_NONE;
      this.st = new AnimState();
      this.st.scale = S.size;
      this.joints = new Float32Array(NJ * 3);
      this.look = humanLook(team, type);
      const R = WEAPONS[this.weapon].ranged;
      if (R && R.ammo) this.ammo = R.ammo;
    } else {
      this.q = new QuadState();
      this.crew = [];
      allocMount(this);
      if (this.kind === K_CAV) {
        this.look = T.animal === 'camel' ? camelLook(team) : horseLook(team, T.barding);
        const w = T.rider !== undefined ? T.rider : team === 0 ? W_SPEAR : W_SWORD;
        this.crew.push(makeCrew(team, 'rider', w, SEAT_RIDE, 0, 0, T.riderHp, quality));
      } else if (this.kind === K_DOG) {
        this.look = dogLook();
      } else if (this.kind === K_ELE) {
        this.look = eleLook(team);
        this.crew.push(makeCrew(team, 'mahout', W_SPEAR, SEAT_RIDE, 0, 0, 80, quality));
        this.crew.push(makeCrew(team, 'archer', W_BOW, SEAT_STAND, -0.35, 0, 70, quality));
        this.crew.push(makeCrew(team, 'archer', W_BOW, SEAT_STAND, 0.35, 0, 70, quality));
      } else if (this.kind === K_CHR) {
        this.look = chariotLook(team);
        this.crew.push(makeCrew(team, 'driver', W_SWORD, SEAT_STAND, 0, 0.2, 80, quality));
        this.crew.push(makeCrew(team, 'archer', W_BOW, SEAT_STAND, 0.1, -0.3, 70, quality));
        this.horseLooks = [horseLook(team), horseLook(team)];
      } else if (this.kind === K_ENG) {
        this.look = engineLook(team);
        const n = T.crew;
        for (let i = 0; i < n; i++) {
          let ox, oz, face = 0;
          if (T.sub === 'ram') { ox = (i % 2 ? 1 : -1) * 1.45; oz = -1.8 + Math.floor(i / 2) * 1.6; }
          else { ox = (i % 2 ? 1 : -1) * 1.5; oz = i < 2 ? -1.2 : 0.8; face = (i % 2 ? -1 : 1) * Math.PI / 2; }
          const c = makeCrew(team, 'engineer', W_HAMMER, SEAT_GROUND, ox, oz, 80, quality);
          c.face = face; c.hideWeapon = true;
          this.crew.push(c);
        }
      }
    }
  }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
}

export function makeCrew(team, role, weapon, seat, ox, oz, hp, quality = 0.5) {
  const st = new AnimState();
  if (role === 'driver') st.combat = 0.7;
  const stats = genStats(quality);
  st.scale = stats.size;
  return {
    role, weapon, shield: SH_NONE, seat, ox, oz, hp, maxHp: hp, alive: true, stats, name: genName(team),
    st, joints: new Float32Array(NJ * 3), cd: randRange(0.5, 3), target: null, face: 0,
    look: humanLook(team, role === 'archer' ? 'archer' : role === 'engineer' ? 'engineer' : 'rider'),
    hideWeapon: role === 'driver',
  };
}

const FORM_SP = { tight: 0.82, normal: 1, loose: 1.9 };

export class Regiment {
  constructor(world, team, type, cols, spX, spZ, ax, az, facing, name, quality = 0.5) {
    this.world = world; this.team = team; this.type = type; this.T = TYPES[type];
    this.kind = this.T.kind; this.name = name; this.quality = quality;
    this.cols = cols; this.effCols = cols; this.spX = spX; this.spZ = spZ;
    this.formation = this.T.skirm ? 'loose' : 'normal';
    this.ax = ax; this.az = az; this.facing = facing; this.tFacing = facing;
    this.tx = ax; this.tz = az; this.avx = 0; this.avz = 0;
    this.order = 'hold'; this.targetReg = null; this.charging = false;
    this.manual = false; this.agents = []; this.initial = 0; this.alive = 0;
    this.cx = ax; this.cz = az; this.engaged = false; this.brace = false;
    this.volleyT = randRange(1, 3); this.compactT = 0; this.braceT = 0; this.colT = 0;
    this.cdx = Math.sin(facing); this.cdz = Math.cos(facing);
    this.id = world.regs.length;
    this.path = null; this.pathL = null; this.pathS = 0; this.pathVer = -1; this.repathT = 0; this.pathGoal = null;
    this.wing = null; this.captain = null; this.bearer = null;
    this.morale = 1; this.stamina = 1; this.fleeFrac = 0;
    this.aura = 0;
    this.task = null;
    this.defend = false; // AI posture: hold ground until the enemy closes
    this.waitT = 0;
    this.flank = null; this.flankReached = true; this.follow = null;
    this.slotMap = null; this.casualty = 0; this.noPath = false; this.pathTarget = null;
    this.pendingOrder = null; this.bearerT = 0; this.assaultX = undefined; this.threatD = 0;
  }
  get fs() { return FORM_SP[this.formation] || 1; }
  get width() { return this.effCols * this.spX * this.fs; }

  // ---- path following ----
  setPath(pts) {
    if (!pts || !pts.length) { this.path = null; return; }
    const p = [{ x: this.ax, z: this.az }, ...pts];
    const L = [0];
    for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
    this.path = p; this.pathL = L; this.pathS = 0;
  }
  pathEnd() { return this.path ? this.pathL[this.pathL.length - 1] : 0; }
  pointAt(s, out) {
    const p = this.path, L = this.pathL, n = p.length;
    if (s <= 0 || n < 2) {
      const dx = p[1] ? p[1].x - p[0].x : 0, dz = p[1] ? p[1].z - p[0].z : 1, l = Math.hypot(dx, dz) || 1;
      out.x = p[0].x + dx / l * s; out.z = p[0].z + dz / l * s; out.tx = dx / l; out.tz = dz / l;
      return out;
    }
    let i = 1;
    while (i < n - 1 && L[i] < s) i++;
    const a = p[i - 1], b = p[i];
    const seg = L[i] - L[i - 1] || 1;
    const t = (s - L[i - 1]) / seg;
    const dx = (b.x - a.x) / seg, dz = (b.z - a.z) / seg;
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; out.tx = dx; out.tz = dz;
    if (s > L[n - 1]) { out.x = b.x + dx * (s - L[n - 1]); out.z = b.z + dz * (s - L[n - 1]); }
    return out;
  }
  // arc-length position on the path closest to (x,z)
  projectOnPath(x, z) {
    const p = this.path, L = this.pathL;
    let best = 0, bd = 1e9;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1].x, az = p[i - 1].z, dx = p[i].x - ax, dz = p[i].z - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; best = L[i - 1] + t * (L[i] - L[i - 1]); }
    }
    return best;
  }

  slotPos(i, out) {
    const cols = this.effCols, fs = this.fs;
    const col = i % cols, row = Math.floor(i / cols);
    const lx = ((col - (cols - 1) / 2) + (row % 2 ? 0.25 : 0)) * this.spX * fs;
    const lz = row * this.spZ * fs;
    if (this.path) {
      this.pointAt(this.pathS - lz, out);
      out.x += -out.tz * lx; out.z += out.tx * lx;
      return out;
    }
    const s = Math.sin(this.facing), c = Math.cos(this.facing);
    out.x = this.ax - c * lx - s * lz;
    out.z = this.az + s * lx - c * lz;
    return out;
  }

  updateEffCols(nav) {
    const n = Math.max(1, this.alive);
    if (!this.path || nav.trivial) { this.effCols = Math.min(this.cols, Math.max(1, n)); return; }
    const tmp = { x: 0, z: 0 };
    const depth = Math.ceil(n / this.effCols) * this.spZ * this.fs;
    let minC = 1e9;
    for (const d of [-5, 0, depth * 0.5, depth]) {
      this.pointAt(this.pathS - d, tmp);
      minC = Math.min(minC, nav.clearanceAt(tmp.x, tmp.z));
    }
    const width = minC * 2 - 1.2;
    const want = clamp(Math.floor(width / (this.spX * this.fs)), 1, this.cols);
    // hysteresis so the unit does not re-shuffle every half second
    if (want < this.effCols || want > this.effCols + 1) this.effCols = want;
  }

  turnTo(h, dt, rate) {
    const d = wrapAngle(h - this.facing);
    this.facing = wrapAngle(this.facing + clamp(d, -rate * dt, rate * dt));
  }
}

export { K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, W_BANNER, W_HAMMER };
