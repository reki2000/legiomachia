// Crowding metric: nearest-neighbour distance and neighbours within 1 m, for infantry and horses.
import { World } from '../src/sim/world.js';
import { Projectiles } from '../src/sim/projectiles.js';
import { buildStage } from '../src/sim/stage.js';
import { Nav } from '../src/sim/nav.js';
import { Engineering } from '../src/sim/engineering.js';
import { Command } from '../src/sim/command.js';
import { setStage } from '../src/terrain.js';
import { buildScenario } from '../src/scenario.js';
const stageKind = process.argv[2] || 'field';
const stage = buildStage(stageKind, 1); setStage(stage);
const w = new World(stage, new Nav(stage)); w.proj = new Projectiles(); w.engineering = new Engineering(w); w.command = new Command(w);
buildScenario(w, stageKind, 'M', Number(process.env.SEED || 7)); w.command.setup(); w.start();
function metric(kind) {
  const A = w.agents.filter(a => a.state === 0 && (kind === 0 ? a.kind === 0 : a.kind === 1));
  let nn = [], close = 0, fight = 0;
  for (const a of A) {
    let best = 1e9, c = 0;
    const n = w.query(a.x, a.z, 3);
    for (let k = 0; k < n; k++) {
      const b = w.agents[w.qbuf[k]];
      if (b === a || b.state !== 0) continue;
      if (kind === 1 && (b.kind !== 1 || b.team !== a.team)) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z) - (kind === 1 && b.kind === 1 ? 0 : 0);
      if (d < best) best = d;
      if (d < (kind === 0 ? 1.0 : 2.0)) c++;
    }
    nn.push(best); close += c; if (a.target && a.tdist < 4) fight++;
  }
  nn.sort((x, y) => x - y);
  const q = p => (nn[Math.floor(nn.length * p)] || 0).toFixed(2);
  return `n=${A.length} nnDist p10=${q(0.1)} p50=${q(0.5)} | avg close=${(close / A.length).toFixed(2)} fighting=${fight}`;
}
for (let i = 1; i <= 60 * 60; i++) {
  w.update(1 / 60);
  if (i % (60 * 10) === 0) console.log(`t=${i / 60}s INF ${metric(0)}  || CAV ${metric(1)}`);
}
