// Shared deployment helpers for era packs. Rosters are written in
// team-0 coordinates (the south/attacker side, z < 0 on the field);
// team 1 is mirrored. Officers and the general use the base types and
// the pack's look function, like the standard armies.
export function fieldArmy(b, team, roster) {
  const X = v => v * Math.max(1, b.sq * 0.8);
  const Z = v => v * Math.max(1, b.sq * 0.35);
  const mz = team === 0 ? 1 : -1;
  for (const [type, cols, rows, x, z, name, o] of roster) {
    b.reg(team, type, cols, rows, X(x), Z(z) * mz, name, o || {});
  }
  b.officer(team, '右翼', X(-70), Z(-85) * mz, '右翼将');
  b.officer(team, '中央', X(0), Z(-80) * mz, '中央将');
  b.officer(team, '左翼', X(70), Z(-85) * mz, '左翼将');
  b.officer(team, '予備', X(0), Z(-120) * mz, '予備将');
  b.general(team, X(0), Z(-130) * mz, 6);
}

// Siege helpers: the defender mans the south wall (wz) and keeps
// reserves inside; the attacker deploys in front of the wall.
export function siegeDefence(b, team, C, wall, inside) {
  const wz = C.z0 + 1.2;
  for (const [type, cols, x, name, o] of wall) b.reg(team, type, cols, 2, x, wz, name, { wing: '城壁', ...(o || {}) });
  for (const [type, cols, rows, x, dz, name, o] of inside) b.reg(team, type, cols, rows, x, C.z1 + dz, name, { wing: '城内', role: 'reserve', ...(o || {}) });
  b.officer(team, '城壁', 20, C.z1 + 8, '城壁将');
  b.officer(team, '城内', -20, C.z1 + 20, '城内将');
  b.general(team, 0, C.z1 + 36, 4);
}
export function siegeAttack(b, team, roster) {
  for (const [type, cols, rows, x, z, name, o] of roster) b.reg(team, type, cols, rows, x, z, name, o || {});
  b.officer(team, '右翼', -60, -40, '右翼将');
  b.officer(team, '中央', 0, -36, '中央将');
  b.officer(team, '左翼', 60, -40, '左翼将');
  b.general(team, 0, -70, 6);
}
