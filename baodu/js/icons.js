// Hand-drawn icon set (inline SVG symbols). One sprite is injected once; icons are used with
// <svg class="ic"><use href="#i-name"/></svg>. Colours come from shared gradients so they match the page.
const defs = `
<linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".55" stop-color="#ffd60a"/><stop offset="1" stop-color="#ff9f0a"/></linearGradient>
<linearGradient id="g-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7ecff"/><stop offset=".5" stop-color="#8fb8ff"/><stop offset="1" stop-color="#7a6cff"/></linearGradient>
<linearGradient id="g-pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc2e8"/><stop offset="1" stop-color="#b86bff"/></linearGradient>
<linearGradient id="g-fire" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ff9f0a"/><stop offset="1" stop-color="#ff4d4d"/></linearGradient>
<linearGradient id="g-green" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4ff9a"/><stop offset="1" stop-color="#6fc24a"/></linearGradient>
<radialGradient id="g-core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff9f0a" stop-opacity="0"/></radialGradient>
<radialGradient id="g-planet" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d9f7d4"/><stop offset=".6" stop-color="#5bbf5e"/><stop offset="1" stop-color="#1e4d20"/></radialGradient>
<filter id="f-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`;

const symbols = {
  // spiral galaxy: two arms around a glowing core
  galaxy: `<g fill="none" stroke-linecap="round">
    <g stroke="url(#g-blue)" stroke-width="3.2"><path d="M24 24c0-6 5-10 11-9 6 1 10 7 8 13"/><path d="M24 24c0-6 5-10 11-9 6 1 10 7 8 13" transform="rotate(180 24 24)"/></g>
    <g stroke="url(#g-pink)" stroke-width="2.2" opacity=".8"><path d="M26 17c4-3 11-1 14 5 2 5 0 10-4 13"/><path d="M26 17c4-3 11-1 14 5 2 5 0 10-4 13" transform="rotate(180 24 24)"/></g></g>
    <circle cx="24" cy="24" r="8" fill="url(#g-core)"/><circle cx="24" cy="24" r="2.6" fill="#fff"/>
    <circle cx="9" cy="9" r="1.1" fill="#fff" opacity=".8"/><circle cx="40" cy="8" r=".9" fill="#fff" opacity=".6"/><circle cx="8" cy="40" r=".9" fill="#fff" opacity=".6"/>`,
  // four-point sparkle star
  star: `<path d="M24 4c1.6 10 4 16 6 18 2 2 8 4.4 14 6-6 1.6-12 4-14 6-2 2-4.4 8-6 14-1.6-6-4-12-6-14-2-2-8-4.4-14-6 6-1.6 12-4 14-6 2-2 4.4-8 6-18z" fill="url(#g-gold)" transform="translate(0 -4) scale(1 1.1) translate(0 2)"/>
    <circle cx="24" cy="24" r="4" fill="#fff"/><circle cx="38" cy="10" r="2" fill="#ffe27a"/><circle cx="10" cy="38" r="1.5" fill="#ffe27a" opacity=".8"/>`,
  // star cluster: a tight swarm of dots
  cluster: `<g fill="url(#g-blue)">
    <circle cx="24" cy="24" r="4.2"/><circle cx="15" cy="19" r="3"/><circle cx="32" cy="17" r="3.4"/><circle cx="31" cy="30" r="3"/><circle cx="17" cy="31" r="3.6"/>
    <circle cx="24" cy="11" r="2"/><circle cx="38" cy="25" r="2"/><circle cx="24" cy="38" r="2.2"/><circle cx="9" cy="25" r="1.8"/></g>
    <g fill="#fff"><circle cx="24" cy="24" r="1.7"/><circle cx="32" cy="17" r="1.2"/><circle cx="17" cy="31" r="1.3"/><circle cx="15" cy="19" r="1"/></g>
    <g fill="#fff" opacity=".7"><circle cx="40" cy="11" r="1"/><circle cx="8" cy="38" r="1"/><circle cx="40" cy="39" r="1"/></g>`,
  // black hole: dark disc, tilted accretion ring, bright photon edge
  bh: `<ellipse cx="24" cy="25" rx="20" ry="6.2" fill="none" stroke="url(#g-fire)" stroke-width="3.4" transform="rotate(-16 24 25)" opacity=".95"/>
    <circle cx="24" cy="24" r="10" fill="#05060f" stroke="url(#g-gold)" stroke-width="1.8"/>
    <path d="M6 31c8 6 28 5 36-3" fill="none" stroke="url(#g-fire)" stroke-width="3.4" stroke-linecap="round" transform="rotate(-16 24 25) translate(0 .2)" opacity=".0"/>
    <path d="M7.5 30.5c9 3 26-1 33-9" fill="none" stroke="#fff3b0" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`,
  // nebula: soft overlapping clouds with a few stars
  nebula: `<g filter="url(#f-soft)"><circle cx="19" cy="20" r="11" fill="#ff7ac8" opacity=".85"/><circle cx="30" cy="25" r="11" fill="#8a6bff" opacity=".85"/><circle cx="22" cy="31" r="9" fill="#4fd4e0" opacity=".7"/></g>
    <g fill="#fff"><circle cx="14" cy="12" r="1.3"/><circle cx="36" cy="13" r="1"/><circle cx="38" cy="34" r="1.2"/><circle cx="25" cy="23" r="1.8"/><circle cx="10" cy="33" r="1"/></g>`,
  // Naiwa: yellow pear-shaped frog hugging its cream belly
  naiwa: `<path d="M24 5c-5.2 0-8.4 3.8-8.4 8.6 0 2.8.9 4.6-.4 6.6C11.8 24.4 10 28 10 32c0 6.4 6 10 14 10s14-3.6 14-10c0-4-1.8-7.6-5.2-11.8-1.3-2-.4-3.8-.4-6.6C32.4 8.8 29.2 5 24 5z" fill="url(#g-gold)"/>
    <ellipse cx="24" cy="33" rx="9" ry="7.6" fill="#fff4d2"/>
    <circle cx="19.6" cy="13.5" r="2.5" fill="#7ed957"/><circle cx="28.4" cy="13.5" r="2.5" fill="#7ed957"/>
    <circle cx="19" cy="12.8" r=".9" fill="#fff"/><circle cx="27.8" cy="12.8" r=".9" fill="#fff"/>
    <path d="M21.5 18.5q2.5 1.6 5 0" fill="none" stroke="#b86a10" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="16.5" cy="31.5" r="3.3" fill="#9aa83a"/><circle cx="31.5" cy="31.5" r="3.3" fill="#9aa83a"/>`,
  // supernova: burst of rays around a white core
  nova: `<g stroke="url(#g-fire)" stroke-width="3" stroke-linecap="round">
      <path d="M24 3v8M24 37v8M3 24h8M37 24h8M9.2 9.2l5.6 5.6M33.2 33.2l5.6 5.6M38.8 9.2l-5.6 5.6M14.8 33.2l-5.6 5.6"/></g>
    <circle cx="24" cy="24" r="10.5" fill="url(#g-fire)"/><circle cx="24" cy="24" r="5.5" fill="#fff3b0"/><circle cx="24" cy="24" r="2.4" fill="#fff"/>`,
  // eraser: a tilted block sweeping away dust
  eraser: `<g transform="rotate(-35 24 24)"><rect x="9" y="15" width="30" height="16" rx="4" fill="#ff9ab8"/><rect x="9" y="15" width="12" height="16" rx="4" fill="#9fc3ff"/><rect x="19" y="15" width="3" height="16" fill="#fff" opacity=".5"/></g>
    <g fill="#fff" opacity=".85"><circle cx="9" cy="39" r="1.7"/><circle cx="16" cy="42" r="1.2"/><circle cx="4.5" cy="33" r="1.1"/><circle cx="40" cy="40" r="1.1"/></g>`,
  // remove: a planet being crossed out
  remove: `<circle cx="22" cy="24" r="13" fill="url(#g-planet)"/><ellipse cx="22" cy="25" rx="20" ry="4.8" fill="none" stroke="#e7c97a" stroke-width="2" transform="rotate(-18 22 25)" opacity=".9"/>
    <circle cx="36" cy="12" r="8.5" fill="#2a0f14" stroke="#ff6b6b" stroke-width="2.4"/><path d="M31.5 7.5l9 9M40.5 7.5l-9 9" stroke="#ff8a8a" stroke-width="2.4" stroke-linecap="round"/>`,
  // gravity grab: horseshoe magnet with field arcs
  grab: `<path d="M13 8v15a11 11 0 0 0 22 0V8" fill="none" stroke="#c9ccd8" stroke-width="6.5"/>
    <rect x="9.8" y="5" width="6.4" height="8" rx="1.2" fill="#ff5d5d"/><rect x="31.8" y="5" width="6.4" height="8" rx="1.2" fill="#6f9dff"/>
    <g fill="none" stroke="url(#g-blue)" stroke-width="2" stroke-linecap="round" opacity=".9"><path d="M17 41c4 3 10 3 14 0"/><path d="M12 45c8 5 16 5 24 0" opacity=".6"/></g>`,
  // top bar
  pause: `<rect x="13" y="10" width="7.5" height="28" rx="2.5" fill="currentColor"/><rect x="27.5" y="10" width="7.5" height="28" rx="2.5" fill="currentColor"/>`,
  play: `<path d="M15 9.5c0-2 2.2-3.2 3.9-2.1l21 14.5c1.5 1 1.5 3.2 0 4.2l-21 14.5c-1.7 1.1-3.9-.1-3.9-2.1z" fill="currentColor"/>`,
  sound: `<path d="M7 19h7l9-8v26l-9-8H7z" fill="currentColor"/><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M30 18c3 3.5 3 8.5 0 12"/><path d="M35 12.5c5.5 6.5 5.5 16.5 0 23"/></g>`,
  mute: `<path d="M7 19h7l9-8v26l-9-8H7z" fill="currentColor"/><path d="M31 18l11 12M42 18L31 30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  gear: `<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="6.5"/>
    <path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M37.5 10.5l-4.2 4.2M14.7 33.3l-4.2 4.2"/></g>`,
  // modes
  eye: `<path d="M3 24C9 14 16 10 24 10s15 4 21 14c-6 10-13 14-21 14S9 34 3 24z" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/><circle cx="24" cy="24" r="6.5" fill="currentColor"/>`,
  spark: `<path d="M24 4c1.5 10 4 16 6 18s8 4.5 14 6c-6 1.5-12 4-14 6s-4.5 8-6 14c-1.5-6-4-12-6-14s-8-4.5-14-6c6-1.5 12-4 14-6s4.5-8 6-18z" fill="currentColor"/>`,
  burst: `<g fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M24 4v9M24 35v9M4 24h9M35 24h9M9.8 9.8l6.4 6.4M31.8 31.8l6.4 6.4M38.2 9.8l-6.4 6.4M16.2 31.8l-6.4 6.4"/></g><circle cx="24" cy="24" r="6" fill="currentColor"/>`,
  // civilization card
  hug: `<path d="M24 41C9 31 6 21 11 14c3-4.5 9-4.5 13 .5 4-5 10-5 13-.5 5 7 2 17-13 27z" fill="url(#g-pink)"/><path d="M15 22c3 3 6 3.5 9 3.5s6-.5 9-3.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>`,
  comet: `<g fill="none" stroke="url(#g-fire)" stroke-linecap="round"><path d="M8 40L28 20" stroke-width="5" opacity=".9"/><path d="M5 30l17-17" stroke-width="3" opacity=".55"/><path d="M18 43l17-17" stroke-width="3" opacity=".55"/></g>
    <circle cx="32" cy="16" r="9" fill="url(#g-gold)"/><circle cx="30" cy="14" r="3" fill="#fff" opacity=".7"/>`,
  war: `<circle cx="9" cy="38" r="5.500" fill="url(#g-green)"/><circle cx="39" cy="10" r="5.500" fill="url(#g-fire)"/>
    <path d="M13 34l9-8-5-2 14-12-6 11 5 1-10 13z" fill="#ff6b4a" stroke="#fff3b0" stroke-width="1.200" stroke-linejoin="round"/>
    <g fill="#fff3b0"><circle cx="41" cy="38" r="1.200"/><circle cx="7" cy="9" r="1.200"/></g>`,
  close: `<path d="M12 12l24 24M36 12L12 36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
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
