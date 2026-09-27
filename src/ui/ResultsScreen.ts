import { formatDelta, formatHundredths } from "../run/RunTimer";
import { GRADE_COLORS, nextGradeThreshold } from "../run/Grades";
import type { RunResult } from "../run/RunManager";
import { DIFFICULTY_INFO } from "./MainMenu";
import { clear, h, Screen } from "./dom";

export interface ResultsActions {
  restart(): void;
  menu(): void;
}

/** Écran de fin : temps, note (grosse animation), splits vs PB, seed, difficulté, sortie. */
export class ResultsScreen extends Screen {
  private box: HTMLDivElement;
  private raf = 0;

  constructor(private readonly actions: ResultsActions) {
    super("results-screen");
    this.box = h("div", { class: "results-box" });
    this.root.append(h("div", { class: "results-bg" }), this.box, h("div", { class: "scanlines" }), h("div", { class: "noise-overlay" }));
  }

  protected override onHide(): void {
    cancelAnimationFrame(this.raf);
  }

  show(r: RunResult): void {
    clear(this.box);
    cancelAnimationFrame(this.raf);
    const status = r.success ? "Évadé" : r.failReason === "captured" ? "Capturé" : "Temps écoulé";
    this.root.classList.toggle("failed", !r.success);

    // --- colonne gauche : statut, note, temps
    const timeEl = h("div", { class: "res-time" }, "0:00.00");
    const left = h("div", { class: "res-left" }, h("div", { class: `res-status ${r.success ? "ok" : "ko"}` }, status));
    if (r.success && r.grade) {
      const g = h("div", { class: "res-grade", style: `--grade-color:${GRADE_COLORS[r.grade]}` }, r.grade);
      const ring = h("div", { class: "res-grade-ring", style: `--grade-color:${GRADE_COLORS[r.grade]}` });
      left.append(h("div", { class: "res-grade-wrap" }, ring, g));
      window.setTimeout(() => this.root.classList.add("shake"), 1150);
      window.setTimeout(() => this.root.classList.remove("shake"), 1600);
    } else {
      left.append(h("div", { class: "res-grade-wrap" }, h("div", { class: "res-grade fail" }, "✕")));
    }
    left.append(timeEl);
    if (r.success) {
      if (r.newPB) {
        left.append(h("div", { class: "res-pb new" }, "Nouveau record !"));
        if (r.previous.pbMs !== null) {
          const d = r.timeMs - r.previous.pbMs;
          left.append(h("div", { class: "res-pb-cmp ahead" }, `Ancien PB ${formatHundredths(r.previous.pbMs)} (${formatDelta(d, true)})`));
        }
      } else if (r.previous.pbMs !== null) {
        const d = r.timeMs - r.previous.pbMs;
        left.append(h("div", { class: `res-pb-cmp ${d <= 0 ? "ahead" : "behind"}` }, `PB ${formatHundredths(r.previous.pbMs)} (${formatDelta(d, true)})`));
      }
      if (r.grade) {
        const next = nextGradeThreshold(r.grade);
        if (next) {
          left.append(h("div", { class: "res-next" }, `Note ${next.grade} sous ${formatHundredths(next.maxMs)} · il manque ${formatDelta(r.timeMs - next.maxMs, true).slice(1)} s`));
        }
      }
    } else if (r.failReason === "captured") {
      left.append(h("div", { class: "res-next" }, "Le Chirurgien t'a attrapé."));
    } else {
      left.append(h("div", { class: "res-next" }, "Dix minutes. Ton pote est parti sans toi."));
    }

    // --- colonne droite : infos + splits
    const info = h("div", { class: "res-info" });
    const infoRow = (k: string, v: HTMLElement | string) => info.append(h("div", { class: "res-k" }, k), h("div", { class: "res-v" }, v));
    const seedBtn = h("button", { class: "seed-copy", title: "Copier la seed" }, r.setup.seed);
    seedBtn.addEventListener("click", () => {
      void navigator.clipboard?.writeText(r.setup.seed).then(() => {
        seedBtn.textContent = "Copiée ✓";
        window.setTimeout(() => (seedBtn.textContent = r.setup.seed), 1200);
      });
    });
    infoRow("Seed", seedBtn);
    infoRow("Mode", r.setup.seedMode === "random" ? "Random Seed" : "Set Seed");
    infoRow("Difficulté", DIFFICULTY_INFO[r.setup.difficulty].name);
    infoRow("Sortie", r.success ? r.exitLabel : "—");

    const splits = h("div", { class: "res-splits" }, h("div", { class: "res-splits-title" }, "Splits"));
    if (r.splits.length === 0) splits.append(h("div", { class: "res-split empty" }, "Aucun objectif atteint."));
    for (const s of r.splits) {
      const d = s.deltaMs === null ? h("span", { class: "sd none" }, "") : h("span", { class: `sd ${s.deltaMs <= 0 ? "ahead" : "behind"}` }, formatDelta(s.deltaMs, true));
      splits.append(h("div", { class: "res-split" }, h("span", { class: "sn" }, s.label), h("span", { class: "st" }, formatHundredths(s.ms)), d));
    }

    const right = h("div", { class: "res-right" }, info, splits);
    const buttons = h(
      "div",
      { class: "btn-row res-buttons" },
      h("button", { class: "btn primary", onclick: () => this.actions.restart() }, "Recommencer  [R]"),
      h("button", { class: "btn", onclick: () => this.actions.menu() }, "Menu principal"),
    );
    this.box.append(h("div", { class: "res-cols" }, left, right), buttons);

    // compteur du temps final (0 → temps en ~0,8 s)
    const t0 = performance.now();
    const dur = 800;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      timeEl.textContent = formatHundredths(r.timeMs * e);
      if (k < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
