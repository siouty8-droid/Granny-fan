import * as T from "./ArchTextures";
import { propAtlas } from "./PropAtlas";
import { encodeTextures, type EncodedTextures, type TexCanvas } from "./TexCanvas";

/**
 * Familles de textures procédurales (générateurs purs, sans DOM ni GPU) : utilisables
 * sur le thread principal comme dans les Web Workers.
 */
export type FamilyId =
  | "paint"
  | "wallTiles"
  | "lino"
  | "terrazzo"
  | "checker"
  | "floorTiles"
  | "parquet"
  | "carpet"
  | "concrete"
  | "ceiling"
  | "woodPanel"
  | "metalPlate"
  | "metalBrushed"
  | "stone"
  | "rubber"
  | "facade"
  | "brick"
  | "asphalt"
  | "paving"
  | "grass"
  | "gravel"
  | "fence"
  | "helipad"
  | "glass";

export interface FamilyDef {
  gen: (S: number) => TexCanvas;
  /** mètres couverts par une répétition (u, v) */
  size: [number, number];
  normal: number;
  /** facteur de résolution par rapport à la taille de base du preset */
  res?: number;
}

export const FAMILIES: Record<FamilyId, FamilyDef> = {
  paint: { gen: T.paint, size: [2, 4], normal: 1.2 },
  wallTiles: { gen: T.wallTiles, size: [1.2, 1.2], normal: 2.2 },
  lino: { gen: T.lino, size: [3, 3], normal: 1.0 },
  terrazzo: { gen: T.terrazzo, size: [1.5, 1.5], normal: 1.0 },
  checker: { gen: T.checker, size: [1.2, 1.2], normal: 2.0 },
  floorTiles: { gen: T.floorTiles, size: [1, 1], normal: 2.0 },
  parquet: { gen: T.parquet, size: [1.2, 1.2], normal: 1.5 },
  carpet: { gen: T.carpet, size: [1.5, 1.5], normal: 1.2, res: 0.5 },
  concrete: { gen: T.concrete, size: [2, 2], normal: 1.4 },
  ceiling: { gen: T.ceilingTiles, size: [1.2, 1.2], normal: 1.5 },
  woodPanel: { gen: T.woodPanel, size: [1.2, 1.2], normal: 1.6 },
  metalPlate: { gen: T.metalPlate, size: [1, 1], normal: 2.5 },
  metalBrushed: { gen: T.metalBrushed, size: [1, 1], normal: 0.5, res: 0.5 },
  stone: { gen: T.stone, size: [2, 2], normal: 2.0 },
  rubber: { gen: T.rubber, size: [1, 1], normal: 2.0, res: 0.5 },
  facade: { gen: T.facade, size: [4, 8], normal: 1.0 },
  brick: { gen: T.brick, size: [1, 1], normal: 2.0, res: 0.5 },
  asphalt: { gen: T.asphalt, size: [4, 4], normal: 1.2 },
  paving: { gen: T.paving, size: [2, 2], normal: 1.5 },
  grass: { gen: T.grass, size: [2, 2], normal: 1.2 },
  gravel: { gen: T.gravel, size: [1.5, 1.5], normal: 2.0, res: 0.5 },
  fence: { gen: T.fenceBars, size: [2.5, 2.6], normal: 1.0, res: 0.5 },
  helipad: { gen: T.helipad, size: [1, 1], normal: 0.5 },
  glass: { gen: T.dirtyGlass, size: [1.5, 1.5], normal: 0, res: 0.5 },
};

/** Tâche de génération : une famille, ou l'atlas des props. */
export interface TexJob {
  fam: FamilyId | "props";
  size: number;
}

export function runTexJob(job: TexJob): EncodedTextures {
  if (job.fam === "props") return encodeTextures(propAtlas(job.size), 1.6);
  const def = FAMILIES[job.fam];
  return encodeTextures(def.gen(job.size), def.normal);
}
