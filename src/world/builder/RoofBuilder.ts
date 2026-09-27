import { makeAABB, CollisionMask, type Collider } from "../../physics/Collider";
import { CELL_AIR, type LayoutIndex } from "../layout/LayoutGrid";
import type { HospitalLayout } from "../layout/types";
import { EXTERIOR_ZONE, WALL_T } from "./ArchitectureBuilder";
import type { BatchSet } from "./MeshBatch";

const HALF_T = WALL_T / 2;
const PARAPET_H = 1.05;

/** Point de sortie par le toit (échelle de secours sur la façade est). */
export const ROOF_EXIT = { x: 79.3, z: 8.5, width: 1.4 };
/** Hélistation. */
export const HELIPAD = { x: 67, z: 27, r: 7.5 };

/**
 * Toit : dalle marchable (y = 8) au-dessus de l'étage, acrotères autour de l'emprise et du
 * vide de la cour, hélistation, trouée dans l'acrotère pour l'échelle de secours.
 */
export class RoofBuilder {
  readonly colliders: Collider[] = [];

  constructor(
    private readonly layout: HospitalLayout,
    private readonly index: LayoutIndex,
    private readonly batches: BatchSet,
  ) {}

  build(): void {
    const U = this.layout.floors.find((f) => f.id === "U")!;
    const R = this.layout.floors.find((f) => f.id === "R")!;
    const gridU = this.index.grids.get("U")!;
    const gridR = this.index.grids.get("R")!;
    const y = R.y;
    const roof = (x: number, z: number) => gridU.at(x, z) !== CELL_AIR;
    const roofOpen = (x: number, z: number) => roof(x, z) && gridR.at(x, z) === CELL_AIR;
    const batch = this.batches.get(EXTERIOR_ZONE, "roof_gravel");

    // dalle : bandes par rangée (hors locaux du toit, qui ont leur propre sol)
    for (let z = gridU.minZ; z < gridU.maxZ; z++) {
      let x = gridU.minX;
      while (x < gridU.maxX) {
        if (!roofOpen(x, z)) {
          x++;
          continue;
        }
        let e = x + 1;
        while (e < gridU.maxX && roofOpen(e, z)) e++;
        const len = e - x;
        batch.quad({ x, y, z }, { x: len, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, [x, z], [len, 1], Math.ceil(len / 1.5), 1);
        this.colliders.push(makeAABB(x, y - 0.6, z, e, y, z + 1, { surface: "concrete" }));
        x = e;
      }
    }
    // sous les locaux du toit : sol collision (le local a son propre visuel)
    void U;

    // acrotères sur les frontières toit / air
    const para = this.batches.get(EXTERIOR_ZONE, "facade");
    const cap = this.batches.get(EXTERIOR_ZONE, "coping");
    const exitMin = ROOF_EXIT.z - ROOF_EXIT.width / 2;
    const exitMax = ROOF_EXIT.z + ROOF_EXIT.width / 2;
    // lignes horizontales (z = k)
    for (let k = gridU.minZ; k <= gridU.maxZ; k++) {
      let x = gridU.minX;
      while (x < gridU.maxX) {
        const edge = roof(x, k - 1) !== roof(x, k);
        if (!edge) {
          x++;
          continue;
        }
        let e = x + 1;
        while (e < gridU.maxX && roof(e, k - 1) !== roof(e, k)) e++;
        this.parapet(para, cap, x - HALF_T, k - HALF_T, e + HALF_T, k + HALF_T, y);
        x = e;
      }
    }
    // lignes verticales (x = k)
    for (let k = gridU.minX; k <= gridU.maxX; k++) {
      let z = gridU.minZ;
      while (z < gridU.maxZ) {
        const edge = roof(k - 1, z) !== roof(k, z);
        if (!edge) {
          z++;
          continue;
        }
        let e = z + 1;
        while (e < gridU.maxZ && roof(k - 1, e) !== roof(k, e)) e++;
        // trouée pour l'échelle de secours
        if (k === 80 && exitMin > z && exitMax < e) {
          this.parapet(para, cap, k - HALF_T, z - HALF_T, k + HALF_T, exitMin, y);
          this.parapet(para, cap, k - HALF_T, exitMax, k + HALF_T, e + HALF_T, y);
        } else {
          this.parapet(para, cap, k - HALF_T, z - HALF_T, k + HALF_T, e + HALF_T, y);
        }
        z = e;
      }
    }

    // hélistation (disque peint)
    const pad = this.batches.get(EXTERIOR_ZONE, "helipad");
    const segs = 40;
    const base = pad.vertexCount;
    pad.vertex(HELIPAD.x, y + 0.012, HELIPAD.z, 0, 1, 0, 0.5, 0.5);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pad.vertex(HELIPAD.x + Math.cos(a) * HELIPAD.r, y + 0.012, HELIPAD.z + Math.sin(a) * HELIPAD.r, 0, 1, 0, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    }
    for (let i = 0; i < segs; i++) pad.tri(base, base + 1 + i, base + 2 + i, 0, 1, 0);
  }

  private parapet(
    wall: ReturnType<BatchSet["get"]>,
    cap: ReturnType<BatchSet["get"]>,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
  ): void {
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
    wall.box(x0, y, z0, x1, y + PARAPET_H - 0.06, z1, 1, { top: false, bottom: false });
    cap.box(x0 - 0.04, y + PARAPET_H - 0.06, z0 - 0.04, x1 + 0.04, y + PARAPET_H, z1 + 0.04, 1, { bottom: true });
    this.colliders.push(makeAABB(x0, y, z0, x1, y + PARAPET_H, z1, { mask: CollisionMask.ALL }));
  }
}
