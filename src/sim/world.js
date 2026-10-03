// Battle simulation core: spatial grid, movement on the stage height field,
// collisions and charge impacts, melee and missile resolution, deaths and
// ragdolls, morale events, and the order API used by the UI and the AI.
import { clamp, approach, wrapAngle, rand, randRange, TAU } from '../util.js';
import {
  poseHuman, setBasisYaw, J, W_SPEAR, W_BOW, W_PIKE, W_HAMMER,
  SH_NONE, SH_RECT, SH_SMALL, SEAT_GROUND, ACT_NONE, ACT_ATTACK, ACT_BLOCK,
} from '../anim/human.js';
import { quadStride, eleStride, ANIMALS } from '../anim/quadruped.js';
import { groundHeight } from '../terrain.js';
import { F_LADDER } from './stage.js';
import { Ragdoll } from './ragdoll.js';
import { WEAPONS, K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, P_ARROW, P_JAV, P_STONE, P_BOLT, P_ROCK } from './defs.js';
import { PROJ } from './projectiles.js';
import { computeMount, computeCrew } from './mounts.js';
import { Agent, Regiment, isActive, S_ALIVE, S_DOWN, S_GETUP, S_DEAD, S_GONE } from './agent.js';
import * as AI from './ai.js';

export { Agent, Regiment, isActive, S_ALIVE, S_DOWN, S_GETUP, S_DEAD, S_GONE };

const G = 9.8;
const CELL = 2, HALF = 500, GN = (HALF * 2) / CELL;

export class World {
  constructor(stage, nav) {
    this.stage = stage; this.nav = nav;
    this.agents = [];
    this.regs = [];
    this.time = 0; this.stepN = 0;
    this.phase = 'deploy';
    this.ragList = [];
    this.gridHead = new Int32Array(GN * GN);
    this.gridNext = new Int32Array(8192);
    this.qbuf = new Int32Array(16384);
    this.proj = null; this.fx = null;
    this.auto = [true, true];
    this.listeners = [];
    this.freezeQueue = [];
    this.kills = [0, 0];
    this.pending = [];
    this.env = { speed: 1, acc: 1, vis: 1 }; // weather: movement, missile accuracy, sight (see weather.js)
    this.armies = [null, null];
    this.command = null;      // hierarchical AI (command.js)
    this.engineering = null;  // siege works (engineering.js)
    this.pathBudget = 0;
    this.stakeTmp = [];
    this.debris = [];
    this.ended = false;
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, data) { for (const f of this.listeners) f(type, data); }

  addRegiment(r) { this.regs.push(r); return r; }
  addAgent(a) {
    a.idx = this.agents.length;
    this.agents.push(a);
    if (this.agents.length > this.gridNext.length) this.gridNext = new Int32Array(this.gridNext.length * 2);
    a.y = groundHeight(a.x, a.z);
    a.prevX = a.x; a.prevZ = a.z;
    return a;
  }
  start() { if (this.phase === 'deploy') { this.phase = 'battle'; this.emit('start'); } }

  // ------------------------------------------------------------- grid
  buildGrid() {
    const head = this.gridHead, next = this.gridNext;
    head.fill(-1);
    const A = this.agents;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state !== S_ALIVE && a.state !== S_GETUP) continue;
      const cx = clamp(Math.floor((a.x + HALF) / CELL), 0, GN - 1);
      const cz = clamp(Math.floor((a.z + HALF) / CELL), 0, GN - 1);
      const c = cz * GN + cx;
      next[i] = head[c]; head[c] = i;
    }
  }
  query(x, z, R) {
    const head = this.gridHead, next = this.gridNext, out = this.qbuf;
    const x0 = clamp(Math.floor((x - R + HALF) / CELL), 0, GN - 1), x1 = clamp(Math.floor((x + R + HALF) / CELL), 0, GN - 1);
    const z0 = clamp(Math.floor((z - R + HALF) / CELL), 0, GN - 1), z1 = clamp(Math.floor((z + R + HALF) / CELL), 0, GN - 1);
    let n = 0;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        let i = head[cz * GN + cx];
        while (i >= 0 && n < out.length) { out[n++] = i; i = next[i]; }
      }
    }
    return n;
  }

  // ------------------------------------------------------------- orders
  // Orders from the player travel down the chain of command: a dead captain
  // or commander delays them.
  orderDelay(reg) {
    let d = 0.15;
    if (reg.captain && !isActive(reg.captain)) d += 1.2;
    if (reg.wing && reg.wing.commander && !this.commanderAlive(reg.wing.commander)) d += 1.0;
    const army = this.armies[reg.team];
    if (army && army.general && !this.commanderAlive(army.general)) d += 0.8;
    return d;
  }
  commanderAlive(a) { return a && isActive(a) && a.crew && a.crew[0] && a.crew[0].alive; }
  issue(reg, kind, ...args) {
    const d = this.orderDelay(reg);
    if (kind !== 'ai') reg.manual = true;
    this.pending = this.pending.filter(p => p.reg !== reg);
    this.pending.push({ t: this.time + d, reg, kind, args });
    reg.pendingOrder = kind;
  }
  applyOrder(reg, kind, args) {
    reg.pendingOrder = null;
    if (reg.alive === 0) return;
    switch (kind) {
      case 'move': this.orderMove(reg, ...args); break;
      case 'charge': this.orderCharge(reg, ...args); break;
      case 'hold': this.orderHold(reg); break;
      case 'fire': this.orderFire(reg, ...args); break;
      case 'task': if (this.engineering) this.engineering.assign(reg, ...args); break;
      case 'formation': reg.formation = args[0]; break;
      case 'ai': reg.manual = false; break;
    }
  }
  orderMove(reg, x, z, facing) {
    reg.order = 'move'; reg.tx = x; reg.tz = z; reg.charging = false; reg.targetReg = null;
    reg.tFacing = facing !== undefined ? facing : Math.atan2(x - reg.ax, z - reg.az);
    if (Math.hypot(reg.cx - reg.ax, reg.cz - reg.az) > 8) { reg.ax = reg.cx; reg.az = reg.cz; }
    reg.pathGoal = null; reg.repathT = 0;
    for (const a of reg.agents) if (a.kind !== K_INF) a.mode = 'form';
  }
  orderCharge(reg, target) {
    if (!target) return;
    if (reg.order === 'charge' && reg.targetReg === target) return;
    const W = reg.kind === K_INF ? WEAPONS[reg.T.weapon] : null;
    if (W && W.ranged && !W.ranged.ammo) { this.orderFire(reg, target); return; }
    reg.order = 'charge'; reg.targetReg = target; reg.charging = false;
    if (Math.hypot(reg.cx - reg.ax, reg.cz - reg.az) > 8) { reg.ax = reg.cx; reg.az = reg.cz; }
    reg.pathGoal = null; reg.repathT = 0;
  }
  orderHold(reg) {
    reg.order = 'hold'; reg.charging = false; reg.targetReg = null; reg.path = null;
    reg.ax = reg.cx; reg.az = reg.cz; reg.tFacing = reg.facing;
    for (const a of reg.agents) if (a.kind !== K_INF) a.mode = 'form';
  }
  orderFire(reg, target) {
    reg.order = 'fire'; reg.targetReg = target; reg.charging = false; reg.path = null;
    if (Math.hypot(reg.cx - reg.ax, reg.cz - reg.az) > 6) { reg.ax = reg.cx; reg.az = reg.cz; }
  }

  nearestEnemyReg(reg, pref) {
    let best = null, bd = 1e9;
    for (const r of this.regs) {
      if (r.team === reg.team || r.alive === 0 || r.order === 'rout') continue;
      let d = Math.hypot(r.cx - reg.cx, r.cz - reg.cz);
      if (pref) d -= pref(r) * 60;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  // ------------------------------------------------------------- update
  update(dt) {
    this.time += dt; this.stepN++;
    this.pathBudget = 3;
    this.buildGrid();
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (this.time >= p.t) { this.pending.splice(i, 1); this.applyOrder(p.reg, p.kind, p.args); }
      }
    }
    if (this.command) this.command.update(dt);
    for (const r of this.regs) if (r.order !== 'dead') AI.updateRegiment(this, r, dt);
    if (this.engineering) this.engineering.update(dt);
    const A = this.agents, sn = this.stepN;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state !== S_ALIVE) continue;
      switch (a.kind) {
        case K_INF: {
          // formation-keepers away from any fight only think every third step
          const idle = !a.target && !a.reg.charging && !a.reg.engaged && !a.fleeing && a.shootDelay < 0 && a.st.action === ACT_NONE && !a.job;
          if (idle) { if ((a.id + sn) % 3 === 0) AI.thinkInf(this, a, dt * 3); }
          else AI.thinkInf(this, a, dt);
          break;
        }
        case K_CAV: AI.thinkCav(this, a, dt); break;
        case K_ELE: AI.thinkEle(this, a, dt); break;
        case K_CHR: AI.thinkChr(this, a, dt); break;
        case K_DOG: AI.thinkDog(this, a, dt); break;
        case K_ENG: if (this.engineering) this.engineering.thinkEngine(a, dt); break;
      }
    }
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state === S_ALIVE || a.state === S_GETUP) {
        if (a.kind === K_INF || a.kind === K_DOG) this.moveFree(a, dt); else this.moveMount(a, dt);
      }
    }
    this.collide(dt);
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state === S_ALIVE || a.state === S_GETUP) this.constrain(a, false, dt);
    }
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state === S_GONE || a.frozen) continue;
      if (a.kind === K_INF) this.animInf(a, dt); else this.animMount(a, dt);
    }
    const RL = this.ragList;
    for (let i = RL.length - 1; i >= 0; i--) {
      const a = RL[i];
      if (!a.rag) { RL.splice(i, 1); continue; }
      a.rag.step(dt);
      if (a.state === S_DOWN) {
        a.downT += dt;
        if (a.hp > 0 && a.downT > 1.2 && (a.rag.sleeping || a.downT > 3.0)) this.getUp(a);
      } else if (a.state === S_DEAD && a.rag.sleeping) {
        RL.splice(i, 1);
        this.freezeQueue.push(a);
      }
    }
    if (this.proj) this.proj.step(dt, this);
    this.stepDebris(dt);
    if (this.fx) this.fx.step(dt);
  }

  // ------------------------------------------------------------- targeting helpers
  isEnemy(a, t) { return t.team !== a.team && t.team >= 0 && isActive(t); }
  sameLevel(a, t) { return Math.abs(t.y - a.y) < 1.7; }
  distTo(a, t) {
    let tx = t.x, tz = t.z;
    if (t.ext) {
      const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
      const k = clamp((a.x - t.x) * fx + (a.z - t.z) * fz, -t.ext, t.ext);
      tx += fx * k; tz += fz * k;
    }
    return Math.hypot(tx - a.x, tz - a.z);
  }
  // nearest enemy in melee range R; skips opponents already surrounded (cap)
  nearestEnemy(a, R, cap = 99) {
    const n = this.query(a.x, a.z, R + 2.5);
    const A = this.agents, q = this.qbuf;
    let best = null, bs = 1e9;
    for (let k = 0; k < n; k++) {
      const t = A[q[k]];
      if (!this.isEnemy(a, t) || !this.sameLevel(a, t)) continue;
      const d = this.distTo(a, t) - t.radius;
      if (d > R) continue;
      if (t.attackers >= cap && a.target !== t && d > 0.6) continue;
      const s = d + Math.min(t.attackers, 4) * 0.8 + (t.swimming ? 3 : 0);
      if (s < bs) { bs = s; best = t; }
    }
    return best;
  }
  nearestInReg(a, reg, R, sameLevel = true) {
    let best = null, bd = R;
    for (const t of reg.agents) {
      if (!this.isEnemy(a, t) || sameLevel && !this.sameLevel(a, t)) continue;
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  nearestEnemyAnywhere(a, R, sameLevel = false) {
    R *= this.env.vis;
    let best = null, bd = R;
    for (const r of this.regs) {
      if (r.team === a.team || r.alive === 0) continue;
      if (Math.hypot(r.cx - a.x, r.cz - a.z) > R + 80) continue;
      for (const t of r.agents) {
        if (!this.isEnemy(a, t) || sameLevel && !this.sameLevel(a, t)) continue;
        const d = Math.hypot(t.x - a.x, t.z - a.z);
        if (d < bd) { bd = d; best = t; }
      }
    }
    return best;
  }
  setTarget(a, t) {
    if (a.target === t) return;
    if (a.target) a.target.attackers--;
    a.target = t;
    if (t) t.attackers++;
  }

  // steer towards (tx,tz), going around obstacles with a cached A* path.
  // returns the point to head for, or null when unreachable.
  steerTo(a, tx, tz, cls, dt) {
    const nav = this.nav;
    if (nav.trivial) return [tx, tz];
    a.pathT -= dt;
    if (!a.path || a.pathT <= 0) {
      if (Math.hypot(tx - a.x, tz - a.z) < 3 || nav.raycast(a.x, a.z, tx, tz, cls)) { a.path = null; a.pathT = 1 + rand(); return [tx, tz]; }
      if (this.pathBudget <= 0) return a.path ? this.followPath(a) : [tx, tz];
      this.pathBudget--;
      a.path = nav.findPath(a.x, a.z, tx, tz, cls, 40000);
      a.pathI = 0; a.pathT = 3 + rand() * 2;
      if (!a.path) { a.pathT = 2; return null; }
    }
    return this.followPath(a);
  }
  followPath(a) {
    let p = a.path[a.pathI];
    while (a.pathI < a.path.length - 1 && Math.hypot(p.x - a.x, p.z - a.z) < 1.6) p = a.path[++a.pathI];
    return [p.x, p.z];
  }

  // ------------------------------------------------------------- movement
  maxSpeed(a) {
    const T = a.T;
    let v = (T.run || T.max) * a.runMul * (0.62 + 0.38 * a.stamina);
    if (a.swimming) v = 0.9;
    else if (a.climbing) v = Math.min(v, 1.1);
    else if (this.stage.hasWater && this.stage.WL - a.y > 0.3) v *= 0.55;
    if (this.stage.hilly && !a.swimming) {
      // uphill is slow going, downhill a little quicker
      const sp = Math.hypot(a.vx, a.vz);
      if (sp > 0.5) v *= clamp(1 - 0.9 * (this.stage.terrain(a.x + a.vx / sp * 1.5, a.z + a.vz / sp * 1.5) - a.y) / 1.5, 0.7, 1.12);
    }
    return v * this.env.speed;
  }
  moveFree(a, dt) {
    a.prevX = a.x; a.prevZ = a.z;
    if (a.state === S_GETUP) { a.vx *= 0.8; a.vz *= 0.8; return; }
    let dvx = a.dvx, dvz = a.dvz;
    const lim = this.maxSpeed(a);
    const dl = Math.hypot(dvx, dvz);
    if (dl > lim) { dvx *= lim / dl; dvz *= lim / dl; }
    let ax = dvx - a.vx, az = dvz - a.vz;
    const l = Math.hypot(ax, az), maxA = (a.kind === K_DOG ? 14 : 9) * dt;
    if (l > maxA) { ax *= maxA / l; az *= maxA / l; }
    a.vx += ax; a.vz += az;
    if (this.stage.stakes.length && ((a.id + this.stepN) & 3) === 0) {
      const S = this.stage.stakesNear(a.x, a.z, this.stakeTmp);
      for (const s of S) if (Math.hypot(s.x - a.x, s.z - a.z) < 0.7) { a.vx *= 0.6; a.vz *= 0.6; break; }
    }
    a.x += a.vx * dt; a.z += a.vz * dt;
    this.constrain(a, true, dt);
    const sp = Math.hypot(a.vx, a.vz);
    let h = a.faceH;
    if (a.climbing) h = 0; // ladders lean against the south face
    if (h !== h) h = sp > 0.5 ? Math.atan2(a.vx, a.vz) : a.heading;
    const rate = (a.kind === K_DOG ? 9 : sp > 4 ? 4 : 7) * dt;
    a.heading = wrapAngle(a.heading + clamp(wrapAngle(h - a.heading), -rate, rate));
  }
  moveMount(a, dt) {
    a.prevX = a.x; a.prevZ = a.z;
    const T = a.T;
    const sp0 = Math.hypot(a.vx, a.vz);
    const turn = T.turn * (sp0 < 3 ? 1.6 : 1) * dt;
    a.heading = wrapAngle(a.heading + clamp(wrapAngle(a.dh - a.heading), -turn, turn));
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    let spd = a.dspd;
    if (a.swimming) spd = Math.min(spd, 1.5);
    else if (this.stage.hasWater && this.stage.WL - a.y > 0.3) spd *= 0.6;
    const tvx = fx * spd, tvz = fz * spd;
    const dvx = tvx - a.vx, dvz = tvz - a.vz;
    let lon = dvx * fx + dvz * fz, lat = -dvx * fz + dvz * fx;
    const acc = T.accel * dt;
    lon = clamp(lon, -acc * 1.8, acc);
    lat = clamp(lat, -7 * dt, 7 * dt);
    a.vx += fx * lon - fz * lat; a.vz += fz * lon + fx * lat;
    a.x += a.vx * dt; a.z += a.vz * dt;
    this.constrain(a, true, dt);
    if (this.stage.stakes.length && a.kind !== K_ENG) this.stakeHits(a);
  }
  // keep bodies on walkable floors: blocked by walls, falling off edges, swimming
  constrain(a, voluntary, dt) {
    const st = this.stage;
    let f = st.floorAt(a.x, a.z);
    const inf = a.kind === K_INF;
    const lad = inf && ((st.flagAt(a.x, a.z) & F_LADDER) || (st.flagAt(a.prevX, a.prevZ) & F_LADDER));
    const lim = inf ? (lad ? 1.5 : 0.8) : a.kind === K_DOG ? 0.8 : 0.5;
    const deep = h => st.hasWater && st.WL - h > 1.3;
    const bad = h => h - a.y > lim || (voluntary && !a.swimming && deep(h));
    if (bad(f)) {
      const fx = st.floorAt(a.x, a.prevZ), fz = st.floorAt(a.prevX, a.z);
      if (!bad(fx)) { a.z = a.prevZ; a.vz *= 0.2; f = fx; }
      else if (!bad(fz)) { a.x = a.prevX; a.vx *= 0.2; f = fz; }
      else { a.x = a.prevX; a.z = a.prevZ; a.vx *= 0.2; a.vz *= 0.2; f = st.floorAt(a.x, a.z); }
    }
    const drop = a.y - f;
    if (drop > 1.7 && !lad && !a.swimming) {
      const push = Math.hypot(a.vx, a.vz);
      if (voluntary || push < 2.6) {
        // nobody walks off a wall or a bridge on purpose
        const fb = st.floorAt(a.prevX, a.prevZ);
        if (a.y - fb < 1.7) { a.x = a.prevX; a.z = a.prevZ; a.vx *= -0.2; a.vz *= -0.2; f = fb; }
        else { this.fall(a, drop); return; }
      } else { this.fall(a, drop); return; }
    }
    a.swimming = deep(f);
    const ny = a.swimming ? st.WL - 1.3 : f;
    // a step up or down of the floor (wall edge, bridge end, ramp) would pop the body
    // by up to a metre in one frame: keep the old height as a visual offset that animInf eases out
    if (inf && ny !== a.y && Math.abs(ny - a.y) < 1.2 && a.state === S_ALIVE) a.yOff = clamp(a.yOff + a.y - ny, -1.2, 1.2);
    a.y = ny;
    a.climbing = !!lad;
    if (a.swimming && dt) {
      a.hp -= (a.kind === K_INF ? 3 : 5) * dt;
      if (a.hp <= 0) {
        if (a.kind === K_INF) { this.killInf(a, 0, -0.5, 0, 0, 0, 0, 0); this.emit('death', a); }
        else this.killMount(a, 0, 0, 'drown');
      }
    }
  }
  fall(a, drop) {
    const water = this.stage.hasWater && this.stage.WL - this.stage.floorAt(a.x, a.z) > 1;
    if (a.kind === K_INF) {
      const dmg = water ? 0 : Math.max(0, drop - 2.2) * randRange(16, 30);
      a.hp -= dmg;
      const v = Math.hypot(a.vx, a.vz) || 1;
      const kx = a.vx / v * 1.5, kz = a.vz / v * 1.5;
      if (a.hp <= 0) { this.killInf(a, a.vx + kx, 0.5, a.vz + kz, 0, 0, 0, 0.4); this.emit('death', a); }
      else this.knockDown(a, a.vx + kx, 0.5, a.vz + kz, 0.4);
      this.emit('fall', a);
    } else this.killMount(a, a.vx, a.vz, 'fall');
  }
  stakeHits(a) {
    const S = this.stage.stakesNear(a.x, a.z, this.stakeTmp);
    if (!S.length) return;
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    for (const s of S) {
      const k = clamp((s.x - a.x) * fx + (s.z - a.z) * fz, -a.ext, a.ext);
      const cx = a.x + fx * k, cz = a.z + fz * k;
      const d = Math.hypot(s.x - cx, s.z - cz);
      if (d > a.radius + 0.35) continue;
      const sp = Math.hypot(a.vx, a.vz);
      if (sp > 3 && a.kind !== K_DOG) {
        const dmg = (a.kind === K_ELE ? randRange(30, 70) : randRange(60, 150)) * (sp / 10);
        this.damageMount(a, dmg, fx, fz, 'stake');
        a.vx *= 0.15; a.vz *= 0.15;
        if (a.q) a.q.rear = 1;
        if (rand() < 0.5) s.alive = false;
        this.emit('impale', a);
        if (this.fx) this.fx.blood(s.x, a.y + 1, s.z, fx, fz, 6);
      }
      const nx = (cx - s.x) / (d || 1), nz = (cz - s.z) / (d || 1);
      const o = a.radius + 0.35 - d;
      a.x += nx * o; a.z += nz * o;
    }
  }

  // ------------------------------------------------------------- animation
  animInf(a, dt) {
    const st = a.st;
    if (a.state === S_GETUP) {
      a.getupT += dt;
      st.speed = 0; st.combat = approach(st.combat, 0, dt);
      if (a.getupT >= 1.1) { a.state = S_ALIVE; a.blendFrom = null; }
      st.tick(dt);
      return;
    }
    if (a.state !== S_ALIVE) { a.yOff = 0; return; }
    if (a.yOff) a.yOff = approach(a.yOff, 0, dt * 4);
    const sp = Math.hypot(a.vx, a.vz);
    const s = Math.sin(a.heading), c = Math.cos(a.heading);
    st.speed = sp;
    st.vx = -a.vx * c + a.vz * s;
    st.vz = a.vx * s + a.vz * c;
    st.run = approach(st.run, clamp((sp - 2.4) / 2.6, 0, 1), dt * 3);
    const reach = WEAPONS[a.weapon].reach + 3.5;
    st.combat = approach(st.combat, a.target && a.tdist < reach && !a.swimming ? 1 : 0, dt * 2.5);
    st.raise = approach(st.raise, a.cryT > 0 && st.action === ACT_NONE ? 1 : 0, dt * 4);
    const braceW = a.weapon === W_SPEAR || a.weapon === W_PIKE;
    st.brace = approach(st.brace, a.reg.brace && !a.target && braceW ? 1 : 0, dt * 2);
    st.climb = approach(st.climb, a.climbing ? 1 : 0, dt * 5);
    if (a.climbing) st.climbPh += dt * 7;
    st.swim = approach(st.swim, a.swimming ? 1 : 0, dt * 4);
    st.carry = approach(st.carry, a.carry ? 1 : 0, dt * 3);
    st.hideW = !!a.carry;
    if (sp > 3.5) a.stamina -= dt * 0.03 * (1.45 - a.stats.vit / 110);
    else if (sp < 0.4 && !a.target) a.stamina += dt * 0.035;
    else a.stamina += dt * 0.006;
    a.stamina = clamp(a.stamina, 0, 1);
    const act = st.action;
    if (st.tick(dt)) AI.actionEvent(this, a, act);
  }

  animMount(a, dt) {
    const sp = Math.hypot(a.vx, a.vz);
    const P = a.kind === K_CAV ? ANIMALS[a.T.animal] : a.kind === K_DOG ? ANIMALS.dog : ANIMALS.horse;
    const stride = s => a.kind === K_ELE ? eleStride(s) : quadStride(P, s);
    if (a.state === S_DEAD) {
      a.dieT += dt;
      const k = Math.exp(-2.5 * dt);
      a.vx *= k; a.vz *= k;
      a.x += a.vx * dt; a.z += a.vz * dt;
      const f = this.stage.floorAt(a.x, a.z);
      a.y += (f - a.y) * Math.min(1, dt * 6);
      if (a.kind !== K_ENG) {
        a.rollV += (a.kind === K_ELE ? 2.0 : 3.4) * Math.sin(a.roll + 0.12) * dt;
        a.roll += a.rollV * dt;
        if (a.roll >= Math.PI / 2) {
          a.roll = Math.PI / 2;
          if (a.rollV > 0.8) {
            a.rollV = -a.rollV * 0.2;
            if (this.fx) this.fx.dustBurst(a.x, a.y, a.z, a.kind === K_ELE ? 18 : 8, a.kind === K_ELE ? 2.5 : 1.2);
            this.emit('thud', a);
          } else a.rollV = 0;
        }
        a.q.speed = Math.max(0, a.q.speed - dt * 4);
        a.q.tick(dt, stride(a.q.speed));
      } else a.rollV = 0;
      if (a.dieT > 3.5 && a.rollV === 0 && !a.queued) { a.queued = true; this.freezeQueue.push(a); }
      return;
    }
    if (a.state !== S_ALIVE) return;
    const fwdSp = a.vx * Math.sin(a.heading) + a.vz * Math.cos(a.heading);
    a.q.speed = a.kind === K_DOG ? sp : Math.max(0, fwdSp);
    a.q.tick(dt, stride(a.q.speed));
    if (a.kind === K_CHR) a.q.wheel += fwdSp * dt / 0.55;
    if (a.kind === K_ENG) a.q.wheel += fwdSp * dt / 0.5;
    if (this.fx && sp > 4.5 && a.kind !== K_DOG && rand() < dt * (a.kind === K_ELE ? 8 : 5)) {
      this.fx.dust(a.x - Math.sin(a.heading) * 1.2, a.y + 0.3, a.z - Math.cos(a.heading) * 1.2, a.kind === K_ELE ? 2.2 : 1.4);
    }
    if (a.pointT > 0) a.pointT -= dt;
    if (!a.crew) return;
    for (let i = 0; i < a.crew.length; i++) {
      const c = a.crew[i];
      if (!c.alive) continue;
      const cs = c.st;
      if (a.kind === K_ENG) {
        cs.speed = sp; cs.vx = 0; cs.vz = sp;
        cs.push = approach(cs.push, a.T.sub === 'ram' && (sp > 0.2 || a.mode === 'batter') ? 1 : 0, dt * 3);
      } else cs.speed = 0;
      cs.run = approach(cs.run, a.kind === K_CAV && sp > 7 && a.mode === 'charge' ? 1 : 0, dt * 2);
      cs.raise = approach(cs.raise, this.phase === 'deploy' && Math.sin(this.time * 0.5 + a.id) > 0.97 ? 1 : 0, dt * 3);
      cs.point = approach(cs.point, a.T.commander && a.pointT > 0 ? 1 : 0, dt * 3);
      cs.lean = c.role === 'rider' ? -0.04 + Math.sin(a.q.phase * TAU) * 0.05 * Math.min(1, sp / 8) : 0;
      const act = cs.action;
      if (cs.tick(dt)) AI.crewEvent(this, a, c, act);
    }
  }

  // ------------------------------------------------------------- collisions
  collide() {
    const A = this.agents, q = this.qbuf;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.state !== S_ALIVE && a.state !== S_GETUP) continue;
      const big = a.kind !== K_INF && a.kind !== K_DOG;
      const R = big ? a.radius + a.ext + 3.8 : 1.15;
      const n = this.query(a.x, a.z, R);
      for (let k = 0; k < n; k++) {
        const j = q[k];
        if (j === i) continue;
        const b = A[j];
        const bBig = b.kind !== K_INF && b.kind !== K_DOG;
        if (!big && bBig) continue;
        if (big === bBig && j < i) continue;
        this.resolvePair(a, b);
        if (a.state !== S_ALIVE && a.state !== S_GETUP) break;
      }
    }
  }

  resolvePair(a, b) {
    if (b.state !== S_ALIVE && b.state !== S_GETUP) return;
    if (Math.abs(a.y - b.y) > 1.6) return; // different floors (wall top vs ground)
    let ax = a.x, az = a.z, bx = b.x, bz = b.z;
    if (a.ext) {
      const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
      const k = clamp((bx - a.x) * fx + (bz - a.z) * fz, -a.ext, a.ext);
      ax = a.x + fx * k; az = a.z + fz * k;
    }
    if (b.ext) {
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
      const k = clamp((ax - b.x) * fx + (az - b.z) * fz, -b.ext, b.ext);
      bx = b.x + fx * k; bz = b.z + fz * k;
      if (a.ext) {
        const fx2 = Math.sin(a.heading), fz2 = Math.cos(a.heading);
        const k2 = clamp((bx - a.x) * fx2 + (bz - a.z) * fz2, -a.ext, a.ext);
        ax = a.x + fx2 * k2; az = a.z + fz2 * k2;
      }
    }
    let dx = bx - ax, dz = bz - az;
    const rr = a.radius + b.radius;
    // personal space: comrades keep extra distance instead of clumping
    // (men 0.4 m, horses and vehicles most of a body width)
    let pad = 0;
    if (a.team === b.team) {
      const am = a.kind !== K_INF && a.kind !== K_DOG, bm = b.kind !== K_INF && b.kind !== K_DOG;
      pad = am && bm ? 0.9 : am || bm ? 0.35 : a.kind === K_INF && b.kind === K_INF ? 0.4 : 0.2;
    }
    const R = rr + pad;
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) return;
    let d = Math.sqrt(d2);
    if (d < 1e-4) { dx = Math.sin(a.id); dz = Math.cos(a.id); d = 1; }
    const nx = dx / d, nz = dz / d;
    if (d >= rr) {
      // soft separation, split by mass so horses nudge men rather than the reverse
      const s = (R - d) * 0.3;
      const ima = 1 / a.mass, imb = 1 / b.mass, sum = ima + imb;
      a.x -= nx * s * 2 * ima / sum; a.z -= nz * s * 2 * ima / sum;
      b.x += nx * s * 2 * imb / sum; b.z += nz * s * 2 * imb / sum;
      return;
    }
    const overlap = rr - d;
    const relv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    if (relv > 2 && this.impact(a, b, relv, nx, nz)) return;
    const ima = 1 / a.mass, imb = 1 / b.mass, sum = ima + imb;
    const corr = overlap * 0.85 / sum;
    a.x -= nx * corr * ima; a.z -= nz * corr * ima;
    b.x += nx * corr * imb; b.z += nz * corr * imb;
    if (relv > 0) {
      const j = relv / sum * 0.9;
      a.vx -= nx * j * ima; a.vz -= nz * j * ima;
      b.vx += nx * j * imb; b.vz += nz * j * imb;
    }
  }

  // returns true when the lighter body was thrown (pair resolved)
  impact(a, b, relv, nx, nz) {
    const enemies = a.team !== b.team;
    let heavy = a, light = b, sgn = 1;
    if (b.mass > a.mass) { heavy = b; light = a; sgn = -1; }
    const ratio = heavy.mass / light.mass;
    const hx = nx * sgn, hz = nz * sgn;
    const fx = this.fx;
    if (ratio > 3 && light.kind === K_INF && heavy.kind !== K_DOG) {
      const panic = heavy.mode === 'panic' || heavy.riderless;
      if (!enemies && !panic && relv < 6) return false;
      if (relv < 2.6 || heavy.kind === K_ENG) return false;
      const lfx = Math.sin(light.heading), lfz = Math.cos(light.heading);
      const facing = -(lfx * hx + lfz * hz);
      const W = WEAPONS[light.weapon];
      if (enemies && W.antiCav && facing > 0.4 && (light.st.brace > 0.3 || light.st.combat > 0.5)) {
        if (heavy.kind === K_CAV && rand() < W.antiCav) {
          this.damageMount(heavy, 999, -hx, -hz, 'impale');
          this.emit('impale', heavy);
          if (rand() < 0.6) return false;
        } else if (heavy.kind === K_ELE) {
          this.damageMount(heavy, randRange(60, 160) * W.antiCav, -hx, -hz);
        }
      }
      const hvx = heavy.vx, hvz = heavy.vz;
      const mult = heavy.kind === K_ELE ? 7 : heavy.kind === K_CHR ? 8 : 5;
      let dmg = relv * mult * randRange(0.5, 1.2) * (enemies ? 1 : 0.3);
      if (light.st.flinch > 0 || light.st.combat < 0.3) dmg *= 1.15;
      // big, braced, skilful men keep their feet against a weaker impact
      const stability = light.stats.size * (1 + light.defBonus) * (light.st.brace > 0.3 ? 1.6 : 1) * (0.6 + 0.4 * light.stamina);
      if (relv < 4.2 * stability && heavy.kind === K_CAV) {
        light.hp -= dmg * 0.4;
        light.st.flinch = 1; light.st.action = ACT_NONE;
        light.vx += hx * relv * 0.6; light.vz += hz * relv * 0.6;
        heavy.vx -= hx * relv * 0.25; heavy.vz -= hz * relv * 0.25;
        if (light.hp <= 0) this.killInf(light, light.vx, 0.5, light.vz, 0, 0, 0, -0.4);
        return false;
      }
      const k = randRange(0.55, 1.0);
      const up = randRange(1.2, 2.2) + relv * 0.26 * (heavy.kind === K_ELE ? 1.4 : 1);
      const side = heavy.kind === K_ELE ? 0.8 : 0.4;
      const bvx = hvx * k + hx * relv * side, bvz = hvz * k + hz * relv * side;
      light.hp -= dmg;
      if (fx) { fx.dustBurst(light.x, light.y + 0.3, light.z, 4, 1); if (dmg > 40) fx.blood(light.x, light.y + 1.2, light.z, bvx, bvz, 6); }
      if (light.hp <= 0) { this.killInf(light, bvx, up, bvz, 0, 0, 0, -0.5); this.emit('death', light); }
      else this.knockDown(light, bvx, up, bvz, -0.5);
      this.moraleEvent(light, -0.04, 5);
      const loss = relv * (light.mass / heavy.mass) * (heavy.kind === K_ELE ? 1.2 : 2.2);
      heavy.vx -= hx * loss; heavy.vz -= hz * loss;
      heavy.hits++;
      this.emit('crash', heavy);
      return true;
    }
    if (ratio <= 3 && a.kind !== K_INF && b.kind !== K_INF && a.kind !== K_DOG && b.kind !== K_DOG) {
      if (enemies && relv > 5) {
        const dmg = relv * relv * 0.6;
        this.damageMount(light, dmg * randRange(0.6, 1.4) * ratio, hx, hz);
        this.damageMount(heavy, dmg * randRange(0.3, 0.9) / ratio, -hx, -hz);
        if (heavy.kind === K_CAV) heavy.q.rear = 1;
        if (light.kind === K_CAV) light.q.rear = 1;
        this.emit('crash', heavy);
      }
      return false;
    }
    if (a.kind === K_INF && b.kind === K_INF && enemies && relv > 3.2 && a.state === S_ALIVE && b.state === S_ALIVE) {
      const stab = (u, sign) => u.mass * randRange(0.6, 1.4) * (1 + u.st.brace + (u.shield === SH_RECT ? 0.3 : 0) + u.defBonus) *
        (1 + Math.max(0, sign * (u.vx * nx + u.vz * nz)) * 0.15) * (0.6 + 0.4 * u.stamina);
      const sa = stab(a, 1), sb = stab(b, -1);
      const loser = sa > sb ? b : a, winner = loser === a ? b : a;
      const px = loser === b ? nx : -nx, pz = loser === b ? nz : -nz;
      if (fx) fx.dustBurst((a.x + b.x) / 2, a.y + 0.4, (a.z + b.z) / 2, 2, 0.6);
      this.emit('clash', loser);
      if (relv > 5.5 && rand() < 0.35) {
        loser.hp -= randRange(5, 15);
        const bvx = winner.vx * 0.5 + px * relv * 0.35, bvz = winner.vz * 0.5 + pz * relv * 0.35;
        if (loser.hp <= 0) this.killInf(loser, bvx, 1.2, bvz, px * 1.5, 0, pz * 1.5, 0.6);
        else this.knockDown(loser, bvx, 1.2, bvz, 0.6);
        winner.st.flinch = Math.max(winner.st.flinch, 0.35);
        winner.vx *= 0.5; winner.vz *= 0.5;
        return true;
      }
      loser.st.flinch = 1; loser.st.action = ACT_NONE;
      loser.vx += px * relv * 0.6; loser.vz += pz * relv * 0.6;
      winner.st.flinch = Math.max(winner.st.flinch, 0.4);
      return false;
    }
    return false;
  }

  // ------------------------------------------------------------- damage
  resolveMelee(att, ax, az, t, weapon, dmgMul, mounted) {
    const W = WEAPONS[weapon];
    // the man on the high ground hits harder
    if (this.stage.hilly && att) dmgMul *= 1 + clamp((att.y - t.y) * 0.04, -0.12, 0.16);
    let dx = t.x - ax, dz = t.z - az;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const fx = this.fx;
    const tfx = Math.sin(t.heading), tfz = Math.cos(t.heading);
    const facing = -(tfx * dx + tfz * dz);
    if (t.kind === K_INF) {
      if (t.state === S_ALIVE && facing > 0.3 && !t.swimming && !(t.st.action === ACT_ATTACK && t.st.actionT > 0.3)) {
        let pb;
        if (t.shield !== SH_NONE) pb = 0.3 + 0.35 * t.st.combat + (t.shield === SH_RECT ? 0.1 : t.shield === SH_SMALL ? -0.08 : 0);
        else pb = WEAPONS[t.weapon].reach < 1.2 ? 0.1 + 0.15 * t.st.combat : 0.05;
        pb += t.defBonus;
        pb *= 0.65 + 0.35 * t.stamina;
        if (mounted) pb *= 0.6;
        if (weapon === W_SPEAR || weapon === W_PIKE) pb *= 0.85;
        const TW = WEAPONS[t.weapon];
        if (TW.closeDist && l < TW.closeDist) pb *= 0.6;
        if (rand() < pb) {
          t.st.start(ACT_BLOCK, 0.45);
          t.st.flinch = Math.max(t.st.flinch, 0.3);
          t.stamina -= 0.015;
          t.vx += dx * 0.9; t.vz += dz * 0.9;
          if (fx) fx.sparks(t.x - dx * 0.4, t.y + 1.25, t.z - dz * 0.4, 5);
          if (W.shieldBreak && t.shield !== SH_NONE && rand() < W.shieldBreak * 0.3) { t.shield = SH_NONE; this.emit('shieldbreak', t); }
          this.emit('block', t);
          return;
        }
      }
      let dmg = randRange(W.dmg[0], W.dmg[1]) * dmgMul * (facing < -0.3 ? 1.5 : 1);
      if (W.closeDist && !mounted && l < W.closeDist) dmg *= W.closeMul;
      if (facing < -0.3) this.moraleHit(t, -0.05);
      this.damageInf(t, dmg, dx, dz, mounted ? 3.2 : 2.2, att, W.knock);
    } else {
      const dmg = randRange(W.dmg[0], W.dmg[1]) * dmgMul;
      const reachRider = t.kind === K_CAV || (t.kind === K_CHR && rand() < 0.5) || t.kind === K_ENG;
      const alive = t.crew ? t.crew.map((c, i) => (c.alive ? i : -1)).filter(i => i >= 0) : [];
      if (reachRider && alive.length && rand() < (W.antiCav ? 0.35 : 0.5)) {
        this.damageCrew(t, t.kind === K_CAV ? 0 : alive[Math.floor(rand() * alive.length)], dmg, dx, dz);
      } else {
        let k = t.kind === K_ELE ? 0.45 : t.kind === K_ENG ? 0.3 : t.kind === K_DOG ? 1.2 : 0.55;
        if (t.T.barding) k *= 0.6;
        this.damageMount(t, dmg * k * (W.antiCav ? 1.6 : 1), dx, dz);
      }
      if (fx) fx.blood(t.x, t.y + 1.1, t.z, dx, dz, 4);
    }
  }

  damageInf(t, dmg, dx, dz, force, att, knock = 0) {
    t.hp -= dmg;
    t.lastHitT = this.time;
    if (this.fx) this.fx.blood(t.x, t.y + 1.2, t.z, dx * 1.5, dz * 1.5, dmg > 40 ? 8 : 4);
    this.moraleHit(t, -0.02);
    if (t.hp <= 0) {
      if (att) { this.kills[att.team]++; if (att.kind === K_INF) att.morale = Math.min(1.2, att.morale + 0.04); }
      const r = rand();
      if (r < 0.3) this.killInf(t, t.vx * 0.3, 0, t.vz * 0.3, dx * 0.5, 0, dz * 0.5, 0.2);
      else if (r < 0.8) this.killInf(t, t.vx * 0.4, 0.5, t.vz * 0.4, dx * force, 0.4, dz * force, 0.7);
      else this.killInf(t, t.vx * 0.5, 0.3, t.vz * 0.5, -dx * 0.8 + dz * 1.2, 0.2, -dz * 0.8 - dx * 1.2, 0.6);
      this.emit('death', t);
    } else if (knock && rand() < knock * (1.4 - t.stats.size * 0.5)) {
      this.knockDown(t, dx * force, 0.8, dz * force, 0.6);
      this.emit('hurt', t);
    } else {
      t.st.flinch = 1;
      if (t.st.action === ACT_ATTACK && t.st.actionT < 0.45) t.st.action = ACT_NONE;
      t.vx += dx * 1.6; t.vz += dz * 1.6;
      this.emit('hurt', t);
    }
  }

  damageMount(t, dmg, dx, dz, cause) {
    if (t.state !== S_ALIVE) return;
    t.hp -= dmg;
    if (t.kind === K_CAV && dmg > 30 && rand() < 0.3) t.q.rear = 1;
    if (t.kind === K_ELE && t.mode !== 'panic') t.rage = 1;
    if (t.hp <= 0) this.killMount(t, dx, dz, cause);
  }

  damageCrew(t, ci, dmg, dx, dz) {
    const c = t.crew[ci];
    if (!c || !c.alive) return;
    c.hp -= dmg;
    c.st.flinch = 1;
    if (c.hp <= 0) {
      this.dismount(t, ci, dx * 2, 0.5, dz * 2, true);
      if (t.kind === K_CAV) {
        t.riderless = true; t.mode = 'riderless'; t.modeT = 0; t.dspd = 8;
        this.setTarget(t, null);
        this.emit('riderdeath', t);
      }
    }
  }

  poseForRagdoll(a) {
    const B = setBasisYaw(a.basis, a.x, a.y, a.z, a.heading);
    poseHuman(a.joints, a.st, a.weapon, a.shield, SEAT_GROUND, B);
  }

  killInf(a, vx, vy, vz, ix, iy, iz, topple) {
    if (a.state === S_DEAD || a.state === S_GONE) return;
    if (!a.rag) {
      if (a.state === S_GETUP && a.blendFrom) a.joints.set(a.blendFrom);
      else this.poseForRagdoll(a);
      a.rag = new Ragdoll(a.joints, a.weapon === W_BOW ? 'l' : 'r');
      this.ragList.push(a);
    }
    a.rag.kick(vx, vy, vz, ix, iy, iz, topple);
    a.state = S_DEAD; a.hp = 0;
    this.setTarget(a, null);
    a.vx = a.vz = 0;
    if (a.carry && this.engineering) this.engineering.dropCarry(a);
    this.moraleEvent(a, -0.035, 5);
    if (this.command) this.command.onDeath(a);
  }

  knockDown(a, vx, vy, vz, topple) {
    if (a.state !== S_ALIVE && a.state !== S_GETUP) return;
    if (a.state === S_GETUP && a.blendFrom) a.joints.set(a.blendFrom);
    else this.poseForRagdoll(a);
    a.rag = new Ragdoll(a.joints, a.weapon === W_BOW ? 'l' : 'r');
    a.rag.kick(vx, vy, vz, 0, 0, 0, topple);
    this.ragList.push(a);
    a.state = S_DOWN; a.downT = 0;
    this.setTarget(a, null);
    a.st.action = ACT_NONE;
    a.vx = a.vz = 0;
    if (a.carry && this.engineering) this.engineering.dropCarry(a);
  }

  getUp(a) {
    const p = a.rag.x;
    const st = this.stage;
    a.blendFrom = new Float32Array(p);
    a.x = p[J.PELVIS * 3]; a.z = p[J.PELVIS * 3 + 2];
    a.prevX = a.x; a.prevZ = a.z;
    a.y = st.floorAt(a.x, a.z);
    if (st.hasWater && st.WL - a.y > 1.3) { a.y = st.WL - 1.3; a.swimming = true; }
    const hx = p[J.HEAD * 3] - p[J.PELVIS * 3], hz = p[J.HEAD * 3 + 2] - p[J.PELVIS * 3 + 2];
    if (Math.hypot(hx, hz) > 0.2) a.heading = Math.atan2(hx, hz);
    a.rag = null;
    a.state = S_GETUP; a.getupT = 0;
    a.st.flinch = 0; a.st.run = 0; a.st.combat = 0.6;
    a.vx = a.vz = 0;
    a.stamina = Math.max(0, a.stamina - 0.1);
  }

  killMount(a, dx, dz, cause) {
    if (a.state === S_DEAD) return;
    a.state = S_DEAD; a.hp = 0;
    this.setTarget(a, null);
    const rx = -Math.cos(a.heading), rz = Math.sin(a.heading);
    a.rollSide = (dx * rx + dz * rz) >= 0 ? 1 : -1;
    if (rand() < 0.3) a.rollSide = -a.rollSide;
    a.rollPivot = a.kind === K_ELE ? 1.0 : a.kind === K_CHR ? 0.75 : a.kind === K_DOG ? 0.15 : 0.42;
    if (a.kind === K_CAV && a.T.animal === 'camel') a.rollPivot = 0.5;
    a.rollV = cause === 'impale' ? 1.8 : 0.4;
    a.dieT = 0;
    const sp = Math.hypot(a.vx, a.vz);
    if (a.crew) for (let i = 0; i < a.crew.length; i++) {
      if (!a.crew[i].alive) continue;
      if (a.kind === K_ENG) { this.dismount(a, i, 0, 0.3, 0, false); continue; }
      this.dismount(a, i, a.vx * 0.9, randRange(1.5, 3) + sp * 0.12, a.vz * 0.9, rand() < 0.25 + sp * 0.02);
    }
    this.moraleEvent(a, a.kind === K_ELE ? -0.1 : -0.04, a.kind === K_ELE ? 15 : 6);
    this.emit('mountdeath', a);
    if (this.command) this.command.onDeath(a);
  }

  dismount(a, ci, vx, vy, vz, dies) {
    const c = a.crew[ci];
    c.alive = false;
    computeMount(a);
    const joints = computeCrew(a, ci);
    const type = c.weapon === W_BOW ? 'archer' : c.weapon === W_SPEAR ? 'spear' : c.weapon === W_HAMMER ? 'engineer' : 'sword';
    const n = new Agent(a.team, type, a.reg);
    n.look = c.look; n.shield = SH_NONE; n.weapon = c.weapon;
    n.stats = c.stats; n.name = c.name;
    n.maxHp = c.maxHp; n.hp = Math.max(1, c.hp);
    n.x = joints[0]; n.z = joints[2]; n.heading = a.heading;
    n.joints.set(joints);
    n.skirmish = true;
    n.st.scale = c.st.scale;
    this.addAgent(n);
    n.y = this.stage.floorAt(n.x, n.z);
    a.reg.agents.push(n);
    n.rag = new Ragdoll(n.joints, n.weapon === W_BOW ? 'l' : 'r');
    n.rag.kick(vx, vy, vz, 0, 0, 0, a.kind === K_CAV ? 0.5 : 0.2);
    this.ragList.push(n);
    if (dies) { n.state = S_DEAD; n.hp = 0; }
    else { n.state = S_DOWN; n.hp -= randRange(10, 50); n.downT = 0; if (n.hp <= 0) n.state = S_DEAD; }
    if (this.command) this.command.onDeath(a);
    return n;
  }

  // ------------------------------------------------------------- morale
  moraleHit(a, d) { a.morale += d * (1.35 - a.baseMorale * 0.5); }
  moraleEvent(a, d, R) {
    const n = this.query(a.x, a.z, R);
    const A = this.agents, q = this.qbuf;
    for (let k = 0; k < n; k++) {
      const t = A[q[k]];
      if (t.team !== a.team || t === a) continue;
      this.moraleHit(t, d);
    }
  }

  // ------------------------------------------------------------- missiles
  fireMissile(ox, oy, oz, t, high, team, type = P_ARROW, dmgMul = 1) {
    let tx = t.x, tz = t.z;
    const ty = t.y + (t.kind === K_INF ? 1.1 : 1.6);
    let theta = 0.5, v = 50;
    const vLow = type === P_JAV ? 24 : type === P_STONE ? 46 : type === P_BOLT ? 72 : type === P_ROCK ? 45 : 55;
    for (let it = 0; it < 2; it++) {
      const D = Math.max(1, Math.hypot(tx - ox, tz - oz));
      const H = ty - oy;
      if (high) {
        theta = type === P_ROCK ? randRange(0.7, 0.85) : randRange(0.6, 0.8);
        const den = 2 * Math.cos(theta) ** 2 * (D * Math.tan(theta) - H);
        v = den > 0.1 ? Math.sqrt(G * D * D / den) : 40;
      } else {
        v = vLow;
        const v2 = v * v, disc = v2 * v2 - G * (G * D * D + 2 * H * v2);
        theta = disc > 0 ? Math.atan((v2 - Math.sqrt(disc)) / (G * D)) : 0.7;
      }
      const T = D / (v * Math.cos(theta));
      tx = t.x + t.vx * T * 0.8; tz = t.z + t.vz * T * 0.8;
    }
    v = Math.min(v, 85) * randRange(0.97, 1.03);
    const spread = type === P_ROCK ? 0.03 : high ? 0.035 : type === P_JAV ? 0.03 : 0.015;
    const yaw = Math.atan2(tx - ox, tz - oz) + randRange(-1, 1) * spread / this.env.acc;
    theta += randRange(-1, 1) * 0.02 / this.env.acc;
    const h = v * Math.cos(theta);
    this.proj.spawn(ox, oy, oz, Math.sin(yaw) * h, v * Math.sin(theta), Math.cos(yaw) * h, team, type, dmgMul);
    this.emit(type === P_ROCK ? 'onager' : type === P_STONE ? 'sling' : type === P_JAV ? 'javelin' : 'arrow');
    return theta;
  }
  aimPitch(a, t, high) {
    const d = Math.hypot(t.x - a.x, t.z - a.z) || 1;
    if (high) return clamp(0.55 + d * 0.0012, 0.55, 0.8);
    return clamp(Math.atan2(G * d, 2 * 55 * 55) + Math.atan2(t.y - a.y, d), -0.6, 0.45);
  }

  missileHit(ax, ay, az, vx, vy, vz, team, type, dmgMul) {
    const P = PROJ[type];
    const n = this.query(ax, az, 2.5);
    const A = this.agents, q = this.qbuf;
    for (let k = 0; k < n; k++) {
      const t = A[q[k]];
      if ((t.team === team && type !== P_ROCK) || (!isActive(t) && !t.riderless)) continue;
      const hy = ay - t.y;
      if (t.kind === K_INF) {
        const top = 1.8 * t.st.scale;
        if (hy < 0 || hy > top) continue;
        if (Math.hypot(ax - t.x, az - t.z) > (type === P_ROCK ? 0.8 : 0.36)) continue;
        if (type === P_ROCK) return 'rock';
        const l = Math.hypot(vx, vz) || 1;
        const dx = vx / l, dz = vz / l;
        const facing = -(Math.sin(t.heading) * dx + Math.cos(t.heading) * dz);
        if (t.shield !== SH_NONE && facing > 0.1) {
          let pb = 0.45 + t.st.brace * 0.2 + t.st.combat * 0.1 + (t.shield === SH_RECT ? 0.15 : t.shield === SH_SMALL ? -0.12 : 0) + t.defBonus * 0.5;
          if (vy < -15) pb += 0.15;
          if (t.reg.formation === 'tight') pb += 0.2; // shields locked overhead
          if (rand() < pb * P.shield) { if (this.fx) this.fx.sparks(ax, ay, az, 2); return 'shield'; }
        }
        // men carrying a ladder shelter under it
        if (t.carry && rand() < 0.85) { if (this.fx) this.fx.sparks(ax, ay, az, 1); return 'shield'; }
        const dmg = randRange(P.dmg[0], P.dmg[1]) * dmgMul * (hy > 1.5 ? 1.4 : 1);
        t.hp -= dmg;
        t.lastHitT = this.time;
        this.moraleHit(t, -0.03);
        if (this.fx) this.fx.blood(ax, ay, az, dx, dz, 4);
        if (t.hp <= 0) {
          this.kills[team]++;
          const f = type === P_JAV || type === P_BOLT ? 2.4 : 1.6;
          this.killInf(t, t.vx * 0.5, 0.2, t.vz * 0.5, dx * f, 0.2, dz * f, rand() < 0.5 ? 0.8 : 0.1);
          this.emit('death', t);
        } else if (P.knock && rand() < P.knock) this.knockDown(t, dx * 2, 0.5, dz * 2, 0.6);
        else t.st.flinch = 0.8;
        return 'body';
      }
      const d = this.distTo({ x: ax, z: az }, t);
      if (d > t.radius + 0.1) continue;
      const topH = t.kind === K_ELE ? 5.2 : t.kind === K_CAV ? (t.T.animal === 'camel' ? 3.2 : 2.5) : t.kind === K_DOG ? 0.8 : t.kind === K_ENG ? 3.2 : 2.4;
      if (hy < 0 || hy > topH) continue;
      if (type === P_ROCK) return 'rock';
      if (t.kind === K_ENG) {
        if (rand() < 0.93) { if (this.fx) this.fx.sparks(ax, ay, az, 1); return 'shield'; }
        const alive = t.crew.map((c, i) => (c.alive ? i : -1)).filter(i => i >= 0);
        if (alive.length) this.damageCrew(t, alive[Math.floor(rand() * alive.length)], randRange(35, 70), 0, 0);
        return 'body';
      }
      const crewH = t.kind === K_ELE ? 3.4 : t.kind === K_CAV ? (t.T.animal === 'camel' ? 2.2 : 1.6) : 1.3;
      if (t.crew && t.crew.length && hy > crewH) {
        const alive = t.crew.map((c, i) => (c.alive ? i : -1)).filter(i => i >= 0);
        if (alive.length && rand() < 0.7) {
          this.damageCrew(t, alive[Math.floor(rand() * alive.length)], randRange(P.dmg[0], P.dmg[1]) * dmgMul, vx * 0.05, vz * 0.05);
          return 'body';
        }
      }
      let km = t.kind === K_ELE ? 0.3 : 0.7;
      if (t.T.barding) km *= 0.45;
      this.damageMount(t, randRange(P.dmg[0], P.dmg[1]) * 0.6 * km * dmgMul, vx * 0.05, vz * 0.05);
      return 'body';
    }
    return null;
  }

  // onager rock: bodies thrown around the impact point
  rockImpact(x, y, z, vx, vz) {
    const R = PROJ[P_ROCK].splash;
    const n = this.query(x, z, R + 1);
    const A = this.agents, q = this.qbuf;
    const hit = [];
    for (let k = 0; k < n; k++) hit.push(A[q[k]]);
    for (const t of hit) {
      if (!isActive(t) || Math.abs(t.y - y) > 3) continue;
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
      if (d > R) continue;
      const f = 1 - d / R;
      const nx = d > 0.01 ? dx / d : 0, nz = d > 0.01 ? dz / d : 0;
      if (t.kind === K_INF) {
        t.hp -= randRange(60, 150) * f;
        const bvx = nx * 7 * f + vx * 0.08, bvz = nz * 7 * f + vz * 0.08;
        if (t.hp <= 0) { this.killInf(t, bvx, 3 * f + 1, bvz, 0, 0, 0, -0.3); this.emit('death', t); }
        else this.knockDown(t, bvx, 3 * f + 1, bvz, -0.3);
      } else this.damageMount(t, randRange(60, 160) * f, nx, nz);
    }
    const st = this.stage;
    for (const g of st.gates) {
      if (!g.alive) continue;
      if (x > g.x0 - 3 && x < g.x1 + 3 && z > g.z0 - 3 && z < g.z1 + 3) {
        g.hp -= randRange(80, 160);
        if (g.hp <= 0 && this.engineering) this.engineering.breakGate(g);
      }
    }
    if (this.fx) { this.fx.dustBurst(x, y + 0.3, z, 16, 2.2); if (st.hasWater && st.WL > y - 0.2) this.fx.splash(x, st.WL, z, 12); }
    this.spawnDebris(x, y + 0.4, z, 5, 0.25, st.floorAt(x, z) > 3 ? 0x8a8478 : 0x6a5a40);
    this.emit('rock', { x, z });
  }

  // ------------------------------------------------------------- debris (splinters, planks, stones)
  spawnDebris(x, y, z, n, size, color, vel = 5) {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const sp = randRange(0.3, 1) * vel;
      this.debris.push({
        x, y, z, vx: Math.cos(a) * sp, vy: randRange(2, 6), vz: Math.sin(a) * sp,
        ax: rand() * TAU, av: randRange(-8, 8), len: size * randRange(1, 3), w: size * randRange(0.3, 0.8), color, t: 0, rest: false,
      });
    }
    if (this.debris.length > 1500) this.debris.splice(0, this.debris.length - 1500);
  }
  stepDebris(dt) {
    const st = this.stage;
    for (const d of this.debris) {
      if (d.rest) continue;
      d.t += dt;
      d.vy -= G * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.ax += d.av * dt;
      const g = st.floorAt(d.x, d.z);
      if (d.y < g) {
        d.y = g; d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; d.av *= 0.5;
        if (Math.abs(d.vy) < 0.5) d.rest = true;
      }
      if (st.hasWater && d.y < st.WL) { d.vx *= 0.9; d.vz *= 0.9; d.vy = Math.max(d.vy, -1); }
    }
  }

  counts() {
    const c = [0, 0];
    for (const r of this.regs) if (r.order !== 'rout') c[r.team] += r.alive;
    return c;
  }
}

export { K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG };
