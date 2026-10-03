// Victory conditions. The battle always ends when one side has no men left; the modes add
// other ways to win:
//   capture   - hold the marked ground (a flag) against the enemy until the meter is full
//   reinforce - fresh regiments arrive from the edges of the map while the battle rages
//   retreat   - the Legion must get enough of its men off the field before time runs out
import { K_INF, K_ENG } from './defs.js';
import { S_ALIVE, S_GONE, isActive } from './agent.js';

export const MODES = { annihilate: '殲滅戦', capture: '拠点占領', reinforce: '増援', retreat: '離脱戦' };

const TEAMS = ['軍団', '東方王国'];
const CAPTURE_SECS = 45;        // time to take an undefended point
const HOLD_LIMIT = 540;         // defenders win by holding out this long (asymmetric stages)
const RETREAT_NEED = 0.5;       // share of the Legion that must get away
const RETREAT_LIMIT = 360;

export class Objective {
  constructor(world, mode, builder) {
    const st = world.stage;
    this.w = world; this.b = builder; this.st = st;
    // retreating only makes sense on open ground, where both armies can run
    this.mode = mode === 'retreat' && st.kind !== 'field' ? 'annihilate' : (MODES[mode] ? mode : 'annihilate');
    this.point = null; this.exit = null; this.waves = [];
    this.meter = 0;           // capture progress: +1 = the Legion holds the point, -1 = the Kingdom
    this.symmetric = st.kind === 'field';
    this.escaped = 0; this.initial0 = 0;
    this.result = null;
    if (this.mode === 'capture') this.setupCapture();
    else if (this.mode === 'reinforce') this.setupWaves();
    else if (this.mode === 'retreat') this.setupRetreat();
  }

  elapsed() { return this.w.time - (this.w.battleT0 || 0); }

  // ------------------------------------------------------------ capture
  setupCapture() {
    const st = this.st;
    let x = 0, z = 0, r = 30;
    if (st.kind === 'river') { x = 0; z = st.riverZ(0) + st.river.half + 28; r = 28; }
    else if (st.kind === 'siege') { const C = st.city; z = (C.z1 + C.zb) / 2; r = C.camp ? 18 : 24; }
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
    const zS = st.kind === 'siege' ? -150 : -190, zN = st.kind === 'river' ? 150 : 180;
    const red = [
      [75, 'sword', 12, 5, X(-60), zS, '増援 第5大隊', 0.65],
      [75, 'sword', 12, 5, X(60), zS, '増援 第6大隊', 0.65],
      [95, 'cav', 8, 3, 0, zS - 10, '増援 騎兵', 0.6],
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

  // ------------------------------------------------------------ retreat
  setupRetreat() {
    const w = this.w;
    this.exit = { z: -330, x0: -400, x1: 400 };
    this.initial0 = 0;
    for (const r of w.regs) if (r.team === 0 && r.kind !== K_ENG) this.initial0 += r.initial;
    this.rearguardUntil = 140;
    // the Kingdom's army starts close on the Legion's heels
    const dz = -45;
    for (const r of w.regs) {
      if (r.team !== 1) continue;
      r.ax += 0; r.az += dz; r.cz += dz;
      for (const a of r.agents) { a.z += dz; a.prevZ += dz; a.pz += dz; a.y = w.stage.floorAt(a.x, a.z); }
    }
  }
  isRearguard(reg) {
    return this.mode === 'retreat' && reg.team === 0 && this.elapsed() < this.rearguardUntil &&
      (reg.kind !== K_INF || reg.type === 'jav' || reg.type === 'spear');
  }
  updateRetreat() {
    for (const a of this.w.agents) {
      if (a.team !== 0 || a.state !== S_ALIVE || a.z > this.exit.z || a.riderless || a.kind === K_ENG) continue;
      if (a.fleeing && a.reg.order === 'rout') continue;
      a.state = S_GONE;           // off the field
      this.escaped++;
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
    else if (this.mode === 'retreat') this.updateRetreat();
  }

  // c = [Legion men, Kingdom men]; returns { winner, text } once the battle is decided
  check(c) {
    if (this.result) return this.result;
    const win = (winner, why) => (this.result = { winner, text: `${TEAMS[winner]}の勝利${why ? ' ― ' + why : ''}` });
    if (this.mode === 'capture') {
      if (this.meter >= 1) return win(0, '拠点を占領');
      if (this.meter <= -1) return win(1, '拠点を確保');
      if (!this.symmetric && this.elapsed() > HOLD_LIMIT) return win(1, '拠点を守り抜いた');
    }
    if (this.mode === 'retreat' && this.initial0) {
      const need = Math.ceil(this.initial0 * RETREAT_NEED);
      if (this.escaped >= need) return win(0, `${this.escaped}名が離脱`);
      if (this.escaped + c[0] < need) return win(1, '退路を断った');
      if (this.elapsed() > RETREAT_LIMIT) return win(1, '離脱を阻んだ');
    }
    if (c[1] === 0) return win(0, '');
    if (c[0] === 0 && !(this.mode === 'retreat' && this.escaped > 0)) return win(1, '');
    return null;
  }

  status() {
    const t = this.elapsed();
    const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
    if (this.mode === 'capture') {
      const m = this.meter, who = m > 0.02 ? '軍団' : m < -0.02 ? '東方王国' : '中立';
      const tail = this.symmetric ? '' : ` ・ 防衛側の勝利まで ${mmss(HOLD_LIMIT - t)}`;
      return `拠点: ${who} ${Math.round(Math.abs(m) * 100)}% (軍団 ${this.n0 || 0} : 東方 ${this.n1 || 0})${tail}`;
    }
    if (this.mode === 'reinforce') {
      const next = this.waves.filter(w => !w.done).map(w => `${TEAMS[w.team]} ${Math.max(0, Math.ceil(w.t - t))}秒`);
      return next.length ? `次の増援: ${next.slice(0, 2).join(' / ')}` : '増援はすべて到着';
    }
    if (this.mode === 'retreat') {
      const need = Math.ceil((this.initial0 || 1) * RETREAT_NEED);
      return `離脱 ${this.escaped}/${need} ・ 残り ${mmss(RETREAT_LIMIT - t)}`;
    }
    return '';
  }
}
