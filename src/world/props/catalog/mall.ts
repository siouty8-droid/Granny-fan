import { CollisionMask } from "../../../physics/Collider";
import { Region, type PartStyle } from "../ModelKit";
import type { PropDef } from "../PropSystem";

const STEEL: PartStyle = { region: Region.STEEL };
const CHROME: PartStyle = { region: Region.STEEL, color: [1.15, 1.15, 1.18] };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.18, 0.19, 0.2] };
const WHITE: PartStyle = { region: Region.WHITE };
const GLASS: PartStyle = { region: Region.SCREEN, color: [1.3, 1.35, 1.4] };
const SCREEN: PartStyle = { region: Region.SCREEN };
const RUBBER: PartStyle = { region: Region.RUBBER };
const CARD: PartStyle = { region: Region.CARDBOARD };
const WOOD: PartStyle = { region: Region.WOOD_LIGHT, uv: 0.7 };
const plastic = (r: number, g: number, b: number): PartStyle => ({ region: Region.PLASTIC, color: [r, g, b] });
const fabric = (r: number, g: number, b: number): PartStyle => ({ region: Region.FABRIC, color: [r, g, b] });
const paint = (r: number, g: number, b: number): PartStyle => ({ region: Region.PAINTED_METAL, color: [r, g, b] });

/** Couleurs de produits / vêtements (déterministes). */
const PALETTE: Array<[number, number, number]> = [
  [0.75, 0.2, 0.18],
  [0.2, 0.35, 0.65],
  [0.85, 0.75, 0.3],
  [0.25, 0.55, 0.35],
  [0.85, 0.85, 0.82],
  [0.15, 0.15, 0.17],
  [0.6, 0.35, 0.55],
  [0.9, 0.5, 0.2],
];
const pal = (i: number): [number, number, number] => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]!;

// =============================================================================
//  Boutiques
// =============================================================================

/** Mannequin de vitrine (sans visage, plâtre blanc écaillé) sur pied chromé. */
function mannequinModel(headless: boolean, pose: number): PropDef["build"] {
  return (k, lod) => {
    const skin: PartStyle = { region: Region.WHITE, color: [0.92, 0.9, 0.86] };
    const n = lod === 0 ? 10 : 6;
    k.cylinder([0, 0, 0], [0, 0.03, 0], 0.22, 14, CHROME);
    k.cylinder([0, 0.03, 0], [0, 0.95, 0], 0.015, 6, CHROME);
    // jambes, bassin, torse, épaules
    for (const s of [-1, 1]) k.cylinder([0.09 * s, 0.98, 0], [0.1 * s + pose * s * 0.03, 0.08, 0.02 * s * pose], 0.065, n, skin, true, 0.045);
    k.sphere([0, 1.0, 0], 0.16, n, skin, 0.75);
    k.cylinder([0, 1.0, 0], [0, 1.42, 0.01], 0.13, n, skin, true, 0.16);
    k.sphere([0, 1.43, 0.01], 0.17, n, skin, 0.55);
    // bras (un levé si pose)
    k.cylinder([-0.19, 1.43, 0], [-0.26, 0.9, 0.05], 0.045, n, skin, true, 0.035);
    if (pose > 0.5) k.cylinder([0.19, 1.43, 0], [0.34, 1.82, 0.08], 0.045, n, skin, true, 0.035);
    else k.cylinder([0.19, 1.43, 0], [0.27, 0.9, 0.04], 0.045, n, skin, true, 0.035);
    if (!headless) {
      k.cylinder([0, 1.5, 0.01], [0, 1.6, 0.02], 0.05, n, skin);
      k.sphere([0, 1.71, 0.03], 0.11, n, skin, 1.25);
    }
    // vêtement : robe / veste (tissu)
    const c = pal(Math.round(pose * 7) + (headless ? 3 : 0));
    k.cylinder([0, 0.62, 0], [0, 1.45, 0.01], 0.215, n, fabric(c[0], c[1], c[2]), false, 0.17);
  };
}

export const mannequin: PropDef = { id: "mannequin", lod: true, lodDistance: 10, shadow: true, colliders: [[-0.22, 0, -0.22, 0.22, 1.85, 0.22]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.SIGHT, build: mannequinModel(false, 0) };
export const mannequinPose: PropDef = { id: "mannequin_pose", lod: true, lodDistance: 10, shadow: true, colliders: [[-0.22, 0, -0.22, 0.22, 1.85, 0.22]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.SIGHT, build: mannequinModel(false, 1) };
export const mannequinHeadless: PropDef = { id: "mannequin_headless", lod: true, lodDistance: 10, shadow: true, colliders: [[-0.22, 0, -0.22, 0.22, 1.55, 0.22]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.SIGHT, build: mannequinModel(true, 0.3) };

/** Portant chromé avec vêtements sur cintres. */
export const clothesRack: PropDef = {
  id: "clothes_rack",
  lod: true,
  lodDistance: 11,
  shadow: true,
  colliders: [[-0.75, 0, -0.3, 0.75, 1.5, 0.3]],
  occluder: [[-0.7, 0.6, -0.2, 0.7, 1.45, 0.2]],
  build(k, lod) {
    for (const x of [-0.72, 0.72]) {
      k.tube([[x, 0.02, 0], [x, 1.5, 0]], 0.015, 6, CHROME);
      k.boxMM(x - 0.03, 0, -0.28, x + 0.03, 0.03, 0.28, CHROME);
    }
    k.tube([[-0.72, 1.5, 0], [0.72, 1.5, 0]], 0.014, 6, CHROME);
    const n = lod === 0 ? 11 : 6;
    for (let i = 0; i < n; i++) {
      const x = -0.62 + (1.24 * i) / (n - 1);
      if ((i * 7) % 5 === 3) continue;
      const c = pal(i * 3 + 1);
      const len = 0.7 + ((i * 5) % 3) * 0.12;
      k.boxMM(x - 0.025, 1.47 - len, -0.24, x + 0.025, 1.47, 0.24, fabric(c[0], c[1], c[2]));
    }
  },
};

/** Gondole double face (hypermarché) : produits en rayon des deux côtés. */
export const gondola: PropDef = {
  id: "gondola",
  lod: true,
  lodDistance: 14,
  shadow: true,
  colliders: [[-1.0, 0, -0.5, 1.0, 1.65, 0.5]],
  occluder: [[-1.0, 0, -0.45, 1.0, 1.65, 0.45]],
  mask: CollisionMask.ALL,
  build(k, lod) {
    const frame = paint(0.82, 0.82, 0.8);
    k.boxMM(-1.0, 0, -0.04, 1.0, 1.65, 0.04, frame);
    k.boxMM(-1.0, 0, -0.5, 1.0, 0.12, 0.5, frame);
    for (let s = 0; s < 4; s++) {
      const y = 0.12 + s * 0.38;
      for (const side of [-1, 1]) {
        k.boxMM(-1.0, y, side < 0 ? -0.48 : 0.04, 1.0, y + 0.02, side < 0 ? -0.04 : 0.48, frame);
        if (lod === 1 && s % 2) continue;
        let x = -0.96;
        let i = 0;
        while (x < 0.9) {
          const w = 0.14 + ((s * 5 + i * 3 + side) % 4) * 0.04;
          if ((s * 13 + i * 7 + (side > 0 ? 3 : 0)) % 6 !== 0) {
            const c = pal(s * 2 + i + (side > 0 ? 4 : 0));
            const h = 0.18 + ((i + s) % 3) * 0.05;
            const st = (i + s) % 4 === 0 ? CARD : plastic(c[0], c[1], c[2]);
            k.boxMM(x, y + 0.02, side < 0 ? -0.44 : 0.08, x + w - 0.015, y + 0.02 + h, side < 0 ? -0.08 : 0.44, st);
          }
          x += w;
          i++;
        }
      }
    }
  },
};

/** Meuble frigorifique vitré (produits frais), éteint. */
export const fridgeCase: PropDef = {
  id: "fridge_case",
  shadow: true,
  colliders: [[-1.0, 0, -0.45, 1.0, 2.0, 0.45]],
  occluder: [[-1.0, 0, -0.45, 1.0, 2.0, 0.4]],
  mask: CollisionMask.ALL,
  build(k) {
    const body = paint(0.85, 0.86, 0.86);
    k.boxMM(-1.0, 0, -0.45, 1.0, 0.2, 0.42, DARK);
    k.boxMM(-1.0, 0.2, -0.45, 1.0, 2.0, -0.38, body);
    k.boxMM(-1.0, 1.85, -0.45, 1.0, 2.0, 0.42, body);
    for (const x of [-1.0, 0.97]) k.boxMM(x, 0.2, -0.45, x + 0.03, 1.85, 0.42, body);
    for (let s = 0; s < 4; s++) {
      const y = 0.3 + s * 0.38;
      k.boxMM(-0.97, y, -0.38, 0.97, y + 0.02, 0.3, STEEL);
      for (let i = 0; i < 9; i++) {
        if ((i * 3 + s * 5) % 7 === 0) continue;
        const c = pal(i + s * 3);
        k.boxMM(-0.92 + i * 0.205, y + 0.02, -0.3, -0.76 + i * 0.205, y + 0.2, 0.2, plastic(c[0] * 0.8 + 0.2, c[1] * 0.8 + 0.2, c[2] * 0.8 + 0.2));
      }
    }
    for (let d = 0; d < 3; d++) k.boxMM(-0.97 + d * 0.65, 0.2, 0.4, -0.35 + d * 0.65, 1.85, 0.42, GLASS);
  },
};

/** Caisse enregistreuse : comptoir, tapis, terminal. */
export const checkout: PropDef = {
  id: "checkout",
  shadow: true,
  colliders: [[-1.0, 0, -0.42, 1.0, 0.95, 0.42]],
  occluder: [[-1.0, 0, -0.4, 1.0, 0.9, 0.4]],
  build(k) {
    const body = paint(0.72, 0.15, 0.12);
    k.boxMM(-1.0, 0, -0.42, 1.0, 0.85, 0.42, body);
    k.boxMM(-0.98, 0.85, -0.38, 0.4, 0.88, 0.1, RUBBER);
    k.boxMM(0.45, 0.85, -0.4, 0.98, 0.9, 0.4, STEEL);
    k.boxMM(0.55, 0.9, -0.1, 0.9, 1.0, 0.25, DARK);
    k.boxMM(0.6, 1.0, 0.0, 0.85, 1.25, 0.04, DARK);
    k.boxMM(0.62, 1.03, 0.04, 0.83, 1.22, 0.05, SCREEN);
    k.tube([[-0.2, 0.88, -0.4], [-0.2, 1.9, -0.4]], 0.02, 6, STEEL);
    k.boxMM(-0.4, 1.9, -0.45, 0.0, 2.1, -0.35, plastic(0.95, 0.95, 0.9));
  },
};

/** Chariot de supermarché. */
export const cart: PropDef = {
  id: "cart",
  lod: true,
  lodDistance: 9,
  shadow: true,
  colliders: [[-0.3, 0, -0.5, 0.3, 1.0, 0.5]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  build(k, lod) {
    const n = lod === 0 ? 6 : 4;
    // panier en fil (barreaux)
    for (const x of [-0.27, 0.27]) {
      k.tube([[x, 0.45, -0.4], [x, 0.95, -0.45], [x, 0.95, 0.45], [x, 0.5, 0.35], [x, 0.45, -0.4]], 0.01, n, CHROME);
      for (let z = -0.35; z <= 0.36; z += 0.1) k.tube([[x, 0.47, z], [x, 0.95, z - 0.03]], 0.006, 4, CHROME);
    }
    for (let x = -0.27; x <= 0.28; x += 0.09) {
      k.tube([[x, 0.45, -0.4], [x, 0.5, 0.35]], 0.006, 4, CHROME);
      k.tube([[x, 0.95, 0.45], [x, 0.5, 0.35]], 0.006, 4, CHROME);
    }
    k.tube([[-0.27, 0.95, -0.45], [0.27, 0.95, -0.45]], 0.01, n, CHROME);
    k.tube([[-0.25, 1.02, -0.55], [0.25, 1.02, -0.55]], 0.02, n, plastic(0.75, 0.12, 0.1));
    for (const x of [-0.25, 0.25]) k.tube([[x, 0.15, -0.45], [x, 0.45, -0.4], [x, 1.02, -0.55]], 0.012, n, CHROME);
    k.tube([[-0.25, 0.15, -0.45], [-0.2, 0.15, 0.4], [0.2, 0.15, 0.4], [0.25, 0.15, -0.45]], 0.012, n, CHROME);
    for (const [x, z] of [[-0.24, -0.42], [0.24, -0.42], [-0.19, 0.38], [0.19, 0.38]] as Array<[number, number]>) {
      k.cylinder([x - 0.015, 0.06, z], [x + 0.015, 0.06, z], 0.06, 8, RUBBER);
    }
  },
};

/** Vitrine-comptoir de bijouterie (verre brisé par endroits). */
export const displayCase: PropDef = {
  id: "display_case",
  shadow: true,
  colliders: [[-0.8, 0, -0.3, 0.8, 1.0, 0.3]],
  occluder: [[-0.8, 0, -0.3, 0.8, 0.7, 0.3]],
  build(k) {
    const wood = { region: Region.WOOD_DARK, uv: 0.7 } as PartStyle;
    k.boxMM(-0.8, 0, -0.3, 0.8, 0.7, 0.3, wood);
    k.boxMM(-0.78, 0.7, -0.28, 0.78, 0.72, 0.28, { region: Region.FABRIC, color: [0.25, 0.05, 0.1] });
    k.boxMM(-0.8, 0.98, -0.3, 0.1, 1.0, 0.3, GLASS);
    for (const x of [-0.8, 0.78]) k.boxMM(x, 0.7, -0.3, x + 0.02, 1.0, 0.3, GLASS);
    k.boxMM(-0.8, 0.7, 0.28, 0.8, 1.0, 0.3, GLASS);
    for (let i = 0; i < 5; i++) k.boxMM(-0.65 + i * 0.3, 0.72, -0.1, -0.55 + i * 0.3, 0.75, 0.0, { region: Region.STEEL, color: [1.3, 1.1, 0.6] });
  },
};

/** Table de présentation (téléphones, chaussures, livres…). */
function displayTableModel(kind: "phones" | "shoes" | "books"): PropDef["build"] {
  return (k) => {
    const top = kind === "books" ? ({ region: Region.WOOD_DARK, uv: 0.7 } as PartStyle) : WHITE;
    k.boxMM(-0.8, 0.72, -0.45, 0.8, 0.8, 0.45, top);
    k.boxMM(-0.75, 0, -0.4, 0.75, 0.72, 0.4, kind === "books" ? WOOD : paint(0.3, 0.3, 0.32));
    for (let i = 0; i < 6; i++) {
      const x = -0.6 + (i % 3) * 0.6;
      const z = i < 3 ? -0.2 : 0.2;
      if (kind === "phones") {
        k.boxMM(x - 0.05, 0.8, z - 0.08, x + 0.05, 0.82, z + 0.08, DARK);
        k.boxMM(x - 0.04, 0.82, z - 0.07, x + 0.04, 0.825, z + 0.07, SCREEN);
      } else if (kind === "shoes") {
        const c = pal(i * 2 + 1);
        k.boxMM(x - 0.06, 0.8, z - 0.14, x + 0.06, 0.88, z + 0.14, { region: Region.VINYL, color: c });
      } else {
        const c = pal(i + 2);
        k.boxMM(x - 0.15, 0.8, z - 0.11, x + 0.15, 0.84 + (i % 3) * 0.03, z + 0.11, { region: Region.PAPER, color: c });
      }
    }
  };
}
const tableProp = (id: string, kind: "phones" | "shoes" | "books"): PropDef => ({ id, shadow: true, colliders: [[-0.8, 0, -0.45, 0.8, 0.85, 0.45]], occluder: [[-0.75, 0, -0.4, 0.75, 0.8, 0.4]], build: displayTableModel(kind) });
export const tablePhones = tableProp("table_phones", "phones");
export const tableShoes = tableProp("table_shoes", "shoes");
export const tableBooks = tableProp("table_books", "books");

/** Meuble à téléviseurs (Électro Max). */
export const tvStand: PropDef = {
  id: "tv_stand",
  shadow: true,
  colliders: [[-0.9, 0, -0.3, 0.9, 1.9, 0.3]],
  occluder: [[-0.9, 0, -0.3, 0.9, 1.9, 0.25]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-0.9, 0, -0.3, 0.9, 0.6, 0.3, DARK);
    k.boxMM(-0.9, 0.6, -0.3, 0.9, 1.9, -0.25, DARK);
    for (const [x, y, w, h] of [[-0.45, 0.65, 0.8, 0.5], [0.45, 0.65, 0.8, 0.5], [0, 1.25, 1.5, 0.6]] as Array<[number, number, number, number]>) {
      k.boxMM(x - w / 2, y, -0.22, x + w / 2, y + h, -0.16, plastic(0.08, 0.08, 0.09));
      k.boxMM(x - w / 2 + 0.02, y + 0.02, -0.16, x + w / 2 - 0.02, y + h - 0.02, -0.155, SCREEN);
    }
  },
};

/** Banc de galerie (bois sur pieds acier). */
export const mallBench: PropDef = {
  id: "mall_bench",
  shadow: true,
  colliders: [[-0.95, 0, -0.3, 0.95, 0.5, 0.3]],
  build(k) {
    for (let i = 0; i < 4; i++) k.boxMM(-0.95, 0.42, -0.28 + i * 0.145, 0.95, 0.46, -0.16 + i * 0.145, WOOD);
    for (const x of [-0.7, 0.7]) {
      k.boxMM(x - 0.03, 0, -0.25, x + 0.03, 0.42, -0.2, STEEL);
      k.boxMM(x - 0.03, 0, 0.2, x + 0.03, 0.42, 0.25, STEEL);
      k.boxMM(x - 0.03, 0.38, -0.25, x + 0.03, 0.42, 0.25, STEEL);
    }
  },
};

/** Poubelle de galerie (cylindre inox). */
export const mallBin: PropDef = {
  id: "mall_bin",
  shadow: true,
  colliders: [[-0.22, 0, -0.22, 0.22, 0.9, 0.22]],
  build(k) {
    k.cylinder([0, 0, 0], [0, 0.85, 0], 0.22, 14, STEEL, true);
    k.cylinder([0, 0.85, 0], [0, 0.92, 0], 0.24, 14, DARK, true);
  },
};

/** Jardinière carrée avec plante morte. */
export const planter: PropDef = {
  id: "planter",
  shadow: true,
  colliders: [[-0.6, 0, -0.6, 0.6, 0.6, 0.6]],
  build(k) {
    k.boxMM(-0.6, 0, -0.6, 0.6, 0.55, 0.6, paint(0.55, 0.52, 0.48));
    k.boxMM(-0.55, 0.5, -0.55, 0.55, 0.52, 0.55, { region: Region.CARDBOARD, color: [0.35, 0.25, 0.15] });
    const stem: PartStyle = { region: Region.WOOD_DARK, color: [0.45, 0.35, 0.25] };
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      k.tube([[0, 0.52, 0], [Math.cos(a) * 0.25, 1.2 + (i % 3) * 0.2, Math.sin(a) * 0.25], [Math.cos(a) * 0.45, 1.5 + (i % 2) * 0.25, Math.sin(a) * 0.4]], 0.02, 4, stem);
    }
  },
};

/** Rangée de fauteuils de cinéma (6 places, velours rouge). */
export const cinemaRow: PropDef = {
  id: "cinema_row",
  lod: true,
  lodDistance: 12,
  shadow: true,
  colliders: [[-1.8, 0, -0.4, 1.8, 1.0, 0.4]],
  occluder: [[-1.8, 0.4, -0.35, 1.8, 1.0, 0.35]],
  build(k, lod) {
    const velvet = fabric(0.45, 0.06, 0.08);
    for (let i = 0; i < 6; i++) {
      const x = -1.5 + i * 0.6;
      const up = (i * 5) % 7 === 2;
      if (up) {
        k.boxMM(x - 0.25, 0.2, -0.3, x + 0.25, 0.65, -0.18, velvet);
      } else {
        k.boxMM(x - 0.25, 0.4, -0.25, x + 0.25, 0.5, 0.2, velvet);
      }
      k.push().translate(x, 0.45, -0.28).rotateX(-0.12);
      k.boxMM(-0.25, 0, -0.08, 0.25, 0.6, 0.04, velvet);
      k.pop();
      if (lod === 0) k.boxMM(x + 0.27, 0.0, -0.32, x + 0.33, 0.68, 0.22, DARK);
    }
    k.boxMM(-1.83, 0, -0.32, -1.77, 0.68, 0.22, DARK);
  },
};

/** Comptoir de fast-food (inox + caisse). */
export const foodCounter: PropDef = {
  id: "food_counter",
  shadow: true,
  colliders: [[-1.5, 0, -0.4, 1.5, 1.05, 0.4]],
  occluder: [[-1.5, 0, -0.4, 1.5, 1.0, 0.4]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-1.5, 0, -0.4, 1.5, 1.0, 0.4, STEEL);
    k.boxMM(-1.52, 1.0, -0.42, 1.52, 1.05, 0.42, paint(0.75, 0.15, 0.12));
    for (const x of [-0.8, 0.6]) {
      k.boxMM(x - 0.2, 1.05, -0.1, x + 0.2, 1.15, 0.2, DARK);
      k.boxMM(x - 0.15, 1.15, 0.0, x + 0.15, 1.35, 0.04, DARK);
    }
    k.boxMM(-0.2, 1.05, -0.3, 0.2, 1.4, 0.0, plastic(0.9, 0.85, 0.7));
  },
};

/** Projecteur 35 mm sur pied (cabine). */
export const projector: PropDef = {
  id: "projector",
  shadow: true,
  colliders: [[-0.4, 0, -0.6, 0.4, 1.6, 0.6]],
  build(k) {
    const body = paint(0.25, 0.3, 0.32);
    k.boxMM(-0.3, 0, -0.4, 0.3, 0.9, 0.4, body);
    k.boxMM(-0.22, 0.9, -0.5, 0.22, 1.3, 0.35, body);
    k.cylinder([0, 1.1, 0.35], [0, 1.1, 0.6], 0.08, 10, DARK);
    for (const z of [-0.35, 0.15]) k.cylinder([-0.03, 1.55, z], [0.03, 1.55, z], 0.32, 18, STEEL);
  },
};

/** Palette chargée de cartons (réserves, quai). */
export const pallet: PropDef = {
  id: "pallet",
  shadow: true,
  colliders: [[-0.6, 0, -0.5, 0.6, 1.3, 0.5]],
  occluder: [[-0.6, 0, -0.5, 0.6, 1.25, 0.5]],
  build(k) {
    k.boxMM(-0.6, 0, -0.5, 0.6, 0.14, 0.5, WOOD);
    for (let i = 0; i < 6; i++) {
      const x = -0.55 + (i % 3) * 0.37;
      const y = 0.14 + Math.floor(i / 3) * 0.55;
      if (i === 5) continue;
      k.boxMM(x, y, -0.45, x + 0.35, y + 0.52, 0.0, CARD);
      k.boxMM(x, y, 0.02, x + 0.35, y + 0.52, 0.45, CARD);
    }
  },
};

/** Camion de livraison (caisse fourgon) — quai de livraison. */
export const truck: PropDef = {
  id: "truck",
  shadow: true,
  colliders: [[-1.25, 0, -4.2, 1.25, 3.4, 4.2]],
  occluder: [[-1.2, 0.5, -4.2, 1.2, 3.3, 4.2]],
  mask: CollisionMask.ALL,
  build(k) {
    const cab = paint(0.85, 0.85, 0.82);
    const box = paint(0.9, 0.9, 0.88);
    // cabine (avant = +z)
    k.boxMM(-1.15, 0.55, 2.3, 1.15, 2.5, 4.1, cab);
    k.boxMM(-1.05, 1.5, 4.1, 1.05, 2.35, 4.13, GLASS);
    for (const x of [-1.15, 1.13]) k.boxMM(x, 1.55, 2.6, x + 0.02, 2.3, 3.6, GLASS);
    k.boxMM(-1.2, 0.4, 4.05, 1.2, 0.8, 4.25, DARK);
    // caisse
    k.boxMM(-1.25, 0.8, -4.2, 1.25, 3.35, 2.2, box);
    k.boxMM(-1.26, 1.6, -3.5, -1.25, 2.3, 1.5, paint(0.1, 0.35, 0.7));
    k.boxMM(1.25, 1.6, -3.5, 1.26, 2.3, 1.5, paint(0.1, 0.35, 0.7));
    k.boxMM(-1.25, 0.55, -4.2, 1.25, 0.8, 2.3, DARK);
    for (const [x, z] of [[-1.05, 3.2], [1.05, 3.2], [-1.05, -2.6], [1.05, -2.6], [-1.05, -3.5], [1.05, -3.5]] as Array<[number, number]>) {
      k.cylinder([x - 0.15 * Math.sign(x), 0.48, z], [x + 0.15 * Math.sign(x), 0.48, z], 0.48, 14, RUBBER);
    }
  },
};

// =============================================================================
//  Métro
// =============================================================================

/** Tourniquet (portillon d'accès, bras tripode). */
export const turnstile: PropDef = {
  id: "turnstile",
  shadow: true,
  colliders: [[-0.15, 0, -0.6, 0.15, 1.0, 0.6]],
  mask: CollisionMask.ALL,
  build(k) {
    const body = paint(0.55, 0.57, 0.6);
    k.boxMM(-0.15, 0, -0.6, 0.15, 1.0, 0.6, body);
    k.boxMM(-0.13, 1.0, -0.58, 0.13, 1.03, 0.58, DARK);
    k.boxMM(-0.1, 0.85, 0.2, 0.1, 1.0, 0.4, plastic(0.9, 0.6, 0.2));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.tube([[0.15, 0.85, 0], [0.15 + 0.45, 0.85 + Math.sin(a) * 0.3, Math.cos(a) * 0.3]], 0.02, 6, STEEL);
    }
  },
};

/** Distributeur de billets. */
export const ticketMachine: PropDef = {
  id: "ticket_machine",
  shadow: true,
  colliders: [[-0.45, 0, -0.3, 0.45, 1.8, 0.3]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-0.45, 0, -0.3, 0.45, 1.8, 0.28, paint(0.12, 0.38, 0.25));
    k.boxMM(-0.3, 1.0, 0.28, 0.3, 1.5, 0.3, SCREEN);
    k.boxMM(-0.3, 0.75, 0.28, 0.3, 0.95, 0.32, DARK);
    k.boxMM(-0.2, 0.3, 0.28, 0.2, 0.42, 0.33, STEEL);
  },
};

/** Sièges de quai (coque orange, style années 80). */
export const metroBench: PropDef = {
  id: "metro_bench",
  shadow: true,
  colliders: [[-1.0, 0, -0.25, 1.0, 0.85, 0.25]],
  build(k) {
    const shell = plastic(0.9, 0.42, 0.12);
    k.boxMM(-1.0, 0.0, -0.2, 1.0, 0.08, 0.15, DARK);
    for (let i = 0; i < 4; i++) {
      const x = -0.75 + i * 0.5;
      if (i === 2) continue;
      k.boxMM(x - 0.2, 0.42, -0.2, x + 0.2, 0.46, 0.2, shell);
      k.boxMM(x - 0.2, 0.46, -0.24, x + 0.2, 0.85, -0.2, shell);
      k.boxMM(x - 0.03, 0.08, -0.1, x + 0.03, 0.42, 0.05, DARK);
    }
  },
};

/** Empreintes au sol pour le placement (largeur x, profondeur z). */
export const MALL_FOOTPRINTS: Record<string, [number, number]> = {
  mannequin: [0.5, 0.5],
  mannequin_pose: [0.6, 0.5],
  mannequin_headless: [0.5, 0.5],
  clothes_rack: [1.55, 0.6],
  gondola: [2.05, 1.05],
  fridge_case: [2.05, 0.95],
  checkout: [2.05, 0.9],
  cart: [0.65, 1.05],
  display_case: [1.65, 0.65],
  table_phones: [1.65, 0.95],
  table_shoes: [1.65, 0.95],
  table_books: [1.65, 0.95],
  tv_stand: [1.85, 0.65],
  mall_bench: [1.95, 0.65],
  mall_bin: [0.5, 0.5],
  planter: [1.25, 1.25],
  cinema_row: [3.65, 0.85],
  food_counter: [3.05, 0.85],
  projector: [0.85, 1.25],
  pallet: [1.25, 1.05],
  truck: [2.55, 8.5],
  turnstile: [0.35, 1.25],
  ticket_machine: [0.95, 0.65],
  metro_bench: [2.05, 0.55],
};

export function mallPropDefs(): PropDef[] {
  return [
    mannequin,
    mannequinPose,
    mannequinHeadless,
    clothesRack,
    gondola,
    fridgeCase,
    checkout,
    cart,
    displayCase,
    tablePhones,
    tableShoes,
    tableBooks,
    tvStand,
    mallBench,
    mallBin,
    planter,
    cinemaRow,
    foodCounter,
    projector,
    pallet,
    truck,
    turnstile,
    ticketMachine,
    metroBench,
  ];
}

