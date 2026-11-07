// Facing audit: for every unit type in every era pack (plus the base
// pack as control), compute the pose with the SAME functions the
// renderer uses (poseHuman / computeMount / computeCrew / emitRam /
// emitOnager) and measure anatomical forward from the resulting joint
// / segment coordinates — never from internal labels:
//
//   humans:  f_anat = up x right, up = NECK-PELVIS, right = RSHO-LSHO;
//            dot(f_anat, heading-forward) must be ~ +1 (idle + march).
//            knees must bend forward, the shield must sit in front,
//            and the weapon hand must be on the anatomical side the
//            man's handedness says (lefties: weapon side flips, the
//            body does NOT).
//   mounts:  dot(MUZZLE-TAIL, forward) ~ +1; elephants via trunk tip
//            and tusks; riders' f_anat vs the mount's forward.
//   engines: emit into a recording stub and locate the ram head /
//            onager arm in world space against the unit basis.
//   ships:   sample galleys and landing boats underway and dot their
//            velocity against their heading; rowers face aft (rowing).
//
// Run: node tools/facing-probe.mjs    (exit 1 if any check fails)
const R = new URL('../src/', import.meta.url).pathname;
const { World } = await import(R + 'sim/world.js');
const { Projectiles } = await import(R + 'sim/projectiles.js');
const { buildStage } = await import(R + 'sim/stage.js');
const { Nav } = await import(R + 'sim/nav.js');
const { Engineering } = await import(R + 'sim/engineering.js');
const { Command } = await import(R + 'sim/command.js');
const { Objective } = await import(R + 'sim/objective.js');
const { setStage } = await import(R + 'terrain.js');
const { buildScenario, SIZES } = await import(R + 'scenario.js');
const { J, poseHuman, poseHumanFar, setBasisYaw, SEAT_GROUND, ACT_SHOOT, ONE_HANDED, SH_NONE } = await import(R + 'anim/human.js');
const { Q, E } = await import(R + 'anim/quadruped.js');
const { computeMount, computeCrew, crewBasis, unitBasis, CHARIOT_CAR_Z, CHARIOT_HORSE_Z } = await import(R + 'sim/mounts.js');
const { makeBasis } = await import(R + 'anim/human.js');
const tmpBasis = makeBasis();
const bodies = await import(R + 'render/bodies.js');
const defs = await import(R + 'sim/defs.js');
const eras = await import(R + 'eras/index.js');
eras.applyEraTables();
const { TYPES, K_INF, K_CAV, K_ELE, K_CHR, K_DOG, K_ENG } = defs;

const sub = (j, a, b) => [j[a * 3] - j[b * 3], j[a * 3 + 1] - j[b * 3 + 1], j[a * 3 + 2] - j[b * 3 + 2]];
const hnorm = v => { const l = Math.hypot(v[0], v[2]) || 1; return [v[0] / l, 0, v[2] / l]; };
const dotH = (a, b) => a[0] * b[0] + a[2] * b[2];
const crossY = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function humanMetrics(j, B) {
  const up = sub(j, J.NECK, J.PELVIS);
  const right = sub(j, J.RSHO, J.LSHO);
  // NOTE: cross the true 3D vectors, then project. `up` is near-vertical,
  // so horizontal-normalising it first would destroy it (dot comes out 0).
  const fAnat = hnorm(crossY(up, right));
  const f = [B.fx, 0, B.fz], r = [B.rx, 0, B.rz];
  const kneeL = dotH(hnorm(sub(j, J.LKNEE, J.LFOOT)), f), kneeR = dotH(hnorm(sub(j, J.RKNEE, J.RFOOT)), f);
  const shield = dotH(hnorm(sub(j, J.SHN, J.PELVIS)), f);
  const wSide = Math.sign(dotH(sub(j, J.WBASE, J.PELVIS), r)) || 1;
  const rSide = Math.sign(dotH(right, r)) || 1;
  const wDir = dotH(hnorm(sub(j, J.WTIP, J.WBASE)), f);
  // a bow's WBASE->WTIP runs up the limb (vertical), so its aim line is
  // draw-hand -> bow-hand; the bow hand is the one nearest the grip (WBASE)
  const gL = sub(j, J.LHAND, J.WBASE), gR = sub(j, J.RHAND, J.WBASE);
  const bowHand = Math.hypot(...gL) < Math.hypot(...gR) ? J.LHAND : J.RHAND;
  const aimHands = dotH(hnorm(sub(j, bowHand, bowHand === J.LHAND ? J.RHAND : J.LHAND)), f);
  return { anat: dotH(fAnat, f), knee: Math.min(kneeL, kneeR), shield, wSide, rSide, wDir, aimHands };
}

const rows = [];   // {group, name, checks: {label: [min, mean, n]}}
function acc(map, key, v) { const e = map.get(key) || [Infinity, 0, 0]; e[0] = Math.min(e[0], v); e[1] += v; e[2]++; map.set(key, e); }

function makeWorld(stageId, pa, pb, mode = 'annihilate', sizeKey = 'S') {
  const stage = buildStage(stageId, SIZES[sizeKey]); setStage(stage);
  const nav = new Nav(stage); const w = new World(stage, nav);
  w.proj = new Projectiles(); w.engineering = new Engineering(w); w.command = new Command(w);
  eras.composeEra(w, pa, pb);
  buildScenario(w, stageId, sizeKey, 7);
  w.command.setup();
  w.objective = new Objective(w, mode, w.builder);
  return w;
}

const sampled = new Set();
function auditWorld(w, label) {
  const byType = new Map();
  const agents = w.agents.slice();
  for (const a of agents) {
    if (a.kind === K_INF) {
      for (const moving of [false, true]) {
        const st = a.st;
        st.action = 0; st.combat = 0; st.aimYaw = 0; st.aimPitch = 0;
        if (moving) { st.speed = 2.2; st.vx = Math.sin(a.heading) * 2.2; st.vz = Math.cos(a.heading) * 2.2; st.run = 0.3; st.phase = 0.3; }
        else { st.speed = 0; st.vx = 0; st.vz = 0; st.run = 0; }
        const B = setBasisYaw(a.basis, a.x, a.y, a.z, a.heading);
        poseHuman(a.joints, st, a.weapon, a.shield, SEAT_GROUND, B);
        const m = humanMetrics(a.joints, B);
        const M = byType.get(a.type) || new Map(); byType.set(a.type, M);
        const lefty = !!(a.stats && a.stats.lefty);
        acc(M, (moving ? 'anat(march)' : 'anat(idle)') + (lefty ? ' [lefty]' : ''), m.anat);
        acc(M, 'knee', m.knee);
        if (a.shield !== SH_NONE) acc(M, 'shieldFront', m.shield);
        // +1 = weapon held on the side the man's handedness demands
        if (ONE_HANDED(a.weapon)) acc(M, 'weaponSide(vs handedness)', (lefty ? -1 : 1) * m.wSide * m.rSide);
        // aimed shot: weapon must point along facing (bows aim along
        // the hands — their WBASE->WTIP is the vertical limb)
        if (defs.WEAPONS[a.weapon] && defs.WEAPONS[a.weapon].ranged) {
          st.action = ACT_SHOOT; st.actionT = 0.5; st.combat = 1;
          poseHuman(a.joints, st, a.weapon, a.shield, SEAT_GROUND, B);
          const m2 = humanMetrics(a.joints, B);
          const isBow = a.weapon === 2 || a.weapon === 19 || a.weapon === 20;   // W_BOW / W_FIREBOW / W_LONGBOW
          acc(M, 'aimDir', isBow ? m2.aimHands : m2.wDir);
          st.action = 0; st.combat = 0;
        }
        // the far-LOD skeleton (used beyond 170 m) must face the same way
        poseHumanFar(a.joints, st, a.weapon, B);
        acc(M, moving ? 'anatFar(march)' : 'anatFar(idle)', humanMetrics(a.joints, B).anat);
      }
      sampled.add(a.type);
    } else if (a.kind === K_CAV || a.kind === K_DOG || a.kind === K_ELE || a.kind === K_CHR) {
      for (const moving of [false, true]) {
        a.q.speed = moving ? 6 : 0; a.q.phase = 0.3;
        computeMount(a);
        const B = a.basis, f = [B.fx, 0, B.fz];
        const M = byType.get(a.type) || new Map(); byType.set(a.type, M);
        if (a.kind === K_ELE) {
          acc(M, moving ? 'trunk(moving)' : 'trunk(idle)', dotH(hnorm(sub(a.mj, E.T4, E.TAIL1)), f));
          const tm = [(a.mj[E.TUSKL * 3] + a.mj[E.TUSKR * 3]) / 2 - a.mj[E.HEADLOW * 3], 0, (a.mj[E.TUSKL * 3 + 2] + a.mj[E.TUSKR * 3 + 2]) / 2 - a.mj[E.HEADLOW * 3 + 2]];
          acc(M, 'tusks', dotH(hnorm(tm), f));
        } else {
          acc(M, moving ? 'head-tail(moving)' : 'head-tail(idle)', dotH(hnorm(sub(a.mj, Q.MUZZLE, Q.TAIL0)), f));
          if (a.kind === K_CHR) {
            acc(M, 'head-tail(horse2)', dotH(hnorm(sub(a.mj2, Q.MUZZLE, Q.TAIL0)), f));
            acc(M, 'carBehindHorse', (CHARIOT_CAR_Z - CHARIOT_HORSE_Z));   // construction constant: car at -1.15, horses at +1.1
          }
        }
        if (a.crew) for (let ci = 0; ci < a.crew.length; ci++) {
          const c = a.crew[ci];
          if (!c.alive) continue;
          c.st.action = 0;
          computeCrew(a, ci);
          crewBasis(a, ci, tmpBasis);
          const cm = humanMetrics(c.joints, tmpBasis);
          acc(M, `crew${ci} anat`, cm.anat);
        }
      }
      sampled.add(a.type);
    } else if (a.kind === K_ENG) {
      auditEngine(a, byType);
      sampled.add(a.type);
    }
  }
  for (const [type, M] of byType) rows.push({ group: label, type, M });
}

// ---- engines via the real emit functions into a recording stub ----
function auditEngine(a, byType) {
  const M = byType.get(a.type) || new Map(); byType.set(a.type, M);
  const look = a.look || {};
  const segs = [];
  const rec = { seg: (x0, y0, z0, x1, y1, z1, rx, ry, rz, w, h, c) => segs.push({ x0, y0, z0, x1, y1, z1, c }) };
  const S = { box: rec, cyl: rec };
  unitBasis(a, a.basis);
  const B = a.basis, f = [B.fx, 0, B.fz];
  const off = s => dotH([(s.x0 + s.x1) / 2 - a.x, 0, (s.z0 + s.z1) / 2 - a.z], f);
  if (a.T.sub === 'ram') {
    bodies.emitRam(S, a, 0);
    const metal = segs.filter(s => s.c === look.metal);
    if (metal.length) acc(M, 'ramHeadOffset(m)', Math.max(...metal.map(off)));
    const all = segs.map(off);
    acc(M, 'frameFront(m)', Math.max(...all)); acc(M, 'frameBack(m)', Math.min(...all));
  } else {
    // onager family (incl. trebuchet / bombard / hwacha / wagon frame)
    for (const swing of [0, 1]) {
      a.q.swing = swing;
      segs.length = 0;
      bodies.emitOnager(S, a, 0);
      // the throwing arm: the long wood segment hinged near local z -0.9
      let best = null;
      const r = [B.rx, 0, B.rz];
      for (const s of segs) {
        const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0);
        const perp = Math.abs(dotH([(s.x0 + s.x1) / 2 - a.x, 0, (s.z0 + s.z1) / 2 - a.z], r));
        if (len > 2.5 && perp < 0.3 && s.c === look.wood) best = s;   // the arm is on the centreline; the rails are not
      }
      if (best) {
        const o0 = dotH([best.x0 - a.x, 0, best.z0 - a.z], f), o1 = dotH([best.x1 - a.x, 0, best.z1 - a.z], f);
        if (swing === 0) acc(M, 'armTipCocked(m)', Math.min(o0, o1));          // cocked: tip lies far BEHIND the hinge
        else {                                                                 // fired: tip is the high end, up at the stop frame
          const hi = best.y1 > best.y0 ? [o1, best.y1] : [o0, best.y0];
          acc(M, 'armTipFired(m)', hi[0]); acc(M, 'armTipFiredHeight(m)', hi[1] - a.y);
        }
      }
      if (swing === 1) {
        // the stop frame (hide bar) sits on the firing side
        const hide = segs.filter(s => s.c === look.hide);
        if (hide.length) acc(M, 'stopFrameOffset(m)', Math.max(...hide.map(off)));
      }
    }
    a.q.swing = 0;
  }
  // engine crew face the machine (crewBasis rotates them by c.face);
  // measure each man against his OWN basis
  if (a.crew) {
    unitBasis(a, a.basis);
    for (let ci = 0; ci < a.crew.length; ci++) {
      const c = a.crew[ci];
      if (!c.alive) continue;
      c.st.action = 0;
      computeCrew(a, ci);
      crewBasis(a, ci, tmpBasis);
      const cm = humanMetrics(c.joints, tmpBasis);
      acc(M, `crew${ci} anat`, cm.anat);
    }
  }
}

// ================= deployments =================
const P = id => eras.ERAS[id];
auditWorld(makeWorld('field', P('rome'), P('rome')), 'rome/field (control)');
for (const p of eras.ERA_LIST) {
  if (p.id === 'rome') continue;
  auditWorld(makeWorld('field', p, p), p.id + '/field');
}
auditWorld(makeWorld('siege', P('rome'), P('rome')), 'rome/siege');
auditWorld(makeWorld('siege', P('japan'), P('japan')), 'japan/siege');
auditWorld(makeWorld('siege', P('europe-mid'), P('europe-mid')), 'europe-mid/siege');
auditWorld(makeWorld('siege', P('ottoman'), P('ottoman')), 'ottoman/siege');
auditWorld(makeWorld('harbor', P('europe-early'), P('europe-early')), 'europe-early/harbor');
auditWorld(makeWorld('harbor', P('aztec'), P('aztec')), 'aztec/harbor');
auditWorld(makeWorld('naval', P('rome'), P('rome')), 'rome/naval');
auditWorld(makeWorld('harbor', P('japan'), P('korea')), 'japan-vs-korea/harbor');
auditWorld(makeWorld('canyon', P('greece'), P('greece')), 'greece/canyon');
auditWorld(makeWorld('marsh', P('europe-late'), P('europe-late')), 'europe-late/marsh');

// any type never deployed by its pack: spawn it directly and audit it too
{
  const missing = Object.keys(TYPES).filter(t => !sampled.has(t));
  if (missing.length) {
    const w = makeWorld('field', P('rome'), P('rome'));
    const b = w.builder;
    let x = -150;
    for (const t of missing) { b.reg(0, t, 4, 2, x, 150, '監査用 ' + t, { wing: '中央', q: 0.6 }); x += 12; if (x > 150) x = -150; }
    w.command.setup();
    auditWorld(w, 'spawned-extras');
  }
}

// ================= ships & wagons (live sim) =================
const shipRows = [];
{
  // naval galleys underway
  const w = makeWorld('naval', P('rome'), P('rome'));
  for (let i = 0; i < 60; i++) w.update(1 / 60); w.start();
  const prev = new Map(); let gmin = 1, gn = 0;
  for (let s = 0; s < 150; s++) {
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    for (const g of (w.stage.galleys || [])) {
      const p = prev.get(g);
      if (p && g.state === 'row') {
        const vx = g.x - p[0], vz = g.z - p[1];
        if (Math.hypot(vx, vz) > 0.05) { gmin = Math.min(gmin, dotH(hnorm([vx, 0, vz]), [Math.sin(g.heading), 0, Math.cos(g.heading)])); gn++; }
      }
      prev.set(g, [g.x, g.z]);
    }
  }
  shipRows.push(['galley underway: vel·heading (min, n=' + gn + ')', gmin]);
  // (naval infantry / marines are covered by the rome/naval deployment audit)
}
{
  // landing boats underway + rowers facing aft
  const w = makeWorld('harbor', P('rome'), P('rome'));
  for (let i = 0; i < 60; i++) w.update(1 / 60); w.start();
  const prev = new Map(); let bmin = 1, bsum = 0, bn = 0, rMin = 1, rn = 0;
  for (let s = 0; s < 120; s++) {
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    if (!w.landing) break;
    for (const b of w.landing.boats) {
      const p = prev.get(b);
      if (p && (b.state === 'out' || b.state === 'back')) {
        const vx = b.x - p[0], vz = b.z - p[1];
        if (Math.hypot(vx, vz) > 0.05) { const d = dotH(hnorm([vx, 0, vz]), [Math.sin(b.heading), 0, Math.cos(b.heading)]); bmin = Math.min(bmin, d); bsum += d; bn++; }
      }
      prev.set(b, [b.x, b.z]);
      if (s === 60) for (const r of b.rowers) {
        // exactly the renderer's call: rowers sit at heading + PI (facing aft)
        const B = setBasisYaw(r.basis, r.x || b.x, 0, r.z || b.z, b.heading + Math.PI);
        r.st.action = 0; r.st.speed = 0;
        poseHuman(r.joints, r.st, 9, SH_NONE, 3, B);
        const m = humanMetrics(r.joints, [Math.sin(b.heading), 0, Math.cos(b.heading)] && { fx: Math.sin(b.heading), fz: Math.cos(b.heading), rx: Math.cos(b.heading), rz: -Math.sin(b.heading) });
        rMin = Math.min(rMin, -m.anat);   // anat is measured vs the AFT basis; negate -> vs boat forward: expect ~ -1 (facing aft)
        rn++;
      }
    }
  }
  shipRows.push([`landing boat underway: vel·heading (min ${bmin.toFixed(3)}, judged on mean, n=${bn})`, bn ? bsum / bn : 0]);
  shipRows.push(['rowers facing aft: -(anat vs boat fwd) (min, n=' + rn + ')', rMin]);
}
{
  // escort wagons: pose audit at S (deployment), travel check at M —
  // at S the convoy is destroyed in place before it can travel (the
  // ambush starts inside the wagons' 26 m hold radius at that scale)
  const wS = makeWorld('field', P('rome'), P('rome'), 'escort');
  auditWorld(wS, 'rome/escort');
  const w = makeWorld('field', P('rome'), P('rome'), 'escort', 'M');
  for (let i = 0; i < 60; i++) w.update(1 / 60); w.start();
  // fine-grained sampling: wagons hold position while >=2 foes are within
  // ~31 m (by design), so 1 s windows can miss every actual movement;
  // sample every 0.1 s and keep windows where a wagon really displaced
  const prev = new Map(); let wmin = 1, wsum = 0, wn = 0, driveTicks = 0;
  for (let s = 0; s < 6000 && wn < 400; s++) {
    for (let i = 0; i < 6; i++) w.update(1 / 60);
    for (const a of w.agents) {
      if (a.type !== 'wagon' || a.state !== 0) continue;   // agents: state 0 = S_ALIVE (crew members have .alive; agents do not)
      if (a.dspd > 0) driveTicks++;
      const p = prev.get(a);
      if (p) {
        const vx = a.x - p[0], vz = a.z - p[1];
        if (Math.hypot(vx, vz) > 0.03) { const d = dotH(hnorm([vx, 0, vz]), [Math.sin(a.heading), 0, Math.cos(a.heading)]); wmin = Math.min(wmin, d); wsum += d; wn++; }
      }
      prev.set(a, [a.x, a.z]);
    }
  }
  shipRows.push([`escort wagon underway (M): vel·heading (min ${wmin.toFixed(3)}, judged on mean, n=${wn}, drive samples=${driveTicks})`, wn ? wsum / wn : 0]);
}

// ================= report =================
let fails = 0;
const DOT_OK = 0.9;
console.log('\n== per-type facing audit (dot products; pass ~ > 0.9, offsets in metres) ==');
for (const r of rows) {
  const cells = [];
  for (const [k, e] of r.M) {
    const mean = e[1] / e[2];
    cells.push(`${k}: min ${e[0].toFixed(2)} / mean ${mean.toFixed(2)} (n=${e[2]})`);
    if (k.startsWith('anat') || k.startsWith('head-tail') || k.startsWith('trunk') || k.startsWith('crew') || k === 'tusks') {
      if (e[0] < DOT_OK) { fails++; cells[cells.length - 1] += '  <-- FAIL'; }
    }
    if (k === 'knee' && e[0] < -0.1) { fails++; cells[cells.length - 1] += '  <-- FAIL (knees bend backward)'; }
    if (k === 'shieldFront' && e[0] < 0.2) { fails++; cells[cells.length - 1] += '  <-- FAIL (shield not in front)'; }
    if (k.startsWith('weaponSide') && e[0] < 0.5) { fails++; cells[cells.length - 1] += '  <-- FAIL (weapon on wrong side for handedness)'; }
    if (k === 'aimDir' && e[0] < 0.5) { fails++; cells[cells.length - 1] += '  <-- FAIL (aimed weapon not forward)'; }
    if (k === 'ramHeadOffset(m)' && e[0] < 2.5) { fails++; cells[cells.length - 1] += '  <-- FAIL (ram head not at front)'; }
    if (k === 'armTipCocked(m)' && e[0] > -2.0) { fails++; cells[cells.length - 1] += '  <-- FAIL (cocked arm does not lie back)'; }
    if (k === 'armTipFired(m)' && e[0] < -0.6) { fails++; cells[cells.length - 1] += '  <-- FAIL (fired arm tip not at the stop frame)'; }
    if (k === 'armTipFiredHeight(m)' && e[0] < 2.2) { fails++; cells[cells.length - 1] += '  <-- FAIL (fired arm not raised)'; }
    if (k === 'stopFrameOffset(m)' && e[0] < 0) { fails++; cells[cells.length - 1] += '  <-- FAIL (stop frame behind)'; }
  }
  console.log(`${r.group} :: ${r.type}\n    ${cells.join(' | ')}`);
}
console.log('\n== ships / wagons (live) ==');
for (const [label, v] of shipRows) {
  const ok = v > DOT_OK;
  if (!ok) fails++;
  console.log(`${label}: ${v.toFixed(3)}${ok ? '' : '  <-- FAIL'}`);
}
console.log('\nconstruction notes:');
console.log('- static transports (decor ships): stem post at +8.4 m, stern post at -7.6 m along decor heading (stageRender) — bow = +heading, same convention as galleys/boats (raised bow at +heading end).');
console.log('- fire ships (china-mid Red Cliffs) and turtle ships (korea) have no hull geometry in the game (event/effect only) — nothing to flip; fire ignitions drift with the wind (+x).');
console.log('- escort wagons reuse the onager frame geometry (no draft horse is modelled); travel direction = frame long axis, verified live above.');
console.log(`\nfacing-probe: ${fails} failure(s); types sampled: ${sampled.size}/${Object.keys(TYPES).length}`);
process.exit(fails ? 1 : 0);
