import { CONFIG, type ModifierId } from "../config";

export type { ModifierId };

export interface ModifierDef {
  id: ModifierId;
  name: string;
  desc: string;
}

/** Modificateurs de run : optionnels, plus durs, bonus d'XP ; une run modifiée n'entre pas dans les records. */
export const MODIFIERS: ModifierDef[] = [
  { id: "battery", name: "Lampe à piles", desc: "La lampe se vide quand elle est allumée et se recharge lentement éteinte." },
  { id: "noSprint", name: "Sans sprint", desc: "Impossible de sprinter." },
  { id: "fog", name: "Brouillard", desc: "Un brouillard épais noie l'hôpital : tu vois beaucoup moins loin." },
  { id: "enraged", name: "Chirurgien enragé", desc: "Il marche et court plus vite, entend mieux et voit plus loin." },
  { id: "invisible", name: "Chirurgien invisible", desc: "Tu ne vois que ses yeux, sauf quand il est dans le faisceau de ta lampe." },
  { id: "short", name: "Chrono 5 min", desc: "Cinq minutes au lieu de dix, confinement à 4:00." },
  { id: "noJournal", name: "Sans carnet", desc: "Pas de carnet et aucun code noté : retiens-les." },
  { id: "noHiding", name: "Sans cachettes", desc: "Armoires, casiers et lits sont condamnés." },
];

/** Liste propre : ids valides, sans doublon, dans l'ordre de MODIFIERS. */
export function sanitizeModifiers(raw: unknown): ModifierId[] {
  if (!Array.isArray(raw)) return [];
  return MODIFIERS.filter((m) => raw.includes(m.id)).map((m) => m.id);
}

/** Multiplicateur d'XP d'une combinaison (bonus cumulés, plafonnés). */
export function modifierXpMult(mods: readonly ModifierId[]): number {
  const cfg = CONFIG.modifiers;
  const bonus = mods.reduce((sum, m) => sum + cfg.xpBonus[m], 0);
  return Math.round((1 + Math.min(cfg.maxXpBonus, bonus)) * 100) / 100;
}

export function modifierName(id: ModifierId): string {
  return MODIFIERS.find((m) => m.id === id)!.name;
}

/** « Lampe à piles, Brouillard » */
export function modifierNames(mods: readonly ModifierId[]): string {
  return mods.map(modifierName).join(", ");
}

/** Limite de temps et confinement d'une run (ms). */
export function runLimits(mods: readonly ModifierId[]): { timeLimitMs: number; lockdownMs: number } {
  return mods.includes("short") ? CONFIG.modifiers.short : { timeLimitMs: CONFIG.run.timeLimitMs, lockdownMs: CONFIG.run.lockdownMs };
}
