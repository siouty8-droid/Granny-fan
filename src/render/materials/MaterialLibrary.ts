import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

/** Couleur de base (sRGB 0–255) + rugosité + métal pour chaque matériau d'architecture. */
const BASE: Record<string, [number, number, number, number, number]> = {
  // sols
  terrazzo: [170, 160, 140, 0.55, 0],
  lino_green: [95, 120, 100, 0.6, 0],
  lino_blue: [90, 110, 135, 0.6, 0],
  lino_gray: [120, 120, 118, 0.65, 0],
  lino_beige: [160, 140, 115, 0.65, 0],
  checker_red: [150, 60, 55, 0.5, 0],
  tile_small: [170, 170, 165, 0.45, 0],
  tile_white: [200, 200, 195, 0.4, 0],
  tile_cyan: [110, 170, 170, 0.4, 0],
  tile_morgue: [150, 165, 170, 0.35, 0],
  parquet: [120, 80, 50, 0.6, 0],
  parquet_dark: [80, 50, 32, 0.6, 0],
  carpet_gray: [85, 85, 90, 0.95, 0],
  carpet_red: [110, 30, 30, 0.95, 0],
  concrete: [120, 118, 112, 0.9, 0],
  concrete_dirty: [95, 90, 82, 0.95, 0],
  rubber_yellow: [190, 160, 70, 0.8, 0],
  metal_plate: [120, 120, 125, 0.45, 0.8],
  grass: [60, 85, 40, 1, 0],
  // murs
  paint_cream: [200, 185, 155, 0.85, 0],
  paint_cream_dark: [150, 130, 100, 0.8, 0],
  paint_green: [150, 175, 150, 0.85, 0],
  paint_green_dark: [70, 100, 80, 0.8, 0],
  paint_blue: [140, 160, 180, 0.85, 0],
  paint_blue_dark: [60, 80, 110, 0.8, 0],
  paint_yellow: [200, 180, 110, 0.85, 0],
  paint_gray: [140, 140, 138, 0.85, 0],
  paint_gray_dark: [80, 80, 80, 0.85, 0],
  paint_white: [210, 210, 205, 0.85, 0],
  paint_pink: [205, 170, 165, 0.85, 0],
  paint_pink_dark: [150, 105, 105, 0.8, 0],
  paint_pedia: [210, 190, 120, 0.85, 0],
  paint_pedia_low: [100, 150, 190, 0.8, 0],
  paint_stairs: [160, 160, 150, 0.85, 0],
  paint_yellow_hazard: [200, 170, 40, 0.8, 0],
  tile_wall_white: [210, 212, 208, 0.35, 0],
  tile_wall_cyan: [120, 180, 180, 0.35, 0],
  tile_wall_green: [90, 140, 110, 0.35, 0],
  tile_wall_steel: [150, 155, 160, 0.4, 0.7],
  wood_panel: [110, 75, 45, 0.6, 0],
  wood_panel_dark: [70, 45, 28, 0.55, 0],
  stone: [130, 125, 115, 0.9, 0],
  lead_gray: [100, 105, 108, 0.7, 0.2],
  concrete_wall: [125, 122, 115, 0.9, 0],
  metal_brushed: [150, 150, 155, 0.4, 0.9],
  facade: [150, 140, 125, 0.9, 0],
  brick: [120, 65, 50, 0.9, 0],
  // plafonds
  ceiling_tiles: [185, 180, 170, 0.9, 0],
  plaster: [190, 188, 180, 0.9, 0],
  concrete_ceiling: [120, 118, 112, 0.95, 0],
  // divers
  concrete_stairs: [135, 132, 125, 0.85, 0],
  metal_rail: [70, 90, 80, 0.5, 0.8],
  roof_gravel: [90, 88, 85, 0.95, 0],
  coping: [140, 140, 138, 0.8, 0],
  helipad: [60, 62, 65, 0.8, 0],
  asphalt: [45, 45, 48, 0.9, 0],
  road: [38, 38, 40, 0.85, 0],
  sidewalk: [110, 108, 104, 0.9, 0],
  grass_ext: [45, 60, 35, 1, 0],
  fence: [40, 45, 45, 0.6, 0.8],
  bark: [60, 45, 32, 0.95, 0],
};

/**
 * Bibliothèque de matériaux PBR (partagés et gelés).
 * Phase 3 : couleurs unies. Phase 4 : textures procédurales + éclairage précalculé.
 */
export class MaterialLibrary {
  private cache = new Map<string, PBRMaterial>();

  constructor(private readonly scene: Scene) {}

  get(id: string): PBRMaterial {
    let m = this.cache.get(id);
    if (m) return m;
    const b = BASE[id] ?? [255, 0, 255, 0.8, 0];
    m = new PBRMaterial(`mat_${id}`, this.scene);
    m.albedoColor = Color3.FromInts(b[0], b[1], b[2]).toLinearSpace();
    m.roughness = b[3];
    m.metallic = b[4];
    m.maxSimultaneousLights = 2;
    m.emissiveColor = Color3.FromInts(b[0], b[1], b[2]).toLinearSpace().scale(0.05);
    if (id === "fence") m.backFaceCulling = false;
    this.cache.set(id, m);
    return m;
  }

  all(): PBRMaterial[] {
    return [...this.cache.values()];
  }
}
