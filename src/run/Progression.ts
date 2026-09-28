import { CONFIG, type Difficulty, type Grade } from "../config";
import { Emitter } from "../core/Events";
import { loadJSON, saveJSON } from "../core/Storage";
import { modifierXpMult, type ModifierId } from "./Modifiers";

export type UnlockId = "autopilot" | "flashlightColors" | "skinNightNurse" | "skinPatientZero" | "map2";

export interface UnlockDef {
  id: UnlockId;
  level: number;
  name: string;
  desc: string;
  /** contenu déjà disponible dans le jeu (sinon « bientôt ») */
  ready: boolean;
  /** où s'en servir une fois débloqué */
  where?: string;
}

/** Récompenses par niveau. `ready` passe à true quand le contenu est livré. */
export const UNLOCKS: UnlockDef[] = [
  { id: "autopilot", level: 5, name: "Pilote auto", desc: "En entraînement : ton perso finit la seed tout seul par la meilleure route.", ready: true, where: "menu Entraînement" },
  {
    id: "flashlightColors",
    level: 10,
    name: "Couleurs de lampe",
    desc: "Chaude, néon bleu, UV, rouge. Visuel seulement.",
    ready: true,
    where: "menu Personnaliser",
  },
  {
    id: "skinNightNurse",
    level: 15,
    name: "Skin : la Veilleuse de nuit",
    desc: "Le Chirurgien en infirmière de garde : robe, gilet, coiffe à croix rouge, longs cheveux noirs. Visuel seulement.",
    ready: true,
    where: "menu Personnaliser",
  },
  {
    id: "skinPatientZero",
    level: 20,
    name: "Skin : le Patient zéro",
    desc: "Blouse en lambeaux, bandages, pied à perfusion qu'il traîne. Visuel seulement.",
    ready: true,
    where: "menu Personnaliser",
  },
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
  /** multiplicateur des modificateurs (1 = aucun) */
  modsMult: number;
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

/** Normalise un code saisi : sans accents, espaces ni ponctuation, en majuscules. */
function normalizeCode(code: string): string {
  return code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Empreinte FNV-1a (32 bits) : le code n'apparaît pas en clair dans les sources. */
function codeHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Code « tout débloquer » (niveau max + toutes les récompenses, présentes et futures). */
const UNLOCK_ALL_HASH = 0x0a3315f6;

export type RedeemResult = "unlockAll" | "already" | "unknown";

interface ProgressionEvents {
  /** niveau ou récompenses débloquées changés (XP, code) */
  change: undefined;
}

/**
 * Progression du joueur : XP totale (localStorage), niveau calculé, récompenses.
 * Évasion : XP selon la note ; mort / temps écoulé : peu d'XP (réduite si la run a été très
 * courte) ; le tout × difficulté. L'entraînement et les abandons ne rapportent rien.
 * Le code « tout débloquer » met au niveau max et ouvre toutes les récompenses, y compris celles
 * ajoutées plus tard (tout contenu verrouillé doit passer par `isUnlocked`) ; l'XP réelle
 * continue d'être comptée à côté.
 */
export class Progression extends Emitter<ProgressionEvents> {
  private total: number;
  private all: boolean;

  constructor() {
    super();
    const raw = loadJSON<{ version: number; xp: number; unlockAll?: boolean } | null>("progression", null);
    const ok = raw && raw.version === VERSION;
    this.total = ok && Number.isFinite(raw.xp) && raw.xp >= 0 ? Math.floor(raw.xp) : 0;
    this.all = ok ? raw.unlockAll === true : false;
  }

  get info(): LevelInfo {
    if (this.all) return { level: CONFIG.progression.maxLevel, into: 0, need: 0, total: this.total, max: true };
    return levelInfo(this.total);
  }

  get level(): number {
    return this.info.level;
  }

  /** Code « tout débloquer » actif. */
  get unlockAll(): boolean {
    return this.all;
  }

  isUnlocked(id: UnlockId): boolean {
    return this.all || this.level >= UNLOCKS.find((u) => u.id === id)!.level;
  }

  /** Saisie d'un code (écran Progression). */
  redeem(code: string): RedeemResult {
    if (codeHash(normalizeCode(code)) !== UNLOCK_ALL_HASH) return "unknown";
    if (this.all) return "already";
    this.setUnlockAll(true);
    return "unlockAll";
  }

  /** Active / coupe le code « tout débloquer » (l'XP réelle reste intacte). */
  setUnlockAll(on: boolean): void {
    if (on === this.all) return;
    this.all = on;
    this.save();
    this.emit("change", undefined);
  }

  private save(): void {
    saveJSON("progression", { version: VERSION, xp: this.total, ...(this.all ? { unlockAll: true } : {}) });
  }

  /** Calcule le gain d'une run terminée (sans l'appliquer). */
  static compute(r: {
    success: boolean;
    grade: Grade | null;
    difficulty: Difficulty;
    runSeconds: number;
    reason: "escaped" | "captured" | "timeout";
    modifiers: readonly ModifierId[];
  }): Omit<XpGain, "before" | "after" | "unlocked"> {
    const p = CONFIG.progression;
    const mult = p.difficultyMult[r.difficulty];
    const modsMult = modifierXpMult(r.modifiers);
    if (r.success && r.grade) {
      const base = p.winXp[r.grade];
      return { xp: Math.round(base * mult * modsMult), base, mult, modsMult, shortFactor: 1, reason: `Évasion · note ${r.grade}` };
    }
    const shortFactor = Math.max(p.deathMinFactor, Math.min(1, r.runSeconds / p.deathFullAfter));
    return {
      xp: Math.max(1, Math.round(p.deathXp * mult * modsMult * shortFactor)),
      base: p.deathXp,
      mult,
      modsMult,
      shortFactor,
      reason: r.reason === "timeout" ? "Temps écoulé" : "Capturé",
    };
  }

  /** Ajoute l'XP d'une run et renvoie le détail (niveaux passés, récompenses débloquées). */
  award(g: Omit<XpGain, "before" | "after" | "unlocked">): XpGain {
    const before = this.info;
    this.total += g.xp;
    this.save();
    const after = this.info;
    const unlocked = UNLOCKS.filter((u) => u.level > before.level && u.level <= after.level);
    return { ...g, before, after, unlocked };
  }

}
