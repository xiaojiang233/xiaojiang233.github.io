// Full-page stills of the homepage and the shop; the promo pans across them.
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import { mkdirSync } from 'node:fs';
const ROOT = process.env.SITE || 'http://localhost:8765';
const OUT = new URL('../public/footage/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
for (const [name, path] of [['home', '/?lang=zh'], ['shop', '/shopping/?lang=zh']]) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  await p.goto(ROOT + path, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + name + '-hero.jpg', quality: 92 });
  await p.screenshot({ path: OUT + name + '-full.jpg', quality: 90, fullPage: true });
  await p.close();
}
await b.close();
