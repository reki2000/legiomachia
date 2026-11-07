// Minimap: regiments as team-coloured dots over a dark field, with the objective,
// escort wagons and the camera target. Clicking or dragging jumps the camera there.
//
// Coordinate mapping: the world spans ±500 on both axes. Canvas x grows with world x.
// Canvas y uses y = (500 - z) / 1000 * h, i.e. world -z is at the BOTTOM — the Legion
// (team 0) deploys at negative z and so appears at the bottom, the Kingdom at the top,
// matching the player's view of the field from behind the Legion's lines.
const PAD = 8;
const TEAM_COL = ['#e05545', '#5a86e0'];

export class Minimap {
  // getObjective: () => world.objective (read live each draw); getTarget: () => {x, z} camera target
  constructor(canvas, world, getObjective, getTarget) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.getObjective = getObjective;
    this.getTarget = getTarget;
  }
  toMap(x, z) {
    const w = this.canvas.width, h = this.canvas.height;
    return [PAD + (x + 500) / 1000 * (w - PAD * 2), PAD + (500 - z) / 1000 * (h - PAD * 2)];
  }
  worldFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const px = (e.clientX - r.left) / r.width * this.canvas.width;
    const py = (e.clientY - r.top) / r.height * this.canvas.height;
    const x = (px - PAD) / (this.canvas.width - PAD * 2) * 1000 - 500;
    const z = 500 - (py - PAD) / (this.canvas.height - PAD * 2) * 1000;
    if (x < -520 || x > 520 || z < -520 || z > 520) return null;
    return { x, z };
  }
  draw() {
    const c = this.ctx, w = this.canvas.width, h = this.canvas.height;
    const st = this.world.stage;
    c.fillStyle = '#141210';
    c.fillRect(0, 0, w, h);
    // water hint: the river band, following its sine course
    if (st.hasWater && st.river) {
      c.strokeStyle = 'rgba(70,110,160,0.55)';
      c.lineWidth = Math.max(2, st.river.half / 1000 * (w - PAD * 2));
      c.beginPath();
      for (let x = -500; x <= 500; x += 25) {
        const [mx, my] = this.toMap(x, st.riverZ(x));
        if (x === -500) c.moveTo(mx, my); else c.lineTo(mx, my);
      }
      c.stroke();
    }
    // objective: capture point as a gold ring, exit as a gold line
    const obj = this.getObjective ? this.getObjective() : null;
    if (obj) {
      c.strokeStyle = '#e8c85a';
      c.lineWidth = 1.5;
      if (obj.point) {
        const [mx, my] = this.toMap(obj.point.x, obj.point.z);
        c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.stroke();
      }
      if (obj.exit) {
        const [x0, y0] = this.toMap(obj.exit.x0 !== undefined ? obj.exit.x0 : -260, obj.exit.z);
        const [x1] = this.toMap(obj.exit.x1 !== undefined ? obj.exit.x1 : 260, obj.exit.z);
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke();
      }
    }
    // regiments
    for (const r of this.world.regs) {
      if (r.alive <= 0) continue;
      const [mx, my] = this.toMap(r.cx, r.cz);
      if (r.type === 'wagon') {
        c.fillStyle = '#e8c85a';
        c.fillRect(mx - 2.5, my - 2.5, 5, 5);
        continue;
      }
      const cmd = r.T && r.T.commander;
      c.fillStyle = TEAM_COL[r.team] || '#ccc';
      c.beginPath(); c.arc(mx, my, cmd ? 4 : 2.5, 0, Math.PI * 2); c.fill();
      if (cmd) { c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.stroke(); }
    }
    // camera target crosshair
    const t = this.getTarget ? this.getTarget() : null;
    if (t) {
      const [mx, my] = this.toMap(t.x, t.z);
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(mx - 5, my); c.lineTo(mx + 5, my);
      c.moveTo(mx, my - 5); c.lineTo(mx, my + 5);
      c.stroke();
    }
  }
}
