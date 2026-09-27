import type { Surface } from "../../physics/Collider";

/** Niveaux : sous-sol, rez-de-chaussée, étage, toit. */
export type FloorId = "B" | "G" | "U" | "R";

export interface FloorDef {
  id: FloorId;
  label: string;
  /** hauteur du sol fini (m) */
  y: number;
  /** hauteur sous plafond par défaut */
  ceiling: number;
  /** emprise du bâtiment sur ce niveau (rectangles de cellules) */
  footprint: Rect[];
  /** trous dans l'emprise (air : patio à l'étage…) */
  holes: Rect[];
  /** l'extérieur de ce niveau est-il visible (façades) ? le sous-sol est enterré */
  exposed: boolean;
}

/** Rectangle de cellules [x0, z0, x1, z1] (x1/z1 exclus), 1 cellule = 1 m. */
export type Rect = readonly [number, number, number, number];

export type RoomKind = "room" | "corridor" | "stair" | "elevator" | "outdoor";

/** Identité visuelle d'une zone (matériaux, lumière, props). */
export type ThemeId =
  | "hall"
  | "corridor"
  | "corridorU"
  | "cafeteria"
  | "kitchen"
  | "office"
  | "security"
  | "pharmacy"
  | "er"
  | "waiting"
  | "chapel"
  | "lockers"
  | "showers"
  | "storage"
  | "stairs"
  | "pediatrics"
  | "patient"
  | "ward"
  | "surgery"
  | "radiology"
  | "director"
  | "nurse"
  | "morgue"
  | "boiler"
  | "archives"
  | "electric"
  | "techcorr"
  | "laundry"
  | "elevator"
  | "courtyard"
  | "roofroom";

export interface RoomDef {
  id: string;
  floor: FloorId;
  rect: Rect;
  name: string;
  kind: RoomKind;
  theme: ThemeId;
  /** surface du sol (sons de pas / bruit) */
  surface?: Surface;
  /** hauteur sous plafond (défaut : celle du niveau) */
  ceiling?: number;
  /** secteur de culling (regroupement de zones pour les thin instances) */
  sector: string;
  /** pour les cages d'escalier / ascenseur : identifiant de la cage (partagée entre niveaux) */
  shaft?: string;
}

export type OpeningKind =
  /** porte simple (battant) */
  | "door"
  /** porte double / battante de couloir */
  | "double"
  /** arche ouverte (pas de porte) */
  | "arch"
  /** fenêtre (allège + linteau), éventuellement cassée et franchissable */
  | "window"
  /** grille de ventilation au ras du sol (passage accroupi) */
  | "vent"
  /** pas de mur du tout sur cette portion (pièces fusionnées) */
  | "open"
  /** porte de la cabine / palière d'ascenseur */
  | "elevator";

export interface OpeningDef {
  id: string;
  floor: FloorId;
  kind: OpeningKind;
  /**
   * Position du centre de l'ouverture sur la ligne de mur.
   * axis "x" : mur horizontal (ligne z = const, entier), l'ouverture s'étend en x.
   * axis "z" : mur vertical (ligne x = const, entier), l'ouverture s'étend en z.
   */
  axis: "x" | "z";
  x: number;
  z: number;
  width: number;
  /** hauteur haute de l'ouverture (porte : 2.2, fenêtre : 2.3) */
  top?: number;
  /** hauteur basse (fenêtre : allège 0.9, conduit : 0) */
  bottom?: number;
  /** fenêtre cassée franchissable */
  broken?: boolean;
  /** données de porte (gameplay, phase 5) */
  door?: DoorSpec;
}

export type LockType =
  | "none"
  | "badgeBlue"
  | "badgeGreen"
  | "badgeRed"
  | "morgueKey"
  | "planks"
  | "chain"
  | "power"
  /** ouvrable d'un seul côté (raccourci) */
  | "oneWay"
  /** condamnée (décor) */
  | "sealed";

export interface DoorSpec {
  lock: LockType;
  /** oneWay / planches / chaîne : côté d'où l'on peut ouvrir (point à l'intérieur de la pièce autorisée) */
  openFrom?: { x: number; z: number };
  /** porte battante qui s'ouvre toute seule au passage */
  swing?: boolean;
  /** libellé pour les splits (« porte importante ») */
  splitLabel?: string;
  /** porte initialement ouverte */
  startOpen?: boolean;
}

export interface StairDef {
  id: string;
  rect: Rect;
  /** niveaux desservis, du plus bas au plus haut */
  floors: FloorId[];
  /** côté d'entrée des paliers d'étage (où se trouvent les portes) */
  entry: "z0" | "z1" | "x0" | "x1";
}

export interface ElevatorDef {
  id: string;
  rect: Rect;
  floors: FloorId[];
  /** côté des portes palières, par niveau */
  doorSides: Partial<Record<FloorId, "z0" | "z1" | "x0" | "x1">>;
}

/** Obstacle bas (poutre / gravats) : passage accroupi pour le joueur, sautable par l'IA selon la difficulté. */
export interface BarrierDef {
  id: string;
  floor: FloorId;
  /** rectangle monde (m) [x0, z0, x1, z1] */
  area: readonly [number, number, number, number];
  kind: "beam" | "debris" | "gurneys" | "tree";
}

export interface HospitalLayout {
  floors: FloorDef[];
  rooms: RoomDef[];
  openings: OpeningDef[];
  stairs: StairDef[];
  elevators: ElevatorDef[];
  barriers: BarrierDef[];
  /** point de spawn (monde) */
  spawn: { x: number; y: number; z: number; yaw: number };
}
