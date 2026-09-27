import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Scene } from "@babylonjs/core/scene";

import type { EncodedTextures } from "./TexCanvas";

export interface PbrTextures {
  albedo: RawTexture;
  normal: RawTexture | null;
  orm: RawTexture | null;
}

/** Envoie des textures encodées au GPU (mipmaps, répétition, anisotropie). */
export function uploadTextures(scene: Scene, name: string, enc: EncodedTextures, aniso: number): PbrTextures {
  const tc = enc;
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
    albedo: make(enc.albedo, "albedo", true),
    normal: enc.normal ? make(enc.normal, "normal", false) : null,
    orm: enc.orm ? make(enc.orm, "orm", false) : null,
  };
}
