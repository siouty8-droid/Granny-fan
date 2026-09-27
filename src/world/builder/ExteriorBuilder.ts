import { makeAABB, CollisionMask, type Collider, type Surface } from "../../physics/Collider";
import { EXTERIOR_ZONE } from "./ArchitectureBuilder";
import type { BatchSet } from "./MeshBatch";

/** Géométrie clé de l'extérieur (réutilisée par le gameplay et les cinématiques). */
export const EXTERIOR = {
  /** clôture de la propriété */
  fence: { minX: -12, maxX: 96, minZ: -32, maxZ: 62 },
  /** portail principal (sud) */
  mainGate: { x0: 36.5, x1: 44.5, z: -32 },
  /** boîtier du portail (badge + code), côté intérieur */
  gateBox: { x: 45.6, y: 1.25, z: -31.55 },
  /** cour des ambulances */
  bay: { minX: 80, maxX: 96, minZ: 14, maxZ: 46 },
  /** grille des ambulances (clôture est) */
  bayGate: { x: 96, z0: 26.5, z1: 33.5 },
  /** passage piéton entre la cour des ambulances et le parking */
  bayWalkway: { x0: 85.5, x1: 88, z: 14 },
  /** ambulance garée (face à la grille) */
  ambulance: { x: 88.5, z: 30, yaw: Math.PI / 2 },
  /** voiture du pote, dans la rue */
  buddyCar: { x: 40.5, z: -38.2, yaw: -Math.PI / 2 },
  /** rue */
  street: { minZ: -46, maxZ: -33.5 },
} as const;

const FENCE_H = 2.6;

/**
 * Extérieur : sols (parvis/parking, ruelles, cour des ambulances, rue), clôtures à barreaux,
 * portail principal, grille des ambulances, auvent de l'entrée.
 */
export class ExteriorBuilder {
  readonly colliders: Collider[] = [];

  constructor(private readonly batches: BatchSet) {}

  build(): void {
    const Z = EXTERIOR_ZONE;
    const fence = EXTERIOR.fence;
    // --- sols (hors emprise du bâtiment [0,0]-[80,54])
    this.ground("asphalt", fence.minX, fence.minZ, fence.maxX, -3.5, "concrete"); // parvis / parking
    this.ground("sidewalk", fence.minX, -3.5, fence.maxX, 0, "concrete");
    this.ground("sidewalk", fence.minX, 0, 0, fence.maxZ, "concrete"); // ruelle ouest
    this.ground("sidewalk", 0, 54, fence.maxX, fence.maxZ, "concrete"); // ruelle nord
    this.ground("asphalt", 80, 0, fence.maxX, 54, "concrete"); // est / cour des ambulances
    // au-delà de la clôture : bande d'herbe, trottoir et rue (non accessibles)
    this.ground("grass_ext", fence.minX - 14, fence.maxZ, fence.maxX + 14, fence.maxZ + 14, "grass", false);
    this.ground("grass_ext", fence.minX - 14, fence.minZ, fence.minX, fence.maxZ, "grass", false);
    this.ground("grass_ext", fence.maxX, fence.minZ, fence.maxX + 14, fence.maxZ, "grass", false);
    this.ground("sidewalk", fence.minX - 14, EXTERIOR.street.maxZ, fence.maxX + 14, fence.minZ, "concrete", false);
    this.ground("road", fence.minX - 14, EXTERIOR.street.minZ, fence.maxX + 14, EXTERIOR.street.maxZ, "concrete", false);
    this.ground("sidewalk", fence.minX - 14, EXTERIOR.street.minZ - 3, fence.maxX + 14, EXTERIOR.street.minZ, "concrete", false);

    // --- clôture de la propriété
    const g = EXTERIOR.mainGate;
    this.fenceLine(fence.minX, fence.minZ, g.x0 - 0.5, fence.minZ);
    this.fenceLine(g.x1 + 0.5, fence.minZ, fence.maxX, fence.minZ);
    this.fenceLine(fence.minX, fence.minZ, fence.minX, fence.maxZ);
    this.fenceLine(fence.minX, fence.maxZ, fence.maxX, fence.maxZ);
    const bg = EXTERIOR.bayGate;
    this.fenceLine(fence.maxX, fence.minZ, fence.maxX, bg.z0 - 0.3);
    this.fenceLine(fence.maxX, bg.z1 + 0.3, fence.maxX, fence.maxZ);
    // cour des ambulances
    const bay = EXTERIOR.bay;
    const w = EXTERIOR.bayWalkway;
    this.fenceLine(bay.minX, bay.minZ, w.x0, bay.minZ);
    this.fenceLine(w.x1, bay.minZ, bay.maxX, bay.minZ);
    this.fenceLine(bay.minX, bay.maxZ, bay.maxX, bay.maxZ);

    // --- piliers du portail principal
    const pillar = this.batches.get(Z, "brick");
    for (const px of [g.x0 - 0.5, g.x1 + 0.5]) {
      pillar.box(px - 0.4, 0, fence.minZ - 0.4, px + 0.4, 3.0, fence.minZ + 0.4, 1);
      this.colliders.push(makeAABB(px - 0.4, 0, fence.minZ - 0.4, px + 0.4, 3.0, fence.minZ + 0.4));
    }
    // piliers de la grille des ambulances
    for (const pz of [bg.z0 - 0.3, bg.z1 + 0.3]) {
      pillar.box(fence.maxX - 0.3, 0, pz - 0.3, fence.maxX + 0.3, 2.9, pz + 0.3, 1);
      this.colliders.push(makeAABB(fence.maxX - 0.3, 0, pz - 0.3, fence.maxX + 0.3, 2.9, pz + 0.3));
    }

    // --- auvent de l'entrée principale
    const canopy = this.batches.get(Z, "concrete_ceiling");
    canopy.box(35.5, 3.35, -5, 45.5, 3.65, 0, 1);
    const col = this.batches.get(Z, "facade");
    for (const cx of [36.2, 44.8]) {
      col.box(cx - 0.2, 0, -4.6, cx + 0.2, 3.35, -4.2, 1);
      this.colliders.push(makeAABB(cx - 0.2, 0, -4.6, cx + 0.2, 3.35, -4.2));
    }
    // auvent des urgences (au-dessus de la porte des ambulances)
    canopy.box(80, 3.3, 26, 86, 3.6, 34, 1);
    for (const cz of [26.4, 33.6]) {
      col.box(85.4, 0, cz - 0.2, 85.8, 3.3, cz + 0.2, 1);
      this.colliders.push(makeAABB(85.4, 0, cz - 0.2, 85.8, 3.3, cz + 0.2));
    }
  }

  private ground(mat: string, x0: number, z0: number, x1: number, z1: number, surface: Surface, collide = true): void {
    const b = this.batches.get(EXTERIOR_ZONE, mat);
    const w = x1 - x0;
    const d = z1 - z0;
    b.quad({ x: x0, y: 0, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: 1, z: 0 }, [x0, z0], [w, d], Math.ceil(w / 3), Math.ceil(d / 3));
    if (collide) this.colliders.push(makeAABB(x0, -0.8, z0, x1, 0, z1, { surface }));
  }

  /** Clôture à barreaux : panneaux (texture alpha) + poteaux + collider fin. */
  private fenceLine(x0: number, z0: number, x1: number, z1: number): void {
    const b = this.batches.get(EXTERIOR_ZONE, "fence");
    const posts = this.batches.get(EXTERIOR_ZONE, "metal_rail");
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.05) return;
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    const nx = -dz;
    const nz = dx;
    // deux faces (le matériau est double face, mais on garde des normales correctes des deux côtés)
    b.quad({ x: x0, y: 0, z: z0 }, { x: x1 - x0, y: 0, z: z1 - z0 }, { x: 0, y: FENCE_H, z: 0 }, { x: nx, y: 0, z: nz }, [0, 0], [len / 2.5, 1], Math.ceil(len / 2.5), 1);
    b.quad({ x: x0, y: 0, z: z0 }, { x: x1 - x0, y: 0, z: z1 - z0 }, { x: 0, y: FENCE_H, z: 0 }, { x: -nx, y: 0, z: -nz }, [0, 0], [len / 2.5, 1], Math.ceil(len / 2.5), 1);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= n; i++) {
      const px = x0 + (x1 - x0) * (i / n);
      const pz = z0 + (z1 - z0) * (i / n);
      posts.box(px - 0.05, 0, pz - 0.05, px + 0.05, FENCE_H + 0.1, pz + 0.05, 1, { bottom: false });
    }
    const minX = Math.min(x0, x1) - (Math.abs(dz) > 0.5 ? 0.06 : 0);
    const maxX = Math.max(x0, x1) + (Math.abs(dz) > 0.5 ? 0.06 : 0);
    const minZ = Math.min(z0, z1) - (Math.abs(dx) > 0.5 ? 0.06 : 0);
    const maxZ = Math.max(z0, z1) + (Math.abs(dx) > 0.5 ? 0.06 : 0);
    this.colliders.push(
      makeAABB(minX, 0, minZ, maxX, FENCE_H + 0.4, maxZ, { mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV | CollisionMask.INTERACT }),
    );
  }
}
