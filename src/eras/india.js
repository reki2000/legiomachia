// Phase 12: India. An elephant-centric pack: ten war elephants a
// side with their temperaments (phase 1) driving the panic chains,
// chariots, Rajput swordsmen, spearmen and massed bows. The monsoon
// is a stage hook: mid-battle the rains arrive — missile accuracy
// and movement sag (env factors) as the ground turns. A rising-stream
// flood at true monsoon scale is out of scope for the hook; the rain
// factors are the documented approximation.
import { W_SPEAR, W_SWORD, W_BOW, SH_ROUND, SH_SMALL, SH_NONE } from '../anim/human.js';
import { K_INF, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('india0', {
  nick: [['隻眼', 'eyepatch'], ['赤毛', 'redhair'], ['禿頭', 'bald'], ['鉄拳', null], ['沈黙', null], ['笑顔', null], ['傷痕', null], ['早足', null], ['長髪', null], ['髭面', null], ['大男', null], ['老師', null], ['若者', null], ['象使い', null], ['戦象乗り', null], ['神射手', null]],
  a: ['アショーカ', 'チャンドラグプタ', 'ビンドゥサーラ', 'サムドラグプタ', 'チャンドラグプタ2世', 'ハルシャ', 'スカンダグプタ', 'クマーラグプタ', 'ミヒラクラ', 'ヤショーダルマン', 'プリトヴィーラージ', 'ジャイチャンド', 'アラウッディーン', 'ムハンマド', 'バーブル', 'フマーユーン', 'アクバル', 'ジャハーンギール', 'シャー・ジャハーン', 'アウラングゼーブ', 'シヴァージー', 'サンバージー', 'ラージプート', 'ラーナー', 'マハーラーナー', 'プラタープ', 'ドゥルガーダース', 'ジャスワント', 'アマル', 'ウダイ', 'クンバ', 'サンガ', 'ハンミーラ', 'ラタン', 'パドミニ', 'チャンド', 'ビール', 'アルジュン', 'ビーマ'],
  b: ['チャウハン', 'ラートール', 'シソーディア', 'カチワーハ', 'パーンディヤ', 'チョーラ', 'チャールキヤ', 'グプタ', 'マウリヤ', 'ラージプート', 'マラーター', 'シク', 'プラティーハラ', 'パーラ', 'セーナ', 'カダンバ', 'ホイサラ', 'カカティーヤ', 'ヴィジャヤナガラ', 'ムガル', 'ローディー', 'スール', 'サータヴァーハナ', 'パッラヴァ', 'ガーンガ', 'ソーランキ', 'パルマーラ', 'チャンデーラ', 'カールチュリ', 'トーマラ', 'ミーナー', 'グヒラ', 'ジャート', 'アヒール', 'カーヤスタ', 'ラーシュトラクータ', 'ヤーダヴァ', 'カールヤ', 'ボースラ', 'シンディア'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0xd8a030); L.armor = jit(0x9a7a4a, 0.05); L.shield = jit(0xb05020); }
  else { L.tunic = jit(0x30a0a8); L.armor = jit(0x8a8a92, 0.05); L.shield = jit(0x2868a0); }
  L.helm = 3; L.helmCol = jit(0xd8b040); L.crest = null;
  if (role === 'officer' || role === 'general') L.crest = jit(0xe8e0d0);
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.74);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_IN = {
  in_rajput: { kind: K_INF, name: 'ラジプート歩兵', weapon: W_SWORD, hp: 148, run: 5.6, march: 1.9, mass: 82, chargeDist: 54, disc: 0.72, radius: 0.34 },
  in_spear: { kind: K_INF, name: 'インド槍兵', weapon: W_SPEAR, hp: 118, run: 5.4, march: 1.9, mass: 78, chargeDist: 50, disc: 0.55, radius: 0.33 },
  in_bow: { kind: K_INF, name: 'インド弓兵', weapon: W_BOW, hp: 90, run: 5.5, march: 1.9, mass: 70, chargeDist: 0, disc: 0.5, radius: 0.32 },
};
const SH_IN = { in_rajput: SH_ROUND, in_spear: SH_ROUND, in_bow: SH_NONE };
const ROSTER_IN = [
  ['ele', 4, 1, -60, -48, '戦象隊 右', { wing: '右翼', q: 0.7 }],
  ['ele', 4, 1, 60, -48, '戦象隊 左', { wing: '左翼', q: 0.7 }],
  ['ele', 2, 1, 0, -40, '戦象隊 中央', { wing: '中央', q: 0.75 }],
  ['chr', 3, 1, -100, -58, '戦車隊', { wing: '右翼', q: 0.65 }],
  ['in_rajput', 16, 7, -28, -58, 'ラジプート I', { wing: '中央', q: 0.72 }],
  ['in_rajput', 16, 7, 28, -58, 'ラジプート II', { wing: '中央', q: 0.72 }],
  ['in_spear', 18, 7, 0, -68, '槍兵隊', { wing: '中央', q: 0.55 }],
  ['in_bow', 20, 4, 0, -52, '弓兵隊', { wing: '中央', q: 0.5 }],
  ['cata', 6, 2, -130, -66, '騎兵 右', { wing: '右翼', q: 0.7 }],
  ['cata', 6, 2, 130, -66, '騎兵 左', { wing: '左翼', q: 0.7 }],
];
function deployIndia(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_IN); return true; }
  return false;
}
deployIndia.handles = st => st.kind === 'field';

// the monsoon breaks mid-battle
function monsoon(b, st) {
  const w = b.w;
  if (st.kind !== 'field' && st.kind !== 'river') return;
  w.stageEvents.at(300, 'monsoon', ww => {
    ww.emit('monsoon', {});
    ww.env.acc = 0.7; ww.env.speed = 0.94;
  });
}

export const india = {
  id: 'india', name: 'インド',
  factions: [{ name: 'インド諸王国軍', names: 'india0' }, { name: 'ラージプート連合', names: 'india0' }],
  types: TYPES_IN, weapons: {}, shields: SH_IN, look,
  scenario: deployIndia, stageHook: monsoon, arch: 'india', reskin: {}, track: 'india',
};
