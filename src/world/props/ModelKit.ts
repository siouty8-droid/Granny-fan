import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Régions de l'atlas des props (grille 4×4). Chaque face d'un modèle est mappée dans une région ;
 * la couleur par sommet teinte la région et porte l'occlusion ambiante.
 */
export const Region = {
  PAINTED_METAL: 0,
  STEEL: 1,
  RUST: 2,
  PLASTIC: 3,
  FABRIC: 4,
  FABRIC_STAINED: 5,
  MATTRESS: 6,
  WOOD_LIGHT: 7,
  WOOD_DARK: 8,
  RUBBER: 9,
  PAPER: 10,
  CARDBOARD: 11,
  VINYL: 12,
  SCREEN: 13,
  WHITE: 14,
  CONCRETE: 15,
} as const;
export type RegionId = (typeof Region)[keyof typeof Region];

export const ATLAS_GRID = 4;
/** marge intérieure de chaque région (fraction) pour éviter les fuites de mip */
const PAD = 0.03;

type Vec3 = [number, number, number];
type Mat = Float64Array; // 4x4 colonne-majeure (m[col*4+row])

function ident(): Mat {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function mul(a: Mat, b: Mat): Mat {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}

function translation(x: number, y: number, z: number): Mat {
  const m = ident();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function rotY(a: number): Mat {
  const m = ident();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function rotX(a: number): Mat {
  const m = ident();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function rotZ(a: number): Mat {
  const m = ident();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

function scaling(x: number, y: number, z: number): Mat {
  const m = ident();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export interface PartStyle {
  region: RegionId;
  /** teinte sRGB 0..1 (multipliée à la région) */
  color?: Vec3;
  /** occlusion ambiante de la pièce (0..1) */
  ao?: number;
  /** échelle UV (m → fraction de région) */
  uv?: number;
  /** UV bruts 0..1 (matériaux à texture propre : panneaux, écrans…) */
  raw?: boolean;
}

/**
 * Kit de modélisation procédurale (boîtes, cylindres, tubes, profils de révolution, plaques)
 * avec pile de transformations. Produit un mesh indexé avec UV d'atlas et couleurs par sommet.
 */
export class ModelKit {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  private stack: Mat[] = [ident()];
  /** assombrissement automatique près du sol (occlusion de contact) */
  groundAO = true;

  private get m(): Mat {
    return this.stack[this.stack.length - 1]!;
  }

  push(): this {
    this.stack.push(new Float64Array(this.m));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  translate(x: number, y: number, z: number): this {
    this.stack[this.stack.length - 1] = mul(this.m, translation(x, y, z));
    return this;
  }

  rotateY(a: number): this {
    this.stack[this.stack.length - 1] = mul(this.m, rotY(a));
    return this;
  }

  rotateX(a: number): this {
    this.stack[this.stack.length - 1] = mul(this.m, rotX(a));
    return this;
  }

  rotateZ(a: number): this {
    this.stack[this.stack.length - 1] = mul(this.m, rotZ(a));
    return this;
  }

  scale(x: number, y: number, z: number): this {
    this.stack[this.stack.length - 1] = mul(this.m, scaling(x, y, z));
    return this;
  }

  private tp(x: number, y: number, z: number): Vec3 {
    const m = this.m;
    return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
  }

  private tn(x: number, y: number, z: number): Vec3 {
    // matrices sans cisaillement : on normalise après transformation (suffisant pour nos props)
    const m = this.m;
    const nx = m[0]! * x + m[4]! * y + m[8]! * z;
    const ny = m[1]! * x + m[5]! * y + m[9]! * z;
    const nz = m[2]! * x + m[6]! * y + m[10]! * z;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  /** Coordonnées d'atlas pour une région, à partir d'UV locaux (0..1 → région). */
  static regionUV(region: RegionId, u: number, v: number): [number, number] {
    const col = region % ATLAS_GRID;
    const row = Math.floor(region / ATLAS_GRID);
    const size = 1 / ATLAS_GRID;
    const uu = Math.min(1, Math.max(0, u));
    const vv = Math.min(1, Math.max(0, v));
    return [col * size + (PAD + uu * (1 - 2 * PAD)) * size, row * size + (PAD + vv * (1 - 2 * PAD)) * size];
  }

  private vert(p: Vec3, n: Vec3, u: number, v: number, st: PartStyle): number {
    const i = this.positions.length / 3;
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    if (st.raw) this.uvs.push(u, v);
    else {
      const [au, av] = ModelKit.regionUV(st.region, u, v);
      this.uvs.push(au, av);
    }
    const c = st.color ?? [1, 1, 1];
    const ao = st.ao ?? 1;
    // teintes données en sRGB : conversion en multiplicateur linéaire
    this.colors.push(c[0] ** 2.2 * ao, c[1] ** 2.2 * ao, c[2] ** 2.2 * ao, 1);
    return i;
  }

  private triN(a: number, b: number, c: number, n: Vec3): void {
    const P = this.positions;
    const e1 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
    const e2 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
    const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
    const cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
    const cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    if (cx * n[0] + cy * n[1] + cz * n[2] > 0) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }

  /** Quad plan (4 coins locaux, normale locale). UV : largeur/hauteur en m × style.uv. */
  quad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, n: Vec3, st: PartStyle): void {
    const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const h = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]);
    const k = st.uv ?? 1;
    const uw = Math.min(1, w * k);
    const vh = Math.min(1, h * k);
    const nn = this.tn(n[0], n[1], n[2]);
    const a = this.vert(this.tp(...p0), nn, 0, 0, st);
    const b = this.vert(this.tp(...p1), nn, uw, 0, st);
    const c = this.vert(this.tp(...p2), nn, uw, vh, st);
    const d = this.vert(this.tp(...p3), nn, 0, vh, st);
    this.triN(a, b, c, nn);
    this.triN(a, c, d, nn);
  }

  /** Boîte centrée en (cx, cy, cz) de demi-tailles (hx, hy, hz). */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, st: PartStyle, skip: { top?: boolean; bottom?: boolean } = {}): this {
    const x0 = cx - hx,
      x1 = cx + hx,
      y0 = cy - hy,
      y1 = cy + hy,
      z0 = cz - hz,
      z1 = cz + hz;
    if (!skip.top) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], st);
    if (!skip.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], { ...st, ao: (st.ao ?? 1) * 0.6 });
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], st);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], st);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], st);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], st);
    return this;
  }

  /** Boîte par bornes min/max. */
  boxMM(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: PartStyle, skip: { top?: boolean; bottom?: boolean } = {}): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, st, skip);
  }

  /** Cylindre entre deux points (a → b), rayon r, n segments, bouchons optionnels. */
  cylinder(a: Vec3, b: Vec3, r: number, n: number, st: PartStyle, caps = true, r2 = r): this {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return this;
    const ax: Vec3 = [dx / len, dy / len, dz / len];
    // base orthonormée autour de l'axe
    const ref: Vec3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let ux = ax[1] * ref[2] - ax[2] * ref[1];
    let uy = ax[2] * ref[0] - ax[0] * ref[2];
    let uz = ax[0] * ref[1] - ax[1] * ref[0];
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = ax[1] * uz - ax[2] * uy;
    const vy = ax[2] * ux - ax[0] * uz;
    const vz = ax[0] * uy - ax[1] * ux;
    const ring = (center: Vec3, rad: number, ang: number): Vec3 => [
      center[0] + (ux * Math.cos(ang) + vx * Math.sin(ang)) * rad,
      center[1] + (uy * Math.cos(ang) + vy * Math.sin(ang)) * rad,
      center[2] + (uz * Math.cos(ang) + vz * Math.sin(ang)) * rad,
    ];
    const k = st.uv ?? 1;
    const circ = Math.min(1, 2 * Math.PI * Math.max(r, r2) * k);
    const vlen = Math.min(1, len * k);
    const base = this.positions.length / 3;
    for (let i = 0; i <= n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const nrm = this.tn(ux * Math.cos(ang) + vx * Math.sin(ang), uy * Math.cos(ang) + vy * Math.sin(ang), uz * Math.cos(ang) + vz * Math.sin(ang));
      this.vert(this.tp(...ring(a, r, ang)), nrm, (i / n) * circ, 0, st);
      this.vert(this.tp(...ring(b, r2, ang)), nrm, (i / n) * circ, vlen, st);
    }
    for (let i = 0; i < n; i++) {
      const i0 = base + i * 2;
      const nrm: Vec3 = [this.normals[i0 * 3]!, this.normals[i0 * 3 + 1]!, this.normals[i0 * 3 + 2]!];
      this.triN(i0, i0 + 2, i0 + 3, nrm);
      this.triN(i0, i0 + 3, i0 + 1, nrm);
    }
    if (caps) {
      for (const [c, rad, sgn] of [
        [a, r, -1],
        [b, r2, 1],
      ] as Array<[Vec3, number, number]>) {
        const nrm = this.tn(ax[0] * sgn, ax[1] * sgn, ax[2] * sgn);
        const ci = this.vert(this.tp(...c), nrm, 0.5, 0.5, st);
        const first = this.positions.length / 3;
        for (let i = 0; i <= n; i++) {
          const ang = (i / n) * Math.PI * 2;
          this.vert(this.tp(...ring(c, rad, ang)), nrm, 0.5 + Math.cos(ang) * 0.5 * Math.min(1, rad * 2 * k), 0.5 + Math.sin(ang) * 0.5 * Math.min(1, rad * 2 * k), st);
        }
        for (let i = 0; i < n; i++) this.triN(ci, first + i, first + i + 1, nrm);
      }
    }
    return this;
  }

  /** Tube le long d'une polyligne (cadres de lits, fauteuils, pieds à perfusion…). */
  tube(points: Vec3[], r: number, n: number, st: PartStyle, caps = false): this {
    for (let i = 0; i < points.length - 1; i++) this.cylinder(points[i]!, points[i + 1]!, r, n, st, caps && (i === 0 || i === points.length - 2));
    // rotules aux jonctions
    for (let i = 1; i < points.length - 1; i++) this.sphere(points[i]!, r * 1.02, Math.max(4, n), st);
    return this;
  }

  /** Sphère UV basse résolution. */
  sphere(c: Vec3, r: number, n: number, st: PartStyle, sy = 1): this {
    const rings = Math.max(3, Math.floor(n / 2));
    const base = this.positions.length / 3;
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI;
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th);
        const ny = Math.cos(phi);
        const nz = Math.sin(phi) * Math.sin(th);
        this.vert(this.tp(c[0] + nx * r, c[1] + ny * r * sy, c[2] + nz * r), this.tn(nx, ny / sy, nz), i / n, j / rings, st);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        const b = a + 1;
        const cc = a + n + 2;
        const d = a + n + 1;
        const nrm: Vec3 = [this.normals[a * 3]!, this.normals[a * 3 + 1]!, this.normals[a * 3 + 2]!];
        this.triN(a, b, cc, nrm);
        this.triN(a, cc, d, nrm);
      }
    }
    return this;
  }

  /** Profil de révolution autour de Y : liste de (rayon, hauteur). */
  lathe(profile: Array<[number, number]>, n: number, st: PartStyle, cx = 0, cz = 0): this {
    const base = this.positions.length / 3;
    for (let j = 0; j < profile.length; j++) {
      const [r, y] = profile[j]!;
      const prev = profile[Math.max(0, j - 1)]!;
      const next = profile[Math.min(profile.length - 1, j + 1)]!;
      const dr = next[0] - prev[0];
      const dy = next[1] - prev[1];
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.PI * 2;
        const c = Math.cos(th);
        const s = Math.sin(th);
        // normale : perpendiculaire au profil
        const nx = dy * c;
        const ny = -dr;
        const nz = dy * s;
        this.vert(this.tp(cx + r * c, y, cz + r * s), this.tn(nx, ny, nz), i / n, j / (profile.length - 1), st);
      }
    }
    for (let j = 0; j < profile.length - 1; j++) {
      for (let i = 0; i < n; i++) {
        const a = base + j * (n + 1) + i;
        const b = a + 1;
        const cc = a + n + 2;
        const d = a + n + 1;
        const nrm: Vec3 = [this.normals[a * 3]!, this.normals[a * 3 + 1]!, this.normals[a * 3 + 2]!];
        this.triN(a, b, cc, nrm);
        this.triN(a, cc, d, nrm);
      }
    }
    return this;
  }

  /**
   * Nappe déformée (rideaux, draps) : grille (nu × nv) sur le plan XY local, déplacée en Z par `fz`.
   */
  sheet(w: number, h: number, nu: number, nv: number, fz: (u: number, v: number) => number, st: PartStyle, twoSided = true): this {
    const sides = twoSided ? [1, -1] : [1];
    for (const side of sides) {
      const base = this.positions.length / 3;
      for (let j = 0; j <= nv; j++) {
        for (let i = 0; i <= nu; i++) {
          const u = i / nu;
          const v = j / nv;
          const z = fz(u, v);
          const e = 0.01;
          const dzu = (fz(Math.min(1, u + e), v) - fz(Math.max(0, u - e), v)) / (2 * e * w);
          const dzv = (fz(u, Math.min(1, v + e)) - fz(u, Math.max(0, v - e))) / (2 * e * h);
          const n = this.tn(-dzu * side, -dzv * side, side);
          this.vert(this.tp(u * w - w / 2, v * h, z), n, u * Math.min(1, w), v * Math.min(1, h), st);
        }
      }
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          const a = base + j * (nu + 1) + i;
          const b = a + 1;
          const c = a + nu + 2;
          const d = a + nu + 1;
          const nrm: Vec3 = [this.normals[a * 3]!, this.normals[a * 3 + 1]!, this.normals[a * 3 + 2]!];
          this.triN(a, b, c, nrm);
          this.triN(a, c, d, nrm);
        }
      }
    }
    return this;
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Applique l'occlusion de contact près du sol (y local < 0.35). */
  private applyGroundAO(): void {
    if (!this.groundAO) return;
    for (let i = 0; i < this.positions.length / 3; i++) {
      const y = this.positions[i * 3 + 1]!;
      const k = y < 0.35 ? 0.62 + (y / 0.35) * 0.38 : 1;
      this.colors[i * 4]! *= k;
      this.colors[i * 4 + 1]! *= k;
      this.colors[i * 4 + 2]! *= k;
    }
  }

  toMesh(name: string, scene: Scene): Mesh {
    this.applyGroundAO();
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.positions;
    vd.normals = this.normals;
    vd.uvs = this.uvs;
    vd.colors = this.colors;
    vd.indices = this.indices;
    vd.applyToMesh(mesh, false);
    return mesh;
  }
}
