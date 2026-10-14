import * as THREE from '../../daidai/lib/three.bundle.js';
import { makeLens } from './lens.js';
import { Dream, DEPTH } from './dream.js';
import { Sound, BREATH_SEC } from './audio.js';
import { throwWorry, buildReport, galaxyClock, fmtYears } from './fx.js';
import { tr, trp, setLang, pickLang, lang } from './i18n.js';
import { injectIcons, icon } from './icons.js';

injectIcons();
const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TS = +qs.get('ts') || 1;                       // time scale, for testing: ?ts=60 makes a minute pass per second
const YEARS_PER_MIN = 15;
const store = {
  get(k, d) { try { const v = localStorage.getItem('wushui-' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('wushui-' + k, v); } catch (e) {} },
};

// ------------------------------------------------------------------ state
const S = {
  phase: 'idle', dur: +store.get('dur', 20) || 20, sound: store.get('sound', 'drone'), vol: +store.get('vol', .6), chime: store.get('chime', '1') === '1', qqq: store.get('qqq', '1') === '1', dreamAt: null,
  napStart: 0, total: 0, worries: 0, dreamed: false, dreaming: false, lastInput: performance.now(), feed: 0, hintI: 0, pokes: [], seed: 1,
};
if (!['drone', 'rain', 'sea', 'white', 'off'].includes(S.sound)) S.sound = 'drone';
const DURS = [10, 20, 30];
const SOUNDS = [['drone', 'hole', '黑洞低鸣'], ['rain', 'rain', '雨声'], ['sea', 'sea', '海浪'], ['white', 'white', '白噪音'], ['off', 'off', '安静']];

// ------------------------------------------------------------------ language
const i18nEls = [...document.querySelectorAll('[data-i18n]')].map(el => [el, el.innerHTML]);
let refreshUI = () => {};
function applyLang() {
  i18nEls.forEach(([el, zh]) => { el.innerHTML = tr(zh); });
  document.title = trp('午睡黑洞 · 午睡舱') + ' · 奶蛙.space';
  document.querySelector('meta[name=description]').content = trp('午睡黑洞是一个让你慢下来的地方。选 10、20 或 30 分钟，奶蛙在黑洞边上陪你打个盹；睡醒时，外面已经过去了几百年。');
  document.querySelectorAll('[data-lang]').forEach(a => a.classList.toggle('on', a.dataset.lang === lang));
  $('back').href = '../?lang=' + lang;
  document.querySelectorAll('[data-ph]').forEach(el => { el.placeholder = trp(el.dataset.ph); });
  refreshUI();
}
setLang(pickLang(), false);
document.querySelectorAll('[data-lang]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); setLang(a.dataset.lang, true); history.replaceState(null, '', '?lang=' + lang); applyLang();
}));

// ------------------------------------------------------------------ renderer
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
catch (e) {
  document.body.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-items:center;text-align:center;padding:24px;color:#c4c4d4">${tr('你的浏览器好像不支持 WebGL，午睡黑洞暂时看不到。')}</div>`;
  throw e;
}
renderer.setClearColor(0x02030a, 1);
let rs = +qs.get('rs') || (touch ? .62 : .85);          // render scale; adapts to the frame rate below
const lens = makeLens();
const dream = new Dream(renderer, '../naiwa.png');
const sound = new Sound();
sound.vol = S.vol;
let W = 1, H = 1;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * rs);
  renderer.setSize(W, H, false);
  dream.resize(W, H);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ small helpers
let toastTimer = 0;
function toast(zh, vars) { $('toastText').innerHTML = tr(zh, vars); $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3600); }
const ease = x => x * x * (3 - 2 * x);
const mmss = s => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function veil(on, ms = 900) { $('veil').style.transitionDuration = ms + 'ms'; $('veil').classList.toggle('on', on); return new Promise(r => setTimeout(r, ms)); }
const touchInput = () => { S.lastInput = performance.now(); if (document.body.classList.contains('deep')) document.body.classList.remove('deep'); };

// ------------------------------------------------------------------ setup UI
function buildSetup() {
  $('dur').innerHTML = DURS.map(d => `<button type="button" data-d="${d}" class="${d === S.dur ? 'on' : ''}">${tr('{n} 分钟', { n: d })}</button>`).join('');
  $('sounds').innerHTML = SOUNDS.map(([k, ic, name]) => `<button type="button" class="chip${k === S.sound ? ' on' : ''}" data-s="${k}">${icon(ic)}<span>${tr(name)}</span></button>`).join('');
  $('start').querySelector('.icw').innerHTML = icon('moon');
}
$('dur').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.dur = +b.dataset.d; store.set('dur', S.dur); buildSetup(); });
let previewT = 0;
$('sounds').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  S.sound = b.dataset.s; store.set('sound', S.sound); buildSetup();
  sound.unlock(); sound.setMode(S.sound);
  clearTimeout(previewT);
  if (S.phase === 'idle') previewT = setTimeout(() => { if (S.phase === 'idle') sound.silence(); }, 6000);   // just a short preview
});
$('vol').value = S.vol;
$('vol').addEventListener('input', e => { S.vol = +e.target.value; store.set('vol', S.vol); sound.unlock(); sound.setVolume(S.vol); });
$('qqqCk').checked = S.qqq;
$('qqqCk').addEventListener('change', e => { S.qqq = e.target.checked; store.set('qqq', S.qqq ? '1' : '0'); });
$('chimeCk').checked = S.chime;
$('chimeCk').addEventListener('change', e => { S.chime = e.target.checked; store.set('chime', S.chime ? '1' : '0'); });

// ------------------------------------------------------------------ the nap
let wakeLock = null;
async function lockScreen(on) {
  try {
    if (on && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}
function setPhase(p) {
  S.phase = p;
  const nap = p === 'nap';
  $('setup').hidden = nap || p === 'wake';
  $('nap').hidden = !nap;
  (nap ? $('napSound') : $('setup').querySelector('.grid')).appendChild($('soundBlock'));
  $('frog').className = nap ? 'asleep' : 'awake';
  $('frogWrap').classList.toggle('asleep', nap);
  $('breath').classList.toggle('on', nap && !S.dreaming);
  document.body.classList.remove('deep');
  refreshUI();
}
function startNap() {
  if (S.phase === 'nap') return;
  sound.unlock(); sound.restore(); sound.stopChime(); clearTimeout(previewT);
  sound.setMode(S.sound);
  S.napStart = Date.now(); S.total = S.dur * 60; S.worries = 0; S.dreamed = false; S.seed = (Math.random() * 1e9) | 0;
  touchInput(); hideReport();
  setPhase('nap');
  lockScreen(true);
  // "？？？": a random event. It may or may not happen, and if it does it comes at a random point of the nap.
  S.dreamAt = null;
  if (S.qqq && Math.random() < .65) S.dreamAt = S.total * (.15 + Math.random() * .55);
  if (qs.get('dream') === '1') S.dreamAt = 1;
}
const elapsed = () => Math.min(S.total, (Date.now() - S.napStart) / 1000 * TS);
function endNap(early) {
  if (S.phase !== 'nap') return;
  const el = elapsed();
  const finish = () => {
    sound.setMode('off'); sound.mode = S.sound;
    if (!early && S.chime) { sound.chime(); try { navigator.vibrate && navigator.vibrate([200, 120, 200]); } catch (e) {} }
    lockScreen(false);
    setPhase('wake');
    showReport(el);
  };
  if (S.dreaming) { $('bed').classList.remove('show'); $('bed').hidden = true; exitDream(true).then(finish); } else finish();
}
$('start').addEventListener('click', startNap);
$('wake').addEventListener('click', () => endNap(true));

// periodic check so the nap ends on time even if the tab was in the background
setInterval(() => {
  if (S.phase !== 'nap') return;
  const el = elapsed(), left = S.total - el;
  if (left <= 0) { endNap(false); return; }
  $('left').textContent = mmss(left);
  $('out').innerHTML = tr('黑洞外面已过去 {y}', { y: `<b>${fmtYears(el / 60 * YEARS_PER_MIN, tr)}</b>` });
  document.title = mmss(left) + ' · ' + trp('午睡黑洞');
  const idle = performance.now() - S.lastInput;
  if (idle > 9000 && !S.dreaming) document.body.classList.add('deep');
  if (S.dreamAt !== null && !S.dreamed && !S.dreaming && el >= S.dreamAt && left > 20 / TS) { S.dreamed = true; enterDream(true); }
}, 250);

// ------------------------------------------------------------------ throwing worries into the hole
let center = { x: 0, y: 0 };
function throwIn() {
  const inp = $('worryIn'), text = inp.value.trim();
  sound.unlock();
  if (!text) { toast('先写点烦心事吧。'); inp.focus(); return; }
  const r = inp.getBoundingClientRect();
  throwWorry($('fx'), text, { x: r.left + Math.min(r.width, 60 + text.length * 14) / 2, y: r.top + r.height / 2 }, center, () => { S.feed = 1; });
  sound.throwIn();
  inp.value = '';
  S.worries++;
  store.set('worries', (+store.get('worries', 0)) + 1);
  refreshCount();
  toast('这件烦心事被拉成面条了，不会被保存，也不会被上传。');
}
$('worryGo').addEventListener('click', throwIn);
$('worryIn').addEventListener('keydown', e => { if (e.key === 'Enter') throwIn(); e.stopPropagation(); });
function refreshCount() { const n = +store.get('worries', 0); $('worryCount').textContent = n ? tr('已经丢进黑洞的烦恼：{n}', { n }) : ''; }

// ------------------------------------------------------------------ the wake-up report
let stopGalaxy = null, revealTimers = [];
function showReport(elSec) {
  const years = elSec / 60 * YEARS_PER_MIN, mins = Math.round(elSec / 60);
  $('rTitle').innerHTML = mins >= 1 ? tr('你睡了 {m} 分钟', { m: mins }) : tr('你只睡了一小会儿');
  $('rBig').innerHTML = tr('黑洞外面已经过去了 {y}', { y: fmtYears(years, tr) });
  const items = buildReport(years, S.worries, S.seed, tr);
  $('rList').innerHTML = items.map(t => `<li>${t}</li>`).join('');
  $('rYears').textContent = '';
  $('report').hidden = false;
  requestAnimationFrame(() => $('report').classList.add('show'));
  stopGalaxy && stopGalaxy();
  stopGalaxy = galaxyClock($('rCanvas'), years, y => { $('rYears').textContent = tr('{y} 后', { y: fmtYears(y, tr) }); });
  revealTimers.forEach(clearTimeout);
  revealTimers = [...$('rList').children].map((li, i) => setTimeout(() => li.classList.add('show'), 1600 + i * 650));
  document.title = trp('午睡黑洞 · 午睡舱') + ' · 奶蛙.space';
}
function hideReport() {
  stopGalaxy && stopGalaxy(); revealTimers.forEach(clearTimeout);
  $('report').classList.remove('show'); setTimeout(() => { if (!$('report').classList.contains('show')) $('report').hidden = true; }, 1200);
}
$('again').addEventListener('click', () => { setPhase('idle'); startNap(); });
$('rise').addEventListener('click', () => { hideReport(); sound.stopChime(); setPhase('idle'); });

// ------------------------------------------------------------------ the falling dream (easter egg)
const heartsHtml = n => [0, 1, 2].map(i => icon(i < n ? 'heart' : 'heartOff')).join('');
function setDreamMsg(zh) { $('dmsg').innerHTML = tr(zh); $('dmsg').style.opacity = 1; }
const dreamCbs = {
  onShard(n, streak) { $('shardN').textContent = n; sound.shard(streak - 1); },
  onHearts(n) { $('hearts').innerHTML = heartsHtml(n); },
  onHit() { sound.hit(); const h = $('hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 80); try { navigator.vibrate && navigator.vibrate(80); } catch (e) {} },
  onHeal() { sound.heal(); toast('奶蛙给了你一个抱抱，多了一颗心。'); },
  onProgress(p, d) {
    $('gaugeFill').style.height = (p * 100) + '%';
    $('depthTxt').textContent = tr('{n} 米', { n: Math.round(Math.min(d, DEPTH)).toLocaleString('en-US') });
    $('depthTxt').style.top = (p * 100) + '%';
    sound.dreamUpdate(p);
  },
  onTakeover() { setDreamMsg('你在梦里醒了过来。躲开灰色的碎片，收集发光的梦境碎片，一直掉到最深处。'); },
  onPassive() { setDreamMsg('你又睡着了，梦自己往下掉。动一动就能接管。'); },
  onFinish() { toast('光越来越亮了……'); },
  onEnd(kind) {
    if (kind === 'bed') { sound.bedChord(); showBed(); }
    else { toast('你被碎片撞醒了。'); exitDream(); }
  },
};
function enterDream(passive) {
  if (S.dreaming || S.phase === 'wake') return;
  S.dreaming = true; sound.unlock();
  veil(true, 800).then(() => {
    if (!S.dreaming) { veil(false); return; }
    document.body.classList.add('dreaming'); document.body.classList.remove('deep');
    $('dock').style.visibility = 'hidden'; $('frogWrap').style.display = 'none'; $('breath').classList.remove('on');
    $('dreamHud').hidden = false;
    $('shardN').textContent = '0'; $('gaugeFill').style.height = '0';
    $('sub').innerHTML = tr('坠落中');
    dream.start(dreamCbs, { passive, speed: +qs.get('dspeed') || 1 });
    sound.dreamStart();
    setDreamMsg(passive ? '你睡着了，正在往下掉。动一动鼠标或手指，就能接管方向。' : '躲开灰色的碎片，收集发光的梦境碎片。动一动鼠标或手指来控制方向。');
    veil(false, 1200);
  });
}
async function exitDream(quick) {
  if (!S.dreaming) return;
  S.dreaming = false;
  if (!quick) await veil(true, 700);
  dream.stop(); sound.dreamStop();
  $('dreamHud').hidden = true; $('dock').style.visibility = ''; $('frogWrap').style.display = '';
  document.body.classList.remove('dreaming');
  setPhase(S.phase);
  if (S.phase === 'nap') $('breath').classList.add('on');
  touchInput();
  if (!quick) veil(false, 900); else $('veil').classList.remove('on');
}
function showBed() {
  dream.stop();
  $('bed').hidden = false; requestAnimationFrame(() => $('bed').classList.add('show'));
  $('veil').classList.remove('on');
}
$('bedBack').addEventListener('click', async () => {
  $('bed').classList.remove('show'); setTimeout(() => { $('bed').hidden = true; }, 1600);
  await exitDream(true);
});
$('dwake').addEventListener('click', () => exitDream());
// controls
canvas.addEventListener('pointermove', e => { touchInput(); if (dream.active) dream.input(e.clientX / W * 2 - 1, e.clientY / H * 2 - 1); });
canvas.addEventListener('pointerdown', e => { touchInput(); if (dream.active) dream.input(e.clientX / W * 2 - 1, e.clientY / H * 2 - 1); });
addEventListener('pointermove', touchInput, { passive: true });
addEventListener('keydown', e => {
  touchInput();
  if (e.key === 'Escape' && S.dreaming) { exitDream(); return; }
  if (dream.active) { dream.keys[e.key] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); }
});
addEventListener('keyup', e => { dream.keys[e.key] = false; });
// poke the frog three times
$('frog').addEventListener('click', () => {
  const now = performance.now(); sound.unlock();
  S.pokes = S.pokes.filter(t => now - t < 2200); S.pokes.push(now);
  const f = $('frog'); f.classList.remove('poke'); void f.offsetWidth; f.classList.add('poke');
  sound._tone(300 + S.pokes.length * 90, .25, 'sine', .12, 1.4);
  if (S.pokes.length >= 3) { S.pokes = []; toast('奶蛙翻了个身，你们一起掉了下去。'); enterDream(false); }
});

// ------------------------------------------------------------------ hints
function hints() {
  if (S.phase === 'nap') return ['闭上眼睛，跟着光环慢慢呼吸。', '不用做任何事。时间到了，我会叫醒你。', '黑洞里的时间比外面慢得多。'];
  return ['选好时长和声音，就可以睡了。', '有烦心事？先丢进黑洞，它会把字拉成面条。', '戳奶蛙三下试试。'];
}
setInterval(() => { S.hintI++; renderHint(); }, 9000);
function renderHint() { const h = hints(); $('hint').innerHTML = tr(h[S.hintI % h.length]); }

refreshUI = () => {
  buildSetup(); renderHint(); refreshCount();
  document.querySelectorAll('[data-ic]').forEach(el => { el.innerHTML = icon(el.dataset.ic); });
  $('hearts').innerHTML = heartsHtml(dream.g ? dream.g.hearts : 3);
  $('sub').innerHTML = tr(S.dreaming ? '坠落中' : S.phase === 'nap' ? '小睡中' : '午睡舱');
  $('left').textContent = S.phase === 'nap' ? $('left').textContent : mmss(S.dur * 60);
};

// ------------------------------------------------------------------ frame loop
let last = 0, t = 0, ftime = 0, fcount = 0, bt = '';
const cur = { cy: 0, k: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; t += dt;
  // adapt the render scale to the device
  ftime += now - (frame.p || now); frame.p = now; fcount++;
  if (fcount >= 50) { const a = ftime / fcount; if (a > 30 && rs > .4) { rs = Math.max(.4, rs - .12); resize(); } else if (a < 14 && rs < (touch ? .9 : 1)) { rs = Math.min(touch ? .9 : 1, rs + .06); resize(); } ftime = 0; fcount = 0; }

  if (dream.active) { dream.update(dt); dream.render(); return; }

  const ph = t % BREATH_SEC, b = ph < 4 ? ease(ph / 4) : 1 - ease((ph - 4) / 6);
  S.feed = Math.max(0, S.feed - dt * .5);
  const U = lens.uniforms, asp = W / H, base = Math.max(.55, .62 / asp);
  U.uTime.value = t; U.uBreath.value = b; U.uFeed.value = S.feed;
  U.uYaw.value = Math.sin(t * .05) * .1; U.uTilt.value = .09 + Math.sin(t * .07) * .012; U.uDist.value = 15 - b * .25 - (S.phase === 'nap' ? .4 : 0);
  // fit the whole scene (halo + frog) into the space above the dock: measure at the base zoom, then scale
  U.uFov.value = 2 * Math.atan(base); U.uCenterY.value = 0;
  const yaw = U.uYaw.value, rr = 5.6;
  const m0 = lens.project(0, 0, 0, W, H), mt = lens.project(0, 5.2, 0, W, H), mb = lens.project(0, -5.2, 0, W, H), mf = lens.project(Math.sin(yaw) * rr, 0, Math.cos(yaw) * rr, W, H);
  const dTop = m0.y - mt.y, dBot = Math.max(mf.y, mb.y) - m0.y;
  const dockTop = Math.min(H, $('dock').getBoundingClientRect().top), topPad = W < 760 ? 120 : 14, avail = Math.max(120, dockTop - 24 - topPad);
  const wantK = Math.max(.4, Math.min(1.1, avail / (dTop + dBot)));
  const sm = (frame.n = (frame.n || 0) + 1) < 12 ? 1 : Math.min(1, dt * 3);
  cur.k += (wantK - cur.k) * sm;
  const wantCy = topPad + dTop * cur.k + (avail - (dTop + dBot) * cur.k) / 2;
  cur.cy += (wantCy - cur.cy) * sm;
  U.uFov.value = 2 * Math.atan(base / cur.k);
  U.uCenterY.value = (H / 2 - cur.cy) / (H / 2);
  U.uSteps.value = rs < .5 ? 90 : 120;
  U.uDim.value = S.phase === 'nap' ? .92 : 1;
  lens.render(renderer, renderer.domElement.width, renderer.domElement.height);

  const o = lens.project(0, 0, 0, W, H); center = o;
  const f = lens.project(Math.sin(yaw) * rr, 0, Math.cos(yaw) * rr, W, H);
  const fh = Math.min(f.unit * 3.0, H * .34);
  $('frogWrap').style.setProperty('--h', fh + 'px');
  $('frogWrap').style.transform = `translate(${f.x}px,${f.y + (S.phase === 'nap' ? fh * .06 : 0)}px)`;
  const d = o.unit * 7.4;
  $('breath').style.transform = `translate(${o.x}px,${o.y}px)`;
  $('breath').style.setProperty('--d', d + 'px');
  $('breath').querySelector('.ring').style.transform = `scale(${.84 + b * .2})`;
  const label = ph < 4 ? '吸气' : '呼气';
  if (label !== bt) { bt = label; $('breathTxt').innerHTML = tr(label); }
}

// ------------------------------------------------------------------ boot
resize();
cur.cy = innerHeight * .3; cur.k = 1;
applyLang();
setPhase('idle');
requestAnimationFrame(t0 => { last = t0; frame(t0); });
setTimeout(() => toast('欢迎来到午睡舱。先选一个时长。'), 900);

window.wushui = { S, lens, dream, sound, startNap, endNap, enterDream, exitDream, showBed, setNap(sec) { S.napStart = Date.now() - sec * 1000 / TS; } };
