import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { makeAABB, CollisionMask, type Collider } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { MaterialLibrary } from "../render/materials/MaterialLibrary";
import { ArchitectureBuilder, type OpeningPlacement, type Portal, type ZoneInfo } from "./builder/ArchitectureBuilder";
import { ExteriorBuilder, EXTERIOR } from "./builder/ExteriorBuilder";
import { BatchSet, type MeshBatch } from "./builder/MeshBatch";
import { RoofBuilder } from "./builder/RoofBuilder";
import { StairBuilder } from "./builder/StairBuilder";
import { HOSPITAL } from "./layout/hospital";
import { indexLayout, type LayoutIndex } from "./layout/LayoutGrid";
import type { FloorId, HospitalLayout, RoomDef } from "./layout/types";

/**
 * Le monde statique : construit UNE fois au chargement (le restart ne reconstruit rien).
 * Contient la géométrie fusionnée par zone × matériau, les colliders, les zones/portails.
 */
export class World {
  readonly layout: HospitalLayout = HOSPITAL;
  readonly index: LayoutIndex;
  readonly batches = new BatchSet();
  zones = new Map<string, ZoneInfo>();
  portals: Portal[] = [];
  openings: OpeningPlacement[] = [];
  /** meshes statiques par zone */
  readonly zoneMeshes = new Map<string, Mesh[]>();
  readonly meshes: Mesh[] = [];
  /** colliders temporaires / de gameplay (portes condamnées, ascenseur…) */
  readonly blockers: Collider[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly collision: CollisionWorld,
    private readonly materials: MaterialLibrary,
  ) {
    this.index = indexLayout(this.layout);
    if (this.index.errors.length) console.warn("Layout :", this.index.errors);
  }

  get spawn(): { x: number; y: number; z: number; yaw: number } {
    return this.layout.spawn;
  }

  floorY(id: FloorId): number {
    return this.layout.floors.find((f) => f.id === id)!.y;
  }

  roomAt(x: number, y: number, z: number): RoomDef | null {
    // niveau le plus haut dont le sol est sous les pieds (tolérance escaliers)
    const floors = [...this.layout.floors].sort((a, b) => b.y - a.y);
    for (const f of floors) {
      if (y >= f.y - 0.6) {
        const r = this.index.grids.get(f.id)?.roomAt(x, z) ?? null;
        if (r) return r;
      }
    }
    return null;
  }

  /** Étapes de construction (séparées pour l'écran de chargement). */
  buildGeometry(): void {
    const arch = new ArchitectureBuilder(this.layout, this.index, this.batches).build();
    this.zones = arch.zones;
    this.portals = arch.portals;
    this.openings = arch.openings;
    this.collision.addMany(arch.colliders);

    const stairs = new StairBuilder(this.layout, this.batches);
    stairs.build();
    this.collision.addMany(stairs.colliders);

    const roof = new RoofBuilder(this.layout, this.index, this.batches);
    roof.build();
    this.collision.addMany(roof.colliders);

    const ext = new ExteriorBuilder(this.batches);
    ext.build();
    this.collision.addMany(ext.colliders);

    this.addBarriers();
    this.addTemporaryBlockers();
  }

  /** Crée les meshes Babylon à partir des lots. */
  createMeshes(): void {
    for (const batch of this.batches) {
      if (batch.empty) continue;
      const mesh = this.meshFromBatch(batch);
      this.meshes.push(mesh);
      const list = this.zoneMeshes.get(batch.zone) ?? [];
      list.push(mesh);
      this.zoneMeshes.set(batch.zone, list);
    }
  }

  private meshFromBatch(batch: MeshBatch): Mesh {
    const mesh = batch.toMesh(this.scene, `z:${batch.key}`);
    mesh.material = this.materials.get(batch.material);
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.doNotSyncBoundingInfo = true;
    mesh.freezeWorldMatrix();
    mesh.metadata = { zone: batch.zone };
    return mesh;
  }

  /** Obstacles bas : passage accroupi pour le joueur, saut pour l'IA (selon la difficulté). */
  private addBarriers(): void {
    for (const b of this.layout.barriers) {
      const y = this.floorY(b.floor);
      const [x0, z0, x1, z1] = b.area;
      const top = b.kind === "tree" ? 1.75 : 1.62;
      this.collision.add(makeAABB(x0, y + 1.16, z0, x1, y + top, z1, { mask: CollisionMask.ALL, surface: "wood", tag: { barrier: b.id } }));
      const batch = this.batches.get(this.roomAt((x0 + x1) / 2, y + 0.5, (z0 + z1) / 2)?.id ?? "ext", b.kind === "tree" ? "bark" : "metal_rail");
      batch.box(x0, y + 1.16, z0, x1, y + top, z1, 1);
    }
  }

  /**
   * Bloqueurs provisoires (remplacés par les vrais objets de gameplay en phase 5) :
   * portes condamnées, paliers d'ascenseur, portail, grille des ambulances.
   */
  private addTemporaryBlockers(): void {
    for (const o of this.openings) {
      const sealed = o.spec?.lock === "sealed" || o.kind === "elevator";
      if (!sealed) continue;
      const hw = o.width / 2;
      const c =
        o.axis === "x"
          ? makeAABB(o.x - hw, o.y, o.z - 0.1, o.x + hw, o.y + o.top, o.z + 0.1, { mask: CollisionMask.ALL })
          : makeAABB(o.x - 0.1, o.y, o.z - hw, o.x + 0.1, o.y + o.top, o.z + hw, { mask: CollisionMask.ALL });
      c.tag = { blocker: o.id };
      this.blockers.push(c);
    }
    const g = EXTERIOR.mainGate;
    this.blockers.push(makeAABB(g.x0 - 0.2, 0, g.z - 0.1, g.x1 + 0.2, 2.8, g.z + 0.1, { mask: CollisionMask.ALL, tag: { blocker: "mainGate" } }));
    const bg = EXTERIOR.bayGate;
    this.blockers.push(makeAABB(bg.x - 0.1, 0, bg.z0 - 0.2, bg.x + 0.1, 2.6, bg.z1 + 0.2, { mask: CollisionMask.ALL, tag: { blocker: "bayGate" } }));
    this.collision.addMany(this.blockers);
  }

  /** Statistiques de debug. */
  stats(): string {
    let tris = 0;
    let verts = 0;
    for (const b of this.batches) {
      tris += b.indices.length / 3;
      verts += b.vertexCount;
    }
    return `${this.meshes.length} meshes · ${Math.round(tris / 1000)}k tris · ${Math.round(verts / 1000)}k verts · ${this.collision.all.length} colliders · ${this.zones.size} zones`;
  }
}
