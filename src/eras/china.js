// China, three era packs (restructured plan): each era reuses the
// previous one's units and adds its difference.
//   china-early (Warring States–Han): chariot armies, ji/ge halberds,
//     massed crossbow volleys, heavy infantry. Scenarios: a chariot
//     battle on the open plain, and a Hangu-pass style defile (canyon).
//   china-mid (Three Kingdoms–Tang): repeating crossbows, fire arrows,
//     heavy cavalry arrives; the Red Cliffs fire-ships stage (naval).
//   china-late (Song–Ming): gunpowder — fire lances, rocket arrows,
//     hand cannon, counterweight trebuchets; presets vs the Mongols.
import { W_SWORD, W_SPEAR, W_BOW, W_PIKE, W_XBOW, W_FIRELANCE, W_CANNON, W_FIREBOW, SH_SMALL, SH_ROUND, SH_NONE } from '../anim/human.js';
import { K_INF, K_CAV, K_CHR, K_ENG, P_BULLET, P_FIREARROW, registerNameSet } from '../sim/defs.js';
import { FireSystem } from '../sim/fire.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
const CN_A = ['子房', '子長', '子敬', '子明', '子龍', '子揚', '子均', '子布', '子瑜', '子遠', '子廉', '子義', '子幹', '子仲', '子初', '子豐', '子山', '子林', '子平', '子安', '子寧', '子定', '子成', '子文', '子武', '子徳', '子仁', '子信', '子忠', '子孝', '子礼', '子智', '子勇', '子剛', '子強', '子勝', '子威', '子震', '子業', '子基'];
const CN_B = ['劉', '曹', '孫', '趙', '関', '張', '馬', '黄', '諸葛', '司馬', '周', '呂', '袁', '董', '李', '王', '陳', '徐', '郭', '荀', '賈', '程', '典', '許', '夏侯', '太史', '甘', '淩', '陸', '魯', '韓', '魏', '呉', '蜀', '秦', '漢', '楚', '燕', '斉', '晋'];
registerNameSet('china0', { a: CN_A, b: CN_B });
registerNameSet('china1', { a: [...CN_A].reverse(), b: [...CN_B].reverse() });

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0x8a2a20); L.armor = jit(0x5a4a38, 0.04); L.shield = jit(0x7a2020); }
  else { L.tunic = jit(0x2a4a3a); L.armor = jit(0x6a5a40, 0.04); L.shield = jit(0x2a5a4a); }
  L.helm = 3; L.helmCol = jit(0x4a3a28); L.crest = null;
  if (role && (role.includes('heavy') || role === 'officer' || role === 'general')) { L.helm = 1; L.helmCol = jit(0x6a5a3a); }
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}

// ------------------------------------------------------------ CN1 early
const TYPES_EARLY = {
  cn_ji: { kind: K_INF, name: '戟兵', weapon: W_SPEAR, hp: 130, run: 5.2, march: 1.8, mass: 82, chargeDist: 36, disc: 0.6, radius: 0.34 },
  cn_ge: { kind: K_INF, name: '戈兵', weapon: W_PIKE, hp: 125, run: 4.8, march: 1.7, mass: 82, chargeDist: 24, disc: 0.6, radius: 0.34 },
  cn_xbow: { kind: K_INF, name: '弩兵', weapon: W_XBOW, hp: 95, run: 5.2, march: 1.8, mass: 75, chargeDist: 0, disc: 0.55, radius: 0.32 },
  cn_heavy: { kind: K_INF, name: '重装歩兵', weapon: W_SWORD, hp: 155, run: 5.0, march: 1.7, mass: 92, chargeDist: 40, disc: 0.7, radius: 0.34 },
  cn_chariot: { kind: K_CHR, name: '戦車', hp: 420, max: 11.5, march: 3.0, accel: 3.4, turn: 1.3, radius: 1.0, ext: 1.4, mass: 1150, chargeDist: 160, range: 60, disc: 0.6 },
  cn_cav: { kind: K_CAV, name: '騎兵', animal: 'horse', rider: W_SPEAR, hp: 180, riderHp: 110, max: 12.5, march: 3.5, accel: 4.2, turn: 2.0, radius: 0.62, ext: 0.62, mass: 600, chargeDist: 140, disc: 0.6 },
};
const SHIELDS_CN = { cn_ji: SH_ROUND, cn_ge: SH_SMALL, cn_heavy: SH_ROUND, cn_xbow: SH_NONE };
const ROSTER_EARLY = [
  ['cn_chariot', 5, 2, -120, -46, '戦車隊 右', { wing: '右翼', fixed: true, q: 0.6 }],
  ['cn_chariot', 5, 2, 120, -46, '戦車隊 左', { wing: '左翼', fixed: true, q: 0.6 }],
  ['cn_ge', 18, 7, -30, -48, '戈兵 I', { wing: '中央', q: 0.55 }],
  ['cn_ge', 18, 7, 30, -48, '戈兵 II', { wing: '中央', q: 0.55 }],
  ['cn_ji', 16, 6, -78, -52, '戟兵 右', { wing: '右翼', q: 0.6 }],
  ['cn_ji', 16, 6, 78, -52, '戟兵 左', { wing: '左翼', q: 0.6 }],
  ['cn_xbow', 20, 4, -24, -66, '弩兵 I', { wing: '中央', q: 0.55 }],
  ['cn_xbow', 20, 4, 24, -66, '弩兵 II', { wing: '中央', q: 0.55 }],
  ['cn_heavy', 14, 6, 0, -78, '重装歩兵', { wing: '予備', role: 'reserve', q: 0.7 }],
  ['cn_cav', 8, 3, -140, -70, '騎兵 右', { wing: '右翼', q: 0.6 }],
  ['cn_cav', 8, 3, 140, -70, '騎兵 左', { wing: '左翼', q: 0.6 }],
  ['wagon', 1, 1, -30, -110, '輜重車', { wing: '予備', role: 'reserve', fixed: true }],
  ['wagon', 1, 1, 30, -110, '輜重車', { wing: '予備', role: 'reserve', fixed: true }],
];
function deployEarly(b, st, team) {
  if (st.kind !== 'field') return false;
  fieldArmy(b, team, ROSTER_EARLY);
  return true;
}
deployEarly.handles = st => st.kind === 'field';

export const chinaEarly = {
  id: 'china-early', name: '中国・戦国〜漢',
  factions: [{ name: '漢軍', names: 'china0' }, { name: '楚軍', names: 'china1' }],
  types: TYPES_EARLY, weapons: {}, shields: SHIELDS_CN, look,
  scenario: deployEarly, reskin: {}, track: 'china-early',
};

// ------------------------------------------------------------ CN2 mid (adds to early)
const TYPES_MID = {
  ...TYPES_EARLY,
  cn_rxbow: { kind: K_INF, name: '連弩兵', weapon: W_XBOW, hp: 90, run: 5.2, march: 1.8, mass: 72, chargeDist: 0, disc: 0.5, radius: 0.32 },
  cn_firebow: { kind: K_INF, name: '火矢隊', weapon: W_FIREBOW, hp: 85, run: 5.5, march: 1.9, mass: 70, chargeDist: 0, disc: 0.5, radius: 0.32, fireArrows: true },
  cn_hcav: { kind: K_CAV, name: '重騎兵', animal: 'horse', rider: W_SPEAR, barding: true, hp: 320, riderHp: 165, max: 10.8, march: 3.1, accel: 3.3, turn: 1.7, radius: 0.66, ext: 0.64, mass: 790, chargeDist: 125, disc: 0.75 },
};
const ROSTER_MID = [
  ['cn_ge', 18, 7, -30, -46, '戈兵 I', { wing: '中央', q: 0.55 }],
  ['cn_ge', 18, 7, 30, -46, '戈兵 II', { wing: '中央', q: 0.55 }],
  ['cn_ji', 16, 6, -78, -50, '戟兵 右', { wing: '右翼', q: 0.6 }],
  ['cn_ji', 16, 6, 78, -50, '戟兵 左', { wing: '左翼', q: 0.6 }],
  ['cn_rxbow', 18, 4, -26, -62, '連弩隊 I', { wing: '中央', q: 0.55 }],
  ['cn_rxbow', 18, 4, 26, -62, '連弩隊 II', { wing: '中央', q: 0.55 }],
  ['cn_firebow', 16, 3, 0, -58, '火矢隊', { wing: '中央', q: 0.5 }],
  ['cn_heavy', 14, 6, 0, -76, '重装歩兵', { wing: '予備', role: 'reserve', q: 0.7 }],
  ['cn_chariot', 4, 2, -124, -52, '戦車隊', { wing: '右翼', fixed: true, q: 0.55 }],
  ['cn_hcav', 8, 3, -120, -66, '重騎兵 右', { wing: '右翼', q: 0.75 }],
  ['cn_hcav', 8, 3, 120, -66, '重騎兵 左', { wing: '左翼', q: 0.75 }],
  ['cn_cav', 8, 3, 148, -80, '騎兵', { wing: '左翼', q: 0.6 }],
  ['wagon', 1, 1, 0, -108, '輜重車', { wing: '予備', role: 'reserve', fixed: true }],
];
function deployMid(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_MID); return true; }
  return false;
}
deployMid.handles = st => st.kind === 'field';

const WEAPONS_MID = {
  [W_FIREBOW]: { name: '火矢', reach: 0.8, dmg: [12, 26], atk: [0.8, 1.0], knock: 0.02, cap: 2, ranged: { proj: P_FIREARROW, range: 165, dur: 1.7 } },
};

// Red Cliffs (stage hook, runs after ANY deployment on the naval
// stage when a china-mid pack is in the battle): fire ships drift down
// the anchorage on the wind and ignite what they reach. The standard
// naval armies fight the battle; the fire is the scenario.
function redCliffs(b, st) {
  if (st.id !== 'naval') return;
  const w = b.w, H = st.harbor;
  if (!w.fire) w.fire = new FireSystem(w);
  for (let k = 0; k < 5; k++) {
    w.stageEvents.at(90 + k * 55, 'fireship' + k, ww => {
      ww.emit('fireship', {});
      let x = -190 + k * 12;
      const step = () => {
        if (ww.fire) ww.fire.ignite(x, H.shore - 8, 7);
        x += 14;
        if (x < 190) ww.stageEvents.after(2.5, 'fireshipdrift', step);
      };
      step();
    });
  }
}

export const chinaMid = {
  id: 'china-mid', name: '中国・三国〜唐',
  factions: [{ name: '魏軍', names: 'china0' }, { name: '呉軍', names: 'china1' }],
  types: TYPES_MID, weapons: WEAPONS_MID, shields: SHIELDS_CN, look,
  scenario: deployMid, stageHook: redCliffs, reskin: {}, track: 'china-mid',
};

// ------------------------------------------------------------ CN3 late (adds to mid)
const TYPES_LATE = {
  ...TYPES_MID,
  cn_firelance: { kind: K_INF, name: '火槍兵', weapon: W_FIRELANCE, hp: 100, run: 5.3, march: 1.8, mass: 74, chargeDist: 0, disc: 0.55, radius: 0.32 },
  cn_cannon: { kind: K_INF, name: '火砲隊', weapon: W_CANNON, hp: 95, run: 4.6, march: 1.6, mass: 80, chargeDist: 0, disc: 0.6, radius: 0.32 },
  cn_trebuchet: { kind: K_ENG, name: '回回砲', sub: 'onager', hp: 700, max: 0.6, march: 0.6, accel: 0.5, turn: 0.5, radius: 1.5, ext: 1.1, mass: 3200, crew: 5, range: 320, disc: 1 },
};
const WEAPONS_LATE = {
  [W_FIRELANCE]: { name: '火槍', reach: 1.6, dmg: [16, 30], atk: [0.9, 1.1], knock: 0.03, cap: 2, gun: true, ranged: { proj: P_BULLET, range: 30, dur: 1.0, reload: 7 } },
  [W_CANNON]: { name: '火砲', reach: 0.8, dmg: [8, 16], atk: [1.0, 1.2], knock: 0.02, cap: 2, gun: true, ranged: { proj: P_BULLET, range: 135, dur: 1.6, reload: 15 } },
  [W_FIREBOW]: { name: '火矢', reach: 0.8, dmg: [12, 26], atk: [0.8, 1.0], knock: 0.02, cap: 2, ranged: { proj: P_FIREARROW, range: 165, dur: 1.7 } },
};
const ROSTER_LATE = [
  ['cn_ge', 18, 7, -30, -44, '戈兵 I', { wing: '中央', q: 0.55 }],
  ['cn_ge', 18, 7, 30, -44, '戈兵 II', { wing: '中央', q: 0.55 }],
  ['cn_firelance', 14, 3, -24, -56, '火槍隊 I', { wing: '中央', q: 0.55 }],
  ['cn_firelance', 14, 3, 24, -56, '火槍隊 II', { wing: '中央', q: 0.55 }],
  ['cn_rxbow', 18, 4, 0, -64, '連弩隊', { wing: '中央', q: 0.55 }],
  ['cn_firebow', 16, 3, -60, -60, '火箭隊', { wing: '右翼', q: 0.5 }],
  ['cn_heavy', 14, 6, -64, -72, '重装歩兵', { wing: '予備', role: 'reserve', q: 0.7 }],
  ['cn_hcav', 8, 3, -118, -64, '重騎兵 右', { wing: '右翼', q: 0.75 }],
  ['cn_hcav', 8, 3, 118, -64, '重騎兵 左', { wing: '左翼', q: 0.75 }],
  ['cn_cannon', 10, 2, 60, -70, '火砲隊', { wing: '左翼', q: 0.6 }],
  ['cn_trebuchet', 2, 1, 0, -104, '回回砲', { wing: '予備', role: 'reserve', fixed: true }],
  ['wagon', 1, 1, -34, -108, '輜重車', { wing: '予備', role: 'reserve', fixed: true }],
];
function deployLate(b, st, team) {
  if (st.kind !== 'field') return false;
  fieldArmy(b, team, ROSTER_LATE);
  return true;
}
deployLate.handles = st => st.kind === 'field';

export const chinaLate = {
  id: 'china-late', name: '中国・宋〜元明',
  factions: [{ name: '宋軍', names: 'china0' }, { name: '明軍', names: 'china1' }],
  types: TYPES_LATE, weapons: WEAPONS_LATE, shields: SHIELDS_CN, look,
  scenario: deployLate, reskin: {}, track: 'china-late',
};
