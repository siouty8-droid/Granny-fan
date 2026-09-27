import { type Collider, footprintAABB, topHeightAt, toLocalX, toLocalZ } from "./Collider";

const CELL = 4;
const OFFSET = 4096;

function key(ix: number, iz: number): number {
  return (ix + OFFSET) * 8192 + (iz + OFFSET);
}

export interface RayHit {
  t: number;
  collider: Collider;
  /** normale approximative de la face touchée (monde) */
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Monde de collision : grille spatiale uniforme (XZ) de boîtes orientées / rampes.
 * Utilisé par le joueur (capsule), les raycasts (interaction, ligne de vue de l'IA)
 * et comme source de la géométrie de navigation.
 */
export class CollisionWorld {
  private grid = new Map<number, Collider[]>();
  private stampCounter = 1;
  readonly all: Collider[] = [];

  add(c: Collider): Collider {
    this.all.push(c);
    this.insert(c);
    return c;
  }

  addMany(list: Collider[]): void {
    for (const c of list) this.add(c);
  }

  remove(c: Collider): void {
    this.erase(c);
    const i = this.all.indexOf(c);
    if (i >= 0) this.all.splice(i, 1);
  }

  /** À appeler après avoir déplacé / tourné un collider. */
  update(c: Collider): void {
    this.erase(c);
    this.insert(c);
  }

  clear(): void {
    this.grid.clear();
    this.all.length = 0;
  }

  private insert(c: Collider): void {
    const bb = footprintAABB(c);
    const x0 = Math.floor(bb.minX / CELL);
    const x1 = Math.floor(bb.maxX / CELL);
    const z0 = Math.floor(bb.minZ / CELL);
    const z1 = Math.floor(bb.maxZ / CELL);
    c.cells.length = 0;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let list = this.grid.get(k);
        if (!list) {
          list = [];
          this.grid.set(k, list);
        }
        list.push(c);
        c.cells.push(k);
      }
    }
  }

  private erase(c: Collider): void {
    for (const k of c.cells) {
      const list = this.grid.get(k);
      if (!list) continue;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
    }
    c.cells.length = 0;
  }

  /** Récupère les colliders actifs (masque) dont l'empreinte touche le rectangle XZ. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, mask: number, out: Collider[]): Collider[] {
    out.length = 0;
    const stamp = ++this.stampCounter;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.grid.get(key(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === stamp || !c.enabled || (c.mask & mask) === 0) continue;
          c.stamp = stamp;
          out.push(c);
        }
      }
    }
    return out;
  }

  private tmp: Collider[] = [];

  /**
   * Hauteur du sol sous (x, z) : surface la plus haute dont le sommet est <= maxY.
   * Retourne -Infinity si rien.
   */
  groundHeight(x: number, z: number, maxY: number, mask: number, out?: { surface: Collider | null }): number {
    const list = this.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, mask, this.tmp);
    let best = -Infinity;
    let bestC: Collider | null = null;
    for (const c of list) {
      const lx = toLocalX(c, x, z);
      const lz = toLocalZ(c, x, z);
      if (Math.abs(lx) > c.hx || Math.abs(lz) > c.hz) continue;
      const top = topHeightAt(c, x, z);
      if (top <= maxY && top > best) {
        best = top;
        bestC = c;
      }
    }
    if (out) out.surface = bestC;
    return best;
  }

  /**
   * Raycast segment (origine + dir normalisée * maxDist) contre les boîtes du masque.
   * Les rampes sont traitées comme leur volume englobant.
   */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    mask: number,
    ignore?: (c: Collider) => boolean,
  ): RayHit | null {
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    // Parcours des cellules traversées (DDA 2D)
    let ix = Math.floor(ox / CELL);
    let iz = Math.floor(oz / CELL);
    const ixEnd = Math.floor(ex / CELL);
    const izEnd = Math.floor(ez / CELL);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const invDx = dx !== 0 ? 1 / Math.abs(dx) : Infinity;
    const invDz = dz !== 0 ? 1 / Math.abs(dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (ix + 1) * CELL - ox : ox - ix * CELL) * invDx) : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (iz + 1) * CELL - oz : oz - iz * CELL) * invDz) : Infinity;
    const tDeltaX = CELL * invDx;
    const tDeltaZ = CELL * invDz;

    const stamp = ++this.stampCounter;
    let best: RayHit | null = null;
    let guard = 0;
    for (;;) {
      const list = this.grid.get(key(ix, iz));
      if (list) {
        for (const c of list) {
          if (c.stamp === stamp || !c.enabled || (c.mask & mask) === 0) continue;
          c.stamp = stamp;
          if (ignore && ignore(c)) continue;
          const hit = rayBox(c, ox, oy, oz, dx, dy, dz, best ? best.t : maxDist);
          if (hit) best = hit;
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best && best.t <= tNext) break;
      if ((ix === ixEnd && iz === izEnd) || tNext > maxDist || ++guard > 512) break;
      if (tMaxX < tMaxZ) {
        tMaxX += tDeltaX;
        ix += stepX;
      } else {
        tMaxZ += tDeltaZ;
        iz += stepZ;
      }
    }
    return best;
  }

  /** Ligne de vue dégagée entre deux points ? */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number, mask: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, mask) === null;
  }
}

/** Intersection rayon / boîte orientée (slabs dans le repère local). */
function rayBox(
  c: Collider,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
): RayHit | null {
  const lox = toLocalX(c, ox, oz);
  const loz = toLocalZ(c, ox, oz);
  const ldx = dx * c.cos + dz * c.sin;
  const ldz = -dx * c.sin + dz * c.cos;
  let tMin = 0;
  let tMax = maxT;
  let axis = -1;
  let sign = 0;

  // axe X local
  if (Math.abs(ldx) < 1e-9) {
    if (lox < -c.hx || lox > c.hx) return null;
  } else {
    const inv = 1 / ldx;
    let t1 = (-c.hx - lox) * inv;
    let t2 = (c.hx - lox) * inv;
    let s = -1;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
      s = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = 0;
      sign = s;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  // axe Y
  if (Math.abs(dy) < 1e-9) {
    if (oy < c.minY || oy > c.maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (c.minY - oy) * inv;
    let t2 = (c.maxY - oy) * inv;
    let s = -1;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
      s = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = 1;
      sign = s;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  // axe Z local
  if (Math.abs(ldz) < 1e-9) {
    if (loz < -c.hz || loz > c.hz) return null;
  } else {
    const inv = 1 / ldz;
    let t1 = (-c.hz - loz) * inv;
    let t2 = (c.hz - loz) * inv;
    let s = -1;
    if (t1 > t2) {
      const t = t1;
      t1 = t2;
      t2 = t;
      s = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = 2;
      sign = s;
    }
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }
  if (axis === -1) {
    // origine à l'intérieur : on considère un impact immédiat
    return { t: 0, collider: c, nx: -dx, ny: -dy, nz: -dz };
  }
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (axis === 0) {
    nx = sign * c.cos;
    nz = sign * c.sin;
  } else if (axis === 1) {
    ny = sign;
  } else {
    nx = -sign * c.sin;
    nz = sign * c.cos;
  }
  return { t: tMin, collider: c, nx, ny, nz };
}
