import { formatDelta, formatHundredths, formatTenths } from "../run/RunTimer";
import type { Recap } from "../run/DeathRecap";
import type { XpGain } from "../run/Progression";
import { xpBar } from "./XpBar";
import { GRADE_COLORS, nextGradeThreshold } from "../run/Grades";
import { isRanked, type RunResult } from "../run/RunManager";
import { modifierNames } from "../run/Modifiers";
import type { GhostData, GhostKind } from "../run/Ghosts";
import { DIFFICULTY_INFO } from "./MainMenu";
import { clear, h, Screen } from "./dom";

export interface ResultsActions {
  restart(): void;
  /** même seed, même en mode Random */
  replay(): void;
  menu(): void;
}

/** Compléments de l'écran de fin : récap de capture et carte de la run. */
export interface ResultsExtra {
  recap: Recap | null;
  map: HTMLElement | null;
  /** XP gagnée (null en entraînement) */
  xp: XpGain | null;
  training: boolean;
  /** run jouée par le pilote auto : sortie et temps théorique (s) */
  autopilot?: { exit: string; theoretical: number } | null;
  /** fantôme couru pendant la run, fantôme enregistré à l'arrivée */
  ghost?: { raced: GhostData | null; saved: GhostKind | null };
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

  /** Gain d'XP : total, détail, barre animée, passage de niveau et récompenses. */
  private xpBlock(g: XpGain): HTMLElement {
    const mult = g.mult !== 1 ? ` × ${String(g.mult).replace(".", ",")}` : "";
    const mods = g.modsMult !== 1 ? ` × ${String(g.modsMult).replace(".", ",")} (modificateurs)` : "";
    const short = g.shortFactor < 1 ? ` × ${g.shortFactor.toFixed(2).replace(".", ",")} (run courte)` : "";
    const detail = `${g.reason} : ${g.base}${mult}${mods}${short}`;
    const b = g.before;
    const bar = xpBar(b.level, b.into, b.need, b.max);
    const box = h("div", { class: "res-xp" }, h("div", { class: "res-xp-gain" }, `+${g.xp} XP`), h("div", { class: "res-xp-detail" }, detail), bar);
    // animation : remplissage jusqu'au nouveau total (niveaux intermédiaires compris)
    const a = g.after;
    window.setTimeout(() => {
      const fill = bar.querySelector<HTMLDivElement>(".xp-fill");
      if (!fill) return;
      if (a.level > b.level) fill.style.width = "100%";
      else fill.style.width = `${a.max ? 100 : Math.min(100, (a.into / a.need) * 100)}%`;
      window.setTimeout(() => {
        const fresh = xpBar(a.level, a.into, a.need, a.max);
        bar.replaceWith(fresh);
        if (a.level > b.level) {
          box.classList.add("level-up");
          box.append(h("div", { class: "res-levelup" }, `Niveau ${a.level} !`));
          for (const u of g.unlocked) box.append(h("div", { class: "res-unlock" }, `Débloqué : ${u.name}${u.ready ? (u.where ? ` → ${u.where}` : "") : " (arrive bientôt)"}`));
        }
      }, a.level > b.level ? 700 : 900);
    }, 1300);
    return box;
  }

  show(r: RunResult, extra: ResultsExtra = { recap: null, map: null, xp: null, training: false }): void {
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
    const modified = !r.setup.training && !isRanked(r.setup);
    if (modified) {
      left.append(h("div", { class: "res-modified" }, `Run modifiée — pas de record · ${modifierNames(r.setup.modifiers)}`));
    }
    if (r.success && !modified) {
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
    } else if (r.success) {
      /* run modifiée réussie : pas de comparaison aux records */
    } else if (r.failReason === "captured") {
      left.append(h("div", { class: "res-next" }, "Le Chirurgien t'a attrapé."));
    } else {
      const minutes = r.setup.modifiers.includes("short") ? "Cinq minutes" : "Dix minutes";
      left.append(h("div", { class: "res-next" }, `${minutes}. Ton pote est parti sans toi.`));
    }
    const gh = extra.ghost;
    if (gh?.raced && r.success) {
      const d = r.timeMs - gh.raced.ms;
      const who = gh.raced.kind === "auto" ? "le fantôme du pilote" : "ton fantôme";
      left.append(
        h(
          "div",
          { class: `res-ghost ${d < 0 ? "ahead" : "behind"}` },
          d < 0 ? `Tu as battu ${who} de ${formatDelta(-d, true).slice(1)} s !` : `${who[0]!.toUpperCase()}${who.slice(1)} : ${formatHundredths(gh.raced.ms)} (${formatDelta(d, true)})`,
        ),
      );
    }
    if (gh?.saved === "pb") left.append(h("div", { class: "res-ghost" }, "Fantôme enregistré : ton meilleur temps sur cette seed. Rejoue-la pour faire la course contre lui."));
    else if (gh?.saved === "auto") left.append(h("div", { class: "res-ghost" }, "Fantôme du pilote enregistré : en entraînement sur cette seed, fais la course contre lui."));
    if (extra.training) left.append(h("div", { class: "res-training" }, "Entraînement — rien n'est compté"));
    if (extra.autopilot && r.success) {
      const ap = extra.autopilot;
      const gap = r.timeMs / 1000 - ap.theoretical;
      left.append(
        h(
          "div",
          { class: "res-autopilot" },
          h("div", { class: "res-ap-title" }, `Pilote auto · ${ap.exit}`),
          h("div", null, `Théorique ${formatHundredths(ap.theoretical * 1000)} · réalisé ${formatHundredths(r.timeMs)} (${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)} s de marge pour suivre la route)`),
        ),
      );
    }
    if (extra.xp) left.append(this.xpBlock(extra.xp));

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
    if (r.setup.modifiers.length) infoRow("Modificateurs", modifierNames(r.setup.modifiers));
    infoRow("Sortie", r.success ? r.exitLabel : "—");

    const splits = h("div", { class: "res-splits" }, h("div", { class: "res-splits-title" }, "Splits"));
    if (r.splits.length === 0) splits.append(h("div", { class: "res-split empty" }, "Aucun objectif atteint."));
    for (const s of r.splits) {
      const d = s.deltaMs === null ? h("span", { class: "sd none" }, "") : h("span", { class: `sd ${s.deltaMs <= 0 ? "ahead" : "behind"}` }, formatDelta(s.deltaMs, true));
      splits.append(h("div", { class: "res-split" }, h("span", { class: "sn" }, s.label), h("span", { class: "st" }, formatHundredths(s.ms)), d));
    }

    // récap de capture / temps écoulé
    const summary = h("div", { class: "res-summary" });
    if (extra.recap && extra.recap.lines.length + (extra.recap.tip ? 1 : 0) > 0) {
      const rc = extra.recap;
      const box = h("div", { class: "res-recap" }, h("div", { class: "res-splits-title" }, rc.title));
      for (const l of rc.lines) {
        box.append(
          h(
            "div",
            { class: `recap-line k-${l.kind}` },
            h("span", { class: "rt" }, formatTenths(l.t * 1000)),
            h("span", { class: "rx" }, l.text, l.place ? h("span", { class: "rp" }, ` — ${l.place}`) : ""),
          ),
        );
      }
      if (rc.tip) box.append(h("div", { class: "recap-tip" }, rc.tip));
      summary.append(box);
    }
    summary.append(info, splits);

    // onglets Résumé / Carte
    const right = h("div", { class: "res-right" });
    if (extra.map) {
      const mapPane = h("div", { class: "res-map" }, extra.map);
      const tabs = h("div", { class: "res-tabs" });
      const show = (which: "summary" | "map") => {
        summary.style.display = which === "summary" ? "" : "none";
        mapPane.style.display = which === "map" ? "" : "none";
        for (const b of tabs.children) b.classList.toggle("active", (b as HTMLElement).dataset.tab === which);
      };
      for (const [id, label] of [
        ["summary", "Résumé"],
        ["map", "Carte"],
      ] as const) {
        const b = h("button", { class: "res-tab", "data-tab": id }, label);
        b.addEventListener("click", () => show(id));
        tabs.append(b);
      }
      right.append(tabs, summary, mapPane);
      show("summary");
    } else right.append(summary);
    const buttons = h(
      "div",
      { class: "btn-row res-buttons" },
      h("button", { class: "btn primary", onclick: () => this.actions.restart() }, "Recommencer  [R]"),
      h("button", { class: "btn", onclick: () => this.actions.replay() }, "Rejouer cette seed"),
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
