import { makeAABB, CollisionMask, type Collider, type Surface } from "../../physics/Collider";
import { CELL_AIR, CELL_SOLID, type FloorGrid, type LayoutIndex } from "../layout/LayoutGrid";
import type { DoorSpec, FloorDef, FloorId, HospitalLayout, OpeningDef, OpeningKind, RoomDef } from "../layout/types";
import { THEMES } from "../themes";
import type { BatchSet } from "./MeshBatch";

/** Épaisseur des murs (m). */
export const WALL_T = 0.24;
const HALF_T = WALL_T / 2;
/** hauteur de la dalle sous chaque sol (collision + occlusion de vue) */
const SLAB = 0.8;
/** subdivision des faces pour l'éclairage par sommet */
const TESS = 1.0;

export const EXTERIOR_ZONE = "ext";

/** Ouverture résolue en coordonnées monde (porte, fenêtre, conduit…). */
export interface OpeningPlacement {
  id: string;
  floor: FloorId;
  kind: OpeningKind;
  axis: "x" | "z";
  /** centre de l'ouverture (sur la ligne de mur), y = sol */
  x: number;
  y: number;
  z: number;
  width: number;
  bottom: number;
  top: number;
  broken: boolean;
  spec: DoorSpec | null;
  /** zone côté négatif (z < ligne pour axis x, x < ligne pour axis z) */
  zoneA: string;
  zoneB: string;
  roomA: RoomDef | null;
  roomB: RoomDef | null;
}

export interface Portal {
  a: string;
  b: string;
  /** centre du portail */
  cx: number;
  cy: number;
  cz: number;
  /** axe normal au portail */
  normal: "x" | "y" | "z";
  /** demi-extensions dans le plan du portail */
  hw: number;
  hh: number;
  opening: OpeningPlacement | null;
}

export interface ZoneInfo {
  id: string;
  room: RoomDef | null;
  floor: FloorId | null;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  portals: Portal[];
  outdoor: boolean;
  sector: string;
}

export interface ArchitectureOutput {
  zones: Map<string, ZoneInfo>;
  portals: Portal[];
  openings: OpeningPlacement[];
  colliders: Collider[];
}

interface Interval {
  s: number;
  e: number;
  bottom: number;
  top: number;
  kind: OpeningKind;
  broken: boolean;
}

/**
 * Génère l'architecture intérieure : murs (frontières entre cellules d'espaces différents),
 * ouvertures (portes, fenêtres, arches, conduits), sols, plafonds, façades, colliders, zones.
 */
export class ArchitectureBuilder {
  readonly zones = new Map<string, ZoneInfo>();
  readonly portals: Portal[] = [];
  readonly openings: OpeningPlacement[] = [];
  readonly colliders: Collider[] = [];
  private floorsById = new Map<FloorId, FloorDef>();
  private openEdges = new Set<string>();

  constructor(
    private readonly layout: HospitalLayout,
    private readonly index: LayoutIndex,
    private readonly batches: BatchSet,
  ) {
    for (const f of layout.floors) this.floorsById.set(f.id, f);
  }

  build(): ArchitectureOutput {
    this.createZones();
    this.markOpenEdges();
    for (const f of this.layout.floors) {
      const grid = this.index.grids.get(f.id)!;
      this.buildLines(f, grid, "x");
      this.buildLines(f, grid, "z");
      this.buildFloorsAndCeilings(f, grid);
    }
    this.resolveOpenings();
    this.shaftPortals();
    return { zones: this.zones, portals: this.portals, openings: this.openings, colliders: this.colliders };
  }

  // ------------------------------------------------------------------ niveaux

  floorToFloor(f: FloorDef): number {
    const sorted = [...this.layout.floors].sort((a, b) => a.y - b.y);
    const i = sorted.indexOf(f);
    const next = sorted[i + 1];
    return next ? next.y - f.y : f.ceiling + 0.4;
  }

  /** Le niveau `f` est-il le plus bas / le plus haut de la cage `shaft` ? */
  private shaftEnds(room: RoomDef): { bottom: boolean; top: boolean } {
    if (!room.shaft) return { bottom: true, top: true };
    const same = this.layout.rooms.filter((r) => r.shaft === room.shaft).map((r) => this.floorsById.get(r.floor)!.y);
    const y = this.floorsById.get(room.floor)!.y;
    return { bottom: y <= Math.min(...same), top: y >= Math.max(...same) };
  }

  /** Hauteur visible des faces de mur d'une pièce. */
  private faceHeight(room: RoomDef, f: FloorDef): number {
    if (room.kind === "outdoor") return this.floorToFloor(f);
    if (room.shaft) {
      const ends = this.shaftEnds(room);
      return ends.top ? (room.ceiling ?? f.ceiling) : this.floorToFloor(f);
    }
    return room.ceiling ?? f.ceiling;
  }

  // ------------------------------------------------------------------ zones

  private createZones(): void {
    for (const r of this.layout.rooms) {
      const f = this.floorsById.get(r.floor)!;
      const h = r.kind === "outdoor" ? 12 : this.faceHeight(r, f);
      this.zones.set(r.id, {
        id: r.id,
        room: r,
        floor: r.floor,
        minX: r.rect[0],
        minY: f.y - 0.2,
        minZ: r.rect[1],
        maxX: r.rect[2],
        maxY: f.y + h + 0.2,
        maxZ: r.rect[3],
        portals: [],
        outdoor: r.kind === "outdoor",
        sector: r.sector,
      });
    }
    this.zones.set(EXTERIOR_ZONE, {
      id: EXTERIOR_ZONE,
      room: null,
      floor: null,
      minX: -40,
      minY: -1,
      minZ: -60,
      maxX: 130,
      maxY: 20,
      maxZ: 90,
      portals: [],
      outdoor: true,
      sector: "ext",
    });
  }

  /** Zone « vue » depuis une cellule d'air (patio du RDC si l'air est au-dessus de la cour). */
  private airZone(x: number, z: number): string {
    const g = this.index.grids.get("G");
    const r = g?.roomAt(x + 0.5, z + 0.5);
    if (r && r.kind === "outdoor") return r.id;
    return EXTERIOR_ZONE;
  }

  private cellZone(grid: FloorGrid, cell: number, x: number, z: number): string | null {
    if (cell >= 0) return grid.rooms[cell]!.id;
    if (cell === CELL_AIR) return this.airZone(x, z);
    return null;
  }

  // ------------------------------------------------------------------ arêtes « open »

  private edgeKey(floor: FloorId, axis: "x" | "z", k: number, t: number): string {
    return `${floor}|${axis}|${k}|${t}`;
  }

  private markOpenEdges(): void {
    for (const o of this.layout.openings) {
      if (o.kind !== "open") continue;
      const k = o.axis === "x" ? o.z : o.x;
      const along = o.axis === "x" ? o.x : o.z;
      for (let t = Math.floor(along - o.width / 2 + 1e-6); t < along + o.width / 2 - 1e-6; t++) {
        this.openEdges.add(this.edgeKey(o.floor, o.axis, k, t));
      }
    }
  }

  // ------------------------------------------------------------------ murs

  /**
   * Parcourt toutes les lignes de mur d'un axe.
   * axis "x" : lignes horizontales z = k (on avance en x) ; axis "z" : lignes verticales x = k.
   */
  private buildLines(f: FloorDef, grid: FloorGrid, axis: "x" | "z"): void {
    const kMin = axis === "x" ? grid.minZ : grid.minX;
    const kMax = axis === "x" ? grid.maxZ : grid.maxX;
    const tMin = axis === "x" ? grid.minX : grid.minZ;
    const tMax = axis === "x" ? grid.maxX : grid.maxZ;
    const cell = (k: number, t: number, side: 0 | 1): number =>
      axis === "x" ? grid.at(t, side === 0 ? k - 1 : k) : grid.at(side === 0 ? k - 1 : k, t);
    const isWall = (k: number, t: number): boolean => {
      const a = cell(k, t, 0);
      const b = cell(k, t, 1);
      if (a === b) return false;
      return !this.openEdges.has(this.edgeKey(f.id, axis, k, t));
    };
    // arête perpendiculaire au sommet (k, t) côté `side` : mur entre les cellules (t-1) et t de la rangée du côté
    const isPerpWall = (k: number, t: number, side: 0 | 1): boolean => {
      // la rangée de cellules côté `side` est à l'indice k-1 (side 0) ou k (side 1) de l'autre axe
      const row = side === 0 ? k - 1 : k;
      const otherAxis: "x" | "z" = axis === "x" ? "z" : "x";
      const a = axis === "x" ? grid.at(t - 1, row) : grid.at(row, t - 1);
      const b = axis === "x" ? grid.at(t, row) : grid.at(row, t);
      if (a === b) return false;
      return !this.openEdges.has(this.edgeKey(f.id, otherAxis, t, row));
    };

    for (let k = kMin; k <= kMax; k++) {
      let t = tMin;
      while (t < tMax) {
        if (!isWall(k, t)) {
          t++;
          continue;
        }
        const a = cell(k, t, 0);
        const b = cell(k, t, 1);
        let e = t + 1;
        while (e < tMax && isWall(k, e) && cell(k, e, 0) === a && cell(k, e, 1) === b) e++;
        this.buildRun(f, grid, axis, k, t, e, a, b, isWall, isPerpWall, cell);
        t = e;
      }
    }
  }

  private buildRun(
    f: FloorDef,
    grid: FloorGrid,
    axis: "x" | "z",
    k: number,
    t0: number,
    t1: number,
    a: number,
    b: number,
    isWall: (k: number, t: number) => boolean,
    isPerpWall: (k: number, t: number, side: 0 | 1) => boolean,
    cell: (k: number, t: number, side: 0 | 1) => number,
  ): void {
    const fh = this.floorToFloor(f);
    const intervals = this.openingsOnRun(f, axis, k, t0, t1);

    // --- faces de chaque côté
    for (const side of [0, 1] as const) {
      const c = side === 0 ? a : b;
      if (c === CELL_SOLID) continue;
      if (c === CELL_AIR && !f.exposed) continue;
      // extrémités : raccourcir (coin rentrant), prolonger (coin saillant) ou rien (continuité)
      const adj = (tv: number, dir: -1 | 1): number => {
        // tv = coordonnée du sommet ; dir = -1 pour l'extrémité basse, +1 pour la haute
        if (isPerpWall(k, tv, side)) return -dir * HALF_T; // on s'arrête avant le mur perpendiculaire
        const beyond = dir < 0 ? tv - 1 : tv;
        if (isWall(k, beyond) && cell(k, beyond, side) === c) return 0;
        if (isWall(k, beyond)) return 0;
        return dir * HALF_T; // coin saillant : on prolonge jusqu'au nu du mur perpendiculaire
      };
      const p0 = t0 + adj(t0, -1);
      const p1 = t1 + adj(t1, 1);
      const offset = side === 0 ? -HALF_T : HALF_T;
      const normalSign = side === 0 ? -1 : 1;
      if (c >= 0) {
        const room = grid.rooms[c]!;
        const theme = THEMES[room.theme];
        const outdoor = room.kind === "outdoor";
        const h = this.faceHeight(room, f);
        const wallMat = outdoor ? "facade" : theme.wall;
        const wains = outdoor ? undefined : theme.wainscot;
        const wh = theme.wainscotHeight ?? 1;
        this.emitFace(room.id, axis, k + offset, normalSign, p0, p1, f.y, h, intervals, wallMat, wains, wh);
      } else {
        // façade extérieure (air)
        const zx = axis === "x" ? Math.floor((t0 + t1) / 2) : side === 0 ? k - 1 : k;
        const zz = axis === "x" ? (side === 0 ? k - 1 : k) : Math.floor((t0 + t1) / 2);
        const zone = this.airZone(zx, zz);
        this.emitFace(zone, axis, k + offset, normalSign, p0, p1, f.y, fh, intervals, "facade", undefined, 0);
      }
    }

    // --- tableaux des ouvertures (épaisseur du mur)
    const zoneFor = (): string => {
      const ra = a >= 0 ? grid.rooms[a]! : null;
      const rb = b >= 0 ? grid.rooms[b]! : null;
      const pick = ra && ra.kind !== "outdoor" ? ra : rb && rb.kind !== "outdoor" ? rb : (ra ?? rb);
      return pick ? pick.id : EXTERIOR_ZONE;
    };
    const jambZone = zoneFor();
    const jambRoom = this.zones.get(jambZone)?.room ?? null;
    const jambMat = jambRoom ? (jambRoom.kind === "outdoor" ? "facade" : THEMES[jambRoom.theme].wall) : "facade";
    for (const iv of intervals) this.emitJambs(jambZone, jambMat, axis, k, iv, f.y);

    // --- colliders (le mur déborde d'une demi-épaisseur aux deux bouts pour fermer les angles)
    const surface: Surface = "concrete";
    let cursor = t0 - HALF_T;
    const end = t1 + HALF_T;
    const bottomY = f.y - 0.05;
    const topY = f.y + fh;
    const addBox = (s: number, e: number, y0: number, y1: number, mask: number = CollisionMask.ALL) => {
      if (e - s < 0.01 || y1 - y0 < 0.01) return;
      const c =
        axis === "x"
          ? makeAABB(s, y0, k - HALF_T, e, y1, k + HALF_T, { mask, surface })
          : makeAABB(k - HALF_T, y0, s, k + HALF_T, y1, e, { mask, surface });
      this.colliders.push(c);
    };
    for (const iv of intervals) {
      addBox(cursor, iv.s, bottomY, topY);
      if (iv.bottom > 0.02) addBox(iv.s, iv.e, bottomY, f.y + iv.bottom);
      if (iv.top < fh) addBox(iv.s, iv.e, f.y + iv.top, topY);
      if (iv.kind === "window" && !iv.broken) {
        // vitre : bloque le passage mais pas la vue
        addBox(iv.s, iv.e, f.y + iv.bottom, f.y + iv.top, CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV | CollisionMask.INTERACT);
      }
      cursor = iv.e;
    }
    addBox(cursor, end, bottomY, topY);
  }

  /** Ouvertures (hors « open ») posées sur ce tronçon de ligne. */
  private openingsOnRun(f: FloorDef, axis: "x" | "z", k: number, t0: number, t1: number): Interval[] {
    const out: Interval[] = [];
    for (const o of this.layout.openings) {
      if (o.floor !== f.id || o.axis !== axis || o.kind === "open") continue;
      const line = axis === "x" ? o.z : o.x;
      if (line !== k) continue;
      const along = axis === "x" ? o.x : o.z;
      const s = along - o.width / 2;
      const e = along + o.width / 2;
      if (e <= t0 + 1e-6 || s >= t1 - 1e-6) continue;
      out.push({ s: Math.max(s, t0), e: Math.min(e, t1), bottom: o.bottom ?? 0, top: o.top ?? 2.2, kind: o.kind, broken: !!o.broken });
    }
    out.sort((p, q) => p.s - q.s);
    return out;
  }

  /**
   * Face de mur verticale (côté d'une pièce ou façade), trouée par les ouvertures,
   * découpée au niveau du soubassement.
   */
  private emitFace(
    zone: string,
    axis: "x" | "z",
    line: number,
    normalSign: number,
    p0: number,
    p1: number,
    y0: number,
    h: number,
    holes: Interval[],
    wallMat: string,
    wainscot: string | undefined,
    wainscotH: number,
  ): void {
    if (p1 - p0 < 0.005) return;
    // découpe en intervalles le long du mur
    const cuts = new Set<number>([p0, p1]);
    for (const iv of holes) {
      if (iv.s > p0 && iv.s < p1) cuts.add(iv.s);
      if (iv.e > p0 && iv.e < p1) cuts.add(iv.e);
    }
    const xs = [...cuts].sort((m, n) => m - n);
    for (let i = 0; i < xs.length - 1; i++) {
      const s = xs[i]!;
      const e = xs[i + 1]!;
      const mid = (s + e) / 2;
      const hole = holes.find((iv) => mid > iv.s && mid < iv.e);
      const spans: Array<[number, number]> = hole ? [] : [[0, h]];
      if (hole) {
        if (hole.bottom > 0.001) spans.push([0, Math.min(hole.bottom, h)]);
        if (hole.top < h) spans.push([hole.top, h]);
      }
      for (const [v0, v1] of spans) {
        if (wainscot && v0 < wainscotH && v1 > wainscotH) {
          this.wallQuad(zone, wainscot, axis, line, normalSign, s, e, y0 + v0, y0 + wainscotH);
          this.wallQuad(zone, wallMat, axis, line, normalSign, s, e, y0 + wainscotH, y0 + v1);
        } else {
          const mat = wainscot && v1 <= wainscotH + 1e-6 ? wainscot : wallMat;
          this.wallQuad(zone, mat, axis, line, normalSign, s, e, y0 + v0, y0 + v1);
        }
      }
    }
  }

  private wallQuad(zone: string, mat: string, axis: "x" | "z", line: number, normalSign: number, s: number, e: number, y0: number, y1: number): void {
    const batch = this.batches.get(zone, mat);
    const len = e - s;
    const hgt = y1 - y0;
    if (len < 0.005 || hgt < 0.005) return;
    const divU = Math.max(1, Math.round(len / TESS));
    const divV = Math.max(1, Math.round(hgt / 0.8));
    if (axis === "x") {
      batch.quad({ x: s, y: y0, z: line }, { x: len, y: 0, z: 0 }, { x: 0, y: hgt, z: 0 }, { x: 0, y: 0, z: normalSign }, [s, y0], [len, hgt], divU, divV);
    } else {
      batch.quad({ x: line, y: y0, z: s }, { x: 0, y: 0, z: len }, { x: 0, y: hgt, z: 0 }, { x: normalSign, y: 0, z: 0 }, [s, y0], [len, hgt], divU, divV);
    }
  }

  /** Tableaux (côtés), sous-face du linteau et dessus d'allège d'une ouverture. */
  private emitJambs(zone: string, mat: string, axis: "x" | "z", k: number, iv: Interval, fy: number): void {
    const batch = this.batches.get(zone, mat);
    const y0 = fy + iv.bottom;
    const y1 = fy + iv.top;
    const hgt = y1 - y0;
    const w = iv.e - iv.s;
    const T = WALL_T;
    if (axis === "x") {
      // côtés : normales ±x
      batch.quad({ x: iv.s, y: y0, z: k - HALF_T }, { x: 0, y: 0, z: T }, { x: 0, y: hgt, z: 0 }, { x: 1, y: 0, z: 0 }, [0, y0], [T, hgt], 1, 2);
      batch.quad({ x: iv.e, y: y0, z: k - HALF_T }, { x: 0, y: 0, z: T }, { x: 0, y: hgt, z: 0 }, { x: -1, y: 0, z: 0 }, [0, y0], [T, hgt], 1, 2);
      if (iv.top < 50) batch.quad({ x: iv.s, y: y1, z: k - HALF_T }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: T }, { x: 0, y: -1, z: 0 }, [iv.s, 0], [w, T]);
      if (iv.bottom > 0.02) batch.quad({ x: iv.s, y: y0, z: k - HALF_T }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: T }, { x: 0, y: 1, z: 0 }, [iv.s, 0], [w, T]);
    } else {
      batch.quad({ x: k - HALF_T, y: y0, z: iv.s }, { x: T, y: 0, z: 0 }, { x: 0, y: hgt, z: 0 }, { x: 0, y: 0, z: 1 }, [0, y0], [T, hgt], 1, 2);
      batch.quad({ x: k - HALF_T, y: y0, z: iv.e }, { x: T, y: 0, z: 0 }, { x: 0, y: hgt, z: 0 }, { x: 0, y: 0, z: -1 }, [0, y0], [T, hgt], 1, 2);
      if (iv.top < 50) batch.quad({ x: k - HALF_T, y: y1, z: iv.s }, { x: T, y: 0, z: 0 }, { x: 0, y: 0, z: w }, { x: 0, y: -1, z: 0 }, [0, iv.s], [T, w]);
      if (iv.bottom > 0.02) batch.quad({ x: k - HALF_T, y: y0, z: iv.s }, { x: T, y: 0, z: 0 }, { x: 0, y: 0, z: w }, { x: 0, y: 1, z: 0 }, [0, iv.s], [T, w]);
    }
  }

  // ------------------------------------------------------------------ sols / plafonds

  private buildFloorsAndCeilings(f: FloorDef, grid: FloorGrid): void {
    for (const room of grid.rooms) {
      const [x0, z0, x1, z1] = room.rect;
      const w = x1 - x0;
      const d = z1 - z0;
      const theme = THEMES[room.theme];
      const ends = this.shaftEnds(room);
      const surface = room.surface ?? "tile";
      // les cages d'escalier ont leurs propres paliers (StairBuilder)
      const hasFloor = room.kind !== "stair" && (room.kind !== "elevator" || ends.bottom);
      if (hasFloor) {
        const batch = this.batches.get(room.id, theme.floor);
        batch.quad({ x: x0, y: f.y, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: 1, z: 0 }, [x0, z0], [w, d], Math.ceil(w / TESS), Math.ceil(d / TESS));
        this.colliders.push(makeAABB(x0, f.y - SLAB, z0, x1, f.y, z1, { surface }));
      } else if (room.kind === "stair" && ends.bottom) {
        // fond de cage : sol plein (le palier bas fait partie du sol)
        const batch = this.batches.get(room.id, theme.floor);
        batch.quad({ x: x0, y: f.y, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: 1, z: 0 }, [x0, z0], [w, d], Math.ceil(w / TESS), Math.ceil(d / TESS));
        this.colliders.push(makeAABB(x0, f.y - SLAB, z0, x1, f.y, z1, { surface: "concrete" }));
      }
      const hasCeiling = room.kind !== "outdoor" && (!room.shaft || ends.top);
      if (hasCeiling && theme.ceiling !== "none") {
        const cy = f.y + this.faceHeight(room, f);
        const batch = this.batches.get(room.id, theme.ceiling);
        batch.quad({ x: x0, y: cy, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: -1, z: 0 }, [x0, z0], [w, d], Math.ceil(w / TESS), Math.ceil(d / TESS));
        // occlusion de la vue entre étages (le plénum)
        this.colliders.push(makeAABB(x0, cy, z0, x1, cy + 0.3, z1, { mask: CollisionMask.SIGHT | CollisionMask.INTERACT }));
      }
    }
  }

  // ------------------------------------------------------------------ ouvertures & portails

  private resolveOpenings(): void {
    for (const o of this.layout.openings) {
      const f = this.floorsById.get(o.floor)!;
      const grid = this.index.grids.get(o.floor)!;
      const [ca, cb] = grid.sidesOf(o);
      const ax = o.axis === "x" ? Math.floor(o.x) : o.x - 1;
      const az = o.axis === "x" ? o.z - 1 : Math.floor(o.z);
      const bx = o.axis === "x" ? Math.floor(o.x) : o.x;
      const bz = o.axis === "x" ? o.z : Math.floor(o.z);
      const za = this.cellZone(grid, ca, ax, az) ?? EXTERIOR_ZONE;
      const zb = this.cellZone(grid, cb, bx, bz) ?? EXTERIOR_ZONE;
      const top = o.kind === "open" ? this.floorToFloor(f) : (o.top ?? 2.2);
      const bottom = o.bottom ?? 0;
      const p: OpeningPlacement = {
        id: o.id,
        floor: o.floor,
        kind: o.kind,
        axis: o.axis,
        x: o.x,
        y: f.y,
        z: o.z,
        width: o.width,
        bottom,
        top,
        broken: !!o.broken,
        spec: o.door ?? null,
        zoneA: za,
        zoneB: zb,
        roomA: ca >= 0 ? grid.rooms[ca]! : null,
        roomB: cb >= 0 ? grid.rooms[cb]! : null,
      };
      this.openings.push(p);
      this.addPortal({
        a: za,
        b: zb,
        cx: o.x,
        cy: f.y + (bottom + top) / 2,
        cz: o.z,
        normal: o.axis === "x" ? "z" : "x",
        hw: o.width / 2,
        hh: (top - bottom) / 2,
        opening: p,
      });
    }
  }

  private addPortal(p: Portal): void {
    if (p.a === p.b) return;
    this.portals.push(p);
    this.zones.get(p.a)?.portals.push(p);
    this.zones.get(p.b)?.portals.push(p);
  }

  /** Portails verticaux entre les étages d'une même cage (escaliers, ascenseur). */
  private shaftPortals(): void {
    const byShaft = new Map<string, RoomDef[]>();
    for (const r of this.layout.rooms) {
      if (!r.shaft) continue;
      const list = byShaft.get(r.shaft) ?? [];
      list.push(r);
      byShaft.set(r.shaft, list);
    }
    for (const list of byShaft.values()) {
      list.sort((p, q) => this.floorsById.get(p.floor)!.y - this.floorsById.get(q.floor)!.y);
      for (let i = 0; i < list.length - 1; i++) {
        const lo = list[i]!;
        const hi = list[i + 1]!;
        const y = this.floorsById.get(hi.floor)!.y;
        this.addPortal({
          a: lo.id,
          b: hi.id,
          cx: (lo.rect[0] + lo.rect[2]) / 2,
          cy: y,
          cz: (lo.rect[1] + lo.rect[3]) / 2,
          normal: "y",
          hw: (lo.rect[2] - lo.rect[0]) / 2,
          hh: (lo.rect[3] - lo.rect[1]) / 2,
          opening: null,
        });
      }
    }
  }
}

export function openingFromDef(o: OpeningDef): string {
  return o.id;
}
