import * as THREE from 'three';

// Everything with a skeleton (humans, horses, elephants, chariots, arrows)
// is drawn as "segments": a unit primitive stretched from point A to point B,
// with a side reference vector giving its roll. One InstancedMesh per primitive
// shape means the whole battle costs only a handful of draw calls.

function boxGeo() {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}
function taperGeo() {
  // narrow at y=0, wide at y=1 (torso: waist -> shoulders, skirt: belt -> hem)
  const b = 0.34, t = 0.5, db = 0.42, dt = 0.5;
  const v = [
    -b, 0, -db, b, 0, -db, b, 0, db, -b, 0, db,
    -t, 1, -dt, t, 1, -dt, t, 1, dt, -t, 1, dt,
  ];
  const idx = [
    0, 1, 2, 0, 2, 3, // bottom
    4, 6, 5, 4, 7, 6, // top
    0, 5, 1, 0, 4, 5,
    1, 6, 2, 1, 5, 6,
    2, 7, 3, 2, 6, 7,
    3, 4, 0, 3, 7, 4,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
function cylGeo(sides) {
  return new THREE.CylinderGeometry(0.5, 0.5, 1, sides).translate(0, 0.5, 0);
}
function discGeo() {
  return new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2);
}

export class SegPool {
  constructor(scene, geo, mat, cap) {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    this.mesh = mesh;
    this.m = mesh.instanceMatrix.array;
    this.c = mesh.instanceColor.array;
    this.cap = cap;
    this.n = 0;
    this.dirtyFrom = 0; // for append-only (static) pools
  }
  reset() { this.n = 0; this.dirtyFrom = 0; }

  // Segment from A to B. (sx,sy,sz) = side reference, w = width along side,
  // d = depth along (side x axis). col = [r,g,b].
  seg(ax, ay, az, bx, by, bz, sx, sy, sz, w, d, col) {
    if (this.n >= this.cap) return;
    let yx = bx - ax, yy = by - ay, yz = bz - az;
    let L = Math.sqrt(yx * yx + yy * yy + yz * yz);
    if (L < 1e-6) { yx = 0; yy = 1e-4; yz = 0; L = 1e-4; }
    const ux = yx / L, uy = yy / L, uz = yz / L;
    let dp = sx * ux + sy * uy + sz * uz;
    let xx = sx - ux * dp, xy = sy - uy * dp, xz = sz - uz * dp;
    let xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
    if (xl < 1e-4) {
      // side vector parallel to the axis: pick any perpendicular
      if (Math.abs(uy) < 0.9) { sx = 0; sy = 1; sz = 0; } else { sx = 1; sy = 0; sz = 0; }
      dp = sx * ux + sy * uy + sz * uz;
      xx = sx - ux * dp; xy = sy - uy * dp; xz = sz - uz * dp;
      xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
    }
    xx /= xl; xy /= xl; xz /= xl;
    const zx = xy * uz - xz * uy, zy = xz * ux - xx * uz, zz = xx * uy - xy * ux;
    const m = this.m, o = this.n * 16;
    m[o] = xx * w; m[o + 1] = xy * w; m[o + 2] = xz * w; m[o + 3] = 0;
    m[o + 4] = yx; m[o + 5] = yy; m[o + 6] = yz; m[o + 7] = 0;
    m[o + 8] = zx * d; m[o + 9] = zy * d; m[o + 10] = zz * d; m[o + 11] = 0;
    m[o + 12] = ax; m[o + 13] = ay; m[o + 14] = az; m[o + 15] = 1;
    const c = this.c, k = this.n * 3;
    c[k] = col[0]; c[k + 1] = col[1]; c[k + 2] = col[2];
    this.n++;
  }

  // flat disc on the ground (blob shadows, selection markers)
  disc(x, y, z, rx, rz, cosA, sinA, col) {
    if (this.n >= this.cap) return;
    const m = this.m, o = this.n * 16;
    m[o] = cosA * rx; m[o + 1] = 0; m[o + 2] = -sinA * rx; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = sinA * rz; m[o + 9] = 0; m[o + 10] = cosA * rz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    const c = this.c, k = this.n * 3;
    c[k] = col[0]; c[k + 1] = col[1]; c[k + 2] = col[2];
    this.n++;
  }

  flush() {
    const mesh = this.mesh;
    mesh.count = this.n;
    const from = this.dirtyFrom;
    if (this.n > from) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(from * 16, (this.n - from) * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(from * 3, (this.n - from) * 3);
      mesh.instanceColor.needsUpdate = true;
    }
    this.dirtyFrom = this.n;
  }
}

// A set of pools, one per primitive shape.
export class SegmentSet {
  constructor(scene, ps1Hook, caps) {
    const mat = new THREE.MeshLambertMaterial({ flatShading: true });
    ps1Hook(mat);
    this.box = new SegPool(scene, boxGeo(), mat, caps.box);
    this.taper = new SegPool(scene, taperGeo(), mat, caps.taper);
    this.cyl = new SegPool(scene, cylGeo(8), mat, caps.cyl);
    this.pools = [this.box, this.taper, this.cyl];
  }
  reset() { for (const p of this.pools) p.reset(); }
  flush() { for (const p of this.pools) p.flush(); }
}

export function makeShadowPool(scene, cap) {
  const mat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.38, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const p = new SegPool(scene, discGeo(), mat, cap);
  p.mesh.renderOrder = 1;
  return p;
}

// sRGB hex -> linear rgb triplet usable as instance colour
const tmpC = new THREE.Color();
export function col(hex, jitter = 0, rnd = Math.random) {
  tmpC.setHex(hex);
  if (jitter) {
    const k = 1 + (rnd() * 2 - 1) * jitter;
    tmpC.r *= k; tmpC.g *= k; tmpC.b *= k;
  }
  return [tmpC.r, tmpC.g, tmpC.b];
}
