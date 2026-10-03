import { Region, type ModelKit, type PartStyle } from "../../world/props/ModelKit";
import type { PropDef } from "../../world/props/PropSystem";

/**
 * Vantaux de portes et quincaillerie.
 * Vantail : largeur unitaire (x de 0 = gond à 1 = bord libre, mis à l'échelle par instance),
 * épaisseur centrée sur z = 0, pied à y = 0.
 */

export const LEAF_T = 0.045;
const HT = LEAF_T / 2;

const STEEL: PartStyle = { region: Region.STEEL };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.18, 0.18, 0.19] };
const GLASS: PartStyle = { region: Region.SCREEN, color: [0.55, 0.62, 0.65] };
const BRASS: PartStyle = { region: Region.STEEL, color: [0.95, 0.72, 0.36] };
const PLANK: PartStyle = { region: Region.WOOD_LIGHT, color: [0.62, 0.52, 0.42] };

export type LeafStyle = "green" | "cream" | "wood" | "metal" | "blue" | "glass";

interface LeafOpts {
  body: PartStyle;
  /** fenêtre : [x0, y0, x1, y1] en fraction de largeur / mètres, ou null */
  window: [number, number, number, number] | null;
  kick: boolean;
  /** nervures horizontales (portes métalliques) */
  ribs?: boolean;
  /** cadre alu (portes vitrées) */
  frame?: boolean;
}

const LEAVES: Record<LeafStyle, LeafOpts> = {
  green: { body: { region: Region.PAINTED_METAL, color: [0.55, 0.68, 0.58] }, window: [0.3, 1.3, 0.7, 1.8], kick: true },
  cream: { body: { region: Region.PAINTED_METAL, color: [0.84, 0.8, 0.68] }, window: null, kick: true },
  wood: { body: { region: Region.WOOD_LIGHT, color: [0.85, 0.72, 0.58] }, window: null, kick: false },
  metal: { body: { region: Region.PAINTED_METAL, color: [0.42, 0.45, 0.46] }, window: null, kick: false, ribs: true },
  blue: { body: { region: Region.PAINTED_METAL, color: [0.5, 0.6, 0.72] }, window: [0.2, 1.15, 0.8, 1.85], kick: true },
  glass: { body: { region: Region.STEEL, color: [0.55, 0.57, 0.6] }, window: [0.1, 0.35, 0.9, 2.05], kick: false, frame: true },
};

function leafBuilder(style: LeafStyle, H: number): (k: ModelKit) => void {
  const o = LEAVES[style];
  return (k) => {
    k.groundAO = false;
    const b = o.body;
    if (o.window) {
      const [wx0, wy0, wx1, wy1] = o.window;
      k.boxMM(0, 0, -HT, 1, wy0, HT, b);
      k.boxMM(0, wy1, -HT, 1, H, HT, b);
      k.boxMM(0, wy0, -HT, wx0, wy1, HT, b);
      k.boxMM(wx1, wy0, -HT, 1, wy1, HT, b);
      k.boxMM(wx0, wy0, -0.005, wx1, wy1, 0.005, GLASS);
      // parclose
      const f: PartStyle = o.frame ? STEEL : DARK;
      for (const s of [-1, 1]) {
        const z0 = s > 0 ? HT : -HT - 0.008;
        const z1 = s > 0 ? HT + 0.008 : -HT;
        k.boxMM(wx0 - 0.015, wy0 - 0.015, z0, wx1 + 0.015, wy0, z1, f);
        k.boxMM(wx0 - 0.015, wy1, z0, wx1 + 0.015, wy1 + 0.015, z1, f);
        k.boxMM(wx0 - 0.015, wy0, z0, wx0, wy1, z1, f);
        k.boxMM(wx1, wy0, z0, wx1 + 0.015, wy1, z1, f);
      }
    } else {
      k.boxMM(0, 0, -HT, 1, H, HT, b);
    }
    if (o.kick) {
      for (const s of [-1, 1]) k.boxMM(0.02, 0.02, s > 0 ? HT : -HT - 0.003, 0.98, 0.26, s > 0 ? HT + 0.003 : -HT, STEEL);
    }
    if (o.ribs) {
      for (let i = 0; i < 4; i++) {
        const y = 0.35 + i * 0.45;
        for (const s of [-1, 1]) k.boxMM(0.06, y, s > 0 ? HT : -HT - 0.012, 0.94, y + 0.05, s > 0 ? HT + 0.012 : -HT, b);
      }
      // grille de ventilation basse
      for (let i = 0; i < 5; i++) k.boxMM(0.25, 0.1 + i * 0.035, -HT - 0.004, 0.75, 0.115 + i * 0.035, HT + 0.004, DARK);
    }
  };
}

export function leafPropId(style: LeafStyle, double: boolean): string {
  return `leaf_${style}${double ? "_d" : ""}`;
}

/** Hauteur des vantaux (porte simple / double). */
export const LEAF_H = { single: 2.12, double: 2.27 };

// ------------------------------------------------------------------ poignées (pivot : axe de la poignée, y = 0)

function lever(k: ModelKit, withKey: boolean): void {
  k.groundAO = false;
  for (const s of [-1, 1]) {
    const z = s * HT;
    k.boxMM(-0.025, -0.1, s > 0 ? z : z - 0.006, 0.025, 0.06, s > 0 ? z + 0.006 : z, STEEL);
    k.cylinder([0, 0, z], [0, 0, z + s * 0.05], 0.011, 8, STEEL);
    k.cylinder([0, 0, z + s * 0.05], [-0.12, 0, z + s * 0.055], 0.01, 8, STEEL);
    if (withKey) k.cylinder([0, -0.07, z], [0, -0.07, z + s * 0.012], 0.013, 8, BRASS);
  }
}

function pushPlates(k: ModelKit): void {
  k.groundAO = false;
  for (const s of [-1, 1]) k.boxMM(-0.05, 0.05, s > 0 ? HT : -HT - 0.003, 0.05, 0.4, s > 0 ? HT + 0.003 : -HT, STEEL);
}

/** Barre anti-panique (face +z) ; face -z lisse. Pivot au centre du vantail. */
function pushBar(k: ModelKit): void {
  k.groundAO = false;
  for (const x of [-0.36, 0.36]) k.boxMM(x - 0.03, -0.05, HT, x + 0.03, 0.05, HT + 0.08, DARK);
  k.boxMM(-0.36, -0.03, HT + 0.05, 0.36, 0.03, HT + 0.09, { region: Region.PAINTED_METAL, color: [0.75, 0.12, 0.1] });
}

/** Poignées de porte vitrée (barres verticales des deux côtés). */
function glassBars(k: ModelKit): void {
  k.groundAO = false;
  for (const s of [-1, 1]) {
    const z = s * HT;
    k.cylinder([0, -0.3, z + s * 0.06], [0, 0.4, z + s * 0.06], 0.014, 8, STEEL);
    k.cylinder([0, -0.25, z], [0, -0.25, z + s * 0.06], 0.01, 6, STEEL);
    k.cylinder([0, 0.35, z], [0, 0.35, z + s * 0.06], 0.01, 6, STEEL);
  }
}

// ------------------------------------------------------------------ verrous visibles

/** Planches clouées en travers (largeur unitaire ±0.5, mise à l'échelle ; face arrière contre le mur en z = 0). */
function planks(k: ModelKit): void {
  const T = 0.028;
  const boards: Array<[number, number, number]> = [
    [0.55, 0.28, 0.12],
    [1.15, -0.22, 0.0],
    [1.75, 0.18, -0.08],
  ];
  for (const [y, a, dz] of boards) {
    k.push().translate(0, y, T / 2 + 0.005 + Math.abs(dz) * 0.1).rotateZ(a);
    k.boxMM(-0.5, -0.08, -T / 2, 0.5, 0.08, T / 2, PLANK);
    for (const x of [-0.45, 0.45]) k.boxMM(x - 0.008, -0.01, T / 2, x + 0.008, 0.01, T / 2 + 0.006, STEEL);
    k.pop();
  }
}

/** Planches arrachées, en tas au pied du mur. */
function planksFallen(k: ModelKit): void {
  const T = 0.028;
  const boards: Array<[number, number, number, number]> = [
    [0.0, 0.02, 0.2, 0.1],
    [0.1, 0.05, -0.1, -0.25],
    [-0.1, 0.08, 0.05, 0.4],
  ];
  for (const [x, y, z, a] of boards) {
    k.push().translate(x, y + T / 2, z).rotateY(a);
    k.boxMM(-0.62, -T / 2, -0.08, 0.62, T / 2, 0.08, PLANK);
    k.pop();
  }
}

/** Chaîne + cadenas autour de la poignée (pivot : poignée, face +z). */
function chainLock(k: ModelKit): void {
  k.groundAO = false;
  const link: PartStyle = { region: Region.STEEL, color: [0.6, 0.6, 0.62] };
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push([-0.16 + t * 0.32, Math.sin(t * Math.PI * 2) * 0.05 - 0.02, HT + 0.03 + Math.sin(t * Math.PI) * 0.02]);
  }
  k.tube(pts, 0.009, 5, link);
  const pts2: Array<[number, number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts2.push([-0.14 + t * 0.28, 0.06 - Math.sin(t * Math.PI) * 0.04, HT + 0.025]);
  }
  k.tube(pts2, 0.009, 5, link);
  // cadenas
  k.boxMM(-0.035, -0.2, HT + 0.03, 0.035, -0.12, HT + 0.06, BRASS);
  k.tube(
    [
      [-0.022, -0.12, HT + 0.045],
      [-0.022, -0.08, HT + 0.045],
      [0.022, -0.08, HT + 0.045],
      [0.022, -0.12, HT + 0.045],
    ],
    0.006,
    5,
    STEEL,
  );
}

/** Chaîne coupée au sol. */
function chainCut(k: ModelKit): void {
  const link: PartStyle = { region: Region.STEEL, color: [0.55, 0.55, 0.57] };
  k.tube(
    [
      [-0.3, 0.01, 0],
      [-0.15, 0.01, 0.08],
      [0.0, 0.01, 0.02],
      [0.12, 0.01, 0.12],
    ],
    0.009,
    5,
    link,
  );
  k.tube(
    [
      [0.18, 0.01, -0.1],
      [0.3, 0.01, 0.0],
    ],
    0.009,
    5,
    link,
  );
  k.boxMM(0.25, 0, 0.1, 0.32, 0.03, 0.18, BRASS);
}

/** Porte condamnée : tôle rivetée + deux planches (largeur unitaire, contre le mur). */
function sealedPlate(k: ModelKit): void {
  k.boxMM(-0.5, 0.0, 0.0, 0.5, 2.15, 0.012, { region: Region.RUST });
  for (const y of [0.1, 1.05, 2.05]) for (const x of [-0.45, 0, 0.45]) k.boxMM(x - 0.01, y - 0.01, 0.012, x + 0.01, y + 0.01, 0.018, STEEL);
  k.push().translate(0, 1.1, 0.03).rotateZ(0.9);
  k.boxMM(-0.75, -0.08, -0.014, 0.75, 0.08, 0.014, PLANK);
  k.pop();
  k.push().translate(0, 1.1, 0.06).rotateZ(-0.9);
  k.boxMM(-0.75, -0.08, -0.014, 0.75, 0.08, 0.014, PLANK);
  k.pop();
}

/** Plaque émaillée « accès réservé » d'une porte de service (pivot : sur le mur, face +z). */
function serviceSign(k: ModelKit): void {
  k.boxMM(-0.2, 1.42, 0.0, 0.2, 1.68, 0.008, { region: Region.WHITE, color: [0.92, 0.9, 0.84] });
  k.boxMM(-0.2, 1.6, 0.008, 0.2, 1.68, 0.01, { region: Region.PAINTED_METAL, color: [0.7, 0.08, 0.06] });
  k.boxMM(-0.2, 1.42, 0.008, 0.2, 1.45, 0.01, { region: Region.PAINTED_METAL, color: [0.1, 0.2, 0.5] });
  for (let i = 0; i < 3; i++) k.boxMM(-0.15, 1.5 + i * 0.03, 0.008, 0.15 - i * 0.04, 1.515 + i * 0.03, 0.0095, DARK);
  // serrure à carré (clé de service)
  k.boxMM(-0.03, 0.98, 0.0, 0.03, 1.08, 0.02, STEEL);
}

/** Ventouse électromagnétique au-dessus des portes vitrées (pivot : sous le linteau, face +z). */
function maglock(k: ModelKit): void {
  k.boxMM(-0.13, -0.06, 0.0, 0.13, 0.0, 0.07, DARK);
  k.boxMM(-0.12, -0.075, 0.0, 0.12, -0.06, 0.06, STEEL);
  k.boxMM(-0.05, -0.04, 0.07, 0.05, -0.02, 0.072, { region: Region.PAPER, color: [0.9, 0.8, 0.2] });
}

export function doorPropDefs(): PropDef[] {
  const defs: PropDef[] = [];
  for (const style of Object.keys(LEAVES) as LeafStyle[]) {
    defs.push({ id: leafPropId(style, false), shadow: true, build: leafBuilder(style, LEAF_H.single) });
    defs.push({ id: leafPropId(style, true), shadow: true, build: leafBuilder(style, LEAF_H.double) });
  }
  defs.push({ id: "handle_lever", shadow: false, build: (k) => lever(k, false) });
  defs.push({ id: "handle_key", shadow: false, build: (k) => lever(k, true) });
  defs.push({ id: "handle_plates", shadow: false, build: pushPlates });
  defs.push({ id: "handle_pushbar", shadow: false, build: pushBar });
  defs.push({ id: "handle_glass", shadow: false, build: glassBars });
  defs.push({ id: "planks", shadow: true, build: planks });
  defs.push({ id: "planks_fallen", shadow: false, build: planksFallen });
  defs.push({ id: "chain_lock", shadow: false, build: chainLock });
  defs.push({ id: "chain_cut", shadow: false, build: chainCut });
  defs.push({ id: "sealed_plate", shadow: true, build: sealedPlate });
  defs.push({ id: "maglock", shadow: false, build: maglock });
  defs.push({ id: "service_sign", shadow: false, build: serviceSign });
  return defs;
}
