import { CollisionMask } from "../../../physics/Collider";
import { Region, type PartStyle } from "../ModelKit";
import type { PropDef } from "../PropSystem";

const STEEL: PartStyle = { region: Region.STEEL };
const DARKMETAL: PartStyle = { region: Region.PAINTED_METAL, color: [0.35, 0.36, 0.38] };
const WOOD: PartStyle = { region: Region.WOOD_LIGHT, uv: 0.7 };
const WOOD_D: PartStyle = { region: Region.WOOD_DARK, uv: 0.7 };
const PAPER: PartStyle = { region: Region.PAPER };

const plastic = (r: number, g: number, b: number): PartStyle => ({ region: Region.PLASTIC, color: [r, g, b] });

/** Chaise en plastique moulé (salle d'attente, cafétéria) — teinte par variante. */
function chairModel(color: PartStyle): PropDef["build"] {
  return (k, lod) => {
    const t = lod === 0 ? 6 : 4;
    k.boxMM(-0.22, 0.43, -0.2, 0.22, 0.47, 0.22, color);
    k.push().translate(0, 0.47, -0.2).rotateX(-0.12);
    k.boxMM(-0.22, 0.05, -0.02, 0.22, 0.45, 0.02, color);
    k.pop();
    for (const x of [-0.19, 0.19]) {
      k.tube([[x, 0, -0.17], [x, 0.44, -0.17]], 0.012, t, STEEL);
      k.tube([[x, 0, 0.19], [x, 0.44, 0.19]], 0.012, t, STEEL);
    }
  };
}

export const chairBlue: PropDef = { id: "chair_blue", lod: true, lodDistance: 9, shadow: true, colliders: [[-0.23, 0, -0.23, 0.23, 0.9, 0.23]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER, build: chairModel(plastic(0.25, 0.42, 0.7)) };
export const chairOrange: PropDef = { id: "chair_orange", lod: true, lodDistance: 9, shadow: true, colliders: [[-0.23, 0, -0.23, 0.23, 0.9, 0.23]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER, build: chairModel(plastic(0.85, 0.45, 0.15)) };

/** Rangée de 4 sièges sur poutre (salle d'attente). */
export const chairRow: PropDef = {
  id: "chair_row",
  lod: true,
  lodDistance: 12,
  shadow: true,
  colliders: [[-1.05, 0, -0.28, 1.05, 0.9, 0.28]],
  occluder: [[-1.05, 0.4, -0.25, 1.05, 0.5, 0.25]],
  build(k, lod) {
    const c = plastic(0.28, 0.45, 0.68);
    k.boxMM(-1.05, 0.34, -0.05, 1.05, 0.39, 0.05, DARKMETAL);
    for (const x of [-0.9, 0.9]) {
      k.boxMM(x - 0.03, 0, -0.25, x + 0.03, 0.35, 0.25, DARKMETAL);
    }
    for (let i = 0; i < 4; i++) {
      const x = -0.78 + i * 0.52;
      const missing = i === 2;
      if (missing) continue;
      k.boxMM(x - 0.23, 0.42, -0.22, x + 0.23, 0.46, 0.24, c);
      k.push().translate(x, 0.46, -0.22).rotateX(-0.14);
      k.boxMM(-0.23, 0.04, -0.02, 0.23, 0.44, 0.02, c);
      k.pop();
      if (lod === 0) k.boxMM(x - 0.02, 0.39, -0.1, x + 0.02, 0.42, 0.1, DARKMETAL);
    }
  },
};

/** Bureau à caissons (bureaux, secrétariat). */
export const desk: PropDef = {
  id: "desk",
  lod: true,
  shadow: true,
  colliders: [[-0.8, 0, -0.4, 0.8, 0.78, 0.4]],
  occluder: [[-0.8, 0.7, -0.4, 0.8, 0.78, 0.4], [0.35, 0, -0.38, 0.78, 0.7, 0.38]],
  build(k, lod) {
    k.boxMM(-0.8, 0.73, -0.4, 0.8, 0.77, 0.4, WOOD);
    k.boxMM(0.35, 0, -0.38, 0.78, 0.73, 0.38, WOOD);
    k.boxMM(-0.78, 0, -0.38, -0.74, 0.73, 0.38, WOOD);
    k.boxMM(-0.74, 0.3, -0.38, 0.35, 0.72, -0.36, WOOD);
    for (let i = 0; i < 3; i++) k.boxMM(0.38, 0.06 + i * 0.22, 0.38, 0.75, 0.24 + i * 0.22, 0.4, WOOD);
    if (lod === 0) {
      for (let i = 0; i < 3; i++) k.boxMM(0.5, 0.14 + i * 0.22, 0.4, 0.63, 0.16 + i * 0.22, 0.42, STEEL);
      // dossiers, papiers, vieil écran cathodique
      k.boxMM(-0.6, 0.77, -0.1, -0.25, 0.8, 0.2, PAPER);
      k.boxMM(-0.55, 0.8, -0.05, -0.3, 0.83, 0.18, { region: Region.CARDBOARD, color: [0.6, 0.55, 0.4] });
      k.boxMM(0.05, 0.77, -0.3, 0.45, 1.1, 0.05, plastic(0.8, 0.78, 0.7));
      k.boxMM(0.09, 0.82, 0.05, 0.41, 1.06, 0.07, { region: Region.SCREEN });
      k.boxMM(-0.1, 0.77, 0.1, 0.3, 0.8, 0.28, plastic(0.75, 0.73, 0.66));
    }
  },
};

/** Fauteuil de bureau à roulettes. */
export const officeChair: PropDef = {
  id: "office_chair",
  lod: true,
  shadow: true,
  colliders: [[-0.3, 0, -0.3, 0.3, 1.0, 0.3]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  build(k, lod) {
    const fab: PartStyle = { region: Region.VINYL, color: [0.2, 0.22, 0.25] };
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.cylinder([0, 0.08, 0], [Math.cos(a) * 0.3, 0.05, Math.sin(a) * 0.3], 0.018, 5, DARKMETAL, false);
      if (lod === 0) k.sphere([Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3], 0.03, 6, { region: Region.RUBBER });
    }
    k.cylinder([0, 0.08, 0], [0, 0.45, 0], 0.025, 8, STEEL);
    k.boxMM(-0.25, 0.45, -0.24, 0.25, 0.53, 0.24, fab);
    k.push().translate(0, 0.55, -0.24).rotateX(-0.15);
    k.boxMM(-0.23, 0.05, -0.04, 0.23, 0.55, 0.02, fab);
    k.pop();
  },
};

/** Armoire métallique haute (planque possible). */
export const wardrobe: PropDef = {
  id: "wardrobe",
  shadow: true,
  colliders: [[-0.5, 0, -0.3, 0.5, 2.0, 0.3]],
  mask: CollisionMask.ALL,
  build(k) {
    const body: PartStyle = { region: Region.PAINTED_METAL, color: [0.62, 0.66, 0.6] };
    k.boxMM(-0.5, 0, -0.3, 0.5, 2.0, 0.28, body);
    k.boxMM(-0.49, 0.04, 0.28, -0.01, 1.96, 0.3, body);
    k.boxMM(0.01, 0.04, 0.28, 0.49, 1.96, 0.3, body);
    k.boxMM(-0.06, 0.95, 0.3, -0.04, 1.15, 0.33, STEEL);
    k.boxMM(0.04, 0.95, 0.3, 0.06, 1.15, 0.33, STEEL);
    for (let i = 0; i < 4; i++) k.boxMM(-0.4, 1.7 - i * 0.03, 0.3, -0.1, 1.71 - i * 0.03, 0.305, DARKMETAL);
  },
};

/** Rangée de 3 casiers de vestiaire (planque possible dans le casier central). */
export const lockerBank: PropDef = {
  id: "lockers",
  shadow: true,
  colliders: [[-0.6, 0, -0.25, 0.6, 1.9, 0.25]],
  mask: CollisionMask.ALL,
  build(k) {
    const cols: PartStyle[] = [
      { region: Region.PAINTED_METAL, color: [0.45, 0.55, 0.6] },
      { region: Region.PAINTED_METAL, color: [0.5, 0.58, 0.62] },
      { region: Region.PAINTED_METAL, color: [0.42, 0.52, 0.58] },
    ];
    k.boxMM(-0.6, 0, -0.25, 0.6, 1.9, 0.23, cols[0]!);
    for (let i = 0; i < 3; i++) {
      const x = -0.4 + i * 0.4;
      k.boxMM(x - 0.19, 0.08, 0.23, x + 0.19, 1.86, 0.25, cols[i]!);
      for (let j = 0; j < 5; j++) k.boxMM(x - 0.12, 1.55 + j * 0.05, 0.25, x + 0.12, 1.57 + j * 0.05, 0.26, DARKMETAL);
      k.boxMM(x + 0.12, 0.9, 0.25, x + 0.15, 1.05, 0.28, STEEL);
      k.boxMM(x - 0.06, 1.3, 0.25, x + 0.06, 1.36, 0.255, PAPER);
    }
  },
};

/** Étagère métallique chargée de boîtes d'archives / dossiers. 1.8 m. */
export const shelf: PropDef = {
  id: "shelf",
  lod: true,
  lodDistance: 12,
  shadow: true,
  colliders: [[-0.9, 0, -0.25, 0.9, 2.2, 0.25]],
  occluder: [[-0.9, 0, -0.25, 0.9, 2.2, 0.25]],
  mask: CollisionMask.ALL,
  build(k, lod) {
    const post: PartStyle = { region: Region.PAINTED_METAL, color: [0.55, 0.58, 0.55] };
    for (const x of [-0.88, 0.88]) for (const z of [-0.23, 0.23]) k.boxMM(x - 0.02, 0, z - 0.02, x + 0.02, 2.2, z + 0.02, post);
    for (let s = 0; s < 5; s++) {
      const y = 0.08 + s * 0.5;
      k.boxMM(-0.9, y, -0.25, 0.9, y + 0.025, 0.25, post);
      if (lod === 0 || s % 2 === 0) {
        // boîtes / classeurs
        let x = -0.86;
        let i = 0;
        while (x < 0.8) {
          const w = 0.1 + ((s * 7 + i * 13) % 5) * 0.03;
          const h = 0.28 + ((s * 3 + i * 5) % 4) * 0.03;
          if ((s * 11 + i * 7) % 9 !== 0) {
            const style: PartStyle = (i + s) % 3 === 0 ? { region: Region.CARDBOARD } : { region: Region.PLASTIC, color: [[0.42, 0.47, 0.56], [0.55, 0.38, 0.33], [0.44, 0.5, 0.42], [0.68, 0.62, 0.48]][(i * 3 + s) % 4] as [number, number, number] };
            k.boxMM(x, y + 0.025, -0.2, x + w - 0.01, y + 0.025 + h, 0.18, style);
          }
          x += w;
          i++;
        }
      }
    }
  },
};

/** Table de cafétéria + 4 tabourets soudés. */
export const cafeteriaTable: PropDef = {
  id: "cafe_table",
  lod: true,
  shadow: true,
  colliders: [[-0.7, 0, -0.45, 0.7, 0.76, 0.45]],
  occluder: [[-0.7, 0.7, -0.45, 0.7, 0.76, 0.45]],
  build(k, lod) {
    const top: PartStyle = { region: Region.PLASTIC, color: [0.85, 0.82, 0.72] };
    k.boxMM(-0.7, 0.72, -0.4, 0.7, 0.76, 0.4, top);
    k.boxMM(-0.6, 0.35, -0.03, 0.6, 0.39, 0.03, DARKMETAL);
    for (const x of [-0.55, 0.55]) k.boxMM(x - 0.03, 0, -0.3, x + 0.03, 0.72, 0.3, DARKMETAL);
    for (const [x, z] of [[-0.35, -0.62], [0.35, -0.62], [-0.35, 0.62], [0.35, 0.62]] as Array<[number, number]>) {
      k.cylinder([x, 0, z], [x, 0.44, z], 0.025, lod === 0 ? 8 : 5, DARKMETAL);
      k.cylinder([x, 0.44, z], [x, 0.47, z], 0.17, lod === 0 ? 12 : 6, plastic(0.8, 0.3, 0.2));
    }
    if (lod === 0) {
      k.boxMM(-0.3, 0.76, -0.2, 0.05, 0.78, 0.05, { region: Region.PLASTIC, color: [0.9, 0.9, 0.85] });
      k.cylinder([0.3, 0.76, 0.1], [0.3, 0.86, 0.1], 0.035, 8, { region: Region.PLASTIC, color: [0.9, 0.9, 0.9] });
    }
  },
};

/** Banc d'église. 3 m. */
export const pew: PropDef = {
  id: "pew",
  lod: true,
  shadow: true,
  colliders: [[-1.5, 0, -0.3, 1.5, 0.95, 0.3]],
  occluder: [[-1.5, 0.4, -0.3, 1.5, 0.95, 0.3]],
  build(k) {
    k.boxMM(-1.5, 0.42, -0.25, 1.5, 0.46, 0.2, WOOD_D);
    k.push().translate(0, 0.46, -0.25).rotateX(-0.1);
    k.boxMM(-1.5, 0, -0.03, 1.5, 0.5, 0.0, WOOD_D);
    k.pop();
    for (const x of [-1.48, 0, 1.48]) k.boxMM(x - 0.03, 0, -0.28, x + 0.03, 0.95, 0.28, WOOD_D);
    k.boxMM(-1.5, 0.08, 0.15, 1.5, 0.12, 0.3, WOOD_D);
  },
};

/** Distributeur de boissons (façade éclairée cassée). */
export const vending: PropDef = {
  id: "vending",
  shadow: true,
  colliders: [[-0.45, 0, -0.4, 0.45, 1.9, 0.4]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-0.45, 0, -0.4, 0.45, 1.9, 0.38, { region: Region.PAINTED_METAL, color: [0.7, 0.12, 0.1] });
    k.boxMM(-0.4, 0.5, 0.38, 0.15, 1.8, 0.4, { region: Region.SCREEN });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      k.boxMM(-0.36 + c * 0.13, 0.62 + r * 0.24, 0.3, -0.27 + c * 0.13, 0.78 + r * 0.24, 0.37, plastic([0.8, 0.2, 0.2, 0.9][c % 4]!, [0.2, 0.7, 0.3, 0.9][(c + r) % 4]!, [0.2, 0.3, 0.8, 0.2][(r + 1) % 4]!));
    }
    k.boxMM(0.2, 1.1, 0.38, 0.4, 1.5, 0.4, DARKMETAL);
    k.boxMM(-0.35, 0.15, 0.38, 0.35, 0.4, 0.42, DARKMETAL);
  },
};

/** Comptoir d'accueil (4 m, en L simplifié). */
export const reception: PropDef = {
  id: "reception",
  shadow: true,
  colliders: [[-2.0, 0, -0.4, 2.0, 1.1, 0.4]],
  occluder: [[-2.0, 0, -0.4, 2.0, 1.1, 0.4]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-2.0, 0, -0.35, 2.0, 1.05, 0.35, WOOD);
    k.boxMM(-2.05, 1.05, -0.4, 2.05, 1.1, 0.45, { region: Region.PLASTIC, color: [0.85, 0.82, 0.75] });
    k.boxMM(-2.0, 0, 0.35, 2.0, 0.1, 0.38, WOOD_D);
    k.boxMM(-1.2, 1.1, -0.2, -0.6, 1.14, 0.2, PAPER);
    k.boxMM(0.6, 1.1, -0.3, 1.1, 1.45, 0.05, plastic(0.8, 0.78, 0.7));
    k.boxMM(0.64, 1.15, 0.05, 1.06, 1.41, 0.07, { region: Region.SCREEN });
  },
};

/** Plante verte morte en pot. */
export const deadPlant: PropDef = {
  id: "dead_plant",
  shadow: true,
  colliders: [[-0.25, 0, -0.25, 0.25, 0.5, 0.25]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  build(k) {
    k.lathe([[0.16, 0], [0.22, 0.45], [0.24, 0.47], [0.2, 0.47], [0.02, 0.4]], 12, { region: Region.CONCRETE, color: [0.6, 0.45, 0.35] });
    const branch: PartStyle = { region: Region.WOOD_DARK, color: [0.35, 0.3, 0.25] };
    const tips: Array<[number, number, number]> = [
      [0.15, 1.2, 0.05],
      [-0.2, 1.0, 0.12],
      [0.05, 1.4, -0.15],
      [-0.1, 0.9, -0.25],
      [0.28, 0.85, -0.1],
    ];
    for (const t of tips) {
      k.tube([[0, 0.42, 0], [t[0] * 0.4, 0.7, t[2] * 0.4], t], 0.012, 4, branch);
      k.tube([t, [t[0] * 1.3, t[1] - 0.2, t[2] * 1.4 + 0.05]], 0.006, 3, branch);
    }
  },
};

/** Pile de cartons. */
export const boxes: PropDef = {
  id: "boxes",
  shadow: true,
  colliders: [[-0.4, 0, -0.35, 0.4, 0.9, 0.35]],
  build(k) {
    const c: PartStyle = { region: Region.CARDBOARD, uv: 1.5 };
    k.push().rotateY(0.1);
    k.boxMM(-0.4, 0, -0.3, 0.1, 0.4, 0.2, c);
    k.pop();
    k.push().rotateY(-0.2);
    k.boxMM(0.0, 0, -0.35, 0.4, 0.35, 0.1, c);
    k.pop();
    k.push().rotateY(0.35);
    k.boxMM(-0.25, 0.4, -0.2, 0.15, 0.72, 0.15, c);
    k.pop();
  },
};

/** Sacs poubelle + bac. */
export const trashBags: PropDef = {
  id: "trash",
  shadow: true,
  colliders: [[-0.45, 0, -0.35, 0.45, 0.6, 0.35]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  build(k) {
    const bag: PartStyle = { region: Region.RUBBER, color: [1.6, 1.6, 1.7] };
    k.sphere([-0.2, 0.22, 0], 0.24, 10, bag, 0.9);
    k.sphere([0.18, 0.2, 0.08], 0.22, 10, bag, 0.85);
    k.sphere([0.0, 0.42, -0.05], 0.18, 10, bag, 0.8);
    k.tube([[0.0, 0.58, -0.05], [0.03, 0.66, -0.04]], 0.03, 5, bag);
  },
};

/** Machine à laver industrielle. */
export const washer: PropDef = {
  id: "washer",
  shadow: true,
  colliders: [[-0.45, 0, -0.4, 0.45, 1.2, 0.45]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-0.45, 0, -0.4, 0.45, 1.2, 0.4, { region: Region.PAINTED_METAL, color: [0.85, 0.85, 0.82] });
    k.push().translate(0, 0.6, 0.4).rotateX(Math.PI / 2);
    k.cylinder([0, 0, 0], [0, 0.04, 0], 0.3, 18, STEEL);
    k.cylinder([0, 0.04, 0], [0, 0.05, 0], 0.24, 18, { region: Region.SCREEN });
    k.pop();
    k.boxMM(-0.4, 1.05, 0.4, 0.4, 1.17, 0.42, DARKMETAL);
  },
};

/** Chariot à linge (sac en toile). */
export const laundryCart: PropDef = {
  id: "laundry_cart",
  lod: true,
  shadow: true,
  colliders: [[-0.4, 0, -0.3, 0.4, 1.0, 0.3]],
  build(k, lod) {
    const frame: PartStyle = STEEL;
    for (const x of [-0.38, 0.38]) for (const z of [-0.28, 0.28]) {
      k.cylinder([x, 0.1, z], [x, 1.0, z], 0.012, 5, frame);
    }
    k.tube([[-0.38, 1.0, -0.28], [0.38, 1.0, -0.28], [0.38, 1.0, 0.28], [-0.38, 1.0, 0.28], [-0.38, 1.0, -0.28]], 0.012, 5, frame);
    k.push().translate(0, 0.3, 0);
    k.boxMM(-0.36, 0, -0.26, 0.36, 0.68, 0.26, { region: Region.FABRIC, color: [0.55, 0.6, 0.65] });
    k.pop();
    if (lod === 0) k.sphere([0.05, 0.98, 0], 0.26, 8, { region: Region.FABRIC_STAINED }, 0.5);
    for (const x of [-0.35, 0.35]) for (const z of [-0.25, 0.25]) k.sphere([x, 0.05, z], 0.05, 6, { region: Region.RUBBER });
  },
};

/** Téléviseur cathodique mural. */
export const tvWall: PropDef = {
  id: "tv",
  shadow: false,
  build(k) {
    k.boxMM(-0.05, 2.1, -0.1, 0.05, 2.3, 0.05, DARKMETAL);
    k.boxMM(-0.35, 1.75, -0.05, 0.35, 2.25, 0.45, plastic(0.2, 0.2, 0.22));
    k.boxMM(-0.3, 1.8, 0.45, 0.3, 2.2, 0.47, { region: Region.SCREEN });
  },
};

/** Évier / lavabo inox sur pied. */
export const sink: PropDef = {
  id: "sink",
  shadow: true,
  colliders: [[-0.35, 0, -0.25, 0.35, 0.95, 0.25]],
  build(k) {
    k.boxMM(-0.35, 0.8, -0.25, 0.35, 0.9, 0.25, STEEL);
    k.boxMM(-0.3, 0, -0.2, 0.3, 0.8, 0.15, { region: Region.PAINTED_METAL, color: [0.8, 0.8, 0.78] });
    k.tube([[0, 0.9, -0.2], [0, 1.1, -0.2], [0, 1.1, -0.05]], 0.015, 6, STEEL);
    k.boxMM(-0.3, 1.2, -0.25, 0.3, 1.75, -0.23, { region: Region.SCREEN, color: [2.2, 2.3, 2.4] });
  },
};

/** Coffre-fort (visuel ; la logique est dans le gameplay). */
export const safeBox: PropDef = {
  id: "safe_visual",
  shadow: true,
  colliders: [[-0.35, 0, -0.35, 0.35, 0.9, 0.35]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-0.35, 0, -0.35, 0.35, 0.9, 0.35, { region: Region.PAINTED_METAL, color: [0.25, 0.3, 0.28] });
  },
};

/** Gravats / plâtre effondré. */
export const debris: PropDef = {
  id: "debris",
  shadow: true,
  build(k) {
    const c: PartStyle = { region: Region.CONCRETE, color: [0.8, 0.78, 0.74] };
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const r = 0.1 + (i % 4) * 0.12;
      k.push().translate(Math.cos(a) * r, 0.04, Math.sin(a) * r).rotateY(a).rotateX(0.2 * (i % 3));
      k.boxMM(-0.08 - (i % 3) * 0.03, -0.04, -0.06, 0.08, 0.05 + (i % 2) * 0.04, 0.07, c);
      k.pop();
    }
    k.push().translate(0.1, 0.02, -0.1).rotateY(0.6).rotateZ(0.15);
    k.boxMM(-0.4, 0, -0.3, 0.4, 0.02, 0.3, { region: Region.CONCRETE, color: [0.85, 0.83, 0.78] });
    k.pop();
  },
};

/** Papiers épars au sol (feuilles à plat, légèrement inclinées). */
export const papers: PropDef = {
  id: "papers",
  shadow: false,
  build(k) {
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7;
      const r = 0.15 + (i % 3) * 0.25;
      k.push().translate(Math.cos(a) * r, 0.004 + i * 0.001, Math.sin(a) * r).rotateY(a * 1.3).rotateZ((i % 2) * 0.03);
      k.quad([-0.105, 0, -0.148], [0.105, 0, -0.148], [0.105, 0, 0.148], [-0.105, 0, 0.148], [0, 1, 0], { region: Region.PAPER, uv: 3.3 });
      k.pop();
    }
  },
};

/** Dossiers médicaux empilés. */
export const folders: PropDef = {
  id: "folders",
  shadow: false,
  build(k) {
    for (let i = 0; i < 5; i++) {
      k.push().translate(0, i * 0.03, 0).rotateY(i * 0.25 - 0.4);
      k.boxMM(-0.12, 0, -0.16, 0.12, 0.028, 0.16, { region: Region.PLASTIC, color: [[0.8, 0.7, 0.3], [0.3, 0.5, 0.7], [0.7, 0.3, 0.25]][i % 3] as [number, number, number] });
      k.pop();
    }
  },
};
