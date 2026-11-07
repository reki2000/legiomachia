// Europe, three era packs (restructured plan; Greece and Rome stay
// outside the EU numbering as the ancient prelude).
//   EU1 europe-early (8th–11th c.): the Viking pack folded in —
//     longship landings, shield-wall, berserkers, huscarls, and the
//     Norman proto-knight. Scenarios: landing raid (harbor), a
//     Hastings-style hill fight (hills).
//   EU2 europe-mid (12th–13th c.): the knight at his height — couched
//     lance charge, stone castles, siege towers, trebuchets.
//   EU3 europe-late (14th–15th c.): the Hundred Years War — longbows
//     behind stakes in the mud (marsh), handgonnes, Swiss pike
//     mercenaries, early cannon; the Ottoman Constantinople preset
//     pairs against this era.
import { W_SWORD, W_SPEAR, W_BOW, W_AXE, W_PIKE, W_XBOW, W_LANCE, W_HANDGUN, W_LONGBOW, W_CANNON, SH_SMALL, SH_ROUND, SH_NONE } from '../anim/human.js';
import { K_INF, K_CAV, K_ENG, P_ARROW, P_BULLET, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy, siegeDefence, siegeAttack } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('europe0', {
  a: ['ロロ', 'ハーラル', 'オラフ', 'エイリーク', 'スヴェン', 'クヌート', 'ウィリアム', 'ロベール', 'リチャード', 'ヘンリー', 'ゴドフロワ', 'ボードゥアン', 'タン クレード', 'レイモン', 'ユーグ', 'ジャン', 'ピエール', 'ギヨーム', 'アンリ', 'シャルル', 'ルイ', 'フィリップ', 'エドワード', 'ジョン', 'トマス', 'ロバート', 'ウォルター', 'ラルフ', 'ヒュー', 'ジェフリー', 'サイモン', 'アダム', 'ギルバート', 'ロジャー', 'ヘンリー2世', 'リチャード獅子心', 'サラディン', 'バイバルス', 'カラーウーン', 'アイユーブ', 'ヌールッディーン'],
  b: ['公', '伯', '卿', 'の赤髭', 'の隻眼', 'の長身', 'の沈黙', 'の鉄拳', 'の熊', 'の狐', 'の雷', 'の岩', 'の早足', 'の傷痕', 'の禿頭', 'の笑顔', 'の若様', 'の老師', 'の征服者', 'の無慈悲', 'の敬虔', 'の大胆', 'の穏和', 'の神経質', 'の灰色', 'の金髪', 'の黒髪', 'の赤毛', 'の白髪', 'の長髪', 'の短髪', 'の髭面', 'の童顔', 'の老兵', 'の新兵', 'の帰還者', 'の放浪者', 'の傭兵', 'の巡礼者', 'の修道士'],
});
registerNameSet('europe1', {
  a: ['アーサー', 'ランスロット', 'ガウェイン', 'パーシヴァル', 'ガラハッド', 'トリスタン', 'ベディヴィア', 'ケイ', 'モルドレッド', 'ローラン', 'オリヴィエ', 'シャルルマーニュ', 'オジエ', 'ルノー', 'ジークフリート', 'ハーゲン', 'グンテル', 'ブリュンヒルト', 'クリームヒルト', 'ディートリヒ', 'ヒルデブラント', 'ベーオウルフ', 'ウィグラム', 'ヘンゲスト', 'ホルサ', 'アルフレッド', 'エゼルレッド', 'エドマンド', 'クヌート大王', 'ハーラル3世', 'スタムフォード', 'ヘイスティングス', 'アジャンクール', 'クレシー', 'ポワティエ', 'オルレアン', 'ルーアン', 'カレー', 'アッコン', 'エルサレム'],
  b: ['卿', '公', '伯', 'の円卓', 'の聖杯', 'の竜殺し', 'の獅子心', 'の征服者', 'の敬虔者', 'の大胆者', 'の無慈悲者', 'の正義者', 'の賢者', 'の愚者', 'の放浪者', 'の帰還者', 'の殉教者', 'の異端者', 'の巡礼者', 'の十字軍', 'の傭兵隊長', 'の弓兵隊長', 'の騎士団長', 'の修道騎士', 'の聖堂騎士', 'の病院騎士', 'の旗手', 'の盾持ち', 'の従者', 'の馬丁', 'の鍛冶', 'の司祭', 'の修道士', 'の隠者', 'の予言者', 'の詩人', 'の吟遊詩人', 'の商人', 'の農夫', 'の猟師'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0x5a2e2e); L.armor = jit(0x7a7d84, 0.04); L.shield = jit(0x8a2a20); }
  else { L.tunic = jit(0x2e4a6a); L.armor = jit(0x8a8d94, 0.04); L.shield = jit(0x2a4a8a); }
  L.helm = 1; L.helmCol = jit(0x8f9098); L.crest = null;
  if (role && (role.includes('knight') || role.includes('huscarl') || role === 'officer' || role === 'general')) { L.crest = jit(team === 0 ? 0xd8b040 : 0xe8e0d0); }
  if (role && role.includes('berserk')) { L.helm = 0; L.hair = 2; }
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const SH_EU = { eu_shieldwall: SH_ROUND, eu_huscarl: SH_ROUND, eu_berserk: SH_ROUND, eu_knight_inf: SH_SMALL };

// ------------------------------------------------------------ EU1 early (Vikings folded in)
const TYPES_EU1 = {
  eu_shieldwall: { kind: K_INF, name: '盾の壁歩兵', weapon: W_AXE, hp: 140, run: 5.6, march: 1.9, mass: 84, chargeDist: 48, disc: 0.65, radius: 0.34 },
  eu_berserk: { kind: K_INF, name: '狂戦士', weapon: W_AXE, hp: 150, run: 6.4, march: 2.1, mass: 86, chargeDist: 70, disc: 0.5, radius: 0.34, trait: 'berserk' },
  eu_huscarl: { kind: K_INF, name: 'フスカール', weapon: W_AXE, hp: 165, run: 5.4, march: 1.8, mass: 92, chargeDist: 46, disc: 0.8, radius: 0.34 },
  eu_bow_e: { kind: K_INF, name: '弓兵', weapon: W_BOW, hp: 85, run: 5.5, march: 1.9, mass: 70, chargeDist: 0, disc: 0.45, radius: 0.32 },
  eu_norman: { kind: K_CAV, name: 'ノルマン重騎兵', animal: 'horse', rider: W_SPEAR, barding: true, hp: 300, riderHp: 155, max: 11, march: 3.2, accel: 3.4, turn: 1.7, radius: 0.64, ext: 0.63, mass: 760, chargeDist: 125, disc: 0.75 },
  eu_cav_e: { kind: K_CAV, name: '騎兵', animal: 'horse', rider: W_SPEAR, hp: 185, riderHp: 112, max: 12.5, march: 3.5, accel: 4.2, turn: 2.0, radius: 0.62, ext: 0.62, mass: 600, chargeDist: 140, disc: 0.6 },
};
const ROSTER_EU1 = [
  ['eu_shieldwall', 18, 9, -30, -48, '盾の壁 I', { wing: '中央', q: 0.6 }],
  ['eu_shieldwall', 18, 9, 30, -48, '盾の壁 II', { wing: '中央', q: 0.6 }],
  ['eu_berserk', 10, 3, 0, -36, '狂戦士', { wing: '中央', q: 0.7 }],
  ['eu_huscarl', 14, 6, -70, -56, 'フスカール 右', { wing: '右翼', q: 0.8 }],
  ['eu_huscarl', 14, 6, 70, -56, 'フスカール 左', { wing: '左翼', q: 0.8 }],
  ['eu_bow_e', 16, 3, 0, -62, '弓兵隊', { wing: '中央', q: 0.5 }],
  ['eu_norman', 8, 3, -112, -60, 'ノルマン騎兵 右', { wing: '右翼', q: 0.75 }],
  ['eu_norman', 8, 3, 112, -60, 'ノルマン騎兵 左', { wing: '左翼', q: 0.75 }],
  ['eu_cav_e', 8, 3, 140, -76, '騎兵', { wing: '左翼', q: 0.6 }],
  ['dog', 8, 2, -84, -70, '軍用犬', { wing: '右翼', q: 0.6 }],
];
function deployEU1(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_EU1); return true; }
  if (st.kind === 'harbor') {
    // landing raid: team 0 comes ashore on the beaches, team 1 holds the town
    const H = st.harbor;
    if (team === 0) {
      b.reg(0, 'eu_shieldwall', 16, 6, -H.Bw - 30, H.shore + 6, '上陸隊 I', { wing: '右翼', q: 0.6 });
      b.reg(0, 'eu_shieldwall', 16, 6, H.Bw + 30, H.shore + 6, '上陸隊 II', { wing: '左翼', q: 0.6 });
      b.reg(0, 'eu_berserk', 10, 3, 0, H.shore + 16, '狂戦士', { wing: '中央', q: 0.7 });
      b.reg(0, 'eu_bow_e', 14, 3, -40, H.shore + 22, '弓兵隊', { wing: '中央', q: 0.5 });
      b.reg(0, 'eu_huscarl', 12, 4, 40, H.shore + 20, 'フスカール', { wing: '中央', q: 0.8 });
      b.officer(0, '中央', 0, H.shore + 30, '中央将');
      b.general(0, 0, H.shore + 42, 6);
    } else {
      b.reg(1, 'eu_shieldwall', 16, 6, -50, H.townZ0 + 10, '守備隊 I', { wing: '中央', q: 0.55 });
      b.reg(1, 'eu_huscarl', 12, 5, 50, H.townZ0 + 10, '守備隊 II', { wing: '中央', q: 0.75 });
      b.reg(1, 'eu_bow_e', 16, 3, 0, H.townZ0 + 22, '弓兵隊', { wing: '中央', q: 0.5 });
      b.reg(1, 'eu_norman', 7, 3, 120, H.townZ0 + 26, '騎兵', { wing: '右翼', q: 0.7 });
      b.officer(1, '中央', 0, H.townZ0 + 30, '中央将');
      b.general(1, 0, H.townZ0 + 44, 5);
    }
    return true;
  }
  return false;
}
deployEU1.handles = st => st.kind === 'field' || st.kind === 'harbor';
export const europeEarly = {
  id: 'europe-early', name: '欧州・中世前期',
  factions: [{ name: 'ノース人', names: 'europe0' }, { name: 'フランク軍', names: 'europe1' }],
  types: TYPES_EU1, weapons: {}, shields: SH_EU, look,
  scenario: deployEU1, reskin: { harbor: 'longship' }, track: 'europe-early',
};

// ------------------------------------------------------------ EU2 mid (knights)
const TYPES_EU2 = {
  ...TYPES_EU1,
  eu_knight: { kind: K_CAV, name: '騎士', animal: 'horse', rider: W_LANCE, barding: true, hp: 340, riderHp: 175, max: 11.5, march: 3.2, accel: 3.6, turn: 1.8, radius: 0.65, ext: 0.64, mass: 820, chargeDist: 150, disc: 0.85 },
  eu_squire: { kind: K_CAV, name: '従騎士', animal: 'horse', rider: W_SPEAR, hp: 200, riderHp: 120, max: 12.5, march: 3.5, accel: 4.2, turn: 2.1, radius: 0.62, ext: 0.62, mass: 610, chargeDist: 140, disc: 0.6 },
  eu_heavyinf: { kind: K_INF, name: '重装歩兵', weapon: W_SWORD, hp: 160, run: 5.0, march: 1.7, mass: 92, chargeDist: 40, disc: 0.75, radius: 0.34 },
  eu_xbow_e: { kind: K_INF, name: '弩兵', weapon: W_XBOW, hp: 95, run: 5.2, march: 1.8, mass: 75, chargeDist: 0, disc: 0.5, radius: 0.32 },
  eu_trebuchet: { kind: K_ENG, name: 'トレビュシェット', sub: 'onager', hp: 750, max: 0.6, march: 0.6, accel: 0.5, turn: 0.5, radius: 1.6, ext: 1.2, mass: 3400, crew: 5, range: 330, disc: 1 },
  eu_siegetower: { kind: K_ENG, name: '攻城塔', sub: 'ram', hp: 2600, max: 1.0, march: 1.0, accel: 0.6, turn: 0.4, radius: 1.5, ext: 2.4, mass: 6000, crew: 8, disc: 1 },
};
const WEAPONS_EU2 = {
  [W_LANCE]: { name: 'ランス', reach: 2.6, dmg: [26, 48], atk: [1.0, 1.25], knock: 0.06, antiCav: 0.3, cap: 3, lance: true },
};
const ROSTER_EU2 = [
  ['eu_knight', 8, 3, -60, -52, '騎士団 右', { wing: '右翼', q: 0.85 }],
  ['eu_knight', 8, 3, 60, -52, '騎士団 左', { wing: '左翼', q: 0.85 }],
  ['eu_knight', 8, 3, 0, -64, '騎士団 中央', { wing: '中央', q: 0.9 }],
  ['eu_heavyinf', 18, 9, -28, -46, '重装歩兵 I', { wing: '中央', q: 0.7 }],
  ['eu_heavyinf', 18, 9, 28, -46, '重装歩兵 II', { wing: '中央', q: 0.7 }],
  ['eu_xbow_e', 18, 3, 0, -58, '弩兵隊', { wing: '中央', q: 0.55 }],
  ['eu_squire', 8, 3, -118, -66, '従騎士 右', { wing: '右翼', q: 0.6 }],
  ['eu_squire', 8, 3, 118, -66, '従騎士 左', { wing: '左翼', q: 0.6 }],
  ['eu_shieldwall', 14, 6, 0, -80, '盾の壁', { wing: '予備', role: 'reserve', q: 0.6 }],
];
function deployEU2(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_EU2); return true; }
  if (st.kind === 'siege') {
    const C = st.city;
    if (team === 1) {
      b.armies[1].posture = 'defend';
      siegeDefence(b, team, C,
        [['eu_xbow_e', 18, -60, '城壁弩兵 西'], ['eu_xbow_e', 18, 60, '城壁弩兵 東'], ['eu_heavyinf', 16, 0, '城壁守備隊']],
        [['eu_knight', 6, 3, -10, 18, '城内騎士', { q: 0.85 }], ['eu_heavyinf', 14, 5, 16, 32, '城内歩兵', { q: 0.7 }]]);
      st.reskin = 'castle-eu';
    } else {
      b.armies[0].posture = 'assault';
      siegeAttack(b, team, [
        ['eu_siegetower', 1, 1, -30, -6, '攻城塔 I', { fixed: true }], ['eu_siegetower', 1, 1, 30, -6, '攻城塔 II', { fixed: true }],
        ['eu_heavyinf', 16, 6, -44, -16, '重装歩兵 I', { q: 0.7 }], ['eu_heavyinf', 16, 6, 44, -16, '重装歩兵 II', { q: 0.7 }],
        ['eu_xbow_e', 18, 3, 0, -8, '弩兵隊', { q: 0.55 }],
        ['engineer', 10, 2, -60, -30, '工兵隊 I', { q: 0.6 }], ['engineer', 10, 2, 60, -30, '工兵隊 II', { q: 0.6 }],
        ['eu_trebuchet', 2, 1, 0, -64, 'トレビュシェット', { fixed: true }],
        ['eu_knight', 7, 3, -120, -48, '騎士団', { role: 'reserve', q: 0.85 }],
      ]);
    }
    return true;
  }
  return false;
}
deployEU2.handles = st => st.kind === 'field' || st.kind === 'siege';
export const europeMid = {
  id: 'europe-mid', name: '欧州・中世盛期',
  factions: [{ name: 'フランス軍', names: 'europe0' }, { name: '帝国軍', names: 'europe1' }],
  types: TYPES_EU2, weapons: WEAPONS_EU2, shields: SH_EU, look,
  scenario: deployEU2, reskin: { siege: 'castle-eu' }, track: 'europe-mid',
};

// ------------------------------------------------------------ EU3 late (Hundred Years War)
const TYPES_EU3 = {
  ...TYPES_EU2,
  eu_longbow: { kind: K_INF, name: 'ロングボウ兵', weapon: W_LONGBOW, hp: 85, run: 5.6, march: 1.9, mass: 70, chargeDist: 0, disc: 0.55, radius: 0.32 },
  eu_handgonne: { kind: K_INF, name: '手銃兵', weapon: W_HANDGUN, hp: 88, run: 5.2, march: 1.8, mass: 73, chargeDist: 0, disc: 0.5, radius: 0.32 },
  eu_swiss: { kind: K_INF, name: 'スイス槍兵', weapon: W_PIKE, hp: 140, run: 4.6, march: 1.7, mass: 86, chargeDist: 26, disc: 0.8, radius: 0.34 },
  eu_cannon_e: { kind: K_INF, name: '大砲隊', weapon: W_CANNON, hp: 95, run: 4.4, march: 1.5, mass: 84, chargeDist: 0, disc: 0.6, radius: 0.32 },
};
const WEAPONS_EU3 = {
  [W_LONGBOW]: { name: 'ロングボウ', reach: 0.8, dmg: [14, 30], atk: [0.75, 0.95], knock: 0.02, cap: 2, ranged: { proj: P_ARROW, range: 215, dur: 1.5 } },
  [W_HANDGUN]: { name: '手銃', reach: 0.7, dmg: [8, 16], atk: [1.0, 1.2], knock: 0.02, cap: 2, gun: true, ranged: { proj: P_BULLET, range: 62, dur: 1.0, reload: 9 } },
  [W_CANNON]: { name: '大砲', reach: 0.8, dmg: [8, 16], atk: [1.0, 1.2], knock: 0.02, cap: 2, gun: true, ranged: { proj: P_BULLET, range: 150, dur: 1.8, reload: 16 } },
};
const ROSTER_EU3 = [
  ['eu_longbow', 20, 5, -34, -44, 'ロングボウ I', { wing: '右翼', q: 0.55 }],
  ['eu_longbow', 20, 5, 34, -44, 'ロングボウ II', { wing: '左翼', q: 0.55 }],
  ['eu_swiss', 18, 10, 0, -52, 'スイス槍兵', { wing: '中央', q: 0.8 }],
  ['eu_heavyinf', 14, 6, -66, -54, '重装歩兵', { wing: '右翼', q: 0.7 }],
  ['eu_handgonne', 12, 3, 62, -50, '手銃隊', { wing: '左翼', q: 0.5 }],
  ['eu_knight', 8, 3, -112, -62, '騎士団 右', { wing: '右翼', q: 0.85 }],
  ['eu_knight', 8, 3, 112, -62, '騎士団 左', { wing: '左翼', q: 0.85 }],
  ['eu_cannon_e', 8, 2, 0, -84, '大砲隊', { wing: '予備', role: 'reserve', q: 0.6 }],
  ['eu_xbow_e', 16, 3, 0, -70, '弩兵隊', { wing: '中央', q: 0.55 }],
];
function deployEU3(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_EU3); return true; }
  if (st.id === 'marsh') {
    // the mud-archery fight: the defender's longbows sit behind the
    // wet ground; the attacker's knights must cross it
    if (team === 1) {
      b.armies[1].posture = 'defend';
      b.reg(1, 'eu_longbow', 20, 4, -40, 44, 'ロングボウ I', { wing: '中央', q: 0.6, fixed: true });
      b.reg(1, 'eu_longbow', 20, 4, 40, 44, 'ロングボウ II', { wing: '中央', q: 0.6, fixed: true });
      b.reg(1, 'eu_swiss', 16, 7, 0, 56, 'スイス槍兵', { wing: '中央', q: 0.8 });
      b.reg(1, 'eu_handgonne', 12, 3, -76, 48, '手銃隊', { wing: '右翼', q: 0.5 });
      b.officer(1, '中央', 0, 64, '中央将');
      b.general(1, 0, 78, 5);
    } else {
      b.reg(0, 'eu_knight', 9, 3, -70, -52, '騎士団 右', { wing: '右翼', q: 0.85 });
      b.reg(0, 'eu_knight', 9, 3, 70, -52, '騎士団 左', { wing: '左翼', q: 0.85 });
      b.reg(0, 'eu_heavyinf', 16, 6, 0, -58, '重装歩兵', { wing: '中央', q: 0.7 });
      b.reg(0, 'eu_xbow_e', 16, 3, 0, -72, '弩兵隊', { wing: '中央', q: 0.55 });
      b.reg(0, 'eu_squire', 8, 3, -130, -66, '従騎士', { wing: '右翼', q: 0.6 });
      b.officer(0, '中央', 0, -80, '中央将');
      b.general(0, 0, -92, 6);
    }
    return true;
  }
  return false;
}
deployEU3.handles = st => st.kind === 'field' || st.id === 'marsh';
export const europeLate = {
  id: 'europe-late', name: '欧州・中世後期',
  factions: [{ name: 'イングランド軍', names: 'europe0' }, { name: 'フランス軍', names: 'europe1' }],
  types: TYPES_EU3, weapons: WEAPONS_EU3, shields: SH_EU, look,
  scenario: deployEU3, reskin: {}, track: 'europe-late',
};
