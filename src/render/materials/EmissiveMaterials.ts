import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { BakeGlobals } from "../BakedLightPlugin";

interface Anim {
  mat: StandardMaterial;
  base: Color3;
  slot: number;
  /** réagit au confinement (les néons s'éteignent, le secours rouge s'intensifie) */
  role: "neon" | "emergencyRed" | "static";
}

/** Voyants et éclairages de gameplay (couleurs HDR). */
const LEDS: Record<string, [number, number, number]> = {
  led_red: [2.6, 0.15, 0.08],
  led_green: [0.2, 2.4, 0.45],
  led_amber: [2.4, 1.2, 0.1],
  led_off: [0.04, 0.04, 0.045],
  cabin_light: [1.9, 1.9, 1.75],
};

const BASES: Record<string, [number, number, number]> = {
  neon: [2.2, 2.35, 2.3],
  bulb: [2.6, 1.7, 0.8],
  lamp: [3.2, 2.1, 0.9],
};

/**
 * Matériaux émissifs (néons, ampoules, réverbères, blocs de secours, panneaux « SORTIE »),
 * sans éclairage, animés par les canaux de clignotement et le confinement.
 */
export class EmissiveMaterials {
  private cache = new Map<string, StandardMaterial>();
  private anims: Anim[] = [];

  constructor(private readonly scene: Scene) {}

  private make(name: string, color: [number, number, number], slot: number, role: Anim["role"]): StandardMaterial {
    const m = new StandardMaterial(`emi_${name}`, this.scene);
    m.disableLighting = true;
    const base = new Color3(color[0], color[1], color[2]);
    m.emissiveColor = base.clone();
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.fogEnabled = true;
    this.anims.push({ mat: m, base, slot, role });
    return m;
  }

  get(id: string): StandardMaterial | null {
    const cached = this.cache.get(id);
    if (cached) return cached;
    let m: StandardMaterial | null = null;
    const match = /^(neon|bulb|lamp)_(on|off|f(\d+))$/.exec(id);
    if (match) {
      const kind = match[1]!;
      const base = BASES[kind]!;
      if (match[2] === "off") m = this.make(id, [0.05, 0.05, 0.055], 0, "static");
      else m = this.make(id, base, match[3] ? Number(match[3]) : 0, kind === "neon" ? "neon" : "static");
    } else if (id === "emerg_green") {
      m = this.make(id, [0.3, 1.6, 0.5], 0, "static");
    } else if (id === "emerg_red") {
      m = this.make(id, [1.8, 0.15, 0.08], 0, "emergencyRed");
    } else if (id in LEDS) {
      m = this.make(id, LEDS[id]!, 0, "static");
    } else if (id === "exit_sign") {
      m = this.make(id, [0, 0, 0], 0, "static");
      const tex = exitTexture(this.scene);
      tex.level = 1.6;
      m.emissiveTexture = tex;
    }
    if (m) this.cache.set(id, m);
    return m;
  }

  /** À chaque frame : clignotement + confinement. */
  update(): void {
    const f = BakeGlobals.flicker;
    const lock = BakeGlobals.lockdown;
    const pulse = BakeGlobals.pulse;
    for (const a of this.anims) {
      let k = a.slot > 0 ? f[a.slot]! : 1;
      if (a.role === "neon") {
        // confinement : les néons baissent et virent au rouge
        k *= 1 - lock * 0.8;
        a.mat.emissiveColor.set(a.base.r * k + lock * pulse * 1.5, a.base.g * k * (1 - lock * 0.7), a.base.b * k * (1 - lock * 0.7));
      } else if (a.role === "emergencyRed") {
        const p = 0.4 + 0.6 * lock * pulse + (1 - lock) * 0.2;
        a.mat.emissiveColor.set(a.base.r * p, a.base.g * p, a.base.b * p);
      } else if (a.slot > 0) {
        a.mat.emissiveColor.set(a.base.r * k, a.base.g * k, a.base.b * k);
      }
    }
  }
}

/** Texture du panneau « SORTIE » (pictogramme + texte), dessinée au canvas. */
function exitTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("exitTex", { width: 256, height: 102 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#0f8a3a";
  ctx.fillRect(0, 0, 256, 102);
  ctx.fillStyle = "#eafff0";
  ctx.font = "bold 44px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("SORTIE", 92, 54);
  // bonhomme qui court
  ctx.strokeStyle = "#eafff0";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(52, 22, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#eafff0";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, 34);
  ctx.lineTo(40, 60);
  ctx.moveTo(40, 60);
  ctx.lineTo(56, 72);
  ctx.lineTo(52, 90);
  ctx.moveTo(40, 60);
  ctx.lineTo(28, 76);
  ctx.lineTo(16, 78);
  ctx.moveTo(46, 40);
  ctx.lineTo(62, 50);
  ctx.moveTo(46, 40);
  ctx.lineTo(30, 44);
  ctx.stroke();
  ctx.strokeStyle = "#0a5a26";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 96);
  tex.update(true);
  return tex;
}
