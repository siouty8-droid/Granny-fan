import type { ThemeId } from "./layout/types";

/**
 * Identité visuelle de chaque type de zone : matériaux (sol, murs bas/haut, plafond),
 * hauteur de soubassement, ambiance lumineuse. Chaque zone doit être reconnaissable
 * au premier coup d'œil (apprentissage des routes en speedrun).
 */
export interface ThemeDef {
  floor: string;
  wall: string;
  /** matériau du soubassement (bas de mur) — optionnel */
  wainscot?: string;
  wainscotHeight?: number;
  ceiling: string;
  /** éclairage précalculé */
  light: {
    kind: "neon" | "bulb" | "none" | "sky" | "emergency";
    /** couleur (linéaire) */
    color: [number, number, number];
    intensity: number;
    /** espacement des luminaires (m) */
    spacing: number;
    /** part des luminaires cassés / éteints */
    broken: number;
    /** part des luminaires qui clignotent */
    flicker: number;
  };
}

const neon = (color: [number, number, number], intensity: number, spacing = 4, broken = 0.25, flicker = 0.15) =>
  ({ kind: "neon", color, intensity, spacing, broken, flicker }) as const;

export const THEMES: Record<ThemeId, ThemeDef> = {
  hall: { floor: "terrazzo", wall: "paint_cream", wainscot: "wood_panel", wainscotHeight: 1.1, ceiling: "ceiling_tiles", light: neon([1.0, 0.86, 0.66], 1.0, 5, 0.35, 0.2) },
  corridor: { floor: "lino_green", wall: "paint_green", wainscot: "paint_green_dark", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([0.78, 0.95, 0.85], 0.9, 4, 0.3, 0.2) },
  corridorU: { floor: "lino_blue", wall: "paint_blue", wainscot: "paint_blue_dark", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([0.8, 0.9, 1.0], 0.85, 4, 0.35, 0.2) },
  cafeteria: { floor: "checker_red", wall: "paint_yellow", wainscot: "tile_wall_white", wainscotHeight: 1.3, ceiling: "ceiling_tiles", light: neon([1.0, 0.85, 0.6], 0.9, 5, 0.4, 0.15) },
  kitchen: { floor: "tile_small", wall: "tile_wall_white", ceiling: "plaster", light: neon([0.85, 1.0, 0.9], 1.0, 4, 0.3, 0.2) },
  office: { floor: "parquet", wall: "paint_cream", wainscot: "paint_cream_dark", wainscotHeight: 0.9, ceiling: "plaster", light: neon([1.0, 0.88, 0.7], 0.8, 4, 0.4, 0.1) },
  security: { floor: "carpet_gray", wall: "paint_gray", ceiling: "ceiling_tiles", light: neon([0.8, 0.9, 1.0], 0.7, 4, 0.2, 0.3) },
  pharmacy: { floor: "tile_white", wall: "paint_white", wainscot: "tile_wall_white", wainscotHeight: 1.4, ceiling: "ceiling_tiles", light: neon([0.9, 1.0, 0.95], 1.0, 4, 0.3, 0.2) },
  er: { floor: "lino_blue", wall: "paint_white", wainscot: "tile_wall_cyan", wainscotHeight: 1.2, ceiling: "ceiling_tiles", light: neon([0.85, 0.95, 1.0], 1.15, 4.5, 0.3, 0.25) },
  waiting: { floor: "lino_gray", wall: "paint_blue", wainscot: "wood_panel", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([0.95, 0.95, 0.85], 0.9, 4.5, 0.4, 0.2) },
  chapel: { floor: "parquet_dark", wall: "stone", wainscot: "wood_panel", wainscotHeight: 1.2, ceiling: "plaster", light: { kind: "bulb", color: [1.0, 0.55, 0.25], intensity: 0.9, spacing: 5, broken: 0.3, flicker: 0.4 } },
  lockers: { floor: "tile_small", wall: "tile_wall_white", wainscot: "tile_wall_green", wainscotHeight: 1.4, ceiling: "plaster", light: neon([0.8, 1.0, 0.85], 0.8, 4, 0.4, 0.25) },
  showers: { floor: "tile_small", wall: "tile_wall_white", ceiling: "plaster", light: neon([0.75, 0.95, 1.0], 0.8, 4, 0.4, 0.3) },
  storage: { floor: "concrete", wall: "paint_gray", ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.8, 0.5], intensity: 0.7, spacing: 4, broken: 0.3, flicker: 0.2 } },
  stairs: { floor: "concrete", wall: "paint_stairs", wainscot: "paint_green_dark", wainscotHeight: 1.0, ceiling: "concrete_ceiling", light: { kind: "emergency", color: [0.5, 1.0, 0.6], intensity: 0.6, spacing: 4, broken: 0, flicker: 0.1 } },
  pediatrics: { floor: "rubber_yellow", wall: "paint_pedia", wainscot: "paint_pedia_low", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([1.0, 0.8, 0.6], 0.8, 4.5, 0.45, 0.25) },
  patient: { floor: "lino_beige", wall: "paint_pink", wainscot: "paint_pink_dark", wainscotHeight: 0.9, ceiling: "ceiling_tiles", light: neon([1.0, 0.9, 0.8], 0.75, 4, 0.45, 0.2) },
  ward: { floor: "lino_beige", wall: "paint_cream", wainscot: "paint_cream_dark", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([0.95, 0.95, 0.85], 0.8, 4, 0.4, 0.25) },
  surgery: { floor: "tile_cyan", wall: "tile_wall_cyan", ceiling: "plaster", light: neon([0.75, 1.0, 1.0], 1.2, 4, 0.2, 0.2) },
  radiology: { floor: "lino_gray", wall: "lead_gray", ceiling: "ceiling_tiles", light: { kind: "bulb", color: [1.0, 0.6, 0.2], intensity: 0.8, spacing: 4, broken: 0.2, flicker: 0.3 } },
  director: { floor: "carpet_red", wall: "wood_panel_dark", ceiling: "plaster", light: { kind: "bulb", color: [1.0, 0.7, 0.4], intensity: 0.7, spacing: 4, broken: 0.2, flicker: 0.2 } },
  nurse: { floor: "lino_green", wall: "paint_white", wainscot: "paint_green_dark", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([0.85, 1.0, 0.9], 0.9, 4, 0.3, 0.2) },
  morgue: { floor: "tile_morgue", wall: "tile_wall_white", wainscot: "tile_wall_steel", wainscotHeight: 1.6, ceiling: "concrete_ceiling", light: neon([0.6, 0.85, 1.0], 1.1, 4, 0.2, 0.3) },
  boiler: { floor: "concrete_dirty", wall: "concrete_wall", ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.45, 0.15], intensity: 1.0, spacing: 5, broken: 0.3, flicker: 0.3 } },
  archives: { floor: "concrete", wall: "concrete_wall", ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.82, 0.45], intensity: 0.8, spacing: 4, broken: 0.4, flicker: 0.25 } },
  electric: { floor: "concrete", wall: "paint_gray", wainscot: "paint_yellow_hazard", wainscotHeight: 0.25, ceiling: "concrete_ceiling", light: { kind: "emergency", color: [1.0, 0.25, 0.1], intensity: 0.7, spacing: 4, broken: 0, flicker: 0.1 } },
  techcorr: { floor: "concrete_dirty", wall: "concrete_wall", wainscot: "paint_gray_dark", wainscotHeight: 1.2, ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.75, 0.4], intensity: 0.75, spacing: 5, broken: 0.35, flicker: 0.3 } },
  laundry: { floor: "tile_small", wall: "paint_white", wainscot: "tile_wall_white", wainscotHeight: 1.3, ceiling: "concrete_ceiling", light: neon([0.9, 1.0, 1.0], 0.8, 4, 0.4, 0.2) },
  elevator: { floor: "metal_plate", wall: "metal_brushed", ceiling: "metal_brushed", light: { kind: "none", color: [1, 1, 1], intensity: 0, spacing: 4, broken: 0, flicker: 0 } },
  courtyard: { floor: "grass", wall: "facade", ceiling: "none", light: { kind: "sky", color: [0.35, 0.45, 0.7], intensity: 0.5, spacing: 8, broken: 0, flicker: 0 } },
  roofroom: { floor: "metal_plate", wall: "concrete_wall", ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.6, 0.3], intensity: 0.6, spacing: 4, broken: 0.2, flicker: 0.4 } },

  // --- centre commercial « Les Galeries du Val »
  mall: { floor: "terrazzo_mall", wall: "paint_mall", wainscot: "paint_mall_low", wainscotHeight: 0.3, ceiling: "ceiling_tiles", light: neon([1.0, 0.92, 0.78], 1.35, 5, 0.32, 0.18) },
  mallU: { floor: "tile_mall", wall: "paint_mall", wainscot: "paint_mall_low", wainscotHeight: 0.3, ceiling: "ceiling_tiles", light: neon([0.92, 0.95, 1.0], 1.15, 5, 0.38, 0.18) },
  atrium: { floor: "terrazzo_mall", wall: "paint_mall", ceiling: "none", light: { kind: "sky", color: [0.35, 0.45, 0.7], intensity: 0.5, spacing: 8, broken: 0, flicker: 0 } },
  shopClothes: { floor: "parquet", wall: "paint_white", wainscot: "paint_shop_black", wainscotHeight: 0.15, ceiling: "plaster", light: neon([1.0, 0.9, 0.78], 0.8, 4.5, 0.45, 0.2) },
  shopToys: { floor: "rubber_yellow", wall: "paint_pedia", wainscot: "paint_pedia_low", wainscotHeight: 1.0, ceiling: "ceiling_tiles", light: neon([1.0, 0.85, 0.65], 0.8, 4.5, 0.45, 0.25) },
  shopBooks: { floor: "carpet_blue", wall: "paint_cream", wainscot: "wood_panel", wainscotHeight: 1.0, ceiling: "plaster", light: { kind: "bulb", color: [1.0, 0.75, 0.45], intensity: 0.8, spacing: 4, broken: 0.35, flicker: 0.2 } },
  shopJewelry: { floor: "tile_dark", wall: "paint_shop_black", ceiling: "plaster", light: { kind: "bulb", color: [1.0, 0.85, 0.6], intensity: 0.7, spacing: 3.5, broken: 0.4, flicker: 0.25 } },
  shopShoes: { floor: "parquet_dark", wall: "paint_shop_orange", wainscot: "paint_cream_dark", wainscotHeight: 0.9, ceiling: "plaster", light: neon([1.0, 0.9, 0.75], 0.8, 4.5, 0.45, 0.2) },
  shopPhones: { floor: "tile_white", wall: "paint_white", wainscot: "paint_shop_teal", wainscotHeight: 0.5, ceiling: "ceiling_tiles", light: neon([0.85, 0.95, 1.0], 1.0, 4, 0.4, 0.3) },
  shopSport: { floor: "rubber_gray", wall: "paint_shop_red", wainscot: "paint_gray_dark", wainscotHeight: 1.0, ceiling: "concrete_ceiling", light: neon([0.95, 0.95, 1.0], 0.9, 4.5, 0.45, 0.2) },
  shopPerfume: { floor: "tile_white", wall: "paint_shop_purple", wainscot: "paint_white", wainscotHeight: 1.0, ceiling: "plaster", light: { kind: "bulb", color: [1.0, 0.7, 0.85], intensity: 0.7, spacing: 4, broken: 0.35, flicker: 0.3 } },
  shopPharmacy: { floor: "tile_white", wall: "paint_shop_mint", wainscot: "tile_wall_green", wainscotHeight: 1.2, ceiling: "ceiling_tiles", light: neon([0.85, 1.0, 0.9], 1.0, 4, 0.4, 0.2) },
  supermarket: { floor: "lino_gray", wall: "paint_white", wainscot: "paint_shop_red", wainscotHeight: 0.6, ceiling: "concrete_ceiling", light: neon([0.92, 1.0, 0.95], 1.0, 5, 0.55, 0.2) },
  electro: { floor: "tile_dark", wall: "paint_gray", wainscot: "paint_blue_dark", wainscotHeight: 0.8, ceiling: "concrete_ceiling", light: neon([0.85, 0.92, 1.0], 1.0, 5, 0.55, 0.25) },
  foodcourt: { floor: "checker_red", wall: "paint_yellow", wainscot: "tile_wall_white", wainscotHeight: 1.2, ceiling: "ceiling_tiles", light: neon([1.0, 0.85, 0.6], 0.9, 5, 0.45, 0.2) },
  fastfood: { floor: "tile_small", wall: "tile_wall_white", wainscot: "paint_shop_red", wainscotHeight: 0.9, ceiling: "plaster", light: neon([1.0, 0.95, 0.85], 1.0, 4, 0.35, 0.25) },
  coldroom: { floor: "metal_plate", wall: "tile_wall_steel", ceiling: "metal_brushed", light: neon([0.7, 0.9, 1.0], 0.9, 4, 0.3, 0.35) },
  cinemaLobby: { floor: "carpet_cinema", wall: "paint_cinema", wainscot: "wood_panel_dark", wainscotHeight: 1.1, ceiling: "plaster", light: { kind: "bulb", color: [1.0, 0.6, 0.35], intensity: 0.8, spacing: 4, broken: 0.4, flicker: 0.3 } },
  cinema: { floor: "carpet_cinema", wall: "paint_cinema", ceiling: "concrete_ceiling", light: { kind: "emergency", color: [1.0, 0.3, 0.15], intensity: 0.9, spacing: 5, broken: 0.15, flicker: 0.2 } },
  projection: { floor: "concrete", wall: "paint_gray_dark", ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.75, 0.4], intensity: 0.7, spacing: 4, broken: 0.3, flicker: 0.3 } },
  mallOffice: { floor: "carpet_gray", wall: "paint_cream", wainscot: "paint_cream_dark", wainscotHeight: 0.9, ceiling: "ceiling_tiles", light: neon([1.0, 0.92, 0.8], 0.8, 4, 0.4, 0.2) },
  service: { floor: "concrete", wall: "paint_gray", wainscot: "paint_gray_dark", wainscotHeight: 1.1, ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.8, 0.5], intensity: 0.75, spacing: 5, broken: 0.35, flicker: 0.3 } },
  toilets: { floor: "tile_small", wall: "tile_wall_white", wainscot: "tile_wall_cyan", wainscotHeight: 1.4, ceiling: "plaster", light: neon([0.8, 0.95, 1.0], 0.8, 4, 0.4, 0.3) },
  parking: { floor: "concrete_dirty", wall: "paint_parking", wainscot: "paint_parking_low", wainscotHeight: 1.0, ceiling: "concrete_ceiling", light: neon([0.85, 1.0, 0.85], 1.25, 6, 0.42, 0.2) },
  dock: { floor: "concrete_dirty", wall: "concrete_wall", wainscot: "paint_yellow_hazard", wainscotHeight: 0.3, ceiling: "concrete_ceiling", light: { kind: "bulb", color: [1.0, 0.65, 0.3], intensity: 1.0, spacing: 6, broken: 0.4, flicker: 0.3 } },
  metroHall: { floor: "tile_metro", wall: "tile_wall_cream", wainscot: "tile_wall_metro", wainscotHeight: 1.1, ceiling: "concrete_ceiling", light: neon([0.85, 1.0, 0.85], 0.9, 5, 0.5, 0.3) },
  metroPlatform: { floor: "tile_metro", wall: "tile_wall_cream", wainscot: "tile_wall_metro", wainscotHeight: 1.1, ceiling: "concrete_ceiling", light: neon([0.8, 1.0, 0.8], 1.1, 6, 0.3, 0.35) },
  metroTrack: { floor: "ballast", wall: "tile_wall_cream", wainscot: "concrete_tunnel", wainscotHeight: 1.1, ceiling: "concrete_ceiling", light: { kind: "emergency", color: [1.0, 0.3, 0.12], intensity: 0.8, spacing: 8, broken: 0.2, flicker: 0.3 } },
  tunnel: { floor: "ballast", wall: "concrete_tunnel", ceiling: "concrete_tunnel", light: { kind: "emergency", color: [1.0, 0.25, 0.1], intensity: 0.55, spacing: 9, broken: 0.2, flicker: 0.2 } },
};
