import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Surface de travail d'une texture procédurale PBR :
 * albedo (sRGB 0..1), hauteur (→ normal map), rugosité, métal, occlusion.
 */
export class TexCanvas {
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly a: Float32Array;
  readonly height: Float32Array;
  readonly rough: Float32Array;
  readonly metal: Float32Array;
  readonly ao: Float32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    const n = w * h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n).fill(1);
    this.height = new Float32Array(n);
    this.rough = new Float32Array(n).fill(0.8);
    this.metal = new Float32Array(n);
    this.ao = new Float32Array(n).fill(1);
  }

  /** Remplit pixel par pixel. `fn` reçoit (u, v, x, y, i) et écrit via les setters. */
  each(fn: (u: number, v: number, x: number, y: number, i: number) => void): void {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h;
      for (let x = 0; x < w; x++) fn((x + 0.5) / w, v, x, y, y * w + x);
    }
  }

  set(i: number, r: number, g: number, b: number): void {
    this.r[i] = r;
    this.g[i] = g;
    this.b[i] = b;
  }

  /** Multiplie la couleur (assombrissement). */
  mul(i: number, k: number): void {
    this.r[i]! *= k;
    this.g[i]! *= k;
    this.b[i]! *= k;
  }

  /** Mélange vers une couleur. */
  mix(i: number, r: number, g: number, b: number, t: number): void {
    if (t <= 0) return;
    if (t > 1) t = 1;
    this.r[i] = this.r[i]! + (r - this.r[i]!) * t;
    this.g[i] = this.g[i]! + (g - this.g[i]!) * t;
    this.b[i] = this.b[i]! + (b - this.b[i]!) * t;
  }

  private rgbaBytes(fn: (i: number, out: Uint8Array, o: number) => void): Uint8Array {
    const n = this.w * this.h;
    const out = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) fn(i, out, i * 4);
    return out;
  }

  albedoBytes(): Uint8Array {
    return this.rgbaBytes((i, o, k) => {
      o[k] = clampByte(this.r[i]! * 255);
      o[k + 1] = clampByte(this.g[i]! * 255);
      o[k + 2] = clampByte(this.b[i]! * 255);
      o[k + 3] = clampByte(this.a[i]! * 255);
    });
  }

  /** Normal map (espace tangent, convention OpenGL : +Y vers le haut) depuis la hauteur. */
  normalBytes(strength: number): Uint8Array {
    const { w, h, height } = this;
    const H = (x: number, y: number) => height[(((y % h) + h) % h) * w + (((x % w) + w) % w)]!;
    const s = strength * (w / 256);
    return this.rgbaBytes((i, o, k) => {
      const x = i % w;
      const y = (i / w) | 0;
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * s;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * s;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      o[k] = clampByte((nx * 0.5 + 0.5) * 255);
      o[k + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      o[k + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      o[k + 3] = 255;
    });
  }

  /** ORM : R = occlusion, G = rugosité, B = métal. */
  ormBytes(): Uint8Array {
    return this.rgbaBytes((i, o, k) => {
      o[k] = clampByte(this.ao[i]! * 255);
      o[k + 1] = clampByte(this.rough[i]! * 255);
      o[k + 2] = clampByte(this.metal[i]! * 255);
      o[k + 3] = 255;
    });
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

export interface PbrTextures {
  albedo: RawTexture;
  normal: RawTexture | null;
  orm: RawTexture | null;
}

/** Envoie une TexCanvas au GPU (mipmaps, répétition, anisotropie). */
export function uploadTextures(scene: Scene, name: string, tc: TexCanvas, normalStrength: number, aniso: number, withOrm = true): PbrTextures {
  const make = (data: Uint8Array, suffix: string, srgb: boolean): RawTexture => {
    const t = new RawTexture(
      data,
      tc.w,
      tc.h,
      Constants.TEXTUREFORMAT_RGBA,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
    );
    t.name = `${name}_${suffix}`;
    t.wrapU = Texture.WRAP_ADDRESSMODE;
    t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = aniso;
    t.gammaSpace = srgb;
    return t;
  };
  return {
    albedo: make(tc.albedoBytes(), "albedo", true),
    normal: normalStrength > 0 ? make(tc.normalBytes(normalStrength), "normal", false) : null,
    orm: withOrm ? make(tc.ormBytes(), "orm", false) : null,
  };
}
