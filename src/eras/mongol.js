// Phase 6: the Mongol pack, and the flagship Genko scenario.
// Horse archers ride the existing hcav circling-fire behaviour,
// strengthened, plus a new regiment-level FEIGNED RETREAT (defs flag
// `feigned` -> Regiment.feigned -> Command.kiteRegiments): they keep
// 48-70 m off the nearest enemy and fall back shooting, luring
// pursuers out of formation. Siege engineers borrow the onager.
import { W_SPEAR, W_SWORD, W_BOW, SH_ROUND, SH_NONE } from '../anim/human.js';
import { K_CAV, K_ENG, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('mongol0', {
  bMode: 'epithet',
  nick: [['隻眼', 'eyepatch'], ['禿頭', 'bald'], ['蒼き狼', null], ['鉄蹄', null], ['疾風', null], ['鷹', null], ['嵐', null], ['千里馬', null], ['沈黙', null], ['笑顔', null], ['傷痕', null], ['早馬', null], ['長髪', null], ['老兵', null], ['若者', null], ['赤毛', 'redhair']],
  a: ['テムジン', 'ジェベ', 'スブタイ', 'ムカリ', 'ボオルチュ', 'カサル', 'カチウン', 'ベルグタイ', 'ジャムカ', 'トオリル', 'バトゥ', 'モンケ', 'フビライ', 'グユク', 'オゴデイ', 'チャガタイ', 'ジョチ', 'トルイ', 'ソルコクタニ', 'バヤン', 'アジュ', 'アリクブカ', 'カイドゥ', 'ノガイ', 'トクタ', 'ウズベク', 'ティムール', 'バーブル', 'アクサイ', 'カラコルム', 'サマルカンド', 'ブハラ', 'ホラズム', 'カシュガル', 'タングート', 'キプチャク', 'ブルガル', 'アラン', 'ケレイト', 'ナイマン', 'メルキト'],
  b: ['疾風', '鉄蹄', '鷹', '狼', '嵐', '矢', '鞭', '雷', '蒼き狼', '白馬', '黒馬', '赤馬', '早馬', '長駆', '千里', '百里', '追撃者', '包囲者', '征服者', '大汗', '将軍', '先鋒', '殿軍', '斥候', '射手', '槍手', '剣士', '勇者', '智者', '沈黙', '笑顔', '傷痕', '隻眼', '禿頭', '長髪', '辮髪', '老兵', '若者', '帰還者', '放浪者'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0x6a4a28); L.armor = jit(0x7a6a54, 0.05); L.shield = jit(0x8a6a30); }
  else { L.tunic = jit(0x4a3a5a); L.armor = jit(0x6a6a72, 0.05); L.shield = jit(0x5a4a7a); }
  L.helm = 3; L.helmCol = jit(0x9a7a4a); L.crest = null;   // fur-trimmed cap profile
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.7);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_MG = {
  mg_harcher: { kind: K_CAV, name: '弓騎兵', animal: 'horse', rider: W_BOW, hcav: true, hp: 185, riderHp: 110, max: 13.5, march: 3.6, accel: 4.6, turn: 2.2, radius: 0.62, ext: 0.62, mass: 580, chargeDist: 130, disc: 0.7, feigned: true },
  mg_lightcav: { kind: K_CAV, name: '軽騎兵', animal: 'horse', rider: W_BOW, hcav: true, hp: 150, riderHp: 95, max: 14, march: 3.8, accel: 4.8, turn: 2.4, radius: 0.6, ext: 0.6, mass: 540, chargeDist: 140, disc: 0.6, feigned: true },
  mg_lancer: { kind: K_CAV, name: '槍騎兵', animal: 'horse', rider: W_SPEAR, hp: 210, riderHp: 125, max: 12.5, march: 3.4, accel: 4.2, turn: 2.0, radius: 0.63, ext: 0.63, mass: 640, chargeDist: 150, disc: 0.7 },
  mg_heavy: { kind: K_CAV, name: '重騎兵', animal: 'horse', rider: W_SWORD, barding: true, hp: 310, riderHp: 160, max: 11, march: 3.2, accel: 3.6, turn: 1.8, radius: 0.65, ext: 0.64, mass: 800, chargeDist: 130, disc: 0.8 },
  mg_engineer: { kind: K_ENG, name: '攻城技術者', sub: 'onager', hp: 600, max: 0.7, march: 0.7, accel: 0.5, turn: 0.5, radius: 1.5, ext: 1.1, mass: 3000, crew: 5, range: 300, disc: 1 },
};
const SH_MG = { mg_harcher: SH_NONE, mg_lightcav: SH_NONE, mg_lancer: SH_ROUND, mg_heavy: SH_ROUND };
const ROSTER_MG = [
  ['mg_harcher', 10, 4, -60, -50, '弓騎兵 右', { wing: '右翼', q: 0.7 }],
  ['mg_harcher', 10, 4, 60, -50, '弓騎兵 左', { wing: '左翼', q: 0.7 }],
  ['mg_harcher', 10, 4, 0, -62, '弓騎兵 中央', { wing: '中央', q: 0.7 }],
  ['mg_lightcav', 10, 3, -125, -64, '軽騎兵 右', { wing: '右翼', q: 0.6 }],
  ['mg_lightcav', 10, 3, 125, -64, '軽騎兵 左', { wing: '左翼', q: 0.6 }],
  ['mg_lancer', 9, 3, -30, -70, '槍騎兵 右', { wing: '右翼', q: 0.7 }],
  ['mg_lancer', 9, 3, 30, -70, '槍騎兵 左', { wing: '左翼', q: 0.7 }],
  ['mg_heavy', 8, 3, 0, -84, '重騎兵', { wing: '予備', role: 'reserve', q: 0.8 }],
];
function deployMongol(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_MG); return true; }
  return false;
}
deployMongol.handles = st => st.kind === 'field';

// The Genko (1274/1281): when a Mongol pack meets Japan on a landing
// stage, a typhoon arrives late in the battle — missile accuracy
// collapses (env.acc) and the invasion fleet still at anchor loses
// most of its embarked marines. Approximation: hulls do not visibly
// sink; the drowned marines are the fleet's striking power.
function kamikaze(b, st) {
  const w = b.w;
  if (!(st.kind === 'harbor' || st.id === 'naval')) return;
  const ids = (w.eraPacks || []).map(p => p.id);
  if (!ids.includes('mongol') || !ids.includes('japan')) return;
  w.stageEvents.at(420, 'kamikaze', ww => {
    ww.emit('storm', {});
    ww.env.acc = 0.45;
    const mgTeam = w.eraPacks[0].id === 'mongol' ? 0 : 1;
    for (const r of ww.regs) {
      if (r.team !== mgTeam || r.galley === undefined || r.galley === null || r.galley < 0) continue;
      for (const a of r.members) if (a.alive && rand() < 0.55) a.hp = 0;   // drowned with their ship
    }
  });
}

export const mongol = {
  id: 'mongol', name: 'モンゴル',
  factions: [{ name: 'モンゴル軍', names: 'mongol0' }, { name: '草原連合', names: 'mongol0' }],
  types: TYPES_MG, weapons: {}, shields: SH_MG, look,
  scenario: deployMongol, stageHook: kamikaze, arch: 'mongol', reskin: {}, track: 'mongol',
};
