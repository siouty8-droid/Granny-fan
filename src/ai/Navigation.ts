import * as RecastCore from "@recast-navigation/core";
import * as RecastGenerators from "@recast-navigation/generators";
import { CreateNavigationPluginAsync, type RecastNavigationJSPluginV2 } from "@babylonjs/addons/navigation";
import type { IOffMeshConnection } from "@babylonjs/addons/navigation/types";
import type { IObstacle } from "@babylonjs/core/Navigation/INavigationEngine";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { CollisionMask, type Collider } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { World } from "../world/World";

/** Drapeaux des polygones / liaisons de la navmesh. */
export const NavFlags = {
  WALK: 1,
  /** saut de barrière basse */
  JUMP: 2,
  /** raccourci (fenêtre cassée…) */
  SHORTCUT: 4,
} as const;

/** Liaison hors-maillage connue du gameplay (saut, fenêtre). */
export interface NavLink {
  id: string;
  a: Vector3;
  b: Vector3;
  flags: number;
  bidirectional: boolean;
  kind: "jump" | "vault" | "drop";
}

const CELL = 0.15;
const CELL_H = 0.1;

/**
 * Navigation du monstre : navmesh Recast (plugin de navigation Babylon V2, tile cache)
 * générée au chargement depuis les colliders statiques « NAV » (sols, murs, rampes d'escalier,
 * meubles), obstacles dynamiques pour les portes verrouillées, liaisons hors-maillage pour
 * les sauts de barrières et les raccourcis (filtrés selon la difficulté).
 */
export class Navigation {
  private plugin!: RecastNavigationJSPluginV2;
  readonly links: NavLink[] = [];
  private filters = new Map<number, RecastCore.QueryFilter>();
  private obstacles = new Map<string, IObstacle>();
  private readonly halfExtents = { x: 1.2, y: 2.5, z: 1.2 };
  ready = false;
  buildMs = 0;

  constructor(
    private readonly world: World,
    private readonly collision: CollisionWorld,
  ) {}

  async build(scene: Scene): Promise<void> {
    const t0 = performance.now();
    await RecastCore.init();
    this.plugin = await CreateNavigationPluginAsync({ instance: { ...RecastCore, ...RecastGenerators } });
    const source = this.sourceMesh(scene);
    this.makeLinks();
    const offMesh: IOffMeshConnection[] = this.links.map((l, i) => ({
      startPosition: l.a,
      endPosition: l.b,
      radius: 0.5,
      bidirectional: l.bidirectional,
      area: 0,
      flags: l.flags,
      userId: i,
    }));
    const process = new RecastCore.TileCacheMeshProcess((params, polyAreas, polyFlags) => {
      for (let i = 0; i < params.polyCount(); ++i) {
        polyAreas.set(i, 0);
        polyFlags.set(i, NavFlags.WALK);
      }
      params.setOffMeshConnections(offMesh);
    });
    this.plugin.createNavMesh([source], {
      cs: CELL,
      ch: CELL_H,
      walkableSlopeAngle: 46,
      walkableHeight: Math.ceil(1.95 / CELL_H),
      walkableClimb: Math.floor(0.45 / CELL_H),
      walkableRadius: Math.round(0.3 / CELL),
      maxEdgeLen: 60,
      maxSimplificationError: 1.3,
      minRegionArea: 6,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
      tileSize: 64,
      maxObstacles: 96,
      expectedLayersPerTile: 6,
      tileCacheMeshProcess: process,
    });
    source.dispose();
    this.plugin.setDefaultQueryExtent(this.halfExtents);
    this.ready = true;
    this.buildMs = performance.now() - t0;
  }

  /** Géométrie de navigation : boîtes et rampes statiques du masque NAV. */
  private sourceMesh(scene: Scene): Mesh {
    const pos: number[] = [];
    const idx: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      // triangles dans l'orientation Babylon (normale = −(b−a)×(c−a)), inversés par le plugin pour Recast
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    for (const c of this.collision.all) {
      if (!(c.mask & CollisionMask.NAV) || !c.enabled) continue;
      this.emitCollider(c, quad);
    }
    const mesh = new Mesh("navSource", scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.indices = idx;
    vd.applyToMesh(mesh, false);
    mesh.setEnabled(false);
    mesh.isPickable = false;
    return mesh;
  }

  private emitCollider(c: Collider, quad: (a: number[], b: number[], c: number[], d: number[]) => void): void {
    const corner = (lx: number, lz: number): [number, number] => [c.cx + lx * c.cos - lz * c.sin, c.cz + lx * c.sin + lz * c.cos];
    const p00 = corner(-c.hx, -c.hz);
    const p10 = corner(c.hx, -c.hz);
    const p11 = corner(c.hx, c.hz);
    const p01 = corner(-c.hx, c.hz);
    // hauteur du dessus : rampe (y0 → y1 le long de z local) ou plat
    const t0 = c.ramp ? c.y0 : c.maxY;
    const t1 = c.ramp ? c.y1 : c.maxY;
    const b = c.minY;
    const v = (p: [number, number], y: number) => [p[0], y, p[1]];
    // dessus (vers le haut), orientation vérifiée pour un repère dont le z local est « avant »
    const top = [v(p00, t0), v(p10, t0), v(p11, t1), v(p01, t1)];
    quad(top[0]!, top[3]!, top[2]!, top[1]!);
    // côtés
    quad(v(p00, b), v(p10, b), v(p10, t0), v(p00, t0));
    quad(v(p10, b), v(p11, b), v(p11, t1), v(p10, t0));
    quad(v(p11, b), v(p01, b), v(p01, t1), v(p11, t1));
    quad(v(p01, b), v(p00, b), v(p00, t0), v(p01, t1));
  }

  /** Liaisons : sauts par-dessus les barrières basses, fenêtres cassées. */
  private makeLinks(): void {
    for (const bar of this.world.layout.barriers) {
      const y = this.world.floorY(bar.floor);
      const [x0, z0, x1, z1] = bar.area;
      const alongX = x1 - x0 >= z1 - z0;
      // on traverse selon l'axe court ; plusieurs liaisons si la barrière est longue
      const len = alongX ? x1 - x0 : z1 - z0;
      const n = Math.max(1, Math.round(len / 4));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        if (alongX) {
          const x = x0 + (x1 - x0) * t;
          this.links.push({ id: `${bar.id}_${i}`, a: new Vector3(x, y, z0 - 0.75), b: new Vector3(x, y, z1 + 0.75), flags: NavFlags.JUMP, bidirectional: true, kind: "jump" });
        } else {
          const z = z0 + (z1 - z0) * t;
          this.links.push({ id: `${bar.id}_${i}`, a: new Vector3(x0 - 0.75, y, z), b: new Vector3(x1 + 0.75, y, z), flags: NavFlags.JUMP, bidirectional: true, kind: "jump" });
        }
      }
    }
    for (const o of this.world.openings) {
      if (o.kind !== "window" || !o.broken) continue;
      const nx = o.axis === "x" ? 0 : 1;
      const nz = o.axis === "x" ? 1 : 0;
      const a = new Vector3(o.x + nx * 0.9, o.y, o.z + nz * 0.9);
      const b = new Vector3(o.x - nx * 0.9, o.y, o.z - nz * 0.9);
      if (!o.roomA || !o.roomB) {
        if (o.floor === "U") {
          // de l'étage vers la cour (sens unique)
          const inside = o.roomA ? b : a;
          const outside = o.roomA ? a : b;
          const g = this.world.collisionGround(outside.x, outside.z, o.y - 1);
          outside.y = Number.isFinite(g) ? g : 0;
          this.links.push({ id: `win_${o.id}`, a: inside, b: outside, flags: NavFlags.SHORTCUT, bidirectional: false, kind: "drop" });
          continue;
        }
      }
      this.links.push({ id: `win_${o.id}`, a, b, flags: NavFlags.SHORTCUT, bidirectional: true, kind: "vault" });
    }
  }

  /** Filtre de requête pour un masque de drapeaux. */
  filter(flags: number): RecastCore.QueryFilter {
    let f = this.filters.get(flags);
    if (!f) {
      f = new RecastCore.QueryFilter();
      f.includeFlags = flags;
      f.excludeFlags = 0;
      this.filters.set(flags, f);
    }
    return f;
  }

  /** Chemin (coins) de `from` à `to` ; vide si impossible. */
  path(from: Vector3, to: Vector3, flags: number): Vector3[] {
    if (!this.ready) return [];
    try {
      return this.plugin.computePath(from, to, { filter: this.filter(flags), halfExtents: this.halfExtents, maxPathPolys: 512, maxStraightPathPoints: 256 });
    } catch {
      return [];
    }
  }

  closest(p: Vector3, flags: number = NavFlags.WALK): Vector3 {
    return this.plugin.getClosestPoint(p, { filter: this.filter(flags), halfExtents: this.halfExtents });
  }

  randomAround(p: Vector3, radius: number, flags: number = NavFlags.WALK): Vector3 {
    return this.plugin.getRandomPointAround(p, radius, { filter: this.filter(flags), halfExtents: this.halfExtents });
  }

  setRandomSeed(seed: number): void {
    this.plugin.setRandomSeed(seed);
  }

  /** Bloque un passage (porte verrouillée). */
  block(id: string, x: number, y: number, z: number, hx: number, hy: number, hz: number, angle = 0): void {
    if (!this.ready || this.obstacles.has(id)) return;
    const o = this.plugin.addBoxObstacle({ x, y, z }, { x: hx, y: hy, z: hz }, angle);
    if (o) this.obstacles.set(id, o);
  }

  unblock(id: string): void {
    const o = this.obstacles.get(id);
    if (!o) return;
    this.plugin.removeObstacle(o);
    this.obstacles.delete(id);
  }

  isBlocked(id: string): boolean {
    return this.obstacles.has(id);
  }

  /** Maillage de debug (visualisation). */
  debugMesh(scene: Scene): Mesh {
    return this.plugin.createDebugNavMesh(scene);
  }
}
