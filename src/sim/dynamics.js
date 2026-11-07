// Dramatic stage dynamics, built on the timed stage-event system (stageEvents.js):
//   flood     - an upstream dam breaks mid-battle and the river rises
//   landslide - an earthquake drops a rockfall across the canyon neck
//   frozen    - the ice sheet cracks under the heaviest units
//   naval     - Kingdom galleys row in and board the harbour side
//   firestorm - fires keep breaking out among the city houses (fire.js does the burning)
// Times are jittered from the battle seed, deterministically.
import { clamp, rand, randRange } from '../util.js';
import { F_HOUSE, F_PONTOON } from './stage.js';
import { isActive } from './agent.js';

export function setupDynamics(world) {
  const d = new Dynamics(world);
  world.dynamics = d;
  return d;
}

export class Dynamics {
  constructor(world) {
    this.w = world;
    const st = world.stage, ev = world.stageEvents;
    const jitter = (base, spread) => base + ((world.seed || 7) % 13) / 13 * spread;
    if (st.id === 'flood') {
      this.floodT = jitter(225, 30);
      ev.at(this.floodT - 30, 'floodwarn', w => { w.emit('floodwarn', {}); w.emit('horn', {}); });
      ev.at(this.floodT, 'flood', w => this.startFlood(w));
      this.flood = null;
    } else if (st.id === 'landslide') {
      ev.at(jitter(150, 40), 'quake', w => {
        w.shake = 1.6;
        w.emit('quake', {});
        w.stageEvents.after(1.6, 'rockfall', w2 => this.rockfall(w2));
      });
    } else if (st.id === 'frozen') {
      this.crack = new Map(); // cell key -> load seconds of very heavy units
      this.crackT = 0;
    } else if (st.id === 'naval') {
      this.setupGalleys(world);
    } else if (st.id === 'firestorm') {
      // the first fires come with the bombardment; after that, one every ~50 s
      for (let i = 0; i < 6; i++) ev.at(55 + i * 52, 'cityfire' + i, w => { if (w.fire) w.fire.ignite(randRange(-st.city.L * 0.7, st.city.L * 0.7), randRange(st.city.z1 + 14, st.city.zb - 10), 16); });
    }
  }

  // ------------------------------------------------------------ flood
  // Evacuation model: while the water is rising (and afterwards — the flood
  // stays), a scan every 0.5 s looks at every non-manual regiment. If the
  // water at its centre is already wading depth (> 0.55 m) against the FINAL
  // level, the regiment is ordered to the nearest sampled point that stays
  // dry at the final level and flagged floodEvac, which makes the command
  // AI leave it alone until its centre is dry again. This replaces the old
  // one-shot order at flood start, which regiments could be dragged away
  // from by combat long before the water actually arrived — men drowned in
  // place because their regiment was still fighting in the channel.
  startFlood(w) {
    const st = w.stage;
    this.flood = { from: st.WL, to: 0.35, t: 0, dur: 30, lastStep: 0 };
    this.floodFinalWL = 0.35;
    this.evacT = 0;
    w.emit('flood', {});
  }
  // nearest point near (x, z) that stays dry at the final water level;
  // searches away from the river first, then along the banks
  dryPoint(st, x, z) {
    const rz = st.riverZ(x), side = z >= rz ? 1 : -1, need = this.floodFinalWL + 0.25;
    const dirs = [[0, side], [0.7, side * 0.7], [-0.7, side * 0.7], [1, 0], [-1, 0], [0, -side]];
    for (const [dx, dz] of dirs) {
      for (let d = 12; d <= 110; d += 12) {
        const px = x + dx * d, pz = z + dz * d;
        if (st.floorAt(px, pz) > need && Math.abs(pz - st.riverZ(px)) < st.river.half + 90) return { x: px, z: pz };
      }
    }
    return { x, z: rz + side * (st.river.half + 40) };
  }
  evacScan(w) {
    const st = w.stage;
    for (const r of w.regs) {
      if (r.alive === 0) continue;
      const depthFinal = this.floodFinalWL - st.floorAt(r.cx, r.cz);
      if (r.floodEvac) {
        // dry again (or shoved back onto a bridge/bank): hand the regiment back
        if (this.floodFinalWL - st.floorAt(r.cx, r.cz) < 0.15) r.floodEvac = false;
        continue;
      }
      if (r.manual) continue;
      if (depthFinal > 0.55 && Math.abs(r.cz - st.riverZ(r.cx)) < st.river.half + 30) {
        const p = this.dryPoint(st, r.cx, r.cz);
        r.floodEvac = true;
        w.orderMove(r, p.x, p.z);
      }
    }
  }
  updateFlood(dt) {
    const st = this.w.stage, w = this.w;
    // evacuation scanning runs from the moment the dam breaks, forever after
    if (this.floodFinalWL !== undefined && w.phase === 'battle') {
      this.evacT -= dt;
      if (this.evacT <= 0) { this.evacT = 0.5; this.evacScan(w); }
    }
    const f = this.flood;
    if (!f) return;
    f.t += dt;
    const k = clamp(f.t / f.dur, 0, 1);
    st.WL = f.from + (f.to - f.from) * k;
    // resample navigation as the water rises. The step is 0.05 of the rise
    // (every 1.5 s of the 30 s rise, 20 steps instead of the old 5) so the
    // walkable shore moves in small increments instead of jumping; bridges
    // stay dry (their decks stand above the new level) and pontoons are
    // re-floated. Still staged, not continuous — see README.
    if (k - f.lastStep >= 0.05 || (k >= 1 && f.lastStep < 1)) {
      f.lastStep = k;
      for (const p of st.pontoons) if (p.done) st.setRect(p.x - p.width / 2, Math.min(p.z0, p.z0 + p.dir * p.total), p.x + p.width / 2, Math.max(p.z0, p.z0 + p.dir * p.total), (x, z) => Math.max(st.terrain(x, z) + 0.05, st.WL + 0.3), F_PONTOON);
      const X = Math.min(490, 420 * st.S);
      st.changed(-X, -(st.river.half + 30), X, st.river.half + 30);
    }
    if (k >= 1) this.flood = null;
  }

  // ------------------------------------------------------------ landslide
  rockfall(w) {
    const st = w.stage;
    const half = st.canyonHalf(0);
    const top = (x, z) => st.terrain(x, z) + 7;
    st.setRect(-half - 2, -6, half + 2, 6, top, F_HOUSE);
    st.changed(-half - 4, -8, half + 4, 8);
    st.rubble = { x0: -half - 2, z0: -6, x1: half + 2, z1: 6, hp: 120, maxHp: 120, alive: true };
    for (let i = 0; i < 42; i++) w.spawnDebris(randRange(-half, half), st.terrain(randRange(-half, half), 0) + 5, randRange(-5, 5), 1, randRange(0.7, 1.4), 0x8a8578, 4);
    w.emit('rockfall', { cx: 0, cz: 0 });
    // men caught under it are crushed
    for (const a of w.agents) {
      if (!isActive(a) || Math.abs(a.x) > half || Math.abs(a.z) > 6) continue;
      if (a.kind === 0) w.damageInf(a, 999, 0, 1, 1, null, 0); else w.damageMount(a, 999, 0, 1, 'rockfall');
    }
  }
  clearRubble() {
    const st = this.w.stage, r = st.rubble;
    if (!r || !r.alive) return;
    r.alive = false;
    st.setRect(r.x0, r.z0, r.x1, r.z1, null);
    st.changed(r.x0 - 2, r.z0 - 2, r.x1 + 2, r.z1 + 2);
    this.w.emit('rubbleclear', { cx: 0, cz: 0 });
  }

  // ------------------------------------------------------------ frozen river
  updateFrozen(dt) {
    const w = this.w, st = w.stage;
    this.crackT -= dt;
    if (this.crackT > 0) return;
    this.crackT = 0.5;
    for (const a of w.agents) {
      if (!isActive(a) || a.swimming) continue;
      // only the heaviest: elephants and siege engines (and laden wagons)
      if (!(a.kind === 2 || a.kind === 5)) continue;
      if (!st.iceAt(a.x, a.z)) continue;
      const key = Math.floor(a.x / 6) + ':' + Math.floor(a.z / 6);
      const v = (this.crack.get(key) || 0) + 0.5;
      this.crack.set(key, v);
      if (v > 2.5 + rand() * 3) {
        this.crack.delete(key);
        const cx = Math.floor(a.x / 6) * 6 + 3, cz = Math.floor(a.z / 6) * 6 + 3;
        st.setRect(cx - 4, cz - 4, cx + 4, cz + 4, null);
        st.changed(cx - 5, cz - 5, cx + 5, cz + 5);
        w.emit('icecrack', { x: a.x, z: a.z, cx: a.x, cz: a.z });
        if (w.fx) w.fx.splash(a.x, st.WL, a.z, 10);
      }
    }
  }

  // ------------------------------------------------------------ naval (harbour)
  setupGalleys(w) {
    const st = w.stage;
    // marines start aboard their galleys, off the field like the landing troops
    this.galleys = st.galleys || [];
    for (const g of this.galleys) { g.state = 'row'; g.plank = false; }
    const aboard = [];
    for (const r of w.regs) if (r.galley !== undefined) aboard.push(r);
    for (const r of aboard) {
      r.aboard = r.agents.slice();
      r.agents = []; r.slotMap = []; r.alive = 0;
    }
    if (aboard.length) w.agents = w.agents.filter(a => a.reg.galley === undefined);
    w.agents.forEach((a, i) => { a.idx = i; });
  }
  updateNaval(dt) {
    const w = this.w, st = w.stage, H = st.harbor;
    if (w.phase !== 'battle') return;
    for (const g of this.galleys) {
      if (g.state === 'boarded') continue;
      // row north to a berth just off the beach, east / west of the basin mouth
      const tx = g.berthX, tz = st.shoreZ(g.berthX) - 4;
      const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
      if (d > 2) {
        const v = Math.min(3.2, d);
        g.heading = Math.atan2(dx, dz);
        g.x += Math.sin(g.heading) * v * dt; g.z += Math.cos(g.heading) * v * dt;
        g.oar = (g.oar || 0) + dt * 2;
        continue;
      }
      // alongside: throw a gangplank to the shore and loose the marines
      g.state = 'boarded'; g.plank = true;
      st.setRect(g.x - 1.5, g.z - 1, g.x + 1.5, tz + 6, st.WL + 0.9, F_PONTOON);
      st.changed(g.x - 3, g.z - 2, g.x + 3, tz + 7);
      w.emit('galley', { cx: g.x, cz: g.z });
      for (const r of w.regs) {
        if (r.galley !== this.galleys.indexOf(g)) continue;
        const men = r.aboard || [];
        r.aboard = null;
        men.forEach((a, i) => {
          a.x = g.x + (i % 4 - 1.5) * 1.1; a.z = g.z + Math.floor(i / 4) * 1.1;
          a.prevX = a.x; a.prevZ = a.z; a.heading = 0;
          w.addAgent(a); r.agents.push(a);
        });
        r.alive = r.agents.length; r.slotMap = r.agents.slice();
        r.cx = g.x; r.cz = g.z;
        const e = w.nearestEnemyReg(r);
        if (e) w.orderCharge(r, e);
      }
      if (w.command) w.command.setup();
    }
  }

  update(dt) {
    const st = this.w.stage;
    if (this.w.shake > 0) this.w.shake = Math.max(0, this.w.shake - dt * 0.8);
    if (st.id === 'flood') this.updateFlood(dt);
    else if (st.id === 'frozen') { if (this.w.phase === 'battle') this.updateFrozen(dt); }
    else if (st.id === 'naval') this.updateNaval(dt);
    else if (st.id === 'landslide' && st.rubble && st.rubble.alive && st.rubble.hp <= 0) this.clearRubble();
  }
}
