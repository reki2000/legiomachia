// Behaviour of regiments and individual agents.
import { clamp, lerp, approach, wrapAngle, rand, randRange } from '../util.js';
import {
  W_SPEAR, W_BOW, W_PIKE, W_JAV, W_SLING, W_XBOW, W_BANNER, W_HAMMER,
  ACT_NONE, ACT_ATTACK, ACT_SHOOT, ACT_THROW, ACT_SLING, ACT_RELOAD, ACT_WORK,
} from '../anim/human.js';
import { WEAPONS, K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, P_ARROW, P_JAV, P_STONE, P_BOLT } from './defs.js';
import { isActive, S_ALIVE, S_DOWN, S_DEAD, S_GONE } from './agent.js';

const tmpS = { x: 0, z: 0, tx: 0, tz: 1 };
const tmpP = { x: 0, z: 0, tx: 0, tz: 1 };

function homeZ(team) { return team === 0 ? -330 : 330; }

// ======================================================================= regiments

// Re-route a regiment, but keep the current route when the new one is not clearly
// shorter: two near-equal detours would otherwise be picked in turn and the whole
// unit would swing back and forth between them.
function applyPath(reg, nav, cls, p) {
  if (reg.path && p && p.length) {
    let len = 0, px = reg.ax, pz = reg.az;
    for (const q of p) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    const rem = reg.pathEnd() - reg.pathS;
    let k = 1; while (k < reg.path.length - 1 && reg.pathL[k] <= reg.pathS) k++;
    const next = reg.path[k];
    if (len > rem * 0.85 && next && nav.raycast(reg.ax, reg.az, next.x, next.z, cls)) return;
  }
  reg.setPath(p || [{ x: reg.ax, z: reg.az }]);
}
export function updateRegiment(w, reg, dt) {
  let n = 0, sx = 0, sz = 0, eng = 0, mor = 0, sta = 0, flee = 0, fx = 0, fz = 0, fn = 0;
  for (const a of reg.agents) {
    if (!isActive(a) && a.state !== S_DOWN) continue;
    n++; sx += a.x; sz += a.z;
    mor += a.morale; sta += a.stamina;
    if (a.fleeing) flee++;
    if (a.target && a.tdist < 4) { eng++; fx += a.x; fz += a.z; fn++; }
  }
  reg.alive = n;
  if (n === 0) { reg.order = 'dead'; reg.path = null; return; }
  reg.cx = sx / n; reg.cz = sz / n;
  reg.engaged = eng > n * 0.12;
  reg.morale = mor / n; reg.stamina = sta / n; reg.fleeFrac = flee / n;
  reg.casualty = 1 - n / Math.max(1, reg.initial);

  reg.compactT -= dt;
  if (reg.compactT <= 0) {
    reg.compactT = 1.5;
    reg.agents = reg.agents.filter(a => a.state !== S_DEAD && a.state !== S_GONE && !a.riderless);
    let k = 0;
    reg.slotMap = [];
    for (const a of reg.agents) if (!a.skirmish) { a.slot = k; reg.slotMap[k] = a; k++; }
  }
  reg.colT -= dt;
  if (reg.colT <= 0) {
    reg.colT = 0.5; reg.updateEffCols(w.nav);
    // distance from our edge to the nearest enemy unit's edge
    let td = 1e9;
    for (const r of w.regs) {
      if (r.team === reg.team || r.alive === 0) continue;
      const d = Math.hypot(r.cx - reg.cx, r.cz - reg.cz) - (r.width + reg.width) * 0.6 - 4;
      if (d < td) td = d;
    }
    reg.threatD = td;
  }

  // rout & rally
  if (reg.order !== 'rout' && reg.initial >= 3 && reg.fleeFrac > 0.5) {
    reg.order = 'rout'; reg.path = null; reg.charging = false;
    for (const a of reg.agents) { a.fleeing = true; a.morale = Math.min(a.morale, 0.1); }
    w.emit('rout', reg);
    // panic spreads to nearby units of the same army
    for (const r of w.regs) {
      if (r.team !== reg.team || r === reg || r.alive === 0) continue;
      if (Math.hypot(r.cx - reg.cx, r.cz - reg.cz) < 70) for (const a of r.agents) w.moraleHit(a, -0.12);
    }
  } else if (reg.order === 'rout' && reg.fleeFrac < 0.2 && n >= 3) {
    reg.order = 'hold'; reg.ax = reg.cx; reg.az = reg.cz; reg.manual = false;
    w.emit('rally', reg);
  }

  if (reg.follow) followLeader(w, reg, dt);

  const T = reg.T, nav = w.nav, cls = reg.kind === K_INF ? 0 : 1;
  let spd = 0;
  if (reg.order === 'move') {
    if (!reg.path || reg.pathVer !== nav.version || reg.pathGoal !== reg.tx + ',' + reg.tz) {
      reg.pathGoal = reg.tx + ',' + reg.tz; reg.pathVer = nav.version;
      const p = nav.findPath(reg.ax, reg.az, reg.tx, reg.tz, cls);
      reg.setPath(p || [{ x: reg.ax, z: reg.az }]);
    }
    spd = T.march;
  } else if (reg.order === 'charge') {
    const tr = reg.targetReg;
    if (!tr || tr.alive === 0 || (tr.order === 'rout' && tr.alive < 3)) {
      reg.targetReg = null; reg.order = 'hold'; reg.charging = false; reg.path = null;
      reg.ax = reg.cx; reg.az = reg.cz;
    } else {
      reg.repathT -= dt;
      const moved = !reg.pathTarget || Math.hypot(reg.pathTarget.x - tr.cx, reg.pathTarget.z - tr.cz) > 8;
      if (!reg.path || (reg.repathT <= 0 && (reg.pathVer !== nav.version || moved && !reg.noPath))) {
        reg.repathT = 3; reg.pathVer = nav.version;
        reg.pathTarget = { x: tr.cx, z: tr.cz };
        let gx = tr.cx, gz = tr.cz;
        if (reg.flank && !reg.charging) { gx = reg.flank.x; gz = reg.flank.z; }
        const p = nav.findPath(reg.ax, reg.az, gx, gz, cls);
        reg.noPath = !p;
        applyPath(reg, nav, cls, p);
      }
      const d = Math.hypot(tr.cx - reg.ax, tr.cz - reg.az) || 1;
      if (!reg.charging && d < T.chargeDist && (nav.trivial || nav.raycast(reg.ax, reg.az, tr.cx, tr.cz, cls))) {
        reg.charging = true;
        reg.cdx = (tr.cx - reg.ax) / d; reg.cdz = (tr.cz - reg.az) / d;
        for (const a of reg.agents) if (rand() < 0.6) a.cryT = randRange(0.8, 2.2);
        w.emit('charge', reg);
      }
      if (reg.charging) {
        const ex = (tr.cx - reg.ax) / d, ez = (tr.cz - reg.az) / d;
        reg.cdx = lerp(reg.cdx, ex, dt * 0.5); reg.cdz = lerp(reg.cdz, ez, dt * 0.5);
        const l = Math.hypot(reg.cdx, reg.cdz) || 1; reg.cdx /= l; reg.cdz /= l;
      }
      spd = reg.charging ? (T.run || T.max) * 0.8 : T.march;
      if (d < 3) spd = 0;
      if (reg.engaged && fn) {
        // the anchor sits just behind the fighting line, so rear ranks queue up behind it
        const lx = fx / fn - reg.cdx * 1.2, lz = fz / fn - reg.cdz * 1.2;
        reg.ax = lerp(reg.ax, lx, dt * 0.8); reg.az = lerp(reg.az, lz, dt * 0.8);
        reg.path = null; spd = 0;
        reg.turnTo(Math.atan2(tr.cx - reg.cx, tr.cz - reg.cz), dt, 0.5);
      }
    }
  } else if (reg.order === 'hold' || reg.order === 'fire') {
    if (reg.order === 'fire' && reg.targetReg) {
      const tr = reg.targetReg;
      if (tr.alive === 0) { reg.order = 'hold'; reg.targetReg = null; }
      else reg.tFacing = Math.atan2(tr.cx - reg.ax, tr.cz - reg.az);
    }
    reg.path = null;
    reg.turnTo(reg.tFacing, dt, 0.6);
  }
  if (reg.path && spd > 0) {
    // wait for stragglers: measure how far the front rank lags behind
    const lead = reg.slotMap && reg.slotMap[Math.floor(reg.effCols / 2)];
    if (lead && isActive(lead)) {
      reg.slotPos(lead.slot, tmpS);
      const lag = Math.hypot(tmpS.x - lead.x, tmpS.z - lead.z);
      if (lag > 6) spd *= 0.25; else if (lag > 3) spd *= 0.6;
    }
    reg.pathS = Math.min(reg.pathS + spd * dt, reg.pathEnd());
    reg.pointAt(reg.pathS, tmpS);
    reg.avx = (tmpS.x - reg.ax) / dt; reg.avz = (tmpS.z - reg.az) / dt;
    reg.ax = tmpS.x; reg.az = tmpS.z;
    reg.turnTo(Math.atan2(tmpS.tx, tmpS.tz), dt, 1.6);
    if (reg.pathS >= reg.pathEnd() - 0.01) {
      reg.path = null;
      if (reg.order === 'move') { reg.order = 'hold'; }
    }
  } else { reg.avx = 0; reg.avz = 0; }
  if (!reg.path && reg.order === 'hold') reg.turnTo(reg.tFacing, dt, 0.6);

  reg.braceT -= dt;
  if (reg.braceT <= 0) {
    reg.braceT = 0.5;
    reg.brace = false;
    if (reg.kind === K_INF && !reg.charging) {
      for (const r of w.regs) {
        if (r.team === reg.team || r.alive === 0 || r.kind === K_INF || r.kind === K_ENG || r.kind === K_DOG) continue;
        if (Math.hypot(r.cx - reg.cx, r.cz - reg.cz) < 45) { reg.brace = true; break; }
      }
    }
  }
  if (reg.order === 'fire') updateVolley(w, reg, dt);
}

function followLeader(w, reg, dt) {
  const L = reg.follow;
  if (!w.commanderAlive(L)) { reg.follow = null; return; }
  if (reg.order === 'charge') return;
  // follow the leader's heading slowly: he fidgets and turns on the spot, and the
  // guard must not orbit him every time he does
  reg.turnTo(L.heading, dt, 0.35);
  const fx = Math.sin(reg.facing), fz = Math.cos(reg.facing);
  reg.ax = L.x - fx * 7; reg.az = L.z - fz * 7;
  reg.tFacing = reg.facing;
  reg.order = 'hold'; reg.path = null;
}

function updateVolley(w, reg, dt) {
  const tr = reg.targetReg;
  if (!tr) return;
  reg.volleyT -= dt;
  if (reg.volleyT > 0) return;
  const W = WEAPONS[reg.T.weapon];
  const range = W.ranged ? W.ranged.range : 0;
  const d = Math.hypot(tr.cx - reg.cx, tr.cz - reg.cz);
  if (d > range) { reg.volleyT = 1; return; }
  reg.volleyT = reg.T.weapon === W_SLING ? randRange(3.5, 5) : reg.T.weapon === W_XBOW ? randRange(4.5, 6) : randRange(5.5, 7.5);
  const tgts = tr.agents;
  for (const a of reg.agents) {
    if (!isActive(a) || a.target || a.fleeing || a.job) continue;
    a.shootDelay = randRange(0, 0.9);
    let t = null;
    for (let k = 0; k < 4 && !t; k++) {
      const c = tgts[Math.floor(rand() * tgts.length)];
      if (c && isActive(c)) t = c;
    }
    a.shootTarget = t;
  }
  w.emit('volley', reg);
}

// ======================================================================= morale
function updateMorale(w, a, dt, rider) {
  const reg = a.reg;
  const fear = a.fear || 0;
  const target = a.baseMorale + reg.aura - (reg.casualty || 0) * 0.55 - 0.2 * (1 - a.stamina) - fear;
  const rate = target > a.morale ? (a.nearEnemy ? 0.015 : 0.05) : 0.03;
  a.morale += (target - a.morale) * Math.min(1, dt * rate * 3);
  if (!a.fleeing && a.morale < 0.12 && w.phase === 'battle') {
    a.fleeing = true;
    w.setTarget(a, null);
    w.emit('flee', a);
  } else if (a.fleeing && reg.order !== 'rout' && a.morale > 0.42 && !a.nearEnemy) {
    a.fleeing = false; a.skirmish = a.kind === K_INF ? a.skirmish : false;
    w.emit('rally1', a);
  }
  if (a.fleeing && !a.nearEnemy) a.morale += dt * 0.03 * (reg.aura > 0.05 ? 2 : 1);
}

function scanThreats(w, a) {
  // cheap periodic scan: enemies close by? terrifying elephants?
  const td = a.reg.threatD;
  a.nearEnemy = td < 30 && !!w.nearestEnemy(a, a.fleeing ? 14 : 8);
  let fear = 0;
  for (const r of w.eleRegs[1 - a.team] || []) {
    if (r.alive > 0 && Math.hypot(r.cx - a.x, r.cz - a.z) < 25) { fear += 0.15; break; }
  }
  if (a.lastHitT > w.time - 3) fear += 0.05;
  a.fear = fear;
}

// ======================================================================= infantry
export function thinkInf(w, a, dt) {
  const reg = a.reg, st = a.st, W = WEAPONS[a.weapon];
  a.faceH = NaN;
  a.attackCd -= dt;
  if (a.cryT > 0) a.cryT -= dt;
  if (a.restT > 0) a.restT -= dt;
  if (w.phase === 'deploy' && a.cryT <= 0 && rand() < dt * 0.02) a.cryT = randRange(0.8, 2.0);

  a.retarget -= dt;
  const rescan = a.retarget <= 0;
  if (rescan) scanThreats(w, a);
  updateMorale(w, a, dt);

  if (a.job && w.engineering && !a.fleeing) { if (w.engineering.thinkWorker(a, dt)) return; }

  if (a.swimming) {
    // strike out for the nearer bank
    const st2 = w.stage;
    const zc = st2.river ? st2.riverZ(a.x) : 0;
    const side = a.fleeing ? (a.team === 0 ? -1 : 1) : (a.z > zc ? 1 : -1);
    a.dvx = 0; a.dvz = side * 1;
    w.setTarget(a, null);
    return;
  }

  if (a.fleeing) {
    w.setTarget(a, null);
    const hz = homeZ(a.team);
    const p = w.steerTo(a, a.x * 1.05 + Math.sin(a.id) * 20, hz, 0, dt) || [a.x, hz];
    const dx = p[0] - a.x, dz = p[1] - a.z, l = Math.hypot(dx, dz) || 1;
    const v = (a.T.run || 5) * a.runMul;
    a.dvx = dx / l * v; a.dvz = dz / l * v;
    if (Math.abs(a.z) > 320 || Math.abs(a.x) > 440) a.state = S_GONE;
    return;
  }

  // ---------- target acquisition
  let t = a.target;
  if (t && (!w.isEnemy(a, t) || (!W.ranged && !w.sameLevel(a, t)))) { w.setTarget(a, null); t = null; }
  if (rescan && reg.threatD > 45 && !reg.charging && !a.skirmish && !t && reg.order !== 'fire') {
    // nothing near the unit: no need to look for opponents yet
    a.retarget = randRange(1, 1.6);
  } else if (rescan) {
    a.retarget = randRange(0.3, 0.6);
    let R;
    if (a.restT > 0) R = 1.2;
    else if (a.skirmish) R = 9;
    else if (reg.order === 'charge') R = reg.charging ? 9 : 3;
    else if (reg.order === 'move') R = 2.5;
    else R = W.ranged ? 3 : 6;
    let nt = w.nearestEnemy(a, R, W.cap || 2);
    if (!nt && (reg.charging || a.skirmish) && a.restT <= 0) {
      nt = reg.targetReg ? w.nearestInReg(a, reg.targetReg, 30) : null;
      if (!nt) nt = w.nearestEnemyAnywhere(a, a.skirmish ? 60 : 30, true);
      // far targets must be reachable on foot
      if (nt && !w.nav.trivial && Math.hypot(nt.x - a.x, nt.z - a.z) > 4 && !w.nav.raycast(a.x, a.z, nt.x, nt.z, 0)) nt = null;
    }
    if (t && nt && nt !== t && w.distTo(a, nt) > w.distTo(a, t) - 1.2) nt = t;
    if (nt !== t) { w.setTarget(a, nt); t = nt; }
    // missile troops pick shots on their own
    if (W.ranged && !t && (reg.order !== 'fire' || a.shootDelay < 0)) a.shotT = w.nearestEnemyAnywhere(a, a.weapon === W_JAV ? W.ranged.range : 32, false);
    // front-rank rotation: a spent man steps back and a fresh one comes up
    if (t && a.stamina < 0.2 && reg.slotMap && !a.skirmish && rand() < 0.3) rotateRank(w, a);
  }

  // ---------- missile weapons
  if (W.ranged && rangedThink(w, a, t, W, dt)) return;

  if (t) {
    const dx = t.x - a.x, dz = t.z - a.z;
    const d = w.distTo(a, t);
    a.tdist = d;
    const dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl;
    a.faceH = Math.atan2(ux, uz);
    const reach = W.reach + a.radius + t.radius;
    let spd = 0;
    if (d > reach + 0.25) spd = d > 7 ? (a.T.run || 5) * a.eager : Math.min(a.T.run || 5, 1.0 + (d - reach) * 1.3);
    else if (d < reach - 0.45) spd = W.closeDist ? -0.55 : -1.1;
    let px = 0, pz = 0;
    if (d < reach + 1.5) {
      const c = Math.sin(w.time * 0.8 + a.id) * 0.45;
      px = -uz * c; pz = ux * c;
    }
    let k = 1;
    if (st.action === ACT_ATTACK) k = st.actionT > 0.35 && st.actionT < 0.55 ? 0.8 : 0.25;
    if (st.flinch > 0.3) k *= 0.3;
    // wavering men hang back
    if (a.morale < 0.3 && d > reach) k *= 0.4;
    let gx = ux * spd + px, gz = uz * spd + pz;
    if (d > 4 && !w.nav.trivial) {
      const p = w.steerTo(a, t.x, t.z, 0, dt);
      if (p) { const ex = p[0] - a.x, ez = p[1] - a.z, el = Math.hypot(ex, ez) || 1; gx = ex / el * spd; gz = ez / el * spd; }
    }
    a.dvx = gx * k; a.dvz = gz * k;
    const cdMul = 1.6 - 0.6 * a.stamina + (a.morale < 0.3 ? 0.6 : 0);
    if (d <= reach + 0.3 && a.attackCd <= 0 && st.action === ACT_NONE && st.flinch < 0.4 &&
      Math.abs(wrapAngle(a.heading - a.faceH)) < 0.7 && a.weapon !== W_BANNER) {
      const dur = randRange(W.atk[0], W.atk[1]) * (1.15 - a.stamina * 0.15);
      st.start(ACT_ATTACK, dur, rand() < 0.65 ? 0 : 1);
      a.atkTarget = t;
      a.attackCd = (dur + randRange(0.25, 1.3)) * cdMul;
      a.stamina -= 0.025;
    }
    return;
  }
  a.tdist = 99;

  if (a.skirmish) {
    const r = reg.targetReg || w.nearestEnemyReg(reg);
    let tx = reg.ax, tz = reg.az;
    if (r && Math.hypot(r.cx - a.x, r.cz - a.z) < 80) { tx = r.cx; tz = r.cz; }
    moveToward(w, a, tx, tz, (a.T.run || 5) * 0.8, 3, dt);
    return;
  }

  reg.slotPos(a.slot, tmpS);
  if (reg.order === 'charge' && reg.charging && a.restT <= 0) {
    const cx = reg.cdx, cz = reg.cdz;
    const rx = -cz, rz = cx;
    const e = (tmpS.x - a.x) * rx + (tmpS.z - a.z) * rz;
    const lag = (tmpS.x - a.x) * cx + (tmpS.z - a.z) * cz;
    let s = (a.T.run || 5) * a.eager * (lag < -8 ? 0.8 : 1);
    // queue behind comrades who are already fighting instead of piling into them
    if (reg.engaged) {
      if (lag < 0.5) s = Math.min(s, Math.max(0, lag + 0.5) * 2);
      const ahead = w.query(a.x + cx * 1.6, a.z + cz * 1.6, 1.0);
      for (let k = 0; k < ahead; k++) {
        const b = w.agents[w.qbuf[k]];
        if (b !== a && b.team === a.team && (b.target || b.st && b.st.speed < 1) && Math.hypot(b.x - a.x - cx * 1.6, b.z - a.z - cz * 1.6) < 1.1) { s = 0; break; }
      }
      if (s === 0) a.faceH = Math.atan2(cx, cz);
    }
    const lat = clamp(e * 0.7, -2, 2);
    a.dvx = cx * s + rx * lat; a.dvz = cz * s + rz * lat;
    return;
  }
  slotSeek(w, a, dt);
}

function slotSeek(w, a, dt) {
  const reg = a.reg;
  reg.slotPos(a.slot, tmpS);
  let tx = tmpS.x, tz = tmpS.z;
  let dx = tx - a.x, dz = tz - a.z;
  let d = Math.hypot(dx, dz);
  const nav = w.nav;
  if (!nav.trivial && d > 3) {
    a.slotCheckT -= dt;
    if (a.slotCheckT <= 0) { a.slotCheckT = 0.8 + rand() * 0.6; a.slotBlocked = !nav.raycast(a.x, a.z, tx, tz, 0); }
    if (a.slotBlocked) {
      if (reg.path) {
        // walk along the unit's route
        const s = reg.projectOnPath(a.x, a.z);
        reg.pointAt(Math.min(s + 4, reg.pathS), tmpP);
        if (nav.raycast(a.x, a.z, tmpP.x, tmpP.z, 0)) { tx = tmpP.x; tz = tmpP.z; }
        else { const p = w.steerTo(a, tmpS.x, tmpS.z, 0, dt); if (p) { tx = p[0]; tz = p[1]; } }
      } else {
        const p = w.steerTo(a, tmpS.x, tmpS.z, 0, dt);
        if (p) { tx = p[0]; tz = p[1]; }
      }
      dx = tx - a.x; dz = tz - a.z; d = Math.hypot(dx, dz);
    }
  }
  let vx = reg.avx + dx * 1.3, vz = reg.avz + dz * 1.3;
  const lim = d > 3 ? (a.T.run || 5) * a.eager : Math.max(a.T.march * 1.4, 1);
  const vl = Math.hypot(vx, vz);
  if (vl > lim) { vx *= lim / vl; vz *= lim / vl; }
  if (d < 0.25 && reg.avx === 0 && reg.avz === 0) { vx = 0; vz = 0; }
  a.dvx = vx; a.dvz = vz;
  if (d < 2.5) a.faceH = reg.facing;
}

function moveToward(w, a, tx, tz, v, stop, dt) {
  const p = w.steerTo(a, tx, tz, a.kind === K_INF || a.kind === K_DOG ? 0 : 1, dt) || [tx, tz];
  const dx = p[0] - a.x, dz = p[1] - a.z, d = Math.hypot(tx - a.x, tz - a.z), l = Math.hypot(dx, dz) || 1;
  const s = d > stop ? v : 0;
  a.dvx = dx / l * s; a.dvz = dz / l * s;
}

function rotateRank(w, a) {
  const reg = a.reg, cols = reg.effCols;
  for (let k = reg.slotMap.length - 1; k > a.slot; k -= cols) {
    const b = reg.slotMap[k];
    if (b && isActive(b) && !b.target && b.stamina > 0.6 && !b.fleeing && k % cols === a.slot % cols) {
      const s = a.slot; a.slot = b.slot; b.slot = s;
      reg.slotMap[a.slot] = a; reg.slotMap[b.slot] = b;
      w.setTarget(a, null);
      a.restT = 6;
      return;
    }
  }
}

// missile troops: volleys, aimed shots, javelins, reloading. true = handled
function rangedThink(w, a, t, W, dt) {
  const st = a.st, R = W.ranged, reg = a.reg;
  if (st.action === ACT_SHOOT || st.action === ACT_THROW || st.action === ACT_SLING || st.action === ACT_RELOAD) {
    a.dvx *= 0.5; a.dvz *= 0.5;
    if (a.shootTarget) a.faceH = Math.atan2(a.shootTarget.x - a.x, a.shootTarget.z - a.z);
    return true;
  }
  if (a.weapon === W_XBOW && !st.loaded) { st.start(ACT_RELOAD, R.reload * randRange(0.9, 1.2)); st.loaded = true; a.dvx = a.dvz = 0; return true; }
  const noAmmo = R.ammo && a.ammo <= 0;
  if (noAmmo) return false;                          // javelin men fight with their last spear
  if (t && a.tdist < 2.5) return false;               // enemy on top of us: sidearm
  // skirmishers fall back from melee troops
  if (a.T.skirm && a.nearEnemy) {
    const e = w.nearestEnemy(a, 9);
    if (e && e.kind !== K_ENG && (e.kind !== K_INF || !WEAPONS[e.weapon].ranged)) {
      const dx = a.x - e.x, dz = a.z - e.z, l = Math.hypot(dx, dz) || 1;
      a.dvx = dx / l * (a.T.run || 5); a.dvz = dz / l * (a.T.run || 5);
      a.faceH = NaN;
      return true;
    }
  }
  // volley in progress
  if (a.shootDelay >= 0) {
    a.shootDelay -= dt;
    a.dvx = a.dvz = 0;
    if (a.shootDelay < 0 && a.shootTarget && isActive(a.shootTarget)) startShot(w, a, a.shootTarget, true);
    if (reg.order === 'fire') { a.faceH = reg.facing; return true; }
  }
  // aimed shot at the nearest enemy
  const tgt = t || a.shotT;
  if (tgt && isActive(tgt) && a.attackCd <= 0) {
    const d = Math.hypot(tgt.x - a.x, tgt.z - a.z);
    const maxD = a.weapon === W_JAV ? R.range : 32;
    if (d < maxD && d > 2.5) {
      startShot(w, a, tgt, false);
      a.attackCd = a.weapon === W_JAV ? randRange(1.2, 2) : randRange(1.3, 2.4);
      return true;
    }
  }
  // javelin skirmishers close in to throwing range
  if (a.weapon === W_JAV && reg.order === 'charge' && reg.targetReg) {
    const e = w.nearestInReg(a, reg.targetReg, 200, false);
    if (e) {
      const d = Math.hypot(e.x - a.x, e.z - a.z);
      if (d > R.range * 0.8) { moveToward(w, a, e.x, e.z, (a.T.run || 5) * 0.8, 0, dt); return true; }
      a.shotT = e; a.dvx = a.dvz = 0; a.faceH = Math.atan2(e.x - a.x, e.z - a.z);
      return true;
    }
  }
  return false;
}

function startShot(w, a, t, high) {
  const st = a.st;
  a.shootTarget = t;
  st.aimYaw = 0;
  switch (a.weapon) {
    case W_JAV: st.aimPitch = 0.35; st.start(ACT_THROW, randRange(1.0, 1.2)); break;
    case W_SLING: st.aimPitch = w.aimPitch(a, t, false) + 0.1; st.start(ACT_SLING, randRange(1.4, 1.8)); break;
    case W_XBOW: st.aimPitch = w.aimPitch(a, t, false); st.start(ACT_SHOOT, randRange(0.9, 1.2)); break;
    default: st.aimPitch = w.aimPitch(a, t, high); st.start(ACT_SHOOT, high ? randRange(1.5, 1.9) : randRange(1.0, 1.3)); break;
  }
  a.volleyShot = high;
  a.faceH = Math.atan2(t.x - a.x, t.z - a.z);
}

// animation events (weapon impact, missile release, hammer blow)
export function actionEvent(w, a, act) {
  if (act === ACT_ATTACK) {
    const t = a.atkTarget;
    const W = WEAPONS[a.weapon];
    if (t && isActive(t) && w.distTo(a, t) < W.reach + a.radius + t.radius + 0.6 && w.sameLevel(a, t)) {
      w.resolveMelee(a, a.x, a.z, t, a.weapon, a.dmgMul, false);
    }
    return;
  }
  if (act === ACT_WORK) { if (w.engineering) w.engineering.workBlow(a); return; }
  const t = a.shootTarget;
  if (!t) return;
  const fx = Math.sin(a.heading) * 0.3, fz = Math.cos(a.heading) * 0.3;
  const oy = a.y + 1.5;
  if (act === ACT_SHOOT) {
    if (a.weapon === W_XBOW) { w.fireMissile(a.x + fx, oy - 0.1, a.z + fz, t, false, a.team, P_BOLT, a.dmgMul); a.st.loaded = false; }
    else w.fireMissile(a.x + fx, oy, a.z + fz, t, a.volleyShot, a.team, P_ARROW, a.dmgMul);
  } else if (act === ACT_THROW) {
    w.fireMissile(a.x + fx, oy + 0.3, a.z + fz, t, false, a.team, P_JAV, a.dmgMul);
    a.ammo--;
  } else if (act === ACT_SLING) {
    w.fireMissile(a.x + fx, oy + 0.4, a.z + fz, t, false, a.team, P_STONE, a.dmgMul);
  }
  if (!a.target) a.shootTarget = null;
}

// ======================================================================= mounted
function riderMorale(w, a, dt) {
  const r = a.crew && a.crew[0];
  if (!r) return;
  a.retarget -= 0;
  if ((a.id + w.stepN) % 30 === 0) scanThreats(w, a);
  updateMorale(w, a, dt, true);
}

export function thinkCav(w, a, dt) {
  const rider = a.crew[0], reg = a.reg, T = a.T;
  if (a.riderless) {
    a.modeT += dt;
    if (a.modeT > 0.8) {
      a.modeT = 0;
      const away = w.nearestEnemyAnywhere(a, 25);
      if (away) a.dh = Math.atan2(a.x - away.x, a.z - away.z) + randRange(-0.5, 0.5);
      else a.dh = a.heading + randRange(-0.6, 0.6);
      if (Math.hypot(a.x, a.z) > 250) a.dh = Math.atan2(-a.x, -a.z);
      a.dspd = away ? 9 : Math.max(1.2, a.dspd * 0.85);
    }
    return;
  }
  riderMorale(w, a, dt);
  if (a.fleeing) { fleeMount(w, a, dt); return; }
  // horses shy away from camels
  if (T.animal === 'horse' && (a.id + w.stepN) % 20 === 0) {
    for (const r of w.camelRegs[1 - a.team] || []) {
      if (r.alive > 0 && Math.hypot(r.cx - a.x, r.cz - a.z) < 22) { if (rand() < 0.3) a.q.rear = 1; a.morale -= 0.02; a.dspd *= 0.7; break; }
    }
  }
  if (T.commander) { thinkCommander(w, a, dt); return; }
  if (T.skirm) { thinkHorseArcher(w, a, dt); return; }
  riderCombat(w, a, rider, dt);

  if (a.mode === 'form') {
    if (reg.order === 'charge' && reg.targetReg && (reg.charging || !reg.flank || reg.flankReached)) { a.mode = 'charge'; a.retarget = 0; a.hits = 0; }
    mountSlotSeek(w, a, dt);
    return;
  }
  if (reg.order !== 'charge') { a.mode = 'form'; return; }
  if (a.mode === 'charge') {
    a.retarget -= dt;
    if (a.lockT > 0) a.lockT -= dt;
    if ((!a.target || !w.isEnemy(a, a.target) || a.retarget <= 0) && a.lockT <= 0) {
      a.retarget = 1.2;
      let t = reg.targetReg ? w.nearestInReg(a, reg.targetReg, 260) : null;
      if (!t) t = w.nearestEnemyAnywhere(a, 200, true);
      w.setTarget(a, t);
    }
    const t = a.target;
    if (!t) { a.mode = 'form'; return; }
    const d = Math.hypot(t.x - a.x, t.z - a.z);
    if (a.lockT <= 0) {
      const lead = clamp(d / 14, 0, 1.5);
      let gx = t.x + t.vx * lead, gz = t.z + t.vz * lead;
      if (d > 20) { const p = w.steerTo(a, gx, gz, 1, dt); if (p) { gx = p[0]; gz = p[1]; } }
      a.dh = Math.atan2(gx - a.x, gz - a.z) + (a.id % 7 - 3) * 0.01;
      if (d < 14) a.lockT = 2.2;
    }
    a.dspd = T.max * a.eager * (0.7 + 0.3 * a.stamina);
    a.tdist = d;
    a.stamina = Math.max(0, a.stamina - dt * 0.012);
    const sp = Math.hypot(a.vx, a.vz);
    if ((a.hits > 0 && sp < 3.5) || (a.lockT <= 0 && d < 4)) { a.mode = 'melee'; a.modeT = randRange(3, 6); a.lockT = 0; }
  } else if (a.mode === 'melee') {
    a.modeT -= dt;
    const t = w.nearestEnemy(a, 7);
    w.setTarget(a, t);
    if (t) {
      const d = w.distTo(a, t);
      a.tdist = d;
      a.dh = Math.atan2(t.x - a.x, t.z - a.z);
      a.dspd = d > a.radius + t.radius + 1.2 ? 3 : 0.6;
    } else { a.modeT -= dt * 3; a.dspd = 2; }
    if (a.modeT <= 0 || rider.hp < 35 || a.attackers >= 4 || a.hp < a.maxHp * 0.4) {
      const r = reg.targetReg || w.nearestEnemyReg(reg);
      const dx = a.x - (r ? r.cx : a.x), dz = a.z - (r ? r.cz : a.z - 1);
      const l = Math.hypot(dx, dz) || 1;
      a.px = a.x + dx / l * 55 + randRange(-10, 10); a.pz = a.z + dz / l * 55 + randRange(-10, 10);
      a.mode = 'withdraw';
    }
  } else if (a.mode === 'withdraw') {
    const p = w.steerTo(a, a.px, a.pz, 1, dt) || [a.px, a.pz];
    a.dh = Math.atan2(p[0] - a.x, p[1] - a.z); a.dspd = T.max * 0.75;
    w.setTarget(a, null);
    a.stamina = Math.min(1, a.stamina + dt * 0.02);
    if (Math.hypot(a.px - a.x, a.pz - a.z) < 8) { a.mode = 'charge'; a.hits = 0; a.retarget = 0; }
  }
}

// commanders ride behind their troops, point, and fight only when threatened
function thinkCommander(w, a, dt) {
  const rider = a.crew[0];
  riderCombat(w, a, rider, dt);
  const e = w.nearestEnemy(a, 10);
  if (e && a.hp > a.maxHp * 0.3) {
    w.setTarget(a, e);
    a.dh = Math.atan2(e.x - a.x, e.z - a.z);
    a.dspd = w.distTo(a, e) > 3 ? 4 : 0.5;
    return;
  }
  w.setTarget(a, null);
  const p = w.steerTo(a, a.px, a.pz, 1, dt) || [a.px, a.pz];
  const d = Math.hypot(a.px - a.x, a.pz - a.z);
  a.dh = d > 2 ? Math.atan2(p[0] - a.x, p[1] - a.z) : a.faceTo || a.heading;
  a.dspd = d > 25 ? 8 : d > 2 ? Math.min(4, d * 0.5) : 0;
}

function thinkHorseArcher(w, a, dt) {
  const reg = a.reg, T = a.T, c = a.crew[0];
  if (reg.order !== 'charge' && reg.order !== 'fire') { a.mode = 'form'; mountSlotSeek(w, a, dt); crewArchery(w, a, c, dt, T.range); return; }
  a.retarget -= dt;
  if (a.retarget <= 0 || !a.target || !w.isEnemy(a, a.target)) {
    a.retarget = 1.5;
    let t = reg.targetReg ? w.nearestInReg(a, reg.targetReg, 300, false) : null;
    if (!t) t = w.nearestEnemyAnywhere(a, 250);
    w.setTarget(a, t);
  }
  const t = a.target;
  if (!t) { mountSlotSeek(w, a, dt); return; }
  const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz) || 1;
  if ((a.id + w.stepN) % 10 === 0) {
    const danger = a.reg.threatD < 25 ? w.nearestEnemy(a, 18) : null;
    a.nearEnemy = !!(danger && (danger.kind !== K_INF || !WEAPONS[danger.weapon].ranged));
  }
  const threat = a.nearEnemy;
  let h;
  if (threat) h = Math.atan2(-dx, -dz);                 // gallop away (Parthian shot)
  else if (d > 55) h = Math.atan2(dx, dz);              // close in
  else h = Math.atan2(dx, dz) + (a.id % 2 ? 1.35 : -1.35); // circle at range
  const p = w.steerTo(a, a.x + Math.sin(h) * 20, a.z + Math.cos(h) * 20, 1, dt);
  a.dh = p ? Math.atan2(p[0] - a.x, p[1] - a.z) : h;
  a.dspd = T.max * (threat ? 1 : 0.7);
  a.tdist = d;
  crewArchery(w, a, c, dt, T.range, t);
}

function riderCombat(w, a, c, dt) {
  if (!c.alive) return;
  c.cd -= dt;
  if (c.cd > 0 || c.st.action !== ACT_NONE) return;
  const W = WEAPONS[c.weapon];
  const R = a.radius + a.ext + W.reach + 0.8;
  if (a.reg.threatD > 20) { c.cd = 0.5; return; }
  const t = w.nearestEnemy(a, R);
  if (!t || w.distTo(a, t) > W.reach + 0.35 + a.radius + t.radius + 0.2) { c.cd = 0.25; return; }
  const dur = randRange(W.atk[0], W.atk[1]);
  c.st.start(ACT_ATTACK, dur, rand() < 0.5 ? 0 : 1);
  c.target = t;
  c.cd = dur + randRange(0.2, 0.9);
}

function crewArchery(w, a, c, dt, range, fixed) {
  if (!c.alive) return;
  c.cd -= dt;
  if (c.cd > 0 || c.st.action !== ACT_NONE || w.phase !== 'battle') return;
  const t = fixed && isActive(fixed) && Math.hypot(fixed.x - a.x, fixed.z - a.z) < range ? fixed : w.nearestEnemyAnywhere(a, range);
  c.cd = randRange(2.2, 4.0);
  if (!t) return;
  c.target = t;
  const d = Math.hypot(t.x - a.x, t.z - a.z);
  c.st.aimPitch = d > 45 ? 0.45 : 0.1;
  // turn in the saddle
  const yaw = wrapAngle(Math.atan2(t.x - a.x, t.z - a.z) - a.heading);
  c.st.aimYaw = -clamp(yaw, -2.2, 2.2) * 0.9;
  c.st.start(ACT_SHOOT, randRange(1.1, 1.5));
}

export function crewEvent(w, a, c, act) {
  const t = c.target;
  if (!t || !isActive(t)) return;
  if (act === ACT_ATTACK) {
    const W = WEAPONS[c.weapon];
    if (w.distTo(a, t) < W.reach + 0.35 + a.radius + t.radius + 0.7) {
      w.resolveMelee(a, a.x, a.z, t, c.weapon, 0.65 + c.stats.str / 140, true);
    }
  } else if (act === ACT_SHOOT) {
    const h = a.kind === K_ELE ? 4.9 : a.kind === K_CAV ? 2.4 : 2.2;
    w.fireMissile(a.x, a.y + h, a.z, t, Math.hypot(t.x - a.x, t.z - a.z) > 45, a.team, P_ARROW);
  }
}

function mountSlotSeek(w, a, dt) {
  const reg = a.reg;
  reg.slotPos(a.slot, tmpS);
  let tx = tmpS.x, tz = tmpS.z;
  const d = Math.hypot(tx - a.x, tz - a.z);
  const regSpd = Math.hypot(reg.avx, reg.avz);
  if (d > 1.5) {
    if (d > 8) { const p = w.steerTo(a, tx, tz, 1, dt); if (p) { tx = p[0]; tz = p[1]; } }
    a.dh = Math.atan2(tx - a.x, tz - a.z);
    a.dspd = Math.min(a.T.max * 0.7, regSpd + d * 0.6);
    if (d < 5 && Math.abs(wrapAngle(a.dh - reg.facing)) > 1.2) { a.dh = reg.facing; a.dspd = regSpd * 0.5; }
  } else {
    a.dh = reg.facing; a.dspd = regSpd;
  }
  w.setTarget(a, null);
}

function fleeMount(w, a, dt) {
  const hz = homeZ(a.team);
  const p = w.steerTo(a, a.x, hz, 1, dt) || [a.x, hz];
  a.dh = Math.atan2(p[0] - a.x, p[1] - a.z);
  a.dspd = a.T.max * 0.85;
  if (Math.abs(a.z) > 320 || Math.abs(a.x) > 440) a.state = S_GONE;
}

export function thinkEle(w, a, dt) {
  const reg = a.reg, T = a.T;
  for (let i = 1; i < a.crew.length; i++) crewArchery(w, a, a.crew[i], dt, T.range);
  a.rage = approach(a.rage, a.mode === 'charge' || a.mode === 'panic' ? 1 : 0, dt * 0.7);
  if (a.mode !== 'panic' && (a.hp < a.maxHp * 0.3 || (!a.crew[0].alive && rand() < dt * 0.1))) {
    a.mode = 'panic'; a.modeT = 0; w.emit('trumpet', a);
  }
  if (a.mode === 'panic') {
    a.modeT -= dt;
    if (a.modeT <= 0) {
      a.modeT = randRange(1.5, 3);
      const e = w.nearestEnemyAnywhere(a, 40);
      a.dh = e ? Math.atan2(a.x - e.x, a.z - e.z) + randRange(-0.8, 0.8) : a.heading + randRange(-1, 1);
      if (Math.hypot(a.x, a.z) > 300) a.dh = Math.atan2(-a.x, -a.z);
    }
    a.dspd = T.max; return;
  }
  if (a.fleeing) { fleeMount(w, a, dt); return; }
  if (a.mode === 'form') {
    if (reg.order === 'charge' && reg.targetReg) { a.mode = 'charge'; a.retarget = 0; w.emit('trumpet', a); }
    mountSlotSeek(w, a, dt); return;
  }
  if (reg.order !== 'charge') { a.mode = 'form'; return; }
  a.retarget -= dt;
  if (a.retarget <= 0 || !a.target || !w.isEnemy(a, a.target)) {
    a.retarget = 2;
    let t = reg.targetReg ? w.nearestInReg(a, reg.targetReg, 220) : null;
    if (!t) t = w.nearestEnemyAnywhere(a, 150, true);
    w.setTarget(a, t);
    if (!t) { a.mode = 'form'; return; }
  }
  const t = a.target;
  const p = w.steerTo(a, t.x, t.z, 1, dt) || [t.x, t.z];
  a.dh = Math.atan2(p[0] - a.x, p[1] - a.z);
  const d = Math.hypot(t.x - a.x, t.z - a.z);
  a.dspd = T.max * a.eager * (d < 60 || reg.charging ? 1 : 0.4);
  a.tdist = d;
}

export function thinkChr(w, a, dt) {
  const reg = a.reg, T = a.T;
  crewArchery(w, a, a.crew[1], dt, T.range);
  const driver = a.crew[0];
  if (!driver.alive) { a.dspd = Math.max(0, a.dspd - dt * 1.5); a.dh = a.heading; return; }
  riderMorale(w, a, dt);
  if (a.fleeing) { fleeMount(w, a, dt); return; }
  if (a.mode === 'form') {
    if (reg.order === 'charge' && reg.targetReg) { a.mode = 'charge'; a.px = NaN; }
    mountSlotSeek(w, a, dt); return;
  }
  if (reg.order !== 'charge') { a.mode = 'form'; return; }
  let dx = a.px - a.x, dz = a.pz - a.z;
  if (a.px !== a.px || Math.hypot(dx, dz) < 10) {
    let r = reg.targetReg && reg.targetReg.alive > 0 ? reg.targetReg : w.nearestEnemyReg(reg);
    if (!r) { a.mode = 'form'; return; }
    if (rand() < 0.5) r = w.nearestEnemyReg({ team: a.team, cx: a.x, cz: a.z }) || r;
    const ex = r.cx - a.x, ez = r.cz - a.z;
    const l = Math.hypot(ex, ez) || 1;
    a.px = r.cx + ex / l * 40 + randRange(-8, 8); a.pz = r.cz + ez / l * 40 + randRange(-8, 8);
    if (!w.nav.passable(a.px, a.pz, 1)) { a.px = r.cx; a.pz = r.cz; }
  }
  const p = w.steerTo(a, a.px, a.pz, 1, dt) || [a.px, a.pz];
  a.dh = Math.atan2(p[0] - a.x, p[1] - a.z);
  a.dspd = T.max * a.eager;
}

// ======================================================================= dogs
export function thinkDog(w, a, dt) {
  const reg = a.reg, T = a.T;
  a.attackCd -= dt;
  if ((a.id + w.stepN) % 20 === 0) scanThreats(w, a);
  updateMorale(w, a, dt);
  a.faceH = NaN;
  if (a.fleeing) {
    const hz = homeZ(a.team);
    moveToward(w, a, a.x, hz, T.max, 0, dt);
    if (Math.abs(a.z) > 320) a.state = S_GONE;
    return;
  }
  if (reg.order !== 'charge' || w.phase !== 'battle') { dogFollow(w, a, dt); return; }
  a.retarget -= dt;
  if (a.retarget <= 0 || !a.target || !w.isEnemy(a, a.target)) {
    a.retarget = 1;
    const t = w.nearestEnemy(a, 12) || w.nearestEnemyAnywhere(a, 150, true);
    w.setTarget(a, t);
  }
  const t = a.target;
  if (!t) { dogFollow(w, a, dt); return; }
  const d = w.distTo(a, t);
  a.tdist = d;
  if (d > a.radius + t.radius + 0.5) moveToward(w, a, t.x, t.z, T.max * a.eager, 0, dt);
  else {
    a.dvx = (t.x - a.x) * 0.5; a.dvz = (t.z - a.z) * 0.5;
    a.faceH = Math.atan2(t.x - a.x, t.z - a.z);
    if (a.attackCd <= 0) {
      a.attackCd = randRange(0.8, 1.4);
      a.q.rear = 0.8; // lunge
      const dx = t.x - a.x, dz = t.z - a.z, l = Math.hypot(dx, dz) || 1;
      w.emit('bite', a);
      if (t.kind === K_INF) {
        const dmg = randRange(10, 22);
        if (rand() < 0.3 * (1.3 - t.stamina * 0.5) && t.hp > dmg) { t.hp -= dmg; w.knockDown(t, dx / l * 2, 0.5, dz / l * 2, 0.5); }
        else w.damageInf(t, dmg, dx / l, dz / l, 1.5, a, 0);
        w.moraleHit(t, -0.04);
      } else if (t.kind === K_CAV || t.kind === K_CHR) {
        w.damageMount(t, randRange(12, 25), dx / l, dz / l);
        if (t.q) t.q.rear = 1;
      } else w.damageMount(t, randRange(4, 10), dx / l, dz / l);
    }
  }
}

function dogFollow(w, a, dt) {
  const reg = a.reg;
  reg.slotPos(a.slot, tmpS);
  moveToward(w, a, tmpS.x, tmpS.z, 3, 1, dt);
  if (Math.hypot(tmpS.x - a.x, tmpS.z - a.z) < 1.5) a.faceH = reg.facing;
}

export { K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, W_HAMMER, ACT_WORK };
