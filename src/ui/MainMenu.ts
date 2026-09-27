import { CONFIG, type Difficulty } from "../config";
import type { Settings } from "../core/Settings";
import { clear, h, Screen } from "./dom";

export const DIFFICULTY_INFO: Record<Difficulty, { name: string; desc: string }> = {
  easy: {
    name: "Facile",
    desc: "Le Chirurgien est lent et distrait. Il ne saute pas les barrières et vérifie rarement les cachettes.",
  },
  normal: {
    name: "Normal",
    desc: "L'expérience prévue. Il entend bien, saute les barrières et n'oublie pas facilement.",
  },
  hard: {
    name: "Difficile",
    desc: "Plus rapide, plus attentif. Il prend les raccourcis, pose des pièges et fouille souvent les cachettes.",
  },
  nightmare: {
    name: "Cauchemar",
    desc: "Il réagit instantanément et anticipe ta route. Chaque erreur se paie cash.",
  },
};

export interface MainMenuActions {
  play(): void;
  records(): void;
  options(): void;
  quit(): void;
}

type Panel = "none" | "difficulty" | "seed";

/** Menu principal (le fond 3D animé de l'hôpital est rendu derrière). */
export class MainMenu extends Screen {
  private items: HTMLDivElement;
  private panelHost: HTMLDivElement;
  private panel: Panel = "none";

  constructor(private readonly settings: Settings, private readonly actions: MainMenuActions) {
    super("main-menu");
    const title = h("h1", { class: "game-title" }, "DIX", h("br"), h("span", { class: "t-red" }, "MINUTES"));
    this.items = h("div", { class: "menu-items" });
    this.panelHost = h("div");
    this.root.append(
      h("div", { class: "menu-left" }, title, h("div", { class: "game-subtitle" }, CONFIG.game.subtitle), this.items),
      this.panelHost,
      h("div", { class: "menu-footer" }, "Speedrun d'horreur · 100 % procédural"),
      h("div", { class: "menu-hint", html: "Z Q S D · souris · F lampe · E interagir<br>Maintiens R pour relancer une run" }),
      h("div", { class: "scanlines" }),
      h("div", { class: "noise-overlay" }),
    );
    this.render();
    settings.on("change", () => {
      if (this.isMounted) this.render();
    });
  }

  protected override onShow(): void {
    this.panel = "none";
    this.render();
  }

  private item(label: string, onClick: () => void, value?: string, cls = "", active = false): HTMLButtonElement {
    return h(
      "button",
      { class: `menu-item ${cls} ${active ? "active" : ""}`, onclick: () => onClick() },
      label,
      value ? h("span", { class: "mi-value" }, value) : null,
    );
  }

  private render(): void {
    const s = this.settings.data;
    clear(this.items);
    this.items.append(
      this.item("Jouer", () => this.actions.play(), undefined, "primary"),
      this.item("Difficulté", () => this.toggle("difficulty"), DIFFICULTY_INFO[s.difficulty].name, "", this.panel === "difficulty"),
      this.item(
        "Mode de seed",
        () => this.toggle("seed"),
        s.seedMode === "random" ? "Random" : `Set · ${s.setSeed || "—"}`,
        "",
        this.panel === "seed",
      ),
      this.item("Records", () => this.actions.records()),
      this.item("Options", () => this.actions.options()),
      this.item("Quitter", () => this.actions.quit()),
    );
    this.renderPanel();
  }

  private toggle(p: Panel): void {
    this.panel = this.panel === p ? "none" : p;
    this.render();
  }

  private renderPanel(): void {
    clear(this.panelHost);
    const s = this.settings.data;
    if (this.panel === "difficulty") {
      const list = h("div", { class: "choice-list" });
      for (const d of ["easy", "normal", "hard", "nightmare"] as Difficulty[]) {
        list.append(
          h(
            "button",
            {
              class: `choice ${s.difficulty === d ? "selected" : ""}`,
              onclick: () => this.settings.update({ difficulty: d }),
            },
            h("div", { class: "choice-name" }, DIFFICULTY_INFO[d].name),
            h("div", { class: "choice-desc" }, DIFFICULTY_INFO[d].desc),
          ),
        );
      }
      this.panelHost.append(h("div", { class: "side-panel" }, h("h2", { class: "panel-title" }, "Difficulté"), list));
    } else if (this.panel === "seed") {
      const input = h("input", {
        class: "text-input",
        type: "text",
        maxlength: 24,
        placeholder: "EX : H0SP1T4L",
        value: s.setSeed,
        spellcheck: "false",
      }) as HTMLInputElement;
      input.addEventListener("input", () => {
        const v = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
        if (v !== input.value) input.value = v;
      });
      input.addEventListener("change", () => this.settings.update({ setSeed: input.value, seedMode: input.value ? "set" : s.seedMode }));
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          this.settings.update({ setSeed: input.value, seedMode: input.value ? "set" : "random" });
        }
      });
      const list = h(
        "div",
        { class: "choice-list" },
        h(
          "button",
          { class: `choice ${s.seedMode === "random" ? "selected" : ""}`, onclick: () => this.settings.update({ seedMode: "random" }) },
          h("div", { class: "choice-name" }, "Random Seed"),
          h("div", { class: "choice-desc" }, "Une nouvelle seed à chaque run : spawns des objets et codes différents. Le restart (R) tire une nouvelle seed."),
        ),
        h(
          "button",
          {
            class: `choice ${s.seedMode === "set" ? "selected" : ""}`,
            onclick: () => {
              this.settings.update({ seedMode: "set", setSeed: input.value });
            },
          },
          h("div", { class: "choice-name" }, "Set Seed"),
          h("div", { class: "choice-desc" }, "Rejoue toujours la même seed (entraînement de route, courses entre potes). Le restart garde la seed."),
        ),
      );
      this.panelHost.append(
        h(
          "div",
          { class: "side-panel" },
          h("h2", { class: "panel-title" }, "Mode de seed"),
          list,
          h("div", { style: "margin-top:16px" }, input),
        ),
      );
    }
  }
}
