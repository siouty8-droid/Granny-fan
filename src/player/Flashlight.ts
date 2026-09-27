import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "../config";
import type { CameraRig } from "./CameraRig";

const DEG = Math.PI / 180;

/**
 * Lampe torche : LA seule lumière dynamique avec ombres du jeu.
 * Tenue « en main » (décalée à droite / en bas) pour que ses ombres soient visibles,
 * orientation légèrement lissée, texture de projection procédurale (anneau + halo).
 */
export class Flashlight {
  readonly light: SpotLight;
  shadows: ShadowGenerator | null = null;
  on = true;
  private dir = new Vector3(0, 0, 1);
  private target = new Vector3(0, 0, 1);
  private flickerT = 0;
  private baseIntensity: number = CONFIG.flashlight.intensity;
  /** multiplicateur externe (cinématiques, capture…) */
  intensityScale = 1;

  constructor(scene: Scene, private readonly rig: CameraRig) {
    const cfg = CONFIG.flashlight;
    const light = new SpotLight("flashlight", new Vector3(0, 1.5, 0), new Vector3(0, 0, 1), cfg.angleDeg * DEG, cfg.exponent, scene);
    light.diffuse = new Color3(cfg.color.r, cfg.color.g, cfg.color.b);
    light.specular = new Color3(cfg.color.r * 0.9, cfg.color.g * 0.9, cfg.color.b * 0.9);
    light.intensity = cfg.intensity;
    light.range = cfg.range;
    light.shadowMinZ = 0.12;
    light.shadowMaxZ = cfg.range;
    light.projectionTexture = makeCookie(scene);
    this.light = light;
  }

  /** (Re)crée le générateur d'ombres selon le preset graphique. */
  configureShadows(mapSize: number, filterQuality: number): void {
    const casters = this.shadows?.getShadowMap()?.renderList?.slice() ?? [];
    this.shadows?.dispose();
    const sg = new ShadowGenerator(mapSize, this.light, true);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality =
      filterQuality >= 2 ? ShadowGenerator.QUALITY_HIGH : filterQuality === 1 ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    sg.bias = 0.0006;
    sg.normalBias = 0.012;
    sg.darkness = 0;
    sg.transparencyShadow = false;
    const map = sg.getShadowMap();
    if (map) map.renderList = casters;
    this.shadows = sg;
  }

  addCaster(mesh: AbstractMesh): void {
    this.shadows?.addShadowCaster(mesh, false);
  }

  removeCaster(mesh: AbstractMesh): void {
    this.shadows?.removeShadowCaster(mesh, false);
  }

  setCasters(meshes: AbstractMesh[]): void {
    const map = this.shadows?.getShadowMap();
    if (map) map.renderList = meshes;
  }

  toggle(): void {
    this.on = !this.on;
    if (this.on) this.flickerT = 0.18;
  }

  setOn(on: boolean): void {
    this.on = on;
  }

  snap(): void {
    this.rig.forward(this.dir);
  }

  update(dt: number): void {
    const cfg = CONFIG.flashlight;
    const cam = this.rig.camera;
    this.rig.forward(this.target);
    if (this.rig.overridden) {
      // pendant une cinématique, la caméra a sa propre orientation
      cam.getDirectionToRef(Vector3.Forward(), this.target);
    }
    const k = 1 - Math.exp(-cfg.followSharpness * dt);
    this.dir.x += (this.target.x - this.dir.x) * k;
    this.dir.y += (this.target.y - this.dir.y) * k;
    this.dir.z += (this.target.z - this.dir.z) * k;
    this.dir.normalize();

    // position « en main » : décalage dans le repère de la caméra
    const m = cam.getWorldMatrix();
    const o = cfg.offset;
    const p = Vector3.TransformCoordinatesFromFloatsToRef(o.x, o.y, o.z, m, this.light.position);
    this.light.position = p;
    this.light.direction.copyFrom(this.dir);

    let intensity = this.on ? this.baseIntensity : 0;
    if (this.flickerT > 0) {
      this.flickerT -= dt;
      intensity *= Math.random() < 0.5 ? 0.25 : 1;
    }
    const lit = intensity * this.intensityScale > 0.001;
    this.light.intensity = lit ? intensity * this.intensityScale : 0;
    // La lumière reste toujours active : les matériaux sont gelés avec « 1 spot + ombre »,
    // la désactiver laisserait leur sampler d'ombre sans texture (draws rejetés par WebGL).
    // Éteinte, on arrête seulement de recalculer la shadow map.
    const map = this.shadows?.getShadowMap();
    const rate = lit ? 1 : 0;
    // (le setter réarme le compteur : on n'écrit qu'au changement)
    if (map && map.refreshRate !== rate) map.refreshRate = rate;
  }
}

/** Texture de projection : faisceau central chaud, anneau, halo diffus, légères imperfections. */
function makeCookie(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture("flashCookie", { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / c;
      const dy = (y + 0.5 - c) / c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      // halo large
      let v = Math.max(0, 1 - r) ** 1.4 * 0.55;
      // cœur du faisceau
      v += Math.exp(-(r * r) / 0.05) * 0.75;
      // anneau caractéristique d'une lampe à réflecteur
      v += Math.exp(-((r - 0.36) ** 2) / 0.0022) * 0.22;
      // petites irrégularités du réflecteur
      v *= 0.94 + 0.06 * Math.sin(ang * 7 + r * 18);
      if (r > 0.98) v = 0;
      const b = Math.min(255, Math.round(v * 255));
      const i = (y * size + x) * 4;
      img.data[i] = b;
      img.data[i + 1] = Math.round(b * 0.97);
      img.data[i + 2] = Math.round(b * 0.9);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update(false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
