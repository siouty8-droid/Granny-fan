import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { CONFIG } from "../config";

/**
 * Création du moteur Babylon (WebGL2) et de la scène unique du jeu.
 * La résolution de rendu = résolution native de l'écran × `renderScale` (preset + résolution dynamique).
 */
export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private scale = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.engine = new Engine(
      canvas,
      false,
      {
        antialias: false,
        stencil: false,
        preserveDrawingBuffer: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
        audioEngine: false,
        doNotHandleContextLost: true,
        adaptToDeviceRatio: false,
      },
      false,
    );
    this.engine.disableUniformBuffers = false;
    this.engine.enableOfflineSupport = false;

    const scene = new Scene(this.engine);
    this.scene = scene;
    scene.detachControl(); // aucune sélection par pointeur : entrées gérées à la main
    scene.skipPointerMovePicking = true;
    scene.clearColor = new Color4(0.008, 0.009, 0.012, 1);
    scene.ambientColor = new Color3(0, 0, 0);
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = CONFIG.graphics.fog.density;
    const fc = CONFIG.graphics.fog.color;
    scene.fogColor = new Color3(fc.r, fc.g, fc.b);
    scene.fogEnabled = true;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = CONFIG.graphics.exposure;
    ip.contrast = CONFIG.graphics.contrast;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.2;
    ip.vignetteStretch = 0.2;
    ip.vignetteColor = new Color4(0, 0, 0, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    window.addEventListener("resize", this.onResize);
    this.onResize();
  }

  /** Luminosité réglée par le joueur (× exposition de base). */
  setBrightness(k: number): void {
    this.scene.imageProcessingConfiguration.exposure = CONFIG.graphics.exposure * k;
  }

  get isWebGL2(): boolean {
    return this.engine.webGLVersion >= 2;
  }

  /** Échelle de rendu (1 = natif). Tient compte du devicePixelRatio pour viser la vraie résolution écran. */
  setRenderScale(scale: number): void {
    this.scale = Math.max(0.3, Math.min(1, scale));
    this.applyScale();
  }

  get renderScale(): number {
    return this.scale;
  }

  private applyScale(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.engine.setHardwareScalingLevel(1 / (dpr * this.scale));
    this.engine.resize();
  }

  private onResize = (): void => {
    this.applyScale();
  };
}
