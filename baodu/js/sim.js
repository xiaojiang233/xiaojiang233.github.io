// N-body-ish galaxy engine.
//
// Heavy "bodies" (galaxy cores, stars, black holes, clusters, Naiwa...) attract each other
// directly. The tens of thousands of stars and gas puffs are test particles: they feel every
// body but not each other, which keeps the whole thing running at 60 fps in plain JS.
// Each body can also carry a flat-rotation-curve halo (v0, rc) and density-wave "waves"
// (spiral arms / bars) so galaxies keep their arms for a long time.

export const MAXP = 80000;
export const MAXB = 64;
export const TAU = Math.PI * 2;
export const rnd = Math.random;
export const gauss = () => {
  let u = 0;
  while (!u) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd());
};
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class Sim {
  constructor() {
    this.pos = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.col0 = new Float32Array(MAXP * 3);
    this.size = new Float32Array(MAXP);
    this.size0 = new Float32Array(MAXP);
    this.kind = new Uint8Array(MAXP); // 0 dead, 1 star, 2 gas
    this.life = new Float32Array(MAXP);
    this.life0 = new Float32Array(MAXP);
    this.hi = 0; // high-water mark of used slots
    this.free = [];
    this.alive = 0;
    this.bodies = [];
    this.nextId = 1;
    this.time = 0;
    this.decay = [];
    this.births = [];
    this.stats = { swallowed: 0, hugged: 0 };
    this.onEvent = () => {};
    this._bx = new Float64Array(MAXB); this._by = new Float64Array(MAXB); this._bz = new Float64Array(MAXB);
    this._bm = new Float64Array(MAXB); this._be2 = new Float64Array(MAXB); this._bh = new Float64Array(MAXB);
    this._brc2 = new Float64Array(MAXB); this._bcap2 = new Float64Array(MAXB);
    this._ax = new Float64Array(MAXB); this._ay = new Float64Array(MAXB); this._az = new Float64Array(MAXB);
  }

  clear() {
    this.kind.fill(0);
    this.size.fill(0);
    this.hi = 0; this.free.length = 0; this.alive = 0;
    this.bodies.length = 0; this.decay.length = 0; this.births.length = 0;
    this.time = 0;
    this.stats.swallowed = 0; this.stats.hugged = 0;
  }

  // ---------------------------------------------------------------- particles
  addP(x, y, z, vx, vy, vz, r, g, b, size, kind = 1, life = 0) {
    let i;
    if (this.free.length) i = this.free.pop();
    else if (this.hi < MAXP) i = this.hi++;
    else return -1;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = this.col0[k] = r; this.col[k + 1] = this.col0[k + 1] = g; this.col[k + 2] = this.col0[k + 2] = b;
    this.size[i] = this.size0[i] = size;
    this.kind[i] = kind;
    this.life[i] = this.life0[i] = life;
    if (life > 0) this.decay.push(i);
    this.alive++;
    return i;
  }

  kill(i) {
    if (!this.kind[i]) return;
    this.kind[i] = 0; this.size[i] = 0; this.life[i] = 0;
    this.free.push(i);
    this.alive--;
  }

  get room() { return MAXP - this.alive; }

  // ---------------------------------------------------------------- bodies
  addBody(o) {
    if (this.bodies.length >= MAXB) return null;
    const b = Object.assign({
      id: this.nextId++, type: 'star', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      m: 1, eps: 0.3, v0: 0, rc: 2, rcap: 0, color: [1, 1, 1], glow: 2, fed: 0,
      pinned: false, waves: null, naiwa: false, size: 1, born: this.time,
    }, o);
    if (b.grow) { b.m0 = b.m; b.rcap0 = b.rcap; }
    this.bodies.push(b);
    return b;
  }

  removeBody(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  // Acceleration the bodies exert at a point; also reports the strongest contributor.
  field(x, y, z) {
    let ax = 0, ay = 0, az = 0, best = null, bestA = 0;
    for (const b of this.bodies) {
      if (b.pinned) continue;
      const dx = b.x - x, dy = b.y - y, dz = b.z - z;
      const r2 = dx * dx + dy * dy + dz * dz;
      const s = r2 + b.eps * b.eps;
      const f = b.m / (s * Math.sqrt(s)) + (b.v0 * b.v0) / (r2 + b.rc * b.rc);
      ax += dx * f; ay += dy * f; az += dz * f;
      const a = f * Math.sqrt(r2);
      if (a > bestA) { bestA = a; best = b; }
    }
    return { ax, ay, az, best };
  }

  // Velocity of a circular orbit around whatever dominates at this point (in the XZ-ish plane).
  orbitVelocity(x, y, z) {
    const { ax, ay, az, best } = this.field(x, y, z);
    if (!best) return [0, 0, 0];
    const a = Math.hypot(ax, ay, az);
    const r = Math.hypot(best.x - x, best.y - y, best.z - z);
    if (a < 1e-6 || r < 0.05) return [best.vx, best.vy, best.vz];
    const v = Math.sqrt(a * r);
    // tangent = up x (point - body): same spin sense as the galaxies (counter-clockwise from above)
    const tx = -(best.z - z), tz = best.x - x;
    const tl = Math.hypot(tx, tz) || 1;
    return [best.vx + (tx / tl) * v, best.vy, best.vz + (tz / tl) * v];
  }

  // ---------------------------------------------------------------- events
  supernova(x, y, z, power = 1) {
    const n = Math.min(this.room, Math.round(170 * Math.sqrt(power)));
    for (let k = 0; k < n; k++) {
      let dx = gauss(), dy = gauss(), dz = gauss();
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      const sp = (2.5 + rnd() * 4.5) * Math.sqrt(power);
      const h = rnd();
      const r = 1, g = 0.55 + h * 0.4, b = 0.25 + h * h * 0.6;
      this.addP(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, dx * sp, dy * sp, dz * sp,
        r * 0.5, g * 0.45, b * 0.42, 0.42 + rnd() * 0.3, 2, 6 + rnd() * 7);
    }
    // shove everything nearby outward
    const R = 18 * Math.sqrt(power), R2 = R * R, K = 16 * power;
    const P = this.pos, V = this.vel, kind = this.kind;
    for (let i = 0; i < this.hi; i++) {
      if (!kind[i]) continue;
      const k = i * 3;
      const dx = P[k] - x, dy = P[k + 1] - y, dz = P[k + 2] - z;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > R2 || r2 < 1e-6) continue;
      const r = Math.sqrt(r2);
      const imp = K / (r + 2.5) / r;
      V[k] += dx * imp; V[k + 1] += dy * imp; V[k + 2] += dz * imp;
    }
    for (const b of this.bodies) {
      if (b.pinned || b.v0 > 0) continue;
      const dx = b.x - x, dy = b.y - y, dz = b.z - z;
      const r = Math.hypot(dx, dy, dz);
      if (r > R || r < 1e-3) continue;
      const imp = (K * 0.35) / (r + 2.5) / r / Math.max(1, b.m * 0.15);
      b.vx += dx * imp; b.vy += dy * imp; b.vz += dz * imp;
    }
    this.onEvent({ type: 'sn', x, y, z, power });
  }

  erase(x, y, z, R) {
    const R2 = R * R, P = this.pos, kind = this.kind;
    let n = 0;
    for (let i = 0; i < this.hi; i++) {
      if (!kind[i]) continue;
      const k = i * 3;
      const dx = P[k] - x, dy = P[k + 1] - y, dz = P[k + 2] - z;
      if (dx * dx + dy * dy + dz * dz < R2) { this.kill(i); n++; }
    }
    return n;
  }

  // ---------------------------------------------------------------- stepping
  step(dt) {
    this.time += dt;
    this._stepBodies(dt);
    this._stepParticles(dt);
    this._stepLife(dt);
  }

  _stepBodies(dt) {
    const B = this.bodies, n = B.length;
    const ax = this._ax, ay = this._ay, az = this._az;
    for (let i = 0; i < n; i++) {
      const a = B[i];
      let fx = 0, fy = 0, fz = 0;
      if (!a.pinned) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const b = B[j];
          if (b.pinned && b.m <= 0) continue;
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const r2 = dx * dx + dy * dy + dz * dz;
          const s = r2 + b.eps * b.eps;
          const f = b.m / (s * Math.sqrt(s)) + (b.v0 * b.v0) / (r2 + b.rc * b.rc);
          fx += dx * f; fy += dy * f; fz += dz * f;
          // halos overlapping -> dynamical friction, so galaxies actually merge
          if (a.v0 > 0 && b.v0 > 0) {
            const ov = Math.exp(-r2 / 64);
            const k = 0.09 * ov * (b.v0 * b.v0) / (a.v0 * a.v0 + b.v0 * b.v0);
            fx -= (a.vx - b.vx) * k; fy -= (a.vy - b.vy) * k; fz -= (a.vz - b.vz) * k;
          }
        }
      }
      ax[i] = fx; ay[i] = fy; az[i] = fz;
    }
    for (let i = 0; i < n; i++) {
      const a = B[i];
      if (a.pinned) continue;
      a.vx += ax[i] * dt; a.vy += ay[i] * dt; a.vz += az[i] * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
    }
    // absorption + merging
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (a.grow && a.rcap0) a.rcap = a.rcap0 * Math.cbrt(a.m / a.m0);
      if (a.rcap > 0 && !a.pinned) {
        for (let j = 0; j < B.length; j++) {
          const b = B[j];
          if (i === j || (b.type === 'core' && a.type !== 'crunch') || b.pinned || b.m > a.m * 0.9) continue;
          if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) < a.rcap) {
            a.m += b.m * 0.6; a.fed += 1;
            this.onEvent({ type: 'eat', a, b });
            B.splice(j, 1);
            if (j < i) i--;
            j--;
          }
        }
      }
    }
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (a.type !== 'core') continue;
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        if (b.type !== 'core') continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const rel = Math.hypot(b.vx - a.vx, b.vy - a.vy, b.vz - a.vz);
        if (d < 1.1 && rel < 3.2) {
          const ma = a.m + a.v0 * a.v0, mb = b.m + b.v0 * b.v0, mt = ma + mb;
          a.x = (a.x * ma + b.x * mb) / mt; a.y = (a.y * ma + b.y * mb) / mt; a.z = (a.z * ma + b.z * mb) / mt;
          a.vx = (a.vx * ma + b.vx * mb) / mt; a.vy = (a.vy * ma + b.vy * mb) / mt; a.vz = (a.vz * ma + b.vz * mb) / mt;
          a.m += b.m; a.v0 = Math.sqrt(a.v0 * a.v0 + b.v0 * b.v0); a.rc = Math.max(a.rc, b.rc);
          a.eps = Math.max(a.eps, b.eps); a.waves = null; a.naiwa = a.naiwa || b.naiwa;
          a.glow = Math.max(a.glow, b.glow); a.fed += b.fed;
          B.splice(j, 1);
          this.onEvent({ type: 'merge', a });
          j--;
        }
      }
    }
  }

  _stepParticles(dt) {
    const B = this.bodies, nb = B.length;
    const bx = this._bx, by = this._by, bz = this._bz, bm = this._bm, be2 = this._be2, bh = this._bh, brc2 = this._brc2, bcap2 = this._bcap2;
    const waves = [];
    for (let j = 0; j < nb; j++) {
      const b = B[j];
      bx[j] = b.x; by[j] = b.y; bz[j] = b.z; bm[j] = b.m; be2[j] = b.eps * b.eps;
      bh[j] = b.v0 * b.v0; brc2[j] = b.rc * b.rc; bcap2[j] = b.rcap * b.rcap;
      if (b.waves) for (const w of b.waves) waves.push(w);
    }
    const nw = waves.length, t = this.time;
    const P = this.pos, V = this.vel, kind = this.kind, hi = this.hi;
    let swallowed = 0;
    for (let i = 0; i < hi; i++) {
      if (!kind[i]) continue;
      const k = i * 3;
      const x = P[k], y = P[k + 1], z = P[k + 2];
      let ax = 0, ay = 0, az = 0, eaten = -1;
      for (let j = 0; j < nb; j++) {
        const dx = bx[j] - x, dy = by[j] - y, dz = bz[j] - z;
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < bcap2[j]) { eaten = j; break; }
        const s = r2 + be2[j];
        const f = bm[j] / (s * Math.sqrt(s)) + bh[j] / (r2 + brc2[j]);
        ax += dx * f; ay += dy * f; az += dz * f;
      }
      if (eaten >= 0) {
        const b = B[eaten];
        b.fed++;
        swallowed++;
        if (b.grow) b.m += b.grow;
        if (b.naiwa) this.stats.hugged++;
        this.kill(i);
        continue;
      }
      for (let w = 0; w < nw; w++) {
        const W = waves[w];
        const dx = x - W.cx.x, dy = y - W.cx.y, dz = z - W.cx.z;
        const xl = dx * W.e1[0] + dy * W.e1[1] + dz * W.e1[2];
        const yl = dx * W.e2[0] + dy * W.e2[1] + dz * W.e2[2];
        const r2 = xl * xl + yl * yl;
        if (r2 < 0.36 || r2 > W.rmax2) continue;
        const r = Math.sqrt(r2);
        const th = Math.atan2(yl, xl);
        const psi = W.m * (th - W.omega * (t - W.t0) + W.c * Math.log(r / W.r0));
        const u = (r - W.rm) / W.rw;
        const e = Math.exp(-u * u);
        const g = W.amp * W.v0sq * e * Math.min(1, (t - W.t0) * 0.15);
        const gp = -2 * u / W.rw * g;
        const sn = Math.sin(psi), cs = Math.cos(psi);
        const fr = gp * cs - g * sn * W.m * W.c / r;
        const ft = -g * sn * W.m / r;
        const ux = xl / r, uy = yl / r;
        const fxl = fr * ux - ft * uy, fyl = fr * uy + ft * ux;
        ax += W.e1[0] * fxl + W.e2[0] * fyl; ay += W.e1[1] * fxl + W.e2[1] * fyl; az += W.e1[2] * fxl + W.e2[2] * fyl;
      }
      const vx = V[k] += ax * dt, vy = V[k + 1] += ay * dt, vz = V[k + 2] += az * dt;
      P[k] = x + vx * dt; P[k + 1] = y + vy * dt; P[k + 2] = z + vz * dt;
    }
    if (swallowed) this.stats.swallowed += swallowed;
  }

  _stepLife(dt) {
    const d = this.decay;
    let w = 0;
    for (let n = 0; n < d.length; n++) {
      const i = d[n];
      if (!this.kind[i] || this.life0[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const f = this.life[i] / this.life0[i];
      const k = i * 3, h = f * f;
      this.col[k] = this.col0[k] * h; this.col[k + 1] = this.col0[k + 1] * h; this.col[k + 2] = this.col0[k + 2] * h;
      this.size[i] = this.size0[i] * (0.5 + 0.9 * (1 - f));
      d[w++] = i;
    }
    d.length = w;
    // star birth in nebulae: gas puffs flicker into blue stars
    const bs = this.births;
    while (bs.length && bs[0].t <= this.time) {
      const { i } = bs.shift();
      if (this.kind[i] !== 2 || this.life0[i] > 0) continue;
      const k = i * 3, br = 0.7 + rnd() * 0.5;
      this.kind[i] = 1;
      this.col[k] = this.col0[k] = 0.55 * br; this.col[k + 1] = this.col0[k + 1] = 0.75 * br; this.col[k + 2] = this.col0[k + 2] = 1.0 * br;
      this.size[i] = this.size0[i] = 0.22 + rnd() * 0.12;
    }
  }
}
