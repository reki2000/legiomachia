// Meshes for stage structures (walls, towers, gate, houses, bridges) and the
// per-frame parts that move or appear during the battle (ladders, stakes, pontoons, debris).
import * as THREE from 'three';
import { rand, setSeed } from '../util.js';
import { col } from './segments.js';

const UP = new THREE.Vector3(0, 1, 0);
const C_RED_FLAG = col(0xc03030), C_BLUE_FLAG = col(0x3a5ac8), C_NEUTRAL = col(0xcfc8b0);
const C_HULL = col(0x4e3420), C_WOOD = col(0x6e4e2e), C_WOOD2 = col(0x8a6a40), C_ROPE = col(0x9a8a60), C_DARK = col(0x3a2a1a);
const C_FIRE = col(0xff7a26), C_ROCK = col(0x8a8478);

export class StageRenderer {
  constructor(scene, stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    scene.add(this.group);
    setSeed(777);
    const boxes = []; // [cx, cy, cz, sx, sy, sz, color, rotY]
    const roofs = [], tents = [], tentsBig = [];
    const add = (x0, y0, z0, x1, y1, z1, c) => boxes.push([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c]);
    this.gateMeshes = [];
    this.bridgeGroups = new Map();
    const stoneC = [0x9a8f7a, 0x958a74, 0xa39884], woodC = [0x7a5a38, 0x6e4e2e, 0x84643e];
    if (stage.city) {
      const C = stage.city, H = C.H;
      for (const s of stage.structs) {
        const c = stoneC[Math.floor(rand() * 3)];
        if (s.type === 'wall' && s.palisade) {
          // a log wall: solid body and a row of sharpened posts along the outer edge
          const wc = woodC[Math.floor(rand() * 3)];
          add(s.x0, -2, s.z0, s.x1, H, s.z1, wc);
          if (s.x1 - s.x0 > s.z1 - s.z0) {
            const outer = s.z0 === C.z0 ? s.z0 - 0.1 : s.z1 - 0.5;
            for (let x = s.x0 + 0.3; x < s.x1 - 0.3; x += 0.7) add(x, H - 0.3, outer, x + 0.5, H + 0.5 + rand() * 1.3, outer + 0.5, woodC[Math.floor(rand() * 3)]);
          } else {
            const outer = s.x0 < 0 ? s.x0 - 0.1 : s.x1 - 0.5;
            for (let z = s.z0 + 0.3; z < s.z1 - 0.3; z += 0.7) add(outer, H - 0.3, z, outer + 0.5, H + 0.5 + rand() * 1.3, z + 0.5, woodC[Math.floor(rand() * 3)]);
          }
        } else if (s.type === 'tower' && s.palisade) {
          add(s.x0, -2, s.z0, s.x1, H + 0.05, s.z1, 0x6e4e2e);
          for (const [px, pz] of [[s.x0, s.z0], [s.x1 - 0.6, s.z0], [s.x0, s.z1 - 0.6], [s.x1 - 0.6, s.z1 - 0.6]]) add(px, H, pz, px + 0.6, H + 2.6, pz + 0.6, 0x5a3e24);
        } else if (s.type === 'tent') {
          (s.big ? tentsBig : tents).push([(s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.h, s.z1 - s.z0]);
        } else if (s.type === 'wall') {
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
      if (stage.reskin === 'castle') {
        // a tenshu keep behind the walls: three plastered tiers, dark roofs
        const t = stage.structs.find(x => x.type === 'tenshu');
        if (t) {
          const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, w0 = t.x1 - t.x0, d0 = t.z1 - t.z0;
          let y = 0;
          for (let k = 0; k < 3; k++) {
            const wk = w0 * (1 - k * 0.22), dk = d0 * (1 - k * 0.22), hk = k === 2 ? 4.4 : 5;
            add(cx - wk / 2, y, cz - dk / 2, cx + wk / 2, y + hk, cz + dk / 2, 0xe8e2d2);
            roofs.push([cx, y + hk, cz, wk * 0.72, 1.8, dk * 0.72]);
            y += hk;
          }
        }
      }
      // the gate: timber doors under an arch, hidden once broken
      for (const g of stage.gates) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0 - 0.3, H - 1.2, 0.8), new THREE.MeshLambertMaterial({ color: 0x5a3a1e, flatShading: true }));
        m.position.set((g.x0 + g.x1) / 2, (H - 1.2) / 2, g.z0 + 0.6);
        const lint = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0, 1.4, g.z1 - g.z0), new THREE.MeshLambertMaterial({ color: 0x8c8270, flatShading: true }));
        lint.position.set((g.x0 + g.x1) / 2, H - 0.7, (g.z0 + g.z1) / 2);
        const bands = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0 - 0.2, 0.25, 0.9), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
        bands.position.set((g.x0 + g.x1) / 2, 1.5, g.z0 + 0.6);
        const bands2 = bands.clone(); bands2.position.y = 4;
        // stone filling the wall thickness around the doors, so the wall looks solid until the gate falls
        const body = new THREE.Mesh(new THREE.BoxGeometry(g.x1 - g.x0, H + 2, g.z1 - g.z0), new THREE.MeshLambertMaterial({ color: C.camp ? 0x7a5a38 : 0x9a8f7a, flatShading: true }));
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
    if (stage.trees && stage.trees.length) this.buildForest(stage.trees);
    if (stage.harbor) this.buildHarbor(boxes, roofs, stoneC);
    // village (and any stage with bare structs but no city/harbour): houses with roofs, low fences.
    // struct h is the absolute top of the block (terrain + height), as in buildVillage.
    if (stage.structs.length && !stage.city && !stage.harbor) {
      for (const s of stage.structs) {
        if (s.type === 'house') {
          const hc = [0xc8b898, 0xb8a888, 0xd0c0a0][Math.floor(rand() * 3)];
          add(s.x0, -1, s.z0, s.x1, s.h, s.z1, hc);
          roofs.push([(s.x0 + s.x1) / 2, s.h, (s.z0 + s.z1) / 2, (s.x1 - s.x0) * 0.75, 2.4, (s.z1 - s.z0) * 0.75]);
        } else if (s.type === 'fence') {
          add(s.x0, -1, s.z0, s.x1, s.h, s.z1, woodC[Math.floor(rand() * 3)]);
        }
      }
    }
    // boats: a tapered hull, a bench and a mast. ships: a long hull with a deck, a mast, a yard
    // with the sail furled on it, and a raised stern
    const hull = [];
    for (const d of stage.decor) {
      if (d.type !== 'boat' && d.type !== 'ship') continue;
      const wl = stage.WL;
      const cs = Math.cos(d.heading), sn = Math.sin(d.heading);
      const at = (k, w, y0, y1, c, len = 1.6) => { // box centred k metres along the boat
        const px = d.x + sn * k, pz = d.z + cs * k;
        hull.push([px, (y0 + y1) / 2 + wl, pz, w, y1 - y0, len, c, d.heading]);
      };
      if (d.type === 'boat') {
        for (let k = -3; k <= 3; k += 1.2) at(k, 2.3 - Math.abs(k) * 0.22, -0.5, 0.35, 0x5a3e24);
        at(0, 0.12, 0.2, 3.6, 0x4a3420);
      } else {
        // transports are the same build, half as big again
        const m = d.big ? 1.5 : 1, A = (k, w, y0, y1, c, len) => at(k * m, w * m, y0 * m, y1 * m, c, len * m);
        for (let k = -8; k <= 8; k += 1.6) A(k, 4.6 - (k / 8) ** 2 * 3.2, -1.2, 1.0 + Math.abs(k) * 0.05, 0x5e4126, 1.7);
        A(0, 3.6, 1.0, 1.15, 0x8a6a40, 13);                       // deck
        A(-7.6, 1.6, 1.0, 2.6, 0x4e3420, 1.8);                    // stern post
        A(8.4, 0.5, 0.4, 2.2, 0x4e3420, 1.2);                     // stem
        A(0.8, 0.28, 1.0, 12, 0x4a3420, 0.28);                    // mast
        A(0.8, 9.5, 10.6, 11.1, 0xd8ccaa, 0.5);                   // yard and furled sail
        for (let k = -5; k <= 5; k += 1.4) A(k, 7.2, 0.2, 0.32, 0x6e5232, 0.14); // oars shipped
      }
    }
    if (hull.length) this.group.add(this.makeBoxes(hull));
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
        grp.add(this.makeBoxes(bx));
        this.group.add(grp);
        this.bridgeGroups.set(b, grp);
      }
    }
    if (boxes.length) this.group.add(this.makeBoxes(boxes));
    for (const [list, color] of [[tents, 0xd9cfae], [tentsBig, 0xb8493a]]) {
      if (!list.length) continue;
      const g = new THREE.ConeGeometry(0.72, 1, 5).translate(0, 0.5, 0);
      const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
      const im = new THREE.InstancedMesh(g, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      list.forEach((r, i) => { p.set(r[0], r[1], r[2]); sc.set(r[3] * 1.35, r[4], r[5] * 1.35); q.setFromAxisAngle(UP, i * 0.7); m.compose(p, q, sc); im.setMatrixAt(i, m); });
      this.group.add(im);
    }
    if (roofs.length) {
      const g = new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
      const mat = new THREE.MeshLambertMaterial({ color: 0xa0503a, flatShading: true });
      const im = new THREE.InstancedMesh(g, mat, roofs.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      roofs.forEach((r, i) => { p.set(r[0], r[1], r[2]); s.set(r[3] * 1.4, r[4], r[5] * 1.4); m.compose(p, q, s); im.setMatrixAt(i, m); });
      this.group.add(im);
    }
  }
  // stone quays round the basin, the mole, warehouses, houses and the lighthouse
  buildHarbor(boxes, roofs, stoneC) {
    const st = this.stage, H = st.harbor, Q = H.Q, top = Q + 0.08;
    const cz = (H.zS + H.zN) / 2, hz = (H.zN - H.zS) / 2;
    // walk the basin outline offset by o, calling f(x, z, heading, length) for each 2 m piece
    const outline = (o, f) => {
      const r = H.r + o, ax = H.Bw - H.r, az = hz - H.r;
      const pts = [];
      const seg = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 2)); for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
      const arc = (cx, cz2, a0) => { const n = Math.max(2, Math.round(r * 0.8)); for (let i = 0; i < n; i++) { const a = a0 - (Math.PI / 2) * i / n; pts.push([cx + Math.cos(a) * r, cz2 + Math.sin(a) * r]); } };
      // clockwise seen from above: north edge, NE corner, east edge, SE, south, SW, west, NW
      seg(-ax, cz + az + r, ax, cz + az + r); arc(ax, cz + az, Math.PI / 2);
      seg(ax + r, cz + az, ax + r, cz - az); arc(ax, cz - az, 0);
      seg(ax, cz - az - r, -ax, cz - az - r); arc(-ax, cz - az, -Math.PI / 2);
      seg(-ax - r, cz - az, -ax - r, cz + az); arc(-ax, cz + az, Math.PI);
      for (let i = 0; i < pts.length; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
        f((x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), Math.hypot(x1 - x0, z1 - z0) + 0.35);
      }
    };
    const stone = () => stoneC[Math.floor(rand() * 3)];
    // quay coping: from the water's edge to 1.5 m inland, standing on the basin floor
    const wIn = H.cope, wOut = 1.5;
    outline((wOut - wIn) / 2, (x, z, hd, len) => {
      if (st.harborMouth(x, z)) return;
      boxes.push([x, (H.bed - 0.5 + top) / 2, z, wIn + wOut, top - H.bed + 0.5, len, stone(), hd]);
    });
    // the mole: the same stones carried on out to sea round the seaward end of the basin
    outline((wOut + H.moleW) / 2, (x, z, hd, len) => {
      if (st.harborMouth(x, z) || z > st.shoreZ(x) + 4) return;
      boxes.push([x, (H.seaBed + top) / 2, z, H.moleW - wOut, top - H.seaBed, len, stone(), hd]);
    });
    // mooring posts along the quay edge
    outline(-H.cope + 0.5, (x, z, hd, len) => {
      if (st.harborMouth(x, z) || rand() < 0.75) return;
      boxes.push([x, top + 0.35, z, 0.35, 0.7, 0.35, 0x5a4a3a, hd]);
    });
    for (const s of st.structs) {
      if (s.type === 'house' || s.type === 'warehouse') {
        const wh = s.type === 'warehouse';
        const hc = wh ? [0xb09a78, 0xa08c6c, 0xbca684][Math.floor(rand() * 3)] : [0xd8ccae, 0xc8b898, 0xe0d4b8][Math.floor(rand() * 3)];
        boxes.push([(s.x0 + s.x1) / 2, (s.h - 1) / 2, (s.z0 + s.z1) / 2, s.x1 - s.x0, s.h + 1, s.z1 - s.z0, hc]);
        roofs.push([(s.x0 + s.x1) / 2, s.h, (s.z0 + s.z1) / 2, (s.x1 - s.x0) * 0.75, wh ? 1.8 : 2.4, (s.z1 - s.z0) * 0.75]);
      } else if (s.type === 'lighthouse') {
        const cx = (s.x0 + s.x1) / 2, czz = (s.z0 + s.z1) / 2, b = Q + 0.08;
        boxes.push([cx, (b + b + 7) / 2, czz, 7, 7, 7, 0xb0a690]);
        boxes.push([cx, b + 7 + 3.5, czz, 5, 7, 5, 0xc0b6a0]);
        boxes.push([cx, b + 14.3, czz, 5.8, 0.6, 5.8, 0x8c8270]);
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) boxes.push([cx + dx, b + 15.6, czz + dz, 0.5, 2, 0.5, 0x8c8270]);
        boxes.push([cx, b + 15.3, czz, 2.2, 1.4, 2.2, 0xff9a3a]); // the beacon
        boxes.push([cx, b + 16.9, czz, 5.4, 0.5, 5.4, 0x8c8270]);
      }
    }
  }
  buildForest(trees) {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 3, 5).translate(0, 1.5, 0);
    const crownGeo = new THREE.ConeGeometry(1.7, 7, 6).translate(0, 5.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028, flatShading: true });
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x4a6e34, flatShading: true });
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
  makeBoxes(list) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
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
  // landing boats: hull and oars (the men, horses and oarsmen are drawn by the body renderer)
  emitLanding(box, world, visible) {
    const WL = this.stage.WL;
    for (const b of world.landing.boats) {
      if (!visible(b.x, WL, b.z, b.len)) continue;
      const fx = Math.sin(b.heading), fz = Math.cos(b.heading), rx = fz, rz = -fx;
      const hl = b.len / 2, hw = b.width / 2;
      // hull: a flat bottom, two sides and a raised bow
      box.seg(b.x - fx * hl, WL - 0.25, b.z - fz * hl, b.x + fx * hl, WL - 0.25, b.z + fz * hl, rx, 0, rz, b.width * 0.8, 0.5, C_HULL);
      for (const s of [-1, 1]) box.seg(b.x - fx * hl * 0.9 + rx * hw * s, WL + 0.1, b.z - fz * hl * 0.9 + rz * hw * s, b.x + fx * hl * 0.9 + rx * hw * 0.6 * s, WL + 0.1, b.z + fz * hl * 0.9 + rz * hw * 0.6 * s, 0, 1, 0, 0.15, 0.7, C_WOOD);
      box.seg(b.x + fx * hl * 0.9, WL - 0.3, b.z + fz * hl * 0.9, b.x + fx * (hl + 0.4), WL + 0.8, b.z + fz * (hl + 0.4), rx, 0, rz, b.width * 0.5, 0.25, C_WOOD);
      // one oar for each oarsman (see BodyRenderer.emitRowers), sweeping while she is under way
      const rowing = b.state === 'out' || b.state === 'back';
      const sw = rowing ? Math.sin(b.oar * 2) : 0, lift = rowing ? Math.cos(b.oar * 2) * 0.3 : 0.35;
      for (const r of b.rowers) {
        // pivots on the gunwale beside the oarsman; the handle is in his hands, aft of him
        const sd = Math.sign(r.s);
        const ox = b.x + fx * r.k + rx * sd * hw, oz = b.z + fz * r.k + rz * sd * hw;
        const hx = b.x + fx * (r.k - 0.45 - sw * 0.2) + rx * sd * (hw - 0.9), hz = b.z + fz * (r.k - 0.45 - sw * 0.2) + rz * sd * (hw - 0.9);
        const ex = ox + (ox - hx) * 2.4, ez = oz + (oz - hz) * 2.4;
        box.seg(hx, WL + 0.75, hz, ex, WL - 0.25 + lift, ez, 0, 1, 0, 0.08, 0.08, C_WOOD2);
      }
    }
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
    // objective markers: the flag and ring of a capture point, the line of flags at the exit
    const obj = world.objective;
    if (obj && obj.point) {
      const p = obj.point, m = obj.meter, a = Math.min(1, Math.abs(m));
      const tint = m > 0 ? C_RED_FLAG : C_BLUE_FLAG;
      const c = [C_NEUTRAL[0] + (tint[0] - C_NEUTRAL[0]) * a, C_NEUTRAL[1] + (tint[1] - C_NEUTRAL[1]) * a, C_NEUTRAL[2] + (tint[2] - C_NEUTRAL[2]) * a];
      const y = st.floorAt(p.x, p.z);
      if (visible(p.x, y + 3, p.z, p.r + 10)) {
        box.seg(p.x, y, p.z, p.x, y + 7.5, p.z, 1, 0, 0, 0.2, 0.2, C_WOOD);
        const sway = Math.sin(world.time * 2.5) * 0.25;
        box.seg(p.x, y + 7.0, p.z, p.x + 2.4, y + 7.0, p.z + sway, 0, 1, 0, 1.3, 0.05, c);
        const N = 48;
        for (let i = 0; i < N; i++) {
          const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
          const x0 = p.x + Math.cos(a0) * p.r, z0 = p.z + Math.sin(a0) * p.r, x1 = p.x + Math.cos(a1) * p.r, z1 = p.z + Math.sin(a1) * p.r;
          if (i % 2) continue; // dashed
          box.seg(x0, st.floorAt(x0, z0) + 0.2, z0, x1, st.floorAt(x1, z1) + 0.2, z1, 0, 1, 0, 0.35, 0.06, c);
        }
      }
    }
    if (obj && obj.exit) {
      const z = obj.exit.z;
      for (let x = -260; x <= 260; x += 10) {
        const y = st.floorAt(x, z);
        if (!visible(x, y + 2, z, 6)) continue;
        box.seg(x, y, z, x, y + 4, z, 1, 0, 0, 0.12, 0.12, C_WOOD);
        box.seg(x, y + 3.9, z, x + 1.1, y + 3.9, z, 0, 1, 0, 0.7, 0.04, C_RED_FLAG);
      }
    }
    if (world.landing) this.emitLanding(box, world, visible);
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
    // naval: enemy war galleys, drawn like the landing boats; a plank runs to the shore (+z)
    if (st.galleys) {
      const WL = st.WL;
      for (const g of st.galleys) {
        const len = g.len || 22, wid = g.width || 5;
        if (!visible(g.x, WL, g.z, len)) continue;
        const fx = Math.sin(g.heading || 0), fz = Math.cos(g.heading || 0), rx = fz, rz = -fx;
        const hl = len / 2, hw = wid / 2;
        box.seg(g.x - fx * hl, WL - 0.25, g.z - fz * hl, g.x + fx * hl, WL - 0.25, g.z + fz * hl, rx, 0, rz, wid * 0.8, 0.5, C_HULL);
        for (const s of [-1, 1]) box.seg(g.x - fx * hl * 0.9 + rx * hw * s, WL + 0.1, g.z - fz * hl * 0.9 + rz * hw * s, g.x + fx * hl * 0.9 + rx * hw * 0.6 * s, WL + 0.1, g.z + fz * hl * 0.9 + rz * hw * 0.6 * s, 0, 1, 0, 0.15, 0.7, C_WOOD);
        box.seg(g.x + fx * hl * 0.9, WL - 0.3, g.z + fz * hl * 0.9, g.x + fx * (hl + 0.4), WL + 0.8, g.z + fz * (hl + 0.4), rx, 0, rz, wid * 0.5, 0.25, C_WOOD);
        box.seg(g.x, WL + 0.4, g.z, g.x, WL + 7, g.z, 1, 0, 0, 0.18, 0.18, C_DARK); // mast
        if (g.plank) box.seg(g.x, WL + 0.35, g.z + hl * 0.6, g.x, WL + 0.35, g.z + hl * 0.6 + 8, 0, 1, 0, 1.6, 0.15, C_WOOD2);
      }
    }
    // fire glow: a small flickering orange block over each burning item (first 40)
    if (world.fire) {
      let n = 0;
      for (const it of world.fire.items) {
        if (it.state !== 1) continue;
        if (++n > 40) break;
        if (!visible(it.x, 1, it.z, it.r + 4)) continue;
        const y = st.floorAt(it.x, it.z) + 0.5;
        const fl = 0.7 + 0.3 * Math.sin(world.time * 9 + it.x * 1.7 + it.z);
        box.seg(it.x, y, it.z, it.x, y + 1.3 * fl, it.z, 1, 0, 0, 0.9 * fl, 0.9 * fl, C_FIRE);
      }
    }
    // landslide: the rockfall block across the pass, until the engineers clear it
    if (st.rubble && st.rubble.alive) {
      const r = st.rubble, zm = (r.z0 + r.z1) / 2;
      if (visible((r.x0 + r.x1) / 2, 2, zm, (r.x1 - r.x0) / 2 + 4)) {
        for (let i = 0; i < 7; i++) {
          const x = r.x0 + (r.x1 - r.x0) * (i + 0.5) / 7;
          const y = st.floorAt(x, zm);
          box.seg(x, y, zm, x + 0.8, y + 1.2 + (i % 3) * 0.7, zm + 0.4, 0, 1, 0, 2.6, 2.2, C_ROCK);
        }
      }
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
