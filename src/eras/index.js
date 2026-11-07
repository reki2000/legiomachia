// Era packs (phase 2). A pack describes one side's world: two factions
// (display name + soldier name-pool key), unit/weapon additions overlaid
// onto defs at startup, an optional scenario override, stage reskin keys
// and a BGM track id. Battles pick one pack per team (?era= for both, or
// the dream-matchup ?era0=/?era1= in the details fold), so any two packs
// can fight. The default is 'rome', which is a pure identity pack.
import { rome } from './rome.js';
import { japan } from './japan.js';
import { chinaEarly, chinaMid, chinaLate } from './china.js';
import { europeEarly, europeMid, europeLate } from './europe.js';
import { mongol } from './mongol.js';
import { carthage } from './carthage.js';

export const ERAS = { rome, japan, 'china-early': chinaEarly, 'china-mid': chinaMid, 'china-late': chinaLate, 'europe-early': europeEarly, 'europe-mid': europeMid, 'europe-late': europeLate, mongol, carthage };
export const ERA_LIST = [rome, japan, chinaEarly, chinaMid, chinaLate, europeEarly, europeMid, europeLate, mongol, carthage];

// Compose the two teams' packs into the world hooks buildScenario and
// the Agent constructor read. Returns false (and clears the hooks) when
// both packs are the default Rome pack, so the untouched game keeps its
// original code path — and its snapshot.
import { setActiveNames, setActiveShields, setActiveLooks } from '../sim/defs.js';
export function composeEra(world, packA, packB) {
  if (packA.id === 'rome' && packB.id === 'rome') {
    world.factionNames = null; world.eraDeploy = null; world.eraPacks = null; world.eraStageHooks = null;
    setActiveNames('rome0', 'rome1'); setActiveShields(null, null); setActiveLooks(null, null);
    return false;
  }
  world.factionNames = [packA.factions[0].name, packB.factions[1].name];
  world.eraPacks = [packA, packB];
  setActiveNames(packA.factions[0].names, packB.factions[1].names);
  setActiveShields(packA.shields || null, packB.shields || null);
  setActiveLooks(packA.look || null, packB.look || null);
  const hooks = [packA.stageHook, packB.stageHook].filter(Boolean);
  world.eraStageHooks = hooks.length ? hooks : null;
  world.eraDeploy = (b, st) => {
    if (!packA.scenario || !packB.scenario) return false;
    // both packs must handle the stage kind, else the standard armies do
    const probe = packA.scenario.handles ? packA.scenario.handles(st) : true;
    const probeB = packB.scenario.handles ? packB.scenario.handles(st) : true;
    if (!probe || !probeB) return false;
    const okA = packA.scenario(b, st, 0);
    const okB = packB.scenario(b, st, 1);
    return okA && okB;
  };
  return true;
}

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
