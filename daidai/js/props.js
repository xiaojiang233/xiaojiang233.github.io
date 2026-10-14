import * as THREE from '../lib/three.bundle.js';
import { Kit, rng, canvasTex, roundRect, paint, tubeGeo, noise2, clamp, TAU, lerp, smooth, canvas } from './util.js';
import { ROAD_HALF, BAND, SPOT, heightAt, roadY, sandF, roadR, tOf } from './world.js';
import { Naiwa, VARIANTS } from './naiwa.js';
import { trp } from './i18n.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const M4 = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), Array.isArray(s) ? V3(...s) : V3(s, s, s));

export const mats = {};
function initMats() {
  if (mats.prop) return;
  mats.prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  mats.leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  mats.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 });
  mats.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffc96b, emissiveIntensity: 0.0, roughness: 0.3 });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 0.2, roughness: 0.15, metalness: 0.1 });
  mats.water = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
}

// Instances are split into sectors around the island so off-screen ones get culled.
function scatter(group, geo, mat, list, { shadow = true, colors = null, sectors = 12 } = {}) {
  const buckets = Array.from({ length: sectors }, () => []);
  list.forEach((m, i) => {
    const p = V3().setFromMatrixPosition(m);
    buckets[Math.floor(tOf(p.x, p.z) * sectors) % sectors].push(i);
  });
  for (const b of buckets) {
    if (!b.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, b.length);
    b.forEach((i, k) => { im.setMatrixAt(k, list[i]); if (colors) im.setColorAt(k, colors[i]); });
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }
}

// ---------------------------------------------------------------- vegetation
function frond(L, W, droop, fold, c0, c1) {
  const rows = 10, pos = [], col = [], idx = [];
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  for (let i = 0; i <= rows; i++) {
    const u = i / rows, x = u * L, y = -droop * u * u + 0.35 * u;
    const w = W * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.04)), 0.7);
    pos.push(x, y - fold * w, -w, x, y + 0.02, 0, x, y - fold * w, w);
    c.copy(a).lerp(b, u);
    col.push(c.r * 0.82, c.g * 0.82, c.b * 0.82, c.r, c.g, c.b, c.r * 0.82, c.g * 0.82, c.b * 0.82);
    if (i < rows) { const o = i * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function palmGeo(seed) {
  const r = rng(seed), k = new Kit();
  const H = 5.5 + r() * 2.5, segs = 10, lean = 0.6 + r() * 1.2;
  const bend = y => V3(lean * (y / H) ** 2, y, 0);
  for (let i = 0; i < segs; i++) {
    const r0 = lerp(0.24, 0.15, i / segs), r1 = lerp(0.24, 0.15, (i + 1) / segs);
    k.addRaw(paint(tubeGeo(bend(i / segs * H), bend((i + 1) / segs * H), r0, 7, r1 * 0.9), i % 2 ? 0x8b6a45 : 0xa07f55));
  }
  const top = bend(H);
  const n = 8 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = frond(2.4 + r() * 0.8, 0.42, 1.5 + r() * 0.6, 0.35, 0x3f7f2c, 0x86b947);
    g.rotateZ(0.25 + r() * 0.3);
    g.rotateY(i / n * TAU + r() * 0.3);
    g.translate(top.x, top.y, top.z);
    k.addRaw(g.toNonIndexed());
  }
  for (let i = 0; i < 3; i++) k.add(new THREE.SphereGeometry(0.14, 8, 6), 0x6b4a22, [top.x + Math.cos(i * 2.1) * 0.18, top.y - 0.18, top.z + Math.sin(i * 2.1) * 0.18]);
  return k.build();
}

function blob(r, detail, seed, cLow, cHigh, sq = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position, rr = rng(seed);
  const off = rr() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.18 * noise2(x * 1.3 + off, z * 1.3 + y) + 0.08 * noise2(y * 3 + off, x * 3);
    p.setXYZ(i, x * n, y * n * sq, z * n);
  }
  g.computeVertexNormals();
  const ng = g.index ? g.toNonIndexed() : g; // flat-ish facets read nicely from far away
  ng.computeVertexNormals();
  const q = ng.attributes.position, col = new Float32Array(q.count * 3), a = new THREE.Color(cLow), b = new THREE.Color(cHigh), c = new THREE.Color();
  for (let i = 0; i < q.count; i++) { c.copy(a).lerp(b, clamp((q.getY(i) / r + 0.6) / 1.4, 0, 1)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function treeGeo(seed, palette) {
  const r = rng(seed), k = new Kit();
  const h = 1.8 + r() * 1.2;
  k.addRaw(paint(tubeGeo(V3(0, -0.3, 0), V3(0, h + 0.6, 0), 0.2, 7, 0.12), 0x7a5a3c));
  k.addRaw(paint(tubeGeo(V3(0, h * 0.7, 0), V3(0.7, h + 0.5, 0.2), 0.09, 5, 0.05), 0x7a5a3c));
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r(), rad = i === 0 ? 0 : 0.8 + r() * 0.4;
    const b = blob(1.0 + r() * 0.5, 1, seed * 7 + i, palette[0], palette[1], 0.85);
    b.translate(Math.cos(a) * rad, h + 1.0 + r() * 0.8 + (i === 0 ? 0.6 : 0), Math.sin(a) * rad);
    k.addRaw(b);
  }
  return k.build();
}

function bushGeo(seed, palette) {
  const r = rng(seed), k = new Kit();
  for (let i = 0; i < 3; i++) {
    const b = blob(0.45 + r() * 0.3, 1, seed * 3 + i, palette[0], palette[1], 0.8);
    b.translate((r() - 0.5) * 0.8, 0.3, (r() - 0.5) * 0.8);
    k.addRaw(b);
  }
  return k.build();
}

function rockGeo(seed) {
  const g = new THREE.DodecahedronGeometry(1, 1), p = g.attributes.position, off = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.25 * noise2(x * 1.7 + off, z * 1.7 - y) + 0.1 * noise2(y * 4 + off, z * 4);
    p.setXYZ(i, x * n, y * n * 0.72, z * n);
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
  const q = ng.attributes.position, col = new Float32Array(q.count * 3), c = new THREE.Color(), a = new THREE.Color(0x77706a), b = new THREE.Color(0xa8a196);
  for (let i = 0; i < q.count; i++) { c.copy(a).lerp(b, clamp(q.getY(i) * 0.6 + 0.5 + noise2(q.getX(i) * 3, q.getZ(i) * 3) * 0.2, 0, 1)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function grassGeo() {
  const pos = [], col = [], r = rng(9), base = new THREE.Color(0x3f7a2a), tip = new THREE.Color(0xb5d46a);
  for (let i = 0; i < 7; i++) {
    const a = r() * TAU, d = r() * 0.15, h = 0.3 + r() * 0.35, w = 0.035, lean = 0.12 + r() * 0.15;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, dx = Math.cos(a + 1.57) * w, dz = Math.sin(a + 1.57) * w;
    pos.push(x - dx, 0, z - dz, x + dx, 0, z + dz, x + Math.cos(a) * lean, h, z + Math.sin(a) * lean);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function flowerGeo() {
  const k = new Kit();
  const pet = new THREE.CircleGeometry(0.075, 5); pet.rotateX(-Math.PI / 2);
  const pp = pet.attributes.position;
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), a = Math.atan2(z, x); const s = 0.75 + 0.25 * Math.cos(a * 5); pp.setXYZ(i, x * s, 0.02 * Math.hypot(x, z) / 0.075, z * s); }
  k.add(pet, 0xffffff, [0, 0.13, 0]);
  k.add(new THREE.SphereGeometry(0.026, 5, 3), 0xffd34d, [0, 0.14, 0]);
  return k.build();
}

// Soft additive halos so lights glow at night (no post-processing needed).
let glowTex = null;
export function glowPoints(positions, size, color = 0xffd9a0) {
  glowTex = glowTex || canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const g = new THREE.BufferGeometry().setFromPoints(positions);
  const m = new THREE.PointsMaterial({ map: glowTex, size, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false });
  const p = new THREE.Points(g, m);
  p.renderOrder = 5;
  return p;
}

// ---------------------------------------------------------------- textures
function stripes(cols, n = 8, w = 256, h = 64) {
  return canvasTex(w, h, (g) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * w / n, 0, w / n + 1, h); } });
}
function radialTex(inner = 'rgba(255,220,150,1)') {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.4, 'rgba(255,200,120,.45)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

let naiwaImg = null;
function getNaiwaImg(cb) {
  if (naiwaImg && naiwaImg.complete) return naiwaImg;
  if (!naiwaImg) { naiwaImg = new Image(); naiwaImg.src = '../naiwa.png'; }
  naiwaImg.addEventListener('load', cb, { once: true });
  return null;
}

// Signs re-draw themselves when the language changes.
const signs = [];
export function relabel() { for (const s of signs) s.draw(); }

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Hiragino Sans", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
function fitText(g, text, maxW, size, weight = 700) {
  let s = size;
  do { g.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (g.measureText(text).width > maxW && s > 10);
}

function signTexture(style, keys, W = 512, H = 256, icon = false) {
  const [c, g] = canvas(W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const draw = () => {
    g.clearRect(0, 0, W, H);
    const lines = keys.map(k => trp(k));
    if (style === 'road') {
      g.fillStyle = '#f7f5ee'; roundRect(g, 0, 0, W, H, 34); g.fill();
      g.strokeStyle = '#21487a'; g.lineWidth = 16; roundRect(g, 14, 14, W - 28, H - 28, 26); g.stroke();
      g.fillStyle = '#21487a';
    } else if (style === 'warn') {
      g.fillStyle = '#ffd23f'; roundRect(g, 0, 0, W, H, 34); g.fill();
      g.strokeStyle = '#1d1d1d'; g.lineWidth = 14; roundRect(g, 14, 14, W - 28, H - 28, 26); g.stroke();
      g.fillStyle = '#1d1d1d';
    } else if (style === 'wood') {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#a77548'); gr.addColorStop(1, '#8a5c34');
      g.fillStyle = gr; roundRect(g, 0, 0, W, H, 22); g.fill();
      g.strokeStyle = 'rgba(60,35,15,.35)'; g.lineWidth = 3;
      for (let y = 40; y < H; y += 46) { g.beginPath(); g.moveTo(10, y); g.lineTo(W - 10, y + 4); g.stroke(); }
      g.fillStyle = '#fff3d9';
    } else if (style === 'gold') {
      const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#ff9f0a'); gr.addColorStop(0.55, '#ffd60a'); gr.addColorStop(1, '#f3dcae');
      g.fillStyle = '#16182b'; roundRect(g, 0, 0, W, H, 30); g.fill();
      g.fillStyle = gr;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const img = icon ? getNaiwaImg(draw) : null;
    let left = 0;
    if (img) { const ih = H * 0.66, iw = ih * img.width / img.height; g.drawImage(img, 40, (H - ih) / 2, iw, ih); left = iw + 30; }
    const cx = left / 2 + W / 2, maxW = W - left - 70;
    if (lines.length === 1) { fitText(g, lines[0], maxW, H * 0.34); g.fillText(lines[0], cx, H / 2 + 4); }
    else {
      fitText(g, lines[0], maxW, H * 0.3); g.fillText(lines[0], cx, H * 0.38);
      fitText(g, lines[1], maxW, H * 0.16, 600); g.globalAlpha = 0.85; g.fillText(lines[1], cx, H * 0.7); g.globalAlpha = 1;
    }
    tex.needsUpdate = true;
  };
  draw();
  signs.push({ draw });
  return tex;
}

function signMesh(style, keys, w = 1.6, h = 0.8, posts = 1, postH = 1.6, icon = false) {
  const g = new THREE.Group();
  const tex = signTexture(style, keys, 512, Math.round(512 * h / w), icon);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: true, alphaTest: 0.1 }));
  face.position.set(0, postH + h / 2, 0.035);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h * 0.98, 0.05), new THREE.MeshStandardMaterial({ color: style === 'wood' ? 0x7a4f2c : 0x9aa0a6, roughness: 0.6, metalness: style === 'wood' ? 0 : 0.5 }));
  back.position.set(0, postH + h / 2, 0);
  g.add(face, back);
  const pm = new THREE.MeshStandardMaterial({ color: style === 'wood' ? 0x6b4527 : 0x8d9399, roughness: 0.5, metalness: style === 'wood' ? 0 : 0.6 });
  const xs = posts === 1 ? [0] : [-w * 0.38, w * 0.38];
  for (const x of xs) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, postH + h * 0.6, 8), pm); p.position.set(x, (postH + h * 0.6) / 2, -0.04); g.add(p); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------------------------------------------------------- bake a posed Naiwa into a few meshes
export function bake(n) {
  n.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(n.root.matrixWorld).invert();
  const byMat = new Map();
  n.root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const ng = g.index ? g.toNonIndexed() : g;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(ng);
  });
  const out = new THREE.Group();
  for (const [m, list] of byMat) {
    const mesh = new THREE.Mesh(THREE.mergeGeometries(list), m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// ---------------------------------------------------------------- the whole set dressing
export function buildProps(scene, path, { low = false } = {}) {
  initMats();
  const root = new THREE.Group();
  scene.add(root);
  const anim = [];      // per-frame callbacks (dt, time, night)
  const npcs = [];      // residents with things to say
  const keepOut = [];   // [x, z, radius] spots the random scatter avoids
  const r = rng(42);

  const place = (t, lat, ground = true) => path.place(t, lat, ground);
  // face: 'along' (look down the road), 'road' (look at the road), 'sea' (look out to sea), 'oncoming' (towards riders)
  const put = (obj, t, lat, { face = 'road', dy = 0, ground = true, yaw = 0, parent = root } = {}) => {
    const p = place(t, lat, ground);
    obj.position.set(p.x, p.y + dy, p.z);
    const o = p.o;
    let dir;
    if (face === 'along') dir = [o.tx, o.tz];
    else if (face === 'oncoming') dir = [-o.tx, -o.tz];
    else if (face === 'sea') dir = [o.nx, o.nz];
    else dir = lat > 0 ? [-o.nx, -o.nz] : [o.nx, o.nz];
    obj.rotation.y = Math.atan2(dir[0], dir[1]) + yaw;
    parent.add(obj);
    keepOut.push([p.x, p.z, 4]);
    return p;
  };

  const npc = (variant, setup, t, lat, opts, lines, headY = 1.2) => {
    const n = new Naiwa({ variant });
    setup(n);
    const baked = bake(n);
    const holder = new THREE.Group();
    holder.add(baked);
    put(holder, t, lat, opts);
    const rec = { holder, baked, lines, t, wiggle: 0, head: new THREE.Vector3(), headY, phase: r() * 10 };
    npcs.push(rec);
    return rec;
  };

  // ---------------- road furniture: lamps (+ light pools), guard rails, beach fences
  {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.13, 0.17, 0.35, 10), 0x2f4a48, [0, 0.17, 0]);
    k.add(new THREE.CylinderGeometry(0.055, 0.07, 4.5, 10), 0x2f4a48, [0, 2.4, 0]);
    k.addRaw(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 4.5, 0), V3(0, 4.95, 0.3), V3(0, 5.02, 0.8), V3(0, 4.92, 1.25)]), 12, 0.04, 6), 0x2f4a48));
    k.add(new THREE.CylinderGeometry(0.09, 0.26, 0.22, 12, 1, true), 0x2f4a48, [0, 4.82, 1.3]);
    k.add(new THREE.SphereGeometry(0.08, 8, 6), 0x2f4a48, [0, 4.95, 1.3]);
    const lampGeo = k.build();
    const bulbGeo = new THREE.SphereGeometry(0.11, 12, 8);
    const poolGeo = new THREE.CircleGeometry(3.6, 24); poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({ map: radialTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const lamps = [], bulbs = [], pools = [];
    const lampPos = [];
    const step = 46;
    for (let s = 20; s < path.length - 10; s += step) {
      const o = path.at(s), lat = -(ROAD_HALF + 0.8);
      const x = o.x + o.nx * lat, z = o.z + o.nz * lat, y = o.y - 0.25, yaw = Math.atan2(o.nx, o.nz);
      lamps.push(M4(x, y, z, yaw));
      const bx = x + o.nx * 1.3, bz = z + o.nz * 1.3;
      bulbs.push(M4(bx, y + 4.7, bz, 0, [1, 0.6, 1]));
      pools.push(M4(bx, o.y + 0.05, bz, 0, 1));
      lampPos.push(V3(bx, y + 4.6, bz));
    }
    scatter(root, lampGeo, mats.prop, lamps);
    scatter(root, bulbGeo, mats.bulb, bulbs, { shadow: false });
    scatter(root, poolGeo, poolMat, pools, { shadow: false });
    root.userData.lampPos = lampPos;
    const halos = glowPoints(lampPos.map(p => p.clone().add(V3(0, 0.08, 0))), 3.2);
    root.add(halos);
    anim.push((dt, time, night) => { poolMat.opacity = night * 0.55; poolMat.visible = night > 0.02; halos.material.opacity = night * 0.9; halos.visible = night > 0.02; });
  }
  {
    // metal guard rail on the sea side where the road is up on the cliffs
    const posts = [], railPos = [], railIdx = [];
    const lat = ROAD_HALF + 0.75;
    let run = null;
    const flush = () => { run = null; };
    for (let s = 0; s < path.length; s += 0.8) {
      const o = path.at(s);
      const want = roadY(o.t) > 4.2 && sandF(o.t) < 0.3 && !(Math.abs(o.t - SPOT.viewpoint) < 0.006) && !(Math.abs(o.t - SPOT.lighthouse) < 0.004);
      if (!want) { flush(); continue; }
      const x = o.x + o.nx * lat, z = o.z + o.nz * lat, y = o.y;
      if (Math.round(s / 0.8) % 3 === 0) posts.push(M4(x, y, z, Math.atan2(o.tx, o.tz)));
      const base = railPos.length / 3;
      for (const h of [0.55, 0.85]) railPos.push(x, y + h, z);
      if (run !== null) { railIdx.push(run, base, run + 1, run + 1, base, base + 1); }
      run = base;
    }
    const pg = new THREE.BoxGeometry(0.08, 0.95, 0.08); pg.translate(0, 0.47, 0); paint(pg, 0xb9bec4);
    scatter(root, pg.toNonIndexed(), mats.metal, posts);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3)); rg.setIndex(railIdx); rg.computeVertexNormals();
    paint(rg, 0xd5d9de);
    const rail = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
    rail.castShadow = true; rail.receiveShadow = true;
    root.add(rail);
  }
  {
    // low wooden rope fence along the beaches
    const posts = [], ropes = [];
    const lat = ROAD_HALF + 1.2;
    let prev = null;
    for (let s = 0; s < path.length; s += 2.6) {
      const o = path.at(s);
      if (sandF(o.t) < 0.7 || roadY(o.t) > 3 || Math.abs(o.t - SPOT.pier) < 0.006) { prev = null; continue; }
      const x = o.x + o.nx * lat, z = o.z + o.nz * lat, y = o.y - 0.25;
      posts.push(M4(x, y, z, r() * 3));
      const p = V3(x, y + 0.62, z);
      if (prev) ropes.push(paint(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(prev, prev.clone().lerp(p, 0.5).add(V3(0, -0.12, 0)), p), 4, 0.018, 4), 0xe7d7b0));
      prev = p;
    }
    const pg = new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6); pg.translate(0, 0.37, 0); paint(pg, 0x8a6a48);
    scatter(root, pg.toNonIndexed(), mats.prop, posts);
    if (ropes.length) { const kk = new Kit(); ropes.forEach(g => kk.addRaw(g)); const m = new THREE.Mesh(kk.build(), mats.prop); m.castShadow = true; root.add(m); }
  }

  // ---------------- road signs (facing riders)
  const roadSigns = [
    [0.03, 'road', ['限速：慢慢来']], [0.07, 'warn', ['注意：奶蛙出没']], [0.19, 'road', ['请抱紧肚子']],
    [0.31, 'road', ['本路段禁止着急']], [0.575, 'warn', ['前方：发呆区']], [0.67, 'road', ['距离午睡黑洞 3.8 光年']],
    [0.795, 'road', ['抱肚星云 · 抬头可见']], [0.9, 'warn', ['注意：奶蛙出没']],
  ];
  for (const [t, style, keys] of roadSigns) put(signMesh(style, keys, 1.7, 0.75, 2, 1.25), t, -(ROAD_HALF + 1.3), { face: 'oncoming' });

  // ---------------- start: welcome arch, kiosk, bus stop
  {
    const t = SPOT.start + 0.004, span = ROAD_HALF + 1.0;
    const arch = new THREE.Group();
    const k = new Kit();
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.5, 4.8, 0.5), 0xf3e6c8, [s * span, 2.4, 0]);
      k.add(new THREE.BoxGeometry(0.7, 0.3, 0.7), 0xd9c9a6, [s * span, 0.15, 0]);
      k.add(new THREE.SphereGeometry(0.32, 16, 12), 0xffc94a, [s * span, 5.05, 0]);
    }
    k.add(new THREE.BoxGeometry(span * 2 + 0.8, 1.15, 0.36), 0x16182b, [0, 4.35, 0]);
    const am = new THREE.Mesh(k.build(), mats.prop); am.castShadow = true; am.receiveShadow = true; arch.add(am);
    const tex = signTexture('gold', ['欢迎来到发呆星', '海边公路'], 1024, 160, true);
    for (const side of [1, -1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 + 0.6, 1.0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
      f.position.set(0, 4.35, side * 0.185); if (side < 0) f.rotation.y = Math.PI;
      arch.add(f);
    }
    const bulbs = [];
    for (let i = 0; i <= 12; i++) bulbs.push(M4(-span - 0.3 + i * (span * 2 + 0.6) / 12, 3.72, 0, 0, 0.6));
    scatter(arch, new THREE.SphereGeometry(0.09, 8, 6), mats.bulb, bulbs, { shadow: false, sectors: 1 });
    const ah = glowPoints(bulbs.map(m => V3().setFromMatrixPosition(m)), 0.9);
    arch.add(ah);
    anim.push((dt, time, night) => { ah.material.opacity = night; ah.visible = night > 0.02; });
    put(arch, t, 0, { face: 'oncoming', ground: false });
  }
  {
    // 奶蛙商店 · 发呆星分店
    const g = new THREE.Group(), k = new Kit();
    k.add(new THREE.BoxGeometry(3.4, 2.5, 0.15), 0xf6ecd6, [0, 1.25, -1.1]);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.15, 2.5, 2.2), 0xf6ecd6, [s * 1.65, 1.25, 0]);
    k.add(new THREE.BoxGeometry(3.4, 1.05, 0.5), 0xffc94a, [0, 0.52, 0.85]);
    k.add(new THREE.BoxGeometry(3.6, 0.08, 0.7), 0xf3e6c8, [0, 1.08, 0.85]);
    k.add(new THREE.BoxGeometry(3.7, 0.18, 2.6), 0xe0d2b4, [0, 2.58, 0]);
    k.add(new THREE.BoxGeometry(3.6, 0.1, 2.3), 0xcab894, [0, 0.05, 0]);
    // shelf with milk bottles and little jars
    k.add(new THREE.BoxGeometry(3.0, 0.06, 0.35), 0xb08458, [0, 1.6, -0.9]);
    k.add(new THREE.BoxGeometry(3.0, 0.06, 0.35), 0xb08458, [0, 2.1, -0.9]);
    const bottle = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.17], [0.04, 0.24], [0.032, 0.28], [0, 0.28]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
    for (let i = 0; i < 9; i++) k.add(bottle.clone(), 0xfdfcf6, [-1.3 + i * 0.32, 1.63, -0.9]);
    for (let i = 0; i < 6; i++) k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), [0xff9f0a, 0x5bbf5e, 0x8e7dff, 0xf7a6b8][i % 4], [-1.2 + i * 0.48, 2.23, -0.9]);
    for (let i = 0; i < 3; i++) k.add(bottle.clone(), 0xfdfcf6, [0.6 + i * 0.22, 1.12, 0.85]);
    const km = new THREE.Mesh(k.build(), mats.prop); km.castShadow = true; km.receiveShadow = true; g.add(km);
    // striped awning
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.3, 1, 1), new THREE.MeshStandardMaterial({ map: stripes(['#ffd23f', '#fff8e6'], 10), side: THREE.DoubleSide, roughness: 0.8 }));
    aw.position.set(0, 2.35, 1.6); aw.rotation.x = -Math.PI / 2 + 0.5; aw.castShadow = true; g.add(aw);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: signTexture('gold', ['奶蛙商店', '发呆星分店'], 512, 128, true), roughness: 0.5 }));
    sg.position.set(0, 3.1, 0.6); g.add(sg);
    const sgb = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: 0x16182b })); sgb.position.set(0, 3.1, 0.55); g.add(sgb);
    const board = signMesh('wood', ['今日营业：发呆'], 0.9, 0.55, 1, 0.5);
    board.position.set(2.3, 0, 1.3); board.rotation.y = -0.4; g.add(board);
    put(g, SPOT.start + 0.012, -(BAND + 6.5), { face: 'road' });
    keepOut.push([g.position.x, g.position.z, 6]);
    npc('yellow', n => n.stand(), SPOT.start + 0.012, -(BAND + 6.9), { face: 'road', dy: 0.45 }, ['店员：今天只卖发呆，不要钱。', '店员：叮铃是本店的会员暗号。'], 1.55);
  }
  {
    // 发呆站 bus stop
    const g = new THREE.Group(), k = new Kit();
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.1, 2.4, 0.1), 0x2f4a48, [s * 1.4, 1.2, -0.5]);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.1, 2.4, 0.1), 0x2f4a48, [s * 1.4, 1.2, 0.5]);
    k.add(new THREE.BoxGeometry(3.2, 0.12, 1.5), 0x5fc4ac, [0, 2.45, 0], [0.08, 0, 0]);
    k.add(new THREE.BoxGeometry(2.6, 0.08, 0.45), 0xb08458, [0, 0.45, -0.3]);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.08, 0.45, 0.4), 0x2f4a48, [s * 1.1, 0.22, -0.3]);
    const m = new THREE.Mesh(k.build(), mats.prop); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.8), mats.water); glass.position.set(0, 1.4, -0.55); g.add(glass);
    const st = signMesh('road', ['发呆站', '末班车 25:00'], 0.9, 0.9, 1, 1.9);
    st.position.set(1.9, 0, 0.4); g.add(st);
    put(g, SPOT.bus, -(BAND + 1.0), { face: 'road' });
    npc('yellow', n => n.sit(0.5), SPOT.bus, -(BAND + 1.25), { face: 'road' }, ['在等 25 点的那班车。', '车还没来。不着急。'], 1.35);
  }

  // ---------------- beach: umbrellas, towels, a sandcastle, Sakura Pink sunbathing
  {
    const umbGeo = (() => {
      const g = new THREE.ConeGeometry(1.5, 0.55, 16, 1, true).toNonIndexed();
      g.computeVertexNormals();
      return g;
    })();
    const umbCols = [[0xff6b6b, 0xfff6e6], [0x4aa8e8, 0xfff6e6], [0xffc21a, 0xfff6e6], [0x5fc4ac, 0xfff6e6], [0xf7a6b8, 0xffffff]];
    const spots = [[0.1, 16], [0.112, 21], [0.125, 15.5], [0.138, 22], [0.152, 17], [0.165, 23]];
    spots.forEach(([t, lat], i) => {
      const g = new THREE.Group();
      const cg = umbGeo.clone(), p = cg.attributes.position, col = new Float32Array(p.count * 3);
      const [ca, cb] = umbCols[i % umbCols.length].map(c => new THREE.Color(c));
      for (let v = 0; v < p.count; v += 3) {
        const cx = (p.getX(v) + p.getX(v + 1) + p.getX(v + 2)) / 3, cz = (p.getZ(v) + p.getZ(v + 1) + p.getZ(v + 2)) / 3;
        const c = Math.floor(((Math.atan2(cz, cx) + Math.PI) / TAU) * 16) % 2 ? ca : cb;
        for (let q = 0; q < 3; q++) { col[(v + q) * 3] = c.r; col[(v + q) * 3 + 1] = c.g; col[(v + q) * 3 + 2] = c.b; }
      }
      cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const canopy = new THREE.Mesh(cg, mats.leaf); canopy.position.y = 2.25; canopy.castShadow = true;
      const pole = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.03, 0.03, 2.5, 6), 0xf3f3f3), mats.prop); pole.position.y = 1.15;
      const tilt = new THREE.Group(); tilt.add(canopy, pole); tilt.rotation.z = (r() - 0.5) * 0.3; tilt.rotation.x = (r() - 0.5) * 0.3;
      g.add(tilt);
      const towel = new THREE.Mesh(paint(new THREE.BoxGeometry(0.9, 0.02, 1.8), [0x4aa8e8, 0xff6b6b, 0xffc21a, 0x8e7dff, 0x5fc4ac][(i + 2) % 5]), mats.prop);
      towel.position.set(0.6, 0.01, 0.4); towel.rotation.y = 0.3; towel.receiveShadow = true; g.add(towel);
      put(g, t, lat, { face: 'sea', yaw: r() * 0.6 - 0.3 });
    });
    // deck chairs
    for (const [t, lat] of [[0.105, 18.5], [0.145, 19.5]]) {
      const k = new Kit();
      k.add(new THREE.BoxGeometry(0.6, 0.04, 1.1), 0x4aa8e8, [0, 0.35, 0.1], [0.1, 0, 0]);
      k.add(new THREE.BoxGeometry(0.6, 0.04, 0.8), 0x4aa8e8, [0, 0.62, -0.62], [-1.0, 0, 0]);
      for (const s of [-1, 1]) { k.add(new THREE.BoxGeometry(0.04, 0.04, 1.5), 0xc9a26b, [s * 0.3, 0.2, -0.1], [0.35, 0, 0]); k.add(new THREE.BoxGeometry(0.04, 0.04, 1.2), 0xc9a26b, [s * 0.3, 0.25, 0.0], [-0.45, 0, 0]); }
      const m = new THREE.Mesh(k.build(), mats.prop); m.castShadow = true; const g = new THREE.Group(); g.add(m);
      put(g, t, lat, { face: 'sea' });
    }
    // sandcastle + bucket + beach ball + surfboard
    {
      const g = new THREE.Group(), k = new Kit(), sand = 0xe2c78f;
      k.add(new THREE.CylinderGeometry(0.55, 0.65, 0.35, 12), sand, [0, 0.17, 0]);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; k.add(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 10), sand, [Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5]); k.add(new THREE.ConeGeometry(0.18, 0.25, 10), sand, [Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5]); }
      k.add(new THREE.CylinderGeometry(0.22, 0.25, 0.75, 12), sand, [0, 0.7, 0]); k.add(new THREE.ConeGeometry(0.26, 0.35, 12), sand, [0, 1.25, 0]);
      k.add(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), 0x6b4a22, [0, 1.55, 0]); k.add(new THREE.BoxGeometry(0.2, 0.12, 0.01), 0xff6b6b, [0.1, 1.68, 0]);
      k.add(new THREE.CylinderGeometry(0.15, 0.11, 0.24, 12, 1, true), 0x4aa8e8, [1.0, 0.12, 0.3]);
      const m = new THREE.Mesh(k.build(), mats.leaf); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ map: stripes(['#ff6b6b', '#ffffff', '#4aa8e8', '#ffffff', '#ffd23f', '#ffffff'], 6, 256, 32), roughness: 0.4 }));
      ball.position.set(-1.2, 0.22, 0.8); ball.castShadow = true; g.add(ball);
      const board = new THREE.Mesh(paint(new THREE.CapsuleGeometry(0.25, 1.6, 4, 12).scale(1, 1, 0.12), 0xff9f0a), mats.prop);
      board.position.set(1.6, 0.9, -0.6); board.rotation.z = 0.15; board.castShadow = true; g.add(board);
      put(g, 0.118, 26, { face: 'road' });
    }
    // Sakura Pink on a towel under an umbrella, looking at the sea
    npc('pink', n => { n.sit(0.02); }, 0.1255, 16.6, { face: 'sea', yaw: 0.2 }, ['樱花粉害羞地看向了别处。', '樱花粉被铃声吓了一跳，然后继续晒太阳。'], 0.85);
    put(signMesh('wood', ['抱肚沙滩'], 1.4, 0.5, 2, 0.9), 0.098, ROAD_HALF + 2.2, { face: 'road' });
  }

  // ---------------- pier with Sky Blue fishing at the end
  {
    const t = SPOT.pier, start = BAND + 1.5, L = 30, y0 = 1.25;
    const g = new THREE.Group(), k = new Kit();
    for (let z = 0; z < L; z += 0.32) k.add(new THREE.BoxGeometry(2.6, 0.08, 0.28), (Math.floor(z / 0.32) % 3) ? 0xa47b52 : 0x96704a, [0, y0, z]);
    for (let z = 0; z <= L; z += 3) for (const s of [-1, 1]) {
      k.add(new THREE.CylinderGeometry(0.11, 0.12, 4.2, 8), 0x6e5236, [s * 1.2, y0 - 2.0, z]);
      k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), 0x6e5236, [s * 1.25, y0 + 0.45, z]);
    }
    for (const s of [-1, 1]) for (const h of [0.5, 0.85]) k.add(new THREE.BoxGeometry(0.06, 0.06, L), 0x8a6644, [s * 1.25, y0 + h, L / 2]);
    k.add(new THREE.CylinderGeometry(0.22, 0.18, 0.32, 12, 1, true), 0x4aa8e8, [0.65, y0 + 0.2, L - 0.8]);
    const m = new THREE.Mesh(k.build(), mats.leaf); m.castShadow = true; m.receiveShadow = true; g.add(m);
    put(g, t, start, { face: 'sea', ground: false, dy: 0 });
    g.position.y = 0;
    for (let z = 0; z < L; z += 6) keepOut.push([g.position.x + Math.sin(g.rotation.y) * z, g.position.z + Math.cos(g.rotation.y) * z, 3]);
    // the angler
    const holder = new THREE.Group();
    const n = new Naiwa({ variant: 'blue' });
    n.sit(0.0, true);
    n.body.position.y = 0.02;
    const rodHand = V3(0, 0.36, 0.42);
    n.arm('L', V3(0.06, 0.33, 0.4), V3(1, -0.6, -0.3), V3(-1, 0.3, 0.2));
    n.arm('R', V3(-0.06, 0.36, 0.44), V3(-1, -0.6, -0.3), V3(1, 0.3, 0.2));
    const baked = bake(n);
    holder.add(baked);
    const rod = new THREE.Mesh(paint(tubeGeo(V3(0, 0.25, 0.3), V3(0, 2.0, 2.4), 0.018, 6, 0.006), 0x3b2a1a), mats.prop);
    holder.add(rod);
    holder.position.set(0, y0 + 0.04, L - 0.35);
    g.add(holder);
    const tip = V3(0, 2.0, 2.4);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff4d4d, roughness: 0.4 }));
    const bobBase = V3(0, -y0 + 0.02, 5.2);
    bob.position.copy(bobBase); holder.add(bob);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([tip, bobBase]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    holder.add(line);
    anim.push((dt, time) => {
      bob.position.y = bobBase.y + Math.sin(time * 1.7) * 0.03 + Math.sin(time * 0.6) * 0.02;
      lineGeo.attributes.position.setXYZ(1, bob.position.x, bob.position.y, bob.position.z); lineGeo.attributes.position.needsUpdate = true;
    });
    const rec = { holder, baked, lines: ['天空蓝正在发呆，暂时没有回应。', '鱼漂动了一下。天空蓝没有注意到。'], t, wiggle: 0, head: new THREE.Vector3(), headY: 0.95, phase: 1 };
    npcs.push(rec);
    put(signMesh('wood', ['钓鱼栈桥'], 1.4, 0.5, 2, 0.9), t + 0.005, ROAD_HALF + 2.2, { face: 'road' });
  }

  // ---------------- wind turbines on the hill
  {
    const spotsW = [[0.335, -46], [0.356, -72], [0.377, -50]];
    for (const [t, lat] of spotsW) {
      const g = new THREE.Group(), k = new Kit(), H = 17;
      k.addRaw(paint(tubeGeo(V3(0, -1, 0), V3(0, H, 0), 0.5, 16, 0.3), 0xf4f4f2));
      k.add(new THREE.CapsuleGeometry(0.42, 1.4, 6, 12), 0xf4f4f2, [0, H + 0.3, -0.2], [Math.PI / 2, 0, 0]);
      const m = new THREE.Mesh(k.build(), mats.prop); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const rotor = new THREE.Group(); rotor.position.set(0, H + 0.3, 0.75);
      const rk = new Kit();
      rk.add(new THREE.SphereGeometry(0.42, 16, 12), 0xf4f4f2, [0, 0, 0], [0, 0, 0], [1, 1, 1.3]);
      for (let i = 0; i < 3; i++) {
        const bl = new THREE.BoxGeometry(0.5, 7.5, 0.08); bl.translate(0, 4.0, 0);
        const p = bl.attributes.position; for (let v = 0; v < p.count; v++) { const yy = p.getY(v); p.setX(v, p.getX(v) * lerp(1, 0.35, (yy - 0.25) / 7.5)); }
        bl.rotateZ(i / 3 * TAU); rk.addRaw(paint(bl, 0xf4f4f2));
      }
      const rm = new THREE.Mesh(rk.build(), mats.prop); rm.castShadow = true; rotor.add(rm); g.add(rotor);
      const p = put(g, t, lat, { face: 'sea' });
      const speed = 0.35 + r() * 0.2, off = r() * 6;
      anim.push((dt, time) => { rotor.rotation.z = off + time * speed; });
      keepOut.push([p.x, p.z, 9]);
    }
    put(signMesh('wood', ['风车山坡'], 1.4, 0.5, 2, 0.9), SPOT.windmills - 0.012, -(ROAD_HALF + 2.0), { face: 'road' });
  }

  // ---------------- lighthouse on the headland
  let beam = null;
  {
    const t = SPOT.lighthouse, lat = 12;
    const g = new THREE.Group(), H = 13;
    const prof = [[0, 0], [2.0, 0], [2.0, 0.6], [1.85, 0.8], [1.35, H], [0, H]].map(([x, y]) => new THREE.Vector2(x, y));
    const tg = new THREE.LatheGeometry(prof, 32).toNonIndexed();
    const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), red = new THREE.Color(0xd8443c), wht = new THREE.Color(0xfaf6ee);
    for (let v = 0; v < tp.count; v += 3) {
      const yy = (tp.getY(v) + tp.getY(v + 1) + tp.getY(v + 2)) / 3;
      const c = yy > 0.8 && Math.floor((yy - 0.8) / 2.6) % 2 === 1 ? red : wht;
      for (let q = 0; q < 3; q++) { tc[(v + q) * 3] = c.r; tc[(v + q) * 3 + 1] = c.g; tc[(v + q) * 3 + 2] = c.b; }
    }
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.computeVertexNormals();
    const k = new Kit();
    k.addRaw(tg);
    k.add(new THREE.CylinderGeometry(2.0, 1.9, 0.25, 32), 0x2f3438, [0, H + 0.12, 0]);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; k.add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4), 0x2f3438, [Math.cos(a) * 1.9, H + 0.7, Math.sin(a) * 1.9]); }
    k.add(new THREE.TorusGeometry(1.9, 0.04, 6, 48), 0x2f3438, [0, H + 1.15, 0], [Math.PI / 2, 0, 0]);
    k.add(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 24), 0x2f3438, [0, H + 0.4, 0]);
    k.add(new THREE.SphereGeometry(1.1, 24, 12, 0, TAU, 0, Math.PI / 2), 0xd8443c, [0, H + 1.95, 0]);
    k.add(new THREE.SphereGeometry(0.16, 10, 8), 0x2f3438, [0, H + 3.1, 0]);
    k.add(new THREE.BoxGeometry(0.9, 1.7, 0.2), 0x3b4a5a, [0, 0.85, 1.92]);
    // keeper's cottage
    k.add(new THREE.BoxGeometry(3.4, 2.4, 2.8), 0xfaf6ee, [-3.6, 1.2, -0.8]);
    const roof = new THREE.CylinderGeometry(0.01, 2.4, 1.4, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.05, 1, 0.85);
    k.add(roof, 0xd8443c, [-3.6, 3.1, -0.8]);
    k.add(new THREE.BoxGeometry(0.8, 1.5, 0.1), 0x3b4a5a, [-3.6, 0.75, 0.62]);
    k.add(new THREE.BoxGeometry(0.7, 0.6, 0.1), 0x9fd0ef, [-2.6, 1.5, 0.62]);
    const m = new THREE.Mesh(k.build(), mats.prop); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.3, 24), mats.glass); lantern.position.y = H + 1.2; g.add(lantern);
    // rotating light beams
    beam = new THREE.Group(); beam.position.y = H + 1.2; g.add(beam);
    const bm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { strength: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform float strength; void main(){ float a = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.15, 1.0, vUv.y)); gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a * strength * 0.45, 1.0); }',
    });
    for (const s of [1, -1]) {
      const cg = new THREE.CylinderGeometry(4.5, 0.3, 60, 24, 1, true);
      cg.translate(0, 30, 0); cg.rotateZ(s * Math.PI / 2 + 0.03 * s);
      const c = new THREE.Mesh(cg, bm); c.renderOrder = 3; beam.add(c);
    }
    beam.userData.mat = bm;
    const lh = glowPoints([V3(0, H + 1.2, 0)], 9, 0xffd27a);
    g.add(lh);
    anim.push((dt, time, night) => { lh.material.opacity = night * (0.75 + 0.25 * Math.max(0, Math.cos(time * 0.55 * 2))); lh.visible = night > 0.02; });
    put(g, t, lat, { face: 'road' });
    keepOut.push([g.position.x, g.position.z, 9]);
    npc('yellow', n => n.stand(), t, lat, { face: 'road', dy: 0, ground: true }, ['看守员：今天的海，很海。', '看守员也按了一下灯塔的铃。叮——'], 1.3);
    // put the keeper up on the gallery, on the road side of the lantern
    const keeper = npcs[npcs.length - 1];
    const fwd = V3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    keeper.holder.position.set(g.position.x + fwd.x * 1.45, g.position.y + H + 0.25, g.position.z + fwd.z * 1.45);
    anim.push((dt, time, night) => { beam.rotation.y = time * 0.55; bm.uniforms.strength.value = night; beam.visible = night > 0.02; mats.glass.emissiveIntensity = 0.3 + night * 3.5; });
    put(signMesh('wood', ['发呆星灯塔'], 1.5, 0.5, 2, 0.9), t - 0.006, ROAD_HALF + 2.0, { face: 'road' });
  }

  // ---------------- lookout: a bench, coin binoculars, Matcha Green
  {
    const t = SPOT.viewpoint, lat = 10.5;
    const g = new THREE.Group(), k = new Kit();
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(1.8, 0.05, 0.12), 0xa47b52, [0, 0.45, -0.2 + i * 0.14]);
    for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(1.8, 0.1, 0.04), 0xa47b52, [0, 0.62 + i * 0.14, -0.33], [-0.15, 0, 0]);
    for (const s of [-1, 1]) { k.add(new THREE.BoxGeometry(0.06, 0.45, 0.5), 0x2f4a48, [s * 0.8, 0.22, 0]); k.add(new THREE.BoxGeometry(0.06, 0.55, 0.06), 0x2f4a48, [s * 0.8, 0.7, -0.34], [-0.15, 0, 0]); }
    const m = new THREE.Mesh(k.build(), mats.prop); m.castShadow = true; m.receiveShadow = true; g.add(m);
    put(g, t, lat, { face: 'sea' });
    const nb = npc('green', n => n.sit(0.47), t, lat, { face: 'sea' }, ['抹茶绿把肚子抱得更紧了一点。', '抹茶绿向你挥了挥（抱着肚子的）手。'], 1.35);
    nb.holder.position.add(V3(Math.sin(g.rotation.y + Math.PI / 2) * 0.35, 0, Math.cos(g.rotation.y + Math.PI / 2) * 0.35));
    // binoculars
    const bk = new Kit();
    bk.add(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8), 0x2f4a48, [0, 0.55, 0]);
    bk.add(new THREE.BoxGeometry(0.4, 0.28, 0.32), 0x5fc4ac, [0, 1.2, 0]);
    for (const s of [-1, 1]) bk.add(new THREE.CylinderGeometry(0.07, 0.08, 0.35, 10), 0x2f4a48, [s * 0.1, 1.22, 0.2], [Math.PI / 2, 0, 0]);
    const bn = new THREE.Group(); const bm = new THREE.Mesh(bk.build(), mats.metal); bm.castShadow = true; bn.add(bm);
    put(bn, t + 0.004, lat - 1.5, { face: 'sea', yaw: 0.4 });
    put(signMesh('wood', ['发呆观景台', '推荐发呆时长：随便'], 1.7, 0.75, 2, 0.9), t - 0.004, ROAD_HALF + 2.2, { face: 'road' });
  }

  // ---------------- the Big Naiwa Bang memorial: a golden 奶蛙 on the hill
  {
    const t = SPOT.statue, lat = -26;
    const g = new THREE.Group(), k = new Kit();
    k.add(new THREE.CylinderGeometry(2.6, 2.8, 0.4, 32), 0xd9d2c4, [0, 0.2, 0]);
    k.add(new THREE.CylinderGeometry(1.9, 2.1, 1.6, 32), 0xe8e2d6, [0, 1.2, 0]);
    k.add(new THREE.CylinderGeometry(2.05, 2.05, 0.15, 32), 0xcfc7b8, [0, 2.0, 0]);
    const m = new THREE.Mesh(k.build(), mats.prop); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const n = new Naiwa({ gold: true }); n.stand();
    const gold = bake(n); gold.scale.setScalar(2.6); gold.position.y = 2.05; g.add(gold);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: signTexture('gold', ['奶蛙大爆炸纪念碑', '第 0 秒'], 512, 192), roughness: 0.4, metalness: 0.3 }));
    plaque.position.set(0, 1.2, 2.02); g.add(plaque);
    put(g, t, lat, { face: 'road' });
    keepOut.push([g.position.x, g.position.z, 8]);
    // stepping stones from the road up to it
    const stones = [];
    for (let i = 1; i < 11; i++) { const p = place(t + Math.sin(i * 0.7) * 0.0006, -(ROAD_HALF + 1.6 + i * 2.0)); stones.push(M4(p.x, p.y + 0.02, p.z, r() * 3, [0.55, 0.12, 0.45])); }
    scatter(root, paint(new THREE.CylinderGeometry(1, 1, 1, 9).toNonIndexed(), 0xc9c1b2), mats.prop, stones, { sectors: 1 });
  }

  // ---------------- scattered vegetation, rocks, flowers, grass
  const blocked = (x, z, pad = 0) => keepOut.some(([kx, kz, kr]) => (x - kx) ** 2 + (z - kz) ** 2 < (kr + pad) ** 2);
  const at = (t, d) => { const R = roadR(t), th = -TAU * t; const x = (R + d) * Math.cos(th), z = (R + d) * Math.sin(th); return [x, heightAt(x, z), z]; };
  const nearSpot = (t, spot, w) => Math.abs(((t - spot + 1.5) % 1) - 0.5) < w;
  const scale = low ? 0.55 : 1;
  {
    // palms: beaches + the grove + some around the start
    const geos = [palmGeo(1), palmGeo(2), palmGeo(3)], lists = [[], [], []];
    let n = 0;
    for (let i = 0; i < 2600 && n < 170 * scale; i++) {
      const t = r();
      const grove = nearSpot(t, SPOT.palms, 0.06) || nearSpot(t, SPOT.start, 0.03);
      const beach = sandF(t) > 0.8;
      if (!grove && !beach) continue;
      const d = beach && r() < 0.6 ? BAND + 2 + r() * 9 : -(BAND + 1.5 + r() * (grove ? 26 : 10));
      const [x, y, z] = at(t, d);
      if (y < 0.4 || blocked(x, z, 1.5)) continue;
      lists[n % 3].push(M4(x, y - 0.1, z, r() * TAU, 0.85 + r() * 0.35)); n++;
    }
    geos.forEach((g, i) => scatter(root, g, mats.leaf, lists[i]));
  }
  {
    const palettes = [[0x2f6b2a, 0x7fb54a], [0x3c7a2e, 0x9cc456], [0x2a5e33, 0x6aa84f], [0x4b7d2b, 0xb4c95a]];
    const geos = [0, 1, 2, 3].map(i => treeGeo(10 + i, palettes[i])), lists = [[], [], [], []];
    let n = 0;
    for (let i = 0; i < 9000 && n < 420 * scale; i++) {
      const t = r(), d = -(BAND + 3 + Math.pow(r(), 1.6) * 150);
      if (nearSpot(t, SPOT.palms, 0.05) && d > -40) continue;
      if (nearSpot(t, SPOT.flowers, 0.05) && d > -32) continue;
      const [x, y, z] = at(t, d);
      if (blocked(x, z, 3)) continue;
      lists[n % 4].push(M4(x, y - 0.2, z, r() * TAU, 0.8 + r() * 0.6)); n++;
    }
    // a big shade tree next to the lookout bench
    const vp = place(SPOT.viewpoint - 0.003, 6.8);
    lists[1].push(M4(vp.x, vp.y - 0.2, vp.z, 1, 1.6));
    geos.forEach((g, i) => scatter(root, g, mats.prop, lists[i]));
  }
  {
    const palettes = [[0x2f6b2a, 0x6aa84f], [0x3c7a2e, 0x8cbf4f], [0x4a6e2a, 0x94b64e]];
    const geos = palettes.map((p, i) => bushGeo(30 + i, p)), lists = [[], [], []];
    let n = 0;
    for (let i = 0; i < 9000 && n < 520 * scale; i++) {
      const t = r(), sea = r() < 0.25;
      const d = sea ? BAND + 0.8 + r() * 4 : -(BAND + 0.8 + Math.pow(r(), 2) * 80);
      const [x, y, z] = at(t, d);
      if (y < 0.8 || blocked(x, z, 1) || (sea && sandF(t) > 0.5)) continue;
      lists[n % 3].push(M4(x, y - 0.15, z, r() * TAU, 0.7 + r() * 0.8)); n++;
    }
    geos.forEach((g, i) => scatter(root, g, mats.prop, lists[i]));
  }
  {
    const geos = [rockGeo(1), rockGeo(2), rockGeo(3)], lists = [[], [], []];
    let n = 0;
    for (let i = 0; i < 12000 && n < 420 * scale; i++) {
      const t = r();
      const rocky = 1 - sandF(t);
      if (r() > rocky + 0.08) continue;
      const big = nearSpot(t, SPOT.rocks, 0.035);
      const d = BAND + 1 + r() * (big ? 24 : 18);
      const [x, y, z] = at(t, d);
      if (y > 2.5 && !big) continue;
      if (blocked(x, z, 1)) continue;
      const s = (big ? 1.2 + r() * 2.2 : 0.4 + r() * 1.3);
      lists[n % 3].push(M4(x, y - s * 0.25, z, r() * TAU, [s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5)])); n++;
    }
    geos.forEach((g, i) => scatter(root, g, mats.prop, lists[i]));
  }
  {
    // flowers: a proper field near SPOT.flowers plus sprinkles along the road
    const list = [], colors = [], pal = [0xff8fb1, 0xffffff, 0xffd34d, 0xb7a3ff, 0xff6b6b, 0xffb35c].map(c => new THREE.Color(c));
    const N = (low ? 1800 : 4200);
    for (let i = 0; i < N * 3 && list.length < N; i++) {
      const t = r(), field = nearSpot(t, SPOT.flowers, 0.05);
      if (!field && r() > 0.35) continue;
      const d = -(BAND + 0.6 + Math.pow(r(), field ? 1 : 2.5) * (field ? 34 : 20));
      const [x, y, z] = at(t, d);
      if (blocked(x, z, 0)) continue;
      const patch = Math.floor((noise2(x * 0.08, z * 0.08) * 0.5 + 0.5) * pal.length * 1.4) % pal.length;
      list.push(M4(x, y - 0.25, z, r() * TAU, 0.8 + r() * 0.6)); colors.push(pal[(patch + (r() < 0.15 ? 1 : 0)) % pal.length]);
    }
    scatter(root, flowerGeo(), mats.leaf, list, { shadow: false, colors });
  }
  {
    const list = [];
    const N = low ? 3000 : 9000;
    for (let i = 0; i < N * 3 && list.length < N; i++) {
      const t = r(), side = r() < 0.7 ? -1 : 1;
      const d = side < 0 ? -(BAND + 0.3 + Math.pow(r(), 2) * 30) : BAND + 0.3 + r() * 3;
      const [x, y, z] = at(t, d);
      if (y < 1.2 || (side > 0 && sandF(t) > 0.6) || blocked(x, z, 0)) continue;
      list.push(M4(x, y - 0.25, z, r() * TAU, 0.7 + r() * 0.8));
    }
    scatter(root, grassGeo(), mats.leaf, list, { shadow: false });
  }

  return {
    root, npcs, anim, lampPos: root.userData.lampPos,
    update(dt, time, night) {
      for (const f of anim) f(dt, time, night);
      mats.bulb.emissiveIntensity = night * 6;
      for (const n of npcs) {
        n.wiggle = Math.max(0, n.wiggle - dt * 1.6);
        const w = n.wiggle;
        n.baked.rotation.z = Math.sin(w * 18) * 0.12 * w;
        n.baked.scale.y = 1 + Math.sin(time * 1.6 + n.phase) * 0.012;
      }
    },
  };
}
