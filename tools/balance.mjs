// Balance measurement: run headless battles for many stages/seeds and report
// who wins, how long battles last and how many men survive.
//
// usage: node tools/balance.mjs [stages] [seeds] [size] [secs] [mode]
//   stages  comma list of stage ids, or 'all' (default: all 19 stages)
//   seeds   comma list of seeds           (default: 7)
//   size    S | M | L | XL | XXL          (default: S)
//   secs    max simulated seconds per run (default: 420)
//   mode    annihilate | capture | reinforce | escort
//           (default: annihilate; modes that are not valid for a stage fall
//           back to annihilate inside the Objective constructor)
//
// Example: node tools/balance.mjs field,river,harbor 1,7 S 180
//
// Each run reuses the tools/bench.mjs harness pattern (buildStage / setStage /
// Nav / World / Projectiles / Engineering / Command / buildScenario /
// Objective, 60 deploy steps, start(), then 1/60 steps until the objective
// decides or the time budget runs out). A stage that throws is reported as
// ERROR and the sweep continues with the next run.
//
// Reproducibility: the sim is seed-deterministic (all sim-path randomness
// uses the seeded PRNG in src/util.js and Agent.id is world-local — see
// tools/test.mjs), so each stage×seed run replays exactly, with no
// Math.random pin and regardless of sweep order.
import { World } from '../src/sim/world.js';
import { Projectiles } from '../src/sim/projectiles.js';
import { buildStage } from '../src/sim/stage.js';
import { Nav } from '../src/sim/nav.js';
import { Engineering } from '../src/sim/engineering.js';
import { Command } from '../src/sim/command.js';
import { Objective } from '../src/sim/objective.js';
import { setStage } from '../src/terrain.js';
import { buildScenario, SIZES } from '../src/scenario.js';

export const ALL_STAGES = [
  'field', 'hills', 'forest', 'canyon', 'river', 'ford', 'bridge', 'harbor',
  'siege', 'camp', 'marsh', 'village', 'ambush', 'frozen', 'flood',
  'firestorm', 'landslide', 'naval', 'burnforest',
];

const [stagesArg = 'all', seedsArg = '7', sizeKey = 'S', secsArg = '420', mode = 'annihilate'] = process.argv.slice(2);
const stageIds = stagesArg === 'all' ? ALL_STAGES : stagesArg.split(',').map(s => s.trim()).filter(Boolean);
const seeds = seedsArg.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
const secs = Number(secsArg);
if (!stageIds.length || !seeds.length || !SIZES[sizeKey] || !(secs > 0)) {
  console.error('usage: node tools/balance.mjs [stages|all] [seeds=1,7,42] [size=S] [secs=420] [mode=annihilate]');
  process.exit(2);
}

function runOne(stageKind, seed) {
  const scale = SIZES[sizeKey];
  const stage = buildStage(stageKind, scale);
  setStage(stage);
  const nav = new Nav(stage);
  const w = new World(stage, nav);
  w.proj = new Projectiles();
  w.engineering = new Engineering(w);
  w.command = new Command(w);
  buildScenario(w, stageKind, sizeKey, seed);
  w.command.setup();
  // Objective falls back to annihilate for modes not valid on this stage.
  w.objective = new Objective(w, mode, w.builder);
  const totalAgents = w.agents.length;
  for (let i = 0; i < 60; i++) w.update(1 / 60); // deploy warm-up, as in bench.mjs
  w.start();
  const t0 = performance.now();
  const maxSteps = Math.round(secs * 60);
  let steps = 0;
  let result = null;
  for (let i = 0; i < maxSteps; i++) {
    w.update(1 / 60);
    steps++;
    // counts()/check() every half second is plenty to catch the decision
    // and keeps the sweep fast; the final step is always checked.
    if (steps % 30 === 0 || steps === maxSteps) {
      result = w.objective.check(w.counts());
      if (result) break;
    }
  }
  const wallMs = performance.now() - t0;
  const survivors = w.counts();
  return {
    stage: stageKind, seed, ok: true,
    winner: result ? result.winner : null,
    resultText: result ? result.text : '',
    duration: steps / 60,
    survivors, totalAgents,
    msPerStep: wallMs / Math.max(1, steps),
  };
}

console.log(`balance: stages=${stageIds.join(',')} seeds=${seeds.join(',')} size=${sizeKey} secs=${secs} mode=${mode}`);
const results = [];
for (const stageId of stageIds) {
  for (const seed of seeds) {
    try {
      const r = runOne(stageId, seed);
      results.push(r);
      const who = r.winner === 0 ? 'Legion ' : r.winner === 1 ? 'Kingdom' : 'unfinished';
      console.log(`${stageId} seed=${seed}  ${who}  dur=${r.duration.toFixed(1)}s  survivors=[${r.survivors[0]}, ${r.survivors[1]}] total=${r.totalAgents}  ${r.msPerStep.toFixed(2)} ms/step${r.resultText ? '  ' + r.resultText : ''}`);
    } catch (e) {
      results.push({ stage: stageId, seed, ok: false, error: e && e.message ? e.message : String(e) });
      console.log(`${stageId} seed=${seed}  ERROR ${e && e.message ? e.message : e}`);
    }
  }
}

// ------------------------------------------------------------ summary table
console.log('');
console.log('Per-stage summary');
const head = ['stage', 'runs', 'Legion%', 'Kingdom%', 'unfin%', 'avgDur(s)', 'avgSurv L', 'avgSurv K', 'ms/step', 'errors'];
const widths = [12, 5, 8, 9, 7, 10, 10, 10, 8, 7];
const fmtRow = cells => cells.map((c, i) => String(c).padEnd(widths[i])).join(' ').trimEnd();
console.log(fmtRow(head));
console.log(widths.map(w => '-'.repeat(w)).join(' '));
let totalErrors = 0;
for (const stageId of stageIds) {
  const rs = results.filter(r => r.stage === stageId);
  const ok = rs.filter(r => r.ok);
  const errs = rs.length - ok.length;
  totalErrors += errs;
  if (!ok.length) {
    console.log(fmtRow([stageId, 0, '-', '-', '-', '-', '-', '-', '-', errs]));
    continue;
  }
  const n = ok.length;
  const leg = ok.filter(r => r.winner === 0).length;
  const king = ok.filter(r => r.winner === 1).length;
  const unfin = n - leg - king;
  const pct = v => ((v / n) * 100).toFixed(0) + '%';
  const avg = f => ok.reduce((s, r) => s + f(r), 0) / n;
  console.log(fmtRow([
    stageId, n, pct(leg), pct(king), pct(unfin),
    avg(r => r.duration).toFixed(1),
    avg(r => r.survivors[0]).toFixed(0),
    avg(r => r.survivors[1]).toFixed(0),
    avg(r => r.msPerStep).toFixed(2),
    errs,
  ]));
}
console.log(`\ntotal runs=${results.length} errors=${totalErrors}`);
