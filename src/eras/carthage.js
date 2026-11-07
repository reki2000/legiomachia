// Phase 7: Carthage, sister pack to Rome. Massed war elephants,
// Numidian javelin cavalry, camels in the desert (field reskin), and
// a Cannae scenario hook: at the start of a field battle the
// Carthaginian cavalry wings receive timed orders to swing wide
// around both flanks into the enemy rear (reg.hookUntil hands them
// back to the AI afterwards). Heat: env.speed dips slightly for all
// armies in the desert sun (approximation — camels keep their dune
// advantage from the dynamics layer).
import { W_SPEAR, W_SWORD, W_JAV, SH_ROUND, SH_SMALL } from '../anim/human.js';
import { K_INF, K_CAV, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('carthage0', {
  bMode: 'epithet',
  nick: [['隻眼', 'eyepatch'], ['若獅子', null], ['象使い', null], ['砂漠の狐', null], ['鉄拳', null], ['沈黙', null], ['笑顔', null], ['傷痕', null], ['早足', null], ['長駆', null], ['大男', null], ['老師', null], ['赤毛', 'redhair'], ['禿頭', 'bald'], ['商人', null], ['船長', null]],
  a: ['ハンニバル', 'ハスドルバル', 'マゴ', 'ハミルカル', 'ヒミルコ', 'ボミルカル', 'マハルバル', 'アドヘルバル', 'ハンノ', 'ギスコ', 'マサル', 'ユグルタ', 'ミキプサ', 'ヒエムプサル', 'アドヘル', 'マシニッサ', 'シュファクス', 'ガラ', 'ナルヴァス', 'ボッカス', 'ユバ', 'プトレマイオス', 'アブド', 'メラルト', 'ボドメラルト', 'アヒラム', 'イットバアル', 'ヒラム', 'アゼルバアル', 'タバアル', 'エシュムン', 'メルカルト', 'バアル', 'タニト', 'アスタルト', 'レシェフ', 'シャドラファ', 'ミルク', 'サフォン', 'ディド', 'エリッサ'],
  b: ['象使い', '騎兵隊長', '傭兵隊長', '将軍', '提督', '商人', '大富豪', '老将', '若獅子', '隻眼', '傷痕', '沈黙', '笑顔', '鉄拳', '早足', '長駆', '包囲者', '征服者', '帰還者', '放浪者', '砂漠の民', 'ラクダ使い', '象飼い', '投槍手', '槍手', '剣士', '弓手', '斥候', '先鋒', '殿軍', '旗手', '司祭', '占い師', '鍛冶', '船長', '航海者', '隊商長', '守備隊長', '新兵', '老兵'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0xe0d8c8); L.armor = jit(0x9a7a4a, 0.05); L.shield = jit(0xb03030); }
  else { L.tunic = jit(0xd8c8a8); L.armor = jit(0x8a8a92, 0.04); L.shield = jit(0x3060a0); }
  L.helm = 2; L.helmCol = jit(0xa8843c); L.crest = null;
  if (role === 'officer' || role === 'general') L.crest = jit(0xd8b040);
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.74);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_CA = {
  ca_spear: { kind: K_INF, name: 'カルタゴ槍兵', weapon: W_SPEAR, hp: 125, run: 5.4, march: 1.9, mass: 80, chargeDist: 50, disc: 0.6, radius: 0.34 },
  ca_sword: { kind: K_INF, name: 'イベリア剣兵', weapon: W_SWORD, hp: 128, run: 5.8, march: 2.0, mass: 80, chargeDist: 52, disc: 0.62, radius: 0.34 },
  ca_numidian: { kind: K_CAV, name: 'ヌミディア騎兵', animal: 'horse', rider: W_JAV, hp: 150, riderHp: 95, max: 14.5, march: 3.8, accel: 5.0, turn: 2.5, radius: 0.6, ext: 0.6, mass: 520, chargeDist: 90, disc: 0.65 },
};
const SH_CA = { ca_spear: SH_ROUND, ca_sword: SH_SMALL, ca_numidian: SH_ROUND };
const ROSTER_CA = [
  ['ele', 3, 1, -70, -52, '戦象隊 右', { wing: '右翼', q: 0.7 }],
  ['ele', 3, 1, 70, -52, '戦象隊 左', { wing: '左翼', q: 0.7 }],
  ['ele', 2, 1, 0, -44, '戦象隊 中央', { wing: '中央', q: 0.7 }],
  ['ca_spear', 18, 8, -26, -56, '槍兵隊 I', { wing: '中央', q: 0.6 }],
  ['ca_spear', 18, 8, 26, -56, '槍兵隊 II', { wing: '中央', q: 0.6 }],
  ['ca_sword', 16, 6, 0, -66, 'イベリア剣兵', { wing: '中央', q: 0.65 }],
  ['sling', 18, 3, 0, -48, '投石隊', { wing: '中央', q: 0.5 }],
  ['ca_numidian', 10, 3, -125, -60, 'ヌミディア騎兵 右', { wing: '右翼', q: 0.65 }],
  ['ca_numidian', 10, 3, 125, -60, 'ヌミディア騎兵 左', { wing: '左翼', q: 0.65 }],
  ['camel', 8, 2, -95, -76, 'ラクダ隊', { wing: '右翼', q: 0.6 }],
  ['cav', 8, 3, 95, -76, '騎兵隊', { wing: '左翼', q: 0.6 }],
];
function deployCarthage(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_CA); return true; }
  return false;
}
deployCarthage.handles = st => st.kind === 'field';

// Cannae: the Carthaginian horse swings wide around both flanks.
function cannae(b, st) {
  const w = b.w;
  if (st.kind !== 'field') return;
  w.env.speed = 0.96;   // desert heat drags on everyone a little
  const ci = (w.eraPacks || []).findIndex(p => p.id === 'carthage');
  if (ci < 0) return;
  const team = ci, dir = team === 0 ? 1 : -1;
  w.stageEvents.at(8, 'cannae', ww => {
    for (const r of ww.regs) {
      if (r.team !== team || r.kind !== K_CAV || Math.abs(r.cx) < 55) continue;
      r.tx = -Math.sign(r.cx) * 30; r.tz = dir * 168;
      r.manual = true; r.hookUntil = ww.time + 170;
    }
  });
}

export const carthage = {
  id: 'carthage', name: 'カルタゴ',
  factions: [{ name: 'カルタゴ軍', names: 'carthage0' }, { name: 'ヌミディア連合', names: 'carthage0' }],
  types: TYPES_CA, weapons: {}, shields: SH_CA, look,
  scenario: deployCarthage, stageHook: cannae, arch: 'carthage', reskin: { field: 'desert' }, track: 'carthage',
};
