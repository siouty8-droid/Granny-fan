import { CollisionMask } from "../../../physics/Collider";
import { Region, type ModelKit, type PartStyle } from "../ModelKit";
import type { PropDef } from "../PropSystem";

const RUST: PartStyle = { region: Region.RUST };
const STEEL: PartStyle = { region: Region.STEEL };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.2, 0.22, 0.22] };
const RUBBER: PartStyle = { region: Region.RUBBER };
const GLASS: PartStyle = { region: Region.SCREEN, color: [1.3, 1.35, 1.4] };

/** Roue de voiture (pneu + jante). */
function wheel(k: ModelKit, x: number, z: number, r: number, side: number, flat = false): void {
  const y = flat ? r * 0.75 : r;
  k.cylinder([x - 0.11 * side, y, z], [x + 0.11 * side, y, z], r, 14, RUBBER);
  k.cylinder([x + 0.11 * side, y, z], [x + 0.12 * side, y, z], r * 0.6, 12, STEEL);
}

/** Carcasse de berline (parking) : carrosserie, vitres sales, pneus crevés. */
export function carWreck(id: string, color: [number, number, number], flat: boolean): PropDef {
  return {
    id,
    shadow: true,
    colliders: [[-0.92, 0, -2.2, 0.92, 1.45, 2.2]],
    occluder: [[-0.9, 0.3, -2.2, 0.9, 1.4, 2.2]],
    mask: CollisionMask.ALL,
    build(k) {
      const body: PartStyle = { region: Region.PAINTED_METAL, color };
      // caisse basse
      k.boxMM(-0.9, 0.32, -2.2, 0.9, 0.85, 2.2, body);
      // capot / coffre légèrement inclinés
      k.push().translate(0, 0.85, 1.55).rotateX(0.08);
      k.boxMM(-0.88, 0, -0.65, 0.88, 0.05, 0.65, body);
      k.pop();
      // habitacle
      k.boxMM(-0.82, 0.85, -1.0, 0.82, 1.38, 0.8, GLASS);
      k.boxMM(-0.84, 1.36, -0.95, 0.84, 1.42, 0.75, body);
      for (const x of [-0.84, 0.84]) {
        k.boxMM(x - 0.03, 0.85, 0.72, x + 0.03, 1.38, 0.8, body);
        k.boxMM(x - 0.03, 0.85, -0.05, x + 0.03, 1.38, 0.05, body);
        k.boxMM(x - 0.03, 0.85, -1.0, x + 0.03, 1.38, -0.9, body);
      }
      // pare-chocs, phares
      k.boxMM(-0.92, 0.3, 2.18, 0.92, 0.45, 2.28, DARK);
      k.boxMM(-0.92, 0.3, -2.28, 0.92, 0.45, -2.18, DARK);
      k.boxMM(-0.75, 0.62, 2.2, -0.45, 0.74, 2.23, GLASS);
      k.boxMM(0.45, 0.62, 2.2, 0.75, 0.74, 2.23, GLASS);
      k.boxMM(-0.8, 0.6, -2.23, -0.5, 0.72, -2.2, { region: Region.PLASTIC, color: [0.5, 0.05, 0.05] });
      k.boxMM(0.5, 0.6, -2.23, 0.8, 0.72, -2.2, { region: Region.PLASTIC, color: [0.5, 0.05, 0.05] });
      // rouille
      k.boxMM(-0.91, 0.35, -1.6, -0.9, 0.7, -0.4, RUST);
      for (const [x, z] of [[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.4], [0.8, -1.4]] as Array<[number, number]>) wheel(k, x, z, 0.32, Math.sign(x), flat && z < 0);
    },
  };
}

/** Benne à ordures. */
export const dumpster: PropDef = {
  id: "dumpster",
  shadow: true,
  colliders: [[-1.0, 0, -0.7, 1.0, 1.3, 0.7]],
  mask: CollisionMask.ALL,
  build(k) {
    const g: PartStyle = { region: Region.PAINTED_METAL, color: [0.2, 0.38, 0.25] };
    k.boxMM(-1.0, 0.1, -0.7, 1.0, 1.2, 0.7, g);
    k.push().translate(0, 1.2, -0.7).rotateX(-0.25);
    k.boxMM(-1.0, 0, 0, 1.0, 0.04, 1.4, { region: Region.PLASTIC, color: [0.15, 0.15, 0.15] });
    k.pop();
    k.boxMM(-1.0, 0.3, -0.72, 1.0, 0.36, 0.72, RUST);
    for (const x of [-0.85, 0.85]) for (const z of [-0.55, 0.55]) k.sphere([x, 0.07, z], 0.07, 6, RUBBER);
  },
};

/** Réverbère (mât + crosse + tête). */
export const streetLamp: PropDef = {
  id: "street_lamp",
  shadow: true,
  colliders: [[-0.12, 0, -0.12, 0.12, 6, 0.12]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV,
  build(k) {
    k.cylinder([0, 0, 0], [0, 0.6, 0], 0.12, 10, DARK);
    k.cylinder([0, 0.6, 0], [0, 5.8, 0], 0.07, 10, DARK);
    k.tube([[0, 5.8, 0], [0, 6.1, 0.3], [0, 6.1, 1.0]], 0.05, 8, DARK);
    k.boxMM(-0.22, 5.95, 0.9, 0.22, 6.12, 1.5, DARK);
  },
};

/** Tête lumineuse du réverbère (matériau émissif). */
export function lampHead(id: string, material: string): PropDef {
  return {
    id,
    shadow: false,
    material,
    build(k) {
      k.boxMM(-0.18, 5.92, 0.95, 0.18, 5.95, 1.45, { region: Region.WHITE });
    },
  };
}

/** Arbre mort (tronc + branches récursives). */
export function deadTree(id: string, seed: number, height: number): PropDef {
  return {
    id,
    shadow: true,
    colliders: [[-0.25, 0, -0.25, 0.25, height, 0.25]],
    mask: CollisionMask.ALL,
    build(k) {
      const bark: PartStyle = { region: Region.WOOD_DARK, color: [0.45, 0.4, 0.35], uv: 2 };
      let s = seed;
      const rnd = () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
      const branch = (x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, r: number, depth: number) => {
        const ex = x + dx * len;
        const ey = y + dy * len;
        const ez = z + dz * len;
        k.cylinder([x, y, z], [ex, ey, ez], r, depth > 1 ? 7 : 4, bark, false, r * 0.65);
        if (depth <= 0 || r < 0.015) return;
        const n = depth > 2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2;
          const spread = 0.5 + rnd() * 0.5;
          let nx = dx + Math.cos(a) * spread;
          let ny = dy * 0.7 + 0.25;
          let nz = dz + Math.sin(a) * spread;
          const l = Math.hypot(nx, ny, nz);
          nx /= l;
          ny /= l;
          nz /= l;
          branch(ex, ey, ez, nx, ny, nz, len * (0.55 + rnd() * 0.2), r * 0.62, depth - 1);
        }
      };
      branch(0, 0, 0, 0.05, 1, 0.02, height * 0.45, 0.2, 4);
      // racines
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        k.cylinder([0, 0.2, 0], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], 0.1, 5, bark, false, 0.03);
      }
    },
  };
}

/** Buisson sec en boule (cour envahie). */
export const bush: PropDef = {
  id: "bush",
  shadow: true,
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  colliders: [[-0.4, 0, -0.4, 0.4, 0.8, 0.4]],
  build(k) {
    const leaf: PartStyle = { region: Region.FABRIC, color: [0.3, 0.36, 0.18], uv: 3 };
    k.sphere([0, 0.45, 0], 0.55, 10, leaf, 0.8);
    k.sphere([0.35, 0.35, 0.2], 0.35, 8, leaf, 0.9);
    k.sphere([-0.3, 0.3, -0.25], 0.4, 8, { region: Region.FABRIC, color: [0.42, 0.38, 0.2], uv: 3 }, 0.8);
  },
};

/** Banc de jardin (bois + fonte). */
export const benchExt: PropDef = {
  id: "bench_ext",
  shadow: true,
  colliders: [[-0.9, 0, -0.3, 0.9, 0.85, 0.3]],
  build(k) {
    const wood: PartStyle = { region: Region.WOOD_LIGHT, color: [0.55, 0.5, 0.45] };
    for (let i = 0; i < 3; i++) k.boxMM(-0.9, 0.42, -0.2 + i * 0.13, 0.9, 0.45, -0.1 + i * 0.13, wood);
    for (let i = 0; i < 2; i++) k.boxMM(-0.9, 0.55 + i * 0.13, -0.28, 0.9, 0.65 + i * 0.13, -0.25, wood);
    for (const x of [-0.8, 0.8]) {
      k.boxMM(x - 0.03, 0, -0.25, x + 0.03, 0.42, 0.2, RUST);
      k.boxMM(x - 0.03, 0.42, -0.3, x + 0.03, 0.85, -0.25, RUST);
    }
  },
};

/** Borne / potelet. */
export const bollard: PropDef = {
  id: "bollard",
  shadow: false,
  colliders: [[-0.1, 0, -0.1, 0.1, 0.9, 0.1]],
  mask: CollisionMask.PLAYER | CollisionMask.MONSTER,
  build(k) {
    k.cylinder([0, 0, 0], [0, 0.9, 0], 0.08, 8, { region: Region.PAINTED_METAL, color: [0.25, 0.25, 0.25] });
    k.cylinder([0, 0.75, 0], [0, 0.82, 0], 0.085, 8, { region: Region.PAINTED_METAL, color: [0.9, 0.9, 0.85] });
  },
};

/** Groupe de climatisation de toit. */
export const acUnit: PropDef = {
  id: "ac_unit",
  shadow: true,
  colliders: [[-0.9, 0, -0.6, 0.9, 1.2, 0.6]],
  mask: CollisionMask.ALL,
  build(k) {
    k.boxMM(-0.9, 0, -0.6, 0.9, 1.1, 0.6, { region: Region.PAINTED_METAL, color: [0.7, 0.7, 0.68] });
    k.push().translate(0, 1.1, 0);
    k.cylinder([-0.4, 0, 0], [-0.4, 0.06, 0], 0.35, 14, DARK);
    k.cylinder([0.4, 0, 0], [0.4, 0.06, 0], 0.35, 14, DARK);
    k.pop();
    k.boxMM(-0.88, 0.1, 0.6, 0.88, 0.8, 0.62, RUST);
  },
};
