// All sound is made on the fly with WebAudio: sea, wind, freewheel ticks,
// the bell, star chimes and a very quiet music box for zoning out.
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.started = false; }

  start() {
    if (this.started) { this.ctx && this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.9 : 0;
    // soft room so chimes and the bell ring out a little
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(2.6);
    const vg = ctx.createGain(); vg.gain.value = 0.35;
    this.verb.connect(vg).connect(this.master);
    this.master.connect(ctx.destination);
    const noise = this.noiseBuffer(4);
    // sea: brown-ish noise, low-passed, swelling like waves
    const sea = ctx.createBufferSource(); sea.buffer = noise; sea.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.0;
    sea.connect(lp).connect(this.seaGain).connect(this.master); sea.start();
    const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true; hiss.playbackRate.value = 0.7;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
    this.hissGain = ctx.createGain(); this.hissGain.gain.value = 0;
    hiss.connect(bp).connect(this.hissGain).connect(this.master); hiss.start();
    // wind rises with speed
    const wind = ctx.createBufferSource(); wind.buffer = noise; wind.loop = true; wind.playbackRate.value = 0.5;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = 0.8;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windF).connect(this.windGain).connect(this.master); wind.start();
    this.tickAcc = 0; this.musicAcc = 1.5; this.note = 0;
  }

  noiseBuffer(sec) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.2 + w * 0.12; }
    return b;
  }
  impulse(sec) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }

  setOn(on) {
    this.on = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.1);
  }

  tone(freq, t, dur, vol, type = 'sine', wet = 0.5) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const k of [0, 0.16]) for (const [f, v] of [[2350, 0.16], [3290, 0.07], [5130, 0.04], [6800, 0.02]]) this.tone(f, t + k, 1.1, v, 'sine', 0.4);
  }

  chime(step) {
    if (!this.ctx) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const f = 523.25 * Math.pow(2, scale[Math.min(step, scale.length - 1)] / 12);
    const t = this.ctx.currentTime;
    this.tone(f, t, 0.5, 0.12, 'triangle', 0.6);
    this.tone(f * 2, t, 0.35, 0.04, 'sine', 0.6);
  }

  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.4); f.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    src.connect(f).connect(g).connect(this.master); src.start(t);
  }

  // per frame: speed m/s, pedalling?, how close the sea is (0..1), zoning out?
  update(dt, speed, pedalling, seaNear, dazing, time) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime;
    const swell = 0.55 + 0.45 * Math.sin(time * 0.75) * Math.sin(time * 0.31 + 1);
    this.seaGain.gain.setTargetAtTime((0.1 + 0.16 * seaNear) * (0.6 + 0.4 * swell), t, 0.3);
    this.hissGain.gain.setTargetAtTime((0.015 + 0.04 * seaNear) * Math.max(0, swell - 0.3), t, 0.3);
    this.windGain.gain.setTargetAtTime(Math.min(0.12, speed * speed * 0.0014), t, 0.4);
    this.windF.frequency.setTargetAtTime(380 + speed * 60, t, 0.4);
    // freewheel ticks when coasting
    if (!pedalling && speed > 0.6) {
      this.tickAcc += dt * speed * 4.5;
      while (this.tickAcc > 1) { this.tickAcc -= 1; this.tone(5200 + Math.random() * 400, t + Math.random() * 0.01, 0.025, 0.012, 'square', 0); }
    }
    // music box: sparse, slow, only while zoning out or standing still
    const want = dazing || speed < 0.3;
    if (want) {
      this.musicAcc -= dt;
      if (this.musicAcc <= 0) {
        const pent = [0, 2, 4, 7, 9];
        const step = [0, 2, 4, 3, 1, 2, 0, 4, 3, 2, 1, 0][this.note++ % 12];
        const oct = this.note % 7 === 0 ? 12 : 0;
        const f = 392 * Math.pow(2, (pent[step] + oct) / 12);
        this.tone(f, t, 2.2, 0.05, 'sine', 0.8);
        this.tone(f * 2.01, t, 1.0, 0.012, 'sine', 0.8);
        if (this.note % 4 === 1) this.tone(f / 2, t, 2.6, 0.03, 'triangle', 0.8);
        this.musicAcc = 0.85 + Math.random() * 0.7;
      }
    }
  }
}
