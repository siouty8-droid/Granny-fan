import { CONFIG, type Difficulty, type Grade } from "../config";
import { loadJSON, saveJSON } from "../core/Storage";

export type UnlockId = "autopilot" | "flashlightColors" | "skinNightNurse" | "skinPatientZero" | "map2";

export interface UnlockDef {
  id: UnlockId;
  level: number;
  name: string;
  desc: string;
  /** contenu déjà disponible dans le jeu (sinon « bientôt ») */
  ready: boolean;
}

/** Récompenses par niveau. `ready` passe à true quand le contenu est livré. */
export const UNLOCKS: UnlockDef[] = [
  { id: "autopilot", level: 5, name: "Pilote auto", desc: "En entraînement : ton perso finit la seed tout seul par la meilleure route.", ready: false },
  { id: "flashlightColors", level: 10, name: "Couleurs de lampe", desc: "Lampe chaude, néon bleu, UV… (visuel seulement).", ready: false },
  { id: "skinNightNurse", level: 15, name: "Skin : la Veilleuse de nuit", desc: "Le Chirurgien en infirmière de garde. Visuel seulement.", ready: false },
  { id: "skinPatientZero", level: 20, name: "Skin : le Patient zéro", desc: "Chemise déchirée, bandages, perfusion traînée. Visuel seulement.", ready: false },
  { id: "map2", level: 20, name: "Nouvelle map", desc: "Un nouveau lieu après l'hôpital.", ready: false },
];

/** Position dans la progression. */
export interface LevelInfo {
  level: number;
  /** XP accumulée dans le niveau courant */
  into: number;
  /** XP nécessaire pour passer au suivant (0 au niveau max) */
  need: number;
  total: number;
  max: boolean;
}

/** Détail du gain d'une run (écran de fin). */
export interface XpGain {
  xp: number;
  base: number;
  mult: number;
  /** facteur « run trop courte » (morts uniquement) */
  shortFactor: number;
  reason: string;
  before: LevelInfo;
  after: LevelInfo;
  /** récompenses atteintes pendant ce gain */
  unlocked: UnlockDef[];
}

/** XP pour passer du niveau `n` au niveau `n + 1`. */
export function levelCost(n: number): number {
  const p = CONFIG.progression;
  return p.levelBase + p.levelStep * (n - 1);
}

export function levelInfo(total: number): LevelInfo {
  const p = CONFIG.progression;
  let level = 1;
  let rest = total;
  while (level < p.maxLevel && rest >= levelCost(level)) {
    rest -= levelCost(level);
    level++;
  }
  const max = level >= p.maxLevel;
  return { level, into: max ? 0 : rest, need: max ? 0 : levelCost(level), total, max };
}

const VERSION = 1;

/**
 * Progression du joueur : XP totale (localStorage), niveau calculé, récompenses.
 * Évasion : XP selon la note ; mort / temps écoulé : peu d'XP (réduite si la run a été très
 * courte) ; le tout × difficulté. L'entraînement et les abandons ne rapportent rien.
 */
export class Progression {
  private total: number;

  constructor() {
    const raw = loadJSON<{ version: number; xp: number } | null>("progression", null);
    this.total = raw && raw.version === VERSION && Number.isFinite(raw.xp) && raw.xp >= 0 ? Math.floor(raw.xp) : 0;
  }

  get info(): LevelInfo {
    return levelInfo(this.total);
  }

  get level(): number {
    return this.info.level;
  }

  isUnlocked(id: UnlockId): boolean {
    return this.level >= UNLOCKS.find((u) => u.id === id)!.level;
  }

  /** Calcule le gain d'une run terminée (sans l'appliquer). */
  static compute(r: { success: boolean; grade: Grade | null; difficulty: Difficulty; runSeconds: number; reason: "escaped" | "captured" | "timeout" }): Omit<XpGain, "before" | "after" | "unlocked"> {
    const p = CONFIG.progression;
    const mult = p.difficultyMult[r.difficulty];
    if (r.success && r.grade) {
      const base = p.winXp[r.grade];
      return { xp: Math.round(base * mult), base, mult, shortFactor: 1, reason: `Évasion · note ${r.grade}` };
    }
    const shortFactor = Math.max(p.deathMinFactor, Math.min(1, r.runSeconds / p.deathFullAfter));
    return {
      xp: Math.max(1, Math.round(p.deathXp * mult * shortFactor)),
      base: p.deathXp,
      mult,
      shortFactor,
      reason: r.reason === "timeout" ? "Temps écoulé" : "Capturé",
    };
  }

  /** Ajoute l'XP d'une run et renvoie le détail (niveaux passés, récompenses débloquées). */
  award(g: Omit<XpGain, "before" | "after" | "unlocked">): XpGain {
    const before = this.info;
    this.total += g.xp;
    saveJSON("progression", { version: VERSION, xp: this.total });
    const after = this.info;
    const unlocked = UNLOCKS.filter((u) => u.level > before.level && u.level <= after.level);
    return { ...g, before, after, unlocked };
  }

}
