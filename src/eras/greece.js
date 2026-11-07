// Phase 9 (lightweight): Greece vs Persia. The phalanx rides the
// TYPES.phalanx arc rule in Combat.damageInf (front x0.6 / flank
// x1.15 / rear x1.35); Spartans are spear elites with the 'brave'
// trait fixed on; peltasts are javelin skirmishers. Persia is kept
// cheap: spear masses, horse, and the Immortals as elite bowmen
// (their spear side is not modelled). Thermopylae: on canyon the
// Greek team blocks the neck with phalanx while the Persian team
// deploys in depth — three reserve regiments commit as later waves
// through the normal reserve AI.
import { W_SPEAR, W_PIKE, W_BOW, W_JAV, SH_ROUND, SH_SMALL } from '../anim/human.js';
import { K_INF, K_CAV, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('greece0', {
  a: ['レオニダス', 'アゲシラオス', 'リュサンドロス', 'パウサニアス', 'ブラシダス', 'アリストデモス', 'エウリュビアデス', 'テミストクレス', 'ミルティアデス', 'キモン', 'ペリクレス', 'アルキビアデス', 'ニキアス', 'デモステネス', 'クセノフォン', 'アゲシラオス2世', 'エパメイノンダス', 'ペロピダス', 'フィリッポス', 'アレクサンドロス', 'パルメニオン', 'ヘファイスティオン', 'クレイトス', 'プトレマイオス', 'セレウコス', 'アンティゴノス', 'デメトリオス', 'ピュロス', 'アラトス', 'フィロポイメン', 'クレオメネス', 'アギス', 'リュクルゴス', 'ソロン', 'ドラコン', 'クレイステネス', 'エフィアルテス', 'アリステイデス', 'フォルミオン', 'イフィクラテス'],
  b: ['の盾', 'の槍', 'の300人', 'の王', 'の将軍', 'の提督', 'の隻眼', 'の傷痕', 'の沈黙', 'の鉄拳', 'の早足', 'の長髪', 'の赤マント', 'の青銅兜', 'の老兵', 'の若者', 'の帰還者', 'の放浪者', 'の傭兵隊長', 'の先鋒', 'の殿軍', 'の旗手', 'の司令官', 'の僭主', 'の民主派', 'の寡頭派', 'の哲学者', 'の詩人', 'の鍛冶', 'の農夫', 'の猟師', 'の船長', 'の航海者', 'の隊商長', 'の守備隊長', 'の新兵', 'の重装兵', 'の軽装兵', 'の騎兵', 'の射手'],
});
registerNameSet('persia0', {
  a: ['キュロス', 'カンビュセス', 'ダレイオス', 'クセルクセス', 'アルタクセルクセス', 'キュロス若年', 'ティッサフェルネス', 'ファルナバゾス', 'メムノン', 'ダタメス', 'アルタバゾス', 'スピトリダテス', 'マウスソロス', 'アリオバルザネス', 'バゴアス', 'ナバルザネス', 'ベッソス', 'スピタメネス', 'オクシュアルテス', 'アトロパテス', 'ヒュダルネス', 'メガビュゾス', 'アルタフェルネス', 'ピシュト', 'フアルナケス', 'ミトラダテス', 'レオミトレス', 'オマレス', 'ニファテス', 'アルブパレス', 'コフェン', 'アサフェルネス', 'ティリバゾス', 'ストルタス', 'オルンテス', 'マイオサレス', 'ダレイオス3世', 'コドマノス', 'アケメネス'],
  b: ['の不死部隊', 'の大王', 'の太守', 'の将軍', 'の提督', 'の隻眼', 'の傷痕', 'の沈黙', 'の金鎖', 'の紫衣', 'の長髪', 'の髭面', 'の老将', 'の若者', 'の帰還者', 'の放浪者', 'の傭兵隊長', 'の先鋒', 'の殿軍', 'の旗手', 'の司令官', 'の総督', 'の徴税官', 'の宦官', 'の近衛', 'の槍手', 'の弓手', 'の騎兵隊長', 'の戦車隊長', 'の象使い', 'の船長', 'の航海者', 'の隊商長', 'の守備隊長', 'の新兵', 'の老兵', 'の反逆者', 'の亡命者', 'の人質', 'の使者'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0xb03024); L.armor = jit(0xb08a3e, 0.05); L.shield = jit(0xc09840); }
  else { L.tunic = jit(0x7a3a8a); L.armor = jit(0x9a8a6a, 0.05); L.shield = jit(0x8a5aa0); }
  L.helm = 2; L.helmCol = jit(0xc09a48);
  L.crest = (role === 'officer' || role === 'general') ? jit(0xd03028) : null;
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_GR = {
  gr_phalanx: { kind: K_INF, name: 'ファランクス', weapon: W_PIKE, hp: 138, run: 4.4, march: 1.6, mass: 88, chargeDist: 20, disc: 0.8, radius: 0.34, phalanx: true },
  gr_spartan: { kind: K_INF, name: 'スパルタ精鋭', weapon: W_SPEAR, hp: 168, run: 5.2, march: 1.8, mass: 88, chargeDist: 44, disc: 0.92, radius: 0.34, phalanx: true, trait: 'brave' },
  gr_peltast: { kind: K_INF, name: 'ペルタスト', weapon: W_JAV, hp: 92, run: 6.2, march: 2.1, mass: 70, chargeDist: 30, disc: 0.5, radius: 0.32 },
  pe_immortal: { kind: K_INF, name: '不死部隊', weapon: W_BOW, hp: 132, run: 5.4, march: 1.9, mass: 78, chargeDist: 0, disc: 0.8, radius: 0.33 },
  pe_spear: { kind: K_INF, name: 'ペルシャ槍兵', weapon: W_SPEAR, hp: 112, run: 5.6, march: 1.9, mass: 76, chargeDist: 48, disc: 0.5, radius: 0.33 },
  pe_cav: { kind: K_CAV, name: 'ペルシャ騎兵', animal: 'horse', rider: W_SPEAR, hp: 190, riderHp: 108, max: 12.5, march: 3.5, accel: 4.2, turn: 2.1, radius: 0.62, ext: 0.62, mass: 600, chargeDist: 140, disc: 0.6 },
};
const SH_GR = { gr_phalanx: SH_ROUND, gr_spartan: SH_ROUND, gr_peltast: SH_SMALL, pe_immortal: SH_SMALL, pe_spear: SH_ROUND, pe_cav: SH_ROUND };
const ROSTER_GR = [
  ['gr_phalanx', 20, 9, -30, -50, 'ファランクス I', { wing: '中央', q: 0.75 }],
  ['gr_phalanx', 20, 9, 30, -50, 'ファランクス II', { wing: '中央', q: 0.75 }],
  ['gr_spartan', 14, 6, 78, -54, 'スパルタ精鋭', { wing: '左翼', q: 0.9 }],
  ['gr_peltast', 16, 4, -78, -46, 'ペルタスト', { wing: '右翼', q: 0.55 }],
  ['pe_immortal', 16, 4, 0, -64, '不死部隊', { wing: '中央', q: 0.8 }],
  ['pe_cav', 8, 3, -120, -64, '騎兵 右', { wing: '右翼', q: 0.6 }],
  ['pe_cav', 8, 3, 120, -64, '騎兵 左', { wing: '左翼', q: 0.6 }],
];
function deployGreece(b, st, team) {
  if (st.id === 'canyon') {
    // Thermopylae: the Greek team seals the neck; the Persian team
    // comes on in depth, three reserves deep as successive waves
    if (team === 0) {
      b.armies[0].posture = 'defend';
      b.reg(0, 'gr_phalanx', 20, 10, 0, -2, 'ファランクス', { wing: '中央', q: 0.8, fixed: true });
      b.reg(0, 'gr_spartan', 12, 5, 0, -14, 'スパルタ精鋭', { wing: '中央', q: 0.92 });
      b.reg(0, 'gr_peltast', 14, 3, -26, -10, 'ペルタスト', { wing: '右翼', q: 0.55 });
      b.officer(0, '中央', 0, -22, '中央将');
      b.general(0, 0, -34, 4);
    } else {
      b.reg(1, 'pe_spear', 20, 8, -24, 60, '槍兵隊 I', { wing: '中央', q: 0.5 });
      b.reg(1, 'pe_spear', 20, 8, 24, 60, '槍兵隊 II', { wing: '中央', q: 0.5 });
      b.reg(1, 'pe_immortal', 18, 4, 0, 78, '不死部隊', { wing: '中央', q: 0.8 });
      b.reg(1, 'pe_spear', 20, 8, 0, 110, '第二波', { wing: '予備', role: 'reserve', q: 0.5 });
      b.reg(1, 'pe_immortal', 16, 4, -30, 128, '第三波', { wing: '予備', role: 'reserve', q: 0.8 });
      b.reg(1, 'pe_spear', 20, 8, 30, 128, '第四波', { wing: '予備', role: 'reserve', q: 0.5 });
      b.reg(1, 'pe_cav', 8, 3, -90, 90, '騎兵', { wing: '右翼', q: 0.6 });
      b.officer(1, '中央', 0, 92, '中央将');
      b.general(1, 0, 142, 5);
    }
    return true;
  }
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_GR); return true; }
  return false;
}
deployGreece.handles = st => st.kind === 'field' || st.id === 'canyon';
export const greece = {
  id: 'greece', name: 'ギリシャ vs ペルシャ',
  factions: [{ name: 'ギリシャ連合', names: 'greece0' }, { name: 'ペルシャ軍', names: 'persia0' }],
  types: TYPES_GR, weapons: {}, shields: SH_GR, look,
  scenario: deployGreece, reskin: {}, track: 'greece',
};
