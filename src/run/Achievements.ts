import { CONFIG } from "../config";
import { loadJSON, saveJSON } from "../core/Storage";
import { CODE_NOTES, LORE_NOTES } from "../gameplay/data/spawns";
import { MODIFIERS, type ModifierId } from "./Modifiers";
import type { RunResult } from "./RunManager";

export type AchievementId =
  | "firstEscape"
  | "allExits"
  | "gradeZ"
  | "under2"
  | "unseen"
  | "hard"
  | "nightmare"
  | "nightmareUnseen"
  | "lostHim"
  | "threeChases"
  | "dark"
  | "lockdown"
  | "modified"
  | "fourMods"
  | "everyMod"
  | "noJournal"
  | "beatGhost"
  | "archivist"
  | "escapes10"
  | "escapes50"
  | "deaths25";

export interface AchievementDef {
  id: AchievementId;
  name: string;
  desc: string;
  /** XP donnée au déblocage */
  xp: number;
  /** caché tant qu'il n'est pas débloqué */
  secret?: boolean;
}

/** Ce qui s'est passé pendant la run (suivi par l'application). */
export interface RunStats {
  /** poursuites (le Chirurgien te prend en chasse) */
  chases: number;
  /** poursuites semées (il t'a perdu) */
  lost: number;
  /** repérages à vue (vu, ou vu entrer dans une cachette) */
  sightings: number;
  /** temps de chrono lampe allumée (ms) */
  lampMs: number;
  /** notes lues */
  notes: string[];
}

export function emptyRunStats(): RunStats {
  return { chases: 0, lost: 0, sightings: 0, lampMs: 0, notes: [] };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "firstEscape", name: "La sortie", desc: "Évade-toi de l'hôpital pour la première fois.", xp: 25 },
  { id: "allExits", name: "Trois portes", desc: "Évade-toi par le portail, par l'ambulance et par le toit.", xp: 75 },
  { id: "gradeZ", name: "Note Z", desc: "Évade-toi avec la note Z.", xp: 60 },
  { id: "under2", name: "Sprint final", desc: "Évade-toi en moins de 2:00.", xp: 80 },
  { id: "unseen", name: "Fantôme de l'hôpital", desc: "Évade-toi sans que le Chirurgien te repère.", xp: 60 },
  { id: "hard", name: "Pas pour les touristes", desc: "Évade-toi en Difficile.", xp: 40 },
  { id: "nightmare", name: "Réveil", desc: "Évade-toi en Cauchemar.", xp: 80 },
  { id: "nightmareUnseen", name: "Ombre", desc: "Évade-toi en Cauchemar sans être repéré.", xp: 120 },
  { id: "lostHim", name: "Semé !", desc: "Sème le Chirurgien pendant une poursuite.", xp: 30 },
  { id: "threeChases", name: "Increvable", desc: "Évade-toi après avoir été poursuivi trois fois dans la même run.", xp: 50 },
  { id: "dark", name: "Le noir complet", desc: "Évade-toi avec la lampe éteinte plus de 80 % du temps.", xp: 60, secret: true },
  { id: "lockdown", name: "Dernière minute", desc: "Évade-toi pendant le confinement.", xp: 40 },
  { id: "modified", name: "Nouvelles règles", desc: "Évade-toi avec au moins un modificateur.", xp: 25 },
  { id: "fourMods", name: "Masochiste", desc: "Évade-toi avec quatre modificateurs ou plus.", xp: 100 },
  { id: "everyMod", name: "Collectionneur", desc: "Évade-toi au moins une fois avec chacun des huit modificateurs.", xp: 100 },
  { id: "noJournal", name: "Mémoire d'éléphant", desc: "Évade-toi sans carnet.", xp: 40 },
  { id: "beatGhost", name: "Plus vite que ton ombre", desc: "Bats ton fantôme sur une seed.", xp: 30 },
  { id: "archivist", name: "Archiviste", desc: "Lis toutes les notes de l'hôpital (sur plusieurs runs).", xp: 50 },
  { id: "escapes10", name: "Habitué", desc: "Évade-toi 10 fois.", xp: 50 },
  { id: "escapes50", name: "Vétéran", desc: "Évade-toi 50 fois.", xp: 150 },
  { id: "deaths25", name: "Chair fraîche", desc: "Fais-toi attraper 25 fois.", xp: 20, secret: true },
];

/** Compteurs cumulés (toutes runs comptées). */
interface Totals {
  escapes: number;
  captures: number;
  exits: string[];
  mods: ModifierId[];
  notes: string[];
}

const VERSION = 1;
const ALL_NOTES = [...CODE_NOTES.map((n) => n.id), ...LORE_NOTES.map((n) => n.id)];

/**
 * Succès : évalués à la fin des runs comptées (classées ou modifiées ; jamais en entraînement,
 * jamais par le code « tout débloquer »). Chaque succès débloqué donne son XP une fois.
 */
export class Achievements {
  private got: Partial<Record<AchievementId, number>>;
  private totals: Totals;

  constructor() {
    const raw = loadJSON<{ version: number; got: Partial<Record<AchievementId, number>>; totals: Totals } | null>("achievements", null);
    const ok = raw && raw.version === VERSION;
    this.got = ok && raw.got && typeof raw.got === "object" ? raw.got : {};
    const t = ok ? raw.totals : null;
    this.totals = {
      escapes: t && Number.isFinite(t.escapes) ? t.escapes : 0,
      captures: t && Number.isFinite(t.captures) ? t.captures : 0,
      exits: t && Array.isArray(t.exits) ? t.exits : [],
      mods: t && Array.isArray(t.mods) ? t.mods : [],
      notes: t && Array.isArray(t.notes) ? t.notes : [],
    };
  }

  /** Date de déblocage (null : pas encore). */
  unlockedAt(id: AchievementId): number | null {
    return this.got[id] ?? null;
  }

  get count(): number {
    return ACHIEVEMENTS.filter((a) => this.got[a.id]).length;
  }

  /** Avancement des succès cumulés (texte court), null si sans objet. */
  progress(id: AchievementId): string | null {
    const t = this.totals;
    switch (id) {
      case "allExits":
        return `${new Set(t.exits).size}/3`;
      case "everyMod":
        return `${new Set(t.mods).size}/${MODIFIERS.length}`;
      case "archivist":
        return `${ALL_NOTES.filter((n) => t.notes.includes(n)).length}/${ALL_NOTES.length}`;
      case "escapes10":
        return `${Math.min(10, t.escapes)}/10`;
      case "escapes50":
        return `${Math.min(50, t.escapes)}/50`;
      case "deaths25":
        return `${Math.min(25, t.captures)}/25`;
      default:
        return null;
    }
  }

  /**
   * Fin d'une run comptée : met à jour les compteurs et renvoie les succès nouvellement débloqués.
   * `ghostBeaten` : la run a battu le fantôme couru (run classée).
   */
  evaluate(r: RunResult, s: RunStats, ghostBeaten: boolean): AchievementDef[] {
    if (r.setup.training) return [];
    const t = this.totals;
    const mods = r.setup.modifiers;
    const escaped = r.success;
    if (escaped) {
      t.escapes++;
      if (!t.exits.includes(r.exitId)) t.exits.push(r.exitId);
      for (const m of mods) if (!t.mods.includes(m)) t.mods.push(m);
    } else if (r.failReason === "captured") t.captures++;
    for (const n of s.notes) if (!t.notes.includes(n)) t.notes.push(n);

    const unseen = s.sightings === 0 && s.chases === 0;
    const cond: Record<AchievementId, boolean> = {
      firstEscape: t.escapes >= 1,
      allExits: ["gate", "ambulance", "roof"].every((e) => t.exits.includes(e)),
      gradeZ: escaped && r.grade === "Z",
      under2: escaped && r.timeMs < CONFIG.achievements.under2Ms,
      unseen: escaped && unseen,
      hard: escaped && (r.setup.difficulty === "hard" || r.setup.difficulty === "nightmare"),
      nightmare: escaped && r.setup.difficulty === "nightmare",
      nightmareUnseen: escaped && r.setup.difficulty === "nightmare" && unseen,
      lostHim: s.lost >= 1,
      threeChases: escaped && s.chases >= 3,
      dark: escaped && r.timeMs > 0 && s.lampMs / r.timeMs <= CONFIG.achievements.darkLampShare,
      lockdown: escaped && r.timeMs >= (mods.includes("short") ? CONFIG.modifiers.short.lockdownMs : CONFIG.run.lockdownMs),
      modified: escaped && mods.length >= 1,
      fourMods: escaped && mods.length >= 4,
      everyMod: MODIFIERS.every((m) => t.mods.includes(m.id)),
      noJournal: escaped && mods.includes("noJournal"),
      beatGhost: escaped && ghostBeaten,
      archivist: ALL_NOTES.every((n) => t.notes.includes(n)),
      escapes10: t.escapes >= 10,
      escapes50: t.escapes >= 50,
      deaths25: t.captures >= 25,
    };
    const fresh = ACHIEVEMENTS.filter((a) => cond[a.id] && !this.got[a.id]);
    const now = Date.now();
    for (const a of fresh) this.got[a.id] = now;
    saveJSON("achievements", { version: VERSION, got: this.got, totals: t });
    return fresh;
  }
}
