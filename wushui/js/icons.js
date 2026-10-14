// Hand-drawn icon set (inline SVG symbols), same scheme as Belly-Hug Nebula: one sprite is injected once,
// icons are used with <svg class="ic"><use href="#i-name"/></svg>. No emoji anywhere on this page.
const defs = `
<linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".55" stop-color="#ffd60a"/><stop offset="1" stop-color="#ff9f0a"/></linearGradient>
<linearGradient id="g-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7ecff"/><stop offset=".5" stop-color="#8fb8ff"/><stop offset="1" stop-color="#7a6cff"/></linearGradient>
<linearGradient id="g-violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6dcff"/><stop offset=".5" stop-color="#a493ff"/><stop offset="1" stop-color="#6a55e8"/></linearGradient>
<linearGradient id="g-pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc2e8"/><stop offset="1" stop-color="#b86bff"/></linearGradient>
<linearGradient id="g-fire" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ff9f0a"/><stop offset="1" stop-color="#ff4d4d"/></linearGradient>
<linearGradient id="g-teal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8fff4"/><stop offset="1" stop-color="#2fb7c9"/></linearGradient>`;

const symbols = {
  // crescent moon with two stars
  moon: `<path d="M30 6.5A17.5 17.5 0 1 0 41.5 31 14 14 0 0 1 30 6.5z" fill="url(#g-violet)"/>
    <path d="M12 12.5l1.2 2.7 2.7 1.2-2.7 1.2-1.2 2.7-1.200-2.700-2.700-1.200 2.700-1.200z" fill="#fff3b0"/><circle cx="38" cy="14" r="1.700" fill="#fff3b0"/>`,
  // white noise: a row of equaliser bars
  white: `<g fill="url(#g-blue)"><rect x="6" y="19" width="6" height="12" rx="3"/><rect x="14.500" y="10" width="6" height="28" rx="3"/><rect x="23" y="15" width="6" height="18" rx="3"/><rect x="31.500" y="7" width="6" height="34" rx="3"/></g><rect x="40" y="20" width="4" height="9" rx="2" fill="#bcd6ff" opacity=".8"/>`,
  // rain: a cloud with falling drops
  rain: `<path d="M14 28a8 8 0 0 1 .8-16A11 11 0 0 1 36 13.500 7.300 7.300 0 0 1 35 28z" fill="url(#g-blue)"/>
    <g stroke="#8fb8ff" stroke-width="3.200" stroke-linecap="round"><path d="M15 34l-2 6M24 34l-2 8M33 34l-2 6"/></g>`,
  // sea: three layered waves
  sea: `<g fill="none" stroke-linecap="round" stroke-width="4"><path d="M5 15c4-5 8-5 12 0s8 5 12 0 8-5 14 0" stroke="#bfe9ff"/><path d="M5 25c4-5 8-5 12 0s8 5 12 0 8-5 14 0" stroke="#6fc2ff"/><path d="M5 35c4-5 8-5 12 0s8 5 12 0 8-5 14 0" stroke="#4a8dff"/></g>`,
  // black hole hum: ringed dark disc
  hole: `<ellipse cx="24" cy="25" rx="20" ry="6.200" fill="none" stroke="url(#g-fire)" stroke-width="3.400" transform="rotate(-14 24 25)" opacity=".95"/>
    <circle cx="24" cy="24" r="9.500" fill="#05060f" stroke="url(#g-gold)" stroke-width="1.800"/>
    <path d="M7.500 30.500c9 3 26-1 33-9" fill="none" stroke="#fff3b0" stroke-width="1.400" stroke-linecap="round" opacity=".7"/>`,
  // silence: speaker with a slash
  off: `<path d="M8 19h7l9-7v24l-9-7H8z" fill="currentColor" opacity=".9"/><path d="M31 18l11 12M42 18L31 30" stroke="currentColor" stroke-width="3.400" stroke-linecap="round"/>`,
  sound: `<path d="M8 19h7l9-7v24l-9-7H8z" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round"><path d="M30 18a8 8 0 0 1 0 12"/><path d="M35 13a15 15 0 0 1 0 22" opacity=".7"/></g>`,
  bell: `<path d="M24 6c-7 0-11 5-11 12 0 8-3 9-5 12h32c-2-3-5-4-5-12 0-7-4-12-11-12z" fill="url(#g-gold)"/><path d="M19 35a5 5 0 0 0 10 0z" fill="#ff9f0a"/><circle cx="24" cy="6" r="2.200" fill="#ff9f0a"/>`,
  // heart (dream lives)
  heart: `<path d="M24 41C9 31 6 21 11 14c3-4.500 9-4.500 13 .5 4-5 10-5 13-.5 5 7 2 17-13 27z" fill="url(#g-pink)"/><path d="M14 19c1-2.500 3.500-3.500 6-2.500" fill="none" stroke="#fff" stroke-width="2.200" stroke-linecap="round" opacity=".8"/>`,
  heartOff: `<path d="M24 41C9 31 6 21 11 14c3-4.500 9-4.500 13 .5 4-5 10-5 13-.5 5 7 2 17-13 27z" fill="none" stroke="#8a8aa3" stroke-width="2.600" stroke-dasharray="3 4" stroke-linecap="round"/>`,
  // dream shard: a four-pointed crystal
  shard: `<path d="M24 3l8 15 13 6-13 6-8 15-8-15L3 24l13-6z" fill="url(#g-teal)"/><path d="M24 3l8 15-8 6z" fill="#fff" opacity=".45"/><circle cx="24" cy="24" r="3" fill="#fff"/>`,
  // spiral for the worries
  swirl: `<path d="M24 24m0 0c0-3 4-3 4 0s-5 5-8 2-1-10 6-10 12 6 11 14-9 12-16 10S6 33 8 24" fill="none" stroke="url(#g-pink)" stroke-width="3.600" stroke-linecap="round"/>`,
  // bed with pillow
  bed: `<rect x="5" y="30" width="38" height="6" rx="2" fill="#a47a5a"/><rect x="5" y="22" width="38" height="9" rx="3" fill="url(#g-pink)"/><rect x="7" y="15" width="14" height="9" rx="4.500" fill="#fff4d2"/><path d="M5 22h38" stroke="#fff" stroke-width="1.400" opacity=".5"/><rect x="5" y="34" width="4" height="9" rx="1.500" fill="#7d5a40"/><rect x="39" y="34" width="4" height="9" rx="1.500" fill="#7d5a40"/>`,
  // wake up: a sun with rays
  sun: `<g stroke="url(#g-fire)" stroke-width="3.400" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.900 9.900l4.200 4.200M33.900 33.900l4.200 4.200M38.100 9.900l-4.200 4.200M14.100 33.900l-4.200 4.200"/></g><circle cx="24" cy="24" r="9" fill="url(#g-gold)"/>`,
  clock: `<circle cx="24" cy="24" r="18" fill="none" stroke="url(#g-blue)" stroke-width="4"/><path d="M24 13v11l7 5" fill="none" stroke="#fff3b0" stroke-width="3.600" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M12 12l24 24M36 12L12 36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
  send: `<path d="M6 24L42 8 30 40l-6-13z" fill="url(#g-gold)"/><path d="M24 27L42 8" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
};

let injected = false;
export function injectIcons() {
  if (injected) return;
  injected = true;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>${defs}</defs>${Object.entries(symbols).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 48 48">${v}</symbol>`).join('')}</svg>`;
  document.body.prepend(el);
}
export const icon = (name, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
