import { CollisionMask } from "../../../physics/Collider";
import { Region, type ModelKit, type PartStyle } from "../ModelKit";
import type { PropDef } from "../PropSystem";

type V3 = [number, number, number];

const METAL: PartStyle = { region: Region.PAINTED_METAL, color: [0.92, 0.92, 0.9] };
const STEEL: PartStyle = { region: Region.STEEL };
const RUBBER: PartStyle = { region: Region.RUBBER };
const VINYL_BLACK: PartStyle = { region: Region.VINYL, color: [0.22, 0.22, 0.24] };
const SHEET: PartStyle = { region: Region.FABRIC, uv: 0.6 };
const SHEET_STAIN: PartStyle = { region: Region.FABRIC_STAINED, uv: 0.6 };
const MATTRESS: PartStyle = { region: Region.MATTRESS, uv: 0.5 };
const PLASTIC_BEIGE: PartStyle = { region: Region.PLASTIC, color: [0.85, 0.8, 0.7] };

/** Roulette pivotante (fourche + roue). */
function caster(k: ModelKit, x: number, z: number, r = 0.05, lod: 0 | 1 = 0): void {
  const seg = lod === 0 ? 10 : 6;
  k.cylinder([x, r * 2 + 0.06, z], [x, r * 2 + 0.01, z], 0.018, 6, STEEL);
  k.cylinder([x - 0.02, r, z], [x + 0.02, r, z], r, seg, RUBBER);
}

/** Lit d'hôpital à cadre tubulaire, matelas, drap froissé, oreiller, barrières. 1 × 2.1 m. */
export const bed: PropDef = {
  id: "bed",
  lod: true,
  lodDistance: 11,
  shadow: true,
  colliders: [[-0.5, 0, -1.05, 0.5, 0.62, 1.05]],
  occluder: [[-0.5, 0.35, -1.05, 0.5, 0.62, 1.05]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV | CollisionMask.INTERACT,
  build(k, lod) {
    const tube = lod === 0 ? 8 : 5;
    // châssis
    for (const x of [-0.46, 0.46]) {
      k.tube([[x, 0.4, -1.0], [x, 0.4, 1.0]], 0.022, tube, METAL);
      k.tube([[x, 0.17, -0.95], [x, 0.4, -0.95]], 0.02, tube, METAL);
      k.tube([[x, 0.17, 0.95], [x, 0.4, 0.95]], 0.02, tube, METAL);
    }
    k.tube([[-0.46, 0.4, -1.0], [0.46, 0.4, -1.0]], 0.022, tube, METAL);
    k.tube([[-0.46, 0.4, 1.0], [0.46, 0.4, 1.0]], 0.022, tube, METAL);
    k.tube([[-0.46, 0.17, -0.95], [0.46, 0.17, -0.95]], 0.018, tube, METAL);
    k.tube([[-0.46, 0.17, 0.95], [0.46, 0.17, 0.95]], 0.018, tube, METAL);
    // sommier
    k.boxMM(-0.45, 0.4, -0.98, 0.45, 0.43, 0.98, { region: Region.PAINTED_METAL, color: [0.7, 0.7, 0.7] });
    // tête et pied de lit
    k.boxMM(-0.48, 0.42, -1.07, 0.48, 1.05, -1.03, PLASTIC_BEIGE);
    k.boxMM(-0.48, 0.42, 1.03, 0.48, 0.85, 1.07, PLASTIC_BEIGE);
    for (const x of [-0.48, 0.48]) {
      k.tube([[x, 0.4, -1.05], [x, 1.07, -1.05]], 0.02, tube, METAL);
      k.tube([[x, 0.4, 1.05], [x, 0.87, 1.05]], 0.02, tube, METAL);
    }
    // matelas + drap froissé + oreiller
    k.boxMM(-0.44, 0.43, -0.97, 0.44, 0.58, 0.97, MATTRESS);
    if (lod === 0) {
      k.push().translate(0, 0.585, 0.2).rotateX(-Math.PI / 2);
      k.sheet(0.98, 1.4, 8, 10, (u, v) => 0.02 + Math.sin(u * 9 + v * 4) * 0.012 + Math.sin(v * 13) * 0.01 + (Math.abs(u - 0.5) > 0.44 ? -0.08 : 0), SHEET_STAIN, false);
      k.pop();
      k.push().translate(0, 0.62, -0.78);
      k.sphere([0, 0, 0], 0.3, 10, { region: Region.FABRIC, color: [0.95, 0.95, 0.93] }, 0.22);
      k.pop();
      // barrières latérales relevées d'un côté
      k.tube([[0.49, 0.72, -0.6], [0.49, 0.72, 0.3]], 0.015, 6, STEEL);
      k.tube([[0.49, 0.58, -0.6], [0.49, 0.72, -0.6]], 0.015, 6, STEEL);
      k.tube([[0.49, 0.58, 0.3], [0.49, 0.72, 0.3]], 0.015, 6, STEEL);
    } else {
      k.boxMM(-0.45, 0.58, -0.6, 0.45, 0.6, 0.97, SHEET);
    }
    for (const [x, z] of [[-0.44, -0.93], [0.44, -0.93], [-0.44, 0.93], [0.44, 0.93]] as Array<[number, number]>) caster(k, x, z, 0.055, lod);
  },
};

/** Brancard (plus haut et étroit), matelas fin, housse tachée. 0.7 × 2 m. */
export const stretcher: PropDef = {
  id: "stretcher",
  lod: true,
  lodDistance: 11,
  shadow: true,
  colliders: [[-0.36, 0, -1.0, 0.36, 0.86, 1.0]],
  occluder: [[-0.36, 0.72, -1.0, 0.36, 0.86, 1.0]],
  build(k, lod) {
    const t = lod === 0 ? 8 : 5;
    k.boxMM(-0.34, 0.7, -0.98, 0.34, 0.74, 0.98, STEEL);
    k.boxMM(-0.33, 0.74, -0.96, 0.33, 0.82, 0.96, VINYL_BLACK);
    if (lod === 0) {
      k.push().translate(0, 0.825, 0.1).rotateX(-Math.PI / 2);
      k.sheet(0.7, 1.5, 6, 10, (u, v) => 0.015 + Math.sin(u * 11 + v * 5) * 0.01, SHEET_STAIN, false);
      k.pop();
    }
    // piétement en ciseaux
    k.tube([[-0.28, 0.12, -0.8], [-0.28, 0.7, 0.8]], 0.022, t, STEEL);
    k.tube([[0.28, 0.12, -0.8], [0.28, 0.7, 0.8]], 0.022, t, STEEL);
    k.tube([[-0.28, 0.12, 0.8], [-0.28, 0.7, -0.8]], 0.022, t, STEEL);
    k.tube([[0.28, 0.12, 0.8], [0.28, 0.7, -0.8]], 0.022, t, STEEL);
    k.tube([[-0.3, 0.12, -0.85], [0.3, 0.12, -0.85]], 0.02, t, STEEL);
    k.tube([[-0.3, 0.12, 0.85], [0.3, 0.12, 0.85]], 0.02, t, STEEL);
    for (const x of [-0.3, 0.3]) for (const z of [-0.85, 0.85]) caster(k, x, z, 0.045, lod);
    // poignées
    k.tube([[-0.3, 0.78, 1.0], [-0.3, 0.95, 1.05], [0.3, 0.95, 1.05], [0.3, 0.78, 1.0]], 0.015, t, STEEL);
  },
};

/** Fauteuil roulant. */
export const wheelchair: PropDef = {
  id: "wheelchair",
  lod: true,
  lodDistance: 10,
  shadow: true,
  colliders: [[-0.33, 0, -0.4, 0.33, 0.9, 0.45]],
  build(k, lod) {
    const t = lod === 0 ? 7 : 4;
    const seg = lod === 0 ? 16 : 8;
    // grandes roues (cercles de tubes + moyeux + rayons)
    for (const x of [-0.31, 0.31]) {
      const pts: V3[] = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push([x, 0.3 + Math.sin(a) * 0.29, -0.08 + Math.cos(a) * 0.29]);
      }
      k.tube(pts, 0.018, 5, RUBBER);
      const rim: V3[] = pts.map((p) => [p[0] + (x > 0 ? -0.02 : 0.02), 0.3 + (p[1] - 0.3) * 0.88, -0.08 + (p[2] + 0.08) * 0.88]);
      k.tube(rim, 0.008, 4, STEEL);
      if (lod === 0) for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.cylinder([x, 0.3, -0.08], [x, 0.3 + Math.sin(a) * 0.25, -0.08 + Math.cos(a) * 0.25], 0.003, 3, STEEL, false);
      }
      k.cylinder([x - 0.03, 0.3, -0.08], [x + 0.03, 0.3, -0.08], 0.03, 8, STEEL);
      // cadre latéral
      k.tube([[x * 0.85, 0.5, 0.35], [x * 0.85, 0.5, -0.25], [x * 0.85, 0.95, -0.3]], 0.014, t, STEEL);
      k.tube([[x * 0.85, 0.12, 0.35], [x * 0.85, 0.5, 0.35]], 0.014, t, STEEL);
      k.tube([[x * 0.85, 0.72, 0.25], [x * 0.85, 0.72, -0.2]], 0.012, t, STEEL);
      // petite roue avant
      k.cylinder([x * 0.82 - 0.012, 0.06, 0.36], [x * 0.82 + 0.012, 0.06, 0.36], 0.06, 8, RUBBER);
      // repose-pieds
      k.tube([[x * 0.7, 0.3, 0.35], [x * 0.5, 0.12, 0.45]], 0.01, 4, STEEL);
    }
    // assise et dossier en skaï
    k.boxMM(-0.24, 0.48, -0.22, 0.24, 0.52, 0.3, VINYL_BLACK);
    k.push().translate(0, 0.75, -0.26).rotateX(-0.12);
    k.boxMM(-0.24, -0.23, -0.015, 0.24, 0.2, 0.015, VINYL_BLACK);
    k.pop();
    k.tube([[-0.26, 0.95, -0.32], [-0.26, 0.97, -0.4]], 0.02, 5, RUBBER);
    k.tube([[0.26, 0.95, -0.32], [0.26, 0.97, -0.4]], 0.02, 5, RUBBER);
  },
};

/** Pied à perfusion (base à 5 branches, potence, poche). */
export const ivStand: PropDef = {
  id: "ivstand",
  lod: true,
  lodDistance: 10,
  shadow: true,
  colliders: [[-0.12, 0, -0.12, 0.12, 1.9, 0.12]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  build(k, lod) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const x = Math.cos(a) * 0.28;
      const z = Math.sin(a) * 0.28;
      k.cylinder([0, 0.1, 0], [x, 0.07, z], 0.014, 5, STEEL, false);
      if (lod === 0) caster(k, x, z, 0.025, 1);
    }
    k.cylinder([0, 0.08, 0], [0, 1.95, 0], 0.012, lod === 0 ? 8 : 4, STEEL);
    k.tube([[-0.16, 2.0, 0], [0, 1.95, 0], [0.16, 2.0, 0]], 0.008, 4, STEEL);
    if (lod === 0) {
      // poche de perfusion + tubulure
      k.push().translate(0.14, 1.78, 0);
      k.boxMM(-0.06, -0.14, -0.02, 0.06, 0.14, 0.02, { region: Region.WHITE, color: [0.85, 0.86, 0.8], ao: 0.9 });
      k.pop();
      k.tube([[0.14, 1.63, 0], [0.12, 1.2, 0.02], [0.18, 0.9, 0.1], [0.1, 0.6, 0.18]], 0.004, 3, { region: Region.WHITE, color: [0.8, 0.82, 0.8] });
    }
  },
};

/** Rideau de séparation suspendu à un rail (2.4 m), plis, bas taché. */
export const curtain: PropDef = {
  id: "curtain",
  lod: true,
  lodDistance: 14,
  shadow: true,
  occluder: [[-1.2, 0.3, -0.05, 1.2, 2.4, 0.05]],
  build(k, lod) {
    k.boxMM(-1.25, 2.52, -0.02, 1.25, 2.55, 0.02, STEEL);
    k.cylinder([-1.1, 2.55, 0], [-1.1, 3.2, 0], 0.01, 4, STEEL, false);
    k.cylinder([1.1, 2.55, 0], [1.1, 3.2, 0], 0.01, 4, STEEL, false);
    k.push().translate(0, 0.3, 0);
    k.sheet(
      2.4,
      2.2,
      lod === 0 ? 28 : 10,
      lod === 0 ? 6 : 2,
      (u, v) => Math.sin(u * Math.PI * 14) * 0.06 * (0.6 + v * 0.4) + Math.sin(u * 5.3) * 0.03,
      { region: Region.FABRIC_STAINED, color: [0.55, 0.72, 0.78], uv: 0.45 },
    );
    k.pop();
  },
};

/** Chariot de soins (tiroirs, plateau, roulettes). */
export const trolley: PropDef = {
  id: "trolley",
  lod: true,
  shadow: true,
  colliders: [[-0.35, 0, -0.25, 0.35, 0.95, 0.25]],
  build(k, lod) {
    k.boxMM(-0.33, 0.12, -0.24, 0.33, 0.9, 0.24, { region: Region.PAINTED_METAL, color: [0.75, 0.85, 0.9] });
    for (let i = 0; i < 4; i++) {
      const y = 0.2 + i * 0.17;
      k.boxMM(-0.3, y, 0.24, 0.3, y + 0.14, 0.26, { region: Region.PLASTIC, color: [0.9, 0.9, 0.92] });
      k.boxMM(-0.08, y + 0.06, 0.26, 0.08, y + 0.08, 0.28, STEEL);
    }
    k.boxMM(-0.36, 0.9, -0.26, 0.36, 0.93, 0.26, STEEL);
    if (lod === 0) {
      k.boxMM(-0.2, 0.93, -0.1, -0.05, 0.97, 0.05, { region: Region.WHITE, color: [0.9, 0.9, 0.85] });
      k.cylinder([0.15, 0.93, 0], [0.15, 1.05, 0], 0.03, 8, { region: Region.PLASTIC, color: [0.8, 0.4, 0.2] });
    }
    for (const x of [-0.29, 0.29]) for (const z of [-0.2, 0.2]) caster(k, x, z, 0.04, lod);
  },
};

/** Table d'autopsie en inox sur pied central. */
export const autopsyTable: PropDef = {
  id: "autopsy",
  lod: true,
  shadow: true,
  colliders: [[-0.45, 0, -1.1, 0.45, 0.95, 1.1]],
  occluder: [[-0.45, 0.8, -1.1, 0.45, 0.95, 1.1]],
  build(k, lod) {
    k.boxMM(-0.45, 0.85, -1.1, 0.45, 0.88, 1.1, STEEL);
    k.boxMM(-0.45, 0.88, -1.1, -0.42, 0.95, 1.1, STEEL);
    k.boxMM(0.42, 0.88, -1.1, 0.45, 0.95, 1.1, STEEL);
    k.boxMM(-0.45, 0.88, -1.1, 0.45, 0.95, -1.07, STEEL);
    k.boxMM(-0.45, 0.88, 1.07, 0.45, 0.95, 1.1, STEEL);
    k.cylinder([0, 0, 0], [0, 0.85, 0], 0.12, lod === 0 ? 12 : 6, STEEL);
    k.cylinder([0, 0, 0], [0, 0.05, 0], 0.35, lod === 0 ? 16 : 8, STEEL);
    if (lod === 0) {
      // drap taché posé sur une forme...
      k.push().translate(0, 0.9, 0);
      k.sphere([0, 0.05, -0.55], 0.14, 10, SHEET_STAIN, 0.8);
      k.boxMM(-0.25, 0, -0.45, 0.25, 0.16, 0.9, SHEET_STAIN);
      k.pop();
    }
  },
};

/** Mur de casiers réfrigérés de la morgue (3 × 3 portes). 2.4 m de large. */
export const morgueLockers: PropDef = {
  id: "morgue_lockers",
  shadow: false,
  colliders: [[-1.2, 0, -0.9, 1.2, 2.3, 0.35]],
  occluder: [[-1.2, 0, -0.9, 1.2, 2.3, 0.3]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-1.2, 0, -0.9, 1.2, 2.3, 0.3, STEEL);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = -0.8 + i * 0.8;
        const y = 0.25 + j * 0.72;
        k.boxMM(x - 0.36, y, 0.3, x + 0.36, y + 0.66, 0.34, { region: Region.STEEL, ao: 0.95 });
        k.boxMM(x + 0.2, y + 0.3, 0.34, x + 0.3, y + 0.36, 0.38, { region: Region.STEEL, color: [0.7, 0.7, 0.7] });
        k.boxMM(x - 0.3, y + 0.52, 0.34, x - 0.12, y + 0.6, 0.35, { region: Region.PAPER });
      }
    }
  },
};

/** Lampe scialytique (bloc) suspendue au plafond. */
export const surgicalLamp: PropDef = {
  id: "surgical_lamp",
  shadow: true,
  build(k) {
    k.cylinder([0, 3.2, 0], [0, 2.6, 0], 0.04, 8, METAL);
    k.tube([[0, 2.6, 0], [0.5, 2.4, 0], [0.7, 2.1, 0]], 0.035, 8, METAL);
    k.push().translate(0.7, 2.0, 0);
    k.lathe([[0.02, 0.12], [0.3, 0.08], [0.38, 0.0], [0.36, -0.04], [0.02, -0.02]], 18, METAL);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.sphere([Math.cos(a) * 0.2, -0.03, Math.sin(a) * 0.2], 0.05, 8, { region: Region.SCREEN, color: [0.6, 0.6, 0.6] });
    }
    k.pop();
  },
};

/** Table d'opération. */
export const opTable: PropDef = {
  id: "op_table",
  shadow: true,
  colliders: [[-0.3, 0, -1.0, 0.3, 0.95, 1.0]],
  build(k) {
    k.boxMM(-0.3, 0.8, -1.0, 0.3, 0.9, 1.0, { region: Region.VINYL, color: [0.3, 0.45, 0.5] });
    k.boxMM(-0.25, 0.7, -0.9, 0.25, 0.8, 0.9, STEEL);
    k.boxMM(-0.12, 0.1, -0.2, 0.12, 0.7, 0.2, STEEL);
    k.boxMM(-0.35, 0, -0.6, 0.35, 0.1, 0.6, STEEL);
    k.push().translate(0, 0.91, 0.2).rotateX(-Math.PI / 2);
    k.sheet(0.8, 1.4, 6, 8, (u, v) => Math.sin(u * 10 + v * 6) * 0.012 + (Math.abs(u - 0.5) > 0.38 ? -0.1 : 0), { region: Region.FABRIC_STAINED, color: [0.55, 0.75, 0.72] }, false);
    k.pop();
  },
};

/** Appareil de radiologie (colonne + bras + tube). */
export const xray: PropDef = {
  id: "xray",
  shadow: true,
  colliders: [[-0.4, 0, -0.4, 0.4, 2.4, 0.4]],
  build(k) {
    k.boxMM(-0.35, 0, -0.35, 0.35, 0.12, 0.35, METAL);
    k.boxMM(-0.12, 0.12, -0.12, 0.12, 2.3, 0.12, METAL);
    k.boxMM(-0.08, 1.4, 0.12, 0.08, 1.55, 1.0, METAL);
    k.push().translate(0, 1.35, 1.0);
    k.cylinder([0, 0.2, 0], [0, -0.1, 0], 0.18, 14, { region: Region.PAINTED_METAL, color: [0.85, 0.85, 0.8] });
    k.boxMM(-0.22, -0.25, -0.22, 0.22, -0.1, 0.22, { region: Region.PLASTIC, color: [0.3, 0.3, 0.32] });
    k.pop();
    k.boxMM(-0.5, 0.75, 0.6, 0.5, 0.82, 1.4, { region: Region.VINYL, color: [0.25, 0.3, 0.35] });
    k.boxMM(-0.4, 0, 0.7, 0.4, 0.75, 1.3, METAL);
  },
};

/** Lit à barreaux (pédiatrie). */
export const crib: PropDef = {
  id: "crib",
  lod: true,
  shadow: true,
  colliders: [[-0.4, 0, -0.7, 0.4, 1.0, 0.7]],
  build(k, lod) {
    const col: PartStyle = { region: Region.PAINTED_METAL, color: [0.95, 0.85, 0.6] };
    k.boxMM(-0.38, 0.35, -0.68, 0.38, 0.45, 0.68, MATTRESS);
    for (const x of [-0.4, 0.4]) {
      k.tube([[x, 0, -0.7], [x, 1.0, -0.7]], 0.02, 6, col);
      k.tube([[x, 0, 0.7], [x, 1.0, 0.7]], 0.02, 6, col);
      k.tube([[x, 1.0, -0.7], [x, 1.0, 0.7]], 0.018, 6, col);
      k.tube([[x, 0.35, -0.7], [x, 0.35, 0.7]], 0.018, 6, col);
      if (lod === 0) for (let z = -0.6; z <= 0.61; z += 0.1) k.cylinder([x, 0.35, z], [x, 1.0, z], 0.008, 4, col, false);
    }
    for (const z of [-0.7, 0.7]) {
      k.tube([[-0.4, 1.0, z], [0.4, 1.0, z]], 0.018, 6, col);
      if (lod === 0) for (let x = -0.3; x <= 0.31; x += 0.1) k.cylinder([x, 0.35, z], [x, 1.0, z], 0.008, 4, col, false);
    }
    if (lod === 0) {
      // peluche abandonnée
      k.sphere([0.1, 0.52, -0.3], 0.08, 8, { region: Region.FABRIC, color: [0.6, 0.45, 0.3] });
      k.sphere([0.1, 0.64, -0.3], 0.06, 8, { region: Region.FABRIC, color: [0.6, 0.45, 0.3] });
    }
  },
};

/** Ours en peluche (sol, lits). */
export const teddy: PropDef = {
  id: "teddy",
  shadow: false,
  build(k) {
    const fur: PartStyle = { region: Region.FABRIC_STAINED, color: [0.62, 0.46, 0.3] };
    k.sphere([0, 0.14, 0], 0.13, 10, fur, 1.1);
    k.sphere([0, 0.35, 0.02], 0.1, 10, fur);
    k.sphere([-0.07, 0.43, 0.02], 0.035, 6, fur);
    k.sphere([0.07, 0.43, 0.02], 0.035, 6, fur);
    k.sphere([0, 0.33, 0.1], 0.035, 6, { region: Region.FABRIC, color: [0.8, 0.7, 0.55] });
    k.sphere([-0.04, 0.37, 0.09], 0.012, 4, { region: Region.RUBBER });
    k.sphere([0.04, 0.37, 0.09], 0.012, 4, { region: Region.RUBBER });
    for (const x of [-0.12, 0.12]) k.sphere([x, 0.2, 0.04], 0.05, 6, fur, 1.4);
    for (const x of [-0.07, 0.07]) k.sphere([x, 0.05, 0.1], 0.05, 6, fur);
  },
};
