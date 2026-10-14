// Records real footage of the 奶蛙.space pages, frame by frame, for the promo.
// Uses Playwright's fake clock so every frame advances exactly 1/30 s, no matter how slow
// the (GPU-less) renderer is. Usage: node capture/capture.mjs [shot ...]   (serve the repo root on :8765 first)
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import { mkdirSync, rmSync } from 'node:fs';

const ROOT = process.env.SITE || 'http://localhost:8765';
const OUT = new URL('../public/footage/', import.meta.url).pathname;
const DT = 1000 / 30;
const HIDE_UI = `*:not(html):not(body):not(canvas){visibility:hidden!important} canvas{visibility:visible!important}`;

// helpers run inside the page
const waitFor = async (p, fn, max = 400) => { for (let k = 0; k < max; k++) { if (await p.evaluate(fn)) return; await p.clock.runFor(50); } throw new Error('timeout ' + fn); };

const SHOTS = {
  'daidai-ride': {
    url: '/daidai/?autostart&lang=zh&q=high', frames: 80, css: HIDE_UI,
    async setup(p) {
      await waitFor(p, () => window.daidai && window.daidai.G.mode !== 'intro');
      await p.evaluate(() => { const d = window.daidai; d.input.up = true; d.sim(9); });
    },
  },
  'daidai-fp': {
    url: '/daidai/?autostart&lang=zh&q=high', frames: 80, css: HIDE_UI,
    async setup(p) {
      await waitFor(p, () => window.daidai && window.daidai.G.mode !== 'intro');
      await p.evaluate(() => { const d = window.daidai; d.nextTime(); d.input.up = true; d.sim(14); d.toggleView(); });
      await p.clock.runFor(1500);
    },
  },
  'baodu-naiwa': {
    url: '/baodu/?lang=zh&p=naiwa&civ=0', frames: 80, size: [1920, 1080], css: HIDE_UI,
    async setup(p) {
      await waitFor(p, () => !!window.baodu);
      await p.evaluate(() => { window.baodu.step(6); window.baodu.view(0.6, 0.55, 38); });
      await p.clock.runFor(600);
    },
  },
  'baodu-war': {
    url: '/baodu/?lang=zh&p=milky', frames: 80, size: [1920, 1080], css: HIDE_UI,
    async setup(p) {
      await waitFor(p, () => !!window.baodu);
      await p.evaluate(() => { window.baodu.step(40); window.baodu.view(-0.4, 0.75, 30); });
      await p.clock.runFor(600);
    },
  },
  'wushui-hole': {
    url: '/wushui/?lang=zh&rs=.6', frames: 80,
    async setup(p) { await waitFor(p, () => !!window.wushui); await p.clock.runFor(2500); },
  },
  'wushui-dream': {
    url: '/wushui/?lang=zh&rs=.6&dream=1&dspeed=1.4', frames: 80,
    async setup(p) {
      await waitFor(p, () => !!window.wushui);
      await p.clock.runFor(500);
      await p.evaluate(() => window.wushui.startNap());
      await waitFor(p, () => window.wushui.S.dreaming, 800);
      await p.clock.runFor(4000);
    },
  },
};

async function shot(browser, name) {
  const s = SHOTS[name];
  const dir = OUT + name + '/';
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const p = await browser.newPage({ viewport: { width: (s.size || [1280])[0], height: (s.size || [0, 720])[1] } });
  await p.clock.install({ time: new Date('2026-10-14T12:00:00') });
  await p.clock.pauseAt(new Date('2026-10-14T12:00:01'));
  await p.goto(ROOT + s.url);
  await p.waitForTimeout(1200);
  await s.setup(p);
  if (s.css) await p.addStyleTag({ content: s.css });
  for (let i = 0; i < s.frames; i++) {
    await p.clock.runFor(DT);
    await p.screenshot({ path: dir + String(i).padStart(4, '0') + '.jpg', quality: 88, timeout: 0 });
    if (i % 10 === 0) console.log(name, i);
  }
  await p.close();
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS)) await shot(browser, name);
await browser.close();
