import { CONFIG } from "../config";
import type { Renderer } from "./Renderer";

/**
 * Résolution dynamique : si le fps moyen passe sous le seuil (58 par défaut, ou un peu sous
 * la fréquence de l'écran si elle est plus basse), on baisse l'échelle de rendu par petits
 * pas ; on remonte doucement vers celle du preset quand tout va bien. Les fenêtres de mesure
 * contenant une saccade isolée (compilation, GC) sont ignorées.
 */
export class DynamicResolution {
  enabled = true;
  private base = 1;
  private scale = 1;
  private acc = 0;
  private frames = 0;
  private minDt = 1;
  private maxDt = 0;
  private good = 0;

  constructor(private readonly renderer: Renderer) {}

  /** Échelle du preset (plafond). */
  setBase(scale: number): void {
    this.base = scale;
    this.scale = scale;
    this.renderer.setRenderScale(scale);
    this.restart();
  }

  get current(): number {
    return this.scale;
  }

  /** Ignore la mesure en cours (changement d'écran, chargement…). */
  restart(): void {
    this.acc = 0;
    this.frames = 0;
    this.minDt = 1;
    this.maxDt = 0;
    this.good = 0;
  }

  /** `dt` brut (non plafonné) de la frame rendue. */
  update(dt: number): void {
    if (!this.enabled) {
      if (this.scale !== this.base) this.setBase(this.base);
      return;
    }
    const cfg = CONFIG.graphics.dynamicResolution;
    this.frames++;
    this.acc += dt;
    if (dt > 0.003) this.minDt = Math.min(this.minDt, dt);
    this.maxDt = Math.max(this.maxDt, dt);
    if (this.acc < cfg.window) return;
    const avg = this.acc / this.frames;
    const fps = 1 / avg;
    const hitch = this.maxDt > 0.08 && this.maxDt > avg * 4;
    // fréquence de l'écran estimée par l'intervalle minimal (vsync)
    const refresh = 1 / Math.max(this.minDt, 1 / 240);
    const low = Math.min(cfg.lowFps, refresh * 0.95);
    const high = Math.min(cfg.highFps, refresh * 0.985);
    this.acc = 0;
    this.frames = 0;
    this.minDt = 1;
    this.maxDt = 0;
    if (hitch) return;
    if (fps < low && this.scale > cfg.minScale) {
      this.scale = Math.max(cfg.minScale, this.scale - cfg.step);
      this.renderer.setRenderScale(this.scale);
      this.good = 0;
    } else if (fps >= high) {
      this.good++;
      if (this.good >= 3 && this.scale < this.base) {
        this.scale = Math.min(this.base, this.scale + cfg.step / 2);
        this.renderer.setRenderScale(this.scale);
        this.good = 0;
      }
    } else this.good = 0;
  }
}
