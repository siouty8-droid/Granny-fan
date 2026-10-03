import { CONFIG, type Difficulty, type Grade } from "../config";
import { levelCost, UNLOCKS, type Progression } from "../run/Progression";
import { ACHIEVEMENTS, type Achievements } from "../run/Achievements";
import type { Dossiers } from "../run/Dossiers";
import { DOSSIERS } from "../gameplay/data/spawns";
import { DIFFICULTY_INFO } from "./MainMenu";
import { clear, h, Screen } from "./dom";
import { xpBar } from "./XpBar";

type ProgressionTab = "level" | "achievements" | "dossiers";

/** Écran « Progression » : niveau, XP, récompenses, règles de gain, code ; onglet des succès. */
export class ProgressionScreen extends Screen {
  private body: HTMLDivElement;
  private tabs: HTMLDivElement;
  private tab: ProgressionTab = "level";
  /** message affiché sous le champ de code après un rendu */
  private notice = "";
  onClose: () => void = () => {};
  onCustomize: () => void = () => {};

  constructor(
    private readonly progression: Progression,
    private readonly achievements: Achievements,
    private readonly dossiers: Dossiers,
  ) {
    super("options-screen");
    this.body = h("div", { class: "options-body" });
    this.tabs = h("div", { class: "tabs" });
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
        this.tabs,
        this.body,
      ),
    );
  }

  protected override onShow(): void {
    this.notice = "";
    this.render();
  }

  private render(): void {
    clear(this.tabs);
    const mk = (id: ProgressionTab, label: string) =>
      h(
        "button",
        {
          class: `tab ${this.tab === id ? "active" : ""}`,
          onclick: () => {
            this.tab = id;
            this.render();
          },
        },
        label,
      );
    this.tabs.append(
      mk("level", "Niveau"),
      mk("achievements", `Succès ${this.achievements.count}/${ACHIEVEMENTS.length}`),
      mk("dossiers", `Dossiers ${this.dossiers.count}/${DOSSIERS.length}`),
    );
    clear(this.body);
    if (this.tab === "achievements") this.renderAchievements();
    else if (this.tab === "dossiers") this.renderDossiers();
    else this.renderLevel();
  }

  /** Dossiers cachés : ceux trouvés se relisent, les autres restent scellés. */
  private renderDossiers(): void {
    this.body.append(
      h(
        "p",
        { class: "panel-text" },
        `${this.dossiers.count} sur ${DOSSIERS.length}. Un dossier traîne dans l'hôpital à chaque run (normale ou modifiée, pas en entraînement) : l'endroit s'affiche au départ. Lis-le pour le garder.`,
      ),
    );
    const list = h("div", { class: "dos-list" });
    DOSSIERS.forEach((d, i) => {
      if (this.dossiers.has(d.id)) {
        list.append(
          h(
            "details",
            { class: "dos got" },
            h("summary", null, h("span", { class: "dos-n" }, String(i + 1).padStart(2, "0")), d.title, h("span", { class: "dos-author" }, d.author)),
            h("div", { class: "dos-text" }, d.text),
          ),
        );
      } else {
        list.append(h("div", { class: "dos locked" }, h("span", { class: "dos-n" }, String(i + 1).padStart(2, "0")), "Dossier scellé — pas encore trouvé"));
      }
    });
    this.body.append(list);
  }

  /** Succès : débloqués (date), en cours (avancement), secrets masqués. */
  private renderAchievements(): void {
    const got = this.achievements.count;
    this.body.append(
      h(
        "p",
        { class: "panel-text" },
        `${got} sur ${ACHIEVEMENTS.length}. Ils se gagnent en run normale ou modifiée (jamais en entraînement) et rapportent de l'XP une fois. Le code ne les donne pas.`,
      ),
    );
    const grid = h("div", { class: "ach-grid" });
    for (const a of ACHIEVEMENTS) {
      const at = this.achievements.unlockedAt(a.id);
      const hidden = a.secret && !at;
      const prog = at ? null : this.achievements.progress(a.id);
      const when = at ? new Date(at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
      grid.append(
        h(
          "div",
          { class: `ach ${at ? "got" : "locked"}` },
          h("div", { class: "ach-icon" }, at ? "✓" : hidden ? "?" : "·"),
          h(
            "div",
            { class: "ach-text" },
            h("div", { class: "ach-name" }, hidden ? "Succès secret" : a.name),
            h("div", { class: "ach-desc" }, hidden ? "Trouve-le en jouant." : a.desc),
          ),
          h("div", { class: "ach-side" }, h("div", { class: "ach-xp" }, `${a.xp} XP`), h("div", { class: "ach-when" }, at ? when : (prog ?? ""))),
        ),
      );
    }
    this.body.append(grid);
  }

  private renderLevel(): void {
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
