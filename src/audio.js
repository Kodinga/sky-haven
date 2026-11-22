// Tiny WebAudio synth for UI sounds + a soft city ambience. No audio files needed.
class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('skyhaven.muted') === '1'; } catch { /* ignore */ }
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startAmbience();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('skyhaven.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  tone(freq, dur = 0.12, type = 'sine', vol = 0.2, delay = 0, slide = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur = 0.25, vol = 0.2, freq = 800) {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  startAmbience() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.05;
    src.connect(f).connect(this.ambGain).connect(this.master);
    src.start();
  }

  click() { this.tone(880, 0.05, 'triangle', 0.08); }
  place() { this.tone(520, 0.09, 'triangle', 0.15); this.tone(780, 0.12, 'sine', 0.1, 0.04); }
  road() { this.tone(300, 0.08, 'square', 0.04); this.noise(0.08, 0.06, 1800); }
  zone() { this.tone(660, 0.08, 'sine', 0.12); this.tone(990, 0.1, 'sine', 0.08, 0.05); }
  bulldoze() { this.noise(0.35, 0.3, 500); this.tone(90, 0.3, 'sawtooth', 0.06, 0, 0.6); }
  error() { this.tone(180, 0.18, 'square', 0.06, 0, 0.8); }
  cash() { this.tone(1320, 0.08, 'triangle', 0.1); this.tone(1760, 0.16, 'triangle', 0.1, 0.07); }
  alert() { this.tone(740, 0.15, 'square', 0.06); this.tone(740, 0.15, 'square', 0.06, 0.22); }
  milestone() { [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.35, 'triangle', 0.14, k * 0.09)); }
}

export const audio = new Audio();
