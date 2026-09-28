import { CONFIG, type Difficulty } from "../config";
import { DEBUG } from "../core/Debug";
import type { AutopilotMode, Settings } from "../core/Settings";
import { UNLOCKS, type Progression } from "../run/Progression";
import { xpBar } from "./XpBar";
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
  /** entraînement : seed imposée (null = aléatoire), difficulté du menu */
  training(seed: string | null): void;
  progression(): void;
  /** couleur de lampe, tenue du Chirurgien */
  customize(): void;
  records(): void;
  options(): void;
  quit(): void;
}

type Panel = "none" | "difficulty" | "seed" | "training";

/** Menu principal (le fond 3D animé de l'hôpital est rendu derrière). */
export class MainMenu extends Screen {
  private items: HTMLDivElement;
  private panelHost: HTMLDivElement;
  private panel: Panel = "none";
  private levelHost: HTMLDivElement;

  constructor(
    private readonly settings: Settings,
    private readonly actions: MainMenuActions,
    private readonly progression: Progression,
  ) {
    super("main-menu");
    const title = h("h1", { class: "game-title" }, "DIX", h("br"), h("span", { class: "t-red" }, "MINUTES"));
    this.items = h("div", { class: "menu-items" });
    this.panelHost = h("div");
    this.levelHost = h("div", { class: "menu-level" });
    this.levelHost.addEventListener("click", () => this.actions.progression());
    this.root.append(
      h("div", { class: "menu-left" }, title, h("div", { class: "game-subtitle" }, CONFIG.game.subtitle), this.levelHost, this.items),
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
    const info = this.progression.info;
    clear(this.levelHost);
    this.levelHost.append(xpBar(info.level, info.into, info.need, info.max));
    clear(this.items);
    this.items.append(
      this.item("Jouer", () => this.actions.play(), undefined, "primary"),
      this.item("Entraînement", () => this.toggle("training"), "sans monstre", "", this.panel === "training"),
      this.item("Difficulté", () => this.toggle("difficulty"), DIFFICULTY_INFO[s.difficulty].name, "", this.panel === "difficulty"),
      this.item(
        "Mode de seed",
        () => this.toggle("seed"),
        s.seedMode === "random" ? "Random" : `Set · ${s.setSeed || "—"}`,
        "",
        this.panel === "seed",
      ),
      this.item("Progression", () => this.actions.progression(), `niv. ${info.level}`),
      this.item("Personnaliser", () => this.actions.customize(), "lampe · tenue"),
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
    } else if (this.panel === "training") {
      this.renderTraining();
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

  private renderTraining(): void {
    const s = this.settings.data;
    const input = h("input", {
      class: "text-input",
      type: "text",
      maxlength: 24,
      placeholder: "Seed (vide = aléatoire)",
      value: s.trainingSeed,
      spellcheck: "false",
    }) as HTMLInputElement;
    input.addEventListener("input", () => {
      const v = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (v !== input.value) input.value = v;
    });
    const start = () => {
      const seed = input.value.trim();
      this.settings.update({ trainingSeed: seed });
      this.actions.training(seed || null);
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") start();
    });
    const auto = UNLOCKS.find((u) => u.id === "autopilot")!;
    const unlocked = this.progression.isUnlocked("autopilot") || DEBUG.enabled;
    let autoRow: HTMLElement;
    if (unlocked) {
      const modes: Array<[AutopilotMode, string]> = [
        ["off", "Non"],
        ["best", "Meilleure"],
        ["gate", "Portail"],
        ["ambulance", "Ambulance"],
        ["roof", "Toit"],
      ];
      const autoHint = (m: AutopilotMode): string =>
        m === "off"
          ? "Tu joues toi-même."
          : `Ton perso finit la seed tout seul par la route optimale${m === "best" ? " (la sortie la plus rapide)" : ""}, avec une vingtaine de secondes de marge sur le temps théorique pour que tu puisses suivre. Échap → Prendre la main.`;
      const hint = h("small", { class: "panel-hint" }, autoHint(s.trainingAutopilot));
      const seg = h("div", { class: "seg seg-small" });
      modes.forEach(([m, label], i) => {
        const pick = () => {
          this.settings.update({ trainingAutopilot: m });
          [...seg.children].forEach((b, j) => b.classList.toggle("on", j === i));
          hint.textContent = autoHint(m);
        };
        seg.append(h("button", { class: m === s.trainingAutopilot ? "on" : "", onclick: pick }, label));
      });
      autoRow = h("div", { class: "panel-row panel-col" }, h("span", { class: "panel-label" }, "Pilote auto"), seg, hint);
    } else {
      autoRow = h("div", { class: "panel-row locked" }, h("span", { class: "lock-icon" }, "🔒"), `Pilote auto — se débloque au niveau ${auto.level} (tu es niveau ${this.progression.level})`);
    }
    this.panelHost.append(
      h(
        "div",
        { class: "side-panel" },
        h("h2", { class: "panel-title" }, "Entraînement"),
        h(
          "p",
          { class: "panel-text" },
          "Pas de monstre, pas de limite de temps. Rien n'est compté : ni records, ni historique, ni XP. Pour apprendre la carte et bosser une route.",
        ),
        h("div", { class: "panel-row" }, h("span", { class: "panel-label" }, "Seed"), input),
        h(
          "div",
          { class: "panel-row" },
          h("span", { class: "panel-label" }, "Difficulté"),
          h("span", null, `${DIFFICULTY_INFO[s.difficulty].name}`, h("small", { class: "panel-hint" }, " — pièges en Difficile et Cauchemar")),
        ),
        autoRow,
        h("div", { class: "btn-row" }, h("button", { class: "btn primary", onclick: start }, "Lancer l'entraînement")),
      ),
    );
  }
}
