import type { AudioEngine } from "../audio/AudioEngine";
import { h, Screen } from "../ui/dom";
import { HoldRing } from "../ui/HoldRing";

/** Voix des personnages : couleur du nom, timbre et hauteur des bips, vitesse de frappe. */
export interface Voice {
  name: string;
  color: string;
  freq: number;
  wave: OscillatorType;
  /** variation de hauteur selon la lettre */
  spread: number;
  gain: number;
  /** caractères par seconde */
  cps: number;
  /** pensée (italique, sans bip appuyé) */
  thought?: boolean;
}

export const VOICES = {
  leo: { name: "Léo", color: "#e8c46a", freq: 330, wave: "triangle", spread: 0.18, gain: 0.35, cps: 38 },
  mehdi: { name: "Mehdi", color: "#7fb8e8", freq: 170, wave: "square", spread: 0.12, gain: 0.14, cps: 42 },
  thought: { name: "Léo", color: "#b8ab94", freq: 520, wave: "sine", spread: 0.1, gain: 0.18, cps: 30, thought: true },
  far: { name: "Mehdi (au loin)", color: "#6f93b3", freq: 150, wave: "square", spread: 0.1, gain: 0.06, cps: 44 },
} satisfies Record<string, Voice>;

export type VoiceId = keyof typeof VOICES;

/**
 * Surcouche des cinématiques : bandes noires, boîte de dialogue à effet machine à écrire (un bip
 * synthétisé par lettre, timbre propre à chaque personnage), fondu, jauge « maintenir pour passer ».
 */
export class CinemaOverlay extends Screen {
  private box: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  readonly skipRing: HoldRing;
  private full = "";
  private shown = 0;
  private acc = 0;
  private voice: Voice = VOICES.leo;
  private hideAt = 0;
  private time = 0;

  constructor(private readonly audio: AudioEngine) {
    super("cinema");
    const top = h("div", { class: "cine-bar top" });
    const bottom = h("div", { class: "cine-bar bottom" });
    this.nameEl = h("div", { class: "cine-name" });
    this.textEl = h("div", { class: "cine-text" });
    this.box = h("div", { class: "cine-box" }, this.nameEl, this.textEl);
    this.fadeEl = h("div", { class: "cine-fade" });
    this.skipRing = new HoldRing("⏎", "Passer", { right: "40px", bottom: "34px" });
    this.hintEl = h("div", { class: "cine-hint" });
    this.root.append(top, bottom, this.box, this.fadeEl, this.skipRing.root, this.hintEl);
  }

  reset(skipKey: string): void {
    this.full = "";
    this.shown = 0;
    this.box.classList.remove("show");
    this.textEl.textContent = "";
    this.setFade(0);
    this.skipRing.set(0);
    this.skipRing.setLabel(skipKey.length > 3 ? "⏎" : skipKey);
    this.hintEl.textContent = `Maintenir ${skipKey} pour passer`;
    this.time = 0;
  }

  /** Affiche une réplique (effet machine à écrire). */
  say(voiceId: VoiceId, text: string, hold = 2.2): void {
    const v: Voice = VOICES[voiceId];
    this.voice = v;
    this.full = text;
    this.shown = 0;
    this.acc = 0;
    this.nameEl.textContent = v.name;
    this.nameEl.style.color = v.color;
    this.textEl.textContent = "";
    this.textEl.classList.toggle("thought", !!v.thought);
    this.box.classList.add("show");
    this.hideAt = this.time + text.length / v.cps + hold;
  }

  setFade(a: number): void {
    this.fadeEl.style.opacity = String(Math.max(0, Math.min(1, a)));
  }

  update(dt: number): void {
    this.time += dt;
    if (this.shown < this.full.length) {
      this.acc += dt * this.voice.cps;
      while (this.acc >= 1 && this.shown < this.full.length) {
        this.acc -= 1;
        const ch = this.full[this.shown]!;
        this.shown++;
        // bip par lettre (pas pour les espaces ni la ponctuation), léger silence après la ponctuation
        if (/[A-Za-zÀ-ÿ0-9]/.test(ch)) {
          const code = ch.toLowerCase().charCodeAt(0);
          const k = 1 + (((code * 7) % 11) / 10 - 0.5) * this.voice.spread;
          this.audio.beep(this.voice.freq * k, this.voice.wave, 0.045, this.voice.gain);
        } else if (/[.,!?…]/.test(ch)) {
          this.acc -= 3;
        }
      }
      this.textEl.textContent = this.full.slice(0, this.shown);
    } else if (this.full && this.time > this.hideAt) {
      this.box.classList.remove("show");
      this.full = "";
    }
  }

  hideDialogue(): void {
    this.box.classList.remove("show");
    this.full = "";
  }
}
