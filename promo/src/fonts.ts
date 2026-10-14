import { continueRender, delayRender } from 'remotion';
import w400 from '@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf';
import w700 from '@expo-google-fonts/noto-sans-sc/700Bold/NotoSansSC_700Bold.ttf';
import w900 from '@expo-google-fonts/noto-sans-sc/900Black/NotoSansSC_900Black.ttf';

export const FONT = '"Noto Sans SC", sans-serif';

const handle = delayRender('fonts');
Promise.all(
  ([[w400, '400'], [w700, '700'], [w900, '900']] as const).map(([url, weight]) =>
    new FontFace('Noto Sans SC', `url(${url})`, { weight }).load().then(f => document.fonts.add(f))),
).then(() => continueRender(handle));
