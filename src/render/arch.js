// Architecture styles per era (render only — footprints, heights and
// obstacles never change with the style; only colours, roof profiles,
// tower caps and keep shapes do). The stage's style is resolved in
// main.js: a reskin imposed by a pack scenario (a Japanese castle, a
// Constantinople siege, a lake city...) brings that battlefield's
// style; any other stage takes the active era selection (team 1's pack
// in a dream match). Rome is the original look, unchanged.
//
// roofKind: 'pyramid' (the original 4-sided cone) | 'gable' (prism) |
//           'hip' (wide pyramid over an eaves rim) | 'flat' (slab +
//           parapet) | 'dome' (half-sphere)
// towerCap: 'crenel' (original blocks) | 'flat' | 'cone' | 'dome' | 'hip'
// keep:     null | 'tenshu' | 'stone' | 'dome' | 'pyramid' — the shape
//           used for a render-only 'keep'/'tenshu' struct when the
//           era deployment placed one behind the walls
// band:     a coloured strip along the top of fort walls (tile bands,
//           dancheong paint, red tile), or null
export const ARCH = {
  rome: {
    wall: [0x9a8f7a, 0x958a74, 0xa39884], house: [0xc8b898, 0xb8a888, 0xd0c0a0],
    roof: 0xa0503a, roofKind: 'pyramid', roofH: 1, towerCap: 'crenel', tower: 0x8c8270, band: null,
    gateBody: null, gateDoor: 0x5a3a1e, tent: [0xd9cfae, 0xb8493a], tentKind: 'cone', keep: null,
  },
  japan: {
    wall: [0x7d7a72, 0x76736b, 0x86837a], house: [0xe9e3d3, 0xdfd7c2, 0xefe9da],
    roof: 0x2f333b, roofKind: 'hip', roofH: 1, towerCap: 'hip', tower: 0x6e6a62, band: 0x2f333b,
    gateBody: 0x7d7a72, gateDoor: 0x2e2018, tent: [0xd9cfae, 0x8a2a20], tentKind: 'cone', keep: 'tenshu',
  },
  china: {
    wall: [0x8f8d84, 0x8a877c, 0x99968c], house: [0xdccbaa, 0xd2bd96, 0xe4d2ae],
    roof: 0x68727a, roofKind: 'hip', roofH: 1, towerCap: 'hip', tower: 0x807e76, band: 0xa33327,
    gateBody: 0x8f8d84, gateDoor: 0x7a2020, tent: [0xd9cfae, 0x8a2a20], tentKind: 'cone', keep: null,
  },
  korea: {
    wall: [0x8d8a80, 0x86837a, 0x96928a], house: [0xece5d3, 0xe2dac4, 0xf0ead9],
    roof: 0x363c44, roofKind: 'hip', roofH: 1, towerCap: 'hip', tower: 0x7e7a70, band: 0x206a5e,
    gateBody: 0x8d8a80, gateDoor: 0x5a3424, tent: [0xd9cfae, 0x2a4a8a], tentKind: 'cone', keep: null,
  },
  eu1: {
    wall: [0x97866a, 0x8f8062, 0xa08c72], house: [0xa08055, 0x957950, 0xab8a5e],
    roof: 0x77603a, roofKind: 'gable', roofH: 1.25, towerCap: 'flat', tower: 0x8f8062, band: null,
    gateBody: null, gateDoor: 0x4a3420, tent: [0xcabf9e, 0x9a4a34], tentKind: 'cone', keep: null,
  },
  eu2: {
    wall: [0xa49a86, 0x9d937f, 0xaca38f], house: [0xd3c6a6, 0xc9bb9c, 0xdbcdaf],
    roof: 0x8a4a34, roofKind: 'gable', roofH: 1.1, towerCap: 'cone', tower: 0x9d937f, band: null,
    gateBody: 0xa49a86, gateDoor: 0x4a3420, tent: [0xd9cfae, 0x3a5ac8], tentKind: 'cone', keep: 'stone',
  },
  eu3: {
    wall: [0x99917e, 0x918972, 0xa1988a], house: [0xe2d8c0, 0xdccfb2, 0xe8ddc6],
    roof: 0x474c56, roofKind: 'gable', roofH: 1.35, towerCap: 'cone', tower: 0x918972, band: null,
    gateBody: 0x99917e, gateDoor: 0x3a2e20, tent: [0xd9cfae, 0x6a2a2a], tentKind: 'cone', keep: null,
  },
  mongol: {
    wall: [0x9a8f7a, 0x958a74, 0xa39884], house: [0xb99a6c, 0xac8f60, 0xc4a476],
    roof: 0x6e4e2e, roofKind: 'gable', roofH: 1, towerCap: 'flat', tower: 0x8c8270, band: null,
    gateBody: null, gateDoor: 0x5a3a1e, tent: [0xe9e3d2, 0xdcd2ba], tentKind: 'ger', tentRoof: 0xc8b990, keep: null,
  },
  carthage: {
    wall: [0xc9ae82, 0xc2a67a, 0xd0b68a], house: [0xdec096, 0xd4b78a, 0xe6ca9e],
    roof: 0xcbb28a, roofKind: 'flat', roofH: 1, towerCap: 'crenel', tower: 0xc2a67a, band: null,
    gateBody: 0xc9ae82, gateDoor: 0x5a4028, tent: [0xe0cda0, 0xb8493a], tentKind: 'cone', keep: null,
  },
  greece: {
    wall: [0xe0dac9, 0xd9d2bd, 0xe6e0cf], house: [0xefeade, 0xe7e1cf, 0xf4efe2],
    roof: 0xa85438, roofKind: 'gable', roofH: 0.8, towerCap: 'flat', tower: 0xd9d2bd, band: 0xa85438,
    gateBody: 0xe0dac9, gateDoor: 0x6a4a2c, tent: [0xe8e2d0, 0xa03a30], tentKind: 'cone', keep: null,
  },
  ottoman: {
    wall: [0xb3a58c, 0xab9e83, 0xbbae96], house: [0xdccaa6, 0xd2bf98, 0xe4d2b0],
    roof: 0x6f777f, roofKind: 'dome', roofH: 1, towerCap: 'dome', tower: 0xab9e83, band: 0x6f777f,
    gateBody: 0xb3a58c, gateDoor: 0x4a3826, tent: [0xd9cfae, 0x2a6a5a], tentKind: 'cone', keep: 'dome',
  },
  india: {
    wall: [0xbb8060, 0xb2765a, 0xc48a66], house: [0xcf9a6e, 0xc68f63, 0xd8a878],
    roof: 0x9a5a3c, roofKind: 'pyramid', roofH: 1, towerCap: 'dome', tower: 0xb2765a, band: 0x8a4a30,
    gateBody: 0xbb8060, gateDoor: 0x54331e, tent: [0xe0c090, 0xa03a50], tentKind: 'cone', keep: null,
  },
  aztec: {
    wall: [0xa99a80, 0xa19179, 0xb2a48b], house: [0xbfb094, 0xb3a487, 0xcabda2],
    roof: 0xa89878, roofKind: 'flat', roofH: 1, towerCap: 'flat', tower: 0xa19179, band: null,
    gateBody: 0xa99a80, gateDoor: 0x4e3a24, tent: [0xd8c8a0, 0x8a6a30], tentKind: 'cone', keep: 'pyramid',
  },
};
// reskin keys set by era deployments -> the architecture they imply
export const RESKIN_ARCH = {
  castle: 'japan', 'castle-eu': 'eu2', constantinople: 'ottoman',
  desert: 'carthage', lakecity: 'aztec', longship: 'eu1',
};
