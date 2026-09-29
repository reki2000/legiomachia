// Headless: fast-forward the battle and take screenshots at given sim times.
// usage: node tools/battle.mjs out '[[t,x,z,dist,pitch,yaw,mode],...]' size stage
import { chromium } from 'playwright-core';
const [,, out = 'b', plan = '[]', size = 'M', stage = 'field'] = process.argv;
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:5173/?size=${size}&stage=${stage}`);
await page.waitForFunction(() => window.__battle, null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const h = document.getElementById('help'); if (h) h.style.display = 'none'; window.__battle && window.__battle.startBattle(); });
let t = 0, k = 0;
for (const step of JSON.parse(plan)) {
  const [st, x, z, dist, pitch, yaw, mode] = step;
  const ms = await page.evaluate(n => window.__battle.advance(n), st - t); t = st;
  await page.evaluate(([x, z, d, p, y, mode]) => {
    const b = window.__battle;
    const pick = f => { let best = null, bd = 1e9; for (const a of b.world.agents) { if (!f(a)) continue; const dd = Math.hypot(a.x - x, a.z - z); if (dd < bd) { bd = dd; best = a; } } return best; };
    let a = null;
    if (mode === 'melee') a = pick(a => a.state === 0 && a.kind === 0 && a.target && a.target.kind === 0 && a.tdist < 3);
    else if (mode === 'cav') a = pick(a => a.state === 0 && a.kind !== 0);
    else if (mode === 'dead') a = pick(a => a.state === 3 && a.kind === 0);
    else if (mode === 'type') a = pick(a2 => a2.state === 0 && a2.type === y);
    if (a) b.view(a.x, a.z, d, p, mode === 'type' ? 0.8 : y);
    else if (mode === 'cine' || mode === 'follow') b.rig.setMode(mode, b.world);
    else b.view(x, z, d, p, y);
  }, [x, z, dist, pitch, yaw, mode]);
  await page.waitForTimeout(mode === 'cine' || mode === 'follow' ? 2500 : 900);
  const info = await page.evaluate(() => {
    const w = window.__battle.world; const st = {}; for (const a of w.agents) st[a.state] = (st[a.state] || 0) + 1;
    return { counts: w.counts(), states: st };
  });
  console.log(st, 'ms/step', ms.toFixed(2), JSON.stringify(info));
  await page.screenshot({ path: `${out}_${k++}.png` });
}
console.log(errs.slice(0, 10).join('\n'));
await browser.close();
