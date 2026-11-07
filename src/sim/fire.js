// Fire: trees (burnforest) and city houses/tents (firestorm) can catch fire,
// spread to neighbours, hurt men nearby and choke the field with smoke.
// Approximation (documented in README): smoke is a single global sight factor
// (world.fireVisMul, applied in World.nearestEnemyAnywhere) scaled by how much
// is burning, instead of a per-position smoke field; a burnt house keeps its
// standing mesh (the stage renderer is static) but may collapse in the raster.
import { rand } from '../util.js';
import { isActive } from './agent.js';

const BURN_T = 55;          // seconds a flammable burns before it is spent
const SPREAD_EVERY = 11;    // seconds between spread attempts per burning item
const SPREAD_R = 13;        // metres a fire can jump
const HURT_R = 6, HURT_DPS = 7;

export class FireSystem {
  constructor(world) {
    this.w = world;
    this.items = []; // { x, z, r, kind:'tree'|'struct', ref, state:0|1|2, t, spreadT }
    const st = world.stage;
    if (st.trees) for (const t of st.trees) this.items.push({ x: t.x, z: t.z, r: 2.5, kind: 'tree', ref: t, state: 0, t: 0, spreadT: 0 });
    if (st.structs) for (const s of st.structs) {
      if (s.type !== 'house' && s.type !== 'tent' && s.type !== 'warehouse') continue;
      this.items.push({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, r: Math.max(s.x1 - s.x0, s.z1 - s.z0) / 2, kind: 'struct', ref: s, state: 0, t: 0, spreadT: 0 });
    }
    this.burning = 0;
    this.hurtT = 0;
    world.fireVisMul = 1;
  }
  // ignite the nearest unburnt flammable within r of (x,z); returns it or null
  ignite(x, z, r = 4) {
    let best = null, bd = r;
    for (const it of this.items) {
      if (it.state !== 0) continue;
      const d = Math.hypot(it.x - x, it.z - z) - it.r;
      if (d < bd) { bd = d; best = it; }
    }
    if (best) this.light(best);
    return best;
  }
  light(it) {
    if (it.state !== 0) return;
    it.state = 1; it.t = 0; it.spreadT = SPREAD_EVERY * (0.5 + rand());
    this.burning++;
    if (it.kind === 'tree') it.ref.burning = true;
    this.w.emit('ignite', { x: it.x, z: it.z, cx: it.x, cz: it.z });
  }
  update(dt) {
    const w = this.w, st = w.stage;
    if (w.phase !== 'battle') return;
    let any = false;
    for (const it of this.items) {
      if (it.state !== 1) continue;
      any = true;
      it.t += dt;
      it.spreadT -= dt;
      if (it.spreadT <= 0) {
        it.spreadT = SPREAD_EVERY * (0.6 + rand() * 0.8);
        // jump to a random neighbour in range (seeded rand: deterministic per seed)
        const near = this.items.filter(o => o.state === 0 && Math.hypot(o.x - it.x, o.z - it.z) < SPREAD_R + o.r);
        if (near.length && rand() < 0.55) this.light(near[Math.floor(rand() * near.length)]);
      }
      if (it.t >= BURN_T) {
        it.state = 2; this.burning--;
        if (it.kind === 'tree') {
          it.ref.burning = false; it.ref.burnt = true;
          // charcoal: the raster block goes, men can walk through again
          st.setRect(it.x - 1, it.z - 1, it.x + 1, it.z + 1, null);
          st.changed(it.x - 2, it.z - 2, it.x + 2, it.z + 2);
        } else if (rand() < 0.5) {
          // half the burnt houses collapse into rubble in the raster (mesh stays, see header)
          const s = it.ref;
          st.setRect(s.x0, s.z0, s.x1, s.z1, null);
          st.changed(s.x0, s.z0, s.x1, s.z1);
        }
        w.emit('burnout', { x: it.x, z: it.z, cx: it.x, cz: it.z });
      }
      // flames lick at anyone standing in them
      if (w.fx && rand() < dt * 6) w.fx.dustBurst(it.x, st.floorAt(it.x, it.z) + 1, it.z, 2, 1.6);
    }
    // smoke: the more burns, the less anyone can see (global approximation)
    w.fireVisMul = 1 - Math.min(0.45, this.burning * 0.02);
    // damage tick, once a second
    this.hurtT -= dt;
    if (any && this.hurtT <= 0) {
      this.hurtT = 1;
      for (const it of this.items) {
        if (it.state !== 1) continue;
        const n = w.query(it.x, it.z, HURT_R + it.r);
        for (let k = 0; k < n; k++) {
          const a = w.agents[w.qbuf[k]];
          if (!isActive(a)) continue;
          const d = Math.hypot(a.x - it.x, a.z - it.z);
          if (d > HURT_R + it.r + a.radius) continue;
          if (a.kind === 0) w.damageInf(a, HURT_DPS, (a.x - it.x) / (d || 1), (a.z - it.z) / (d || 1), 0.6, null, 0);
          else w.damageMount(a, HURT_DPS * 0.5, (a.x - it.x) / (d || 1), (a.z - it.z) / (d || 1), 'fire');
        }
      }
    }
  }
}
