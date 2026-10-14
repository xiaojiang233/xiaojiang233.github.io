// Rendering helpers: the star field (GL points), the overlay of glows / black holes / shockwaves
// (instanced camera-facing quads, so size is not limited by the GPU's max point size).
import * as THREE from '../../daidai/lib/three.bundle.js';

const STAR_VS = /* glsl */`
attribute float size;
attribute vec3 color;
uniform float uScale;
uniform float uMin;
uniform float uMax;
varying vec3 vC;
varying float vK;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = size * uScale / max(-mv.z, 0.01);
  vK = clamp(s / uMin, 0.3, 1.0);
  gl_PointSize = size <= 0.0 ? 0.0 : clamp(s, uMin, uMax);
  gl_Position = (size <= 0.0 || mv.z > -0.05) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
  vC = color;
}`;
const STAR_FS = /* glsl */`
varying vec3 vC;
varying float vK;
uniform float uGain;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 3.2) * (1.0 - d2);
  gl_FragColor = vec4(vC * a * vK * uGain, 1.0);
}`;

export function makeStarField(sim) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(sim.pos, 3).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.BufferAttribute(sim.col, 3).setUsage(THREE.DynamicDrawUsage);
  const size = new THREE.BufferAttribute(sim.size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos); geo.setAttribute('color', col); geo.setAttribute('size', size);
  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1000 }, uMin: { value: 1.6 }, uMax: { value: 150 }, uGain: { value: 1.0 } },
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 1;
  return {
    points: pts, mat,
    upload() {
      geo.setDrawRange(0, sim.hi);
      pos.needsUpdate = col.needsUpdate = size.needsUpdate = true;
    },
  };
}

// Far backdrop of tiny stars
export function makeBackdrop() {
  const n = 2600, p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n).fill(0.0001);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), R = 5000;
    p[i * 3] = r * Math.cos(th) * R; p[i * 3 + 1] = u * R; p[i * 3 + 2] = r * Math.sin(th) * R;
    const b = 0.12 + Math.pow(Math.random(), 4) * 0.7, w = Math.random();
    c[i * 3] = b * (0.8 + 0.2 * w); c[i * 3 + 1] = b * 0.9; c[i * 3 + 2] = b * (1 - 0.2 * w);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(s, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 }, uMin: { value: 1.3 }, uMax: { value: 3 }, uGain: { value: 1 } },
  });
  // size must be > 0 for the shader to draw it; tiny size + min clamp gives a constant dot
  geo.getAttribute('size').array.fill(0.0001);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 0;
  return pts;
}

const OV_VS = /* glsl */`
attribute vec2 corner;
attribute vec3 iPos;
attribute vec3 iColor;
attribute float iSize;
attribute float iShape;
attribute float iAux;
uniform float uScale;
uniform float uMinPx;
varying vec2 vP;
varying vec3 vC;
varying float vShape;
varying float vAux;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float d = max(-mv.z, 0.01);
  float half_ = max(iSize * 0.5, uMinPx * 0.5 * d / uScale);
  mv.xy += corner * half_;
  gl_Position = (mv.z > -0.05) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
  vP = corner; vC = iColor; vShape = iShape; vAux = iAux;
}`;
const OV_FS = /* glsl */`
varying vec2 vP;
varying vec3 vC;
varying float vShape;
varying float vAux;
void main() {
  vec2 p = vP;
  float d2 = dot(p, p), d = sqrt(d2);
  if (d > 1.0) discard;
  float fade = 1.0 - smoothstep(0.82, 1.0, d);
  vec3 rgb = vec3(0.0);
  float alpha = 0.0;
  if (vShape < 0.5) {            // soft glow
    rgb = vC * exp(-d2 * 3.6) * fade;
  } else if (vShape < 1.5) {     // shockwave ring
    float r = vAux;
    float w = 0.05 + 0.05 * r;
    float ring = exp(-pow((d - r) / w, 2.0)) * pow(1.0 - r, 1.3);
    rgb = vC * ring * fade + vC * 0.25 * exp(-d2 * 6.0) * pow(1.0 - r, 3.0);
  } else if (vShape < 2.5) {     // black hole
    float shadow = 1.0 - smoothstep(0.17, 0.21, d);
    float ring = exp(-pow((d - 0.235) / 0.022, 2.0)) * 1.5;
    float de = length(vec2(p.x, p.y * 4.2));
    float disc = smoothstep(0.98, 0.26, de) * smoothstep(0.14, 0.22, de) * 1.25;
    float front = step(p.y, 0.0);
    disc *= max(1.0 - shadow, front * 0.9);
    vec3 hot = mix(vec3(1.0, 0.96, 0.82), vC, smoothstep(0.1, 0.8, de));
    float dop = 0.7 + 0.5 * p.x;
    rgb = (hot * disc * dop + vec3(1.0, 0.9, 0.7) * ring) * fade + vC * exp(-d2 * 9.0) * 0.22;
    alpha = shadow;
  } else if (vShape < 3.5) {     // bright star with spikes
    float spikes = exp(-abs(p.x) * 55.0) * exp(-abs(p.y) * 3.2) + exp(-abs(p.y) * 55.0) * exp(-abs(p.x) * 3.2);
    rgb = vC * (exp(-d2 * 30.0) * 1.3 + 0.32 * exp(-d2 * 4.5) + 0.7 * spikes) * fade;
  } else {                        // flash
    rgb = vC * exp(-d2 * 9.0) * fade * vAux;
  }
  gl_FragColor = vec4(rgb, alpha);
}`;

export const SHAPE = { glow: 0, ring: 1, bh: 2, star: 3, flash: 4 };

export function makeOverlay(max = 768) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const mk = (n, name) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, a);
    return a;
  };
  const A = { pos: mk(3, 'iPos'), col: mk(3, 'iColor'), size: mk(1, 'iSize'), shape: mk(1, 'iShape'), aux: mk(1, 'iAux') };
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: OV_VS, fragmentShader: OV_FS, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uScale: { value: 1000 }, uMinPx: { value: 8 } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  let n = 0;
  return {
    mesh, mat,
    begin() { n = 0; },
    add(x, y, z, r, g, b, size, shape, aux = 0) {
      if (n >= max) return;
      A.pos.setXYZ(n, x, y, z); A.col.setXYZ(n, r, g, b);
      A.size.setX(n, size); A.shape.setX(n, shape); A.aux.setX(n, aux);
      n++;
    },
    end() {
      geo.instanceCount = n;
      for (const k in A) A[k].needsUpdate = true;
    },
  };
}
