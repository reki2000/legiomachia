// Rome's roster deployment for dream matchups: the same armies field()
// builds, expressed as per-team rosters so another pack can face them.
// The default battle (no era selection) does NOT use this — it keeps
// the original deployment code path and its snapshot.
import { fieldArmy } from './deploy.js';

const ROSTER0 = [
  ['jav', 14, 3, -40, -38, '軽装投槍兵 I', { wing: '中央', q: 0.4 }],
  ['jav', 14, 3, 40, -38, '軽装投槍兵 II', { wing: '中央', q: 0.4 }],
  ['sword', 16, 7, -54, -55, '第1大隊', { wing: '右翼', q: 0.6 }],
  ['sword', 16, 7, -18, -55, '第2大隊', { wing: '中央', q: 0.65 }],
  ['sword', 16, 7, 18, -55, '第3大隊', { wing: '中央', q: 0.65 }],
  ['sword', 16, 7, 54, -55, '第4大隊', { wing: '左翼', q: 0.6 }],
  ['spear', 16, 5, -36, -78, '古参兵 右', { wing: '予備', role: 'reserve', q: 0.9 }],
  ['spear', 16, 5, 36, -78, '古参兵 左', { wing: '予備', role: 'reserve', q: 0.9 }],
  ['archer', 20, 4, -34, -95, 'クレタ弓兵', { wing: '中央', q: 0.6 }],
  ['sling', 16, 3, 0, -92, 'バレアレス投石兵', { wing: '中央', q: 0.6 }],
  ['archer', 20, 4, 34, -95, '弓兵隊', { wing: '中央', q: 0.5 }],
  ['cav', 8, 3, -104, -62, '騎兵 右翼', { wing: '右翼', q: 0.6 }],
  ['dog', 10, 2, -84, -70, 'モロシアン犬', { wing: '右翼', q: 0.6 }],
  ['cav', 8, 3, 104, -62, '騎兵 左翼', { wing: '左翼', q: 0.6 }],
  ['engineer', 8, 2, 0, -104, '工兵隊', { wing: '予備', role: 'reserve', q: 0.5 }],
  ['onager', 2, 1, 0, -112, '投石機', { wing: '予備', role: 'reserve', fixed: true }],
];
const ROSTER1 = [
  ['pike', 18, 8, -24, -58, 'ファランクス I', { wing: '中央', q: 0.6 }],
  ['pike', 18, 8, 24, -58, 'ファランクス II', { wing: '中央', q: 0.6 }],
  ['spear', 16, 7, -76, -60, '重装槍兵', { wing: '左翼', q: 0.55 }],
  ['axe', 14, 7, 76, -60, '蛮族斧兵', { wing: '右翼', q: 0.45 }],
  ['archer', 20, 4, -30, -80, '弓兵隊', { wing: '中央', q: 0.5 }],
  ['xbow', 20, 3, 30, -80, '弩兵隊', { wing: '中央', q: 0.55 }],
  ['hcav', 8, 3, -146, -82, '弓騎兵', { wing: '左翼', q: 0.6 }],
  ['camel', 8, 3, 124, -62, '駱駝騎兵', { wing: '右翼', q: 0.5 }],
  ['cata', 8, 3, 108, -80, '重装騎兵', { wing: '右翼', q: 0.8 }],
  ['mace', 14, 6, 0, -94, '徴募兵', { wing: '予備', role: 'reserve', q: 0.25 }],
  ['engineer', 8, 2, 0, -104, '工兵隊', { wing: '予備', role: 'reserve' }],
  ['ele', 6, 1, 0, -40, '戦象隊', { wing: '中央', fixed: true }],
  ['chr', 5, 2, -126, -62, '鎌戦車隊', { wing: '左翼', fixed: true }],
];
export function deployRome(b, st, team) {
  if (st.kind !== 'field') return false;
  fieldArmy(b, team, team === 0 ? ROSTER0 : ROSTER1);
  return true;
}
deployRome.handles = st => st.kind === 'field';
