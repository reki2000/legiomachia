// Headless browser UI verification.
//
// Unlike tools/battle.mjs / tools/ui.mjs (which assume a vite server is
// already running on :5173 and a Playwright-bundled Chromium under
// ~/.cache/ms-playwright), this check is self-contained:
//   - it starts its own vite dev server on port 5199 and kills it at the end
//     (vite is spawned as `node node_modules/vite/bin/vite.js`, not via npx:
//     killing an npx wrapper orphans the real vite process and leaks the port)
//   - it launches the chrome-headless-shell build kept in the workspace
//     (override with the CHROME_PATH env var)
//
// Frame pumping: chrome-headless-shell only produces compositor frames when
// something asks for one — left alone, requestAnimationFrame trickles at
// ~1-3 fps, so timers that accumulate frame time (the adaptive-quality
// evaluator, the 0.3 s UI refresh that fills the perf HUD / soldier card)
// barely advance. Page.captureScreenshot forces frames, so the checks below
// "pump" a few captures whenever the app needs frames to settle. This is a
// harness property, not an app bug: on a real display rAF runs at vsync.
//
// Checks:
//   (a) ?size=S&stage=field loads, window.__battle appears, no pageerrors
//   (b) expansion UI exists: seed input #sSeed, difficulty select #sDiff,
//       minimap canvas #minimap, results panel #results
//   (c) the battle starts, advances 30 simulated seconds via
//       __battle.advance, and a forced objective result makes the results
//       panel visible
//   (d) HUD layout: at 1280x720 and at 390x844 (perf HUD on, a regiment
//       selected, soldier card shown) the bounding boxes of #controls,
//       #minimapPanel, #tree, #perfHud, #selPanel, #soldier, #help (desktop
//       only), #status and #ghLink must not intersect (>1 px), and the
//       control bar must stay a single row (height <= 64/70 px)
//   (e) adaptive quality: with the CPU throttled 4x via CDP, pumping frames
//       must step the quality level down from its load-time value, the perf
//       HUD text must show the same Q level, and poseSkip must match it
//   (f) touch (390x844 page): a touch tap on a soldier selects its
//       regiment and shows the soldier card; a one-finger CDP drag pans
//       the camera target; a two-finger CDP pinch changes distance/yaw
// Missing (b)/(c) elements are reported as WARN (pending integration — those
// panels are built by main.js/index.html, not by this tool); the check only
// FAILs on load failure, pageerrors, or failed (d)/(e)/(f) assertions.
// Screenshots written to /tmp:
//   /tmp/ui-check-results.png       (full page after the forced result)
//   /tmp/ui-check-minimap.png       (the minimap element, or its screen corner)
//   /tmp/ui-check-layout-1280.png   (1280x720 with all HUD panels shown)
//   /tmp/ui-check-layout-390.png    (390x844 with all HUD panels shown)
//
// usage: node tools/ui-check.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CHROME = '/home/hatch/workspace/.headless/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';
const exe = process.env.CHROME_PATH || DEFAULT_CHROME;
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const SHOT_RESULT = '/tmp/ui-check-results.png';
const SHOT_MINIMAP = '/tmp/ui-check-minimap.png';
const SHOT_LAYOUT_1280 = '/tmp/ui-check-layout-1280.png';
const SHOT_LAYOUT_390 = '/tmp/ui-check-layout-390.png';
const QUAL_PR = [1.5, 1.25, 1.0, 0.85], QUAL_SKIP = [1, 1, 2, 3];

let failures = 0, warnings = 0;
const pass = m => console.log('PASS  ' + m);
const warn = m => { warnings++; console.log('WARN  ' + m + ' (pending integration)'); };
const fail = m => { failures++; console.log('FAIL  ' + m); };

if (!existsSync(exe)) {
  fail(`chrome executable not found: ${exe} (set CHROME_PATH)`);
  process.exit(1);
}
pass(`chrome: ${exe}`);

// ------------------------------------------------------------ vite server
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', d => { viteLog += d; });
vite.stderr.on('data', d => { viteLog += d; });
async function waitForServer(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (vite.exitCode !== null) throw new Error('vite exited early:\n' + viteLog);
    try {
      const r = await fetch(BASE + '/');
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('vite did not come up on ' + BASE + ':\n' + viteLog);
}

// -------------------------------------------- per-page CDP helpers (pump/shot)
// One CDP session per page, reused for frame pumping, screenshots, CPU
// throttling and touch dispatch. Bounding boxes are read via evaluate +
// getBoundingClientRect: page.$()/boundingBox() proved flaky against the
// headless shell (DOM.describeNode "Cannot find context") in the baseline run.
function makeCdp(page) {
  let session = null;
  const get = async () => session || (session = await page.context().newCDPSession(page));
  return {
    async send(method, params) { const s = await get(); return s.send(method, params); },
    // Drive n compositor frames by asking for captures and discarding them.
    // Each capture is raced against a timeout: under CDP CPU throttling a
    // single capture can take minutes (the throttled main thread produces
    // the requested frame extremely slowly), and a hung capture must not
    // hang the whole check — the frames it did produce still count.
    async pump(n = 3) {
      const s = await get();
      for (let i = 0; i < n; i++) {
        await Promise.race([
          s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).catch(() => {}),
          new Promise(r => setTimeout(r, 25000)),
        ]);
      }
    },
    async shot(path, clip) {
      try {
        const s = await get();
        const params = { format: 'png', captureBeyondViewport: false };
        if (clip) params.clip = { ...clip, scale: 1 };
        const { data } = await s.send('Page.captureScreenshot', params);
        writeFileSync(path, Buffer.from(data, 'base64'));
      } catch {
        await page.screenshot({ path, ...(clip ? { clip } : {}), timeout: 20000 });
      }
    },
    async close() { if (session) await session.detach().catch(() => {}); session = null; },
  };
}

// Pump frames until the in-page predicate holds (or the pump budget runs
// out) and return its last value. Panel visibility that depends on the
// app's 0.3 s UI tick (soldier card, perf HUD text) lands at unpredictable
// wall-clock times in this harness, so checks poll instead of assuming a
// fixed number of pumped frames was enough.
async function pumpUntil(cdp, page, fn, maxPumps = 10) {
  let v = await page.evaluate(fn);
  for (let i = 0; i < maxPumps && !v; i++) { await cdp.pump(1); v = await page.evaluate(fn); }
  return v;
}

// visible bounding boxes of the given element ids: { id: {x,y,w,h,right,bottom} }
const measureBoxes = (page, ids) => page.evaluate(ids => {
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) { out[id] = null; continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    out[id] = visible ? { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } : null;
  }
  return out;
}, ids);

// fail once per intersecting pair (1 px rounding tolerance; designed gaps are >= 8 px)
function assertNoOverlap(boxes, label) {
  const vis = Object.entries(boxes).filter(([, b]) => b);
  let bad = 0;
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const [ka, a] = vis[i], [kb, b] = vis[j];
    const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (ox > 1 && oy > 1) { fail(`(d) ${label}: #${ka} overlaps #${kb} by ${ox.toFixed(0)}x${oy.toFixed(0)}px`); bad++; }
  }
  if (!bad) pass(`(d) ${label}: no overlap among ${vis.length} visible HUD panels (${vis.map(([k]) => '#' + k).join(', ')})`);
  return bad;
}

// DOM clicks first: Playwright's locator actionability waits (visibility /
// stability) stall for many seconds on the headless shell's starved rAF
// loop, while el.click() reaches the same handlers synchronously (the perf
// checkbox uses an onchange property, the army tree a delegated listener).
async function clickEl(page, selector) {
  const hit = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, selector);
  if (!hit) await page.locator(selector).first().click({ timeout: 15000 });
}
async function checkEl(page, selector) {
  const done = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; if (!el.checked) el.click(); return el.checked; }, selector);
  if (!done) await page.locator(selector).first().check({ timeout: 15000 });
}

// Centre of the first living team-0 regiment: the camera view for the
// picking checks is put there, because at a phone's portrait aspect the
// fixed view used by tools/ui.mjs frames no regiment at all (its nearest
// soldiers project off-screen).
const regCenter = page => page.evaluate(() => {
  const r = window.__battle.world.regs.find(r => r.team === 0 && r.alive > 0);
  return r ? { x: r.cx, z: r.cz } : null;
});

// Screen point of a team-0 infantryman the click/tap can actually reach:
// the nearest candidates to (cx, cz) are tried in order, and the point must
// hit the WebGL canvas itself — a point that projects under a HUD panel
// (the help panel covers much of the right-centre at 1280x720) is eaten by
// the panel and never reaches the picking handlers. The caller must have
// pumped frames after __battle.view so the camera actually sits where
// view() put it.
const soldierPoint = (page, cx, cz) => page.evaluate(({ cx, cz }) => {
  const b = window.__battle; b.camera.updateMatrixWorld();
  const canvas = document.querySelector('#app canvas');
  const cands = b.world.agents
    .filter(a => a.team === 0 && a.state === 0 && a.kind === 0)
    .sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz));
  for (const a of cands) {
    const v = b.camera.position.clone().set(a.x, a.y + 1, a.z).project(b.camera);
    if (v.z > 1) continue;
    const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    if (x < 4 || y < 4 || x > innerWidth - 4 || y > innerHeight - 4) continue;
    if (document.elementFromPoint(x, y) === canvas) return { x, y };
  }
  return null;
}, { cx, cz });

let browser = null;
const pageErrors = [];
try {
  await waitForServer();
  pass(`vite dev server on ${BASE}`);

  browser = await chromium.launch({
    executablePath: exe,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const cdp = makeCdp(page);
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

  // (a) load
  await page.goto(`${BASE}/?size=S&stage=field`, { waitUntil: 'load', timeout: 60000 });
  const loaded = await page.waitForFunction(() => window.__battle, null, { timeout: 60000 }).then(() => true).catch(() => false);
  if (loaded) pass('(a) page loaded, window.__battle present');
  else fail('(a) window.__battle did not appear within 60 s');

  if (loaded) {
    // (b) expansion UI elements
    const els = await page.evaluate(() => {
      const probe = id => { const el = document.getElementById(id); return el ? el.tagName.toLowerCase() : null; };
      return { sSeed: probe('sSeed'), sDiff: probe('sDiff'), minimap: probe('minimap'), results: probe('results') };
    });
    if (els.sSeed) pass(`(b) seed input #sSeed present (<${els.sSeed}>)`); else warn('(b) seed input #sSeed missing');
    if (!els.sDiff) pass('(b) difficulty select demoted to ?diff= only (absent from the panel, asserted in (g))'); else fail('(b) difficulty select #sDiff is back in the panel');
    if (els.minimap === 'canvas') pass('(b) minimap canvas #minimap present'); else if (els.minimap) warn(`(b) #minimap present but is <${els.minimap}>, not <canvas>`); else warn('(b) minimap canvas #minimap missing');
    if (els.results) pass('(b) results panel #results present'); else warn('(b) results panel #results missing');
    const qLoad = await page.evaluate(() => window.__battle.qualityInfo().quality);

    // (d) desktop layout: perf HUD on, regiment selected, soldier card shown
    await checkEl(page, '#cPerf');
    await clickEl(page, '#tree .reg');
    const dc = await regCenter(page);
    await page.evaluate(c => window.__battle.view(c.x, c.z, 26, 0.35, 3.14), dc);
    await cdp.pump(2); // let the camera settle where view() put it before projecting
    const pt = await soldierPoint(page, dc.x, dc.z);
    if (pt) {
      await page.mouse.click(pt.x, pt.y);
      await pumpUntil(cdp, page, () => !document.getElementById('soldier').hidden && !document.getElementById('selPanel').hidden && !document.getElementById('perfHud').hidden);
    }
    else warn('(d) no on-screen soldier found for the soldier-card click');
    const boxes1280 = await measureBoxes(page, ['controls', 'minimapPanel', 'tree', 'perfHud', 'selPanel', 'soldier', 'help', 'status', 'ghLink']);
    for (const id of ['selPanel', 'soldier', 'perfHud']) {
      if (boxes1280[id]) pass(`(d) 1280x720: #${id} visible for the layout check`);
      else fail(`(d) 1280x720: #${id} not visible, layout check incomplete`);
    }
    if (boxes1280.controls && boxes1280.controls.h <= 64) pass(`(d) 1280x720: control bar is a single row (h=${boxes1280.controls.h.toFixed(0)}px)`);
    else fail(`(d) 1280x720: control bar h=${boxes1280.controls ? boxes1280.controls.h.toFixed(0) : '?'}px, expected <= 64px (single row)`);
    assertNoOverlap(boxes1280, '1280x720');
    await cdp.shot(SHOT_LAYOUT_1280);
    pass(`screenshot: ${SHOT_LAYOUT_1280}`);

    // (e) adaptive quality under CPU throttling
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let qInfo = await page.evaluate(() => window.__battle.qualityInfo());
    for (let i = 0; i < 40 && qInfo.quality < 3; i++) {
      await cdp.pump(1);
      qInfo = await page.evaluate(() => window.__battle.qualityInfo());
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // the HUD text is rewritten by the 0.3 s UI tick, so it can lag one tick
    // behind the final quality step: pump until it catches up before asserting
    for (let i = 0; i < 8; i++) {
      const t = await page.evaluate(() => document.getElementById('perfHud').textContent);
      if (t.includes(`画質 Q${qInfo.quality}`)) break;
      await cdp.pump(1);
    }
    const perfText = await page.evaluate(() => document.getElementById('perfHud').textContent);
    const hudQ = (perfText.match(/画質 Q(\d)/) || [])[1];
    if (qInfo.quality > qLoad || qInfo.quality === 3) pass(`(e) adaptive quality stepped down Q${qLoad} -> Q${qInfo.quality} under CPU throttling (FPS EMA ${qInfo.fpsEMA.toFixed(0)})`);
    else fail(`(e) adaptive quality did not step down: Q${qLoad} -> Q${qInfo.quality} (FPS EMA ${qInfo.fpsEMA.toFixed(0)})`);
    if (hudQ !== undefined && Number(hudQ) === qInfo.quality) pass(`(e) perf HUD reflects the quality level (画質 Q${hudQ})`);
    else fail(`(e) perf HUD quality mismatch: HUD="${perfText.replace(/\n/g, ' | ')}" vs qualityInfo Q${qInfo.quality}`);
    const wantPr = Math.min(1, QUAL_PR[qInfo.quality]); // headless devicePixelRatio is 1
    if (Math.abs(qInfo.pixelRatio - wantPr) < 0.01 && qInfo.poseSkip === QUAL_SKIP[qInfo.quality]) pass(`(e) applyQuality in effect: pixelRatio ${qInfo.pixelRatio.toFixed(2)}, poseSkip ${qInfo.poseSkip} (Q${qInfo.quality} table values)`);
    else fail(`(e) applyQuality mismatch at Q${qInfo.quality}: pixelRatio ${qInfo.pixelRatio}, poseSkip ${qInfo.poseSkip}, expected ${wantPr}/${QUAL_SKIP[qInfo.quality]}`);

    // ------------------------------------------------ (f) phone page: layout + touch
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p2 = await ctx2.newPage();
    const cdp2 = makeCdp(p2);
    p2.on('pageerror', e => pageErrors.push('phone: ' + e.message));
    p2.on('console', m => { if (m.type() === 'error') pageErrors.push('phone console: ' + m.text()); });
    // 'domcontentloaded', not 'load': with the desktop page's render loop
    // saturating the browser, the second page's load event can take >60 s;
    // the __battle wait below is the real readiness signal
    await p2.goto(`${BASE}/?size=S&stage=field`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const loaded2 = await p2.waitForFunction(() => window.__battle, null, { timeout: 120000 }).then(() => true).catch(() => false);
    if (!loaded2) fail('(f) phone page: window.__battle did not appear within 60 s');
    if (loaded2) {
      const touch = (type, points) => cdp2.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await checkEl(p2, '#cPerf');
      await clickEl(p2, '#tree .reg');
      const pc = await regCenter(p2);
      await p2.evaluate(c => window.__battle.view(c.x, c.z, 26, 0.35, 3.14), pc);
      await cdp2.pump(2);
      // (f1) tap-select: a tap on a soldier selects its regiment + shows its card.
      // Playwright's touchscreen.tap is used for the tap itself: a raw CDP
      // touchEnd with an empty touchPoints list does not deliver the released
      // point's coordinates on mobile emulation, so the app's tap handler
      // (which compares touchstart/touchend positions) sees a phantom drag
      // and correctly ignores it. touchscreen.tap sends the released point.
      const tp = await soldierPoint(p2, pc.x, pc.z);
      if (!tp) fail('(f) phone page: no on-screen soldier found for the tap test');
      if (tp) {
        await p2.touchscreen.tap(tp.x, tp.y);
        await pumpUntil(cdp2, p2, () => !document.getElementById('soldier').hidden && !document.getElementById('selPanel').hidden);
        const tapState = await p2.evaluate(() => ({
          selHidden: document.getElementById('selPanel').hidden,
          selName: document.getElementById('selName').textContent,
          soldierHidden: document.getElementById('soldier').hidden,
        }));
        if (!tapState.selHidden && tapState.selName) pass(`(f) touch tap selected a regiment: "${tapState.selName.trim()}"`);
        else fail(`(f) touch tap did not select: selPanel hidden=${tapState.selHidden}, selName="${tapState.selName}"`);
        if (!tapState.soldierHidden) pass('(f) touch tap showed the soldier card');
        else fail('(f) touch tap did not show the soldier card (#soldier still hidden)');
      }
      // (d) phone layout, with all panels the tap/selection produced still up
      const boxes390 = await measureBoxes(p2, ['controls', 'minimapPanel', 'tree', 'perfHud', 'selPanel', 'soldier', 'status', 'ghLink']);
      if (boxes390.controls && boxes390.controls.h <= 70) pass(`(d) 390x844: control bar is a single row (h=${boxes390.controls.h.toFixed(0)}px)`);
      else fail(`(d) 390x844: control bar h=${boxes390.controls ? boxes390.controls.h.toFixed(0) : '?'}px, expected <= 70px (single row)`);
      assertNoOverlap(boxes390, '390x844');
      await cdp2.shot(SHOT_LAYOUT_390);
      pass(`screenshot: ${SHOT_LAYOUT_390}`);
      // (f2) one-finger pan moves the camera target
      const rig0 = await p2.evaluate(() => { const r = window.__battle.rig; return { x: r.target.x, z: r.target.z, dist: r.dist, yaw: r.yaw }; });
      await touch('touchStart', [{ x: 300, y: 500, id: 2 }]);
      for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: 300 - i * 16, y: 500 + i * 8, id: 2 }]);
      await touch('touchEnd', [{ x: 220, y: 540, id: 2 }]);
      const rig1 = await p2.evaluate(() => { const r = window.__battle.rig; return { x: r.target.x, z: r.target.z, dist: r.dist, yaw: r.yaw, mode: r.mode }; });
      const panD = Math.hypot(rig1.x - rig0.x, rig1.z - rig0.z);
      if (panD > 1 && rig1.mode === 'free') pass(`(f) one-finger pan moved the camera target by ${panD.toFixed(1)} world units (mode=${rig1.mode})`);
      else fail(`(f) one-finger pan did not move the camera target (moved ${panD.toFixed(2)}, mode=${rig1.mode})`);
      // (f3) two-finger pinch zooms and/or twists
      await touch('touchStart', [{ x: 145, y: 420, id: 3 }, { x: 245, y: 420, id: 4 }]);
      for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: 145 - i * 7, y: 420 + i * 2.2, id: 3 }, { x: 245 + i * 7, y: 420 - i * 2.2, id: 4 }]);
      await touch('touchEnd', [{ x: 110, y: 431, id: 3 }, { x: 280, y: 409, id: 4 }]);
      const rig2 = await p2.evaluate(() => { const r = window.__battle.rig; return { dist: r.dist, yaw: r.yaw }; });
      const zoomR = rig2.dist / rig1.dist, yawD = Math.abs(rig2.yaw - rig1.yaw);
      if ((zoomR < 0.85 || zoomR > 1.15) || yawD > 0.05) pass(`(f) pinch changed the camera: dist ${rig1.dist.toFixed(1)} -> ${rig2.dist.toFixed(1)} (x${zoomR.toFixed(2)}), yaw delta ${yawD.toFixed(2)}`);
      else fail(`(f) pinch had no effect: dist ${rig1.dist.toFixed(1)} -> ${rig2.dist.toFixed(1)}, yaw delta ${yawD.toFixed(3)}`);
    }
    await cdp2.close();
    await ctx2.close();

    // (c) start, advance, force a result
    const adv = await page.evaluate(() => {
      const b = window.__battle;
      b.startBattle();
      const msPerStep = b.advance(30);
      const w = b.world;
      return { msPerStep, time: w.time, counts: w.counts(), hasObjective: !!w.objective, mode: w.objective ? w.objective.mode : null };
    });
    pass(`(c) battle started and advanced 30 s (t=${adv.time.toFixed(0)}s, counts=[${adv.counts}], ${adv.msPerStep.toFixed(2)} ms/step, objective=${adv.mode})`);
    const forced = await page.evaluate(() => {
      const w = window.__battle.world;
      if (!w.objective) return { ok: false, why: 'no objective' };
      // a shutout score decides any mode's check() at once (annihilate fall-back included)
      const res = w.objective.check([10, 0]);
      return { ok: !!res, text: res ? res.text : '', winner: res ? res.winner : null };
    });
    if (forced.ok) pass(`(c) forced objective result: ${forced.text} (winner=${forced.winner})`);
    else warn(`(c) could not force an objective result: ${forced.why || 'check() returned null'}`);
    await cdp.pump(3); // let the main loop notice the result and show its panel/banner
    const panel = await page.evaluate(() => {
      const el = document.getElementById('results');
      if (!el) return { exists: false };
      const cs = getComputedStyle(el);
      const visible = !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
      const banner = document.getElementById('banner');
      return { exists: true, visible, text: (el.textContent || '').trim().slice(0, 80), banner: banner ? banner.textContent : '' };
    });
    if (!panel.exists) warn('(c) #results panel does not exist, so its visibility cannot be verified');
    else if (panel.visible) pass(`(c) results panel visible after result: "${panel.text}"`);
    else warn(`(c) #results exists but is not visible after a forced result (banner: "${panel.banner}")`);

    await cdp.shot(SHOT_RESULT);
    pass(`screenshot: ${SHOT_RESULT}`);
    const mmBox = await page.evaluate(() => {
      const el = document.getElementById('minimap');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    if (mmBox) await cdp.shot(SHOT_MINIMAP, mmBox);
    else await cdp.shot(SHOT_MINIMAP, { x: 960, y: 400, width: 320, height: 320 });
    pass(`screenshot: ${SHOT_MINIMAP}${mmBox ? '' : ' (minimap element absent/unmeasurable: bottom-right corner clip instead)'}`);
    await cdp.close();
  }

  // ------------------------------------------------ (g) deletions, demotions, era wiring, panel collapse
  {
    const vals = await page.evaluate(() => {
      const opts = id => [...document.getElementById(id).options].map(o => o.value);
      return {
        stage: opts('sStage'), mode: opts('sMode'), speed: opts('sSpeed'), cam: opts('sCam'),
        hasAuto: !!document.getElementById('cAuto'), hasDiff: !!document.getElementById('sDiff'),
        hasFold: !!document.getElementById('advFold'), seedInFold: !!document.querySelector('#advFold #sSeed'),
        eraCount: document.getElementById('sEra').options.length,
        helpMin: document.getElementById('help').classList.contains('min'),
      };
    });
    const gone = !vals.stage.includes('camp') && !vals.stage.includes('ford') && !vals.stage.includes('river')
      && !vals.mode.includes('retreat') && !vals.speed.includes('0.1') && !vals.speed.includes('0.25') && !vals.cam.includes('follow');
    if (gone) pass('(g) deleted options absent (camp/ford/river/retreat/0.1x/0.25x/follow)');
    else fail(`(g) deleted options still present: ${JSON.stringify(vals)}`);
    if (!vals.hasAuto && !vals.hasDiff) pass('(g) 自軍AI checkbox and difficulty selector removed from the panel (auto always on, diff is ?diff= only)');
    else fail(`(g) demoted controls still in panel: cAuto=${vals.hasAuto} sDiff=${vals.hasDiff}`);
    if (vals.hasFold && vals.seedInFold) pass('(g) seed input lives inside the 詳細 details fold');
    else fail('(g) details fold / seed placement wrong');
    if (vals.eraCount >= 15) pass(`(g) era selector lists ${vals.eraCount} packs`);
    else fail(`(g) era selector lists only ${vals.eraCount} packs`);
    if (vals.helpMin) pass('(g) help panel starts minimized');
    else fail('(g) help panel does not start minimized');

    // old URLs land on their successor stages / modes
    for (const [url, id, want, label] of [
      ['?stage=camp&size=S', 'sStage', 'siege', '?stage=camp -> siege'],
      ['?stage=ford&size=S', 'sStage', 'bridge', '?stage=ford -> bridge'],
      ['?stage=river&size=S', 'sStage', 'bridge', '?stage=river -> bridge'],
      ['?mode=retreat&size=S', 'sMode', 'annihilate', '?mode=retreat -> annihilate'],
      ['?cam=follow&size=S', 'sCam', 'cine', '?cam=follow -> cine (follow unlisted)'],
    ]) {
      await page.goto(`${BASE}/${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const okLoad = await page.waitForFunction(() => window.__battle, null, { timeout: 60000 }).then(() => true).catch(() => false);
      const got = okLoad ? await page.evaluate(i => document.getElementById(i).value, id) : null;
      if (got === want) pass(`(g) old URL fallback: ${label}`);
      else fail(`(g) old URL fallback ${label}: got ${got}`);
    }
    // era URL selects the pack and renames the armies
    await page.goto(`${BASE}/?era=japan&size=S&stage=field`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const okEra = await page.waitForFunction(() => window.__battle, null, { timeout: 60000 }).then(() => true).catch(() => false);
    const fn = okEra ? await page.evaluate(() => [document.getElementById('fn0').textContent, document.getElementById('fn1').textContent]) : [];
    if (fn[0] === '織田軍' && fn[1] === '武田軍') pass('(g) ?era=japan renames the armies （織田軍/武田軍）');
    else fail(`(g) ?era=japan faction names: ${JSON.stringify(fn)}`);

    // panel collapse on the phone viewport: close everything, reopen from the launcher
    const p4 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    p4.on('pageerror', e => pageErrors.push('panels: ' + e.message));
    await p4.goto(`${BASE}/?size=S&stage=field`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const okP = await p4.waitForFunction(() => window.__battle, null, { timeout: 120000 }).then(() => true).catch(() => false);
    if (!okP) fail('(g) panel page did not load');
    else {
      const closed = await p4.evaluate(() => {
        for (const b of document.querySelectorAll('.pClose')) b.click();
        const ids = ['status', 'controls', 'tree', 'selPanel', 'soldier', 'minimapPanel', 'perfHud'];
        return { allClosed: ids.every(id => document.getElementById(id).classList.contains('pclosed')),
                 launcherBtns: document.querySelectorAll('#launcher button').length,
                 saved: !!localStorage.getItem('legioPanels') };
      });
      if (closed.allClosed && closed.launcherBtns >= 5 && closed.saved) pass(`(g) all panels close; launcher shows ${closed.launcherBtns} reopen buttons; state saved`);
      else fail(`(g) panel close failed: ${JSON.stringify(closed)}`);
      const reopened = await p4.evaluate(() => {
        for (const b of document.querySelectorAll('#launcher button')) b.click();
        const ids = ['status', 'controls', 'tree', 'selPanel', 'soldier', 'minimapPanel', 'perfHud'];
        return ids.every(id => !document.getElementById(id).classList.contains('pclosed'));
      });
      if (reopened) pass('(g) launcher reopens every panel');
      else fail('(g) launcher did not reopen every panel');
      // persistence: close the tree, reload, it stays closed
      await p4.evaluate(() => { document.querySelector('#tree .pClose').click(); });
      await p4.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      await p4.waitForFunction(() => window.__battle, null, { timeout: 120000 }).catch(() => {});
      const persisted = await p4.evaluate(() => document.getElementById('tree').classList.contains('pclosed'));
      if (persisted) pass('(g) panel state persists across reload (localStorage)');
      else fail('(g) panel state did not persist across reload');
    }
    await p4.close().catch(() => {});
  }

  if (pageErrors.length) fail(`pageerrors/console errors (${pageErrors.length}):\n  ` + pageErrors.slice(0, 5).join('\n  '));
  else pass('no pageerrors');
} catch (e) {
  fail('ui-check aborted: ' + (e && e.message ? e.message : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  vite.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 500));
  if (vite.exitCode === null) vite.kill('SIGKILL');
}
console.log(`\nui-check: ${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
