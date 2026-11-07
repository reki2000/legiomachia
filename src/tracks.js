// Composition data for the procedural background music, per stage family.
// Everything is in D phrygian dominant (D Eb F# G A Bb C) unless a section's key
// moves it. A track is a list of sections; each section picks a key, a bass line,
// a drum feel and which phrases the lead plays. music.js flattens sections into
// one entry per bar and schedules them.
//
// The FIELD track is the original song, note-for-note: same bass patterns,
// phrases, drum feels, sections and 92 BPM as the piece always had.

// ---------------------------------------------------------------- patterns
// bass: 16th-step -> interval above the bar's root (semitones)
export const BASS = {
  A: { 0: 0, 3: 0, 6: 12, 8: 0, 10: 7, 11: 0, 14: 12 },
  B: { 0: 0, 2: 0, 4: 12, 6: 0, 8: 0, 11: 7, 12: 0, 14: -2 },
  drive: { 0: 0, 2: 0, 4: 12, 6: 0, 8: 7, 10: 0, 12: 12, 14: 10 },
  long: { 0: 0 },
  sparse: { 0: 0, 8: 0 },
};
export const BASS_LEN = { long: 14 };

// melody phrases: four bars each, [step, semitones above D4, length in steps].
// Fragment phrases (mF*) are only two bars long: when one is picked for a
// four-bar slot it sounds for its two bars and leaves the rest silent.
export const PHRASE = {
  m1: [
    [[0, 7, 3], [3, 8, 1], [4, 7, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 1, 2]],
    [[0, 0, 6], [8, 4, 2], [10, 5, 2], [12, 7, 4]],
    [[0, 12, 3], [3, 11, 1], [4, 8, 2], [6, 7, 2], [8, 5, 3], [11, 4, 1], [12, 5, 2], [14, 7, 2]],
    [[0, 4, 4], [4, 1, 2], [6, 0, 10]],
  ],
  m1b: [
    [[0, 7, 3], [3, 8, 1], [4, 7, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 1, 2]],
    [[0, 0, 6], [8, 4, 2], [10, 5, 2], [12, 8, 4]],
    [[0, 12, 3], [3, 11, 1], [4, 8, 2], [6, 7, 2], [8, 5, 3], [11, 4, 1], [12, 5, 2], [14, 7, 2]],
    [[0, 5, 4], [4, 4, 2], [6, 1, 2], [8, 0, 8]],
  ],
  // higher and more rhythmic: used when the song lifts
  m2: [
    [[0, 12, 2], [2, 12, 2], [4, 13, 2], [6, 12, 2], [8, 8, 4], [12, 7, 4]],
    [[0, 8, 2], [2, 7, 2], [4, 5, 4], [8, 4, 2], [10, 5, 2], [12, 7, 4]],
    [[0, 12, 2], [2, 12, 2], [4, 13, 2], [6, 12, 2], [8, 16, 4], [12, 13, 2], [14, 12, 2]],
    [[0, 12, 6], [8, 8, 2], [10, 7, 2], [12, 4, 4]],
  ],
  // slow and lyrical, over the half-time bridge
  m3: [
    [[0, 7, 8], [8, 8, 4], [12, 7, 4]],
    [[0, 4, 8], [8, 5, 8]],
    [[0, 7, 6], [6, 8, 2], [8, 12, 8]],
    [[0, 11, 8], [8, 7, 8]],
  ],
};

// extra phrases for the other tracks (the field track uses only the ones above)

// slow chant line for the siege climax: long held notes, few of them
const PHRASE_CHANT = {
  c1: [
    [[0, 0, 12], [12, 1, 4]],
    [[0, 4, 16]],
    [[0, 5, 8], [8, 4, 8]],
    [[0, 7, 12], [12, 5, 4]],
  ],
  // drifting plucked line for rivers and harbours
  r1: [
    [[0, 12, 3], [4, 7, 3], [8, 5, 4]],
    [[0, 4, 4], [6, 5, 2], [10, 7, 4]],
    [[0, 8, 3], [4, 7, 3], [8, 4, 4]],
    [[0, 5, 6], [8, 4, 6]],
  ],
};

// forest fragments: two bars each, the rest of the slot is leaves and silence
const PHRASE_FRAG = {
  mF1: [
    [[0, 7, 3], [4, 5, 2], [8, 4, 4]],
    [[0, 0, 6], [10, 4, 2]],
  ],
  mF2: [
    [[0, 12, 2], [4, 8, 3], [10, 7, 3]],
    [[0, 5, 4], [8, 1, 4]],
  ],
  mF3: [
    [[0, 4, 6]],
    [[2, 7, 3], [8, 5, 5]],
  ],
};

// drum feels: which sixteenths carry what
export const KICK = {
  groove: [0, 3, 8, 11], dbl: [0, 3, 6, 8, 11, 14], half: [0], sparse: [0],
};
export const CLAP = { groove: [4, 12], dbl: [4, 12], half: [8], sparse: [] };
export const TOM = {
  groove: { 6: 1.0, 10: 0.8, 14: 1.2 },
  dbl: { 2: 0.7, 10: 0.8, 15: 1.1 },
  half: { 12: 1.0, 14: 1.2 },
  sparse: { 8: 0.8 },
};

const SHARED = {
  root: 73.416,          // D2, Hz
  leadRoot: 293.66,      // D4, Hz (the lead's home pitch, as in the original)
  bass: BASS, bassLen: BASS_LEN, kick: KICK, clap: CLAP, tom: TOM,
};

// [bars, key (semitones above D), bass, drums, roots per bar (semitones above
// the key), lead phrase(s), options] — as objects with a name so sections can
// be queued by name ('intro', 'bridge', 'climax', ...).
export const TRACKS = {
  // ------------------------------------------------------------ field (original)
  field: {
    ...SHARED,
    bpm: 92,
    leadInstrument: 'saw',
    drumScale: 1,
    echoWet: 0.5,
    frameDrum: false,
    phrases: { ...PHRASE },
    sections: [
      // intro: a pulse and a drone
      { name: 'intro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 0, 0, 0, 0, 1, 0], pad: true },
      // the march gets going
      { name: 'march', bars: 8, key: 0, bass: 'A', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0] },
      // first melody
      { name: 'melody', bars: 8, key: 0, bass: 'A', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m1', 'm1b'], pad: true },
      // break: drums drop out, tom roll into the lift
      { name: 'break', bars: 4, key: 0, bass: 'long', drums: 'roll', roots: [0, 1, 0, -2], pad: true },
      // lifted section a fourth higher, busier drums, higher melody
      { name: 'lift', bars: 16, key: 5, bass: 'drive', drums: 'dbl', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m2', 'm2', 'm1', 'm2'], pad: true },
      // bridge: half time, long bass notes, slow melody
      { name: 'bridge', bars: 8, key: 0, bass: 'long', drums: 'half', roots: [0, 1, 0, -2, 0, 1, 0, 0], lead: ['m3', 'm3'], pad: true },
      // climax: back home, busiest, lead doubled
      { name: 'climax', bars: 16, key: 0, bass: 'B', drums: 'dbl', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m2', 'm1b', 'm2', 'm1'], pad: true, harm: true },
      // outro: thin out and fall back into the loop
      { name: 'outro', bars: 8, key: 0, bass: 'sparse', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, 0, 0], pad: true },
    ],
  },

  // ------------------------------------------------------------ siege
  // Slower and tom-led: half-time / sparse drums and long bass almost
  // everywhere, no lead at all until the chant enters in the late climax.
  siege: {
    ...SHARED,
    bpm: 76,
    leadInstrument: 'chant',
    drumScale: 1,
    echoWet: 0.55,
    frameDrum: false,
    phrases: { ...PHRASE, ...PHRASE_CHANT },
    sections: [
      { name: 'intro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 0, 0, 0, 0, 1, 0], pad: true },
      { name: 'march', bars: 8, key: 0, bass: 'long', drums: 'half', roots: [0, 0, 1, 0, 0, 0, -2, 0], pad: true },
      { name: 'pressure', bars: 8, key: 0, bass: 'long', drums: 'half', roots: [0, 1, 0, -2, 0, 0, 1, 0], pad: true },
      { name: 'bridge', bars: 8, key: 0, bass: 'long', drums: 'sparse', roots: [0, 1, 0, -2, 0, 1, 0, 0], pad: true },
      // the assault: the chant lead finally enters, drums step up once
      { name: 'climax', bars: 12, key: 0, bass: 'long', drums: 'dbl', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['c1', 'm3', 'c1'], pad: true, harm: true },
      { name: 'outro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, 0, 0], pad: true },
    ],
  },

  // ------------------------------------------------------------ river
  // Longer bass notes, softer frame drums, a plucked lead and more echo.
  river: {
    ...SHARED,
    bpm: 84,
    leadInstrument: 'pluck',
    drumScale: 0.7,
    echoWet: 0.75,
    frameDrum: true,
    phrases: { ...PHRASE, ...PHRASE_CHANT },
    sections: [
      { name: 'intro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 0, 0, 0, 0, 1, 0], pad: true },
      { name: 'march', bars: 8, key: 0, bass: 'long', drums: 'half', roots: [0, 0, 1, 0, 0, 0, -2, 0], pad: true },
      { name: 'melody', bars: 8, key: 0, bass: 'sparse', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['r1', 'm1'], pad: true },
      { name: 'bridge', bars: 8, key: 0, bass: 'long', drums: 'sparse', roots: [0, 1, 0, -2, 0, 1, 0, 0], lead: ['m3', 'm3'], pad: true },
      { name: 'climax', bars: 12, key: 5, bass: 'long', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['r1', 'm2', 'm1'], pad: true, harm: true },
      { name: 'outro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, 0, 0], pad: true },
    ],
  },

  // ------------------------------------------------------------ harbour
  // Same family feel as the river (it is the same water), a touch more drive
  // in the climax for the landing.
  harbor: {
    ...SHARED,
    bpm: 84,
    leadInstrument: 'pluck',
    drumScale: 0.7,
    echoWet: 0.8,
    frameDrum: true,
    phrases: { ...PHRASE, ...PHRASE_CHANT },
    sections: [
      { name: 'intro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 0, 0, 0, 0, 1, 0], pad: true },
      { name: 'march', bars: 8, key: 0, bass: 'long', drums: 'half', roots: [0, 0, 1, 0, -2, 0, 0, 0], pad: true },
      { name: 'melody', bars: 8, key: 0, bass: 'long', drums: 'groove', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m1', 'r1'], pad: true },
      { name: 'bridge', bars: 8, key: 5, bass: 'sparse', drums: 'sparse', roots: [0, 1, 0, -2, 0, 1, 0, 0], lead: ['m3', 'r1'], pad: true },
      { name: 'climax', bars: 12, key: 0, bass: 'A', drums: 'dbl', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['m2', 'r1', 'm1'], pad: true, harm: true },
      { name: 'outro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, 0, 0], pad: true },
    ],
  },

  // ------------------------------------------------------------ forest
  // Sparse drums everywhere and a lead that only ever sounds in two-bar
  // fragments (mF1..mF3), with plenty of echo in the gaps.
  forest: {
    ...SHARED,
    bpm: 80,
    leadInstrument: 'pluck',
    drumScale: 0.6,
    echoWet: 0.85,
    frameDrum: true,
    phrases: { ...PHRASE, ...PHRASE_FRAG },
    sections: [
      { name: 'intro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 0, 0, 0, 0, 1, 0], pad: true },
      { name: 'march', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['mF1', 'mF2'], pad: true },
      { name: 'melody', bars: 8, key: 0, bass: 'long', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['mF2', 'mF3'], pad: true },
      { name: 'bridge', bars: 8, key: 0, bass: 'long', drums: 'sparse', roots: [0, 1, 0, -2, 0, 1, 0, 0], lead: ['mF3', 'mF1'], pad: true },
      { name: 'climax', bars: 12, key: 5, bass: 'sparse', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, -2, 0], lead: ['mF1', 'mF2', 'mF3'], pad: true, harm: true },
      { name: 'outro', bars: 8, key: 0, bass: 'sparse', drums: 'sparse', roots: [0, 0, 1, 0, 0, 0, 0, 0], pad: true },
    ],
  },
};

// End-of-battle jingles: eight bars each, played once by Music.playJingle().
// Win lifts a major fourth at bar 5 with rising roots; lose sinks through a
// key drop under the slow m3 phrase.
export const JINGLES = {
  win: [
    { name: 'jingle', bars: 4, key: 0, bass: 'A', drums: 'groove', roots: [0, 2, 4, 7], lead: ['m2'], pad: true },
    { name: 'jingle-lift', bars: 4, key: 4, bass: 'drive', drums: 'dbl', roots: [0, 4, 7, 12], lead: ['m2'], pad: true, harm: true },
  ],
  lose: [
    { name: 'jingle', bars: 4, key: 0, bass: 'long', drums: 'sparse', roots: [0, -2, -4, -7], lead: ['m3'], pad: true },
    { name: 'jingle-fall', bars: 4, key: -3, bass: 'long', drums: 'sparse', roots: [0, -2, -5, -7], lead: ['m3'], pad: true },
  ],
};

// Which track a stage gets: wooded / broken-ground stage ids first, then the
// stage family, then the open-field default.
const FOREST_STAGES = new Set(['forest', 'burnforest', 'canyon', 'ambush', 'landslide']);
export function trackFor(family, stageId) {
  if (stageId && FOREST_STAGES.has(stageId)) return TRACKS.forest;
  if (family === 'siege') return TRACKS.siege;
  if (family === 'river') return TRACKS.river;
  if (family === 'harbor') return TRACKS.harbor;
  if (family === 'forest') return TRACKS.forest;
  return TRACKS.field;
}
