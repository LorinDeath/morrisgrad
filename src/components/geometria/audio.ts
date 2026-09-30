// audio.ts - Zero-dependency Web Audio API procedural synthesizer for Geometria

class SoundEngine {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;

  public sfxEnabled: boolean = true;
  public musicEnabled: boolean = true;
  private isBgmPlaying: boolean = false;
  private bgmIntervalId: number | null = null;
  private gemToneIndex: number = 0;
  private gemLastTime: number = 0;

  constructor() {
    // AudioContext will be initialized on first user interaction
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);
    } catch (e) {
      console.warn('Web Audio not supported', e);
    }
  }

  private resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playShoot(variant: 'pulse' | 'heavy' | 'homing' | 'laser' = 'pulse') {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (variant === 'heavy') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.18);
    } else if (variant === 'homing') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.12);
    } else if (variant === 'laser') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.linearRampToValueAtTime(400, t + 0.08);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.08);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  public playHit() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  public playExplosion(isLarge: boolean = false) {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const dur = isLarge ? 0.45 : 0.22;

    // Noise burst
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isLarge ? 800 : 500, t);
    filter.frequency.exponentialRampToValueAtTime(40, t + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isLarge ? 0.45 : 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    whiteNoise.start(t);

    // Sub bass drop
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(isLarge ? 140 : 100, t);
    subOsc.frequency.exponentialRampToValueAtTime(30, t + dur);
    subGain.gain.setValueAtTime(isLarge ? 0.4 : 0.2, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);
    subOsc.start(t);
    subOsc.stop(t + dur);
  }

  public playGem() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const now = performance.now();
    if (now - this.gemLastTime > 600) {
      this.gemToneIndex = 0;
    }
    this.gemLastTime = now;

    // Pentatonic scale frequencies
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51];
    const freq = scale[this.gemToneIndex % scale.length];
    this.gemToneIndex++;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  public playDash() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.18);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playSpecialAbility() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.35);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  public playLevelUp() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const notes = [440, 554.37, 659.25, 880];
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const startTime = t + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  public playBossAlert() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(70, t + 0.4);
    osc.frequency.linearRampToValueAtTime(140, t + 0.8);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.9);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.9);
  }

  public playButtonClick() {
    if (!this.sfxEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.03);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  // Procedural Synthwave BGM Loop
  public startBgm() {
    if (this.isBgmPlaying || !this.musicEnabled) return;
    this.init();
    this.resume();
    if (!this.ctx || !this.musicGain) return;

    this.isBgmPlaying = true;
    let step = 0;
    const bpm = 128;
    const stepDuration = 60 / bpm / 2; // 16th notes approx

    // Bassline in D minor: D2, D2, F2, G2, D2, C2, D2, A1
    const bassline = [73.42, 73.42, 87.31, 98.00, 73.42, 65.41, 73.42, 55.00];

    const playStep = () => {
      if (!this.isBgmPlaying || !this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;

      // Bass note on 8th notes
      if (step % 2 === 0) {
        const bassFreq = bassline[(step / 2) % bassline.length];
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassFreq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, t);
        filter.frequency.exponentialRampToValueAtTime(90, t + 0.18);

        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);

        osc.start(t);
        osc.stop(t + 0.18);
      }

      // Kick on beats 0, 4, 8, 12
      if (step % 4 === 0) {
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(150, t);
        kickOsc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        kickGain.gain.setValueAtTime(0.3, t);
        kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        kickOsc.connect(kickGain);
        kickGain.connect(this.musicGain);
        kickOsc.start(t);
        kickOsc.stop(t + 0.12);
      }

      // Hi-hat on every offbeat
      if (step % 2 === 1) {
        const hatBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.04, this.ctx.sampleRate);
        const data = hatBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.2));
        }
        const hatSource = this.ctx.createBufferSource();
        hatSource.buffer = hatBuffer;
        const hatFilter = this.ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(7000, t);
        const hatGain = this.ctx.createGain();
        hatGain.gain.setValueAtTime(0.08, t);
        hatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

        hatSource.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(this.musicGain);
        hatSource.start(t);
      }

      step++;
    };

    this.bgmIntervalId = window.setInterval(playStep, stepDuration * 1000);
  }

  public stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }

  public toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled) {
      this.startBgm();
    } else {
      this.stopBgm();
    }
    return this.musicEnabled;
  }

  public toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }
}

export const sound = new SoundEngine();
