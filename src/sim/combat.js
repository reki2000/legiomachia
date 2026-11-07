// Combat resolution extracted from world.js: melee and missile damage, deaths
// and ragdolls, mount/crew losses, morale shocks and charge impacts.
// Every function takes the world as its first argument (w) and calls back
// through w.* for anything not extracted here, so behaviour (and the order
// of seeded rand() calls) is identical to the original World methods.
import { clamp, rand, randRange } from '../util.js';
import {
  poseHuman, setBasisYaw, J, W_BOW, W_SPEAR, W_PIKE, W_HAMMER,
  SH_NONE, SH_RECT, SH_SMALL, SEAT_GROUND, ACT_NONE, ACT_ATTACK, ACT_BLOCK,
} from '../anim/human.js';
import { Ragdoll } from './ragdoll.js';
import { WEAPONS, K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG, P_ROCK, P_JAV, P_BOLT } from './defs.js';
import { PROJ } from './projectiles.js';
import { computeMount, computeCrew } from './mounts.js';
import { Agent, isActive, S_ALIVE, S_DOWN, S_GETUP, S_DEAD, S_GONE } from './agent.js';

export function resolveMelee(w, att, ax, az, t, weapon, dmgMul, mounted) {
    const W = WEAPONS[weapon];
    // the man on the high ground hits harder
    if (w.stage.hilly && att) dmgMul *= 1 + clamp((att.y - t.y) * 0.04, -0.12, 0.16);
    let dx = t.x - ax, dz = t.z - az;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const fx = w.fx;
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
          if (W.shieldBreak && t.shield !== SH_NONE && rand() < W.shieldBreak * 0.3) { t.shield = SH_NONE; w.emit('shieldbreak', t); }
          w.emit('block', t);
          return;
        }
      }
      let dmg = randRange(W.dmg[0], W.dmg[1]) * dmgMul * (facing < -0.3 ? 1.5 : 1);
      if (att && att.droppedWeapon) dmg *= 0.45;   // fighting empty-handed
      if (W.closeDist && !mounted && l < W.closeDist) dmg *= W.closeMul;
      if (facing < -0.3) w.moraleHit(t, -0.05);
      w.damageInf(t, dmg, dx, dz, mounted ? 3.2 : 2.2, att, W.knock);
    } else {
      const dmg = randRange(W.dmg[0], W.dmg[1]) * dmgMul;
      const reachRider = t.kind === K_CAV || (t.kind === K_CHR && rand() < 0.5) || t.kind === K_ENG;
      const alive = t.crew ? t.crew.map((c, i) => (c.alive ? i : -1)).filter(i => i >= 0) : [];
      if (reachRider && alive.length && rand() < (W.antiCav ? 0.35 : 0.5)) {
        w.damageCrew(t, t.kind === K_CAV ? 0 : alive[Math.floor(rand() * alive.length)], dmg, dx, dz);
      } else {
        let k = t.kind === K_ELE ? 0.45 : t.kind === K_ENG ? 0.3 : t.kind === K_DOG ? 1.2 : 0.55;
        if (t.T.barding) k *= 0.6;
        w.damageMount(t, dmg * k * (W.antiCav ? 1.6 : 1), dx, dz);
      }
      if (fx) fx.blood(t.x, t.y + 1.1, t.z, dx, dz, 4);
    }
  }
export function damageInf(w, t, dmg, dx, dz, force, att, knock = 0) {
    t.hp -= dmg;
    // a heavily wounded man may fumble his weapon away (phase 1): he
    // fights on at reduced effect with the weapon hidden from his hand
    if (!t.droppedWeapon && t.hp > 0 && t.hp < t.maxHp * 0.22 && t.kind === K_INF && rand() < 0.22) {
      t.droppedWeapon = true; if (t.st) t.st.hideW = true;
    }
    t.lastHitT = w.time;
    if (w.fx) w.fx.blood(t.x, t.y + 1.2, t.z, dx * 1.5, dz * 1.5, dmg > 40 ? 8 : 4);
    w.moraleHit(t, -0.02);
    if (t.hp <= 0) {
      if (att) { w.kills[att.team]++; att.kills = (att.kills || 0) + 1; if (att.kind === K_INF) att.morale = Math.min(1.2, att.morale + 0.04); }
      const r = rand();
      if (r < 0.3) w.killInf(t, t.vx * 0.3, 0, t.vz * 0.3, dx * 0.5, 0, dz * 0.5, 0.2);
      else if (r < 0.8) w.killInf(t, t.vx * 0.4, 0.5, t.vz * 0.4, dx * force, 0.4, dz * force, 0.7);
      else w.killInf(t, t.vx * 0.5, 0.3, t.vz * 0.5, -dx * 0.8 + dz * 1.2, 0.2, -dz * 0.8 - dx * 1.2, 0.6);
      w.emit('death', t);
    } else if (knock && rand() < knock * (1.4 - t.stats.size * 0.5)) {
      w.knockDown(t, dx * force, 0.8, dz * force, 0.6);
      w.emit('hurt', t);
    } else {
      t.st.flinch = 1;
      if (t.st.action === ACT_ATTACK && t.st.actionT < 0.45) t.st.action = ACT_NONE;
      t.vx += dx * 1.6; t.vz += dz * 1.6;
      w.emit('hurt', t);
    }
  }
export function damageMount(w, t, dmg, dx, dz, cause) {
    if (t.state !== S_ALIVE) return;
    t.hp -= dmg;
    if (t.kind === K_CAV && dmg > 30 && rand() < 0.3) t.q.rear = 1;
    if (t.kind === K_ELE && t.mode !== 'panic') t.rage = 1;
    if (t.hp <= 0) w.killMount(t, dx, dz, cause);
  }
export function damageCrew(w, t, ci, dmg, dx, dz) {
    const c = t.crew[ci];
    if (!c || !c.alive) return;
    c.hp -= dmg;
    c.st.flinch = 1;
    if (c.hp <= 0) {
      w.dismount(t, ci, dx * 2, 0.5, dz * 2, true);
      if (t.kind === K_CAV) {
        t.riderless = true; t.mode = 'riderless'; t.modeT = 0; t.dspd = 8;
        w.setTarget(t, null);
        w.emit('riderdeath', t);
      }
    }
  }
export function missileHit(w, ax, ay, az, vx, vy, vz, team, type, dmgMul) {
    const P = PROJ[type];
    const n = w.query(ax, az, 2.5);
    const A = w.agents, q = w.qbuf;
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
          if (rand() < pb * P.shield) { if (w.fx) w.fx.sparks(ax, ay, az, 2); return 'shield'; }
        }
        // men carrying a ladder shelter under it
        if (t.carry && rand() < 0.85) { if (w.fx) w.fx.sparks(ax, ay, az, 1); return 'shield'; }
        const dmg = randRange(P.dmg[0], P.dmg[1]) * dmgMul * (hy > 1.5 ? 1.4 : 1);
        t.hp -= dmg;
        t.lastHitT = w.time;
        w.moraleHit(t, -0.03);
        if (w.fx) w.fx.blood(ax, ay, az, dx, dz, 4);
        if (t.hp <= 0) {
          w.kills[team]++;
          const f = type === P_JAV || type === P_BOLT ? 2.4 : 1.6;
          w.killInf(t, t.vx * 0.5, 0.2, t.vz * 0.5, dx * f, 0.2, dz * f, rand() < 0.5 ? 0.8 : 0.1);
          w.emit('death', t);
        } else if (P.knock && rand() < P.knock) w.knockDown(t, dx * 2, 0.5, dz * 2, 0.6);
        else t.st.flinch = 0.8;
        return 'body';
      }
      const d = w.distTo({ x: ax, z: az }, t);
      if (d > t.radius + 0.1) continue;
      const topH = t.kind === K_ELE ? 5.2 : t.kind === K_CAV ? (t.T.animal === 'camel' ? 3.2 : 2.5) : t.kind === K_DOG ? 0.8 : t.kind === K_ENG ? 3.2 : 2.4;
      if (hy < 0 || hy > topH) continue;
      if (type === P_ROCK) return 'rock';
      if (t.kind === K_ENG) {
        if (rand() < 0.93) { if (w.fx) w.fx.sparks(ax, ay, az, 1); return 'shield'; }
        const alive = t.crew.map((c, i) => (c.alive ? i : -1)).filter(i => i >= 0);
        if (alive.length) w.damageCrew(t, alive[Math.floor(rand() * alive.length)], randRange(35, 70), 0, 0);
        return 'body';
      }
      const crewH = t.kind === K_ELE ? 3.4 : t.kind === K_CAV ? (t.T.animal === 'camel' ? 2.2 : 1.6) : 1.3;
      if (t.crew && t.crew.length && hy > crewH) {
        const alive = t.crew.map((c, i) => (c.alive ? i : -1)).filter(i => i >= 0);
        if (alive.length && rand() < 0.7) {
          w.damageCrew(t, alive[Math.floor(rand() * alive.length)], randRange(P.dmg[0], P.dmg[1]) * dmgMul, vx * 0.05, vz * 0.05);
          return 'body';
        }
      }
      let km = t.kind === K_ELE ? 0.3 : 0.7;
      if (t.T.barding) km *= 0.45;
      w.damageMount(t, randRange(P.dmg[0], P.dmg[1]) * 0.6 * km * dmgMul, vx * 0.05, vz * 0.05);
      return 'body';
    }
    return null;
  }
export function rockImpact(w, x, y, z, vx, vz) {
    const R = PROJ[P_ROCK].splash;
    const n = w.query(x, z, R + 1);
    const A = w.agents, q = w.qbuf;
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
        if (t.hp <= 0) { w.killInf(t, bvx, 3 * f + 1, bvz, 0, 0, 0, -0.3); w.emit('death', t); }
        else w.knockDown(t, bvx, 3 * f + 1, bvz, -0.3);
      } else w.damageMount(t, randRange(60, 160) * f, nx, nz);
    }
    const st = w.stage;
    for (const g of st.gates) {
      if (!g.alive) continue;
      if (x > g.x0 - 3 && x < g.x1 + 3 && z > g.z0 - 3 && z < g.z1 + 3) {
        g.hp -= randRange(80, 160);
        if (g.hp <= 0 && w.engineering) w.engineering.breakGate(g);
      }
    }
    if (w.fire && rand() < 0.45) w.fire.ignite(x, z, 5);
    if (w.fx) { w.fx.dustBurst(x, y + 0.3, z, 16, 2.2); if (st.hasWater && st.WL > y - 0.2) w.fx.splash(x, st.WL, z, 12); }
    w.spawnDebris(x, y + 0.4, z, 5, 0.25, st.floorAt(x, z) > 3 ? 0x8a8478 : 0x6a5a40);
    w.emit('rock', { x, z });
  }
export function impact(w, a, b, relv, nx, nz) {
    const enemies = a.team !== b.team;
    let heavy = a, light = b, sgn = 1;
    if (b.mass > a.mass) { heavy = b; light = a; sgn = -1; }
    const ratio = heavy.mass / light.mass;
    const hx = nx * sgn, hz = nz * sgn;
    const fx = w.fx;
    if (ratio > 3 && light.kind === K_INF && heavy.kind !== K_DOG) {
      const panic = heavy.mode === 'panic' || heavy.riderless;
      if (!enemies && !panic && relv < 6) return false;
      if (relv < 2.6 || heavy.kind === K_ENG) return false;
      const lfx = Math.sin(light.heading), lfz = Math.cos(light.heading);
      const facing = -(lfx * hx + lfz * hz);
      const W = WEAPONS[light.weapon];
      if (enemies && W.antiCav && facing > 0.4 && (light.st.brace > 0.3 || light.st.combat > 0.5)) {
        if (heavy.kind === K_CAV && rand() < W.antiCav) {
          w.damageMount(heavy, 999, -hx, -hz, 'impale');
          w.emit('impale', heavy);
          if (rand() < 0.6) return false;
        } else if (heavy.kind === K_ELE) {
          w.damageMount(heavy, randRange(60, 160) * W.antiCav, -hx, -hz);
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
        if (light.hp <= 0) w.killInf(light, light.vx, 0.5, light.vz, 0, 0, 0, -0.4);
        return false;
      }
      const k = randRange(0.55, 1.0);
      const up = randRange(1.2, 2.2) + relv * 0.26 * (heavy.kind === K_ELE ? 1.4 : 1);
      const side = heavy.kind === K_ELE ? 0.8 : 0.4;
      const bvx = hvx * k + hx * relv * side, bvz = hvz * k + hz * relv * side;
      light.hp -= dmg;
      if (fx) { fx.dustBurst(light.x, light.y + 0.3, light.z, 4, 1); if (dmg > 40) fx.blood(light.x, light.y + 1.2, light.z, bvx, bvz, 6); }
      if (light.hp <= 0) { w.killInf(light, bvx, up, bvz, 0, 0, 0, -0.5); w.emit('death', light); }
      else w.knockDown(light, bvx, up, bvz, -0.5);
      w.moraleEvent(light, -0.04, 5);
      const loss = relv * (light.mass / heavy.mass) * (heavy.kind === K_ELE ? 1.2 : 2.2);
      heavy.vx -= hx * loss; heavy.vz -= hz * loss;
      heavy.hits++;
      w.emit('crash', heavy);
      return true;
    }
    if (ratio <= 3 && a.kind !== K_INF && b.kind !== K_INF && a.kind !== K_DOG && b.kind !== K_DOG) {
      if (enemies && relv > 5) {
        const dmg = relv * relv * 0.6;
        w.damageMount(light, dmg * randRange(0.6, 1.4) * ratio, hx, hz);
        w.damageMount(heavy, dmg * randRange(0.3, 0.9) / ratio, -hx, -hz);
        if (heavy.kind === K_CAV) heavy.q.rear = 1;
        if (light.kind === K_CAV) light.q.rear = 1;
        w.emit('crash', heavy);
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
      w.emit('clash', loser);
      if (relv > 5.5 && rand() < 0.35) {
        loser.hp -= randRange(5, 15);
        const bvx = winner.vx * 0.5 + px * relv * 0.35, bvz = winner.vz * 0.5 + pz * relv * 0.35;
        if (loser.hp <= 0) w.killInf(loser, bvx, 1.2, bvz, px * 1.5, 0, pz * 1.5, 0.6);
        else w.knockDown(loser, bvx, 1.2, bvz, 0.6);
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
export function killInf(w, a, vx, vy, vz, ix, iy, iz, topple) {
    if (a.state === S_DEAD || a.state === S_GONE) return;
    // buddy reaction (phase 1): the surviving partner flies into a rage
    // or breaks, weighted by his trait. Emitted as a world event so the
    // results-screen timeline can tell the story.
    const bd = a.buddy;
    if (bd && !a.buddyGone && bd.state === S_ALIVE && !bd.fleeing) {
      a.buddyGone = true;
      const tr = bd.stats.trait;
      const pRage = tr === 'berserk' ? 0.9 : tr === 'brave' ? 0.75 : tr === 'loyal' ? 0.65 : tr === 'veteran' ? 0.6 : tr === 'coward' ? 0.25 : 0.5;
      if (rand() < pRage) {
        bd.rageT = 25; bd.morale = Math.max(bd.morale, 0.8);
        w.emit('buddy', { a: bd, dead: a, kind: 'rage' });
      } else {
        bd.morale = Math.max(0.02, bd.morale - 0.38);
        if (rand() < 0.55) { bd.fleeing = true; w.setTarget(bd, null); }
        w.emit('buddy', { a: bd, dead: a, kind: 'break' });
      }
    }
    if (!a.rag) {
      if (a.state === S_GETUP && a.blendFrom) a.joints.set(a.blendFrom);
      else w.poseForRagdoll(a);
      a.rag = new Ragdoll(a.joints, a.weapon === W_BOW ? 'l' : 'r');
      w.ragList.push(a);
    }
    a.rag.kick(vx, vy, vz, ix, iy, iz, topple);
    a.state = S_DEAD; a.hp = 0;
    w.setTarget(a, null);
    a.vx = a.vz = 0;
    if (a.carry && w.engineering) w.engineering.dropCarry(a);
    w.moraleEvent(a, -0.035, 5);
    if (w.command) w.command.onDeath(a);
  }
export function knockDown(w, a, vx, vy, vz, topple) {
    if (a.state !== S_ALIVE && a.state !== S_GETUP) return;
    if (a.state === S_GETUP && a.blendFrom) a.joints.set(a.blendFrom);
    else w.poseForRagdoll(a);
    a.rag = new Ragdoll(a.joints, a.weapon === W_BOW ? 'l' : 'r');
    a.rag.kick(vx, vy, vz, 0, 0, 0, topple);
    w.ragList.push(a);
    a.state = S_DOWN; a.downT = 0;
    w.setTarget(a, null);
    a.st.action = ACT_NONE;
    a.vx = a.vz = 0;
    if (a.carry && w.engineering) w.engineering.dropCarry(a);
  }
export function killMount(w, a, dx, dz, cause) {
    if (a.state === S_DEAD) return;
    a.state = S_DEAD; a.hp = 0;
    w.setTarget(a, null);
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
      if (a.kind === K_ENG) { w.dismount(a, i, 0, 0.3, 0, false); continue; }
      w.dismount(a, i, a.vx * 0.9, randRange(1.5, 3) + sp * 0.12, a.vz * 0.9, rand() < 0.25 + sp * 0.02);
    }
    w.moraleEvent(a, a.kind === K_ELE ? -0.1 : -0.04, a.kind === K_ELE ? 15 : 6);
    w.emit('mountdeath', a);
    if (w.command) w.command.onDeath(a);
  }
export function dismount(w, a, ci, vx, vy, vz, dies) {
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
    w.addAgent(n);
    n.y = w.stage.floorAt(n.x, n.z);
    a.reg.agents.push(n);
    n.rag = new Ragdoll(n.joints, n.weapon === W_BOW ? 'l' : 'r');
    n.rag.kick(vx, vy, vz, 0, 0, 0, a.kind === K_CAV ? 0.5 : 0.2);
    w.ragList.push(n);
    if (dies) { n.state = S_DEAD; n.hp = 0; }
    else { n.state = S_DOWN; n.hp -= randRange(10, 50); n.downT = 0; if (n.hp <= 0) n.state = S_DEAD; }
    if (w.command) w.command.onDeath(a);
    return n;
  }
export function getUp(w, a) {
    const p = a.rag.x;
    const st = w.stage;
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
export function poseForRagdoll(w, a) {
    const B = setBasisYaw(a.basis, a.x, a.y, a.z, a.heading);
    poseHuman(a.joints, a.st, a.weapon, a.shield, SEAT_GROUND, B);
  }
export function moraleHit(w, a, d) { a.morale += d * (1.35 - a.baseMorale * 0.5); }
export function moraleEvent(w, a, d, R) {
    const n = w.query(a.x, a.z, R);
    const A = w.agents, q = w.qbuf;
    for (let k = 0; k < n; k++) {
      const t = A[q[k]];
      if (t.team !== a.team || t === a) continue;
      w.moraleHit(t, d);
    }
  }
