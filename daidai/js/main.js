import * as THREE from '../lib/three.bundle.js';
import { TAU, clamp, lerp, smooth, damp } from './util.js';
import {
  ROAD_HALF, BAND, LANE_HALF, CAPTION, START, roadFrame, coastX, heightAt, groundAt, nearestPath, featuresNear,
  rowAt, latOf, lanesNear, laneDist, sandyAt,
} from './worldgen.js';
import { Bike } from './bike.js';
import { Terrain } from './terrain.js';
import { Sea } from './sea.js';
import { Props, relabel } from './props.js';
import { Flora } from './flora.js';
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
camera.layers.enable(1);     // grass, flowers, stars… (the water reflection skips layer 1)

// ------------------------------------------------------------------ world
const skySys = new SkySystem(scene, renderer, { low });
let terrain, sea, props, flora, stars, life, bike, headlight, lampLights = [];
const sound = new Sound();
const home = (() => { const f = roadFrame(START.z); return { x: f.x + f.nx * START.lat, z: f.z + f.nz * START.lat, yaw: f.yaw }; })();

function buildWorld() {
  const opts = { low, renderer };
  terrain = new Terrain(scene, opts);
  sea = new Sea(scene, opts);
  props = new Props(scene, opts);
  flora = new Flora(scene, opts);
  stars = new Stars(scene, opts);
  life = new Life(scene, opts);
  bike = new Bike();
  scene.add(bike.root);
  headlight = new THREE.SpotLight(0xfff0cc, 0, 34, 0.42, 0.55, 1.2);
  bike.lampAnchor.add(headlight);
  headlight.target = bike.lampTarget;
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc77a, 0, 16, 1.6); scene.add(l); lampLights.push(l); }
  primeAt(P.x, P.z);
}
// build everything around (x, z) right now (boot and teleports)
function primeAt(x, z) {
  terrain.prime(x, z);
  sea.prime && sea.prime(x, z);
  props.prime(x, z);
  flora.prime(x, z);
}

// ------------------------------------------------------------------ state
const P = {
  x: home.x, z: home.z, y: groundAt(home.x, home.z).y, yaw: home.yaw, v: 0, yawRate: 0, steerIn: 0, steerT: -9,
  crank: 0, wheel: 0, steer: 0, lean: 0, pitch: 0, turn: 0, dazeTurn: 0, total: 0,
  hug: 0, love: 0, combo: 0, comboT: 0, splashT: 0,
};
const G = {
  mode: 'intro',             // intro | ride | daze
  cam: 'third', camB: 0,      // 0 = third person, 1 = first person
  yaw: 0, pitch: 0, dist: 3.4, dragging: false, dragIdle: 9,
  tod: 18.35, todTarget: null, todRate: 0,
  dazeB: 0, dazeStart: 0, dazeTod: 0, wantDaze: false, thoughtT: 0, thought: '',
  caption: { shown: new Set(), until: 0, check: 0 },
  blockT: -99,
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
  else if (e.code === 'KeyH') goHome();
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
$('bHome').addEventListener('click', () => goHome());

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
const homeDist = () => Math.hypot(P.x - home.x, P.z - home.z);
refreshButtons = () => {
  $('tView').innerHTML = tr(G.cam === 'third' ? '第三人称' : '第一人称');
  const h = ((G.todTarget ?? G.tod) % DAY);
  const name = h < 5 || h >= 21 ? '夜晚' : h < 9.5 ? '清晨' : h < 16 ? '正午' : h < 19.6 ? '黄昏' : '夜晚';
  $('tTime').innerHTML = tr(name);
  $('tSound').innerHTML = tr('声音') + ' ' + tr(sound.on ? '开' : '关');
  $('tQual').innerHTML = tr('画质') + ' ' + tr(low ? '低' : '高');
  $('tHome').innerHTML = tr('回到起点');
  $('bHome').classList.toggle('show', G.mode !== 'intro' && homeDist() > 600);
};
refreshButtons();

function setQuality(isLow) {
  low = isLow;
  renderer.setPixelRatio(pxr());
  renderer.setSize(innerWidth, innerHeight, false);
  const L = skySys.light, sm = low ? 1024 : 2048;
  L.shadow.mapSize.set(sm, sm);
  if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
  for (const m of [terrain, sea, props, flora, stars]) m && m.setQuality && m.setQuality(low);
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

const bubbleBox = $('bubbles');
const bubbles = new Map();
function bubble(key, html, x, y, show, think = false) {
  let b = bubbles.get(key);
  if (!b) { b = document.createElement('div'); b.className = 'bubble' + (think ? ' think' : ''); bubbleBox.appendChild(b); bubbles.set(key, b); b._html = ''; }
  if (b._html !== html) { b.innerHTML = html; b._html = html; }
  b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  b.classList.toggle('show', show);
}

// ------------------------------------------------------------------ minimap
// Heading-up, drawn from an offscreen picture of the ground around you that is
// re-painted a few rows per frame whenever you ride far from its centre.
const map = $('map'), mg = map.getContext('2d');
const MAP = { N: 256, mpp: 2.5, view: 170 };
const mapPic = { shown: null, spare: null, job: null, cx: 0, cz: 0, feats: [], dots: [] };
function mapCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = MAP.N;
  const g = c.getContext('2d');
  return { c, g, img: g.createImageData(MAP.N, MAP.N), x0: 0, z0: 0 };
}
function* paintMap(pic, cx, cz) {
  const { N, mpp } = MAP, d = pic.img.data;
  pic.x0 = cx - N * mpp / 2; pic.z0 = cz - N * mpp / 2;
  for (let j = 0; j < N; j++) {
    const z = pic.z0 + (j + 0.5) * mpp, R = rowAt(z), lanes = lanesNear(z);
    for (let i = 0; i < N; i++) {
      const x = pic.x0 + (i + 0.5) * mpp, lat = latOf(x, R), h = heightAt(x, z, R), o = (j * N + i) * 4;
      let r, g, b;
      if (Math.abs(lat) < ROAD_HALF + 0.4) { r = 250; g = 248; b = 240; }
      else if (h < -0.02) {
        const k = smooth(0, 3.5, -h), k2 = smooth(3, 14, -h);
        r = lerp(lerp(120, 64, k), 38, k2); g = lerp(lerp(214, 168, k), 104, k2); b = lerp(lerp(206, 204, k), 160, k2);
      } else {
        let lane = false;
        if (lat < -(BAND - 2)) for (const ln of lanes) { const q = laneDist(ln, x, z); if (q && q.d < LANE_HALF + 0.5) { lane = true; break; } }
        if (lane) { r = 214; g = 172; b = 120; }
        else if (sandyAt(x, z, R, lat, h) > 0.5) { r = 236; g = 220; b = 176; }
        else {
          const k = smooth(1, 35, h), k2 = smooth(35, 70, h);
          r = lerp(lerp(138, 92, k), 128, k2); g = lerp(lerp(196, 150, k), 136, k2); b = lerp(lerp(98, 78, k), 104, k2);
        }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    yield;
  }
  pic.g.putImageData(pic.img, 0, 0);
}
function mapTick(budget) {
  const far = Math.hypot(P.x - mapPic.cx, P.z - mapPic.cz) > 100;
  if (!mapPic.job && (!mapPic.shown || far)) {
    const pic = mapPic.spare || mapCanvas();
    mapPic.spare = null;
    mapPic.job = { pic, it: paintMap(pic, Math.round(P.x / 10) * 10, Math.round(P.z / 10) * 10) };
  }
  if (!mapPic.job) return;
  const t0 = performance.now();
  while (performance.now() - t0 < budget) {
    if (mapPic.job.it.next().done) {
      const pic = mapPic.job.pic;
      mapPic.spare = mapPic.shown; mapPic.shown = pic; mapPic.job = null;
      mapPic.cx = pic.x0 + MAP.N * MAP.mpp / 2; mapPic.cz = pic.z0 + MAP.N * MAP.mpp / 2;
      break;
    }
  }
}
function drawMap(yaw) {
  const W = map.width, c = W / 2, rad = c - 4, s = rad / MAP.view;
  mg.clearRect(0, 0, W, W);
  mg.save();
  mg.beginPath(); mg.arc(c, c, rad, 0, TAU); mg.clip();
  mg.fillStyle = 'rgba(60,110,150,.5)'; mg.fillRect(0, 0, W, W);
  mg.translate(c, c);
  // heading up: rotate so the direction you face points to the top
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  mg.rotate(-Math.PI / 2 - Math.atan2(fz, fx));
  mg.scale(s, s);
  const pic = mapPic.shown;
  if (pic) {
    mg.globalAlpha = 0.9;
    mg.drawImage(pic.c, pic.x0 - P.x, pic.z0 - P.z, MAP.N * MAP.mpp, MAP.N * MAP.mpp);
    mg.globalAlpha = 1;
  }
  mg.fillStyle = '#ffe680';
  for (const d of mapPic.dots) { mg.beginPath(); mg.arc(d.x - P.x, d.z - P.z, 1.6 / s, 0, TAU); mg.fill(); }
  mg.strokeStyle = 'rgba(40,30,0,.7)'; mg.lineWidth = 1.5 / s;
  for (const f of mapPic.feats) {
    mg.fillStyle = G.caption.shown.has(f.id) ? 'rgba(255,214,10,.55)' : '#ffd60a';
    mg.beginPath(); mg.arc(f.cx - P.x, f.cz - P.z, 4.2 / s, 0, TAU); mg.fill(); mg.stroke();
  }
  // home: on the map, or pinned to the rim pointing the way back
  const hx = home.x - P.x, hz = home.z - P.z, hd = Math.hypot(hx, hz);
  if (hd > 30) {
    const k = Math.min(1, (MAP.view - 10) / hd);
    mg.fillStyle = '#ff8fb1'; mg.strokeStyle = '#fff'; mg.lineWidth = 2 / s;
    mg.beginPath(); mg.arc(hx * k, hz * k, 5 / s, 0, TAU); mg.fill(); mg.stroke();
  }
  mg.restore();
  // you: an arrow pointing up
  mg.fillStyle = 'rgba(255,214,10,.25)'; mg.beginPath(); mg.arc(c, c, 15, 0, TAU); mg.fill();
  mg.fillStyle = '#ffd60a'; mg.strokeStyle = '#1d1300'; mg.lineWidth = 2.5; mg.lineJoin = 'round';
  mg.beginPath(); mg.moveTo(c, c - 11); mg.lineTo(c + 8, c + 8); mg.lineTo(c, c + 4); mg.lineTo(c - 8, c + 8); mg.closePath(); mg.fill(); mg.stroke();
  mg.strokeStyle = 'rgba(255,255,255,.55)'; mg.lineWidth = 3;
  mg.beginPath(); mg.arc(c, c, rad, 0, TAU); mg.stroke();
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
// which way to look while zoning out: the nearest water, else the sunset
function dazeDir() {
  for (const d of [15, 35, 60, 100, 160]) {
    let best = null;
    for (let i = 0; i < 16; i++) {
      const a = P.yaw + i / 16 * TAU;
      if (heightAt(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d) < -0.5) {
        const turn = Math.atan2(Math.sin(a - P.yaw), Math.cos(a - P.yaw));
        if (best === null || Math.abs(turn) < Math.abs(best)) best = turn;
      }
    }
    if (best !== null) return best;
  }
  const a = Math.atan2(0.78, -0.62);
  return Math.atan2(Math.sin(a - P.yaw), Math.cos(a - P.yaw));
}
function startDaze() {
  G.mode = 'daze'; G.wantDaze = false;
  G.dazeStart = G.time; G.dazeTod = G.tod; G.thoughtT = 2.5; G.thought = '';
  G.todTarget = null;
  // park facing whatever water is nearest, like the old coast road parked you facing the sea
  P.dazeTurn = clamp(dazeDir(), -2.2, 2.2);
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

// jump somewhere (home button, console)
function teleport(x, z, yaw = P.yaw) {
  P.x = x; P.z = z; P.yaw = yaw; P.v = 0; P.turn = 0;
  P.y = groundAt(x, z).y;
  primeAt(x, z);
  camInit = false;
  mapPic.shown = null; mapPic.job = null;
}
function goHome() {
  if (G.mode === 'intro' || homeDist() < 50) return;
  if (G.mode === 'daze') endDaze();
  teleport(home.x, home.z, home.yaw);
  toast(tr('回到了起点。海还是那片海。'), 2600);
  refreshButtons();
}

// ------------------------------------------------------------------ start
const go = $('go');
function begin() {
  if (G.mode !== 'intro') return;
  sound.start();
  G.mode = 'ride';
  document.body.classList.remove('intro');
  $('start').classList.add('gone');
  setTimeout(() => $('hint').classList.add('off'), 12000);
  G.caption.shown.add('s0');
  caption('✦', tr(CAPTION.start[0]), tr(CAPTION.start[1]));
}
go.addEventListener('click', begin);

// ------------------------------------------------------------------ main loop
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const gHere = {}, gAhead = {}, gF = {}, gR = {}, np = {};
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
let last = performance.now();
const perf = { acc: 0, n: 0, checked: false };
const SURF = { road: 1, deck: 1, lane: 0.88, grass: 0.74, sand: 0.56, water: 0.45 };
const BLOCK = { water: '再往前就是海了。奶蛙不会游泳。', lake: '湖水看起来很凉。奶蛙决定绕过去。', steep: '太陡了，推不上去。', cliff: '前面是悬崖。还是别了。' };
const cols = [];

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

// what's L metres in front of the wheel: null, or why you can't go there
function blockedAt(L) {
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  groundAt(P.x + fx * L, P.z + fz * L, gAhead);
  if (gAhead.surf === 'water' && gAhead.depth > 0.45) return coastX(P.z) - P.x > 150 ? 'lake' : 'water';
  const gr = (gAhead.y - P.y) / L;
  const paved = gAhead.surf === 'road' || gAhead.surf === 'deck';
  if (!paved && gr > 0.7) return 'steep';
  if (gr < -1.15 && gAhead.y < P.y - 0.8) return 'cliff';
  return null;
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

  // ---- riding: go anywhere; the road (or a lane) gently holds you if you let go of the bars
  const riding = G.mode === 'ride';
  const autoStop = G.wantDaze || G.mode === 'daze';
  groundAt(P.x, P.z, gHere);
  const sk = SURF[gHere.surf] || 0.74;
  let target = 4.6 * sk;
  if (riding && input.up) target = 8.8 * sk;
  if ((riding && input.down) || autoStop || G.mode === 'intro') target = 0;
  let fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  groundAt(P.x + fx * 0.43, P.z + fz * 0.43, gF);
  groundAt(P.x - fx * 0.47, P.z - fz * 0.47, gR);
  const grade = clamp((gF.y - gR.y) / 0.9, -1, 1);
  let acc = P.v < target ? (input.up ? 2.6 : 1.6) * lerp(0.6, 1, sk) : (target === 0 ? (input.down || autoStop ? -5.5 : -2) : -0.8 - (1 - sk) * 2.5);
  acc -= grade * 9.8 * 0.35;
  // look ahead: brake for water, walls of rock and drops
  if (riding && P.v > 0.05 && blockedAt(1.0 + P.v * 0.4)) acc = Math.min(acc, -12);
  P.v = clamp(P.v + acc * dt, 0, 12.5);
  if (target === 0 && P.v < 0.15 && acc < 0) P.v = 0;
  if (G.wantDaze && P.v < 0.25 && G.mode === 'ride') startDaze();

  // steering: right = clockwise seen from above = yaw goes down; you can turn on the spot too
  const steerIn = riding ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
  P.steerIn = damp(P.steerIn, steerIn, steerIn ? 6 : 9, dt);
  if (steerIn) P.steerT = t;
  let yawRate = -P.steerIn * lerp(1.5, 0.72, clamp(P.v / 9, 0, 1)) * (P.v < 1 ? lerp(0.7, 1, P.v) : 1);
  // path assist: hands off near a road or lane and you follow it (keeping right on the road)
  nearestPath(P.x, P.z, np);
  if (riding && !steerIn && P.v > 0.3 && np.d < np.half + 1) {
    const dir = fx * np.tx + fz * np.tz >= 0 ? 1 : -1;
    const want = np.kind === 'road' ? 1.75 * dir : 0;
    const err = clamp((want - np.lat) * 0.12, -0.25, 0.25);
    const wx = np.tx * dir - np.tz * err, wz = np.tz * dir + np.tx * err, wy = Math.atan2(wx, wz);
    const diff = Math.atan2(Math.sin(wy - P.yaw), Math.cos(wy - P.yaw));
    const k = smooth(0.4, 1.2, t - P.steerT) * smooth(0.3, 1.5, P.v);
    if (Math.abs(diff) < 0.62) yawRate += diff * 2.2 * k;
  }
  P.yawRate = yawRate;
  P.yaw += yawRate * dt;
  fx = Math.sin(P.yaw); fz = Math.cos(P.yaw);

  // move, unless the wheel is right at the edge of something
  const stop = riding && (P.v > 0 || target > 0) ? blockedAt(0.95) : null;
  if (stop) {
    P.v = 0;
    if (t - G.blockT > 4.5 || G.blockWhy !== stop) { toast(tr(BLOCK[stop]), 2600); G.blockT = t; G.blockWhy = stop; }
  } else if (P.v > 0) {
    const ox = P.x, oz = P.z;
    P.x += fx * P.v * dt; P.z += fz * P.v * dt;
    // bump off trees, lamps, houses… and slide along them
    cols.length = 0;
    props.collidersNear(P.x, P.z, 4, cols);
    flora.collidersNear(P.x, P.z, 4, cols);
    for (const [cx, cz, r] of cols) {
      const dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz), m = r + 0.42;
      if (d >= m || d < 1e-4) continue;
      P.x = cx + dx / d * m; P.z = cz + dz / d * m;
      const into = -(fx * dx + fz * dz) / d;           // 1 = head on
      if (into > 0) P.v *= 1 - 0.6 * into * into;
    }
    P.total += Math.hypot(P.x - ox, P.z - oz);
  }
  const pedalling = P.v < target + 0.3 && target > 0;
  P.crank += (pedalling ? P.v / 0.235 / 2.4 : 0) * dt;
  P.wheel += P.v / 0.235 * dt;

  // ground under the wheels
  groundAt(P.x, P.z, gHere);
  groundAt(P.x + fx * 0.43, P.z + fz * 0.43, gF);
  groundAt(P.x - fx * 0.47, P.z - fz * 0.47, gR);
  const yT = (gF.y * 0.47 + gR.y * 0.43) / 0.9;
  P.y = yT > P.y ? damp(P.y, yT, 30, dt) : damp(P.y, yT, 14, dt);
  P.y = clamp(P.y, yT - 0.12, yT + 0.5);
  P.pitch = damp(P.pitch, Math.atan2(gF.y - gR.y, 0.9), 12, dt);
  // splash through shallow water
  if (gHere.surf === 'water' && P.v > 1) {
    P.splashT -= dt;
    if (P.splashT < 0) { P.splashT = 0.12; life.splashAt(P.x - fx * 0.4, P.z - fz * 0.4, 3, 0.25); }
  }

  // ---- the bike
  P.turn = damp(P.turn, G.mode === 'daze' ? P.dazeTurn : 0, G.mode === 'daze' ? 1.2 : 2, dt);
  const yaw = P.yaw + P.turn;
  const leanT = clamp(-yawRate * P.v / 9.8 * 2.2, -0.35, 0.35);
  P.lean = damp(P.lean, leanT, 4, dt);
  P.steer = damp(P.steer, clamp(yawRate * 0.9 / Math.max(P.v, 1.5), -0.6, 0.6) + Math.sin(t * 1.3) * 0.015 * Math.min(1, P.v), 6, dt);
  const px = P.x, pz = P.z, py = P.y + 0.02;
  bike.root.position.set(px, py, pz);
  bike.root.rotation.set(-P.pitch, yaw, 0, 'YXZ');
  bike.lean.rotation.z = P.lean;
  P.hug = damp(P.hug, G.mode === 'daze' ? 1 : 0, 2.2, dt);
  bike.update(P.crank, P.steer, t, P.hug > 0.985 ? 1 : P.hug < 0.01 ? 0 : P.hug);
  bike.spin(P.wheel, P.wheel);
  if (bike.bell.userData.shake) { bike.bell.userData.shake = Math.max(0, bike.bell.userData.shake - dt * 3); bike.bell.rotation.y = Math.sin(t * 60) * 0.3 * bike.bell.userData.shake; }

  // ---- the world streams in around you
  terrain.update(px, pz, dt);
  flora.update(px, pz, dt);

  // ---- sky / light / sea
  const focus = _v2.set(px, py, pz);
  const st = skySys.update(G.tod, focus, t, dt);
  const night = st.night;
  sea.update(dt, t, focus, st, skySys.light);
  headlight.intensity = smooth(0.25, 0.8, night + st.twilight * 0.3) * 18;
  bike.mats.lamp.emissiveIntensity = 0.2 + headlight.intensity * 0.25;

  // ---- props and life
  props.update(dt, t, night, px, pz);
  // the three street lamps nearest to the rider get real lights
  const lp = props.lampPos;
  if (night > 0.05 && lp.length) {
    const near = lp.map((p, i) => [p.distanceToSquared(focus), i]).sort((a, b) => a[0] - b[0]).slice(0, 3);
    lampLights.forEach((l, k) => {
      if (near[k]) { l.position.copy(lp[near[k][1]]); l.intensity = night * 14; } else l.intensity = 0;
    });
  } else lampLights.forEach(l => { l.intensity = 0; });
  const got = stars.update(dt, t, P, renderer.getPixelRatio());
  if (got) {
    P.combo = G.time - P.comboT < 1.6 ? P.combo + got : 0; P.comboT = G.time;
    for (let i = 0; i < got; i++) { P.love++; skySys.addGoldStar(); }
    sound.chime(P.combo);
    const lv = $('love'); lv.textContent = '✦ ' + P.love; lv.classList.add('bump'); setTimeout(() => lv.classList.remove('bump'), 180);
    if (P.love % 10 === 0) toast(tr('收集了 {n} 份喜欢。夜空里多了 {n} 颗星星。', { n: P.love }));
  }
  life.update(dt, t, { x: px, y: P.y, z: pz, heading: yaw }, skySys, { onWhale: () => { if (G.mode === 'ride') toast(tr('远处有一头鲸鱼跳了起来。'), 2600); sound.whoosh(); } });

  // ---- camera
  updateCamera(dt, t, px, py, pz, yaw);
  skySys.follow(camera);

  // ---- ui
  if (G.mode !== 'intro') updateUI(dt, t, yaw);
  mapTick(G.mode === 'intro' ? 4 : low ? 1.5 : 2.5);
  const inland = Math.max(0, coastX(pz) - px);
  sound.update(dt, P.v, pedalling, clamp(0.3 + 0.7 * smooth(220, 20, inland), 0, 1), G.mode === 'daze', t);
}

function updateCamera(dt, t, px, py, pz, yaw) {
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
  const lookYaw = yaw + G.yaw, lookPitch = -0.3 + G.pitch * 0.9 + P.pitch * 0.6;
  const fl = fp.clone().add(new THREE.Vector3(Math.sin(lookYaw) * Math.cos(lookPitch), Math.sin(lookPitch), Math.cos(lookYaw) * Math.cos(lookPitch)).multiplyScalar(10));
  let pos, look;
  const b = G.camB;
  pos = tp.clone().lerp(fp, b);
  look = tl.clone().lerp(fl, b);
  if (G.mode === 'intro') {
    // swing slowly between a front-three-quarter view and the side, so you meet 奶蛙's face first
    const ia = 0.75 + Math.sin(t * 0.09) * 0.75;
    pos = new THREE.Vector3(px + Math.sin(yaw - ia) * 3.6, py + 1.25 + Math.sin(t * 0.2) * 0.1, pz + Math.cos(yaw - ia) * 3.6);
    look = new THREE.Vector3(px, py + 0.8, pz);
  }
  // zoning out: sit back and look out over the water over 奶蛙's shoulder
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
  if (!firstish) {
    const minY = Math.max(0.4, py + 0.3, heightAt(camPos.x, camPos.z) + 0.45);
    if (camPos.y < minY) camPos.y = minY;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  // portrait phones: open the view up so the road ahead isn't cropped away
  const tall = Math.min(1, Math.max(0, (1 - camera.aspect) / 0.55));
  const fov = Math.min(100, lerp(lerp(55, 78, b), 48, G.dazeB) * (1 + 0.4 * tall));
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // hide the body when the camera is inside the head
  bike.rider.body.visible = !(b > 0.55 && G.dazeB < 0.5);
}

function updateUI(dt, t, yaw) {
  $('spd').textContent = Math.round(P.v * 3.6);
  $('dist').textContent = (P.total / 1000).toFixed(2);
  const hd = homeDist();
  $('lap').innerHTML = hd > 300 ? `${tr('离家')} ${(hd / 1000).toFixed(1)} km` : '';
  // clock: a 25-hour day, the 25th hour is for zoning out
  const h = ((G.tod % DAY) + DAY) % DAY, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  const clock = $('clock');
  const ts = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  clock.innerHTML = `${tr('发呆星时间')} ${ts}` + (hh === 24 ? ` · ${tr('第 25 小时 · 发呆专用')}` : '');
  clock.classList.toggle('extra', hh === 24);
  if (Math.floor(G.time) !== G.lastBtn) { G.lastBtn = Math.floor(G.time); refreshButtons(); }

  // landmark captions, the first time you come close to each one
  if (t > G.caption.check) {
    G.caption.check = t + 0.3;
    const near = featuresNear(P.x, P.z, 260);
    mapPic.feats = near.filter(f => f.caption && Math.hypot(f.cx - P.x, f.cz - P.z) < MAP.view * 1.45);
    mapPic.dots = stars.near(P.x, P.z, MAP.view * 1.45, t);
    if (G.mode === 'ride' && t > G.caption.until - 1.5) {
      for (const f of near) {
        if (!f.caption || G.caption.shown.has(f.id)) continue;
        const r = f.kind === 'island' ? f.R + 15 : f.kind === 'lake' ? f.R + 25 : 32;
        if (Math.hypot(f.cx - P.x, f.cz - P.z) > r) continue;
        G.caption.shown.add(f.id);
        caption('✦', tr(f.caption[0]), tr(f.caption[1]));
        break;
      }
    }
  }
  if (G.time > G.caption.until) $('caption').classList.remove('show');

  // speech bubbles for residents nearby
  const w = innerWidth, hgt = innerHeight;
  const live = new Set();
  for (const n of props.npcs) {
    live.add(n);
    n.holder.getWorldPosition(n.head);
    n.head.y += n.headY + 0.25;
    const dist = n.head.distanceTo(camera.position);
    const near = dist < 17 && G.mode === 'ride';
    const p = n.head.clone().project(camera);
    const vis = near && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
    const line = n.alt && G.time < n.alt ? n.lines[1] : n.lines[0];
    bubble(n, tr(line), (p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * hgt, vis);
  }
  // residents that streamed away take their bubbles with them
  for (const [k, b] of bubbles) if (k !== 'think' && !live.has(k)) { b.remove(); bubbles.delete(k); }
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

  drawMap(yaw);
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
  resize();
  skySys.update(G.tod, new THREE.Vector3(P.x, P.y, P.z), 0, 0);
  skySys.updateEnv(true);
  // let the streamers finish what's around the start before the button lights up
  const settle = () => {
    for (let i = 0; i < 4; i++) step(1 / 60);
    if (!terrain.ready() && G.time < 20) { setTimeout(settle, 0); return; }
    ready = true;
    go.disabled = false;
    go.innerHTML = tr('开始骑行');
    relabel();
    last = performance.now();
    requestAnimationFrame(frame);
    if (qs.get('autostart') != null) begin();
  };
  settle();
}, 30));

// handy for poking at things from the console
window.daidai = {
  sim: (sec, d = 1 / 30) => { for (let i = 0; i < sec / d; i++) step(d); perf.checked = true; },
  G, P, skySys, camera, scene, renderer, begin, toggleView, nextTime, askDaze, endDaze, ring, setQuality, input, teleport, goHome,
  get terrain() { return terrain; }, get props() { return props; }, get flora() { return flora; }, get sea() { return sea; }, get stars() { return stars; }, get life() { return life; },
};
