import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import naiwa from '../../naiwa.png';
import { BAR, BEAT, BREAK, DROP, FPS, SONG_START, TOTAL, bar, pulse } from './beat';
import { FONT } from './fonts';

const C = {
  space: '#05060f', text: '#f5f5f7', muted: '#a1a1b5', gold: 'linear-gradient(100deg,#ff9f0a,#ffd60a)',
  goldA: '#ff9f0a', goldB: '#ffd60a', milk: '#f3dcae', leaf: '#5bbf5e', violet: '#8e7dff',
};
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

// ------------------------------------------------------------------ building blocks

const Stars: React.FC<{ n?: number; drift?: number; opacity?: number }> = ({ n = 220, drift = 0.15, opacity = 1 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity }}>
      {Array.from({ length: n }, (_, i) => {
        const x = random(`x${i}`) * 1920, y = random(`y${i}`) * 1080, s = 1 + random(`s${i}`) * 2.4;
        const tw = 0.45 + 0.55 * Math.sin(f / (8 + random(`t${i}`) * 20) + i);
        const z = 0.3 + random(`z${i}`);
        return (
          <div key={i} style={{
            position: 'absolute', left: (x - f * drift * z + 1920 * 4) % 1920, top: y, width: s, height: s, borderRadius: s,
            background: i % 9 === 0 ? C.milk : '#fff', opacity: tw * (0.35 + 0.65 * random(`o${i}`)),
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

const Space: React.FC<{ glow?: number; children?: React.ReactNode }> = ({ glow = 1, children }) => (
  <AbsoluteFill style={{ background: C.space }}>
    <AbsoluteFill style={{
      opacity: glow,
      background: 'radial-gradient(900px 600px at 25% 30%, rgba(255,159,10,.13), transparent 70%), radial-gradient(800px 600px at 80% 75%, rgba(142,125,255,.14), transparent 70%)',
    }} />
    <Stars />
    {children}
  </AbsoluteFill>
);

// a line of text that rises in, frame-local
const Rise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties; dist?: number }> = ({ at, children, style, dist = 40 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at, fps, config: { damping: 200, mass: 0.6 } });
  const blur = interpolate(s, [0, 1], [12, 0]);
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * dist}px)`, filter: `blur(${blur}px)`, ...style }}>{children}</div>
  );
};

const GoldText: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ background: C.gold, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', ...style }}>{children}</span>
);

const Frog: React.FC<{ h: number; style?: React.CSSProperties }> = ({ h, style }) => (
  <Img src={naiwa} style={{ height: h, width: 'auto', ...style }} />
);

const Flash: React.FC<{ at: number; len?: number; color?: string; peak?: number }> = ({ at, len = 8, color = '#fff', peak = 0.85 }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 1, at + len], [0, peak, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: 'none' }} /> : null;
};

// recorded page footage: 80 frames of a real page at 30 fps, stretched over `len` frames
type Clip = { name: string; zoom?: number; origin?: string };
const Footage: React.FC<{ clip: Clip; len: number; frames?: number; zoom?: number }> = ({ clip, len, frames = 80, zoom = 1 }) => {
  const f = useCurrentFrame();
  const i = Math.min(frames - 1, Math.max(0, Math.floor((f * frames) / len)));
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img src={staticFile(`footage/${clip.name}/${String(i).padStart(4, '0')}.jpg`)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transformOrigin: clip.origin || '50% 50%', transform: `scale(${zoom * (clip.zoom || 1)})` }} />
    </AbsoluteFill>
  );
};

// a tall full-page screenshot, scrolled to y (in page px; the page is 1920 wide)
const Page: React.FC<{ src: string; y: number; scale?: number }> = ({ src, y, scale = 1 }) => (
  <AbsoluteFill style={{ overflow: 'hidden' }}>
    <Img src={staticFile(src)} style={{ position: 'absolute', left: 0, top: 0, width: 1920, transformOrigin: '0 0', transform: `scale(${scale}) translateY(${-y}px)` }} />
  </AbsoluteFill>
);

const BrowserFrame: React.FC<{ children: React.ReactNode; url: string; style?: React.CSSProperties }> = ({ children, url, style }) => (
  <div style={{
    position: 'absolute', borderRadius: 22, overflow: 'hidden', background: '#111322',
    boxShadow: '0 40px 120px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.12)', ...style,
  }}>
    <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', background: '#16182a' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map(c => <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c }} />)}
      <div style={{ marginLeft: 24, flex: 1, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.07)', color: C.muted, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{url}</div>
    </div>
    <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 52px)', overflow: 'hidden' }}>{children}</div>
  </div>
);

// the four planets, drawn (no emoji, no icons): same palette as the site's planet cards
const Planet: React.FC<{ kind: number; size: number; spin?: number }> = ({ kind, size, spin = 0 }) => {
  const base: React.CSSProperties = { width: size, height: size, borderRadius: '50%', position: 'relative' };
  if (kind === 0) return (
    <div style={{ ...base, background: 'radial-gradient(circle at 35% 30%, #fff3c4, #ffd60a 40%, #ff9f0a 75%, #a65a00)', boxShadow: '0 0 120px rgba(255,190,10,.45)' }}>
      <Img src={naiwa} style={{ position: 'absolute', height: size * 0.72, left: '50%', top: '52%', transform: 'translate(-50%,-50%)', filter: 'drop-shadow(0 8px 20px rgba(120,60,0,.5))' }} />
    </div>
  );
  if (kind === 1) return (
    <div style={{ ...base, overflow: 'hidden', background: 'radial-gradient(circle at 35% 30%, #bfe8ff, #4aa8ff 40%, #1c62c9 80%, #0d3478)', boxShadow: '0 0 120px rgba(74,168,255,.4)' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${(spin % 240) - 120}px)`, background: 'radial-gradient(60px 90px at 30% 40%, #6fd47a 60%, transparent 62%), radial-gradient(70px 40px at 62% 68%, #5bbf5e 60%, transparent 62%), radial-gradient(40px 50px at 75% 28%, #8de08f 60%, transparent 62%), radial-gradient(60px 90px at 130% 40%, #6fd47a 60%, transparent 62%)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,.35), transparent 45%, rgba(0,0,30,.45) 85%)' }} />
    </div>
  );
  if (kind === 2) return (
    <div style={{ ...base, background: `conic-gradient(from ${spin * 3}deg, #8e7dff, #f3a6ff, #ffd60a, #8e7dff, #4b3bd6, #f3a6ff, #8e7dff)`, filter: 'blur(1px)', boxShadow: '0 0 140px rgba(142,125,255,.55)', maskImage: 'radial-gradient(circle, #000 35%, rgba(0,0,0,.55) 60%, transparent 71%)', WebkitMaskImage: 'radial-gradient(circle, #000 35%, rgba(0,0,0,.55) 60%, transparent 71%)' }} />
  );
  return (
    <div style={{ ...base }}>
      <div style={{ position: 'absolute', inset: -size * 0.18, borderRadius: '50%', background: `conic-gradient(from ${spin * 4}deg, #ff9f0a, #ffd60a, #ff6a00, #ffb340, #ff9f0a)`, maskImage: 'radial-gradient(circle, transparent 46%, #000 50%, #000 58%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, transparent 46%, #000 50%, #000 58%, transparent 70%)', filter: 'blur(2px)' }} />
      <div style={{ position: 'absolute', inset: size * 0.12, borderRadius: '50%', background: '#000', boxShadow: '0 0 60px 20px rgba(255,140,0,.35)' }} />
    </div>
  );
};

// tops of the shop page's sections (page px in footage/shop-full.jpg), one per beat
const SHOP_STOPS = [0, 1300, 2950, 7250, 8300, 9740, 10660, 14900];

const PLANETS = [
  { name: '奶蛙商店', en: 'NAIWA STORE', path: '/shopping', line: '奶蛙、奶蛙 mini、奶蛙 Pro Max，全部在这里。', clips: [] as Clip[] },
  { name: '发呆星', en: 'PLANET DAZE', path: '/daidai', line: '一天有 25 个小时，多出来的那一个专门用来发呆。', clips: [{ name: 'daidai-ride', zoom: 1.12, origin: '35% 40%' }, { name: 'daidai-fp', zoom: 1.12, origin: '35% 40%' }] },
  { name: '抱肚星云', en: 'BELLY NEBULA', path: '/baodu', line: '亲手生成银河。每一颗星星，都住着一个文明。', clips: [{ name: 'baodu-naiwa', zoom: 1.45 }, { name: 'baodu-war' }] },
  { name: '午睡黑洞', en: 'NAP HOLE', path: '/wushui', line: '万物终将被吸进午觉。没有谁想逃出来。', clips: [{ name: 'wushui-hole', zoom: 1.45, origin: '50% 18%' }, { name: 'wushui-dream' }] },
];

// ------------------------------------------------------------------ scenes

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const b1 = bar(1), b2 = bar(2), b3 = bar(3);
  const starIn = interpolate(f, [0, 50], [0, 1], clamp);
  // bar 2: the first star lights up
  const ignite = interpolate(f, [b2, b2 + 6, b2 + BAR], [0, 1, 0.75], clamp);
  const ringR = interpolate(f, [b2, b2 + BAR], [0, 1400], { ...clamp, easing: Easing.out(Easing.cubic) });
  const t = f >= b3 ? f - b3 : -1;
  const frogS = spring({ frame: t, fps: FPS, config: { damping: 14, mass: 0.8 } });
  return (
    <AbsoluteFill style={{ background: C.space, fontFamily: FONT, color: C.text }}>
      <AbsoluteFill style={{ opacity: starIn }}><Stars /></AbsoluteFill>
      {f < b2 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 64, fontWeight: 700, lineHeight: 1.5 }}>
          {f < b1 ? (
            <>
              <Rise at={6} style={{ color: C.muted }}>很久很久以前，</Rise>
              <Rise at={6 + BEAT * 2}>宇宙一片寂静。</Rise>
            </>
          ) : (
            <>
              <Rise at={b1}>直到有一只<GoldText>黄色的小家伙</GoldText>，</Rise>
              <Rise at={b1 + BEAT * 2}>轻轻抱住了自己的肚子。</Rise>
            </>
          )}
        </AbsoluteFill>
      )}
      {f < b2 && f >= b1 && (
        <AbsoluteFill style={{ background: `radial-gradient(700px 300px at 50% ${interpolate(f, [b1, b2], [130, 105])}%, rgba(255,214,10,.35), transparent 70%)` }} />
      )}
      {f >= b2 && f < b3 && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', width: ringR, height: ringR, borderRadius: '50%', border: '2px solid rgba(255,214,10,.5)', opacity: 1 - ringR / 1400 }} />
          <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, background: '#fff', transform: `scale(${0.2 + ignite * (1 + 0.25 * pulse(f, BEAT))})`, boxShadow: `0 0 ${80 * ignite}px ${30 * ignite}px rgba(255,214,10,.9), 0 0 ${300 * ignite}px ${120 * ignite}px rgba(255,159,10,.35)` }} />
          <Rise at={b2 + BEAT} style={{ position: 'absolute', top: 690, fontSize: 64, fontWeight: 700 }}>那一刻，<GoldText>第一颗星星亮了。</GoldText></Rise>
        </AbsoluteFill>
      )}
      {f >= b3 && (
        <AbsoluteFill>
          <AbsoluteFill style={{ background: 'radial-gradient(900px 700px at 32% 55%, rgba(255,190,10,.22), transparent 70%)' }} />
          <div style={{ position: 'absolute', left: 300, top: 150, transform: `translateY(${(1 - frogS) * 500 + Math.sin(t / 14) * 10}px) rotate(${(1 - frogS) * -12}deg)` }}>
            <Frog h={780} style={{ filter: 'drop-shadow(0 30px 60px rgba(255,159,10,.35))' }} />
          </div>
          <div style={{ position: 'absolute', left: 920, top: 330 }}>
            <Rise at={b3 + 4} style={{ fontSize: 30, letterSpacing: 10, color: C.goldB, fontWeight: 700 }}>NAIWA UNIVERSE</Rise>
            <Rise at={b3 + BEAT} style={{ fontSize: 200, fontWeight: 900, lineHeight: 1.15, letterSpacing: -4 }}><GoldText>奶蛙宇宙</GoldText></Rise>
            <Rise at={b3 + BEAT * 2} style={{ fontSize: 46, fontWeight: 700 }}>宇宙从一次抱肚子开始。</Rise>
            <Rise at={b3 + BEAT * 3} style={{ fontSize: 34, color: C.muted, marginTop: 14 }}>欢迎来到奶蛙居住的地方。</Rise>
          </div>
        </AbsoluteFill>
      )}
      <Flash at={b2} color="#fff6d0" peak={0.6} len={14} />
      <Flash at={b3} color="#fff" peak={0.5} len={10} />
    </AbsoluteFill>
  );
};

const Lift: React.FC = () => {
  // local frames: 0 = bar 4
  const f = useCurrentFrame();
  const b1 = bar(1), b3 = bar(3), brk = BREAK - bar(4);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: C.text, background: C.space }}>
      {f < b1 && (
        <Space>
          <BrowserFrame url="奶蛙.space" style={{
            left: 210, top: 120, width: 1500, height: 900,
            transform: `perspective(2000px) rotateX(${interpolate(f, [0, b1], [14, 4])}deg) scale(${interpolate(f, [0, b1], [0.88, 1.0])})`,
            opacity: interpolate(f, [0, 10], [0, 1], clamp),
          }}>
            <Img src={staticFile('footage/home-hero.jpg')} style={{ width: '100%', height: 'auto', transform: `scale(${interpolate(f, [0, b1], [1, 1.05])})`, transformOrigin: '50% 30%' }} />
          </BrowserFrame>
        </Space>
      )}
      {f >= b1 && f < b3 && (
        <Space>
          {PLANETS.map((p, k) => {
            const at = b1 + k * BEAT * 2;
            if (f < at) return null;
            const s = spring({ frame: f - at, fps: FPS, config: { damping: 15, mass: 0.7 } });
            const active = f < at + BEAT * 2 || k === 3;
            const x = 150 + k * 420;
            return (
              <div key={k} style={{ position: 'absolute', left: x, top: 260, width: 360, textAlign: 'center', opacity: active ? 1 : 0.55, transform: `translateY(${(1 - s) * 220}px) scale(${active ? 1 + 0.04 * pulse(f, BEAT) : 0.92})` }}>
                <div style={{ display: 'flex', justifyContent: 'center', height: 300, alignItems: 'center' }}><Planet kind={k} size={240} spin={f} /></div>
                <div style={{ marginTop: 40, fontSize: 26, color: C.goldB, letterSpacing: 6, fontWeight: 700 }}>0{k + 1}</div>
                <div style={{ fontSize: 64, fontWeight: 900, marginTop: 6 }}>{p.name}</div>
                <div style={{ fontSize: 22, color: C.muted, letterSpacing: 6, marginTop: 6 }}>{p.en}</div>
              </div>
            );
          })}
        </Space>
      )}
      {f >= b3 && f < brk && (
        <Space>
          <BrowserFrame url="奶蛙.space/#planets" style={{ left: 160, top: 90, width: 1600, height: 900, transform: `scale(${interpolate(f, [b3, brk], [1, 1.06])})` }}>
            <Page src="footage/home-full.jpg" y={interpolate(f, [b3, brk], [1720, 1980], { ...clamp, easing: ease })} scale={1600 / 1920} />
          </BrowserFrame>
        </Space>
      )}
      {f >= brk && (
        <AbsoluteFill style={{ background: '#000', alignItems: 'center', justifyContent: 'center', fontSize: 120, fontWeight: 900, lineHeight: 1.25, textAlign: 'center' }}>
          <Rise at={brk + 2} dist={20}>四颗星球，</Rise>
          <Rise at={brk + 22} dist={20}><GoldText>一种心情。</GoldText></Rise>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const PlanetSection: React.FC<{ k: number }> = ({ k }) => {
  const f = useCurrentFrame();
  const p = PLANETS[k];
  const half = bar(1), len = bar(2);
  const second = f >= half;
  const zoom = 1.04 + 0.035 * pulse(f, BEAT, 7) + f * 0.0004;
  let bg: React.ReactNode;
  if (k === 0) {
    // the shop page jumps to its next section on every beat
    const i = Math.min(SHOP_STOPS.length - 1, Math.floor(f / BEAT)), ph = (f % BEAT) / BEAT;
    const drift = (k: number, t: number) => SHOP_STOPS[k] + 120 * t;
    const y = i === 0 || ph > 0.3 ? drift(i, i === 0 ? ph : (ph - 0.3) / 0.7) : interpolate(ph, [0, 0.3], [drift(i - 1, 1), SHOP_STOPS[i]], { easing: ease });
    bg = <AbsoluteFill style={{ transform: `scale(${zoom})` }}><Page src="footage/shop-full.jpg" y={y} /></AbsoluteFill>;
  } else {
    bg = second
      ? <Sequence from={half} layout="none"><Footage clip={p.clips[1]} len={len - half} zoom={zoom} /></Sequence>
      : <Footage clip={p.clips[0]} len={half} zoom={zoom} />;
  }
  const title = spring({ frame: f - 2, fps: FPS, config: { damping: 16, mass: 0.7 } });
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: C.text, background: '#000' }}>
      {bg}
      <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(5,6,15,.85) 0%, rgba(5,6,15,.35) 35%, transparent 60%), linear-gradient(90deg, rgba(5,6,15,.55), transparent 50%)' }} />
      <div style={{ position: 'absolute', left: 110, bottom: 110, transform: `translateX(${(1 - title) * -120}px)`, opacity: title }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, color: C.goldB }}>0{k + 1} · {p.en}</div>
        <div style={{ fontSize: 150, fontWeight: 900, lineHeight: 1.15, letterSpacing: -3, transform: `scale(${1 + 0.025 * pulse(f, BEAT, 8)})`, transformOrigin: '0 100%' }}>{p.name}</div>
        <Rise at={BEAT} style={{ fontSize: 40, fontWeight: 700, color: '#e8e8f0' }}>{p.line}</Rise>
      </div>
      <div style={{
        position: 'absolute', right: 90, top: 80, padding: '14px 30px', borderRadius: 40, fontSize: 32, fontWeight: 700,
        background: 'rgba(10,10,20,.55)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(10px)', opacity: title,
      }}>
        奶蛙.space<span style={{ color: C.goldB }}>{p.path}</span>
      </div>
      <Flash at={0} peak={k === 0 ? 1 : 0.75} len={k === 0 ? 14 : 9} />
      <Flash at={half} peak={0.35} len={6} />
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  // local frames: 0 = bar 16
  const f = useCurrentFrame();
  const b1 = bar(1), b2 = bar(2), end = bar(4);
  const cells = [
    <Page key="s" src="footage/shop-full.jpg" y={interpolate(f, [0, b1], [0, 900])} scale={1} />,
    <Footage key="d" clip={PLANETS[1].clips[0]} len={b1} />,
    <Footage key="b" clip={PLANETS[2].clips[0]} len={b1} />,
    <Footage key="w" clip={PLANETS[3].clips[1]} len={b1} />,
  ];
  const t = f - b2;
  const frogS = spring({ frame: t, fps: FPS, config: { damping: 12, mass: 0.9 } });
  const fadeOut = interpolate(f, [end - 30, end], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: C.text, background: C.space, opacity: fadeOut }}>
      {f < b1 && (
        <Space>
          {cells.map((c, i) => {
            const at = i * BEAT;
            const s = spring({ frame: f - at, fps: FPS, config: { damping: 15 } });
            const x = 80 + (i % 2) * 900, y = 60 + Math.floor(i / 2) * 500;
            return f < at ? null : (
              <div key={i} style={{ position: 'absolute', left: x, top: y, width: 860, height: 460, borderRadius: 26, overflow: 'hidden', transform: `scale(${0.6 + 0.4 * s})`, opacity: s, boxShadow: '0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.12)' }}>
                <div style={{ position: 'absolute', width: 1920, height: 1080, transformOrigin: '0 0', transform: 'scale(0.448)' }}>{c}</div>
                <div style={{ position: 'absolute', left: 26, bottom: 20, fontSize: 40, fontWeight: 900, textShadow: '0 4px 20px rgba(0,0,0,.8)' }}>{PLANETS[i].name}</div>
              </div>
            );
          })}
        </Space>
      )}
      {f >= b1 && f < b2 && (
        <Space>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 110, fontWeight: 900, lineHeight: 1.3 }}>
            <Rise at={b1 + 2}>宇宙很大。</Rise>
            <Rise at={b1 + BEAT * 2}><GoldText>抱紧肚子，慢慢逛。</GoldText></Rise>
          </AbsoluteFill>
        </Space>
      )}
      {f >= b2 && (
        <Space>
          <AbsoluteFill style={{ background: 'radial-gradient(800px 600px at 50% 40%, rgba(255,190,10,.25), transparent 70%)' }} />
          <AbsoluteFill style={{ alignItems: 'center' }}>
            <div style={{ marginTop: 70, transform: `translateY(${(1 - frogS) * 300 + Math.sin(t / 15) * 12}px) scale(${0.6 + 0.4 * frogS})` }}>
              <Frog h={520} style={{ filter: 'drop-shadow(0 30px 60px rgba(255,159,10,.4))' }} />
            </div>
            <Rise at={b2 + BEAT} style={{ fontSize: 210, fontWeight: 900, lineHeight: 1.05, letterSpacing: -4, marginTop: 10 }}><GoldText>奶蛙.space</GoldText></Rise>
            <Rise at={b2 + BEAT * 2} style={{ fontSize: 40, color: C.muted, letterSpacing: 8, marginTop: 24 }}>奶蛙宇宙 · NAIWA UNIVERSE</Rise>
          </AbsoluteFill>
        </Space>
      )}
      <Flash at={b1} peak={0.5} len={8} />
      <Flash at={b2} color="#fff6d0" peak={0.8} len={14} />
    </AbsoluteFill>
  );
};

export const Promo: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Audio
      src={staticFile('bgm.mp3')}
      trimBefore={Math.round(SONG_START * FPS)}
      volume={f => interpolate(f, [0, 12, TOTAL - 50, TOTAL], [0, 1, 1, 0], clamp)}
    />
    <Sequence durationInFrames={bar(4)}><Intro /></Sequence>
    <Sequence from={bar(4)} durationInFrames={DROP - bar(4)}><Lift /></Sequence>
    {PLANETS.map((_, k) => (
      <Sequence key={k} from={bar(8 + 2 * k)} durationInFrames={bar(10 + 2 * k) - bar(8 + 2 * k)}><PlanetSection k={k} /></Sequence>
    ))}
    <Sequence from={bar(16)}><Outro /></Sequence>
  </AbsoluteFill>
);
