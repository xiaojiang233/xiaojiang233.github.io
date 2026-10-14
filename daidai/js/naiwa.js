import * as THREE from '../lib/three.bundle.js';
import { canvasTex, cssFilter, smooth, between, clamp } from './util.js';

// 奶蛙: a tall, pear-shaped yellow someone. No neck, the head is just the top
// of the body. Bulging green eyes on the sides of the head, a tiny snout, a
// big cream belly patch, olive hands and feet. Units are metres; the body is
// 0.78 tall from its bottom to the top of the head.

const BASE = {
  body: 0xf9cb45, top: 0xfcdc62, bottom: 0xeca634, belly: 0xf0dba6, bellyEdge: 0xd9bd82,
  limb: 0xf5c040, hand: 0x9a8550, iris: 0x9cc06e, pupil: 0x1a1a18, sclera: 0xf6f7ef, mouth: 0x6b4d22,
};

// Variants follow the CSS filters the homepage uses for the residents.
export const VARIANTS = {
  yellow: [0, 1, 1],
  pink: [-60, 0.9, 1.08],
  blue: [160, 0.9, 1],
  green: [55, 0.85, 1],
};

const PROFILE = [ // (radius, height) from the bottom up
  [0.0, 0.0], [0.13, 0.012], [0.215, 0.05], [0.268, 0.11], [0.292, 0.19], [0.295, 0.27], [0.282, 0.35],
  [0.252, 0.43], [0.213, 0.51], [0.181, 0.58], [0.16, 0.64], [0.146, 0.69], [0.129, 0.73], [0.099, 0.762], [0.055, 0.781], [0.0, 0.788],
];

function profilePoints(n = 64) {
  const curve = new THREE.CatmullRomCurve3(PROFILE.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  return curve.getSpacedPoints(n - 1).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
}
const PTS = profilePoints(72);
const vAtY = y => { // texture v for a body height (v is arc length along the profile)
  for (let i = 1; i < PTS.length; i++) if (PTS[i].y >= y) { const f = (y - PTS[i - 1].y) / (PTS[i].y - PTS[i - 1].y); return (i - 1 + f) / (PTS.length - 1); }
  return 1;
};
export const radiusAt = y => {
  for (let i = 1; i < PTS.length; i++) if (PTS[i].y >= y) { const f = (y - PTS[i - 1].y) / (PTS[i].y - PTS[i - 1].y); return PTS[i - 1].x + (PTS[i].x - PTS[i - 1].x) * f; }
  return 0;
};

// The body is a lathe that we push around: belly forward, back flatter,
// head leaning slightly forward, little snout bump at the front.
const bellyBulge = y => 1 + 0.21 * Math.exp(-((y - 0.27) ** 2) / 0.022);
function deform(x, y, z) {
  if (z > 0) z *= bellyBulge(y); else z *= 0.9;
  z *= 0.95;
  z += 0.035 * smooth(0.45, 0.76, y);
  if (z > 0) z += 0.026 * Math.exp(-((y - 0.655) ** 2) / 0.0005 - (x * x) / 0.0028);
  return [x, y, z];
}
export function surfacePoint(angle, y, push = 0) { // angle: 0 = front, + = to the character's left (x+)
  const r = radiusAt(y) + push;
  const [x, yy, z] = deform(Math.sin(angle) * r, y, Math.cos(angle) * r);
  return new THREE.Vector3(x, yy, z);
}

let bodyGeo = null;
function getBodyGeo() {
  if (bodyGeo) return bodyGeo;
  const SEG = 72;
  const g = new THREE.LatheGeometry(PTS, SEG, Math.PI, Math.PI * 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = deform(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  // weld the normals along the seam at the back
  const n = g.attributes.normal, rows = PTS.length;
  for (let j = 0; j < rows; j++) {
    const a = j, b = SEG * rows + j;
    const nx = n.getX(a) + n.getX(b), ny = n.getY(a) + n.getY(b), nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l); n.setXYZ(b, nx / l, ny / l, nz / l);
  }
  return (bodyGeo = g);
}

const texCache = {};
function bodyTexture(variant) {
  if (texCache[variant]) return texCache[variant];
  const f = VARIANTS[variant];
  const hex = k => '#' + cssFilter(BASE[k], ...f).getHexString(THREE.SRGBColorSpace);
  return (texCache[variant] = canvasTex(1024, 1024, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, hex('top')); grad.addColorStop(0.35, hex('body')); grad.addColorStop(1, hex('bottom'));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    // belly patch: an oval on the front (u = 0.5)
    const vy0 = 1 - vAtY(0.1), vy1 = 1 - vAtY(0.5);
    const cy = (vy0 + vy1) / 2 * h, ry = (vy0 - vy1) / 2 * h, cx = w / 2, rx = w * 0.17;
    g.save();
    g.filter = 'blur(2px)';
    g.fillStyle = hex('bellyEdge');
    g.beginPath(); g.ellipse(cx, cy + 3, rx + 5, ry + 5, 0, 0, Math.PI * 2); g.fill();
    const bg = g.createRadialGradient(cx - rx * 0.2, cy - ry * 0.25, 4, cx, cy, Math.max(rx, ry));
    bg.addColorStop(0, '#fff6dc'); bg.addColorStop(0.6, hex('belly')); bg.addColorStop(1, hex('bellyEdge'));
    g.fillStyle = bg;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // mouth: a short line under the snout
    const my = (1 - vAtY(0.636)) * h;
    g.strokeStyle = hex('mouth'); g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 34, my - 4); g.quadraticCurveTo(cx, my + 5, cx + 34, my - 4); g.stroke();
  }));
}

function eyeTexture(variant) {
  const key = 'eye-' + variant;
  if (texCache[key]) return texCache[key];
  const f = VARIANTS[variant];
  const hex = k => '#' + cssFilter(BASE[k], ...f).getHexString(THREE.SRGBColorSpace);
  return (texCache[key] = canvasTex(8, 256, (g, w, h) => {
    // v runs pole (top) to pole; the top pole points out of the head.
    g.fillStyle = hex('sclera'); g.fillRect(0, 0, w, h);
    const ig = g.createLinearGradient(0, 30, 0, 70);
    ig.addColorStop(0, '#6e9a48'); ig.addColorStop(0.5, hex('iris')); ig.addColorStop(1, '#5d8740');
    g.fillStyle = ig; g.fillRect(0, 28, w, 44);
    g.fillStyle = '#3f5a2a'; g.fillRect(0, 70, w, 4);
    g.fillStyle = hex('pupil'); g.fillRect(0, 0, w, 30);
  }));
}

const matCache = {};
function mats(variant, gold) {
  const key = variant + (gold ? '-gold' : '');
  if (matCache[key]) return matCache[key];
  const f = VARIANTS[variant];
  const col = k => cssFilter(BASE[k], ...f);
  if (gold) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.28 });
    return (matCache[key] = { body: m, limb: m, hand: new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 1, roughness: 0.35 }), eye: m, socket: m });
  }
  return (matCache[key] = {
    body: new THREE.MeshPhysicalMaterial({ map: bodyTexture(variant), roughness: 0.48, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: col('top'), sheenRoughness: 0.6 }),
    socket: new THREE.MeshPhysicalMaterial({ color: col('top'), roughness: 0.45, clearcoat: 0.3 }),
    limb: new THREE.MeshPhysicalMaterial({ color: col('limb'), roughness: 0.5, clearcoat: 0.25 }),
    hand: new THREE.MeshStandardMaterial({ color: col('hand'), roughness: 0.62 }),
    eye: new THREE.MeshPhysicalMaterial({ map: eyeTexture(variant), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  });
}

// shared limb geometry
const G = {};
function geos() {
  if (G.upper) return G;
  G.upper = new THREE.CapsuleGeometry(0.043, 0.13, 6, 14);
  G.fore = new THREE.CapsuleGeometry(0.04, 0.13, 6, 14);
  G.thigh = new THREE.CapsuleGeometry(0.058, 0.13, 6, 14);
  G.shin = new THREE.CapsuleGeometry(0.05, 0.13, 6, 14);
  // hand: palm + three stubby fingers + thumb, built pointing along +Y (fingers at +Y)
  {
    const parts = [];
    const palm = new THREE.SphereGeometry(0.042, 16, 12); palm.scale(1, 1.05, 0.72); parts.push(palm);
    for (let i = 0; i < 3; i++) {
      const fg = new THREE.CapsuleGeometry(0.0135, 0.032, 4, 8);
      fg.rotateX(0.5); fg.translate((i - 1) * 0.026, 0.045, 0.012); parts.push(fg);
    }
    const th = new THREE.CapsuleGeometry(0.014, 0.025, 4, 8); th.rotateZ(-0.9); th.translate(0.04, 0.012, 0.012); parts.push(th);
    G.hand = mergeAll(parts);
  }
  // foot: wide flat paw with three toes, toes towards +Z
  {
    const parts = [];
    const sole = new THREE.SphereGeometry(0.06, 18, 12); sole.scale(1.05, 0.55, 1.45); sole.translate(0, 0.0, 0.035); parts.push(sole);
    for (let i = 0; i < 3; i++) {
      const toe = new THREE.SphereGeometry(0.026, 12, 8); toe.scale(1, 0.75, 1.2); toe.translate((i - 1) * 0.036, -0.005, 0.11 - Math.abs(i - 1) * 0.012); parts.push(toe);
    }
    G.foot = mergeAll(parts);
  }
  G.eyeball = new THREE.SphereGeometry(0.038, 24, 16);
  G.socket = new THREE.SphereGeometry(0.05, 20, 14);
  G.joint = new THREE.SphereGeometry(1, 12, 8);
  return G;
}
function mergeAll(parts) {
  const ps = parts.map(p => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; });
  return THREE.mergeGeometries(ps);
}

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _j = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

export class Naiwa {
  constructor({ variant = 'yellow', gold = false, shadow = true } = {}) {
    const g = geos(), m = mats(variant, gold);
    this.root = new THREE.Group();
    this.body = new THREE.Mesh(getBodyGeo(), m.body);
    this.root.add(this.body);
    // eyes sit on the upper sides of the head, looking out and a bit forward
    this.eyes = [];
    for (const s of [-1, 1]) {
      const ang = s * 0.98, y = 0.695;
      const c = surfacePoint(ang, y, -0.012);
      const out = surfacePoint(ang, y, 0.1).sub(c).normalize();
      const socket = new THREE.Mesh(g.socket, m.socket);
      socket.position.copy(c); socket.scale.set(1, 1, 1);
      const eye = new THREE.Mesh(g.eyeball, m.eye);
      eye.position.copy(c).addScaledVector(out, 0.03);
      const look = out.clone(); look.z += 0.35; look.y += 0.05; look.normalize();
      eye.quaternion.setFromUnitVectors(Y, look);
      this.body.add(socket, eye);
      this.eyes.push(eye);
    }
    this.limbs = {};
    const add = (k, geo, mat) => { const o = new THREE.Mesh(geo, mat); this.root.add(o); this.limbs[k] = o; return o; };
    for (const s of ['L', 'R']) {
      add('upper' + s, g.upper, m.limb); add('fore' + s, g.fore, m.limb); add('hand' + s, g.hand, m.hand);
      add('thigh' + s, g.thigh, m.limb); add('shin' + s, g.shin, m.limb); add('foot' + s, g.foot, m.hand);
      const e = add('elbow' + s, g.joint, m.limb); e.scale.setScalar(0.041);
      const k = add('knee' + s, g.joint, m.limb); k.scale.setScalar(0.054);
    }
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = shadow; o.receiveShadow = true; } });
    this.len = { upper: 0.17, fore: 0.17, thigh: 0.18, shin: 0.18 };
  }

  // body-local anchor points (+x = character's left, +z = front)
  static SHOULDER = [new THREE.Vector3(0.19, 0.455, -0.005), new THREE.Vector3(-0.19, 0.455, -0.005)];
  static HIP = [new THREE.Vector3(0.11, 0.08, 0.06), new THREE.Vector3(-0.11, 0.08, 0.06)];

  anchor(local, out) {
    this.body.updateMatrix();
    return out.copy(local).applyMatrix4(this.body.matrix);
  }

  // Two-bone IK in root space. `pole` is the direction the joint bends towards.
  static solve(A, B, l1, l2, pole, J) {
    _d.subVectors(B, A);
    let d = _d.length();
    const dmax = l1 + l2 - 1e-4, dmin = Math.abs(l1 - l2) + 1e-3;
    if (d > dmax) { B = _b.copy(A).addScaledVector(_d, dmax / d); d = dmax; }
    else if (d < dmin) d = dmin;
    _d.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
    J.copy(A).addScaledVector(_d, a).addScaledVector(_p, h);
    return B;
  }

  arm(side, target, pole, handUp) {
    const i = side === 'L' ? 0 : 1, L = this.limbs;
    const A = this.anchor(Naiwa.SHOULDER[i], new THREE.Vector3());
    const J = new THREE.Vector3();
    const B = Naiwa.solve(A, target.clone(), this.len.upper, this.len.fore, pole, J).clone();
    between(L['upper' + side], A, J);
    between(L['fore' + side], J, B);
    L['elbow' + side].position.copy(J);
    const hand = L['hand' + side];
    hand.position.copy(B);
    const dir = _a.subVectors(B, J).normalize();
    // fingers continue along the forearm, palm faces `handUp`'s opposite
    const up = handUp || _j.set(0, 1, 0);
    const z = new THREE.Vector3().crossVectors(dir, up).normalize();
    const x = new THREE.Vector3().crossVectors(dir, z).normalize();
    _m.makeBasis(x, dir, z);
    hand.quaternion.setFromRotationMatrix(_m);
    hand.position.addScaledVector(dir, 0.02);
  }

  leg(side, ankle, pole, footFwd, footUp) {
    const i = side === 'L' ? 0 : 1, L = this.limbs;
    const A = this.anchor(Naiwa.HIP[i], new THREE.Vector3());
    const J = new THREE.Vector3();
    const B = Naiwa.solve(A, ankle.clone(), this.len.thigh, this.len.shin, pole, J).clone();
    between(L['thigh' + side], A, J);
    between(L['shin' + side], J, B);
    L['knee' + side].position.copy(J);
    const foot = L['foot' + side];
    foot.position.copy(B);
    const fz = footFwd.clone().normalize();
    const fy = (footUp || Y).clone().addScaledVector(fz, -(footUp || Y).dot(fz)).normalize();
    const fx = new THREE.Vector3().crossVectors(fy, fz);
    _m.makeBasis(fx, fy, fz);
    foot.quaternion.setFromRotationMatrix(_m);
  }

  // Hands resting on the belly, the signature pose.
  hug(t = 0) {
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const tgt = this.anchor(surfacePoint(sg * 0.62, 0.27 + Math.sin(t * 1.3) * 0.005, 0.055), new THREE.Vector3());
      const pole = this.anchor(new THREE.Vector3(sg * 1, -0.6, -0.4), new THREE.Vector3()).sub(this.anchor(new THREE.Vector3(), new THREE.Vector3()));
      const inward = this.anchor(new THREE.Vector3(-sg, 0.2, 0.9), new THREE.Vector3()).sub(this.anchor(new THREE.Vector3(), new THREE.Vector3())).normalize();
      this.arm(s, tgt, pole, inward);
    }
  }

  // Standing on the ground (root y = 0 is the floor).
  stand() {
    this.body.position.set(0, 0.24, 0);
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      this.leg(s, new THREE.Vector3(sg * 0.12, 0.05, 0.05), new THREE.Vector3(sg * 0.3, 0, 1), new THREE.Vector3(sg * 0.25, 0, 1));
    }
    this.hug();
  }

  // Sitting on something at seat height `h` (root y = 0 is the floor), legs hanging.
  sit(h = 0.45, dangle = false) {
    this.body.position.set(0, h - 0.01, -0.05);
    this.body.rotation.x = -0.06;
    for (const [s, sg] of [['L', 1], ['R', -1]]) {
      const ank = dangle ? new THREE.Vector3(sg * 0.15, h - 0.28, 0.26) : new THREE.Vector3(sg * 0.15, 0.05, 0.28);
      this.leg(s, ank, new THREE.Vector3(sg * 0.4, 0.4, 1), new THREE.Vector3(sg * 0.2, dangle ? -0.6 : 0, 1));
    }
    this.hug();
  }

  blink(open) { for (const e of this.eyes) e.scale.set(1, open, 1); }
}
