import type { FloorDef, FloorId, HospitalLayout, OpeningDef, Rect, RoomDef } from "./types";

export const CELL_AIR = -1;
export const CELL_SOLID = -2;

function inRect(r: Rect, x: number, z: number): boolean {
  return x >= r[0] && x < r[2] && z >= r[1] && z < r[3];
}

/**
 * Rasterisation d'un niveau sur une grille de 1 m : chaque cellule contient l'index de la pièce,
 * CELL_AIR (extérieur / patio) ou CELL_SOLID (masse pleine à l'intérieur de l'emprise).
 */
export class FloorGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly w: number;
  readonly d: number;
  readonly cells: Int32Array;
  readonly rooms: RoomDef[];

  constructor(readonly floor: FloorDef, allRooms: RoomDef[], readonly errors: string[]) {
    this.rooms = allRooms.filter((r) => r.floor === floor.id);
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const r of [...floor.footprint, ...this.rooms.map((x) => x.rect)]) {
      minX = Math.min(minX, r[0]);
      minZ = Math.min(minZ, r[1]);
      maxX = Math.max(maxX, r[2]);
      maxZ = Math.max(maxZ, r[3]);
    }
    // marge d'une cellule d'air tout autour
    this.minX = minX - 1;
    this.minZ = minZ - 1;
    this.maxX = maxX + 1;
    this.maxZ = maxZ + 1;
    this.w = this.maxX - this.minX;
    this.d = this.maxZ - this.minZ;
    this.cells = new Int32Array(this.w * this.d).fill(CELL_AIR);

    for (let iz = 0; iz < this.d; iz++) {
      for (let ix = 0; ix < this.w; ix++) {
        const x = ix + this.minX;
        const z = iz + this.minZ;
        const inFoot = floor.footprint.some((r) => inRect(r, x, z)) && !floor.holes.some((r) => inRect(r, x, z));
        if (inFoot) this.cells[iz * this.w + ix] = CELL_SOLID;
      }
    }
    this.rooms.forEach((room, idx) => {
      const [x0, z0, x1, z1] = room.rect;
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const i = this.index(x, z);
          if (i < 0) continue;
          const prev = this.cells[i]!;
          if (prev >= 0) errors.push(`[${floor.id}] chevauchement ${room.id} / ${this.rooms[prev]!.id} en (${x},${z})`);
          this.cells[i] = idx;
        }
      }
    });
  }

  index(x: number, z: number): number {
    const ix = x - this.minX;
    const iz = z - this.minZ;
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.d) return -1;
    return iz * this.w + ix;
  }

  /** Contenu de la cellule (x, z) en coordonnées de cellule entières. */
  at(x: number, z: number): number {
    const i = this.index(x, z);
    return i < 0 ? CELL_AIR : this.cells[i]!;
  }

  roomAt(x: number, z: number): RoomDef | null {
    const c = this.at(Math.floor(x), Math.floor(z));
    return c >= 0 ? this.rooms[c]! : null;
  }

  /** Les deux « espaces » de part et d'autre d'un point de ligne de mur. */
  sidesOf(o: { axis: "x" | "z"; x: number; z: number }): [number, number] {
    if (o.axis === "x") {
      const cx = Math.floor(o.x);
      return [this.at(cx, o.z - 1), this.at(cx, o.z)];
    }
    const cz = Math.floor(o.z);
    return [this.at(o.x - 1, cz), this.at(o.x, cz)];
  }
}

export interface LayoutIndex {
  grids: Map<FloorId, FloorGrid>;
  roomsById: Map<string, RoomDef>;
  errors: string[];
}

/** Construit les grilles de tous les niveaux et valide la cohérence du layout. */
export function indexLayout(layout: HospitalLayout): LayoutIndex {
  const errors: string[] = [];
  const grids = new Map<FloorId, FloorGrid>();
  for (const f of layout.floors) grids.set(f.id, new FloorGrid(f, layout.rooms, errors));
  const roomsById = new Map<string, RoomDef>();
  for (const r of layout.rooms) {
    if (roomsById.has(r.id)) errors.push(`id de pièce dupliqué : ${r.id}`);
    roomsById.set(r.id, r);
    if (r.rect[2] <= r.rect[0] || r.rect[3] <= r.rect[1]) errors.push(`pièce vide : ${r.id}`);
  }
  const ids = new Set<string>();
  for (const o of layout.openings) {
    if (ids.has(o.id)) errors.push(`id d'ouverture dupliqué : ${o.id}`);
    ids.add(o.id);
    validateOpening(o, grids.get(o.floor), errors);
  }
  return { grids, roomsById, errors };
}

function validateOpening(o: OpeningDef, grid: FloorGrid | undefined, errors: string[]): void {
  if (!grid) {
    errors.push(`ouverture ${o.id} : niveau ${o.floor} inconnu`);
    return;
  }
  const lineCoord = o.axis === "x" ? o.z : o.x;
  if (!Number.isInteger(lineCoord)) errors.push(`ouverture ${o.id} : la ligne de mur doit être entière`);
  const half = o.width / 2;
  const along = o.axis === "x" ? o.x : o.z;
  let first: [number, number] | null = null;
  for (let t = along - half + 0.25; t < along + half; t += 0.5) {
    const p = o.axis === "x" ? { axis: o.axis, x: t, z: o.z } : { axis: o.axis, x: o.x, z: t };
    const s = grid.sidesOf(p);
    if (s[0] === s[1]) {
      errors.push(`ouverture ${o.id} : pas de mur à (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
      return;
    }
    if (s[0] === -2 || s[1] === -2) {
      errors.push(`ouverture ${o.id} : donne sur de la masse pleine`);
      return;
    }
    if (!first) first = s;
    else if (first[0] !== s[0] || first[1] !== s[1]) {
      errors.push(`ouverture ${o.id} : chevauche deux murs différents`);
      return;
    }
  }
}
