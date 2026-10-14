import * as THREE from '../lib/three.bundle.js';
import { TAU, clamp, lerp, smooth, damp, wrap01 } from './util.js';
import { Path, buildTerrain, buildRoad, buildFoam, waterNormals, ROAD_HALF, SPOT, sandF, roadR } from './world.js';
import { Bike, BIKE } from './bike.js';
import { buildProps, relabel } from './props.js';
import { SkySystem, PRESETS, DAY } from './sky.js';
import { Stars, Life } from './life.js';
import { Sound } from './audio.js';
import { tr, trp, setLang, pickLang, lang } from './i18n.js';

const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (touch) document.body.classList.add('touch');
const qs = new URLSearchParams(location.search);
let low = touch || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
if (qs.get('q') === 'low') low = true;
if (qs.get('q') === 'high') low = false;
try { const sq = localStorage.getItem('daidai-q'); if (!qs.get('q') && (sq === 'low' || sq === 'high')) low = sq === 'low'; } catch (e) {}

// ------------------------------------------------------------------ language
const i18nEls = [...document.querySelectorAll('[data-i18n]')].map(el => [el, el.innerHTML]);
function applyLang() {
  i18nEls.forEach(([el, zh]) => { el.innerHTML = tr(zh); });
  document.title = trp('发呆星 · 海边骑行') + ' · 奶蛙.space';
  document.querySelector('meta[name=description]').content = trp('奶蛙骑着自行车，沿着发呆星的海边公路慢慢骑。');
  document.querySelectorAll('[data-lang]').forEach(a => a.classList.toggle('on', a.dataset.lang === lang));
  $('back').href = '../?lang=' + lang;
  if (ready) { $('go').innerHTML = tr('开始骑行'); relabel(); }
  $('dazeHint').innerHTML = tr(touch ? '点一下回过神来' : '按任意键回过神来');
  refreshButtons && refreshButtons();
}
let ready = false, refreshButtons = null;
setLang(pickLang(), false);
applyLang();
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
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = `<div class="err">${tr('你的浏览器好像不支持 WebGL，发呆星暂时看不到。')}</div>`;
  throw e;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const pxr = () => Math.min(devicePixelRatio || 1, low ? 1.25 : 1.75);
renderer.setPixelRatio(pxr());
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 7000);

// ------------------------------------------------------------------ world
const skySys = new SkySystem(scene, renderer, { low });
const path = new Path(3000);
let water, foam, props, stars, life, bike, headlight, lampLights = [], terrain;
const sound = new Sound();

function buildWorld() {
  terrain = buildTerrain(low ? 560 : 820);
  scene.add(terrain);
  const { road, curbs } = buildRoad(path);
  scene.add(road, curbs);
  foam = buildFoam(low ? 600 : 1000);
  scene.add(foam);
  water = new THREE.Water(new THREE.PlaneGeometry(9000, 9000), {
    textureWidth: low ? 512 : 1024, textureHeight: low ? 512 : 1024,
    waterNormals: waterNormals(),
    sunDirection: new THREE.Vector3(), sunColor: 0xffffff, waterColor: 0x0b4a63,
    distortionScale: 2.6, fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 1.6;
  water.receiveShadow = false;
  scene.add(water);
  props = buildProps(scene, path, { low });
  stars = new Stars(scene, path);
  life = new Life(scene, path, { low });
  bike = new Bike();
  scene.add(bike.root);
  headlight = new THREE.SpotLight(0xfff0cc, 0, 34, 0.42, 0.55, 1.2);
  bike.lampAnchor.add(headlight);
  headlight.target = bike.lampTarget;
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc77a, 0, 16, 1.6); scene.add(l); lampLights.push(l); }
}

// ------------------------------------------------------------------ state
const P = {
  s: path.length - 26, lat: 1.75, psi: 0, turn: 0, v: 0, crank: 0, wheel: 0, steer: 0, lean: 0, total: 0, lap: 0,
  hug: 0, love: 0, combo: 0, comboT: 0,
};
const G = {
  mode: 'intro',             // intro | ride | daze
  cam: 'third', camB: 0,      // 0 = third person, 1 = first person
  yaw: 0, pitch: 0, dist: 3.4, dragging: false, dragIdle: 9,
  tod: 18.35, todTarget: null, todRate: 0,
  dazeB: 0, dazeStart: 0, dazeTod: 0, wantDaze: false, thoughtT: 0, thought: '',
  caption: { shown: {}, until: 0 },
  time: 0,
};
const input = { up: false, down: false, left: false, right: false };

// ------------------------------------------------------------------ controls
const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
addEventListener('keydown', e => {
  if (G.mode === 'intro') { if (e.code === 'Enter' && ready) begin(); return; }
  if (G.mode === 'daze' && G.dazeB > 0.4 && !e.repeat) { endDaze(); e.preventDefault(); return; }
  if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyV' || e.code === 'KeyC') toggleView();
  else if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); askDaze(); }
  else if (e.code === 'KeyB') ring();
  else if (e.code === 'KeyT') nextTime();
  else if (e.code === 'KeyM') toggleSound();
});
addEventListener('keyup', e => { if (keyMap[e.code]) input[keyMap[e.code]] = false; });
addEventListener('blur', () => { for (const k in input) input[k] = false; });

const hold = (id, key) => {
  const el = $(id);
  const on = e => { e.preventDefault(); input[key] = true; el.classList.add('on'); };
  const off = e => { e.preventDefault(); input[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
};
hold('tLeft', 'left'); hold('tRight', 'right'); hold('tUp', 'up'); hold('tDown', 'down');
$('tBell').addEventListener('click', () => ring());
$('tDaze').addEventListener('click', () => askDaze());
$('bView').addEventListener('click', () => toggleView());
$('bTime').addEventListener('click', () => nextTime());
$('bSound').addEventListener('click', () => toggleSound());
$('bQual').addEventListener('click', () => setQuality(!low));

// drag to look around
let lastX = 0, lastY = 0, dragId = null;
canvas.addEventListener('pointerdown', e => {
  if (G.mode === 'daze' && G.dazeB > 0.4) { endDaze(); return; }
  dragId = e.pointerId; lastX = e.clientX; lastY = e.clientY; G.dragging = true; canvas.classList.add('drag');
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== dragId) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  G.yaw -= dx * 0.005; G.pitch = clamp(G.pitch - dy * 0.004, -0.5, 0.7);
  G.dragIdle = 0;
});
const endDrag = e => { if (e.pointerId === dragId) { dragId = null; G.dragging = false; canvas.classList.remove('drag'); } };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { G.dist = clamp(G.dist + e.deltaY * 0.004, 2.2, 9); e.preventDefault(); }, { passive: false });

function toggleView() { G.cam = G.cam === 'third' ? 'first' : 'third'; G.yaw = 0; G.pitch = 0; refreshButtons(); }
function toggleSound() { sound.setOn(!sound.on); refreshButtons(); }
function nextTime() {
  const h = G.tod % DAY;
  let next = PRESETS.find(([, t]) => t > h + 0.05) || PRESETS[0];
  let target = next[1]; if (target <= h) target += DAY;
  G.todTarget = G.tod + (target - h);
  G.todRate = (G.todTarget - G.tod) / 2.8;
  G.presetName = next[0];
  refreshButtons();
}
refreshButtons = () => {
  $('tView').innerHTML = tr(G.cam === 'third' ? '第三人称' : '第一人称');
  const h = ((G.todTarget ?? G.tod) % DAY);
  const name = h < 5 || h >= 21 ? '夜晚' : h < 9.5 ? '清晨' : h < 16 ? '正午' : h < 19.6 ? '黄昏' : '夜晚';
  $('tTime').innerHTML = tr(name);
  $('tSound').innerHTML = tr('声音') + ' ' + tr(sound.on ? '开' : '关');
  $('tQual').innerHTML = tr('画质') + ' ' + tr(low ? '低' : '高');
};
refreshButtons();

function setQuality(isLow) {
  low = isLow;
  renderer.setPixelRatio(pxr());
  renderer.setSize(innerWidth, innerHeight, false);
  const L = skySys.light, sm = low ? 1024 : 2048;
  L.shadow.mapSize.set(sm, sm);
  if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
  refreshButtons();
  try { localStorage.setItem('daidai-q', low ? 'low' : 'high'); } catch (e) {}
}

// ------------------------------------------------------------------ ui bits
const toastEl = $('toast'), toastText = $('toastText');
let toastTimer;
function toast(html, ms = 3200) {
  toastText.innerHTML = html; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
function caption(k, title, desc) {
  $('capK').textContent = k; $('capT').innerHTML = title; $('capP').innerHTML = desc;
  $('caption').classList.add('show');
  G.caption.until = G.time + 5.5;
}
const LANDMARKS = [
  [SPOT.start, '发呆星海边公路', '一圈 {km} 公里。限速：慢慢来。'],
  [SPOT.beach - 0.015, '抱肚沙滩', '沙子是温的。樱花粉在这里负责晒太阳。'],
  [SPOT.pier - 0.008, '钓鱼栈桥', '天空蓝每天都来钓鱼。一条也没钓到过，也不打算钓到。'],
  [SPOT.windmills - 0.012, '风车山坡', '风车转得很慢，因为风也在发呆。'],
  [SPOT.lighthouse - 0.012, '发呆星灯塔', '天黑以后它会亮起来，提醒大家该发呆了。'],
  [SPOT.viewpoint - 0.008, '发呆观景台', '推荐发呆时长：随便。'],
  [SPOT.rocks - 0.012, '礁石海岸', '运气好的话，能看到鲸鱼。'],
  [SPOT.flowers - 0.006, '小花田', '花是奶蛙种的。种完它就忘了。'],
  [SPOT.statue - 0.01, '奶蛙大爆炸纪念碑', '纪念宇宙第 0 秒的那一次抱肚子。'],
  [SPOT.palms - 0.03, '椰子林', '椰子不会掉下来，它们也在发呆。'],
  [SPOT.bus - 0.006, '发呆站', '末班车 25:00。'],
];

const bubbleBox = $('bubbles');
const bubbles = new Map();
function bubble(key, html, x, y, show, think = false) {
  let b = bubbles.get(key);
  if (!b) { b = document.createElement('div'); b.className = 'bubble' + (think ? ' think' : ''); bubbleBox.appendChild(b); bubbles.set(key, b); b._html = ''; }
  if (b._html !== html) { b.innerHTML = html; b._html = html; }
  b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  b.classList.toggle('show', show);
}

// minimap
const map = $('map'), mg = map.getContext('2d');
let mapBase = null;
function drawMapBase() {
  const c = document.createElement('canvas'); c.width = c.height = 280;
  const g = c.getContext('2d');
  const sc = 280 / 470;
  const tx = x => 140 + x * sc, ty = z => 140 + z * sc;
  g.fillStyle = 'rgba(70,140,180,.18)'; g.beginPath(); g.arc(140, 140, 136, 0, TAU); g.fill();
  g.beginPath();
  for (let i = 0; i <= 200; i++) { const t = i / 200, th = -TAU * t, R = roadR(t) + 8; const x = R * Math.cos(th), z = R * Math.sin(th); i ? g.lineTo(tx(x), ty(z)) : g.moveTo(tx(x), ty(z)); }
  g.fillStyle = 'rgba(120,180,90,.55)'; g.fill();
  g.beginPath();
  for (let i = 0; i <= 300; i++) { const o = path.at(i / 300 * path.length); i ? g.lineTo(tx(o.x), ty(o.z)) : g.moveTo(tx(o.x), ty(o.z)); }
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.stroke();
  for (const [t] of LANDMARKS) { const o = path.at(path.sOf(t)); g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(tx(o.x + o.nx * 10), ty(o.z + o.nz * 10), 5, 0, TAU); g.fill(); }
  mapBase = { c, tx, ty };
}

// ------------------------------------------------------------------ actions
function ring() {
  sound.bell();
  bike.bell.userData.shake = 1;
  let any = false;
  for (const n of props.npcs) {
    n.holder.getWorldPosition(_v);
    if (_v.distanceTo(bike.root.position) < 20) { n.wiggle = 1; n.alt = G.time + 4.5; any = true; }
  }
  if (!any && Math.random() < 0.4) toast(tr('叮铃铃'), 1400);
}
function askDaze() {
  if (G.mode !== 'ride') return;
  G.wantDaze = true;
  if (P.v > 0.6) toast(tr('先停下来，才能好好发呆。'), 2200);
}
function startDaze() {
  G.mode = 'daze'; G.wantDaze = false;
  G.dazeStart = G.time; G.dazeTod = G.tod; G.thoughtT = 2.5; G.thought = '';
  G.todTarget = null;
  document.body.classList.add('dazing');
  $('daze').classList.add('show');
}
function endDaze() {
  if (G.mode !== 'daze') return;
  G.mode = 'ride';
  document.body.classList.remove('dazing');
  $('daze').classList.remove('show');
  const secs = Math.round(G.time - G.dazeStart);
  const a = tr('{m} 分 {s} 秒', { m: Math.floor(secs / 60), s: secs % 60 });
  const mins = Math.round((G.tod - G.dazeTod) * 60);
  const b = tr('{h} 小时 {m} 分钟', { h: Math.floor(mins / 60), m: mins % 60 });
  toast(tr('你发呆了 {a}。发呆星上过去了 {b}。', { a, b }), 4200);
  refreshButtons();
}
const THOUGHTS = ['……', '海好大。', '今天也什么都没想。', '肚子软软的。', '那朵云有点像奶蛙。', '风是咸的。', '要是一天有 26 个小时就好了。', '海浪在数数：一、二、一、二……', '刚才想到什么来着。算了。', '（正在发呆，请勿打扰）'];

// ------------------------------------------------------------------ start
const go = $('go');
function begin() {
  if (G.mode !== 'intro') return;
  sound.start();
  G.mode = 'ride';
  document.body.classList.remove('intro');
  $('start').classList.add('gone');
  setTimeout(() => $('hint').classList.add('off'), 12000);
}
go.addEventListener('click', begin);

// ------------------------------------------------------------------ main loop
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const fr = {}, fr2 = {};
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
let last = performance.now();
const perf = { acc: 0, n: 0, checked: false };

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
  renderer.render(scene, camera);
  // quietly drop to low quality if the first seconds of riding are slow
  if (G.mode === 'ride' && !perf.checked && !low) {
    perf.acc += dt; perf.n++;
    if (perf.acc > 5) { perf.checked = true; if (perf.n / perf.acc < 28) setQuality(true); }
  }
}

function step(dt) {
  G.time += dt;
  const t = G.time;

  // ---- time of day
  if (G.todTarget != null) {
    G.tod += G.todRate * dt;
    if (G.tod >= G.todTarget) { G.tod = G.todTarget; G.todTarget = null; refreshButtons(); }
  } else {
    G.tod += dt * (G.mode === 'daze' ? G.dazeB / 6 : 1 / 240);
  }
  if (G.tod >= DAY * 4) G.tod -= DAY * 3;

  // ---- riding
  const riding = G.mode === 'ride';
  const autoStop = G.wantDaze || G.mode === 'daze';
  let target = 4.6;
  if (riding && input.up) target = 8.8;
  if ((riding && input.down) || autoStop || G.mode === 'intro') target = 0;
  path.at(P.s, fr);
  path.at(P.s + 2, fr2);
  const grade = (fr2.y - fr.y) / 2;
  let acc = P.v < target ? (input.up ? 2.6 : 1.6) : (target === 0 ? (input.down || autoStop ? -5.5 : -2) : -0.8);
  acc -= grade * 9.8 * 0.35;
  P.v = clamp(P.v + acc * dt, 0, 12.5);
  if (target === 0 && P.v < 0.15 && acc < 0) P.v = 0;
  const pedalling = P.v < target + 0.3 && target > 0;
  if (G.wantDaze && P.v < 0.25 && G.mode === 'ride') startDaze();

  const steerIn = riding ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;   // right = towards the sea
  P.psi = damp(P.psi, steerIn * 0.42, steerIn ? 3.5 : 2.5, dt);
  P.lat += P.v * Math.sin(P.psi) * dt;
  const LIM = ROAD_HALF - 0.45;
  if (Math.abs(P.lat) > LIM) { P.lat = Math.sign(P.lat) * LIM; P.psi *= 0.5; }
  const ds = P.v * Math.cos(P.psi) * dt;
  P.s += ds; P.total += ds;
  if (P.s >= path.length) {
    P.s -= path.length; P.lap++;
    if (P.lap > 1) toast(tr('第 {n} 圈。海还是那片海。', { n: P.lap }));
    G.caption.shown = {};
  }
  if (P.s < 0) P.s += path.length;
  P.crank += (pedalling ? P.v / BIKE.wheelR / 2.4 : 0) * dt;
  P.wheel += P.v / BIKE.wheelR * dt;

  // where the bike is
  path.at(P.s, fr);
  const px = fr.x + fr.nx * P.lat, pz = fr.z + fr.nz * P.lat, py = fr.y + 0.02;
  const heading = Math.atan2(fr.tx, fr.tz);
  // seaward normal is on the bike's right (local −x), so steering towards the sea turns the nose right
  P.turn = damp(P.turn, G.mode === 'daze' ? 1.15 : 0, G.mode === 'daze' ? 1.2 : 2, dt);   // park facing the sea to zone out
  const yaw = heading - P.psi - P.turn;
  path.at(P.s + 4, fr2);
  const curv = (Math.atan2(fr2.tx, fr2.tz) - heading + Math.PI * 3) % TAU - Math.PI;
  const leanT = clamp(-curv / 4 * P.v * P.v / 9.8 * 3 + P.psi * P.v * 0.12, -0.35, 0.35);
  P.lean = damp(P.lean, leanT, 4, dt);
  P.steer = damp(P.steer, -P.psi * 1.1 + Math.sin(t * 1.3) * 0.015 * Math.min(1, P.v), 6, dt);
  bike.root.position.set(px, py, pz);
  bike.root.rotation.set(-Math.atan(grade), yaw, 0, 'YXZ');
  bike.lean.rotation.z = P.lean;
  P.hug = damp(P.hug, G.mode === 'daze' ? 1 : 0, 2.2, dt);
  bike.update(P.crank, P.steer, t, P.hug > 0.985 ? 1 : P.hug < 0.01 ? 0 : P.hug);
  bike.spin(P.wheel, P.wheel);
  if (bike.bell.userData.shake) { bike.bell.userData.shake = Math.max(0, bike.bell.userData.shake - dt * 3); bike.bell.rotation.y = Math.sin(t * 60) * 0.3 * bike.bell.userData.shake; }

  // ---- sky / light
  const focus = _v2.set(px, py, pz);
  const st = skySys.update(G.tod, focus, t, dt);
  const night = st.night;
  water.material.uniforms.time.value += dt * 0.55;
  water.material.uniforms.sunDirection.value.copy(skySys.light.position).sub(focus).normalize();
  water.material.uniforms.sunColor.value.copy(skySys.light.color).multiplyScalar(Math.min(1.2, skySys.light.intensity / 2.2));
  water.material.uniforms.waterColor.value.setRGB(lerp(0.03, 0.005, night), lerp(0.2, 0.03, night), lerp(0.27, 0.07, night));
  foam.material.uniforms.time.value = t;
  foam.material.uniforms.tint.value.setRGB(1, 0.97, 0.92).lerp(st.sunCol, 0.25).multiplyScalar(lerp(1, 0.22, night));
  headlight.intensity = smooth(0.25, 0.8, night + st.twilight * 0.3) * 18;
  bike.mats.lamp.emissiveIntensity = 0.2 + headlight.intensity * 0.25;
  // three street lamps nearest to the rider get real lights
  const lp = props.lampPos;
  if (night > 0.05) {
    const near = lp.map((p, i) => [p.distanceToSquared(focus), i]).sort((a, b) => a[0] - b[0]).slice(0, 3);
    near.forEach(([, i], k) => { lampLights[k].position.copy(lp[i]); lampLights[k].intensity = night * 14; });
  } else lampLights.forEach(l => { l.intensity = 0; });

  // ---- props and life
  props.update(dt, t, night);
  const got = stars.update(dt, t, P, P.total, renderer.getPixelRatio());
  if (got) {
    P.combo = G.time - P.comboT < 1.6 ? P.combo + got : 0; P.comboT = G.time;
    for (let i = 0; i < got; i++) { P.love++; skySys.addGoldStar(); }
    sound.chime(P.combo);
    const lv = $('love'); lv.textContent = '✦ ' + P.love; lv.classList.add('bump'); setTimeout(() => lv.classList.remove('bump'), 180);
    if (P.love % 10 === 0) toast(tr('收集了 {n} 份喜欢。夜空里多了 {n} 颗星星。', { n: P.love }));
  }
  life.update(dt, t, P, skySys, { onWhale: () => { if (G.mode === 'ride') toast(tr('远处有一头鲸鱼跳了起来。'), 2600); sound.whoosh(); } });

  // ---- camera
  updateCamera(dt, t, px, py, pz, yaw, fr);

  // ---- ui
  if (G.mode !== 'intro') updateUI(dt, t, fr);
  sound.update(dt, P.v, pedalling, clamp(sandF(fr.t) * 0.7 + 0.3, 0, 1), G.mode === 'daze', t);

}

function updateCamera(dt, t, px, py, pz, yaw, fr) {
  const fwd = _v.set(Math.sin(yaw), 0, Math.cos(yaw));
  if (!G.dragging) { G.dragIdle += dt; if (G.dragIdle > 2.5) { G.yaw = damp(G.yaw, 0, 1.5, dt); G.pitch = damp(G.pitch, 0, 1.5, dt); } }
  G.camB = damp(G.camB, G.cam === 'first' ? 1 : 0, 6, dt);
  G.dazeB = damp(G.dazeB, G.mode === 'daze' ? 1 : 0, G.mode === 'daze' ? 0.9 : 2.5, dt);

  // third person: behind and above, orbit with drag
  const a = yaw + Math.PI + G.yaw, d = G.dist;
  const tp = new THREE.Vector3(px + Math.sin(a) * d * Math.cos(G.pitch * 0.6), py + 1.45 + d * 0.16 + Math.sin(G.pitch) * d * 0.8, pz + Math.cos(a) * d * Math.cos(G.pitch * 0.6));
  const tl = new THREE.Vector3(px + fwd.x * 1.6, py + 1.0, pz + fwd.z * 1.6);
  // first person: from 奶蛙's face, look where the bike goes
  bike.root.updateMatrixWorld(true);
  const eye = bike.eye(new THREE.Vector3());
  bike.lean.localToWorld(eye);
  const bob = Math.sin(P.crank * 2) * 0.008 * Math.min(1, P.v / 4);
  const fp = eye.clone(); fp.y += bob;
  const lookYaw = yaw + G.yaw, lookPitch = -0.3 + G.pitch * 0.9;
  const fl = fp.clone().add(new THREE.Vector3(Math.sin(lookYaw) * Math.cos(lookPitch), Math.sin(lookPitch), Math.cos(lookYaw) * Math.cos(lookPitch)).multiplyScalar(10));
  // intro: slow orbit around the rider at the start line
  let pos, look;
  const b = G.camB;
  pos = tp.clone().lerp(fp, b);
  look = tl.clone().lerp(fl, b);
  if (G.mode === 'intro') {
    // swing slowly between a front-three-quarter view and the side, so you meet 奶蛙's face first
    const ia = 0.75 + Math.sin(t * 0.09) * 0.75;
    pos = new THREE.Vector3(px + Math.sin(yaw - ia) * 3.6, py + 1.25 + Math.sin(t * 0.2) * 0.1, pz + Math.cos(yaw - ia) * 3.6);
    look = new THREE.Vector3(px - Math.cos(yaw) * 0.0, py + 0.8, pz);
  }
  // zoning out: sit back and look out to sea over 奶蛙's shoulder
  if (G.dazeB > 0.001) {
    const el = t - G.dazeStart, sway = Math.sin(el * 0.07) * 0.6;
    const rx = fwd.z, rz = -fwd.x;                      // bike's left
    const back = 3.1 + Math.min(el, 40) * 0.02;         // drift back slowly
    const dp = new THREE.Vector3(px - fwd.x * back + rx * (0.9 + sway), py + 1.3 + sway * 0.15, pz - fwd.z * back + rz * (0.9 + sway));
    const dl = new THREE.Vector3(px + fwd.x * 30 - rx * 3, py + 2.2, pz + fwd.z * 30 - rz * 3);
    const k = smooth(0, 1, G.dazeB);
    pos.lerp(dp, k); look.lerp(dl, k);
  }
  if (G.debugCam) {   // console helper: daidai.G.debugCam = { pos: [bike-space x,y,z], look: [...] }
    const dp = new THREE.Vector3(...G.debugCam.pos), dl = new THREE.Vector3(...G.debugCam.look);
    bike.root.localToWorld(dp); bike.root.localToWorld(dl);
    camera.position.copy(dp); camera.lookAt(dl); camPos.copy(dp); camLook.copy(dl);
    bike.rider.body.visible = true;
    if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix(); }
    return;
  }
  if (!camInit) { camPos.copy(pos); camLook.copy(look); camInit = true; }
  const firstish = b > 0.5 && G.dazeB < 0.5;
  const k = firstish ? 1 : 1 - Math.exp(-dt * (G.mode === 'intro' ? 3 : 7));
  camPos.lerp(pos, k); camLook.lerp(look, firstish ? 1 : 1 - Math.exp(-dt * 9));
  // never dip under the ground or the sea
  const minY = Math.max(0.4, py + 0.3);
  if (camPos.y < minY) camPos.y = minY;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  // portrait phones: open the view up so the road ahead isn't cropped away
  const tall = Math.min(1, Math.max(0, (1 - camera.aspect) / 0.55));
  const fov = Math.min(100, lerp(lerp(55, 78, b), 48, G.dazeB) * (1 + 0.4 * tall));
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // hide the body when the camera is inside the head
  bike.rider.body.visible = !(b > 0.55 && G.dazeB < 0.5);
}

function updateUI(dt, t, fr) {
  $('spd').textContent = Math.round(P.v * 3.6);
  $('dist').textContent = (P.total / 1000).toFixed(2);
  $('lap').innerHTML = P.lap > 0 ? `${tr('圈')} ${P.lap}` : '';
  // clock: a 25-hour day, the 25th hour is for zoning out
  const h = ((G.tod % DAY) + DAY) % DAY, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const clock = $('clock');
  const ts = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  clock.innerHTML = `${tr('发呆星时间')} ${ts}` + (hh === 24 ? ` · ${tr('第 25 小时 · 发呆专用')}` : '');
  clock.classList.toggle('extra', hh === 24);
  if (Math.floor(G.time) !== G.lastBtn) { G.lastBtn = Math.floor(G.time); refreshButtons(); }

  // landmark captions
  for (const [lt, name, desc] of LANDMARKS) {
    const ahead = wrap01(fr.t - lt);
    if (ahead < 0.006 && !G.caption.shown[lt] && G.mode === 'ride') {
      G.caption.shown[lt] = true;
      caption('✦', tr(name), tr(desc, { km: (path.length / 1000).toFixed(2) }));
    }
  }
  if (G.time > G.caption.until) $('caption').classList.remove('show');

  // speech bubbles for residents nearby
  const w = innerWidth, hgt = innerHeight;
  for (const n of props.npcs) {
    n.holder.getWorldPosition(n.head);
    n.head.y += n.headY + 0.25;
    const dist = n.head.distanceTo(camera.position);
    const near = dist < 17 && G.mode === 'ride';
    const p = n.head.clone().project(camera);
    const vis = near && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    const line = n.alt && G.time < n.alt ? n.lines[1] : n.lines[0];
    bubble(n, tr(line), (p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * hgt, vis);
  }
  // thoughts while zoning out
  if (G.mode === 'daze') {
    const secs = Math.floor(G.time - G.dazeStart);
    $('dazeT').innerHTML = `${tr('发呆中')} · ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    $('dazeC').innerHTML = clock.innerHTML;
    G.thoughtT -= dt;
    if (G.thoughtT < 0) { G.thought = THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)]; G.thoughtT = 6 + Math.random() * 3; }
  }
  const head = bike.rider.anchor(new THREE.Vector3(0, 0.95, 0), new THREE.Vector3());
  bike.lean.localToWorld(head);
  const hp = head.project(camera);
  const showThought = G.mode === 'daze' && G.dazeB > 0.7 && G.thought && G.thoughtT > 1.2;
  bubble('think', tr(G.thought || '……'), (hp.x * 0.5 + 0.5) * w, (-hp.y * 0.5 + 0.5) * hgt, showThought, true);

  // minimap
  if (mapBase) {
    mg.clearRect(0, 0, 280, 280);
    mg.drawImage(mapBase.c, 0, 0);
    const x = mapBase.tx(bike.root.position.x), y = mapBase.ty(bike.root.position.z);
    mg.fillStyle = 'rgba(255,214,10,.25)'; mg.beginPath(); mg.arc(x, y, 14, 0, TAU); mg.fill();
    mg.fillStyle = '#ffd60a'; mg.strokeStyle = '#1d1300'; mg.lineWidth = 2.5;
    mg.beginPath(); mg.arc(x, y, 7, 0, TAU); mg.fill(); mg.stroke();
  }
}

// ------------------------------------------------------------------ boot
function resize() {
  renderer.setPixelRatio(pxr());
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

requestAnimationFrame(() => setTimeout(() => {
  buildWorld();
  drawMapBase();
  resize();
  skySys.update(G.tod, new THREE.Vector3(), 0, 0);
  skySys.updateEnv(true);
  ready = true;
  go.disabled = false;
  go.innerHTML = tr('开始骑行');
  relabel();
  last = performance.now();
  requestAnimationFrame(frame);
  if (qs.get('autostart') != null) begin();
}, 30));

// handy for poking at things from the console
window.daidai = { sim: (sec, d = 1 / 30) => { for (let i = 0; i < sec / d; i++) step(d); perf.checked = true; }, G, P, skySys, camera, scene, renderer, begin, toggleView, nextTime, askDaze, endDaze, ring, setQuality, input };
