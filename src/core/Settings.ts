import { CONFIG, type Difficulty, type GraphicsPreset } from "../config";
import { FLASH_COLORS, SKINS, type FlashColorId, type SkinId } from "../run/Cosmetics";
import { sanitizeModifiers, type ModifierId } from "../run/Modifiers";
import { defaultBindings, type Action, type Bindings, type KeyboardLayout } from "./KeyBindings";
import { Emitter } from "./Events";
import { loadJSON, saveJSON } from "./Storage";

export type SeedMode = "random" | "set";

/** Pilote auto : coupé, meilleure sortie, ou sortie imposée. */
export type AutopilotMode = "off" | "best" | "gate" | "ambulance" | "roof";

/** Fantôme en entraînement. */
export type TrainingGhost = "off" | "pb" | "auto";

export interface SettingsData {
  version: number;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  headBob: boolean;
  graphics: GraphicsPreset;
  dynamicResolution: boolean;
  showFps: boolean;
  /** luminosité (multiplie l'exposition) */
  brightness: number;
  /** l'écran de calibrage a été validé au moins une fois */
  brightnessCalibrated: boolean;
  volumeMaster: number;
  volumeMusic: number;
  volumeSfx: number;
  layout: KeyboardLayout;
  bindings: Bindings;
  difficulty: Difficulty;
  /** modificateurs choisis pour les prochaines runs */
  modifiers: ModifierId[];
  seedMode: SeedMode;
  setSeed: string;
  /** seed du mode entraînement (vide = aléatoire) */
  trainingSeed: string;
  /** pilote auto de l'entraînement (débloqué au niveau 5) */
  trainingAutopilot: AutopilotMode;
  /** fantôme de ton meilleur temps sur la seed (runs classées) */
  ghost: boolean;
  /** fantôme en entraînement : aucun, ton record, ou la run du pilote auto */
  trainingGhost: TrainingGhost;
  /** couleur de la lampe choisie (effective seulement si débloquée) */
  flashColor: FlashColorId;
  /** tenue du Chirurgien choisie (effective seulement si débloquée) */
  monsterSkin: SkinId;
  /** l'intro a déjà été vue au moins une fois (proposée quand même, mais skippable) */
  introSeen: boolean;
}

const VERSION = 1;

function defaults(): SettingsData {
  return {
    version: VERSION,
    sensitivity: CONFIG.input.sensitivityDefault,
    invertY: false,
    fov: CONFIG.camera.fov,
    headBob: true,
    graphics: "medium",
    dynamicResolution: true,
    showFps: false,
    brightness: 1,
    brightnessCalibrated: false,
    volumeMaster: 0.8,
    volumeMusic: 0.7,
    volumeSfx: 0.9,
    layout: "azerty",
    bindings: defaultBindings(),
    difficulty: "normal",
    modifiers: [],
    seedMode: "random",
    setSeed: "",
    trainingSeed: "",
    trainingAutopilot: "off",
    ghost: true,
    trainingGhost: "pb",
    flashColor: "standard",
    monsterSkin: "classic",
    introSeen: false,
  };
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Valide et complète des réglages chargés (robuste aux anciennes versions / valeurs corrompues). */
function sanitize(raw: Partial<SettingsData> | null): SettingsData {
  const d = defaults();
  if (!raw || typeof raw !== "object") return d;
  const s: SettingsData = { ...d };
  s.sensitivity = clamp(raw.sensitivity, CONFIG.input.sensitivityMin, CONFIG.input.sensitivityMax, d.sensitivity);
  s.invertY = raw.invertY === true;
  s.fov = clamp(raw.fov, CONFIG.camera.fovMin, CONFIG.camera.fovMax, d.fov);
  s.headBob = raw.headBob !== false;
  s.graphics = raw.graphics === "low" || raw.graphics === "high" || raw.graphics === "medium" ? raw.graphics : d.graphics;
  s.dynamicResolution = raw.dynamicResolution !== false;
  s.showFps = raw.showFps === true;
  s.brightness = clamp(raw.brightness, CONFIG.graphics.brightness.min, CONFIG.graphics.brightness.max, d.brightness);
  s.brightnessCalibrated = raw.brightnessCalibrated === true;
  s.volumeMaster = clamp(raw.volumeMaster, 0, 1, d.volumeMaster);
  s.volumeMusic = clamp(raw.volumeMusic, 0, 1, d.volumeMusic);
  s.volumeSfx = clamp(raw.volumeSfx, 0, 1, d.volumeSfx);
  s.layout = raw.layout === "qwerty" ? "qwerty" : "azerty";
  s.difficulty =
    raw.difficulty === "easy" || raw.difficulty === "hard" || raw.difficulty === "nightmare" || raw.difficulty === "normal"
      ? raw.difficulty
      : d.difficulty;
  s.modifiers = sanitizeModifiers(raw.modifiers);
  s.seedMode = raw.seedMode === "set" ? "set" : "random";
  s.setSeed = typeof raw.setSeed === "string" ? raw.setSeed.slice(0, 24) : "";
  s.trainingSeed = typeof raw.trainingSeed === "string" ? raw.trainingSeed.slice(0, 24) : "";
  s.trainingAutopilot = (["off", "best", "gate", "ambulance", "roof"] as const).find((m) => m === raw.trainingAutopilot) ?? "off";
  s.ghost = raw.ghost !== false;
  s.trainingGhost = (["off", "pb", "auto"] as const).find((m) => m === raw.trainingGhost) ?? "pb";
  s.flashColor = FLASH_COLORS.find((c) => c.id === raw.flashColor)?.id ?? d.flashColor;
  s.monsterSkin = SKINS.find((k) => k.id === raw.monsterSkin)?.id ?? d.monsterSkin;
  s.introSeen = raw.introSeen === true;
  if (raw.bindings && typeof raw.bindings === "object") {
    for (const key of Object.keys(d.bindings) as Action[]) {
      const b = (raw.bindings as Partial<Bindings>)[key];
      if (Array.isArray(b) && b.length === 2 && typeof b[0] === "string" && typeof b[1] === "string") {
        s.bindings[key] = [b[0], b[1]];
      }
    }
  }
  return s;
}

interface SettingsEvents {
  change: SettingsData;
}

export class Settings extends Emitter<SettingsEvents> {
  data: SettingsData;

  constructor() {
    super();
    this.data = sanitize(loadJSON<Partial<SettingsData> | null>("settings", null));
  }

  update(patch: Partial<SettingsData>): void {
    this.data = sanitize({ ...this.data, ...patch });
    saveJSON("settings", this.data);
    this.emit("change", this.data);
  }

  resetBindings(): void {
    this.update({ bindings: defaultBindings() });
  }

  resetAll(): void {
    // les cosmétiques ne sont pas des réglages : « tout réinitialiser » les garde
    const keep = { introSeen: this.data.introSeen, flashColor: this.data.flashColor, monsterSkin: this.data.monsterSkin };
    this.data = { ...defaults(), ...keep };
    saveJSON("settings", this.data);
    this.emit("change", this.data);
  }
}
