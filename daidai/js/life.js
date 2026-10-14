import * as THREE from '../lib/three.bundle.js';
import { Kit, rng, paint, TAU, lerp, clamp, smooth } from './util.js';
import { CHUNK, ICELL, coastX, heightAt, groundAt, island, starsInChunk } from './worldgen.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const BACK = 300;   // seconds until a collected star comes back

// ---------------------------------------------------------------- collectible stars (喜欢)
// Streamed per 64 m chunk from worldgen.starsInChunk; the instanced mesh sits at an anchor near
// the player so instance matrices stay small numbers even 50 km from home.
export class Stars {
  constructor(scene, { low = false } = {}) {
    this.R = low ? 2 : 3;                 // chunk radius kept loaded
    this.show = low ? 110 : 170;          // draw distance
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? 0.13 : 0.3;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2 });
    geo.center();
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb81f, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.25 });
    this.cap = 600;
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.cap);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
    scene.add(this.mesh);
    this.chunks = new Map();              // "cx,cz" -> [{id, x, y, z, ph}]
    this.taken = new Map();               // id -> time collected
    this.pops = [];                       // stars flying away after being collected
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.sc = new THREE.Vector3(); this.p = new THREE.Vector3();
    // little burst particles
    const N = 240;
    this.burst = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), i: 0, N };
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.burst.pos, 3));
    bg.setAttribute('life', new THREE.BufferAttribute(this.burst.life, 1));
    this.burstPts = new THREE.Points(bg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { px: { value: 1 } },
      vertexShader: 'attribute float life; varying float vL; uniform float px; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = life * 26.0 * px / -mv.z; }',
      fragmentShader: 'varying float vL; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(1.0, 0.85, 0.45) * a * vL * 1.6, 1.0); }',
    }));
    this.burstPts.frustumCulled = false;
    this.burstPts.layers.set(1);
    scene.add(this.burstPts);
  }

  setQuality(low) { this.R = low ? 2 : 3; this.show = low ? 110 : 170; }

  load(cx, cz) {
    const list = [];
    for (const s of starsInChunk(cx, cz)) {
      const g = groundAt(s.x, s.z);
      if (g.surf === 'water' && g.depth > 0.3) continue;
      const ph = (s.x * 0.37 + s.z * 0.71) % TAU;
      list.push({ id: s.id, x: s.x, y: Math.max(g.y, 0) + 0.95, z: s.z, ph });
    }
    return list;
  }

  // stars currently on the map near (x, z) — for the minimap
  near(x, z, r, time, out = []) {
    for (const list of this.chunks.values()) for (const s of list) {
      if (Math.abs(s.x - x) < r && Math.abs(s.z - z) < r && this.alive(s.id, time)) out.push(s);
    }
    return out;
  }

  alive(id, time) {
    const t = this.taken.get(id);
    if (t === undefined) return true;
    if (time - t > BACK) { this.taken.delete(id); return true; }
    return false;
  }

  pop(x, y, z) {
    const b = this.burst;
    for (let k = 0; k < 18; k++) {
      const i = b.i = (b.i + 1) % b.N;
      b.pos[i * 3] = x; b.pos[i * 3 + 1] = y; b.pos[i * 3 + 2] = z;
      const a = Math.random() * TAU, u = Math.random() * 2 - 1, sp = 2 + Math.random() * 3, rr = Math.sqrt(1 - u * u);
      b.vel[i * 3] = Math.cos(a) * rr * sp; b.vel[i * 3 + 1] = Math.abs(u) * sp + 1.5; b.vel[i * 3 + 2] = Math.sin(a) * rr * sp;
      b.life[i] = 1;
    }
  }

  // returns how many were collected this frame
  update(dt, time, player, pxRatio) {
    // stream chunks around the player
    const pcx = Math.floor(player.x / CHUNK), pcz = Math.floor(player.z / CHUNK), R = this.R;
    for (const key of this.chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > R + 1) this.chunks.delete(key);
    }
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const key = (pcx + dx) + ',' + (pcz + dz);
      if (!this.chunks.has(key)) this.chunks.set(key, this.load(pcx + dx, pcz + dz));
    }
    // anchor the instanced mesh near the player (float precision far from home)
    const ax = Math.round(player.x / 256) * 256, az = Math.round(player.z / 256) * 256;
    this.mesh.position.set(ax, 0, az);
    let got = 0, n = 0;
    const show2 = this.show * this.show;
    for (const list of this.chunks.values()) for (const s of list) {
      if (!this.alive(s.id, time)) continue;
      const dx = s.x - player.x, dz = s.z - player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.0 && Math.abs(s.y - 0.95 - player.y) < 2) {
        this.taken.set(s.id, time); got++;
        this.pops.push({ x: s.x, y: s.y + Math.sin(time * 2.2 + s.ph) * 0.1, z: s.z, ph: s.ph, t: 1, fresh: true });
        continue;
      }
      if (d2 > show2 || n >= this.cap) continue;
      this.q.setFromEuler(this.e.set(0, time * 2.4 + s.ph, 0));
      this.mesh.setMatrixAt(n++, this.m.compose(this.p.set(s.x - ax, s.y + Math.sin(time * 2.2 + s.ph) * 0.1, s.z - az), this.q, this.sc.set(1, 1, 1)));
    }
    // collected ones spin up and away
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (p.fresh) { this.pop(p.x, p.y, p.z); p.fresh = false; }
      p.t -= dt * 2.2;
      if (p.t <= 0) { this.pops.splice(i, 1); continue; }
      const f = 1 - p.t, s = p.t * (1 + f);
      if (n >= this.cap) continue;
      this.q.setFromEuler(this.e.set(0, time * 2.4 + p.ph + f * 12, 0));
      this.mesh.setMatrixAt(n++, this.m.compose(this.p.set(p.x - ax, p.y + f * f * 3.5, p.z - az), this.q, this.sc.set(s, s, s)));
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    const b = this.burst;
    for (let i = 0; i < b.N; i++) {
      if (b.life[i] <= 0) continue;
      b.life[i] = Math.max(0, b.life[i] - dt * 1.4);
      b.vel[i * 3 + 1] -= 6 * dt;
      b.pos[i * 3] += b.vel[i * 3] * dt; b.pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt; b.pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
    }
    this.burstPts.geometry.attributes.position.needsUpdate = true;
    this.burstPts.geometry.attributes.life.needsUpdate = true;
    this.burstPts.material.uniforms.px.value = pxRatio * 40;
    return got;
  }
}

// ---------------------------------------------------------------- seagulls
function gullGeo() {
  const k = new Kit();
  const body = new THREE.SphereGeometry(0.16, 12, 8); body.scale(0.8, 0.75, 2.0);
  k.add(body, 0xf7f7f4);
  k.add(new THREE.SphereGeometry(0.11, 10, 8), 0xf7f7f4, [0, 0.07, 0.3]);
  k.add(new THREE.ConeGeometry(0.035, 0.14, 6), 0xf2a33a, [0, 0.06, 0.45], [Math.PI / 2, 0, 0]);
  const tail = new THREE.ConeGeometry(0.1, 0.25, 4); tail.scale(1.4, 0.3, 1);
  k.add(tail, 0xdedfe2, [0, 0, -0.38], [-Math.PI / 2, 0, 0]);
  return k.build();
}
function wingGeo(side) {
  const pos = [0, 0, 0.12, 0, 0, -0.12, side * 0.55, 0.02, 0.06, side * 0.55, 0.02, -0.1, side * 1.0, -0.02, -0.12];
  const col = [0.93, 0.93, 0.92, 0.93, 0.93, 0.92, 0.85, 0.86, 0.88, 0.85, 0.86, 0.88, 0.22, 0.22, 0.25];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3]);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- sailboat
function boatGeo(sail) {
  const k = new Kit();
  const hull = new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2);
  hull.scale(1.1, 0.7, 3.2);
  k.add(hull, 0xfaf7f0, [0, 0.55, 0]);
  k.add(new THREE.BoxGeometry(2.0, 0.1, 5.6), 0xb08458, [0, 0.55, 0]);
  k.add(new THREE.CylinderGeometry(0.06, 0.07, 7, 6), 0xe8e2d6, [0, 4.0, 0.3]);
  const s = new THREE.BufferGeometry();
  s.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0.2, 0, 7.2, 0.35, 0, 1.2, -2.4, 0, 1.2, 0.5, 0, 6.6, 0.5, 0, 1.0, 2.7], 3));
  s.setIndex([0, 1, 2, 2, 1, 0, 3, 4, 5, 5, 4, 3]);
  s.computeVertexNormals();
  k.addRaw(paint(s.toNonIndexed(), sail));
  return k.build();
}

// ---------------------------------------------------------------- whale
function whaleGeo() {
  const pts = [[0, -3.4], [0.35, -3.2], [0.8, -2.6], [1.15, -1.6], [1.25, -0.4], [1.15, 0.8], [0.85, 1.9], [0.5, 2.7], [0.25, 3.3], [0.14, 3.7], [0, 3.8]].map(([r, z]) => new THREE.Vector2(r, z));
  const g = new THREE.LatheGeometry(pts, 24).toNonIndexed();
  g.rotateX(-Math.PI / 2);   // nose at -z… flip so it faces +z
  g.rotateY(Math.PI);
  g.scale(1, 0.85, 1);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), top = new THREE.Color(0x2c3d52), belly = new THREE.Color(0xc9d3dc), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(belly).lerp(top, smooth(-0.55, 0.15, p.getY(i))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const k = new Kit();
  k.addRaw(g);
  for (const s of [-1, 1]) {
    const fin = new THREE.SphereGeometry(1, 10, 6); fin.scale(0.9, 0.08, 0.35);
    k.add(fin, 0x2c3d52, [s * 1.4, -0.4, 1.4], [0, s * 0.5, s * -0.4]);
    const fl = new THREE.SphereGeometry(1, 10, 6); fl.scale(0.95, 0.07, 0.42);
    k.add(fl, 0x2c3d52, [s * 0.8, 0, -3.7], [0, s * -0.45, 0]);
  }
  k.add(new THREE.SphereGeometry(0.09, 8, 6), 0x111111, [0.93, 0.05, 2.0]);
  k.add(new THREE.SphereGeometry(0.09, 8, 6), 0x111111, [-0.93, 0.05, 2.0]);
  return k.build();
}

// ---------------------------------------------------------------- butterflies + fireflies
function butterflyWing(color) {
  const g = new THREE.CircleGeometry(0.11, 8); g.scale(1, 1.25, 1); g.translate(0.1, 0.03, 0);
  const g2 = new THREE.CircleGeometry(0.075, 8); g2.translate(0.07, -0.09, 0);
  const k = new Kit(); k.add(g, color); k.add(g2, color); const out = k.build(); out.rotateX(-Math.PI / 2); return out;
}

// boats keep clear of offshore islands: a pure function of z, so their wake stays smooth
function boatOff(base, z) {
  let off = base;
  const c = Math.floor(-z / ICELL);
  for (let i = c - 1; i <= c + 2; i++) {
    const s = island(i);
    if (!s) continue;
    const io = s.x - coastX(s.z), k = smooth(s.R + 170, s.R + 50, Math.abs(z - s.z));
    if (k > 0 && base > io - s.R - 60) off = Math.max(off, lerp(base, io + s.R + 70, k));
  }
  return off;
}

export class Life {
  constructor(scene, { low = false } = {}) {
    this.scene = scene;
    const r = this.r = rng(99);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    // gulls
    this.gulls = [];
    const gg = gullGeo(), wl = wingGeo(1), wr = wingGeo(-1);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(gg, mat), L = new THREE.Mesh(wl, mat), R = new THREE.Mesh(wr, mat);
      g.add(body, L, R); g.scale.setScalar(1.3);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(g);
      this.gulls.push({ g, L, R, a: r() * TAU, rad: 9 + r() * 14, h: 9 + r() * 9, sp: 0.18 + r() * 0.12, flap: r() * 10, dir: r() < 0.5 ? 1 : -1 });
    }
    this.gullCenter = null;
    this.gullFade = 1;
    // boats drift along the coast, 150–450 m out
    this.boats = [];
    const sails = [0xffffff, 0xff8f70, 0xfff1c4, 0x9fd0ef];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(boatGeo(sails[i % sails.length]), mat);
      b.castShadow = true;
      b.visible = false;
      scene.add(b);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
      lamp.position.set(0, 7.6, 0.3); b.add(lamp);
      this.boats.push({ b, lamp, z: null, base: 150 + r() * 300, sp: (0.8 + r() * 1.4) * (r() < 0.5 ? 1 : -1), ph: r() * 10 });
    }
    // whale
    this.whale = new THREE.Mesh(whaleGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }));
    this.whale.visible = false; this.whale.castShadow = true;
    scene.add(this.whale);
    this.whaleT = -1; this.nextWhale = 25;
    const N = 160;
    this.splash = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), i: 0, N };
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.splash.pos, 3));
    sg.setAttribute('life', new THREE.BufferAttribute(this.splash.life, 1));
    this.splashPts = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { px: { value: 40 }, tint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: 'attribute float life; varying float vL; uniform float px; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.5 - life) * 60.0 * px / -mv.z; }',
      fragmentShader: 'varying float vL; uniform vec3 tint; void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(tint, a * vL * 0.8); }',
    }));
    this.splashPts.frustumCulled = false;
    scene.add(this.splashPts);

    // butterflies around the player over grass (daytime)
    this.flies = [];
    const fcols = [0xffffff, 0xffd34d, 0xff8fb1, 0x9fd0ef];
    for (let i = 0; i < (low ? 6 : 12); i++) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 });
      const wg = butterflyWing(fcols[i % fcols.length]);
      const L = new THREE.Mesh(wg, m), R = new THREE.Mesh(wg, m); R.scale.x = -1;
      g.add(L, R); g.visible = false; scene.add(g);
      g.traverse(o => o.layers.set(1));
      this.flies.push({ g, L, R, x: 0, z: 0, y: 0, on: false, ph: r() * 10, sp: 0.4 + r() * 0.5, wait: r() * 2 });
    }
    // fireflies around the player at night
    const FN = low ? 70 : 140;
    this.ff = { n: FN, base: new Float32Array(FN * 3), pos: new Float32Array(FN * 3), ph: new Float32Array(FN) };
    for (let i = 0; i < FN; i++) this.ff.ph[i] = r() * 100;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(this.ff.pos, 3));
    fg.setAttribute('ph', new THREE.BufferAttribute(this.ff.ph, 1));
    this.ffMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, k: { value: 0 }, px: { value: 40 } },
      vertexShader: 'attribute float ph; varying float vA; uniform float time; uniform float px; void main(){ vA = pow(0.5 + 0.5 * sin(time * 1.3 + ph), 3.0); vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 6.0 * px / -mv.z; }',
      fragmentShader: 'varying float vA; uniform float k; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * a * vA * k * 1.6, 1.0); }',
    });
    this.fireflies = new THREE.Points(fg, this.ffMat);
    this.fireflies.frustumCulled = false;
    this.fireflies.layers.set(1);
    scene.add(this.fireflies);
    this.g = {};
  }

  splashAt(x, z, n = 50, power = 1) {
    const s = this.splash;
    for (let k = 0; k < n; k++) {
      const i = s.i = (s.i + 1) % s.N;
      const a = Math.random() * TAU, sp = (1 + Math.random() * 3) * power;
      s.pos[i * 3] = x + Math.cos(a) * 1.2; s.pos[i * 3 + 1] = 0.2; s.pos[i * 3 + 2] = z + Math.sin(a) * 1.2;
      s.vel[i * 3] = Math.cos(a) * sp; s.vel[i * 3 + 1] = (4 + Math.random() * 6) * power; s.vel[i * 3 + 2] = Math.sin(a) * sp;
      s.life[i] = 1;
    }
  }

  placeBoat(b, z) {
    b.z = z;
    b.b.visible = true;
  }

  update(dt, time, player, sky, ctx) {
    const r = this.r, night = sky.night;
    const fx = Math.sin(player.heading || 0), fz = Math.cos(player.heading || 0);
    const inland = coastX(player.z) - player.x;          // + when the player is on land
    // gulls hang around above the shoreline a little ahead of you
    const gz = player.z + fz * 18, gx = coastX(gz);
    const target = V3(gx + 4, Math.max(0, heightAt(gx - 10, gz)) + 12, gz);
    if (!this.gullCenter || this.gullCenter.distanceTo(target) > 300) this.gullCenter = target.clone();
    else this.gullCenter.lerp(target, 1 - Math.exp(-dt * 0.4));
    this.gullFade = clamp(this.gullFade + dt * (inland > 400 || night > 0.7 ? -0.5 : 0.5), 0, 1);
    for (const g of this.gulls) {
      g.a += g.sp * dt * g.dir;
      g.flap += dt * (Math.sin(time * 0.3 + g.a) > 0.2 ? 9 : 2.5);
      const x = this.gullCenter.x + Math.cos(g.a) * g.rad, z = this.gullCenter.z + Math.sin(g.a) * g.rad;
      const y = this.gullCenter.y + g.h - 12 + Math.sin(time * 0.7 + g.a * 2) * 1.2 + (1 - this.gullFade) * 40;
      g.g.position.set(x, y, z);
      g.g.rotation.set(0, Math.atan2(-Math.sin(g.a) * g.dir, Math.cos(g.a) * g.dir), -0.35 * g.dir);
      const fl = Math.sin(g.flap) * 0.6;
      g.L.rotation.z = fl; g.R.rotation.z = -fl;
      g.g.visible = this.gullFade > 0.01;
    }
    // boats drift along the coast and bob; recycled when far behind
    for (const b of this.boats) {
      if (b.z === null || Math.abs(b.z - player.z) > 900) {
        const side = b.z === null ? (r() - 0.5) * 2 : -Math.sign(b.z - player.z);
        this.placeBoat(b, player.z + side * (b.z === null ? r() * 500 : 450 + r() * 350));
      }
      b.z += b.sp * dt;
      const off = boatOff(b.base, b.z), x = coastX(b.z) + off;
      const dxdz = (coastX(b.z + 2) + boatOff(b.base, b.z + 2) - coastX(b.z - 2) - boatOff(b.base, b.z - 2)) / 4;
      const s = Math.sign(b.sp);
      b.b.position.set(x, Math.sin(time * 0.8 + b.ph) * 0.15, b.z);
      b.b.rotation.set(Math.sin(time * 0.6 + b.ph) * 0.04, Math.atan2(dxdz * s, s), Math.sin(time * 0.9 + b.ph) * 0.06 + 0.08 * s);
      b.lamp.visible = night > 0.2;
    }
    // the whale breaches now and then, out to sea ahead of you
    this.nextWhale -= dt;
    if (this.whaleT < 0 && this.nextWhale < 0 && night < 0.85) {
      this.nextWhale = 5;
      if (inland < 350) {
        const wz = player.z + (Math.abs(fz) > 0.2 ? Math.sign(fz) : -1) * (55 + r() * 35);
        for (let k = 0, x = coastX(wz) + 80 + r() * 80; k < 4; k++, x += 45) {
          if (heightAt(x, wz) >= -4) continue;
          this.wx = x; this.wz = wz;
          this.wyaw = r() * TAU;
          this.whaleT = 0; this.nextWhale = 40 + r() * 40;
          this.whale.visible = true;
          this.splashAt(this.wx, this.wz, 40, 0.8);
          ctx && ctx.onWhale && ctx.onWhale();
          break;
        }
      }
    }
    if (this.whaleT >= 0) {
      this.whaleT += dt;
      const T = 3.4, f = this.whaleT / T;
      const fwd = V3(Math.sin(this.wyaw), 0, Math.cos(this.wyaw));
      const h = Math.sin(f * Math.PI) * 7 - 3.5;
      this.whale.position.set(this.wx + fwd.x * (f - 0.5) * 9, h, this.wz + fwd.z * (f - 0.5) * 9);
      this.whale.rotation.set(-lerp(1.15, -1.2, f), this.wyaw, Math.sin(f * 3) * 0.5, 'YXZ');
      if (f > 0.78 && !this.splashed) { this.splashed = true; this.splashAt(this.whale.position.x, this.whale.position.z, 90, 1.2); }
      if (f >= 1) { this.whaleT = -1; this.whale.visible = false; this.splashed = false; }
    }
    const s = this.splash;
    for (let i = 0; i < s.N; i++) {
      if (s.life[i] <= 0) continue;
      s.life[i] = Math.max(0, s.life[i] - dt * 0.8);
      s.vel[i * 3 + 1] -= 12 * dt;
      s.pos[i * 3] += s.vel[i * 3] * dt; s.pos[i * 3 + 1] = Math.max(0, s.pos[i * 3 + 1] + s.vel[i * 3 + 1] * dt); s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
    }
    this.splashPts.geometry.attributes.position.needsUpdate = true;
    this.splashPts.geometry.attributes.life.needsUpdate = true;
    this.splashPts.material.uniforms.tint.value.setRGB(lerp(1, 0.4, night), lerp(1, 0.45, night), lerp(1, 0.6, night));

    // butterflies: each one picks a patch of grass/flowers near you and flutters around it
    const g = this.g;
    for (const f of this.flies) {
      if (night >= 0.3) { f.g.visible = false; f.on = false; continue; }
      if (f.on && (f.x - player.x) ** 2 + (f.z - player.z) ** 2 > 45 * 45) f.on = false;
      if (!f.on) {
        f.g.visible = false;
        if ((f.wait -= dt) > 0) continue;
        f.wait = 0.5 + r();
        const a = (player.heading || 0) + (r() - 0.5) * 2.4, d = 10 + r() * 22;
        const x = player.x + Math.sin(a) * d, z = player.z + Math.cos(a) * d;
        groundAt(x, z, g);
        if (g.surf !== 'grass' || g.y < 0.5) continue;
        f.x = x; f.z = z; f.y = g.y; f.on = true;
      }
      f.g.visible = true;
      const wx = f.x + Math.sin(time * 0.23 * f.sp + f.ph) * 3, wz = f.z + Math.cos(time * 0.31 * f.sp + f.ph * 2) * 3;
      f.g.position.set(wx, f.y + 0.6 + Math.sin(time * 1.7 + f.ph) * 0.35, wz);
      f.g.rotation.y = time * 0.5 * f.sp + f.ph;
      const fl = Math.sin(time * 16 + f.ph) * 1.0;
      f.L.rotation.z = fl; f.R.rotation.z = -fl;
    }
    // fireflies drift around a point a little ahead of you, only over land
    this.ffMat.uniforms.time.value = time; this.ffMat.uniforms.k.value = night;
    this.fireflies.visible = night > 0.05;
    if (this.fireflies.visible) {
      const cx = player.x + fx * 6, cz = player.z + fz * 6;
      const ff = this.ff;
      for (let i = 0; i < ff.n; i++) {
        let bx = ff.base[i * 3], bz = ff.base[i * 3 + 2];
        if (!ff.init || (bx - cx) ** 2 + (bz - cz) ** 2 > 30 * 30) {
          bx = cx + (r() - 0.5) * 50; bz = cz + (r() - 0.5) * 50;
          const h = heightAt(bx, bz);
          ff.base[i * 3] = bx; ff.base[i * 3 + 2] = bz; ff.base[i * 3 + 1] = h > 0.2 ? h + 0.4 + r() * 1.8 : -500;
        }
        const ph = ff.ph[i];
        ff.pos[i * 3] = bx + Math.sin(time * 0.3 + ph) * 1.2; ff.pos[i * 3 + 1] = ff.base[i * 3 + 1] + Math.sin(time * 0.5 + ph * 2) * 0.4; ff.pos[i * 3 + 2] = bz + Math.cos(time * 0.27 + ph) * 1.2;
      }
      ff.init = true;
      this.fireflies.geometry.attributes.position.needsUpdate = true;
    }
  }
}
