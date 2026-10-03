// Unit types, weapons, per-soldier stats and appearance.
import {
  W_SWORD, W_SPEAR, W_BOW, W_AXE, W_MACE, W_PIKE, W_JAV, W_SLING, W_XBOW, W_HAMMER, W_BANNER,
  SH_NONE, SH_ROUND, SH_RECT, SH_SMALL,
} from '../anim/human.js';
import { col } from '../render/segments.js';
import { rand, randNormal, clamp } from '../util.js';

export const K_INF = 0, K_CAV = 1, K_ELE = 2, K_CHR = 3, K_DOG = 4, K_ENG = 5;
export const P_ARROW = 0, P_JAV = 1, P_STONE = 2, P_BOLT = 3, P_ROCK = 4;

// reach in metres beyond body radii; dmg range; attack duration range
export const WEAPONS = {
  [W_SWORD]: { name: '剣', reach: 0.9, dmg: [20, 42], atk: [0.75, 1.0], knock: 0.04, cap: 2 },
  [W_AXE]: { name: '戦斧', reach: 0.95, dmg: [30, 56], atk: [0.95, 1.25], knock: 0.15, shieldBreak: 0.35, cap: 2 },
  [W_MACE]: { name: '棍棒', reach: 0.85, dmg: [22, 40], atk: [0.85, 1.1], knock: 0.3, cap: 2 },
  [W_SPEAR]: { name: '槍', reach: 1.8, dmg: [22, 45], atk: [0.85, 1.1], knock: 0.03, antiCav: 0.55, closeDist: 1.45, closeMul: 0.45, cap: 3 },
  [W_PIKE]: { name: '長槍(サリッサ)', reach: 3.4, dmg: [24, 44], atk: [1.0, 1.3], knock: 0.05, antiCav: 0.85, closeDist: 2.2, closeMul: 0.25, cap: 3 },
  [W_JAV]: { name: '投槍', reach: 1.35, dmg: [18, 34], atk: [0.8, 1.0], knock: 0.03, cap: 2, ranged: { proj: P_JAV, range: 34, dur: 1.1, ammo: 3 } },
  [W_SLING]: { name: '投石紐', reach: 0.7, dmg: [10, 20], atk: [0.8, 1.0], knock: 0.02, cap: 2, ranged: { proj: P_STONE, range: 115, dur: 1.6 } },
  [W_BOW]: { name: '弓', reach: 0.8, dmg: [12, 26], atk: [0.8, 1.0], knock: 0.02, cap: 2, ranged: { proj: P_ARROW, range: 175, dur: 1.7 } },
  [W_XBOW]: { name: '弩', reach: 0.8, dmg: [12, 26], atk: [0.8, 1.0], knock: 0.02, cap: 2, ranged: { proj: P_BOLT, range: 150, dur: 1.0, reload: 3.2 } },
  [W_HAMMER]: { name: '工具', reach: 0.8, dmg: [12, 26], atk: [0.9, 1.1], knock: 0.1, cap: 2 },
  [W_BANNER]: { name: '軍旗', reach: 1.1, dmg: [8, 16], atk: [1.0, 1.2], knock: 0.05, cap: 2 },
};

export const TYPES = {
  sword: { kind: K_INF, name: '剣兵', weapon: W_SWORD, hp: 130, run: 5.7, march: 1.9, mass: 80, chargeDist: 42, disc: 0.65, radius: 0.34 },
  axe: { kind: K_INF, name: '斧兵', weapon: W_AXE, hp: 140, run: 5.9, march: 1.9, mass: 85, chargeDist: 55, disc: 0.4, radius: 0.34 },
  mace: { kind: K_INF, name: '棍棒兵', weapon: W_MACE, hp: 120, run: 5.8, march: 1.9, mass: 80, chargeDist: 50, disc: 0.35, radius: 0.34 },
  spear: { kind: K_INF, name: '槍兵', weapon: W_SPEAR, hp: 140, run: 5.0, march: 1.8, mass: 85, chargeDist: 32, disc: 0.6, radius: 0.34 },
  pike: { kind: K_INF, name: '長槍兵', weapon: W_PIKE, hp: 135, run: 4.3, march: 1.6, mass: 85, chargeDist: 22, disc: 0.65, radius: 0.34 },
  jav: { kind: K_INF, name: '投槍兵', weapon: W_JAV, hp: 95, run: 6.3, march: 2.1, mass: 70, chargeDist: 0, disc: 0.4, radius: 0.32, skirm: true },
  sling: { kind: K_INF, name: '投石兵', weapon: W_SLING, hp: 85, run: 6.1, march: 2.1, mass: 68, chargeDist: 0, disc: 0.35, radius: 0.32, skirm: true },
  archer: { kind: K_INF, name: '弓兵', weapon: W_BOW, hp: 85, run: 5.5, march: 1.9, mass: 70, chargeDist: 0, disc: 0.45, radius: 0.32 },
  xbow: { kind: K_INF, name: '弩兵', weapon: W_XBOW, hp: 95, run: 5.2, march: 1.8, mass: 75, chargeDist: 0, disc: 0.5, radius: 0.32 },
  engineer: { kind: K_INF, name: '工兵', weapon: W_HAMMER, hp: 95, run: 5.3, march: 1.9, mass: 75, chargeDist: 0, disc: 0.5, radius: 0.32 },
  cav: { kind: K_CAV, name: '騎兵', animal: 'horse', hp: 180, riderHp: 110, max: 12.5, march: 3.5, accel: 4.2, turn: 2.0, radius: 0.62, ext: 0.62, mass: 600, chargeDist: 140, disc: 0.6 },
  hcav: { kind: K_CAV, name: '弓騎兵', animal: 'horse', rider: W_BOW, hp: 160, riderHp: 95, max: 13, march: 4, accel: 5, turn: 2.4, radius: 0.62, ext: 0.62, mass: 560, chargeDist: 0, disc: 0.5, skirm: true, range: 70 },
  cata: { kind: K_CAV, name: '重装騎兵', animal: 'horse', rider: W_SPEAR, barding: true, hp: 330, riderHp: 170, max: 10.5, march: 3, accel: 3.2, turn: 1.6, radius: 0.66, ext: 0.64, mass: 800, chargeDist: 120, disc: 0.75 },
  camel: { kind: K_CAV, name: '駱駝騎兵', animal: 'camel', rider: W_SWORD, hp: 210, riderHp: 105, max: 10.5, march: 3, accel: 3.6, turn: 1.8, radius: 0.66, ext: 0.7, mass: 650, chargeDist: 120, disc: 0.55 },
  general: { kind: K_CAV, name: '総大将', animal: 'horse', rider: W_SWORD, hp: 280, riderHp: 200, max: 11.5, march: 3, accel: 4, turn: 2.2, radius: 0.62, ext: 0.62, mass: 620, chargeDist: 80, disc: 0.9, commander: 2 },
  officer: { kind: K_CAV, name: '将', animal: 'horse', rider: W_SWORD, hp: 230, riderHp: 160, max: 12, march: 3, accel: 4, turn: 2.2, radius: 0.62, ext: 0.62, mass: 620, chargeDist: 80, disc: 0.85, commander: 1 },
  guard: { kind: K_CAV, name: '親衛騎兵', animal: 'horse', rider: W_SWORD, barding: true, hp: 260, riderHp: 160, max: 11.5, march: 3, accel: 4, turn: 2.0, radius: 0.64, ext: 0.62, mass: 700, chargeDist: 90, disc: 0.9 },
  ele: { kind: K_ELE, name: '戦象', hp: 1500, max: 5.8, march: 1.9, accel: 1.4, turn: 0.75, radius: 1.2, ext: 1.0, mass: 4500, chargeDist: 80, range: 70, disc: 0.5 },
  chr: { kind: K_CHR, name: '戦車', hp: 400, max: 11, march: 3.0, accel: 3.2, turn: 1.25, radius: 1.0, ext: 1.4, mass: 1100, chargeDist: 150, range: 60, disc: 0.55 },
  dog: { kind: K_DOG, name: '軍用犬', hp: 50, max: 9.5, march: 3, accel: 12, turn: 6, radius: 0.3, ext: 0, mass: 38, chargeDist: 400, disc: 0.7 },
  ram: { kind: K_ENG, name: '破城槌', sub: 'ram', hp: 1800, max: 1.3, march: 1.3, accel: 0.8, turn: 0.5, radius: 1.3, ext: 2.2, mass: 5000, crew: 6, disc: 1 },
  onager: { kind: K_ENG, name: '投石機', sub: 'onager', hp: 600, max: 0.7, march: 0.7, accel: 0.5, turn: 0.5, radius: 1.3, ext: 0.9, mass: 2500, crew: 4, range: 280, disc: 1 },
};

export const SHIELD_FOR = {
  0: { sword: SH_RECT, spear: SH_RECT, axe: SH_ROUND, mace: SH_ROUND, jav: SH_SMALL, engineer: SH_NONE, pike: SH_NONE },
  1: { sword: SH_ROUND, spear: SH_ROUND, axe: SH_ROUND, mace: SH_SMALL, jav: SH_SMALL, engineer: SH_NONE, pike: SH_SMALL },
};

// ---- individual soldiers ----
// quality: 0 = levy, 0.5 = regular, 1 = veteran
export function genStats(quality) {
  const q = quality;
  // wide spread: some men are visibly small, some are giants
  const size = clamp(1 + randNormal() * 0.075, 0.8, 1.24);
  const r = v => Math.round(clamp(v, 5, 99));
  return {
    size,
    str: r(45 + q * 22 + randNormal() * 18 + (size - 1) * 110),
    spd: r(52 + q * 6 + randNormal() * 18 - (size - 1) * 80),
    vit: r(46 + q * 18 + randNormal() * 18 + (size - 1) * 60),
    def: r(38 + q * 32 + randNormal() * 17),
    mor: r(40 + q * 34 + randNormal() * 19),
  };
}

const NAMES = {
  0: {
    a: ['マルクス', 'ガイウス', 'ルキウス', 'ティトゥス', 'クィントゥス', 'プブリウス', 'グナエウス', 'アウルス', 'デキムス', 'セルウィウス', 'セクストゥス', 'スプリウス', 'マニウス', 'ヌメリウス'],
    b: ['ユリウス', 'コルネリウス', 'ウァレリウス', 'クラウディウス', 'ファビウス', 'アエミリウス', 'リキニウス', 'センプロニウス', 'トゥッリウス', 'ユニウス', 'オクタウィウス', 'フラウィウス', 'ポンペイウス', 'セルギウス', 'ドミティウス'],
  },
  1: {
    a: ['アルサケス', 'ダレイオス', 'キュロス', 'バガダテス', 'ミトラダテス', 'ティリダテス', 'アルタバノス', 'オロンテス', 'ファルナケス', 'ヒュダルネス', 'マザイオス', 'スピタメネス', 'ポロス', 'チャンドラ'],
    b: ['アルタクセルクセス', 'ベッソス', 'ロクサネス', 'サトラペス', 'ヴィシュタスパ', 'アリオバルザネス', 'オクシュアルテス', 'ナルセス', 'バフラーム', 'シャープール'],
  },
};
export function genName(team) {
  const N = NAMES[team] || NAMES[0];
  return N.a[Math.floor(rand() * N.a.length)] + '・' + N.b[Math.floor(rand() * N.b.length)];
}

// ---- looks ----
function jit(hex, j = 0.08) { return col(hex, j, rand); }
const pick = a => a[Math.floor(rand() * a.length)];

export function humanLook(team, role) {
  const L = {
    skin: jit(pick([0xc99a78, 0xb98663, 0xa87552, 0xd6a986]), 0.05),
    tunic: null, sleeve: null, legs: null, helm: 0, helmCol: jit(0x8f9098), crest: null,
    shield: null, shieldRim: null, wood: jit(0x6b4a2a), metal: jit(0xa8a8b0, 0.05),
    armor: null, cape: null, bigCrest: false, flag: null, belt: jit(0x4a3420),
  };
  if (team === 0) {
    L.tunic = jit(0x9c2a22); L.armor = jit(0x7d7f86, 0.06); L.legs = jit(0x5a3a22);
    L.helm = 1; L.crest = jit(0xb02020); L.shield = jit(0xa82a24); L.shieldRim = jit(0xd8b040);
    if (role === 'archer' || role === 'sling') { L.tunic = jit(0x6d6a3a); L.armor = jit(0x8a6a44); L.helm = 3; L.helmCol = jit(0x7a5a38); }
    if (role === 'jav') { L.armor = L.tunic; L.helm = 4; L.helmCol = jit(0x6a5a40); L.shield = jit(0x8a3a2a); }
    if (role === 'spear') { L.tunic = jit(0x8a2020); L.armor = jit(0x9a9aa4); }
    if (role === 'engineer') { L.tunic = jit(0x7a5a3a); L.armor = jit(0x5a4028); L.helm = 3; L.helmCol = jit(0x5a4a30); }
    if (role === 'axe' || role === 'mace') { L.tunic = jit(0x5a6a3a); L.armor = jit(0x6a5a3a); L.helm = 0; L.shield = jit(0x4a6a3a); }
    if (role === 'rider') { L.tunic = jit(0x9c2a22); L.armor = jit(0x8a8a90); L.crest = jit(0xe8e0d0); }
  } else {
    L.tunic = jit(pick([0x2d4f86, 0x284a7a, 0xc9b88f])); L.armor = jit(0xc8b890, 0.06);
    L.legs = jit(0x3a3040); L.helm = 2; L.helmCol = jit(0xb08a44); L.crest = null;
    L.shield = jit(pick([0xb08a3a, 0x2a4f9a, 0xa89060])); L.shieldRim = jit(0x6a4a20);
    if (role === 'archer' || role === 'sling') { L.tunic = jit(0xc0a878); L.armor = jit(0xb09870); L.helm = 3; L.helmCol = jit(0xe0d8c0); }
    if (role === 'xbow') { L.tunic = jit(0x3a4a6a); L.armor = jit(0x6a6a70); L.helm = 2; }
    if (role === 'pike') { L.tunic = jit(0x7a2a6a); L.armor = jit(0xc0a060); L.helm = 1; L.crest = jit(0xe8e0d0); L.shield = jit(0xb08a3a); }
    if (role === 'axe' || role === 'mace') { L.tunic = jit(pick([0x6a4a2a, 0x3a5a3a, 0x7a6a4a])); L.armor = jit(0x5a4a3a); L.helm = rand() < 0.5 ? 0 : 4; L.helmCol = jit(0x4a3a2a); L.shield = jit(pick([0x6a2a1a, 0x2a3a5a, 0x8a7a4a])); }
    if (role === 'jav') { L.armor = L.tunic; L.helm = 4; L.helmCol = jit(0xd0c8b0); }
    if (role === 'engineer') { L.tunic = jit(0x8a7050); L.armor = jit(0x6a5038); L.helm = 3; L.helmCol = jit(0xd0c8b0); }
    if (role === 'rider') { L.tunic = jit(0x2a3c70); L.armor = jit(0xb89a58); }
  }
  L.sleeve = L.tunic;
  L.hips = L.tunic.map(v => v * 0.72);
  return L;
}

// officers & standard bearers stand out
export function commanderLook(L, team, rank) {
  L.cape = jit(rank >= 2 ? 0xd8c070 : team === 0 ? 0xc03020 : 0x6a2a8a, 0.03);
  L.crest = jit(rank >= 1 ? 0xf0e8d8 : team === 0 ? 0xe8c040 : 0xe0e0f0, 0.03);
  L.bigCrest = true;
  L.helm = team === 0 ? 1 : 2;
  L.helmCol = jit(rank >= 1 ? 0xd8b050 : 0xa8a8b0, 0.03);
  L.armor = jit(rank >= 1 ? 0xc8a048 : 0x9a9aa4, 0.03);
  return L;
}

export function horseLook(team, barding) {
  const coats = [0x6b3f22, 0x4a2a18, 0x2a2220, 0x8a5a30, 0xb8b0a0, 0x5a4a40];
  const coat = pick(coats);
  return {
    coat: jit(coat, 0.06), mane: jit(coat === 0xb8b0a0 ? 0x9a9088 : 0x1e1612),
    hoof: jit(0x2a2420), cloth: jit(team === 0 ? 0xa02a22 : 0x2a4a8a), trim: jit(team === 0 ? 0xd8b040 : 0xd0c090),
    barding: barding ? jit(team === 0 ? 0x8a8a92 : 0xb0985a, 0.05) : null,
  };
}
export function camelLook(team) {
  return { coat: jit(pick([0xc0a070, 0xa8885a, 0xd0b888]), 0.05), mane: jit(0x8a6a40), hoof: jit(0x4a3a2a), cloth: jit(team === 0 ? 0xa02a22 : 0x2a6a8a), trim: jit(0xe0c890), barding: null };
}
export function dogLook() {
  return { coat: jit(pick([0x3a2a20, 0x6a4a2a, 0x2a2a2a, 0x8a7a6a]), 0.08), mane: jit(0x2a2018), hoof: jit(0x1a1410), cloth: jit(0x8a2a1a), trim: jit(0xa0a0a0), barding: null };
}
export function eleLook(team) {
  return {
    skin: jit(0x7f7a76, 0.05), tusk: jit(0xe8e0c8), cloth: jit(team === 0 ? 0xa02a22 : 0x7a2a6a),
    trim: jit(0xd8b040), howdah: jit(0x7a5530), dark: jit(0x5a5652),
  };
}
export function chariotLook(team) {
  return { wood: jit(0x7a5530), trim: jit(team === 0 ? 0xb03028 : 0x3050a0), metal: jit(0xb09040), wheel: jit(0x4a3420) };
}
export function engineLook(team) {
  return { wood: jit(0x7a5a38), dark: jit(0x4a3622), metal: jit(0x7a7a80), hide: jit(0x8a6a4a), rope: jit(0xb09a70), trim: jit(team === 0 ? 0xa02a22 : 0x2a4a8a) };
}
export const TEAM_FLAG = [col(0xb02a20), col(0x2a50a8)];

export {
  W_SWORD, W_SPEAR, W_BOW, W_AXE, W_MACE, W_PIKE, W_JAV, W_SLING, W_XBOW, W_HAMMER, W_BANNER,
  SH_NONE, SH_ROUND, SH_RECT, SH_SMALL,
};
