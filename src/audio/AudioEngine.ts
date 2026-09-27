/**
 * Moteur audio 100 % WebAudio : contexte créé au premier geste de l'utilisateur, bus
 * maître / musique / effets réglés par les options. Les sons sont synthétisés (aucun fichier).
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  /** bus des voix de dialogue (bips) */
  voice!: GainNode;
  private volumes = { master: 0.8, music: 0.7, sfx: 0.9 };
  private noiseBuf: AudioBuffer | null = null;

  /** Crée / réveille le contexte (à appeler dans un gestionnaire de geste utilisateur). */
  ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.music = ctx.createGain();
      this.music.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.voice = ctx.createGain();
      this.voice.gain.value = 0.55;
      this.voice.connect(this.sfx);
      this.applyVolumes();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // courbe perceptive
    this.master.gain.setTargetAtTime(this.volumes.master ** 1.6, t, 0.02);
    this.music.gain.setTargetAtTime(this.volumes.music ** 1.6, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx ** 1.6, t, 0.02);
  }

  /** Bruit blanc partagé (2 s). */
  noise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (s / 0x7fffffff) * 2 - 1;
      }
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  /** Bip de dialogue (une lettre). */
  beep(freq: number, type: OscillatorType, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.92, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(this.voice);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
