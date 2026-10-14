import * as THREE from '../lib/three.bundle.js';
import { Kit, rng, canvasTex, roundRect, paint, tubeGeo, clamp, TAU, lerp, canvas } from './util.js';
import {
  ROAD_HALF, BAND, LANE_HALF, SLOT, ICELL, LAMP_STEP, CAPTION,
  hash, heightAt, roadY, roadFrame, rowAt, coastX, slotFeature, lanesNear, island, featuresNear,
} from './worldgen.js';
import { Naiwa } from './naiwa.js';
import { palmGeo, treeGeo, TREE_PALETTES } from './flora.js';
import { trp } from './i18n.js';

// Landmarks, road furniture and residents, streamed around the rider.
// Where things go comes from worldgen (feature spots, pads, decks); what they
// look like is the original island's set dressing.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const M4 = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), Array.isArray(s) ? V3(...s) : V3(s, s, s));
const HALF_PI = Math.PI / 2;
const SEG = 64;                       // road furniture is built per 64 m of coast (z)
const BIG = new Set(['lighthouse', 'windmills', 'lighthouseIsle', 'palmIsle']);   // seen from further away
const RANGE = {                       // [desktop, low]
  feat: [450, 300], seg: [400, 260], detail: [210, 140], budget: [4, 3],
};

export const mats = {};
function initMats() {
  if (mats.prop) return;
  mats.prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  mats.leaf = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  mats.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 });
  mats.rail = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide });
  mats.bulb = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffc96b, emissiveIntensity: 0.0, roughness: 0.3 });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd27a, emissiveIntensity: 0.2, roughness: 0.15, metalness: 0.1 });
  mats.water = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
  // house windows and lanterns: plain glass by day, warm at night
  mats.window = new THREE.MeshStandardMaterial({ color: 0xcfe6f2, emissive: 0xffbf66, emissiveIntensity: 0, roughness: 0.2, metalness: 0.1 });
  mats.flame = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  mats.signWood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  mats.signMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.55 });
  mats.pool = new THREE.MeshBasicMaterial({ map: radialTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mats.firePool = new THREE.MeshBasicMaterial({ map: radialTex('rgba(255,170,90,1)'), color: 0xffb070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mats.awning = new THREE.MeshStandardMaterial({ map: stripes(['#ffd23f', '#fff8e6'], 10), side: THREE.DoubleSide, roughness: 0.8 });
  mats.ball = new THREE.MeshStandardMaterial({ map: stripes(['#ff6b6b', '#ffffff', '#4aa8e8', '#ffffff', '#ffd23f', '#ffffff'], 6, 256, 32), roughness: 0.4 });
  mats.bob = new THREE.MeshStandardMaterial({ color: 0xff4d4d, roughness: 0.4 });
  mats.line = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  mats.beam = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float strength; void main(){ float a = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.15, 1.0, vUv.y)); gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a * strength * 0.45, 1.0); }',
  });
}

// ---------------------------------------------------------------- glows
// Soft additive halos so lights glow at night (no post-processing needed).
let glowTex = null;
const getGlowTex = () => glowTex || (glowTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}));
const glowMaterial = (size, color) => new THREE.PointsMaterial({ map: getGlowTex(), size, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false });
export function glowPoints(positions, size, color = 0xffd9a0) {
  const p = new THREE.Points(new THREE.BufferGeometry().setFromPoints(positions), glowMaterial(size, color));
  p.renderOrder = 5;
  return p;
}
// shared halo materials, driven by `night` once per frame for every instance
const GLOW = {};
const glowMat = key => GLOW[key] || (GLOW[key] = glowMaterial(...{ lamp: [3.2, 0xffd9a0], arch: [0.9, 0xffd9a0], lh: [9, 0xffd27a], lhs: [6.5, 0xffd27a], fire: [5.5, 0xffa04a] }[key]));

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
  if (naiwaImg && naiwaImg.complete && naiwaImg.naturalWidth) return naiwaImg;
  if (!naiwaImg) { naiwaImg = new Image(); naiwaImg.src = new URL('../../naiwa.png', import.meta.url).href; }
  naiwaImg.addEventListener('load', cb, { once: true });
  return null;
}

// Sign textures are cached per (style, lines, size) and re-drawn when the language changes.
const signTex = new Map();
export function relabel() { for (const s of signTex.values()) s.draw(); }

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Hiragino Sans", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
function fitText(g, text, maxW, size, weight = 700) {
  // text width scales with the font size: measure once, then shrink to fit
  g.font = `${weight} ${size}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.max(10, Math.floor(size * maxW / w))}px ${FONT}`;
}
function woodFill(g, W, H, u = 1) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#a77548'); gr.addColorStop(1, '#8a5c34');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(60,35,15,.35)'; g.lineWidth = 3 * u;
  for (let y = 40 * u; y < H; y += 46 * u) { g.beginPath(); g.moveTo(10 * u, y); g.lineTo(W - 10 * u, y + 4 * u); g.stroke(); }
  g.restore();
}

function signTexture(style, keys, W = 512, H = 256, icon = false) {
  const id = [style, W, H, icon ? 1 : 0, ...keys].join('|');
  const hit = signTex.get(id);
  if (hit) return hit.tex;
  const [c, g] = canvas(W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // board decorations are drawn for 512 px wide boards and scale down with smaller ones
  const arrow = style === 'arrowL' || style === 'arrowR', tip = H * 0.45, u = Math.min(1, W / 512);
  const draw = () => {
    g.clearRect(0, 0, W, H);
    const lines = keys.map(k => trp(k));
    if (style === 'road') {
      g.fillStyle = '#f7f5ee'; roundRect(g, 0, 0, W, H, 34 * u); g.fill();
      g.strokeStyle = '#21487a'; g.lineWidth = 16 * u; roundRect(g, 14 * u, 14 * u, W - 28 * u, H - 28 * u, 26 * u); g.stroke();
      g.fillStyle = '#21487a';
    } else if (style === 'warn') {
      g.fillStyle = '#ffd23f'; roundRect(g, 0, 0, W, H, 34 * u); g.fill();
      g.strokeStyle = '#1d1d1d'; g.lineWidth = 14 * u; roundRect(g, 14 * u, 14 * u, W - 28 * u, H - 28 * u, 26 * u); g.stroke();
      g.fillStyle = '#1d1d1d';
    } else if (style === 'wood') {
      roundRect(g, 0, 0, W, H, 22 * u); woodFill(g, W, H, u);
      g.fillStyle = '#fff3d9';
    } else if (arrow) {
      // a pointer board: the tip points down the lane
      const L = style === 'arrowL', x0 = L ? 0 : W, x1 = L ? tip : W - tip, x2 = L ? W - 6 : 6;
      g.beginPath(); g.moveTo(x0, H / 2); g.lineTo(x1, 4); g.lineTo(x2, 4); g.lineTo(x2, H - 4); g.lineTo(x1, H - 4); g.closePath();
      woodFill(g, W, H, u);
      g.fillStyle = '#fff3d9';
    } else if (style === 'gold') {
      const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#ff9f0a'); gr.addColorStop(0.55, '#ffd60a'); gr.addColorStop(1, '#f3dcae');
      g.fillStyle = '#16182b'; roundRect(g, 0, 0, W, H, 30); g.fill();
      g.fillStyle = gr;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const img = icon ? getNaiwaImg(draw) : null;
    let left = 0, right = 0;
    if (img) { const ih = H * 0.66, iw = ih * img.width / img.height; g.drawImage(img, 40 * u, (H - ih) / 2, iw, ih); left = iw + 30 * u; }
    if (style === 'arrowL') left = tip - 20 * u;
    if (style === 'arrowR') right = tip - 20 * u;
    const cx = (left - right) / 2 + W / 2, maxW = W - left - right - 70 * u;
    if (lines.length === 1) { fitText(g, lines[0], maxW, H * 0.34); g.fillText(lines[0], cx, H / 2 + 4 * u); }
    else {
      fitText(g, lines[0], maxW, H * 0.3); g.fillText(lines[0], cx, H * 0.38);
      fitText(g, lines[1], maxW, H * 0.16, 600); g.globalAlpha = 0.85; g.fillText(lines[1], cx, H * 0.7); g.globalAlpha = 1;
    }
    tex.needsUpdate = true;
  };
  draw();
  signTex.set(id, { tex, draw });
  return tex;
}

// ---------------------------------------------------------------- caches
const GEO = new Map();
const cached = (key, make) => { let v = GEO.get(key); if (v === undefined) { v = make(); GEO.set(key, v); } return v; };
const MAT = new Map();
const cachedMat = (key, make) => { let v = MAT.get(key); if (!v) { v = make(); MAT.set(key, v); } return v; };
const plane = (w, h) => cached(`plane${w}x${h}`, () => new THREE.PlaneGeometry(w, h));
const flat = g => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };

// Merge cached geometries with per-part matrices into one (per landmark) geometry.
class Merge {
  constructor() { this.parts = []; }
  add(geo, m) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m); this.parts.push(g); return this; }
  build() { const g = THREE.mergeGeometries(this.parts); for (const p of this.parts) p.dispose(); this.parts = []; return g; }
}

// ---------------------------------------------------------------- signs
function signBodyGeo(wood, w, h, posts, postH) {
  return cached(`signBody${wood}${w}x${h}x${posts}x${postH}`, () => {
    const k = new Kit();
    k.add(new THREE.BoxGeometry(w * 0.98, h * 0.98, 0.05), wood ? 0x7a4f2c : 0x9aa0a6, [0, postH + h / 2, 0]);
    const ph = postH + h * 0.6 + 0.2;   // posts reach 20 cm into the ground
    for (const x of posts === 1 ? [0] : [-w * 0.38, w * 0.38]) k.add(new THREE.CylinderGeometry(0.04, 0.045, ph, 8), wood ? 0x6b4527 : 0x8d9399, [x, ph / 2 - 0.2, -0.04]);
    return k.build();
  });
}
const faceMat = (tex, opts = {}) => cachedMat(tex.uuid + JSON.stringify(opts), () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: true, alphaTest: 0.1, ...opts }));
// roadside boards: 384 px is plenty for a 1.4–1.9 m board and draws text much faster than 512
const SIGN_PX = 384;
function signMesh(style, keys, w = 1.6, h = 0.8, posts = 1, postH = 1.6, icon = false) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(plane(w, h), faceMat(signTexture(style, keys, SIGN_PX, Math.round(SIGN_PX * h / w), icon)));
  face.position.set(0, postH + h / 2, 0.035);
  const body = new THREE.Mesh(signBodyGeo(style === 'wood', w, h, posts, postH), style === 'wood' ? mats.signWood : mats.signMetal);
  g.add(face, body);
  for (const o of g.children) { o.castShadow = true; o.receiveShadow = true; }
  return g;
}
// A wooden pointer at a lane mouth: arrow towards the lane on both faces.
function pointerMesh(keys) {
  const w = 1.7, h = 0.46, postH = 1.2;
  const g = new THREE.Group();
  const body = cached('pointer', () => {
    const tip = h * 0.45, s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(-w / 2 + tip, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(-w / 2 + tip, -h / 2); s.closePath();
    const k = new Kit();
    const b = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); b.translate(0, postH + h / 2, -0.025);
    k.add(b, 0x7a4f2c);
    k.add(new THREE.CylinderGeometry(0.05, 0.055, postH + h + 0.25, 8), 0x6b4527, [w * 0.25, (postH + h + 0.25) / 2 - 0.2, -0.06]);
    return k.build();
  });
  g.add(new THREE.Mesh(body, mats.signWood));
  for (const [style, ry, z] of [['arrowL', 0, 0.03], ['arrowR', Math.PI, -0.03]]) {
    const f = new THREE.Mesh(plane(w, h), faceMat(signTexture(style, keys, SIGN_PX, Math.round(SIGN_PX * h / w))));
    f.position.set(0, postH + h / 2, z); f.rotation.y = ry; g.add(f);
  }
  for (const o of g.children) { o.castShadow = true; o.receiveShadow = true; }
  return g;
}

// ---------------------------------------------------------------- bake a posed Naiwa into a few meshes
export function bake(n) {
  const out = new THREE.Group();
  for (const [geo, m] of bakeParts(n)) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
// [[geometry, material], ...] — one merged geometry per material. Parts keep their
// indices when they all have them (the body lathe is 6x smaller that way).
function bakeGroups(n) {
  n.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(n.root.matrixWorld).invert();
  const byMat = new Map();
  n.root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  return byMat;
}
function mergeGroup(list) {
  const mixed = list.some(g => g.index) && list.some(g => !g.index);
  return THREE.mergeGeometries(mixed ? list.map(g => (g.index ? g.toNonIndexed() : g)) : list);
}
function bakeParts(n) { return [...bakeGroups(n)].map(([m, list]) => [mergeGroup(list), m]); }
const POSES = {
  stand: n => n.stand(),
  ground: n => n.sit(0.02),
  bench: n => n.sit(0.47),
  bus: n => n.sit(0.5),
  log: n => n.sit(0.4),
  boat: n => n.sit(0.24),
  angler: n => {
    n.sit(0.0, true);
    n.body.position.y = 0.02;
    n.arm('L', V3(0.06, 0.33, 0.4), V3(1, -0.6, -0.3), V3(-1, 0.3, 0.2));
    n.arm('R', V3(-0.06, 0.36, 0.44), V3(-1, -0.6, -0.3), V3(1, 0.3, 0.2));
  },
};
// Residents are baked once per (variant, pose) and shared. `need` bakes in
// slices so a first-time resident doesn't stall a frame.
const BAKED = new Map();
function* need(variant, pose) {
  const key = variant + ':' + pose;
  if (BAKED.has(key)) return;
  const n = new Naiwa(variant === 'gold' ? { gold: true } : { variant });
  POSES[pose](n);
  yield;
  const parts = [];
  for (const [m, list] of bakeGroups(n)) { parts.push([mergeGroup(list), m]); yield; }
  BAKED.set(key, parts);
}
function resident(variant, pose) {
  const key = variant + ':' + pose;
  let parts = BAKED.get(key);
  if (!parts) {
    const n = new Naiwa(variant === 'gold' ? { gold: true } : { variant });
    POSES[pose](n);
    BAKED.set(key, parts = bakeParts(n));
  }
  const g = new THREE.Group();
  for (const [geo, mat] of parts) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
const VARS = ['yellow', 'pink', 'blue', 'green'];

// ---------------------------------------------------------------- shared geometry
function lampGeos() {
  return cached('lamp', () => {
    const k = new Kit();
    k.add(new THREE.CylinderGeometry(0.13, 0.17, 0.35, 10), 0x2f4a48, [0, 0.17, 0]);
    k.add(new THREE.CylinderGeometry(0.055, 0.07, 4.5, 10), 0x2f4a48, [0, 2.4, 0]);
    k.addRaw(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 4.5, 0), V3(0, 4.95, 0.3), V3(0, 5.02, 0.8), V3(0, 4.92, 1.25)]), 12, 0.04, 6), 0x2f4a48));
    k.add(new THREE.CylinderGeometry(0.09, 0.26, 0.22, 12, 1, true), 0x2f4a48, [0, 4.82, 1.3]);
    k.add(new THREE.SphereGeometry(0.08, 8, 6), 0x2f4a48, [0, 4.95, 1.3]);
    const pool = new THREE.CircleGeometry(3.6, 24); pool.rotateX(-HALF_PI);
    const post = new THREE.BoxGeometry(0.08, 1.1, 0.08); post.translate(0, 0.4, 0); paint(post, 0xb9bec4);
    const fpost = new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6); fpost.translate(0, 0.37, 0); paint(fpost, 0x8a6a48);
    // a unit rope from (0,0,0) to (0,0,1), sagging; instances stretch it between posts
    const rope = paint(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(0, 0, 0), V3(0, -0.24, 0.5), V3(0, 0, 1)), 6, 0.018, 4), 0xe7d7b0);
    return { lamp: k.build(), bulb: new THREE.SphereGeometry(0.11, 12, 8), pool, post: post.toNonIndexed(), fpost: fpost.toNonIndexed(), rope };
  });
}

const archSpan = ROAD_HALF + 1.0;
const archGeo = () => cached('arch', () => {
  const span = archSpan, k = new Kit();
  for (const s of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.5, 4.8, 0.5), 0xf3e6c8, [s * span, 2.4, 0]);
    k.add(new THREE.BoxGeometry(0.7, 0.55, 0.7), 0xd9c9a6, [s * span, 0.03, 0]);
    k.add(new THREE.SphereGeometry(0.32, 16, 12), 0xffc94a, [s * span, 5.05, 0]);
  }
  k.add(new THREE.BoxGeometry(span * 2 + 0.8, 1.15, 0.36), 0x16182b, [0, 4.35, 0]);
  const b = new Kit(), pts = [];
  for (let i = 0; i <= 12; i++) { const p = V3(-span - 0.3 + i * (span * 2 + 0.6) / 12, 3.72, 0); pts.push(p); b.add(new THREE.SphereGeometry(0.09, 8, 6), 0xffffff, [p.x, p.y, p.z], [0, 0, 0], 0.6); }
  return { body: k.build(), bulbs: b.build(), pts };
});

const kioskGeo = () => cached('kiosk', () => {
  const k = new Kit();
  k.add(new THREE.BoxGeometry(3.4, 2.5, 0.15), 0xf6ecd6, [0, 1.25, -1.1]);
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.15, 2.5, 2.2), 0xf6ecd6, [s * 1.65, 1.25, 0]);
  k.add(new THREE.BoxGeometry(3.4, 1.05, 0.5), 0xffc94a, [0, 0.52, 0.85]);
  k.add(new THREE.BoxGeometry(3.6, 0.08, 0.7), 0xf3e6c8, [0, 1.08, 0.85]);
  k.add(new THREE.BoxGeometry(3.7, 0.18, 2.6), 0xe0d2b4, [0, 2.58, 0]);
  k.add(new THREE.BoxGeometry(3.6, 0.5, 2.3), 0xcab894, [0, -0.15, 0]);          // floor slab, footing below ground
  k.add(new THREE.BoxGeometry(0.7, 0.45, 0.55), 0xcab894, [0, 0.225, -0.4]);    // the clerk's step, behind the counter
  // shelf with milk bottles and little jars
  k.add(new THREE.BoxGeometry(3.0, 0.06, 0.35), 0xb08458, [0, 1.6, -0.9]);
  k.add(new THREE.BoxGeometry(3.0, 0.06, 0.35), 0xb08458, [0, 2.1, -0.9]);
  const bottle = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.17], [0.04, 0.24], [0.032, 0.28], [0, 0.28]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  for (let i = 0; i < 9; i++) k.add(bottle, 0xfdfcf6, [-1.3 + i * 0.32, 1.63, -0.9]);
  for (let i = 0; i < 6; i++) k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10), [0xff9f0a, 0x5bbf5e, 0x8e7dff, 0xf7a6b8][i % 4], [-1.2 + i * 0.48, 2.23, -0.9]);
  for (let i = 0; i < 3; i++) k.add(bottle, 0xfdfcf6, [0.6 + i * 0.22, 1.12, 0.85]);
  k.add(new THREE.BoxGeometry(3.3, 0.9, 0.08), 0x16182b, [0, 3.1, 0.55]);       // shop sign backing
  return k.build();
});

const busGeo = () => cached('bus', () => {
  const k = new Kit();
  for (const s of [-1, 1]) for (const z of [-0.5, 0.5]) k.add(new THREE.BoxGeometry(0.1, 2.65, 0.1), 0x2f4a48, [s * 1.4, 1.07, z]);
  k.add(new THREE.BoxGeometry(3.2, 0.12, 1.5), 0x5fc4ac, [0, 2.45, 0], [0.08, 0, 0]);
  k.add(new THREE.BoxGeometry(2.6, 0.08, 0.45), 0xb08458, [0, 0.45, -0.3]);
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.08, 0.6, 0.4), 0x2f4a48, [s * 1.1, 0.15, -0.3]);
  return k.build();
});

const UMB_COLS = [[0xff6b6b, 0xfff6e6], [0x4aa8e8, 0xfff6e6], [0xffc21a, 0xfff6e6], [0x5fc4ac, 0xfff6e6], [0xf7a6b8, 0xffffff]];
const TOWELS = [0x4aa8e8, 0xff6b6b, 0xffc21a, 0x8e7dff, 0x5fc4ac];
// beach umbrella (striped canopy + pole), in umbrella space (pole at the origin)
const umbrellaGeo = i => cached('umb' + i, () => {
  const g = new THREE.ConeGeometry(1.5, 0.55, 16, 1, true).toNonIndexed();
  g.computeVertexNormals();
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const [ca, cb] = UMB_COLS[i].map(c => new THREE.Color(c));
  for (let v = 0; v < p.count; v += 3) {
    const cx = (p.getX(v) + p.getX(v + 1) + p.getX(v + 2)) / 3, cz = (p.getZ(v) + p.getZ(v + 1) + p.getZ(v + 2)) / 3;
    const c = Math.floor(((Math.atan2(cz, cx) + Math.PI) / TAU) * 16) % 2 ? ca : cb;
    for (let q = 0; q < 3; q++) { col[(v + q) * 3] = c.r; col[(v + q) * 3 + 1] = c.g; col[(v + q) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 2.25, 0);
  const k = new Kit(); k.addRaw(g);
  k.add(new THREE.CylinderGeometry(0.03, 0.03, 2.7, 6), 0xf3f3f3, [0, 1.05, 0]);
  return k.build();
});
const towelGeo = i => cached('towel' + i, () => new Kit().add(new THREE.BoxGeometry(0.9, 0.03, 1.8), TOWELS[i % TOWELS.length], [0, 0.015, 0]).build());
const chairGeo = () => cached('chair', () => {
  const k = new Kit();
  k.add(new THREE.BoxGeometry(0.6, 0.04, 1.1), 0x4aa8e8, [0, 0.35, 0.1], [0.1, 0, 0]);
  k.add(new THREE.BoxGeometry(0.6, 0.04, 0.8), 0x4aa8e8, [0, 0.62, -0.62], [-1.0, 0, 0]);
  for (const s of [-1, 1]) { k.add(new THREE.BoxGeometry(0.04, 0.04, 1.5), 0xc9a26b, [s * 0.3, 0.2, -0.1], [0.35, 0, 0]); k.add(new THREE.BoxGeometry(0.04, 0.04, 1.2), 0xc9a26b, [s * 0.3, 0.25, 0.0], [-0.45, 0, 0]); }
  return k.build();
});
// sandcastle + bucket + surfboard; the beach ball is textured and stays separate
const castleGeo = () => cached('castle', () => {
  const k = new Kit(), sand = 0xe2c78f;
  k.add(new THREE.CylinderGeometry(0.55, 0.65, 0.45, 12), sand, [0, 0.12, 0]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; k.add(new THREE.CylinderGeometry(0.16, 0.18, 0.55, 10), sand, [Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5]); k.add(new THREE.ConeGeometry(0.18, 0.25, 10), sand, [Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5]); }
  k.add(new THREE.CylinderGeometry(0.22, 0.25, 0.75, 12), sand, [0, 0.7, 0]); k.add(new THREE.ConeGeometry(0.26, 0.35, 12), sand, [0, 1.25, 0]);
  k.add(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), 0x6b4a22, [0, 1.55, 0]); k.add(new THREE.BoxGeometry(0.2, 0.12, 0.01), 0xff6b6b, [0.1, 1.68, 0]);
  k.add(new THREE.CylinderGeometry(0.15, 0.11, 0.3, 12, 1, true), 0x4aa8e8, [1.0, 0.1, 0.3]);
  k.add(new THREE.CapsuleGeometry(0.25, 1.6, 4, 12).scale(1, 1, 0.12), 0xff9f0a, [1.6, 0.8, -0.6], [0, 0, 0.15]);
  return k.build();
});

const windmillGeo = () => cached('windmill', () => {
  const k = new Kit(), H = 17;
  k.addRaw(paint(tubeGeo(V3(0, -1.2, 0), V3(0, H, 0), 0.5, 16, 0.3), 0xf4f4f2));
  k.add(new THREE.CapsuleGeometry(0.42, 1.4, 6, 12), 0xf4f4f2, [0, H + 0.3, -0.2], [HALF_PI, 0, 0]);
  const rk = new Kit();
  rk.add(new THREE.SphereGeometry(0.42, 16, 12), 0xf4f4f2, [0, 0, 0], [0, 0, 0], [1, 1, 1.3]);
  for (let i = 0; i < 3; i++) {
    const bl = new THREE.BoxGeometry(0.5, 7.5, 0.08); bl.translate(0, 4.0, 0);
    const p = bl.attributes.position; for (let v = 0; v < p.count; v++) { const yy = p.getY(v); p.setX(v, p.getX(v) * lerp(1, 0.35, (yy - 0.25) / 7.5)); }
    bl.rotateZ(i / 3 * TAU); rk.addRaw(paint(bl, 0xf4f4f2));
  }
  return { body: k.build(), rotor: rk.build(), H };
});

// Lighthouse tower (+ the keeper's cottage on the mainland). `stripe` tints the bands and the dome.
const lighthouseGeo = (H, stripe, cottage) => cached(`lh${H}${stripe}${cottage}`, () => {
  // the taper is split at the band edges so the stripes come out crisp
  const bh = (H - 0.8) / 5, prof = [[0, -0.6], [2.0, -0.6], [2.0, 0.6]];
  for (let i = 0; i <= 5; i++) prof.push([lerp(1.85, 1.35, i / 5), 0.8 + i * bh]);
  prof.push([0, H]);
  const tg = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 32).toNonIndexed();
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), red = new THREE.Color(stripe), wht = new THREE.Color(0xfaf6ee);
  for (let v = 0; v < tp.count; v += 3) {
    const yy = (tp.getY(v) + tp.getY(v + 1) + tp.getY(v + 2)) / 3;
    const c = yy > 0.8 && Math.floor((yy - 0.8) / bh) % 2 === 1 ? red : wht;
    for (let q = 0; q < 3; q++) { tc[(v + q) * 3] = c.r; tc[(v + q) * 3 + 1] = c.g; tc[(v + q) * 3 + 2] = c.b; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const k = new Kit();
  k.addRaw(tg);
  k.add(new THREE.CylinderGeometry(2.0, 1.9, 0.25, 32), 0x2f3438, [0, H + 0.12, 0]);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; k.add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4), 0x2f3438, [Math.cos(a) * 1.9, H + 0.7, Math.sin(a) * 1.9]); }
  k.add(new THREE.TorusGeometry(1.9, 0.04, 6, 48), 0x2f3438, [0, H + 1.15, 0], [HALF_PI, 0, 0]);
  k.add(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 24), 0x2f3438, [0, H + 0.4, 0]);
  k.add(new THREE.SphereGeometry(1.1, 24, 12, 0, TAU, 0, HALF_PI), stripe, [0, H + 1.95, 0]);
  k.add(new THREE.SphereGeometry(0.16, 10, 8), 0x2f3438, [0, H + 3.1, 0]);
  k.add(new THREE.BoxGeometry(0.9, 1.7, 0.2), 0x3b4a5a, [0, 0.85, 1.92]);
  if (cottage) {
    k.add(new THREE.BoxGeometry(3.4, 3.0, 2.8), 0xfaf6ee, [-3.6, 0.9, -0.8]);
    const roof = new THREE.CylinderGeometry(0.01, 2.4, 1.4, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(1.05, 1, 0.85);
    k.add(roof, stripe, [-3.6, 3.1, -0.8]);
    k.add(new THREE.BoxGeometry(0.8, 1.5, 0.1), 0x3b4a5a, [-3.6, 0.75, 0.62]);
    k.add(new THREE.BoxGeometry(0.7, 0.6, 0.1), 0x9fd0ef, [-2.6, 1.5, 0.62]);
  }
  const beam = new THREE.CylinderGeometry(4.5, 0.3, 60, 24, 1, true);
  beam.translate(0, 30, 0);
  return { body: k.build(), lantern: new THREE.CylinderGeometry(0.95, 0.95, 1.3, 24), beam };
});

const benchGeo = () => cached('bench', () => {
  const k = new Kit();
  for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(1.8, 0.05, 0.12), 0xa47b52, [0, 0.45, -0.2 + i * 0.14]);
  for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(1.8, 0.1, 0.04), 0xa47b52, [0, 0.62 + i * 0.14, -0.33], [-0.15, 0, 0]);
  for (const s of [-1, 1]) { k.add(new THREE.BoxGeometry(0.06, 0.6, 0.5), 0x2f4a48, [s * 0.8, 0.15, 0]); k.add(new THREE.BoxGeometry(0.06, 0.55, 0.06), 0x2f4a48, [s * 0.8, 0.7, -0.34], [-0.15, 0, 0]); }
  return k.build();
});
const binocGeo = () => cached('binoc', () => {
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8), 0x2f4a48, [0, 0.45, 0]);
  k.add(new THREE.BoxGeometry(0.4, 0.28, 0.32), 0x5fc4ac, [0, 1.2, 0]);
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.07, 0.08, 0.35, 10), 0x2f4a48, [s * 0.1, 1.22, 0.2], [HALF_PI, 0, 0]);
  return k.build();
});
const shadeTreeGeo = () => cached('shadeTree', () => treeGeo(11, TREE_PALETTES[1]));
const palmGeos = () => cached('palms', () => [palmGeo(1), palmGeo(2), palmGeo(3)]);

const statueGeo = () => cached('statue', () => {
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(2.6, 2.8, 0.8, 32), 0xd9d2c4, [0, 0.0, 0]);
  k.add(new THREE.CylinderGeometry(1.9, 2.1, 1.6, 32), 0xe8e2d6, [0, 1.2, 0]);
  k.add(new THREE.CylinderGeometry(2.05, 2.05, 0.15, 32), 0xcfc7b8, [0, 2.0, 0]);
  return k.build();
});
const stoneGeo = () => cached('stone', () => paint(new THREE.CylinderGeometry(1, 1, 1, 9).toNonIndexed(), 0xc9c1b2));

// Village houses: pastel walls, pitched roof, a round window, an arched door, a flower box.
const WALLS = [0xffbccb, 0xb6d8ff, 0xffe49e, 0xc2e8b0, 0xd5c6ff, 0xffcaa3];
const ROOFS = [0xe0735a, 0x4fa3a5, 0xef8e9b, 0x6f8fc9, 0xe9b949, 0x8e7dff];
const HOUSES = 8;
const houseGeo = v => cached('house' + v, () => {
  const r = rng(500 + v * 17), k = new Kit(), gk = new Kit();
  const W = 3.0 + r() * 0.5, D = 2.6 + r() * 0.4, Hw = 2.0 + r() * 0.35;
  const wall = WALLS[v % WALLS.length], roof = ROOFS[(v * 5 + 1) % ROOFS.length];
  const top = 0.15 + Hw, rise = 1.0 + r() * 0.35, Wr = W / 2 + 0.32, a = Math.atan2(rise, W / 2);
  k.add(new THREE.BoxGeometry(W + 0.3, 0.9, D + 0.3), 0xd9cfc0, [0, -0.3, 0]);             // stone footing, reaches into the ground
  k.add(new THREE.BoxGeometry(W, Hw, D), wall, [0, 0.15 + Hw / 2, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(new THREE.CylinderGeometry(0.09, 0.09, Hw, 8), 0xfffaf0, [sx * W / 2, 0.15 + Hw / 2, sz * D / 2]);
  // gable, two roof slabs and a rounded ridge
  const gs = new THREE.Shape(); gs.moveTo(-W / 2, 0); gs.lineTo(W / 2, 0); gs.lineTo(0, rise); gs.closePath();
  const gable = new THREE.ExtrudeGeometry(gs, { depth: D, bevelEnabled: false }); gable.translate(0, top, -D / 2);
  k.add(gable, wall);
  const drop = Wr * Math.tan(a), Ls = Math.hypot(Wr, drop) + 0.12;
  for (const s of [-1, 1]) {
    const mx = s * Wr / 2, my = top + rise - drop / 2;
    k.add(new THREE.BoxGeometry(Ls, 0.16, D + 0.55), roof, [mx - s * Math.sin(a) * -0.08, my + Math.cos(a) * 0.08, 0], [0, 0, -s * a]);
  }
  k.add(new THREE.CylinderGeometry(0.12, 0.12, D + 0.6, 10), 0xfff6e6, [0, top + rise + 0.1, 0], [HALF_PI, 0, 0]);
  if (r() < 0.65) {
    const cx = (r() < 0.5 ? -1 : 1) * W * 0.25;
    k.add(new THREE.BoxGeometry(0.38, 1.1, 0.38), 0xc98b6b, [cx, top + rise * 0.8, -D * 0.22]);
    k.add(new THREE.BoxGeometry(0.5, 0.1, 0.5), 0xa8705a, [cx, top + rise * 0.8 + 0.58, -D * 0.22]);
  }
  // front: arched door + step, round window with a flower box
  const ds = r() < 0.5 ? -1 : 1, xd = ds * W * 0.24, xw = -ds * W * 0.22, yw = 0.15 + Hw * 0.62, fz = D / 2;
  k.add(new THREE.BoxGeometry(0.72, 1.2, 0.08), 0xa0693f, [xd, 0.15 + 0.6, fz + 0.03]);
  const arch = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 16, 1, false, -HALF_PI, Math.PI); arch.rotateX(-HALF_PI);
  k.add(arch, 0xa0693f, [xd, 1.35, fz + 0.03]);
  k.add(new THREE.SphereGeometry(0.045, 8, 6), 0xffc94a, [xd + 0.2 * -ds, 0.85, fz + 0.09]);
  k.add(new THREE.BoxGeometry(1.0, 0.36, 0.5), 0xcfc4b2, [xd, -0.03, fz + 0.27]);
  const roundWin = (x, y, z, ry) => {
    k.add(new THREE.TorusGeometry(0.34, 0.06, 6, 20), 0xfffaf0, [x, y, z], [0, ry, 0]);
    const gl = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20); gl.rotateX(HALF_PI); gl.rotateY(ry);
    gk.add(gl, 0xffffff, [x, y, z]);
    k.add(new THREE.BoxGeometry(0.6, 0.04, 0.03), 0xfffaf0, [x, y, z], [0, ry, 0]);
    k.add(new THREE.BoxGeometry(0.04, 0.6, 0.03), 0xfffaf0, [x, y, z], [0, ry, 0]);
  };
  roundWin(xw, yw, fz + 0.03, 0);
  roundWin(xd * 0.8, yw, -fz - 0.03, 0);
  roundWin(W / 2 + 0.03, yw, 0, HALF_PI);
  roundWin(-W / 2 - 0.03, yw, 0, HALF_PI);
  k.add(new THREE.BoxGeometry(0.8, 0.2, 0.26), 0x9b6a43, [xw, yw - 0.52, fz + 0.14]);
  const fl = [0xff8fb1, 0xffffff, 0xffd34d, 0xff6b6b, 0xb7a3ff];
  for (let i = 0; i < 5; i++) {
    k.add(new THREE.SphereGeometry(0.09, 8, 6), 0x5f9e3a, [xw - 0.3 + i * 0.15, yw - 0.4, fz + 0.15], [0, 0, 0], [1, 0.7, 1]);
    k.add(new THREE.SphereGeometry(0.06, 8, 6), fl[(i + v) % fl.length], [xw - 0.3 + i * 0.15, yw - 0.33, fz + 0.18]);
  }
  return { body: k.build(), glass: gk.build(), W, D };
});

const wellGeo = () => cached('well', () => {
  const k = new Kit();
  k.add(flat(new THREE.LatheGeometry([[0.6, 0.8], [0.6, -0.4], [0.92, -0.4], [0.92, 0.72], [0.84, 0.8], [0.6, 0.8]].map(([x, y]) => new THREE.Vector2(x, y)), 18)), 0xd9cfc0);
  const w = new THREE.CircleGeometry(0.6, 18); w.rotateX(-HALF_PI);
  k.add(w, 0x3d86b8, [0, 0.4, 0]);
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.14, 1.9, 0.14), 0x9b6a43, [s * 0.8, 1.55, 0]);
  const a = Math.atan2(0.5, 0.8);
  for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(Math.hypot(0.95, 0.6), 0.09, 1.4), 0xe0735a, [s * 0.47, 2.68, 0], [0, 0, -s * a]);
  k.add(new THREE.CylinderGeometry(0.06, 0.06, 1.75, 8), 0x7a5a3c, [0, 1.85, 0], [0, 0, HALF_PI]);
  k.add(new THREE.BoxGeometry(0.06, 0.32, 0.06), 0x7a5a3c, [1.0, 1.72, 0]);
  k.add(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), 0xe7d7b0, [0, 1.5, 0]);
  k.add(new THREE.CylinderGeometry(0.16, 0.13, 0.24, 12), 0x4aa8e8, [0, 1.05, 0]);
  return k.build();
});

const TENTS = [0xffa94d, 0x5fc4ac, 0xffd23f, 0xf7a6b8];
const tentGeo = v => cached('tent' + v, () => {
  const k = new Kit(), c = new THREE.Color(TENTS[v % TENTS.length]);
  const s = new THREE.Shape(); s.moveTo(-1.3, 0); s.lineTo(1.3, 0); s.lineTo(0, 1.6); s.closePath();
  const t = new THREE.ExtrudeGeometry(s, { depth: 2.8, bevelEnabled: false }); t.translate(0, -0.04, -1.4);
  k.add(t, c);
  const d = new THREE.ShapeGeometry((() => { const q = new THREE.Shape(); q.moveTo(-0.5, 0); q.lineTo(0.5, 0); q.lineTo(0, 1.05); q.closePath(); return q; })());
  k.add(d, c.clone().multiplyScalar(0.55), [0, -0.03, 1.415]);
  k.add(new THREE.CylinderGeometry(0.04, 0.04, 3.3, 6), 0x8a6a48, [0, 1.58, 0], [HALF_PI, 0, 0]);
  for (const z of [-1.43, 1.43]) k.add(new THREE.CylinderGeometry(0.035, 0.035, 1.75, 6), 0x8a6a48, [0, 0.8, z]);
  for (const z of [-1, 1]) {
    k.addRaw(paint(tubeGeo(V3(0, 1.55, z * 1.6), V3(0, -0.05, z * 2.45), 0.012, 4), 0xe7d7b0));
    k.add(new THREE.BoxGeometry(0.06, 0.25, 0.06), 0x6b4527, [0, 0.03, z * 2.47]);
  }
  return k.build();
});
const campfireGeo = () => cached('campfire', () => {
  const k = new Kit();
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; k.add(new THREE.DodecahedronGeometry(0.16, 0), 0x8f877c, [Math.cos(a) * 0.52, 0.04, Math.sin(a) * 0.52], [a, a * 2, 0], [1, 0.7, 1]); }
  k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12), 0x3a302a, [0, 0.0, 0]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; k.addRaw(paint(tubeGeo(V3(Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42), V3(Math.cos(a) * 0.08, 0.36, Math.sin(a) * 0.08), 0.055, 6), 0x6b4527)); }
  // flame tongues rise well above the logs
  // a tall yellow tongue in the middle, a ring of orange ones leaning out
  const f = new Kit();
  f.add(new THREE.ConeGeometry(0.19, 1.0, 8), 0xffc02e, [0, 0.52, 0]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.3, h = [0.62, 0.48, 0.7, 0.44, 0.58, 0.5][i], r = 0.2, tilt = 0.28;
    f.add(new THREE.ConeGeometry(0.12, h, 6), i % 2 ? 0xff8a1f : 0xff5f1a, [Math.cos(a) * r, h / 2 + 0.05, Math.sin(a) * r], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt]);
  }
  const flame = f.build(), fp = flame.attributes.position, fc = flame.attributes.color, hot = new THREE.Color(0xffe58a), tip = new THREE.Color(0xe8390f), c = new THREE.Color();
  // hot at the root, reddening toward the tips
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i);
    c.setRGB(fc.getX(i), fc.getY(i), fc.getZ(i)).lerp(tip, clamp((y - 0.35) / 0.7, 0, 1) * 0.5).lerp(hot, clamp(1 - y / 0.25, 0, 1) * 0.55);
    fc.setXYZ(i, c.r, c.g, c.b);
  }
  return { base: k.build(), flame };
});
const logGeo = () => cached('log', () => {
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(0.2, 0.21, 1.3, 10), 0x8b5a2b, [0, 0.17, 0], [0, 0, HALF_PI]);
  for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 10), 0xe0c08f, [s * 0.655, 0.17, 0], [0, 0, HALF_PI]);
  return k.build();
});
// a lantern on a little post (glass glows at night)
const lanternGeo = () => cached('lantern', () => {
  const k = new Kit(), g = new Kit();
  k.add(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), 0x6b4527, [0, 0.75, 0]);
  k.add(new THREE.BoxGeometry(0.4, 0.04, 0.04), 0x6b4527, [0.18, 1.62, 0]);
  k.add(new THREE.ConeGeometry(0.15, 0.12, 4), 0x2f3438, [0.34, 1.5, 0], [0, Math.PI / 4, 0]);
  k.add(new THREE.BoxGeometry(0.2, 0.03, 0.2), 0x2f3438, [0.34, 1.2, 0]);
  g.add(new THREE.BoxGeometry(0.17, 0.24, 0.17), 0xffffff, [0.34, 1.33, 0]);
  return { body: k.build(), glass: g.build() };
});
const canGeo = () => cached('can', () => {
  const k = new Kit();
  k.add(new THREE.CylinderGeometry(0.16, 0.17, 0.3, 14), 0x5fc4ac, [0, 0.13, 0]);
  k.addRaw(paint(tubeGeo(V3(0.12, 0.1, 0), V3(0.42, 0.34, 0), 0.025, 6), 0x5fc4ac));
  k.add(new THREE.CylinderGeometry(0.05, 0.03, 0.05, 8), 0x4fa3a5, [0.43, 0.35, 0], [0, 0, -0.9]);
  k.add(new THREE.TorusGeometry(0.11, 0.02, 6, 12, Math.PI), 0x4fa3a5, [-0.02, 0.28, 0]);
  return k.build();
});
const BOAT_RIMS = [0xd8443c, 0x4fa3a5, 0xffc94a];
const boatGeo = v => cached('boat' + v, () => {
  const k = new Kit();
  const outer = new THREE.SphereGeometry(1, 18, 6, 0, TAU, HALF_PI, HALF_PI); outer.scale(0.72, 0.45, 1.6);
  const inner = new THREE.SphereGeometry(1, 18, 6, 0, TAU, HALF_PI, HALF_PI); inner.scale(0.66, 0.4, 1.52);
  k.add(outer, 0xf6f1e7); k.add(inner, 0xb08458, [0, 0.005, 0]);
  const rim = new THREE.TorusGeometry(1, 0.05, 6, 36); rim.rotateX(HALF_PI); rim.scale(0.7, 1, 1.56);
  k.add(rim, BOAT_RIMS[v % BOAT_RIMS.length]);
  for (const z of [-0.55, 0.45]) k.add(new THREE.BoxGeometry(1.15, 0.05, 0.28), 0xa47b52, [0, -0.1, z]);
  for (const s of [-1, 1]) {
    k.addRaw(paint(tubeGeo(V3(s * 0.55, 0.05, 0.05), V3(s * 1.55, -0.32, 0.6), 0.025, 5), 0xc9a26b));
    k.add(new THREE.BoxGeometry(0.03, 0.16, 0.42), 0xc9a26b, [s * 1.6, -0.35, 0.67], [0, s * 0.5, 0]);
  }
  return k.build();
});
// Reeds: a clump of blades and two cattails.
const reedGeo = () => cached('reeds', () => {
  const r = rng(77), pos = [], col = [], c0 = new THREE.Color(0x4f7f2e), c1 = new THREE.Color(0xa9c95a);
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, d = r() * 0.35, h = 0.9 + r() * 0.9, w = 0.04, lean = 0.1 + r() * 0.25;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, dx = Math.cos(a + HALF_PI) * w, dz = Math.sin(a + HALF_PI) * w;
    pos.push(x - dx, -0.3, z - dz, x + dx, -0.3, z + dz, x + Math.cos(a) * lean, h, z + Math.sin(a) * lean);
    col.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  const k = new Kit(); k.addRaw(g);
  for (const [x, z, h] of [[0.1, 0.05, 1.5], [-0.12, -0.08, 1.3]]) {
    k.addRaw(paint(tubeGeo(V3(x, -0.3, z), V3(x * 1.6, h, z * 1.6), 0.012, 4), 0x5f8f35));
    k.add(new THREE.CapsuleGeometry(0.04, 0.2, 2, 6), 0x7a4a26, [x * 1.6, h - 0.05, z * 1.6]);
  }
  return k.build();
});

// ---------------------------------------------------------------- placement helpers
const _fr = {};
// Same as worldgen's spot helper: `ahead` metres along travel from z0, `lat` towards the sea.
function spot(z0, ahead, lat) { const z = z0 - ahead, o = roadFrame(z, _fr); return { x: o.x + o.nx * lat, z: z + o.nz * lat, yaw: o.yaw, lat, zr: z }; }
const faceRoad = s => (s.lat < 0 ? s.yaw - HALF_PI : s.yaw + HALF_PI);
const faceSea = s => s.yaw - HALF_PI;
// local (x right, z forward) offset of an object turned by yaw → world
const toW = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
// lowest ground under a rectangular footprint, so nothing floats
function footY(x, z, yaw, hx, hz) {
  let y = heightAt(x, z);
  for (const [a, b] of [[hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz]]) { const [px, pz] = toW(x, z, yaw, a, b); y = Math.min(y, heightAt(px, pz)); }
  return y;
}
// a matrix that sits a flat thing on sloping ground (tilted with the ground normal)
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _mm = new THREE.Matrix4();
function groundMat(x, z, yaw, ox, oz, dy = 0, s = 1) {
  const e = 0.6, hx = heightAt(x + e, z) - heightAt(x - e, z), hz = heightAt(x, z + e) - heightAt(x, z - e);
  _n.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  _f.set(Math.sin(yaw), 0, Math.cos(yaw)); _f.addScaledVector(_n, -_f.dot(_n)).normalize();
  _r.crossVectors(_n, _f);
  _mm.makeBasis(_r.multiplyScalar(s), _n.clone().multiplyScalar(s), _f.multiplyScalar(s));
  _mm.setPosition(x - ox, heightAt(x, z) + dy, z - oz);
  return _mm.clone();
}

// ---------------------------------------------------------------- one loaded landmark
class Inst {
  constructor(f) {
    this.f = f; this.id = f.id;
    this.ox = Math.round(f.cx); this.oz = Math.round(f.cz);
    this.group = new THREE.Group(); this.group.position.set(this.ox, 0, this.oz);
    this.anims = []; this.npcs = []; this.cols = []; this.owned = []; this.detail = [];
    this.r = 20; this.ready = false;
  }
  // put an object at world (x, y, z) turned by yaw
  put(obj, x, y, z, yaw = 0) { obj.position.set(x - this.ox, y, z - this.oz); obj.rotation.y = yaw; this.group.add(obj); return obj; }
  mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
  col(x, z, r) { this.cols.push([x, z, r]); this.r = Math.max(this.r, Math.hypot(x - this.f.cx, z - this.f.cz) + r); }
  colL(x, z, yaw, lx, lz, r) { const [a, b] = toW(x, z, yaw, lx, lz); this.col(a, b, r); }
  own(o) { this.owned.push(o); return o; }
  // small things hidden when far: [object, x, z]
  hideFar(obj, x, z) { this.detail.push([obj, x, z]); return obj; }
  npc(variant, pose, x, y, z, yaw, lines, headY) {
    const holder = new THREE.Group(), baked = resident(variant, pose);
    for (const m of baked.children) m.layers.set(1);     // small: skip the water reflection
    holder.add(baked);
    this.put(holder, x, y, z, yaw);
    const rec = { holder, baked, lines, wiggle: 0, head: new THREE.Vector3(), headY, phase: hash(Math.round(x * 10), Math.round(z * 10)) * 10, alt: 0, id: this.id + ':' + this.npcs.length };
    this.npcs.push(rec);
    this.hideFar(holder, x, z);
    this.col(x, z, 0.45);
    return rec;
  }
  sign(style, keys, x, z, yaw, w = 1.4, h = 0.5, posts = 2, postH = 0.9) {
    const g = signMesh(style, keys, w, h, posts, postH);
    this.put(g, x, footY(x, z, yaw, w * 0.4, 0.05), z, yaw);
    for (const lx of posts === 1 ? [0] : [-w * 0.38, 0, w * 0.38]) this.colL(x, z, yaw, lx, 0, 0.22);
    this.hideFar(g, x, z);
    return g;
  }
  dispose() { this.group.removeFromParent(); for (const o of this.owned) o.dispose(); this.owned.length = 0; }
}

// ---------------------------------------------------------------- landmark builders (generators: yield = "can pause here")
// Road-side wooden signs for each slot type: [ahead, lat, keys, w, h]
const SIDE_SIGNS = {
  beach: [[-31, ROAD_HALF + 2.2, ['抱肚沙滩']]],
  pier: [[5.75, ROAD_HALF + 2.2, ['钓鱼栈桥']]],
  rocks: [[-10, ROAD_HALF + 2.2, ['礁石海岸']]],
  flowers: [[-12, -(ROAD_HALF + 2.0), ['小花田']]],
  palms: [[-20, ROAD_HALF + 2.2, ['椰子林']]],
  village: [[-36, -(ROAD_HALF + 2.0), ['抱肚村']]],
  camp: [[-14, -(ROAD_HALF + 2.0), ['露营地']]],
};
function sideSigns(f) {
  const out = [];
  for (const [ahead, lat, keys, w = 1.4, h = 0.5] of SIDE_SIGNS[f.type] || []) out.push({ ...spot(f.z, ahead, lat), keys, w, h });
  const s = f.spots.sign;
  if (s) {
    if (f.type === 'windmills') out.push({ ...s, keys: ['风车山坡'], w: 1.4, h: 0.5 });
    if (f.type === 'lighthouse') out.push({ ...s, keys: ['发呆星灯塔'], w: 1.5, h: 0.5 });
    if (f.type === 'viewpoint') out.push({ ...s, keys: ['发呆观景台', '推荐发呆时长：随便'], w: 1.7, h: 0.75 });
  }
  return out;
}
function* slotSigns(I, f) {
  if (f.kind !== 'slot') return;
  for (const s of sideSigns(f)) { I.sign('wood', s.keys, s.x, s.z, faceRoad(s), s.w, s.h); yield; }
}

function arch(I, s) {
  const { body, bulbs, pts } = archGeo(), yaw = s.yaw + Math.PI;          // facing riders
  const g = new THREE.Group();
  g.add(I.mesh(body, mats.prop), I.mesh(bulbs, mats.bulb, false));
  const tex = signTexture('gold', ['欢迎来到发呆星', '海边公路'], 1024, 160, true);
  const fm = cachedMat('archFace', () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
  for (const side of [1, -1]) {
    const f = new THREE.Mesh(plane(archSpan * 2 + 0.6, 1.0), fm);
    f.position.set(0, 4.35, side * 0.185); if (side < 0) f.rotation.y = Math.PI;
    g.add(f);
  }
  const halo = new THREE.Points(cached('archHalo', () => new THREE.BufferGeometry().setFromPoints(pts)), glowMat('arch')); halo.renderOrder = 5;
  g.add(halo);
  let y = Infinity;
  for (const sd of [-1, 1]) { const [px, pz] = toW(s.x, s.z, yaw, sd * archSpan, 0); y = Math.min(y, heightAt(px, pz)); I.col(px, pz, 0.5); }
  I.put(g, s.x, y, s.z, yaw);
}

function kiosk(I, s, variant = 'yellow') {
  const yaw = faceRoad(s), g = new THREE.Group();
  g.add(I.mesh(kioskGeo(), mats.prop));
  const aw = I.mesh(plane(3.7, 1.3), mats.awning); aw.position.set(0, 2.35, 1.6); aw.rotation.x = -HALF_PI + 0.5; g.add(aw);
  const sg = new THREE.Mesh(plane(3.2, 0.8), cachedMat('shopSign', () => new THREE.MeshStandardMaterial({ map: signTexture('gold', ['奶蛙商店', '发呆星分店'], 512, 128, true), roughness: 0.5 })));
  sg.position.set(0, 3.1, 0.6); g.add(sg);
  const board = signMesh('wood', ['今日营业：发呆'], 0.9, 0.55, 1, 0.5); board.position.set(2.3, 0, 1.3); board.rotation.y = -0.4; g.add(board);
  const y = footY(s.x, s.z, yaw, 1.8, 1.3);
  I.put(g, s.x, y, s.z, yaw);
  for (const lx of [-1.15, 0, 1.15]) I.colL(s.x, s.z, yaw, lx, -0.05, 1.2);
  I.colL(s.x, s.z, yaw, 2.3, 1.3, 0.3);
  const [nx, nz] = toW(s.x, s.z, yaw, 0, -0.4);
  I.npc(variant, 'stand', nx, y + 0.45, nz, yaw, ['店员：今天只卖发呆，不要钱。', '店员：叮铃是本店的会员暗号。'], 1.55);
}

function busStop(I, s, variant, lines) {
  const yaw = faceRoad(s), g = new THREE.Group();
  g.add(I.mesh(busGeo(), mats.prop));
  const glass = new THREE.Mesh(plane(2.8, 1.8), mats.water); glass.position.set(0, 1.4, -0.55); g.add(glass);
  const st = signMesh('road', ['发呆站', '末班车 25:00'], 0.9, 0.9, 1, 1.9); st.position.set(1.9, 0, 0.4); g.add(st);
  const y = footY(s.x, s.z, yaw, 1.6, 0.75);
  I.put(g, s.x, y, s.z, yaw);
  for (const lx of [-1.05, 0, 1.05]) I.colL(s.x, s.z, yaw, lx, -0.35, 0.7);
  I.colL(s.x, s.z, yaw, 1.9, 0.4, 0.2);
  const [nx, nz] = toW(s.x, s.z, yaw, 0, -0.25);
  I.npc(variant, 'bus', nx, y, nz, yaw, lines, 1.35);
}
const BUS_LINES = [['在等 25 点的那班车。', '车还没来。不着急。'], ['等车的人：车来了就上车，车不来就坐着。', '等车的人：刚才好像来过一班。没注意。']];

// build cached geometry one piece per step (only slow the first time)
function* warm(...fns) { for (const f of fns) { f(); yield; } }
// Every landmark type's shapes, built one per idle frame (while the intro card is up,
// say) so meeting a new kind of landmark later doesn't cost a long frame.
function* idleWarm() {
  yield* warm(archGeo, kioskGeo, busGeo, windmillGeo, benchGeo, binocGeo, shadeTreeGeo, statueGeo, stoneGeo, wellGeo, campfireGeo, logGeo, lanternGeo, canGeo,
    barrierGeo, chairGeo, castleGeo, palmGeos, reedGeo, () => lighthouseGeo(13, 0xd8443c, true), () => lighthouseGeo(9.5, 0x3d8fc4, false), () => boatGeo(0), () => boatGeo(1));
  for (let i = 0; i < HOUSES; i++) yield* warm(() => houseGeo(i));
  for (let i = 0; i < TENTS.length; i++) yield* warm(() => tentGeo(i));
  for (let i = 0; i < UMB_COLS.length; i++) yield* warm(() => umbrellaGeo(i));
}
function* buildStart(I, f) {
  yield* warm(archGeo, kioskGeo, busGeo);
  arch(I, f.spots.arch); yield;
  yield* need('yellow', 'stand');
  kiosk(I, f.spots.kiosk); yield;
  yield* need('yellow', 'bus');
  busStop(I, f.spots.bus, 'yellow', BUS_LINES[0]);
}
function* buildKiosk(I, f) {
  const v = VARS[Math.floor(hash(f.k, 9) * 4)];
  yield* warm(kioskGeo); yield* need(v, 'stand');
  kiosk(I, f.spots.shop, v); yield* slotSigns(I, f);
}
function* buildBusstop(I, f) {
  const v = VARS[Math.floor(hash(f.k, 9) * 4)];
  yield* warm(busGeo); yield* need(v, 'bus');
  busStop(I, f.spots.shelter, v, BUS_LINES[hash(f.k, 10) < 0.5 ? 0 : 1]); yield* slotSigns(I, f);
}

// Beach things: [ahead, lat on the old 38 m wide beach]. Umbrellas, chairs, the sandcastle.
const BEACH_UMB = [[-28.75, 16], [-14.95, 21], [0, 15.5], [14.95, 22], [31.05, 17], [46, 23]];
function* buildBeach(I, f) {
  yield* warm(...UMB_COLS.map((c, i) => () => umbrellaGeo(i)), chairGeo, castleGeo);
  const r = rng(1000 + f.k * 7), s = clamp((f.W - BAND) / (38 - BAND), 0.6, 1.15);
  const at = (ahead, lat) => {   // squeeze the layout to this beach's width, and keep it on dry sand
    let L = BAND + (lat - BAND) * s, p;
    for (let i = 0; i < 8; i++) { p = spot(f.z, ahead, L); p.y = heightAt(p.x, p.z); if (p.y > 0.3 || L < BAND + 4) break; L -= 2; }
    return p;
  };
  const mg = new Merge(), { ox, oz } = I;
  BEACH_UMB.forEach(([ahead, lat], i) => {
    const p = at(ahead, lat), yaw = faceSea(p) + r() * 0.6 - 0.3;
    mg.add(umbrellaGeo(i % UMB_COLS.length), M4(p.x - ox, p.y - 0.15, p.z - oz, yaw, 1, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3));
    const [tx, tz] = toW(p.x, p.z, yaw, 0.6, 0.4);
    mg.add(towelGeo(i + 2), groundMat(tx, tz, yaw + 0.3, ox, oz, 0.01));
    I.col(p.x, p.z, 0.3);
  });
  yield;
  for (const [ahead, lat] of [[-23, 18.5], [23, 19.5]]) {
    const p = at(ahead, lat);
    mg.add(chairGeo(), groundMat(p.x, p.z, faceSea(p), ox, oz, -0.02));
    I.col(p.x, p.z, 0.6);
  }
  const c = at(-8, 26), cy = faceRoad(c);
  mg.add(castleGeo(), groundMat(c.x, c.z, cy, ox, oz, -0.02));
  I.col(c.x, c.z, 0.8);
  I.group.add(I.mesh(I.own(mg.build()), mats.leaf));
  const [bx, bz] = toW(c.x, c.z, cy, -1.2, 0.8);
  const ball = I.mesh(cached('ball', () => new THREE.SphereGeometry(0.22, 16, 12)), mats.ball);
  I.put(ball, bx, heightAt(bx, bz) + 0.21, bz, 1.3);
  yield;
  // Sakura Pink on a towel under an umbrella, looking at the sea
  yield* need('pink', 'ground');
  const p = at(0.6, 16.6);
  I.npc('pink', 'ground', p.x, p.y + 0.02, p.z, faceSea(p) + 0.2, ['樱花粉害羞地看向了别处。', '樱花粉被铃声吓了一跳，然后继续晒太阳。'], 0.85);
  yield* slotSigns(I, f);
}

function* buildPier(I, f) {
  const st = f.spots.start, d = f.decks[0], L = f.pierLen, y0 = f.pierY;
  const yaw = Math.atan2(d.dx, d.dz), k = new Kit();
  const plank = new THREE.BoxGeometry(2.6, 0.08, 0.28), pile = new THREE.CylinderGeometry(0.11, 0.12, 1, 8), post = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6);
  for (let z = 0; z < L; z += 0.32) k.add(plank, (Math.floor(z / 0.32) % 3) ? 0xa47b52 : 0x96704a, [0, y0, z]);
  yield;
  for (let z = 0; z <= L; z += 3) for (const sd of [-1, 1]) {
    const [px, pz] = toW(st.x, st.z, yaw, sd * 1.2, z);
    const bot = Math.min(heightAt(px, pz) - 0.5, y0 - 0.6), top = y0 + 0.1;
    k.add(pile, 0x6e5236, [sd * 1.2, (top + bot) / 2, z], [0, 0, 0], [1, top - bot, 1]);
    k.add(post, 0x6e5236, [sd * 1.25, y0 + 0.45, z]);
  }
  for (const sd of [-1, 1]) for (const h of [0.5, 0.85]) k.add(new THREE.BoxGeometry(0.06, 0.06, L), 0x8a6644, [sd * 1.25, y0 + h, L / 2]);
  k.add(new THREE.CylinderGeometry(0.22, 0.18, 0.32, 12, 1, true), 0x4aa8e8, [0.65, y0 + 0.2, L - 0.8]);
  yield;
  const g = new THREE.Group();
  g.add(I.mesh(I.own(k.build()), mats.leaf));
  I.put(g, st.x, 0, st.z, yaw);
  // the rails keep riders on the deck; the land end stays open
  for (let z = 1.2; z < L; z += 0.8) for (const sd of [-1, 1]) I.colL(st.x, st.z, yaw, sd * 1.6, z, 0.32);
  for (const lx of [-1, 0, 1]) I.colL(st.x, st.z, yaw, lx, L + 0.3, 0.5);
  // the angler (Sky Blue) at the end, with a rod and a bobbing float
  yield* need('blue', 'angler');
  const [hx, hz] = toW(st.x, st.z, yaw, 0, L - 0.35);
  const rec = I.npc('blue', 'angler', hx, y0 + 0.04, hz, yaw, ['天空蓝正在发呆，暂时没有回应。', '鱼漂动了一下。天空蓝没有注意到。'], 0.95);
  const holder = rec.holder;
  holder.add(I.mesh(cached('rod', () => paint(tubeGeo(V3(0, 0.25, 0.3), V3(0, 2.0, 2.4), 0.018, 6, 0.006), 0x3b2a1a)), mats.prop));
  const tip = V3(0, 2.0, 2.4), bobBase = V3(0, -y0 + 0.02, 5.2);
  const bob = new THREE.Mesh(cached('bob', () => new THREE.SphereGeometry(0.07, 10, 8)), mats.bob);
  bob.position.copy(bobBase); holder.add(bob);
  const lineGeo = I.own(new THREE.BufferGeometry().setFromPoints([tip, bobBase]));
  const line = new THREE.Line(lineGeo, mats.line); line.frustumCulled = false;
  holder.add(line);
  bob.layers.set(1); line.layers.set(1);
  const ph = hash(f.k, 5) * 10;
  I.anims.push((dt, time) => {
    if (!holder.visible) return;
    bob.position.y = bobBase.y + Math.sin(time * 1.7 + ph) * 0.03 + Math.sin(time * 0.6 + ph) * 0.02;
    lineGeo.attributes.position.setXYZ(1, bob.position.x, bob.position.y, bob.position.z); lineGeo.attributes.position.needsUpdate = true;
  });
  yield* slotSigns(I, f);
}

function windmill(I, x, z, yaw, seed) {
  const { body, rotor, H } = windmillGeo(), g = new THREE.Group();
  g.add(I.mesh(body, mats.prop));
  const rot = new THREE.Group(); rot.position.set(0, H + 0.3, 0.75); rot.add(I.mesh(rotor, mats.prop)); g.add(rot);
  I.put(g, x, heightAt(x, z), z, yaw);
  I.col(x, z, 0.75);
  const speed = 0.35 + hash(seed, 1) * 0.2, off = hash(seed, 2) * 6;
  I.anims.push((dt, time) => { rot.rotation.z = off + time * speed; });
}
function* buildWindmills(I, f) {
  yield* warm(windmillGeo);
  const dest = f.kind === 'dest';
  for (const [i, n] of ['w0', 'w1', 'w2'].entries()) {
    const s = f.spots[n];
    windmill(I, s.x, s.z, dest ? f.yaw : faceSea(s), (dest ? 500 + f.lane : f.k) * 3 + i);
    yield;
  }
  if (!dest) yield* slotSigns(I, f);
}

// Lighthouse: tower, glowing lantern, rotating beams. The mainland one has a cottage and a keeper on the gallery.
function lighthouse(I, x, y, z, yaw, { H = 13, stripe = 0xd8443c, cottage = true, scale = 1, halo = 'lh' } = {}) {
  const geo = lighthouseGeo(H, stripe, cottage), g = new THREE.Group();
  g.add(I.mesh(geo.body, mats.prop));
  const lantern = I.mesh(geo.lantern, mats.glass, false); lantern.position.y = H + 1.2; g.add(lantern);
  const beam = new THREE.Group(); beam.position.y = H + 1.2; g.add(beam);
  for (const s of [1, -1]) {
    const c = new THREE.Mesh(geo.beam, mats.beam); c.rotation.z = s * HALF_PI + 0.03 * s; c.renderOrder = 3; beam.add(c);
  }
  const lh = new THREE.Points(cached('lhHalo' + H, () => new THREE.BufferGeometry().setFromPoints([V3(0, H + 1.2, 0)])), glowMat(halo)); lh.renderOrder = 5;
  g.add(lh);
  g.scale.setScalar(scale);
  I.put(g, x, y, z, yaw);
  I.col(x, z, 2.1 * scale);
  if (cottage) { I.colL(x, z, yaw, -4.4, -0.8, 1.5); I.colL(x, z, yaw, -2.8, -0.8, 1.5); }
  const ph = hash(Math.round(x), Math.round(z)) * TAU;
  I.anims.push((dt, time, night) => { beam.rotation.y = time * 0.55 + ph; beam.visible = night > 0.02; });
  return g;
}
function* buildLighthouse(I, f) {
  yield* warm(() => lighthouseGeo(13, 0xd8443c, true));
  const s = f.spots.tower, yaw = faceRoad(s), H = 13, y = footY(s.x, s.z, yaw, 2, 2);
  lighthouse(I, s.x, y, s.z, yaw, { H });
  yield;
  // the keeper up on the gallery, on the road side of the lantern
  yield* need('yellow', 'stand');
  const [kx, kz] = toW(s.x, s.z, yaw, 0, 1.45);
  I.npc('yellow', 'stand', kx, y + H + 0.25, kz, yaw, ['看守员：今天的海，很海。', '看守员也按了一下灯塔的铃。叮——'], 1.3);
  I.cols.pop();     // up on the gallery, not in the way
  yield* slotSigns(I, f);
}

function* buildViewpoint(I, f) {
  yield* warm(benchGeo, binocGeo, shadeTreeGeo); yield* need('green', 'bench');
  const s = f.spots.bench, yaw = faceSea(s), by = footY(s.x, s.z, yaw, 0.9, 0.3);
  I.put(I.mesh(benchGeo(), mats.prop), s.x, by, s.z, yaw);
  I.colL(s.x, s.z, yaw, -0.5, 0, 0.55); I.colL(s.x, s.z, yaw, 0.5, 0, 0.55);
  const [nx, nz] = toW(s.x, s.z, yaw, 0.35, 0);
  I.npc('green', 'bench', nx, by, nz, yaw, ['抹茶绿把肚子抱得更紧了一点。', '抹茶绿向你挥了挥（抱着肚子的）手。'], 1.35);
  yield;
  const b = f.spots.binoculars;
  I.put(I.mesh(binocGeo(), mats.metal), b.x, heightAt(b.x, b.z), b.z, faceSea(b) + 0.4);
  I.col(b.x, b.z, 0.3);
  const t = f.spots.tree;
  const tree = I.mesh(shadeTreeGeo(), mats.prop); tree.scale.setScalar(1.6);
  I.put(tree, t.x, heightAt(t.x, t.z) - 0.2, t.z, 1);
  I.col(t.x, t.z, 0.45);
  yield* slotSigns(I, f);
}

// The Big Naiwa Bang memorial at the end of lane 0: plinth, golden 奶蛙, plaque, stepping stones.
function* buildStatue(I, f, ln) {
  yield* warm(statueGeo); yield* need('gold', 'stand');
  const s = f.spots.statue, yaw = f.yaw, y = footY(s.x, s.z, yaw, 2.2, 2.2);
  const g = new THREE.Group();
  g.add(I.mesh(statueGeo(), mats.prop));
  const gold = resident('gold', 'stand'); gold.scale.setScalar(2.6); gold.position.y = 2.05; g.add(gold);
  const plaque = new THREE.Mesh(plane(1.6, 0.6), cachedMat('plaque', () => new THREE.MeshStandardMaterial({ map: signTexture('gold', ['奶蛙大爆炸纪念碑', '第 0 秒'], 512, 192), roughness: 0.4, metalness: 0.3 })));
  plaque.position.set(0, 1.2, 2.02); g.add(plaque);
  I.put(g, s.x, y, s.z, yaw);
  I.col(s.x, s.z, 2.9);
  yield;
  // stepping stones from the end of the lane up to the plinth
  if (ln) {
    const ax = ln.rx0 - ln.L, az = ln.zAt(ln.L), dx = s.x - ax, dz = s.z - az, d = Math.hypot(dx, dz);
    const mg = new Merge(), r = rng(31);
    for (let t = 0.6; t < d - 3.1; t += 1.5) {
      const px = ax + dx / d * t + Math.sin(t * 1.7) * 0.35, pz = az + dz / d * t + Math.cos(t * 1.3) * 0.35;
      mg.add(stoneGeo(), M4(px - I.ox, heightAt(px, pz) + 0.01, pz - I.oz, r() * 3, [0.55, 0.12, 0.45]));
    }
    if (mg.parts.length) I.group.add(I.mesh(I.own(mg.build()), mats.prop));
  }
}

function* buildFlowers(I, f) {
  const s = f.spots.center, r = rng((f.kind === 'dest' ? 900 + f.lane : f.k) * 13);
  // the gardener left a watering can in the middle of the field and forgot about it
  const x = s.x + (r() - 0.5) * 4, z = s.z + (r() - 0.5) * 4;
  I.put(I.mesh(canGeo(), mats.prop), x, heightAt(x, z) - 0.02, z, r() * TAU);
  yield* slotSigns(I, f);
}

const VILLAGER = [['村民：今天村里的大新闻：一朵云飘过去了。', '村民：铃声很好听。全村都醒了，然后又睡了。']];
function* buildVillage(I, f) {
  const dest = f.kind === 'dest', seed = dest ? 300 + f.lane : f.k, well = f.spots.well;
  const body = new Merge(), glass = new Merge();
  for (let i = 0; i < f.houses; i++) {
    const s = f.spots['house' + i];
    const v = Math.floor(hash(seed, i, 41) * HOUSES);
    yield* warm(() => houseGeo(v));
    const yaw = dest ? Math.atan2(well.x - s.x, well.z - s.z) : faceRoad(s) + (hash(seed, i, 42) - 0.5) * 0.4;
    const h = houseGeo(v), y = footY(s.x, s.z, yaw, h.W / 2, h.D / 2);
    const m = M4(s.x - I.ox, y, s.z - I.oz, yaw);
    body.add(h.body, m); glass.add(h.glass, m);
    for (const lx of [-h.W / 4, h.W / 4]) I.colL(s.x, s.z, yaw, lx, 0, h.D / 2 + 0.25);
    yield;
  }
  I.group.add(I.mesh(I.own(body.build()), mats.prop));
  I.group.add(I.mesh(I.own(glass.build()), mats.window, false));
  // the well, and someone standing by it
  const vv = VARS[Math.floor(hash(seed, 43) * 4)];
  yield* warm(wellGeo); yield* need(vv, 'stand');
  const wy = dest ? f.yaw : faceRoad(well);
  I.put(I.mesh(wellGeo(), mats.prop), well.x, footY(well.x, well.z, wy, 0.9, 0.9), well.z, wy);
  I.col(well.x, well.z, 1.0);
  const [nx, nz] = toW(well.x, well.z, wy, 1.0, 1.4);
  I.npc(vv, 'stand', nx, heightAt(nx, nz), nz, wy + 0.5, VILLAGER[0], 1.3);
  if (!dest) yield* slotSigns(I, f);
}

const CAMPER = ['露营的人：火是用来看的，不是用来烤东西的。', '露营的人：今晚打算数星星。数到一就睡。'];
function* buildCamp(I, f) {
  const dest = f.kind === 'dest', seed = dest ? 400 + f.lane : f.k, s = f.spots.tent, cv = VARS[Math.floor(hash(seed, 4) * 4)];
  yield* warm(() => tentGeo(Math.floor(hash(seed, 1) * TENTS.length)), campfireGeo, logGeo, lanternGeo); yield* need(cv, 'log');
  const yaw = dest ? f.yaw : faceRoad(s), { ox, oz } = I;
  const L = (lx, lz) => toW(s.x, s.z, yaw, lx, lz);
  const mg = new Merge();
  let [x, z] = L(0, -1.6);
  mg.add(tentGeo(Math.floor(hash(seed, 1) * TENTS.length)), groundMat(x, z, yaw + 0.15, ox, oz));
  I.colL(s.x, s.z, yaw, -0.6, -1.6, 1.3); I.colL(s.x, s.z, yaw, 0.6, -1.6, 1.3);
  const cf = campfireGeo(), [fx, fz] = L(0.2, 1.9), fy = heightAt(fx, fz);
  mg.add(cf.base, groundMat(fx, fz, 0, ox, oz));
  I.col(fx, fz, 0.65);
  const logs = [[-1.45, 2.3, 0.35], [1.6, 1.5, -1.0]];
  for (const [lx, lz, ry] of logs) { [x, z] = L(lx, lz); mg.add(logGeo(), groundMat(x, z, yaw + HALF_PI + ry, ox, oz, -0.03)); I.col(x, z, 0.5); }
  [x, z] = L(2.2, -0.4);
  const ln = lanternGeo();
  mg.add(ln.body, M4(x - ox, heightAt(x, z) - 0.05, z - oz, yaw));
  I.group.add(I.mesh(I.own(mg.build()), mats.prop));
  I.put(I.mesh(ln.glass, mats.window, false), x, heightAt(x, z) - 0.05, z, yaw);
  I.col(x, z, 0.2);
  yield;
  // the fire: flickering flame, a glow at night
  const flame = I.mesh(cf.flame, mats.flame, false);
  I.put(flame, fx, fy, fz, 0);
  const glow = new THREE.Points(cached('fireHalo', () => new THREE.BufferGeometry().setFromPoints([V3(0, 0.75, 0)])), glowMat('fire')); glow.renderOrder = 5;
  I.put(glow, fx, fy, fz, 0);
  // warm light on the ground around the fire at night
  const pool = new THREE.Mesh(cached('firePool', () => new THREE.CircleGeometry(4.2, 24).rotateX(-HALF_PI)), mats.firePool);
  pool.applyMatrix4(groundMat(fx, fz, 0, I.ox, I.oz, 0.06)); pool.layers.set(1);
  I.group.add(pool);
  const ph = hash(seed, 3) * 10;
  I.anims.push((dt, time) => {
    const t = time * 9 + ph;
    flame.scale.set(1 + Math.sin(t * 1.3) * 0.08, 1 + Math.sin(t) * 0.16 + Math.sin(t * 2.7) * 0.07, 1 + Math.cos(t * 1.1) * 0.08);
    flame.rotation.y = Math.sin(t * 0.37) * 0.5;
  });
  // someone on the first log, facing the fire
  const [lx, lz] = L(logs[0][0], logs[0][1]);
  const fy2 = Math.atan2(fx - lx, fz - lz);
  I.npc(cv, 'log', lx, heightAt(lx, lz) - 0.03, lz, fy2, CAMPER, 1.25);
  I.cols.pop();
  if (!dest) yield* slotSigns(I, f);
}

const END_LINES = ['这里是路的尽头。我在等路继续往前长。', '难得有人骑到这里。请随便坐，随便发呆。'];
// a red-and-white striped board on two posts: the lane really ends here
const barrierGeo = () => cached('barrier', () => {
  const k = new Kit(), n = 7, w = 3.2;
  for (const x of [-1.35, 1.35]) { k.add(new THREE.BoxGeometry(0.12, 1.25, 0.12), 0xf4efe6, [x, 0.42, 0]); k.add(new THREE.BoxGeometry(0.14, 0.05, 0.14), 0x6b4527, [x, 1.06, 0]); }
  for (let i = 0; i < n; i++) k.add(new THREE.BoxGeometry(w / n, 0.3, 0.06), i % 2 ? 0xf7f5ee : 0xe2453c, [-w / 2 + (i + 0.5) * w / n, 0.82, 0.09]);
  k.add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), 0xffb020, [0, 0.82, 0.13], [HALF_PI, 0, 0]);
  return k.build();
});
function* buildEnd(I, f) {
  const ev = VARS[Math.floor(hash(f.lane, 62) * 4)];
  yield* warm(benchGeo, barrierGeo); yield* need(ev, 'bench');
  const s = f.spots.bench, yaw = f.yaw, by = footY(s.x, s.z, yaw, 0.9, 0.3);
  I.put(I.mesh(benchGeo(), mats.prop), s.x, by, s.z, yaw);
  I.colL(s.x, s.z, yaw, -0.5, 0, 0.55); I.colL(s.x, s.z, yaw, 0.5, 0, 0.55);
  // behind the bench, across where the lane would carry on
  const [bx, bz] = toW(s.x, s.z, yaw, 0, -2.6);
  I.put(I.mesh(barrierGeo(), mats.prop), bx, footY(bx, bz, yaw, 1.4, 0.1) - 0.05, bz, yaw);
  for (const lx of [-1.35, 0, 1.35]) I.colL(bx, bz, yaw, lx, 0, 0.3);
  if (hash(f.lane, 61) < 0.6) {
    const [nx, nz] = toW(s.x, s.z, yaw, -0.35, 0);
    I.npc(ev, 'bench', nx, by, nz, yaw, END_LINES, 1.35);
  }
  yield;
}

// A wooden sign at the end of every lane, facing riders as they arrive.
function laneEndSign(I, f, ln) {
  if (!ln || !f.caption) return;
  const u = Math.max(8, ln.L - 3), x = ln.rx0 - u, zc = ln.zAt(u), m = ln.zAt(u + 0.5) - ln.zAt(u - 0.5), n = Math.hypot(1, m);
  // to the side of the lane (the riders' right as they head inland)
  const sx = x + (-m / n) * (LANE_HALF + 1.1), sz = zc + (-1 / n) * (LANE_HALF + 1.1);
  const yaw = Math.atan2(1, -m);
  I.sign('wood', [f.caption[0]], sx, sz, yaw, f.caption[0].length > 6 ? 1.9 : 1.4, 0.5);
}

const ISLANDER = ['岛民：岛上的居民有：我，和椰子树们。', '岛民：涨潮了。没关系，本来也不打算回去。'];
function* buildPalmIsle(I, s) {
  const iv = VARS[Math.floor(hash(s.i, 44) * 4)];
  yield* warm(palmGeos, chairGeo); yield* need(iv, 'ground');
  const r = rng(7000 + s.i * 13), { ox, oz } = I, palms = palmGeos();
  const leaf = new Merge(), things = new Merge();
  const dry = (x, z, h = 0.8) => heightAt(x, z) > h;
  // a hammock between two palms on the island's sea side
  const ha = (r() - 0.5) * 1.6, hd = s.R * 0.32;
  const hcx = s.x + Math.cos(ha) * hd, hcz = s.z + Math.sin(ha) * hd;
  const px = -Math.sin(ha), pz = Math.cos(ha), span = 1.9;
  const A = [hcx + px * span, hcz + pz * span], B = [hcx - px * span, hcz - pz * span];
  const trees = [];
  if (dry(...A) && dry(...B)) trees.push(A, B);
  for (let i = 0; i < 12 && trees.length < 6; i++) {
    const a = r() * TAU, d = s.R * (0.1 + 0.45 * r()), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    if (dry(x, z) && trees.every(([tx, tz]) => Math.hypot(tx - x, tz - z) > 4)) trees.push([x, z]);
  }
  trees.forEach(([x, z], i) => { leaf.add(palms[i % 3], M4(x - ox, heightAt(x, z) - 0.1, z - oz, r() * TAU, 0.85 + r() * 0.3)); I.col(x, z, 0.4); });
  yield;
  if (trees[0] === A) {
    const ya = heightAt(...A) + 1.25, yb = heightAt(...B) + 1.25;
    leaf.add(I.own(hammockGeo(V3(A[0] - ox, ya, A[1] - oz), V3(B[0] - ox, yb, B[1] - oz), Math.floor(r() * 3))), new THREE.Matrix4());
  }
  // a beach spot on the open-sea side: towel, umbrella, deck chair and a resident facing the sea
  const a0 = (r() - 0.5) * 0.9, dx = Math.cos(a0), dz = Math.sin(a0);
  let d = s.R * 0.35;
  for (let t = s.R * 0.35; t < s.R * 1.3; t += 1) { if (heightAt(s.x + dx * t, s.z + dz * t) < 0.55) break; d = t; }
  d = Math.max(s.R * 0.3, d - 2);
  const bx = s.x + dx * d, bz = s.z + dz * d, yaw = Math.atan2(dx, dz);
  things.add(towelGeo(Math.floor(r() * 5)), groundMat(bx, bz, yaw, ox, oz, 0.01));
  let [ux, uz] = toW(bx, bz, yaw, -0.7, -0.5);
  things.add(umbrellaGeo(Math.floor(r() * UMB_COLS.length)), M4(ux - ox, heightAt(ux, uz) - 0.15, uz - oz, yaw, 1, -0.12, 0.1));
  I.col(ux, uz, 0.3);
  [ux, uz] = toW(bx, bz, yaw, 1.5, 0.2);
  things.add(chairGeo(), groundMat(ux, uz, yaw - 0.2, ox, oz, -0.02));
  I.col(ux, uz, 0.6);
  I.group.add(I.mesh(I.own(leaf.build()), mats.leaf), I.mesh(I.own(things.build()), mats.leaf));
  yield;
  I.npc(iv, 'ground', bx, heightAt(bx, bz) + 0.02, bz, yaw, ISLANDER, 0.85);
  // a little sign where the sandbar leaves the mainland beach
  if (s.bar) {
    const sx = s.bar.x0 - 1.5, sz = s.bar.z0 + 3.6, h = heightAt(sx, sz);
    if (h > 0.25 && h < 3) I.sign('wood', [CAPTION.palmIsle[0]], sx, sz, -HALF_PI, 1.4, 0.5);
  }
}
// A striped hammock slung between two points (world-relative coords already local to the instance).
function hammockGeo(a, b, v) {
  const cols = [[0xff6b6b, 0xfff6e6], [0x4aa8e8, 0xfff6e6], [0x5fc4ac, 0xffd23f]][v].map(c => new THREE.Color(c));
  const N = 14, M = 6, pos = [], col = [];
  const dir = V3().subVectors(b, a).normalize();
  const side = V3(-dir.z, 0, dir.x).normalize();
  const P = (u, w) => {
    const width = lerp(0.12, 0.85, Math.pow(Math.sin(Math.PI * u), 0.6));
    const q = V3().lerpVectors(a, b, u);
    q.y -= 0.7 * 4 * u * (1 - u);
    const t = w * 2 - 1;
    q.addScaledVector(side, t * width / 2);
    q.y += 0.14 * t * t * Math.sin(Math.PI * u);
    return q;
  };
  const tri = (p, c) => { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); };
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const c = cols[j % 2], u0 = 0.06 + 0.88 * i / N, u1 = 0.06 + 0.88 * (i + 1) / N, w0 = j / M, w1 = (j + 1) / M;
    const p00 = P(u0, w0), p10 = P(u1, w0), p01 = P(u0, w1), p11 = P(u1, w1);
    tri(p00, c); tri(p10, c); tri(p11, c); tri(p00, c); tri(p11, c); tri(p01, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  const k = new Kit(); k.addRaw(g);
  for (const [end, u] of [[a, 0.06], [b, 0.94]]) k.addRaw(paint(tubeGeo(end, P(u, 0.5), 0.015, 4), 0xe7d7b0));
  return k.build();
}

const KEEPER_BOAT = ['看守员：在去上班的路上。已经划了一下午了。', '看守员：灯塔会自己亮的，它很懂事。'];
function boat(I, x, z, yaw, v) {
  const g = new THREE.Group();
  g.add(I.mesh(boatGeo(v), mats.leaf));
  I.put(g, x, 0.17, z, yaw);
  const ph = hash(Math.round(x), Math.round(z)) * 10;
  I.anims.push((dt, time) => { g.position.y = 0.17 + Math.sin(time * 1.3 + ph) * 0.04; g.rotation.z = Math.sin(time * 0.9 + ph) * 0.04; g.rotation.x = Math.sin(time * 0.7 + ph * 2) * 0.025; });
  return g;
}
function* buildLighthouseIsle(I, s) {
  yield* warm(() => lighthouseGeo(9.5, 0x3d8fc4, false), () => boatGeo(1)); yield* need('blue', 'boat');
  const H = 9.5, y = footY(s.x, s.z, 0, 1.6, 1.6);
  lighthouse(I, s.x, y, s.z, -HALF_PI, { H, stripe: 0x3d8fc4, cottage: false, scale: 0.85, halo: 'lhs' });
  yield;
  // the keeper, rowing to work, halfway there and zoning out
  const bz = s.z + (s.bar ? 34 : 14);
  let bx = lerp(coastX(bz) + 20, s.x - s.R * 1.05, 0.5);
  for (let i = 0; i < 12 && heightAt(bx, bz) > -0.9; i++) bx += 8;
  if (heightAt(bx, bz) < -0.6) {
    const yaw = HALF_PI + (hash(s.i, 3) - 0.5) * 0.6;
    const g = boat(I, bx, bz, yaw, 1);
    const holder = new THREE.Group(), baked = resident('blue', 'boat');
    for (const m of baked.children) m.layers.set(1);
    holder.add(baked); holder.position.set(0, -0.1, -0.5); holder.rotation.y = Math.PI;
    g.add(holder);
    I.npcs.push({ holder, baked, lines: KEEPER_BOAT, wiggle: 0, head: new THREE.Vector3(), headY: 1.1, phase: 3, alt: 0, id: I.id + ':keeper' });
    I.hideFar(holder, bx, bz);
  }
}

const LAKE_LINES = ['钓鱼的人：湖里没有鱼。我知道。', '钓鱼的人：嘘——湖在发呆。'];
function* buildLake(I, l) {
  const lv = VARS[Math.floor(hash(Math.round(l.x), 7) * 4)];
  yield* warm(reedGeo, () => boatGeo(0)); yield* need(lv, 'boat');
  const r = rng(3000 + Math.round(l.x * 7 + l.z * 3)), mg = new Merge(), { ox, oz } = I;
  // reeds around the shallow edge
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU;
    for (let t = l.R * 0.85; t < l.R * 1.4; t += 0.8) {
      const x = l.x + Math.cos(a) * t, z = l.z + Math.sin(a) * t, h = heightAt(x, z);
      if (h > -0.35 && h < 0.1) { mg.add(reedGeo(), M4(x - ox, h, z - oz, r() * TAU, 0.8 + r() * 0.5)); break; }
    }
  }
  if (mg.parts.length) { const m = I.mesh(I.own(mg.build()), mats.leaf, false); m.layers.set(1); I.group.add(m); }
  // a name board on the dry bank, on the side riders usually come from (the coast, +x)
  if (l.caption) for (const da of [0, 0.35, -0.35, 0.7, -0.7]) {
    let t = l.R * 1.2, x, z, h;
    for (; t < l.R * 2; t += 1.5) { x = l.x + Math.cos(da) * t; z = l.z + Math.sin(da) * t; h = heightAt(x, z); if (h > 0.3) break; }
    if (h > 0.3) { I.sign('wood', [l.caption[0]], x, z, Math.atan2(Math.cos(da), Math.sin(da)), 1.4, 0.5); break; }
  }
  yield;
  // a little rowing boat, sometimes with someone fishing in it
  const a = hash(Math.round(l.x), Math.round(l.z), 5) * TAU, bx = l.x + Math.cos(a) * l.R * 0.55, bz = l.z + Math.sin(a) * l.R * 0.55;
  if (heightAt(bx, bz) < -0.6) {
    const g = boat(I, bx, bz, a + 0.8, 0);
    if (hash(Math.round(l.x), Math.round(l.z), 6) < 0.7) {
      const holder = new THREE.Group(), baked = resident(lv, 'boat');
      for (const m of baked.children) m.layers.set(1);
      holder.add(baked); holder.position.set(0, -0.1, 0.45);
      g.add(holder);
      holder.add(I.mesh(cached('rod2', () => paint(tubeGeo(V3(0.1, 0.3, 0.3), V3(1.4, 1.6, 1.6), 0.016, 6, 0.006), 0x3b2a1a)), mats.prop));
      I.npcs.push({ holder, baked, lines: LAKE_LINES, wiggle: 0, head: new THREE.Vector3(), headY: 1.1, phase: 5, alt: 0, id: I.id + ':angler' });
      I.hideFar(holder, bx, bz);
    }
  }
}

function* buildPalms(I, f) { yield* slotSigns(I, f); }
function* buildRocks(I, f) { yield* slotSigns(I, f); }

const SLOT_BUILD = {
  start: buildStart, beach: buildBeach, pier: buildPier, windmills: buildWindmills, lighthouse: buildLighthouse,
  viewpoint: buildViewpoint, rocks: buildRocks, flowers: buildFlowers, palms: buildPalms, busstop: buildBusstop,
  kiosk: buildKiosk, village: buildVillage, camp: buildCamp,
};
const DEST_BUILD = { statue: buildStatue, windmills: buildWindmills, flowers: buildFlowers, village: buildVillage, camp: buildCamp, end: buildEnd };
function builderFor(f) {
  if (f.kind === 'slot') return SLOT_BUILD[f.type];
  if (f.kind === 'dest') {
    const b = DEST_BUILD[f.type];
    return b && function* (I) { const ln = laneOf(f); yield* b(I, f, ln); laneEndSign(I, f, ln); };
  }
  if (f.kind === 'island') return f.type === 'palmIsle' ? buildPalmIsle : f.type === 'lighthouseIsle' ? buildLighthouseIsle : null;
  if (f.kind === 'lake') return buildLake;
  return null;
}
function laneOf(f) { for (const ln of lanesNear(f.z)) if (ln.k === f.lane) return ln; return null; }

// ---------------------------------------------------------------- road furniture batches
// One InstancedMesh per kind for everything loaded; matrices are relative to `origin`
// (near the rider) so float32 stays precise far from (0, 0).
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
class Batch {
  constructor(parent, geo, mat, { shadow = true, layer = 0 } = {}) { this.parent = parent; this.geo = geo; this.mat = mat; this.shadow = shadow; this.layer = layer; this.cap = 0; this.mesh = null; this.n = 0; }
  begin(count) {
    if (count > this.cap) {
      if (this.mesh) { this.mesh.removeFromParent(); this.mesh.dispose(); }
      this.cap = Math.max(16, Math.ceil(count * 1.5));
      const m = this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.cap);
      m.castShadow = this.shadow; m.receiveShadow = true; m.frustumCulled = false; m.layers.set(this.layer);
      this.parent.add(m);
    }
    this.n = 0;
  }
  add(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n++, _m);
  }
  addMatrix(m) { this.mesh.setMatrixAt(this.n++, m); }
  end() { if (!this.mesh) return; this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.visible = this.n > 0; }
}

// ---------------------------------------------------------------- the manager
export class Props {
  constructor(scene, { low = false } = {}) {
    initMats();
    this.scene = scene; this.low = low;
    this.npcs = [];            // residents currently loaded (main.js reads this every frame)
    this.lampPos = [];         // world positions of loaded street lamp bulbs
    this.insts = new Map();    // feature id → Inst
    this.segs = new Map();     // segment index → furniture
    this.queue = [];
    this.planT = 0; this.lastX = 1e9; this.lastZ = 1e9; this.detailT = 0;
    this.dirty = false;
    this.idle = idleWarm();
    // road furniture
    const G = lampGeos();
    this.furn = new THREE.Group();
    scene.add(this.furn);
    this.B = {
      lamp: new Batch(this.furn, G.lamp, mats.prop),
      bulb: new Batch(this.furn, G.bulb, mats.bulb, { shadow: false }),
      pool: new Batch(this.furn, G.pool, mats.pool, { shadow: false, layer: 1 }),
      post: new Batch(this.furn, G.post, mats.metal),
      fpost: new Batch(this.furn, G.fpost, mats.prop, { layer: 1 }),
      rope: new Batch(this.furn, G.rope, mats.prop, { shadow: false, layer: 1 }),
    };
    this.halos = new THREE.Points(new THREE.BufferGeometry(), glowMat('lamp'));
    this.halos.frustumCulled = false; this.halos.renderOrder = 5;
    this.furn.add(this.halos);
    this.rail = new THREE.Mesh(new THREE.BufferGeometry(), mats.rail);
    this.rail.castShadow = true; this.rail.receiveShadow = true; this.rail.frustumCulled = false;
    this.furn.add(this.rail);
  }

  setQuality(low) { this.low = low; this.planT = 0; }
  q(k) { return RANGE[k][this.low ? 1 : 0]; }

  // Build everything around (x, z) right now (start of the game).
  prime(x, z) {
    this.plan(x, z);
    this.work(Infinity);
    this.rebuild(x, z);
    this.updateDetail(x, z);
  }

  update(dt, time, night, px, pz) {
    this.planT -= dt;
    if (this.planT <= 0 || Math.hypot(px - this.lastX, pz - this.lastZ) > 12) this.plan(px, pz);
    this.work(this.q('budget'));
    if (this.dirty) this.rebuild(px, pz);
    this.detailT -= dt;
    if (this.detailT <= 0) { this.detailT = 0.3; this.updateDetail(px, pz); }

    // lights that follow the time of day, shared by every instance
    mats.bulb.emissiveIntensity = night * 6;
    mats.glass.emissiveIntensity = 0.3 + night * 3.5;
    mats.window.emissiveIntensity = night * 1.5;
    mats.pool.opacity = night * 0.55; mats.pool.visible = night > 0.02;
    mats.beam.uniforms.strength.value = night;
    const on = night > 0.02;
    for (const k of ['lamp', 'arch', 'lh', 'lhs', 'fire']) glowMat(k).visible = on;
    GLOW.lamp.opacity = night * 0.9;
    GLOW.arch.opacity = night;
    GLOW.lh.opacity = GLOW.lhs.opacity = night * (0.75 + 0.25 * Math.max(0, Math.cos(time * 1.1)));
    const flick = 0.8 + 0.12 * Math.sin(time * 13) + 0.08 * Math.sin(time * 7.3);
    GLOW.fire.opacity = night * flick;
    mats.firePool.opacity = night * 0.75 * flick; mats.firePool.visible = on;
    for (const inst of this.insts.values()) if (inst.ready) for (const a of inst.anims) a(dt, time, night);
    for (const n of this.npcs) {
      n.wiggle = Math.max(0, n.wiggle - dt * 1.6);
      const w = n.wiggle;
      n.baked.rotation.z = Math.sin(w * 18) * 0.12 * w;
      n.baked.scale.y = 1 + Math.sin(time * 1.6 + n.phase) * 0.012;
    }
  }

  // Solid things near (x, z): pushes [cx, cz, radius].
  collidersNear(x, z, r, out = []) {
    for (const inst of this.insts.values()) {
      if (!inst.ready || Math.hypot(inst.f.cx - x, inst.f.cz - z) > inst.r + r) continue;
      for (const c of inst.cols) { const dx = c[0] - x, dz = c[1] - z, rr = r + c[2]; if (dx * dx + dz * dz < rr * rr) out.push(c); }
    }
    for (const seg of this.segs.values()) {
      if (!seg.ready || z < seg.z0 - r - 4 || z > seg.z0 + SEG + r + 4) continue;
      for (const c of seg.cols) { const dx = c[0] - x, dz = c[1] - z, rr = r + c[2]; if (dx * dx + dz * dz < rr * rr) out.push(c); }
    }
    return out;
  }

  stats() { return { features: this.insts.size, segments: this.segs.size, npcs: this.npcs.length, lamps: this.lampPos.length, pending: this.queue.length }; }

  // ---- what should be loaded
  plan(px, pz) {
    this.planT = 0.4; this.lastX = px; this.lastZ = pz;
    const FR = this.q('feat'), SR = this.q('seg');
    const want = new Set();
    for (const f of featuresNear(px, pz, FR * 1.5)) {
      const b = builderFor(f);
      if (!b) continue;
      const r = FR * (BIG.has(f.type) ? 1.5 : 1), d = Math.hypot(f.cx - px, f.cz - pz);
      const inst = this.insts.get(f.id);
      if (d < r || (inst && d < r + 150)) want.add(f.id);
      if (d < r && !inst) {
        const I = new Inst(f);
        this.insts.set(f.id, I);
        this.queue.push({ inst: I, d, gen: b(I, f) });
      }
    }
    for (const [id, I] of this.insts) if (!want.has(id)) this.unload(I);
    // road furniture segments: by distance to the road there
    const segWant = new Set();
    for (let j = Math.floor((pz - SR - 100) / SEG); j <= Math.floor((pz + SR + 100) / SEG); j++) {
      const zc = j * SEG + SEG / 2, d = Math.hypot(roadFrame(zc, _fr).x - px, zc - pz);
      const seg = this.segs.get(j);
      if (d < SR || (seg && d < SR + 100)) segWant.add(j);
      if (d < SR && !seg) {
        const s = { j, z0: j * SEG, lamps: [], posts: [], rails: [], fence: [], ropes: [], cols: [], group: new THREE.Group(), ready: false, signs: [] };
        this.segs.set(j, s);
        this.queue.push({ seg: s, d, gen: this.buildSeg(s) });
      }
    }
    for (const [j, s] of this.segs) if (!segWant.has(j)) this.unloadSeg(s);
    this.queue.sort((a, b) => a.d - b.d);
  }

  work(ms) {
    const t0 = performance.now();
    while (this.queue.length) {
      const job = this.queue[0];
      let done = true;
      const ts = performance.now();
      try { done = job.gen.next().done; } catch (e) { console.error('props:', e); }
      job.n = (job.n || 0) + 1;
      if (this.slow) { const te = performance.now() - ts; if (te > 6) this.slow.push([(job.inst || job.seg).id ?? 'seg' + job.seg.j, (job.inst && job.inst.f.type), job.n, Math.round(te)]); }
      if (done) {
        this.queue.shift();
        if (job.inst) { job.inst.ready = true; this.scene.add(job.inst.group); this.refreshNpcs(); this.detailT = 0; }
        else { job.seg.ready = true; this.scene.add(job.seg.group); this.dirty = true; this.detailT = 0; }
      }
      if (performance.now() - t0 > ms) break;
    }
    // nothing streaming: one warm-up step, if this frame still has room
    if (!this.queue.length && this.idle && ms !== Infinity && performance.now() - t0 < ms * 0.5) {
      try { if (this.idle.next().done) this.idle = null; } catch (e) { this.idle = null; console.error('props:', e); }
    }
  }

  unload(I) {
    if (!I.ready) this.queue = this.queue.filter(j => j.inst !== I);
    I.dispose();
    this.insts.delete(I.id);
    if (I.ready) this.refreshNpcs();
  }
  unloadSeg(s) {
    if (!s.ready) this.queue = this.queue.filter(j => j.seg !== s);
    s.group.removeFromParent();
    this.segs.delete(s.j);
    if (s.ready) this.dirty = true;
  }
  refreshNpcs() {
    const a = this.npcs; a.length = 0;
    for (const I of this.insts.values()) if (I.ready) for (const n of I.npcs) a.push(n);
  }
  updateDetail(px, pz) {
    const D2 = this.q('detail') ** 2;
    for (const I of this.insts.values()) for (const d of I.detail) d[0].visible = (d[1] - px) ** 2 + (d[2] - pz) ** 2 < D2;
    for (const s of this.segs.values()) for (const d of s.signs) d[0].visible = (d[1] - px) ** 2 + (d[2] - pz) ** 2 < D2;
  }

  // ---- one 64 m stretch of coast road: lamps, guard rails, beach fences, signs
  *buildSeg(seg) {
    const { j, z0 } = seg, z1 = z0 + SEG, own = z => Math.floor(z / SEG) === j;
    const slots = [];
    for (let k = Math.floor(-(z1 + 180) / SLOT); k <= Math.ceil(-(z0 - 90) / SLOT); k++) slots.push(slotFeature(k));
    const lanes = lanesNear(z0 + SEG / 2);
    // lamps stand on the land side; skip ones that would hit a sign, a shelter, the arch or a lane mouth
    const busy = [];
    for (const f of slots) {
      if (f.sign) busy.push([f.sign.zr, 2.4]);
      for (const s of sideSigns(f)) if (s.lat < 0) busy.push([s.zr, 2.4]);
      if (f.type === 'start') busy.push([f.spots.arch.zr, 3], [f.spots.bus.zr, 3.6]);
      if (f.type === 'busstop') busy.push([f.spots.shelter.zr, 3.6]);
    }
    for (const ln of lanes) busy.push([ln.z0 + 1.5, 6]);
    for (let i = Math.floor(z0 / LAMP_STEP); i * LAMP_STEP < z1; i++) {
      const z = i * LAMP_STEP;
      if (!own(z) || busy.some(([zc, w]) => Math.abs(z - zc) < w)) continue;
      const o = roadFrame(z, _fr), lat = -(ROAD_HALF + 0.8);
      const x = o.x + o.nx * lat, zz = z + o.nz * lat, y = o.y - 0.25;
      const bx = x + o.nx * 1.3, bz = zz + o.nz * 1.3, grade = roadY(bz + 0.5) - roadY(bz - 0.5);
      seg.lamps.push({ x, y, z: zz, yaw: Math.atan2(o.nx, o.nz), bx, bz, py: roadY(bz) + 0.05, grade, v: V3(bx, y + 4.6, bz) });
      seg.cols.push([x, zz, 0.3]);
    }
    yield;
    // guard rails on the sea side up on the cliffs (gaps at lookouts and lighthouses)
    const gaps = [];
    for (const f of slots) { if (f.type === 'lighthouse') gaps.push(f.spots.tower.zr); if (f.type === 'viewpoint') gaps.push(f.spots.bench.zr); }
    let prev = null;
    for (let i = j * 80; i <= j * 80 + 80; i++) {
      const z = i * 0.8, R = rowAt(z);
      if (!(R.ry > 4.2 && R.sand < 0.3) || gaps.some(g => Math.abs(z - g) < 8)) { prev = null; continue; }
      const o = roadFrame(z, _fr), lat = ROAD_HALF + 0.75;
      const p = [o.x + o.nx * lat, o.y, z + o.nz * lat, o.nx, o.nz];
      if (i % 3 === 0 && i < j * 80 + 80) seg.posts.push([p[0], p[1] - 0.03, p[2], Math.atan2(o.tx, o.tz)]);
      // solid: a row of overlapping colliders, one every 1.6 m
      if (i % 2 === 0 && i < j * 80 + 80) seg.cols.push([p[0], p[2], 0.45]);
      if (prev) seg.rails.push(prev, p);
      prev = p;
    }
    yield;
    // low rope fence along the beaches (gaps at piers and where a sandbar leaves the beach)
    const fgaps = [];
    for (const f of slots) { if (f.type === 'pier') fgaps.push(f.spots.start.zr); if (f.type === 'beach') fgaps.push(f.spots.center.zr); }
    for (let i = Math.floor(-z1 / ICELL) - 1; i <= Math.ceil(-z0 / ICELL) + 1; i++) { const s = island(i); if (s && s.bar) fgaps.push(s.bar.z0); }
    const fenceAt = z => {
      const R = rowAt(z);
      if (R.sand < 0.7 || R.ry > 3 || fgaps.some(g => Math.abs(z - g) < 6)) return null;
      const o = roadFrame(z, _fr), lat = ROAD_HALF + 1.2;
      return [o.x + o.nx * lat, o.y - 0.25, z + o.nz * lat];
    };
    // an opening every 5 posts (one post left out) so riders can get down to the sand almost
    // anywhere; posts and ropes are solid, the openings aren't
    const open = i => ((i % 5) + 5) % 5 === 2;
    for (let i = Math.floor(z0 / 2.6) - 1; i * 2.6 < z1 + 2.6; i++) {
      const z = i * 2.6;
      if (!own(z) || open(i)) continue;
      const p = fenceAt(z);
      if (!p) continue;
      seg.fence.push([...p, hash(i, 77) * 3]);
      seg.cols.push([p[0], p[2], 0.12]);
      const q = open(i + 1) ? null : fenceAt(z + 2.6);
      if (q) {
        seg.ropes.push([p[0], p[1] + 0.62, p[2], q[0], q[1] + 0.62, q[2]]);
        seg.cols.push([(p[0] + q[0]) / 2, (p[2] + q[2]) / 2, 0.5]);
      }
    }
    yield;
    // road signs (facing riders) and pointers at lane mouths
    for (const f of slots) {
      const s = f.sign;
      if (!s || !own(s.zr)) continue;
      const g = signMesh(s.style, s.keys, 1.7, 0.75, 2, 1.25), yaw = s.yaw + Math.PI;
      g.position.set(s.x, footY(s.x, s.z, yaw, 0.7, 0.05), s.z); g.rotation.y = yaw;
      seg.group.add(g); seg.signs.push([g, s.x, s.z]);
      for (const lx of [-0.65, 0, 0.65]) { const [cx, cz] = toW(s.x, s.z, yaw, lx, 0); seg.cols.push([cx, cz, 0.22]); }
      yield;
    }
    for (const ln of lanes) {
      const zs = ln.z0 + 3.4;
      if (!own(zs) || !ln.dest.caption) continue;
      const o = roadFrame(zs, _fr), lat = -(ROAD_HALF + 1.7), x = o.x + o.nx * lat, z = zs + o.nz * lat, yaw = o.yaw + Math.PI;
      const g = pointerMesh([ln.dest.caption[0]]);
      g.position.set(x, footY(x, z, yaw, 0.6, 0.05), z); g.rotation.y = yaw;
      seg.group.add(g); seg.signs.push([g, x, z]);
      const [cx, cz] = toW(x, z, yaw, 0.42, 0); seg.cols.push([cx, cz, 0.2]);
      yield;
    }
  }

  // ---- refill the instanced furniture from every loaded segment
  rebuild(px, pz) {
    this.dirty = false;
    const ox = Math.round(px / SEG) * SEG, oz = Math.round(pz / SEG) * SEG, B = this.B;
    this.furn.position.set(ox, 0, oz);
    const segs = [...this.segs.values()].filter(s => s.ready);
    const count = k => segs.reduce((n, s) => n + s[k].length, 0);
    const nl = count('lamps');
    B.lamp.begin(nl); B.bulb.begin(nl); B.pool.begin(nl); B.post.begin(count('posts')); B.fpost.begin(count('fence')); B.rope.begin(count('ropes'));
    const lp = this.lampPos; lp.length = 0;
    const halo = new Float32Array(nl * 3);
    let h = 0;
    for (const s of segs) {
      for (const l of s.lamps) {
        B.lamp.add(l.x - ox, l.y, l.z - oz, l.yaw);
        B.bulb.add(l.bx - ox, l.y + 4.7, l.bz - oz, 0, 1, 0.6, 1);
        // the light pool follows the road's slope so it never sinks into it
        _q.setFromUnitVectors(_up, _n.set(0, 1, -l.grade).normalize());
        _m.compose(_p.set(l.bx - ox, l.py, l.bz - oz), _q, _s.set(1, 1, 1));
        B.pool.addMatrix(_m);
        halo[h++] = l.bx - ox; halo[h++] = l.y + 4.68; halo[h++] = l.bz - oz;
        lp.push(l.v);
      }
      for (const p of s.posts) B.post.add(p[0] - ox, p[1], p[2] - oz, p[3]);
      for (const p of s.fence) B.fpost.add(p[0] - ox, p[1], p[2] - oz, p[3]);
      for (const r of s.ropes) {
        _f.set(r[3] - r[0], r[4] - r[1], r[5] - r[2]);
        _r.crossVectors(_up, _f).normalize();
        _n.crossVectors(_f, _r).normalize();
        _m.makeBasis(_r, _n, _f).setPosition(r[0] - ox, r[1], r[2] - oz);
        B.rope.addMatrix(_m);
      }
    }
    for (const b of Object.values(B)) b.end();
    const hg = this.halos.geometry;
    hg.setAttribute('position', new THREE.BufferAttribute(halo, 3));
    hg.setDrawRange(0, nl);
    // guard rail: one strip (0.55 m to 0.85 m above the road) for all loaded segments
    const nq = count('rails') / 2, pos = new Float32Array(nq * 18), nor = new Float32Array(nq * 18), col = new Float32Array(nq * 18).fill(0.67);
    let v = 0;
    for (const s of segs) for (let i = 0; i < s.rails.length; i += 2) {
      const a = s.rails[i], b = s.rails[i + 1];
      const quad = [[a, 0.55], [b, 0.55], [b, 0.85], [a, 0.55], [b, 0.85], [a, 0.85]];
      for (const [p, hh] of quad) { pos[v] = p[0] - ox; pos[v + 1] = p[1] + hh; pos[v + 2] = p[2] - oz; nor[v] = p[3]; nor[v + 1] = 0; nor[v + 2] = p[4]; v += 3; }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.rail.geometry.dispose();
    this.rail.geometry = rg;
  }
}
