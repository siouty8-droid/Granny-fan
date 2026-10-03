import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Noise } from "./textures/noise";

/** Direction de la lune (identique au précalcul d'éclairage). */
export const MOON_DIR = (() => {
  const v = [-0.38, 0.78, -0.5];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();

/**
 * Ciel nocturne procédural (texture équirectangulaire générée au chargement) :
 * dégradé, halo orangé de la ville à l'horizon, étoiles, lune et son halo, nuages effilochés.
 */
export class Sky {
  readonly mesh: Mesh;

  constructor(scene: Scene, width = 1024) {
    const h = width / 2;
    const data = new Uint8Array(width * h * 4);
    const N = new Noise(2024);
    const md = MOON_DIR;
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // étoiles pré-tirées
    const stars = new Float32Array(width * h);
    const nStars = Math.round(1400 * (width / 2048) ** 2);
    for (let i = 0; i < nStars; i++) {
      const x = Math.floor(rnd() * width);
      // plus d'étoiles vers le zénith
      const y = Math.floor(rnd() ** 1.4 * h * 0.5);
      const b = rnd() ** 4;
      stars[y * width + x] = 0.12 + b * 0.9;
    }
    for (let y = 0; y < h; y++) {
      // v = 0 en haut (zénith) → élévation
      const el = (0.5 - (y + 0.5) / h) * Math.PI;
      const sinEl = Math.sin(el);
      for (let x = 0; x < width; x++) {
        const az = ((x + 0.5) / width) * Math.PI * 2;
        const dx = Math.cos(el) * Math.sin(az);
        const dy = sinEl;
        const dz = Math.cos(el) * Math.cos(az);
        const up = Math.max(0, dy);
        // dégradé : zénith bleu nuit → horizon gris-bleu + pollution lumineuse orangée
        let r = 0.012 + (1 - up) ** 3 * 0.05;
        let g = 0.016 + (1 - up) ** 3 * 0.055;
        let b = 0.03 + (1 - up) ** 3 * 0.075;
        const glow = Math.exp(-Math.abs(dy) * 9);
        r += glow * 0.09;
        g += glow * 0.055;
        b += glow * 0.03;
        // nuages
        const u = x / width;
        const v = y / h;
        const c = N.fbm(u, v * 0.5, 6, 5) * 0.5 + 0.5;
        const cloud = Math.max(0, c - 0.52) * 2.2 * (0.3 + up);
        // lune et halo
        const md2 = dx * md[0] + dy * md[1] + dz * md[2];
        const ang = Math.acos(Math.min(1, md2));
        const disc = ang < 0.022 ? 1 : 0;
        const halo = Math.exp(-ang * 18) * 0.35 + Math.exp(-ang * 4) * 0.06;
        const moonLit = (r + g + b) / 3;
        void moonLit;
        // les nuages sont éclairés près de la lune, sombres ailleurs
        const cloudCol = 0.02 + halo * 0.8;
        r = r * (1 - cloud) + cloudCol * 0.9 * cloud;
        g = g * (1 - cloud) + cloudCol * 0.95 * cloud;
        b = b * (1 - cloud) + cloudCol * 1.1 * cloud;
        r += halo * 0.55;
        g += halo * 0.62;
        b += halo * 0.8;
        if (disc) {
          // cratères discrets
          const crater = N.fbm(dx * 40, dz * 40, 4, 3) * 0.5 + 0.5;
          const m = 0.85 + crater * 0.15;
          r = 1.0 * m;
          g = 0.98 * m;
          b = 0.9 * m;
        }
        const s = stars[y * width + x]! * (1 - cloud * 1.5) * (1 - Math.min(1, halo * 3));
        if (s > 0) {
          r += s;
          g += s;
          b += s * 1.1;
        }
        const i = (y * width + x) * 4;
        data[i] = Math.min(255, Math.pow(Math.min(1, r), 1 / 2.2) * 255);
        data[i + 1] = Math.min(255, Math.pow(Math.min(1, g), 1 / 2.2) * 255);
        data[i + 2] = Math.min(255, Math.pow(Math.min(1, b), 1 / 2.2) * 255);
        data[i + 3] = 255;
      }
    }
    const tex = new RawTexture(data, width, h, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    tex.gammaSpace = true;

    const mat = new StandardMaterial("skyMat", scene);
    mat.disableLighting = true;
    mat.emissiveTexture = tex;
    // StandardMaterial : la texture émissive s'AJOUTE à emissiveColor
    mat.emissiveColor = new Color3(0, 0, 0);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mat.fogEnabled = false;
    mat.disableDepthWrite = true;
    const sphere = CreateSphere("sky", { diameter: 200, segments: 24, sideOrientation: 1 }, scene);
    sphere.material = mat;
    sphere.infiniteDistance = true;
    sphere.isPickable = false;
    sphere.renderingGroupId = 0;
    sphere.applyFog = false;
    // UV de la sphère Babylon : v = 0 au pôle haut (zénith) = première ligne de la texture
    this.mesh = sphere;
    mat.freeze();
  }
}
