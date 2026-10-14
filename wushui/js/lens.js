// The nap pod's black hole: a full-screen fragment shader that bends every ray around a Schwarzschild
// hole (rs = 1), so the accretion disc really does wrap over the top and under the bottom as a halo.
import * as THREE from '../../daidai/lib/three.bundle.js';

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FS = /* glsl */`
precision highp float;
uniform vec2 uRes;
uniform float uTime, uBreath, uFeed, uDist, uTilt, uYaw, uFov, uCenterY, uSteps, uDim;
varying vec2 vUv;

float hash13(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= .5; } return s; }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y);
  return mix(a, b, f.z);
}

vec3 starLayer(vec3 d, float scale, float density, float size) {
  vec3 p = d * scale, g = floor(p), f = fract(p);
  float h = hash13(g);
  if (h > density) return vec3(0.0);
  vec3 o = vec3(hash13(g + 1.7), hash13(g + 3.1), hash13(g + 5.3)) * .6 + .2;
  float dist = length(f - o);
  float b = exp(-dist * dist / (size * size));
  float tw = .75 + .25 * sin(uTime * (1.0 + h * 5.0) + h * 40.0);
  vec3 c = mix(vec3(.65, .78, 1.0), vec3(1.0, .86, .62), hash13(g + 9.1));
  return c * b * tw * (.5 + 1.5 * hash13(g + 2.2));
}
vec3 background(vec3 d) {
  vec3 c = vec3(0.0);
  c += starLayer(d, 46.0, .10, .09) * 1.1;
  c += starLayer(d, 90.0, .18, .10) * .7;
  c += starLayer(d, 24.0, .05, .07) * 1.6;
  float band = dot(d, normalize(vec3(.35, .92, .18)));
  float n = vnoise3(d * 3.0 + 4.0) * .6 + vnoise3(d * 8.0) * .4;
  float mw = exp(-band * band * 9.0) * (.25 + n * .9);
  c += mw * mix(vec3(.30, .20, .55), vec3(.85, .62, .42), n) * .15;
  c += vec3(.006, .005, .016);
  return c;
}

vec3 discColor(float r, float ang, float t, vec3 dir, vec3 hit) {
  float rin = 2.6, rout = 10.5;
  float x = (r - rin) / (rout - rin);
  float temp = pow(1.0 - clamp(x, 0.0, 1.0), 2.0);
  // differential rotation: inner rings turn faster
  float w = 1.2 / pow(r, 1.5);
  float a = ang + t * w * 3.0;
  float streak = fbm(vec2(a * 2.2, r * 1.7)) * .75 + fbm(vec2(a * 7.0 + 3.0, r * 6.5)) * .7;
  float ring = .75 + .25 * sin(r * 5.0 - t * .5);
  float I = (.3 + temp * 2.1) * (.5 + streak) * ring;
  vec3 hot = vec3(1.0, .93, .74), mid = vec3(1.0, .56, .14), cool = vec3(.55, .36, .95);
  vec3 col = mix(cool, mid, smoothstep(0.0, .5, 1.0 - x));
  col = mix(col, hot, smoothstep(.55, 1.0, 1.0 - x));
  // relativistic beaming: the side moving toward us is brighter and bluer
  vec3 v = normalize(vec3(-hit.z, 0.0, hit.x));
  float beta = sqrt(.5 / r);
  float k = dot(v, -dir);
  float boost = pow(clamp(1.0 + 2.4 * beta * k, .25, 2.6), 2.0);
  col = mix(col, col * vec3(.85, .95, 1.25), clamp(k, 0.0, 1.0) * .5);
  return col * I * boost * (1.0 + .28 * uBreath + uFeed * .6);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  p.y -= uCenterY;
  vec3 camPos = uDist * vec3(sin(uYaw) * cos(uTilt), sin(uTilt), cos(uYaw) * cos(uTilt));
  vec3 fwd = normalize(-camPos);
  vec3 right = normalize(cross(fwd, vec3(0, 1, 0)));
  vec3 up = cross(right, fwd);
  float th = tan(uFov * .5);
  vec3 dir = normalize(fwd + (p.x * right + p.y * up) * th);

  vec3 pos = camPos;
  vec3 h = cross(pos, dir);
  float h2 = dot(h, h);
  vec3 col = vec3(0.0);
  float T = 1.0, minr = 1e3;
  bool done = false;
  for (int i = 0; i < 160; i++) {
    if (float(i) >= uSteps) break;
    float r2 = dot(pos, pos), r = sqrt(r2);
    minr = min(minr, r);
    if (r < 1.0) { T = 0.0; done = true; break; }
    if (r > 40.0 && dot(pos, dir) > 0.0) break;
    float dt = clamp(r * .075, .045, 1.1) * (r < 1.9 ? .55 : 1.0);
    vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
    vec3 ndir = normalize(dir + acc * dt);
    vec3 npos = pos + ndir * dt;
    if (pos.y * npos.y < 0.0) {
      float f = pos.y / (pos.y - npos.y);
      vec3 hit = mix(pos, npos, f);
      float rr = length(hit.xz);
      if (rr > 2.6 && rr < 10.5) {
        float al = smoothstep(2.6, 3.1, rr) * (1.0 - smoothstep(8.0, 10.5, rr));
        col += T * al * discColor(rr, atan(hit.z, hit.x), uTime, ndir, hit);
        T *= 1.0 - al * .62;
      }
    }
    pos = npos; dir = ndir;
    if (T < .02) break;
  }
  if (!done) col += T * background(dir);
  // soft glow hugging the photon sphere, breathing
  col += vec3(1.0, .62, .26) * exp(-pow((minr - 1.55) * 2.2, 2.0)) * (.14 + .1 * uBreath + uFeed * .25) * (done ? 0.0 : 1.0);
  col *= uDim;
  col = 1.0 - exp(-col * 1.05);
  col = pow(col, vec3(.4545));
  // subtle vignette
  col *= 1.0 - .35 * dot(vUv - .5, vUv - .5);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeLens() {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const U = {
    uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uBreath: { value: 0 }, uFeed: { value: 0 },
    uDist: { value: 15 }, uTilt: { value: 0.12 }, uYaw: { value: 0 }, uFov: { value: 1.0 }, uCenterY: { value: 0.1 },
    uSteps: { value: 110 }, uDim: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);

  const cp = new THREE.Vector3(), fw = new THREE.Vector3(), rt = new THREE.Vector3(), up = new THREE.Vector3(), rel = new THREE.Vector3();
  function basis() {
    const d = U.uDist.value, t = U.uTilt.value, y = U.uYaw.value;
    cp.set(d * Math.sin(y) * Math.cos(t), d * Math.sin(t), d * Math.cos(y) * Math.cos(t));
    fw.copy(cp).negate().normalize();
    rt.crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
    up.crossVectors(rt, fw);
  }
  return {
    uniforms: U,
    render(renderer, w, h) { U.uRes.value.set(w, h); renderer.render(scene, cam); },
    // world point -> css pixels on a w x h screen, plus the size in pixels of one world unit there
    project(x, y, z, w, h) {
      basis();
      rel.set(x, y, z).sub(cp);
      const th = Math.tan(U.uFov.value * .5), zc = rel.dot(fw);
      const px = rel.dot(rt) / (zc * th), py = rel.dot(up) / (zc * th) + U.uCenterY.value;
      return { x: w / 2 + px * h / 2, y: h / 2 - py * h / 2, unit: (h / 2) / (zc * th) };
    },
  };
}
