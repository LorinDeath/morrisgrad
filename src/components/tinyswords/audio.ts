// audio.ts - Procedural Medieval Sound & Ambient Synthesizer via Web Audio API

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private isMuted: boolean = false;
  private bgmTimer: number | null = null;
  private currentPhase: 'day' | 'night' = 'day';

  constructor() {
    // AudioContext will initialize on first user interaction
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.musicGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        this.sfxGain.gain.setValueAtTime(0.35, this.ctx.currentTime);

        this.musicGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.ctx.destination);

        this.startBgmLoop();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    if (this.musicGain && this.sfxGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.setValueAtTime(muted ? 0 : 0.18, t);
      this.sfxGain.gain.setValueAtTime(muted ? 0 : 0.35, t);
    }
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public setPhase(phase: 'day' | 'night') {
    this.currentPhase = phase;
  }

  // --- SOUND EFFECTS ---

  public playHorn() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Dual detuned brass oscillators for an epic medieval war horn
    const freqs = [146.83, 220, 293.66]; // D3, A3, D4
    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 0.98, t);
      osc.frequency.linearRampToValueAtTime(freq, t + 0.3);
      osc.frequency.setValueAtTime(freq, t + 1.2);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 2.0);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.linearRampToValueAtTime(1400, t + 0.4);
      filter.frequency.exponentialRampToValueAtTime(300, t + 2.0);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22 / (idx + 1), t + 0.25);
      gain.gain.setValueAtTime(0.2 / (idx + 1), t + 1.3);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(t);
      osc.stop(t + 2.1);
    });
  }

  public playSwordSwing() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.16);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, t);
    filter.Q.value = 3;

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playSwordHit() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Metallic ring
    [640, 1280].forEach(f => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.2);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  public playBlock() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playBowShoot() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  public playArrowHit() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.09);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playChop() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  public playMine() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800 + Math.random() * 400, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.005, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playHeal() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Holy major triad chime (C5, E5, G5, C6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.08);

      gain.gain.setValueAtTime(0, t + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, t + idx * 0.08 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + idx * 0.08);
      osc.stop(t + idx * 0.08 + 0.55);
    });
  }

  public playBuild() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    [180, 240, 320].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.1);

      gain.gain.setValueAtTime(0.2, t + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.1 + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + idx * 0.1);
      osc.stop(t + idx * 0.1 + 0.12);
    });
  }

  public playExplosion() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.45);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + 0.48);
  }

  public playVictory() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    // Victory Fanfare
    const notes = [293.66, 369.99, 440.00, 587.33]; // D, F#, A, D
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.14);

      gain.gain.setValueAtTime(0, t + idx * 0.14);
      gain.gain.linearRampToValueAtTime(0.25, t + idx * 0.14 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.14 + 0.7);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + idx * 0.14);
      osc.stop(t + idx * 0.14 + 0.75);
    });
  }

  public playDefeat() {
    this.initContext();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const notes = [220, 207.65, 196, 174.61]; // A3, G#3, G3, F3 (descending sorrow)
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + idx * 0.35);

      gain.gain.setValueAtTime(0.25, t + idx * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.35 + 0.5);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t + idx * 0.35);
      osc.stop(t + idx * 0.35 + 0.55);
    });
  }

  // --- PROCEDURAL MEDIEVAL BGM LOOP ---
  private startBgmLoop() {
    if (this.bgmTimer) clearInterval(this.bgmTimer);

    // Notes for Dorian mode / medieval medieval lute: D, E, F, G, A, B, C
    const dayMelody = [293.66, 329.63, 349.23, 440.00, 392.00, 349.23, 329.63, 293.66];
    const nightMelody = [146.83, 146.83, 174.61, 146.83, 130.81, 146.83, 164.81, 110.00];

    let step = 0;
    this.bgmTimer = window.setInterval(() => {
      if (!this.ctx || this.isMuted) return;

      const t = this.ctx.currentTime;
      const isNight = this.currentPhase === 'night';
      const melody = isNight ? nightMelody : dayMelody;
      const freq = melody[step % melody.length];

      // Note synth
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isNight ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(isNight ? 0.08 : 0.06, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.musicGain!);

      osc.start(t);
      osc.stop(t + 0.5);

      // Low war drum on night beat
      if (isNight && step % 2 === 0) {
        const drumOsc = this.ctx.createOscillator();
        const drumGain = this.ctx.createGain();
        drumOsc.type = 'sine';
        drumOsc.frequency.setValueAtTime(80, t);
        drumOsc.frequency.exponentialRampToValueAtTime(25, t + 0.3);

        drumGain.gain.setValueAtTime(0.18, t);
        drumGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        drumOsc.connect(drumGain);
        drumGain.connect(this.musicGain!);

        drumOsc.start(t);
        drumOsc.stop(t + 0.32);
      }

      step++;
    }, 450);
  }

  public destroy() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
