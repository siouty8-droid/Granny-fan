import { CollisionMask, toLocalX, toLocalZ, type Collider } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { World } from "../world/World";
import type { PropInstance } from "../world/props/PropSystem";
import type { MapRules } from "./data/rules";
import type { SafeDef } from "./data/spawns";

/** Point d'apparition résolu (monde). */
export interface Anchor {
  key: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  room: string;
  sector: string;
  /** posé sur un meuble (sinon au sol) */
  onProp: PropInstance | null;
}

/** Emplacements (locaux) sur le dessus des meubles : [x, y, z]. */
const SLOTS: Record<string, Array<[number, number, number]>> = {
  desk: [
    [-0.45, 0.77, 0.28],
    [0.6, 0.77, 0.25],
    [0.58, 0.77, -0.22],
  ],
  cafe_table: [
    [-0.35, 0.76, 0.2],
    [0.4, 0.76, -0.15],
  ],
  reception: [
    [-1.6, 1.1, 0.05],
    [0.1, 1.1, 0.15],
    [1.6, 1.1, 0.0],
  ],
  bed: [
    [0.0, 0.61, 0.25],
    [0.18, 0.61, 0.65],
    [-0.2, 0.61, -0.25],
  ],
  stretcher: [
    [0, 0.84, 0.4],
    [0, 0.84, -0.4],
  ],
  shelf: [
    [-0.5, 1.105, 0.19],
    [0.15, 1.105, 0.19],
    [0.55, 0.605, 0.19],
  ],
  workbench: [
    [-0.6, 0.92, 0.18],
    [0.1, 0.92, 0.15],
    [0.45, 0.92, -0.08],
  ],
  trolley: [[0.0, 0.93, 0.14]],
  pew: [
    [-0.9, 0.46, 0.0],
    [0.25, 0.46, 0.0],
    [1.0, 0.46, 0.0],
  ],
  autopsy: [
    [0.33, 0.88, -0.7],
    [-0.33, 0.88, 0.6],
  ],
  op_table: [
    [0.0, 0.92, -0.6],
    [0.0, 0.92, 0.55],
  ],
  // centre commercial
  checkout: [
    [0.7, 0.9, 0.15],
    [0.7, 0.9, -0.22],
    [-0.5, 0.88, -0.12],
  ],
  display_case: [
    [-0.45, 1.0, 0.0],
    [-0.12, 1.0, 0.1],
  ],
  food_counter: [
    [-1.1, 1.05, 0.12],
    [1.1, 1.05, 0.0],
    [0.3, 1.05, -0.22],
  ],
  table_phones: [
    [-0.45, 0.8, 0.28],
    [0.4, 0.8, -0.28],
  ],
  table_shoes: [
    [-0.45, 0.8, 0.28],
    [0.4, 0.8, -0.28],
  ],
  table_books: [
    [-0.45, 0.84, 0.28],
    [0.4, 0.84, -0.28],
  ],
  pallet: [
    [0.36, 0.66, 0.0],
    [-0.37, 1.21, 0.2],
  ],
};

const SURFACE_PROPS: Record<string, string[]> = {
  desk: ["desk"],
  table: ["cafe_table", "table_phones", "table_shoes", "table_books"],
  counter: ["reception", "food_counter"],
  checkout: ["checkout"],
  case: ["display_case"],
  pallet: ["pallet"],
  bed: ["bed", "stretcher"],
  shelf: ["shelf"],
  workbench: ["workbench"],
  trolley: ["trolley"],
  pew: ["pew"],
  autopsy: ["autopsy"],
  op_table: ["op_table"],
  any: ["desk", "workbench", "cafe_table", "reception", "trolley", "autopsy", "op_table", "shelf", "bed", "stretcher", "pew", "checkout", "display_case", "food_counter", "table_phones", "table_shoes", "table_books", "pallet"],
};

/** Emplacements dans un coffre (locaux) : fond et étagère. */
const SAFE_SLOTS: Array<[number, number, number]> = [
  [-0.1, 0.105, 0.02],
  [0.1, 0.44, 0.0],
  [0.12, 0.105, 0.06],
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function circleHitsBox(c: Collider, x: number, z: number, r: number): boolean {
  const lx = Math.abs(toLocalX(c, x, z));
  const lz = Math.abs(toLocalZ(c, x, z));
  const dx = Math.max(0, lx - c.hx);
  const dz = Math.max(0, lz - c.hz);
  return dx * dx + dz * dz < r * r;
}

/** Le sol est-il libre (disque de rayon r, du sol à `height`) ? */
export function floorFree(collision: CollisionWorld, x: number, y: number, z: number, r: number, height = 1.4, out: Collider[] = []): boolean {
  const list = collision.query(x - r, z - r, x + r, z + r, CollisionMask.PLAYER, out);
  for (const c of list) {
    if (c.ramp) continue;
    if (c.maxY <= y + 0.03 || c.minY >= y + height) continue;
    if (circleHitsBox(c, x, z, r)) return false;
  }
  const g = collision.groundHeight(x, z, y + 0.3, CollisionMask.PLAYER);
  return Math.abs(g - y) < 0.05;
}

/**
 * Résolution des points d'apparition « pièce:surface#n » en positions monde, UNE fois au
 * chargement (le décor est fixe) : chaque clé reçoit un emplacement unique et stable, quelle
 * que soit la seed de la run.
 */
export class Anchors {
  private readonly byKey = new Map<string, Anchor>();
  private readonly used: Anchor[] = [];
  private readonly lists = new Map<string, Anchor[]>();
  private readonly tmp: Collider[] = [];
  readonly warnings: string[] = [];

  constructor(
    private readonly world: World,
    private readonly collision: CollisionWorld,
    rules: MapRules,
  ) {
    const keys: string[] = [];
    for (const list of Object.values(rules.itemCandidates)) for (const k of list ?? []) if (!k.startsWith("safe_")) keys.push(k);
    for (const n of rules.codeNotes) keys.push(...n.candidates);
    for (const n of rules.loreNotes) keys.push(n.spot);
    // clés explicites (#2, #3) d'abord : elles réservent leur rang
    const unique = [...new Set(keys)];
    for (const k of unique) this.resolve(k);
    // dossiers cachés : résolus en dernier (les emplacements existants ne bougent pas)
    for (const k of rules.dossierSpots) if (!this.byKey.has(k)) this.resolve(k);
  }

  get(key: string): Anchor {
    const a = this.byKey.get(key);
    if (!a) throw new Error(`ancre inconnue : ${key}`);
    return a;
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  /** Emplacements d'un coffre (monde). */
  safeSlots(safe: SafeDef): Anchor[] {
    const room = this.world.layout.rooms.find((r) => r.id === safe.room)!;
    const y = this.world.floorY(room.floor);
    const c = Math.cos(safe.yaw);
    const s = Math.sin(safe.yaw);
    return SAFE_SLOTS.map(([lx, ly, lz], i) => ({
      key: `${safe.id}#${i + 1}`,
      x: safe.x + lx * c + lz * s,
      y: y + ly,
      z: safe.z - lx * s + lz * c,
      yaw: safe.yaw,
      room: room.id,
      sector: room.sector,
      onProp: null,
    }));
  }

  private resolve(key: string): void {
    const m = /^([a-z0-9_]+):([a-z_]+)(?:#(\d+))?$/.exec(key);
    if (!m) throw new Error(`clé de spawn invalide : ${key}`);
    const room = m[1]!;
    const surface = m[2]!;
    const n = Number(m[3] ?? "1");
    let list = this.anchorsFor(room, surface);
    let pick = this.nthFree(list, n);
    if (!pick && surface !== "any" && surface !== "floor") {
      this.warnings.push(`${key} : pas de « ${surface} » libre, repli`);
      list = this.anchorsFor(room, "any");
      pick = this.nthFree(list, n);
    }
    if (!pick) {
      list = this.anchorsFor(room, "floor");
      pick = this.nthFree(list, 1);
    }
    if (!pick) throw new Error(`aucun emplacement pour ${key}`);
    const a = { ...pick, key };
    this.used.push(a);
    this.byKey.set(key, a);
  }

  private nthFree(list: Anchor[], n: number): Anchor | null {
    let k = 0;
    for (const a of list) {
      if (this.used.some((u) => Math.hypot(u.x - a.x, u.z - a.z) < (a.onProp ? 0.25 : 0.7) && Math.abs(u.y - a.y) < 0.3)) continue;
      k++;
      if (k >= n) return a;
    }
    return null;
  }

  private anchorsFor(roomId: string, surface: string): Anchor[] {
    const cacheKey = `${roomId}:${surface}`;
    const cached = this.lists.get(cacheKey);
    if (cached) return cached;
    const room = this.world.layout.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error(`pièce inconnue : ${roomId}`);
    const out: Anchor[] = [];
    if (surface !== "floor") {
      const types = SURFACE_PROPS[surface] ?? [];
      for (const type of types) {
        const props = this.world.props.instances.filter((p) => p.zone === roomId && p.def.id === type && p.pitch === 0 && p.roll === 0);
        const slots = SLOTS[type] ?? [];
        // entrelacé : un emplacement par meuble, puis les suivants
        for (let s = 0; s < slots.length; s++) {
          for (const p of props) {
            const [lx, ly, lz] = slots[s]!;
            const [x, z] = this.world.props.toWorld(p, lx, lz);
            out.push({ key: "", x, y: p.y + ly * p.scale, z, yaw: p.yaw + ((s * 1.7) % 1) - 0.5, room: roomId, sector: room.sector, onProp: p });
          }
        }
      }
    }
    if (surface === "floor" || surface === "any") out.push(...this.floorSpots(roomId));
    this.lists.set(cacheKey, out);
    return out;
  }

  /** Points de sol libres, ordre pseudo-aléatoire stable (près des murs / meubles d'abord). */
  private floorSpots(roomId: string): Anchor[] {
    const room = this.world.layout.rooms.find((r) => r.id === roomId)!;
    const y = this.world.floorY(room.floor) + (room.floorOffset ?? 0);
    const [x0, z0, x1, z1] = room.rect;
    let h = hashStr(roomId + "#floor");
    const rnd = () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const doors = this.world.openings.filter((o) => (o.roomA === room || o.roomB === room) && o.kind !== "window");
    const pts: Array<{ x: number; z: number; score: number }> = [];
    for (let x = x0 + 0.55; x <= x1 - 0.55; x += 0.5) {
      for (let z = z0 + 0.55; z <= z1 - 0.55; z += 0.5) {
        if (doors.some((o) => Math.hypot(o.x - x, o.z - z) < 1.6)) continue;
        if (!floorFree(this.collision, x, y, z, 0.3, 1.4, this.tmp)) continue;
        // proximité d'un obstacle (objet « posé contre »)
        const near = floorFree(this.collision, x, y, z, 0.75, 1.4, this.tmp) ? 1 : 0;
        pts.push({ x, z, score: near + rnd() * 0.9 });
      }
    }
    pts.sort((a, b) => a.score - b.score);
    return pts.map((p) => ({ key: "", x: p.x, y, z: p.z, yaw: rnd() * Math.PI * 2, room: roomId, sector: room.sector, onProp: null }));
  }
}

