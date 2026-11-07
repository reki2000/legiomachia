// Victory conditions. The battle always ends when one side has no men left; the modes add
// other ways to win:
//   capture   - hold the marked ground (a flag) against the enemy until the meter is full
//   reinforce - fresh regiments arrive from the edges of the map while the battle rages
import { K_INF, K_ENG } from './defs.js';
import { S_ALIVE, S_DEAD, S_GONE, isActive } from './agent.js';

export const MODES = { annihilate: '殲滅戦', capture: '拠点占領', reinforce: '増援', escort: '輜重護衛' };

const TEAMS = ['軍団', '東方王国'];   // fallback; era packs override via world.factionNames
const CAPTURE_SECS = 45;        // time to take an undefended point
const HOLD_LIMIT = 540;         // defenders win by holding out this long (asymmetric stages)
const ESCORT_LIMIT = 600;       // escort: defenders win by holding the convoy this long (the route is ~500 m ≈ 265 s of pure travel, plus the battle in between)
const ESCORT_N = 5;             // wagons in the convoy

export class Objective {
  constructor(world, mode, builder) {
    const st = world.stage;
    this.w = world; this.b = builder; this.st = st;
    // escorting only makes sense on open ground, where both armies can run.
    // Unknown modes fall back to annihilate (this is also how old
    // ?mode=retreat URLs behave since the retreat mode was removed).
    this.mode = mode === 'escort' && st.kind !== 'field' ? 'annihilate' : (MODES[mode] ? mode : 'annihilate');
    this.point = null; this.exit = null; this.waves = [];
    this.meter = 0;           // capture progress: +1 = the Legion holds the point, -1 = the Kingdom
    this.symmetric = st.kind === 'field';
    this.escaped = 0;   // generic "units that left the field" counter (landing/retreat-era bookkeeping kept for status use)
    this.wagons = []; this.wagonTotal = 0; this.wagonEscaped = 0; this.wagonLost = 0; this.wagonExit = null;
    this.result = null;
    if (this.mode === 'capture') this.setupCapture();
    else if (this.mode === 'reinforce') this.setupWaves();
    else if (this.mode === 'escort') this.setupEscort();
  }

  elapsed() { return this.w.time - (this.w.battleT0 || 0); }

  // ------------------------------------------------------------ capture
  setupCapture() {
    const st = this.st;
    let x = 0, z = 0, r = 30;
    if (st.id === 'village' && st.villageSquare) ({ x, z, r } = st.villageSquare);
    else if (st.kind === 'river') { x = 0; z = st.riverZ(0) + st.river.half + 28; r = 28; }
    else if (st.kind === 'harbor') ({ x, z, r } = st.harbor.square);
    else if (st.kind === 'siege') { const C = st.city; z = (C.z1 + C.zb) / 2; r = 24; }
    else if (st.id === 'forest') x = st.forestLaneX || 0;
    this.point = { x, z, r };
  }
  updateCapture(dt) {
    const p = this.point, A = this.w.agents;
    let n0 = 0, n1 = 0;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!isActive(a) || a.kind === K_ENG || a.fleeing) continue;
      const dx = a.x - p.x, dz = a.z - p.z;
      if (dx * dx + dz * dz > p.r * p.r) continue;
      const wgt = a.kind === K_INF ? 1 : 2;
      if (a.team === 0) n0 += wgt; else n1 += wgt;
    }
    this.n0 = n0; this.n1 = n1;
    const rate = dt / CAPTURE_SECS;
    if (n0 >= 8 && n0 > 1.5 * n1) this.meter += rate;
    else if (n1 >= 8 && n1 > 1.5 * n0) this.meter -= this.symmetric ? rate : rate * 0.5;
    this.meter = Math.max(this.symmetric ? -1 : 0, Math.min(1, this.meter));
  }

  // ------------------------------------------------------------ reinforcements
  setupWaves() {
    const st = this.st, b = this.b;
    const X = v => v * st.S;
    // the Legion's reinforcements come ashore on the beaches when the field ends in the sea
    const zS = st.kind === 'siege' ? -150 : st.kind === 'harbor' ? st.harbor.shore + 22 * st.S : -190, zN = st.kind === 'river' ? 150 : 180;
    const red = [
      [75, 'sword', 12, 5, X(st.harbor ? -170 : -60), zS, '増援 第5大隊', 0.65],
      [75, 'sword', 12, 5, X(st.harbor ? 170 : 60), zS, '増援 第6大隊', 0.65],
      [95, 'cav', 8, 3, X(st.harbor ? 230 : 0), zS - (st.harbor ? 0 : 10), '増援 騎兵', 0.6],
    ];
    // the Kingdom's relief force: behind the walls it is the attackers' rear that it falls upon
    const blue = st.kind === 'siege'
      ? [[140, 'cav', 8, 3, X(-70), -165, '救援騎兵 I', 0.6, 0], [140, 'cav', 8, 3, X(70), -165, '救援騎兵 II', 0.6, 0], [150, 'axe', 12, 5, 0, -175, '救援斧兵', 0.5, 0]]
      : [[110, 'pike', 14, 6, X(-50), zN, '増援 ファランクス', 0.6], [110, 'ele', 2, 1, X(20), zN + 12, '増援 戦象', 0.5], [125, 'hcav', 8, 3, X(60), zN, '増援 弓騎兵', 0.6]];
    for (const [t, type, c, r, x, z, name, q] of red) this.waves.push({ t, team: 0, type, c, r, x, z, name, q, done: false });
    for (const [t, type, c, r, x, z, name, q, facing] of blue) this.waves.push({ t, team: 1, type, c, r, x, z, name, q, facing, done: false });
    this.waves.sort((a, b2) => a.t - b2.t);
    void b;
  }
  updateWaves() {
    const t = this.elapsed(), w = this.w;
    const arrived = [[], []];
    for (const wv of this.waves) {
      if (wv.done || t < wv.t) continue;
      wv.done = true;
      const o = { wing: '増援', q: wv.q, fixed: wv.type === 'ele' };
      if (wv.facing !== undefined) o.facing = wv.facing;
      this.b.reg(wv.team, wv.type, wv.c, wv.r, wv.x, wv.z, wv.name, o);
      arrived[wv.team].push(wv.name);
    }
    for (let team = 0; team < 2; team++) if (arrived[team].length) { w.command.setup(); w.emit('reinforce', { team, names: arrived[team] }); }
  }

  // ------------------------------------------------------------ escort
  setupEscort() {
    const st = this.st, b = this.b, w = this.w;
    const canyon = !!st.canyon;
    this.exitDef = canyon ? { axis: 'z', at: 250 } : { axis: 'x', at: 255 };
    this.wagonExit = this.exitDef;
    this.exit = null;
    this.wagons = [];
    for (let i = 0; i < ESCORT_N; i++) {
      let x, z, facing, goal;
      if (canyon) { x = 0; z = -230 - i * 13; facing = 0; goal = { x: 0, z: 255 }; }
      else { x = -240; z = -30 + i * 14; facing = Math.PI / 2; goal = { x: 260, z }; }
      const reg = b.reg(0, 'wagon', 1, 1, x, z, `輜重車 ${i + 1}`, { wing: '輜重', fixed: true, facing });
      const a = reg.agents[0];
      if (a) { a.escortGoal = goal; this.wagons.push(a); }
    }
    this.wagonTotal = this.wagons.length;
    this.wagonEscaped = 0; this.wagonLost = 0;
    this.repositionEscortArmy();
    // canyon: also push the Kingdom 50 m further up the pass, so the
    // convoy's screen can form before the meeting engagement starts
    if (st.canyon) {
      for (const r of w.regs) {
        if (r.team !== 1) continue;
        r.az += 50; r.cz += 50;
        for (const a of r.agents) { a.z += 50; if (a.prevZ !== undefined) a.prevZ += 50; a.pz += 50; a.y = w.stage.floorAt(a.x, a.z); }
      }
    }
    if (w.command) w.command.setup();
  }
  // The scenario deploys the Legion as a battle line facing the Kingdom,
  // which can leave the convoy starting 200 m behind its own army — the
  // escorts spent the first minutes marching back while cavalry rode
  // around the flank and killed wagons. On open stages, translate the
  // whole Legion toward the exit side (the same army-translation trick
  // other setups use) so its
  // centre sits on the convoy; the army then advances with the wagons.
  // Skipped where solid scenery (forest trees, village houses) could swallow
  // a shifted regiment.
  repositionEscortArmy() {
    const st = this.st, w = this.w;
    if (!['field', 'hills', 'canyon', 'ambush', 'landslide'].includes(st.id)) return;
    if (!this.wagons.length) return;
    let wx = 0, wz = 0;
    for (const a of this.wagons) { wx += a.x; wz += a.z; }
    wx /= this.wagons.length; wz /= this.wagons.length;
    const regs = w.regs.filter(r => r.team === 0 && r.type !== 'wagon');
    if (!regs.length) return;
    let cx = 0, cz = 0;
    for (const r of regs) { cx += r.cx; cz += r.cz; }
    cx /= regs.length; cz /= regs.length;
    const cl = v => Math.max(-165, Math.min(165, v));
    // offset the army 55 m toward the enemy side of the convoy, so the
    // regiments form a screen ahead of the wagons instead of a crowd
    // mixed in with them (in the canyon neck that crowd collapsed as one)
    const canyon = !!st.canyon;
    const ox = canyon ? 0 : 55, oz = canyon ? 55 : 0;
    const dx = cl(wx - cx + ox), dz = cl(wz - cz + oz);
    if (Math.hypot(dx, dz) < 60) return;
    for (const r of regs) {
      r.ax += dx; r.az += dz; r.cx += dx; r.cz += dz;
      if (r.px !== undefined) { r.px += dx; r.pz += dz; }
      for (const a of r.agents) {
        a.x += dx; a.z += dz;
        if (a.prevX !== undefined) a.prevX += dx;
        if (a.prevZ !== undefined) a.prevZ += dz;
        a.px += dx; a.pz += dz;
        a.y = w.stage.floorAt(a.x, a.z);
      }
    }
  }
  updateEscort() {
    const ex = this.exitDef || this.wagonExit;
    if (!ex) return;
    for (const a of this.wagons) {
      if (!a || a.escortCounted) continue;
      if (a.state === S_DEAD) {
        a.escortCounted = true; this.wagonLost++;
        this.w.emit('escortlost', { team: 0 });
        continue;
      }
      if (a.state !== S_ALIVE) continue;
      const past = ex.axis === 'x' ? a.x > ex.at : a.z > ex.at;
      if (past) {
        a.state = S_GONE; a.escortCounted = true; this.wagonEscaped++;
        this.w.emit('escortexit', { team: 0 });
      }
    }
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    if (this.w.phase !== 'battle' || this.result) return;
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.25) return;       // 4 Hz is plenty
    dt = this.acc; this.acc = 0;
    if (this.mode === 'capture') this.updateCapture(dt);
    else if (this.mode === 'reinforce') this.updateWaves();
    else if (this.mode === 'escort') this.updateEscort();
  }

  // c = [Legion men, Kingdom men]; returns { winner, text } once the battle is decided
  check(c) {
    if (this.result) return this.result;
    const win = (winner, why) => (this.result = { winner, text: `${(this.w.factionNames || TEAMS)[winner]}の勝利${why ? ' ― ' + why : ''}` });
    if (this.mode === 'capture') {
      if (this.meter >= 1) return win(0, '拠点を占領');
      if (this.meter <= -1) return win(1, '拠点を確保');
      if (!this.symmetric && this.elapsed() > HOLD_LIMIT) return win(1, '拠点を守り抜いた');
    }
    if (this.mode === 'escort' && this.wagonTotal) {
      const need = Math.ceil(this.wagonTotal / 2);
      if (this.wagonEscaped >= need) return win(0, `${this.wagonEscaped}台が到着`);
      if (this.wagonLost >= need) return win(1, '輜重を壊滅');
      if (this.elapsed() > ESCORT_LIMIT) return win(1, '輜重を阻んだ');
    }
    if (c[1] === 0) return win(0, '');
    if (c[0] === 0) return win(1, '');
    return null;
  }

  status() {
    const t = this.elapsed();
    const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
    if (this.mode === 'capture') {
      const m = this.meter, FN = this.w.factionNames || TEAMS, who = m > 0.02 ? FN[0] : m < -0.02 ? FN[1] : '中立';
      const tail = this.symmetric ? '' : ` ・ 防衛側の勝利まで ${mmss(HOLD_LIMIT - t)}`;
      return `拠点: ${who} ${Math.round(Math.abs(m) * 100)}% (${FN[0]} ${this.n0 || 0} : ${FN[1]} ${this.n1 || 0})${tail}`;
    }
    if (this.mode === 'reinforce') {
      const next = this.waves.filter(w => !w.done).map(w => `${(this.w.factionNames || TEAMS)[w.team]} ${Math.max(0, Math.ceil(w.t - t))}秒`);
      return next.length ? `次の増援: ${next.slice(0, 2).join(' / ')}` : '増援はすべて到着';
    }
    if (this.mode === 'escort') {
      const need = Math.ceil((this.wagonTotal || ESCORT_N) / 2);
      return `輜重 到着 ${this.wagonEscaped}/${need} ・ 喪失 ${this.wagonLost} ・ 残り ${mmss(ESCORT_LIMIT - t)}`;
    }
    return '';
  }
}
