import type { MapId } from "../../world/layout/types";
import type { ItemId } from "./items";
import { CODE_LABELS, CODE_NOTES, DOSSIER_SPOTS, ITEM_CANDIDATES, LORE_NOTES, SAFES, type CodeId, type CodeNoteDef, type SafeDef } from "./spawns";
import { MALL_RULES } from "./mall";

/** Sorties (toutes cartes confondues). */
export type ExitId = "gate" | "ambulance" | "roof" | "doors" | "truck" | "metro";

/** État du solveur de faisabilité (voir `SpawnPlanner.solve`). */
export interface SolveState {
  reach: (room: string) => boolean;
  has: (item: ItemId) => boolean;
  codeKnown: (code: CodeId) => boolean;
  power: boolean;
}

/** Tableau à fusibles (dos au mur, façade vers `yaw`). */
export interface FusePanelDef {
  room: string;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Règles de jeu d'une carte : objets et leurs emplacements candidats, coffres, codes, notes,
 * tableau électrique et conditions des sorties. Tout le gameplay (planificateur, ancres,
 * coffres, carnet…) lit ces données plutôt que des constantes propres à l'hôpital.
 */
export interface MapRules {
  id: MapId;
  /** pièce de départ (graphe du planificateur) */
  start: string;
  /** objets présents et nombre d'exemplaires */
  items: Partial<Record<ItemId, number>>;
  /** infobulles propres à la carte */
  hints: Partial<Record<ItemId, string>>;
  itemCandidates: Partial<Record<ItemId, string[]>>;
  codeLabels: Partial<Record<CodeId, string>>;
  /** code de la sortie (boîtier) : passé au système de sorties */
  exitCode: CodeId;
  /** libellé du lieu du code de sortie (carnet) */
  exitCodePlace: string;
  safes: SafeDef[];
  codeNotes: CodeNoteDef[];
  loreNotes: Array<{ id: string; spot: string; author: string; text: string }>;
  /** emplacements des dossiers cachés (vide : pas de dossier sur cette carte) */
  dossierSpots: string[];
  fusePanel: FusePanelDef;
  /** message quand le courant revient */
  powerToast: string;
  /** pièces-mécanismes exclues des zones « chaque verrou récompense » */
  guardExempt: string[];
  /** sorties réalisables dans un état du solveur */
  exits: (s: SolveState) => ExitId[];
  /** nombre de sorties attendu (toutes doivent être réalisables) */
  exitCount: number;
}

const ITEM_COUNTS_HOSPITAL: Partial<Record<ItemId, number>> = {
  badgeBlue: 1,
  badgeGreen: 1,
  badgeRed: 1,
  morgueKey: 1,
  crowbar: 1,
  boltCutter: 1,
  fuse: 2,
  battery: 1,
  ambulanceKeys: 1,
  safeKey: 1,
};

export const HOSPITAL_RULES: MapRules = {
  id: "hospital",
  start: "g_hall",
  items: ITEM_COUNTS_HOSPITAL,
  hints: {},
  itemCandidates: ITEM_CANDIDATES,
  codeLabels: CODE_LABELS,
  exitCode: "gate",
  exitCodePlace: "Boîtier du portail",
  safes: SAFES,
  codeNotes: CODE_NOTES,
  loreNotes: LORE_NOTES,
  dossierSpots: DOSSIER_SPOTS,
  fusePanel: { room: "b_electric", x: 75.5, z: 53.88, yaw: Math.PI },
  powerToast: "Le courant revient. L'ascenseur répond.",
  guardExempt: ["b_electric"],
  exits: (s) => {
    const out: ExitId[] = [];
    if (s.reach("ext") && s.has("badgeRed") && s.codeKnown("gate")) out.push("gate");
    if (s.reach("ext") && s.has("boltCutter") && s.has("battery") && s.has("ambulanceKeys")) out.push("ambulance");
    if (s.reach("roof")) out.push("roof");
    return out;
  },
  exitCount: 3,
};

export function rulesFor(id: MapId): MapRules {
  return id === "mall" ? MALL_RULES : HOSPITAL_RULES;
}

/** Objets présents sur la carte (ordre stable). */
export function mapItemIds(rules: MapRules): ItemId[] {
  return Object.keys(rules.items) as ItemId[];
}
