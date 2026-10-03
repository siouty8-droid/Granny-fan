import { type Difficulty, type Grade } from "../config";
import { Emitter } from "../core/Events";
import { Rng } from "../core/Rng";
import type { SeedMode } from "../core/Settings";
import { gradeFor } from "./Grades";
import { runLimits, type ModifierId } from "./Modifiers";
import { Records, type RecordEntry, type SplitTime } from "./Records";
import { RunTimer } from "./RunTimer";

export interface RunSetup {
  seed: string;
  seedMode: SeedMode;
  difficulty: Difficulty;
  /** entraînement : pas de monstre, pas de limite de temps, rien n'est compté */
  training: boolean;
  /** modificateurs actifs (vide = conditions normales) */
  modifiers: ModifierId[];
}

/**
 * Run classée : ni entraînement ni modificateur. Seules les runs classées entrent dans les records
 * (PB, tentatives, splits de référence) et enregistrent un fantôme ; une run modifiée rapporte de
 * l'XP (bonus) et des succès ; l'entraînement ne compte pour rien.
 */
export function isRanked(setup: RunSetup): boolean {
  return !setup.training && setup.modifiers.length === 0;
}

export type RunStatus = "idle" | "running" | "finished" | "failed";
export type FailReason = "captured" | "timeout";

export interface LiveSplit extends SplitTime {
  /** écart au split du PB portant le même id (null si le PB n'a pas ce split) */
  deltaMs: number | null;
}

export interface RunResult {
  success: boolean;
  failReason: FailReason | null;
  timeMs: number;
  grade: Grade | null;
  splits: LiveSplit[];
  setup: RunSetup;
  exitId: string;
  exitLabel: string;
  previous: RecordEntry;
  newPB: boolean;
  newBestGrade: boolean;
}

interface RunEvents {
  lockdown: void;
  timeout: void;
  split: LiveSplit;
}

/**
 * Gestion d'une run : seed, timer, splits (comparés au PB), lockdown, limite de temps, résultat.
 * La run démarre à la frame exacte de la prise de contrôle et s'arrête à la frame du trigger de sortie.
 */
export class RunManager extends Emitter<RunEvents> {
  readonly timer = new RunTimer();
  readonly records = new Records();
  setup: RunSetup = { seed: "", seedMode: "random", difficulty: "normal", training: false, modifiers: [] };
  rng: Rng = new Rng("init");
  status: RunStatus = "idle";
  lockdown = false;
  splits: LiveSplit[] = [];
  private pb: RecordEntry | null = null;
  /** référence des écarts en direct : splits du fantôme (même seed) plutôt que ceux du PB */
  private ref: SplitTime[] | null = null;
  private doneIds = new Set<string>();

  /** Prépare une run (seed, rng) sans démarrer le chrono. */
  prepare(setup: RunSetup): void {
    this.setup = { ...setup, modifiers: [...setup.modifiers] };
    this.rng = new Rng(setup.seed);
    this.status = "idle";
    this.lockdown = false;
    this.splits = [];
    this.doneIds.clear();
    this.timer.reset();
    // écarts au PB : seulement en run classée (une run modifiée ne se compare pas aux records)
    this.pb = isRanked(this.setup) ? this.records.get(setup.difficulty, setup.seedMode) : null;
    this.ref = null;
  }

  /** Écarts en direct comparés aux splits d'un fantôme (null : au PB). */
  useReference(splits: SplitTime[] | null): void {
    this.ref = splits;
  }

  /** Limite de temps et confinement de la run en cours (ms). */
  get limits(): { timeLimitMs: number; lockdownMs: number } {
    return runLimits(this.setup.modifiers);
  }

  /** Démarre le chrono à l'horodatage de la frame de prise de contrôle. */
  begin(now: number): void {
    this.status = "running";
    this.timer.start(now);
    if (isRanked(this.setup)) this.records.countAttempt(this.setup.difficulty, this.setup.seedMode);
  }

  elapsed(now: number): number {
    return this.timer.elapsed(now);
  }

  get running(): boolean {
    return this.status === "running";
  }

  pause(now: number): void {
    this.timer.pause(now);
  }

  resume(now: number): void {
    this.timer.resume(now);
  }

  /** À appeler chaque frame : lockdown (8:00) et limite (10:00) — 4:00 et 5:00 en chrono réduit. */
  update(now: number): void {
    if (this.status !== "running") return;
    const t = this.timer.elapsed(now);
    const lim = this.limits;
    if (!this.lockdown && t >= lim.lockdownMs) {
      this.lockdown = true;
      this.emit("lockdown", undefined);
    }
    if (t >= lim.timeLimitMs && !this.setup.training) {
      this.emit("timeout", undefined);
    }
  }

  /** Enregistre un split (une seule fois par id). */
  split(id: string, label: string, now: number): LiveSplit | null {
    if (this.status !== "running" || this.doneIds.has(id)) return null;
    this.doneIds.add(id);
    const ms = this.timer.elapsed(now);
    const pbSplit = (this.ref ?? this.pb?.pbSplits)?.find((s) => s.id === id);
    const s: LiveSplit = { id, label, ms, deltaMs: pbSplit ? ms - pbSplit.ms : null };
    this.splits.push(s);
    this.emit("split", s);
    return s;
  }

  hasSplit(id: string): boolean {
    return this.doneIds.has(id);
  }

  /** Sortie franchie : arrêt du chrono à cette frame, note, records. */
  finish(exitId: string, exitLabel: string, now: number): RunResult {
    this.split(`exit_${exitId}`, `Sortie : ${exitLabel}`, now);
    const timeMs = this.timer.stop(now);
    this.status = "finished";
    const grade = gradeFor(timeMs);
    // entraînement et runs modifiées : rien n'est enregistré dans les records
    const sub = !isRanked(this.setup)
      ? { previous: this.records.get(this.setup.difficulty, this.setup.seedMode), newPB: false, newBestGrade: false }
      : this.records.submit(this.setup.difficulty, this.setup.seedMode, {
          ms: timeMs,
          grade,
          splits: this.splits.map(({ id, label, ms }) => ({ id, label, ms })),
          seed: this.setup.seed,
          exit: exitLabel,
        });
    return {
      success: true,
      failReason: null,
      timeMs,
      grade,
      splits: [...this.splits],
      setup: { ...this.setup, modifiers: [...this.setup.modifiers] },
      exitId,
      exitLabel,
      previous: sub.previous,
      newPB: sub.newPB,
      newBestGrade: sub.newBestGrade,
    };
  }

  /** Run perdue (capture ou temps écoulé). */
  fail(reason: FailReason, now: number): RunResult {
    const timeMs = reason === "timeout" ? this.limits.timeLimitMs : this.timer.stop(now);
    this.timer.stop(now);
    this.status = "failed";
    const previous = this.records.get(this.setup.difficulty, this.setup.seedMode);
    return {
      success: false,
      failReason: reason,
      timeMs,
      grade: null,
      splits: [...this.splits],
      setup: { ...this.setup, modifiers: [...this.setup.modifiers] },
      exitId: "",
      exitLabel: "",
      previous,
      newPB: false,
      newBestGrade: false,
    };
  }
}
