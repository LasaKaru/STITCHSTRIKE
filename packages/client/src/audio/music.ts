/**
 * The menu theme: a music box lullaby over a warm felt pad and a soft
 * heartbeat kick, synthesized live with Web Audio (no audio files). It is a
 * toy's tune that turns heroic: the melody loops over I-vi-IV-V in D major.
 */

const BPM = 84;
const BEAT = 60 / BPM;
// Semitones from D4 for each eighth note; null is a rest. Two 4-bar phrases.
const MELODY: (number | null)[] = [
  7, 12, 11, 7, 9, 7, 4, null, 5, 9, 7, 5, 4, 2, 4, null,
  7, 12, 11, 12, 14, 12, 11, 9, 7, 9, 11, 7, 9, null, 7, null,
];
// Chord roots (semitones from D3), one per bar: I vi IV V | I vi IV V
const ROOTS = [0, 9, 5, 7, 0, 9, 5, 7];
const TRIADS: Record<number, number[]> = { 0: [0, 4, 7], 9: [0, 3, 7], 5: [0, 4, 7], 7: [0, 4, 7] };
const hz = (base: number, semis: number) => base * 2 ** (semis / 12);

export class MenuMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;

  start(volume: number): void {
    if (this.ctx) { void this.ctx.resume(); this.setVolume(volume); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.linearRampToValueAtTime(volume * 0.5, ctx.currentTime + 3);
    // A soft, short plate reverb from decaying noise.
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.out);
    this.out.connect(ctx.destination);
    this.nextTime = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  setVolume(v: number): void {
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
  }

  /** Fade out (used when a match starts). */
  stop(fade = 0.8): void {
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    window.setTimeout(() => { clearInterval(this.timer); void this.ctx?.close(); this.ctx = null; }, fade * 1000 + 200);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += BEAT / 2;
      this.step = (this.step + 1) % MELODY.length;
    }
  }

  private playStep(i: number, t: number): void {
    const bar = Math.floor(i / 8);
    const root = ROOTS[bar];
    const note = MELODY[i];
    if (note !== null) this.chime(hz(293.66, note), t, 0.16);
    // Pad on each bar, bass on beats 1 and 3, a heartbeat kick on every beat of the second phrase.
    if (i % 8 === 0) for (const n of TRIADS[root]) this.pad(hz(146.83, root + n), t, BEAT * 4);
    if (i % 4 === 0) this.pluck(hz(73.42, root), t, 0.22);
    if (bar >= 4 && i % 2 === 0) this.kick(t, i % 8 === 0 ? 0.3 : 0.16);
    if (i % 16 === 14) this.chime(hz(293.66, 19), t, 0.05); // a sparkle at the end of each phrase
  }

  private voice(t: number, dur: number, peak: number, attack: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.out!);
    g.connect(this.reverb!);
    return g;
  }

  /** Music-box tine: a sine plus an inharmonic partial, fast decay. */
  private chime(f: number, t: number, gain: number): void {
    const ctx = this.ctx!;
    const g = this.voice(t, 1.6, gain, 0.004);
    for (const [mult, amp] of [[1, 1], [4.2, 0.25], [2, 0.3]] as const) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.value = f * mult;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    }
  }

  private pad(f: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const g = this.voice(t, dur + 0.6, 0.035, 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(g);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.7);
    }
  }

  private pluck(f: number, t: number, gain: number): void {
    const ctx = this.ctx!;
    const g = this.voice(t, 0.9, gain, 0.01);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + 1);
  }

  private kick(t: number, gain: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    g.connect(this.out!);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.4);
  }

  /** UI blips share the music context so they obey the same unlock. */
  blip(kind: 'move' | 'select' | 'back', sfxVolume: number): void {
    const ctx = this.ctx;
    if (!ctx || sfxVolume <= 0) return;
    const t = ctx.currentTime;
    const notes = kind === 'move' ? [1568] : kind === 'select' ? [880, 1318.5] : [659.3, 440];
    notes.forEach((f, k) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + k * 0.06);
      g.gain.exponentialRampToValueAtTime(0.12 * sfxVolume, t + k * 0.06 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.06 + 0.18);
      g.connect(ctx.destination);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(t + k * 0.06);
      o.stop(t + k * 0.06 + 0.2);
    });
  }
}
