import * as THREE from '../../daidai/lib/three.bundle.js';
import { Sim, MAXP, rnd, clamp } from './sim.js';
import { PRESETS, buildPreset, SPAWN, starColor } from './gen.js';
import { makeStarField, makeBackdrop, makeOverlay, SHAPE } from './render.js';
import { Sound } from './audio.js';
import { tr, trp, setLang, pickLang, lang } from './i18n.js';
import { injectIcons, icon } from './icons.js';
import { TECHS, TECH_T, FORMS, TEMPERS, QUIRKS, ATTITUDES, attitudeIdx, aggressionOf, curiosityOf, techLevel, describe, speciesName, population, fmtPop } from './civ.js';

injectIcons();
const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', touch);

// ------------------------------------------------------------------ quality
const QUALS = [['低', 0.55], ['中', 1], ['高', 1.5]];
let qi = touch ? 0 : 1;
if (qs.get('q') === 'low') qi = 0; else if (qs.get('q') === 'high') qi = 2;
try { const s = localStorage.getItem('baodu-q'); if (!qs.get('q') && s !== null && QUALS[+s]) qi = +s; } catch (e) {}

// ------------------------------------------------------------------ state
const S = {
  mode: 'look', tool: { create: 'galaxy', destroy: 'nova' }, paused: false, speedLog: 0,
  scale: 1, planeY: 0, autoOrbit: true, grid: true, spin: true, preset: 'milky', sound: true, civ: true,
};
if (qs.get('civ') === '0') S.civ = false;
else { try { if (!qs.get('civ') && localStorage.getItem('baodu-civ') === '0') S.civ = false; } catch (e) {} }
const CREATE = [
  ['galaxy', 'galaxy', '星系', '放下一个小星系。按住拖动再松开，可以把它扔出去。'],
  ['star', 'star', '恒星', '放下一颗恒星，身边带着几颗小行星。'],
  ['cluster', 'cluster', '星团', '放下一团密密的星团。'],
  ['bh', 'bh', '黑洞', '放下一个黑洞。离它太近的星星都会被吞掉。'],
  ['nebula', 'nebula', '星云', '放下一团星云，里面会慢慢长出新的蓝色星星。'],
  ['naiwa', 'naiwa', '奶蛙', '放下一只奶蛙。它会把路过的星星都抱进肚子里。'],
];
const DESTROY = [
  ['nova', 'nova', '超新星', '点一下引爆超新星，把周围的星星炸飞。点中恒星会让它消失。'],
  ['erase', 'eraser', '橡皮擦', '按住拖动，擦掉经过的星星。'],
  ['remove', 'remove', '移除天体', '点一个天体把它拿走。拿走星系核心后，星星会四散飞出。'],
  ['grab', 'grab', '引力抓取', '按住不放，用一个看不见的引力源把星星拽向光标。'],
];
const NAMES = { core: '星系核心', star: '恒星', bh: '黑洞', cluster: '星团', cloud: '星云', naiwa: '奶蛙', crunch: '大坍缩' };

// ------------------------------------------------------------------ language
const i18nEls = [...document.querySelectorAll('[data-i18n]')].map(el => [el, el.innerHTML]);
let refreshUI = () => {};
function applyLang() {
  i18nEls.forEach(([el, zh]) => { el.innerHTML = tr(zh); });
  document.title = trp('抱肚星云 · 银河模拟器') + ' · 奶蛙.space';
  document.querySelector('meta[name=description]').content = trp('抱肚星云是一台 3D 银河模拟器。生成星系、恒星和黑洞，也可以引爆超新星，把一切都抱进肚子里。');
  document.querySelectorAll('[data-lang]').forEach(a => a.classList.toggle('on', a.dataset.lang === lang));
  $('back').href = '../?lang=' + lang;
  refreshUI();
}
setLang(pickLang(), false);
document.querySelectorAll('[data-lang]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  setLang(a.dataset.lang, true);
  history.replaceState(null, '', '?lang=' + lang);
  applyLang();
}));

// ------------------------------------------------------------------ renderer
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = `<div class="err">${tr('你的浏览器好像不支持 WebGL，抱肚星云暂时看不到。')}</div>`;
  throw e;
}
renderer.setClearColor(0x02030a, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30000);
let dpr = 1;
function resize() {
  dpr = Math.min(devicePixelRatio || 1, qi === 2 ? 2 : qi === 1 ? 1.5 : 1.25);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const sim = new Sim();
sim.civOn = S.civ;
const sound = new Sound();
const field = makeStarField(sim);
const overlay = makeOverlay();
scene.add(makeBackdrop(), field.points, overlay.mesh);

// reference rings on the placement plane
const rings = new THREE.Group();
{
  const mat = new THREE.LineBasicMaterial({ color: 0x7080c0, transparent: true, opacity: 0.16, depthTest: false });
  for (const r of [5, 10, 15, 20, 28]) {
    const pts = [];
    for (let i = 0; i <= 96; i++) pts.push(new THREE.Vector3(Math.cos(i / 96 * Math.PI * 2) * r, 0, Math.sin(i / 96 * Math.PI * 2) * r));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    l.renderOrder = 0;
    rings.add(l);
  }
  const axis = [[-28, 0, 0, 28, 0, 0], [0, 0, -28, 0, 0, 28]];
  for (const a of axis) rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(a[3], a[4], a[5])]), mat));
}
scene.add(rings);

// cursor ghost + slingshot line
const ghostMat = new THREE.LineBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.9, depthTest: false });
const ghost = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, i) => new THREE.Vector3(Math.cos(i / 64 * Math.PI * 2), 0, Math.sin(i / 64 * Math.PI * 2)))), ghostMat);
ghost.renderOrder = 5; ghost.visible = false;
const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.35, depthTest: false }));
drop.renderOrder = 5; drop.visible = false;
const sling = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), ghostMat);
sling.renderOrder = 5; sling.visible = false; sling.frustumCulled = false;
scene.add(ghost, drop, sling);

// naiwa sprites
const naiwaTex = new THREE.TextureLoader().load('../naiwa.png');
naiwaTex.colorSpace = THREE.SRGBColorSpace;
const sprites = new Map();
function spriteFor(b) {
  let s = sprites.get(b.id);
  if (!s) {
    s = new THREE.Sprite(new THREE.SpriteMaterial({ map: naiwaTex, transparent: true, depthTest: false, depthWrite: false }));
    s.renderOrder = 4;
    scene.add(s);
    sprites.set(b.id, s);
  }
  return s;
}

// war beams: one line per ongoing war / trade route
const MAXW = 60;
const beamPos = new Float32Array(MAXW * 6), beamCol = new Float32Array(MAXW * 6);
const beamGeo = new THREE.BufferGeometry();
beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPos, 3).setUsage(THREE.DynamicDrawUsage));
beamGeo.setAttribute('color', new THREE.BufferAttribute(beamCol, 3).setUsage(THREE.DynamicDrawUsage));
const beams = new THREE.LineSegments(beamGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
beams.frustumCulled = false; beams.renderOrder = 3;
scene.add(beams);

// ------------------------------------------------------------------ camera
const cam = { yaw: 0.55, pitch: 0.7, dist: 44, distGoal: 44, target: new THREE.Vector3(), follow: null, fp: null, shake: 0 };
const tmpV = new THREE.Vector3();
function placeCamera(dt) {
  cam.dist += (cam.distGoal - cam.dist) * (1 - Math.exp(-dt * 9));
  if (cam.follow) {
    if (!sim.bodies.includes(cam.follow)) setFollow(null);
    else cam.target.lerp(tmpV.set(cam.follow.x, cam.follow.y, cam.follow.z), 1 - Math.exp(-dt * 6));
  } else if (cam.fp) {
    if (!sim._valid(cam.fp.i, cam.fp.seed)) { toast('这颗星星熄灭了。'); setFollow(null); }
    else { const k = cam.fp.i * 3; cam.target.lerp(tmpV.set(sim.pos[k], sim.pos[k + 1], sim.pos[k + 2]), 1 - Math.exp(-dt * 6)); }
  }
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + cam.dist * cp * Math.sin(cam.yaw), cam.target.y + cam.dist * Math.sin(cam.pitch), cam.target.z + cam.dist * cp * Math.cos(cam.yaw));
  if (cam.shake > 0.002) {
    camera.position.x += (rnd() - 0.5) * cam.shake; camera.position.y += (rnd() - 0.5) * cam.shake; camera.position.z += (rnd() - 0.5) * cam.shake;
    cam.shake *= Math.exp(-dt * 4);
  }
  camera.lookAt(cam.target);
}
function homeView(snap) {
  setFollow(null);
  cam.target.set(0, 0, 0);
  cam.distGoal = S.preset === 'collision' ? 62 : S.preset === 'bigbang' ? 36 : S.preset === 'empty' ? 30 : 44;
  if (snap) cam.dist = cam.distGoal;
}
function setFollow(b) {
  cam.follow = b;
  cam.fp = null;
  $('focus').style.display = b ? 'block' : 'none';
  updateCard();
}
// follow one star particle (and open its civilization card)
function setFollowStar(i) {
  cam.follow = null;
  cam.fp = { i, seed: sim.seed[i], lvl: sim.lvl[i] };
  $('focus').style.display = 'block';
  updateCard();
}
const speciesOf = seed => tr('{n}族', { n: speciesName(describe(seed), lang) });

// ------------------------------------------------------------------ toast
let toastT = 0;
const told = new Set();
function toast(zh, vars, once) {
  if (once) { if (told.has(once)) return; told.add(once); }
  $('toastText').innerHTML = tr(zh, vars);
  $('toast').classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => $('toast').classList.remove('show'), 3200);
}

// ------------------------------------------------------------------ fx
const fx = [];
function addFx(shape, x, y, z, col, s0, s1, life, delay = 0) { fx.push({ shape, x, y, z, col, s0, s1, life, age: -delay }); }
let newsT = -99;
// civilization news: always shown when it concerns the followed star, otherwise at most one every few seconds
function news(zh, vars, mine) {
  if (!mine && tAbs - newsT < 7) return;
  newsT = tAbs;
  toast(zh, vars);
}
const mineOf = (a, b) => !!(cam.fp && (cam.fp.i === a || cam.fp.i === b));
function onScreen(x, y, z) { const s = screenOf(x, y, z); return !!s && s[0] > 0 && s[0] < innerWidth && s[1] > 0 && s[1] < innerHeight; }
sim.onEvent = ev => {
  if (ev.type === 'sn') {
    const k = Math.sqrt(ev.power);
    addFx(SHAPE.flash, ev.x, ev.y, ev.z, [1, 0.92, 0.75], 9 * k, 16 * k, 0.9);
    addFx(SHAPE.ring, ev.x, ev.y, ev.z, [1, 0.7, 0.4], 2, 44 * k, 2.4);
    addFx(SHAPE.ring, ev.x, ev.y, ev.z, [0.6, 0.75, 1], 2, 30 * k, 1.8, 0.18);
    if (ev.power >= 0.5) { sound.boom(); cam.shake = Math.max(cam.shake, 0.45 * k); }
    else if (onScreen(ev.x, ev.y, ev.z)) sound.swoosh();
  } else if (ev.type === 'battle') {
    if (fx.length < 90) addFx(SHAPE.flash, ev.x, ev.y, ev.z, [1, 0.45, 0.25], 1.4, 3.2, 0.5);
  } else if (ev.type === 'war-start') {
    const A = speciesOf(sim.seed[ev.a]), B = speciesOf(sim.seed[ev.b]), mine = mineOf(ev.a, ev.b);
    if (ev.kind === 'war') news('{a}向{b}宣战了！', { a: A, b: B }, mine);
    else if (mine) news('{a}与{b}开始通商。', { a: A, b: B }, true);
    updateCard();
  } else if (ev.type === 'trade-end') {
    if (mineOf(ev.a, ev.b)) news('{a}与{b}的贸易让双方都学到了新东西。', { a: speciesOf(ev.sa), b: speciesOf(ev.sb) }, true);
    updateCard();
  } else if (ev.type === 'war-end') {
    const A = speciesOf(ev.sa), B = speciesOf(ev.sb), mine = mineOf(ev.a, ev.b), v = { a: A, b: B };
    const k = ev.b * 3;
    if (ev.star) news('{a}击碎了{b}的恒星。一团光吞没了附近的世界。', v, true);
    else if (ev.result === 'a') news('{a}击败了{b}，{b}的文明陷入废墟。', v, mine);
    else if (ev.result === 'b') news('{b}击退了{a}的进攻，{a}的文明陷入废墟。', v, mine);
    else if (ev.result === 'both') news('{a}与{b}同归于尽，两颗星球一片荒芜。', v, mine);
    else news('{a}与{b}签订了停战协议。', v, mine);
    updateCard();
  } else if (ev.type === 'merge') {
    addFx(SHAPE.flash, ev.a.x, ev.a.y, ev.a.z, [1, 0.85, 0.6], 8, 14, 1.2);
    toast('两个星系合并成了一个。', null, 'merge');
  } else if (ev.type === 'eat' && ev.a.type !== 'crunch') {
    addFx(SHAPE.flash, ev.a.x, ev.a.y, ev.a.z, [1, 0.75, 0.4], 3, 6, 0.7);
  }
};

// ------------------------------------------------------------------ picking / plane
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
function planePoint(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  plane.set(new THREE.Vector3(0, 1, 0), -S.planeY);
  const d = raycaster.ray.direction;
  if (Math.abs(d.y) > 0.06 && raycaster.ray.intersectPlane(plane, hit)) {
    const dist = hit.distanceTo(camera.position);
    if (dist < cam.dist * 6) return hit.clone();
  }
  // edge-on view: fall back to a plane facing the camera through the target
  const f = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), cam.target);
  return raycaster.ray.intersectPlane(f, new THREE.Vector3());
}
function screenOf(x, y, z) {
  tmpV.set(x, y, z).project(camera);
  return tmpV.z < 1 ? [(tmpV.x * 0.5 + 0.5) * innerWidth, (-tmpV.y * 0.5 + 0.5) * innerHeight] : null;
}
// nearest star (that hosts a civilization) to a screen point
const vp = new THREE.Matrix4();
function pickStar(cx, cy) {
  camera.updateMatrixWorld();
  vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const m = vp.elements, P = sim.pos;
  let best = -1, bd = (touch ? 22 : 14) ** 2;
  for (let i = 0; i < sim.hi; i++) {
    if (sim.kind[i] !== 1 || !sim.seed[i]) continue;
    const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w < 0.05) continue;
    const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * innerWidth;
    const sy = (-(m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5) * innerHeight;
    const d = (sx - cx) ** 2 + (sy - cy) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function pickBody(cx, cy, ignore) {
  let best = null, bd = (touch ? 40 : 28) ** 2;
  for (const b of sim.bodies) {
    if (b.pinned || b === ignore) continue;
    const p = screenOf(b.x, b.y, b.z);
    if (!p) continue;
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
const pxPerUnit = () => innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
const worldPerPx = at => at / pxPerUnit();

// ------------------------------------------------------------------ actions
function velFor(p0, p1) {
  if (p1 && p1.distanceTo(p0) > 1.2) {
    const v = [(p1.x - p0.x) * 0.55, (p1.y - p0.y) * 0.55, (p1.z - p0.z) * 0.55];
    const l = Math.hypot(...v);
    if (l > 14) for (let i = 0; i < 3; i++) v[i] *= 14 / l;
    return v;
  }
  return S.autoOrbit ? sim.orbitVelocity(p0.x, p0.y, p0.z) : [0, 0, 0];
}

const TOASTS = {
  galaxy: '新星系诞生了。试试把它扔向另一个星系。',
  star: '一颗新的恒星亮起来了。',
  cluster: '星团：几百颗星星挤在一起取暖。',
  bh: '小心。黑洞什么都吃，包括它自己的邻居。',
  nebula: '星云里会长出新的星星，等一会儿。',
  naiwa: '奶蛙：肚子是用来抱的。',
};
function doCreate(type, p0, p1) {
  if (sim.room < 1200 && type !== 'star' && type !== 'bh' && type !== 'naiwa') { toast('宇宙已经装不下更多星星了。可以先清空一些。', null, 'full'); return; }
  const v = velFor(p0, p1);
  const nb = sim.bodies.length;
  SPAWN[type](sim, p0, v, S.scale);
  if (sim.bodies.length === nb && type !== 'nebula' && type !== 'cluster' && type !== 'galaxy') { toast('天体太多了，先拿走一些吧。', null, 'bodies'); return; }
  if (sim.bodies.length === nb && type === 'galaxy') { toast('天体太多了，先拿走一些吧。', null, 'bodies'); return; }
  const k = CREATE.findIndex(c => c[0] === type);
  sound.pop(k);
  addFx(SHAPE.flash, p0.x, p0.y, p0.z, [0.9, 0.95, 1], 3.5 * S.scale, 6 * S.scale, 0.7);
  addFx(SHAPE.ring, p0.x, p0.y, p0.z, [0.5, 0.6, 0.8], 0.5, 6 * S.scale, 0.9);
  toast(TOASTS[type], null, 'c-' + type);
}

function destroyBody(b) {
  if (b.type === 'star') sim.supernova(b.x, b.y, b.z, 1 + b.m * 0.1);
  else {
    addFx(SHAPE.flash, b.x, b.y, b.z, [1, 0.8, 0.6], 6, 12, 0.9);
    addFx(SHAPE.ring, b.x, b.y, b.z, [1, 0.85, 0.6], 1, 22, 1.6);
    sound.remove();
    if (b.type === 'core') toast('星系的心被拿走了，星星四散飞去。', null, 'core-gone');
  }
  sim.removeBody(b);
  if (cam.follow === b) setFollow(null);
}

function crunch() {
  const c = cam.target;
  const b = sim.addBody({ type: 'crunch', x: c.x, y: c.y, z: c.z, m: 420, eps: 0.3, rcap: 1.3, grow: 0.01, color: [1, 0.4, 0.2], glow: 6, size: 1 });
  if (!b) { toast('天体太多了，先拿走一些吧。', null, 'bodies'); return; }
  addFx(SHAPE.ring, c.x, c.y, c.z, [1, 0.5, 0.3], 1, 60, 2.8);
  sound.swoosh();
  cam.shake = 0.5;
  toast('宇宙正在坍缩。再见了，所有的星星。', null, 'crunch');
}

function loadPreset(key, snap = true) {
  S.preset = key;
  for (const s of sprites.values()) { scene.remove(s); s.material.dispose(); }
  sprites.clear();
  fx.length = 0;
  const p = buildPreset(sim, key, QUALS[qi][1]);
  homeView(snap);
  if (key === 'naiwa') toast('抱肚星云：两条旋臂，正在抱着它的肚子。', null, 'p-naiwa');
  if (key === 'collision') toast('两个星系正在互相靠近。', null, 'p-col');
  refreshUI();
  return p;
}

// ------------------------------------------------------------------ input
const ptrs = new Map();
let act = null;       // current create / destroy gesture
let orbitG = null;    // current camera gesture
let pinch = null;
let hover = null;     // last mouse position
let idle = 0;

function camDragWanted(e) {
  if (e.pointerType !== 'mouse') return S.mode === 'look';
  return S.mode === 'look' || e.button !== 0 || e.altKey;
}
function beginAction(p) {
  const pt = planePoint(p.x, p.y);
  if (!pt) return;
  const tool = S.tool[S.mode];
  act = { kind: S.mode, tool, p0: pt, p1: null, id: p.id };
  if (tool === 'erase') eraseAt(p);
  if (tool === 'grab') {
    act.body = sim.addBody({ type: 'grab', x: pt.x, y: pt.y, z: pt.z, m: 34, eps: 0.8, pinned: true, glow: 0, size: 1 });
    sound.swoosh();
  }
}
function cancelAction() {
  if (act && act.body) sim.removeBody(act.body);
  act = null;
}
function eraseAt(p) {
  const pt = planePoint(p.x, p.y);
  if (!pt) return;
  const n = sim.erase(pt.x, pt.y, pt.z, eraseR());
  if (n && rnd() < 0.15) sound.remove();
}
const eraseR = () => Math.max(1.2, 3 * S.scale);

function finishAction(p) {
  const a = act;
  act = null;
  if (!a) return;
  if (a.kind === 'create') {
    doCreate(a.tool, a.p0, a.p1 && a.p1.distanceTo(a.p0) > 1.2 ? a.p1 : null);
  } else if (a.tool === 'nova') {
    const b = pickBody(p.x, p.y);
    if (b && b.type !== 'grab') { destroyBody(b); if (b.type !== 'star') sim.supernova(b.x, b.y, b.z, 1); }
    else sim.supernova(a.p0.x, a.p0.y, a.p0.z, S.scale);
  } else if (a.tool === 'remove') {
    const b = pickBody(p.x, p.y);
    if (b) destroyBody(b);
    else toast('点一个天体的光点，把它拿走。', null, 'remove-miss');
  } else if (a.tool === 'grab' && a.body) {
    sim.removeBody(a.body);
  }
}

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  sound.unlock();
  idle = 0;
  const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), type: e.pointerType };
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 2) {
    cancelAction();
    orbitG = null;
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  } else if (ptrs.size === 1) {
    if (camDragWanted(e)) {
      orbitG = { pan: e.button === 1 || e.shiftKey, moved: 0 };
      canvas.classList.add('drag');
    } else beginAction(p);
  }
});
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  hover = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  idle = 0;
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (pinch.d > 8) cam.distGoal = clamp(cam.distGoal * pinch.d / Math.max(d, 8), 3, 400);
    cam.yaw -= (mx - pinch.mx) * 0.006;
    cam.pitch = clamp(cam.pitch + (my - pinch.my) * 0.006, -1.5, 1.5);
    pinch.d = d; pinch.mx = mx; pinch.my = my;
  } else if (orbitG) {
    orbitG.moved += Math.abs(dx) + Math.abs(dy);
    if (orbitG.pan) {
      const k = worldPerPx(cam.dist);
      const right = tmpV.set(1, 0, 0).applyQuaternion(camera.quaternion).clone(), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      cam.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      if (cam.follow) setFollow(null);
    } else {
      cam.yaw -= dx * 0.006;
      cam.pitch = clamp(cam.pitch + dy * 0.006, -1.5, 1.5);
    }
  } else if (act && act.id === e.pointerId) {
    const pt = planePoint(p.x, p.y);
    if (pt) {
      act.p1 = pt;
      if (act.tool === 'erase') eraseAt(p);
      if (act.tool === 'grab' && act.body) { act.body.x = pt.x; act.body.y = pt.y; act.body.z = pt.z; }
    }
  }
});
function endPointer(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (orbitG && ptrs.size === 0) {
    const tap = orbitG.moved < 6 && performance.now() - p.t < 450;
    if (tap && S.mode === 'look') {
      const b = pickBody(p.x, p.y);
      if (b) {
        setFollow(b);
        toast('正在跟随：{n}', { n: tr(NAMES[b.type] || '天体') }, 'follow');
      } else {
        const i = S.civ ? pickStar(p.x, p.y) : -1;
        if (i >= 0) { setFollowStar(i); toast('每一颗星星上都有自己的文明。看看它们过得怎么样。', null, 'civ-hint'); }
        else setFollow(null);
      }
    }
    orbitG = null;
    canvas.classList.remove('drag');
  } else if (act && act.id === e.pointerId) {
    if (e.type === 'pointerup') finishAction(p); else cancelAction();
  }
  if (ptrs.size === 0) { orbitG = null; canvas.classList.remove('drag'); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover = null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.distGoal = clamp(cam.distGoal * Math.exp(e.deltaY * 0.0012), 3, 400);
  idle = 0;
}, { passive: false });
canvas.addEventListener('dblclick', () => { if (S.mode === 'look') homeView(false); });

addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  else if (e.key === '1') setMode('look');
  else if (e.key === '2') setMode('create');
  else if (e.key === '3') setMode('destroy');
  else if (e.key === 'r' || e.key === 'R') loadPreset(S.preset, false);
  else if (e.key === 'h' || e.key === 'H') homeView(false);
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && cam.follow) destroyBody(cam.follow);
  else if (e.key === 'c' || e.key === 'C') setCiv(!S.civ);
  else if (e.key === 'Escape') setFollow(null);
  else if (S.mode !== 'look' && /^[qwerty]$/i.test(e.key)) {
    const list = S.mode === 'create' ? CREATE : DESTROY, i = 'qwerty'.indexOf(e.key.toLowerCase());
    if (list[i]) { S.tool[S.mode] = list[i][0]; refreshUI(); }
  }
});

// ------------------------------------------------------------------ civilizations
function setCiv(on) {
  S.civ = on;
  sim.setCiv(on);
  try { localStorage.setItem('baodu-civ', on ? '1' : '0'); } catch (e) {}
  if (!on && cam.fp) setFollow(null);
  updateCard();
  refreshUI();
  toast(on ? '文明系统开启了。每颗星星上都有人在生活。' : '文明系统关闭了，现在是纯物理模拟。', null);
}
// what the followed star (particle or star body) is
function civTarget() {
  if (!S.civ) return null;
  if (cam.fp) {
    const i = cam.fp.i, seed = cam.fp.seed;
    if (!sim._valid(i, seed)) return null;
    return { seed, lvl: sim.lvl[i], age: (sim.time - sim.cstart[i]) * curiosityOf(seed), epoch: sim.epoch[i], i };
  }
  if (cam.follow && cam.follow.type === 'star' && cam.follow.seed) {
    const b = cam.follow, age = (sim.time - b.cstart) * curiosityOf(b.seed);
    return { seed: b.seed, lvl: techLevel(age), age, epoch: 0, i: -1, body: b };
  }
  return null;
}
function updateCard() {
  const el = $('civ'), c = civTarget();
  el.hidden = !c;
  document.body.classList.toggle('hascard', !!c);
  if (!c) return;
  const d = describe(c.seed), l = c.lvl;
  $('civName').innerHTML = speciesOf(c.seed);
  $('civSub').innerHTML = [tr(FORMS[d.form]), tr(TEMPERS[d.temper]), tr(ATTITUDES[attitudeIdx(aggressionOf(c.seed))])].join(' · ');
  $('civTech').innerHTML = l < 0 ? tr('荒芜，等待新生命') : tr(TECHS[l]);
  $('civEpoch').innerHTML = tr('第 {n} 纪元', { n: c.epoch + 1 });
  $('civBar').style.width = (l < 0 ? 0 : l >= 7 ? 100 : Math.round((c.age - TECH_T[l]) / (TECH_T[l + 1] - TECH_T[l]) * 100)) + '%';
  $('civPop').textContent = l < 0 ? '—' : fmtPop(population(d, l), lang);
  const w = c.i >= 0 ? sim.warOf(c.i) : null;
  if (w) {
    const other = speciesOf(w.a === c.i ? w.sb : w.sa);
    $('civStar').innerHTML = tr(w.kind === 'war' ? '正在与 {n} 交战' : '正在与 {n} 通商', { n: other });
  } else $('civStar').innerHTML = tr(l < 0 ? '一片寂静' : '和平');
  $('civQuirk').innerHTML = tr(QUIRKS[d.quirk]);
  $('civWar').style.display = c.body ? 'none' : '';
}
$('civClose').addEventListener('click', () => setFollow(null));
$('civHug').addEventListener('click', () => {
  const c = civTarget();
  if (!c) return;
  if (c.body) c.body.cstart -= 30 / curiosityOf(c.seed); else sim.civBoost(c.i);
  sound.pop(3);
  toast('{n}收到了抱抱，进步了一点。', { n: speciesOf(c.seed) });
  updateCard();
});
$('civWar').addEventListener('click', () => {
  const c = civTarget();
  if (!c || c.body) return;
  if (sim.provoke(c.i) < 0) toast('附近没有能开战的邻居，或者它已经在打仗了。', null);
  updateCard();
});
$('civDoom').addEventListener('click', () => {
  const c = civTarget();
  if (!c) return;
  const name = speciesOf(c.seed);
  if (c.body) { destroyBody(c.body); toast('{n}的恒星熄灭了。', { n: name }); return; }
  const k = c.i * 3, x = sim.pos[k], y = sim.pos[k + 1], z = sim.pos[k + 2];
  sim.extinct(c.i); sim.stats.collapsed++;
  addFx(SHAPE.flash, x, y, z, [1, 0.7, 0.4], 3, 7, 0.8);
  addFx(SHAPE.ring, x, y, z, [1, 0.6, 0.3], 0.5, 12, 1.2);
  sound.remove();
  toast('一颗陨石砸中了{n}的家园。', { n: name });
  updateCard();
});
$('bCiv').addEventListener('click', () => setCiv(!S.civ));
$('cCiv').addEventListener('change', e => setCiv(e.target.checked));

// ------------------------------------------------------------------ UI
function setMode(m) {
  if (act) cancelAction();
  S.mode = m;
  canvas.classList.toggle('look', m === 'look');
  canvas.classList.toggle('act', m !== 'look');
  refreshUI();
}
function togglePause() { S.paused = !S.paused; refreshUI(); }
function toggleSound() { S.sound = !S.sound; sound.on = S.sound; sound.unlock(); sound.toggle(S.sound); refreshUI(); }
const speed = () => Math.pow(2, S.speedLog);

$('bPause').addEventListener('click', togglePause);
$('bSound').addEventListener('click', toggleSound);
$('bPanel').addEventListener('click', () => { $('panel').classList.toggle('off'); refreshUI(); });
$('modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('rScale').addEventListener('input', e => { S.scale = +e.target.value; refreshUI(); });
$('rHeight').addEventListener('input', e => { S.planeY = +e.target.value; refreshUI(); });
$('rSpeed').addEventListener('input', e => { S.speedLog = +e.target.value; refreshUI(); });
$('cOrbit').addEventListener('change', e => { S.autoOrbit = e.target.checked; });
$('cGrid').addEventListener('change', e => { S.grid = e.target.checked; });
$('cSpin').addEventListener('change', e => { S.spin = e.target.checked; });
$('bRegen').addEventListener('click', () => loadPreset(S.preset, false));
$('bCrunch').addEventListener('click', crunch);
$('bClear').addEventListener('click', () => { loadPreset('empty', false); toast('宇宙清空了。从第一颗星开始吧。', null, 'clear'); });
$('bHome').addEventListener('click', () => homeView(false));
$('bQual').addEventListener('click', () => {
  qi = (qi + 1) % QUALS.length;
  try { localStorage.setItem('baodu-q', qi); } catch (e) {}
  resize();
  loadPreset(S.preset, false);
});

function buildPresetChips() {
  $('presets').innerHTML = PRESETS.map(p => `<button type="button" class="chip${p.key === S.preset ? ' on' : ''}" data-p="${p.key}">${tr(p.name)}</button>`).join('');
}
$('presets').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) loadPreset(b.dataset.p, false); });
function buildTools() {
  const el = $('tools');
  const list = S.mode === 'create' ? CREATE : S.mode === 'destroy' ? DESTROY : [];
  el.classList.toggle('hide', !list.length);
  el.classList.toggle('red', S.mode === 'destroy');
  el.innerHTML = list.map(([k, ic, name]) => `<button type="button" class="tool${S.tool[S.mode] === k ? ' on' : ''}" data-t="${k}">
    <i>${icon(ic)}</i><span>${tr(name)}</span></button>`).join('');
}
$('tools').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { S.tool[S.mode] = b.dataset.t; refreshUI(); } });

function hintText() {
  if (S.mode === 'look') return tr(touch ? '拖动旋转，双指缩放，点一颗星星看看它的文明。' : '拖动旋转，滚轮缩放，点一颗星星看看它的文明，Shift 拖动平移。');
  const list = S.mode === 'create' ? CREATE : DESTROY;
  const t = list.find(x => x[0] === S.tool[S.mode]);
  return tr(t[3]) + ' · ' + tr(touch ? '双指转动镜头、缩放' : '右键拖动转动镜头');
}
refreshUI = () => {
  $('modes').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  buildTools();
  buildPresetChips();
  $('hint').innerHTML = hintText();
  $('tPause').textContent = trp(S.paused ? '继续' : '暂停');
  $('iPause').innerHTML = icon(S.paused ? 'play' : 'pause');
  $('iSound').innerHTML = icon(S.sound ? 'sound' : 'mute');
  $('iGear').innerHTML = icon('gear');
  document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = icon(el.dataset.ic); });
  $('cCiv').checked = S.civ;
  $('iCiv').innerHTML = icon('naiwa');
  $('tCiv').textContent = trp('文明');
  $('bCiv').classList.toggle('on', S.civ);
  updateCard();
  $('bPause').classList.toggle('on', S.paused);
  $('tSound').textContent = trp('声音') + ' ' + trp(S.sound ? '开' : '关');
  $('tPanel').textContent = trp($('panel').classList.contains('off') ? '设置' : '收起');
  $('oScale').textContent = S.scale.toFixed(1) + '×';
  $('oHeight').textContent = String(S.planeY);
  $('oSpeed').textContent = (speed() < 1 ? speed().toFixed(2).replace(/0$/, '') : speed().toFixed(speed() < 4 ? 1 : 0).replace(/\.0$/, '')) + '×';
  $('bQual').innerHTML = tr('画质') + '：' + tr(QUALS[qi][0]);
  const pr = PRESETS.find(p => p.key === S.preset);
  $('presetName').innerHTML = tr(pr ? pr.name : '');
  $('rScale').value = S.scale; $('rHeight').value = S.planeY; $('rSpeed').value = S.speedLog;
};

if (matchMedia('(max-width: 1100px)').matches) $('panel').classList.add('off');

// ------------------------------------------------------------------ frame
const nfmt = n => n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n);
let last = performance.now(), statT = 0, fpsAcc = 0, fpsN = 0, tAbs = 0;
const col3 = [0, 0, 0];
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  tAbs += dtReal;
  idle += dtReal;
  fpsAcc += dtReal; fpsN++;

  if (!S.paused) {
    const dtSim = Math.min(dtReal * speed(), 0.3);
    const n = Math.max(1, Math.min(14, Math.ceil(dtSim / 0.02)));
    for (let i = 0; i < n; i++) sim.step(dtSim / n);
    if (S.civ) { sim.civStep(Math.max(900, Math.min(4000, sim.hi / 20))); sim.warStep(); }
  }
  if (S.spin && idle > 3 && !act && !ptrs.size) cam.yaw += dtReal * 0.035;
  placeCamera(dtReal);

  // uniforms
  const ppu = pxPerUnit() * dpr;
  field.mat.uniforms.uScale.value = ppu;
  field.mat.uniforms.uMin.value = 1.5 * dpr;
  field.mat.uniforms.uMax.value = 140 * dpr;
  overlay.mat.uniforms.uScale.value = ppu;
  overlay.mat.uniforms.uMinPx.value = 10 * dpr;
  field.upload();

  // overlay: body glows then fx
  overlay.begin();
  const live = new Set();
  for (const b of sim.bodies) {
    const c = b.color;
    const dist = Math.hypot(b.x - camera.position.x, b.y - camera.position.y, b.z - camera.position.z);
    if (b.type === 'core') {
      overlay.add(b.x, b.y, b.z, c[0] * 0.32, c[1] * 0.28, c[2] * 0.22, b.glow * 1.5, SHAPE.glow);
      overlay.add(b.x, b.y, b.z, c[0] * 0.5, c[1] * 0.42, c[2] * 0.3, b.glow * 0.45, SHAPE.glow);
    } else if (b.type === 'star') {
      overlay.add(b.x, b.y, b.z, c[0], c[1], c[2], Math.max(b.glow * 1.1, 24 * worldPerPx(dist)), SHAPE.star);
    } else if (b.type === 'bh' || b.type === 'crunch') {
      const r = b.rcap * (b.type === 'crunch' ? 7 : 8.5);
      overlay.add(b.x, b.y, b.z, c[0], c[1], c[2], Math.max(r, 34 * worldPerPx(dist)), SHAPE.bh);
    } else if (b.type === 'cluster') {
      overlay.add(b.x, b.y, b.z, c[0] * 0.28, c[1] * 0.3, c[2] * 0.34, b.glow, SHAPE.glow);
      overlay.add(b.x, b.y, b.z, 0.9, 0.95, 1, Math.max(0.4, 8 * worldPerPx(dist)), SHAPE.star);
    } else if (b.type === 'cloud') {
      overlay.add(b.x, b.y, b.z, c[0] * 0.07, c[1] * 0.06, c[2] * 0.09, b.glow, SHAPE.glow);
    } else if (b.type === 'grab') {
      overlay.add(b.x, b.y, b.z, 0.7, 0.8, 1, 5 + Math.sin(tAbs * 12) * 0.6, SHAPE.ring, 0.55 + 0.25 * Math.sin(tAbs * 9));
    }
    if (b.naiwa) {
      const grown = b.size * (1 + Math.min(1.2, Math.sqrt(b.fed) * 0.012));
      overlay.add(b.x, b.y, b.z, c[0] * 0.55, c[1] * 0.5, c[2] * 0.35, b.glow * 1.8 + grown, SHAPE.glow);
      const sp = spriteFor(b);
      const h = Math.max(grown * 1.6, 46 * worldPerPx(dist));
      sp.position.set(b.x, b.y, b.z);
      sp.scale.set(h * 947 / 1661, h, 1);
      sp.material.rotation = Math.sin(tAbs * 1.6 + b.id) * 0.08;
      live.add(b.id);
    }
  }
  // civilizations: star-faring worlds glow, wars draw beams between the two stars
  if (S.civ) {
    const P = sim.pos;
    let nh = 0;
    for (const i of sim.adv) {
      if (sim.kind[i] !== 1 || sim.lvl[i] < 6) { sim.adv.delete(i); continue; }
      if (nh++ > 380) break;
      const k = i * 3, asc = sim.lvl[i] === 7;
      overlay.add(P[k], P[k + 1], P[k + 2], asc ? 0.42 : 0.5, asc ? 0.2 : 0.38, asc ? 0.5 : 0.1, asc ? 1.3 : 1.0, SHAPE.glow);
    }
    let nb = 0;
    for (const w of sim.wars) {
      const a = w.a * 3, b = w.b * 3, o = nb * 6;
      beamPos[o] = P[a]; beamPos[o + 1] = P[a + 1]; beamPos[o + 2] = P[a + 2];
      beamPos[o + 3] = P[b]; beamPos[o + 4] = P[b + 1]; beamPos[o + 5] = P[b + 2];
      const war = w.kind === 'war', pulse = 0.55 + 0.45 * Math.sin(tAbs * 9 + nb * 1.7);
      const r = war ? 1 * pulse : 0.25, g = war ? 0.28 * pulse : 0.9, bl = war ? 0.18 * pulse : 0.5;
      beamCol[o] = beamCol[o + 3] = r; beamCol[o + 1] = beamCol[o + 4] = g; beamCol[o + 2] = beamCol[o + 5] = bl;
      // a little fleet runs along the beam, and both stars flare
      const u = (tAbs * 0.7 + nb * 0.37) % 1;
      overlay.add(P[a] + (P[b] - P[a]) * u, P[a + 1] + (P[b + 1] - P[a + 1]) * u, P[a + 2] + (P[b + 2] - P[a + 2]) * u, r * 0.8, g * 0.8, bl * 0.8, 0.9, SHAPE.glow);
      for (const q of [a, b]) overlay.add(P[q], P[q + 1], P[q + 2], r * 0.45, g * 0.45, bl * 0.45, 1.6, SHAPE.glow);
      nb++;
    }
    beamGeo.setDrawRange(0, nb * 2);
    beamGeo.attributes.position.needsUpdate = beamGeo.attributes.color.needsUpdate = true;
  } else beamGeo.setDrawRange(0, 0);
  for (const [id, sp] of sprites) {
    if (!live.has(id)) { scene.remove(sp); sp.material.dispose(); sprites.delete(id); }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.age += dtReal;
    if (f.age < 0) continue;
    const u = f.age / f.life;
    if (u >= 1) { fx.splice(i, 1); continue; }
    if (f.shape === SHAPE.ring) overlay.add(f.x, f.y, f.z, f.col[0], f.col[1], f.col[2], f.s1 * (0.25 + 0.75 * Math.sqrt(u)) * 2, SHAPE.ring, Math.sqrt(u) * 0.95);
    else overlay.add(f.x, f.y, f.z, f.col[0], f.col[1], f.col[2], f.s0 + (f.s1 - f.s0) * u, SHAPE.flash, (1 - u) * (1 - u));
  }
  overlay.end();

  // helpers in the 3D scene
  rings.visible = S.grid;
  rings.position.y = S.planeY;
  const pt = (S.mode !== 'look' && hover && !pinch) ? planePoint(hover.x, hover.y) : (act && act.p1 ? act.p1 : null);
  const showGhost = S.mode !== 'look' && (hover || act) && !pinch && pt;
  ghost.visible = !!showGhost;
  drop.visible = false;
  if (showGhost) {
    const cur = act ? (act.p1 || act.p0) : pt;
    const r = S.mode === 'create' ? Math.max(0.5, 1.4 * S.scale) : (S.tool.destroy === 'erase' ? eraseR() : S.tool.destroy === 'grab' ? 1.2 : Math.max(1, 2.4 * S.scale));
    ghost.position.copy(act ? cur : pt);
    ghost.scale.setScalar(r * (1 + 0.04 * Math.sin(tAbs * 6)));
    ghostMat.color.set(S.mode === 'destroy' ? 0xff7a6a : 0xffd60a);
    if (S.planeY !== 0) {
      drop.visible = true;
      const a = drop.geometry.attributes.position;
      a.setXYZ(0, ghost.position.x, ghost.position.y, ghost.position.z); a.setXYZ(1, ghost.position.x, 0, ghost.position.z); a.needsUpdate = true;
    }
  }
  sling.visible = !!(act && act.kind === 'create' && act.p1 && act.p1.distanceTo(act.p0) > 1.2);
  if (sling.visible) {
    const a = sling.geometry.attributes.position;
    a.setXYZ(0, act.p0.x, act.p0.y, act.p0.z); a.setXYZ(1, act.p1.x, act.p1.y, act.p1.z); a.needsUpdate = true;
  }

  // follow marker
  if (cam.fp) {
    const k = cam.fp.i * 3, s = screenOf(sim.pos[k], sim.pos[k + 1], sim.pos[k + 2]), el = $('focus');
    if (s) {
      el.style.display = 'block';
      el.style.transform = `translate(${s[0]}px, ${s[1]}px)`;
      $('focusTag').innerHTML = speciesOf(cam.fp.seed);
    } else el.style.display = 'none';
    const l = sim.lvl[cam.fp.i];
    if (l !== cam.fp.lvl && S.civ) {
      const name = speciesOf(cam.fp.seed);
      if (l < 0) toast('{n}的文明毁灭了。', { n: name });
      else if (l > cam.fp.lvl) toast('{n}进入了{t}。', { n: name, t: tr(TECHS[l]) });
      cam.fp.lvl = l;
      updateCard();
    }
  } else if (cam.follow) {
    const s = screenOf(cam.follow.x, cam.follow.y, cam.follow.z);
    const el = $('focus');
    if (s) {
      el.style.display = 'block';
      el.style.transform = `translate(${s[0]}px, ${s[1]}px)`;
      $('focusTag').innerHTML = tr(NAMES[cam.follow.type] || '天体') + (cam.follow.name ? ' · ' + tr(cam.follow.name) : '');
    } else el.style.display = 'none';
  }

  renderer.render(scene, camera);

  statT += dtReal;
  if (statT > 0.25) {
    statT = 0;
    $('sStars').textContent = nfmt(sim.alive);
    $('sBodies').textContent = sim.bodies.filter(b => b.type !== 'grab').length;
    $('sEaten').textContent = nfmt(sim.stats.swallowed);
    $('sHug').textContent = nfmt(sim.stats.hugged);
    $('sFps').textContent = Math.round(fpsN / fpsAcc);
    fpsAcc = 0; fpsN = 0;
    $('timeInfo').innerHTML = tr('{t} 百万年', { t: Math.round(sim.time * 11) });
    const lc = sim.lvlCount;
    $('sCiv').textContent = S.civ ? nfmt(lc[1] + lc[2] + lc[3] + lc[4] + lc[5] + lc[6] + lc[7] + lc[8]) : '—';
    $('sAdv').textContent = S.civ ? nfmt(lc[7] + lc[8]) : '—';
    $('sFall').textContent = S.civ ? nfmt(sim.stats.collapsed) : '—';
    $('sWar').textContent = S.civ ? nfmt(sim.stats.wars) : '—';
    if (cam.fp || (cam.follow && cam.follow.type === 'star')) updateCard();
  }
}

// ------------------------------------------------------------------ boot
resize();
applyLang();
setMode('look');
loadPreset(qs.get('p') && PRESETS.some(p => p.key === qs.get('p')) ? qs.get('p') : 'milky', true);
cam.pitch = 0.7;
requestAnimationFrame(t => { last = t; frame(t); });
setTimeout(() => toast(touch ? '拖动旋转，点「生成」放下新的星系、黑洞和奶蛙。' : '拖动旋转，滚轮缩放。点下面的「生成」放下新的星系、黑洞和奶蛙。', null, 'welcome'), 900);

// handy for debugging / headless tests
window.baodu = {
  sim, S, cam, camera, loadPreset, setMode, doCreate, crunch, destroyBody, setFollow,
  step(sec) { const n = Math.ceil(sec / 0.02); for (let i = 0; i < n; i++) sim.step(0.02); },
  view(yaw, pitch, dist) { cam.yaw = yaw; cam.pitch = pitch; cam.distGoal = cam.dist = dist; },
  pt: (x, y, z) => new THREE.Vector3(x, y, z),
};
