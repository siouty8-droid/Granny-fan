/**
 * Moteur audio 100 % WebAudio : contexte créé au premier geste de l'utilisateur, bus
 * maître (compresseur) / musique / effets / voix, réverbération à réponse impulsionnelle
 * générée, auditeur 3D. Tous les sons sont synthétisés (aucun fichier).
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  /** bus des voix de dialogue (bips) */
  voice!: GainNode;
  /** envoi vers la réverbération */
  reverbSend!: GainNode;
  private reverb!: ConvolverNode;
  private reverbOut!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private volumes = { master: 0.8, music: 0.7, sfx: 0.9 };
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;

  /** Crée / réveille le contexte (à appeler dans un gestionnaire de geste utilisateur). */
  ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -16;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.25;
      this.compressor.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(this.compressor);
      this.music = ctx.createGain();
      this.music.connect(this.master);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.voice = ctx.createGain();
      this.voice.gain.value = 0.55;
      this.voice.connect(this.master);
      // réverbération (réponse impulsionnelle : bruit à décroissance exponentielle, stéréo)
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.6, 2.8);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.35;
      this.reverbOut = ctx.createGain();
      this.reverbOut.gain.value = 0.9;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.reverbOut);
      this.reverbOut.connect(this.sfx);
      this.applyVolumes();
    }
    if (this.ctx.state === "suspended" && !this.muted) void this.ctx.resume();
    return this.ctx;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Pause (écrans opaques) : on suspend le contexte. */
  setPaused(p: boolean): void {
    this.muted = p;
    if (!this.ctx) return;
    if (p && this.ctx.state === "running") void this.ctx.suspend();
    else if (!p && this.ctx.state === "suspended") void this.ctx.resume();
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

  /** Quantité de réverbération (grandes salles, cages d'escalier > extérieur). */
  setReverb(amount: number): void {
    if (!this.ctx) return;
    this.reverbSend.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.4);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let s = 987654321;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const n = (s / 4294967296) * 2 - 1;
        const t = i / len;
        // premières réflexions plus denses, queue sombre
        d[i] = n * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.012 ? 0.2 : 1);
      }
    }
    return buf;
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

  /** Oriente l'auditeur (caméra). */
  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    // WebAudio est main droite : on inverse z (Babylon est main gauche)
    if (l.positionX) {
      l.positionX.setTargetAtTime(x, t, 0.015);
      l.positionY.setTargetAtTime(y, t, 0.015);
      l.positionZ.setTargetAtTime(-z, t, 0.015);
      l.forwardX.setTargetAtTime(fx, t, 0.015);
      l.forwardY.setTargetAtTime(fy, t, 0.015);
      l.forwardZ.setTargetAtTime(-fz, t, 0.015);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, -z);
      l.setOrientation(fx, fy, -fz, 0, 1, 0);
    }
  }

  /** Panner 3D (coordonnées Babylon). */
  panner(x: number, y: number, z: number, refDistance = 1.5, rolloff = 1.2, hrtf = false): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = hrtf ? "HRTF" : "equalpower";
    p.distanceModel = "inverse";
    p.refDistance = refDistance;
    p.maxDistance = 80;
    p.rolloffFactor = rolloff;
    this.setPannerPos(p, x, y, z);
    return p;
  }

  setPannerPos(p: PannerNode, x: number, y: number, z: number): void {
    if (p.positionX) {
      const t = this.ctx!.currentTime;
      p.positionX.setTargetAtTime(x, t, 0.02);
      p.positionY.setTargetAtTime(y, t, 0.02);
      p.positionZ.setTargetAtTime(-z, t, 0.02);
    } else p.setPosition(x, y, -z);
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
