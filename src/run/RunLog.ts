import type { DetectEvent } from "../ai/Monster";
import { CONFIG } from "../config";
import type { FloorId } from "../world/layout/types";

/** Point de trajectoire (temps de run en s). */
export interface PathSample {
  t: number;
  x: number;
  z: number;
  floor: FloorId;
}

export type LogKind = "detect" | "split" | "lockdown" | "exit" | "timeout";

/** Évènement placé sur la carte / dans le récap. */
export interface LogEvent {
  t: number;
  kind: LogKind;
  x: number;
  z: number;
  floor: FloorId;
  label: string;
  detect?: DetectEvent;
}

/**
 * Journal d'une run : trajectoires du joueur et du monstre (échantillonnées), détections,
 * splits, confinement, sortie. Sert à la carte de fin et au récap de capture.
 */
export class RunLog {
  readonly player: PathSample[] = [];
  readonly monster: PathSample[] = [];
  readonly events: LogEvent[] = [];
  private acc = 0;

  constructor(private readonly floorOf: (x: number, y: number, z: number) => FloorId) {}

  reset(): void {
    this.player.length = 0;
    this.monster.length = 0;
    this.events.length = 0;
    this.acc = 0;
  }

  /** À chaque frame de jeu (t = temps de run en s). */
  sample(dt: number, t: number, px: number, py: number, pz: number, monster: { x: number; y: number; z: number } | null): void {
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc = CONFIG.runLog.sampleInterval;
    this.player.push({ t, x: px, z: pz, floor: this.floorOf(px, py, pz) });
    if (monster) this.monster.push({ t, x: monster.x, z: monster.z, floor: this.floorOf(monster.x, monster.y, monster.z) });
  }

  add(kind: LogKind, t: number, x: number, y: number, z: number, label: string, detect?: DetectEvent): void {
    // détections : on ignore les répétitions rapprochées de la même cause
    if (kind === "detect" && detect) {
      const last = this.events.findLast((e) => e.kind === "detect");
      if (last?.detect && last.detect.kind === detect.kind && last.detect.detail === detect.detail && t - last.t < CONFIG.runLog.dedupe) return;
    }
    const e: LogEvent = { t, kind, x, z, floor: this.floorOf(x, y, z), label };
    if (detect) e.detect = detect;
    this.events.push(e);
  }

  get detections(): LogEvent[] {
    return this.events.filter((e) => e.kind === "detect");
  }
}
