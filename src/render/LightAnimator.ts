import { BakeGlobals, FLICKER_SLOTS } from "./BakedLightPlugin";

type Pattern = "buzz" | "dying" | "stutter";

interface SlotState {
  pattern: Pattern;
  value: number;
  target: number;
  timer: number;
  /** prochain « événement » (coupure, rafale) */
  next: number;
  burst: number;
}

/**
 * Anime les canaux de clignotement des néons (valeurs lues par tous les matériaux via
 * BakeGlobals) et la pulsation rouge du confinement. Les luminaires émissifs suivent
 * les mêmes valeurs (FixtureRenderer).
 */
export class LightAnimator {
  private slots: SlotState[] = [];
  private t = 0;
  private rand: () => number;
  /** 0..1, niveau de confinement visé (montée progressive) */
  lockdownTarget = 0;
  /** multiplicateur des néons pendant le confinement (les néons « normaux » faiblissent) */
  neonScale = 1;

  constructor(seed = 99) {
    let a = seed;
    this.rand = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
    const patterns: Pattern[] = ["buzz", "dying", "stutter"];
    for (let i = 0; i < FLICKER_SLOTS; i++) {
      this.slots.push({ pattern: patterns[i % 3]!, value: 1, target: 1, timer: 0, next: 1 + this.rand() * 4, burst: 0 });
    }
  }

  reset(): void {
    this.lockdownTarget = 0;
    BakeGlobals.lockdown = 0;
    BakeGlobals.pulse = 0;
  }

  update(dt: number): void {
    this.t += dt;
    const f = BakeGlobals.flicker;
    f[0] = 1;
    for (let i = 1; i < FLICKER_SLOTS; i++) {
      const s = this.slots[i]!;
      s.timer += dt;
      if (s.burst > 0) {
        // rafale de coupures rapides
        s.burst -= dt;
        s.target = this.rand() < 0.45 ? 0.05 + this.rand() * 0.2 : 0.9 + this.rand() * 0.1;
      } else if (s.timer > s.next) {
        s.timer = 0;
        switch (s.pattern) {
          case "buzz":
            s.burst = 0.1 + this.rand() * 0.35;
            s.next = 2 + this.rand() * 6;
            break;
          case "dying":
            s.burst = 0.6 + this.rand() * 1.4;
            s.next = 1 + this.rand() * 3;
            break;
          case "stutter":
            s.burst = 0.05 + this.rand() * 0.12;
            s.next = 0.4 + this.rand() * 2.5;
            break;
        }
      } else {
        s.target = s.pattern === "dying" ? 0.55 + 0.15 * Math.sin(this.t * 31 + i) : 1;
      }
      // les tubes s'allument / s'éteignent vite mais pas instantanément
      const k = Math.min(1, dt * (s.target < s.value ? 60 : 25));
      s.value += (s.target - s.value) * k;
      f[i] = s.value * this.neonScale;
    }
    // confinement : montée sur ~2 s, pulsation de gyrophare
    BakeGlobals.lockdown += (this.lockdownTarget - BakeGlobals.lockdown) * Math.min(1, dt * 1.5);
    BakeGlobals.pulse = 0.5 + 0.5 * Math.sin(this.t * Math.PI * 2 * 0.8);
  }

  slotValue(slot: number): number {
    return BakeGlobals.flicker[slot] ?? 1;
  }
}
