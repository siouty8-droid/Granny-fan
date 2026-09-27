import type { Collider } from "../../physics/Collider";
import { footprintAABB } from "../../physics/Collider";

/**
 * Grille d'occupation 3D (voxels de 0.25 m) pour le précalcul de l'éclairage :
 * ombres des luminaires, occlusion ambiante, visibilité du ciel et de la lune.
 */
export class VoxelGrid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly data: Uint8Array;
  readonly inv: number;

  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    sx: number,
    sy: number,
    sz: number,
    readonly cell = 0.25,
  ) {
    this.inv = 1 / cell;
    this.nx = Math.ceil(sx / cell);
    this.ny = Math.ceil(sy / cell);
    this.nz = Math.ceil(sz / cell);
    this.data = new Uint8Array(this.nx * this.ny * this.nz);
  }

  /** Marque les cellules chevauchées par une boîte (bornes monde). */
  fill(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, v = 1): void {
    const inv = this.inv;
    const eps = 1e-4;
    const x0 = Math.max(0, Math.floor((minX - this.ox) * inv + eps));
    const x1 = Math.min(this.nx - 1, Math.ceil((maxX - this.ox) * inv - eps) - 1);
    const y0 = Math.max(0, Math.floor((minY - this.oy) * inv + eps));
    const y1 = Math.min(this.ny - 1, Math.ceil((maxY - this.oy) * inv - eps) - 1);
    const z0 = Math.max(0, Math.floor((minZ - this.oz) * inv + eps));
    const z1 = Math.min(this.nz - 1, Math.ceil((maxZ - this.oz) * inv - eps) - 1);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const row = (y * this.nz + z) * this.nx;
        for (let x = x0; x <= x1; x++) this.data[row + x] = v;
      }
    }
  }

  fillCollider(c: Collider): void {
    if (c.ramp) return;
    const bb = footprintAABB(c);
    this.fill(bb.minX, c.minY, bb.minZ, bb.maxX, c.maxY, bb.maxZ);
  }

  solid(x: number, y: number, z: number): boolean {
    const ix = Math.floor((x - this.ox) * this.inv);
    const iy = Math.floor((y - this.oy) * this.inv);
    const iz = Math.floor((z - this.oz) * this.inv);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= this.nx || iy >= this.ny || iz >= this.nz) return false;
    return this.data[(iy * this.nz + iz) * this.nx + ix] !== 0;
  }

  /**
   * Marche le long d'un rayon (pas fixe) ; renvoie la distance du premier obstacle
   * ou -1 si le chemin est libre jusqu'à maxDist.
   */
  march(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, step = 0.2): number {
    const inv = this.inv;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const data = this.data;
    let t = 0;
    while (t < maxDist) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      const ix = Math.floor((x - this.ox) * inv);
      const iy = Math.floor((y - this.oy) * inv);
      const iz = Math.floor((z - this.oz) * inv);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
      if (data[(iy * nz + iz) * nx + ix] !== 0) return t;
      t += step;
    }
    return -1;
  }
}
