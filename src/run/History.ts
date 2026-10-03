import type { Difficulty, Grade } from "../config";
import { CONFIG } from "../config";
import type { SeedMode } from "../core/Settings";
import { loadJSON, saveJSON } from "../core/Storage";
import type { CauseKey } from "./DeathRecap";
import type { ModifierId } from "./Modifiers";

export type HistoryOutcome = "escaped" | "captured" | "timeout" | "abandoned";

/** Une run terminée (ou abandonnée). */
export interface HistoryEntry {
  date: number;
  seed: string;
  seedMode: SeedMode;
  difficulty: Difficulty;
  outcome: HistoryOutcome;
  ms: number;
  exitId: string;
  exitLabel: string;
  grade: Grade | null;
  cause: CauseKey | null;
  splits: number;
  /** modificateurs (absent : run classée) */
  mods?: ModifierId[];
}

export interface HistoryStats {
  runs: number;
  escaped: number;
  captured: number;
  timeout: number;
  abandoned: number;
  /** meilleur temps par sortie (toutes difficultés, runs classées) */
  bestByExit: Array<{ exitId: string; exitLabel: string; ms: number; difficulty: Difficulty; seed: string }>;
  /** temps moyen des évasions (runs classées) */
  avgEscapeMs: number | null;
  /** causes de capture, de la plus fréquente à la moins fréquente */
  causes: Array<{ cause: CauseKey; count: number }>;
}

const VERSION = 1;

/** Historique local des dernières runs + statistiques calculées. */
export class History {
  private list: HistoryEntry[];

  constructor() {
    const raw = loadJSON<{ version: number; list: HistoryEntry[] } | null>("history", null);
    this.list = raw && raw.version === VERSION && Array.isArray(raw.list) ? raw.list : [];
  }

  /** Plus récente en premier. */
  get entries(): readonly HistoryEntry[] {
    return this.list;
  }

  add(e: HistoryEntry): void {
    this.list.unshift(e);
    if (this.list.length > CONFIG.history.maxEntries) this.list.length = CONFIG.history.maxEntries;
    saveJSON("history", { version: VERSION, list: this.list });
  }

  clear(): void {
    this.list = [];
    saveJSON("history", { version: VERSION, list: this.list });
  }

  stats(): HistoryStats {
    const s: HistoryStats = { runs: this.list.length, escaped: 0, captured: 0, timeout: 0, abandoned: 0, bestByExit: [], avgEscapeMs: null, causes: [] };
    const best = new Map<string, HistoryStats["bestByExit"][number]>();
    const causes = new Map<CauseKey, number>();
    let sum = 0;
    let escapedRanked = 0;
    for (const e of this.list) {
      s[e.outcome]++;
      if (e.outcome === "escaped" && !e.mods?.length) {
        escapedRanked++;
        sum += e.ms;
        const b = best.get(e.exitId);
        if (!b || e.ms < b.ms) best.set(e.exitId, { exitId: e.exitId, exitLabel: e.exitLabel, ms: e.ms, difficulty: e.difficulty, seed: e.seed });
      }
      if (e.outcome === "captured" && e.cause) causes.set(e.cause, (causes.get(e.cause) ?? 0) + 1);
    }
    s.avgEscapeMs = escapedRanked ? sum / escapedRanked : null;
    s.bestByExit = [...best.values()].sort((a, b) => a.ms - b.ms);
    s.causes = [...causes].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count);
    return s;
  }
}
