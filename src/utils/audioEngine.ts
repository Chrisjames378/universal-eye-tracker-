/**
 * Zero-dependency Web Audio synthesizer for tactile gaze feedback & ambient music widget.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicTimer: number | null = null;
  private musicGain: GainNode | null = null;
  private musicStep = 0;
  private currentTrackIdx = 0;
  private masterVolume = 0.7;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setVolume(volPercent: number): void {
    this.masterVolume = Math.min(1, Math.max(0, volPercent / 100));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0.06 * this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  playFeedback(type: 'hover' | 'tap' | 'blink' | 'calib' | 'wink', enabled: boolean): void {
    if (!enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const vol = Math.max(0.02, 0.14 * this.masterVolume);

    if (type === 'hover') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.04);
      gain.gain.setValueAtTime(vol * 0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (type === 'tap') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.09);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === 'blink') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1240, now + 0.07);
      gain.gain.setValueAtTime(vol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'wink') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(587, now + 0.08);
      gain.gain.setValueAtTime(vol * 0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (type === 'calib') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, now);
      osc.frequency.exponentialRampToValueAtTime(1108, now + 0.12);
      gain.gain.setValueAtTime(vol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    }
  }

  startMusic(trackIdx: number): void {
    this.stopMusic();
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.currentTrackIdx = trackIdx;
    this.musicStep = 0;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06 * this.masterVolume, ctx.currentTime);
    gain.connect(ctx.destination);
    this.musicGain = gain;

    const scales = [
      [261.63, 329.63, 392.0, 493.88, 523.25], // Cmaj7 Ambient
      [220.0, 261.63, 329.63, 392.0, 440.0],   // Am7 Horizon
      [293.66, 349.23, 440.0, 523.25, 587.33], // Dm9 Focus
    ];

    const playNote = () => {
      if (!this.ctx || !this.musicGain) return;
      const scale = scales[this.currentTrackIdx % scales.length];
      const freq = scale[this.musicStep % scale.length];
      this.musicStep++;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.6, now + 0.12);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      osc.connect(noteGain);
      noteGain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.8);
    };

    playNote();
    this.musicTimer = window.setInterval(playNote, 620);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  }
}

export const audioEngine = new AudioEngine();
