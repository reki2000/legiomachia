// Node benchmark / smoke test of the simulation alone (no rendering).
import { World } from '../src/sim/world.js';
import { Projectiles } from '../src/sim/projectiles.js';
import { buildStage } from '../src/sim/stage.js';
import { Nav } from '../src/sim/nav.js';
import { Engineering } from '../src/sim/engineering.js';
import { Command } from '../src/sim/command.js';
import { setStage } from '../src/terrain.js';
import { buildScenario } from '../src/scenario.js';
const stageKind = process.argv[2] || 'field', size = process.argv[3] || 'M', secs = Number(process.argv[4] || 60);
let t = performance.now();
const stage = buildStage(stageKind, { S: 0.4, M: 1, L: 2.2, XL: 5, XXL: 10 }[size]);
setStage(stage);
const nav = new Nav(stage);
console.log('stage+nav', (performance.now() - t).toFixed(0), 'ms');
const w = new World(stage, nav); w.proj = new Projectiles();
w.engineering = new Engineering(w); w.command = new Command(w);
buildScenario(w, stageKind, size, Number(process.env.SEED || 7));
w.command.setup();
const ev = {};
w.on((type) => { ev[type] = (ev[type] || 0) + 1; });
for (let i = 0; i < 60; i++) w.update(1 / 60);
w.start();
let t0 = performance.now(), last = t0;
for (let i = 0; i < secs * 60; i++) {
  w.update(1 / 60);
  if (i % 600 === 599) {
    const now = performance.now();
    const st = {}; for (const a of w.agents) st[a.state] = (st[a.state] || 0) + 1;
    console.log(`t=${((i + 1) / 60).toFixed(0)}s ${((now - last) / 600).toFixed(2)}ms/step alive ${w.counts()} states ${JSON.stringify(st)} proj ${w.proj.flying}`);
    last = now;
  }
}
console.log('total', ((performance.now() - t0) / (secs * 60)).toFixed(2), 'ms/step  agents', w.agents.length);
console.log('events', JSON.stringify(ev));
console.log(w.regs.map(r => `${r.team}:${r.name}:${r.order[0]}${r.alive}${r.charging ? '!' : ''}${r.noPath ? '?' : ''}`).join(' | '));
if (stage.gates.length) console.log('gate', stage.gates.map(g => g.hp.toFixed(0) + (g.alive ? '' : ' BROKEN')).join(','), 'ladders', stage.ladders.map(l => l.state).join(','));
if (stage.bridges.length) console.log('bridges', stage.bridges.map(b => b.name + (b.alive ? '' : ' destroyed')).join(','), 'pontoons', stage.pontoons.map(p => p.len.toFixed(0) + '/' + p.total.toFixed(0)).join(','));
console.log('stakes', stage.stakes.length);
