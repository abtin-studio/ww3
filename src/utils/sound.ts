class TacticalAudio {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('ww3_muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  private ensureOut(): { ctx: AudioContext; out: AudioNode; noise: AudioBuffer } | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.18;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.88;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Build rich pink/white hybrid noise buffer for realistic explosions, jet afterburners & rocket plumes
      const sampleRate = this.ctx.sampleRate;
      const len = Math.floor(sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return {
      ctx: this.ctx,
      out: this.masterGain || this.ctx.destination,
      noise: this.noiseBuffer!,
    };
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('ww3_muted', this.muted ? '1' : '0');
    } catch {
      // ignore
    }
    return this.muted;
  }

  public playClick(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, t);
    osc.frequency.exponentialRampToValueAtTime(340, t + 0.042);
    gain.gain.setValueAtTime(0.032, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.046);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playRadarPing(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const t = ctx.currentTime;
    [1046.5, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const st = t + idx * 0.035;
      osc.frequency.setValueAtTime(freq, st);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.86, st + 0.16);
      gain.gain.setValueAtTime(0.032, st);
      gain.gain.exponentialRampToValueAtTime(0.0008, st + 0.19);
      osc.connect(gain);
      gain.connect(out);
      osc.start(st);
      osc.stop(st + 0.2);
    });
  }

  public playOrderConfirm(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [440, 587.33, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.048;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public playLevelUp(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [440, 554.37, 659.25, 880, 1108.73].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.25);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playSatelliteTelemetry(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [1174.66, 1567.98, 1975.53].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.036, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.15);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  public playUNGavel(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out, noise } = audio;
    const t = ctx.currentTime;

    // Resonant wood gavel double-tap + diplomatic chime
    [0, 0.16].forEach((offset) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, t + offset);
      filter.Q.value = 3.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.08);
      src.connect(filter);
      filter.connect(g);
      g.connect(out);
      src.start(t + offset);
      src.stop(t + offset + 0.09);
    });

    const chime = ctx.createOscillator();
    const cg = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(523.25, t + 0.26);
    cg.gain.setValueAtTime(0.042, t + 0.26);
    cg.gain.exponentialRampToValueAtTime(0.0008, t + 0.58);
    chime.connect(cg);
    cg.connect(out);
    chime.start(t + 0.26);
    chime.stop(t + 0.6);
  }

  public playCyberPulse(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [330, 660, 495, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      const t = ctx.currentTime + i * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.026, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.1);
    });
  }

  public playDiplomacy(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [329.63, 440, 554.37, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.044, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.25);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  public playNewsChime(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [392, 493.88, 587.33, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.068;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  public playVictory(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.085;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.058, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.42);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.43);
    });
  }

  // === STUDIO-GRADE CINEMATIC BATTLE REPLAY SOUND DESIGN ===
  public playMissileLaunch(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out, noise } = audio;
    const t = ctx.currentTime;

    // 1. Filtered Rocket Plume Whoosh (Noise sweep)
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(1650, t + 0.42);
    bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(out);
    src.start(t);
    src.stop(t + 0.46);

    // 2. Booster Turbine Pitch Rise
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.38);
    gain.gain.setValueAtTime(0.032, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.4);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + 0.41);
  }

  public playJetSortie(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out, noise } = audio;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, t);
    bp.frequency.exponentialRampToValueAtTime(360, t + 0.48);
    bp.Q.value = 2.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.005, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.52);
  }

  public playInterceptShield(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out, noise } = audio;
    const t = ctx.currentTime;

    [880, 1318.5, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const st = t + i * 0.04;
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.042, st);
      gain.gain.exponentialRampToValueAtTime(0.0008, st + 0.22);
      osc.connect(gain);
      gain.connect(out);
      osc.start(st);
      osc.stop(st + 0.23);
    });

    // Mid-air intercept pop
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.05, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(out);
    src.start(t);
    src.stop(t + 0.11);
  }

  public playCinematicBoom(heavy = false): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out, noise } = audio;
    const t = ctx.currentTime;
    const dur = heavy ? 0.85 : 0.48;

    // 1. Deep Sub-Bass Shockwave Drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(heavy ? 125 : 140, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + dur);
    subGain.gain.setValueAtTime(heavy ? 0.18 : 0.11, t);
    subGain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    sub.connect(subGain);
    subGain.connect(out);
    sub.start(t);
    sub.stop(t + dur + 0.02);

    // 2. Filtered Low-Pass Explosion Rumble
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(heavy ? 950 : 750, t);
    lp.frequency.exponentialRampToValueAtTime(110, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(heavy ? 0.18 : 0.11, t);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  public playRadarSiren(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.36;
      osc.frequency.setValueAtTime(520, start);
      osc.frequency.exponentialRampToValueAtTime(780, start + 0.18);
      osc.frequency.exponentialRampToValueAtTime(520, start + 0.33);
      gain.gain.setValueAtTime(0.065, start);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.34);
      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + 0.35);
    }
  }
}

export const sound = new TacticalAudio();
