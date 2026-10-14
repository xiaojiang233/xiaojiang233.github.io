import * as THREE from '../lib/three.bundle.js';
import { clamp, lerp, smooth, noise2, canvasTex, rng } from './util.js';
import { CHUNK, ROAD_HALF, BAND, LANE_HALF, heightAt, rowAt, latOf, roadFrame, roadX, roadY, plazaAt, lanesNear, laneDist, sandyAt } from './worldgen.js';

// The ground of the endless coast, streamed around the rider. Finest wins:
//   near  64 m chunks: 1 m vertices next to you, 2 m further out (phones 2 m / 4 m), plus a
//         corridor of road chunks along the coast so the road ribbon always lies on fine ground;
//   F1    one 8 m-step mesh (±640 m), F2 one 32 m-step mesh (±1.7 km) for headlands and hills.
// A tiny wrapping mask texture (one texel per chunk) says which near chunks are on screen:
// far meshes discard their fragments there, the road and lane ribbons discard everywhere else.
// Where a visible chunk borders far ground its edge vertices are bent onto the far mesh's
// straight edge, so the two surfaces meet exactly: no cracks, never two grounds at once.
// Skirts cover the T-junctions between near chunks of different detail. Everything is built a
// few rows at a time inside a per-frame time budget.

const QUALITY = {
  hi: { fine: 1, mid: 2, ring: 3, rows: 5, road: 360, budget: 4, far: [{ step: 8, half: 640, move: 160 }, { step: 32, half: 1728, move: 480 }] },
  lo: { fine: 2, mid: 4, ring: 2, rows: 4, road: 260, budget: 3, far: [{ step: 16, half: 576, move: 160 }, { step: 32, half: 960, move: 320 }] },
};
const SKIRT = 3;               // near chunk skirts (m)
const UV = 12 / CHUNK;         // detail texture repeats 12× per chunk, so it tiles across chunks
const MASK = 64;               // chunk mask texels per side (wraps around)
const CURB_W = 0.35, CURB_H = 0.1;
const ROAD_TEX = 12, LANE_TEX = 13.6;  // metres per texture repeat
const NONE = 1000;             // "no lane here" in the far meshes' lane distance attribute
const APRON = 5000;            // F2's edge continues flat this far, so inland the horizon is land, not sea
const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// job priorities: missing ground first, then the road, finer detail, lanes, far meshes, tidying
const P = { missing: 0, road: 1000, finer: 2000, lane: 3000, far: 4000, idle: 5000 };
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// ---------------------------------------------------------------- colours (the old island's palette)
const lin = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const COL = {
  sand: lin(0xf0dba8), wetSand: lin(0xc8ad7c), seabed: lin(0xa89068),
  grassA: lin(0x6fae3f), grassB: lin(0x9cc456), grassC: lin(0x4f8f37),
  verge: lin(0x86b04a), rock: lin(0x8f877c), rockDark: lin(0x6b655e), plaza: lin(0xd9cdb8), dirt: lin(0xb59c72),
  asphalt: lin(0x55565c),
};
const CURB_RED = [0.86, 0.36, 0.3], CURB_WHITE = [0.86, 0.85, 0.82];
const _c = [0, 0, 0], _s = [0, 0, 0];
const put = (c, k) => { c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; };
const mix = (c, k, t) => { if (t > 0) { c[0] += (k[0] - c[0]) * t; c[1] += (k[1] - c[1]) * t; c[2] += (k[2] - c[2]) * t; } };
function sandCol(c, y) {
  put(c, COL.sand); mix(c, COL.wetSand, smooth(0.5, 0.0, y));
  if (y < -0.1) { put(c, COL.wetSand); mix(c, COL.seabed, smooth(-0.1, -1.5, y)); }
}

// Ported from the old buildTerrain (same rules), plus island beaches, paved pads, lanes and a
// darker asphalt band. `far` skips what the far shader draws itself (road and lanes).
function colourAt(x, z, y, slope, R, lanes, far, out, o) {
  const c = _c, lat = latOf(x, R), al = Math.abs(lat), sd = R.sand;
  const n1 = noise2(x * 0.08, z * 0.08), n2 = noise2(x * 0.5, z * 0.5);
  if (lat > BAND - 0.5 && y < 2.2 && sd > 0.05) {
    sandCol(c, y);
    mix(c, COL.grassB, (1 - sd) * 0.8);
  } else if (y < -0.3) put(c, COL.seabed);
  else {
    put(c, COL.grassA); mix(c, COL.grassB, clamp(n1 * 0.8 + 0.45, 0, 1)); mix(c, COL.grassC, clamp(-n2 * 0.6, 0, 0.5));
    if (al < BAND + 0.3) mix(c, COL.verge, 0.6);
    if (y < 0.6) mix(c, COL.wetSand, lat > 0 ? 0.7 : 0.7 * smooth(0.6, 0.2, y));   // sea and lake shores
  }
  if (lat > R.W - 14 && y < 1.0) { const s = sandyAt(x, z, R, lat, y); if (s > 0) { sandCol(_s, y); mix(c, _s, s); } }
  if (lat > -32 && lat < 30) mix(c, COL.plaza, plazaAt(x, z));
  if (!far) {
    if (lat < -(BAND - 3)) {
      for (let i = 0; i < lanes.length; i++) {
        const q = laneDist(lanes[i], x, z);
        if (q && q.d < LANE_HALF + 1.1) mix(c, COL.dirt, 0.9 * smooth(LANE_HALF + 1.1, LANE_HALF - 0.2, q.d));
      }
    }
    if (al < ROAD_HALF + 0.5) mix(c, COL.asphalt, 0.85 * smooth(ROAD_HALF + 0.5, ROAD_HALF, al));
  }
  const rk = smooth(0.32, 0.55, slope + n2 * 0.05);
  if (rk > 0) mix(c, n1 > 0 ? COL.rock : COL.rockDark, rk);
  const b = 0.94 + n2 * 0.06;
  out[o] = c[0] * b; out[o + 1] = c[1] * b; out[o + 2] = c[2] * b;
}

// heightAt, except it never rises through the asphalt: a landmark pad next to a climbing road
// can sit a few cm above it.
function groundY(x, z, R) {
  const h = heightAt(x, z, R), lat = latOf(x, R);
  return lat < ROAD_HALF + 0.6 && lat > -(ROAD_HALF + 0.6) ? Math.min(h, R.ry - 0.03) : h;
}

// Signed distance across the nearest lane, for the far meshes (NONE when not close to one).
function laneSd(lanes, x, z, lim) {
  let best = NONE;
  for (let i = 0; i < lanes.length; i++) {
    const ln = lanes[i], u = ln.rx0 - x;
    if (u < ROAD_HALF || u > ln.L + LANE_HALF) continue;
    const m = ln.zAt(u + 0.5) - ln.zAt(u - 0.5), sd = (z - ln.zAt(u)) / Math.sqrt(1 + m * m);
    if (Math.abs(sd) < lim && Math.abs(sd) < Math.abs(best)) best = sd;
  }
  return best;
}

// ---------------------------------------------------------------- grids
// Vertex k (0..n) along side s (0: z = 0, 1: x = n, 2: z = n, 3: x = 0) of an (n+1)² grid.
function edgeIdx(s, k, n) {
  const N = n + 1;
  return s === 0 ? k : s === 1 ? k * N + n : s === 2 ? n * N + k : k * N;
}
// Triangles for the grid plus a skirt along each side. Skirts face both ways: outwards they
// fill pixel cracks against a coarser neighbour, inwards they fill them at the outer edge of a
// level, where the coarser ground beyond is a different mesh (seen from above, either face
// sits below the ground's own edge, so it is never in view otherwise). Vertex layout: the
// (n+1)² grid, then 4·(n+1) skirt bottoms, then 4·(n+1) skirt tops (copies of the edge
// vertices, so every skirt vertex can carry the skirt flag in its uv). one: outward faces only.
function gridIndex(n, one = false) {
  const N = n + 1, base = N * N, top = base + 4 * N, nv = base + 8 * N;
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(n * n * 6 + 4 * n * (one ? 6 : 12));
  let w = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[w++] = a; idx[w++] = c; idx[w++] = b; idx[w++] = b; idx[w++] = c; idx[w++] = d;
  }
  for (let s = 0; s < 4; s++) for (let k = 0; k < n; k++) {
    const p0 = top + s * N + k, p1 = p0 + 1, q0 = base + s * N + k, q1 = q0 + 1;
    const out = s < 2;
    idx[w++] = p0; idx[w++] = out ? p1 : q0; idx[w++] = out ? q0 : p1; idx[w++] = q0; idx[w++] = out ? p1 : q1; idx[w++] = out ? q1 : p1;
    if (one) continue;
    idx[w++] = p0; idx[w++] = out ? q0 : p1; idx[w++] = out ? p1 : q0; idx[w++] = q0; idx[w++] = out ? q1 : p1; idx[w++] = out ? p1 : q1;
  }
  return idx;
}
// Skirt vertices (bottoms and tops) start as copies of their edge vertex.
function skirtCopy(a, size, n) {
  const N = n + 1, base = N * N;
  for (let s = 0; s < 4; s++) for (let k = 0; k < N; k++) {
    const e = edgeIdx(s, k, n) * size, v = (base + s * N + k) * size, t = v + 4 * N * size;
    for (let q = 0; q < size; q++) a[v + q] = a[t + q] = a[e + q];
  }
}
// Skirts are marked by a whole-number shift of u (the tiling textures don't change), so a
// planar reflection, whose camera sits below the sea and sees into the hills through the
// clipped-off sea floor, can skip them.
const SKIRT_UV = 1024;
function markSkirt(uv, n) {
  const N = n + 1;
  for (let v = N * N; v < N * N + 8 * N; v++) uv[v * 2] += SKIRT_UV;
}

// ---------------------------------------------------------------- shaders
// Which chunk a fragment is in (positions are local to a chunk-aligned origin, uOrg in chunks)
// and whether a near chunk is drawn there.
const MASK_GLSL = `
uniform sampler2D tMask;
uniform vec2 uOrg;
varying vec2 vLocal;
bool nearChunk(vec2 p) {
  ivec2 c = (ivec2(floor(p / ${CHUNK}.0)) + ivec2(uOrg)) & ${MASK - 1};
  return texelFetch(tMask, c, 0).r > 0.5;
}`;
const FAR_GLSL = `
varying vec2 vRoad;
uniform vec4 uRect;
uniform float uSize;
uniform vec3 uAsphalt;
uniform vec3 uDirt;
// Far ground steps aside only a little inside finer ground, so rounding along the shared border
// never leaves a pinhole of sky (the overlap is a sub-pixel sliver where both meet anyway).
const float EDGE = 0.15;
bool inRect(vec2 p) { return p.x > uRect.x + EDGE && p.x < uRect.z - EDGE && p.y > uRect.y + EDGE && p.y < uRect.w - EDGE; }
bool overNear(vec2 p) {
  return p.x > EDGE && p.y > EDGE && p.x < uSize - EDGE && p.y < uSize - EDGE && nearChunk(p - vec2(EDGE))
    && nearChunk(p + vec2(EDGE)) && nearChunk(p + vec2(EDGE, -EDGE)) && nearChunk(p + vec2(-EDGE, EDGE));
}
// box-filtered coverage of the band |x| < a, so thin roads fade instead of sparkling
float band(float x, float w, float a) { w = max(w, 1e-3); return clamp((min(x + 0.5 * w, a) - max(x - 0.5 * w, -a)) / w, 0.0, 1.0); }`;
const FAR_TINT = `
diffuseColor.rgb = mix(diffuseColor.rgb, uDirt, 0.88 * band(vRoad.y, roadW.y, ${LANE_HALF.toFixed(2)}));
diffuseColor.rgb = mix(diffuseColor.rgb, uAsphalt, 0.92 * band(vRoad.x, roadW.x, ${ROAD_HALF.toFixed(2)}));`;

// Distant ground sits in thick fog; fading it into the sky colour behind it (read from the
// environment map the sky renders) instead of one flat fog colour keeps far hills from showing
// up as a pale wall on the horizon. Near things keep the plain fog, like everything else.
const FOG_GLSL = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fogC = fogColor;
  #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
    vec3 skyDir = normalize( vSkyDir );
    skyDir.y = max( skyDir.y, 0.07 );   // a little above the horizon haze, so hills read as hills
    vec3 skyC = textureCubeUV( envMap, envMapRotation * normalize( skyDir ), 0.12 ).rgb;
    // the env map holds raw sky radiance, but fog is mixed after tone mapping: map it the way the sky dome is drawn
    #ifdef TONE_MAPPING
      skyC = toneMapping( skyC );
    #endif
    skyC = linearToOutputTexel( vec4( skyC, 1.0 ) ).rgb;
    fogC = mix( fogColor, skyC, uSkyFog * smoothstep( 250.0, 1100.0, vFogDepth ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;

// mode: 'near' (sky fog only), 'ribbon' (drawn only over near chunks), 'far' (never over them)
function hook(m, u, mode) {
  const far = mode === 'far', mask = mode !== 'near', ground = mode !== 'ribbon';
  m.userData.u = u;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkyDir;' + (mask ? '\nvarying vec2 vLocal;' : '') + (far ? '\nattribute vec2 aRoad;\nvarying vec2 vRoad;' : '') + (ground ? '\nvarying float vSkirt;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + (mask ? '\nvLocal = position.xz;' : '') + (far ? '\nvRoad = aRoad;' : '') + (ground ? `\nvSkirt = uv.x > ${SKIRT_UV - 24}.0 ? 1.0 : 0.0;` : ''))
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSkyDir = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;');
    const skip = ground ? '\nif (vSkirt > 0.5 && cameraPosition.y < 0.0) discard;' : '';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSkyFog;\nvarying vec3 vSkyDir;' + (ground ? '\nvarying float vSkirt;' : '') + (mask ? MASK_GLSL : '') + (far ? FAR_GLSL : ''))
      .replace('void main() {', 'void main() {' + (far ? '\nvec2 roadW = fwidth(vRoad);' : '') + skip + (far ? '\nif (inRect(vLocal) || overNear(vLocal)) discard;' : mask ? '\nif (!nearChunk(vLocal)) discard;' : ''))
      .replace('#include <color_fragment>', '#include <color_fragment>' + (far ? FAR_TINT : ''))
      .replace('#include <fog_fragment>', FOG_GLSL);
  };
  m.customProgramCacheKey = () => 'terrain-' + mode;
  return m;
}

// ---------------------------------------------------------------- textures
// periodic value noise on a w×h tile (cross-faded copies), so tiled textures have no seams
function tileNoise(x, y, w, h, s) {
  const u = x / w, v = y / h;
  return lerp(lerp(noise2(x / s, y / s), noise2((x - w) / s, y / s), u), lerp(noise2(x / s, (y - h) / s), noise2((x - w) / s, (y - h) / s), u), v);
}
function detailTex() {
  return canvasTex(256, 256, (c, w, h) => {
    const img = c.createImageData(w, h), r = rng(3);
    for (let i = 0; i < w * h; i++) {
      const x = i % w, y = (i / w) | 0;
      const v = 0.8 + 0.2 * (0.5 + 0.5 * tileNoise(x, y, w, h, 6)) * (0.7 + 0.3 * r());
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v * 255; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, { repeat: true });
}
function roadTex() {
  return canvasTex(256, 1024, (g, w, h) => {
    g.fillStyle = '#55565c'; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 9000; i++) { const v = 70 + r() * 60 | 0; g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + r() * 0.35})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    // patches (drawn wrapped so the 12 m repeat has no seam)
    for (let i = 0; i < 6; i++) {
      g.fillStyle = `rgba(40,40,46,${0.08 + r() * 0.08})`;
      const x = r() * w, y = r() * h, a = 20 + r() * 50, b = 30 + r() * 90, t = r() * 3;
      for (const dy of [-h, 0, h]) { g.beginPath(); g.ellipse(x, y + dy, a, b, t, 0, 7); g.fill(); }
    }
    g.fillStyle = '#f2efe6';
    g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
    g.fillStyle = '#f5c842';
    for (let y = 0; y < h; y += 256) { g.fillRect(w / 2 - 4, y + 32, 8, 128); }
  }, { repeat: true, aniso: 16 });
}
// Packed dirt with two wheel ruts, a grassy middle strip, pebbles and ragged grassy edges.
function dirtTex() {
  return canvasTex(128, 512, (g, w, h) => {
    const img = g.createImageData(w, h), r = rng(17), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = (x + 0.5) / w, n = tileNoise(x, y, w, h, 7), n2 = tileNoise(x + 40, y, w, h, 2.5);
      let k = 1 + n * 0.1 + n2 * 0.06 + (r() - 0.5) * 0.09;
      const rut = Math.max(smooth(0.1, 0.03, Math.abs(a - 0.29)), smooth(0.1, 0.03, Math.abs(a - 0.71)));
      k *= 1 - 0.09 * rut + 0.025 * rut * Math.sin(y * 0.9);
      const mid = smooth(0.09 + 0.04 * n, 0.02, Math.abs(a - 0.5)) * smooth(-0.35, 0.25, tileNoise(x, y, w, h, 16));
      const e = Math.min(a, 1 - a) + 0.04 * tileNoise(x + 90, y, w, h, 3) + 0.015 * (r() - 0.5);
      const o = (y * w + x) * 4;
      d[o] = lerp(188 * k, 128 + 30 * n2, mid * 0.75); d[o + 1] = lerp(163 * k, 160 + 24 * n2, mid * 0.75); d[o + 2] = lerp(122 * k, 74, mid * 0.75);
      d[o + 3] = 255 * smooth(0.0, 0.12, e);
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 320; i++) {
      const x = (0.16 + 0.68 * r()) * w, y = r() * h, s = 0.7 + r() * 1.6, light = r() < 0.55;
      g.fillStyle = light ? `rgba(236,224,200,${0.6 + r() * 0.3})` : `rgba(118,98,74,${0.5 + r() * 0.3})`;
      for (const dy of [-h, 0, h]) { g.beginPath(); g.ellipse(x, y + dy, s, s * (0.7 + r() * 0.3), r() * 3, 0, 7); g.fill(); }
    }
  }, { repeat: true, aniso: 8 });
}

// ---------------------------------------------------------------- the streamer
export class Terrain {
  constructor(scene, { low = false, renderer = null } = {}) {
    this.scene = scene; this.renderer = renderer;
    this.root = new THREE.Group(); this.root.name = 'terrain';
    scene.add(this.root);
    this.low = low; this.q = low ? QUALITY.lo : QUALITY.hi;
    this.chunks = new Map();      // key → { cx, cz, step, want, r, geo, mesh, vis }
    this.pool = {}; this.grids = {};
    this.segs = new Map();        // road segments by chunk row
    this.lanes = new Map();       // lane ribbons by lane k
    this.far = [null, null];      // F1, F2
    this.jobs = new Map(); this.queue = [];
    this.memo = new Map();
    this.px = 0; this.pz = 0; this.pcx = null; this.pcz = null;
    this.dirty = false; this.roadDirty = false; this.replan = true; this.deadline = Infinity;
    this._want = [0, 0, 0, 0];

    this.detail = detailTex(); this.roadTex = roadTex(); this.dirtTex = dirtTex();
    this.mask = new Uint8Array(MASK * MASK);
    this.maskTex = new THREE.DataTexture(this.mask, MASK, MASK, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.needsUpdate = true;
    this.skyFog = { value: 1 };
    this.mat = hook(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detail, roughness: 0.95, metalness: 0 }), { uSkyFog: this.skyFog }, 'near');
    this.scratch = [];             // height buffers for chunk jobs
    this.farIdx = {}; this.farBufs = [[], []];
    // materials are kept and reused: disposing one could drop the shared shader program and
    // make the next far mesh or lane recompile it mid-ride
    this.farMats = [this.farMat(), this.farMat()];
    this.laneMats = [];
    this.roadCap = 0;
    // the coast road and its curbs: all loaded segments merged into one mesh each
    this.road = new THREE.Mesh(new THREE.BufferGeometry(), this.ribbonMat('road'));
    this.curbs = new THREE.Mesh(new THREE.BufferGeometry(), this.ribbonMat('curb'));
    for (const m of [this.road, this.curbs]) { m.receiveShadow = true; m.matrixAutoUpdate = false; m.visible = false; this.root.add(m); }
  }

  ribbonMat(kind) {
    const u = { tMask: { value: this.maskTex }, uOrg: { value: new THREE.Vector2() }, uSkyFog: this.skyFog };
    const m = kind === 'road' ? new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
      : kind === 'curb' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 })
        : new THREE.MeshStandardMaterial({ map: this.dirtTex, roughness: 0.96, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    return hook(m, u, 'ribbon');
  }
  farMat() {
    const u = {
      tMask: { value: this.maskTex }, uOrg: { value: new THREE.Vector2() }, uRect: { value: new THREE.Vector4(0, 0, -1, -1) }, uSize: { value: 0 },
      uAsphalt: { value: new THREE.Color(0x5d5e64) }, uDirt: { value: new THREE.Color(0xb39a70) }, uSkyFog: this.skyFog,
    };
    return hook(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detail, roughness: 0.95, metalness: 0 }), u, 'far');
  }

  setQuality(low) {
    if (low === this.low) return;
    this.low = low; this.q = low ? QUALITY.lo : QUALITY.hi;
    this.memo.clear(); this.replan = true;
  }

  // ------------------------------------------------------------ per frame
  prime(x, z) {
    this.px = x; this.pz = z; this.pcx = Math.floor(x / CHUNK); this.pcz = Math.floor(z / CHUNK);
    for (let pass = 0; pass < 3 && (pass === 0 || this.replan); pass++) {
      this.replan = false;
      this.plan();
      this.work(Infinity);
    }
    this.refresh();
    this.mergeRoad();
  }

  update(px, pz, dt) {
    const t0 = performance.now();
    this.px = px; this.pz = pz;
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    if (cx !== this.pcx || cz !== this.pcz || this.replan) { this.pcx = cx; this.pcz = cz; this.replan = false; this.plan(); }
    if (this.dirty) this.refresh();
    if (this.roadDirty) this.mergeRoad();
    this.work(Math.max(0.5, this.q.budget - (performance.now() - t0)));
    // fade far ground into the sky by day; at night the fog colour already matches the dome
    const f = this.scene.fog;
    if (f) this.skyFog.value = smooth(0.12, 0.35, 0.3 * f.color.r + 0.55 * f.color.g + 0.15 * f.color.b);
  }

  // the near region (chunks, road, lanes, far ground) around the last position is complete
  ready() {
    if (this.replan || this.pcx === null) return false;
    for (const j of this.queue) if (j.prio < P.far) return false;
    return true;
  }

  stats() {
    let chunks = 0, triangles = 0, draws = 0;
    for (const ch of this.chunks.values()) if (ch.vis) { chunks++; draws++; triangles += this.grid(ch.step).tris; }
    for (const F of this.far) if (F) { draws++; triangles += F.tris; }
    for (const m of [this.road, this.curbs]) if (m.visible && m.geometry.index) { draws++; triangles += m.geometry.drawRange.count / 3; }
    for (const L of this.lanes.values()) if (L.mesh) { draws++; triangles += L.mesh.geometry.index.count / 3; }
    return { chunks, triangles, pending: this.queue.length, draws };
  }

  late() { return performance.now() >= this.deadline; }

  work(ms) {
    this.deadline = performance.now() + ms;
    const Q = this.queue;
    while (Q.length) {
      const j = Q[0];
      if (!j.gen) j.gen = j.make(j);
      if (j.gen.next().done) { Q.shift(); this.jobs.delete(j.id); }
      if (this.late()) break;
    }
  }

  // ------------------------------------------------------------ what should exist
  roadCols(cz) {
    const k = 'r' + cz;
    let v = this.memo.get(k);
    if (!v) {
      let lo = Infinity, hi = -Infinity;
      for (let z = cz * CHUNK; z <= cz * CHUNK + CHUNK; z += 8) {
        const R = rowAt(z), w = (BAND + 2) / R.cs;
        lo = Math.min(lo, R.rx - w); hi = Math.max(hi, R.rx + w);
      }
      v = [Math.floor(lo / CHUNK), Math.floor(hi / CHUNK)];
      this.remember(k, v);
    }
    return v;
  }
  roadChunk(cx, cz) { const [a, b] = this.roadCols(cz); return cx >= a && cx <= b; }
  laneChunk(cx, cz) {
    const k = 'l' + cx + ',' + cz;
    let v = this.memo.get(k);
    if (v === undefined) {
      v = false;
      const x0 = cx * CHUNK, z0 = cz * CHUNK;
      for (const ln of lanesNear(z0 + CHUNK / 2)) {
        if (ln.rx0 - ln.L - 4 > x0 + CHUNK || ln.rx0 < x0 || Math.abs(ln.z0 - z0 - CHUNK / 2) > ln.A + CHUNK) continue;
        for (let x = x0; x <= x0 + CHUNK && !v; x += 4) {
          const u = clamp(ln.rx0 - x, 0, ln.L), zc = ln.zAt(u);
          if (zc > z0 - 6 && zc < z0 + CHUNK + 6) v = true;
        }
      }
      this.remember(k, v);
    }
    return v;
  }
  remember(k, v) { if (this.memo.size > 6000) this.memo.clear(); this.memo.set(k, v); }

  plan() {
    const q = this.q, R = q.ring, pcx = this.pcx, pcz = this.pcz;
    for (const ch of this.chunks.values()) { ch.want = 0; ch.r = Math.max(Math.abs(ch.cx - pcx), Math.abs(ch.cz - pcz)); }
    const want = (cx, cz, step) => {
      const k = key(cx, cz);
      let ch = this.chunks.get(k);
      if (!ch) {
        ch = { key: k, cx, cz, step: 0, want: 0, r: Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)), geo: null, mesh: null, vis: false };
        this.chunks.set(k, ch);
      }
      ch.want = ch.want ? Math.min(ch.want, step) : step;
    };
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      let s = Math.max(Math.abs(dx), Math.abs(dz)) <= 1 ? q.fine : q.mid;
      if (s > 2 && (this.roadChunk(cx, cz) || this.laneChunk(cx, cz))) s = 2;   // ribbons need ≤ 2 m ground
      want(cx, cz, s);
    }
    // the coast road a little further ahead and behind, on fine ground
    const segW = new Set();
    for (let dz = -q.rows; dz <= q.rows; dz++) {
      const cz = pcz + dz, zc = cz * CHUNK + CHUNK / 2;
      if (Math.hypot(roadX(zc) - this.px, zc - this.pz) > q.road) continue;
      segW.add(cz);
      const [a, b] = this.roadCols(cz);
      for (let cx = a; cx <= b; cx++) want(cx, cz, 2);
    }
    for (const ch of this.chunks.values()) if (!ch.want && ch.r > R + 1) this.release(ch);
    for (const cz of segW) if (!this.segs.has(cz)) this.segs.set(cz, { cz, ready: false });
    for (const [cz, sg] of this.segs) if (!segW.has(cz) && Math.abs(cz - pcz) > q.rows + 1) { this.segs.delete(cz); if (sg.ready) this.roadDirty = true; }
    // lanes crossing the near region
    const x0 = (pcx - R - 1) * CHUNK, x1 = (pcx + R + 2) * CHUNK, z0 = (pcz - R - 1) * CHUNK, z1 = (pcz + R + 2) * CHUNK;
    const laneW = new Set();
    for (const ln of lanesNear(this.pz)) {
      if (ln.rx0 - ln.L - 4 > x1 || ln.rx0 < x0 || ln.z0 - ln.A - 4 > z1 || ln.z0 + ln.A + 4 < z0) continue;
      laneW.add(ln.k);
      if (!this.lanes.has(ln.k)) this.lanes.set(ln.k, { ln, mesh: null });
    }
    for (const [k, L] of this.lanes) {
      if (laneW.has(k)) continue;
      if (L.mesh) { this.root.remove(L.mesh); L.mesh.geometry.dispose(); this.laneMats.push(L.mesh.material); }
      this.lanes.delete(k);
    }

    // jobs
    for (const j of this.jobs.values()) j.live = false;
    const Q = [];
    const add = (id, prio, make, extra) => {
      let j = this.jobs.get(id);
      if (!j) { j = { id, prio, make, gen: null, geo: null, ...extra }; this.jobs.set(id, j); }
      j.prio = prio; j.live = true; Q.push(j);
    };
    for (const ch of this.chunks.values()) {
      if (!ch.want) continue;
      const d = ch.r * 10 + (ch.r <= R ? 0 : 5);
      const cls = !ch.geo ? P.missing : ch.step > ch.want ? P.finer : ch.step < ch.want && ch.r > 1 ? P.idle : -1;
      if (cls < 0) continue;
      // a chunk with no ground yet keeps building at whatever detail it started with
      const id = !ch.geo && ch.jobId && this.jobs.has(ch.jobId) ? ch.jobId : 'c' + ch.key + '/' + ch.want;
      ch.jobId = id;
      add(id, cls + d, j => this.chunkJob(ch, j.step, j), { step: ch.want });
    }
    for (const sg of this.segs.values()) if (!sg.ready) add('s' + sg.cz, P.road + Math.abs(sg.cz - pcz) * 10, () => this.segJob(sg));
    for (const L of this.lanes.values()) if (!L.mesh) add('l' + L.ln.k, P.lane + Math.abs(L.ln.z0 - this.pz) / 10, () => this.laneJob(L));
    for (let lvl = 0; lvl < 2; lvl++) {
      const spec = q.far[lvl], F = this.far[lvl];
      const off = F ? Math.max(Math.abs(this.px - F.cx), Math.abs(this.pz - F.cz)) : Infinity;
      if (F && F.step === spec.step && F.half === spec.half && off <= spec.move) continue;
      const id = 'f' + lvl, cur = this.jobs.get(id);
      const cx = CHUNK * Math.round(this.px / CHUNK), cz = CHUNK * Math.round(this.pz / CHUNK);
      const sp = cur && cur.spec.step === spec.step && cur.spec.half === spec.half ? cur.spec : { lvl, step: spec.step, half: spec.half, move: spec.move, cx, cz };
      if (cur && cur.spec !== sp) this.jobs.delete(id);
      const prio = !F ? P.missing - 10 + lvl : off > spec.half * 0.5 ? P.road - 5 : P.far + lvl;
      add(id, prio, () => this.farJob(sp), { spec: sp, lvl });
    }
    for (const j of this.jobs.values()) if (!j.live) { if (j.geo) this.giveGeo(j.geo); if (j.H) this.scratch.push(j.H); this.jobs.delete(j.id); }
    Q.sort((a, b) => a.prio - b.prio);
    this.queue = Q;
    this.dirty = true;
  }

  release(ch) {
    if (ch.geo) this.giveGeo(ch.geo);
    if (ch.mesh) this.root.remove(ch.mesh);
    ch.geo = ch.mesh = null; ch.dead = true; ch.vis = false;
    this.chunks.delete(ch.key);
  }
  disposeMesh(m) {
    if (!m) return;
    this.root.remove(m); m.geometry.dispose(); m.material.dispose();
  }

  // ------------------------------------------------------------ near chunks
  grid(step) {
    let g = this.grids[step];
    if (g) return g;
    const n = CHUNK / step, N = n + 1, nv = N * N + 8 * N, uv = new Float32Array(nv * 2);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const v = (j * N + i) * 2; uv[v] = i * step * UV; uv[v + 1] = j * step * UV; }
    skirtCopy(uv, 2, n); markSkirt(uv, n);
    g = this.grids[step] = { n, N, nv, tris: 2 * n * n, index: new THREE.BufferAttribute(gridIndex(n), 1), uv: new THREE.BufferAttribute(uv, 2) };
    return g;
  }
  takeGeo(step) {
    const p = this.pool[step] || (this.pool[step] = []);
    if (p.length) return p.pop();
    const g = this.grid(step), geo = new THREE.BufferGeometry();
    geo.setIndex(g.index); geo.setAttribute('uv', g.uv);
    for (const a of ['position', 'normal', 'color']) geo.setAttribute(a, new THREE.BufferAttribute(new Float32Array(g.nv * 3), 3));
    geo.boundingSphere = new THREE.Sphere();
    geo.userData = { step, edge: new Float32Array(4 * g.N), morph: [0, 0, 0, 0] };
    return geo;
  }
  giveGeo(geo) { this.pool[geo.userData.step].push(geo); }

  *chunkJob(ch, step, job) {
    const g = this.grid(step), { n, N } = g, B = step === 1 ? 2 : 1, W = N + 2 * B;
    const x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK;
    // heights with a border, so normals (and slope colours) match across chunks; the normal
    // baseline is ±2 m for both 1 m and 2 m chunks, so neighbouring detail levels shade alike
    const H = job.H = this.scratch.pop() || new Float64Array(69 * 69), rows = new Array(N);
    for (let j = 0; j < W; j++) {
      const z = z0 + (j - B) * step, R = rowAt(z), o = j * W;
      if (j >= B && j - B < N) rows[j - B] = R;
      for (let i = 0; i < W; i++) H[o + i] = groundY(x0 + (i - B) * step, z, R);
      if (this.late()) yield;
    }
    const geo = job.geo = this.takeGeo(step);
    const Pa = geo.attributes.position.array, Na = geo.attributes.normal.array, Ca = geo.attributes.color.array;
    const lanes = lanesNear(z0 + CHUNK / 2), k2 = 1 / (2 * B * step);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < N; j++) {
      const R = rows[j], z = z0 + j * step;
      for (let i = 0; i < N; i++) {
        const c = (j + B) * W + i + B, y = H[c];
        const gx = (H[c + B] - H[c - B]) * k2, gz = (H[c + B * W] - H[c - B * W]) * k2;
        const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz), v = (j * N + i) * 3;
        Pa[v] = i * step; Pa[v + 1] = y; Pa[v + 2] = j * step;
        Na[v] = -gx * il; Na[v + 1] = il; Na[v + 2] = -gz * il;
        colourAt(x0 + i * step, z, y, 1 - il, R, lanes, false, Ca, v);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
      if (this.late()) yield;
    }
    const E = geo.userData.edge;
    for (let s = 0; s < 4; s++) for (let k = 0; k < N; k++) E[s * N + k] = Pa[edgeIdx(s, k, n) * 3 + 1];
    skirtCopy(Pa, 3, n); skirtCopy(Na, 3, n); skirtCopy(Ca, 3, n);
    for (let v = N * N; v < N * N + 4 * N; v++) Pa[v * 3 + 1] -= SKIRT;
    this.scratch.push(H); job.H = null;
    geo.userData.morph.fill(0);
    geo.attributes.position.needsUpdate = geo.attributes.normal.needsUpdate = geo.attributes.color.needsUpdate = true;
    geo.boundingSphere.center.set(CHUNK / 2, (lo + hi - SKIRT) / 2, CHUNK / 2);
    geo.boundingSphere.radius = Math.hypot(CHUNK * Math.SQRT1_2, (hi - lo + SKIRT) / 2) + 0.5;
    job.geo = null;
    if (ch.dead) { this.giveGeo(geo); return; }
    if (ch.geo) this.giveGeo(ch.geo);
    ch.geo = geo; ch.step = step;
    if (ch.vis) this.morphChunk(ch);   // replacing ground on screen: bend its edges right away
    if (!ch.mesh) {
      const m = ch.mesh = new THREE.Mesh(geo, this.mat);
      m.position.set(x0, 0, z0); m.matrixAutoUpdate = false; m.updateMatrix();
      m.receiveShadow = true; m.visible = false;
      this.root.add(m);
    } else ch.mesh.geometry = geo;
    this.dirty = true;
  }

  // Bend a chunk's edges onto the straight edges of the far mesh next to them (0 = no bend).
  morph(ch, want) {
    const geo = ch.geo, u = geo.userData, n = CHUNK / u.step, N = n + 1, Pa = geo.attributes.position.array, E = u.edge;
    let changed = false;
    for (let s = 0; s < 4; s++) {
      if (u.morph[s] === want[s]) continue;
      u.morph[s] = want[s]; changed = true;
      const m = want[s] ? want[s] / u.step : 1;
      for (let k = 0; k < N; k++) {
        const k0 = k - k % m, t = (k - k0) / m;
        const y = t ? lerp(E[s * N + k0], E[s * N + k0 + m], t) : E[s * N + k];
        Pa[edgeIdx(s, k, n) * 3 + 1] = Pa[(N * N + 4 * N + s * N + k) * 3 + 1] = y;
        Pa[(N * N + s * N + k) * 3 + 1] = y - SKIRT;
      }
    }
    if (changed) geo.attributes.position.needsUpdate = true;
  }

  farStepAt(cx, cz) {
    for (const F of this.far) {
      if (F && cx * CHUNK >= F.x0 && (cx + 1) * CHUNK <= F.x1 && cz * CHUNK >= F.z0 && (cz + 1) * CHUNK <= F.z1) return F.step;
    }
    return 0;
  }

  // Which chunks are drawn, the mask the far meshes and ribbons read, and the edge bends.
  refresh() {
    this.dirty = false;
    const M = this.mask;
    M.fill(0);
    for (const ch of this.chunks.values()) {
      ch.vis = !!ch.geo && ch.want > 0;
      if (ch.mesh) { ch.mesh.visible = ch.vis; ch.mesh.castShadow = ch.r <= 1; }
      if (ch.vis) M[(ch.cz & (MASK - 1)) * MASK + (ch.cx & (MASK - 1))] = 255;
    }
    this.maskTex.needsUpdate = true;
    for (const ch of this.chunks.values()) if (ch.vis) this.morphChunk(ch);
  }
  morphChunk(ch) {
    const w = this._want;
    for (let s = 0; s < 4; s++) {
      const nx = ch.cx + SIDES[s][0], nz = ch.cz + SIDES[s][1], nb = this.chunks.get(key(nx, nz));
      w[s] = nb && nb.vis ? 0 : this.farStepAt(nx, nz);
    }
    this.morph(ch, w);
  }

  // ------------------------------------------------------------ far ground
  *farJob(spec) {
    const S = spec.step, n = 2 * spec.half / S, N = n + 1, W = N + 2, nv = N * N + 8 * N;
    const x0 = spec.cx - spec.half, z0 = spec.cz - spec.half;
    const H = new Float64Array(W * W), rows = new Array(N);
    for (let j = 0; j < W; j++) {
      const z = z0 + (j - 1) * S, R = rowAt(z), o = j * W;
      if (j >= 1 && j <= N) rows[j - 1] = R;
      for (let i = 0; i < W; i++) H[o + i] = groundY(x0 + (i - 1) * S, z, R);
      if (this.late()) yield;
    }
    // reuse the arrays of the far mesh before last (same size), else allocate
    const bufs = this.farBufs[spec.lvl], old = bufs.length && bufs[0].P.length === nv * 3 ? bufs.shift() : null;
    const Pa = old ? old.P : new Float32Array(nv * 3), Na = old ? old.N : new Float32Array(nv * 3), Ca = old ? old.C : new Float32Array(nv * 3);
    const Ra = old ? old.R : new Float32Array(nv * 2), Ua = old ? old.U : new Float32Array(nv * 2);
    const k2 = 1 / (2 * S), lim = S * 1.5 + 4;
    for (let j = 0; j < N; j++) {
      const R = rows[j], z = z0 + j * S, lanes = lanesNear(z);
      for (let i = 0; i < N; i++) {
        const c = (j + 1) * W + i + 1, y = H[c], x = x0 + i * S, v = j * N + i;
        const gx = (H[c + 1] - H[c - 1]) * k2, gz = (H[c + W] - H[c - W]) * k2;
        const il = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
        Pa[v * 3] = i * S; Pa[v * 3 + 1] = y; Pa[v * 3 + 2] = j * S;
        Na[v * 3] = -gx * il; Na[v * 3 + 1] = il; Na[v * 3 + 2] = -gz * il;
        colourAt(x, z, y, 1 - il, R, lanes, true, Ca, v * 3);
        Ra[v * 2] = clamp(latOf(x, R), -60, 60); Ra[v * 2 + 1] = laneSd(lanes, x, z, lim);
        Ua[v * 2] = i * S * UV; Ua[v * 2 + 1] = j * S * UV;
      }
      if (this.late()) yield;
    }
    // F1's outer edge follows F2's straight edges, like the near chunks do onto F1
    if (spec.lvl === 0) {
      const m = this.q.far[1].step / S, E = new Float32Array(N);
      for (let s = 0; s < 4; s++) {
        for (let k = 0; k < N; k++) E[k] = Pa[edgeIdx(s, k, n) * 3 + 1];
        for (let k = 0; k < N; k++) { const k0 = k - k % m; if (k0 !== k) Pa[edgeIdx(s, k, n) * 3 + 1] = lerp(E[k0], E[Math.min(n, k0 + m)], (k - k0) / m); }
      }
    }
    skirtCopy(Pa, 3, n); skirtCopy(Na, 3, n); skirtCopy(Ca, 3, n); skirtCopy(Ra, 2, n); skirtCopy(Ua, 2, n);
    let lo = Infinity, hi = -Infinity;
    for (let v = 0; v < N * N; v++) { const y = Pa[v * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
    if (spec.lvl === 1) {
      // lay F2's skirt flat and far out (corners pulled diagonally so the four strips meet)
      for (let s = 0; s < 4; s++) for (let k = 0; k < N; k++) {
        const v = N * N + s * N + k, ox = SIDES[s][0], oz = SIDES[s][1], t = k === 0 ? -1 : k === n ? 1 : 0;
        Pa[v * 3] += (ox + t * Math.abs(oz)) * APRON; Pa[v * 3 + 2] += (oz + t * Math.abs(ox)) * APRON;
        Na[v * 3] = 0; Na[v * 3 + 1] = 1; Na[v * 3 + 2] = 0;
        Ra[v * 2] = 60; Ra[v * 2 + 1] = NONE;
      }
    } else for (let v = N * N; v < N * N + 4 * N; v++) Pa[v * 3 + 1] -= S * 2;
    if (spec.lvl === 0) markSkirt(Ua, n);   // F2's flat apron is real ground, not a skirt
    if (this.late()) yield;
    const ik = n * 2 + spec.lvl, idx = this.farIdx[ik] || (this.farIdx[ik] = gridIndex(n, spec.lvl === 1));   // F2's apron faces up only
    if (this.late()) yield;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(Pa, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(Na, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(Ca, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(Ua, 2));
    geo.setAttribute('aRoad', new THREE.BufferAttribute(Ra, 2));
    const rad = (spec.half + (spec.lvl === 1 ? APRON : 0)) * Math.SQRT2;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(spec.half, (lo + hi) / 2, spec.half), Math.hypot(rad, (hi - lo) / 2 + S * 2));
    const mat = this.farMats[spec.lvl];
    mat.userData.u.uOrg.value.set(x0 / CHUNK, z0 / CHUNK);
    mat.userData.u.uSize.value = 2 * spec.half;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x0, 0, z0); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.castShadow = mesh.receiveShadow = false;
    this.root.add(mesh);
    const prev = this.far[spec.lvl];
    this.far[spec.lvl] = { ...spec, x0, z0, x1: x0 + 2 * spec.half, z1: z0 + 2 * spec.half, mesh, tris: 2 * n * n };
    if (prev) {
      const a = prev.mesh.geometry.attributes;
      bufs.length = 0;
      bufs.push({ P: a.position.array, N: a.normal.array, C: a.color.array, R: a.aRoad.array, U: a.uv.array });
      this.root.remove(prev.mesh); prev.mesh.geometry.dispose();
    }
    const A = this.far[0], F2 = this.far[1];
    if (F2) F2.mesh.material.userData.u.uRect.value.set(...(A ? [A.x0 - F2.x0, A.z0 - F2.z0, A.x1 - F2.x0, A.z1 - F2.z0] : [0, 0, -1, -1]));
    this.dirty = true; this.replan = true;
  }

  // ------------------------------------------------------------ coast road
  // One 64 m z-segment: the asphalt ribbon at roadY + 0.03 and the curbs, per-point heights
  // so it sits exactly 6 cm above the shoulder however the road climbs and bends.
  *segJob(sg) {
    const z0 = sg.cz * CHUNK, ox = CHUNK * Math.floor(roadX(z0 + CHUNK / 2) / CHUNK), oz = z0;
    const NR = CHUNK + 1, f = {}, vref = ROAD_TEX * Math.round(z0 / ROAD_TEX);
    const rp = new Float32Array(NR * 6), ru = new Float32Array(NR * 4), prof = new Float32Array(NR * 24), fn = new Float32Array(NR * 2);
    const LATS = [ROAD_HALF, ROAD_HALF, ROAD_HALF + CURB_W, ROAD_HALF + CURB_W], DYS = [0, 0.03 + CURB_H, 0.03 + CURB_H, -0.23];
    for (let k = 0; k < NR; k++) {
      const z = z0 + k;
      roadFrame(z, f);
      fn[k * 2] = f.nx; fn[k * 2 + 1] = f.nz;
      for (let s = 0; s < 2; s++) {
        const sg_ = s ? 1 : -1, x = f.x + f.nx * sg_ * ROAD_HALF, zz = z + f.nz * sg_ * ROAD_HALF, o = (k * 2 + s) * 3;
        rp[o] = x - ox; rp[o + 1] = roadY(zz) + 0.03; rp[o + 2] = zz - oz;
        ru[(k * 2 + s) * 2] = s; ru[(k * 2 + s) * 2 + 1] = (vref - z) / ROAD_TEX;
        for (let p = 0; p < 4; p++) {
          const L = sg_ * LATS[p], px = f.x + f.nx * L, pz = z + f.nz * L, q = ((k * 2 + s) * 4 + p) * 3;
          prof[q] = px - ox; prof[q + 1] = roadY(pz) + DYS[p]; prof[q + 2] = pz - oz;
        }
      }
    }
    if (this.late()) yield;
    // curbs: flat-shaded quads per metre (crisp red/white stripes on the sea side)
    const nq = CHUNK * 6, cp = new Float32Array(nq * 12), cn = new Float32Array(nq * 12), cc = new Float32Array(nq * 12);
    let w = 0;
    const V = [0, 0, 0, 0];
    for (let k = 0; k < CHUNK; k++) {
      const stripe = (Math.floor(-(z0 + k + 0.5) / 2) & 1) === 0, nx = fn[k * 2], nz = fn[k * 2 + 1];
      for (let s = 0; s < 2; s++) {
        const col = stripe && s ? CURB_RED : CURB_WHITE, sg_ = s ? 1 : -1;
        for (let p = 0; p < 3; p++) {
          V[0] = ((k * 2 + s) * 4 + p) * 3; V[1] = V[0] + 3; V[2] = (((k + 1) * 2 + s) * 4 + p + 1) * 3; V[3] = V[2] - 3;
          // normal from the diagonals, flipped to face where this face should look
          const ax = prof[V[2]] - prof[V[0]], ay = prof[V[2] + 1] - prof[V[0] + 1], az = prof[V[2] + 2] - prof[V[0] + 2];
          const bx = prof[V[3]] - prof[V[1]], by = prof[V[3] + 1] - prof[V[1] + 1], bz = prof[V[3] + 2] - prof[V[1] + 2];
          let qx = ay * bz - az * by, qy = az * bx - ax * bz, qz = ax * by - ay * bx;
          const ex = p === 1 ? 0 : (p === 0 ? -sg_ : sg_) * nx, ey = p === 1 ? 1 : 0, ez = p === 1 ? 0 : (p === 0 ? -sg_ : sg_) * nz;
          const flip = qx * ex + qy * ey + qz * ez < 0, l = Math.hypot(qx, qy, qz) * (flip ? -1 : 1);
          qx /= l; qy /= l; qz /= l;
          for (let t = 0; t < 4; t++) {
            const src = V[flip ? (4 - t) % 4 : t], o = (w * 4 + t) * 3;
            cp[o] = prof[src]; cp[o + 1] = prof[src + 1]; cp[o + 2] = prof[src + 2];
            cn[o] = qx; cn[o + 1] = qy; cn[o + 2] = qz;
            cc[o] = col[0]; cc[o + 1] = col[1]; cc[o + 2] = col[2];
          }
          w++;
        }
      }
    }
    Object.assign(sg, { ox, oz, rp, ru, cp, cn, cc, nq, ready: true });
    this.roadDirty = true;
  }

  // Fixed-size buffers for all loaded road segments (indices never change, only positions).
  roadBuffers() {
    const C = 2 * this.q.rows + 4;
    if (this.roadCap === C) return;
    this.roadCap = C;
    const NR = CHUNK + 1, nr = C * NR * 2, nq = C * CHUNK * 6, nc = nq * 4;
    const I1 = new Uint16Array(C * CHUNK * 6), I2 = new (nc > 65535 ? Uint32Array : Uint16Array)(nq * 6);
    let w = 0;
    for (let sg = 0; sg < C; sg++) for (let k = 0; k < CHUNK; k++) {
      const a = (sg * NR + k) * 2;
      I1[w++] = a; I1[w++] = a + 2; I1[w++] = a + 1; I1[w++] = a + 1; I1[w++] = a + 2; I1[w++] = a + 3;
    }
    w = 0;
    for (let q = 0; q < nq; q++) { const a = q * 4; I2[w++] = a; I2[w++] = a + 1; I2[w++] = a + 2; I2[w++] = a; I2[w++] = a + 2; I2[w++] = a + 3; }
    const N1 = new Float32Array(nr * 3);
    for (let v = 0; v < nr; v++) N1[v * 3 + 1] = 1;
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    const g1 = new THREE.BufferGeometry(), g2 = new THREE.BufferGeometry();
    g1.setAttribute('position', dyn(new Float32Array(nr * 3), 3)); g1.setAttribute('normal', new THREE.BufferAttribute(N1, 3));
    g1.setAttribute('uv', dyn(new Float32Array(nr * 2), 2)); g1.setIndex(new THREE.BufferAttribute(I1, 1));
    g2.setAttribute('position', dyn(new Float32Array(nc * 3), 3)); g2.setAttribute('normal', dyn(new Float32Array(nc * 3), 3));
    g2.setAttribute('color', dyn(new Float32Array(nc * 3), 3)); g2.setIndex(new THREE.BufferAttribute(I2, 1));
    for (const g of [g1, g2]) g.boundingSphere = new THREE.Sphere();
    this.road.geometry.dispose(); this.curbs.geometry.dispose();
    this.road.geometry = g1; this.curbs.geometry = g2;
  }

  mergeRoad() {
    this.roadDirty = false;
    this.roadBuffers();
    const list = [];
    for (const sg of this.segs.values()) if (sg.ready) list.push(sg);
    list.sort((a, b) => a.cz - b.cz);
    if (list.length > this.roadCap) list.length = this.roadCap;
    if (!list.length) { this.road.visible = this.curbs.visible = false; return; }
    const g1 = this.road.geometry, g2 = this.curbs.geometry, NR = CHUNK + 1;
    const P1 = g1.attributes.position.array, U1 = g1.attributes.uv.array, P2 = g2.attributes.position.array;
    const mox = list[0].ox, moz = list[0].oz;
    let vr = 0, vc = 0;
    const bb = this._bb || (this._bb = new THREE.Box3()), pt = this._pt || (this._pt = new THREE.Vector3());
    bb.makeEmpty();
    for (const sg of list) {
      const dx = sg.ox - mox, dz = sg.oz - moz, rp = sg.rp, cp = sg.cp;
      for (let v = 0; v < NR * 2; v++) {
        const o = (vr + v) * 3;
        P1[o] = rp[v * 3] + dx; P1[o + 1] = rp[v * 3 + 1]; P1[o + 2] = rp[v * 3 + 2] + dz;
        if ((v & 15) === 0 || v === NR * 2 - 1) bb.expandByPoint(pt.set(P1[o], P1[o + 1], P1[o + 2]));
      }
      U1.set(sg.ru, vr * 2);
      for (let v = 0, m = sg.nq * 4; v < m; v++) { const o = (vc + v) * 3; P2[o] = cp[v * 3] + dx; P2[o + 1] = cp[v * 3 + 1]; P2[o + 2] = cp[v * 3 + 2] + dz; }
      g2.attributes.normal.array.set(sg.cn, vc * 3); g2.attributes.color.array.set(sg.cc, vc * 3);
      vr += NR * 2; vc += sg.nq * 4;
    }
    const upd = (a, n) => { a.clearUpdateRanges(); a.addUpdateRange(0, n); a.needsUpdate = true; };
    upd(g1.attributes.position, vr * 3); upd(g1.attributes.uv, vr * 2);
    for (const a of ['position', 'normal', 'color']) upd(g2.attributes[a], vc * 3);
    g1.setDrawRange(0, list.length * CHUNK * 6); g2.setDrawRange(0, vc / 4 * 6);
    bb.expandByScalar(2);
    for (const g of [g1, g2]) bb.getBoundingSphere(g.boundingSphere);
    for (const m of [this.road, this.curbs]) {
      m.position.set(mox, 0, moz); m.updateMatrix(); m.visible = true;
      m.material.userData.u.uOrg.value.set(mox / CHUNK, moz / CHUNK);
    }
  }

  // ------------------------------------------------------------ dirt lanes
  // Columns sit on whole-metre x, like the 1 m ground, and the ground across a lane is flat,
  // so the ribbon rides exactly 4 cm above it. Rounded end at u = L.
  *laneJob(L) {
    const ln = L.ln, us = [ROAD_HALF + 0.15];
    for (let x = Math.floor(ln.rx0 - us[0]); ln.rx0 - x < ln.L; x--) us.push(ln.rx0 - x);
    us.push(ln.L);
    for (let k = 1; k <= 6; k++) us.push(ln.L + LANE_HALF * Math.sin(k / 6 * Math.PI / 2));
    const nc = us.length, Pa = new Float32Array(nc * 9), Ua = new Float32Array(nc * 6);
    const ox = CHUNK * Math.floor(ln.rx0 / CHUNK), oz = CHUNK * Math.floor(ln.z0 / CHUNK);
    for (let c = 0; c < nc; c++) {
      const u = us[c], x = ln.rx0 - u, zc = ln.zAt(u), m = ln.zAt(u + 0.5) - ln.zAt(u - 0.5);
      const half = u > ln.L ? LANE_HALF * Math.sqrt(Math.max(0, 1 - ((u - ln.L) / LANE_HALF) ** 2)) : LANE_HALF;
      const hz = half * Math.sqrt(1 + m * m);
      for (let q = 0; q < 3; q++) {
        const z = zc + (q - 1) * hz, v = c * 3 + q;
        Pa[v * 3] = x - ox; Pa[v * 3 + 1] = groundY(x, z, rowAt(z)) + 0.04; Pa[v * 3 + 2] = z - oz;
        Ua[v * 2] = q / 2; Ua[v * 2 + 1] = u / LANE_TEX;
      }
      if ((c & 7) === 7 && this.late()) yield;
    }
    const idx = new Uint16Array((nc - 1) * 12);
    let w = 0;
    for (let c = 0; c < nc - 1; c++) for (let q = 0; q < 2; q++) {
      const a = c * 3 + q, b = a + 1, e = a + 3, d = e + 1;
      idx[w++] = a; idx[w++] = e; idx[w++] = b; idx[w++] = b; idx[w++] = e; idx[w++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Pa, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(Ua, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mat = this.laneMats.pop() || this.ribbonMat('lane');
    mat.userData.u.uOrg.value.set(ox / CHUNK, oz / CHUNK);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ox, 0, oz); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    mesh.receiveShadow = true; mesh.layers.set(1);
    if (this.lanes.get(ln.k) !== L) { geo.dispose(); this.laneMats.push(mat); return; }
    L.mesh = mesh; this.root.add(mesh);
  }

  dispose() {
    this.scene.remove(this.root);
    for (const ch of [...this.chunks.values()]) this.release(ch);
    for (const p of Object.values(this.pool)) p.forEach(g => g.dispose());
    for (const F of this.far) if (F) F.mesh.geometry.dispose();
    for (const L of this.lanes.values()) if (L.mesh) { L.mesh.geometry.dispose(); this.laneMats.push(L.mesh.material); }
    for (const m of [...this.farMats, ...this.laneMats]) m.dispose();
    this.disposeMesh(this.road); this.disposeMesh(this.curbs);
    this.mat.dispose();
    for (const t of [this.detail, this.roadTex, this.dirtTex, this.maskTex]) t.dispose();
    this.chunks.clear(); this.lanes.clear(); this.segs.clear(); this.jobs.clear(); this.queue = [];
  }
}
