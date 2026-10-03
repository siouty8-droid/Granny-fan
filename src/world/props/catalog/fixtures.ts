import { Region, type PartStyle } from "../ModelKit";
import type { PropDef } from "../PropSystem";

const HOUSING: PartStyle = { region: Region.PAINTED_METAL, color: [0.85, 0.85, 0.83] };
const STEEL: PartStyle = { region: Region.STEEL };
const WHITE: PartStyle = { region: Region.WHITE };

/** Boîtier de néon double (1.25 m) — le tube est un prop séparé (matériau émissif). */
export const neonHousing: PropDef = {
  id: "neon_housing",
  shadow: false,
  build(k) {
    // bac ouvert vers le bas : plaque + rebords, grille diffusante sous les tubes
    k.boxMM(-0.66, -0.012, -0.14, 0.66, 0.0, 0.14, HOUSING, { bottom: true });
    k.boxMM(-0.66, -0.075, -0.145, 0.66, -0.012, -0.13, HOUSING);
    k.boxMM(-0.66, -0.075, 0.13, 0.66, -0.012, 0.145, HOUSING);
    k.boxMM(-0.67, -0.075, -0.145, -0.65, -0.012, 0.145, HOUSING);
    k.boxMM(0.65, -0.075, -0.145, 0.67, -0.012, 0.145, HOUSING);
    for (let i = -5; i <= 5; i++) k.boxMM(i * 0.12 - 0.003, -0.078, -0.13, i * 0.12 + 0.003, -0.072, 0.13, STEEL);
  },
};

/** Luminaire pendant, décroché d'un côté (néon cassé). */
export const neonHanging: PropDef = {
  id: "neon_hanging",
  shadow: true,
  build(k) {
    k.cylinder([0.6, 0, 0], [0.6, -0.05, 0], 0.005, 3, STEEL, false);
    k.push().translate(0.6, -0.05, 0).rotateZ(-1.0);
    k.boxMM(-1.25, -0.06, -0.14, 0.0, 0.0, 0.14, HOUSING);
    k.cylinder([-1.18, -0.08, -0.06], [-0.1, -0.08, -0.06], 0.014, 6, { region: Region.SCREEN, color: [2.5, 2.5, 2.5] }, false);
    k.pop();
    // câble qui pend
    k.tube([[-0.5, 0, 0.05], [-0.45, -0.4, 0.1], [-0.3, -0.6, 0.05]], 0.006, 3, { region: Region.RUBBER });
  },
};

/** Tubes fluorescents (géométrie commune à tous les matériaux néon). */
function tubes(k: import("../ModelKit").ModelKit): void {
  k.cylinder([-0.62, -0.045, -0.06], [0.62, -0.045, -0.06], 0.016, 6, WHITE, false);
  k.cylinder([-0.62, -0.045, 0.06], [0.62, -0.045, 0.06], 0.016, 6, WHITE, false);
}

export function neonTube(id: string, material: string): PropDef {
  return { id, shadow: false, material, build: tubes };
}

/** Ampoule sous grille de protection (sous-sol, locaux techniques). */
export const bulbCage: PropDef = {
  id: "bulb_cage",
  shadow: false,
  build(k) {
    k.cylinder([0, 0, 0], [0, -0.06, 0], 0.07, 10, { region: Region.PAINTED_METAL, color: [0.3, 0.3, 0.3] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.tube([[Math.cos(a) * 0.07, -0.06, Math.sin(a) * 0.07], [Math.cos(a) * 0.09, -0.16, Math.sin(a) * 0.09], [0, -0.24, 0]], 0.004, 3, STEEL);
    }
  },
};

export function bulb(id: string, material: string): PropDef {
  return {
    id,
    shadow: false,
    material,
    build(k) {
      k.sphere([0, -0.14, 0], 0.045, 8, WHITE, 1.2);
    },
  };
}

/** Bloc d'éclairage de secours mural (boîtier + diffuseur émissif). */
export const emergencyBox: PropDef = {
  id: "emergency_box",
  shadow: false,
  build(k) {
    k.boxMM(-0.18, -0.08, -0.06, 0.18, 0.08, 0.0, HOUSING);
  },
};

export function emergencyLens(id: string, material: string): PropDef {
  return {
    id,
    shadow: false,
    material,
    build(k) {
      k.boxMM(-0.15, -0.05, 0.0, 0.15, 0.05, 0.02, WHITE);
    },
  };
}

/** Panneau lumineux « SORTIE » (matériau émissif texturé). */
export function exitSign(id: string, material: string): PropDef {
  return {
    id,
    shadow: false,
    material,
    build(k) {
      // face avant texturée : UV plein cadre (le matériau utilise sa propre texture)
      k.quad([-0.2, -0.08, 0.021], [0.2, -0.08, 0.021], [0.2, 0.08, 0.021], [-0.2, 0.08, 0.021], [0, 0, 1], { region: Region.WHITE, raw: true, uv: 100 });
    },
  };
}
