import type { Difficulty } from "../config";
import type { SeedMode } from "../core/Settings";
import { GRADE_COLORS } from "../run/Grades";
import type { Records } from "../run/Records";
import { formatHundredths } from "../run/RunTimer";
import { CAUSE_LABELS } from "../run/DeathRecap";
import type { History, HistoryEntry } from "../run/History";
import { modifierNames, type ModifierId } from "../run/Modifiers";
import { DIFFICULTY_INFO } from "./MainMenu";
import { clear, h, Screen } from "./dom";

type RecordsTab = "records" | "history" | "stats";

/**
 * Records (PB, meilleure note, splits du PB par difficulté × mode de seed), historique des
 * dernières runs (avec « Rejouer ») et statistiques personnelles.
 */
export class RecordsMenu extends Screen {
  private body: HTMLDivElement;
  private tabs: HTMLDivElement;
  private tab: RecordsTab = "records";
  private confirmReset = false;
  onClose: () => void = () => {};
  /** rejoue une seed de l'historique (mêmes difficulté et modificateurs) */
  onReplay: (seed: string, difficulty: Difficulty, mods: ModifierId[]) => void = () => {};

  constructor(
    private readonly records: Records,
    private readonly history: History,
  ) {
    super("options-screen");
    this.body = h("div", { class: "options-body" });
    this.tabs = h("div", { class: "tabs" });
    this.root.append(
      h(
        "div",
        { class: "options-box" },
        h("div", { class: "options-head" }, h("h2", { class: "panel-title" }, "Records"), h("button", { class: "btn", onclick: () => this.onClose() }, "Retour")),
        this.tabs,
        this.body,
      ),
    );
  }

  protected override onShow(): void {
    this.confirmReset = false;
    this.render();
  }

  private render(): void {
    clear(this.tabs);
    const mk = (id: RecordsTab, label: string) =>
      h(
        "button",
        {
          class: `tab ${this.tab === id ? "active" : ""}`,
          onclick: () => {
            this.tab = id;
            this.confirmReset = false;
            this.render();
          },
        },
        label,
      );
    this.tabs.append(mk("records", "Records"), mk("history", "Historique"), mk("stats", "Stats"));
    clear(this.body);
    if (this.tab === "history") this.renderHistory();
    else if (this.tab === "stats") this.renderStats();
    else this.renderRecords();
  }

  private outcomeText(e: HistoryEntry): string {
    switch (e.outcome) {
      case "escaped":
        return `Évadé · ${e.exitLabel}`;
      case "captured":
        return `Capturé · ${e.cause ? CAUSE_LABELS[e.cause] : ""}`;
      case "timeout":
        return "Temps écoulé";
      case "abandoned":
        return "Abandonnée";
    }
  }

  private renderHistory(): void {
    const list = this.history.entries;
    if (list.length === 0) {
      this.body.append(h("p", { class: "hist-empty" }, "Aucune run terminée pour l'instant."));
      return;
    }
    const table = h("table", { class: "records-table hist-table" });
    table.append(h("tr", null, h("th", null, "Quand"), h("th", null, "Seed"), h("th", null, "Diff."), h("th", null, "Temps"), h("th", null, "Résultat"), h("th", null, "")));
    for (const e of list) {
      const d = new Date(e.date);
      const when = `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
      const replay = h("button", { class: "btn small", onclick: () => this.onReplay(e.seed, e.difficulty, e.mods ?? []) }, "Rejouer");
      const mods = e.mods?.length ? h("span", { class: "hmod", title: modifierNames(e.mods) }, " MOD") : "";
      table.append(
        h(
          "tr",
          { class: `h-${e.outcome}` },
          h("td", { class: "rs" }, when),
          h("td", { class: "hseed" }, e.seed),
          h("td", null, DIFFICULTY_INFO[e.difficulty].name, mods),
          h("td", { class: "rt small" }, formatHundredths(e.ms), e.grade ? h("span", { class: "hgrade", style: `color:${GRADE_COLORS[e.grade]}` }, ` ${e.grade}`) : ""),
          h("td", { class: "hres" }, this.outcomeText(e)),
          h("td", null, replay),
        ),
      );
    }
    this.body.append(table);
  }

  private renderStats(): void {
    const st = this.history.stats();
    if (st.runs === 0) {
      this.body.append(h("p", { class: "hist-empty" }, "Joue quelques runs pour voir tes statistiques."));
      return;
    }
    const pct = (n: number) => `${Math.round((n / st.runs) * 100)} %`;
    const tile = (label: string, value: string, sub = "") => h("div", { class: "stat-tile" }, h("div", { class: "stat-v" }, value), h("div", { class: "stat-l" }, label), sub ? h("div", { class: "stat-s" }, sub) : "");
    this.body.append(
      h(
        "div",
        { class: "stat-grid" },
        tile("Runs", String(st.runs)),
        tile("Évasions", String(st.escaped), pct(st.escaped)),
        tile("Captures", String(st.captured), pct(st.captured)),
        tile("Temps écoulé", String(st.timeout), pct(st.timeout)),
        tile("Abandons", String(st.abandoned), pct(st.abandoned)),
        tile("Évasion moyenne", st.avgEscapeMs !== null ? formatHundredths(st.avgEscapeMs) : "—"),
      ),
    );
    const best = h("div", { class: "stat-sec" }, h("div", { class: "res-splits-title" }, "Meilleur temps par sortie"));
    if (st.bestByExit.length === 0) best.append(h("div", { class: "hist-empty" }, "Aucune évasion pour l'instant."));
    for (const b of st.bestByExit) {
      best.append(h("div", { class: "stat-row" }, h("span", null, b.exitLabel), h("span", { class: "rs" }, `${DIFFICULTY_INFO[b.difficulty].name} · seed ${b.seed}`), h("span", { class: "rt small" }, formatHundredths(b.ms))));
    }
    const causes = h("div", { class: "stat-sec" }, h("div", { class: "res-splits-title" }, "Comment il t'attrape"));
    if (st.causes.length === 0) causes.append(h("div", { class: "hist-empty" }, "Il ne t'a jamais eu. Pour l'instant."));
    const max = st.causes[0]?.count ?? 1;
    for (const c of st.causes) {
      causes.append(
        h(
          "div",
          { class: "stat-bar" },
          h("span", { class: "sb-l" }, CAUSE_LABELS[c.cause]),
          h("span", { class: "sb-track" }, h("span", { class: "sb-fill", style: `width:${(c.count / max) * 100}%` })),
          h("span", { class: "sb-n" }, String(c.count)),
        ),
      );
    }
    this.body.append(h("div", { class: "stat-cols" }, best, causes));
  }

  private renderRecords(): void {
    const table = h("table", { class: "records-table" });
    table.append(h("tr", null, h("th", null, "Difficulté"), h("th", null, "Mode"), h("th", null, "PB"), h("th", null, "Note"), h("th", null, "Détails")));
    for (const d of ["easy", "normal", "hard", "nightmare"] as Difficulty[]) {
      for (const m of ["random", "set"] as SeedMode[]) {
        const e = this.records.get(d, m);
        const details = h("div", { class: "rs" });
        details.append(`${e.completions} évasion(s) / ${e.attempts} tentative(s)`);
        if (e.pbMs !== null) {
          details.append(h("br"), `Seed ${e.pbSeed} · ${e.pbExit}`);
          for (const s of e.pbSplits) details.append(h("br"), `${formatHundredths(s.ms)}  ${s.label}`);
        }
        table.append(
          h(
            "tr",
            null,
            h("td", null, DIFFICULTY_INFO[d].name),
            h("td", null, m === "random" ? "Random" : "Set Seed"),
            h("td", { class: "rt" }, e.pbMs !== null ? formatHundredths(e.pbMs) : "—"),
            h("td", { class: "rg", style: e.bestGrade ? `color:${GRADE_COLORS[e.bestGrade]}` : "" }, e.bestGrade ?? "—"),
            h("td", null, details),
          ),
        );
      }
    }
    const reset = h(
      "button",
      {
        class: "btn",
        onclick: () => {
          if (!this.confirmReset) {
            this.confirmReset = true;
            this.render();
            return;
          }
          this.records.clearAll();
          this.history.clear();
          this.confirmReset = false;
          this.render();
        },
      },
      this.confirmReset ? "Confirmer l'effacement ?" : "Effacer records et historique",
    );
    this.body.append(table, h("div", { class: "btn-row" }, reset));
  }
}
