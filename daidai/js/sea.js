import * as THREE from '../lib/three.bundle.js';
import { lerp, rng, canvasTex, TAU } from './util.js';
import { heightAt, rowAt } from './worldgen.js';

// The sea: one THREE.Water plane that rides along under the player, plus a
// height texture of the ground around the player so the shader can tint the
// shallows turquoise and roll foam onto every beach, island and lake shore.

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

const STEP = 2;          // metres per height texel
const SNAP = 32;         // the plane moves in 32 m steps (normals are sampled in world space anyway)

// --- shader patch: depth from the height texture → shallow colour + shore foam
const PARS = /* glsl */`
uniform sampler2D hTex; uniform vec4 hRect; uniform float hTexel;
uniform vec3 shallowCol; uniform vec3 sandCol; uniform vec3 foamTint; uniform float fTime;
float sHash(vec2 p){ p = mod(p, 289.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float sNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), f.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), f.x), f.y); }
`;
const DEPTH = /* glsl */`
  vec2 hUv = (worldPosition.xz - hRect.xy) / hRect.zw;
  vec2 hE = smoothstep(vec2(0.0), vec2(0.06), hUv) * smoothstep(vec2(1.0), vec2(0.94), hUv);
  float hIn = hE.x * hE.y;                       // fade to the plain deep sea at the edge of the texture
  float hC = texture2D(hTex, hUv).r;
  float depth = mix(60.0, -hC, hIn);
  // distance to the shore ≈ depth / seabed slope, so the foam strip is metres wide on any slope
  vec2 hG = vec2(texture2D(hTex, hUv + vec2(hTexel, 0.0)).r - texture2D(hTex, hUv - vec2(hTexel, 0.0)).r,
                 texture2D(hTex, hUv + vec2(0.0, hTexel)).r - texture2D(hTex, hUv - vec2(0.0, hTexel)).r) / (2.0 * ${STEP.toFixed(1)});
  float shoreD = depth / max(length(hG), 0.035);
  vec3 wCol = mix(sandCol, shallowCol, smoothstep(0.0, 0.9, depth));
  wCol = mix(wCol, waterColor, smoothstep(0.7, 4.5, depth));
  vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * wCol;
  reflectance *= mix(0.5, 1.0, smoothstep(0.2, 3.5, depth));   // see into the shallows a bit more
`;
// the old foam strip's look: a = 0 up the sand, 1 out at sea
const FOAM = /* glsl */`
  #include <tonemapping_fragment>
  {
    vec2 fp = worldPosition.xz;
    float a = (shoreD + 1.5) / 8.0;              // a bit wider than the old strip: the plane can't draw up on the sand
    float along = sNoise(fp * 0.03) * 40.0;
    float wob = sNoise(fp * 0.35 + vec2(fTime * 0.2, 0.0)) * 0.25 + sNoise(fp * 1.7 - vec2(0.0, fTime * 0.3)) * 0.08;
    float run = 0.24 + 0.2 * (0.5 + 0.5 * sin(fTime * 0.7 + along * 0.15));      // swash line breathing in and out
    float edge = smoothstep(run + 0.06, run, a + wob * 0.3) * smoothstep(0.0, 0.05, a);
    float bands = smoothstep(0.75, 1.0, sin((a * 16.0 - fTime * 1.6) + wob * 8.0)) * (1.0 - smoothstep(0.15, 0.9, a));
    float f = max(edge * 0.85, bands * 0.55);
    f *= 0.75 + 0.25 * sNoise(fp * 0.6 + a * 3.0);
    f *= hIn * smoothstep(-0.05, 0.03, depth) * (1.0 - smoothstep(2.5, 4.0, depth));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, foamTint, f);
  }
`;

function heightTex(n) {
  const t = new THREE.DataTexture(new Uint16Array(n * n), n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const _c = new THREE.Color();

export class Sea {
  constructor(scene, { low = false, renderer } = {}) {
    this.scene = scene; this.renderer = renderer; this.low = low;
    const water = this.water = new THREE.Water(new THREE.PlaneGeometry(9000, 9000), {
      textureWidth: low ? 512 : 1024, textureHeight: low ? 512 : 1024,
      waterNormals: waterNormals(),
      sunDirection: new THREE.Vector3(), sunColor: 0xffffff, waterColor: 0x0b4a63,
      distortionScale: 2.6, fog: false,
    });
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = false;
    const m = water.material, u = this.u = m.uniforms;
    u.size.value = 1.6;
    this.N = this.size(low);
    this.front = heightTex(this.N); this.back = null;
    Object.assign(u, {
      hTex: { value: this.front }, hRect: { value: new THREE.Vector4(1e9, 1e9, 1, 1) }, hTexel: { value: 1 / this.N },
      shallowCol: { value: new THREE.Color() }, sandCol: { value: new THREE.Color() },
      foamTint: { value: new THREE.Color(1, 1, 1) }, fTime: { value: 0 },
    });
    m.fragmentShader = m.fragmentShader
      .replace('varying vec4 worldPosition;', 'varying vec4 worldPosition;\n' + PARS)
      .replace('vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;', DEPTH)
      .replace('#include <tonemapping_fragment>', FOAM);
    m.needsUpdate = true;
    scene.add(water);
    this.cx = 1e9; this.cz = 1e9;   // centre of the finished texture
    this.job = null;
  }

  size(low) { return low ? 192 : 256; }   // 384 / 512 m at 2 m per texel

  // start filling the back buffer centred near (x, z)
  begin(x, z) {
    const N = this.N, W = N * STEP;
    if (!this.back || this.back.image.width !== N) { this.back?.dispose(); this.back = heightTex(N); }
    const cx = Math.round(x / 16) * 16, cz = Math.round(z / 16) * 16;
    this.job = { cx, cz, x0: cx - W / 2, z0: cz - W / 2, row: 0, col: 0, R: null, N };
  }

  // fill rows until the budget (ms) runs out; true when done
  work(budget) {
    const j = this.job, N = j.N, d = this.back.image.data, t0 = performance.now(), toHalf = THREE.DataUtils.toHalfFloat;
    while (j.row < N) {
      const z = j.z0 + (j.row + 0.5) * STEP, o = j.row * N, e = Math.min(N, j.col + 64);
      if (!j.R || j.col === 0) j.R = rowAt(z);
      for (let i = j.col; i < e; i++) {
        const h = heightAt(j.x0 + (i + 0.5) * STEP, z, j.R);
        d[o + i] = toHalf(h < -30 ? -30 : h > 30 ? 30 : h);
      }
      if (e === N) { j.row++; j.col = 0; } else j.col = e;
      if (performance.now() - t0 > budget) break;
    }
    if (j.row < N) return false;
    // swap: the finished buffer and its rect go live together, so no frame sees a half-filled texture
    const t = this.front; this.front = this.back; this.back = t;
    this.front.needsUpdate = true;
    this.u.hTex.value = this.front;
    this.u.hRect.value.set(j.x0, j.z0, N * STEP, N * STEP);
    this.u.hTexel.value = 1 / N;
    this.cx = j.cx; this.cz = j.cz; this.job = null;
    return true;
  }

  prime(x, z) {
    this.begin(x, z); this.work(Infinity);
    this.place(x, z);
  }

  place(x, z) { this.water.position.set(Math.round(x / SNAP) * SNAP, 0, Math.round(z / SNAP) * SNAP); }

  update(dt, time, focus, st, light) {
    const u = this.u, night = st.night || 0, tw = st.twilight || 0;
    this.place(focus.x, focus.z);
    u.time.value += dt * 0.55;
    u.fTime.value = time;
    u.sunDirection.value.copy(light.position).sub(focus).normalize();
    u.sunColor.value.copy(light.color).multiplyScalar(Math.min(1.2, light.intensity / 2.2));
    u.waterColor.value.setRGB(lerp(0.03, 0.005, night), lerp(0.2, 0.03, night), lerp(0.27, 0.07, night));
    // shallows: aquamarine over sand by day (bright enough to show through the sky reflection),
    // warmed by the low sun, sinking into the deep colour at night
    _c.setRGB(1, 1, 1);
    if (st.sunCol) _c.lerp(st.sunCol, 0.35 * tw);
    u.shallowCol.value.setRGB(0.07, 0.56, 0.52).multiply(_c).lerp(u.waterColor.value, night);
    u.sandCol.value.setRGB(0.42, 0.58, 0.44).multiply(_c).lerp(u.waterColor.value, night);
    u.foamTint.value.setRGB(1, 0.97, 0.92);
    if (st.sunCol) u.foamTint.value.lerp(st.sunCol, 0.25);
    u.foamTint.value.multiplyScalar(lerp(1, 0.22, night));

    // refresh the height texture once the player has used up a quarter of it
    const W = this.N * STEP;
    if (!this.job && Math.max(Math.abs(focus.x - this.cx), Math.abs(focus.z - this.cz)) > W / 4) this.begin(focus.x, focus.z);
    if (this.job) this.work(this.low ? 2 : 3);
  }

  setQuality(low) {
    if (low === this.low) return;
    this.low = low; this.N = this.size(low);
    this.job = null; this.cx = this.cz = 1e9;   // next update starts a refill at the new size
  }

  dispose() {
    this.scene.remove(this.water);
    this.water.geometry.dispose(); this.water.material.dispose();
    this.water.material.uniforms.normalSampler.value.dispose();
    this.front.dispose(); this.back?.dispose();
  }
}
