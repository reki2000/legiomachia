// Chain of command: general -> wing commanders -> regiment captains / standard bearers.
// Provides morale auras, shocks when leaders fall, and the hierarchical battle AI.
import { clamp, rand, randRange } from '../util.js';
import { W_BANNER, SH_NONE } from '../anim/human.js';
import { WEAPONS, K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, TEAM_FLAG } from './defs.js';
import { isActive } from './agent.js';

export class Army {
  constructor(team, name) {
    this.team = team; this.name = name;
    this.general = null; this.guard = null;
    this.wings = [];
    this.posture = 'attack';
    this.fwdX = 0; this.fwdZ = team === 0 ? 1 : -1;
  }
}
export class Wing {
  constructor(army, name, role = 'line') {
    this.army = army; this.name = name; this.role = role; // line | reserve | flank
    this.commander = null; this.regs = [];
    this.committed = role !== 'reserve';
    this.aiT = rand();
    this.cx = 0; this.cz = 0;
  }
}

export class Command {
  constructor(world) {
    this.w = world;
    this.auraT = 0; this.posT = 0; this.checkT = 0; this.genT = 0;
    this.started = false; this.deployDone = false;
    this.riverTrigger = false;
  }
  setup() {
    const w = this.w;
    w.eleRegs = [[], []]; w.camelRegs = [[], []];
    for (const r of w.regs) {
      if (r.kind === K_ELE) w.eleRegs[r.team].push(r);
      if (r.T.animal === 'camel') w.camelRegs[r.team].push(r);
    }
  }
  onDeath(a) { this.checkT = 0; }

  update(dt) {
    const w = this.w;
    this.auraT -= dt; this.posT -= dt; this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 0.5; this.checkLeaders(); }
    if (this.posT <= 0) { this.posT = 0.5; this.placeCommanders(); }
    if (this.auraT <= 0) { this.auraT = 1; this.auras(); }
    if (!this.deployDone && w.time > 0.3) { this.deployDone = true; this.deployTasks(); }
    if (w.phase !== 'battle') return;
    if (!this.started) { this.started = true; this.battleTasks(); }
    this.genT -= dt;
    for (const army of w.armies) {
      if (!army) continue;
      if (this.genT <= 0) this.generalAI(army);
      for (const wing of army.wings) {
        wing.aiT -= dt;
        if (wing.aiT > 0) continue;
        const alive = w.commanderAlive(wing.commander) || !wing.commander;
        wing.aiT = alive ? 1 : 3.5; // leaderless wings react slowly
        if (w.auto[army.team]) this.wingAI(army, wing);
        if (alive && wing.commander) wing.commander.pointT = 1.2;
      }
    }
    if (this.genT <= 0) this.genT = 3;
    this.stageTriggers();
  }

  // ------------------------------------------------------------ leaders
  checkLeaders() {
    const w = this.w;
    for (const army of w.armies) {
      if (!army) continue;
      const g = army.general;
      if (g && !g.deathNoted && !w.commanderAlive(g)) {
        g.deathNoted = true;
        for (const r of w.regs) if (r.team === army.team) for (const a of r.agents) w.moraleHit(a, -0.25);
        w.emit('generaldeath', g);
      }
      for (const wing of army.wings) {
        const c = wing.commander;
        if (c && !c.deathNoted && !w.commanderAlive(c)) {
          c.deathNoted = true;
          for (const r of wing.regs) for (const a of r.agents) w.moraleHit(a, -0.18);
          w.emit('officerdeath', c);
        }
      }
    }
    for (const r of w.regs) {
      if (r.alive === 0) continue;
      const cap = r.captain;
      if (cap && !cap.deathNoted && !isActive(cap) && cap.state !== 1 && cap.state !== 2) {
        cap.deathNoted = true;
        for (const a of r.agents) w.moraleHit(a, -0.13);
        w.emit('captaindeath', cap);
      }
      const b = r.bearer;
      if (b && !b.deathNoted && !isActive(b) && b.state !== 1 && b.state !== 2) {
        b.deathNoted = true;
        for (const a of r.agents) w.moraleHit(a, -0.1);
        w.emit('standardlost', r);
        r.bearerT = w.time + randRange(2, 4);
      }
      // someone picks up the fallen standard
      if (b && b.deathNoted && r.bearerT && w.time > r.bearerT && r.alive > 5 && r.order !== 'rout') {
        r.bearerT = 0;
        let best = null, bd = 1e9;
        for (const a of r.agents) {
          if (!isActive(a) || a === r.captain || a.kind !== K_INF || a.fleeing) continue;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < bd) { bd = d; best = a; }
        }
        if (best) {
          best.weapon = W_BANNER; best.shield = SH_NONE; best.bearer = true; best.look.flag = TEAM_FLAG[r.team];
          w.setTarget(best, null);
          r.bearer = best;
          for (const a of r.agents) w.moraleHit(a, 0.06);
          w.emit('standardraised', r);
        }
      }
    }
  }
  auras() {
    const w = this.w;
    for (const r of w.regs) {
      if (r.alive === 0) continue;
      let aura = 0;
      if (r.captain && isActive(r.captain)) aura += 0.06;
      if (r.bearer && isActive(r.bearer)) aura += 0.05;
      const wc = r.wing && r.wing.commander;
      if (wc && w.commanderAlive(wc) && Math.hypot(wc.x - r.cx, wc.z - r.cz) < 70) aura += 0.05;
      const army = w.armies[r.team];
      const g = army && army.general;
      if (g && w.commanderAlive(g) && Math.hypot(g.x - r.cx, g.z - r.cz) < 100) aura += 0.07;
      r.aura = aura;
    }
  }
  placeCommanders() {
    const w = this.w;
    for (const army of w.armies) {
      if (!army) continue;
      // army facing: towards the enemy's centre of mass
      let ex = 0, ez = 0, en = 0, ox = 0, oz = 0, on = 0;
      for (const r of w.regs) {
        if (r.alive === 0) continue;
        if (r.team === army.team) { ox += r.cx * r.alive; oz += r.cz * r.alive; on += r.alive; }
        else { ex += r.cx * r.alive; ez += r.cz * r.alive; en += r.alive; }
      }
      if (en && on) {
        const dx = ex / en - ox / on, dz = ez / en - oz / on, l = Math.hypot(dx, dz) || 1;
        army.fwdX = dx / l; army.fwdZ = dz / l;
      }
      const fx = army.fwdX, fz = army.fwdZ;
      for (const wing of army.wings) {
        let cx = 0, cz = 0, n = 0;
        for (const r of wing.regs) if (r.alive > 0 && r.kind !== K_ENG) { cx += r.cx; cz += r.cz; n++; }
        if (!n) continue;
        wing.cx = cx / n; wing.cz = cz / n;
        const c = wing.commander;
        if (c && isActive(c)) {
          const back = this.w.stage.city && army.team === 1 ? 6 : 26;
          c.px = wing.cx - fx * back; c.pz = wing.cz - fz * back;
          if (!w.nav.passable(c.px, c.pz, 1)) { c.px = wing.cx; c.pz = wing.cz; }
          c.faceTo = Math.atan2(fx, fz);
        }
      }
      const g = army.general;
      if (g && isActive(g)) {
        const center = army.wings.find(x => x.role === 'line' && x.name.includes('中')) || army.wings[0];
        const back = this.w.stage.city && army.team === 1 ? 20 : 48;
        g.px = center.cx - fx * back; g.pz = center.cz - fz * back;
        if (this.w.stage.city && army.team === 1) { g.px = 0; g.pz = this.w.stage.city.z1 + 25; }
        g.faceTo = Math.atan2(fx, fz);
      }
    }
  }

  // ------------------------------------------------------------ strategy
  generalAI(army) {
    const w = this.w;
    let own = 0, foe = 0, engaged = 0, lineMorale = 0, ln = 0;
    for (const r of w.regs) {
      if (r.alive === 0) continue;
      if (r.team === army.team) { own += r.alive; if (r.engaged) engaged++; if (r.wing && r.wing.role !== 'reserve') { lineMorale += r.morale; ln++; } }
      else foe += r.alive;
    }
    for (const wing of army.wings) {
      if (wing.role === 'reserve' && !wing.committed) {
        const m = ln ? lineMorale / ln : 1;
        if (w.time > 75 || (engaged > 1 && m < 0.55) || (army.posture === 'defend' && this.enemyInside(army))) {
          wing.committed = true;
          w.emit('reserve', wing);
        }
      }
    }
  }
  enemyInside(army) {
    const w = this.w, st = w.stage;
    if (!st.city) return false;
    for (const r of w.regs) if (r.team !== army.team && r.alive > 0 && st.insideCity(r.cx, r.cz)) return true;
    return !st.gates.every(g => g.alive);
  }

  wingAI(army, wing) {
    const w = this.w, st = w.stage;
    const claimed = new Map();
    for (const reg of wing.regs) {
      if (reg.manual || reg.alive === 0 || reg.order === 'rout' || reg.follow) continue;
      if (reg.kind === K_CAV && reg.T.commander) continue;
      const type = reg.type;
      const W = reg.kind === K_INF ? WEAPONS[reg.T.weapon] : null;
      if (type === 'engineer' || reg.kind === K_ENG) continue; // handled by stage tasks
      if (type === 'guard') { this.guardAI(army, reg); continue; }
      if (!wing.committed) { this.holdGround(reg); continue; }
      if (W && W.ranged && !W.ranged.ammo) { this.missileAI(army, reg); continue; }
      const defend = army.posture === 'defend';
      if (defend) {
        const e = this.nearestThreat(reg, st.city ? 30 : 50);
        if (e) { if (reg.order !== 'charge' || reg.targetReg !== e) w.orderCharge(reg, e); }
        else if (reg.order === 'charge' && (!reg.targetReg || reg.targetReg.alive === 0)) w.orderHold(reg);
        else if (st.city && army.team === 1) this.wallDefence(reg);
        continue;
      }
      if (army.posture === 'assault' && st.city) { this.assaultAI(army, reg); continue; }
      let pref = null;
      if (reg.kind === K_CAV || reg.kind === K_CHR || reg.kind === K_DOG) pref = r => (r.type === 'archer' || r.type === 'sling' || r.type === 'xbow' || r.kind !== K_INF ? 1 : r.type === 'spear' || r.type === 'pike' ? -2 : 0);
      else pref = r => -(claimed.get(r) || 0) * 0.4; // spread our regiments over theirs
      const e = w.nearestEnemyReg(reg, pref);
      if (!e) { if (reg.order === 'charge') w.orderHold(reg); continue; }
      claimed.set(e, (claimed.get(e) || 0) + 1);
      if (reg.order !== 'charge' || !reg.targetReg || reg.targetReg.alive === 0) {
        w.orderCharge(reg, e);
        if (reg.kind === K_CAV && e.kind === K_INF && !reg.T.skirm) this.planFlank(reg, e);
      } else if (reg.targetReg !== e && reg.kind === K_INF) {
        const dc = Math.hypot(reg.targetReg.cx - reg.cx, reg.targetReg.cz - reg.cz);
        const dn = Math.hypot(e.cx - reg.cx, e.cz - reg.cz);
        if (dn < dc * 0.6) reg.targetReg = e;
      }
    }
  }
  holdGround(reg) {
    const w = this.w;
    const e = this.nearestThreat(reg, 30);
    if (e) { if (reg.order !== 'charge') w.orderCharge(reg, e); }
    else if (reg.order === 'charge' && (!reg.targetReg || reg.targetReg.alive === 0)) w.orderHold(reg);
  }
  nearestThreat(reg, R) {
    let best = null, bd = R;
    for (const r of this.w.regs) {
      if (r.team === reg.team || r.alive === 0) continue;
      for (const a of r.agents) {
        if (!isActive(a)) continue;
        const d = Math.hypot(a.x - reg.cx, a.z - reg.cz) - reg.width * 0.5;
        if (d < bd && Math.abs(a.y - (reg.agents[0] ? reg.agents[0].y : a.y)) < 2) { bd = d; best = r; }
      }
    }
    return best;
  }
  missileAI(army, reg) {
    const w = this.w;
    const range = WEAPONS[reg.T.weapon].ranged.range;
    const e = w.nearestEnemyReg(reg, r => (r.kind === K_INF ? 0.2 : r.kind === K_ENG ? -1.5 : 0));
    if (!e) return;
    const d = Math.hypot(e.cx - reg.cx, e.cz - reg.cz);
    if (d < range - 5) { if (reg.order !== 'fire' || reg.targetReg !== e) w.orderFire(reg, e); }
    else if (army.posture === 'attack' && reg.order !== 'move') {
      const k = (d - range + 25) / d;
      const tx = reg.cx + (e.cx - reg.cx) * k, tz = reg.cz + (e.cz - reg.cz) * k;
      if (w.nav.passable(tx, tz, 0)) w.orderMove(reg, tx, tz);
    }
  }
  guardAI(army, reg) {
    const w = this.w, g = army.general;
    if (g && w.commanderAlive(g)) {
      reg.follow = g;
      const e = this.nearestThreat(reg, 35);
      if (e) { reg.follow = null; w.orderCharge(reg, e); }
      return;
    }
    reg.follow = null;
    const e = w.nearestEnemyReg(reg);
    if (e && reg.order !== 'charge') w.orderCharge(reg, e);
  }
  // horsemen ride around the flank before charging
  planFlank(reg, e) {
    const fx = Math.sin(e.facing), fz = Math.cos(e.facing);
    const toX = reg.cx - e.cx, toZ = reg.cz - e.cz;
    const front = (toX * fx + toZ * fz) / (Math.hypot(toX, toZ) || 1);
    if (front < 0.4) { reg.flank = null; reg.flankReached = true; return; }
    const rx = -fz, rz = fx;
    const side = toX * rx + toZ * rz >= 0 ? 1 : -1;
    const off = e.width * 0.5 + 28;
    const p = { x: e.cx + rx * side * off - fx * 15, z: e.cz + rz * side * off - fz * 15 };
    if (!this.w.nav.passable(p.x, p.z, 1)) { reg.flank = null; reg.flankReached = true; return; }
    reg.flank = p; reg.flankReached = false;
  }

  // ------------------------------------------------------------ sieges
  wallDefence(reg) {
    const w = this.w, st = w.stage, C = st.city;
    if (reg.kind !== K_INF || WEAPONS[reg.T.weapon].ranged) return;
    const onWall = reg.agents.length && reg.agents[0].y > C.H - 1;
    if (!onWall) {
      // reserves inside: storm out when the gate falls or the enemy is inside
      if (this.enemyInside(w.armies[1])) { const e = w.nearestEnemyReg(reg); if (e && reg.order !== 'charge') w.orderCharge(reg, e); }
      return;
    }
    // reinforce the most threatened ladder
    let best = null, bd = 1e9;
    for (const l of st.ladders) {
      if (l.state !== 'up' && l.state !== 'raising') continue;
      if (l.claimedBy && l.claimedBy !== reg && l.claimedBy.alive > 0) continue;
      const d = Math.abs(l.x - reg.cx);
      if (d < bd) { bd = d; best = l; }
    }
    if (best && bd > 4 && reg.order !== 'move') {
      best.claimedBy = reg;
      w.orderMove(reg, best.x, (C.z0 + C.z1) / 2 + 0.3, Math.PI);
    }
  }
  assaultAI(army, reg) {
    const w = this.w, st = w.stage, C = st.city;
    const gateOpen = !st.gates.every(g => g.alive);
    const ladders = st.ladders.filter(l => l.team === army.team && l.state === 'up');
    const e = w.nearestEnemyReg(reg);
    if (!e) return;
    if (reg.kind !== K_INF && !gateOpen) {
      // horse waits for the gate
      if (reg.order !== 'move' && Math.hypot(reg.cx - 0, reg.cz - (C.z0 - 45)) > 12) w.orderMove(reg, reg.cx * 0.5, C.z0 - 45 - rand() * 10, 0);
      return;
    }
    if (reg.order === 'charge' && reg.targetReg && reg.targetReg.alive > 0 && !reg.noPath) return;
    if (gateOpen || ladders.length) {
      // pick the defender unit nearest to our assigned entry point
      const entry = gateOpen && (!ladders.length || rand() < 0.5 || reg.kind !== K_INF) ? { x: 0, z: C.z0 } : ladders[Math.floor(rand() * ladders.length)];
      const ex = entry.x, ez = entry.z0 !== undefined ? entry.z1 : entry.z;
      let best = null, bd = 1e9;
      for (const r of w.regs) {
        if (r.team === reg.team || r.alive === 0) continue;
        const d = Math.hypot(r.cx - ex, r.cz - ez);
        if (d < bd) { bd = d; best = r; }
      }
      if (best) { reg.formation = 'normal'; w.orderCharge(reg, best); return; }
    }
    // no way in yet: wait out of bowshot... almost
    // wait beside (not in) the ladder lane, beyond comfortable bowshot, shields locked
    const tx = reg.assaultX !== undefined ? reg.assaultX + 9 : reg.cx;
    reg.formation = 'tight';
    if (reg.order !== 'move' && Math.hypot(reg.cx - tx, reg.cz - (C.z0 - 75)) > 8) w.orderMove(reg, tx, C.z0 - 75, 0);
  }

  // ------------------------------------------------------------ engineers
  deployTasks() {
    const w = this.w, st = w.stage;
    if (st.kind !== 'field') return;
    for (const reg of w.regs) {
      if (reg.type !== 'engineer' || !w.auto[reg.team] && reg.team === 0 && reg.manual) continue;
      // stake the front of the most exposed missile/spear unit
      let best = null, bd = 1e9;
      for (const r of w.regs) {
        if (r.team !== reg.team || r.kind !== K_INF || r === reg) continue;
        if (!['archer', 'spear', 'pike', 'xbow'].includes(r.type)) continue;
        const d = Math.abs(r.cx);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best) continue;
      const f = best.facing;
      w.engineering.assign(reg, { type: 'stakes', x: best.ax + Math.sin(f) * 5, z: best.az + Math.cos(f) * 5, facing: f, count: best.cols * 1.2 });
    }
  }
  battleTasks() {
    const w = this.w, st = w.stage;
    if (st.kind === 'siege') {
      const C = st.city, S = st.S;
      const spots = [-70 * S, -34 * S, 30 * S, 66 * S].map(x => Math.round(x / 2) * 2 + 1);
      const engs = w.regs.filter(r => r.team === 0 && r.type === 'engineer' && w.auto[0]);
      engs.forEach((r, i) => {
        const xs = spots.filter((_, k) => k % engs.length === i);
        w.engineering.assign(r, { type: 'ladder', xs });
      });
      // assault troops pair up with ladder spots
      const inf = w.regs.filter(r => r.team === 0 && r.kind === K_INF && !WEAPONS[r.T.weapon].ranged && r.type !== 'engineer');
      inf.forEach((r, i) => { r.assaultX = spots[i % spots.length]; });
      for (const r of w.regs) if (r.kind === K_ENG && r.team === 0 && w.auto[0]) w.engineering.assign(r, { type: r.type === 'ram' ? 'ram' : 'onager' });
    }
    if (st.kind === 'river') {
      for (const r of w.regs) {
        if (r.type !== 'engineer' || !w.auto[r.team]) continue;
        if (r.team === 0) w.engineering.assign(r, { type: 'pontoon', x: 70 * st.S });
      }
    }
  }
  stageTriggers() {
    const w = this.w, st = w.stage;
    if (st.kind === 'river' && !this.riverTrigger && st.woodBridge && st.woodBridge.alive) {
      const b = st.woodBridge;
      for (const r of w.regs) {
        if (r.team !== 0 || r.alive === 0) continue;
        if (Math.hypot(r.cx - b.cx, r.cz - b.zc) < 110) {
          this.riverTrigger = true;
          for (const e of w.regs) if (e.team === 1 && e.type === 'engineer' && w.auto[1]) w.engineering.assign(e, { type: 'demolish', bridge: b });
          break;
        }
      }
    }
  }
}
