import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { h } from "./dom";

/** Compteur de FPS (option debug) : fps moyen, temps de frame, draw calls, meshes actifs. */
export class FpsCounter {
  readonly el: HTMLDivElement;
  private instr: SceneInstrumentation | null = null;
  private frames = 0;
  private acc = 0;
  private worst = 0;
  visible = false;
  extra: () => string = () => "";

  constructor(private readonly scene: Scene, private readonly engine: Engine) {
    this.el = h("div", { class: "fps-counter" });
    this.el.style.display = "none";
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? "" : "none";
    if (v && !this.instr) {
      this.instr = new SceneInstrumentation(this.scene);
      this.instr.captureFrameTime = true;
    }
  }

  tick(dt: number): void {
    if (!this.visible) return;
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.acc >= 0.5) {
      const fps = this.frames / this.acc;
      const dc = this.instr ? this.instr.drawCallsCounter.current : 0;
      const ft = this.instr ? this.instr.frameTimeCounter.lastSecAverage : 0;
      const w = this.engine.getRenderWidth();
      const hgt = this.engine.getRenderHeight();
      this.el.textContent =
        `${fps.toFixed(0)} FPS  (pire ${(this.worst * 1000).toFixed(1)} ms)\n` +
        `CPU ${ft.toFixed(2)} ms · ${dc} draw calls · ${this.scene.getActiveMeshes().length} meshes\n` +
        `${w}×${hgt}` +
        (this.extra ? `\n${this.extra()}` : "");
      this.frames = 0;
      this.acc = 0;
      this.worst = 0;
    }
  }
}
