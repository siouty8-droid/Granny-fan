import type { OpeningPlacement } from "../builder/ArchitectureBuilder";
import { WALL_T } from "../builder/ArchitectureBuilder";
import type { RoomDef } from "../layout/types";
import type { PropInstance, PropSystem } from "../props/PropSystem";

const HALF_T = WALL_T / 2;

export type Side = "s" | "n" | "w" | "e";

interface Rect2 {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Empreintes (largeur locale x, profondeur locale z) des props pour le placement. */
export const FOOTPRINT: Record<string, [number, number]> = {
  bed: [1.05, 2.15],
  stretcher: [0.75, 2.05],
  wheelchair: [0.7, 0.9],
  ivstand: [0.6, 0.6],
  curtain: [2.5, 0.2],
  trolley: [0.75, 0.55],
  autopsy: [0.95, 2.25],
  morgue_lockers: [2.45, 1.3],
  op_table: [0.7, 2.0],
  xray: [1.0, 1.5],
  crib: [0.85, 1.45],
  chair_blue: [0.5, 0.5],
  chair_orange: [0.5, 0.5],
  chair_row: [2.15, 0.6],
  desk: [1.65, 0.85],
  office_chair: [0.65, 0.65],
  wardrobe: [1.05, 0.65],
  lockers: [1.25, 0.55],
  shelf: [1.85, 0.55],
  cafe_table: [1.45, 1.6],
  pew: [3.05, 0.65],
  vending: [0.95, 0.85],
  reception: [4.1, 0.9],
  dead_plant: [0.55, 0.55],
  boxes: [0.9, 0.8],
  trash: [0.9, 0.75],
  washer: [0.95, 0.9],
  laundry_cart: [0.85, 0.65],
  sink: [0.75, 0.55],
  boiler: [2.05, 2.65],
  elec_cabinet: [1.85, 0.65],
  generator: [2.85, 1.45],
  workbench: [2.05, 0.75],
  med_cabinet: [1.25, 0.5],
  pipes_v: [0.5, 0.35],
  teddy: [0.3, 0.3],
  papers: [1.2, 1.2],
  debris: [1.1, 1.1],
  folders: [0.35, 0.4],
  bench_ext: [1.85, 0.65],
  bush: [1.0, 1.0],
  dumpster: [2.05, 1.45],
  surgical_lamp: [1.2, 1.2],
  pipes: [2.0, 0.25],
  tv: [0.7, 0.5],
};

/**
 * Outil d'habillage d'une pièce : placement contre les murs (hors portes / fenêtres),
 * en grille ou libre, avec test de recouvrement et zones à garder dégagées.
 */
export class RoomDresser {
  readonly placed: Rect2[] = [];
  readonly keepClear: Rect2[] = [];
  readonly rnd: () => number;
  readonly inner: Rect2;
  readonly y: number;

  constructor(
    readonly room: RoomDef,
    floorY: number,
    private readonly openings: OpeningPlacement[],
    private readonly props: PropSystem,
    seed: number,
    readonly onPlace?: (inst: PropInstance) => void,
  ) {
    let a = seed >>> 0;
    this.rnd = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const [x0, z0, x1, z1] = room.rect;
    this.inner = { x0: x0 + HALF_T, z0: z0 + HALF_T, x1: x1 - HALF_T, z1: z1 - HALF_T };
    this.y = floorY;
    // dégagement devant chaque ouverture de la pièce
    for (const o of this.roomOpenings()) {
      const hw = o.width / 2 + 0.35;
      const depth = o.kind === "window" ? 0.5 : o.kind === "vent" ? 1.3 : 1.5;
      if (o.kind === "window") continue;
      if (o.axis === "x") this.keepClear.push({ x0: o.x - hw, z0: o.z - depth, x1: o.x + hw, z1: o.z + depth });
      else this.keepClear.push({ x0: o.x - depth, z0: o.z - hw, x1: o.x + depth, z1: o.z + hw });
    }
  }

  get w(): number {
    return this.inner.x1 - this.inner.x0;
  }
  get d(): number {
    return this.inner.z1 - this.inner.z0;
  }

  /** Ouvertures touchant cette pièce. */
  roomOpenings(): OpeningPlacement[] {
    return this.openings.filter((o) => o.roomA === this.room || o.roomB === this.room);
  }

  /** Intervalles bloqués le long d'un mur (portes, arches, fenêtres si le prop est haut). */
  blockedOn(side: Side, height: number): Array<[number, number]> {
    const [x0, z0, x1, z1] = this.room.rect;
    const out: Array<[number, number]> = [];
    for (const o of this.roomOpenings()) {
      const onSide =
        (side === "s" && o.axis === "x" && o.z === z0) ||
        (side === "n" && o.axis === "x" && o.z === z1) ||
        (side === "w" && o.axis === "z" && o.x === x0) ||
        (side === "e" && o.axis === "z" && o.x === x1);
      if (!onSide) continue;
      if (o.kind === "window" && height <= o.bottom - 0.05) continue;
      const c = o.axis === "x" ? o.x : o.z;
      const pad = o.kind === "window" ? 0.05 : 0.45;
      out.push([c - o.width / 2 - pad, c + o.width / 2 + pad]);
    }
    return out;
  }

  private overlaps(r: Rect2, list: Rect2[]): boolean {
    for (const q of list) if (r.x0 < q.x1 && r.x1 > q.x0 && r.z0 < q.z1 && r.z1 > q.z0) return true;
    return false;
  }

  private insideRoom(r: Rect2): boolean {
    const i = this.inner;
    return r.x0 >= i.x0 - 1e-3 && r.z0 >= i.z0 - 1e-3 && r.x1 <= i.x1 + 1e-3 && r.z1 <= i.z1 + 1e-3;
  }

  /** Place un prop à une position monde donnée si la place est libre. */
  placeAt(
    id: string,
    x: number,
    z: number,
    yaw: number,
    opts: { force?: boolean; clearOk?: boolean; y?: number; pitch?: number; roll?: number; noReserve?: boolean } = {},
  ): PropInstance | null {
    const fp = FOOTPRINT[id] ?? [0.5, 0.5];
    const rot = Math.abs(Math.sin(yaw)) > 0.5;
    const hx = (rot ? fp[1] : fp[0]) / 2;
    const hz = (rot ? fp[0] : fp[1]) / 2;
    const r: Rect2 = { x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz };
    if (!opts.force) {
      if (!this.insideRoom(r)) return null;
      if (this.overlaps(r, this.placed)) return null;
      if (!opts.clearOk && this.overlaps(r, this.keepClear)) return null;
    }
    if (!opts.noReserve) this.placed.push(r);
    const inst = this.props.add(id, x, opts.y ?? this.y, z, yaw, this.room.id, this.room.sector, { pitch: opts.pitch ?? 0, roll: opts.roll ?? 0 });
    this.onPlace?.(inst);
    return inst;
  }

  /**
   * Place contre un mur. `t` ∈ [0,1] position le long du mur (aléatoire si omis).
   * `parallel` : l'axe long du prop (z local) suit le mur.
   */
  againstWall(
    id: string,
    side: Side,
    opts: { t?: number; parallel?: boolean; gap?: number; height?: number; tries?: number; clearOk?: boolean; decor?: boolean } = {},
  ): PropInstance | null {
    const fp = FOOTPRINT[id] ?? [0.5, 0.5];
    const along = opts.parallel ? fp[1] : fp[0];
    const perp = opts.parallel ? fp[0] : fp[1];
    const gap = opts.gap ?? 0.03;
    const i = this.inner;
    const horizontal = side === "s" || side === "n";
    const lo = horizontal ? i.x0 : i.z0;
    const hi = horizontal ? i.x1 : i.z1;
    if (hi - lo < along + 0.1) return null;
    const blocked = this.blockedOn(side, opts.height ?? 2.0);
    const baseYaw = side === "s" ? 0 : side === "n" ? Math.PI : side === "w" ? Math.PI / 2 : -Math.PI / 2;
    const yaw = baseYaw + (opts.parallel ? Math.PI / 2 : 0);
    const tries = opts.tries ?? (opts.t !== undefined ? 1 : 8);
    for (let k = 0; k < tries; k++) {
      const t = opts.t !== undefined && k === 0 ? opts.t : this.rnd();
      const c = lo + along / 2 + (hi - lo - along) * t;
      if (!opts.decor && blocked.some(([a, b]) => c + along / 2 > a && c - along / 2 < b)) continue;
      const off = perp / 2 + gap;
      let x: number;
      let z: number;
      if (side === "s") {
        x = c;
        z = i.z0 + off;
      } else if (side === "n") {
        x = c;
        z = i.z1 - off;
      } else if (side === "w") {
        x = i.x0 + off;
        z = c;
      } else {
        x = i.x1 - off;
        z = c;
      }
      const inst = this.placeAt(id, x, z, yaw, opts.decor ? { force: true, noReserve: true } : { clearOk: opts.clearOk });
      if (inst) return inst;
    }
    return null;
  }

  /** Remplit un mur avec des props répétés (espacement régulier). */
  alongWall(id: string, side: Side, spacing: number, opts: { parallel?: boolean; skipChance?: number; height?: number; gap?: number; decor?: boolean } = {}): number {
    const i = this.inner;
    const horizontal = side === "s" || side === "n";
    const len = horizontal ? i.x1 - i.x0 : i.z1 - i.z0;
    const n = Math.floor(len / spacing);
    let placed = 0;
    for (let k = 0; k < n; k++) {
      if (opts.skipChance && this.rnd() < opts.skipChance) continue;
      const t = n <= 1 ? 0.5 : k / (n - 1);
      const fp = FOOTPRINT[id] ?? [0.5, 0.5];
      const along = opts.parallel ? fp[1] : fp[0];
      const tt = len > along ? Math.min(1, Math.max(0, (t * (len - spacing) + (spacing - along) / 2) / (len - along))) : 0.5;
      if (this.againstWall(id, side, { t: tt, parallel: opts.parallel, height: opts.height, gap: opts.gap, tries: 1, decor: opts.decor })) placed++;
    }
    return placed;
  }

  /** Position libre aléatoire dans la pièce (marge aux murs). */
  randomFree(id: string, margin = 0.6, tries = 10, yaw?: number, opts: { clearOk?: boolean } = {}): PropInstance | null {
    const i = this.inner;
    for (let k = 0; k < tries; k++) {
      const x = i.x0 + margin + this.rnd() * Math.max(0, i.x1 - i.x0 - margin * 2);
      const z = i.z0 + margin + this.rnd() * Math.max(0, i.z1 - i.z0 - margin * 2);
      const inst = this.placeAt(id, x, z, yaw ?? this.rnd() * Math.PI * 2, opts);
      if (inst) return inst;
    }
    return null;
  }

  /** Petits objets au sol (papiers, gravats) : sans réservation de place, hors passages. */
  scatter(id: string, count: number, margin = 0.4): void {
    for (let k = 0; k < count; k++) {
      const i = this.inner;
      const x = i.x0 + margin + this.rnd() * Math.max(0, i.x1 - i.x0 - margin * 2);
      const z = i.z0 + margin + this.rnd() * Math.max(0, i.z1 - i.z0 - margin * 2);
      this.placeAt(id, x, z, this.rnd() * Math.PI * 2, { noReserve: true, clearOk: true, force: true });
    }
  }

  /** Réserve une bande (allée) qui doit rester libre. */
  reserveLane(r: Rect2): void {
    this.keepClear.push(r);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length)]!;
  }

  chance(p: number): boolean {
    return this.rnd() < p;
  }
}
