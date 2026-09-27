/**
 * Timer de speedrun.
 * - Toutes les mesures viennent de `performance.now()` (horodatage de la frame) : on ne somme
 *   JAMAIS des deltas de frames, donc aucune dérive quel que soit le framerate.
 * - Stocké en millisecondes ; la pause gèle le temps.
 */
export type TimerState = "idle" | "running" | "paused" | "stopped";

export class RunTimer {
  private startAt = 0;
  private pausedAt = 0;
  private pausedTotal = 0;
  private stoppedMs = 0;
  state: TimerState = "idle";

  reset(): void {
    this.state = "idle";
    this.startAt = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.stoppedMs = 0;
  }

  /** Démarre à l'instant `now` (horodatage de la frame de prise de contrôle). */
  start(now: number): void {
    this.reset();
    this.startAt = now;
    this.state = "running";
  }

  pause(now: number): void {
    if (this.state !== "running") return;
    this.pausedAt = now;
    this.state = "paused";
  }

  resume(now: number): void {
    if (this.state !== "paused") return;
    this.pausedTotal += now - this.pausedAt;
    this.state = "running";
  }

  /** Arrête le timer à l'instant `now` et renvoie le temps final (ms). */
  stop(now: number): number {
    if (this.state === "stopped") return this.stoppedMs;
    if (this.state === "paused") this.resume(now);
    this.stoppedMs = Math.max(0, now - this.startAt - this.pausedTotal);
    this.state = "stopped";
    return this.stoppedMs;
  }

  /** Tests : avance le chrono de `ms` (simulation hors temps réel). */
  debugAdvance(ms: number): void {
    if (this.state === "running" || this.state === "paused") this.startAt -= ms;
  }

  /** Temps écoulé (ms) à l'instant `now`. */
  elapsed(now: number): number {
    switch (this.state) {
      case "idle":
        return 0;
      case "running":
        return Math.max(0, now - this.startAt - this.pausedTotal);
      case "paused":
        return Math.max(0, this.pausedAt - this.startAt - this.pausedTotal);
      case "stopped":
        return this.stoppedMs;
    }
  }
}

/** `m:ss.t` (dixièmes, tronqués comme un chrono de speedrun). */
export function formatTenths(ms: number): string {
  const t = Math.floor(Math.max(0, ms) / 100);
  const tenths = t % 10;
  const totalS = Math.floor(t / 10);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
}

/** `m:ss.cc` (centièmes, tronqués). */
export function formatHundredths(ms: number): string {
  const t = Math.floor(Math.max(0, ms) / 10);
  const cc = t % 100;
  const totalS = Math.floor(t / 100);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}.${cc.toString().padStart(2, "0")}`;
}

/** Écart signé `+1.2` / `−3.4` (secondes, dixièmes). */
export function formatDelta(ms: number, hundredths = false): string {
  const sign = ms < 0 ? "−" : "+";
  const abs = Math.abs(ms);
  if (abs >= 60_000) {
    return sign + (hundredths ? formatHundredths(abs) : formatTenths(abs));
  }
  const v = hundredths ? (Math.floor(abs / 10) / 100).toFixed(2) : (Math.floor(abs / 100) / 10).toFixed(1);
  return sign + v;
}
