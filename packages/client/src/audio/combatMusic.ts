/**
 * The in-match soundtrack: an upbeat 90s garage-rock loop synthesized live
 * (distorted power chords, a driving bass, a real-sounding kit made of noise
 * and pitched sines). Intensity follows the match: a laid-back groove in the
 * build phase, the full band in waves, and a lead line on top for the boss.
 */

export type Intensity = 0 | 1 | 2 | 3;

const BPM = 152;
const STEP = 60 / BPM / 4; // sixteenth notes
// E minor pentatonic riffing: E, G, A, C, D as roots per bar (x2 = 8 bars).
const ROOTS = [40, 40, 43, 45, 40, 40, 48, 50];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
const RIFF = [0, 0, 12, 0, 7, 0, 12, 10, 0, 0, 12, 0, 7, 5, 3, 5];
const LEAD = [24, -1, 22, 24, 27, -1, 24, 22, 19, -1, 22, 19, 17, 19, 15, -1];

export class CombatMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private drive: WaveShaperNode | null = null;
  private noise: AudioBuffer | null = null;
  private step = 0;
  private next = 0;
  private timer = 0;
  private intensity: Intensity = 0;
  private volume = 0.5;

  start(volume: number): void {
    this.volume = volume;
    if (this.ctx) { void this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    this.out.connect(comp).connect(ctx.destination);
    // Guitar amp: soft-clip curve into a cabinet-ish low-pass.
    this.drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 6); }
    this.drive.curve = curve;
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 3200;
    const guitarGain = ctx.createGain();
    guitarGain.gain.value = 0.16;
    this.drive.connect(cab).connect(guitarGain).connect(this.out);
    const len = ctx.sampleRate * 0.4;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.next = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
    this.applyVolume();
  }

  stop(): void {
    clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyVolume();
  }

  setIntensity(level: Intensity): void {
    if (level === this.intensity) return;
    this.intensity = level;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx || !this.out) return;
    const target = this.intensity === 0 ? 0 : this.volume * (this.intensity === 1 ? 0.3 : 0.5);
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.2) {
      this.play(this.step, this.next);
      this.next += STEP;
      this.step = (this.step + 1) % (16 * ROOTS.length);
    }
  }

  private play(i: number, t: number): void {
    const s = i % 16;
    const root = ROOTS[Math.floor(i / 16)];
    const full = this.intensity >= 2;
    if (this.intensity === 0) return;
    // Drums: laid back in the build phase (kick + ride), the whole kit in waves.
    if (KICK[s] || (!full && s === 8)) this.kick(t);
    if (full && SNARE[s]) this.snare(t, s === 15 ? 0.5 : 1);
    if (s % 2 === 0 || full) this.hat(t, s % 4 === 0 ? 0.08 : 0.04);
    if (full && s === 0 && Math.floor(i / 16) % 4 === 0) this.crash(t);
    // Bass follows the riff an octave down.
    const r = RIFF[s];
    if (s % 2 === 0 || full) this.bass(midi(root - 12 + (full ? r % 12 : 0)), t, STEP * (full ? 0.9 : 1.8));
    // Power chords (root + fifth + octave) through the amp.
    if (full && (s % 4 === 0 || s === 6 || s === 14)) this.chord(midi(root + (r % 12 === 7 ? 7 : r % 12 === 10 ? 10 : 0)), t, STEP * (s % 4 === 0 ? 1.8 : 0.9));
    // Boss: a screaming lead line on top.
    if (this.intensity === 3 && LEAD[s] >= 0) this.lead(midi(root + LEAD[s]), t, STEP * 0.95);
  }

  private env(t: number, peak: number, attack: number, dur: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const g = this.env(t, 0.9, 0.002, 0.35, this.out!);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, gain: number, dur: number, type: BiquadFilterType, freq: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, gain, 0.002, dur, this.out!));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number, v: number): void {
    this.noiseHit(t, 0.5 * v, 0.18, 'bandpass', 1800);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    o.connect(this.env(t, 0.25 * v, 0.002, 0.1, this.out!));
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, gain: number): void {
    this.noiseHit(t, gain, 0.05, 'highpass', 7000);
  }

  private crash(t: number): void {
    this.noiseHit(t, 0.18, 1.2, 'highpass', 5000);
  }

  private bass(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.connect(this.env(t, 0.35, 0.005, dur, this.out!));
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private chord(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = this.env(t, 0.6, 0.004, dur, this.drive!);
    for (const [mult, det] of [[1, -6], [1.5, 4], [2, 0], [1, 7]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * mult;
      o.detune.value = det;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private lead(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = this.env(t, 0.35, 0.01, dur, this.drive!);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vg = ctx.createGain();
    vg.gain.value = f * 0.01;
    vib.connect(vg).connect(o.frequency);
    o.connect(g);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }
}
