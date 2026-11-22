// WebAudio synth for UI sounds + a location-aware soundscape. No audio files needed.
//
// The soundscape is a set of continuous "beds" (surf, leaves, city murmur, traffic
// rumble, factory drone, fountain) plus randomly scheduled "events" (birds, crickets,
// gulls, passing cars, horns, clanks, hammering, fire crackle, wind chimes...). The
// GameScene calls `updateScape()` a few times a second with a mix computed from
// whatever is at the centre of the screen (see sim/soundMix.js); each layer fades
// toward its target level and pans toward where that sound lives on screen.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.events = {};
    try { this.muted = localStorage.getItem('skyhaven.muted') === '1'; } catch { /* ignore */ }
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.85;
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);
    this.amb.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 1.2);
    this.buildNoise();
    this.buildBeds();
    return ctx;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('skyhaven.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  // --- building blocks ---------------------------------------------------------
  buildNoise() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const make = (secs, fill) => {
      const b = ctx.createBuffer(1, Math.floor(sr * secs), sr);
      fill(b.getChannelData(0));
      return b;
    };
    this.white = make(2, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.pink = make(5, (d) => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    });
    this.brown = make(5, (d) => {
      let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    });
  }

  loopSrc(buf) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  // gain -> panner -> ambience bus
  channel() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) g.connect(p).connect(this.amb); else g.connect(this.amb);
    return { g, p };
  }

  filter(type, freq, Q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  buildBeds() {
    const ctx = this.ctx;
    const bed = (buf, type, freq, Q) => {
      const ch = this.channel();
      const f = this.filter(type, freq, Q);
      this.loopSrc(buf).connect(f).connect(ch.g);
      return { ...ch, f, level: 0 };
    };
    this.beds = {
      surf: bed(this.pink, 'lowpass', 500, 0.5), // swells scheduled in tick
      leaves: bed(this.pink, 'bandpass', 2200, 0.6),
      murmur: bed(this.pink, 'bandpass', 520, 1.4),
      chatter: bed(this.pink, 'bandpass', 1350, 2.2),
      rumble: bed(this.brown, 'lowpass', 240, 0.6),
      fountain: bed(this.white, 'highpass', 3200, 0.5),
      altitude: bed(this.brown, 'lowpass', 700, 0.4),
    };
    // Factory drone: detuned saws through a lowpass, throbbing at ~1.4 Hz.
    const ch = this.channel();
    const f = this.filter('lowpass', 260, 2);
    const throb = ctx.createGain();
    throb.gain.value = 0.6;
    for (const fr of [49, 73.5, 98.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.4;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(throb.gain);
    lfo.start();
    f.connect(throb).connect(ch.g);
    this.beds.drone = { ...ch, f, level: 0 };
    this.nextSwell = 0;
    this.gust = 0;
  }

  setBed(b, target, pan, tc = 0.8) {
    const t = this.ctx.currentTime;
    b.level = target;
    b.g.gain.setTargetAtTime(target, t, tc);
    if (b.p) b.p.pan.setTargetAtTime(clamp(pan, -0.9, 0.9), t, 0.6);
  }

  // A one-shot voice routed through its own panner into the ambience bus.
  voice(pan = 0, vol = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p).connect(this.amb);
      return { g, p };
    }
    g.connect(this.amb);
    return { g, p: null };
  }

  osc(dest, type, f0, t, dur, vol, f1 = 0, attack = 0.01) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  burst(dest, t, dur, vol, type, freq, Q = 1, buf = this.white) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = this.filter(type, freq, Q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * Math.max(0, buf.duration - dur - 0.1));
    s.stop(t + dur + 0.05);
    return { s, f, g };
  }

  // --- ambient events ----------------------------------------------------------------
  bird(pan) {
    const v = this.voice(pan, rnd(0.04, 0.08));
    let t = this.ctx.currentTime + 0.02;
    const species = Math.floor(Math.random() * 3);
    const n = 2 + Math.floor(Math.random() * 5);
    const base = rnd(2400, 4200);
    for (let k = 0; k < n; k++) {
      if (species === 0) { this.osc(v.g, 'sine', base, t, 0.07, 1, base * 1.5); t += rnd(0.08, 0.13); }
      else if (species === 1) { this.osc(v.g, 'sine', base * 1.3, t, 0.12, 1, base * 0.8); t += 0.16; }
      else { this.osc(v.g, 'sine', base, t, 0.04, 0.8, base * 1.2); t += 0.05; }
    }
  }

  cricket(pan) {
    const v = this.voice(pan, rnd(0.012, 0.025));
    const t0 = this.ctx.currentTime;
    const f = rnd(4200, 5200);
    const pulses = 2 + Math.floor(Math.random() * 3);
    for (let r = 0; r < 2; r++) for (let k = 0; k < pulses; k++) this.osc(v.g, 'sine', f, t0 + r * 0.42 + k * 0.045, 0.03, 1, 0, 0.004);
  }

  gull(pan) {
    const v = this.voice(pan, rnd(0.025, 0.045));
    const f = this.filter('bandpass', 1500, 1.2);
    f.connect(v.g);
    let t = this.ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const o = this.osc(f, 'sawtooth', rnd(1300, 1500), t, 0.32, 1, rnd(700, 850), 0.05);
      const vib = this.ctx.createOscillator();
      const va = this.ctx.createGain();
      vib.frequency.value = 22;
      va.gain.value = 40;
      vib.connect(va).connect(o.frequency);
      vib.start(t);
      vib.stop(t + 0.4);
      t += rnd(0.3, 0.45);
    }
  }

  carPass(pan) {
    const ctx = this.ctx;
    const v = this.voice(0, 1);
    const dur = rnd(1.4, 2.6);
    const t = ctx.currentTime;
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (v.p) {
      v.p.pan.setValueAtTime(clamp(pan - dir * 0.6, -1, 1), t);
      v.p.pan.linearRampToValueAtTime(clamp(pan + dir * 0.6, -1, 1), t + dur);
    }
    const s = ctx.createBufferSource();
    s.buffer = this.pink;
    const f = this.filter('bandpass', 380, 1.1);
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(rnd(700, 950), t + dur * 0.48); // doppler-ish
    f.frequency.linearRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    const vol = rnd(0.12, 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(v.g);
    s.start(t, Math.random() * 3);
    s.stop(t + dur + 0.1);
    // engine tone
    const o = this.osc(v.g, 'sawtooth', rnd(70, 110), t, dur, 0.012, 0, dur * 0.5);
    o.frequency.linearRampToValueAtTime(o.frequency.value * 0.85, t + dur);
  }

  horn(pan) {
    const v = this.voice(pan, 0.025);
    const f = this.filter('lowpass', 1800);
    f.connect(v.g);
    const t = this.ctx.currentTime;
    const dur = Math.random() < 0.6 ? 0.18 : 0.4;
    const reps = Math.random() < 0.4 ? 2 : 1;
    for (let r = 0; r < reps; r++) {
      this.osc(f, 'square', 415, t + r * 0.26, dur, 1, 0, 0.01);
      this.osc(f, 'square', 523, t + r * 0.26, dur, 0.8, 0, 0.01);
    }
  }

  clank(pan) {
    const v = this.voice(pan, rnd(0.03, 0.06));
    const t = this.ctx.currentTime;
    const base = rnd(180, 420);
    for (const r of [1, 2.76, 5.4, 8.93]) this.osc(v.g, 'sine', base * r, t, rnd(0.25, 0.6) / Math.sqrt(r), 0.6 / r, 0, 0.002);
    this.burst(v.g, t, 0.05, 0.8, 'bandpass', 2500, 2);
    if (Math.random() < 0.5) this.burst(v.g, t + 0.18, 0.05, 0.5, 'bandpass', 2200, 2);
  }

  steam(pan) {
    const v = this.voice(pan, 0.05);
    const t = this.ctx.currentTime;
    const b = this.burst(v.g, t, rnd(0.8, 1.6), 1, 'highpass', 2500, 0.5);
    b.g.gain.cancelScheduledValues(t);
    b.g.gain.setValueAtTime(0.0001, t);
    b.g.gain.exponentialRampToValueAtTime(1, t + 0.15);
    b.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  }

  hammer(pan) {
    const v = this.voice(pan, rnd(0.05, 0.09));
    const t0 = this.ctx.currentTime;
    const hits = 2 + Math.floor(Math.random() * 4);
    const gap = rnd(0.22, 0.34);
    const f = rnd(900, 1500);
    for (let k = 0; k < hits; k++) {
      const t = t0 + k * gap;
      this.burst(v.g, t, 0.04, 1, 'bandpass', f, 3);
      this.osc(v.g, 'triangle', f * 0.5, t, 0.08, 0.4, 0, 0.002);
    }
    if (Math.random() < 0.25) { // a power saw now and then
      const o = this.osc(v.g, 'sawtooth', 820, t0 + hits * gap + 0.2, 0.9, 0.12, 760, 0.08);
      o.detune.value = rnd(-30, 30);
    }
  }

  crackle(pan) {
    const v = this.voice(pan, rnd(0.05, 0.14));
    const t = this.ctx.currentTime;
    for (let k = 0; k < 4; k++) this.burst(v.g, t + rnd(0, 0.25), rnd(0.005, 0.02), 1, 'highpass', rnd(1500, 4000), 0.7);
  }

  chime(pan) {
    const v = this.voice(pan, rnd(0.012, 0.025));
    const t = this.ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const f = pick(PENTA) * 2;
      this.osc(v.g, 'sine', f, t + k * rnd(0.15, 0.4), 2.2, 1, 0, 0.003);
      this.osc(v.g, 'sine', f * 2.01, t + k * 0.3, 1.2, 0.25, 0, 0.003);
    }
  }

  bark(pan) {
    const v = this.voice(pan, 0.03);
    const f = this.filter('bandpass', 900, 1.5);
    f.connect(v.g);
    const t = this.ctx.currentTime;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      this.osc(f, 'sawtooth', rnd(520, 640), t + k * 0.28, 0.12, 1, 280, 0.01);
      this.burst(f, t + k * 0.28, 0.1, 0.4, 'bandpass', 1200, 1);
    }
  }

  shopBell(pan) {
    const v = this.voice(pan, 0.02);
    const t = this.ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      this.osc(v.g, 'sine', 2093, t + k * 0.07, 0.6, 1, 0, 0.002);
      this.osc(v.g, 'sine', 3136, t + k * 0.07, 0.4, 0.4, 0, 0.002);
    }
  }

  cheer(pan) {
    const ctx = this.ctx;
    const v = this.voice(pan, 1);
    const t = ctx.currentTime;
    const dur = rnd(2.5, 4);
    const s = ctx.createBufferSource();
    s.buffer = this.pink;
    const f = this.filter('bandpass', 900, 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(v.g);
    s.start(t, Math.random() * 3);
    s.stop(t + dur + 0.1);
  }

  whoosh(pan) {
    const v = this.voice(pan, 0.05);
    const t = this.ctx.currentTime;
    const b = this.burst(v.g, t, 1.1, 1, 'bandpass', 500, 1.5, this.pink);
    b.g.gain.cancelScheduledValues(t);
    b.g.gain.setValueAtTime(0.0001, t);
    b.g.gain.exponentialRampToValueAtTime(1, t + 0.45);
    b.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    b.f.frequency.setValueAtTime(350, t);
    b.f.frequency.linearRampToValueAtTime(700, t + 0.45);
    b.f.frequency.linearRampToValueAtTime(350, t + 1.1);
  }

  // --- soundscape driver -------------------------------------------------------------
  /**
   * @param {object} mix  output of soundMix()
   * @param {number} night 0 (day) .. 1 (night)
   * @param {number} zoom  camera zoom (CSS px), ~0.3 .. 3
   * @param {number} dt seconds since last call
   */
  updateScape(mix, night, zoom, dt) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.beds) return;
    const t = this.ctx.currentTime;
    const B = this.beds, P = mix.pan;
    const day = 1 - night;
    const near = clamp((zoom - 0.3) / 1.2);      // 0 far out .. 1 close up
    const detail = 0.35 + 0.65 * near;           // one-shot event density/volume
    const far = 1 - near;
    const urban = clamp(mix.res + mix.com + mix.ind);

    // Ocean swell: rhythmic surges in level + brightness.
    const surfBase = mix.water * (0.12 + 0.1 * near);
    if (t >= this.nextSwell) {
      const sw = { period: rnd(4.5, 8), peak: rnd(0.7, 1.15) };
      this.nextSwell = t + sw.period;
      B.surf.g.gain.cancelScheduledValues(t);
      B.surf.g.gain.setTargetAtTime(surfBase * sw.peak * 1.6, t, sw.period * 0.18);
      B.surf.g.gain.setTargetAtTime(surfBase * 0.45, t + sw.period * 0.45, sw.period * 0.2);
      B.surf.f.frequency.cancelScheduledValues(t);
      B.surf.f.frequency.setTargetAtTime(900 + 700 * sw.peak, t, sw.period * 0.18);
      B.surf.f.frequency.setTargetAtTime(380, t + sw.period * 0.45, sw.period * 0.2);
      if (B.surf.p) B.surf.p.pan.setTargetAtTime(clamp(P.water, -0.8, 0.8), t, 0.6);
    }

    // Wind gusts through leaves.
    this.gust += (rnd(-1, 1) * 0.6 - this.gust * 0.25) * dt;
    const gust = clamp(0.7 + this.gust, 0.3, 1.3);
    this.setBed(B.leaves, mix.nature * (0.035 + 0.02 * gust) * (0.6 + 0.4 * near), P.nature, 1.2);
    B.leaves.f.frequency.setTargetAtTime(1800 + 900 * gust, t, 1);

    // City murmur: residential is soft, commercial busy; quieter at night.
    const busy = mix.com * 1 + mix.res * 0.35 + (mix.crowd || 0) * 0.5;
    const murmurPan = (P.com * mix.com + P.res * mix.res) / (mix.com + mix.res + 1e-6);
    const flutter = rnd(0.75, 1.25);
    this.setBed(B.murmur, busy * 0.07 * (1 - 0.55 * night) * flutter, murmurPan, 0.25);
    this.setBed(B.chatter, mix.com * 0.035 * day * rnd(0.5, 1.3) * near, P.com, 0.15);

    // Traffic rumble + factory drone + fountains.
    this.setBed(B.rumble, mix.traffic * 0.2 * (1 - 0.4 * night) + urban * 0.05 * far, P.traffic);
    this.setBed(B.drone, mix.ind * 0.05, P.ind);
    B.drone.f.frequency.setTargetAtTime(200 + 200 * near, t, 1);
    this.setBed(B.fountain, mix.park * 0.012 * near, P.park);
    // Far out you hear the wind up high, the city becomes a wash.
    this.setBed(B.altitude, (0.03 + mix.wind * 0.06) * far * far + mix.wind * 0.02, P.wind, 1.5);

    // One-shot events: probability per second.
    const fire = (key, rate, fn, pan) => {
      if (rate <= 0) return;
      const last = this.events[key] || 0;
      if (t - last < 0.15) return;
      if (Math.random() < rate * dt) { this.events[key] = t; fn.call(this, clamp(pan + rnd(-0.25, 0.25), -1, 1)); }
    };
    fire('bird', mix.nature * day * 0.9 * detail + mix.park * day * 0.5, this.bird, P.nature);
    fire('cricket', (mix.nature + mix.park * 0.5) * night * 3 * detail, this.cricket, P.nature);
    fire('gull', mix.water * day * 0.15 * detail, this.gull, P.water);
    fire('car', Math.min(1.8, mix.traffic * 1.6) * detail * (1 - 0.5 * night), this.carPass, P.traffic);
    fire('horn', mix.com * mix.traffic * day * 0.12 * detail, this.horn, P.com);
    fire('clank', mix.ind * 1.1 * detail, this.clank, P.ind);
    fire('steam', mix.ind * 0.12 * detail, this.steam, P.ind);
    fire('hammer', mix.build * 0.9 * detail * (0.3 + 0.7 * day), this.hammer, P.build);
    fire('crackle', mix.fire * 14, this.crackle, P.fire);
    fire('chime', mix.res * 0.12 * detail, this.chime, P.res);
    fire('bark', mix.res * 0.04 * detail, this.bark, P.res);
    fire('shop', mix.com * day * 0.06 * detail, this.shopBell, P.com);
    fire('cheer', (mix.crowd || 0) * 0.08, this.cheer, P.crowd);
    fire('whoosh', mix.wind * 0.8 * detail, this.whoosh, P.wind);
  }

  // --- UI sounds ---------------------------------------------------------------------
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
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur = 0.25, vol = 0.2, freq = 800) {
    const ctx = this.ensure();
    if (!ctx) return;
    this.burst(this.sfx, ctx.currentTime, dur, vol, 'lowpass', freq, 0.7);
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
