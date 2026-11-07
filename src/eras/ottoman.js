// Phase 11: Ottoman vs Byzantium. Janissaries (elite infantry on the
// bow-to-matchlock transition — here a disciplined gun unit), Sipahi
// cavalry, akinci horse archers, azab spear masses, and the great
// bombard: a giant onager-variant engine whose shot out-ranges every
// other engine (its wall damage rides the standard rock mechanics —
// the calibre is approximated by range, size and crew, noted).
// Byzantium: theme spearmen, cataphracts (existing type) and Greek
// fire — a short-range flame projector (W_FLAME) that ignites via
// the fire system like any other ignition source.
// Constantinople: the siege stage at full stretch, Greek fire on the
// walls and bombards in the attack. The sea chain and the Golden
// Horn galleys are not representable in the siege geometry — noted.
import { W_SPEAR, W_SWORD, W_BOW, W_GUN, W_FLAME, SH_ROUND, SH_SMALL, SH_NONE } from '../anim/human.js';
import { K_INF, K_CAV, K_ENG, P_FIREARROW, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy, siegeDefence, siegeAttack } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('ottoman0', {
  a: ['オスマン', 'オルハン', 'ムラト', 'バヤズィト', 'メフメト', 'セリム', 'スレイマン', 'イブラヒム', 'カラ・ムスタファ', 'ザガノス', 'ハッサン', 'ウルバン', 'ハリル', 'シナン', 'ソコルル', 'キョプリュリュ', 'バルバロッサ', 'ピーリー', 'セイディ', 'トゥルグト', 'ケマル', 'アリ', 'オメル', 'ユスフ', 'ムスタファ', 'アフメト', 'メフメト2世', 'バヤズィト2世', 'セリム2世', 'ムラト3世', 'アフメト1世', 'オスマン2世', 'ムラト4世', 'イブラヒム1世', 'メフメト4世', 'スレイマン2世', 'アフメト2世', 'ムスタファ2世', 'アフメト3世'],
  b: ['征服者', '雷光', '厳格者', '立法者', '壮麗者', '大帝', '提督', '総大将', '宰相', '大宰相', '砲兵隊長', '騎兵隊長', 'イェニチェリ長官', '近衛隊長', '旗手', '先鋒', '殿軍', '斥候', '隻眼', '傷痕', '沈黙', '笑顔', '鉄拳', '早足', '長髪', '髭面', '老将', '若者', '帰還者', '放浪者', '傭兵隊長', '守備隊長', '船長', '航海者', '隊商長', '新兵', '老兵', '改宗者', '奴隷兵', '解放奴隷'],
});
registerNameSet('byzantine0', {
  a: ['コンスタンティノス', 'ユスティニアヌス', 'ヘラクレイオス', 'レオン', 'バシレイオス', 'ニケフォロス', 'ヨハネス', 'アレクシオス', 'マヌエル', 'アンドロニコス', 'ミカエル', 'テオドロス', 'コンスタンティノス11世', 'ルカス', 'ゲンナディオス', 'ベリサリオス', 'ナルセス', 'ゲオルギオス', 'ニケフォロス2世', 'ヨハネス1世', 'バシレイオス2世', 'ロマノス', 'イサキオス', 'アレクシオス3世', 'テオドロス1世', 'ヨハネス3世', 'ミカエル8世', 'アンドロニコス2世', 'ヨハネス5世', 'マヌエル2世', 'ヨハネス8世', 'コンスタンティノス・ドラガセス', 'ジュスティニアーニ', 'ノタラス', 'スフォルツァ', 'ミノット', 'ボッチアルド', 'グラデニーゴ', 'ロンゴ', 'アルベルガーティ'],
  b: ['皇帝', '共同皇帝', '大公', '将軍', '提督', '近衛隊長', '傭兵隊長', '旗手', '先鋒', '殿軍', '斥候', '隻眼', '傷痕', '沈黙', '笑顔', '鉄拳', '早足', '長髪', '髭面', '老将', '若者', '帰還者', '放浪者', '守備隊長', '船長', '航海者', '隊商長', '新兵', '老兵', '修道士', '司祭', '総主教', '宦官', '宮廷官', '元老院議員', '商人', '鍛冶', '農夫', '猟師', '詩人'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0x2a6a4a); L.armor = jit(0x8a7a5a, 0.05); L.shield = jit(0xb03030); }
  else { L.tunic = jit(0x6a2a6a); L.armor = jit(0x9a8a4a, 0.05); L.shield = jit(0xd8b040); }
  L.helm = 3; L.helmCol = jit(team === 0 ? 0xd8d0c0 : 0x8a8a92); L.crest = null;
  if (role === 'officer' || role === 'general') L.crest = jit(0xd83030);
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_OT = {
  ot_janissary: { kind: K_INF, name: 'イェニチェリ', weapon: W_GUN, hp: 142, run: 5.4, march: 1.9, mass: 80, chargeDist: 0, disc: 0.85, radius: 0.33 },
  ot_azab: { kind: K_INF, name: 'アザブ兵', weapon: W_SPEAR, hp: 108, run: 5.6, march: 1.9, mass: 74, chargeDist: 50, disc: 0.45, radius: 0.33 },
  ot_sipahi: { kind: K_CAV, name: 'シパーヒー', animal: 'horse', rider: W_SWORD, barding: true, hp: 300, riderHp: 152, max: 11.5, march: 3.3, accel: 3.8, turn: 1.9, radius: 0.64, ext: 0.64, mass: 780, chargeDist: 140, disc: 0.78 },
  ot_akinci: { kind: K_CAV, name: 'アクンジュ', animal: 'horse', rider: W_BOW, hcav: true, hp: 155, riderHp: 96, max: 13.5, march: 3.6, accel: 4.6, turn: 2.3, radius: 0.61, ext: 0.61, mass: 560, chargeDist: 120, disc: 0.6 },
  ot_bombard: { kind: K_ENG, name: '巨砲', sub: 'onager', hp: 900, max: 0.5, march: 0.5, accel: 0.4, turn: 0.4, radius: 1.9, ext: 1.4, mass: 5200, crew: 8, range: 380, disc: 1 },
  bz_theme: { kind: K_INF, name: 'テマ軍団兵', weapon: W_SPEAR, hp: 126, run: 5.2, march: 1.8, mass: 80, chargeDist: 46, disc: 0.65, radius: 0.34 },
  bz_greekfire: { kind: K_INF, name: 'ギリシア火兵', weapon: W_FLAME, hp: 100, run: 5.2, march: 1.8, mass: 76, chargeDist: 0, disc: 0.6, radius: 0.33 },
};
const WEAPONS_OT = {
  [W_FLAME]: { name: 'ギリシア火', reach: 0.7, dmg: [6, 12], atk: [1.0, 1.2], knock: 0.02, cap: 2, ranged: { proj: P_FIREARROW, range: 26, dur: 0.5 } },
};
const SH_OT = { ot_janissary: SH_NONE, ot_azab: SH_ROUND, ot_sipahi: SH_ROUND, ot_akinci: SH_NONE, bz_theme: SH_ROUND, bz_greekfire: SH_SMALL };
const ROSTER_OT = [
  ['ot_janissary', 16, 4, -30, -48, 'イェニチェリ I', { wing: '右翼', q: 0.85 }],
  ['ot_janissary', 16, 4, 30, -48, 'イェニチェリ II', { wing: '左翼', q: 0.85 }],
  ['ot_azab', 20, 8, 0, -56, 'アザブ兵', { wing: '中央', q: 0.45 }],
  ['ot_sipahi', 8, 3, -105, -60, 'シパーヒー 右', { wing: '右翼', q: 0.78 }],
  ['ot_sipahi', 8, 3, 105, -60, 'シパーヒー 左', { wing: '左翼', q: 0.78 }],
  ['ot_akinci', 9, 3, -140, -70, 'アクンジュ 右', { wing: '右翼', q: 0.6 }],
  ['ot_akinci', 9, 3, 140, -70, 'アクンジュ 左', { wing: '左翼', q: 0.6 }],
  ['bz_theme', 16, 7, 0, -72, 'テマ軍団兵', { wing: '中央', q: 0.65 }],
];
function deployOttoman(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_OT); return true; }
  if (st.kind === 'siege') {
    const C = st.city;
    if (team === 1) {
      b.armies[1].posture = 'defend';
      siegeDefence(b, team, C,
        [['bz_greekfire', 12, -60, 'ギリシア火 西'], ['bz_theme', 18, 0, '城壁守備隊'], ['bz_greekfire', 12, 60, 'ギリシア火 東']],
        [['cata', 6, 3, -12, 20, 'カタフラクト', { q: 0.8 }], ['bz_theme', 14, 5, 16, 34, '城内歩兵', { q: 0.65 }]]);
      st.reskin = 'constantinople';
    } else {
      b.armies[0].posture = 'assault';
      siegeAttack(b, team, [
        ['ot_bombard', 2, 1, 0, -70, '巨砲', { fixed: true }],
        ['ot_janissary', 16, 4, -46, -20, 'イェニチェリ I', { q: 0.85 }], ['ot_janissary', 16, 4, 46, -20, 'イェニチェリ II', { q: 0.85 }],
        ['ot_azab', 20, 7, 0, -14, 'アザブ兵', { q: 0.45 }],
        ['engineer', 10, 2, -64, -32, '工兵隊', { q: 0.6 }],
        ['ram', 1, 1, 0, -6, '破城槌', { fixed: true }],
        ['ot_sipahi', 7, 3, -120, -50, 'シパーヒー', { role: 'reserve', q: 0.78 }],
      ]);
    }
    return true;
  }
  return false;
}
deployOttoman.handles = st => st.kind === 'field' || st.kind === 'siege';
export const ottoman = {
  id: 'ottoman', name: 'オスマン vs ビザンツ',
  factions: [{ name: 'オスマン軍', names: 'ottoman0' }, { name: 'ビザンツ軍', names: 'byzantine0' }],
  types: TYPES_OT, weapons: WEAPONS_OT, shields: SH_OT, look, advancedArms: true,
  scenario: deployOttoman, reskin: { siege: 'constantinople' }, track: 'ottoman',
};
