import * as THREE from '../lib/three.bundle.js';
import { Kit, rng, paint, tubeGeo, noise2, clamp, TAU, lerp, smooth } from './util.js';
import { CHUNK, BAND, LANE_HALF, hash, rowAt, latOf, heightAt, lanesNear, laneDist, deckAt, featuresNear, sandyAt } from './worldgen.js';

// Plants and rocks. The geometry builders are shared with props.js (landmark
// plants); the Flora class streams the scatter around the rider.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const TREE_PALETTES = [[0x2f6b2a, 0x7fb54a], [0x3c7a2e, 0x9cc456], [0x2a5e33, 0x6aa84f], [0x4b7d2b, 0xb4c95a]];
export const BUSH_PALETTES = [[0x2f6b2a, 0x6aa84f], [0x3c7a2e, 0x8cbf4f], [0x4a6e2a, 0x94b64e]];

// ---------------------------------------------------------------- vegetation
function frond(L, W, droop, fold, c0, c1, rows = 10) {
  const pos = [], col = [], idx = [];
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

// lod: the far version (same shape from the same seed, a fraction of the vertices)
export function palmGeo(seed, lod = false) {
  const r = rng(seed), k = new Kit();
  const H = 5.5 + r() * 2.5, segs = lod ? 4 : 10, lean = 0.6 + r() * 1.2;
  const bend = y => V3(lean * (y / H) ** 2, y, 0);
  for (let i = 0; i < segs; i++) {
    const r0 = lerp(0.24, 0.15, i / segs), r1 = lerp(0.24, 0.15, (i + 1) / segs);
    k.addRaw(paint(tubeGeo(bend(i / segs * H), bend((i + 1) / segs * H), r0, lod ? 5 : 7, r1 * 0.9), i % 2 ? 0x8b6a45 : 0xa07f55));
  }
  const top = bend(H);
  const n = 8 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const g = frond(2.4 + r() * 0.8, 0.42, 1.5 + r() * 0.6, 0.35, 0x3f7f2c, 0x86b947, lod ? 4 : 10);
    g.rotateZ(0.25 + r() * 0.3);
    g.rotateY(i / n * TAU + r() * 0.3);
    g.translate(top.x, top.y, top.z);
    k.addRaw(g.toNonIndexed());
  }
  if (!lod) for (let i = 0; i < 3; i++) k.add(new THREE.SphereGeometry(0.14, 8, 6), 0x6b4a22, [top.x + Math.cos(i * 2.1) * 0.18, top.y - 0.18, top.z + Math.sin(i * 2.1) * 0.18]);
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

export function treeGeo(seed, palette, detail = 1) {
  const r = rng(seed), k = new Kit();
  const h = 1.8 + r() * 1.2;
  k.addRaw(paint(tubeGeo(V3(0, -0.3, 0), V3(0, h + 0.6, 0), 0.2, detail ? 7 : 5, 0.12), 0x7a5a3c));
  k.addRaw(paint(tubeGeo(V3(0, h * 0.7, 0), V3(0.7, h + 0.5, 0.2), 0.09, detail ? 5 : 4, 0.05), 0x7a5a3c));
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r(), rad = i === 0 ? 0 : 0.8 + r() * 0.4;
    const b = blob(1.0 + r() * 0.5, detail, seed * 7 + i, palette[0], palette[1], 0.85);
    b.translate(Math.cos(a) * rad, h + 1.0 + r() * 0.8 + (i === 0 ? 0.6 : 0), Math.sin(a) * rad);
    k.addRaw(b);
  }
  return k.build();
}

export function bushGeo(seed, palette, detail = 1) {
  const r = rng(seed), k = new Kit();
  for (let i = 0; i < 3; i++) {
    const b = blob(0.45 + r() * 0.3, detail, seed * 3 + i, palette[0], palette[1], 0.8);
    b.translate((r() - 0.5) * 0.8, 0.3, (r() - 0.5) * 0.8);
    k.addRaw(b);
  }
  return k.build();
}

export function rockGeo(seed, detail = 1) {
  const g = new THREE.DodecahedronGeometry(1, detail), p = g.attributes.position, off = seed * 13.7;
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

export function grassGeo() {
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

export function flowerGeo() {
  const k = new Kit();
  const pet = new THREE.CircleGeometry(0.075, 5); pet.rotateX(-Math.PI / 2);
  const pp = pet.attributes.position;
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i), a = Math.atan2(z, x); const s = 0.75 + 0.25 * Math.cos(a * 5); pp.setXYZ(i, x * s, 0.02 * Math.hypot(x, z) / 0.075, z * s); }
  k.add(pet, 0xffffff, [0, 0.13, 0]);
  k.add(new THREE.SphereGeometry(0.026, 5, 3), 0xffd34d, [0, 0.14, 0]);
  return k.build();
}

// ---------------------------------------------------------------- streamed scatter
// Four layers, each streamed per 64 m chunk with its own reach. A chunk's plants are a pure
// function of its coordinates (seeded from the chunk), so riding back finds the same trees.
// All loaded chunks of a layer are gathered into one InstancedMesh per plant variant (full detail
// + shadows close by, a light LOD further out), anchored near the rider so the instance matrices
// stay small numbers even 50 km out. Plants grow in over the last stretch of their range in the
// vertex shader, so re-gathering never pops.
const LAYERS = [
  // range [desktop, low]; move: re-gather after riding this far; near: full-detail + shadow radius;
  // cell: sample spacing; keep: share left on phones; margin: clearance from roads and landmarks
  { range: [420, 260], move: 40, near: 100, cell: 5, keep: 0.7, margin: 2.5, layer: 0 },   // trees, palms, boulders
  { range: [220, 150], move: 24, near: 70, cell: 4, keep: 0.6, margin: 1.2, layer: 1 },    // bushes, rocks
  { range: [120, 70], move: 14, near: 0, cell: 2.5, keep: 0.5, margin: 0.8, layer: 1 },    // flowers
  { range: [70, 45], move: 9, near: 0, cell: 2, keep: 0.55, margin: 0.5, layer: 1 },       // grass
];
const KINDS = [], K = {};
const kind = (name, L, leaf, geo, lod = null) => { K[name] = KINDS.length; KINDS.push({ L, leaf, geo, lod }); };
for (let i = 0; i < 3; i++) kind('palm' + i, 0, true, () => palmGeo(i + 1), () => palmGeo(i + 1, true));
for (let i = 0; i < 4; i++) kind('tree' + i, 0, false, () => treeGeo(10 + i, TREE_PALETTES[i]), () => treeGeo(10 + i, TREE_PALETTES[i], 0));
for (let i = 0; i < 3; i++) kind('boulder' + i, 0, false, () => rockGeo(i + 1), () => rockGeo(i + 1, 0));
for (let i = 0; i < 3; i++) kind('bush' + i, 1, false, () => bushGeo(30 + i, BUSH_PALETTES[i]), () => bushGeo(30 + i, BUSH_PALETTES[i], 0));
for (let i = 0; i < 3; i++) kind('rock' + i, 1, false, () => rockGeo(4 + i), () => rockGeo(4 + i, 0));
kind('flower', 2, true, flowerGeo);
kind('grass', 3, true, grassGeo);
KINDS[K.flower].colors = true;
const LAYER_KINDS = LAYERS.map((_, li) => KINDS.map((k, i) => (k.L === li ? i : -1)).filter(i => i >= 0));
const FLOWER_COLS = [0xff8fb1, 0xffffff, 0xffd34d, 0xb7a3ff, 0xff6b6b, 0xffb35c].map(c => new THREE.Color(c));
const S = 9;   // per instance: x, y, z, yaw, sx, sy, sz, q (phones keep q < keep), colour index
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// grow-in: scale each instance from nothing over the last 15% of the layer's range
const GROW = `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec4 fw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  transformed *= clamp((uFar - distance(fw.xz, cameraPosition.xz)) / (uFar * 0.15), 0.0, 1.0);
#endif`;
function growMat(leaf, far) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: leaf ? 0.75 : 0.8, side: leaf ? THREE.DoubleSide : THREE.FrontSide });
  m.onBeforeCompile = sh => { sh.uniforms.uFar = far; sh.vertexShader = 'uniform float uFar;\n' + sh.vertexShader.replace('#include <begin_vertex>', GROW); };
  return m;
}

// rowAt per whole metre of z: rows are shared by every chunk in the band, and 0.5 m of z
// changes a row's road position by centimetres
const rows = new Map();
function rowOf(z) {
  const k = Math.round(z);
  let R = rows.get(k);
  if (!R) { if (rows.size > 20000) rows.clear(); rows.set(k, R = rowAt(k)); }
  return R;
}

// What a chunk needs to know about the landmarks around it.
const ctxs = new Map();
function context(cx, cz) {
  const kk = key(cx, cz);
  let c = ctxs.get(kk);
  if (c) return c;
  if (ctxs.size > 3000) ctxs.clear();
  const xc = (cx + 0.5) * CHUNK, zc = (cz + 0.5) * CHUNK;
  c = { keep: [], fields: [], groves: [], rocky: [], villages: [], beaches: [], decks: false, lanes: lanesNear(zc) };
  const near = (x, z, r) => Math.abs(x - xc) < 32 + r && Math.abs(z - zc) < 32 + r;
  const out = (x, z, r) => { if (r > 0 && near(x, z, r + 3)) c.keep.push([x, z, r]); };
  for (const f of featuresNear(xc, zc, 260)) {
    for (const p of f.pads) out(p[0], p[1], p[2] + Math.min(p[4], 2));
    const sp = f.spots || {};
    for (const n in sp) {
      const s = sp[n];
      out(s.x, s.z, f.type === 'windmills' ? (n === 'sign' ? 2.5 : 9) : f.type === 'beach' || f.type === 'rocks' ? 0 : f.type === 'flowers' ? 2.5 : n === 'tree' ? 4.5 : 5);
    }
    if (f.sign) out(f.sign.x, f.sign.z, 2.5);
    if (f.decks && f.decks.length) c.decks = true;
    if (f.type === 'flowers') c.fields.push(f.kind === 'slot' ? { z: f.z } : { x: sp.center.x, z: sp.center.z });
    else if (f.type === 'palms' || f.type === 'start') c.groves.push([f.z, f.type === 'start' ? 40 : 75]);
    else if (f.type === 'rocks') c.rocky.push(f.z);
    else if (f.type === 'beach') c.beaches.push(f.z);
    else if (f.type === 'village') c.villages.push(f.kind === 'slot' ? sp.well : f);
  }
  ctxs.set(kk, c);
  return c;
}
// 0..1 inside a flower field
function fieldAt(c, x, z, lat) {
  let v = 0;
  for (const f of c.fields) {
    if (f.x === undefined) { if (lat < 0) v = Math.max(v, smooth(56, 42, Math.abs(z - f.z)) * smooth(-(BAND + 37), -(BAND + 30), lat)); }
    else v = Math.max(v, smooth(30, 22, Math.hypot(x - f.x, z - f.z)));
  }
  return v;
}
const groveAt = (c, z) => c.groves.reduce((v, [gz, r]) => Math.max(v, smooth(r, r * 0.72, Math.abs(z - gz))), 0);
const rockyAt = (c, z) => c.rocky.reduce((v, rz) => Math.max(v, smooth(52, 36, Math.abs(z - rz))), 0);
const villageAt = (c, x, z) => c.villages.reduce((v, s) => Math.max(v, smooth(100, 45, Math.hypot(x - s.x, z - s.z))), 0);
// the beach slots' umbrellas, towels and sandcastle live on this stretch of sand
const beachBox = (c, z, lat) => lat > BAND + 3 && c.beaches.some(bz => z > bz - 52 && z < bz + 34);
function laneD(c, x, z, lat) {
  if (lat > -(BAND - 3)) return 99;
  let d = 99;
  for (const ln of c.lanes) { const q = laneDist(ln, x, z); if (q && q.d < d) d = q.d; }
  return d;
}
function blocked(c, x, z, lat, ld, m) {
  if (Math.abs(lat) < BAND + 0.5 + m || ld < LANE_HALF + 1 + m * 0.5) return true;
  for (const k of c.keep) { const dx = x - k[0], dz = z - k[1], rr = k[2] + m; if (dx * dx + dz * dz < rr * rr) return true; }
  return c.decks && deckAt(x, z) !== null;
}
// 0 on open meadows, 1 in the woods; hills are woodier
function woodAt(x, z, h, R) {
  const f = noise2(x * 0.0045 + 11, z * 0.0045 - 7) * 0.75 + noise2(x * 0.017 + 3, z * 0.017) * 0.35;
  return smooth(-0.05, 0.45, f + 0.35 * smooth(3, 28, h - R.ry));
}

// ---- per-layer generators: walk a jittered grid over the chunk, cheap tests before heightAt
function genBig(ch, c, r, put) {
  const s = LAYERS[0].cell, n = CHUNK / s, x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK, m = LAYERS[0].margin;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + r()) * s, z = z0 + (j + r()) * s, u = r(), q = r(), a = r() * TAU, v = r(), w = r();
    const R = rowOf(z), lat = latOf(x, R);
    if (lat > R.W + 26) continue;    // open sea
    const ld = laneD(c, x, z, lat);
    if (blocked(c, x, z, lat, ld, m)) continue;
    const h = heightAt(x, z, R), sea = lat > 0, rk = rockyAt(c, z);
    let pPalm = 0, pTree = 0, pRock = 0;
    if (h > 0.4 && lat < R.W + 4 && !(sea && beachBox(c, z, lat))) {   // islands are props.js's
      const grove = groveAt(c, z);
      if (sea) {
        if (lat < R.W - 3) {
          pPalm = R.sand > 0.6 ? 0.06 + 0.3 * grove : 0;
          pTree = R.sand < 0.35 && h > 2.5 ? 0.1 * (1 - rk) : 0;
        }
      } else {
        const road = smooth(-(BAND + 16), -(BAND + 3), lat), fl = fieldAt(c, x, z, lat);
        pPalm = Math.max(0.45 * grove * smooth(-(BAND + 34), -(BAND + 26), lat), R.sand > 0.75 ? 0.12 * road : 0);
        pTree = (0.012 + 0.5 * woodAt(x, z, h, R) + 0.2 * smooth(24, LANE_HALF + 3, ld) + 0.22 * villageAt(c, x, z)) * (1 - 0.45 * road) * (1 - 0.85 * grove) * (1 - fl);
        pTree = Math.min(pTree * (0.35 + 1.1 * smooth(-0.5, 0.5, noise2(x * 0.05 + 2, z * 0.05 - 9))), 0.7);   // clumps and glades
      }
    }
    if (h > -1.8) {
      if (sea && lat > BAND + 2 && lat < R.W + 22) pRock = 0.28 * rk + (R.c > 0.45 && lat < R.W + 8 ? 0.03 : 0);
      else if (!sea && h > R.ry + 18) pRock = 0.012;
    }
    if (u < pPalm) {
      const sc = 0.85 + w * 0.35;
      put(K.palm0 + Math.floor(v * 3), x, h - 0.12, z, a, sc, sc, sc, q, 0, 0.32 * sc);
    } else if (u < pPalm + pTree) {
      const sc = 0.8 + w * 0.6 + 0.25 * smooth(5, 30, h - R.ry), t = Math.floor((noise2(x * 0.01, z * 0.01) * 0.5 + 0.5) * 4 + v * 1.6) % 4;
      put(K.tree0 + t, x, h - 0.25, z, a, sc, sc, sc, q, 0, 0.42 * sc);
    } else if (u < pPalm + pTree + pRock) {
      const sc = rk > 0.3 ? 1.3 + w * 2.1 : 1.4 + w, sx = sc * (0.8 + (v * 7 % 1) * 0.5), sz = sc * (0.8 + (w * 13 % 1) * 0.5);
      put(K.boulder0 + Math.floor(v * 3), x, h - sc * 0.3, z, a, sx, sc, sz, q, 0, 0.4 * (sx + sz));
    }
  }
}
function genMid(ch, c, r, put) {
  const s = LAYERS[1].cell, n = CHUNK / s, x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK, m = LAYERS[1].margin;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + r()) * s, z = z0 + (j + r()) * s, u = r(), q = r(), a = r() * TAU, v = r(), w = r();
    const R = rowOf(z), lat = latOf(x, R);
    if (lat > R.W + 20) continue;
    const ld = laneD(c, x, z, lat);
    if (blocked(c, x, z, lat, ld, m)) continue;
    const h = heightAt(x, z, R), sea = lat > 0, rk = rockyAt(c, z);
    let pBush = 0, pRock = 0;
    if (h > 0.5 && lat < R.W + 4 && !(sea && beachBox(c, z, lat))) {
      if (sea) pBush = R.sand < 0.5 && lat < R.W - 2 && sandyAt(x, z, R, lat, h) < 0.4 ? 0.14 : 0;
      else {
        const wd = woodAt(x, z, h, R);
        pBush = (0.025 + 0.5 * wd * (1 - wd) + 0.08 * wd + 0.12 * smooth(-(BAND + 12), -(BAND + 1.5), lat)) * (1 - 0.8 * fieldAt(c, x, z, lat));
      }
    }
    if (h > -1.2) {
      if (sea && lat > BAND + 1) pRock = (lat < R.W + 16 ? 0.3 * (1 - R.sand) * (h < 2.5 ? 1 : R.c > 0.4 ? 0.5 : 0.1) : 0) + 0.35 * rk;
      else if (!sea) pRock = 0.006 + 0.03 * smooth(R.ry + 8, R.ry + 30, h);
    }
    if (u < pBush) {
      const sc = 0.7 + w * 0.8;
      put(K.bush0 + Math.floor(v * 3), x, h - 0.15, z, a, sc, sc, sc, q, 0, 0);
    } else if (u < pBush + pRock) {
      const sc = 0.4 + w * 1.0, sx = sc * (0.8 + (v * 7 % 1) * 0.5), sz = sc * (0.8 + (w * 13 % 1) * 0.5);
      put(K.rock0 + Math.floor(v * 3), x, h - sc * 0.25, z, a, sx, sc, sz, q, 0, sc >= 1 ? 0.4 * (sx + sz) : 0);
    }
  }
}
function genFlowers(ch, c, r, put) {
  const s = LAYERS[2].cell, n = CHUNK / s, x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK, m = LAYERS[2].margin;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + r()) * s, z = z0 + (j + r()) * s, u = r(), v = r();
    const R = rowOf(z), lat = latOf(x, R);
    if (lat > 0 && (R.sand > 0.4 || lat > R.W - 2)) continue;   // sea side: only on rocky verges
    const fl = lat < 0 ? fieldAt(c, x, z, lat) : 0;
    const p = 0.9 * fl + 0.02 + 0.05 * smooth(-(BAND + 22), -(BAND + 1), lat) + (noise2(x * 0.05 + 5, z * 0.05) > 0.5 ? 0.1 : 0);
    if (u > p) continue;
    if (blocked(c, x, z, lat, laneD(c, x, z, lat), m)) continue;
    const h = heightAt(x, z, R);
    if (h < 0.6 || (lat > 0 && sandyAt(x, z, R, lat, h) > 0.3)) continue;
    const cnt = fl > 0.3 ? 3 + Math.floor(v * 4) : 1 + Math.floor(v * 3);
    const pc = Math.floor((noise2(x * 0.08, z * 0.08) * 0.5 + 0.5) * FLOWER_COLS.length * 1.4) % FLOWER_COLS.length;
    for (let t = 0; t < cnt; t++) {
      const sc = 0.8 + r() * 0.6;
      put(K.flower, x + (r() - 0.5) * 1.2, h - 0.03, z + (r() - 0.5) * 1.2, r() * TAU, sc, sc, sc, r(), (pc + (r() < 0.15 ? 1 : 0)) % FLOWER_COLS.length, 0);
    }
  }
}
function genGrass(ch, c, r, put) {
  const s = LAYERS[3].cell, n = CHUNK / s, x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK, m = LAYERS[3].margin;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + (i + r()) * s, z = z0 + (j + r()) * s, u = r(), v = r();
    const R = rowOf(z), lat = latOf(x, R);
    if (lat > R.W + 4 || (lat > 0 && R.sand > 0.6)) continue;
    const p = 0.35 + 0.45 * noise2(x * 0.11 + 7, z * 0.11 - 3) + (lat < 0 && lat > -(BAND + 8) ? 0.25 : 0);
    if (u > p) continue;
    if (blocked(c, x, z, lat, laneD(c, x, z, lat), m)) continue;
    const h = heightAt(x, z, R);
    if (h < 0.6 || (lat > 0 && sandyAt(x, z, R, lat, h) > 0.35)) continue;
    for (let t = 0, cnt = 1 + Math.floor(v * 3); t < cnt; t++) {
      const sc = 0.7 + r() * 0.8;
      put(K.grass, x + (r() - 0.5) * 0.9, h - 0.04, z + (r() - 0.5) * 0.9, r() * TAU, sc, sc, sc, r(), 0, 0);
    }
  }
}
const GEN = [genBig, genMid, genFlowers, genGrass];

// distance from (x, z) to chunk (cx, cz)
function chunkDist(cx, cz, x, z) {
  const dx = Math.max(cx * CHUNK - x, 0, x - (cx + 1) * CHUNK), dz = Math.max(cz * CHUNK - z, 0, z - (cz + 1) * CHUNK);
  return Math.hypot(dx, dz);
}

export class Flora {
  constructor(scene, { low = false } = {}) {
    this.scene = scene;
    this.root = new THREE.Group(); this.root.name = 'flora';
    scene.add(this.root);
    this.far = LAYERS.map(() => ({ value: 0 }));
    this.mats = this.far.map(f => ({ prop: growMat(false, f), leaf: growMat(true, f) }));
    this.chunks = LAYERS.map(() => new Map());
    this.geos = KINDS.map(() => [null, null]);
    this.meshes = KINDS.map(() => [null, null]);   // [full detail (near, shadows), LOD (far)]
    this.anchor = LAYERS.map(() => null);           // where each layer was last gathered
    this.dirty = LAYERS.map(() => false);
    this.gathered = LAYERS.map(() => -1e9);
    this.left = LAYERS.map(() => 0);                // queued chunks per layer
    this.cost = LAYERS.map(() => 1);                // running ms per chunk, to plan the budget
    this.queue = []; this.qi = 0; this.plannedAt = null;
    this.px = 0; this.pz = 0; this.time = 0;
    this.setQuality(low);
  }

  setQuality(low) {
    this.low = low;
    LAYERS.forEach((L, i) => { this.far[i].value = L.range[low ? 1 : 0]; this.anchor[i] = null; });
    this.plannedAt = null;   // re-plan (and re-gather) lazily on the next update
  }
  range(li) { return LAYERS[li].range[this.low ? 1 : 0]; }
  reach(li) { return this.range(li) + LAYERS[li].move + 8; }

  // queue the missing chunks (nearest first, relative to each layer's reach), drop far ones
  plan(px, pz) {
    this.plannedAt = [px, pz];
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK), jobs = [];
    LAYERS.forEach((L, li) => {
      const G = this.reach(li), n = Math.ceil(G / CHUNK) + 1, map = this.chunks[li];
      for (const [k, c] of map) if (chunkDist(c.cx, c.cz, px, pz) > G + CHUNK) { map.delete(k); this.dirty[li] = true; }
      this.left[li] = 0;
      for (let cx = pcx - n; cx <= pcx + n; cx++) for (let cz = pcz - n; cz <= pcz + n; cz++) {
        const d = chunkDist(cx, cz, px, pz);
        if (d > G || map.has(key(cx, cz))) continue;
        jobs.push({ li, cx, cz, o: d / G });
        this.left[li]++;
      }
    });
    this.queue = jobs.sort((a, b) => a.o - b.o); this.qi = 0;
  }

  gen(li, cx, cz) {
    const map = this.chunks[li], k = key(cx, cz);
    if (map.has(k)) return;
    const ch = { cx, cz, inst: [], cols: [] };
    const put = (kd, x, y, z, yaw, sx, sy, sz, q, col, cr) => {
      (ch.inst[kd] ||= []).push(x, y, z, yaw, sx, sy, sz, q, col);
      if (cr) ch.cols.push([x, z, cr, q]);
    };
    GEN[li](ch, context(cx, cz), rng(Math.floor(hash(cx, cz, 101 + li) * 4294967296)), put);
    map.set(k, ch);
    // chunks out past the visible range can wait for the next regular re-gather
    if (chunkDist(cx, cz, this.px, this.pz) < this.range(li)) this.dirty[li] = true;
  }

  mesh(kd, f, n) {
    let m = this.meshes[kd][f];
    if (m && m.instanceMatrix.count >= n) return m;
    if (!m && !n) return null;
    const K_ = KINDS[kd], L = LAYERS[K_.L], cap = Math.max(16, Math.ceil(n * 1.4));
    if (m) { this.root.remove(m); m.dispose(); }
    const g = this.geos[kd][f] ||= f ? K_.lod() : K_.geo();
    m = new THREE.InstancedMesh(g, K_.leaf ? this.mats[K_.L].leaf : this.mats[K_.L].prop, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (K_.colors) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.frustumCulled = false;     // they surround the rider; the grow-in shader hides the far edge
    m.layers.set(L.layer);
    m.castShadow = !f && L.near > 0; m.receiveShadow = true;
    m.count = 0;
    this.root.add(m);
    return (this.meshes[kd][f] = m);
  }

  // gather every loaded chunk of a layer into its instanced meshes, relative to a new anchor
  gather(li) {
    const L = LAYERS[li], ax = Math.round(this.px), az = Math.round(this.pz);
    this.anchor[li] = [ax, az]; this.dirty[li] = false; this.gathered[li] = this.time;
    const RR = (this.range(li) + L.move) ** 2, NN = L.near * L.near, kp = this.low ? L.keep : 1;
    const kinds = LAYER_KINDS[li], cnt = kinds.map(() => [0, 0]), chunks = [...this.chunks[li].values()];
    // pass 1: count (so each mesh is sized once), pass 2: write the matrices
    for (const ch of chunks) kinds.forEach((kd, ki) => {
      const a = ch.inst[kd]; if (!a) return;
      const lod = KINDS[kd].lod ? 1 : 0;
      for (let i = 0; i < a.length; i += S) {
        const dx = a[i] - ax, dz = a[i + 2] - az, d2 = dx * dx + dz * dz;
        if (d2 < RR && a[i + 7] < kp) cnt[ki][lod && d2 > NN ? 1 : 0]++;
      }
    });
    kinds.forEach((kd, ki) => {
      for (let f = 0; f < 2; f++) {
        const n = cnt[ki][f], m = this.mesh(kd, f, n);
        if (!m) continue;
        m.count = n; m.visible = n > 0; m.position.set(ax, 0, az);
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        cnt[ki][f] = 0;   // reused as the write cursor
      }
    });
    for (const ch of chunks) kinds.forEach((kd, ki) => {
      const a = ch.inst[kd]; if (!a) return;
      const lod = KINDS[kd].lod ? 1 : 0, ms = this.meshes[kd];
      for (let i = 0; i < a.length; i += S) {
        const dx = a[i] - ax, dz = a[i + 2] - az, d2 = dx * dx + dz * dz;
        if (d2 >= RR || a[i + 7] >= kp) continue;
        const f = lod && d2 > NN ? 1 : 0, m = ms[f], j = cnt[ki][f]++, e = m.instanceMatrix.array, o = j * 16;
        const c = Math.cos(a[i + 3]), s = Math.sin(a[i + 3]), sx = a[i + 4], sy = a[i + 5], sz = a[i + 6];
        e[o] = c * sx; e[o + 1] = 0; e[o + 2] = -s * sx; e[o + 3] = 0;
        e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = s * sz; e[o + 9] = 0; e[o + 10] = c * sz; e[o + 11] = 0;
        e[o + 12] = dx; e[o + 13] = a[i + 1]; e[o + 14] = dz; e[o + 15] = 1;
        if (m.instanceColor) { const col = FLOWER_COLS[a[i + 8]], ca = m.instanceColor.array; ca[j * 3] = col.r; ca[j * 3 + 1] = col.g; ca[j * 3 + 2] = col.b; }
      }
    });
  }

  prime(x, z) {
    this.px = x; this.pz = z;
    KINDS.forEach((k, i) => { const g = this.geos[i]; g[0] ||= k.geo(); if (k.lod) g[1] ||= k.lod(); });   // not mid-ride
    this.plan(x, z);
    for (const j of this.queue) this.gen(j.li, j.cx, j.cz);
    this.queue = []; this.left.fill(0);
    LAYERS.forEach((_, li) => this.gather(li));
  }

  update(px, pz, dt = 0) {
    const t0 = performance.now(), budget = this.low ? 2.5 : 3;
    this.px = px; this.pz = pz; this.time += dt;
    const pa = this.plannedAt;
    if (!pa || Math.hypot(px - pa[0], pz - pa[1]) > 12) this.plan(px, pz);
    // re-gather at most one layer per frame: the one furthest past its move threshold, or one with
    // new chunks (straight away once its queue is done, else at most twice a second)
    let best = -1, bs = 0;
    LAYERS.forEach((L, i) => {
      const a = this.anchor[i];
      let s = a ? Math.hypot(px - a[0], pz - a[1]) / L.move : 9;
      if (s < 1 && this.dirty[i] && (!this.left[i] || this.time - this.gathered[i] > 0.5)) s = 1;
      if (s >= 1 && s > bs) { best = i; bs = s; }
    });
    if (best >= 0) this.gather(best);
    while (this.qi < this.queue.length) {
      const j = this.queue[this.qi], el = performance.now() - t0;
      if (el > 0.3 && el + this.cost[j.li] > budget) break;
      this.qi++; this.left[j.li]--;
      const t1 = performance.now();
      this.gen(j.li, j.cx, j.cz);
      this.cost[j.li] = lerp(this.cost[j.li], performance.now() - t1, 0.3);
    }
  }

  // trunks and big rocks within r of (x, z): pushes [x, z, radius, …] (shared arrays, don't modify)
  collidersNear(x, z, r, out = []) {
    for (let li = 0; li < 2; li++) {
      const map = this.chunks[li], kp = this.low ? LAYERS[li].keep : 1;
      for (let cx = Math.floor((x - r - 4) / CHUNK); cx <= Math.floor((x + r + 4) / CHUNK); cx++) {
        for (let cz = Math.floor((z - r - 4) / CHUNK); cz <= Math.floor((z + r + 4) / CHUNK); cz++) {
          const ch = map.get(key(cx, cz));
          if (!ch) continue;
          for (const c of ch.cols) {
            const dx = c[0] - x, dz = c[1] - z, rr = r + c[2];
            if (c[3] < kp && dx * dx + dz * dz < rr * rr) out.push(c);
          }
        }
      }
    }
    return out;
  }

  stats() {
    let inst = 0, draws = 0;
    for (const p of this.meshes) for (const m of p) if (m && m.visible) { draws++; inst += m.count; }
    return { chunks: this.chunks.map(m => m.size), pending: this.queue.length - this.qi, draws, inst };
  }
}
