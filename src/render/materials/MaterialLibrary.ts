import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { decalAtlas, signAtlas } from "../textures/DecalAtlas";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { uploadTextures, type PbrTextures } from "../textures/TexUpload";
import { FAMILIES, runTexJob, type FamilyId, type TexJob } from "../textures/families";
import type { EncodedTextures } from "../textures/TexCanvas";
import { TexturePool } from "../textures/TexturePool";
import { BakedLightPlugin } from "../BakedLightPlugin";

interface MatDef {
  fam: FamilyId;
  /** teinte sRGB (0–255) multipliée à la texture */
  tint?: [number, number, number];
  /** multiplicateur de rugosité */
  rough?: number;
  alphaTest?: boolean;
  alphaBlend?: boolean;
  twoSided?: boolean;
}

/** Tous les matériaux d'architecture. */
const MATERIALS: Record<string, MatDef> = {
  // --- sols
  terrazzo: { fam: "terrazzo" },
  lino_green: { fam: "lino", tint: [150, 185, 155] },
  lino_blue: { fam: "lino", tint: [140, 165, 200] },
  lino_gray: { fam: "lino", tint: [175, 175, 170] },
  lino_beige: { fam: "lino", tint: [215, 190, 155] },
  checker_red: { fam: "checker" },
  tile_small: { fam: "floorTiles", tint: [235, 235, 228] },
  tile_white: { fam: "floorTiles", tint: [255, 255, 250] },
  tile_cyan: { fam: "floorTiles", tint: [170, 225, 225] },
  tile_morgue: { fam: "floorTiles", tint: [200, 220, 228] },
  parquet: { fam: "parquet" },
  parquet_dark: { fam: "parquet", tint: [150, 120, 110] },
  carpet_gray: { fam: "carpet", tint: [120, 122, 130] },
  carpet_red: { fam: "carpet", tint: [150, 40, 40] },
  concrete: { fam: "concrete", tint: [205, 200, 192] },
  concrete_dirty: { fam: "concrete", tint: [170, 160, 145] },
  rubber_yellow: { fam: "rubber", tint: [235, 200, 95] },
  metal_plate: { fam: "metalPlate" },
  grass: { fam: "grass" },
  // --- murs
  paint_cream: { fam: "paint", tint: [236, 220, 188] },
  paint_cream_dark: { fam: "paint", tint: [180, 155, 118] },
  paint_green: { fam: "paint", tint: [180, 210, 180] },
  paint_green_dark: { fam: "paint", tint: [85, 125, 100] },
  paint_blue: { fam: "paint", tint: [170, 192, 215] },
  paint_blue_dark: { fam: "paint", tint: [75, 98, 135] },
  paint_yellow: { fam: "paint", tint: [236, 212, 135] },
  paint_gray: { fam: "paint", tint: [170, 170, 168] },
  paint_gray_dark: { fam: "paint", tint: [100, 100, 100] },
  paint_white: { fam: "paint", tint: [245, 245, 240] },
  paint_pink: { fam: "paint", tint: [240, 200, 195] },
  paint_pink_dark: { fam: "paint", tint: [180, 125, 125] },
  paint_pedia: { fam: "paint", tint: [245, 222, 145] },
  paint_pedia_low: { fam: "paint", tint: [120, 180, 225] },
  paint_stairs: { fam: "paint", tint: [195, 195, 182] },
  paint_yellow_hazard: { fam: "paint", tint: [230, 190, 50] },
  tile_wall_white: { fam: "wallTiles", tint: [250, 252, 248] },
  tile_wall_cyan: { fam: "wallTiles", tint: [165, 215, 215] },
  tile_wall_green: { fam: "wallTiles", tint: [120, 175, 140] },
  tile_wall_steel: { fam: "metalBrushed", tint: [200, 205, 210] },
  wood_panel: { fam: "woodPanel" },
  wood_panel_dark: { fam: "woodPanel", tint: [140, 110, 100] },
  stone: { fam: "stone" },
  lead_gray: { fam: "metalBrushed", tint: [140, 145, 150], rough: 2.2 },
  concrete_wall: { fam: "concrete", tint: [200, 195, 185] },
  metal_brushed: { fam: "metalBrushed" },
  facade: { fam: "facade", tint: [215, 200, 178] },
  brick: { fam: "brick" },
  // --- plafonds
  ceiling_tiles: { fam: "ceiling" },
  plaster: { fam: "paint", tint: [235, 232, 222] },
  concrete_ceiling: { fam: "concrete", tint: [175, 172, 165] },
  // --- divers
  concrete_stairs: { fam: "concrete", tint: [210, 205, 195] },
  metal_rail: { fam: "metalBrushed", tint: [90, 120, 105], rough: 1.6 },
  roof_gravel: { fam: "gravel" },
  coping: { fam: "concrete", tint: [190, 188, 182] },
  helipad: { fam: "helipad" },
  asphalt: { fam: "asphalt" },
  road: { fam: "asphalt", tint: [210, 210, 215] },
  sidewalk: { fam: "paving" },
  grass_ext: { fam: "grass", tint: [200, 210, 190] },
  fence: { fam: "fence", alphaTest: true, twoSided: true },
  bark: { fam: "woodPanel", tint: [110, 90, 75], rough: 1.6 },
  glass: { fam: "glass", alphaBlend: true, twoSided: true },
  window_frame: { fam: "metalBrushed", tint: [200, 200, 190], rough: 1.8 },
  // --- centre commercial
  terrazzo_mall: { fam: "terrazzo", tint: [232, 226, 214] },
  tile_mall: { fam: "floorTiles", tint: [214, 206, 192] },
  tile_dark: { fam: "floorTiles", tint: [78, 78, 82] },
  tile_metro: { fam: "floorTiles", tint: [150, 142, 132] },
  carpet_blue: { fam: "carpet", tint: [70, 90, 140] },
  carpet_purple: { fam: "carpet", tint: [105, 70, 115] },
  carpet_cinema: { fam: "carpet", tint: [120, 30, 40] },
  rubber_gray: { fam: "rubber", tint: [120, 122, 125] },
  rubber_black: { fam: "rubber", tint: [45, 45, 48] },
  paint_mall: { fam: "paint", tint: [226, 222, 212] },
  paint_mall_low: { fam: "paint", tint: [82, 92, 104] },
  paint_shop_red: { fam: "paint", tint: [190, 72, 62] },
  paint_shop_teal: { fam: "paint", tint: [86, 152, 150] },
  paint_shop_purple: { fam: "paint", tint: [142, 104, 165] },
  paint_shop_mint: { fam: "paint", tint: [182, 222, 202] },
  paint_shop_black: { fam: "paint", tint: [52, 52, 55] },
  paint_shop_orange: { fam: "paint", tint: [228, 150, 70] },
  paint_cinema: { fam: "paint", tint: [70, 28, 34] },
  paint_parking: { fam: "paint", tint: [196, 196, 190] },
  paint_parking_low: { fam: "paint", tint: [70, 110, 150] },
  tile_wall_cream: { fam: "wallTiles", tint: [246, 236, 208] },
  tile_wall_metro: { fam: "wallTiles", tint: [200, 120, 70] },
  concrete_tunnel: { fam: "concrete", tint: [128, 122, 115] },
  ballast: { fam: "gravel", tint: [130, 118, 105] },
  mall_fascia: { fam: "metalBrushed", tint: [205, 205, 200], rough: 1.4 },
  escalator_steel: { fam: "metalPlate", tint: [165, 165, 165] },
  escalator_side: { fam: "metalBrushed", tint: [185, 188, 190], rough: 1.3 },
  rail_steel: { fam: "metalBrushed", tint: [120, 110, 100], rough: 1.8 },
  sleeper: { fam: "woodPanel", tint: [90, 70, 55], rough: 1.6 },
  shutter: { fam: "metalPlate", tint: [150, 152, 150] },
  train_body: { fam: "metalBrushed", tint: [196, 202, 208], rough: 1.5 },
  train_stripe: { fam: "paint", tint: [40, 100, 170] },
};

/**
 * Bibliothèque de matériaux PBR d'architecture : textures procédurales (générées une fois
 * au chargement), teintes par matériau, éclairage précalculé via `BakedLightPlugin`, gel.
 */
export class MaterialLibrary {
  private cache = new Map<string, PBRMaterial>();
  private families = new Map<FamilyId, PbrTextures>();

  constructor(
    private readonly scene: Scene,
    private readonly texSize: number,
    private readonly aniso: number,
  ) {}

  /** Génère les familles nécessaires (avec rappel de progression, en rendant la main entre deux). */
  async generate(materialIds: Iterable<string>, onProgress: (p: number, label: string) => Promise<void> | void): Promise<void> {
    const fams = new Set<FamilyId>();
    for (const id of materialIds) {
      const d = MATERIALS[id];
      if (d) fams.add(d.fam);
    }
    fams.add("glass");
    // tâches (famille + atlas des props), les plus lourdes d'abord pour équilibrer les workers
    const jobs: TexJob[] = [...fams].map((fam) => ({ fam, size: this.familySize(fam) }));
    jobs.push({ fam: "props", size: this.propsSize });
    const cost = (j: TexJob) => j.size * j.size * (j.fam === "paint" || j.fam === "facade" ? 2 : 1) * (j.fam === "props" ? 1.5 : 1);
    jobs.sort((a, b) => cost(b) - cost(a));
    const times: string[] = [];
    const t0 = performance.now();
    let done = 0;
    await onProgress(0, "");
    await TexturePool.run(jobs, async (job, enc, ms) => {
      if (job.fam === "props") this.propsEnc = enc;
      else this.uploadFamily(job.fam, enc);
      times.push(`${job.fam} ${Math.round(ms)}`);
      done++;
      await onProgress(done / jobs.length, job.fam);
    });
    console.info(`Textures : ${Math.round(performance.now() - t0)} ms (${jobs.length} tâches) —`, times.join(" · "));
  }

  private familySize(id: FamilyId): number {
    return Math.max(64, Math.round(this.texSize * (FAMILIES[id].res ?? 1)));
  }

  private get propsSize(): number {
    return this.texSize >= 1024 && this.aniso >= 8 ? 2048 : 1024;
  }

  private uploadFamily(id: FamilyId, enc: EncodedTextures): PbrTextures {
    const def = FAMILIES[id];
    const f = uploadTextures(this.scene, `tex_${id}`, enc, this.aniso);
    for (const t of [f.albedo, f.normal, f.orm]) {
      if (!t) continue;
      t.uScale = 1 / def.size[0];
      t.vScale = 1 / def.size[1];
    }
    this.families.set(id, f);
    return f;
  }

  /** Famille (générée à la volée sur le thread principal si elle n'a pas été pré-générée). */
  private family(id: FamilyId): PbrTextures {
    return this.families.get(id) ?? this.uploadFamily(id, runTexJob({ fam: id, size: this.familySize(id) }));
  }

  has(id: string): boolean {
    return id in MATERIALS || id === "decals" || id === "signs" || id === "props";
  }

  get(id: string): PBRMaterial {
    let m = this.cache.get(id);
    if (m) return m;
    if (id === "decals") return this.decals();
    if (id === "signs") return this.signs();
    if (id === "props") return this.props();
    const def = MATERIALS[id] ?? { fam: "concrete" as FamilyId, tint: [255, 0, 255] as [number, number, number] };
    const fam = this.family(def.fam);
    m = new PBRMaterial(`mat_${id}`, this.scene);
    m.albedoTexture = fam.albedo;
    if (def.tint) m.albedoColor = Color3.FromInts(def.tint[0], def.tint[1], def.tint[2]).toLinearSpace();
    if (fam.normal) {
      m.bumpTexture = fam.normal;
      m.invertNormalMapY = true;
    }
    if (fam.orm) {
      m.metallicTexture = fam.orm;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.metallic = 1;
      m.roughness = Math.min(1.6, def.rough ?? 1);
    }
    m.maxSimultaneousLights = 2;
    m.environmentIntensity = 0;
    m.enableSpecularAntiAliasing = false;
    if (def.alphaTest) {
      m.transparencyMode = Material.MATERIAL_ALPHATEST;
      m.alphaCutOff = 0.5;
      m.useAlphaFromAlbedoTexture = true;
      fam.albedo.hasAlpha = true;
    }
    if (def.alphaBlend) {
      m.transparencyMode = Material.MATERIAL_ALPHABLEND;
      m.useAlphaFromAlbedoTexture = true;
      fam.albedo.hasAlpha = true;
      m.disableDepthWrite = true;
    }
    if (def.twoSided) {
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
    }
    new BakedLightPlugin(m);
    this.cache.set(id, m);
    return m;
  }

  private propsMat: PBRMaterial | null = null;
  /** atlas des props généré par le pool, en attente de création du matériau */
  private propsEnc: EncodedTextures | null = null;
  private propsTex: ReturnType<typeof uploadTextures> | null = null;
  private itemsMat: PBRMaterial | null = null;

  /** Matériau de l'atlas des props (couleurs par sommet = teinte × occlusion). */
  props(): PBRMaterial {
    if (this.propsMat) return this.propsMat;
    const enc = this.propsEnc ?? runTexJob({ fam: "props", size: this.propsSize });
    this.propsEnc = null;
    const tex = uploadTextures(this.scene, "tex_props", enc, this.aniso);
    this.propsTex = tex;
    for (const t of [tex.albedo, tex.normal, tex.orm]) {
      if (!t) continue;
      t.wrapU = 0;
      t.wrapV = 0;
    }
    const m = new PBRMaterial("mat_props", this.scene);
    m.albedoTexture = tex.albedo;
    if (tex.normal) {
      m.bumpTexture = tex.normal;
      m.invertNormalMapY = true;
    }
    if (tex.orm) {
      m.metallicTexture = tex.orm;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.metallic = 1;
      m.roughness = 1;
    }
    m.maxSimultaneousLights = 2;
    m.environmentIntensity = 0;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    new BakedLightPlugin(m);
    this.cache.set("props", m);
    this.propsMat = m;
    return m;
  }

  /**
   * Matériau des objets ramassables : atlas des props + émission (l'albédo sert de texture
   * émissive, intensité pulsée par le gameplay). Jamais gelé.
   */
  items(): PBRMaterial {
    if (this.itemsMat) return this.itemsMat;
    this.props();
    const tex = this.propsTex!;
    const m = new PBRMaterial("mat_items", this.scene);
    m.albedoTexture = tex.albedo;
    if (tex.normal) {
      m.bumpTexture = tex.normal;
      m.invertNormalMapY = true;
    }
    if (tex.orm) {
      m.metallicTexture = tex.orm;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.metallic = 1;
      m.roughness = 1;
    }
    m.emissiveTexture = tex.albedo;
    m.emissiveColor = new Color3(0.3, 0.3, 0.3);
    m.maxSimultaneousLights = 2;
    m.environmentIntensity = 0;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    new BakedLightPlugin(m);
    this.itemsMat = m;
    return m;
  }

  private monsterMat: { material: PBRMaterial; plugin: BakedLightPlugin } | null = null;

  /** Matériau du monstre (atlas des props, éclairage par sonde mobile), jamais gelé. */
  monster(): { material: PBRMaterial; plugin: BakedLightPlugin } {
    if (this.monsterMat) return this.monsterMat;
    this.props();
    const tex = this.propsTex!;
    const m = new PBRMaterial("mat_monster", this.scene);
    m.albedoTexture = tex.albedo;
    if (tex.normal) {
      m.bumpTexture = tex.normal;
      m.invertNormalMapY = true;
    }
    if (tex.orm) {
      m.metallicTexture = tex.orm;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useMetallnessFromMetallicTextureBlue = true;
      m.metallic = 1;
      m.roughness = 1;
    }
    m.maxSimultaneousLights = 2;
    m.environmentIntensity = 0;
    m.backFaceCulling = false;
    m.twoSidedLighting = true;
    const plugin = new BakedLightPlugin(m);
    plugin.aoOnDynamic = 0;
    this.monsterMat = { material: m, plugin };
    return this.monsterMat;
  }

  /** Matériau des decals (atlas RGBA, alpha blend, décalage de profondeur). */
  decals(): PBRMaterial {
    const cached = this.cache.get("decals");
    if (cached) return cached;
    const S = Math.min(2048, this.texSize * 2);
    const tex = rawAtlas(this.scene, "tex_decals", decalAtlas(S), S, S, this.aniso);
    const m = new PBRMaterial("mat_decals", this.scene);
    m.albedoTexture = tex;
    tex.hasAlpha = true;
    m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = Material.MATERIAL_ALPHABLEND;
    m.disableDepthWrite = true;
    m.zOffset = -2;
    m.metallic = 0;
    m.roughness = 0.55;
    m.maxSimultaneousLights = 2;
    m.environmentIntensity = 0;
    new BakedLightPlugin(m);
    this.cache.set("decals", m);
    return m;
  }

  /** Matériau des panneaux de signalétique. */
  signs(): PBRMaterial {
    const cached = this.cache.get("signs");
    if (cached) return cached;
    const W = Math.min(1024, this.texSize);
    const tex = rawAtlas(this.scene, "tex_signs", signAtlas(W), W, W * 2, this.aniso);
    const m = new PBRMaterial("mat_signs", this.scene);
    m.albedoTexture = tex;
    m.metallic = 0;
    m.roughness = 0.45;
    m.zOffset = -1;
    m.maxSimultaneousLights = 2;
    m.environmentIntensity = 0;
    new BakedLightPlugin(m);
    this.cache.set("signs", m);
    return m;
  }

  /** Gèle tous les matériaux (après la première compilation). */
  freezeAll(): void {
    for (const m of this.cache.values()) m.freeze();
  }

  /** Dégèle (recompilation possible, ex. nouvelle qualité d'ombres) ; regeler ensuite. */
  unfreezeAll(): void {
    for (const m of this.cache.values()) m.unfreeze();
  }

  all(): PBRMaterial[] {
    return [...this.cache.values()];
  }
}

function rawAtlas(scene: Scene, name: string, data: Uint8Array, w: number, h: number, aniso: number): RawTexture {
  const t = new RawTexture(data, w, h, Constants.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  t.name = name;
  t.wrapU = Texture.CLAMP_ADDRESSMODE;
  t.wrapV = Texture.CLAMP_ADDRESSMODE;
  t.anisotropicFilteringLevel = aniso;
  t.gammaSpace = true;
  return t;
}
