/** Surfaces (sons de pas, bruit perçu par l'IA). */
export type Surface = "tile" | "concrete" | "grass" | "metal" | "wood";

/** Masques de collision. */
export const CollisionMask = {
  PLAYER: 1,
  MONSTER: 2,
  /** bloque la ligne de vue (IA, lampe) */
  SIGHT: 4,
  /** incluse dans la géométrie de navigation */
  NAV: 8,
  /** raycast d'interaction (bloque la visée des objets) */
  INTERACT: 16,
  ALL: 31,
} as const;

/**
 * Boîte orientée autour de l'axe Y (ou rampe).
 * Repère local : x local = (cos, sin) dans le plan XZ monde, z local = (-sin, cos).
 */
export interface Collider {
  id: number;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
  minY: number;
  maxY: number;
  /** rampe : la surface marchable monte de y0 (z local = -hz) à y1 (z local = +hz), non bloquante */
  ramp: boolean;
  y0: number;
  y1: number;
  mask: number;
  surface: Surface;
  enabled: boolean;
  /** donnée associée (porte, cachette…) */
  tag: unknown;
  /** interne : cellules de la grille occupées */
  cells: number[];
  /** interne : tampon anti-doublon des requêtes */
  stamp: number;
}

let nextId = 1;

export interface BoxOptions {
  /** angle autour de Y (radians) */
  angle?: number;
  mask?: number;
  surface?: Surface;
  tag?: unknown;
}

/** Crée une boîte : centre (x, z), demi-tailles (hx, hz), intervalle vertical [minY, maxY]. */
export function makeBox(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  minY: number,
  maxY: number,
  opts: BoxOptions = {},
): Collider {
  const a = opts.angle ?? 0;
  return {
    id: nextId++,
    cx,
    cz,
    hx,
    hz,
    cos: Math.cos(a),
    sin: Math.sin(a),
    minY,
    maxY,
    ramp: false,
    y0: maxY,
    y1: maxY,
    mask: opts.mask ?? CollisionMask.ALL,
    surface: opts.surface ?? "concrete",
    enabled: true,
    tag: opts.tag,
    cells: [],
    stamp: 0,
  };
}

/** Boîte alignée définie par ses bornes min/max. */
export function makeAABB(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  opts: BoxOptions = {},
): Collider {
  return makeBox((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2, minY, maxY, opts);
}

/**
 * Rampe (escaliers) : rectangle centré (cx, cz), demi-tailles (hx, hz), orienté par `angle`.
 * La hauteur va de y0 (bord z local négatif) à y1 (bord z local positif).
 */
export function makeRamp(
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  angle: number,
  y0: number,
  y1: number,
  surface: Surface = "concrete",
): Collider {
  const c = makeBox(cx, cz, hx, hz, Math.min(y0, y1) - 0.3, Math.max(y0, y1), {
    angle,
    mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV,
    surface,
  });
  c.ramp = true;
  c.y0 = y0;
  c.y1 = y1;
  return c;
}

export function setColliderAngle(c: Collider, angle: number): void {
  c.cos = Math.cos(angle);
  c.sin = Math.sin(angle);
}

/** Coordonnées locales d'un point monde. */
export function toLocalX(c: Collider, x: number, z: number): number {
  return (x - c.cx) * c.cos + (z - c.cz) * c.sin;
}
export function toLocalZ(c: Collider, x: number, z: number): number {
  return -(x - c.cx) * c.sin + (z - c.cz) * c.cos;
}

/** Hauteur de la surface supérieure au point (x, z) (supposé à l'intérieur de l'empreinte). */
export function topHeightAt(c: Collider, x: number, z: number): number {
  if (!c.ramp) return c.maxY;
  const lz = toLocalZ(c, x, z);
  const t = Math.min(1, Math.max(0, (lz + c.hz) / (2 * c.hz)));
  return c.y0 + (c.y1 - c.y0) * t;
}

/** Le point (x, z) est-il dans l'empreinte (avec marge) ? */
export function containsXZ(c: Collider, x: number, z: number, margin = 0): boolean {
  const lx = toLocalX(c, x, z);
  const lz = toLocalZ(c, x, z);
  return Math.abs(lx) <= c.hx + margin && Math.abs(lz) <= c.hz + margin;
}

/** AABB monde de l'empreinte. */
export function footprintAABB(c: Collider): { minX: number; minZ: number; maxX: number; maxZ: number } {
  const ex = Math.abs(c.cos) * c.hx + Math.abs(c.sin) * c.hz;
  const ez = Math.abs(c.sin) * c.hx + Math.abs(c.cos) * c.hz;
  return { minX: c.cx - ex, minZ: c.cz - ez, maxX: c.cx + ex, maxZ: c.cz + ez };
}
