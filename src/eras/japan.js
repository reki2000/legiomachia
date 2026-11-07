// Sengoku Japan (phase 3). Two daimyo houses fight with ashigaru spear
// walls, samurai, bows, naginata — and the teppo: a long-range matchlock
// with an 11 s reload whose volleys boom and shock (the generic gun
// machinery in ai.js), drilled to rotate ranks after firing.
// The castle is the siege stage reskinned (stone walls + tenshu prop);
// the night-raid scenario (world.nightRaid, set from ?scenario=) opens
// the gate from inside at a timed moment.
import { W_SWORD, W_SPEAR, W_BOW, W_PIKE, W_GUN, SH_SMALL, SH_NONE } from '../anim/human.js';
import { K_INF, K_CAV, P_BULLET, registerNameSet } from '../sim/defs.js';
import { fieldArmy, siegeDefence, siegeAttack } from './deploy.js';

registerNameSet('japan0', {
  order: 'ba',
  nick: [['隻眼', 'eyepatch'], ['赤毛', 'redhair'], ['禿頭', 'bald'], ['鬼', null], ['仏', null], ['槍名人', null], ['弓名人', null], ['猛者', null], ['古狸', null], ['若武者', null], ['寝不覚', null], ['酒豪', null], ['韋駄天', null], ['鉄砲名人', null], ['小太刀', null], ['老師', null]],
  a: ['信長', '秀吉', '家康', '信玄', '謙信', '政宗', '元就', '義弘', '長政', '幸村', '兼続', '景勝', '輝元', '氏康', '義昭', '信忠', '秀忠', '利家', '長可', '勝家', '一益', '光秀', '忠興', '長政', '高虎', '直政', '忠勝', '康政', '忠次', '忠世', '親吉', '元忠', '半蔵', '宗矩', '武蔵', '小次郎', '信綱', '早雲', '勘助', '昌幸'],
  b: ['織田', '豊臣', '徳川', '武田', '上杉', '伊達', '毛利', '島津', '黒田', '真田', '直江', '北条', '足利', '今川', '斎藤', '長宗我部', '大友', '龍造寺', '佐竹', '最上', '南部', '津軽', '前田', '加藤', '福島', '浅野', '池田', '蜂須賀', '有馬', '立花', '鍋島', '細川', '井伊', '本多', '榊原', '酒井', '大久保', '鳥居', '服部', '柳生'],
});
registerNameSet('japan1', {
  order: 'ba',
  nick: [['隻眼', 'eyepatch'], ['赤毛', 'redhair'], ['禿頭', 'bald'], ['鬼', null], ['仏', null], ['槍名人', null], ['弓名人', null], ['猛者', null], ['古狸', null], ['若武者', null], ['寝不覚', null], ['酒豪', null], ['韋駄天', null], ['鉄砲名人', null], ['小太刀', null], ['老師', null]],
  a: ['信玄', '勝頼', '信繁', '昌幸', '幸隆', '勘助', '信君', '義信', '逍遥軒', '信廉', '信豊', '勝重', '昌景', '信春', '信高', '信近', '信邦', '義重', '義昌', '義勝', '義忠', '義直', '義政', '義孝', '義成', '義房', '義景', '義久', '義昭', '義統', '義材', '義尚', '義稙', '義澄', '義晴', '義輝', '義栄', '義助', '義種', '義元'],
  b: ['武田', '真田', '穴山', '飯富', '馬場', '内藤', '山県', '土屋', '原', '板垣', '甘利', '諸角', '小山田', '仁科', '高坂', '秋山', '木曾', '今井', '多田', '三枝', '跡部', '曽根', '初鹿野', '下条', '栗原', '長坂', '小幡', '横田', '矢崎', '市川', '駒井', '安中', '望月', '海野', '祢津', '室賀', '出浦', '小泉', '岩手', '大井'],
});

const TYPES = {
  jp_yari: { kind: K_INF, name: '足軽槍', weapon: W_PIKE, hp: 120, run: 4.6, march: 1.7, mass: 72, chargeDist: 20, disc: 0.6, radius: 0.34 },
  jp_samurai: { kind: K_INF, name: '侍', weapon: W_SWORD, hp: 165, run: 5.9, march: 1.9, mass: 82, chargeDist: 50, disc: 0.85, radius: 0.34 },
  jp_bow: { kind: K_INF, name: '弓足軽', weapon: W_BOW, hp: 85, run: 5.5, march: 1.9, mass: 70, chargeDist: 0, disc: 0.5, radius: 0.32 },
  jp_teppo: { kind: K_INF, name: '鉄砲足軽', weapon: W_GUN, hp: 85, run: 5.2, march: 1.8, mass: 72, chargeDist: 0, disc: 0.6, radius: 0.32 },
  jp_naginata: { kind: K_INF, name: '薙刀兵', weapon: W_SPEAR, hp: 125, run: 5.6, march: 1.9, mass: 78, chargeDist: 45, disc: 0.6, radius: 0.34 },
  jp_cav: { kind: K_CAV, name: '騎馬侍', animal: 'horse', rider: W_SWORD, hp: 195, riderHp: 130, max: 12, march: 3.4, accel: 4.2, turn: 2.1, radius: 0.62, ext: 0.62, mass: 590, chargeDist: 130, disc: 0.8 },
};
const WEAPONS = {
  [W_GUN]: { name: '鉄砲', reach: 0.8, dmg: [10, 20], atk: [0.9, 1.1], knock: 0.02, cap: 2, gun: true, ranged: { proj: P_BULLET, range: 175, dur: 1.3, reload: 11 } },
};
const SHIELDS = { jp_yari: SH_SMALL, jp_teppo: SH_SMALL, jp_samurai: SH_NONE, jp_bow: SH_NONE, jp_naginata: SH_NONE };

// Faction looks: house colours over the base look builder.
import { baseHumanLook } from '../sim/defs.js';
import { col } from '../render/segments.js';
import { rand } from '../util.js';
const jit = (hex, j = 0.05) => col(hex, j, rand);
function look(team, role) {
  const L = baseHumanLook(0, 'spear');   // neutral base, recoloured below
  if (team === 0) { L.tunic = jit(0x2a3a5f); L.armor = jit(0x3a3f4a, 0.04); L.shield = jit(0x2a3a5f); }
  else { L.tunic = jit(0x7a2e22); L.armor = jit(0x4a3428, 0.04); L.shield = jit(0x7a2e22); }
  L.helm = 2; L.helmCol = jit(team === 0 ? 0x2e2a26 : 0x59392a, 0.04); L.crest = team === 0 ? jit(0xd8b040) : jit(0xe8e0d0);
  if (role === 'jp_samurai' || role === 'officer' || role === 'general') L.bigCrest = role !== 'jp_samurai';
  if (role === 'jp_yari' || role === 'jp_teppo' || role === 'jp_bow') { L.helm = 3; L.helmCol = jit(0x4a4038); L.crest = null; }
  L.sleeve = L.tunic; L.hips = L.tunic.map(v => v * 0.72);
  L.armorBase = L.armor; L.tunicBase = L.tunic;
  return L;
}

const FIELD_ROSTER = [
  // spear wall in front, guns and bows just behind it (they shoot over
  // the ashigaru — decisive against cavalry-heavy ancient armies,
  // whose charges otherwise ride the teppo down before they can fire)
  ['jp_yari', 18, 8, -44, -40, '槍足軽 I', { wing: '右翼', q: 0.5 }],
  ['jp_yari', 18, 8, 0, -40, '槍足軽 II', { wing: '中央', q: 0.5 }],
  ['jp_yari', 18, 8, 44, -40, '槍足軽 III', { wing: '左翼', q: 0.5 }],
  ['jp_teppo', 16, 4, -28, -50, '鉄砲隊 I', { wing: '中央', q: 0.6 }],
  ['jp_teppo', 16, 4, 28, -50, '鉄砲隊 II', { wing: '中央', q: 0.6 }],
  ['jp_bow', 18, 4, 0, -52, '弓隊', { wing: '中央', q: 0.5 }],
  ['jp_samurai', 14, 6, -22, -70, '侍隊 I', { wing: '中央', q: 0.8 }],
  ['jp_samurai', 14, 6, 22, -70, '侍隊 II', { wing: '中央', q: 0.8 }],
  ['jp_naginata', 14, 5, 66, -58, '薙刀隊', { wing: '左翼', q: 0.6 }],
  ['jp_cav', 9, 4, -104, -62, '騎馬隊 右', { wing: '右翼', q: 0.75 }],
  ['jp_cav', 9, 4, 104, -62, '騎馬隊 左', { wing: '左翼', q: 0.75 }],
  ['engineer', 8, 2, 0, -100, '工兵隊', { wing: '予備', role: 'reserve', q: 0.5 }],
];

function deploy(b, st, team) {
  if (st.kind === 'field') { fieldArmy(b, team, FIELD_ROSTER); return true; }
  if (st.kind === 'siege') {
    const C = st.city;
    if (team === 1) {
      b.armies[1].posture = 'defend';
      siegeDefence(b, team, C,
        [['jp_bow', 20, -60, '城壁弓兵 西'], ['jp_teppo', 14, 0, '城壁鉄砲隊'], ['jp_bow', 20, 60, '城壁弓兵 東'], ['jp_yari', 16, -30, '城壁槍兵 西'], ['jp_yari', 16, 30, '城壁槍兵 東']],
        [['jp_samurai', 12, 5, -6, 16, '城内侍隊', { q: 0.8 }], ['jp_yari', 14, 5, 14, 30, '城内足軽', { q: 0.5 }]]);
      // the tenshu rises behind the walls (render prop; the stage
      // renderer picks it up from the reskin key + this struct)
      st.reskin = 'castle';
      st.structs.push({ type: 'tenshu', x0: -14, z0: C.zb - 34, x1: 14, z1: C.zb - 10, h: 17 });
      // night raid: infiltrators inside open the gate at a set moment
      if (b.w.nightRaid) {
        b.w.stageEvents.at(150, 'nightraid', w => {
          const g = w.stage.gates.find(x => x.alive);
          if (g && w.engineering) { w.engineering.breakGate(g); w.emit('nightraid', {}); w.emit('horn', {}); }
        });
      }
    } else {
      b.armies[0].posture = 'assault';
      siegeAttack(b, team, [
        ['ram', 1, 1, 0, -2, '破城槌', { fixed: true }],
        ['jp_samurai', 14, 5, -40, -16, '侍隊 I', { q: 0.8 }], ['jp_samurai', 14, 5, 40, -16, '侍隊 II', { q: 0.8 }],
        ['jp_yari', 16, 6, 0, -22, '槍足軽', { q: 0.5 }],
        ['jp_teppo', 14, 3, -52, -4, '鉄砲隊', { q: 0.6 }], ['jp_bow', 16, 3, 52, -4, '弓隊', { q: 0.5 }],
        ['engineer', 10, 2, -30, -30, '梯子隊 I', { q: 0.6 }], ['engineer', 10, 2, 30, -30, '梯子隊 II', { q: 0.6 }],
        ['jp_cav', 8, 3, -110, -44, '騎馬隊', { role: 'reserve', q: 0.75 }],
      ]);
    }
    return true;
  }
  return false;
}

deploy.handles = st => st.kind === 'field' || st.kind === 'siege';

export const japan = {
  id: 'japan', name: '戦国日本',
  factions: [{ name: '織田軍', names: 'japan0' }, { name: '武田軍', names: 'japan1' }],
  types: TYPES, weapons: WEAPONS, shields: SHIELDS, look,
  scenario: deploy, arch: 'japan', reskin: { siege: 'castle' }, track: 'japan',
};
