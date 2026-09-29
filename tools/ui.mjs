import { chromium } from 'playwright-core';
const out = process.argv[2];
const exe = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:5173/?size=S&stage=field');
await page.waitForFunction(() => window.__battle);
await page.evaluate(() => { const b = window.__battle; b.startBattle(); b.advance(20); b.view(-20, -30, 30, 0.35, 3.14); });
await page.waitForTimeout(1200);
// click a red soldier on screen
const p = await page.evaluate(() => {
  const b = window.__battle; b.camera.updateMatrixWorld();
  const a = b.world.agents.find(a => a.team === 0 && a.state === 0 && a.kind === 0 && Math.hypot(a.x + 20, a.z + 30) < 25);
  const v = b.camera.position.clone().set(a.x, a.y + 1, a.z).project(b.camera);
  return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
});
await page.mouse.click(p[0], p[1]);
await page.waitForTimeout(800);
// click a wing in the tree
const wing = await page.$('#tree .wing');
if (wing) await wing.click();
await page.waitForTimeout(600);
console.log('selected', await page.evaluate(() => document.getElementById('selName').textContent));
await page.keyboard.press('KeyV');
await page.waitForTimeout(700);
console.log('pending', await page.evaluate(() => window.__battle.world.pending.length));
await page.screenshot({ path: out });
console.log(errs.join('\n'));
await browser.close();
