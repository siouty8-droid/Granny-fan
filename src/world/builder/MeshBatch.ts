import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Accumulateur de géométrie (un lot = une zone × un matériau).
 * Les quads d'architecture sont subdivisés pour porter l'éclairage précalculé par sommet.
 * Convention Babylon : la face avant a pour normale −cross(p1−p0, p2−p0).
 */
export class MeshBatch {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  /** attribut « bake » : irradiance précalculée rgb + occlusion ambiante (rempli en phase d'éclairage) */
  bake: number[] = [];
  /** attribut « bake2 » : irradiance des néons qui clignotent rgb + canal de clignotement */
  bake2: number[] = [];
  /** attribut « tint » : variation de couleur par sommet (saleté, usure) — rgb + masque */
  tint: number[] = [];

  constructor(readonly key: string, readonly zone: string, readonly material: string) {}

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get empty(): boolean {
    return this.indices.length === 0;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, tint = 1): number {
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.tint.push(tint, tint, tint, 1);
    return i;
  }

  /** Triangle orienté selon la normale fournie (corrige l'ordre si besoin). */
  tri(a: number, b: number, c: number, nx: number, ny: number, nz: number): void {
    const p = this.positions;
    const ax = p[a * 3]!,
      ay = p[a * 3 + 1]!,
      az = p[a * 3 + 2]!;
    const e1x = p[b * 3]! - ax,
      e1y = p[b * 3 + 1]! - ay,
      e1z = p[b * 3 + 2]! - az;
    const e2x = p[c * 3]! - ax,
      e2y = p[c * 3 + 1]! - ay,
      e2z = p[c * 3 + 2]! - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * nx + cy * ny + cz * nz > 0) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }

  /**
   * Quad plan subdivisé : origine o, axes u et v (vecteurs de longueur totale), normale n.
   * uv = (u0 + s * du, v0 + t * dv) où s,t ∈ [0,1].
   */
  quad(
    o: V3,
    u: V3,
    v: V3,
    n: V3,
    uvOrigin: [number, number],
    uvSize: [number, number],
    divU = 1,
    divV = 1,
  ): void {
    const base = this.vertexCount;
    const du = Math.max(1, divU);
    const dv = Math.max(1, divV);
    for (let j = 0; j <= dv; j++) {
      const t = j / dv;
      for (let i = 0; i <= du; i++) {
        const s = i / du;
        this.vertex(
          o.x + u.x * s + v.x * t,
          o.y + u.y * s + v.y * t,
          o.z + u.z * s + v.z * t,
          n.x,
          n.y,
          n.z,
          uvOrigin[0] + uvSize[0] * s,
          uvOrigin[1] + uvSize[1] * t,
        );
      }
    }
    const row = du + 1;
    for (let j = 0; j < dv; j++) {
      for (let i = 0; i < du; i++) {
        const a = base + j * row + i;
        const b = a + 1;
        const c = a + row + 1;
        const d = a + row;
        this.tri(a, b, c, n.x, n.y, n.z);
        this.tri(a, c, d, n.x, n.y, n.z);
      }
    }
  }

  /** Boîte alignée (6 faces), UV en mètres. Faces optionnelles. */
  box(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    uvScale = 1,
    faces: { top?: boolean; bottom?: boolean; px?: boolean; nx?: boolean; pz?: boolean; nz?: boolean } = {},
  ): void {
    const f = { top: true, bottom: true, px: true, nx: true, pz: true, nz: true, ...faces };
    const w = x1 - x0;
    const hgt = y1 - y0;
    const d = z1 - z0;
    const s = uvScale;
    if (f.top) this.quad({ x: x0, y: y1, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: 1, z: 0 }, [x0 * s, z0 * s], [w * s, d * s]);
    if (f.bottom) this.quad({ x: x0, y: y0, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: -1, z: 0 }, [x0 * s, z0 * s], [w * s, d * s]);
    if (f.px) this.quad({ x: x1, y: y0, z: z0 }, { x: 0, y: 0, z: d }, { x: 0, y: hgt, z: 0 }, { x: 1, y: 0, z: 0 }, [z0 * s, y0 * s], [d * s, hgt * s]);
    if (f.nx) this.quad({ x: x0, y: y0, z: z0 }, { x: 0, y: 0, z: d }, { x: 0, y: hgt, z: 0 }, { x: -1, y: 0, z: 0 }, [z0 * s, y0 * s], [d * s, hgt * s]);
    if (f.pz) this.quad({ x: x0, y: y0, z: z1 }, { x: w, y: 0, z: 0 }, { x: 0, y: hgt, z: 0 }, { x: 0, y: 0, z: 1 }, [x0 * s, y0 * s], [w * s, hgt * s]);
    if (f.nz) this.quad({ x: x0, y: y0, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: hgt, z: 0 }, { x: 0, y: 0, z: -1 }, [x0 * s, y0 * s], [w * s, hgt * s]);
  }

  /** Crée le mesh Babylon (statique). */
  toMesh(scene: Scene, name: string): Mesh {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.normals = this.normals;
    vd.uvs = this.uvs;
    vd.indices = this.indices;
    vd.applyToMesh(mesh, false);
    if (this.bake.length === this.positions.length / 3 * 4) {
      mesh.setVerticesData("bake", this.bake, false, 4);
      mesh.setVerticesData("bake2", this.bake2.length ? this.bake2 : new Array(this.bake.length).fill(0), false, 4);
    }
    return mesh;
  }
}

/** Collection de lots indexés par (zone, matériau). */
export class BatchSet {
  readonly batches = new Map<string, MeshBatch>();

  get(zone: string, material: string): MeshBatch {
    const key = `${zone}|${material}`;
    let b = this.batches.get(key);
    if (!b) {
      b = new MeshBatch(key, zone, material);
      this.batches.set(key, b);
    }
    return b;
  }

  *[Symbol.iterator](): IterableIterator<MeshBatch> {
    yield* this.batches.values();
  }
}
