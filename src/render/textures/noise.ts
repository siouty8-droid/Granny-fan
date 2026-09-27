/**
 * Bruits procéduraux TILEABLES (période entière) pour la génération de textures.
 * Tout est déterministe (seed fixe) : l'hôpital a toujours le même aspect.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Noise {
  private perm = new Uint8Array(512);
  private gx = new Float32Array(256);
  private gy = new Float32Array(256);
  readonly rand: () => number;

  constructor(seed: number) {
    this.rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]!;
    for (let i = 0; i < 256; i++) {
      const a = this.rand() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  private hash(x: number, y: number): number {
    return this.perm[(this.perm[x & 255]! + (y & 255)) & 511]!;
  }

  /** Bruit de gradient tileable de période (px, py) — résultat ≈ [-1, 1]. */
  perlin(x: number, y: number, px: number, py: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ix0 = ((x0 % px) + px) % px;
    const iy0 = ((y0 % py) + py) % py;
    const ix1 = (ix0 + 1) % px;
    const iy1 = (iy0 + 1) % py;
    const h00 = this.hash(ix0, iy0);
    const h10 = this.hash(ix1, iy0);
    const h01 = this.hash(ix0, iy1);
    const h11 = this.hash(ix1, iy1);
    const d00 = this.gx[h00]! * fx + this.gy[h00]! * fy;
    const d10 = this.gx[h10]! * (fx - 1) + this.gy[h10]! * fy;
    const d01 = this.gx[h01]! * fx + this.gy[h01]! * (fy - 1);
    const d11 = this.gx[h11]! * (fx - 1) + this.gy[h11]! * (fy - 1);
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = d00 + (d10 - d00) * u;
    const b = d01 + (d11 - d01) * u;
    return (a + (b - a) * v) * 1.414;
  }

  /** fbm tileable : (u, v) ∈ [0,1[, `freq` = nombre de cellules sur la texture. */
  fbm(u: number, v: number, freq: number, octaves = 4, gain = 0.5, lacunarity = 2): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += this.perlin(u * f, v * f, f, f) * amp;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** Bruit de valeur simple (0..1) sur grille tileable. */
  value(x: number, y: number, px: number, py: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ix0 = ((x0 % px) + px) % px;
    const iy0 = ((y0 % py) + py) % py;
    const ix1 = (ix0 + 1) % px;
    const iy1 = (iy0 + 1) % py;
    const a = this.hash(ix0, iy0) / 255;
    const b = this.hash(ix1, iy0) / 255;
    const c = this.hash(ix0, iy1) / 255;
    const d = this.hash(ix1, iy1) / 255;
    const u = fx * fx * (3 - 2 * fx);
    const w = fy * fy * (3 - 2 * fy);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
}

/** Champ scalaire (w × h) avec helpers. */
export class Field {
  readonly data: Float32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Float32Array(w * h);
  }

  get(x: number, y: number): number {
    const xi = ((x % this.w) + this.w) % this.w;
    const yi = ((y % this.h) + this.h) % this.h;
    return this.data[yi * this.w + xi]!;
  }

  /** Échantillonnage bilinéaire tileable (u, v en [0,1[). */
  sample(u: number, v: number): number {
    const x = u * this.w - 0.5;
    const y = v * this.h - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const a = this.get(x0, y0);
    const b = this.get(x0 + 1, y0);
    const c = this.get(x0, y0 + 1);
    const d = this.get(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  fill(fn: (u: number, v: number, x: number, y: number) => number): this {
    const { w, h, data } = this;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      for (let x = 0; x < w; x++) data[y * w + x] = fn(x / w, v, x, y);
    }
    return this;
  }

  normalize(): this {
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of this.data) {
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const k = mx > mn ? 1 / (mx - mn) : 0;
    for (let i = 0; i < this.data.length; i++) this.data[i] = (this.data[i]! - mn) * k;
    return this;
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Bruit cellulaire (Worley) tileable : distance au point le plus proche (F1) et second (F2),
 * + identifiant de cellule. Utile pour fissures, taches, graviers, pierres.
 */
export class Cells {
  private pts: Float32Array;
  constructor(
    readonly n: number,
    rand: () => number,
  ) {
    this.pts = new Float32Array(n * n * 2);
    for (let i = 0; i < n * n; i++) {
      this.pts[i * 2] = rand();
      this.pts[i * 2 + 1] = rand();
    }
  }

  /** Renvoie [F1, F2, id] pour (u, v) ∈ [0,1[. */
  eval(u: number, v: number, out: [number, number, number]): [number, number, number] {
    const n = this.n;
    const x = u * n;
    const y = v * n;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let f1 = 9;
    let f2 = 9;
    let id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const gx = cx + i;
        const gy = cy + j;
        const wx = ((gx % n) + n) % n;
        const wy = ((gy % n) + n) % n;
        const k = wy * n + wx;
        const px = gx + this.pts[k * 2]!;
        const py = gy + this.pts[k * 2 + 1]!;
        const d = Math.hypot(px - x, py - y);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = k;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    out[0] = f1;
    out[1] = f2;
    out[2] = id;
    return out;
  }
}
