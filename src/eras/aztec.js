// Phase 13: Conquistadors vs Aztecs — the ultra-asymmetric pack.
// Spain fields a handful of steel: elite swordsmen in morions,
// arquebusiers (teppo-class guns), cavalry, war dogs and a small
// cannon. The Aztecs answer with mass: macuahuitl warriors (W_MACUAH
// — huge damage, but vsArmor 0.45 blunts it against steel/heavy
// types), javelin men, and fanatical morale (the 'loyal' trait fixed
// on, high disc — the capture-theology of their warfare is
// approximated by this refusal to break, noted, not modelled).
// The terror of the unknown runs through the generic coefficient:
// this pack is shockVulnerable, Spain is advancedArms, so composeEra
// sets world.unknownShock[aztec] = 2.2 (gunshot shock in ai.js).
// The lake city is the harbor stage fought as a siege of causeways:
// Spain lands, the Aztecs hold the town end of the causeways.
import { W_SWORD, W_SPEAR, W_GUN, W_CANNON, W_JAV, W_MACUAH, SH_SMALL, SH_ROUND, SH_NONE } from '../anim/human.js';
import { K_INF, K_CAV, P_BULLET, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('spain0', {
  bMode: 'epithet',
  nick: [['隻眼', 'eyepatch'], ['赤毛', 'redhair'], ['禿頭', 'bald'], ['鉄拳', null], ['沈黙', null], ['笑顔', null], ['傷痕', null], ['早足', null], ['長髪', null], ['髭面', null], ['大男', null], ['老師', null], ['若者', null], ['冒険者', null], ['銃士', null], ['剣士', null]],
  a: ['エルナン', 'コルテス', 'ペドロ', 'アルバラード', 'ベルナル', 'ディアス', 'ゴンサロ', 'サンドバル', 'クリストバル', 'オリー', 'フランシスコ', 'ピサロ', 'ディエゴ', 'アルマグロ', 'エルナンド', 'ルケ', 'バルディビア', 'アギーレ', 'オレリャーナ', 'カベサ', 'バカ', 'コロナド', 'バスケス', 'ソト', 'ナルバエス', 'ベラスケス', 'グリハルバ', 'モンテホ', 'アルバラード2', 'ペラルタ', 'オルドニェス', 'タピア', 'メヒア', 'ロハス', 'サエス', 'ベラ', 'カノ', 'ソリス', 'ピネダ', 'レオン'],
  b: ['征服者', '隊長', '副官', '騎士', '剣士', '銃士', '砲手', '旗手', '先鋒', '殿軍', '斥候', '隻眼', '傷痕', '沈黙', '笑顔', '鉄拳', '早足', '長髪', '髭面', '老兵', '若者', '帰還者', '冒険者', '傭兵', '船長', '航海者', '守備隊長', '新兵', '古参', '宣教師', '通訳', '従者', '馬丁', '犬使い', '鍛冶', '商人', '農夫', '猟師', '詩人', '書記'],
});
registerNameSet('aztec0', {
  nick: [['隻眼', 'eyepatch'], ['禿頭', 'bald'], ['鷲', null], ['ジャガー', null], ['羽飾り', null], ['鉄拳', null], ['沈黙', null], ['笑顔', null], ['傷痕', null], ['早足', null], ['長髪', null], ['大男', null], ['老師', null], ['若者', null], ['赤毛', 'redhair'], ['神官', null]],
  a: ['モクテスマ', 'クアウテモク', 'クイトラワク', 'アシャヤカトル', 'ティソク', 'アウィツォトル', 'イツコアトル', 'トラカエレル', 'ネサワルコヨトル', 'ネサワルピリ', 'カカマツィン', 'テスココ', 'トラコパン', 'クアウポポカ', 'イツクアウツィン', 'トラスコ', 'ショコトリ', 'アヤクシ', 'テノチ', 'メシ', 'ウツィロポチトリ', 'トラロック', 'ケツァルコアトル', 'テスカトリポカ', 'ショチピリ', 'マクイルショチトル', 'ヤオトル', 'テクレ', 'ポチトリ', 'クアウトリ', 'オセロトル', 'ミシュトリ', 'アトル', 'コヨトリ', 'シワトリ', 'テオトリ', 'イシュトリ', 'ナワトリ', 'キアウトリ', 'ソチトリ'],
  b: ['鷲戦士', 'ジャガー戦士', '矢戦士', '旗手', '先鋒', '殿軍', '斥候', '神官', '隻眼', '傷痕', '沈黙', '笑顔', '鉄拳', '早足', '長髪', '羽飾り', '老兵', '若者', '帰還者', '放浪者', '守備隊長', '新兵', '古参', '農夫', '猟師', '詩人', '彫刻家', '商人', '貴族', '槍戦士', '棍棒戦士', '投槍手', '弓手', '盾持ち', '隊長', '戦士長', '踊り手', '石工', '織手', '狩人'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0x8a2a20); L.armor = jit(0xb8bcc4, 0.03); L.shield = jit(0x9a8a6a); L.helm = 2; L.helmCol = jit(0xc8ccd4); }
  else { L.tunic = jit(0xd8b040); L.armor = jit(0xc8a858, 0.06); L.shield = jit(0x30a0c0); L.helm = 0; L.hair = 2; }
  L.crest = null;
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_AZ = {
  es_sword: { kind: K_INF, name: 'スペイン剣兵', weapon: W_SWORD, hp: 190, run: 5.6, march: 1.9, mass: 84, chargeDist: 50, disc: 0.9, radius: 0.34 },
  es_arquebus: { kind: K_INF, name: 'アルケブス兵', weapon: W_GUN, hp: 100, run: 5.3, march: 1.8, mass: 74, chargeDist: 0, disc: 0.7, radius: 0.32 },
  es_pike: { kind: K_INF, name: 'スペイン槍兵', weapon: W_SPEAR, hp: 140, run: 5.2, march: 1.8, mass: 82, chargeDist: 44, disc: 0.8, radius: 0.34 },
  es_cav: { kind: K_CAV, name: 'スペイン騎兵', animal: 'horse', rider: W_SWORD, barding: true, hp: 320, riderHp: 165, max: 11.5, march: 3.3, accel: 3.8, turn: 1.9, radius: 0.65, ext: 0.64, mass: 800, chargeDist: 150, disc: 0.85 },
  es_cannon: { kind: K_INF, name: 'スペイン小砲隊', weapon: W_CANNON, hp: 95, run: 4.4, march: 1.5, mass: 84, chargeDist: 0, disc: 0.7, radius: 0.32 },
  az_warrior: { kind: K_INF, name: 'マクアフティル戦士', weapon: W_MACUAH, hp: 118, run: 5.9, march: 2.0, mass: 76, chargeDist: 58, disc: 0.7, radius: 0.33, trait: 'loyal' },
  az_eagle: { kind: K_INF, name: '鷲戦士', weapon: W_MACUAH, hp: 138, run: 6.1, march: 2.0, mass: 78, chargeDist: 62, disc: 0.85, radius: 0.33, trait: 'loyal' },
  az_jav: { kind: K_INF, name: 'アトラトル投槍兵', weapon: W_JAV, hp: 92, run: 6.0, march: 2.0, mass: 70, chargeDist: 34, disc: 0.6, radius: 0.32 },
};
const WEAPONS_AZ = {
  [W_MACUAH]: { name: 'マクアフティル', reach: 1.05, dmg: [24, 44], atk: [0.8, 1.0], knock: 0.05, cap: 3, vsArmor: 0.45 },
};
const SH_AZ = { es_sword: SH_SMALL, es_arquebus: SH_NONE, es_pike: SH_ROUND, es_cav: SH_ROUND, es_cannon: SH_NONE, az_warrior: SH_ROUND, az_eagle: SH_ROUND, az_jav: SH_SMALL };
const ROSTER_ES = [
  ['es_sword', 14, 6, -22, -48, '剣兵隊 I', { wing: '中央', q: 0.9 }],
  ['es_sword', 14, 6, 22, -48, '剣兵隊 II', { wing: '中央', q: 0.9 }],
  ['es_arquebus', 16, 4, -40, -60, 'アルケブス隊 I', { wing: '右翼', q: 0.7 }],
  ['es_arquebus', 16, 4, 40, -60, 'アルケブス隊 II', { wing: '左翼', q: 0.7 }],
  ['es_pike', 16, 7, 0, -68, '槍兵隊', { wing: '中央', q: 0.8 }],
  ['es_cav', 8, 3, -88, -58, '騎兵 右', { wing: '右翼', q: 0.85 }],
  ['es_cav', 8, 3, 88, -58, '騎兵 左', { wing: '左翼', q: 0.85 }],
  ['es_cannon', 8, 2, 0, -84, '小砲隊', { wing: '予備', role: 'reserve', q: 0.7 }],
  ['dog', 8, 2, 110, -70, '軍用犬', { wing: '左翼', q: 0.7 }],
];
const ROSTER_AZ = [
  ['az_warrior', 22, 8, -34, -46, '戦士隊 I', { wing: '中央', q: 0.7 }],
  ['az_warrior', 22, 8, 34, -46, '戦士隊 II', { wing: '中央', q: 0.7 }],
  ['az_warrior', 22, 8, 0, -60, '戦士隊 III', { wing: '中央', q: 0.7 }],
  ['az_eagle', 16, 6, -84, -54, '鷲戦士 右', { wing: '右翼', q: 0.85 }],
  ['az_eagle', 16, 6, 84, -54, '鷲戦士 左', { wing: '左翼', q: 0.85 }],
  ['az_jav', 20, 4, 0, -38, '投槍隊', { wing: '中央', q: 0.6 }],
];
function deployAztec(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, team === 0 ? ROSTER_ES : ROSTER_AZ); return true; }
  if (st.kind === 'harbor') {
    // the lake city: Spain lands from the water, the Aztecs hold the
    // town at the end of the causeways
    const H = st.harbor;
    if (team === 0) {
      b.reg(0, 'es_sword', 14, 6, -H.Bw - 20, H.shore + 8, '上陸剣兵隊 I', { wing: '中央', q: 0.9 });
      b.reg(0, 'es_sword', 14, 6, H.Bw + 20, H.shore + 8, '上陸剣兵隊 II', { wing: '中央', q: 0.9 });
      b.reg(0, 'es_arquebus', 16, 4, 0, H.shore + 14, 'アルケブス隊', { wing: '中央', q: 0.7 });
      b.reg(0, 'es_pike', 14, 6, -44, H.shore + 20, '槍兵隊', { wing: '中央', q: 0.8 });
      b.reg(0, 'es_cannon', 8, 2, 44, H.shore + 22, '小砲隊', { wing: '中央', q: 0.7 });
      b.reg(0, 'dog', 8, 2, -70, H.shore + 16, '軍用犬', { wing: '右翼', q: 0.7 });
      b.officer(0, '中央', 0, H.shore + 28, '中央将');
      b.general(0, 0, H.shore + 40, 4);
    } else {
      st.structs.push({ type: 'keep', x0: -8, z0: H.square.z - 8, x1: 8, z1: H.square.z + 8, h: 13 });
      b.reg(1, 'az_warrior', 22, 8, -44, H.townZ0 + 8, '戦士隊 I', { wing: '中央', q: 0.7 });
      b.reg(1, 'az_warrior', 22, 8, 44, H.townZ0 + 8, '戦士隊 II', { wing: '中央', q: 0.7 });
      b.reg(1, 'az_eagle', 16, 6, 0, H.townZ0 + 20, '鷲戦士', { wing: '中央', q: 0.85 });
      b.reg(1, 'az_jav', 20, 4, 0, H.townZ0 + 30, '投槍隊', { wing: '中央', q: 0.6 });
      b.officer(1, '中央', 0, H.townZ0 + 32, '中央将');
      b.general(1, 0, H.townZ0 + 44, 5);
    }
    return true;
  }
  return false;
}
deployAztec.handles = st => st.kind === 'field' || st.kind === 'harbor';
export const aztec = {
  id: 'aztec', name: 'コンキスタドール vs アステカ',
  factions: [{ name: 'スペイン軍', names: 'spain0' }, { name: 'アステカ軍', names: 'aztec0' }],
  types: TYPES_AZ, weapons: WEAPONS_AZ, shields: SH_AZ, look,
  advancedArms: false, shockVulnerable: false,   // set per-side below
  scenario: deployAztec, arch: 'aztec', reskin: { harbor: 'lakecity' }, track: 'aztec',
};
// asymmetry flags: Spain brings the unknown weapons, the Aztec side
// of THIS pack suffers them — composeEra reads pack-level flags, and
// the two sides of one pack share them, so the shock applies in
// mirror matches too (both armies field both halves in a mirror).
aztec.advancedArms = true; aztec.shockVulnerable = true;
