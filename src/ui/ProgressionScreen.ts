import { CONFIG, type Difficulty, type Grade } from "../config";
import { levelCost, UNLOCKS, type Progression } from "../run/Progression";
import { DIFFICULTY_INFO } from "./MainMenu";
import { clear, h, Screen } from "./dom";
import { xpBar } from "./XpBar";

/** Écran « Progression » : niveau, XP, récompenses par niveau, règles de gain, saisie de code. */
export class ProgressionScreen extends Screen {
  private body: HTMLDivElement;
  /** message affiché sous le champ de code après un rendu */
  private notice = "";
  onClose: () => void = () => {};
  onCustomize: () => void = () => {};

  constructor(private readonly progression: Progression) {
    super("options-screen");
    this.body = h("div", { class: "options-body" });
    this.root.append(
      h(
        "div",
        { class: "options-box" },
        h(
          "div",
          { class: "options-head" },
          h("h2", { class: "panel-title" }, "Progression"),
          h("button", { class: "btn", onclick: () => this.onCustomize() }, "Personnaliser"),
          h("button", { class: "btn", onclick: () => this.onClose() }, "Retour"),
        ),
        this.body,
      ),
    );
  }

  protected override onShow(): void {
    this.notice = "";
    this.render();
  }

  private render(): void {
    clear(this.body);
    const info = this.progression.info;
    this.body.append(h("div", { class: "prog-head" }, xpBar(info.level, info.into, info.need, info.max, "big")));

    const list = h("div", { class: "prog-unlocks" }, h("div", { class: "res-splits-title" }, "Récompenses"));
    for (const u of UNLOCKS) {
      const got = this.progression.isUnlocked(u.id);
      const status = got ? (u.ready ? "Débloqué" : "Débloqué · arrive bientôt") : `Niveau ${u.level}`;
      list.append(
        h(
          "div",
          { class: `prog-unlock ${got ? "got" : "locked"}` },
          h("span", { class: "pu-lvl" }, String(u.level)),
          h(
            "div",
            { class: "pu-text" },
            h("div", { class: "pu-name" }, u.name),
            h("div", { class: "pu-desc" }, u.desc),
            got && u.ready && u.where ? h("div", { class: "pu-where" }, `→ ${u.where}`) : null,
          ),
          h("span", { class: "pu-status" }, status),
        ),
      );
    }

    const p = CONFIG.progression;
    const win = (g: Grade) => p.winXp[g];
    const mults = (Object.keys(p.difficultyMult) as Difficulty[]).map((d) => `${DIFFICULTY_INFO[d].name} ×${String(p.difficultyMult[d]).replace(".", ",")}`).join(" · ");
    let toMax = 0;
    for (let n = info.level; n < p.maxLevel; n++) toMax += levelCost(n);
    toMax -= info.into;
    const rules = h(
      "div",
      { class: "prog-rules" },
      h("div", { class: "res-splits-title" }, "Gagner de l'XP"),
      h("div", null, `Évasion : ${win("F")} à ${win("Z")} XP selon la note (note moyenne ≈ 50 XP).`),
      h("div", null, `Mort ou temps écoulé : ${p.deathXp} XP (moins si la run a duré moins de ${p.deathFullAfter} s).`),
      h("div", null, `Bonus de difficulté : ${mults}.`),
      h("div", null, "Entraînement et runs abandonnées : 0 XP."),
      h("div", null, `Chaque niveau demande ${p.levelStep} XP de plus que le précédent (${levelCost(1)} XP pour le niveau 2). Niveau max : ${p.maxLevel}${info.max ? "." : ` — encore ${toMax} XP.`}`),
    );
    this.body.append(h("div", { class: "stat-cols" }, list, h("div", null, rules, this.codeBox())));
  }

  /** Saisie de code : « tout débloquer » (niveau max, récompenses présentes et futures). */
  private codeBox(): HTMLElement {
    const msg = h("div", { class: "prog-code-msg" }, this.notice);
    const input = h("input", { class: "text-input", type: "text", maxlength: 32, placeholder: "Entre un code", spellcheck: "false", autocomplete: "off" }) as HTMLInputElement;
    const submit = () => {
      const r = this.progression.redeem(input.value);
      if (r === "unknown") {
        msg.textContent = "Code inconnu.";
        msg.className = "prog-code-msg bad";
        input.classList.remove("shake");
        void input.offsetWidth; // relance l'animation
        input.classList.add("shake");
        return;
      }
      this.notice = r === "already" ? "Ce code est déjà actif." : "Code accepté : niveau max, tout est débloqué.";
      this.render();
    };
    input.addEventListener("keydown", (e) => {
      // Échap ferme toujours l'écran ; les autres touches restent dans le champ
      if (e.key !== "Escape") e.stopPropagation();
      if (e.key === "Enter") submit();
    });
    const active = this.progression.unlockAll
      ? h(
          "div",
          { class: "prog-code-on" },
          h("span", null, "✓ Code actif : niveau max, tout est débloqué — même ce qui sortira plus tard. Ta vraie XP continue de compter à côté."),
          h(
            "button",
            {
              class: "btn small",
              onclick: () => {
                this.progression.setUnlockAll(false);
                this.notice = "Code désactivé : retour à ta vraie progression.";
                this.render();
              },
            },
            "Désactiver",
          ),
        )
      : null;
    return h(
      "div",
      { class: "prog-code" },
      h("div", { class: "res-splits-title" }, "Code"),
      active,
      h("div", { class: "prog-code-row" }, input, h("button", { class: "btn", onclick: submit }, "Valider")),
      msg,
    );
  }
}
