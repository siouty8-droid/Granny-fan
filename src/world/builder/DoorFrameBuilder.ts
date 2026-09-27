import type { OpeningPlacement } from "./ArchitectureBuilder";
import { EXTERIOR_ZONE, WALL_T } from "./ArchitectureBuilder";
import type { BatchSet, MeshBatch } from "./MeshBatch";

const HALF_T = WALL_T / 2;
/** largeur du chambranle */
const CASING = 0.07;
/** saillie du chambranle hors du mur */
const PROUD = 0.022;
/** épaisseur de l'huisserie dans l'ébrasement */
const LINING = 0.03;

/**
 * Huisseries des portes (et palières d'ascenseur) : habillage métallique de l'ébrasement +
 * chambranle sur chaque face. Géométrie statique, précalculée avec le reste.
 */
export class DoorFrameBuilder {
  constructor(
    private readonly openings: OpeningPlacement[],
    private readonly batches: BatchSet,
  ) {}

  build(): void {
    for (const o of this.openings) {
      if (o.kind !== "door" && o.kind !== "double" && o.kind !== "elevator") continue;
      this.frame(o);
    }
  }

  /** Boîte dans le repère de l'ouverture : a = le long du mur, y = hauteur, c = profondeur. */
  private box(b: MeshBatch, o: OpeningPlacement, a0: number, a1: number, y0: number, y1: number, c0: number, c1: number): void {
    const along = o.axis === "x" ? o.x : o.z;
    const line = o.axis === "x" ? o.z : o.x;
    if (o.axis === "x") b.box(along + a0, o.y + y0, line + c0, along + a1, o.y + y1, line + c1, 1);
    else b.box(line + c0, o.y + y0, along + a0, line + c1, o.y + y1, along + a1, 1);
  }

  private frame(o: OpeningPlacement): void {
    const mat = o.kind === "elevator" ? "metal_brushed" : "window_frame";
    const hw = o.width / 2;
    const top = o.top;
    const zoneA = o.roomA?.id ?? EXTERIOR_ZONE;
    const zoneB = o.roomB?.id ?? EXTERIOR_ZONE;
    // huisserie dans l'ébrasement (côté A pour moitié, côté B pour l'autre moitié)
    for (const [zone, c0, c1] of [
      [zoneA, -HALF_T - PROUD, 0],
      [zoneB, 0, HALF_T + PROUD],
    ] as Array<[string, number, number]>) {
      const b = this.batches.get(zone, mat);
      this.box(b, o, -hw, -hw + LINING, 0, top, c0, c1);
      this.box(b, o, hw - LINING, hw, 0, top, c0, c1);
      this.box(b, o, -hw, hw, top - LINING, top, c0, c1);
    }
    // chambranles sur chaque face
    for (const [zone, s] of [
      [zoneA, -1],
      [zoneB, 1],
    ] as Array<[string, number]>) {
      const b = this.batches.get(zone, mat);
      const c0 = s < 0 ? -HALF_T - PROUD : HALF_T;
      const c1 = s < 0 ? -HALF_T : HALF_T + PROUD;
      this.box(b, o, -hw - CASING, -hw, 0, top + CASING, c0, c1);
      this.box(b, o, hw, hw + CASING, 0, top + CASING, c0, c1);
      this.box(b, o, -hw - CASING, hw + CASING, top, top + CASING, c0, c1);
    }
  }
}
