import { CONFIG } from "../config";
import { h, Screen } from "./dom";

const TIPS = [
  "Le sprint ne se déclenche que jauge pleine… et ne s'arrête qu'à vide. Choisis bien ton moment.",
  "Le Chirurgien entend tes pas. Le métal et le carrelage portent plus loin que l'herbe.",
  "Maintiens R pour relancer instantanément une run.",
  "Deux emplacements seulement. Planifie ta route avant de te charger.",
  "Ta lampe te rend visible de loin. Parfois, l'obscurité est une alliée.",
  "Trois sorties. La plus rapide dépend de la seed.",
  "Accroupi, tu es plus lent… mais presque silencieux.",
  "S'il t'a vu entrer dans une cachette, il viendra peut-être vérifier.",
  "À 8:00, l'hôpital se verrouille. À 10:00, ton pote se casse.",
];

/** Écran de chargement pendant la génération (textures, géométrie, navmesh, bake…). */
export class LoadingScreen extends Screen {
  private bar: HTMLDivElement;
  private step: HTMLDivElement;
  private tip: HTMLDivElement;
  private tipTimer = 0;

  constructor() {
    super("loading");
    this.bar = h("div");
    this.step = h("div", { class: "loading-step" }, "Initialisation…");
    this.tip = h("div", { class: "loading-tip" });
    this.root.append(
      h("h1", { class: "game-title" }, CONFIG.game.title),
      h("div", { class: "game-subtitle" }, CONFIG.game.subtitle),
      h("div", { class: "loading-bar" }, this.bar),
      this.step,
      this.tip,
      h("div", { class: "noise-overlay" }),
    );
    this.nextTip();
  }

  protected override onShow(): void {
    this.tipTimer = window.setInterval(() => this.nextTip(), 4200);
  }

  protected override onHide(): void {
    window.clearInterval(this.tipTimer);
  }

  private nextTip(): void {
    this.tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)] ?? "";
  }

  setProgress(p: number, label: string): void {
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;
    this.step.textContent = label;
  }

  showError(message: string): void {
    this.root.append(h("div", { class: "loading-error" }, message));
  }
}
