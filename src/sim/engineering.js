// Engineers and siege engines: stakes, ladders, rams, onagers, bridges and pontoons.
import { clamp, lerp, rand, randRange, wrapAngle } from '../util.js';
import { ACT_NONE, ACT_WORK } from '../anim/human.js';
import { K_INF, K_ENG, P_ROCK } from './defs.js';
import { isActive, S_ALIVE } from './agent.js';

export class Engineering {
  constructor(world) {
    this.w = world;
    this.stage = world.stage;
    this.tasks = [];
  }

  // ------------------------------------------------------------ task assignment
  assign(reg, spec) {
    const st = this.stage, w = this.w;
    // cancel previous task of this unit
    for (const t of this.tasks) if (t.reg === reg) t.cancelled = true;
    for (const a of reg.agents) { if (a.job) this.release(a); }
    if (spec.type === 'ram') { for (const a of reg.agents) if (a.kind === K_ENG) a.mode = 'approach'; return; }
    if (spec.type === 'onager') { reg.targetReg = spec.target || null; return; }
    let task = null;
    if (spec.type === 'stakes') {
      const f = spec.facing, fx = Math.sin(f), fz = Math.cos(f), rx = -fz, rz = fx;
      const n = clamp(Math.round(spec.count || reg.alive * 2), 6, 40);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const row = i % 2, k = Math.floor(i / 2);
        const lx = (k - (n / 2 - 1) / 2) * 2.4 + row * 1.2;
        const lz = row * 1.6;
        pts.push({ x: spec.x + rx * lx + fx * lz, z: spec.z + rz * lx + fz * lz, h: f, prog: 0, done: false, taken: null });
      }
      task = { type: 'stakes', pts, reg };
    } else if (spec.type === 'ladder') {
      const C = st.city;
      if (!C) return;
      const xs = spec.xs || [spec.x];
      task = { type: 'ladders', reg, list: [] };
      for (const x0 of xs) {
        const x = Math.round(x0 / 2) * 2 + 1;
        const l = st.addLadder(x, reg.team);
        l.cx = reg.cx + randRange(-3, 3); l.cz = reg.cz; l.goalX = x; l.goalZ = C.z0 - 4;
        l.carriers = [];
        task.list.push(l);
      }
    } else if (spec.type === 'demolish') {
      const b = spec.bridge;
      if (!b || !b.alive || !b.wood) return;
      const side = reg.cz < b.zc ? -1 : 1;
      task = { type: 'demolish', reg, bridge: b, prog: 0, spotZ: b.zc + side * (st.river.half + 4), side };
    } else if (spec.type === 'pontoon') {
      if (!st.river) return;
      const p = st.startPontoon(spec.x, reg.team);
      task = { type: 'pontoon', reg, pont: p };
    }
    if (task) { this.tasks.push(task); w.emit('task', task); }
    reg.task = task;
  }
  release(a) {
    const j = a.job;
    if (!j) return;
    if (j.pt && j.pt.taken === a) j.pt.taken = null;
    if (j.ladder) j.ladder.carriers = j.ladder.carriers.filter(c => c !== a);
    a.job = null; a.carry = null;
    if (a.st && a.st.action === ACT_WORK) a.st.action = ACT_NONE;
  }
  dropCarry(a) { this.release(a); }

  // ------------------------------------------------------------ per step
  update(dt) {
    const w = this.w, st = this.stage;
    for (const task of this.tasks) {
      if (task.cancelled || task.done) continue;
      const reg = task.reg;
      if (reg.alive === 0) { task.cancelled = true; continue; }
      // hand out jobs to idle engineers
      for (const a of reg.agents) {
        if (!isActive(a) || a.kind !== K_INF || a.job || a.fleeing || a.target) continue;
        this.giveJob(task, a);
      }
      if (task.type === 'stakes' && task.pts.every(p => p.done)) { task.done = true; this.finish(task); }
      if (task.type === 'ladders') this.updateLadderTask(task, dt);
      if (task.type === 'pontoon' && task.pont.done) { task.done = true; this.finish(task); w.emit('pontoon', task.pont); }
    }
    this.tasks = this.tasks.filter(t => !t.cancelled && !t.done);
    // ladders: raising, falling, being pushed off by defenders
    for (const l of st.ladders) {
      if (l.state === 'raising') {
        l.t += dt / 2.5; l.angle = clamp(l.t, 0, 1);
        if (l.t >= 1) { st.raiseLadder(l); w.emit('ladder', l); for (const c of l.carriers) this.release(c); }
      } else if (l.state === 'falling') {
        l.t += dt;
        l.angle = 1 - Math.min(1.25, l.t * l.t * 1.8);
        if (l.angle <= -0.25) { l.state = 'fallen'; l.angle = -0.25; w.emit('thud', { x: l.x, z: l.z0 }); if (w.fx) w.fx.dustBurst(l.x, st.floorAt(l.x, l.z0 - 3), l.z0 - 3, 8, 1.2); }
      } else if (l.state === 'up') this.ladderDefence(l, dt);
    }
  }

  giveJob(task, a) {
    if (task.type === 'stakes') {
      let best = null, bd = 1e9;
      for (const p of task.pts) {
        if (p.done || p.taken) continue;
        const d = Math.hypot(p.x - a.x, p.z - a.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) { best.taken = a; a.job = { task, pt: best }; }
    } else if (task.type === 'ladders') {
      for (const l of task.list) {
        if ((l.state === 'carried' || l.state === 'fallen' || l.state === 'dropped') && l.carriers.length < 4) {
          l.carriers.push(a); a.job = { task, ladder: l, slot: l.carriers.length - 1 };
          if (l.state !== 'carried') { l.state = 'carried'; l.angle = 0; }
          return;
        }
      }
    } else if (task.type === 'demolish' || task.type === 'pontoon') {
      a.job = { task, off: randRange(-1.6, 1.6) };
    }
  }
  finish(task) {
    for (const a of task.reg.agents) if (a.job && a.job.task === task) this.release(a);
    task.reg.task = null;
  }

  // ------------------------------------------------------------ workers
  // returns true when the worker's behaviour was handled here
  thinkWorker(a, dt) {
    const j = a.job, task = j.task, w = this.w, st = this.stage;
    if (task.cancelled || task.done) { this.release(a); return false; }
    const near = w.nearestEnemy(a, 2.5);
    if (near) { this.release(a); return false; } // drop tools and defend yourself
    let gx, gz, face, working = false;
    if (task.type === 'stakes') {
      const p = j.pt;
      if (p.done) { this.release(a); return false; }
      gx = p.x - Math.sin(p.h) * 0.9; gz = p.z - Math.cos(p.h) * 0.9; face = p.h;
      working = Math.hypot(gx - a.x, gz - a.z) < 0.8;
    } else if (task.type === 'ladders') {
      const l = j.ladder;
      if (l.state === 'up' || l.state === 'falling') { this.release(a); return false; }
      a.carry = l.state === 'carried' ? l : null;
      const k = l.carriers.indexOf(a);
      const side = k % 2 ? 0.55 : -0.55, along = k < 2 ? 1.6 : -1.6;
      gx = l.cx + side; gz = l.cz + along; face = 0;
      if (l.state === 'raising') { gx = l.x + side; gz = l.z0 - 1.2 - (k < 2 ? 0 : 0.9); a.carry = l; }
      if (l.state === 'dropped' || l.state === 'fallen') { gx = l.cx + side; gz = l.cz + along; }
    } else if (task.type === 'demolish') {
      const b = task.bridge;
      if (!b.alive) { task.done = true; this.finish(task); return false; }
      gx = b.cx + j.off * b.width * 0.3; gz = task.spotZ; face = task.side > 0 ? Math.PI : 0;
      working = Math.hypot(gx - a.x, gz - a.z) < 1.2;
    } else if (task.type === 'pontoon') {
      const p = task.pont;
      const tip = p.z0 + p.dir * p.len;
      gx = p.x + j.off; gz = tip - p.dir * (1.2 + Math.abs(j.off)); face = p.dir > 0 ? 0 : Math.PI;
      working = Math.hypot(gx - a.x, gz - a.z) < 1.3;
    }
    const dx = gx - a.x, dz = gz - a.z, d = Math.hypot(dx, dz);
    if (working) {
      a.dvx = dx; a.dvz = dz;
      a.faceH = face;
      if (a.st.action === ACT_NONE) a.st.start(ACT_WORK, randRange(0.75, 0.95));
      a.stamina = Math.max(0, a.stamina - dt * 0.004);
      return true;
    }
    const p = w.steerTo(a, gx, gz, 0, dt) || [gx, gz];
    const ex = p[0] - a.x, ez = p[1] - a.z, el = Math.hypot(ex, ez) || 1;
    const v = a.carry ? Math.min(3, d * 2) : Math.min((a.T.run || 5) * 0.8, d * 1.5 + 0.5);
    a.dvx = ex / el * v; a.dvz = ez / el * v;
    if (d < 1) a.faceH = face;
    return true;
  }
  // each hammer blow advances the job
  workBlow(a) {
    const j = a.job, w = this.w, st = this.stage;
    if (!j) return;
    const task = j.task;
    const skill = 0.7 + a.stats.str / 200;
    w.emit('work', a);
    if (task.type === 'stakes') {
      const p = j.pt;
      p.prog += 0.22 * skill;
      if (p.prog >= 1 && !p.done) { p.done = true; st.addStake(p.x, p.z, p.h); this.release(a); }
    } else if (task.type === 'demolish') {
      task.prog += 0.007 * skill;
      if (w.fx && rand() < 0.3) w.fx.dust(a.x, a.y + 0.5, a.z, 0.4);
      if (task.prog >= 1) this.collapseBridge(task.bridge, task);
    } else if (task.type === 'pontoon') {
      st.growPontoon(task.pont, 0.14 * skill);
    }
  }

  collapseBridge(b, task) {
    const st = this.stage, w = this.w;
    st.destroyBridge(b);
    for (let z = b.z0; z < b.z1; z += 1.5) w.spawnDebris(b.cx + randRange(-2, 2), 0.4, z, 1, 0.6, 0x7a5a38, 2);
    if (w.fx) for (let z = b.z0; z < b.z1; z += 3) w.fx.splash(b.cx, st.WL, z, 6);
    w.emit('bridge', b);
    if (task) { task.done = true; this.finish(task); }
  }

  // ------------------------------------------------------------ ladders
  updateLadderTask(task, dt) {
    for (const l of task.list) {
      if (l.state !== 'carried') continue;
      const car = l.carriers.filter(c => isActive(c) && c.job && c.job.ladder === l);
      l.carriers = car;
      if (car.length < 2) { if (car.length === 0 && l.cz !== l.goalZ) l.state = 'dropped'; continue; }
      // advance when the carriers are at their handles
      let ok = 0;
      for (const [k, c] of car.entries()) {
        const side = k % 2 ? 0.55 : -0.55, along = k < 2 ? 1.6 : -1.6;
        if (Math.hypot(l.cx + side - c.x, l.cz + along - c.z) < 1.9) ok++;
      }
      if (ok < Math.min(2, car.length)) continue;
      const nav = this.w.nav;
      const dx = l.goalX - l.cx, dz = l.goalZ - l.cz, d = Math.hypot(dx, dz);
      const v = 2.4 * dt * (car.length / 4 + 0.25);
      if (d < 0.5) { l.state = 'raising'; l.t = 0; l.cx = l.goalX; l.cz = l.goalZ; this.w.emit('raising', l); continue; }
      let mx = dx / d * v, mz = dz / d * v;
      if (!nav.trivial) {
        // route the ladder around obstacles with the first carrier's path
        const p = this.w.steerTo(car[0], l.goalX, l.goalZ, 0, dt);
        if (p) { const ex = p[0] - l.cx, ez = p[1] - l.cz, el = Math.hypot(ex, ez) || 1; mx = ex / el * v; mz = ez / el * v; }
      }
      l.cx += mx; l.cz += mz;
    }
  }
  // defenders at the top shove unmanned ladders away
  ladderDefence(l, dt) {
    const w = this.w, C = this.stage.city;
    const n = w.query(l.x, C.z0 + 0.5, 3);
    let def = 0, att = 0;
    for (let k = 0; k < n; k++) {
      const a = w.agents[w.qbuf[k]];
      if (!isActive(a) || a.kind !== K_INF) continue;
      if (a.team !== l.team && a.y > C.H - 1) def++;
      if (a.team === l.team && a.y > C.H - 2.5) att++;
    }
    if (def && !att) l.push = (l.push || 0) + dt * def;
    else l.push = Math.max(0, (l.push || 0) - dt * 2);
    if (l.push > 5) {
      l.push = 0;
      this.stage.dropLadder(l);
      w.emit('ladderfall', l);
      // anyone still on the rungs is thrown backwards by constrain()->fall()
      for (const a of w.agents) {
        if (a.state === S_ALIVE && a.kind === K_INF && Math.abs(a.x - l.x) < 1.2 && a.z > l.z0 - 0.5 && a.z < l.z1 + 0.2 && a.y > 1) {
          a.vx += randRange(-1, 1); a.vz -= 3.2;
        }
      }
    }
  }

  // ------------------------------------------------------------ engines
  thinkEngine(a, dt) {
    const w = this.w, st = this.stage, T = a.T;
    const crew = a.crew.filter(c => c.alive).length;
    const k = crew / T.crew;
    if (T.sub === 'ram') {
      const g = st.gates.find(x => x.alive);
      if (!g || crew === 0) {
        a.dspd = 0; a.dh = a.heading;
        if (!g && a.mode === 'batter') { a.mode = 'done'; a.px = a.x - 3; a.pz = a.z - 10; }
        if (a.mode === 'done') { const d = Math.hypot(a.px - a.x, a.pz - a.z); a.dh = Math.atan2(a.px - a.x, a.pz - a.z); a.dspd = d > 1 && crew ? T.max : 0; }
        return;
      }
      const gx = (g.x0 + g.x1) / 2, gz = g.z0 - 3.4;
      if (a.mode === 'approach') {
        const d = Math.hypot(gx - a.x, gz - a.z);
        const p = w.steerTo(a, gx, gz, 1, dt) || [gx, gz];
        a.dh = d > 2 ? Math.atan2(p[0] - a.x, p[1] - a.z) : 0;
        a.dspd = d > 0.6 ? T.max * Math.sqrt(k) : 0;
        if (d < 0.8) { a.mode = 'batter'; a.q.swing = 0; a.modeT = 0; }
      } else if (a.mode === 'batter') {
        a.dh = 0; a.dspd = 0;
        a.modeT += dt * (0.5 + 0.5 * k);
        const ph = a.modeT % 2.4;
        a.q.swing = ph < 1.8 ? -Math.sin(ph / 1.8 * Math.PI / 2) : -1 + (ph - 1.8) / 0.6 * 1.6;
        if (ph >= 2.2 && !a.hitDone) {
          a.hitDone = true;
          g.hp -= randRange(70, 110) * (0.4 + 0.6 * k);
          if (w.fx) { w.fx.dustBurst(gx, 1.5, g.z0, 8, 1); w.fx.sparks(gx, 2, g.z0 - 0.2, 6); }
          w.spawnDebris(gx, 2, g.z0 - 0.3, 3, 0.2, 0x6a4a2a, 3);
          w.emit('gatehit', g);
          if (g.hp <= 0) this.breakGate(g);
        }
        if (ph < 2.2) a.hitDone = false;
      } else { a.dspd = 0; a.dh = a.heading; }
      for (const c of a.crew) if (c.alive) c.st.push = 1;
      return;
    }
    if (T.sub === 'onager') {
      const reg = a.reg;
      a.dspd = 0; a.dh = a.heading;
      if (reg.order === 'move' || reg.order === 'hold') {
        // creep to formation slot
        const tmp = { x: 0, z: 0 };
        reg.slotPos(a.slot, tmp);
        const d = Math.hypot(tmp.x - a.x, tmp.z - a.z);
        if (d > 1.5 && crew > 1) { a.dh = Math.atan2(tmp.x - a.x, tmp.z - a.z); a.dspd = T.max; }
      }
      if (crew < 2 || w.phase !== 'battle') return;
      let tr = reg.targetReg && reg.targetReg.alive > 0 ? reg.targetReg : null;
      if (!tr) {
        let bd = T.range;
        for (const r of w.regs) {
          if (r.team === a.team || r.alive === 0) continue;
          const d = Math.hypot(r.cx - a.x, r.cz - a.z);
          if (d < bd && d > 25) { bd = d; tr = r; }
        }
      }
      if (!tr) return;
      a.dh = Math.atan2(tr.cx - a.x, tr.cz - a.z);
      a.fireT -= dt * k;
      a.q.swing = Math.max(0, a.q.swing - dt * 0.4);
      for (const c of a.crew) if (c.alive && c.st.action === ACT_NONE && a.fireT > 1) c.st.start(ACT_WORK, 0.9);
      if (a.fireT <= 0 && Math.abs(wrapAngle(a.dh - a.heading)) < 0.1) {
        a.fireT = randRange(7, 9.5);
        const t = tr.agents[Math.floor(rand() * tr.agents.length)];
        if (t && isActive(t)) {
          a.q.swing = 1;
          const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
          w.fireMissile(a.x + fx * 0.5, a.y + 3.2, a.z + fz * 0.5, t, true, a.team, P_ROCK);
        }
      }
    }
  }

  breakGate(g) {
    const w = this.w, st = this.stage;
    if (!g.alive) return;
    st.breakGate(g);
    const gx = (g.x0 + g.x1) / 2;
    for (let i = 0; i < 18; i++) w.spawnDebris(gx + randRange(-3, 3), randRange(1, 5), g.z0 + randRange(0, 3), 1, 0.5, 0x6a4a2a, 6);
    if (w.fx) w.fx.dustBurst(gx, 2, g.z0 + 1, 30, 3);
    for (const r of w.regs) {
      if (Math.hypot(r.cx - gx, r.cz - g.z0) > 90) continue;
      for (const a of r.agents) w.moraleHit(a, r.team === 1 ? -0.12 : 0.1);
    }
    w.emit('gatebreak', g);
  }
}
