const Sound = {
  ctx: null,
  enabled: true,

  init() {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {}
  },

  toggle() {
    this.enabled = !this.enabled;
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
      btn.innerText = this.enabled ? '🔊 ЗВУК' : '🔇 ВЫКЛ';
      btn.classList.toggle('btn-secondary', !this.enabled);
    }
    if (this.enabled) {
      this.init();
      this.play('click');
    }
  },

  play(type) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;

      switch (type) {
        case 'click': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(450, t);
          osc.frequency.exponentialRampToValueAtTime(700, t + 0.04);
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.04);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.05);
          break;
        }

        case 'hit': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.08);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.09);
          break;
        }

        case 'crit': {
          [600, 1200].forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.2);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.01, t + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.22);
          });
          break;
        }

        case 'overcharge': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(90, t);
          osc.frequency.linearRampToValueAtTime(300, t + 0.1);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.35);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.36);
          break;
        }

        case 'cast': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(320, t);
          osc.frequency.exponentialRampToValueAtTime(900, t + 0.16);
          gain.gain.setValueAtTime(0.15, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.18);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.19);
          break;
        }

        case 'heal': {
          [440, 660, 880].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t + i * 0.05);
            gain.gain.setValueAtTime(0.12, t + i * 0.05);
            gain.gain.linearRampToValueAtTime(0.01, t + i * 0.05 + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t + i * 0.05);
            osc.stop(t + i * 0.05 + 0.14);
          });
          break;
        }

        case 'hurt': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
          gain.gain.setValueAtTime(0.15, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.1);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.11);
          break;
        }

        case 'kill': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(240, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.22);
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.22);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.23);
          break;
        }

        case 'dodge': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, t);
          osc.frequency.linearRampToValueAtTime(300, t + 0.08);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.08);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.09);
          break;
        }

        case 'death': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.6);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.linearRampToValueAtTime(0.01, t + 0.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.65);
          break;
        }
      }
    } catch (e) {}
  }
};