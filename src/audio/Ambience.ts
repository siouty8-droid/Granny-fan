import type { AudioEngine } from "./AudioEngine";
import type { Sfx } from "./Sfx";

interface HumVoice {
  gain: GainNode;
  panner: PannerNode;
  slot: number;
  target: number;
}

/**
 * Couches continues : drone oppressant (bus musique), vent (dehors / cour), bourdonnement des
 * néons (3 voix spatialisées réaffectées aux luminaires les plus proches), musique de poursuite
 * rythmée, nappe de tension quand il est proche, sirène du confinement. Plus des évènements
 * aléatoires : gouttes, craquements du bâtiment, chocs lointains.
 */
export class Ambience {
  private started = false;
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private lockOsc!: OscillatorNode;
  private lockGain!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private hums: HumVoice[] = [];
  private chaseGain!: GainNode;
  private tensionGain!: GainNode;
  private sirenGain!: GainNode;
  private nextBeat = 0;
  private beat = 0;
  private lastT = 0;
  /** 0..1 */
  chase = 0;
  private chaseTarget = 0;
  tension = 0;
  outdoor = 0;
  lockdown = false;
  siren = false;
  private dripTimer = 3;
  private creakTimer = 10;
  private bangTimer = 45;
  private trainTimer = 50;
  /** rames fantômes au loin (centre commercial) */
  trains = false;
  enabled = false;
  /** évènements aléatoires (gouttes, craquements) : en jeu et en cinématique seulement */
  events = true;

  constructor(
    private readonly a: AudioEngine,
    private readonly sfx: Sfx,
  ) {}

  /** Construit le graphe (une fois, contexte prêt). */
  start(): void {
    if (this.started || !this.a.ctx) return;
    this.started = true;
    const ctx = this.a.ctx;
    const t = ctx.currentTime;
    // --- drone
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 170;
    this.droneFilter.Q.value = 1.2;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.a.music);
    for (const [f, d] of [
      [41.2, 0],
      [41.2, 7],
      [61.7, -5],
      [82.4, 3],
    ] as Array<[number, number]>) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = f > 70 ? 0.12 : 0.3;
      o.connect(g);
      g.connect(this.droneFilter);
      o.start(t);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lg = ctx.createGain();
    lg.gain.value = 70;
    lfo.connect(lg);
    lg.connect(this.droneFilter.frequency);
    lfo.start(t);
    // dissonance du confinement
    this.lockOsc = ctx.createOscillator();
    this.lockOsc.type = "sawtooth";
    this.lockOsc.frequency.value = 58.3;
    this.lockGain = ctx.createGain();
    this.lockGain.gain.value = 0;
    this.lockOsc.connect(this.lockGain);
    this.lockGain.connect(this.droneFilter);
    this.lockOsc.start(t);
    // --- vent
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = this.a.noise();
    wsrc.loop = true;
    wsrc.playbackRate.value = 0.5;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 420;
    this.windFilter.Q.value = 0.9;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.09;
    const wlg = ctx.createGain();
    wlg.gain.value = 220;
    wl.connect(wlg);
    wlg.connect(this.windFilter.frequency);
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wsrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.a.sfx);
    wsrc.start(t);
    wl.start(t);
    // --- néons (3 voix)
    for (let i = 0; i < 3; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = this.a.panner(0, -100, 0, 1.2, 1.6);
      const o1 = ctx.createOscillator();
      o1.type = "sine";
      o1.frequency.value = 100;
      const o2 = ctx.createOscillator();
      o2.type = "sawtooth";
      o2.frequency.value = 200;
      const g2 = ctx.createGain();
      g2.gain.value = 0.05;
      const hp = ctx.createBiquadFilter();
      hp.type = "bandpass";
      hp.frequency.value = 1200;
      hp.Q.value = 3;
      o1.connect(g);
      o2.connect(g2);
      g2.connect(hp);
      hp.connect(g);
      g.connect(p);
      p.connect(this.a.sfx);
      o1.start(t);
      o2.start(t);
      this.hums.push({ gain: g, panner: p, slot: 0, target: 0 });
    }
    // --- poursuite / tension / sirène
    this.chaseGain = ctx.createGain();
    this.chaseGain.gain.value = 0;
    this.chaseGain.connect(this.a.music);
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionGain.connect(this.a.music);
    for (const f of [880, 931, 1244]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const trem = ctx.createOscillator();
      trem.frequency.value = 7 + f / 400;
      const tg = ctx.createGain();
      tg.gain.value = 0.3;
      const og = ctx.createGain();
      og.gain.value = 0.25;
      trem.connect(tg);
      tg.connect(og.gain);
      o.connect(og);
      og.connect(this.tensionGain);
      o.start(t);
      trem.start(t);
    }
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenGain.connect(this.a.sfx);
    const so = ctx.createOscillator();
    so.type = "triangle";
    so.frequency.value = 750;
    const sl = ctx.createOscillator();
    sl.type = "square";
    sl.frequency.value = 0.55;
    const slg = ctx.createGain();
    slg.gain.value = 150;
    sl.connect(slg);
    slg.connect(so.frequency);
    so.connect(this.sirenGain);
    so.start(t);
    sl.start(t);
    this.nextBeat = t + 0.1;
  }

  /** Affecte les voix de bourdonnement aux luminaires les plus proches. */
  setHums(list: Array<{ x: number; y: number; z: number; slot: number; level: number }>): void {
    if (!this.started) return;
    for (let i = 0; i < this.hums.length; i++) {
      const h = this.hums[i]!;
      const src = list[i];
      if (!src) {
        h.target = 0;
        continue;
      }
      this.a.setPannerPos(h.panner, src.x, src.y, src.z);
      h.slot = src.slot;
      h.target = src.level;
    }
  }

  setChase(on: boolean): void {
    this.chaseTarget = on ? 1 : 0;
  }

  update(dt: number, flicker: Float32Array, listener: { x: number; y: number; z: number; floorY: number }): void {
    if (!this.started || !this.a.ctx) return;
    const ctx = this.a.ctx;
    const t = ctx.currentTime;
    const on = this.enabled ? 1 : 0;
    this.droneGain.gain.setTargetAtTime(on * (this.lockdown ? 0.34 : 0.22) * (1 - this.chase * 0.4), t, 0.5);
    this.lockGain.gain.setTargetAtTime(this.lockdown ? 0.22 : 0, t, 1.5);
    this.windGain.gain.setTargetAtTime(on * (0.04 + this.outdoor * 0.32), t, 0.6);
    for (const h of this.hums) {
      const f = flicker[h.slot] ?? 1;
      h.gain.gain.setTargetAtTime(on * h.target * 0.09 * (0.3 + 0.7 * f) * (this.lockdown ? 0.3 : 1), t, 0.03);
    }
    this.sirenGain.gain.setTargetAtTime(this.siren && this.enabled ? 0.05 : 0, t, 0.4);
    this.tensionGain.gain.setTargetAtTime(on * this.tension * 0.05, t, 0.4);
    // poursuite : fondu + séquenceur (tambour + accords dissonants)
    this.chase += (this.chaseTarget - this.chase) * Math.min(1, dt * (this.chaseTarget > this.chase ? 2.5 : 0.5));
    this.chaseGain.gain.setTargetAtTime(on * this.chase * 0.55, t, 0.1);
    const bpm = this.lockdown ? 196 : 176;
    const step = 60 / bpm / 2;
    // anticipation ≥ 0,2 s et > 1 frame (robuste aux saccades) ; les temps déjà passés sont sautés
    const ahead = Math.max(0.2, Math.min(1, (t - this.lastT) * 1.6));
    this.lastT = t;
    while (this.nextBeat < t + ahead) {
      if (this.nextBeat >= t && this.chase > 0.02) this.scheduleBeat(this.nextBeat, this.beat);
      this.beat = (this.beat + 1) % 16;
      this.nextBeat += step;
    }
    // évènements aléatoires
    if (!this.enabled || !this.events) return;
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 1.5 + Math.random() * 4.5;
      if (this.outdoor < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 6;
        this.sfx.play("drip", { x: listener.x + Math.cos(a) * r, y: listener.floorY + 2.6, z: listener.z + Math.sin(a) * r });
      }
    }
    this.creakTimer -= dt;
    if (this.creakTimer <= 0) {
      this.creakTimer = 8 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 12;
      this.sfx.play("creak_far", { x: listener.x + Math.cos(a) * r, y: listener.floorY + 2, z: listener.z + Math.sin(a) * r });
    }
    this.bangTimer -= dt;
    if (this.bangTimer <= 0) {
      this.bangTimer = 35 + Math.random() * 40;
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 15;
      this.sfx.play("bang", { x: listener.x + Math.cos(a) * r, y: listener.floorY + (Math.random() < 0.5 ? 4 : -2), z: listener.z + Math.sin(a) * r });
    }
    if (this.trains) {
      this.trainTimer -= dt;
      if (this.trainTimer <= 0) {
        this.trainTimer = 60 + Math.random() * 60;
        const a = Math.random() * Math.PI * 2;
        this.sfx.play("train_far", { x: listener.x + Math.cos(a) * 25, y: listener.floorY - 9, z: listener.z + Math.sin(a) * 25 });
      }
    }
  }

  private scheduleBeat(t: number, i: number): void {
    const ctx = this.a.ctx!;
    const dest = this.chaseGain;
    const hit = (freq: number, end: number, dur: number, gain: number, type: OscillatorType = "sine") => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(end, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    // grosse caisse / tom
    if (i % 4 === 0 || i === 6 || i === 14) hit(78, 42, 0.28, 0.9);
    if (i % 4 === 2) hit(140, 90, 0.12, 0.35, "triangle");
    // charleston métallique
    if (i % 2 === 1) {
      const src = ctx.createBufferSource();
      src.buffer = this.a.noise();
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      src.start(t, Math.random());
      src.stop(t + 0.06);
    }
    // accords dissonants (cordes « stab »)
    if (i === 0 || i === 8 || (this.lockdown && i === 12)) {
      const root = i === 8 ? 116.5 : 110;
      for (const m of [1, 1.0595, 1.498, 2.12]) hit(root * m, root * m * 0.98, 0.5, 0.07, "sawtooth");
    }
  }
}
