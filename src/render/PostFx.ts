import type { Camera } from "@babylonjs/core/Cameras/camera";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG, type GraphicsPreset } from "../config";

/**
 * Post-traitements selon le preset : FXAA partout ; bloom léger et grain (Medium+) ;
 * SSAO léger et aberration chromatique (High). Le tone mapping / vignettage restent dans
 * les matériaux (pas de passe d'image processing en plus) ; la SSAO passe par le pré-rendu
 * (MRT WebGL2), qui déplace alors l'image processing en post-traitement.
 */
export class PostFx {
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private preset: GraphicsPreset | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
    private readonly webgl2: boolean,
  ) {}

  apply(preset: GraphicsPreset): void {
    if (preset === this.preset) return;
    this.preset = preset;
    const p = CONFIG.graphics.presets[preset];
    const c = CONFIG.graphics.post;
    this.dispose();

    if (p.ssao && this.webgl2) {
      try {
        const ssao = new SSAO2RenderingPipeline("ssao", this.scene, { ssaoRatio: c.ssao.ratio, blurRatio: c.ssao.ratio }, [this.camera], false);
        ssao.radius = c.ssao.radius;
        ssao.totalStrength = c.ssao.strength;
        ssao.base = 0.12;
        ssao.samples = c.ssao.samples;
        ssao.maxZ = c.ssao.maxZ;
        ssao.minZAspect = 0.5;
        ssao.expensiveBlur = false;
        this.ssao = ssao;
      } catch (e) {
        console.warn("SSAO indisponible :", e);
        this.ssao = null;
      }
    }

    const pl = new DefaultRenderingPipeline("post", false, this.scene, [this.camera]);
    pl.imageProcessingEnabled = false;
    pl.samples = 1;
    pl.fxaaEnabled = true;
    pl.bloomEnabled = p.bloom;
    if (p.bloom) {
      pl.bloomScale = c.bloom.scale;
      pl.bloomThreshold = c.bloom.threshold;
      pl.bloomWeight = c.bloom.weight;
      pl.bloomKernel = c.bloom.kernel;
    }
    pl.grainEnabled = p.grain;
    if (p.grain) {
      pl.grain.intensity = c.grain.intensity;
      pl.grain.animated = true;
    }
    pl.chromaticAberrationEnabled = p.chromatic;
    if (p.chromatic) {
      pl.chromaticAberration.aberrationAmount = c.chromatic.amount;
      pl.chromaticAberration.radialIntensity = c.chromatic.radial;
    }
    this.pipeline = pl;
  }

  private dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    this.ssao?.dispose();
    this.ssao = null;
  }
}
