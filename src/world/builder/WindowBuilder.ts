import type { OpeningPlacement } from "./ArchitectureBuilder";
import { EXTERIOR_ZONE, WALL_T } from "./ArchitectureBuilder";
import type { BatchSet, MeshBatch } from "./MeshBatch";

const FRAME = 0.055;
const HALF_T = WALL_T / 2;

/**
 * Menuiseries des fenêtres : cadre + meneau + vitrage sale ; éclats de verre pour les
 * fenêtres cassées (franchissables), conduits de ventilation avec grille arrachée.
 */
export class WindowBuilder {
  constructor(
    private readonly openings: OpeningPlacement[],
    private readonly batches: BatchSet,
  ) {}

  build(): void {
    for (const o of this.openings) {
      if (o.kind === "window") this.window(o);
      else if (o.kind === "vent") this.vent(o);
    }
  }

  private zoneOf(o: OpeningPlacement): string {
    if (o.roomA && o.roomA.kind !== "outdoor") return o.roomA.id;
    if (o.roomB && o.roomB.kind !== "outdoor") return o.roomB.id;
    return o.roomA?.id ?? o.roomB?.id ?? EXTERIOR_ZONE;
  }

  /** Boîte dans le repère de l'ouverture : a = le long du mur, b = hauteur, c = épaisseur. */
  private box(b: MeshBatch, o: OpeningPlacement, a0: number, a1: number, y0: number, y1: number, c0: number, c1: number): void {
    const along = o.axis === "x" ? o.x : o.z;
    const line = o.axis === "x" ? o.z : o.x;
    if (o.axis === "x") b.box(along + a0, o.y + y0, line + c0, along + a1, o.y + y1, line + c1, 1);
    else b.box(line + c0, o.y + y0, along + a0, line + c1, o.y + y1, along + a1, 1);
  }

  private window(o: OpeningPlacement): void {
    const zone = this.zoneOf(o);
    const frame = this.batches.get(zone, "window_frame");
    const hw = o.width / 2;
    const y0 = o.bottom;
    const y1 = o.top;
    const c0 = -0.035;
    const c1 = 0.035;
    // cadre
    this.box(frame, o, -hw, -hw + FRAME, y0, y1, c0, c1);
    this.box(frame, o, hw - FRAME, hw, y0, y1, c0, c1);
    this.box(frame, o, -hw, hw, y0, y0 + FRAME, c0 - 0.02, c1 + 0.02);
    this.box(frame, o, -hw, hw, y1 - FRAME, y1, c0, c1);
    // meneau + traverse
    if (o.width > 1.3) this.box(frame, o, -0.025, 0.025, y0, y1, c0, c1);
    this.box(frame, o, -hw, hw, y1 - 0.45, y1 - 0.41, c0, c1);
    // appui extérieur
    this.box(frame, o, -hw - 0.05, hw + 0.05, y0 - 0.05, y0, -HALF_T - 0.06, HALF_T + 0.06);

    const glass = this.batches.get(zone, "glass");
    const along = o.axis === "x" ? o.x : o.z;
    const line = o.axis === "x" ? o.z : o.x;
    const gy0 = o.y + y0 + FRAME;
    const gy1 = o.y + y1 - FRAME;
    const ga0 = along - hw + FRAME;
    const ga1 = along + hw - FRAME;
    if (!o.broken) {
      if (o.axis === "x") glass.quad({ x: ga0, y: gy0, z: line }, { x: ga1 - ga0, y: 0, z: 0 }, { x: 0, y: gy1 - gy0, z: 0 }, { x: 0, y: 0, z: 1 }, [ga0, gy0], [ga1 - ga0, gy1 - gy0]);
      else glass.quad({ x: line, y: gy0, z: ga0 }, { x: 0, y: 0, z: ga1 - ga0 }, { x: 0, y: gy1 - gy0, z: 0 }, { x: 1, y: 0, z: 0 }, [ga0, gy0], [ga1 - ga0, gy1 - gy0]);
    } else {
      // éclats restés dans le cadre
      const shards: Array<Array<[number, number]>> = [
        [
          [0, 0],
          [0.35, 0],
          [0, 0.55],
        ],
        [
          [1, 1],
          [0.55, 1],
          [1, 0.4],
        ],
        [
          [1, 0],
          [0.8, 0],
          [1, 0.25],
        ],
        [
          [0, 1],
          [0.25, 1],
          [0, 0.8],
        ],
      ];
      for (const tri of shards) {
        const base = glass.vertexCount;
        for (const [a, b] of tri) {
          const pa = ga0 + (ga1 - ga0) * a;
          const py = gy0 + (gy1 - gy0) * b;
          if (o.axis === "x") glass.vertex(pa, py, line, 0, 0, 1, pa, py);
          else glass.vertex(line, py, pa, 1, 0, 0, pa, py);
        }
        glass.tri(base, base + 1, base + 2, o.axis === "x" ? 0 : 1, 0, o.axis === "x" ? 1 : 0);
      }
    }
  }

  /** Conduit : cadre de grille métallique + grille pendante. */
  private vent(o: OpeningPlacement): void {
    const zone = this.zoneOf(o);
    const frame = this.batches.get(zone, "metal_rail");
    const hw = o.width / 2;
    const top = o.top;
    this.box(frame, o, -hw - 0.04, -hw, 0, top + 0.04, -HALF_T - 0.02, HALF_T + 0.02);
    this.box(frame, o, hw, hw + 0.04, 0, top + 0.04, -HALF_T - 0.02, HALF_T + 0.02);
    this.box(frame, o, -hw - 0.04, hw + 0.04, top, top + 0.05, -HALF_T - 0.02, HALF_T + 0.02);
    // grille arrachée qui pend d'un côté
    for (let i = 0; i < 6; i++) {
      const a = -hw + 0.08 + i * ((o.width - 0.16) / 5);
      this.box(frame, o, a - 0.008, a + 0.008, 0.25, top - 0.02, HALF_T + 0.05 + i * 0.01, HALF_T + 0.065 + i * 0.01);
    }
  }
}
