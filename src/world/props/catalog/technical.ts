import { CollisionMask } from "../../../physics/Collider";
import { Region, type PartStyle } from "../ModelKit";
import type { PropDef } from "../PropSystem";

const RUST: PartStyle = { region: Region.RUST };
const STEEL: PartStyle = { region: Region.STEEL };
const GRAY: PartStyle = { region: Region.PAINTED_METAL, color: [0.55, 0.57, 0.55] };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.3, 0.32, 0.33] };

/** Chaudière cylindrique (chaufferie). */
export const boiler: PropDef = {
  id: "boiler",
  shadow: true,
  colliders: [[-1.0, 0, -1.3, 1.0, 2.4, 1.3]],
  occluder: [[-0.95, 0, -1.25, 0.95, 2.3, 1.25]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-1.0, 0, -1.3, 1.0, 0.25, 1.3, { region: Region.CONCRETE });
    k.push().translate(0, 1.2, 0).rotateX(Math.PI / 2);
    k.cylinder([0, -1.2, 0], [0, 1.2, 0], 0.9, 20, RUST);
    k.cylinder([0, 1.2, 0], [0, 1.28, 0], 0.7, 20, STEEL);
    k.pop();
    for (const z of [-0.8, 0, 0.8]) k.cylinder([-0.95, 1.2, z], [0.95, 1.2, z], 0.94, 20, { region: Region.RUST, color: [0.8, 0.8, 0.8] }, false);
    // manomètre + tuyaux
    k.cylinder([0.6, 2.05, 1.1], [0.6, 2.4, 1.1], 0.06, 8, STEEL);
    k.cylinder([0.6, 2.4, 1.1], [0.6, 3.0, 1.1], 0.09, 10, RUST);
    k.cylinder([-0.5, 1.9, 1.2], [-0.5, 3.0, 1.2], 0.12, 10, GRAY);
    k.push().translate(0.9, 1.6, 1.28).rotateX(Math.PI / 2);
    k.cylinder([0, 0, 0], [0, 0.05, 0], 0.12, 14, STEEL);
    k.cylinder([0, 0.05, 0], [0, 0.06, 0], 0.1, 14, { region: Region.WHITE, color: [0.9, 0.88, 0.8] });
    k.pop();
  },
};

/** Armoires électriques (bloc de 3). */
export const elecCabinet: PropDef = {
  id: "elec_cabinet",
  shadow: true,
  colliders: [[-0.9, 0, -0.3, 0.9, 2.0, 0.3]],
  mask: CollisionMask.ALL,
  build(k) {
    for (let i = 0; i < 3; i++) {
      const x = -0.6 + i * 0.6;
      k.boxMM(x - 0.29, 0, -0.3, x + 0.29, 2.0, 0.28, GRAY);
      k.boxMM(x - 0.27, 0.05, 0.28, x + 0.27, 1.95, 0.3, { region: Region.PAINTED_METAL, color: [0.6, 0.62, 0.6] });
      k.boxMM(x + 0.18, 0.9, 0.3, x + 0.22, 1.1, 0.33, DARK);
      // triangle « danger »
      k.boxMM(x - 0.08, 1.6, 0.3, x + 0.08, 1.74, 0.305, { region: Region.PAINTED_METAL, color: [0.95, 0.8, 0.1] });
    }
  },
};

/** Groupe électrogène. */
export const generator: PropDef = {
  id: "generator",
  shadow: true,
  colliders: [[-1.4, 0, -0.7, 1.4, 1.6, 0.7]],
  occluder: [[-1.4, 0, -0.7, 1.4, 1.6, 0.7]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-1.4, 0, -0.7, 1.4, 0.2, 0.7, DARK);
    k.boxMM(-1.3, 0.2, -0.6, 0.6, 1.5, 0.6, { region: Region.PAINTED_METAL, color: [0.3, 0.45, 0.3] });
    k.boxMM(0.6, 0.2, -0.5, 1.35, 1.2, 0.5, { region: Region.PAINTED_METAL, color: [0.35, 0.37, 0.4] });
    for (let i = 0; i < 8; i++) k.boxMM(-1.2 + i * 0.22, 0.4, 0.6, -1.1 + i * 0.22, 1.3, 0.62, DARK);
    k.cylinder([1.0, 1.2, 0], [1.0, 2.6, 0], 0.1, 10, RUST);
  },
};

/** Établi avec étau et outils. */
export const workbench: PropDef = {
  id: "workbench",
  shadow: true,
  colliders: [[-1.0, 0, -0.35, 1.0, 0.95, 0.35]],
  occluder: [[-1.0, 0.85, -0.35, 1.0, 0.95, 0.35]],
  build(k) {
    k.boxMM(-1.0, 0.85, -0.35, 1.0, 0.92, 0.35, { region: Region.WOOD_LIGHT, color: [0.7, 0.6, 0.5] });
    for (const x of [-0.95, 0.95]) for (const z of [-0.3, 0.3]) k.boxMM(x - 0.03, 0, z - 0.03, x + 0.03, 0.85, z + 0.03, DARK);
    k.boxMM(-1.0, 0.2, -0.33, 1.0, 0.23, 0.33, { region: Region.WOOD_LIGHT, color: [0.6, 0.5, 0.4] });
    k.boxMM(0.6, 0.92, 0.2, 0.8, 1.05, 0.34, DARK);
    k.boxMM(-0.5, 0.92, -0.1, -0.1, 0.95, 0.05, { region: Region.RUST });
    k.boxMM(-1.0, 0.92, -0.35, 1.0, 1.8, -0.33, { region: Region.WOOD_LIGHT, color: [0.55, 0.5, 0.45] });
    for (let i = 0; i < 6; i++) k.boxMM(-0.8 + i * 0.3, 1.3, -0.33, -0.76 + i * 0.3, 1.55, -0.3, STEEL);
  },
};

/** Tuyauterie murale horizontale (2 m), deux conduites avec colliers. */
export const pipes: PropDef = {
  id: "pipes",
  shadow: false,
  build(k) {
    k.cylinder([-1.0, 2.5, 0.12], [1.0, 2.5, 0.12], 0.07, 8, RUST, false);
    k.cylinder([-1.0, 2.75, 0.1], [1.0, 2.75, 0.1], 0.05, 8, GRAY, false);
    for (const x of [-0.7, 0.3]) {
      k.boxMM(x - 0.03, 2.4, 0, x + 0.03, 2.85, 0.04, DARK);
      k.cylinder([x - 0.03, 2.5, 0.12], [x + 0.03, 2.5, 0.12], 0.085, 8, DARK, false);
    }
  },
};

/** Tuyauterie verticale (conduites qui montent du sol au plafond). */
export const pipesVertical: PropDef = {
  id: "pipes_v",
  shadow: true,
  colliders: [[-0.15, 0, -0.12, 0.3, 3.0, 0.2]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV,
  build(k) {
    k.cylinder([0, 0, 0.08], [0, 3.2, 0.08], 0.08, 10, RUST);
    k.cylinder([0.2, 0, 0.06], [0.2, 3.2, 0.06], 0.05, 8, GRAY);
    k.push().translate(0, 1.2, 0.08);
    k.cylinder([0, -0.05, 0], [0, 0.05, 0], 0.11, 10, DARK);
    k.cylinder([0, 0, 0], [0, 0, 0.22], 0.02, 6, STEEL);
    k.cylinder([-0.12, 0, 0.22], [0.12, 0, 0.22], 0.015, 6, { region: Region.PAINTED_METAL, color: [0.8, 0.15, 0.1] });
    k.pop();
  },
};

/** Panneau à fusibles (visuel mural ; l'interaction est gérée par le gameplay). */
export const fusePanelVisual: PropDef = {
  id: "fuse_panel",
  shadow: true,
  colliders: [[-0.45, 0.6, -0.1, 0.45, 2.0, 0.12]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV,
  build(k) {
    k.boxMM(-0.45, 0.7, -0.05, 0.45, 1.9, 0.12, GRAY);
    k.boxMM(-0.4, 0.75, 0.12, 0.4, 1.85, 0.13, DARK);
    k.boxMM(0.25, 1.1, 0.12, 0.35, 1.5, 0.2, { region: Region.PAINTED_METAL, color: [0.8, 0.1, 0.1] });
  },
};

/** Armoire à pharmacie vitrée murale. */
export const medCabinet: PropDef = {
  id: "med_cabinet",
  shadow: true,
  colliders: [[-0.6, 0, -0.22, 0.6, 1.9, 0.22]],
  mask: CollisionMask.ALL,
  build(k) {
    const body: PartStyle = { region: Region.PAINTED_METAL, color: [0.92, 0.92, 0.9] };
    k.boxMM(-0.6, 0, -0.22, 0.6, 1.9, 0.2, body);
    k.boxMM(-0.57, 0.9, 0.2, 0.57, 1.87, 0.21, { region: Region.SCREEN, color: [1.8, 1.9, 1.9] });
    for (let s = 0; s < 3; s++) {
      const y = 1.0 + s * 0.3;
      k.boxMM(-0.55, y, -0.18, 0.55, y + 0.015, 0.18, body);
      for (let i = 0; i < 7; i++) {
        if ((i + s) % 4 === 0) continue;
        k.cylinder([-0.45 + i * 0.15, y + 0.015, 0], [-0.45 + i * 0.15, y + 0.15, 0], 0.035, 6, { region: Region.PLASTIC, color: [[0.9, 0.9, 0.9], [0.6, 0.4, 0.2], [0.8, 0.2, 0.2]][(i + s) % 3] as [number, number, number] });
      }
    }
    k.boxMM(-0.57, 0.05, 0.2, 0.57, 0.85, 0.22, body);
  },
};
