// Phase 8: Korea (Imjin War). A bow-centric army with gunpowder
// support: hand cannon （勝字銃筒 as a handgonne variant), infantry
// cannon, hwacha rocket carts (onager variant — the volley is a rock
// arc, the rockets themselves are approximated), and uibyeong militia
// (low quality, cheap and numerous; their terrain stubbornness is
// approximated by numbers rather than a terrain rule — noted).
// The turtle ship is a naval stage hook: when Korea defends the
// naval stage, turtle ships work the harbour mouth — the invader's
// landed regiments take a cannonade as they come ashore, and the
// Korean shore battery (added by the hook) shoots from the town.
// Approximation: no armoured hull prop, and fire resistance is
// represented by the turtle ships simply not being burnable targets.
import { W_BOW, W_SPEAR, W_SWORD, W_HANDGUN, W_CANNON, SH_SMALL, SH_ROUND, SH_NONE } from '../anim/human.js';
import { K_INF, K_CAV, K_ENG, registerNameSet } from '../sim/defs.js';
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
import { fieldArmy } from './deploy.js';

const jit = (hex, j = 0.05) => col(hex, j, rand);
registerNameSet('korea0', {
  order: 'ba',
  nick: [['隻眼', 'eyepatch'], ['禿頭', 'bald'], ['鉄拳', null], ['早足', null], ['沈黙', null], ['笑顔', null], ['傷痕', null], ['長髪', null], ['大男', null], ['老師', null], ['若者', null], ['赤毛', 'redhair'], ['神射手', null], ['義兵', null], ['僧兵', null], ['水軍', null]],
  a: ['スンシン', 'ユル', 'シミン', 'ホン', 'チェウ', 'チョンイル', 'ジョンアム', 'リプ', 'ソンリョン', 'サンへ', 'タク', 'ウン', 'ジン', 'ウンソ', 'オクヒョン', 'ホ', 'サンホ', 'ウネ', 'ケヨン', 'バル', 'サンヒョン', 'ワン', 'ウオン', 'ジン', 'チョン', 'ガク', 'ミョンウォン', 'ドゥス', 'ハンボク', 'チョル', 'ガン', 'ユルゴク', 'テウ', 'ウイチョン', 'サシン', 'ヨンギュ', 'キフ', 'サミョン', 'デヨン', 'ムンジェ'],
  b: ['イ', 'キム', 'クォン', 'カク', 'チョ', 'シン', 'ユ', 'ソン', 'パク', 'ハン', 'イム', 'ファン', 'ミン', 'チョン', 'ユン', 'ハ', 'カン', 'ソ', 'ペ', 'ナム', 'シム', 'ノ', 'チャン', 'オ', 'ソク', 'アン', 'ヤン', 'ペク', 'ホ', 'ムン', 'グォン', 'ファ', 'バン', 'ウォン', 'パン', 'ギム', 'リュ', 'チョン', 'コン', 'ファン'],
});

function look(team, role) {
  const L = baseHumanLook(0, 'spear');
  if (team === 0) { L.tunic = jit(0x3a5a8a); L.armor = jit(0x7a6a54, 0.05); L.shield = jit(0x8a2a20); }
  else { L.tunic = jit(0x8a3a2a); L.armor = jit(0x6a6a72, 0.05); L.shield = jit(0x2a6a4a); }
  L.helm = 3; L.helmCol = jit(0x2a2a2e); L.crest = null;
  if (role === 'officer' || role === 'general') L.crest = jit(0xd8d0c0);
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}
const TYPES_KR = {
  kr_bow: { kind: K_INF, name: '朝鮮弓兵', weapon: W_BOW, hp: 92, run: 5.6, march: 1.9, mass: 70, chargeDist: 0, disc: 0.55, radius: 0.32 },
  kr_spear: { kind: K_INF, name: '朝鮮槍兵', weapon: W_SPEAR, hp: 118, run: 5.4, march: 1.9, mass: 78, chargeDist: 50, disc: 0.55, radius: 0.33 },
  kr_militia: { kind: K_INF, name: '義兵', weapon: W_SPEAR, hp: 100, run: 5.2, march: 1.8, mass: 72, chargeDist: 44, disc: 0.32, radius: 0.33 },
  kr_gun: { kind: K_INF, name: '銃筒兵', weapon: W_HANDGUN, hp: 90, run: 5.2, march: 1.8, mass: 73, chargeDist: 0, disc: 0.5, radius: 0.32 },
  kr_cannon: { kind: K_INF, name: '火砲兵', weapon: W_CANNON, hp: 95, run: 4.4, march: 1.5, mass: 84, chargeDist: 0, disc: 0.6, radius: 0.32 },
  kr_hwacha: { kind: K_ENG, name: '火車', sub: 'onager', hp: 480, max: 0.8, march: 0.8, accel: 0.5, turn: 0.5, radius: 1.3, ext: 1.0, mass: 1800, crew: 4, range: 300, disc: 1 },
  kr_cav: { kind: K_CAV, name: '朝鮮騎兵', animal: 'horse', rider: W_SWORD, hp: 195, riderHp: 112, max: 12.5, march: 3.5, accel: 4.2, turn: 2.1, radius: 0.62, ext: 0.62, mass: 600, chargeDist: 140, disc: 0.6 },
};
const SH_KR = { kr_bow: SH_NONE, kr_spear: SH_ROUND, kr_militia: SH_SMALL, kr_gun: SH_NONE, kr_cannon: SH_NONE, kr_cav: SH_ROUND };
const ROSTER_KR = [
  ['kr_bow', 20, 4, -36, -44, '弓兵隊 I', { wing: '右翼', q: 0.55 }],
  ['kr_bow', 20, 4, 36, -44, '弓兵隊 II', { wing: '左翼', q: 0.55 }],
  ['kr_spear', 18, 7, 0, -54, '槍兵隊', { wing: '中央', q: 0.55 }],
  ['kr_gun', 14, 3, -64, -50, '銃筒隊', { wing: '右翼', q: 0.5 }],
  ['kr_cannon', 8, 2, 66, -56, '火砲隊', { wing: '左翼', q: 0.6 }],
  ['kr_militia', 20, 6, -90, -64, '義兵 右', { wing: '右翼', q: 0.35 }],
  ['kr_militia', 20, 6, 90, -64, '義兵 左', { wing: '左翼', q: 0.35 }],
  ['kr_cav', 8, 3, -125, -68, '騎兵 右', { wing: '右翼', q: 0.6 }],
  ['kr_cav', 8, 3, 125, -68, '騎兵 左', { wing: '左翼', q: 0.6 }],
  ['kr_hwacha', 2, 1, 0, -80, '火車隊', { wing: '予備', role: 'reserve', fixed: true, q: 0.7 }],
];
function deployKorea(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, ROSTER_KR); return true; }
  return false;
}
deployKorea.handles = st => st.kind === 'field';

// turtle ships at the harbour mouth (naval defence)
function turtleShips(b, st) {
  const w = b.w;
  if (st.id !== 'naval') return;
  const ki = (w.eraPacks || []).findIndex(p => p.id === 'korea');
  if (ki !== 1) return;   // Korea defends as team 1
  const H = st.harbor;
  b.reg(1, 'kr_cannon', 10, 2, -50, H.townZ0 + 6, '亀甲船砲列', { wing: '中央', q: 0.6, fixed: true });
  b.reg(1, 'kr_bow', 18, 3, 50, H.townZ0 + 6, '水軍弓兵', { wing: '中央', q: 0.55 });
  w.stageEvents.at(120, 'turtle', ww => {
    ww.emit('turtle', {});
    for (const r of ww.regs) {
      if (r.team !== 0) continue;
      for (const a of r.agents) if (a.alive && rand() < 0.3) a.hp -= 60;   // the cannonade as they land
    }
  });
}

export const korea = {
  id: 'korea', name: '朝鮮',
  factions: [{ name: '朝鮮軍', names: 'korea0' }, { name: '義兵連合', names: 'korea0' }],
  types: TYPES_KR, weapons: {}, shields: SH_KR, look, advancedArms: true,
  scenario: deployKorea, stageHook: turtleShips, arch: 'korea', reskin: {}, track: 'korea',
};
