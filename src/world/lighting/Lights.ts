import { FLICKER_SLOTS } from "../../render/BakedLightPlugin";
import type { ZoneInfo } from "../builder/ArchitectureBuilder";
import type { FloorDef, HospitalLayout, RoomDef } from "../layout/types";
import { THEMES } from "../themes";

/** Luminaire placé (visuel + source de lumière précalculée). */
export interface Fixture {
  id: number;
  zone: string;
  kind: "neon" | "bulb" | "emergency" | "exit" | "street" | "canopy";
  x: number;
  y: number;
  z: number;
  /** orientation du tube (neon) : le long de x ou de z */
  alongX: boolean;
  state: "on" | "off" | "flicker";
  /** canal de clignotement (0 = aucun) */
  slot: number;
  /** couleur linéaire × intensité */
  color: [number, number, number];
  /** portée (m) */
  range: number;
}

/** Aléatoire déterministe pour la décoration (indépendant de la seed de run). */
export function decorRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Intensité d'un néon standard (candela approximatif, unités du bake). */
const NEON_POWER = 4.2;
const BULB_POWER = 3.0;

/**
 * Place les luminaires de chaque pièce selon son thème (grille / ligne centrale en couloir),
 * avec une part de luminaires cassés et de néons qui clignotent (canaux partagés par zone).
 */
export function placeFixtures(layout: HospitalLayout, zones: Map<string, ZoneInfo>): { fixtures: Fixture[]; zoneSlots: Map<string, number> } {
  const fixtures: Fixture[] = [];
  const zoneSlots = new Map<string, number>();
  let nextSlot = 1;
  let id = 0;
  const floorsById = new Map<string, FloorDef>(layout.floors.map((f) => [f.id, f]));

  for (const room of layout.rooms) {
    const theme = THEMES[room.theme];
    const L = theme.light;
    if (L.kind === "none" || L.kind === "sky") continue;
    const f = floorsById.get(room.floor)!;
    const zone = zones.get(room.id);
    if (!zone) continue;
    const rnd = decorRand(hashStr(room.id));
    const [x0, z0, x1, z1] = room.rect;
    const w = x1 - x0;
    const d = z1 - z0;
    const ceilY = room.shaft ? zone.maxY - 0.25 : f.y + (room.ceiling ?? f.ceiling) - 0.04;
    const positions: Array<[number, number, boolean]> = [];
    const s = L.spacing;
    if (room.kind === "stair") {
      // cages : applique au-dessus du palier de chaque niveau
      positions.push([(x0 + x1) / 2, (z0 + z1) / 2, w > d]);
    } else if (Math.min(w, d) <= 3.6) {
      const alongX = w >= d;
      const len = alongX ? w : d;
      const n = Math.max(1, Math.round(len / s));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        positions.push(alongX ? [x0 + w * t, (z0 + z1) / 2, true] : [(x0 + x1) / 2, z0 + d * t, false]);
      }
    } else {
      const nx = Math.max(1, Math.round(w / s));
      const nz = Math.max(1, Math.round(d / s));
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) positions.push([x0 + (w * (i + 0.5)) / nx, z0 + (d * (j + 0.5)) / nz, w >= d]);
      }
    }
    let working = 0;
    const states: Array<"on" | "off" | "flicker"> = positions.map(() => {
      const r = rnd();
      if (r < L.broken) return "off";
      if (r < L.broken + L.flicker) return "flicker";
      return "on";
    });
    // lisibilité : au moins un luminaire actif dans les grandes pièces et les couloirs
    for (const st of states) if (st !== "off") working++;
    if (working === 0 && positions.length > 0 && (room.kind === "corridor" || w * d > 30 || room.kind === "stair")) {
      states[Math.floor(rnd() * states.length)] = "on";
    }
    let slot = 0;
    if (states.includes("flicker")) {
      slot = zoneSlots.get(room.id) ?? 0;
      if (!slot) {
        slot = nextSlot;
        nextSlot = nextSlot + 1 >= FLICKER_SLOTS ? 1 : nextSlot + 1;
        zoneSlots.set(room.id, slot);
      }
    }
    positions.forEach(([x, z, alongX], i) => {
      const st = states[i]!;
      const kind: Fixture["kind"] = L.kind === "bulb" ? "bulb" : L.kind === "emergency" ? "emergency" : "neon";
      const power = (kind === "bulb" ? BULB_POWER : NEON_POWER) * L.intensity;
      fixtures.push({
        id: id++,
        zone: room.id,
        kind,
        x,
        y: room.kind === "stair" ? f.y + 2.8 : ceilY,
        z,
        alongX,
        state: st,
        slot: st === "flicker" ? slot : 0,
        color: [L.color[0] * power, L.color[1] * power, L.color[2] * power],
        range: kind === "emergency" ? 7 : 10,
      });
    });
  }

  // extérieur : quelques sources ponctuelles
  const ext = (x: number, y: number, z: number, kind: Fixture["kind"], color: [number, number, number], state: Fixture["state"] = "on", range = 16) => {
    let slot = 0;
    if (state === "flicker") {
      slot = nextSlot;
      nextSlot = nextSlot + 1 >= FLICKER_SLOTS ? 1 : nextSlot + 1;
    }
    fixtures.push({ id: id++, zone: "ext", kind, x, y, z, alongX: true, state, slot, color, range });
  };
  ext(46.5, 5.6, -35.2, "street", [9.5, 6.2, 2.8]); // réverbère près de la voiture du pote (sodium)
  ext(20, 5.6, -35.2, "street", [7, 4.6, 2.2], "flicker");
  ext(40.5, 3.3, -2.6, "canopy", [2.2, 2.4, 2.6], "flicker", 10); // auvent de l'entrée
  ext(83, 3.25, 30, "canopy", [2.6, 3.0, 3.6], "on", 12); // auvent des urgences
  ext(88, 3.8, 16, "street", [4.2, 3.2, 2.0], "off");
  ext(0.4, 2.7, 22, "canopy", [2.4, 2.2, 1.6], "on", 9); // porte de livraison
  return { fixtures, zoneSlots };
}

export function roomLightInfo(room: RoomDef): string {
  return THEMES[room.theme].light.kind;
}
