// Point-sprite particles: dust clouds, blood, sparks. Square pixels on purpose.
import * as THREE from 'three';

const CAP = 12000;

export class FX {
  constructor(scene) {
    this.pos = new Float32Array(CAP * 3);
    this.vel = new Float32Array(CAP * 3);
    this.col = new Float32Array(CAP * 4);
    this.size = new Float32Array(CAP);
    this.life = new Float32Array(CAP);
    this.max = new Float32Array(CAP);
    this.grow = new Float32Array(CAP);
    this.grav = new Float32Array(CAP);
    this.a0 = new Float32Array(CAP);
    this.head = 0;
    const g = new THREE.BufferGeometry();
    this.gPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.gCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.gSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.gPos);
    g.setAttribute('color', this.gCol);
    g.setAttribute('size', this.gSize);
    this.uScale = { value: 800 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vC; varying float vFog;
        uniform float uScale;
        void main(){
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size <= 0.0 ? 0.0 : clamp(size * uScale / -mv.z, 1.0, 160.0);
          vFog = -mv.z;
          // fade out sprites right in front of the lens
          vC.a *= smoothstep(1.5, 9.0, -mv.z);
        }`,
      fragmentShader: `
        varying vec4 vC; varying float vFog;
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
        void main(){
          if (vC.a <= 0.01) discard;
          float f = smoothstep(fogNear, fogFar, vFog);
          gl_FragColor = vec4(mix(vC.rgb, fogColor, f), vC.a);
        }`,
      transparent: true, depthWrite: false,
    });
    this.mat = mat;
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }
  setFog(fog) {
    this.mat.uniforms.fogColor.value.copy(fog.color);
    this.mat.uniforms.fogNear.value = fog.near;
    this.mat.uniforms.fogFar.value = fog.far;
  }
  spawn(x, y, z, vx, vy, vz, life, size, grow, grav, r, g, b, a) {
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    const j = i * 3, k = i * 4;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
    this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b; this.col[k + 3] = a;
    this.a0[i] = a;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grow[i] = grow; this.grav[i] = grav;
  }
  dust(x, y, z, s = 1) {
    const c = 0.55 + Math.random() * 0.12;
    this.spawn(x + (Math.random() - 0.5) * s, y, z + (Math.random() - 0.5) * s,
      (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8,
      2.5 + Math.random() * 2, 0.7 * s, 0.7 * s, -0.05, c, c * 0.88, c * 0.68, 0.22);
  }
  dustBurst(x, y, z, n, s = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (0.5 + Math.random()) * 2 * s;
      const c = 0.52 + Math.random() * 0.1;
      this.spawn(x, y, z, Math.cos(a) * sp, 0.4 + Math.random() * 1.2, Math.sin(a) * sp,
        1.5 + Math.random() * 1.5, 0.5 * s, 0.9 * s, 0.3, c, c * 0.87, c * 0.66, 0.3);
    }
  }
  blood(x, y, z, dx, dz, n) {
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, z,
        dx * (0.5 + Math.random()) + (Math.random() - 0.5) * 1.5, Math.random() * 2, dz * (0.5 + Math.random()) + (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.4, 0.07, 0, 9.8, 0.45 + Math.random() * 0.15, 0.02, 0.02, 0.95);
    }
  }
  splash(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = Math.random() * 2;
      this.spawn(x, y, z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp,
        0.6 + Math.random() * 0.4, 0.18, 0.4, 9.8, 0.8, 0.88, 0.95, 0.7);
    }
  }
  sparks(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5,
        0.18 + Math.random() * 0.15, 0.06, 0, 9.8, 1, 0.9, 0.5, 1);
    }
  }
  step(dt) {
    const p = this.pos, v = this.vel, L = this.life, c = this.col;
    for (let i = 0; i < CAP; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      const j = i * 3;
      if (L[i] <= 0) { this.size[i] = 0; c[i * 4 + 3] = 0; continue; }
      v[j + 1] -= this.grav[i] * dt;
      const drag = 1 - Math.min(1, dt * 1.2);
      v[j] *= drag; v[j + 2] *= drag;
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = L[i] / this.max[i];
      c[i * 4 + 3] = this.a0[i] * Math.min(1, t * 2);
    }
  }
  flush() {
    this.gPos.needsUpdate = true; this.gCol.needsUpdate = true; this.gSize.needsUpdate = true;
  }
}
