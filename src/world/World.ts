import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { makeAABB, CollisionMask } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { MaterialLibrary } from "../render/materials/MaterialLibrary";
import { ArchitectureBuilder, layoutBounds, type OpeningPlacement, type Portal, type ZoneInfo } from "./builder/ArchitectureBuilder";
import { ExteriorBuilder } from "./builder/ExteriorBuilder";
import { BatchSet, type MeshBatch } from "./builder/MeshBatch";
import { RoofBuilder } from "./builder/RoofBuilder";
import { StairBuilder } from "./builder/StairBuilder";
import { WindowBuilder } from "./builder/WindowBuilder";
import { DoorFrameBuilder } from "./builder/DoorFrameBuilder";
import { DecalPlacer } from "./decor/Decals";
import { HOSPITAL } from "./layout/hospital";
import { MallBuilder } from "./builder/MallBuilder";
import { indexLayout, type LayoutIndex } from "./layout/LayoutGrid";
import { LightBaker } from "./lighting/LightBaker";
import { placeFixtures, type Fixture } from "./lighting/Lights";
import { VoxelGrid } from "./lighting/VoxelGrid";
import { PropSystem } from "./props/PropSystem";
import { allPropDefs } from "./props/catalog";
import { Decorator, type HidingCandidate } from "./decor/Decorator";
import { EmissiveMaterials } from "../render/materials/EmissiveMaterials";
import type { Material } from "@babylonjs/core/Materials/material";
import type { FloorId, HospitalLayout, RoomDef } from "./layout/types";
import { gameplayReservations } from "../gameplay/data/fixtures";

/**
 * Le monde statique : construit UNE fois au chargement (le restart ne reconstruit rien).
 * Contient la géométrie fusionnée par zone × matériau, les colliders, les zones/portails.
 */
export class World {
  readonly index: LayoutIndex;
  readonly batches = new BatchSet();
  zones = new Map<string, ZoneInfo>();
  portals: Portal[] = [];
  openings: OpeningPlacement[] = [];
  /** meshes statiques par zone */
  readonly zoneMeshes = new Map<string, Mesh[]>();
  readonly meshes: Mesh[] = [];
  fixtures: Fixture[] = [];
  zoneSlots = new Map<string, number>();
  voxels: VoxelGrid | null = null;
  baker: LightBaker | null = null;
  readonly props: PropSystem;
  readonly emissive: EmissiveMaterials;
  hiding: HidingCandidate[] = [];
  /** décalage de sol le plus bas par niveau (voies du métro en contrebas) */
  private readonly sunk = new Map<FloorId, number>();

  constructor(
    private readonly scene: Scene,
    readonly collision: CollisionWorld,
    private readonly materials: MaterialLibrary,
    readonly layout: HospitalLayout = HOSPITAL,
  ) {
    this.index = indexLayout(this.layout);
    for (const r of this.layout.rooms) if (r.floorOffset) this.sunk.set(r.floor, Math.min(this.sunk.get(r.floor) ?? 0, r.floorOffset));
    if (this.index.errors.length) console.warn("Layout :", this.index.errors);
    this.emissive = new EmissiveMaterials(scene);
    this.props = new PropSystem(scene, (id): Material => {
      if (id === "props") return this.materials.props();
      if (id === "items") return this.materials.items();
      return this.emissive.get(id) ?? this.materials.props();
    });
    for (const def of allPropDefs()) this.props.register(def);
  }

  get spawn(): { x: number; y: number; z: number; yaw: number } {
    return this.layout.spawn;
  }

  floorY(id: FloorId): number {
    return this.layout.floors.find((f) => f.id === id)!.y;
  }

  roomAt(x: number, y: number, z: number): RoomDef | null {
    // niveau le plus haut dont le sol est sous les pieds (tolérance escaliers), sans dépasser son plafond
    const floors = [...this.layout.floors].sort((a, b) => b.y - a.y);
    for (const f of floors) {
      if (y < f.y - 0.6 + (this.sunk.get(f.id) ?? 0)) continue;
      const r = this.index.grids.get(f.id)?.roomAt(x, z) ?? null;
      if (r && y <= f.y + (r.ceiling ?? f.ceiling) + 0.35) return r;
    }
    return null;
  }

  /** Hauteur du sol (joueur) sous (x, z), sous `maxY`. */
  collisionGround(x: number, z: number, maxY: number): number {
    return this.collision.groundHeight(x, z, maxY, CollisionMask.PLAYER);
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

    if (this.layout.id === "hospital") {
      const roof = new RoofBuilder(this.layout, this.index, this.batches);
      roof.build();
      this.collision.addMany(roof.colliders);

      const ext = new ExteriorBuilder(this.batches);
      ext.build();
      this.collision.addMany(ext.colliders);
    } else {
      const mall = new MallBuilder(this.layout, this.index, this.batches);
      mall.build();
      this.collision.addMany(mall.colliders);
    }

    this.addBarriers();

    // luminaires + habillage (avant la navmesh et le bake : les props occultent la lumière)
    const { fixtures, zoneSlots } = placeFixtures(this.layout, this.zones);
    this.fixtures = fixtures;
    this.zoneSlots = zoneSlots;
    const deco = new Decorator(this.layout, this.openings, this.props, this.layout.id === "hospital" ? gameplayReservations() : []);
    deco.run(fixtures);
    new WindowBuilder(this.openings, this.batches).build();
    new DoorFrameBuilder(this.openings, this.batches).build();
    new DecalPlacer(this.layout, this.openings, this.batches, this.props).run();
    this.hiding = deco.hiding;
    this.props.buildColliders(this.collision);
  }

  /** Génère les textures procédurales des matériaux utilisés. */
  async generateMaterials(onProgress: (p: number, label: string) => Promise<void>): Promise<void> {
    const ids = new Set<string>();
    for (const b of this.batches) if (!b.empty) ids.add(b.material);
    await this.materials.generate(ids, onProgress);
    await onProgress(1, "props");
    this.materials.props();
  }

  /** Précalcul de l'éclairage (voxelisation + luminaires + irradiance par sommet). */
  async bakeLighting(onProgress: (p: number, label: string) => Promise<void>): Promise<void> {
    const b = layoutBounds(this.layout);
    // marges : 6 m autour du bâtiment, de 1 m sous le niveau le plus bas (voies en contrebas : 2 m)
    const oy = Math.min(...this.layout.floors.map((f) => f.y)) - (this.layout.id === "hospital" ? 1 : 2);
    const top = this.layout.id === "hospital" ? 10 : 11;
    const vox = new VoxelGrid(b.minX - 6, oy, b.minZ - 6, b.maxX - b.minX + 14, top - oy, b.maxZ - b.minZ + 16, 0.25);
    for (const c of this.collision.all) {
      if (c.mask & CollisionMask.SIGHT) vox.fillCollider(c);
    }
    this.props.voxelize(vox);
    this.voxels = vox;
    // centre commercial : la verrière encrassée ne laisse passer qu'une partie du clair de lune
    const baker = new LightBaker(vox, this.fixtures, this.zones, this.zoneSlots, this.layout.id === "mall" ? 0.4 : 1);
    this.baker = baker;
    const list = [...this.batches].filter((b) => !b.empty);
    const total = list.reduce((a, b) => a + b.vertexCount, 0);
    let done = 0;
    let sinceYield = 0;
    for (const b of list) {
      baker.bakeBatch(b);
      done += b.vertexCount;
      sinceYield += b.vertexCount;
      if (sinceYield > 6000) {
        sinceYield = 0;
        await onProgress(done / total, `${Math.round((done / total) * 100)} %`);
      }
    }
    for (const b of list) baker.finalizeBatch(b);
    await onProgress(1, "props");
    this.props.buildGroups(baker);
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

  /** Statistiques de debug. */
  stats(): string {
    let tris = 0;
    let verts = 0;
    for (const b of this.batches) {
      tris += b.indices.length / 3;
      verts += b.vertexCount;
    }
    return `${this.meshes.length} meshes · ${Math.round(tris / 1000)}k tris · ${Math.round(verts / 1000)}k verts · ${this.collision.all.length} colliders · ${this.zones.size} zones · ${this.props.instances.length} props (${this.props.typeCount} types) · ${this.hiding.length} cachettes`;
  }
}
