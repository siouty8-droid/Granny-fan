import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";

/** Nombre de canaux de clignotement indépendants (zones qui grésillent). */
export const FLICKER_SLOTS = 16;

/**
 * Paramètres globaux de l'éclairage précalculé (mis à jour une fois par frame,
 * valables pour tous les matériaux — compatibles avec les matériaux gelés).
 */
export const BakeGlobals = {
  /** multiplicateur global de l'irradiance précalculée */
  intensity: 1,
  /** 0 → éclairage normal, 1 → confinement (néons coupés, rouge d'urgence) */
  lockdown: 0,
  /** pulsation du rouge d'urgence (0..1) */
  pulse: 0,
  /** intensité courante de chaque canal de clignotement (slot 0 = toujours 1) */
  flicker: new Float32Array(FLICKER_SLOTS).fill(1),
};

/**
 * Plugin PBR « lumière précalculée » :
 * - attributs `bake` (irradiance rgb + AO) et `bake2` (irradiance des néons qui clignotent + slot),
 *   par sommet (géométrie fusionnée) ou par instance (thin instances, objets dynamiques) ;
 * - sinon, uniformes `bakeProbe` (sonde par matériau, pour le monstre).
 * L'irradiance est ajoutée comme lumière ambiante (× albedo × AO) ; la lampe torche reste dynamique.
 */
export class BakedLightPlugin extends MaterialPluginBase {
  /** sonde utilisée quand le mesh n'a pas d'attributs précalculés */
  probe = [0.02, 0.02, 0.025, 1];
  probe2 = [0, 0, 0, 0];
  /** part de l'occlusion appliquée à la lampe torche */
  aoOnDynamic = 0.55;

  constructor(material: Material) {
    super(material, "BakedLight", 250, { BAKE_ATTRIB: false, BAKE_UNIFORM: false }, true, true);
  }

  override getClassName(): string {
    return "BakedLightPlugin";
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    const m = mesh as Mesh;
    const attr = mesh.isVerticesDataPresent("bake") || !!(m.instancedBuffers && m.instancedBuffers["bake"] !== undefined);
    defines["BAKE_ATTRIB"] = attr;
    defines["BAKE_UNIFORM"] = !attr;
  }

  override getAttributes(attributes: string[], _scene: Scene, mesh: AbstractMesh): void {
    const m = mesh as Mesh;
    if (mesh.isVerticesDataPresent("bake") || !!(m.instancedBuffers && m.instancedBuffers["bake"] !== undefined)) {
      attributes.push("bake", "bake2");
    }
  }

  override getUniforms(): {
    ubo: Array<{ name: string; size: number; type: string }>;
    vertex: string;
    fragment: string;
  } {
    const decl = `
      uniform vec4 bakeParams;
      uniform vec4 bakeFlickerA;
      uniform vec4 bakeFlickerB;
      uniform vec4 bakeFlickerC;
      uniform vec4 bakeFlickerD;
      uniform vec4 bakeProbe;
      uniform vec4 bakeProbe2;
    `;
    return {
      ubo: [
        { name: "bakeParams", size: 4, type: "vec4" },
        { name: "bakeFlickerA", size: 4, type: "vec4" },
        { name: "bakeFlickerB", size: 4, type: "vec4" },
        { name: "bakeFlickerC", size: 4, type: "vec4" },
        { name: "bakeFlickerD", size: 4, type: "vec4" },
        { name: "bakeProbe", size: 4, type: "vec4" },
        { name: "bakeProbe2", size: 4, type: "vec4" },
      ],
      vertex: decl,
      fragment: decl,
    };
  }

  override bindForSubMesh(ubo: UniformBuffer, _scene: Scene, _engine: AbstractEngine, _subMesh: SubMesh): void {
    const g = BakeGlobals;
    const f = g.flicker;
    ubo.updateFloat4("bakeParams", g.intensity, g.lockdown, g.pulse, this.aoOnDynamic);
    ubo.updateFloat4("bakeFlickerA", f[0]!, f[1]!, f[2]!, f[3]!);
    ubo.updateFloat4("bakeFlickerB", f[4]!, f[5]!, f[6]!, f[7]!);
    ubo.updateFloat4("bakeFlickerC", f[8]!, f[9]!, f[10]!, f[11]!);
    ubo.updateFloat4("bakeFlickerD", f[12]!, f[13]!, f[14]!, f[15]!);
    ubo.updateFloat4("bakeProbe", this.probe[0]!, this.probe[1]!, this.probe[2]!, this.probe[3]!);
    ubo.updateFloat4("bakeProbe2", this.probe2[0]!, this.probe2[1]!, this.probe2[2]!, this.probe2[3]!);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          #ifdef BAKE_ATTRIB
          attribute vec4 bake;
          attribute vec4 bake2;
          #endif
          varying vec4 vBake;
          varying vec4 vBake2;
        `,
        CUSTOM_VERTEX_MAIN_END: `
          #ifdef BAKE_ATTRIB
          vBake = bake;
          vBake2 = bake2;
          #else
          vBake = bakeProbe;
          vBake2 = bakeProbe2;
          #endif
        `,
      };
    }
    if (shaderType === "fragment") {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          varying vec4 vBake;
          varying vec4 vBake2;
          float bakeFlick(float slot) {
            int s = int(slot + 0.5);
            vec4 v = s < 4 ? bakeFlickerA : (s < 8 ? bakeFlickerB : (s < 12 ? bakeFlickerC : bakeFlickerD));
            int c = s - (s / 4) * 4;
            return c == 0 ? v.x : (c == 1 ? v.y : (c == 2 ? v.z : v.w));
          }
        `,
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
          {
            vec3 bIrr = vBake.rgb + vBake2.rgb * bakeFlick(vBake2.a);
            float bLum = dot(bIrr, vec3(0.2126, 0.7152, 0.0722));
            vec3 lockC = vec3(1.0, 0.07, 0.04) * (0.3 + 0.7 * bakeParams.z) * (bLum * 1.1 + 0.02);
            bIrr = mix(bIrr, vec3(bLum * 0.12) + lockC, bakeParams.y);
            // métaux : pas de diffus en PBR → on simule un reflet très diffus de l'ambiance
            float bDiff = dot(surfaceAlbedo.rgb, vec3(1.0));
            float bBase = max(dot(baseColor.rgb, vec3(1.0)), 1e-3);
            float bMetal = clamp(1.0 - bDiff / bBase, 0.0, 1.0);
            vec3 bAlb = mix(surfaceAlbedo.rgb, baseColor.rgb * 0.55, bMetal);
            finalAmbient += bAlb * bIrr * bakeParams.x * aoOut.ambientOcclusionColor;
            finalDiffuse *= mix(1.0, clamp(vBake.a, 0.0, 1.0), bakeParams.w);
          }
        `,
      };
    }
    return null;
  }
}
