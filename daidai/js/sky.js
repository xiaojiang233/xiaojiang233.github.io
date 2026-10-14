import * as THREE from '../lib/three.bundle.js';
import { clamp, lerp, smooth, rng, canvasTex, TAU } from './util.js';

// A 25-hour day. The sun is up from 6:00 to 19:00; 24:00–25:00 is the extra
// hour Planet Daze keeps for zoning out.
export const DAY = 25;
const RISE = 6, SET = 19;
export const PRESETS = [['清晨', 6.6], ['正午', 12.5], ['黄昏', 18.35], ['夜晚', 22.2]];

const WEST = new THREE.Vector3(0.78, 0, -0.62).normalize();      // where the sun sets: ahead-right of the start line, over the sea
const SOUTH = new THREE.Vector3(WEST.z, 0, -WEST.x);
const NOON = new THREE.Vector3().copy(SOUTH).multiplyScalar(Math.cos(1.1)).add(new THREE.Vector3(0, Math.sin(1.1), 0)).normalize();

export function sunDirection(h, out = new THREE.Vector3()) {
  h = ((h % DAY) + DAY) % DAY;
  let a;
  if (h >= RISE && h <= SET) a = Math.PI * (h - RISE) / (SET - RISE);
  else { const hh = h < RISE ? h + DAY : h; a = Math.PI + Math.PI * (hh - SET) / (DAY - (SET - RISE)); }
  // east → noon → west
  return out.copy(WEST).multiplyScalar(-Math.cos(a)).addScaledVector(NOON, Math.sin(a)).normalize();
}

const C = (r, g, b) => new THREE.Color(r, g, b);
function ramp(e, stops) { // stops: [[elevDeg, Color|number], ...] ascending
  if (e <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (e <= stops[i][0]) {
    const f = (e - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
    const a = stops[i - 1][1], b = stops[i][1];
    return typeof a === 'number' ? lerp(a, b, f) : a.clone().lerp(b, f);
  }
  return stops[stops.length - 1][1];
}

export class SkySystem {
  constructor(scene, renderer, { low = false } = {}) {
    this.scene = scene; this.renderer = renderer;
    const sky = this.sky = new THREE.Sky();
    sky.scale.setScalar(4500);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    const u = this.u = sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.86;
    u.cloudCoverage.value = 0.32; u.cloudDensity.value = 0.45; u.cloudElevation.value = 0.55; u.cloudScale.value = 0.00022; u.cloudSpeed.value = 0.00003;

    // night: a deep blue dome so it isn't pitch black, stars, the moon and the neighbours
    this.nightDome = new THREE.Mesh(new THREE.SphereGeometry(4300, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { k: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: 'varying vec3 vP; uniform float k; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 top = vec3(0.004,0.008,0.03); vec3 hor = vec3(0.035,0.05,0.12); vec3 c = mix(hor, top, pow(h, 0.45)); gl_FragColor = vec4(c * k, 1.0); }',
    }));
    this.nightDome.renderOrder = -9; this.nightDome.frustumCulled = false;
    scene.add(this.nightDome);

    const r = rng(77), N = low ? 1400 : 2600;
    const sp = new Float32Array(N * 3), ss = new Float32Array(N), sc = new Float32Array(N * 3), sph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const y = Math.pow(r(), 0.7), a = r() * TAU, rr = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * rr * 3800; sp[i * 3 + 1] = (y * 0.98 + 0.02) * 3800; sp[i * 3 + 2] = Math.sin(a) * rr * 3800;
      ss[i] = 0.6 + Math.pow(r(), 6) * 3.2; sph[i] = r() * TAU;
      const warm = r() < 0.15; sc[i * 3] = 1; sc[i * 3 + 1] = warm ? 0.88 : 0.95; sc[i * 3 + 2] = warm ? 0.65 : 1;
    }
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { k: { value: 0 }, time: { value: 0 }, px: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float size; attribute float ph; attribute vec3 col; varying vec3 vC; varying float vT; uniform float time; uniform float px;
        void main(){ vC = col; vT = 0.65 + 0.35 * sin(time * (1.0 + ph) + ph * 7.0); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; gl_PointSize = size * px * 1.6; }`,
      fragmentShader: `varying vec3 vC; varying float vT; uniform float k; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); a = a * a; gl_FragColor = vec4(vC * a * vT * k, 1.0); }`,
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('size', new THREE.BufferAttribute(ss, 1));
    sg.setAttribute('col', new THREE.BufferAttribute(sc, 3)); sg.setAttribute('ph', new THREE.BufferAttribute(sph, 1));
    this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; this.stars.renderOrder = -8;
    scene.add(this.stars);
    // stars the player collected: bigger, golden, they stay
    const MAXG = 600;
    this.gold = { n: 0, max: MAXG, pos: new Float32Array(MAXG * 3), size: new Float32Array(MAXG), ph: new Float32Array(MAXG), col: new Float32Array(MAXG * 3) };
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(this.gold.pos, 3)); gg.setAttribute('size', new THREE.BufferAttribute(this.gold.size, 1));
    gg.setAttribute('col', new THREE.BufferAttribute(this.gold.col, 3)); gg.setAttribute('ph', new THREE.BufferAttribute(this.gold.ph, 1));
    gg.setDrawRange(0, 0);
    this.goldMat = this.starMat.clone();
    this.goldPts = new THREE.Points(gg, this.goldMat); this.goldPts.frustumCulled = false; this.goldPts.renderOrder = -7;
    scene.add(this.goldPts);

    // the moon
    const moonTex = canvasTex(256, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w * 0.45, h * 0.45, 10, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, '#d9d4c8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const rr = rng(4);
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(150,140,130,${0.08 + rr() * 0.12})`; g.beginPath(); g.arc(rr() * w, rr() * h, 6 + rr() * 26, 0, 7); g.fill(); }
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), new THREE.MeshBasicMaterial({ map: moonTex, fog: false, transparent: true }));
    this.moon.renderOrder = -6;
    scene.add(this.moon);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(220,230,255,.6)'); gr.addColorStop(1, 'rgba(220,230,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    this.glow.scale.setScalar(520); this.glow.renderOrder = -6;
    scene.add(this.glow);

    // a big ringed neighbour planet low over the sea (milk + violet, like the homepage nebula)
    const bands = canvasTex(64, 512, (g, w, h) => {
      const cols = ['#f3dcae', '#e8c99a', '#c9b6f0', '#f6e6c4', '#b4a3ef', '#efd3a8', '#d8c8f5', '#f3dcae'];
      for (let y = 0; y < h; y += 8) { g.fillStyle = cols[Math.floor((Math.sin(y * 0.05) * 0.5 + 0.5) * cols.length + y / 90) % cols.length]; g.fillRect(0, y, w, 9); }
    });
    this.planetDir = new THREE.Vector3(0.96, 0.12, 0.2).normalize();
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 24), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { map: { value: bands }, sun: { value: new THREE.Vector3() }, vis: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform sampler2D map; uniform vec3 sun; uniform float vis; varying vec2 vUv; varying vec3 vN;
        void main(){ vec3 c = texture2D(map, vUv).rgb; float l = smoothstep(-0.25, 0.6, dot(normalize(vN), sun)); vec3 col = c * (0.08 + 0.95 * l);
          gl_FragColor = vec4(col, vis);
#include <colorspace_fragment>
}`,
    }));
    this.planet.position.copy(this.planetDir).multiplyScalar(3600);
    this.planet.rotation.set(0.35, 0.2, 0.25);
    this.planet.renderOrder = -5;
    scene.add(this.planet);
    const ringTex = canvasTex(512, 8, (g, w, h) => {
      const rr = rng(8);
      for (let x = 0; x < w; x++) { const a = (0.25 + 0.55 * rr()) * Math.sin(Math.PI * x / w) * (x % 97 < 6 ? 0.2 : 1); g.fillStyle = `rgba(243,224,190,${a})`; g.fillRect(x, 0, 1, h); }
    });
    ringTex.colorSpace = THREE.SRGBColorSpace;
    const rg = new THREE.RingGeometry(560, 900, 96, 1);
    const ruv = rg.attributes.uv, rp = rg.attributes.position;
    for (let i = 0; i < ruv.count; i++) { const d = Math.hypot(rp.getX(i), rp.getY(i)); ruv.setXY(i, (d - 560) / 340, 0.5); }
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, opacity: 0.8 }));
    this.ring.position.copy(this.planet.position);
    this.ring.lookAt(0, 0, 0); this.ring.rotateX(1.25); this.ring.rotateY(0.2);
    this.ring.renderOrder = -4;
    scene.add(this.ring);

    // 抱肚星云 and 午睡黑洞, only at night
    const neb = canvasTex(256, 256, (g, w, h) => {
      const rr = rng(12);
      for (let i = 0; i < 60; i++) {
        const x = w / 2 + (rr() - 0.5) * w * 0.6, y = h / 2 + (rr() - 0.5) * h * 0.5, rad = 20 + rr() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const c = rr() < 0.5 ? '243,220,174' : '142,125,255';
        gr.addColorStop(0, `rgba(${c},${0.12 + rr() * 0.12})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    });
    this.nebula = new THREE.Sprite(new THREE.SpriteMaterial({ map: neb, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0 }));
    this.nebula.position.set(-0.4, 0.62, -0.68).normalize().multiplyScalar(3500); this.nebula.scale.set(1500, 1100, 1);
    this.nebula.renderOrder = -7; scene.add(this.nebula);
    const bh = canvasTex(256, 256, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.36, 'rgba(0,0,0,1)'); gr.addColorStop(0.42, 'rgba(190,175,255,1)'); gr.addColorStop(0.5, 'rgba(142,125,255,.55)'); gr.addColorStop(1, 'rgba(142,125,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this.hole = new THREE.Sprite(new THREE.SpriteMaterial({ map: bh, depthWrite: false, fog: false, transparent: true, opacity: 0 }));
    this.hole.position.set(-0.75, 0.42, 0.5).normalize().multiplyScalar(3500); this.hole.scale.setScalar(380);
    this.hole.renderOrder = -6; scene.add(this.hole);

    // lights
    const sun = this.light = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    const sm = low ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const S = 26;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a4a32, 0.8);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0016);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envRT = null;
    this.lastEnvSun = new THREE.Vector3(9, 9, 9);
    this.sunDir = new THREE.Vector3();
    this.night = 0;
    this.state = {};
  }

  addGoldStar() {
    const g = this.gold;
    if (g.n >= g.max) return;
    const r = Math.random, y = 0.25 + r() * 0.7, a = r() * TAU, rr = Math.sqrt(1 - y * y), i = g.n++;
    g.pos[i * 3] = Math.cos(a) * rr * 3700; g.pos[i * 3 + 1] = y * 3700; g.pos[i * 3 + 2] = Math.sin(a) * rr * 3700;
    g.size[i] = 2.6 + r() * 1.6; g.ph[i] = r() * TAU;
    g.col[i * 3] = 1; g.col[i * 3 + 1] = 0.84; g.col[i * 3 + 2] = 0.4;
    const geo = this.goldPts.geometry;
    for (const k of ['position', 'size', 'ph', 'col']) geo.attributes[k].needsUpdate = true;
    geo.setDrawRange(0, g.n);
  }

  // tod in hours; focus = where the player is (shadow camera follows it)
  update(tod, focus, time, dt) {
    const sd = sunDirection(tod, this.sunDir);
    const e = Math.asin(clamp(sd.y, -1, 1)) * 180 / Math.PI;
    const night = this.night = smooth(-1, -9, e);
    const twilight = smooth(14, 0, e) * (1 - smooth(-3, -10, e));
    const u = this.u;
    u.sunPosition.value.copy(sd);
    u.time.value = time;
    u.rayleigh.value = lerp(1.2, 2.6, twilight);
    u.turbidity.value = lerp(3.2, 6.5, twilight);
    u.mieCoefficient.value = lerp(0.003, 0.006, twilight);

    // sun / moon light
    const L = this.light;
    const moonDir = this.moonDir || (this.moonDir = new THREE.Vector3());
    moonDir.copy(sd).negate(); moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.35; moonDir.normalize();
    const sunCol = ramp(e, [[-2, C(0.9, 0.35, 0.2)], [1, C(1, 0.48, 0.26)], [5, C(1, 0.66, 0.42)], [12, C(1, 0.84, 0.64)], [28, C(1, 0.96, 0.9)]]);
    const sunI = smooth(-2.5, 4, e) * ramp(e, [[0, 1.6], [10, 2.4], [35, 3.1]]);
    const moonI = smooth(-3, -10, e) * 0.55;
    const useMoon = moonI > sunI;
    const dir = useMoon ? moonDir : sd;
    L.color.copy(useMoon ? C(0.62, 0.72, 1.0) : sunCol);
    L.intensity = Math.max(sunI, moonI);
    L.position.copy(focus).addScaledVector(dir, 120);
    L.target.position.copy(focus);
    L.target.updateMatrixWorld();

    this.hemi.color.copy(ramp(e, [[-11, C(0.16, 0.2, 0.38)], [-6, C(0.36, 0.36, 0.6)], [-1, C(0.7, 0.55, 0.65)], [4, C(0.95, 0.68, 0.6)], [15, C(0.75, 0.82, 1)], [40, C(0.68, 0.8, 1)]]));
    this.hemi.groundColor.copy(ramp(e, [[-10, C(0.04, 0.04, 0.06)], [4, C(0.3, 0.22, 0.16)], [30, C(0.38, 0.33, 0.24)]]));
    this.hemi.intensity = ramp(e, [[-11, 0.55], [-5, 0.65], [-1, 0.8], [6, 0.75], [30, 0.8]]);

    const fogCol = ramp(e, [[-11, C(0.035, 0.05, 0.11)], [-5, C(0.16, 0.16, 0.3)], [-1, C(0.45, 0.36, 0.45)], [3, C(0.92, 0.62, 0.48)], [10, C(0.93, 0.8, 0.7)], [30, C(0.72, 0.82, 0.93)]]);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = lerp(0.0014, 0.0022, twilight * 0.5 + night * 0.5);

    this.renderer.toneMappingExposure = ramp(e, [[-11, 0.95], [-5, 0.95], [-1, 0.8], [3, 0.58], [12, 0.44], [25, 0.34], [45, 0.3]]);
    this.scene.environmentIntensity = ramp(e, [[-10, 0.35], [-2, 0.4], [5, 0.7], [30, 0.6]]);

    // night bits
    this.nightDome.material.uniforms.k.value = night;
    this.starMat.uniforms.k.value = night; this.starMat.uniforms.time.value = time;
    this.goldMat.uniforms.k.value = Math.max(night, 0.0); this.goldMat.uniforms.time.value = time;
    this.stars.visible = night > 0.01; this.goldPts.visible = night > 0.01;
    this.stars.rotation.y = time * 0.002; this.goldPts.rotation.y = time * 0.002;
    this.moon.position.copy(moonDir).multiplyScalar(3000); this.moon.material.opacity = smooth(-1, -6, e);
    this.glow.position.copy(this.moon.position); this.glow.material.opacity = night * 0.8;
    this.moon.visible = this.glow.visible = night > 0.01;
    this.nebula.material.opacity = night * 0.9; this.hole.material.opacity = night;
    this.nebula.visible = this.hole.visible = night > 0.01;
    this.planet.material.uniforms.sun.value.copy(sd);
    this.planet.material.uniforms.vis.value = lerp(0.32, 1, Math.max(night, twilight * 0.6));
    this.ring.material.opacity = lerp(0.22, 0.75, Math.max(night, twilight * 0.6));

    this.state = { e, night, twilight, sunCol, sunI };
    this.updateEnv();
    return this.state;
  }

  updateEnv(force) {
    if (!force && this.lastEnvSun.distanceToSquared(this.sunDir) < 0.0004) return;
    this.lastEnvSun.copy(this.sunDir);
    const sky = this.sky;
    this.envScene.add(sky);
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 10000);
    this.scene.add(sky);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
