// Deterministic snapshot test for the simulation.
//
// Fixed config: stage=field, size=S, seed=7, mode=annihilate. The harness
// follows tools/bench.mjs: 60 deploy steps (1 s) before start(), then exactly
// 90 simulated seconds at 1/60. It records:
//   counts()                 -> [c0, c1]  (World.counts(): per-team sum of
//                                          regiment alive, routed regiments
//                                          excluded, plus men still aboard)
//   per-team regiment alive  -> [r0, r1]  (plain sum of r.alive over regs)
// and compares counts() against tools/baseline.json within ±3.
//
//   node tools/test.mjs            run and compare (exit 0 = pass, 1 = fail)
//   node tools/test.mjs --update   re-run and rewrite tools/baseline.json
//                                  from the current tree — use this only for
//                                  an intentional simulation change, and say
//                                  so in the commit message.
//
// DETERMINISM (fixed 2026-11-07): the simulation is reproducible from its
// seed. Every randomness source that can feed back into simulation state
// goes through the seeded PRNG in src/util.js (rand). The two former
// exceptions — Ragdoll.kick() velocity jitter and the QuadState gait phase
// (a dismounted rider spawns at the saddle joint) — now use rand() too.
// Remaining Math.random uses are cosmeticRand (util.js) or plainly
// render/audio-only (particle/colour jitter, camera shake) and cannot move
// a body or gate an event, so this harness needs NO Math.random pin:
// three consecutive unpinned runs of this config give identical counts.
// Agent.id is world-local for the same reason (ai.js staggers thinking
// on a.id): a process-global id counter made the second battle in one
// process diverge; with world-local ids even in-process repeats match.
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
    note: 'Recorded with tools/test.mjs. The sim is seed-deterministic (all sim-path randomness uses the seeded PRNG in src/util.js); no Math.random pin is used or needed.',
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
