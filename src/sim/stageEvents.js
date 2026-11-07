// Timed stage events: things that happen at a set battle time (a dam breaking,
// a rockfall, a warning horn). Scheduled in battle-elapsed seconds; each event
// fires once. Used by the dramatic stages in dynamics.js and by the fire system.
export class StageEvents {
  constructor(world) {
    this.w = world;
    this.list = []; // { t, id, fn, done }
  }
  // schedule fn(world) at battle-elapsed t seconds
  at(t, id, fn) { this.list.push({ t, id, fn, done: false }); return this; }
  after(dt, id, fn) { return this.at(this.w.elapsed() + dt, id, fn); }
  elapsed() { return this.w.time - (this.w.battleT0 || 0); }
  pending(id) { return this.list.some(e => !e.done && e.id === id); }
  update() {
    if (this.w.phase !== 'battle') return;
    const t = this.elapsed();
    for (const e of this.list) {
      if (!e.done && t >= e.t) { e.done = true; e.fn(this.w); }
    }
  }
}
