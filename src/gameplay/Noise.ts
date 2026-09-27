import { Emitter } from "../core/Events";

export type NoiseKind = "step" | "door" | "slam" | "unlock" | "planks" | "chain" | "drop" | "glass" | "keypad" | "machine" | "vault" | "pickup" | "trap";

/** Bruit émis dans le monde (perçu par l'IA selon son rayon et la difficulté). */
export interface NoiseEvent {
  x: number;
  y: number;
  z: number;
  /** rayon d'audibilité de base (m) */
  radius: number;
  kind: NoiseKind;
  /** produit par le joueur (sinon : monstre, mécanisme…) */
  byPlayer: boolean;
  /** horodatage (performance.now) */
  time: number;
}

interface NoiseEvents {
  noise: NoiseEvent;
}

/** Bus des bruits : le gameplay émet, l'IA (phase 6) et l'audio écoutent. */
export class NoiseBus extends Emitter<NoiseEvents> {
  readonly recent: NoiseEvent[] = [];

  make(x: number, y: number, z: number, radius: number, kind: NoiseKind, byPlayer = true): void {
    const e: NoiseEvent = { x, y, z, radius, kind, byPlayer, time: performance.now() };
    this.recent.push(e);
    if (this.recent.length > 32) this.recent.shift();
    this.emit("noise", e);
  }

  reset(): void {
    this.recent.length = 0;
  }
}
