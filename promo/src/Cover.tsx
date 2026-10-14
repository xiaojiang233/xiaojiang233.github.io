import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, Frog, GoldText, PLANETS, Space } from './Promo';
import { FONT } from './fonts';

// video cover / thumbnail
const SHOTS = ['footage/shop-hero.jpg', 'footage/daidai-ride/0040.jpg', 'footage/baodu-war/0040.jpg', 'footage/wushui-dream/0060.jpg'];

export const Cover: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, color: C.text }}>
    <Space>
      <AbsoluteFill style={{ background: 'radial-gradient(760px 640px at 26% 52%, rgba(255,190,10,.30), transparent 70%)' }} />
      <div style={{ position: 'absolute', left: 120, top: 70 }}>
        <Frog h={940} style={{ filter: 'drop-shadow(0 40px 80px rgba(255,159,10,.45))', transform: 'rotate(-4deg)' }} />
      </div>
      <div style={{ position: 'absolute', left: 820, top: 120, width: 1020 }}>
        <div style={{ fontSize: 34, letterSpacing: 12, color: C.goldB, fontWeight: 700 }}>NAIWA UNIVERSE</div>
        <div style={{ fontSize: 230, fontWeight: 900, lineHeight: 1.12, letterSpacing: -6 }}><GoldText>奶蛙宇宙</GoldText></div>
        <div style={{ fontSize: 60, fontWeight: 900, marginTop: 6 }}>四颗星球，一只奶蛙。</div>
        <div style={{ display: 'flex', gap: 22, marginTop: 60 }}>
          {SHOTS.map((src, i) => (
            <div key={i} style={{ width: 236, borderRadius: 20, overflow: 'hidden', background: '#111322', boxShadow: '0 20px 50px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.14)' }}>
              <Img src={staticFile(src)} style={{ width: 236, height: 150, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '12px 16px', fontSize: 28, fontWeight: 900 }}>{PLANETS[i].name}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 56, display: 'inline-block', padding: '14px 36px', borderRadius: 50, background: 'linear-gradient(100deg,#ff9f0a,#ffd60a)', color: '#1a1200', fontSize: 52, fontWeight: 900 }}>奶蛙.space</div>
      </div>
    </Space>
  </AbsoluteFill>
);
