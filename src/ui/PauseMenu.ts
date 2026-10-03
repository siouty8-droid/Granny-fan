import { h, Screen } from "./dom";

export interface PauseActions {
  resume(): void;
  restart(): void;
  /** recommencer sur la même seed */
  replay(): void;
  options(): void;
  quitToMenu(): void;
  /** pilote auto : le joueur reprend les commandes */
  takeOver(): void;
}

/**
 * Menu pause : l'écran de jeu est entièrement masqué (fond opaque) pour qu'on ne
 * puisse pas étudier la carte pendant que le timer est arrêté.
 */
export class PauseMenu extends Screen {
  private info: HTMLDivElement;
  private takeOverBtn: HTMLButtonElement;

  constructor(actions: PauseActions) {
    super("pause-screen");
    this.info = h("div", { class: "pause-info" });
    const item = (label: string, fn: () => void, cls = "") => h("button", { class: `menu-item ${cls}`, onclick: () => fn() }, label);
    this.takeOverBtn = item("Prendre la main", () => actions.takeOver(), "primary");
    this.root.append(
      h(
        "div",
        { class: "pause-box" },
        h("h1", { class: "pause-title" }, "PAUSE"),
        this.info,
        this.takeOverBtn,
        item("Reprendre", () => actions.resume(), "primary"),
        item("Recommencer", () => actions.restart()),
        item("Rejouer cette seed", () => actions.replay()),
        item("Options", () => actions.options()),
        item("Menu principal", () => actions.quitToMenu()),
      ),
      h("div", { class: "noise-overlay" }),
    );
  }

  /** « Prendre la main » : seulement quand le pilote auto conduit. */
  setAutopilot(active: boolean): void {
    this.takeOverBtn.style.display = active ? "" : "none";
  }

  setInfo(lines: string[]): void {
    this.info.innerHTML = lines.map((l) => l.replace(/</g, "&lt;")).join("<br>");
  }
}
