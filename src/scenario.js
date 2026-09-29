// Army deployments for each stage.
import { Agent, Regiment } from './sim/world.js';
import { Army, Wing } from './sim/command.js';
import { randRange, setSeed } from './util.js';
import { W_BANNER, SH_NONE } from './anim/human.js';
import { K_INF, K_CAV, commanderLook, TEAM_FLAG } from './sim/defs.js';

const SPACING = {
  sword: [1.35, 1.55], axe: [1.45, 1.65], mace: [1.45, 1.65], spear: [1.3, 1.5], pike: [1.3, 1.45],
  jav: [1.8, 1.9], sling: [1.8, 1.9], archer: [1.6, 1.7], xbow: [1.6, 1.7], engineer: [1.7, 1.8],
  cav: [3.2, 5.2], hcav: [3.6, 5.6], cata: [3.0, 5.0], camel: [3.4, 5.4], guard: [3.0, 4.8], officer: [3, 4], general: [3, 4],
  ele: [12, 10], chr: [7, 9], dog: [2.0, 2.2], ram: [8, 10], onager: [9, 9],
};

export const SIZES = { S: 0.4, M: 1, L: 2.2, XL: 5, XXL: 10 };

class Builder {
  constructor(world, sq, S) {
    this.w = world; this.sq = sq; this.S = S;
    this.armies = [new Army(0, '軍団'), new Army(1, '東方王国')];
    world.armies = this.armies;
    this.wings = [{}, {}];
  }
  wing(team, key, role = 'line') {
    let w = this.wings[team][key];
    if (!w) { w = new Wing(this.armies[team], key, role); this.wings[team][key] = w; this.armies[team].wings.push(w); }
    return w;
  }
  reg(team, type, cols, rows, x, z, name, o = {}) {
    const w = this.w;
    const scale = o.fixed ? 1 : this.sq;
    const c = Math.max(1, Math.round(cols * scale));
    const r = Math.max(1, Math.round(rows * scale));
    const facing = o.facing !== undefined ? o.facing : team === 0 ? 0 : Math.PI;
    const [sx, sz] = SPACING[type];
    const q = o.q !== undefined ? o.q : 0.5;
    const R = w.addRegiment(new Regiment(w, team, type, c, sx, sz, x, z, facing, name, q));
    const p = { x: 0, z: 0 };
    for (let i = 0; i < c * r; i++) {
      const a = new Agent(team, type, R, q);
      R.slotPos(i, p);
      a.x = p.x + randRange(-0.12, 0.12); a.z = p.z + randRange(-0.12, 0.12);
      a.heading = facing + randRange(-0.08, 0.08);
      a.slot = i;
      w.addAgent(a);
      R.agents.push(a);
    }
    R.initial = R.agents.length;
    R.cx = x; R.cz = z; R.alive = R.initial;
    R.slotMap = R.agents.slice();
    // captain in the middle of the front rank, standard bearer behind him
    if (R.agents.length >= 8 && (R.kind === K_INF || R.kind === K_CAV)) {
      const cap = R.agents[Math.floor(c / 2)];
      cap.captain = true; cap.rank = 1;
      cap.baseMorale += 0.15; cap.morale = cap.baseMorale;
      if (cap.kind === K_INF) commanderLook(cap.look, team, 0);
      else commanderLook(cap.crew[0].look, team, 0);
      R.captain = cap;
      if (R.kind === K_INF && R.agents.length >= 16 && r >= 2) {
        const b = R.agents[Math.floor(c / 2) + c];
        b.bearer = true; b.weapon = W_BANNER; b.shield = SH_NONE; b.look.flag = TEAM_FLAG[team];
        R.bearer = b;
      }
    }
    const wing = this.wing(team, o.wing || '中央', o.role);
    wing.regs.push(R); R.wing = wing;
    return R;
  }
  officer(team, wingKey, x, z, name) {
    const R = this.reg(team, 'officer', 1, 1, x, z, name, { fixed: true, wing: wingKey, q: 0.9 });
    const a = R.agents[0];
    a.rank = 2; commanderLook(a.crew[0].look, team, 1);
    this.wing(team, wingKey).commander = a;
    a.px = x; a.pz = z;
    return a;
  }
  general(team, x, z, guards) {
    const R = this.reg(team, 'general', 1, 1, x, z, '総大将', { fixed: true, wing: '本陣', q: 1 });
    const a = R.agents[0];
    a.rank = 3; commanderLook(a.crew[0].look, team, 2);
    a.px = x; a.pz = z;
    this.armies[team].general = a;
    const dir = team === 0 ? -1 : 1;
    const G = this.reg(team, 'guard', guards, 1, x, z + dir * 7, '親衛隊', { fixed: true, wing: '本陣', q: 0.95 });
    G.follow = a;
    this.armies[team].guard = G;
    return a;
  }
}

export function buildScenario(world, stageKind, sizeKey = 'M', seed = 7) {
  setSeed(seed);
  const m = SIZES[sizeKey] || 1;
  const sq = Math.sqrt(m);
  const b = new Builder(world, sq, world.stage.S);
  if (stageKind === 'river') river(b, world.stage);
  else if (stageKind === 'siege') siege(b, world.stage);
  else field(b, world.stage);
  return world;
}

// ------------------------------------------------------------------ plains
function field(b) {
  const X = v => v * Math.max(1, b.sq * 0.8);
  const Z = v => v * Math.max(1, b.sq * 0.35);
  // Red: the Legion
  b.reg(0, 'jav', 14, 3, X(-40), Z(-38), '軽装投槍兵 I', { wing: '中央', q: 0.4 });
  b.reg(0, 'jav', 14, 3, X(40), Z(-38), '軽装投槍兵 II', { wing: '中央', q: 0.4 });
  b.reg(0, 'sword', 16, 7, X(-54), Z(-55), '第1大隊', { wing: '右翼', q: 0.6 });
  b.reg(0, 'sword', 16, 7, X(-18), Z(-55), '第2大隊', { wing: '中央', q: 0.65 });
  b.reg(0, 'sword', 16, 7, X(18), Z(-55), '第3大隊', { wing: '中央', q: 0.65 });
  b.reg(0, 'sword', 16, 7, X(54), Z(-55), '第4大隊', { wing: '左翼', q: 0.6 });
  b.reg(0, 'spear', 16, 5, X(-36), Z(-78), '古参兵 右', { wing: '予備', role: 'reserve', q: 0.9 });
  b.reg(0, 'spear', 16, 5, X(36), Z(-78), '古参兵 左', { wing: '予備', role: 'reserve', q: 0.9 });
  b.reg(0, 'archer', 20, 4, X(-34), Z(-95), 'クレタ弓兵', { wing: '中央', q: 0.6 });
  b.reg(0, 'sling', 16, 3, X(0), Z(-92), 'バレアレス投石兵', { wing: '中央', q: 0.6 });
  b.reg(0, 'archer', 20, 4, X(34), Z(-95), '弓兵隊', { wing: '中央', q: 0.5 });
  b.reg(0, 'cav', 8, 3, X(-104), Z(-62), '騎兵 右翼', { wing: '右翼', q: 0.6 });
  b.reg(0, 'dog', 10, 2, X(-84), Z(-70), 'モロシアン犬', { wing: '右翼', q: 0.6 });
  b.reg(0, 'cav', 8, 3, X(104), Z(-62), '騎兵 左翼', { wing: '左翼', q: 0.6 });
  b.reg(0, 'engineer', 8, 2, X(0), Z(-104), '工兵隊', { wing: '予備', role: 'reserve', q: 0.5 });
  b.reg(0, 'onager', 2, 1, X(0), Z(-112), '投石機', { wing: '予備', role: 'reserve', fixed: true });
  b.officer(0, '右翼', X(-70), Z(-85), '右翼将');
  b.officer(0, '中央', X(0), Z(-80), '中央将');
  b.officer(0, '左翼', X(70), Z(-85), '左翼将');
  b.officer(0, '予備', X(0), Z(-120), '予備将');
  b.general(0, X(0), Z(-130), 6);

  // Blue: the Eastern kingdom
  b.reg(1, 'ele', Math.max(3, Math.round(6 * b.sq)), 1, 0, Z(40), '戦象隊', { wing: '中央', fixed: true });
  b.reg(1, 'pike', 18, 8, X(-24), Z(58), 'ファランクス I', { wing: '中央', q: 0.6 });
  b.reg(1, 'pike', 18, 8, X(24), Z(58), 'ファランクス II', { wing: '中央', q: 0.6 });
  b.reg(1, 'spear', 16, 7, X(-76), Z(60), '重装槍兵', { wing: '左翼', q: 0.55 });
  b.reg(1, 'axe', 14, 7, X(76), Z(60), '蛮族斧兵', { wing: '右翼', q: 0.45 });
  b.reg(1, 'archer', 20, 4, X(-30), Z(80), '弓兵隊', { wing: '中央', q: 0.5 });
  b.reg(1, 'xbow', 20, 3, X(30), Z(80), '弩兵隊', { wing: '中央', q: 0.55 });
  b.reg(1, 'chr', Math.max(3, Math.round(5 * b.sq)), 2, X(-126), Z(62), '鎌戦車隊', { wing: '左翼', fixed: true });
  b.reg(1, 'hcav', 8, 3, X(-146), Z(82), '弓騎兵', { wing: '左翼', q: 0.6 });
  b.reg(1, 'camel', 8, 3, X(124), Z(62), '駱駝騎兵', { wing: '右翼', q: 0.5 });
  b.reg(1, 'cata', 8, 3, X(108), Z(80), '重装騎兵', { wing: '右翼', q: 0.8 });
  b.reg(1, 'mace', 14, 6, X(0), Z(94), '徴募兵', { wing: '予備', role: 'reserve', q: 0.25 });
  b.reg(1, 'engineer', 8, 2, X(0), Z(104), '工兵隊', { wing: '予備', role: 'reserve' });
  b.officer(1, '左翼', X(-80), Z(88), '左翼将');
  b.officer(1, '中央', X(0), Z(84), '中央将');
  b.officer(1, '右翼', X(80), Z(88), '右翼将');
  b.officer(1, '予備', X(20), Z(112), '予備将');
  b.general(1, X(0), Z(124), 6);
}

// ------------------------------------------------------------------ river crossing
function river(b, st) {
  const S = st.S;
  const X = v => v * S;
  b.armies[1].posture = 'defend';
  const wb = -150 * S, fd = 150 * S;
  // Blue holds the north bank
  b.reg(1, 'pike', 16, 6, 0, 34, '橋頭ファランクス', { wing: '中央', q: 0.65 });
  b.reg(1, 'archer', 20, 4, X(-26), 25, '弓兵隊', { wing: '中央' });
  b.reg(1, 'xbow', 20, 3, X(26), 25, '弩兵隊', { wing: '中央' });
  b.reg(1, 'spear', 16, 6, wb, 34, '木橋守備隊', { wing: '左翼', q: 0.5 });
  b.reg(1, 'sling', 14, 3, wb + X(36), 24, '投石兵', { wing: '左翼' });
  b.reg(1, 'engineer', 8, 2, wb + 12, 46, '工兵隊', { wing: '左翼' });
  b.reg(1, 'axe', 14, 6, fd, 36, '浅瀬守備隊', { wing: '右翼', q: 0.45 });
  b.reg(1, 'camel', 8, 3, fd + X(30), 58, '駱駝騎兵', { wing: '右翼' });
  b.reg(1, 'hcav', 8, 3, fd - X(40), 72, '弓騎兵', { wing: '右翼' });
  b.reg(1, 'ele', Math.max(2, Math.round(4 * b.sq)), 1, 0, 72, '戦象隊', { wing: '予備', role: 'reserve', fixed: true });
  b.reg(1, 'mace', 14, 6, X(-50), 76, '徴募兵', { wing: '予備', role: 'reserve', q: 0.3 });
  b.reg(1, 'cata', 8, 3, X(50), 82, '重装騎兵', { wing: '予備', role: 'reserve', q: 0.8 });
  b.officer(1, '左翼', wb + 30, 62, '左翼将');
  b.officer(1, '中央', 0, 56, '中央将');
  b.officer(1, '右翼', fd - 20, 62, '右翼将');
  b.officer(1, '予備', 10, 94, '予備将');
  b.general(1, 0, 106, 6);
  // Red must cross
  b.reg(0, 'sword', 16, 7, X(-34), -52, '第1大隊', { wing: '中央', q: 0.6 });
  b.reg(0, 'sword', 16, 7, 0, -52, '第2大隊', { wing: '中央', q: 0.65 });
  b.reg(0, 'sword', 16, 7, X(34), -52, '第3大隊', { wing: '中央', q: 0.6 });
  b.reg(0, 'archer', 20, 4, X(-40), -30, '弓兵隊', { wing: '中央' });
  b.reg(0, 'sling', 16, 3, X(40), -30, '投石兵', { wing: '中央' });
  b.reg(0, 'sword', 16, 6, wb, -50, '第4大隊', { wing: '右翼', q: 0.55 });
  b.reg(0, 'jav', 14, 3, wb + X(30), -34, '軽装兵', { wing: '右翼', q: 0.4 });
  b.reg(0, 'cav', 8, 3, fd, -56, '騎兵 I', { wing: '左翼' });
  b.reg(0, 'cav', 8, 3, fd + X(26), -60, '騎兵 II', { wing: '左翼' });
  b.reg(0, 'spear', 16, 6, fd - X(40), -50, '槍兵隊', { wing: '左翼' });
  b.reg(0, 'spear', 16, 6, 0, -80, '古参兵', { wing: '予備', role: 'reserve', q: 0.9 });
  b.reg(0, 'engineer', 10, 2, X(70), -58, '架橋工兵', { wing: '予備' });
  b.reg(0, 'onager', 2, 1, 0, -66, '投石機', { wing: '中央', fixed: true });
  b.reg(0, 'dog', 10, 2, X(-70), -62, '軍用犬', { wing: '右翼' });
  b.officer(0, '右翼', wb + 20, -74, '右翼将');
  b.officer(0, '中央', 0, -72, '中央将');
  b.officer(0, '左翼', fd - 20, -76, '左翼将');
  b.officer(0, '予備', 20, -96, '予備将');
  b.general(0, 0, -110, 6);
}

// ------------------------------------------------------------------ siege
function siege(b, st) {
  const C = st.city, S = st.S;
  const X = v => v * S;
  b.armies[0].posture = 'assault';
  b.armies[1].posture = 'defend';
  const wz = C.z0 + 1.2;
  // Blue: garrison on the walls and in the square behind the gate
  b.reg(1, 'archer', 22, 2, X(-78), wz, '城壁弓兵 西', { wing: '城壁' });
  b.reg(1, 'archer', 22, 2, X(-38), wz, '城壁弓兵 中西', { wing: '城壁' });
  b.reg(1, 'xbow', 16, 2, 0, wz, '門楼弩兵', { wing: '城壁' });
  b.reg(1, 'archer', 22, 2, X(38), wz, '城壁弓兵 中東', { wing: '城壁' });
  b.reg(1, 'archer', 22, 2, X(78), wz, '城壁弓兵 東', { wing: '城壁' });
  b.reg(1, 'spear', 18, 2, X(-58), wz, '城壁守備隊 西', { wing: '城壁', q: 0.55 });
  b.reg(1, 'spear', 18, 2, X(58), wz, '城壁守備隊 東', { wing: '城壁', q: 0.55 });
  b.reg(1, 'pike', 14, 5, -6, C.z1 + 14, '門内ファランクス', { wing: '城内', role: 'reserve', q: 0.65 });
  b.reg(1, 'axe', 12, 5, -18, C.z1 + 30, '斧兵', { wing: '城内', role: 'reserve' });
  b.reg(1, 'sword', 12, 5, 6, C.z1 + 30, '市民兵', { wing: '城内', role: 'reserve', q: 0.3 });
  b.reg(1, 'ele', Math.max(2, Math.round(2 * b.sq)), 1, -6, C.z1 + 44, '戦象', { wing: '城内', role: 'reserve', fixed: true });
  b.officer(1, '城壁', X(20), C.z1 + 8, '城壁将');
  b.officer(1, '城内', -20, C.z1 + 20, '城内将');
  b.general(1, 0, C.z1 + 36, 4);
  // Red: the besiegers
  b.reg(0, 'ram', 1, 1, 0, -2, '破城槌', { wing: '中央', fixed: true });
  b.reg(0, 'sword', 16, 6, X(-42), -14, '第1大隊', { wing: '中央', q: 0.65 });
  b.reg(0, 'sword', 16, 6, 0, -18, '第2大隊', { wing: '中央', q: 0.65 });
  b.reg(0, 'sword', 16, 6, X(42), -14, '第3大隊', { wing: '中央', q: 0.65 });
  b.reg(0, 'spear', 16, 6, X(-86), -14, '第4大隊', { wing: '右翼', q: 0.55 });
  b.reg(0, 'axe', 14, 6, X(86), -14, '同盟斧兵', { wing: '左翼', q: 0.45 });
  b.reg(0, 'archer', 20, 4, X(-50), -2, '弓兵隊 右', { wing: '右翼' });
  b.reg(0, 'archer', 20, 4, X(50), -2, '弓兵隊 左', { wing: '左翼' });
  b.reg(0, 'sling', 16, 3, X(20), 2, '投石兵', { wing: '中央' });
  b.reg(0, 'engineer', 10, 2, X(-30), -28, '梯子隊 I', { wing: '右翼', q: 0.65 });
  b.reg(0, 'engineer', 10, 2, X(30), -28, '梯子隊 II', { wing: '左翼', q: 0.65 });
  b.reg(0, 'sword', 16, 6, X(-22), -40, '第5大隊', { wing: '予備', role: 'reserve', q: 0.7 });
  b.reg(0, 'sword', 16, 6, X(22), -40, '第6大隊', { wing: '予備', role: 'reserve', q: 0.7 });
  b.reg(0, 'onager', 3, 1, 0, -48, '投石機隊', { wing: '中央', fixed: true });
  b.reg(0, 'cav', 8, 3, X(-120), -40, '騎兵', { wing: '予備', role: 'reserve' });
  b.reg(0, 'dog', 10, 2, X(120), -36, '軍用犬', { wing: '予備', role: 'reserve' });
  b.officer(0, '右翼', X(-70), -40, '右翼将');
  b.officer(0, '中央', 0, -36, '中央将');
  b.officer(0, '左翼', X(70), -40, '左翼将');
  b.officer(0, '予備', X(-20), -70, '予備将');
  b.general(0, 0, -80, 6);
}
