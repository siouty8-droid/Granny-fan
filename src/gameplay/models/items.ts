import { Region, type ModelKit, type PartStyle } from "../../world/props/ModelKit";
import type { PropDef } from "../../world/props/PropSystem";
import type { ItemId } from "../data/items";

/**
 * Modèles 3D des objets ramassables (pivot : centre de la base, avant = +z).
 * Rendus avec le matériau « items » (atlas des props + légère émission pulsée).
 */

const STEEL: PartStyle = { region: Region.STEEL };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.16, 0.16, 0.17] };
const BRASS: PartStyle = { region: Region.STEEL, color: [0.95, 0.72, 0.36] };
const WHITE_PLASTIC: PartStyle = { region: Region.PLASTIC, color: [0.92, 0.92, 0.9] };
const RUBBER: PartStyle = { region: Region.RUBBER };

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Anneau vertical (plan XY) centré en (0, y, 0). */
function ring(k: ModelKit, y: number, rIn: number, rOut: number, th: number, st: PartStyle): void {
  k.push().translate(0, y, 0).rotateX(Math.PI / 2);
  k.lathe(
    [
      [rIn, -th],
      [rOut, -th],
      [rOut, th],
      [rIn, th],
      [rIn, -th],
    ],
    12,
    st,
  );
  k.pop();
}

/** Badge magnétique debout : carte + bande de couleur + pince + cordon. */
function badge(color: string): (k: ModelKit) => void {
  const band: PartStyle = { region: Region.PLASTIC, color: hex(color) };
  return (k) => {
    k.groundAO = false;
    k.boxMM(-0.03, 0.0, -0.003, 0.03, 0.092, 0.003, WHITE_PLASTIC);
    k.boxMM(-0.031, 0.058, -0.0035, 0.031, 0.08, 0.0035, band);
    k.boxMM(-0.02, 0.012, 0.0032, 0.02, 0.018, 0.0036, DARK);
    k.boxMM(-0.012, 0.025, 0.0032, 0.012, 0.05, 0.0036, { region: Region.PAPER });
    k.boxMM(-0.008, 0.092, -0.004, 0.008, 0.106, 0.004, STEEL);
    k.tube(
      [
        [0, 0.106, 0],
        [0.012, 0.135, 0],
        [0, 0.16, 0],
        [-0.012, 0.135, 0],
        [0, 0.106, 0],
      ],
      0.0025,
      4,
      band,
    );
  };
}

/** Grande clé ancienne en laiton + étiquette « MORGUE ». */
function morgueKey(k: ModelKit): void {
  k.groundAO = false;
  ring(k, 0.022, 0.014, 0.022, 0.004, BRASS);
  k.cylinder([0, 0.044, 0], [0, 0.15, 0], 0.006, 8, BRASS);
  k.boxMM(0.004, 0.13, -0.003, 0.028, 0.142, 0.003, BRASS);
  k.boxMM(0.004, 0.112, -0.003, 0.02, 0.122, 0.003, BRASS);
  // étiquette
  k.tube(
    [
      [-0.018, 0.02, 0],
      [-0.045, 0.012, 0],
    ],
    0.0015,
    3,
    { region: Region.PAPER, color: [0.8, 0.75, 0.6] },
  );
  k.boxMM(-0.09, -0.0, -0.002, -0.045, 0.03, 0.002, { region: Region.CARDBOARD, color: [0.9, 0.8, 0.6] });
}

/** Pied-de-biche rouge (couché, légèrement incliné). */
function crowbar(k: ModelKit): void {
  k.groundAO = false;
  const red: PartStyle = { region: Region.PAINTED_METAL, color: [0.75, 0.12, 0.08] };
  k.push().translate(0, 0.03, 0).rotateZ(0.12);
  k.cylinder([-0.3, 0, 0], [0.26, 0, 0], 0.012, 8, red);
  // crosse
  k.tube(
    [
      [0.26, 0, 0],
      [0.3, 0.02, 0],
      [0.32, 0.06, 0],
      [0.3, 0.09, 0],
      [0.27, 0.095, 0],
    ],
    0.012,
    8,
    red,
  );
  // pointe plate fendue
  k.push().translate(-0.3, 0, 0).rotateZ(-0.35);
  k.boxMM(-0.07, -0.006, -0.012, 0, 0.006, 0.012, STEEL);
  k.pop();
  k.pop();
}

/** Pince coupe-boulons : longs manches à poignées, mâchoires. */
function boltCutter(k: ModelKit): void {
  k.groundAO = false;
  const grip: PartStyle = { region: Region.RUBBER, color: [0.85, 0.2, 0.1] };
  k.push().translate(0, 0.025, 0);
  for (const s of [-1, 1]) {
    k.cylinder([-0.18, 0, s * 0.012], [0.22, 0, s * 0.05], 0.009, 6, DARK);
    k.cylinder([0.08, 0, s * 0.036], [0.26, 0, s * 0.058], 0.015, 8, grip);
    k.boxMM(-0.28, -0.012, s > 0 ? 0 : -0.02, -0.18, 0.012, s > 0 ? 0.02 : 0, STEEL);
  }
  k.cylinder([-0.19, -0.018, 0], [-0.19, 0.018, 0], 0.014, 8, DARK);
  k.pop();
}

/** Fusible industriel (cartouche céramique, embouts laiton). */
function fuse(k: ModelKit): void {
  k.groundAO = false;
  const ceramic: PartStyle = { region: Region.WHITE, color: [0.9, 0.86, 0.72] };
  k.cylinder([0, 0.0, 0], [0, 0.025, 0], 0.024, 10, BRASS);
  k.cylinder([0, 0.025, 0], [0, 0.125, 0], 0.021, 10, ceramic);
  k.cylinder([0, 0.125, 0], [0, 0.15, 0], 0.024, 10, BRASS);
  k.boxMM(-0.006, 0.15, -0.012, 0.006, 0.175, 0.012, BRASS);
  k.boxMM(-0.006, -0.025, -0.012, 0.006, 0.0, 0.012, BRASS);
  k.boxMM(-0.015, 0.06, 0.02, 0.015, 0.09, 0.022, { region: Region.PAPER, color: [1, 0.85, 0.2] });
}

/** Batterie de véhicule (bac noir, bornes, poignée). */
function battery(k: ModelKit): void {
  const case_: PartStyle = { region: Region.PLASTIC, color: [0.12, 0.12, 0.13] };
  k.boxMM(-0.14, 0, -0.09, 0.14, 0.18, 0.09, case_);
  k.boxMM(-0.145, 0.16, -0.095, 0.145, 0.19, 0.095, case_);
  k.cylinder([-0.09, 0.19, 0.04], [-0.09, 0.215, 0.04], 0.012, 8, { region: Region.PAINTED_METAL, color: [0.8, 0.1, 0.08] });
  k.cylinder([0.09, 0.19, 0.04], [0.09, 0.215, 0.04], 0.012, 8, DARK);
  k.tube(
    [
      [-0.07, 0.19, -0.03],
      [-0.05, 0.25, -0.03],
      [0.05, 0.25, -0.03],
      [0.07, 0.19, -0.03],
    ],
    0.006,
    5,
    RUBBER,
  );
  k.boxMM(-0.1, 0.06, 0.09, 0.1, 0.13, 0.092, { region: Region.PAPER, color: [0.4, 0.8, 0.3] });
}

/** Trousseau de l'ambulance : 2 clés + télécommande rouge à croix blanche. */
function ambulanceKeys(k: ModelKit): void {
  k.groundAO = false;
  ring(k, 0.03, 0.016, 0.02, 0.002, STEEL);
  // clés
  for (const [a, len] of [
    [0.5, 0.06],
    [-0.35, 0.05],
  ] as Array<[number, number]>) {
    k.push().translate(0, 0.03, 0).rotateZ(a);
    k.boxMM(-0.012, -0.018 - 0.022, -0.003, 0.012, -0.018, 0.003, DARK);
    k.boxMM(-0.005, -0.04 - len, -0.002, 0.005, -0.04, 0.002, STEEL);
    k.pop();
  }
  // télécommande
  k.boxMM(-0.016, 0.05, -0.008, 0.016, 0.1, 0.008, { region: Region.PLASTIC, color: [0.75, 0.1, 0.08] });
  k.boxMM(-0.003, 0.064, 0.008, 0.003, 0.086, 0.0095, WHITE_PLASTIC);
  k.boxMM(-0.011, 0.072, 0.008, 0.011, 0.078, 0.0095, WHITE_PLASTIC);
}

/** Petite clé de coffre + anneau. */
function safeKey(k: ModelKit): void {
  k.groundAO = false;
  ring(k, 0.022, 0.011, 0.016, 0.002, BRASS);
  k.boxMM(-0.012, 0.035, -0.003, 0.012, 0.055, 0.003, BRASS);
  k.boxMM(-0.004, 0.055, -0.002, 0.004, 0.105, 0.002, BRASS);
  k.boxMM(0.004, 0.085, -0.002, 0.012, 0.092, 0.002, BRASS);
  k.boxMM(0.004, 0.097, -0.002, 0.01, 0.103, 0.002, BRASS);
}

/** Clés du camion : clé à tête noire + porte-clés plaque bleue « LIVRAISONS ». */
function truckKeys(k: ModelKit): void {
  k.groundAO = false;
  ring(k, 0.03, 0.016, 0.02, 0.002, STEEL);
  k.push().translate(0, 0.03, 0).rotateZ(0.4);
  k.boxMM(-0.013, -0.04, -0.004, 0.013, -0.016, 0.004, DARK);
  k.boxMM(-0.005, -0.1, -0.002, 0.005, -0.04, 0.002, STEEL);
  k.pop();
  k.boxMM(-0.022, 0.05, -0.003, 0.022, 0.1, 0.003, { region: Region.PLASTIC, color: [0.2, 0.5, 0.95] });
  k.boxMM(-0.016, 0.068, 0.003, 0.016, 0.082, 0.0035, WHITE_PLASTIC);
}

/** Manivelle de draisine : tige coudée en acier, poignée en bois. */
function crank(k: ModelKit): void {
  const WOOD: PartStyle = { region: Region.WOOD_DARK };
  k.tube(
    [
      [-0.2, 0.025, 0],
      [0.08, 0.025, 0],
      [0.08, 0.025, 0.16],
      [0.2, 0.025, 0.16],
    ],
    0.012,
    6,
    STEEL,
  );
  k.cylinder([0.2, 0.025, 0.16], [0.32, 0.025, 0.16], 0.02, 8, WOOD);
  k.boxMM(-0.24, 0.0, -0.025, -0.19, 0.05, 0.025, DARK);
}

/** Feuille de papier (note) posée à plat, coin corné. */
function note(k: ModelKit): void {
  k.groundAO = false;
  k.push().translate(0, 0.004, 0).rotateX(-Math.PI / 2);
  k.sheet(0.15, 0.21, 3, 4, (u, v) => (u > 0.8 && v > 0.85 ? 0.01 : 0) + Math.sin(u * 3.1) * 0.002, { region: Region.PAPER, color: [0.95, 0.93, 0.85] }, true);
  k.pop();
}

const BUILDERS: Record<ItemId, (k: ModelKit) => void> = {
  truckKeys,
  crank,
  badgeBlue: badge("#3a7bff"),
  badgeGreen: badge("#3fd46a"),
  badgeRed: badge("#ff3a3a"),
  morgueKey,
  crowbar,
  boltCutter,
  fuse,
  battery,
  ambulanceKeys,
  safeKey,
};

/** Hauteur du centre visuel (pour la sphère d'interaction et le halo). */
export const ITEM_CENTER_Y: Record<ItemId, number> = {
  truckKeys: 0.05,
  crank: 0.03,
  badgeBlue: 0.07,
  badgeGreen: 0.07,
  badgeRed: 0.07,
  morgueKey: 0.07,
  crowbar: 0.05,
  boltCutter: 0.03,
  fuse: 0.08,
  battery: 0.1,
  ambulanceKeys: 0.05,
  safeKey: 0.06,
};

/** Échelle d'affichage (les petits objets sont un peu grossis pour rester lisibles). */
export const ITEM_SCALE: Record<ItemId, number> = {
  truckKeys: 1.5,
  crank: 1.1,
  badgeBlue: 1.5,
  badgeGreen: 1.5,
  badgeRed: 1.5,
  morgueKey: 1.4,
  crowbar: 1.0,
  boltCutter: 1.0,
  fuse: 1.3,
  battery: 1.0,
  ambulanceKeys: 1.5,
  safeKey: 1.6,
};

/** Objets qui ne tournent pas sur eux-mêmes (lourds, posés au sol). */
export const ITEM_STATIC: Partial<Record<ItemId, boolean>> = { battery: true, crank: true };

export function itemPropId(id: ItemId): string {
  return `item_${id}`;
}

export function itemPropDefs(): PropDef[] {
  const defs: PropDef[] = (Object.keys(BUILDERS) as ItemId[]).map((id) => ({
    id: itemPropId(id),
    shadow: false,
    material: "items",
    build: (k: ModelKit) => BUILDERS[id](k),
  }));
  defs.push({ id: "item_note", shadow: false, material: "items", build: note });
  // fusible installé dans le tableau (matériau normal, pas de lueur)
  defs.push({ id: "fuse_installed", shadow: false, build: fuse });
  // batterie installée dans l'ambulance
  defs.push({ id: "battery_installed", shadow: false, build: battery });
  return defs;
}
