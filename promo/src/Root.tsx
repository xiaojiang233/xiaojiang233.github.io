import { Composition } from 'remotion';
import { Promo } from './Promo';
import { FPS, TOTAL } from './beat';
import './fonts';

export const Root = () => (
  <Composition id="NaiwaPromo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
