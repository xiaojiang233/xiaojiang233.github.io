// Planet Daze, generated forever.
//
// The coast runs north–south along z for ever. The sea is east (+x), the land
// west (−x). You start near z = 26 riding towards −z, so the sea is on your
// right and the sun sets ahead of you over the water.
//
// Everything here is a pure function of world position (no three.js, no
// state you can't rebuild), so terrain chunks, the bike physics, the minimap
// and the scenery all ask the same questions and get the same answers.
import { clamp, lerp, smooth, fbm, noise2 } from './util.js';

export const ROAD_HALF = 3.5;    // asphalt half width
export const BAND = 6.2;         // flat shoulder either side of the coast road centre line
export const LANE_HALF = 1.7;    // dirt lanes that wander inland
export const SLOT = 190;         // one landmark slot every SLOT metres along the coast
export const LCELL = 560;        // one inland lane per LCELL metres
export const ICELL = 640;        // offshore islands
export const LAKE = 760;         // inland lake grid
export const CHUNK = 64;         // terrain / scatter chunk size
export const LAMP_STEP = 46;     // street lamps along the coast road

// ---------------------------------------------------------------- hashing, 1D noise
export function hash(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) + Math.imul(b | 0, 0x165667b1) + Math.imul(c | 0, 0x2545f491) + 0x3c6ef372) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth (C2) value noise in [-1, 1].
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(hash(i, 91) * 2 - 1, hash(i + 1, 91) * 2 - 1, u);
}

// A tiny bounded cache so long rides don't grow memory forever.
function memo(limit = 4000) {
  const m = new Map();
  return (key, make) => {
    let v = m.get(key);
    if (v === undefined) { v = make(); if (m.size > limit) m.clear(); m.set(key, v); }
    return v;
  };
}

// ---------------------------------------------------------------- cliffs
// The first couple of kilometres are hand-placed so the opening ride keeps the
// original island's rhythm: beach, pier, windmills, the lighthouse headland,
// the lookout, rocks, flowers, palms. Beyond that it's procedural.
const CLIFF_KEYS = [[300, 0.1], [60, 0.03], [-300, 0.0], [-420, 0.05], [-540, 0.3], [-700, 0.93], [-830, 1.0], [-960, 0.84], [-1080, 0.55], [-1210, 0.45], [-1360, 0.12], [-1520, 0.03], [-1720, 0.12]];
const AUTH_HI = CLIFF_KEYS[0][0], AUTH_LO = CLIFF_KEYS[CLIFF_KEYS.length - 1][0];
function keyed(keys, z) {
  if (z >= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (z >= keys[i][0]) {
      const [z0, a] = keys[i - 1], [z1, b] = keys[i], u = (z0 - z) / (z0 - z1);
      return a + (b - a) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1][1];
}
const cliffNoise = z => smooth(-0.25, 0.5, 0.85 * noise1(z / 430 + 40) + 0.3 * Math.sin(z / 1130 + 1));
export function cliff(z) {
  const out = Math.max(0, z - AUTH_HI, AUTH_LO - z);
  const a = keyed(CLIFF_KEYS, clamp(z, AUTH_LO, AUTH_HI));
  return out <= 0 ? a : lerp(a, cliffNoise(z), smooth(0, 420, out));
}
export const sandF = z => 1 - smooth(0.12, 0.45, cliff(z));

// ---------------------------------------------------------------- coast + road
const coastBase = z => 118 * Math.sin(z / 1450 + 0.4) + 50 * Math.sin(z / 590 + 2.3) + 30 * noise1(z / 240 + 17);
// distance from the road centre line to the sea: wide beaches, tight cliff roads
function roadOffC(z, c) { return lerp(25 + 15 * (0.5 + 0.5 * noise1(z / 380 + 5)), 10.5, smooth(0.25, 0.85, c)); }
export const roadOff = z => roadOffC(z, cliff(z));
export const roadX = z => coastBase(z) - roadOffC(z, cliff(z));
export function roadY(z) { return 1.6 + 10.8 * smooth(0.2, 0.92, cliff(z)) + 0.3 * noise1(z / 85 + 2); }
// Where land meets sea. Lighthouses and lookouts push little headlands out.
export function coastX(z) {
  const off = roadOff(z);
  return coastBase(z) + clamp(0.3 * (off - BAND), 0, 8) * noise1(z / 55 + 3) + headland(z);
}

// Road frame at z. Travel is towards −z; t = along travel, n = towards the sea.
export function roadFrame(z, o = {}) {
  const rx = roadX(z), d = roadX(z + 0.5) - roadX(z - 0.5), n = Math.hypot(1, d);
  o.x = rx; o.z = z; o.y = roadY(z);
  o.tx = -d / n; o.tz = -1 / n;
  o.nx = 1 / n; o.nz = -d / n;
  o.yaw = Math.atan2(o.tx, o.tz);   // object.rotation.y that points local +z along travel
  return o;
}
// World position `ahead` metres along travel from z, `lat` metres towards the sea.
// Same idea as the old island's path.place(t, lat).
export function place(z, lat, ground = true) {
  const o = roadFrame(z);
  const x = o.x + o.nx * lat, zz = z + o.nz * lat;
  return { x, y: ground ? heightAt(x, zz) : o.y, z: zz, yaw: o.yaw, o };
}

// Per-row constants (everything that only depends on z). Terrain chunks build
// one per grid row and pass it to heightAt to avoid recomputing.
export function rowAt(z) {
  const c = cliff(z), base = coastBase(z), off = roadOffC(z, c), rx = base - off;
  const d = roadX(z + 0.5) - roadX(z - 0.5);
  return {
    z, c, rx, cs: 1 / Math.hypot(1, d), d,
    ry: roadY(z), sand: 1 - smooth(0.12, 0.45, c),
    W: coastX(z) - rx,                                   // road centre → shoreline
    hill: 7 + 13 * (0.5 + 0.5 * noise1(z / 300 + 8)),   // height of the first hills inland
    flat: 4 + 16 * Math.max(0, noise1(z / 260 + 30)),    // meadow before they start
  };
}
// Signed distance from the coast road centre line, + towards the sea.
export const latOf = (x, R) => (x - R.rx) * R.cs;

// ---------------------------------------------------------------- terrain
function seaSide(lat, x, z, R) {
  const y = R.ry - 0.03;
  const x0 = lat - BAND;
  if (x0 <= 0) return y;
  const sd = R.sand;
  const Wp = Math.max(3, R.W - BAND);
  const top = lerp(0.3, 1.0, sd);
  let base = x0 < Wp ? top * Math.pow(1 - x0 / Wp, 0.85) : -(x0 - Wp) * lerp(0.55, 0.12, sd);
  base = Math.max(base, -14);
  if (x0 < Wp) base += sd * 0.18 * noise2(x * 0.18, z * 0.18) * smooth(0, 5, x0) * (1 - smooth(Wp - 5, Wp, x0));
  const embW = 1.2 + Math.max(0, y - top) * lerp(0.22, 1.3, sd);
  const k = smooth(1, 1 + embW, x0);
  const rough = (1 - sd) * (1.6 * noise2(x * 0.25, z * 0.25) + 0.6 * noise2(x * 0.9, z * 0.9)) * k * (1 - k) * 3.2;
  return lerp(y, base, k) + rough;
}

function landSide(dl, x, z, R) {
  const y = R.ry - 0.03;
  const x0 = dl - BAND;
  if (x0 <= 0) return y;
  const xx = Math.max(0, x0 - R.flat);
  const H = R.hill;
  const rise = H * Math.pow(smooth(0, 75, xx), 1.15);
  const n = fbm(x * 0.011, z * 0.011, 4) * (3 + H * 0.4) + fbm(x * 0.05, z * 0.05, 2) * 1.3;
  let h = y + rise + n * smooth(0, 16, xx);
  // further inland: rolling uplands, then proper hills
  const far = smooth(160, 900, xx);
  if (far > 0) h += far * (fbm(x * 0.0021 + 40, z * 0.0021 - 13, 4) * 48 + 12);
  return h;
}

// Terrain without lanes, pads or decks: the coast profile, uplands, islands, lakes.
export function baseHeight(x, z, R = rowAt(z)) {
  const lat = latOf(x, R);
  let h = lat >= 0 ? seaSide(lat, x, z, R) : landSide(-lat, x, z, R);
  if (lat > R.W - 12) h = islandsH(h, x, z);
  if (lat < -150) h = lakesH(h, x, z);
  return h;
}

// The ground you see and ride on (everything except pier decks and the road's
// own 6 cm of asphalt).
export function heightAt(x, z, R = rowAt(z)) {
  let h = baseHeight(x, z, R);
  if (latOf(x, R) < -(BAND - 2)) h = lanesH(h, x, z);
  return padsH(h, x, z);
}

// ---------------------------------------------------------------- islands
const islandMemo = memo();
export function island(i) {
  return islandMemo(i, () => {
    if (!(i === 0 || hash(i, 21) < 0.5)) return null;
    const z = i === 0 ? -300 : -(i + 0.15 + 0.7 * hash(i, 22)) * ICELL;
    const off = i === 0 ? 165 : 150 + 300 * hash(i, 23);
    const R = i === 0 ? 52 : 35 + 65 * hash(i, 24);
    const peak = i === 0 ? 5.5 : 4 + 9 * hash(i, 25);
    const sx = coastX(z);
    const x = sx + off;
    const type = i === 0 ? 'palmIsle' : hash(i, 27) < 0.22 ? 'lighthouseIsle' : hash(i, 27) < 0.78 ? 'palmIsle' : 'bare';
    const bar = i === 0 || hash(i, 26) < 0.45 ? { x0: sx - 4, z0: z, x1: x - R * 0.6, z1: z } : null;
    const isl = { id: 'i' + i, kind: 'island', i, x, z, R, peak, type, bar, pads: [] };
    if (type === 'lighthouseIsle') isl.pads.push([x, z, Math.min(8, R * 0.35), peak * 0.8, 6]);
    isl.caption = CAPTION[type] || null;
    isl.cx = x; isl.cz = z;
    return isl;
  });
}
const islNearMemo = memo();
function islandsNear(z) {
  const c = Math.floor(-z / ICELL);
  return islNearMemo(c, () => {
    const out = [];
    for (let i = c - 1; i <= c + 1; i++) { const s = island(i); if (s) out.push(s); }
    return out;
  });
}
function islandH(s, x, z) {
  const dx = x - s.x, dz = z - s.z, r = Math.hypot(dx, dz);
  const Rr = s.R * (1 + 0.2 * noise2(x * 0.025 + s.i * 7.1, z * 0.025));
  let h;
  if (r < Rr) {
    const t = r / Rr;
    h = 0.35 + (s.peak - 0.35) * Math.pow(smooth(0.85, 0.2, t), 1.2) + 0.5 * noise2(x * 0.08, z * 0.08) * smooth(0.9, 0.5, t);
  } else h = 0.35 - (r - Rr) * 0.12;
  if (s.bar) {
    const d = segDist(x, z, s.bar.x0, s.bar.z0, s.bar.x1, s.bar.z1);
    if (d < 14) h = Math.max(h, 0.22 + 0.06 * noise2(x * 0.1, z * 0.1) - Math.pow(d / 5.5, 2) * 0.6);
  }
  return h;
}
function islandsH(h, x, z) {
  for (const s of islandsNear(z)) {
    if (Math.abs(z - s.z) > s.R * 1.3 + 20 && !s.bar) continue;
    if (x < (s.bar ? s.bar.x0 - 16 : s.x - s.R * 1.3 - 20) || x > s.x + s.R * 1.3 + 20) continue;
    h = Math.max(h, islandH(s, x, z));
  }
  return h;
}
function segDist(x, z, x0, z0, x1, z1) {
  const vx = x1 - x0, vz = z1 - z0, l2 = vx * vx + vz * vz;
  const t = l2 ? clamp(((x - x0) * vx + (z - z0) * vz) / l2, 0, 1) : 0;
  return Math.hypot(x - x0 - vx * t, z - z0 - vz * t);
}

// ---------------------------------------------------------------- lakes
const lakeMemo = memo();
export function lake(ix, iz) {
  return lakeMemo(ix * 100003 + iz, () => {
    if (hash(ix, iz, 31) > 0.42) return null;
    const x = (ix + 0.2 + 0.6 * hash(ix, iz, 32)) * LAKE, z = (iz + 0.2 + 0.6 * hash(ix, iz, 33)) * LAKE;
    const R = 45 + 70 * hash(ix, iz, 34);
    const Rw = rowAt(z), lat = latOf(x, Rw);
    if (lat > -(190 + R * 2.6)) return null;                 // well inland only
    if (landSide(-lat, x, z, Rw) > 30) return null;          // and down in the lowlands, not on a hilltop
    return { id: 'l' + ix + '_' + iz, kind: 'lake', x, z, R, cx: x, cz: z, caption: CAPTION.lake, pads: [] };
  });
}
function lakesH(h, x, z) {
  const ix = Math.floor(x / LAKE), iz = Math.floor(z / LAKE);
  for (let a = ix - 1; a <= ix + 1; a++) for (let b = iz - 1; b <= iz + 1; b++) {
    const l = lake(a, b);
    if (!l) continue;
    const r = Math.hypot(x - l.x, z - l.z);
    if (r > l.R * 2.6) continue;
    const m = smooth(l.R * 2.6, l.R * 1.15, r);
    const basin = r < l.R ? lerp(-2.6, -0.1, (r / l.R) ** 2) : -0.1 + (r - l.R) * 0.06;
    h = lerp(h, basin + 0.25 * noise2(x * 0.06, z * 0.06), m);
  }
  return h;
}

// ---------------------------------------------------------------- lanes
// Dirt lanes leave the coast road (inland side) and wander west to somewhere:
// a village, a campsite, windmills, a flower field, or just the end of the road.
const laneMemo = memo();
export function lane(k) {
  return laneMemo(k, () => {
    if (!(k === 0 || hash(k, 11) < 0.78)) return null;
    const z0 = k === 0 ? -235 : -(k + 0.3 + 0.4 * hash(k, 12)) * LCELL;
    const rx0 = roadX(z0);
    const L = k === 0 ? 62 : 240 + 620 * hash(k, 13);
    const A = k === 0 ? 3 : 8 + 30 * hash(k, 14), lam = 70 + 110 * hash(k, 15), ph = hash(k, 16) * 6.283;
    const ln = { id: 'n' + k, k, z0, rx0, L, A, lam, ph };
    ln.zAt = u => z0 + A * Math.sin(u / lam + ph) * smooth(0, 40, u);
    ln.dest = laneDest(ln);
    return ln;
  });
}
const lanesNearMemo = memo();
export function lanesNear(z) {
  const c = Math.floor(-z / LCELL);
  return lanesNearMemo(c, () => {
    const out = [];
    for (let k = c - 1; k <= c + 1; k++) { const l = lane(k); if (l) out.push(l); }
    return out;
  });
}
// Distance from (x, z) to a lane's centre line, or null when nowhere near it.
export function laneDist(ln, x, z) {
  const u = ln.rx0 - x;
  if (u < BAND - 3 || u > ln.L + 3 || Math.abs(z - ln.z0) > ln.A + 12) return null;
  const zc = ln.zAt(u), m = ln.zAt(u + 0.5) - ln.zAt(u - 0.5), n = Math.hypot(1, m);
  return { d: Math.abs(z - zc) / n, u, zc, m, n };
}
function laneY(ln, u) {
  // the lane surface: the land under its centre line, softened along its length
  if (!ln.ys) { ln.ys = new Float32Array(Math.ceil((ln.L + 8) * 2) + 2).fill(NaN); }
  const i = clamp(Math.round(u * 2), 0, ln.ys.length - 1);
  let y = ln.ys[i];
  if (y !== y) {
    const q = i / 2;
    let s = 0;
    for (const du of [-6, 0, 6]) { const uu = clamp(q + du, 0, ln.L); s += baseHeight(ln.rx0 - uu, ln.zAt(uu)); }
    y = ln.ys[i] = Math.max(0.6, s / 3);
  }
  return y;
}
function lanesH(h, x, z) {
  for (const ln of lanesNear(z)) {
    const q = laneDist(ln, x, z);
    if (!q || q.d > LANE_HALF + 3.2) continue;
    const yl = laneY(ln, q.u) - 0.02;
    h = lerp(h, yl, smooth(LANE_HALF + 3.2, LANE_HALF + 0.4, q.d));
  }
  return h;
}

// ---------------------------------------------------------------- landmarks
export const CAPTION = {
  start: ['发呆星海边公路', '这条路没有尽头。限速：慢慢来。'],
  beach: ['抱肚沙滩', '沙子是温的。樱花粉在这里负责晒太阳。'],
  pier: ['钓鱼栈桥', '天空蓝每天都来钓鱼。一条也没钓到过，也不打算钓到。'],
  windmills: ['风车山坡', '风车转得很慢，因为风也在发呆。'],
  lighthouse: ['发呆星灯塔', '天黑以后它会亮起来，提醒大家该发呆了。'],
  viewpoint: ['发呆观景台', '推荐发呆时长：随便。'],
  rocks: ['礁石海岸', '运气好的话，能看到鲸鱼。'],
  flowers: ['小花田', '花是奶蛙种的。种完它就忘了。'],
  statue: ['奶蛙大爆炸纪念碑', '纪念宇宙第 0 秒的那一次抱肚子。'],
  palms: ['椰子林', '椰子不会掉下来，它们也在发呆。'],
  busstop: ['发呆站', '末班车 25:00。'],
  kiosk: ['奶蛙商店 · 发呆星分店', '今天只卖发呆，不要钱。'],
  village: ['抱肚村', '村里每户人家都有一张很软的沙发。'],
  camp: ['露营地', '帐篷是用来发呆的，不是用来睡觉的。'],
  end: ['路的尽头', '再往前没有路了。可以就在这里发呆。'],
  palmIsle: ['小椰岛', '退潮的时候，可以骑车过去。'],
  lighthouseIsle: ['灯塔岛', '灯塔看守员每天划船上班，划到一半就开始发呆。'],
  bare: null,
  lake: ['发呆湖', '湖面很平，平到能看见自己在发呆。'],
};

// Road signs (style, lines). Texts are i18n keys.
export const SIGNS = [
  ['road', ['限速：慢慢来']], ['warn', ['注意：奶蛙出没']], ['road', ['请抱紧肚子']], ['road', ['本路段禁止着急']],
  ['warn', ['前方：发呆区']], ['road', ['距离午睡黑洞 3.8 光年']], ['road', ['抱肚星云 · 抬头可见']],
];

// Slot k sits at z ≈ −k·SLOT. The first ones are fixed (the old island's order).
const SLOT_AUTH = ['start', 'beach', 'pier', 'windmills', 'lighthouse', 'viewpoint', 'rocks', 'flowers', 'palms', 'busstop'];
const TYPES = [
  ['beach', 3, c => c < 0.2], ['pier', 2, c => c < 0.3], ['lighthouse', 1.3, c => c > 0.72], ['viewpoint', 2, c => c > 0.45],
  ['rocks', 1.5, c => c > 0.3 && c < 0.85], ['palms', 2, c => c < 0.25], ['busstop', 1.1, () => true], ['kiosk', 0.8, () => true],
  ['windmills', 1.2, () => true], ['flowers', 1.4, () => true], ['village', 1.6, () => true], ['camp', 1.0, () => true], ['none', 2.4, () => true],
];
export function slotZ(k) { return k >= 0 && k < SLOT_AUTH.length ? -k * SLOT : -k * SLOT + (hash(k, 3) - 0.5) * 60; }
function pick(list, u) {
  const tot = list.reduce((s, t) => s + t[1], 0);
  let a = u * tot;
  for (const t of list) { a -= t[1]; if (a <= 0) return t[0]; }
  return list[list.length - 1][0];
}
function rawSlotType(k, salt = 1) {
  if (k >= 0 && k < SLOT_AUTH.length) return SLOT_AUTH[k];
  const c = cliff(slotZ(k));
  return pick(TYPES.filter(t => t[2](c)), hash(k, salt));
}
export function slotType(k) {
  const t = rawSlotType(k);
  if (k >= 0 && k < SLOT_AUTH.length) return t;
  return t !== 'none' && t === rawSlotType(k - 1) ? rawSlotType(k, 7) : t;
}
// cheap: only the type, used by coastX for headlands (no recursion into the coast)
function headland(z) {
  const c = Math.round(-z / SLOT);
  let h = 0;
  for (let k = c - 1; k <= c + 1; k++) {
    const t = slotType(k);
    if (t !== 'lighthouse' && t !== 'viewpoint') continue;
    const dz = z - slotZ(k), [amp, sig] = t === 'lighthouse' ? [17, 55] : [10, 42];
    h += amp * Math.exp(-((dz / sig) ** 2));
  }
  return h;
}

const slotMemo = memo();
export function slotFeature(k) {
  return slotMemo(k, () => buildSlot(k));
}
// Spot helpers. `ahead` is metres along travel (towards −z) from the slot.
function spotOf(z0, ahead, lat) {
  const z = z0 - ahead, o = roadFrame(z);
  return { x: o.x + o.nx * lat, z: z + o.nz * lat, yaw: o.yaw, lat, ahead, zr: z };
}
function buildSlot(k) {
  const type = slotType(k);
  const z = slotZ(k), fr = roadFrame(z), R = rowAt(z);
  const f = {
    id: 's' + k, kind: 'slot', k, type, z, frame: fr, c: R.c, W: R.W, ry: R.ry, sand: R.sand,
    pads: [], decks: [], spots: {}, caption: CAPTION[type] || null, cx: fr.x, cz: z,
    sign: null,
  };
  // road-level pad (paved), or a natural one (flattened to the land under its centre)
  const S = (name, ahead, lat, r = 0, edge = 4, level = 'road') => {
    const s = spotOf(z, ahead, lat);
    f.spots[name] = s;
    if (r) f.pads.push([s.x, s.z, r, level === 'road' ? roadY(s.zr) - 0.03 : null, edge, level === 'road']);
    return s;
  };
  switch (type) {
    case 'start':
      S('arch', 5, 0);
      S('kiosk', 14, -(BAND + 6.5), 5.2, 4);
      S('bus', -29, -(BAND + 1.0), 3.4, 3);
      break;
    case 'beach': {
      const s = S('center', 0, Math.min(R.W - 6, 17));
      f.cx = s.x; f.cz = s.z;
      break;
    }
    case 'pier': {
      const s = S('start', 0, BAND + 1.5);
      const y = Math.max(1.25, R.ry - 0.15);
      const L = Math.max(26, R.W - BAND + 20);
      f.decks.push({ x: s.x, z: s.z, dx: fr.nx, dz: fr.nz, len: L, half: 1.3, y: y + 0.04 });
      f.pierY = y; f.pierLen = L;
      S('end', 0, BAND + 1.5 + L - 0.35);
      break;
    }
    case 'windmills':
      S('w0', -21, -46); S('w1', 3, -72); S('w2', 26, -50);
      S('sign', 14, -(ROAD_HALF + 2.0));
      f.cx = f.spots.w1.x; f.cz = f.spots.w1.z;
      break;
    case 'lighthouse': {
      const s = S('tower', 0, 12, 9.5, 5);
      S('sign', 7, ROAD_HALF + 2.0);
      f.cx = s.x; f.cz = s.z;
      break;
    }
    case 'viewpoint': {
      const s = S('bench', 0, 10.5, 6.5, 4);
      S('binoculars', 4.6, 9.0); S('tree', -3.5, 6.8); S('sign', 4.6, ROAD_HALF + 2.2);
      f.cx = s.x; f.cz = s.z;
      break;
    }
    case 'rocks': S('center', 0, Math.min(R.W + 6, 24)); break;
    case 'flowers': { const s = S('center', 0, -(BAND + 18)); f.cx = s.x; f.cz = s.z; break; }
    case 'palms': break;
    case 'busstop': S('shelter', 0, -(BAND + 1.0), 3.4, 3); break;
    case 'kiosk': S('shop', 0, -(BAND + 6.5), 5.2, 4); break;
    case 'village': {
      const n = 3 + Math.floor(hash(k, 51) * 3);
      for (let i = 0; i < n; i++) {
        const a = -26 + i * 52 / Math.max(1, n - 1) + (hash(k, 52 + i) - 0.5) * 8;
        S('house' + i, a, -(BAND + 14 + hash(k, 60 + i) * 22), 4.6, 3.5, 'natural');
      }
      S('well', 0, -(BAND + 11), 2.2, 2, 'natural');
      f.houses = n;
      f.cx = f.spots.well.x; f.cz = f.spots.well.z;
      break;
    }
    case 'camp': { const s = S('tent', 0, -(BAND + 16), 7, 4, 'natural'); f.cx = s.x; f.cz = s.z; break; }
  }
  // one road sign every few slots
  if (k !== 0 && hash(k, 71) < 0.55) {
    const sg = SIGNS[Math.floor(hash(k, 72) * SIGNS.length)];
    f.sign = { ...spotOf(z, 70 + 30 * hash(k, 73), -(ROAD_HALF + 1.3)), style: sg[0], keys: sg[1] };
  }
  return f;
}

// lane destinations
const DEST = [['windmills', 1], ['flowers', 1.2], ['village', 1.6], ['camp', 1.1], ['end', 0.8]];
function laneDest(ln) {
  const type = ln.k === 0 ? 'statue' : pick(DEST, hash(ln.k, 17));
  const u = ln.L + 8, x = ln.rx0 - u, z = ln.zAt(ln.L);
  const m = ln.zAt(ln.L + 0.5) - ln.zAt(ln.L - 0.5);
  const yaw = Math.atan2(1, -m);               // facing back down the lane (+x, −dz/du), towards the sea
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const f = { id: 'd' + ln.k, kind: 'dest', type, lane: ln.k, x, z, yaw, cx: x, cz: z, pads: [], decks: [], spots: {}, caption: CAPTION[type] || null };
  // local (right, forward) → world
  const S = (name, r_, fwd, r = 0, edge = 3, level = 'natural') => {
    const s = { x: x + rx * r_ + fx * fwd, z: z + rz * r_ + fz * fwd, yaw };
    f.spots[name] = s;
    if (r) f.pads.push([s.x, s.z, r, null, edge, level === 'road']);
    return s;
  };
  switch (type) {
    case 'statue': S('statue', 0, 0, 6.5, 4); break;
    case 'windmills': S('w0', -24, -8); S('w1', 4, -30); S('w2', 26, -6); break;
    case 'flowers': S('center', 0, -12); break;
    case 'village': {
      const n = 3 + Math.floor(hash(ln.k, 81) * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 5.2 - 2.6 + (hash(ln.k, 82 + i) - 0.5) * 0.4, rr = 15 + hash(ln.k, 90 + i) * 7;
        S('house' + i, Math.sin(a) * rr, -Math.cos(a) * rr + 4, 4.6, 3.5);
      }
      S('well', 0, 0, 2.4, 2);
      f.houses = n;
      break;
    }
    case 'camp': S('tent', 0, -4, 7, 4); break;
    case 'end': S('bench', 0, -2, 4, 3); break;
  }
  return f;
}

// Pads and decks that touch the band of z covered by slot cell c.
const nearMemo = memo(3000);
function nearCell(z) {
  const c = Math.floor(-z / SLOT);
  return nearMemo(c, () => {
    const zHi = -c * SLOT + 1, zLo = -(c + 1) * SLOT - 1;
    const feats = [];
    for (let k = c - 1; k <= c + 2; k++) feats.push(slotFeature(k));
    const seen = new Set();
    for (const zz of [zHi, zLo]) {
      for (const ln of lanesNear(zz)) if (!seen.has(ln.k)) { seen.add(ln.k); feats.push(ln.dest); }
      for (const s of islandsNear(zz)) if (s.pads.length && !seen.has(s.id)) { seen.add(s.id); feats.push(s); }
    }
    const pads = [], decks = [];
    for (const f of feats) {
      for (const p of f.pads) if (p[1] - p[2] - p[4] <= zHi && p[1] + p[2] + p[4] >= zLo) pads.push(p);
      for (const d of f.decks || []) decks.push(d);
    }
    return { pads, decks };
  });
}
function padsH(h, x, z) {
  const pads = nearCell(z).pads;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    const dx = x - p[0], dz = z - p[1], rr = p[2] + p[4];
    if (dx * dx + dz * dz >= rr * rr) continue;
    if (p[3] === null) p[3] = Math.max(0.6, baseHeight(p[0], p[1]) + 0.05);
    h = lerp(h, p[3], smooth(rr, p[2], Math.hypot(dx, dz)));
  }
  return h;
}
// 0..1: how much (x, z) is on a paved pad (for terrain colour)
export function plazaAt(x, z) {
  let a = 0;
  for (const p of nearCell(z).pads) {
    if (!p[5]) continue;
    const d = Math.hypot(x - p[0], z - p[1]);
    a = Math.max(a, smooth(p[2] + 0.6, p[2] - 0.4, d));
  }
  return a;
}

// All landmarks (with a caption or a footprint) within r metres of (x, z).
export function featuresNear(x, z, r) {
  const out = [], seen = new Set();
  const add = f => { if (f && !seen.has(f.id) && Math.hypot(f.cx - x, f.cz - z) < r) { seen.add(f.id); out.push(f); } };
  for (let k = Math.floor(-(z + r) / SLOT) - 1; k <= Math.ceil(-(z - r) / SLOT) + 1; k++) add(slotFeature(k));
  for (let k = Math.floor(-(z + r) / LCELL) - 1; k <= Math.ceil(-(z - r) / LCELL) + 1; k++) { const l = lane(k); if (l) add(l.dest); }
  for (let i = Math.floor(-(z + r) / ICELL) - 1; i <= Math.ceil(-(z - r) / ICELL) + 1; i++) add(island(i));
  const ix = Math.floor(x / LAKE), iz = Math.floor(z / LAKE), n = Math.ceil(r / LAKE) + 1;
  for (let a = ix - n; a <= ix + n; a++) for (let b = iz - n; b <= iz + n; b++) add(lake(a, b));
  return out;
}

// ---------------------------------------------------------------- what's underfoot
export function deckAt(x, z) {
  for (const d of nearCell(z).decks) {
    const px = x - d.x, pz = z - d.z;
    const along = px * d.dx + pz * d.dz, side = Math.abs(px * d.dz - pz * d.dx);
    if (along > -0.2 && along < d.len && side < d.half) return d;
  }
  return null;
}
// The nearest road or lane: distance, unit tangent (road: along travel, lane: inland), kind,
// and lat = signed offset along the normal (−tz, tx) (for the road that is seaward).
export function nearestPath(x, z, out = {}) {
  const R = rowAt(z), lat = latOf(x, R);
  out.kind = 'road'; out.d = Math.abs(lat); out.lat = lat;
  out.tx = -R.d * R.cs; out.tz = -R.cs; out.half = ROAD_HALF;
  if (lat < -(BAND - 2)) {
    for (const ln of lanesNear(z)) {
      const q = laneDist(ln, x, z);
      if (q && q.d < out.d) {
        out.kind = 'lane'; out.d = q.d; out.half = LANE_HALF;
        out.tx = -1 / q.n; out.tz = q.m / q.n;           // heading inland (u grows as x falls)
        out.lat = (q.zc - z) / q.n;
      }
    }
  }
  return out;
}
export function groundAt(x, z, out = {}) {
  const R = rowAt(z), lat = latOf(x, R);
  const h = heightAt(x, z, R);
  out.h = h; out.y = h; out.surf = 'grass'; out.depth = 0;
  if (Math.abs(lat) < ROAD_HALF) { out.y = R.ry + 0.03; out.surf = 'road'; return out; }
  const d = deckAt(x, z);
  if (d && d.y > h - 0.2) { out.y = d.y; out.surf = 'deck'; return out; }
  if (lat < -(BAND - 2)) {
    for (const ln of lanesNear(z)) { const q = laneDist(ln, x, z); if (q && q.d < LANE_HALF) { out.surf = 'lane'; return out; } }
  }
  if (h < -0.02) { out.surf = 'water'; out.depth = -h; return out; }
  if (sandyAt(x, z, R, lat, h) > 0.5) out.surf = 'sand';
  return out;
}
// 0..1 sandiness, for colour and for rolling resistance
export function sandyAt(x, z, R, lat, h) {
  let s = 0;
  if (lat > BAND - 0.5 && h < 2.2) s = R.sand * smooth(2.2, 1.4, h);
  if (lat > R.W - 14 && h < 1.0) {
    for (const i of islandsNear(z)) {
      const r = Math.hypot(x - i.x, z - i.z);
      if (r < i.R * 1.5) s = Math.max(s, smooth(1.0, 0.45, h));
      if (i.bar && segDist(x, z, i.bar.x0, i.bar.z0, i.bar.x1, i.bar.z1) < 9) s = 1;
    }
  }
  return s;
}

// ---------------------------------------------------------------- collectible stars
// Deterministic per chunk; ids are stable so a collected star stays collected.
const PATTERNS = ['line', 'zig', 'arc', 'swap', 'line', 'arc'];
export function starsInChunk(cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK, out = [];
  const inside = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  // along the coast road, in little patterns (anchored in this chunk)
  for (let j = Math.floor(z0 / 80); j <= Math.floor(z1 / 80); j++) {
    const zg = (j + 0.2 + 0.6 * hash(j, 41)) * 80;
    if (zg < z0 || zg >= z1 || Math.abs(zg) < 70 || hash(j, 42) > 0.72) continue;
    const rx = roadX(zg);
    if (rx < x0 || rx >= x1) continue;
    const p = PATTERNS[Math.floor(hash(j, 43) * PATTERNS.length)], n = 5 + Math.floor(hash(j, 44) * 3), laneOff = (hash(j, 45) - 0.5) * 3.6;
    for (let i = 0; i < n; i++) {
      let lat = laneOff;
      if (p === 'zig') lat = i % 2 ? 1.6 : -1.6;
      else if (p === 'arc') lat = Math.sin(i / (n - 1) * Math.PI) * 2.4 - 1.2;
      else if (p === 'swap') lat = lerp(-2.2, 2.2, i / (n - 1));
      const s = spotOf(zg, i * 3.2, clamp(lat, -2.8, 2.8));
      out.push({ id: `r${j}_${i}`, x: s.x, z: s.z, road: true });
    }
  }
  // along lanes
  for (const ln of lanesNear((z0 + z1) / 2)) {
    for (let g = 0; g * 70 + 30 < ln.L - 15; g++) {
      if (hash(ln.k, g, 46) > 0.55) continue;
      const u0 = g * 70 + 30 + hash(ln.k, g, 47) * 20;
      const ax = ln.rx0 - u0, az = ln.zAt(u0);
      if (!inside(ax, az)) continue;
      for (let i = 0; i < 5; i++) { const u = u0 + i * 3.2; out.push({ id: `n${ln.k}_${g}_${i}`, x: ln.rx0 - u, z: ln.zAt(u) + Math.sin(i * 1.3) * 0.6 }); }
    }
  }
  // off the road: a ring around something nice to ride to
  if (hash(cx, cz, 48) < 0.2) {
    const x = x0 + 8 + 48 * hash(cx, cz, 49), z = z0 + 8 + 48 * hash(cx, cz, 50);
    const R = rowAt(z), lat = latOf(x, R), h = heightAt(x, z, R);
    if (h > 0.3 && Math.abs(lat) > BAND + 3) {
      const n = 6;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push({ id: `f${cx}_${cz}_${i}`, x: x + Math.cos(a) * 2.8, z: z + Math.sin(a) * 2.8 }); }
    }
  }
  // islands: a reward ring for getting there
  for (let i = Math.floor(-z1 / ICELL) - 1; i <= Math.ceil(-z0 / ICELL) + 1; i++) {
    const s = island(i);
    if (!s || !inside(s.x, s.z)) continue;
    for (let q = 0; q < 7; q++) { const a = q / 7 * Math.PI * 2; out.push({ id: `i${i}_${q}`, x: s.x + Math.cos(a) * s.R * 0.42, z: s.z + Math.sin(a) * s.R * 0.42 }); }
  }
  return out;
}

// ---------------------------------------------------------------- start
export const START = { z: 26, lat: 1.75 };
