// Deterministic snapshot test for the simulation.
//
// Fixed config: stage=field, size=S, seed=7, mode=annihilate. The harness
// follows tools/bench.mjs: 60 deploy steps (1 s) before start(), then exactly
// 90 simulated seconds at 1/60. It records:
//   counts()                 -> [c0, c1]  (World.counts(): per-team sum of
//                                          regiment alive, routed regiments
//                                          excluded, plus men still aboard)
//   per-team regiment alive  -> [r0, r1]  (plain sum of r.alive over regs)
// and compares counts() against tools/baseline.json within ±3 (counts() is
// built from regiment alive totals, so under a deterministic harness it is
// stable — dismounts add agents to world.agents, but they join the same
// regiment's alive total in the same way every run).
//
//   node tools/test.mjs            run and compare (exit 0 = pass, 1 = fail)
//   node tools/test.mjs --update   re-run and rewrite tools/baseline.json
//                                  from the current tree — use this only for
//                                  an intentional simulation change, and say
//                                  so in the commit message.
//
// DETERMINISM FINDING (2026-11-07, read before touching the tolerance):
// the raw simulation is NOT reproducible from its seed. Its own PRNG
// (src/util.js, setSeed/rand) is seeded, but two sim-path call sites use
// Math.random() instead:
//   - src/sim/ragdoll.js Ragdoll.kick(): per-joint velocity jitter on every
//     kill / knock-down / dismount. World.getUp() later places a revived
//     soldier at the ragdoll's pelvis position, so the jitter feeds back
//     into the battle.
//   - src/anim/quadruped.js QuadState: phase/t from Math.random(); the phase
//     drives poseQuad -> crew saddle position -> World.dismount() spawns the
//     fallen rider at that joint position.
// Melee at this scale is chaotic, so those centimetre differences amplify:
// six unpinned runs of this exact config gave counts() c0 in 110..163 and
// c1 in 120..197 (regs-alive spread ~60, agent total 814..818). No honest
// fixed tolerance covers that (it would need ±50+).
// This harness therefore pins Math.random() to a seeded mulberry32 (the same
// algorithm as src/util.js) before building the world, which makes the
// snapshot exactly reproducible at ±3. That is a harness measure, not a sim
// fix: the durable fix is to route the two call sites above through
// util.rand() (owned by the sim agents — tools/ cannot edit src/).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { World } from '../src/sim/world.js';
import { Projectiles } from '../src/sim/projectiles.js';
import { buildStage } from '../src/sim/stage.js';
import { Nav } from '../src/sim/nav.js';
import { Engineering } from '../src/sim/engineering.js';
import { Command } from '../src/sim/command.js';
import { Objective } from '../src/sim/objective.js';
import { setStage } from '../src/terrain.js';
import { buildScenario, SIZES } from '../src/scenario.js';

// Pin Math.random (see header). Must run before any Agent/Ragdoll exists;
// module top-level code in the sim imports constructs neither.
let mrState = 0x2545f491;
Math.random = () => {
  mrState = (mrState + 0x6d2b79f5) | 0;
  let t = mrState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const CONFIG = { stage: 'field', size: 'S', seed: 7, mode: 'annihilate', secs: 90 };
const TOLERANCE = 3;
const baselinePath = join(dirname(fileURLToPath(import.meta.url)), 'baseline.json');
const update = process.argv.includes('--update');

function runSnapshot() {
  const stage = buildStage(CONFIG.stage, SIZES[CONFIG.size]);
  setStage(stage);
  const nav = new Nav(stage);
  const w = new World(stage, nav);
  w.proj = new Projectiles();
  w.engineering = new Engineering(w);
  w.command = new Command(w);
  buildScenario(w, CONFIG.stage, CONFIG.size, CONFIG.seed);
  w.command.setup();
  w.objective = new Objective(w, CONFIG.mode, w.builder);
  for (let i = 0; i < 60; i++) w.update(1 / 60); // deploy warm-up, as in bench.mjs
  w.start();
  const steps = Math.round(CONFIG.secs * 60);
  for (let i = 0; i < steps; i++) w.update(1 / 60);
  const [c0, c1] = w.counts();
  const regsAlive = [0, 0];
  for (const r of w.regs) regsAlive[r.team] += r.alive;
  return { c0, c1, r0: regsAlive[0], r1: regsAlive[1], totalAgents: w.agents.length };
}

const got = runSnapshot();
console.log(`snapshot: stage=${CONFIG.stage} size=${CONFIG.size} seed=${CONFIG.seed} mode=${CONFIG.mode} secs=${CONFIG.secs}`);
console.log(`counts() = [${got.c0}, ${got.c1}]  regsAlive = [${got.r0}, ${got.r1}]  agents = ${got.totalAgents}`);

if (update) {
  const baseline = {
    c0: got.c0, c1: got.c1, r0: got.r0, r1: got.r1,
    tolerance: TOLERANCE,
    config: { ...CONFIG },
    note: 'Recorded with tools/test.mjs, which pins Math.random to a seeded PRNG (see the DETERMINISM FINDING in that file). The unpinned sim is not seed-reproducible.',
  };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`baseline updated: ${baselinePath} -> { c0: ${got.c0}, c1: ${got.c1} }`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(`FAIL: no baseline at ${baselinePath}. Create one with: node tools/test.mjs --update`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const tol = Number.isFinite(baseline.tolerance) ? baseline.tolerance : TOLERANCE;
const diffs = [];
for (const k of ['c0', 'c1']) {
  const d = Math.abs(got[k] - baseline[k]);
  if (d > tol) diffs.push(`${k}: got ${got[k]}, baseline ${baseline[k]} (diff ${d} > tolerance ±${tol})`);
}
// regiment-alive sums are checked too when the baseline carries them
for (const k of ['r0', 'r1']) {
  if (!Number.isFinite(baseline[k])) continue;
  const d = Math.abs(got[k] - baseline[k]);
  if (d > tol) diffs.push(`${k} (regs alive): got ${got[k]}, baseline ${baseline[k]} (diff ${d} > tolerance ±${tol})`);
}
if (diffs.length) {
  console.error('FAIL: snapshot drifted from baseline:');
  for (const d of diffs) console.error('  ' + d);
  console.error('If this change is intentional, regenerate with: node tools/test.mjs --update');
  process.exit(1);
}
console.log(`PASS: counts within ±${tol} of baseline { c0: ${baseline.c0}, c1: ${baseline.c1} }`);
