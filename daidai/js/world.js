import * as THREE from '../lib/three.bundle.js';
import { TAU, clamp, lerp, smooth, fbm, noise2, wrap01, canvasTex, rng } from './util.js';

// The island is a loop road around a hilly island. Everything is laid out in
// (t, d): t ∈ [0, 1) is how far around the loop, d is metres from the road
// centre line, positive towards the sea.
export const ROAD_HALF = 3.5;
export const BAND = 6.2;

function cyc(keys) {
  const n = keys.length;
  return t => {
    t = wrap01(t);
    if (t < keys[0][0]) t += 1;
    for (let i = 0; i < n; i++) {
      const t0 = keys[i][0], t1 = i + 1 < n ? keys[i + 1][0] : keys[0][0] + 1;
      if (t >= t0 && t < t1) {
        const u = (t - t0) / (t1 - t0), s = u * u * (3 - 2 * u);
        return keys[i][1] + (keys[(i + 1) % n][1] - keys[i][1]) * s;
      }
    }
    return keys[0][1];
  };
}

// Where things are around the loop.
export const SPOT = {
  start: 0.0, beach: 0.125, pier: 0.25, windmills: 0.355, lighthouse: 0.5,
  viewpoint: 0.605, rocks: 0.715, flowers: 0.75, statue: 0.83, palms: 0.915, bus: 0.975,
};

export const roadR = t => 182 + 14 * Math.sin(TAU * 2 * t + 0.6) + 8 * Math.sin(TAU * 3 * t + 2.0) + 4 * Math.sin(TAU * 5 * t + 1.0);
export const roadY = cyc([[0, 1.8], [0.07, 1.6], [0.2, 1.7], [0.27, 2.0], [0.33, 3.2], [0.42, 10.5], [0.5, 12.5], [0.57, 11.2], [0.65, 5.5], [0.72, 3.0], [0.8, 3.4], [0.86, 4.4], [0.94, 2.2]]);
const shore = cyc([[0, 24], [0.06, 30], [0.13, 38], [0.2, 32], [0.25, 22], [0.3, 15], [0.38, 10], [0.45, 9], [0.5, 25], [0.55, 9], [0.605, 18], [0.65, 10], [0.715, 14], [0.8, 14], [0.87, 26], [0.93, 32]]);
export const sandF = cyc([[0, 0.6], [0.05, 1], [0.21, 1], [0.27, 0.85], [0.31, 0], [0.84, 0], [0.88, 1], [0.97, 1]]);
const plateau = cyc([[0, 1], [0.25, 0.4], [0.44, 1], [0.5, 18], [0.56, 1], [0.605, 11], [0.645, 1]]);
const hill = cyc([[0, 10], [0.1, 14], [0.25, 18], [0.355, 30], [0.5, 26], [0.62, 22], [0.75, 14], [0.83, 26], [0.92, 14]]);
const flat = cyc([[0, 18], [0.035, 3], [0.6, 3], [0.75, 8], [0.83, 3], [0.94, 3], [0.975, 12]]);

export function tOf(x, z) { return wrap01(-Math.atan2(z, x) / TAU); }

export function profile(t, d, x, z) {
  const y = roadY(t) - 0.25;
  if (d >= 0) {
    const x0 = d - BAND;
    if (x0 <= 0) return y;
    const sd = sandF(t), pl = plateau(t);
    const W = Math.max(3, shore(t) - BAND);
    const top = lerp(0.3, 1.0, sd);
    let base = x0 < W ? top * Math.pow(1 - x0 / W, 0.85) : -(x0 - W) * lerp(0.55, 0.1, sd);
    base = Math.max(base, -9);
    if (x0 < W) base += sd * 0.18 * noise2(x * 0.18, z * 0.18) * smooth(0, 5, x0) * (1 - smooth(W - 5, W, x0));
    const embW = 1.2 + Math.max(0, y - top) * lerp(0.22, 1.3, sd);
    const k = smooth(pl, pl + embW, x0);
    const rough = (1 - sd) * (1.6 * noise2(x * 0.25, z * 0.25) + 0.6 * noise2(x * 0.9, z * 0.9)) * k * (1 - k) * 3.2;
    return lerp(y, base, k) + rough;
  }
  const x0 = -d - BAND;
  if (x0 <= 0) return y;
  const xx = Math.max(0, x0 - flat(t));
  const H = hill(t);
  const rise = H * Math.pow(smooth(0, 75, xx), 1.15);
  const n = fbm(x * 0.011, z * 0.011, 4) * (3 + H * 0.4) + fbm(x * 0.05, z * 0.05, 2) * 1.3;
  return y + rise + n * smooth(0, 16, xx);
}

export function heightAt(x, z) {
  const t = tOf(x, z);
  return profile(t, Math.hypot(x, z) - roadR(t), x, z);
}

// ---------------------------------------------------------------- road path
export class Path {
  constructor(N = 3000) {
    this.N = N;
    const P = this.P = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = i / N, th = -TAU * t, R = roadR(t);
      P[i * 3] = R * Math.cos(th); P[i * 3 + 1] = roadY(t); P[i * 3 + 2] = R * Math.sin(th);
    }
    const S = this.S = new Float32Array(N + 1);
    const T = this.T = new Float32Array(N * 3), Nr = this.Nr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, h = (i + N - 1) % N;
      S[i + 1] = S[i] + Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]);
      let tx = P[j * 3] - P[h * 3], tz = P[j * 3 + 2] - P[h * 3 + 2];
      const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      T[i * 3] = tx; T[i * 3 + 2] = tz;
      // seaward normal
      let nx = -tz, nz = tx;
      if (nx * P[i * 3] + nz * P[i * 3 + 2] < 0) { nx = -nx; nz = -nz; }
      Nr[i * 3] = nx; Nr[i * 3 + 2] = nz;
    }
    this.length = S[N];
  }
  // Interpolated frame at arc length s (metres). Writes into `o`.
  at(s, o = {}) {
    const L = this.length, S = this.S, N = this.N;
    s = ((s % L) + L) % L;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const i = lo, j = (i + 1) % N, f = (s - S[i]) / (S[i + 1] - S[i]);
    const P = this.P, T = this.T, Nr = this.Nr;
    o.x = lerp(P[i * 3], P[j * 3], f); o.y = lerp(P[i * 3 + 1], P[j * 3 + 1], f); o.z = lerp(P[i * 3 + 2], P[j * 3 + 2], f);
    let tx = lerp(T[i * 3], T[j * 3], f), tz = lerp(T[i * 3 + 2], T[j * 3 + 2], f);
    const l = Math.hypot(tx, tz); o.tx = tx / l; o.tz = tz / l;
    o.nx = lerp(Nr[i * 3], Nr[j * 3], f); o.nz = lerp(Nr[i * 3 + 2], Nr[j * 3 + 2], f);
    const l2 = Math.hypot(o.nx, o.nz); o.nx /= l2; o.nz /= l2;
    o.t = (i + f) / N;
    o.s = s;
    return o;
  }
  sOf(t) { const f = wrap01(t) * this.N, i = Math.floor(f); return lerp(this.S[i], this.S[i + 1], f - i); }
  // World position for loop position t and lateral offset `lat` (seaward +).
  place(t, lat, onGround = true) {
    const o = this.at(this.sOf(t));
    const x = o.x + o.nx * lat, z = o.z + o.nz * lat;
    const y = onGround ? heightAt(x, z) : o.y;
    // yaw that faces along the road (+z local → travel direction)
    return { x, y, z, yaw: Math.atan2(o.tx, o.tz), o };
  }
}

// ---------------------------------------------------------------- terrain
const C = h => new THREE.Color(h);
const COL = {
  sand: C(0xf0dba8), wetSand: C(0xc8ad7c), seabed: C(0xa89068),
  grassA: C(0x6fae3f), grassB: C(0x9cc456), grassC: C(0x4f8f37),
  verge: C(0x86b04a), rock: C(0x8f877c), rockDark: C(0x6b655e), plaza: C(0xd9cdb8), dirt: C(0xb59c72),
};

export function buildTerrain(M = 800) {
  const dList = [];
  for (let d = -46; d < -12; d += 2.5) dList.push(d);
  for (let d = -12; d < 14; d += 1) dList.push(d);
  for (let d = 14; d < 50; d += 2) dList.push(d);
  for (let d = 50; d <= 186; d += 8) dList.push(d);
  const inner = 16, K = inner + dList.length;
  const pos = new Float32Array(M * K * 3), uv = new Float32Array(M * K * 2);
  const meta = new Float32Array(M * K * 2); // t, d per vertex for colouring
  for (let i = 0; i < M; i++) {
    const t = i / M, th = -TAU * t, R = roadR(t), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < K; k++) {
      let r;
      if (k < inner) r = Math.pow(k / inner, 0.8) * (R + dList[0]);
      else r = R + dList[k - inner];
      const d = r - R, x = r * c, z = r * s, v = i * K + k;
      pos[v * 3] = x; pos[v * 3 + 1] = profile(t, d, x, z); pos[v * 3 + 2] = z;
      uv[v * 2] = x / 5; uv[v * 2 + 1] = z / 5;
      meta[v * 2] = t; meta[v * 2 + 1] = d;
    }
  }
  const idx = [];
  for (let i = 0; i < M; i++) {
    const i2 = (i + 1) % M;
    for (let k = 0; k < K - 1; k++) {
      const a = i * K + k, b = i2 * K + k;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the surface faces up
  if (g.attributes.normal.getY(inner * 2 + 3) < 0) {
    for (let q = 0; q < idx.length; q += 3) { const tmp = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = tmp; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  const nrm = g.attributes.normal.array;
  const col = new Float32Array(M * K * 3), tmp = new THREE.Color();
  for (let v = 0; v < M * K; v++) {
    const t = meta[v * 2], d = meta[v * 2 + 1];
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const slope = 1 - nrm[v * 3 + 1];
    const n1 = noise2(x * 0.08, z * 0.08), n2 = noise2(x * 0.5, z * 0.5);
    if (d > 0 && y < 2.2 && sandF(t) > 0.05 && d > BAND - 0.5) {
      tmp.copy(COL.sand).lerp(COL.wetSand, smooth(0.5, 0.0, y));
      if (y < -0.1) tmp.copy(COL.wetSand).lerp(COL.seabed, smooth(-0.1, -1.5, y));
      tmp.lerp(COL.grassB, (1 - sandF(t)) * 0.8);
    } else if (y < -0.3) {
      tmp.copy(COL.seabed);
    } else {
      tmp.copy(COL.grassA).lerp(COL.grassB, clamp(n1 * 0.8 + 0.45, 0, 1)).lerp(COL.grassC, clamp(-n2 * 0.6, 0, 0.5));
      if (Math.abs(d) < BAND + 0.3) tmp.lerp(COL.verge, 0.6);
      if (d < -BAND && -d - BAND < flat(t) - 1 && flat(t) > 6) tmp.copy(COL.plaza);
      if (y < 0.6 && d > 0) tmp.lerp(COL.wetSand, 0.7);
    }
    const rk = smooth(0.32, 0.55, slope + n2 * 0.05);
    if (rk > 0) tmp.lerp(n1 > 0 ? COL.rock : COL.rockDark, rk);
    tmp.multiplyScalar(0.94 + n2 * 0.06);
    col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h), r = rng(3);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      const v = 0.8 + 0.2 * (0.5 + 0.5 * noise2(x / 6, y / 6)) * (0.7 + 0.3 * r());
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, { repeat: true });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- road + curbs
export function buildRoad(path) {
  const N = path.N, P = path.P, Nr = path.Nr, S = path.S;
  const tex = canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#55565c'; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 9000; i++) { const v = 70 + r() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.35})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    // patches
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(40,40,46,${0.08 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 50, 30 + r() * 90, r() * 3, 0, 7); g.fill(); }
    g.fillStyle = '#f2efe6';
    g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
    g.fillStyle = '#f5c842';
    for (let y = 0; y < h; y += 256) { g.fillRect(w / 2 - 4, y + 32, 8, 128); }
  }, { repeat: true, aniso: 16 });
  const pos = [], uv = [], nrm = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N;
    const x = P[k * 3], y = P[k * 3 + 1] + 0.02, z = P[k * 3 + 2], nx = Nr[k * 3], nz = Nr[k * 3 + 2];
    pos.push(x - nx * ROAD_HALF, y, z - nz * ROAD_HALF, x + nx * ROAD_HALF, y, z + nz * ROAD_HALF);
    nrm.push(0, 1, 0, 0, 1, 0);
    const v = S[i] / 12;
    uv.push(0, v, 1, v);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  const road = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 }));
  road.receiveShadow = true;

  // Curbs: a raised strip on each side with a little outer face down to the grass.
  const cp = [], ci = [], cc = [];
  const curbW = 0.35, curbH = 0.14;
  for (const side of [-1, 1]) {
    const base = cp.length / 3;
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2], nx = Nr[k * 3] * side, nz = Nr[k * 3 + 2] * side;
      const a = ROAD_HALF, b = ROAD_HALF + curbW;
      cp.push(x + nx * a, y, z + nz * a, x + nx * a, y + curbH, z + nz * a, x + nx * b, y + curbH, z + nz * b, x + nx * b, y - 0.35, z + nz * b);
      const stripe = Math.floor(S[i] / 2) % 2 === 0;
      const c1 = stripe && side > 0 ? [0.86, 0.36, 0.3] : [0.86, 0.85, 0.82];
      for (let q = 0; q < 4; q++) cc.push(...c1);
      if (i < N) {
        const o = base + i * 4, o2 = o + 4;
        for (let q = 0; q < 3; q++) ci.push(o + q, o2 + q, o + q + 1, o + q + 1, o2 + q, o2 + q + 1);
      }
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
  cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
  cg.setIndex(ci);
  cg.computeVertexNormals();
  const curbs = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
  curbs.receiveShadow = true;
  return { road, curbs };
}

function fixWinding(g) {
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const idx = g.index.array;
    for (let q = 0; q < idx.length; q += 3) { const t = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = t; }
    g.index.needsUpdate = true;
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
}

// ---------------------------------------------------------------- shoreline foam
export function buildFoam(M = 900) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= M; i++) {
    const t = (i % M) / M, th = -TAU * t, R = roadR(t), c = Math.cos(th), s = Math.sin(th);
    let d = BAND, prev = profile(t, d, R * c, R * s);
    for (; d < 220; d += 0.25) {
      const h = profile(t, d, (R + d) * c, (R + d) * s);
      if (h < 0) { d -= 0.25 * h / (h - prev + 1e-6); break; }
      prev = h;
    }
    const a = R + d - 1.0, b = R + d + 5.5;
    pos.push(a * c, 0.06, a * s, b * c, 0.06, b * s);
    uv.push(0, i / M * 260, 1, i / M * 260);
    if (i < M) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float time; uniform vec3 tint;
      float h(float n){ return fract(sin(n)*43758.5453); }
      float n1(float x){ float i=floor(x), f=fract(x); return mix(h(i), h(i+1.0), f*f*(3.0-2.0*f)); }
      void main(){
        float a = vUv.x;                       // 0 at the sand, 1 out at sea
        float along = vUv.y;
        float wob = n1(along*0.35 + time*0.2)*0.25 + n1(along*1.7 - time*0.3)*0.08;
        float wave = fract(time*0.11 + a*0.0);
        float run = 0.12 + 0.18*(0.5+0.5*sin(time*0.7 + along*0.05));   // swash line breathing in and out
        float edge = smoothstep(run+0.06, run, a + wob*0.3) * smoothstep(0.0, 0.05, a);
        float bands = smoothstep(0.75, 1.0, sin((a*16.0 - time*1.6) + wob*8.0)) * (1.0 - smoothstep(0.15, 0.9, a));
        float f = max(edge*0.85, bands*0.55);
        f *= 0.75 + 0.25*n1(along*3.0 + a*20.0);
        gl_FragColor = vec4(tint, f);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 2;
  return mesh;
}

// ---------------------------------------------------------------- water normals
export function waterNormals() {
  const S = 256, r = rng(21), waves = [];
  for (let i = 0; i < 28; i++) {
    const a = r() * TAU, f = 1 + Math.floor(r() * 9);
    waves.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), r() * TAU, 1 / (0.6 + f)]);
  }
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const [fx, fy, ph, amp] of waves) h += amp * Math.sin(TAU * (fx * x + fy * y) / S + ph);
    H[y * S + x] = h;
  }
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)];
      const dy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
      let nx = -dx * 2.2, nz = -dy * 2.2, ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * S + x) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (nz * 0.5 + 0.5) * 255; img.data[o + 2] = (ny * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
}
