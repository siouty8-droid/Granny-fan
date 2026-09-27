import { h, Screen } from "./dom";

export interface PauseActions {
  resume(): void;
  restart(): void;
  /** recommencer sur la même seed */
  replay(): void;
  options(): void;
  quitToMenu(): void;
}

/**
 * Menu pause : l'écran de jeu est entièrement masqué (fond opaque) pour qu'on ne
 * puisse pas étudier la carte pendant que le timer est arrêté.
 */
export class PauseMenu extends Screen {
  private info: HTMLDivElement;

  constructor(actions: PauseActions) {
    super("pause-screen");
    this.info = h("div", { class: "pause-info" });
    const item = (label: string, fn: () => void, cls = "") => h("button", { class: `menu-item ${cls}`, onclick: () => fn() }, label);
    this.root.append(
      h(
        "div",
        { class: "pause-box" },
        h("h1", { class: "pause-title" }, "PAUSE"),
        this.info,
        item("Reprendre", () => actions.resume(), "primary"),
        item("Recommencer", () => actions.restart()),
        item("Rejouer cette seed", () => actions.replay()),
        item("Options", () => actions.options()),
        item("Menu principal", () => actions.quitToMenu()),
      ),
      h("div", { class: "noise-overlay" }),
    );
  }

  setInfo(lines: string[]): void {
    this.info.innerHTML = lines.map((l) => l.replace(/</g, "&lt;")).join("<br>");
  }
}
