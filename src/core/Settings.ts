import { CONFIG, type Difficulty, type GraphicsPreset } from "../config";
import { defaultBindings, type Action, type Bindings, type KeyboardLayout } from "./KeyBindings";
import { Emitter } from "./Events";
import { loadJSON, saveJSON } from "./Storage";

export type SeedMode = "random" | "set";

/** Pilote auto : coupé, meilleure sortie, ou sortie imposée. */
export type AutopilotMode = "off" | "best" | "gate" | "ambulance" | "roof";

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
  seedMode: SeedMode;
  setSeed: string;
  /** seed du mode entraînement (vide = aléatoire) */
  trainingSeed: string;
  /** pilote auto de l'entraînement (débloqué au niveau 5) */
  trainingAutopilot: AutopilotMode;
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
    seedMode: "random",
    setSeed: "",
    trainingSeed: "",
    trainingAutopilot: "off",
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
  s.seedMode = raw.seedMode === "set" ? "set" : "random";
  s.setSeed = typeof raw.setSeed === "string" ? raw.setSeed.slice(0, 24) : "";
  s.trainingSeed = typeof raw.trainingSeed === "string" ? raw.trainingSeed.slice(0, 24) : "";
  s.trainingAutopilot = (["off", "best", "gate", "ambulance", "roof"] as const).find((m) => m === raw.trainingAutopilot) ?? "off";
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
    const keep = { introSeen: this.data.introSeen };
    this.data = { ...defaults(), ...keep };
    saveJSON("settings", this.data);
    this.emit("change", this.data);
  }
}
