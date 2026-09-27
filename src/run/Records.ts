import type { Difficulty, Grade } from "../config";
import type { SeedMode } from "../core/Settings";
import { loadJSON, saveJSON } from "../core/Storage";
import { gradeBetter } from "./Grades";

export interface SplitTime {
  /** identifiant stable de l'objectif (comparaison au PB) */
  id: string;
  label: string;
  ms: number;
}

export interface RecordEntry {
  pbMs: number | null;
  bestGrade: Grade | null;
  pbSplits: SplitTime[];
  pbSeed: string;
  pbExit: string;
  pbDate: number;
  attempts: number;
  completions: number;
}

type RecordTable = Record<string, RecordEntry>;

const VERSION = 1;

function emptyEntry(): RecordEntry {
  return { pbMs: null, bestGrade: null, pbSplits: [], pbSeed: "", pbExit: "", pbDate: 0, attempts: 0, completions: 0 };
}

export function recordKey(difficulty: Difficulty, mode: SeedMode): string {
  return `${difficulty}:${mode}`;
}

/** Records locaux (PB, meilleure note, splits du PB) par difficulté × mode de seed. */
export class Records {
  private table: RecordTable;

  constructor() {
    const raw = loadJSON<{ version: number; table: RecordTable } | null>("records", null);
    this.table = raw && raw.version === VERSION && raw.table && typeof raw.table === "object" ? raw.table : {};
  }

  get(difficulty: Difficulty, mode: SeedMode): RecordEntry {
    const e = this.table[recordKey(difficulty, mode)];
    return e ? { ...emptyEntry(), ...e } : emptyEntry();
  }

  private put(difficulty: Difficulty, mode: SeedMode, e: RecordEntry): void {
    this.table[recordKey(difficulty, mode)] = e;
    saveJSON("records", { version: VERSION, table: this.table });
  }

  /** Compte une tentative (appelé au lancement de chaque run). */
  countAttempt(difficulty: Difficulty, mode: SeedMode): void {
    const e = this.get(difficulty, mode);
    e.attempts++;
    this.put(difficulty, mode, e);
  }

  /**
   * Enregistre une run réussie. Renvoie l'entrée précédente (pour comparer) et si c'est un PB.
   */
  submit(
    difficulty: Difficulty,
    mode: SeedMode,
    run: { ms: number; grade: Grade; splits: SplitTime[]; seed: string; exit: string },
  ): { previous: RecordEntry; newPB: boolean; newBestGrade: boolean } {
    const previous = this.get(difficulty, mode);
    const e: RecordEntry = { ...previous, pbSplits: [...previous.pbSplits] };
    e.completions++;
    const newPB = previous.pbMs === null || run.ms < previous.pbMs;
    if (newPB) {
      e.pbMs = run.ms;
      e.pbSplits = run.splits.map((s) => ({ ...s }));
      e.pbSeed = run.seed;
      e.pbExit = run.exit;
      e.pbDate = Date.now();
    }
    const newBestGrade = gradeBetter(run.grade, previous.bestGrade);
    if (newBestGrade) e.bestGrade = run.grade;
    this.put(difficulty, mode, e);
    return { previous, newPB, newBestGrade };
  }

  clearAll(): void {
    this.table = {};
    saveJSON("records", { version: VERSION, table: this.table });
  }
}
