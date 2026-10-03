// Weather and time of day: sky, fog, light, rain and stars, plus the few gameplay
// effects they carry (slower going in the rain, worse shooting in rain, fog and night).
import * as THREE from 'three';

// env: speed = movement multiplier, acc = missile accuracy, vis = how far men notice the enemy
export const WEATHER = {
  clear: {
    name: '晴れ', top: 0x5f86c0, bottom: 0xc9c2ac, fog: 0xc9c2ac, near: 180, far: 950,
    hemiSky: 0xdfe8ff, hemiGround: 0x6a5a3a, hemi: 1.35, sun: 2.0, sunColor: 0xfff0d0, sunPos: [-120, 160, 80],
    rain: 0, stars: 0, env: { speed: 1, acc: 1, vis: 1 },
  },
  fog: {
    name: '霧', top: 0x9aa4ac, bottom: 0xc8cdcf, fog: 0xc8cdcf, near: 15, far: 230,
    hemiSky: 0xe8eef0, hemiGround: 0x7a7a70, hemi: 1.45, sun: 0.9, sunColor: 0xfff4e0, sunPos: [-120, 160, 80],
    rain: 0, stars: 0, env: { speed: 1, acc: 0.85, vis: 0.55 },
  },
  rain: {
    name: '雨', top: 0x59636e, bottom: 0x8c949a, fog: 0x8c949a, near: 40, far: 420,
    hemiSky: 0xc8d4e0, hemiGround: 0x4a4a3c, hemi: 1.1, sun: 0.6, sunColor: 0xdde6ee, sunPos: [-120, 160, 80],
    rain: 1, stars: 0, env: { speed: 0.92, acc: 0.7, vis: 0.8 },
  },
  dusk: {
    name: '夕暮れ', top: 0x3a4a7a, bottom: 0xe08850, fog: 0xd89060, near: 150, far: 800,
    hemiSky: 0xffc8a0, hemiGround: 0x4a3a2a, hemi: 0.95, sun: 1.8, sunColor: 0xff9a50, sunPos: [-200, 45, 60],
    rain: 0, stars: 0.25, env: { speed: 1, acc: 1, vis: 0.9 },
  },
  night: {
    name: '夜', top: 0x050912, bottom: 0x1c2840, fog: 0x141d30, near: 30, far: 400,
    hemiSky: 0x6a80c0, hemiGround: 0x1a1a2a, hemi: 0.8, sun: 0.7, sunColor: 0x8aa0e0, sunPos: [100, 140, -60],
    rain: 0, stars: 1, env: { speed: 1, acc: 0.85, vis: 0.6 },
  },
};

const NUM = ['near', 'far', 'hemi', 'sun', 'rain', 'stars'];
const COL = ['top', 'bottom', 'fog', 'hemiSky', 'hemiGround', 'sunColor'];
const DROPS = 2600, BOX = 70, BOXH = 45;

export class Weather {
  // parts: { scene, fog, hemi, sun, skyMat, camera, fx, world, sound }
  constructor(parts) {
    Object.assign(this, parts);
    this.key = 'clear';
    this.cur = { sunPos: [...WEATHER.clear.sunPos] };
    for (const k of NUM) this.cur[k] = WEATHER.clear[k];
    for (const k of COL) this.cur[k] = new THREE.Color(WEATHER.clear[k]);
    this.target = WEATHER.clear;
    this.tmp = new THREE.Color();
    this.buildRain();
    this.buildStars();
    this.apply();
  }
  buildRain() {
    this.dropPos = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) {
      const x = (Math.random() - 0.5) * BOX * 2, y = Math.random() * BOXH, z = (Math.random() - 0.5) * BOX * 2;
      this.dropPos.set([x, y, z, x, y, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(new Float32Array(DROPS * 6), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.rainAttr);
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.4, fog: false, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 3;
    this.scene.add(this.rain);
  }
  buildStars() {
    const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), a = Math.random() * Math.PI * 2, y = 0.12 + u * 0.88, r = Math.sqrt(1 - y * y);
      p.set([Math.cos(a) * r * 1800, y * 1800, Math.sin(a) * r * 1800], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.6, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false; this.stars.visible = false; this.stars.renderOrder = -1;
    this.stars.onBeforeRender = () => this.stars.position.copy(this.camera.position);
    this.scene.add(this.stars);
  }

  set(key) {
    if (!WEATHER[key]) return;
    this.key = key; this.target = WEATHER[key];
    if (this.world) this.world.env = { ...WEATHER[key].env };
    if (this.sound) this.sound.setRain(WEATHER[key].rain);
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 2.5), t = this.target, c = this.cur;
    for (const n of NUM) c[n] += (t[n] - c[n]) * k;
    for (const n of COL) c[n].lerp(this.tmp.set(t[n]), k);
    for (let i = 0; i < 3; i++) c.sunPos[i] += (t.sunPos[i] - c.sunPos[i]) * k;
    this.apply();
    if (c.rain > 0.02) this.stepRain(dt);
  }
  apply() {
    const c = this.cur;
    this.fog.color.copy(c.fog); this.fog.near = c.near; this.fog.far = c.far;
    this.scene.background.copy(c.bottom);
    this.skyMat.uniforms.top.value.copy(c.top); this.skyMat.uniforms.bottom.value.copy(c.bottom);
    this.hemi.color.copy(c.hemiSky); this.hemi.groundColor.copy(c.hemiGround); this.hemi.intensity = c.hemi;
    this.sun.color.copy(c.sunColor); this.sun.intensity = c.sun; this.sun.position.set(...c.sunPos);
    if (this.fx) {
      this.fx.setFog(this.fog);
      // dust and smoke are unlit sprites: dim and warm them with the light
      const lum = Math.max(0.22, (c.hemi * 0.5 + c.sun * 0.25) / (1.35 * 0.5 + 2.0 * 0.25));
      this.fx.mat.uniforms.uTint.value.set(1, 1, 1).lerp(c.sunColor, 0.35).multiplyScalar(Math.min(1, lum));
    }
    this.stars.visible = c.stars > 0.02; this.starMat.opacity = c.stars;
    this.rain.visible = c.rain > 0.02; this.rain.material.opacity = 0.4 * Math.min(1, c.rain);
  }
  stepRain(dt) {
    const cam = this.camera.position, P = this.dropPos, out = this.rainAttr.array;
    const fall = 38 * dt, drift = 6 * dt;
    // fewer drops when the camera is high above the ground: they would only be specks
    const n = Math.floor(DROPS * Math.min(1, this.cur.rain));
    const base = cam.y - 12;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      P[o + 1] -= fall; P[o] += drift;
      // keep every drop inside a box that follows the camera
      let rx = P[o] - cam.x, rz = P[o + 2] - cam.z, ry = P[o + 1] - base;
      rx -= Math.floor((rx + BOX) / (BOX * 2)) * BOX * 2;
      rz -= Math.floor((rz + BOX) / (BOX * 2)) * BOX * 2;
      ry -= Math.floor(ry / BOXH) * BOXH;
      const x = P[o] = cam.x + rx, y = P[o + 1] = base + ry, z = P[o + 2] = cam.z + rz;
      out[o] = x; out[o + 1] = y; out[o + 2] = z;
      out[o + 3] = x - 0.12; out[o + 4] = y + 1.1; out[o + 5] = z;
    }
    // park unused drops
    for (let i = n; i < DROPS; i++) { const o = i * 6; out[o + 1] = out[o + 4] = -999; }
    this.rainAttr.needsUpdate = true;
  }
}
