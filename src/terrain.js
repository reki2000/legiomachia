import * as THREE from 'three';
import { smoothstep, rand, setSeed } from './util.js';
import { F_LADDER } from './sim/stage.js';

// The current stage provides the height field. Everything that stands on the
// ground asks these functions.
let STAGE = null;
export function setStage(s) { STAGE = s; }
export function getStage() { return STAGE; }

// walkable floor (terrain, walls, bridges, ladders...)
export function groundHeight(x, z) { return STAGE.floorAt(x, z); }
export function terrainHeight(x, z) { return STAGE.terrain(x, z); }
// floor under a point at height y: lets bodies falling beside a wall pass its face
export function floorBelow(x, z, y) {
  const f = STAGE.floorAt(x, z);
  if (y >= f - 0.6) return f;
  return STAGE.terrain(x, z);
}
export function waterLevel() { return STAGE.hasWater ? STAGE.WL : -1e9; }
// where a living body stands: on the floor, or treading water when it is deep
export function standHeight(x, z) {
  const f = STAGE.floorAt(x, z);
  if (STAGE.hasWater && STAGE.WL - f > 1.3) return STAGE.WL - 1.3;
  return f;
}
export function isLadder(x, z) { return (STAGE.flagAt(x, z) & F_LADDER) !== 0; }

export const WORLD_HALF = 500;

export function buildTerrain(scene, ps1Hook, stage) {
  setSeed(99);
  const group = new THREE.Group();
  const seg = 250;
  const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x6f8a3c), dry = new THREE.Color(0x9c9a55), dirt = new THREE.Color(0x8a7048);
  const rock = new THREE.Color(0x8a7f70), mud = new THREE.Color(0x5a4a34), sand = new THREE.Color(0xb0a070), paved = new THREE.Color(0x8c8272);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = stage.terrain(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.07) * Math.cos(z * 0.05) + Math.sin(x * 0.013 + z * 0.02);
    c.copy(grass).lerp(dry, 0.5 + 0.35 * n);
    const trample = Math.max(0, 1 - Math.abs(z) / 90) * Math.max(0, 1 - Math.abs(x) / (170 * stage.S));
    c.lerp(dirt, trample * 0.55 + rand() * 0.12);
    if (stage.hasWater) {
      const d = stage.WL - h;
      if (d > -0.6) c.lerp(sand, smoothstep(-0.6, 0.1, d));
      if (d > 0.3) c.lerp(mud, smoothstep(0.3, 1.5, d));
    }
    if (stage.city && stage.insideCity(x, z)) c.lerp(paved, 0.6);
    if (stage.id === 'canyon') c.lerp(rock, smoothstep(1.5, 9, h) * 0.85);
    c.multiplyScalar(0.92 + rand() * 0.12);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  ps1Hook(mat);
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  if (stage.hasWater) {
    const wg = new THREE.PlaneGeometry(WORLD_HALF * 2, 60, 100, 6);
    wg.rotateX(-Math.PI / 2);
    const wmat = new THREE.MeshLambertMaterial({ color: 0x3d6f8f, transparent: true, opacity: 0.78, flatShading: true });
    ps1Hook(wmat);
    const water = new THREE.Mesh(wg, wmat);
    // follow the meander
    const wp = wg.attributes.position;
    for (let i = 0; i < wp.count; i++) wp.setZ(i, wp.getZ(i) + stage.riverZ(wp.getX(i)));
    water.position.y = stage.WL;
    water.renderOrder = 1;
    group.add(water);
    group.userData.water = water;
  }

  buildScenery(group, ps1Hook, stage);
  scene.add(group);
  return { group, ground: mesh };
}

function buildScenery(group, ps1Hook, stage) {
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.5, 5).translate(0, 1.25, 0);
  const crownGeo = new THREE.ConeGeometry(2.2, 6, 6).translate(0, 5, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1.2, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028, flatShading: true });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f5f2a, flatShading: true });
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a8578, flatShading: true });
  [trunkMat, crownMat, rockMat].forEach(ps1Hook);
  const NT = 700, NR = 160;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, NT);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, NT);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, NR);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const clearX = 210 * stage.S, clearZ = stage.city ? stage.city.zb + 30 : 190;
  const keepOut = (x, z) => (Math.abs(x) < clearX && z > -190 && z < clearZ) ||
    (stage.hasWater && Math.abs(z - stage.riverZ(x)) < 22);
  let i = 0, guard = 0;
  while (i < NT && guard++ < 50000) {
    const x = (rand() * 2 - 1) * WORLD_HALF * 0.95, z = (rand() * 2 - 1) * WORLD_HALF * 0.95;
    const r = Math.hypot(x, z);
    if (keepOut(x, z)) continue;
    if (rand() > smoothstep(stage.flatR + 40, stage.flatR + 170, r) * 0.9 + 0.1) continue;
    const sc = 0.7 + rand() * 0.8;
    p.set(x, stage.terrain(x, z) - 0.2, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    s.set(sc, sc * (0.8 + rand() * 0.5), sc);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    col.setHSL(0.24 + rand() * 0.08, 0.35 + rand() * 0.2, 0.25 + rand() * 0.12);
    crowns.setColorAt(i, col);
    i++;
  }
  trunks.count = crowns.count = i;
  let nr = 0;
  for (let j = 0; j < NR * 3 && nr < NR; j++) {
    const x = (rand() * 2 - 1) * WORLD_HALF * 0.9, z = (rand() * 2 - 1) * WORLD_HALF * 0.9;
    if (keepOut(x, z) || (Math.abs(x) < 170 * stage.S && Math.abs(z) < 150)) continue;
    const sc = 0.4 + rand() * 1.6;
    p.set(x, stage.terrain(x, z) - 0.3 * sc, z);
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    s.set(sc, sc * 0.7, sc * 1.2);
    m.compose(p, q, s);
    rocks.setMatrixAt(nr++, m);
  }
  rocks.count = nr;
  group.add(trunks, crowns, rocks);

  const mGeo = new THREE.ConeGeometry(1, 1, 5);
  const mMat = new THREE.MeshLambertMaterial({ color: 0x7a8494, flatShading: true });
  ps1Hook(mMat);
  const NM = 40;
  const mountains = new THREE.InstancedMesh(mGeo, mMat, NM);
  for (let j = 0; j < NM; j++) {
    const a = (j / NM) * Math.PI * 2 + rand() * 0.1;
    const r = 700 + rand() * 150;
    const h = 90 + rand() * 140, w = 160 + rand() * 120;
    p.set(Math.cos(a) * r, h * 0.5 - 10, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
    s.set(w, h, w);
    m.compose(p, q, s);
    mountains.setMatrixAt(j, m);
    col.setHSL(0.6, 0.12, 0.45 + rand() * 0.1);
    mountains.setColorAt(j, col);
  }
  group.add(mountains);
}
