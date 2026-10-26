export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.last = {};
    this.ambient = null;
    this.started = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.22;
    this.comp.connect(this.master);
    this.started = true;
    this.startAmbient();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.55, this.ctx.currentTime + 0.15);
    }
  }

  throttle(key, ms) {
    if (!this.ctx) return false;
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  tone(freq, duration, type = 'square', volume = 0.05, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.comp || this.master);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  noise(duration, volume = 0.05, filterFreq = 700, type = 'lowpass', delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const length = Math.ceil(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.comp || this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  click() {
    if (!this.ctx) return;
    this.tone(620, 0.045, 'square', 0.025, -90);
  }

  select() {
    if (!this.ctx) return;
    this.tone(440, 0.04, 'square', 0.02);
    this.tone(760, 0.06, 'square', 0.016, 0, 0.04);
  }

  ack() {
    if (!this.ctx) return;
    this.tone(310, 0.055, 'square', 0.022);
    this.tone(515, 0.08, 'square', 0.018, 0, 0.05);
  }

  deny() {
    if (!this.ctx) return;
    this.tone(160, 0.08, 'sawtooth', 0.03, -45);
    this.tone(120, 0.1, 'sawtooth', 0.025, -30, 0.08);
  }

  train() {
    if (!this.ctx) return;
    this.tone(520, 0.05, 'triangle', 0.026);
    this.tone(690, 0.07, 'triangle', 0.02, 0, 0.06);
  }

  build() {
    if (!this.ctx) return;
    this.tone(290, 0.1, 'square', 0.022);
    this.tone(435, 0.1, 'square', 0.02, 0, 0.1);
    this.tone(650, 0.18, 'triangle', 0.024, 0, 0.2);
  }

  complete() {
    if (!this.ctx) return;
    this.tone(392, 0.08, 'triangle', 0.03);
    this.tone(523, 0.08, 'triangle', 0.028, 0, 0.08);
    this.tone(784, 0.19, 'triangle', 0.025, 0, 0.16);
  }

  shot(kind = 'rifle') {
    if (!this.ctx || !this.throttle('shot' + kind, kind === 'tank' ? 80 : 38)) return;
    if (kind === 'tank') {
      this.noise(0.16, 0.055, 380);
      this.tone(86, 0.15, 'sawtooth', 0.035, -30);
    } else if (kind === 'turret') {
      this.noise(0.07, 0.028, 1200);
      this.tone(240, 0.05, 'square', 0.018, -80);
    } else {
      this.noise(0.045, 0.017, 2100);
      this.tone(340, 0.035, 'square', 0.009, -120);
    }
  }

  explosion(size = 1) {
    if (!this.ctx) return;
    if (!this.throttle('explosion', 55)) return;
    this.noise(0.27 + size * 0.12, 0.08 * Math.min(1.8, size), 520);
    this.tone(62, 0.24, 'sawtooth', 0.045, -22);
  }

  buildSite() {
    this.tone(240, 0.08, 'square', 0.02);
    this.tone(330, 0.08, 'square', 0.018, 0, 0.06);
  }

  alert() {
    if (!this.ctx) return;
    this.tone(880, 0.09, 'sawtooth', 0.025);
    this.tone(660, 0.09, 'sawtooth', 0.025, 0, 0.12);
    this.tone(880, 0.09, 'sawtooth', 0.025, 0, 0.24);
  }

  victory() {
    if (!this.ctx) return;
    const notes = [392, 523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.32, 'triangle', 0.04, 0, i * 0.16));
    this.tone(261, 1.4, 'sine', 0.03);
  }

  defeat() {
    if (!this.ctx) return;
    const notes = [330, 294, 247, 196];
    notes.forEach((n, i) => this.tone(n, 0.42, 'triangle', 0.04, -12, i * 0.23));
    this.noise(1.2, 0.035, 240);
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const t = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.018;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const oscA = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 43.65;
    const oscB = this.ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 65.4;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.007;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start(t);
    oscB.start(t);
    lfo.start(t);
    this.ambient = { oscA, oscB, lfo, gain };
  }
}
