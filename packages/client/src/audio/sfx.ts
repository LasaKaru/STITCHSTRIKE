/**
 * Tiny synthesized sound kit (plan §15): soft toy-like pops and thumps made
 * with Web Audio, so there are no audio files to ship yet. Starts on the
 * first user gesture (browser autoplay rule).
 */

export type Sound = 'popper' | 'buster' | 'hit' | 'kill' | 'build' | 'sell' | 'hurt' | 'wave' | 'alarm' | 'win' | 'lose' | 'switch' | 'turret'
  | 'lance' | 'hook' | 'launch' | 'blast' | 'zap' | 'snap' | 'pickup' | 'downed' | 'revived' | 'stomp' | 'boss' | 'enemyShot' | 'upgrade' | 'spring' | 'collect'
  | 'yarnShot' | 'yarnMiss' | 'mantle' | 'glue' | 'sock' | 'splat' | 'drum' | 'pop';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.5;
  private last = new Map<Sound, number>();

  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const limiter = this.ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, gain: number, freq: number, q = 1, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(s: Sound, volume = 1): void {
    if (!this.ctx || !this.master) return;
    // Rate-limit identical sounds so a wave of hits doesn't clip.
    const now = this.ctx.currentTime;
    if (now - (this.last.get(s) ?? -1) < 0.03) return;
    this.last.set(s, now);
    const v = volume;
    switch (s) {
      case 'popper': this.tone(220, 0.08, 'sine', 0.35 * v, 0.5); this.hiss(0.05, 0.25 * v, 1800, 0.8); break;
      case 'turret': this.tone(300, 0.06, 'sine', 0.12 * v, 0.5); this.hiss(0.04, 0.08 * v, 2200, 0.8); break;
      case 'buster': this.tone(110, 0.2, 'triangle', 0.5 * v, 0.4); this.hiss(0.18, 0.45 * v, 900, 0.6); this.tone(900, 0.05, 'square', 0.05 * v, 0.7, 0.03); break;
      case 'hit': this.tone(160, 0.07, 'sine', 0.3 * v, 0.6); this.hiss(0.06, 0.12 * v, 500, 1.5); break;
      case 'kill': this.tone(520, 0.12, 'triangle', 0.25 * v, 1.5); this.tone(780, 0.14, 'triangle', 0.18 * v, 1.2, 0.06); this.hiss(0.25, 0.1 * v, 3000, 0.5); break;
      case 'build': this.hiss(0.25, 0.3 * v, 2500, 2); this.tone(400, 0.1, 'sine', 0.2 * v, 1.8, 0.2); break;
      case 'sell': this.tone(600, 0.1, 'sine', 0.2 * v, 0.5); break;
      case 'glue': this.tone(160, 0.12, 'sine', 0.3 * v, 0.6); this.hiss(0.1, 0.18 * v, 1200, 2); break;
      case 'splat': this.hiss(0.18, 0.3 * v, 500, 0.8); this.tone(90, 0.15, 'sine', 0.3 * v, 0.7); break;
      case 'sock': this.hiss(0.08, 0.25 * v, 5200, 4); this.tone(1400, 0.06, 'square', 0.06 * v, 0.4); this.tone(60, 0.08, 'sawtooth', 0.12 * v, 1.2); break;
      case 'drum': this.tone(90, 0.12, 'sine', 0.35 * v, 0.7); this.hiss(0.06, 0.2 * v, 900, 1); this.tone(90, 0.1, 'sine', 0.25 * v, 0.7, 0.18); this.hiss(0.05, 0.15 * v, 900, 1, 0.18); break;
      case 'pop': this.tone(300, 0.25, 'triangle', 0.3 * v, 3); this.tone(900, 0.2, 'sine', 0.12 * v, 0.5, 0.05); this.hiss(0.1, 0.2 * v, 2000, 1); break;
      case 'yarnShot': this.hiss(0.12, 0.3 * v, 3200, 3); this.tone(700, 0.1, 'triangle', 0.14 * v, 2.2); this.tone(180, 0.08, 'sine', 0.2 * v, 0.6, 0.09); break;
      case 'yarnMiss': this.hiss(0.14, 0.18 * v, 2600, 3); this.tone(500, 0.12, 'triangle', 0.08 * v, 0.5); break;
      case 'mantle': this.hiss(0.12, 0.22 * v, 700, 1.2); this.tone(140, 0.1, 'sine', 0.2 * v, 1.4); break;
      case 'hurt': this.tone(90, 0.18, 'sine', 0.45 * v, 0.6); this.hiss(0.12, 0.2 * v, 300, 1); break;
      case 'switch': this.hiss(0.06, 0.15 * v, 4000, 3); this.tone(1200, 0.03, 'square', 0.03 * v); break;
      case 'wave': [0, 0.18, 0.36].forEach((d, i) => this.tone(330 * [1, 1.26, 1.5][i], 0.3, 'square', 0.08 * v, 1, d)); break;
      case 'alarm': this.tone(880, 0.15, 'square', 0.08 * v, 0.7); this.tone(660, 0.2, 'square', 0.08 * v, 0.7, 0.18); break;
      case 'win': [0, 0.15, 0.3, 0.5].forEach((d, i) => this.tone(262 * [1, 1.26, 1.5, 2][i], 0.4, 'triangle', 0.2 * v, 1, d)); break;
      case 'lose': [0, 0.25, 0.5].forEach((d, i) => this.tone(330 * [1, 0.84, 0.66][i], 0.5, 'triangle', 0.2 * v, 0.9, d)); break;
      case 'lance': this.tone(1400, 0.25, 'sine', 0.2 * v, 0.2); this.hiss(0.2, 0.3 * v, 5000, 1.5); this.tone(120, 0.15, 'sine', 0.35 * v, 0.5); break;
      case 'hook': this.tone(300, 0.05, 'square', 0.08 * v, 0.6); this.hiss(0.04, 0.18 * v, 2600, 1); break;
      case 'launch': this.tone(140, 0.2, 'sine', 0.4 * v, 0.6); this.hiss(0.15, 0.2 * v, 700, 0.8); break;
      case 'blast': this.tone(70, 0.45, 'sine', 0.6 * v, 0.4); this.hiss(0.4, 0.5 * v, 500, 0.5); this.hiss(0.2, 0.2 * v, 3000, 0.7, 0.05); break;
      case 'zap': this.tone(900, 0.08, 'sawtooth', 0.06 * v, 2.5); this.hiss(0.08, 0.2 * v, 6000, 4); break;
      case 'snap': this.tone(1800, 0.03, 'square', 0.15 * v, 0.5); this.tone(90, 0.15, 'sine', 0.4 * v, 0.5); this.hiss(0.08, 0.3 * v, 2000, 1); break;
      case 'pickup': [0, 0.07, 0.14].forEach((d, i) => this.tone(660 * [1, 1.26, 1.5][i], 0.12, 'triangle', 0.2 * v, 1, d)); break;
      case 'collect': [0, 0.08, 0.16, 0.26].forEach((d, i) => this.tone(880 * [1, 1.26, 1.5, 2][i], 0.2, 'sine', 0.22 * v, 1, d)); break;
      case 'downed': [0, 0.2].forEach((d, i) => this.tone(220 * [1, 0.75][i], 0.35, 'triangle', 0.3 * v, 0.8, d)); break;
      case 'revived': [0, 0.12, 0.24].forEach((d, i) => this.tone(392 * [1, 1.26, 1.5][i], 0.25, 'triangle', 0.25 * v, 1, d)); break;
      case 'stomp': this.tone(45, 0.6, 'sine', 0.8 * v, 0.5); this.hiss(0.5, 0.5 * v, 200, 0.5); break;
      case 'boss': [0, 0.3, 0.6, 0.9].forEach((d, i) => this.tone(110 * [1, 1.19, 1, 0.84][i], 0.5, 'sawtooth', 0.12 * v, 1, d)); break;
      case 'enemyShot': this.tone(500, 0.06, 'square', 0.06 * v, 0.5); this.hiss(0.05, 0.1 * v, 3000, 1); break;
      case 'upgrade': [0, 0.08, 0.16].forEach((d, i) => this.tone(523 * [1, 1.5, 2][i], 0.15, 'square', 0.07 * v, 1, d)); this.hiss(0.3, 0.2 * v, 3000, 2); break;
      case 'spring': this.tone(200, 0.3, 'sine', 0.3 * v, 3); break;
    }
  }
}
