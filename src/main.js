import * as THREE from 'three';
import { buildTerrain, setStage } from './terrain.js';
import { SegmentSet, makeShadowPool } from './render/segments.js';
import { BodyRenderer } from './render/bodies.js';
import { StageRenderer } from './render/stageRender.js';
import { FX } from './render/fx.js';
import { World, isActive } from './sim/world.js';
import { Projectiles } from './sim/projectiles.js';
import { buildStage, STAGE_NAMES, F_BRIDGE, F_WALL, F_TOWER, F_GATE } from './sim/stage.js';
import { Nav } from './sim/nav.js';
import { Engineering } from './sim/engineering.js';
import { Command } from './sim/command.js';
import { buildScenario, SIZES } from './scenario.js';
import { CameraRig } from './camera.js';
import { K_INF, K_ENG, TYPES, WEAPONS } from './sim/defs.js';
import { Sound } from './sound.js';
import { Weather, WEATHER } from './weather.js';
import { Objective, MODES } from './sim/objective.js';
import { Minimap } from './minimap.js';

const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ params
const params = new URLSearchParams(location.search);
let sizeKey = params.get('size') || 'M';
if (!SIZES[sizeKey]) sizeKey = 'M';
let stageKind = params.get('stage') || 'field';
if (!STAGE_NAMES[stageKind]) stageKind = 'field';
$('sSize').value = sizeKey;
$('sStage').value = stageKind;
const seedVal = Number(params.get('seed')) || 7;
$('sSeed').value = seedVal;
const diffVal = ['easy', 'normal', 'hard'].includes(params.get('diff')) ? params.get('diff') : 'normal';
$('sDiff').value = diffVal;
$('stageTitle').textContent = '古代会戦シミュレーター ― ' + STAGE_NAMES[stageKind];

// ------------------------------------------------------------------ renderer
const container = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Fog(0xc9c2ac, 180, 950);
scene.fog = FOG;
scene.background = new THREE.Color(0xc9c2ac);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 2500);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6a5a3a, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
sun.position.set(-120, 160, 80);
scene.add(sun);
let skyMat, weather;
{
  const g = new THREE.SphereGeometry(2000, 24, 12);
  const mat = skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x5f86c0) }, bottom: { value: new THREE.Color(0xc9c2ac) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ float t = smoothstep(-0.02, 0.35, h); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  const sky = new THREE.Mesh(g, mat);
  sky.renderOrder = -1;
  sky.onBeforeRender = () => sky.position.copy(camera.position);
  scene.add(sky);
}

// ------------------------------------------------------------------ stage & world
const stage = buildStage(stageKind, SIZES[sizeKey]);
setStage(stage);
const nav = new Nav(stage);
const terrain = buildTerrain(scene, stage);
const stageR = new StageRenderer(scene, stage);

const capK = Math.max(1, SIZES[sizeKey]) * 1.3;
const dyn = new SegmentSet(scene, { box: Math.round(60000 * capK), taper: Math.round(9000 * capK), cyl: Math.round(12000 * capK) });
const stat = new SegmentSet(scene, { box: Math.round(50000 * capK), taper: Math.round(7000 * capK), cyl: Math.round(8000 * capK) });
const shadows = makeShadowPool(scene, Math.round(5000 * capK));
const fx = new FX(scene);
fx.setFog(FOG);
const bodies = new BodyRenderer(dyn, stat, shadows);
const sound = new Sound();

const world = new World(stage, nav);
world.difficulty = diffVal;
world.proj = new Projectiles();
world.fx = fx;
world.engineering = new Engineering(world);
world.command = new Command(world);
buildScenario(world, stageKind, sizeKey, seedVal);
world.command.setup();
world.objective = new Objective(world, MODES[params.get('mode')] ? params.get('mode') : 'annihilate', world.builder);
$('sMode').value = world.objective.mode;
world.auto[0] = $('cAuto').checked;
{
  const wk = WEATHER[params.get('weather')] ? params.get('weather') : 'clear';
  weather = new Weather({ scene, fog: FOG, hemi, sun, skyMat, camera, fx, world, sound });
  weather.set(wk);
  weather.update(100); // jump straight to the chosen weather
  $('sWeather').value = wk;
  $('sWeather').onchange = e => {
    weather.set(e.target.value);
    musicCtx();
    const u = new URL(location.href); u.searchParams.set('weather', e.target.value); history.replaceState(null, '', u);
  };
}
// tell the music system where and in what weather this battle is fought
function musicCtx() {
  if (sound.setMusicContext) sound.setMusicContext({ family: stage.kind, stage: stageKind, weather: weather ? weather.key : $('sWeather').value, seed: seedVal });
}
musicCtx();
world.on((type, data) => onWorldEvent(type, data));
// big battles step the simulation at 30 Hz
const simStep = world.agents.length > 6000 ? 1 / 30 : 1 / 60;

const rig = new CameraRig(camera, renderer.domElement);
// before the battle the camera always looks down on the whole field; the chosen mode
// (cinematic by default, ?cam=free or follow) takes over when the battle starts
let battleCam = ['free', 'follow', 'cine', 'overview'].includes(params.get('cam')) ? params.get('cam') : 'cine';
$('sCam').value = battleCam;
rig.setMode('overview', world);
// the overview sits far back: push the haze away with it so the field stays clear
const overviewFog = () => (rig.mode === 'overview' ? Math.max(1, (rig.dist * 1.7) / weather.cur.far) : 1);
weather.fogScale = weather.fogScaleTarget = overviewFog();
weather.apply();
function setCam(m) {
  $('sCam').value = m;
  if (world.phase === 'deploy') battleCam = m; // remembered for the start
  else rig.setMode(m, world);
}
// minimap: click / drag jumps the free camera to that point of the field
const minimap = new Minimap($('minimap'), world, () => world.objective, () => rig.target);
let mmDrag = false;
function mmJump(e) {
  const p = minimap.worldFromEvent(e);
  if (!p) return;
  rig.setMode('free', world); $('sCam').value = 'free';
  rig.target.set(p.x, 0, p.z);
}
$('minimap').addEventListener('pointerdown', e => { mmDrag = true; mmJump(e); });
window.addEventListener('pointermove', e => { if (mmDrag) mmJump(e); });
window.addEventListener('pointerup', () => { mmDrag = false; });
const selection = new Set();
let paused = false, timeScale = 1, slowmo = false, deployT = 0;
const autoStart = params.get('autostart');
let soldier = null;

// ------------------------------------------------------------------ events
const bannerEl = $('banner');
let bannerT = 0;
function banner(text, t = 2.5) { bannerEl.textContent = text; bannerEl.style.opacity = 1; bannerT = t; }
const logEl = $('log');
function log(text) {
  const d = document.createElement('div');
  d.textContent = text;
  logEl.appendChild(d);
  while (logEl.children.length > 5) logEl.removeChild(logEl.firstChild);
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1200); }, 5000);
}
const teamName = t => (t === 0 ? '軍団' : '東方王国');
// battle timeline for the results screen: { t: elapsed seconds, text }
const timeline = [];
let lastIgniteT = -1e9;
function noteTimeline(text) { timeline.push({ t: world.elapsed(), text }); if (timeline.length > 200) timeline.shift(); }
function onWorldEvent(type, data) {
  sound.event(type, data, camera);
  switch (type) {
    case 'start': banner('開 戦'); break;
    case 'gatebreak': banner('城門突破', 3); noteTimeline('城門突破'); break;
    case 'reinforce': { const s = `${teamName(data.team)}の増援が到着: ${data.names.join('、')}`; log(s); noteTimeline(s); banner('増援到着', 2.5); break; }
    case 'bridge': log(`${data.name}が落とされた`); break;
    case 'pontoon': log('舟橋が架かった'); break;
    case 'ladder': log('城壁に梯子が掛けられた'); break;
    case 'ladderfall': log('梯子が押し倒された'); break;
    case 'generaldeath': { const s = `${teamName(data.team)}の総大将 ${data.crew[0].name} 討死`; banner(s, 4); noteTimeline(s); break; }
    case 'officerdeath': { const s = `${teamName(data.team)} ${data.reg.name} ${data.crew[0].name} 討死`; log(s); noteTimeline(s); break; }
    case 'captaindeath': if (data.team === 0) { const s = `${data.reg.name}の隊長 ${data.name} 戦死`; log(s); noteTimeline(s); } break;
    case 'standardlost': { const s = `${data.name}の軍旗が倒れた`; log(s); noteTimeline(s); break; }
    case 'standardraised': { const s = `${data.name}の軍旗が再び掲げられた`; log(s); noteTimeline(s); break; }
    case 'rout': { const s = `${teamName(data.team)} ${data.name} 潰走`; log(s); noteTimeline(s); break; }
    case 'rally': { const s = `${teamName(data.team)} ${data.name} 再集結`; log(s); noteTimeline(s); break; }
    case 'reserve': { const s = `${teamName(data.army.team)} ${data.name}が投入された`; log(s); noteTimeline(s); break; }
    case 'floodwarn': banner('上流の堰が決壊しそうだ', 3); log('上流の堰が決壊しそうだ'); noteTimeline('上流の堰が決壊しそうだ'); break;
    case 'flood': banner('洪水発生', 4); noteTimeline('洪水発生'); break;
    case 'quake': banner('地震', 2.5); noteTimeline('地震'); break;
    case 'rockfall': banner('落石! 隘路が塞がれた', 3.5); noteTimeline('落石! 隘路が塞がれた'); break;
    case 'rubbleclear': log('瓦礫が除去され隘路が開通'); noteTimeline('瓦礫が除去され隘路が開通'); break;
    case 'icecrack': log('氷が割れた'); noteTimeline('氷が割れた'); break;
    case 'galley': banner('敵ガレー船が接舷', 3); noteTimeline('敵ガレー船が接舷'); break;
    case 'ignite':
      // timeline only, throttled: a spreading fire would flood the list
      if (world.elapsed() - lastIgniteT >= 10) { lastIgniteT = world.elapsed(); noteTimeline('火災が発生した'); }
      break;
    case 'escortexit': log('輜重車が到着'); noteTimeline('輜重車が到着'); break;
    case 'escortlost': log('輜重車が失われた'); noteTimeline('輜重車が失われた'); break;
  }
}

// ------------------------------------------------------------------ UI
$('bStart').onclick = () => startBattle();
$('bPause').onclick = () => togglePause();
$('sSpeed').onchange = e => { timeScale = Number(e.target.value); slowmo = false; };
$('sCam').onchange = e => setCam(e.target.value);
$('cAuto').onchange = e => { world.auto[0] = e.target.checked; };
// background music: on by default, starts with the first click / key press (browsers block audio before that)
{
  let saved = null;
  try { saved = localStorage.getItem('legiomachia.bgm'); } catch (e) { /* storage may be blocked */ }
  if (saved !== null) $('cBgm').checked = saved === '1';
  sound.setMusic($('cBgm').checked);
  $('cBgm').onchange = e => {
    sound.setMusic(e.target.checked); sound.unlock();
    try { localStorage.setItem('legiomachia.bgm', e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ }
  };
}
// the full parameter set of this battle, as a shareable URL
function buildShareURL() {
  const u = new URL(location.href);
  u.searchParams.set('size', $('sSize').value);
  u.searchParams.set('stage', $('sStage').value);
  u.searchParams.set('weather', $('sWeather').value);
  u.searchParams.set('mode', $('sMode').value);
  u.searchParams.set('seed', $('sSeed').value || '7');
  u.searchParams.set('cam', $('sCam').value);
  u.searchParams.set('diff', $('sDiff').value);
  return u.toString();
}
const reload = () => { location.href = buildShareURL(); };
$('sSize').onchange = reload;
$('sStage').onchange = reload;
$('sMode').onchange = reload;
$('sSeed').onchange = reload;
$('sDiff').onchange = reload;
$('bReset').onclick = reload;
$('cPerf').onchange = e => { $('perfHud').hidden = !e.target.checked; };
$('bCloseResults').onclick = () => { $('results').hidden = true; };
$('bRematch').onclick = () => { location.href = buildShareURL(); };
$('bCopy').onclick = async () => {
  const url = buildShareURL();
  try { await navigator.clipboard.writeText(url); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) { window.prompt('この戦いのURL', url); }
    ta.remove();
  }
  $('bCopy').textContent = 'コピー済み';
  setTimeout(() => { $('bCopy').textContent = 'この戦いのURLをコピー'; }, 2000);
};
$('help').dataset.full = $('help').innerHTML;
{
  const toggle = () => {
    const h = $('help');
    const min = h.classList.toggle('min');
    h.innerHTML = min ? '<span id="helpToggle">[操作説明]</span>' : h.dataset.full;
    $('helpToggle').onclick = toggle;
  };
  $('helpToggle').onclick = toggle;
}
document.querySelectorAll('#selPanel button[data-o]').forEach(b => { b.onclick = () => issueOrder(b.dataset.o); });
document.querySelectorAll('#selPanel button[data-f]').forEach(b => { b.onclick = () => { for (const r of mySel()) world.issue(r, 'formation', b.dataset.f); }; });
document.querySelectorAll('#selPanel button[data-t]').forEach(b => { b.onclick = () => engineerTask(b.dataset.t); });

// strength snapshots taken when the battle opens, for the results screen
let startCounts = null, startRegInitial = null;
function startBattle() {
  sound.unlock();
  if (world.phase === 'deploy' && battleCam !== 'overview') rig.setMode(battleCam, world);
  if (!startCounts) { startCounts = world.counts(); startRegInitial = world.regs.map(r => r.initial); }
  world.start();
  $('bStart').disabled = true;
}

const fmtTime = s => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const agentName = a => a.name || (a.crew && a.crew[0] && a.crew[0].name) || '―';
// fill and show the battle-end panel (#results)
function showResults(res) {
  if (sound.gameOver) sound.gameOver(res.winner === 0);
  const c = world.counts();
  const obj = world.objective;
  $('resTitle').textContent = res.text;
  let meta = `勝者: ${teamName(res.winner)} ・ 経過 ${fmtTime(world.elapsed())} ・ シード ${seedVal} ・ 難易度 ${$('sDiff').selectedOptions[0].textContent}`;
  if (obj) {
    if (obj.escaped) meta += ` ・ 離脱 ${obj.escaped}名`;
    const wg = obj.wagons;
    if (wg && !Array.isArray(wg) && (wg.arrived || wg.lost)) meta += ` ・ 輜重車 到着 ${wg.arrived || 0} / 喪失 ${wg.lost || 0}`;
    else if (obj.wagonEscaped || obj.wagonLost) meta += ` ・ 輜重車 到着 ${obj.wagonEscaped || 0} / 喪失 ${obj.wagonLost || 0}`;
  }
  $('resMeta').textContent = meta;
  const sc = startCounts || c;
  $('resArmies').innerHTML = [0, 1].map(t =>
    `<div><span class="${t === 0 ? 'red' : 'blue'}">■ ${teamName(t)}</span> 開始時 ${sc[t]} ・ 残存 ${c[t]} ・ 損失 ${Math.max(0, sc[t] - c[t])}</div>`).join('')
    + '<div class="small">※増援・輜重車など途中から加わった兵は開始時に含まれません</div>';
  // MVP: most kills among all agents, the dead included; if nobody killed, the
  // strongest front-rank survivor instead
  let mvp = null, mk = -1;
  for (const a of world.agents) { const k = a.kills || 0; if (k > mk) { mk = k; mvp = a; } }
  if (mvp && mk > 0) {
    $('resMvp').textContent = `殊勲者: ${agentName(mvp)} (${mvp.reg ? mvp.reg.name : ''}) ― ${mk}名を討ち取り${mvp.state === 3 ? '、戦死' : ''}`;
  } else {
    let best = null, bs = -1;
    for (const a of world.agents) {
      if (!isActive(a) || !a.stats || !a.reg || !(a.slot < a.reg.cols)) continue;
      const s = a.stats.str + a.stats.def + a.stats.vit;
      if (s > bs) { bs = s; best = a; }
    }
    $('resMvp').textContent = best ? `殊勲者: ${agentName(best)} (${best.reg.name}) ― 前列で戦い抜いた強兵` : '';
  }
  let rh = '<table><tr><th>部隊</th><th>軍</th><th>兵種</th><th class="n">開始時</th><th class="n">残存</th><th>状態</th></tr>';
  for (const r of world.regs) {
    const init = startRegInitial ? (startRegInitial[r.id] ?? r.initial) : r.initial;
    const state = r.alive === 0 ? '全滅' : r.order === 'rout' ? '潰走' : '健在';
    rh += `<tr><td>${r.name}</td><td>${teamName(r.team)}</td><td>${TYPES[r.type].name}</td><td class="n">${init}</td><td class="n">${r.alive}</td><td>${state}</td></tr>`;
  }
  $('resRegs').innerHTML = rh + '</table>';
  let th = '<table>';
  for (const e of timeline.slice(-40)) th += `<tr><td>${fmtTime(e.t)}</td><td>${e.text}</td></tr>`;
  $('resTimeline').innerHTML = th + '</table>';
  $('results').hidden = false;
}
function togglePause() { paused = !paused; $('bPause').textContent = paused ? '再開 (Space)' : '一時停止 (Space)'; }

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
  sound.unlock();
  switch (e.code) {
    case 'Enter': startBattle(); break;
    case 'KeyM': $('cBgm').click(); break;
    case 'Space': togglePause(); e.preventDefault(); break;
    case 'Digit1': setCam('free'); break;
    case 'Digit2': setCam('follow'); break;
    case 'Digit3': setCam('cine'); break;
    case 'Digit4': setCam('overview'); break;
    case 'KeyZ': slowmo = !slowmo; break;
    case 'KeyH': issueOrder('hold'); break;
    case 'KeyC': issueOrder('charge'); break;
    case 'KeyV': issueOrder('advance'); break;
    case 'KeyX': issueOrder('fire'); break;
    case 'KeyB': issueOrder('retreat'); break;
    case 'KeyT': {
      const a = pickAgent(mouse.x, mouse.y, 40, null);
      if (a) { rig.followAgent(a); $('sCam').value = 'follow'; }
      break;
    }
    case 'Tab': {
      e.preventDefault();
      const mine = world.regs.filter(r => r.team === 0 && r.alive > 0);
      if (!mine.length) break;
      const cur = [...selection][0];
      const i = (mine.indexOf(cur) + 1) % mine.length;
      selectRegs([mine[i]]);
      rig.setMode('free', world); $('sCam').value = 'free';
      rig.target.set(mine[i].cx, 0, mine[i].cz);
      break;
    }
  }
});

// ------------------------------------------------------------------ picking & commands
const mouse = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const v3 = new THREE.Vector3();
function groundAt(sx, sy) {
  const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // march along the ray against the stage height field (walls & bridges included)
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  let prev = 0;
  for (let t = 1; t < 1500; t += t < 100 ? 0.5 : 2) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y <= stage.floorAt(x, z)) {
      // refine
      let a = prev, b = t;
      for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (o.y + d.y * m <= stage.floorAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      return new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
    }
    prev = t;
  }
  return null;
}
function toScreen(x, y, z) {
  v3.set(x, y, z).project(camera);
  if (v3.z > 1) return null;
  return [(v3.x + 1) / 2 * window.innerWidth, (1 - v3.y) / 2 * window.innerHeight];
}
function pickAgent(sx, sy, radiusPx, team) {
  let best = null, bd = radiusPx;
  for (const a of world.agents) {
    if (!isActive(a)) continue;
    if (team !== null && a.team !== team) continue;
    const s = toScreen(a.x, a.y + (a.kind === K_INF ? 1 : 1.8), a.z);
    if (!s) continue;
    const d = Math.hypot(s[0] - sx, s[1] - sy);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}
const mySel = () => [...selection].filter(r => r.team === 0 && r.alive > 0);
function selectRegs(regs, add = false) {
  if (!add) selection.clear();
  for (const r of regs) selection.add(r);
  updateSelPanel(); treeDirty = true;
}

let dragStart = null, rDown = null;
const dragBox = $('dragBox');
// touch tap (short, nearly still single touch) acts as a left-click selection;
// the camera rig's touch handlers preventDefault, so no synthetic mouse events follow
let tapInfo = null;
renderer.domElement.addEventListener('touchstart', e => {
  tapInfo = e.touches.length === 1 ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, t: performance.now() } : null;
}, { passive: true });
renderer.domElement.addEventListener('touchend', e => {
  if (!tapInfo) return;
  const t = e.changedTouches[0];
  const moved = Math.hypot(t.clientX - tapInfo.x, t.clientY - tapInfo.y);
  const dt = performance.now() - tapInfo.t;
  tapInfo = null;
  if (moved >= 10 || dt >= 350) return;
  e.preventDefault();
  const a = pickAgent(t.clientX, t.clientY, 40, null);
  if (a) { selectRegs([a.reg]); soldier = a; }
}, { passive: false });
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
renderer.domElement.addEventListener('mousedown', e => {
  sound.unlock();
  if (e.button === 0 && !e.altKey) dragStart = { x: e.clientX, y: e.clientY };
  if (e.button === 2) rDown = { x: e.clientX, y: e.clientY, p: groundAt(e.clientX, e.clientY) };
});
window.addEventListener('mousemove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (dragStart && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 6) {
    dragBox.hidden = false;
    const x0 = Math.min(dragStart.x, e.clientX), y0 = Math.min(dragStart.y, e.clientY);
    Object.assign(dragBox.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - dragStart.x) + 'px', height: Math.abs(e.clientY - dragStart.y) + 'px' });
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0 && dragStart) {
    const moved = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 6;
    if (moved) {
      const x0 = Math.min(dragStart.x, e.clientX), x1 = Math.max(dragStart.x, e.clientX);
      const y0 = Math.min(dragStart.y, e.clientY), y1 = Math.max(dragStart.y, e.clientY);
      const regs = new Set();
      for (const a of world.agents) {
        if (!isActive(a) || a.team !== 0) continue;
        const s = toScreen(a.x, a.y + 1, a.z);
        if (s && s[0] >= x0 && s[0] <= x1 && s[1] >= y0 && s[1] <= y1) regs.add(a.reg);
      }
      selectRegs([...regs], e.shiftKey);
    } else {
      const a = pickAgent(e.clientX, e.clientY, 25, null);
      if (a) { selectRegs([a.reg], e.shiftKey); soldier = a; }
      else if (!e.shiftKey) { selectRegs([]); soldier = null; }
    }
    dragStart = null; dragBox.hidden = true;
  }
  if (e.button === 2 && rDown) {
    rightClick(e);
    rDown = null;
  }
});

function rightClick(e) {
  const mine = mySel();
  if (!mine.length) return;
  const engs = mine.filter(r => r.type === 'engineer');
  const others = mine.filter(r => r.type !== 'engineer');
  const p = rDown.p;
  const enemy = pickAgent(e.clientX, e.clientY, 22, 1);
  const moved = Math.hypot(e.clientX - rDown.x, e.clientY - rDown.y) > 12;
  // engineers: context sensitive works
  if (engs.length && p && !enemy) {
    const fl = stage.flagAt(p.x, p.z);
    for (const r of engs) {
      if (stage.river && stage.WL - stage.floorAt(p.x, p.z) > 0.5 && !(fl & F_BRIDGE)) world.issue(r, 'task', { type: 'pontoon', x: p.x });
      else if (fl & F_BRIDGE) { const b = stage.bridges.find(b => p.x > b.x0 - 1 && p.x < b.x1 + 1); if (b) world.issue(r, 'task', { type: 'demolish', bridge: b }); }
      else if (stage.city && (fl & (F_WALL | F_TOWER) || (p.z > stage.city.z0 - 8 && p.z < stage.city.z0 && Math.abs(p.x) < stage.city.L))) world.issue(r, 'task', { type: 'ladder', xs: [p.x] });
      else world.issue(r, 'task', { type: 'stakes', x: p.x, z: p.z, facing: Math.atan2(world.armies[0].fwdX, world.armies[0].fwdZ) });
    }
    if (!others.length) return;
  }
  const regs = engs.length && p && !enemy ? others : mine;
  if (enemy && !moved) {
    for (const r of regs) {
      const W = r.kind === K_INF ? WEAPONS[r.T.weapon] : null;
      if (W && W.ranged && !W.ranged.ammo) world.issue(r, 'fire', enemy.reg);
      else world.issue(r, 'charge', enemy.reg);
    }
  } else if (p) {
    let facing;
    if (moved) {
      const p2 = groundAt(e.clientX, e.clientY);
      if (p2) facing = Math.atan2(p2.x - p.x, p2.z - p.z);
    }
    let mx = 0, mz = 0;
    for (const r of regs) { mx += r.cx; mz += r.cz; }
    mx /= regs.length; mz /= regs.length;
    if (facing === undefined) facing = Math.atan2(p.x - mx, p.z - mz);
    let f0 = facing;
    if (regs.length > 1) { let x = 0, z = 0; for (const r of regs) { x += Math.sin(r.facing); z += Math.cos(r.facing); } f0 = Math.atan2(x, z); }
    const da = facing - f0, c = Math.cos(da), s = Math.sin(da);
    for (const r of regs) {
      const ox = r.cx - mx, oz = r.cz - mz;
      const rx = ox * c + oz * s, rz = -ox * s + oz * c;
      world.issue(r, 'move', p.x + rx, p.z + rz, facing);
    }
  }
  updateSelPanel();
}

function engineerTask(t) {
  for (const r of mySel()) {
    if (t === 'ram') { if (r.type === 'ram') world.issue(r, 'task', { type: 'ram' }); continue; }
    if (r.type !== 'engineer') continue;
    if (t === 'stakes') {
      const f = Math.atan2(world.armies[0].fwdX, world.armies[0].fwdZ);
      world.issue(r, 'task', { type: 'stakes', x: r.cx + Math.sin(f) * 25, z: r.cz + Math.cos(f) * 25, facing: f });
    } else if (t === 'ladder' && stage.city) world.issue(r, 'task', { type: 'ladder', xs: [r.cx - 8, r.cx + 8] });
    else if (t === 'pontoon' && stage.river) world.issue(r, 'task', { type: 'pontoon', x: r.cx });
    else if (t === 'demolish' && stage.river) {
      const b = stage.bridges.filter(b => b.alive && b.wood).sort((a, c) => Math.abs(a.cx - r.cx) - Math.abs(c.cx - r.cx))[0];
      if (b) world.issue(r, 'task', { type: 'demolish', bridge: b });
    }
    else if (t === 'ignite') {
      const f = Math.atan2(world.armies[0].fwdX, world.armies[0].fwdZ);
      world.issue(r, 'task', { type: 'ignite', x: r.cx + Math.sin(f) * 20, z: r.cz + Math.cos(f) * 20 });
    }
    else if (t === 'clear') world.issue(r, 'task', { type: 'clear' });
  }
}

function issueOrder(o) {
  for (const r of mySel()) {
    if (o === 'ai') { world.issue(r, 'ai'); r.manual = false; continue; }
    if (o === 'hold') world.issue(r, 'hold');
    else if (o === 'charge' || o === 'fire') {
      const e = world.nearestEnemyReg(r);
      if (!e) continue;
      const W = r.kind === K_INF ? WEAPONS[r.T.weapon] : null;
      world.issue(r, W && W.ranged && !W.ranged.ammo ? 'fire' : 'charge', e);
    } else if (o === 'advance' || o === 'retreat') {
      const d = o === 'advance' ? 30 : -30;
      world.issue(r, 'move', r.cx + Math.sin(r.facing) * d, r.cz + Math.cos(r.facing) * d, r.facing);
    }
  }
  if (world.phase === 'deploy' && (o === 'charge' || o === 'advance' || o === 'fire')) startBattle();
  updateSelPanel();
}

const ORDER_JP = { hold: '待機', move: '移動中', charge: '突撃', fire: '射撃', rout: '潰走', dead: '全滅' };
function updateSelPanel() {
  const p = $('selPanel');
  if (!selection.size) { p.hidden = true; return; }
  p.hidden = false;
  const regs = [...selection];
  if (regs.length === 1) {
    const r = regs[0];
    const wing = r.wing ? r.wing.name : '';
    const task = r.task ? ` 作業:${{ stakes: '杭', ladders: '梯子', demolish: '橋破壊', pontoon: '舟橋', ignite: '放火', clear: '瓦礫除去' }[r.task.type] || ''}` : '';
    $('selName').textContent = `${r.team === 0 ? '【自軍】' : '【敵軍】'}${r.name}  (${wing})`;
    $('selInfo').textContent = `${TYPES[r.type].name}  ${r.alive}/${r.initial}  士気 ${(r.morale * 100 | 0)}  疲労 ${((1 - r.stamina) * 100 | 0)}  命令: ${ORDER_JP[r.order] || r.order}${r.charging ? '(交戦)' : ''}${r.pendingOrder ? ' ←伝令中' : ''}${task}  ${r.manual ? '手動' : 'AI'}`;
  } else {
    $('selName').textContent = `${regs.length} 部隊を選択`;
    $('selInfo').textContent = regs.map(r => `${r.name}(${r.alive})`).join(' / ');
  }
  const mine = regs.some(r => r.team === 0);
  p.querySelectorAll('button').forEach(b => { b.disabled = !mine; });
  $('engOrders').hidden = !regs.some(r => r.team === 0 && (r.type === 'engineer' || r.type === 'ram'));
}

// ------------------------------------------------------------------ army tree
let treeDirty = true, treeTeam = 0;
function bar(v, cls = '') { return `<span class="bar ${cls}"><i style="width:${Math.max(0, Math.min(1, v)) * 100}%"></i></span>`; }
function renderTree() {
  const el = $('tree');
  el.style.top = ($('top').getBoundingClientRect().bottom + 4) + 'px';
  const army = world.armies[treeTeam];
  if (!army) return;
  let h = `<div class="tabs"><button data-team="0">${treeTeam === 0 ? '▶' : ''}軍団</button><button data-team="1">${treeTeam === 1 ? '▶' : ''}東方王国</button></div>`;
  const g = army.general;
  const gAlive = world.commanderAlive(g);
  h += `<div class="army" data-army="1">総大将 ${g ? g.crew[0].name : ''} ${gAlive ? bar(g.crew[0].hp / g.crew[0].maxHp) : '<span style="color:#c66">討死</span>'}</div>`;
  for (const wing of army.wings) {
    const c = wing.commander;
    const alive = !c || world.commanderAlive(c);
    const name = c ? c.crew[0].name : '';
    h += `<div class="wing ${alive ? '' : 'dead'}" data-wing="${wing.name}">${wing.name}${c ? ' ― ' + name : ''}${wing.role === 'reserve' && !wing.committed ? ' (予備)' : ''}</div>`;
    for (const r of wing.regs) {
      if (r.T.commander) continue;
      const sea = r.aboard ? r.aboard.length : 0; // still aboard ship (harbour landing)
      const cls = r.alive === 0 && !sea ? 'dead' : r.order === 'rout' ? 'rout' : '';
      h += `<div class="reg ${cls} ${selection.has(r) ? 'sel' : ''}" data-reg="${r.id}"><span class="n">${r.name}</span><span>${sea ? `${r.alive}<span class="small">+船${sea}</span>` : r.alive}</span>${bar((r.alive + sea) / r.initial)}${bar(r.morale, 'm')}</div>`;
    }
  }
  el.innerHTML = h;
}
$('tree').addEventListener('click', e => {
  const t = e.target.closest('[data-team],[data-army],[data-wing],[data-reg]');
  if (!t) return;
  if (t.dataset.team !== undefined) { treeTeam = Number(t.dataset.team); treeDirty = true; return; }
  const army = world.armies[treeTeam];
  let regs = [];
  if (t.dataset.army) regs = world.regs.filter(r => r.team === treeTeam && r.alive > 0);
  else if (t.dataset.wing) { const w = army.wings.find(w => w.name === t.dataset.wing); regs = w ? w.regs.filter(r => r.alive > 0) : []; }
  else { const r = world.regs[Number(t.dataset.reg)]; if (r) regs = [r]; }
  selectRegs(regs, e.shiftKey);
  if (regs.length === 1 && !e.shiftKey) { rig.setMode('free', world); $('sCam').value = 'free'; rig.target.set(regs[0].cx, 0, regs[0].cz); }
});

// ------------------------------------------------------------------ soldier card
function renderSoldier() {
  const el = $('soldier');
  const a = soldier;
  if (!a) { el.hidden = true; return; }
  el.hidden = false;
  const human = a.kind === K_INF ? a : null;
  const rider = a.crew && a.crew[0];
  const st = human ? a.stats : rider ? rider.stats : a.stats;
  const name = human ? a.name : rider ? rider.name : '―';
  const role = a.rank === 3 ? '総大将' : a.rank === 2 ? '将' : a.captain ? '隊長' : a.bearer ? '旗手' : '兵';
  const W = human ? WEAPONS[a.weapon].name : rider ? WEAPONS[rider.weapon].name : '';
  const state = a.state === 3 ? '戦死' : a.state === 1 ? '転倒' : a.fleeing ? '逃走中' : a.swimming ? '泳いでいる' : a.climbing ? '梯子を登攀中' : a.target ? '交戦中' : '健在';
  const hp = human ? a.hp / a.maxHp : rider ? rider.hp / rider.maxHp : a.hp / a.maxHp;
  const row = (k, v, cls = '') => `<div class="row"><span>${k}</span>${bar(v, cls)}<span>${typeof v === 'number' ? Math.round(v * 100) : ''}</span></div>`;
  let h = `<div class="nm">${name}</div><div class="small">${a.reg.name} ・ ${TYPES[a.type].name} ・ ${role} ・ ${W}</div><div class="small">状態: ${state}</div>`;
  h += row('体格', (st.size - 0.8) / 0.4) + row('攻撃力', st.str / 100) + row('走力', st.spd / 100) + row('体力', st.vit / 100) + row('守備', st.def / 100) + row('胆力', st.mor / 100);
  h += '<hr style="border-color:#4a3c28">';
  h += row('HP', Math.max(0, hp)) + row('スタミナ', a.stamina) + row('士気', Math.max(0, Math.min(1, a.morale)), 'm');
  if (!human && a.kind !== K_ENG) h += row(a.kind === 1 ? (a.T.animal === 'camel' ? '駱駝' : '馬') : '本体', Math.max(0, a.hp / a.maxHp));
  el.innerHTML = h;
}

// ------------------------------------------------------------------ loop
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now(), fpsT = 0, fpsN = 0, fps = 0, uiT = 0, simMs = 0, renMs = 0, simAcc = 0;
// adaptive quality: Q0 best .. Q3 lightest; stepped by the FPS EMA every 2.5 s
let quality = 0, fpsEMA = 60, qualT = 0, goodEvals = 0, mmT = 0;
const QUAL_PR = [1.5, 1.25, 1.0, 0.85], QUAL_SKIP = [1, 1, 2, 3];
function applyQuality() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUAL_PR[quality]));
  bodies.poseSkip = QUAL_SKIP[quality];
}
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (world.phase === 'deploy') {
    deployT += rdt;
    if (autoStart !== null && deployT > Number(autoStart || 3)) startBattle();
  }
  const ts = timeScale * (slowmo ? 0.2 : 1);
  const t0 = performance.now();
  if (!paused) {
    simAcc += rdt * ts;
    let n = 0;
    if (simStep > 1 / 60) {
      while (simAcc >= simStep && n < 3) { world.update(simStep); simAcc -= simStep; n++; }
      if (n === 3) simAcc = 0;
    } else {
      // small battles: variable steps keep slow motion smooth
      const total = simAcc; simAcc = 0;
      const k = Math.max(1, Math.ceil(total / (1 / 60)));
      if (total > 0) for (let i = 0; i < Math.min(k, 4); i++) world.update(total / k);
    }
  }
  const t1 = performance.now();
  rig.update(rdt, world);
  // the water surface follows the stage's live water level (flood stage raises it)
  const waterMesh = terrain.group.userData.water;
  if (waterMesh) waterMesh.position.y = stage.WL;
  // earthquake shake: render-only jitter on top of the rig's camera position
  if (world.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * world.shake * 1.2;
    camera.position.y += (Math.random() - 0.5) * world.shake * 0.8;
  }
  weather.fogScaleTarget = overviewFog();
  camera.updateMatrixWorld();
  bodies.emit(world, camera, selection, stageR);
  fx.uScale.value = window.innerHeight * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  fx.flush();
  renderer.render(scene, camera);
  const t2 = performance.now();
  simMs = simMs * 0.9 + (t1 - t0) * 0.1; renMs = renMs * 0.9 + (t2 - t1) * 0.1;
  sound.update(rdt, world, camera, paused ? 0 : ts);
  weather.update(rdt);

  if (bannerT > 0) { bannerT -= rdt; if (bannerT <= 0) bannerEl.style.opacity = 0; }
  fpsN++; fpsT += rdt;
  if (fpsT > 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  // adaptive quality evaluation
  if (rdt > 0) fpsEMA = fpsEMA * 0.95 + (1 / rdt) * 0.05;
  qualT += rdt;
  if (qualT >= 2.5) {
    qualT = 0;
    if (fpsEMA < 42 && quality < 3) { quality++; goodEvals = 0; applyQuality(); }
    else if (fpsEMA > 57) { if (++goodEvals >= 3 && quality > 0) { quality--; goodEvals = 0; applyQuality(); } }
    else goodEvals = 0;
  }
  mmT += rdt;
  if (mmT >= 0.25) { mmT = 0; minimap.draw(); }
  uiT -= rdt;
  if (uiT <= 0) {
    uiT = 0.3;
    const c = world.counts();
    $('c0').textContent = c[0]; $('c1').textContent = c[1];
    $('stats').textContent = `FPS ${fps.toFixed(0)} ・ sim ${simMs.toFixed(1)}ms ・ draw ${renMs.toFixed(1)}ms ・ 表示 ${bodies.visibleCount}/${world.agents.length} ・ 飛翔体 ${world.proj.flying} ・ t=${world.time.toFixed(0)}s${slowmo ? ' ・ スロー' : ''}`;
    if (selection.size) updateSelPanel();
    renderTree(); renderSoldier();
    $('objective').textContent = world.objective.status();
    if (!$('perfHud').hidden) {
      $('perfHud').textContent = `FPS ${fps.toFixed(0)} (EMA ${fpsEMA.toFixed(0)})\nsim ${simMs.toFixed(1)}ms ・ draw ${renMs.toFixed(1)}ms\n生存 ${c[0] + c[1]} ・ 画質 Q${quality} ・ pixelRatio ${renderer.getPixelRatio().toFixed(2)}`;
    }
    if (world.phase === 'battle' && !world.ended) {
      const res = world.objective.check(c);
      if (res) { world.ended = true; banner(res.text, 8); showResults(res); }
    }
  }
}
requestAnimationFrame(frame);

// debug handle for headless tests
window.__battle = {
  world, rig, camera, renderer, startBattle, stage, sound,
  advance(sec) { const n = Math.round(sec / simStep); const t = performance.now(); for (let i = 0; i < n; i++) world.update(simStep); return (performance.now() - t) / n; },
  view(x, z, dist, pitch, yaw) { rig.setMode('free'); rig.target.set(x, 0, z); rig.dist = dist; rig.pitch = pitch; if (yaw !== undefined) rig.yaw = yaw; rig.first = true; },
};
