import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "../config";

/**
 * Brouillard adaptatif : poussiéreux et sombre à l'intérieur, bleuté et plus lointain
 * dehors (silhouettes lisibles sous la lune). Transition douce entre les deux.
 */
export class Atmosphere {
  private t = 0;
  private readonly inColor: Color3;
  private readonly outColor = new Color3(0.035, 0.045, 0.07);
  private readonly inDensity: number = CONFIG.graphics.fog.density;
  private readonly outDensity = 0.021;
  /** assombrissement global (confinement…) */
  lockdown = 0;
  /** modificateur « brouillard » */
  thick = false;
  private readonly thickColor = new Color3(CONFIG.modifiers.fog.color.r, CONFIG.modifiers.fog.color.g, CONFIG.modifiers.fog.color.b);

  constructor(private readonly scene: Scene) {
    const c = CONFIG.graphics.fog.color;
    this.inColor = new Color3(c.r, c.g, c.b);
  }

  update(dt: number, outdoor: boolean): void {
    const target = outdoor ? 1 : 0;
    this.t += (target - this.t) * Math.min(1, dt * 1.5);
    const t = this.t;
    const fc = this.scene.fogColor;
    fc.r = this.inColor.r + (this.outColor.r - this.inColor.r) * t + this.lockdown * 0.02 * (1 - t);
    fc.g = this.inColor.g + (this.outColor.g - this.inColor.g) * t;
    fc.b = this.inColor.b + (this.outColor.b - this.inColor.b) * t;
    let density = this.inDensity + (this.outDensity - this.inDensity) * t;
    if (this.thick) {
      density *= CONFIG.modifiers.fog.density;
      // plus clair : on voit le brouillard au lieu d'un simple noir
      Color3.LerpToRef(fc, this.thickColor, 0.8, fc);
    }
    this.scene.fogDensity = density;
    this.scene.clearColor.set(fc.r, fc.g, fc.b, 1);
  }

  snap(outdoor: boolean): void {
    this.t = outdoor ? 1 : 0;
    this.update(0, outdoor);
  }
}
