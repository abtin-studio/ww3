class TacticalAudio {
  private ctx: AudioContext | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('ww3_muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  private ensureOut(): { ctx: AudioContext; out: AudioNode } | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterFilter = this.ctx.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.value = 2100;
      this.masterFilter.Q.value = 0.7;
      this.masterFilter.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return { ctx: this.ctx, out: this.masterFilter || this.ctx.destination };
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

  // Ultra-soft velvet tactile UI click
  public playClick(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(0.028, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.055);
  }

  public playRadarPing(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.038, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.21);
  }

  public playOrderConfirm(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [392, 523.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.048, t);
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
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.052, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  public playDiplomacy(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [329.63, 440, 523.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.07;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playNewsChime(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    [392, 493.88, 587.33].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.048, t);
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
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = ctx.currentTime + i * 0.095;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.35);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  // Warm submarine/command-center sonar alert (zero harsh sawtooth!)
  public playRadarSiren(): void {
    const audio = this.ensureOut();
    if (!audio) return;
    const { ctx, out } = audio;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.38;
      osc.frequency.setValueAtTime(540, start);
      osc.frequency.exponentialRampToValueAtTime(760, start + 0.18);
      gain.gain.setValueAtTime(0.07, start);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.34);
      osc.connect(gain);
      gain.connect(out);
      osc.start(start);
      osc.stop(start + 0.35);
    }
  }
}

export const sound = new TacticalAudio();
