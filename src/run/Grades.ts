import { CONFIG, type Grade } from "../config";

export const GRADE_ORDER: ReadonlyArray<Grade> = ["Z", "S", "A", "B", "C", "D", "E", "F"];

/** Note associée à un temps de run réussie (seuils dans `config.ts`). */
export function gradeFor(ms: number): Grade {
  for (const g of CONFIG.run.grades) {
    if (ms <= g.maxMs) return g.grade;
  }
  return "F";
}

/** true si `a` est meilleure que `b`. */
export function gradeBetter(a: Grade, b: Grade | null): boolean {
  if (!b) return true;
  return GRADE_ORDER.indexOf(a) < GRADE_ORDER.indexOf(b);
}

export const GRADE_COLORS: Record<Grade, string> = {
  Z: "#ff2448",
  S: "#f2c14e",
  A: "#56d67a",
  B: "#3fc6c0",
  C: "#5a8fe6",
  D: "#9a6ae0",
  E: "#e08a3c",
  F: "#8a8078",
};

/** Seuil de la note suivante (pour afficher « à X s de la note S », etc.). */
export function nextGradeThreshold(grade: Grade): { grade: Grade; maxMs: number } | null {
  const i = GRADE_ORDER.indexOf(grade);
  if (i <= 0) return null;
  const better = GRADE_ORDER[i - 1] as Grade;
  const entry = CONFIG.run.grades.find((g) => g.grade === better);
  return entry ? { grade: entry.grade, maxMs: entry.maxMs } : null;
}
