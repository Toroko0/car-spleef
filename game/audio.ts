/* Procedural WebAudio SFX - no external assets. */

type Ctx = AudioContext;

class Sfx {
  ctx: Ctx | null = null;
  master: GainNode | null = null;
  engineGain: GainNode | null = null;
  engineOsc: OscillatorNode | null = null;
  engineOsc2: OscillatorNode | null = null;
  engineFilter: BiquadFilterNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  muted = false;
  started = false;

  init() {
    if (this.started) return;
    const AC: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // white noise buffer
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // engine drone
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 6;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 60;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc2.frequency.value = 30;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    this.started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  engine(speed01: number, active: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.engineFilter) return;
    const t = this.ctx.currentTime;
    const f = 48 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    if (this.engineOsc2)
      this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(500 + speed01 * 1800, t, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    delay = 0,
  ) {
    if (!this.ctx || !this.master || this.muted) return;
    const ctx = this.ctx;
    const t = this.now() + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined)
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = "bandpass") {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const ctx = this.ctx;
    const t = this.now();
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  crack(chain: number) {
    const p = 1 + Math.min(10, chain) * 0.06;
    this.noise(0.09, 0.16, 1500 * p, 1.2);
    this.tone(180 * p, 0.07, "square", 0.05, 90);
  }

  crumble() {
    this.noise(0.3, 0.2, 700, 0.8, "lowpass");
    this.tone(70, 0.25, "sine", 0.1, 40);
  }

  pickup() {
    this.tone(660, 0.08, "square", 0.1);
    this.tone(990, 0.1, "square", 0.09, undefined, 0.07);
    this.tone(1320, 0.14, "square", 0.08, undefined, 0.14);
  }

  combo(mult: number) {
    this.tone(440 + mult * 110, 0.12, "triangle", 0.11);
    this.tone(660 + mult * 140, 0.16, "triangle", 0.08, undefined, 0.05);
  }

  boost() {
    this.noise(0.35, 0.14, 900, 0.7, "lowpass");
    this.tone(120, 0.3, "sawtooth", 0.05, 400);
  }

  bump() {
    this.noise(0.12, 0.22, 400, 0.6, "lowpass");
    this.tone(90, 0.12, "square", 0.1, 50);
  }

  fall() {
    this.tone(420, 0.55, "sawtooth", 0.13, 60);
    this.noise(0.5, 0.2, 1200, 0.5, "lowpass");
  }

  /** teetering on the edge of a hole */
  whoa() {
    this.tone(880, 0.18, "triangle", 0.1, 1500);
    this.noise(0.22, 0.1, 2400, 1.4);
  }

  /** survived the teeter */
  save() {
    this.tone(700, 0.1, "square", 0.08, 1200);
    this.tone(1200, 0.14, "square", 0.07, 1600, 0.06);
  }

  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone(f, 0.28, "square", 0.08, undefined, i * 0.07),
    );
  }

  gameOver() {
    [440, 330, 262, 175].forEach((f, i) =>
      this.tone(f, 0.5, "sawtooth", 0.1, f * 0.7, i * 0.16),
    );
    this.noise(1.1, 0.16, 500, 0.4, "lowpass");
  }

  start() {
    [392, 523, 784].forEach((f, i) =>
      this.tone(f, 0.22, "square", 0.09, undefined, i * 0.08),
    );
  }

  ui() {
    this.tone(880, 0.05, "square", 0.05);
  }
}

export const sfx = new Sfx();
