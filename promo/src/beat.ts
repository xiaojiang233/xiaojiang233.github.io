// Beat grid of the BGM, measured from the track (onset analysis of the kick + hi-hats):
// ~80.5 BPM, one bar = 2.98118 s, bar lines at 60.13 s + n * BAR.
// The promo uses bars 16..36 of the song (1:47.8 – 2:47.5): quiet pre-chorus, lift, a break,
// the big chorus drop at 2:11.7, and the outro.
export const FPS = 30;
export const BAR_SEC = 2.98118;
export const SONG_START = 60.13 + 16 * BAR_SEC; // 107.83 s into the track
export const BAR = BAR_SEC * FPS; // 89.4 frames
export const BEAT = BAR / 4;
export const STEP = BAR / 16; // 16th note
export const bar = (b: number) => Math.round(b * BAR);
export const TOTAL = bar(20);
// the music drops out for a moment right before the chorus
export const BREAK = Math.round((129.8 - SONG_START) * FPS);
export const DROP = bar(8);

// 0..1 envelope that spikes on each beat and decays
export const pulse = (frame: number, every = BEAT, decay = 6) => {
  const ph = (frame % every) / every;
  return Math.exp(-ph * decay);
};
