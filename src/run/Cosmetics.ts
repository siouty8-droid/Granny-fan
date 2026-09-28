import { UNLOCKS, type UnlockId } from "./Progression";

/** Couleurs de la lampe torche (récompense du niveau 10). Visuel seulement. */
export type FlashColorId = "standard" | "warm" | "neon" | "uv" | "red";

/** Tenues du Chirurgien (niveaux 15, 20…). Visuel seulement. */
export type SkinId = "classic" | "nightNurse" | "patientZero";

export interface FlashColorDef {
  id: FlashColorId;
  name: string;
  desc: string;
  /** teinte brute (sRGB 0..1) ; la luminance est recalée sur la lampe d'origine */
  tint: [number, number, number];
  unlock: UnlockId | null;
}

export interface SkinDef {
  id: SkinId;
  name: string;
  desc: string;
  unlock: UnlockId | null;
}

export const FLASH_COLORS: FlashColorDef[] = [
  { id: "standard", name: "Standard", desc: "Le blanc chaud de la lampe d'origine.", tint: [1.0, 0.93, 0.8], unlock: null },
  { id: "warm", name: "Chaude", desc: "Vieille ampoule à filament, jaune orangé.", tint: [1.0, 0.7, 0.4], unlock: "flashlightColors" },
  { id: "neon", name: "Néon bleu", desc: "LED froide d'urgence, bleu clinique.", tint: [0.6, 0.8, 1.0], unlock: "flashlightColors" },
  { id: "uv", name: "UV", desc: "Lumière noire violette, comme pour chercher des traces.", tint: [0.62, 0.34, 1.0], unlock: "flashlightColors" },
  { id: "red", name: "Rouge", desc: "Lampe de chambre noire. Tout baigne dans le rouge.", tint: [1.0, 0.26, 0.2], unlock: "flashlightColors" },
];

export const SKINS: SkinDef[] = [
  { id: "classic", name: "Le Chirurgien", desc: "Blouse de bloc déchirée, masque et calot. L'original.", unlock: null },
  { id: "nightNurse", name: "La Veilleuse de nuit", desc: "Robe d'infirmière, gilet de garde, coiffe à croix rouge, longs cheveux noirs et sourire cousu.", unlock: "skinNightNurse" },
  { id: "patientZero", name: "Le Patient zéro", desc: "Blouse de patient en lambeaux, bandages, bracelet d'hôpital et pied à perfusion qu'il traîne derrière lui.", unlock: "skinPatientZero" },
];

export function unlockLevel(id: UnlockId | null): number {
  return id ? UNLOCKS.find((u) => u.id === id)!.level : 1;
}

/** Couleur linéaire de la lampe : même luminance (ou presque) que la lampe d'origine. */
export function flashColorRGB(id: FlashColorId): [number, number, number] {
  const def = FLASH_COLORS.find((c) => c.id === id) ?? FLASH_COLORS[0]!;
  const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // recalage partiel : les teintes sombres (UV, rouge) restent un peu plus sombres, sans pénaliser
  const k = Math.pow(lum(FLASH_COLORS[0]!.tint) / lum(def.tint), 0.8);
  return [def.tint[0] * k, def.tint[1] * k, def.tint[2] * k];
}

/** Choix effectif : un cosmétique pas (ou plus) débloqué retombe sur celui d'origine. */
export function effectiveFlashColor(id: FlashColorId, level: number): FlashColorId {
  const def = FLASH_COLORS.find((c) => c.id === id);
  return def && level >= unlockLevel(def.unlock) ? def.id : "standard";
}

export function effectiveSkin(id: SkinId, level: number): SkinId {
  const def = SKINS.find((s) => s.id === id);
  return def && level >= unlockLevel(def.unlock) ? def.id : "classic";
}
