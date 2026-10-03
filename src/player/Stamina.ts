import { CONFIG } from "../config";

export type SprintState = "ready" | "sprinting" | "recharging";

/**
 * Jauge de sprint « tout ou rien » :
 * - activable uniquement quand elle est pleine ;
 * - une fois lancé, le sprint dure jusqu'à ce que la jauge soit vide ;
 * - ensuite elle se recharge (après un court délai).
 */
export class Stamina {
  value = 1;
  state: SprintState = "ready";
  private delay = 0;
  /** temps restant d'essoufflement (respiration audible) */
  breathless = 0;
  /** tentative d'activation refusée (feedback HUD) */
  deniedFlash = 0;

  reset(): void {
    this.value = 1;
    this.state = "ready";
    this.delay = 0;
    this.breathless = 0;
    this.deniedFlash = 0;
  }

  get sprinting(): boolean {
    return this.state === "sprinting";
  }

  /** Demande d'activation. Renvoie true si le sprint démarre. */
  tryActivate(): boolean {
    if (this.state === "ready") {
      this.state = "sprinting";
      return true;
    }
    if (this.state === "recharging") this.deniedFlash = 0.35;
    return false;
  }

  update(dt: number): void {
    const cfg = CONFIG.sprint;
    if (this.deniedFlash > 0) this.deniedFlash = Math.max(0, this.deniedFlash - dt);
    if (this.breathless > 0) this.breathless = Math.max(0, this.breathless - dt);
    if (this.state === "sprinting") {
      this.value -= dt / cfg.duration;
      if (this.value <= 0) {
        this.value = 0;
        this.state = "recharging";
        this.delay = cfg.rechargeDelay;
        this.breathless = cfg.breathlessTime;
      }
    } else if (this.state === "recharging") {
      if (this.delay > 0) {
        this.delay -= dt;
      } else {
        this.value += dt / cfg.rechargeTime;
        if (this.value >= 1) {
          this.value = 1;
          this.state = "ready";
        }
      }
    }
  }
}
