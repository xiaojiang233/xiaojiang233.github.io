// Tiny WebAudio sound effects (no files): soft blips for creating, a low boom for explosions.
export class Sound {
  constructor() { this.ctx = null; this.on = true; this.master = null; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }

  _tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  _noise(dur, vol, f0, f1) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.value = vol; s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }

  pop(i = 0) { this._tone(420 + i * 90, 0.22, 'sine', 0.22, 1.6); this._tone(840 + i * 180, 0.16, 'triangle', 0.08, 1.2); }
  boom() { this._noise(1.6, 0.7, 1400, 60); this._tone(90, 1.0, 'sine', 0.5, 0.4); }
  swoosh() { this._noise(0.35, 0.25, 3000, 400); }
  remove() { this._tone(520, 0.25, 'triangle', 0.16, 0.4); }
  toggle(on) { if (on) this._tone(660, 0.12, 'sine', 0.15); }
}
