import type { Difficulty } from "../config";
import type { SeedMode } from "../core/Settings";
import { GRADE_COLORS } from "../run/Grades";
import type { Records } from "../run/Records";
import { formatHundredths } from "../run/RunTimer";
import { DIFFICULTY_INFO } from "./MainMenu";
import { clear, h, Screen } from "./dom";

/** Tableau des records : PB, meilleure note et splits du PB par difficulté × mode de seed. */
export class RecordsMenu extends Screen {
  private body: HTMLDivElement;
  private confirmReset = false;
  onClose: () => void = () => {};

  constructor(private readonly records: Records) {
    super("options-screen");
    this.body = h("div", { class: "options-body" });
    this.root.append(
      h(
        "div",
        { class: "options-box" },
        h("div", { class: "options-head" }, h("h2", { class: "panel-title" }, "Records"), h("button", { class: "btn", onclick: () => this.onClose() }, "Retour")),
        h("div", { class: "tabs", style: "padding-top:0" }),
        this.body,
      ),
    );
  }

  protected override onShow(): void {
    this.confirmReset = false;
    this.render();
  }

  private render(): void {
    clear(this.body);
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
          this.confirmReset = false;
          this.render();
        },
      },
      this.confirmReset ? "Confirmer l'effacement ?" : "Effacer les records",
    );
    this.body.append(table, h("div", { class: "btn-row" }, reset));
  }
}
