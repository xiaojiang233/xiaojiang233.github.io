// Galaxy generators (presets) and the things the player can drop into the universe.
import { rnd, gauss, TAU, clamp } from './sim.js';

const STOPS = [[0.62, 0.76, 1], [0.86, 0.92, 1], [1, 0.97, 0.9], [1, 0.84, 0.55], [1, 0.62, 0.35], [1, 0.45, 0.3]];
// t: 0 = hot blue ... 1 = cool red
export function starColor(t, k = 1, out = [0, 0, 0]) {
  const f = clamp(t, 0, 1) * 5, i = Math.min(4, f | 0), u = f - i;
  for (let c = 0; c < 3; c++) out[c] = (STOPS[i][c] + (STOPS[i + 1][c] - STOPS[i][c]) * u) * k;
  return out;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// A frame whose z axis is `n` (e1 x e2 = n).
function frame(tilt, yaw) {
  const n = [Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)];
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(ref, n));
  const e2 = cross(n, e1);
  return { n, e1, e2 };
}

const bright = () => 0.45 + Math.pow(rnd(), 3) * 1.0;
const pointSize = () => 0.07 + Math.pow(rnd(), 4) * 0.26;

// ---------------------------------------------------------------- a disc galaxy
// o: { x,y,z, vx,vy,vz, tilt, yaw, Rd, arms, pitch, M, eps, v0, rc, ns, ng, bar, pal, amp, name }
export function genDisc(sim, o) {
  o = Object.assign({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tilt: 0.35, yaw: rnd() * TAU, Rd: 4.2, arms: 2, pitch: 0.42,
    M: 10, eps: 1.0, v0: 2.35, rc: 2.5, ns: 24000, ng: 2400, bar: false, pal: 'milky', amp: 0.085, name: '',
    bulge: 0.17, maxR: 4.3,
  }, o);
  const { n, e1, e2 } = frame(o.tilt, o.yaw);
  const core = sim.addBody({
    type: 'core', x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz,
    m: o.M, eps: o.eps, v0: o.v0, rc: o.rc, glow: 7 * Math.sqrt(o.Rd / 4.2),
    color: o.pal === 'naiwa' ? [1, 0.86, 0.5] : [1, 0.82, 0.55], name: o.name, naiwa: o.pal === 'naiwa',
    rcap: o.pal === 'naiwa' ? 0.45 : 0, size: 1.6,
  });
  if (!core) return null;
  const vc2 = r => o.M * r * r / Math.pow(r * r + o.eps * o.eps, 1.5) + o.v0 * o.v0 * r * r / (r * r + o.rc * o.rc);
  const vc = r => Math.sqrt(vc2(r));
  const cot = 1 / Math.tan(o.pitch);
  const r0 = o.bar ? 4.4 : 1.5;
  const Rmax = o.Rd * o.maxR;
  const barPhase = rnd() * TAU;
  const omegaArm = 2.35 / (Rmax * 0.62);

  // density waves keep the arms alive for many orbits
  core.waves = [];
  if (o.arms > 0) core.waves.push({ cx: core, e1, e2, m: o.arms, c: cot, omega: omegaArm, amp: o.amp * 2 / o.arms, v0sq: o.v0 * o.v0, rm: Rmax * 0.5, rw: Rmax * 0.4, r0, rmax2: Rmax * Rmax * 1.7, t0: sim.time, phase: 0 });
  if (o.bar) core.waves.push({ cx: core, e1: [Math.cos(barPhase) * e1[0] + Math.sin(barPhase) * e2[0], Math.cos(barPhase) * e1[1] + Math.sin(barPhase) * e2[1], Math.cos(barPhase) * e1[2] + Math.sin(barPhase) * e2[2]], e2: [-Math.sin(barPhase) * e1[0] + Math.cos(barPhase) * e2[0], -Math.sin(barPhase) * e1[1] + Math.cos(barPhase) * e2[1], -Math.sin(barPhase) * e1[2] + Math.cos(barPhase) * e2[2]], m: 2, c: 0.12, omega: omegaArm * 1.9, amp: 0.14, v0sq: o.v0 * o.v0, rm: 3.2, rw: 2.0, r0: 3, rmax2: 100, t0: sim.time, phase: 0 });
  if (!core.waves.length) core.waves = null;

  const put = (lx, ly, lz, lvx, lvy, lvz, col, size, kind = 1) => {
    sim.addP(
      o.x + e1[0] * lx + e2[0] * ly + n[0] * lz, o.y + e1[1] * lx + e2[1] * ly + n[1] * lz, o.z + e1[2] * lx + e2[2] * ly + n[2] * lz,
      o.vx + e1[0] * lvx + e2[0] * lvy + n[0] * lvz, o.vy + e1[1] * lvx + e2[1] * lvy + n[1] * lvz, o.vz + e1[2] * lvx + e2[2] * lvy + n[2] * lvz,
      col[0], col[1], col[2], size, kind);
  };
  const tmp = [0, 0, 0];
  const naiwaPal = o.pal === 'naiwa';
  const armAngle = (r, k) => (TAU * k) / o.arms - cot * Math.log(r / r0) + (o.bar ? barPhase : 0);
  const sigma = r => 0.11 + 0.2 * Math.exp(-r / 5);
  const discR = () => {
    for (let t = 0; t < 8; t++) {
      const r = -o.Rd * (Math.log(rnd()) + Math.log(rnd()));
      if (r > 0.7 && r < Rmax) return r;
    }
    return 3 + rnd() * 4;
  };

  const bulgeN = Math.round(o.ns * o.bulge), barN = o.bar ? Math.round(o.ns * 0.14) : 0, haloN = Math.round(o.ns * 0.02);
  const discN = Math.max(0, o.ns - bulgeN - barN - haloN);

  for (let k = 0; k < discN; k++) {
    const r = discR();
    const inArm = o.arms > 0 && rnd() < 0.66;
    const th = inArm ? armAngle(r, (rnd() * o.arms) | 0) + gauss() * sigma(r) : rnd() * TAU;
    const v = vc(r);
    const tang = v * (1 + gauss() * 0.035), rad = gauss() * 0.05 * v;
    const c = Math.cos(th), s = Math.sin(th);
    const b = bright();
    if (naiwaPal) {
      if (inArm) { tmp[0] = 0.66 + rnd() * 0.15; tmp[1] = 0.82 + rnd() * 0.1; tmp[2] = 0.38 + rnd() * 0.2; }
      else { tmp[0] = 1; tmp[1] = 0.9 + rnd() * 0.05; tmp[2] = 0.62 + rnd() * 0.15; }
      tmp[0] *= b; tmp[1] *= b; tmp[2] *= b;
    } else starColor(inArm ? 0.02 + rnd() * 0.4 : 0.3 + rnd() * 0.55, b, tmp);
    put(r * c, r * s, gauss() * (0.1 + 0.014 * r), -tang * s + rad * c, tang * c + rad * s, gauss() * 0.05 * v, tmp, pointSize());
  }
  for (let k = 0; k < bulgeN; k++) {
    const a = 1.15;
    const u = clamp(rnd(), 0.03, 0.97);
    const r = a / Math.sqrt(Math.pow(u, -2 / 3) - 1);
    let dx = gauss(), dy = gauss(), dz = gauss() * 0.7;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l * r; dy = dy / l * r; dz = dz / l * r;
    const rr = Math.hypot(dx, dy) || 0.1, v = vc(Math.hypot(rr, dz));
    const sg = 0.4 * v, rot = 0.55 * v;
    starColor(0.5 + rnd() * 0.45, bright() * 0.95, tmp);
    if (naiwaPal) { tmp[2] *= 0.7; tmp[1] *= 0.97; }
    put(dx, dy, dz, -dy / rr * rot + gauss() * sg, dx / rr * rot + gauss() * sg, gauss() * sg, tmp, pointSize());
  }
  for (let k = 0; k < barN; k++) {
    const s = clamp(gauss() * 2.4, -5.2, 5.2), t = gauss() * 0.62;
    const lx = s * Math.cos(barPhase) - t * Math.sin(barPhase), ly = s * Math.sin(barPhase) + t * Math.cos(barPhase);
    const r = Math.hypot(lx, ly) || 0.3, v = vc(r) * 0.9, c = lx / r, sn = ly / r;
    starColor(0.35 + rnd() * 0.4, bright(), tmp);
    put(lx, ly, gauss() * 0.15, -v * sn, v * c, gauss() * 0.04, tmp, pointSize());
  }
  for (let k = 0; k < haloN; k++) {
    const r = 5 + rnd() * 16;
    let dx = gauss(), dy = gauss(), dz = gauss();
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l * r; dy = dy / l * r; dz = dz / l * r;
    const v = vc(r) * 0.55;
    starColor(0.45 + rnd() * 0.5, 0.45, tmp);
    put(dx, dy, dz, gauss() * v * 0.6, gauss() * v * 0.6, gauss() * v * 0.6, tmp, 0.08);
  }
  // gas & H II regions
  for (let k = 0; k < o.ng; k++) {
    const r = Math.min(Rmax, discR() * 1.05);
    const inArm = o.arms > 0 && rnd() < 0.85;
    const th = inArm ? armAngle(r, (rnd() * o.arms) | 0) + gauss() * sigma(r) * 0.8 : rnd() * TAU;
    const v = vc(r), c = Math.cos(th), s = Math.sin(th);
    const h = rnd(), br = 0.025 + rnd() * 0.05;
    if (naiwaPal) { tmp[0] = (0.5 + 0.4 * h) * br * 2; tmp[1] = (0.7 + 0.2 * h) * br * 2; tmp[2] = (0.3 + 0.2 * h) * br * 2; }
    else if (h < 0.55) { tmp[0] = 0.3 * br * 2; tmp[1] = 0.45 * br * 2; tmp[2] = 1.0 * br * 2; }
    else if (h < 0.85) { tmp[0] = 1.0 * br * 2; tmp[1] = 0.28 * br * 2; tmp[2] = 0.55 * br * 2; }
    else { tmp[0] = 0.9 * br * 2; tmp[1] = 0.55 * br * 2; tmp[2] = 1.0 * br * 2; }
    put(r * c, r * s, gauss() * 0.14, -v * s * 0.98, v * c * 0.98, 0, tmp, 0.7 + rnd() * 0.9, 2);
  }
  return core;
}

// ---------------------------------------------------------------- elliptical
export function genElliptical(sim, o) {
  o = Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ns: 26000, a: 3.6, flat: 0.68, M: 12, eps: 1.2, v0: 2.3, rc: 3, name: '' }, o);
  const core = sim.addBody({ type: 'core', x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz, m: o.M, eps: o.eps, v0: o.v0, rc: o.rc, glow: 8, color: [1, 0.78, 0.45], name: o.name });
  if (!core) return null;
  const tmp = [0, 0, 0];
  const yaw = rnd() * TAU, cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let k = 0; k < o.ns; k++) {
    const u = clamp(rnd(), 0.01, 0.985);
    const r = o.a / Math.sqrt(Math.pow(u, -2 / 3) - 1);
    let dx = gauss(), dy = gauss(), dz = gauss();
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l * r; dy = dy / l * r * o.flat; dz = dz / l * r;
    const v = Math.sqrt(o.M * r * r / Math.pow(r * r + o.eps * o.eps, 1.5) + o.v0 * o.v0 * r * r / (r * r + o.rc * o.rc));
    const sg = 0.55 * v / 1.2;
    starColor(0.45 + rnd() * 0.5, bright() * 0.9, tmp);
    sim.addP(o.x + dx * cy - dz * sy, o.y + dy, o.z + dx * sy + dz * cy,
      o.vx + gauss() * sg, o.vy + gauss() * sg * 0.8, o.vz + gauss() * sg, tmp[0], tmp[1], tmp[2], pointSize());
  }
  return core;
}

// ---------------------------------------------------------------- ring galaxy
export function genRing(sim, o) {
  o = Object.assign({ ns: 22000, R: 9.5, w: 1.1 }, o);
  const yaw = rnd() * TAU;
  const core = genDisc(sim, { ns: Math.round(o.ns * 0.25), ng: 0, arms: 0, bulge: 0.5, Rd: 1.6, M: 7, tilt: 0.5, yaw, v0: 2.35, name: o.name, maxR: 3 });
  const vc = r => Math.sqrt(7 * r * r / Math.pow(r * r + 1, 1.5) + 2.35 * 2.35 * r * r / (r * r + 6.25));
  const { n, e1, e2 } = frame(0.5, yaw);
  const tmp = [0, 0, 0];
  for (let k = 0; k < o.ns; k++) {
    const r = o.R + gauss() * o.w, th = rnd() * TAU, v = vc(r);
    const c = Math.cos(th), s = Math.sin(th), z = gauss() * 0.16;
    const knot = 0.5 + 0.5 * Math.sin(th * 7 + r);
    starColor(0.0 + rnd() * 0.35 + (1 - knot) * 0.15, bright() * (0.7 + 0.5 * knot), tmp);
    sim.addP(e1[0] * r * c + e2[0] * r * s + n[0] * z, e1[1] * r * c + e2[1] * r * s + n[1] * z, e1[2] * r * c + e2[2] * r * s + n[2] * z,
      (-e1[0] * s + e2[0] * c) * v + gauss() * 0.06, (-e1[1] * s + e2[1] * c) * v + gauss() * 0.06, (-e1[2] * s + e2[2] * c) * v + gauss() * 0.06,
      tmp[0], tmp[1], tmp[2], pointSize());
  }
  for (let k = 0; k < 1400; k++) {
    const r = o.R + gauss() * o.w * 0.8, th = rnd() * TAU, v = vc(r), c = Math.cos(th), s = Math.sin(th);
    const br = 0.03 + rnd() * 0.05;
    sim.addP(e1[0] * r * c + e2[0] * r * s, e1[1] * r * c + e2[1] * r * s, e1[2] * r * c + e2[2] * r * s,
      (-e1[0] * s + e2[0] * c) * v, (-e1[1] * s + e2[1] * c) * v, (-e1[2] * s + e2[2] * c) * v,
      0.4 * br * 2, 0.6 * br * 2, 1.0 * br * 2, 0.8 + rnd() * 0.8, 2);
  }
  return core;
}

// ---------------------------------------------------------------- big bang
export function genBigBang(sim, o) {
  o = Object.assign({ ns: 26000 }, o);
  sim.addBody({ type: 'core', m: 6, eps: 1.5, v0: 1.7, rc: 4, glow: 3, color: [1, 0.9, 0.7], name: '' });
  const tmp = [0, 0, 0];
  for (let k = 0; k < o.ns; k++) {
    let dx = gauss(), dy = gauss(), dz = gauss();
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const sp = 0.6 + Math.pow(rnd(), 0.7) * 9;
    const r = 0.1 + rnd() * 0.5;
    // a little swirl so it does not collapse back into a point
    sim.addP(dx * r, dy * r, dz * r, dx * sp - dz * 0.9, dy * sp, dz * sp + dx * 0.9, ...starColor(rnd() * 0.5, 0.6 + rnd() * 0.7, tmp), pointSize());
  }
  for (let k = 0; k < 1200; k++) {
    let dx = gauss(), dy = gauss(), dz = gauss();
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const sp = 0.5 + rnd() * 7;
    sim.addP(dx * 0.3, dy * 0.3, dz * 0.3, dx * sp, dy * sp, dz * sp, 0.12, 0.08, 0.18, 1 + rnd() * 0.8, 2);
  }
}

// ---------------------------------------------------------------- presets
export const PRESETS = [
  { key: 'milky', name: '银河系', build: (s, q) => genDisc(s, { arms: 4, pitch: 0.38, ns: 26000 * q, ng: 2600 * q, name: '银河系' }) },
  { key: 'spiral', name: '双旋臂星系', build: (s, q) => genDisc(s, { arms: 2, pitch: 0.43, ns: 26000 * q, ng: 2600 * q, amp: 0.09, tilt: 0.3, name: '双旋臂星系' }) },
  { key: 'barred', name: '棒旋星系', build: (s, q) => genDisc(s, { arms: 2, pitch: 0.36, bar: true, ns: 27000 * q, ng: 2600 * q, amp: 0.05, tilt: 0.3, name: '棒旋星系' }) },
  { key: 'elliptical', name: '椭圆星系', build: (s, q) => genElliptical(s, { ns: 26000 * q, name: '椭圆星系' }) },
  { key: 'ring', name: '环状星系', build: (s, q) => genRing(s, { ns: 22000 * q, name: '环状星系' }) },
  {
    key: 'collision', name: '星系碰撞', build: (s, q) => {
      genDisc(s, { x: -22, y: 0, z: -10, vx: 1.05, vz: 0.5, arms: 2, pitch: 0.45, Rd: 3.4, M: 8, v0: 2.1, ns: 13000 * q, ng: 1100 * q, tilt: 0.25, yaw: 0.4, name: '碰撞' });
      genDisc(s, { x: 22, y: 3, z: 10, vx: -1.05, vz: -0.5, arms: 2, pitch: 0.45, Rd: 3.2, M: 8, v0: 2.1, ns: 13000 * q, ng: 1100 * q, tilt: 1.15, yaw: 2.2, name: '碰撞' });
    },
  },
  { key: 'naiwa', name: '抱肚星云', build: (s, q) => genDisc(s, { arms: 2, pitch: 0.62, ns: 24000 * q, ng: 2800 * q, pal: 'naiwa', amp: 0.09, tilt: 0.45, Rd: 3.6, name: '抱肚星云' }) },
  { key: 'bigbang', name: '大爆炸', build: (s, q) => genBigBang(s, { ns: 26000 * q }) },
  { key: 'empty', name: '空白宇宙', build: () => {} },
];

export function buildPreset(sim, key, q = 1) {
  sim.clear();
  const p = PRESETS.find(x => x.key === key) || PRESETS[0];
  p.build(sim, q);
  return p;
}

// ---------------------------------------------------------------- player-made things
// Every spawner gets (sim, point{x,y,z}, velocity [vx,vy,vz], scale) and returns a short label.
const randTilt = () => ({ tilt: Math.acos(1 - 2 * rnd()), yaw: rnd() * TAU });

export const SPAWN = {
  galaxy(sim, p, v, s) {
    genDisc(sim, {
      x: p.x, y: p.y, z: p.z, vx: v[0], vy: v[1], vz: v[2], ...randTilt(),
      Rd: 1.5 * Math.sqrt(s), M: 2.5 * s, eps: 0.45, v0: 1.05 * Math.sqrt(s), rc: 1.1, ns: Math.round(4200 * s), ng: Math.round(360 * s),
      arms: 2, pitch: 0.45, amp: 0.05, name: '', maxR: 4, bulge: 0.2,
    });
  },
  star(sim, p, v, s) {
    const t = rnd(), col = starColor(t * 0.7, 1.2);
    const m = 1.5 * s;
    const b = sim.addBody({ type: 'star', x: p.x, y: p.y, z: p.z, vx: v[0], vy: v[1], vz: v[2], m, eps: 0.08, color: col, glow: 1.5 + s * 0.5, size: s });
    if (!b) return;
    const tilt = randTilt(), fr = frame(tilt.tilt, tilt.yaw);
    for (let k = 0; k < 7; k++) {
      const r = 0.3 + k * 0.17 + rnd() * 0.1, th = rnd() * TAU, c = Math.cos(th), sn = Math.sin(th);
      const vc = Math.sqrt(m * r * r / Math.pow(r * r + 0.0064, 1.5));
      const hue = rnd();
      sim.addP(p.x + (fr.e1[0] * c + fr.e2[0] * sn) * r, p.y + (fr.e1[1] * c + fr.e2[1] * sn) * r, p.z + (fr.e1[2] * c + fr.e2[2] * sn) * r,
        v[0] + (-fr.e1[0] * sn + fr.e2[0] * c) * vc, v[1] + (-fr.e1[1] * sn + fr.e2[1] * c) * vc, v[2] + (-fr.e1[2] * sn + fr.e2[2] * c) * vc,
        0.5 + hue * 0.5, 0.7 + hue * 0.2, 1 - hue * 0.5, 0.12, 1);
    }
  },
  cluster(sim, p, v, s) {
    const a = 0.7 * Math.sqrt(s), m = 4 * s;
    sim.addBody({ type: 'cluster', x: p.x, y: p.y, z: p.z, vx: v[0], vy: v[1], vz: v[2], m, eps: a, color: [0.7, 0.82, 1], glow: 3.2 * Math.sqrt(s), size: s });
    const n = Math.min(sim.room, Math.round(520 * s)), tmp = [0, 0, 0], golden = rnd() < 0.4;
    for (let k = 0; k < n; k++) {
      const u = clamp(rnd(), 0.02, 0.97), r = a * 1.5 / Math.sqrt(Math.pow(u, -2 / 3) - 1);
      let dx = gauss(), dy = gauss(), dz = gauss();
      const l = Math.hypot(dx, dy, dz) || 1;
      dx = dx / l * r; dy = dy / l * r; dz = dz / l * r;
      const vc = Math.sqrt(m * r * r / Math.pow(r * r + a * a, 1.5)) * 0.7;
      starColor(golden ? 0.5 + rnd() * 0.35 : rnd() * 0.45, 0.9 + rnd() * 0.6, tmp);
      sim.addP(p.x + dx, p.y + dy, p.z + dz, v[0] + gauss() * vc, v[1] + gauss() * vc, v[2] + gauss() * vc, tmp[0], tmp[1], tmp[2], 0.09 + rnd() * 0.1);
    }
  },
  bh(sim, p, v, s) {
    sim.addBody({ type: 'bh', x: p.x, y: p.y, z: p.z, vx: v[0], vy: v[1], vz: v[2], m: 15 * s, eps: 0.12, rcap: 0.34 * Math.sqrt(s), grow: 0.004, color: [1, 0.6, 0.25], glow: 2.6 * Math.sqrt(s), size: s });
  },
  nebula(sim, p, v, s) {
    const R = 1.7 * Math.sqrt(s), m = 2.4 * s;
    sim.addBody({ type: 'cloud', x: p.x, y: p.y, z: p.z, vx: v[0], vy: v[1], vz: v[2], m, eps: R * 0.9, color: [1, 0.45, 0.7], glow: R * 2.4, size: s });
    const n = Math.min(sim.room, Math.round(900 * s)), tone = rnd();
    for (let k = 0; k < n; k++) {
      let dx = gauss(), dy = gauss() * 0.7, dz = gauss();
      const r = Math.min(R * 1.6, Math.hypot(dx, dy, dz) * R * 0.55), l = Math.hypot(dx, dy, dz) || 1;
      dx = dx / l * r; dy = dy / l * r; dz = dz / l * r;
      const vc = Math.sqrt(m * r * r / Math.pow(r * r + R * R * 0.8, 1.5)) * 0.8;
      const h = rnd(), br = 0.04 + rnd() * 0.07;
      const col = tone < 0.5 ? [1.0, 0.3 + 0.3 * h, 0.55 + 0.4 * h] : [0.3 + 0.2 * h, 0.55 + 0.3 * h, 1.0];
      const i = sim.addP(p.x + dx, p.y + dy, p.z + dz, v[0] - dz / (r + 0.3) * vc + gauss() * 0.18, v[1] + gauss() * 0.12, v[2] + dx / (r + 0.3) * vc + gauss() * 0.18,
        col[0] * br * 2, col[1] * br * 2, col[2] * br * 2, 0.8 + rnd() * 0.9, 2);
      if (i >= 0 && rnd() < 0.28) {
        const t = sim.time + 2 + rnd() * 14;
        let at = sim.births.length;
        while (at > 0 && sim.births[at - 1].t > t) at--;
        sim.births.splice(at, 0, { t, i });
      }
    }
  },
  naiwa(sim, p, v, s) {
    sim.addBody({ type: 'naiwa', x: p.x, y: p.y, z: p.z, vx: v[0], vy: v[1], vz: v[2], m: 10 * s, eps: 0.5, rcap: 0.8 * Math.sqrt(s), grow: 0.0012, color: [1, 0.88, 0.55], glow: 3 * Math.sqrt(s), naiwa: true, size: 1.9 * Math.sqrt(s) });
  },
};
