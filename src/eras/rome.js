// The default era pack: Rome vs the Eastern Kingdom — exactly the game as
// it shipped before era packs. Everything here is an identity mapping:
// no unit overlays, the standard scenario, no stage reskins, and the
// family BGM tracks. Keeping this pack a no-op is what guarantees the
// ancient snapshot (tools/baseline.json) never moves when packs change.
import { deployRome } from './deploy_rome.js';

export const rome = {
  id: 'rome',
  name: '古代ローマ',
  factions: [
    { name: '軍団', names: 'rome0' },
    { name: '東方王国', names: 'rome1' },
  ],
  types: {},        // overlays/additions onto defs.TYPES (none)
  weapons: {},      // overlays/additions onto defs.WEAPONS (none)
  scenario: deployRome,   // roster form of the standard field armies (dream matchups only)
  arch: 'rome', reskin: {},       // stageId -> reskin key for the stage renderer (none)
  track: null,      // null = per-family tracks (the original behaviour)
};
