import type { SprintState } from "../player/Stamina";
import { h, Screen } from "./dom";
import { HoldRing } from "./HoldRing";

/**
 * HUD minimal : timer, split en cours, jauge de sprint, 2 emplacements d'inventaire.
 * + éléments contextuels (point de visée discret, invite d'interaction, jauge de restart).
 */
export class HUD extends Screen {
  readonly timer: HTMLDivElement;
  readonly split: HTMLDivElement;
  readonly inventory: HTMLDivElement;
  private sprint: HTMLDivElement;
  private sprintFill: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastTimer = 0;
  readonly restartRing: HoldRing;
  private lastSprintClass = "";
  private lastPrompt = "";
  private sprintVisible = 1;

  constructor() {
    super("hud");
    this.timer = h("div", { class: "hud-timer" }, "0:00.0");
    this.split = h("div", { class: "hud-split" });
    this.inventory = h("div", { class: "hud-inventory" });
    this.sprintFill = h("div");
    this.sprint = h("div", { class: "hud-sprint ready" }, this.sprintFill);
    this.crosshair = h("div", { class: "crosshair" });
    this.prompt = h("div", { class: "interact-prompt" });
    this.toastEl = h("div", { class: "toast" });
    this.restartRing = new HoldRing("R", "Restart", { left: "calc(50% - 32px)", top: "calc(50% - 110px)" });
    this.root.append(this.timer, this.split, this.inventory, this.sprint, this.crosshair, this.prompt, this.toastEl, this.restartRing.root);
  }

  setSprint(value: number, state: SprintState, denied: boolean, dt: number): void {
    this.sprintFill.style.transform = `scaleX(${value.toFixed(4)})`;
    const cls = `hud-sprint ${state}${denied ? " denied" : ""}`;
    if (cls !== this.lastSprintClass) {
      this.sprint.className = cls;
      this.lastSprintClass = cls;
    }
    // jauge pleine et inactive : elle s'efface doucement pour ne pas polluer l'écran
    const target = state === "ready" && !denied ? 0.35 : 1;
    this.sprintVisible += (target - this.sprintVisible) * Math.min(1, dt * 3);
    this.sprint.style.opacity = this.sprintVisible.toFixed(3);
  }

  setPrompt(html: string, active: boolean): void {
    if (html !== this.lastPrompt) {
      this.prompt.innerHTML = html;
      this.lastPrompt = html;
    }
    this.crosshair.classList.toggle("active", active);
  }

  toast(text: string, seconds = 2.2): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), seconds * 1000);
  }

  setCrosshairVisible(v: boolean): void {
    this.crosshair.style.display = v ? "" : "none";
  }
}
