// All sound is generated live with WebAudio (no files): four ambient beds for napping plus a few small effects.
const BREATH = 10; // seconds per breath: 4 in, 6 out

export class Sound {
  constructor() { this.ctx = null; this.master = null; this.bed = null; this.mode = 'off'; this.vol = 0.6; this.dream = null; this.bufs = {}; this.timer = 0; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return !!this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.vol;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; return false; }
    return true;
  }

  setVolume(v) {
    this.vol = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }

  _noise(kind) {
    if (this.bufs[kind]) return this.bufs[kind];
    const c = this.ctx, n = c.sampleRate * 4, buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      // make the loop seamless: crossfade the last 0.25 s into the start
      const f = Math.floor(c.sampleRate * 0.25);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    }
    return (this.bufs[kind] = buf);
  }
  _src(kind) { const s = this.ctx.createBufferSource(); s.buffer = this._noise(kind); s.loop = true; s.loopEnd = 3.75; s.start(); return s; }
  _filt(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  _gain(v) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _lfo(freq, depth, target) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); return o;
  }

  // ---- ambient beds -------------------------------------------------------------------------------
  setMode(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    this._stopBed();
    if (mode === 'off') return;
    const c = this.ctx, out = this._gain(0), nodes = [], timers = [];
    out.connect(this.master);
    const keep = (...n) => nodes.push(...n);
    if (mode === 'white') {
      const s = this._src('white'), f = this._filt('lowpass', 5200), f2 = this._filt('highpass', 90), g = this._gain(0.32);
      s.connect(f); f.connect(f2); f2.connect(g); g.connect(out); keep(s);
    } else if (mode === 'rain') {
      const s = this._src('white'), hp = this._filt('highpass', 700), lp = this._filt('lowpass', 7500), g = this._gain(0.3);
      s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out);
      const r = this._src('brown'), rg = this._gain(0.12), rl = this._filt('lowpass', 240); r.connect(rl); rl.connect(rg); rg.connect(out);
      keep(s, r);
      timers.push(setInterval(() => this._drop(out), 90));
    } else if (mode === 'sea') {
      const s = this._src('brown'), lp = this._filt('lowpass', 900), g = this._gain(0.5);
      s.connect(lp); lp.connect(g); g.connect(out);
      keep(s, this._lfo(1 / 9, 0.32, g.gain));
      const h = this._src('white'), bp = this._filt('bandpass', 2600, 0.5), hg = this._gain(0.0);
      h.connect(bp); bp.connect(hg); hg.connect(out);
      keep(h, this._lfo(1 / 9, 0.05, hg.gain));
      hg.gain.value = 0.05;
    } else if (mode === 'drone') {
      const lp = this._filt('lowpass', 420), g = this._gain(0.34);
      lp.connect(g); g.connect(out);
      for (const [f, v] of [[55, 1], [55.35, .8], [82.4, .5], [110.2, .4], [164.8, .18]]) {
        const o = c.createOscillator(), og = this._gain(v * .3); o.type = f < 100 ? 'sine' : 'triangle'; o.frequency.value = f; o.connect(og); og.connect(lp); o.start(); keep(o);
      }
      keep(this._lfo(1 / BREATH, 0.12, g.gain));
      const nz = this._src('brown'), nl = this._filt('lowpass', 160), ng = this._gain(0.14); nz.connect(nl); nl.connect(ng); ng.connect(out); keep(nz);
      const sh = c.createOscillator(), sg = this._gain(0.0); sh.frequency.value = 880; sh.connect(sg); sg.connect(out); sh.start(); keep(sh, this._lfo(1 / 13, 0.006, sg.gain));
      sg.gain.value = 0.006;
    }
    out.gain.setTargetAtTime(1, c.currentTime, 0.6);
    this.bed = { out, nodes, timers };
  }
  _drop(out) {
    if (Math.random() > 0.55) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = this._gain(0);
    o.type = 'sine'; o.frequency.setValueAtTime(1800 + Math.random() * 2600, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.02, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.08);
  }
  _stopBed() {
    const b = this.bed; if (!b) return;
    this.bed = null;
    const c = this.ctx; b.out.gain.cancelScheduledValues(c.currentTime); b.out.gain.setTargetAtTime(0, c.currentTime, 0.25);
    b.timers.forEach(clearInterval);
    setTimeout(() => { b.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { b.out.disconnect(); } catch (e) {} }, 1600);
  }
  silence() { this._stopBed(); }
  fadeOut(sec = 2) {
    if (!this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, sec / 4);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this._stopBed(); this.dreamStop(); this.master.gain.value = this.vol; }, sec * 1000);
  }
  restore() { clearTimeout(this.timer); if (this.ctx) { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.1); } }

  // ---- effects ------------------------------------------------------------------------------------
  _tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0, bus = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  // gentle wake-up: a slowly rising pentatonic phrase, repeated and getting a little louder
  chime() {
    if (!this.ctx) return;
    this.stopChime();
    const bus = this.chimeBus = this.ctx.createGain(); bus.connect(this.master);
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1318.5];
    for (let rep = 0; rep < 3; rep++) notes.forEach((f, i) => { this._tone(f, 2.4, 'sine', 0.1 + rep * 0.05, 1, rep * 3.2 + i * 0.42, bus); this._tone(f * 2, 1.4, 'triangle', 0.025, 1, rep * 3.2 + i * 0.42, bus); });
  }
  stopChime() { if (this.chimeBus) { this.chimeBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15); this.chimeBus = null; } }
  throwIn() { this._tone(720, 1.3, 'sine', 0.16, 0.12); this._tone(360, 1.5, 'triangle', 0.1, 0.1, 0.08); }
  shard(i = 0) { const f = 523.25 * Math.pow(2, [0, 2, 4, 7, 9, 12][i % 6] / 12); this._tone(f, 0.5, 'sine', 0.16); this._tone(f * 2, 0.35, 'triangle', 0.05); }
  hit() { this._tone(110, 0.5, 'sine', 0.4, 0.3); this._tone(70, 0.6, 'triangle', 0.25, 0.4); }
  heal() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.5, 'sine', 0.14, 1, i * 0.08)); }
  toggle() { this._tone(660, 0.12, 'sine', 0.12); }
  bedChord() { [261.6, 329.6, 392, 523.3].forEach((f, i) => this._tone(f, 5, 'sine', 0.1, 1, i * 0.25)); }

  // ---- falling-dream pad: pitch climbs with depth -------------------------------------------------
  dreamStart() {
    if (!this.ctx || this.dream) return;
    const c = this.ctx, g = this._gain(0), lp = this._filt('lowpass', 900), os = [];
    for (const [r, d] of [[1, -6], [1.5, 5], [2, 0]]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 98 * r; o.detune.value = d; const og = this._gain(0.3 / r); o.connect(og); og.connect(lp); o.start(); os.push(o); }
    lp.connect(g); g.connect(this.master); g.gain.setTargetAtTime(0.28, c.currentTime, 1.2);
    this.dream = { g, os, lp };
  }
  dreamUpdate(p) {
    const d = this.dream; if (!d) return;
    const t = this.ctx.currentTime;
    d.os.forEach((o, i) => o.frequency.setTargetAtTime(98 * [1, 1.5, 2][i] * (1 + p * 1.6), t, 0.4));
    d.lp.frequency.setTargetAtTime(700 + p * 2600, t, 0.4);
  }
  dreamStop() {
    const d = this.dream; if (!d) return; this.dream = null;
    d.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => { d.os.forEach(o => { try { o.stop(); } catch (e) {} }); try { d.g.disconnect(); } catch (e) {} }, 1800);
  }
}
export const BREATH_SEC = BREATH;
