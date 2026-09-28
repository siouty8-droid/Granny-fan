import type { AudioEngine } from "./AudioEngine";

export interface Pos {
  x: number;
  y: number;
  z: number;
}

interface Env {
  gain: number;
  attack?: number;
  /** durée totale */
  dur: number;
  /** décroissance exponentielle (sinon linéaire) */
  exp?: boolean;
}

interface OscOpts extends Env {
  type: OscillatorType;
  freq: number;
  freqEnd?: number;
  /** temps de glissement de fréquence (défaut : durée) */
  glide?: number;
  detune?: number;
}

interface NoiseOpts extends Env {
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  rate?: number;
}

/** Berceuse de la Veilleuse (« Au clair de la lune » en mineur) : fragments [demi-tons, durée s]. */
const LULLABY: Array<Array<[number, number]>> = [
  [
    [0, 0.3],
    [0, 0.3],
    [0, 0.3],
    [2, 0.3],
    [3, 0.6],
    [2, 0.6],
  ],
  [
    [0, 0.3],
    [3, 0.3],
    [2, 0.3],
    [2, 0.3],
    [0, 0.9],
  ],
  [
    [2, 0.3],
    [2, 0.3],
    [2, 0.3],
    [2, 0.3],
    [-3, 0.6],
    [-3, 0.6],
  ],
];

/** Sortie d'un son : spatialisée (panner + occlusion) ou non. */
interface Out {
  node: AudioNode;
  t: number;
}

/**
 * Bibliothèque de sons synthétisés à la volée (enveloppes, oscillateurs, bruit filtré,
 * distorsion). Chaque son est un petit graphe éphémère ; les sons 3D passent par un panner
 * et un filtre d'occlusion (ligne de vue / étages).
 */
export class Sfx {
  /** occlusion d'une position (0 = dégagé, 1 = derrière murs / autre étage) */
  occlusion: (x: number, y: number, z: number) => number = () => 0;
  private curve: Float32Array<ArrayBuffer> | null = null;

  constructor(private readonly a: AudioEngine) {}

  private get ctx(): AudioContext {
    return this.a.ctx!;
  }

  get ok(): boolean {
    return this.a.ready;
  }

  /** Crée la sortie (3D si `pos`) ; `reverb` : part envoyée à la réverb. */
  out(pos: Pos | null, gain = 1, reverb = 0.3, ref = 1.6, rolloff = 1.1, bus?: AudioNode): Out {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const g = ctx.createGain();
    g.gain.value = gain;
    let head: AudioNode = g;
    if (pos) {
      const occ = this.occlusion(pos.x, pos.y, pos.z);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 16000 * (1 - occ) + 700 * occ;
      g.gain.value = gain * (1 - occ * 0.55);
      const p = this.a.panner(pos.x, pos.y, pos.z, ref, rolloff);
      g.connect(lp);
      lp.connect(p);
      head = p;
    }
    head.connect(bus ?? this.a.sfx);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      head.connect(s);
      s.connect(this.a.reverbSend);
    }
    return { node: g, t };
  }

  private env(g: GainNode, t: number, e: Env): void {
    const a = e.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(e.gain, t + a);
    if (e.exp === false) g.gain.linearRampToValueAtTime(0.0001, t + e.dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + e.dur);
  }

  osc(o: Out, dt: number, p: OscOpts): OscillatorNode {
    const ctx = this.ctx;
    const t = o.t + dt;
    const osc = ctx.createOscillator();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.freq, t);
    if (p.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.freqEnd), t + (p.glide ?? p.dur));
    if (p.detune) osc.detune.value = p.detune;
    const g = ctx.createGain();
    this.env(g, t, p);
    osc.connect(g);
    g.connect(o.node);
    osc.start(t);
    osc.stop(t + p.dur + 0.05);
    return osc;
  }

  noise(o: Out, dt: number, p: NoiseOpts): void {
    const ctx = this.ctx;
    const t = o.t + dt;
    const src = ctx.createBufferSource();
    src.buffer = this.a.noise();
    src.playbackRate.value = p.rate ?? 1;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = p.filter;
    f.frequency.setValueAtTime(p.freq, t);
    if (p.freqEnd) f.frequency.exponentialRampToValueAtTime(p.freqEnd, t + p.dur);
    f.Q.value = p.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, p);
    src.connect(f);
    f.connect(g);
    g.connect(o.node);
    src.start(t, Math.random() * 1.5);
    src.stop(t + p.dur + 0.05);
  }

  /** Courbe de saturation partagée. */
  private shaper(): WaveShaperNode {
    const ws = this.ctx.createWaveShaper();
    if (!this.curve) {
      const n = 1024;
      const c = new Float32Array(new ArrayBuffer(n * 4));
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(x * 3.5);
      }
      this.curve = c;
    }
    ws.curve = this.curve;
    return ws;
  }

  // ======================================================================== joueur

  footstep(surface: string, mode: string, pos: Pos | null): void {
    if (!this.ok) return;
    const loud = mode === "sprint" ? 1.25 : mode === "crouch" ? 0.35 : 0.75;
    const o = this.out(pos, 0.55 * loud, 0.22, 2, 1.4);
    const v = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case "metal":
        this.noise(o, 0, { filter: "bandpass", freq: 3200 * v, q: 1.2, gain: 0.5, dur: 0.05 });
        for (const f of [420, 1130, 2270]) this.osc(o, 0, { type: "sine", freq: f * v, gain: 0.08, dur: 0.28 });
        this.osc(o, 0, { type: "sine", freq: 95, freqEnd: 60, gain: 0.4, dur: 0.1 });
        break;
      case "grass":
        this.noise(o, 0, { filter: "highpass", freq: 2600 * v, q: 0.6, gain: 0.35, attack: 0.02, dur: 0.12 });
        this.noise(o, 0.03, { filter: "bandpass", freq: 900, q: 0.8, gain: 0.15, attack: 0.02, dur: 0.1 });
        break;
      case "wood":
        this.osc(o, 0, { type: "sine", freq: 150 * v, freqEnd: 90, gain: 0.55, dur: 0.1 });
        this.noise(o, 0, { filter: "bandpass", freq: 700 * v, q: 1.5, gain: 0.3, dur: 0.07 });
        if (Math.random() < 0.12) this.creak(o, 0.02, 0.18);
        break;
      case "concrete":
        this.noise(o, 0, { filter: "bandpass", freq: 1500 * v, q: 0.9, gain: 0.45, dur: 0.07 });
        this.noise(o, 0.01, { filter: "highpass", freq: 4500, q: 0.5, gain: 0.12, dur: 0.05 });
        this.osc(o, 0, { type: "sine", freq: 80, freqEnd: 55, gain: 0.35, dur: 0.08 });
        break;
      default:
        // carrelage : clic sec + thump
        this.noise(o, 0, { filter: "bandpass", freq: 2800 * v, q: 1.4, gain: 0.5, dur: 0.045 });
        this.osc(o, 0, { type: "sine", freq: 110 * v, freqEnd: 70, gain: 0.4, dur: 0.07 });
    }
  }

  /** Souffle (inspiration / expiration). */
  breath(inhale: boolean, gain: number): void {
    if (!this.ok) return;
    const o = this.out(null, gain, 0.05);
    this.noise(o, 0, { filter: "bandpass", freq: inhale ? 1500 : 900, freqEnd: inhale ? 2200 : 650, q: 1.6, gain: 0.5, attack: 0.12, dur: inhale ? 0.5 : 0.6 });
  }

  heartbeat(gain: number): void {
    if (!this.ok) return;
    const o = this.out(null, gain, 0);
    this.osc(o, 0, { type: "sine", freq: 58, freqEnd: 42, gain: 0.9, dur: 0.16 });
    this.osc(o, 0.2, { type: "sine", freq: 52, freqEnd: 40, gain: 0.6, dur: 0.14 });
  }

  // ======================================================================== portes & mécanismes

  private creak(o: Out, dt: number, gain: number, dur = 0.5): void {
    const ctx = this.ctx;
    const t = o.t + dt;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90 + Math.random() * 60, t);
    osc.frequency.linearRampToValueAtTime(160 + Math.random() * 90, t + dur * 0.6);
    osc.frequency.linearRampToValueAtTime(110, t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18 + Math.random() * 14;
    const lg = ctx.createGain();
    lg.gain.value = 25;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 6;
    const g = ctx.createGain();
    this.env(g, t, { gain, dur, attack: 0.05, exp: false });
    osc.connect(bp);
    bp.connect(g);
    g.connect(o.node);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  private clunk(o: Out, dt: number, gain: number, pitch = 1): void {
    this.osc(o, dt, { type: "sine", freq: 120 * pitch, freqEnd: 55 * pitch, gain: gain, dur: 0.18 });
    this.noise(o, dt, { filter: "lowpass", freq: 1200 * pitch, q: 0.7, gain: gain * 0.6, dur: 0.12 });
  }

  play(name: string, pos: Pos | null, param = ""): void {
    if (!this.ok) return;
    switch (name) {
      case "door_open": {
        const o = this.out(pos, 0.7, 0.35);
        this.noise(o, 0, { filter: "bandpass", freq: 2500, q: 3, gain: 0.3, dur: 0.05 });
        this.creak(o, 0.05, 0.22, 0.45 + Math.random() * 0.3);
        break;
      }
      case "door_close": {
        const o = this.out(pos, 0.8, 0.4);
        this.clunk(o, 0, 0.8, 0.9);
        this.noise(o, 0.02, { filter: "bandpass", freq: 3000, q: 2, gain: 0.25, dur: 0.06 });
        break;
      }
      case "door_slam": {
        const o = this.out(pos, 1.3, 0.6, 3, 0.9);
        this.clunk(o, 0, 1, 0.7);
        this.noise(o, 0, { filter: "lowpass", freq: 3000, freqEnd: 400, q: 0.8, gain: 0.8, dur: 0.5 });
        for (let i = 0; i < 4; i++) this.noise(o, 0.08 + i * 0.05, { filter: "bandpass", freq: 3500 - i * 400, q: 4, gain: 0.15, dur: 0.05 });
        break;
      }
      case "door_swing": {
        const o = this.out(pos, 0.45, 0.3);
        this.noise(o, 0, { filter: "bandpass", freq: 600, freqEnd: 300, q: 1, gain: 0.4, attack: 0.03, dur: 0.35 });
        this.osc(o, 0.25, { type: "sine", freq: 90, freqEnd: 60, gain: 0.3, dur: 0.12 });
        break;
      }
      case "badge_ok": {
        const o = this.out(pos, 0.5, 0.15);
        this.osc(o, 0, { type: "square", freq: 1250, gain: 0.15, dur: 0.08, exp: false });
        this.osc(o, 0.1, { type: "square", freq: 1660, gain: 0.15, dur: 0.12, exp: false });
        this.clunk(o, 0.22, 0.4, 1.6);
        break;
      }
      case "key_unlock": {
        const o = this.out(pos, 0.6, 0.2);
        for (let i = 0; i < 3; i++) this.noise(o, i * 0.07, { filter: "bandpass", freq: 4200 + i * 300, q: 5, gain: 0.3, dur: 0.04 });
        this.clunk(o, 0.25, 0.45, 1.8);
        break;
      }
      case "planks_rip": {
        const o = this.out(pos, 1.2, 0.45, 2.5, 0.9);
        for (let i = 0; i < 5; i++) {
          this.noise(o, i * 0.11 + Math.random() * 0.04, { filter: "bandpass", freq: 1400 + Math.random() * 1600, q: 1.2, gain: 0.7, dur: 0.09 });
          this.osc(o, i * 0.11, { type: "sawtooth", freq: 180 + Math.random() * 80, freqEnd: 90, gain: 0.12, dur: 0.1 });
        }
        this.clunk(o, 0.62, 0.9, 0.8);
        this.clunk(o, 0.78, 0.6, 1.1);
        break;
      }
      case "chain_cut": {
        const o = this.out(pos, 1.0, 0.4);
        this.noise(o, 0, { filter: "highpass", freq: 5000, q: 0.7, gain: 0.8, dur: 0.05 });
        for (const f of [2300, 3400, 5100]) this.osc(o, 0, { type: "sine", freq: f, gain: 0.12, dur: 0.6 });
        for (let i = 0; i < 6; i++) this.noise(o, 0.12 + i * 0.06 + Math.random() * 0.03, { filter: "bandpass", freq: 3500 + Math.random() * 2000, q: 6, gain: 0.25, dur: 0.04 });
        break;
      }
      case "pushbar": {
        const o = this.out(pos, 1.0, 0.45);
        this.clunk(o, 0, 0.9, 1.2);
        this.noise(o, 0, { filter: "bandpass", freq: 2200, q: 3, gain: 0.4, dur: 0.07 });
        this.creak(o, 0.1, 0.15, 0.4);
        break;
      }
      case "pickup": {
        const o = this.out(null, 0.55, 0.05);
        this.osc(o, 0, { type: "sine", freq: 880, freqEnd: 1320, glide: 0.06, gain: 0.25, dur: 0.12 });
        if (param === "keys" || param === "card") for (let i = 0; i < 4; i++) this.osc(o, 0.03 + i * 0.035, { type: "sine", freq: 3000 + Math.random() * 2500, gain: 0.07, dur: 0.12 });
        if (param === "metal" || param === "heavy") this.clunk(o, 0.02, 0.35, param === "heavy" ? 0.7 : 1.4);
        break;
      }
      case "drop": {
        const o = this.out(pos, 0.7, 0.3);
        if (param === "heavy") this.clunk(o, 0, 0.9, 0.6);
        else if (param === "metal") {
          this.clunk(o, 0, 0.5, 1.3);
          for (const f of [900, 2100]) this.osc(o, 0, { type: "sine", freq: f, gain: 0.1, dur: 0.4 });
        } else this.noise(o, 0, { filter: "bandpass", freq: 2500, q: 2, gain: 0.35, dur: 0.06 });
        break;
      }
      case "paper": {
        const o = this.out(null, 0.4, 0.05);
        for (let i = 0; i < 3; i++) this.noise(o, i * 0.08, { filter: "highpass", freq: 3000 + i * 800, q: 0.5, gain: 0.25, attack: 0.02, dur: 0.1 });
        break;
      }
      case "keypad_digit": {
        const o = this.out(null, 0.35, 0.02);
        this.osc(o, 0, { type: "square", freq: 1050 + Number(param || 0) * 35, gain: 0.12, dur: 0.07, exp: false });
        break;
      }
      case "keypad_err": {
        const o = this.out(null, 0.5, 0.05);
        this.osc(o, 0, { type: "square", freq: 160, gain: 0.2, dur: 0.35, exp: false });
        this.osc(o, 0, { type: "square", freq: 168, gain: 0.15, dur: 0.35, exp: false });
        break;
      }
      case "keypad_ok": {
        const o = this.out(null, 0.5, 0.05);
        this.osc(o, 0, { type: "square", freq: 1320, gain: 0.12, dur: 0.1, exp: false });
        this.osc(o, 0.12, { type: "square", freq: 1760, gain: 0.12, dur: 0.18, exp: false });
        break;
      }
      case "safe_open": {
        const o = this.out(pos, 0.9, 0.35);
        this.clunk(o, 0, 0.9, 0.6);
        this.noise(o, 0.05, { filter: "bandpass", freq: 3200, q: 4, gain: 0.3, dur: 0.05 });
        this.creak(o, 0.2, 0.2, 0.9);
        break;
      }
      case "fuse_insert": {
        const o = this.out(pos, 0.8, 0.25);
        this.clunk(o, 0, 0.5, 1.7);
        this.noise(o, 0.08, { filter: "highpass", freq: 6000, q: 0.5, gain: 0.3, dur: 0.15 });
        this.osc(o, 0.08, { type: "sawtooth", freq: 100, gain: 0.08, dur: 0.3 });
        break;
      }
      case "lever": {
        const o = this.out(pos, 1.2, 0.5, 3, 0.8);
        this.clunk(o, 0, 1, 0.9);
        this.noise(o, 0.15, { filter: "highpass", freq: 5000, q: 0.5, gain: 0.5, dur: 0.25 });
        this.osc(o, 0.2, { type: "sawtooth", freq: 40, freqEnd: 100, gain: 0.25, dur: 1.8, attack: 0.4 });
        this.osc(o, 0.2, { type: "sine", freq: 50, freqEnd: 120, gain: 0.3, dur: 2.2, attack: 0.5 });
        break;
      }
      case "elevator_ding": {
        const o = this.out(pos, 0.7, 0.4);
        this.osc(o, 0, { type: "sine", freq: 1318, gain: 0.3, dur: 1.2 });
        this.osc(o, 0, { type: "sine", freq: 2636, gain: 0.08, dur: 0.8 });
        break;
      }
      case "elevator_doors": {
        const o = this.out(pos, 0.6, 0.3);
        this.noise(o, 0, { filter: "bandpass", freq: 700, freqEnd: 1200, q: 2, gain: 0.35, attack: 0.1, dur: 0.7, exp: false });
        this.clunk(o, 0.68, 0.3, 1.4);
        break;
      }
      case "gate_open": {
        const o = this.out(pos, 1.3, 0.2, 4, 0.7);
        this.osc(o, 0, { type: "sawtooth", freq: 55, gain: 0.25, dur: 2.6, attack: 0.3, exp: false });
        this.creak(o, 0.2, 0.3, 2.2);
        this.clunk(o, 2.4, 0.6, 0.8);
        break;
      }
      case "battery": {
        const o = this.out(pos, 0.9, 0.2);
        this.clunk(o, 0, 0.8, 0.8);
        for (let i = 0; i < 3; i++) this.noise(o, 0.3 + i * 0.12, { filter: "bandpass", freq: 4000, q: 4, gain: 0.3, dur: 0.05 });
        this.noise(o, 0.7, { filter: "highpass", freq: 7000, q: 0.5, gain: 0.3, dur: 0.1 });
        break;
      }
      case "vault_glass": {
        const o = this.out(pos, 0.9, 0.3);
        for (let i = 0; i < 8; i++) this.noise(o, i * 0.05 + Math.random() * 0.04, { filter: "bandpass", freq: 3500 + Math.random() * 4000, q: 5, gain: 0.3, dur: 0.05 });
        this.clunk(o, 0.45, 0.5, 1);
        break;
      }
      case "land": {
        const o = this.out(pos, 1.0, 0.3);
        this.clunk(o, 0, 1, 0.7);
        this.noise(o, 0, { filter: "lowpass", freq: 900, q: 0.7, gain: 0.5, dur: 0.2 });
        break;
      }
      case "hide": {
        const o = this.out(pos, 0.5, 0.2);
        if (param === "cabinet") {
          this.creak(o, 0, 0.15, 0.35);
          this.clunk(o, 0.35, 0.3, 1.5);
        } else this.noise(o, 0, { filter: "bandpass", freq: 700, q: 0.8, gain: 0.35, attack: 0.05, dur: 0.4 });
        break;
      }
      case "trap": {
        const o = this.out(pos, 1.6, 0.6, 3, 0.7);
        this.noise(o, 0, { filter: "highpass", freq: 3000, q: 0.5, gain: 1, dur: 0.06 });
        this.clunk(o, 0, 1, 1.2);
        for (const f of [610, 1540, 2980, 4200]) this.osc(o, 0, { type: "sine", freq: f, gain: 0.12, dur: 1.4 });
        break;
      }
      case "flashlight": {
        const o = this.out(null, 0.35, 0);
        this.noise(o, 0, { filter: "bandpass", freq: 3500, q: 3, gain: 0.5, dur: 0.03 });
        this.noise(o, 0.06, { filter: "bandpass", freq: 2800, q: 3, gain: 0.3, dur: 0.02 });
        break;
      }
      case "machine": {
        const o = this.out(pos, 0.8, 0.4, 3, 0.8);
        this.osc(o, 0, { type: "sawtooth", freq: 48, gain: 0.3, dur: 1.2, attack: 0.1 });
        this.noise(o, 0, { filter: "lowpass", freq: 500, q: 1, gain: 0.3, dur: 1.2 });
        break;
      }
      // ------------------------------------------------------------ monstre
      case "monster_step": {
        const heavy = param === "run" ? 1.3 : 1;
        const o = this.out(pos, 1.1 * heavy, 0.35, 2.5, 0.85);
        this.osc(o, 0, { type: "sine", freq: 62, freqEnd: 38, gain: 0.9, dur: 0.22 });
        this.noise(o, 0, { filter: "lowpass", freq: 420, q: 0.8, gain: 0.6, dur: 0.16 });
        // griffes / pied nu qui traîne
        this.noise(o, 0.06, { filter: "bandpass", freq: 1800, freqEnd: 1100, q: 2, gain: 0.18, attack: 0.03, dur: 0.22 });
        break;
      }
      case "monster_scream": {
        const o = this.out(pos, 1.6, 0.6, 5, 0.6);
        const ws = this.shaper();
        const g = this.ctx.createGain();
        g.gain.value = 0.5;
        ws.connect(g);
        g.connect(o.node);
        const oo: Out = { node: ws, t: o.t };
        for (const [f, d] of [
          [310, 0],
          [465, 12],
          [620, -8],
          [930, 5],
        ] as Array<[number, number]>) {
          this.osc(oo, 0, { type: "sawtooth", freq: f, freqEnd: f * 0.55, glide: 1.4, gain: 0.35, attack: 0.05, dur: 1.6, detune: d });
        }
        this.noise(oo, 0, { filter: "bandpass", freq: 2200, freqEnd: 900, q: 1.5, gain: 0.8, attack: 0.03, dur: 1.5 });
        break;
      }
      case "monster_growl": {
        const o = this.out(pos, 1.0, 0.5, 3, 0.8);
        const ws = this.shaper();
        ws.connect(o.node);
        const oo: Out = { node: ws, t: o.t };
        this.osc(oo, 0, { type: "sawtooth", freq: 70, freqEnd: 52, gain: 0.5, attack: 0.2, dur: 1.4 });
        this.noise(oo, 0, { filter: "bandpass", freq: 400, q: 2, gain: 0.5, attack: 0.2, dur: 1.4 });
        break;
      }
      case "monster_breath": {
        const o = this.out(pos, 0.8, 0.3, 2, 1.2);
        this.noise(o, 0, { filter: "bandpass", freq: 600, freqEnd: 900, q: 2.5, gain: 0.5, attack: 0.4, dur: 1.0 });
        this.osc(o, 0, { type: "sawtooth", freq: 65, gain: 0.08, attack: 0.4, dur: 1.0 });
        this.noise(o, 1.1, { filter: "bandpass", freq: 800, freqEnd: 450, q: 2.5, gain: 0.45, attack: 0.1, dur: 1.2 });
        break;
      }
      // ------------------------------------------------------------ la Veilleuse de nuit
      // (mêmes déclenchements, mêmes gains et même portée que le Chirurgien : seul le timbre change)
      case "nurse_step": {
        const heavy = param === "run" ? 1.3 : 1;
        const o = this.out(pos, 1.25 * heavy, 0.35, 2.5, 0.85);
        // pied nu plus sec, ongles qui claquent sur le carrelage
        this.osc(o, 0, { type: "sine", freq: 90, freqEnd: 55, gain: 0.75, dur: 0.16 });
        this.noise(o, 0, { filter: "lowpass", freq: 700, q: 0.8, gain: 0.45, dur: 0.12 });
        this.noise(o, 0.05, { filter: "bandpass", freq: 3400, q: 3, gain: 0.14, dur: 0.035 });
        this.noise(o, 0.08, { filter: "bandpass", freq: 3900, q: 3, gain: 0.1, dur: 0.03 });
        break;
      }
      case "nurse_breath": {
        // berceuse fredonnée bouche fermée, voix soufflée (plus tonale qu'un souffle : un peu plus bas)
        const o = this.out(pos, 0.56, 0.45, 2, 1.2);
        const lp = this.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1100;
        lp.connect(o.node);
        const oo: Out = { node: lp, t: o.t };
        const tune = LULLABY[Math.floor(Math.random() * LULLABY.length)]!;
        let t = 0;
        for (const [st, d] of tune) {
          const f = 330 * 2 ** (st / 12);
          this.osc(oo, t, { type: "triangle", freq: f, freqEnd: f * 0.985, gain: 0.3, attack: 0.07, dur: d * 1.05 });
          this.osc(oo, t, { type: "sine", freq: f * 2, gain: 0.07, attack: 0.07, dur: d });
          this.noise(oo, t, { filter: "bandpass", freq: f * 2.5, q: 5, gain: 0.08, attack: 0.08, dur: d });
          t += d;
        }
        break;
      }
      case "nurse_growl": {
        // « chhhhut » soufflé entre les dents, murmure grave
        const o = this.out(pos, 1.22, 0.5, 3, 0.8);
        this.noise(o, 0, { filter: "highpass", freq: 2600, q: 0.7, gain: 0.55, attack: 0.25, dur: 1.3 });
        const ws = this.shaper();
        ws.connect(o.node);
        this.osc({ node: ws, t: o.t }, 0.1, { type: "triangle", freq: 150, freqEnd: 118, gain: 0.28, attack: 0.3, dur: 1.2 });
        break;
      }
      case "nurse_scream": {
        // cri aigu et déchirant
        const o = this.out(pos, 2.0, 0.6, 5, 0.6);
        const ws = this.shaper();
        const g = this.ctx.createGain();
        g.gain.value = 0.45;
        ws.connect(g);
        g.connect(o.node);
        const oo: Out = { node: ws, t: o.t };
        for (const [f, d] of [
          [620, 0],
          [930, 9],
          [1240, -7],
        ] as Array<[number, number]>) {
          this.osc(oo, 0, { type: "sawtooth", freq: f, freqEnd: f * 0.62, glide: 1.4, gain: 0.3, attack: 0.04, dur: 1.5, detune: d });
        }
        this.noise(oo, 0, { filter: "bandpass", freq: 3200, freqEnd: 1400, q: 1.4, gain: 0.7, attack: 0.03, dur: 1.4 });
        break;
      }
      // ------------------------------------------------------------ le Patient zéro
      case "patient_step": {
        const heavy = param === "run" ? 1.3 : 1;
        const o = this.out(pos, 1.2 * heavy, 0.35, 2.5, 0.85);
        this.osc(o, 0, { type: "sine", freq: 62, freqEnd: 38, gain: 0.75, dur: 0.22 });
        this.noise(o, 0, { filter: "lowpass", freq: 420, q: 0.8, gain: 0.5, dur: 0.16 });
        // pied à perfusion : la roulette grince, la tige cliquette
        const f = 2300 + Math.random() * 500;
        this.osc(o, 0.03, { type: "sine", freq: f, freqEnd: f * 1.18, gain: 0.045, attack: 0.02, dur: 0.16 });
        this.osc(o, 0.03, { type: "sine", freq: f * 1.51, freqEnd: f * 1.7, gain: 0.02, attack: 0.02, dur: 0.14 });
        for (let i = 0; i < 3; i++) this.noise(o, 0.02 + i * 0.045, { filter: "bandpass", freq: 3600 + i * 400, q: 4, gain: 0.08, dur: 0.02 });
        break;
      }
      case "patient_breath": {
        // respiration encombrée : râle humide, puis sifflement à l'expiration
        const o = this.out(pos, 0.98, 0.3, 2, 1.2);
        for (let i = 0; i < 14; i++) this.noise(o, i * 0.055, { filter: "bandpass", freq: 320 + Math.random() * 140, q: 3, gain: 0.32, dur: 0.045 });
        this.noise(o, 0, { filter: "bandpass", freq: 500, freqEnd: 800, q: 2, gain: 0.2, attack: 0.3, dur: 0.8 });
        this.noise(o, 0.95, { filter: "bandpass", freq: 1700, freqEnd: 1200, q: 6, gain: 0.35, attack: 0.1, dur: 1.0 });
        this.osc(o, 0.95, { type: "sine", freq: 1650, freqEnd: 1450, gain: 0.03, attack: 0.1, dur: 0.9 });
        break;
      }
      case "patient_growl": {
        // gargouillis grave, bouche béante
        const o = this.out(pos, 1.24, 0.5, 3, 0.8);
        const ws = this.shaper();
        ws.connect(o.node);
        const oo: Out = { node: ws, t: o.t };
        this.osc(oo, 0, { type: "sawtooth", freq: 58, freqEnd: 44, gain: 0.45, attack: 0.15, dur: 1.4 });
        for (let i = 0; i < 12; i++) this.noise(oo, 0.1 + i * 0.1, { filter: "bandpass", freq: 260 + Math.random() * 200, q: 2.5, gain: 0.35, dur: 0.07 });
        break;
      }
      case "patient_scream": {
        // hurlement rauque, étranglé
        const o = this.out(pos, 1.46, 0.6, 5, 0.6);
        const ws = this.shaper();
        const g = this.ctx.createGain();
        g.gain.value = 0.55;
        ws.connect(g);
        g.connect(o.node);
        const oo: Out = { node: ws, t: o.t };
        for (const [f, d] of [
          [210, 0],
          [315, 14],
          [420, -10],
        ] as Array<[number, number]>) {
          this.osc(oo, 0, { type: "sawtooth", freq: f, freqEnd: f * 0.5, glide: 1.5, gain: 0.35, attack: 0.06, dur: 1.6, detune: d });
        }
        this.noise(oo, 0, { filter: "bandpass", freq: 1500, freqEnd: 600, q: 1.2, gain: 0.9, attack: 0.03, dur: 1.5 });
        break;
      }
      case "detect": {
        // il commence à te repérer : inspiration brusque + cordes dissonantes qui montent
        const o = this.out(null, 0.9, 0.35);
        this.noise(o, 0, { filter: "bandpass", freq: 1400, freqEnd: 2600, q: 1.8, gain: 0.35, attack: 0.05, dur: 0.35 });
        for (const [f, d] of [
          [220, 0],
          [233, 6],
          [330, -4],
        ] as Array<[number, number]>) {
          this.osc(o, 0.05, { type: "sawtooth", freq: f, freqEnd: f * 1.06, gain: 0.05, attack: 0.5, dur: 1.3, detune: d, exp: false });
        }
        break;
      }
      case "capture": {
        const o = this.out(null, 1.3, 0.4);
        const ws = this.shaper();
        ws.connect(o.node);
        const oo: Out = { node: ws, t: o.t };
        for (const f of [220, 233, 311, 466, 622]) this.osc(oo, 0, { type: "sawtooth", freq: f, freqEnd: f * 0.7, gain: 0.3, dur: 1.4 });
        this.noise(oo, 0, { filter: "lowpass", freq: 6000, freqEnd: 300, q: 0.7, gain: 1, dur: 1.2 });
        this.osc(o, 0, { type: "sine", freq: 50, freqEnd: 30, gain: 1, dur: 1 });
        break;
      }
      // ------------------------------------------------------------ véhicules (cinématiques)
      case "car_door": {
        const o = this.out(pos, 0.9, 0.2);
        this.clunk(o, 0, 0.9, 0.9);
        this.noise(o, 0, { filter: "bandpass", freq: 1800, q: 2, gain: 0.3, dur: 0.08 });
        break;
      }
      case "engine": {
        const o = this.out(pos, 0.9, 0.15, 4, 0.6);
        const dur = Number(param || 3);
        this.osc(o, 0, { type: "sawtooth", freq: 38, freqEnd: 70, glide: dur, gain: 0.35, attack: 0.2, dur });
        this.osc(o, 0, { type: "square", freq: 19, freqEnd: 35, glide: dur, gain: 0.2, attack: 0.2, dur });
        this.noise(o, 0, { filter: "lowpass", freq: 300, freqEnd: 700, q: 1, gain: 0.3, attack: 0.3, dur });
        break;
      }
      case "siren": {
        const o = this.out(pos, 0.6, 0.2, 6, 0.5);
        for (let i = 0; i < 6; i++) this.osc(o, i * 0.6, { type: "triangle", freq: i % 2 ? 660 : 880, gain: 0.25, dur: 0.6, exp: false });
        break;
      }
      case "bang": {
        const o = this.out(pos, 1.2, 0.8, 5, 0.6);
        this.clunk(o, 0, 1, 0.5);
        for (const f of [180, 413, 760]) this.osc(o, 0, { type: "sine", freq: f, gain: 0.15, dur: 1.5 });
        break;
      }
      case "drip": {
        const o = this.out(pos, 0.35, 0.6, 1.5, 1.3);
        this.osc(o, 0, { type: "sine", freq: 1700 + Math.random() * 900, freqEnd: 500, glide: 0.05, gain: 0.4, dur: 0.09 });
        break;
      }
      case "creak_far": {
        const o = this.out(pos, 0.6, 0.7, 3, 0.7);
        this.creak(o, 0, 0.35, 1.2 + Math.random());
        break;
      }
      default:
        break;
    }
  }
}
