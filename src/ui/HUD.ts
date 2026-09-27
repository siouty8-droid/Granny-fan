import type { SprintState } from "../player/Stamina";
import type { LiveSplit } from "../run/RunManager";
import { formatDelta, formatTenths } from "../run/RunTimer";
import { h, Screen } from "./dom";
import { HideOverlay, KeypadView, NoteView } from "./GameOverlays";
import { HoldRing } from "./HoldRing";
import { itemIcon } from "./ItemIcons";
import type { Slot } from "../gameplay/Inventory";
import { ITEMS } from "../gameplay/data/items";

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
  readonly keypad = new KeypadView();
  readonly note = new NoteView();
  readonly hideOverlay = new HideOverlay();
  private invKey = "";
  private lastSprintClass = "";
  private lastPrompt = "";
  private sprintVisible = 1;
  private lastTimer = "";
  private lastLockdown = false;
  private splitTimer = 0;

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
    this.root.append(
      this.hideOverlay.root,
      this.timer,
      this.split,
      this.inventory,
      this.sprint,
      this.crosshair,
      this.prompt,
      this.toastEl,
      this.note.root,
      this.keypad.root,
      this.restartRing.root,
    );
  }

  setTimer(ms: number, lockdown: boolean): void {
    const t = formatTenths(ms);
    if (t !== this.lastTimer) {
      this.timer.textContent = t;
      this.lastTimer = t;
    }
    if (lockdown !== this.lastLockdown) {
      this.timer.classList.toggle("lockdown", lockdown);
      this.lastLockdown = lockdown;
    }
  }

  /** Affiche le dernier split (nom, temps, écart au PB) quelques secondes. */
  showSplit(s: LiveSplit): void {
    const delta =
      s.deltaMs === null ? "" : `<span class="${s.deltaMs <= 0 ? "ahead" : "behind"}">${formatDelta(s.deltaMs)}</span>`;
    this.split.innerHTML = `<span class="split-name">${s.label.replace(/</g, "&lt;")}</span>${formatTenths(s.ms)} ${delta}`;
    this.split.style.opacity = "1";
    window.clearTimeout(this.splitTimer);
    this.splitTimer = window.setTimeout(() => (this.split.style.opacity = "0"), 5000);
  }

  clearSplit(): void {
    window.clearTimeout(this.splitTimer);
    this.split.style.opacity = "0";
    this.split.innerHTML = "";
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

  /** Emplacements d'inventaire (icône, quantité, sélection, nom de l'objet sélectionné). */
  setInventory(slots: ReadonlyArray<Slot | null>, selected: number, keys: string[]): void {
    const key = slots.map((s) => (s ? `${s.item}x${s.count}` : "-")).join("|") + `#${selected}#${keys.join(",")}`;
    if (key === this.invKey) return;
    this.invKey = key;
    this.inventory.replaceChildren(
      ...slots.map((s, i) => {
        const el = h("div", { class: `inv-slot${i === selected ? " selected" : ""}` }, h("span", { class: "inv-key" }, keys[i] ?? String(i + 1)));
        if (s) {
          el.append(itemIcon(s.item));
          if (s.count > 1) el.append(h("span", { class: "inv-count" }, `×${s.count}`));
          if (i === selected) el.append(h("div", { class: "inv-name" }, ITEMS[s.item].name));
        }
        return el;
      }),
    );
  }

  setCrosshairVisible(v: boolean): void {
    this.crosshair.style.display = v ? "" : "none";
  }
}
