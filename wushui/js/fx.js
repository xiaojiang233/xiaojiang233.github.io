// Small effects: throwing a worry into the hole (the words get stretched into noodles), and the wake-up report.

// Each character of the worry spirals toward the hole, stretched along the radial direction (spaghettification).
export function throwWorry(fx, text, from, to, done) {
  const chars = [...text].slice(0, 40), n = chars.length;
  const spans = chars.map(ch => { const s = document.createElement('span'); s.textContent = ch; fx.appendChild(s); return s; });
  const t0 = performance.now(), total = 3600, stag = Math.min(90, 900 / Math.max(1, n));
  const dir = Math.random() < .5 ? -1 : 1;
  const st = chars.map((_, i) => { const x = from.x + (i - n / 2) * 20, y = from.y, dx = x - to.x, dy = y - to.y; return { r0: Math.hypot(dx, dy), a0: Math.atan2(dy, dx) }; });
  function tick(now) {
    let alive = 0;
    spans.forEach((s, i) => {
      const p = Math.min(1, Math.max(0, (now - t0 - i * stag) / (total - n * stag)));
      if (p >= 1) { s.style.opacity = 0; return; }
      alive++;
      const e = p * p * (3 - 2 * p), q = Math.pow(e, 1.35);
      const r = st[i].r0 * Math.pow(1 - q, 1.7), a = st[i].a0 + dir * q * (3.2 + i * .06);
      const x = to.x + Math.cos(a) * r, y = to.y + Math.sin(a) * r * .5;
      const stretch = 1 + 14 * Math.pow(p, 3), thin = Math.max(.06, 1 - Math.pow(p, 1.6) * .94);
      const ang = Math.atan2(to.y - y, to.x - x);
      s.style.transform = `translate(${x}px,${y}px) rotate(${ang}rad) scale(${stretch},${thin}) translate(-50%,-50%)`;
      s.style.opacity = Math.max(0, 1 - Math.pow(p, 4));
      s.style.color = p > .5 ? `hsl(${45 - 30 * (p - .5) * 2}, 100%, ${88 - 30 * (p - .5) * 2}%)` : '';
    });
    if (alive) requestAnimationFrame(tick); else { spans.forEach(s => s.remove()); done && done(); }
  }
  requestAnimationFrame(tick);
}

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = n => Math.round(n).toLocaleString('en-US');

export function fmtYears(y, tr) {
  if (y < 1) return tr('{d} 天', { d: Math.max(1, Math.round(y * 365)) });
  if (y < 10) return tr('{y} 年', { y: y.toFixed(1) });
  return tr('{y} 年', { y: fmt(y) });
}

// What happened outside while you slept, in proportion to how many years went by.
export function buildReport(years, worries, seed, tr) {
  const R = rng(seed), y = years, ys = fmtYears(y, tr);
  const lamps = Math.max(1, Math.round(y * (2.4 + R() * 1.6))), lit = Math.max(1, Math.round(lamps * .06));
  const stars = Math.max(3, Math.round(y * (30 + R() * 30))), civ = Math.max(1, Math.round(stars * .03)), wars = Math.max(0, Math.round(civ * (.2 + R() * .3)));
  const gen = Math.max(1, Math.round(y / 11));
  const unread = Math.max(1, Math.round(y * (300 + R() * 200)));
  const pool = [
    tr('发呆星的海边多了 {n} 盏路灯，其中 {m} 盏还亮着。', { n: fmt(lamps), m: fmt(lit) }),
    tr('抱肚星云里长出了 {n} 颗新的星星，{m} 颗有了自己的文明，已经打了 {w} 场仗。', { n: fmt(stars), m: fmt(civ), w: fmt(wars) }),
    tr('奶蛙家族传到了第 {n} 代，大家依然抱着肚子。', { n: fmt(gen + 1) }),
    tr('你点的外卖已经凉了 {y}。建议不要再吃了。', { y: ys }),
    tr('手机里多了 {n} 条未读消息，其中 0 条是重要的。', { n: fmt(unread) }),
    tr('你睡前想不通的那件事，现在已经没有人记得了。', {}),
  ];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const items = pool.slice(0, 4);
  items.push(worries > 0 ? tr('你丢进来的 {n} 件烦心事被拉成了面条，现在正在黑洞的另一头晾着。', { n: worries })
                         : tr('你原来的那些烦恼，已经过期 {y}了，不用再想了。', { y: ys }));
  return items;
}

// A small spiral galaxy that spins up to show how long it has been out there.
export function galaxyClock(canvas, years, onYears) {
  const c = canvas.getContext('2d'), W = canvas.width, N = 640, R = (() => { let a = 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  const stars = [];
  for (let i = 0; i < N; i++) { const arm = i % 3, r = Math.pow(R(), .7) * .46, a = arm * 2.094 + r * 9 + (R() - .5) * .55; stars.push({ r, a, s: .6 + R() * 1.4, h: R() }); }
  const t0 = performance.now(), dur = 2600; let raf = 0;
  function draw(now) {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3), yy = years * e, rot = e * Math.min(6.28 * 3, years * .05 + 1);
    c.clearRect(0, 0, W, W);
    const g = c.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W * .3);
    g.addColorStop(0, 'rgba(255,225,150,.55)'); g.addColorStop(1, 'rgba(255,225,150,0)'); c.fillStyle = g; c.fillRect(0, 0, W, W);
    for (const s of stars) {
      const a = s.a + rot * (1.6 - s.r * 2.2), x = W / 2 + Math.cos(a) * s.r * W, y = W / 2 + Math.sin(a) * s.r * W * .62;
      const hue = 45 + (s.h * 200 - 40) * Math.min(1, e * (years / 300)) + (s.r > .3 ? 190 * (1 - s.r * 2) * 0 : 0);
      c.fillStyle = `hsla(${hue}, 85%, ${72 + s.h * 18}%, ${.5 + .5 * s.h})`;
      c.beginPath(); c.arc(x, y, s.s * (W / 190), 0, 6.283); c.fill();
    }
    onYears && onYears(yy);
    if (p < 1) raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}
