import { DECAL, decalUV, SIGNS, signUV } from "../../render/textures/DecalAtlas";
import type { OpeningPlacement } from "../builder/ArchitectureBuilder";
import { EXTERIOR_ZONE, WALL_T } from "../builder/ArchitectureBuilder";
import type { BatchSet, MeshBatch, V3 } from "../builder/MeshBatch";
import type { FloorDef, HospitalLayout, RoomDef, ThemeId } from "../layout/types";
import { RoomDresser, type Side } from "./RoomDresser";
import type { PropSystem } from "../props/PropSystem";

const HALF_T = WALL_T / 2;
type DecalId = (typeof DECAL)[keyof typeof DECAL];

interface DecalRule {
  id: DecalId;
  where: "floor" | "wall" | "ceiling";
  /** taille (largeur, hauteur) en m */
  size: [number, number];
  /** nombre (min, max) */
  count: [number, number];
  /** hauteur du centre pour les murs */
  y?: number;
}

const R = (id: DecalId, where: DecalRule["where"], size: [number, number], count: [number, number], y?: number): DecalRule => ({ id, where, size, count, y });

const COMMON_DIRT = [R(DECAL.STAIN, "floor", [1.3, 1.3], [1, 3]), R(DECAL.CRACK, "wall", [1.4, 0.7], [0, 1], 1.8), R(DECAL.WATER, "ceiling", [1.4, 1.4], [0, 1])];

const RULES: Partial<Record<ThemeId, DecalRule[]>> = {
  corridor: [...COMMON_DIRT, R(DECAL.FOOTPRINTS, "floor", [0.7, 1.4], [0, 2]), R(DECAL.DRAG, "floor", [2.6, 0.9], [0, 1]), R(DECAL.SCRATCHES, "wall", [0.8, 1.0], [0, 1], 1.3)],
  corridorU: [...COMMON_DIRT, R(DECAL.FOOTPRINTS, "floor", [0.7, 1.4], [0, 1]), R(DECAL.BLOOD_SPLAT, "wall", [1.1, 1.1], [0, 1], 1.2)],
  hall: [...COMMON_DIRT, R(DECAL.STAIN, "floor", [1.8, 1.8], [2, 4]), R(DECAL.FOOTPRINTS, "floor", [0.7, 1.4], [1, 3]), R(DECAL.GRAFFITI_2, "wall", [1.8, 1.8], [1, 1], 1.7)],
  er: [...COMMON_DIRT, R(DECAL.BLOOD_POOL, "floor", [1.3, 1.3], [2, 3]), R(DECAL.BLOOD_SPLAT, "wall", [1.2, 1.2], [1, 3], 1.3), R(DECAL.DRAG, "floor", [2.6, 0.9], [1, 2]), R(DECAL.HANDPRINT, "wall", [0.6, 0.6], [1, 2], 1.1)],
  surgery: [R(DECAL.BLOOD_POOL, "floor", [1.2, 1.2], [1, 2]), R(DECAL.BLOOD_SPLAT, "wall", [1.2, 1.2], [1, 2], 1.4), R(DECAL.HANDPRINT, "wall", [0.6, 0.6], [0, 1], 1.2), R(DECAL.STAIN, "floor", [1.2, 1.2], [1, 2])],
  morgue: [R(DECAL.BLOOD_POOL, "floor", [1.3, 1.3], [1, 2]), R(DECAL.DRAG, "floor", [2.8, 0.9], [1, 2]), R(DECAL.HANDPRINT, "wall", [0.6, 0.6], [1, 1], 1.0), R(DECAL.WATER, "ceiling", [1.5, 1.5], [1, 2]), R(DECAL.PUDDLE, "floor", [1.4, 1.4], [0, 1])],
  pediatrics: [R(DECAL.DRAWING, "wall", [0.7, 0.7], [3, 5], 1.5), R(DECAL.STAIN, "floor", [1.2, 1.2], [1, 2]), R(DECAL.SCRATCHES, "wall", [0.8, 1.0], [0, 1], 1.2)],
  patient: [R(DECAL.STAIN, "floor", [1.2, 1.2], [0, 2]), R(DECAL.WATER, "ceiling", [1.4, 1.4], [0, 1]), R(DECAL.CRACK, "wall", [1.2, 0.6], [0, 1], 2.0), R(DECAL.BLOOD_SPLAT, "wall", [1.0, 1.0], [0, 1], 1.0)],
  ward: [R(DECAL.STAIN, "floor", [1.4, 1.4], [2, 3]), R(DECAL.WATER, "ceiling", [1.5, 1.5], [1, 2]), R(DECAL.MOLD, "wall", [1.2, 1.2], [0, 1], 2.4)],
  boiler: [R(DECAL.SOOT, "wall", [1.8, 1.8], [2, 3], 2.0), R(DECAL.PUDDLE, "floor", [1.6, 1.6], [1, 2]), R(DECAL.GRAFFITI_1, "wall", [1.8, 1.8], [0, 1], 1.6), R(DECAL.CRACK, "wall", [1.4, 0.7], [1, 2], 1.4)],
  techcorr: [R(DECAL.PUDDLE, "floor", [1.4, 1.4], [1, 2]), R(DECAL.MOLD, "wall", [1.2, 1.2], [1, 2], 2.2), R(DECAL.GRAFFITI_3, "wall", [1.6, 1.6], [0, 1], 1.5), R(DECAL.SOOT, "wall", [1.6, 1.6], [0, 1], 2.0), R(DECAL.FOOTPRINTS, "floor", [0.7, 1.4], [0, 2])],
  archives: [R(DECAL.STAIN, "floor", [1.4, 1.4], [2, 3]), R(DECAL.WATER, "ceiling", [1.5, 1.5], [1, 2]), R(DECAL.MOLD, "wall", [1.2, 1.2], [1, 2], 2.2)],
  electric: [R(DECAL.SOOT, "wall", [1.5, 1.5], [1, 2], 1.8), R(DECAL.PUDDLE, "floor", [1.2, 1.2], [0, 1])],
  lockers: [R(DECAL.MOLD, "wall", [1.2, 1.2], [1, 2], 2.3), R(DECAL.PUDDLE, "floor", [1.3, 1.3], [1, 2]), R(DECAL.GRAFFITI_2, "wall", [1.5, 1.5], [0, 1], 1.6)],
  showers: [R(DECAL.MOLD, "wall", [1.3, 1.3], [2, 3], 2.2), R(DECAL.PUDDLE, "floor", [1.5, 1.5], [1, 2]), R(DECAL.BLOOD_SPLAT, "wall", [1.0, 1.0], [0, 1], 1.4)],
  stairs: [R(DECAL.GRAFFITI_3, "wall", [1.4, 1.4], [0, 1], 1.5), R(DECAL.FOOTPRINTS, "floor", [0.6, 1.2], [0, 1])],
  chapel: [R(DECAL.GRAFFITI_1, "wall", [2.0, 2.0], [1, 1], 1.7), R(DECAL.SOOT, "wall", [1.6, 1.6], [1, 2], 2.0), R(DECAL.BLOOD_SPLAT, "floor", [1.0, 1.0], [0, 1])],
  cafeteria: [R(DECAL.STAIN, "floor", [1.5, 1.5], [2, 4]), R(DECAL.PUDDLE, "floor", [1.3, 1.3], [0, 1]), R(DECAL.MOLD, "wall", [1.3, 1.3], [0, 1], 2.3)],
  kitchen: [R(DECAL.STAIN, "floor", [1.3, 1.3], [2, 3]), R(DECAL.MOLD, "wall", [1.2, 1.2], [1, 2], 2.0), R(DECAL.PUDDLE, "floor", [1.2, 1.2], [1, 1])],
  office: [R(DECAL.STAIN, "floor", [1.0, 1.0], [0, 1]), R(DECAL.WATER, "ceiling", [1.3, 1.3], [0, 1])],
  director: [R(DECAL.STAIN, "floor", [1.0, 1.0], [0, 1]), R(DECAL.SCRATCHES, "wall", [0.8, 1.0], [1, 1], 1.4)],
  waiting: [...COMMON_DIRT, R(DECAL.FOOTPRINTS, "floor", [0.7, 1.4], [0, 1])],
  storage: [R(DECAL.STAIN, "floor", [1.2, 1.2], [1, 2]), R(DECAL.MOLD, "wall", [1.0, 1.0], [0, 1], 2.3)],
  laundry: [R(DECAL.PUDDLE, "floor", [1.5, 1.5], [1, 2]), R(DECAL.MOLD, "wall", [1.2, 1.2], [1, 1], 2.2)],
  radiology: [R(DECAL.STAIN, "floor", [1.2, 1.2], [1, 1]), R(DECAL.SCRATCHES, "wall", [0.8, 1.0], [0, 1], 1.2)],
  nurse: [R(DECAL.STAIN, "floor", [1.2, 1.2], [1, 1]), R(DECAL.HANDPRINT, "wall", [0.6, 0.6], [0, 1], 1.1)],
};

/** Panneaux à placer à côté des portes des pièces-repères (index dans SIGNS). */
const SIGN_FOR_ROOM: Record<string, number> = {
  g_er: 0,
  g_cafeteria: 3,
  g_chapel: 15,
  g_lockers: 17,
  u_radio: 8,
  u_bloc_prep: 9,
  u_pedia: 10,
  u_dir_sec: 16,
  b_morgue: 12,
  b_electric: 13,
  b_archives: 14,
  b_boiler: 18,
  g_waiting: 20,
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Decals (saleté, sang, traînées, tags, dessins…) et panneaux de signalétique,
 * posés en quads décollés des surfaces et fusionnés par zone (1 draw call / zone).
 */
export class DecalPlacer {
  private floorsById = new Map<string, FloorDef>();

  constructor(
    private readonly layout: HospitalLayout,
    private readonly openings: OpeningPlacement[],
    private readonly batches: BatchSet,
    private readonly props: PropSystem,
  ) {
    for (const f of layout.floors) this.floorsById.set(f.id, f);
  }

  run(): void {
    for (const room of this.layout.rooms) {
      const rules = RULES[room.kind === "corridor" && room.theme === "corridor" ? "corridor" : room.theme];
      if (rules) this.decorate(room, rules);
    }
    this.placeSigns();
    this.exteriorTags();
  }

  private decorate(room: RoomDef, rules: DecalRule[]): void {
    const f = this.floorsById.get(room.floor)!;
    const r = new RoomDresser(room, f.y + (room.floorOffset ?? 0), this.openings, this.props, hashStr(room.id + "#decals"));
    const batch = this.batches.get(room.id, "decals");
    const ceil = f.y + (room.ceiling ?? f.ceiling);
    let layer = 0;
    for (const rule of rules) {
      const n = rule.count[0] + Math.floor(r.rnd() * (rule.count[1] - rule.count[0] + 1));
      for (let i = 0; i < n; i++) {
        layer++;
        const uv = decalUV(rule.id);
        const [w, h] = rule.size;
        const i2 = r.inner;
        if (rule.where === "floor" || rule.where === "ceiling") {
          if (i2.x1 - i2.x0 < w || i2.z1 - i2.z0 < w) continue;
          const cx = i2.x0 + w / 2 + r.rnd() * (i2.x1 - i2.x0 - w);
          const cz = i2.z0 + w / 2 + r.rnd() * (i2.z1 - i2.z0 - w);
          const a = r.rnd() * Math.PI * 2;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const up = rule.where === "floor";
          const y = up ? r.y + 0.006 + layer * 0.0015 : ceil - 0.008;
          const U: V3 = { x: ca * w, y: 0, z: sa * w };
          const V: V3 = { x: -sa * h, y: 0, z: ca * h };
          const o: V3 = { x: cx - U.x / 2 - V.x / 2, y, z: cz - U.z / 2 - V.z / 2 };
          this.quad(batch, o, U, V, { x: 0, y: up ? 1 : -1, z: 0 }, uv);
        } else {
          const side = r.pick(["s", "n", "w", "e"] as Side[]);
          const horizontal = side === "s" || side === "n";
          const lo = horizontal ? i2.x0 : i2.z0;
          const hi = horizontal ? i2.x1 : i2.z1;
          if (hi - lo < w + 0.2) continue;
          const c = lo + w / 2 + r.rnd() * (hi - lo - w);
          const blocked = r.blockedOn(side, 3);
          if (blocked.some(([bs, be]) => c + w / 2 > bs && c - w / 2 < be)) continue;
          const cy = f.y + (rule.y ?? 1.5);
          if (cy + h / 2 > ceil - 0.05) continue;
          const eps = 0.012 + layer * 0.0015;
          let o: V3;
          let U: V3;
          let N: V3;
          if (side === "s") {
            o = { x: c - w / 2, y: cy - h / 2, z: i2.z0 + eps };
            U = { x: w, y: 0, z: 0 };
            N = { x: 0, y: 0, z: 1 };
          } else if (side === "n") {
            o = { x: c + w / 2, y: cy - h / 2, z: i2.z1 - eps };
            U = { x: -w, y: 0, z: 0 };
            N = { x: 0, y: 0, z: -1 };
          } else if (side === "w") {
            o = { x: i2.x0 + eps, y: cy - h / 2, z: c + w / 2 };
            U = { x: 0, y: 0, z: -w };
            N = { x: 1, y: 0, z: 0 };
          } else {
            o = { x: i2.x1 - eps, y: cy - h / 2, z: c - w / 2 };
            U = { x: 0, y: 0, z: w };
            N = { x: -1, y: 0, z: 0 };
          }
          this.quad(batch, o, U, { x: 0, y: h, z: 0 }, N, uv);
        }
      }
    }
  }

  private quad(batch: MeshBatch, o: V3, U: V3, V: V3, N: V3, uv: [number, number, number, number]): void {
    batch.quad(o, U, V, N, [uv[0], uv[1]], [uv[2] - uv[0], uv[3] - uv[1]], 1, 1);
  }

  /** Panneaux muraux à côté des portes des pièces-repères + niveaux dans les cages d'escalier. */
  private placeSigns(): void {
    for (const o of this.openings) {
      if (o.kind === "window" || o.kind === "vent" || o.kind === "open") continue;
      const targetA = o.roomA && SIGN_FOR_ROOM[o.roomA.id] !== undefined ? o.roomA : null;
      const targetB = o.roomB && SIGN_FOR_ROOM[o.roomB.id] !== undefined ? o.roomB : null;
      const target = targetA ?? targetB;
      if (!target) continue;
      const outside = target === o.roomA ? o.roomB : o.roomA;
      if (!outside) continue;
      // le panneau est côté « outside », à droite de la porte
      const sideSign = outside === o.roomB ? 1 : -1;
      this.signBeside(o, outside.id, sideSign, SIGN_FOR_ROOM[target.id]!);
    }
    // niveaux dans les cages d'escalier (mur opposé à la porte, au palier)
    for (const room of this.layout.rooms) {
      if (room.kind !== "stair") continue;
      const idx = room.floor === "G" ? 21 : room.floor === "U" ? 22 : 23;
      const door = this.openings.find((o) => (o.roomA === room || o.roomB === room) && o.kind !== "open");
      if (!door) continue;
      const sideSign = door.roomB === room ? 1 : -1;
      this.signBeside(door, room.id, sideSign, idx, 0.9);
      const stairIdx = room.shaft === "A" ? 4 : room.shaft === "B" ? 5 : 6;
      const outside = door.roomA === room ? door.roomB : door.roomA;
      if (outside) this.signBeside(door, outside.id, -sideSign, stairIdx, -0.9);
    }
    // ascenseur hors service
    for (const o of this.openings) {
      if (o.kind !== "elevator") continue;
      const outside = o.roomA?.kind === "elevator" ? o.roomB : o.roomA;
      if (!outside) continue;
      const sideSign = outside === o.roomB ? 1 : -1;
      this.signBeside(o, outside.id, sideSign, 7, 1.1);
    }
  }

  /**
   * Panneau collé au mur d'une ouverture, côté `sideSign` (+1 : côté positif de la ligne).
   * `offset` : décalage le long du mur depuis le bord de l'ouverture (m, >0 à droite).
   */
  private signBeside(o: OpeningPlacement, zone: string, sideSign: number, index: number, offset = 0.95): void {
    const batch = this.batches.get(zone, "signs");
    const uv = signUV(index);
    const w = 0.84;
    const h = 0.42;
    const y = o.y + 1.85;
    const eps = HALF_T + 0.012;
    const along = o.width / 2 + Math.abs(offset) - 0.2 + w / 2;
    const dir = offset >= 0 ? 1 : -1;
    const base = (o.axis === "x" ? o.x : o.z) + dir * along * (sideSign > 0 ? 1 : -1);
    if (o.axis === "x") {
      const z = o.z + sideSign * eps;
      // la face regarde vers le côté `sideSign`
      const U: V3 = { x: sideSign > 0 ? -w : w, y: 0, z: 0 };
      const origin: V3 = { x: base - U.x / 2, y: y - h / 2, z };
      batch.quad(origin, U, { x: 0, y: h, z: 0 }, { x: 0, y: 0, z: sideSign }, [uv[0], uv[1]], [uv[2] - uv[0], uv[3] - uv[1]]);
    } else {
      const x = o.x + sideSign * eps;
      const U: V3 = { x: 0, y: 0, z: sideSign > 0 ? w : -w };
      const origin: V3 = { x, y: y - h / 2, z: base - U.z / 2 };
      batch.quad(origin, U, { x: 0, y: h, z: 0 }, { x: sideSign, y: 0, z: 0 }, [uv[0], uv[1]], [uv[2] - uv[0], uv[3] - uv[1]]);
    }
  }

  /** Quelques tags sur la façade (ambiance urbex). */
  private exteriorTags(): void {
    const batch = this.batches.get(EXTERIOR_ZONE, "decals");
    const tags: Array<[number, number, number, DecalId, number]> = [
      [33, 1.6, -0.14, DECAL.GRAFFITI_3, 2.2],
      [49, 1.5, -0.14, DECAL.GRAFFITI_2, 2.0],
      [-0.14, 1.6, 12, DECAL.GRAFFITI_1, 2.2],
    ];
    for (const [x, y, z, id, s] of tags) {
      const uv = decalUV(id);
      if (z < 0) this.quad(batch, { x: x + s / 2, y: y - s / 2, z }, { x: -s, y: 0, z: 0 }, { x: 0, y: s, z: 0 }, { x: 0, y: 0, z: -1 }, uv);
      else this.quad(batch, { x, y: y - s / 2, z: z - s / 2 }, { x: 0, y: 0, z: s }, { x: 0, y: s, z: 0 }, { x: -1, y: 0, z: 0 }, uv);
    }
    void SIGNS;
  }
}
