import { CollisionMask } from "../../physics/Collider";
import { Region, type ModelKit, type PartStyle } from "../../world/props/ModelKit";
import type { PropDef } from "../../world/props/PropSystem";

/**
 * Mécanismes de gameplay : coffres, tableau électrique, lecteurs de badge, boîtier du portail,
 * cabine d'ascenseur, portails, ambulance, échelle de secours, voyants.
 */

const STEEL: PartStyle = { region: Region.STEEL };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.16, 0.16, 0.17] };
const GRAY: PartStyle = { region: Region.PAINTED_METAL, color: [0.5, 0.52, 0.52] };
const BRASS: PartStyle = { region: Region.STEEL, color: [0.95, 0.72, 0.36] };
const SCREEN: PartStyle = { region: Region.SCREEN };
const RUBBER: PartStyle = { region: Region.RUBBER };
const WARN: PartStyle = { region: Region.PAPER, color: [0.95, 0.8, 0.15] };

const BADGE_COLORS: Record<string, [number, number, number]> = {
  blue: [0.23, 0.48, 1.0],
  green: [0.25, 0.83, 0.42],
  red: [1.0, 0.23, 0.23],
};

// ------------------------------------------------------------------ coffres

const SAFE_BODY: PartStyle = { region: Region.PAINTED_METAL, color: [0.24, 0.29, 0.27] };

/** Corps de coffre ouvert (0.7 × 0.9 × 0.7), façade en +z. */
function safeBody(k: ModelKit): void {
  const b = SAFE_BODY;
  k.boxMM(-0.35, 0, -0.35, 0.35, 0.1, 0.35, b);
  k.boxMM(-0.35, 0.84, -0.35, 0.35, 0.9, 0.35, b);
  k.boxMM(-0.35, 0.1, -0.35, -0.29, 0.84, 0.35, b);
  k.boxMM(0.29, 0.1, -0.35, 0.35, 0.84, 0.35, b);
  k.boxMM(-0.29, 0.1, -0.35, 0.29, 0.84, -0.29, b);
  // intérieur sombre + étagère
  k.boxMM(-0.29, 0.1, -0.29, 0.29, 0.105, 0.28, DARK);
  k.boxMM(-0.29, 0.42, -0.29, 0.29, 0.44, 0.26, DARK);
  // charnières
  for (const y of [0.25, 0.7]) k.cylinder([-0.35, y - 0.05, 0.35], [-0.35, y + 0.05, 0.35], 0.018, 8, STEEL);
  // pieds
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) k.boxMM(x - 0.03, -0.0, z - 0.03, x + 0.03, 0.02, z + 0.03, DARK);
}

/** Porte de coffre (gond en x = 0, s'étend vers +x, face avant z = 0). */
function safeDoor(code: boolean): (k: ModelKit) => void {
  return (k) => {
    k.groundAO = false;
    k.boxMM(0, 0, -0.07, 0.58, 0.74, 0, SAFE_BODY);
    k.boxMM(0.03, 0.03, 0.0, 0.55, 0.71, 0.006, { region: Region.PAINTED_METAL, color: [0.28, 0.33, 0.31] });
    // volant
    k.push().translate(0.22, 0.37, 0.006).rotateX(Math.PI / 2);
    k.cylinder([0, 0, 0], [0, 0.03, 0], 0.03, 10, STEEL);
    k.pop();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      k.cylinder([0.22, 0.37, 0.03], [0.22 + Math.cos(a) * 0.09, 0.37 + Math.sin(a) * 0.09, 0.03], 0.008, 6, STEEL);
      k.sphere([0.22 + Math.cos(a) * 0.09, 0.37 + Math.sin(a) * 0.09, 0.03], 0.014, 6, STEEL);
    }
    if (code) {
      // clavier + petit écran
      k.boxMM(0.36, 0.28, 0.006, 0.52, 0.56, 0.02, DARK);
      k.boxMM(0.38, 0.5, 0.02, 0.5, 0.54, 0.022, SCREEN);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.boxMM(0.385 + c * 0.04, 0.3 + r * 0.045, 0.02, 0.41 + c * 0.04, 0.325 + r * 0.045, 0.026, GRAY);
    } else {
      k.cylinder([0.44, 0.42, 0.006], [0.44, 0.42, 0.02], 0.03, 10, BRASS);
      k.boxMM(0.435, 0.4, 0.02, 0.445, 0.44, 0.022, DARK);
    }
  };
}

// ------------------------------------------------------------------ tableau électrique

/** Tableau à fusibles (façade +z, pied au sol, dos contre le mur en z = 0). */
function fuseBoard(k: ModelKit): void {
  const body: PartStyle = { region: Region.PAINTED_METAL, color: [0.55, 0.58, 0.55] };
  k.boxMM(-0.42, 0.7, 0, 0.42, 1.9, 0.26, body);
  k.boxMM(-0.38, 0.74, 0.26, 0.38, 1.86, 0.262, DARK);
  // supports de fusibles (vides)
  for (const x of [-0.2, 0.0]) {
    k.boxMM(x - 0.05, 1.16, 0.262, x + 0.05, 1.52, 0.29, { region: Region.WHITE, color: [0.85, 0.82, 0.7] });
    k.boxMM(x - 0.02, 1.2, 0.29, x + 0.02, 1.24, 0.31, BRASS);
    k.boxMM(x - 0.02, 1.44, 0.29, x + 0.02, 1.48, 0.31, BRASS);
  }
  // logement du levier
  k.boxMM(0.2, 1.05, 0.262, 0.36, 1.55, 0.3, DARK);
  // étiquettes
  k.boxMM(-0.3, 1.64, 0.262, 0.1, 1.76, 0.265, WARN);
  k.boxMM(-0.3, 0.9, 0.262, 0.3, 0.98, 0.265, { region: Region.PAPER });
  // porte de l'armoire, ouverte
  k.push().translate(-0.42, 0.7, 0.26).rotateY(1.9);
  k.boxMM(0, 0, -0.02, 0.84, 1.2, 0, body);
  k.boxMM(0.7, 0.55, -0.05, 0.74, 0.7, -0.02, STEEL);
  k.pop();
  // gaines
  k.boxMM(-0.3, 1.9, 0.05, -0.2, 3.0, 0.15, GRAY);
  k.boxMM(0.2, 1.9, 0.05, 0.3, 3.0, 0.15, GRAY);
}

/** Levier (pivot sur l'axe, bras le long de +y). */
function panelLever(k: ModelKit): void {
  k.groundAO = false;
  k.cylinder([-0.05, 0, 0], [0.05, 0, 0], 0.02, 8, STEEL);
  k.boxMM(-0.012, 0, -0.012, 0.012, 0.18, 0.012, STEEL);
  k.cylinder([-0.05, 0.18, 0], [0.05, 0.18, 0], 0.022, 8, { region: Region.RUBBER, color: [0.8, 0.1, 0.08] });
}

// ------------------------------------------------------------------ lecteurs, claviers, voyants

/** Lecteur de badge mural (dos au mur en z = 0). */
function badgeReader(color: [number, number, number]): (k: ModelKit) => void {
  return (k) => {
    k.groundAO = false;
    k.boxMM(-0.045, -0.07, 0, 0.045, 0.07, 0.03, { region: Region.PLASTIC, color: [0.22, 0.22, 0.24] });
    k.boxMM(-0.046, 0.035, 0.0, 0.046, 0.058, 0.032, { region: Region.PLASTIC, color });
    k.boxMM(-0.03, -0.05, 0.03, 0.03, 0.02, 0.032, SCREEN);
    k.boxMM(-0.012, -0.03, 0.032, 0.012, 0.0, 0.033, { region: Region.WHITE, color: [0.6, 0.6, 0.6] });
  };
}

/** Voyant (petit cube émissif). */
function led(size: number): (k: ModelKit) => void {
  return (k) => {
    k.groundAO = false;
    k.box(0, 0, 0, size, size, size * 0.5, { region: Region.WHITE });
  };
}

/** Boîtier du portail sur poteau (badge + clavier), façade +z. */
function gateBox(k: ModelKit): void {
  k.cylinder([0, 0, -0.05], [0, 1.1, -0.05], 0.045, 10, DARK);
  k.boxMM(-0.14, 1.08, -0.1, 0.14, 1.46, 0.04, { region: Region.PAINTED_METAL, color: [0.3, 0.32, 0.3] });
  k.boxMM(-0.15, 1.46, -0.12, 0.15, 1.5, 0.08, DARK);
  k.boxMM(-0.1, 1.35, 0.04, 0.1, 1.42, 0.045, SCREEN);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) k.boxMM(-0.075 + c * 0.05, 1.12 + r * 0.05, 0.04, -0.045 + c * 0.05, 1.15 + r * 0.05, 0.05, GRAY);
  k.boxMM(0.06, 1.12, 0.04, 0.11, 1.3, 0.05, { region: Region.PLASTIC, color: BADGE_COLORS.red! });
}

// ------------------------------------------------------------------ ascenseur

export const CABIN = { hw: 1.33, hd: 1.33, h: 2.45, door: 0.7 };

/** Cabine d'ascenseur traversante (portes côté -z et +z), pivot au centre du plancher. */
function cabin(k: ModelKit): void {
  k.groundAO = false;
  const { hw, hd, h, door } = CABIN;
  const wall: PartStyle = { region: Region.STEEL, color: [0.85, 0.86, 0.88] };
  const outer: PartStyle = { region: Region.PAINTED_METAL, color: [0.35, 0.36, 0.36] };
  k.boxMM(-hw, -0.12, -hd, hw, 0, hd, outer);
  k.boxMM(-hw + 0.02, 0, -hd + 0.02, hw - 0.02, 0.005, hd - 0.02, { region: Region.RUBBER, color: [0.4, 0.4, 0.42] });
  k.boxMM(-hw, h, -hd, hw, h + 0.12, hd, outer);
  k.boxMM(-hw, 0, -hd, -hw + 0.05, h, hd, wall);
  k.boxMM(hw - 0.05, 0, -hd, hw, h, hd, wall);
  for (const s of [-1, 1]) {
    const z0 = s < 0 ? -hd : hd - 0.05;
    const z1 = z0 + 0.05;
    k.boxMM(-hw, 0, z0, -door, h, z1, wall);
    k.boxMM(door, 0, z0, hw, h, z1, wall);
    k.boxMM(-door, 2.2, z0, door, h, z1, wall);
  }
  // main courante
  for (const x of [-hw + 0.1, hw - 0.1]) k.cylinder([x, 0.95, -0.9], [x, 0.95, 0.9], 0.02, 8, STEEL);
  // plafonnier
  k.boxMM(-0.5, h - 0.02, -0.5, 0.5, h, 0.5, { region: Region.WHITE, color: [0.9, 0.9, 0.85] });
  // tableau de commande (paroi est)
  k.boxMM(hw - 0.07, 0.95, -0.15, hw - 0.05, 1.6, 0.15, DARK);
  for (let i = 0; i < 4; i++) k.cylinder([hw - 0.07, 1.05 + i * 0.13, 0], [hw - 0.085, 1.05 + i * 0.13, 0], 0.03, 10, STEEL);
}

/** Vantail coulissant d'ascenseur (0.72 × 2.2), pivot au centre du pied. */
function elevDoor(k: ModelKit): void {
  k.groundAO = false;
  k.boxMM(-0.36, 0, -0.02, 0.36, 2.2, 0.02, { region: Region.STEEL, color: [0.72, 0.74, 0.76] });
}

/** Plafonnier de cabine (émissif). */
function cabinLight(k: ModelKit): void {
  k.groundAO = false;
  k.boxMM(-0.45, -0.01, -0.45, 0.45, 0, 0.45, { region: Region.WHITE });
}

/** Bouton d'appel palier (dos au mur). */
function callPanel(k: ModelKit): void {
  k.groundAO = false;
  k.boxMM(-0.06, -0.12, 0, 0.06, 0.12, 0.02, STEEL);
  k.cylinder([0, 0, 0.02], [0, 0, 0.03], 0.025, 10, DARK);
}

// ------------------------------------------------------------------ portails

function gateLeaf(width: number, height: number): (k: ModelKit) => void {
  return (k) => {
    const paint: PartStyle = { region: Region.PAINTED_METAL, color: [0.16, 0.24, 0.2] };
    const rust: PartStyle = { region: Region.RUST };
    k.boxMM(0, 0.08, -0.03, width, 0.14, 0.03, paint);
    k.boxMM(0, height - 0.12, -0.03, width, height - 0.06, 0.03, paint);
    k.boxMM(0, 1.1, -0.025, width, 1.15, 0.025, rust);
    k.boxMM(0, 0.05, -0.04, 0.08, height, 0.04, paint);
    k.boxMM(width - 0.08, 0.05, -0.04, width, height, 0.04, paint);
    const n = Math.floor(width / 0.14);
    for (let i = 1; i < n; i++) {
      const x = (i / n) * width;
      k.boxMM(x - 0.012, 0.1, -0.012, x + 0.012, height + 0.12, 0.012, i % 5 === 0 ? rust : paint);
      k.boxMM(x - 0.02, height + 0.12, -0.02, x + 0.02, height + 0.2, 0.02, paint);
    }
  };
}

// ------------------------------------------------------------------ ambulance

/** Ambulance (≈ 5.8 m), avant en +z. */
function ambulance(k: ModelKit, lod: 0 | 1): void {
  const white: PartStyle = { region: Region.PAINTED_METAL, color: [0.88, 0.88, 0.85] };
  const red: PartStyle = { region: Region.PAINTED_METAL, color: [0.78, 0.1, 0.08] };
  const yellow: PartStyle = { region: Region.PAINTED_METAL, color: [0.95, 0.75, 0.1] };
  const glass: PartStyle = { region: Region.SCREEN, color: [0.6, 0.65, 0.7] };
  const blue: PartStyle = { region: Region.PLASTIC, color: [0.15, 0.3, 0.85] };
  // cellule sanitaire
  k.boxMM(-1.05, 0.55, -2.9, 1.05, 2.75, 0.85, white);
  // cabine
  k.boxMM(-1.0, 0.55, 0.85, 1.0, 1.35, 2.9, white);
  k.boxMM(-1.0, 1.35, 0.85, 1.0, 2.35, 1.6, white);
  k.boxMM(-0.98, 1.35, 1.6, 0.98, 1.4, 2.25, white);
  // pare-brise incliné
  k.quad([-0.95, 1.4, 2.25], [0.95, 1.4, 2.25], [0.95, 2.3, 1.62], [-0.95, 2.3, 1.62], [0, 0.57, 0.82], glass);
  k.boxMM(-1.0, 1.4, 1.6, -0.95, 2.35, 2.25, white);
  k.boxMM(0.95, 1.4, 1.6, 1.0, 2.35, 2.25, white);
  k.boxMM(-1.0, 2.3, 1.55, 1.0, 2.36, 1.65, white);
  // vitres latérales
  for (const s of [-1, 1]) k.boxMM(s * 1.0 - 0.005, 1.5, 0.95, s * 1.0 + 0.005, 2.15, 1.55, glass);
  // bandes
  for (const s of [-1, 1]) {
    k.boxMM(s * 1.05 - 0.004, 1.0, -2.9, s * 1.05 + 0.004, 1.22, 0.85, red);
    k.boxMM(s * 1.0 - 0.004, 1.0, 0.85, s * 1.0 + 0.004, 1.22, 2.9, red);
    k.boxMM(s * 1.05 - 0.004, 1.22, -2.9, s * 1.05 + 0.004, 1.28, 0.85, yellow);
    // croix
    k.boxMM(s * 1.05 - 0.005, 1.75, -1.6, s * 1.05 + 0.005, 2.25, -1.45, red);
    k.boxMM(s * 1.05 - 0.005, 1.93, -1.78, s * 1.05 + 0.005, 2.07, -1.27, red);
  }
  // capot, calandre, pare-chocs
  k.boxMM(-0.95, 1.25, 2.2, 0.95, 1.36, 2.9, white);
  k.boxMM(-0.7, 0.75, 2.9, 0.7, 1.15, 2.93, DARK);
  k.boxMM(-1.05, 0.45, 2.85, 1.05, 0.7, 3.0, DARK);
  k.boxMM(-1.08, 0.45, -3.0, 1.08, 0.7, -2.85, DARK);
  // phares (éteints ; les phares allumés sont un prop émissif séparé)
  for (const s of [-1, 1]) k.boxMM(s * 0.85 - 0.14, 0.95, 2.9, s * 0.85 + 0.14, 1.12, 2.93, { region: Region.PLASTIC, color: [0.85, 0.85, 0.75] });
  // rampe lumineuse + gyrophares arrière
  k.boxMM(-0.8, 2.36, 1.1, 0.8, 2.5, 1.45, blue);
  for (const s of [-1, 1]) k.boxMM(s * 0.95 - 0.08, 2.75, -2.88, s * 0.95 + 0.08, 2.9, -2.72, blue);
  // portes arrière
  k.boxMM(-1.0, 0.6, -2.92, -0.01, 2.65, -2.9, white);
  k.boxMM(0.01, 0.6, -2.92, 1.0, 2.65, -2.9, white);
  for (const s of [-1, 1]) k.boxMM(s * 0.5 - 0.3, 1.7, -2.93, s * 0.5 + 0.3, 2.3, -2.92, glass);
  // rétroviseurs
  for (const s of [-1, 1]) k.boxMM(s * 1.08 - 0.05, 1.7, 1.9, s * 1.08 + 0.05, 1.95, 2.0, DARK);
  // roues
  const seg = lod === 0 ? 14 : 8;
  for (const z of [-1.75, 1.9]) {
    for (const s of [-1, 1]) {
      k.cylinder([s * 0.82, 0.38, z], [s * 1.05, 0.38, z], 0.38, seg, RUBBER);
      k.cylinder([s * 1.05, 0.38, z], [s * 1.06, 0.38, z], 0.2, seg, STEEL);
    }
  }
  // passages de roue
  k.boxMM(-1.0, 0.45, -2.3, 1.0, 0.55, 2.4, DARK);
}

/** Phares allumés (émissif). */
function headlightsOn(k: ModelKit): void {
  k.groundAO = false;
  for (const s of [-1, 1]) k.boxMM(s * 0.85 - 0.13, 0.96, 2.93, s * 0.85 + 0.13, 1.11, 2.935, { region: Region.WHITE });
}

// ------------------------------------------------------------------ échelle de secours

/** Échelle à crinoline au bord du toit (pivot : bord de la dalle ; +z vers l'extérieur). */
function ladder(k: ModelKit): void {
  const paint: PartStyle = { region: Region.PAINTED_METAL, color: [0.55, 0.2, 0.12] };
  for (const x of [-0.25, 0.25]) {
    k.tube(
      [
        [x, -5.6, 0.2],
        [x, 1.05, 0.2],
        [x, 1.15, 0.05],
        [x, 1.05, -0.3],
        [x, 0.0, -0.35],
      ],
      0.025,
      6,
      paint,
    );
  }
  for (let y = -5.4; y < 0.95; y += 0.3) k.cylinder([-0.25, y, 0.2], [0.25, y, 0.2], 0.015, 5, paint);
  // crinoline
  for (let y = -3.5; y < 0.9; y += 0.9) {
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      pts.push([Math.cos(a) * 0.36, y, 0.2 + Math.sin(a) * 0.55]);
    }
    k.tube(pts, 0.015, 4, paint);
  }
  for (const a of [0.3, Math.PI / 2, Math.PI - 0.3]) k.cylinder([Math.cos(a) * 0.36, -3.5, 0.2 + Math.sin(a) * 0.55], [Math.cos(a) * 0.36, 0.9, 0.2 + Math.sin(a) * 0.55], 0.012, 4, paint);
}

export function mechanismPropDefs(): PropDef[] {
  const defs: PropDef[] = [
    { id: "safe_body", shadow: true, build: safeBody, colliders: [[-0.35, 0, -0.35, 0.35, 0.9, 0.35]], mask: CollisionMask.ALL & ~CollisionMask.INTERACT },
    { id: "safe_door_code", shadow: true, build: safeDoor(true) },
    { id: "safe_door_key", shadow: true, build: safeDoor(false) },
    { id: "fuse_board", shadow: true, build: fuseBoard, colliders: [[-0.42, 0.7, 0, 0.42, 1.9, 0.27]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.SIGHT },
    { id: "panel_lever", shadow: false, build: panelLever },
    { id: "gate_box", shadow: true, build: gateBox, colliders: [[-0.15, 0, -0.12, 0.15, 1.5, 0.05]], mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV },
    { id: "elev_cabin", shadow: false, build: cabin },
    { id: "elev_door", shadow: false, build: elevDoor },
    { id: "cabin_light", shadow: false, build: cabinLight, material: "cabin_light" },
    { id: "call_panel", shadow: false, build: callPanel },
    { id: "gate_main", shadow: true, build: gateLeaf(4.0, 2.3) },
    { id: "gate_bay", shadow: true, build: gateLeaf(3.5, 2.2) },
    {
      id: "ambulance",
      shadow: true,
      lod: true,
      lodDistance: 25,
      build: ambulance,
      colliders: [[-1.08, 0, -3.0, 1.08, 2.75, 3.0]],
      mask: CollisionMask.ALL,
    },
    { id: "amb_headlights", shadow: false, build: headlightsOn, material: "lamp_on" },
    { id: "ladder", shadow: false, build: ladder },
  ];
  for (const [name, color] of Object.entries(BADGE_COLORS)) defs.push({ id: `reader_${name}`, shadow: false, build: badgeReader(color) });
  for (const c of ["red", "green", "amber", "off"]) {
    defs.push({ id: `led_${c}`, shadow: false, build: led(0.007), material: `led_${c}` });
    defs.push({ id: `btn_${c}`, shadow: false, build: led(0.018), material: `led_${c}` });
  }
  return defs;
}
