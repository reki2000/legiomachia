// Meshes for stage structures (walls, towers, gate, houses, bridges) and the
// per-frame parts that move or appear during the battle (ladders, stakes, pontoons, debris).
import * as THREE from 'three';
import { rand, setSeed } from '../util.js';
import { col } from './segments.js';

const UP = new THREE.Vector3(0, 1, 0);
const C_WOOD = col(0x6e4e2e), C_WOOD2 = col(0x8a6a40), C_ROPE = col(0x9a8a60), C_DARK = col(0x3a2a1a);

export class StageRenderer {
  constructor(scene, stage, ps1Hook) {
    this.stage = stage;
    this.group = new THREE.Group();
    scene.add(this.group);
    setSeed(777);
    const boxes = []; // [cx, cy, cz, sx, sy, sz, color, rotY]
    const roofs = [];
    const add = (x0, y0, z0, x1, y1, z1, c) => boxes.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c]);
    this.gateMeshes = [];
    this.bridgeGroups = new Map();
    const stoneC = [0x9a8f7a, 0x958a74, 0xa39884];
    if (stage.city) {
      const C = stage.city, H = C.H;
      for (const s of stage.structs) {
        const c = stoneC[Math.floor(rand() * 3)];
        if (s.type === 'wall') {
          add(s.x0, -2, s.z0, s.x1, H, s.z1, c);
          // crenellations along the outer edges
          const alongX = s.x1 - s.x0 > s.z1 - s.z0;
          if (alongX) {
            const outer = s.z0 === C.z0 ? s.z0 : s.z1 - 0.5;
            for (let x = s.x0 + 0.5; x < s.x1 - 0.5; x += 2.2) add(x, H, outer, x + 1.1, H + 1.1, outer + 0.5, c);
          } else {
            const outer = s.x0 < 0 ? s.x0 : s.x1 - 0.5;
            for (let z = s.z0 + 0.5; z < s.z1 - 0.5; z += 2.2) add(outer, H, z, outer + 0.5, H + 1.1, z + 1.1, c);
          }
        } else if (s.type === 'tower') {
          add(s.x0, -2, s.z0, s.x1, H + 0.05, s.z1, 0x8c8270);
          for (let k = 0; k < 4; k++) {
            add(s.x0 + k * 2.2, H, s.z0, s.x0 + k * 2.2 + 1.2, H + 1.8, s.z0 + 0.6, 0x8c8270);
            add(s.x0, H, s.z0 + k * 2.2, s.x0 + 0.6, H + 1.8, s.z0 + k * 2.2 + 1.2, 0x8c8270);
            add(s.x1 - 0.6, H, s.z0 + k * 2.2, s.x1, H + 1.8, s.z0 + k * 2.2 + 1.2, 0x8c8270);
          }
        } else if (s.type === 'ramp') {
          for (let k = 0; k < 8; k++) add(s.x0 + k * 2, -1, s.z0, s.x0 + k * 2 + 2, H * (k + 1) / 8, s.z1, 0x8a8070);
        } else if (s.type === 'house') {
          const hc = [0xc8b898, 0xb8a888, 0xd0c0a0][Math.floor(rand() * 3)];
          add(s.x0, -1, s.z0, s.x1, s.h, s.z1, hc);
          roofs.push([(s.x0 + s.x1) / 2, s.h, (s.z0 + s.z1) / 2, (s.x1 - s.x0) * 0.75, 2.4, (s.z1 - s.z0) * 0.75]);
        }
      }
      // the gate: timber doors under an arch, hidden once broken
      for (const g of stage.gates) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0 - 0.3, H - 1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x5a3a1e, flatShading: true }));
        ps1Hook(m.material);
        m.position.set((g.x0 + g.x1) / 2, (H - 1.2) / 2, g.z0 + 0.6);
        const lint = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0, 1.4, g.z1 - g.z0), new THREE.MeshLambertMaterial({ color: 0x8c8270, flatShading: true }));
        ps1Hook(lint.material);
        lint.position.set((g.x0 + g.x1) / 2, H - 0.7, (g.z0 + g.z1) / 2);
        const bands = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0 - 0.2, 0.25, 0.9), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
        bands.position.set((g.x0 + g.x1) / 2, 1.5, g.z0 + 0.6);
        const bands2 = bands.clone(); bands2.position.y = 4;
        // stone filling the wall thickness around the doors, so the wall looks solid until the gate falls
        const body = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0, H + 2, g.z1 - g.z0), new THREE.MeshLambertMaterial({ color: 0x9a8f7a, flatShading: true }));
        ps1Hook(body.material);
        body.position.set((g.x0 + g.x1) / 2, (H - 2) / 2, (g.z0 + g.z1) / 2);
        const merl = [];
        for (let x = g.x0 + 0.5; x < g.x1 - 0.5; x += 2.2) {
          const mm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.5), body.material);
          mm.position.set(x + 0.55, H + 0.55, g.z0 + 0.25);
          merl.push(mm);
        }
        // the doors sit on the outer face, in front of the stone
        m.position.z = g.z0 - 0.1; bands.position.z = g.z0 - 0.1; bands2.position.z = g.z0 - 0.1;
        lint.visible = false;
        this.group.add(body, m, bands, bands2, ...merl);
        this.gateMeshes.push({ g, meshes: [body, m, bands, bands2, ...merl], broken: false });
      }
    }
    if (stage.trees && stage.trees.length) this.buildForest(stage.trees, ps1Hook);
    // moored boats: a tapered hull, a bench and a mast
    const hull = [];
    for (const d of stage.decor) {
      if (d.type !== 'boat') continue;
      const wl = stage.WL, cs = Math.cos(d.heading), sn = Math.sin(d.heading);
      const at = (k, w, y0, y1, c) => { // box centred k metres along the boat
        const px = d.x + sn * k, pz = d.z + cs * k;
        hull.push([px, (y0 + y1) / 2 + wl, pz, w, y1 - y0, 1.6, c, d.heading]);
      };
      for (let k = -3; k <= 3; k += 1.2) at(k, 2.3 - Math.abs(k) * 0.22, -0.5, 0.35, 0x5a3e24);
      at(0, 0.12, 0.2, 3.6, 0x4a3420);
    }
    if (hull.length) this.group.add(this.makeBoxes(hull, ps1Hook));
    if (stage.river) {
      for (const b of stage.bridges) {
        const grp = new THREE.Group();
        const bx = [];
        const addB = (x0, y0, z0, x1, y1, z1, c) => bx.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c]);
        for (let z = b.z0; z < b.z1; z += 2) {
          const zc = z + 1;
          const h = b.deck(b.cx, zc);
          if (b.wood) {
            addB(b.x0, h - 0.25, z + 0.05, b.x1, h, z + 1.95, 0x7a5a38);
            if (Math.abs(zc - b.zc) < stage.river.half + 1 && Math.round(z) % 4 === 0) {
              addB(b.x0 + 0.2, stage.WL - 3, zc - 0.2, b.x0 + 0.6, h, zc + 0.2, 0x5a4028);
              addB(b.x1 - 0.6, stage.WL - 3, zc - 0.2, b.x1 - 0.2, h, zc + 0.2, 0x5a4028);
            }
            addB(b.x0, h, z, b.x0 + 0.15, h + 0.9, z + 2, 0x6a4a2a);
            addB(b.x1 - 0.15, h, z, b.x1, h + 0.9, z + 2, 0x6a4a2a);
          } else {
            addB(b.x0, h - 1.0, z, b.x1, h, z + 2, 0x9a9080);
            addB(b.x0, h, z, b.x0 + 0.5, h + 0.8, z + 2, 0x8c8272);
            addB(b.x1 - 0.5, h, z, b.x1, h + 0.8, z + 2, 0x8c8272);
          }
        }
        if (!b.wood) {
          for (const dz of [-6, 0, 6]) addB(b.x0 + 0.5, -4, b.zc + dz - 1.2, b.x1 - 0.5, b.deck(b.cx, b.zc + dz) - 0.9, b.zc + dz + 1.2, 0x8a8070);
        }
        grp.add(this.makeBoxes(bx, ps1Hook));
        this.group.add(grp);
        this.bridgeGroups.set(b, grp);
      }
    }
    if (boxes.length) this.group.add(this.makeBoxes(boxes, ps1Hook));
    if (roofs.length) {
      const g = new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0xa0503a, flatShading: true });
      ps1Hook(mat);
      const im = new THREE.InstancedMesh(g, mat, roofs.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      roofs.forEach((r, i) => { p.set(r[0], r[1], r[2]); s.set(r[3] * 1.4, r[4], r[5] * 1.4); m.compose(p, q, s); im.setMatrixAt(i, m); });
      this.group.add(im);
    }
  }
  buildForest(trees, ps1Hook) {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3, 5).translate(0, 1.5, 0);
    const crownGeo = new THREE.ConeGeometry(1.7, 7, 6).translate(0, 5.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028, flatShading: true });
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x4a6e34, flatShading: true });
    ps1Hook(trunkMat); ps1Hook(crownMat);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      p.set(t.x, this.stage.terrain(t.x, t.z) - 0.2, t.z);
      q.setFromAxisAngle(up, rand() * 6.28);
      sc.set(t.s, t.s * (0.85 + rand() * 0.4), t.s);
      m.compose(p, q, sc);
      trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
      c.setHSL(0.25 + rand() * 0.07, 0.35 + rand() * 0.2, 0.26 + rand() * 0.14);
      crowns.setColorAt(i, c);
    });
    this.group.add(trunks, crowns);
  }
  makeBoxes(list, ps1Hook) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    ps1Hook(mat);
    const im = new THREE.InstancedMesh(g, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const c = new THREE.Color();
    list.forEach((b, i) => {
      p.set(b[0], b[1], b[2]); s.set(Math.max(0.01, b[3]), Math.max(0.01, b[4]), Math.max(0.01, b[5]));
      q.setFromAxisAngle(UP, b[7] || 0);
      m.compose(p, q, s); im.setMatrixAt(i, m);
      c.setHex(b[6]); c.multiplyScalar(0.94 + rand() * 0.12); im.setColorAt(i, c);
    });
    return im;
  }
  // structure changes (broken gate, destroyed bridge)
  sync() {
    for (const gm of this.gateMeshes) {
      if (!gm.g.alive && !gm.broken) { gm.broken = true; for (const m of gm.meshes) m.visible = false; }
    }
    for (const [b, grp] of this.bridgeGroups) grp.visible = b.alive;
  }

  emitDynamic(S, world, visible) {
    const st = this.stage, box = S.box;
    this.sync();
    // stakes: two crossed sharpened poles leaning at the enemy
    for (const s of st.stakes) {
      if (!s.alive || !visible(s.x, 0.6, s.z, 1.5)) continue;
      const fx = Math.sin(s.h !== undefined ? s.h : s.heading), fz = Math.cos(s.h !== undefined ? s.h : s.heading);
      const y = st.floorAt(s.x, s.z);
      const rx = -fz, rz = fx;
      for (const k of [-0.35, 0.35]) {
        box.seg(s.x - fx * 0.5 + rx * k, y - 0.1, s.z - fz * 0.5 + rz * k, s.x + fx * 0.7 - rx * k, y + 1.2, s.z + fz * 0.7 - rz * k, rx, 0, rz, 0.12, 0.12, C_WOOD2);
      }
      box.seg(s.x + rx * 0.6, y + 0.35, s.z + rz * 0.6, s.x - rx * 0.6, y + 0.35, s.z - rz * 0.6, 0, 1, 0, 0.1, 0.1, C_WOOD);
    }
    // ladders
    if (st.city) {
      const H = st.city.H;
      for (const l of st.ladders) {
        let ax, ay, az, bx, by, bz;
        if (l.state === 'carried' || l.state === 'dropped') {
          const y = st.floorAt(l.cx, l.cz) + (l.state === 'carried' ? 1.45 : 0.1);
          ax = l.cx; ay = y; az = l.cz - 3.4; bx = l.cx; by = y; bz = l.cz + 3.4;
        } else {
          const baseY = st.terrain(l.x, l.z0);
          const Lz = l.z1 - l.z0, Ly = H + 0.6 - baseY, L = Math.hypot(Lz, Ly);
          const thF = Math.atan2(Ly, Lz);
          let th;
          if (l.state === 'raising') th = thF * l.angle;
          else if (l.state === 'up') th = thF;
          else th = thF + (1 - l.angle) / 1.25 * (Math.PI - thF);
          ax = l.x; ay = baseY; az = l.z0;
          bx = l.x; by = baseY + Math.sin(th) * L; bz = l.z0 + Math.cos(th) * L;
        }
        if (!visible((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, 6)) continue;
        for (const s of [-0.3, 0.3]) box.seg(ax + s, ay, az, bx + s, by, bz, 1, 0, 0, 0.09, 0.09, C_WOOD2);
        const n = 14;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
          box.seg(x - 0.3, y, z, x + 0.3, y, z, 0, 1, 0, 0.05, 0.05, C_WOOD);
        }
      }
    }
    // pontoon bridges: boats and planks
    for (const p of st.pontoons) {
      if (p.len <= 0) continue;
      const y = st.WL;
      for (let d = 0; d < p.len; d += 2) {
        const z = p.z0 + p.dir * (d + 1);
        if (!visible(p.x, y, z, 4)) continue;
        const ty = Math.max(st.terrain(p.x, z) + 0.05, y + 0.3);
        box.seg(p.x - p.width / 2, ty - 0.1, z, p.x + p.width / 2, ty - 0.1, z, 0, 1, 0, 1.9, 0.18, C_WOOD2);
        if (Math.floor(d) % 6 === 0 && st.terrain(p.x, z) < y - 0.3) box.seg(p.x - p.width / 2 - 0.4, y - 0.3, z, p.x + p.width / 2 + 0.4, y - 0.3, z, 0, 1, 0, 1.2, 0.6, C_DARK);
      }
    }
    // debris
    const cache = this._dc || (this._dc = new Map());
    for (const d of world.debris) {
      if (!visible(d.x, d.y, d.z, 1)) continue;
      const cx = Math.cos(d.ax) * d.len * 0.5, cz = Math.sin(d.ax) * d.len * 0.5, cy = Math.sin(d.ax * 0.7) * d.len * 0.3;
      let c = cache.get(d.color);
      if (!c) { c = col(d.color); cache.set(d.color, c); }
      box.seg(d.x - cx, d.y - cy, d.z - cz, d.x + cx, d.y + cy, d.z + cz, 0, 1, 0, d.w, d.w * 0.6, c);
    }
    // rubble where the gate stood
    for (const gm of this.gateMeshes) {
      if (!gm.broken || !visible(gm.g.cx || 0, 1, gm.g.z0, 8)) continue;
      const g = gm.g;
      for (let i = 0; i < 6; i++) {
        const x = g.x0 - 1 + (i % 3) * 0.8 + (i > 2 ? g.x1 - g.x0 : 0), z = g.z0 + 0.5 + (i % 2);
        box.seg(x, 0, z, x + 0.8, 0.5 + (i % 3) * 0.3, z + 0.5, 0, 1, 0, 1.2, 0.9, C_WOOD);
      }
    }
  }
}
