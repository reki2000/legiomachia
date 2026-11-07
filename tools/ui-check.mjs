// Headless browser UI verification.
//
// Unlike tools/battle.mjs / tools/ui.mjs (which assume a vite server is
// already running on :5173 and a Playwright-bundled Chromium under
// ~/.cache/ms-playwright), this check is self-contained:
//   - it starts its own vite dev server on port 5199 and kills it at the end
//   - it launches the chrome-headless-shell build kept in the workspace
//     (override with the CHROME_PATH env var)
//
// Checks:
//   (a) ?size=S&stage=field loads, window.__battle appears, no pageerrors
//   (b) expansion UI exists: seed input #sSeed, difficulty select #sDiff,
//       minimap canvas #minimap, results panel #results
//   (c) the battle starts, advances 30 simulated seconds via
//       __battle.advance, and a forced objective result makes the results
//       panel visible
// Missing (b)/(c) elements are reported as WARN (pending integration — those
// panels are built by main.js/index.html, not by this tool); the check only
// FAILs on load failure or pageerrors. Two screenshots are written to /tmp:
//   /tmp/ui-check-results.png  (full page after the forced result)
//   /tmp/ui-check-minimap.png  (the minimap element, or its screen corner)
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
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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

let browser = null;
try {
  await waitForServer();
  pass(`vite dev server on ${BASE}`);

  browser = await chromium.launch({
    executablePath: exe,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
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
    if (els.sDiff) pass(`(b) difficulty select #sDiff present (<${els.sDiff}>)`); else warn('(b) difficulty select #sDiff missing');
    if (els.minimap === 'canvas') pass('(b) minimap canvas #minimap present'); else if (els.minimap) warn(`(b) #minimap present but is <${els.minimap}>, not <canvas>`); else warn('(b) minimap canvas #minimap missing');
    if (els.results) pass('(b) results panel #results present'); else warn('(b) results panel #results missing');

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
    await page.waitForTimeout(900); // let the main loop notice the result and show its panel/banner
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

    // screenshots: capture via CDP — page.screenshot() waits for the page to
    // go idle, which a continuously rendering WebGL battle never does, and
    // times out; Page.captureScreenshot takes the current frame as-is.
    const shot = async (path, clip) => {
      try {
        const cdp = await page.context().newCDPSession(page);
        const params = { format: 'png', captureBeyondViewport: false };
        if (clip) params.clip = { ...clip, scale: 1 };
        const { data } = await cdp.send('Page.captureScreenshot', params);
        writeFileSync(path, Buffer.from(data, 'base64'));
        await cdp.detach().catch(() => {});
      } catch {
        await page.screenshot({ path, ...(clip ? { clip } : {}), timeout: 20000 });
      }
    };
    await shot(SHOT_RESULT);
    pass(`screenshot: ${SHOT_RESULT}`);
    const mm = await page.$('#minimap');
    const box = mm ? await mm.boundingBox().catch(() => null) : null;
    if (box) await shot(SHOT_MINIMAP, { x: box.x, y: box.y, width: box.width, height: box.height });
    else await shot(SHOT_MINIMAP, { x: 960, y: 400, width: 320, height: 320 });
    pass(`screenshot: ${SHOT_MINIMAP}${box ? '' : ' (minimap element absent/unmeasurable: bottom-right corner clip instead)'}`);
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
