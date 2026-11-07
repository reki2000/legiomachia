// Era packs (phase 2). A pack describes one side's world: two factions
// (display name + soldier name-pool key), unit/weapon additions overlaid
// onto defs at startup, an optional scenario override, stage reskin keys
// and a BGM track id. Battles pick one pack per team (?era= for both, or
// the dream-matchup ?era0=/?era1= in the details fold), so any two packs
// can fight. The default is 'rome', which is a pure identity pack.
import { rome } from './rome.js';

export const ERAS = { rome };
export const ERA_LIST = [rome];

export function eraById(id) { return ERAS[id] || rome; }

// Called once at startup (main.js) before any battle is built: merges
// every pack's unit/weapon additions into the shared tables. Additions
// use pack-prefixed type ids, so packs never collide with each other or
// with the base game.
import { TYPES, WEAPONS } from '../sim/defs.js';
let applied = false;
export function applyEraTables() {
  if (applied) return;
  applied = true;
  for (const pack of ERA_LIST) {
    for (const [id, t] of Object.entries(pack.types || {})) if (!TYPES[id]) TYPES[id] = t;
    for (const [id, w] of Object.entries(pack.weapons || {})) if (!WEAPONS[id]) WEAPONS[id] = w;
  }
}
