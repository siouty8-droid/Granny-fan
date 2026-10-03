import { loadJSON, saveJSON } from "../core/Storage";
import { DOSSIERS, DOSSIER_SPOTS } from "../gameplay/data/spawns";

const VERSION = 1;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Dossiers cachés : collection gardée d'une run à l'autre. Un seul dossier par run comptée (jamais
 * en entraînement), choisi parmi ceux pas encore trouvés, à un emplacement tiré de la seed.
 */
export class Dossiers {
  private found: string[];

  constructor() {
    const raw = loadJSON<{ version: number; found: string[] } | null>("dossiers", null);
    this.found = raw && raw.version === VERSION && Array.isArray(raw.found) ? raw.found.filter((id) => DOSSIERS.some((d) => d.id === id)) : [];
  }

  get count(): number {
    return this.found.length;
  }

  has(id: string): boolean {
    return this.found.includes(id);
  }

  /** Rangé dans la collection ; renvoie true si c'est un nouveau. */
  add(id: string): boolean {
    if (this.found.includes(id) || !DOSSIERS.some((d) => d.id === id)) return false;
    this.found.push(id);
    saveJSON("dossiers", { version: VERSION, found: this.found });
    return true;
  }

  /** Dossier de la run (null : collection complète). Même seed → même dossier, même endroit. */
  pick(seed: string): { id: string; spot: string } | null {
    const left = DOSSIERS.filter((d) => !this.found.includes(d.id));
    if (!left.length) return null;
    const d = left[hash(`${seed}#dossier`) % left.length]!;
    return { id: d.id, spot: DOSSIER_SPOTS[hash(`${seed}#spot`) % DOSSIER_SPOTS.length]! };
  }
}
