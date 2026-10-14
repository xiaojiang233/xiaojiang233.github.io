import * as THREE from '../lib/three.bundle.js';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const wrap01 = t => t - Math.floor(t);

// Small seeded PRNG (mulberry32) so the island looks the same for everyone.
export function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise in [-1, 1] and a few octaves of it.
const PERM = new Uint8Array(512);
const VAL = new Float32Array(256);
{
  const r = rng(7);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VAL[i] = r() * 2 - 1;
}
const hv = (i, j) => VAL[PERM[PERM[i & 255] + (j & 255)]];
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hv(xi, yi), b = hv(xi + 1, yi), c = hv(xi, yi + 1), d = hv(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f + i * 17.3, y * f - i * 9.1); f *= 2; a *= 0.5; }
  return s;
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function canvasTex(w, h, draw, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// The homepage tints 奶蛙 with CSS filters (hue-rotate, saturate, brightness).
// Same maths here so the 3D residents match their 2D portraits.
export function cssFilter(hex, hue = 0, sat = 1, bright = 1) {
  const c = new THREE.Color(hex);
  let r, g, b;
  { const o = {}; c.getRGB(o, THREE.SRGBColorSpace); r = o.r; g = o.g; b = o.b; }
  if (hue) {
    const a = hue * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    const m = [
      0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928,
      0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283,
      0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072];
    [r, g, b] = [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
  }
  if (sat !== 1) {
    const s = sat, m = [
      0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
      0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
    [r, g, b] = [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
  }
  r = clamp(r * bright, 0, 1); g = clamp(g * bright, 0, 1); b = clamp(b * bright, 0, 1);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

// Merge several primitive geometries into one, baking a flat colour into each
// so a whole prop can be drawn with one vertex-coloured material.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export class Kit {
  constructor() { this.parts = []; }
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    _m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
    geo.applyMatrix4(_m);
    paint(geo, color);
    this.parts.push(geo);
    return this;
  }
  addRaw(geo) { this.parts.push(geo.index ? geo.toNonIndexed() : geo); return this; }
  build() {
    for (const p of this.parts) { for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) p.deleteAttribute(k); if (!p.attributes.uv) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2)); }
    const g = THREE.mergeGeometries(this.parts);
    this.parts = [];
    return g;
  }
}
export function paint(geo, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// Place a cylinder/capsule (built along +Y) between two points.
const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
export function between(obj, a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  obj.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / (len || 1)));
  return len;
}
export function tubeGeo(a, b, r, seg = 8, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, 1, seg, 1);
  const v = new THREE.Vector3().subVectors(b, a);
  const len = v.length();
  g.scale(1, len, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, v.normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
