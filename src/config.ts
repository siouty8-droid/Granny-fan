/**
 * ============================================================================
 *  CONFIG — toutes les valeurs d'équilibrage du jeu sont centralisées ici.
 * ============================================================================
 *  Unités : mètres, secondes, millisecondes (quand précisé), degrés (quand précisé).
 */

export type Difficulty = "easy" | "normal" | "hard" | "nightmare";
export type GraphicsPreset = "low" | "medium" | "high";
export type Grade = "Z" | "S" | "A" | "B" | "C" | "D" | "E" | "F";

export const CONFIG = {
  game: {
    title: "DIX MINUTES",
    subtitle: "Hôpital Saint-Aubin",
  },

  // --------------------------------------------------------------------------
  // Joueur
  // --------------------------------------------------------------------------
  player: {
    radius: 0.3,
    standHeight: 1.8,
    crouchHeight: 1.1,
    /** hauteur des yeux (debout / accroupi) depuis les pieds */
    eyeStand: 1.66,
    eyeCrouch: 0.98,
    walkSpeed: 5.0,
    sprintSpeed: 7.8,
    crouchSpeed: 2.3,
    /** accélération / freinage au sol (m/s²) */
    groundAccel: 42,
    groundDecel: 34,
    airAccel: 8,
    gravity: 24,
    /** hauteur de marche franchissable sans sauter */
    stepHeight: 0.42,
    /** distance max d'accroche au sol en descente */
    groundSnap: 0.35,
    /** vitesse de transition debout <-> accroupi (1/s) */
    crouchLerp: 9,
    /** lissage vertical de la caméra sur les marches (1/s) */
    stepSmoothing: 14,
    /** pas de physique maximal (s) — la physique est sous-échantillonnée à >=120 Hz */
    maxSubstep: 1 / 120,
    interactRange: 2.2,
  },

  /** Jauge de sprint : activable uniquement pleine, dure jusqu'à vide, puis recharge. */
  sprint: {
    /** durée d'un sprint complet (s) */
    duration: 3.6,
    /** temps pour recharger la jauge de 0 à 100 % (s) */
    rechargeTime: 8.5,
    /** délai avant le début de la recharge après avoir vidé la jauge (s) */
    rechargeDelay: 0.5,
    /** bonus de FOV pendant le sprint (degrés) */
    fovKick: 7,
    /** durée de la respiration « essoufflée » après un sprint (s) */
    breathlessTime: 3.2,
  },

  camera: {
    /** FOV horizontal par défaut (degrés) */
    fov: 90,
    fovMin: 65,
    fovMax: 115,
    pitchLimitDeg: 88,
    nearPlane: 0.05,
    farPlane: 140,
    headBob: {
      walkAmplitude: 0.035,
      sprintAmplitude: 0.06,
      crouchAmplitude: 0.018,
      /** foulées par mètre parcouru */
      stridePerMeter: 0.62,
      rollDeg: 0.35,
    },
  },

  input: {
    /** rotation par « count » souris pour une sensibilité de 1.00 (degrés) */
    mouseBaseDegPerCount: 0.045,
    sensitivityMin: 0.05,
    sensitivityMax: 5,
    sensitivityDefault: 1,
    /** maintien de R pour le restart instantané (s) */
    restartHold: 0.5,
    /** maintien pour passer une cinématique (s) */
    skipHold: 1.0,
  },

  flashlight: {
    /** décalage de la lampe par rapport à l'œil (x droite, y haut, z avant) */
    offset: { x: 0.22, y: -0.24, z: 0.12 },
    angleDeg: 62,
    exponent: 1.2,
    range: 26,
    intensity: 95,
    color: { r: 1.0, g: 0.93, b: 0.8 },
    /** lissage de l'orientation de la lampe (1/s) — un léger retard « en main » */
    followSharpness: 26,
  },

  // --------------------------------------------------------------------------
  // Run / speedrun
  // --------------------------------------------------------------------------
  run: {
    /** limite de temps : la run est perdue au-delà (ms) */
    timeLimitMs: 10 * 60_000,
    /** déclenchement du lockdown (ms) */
    lockdownMs: 8 * 60_000,
    /** seuils des notes (temps max inclus, ms). Au-delà du dernier seuil : F. */
    grades: [
      { grade: "Z", maxMs: 3 * 60_000 + 30_000 },
      { grade: "S", maxMs: 4 * 60_000 },
      { grade: "A", maxMs: 4 * 60_000 + 45_000 },
      { grade: "B", maxMs: 5 * 60_000 + 30_000 },
      { grade: "C", maxMs: 6 * 60_000 + 30_000 },
      { grade: "D", maxMs: 7 * 60_000 + 15_000 },
      { grade: "E", maxMs: 8 * 60_000 },
    ] as ReadonlyArray<{ grade: Grade; maxMs: number }>,
    /** longueur des seeds aléatoires générées */
    seedLength: 8,
  },

  inventory: {
    slots: 2,
  },

  // --------------------------------------------------------------------------
  // Bruit (rayon d'audition de base en mètres, multiplié par la surface)
  // --------------------------------------------------------------------------
  noise: {
    walkStep: 7,
    sprintStep: 17,
    crouchStep: 2.2,
    surfaceMultiplier: { tile: 1.0, concrete: 0.9, grass: 0.55, metal: 1.6, wood: 1.15 } as Record<string, number>,
  },

  // --------------------------------------------------------------------------
  // Graphismes
  // --------------------------------------------------------------------------
  graphics: {
    presets: {
      low: { renderScale: 0.72, shadowMapSize: 512, shadowFilter: 0, bloom: false, grain: false, ssao: false, chromatic: false, textureSize: 512, maxAniso: 2 },
      medium: { renderScale: 0.9, shadowMapSize: 1024, shadowFilter: 1, bloom: true, grain: true, ssao: false, chromatic: false, textureSize: 1024, maxAniso: 4 },
      high: { renderScale: 1.0, shadowMapSize: 2048, shadowFilter: 2, bloom: true, grain: true, ssao: true, chromatic: true, textureSize: 1024, maxAniso: 8 },
    } as Record<GraphicsPreset, {
      renderScale: number;
      shadowMapSize: number;
      /** 0 = PCF bas, 1 = PCF moyen, 2 = PCF haut */
      shadowFilter: number;
      bloom: boolean;
      grain: boolean;
      ssao: boolean;
      chromatic: boolean;
      textureSize: number;
      maxAniso: number;
    }>,
    dynamicResolution: {
      /** en dessous de ce fps moyen, on baisse la résolution */
      lowFps: 58,
      /** au-dessus, on remonte doucement */
      highFps: 59.5,
      minScale: 0.55,
      step: 0.04,
      /** fenêtre de mesure (s) */
      window: 0.75,
    },
    fog: { density: 0.034, color: { r: 0.012, g: 0.014, b: 0.018 } },
  },
} as const;

export type Config = typeof CONFIG;
