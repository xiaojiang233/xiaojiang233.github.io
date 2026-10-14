// The falling dream (the easter egg inside the nap pod): endless first-person fall down a warping tunnel.
// Dodge grey debris, collect glowing dream shards; the deeper you go the stranger it gets. At the very
// bottom you wake up in Naiwa's bed. While you "sleep" (no input) it plays itself on autopilot.
import * as THREE from '../../daidai/lib/three.bundle.js';

const R_TUNNEL = 17, R_PLAY = 6.6, SPAWN_Z = -230, DEPTH_MAX = 3000;

const TUNNEL_VS = `varying vec2 vUv; varying float vL;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vL = -w.z; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TUNNEL_FS = /* glsl */`
precision highp float;
varying vec2 vUv; varying float vL;
uniform float uDist, uProg, uTime;
uniform vec3 uCA, uCB, uCC;
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main() {
  float a = vUv.x * 6.2831853, l = vL, z = l + uDist;
  float tw = a + z * (.004 + uProg * .009) + sin(z * .011) * .9;
  float n1 = fbm(vec2(tw * 2.0, z * .03));
  float n2 = fbm(vec2(tw * 5.0 + z * .02, z * .08));
  float streak = smoothstep(.45, .8, n1) * .9 + smoothstep(.55, .85, n2) * .55;
  float bands = .5 + .5 * sin(a * 3.0 + z * .02 + uTime * .2);
  vec3 col = mix(uCA, uCB, n1);
  col = mix(col, mix(uCB * 1.9, uCC, smoothstep(.35, 1.0, streak)), clamp(streak, 0.0, 1.0));
  col *= .28 + .95 * streak + .3 * bands;
  col = mix(col * exp(-l * .0035), uCC * 1.15, smoothstep(240., 520., l) * .85);
  // sparkle
  col += uCC * pow(h12(floor(vec2(tw * 40.0, z * .5))), 40.0) * .8;
  col = 1.0 - exp(-col * 1.1);
  col = mix(vec3(dot(col, vec3(.3, .6, .1))), col, 1.55);
  gl_FragColor = vec4(col, 1.0);
}`;

// colour stops by depth: indigo -> magenta -> teal -> warm cream (the bed)
const PAL = [
  [[.04, .03, .16], [.28, .16, .6], [.55, .82, 1.0]],
  [[.09, .02, .18], [.62, .15, .52], [1.0, .62, .74]],
  [[.02, .10, .20], [.10, .52, .62], [.62, 1.0, .88]],
  [[.20, .10, .05], [.92, .52, .20], [1.0, .93, .72]],
];

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Dream {
  constructor(renderer, naiwaUrl) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x000000, 40, 220);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600);
    this.active = false; this.ended = false;
    this.tunnelU = { uDist: { value: 0 }, uProg: { value: 0 }, uTime: { value: 0 }, uCA: { value: new THREE.Color() }, uCB: { value: new THREE.Color() }, uCC: { value: new THREE.Color() } };
    const tg = new THREE.CylinderGeometry(R_TUNNEL, R_TUNNEL, 520, 64, 80, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -260);
    this.tunnel = new THREE.Mesh(tg, new THREE.ShaderMaterial({ uniforms: this.tunnelU, vertexShader: TUNNEL_VS, fragmentShader: TUNNEL_FS, side: THREE.BackSide, depthWrite: false }));
    this.tunnel.renderOrder = -1; this.tunnel.frustumCulled = false;
    this.scene.add(this.tunnel);

    this.rings = [];
    const rg = new THREE.TorusGeometry(R_TUNNEL - .5, .11, 6, 72);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 }));
      m.position.z = -i * 28; this.scene.add(m); this.rings.push(m);
    }
    const N = 420, pp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, r = 3 + Math.random() * 13; pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = Math.sin(a) * r; pp[i * 3 + 2] = -Math.random() * 300; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffffff, size: .7, map: null, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.material.map = glowTexture(); this.dust.frustumCulled = false; this.scene.add(this.dust);

    this.scene.add(new THREE.HemisphereLight(0xc7b8ff, 0x2a1840, 1.5));
    const dl = new THREE.DirectionalLight(0xfff0d8, 2.4); dl.position.set(.4, .7, 1); this.scene.add(dl);

    this.glowTex = glowTexture();
    this.debrisGeo = new THREE.IcosahedronGeometry(1, 0);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x6a5c86, roughness: .95, metalness: 0, flatShading: true, emissive: 0x1a1030 });
    this.shardGeo = new THREE.OctahedronGeometry(.62, 0); this.shardGeo.scale(1, 1.55, 1);
    this.naiwaTex = new THREE.TextureLoader().load(naiwaUrl);
    this.naiwaTex.colorSpace = THREE.SRGBColorSpace;
    this.items = [];
    this.keys = {};
    this.speedMul = 1;
    this.cbs = {};
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  start(cbs = {}, opts = {}) {
    this.cbs = cbs;
    this.items.forEach(it => this.scene.remove(it.obj)); this.items = [];
    this.g = { dist: 0, prog: 0, hearts: 3, shards: 0, invuln: 0, passive: opts.passive !== false, lastInput: performance.now(), t: 0, acc: 0, gap: 12, px: 0, py: 0, tx: 0, ty: 0, shake: 0, finish: -1, streak: 0 };
    this.speedMul = opts.speed || 1;
    this.active = true; this.ended = false;
    this.camera.position.set(0, 0, 0); this.camera.rotation.set(0, 0, 0);
    this._palette(0);
    for (let k = 0; k < 6; k++) { this._spawn(true); }
    this.cbs.onHearts && this.cbs.onHearts(3);
  }
  stop() { this.active = false; }

  input(nx, ny) {
    const g = this.g; if (!g) return;
    g.tx = THREE.MathUtils.clamp(nx, -1, 1) * R_PLAY; g.ty = THREE.MathUtils.clamp(-ny, -1, 1) * R_PLAY; this._touch();
  }
  _touch() {
    const g = this.g; g.lastInput = performance.now();
    if (g.passive) { g.passive = false; this.cbs.onTakeover && this.cbs.onTakeover(); }
  }

  _palette(p) {
    const s = THREE.MathUtils.clamp(p, 0, .9999) * 3, i = Math.floor(s), f = s - i, a = PAL[i], b = PAL[i + 1];
    const set = (u, k) => u.value.setRGB(a[k][0] + (b[k][0] - a[k][0]) * f, a[k][1] + (b[k][1] - a[k][1]) * f, a[k][2] + (b[k][2] - a[k][2]) * f);
    set(this.tunnelU.uCA, 0); set(this.tunnelU.uCB, 1); set(this.tunnelU.uCC, 2);
    const c = this.tunnelU.uCC.value;
    this.rings.forEach(r => r.material.color.copy(c));
    this.dust.material.color.copy(c).lerp(new THREE.Color(1, 1, 1), .5);
    this.shardColor = c;
  }

  // ---- spawning --------------------------------------------------------------------------------
  _add(obj, type, x, y, z, extra = {}) {
    obj.position.set(x, y, z); this.scene.add(obj);
    const it = Object.assign({ obj, type, x, y, z, dead: 0, spin: new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(1.6) }, extra);
    this.items.push(it); return it;
  }
  _debris(x, y, z) {
    const m = new THREE.Mesh(this.debrisGeo, this.debrisMat), s = .8 + Math.random() * 1.6;
    m.scale.set(s * (.8 + Math.random() * .5), s * (.8 + Math.random() * .5), s * (.8 + Math.random() * .5));
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    return this._add(m, 'debris', x, y, z, { rad: s * .95 });
  }
  _shard(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({ color: this.shardColor.clone().lerp(new THREE.Color(1, 1, 1), .3), transparent: true });
    const m = new THREE.Mesh(this.shardGeo, mat);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: this.shardColor.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(4, 4, 1); m.add(sp);
    return this._add(m, 'shard', x, y, z, { rad: 1.7, glow: sp });
  }
  _heal(x, y, z) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.naiwaTex, transparent: true }));
    sp.scale.set(2.2 * .57, 2.2, 1);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffd60a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(7, 7, 1); sp.add(gl);
    return this._add(sp, 'heal', x, y, z, { rad: 2, glow: gl, spin: new THREE.Vector3() });
  }
  _spawn(initial) {
    const g = this.g, z0 = initial ? -40 - Math.random() * 180 : SPAWN_Z, r = Math.random();
    const rp = () => { const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * R_PLAY * 1.15; return [Math.cos(a) * d, Math.sin(a) * d]; };
    if (r < .52) {
      const n = 1 + (Math.random() < .35 + g.prog * .3) + (Math.random() < g.prog * .4);
      for (let i = 0; i < n; i++) {
        let [x, y] = rp();
        if (i === 0 && Math.random() < .4) { x = g.px + (Math.random() - .5) * 3; y = g.py + (Math.random() - .5) * 3; }   // sometimes right in your way
        this._debris(x, y, z0 - i * 5);
      }
    } else if (r < .92) {
      const [cx, cy] = rp(), a0 = Math.random() * 6.283, A = 1.4 + Math.random() * 2.2, n = 5;
      for (let k = 0; k < n; k++) this._shard(THREE.MathUtils.clamp(cx + Math.cos(a0 + k * .7) * A, -R_PLAY, R_PLAY), THREE.MathUtils.clamp(cy + Math.sin(a0 + k * .7) * A, -R_PLAY, R_PLAY), z0 - k * 7);
    } else if (g.hearts < 3) {
      const [x, y] = rp(); this._heal(x, y, z0);
    }
  }

  // ---- per frame -------------------------------------------------------------------------------
  update(dt) {
    const g = this.g; if (!g || !this.active) return;
    dt = Math.min(dt, .05);
    g.t += dt;
    const now = performance.now();
    // keyboard steering
    const k = this.keys, kx = (k.ArrowRight || k.d || k.D ? 1 : 0) - (k.ArrowLeft || k.a || k.A ? 1 : 0), ky = (k.ArrowUp || k.w || k.W ? 1 : 0) - (k.ArrowDown || k.s || k.S ? 1 : 0);
    if (kx || ky) { g.tx = THREE.MathUtils.clamp(g.tx + kx * 11 * dt, -R_PLAY, R_PLAY); g.ty = THREE.MathUtils.clamp(g.ty + ky * 11 * dt, -R_PLAY, R_PLAY); this._touch(); }
    // drift back to autopilot if you stop moving for a while (you fell asleep again)
    if (!g.passive && g.finish < 0 && now - g.lastInput > 14000) { g.passive = true; this.cbs.onPassive && this.cbs.onPassive(); }
    if (g.passive) this._autopilot(dt);

    const ending = g.finish >= 0;
    const speed = (16 + 24 * g.prog) * (g.passive ? .75 : 1) * this.speedMul * (ending ? 1 + g.finish * 2 : 1);
    const mv = speed * dt;
    g.dist += mv; g.prog = Math.min(1, g.dist / DEPTH_MAX);
    if (g.prog >= 1 && g.finish < 0) { g.finish = 0; this.cbs.onFinish && this.cbs.onFinish(); }
    if (ending) { g.finish += dt / 3; if (g.finish >= 1 && !this.ended) { this.ended = true; this.cbs.onEnd && this.cbs.onEnd('bed'); } }

    // player
    const sm = 1 - Math.exp(-(g.passive ? 3.2 : 8) * dt);
    g.px += (g.tx - g.px) * sm; g.py += (g.ty - g.py) * sm;
    g.invuln = Math.max(0, g.invuln - dt); g.shake = Math.max(0, g.shake - dt * 2.2);

    // world scroll
    this.tunnelU.uDist.value = g.dist; this.tunnelU.uProg.value = g.prog; this.tunnelU.uTime.value = g.t;
    this._palette(g.prog);
    for (const r of this.rings) { r.position.z += mv; if (r.position.z > 3) r.position.z -= 448; }
    const dp = this.dust.geometry.attributes.position.array;
    for (let i = 2; i < dp.length; i += 3) { dp[i] += mv * 1.25; if (dp[i] > 2) dp[i] -= 300; }
    this.dust.geometry.attributes.position.needsUpdate = true;

    // items
    g.acc += mv;
    if (g.acc > g.gap) { g.acc = 0; g.gap = (20 - g.prog * 6) * (.7 + Math.random() * .7); if (!ending) this._spawn(false); }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.z += mv; it.obj.position.z = it.z;
      if (it.type === 'debris') { it.obj.rotation.x += it.spin.x * dt; it.obj.rotation.y += it.spin.y * dt; it.obj.rotation.z += it.spin.z * dt; }
      else if (it.type === 'shard') { it.obj.rotation.y += 2.2 * dt; it.obj.rotation.z = Math.sin(g.t * 2 + it.x) * .3; }
      else { it.obj.position.y = it.y + Math.sin(g.t * 2 + it.x) * .3; }
      if (it.dead) {
        it.dead += dt * 3.2; const s = 1 + it.dead * 1.6;
        it.obj.scale.setScalar(s * (it.type === 'heal' ? 1 : 1)); const o = Math.max(0, 1 - it.dead);
        if (it.obj.material && it.type !== 'debris') it.obj.material.opacity = o; if (it.glow) it.glow.material.opacity = o;
        if (it.dead >= 1) { this.scene.remove(it.obj); this.items.splice(i, 1); }
        continue;
      }
      if (it.z > 8 || (ending && it.z > -2)) { this.scene.remove(it.obj); this.items.splice(i, 1); continue; }
      if (it.z > -1.4 && it.z < 1.6) {
        const d = Math.hypot(it.x - g.px, it.y - g.py);
        if (it.type === 'shard' && d < it.rad + .5) { it.dead = .001; g.shards++; g.streak++; g.dist += 25; this.cbs.onShard && this.cbs.onShard(g.shards, g.streak); }
        else if (it.type === 'heal' && d < it.rad + .7) { it.dead = .001; if (g.hearts < 3) { g.hearts++; this.cbs.onHearts && this.cbs.onHearts(g.hearts); } this.cbs.onHeal && this.cbs.onHeal(); }
        else if (it.type === 'debris' && d < it.rad + .55 && g.invuln <= 0 && !g.passive && !ending) {
          g.hearts--; g.invuln = 1.6; g.shake = 1; g.streak = 0; it.dead = .001;
          this.cbs.onHearts && this.cbs.onHearts(g.hearts); this.cbs.onHit && this.cbs.onHit(g.hearts);
          if (g.hearts <= 0 && !this.ended) { this.ended = true; this.cbs.onEnd && this.cbs.onEnd('bump'); }
        } else if (it.type === 'debris' && g.passive && d < it.rad + .55 && !it.soft) { it.soft = true; }   // sleepwalking: you drift through
      }
    }

    // camera: follows the player, rolls and breathes wider the deeper you are
    const sh = g.shake * .35, c = this.camera;
    c.position.set(g.px * .8 + (Math.random() - .5) * sh, g.py * .8 + (Math.random() - .5) * sh, 0);
    c.rotation.set(-g.py * .012, -g.px * .012, Math.sin(g.t * .17) * .22 * g.prog + g.px * .006);
    c.fov = 72 + g.prog * 16 * Math.sin(g.t * .33) + (speed - 16) * .25 + (ending ? g.finish * 30 : 0);
    c.updateProjectionMatrix();
    this.cbs.onProgress && this.cbs.onProgress(g.prog, g.dist);
  }

  _autopilot(dt) {
    const g = this.g; let best = null, bz = -1e9;
    for (const it of this.items) if (!it.dead && it.type !== 'debris' && it.z < -4 && it.z > -85 && it.z > bz) { best = it; bz = it.z; }
    // nearest approaching collectible in front of us
    let tx = Math.sin(g.t * .4) * 3.2, ty = Math.cos(g.t * .31) * 2.4;
    if (best) { tx = best.x; ty = best.y; }
    for (const it of this.items) {
      if (it.dead || it.type !== 'debris' || it.z > -2 || it.z < -60) continue;
      let dx = tx - it.x, dy = ty - it.y, d = Math.hypot(dx, dy) || .01, lim = it.rad + 2.6;
      if (d < lim) { const push = (lim - d) * (1 + (60 + it.z) / 60); tx += dx / d * push; ty += dy / d * push; }
    }
    const r = Math.hypot(tx, ty); if (r > R_PLAY) { tx *= R_PLAY / r; ty *= R_PLAY / r; }
    g.tx = tx; g.ty = ty;
  }

  render() { if (this.active) this.renderer.render(this.scene, this.camera); }
}
export const DEPTH = DEPTH_MAX;
