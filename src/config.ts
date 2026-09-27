/**
 * ============================================================================
 *  CONFIG — toutes les valeurs d'équilibrage du jeu sont centralisées ici.
 * ============================================================================
 *  Unités : mètres, secondes, millisecondes (quand précisé), degrés (quand précisé).
 */

export type Difficulty = "easy" | "normal" | "hard" | "nightmare";

/** Réglages de l'IA pour une difficulté. */
export interface AiDifficulty {
  /** vitesses (m/s) : patrouille, poursuite, recherche */
  walkSpeed: number;
  runSpeed: number;
  searchSpeed: number;
  /** vision : portée (m) et angle total du cône (°) */
  visionRange: number;
  visionAngle: number;
  /** multiplicateur des rayons de bruit */
  hearing: number;
  /** temps d'exposition avant de repérer le joueur (s) */
  reaction: number;
  /** répit en début de run (s) */
  grace: number;
  /** saute les barrières basses */
  jumpBarriers: boolean;
  /** emprunte les raccourcis (fenêtres cassées…) */
  shortcuts: boolean;
  /** probabilité de fouiller une cachette pendant une recherche */
  hideCheck: number;
  /** probabilité de fouiller la cachette où il a VU le joueur entrer */
  sawEnterCheck: number;
  /** nombre de pièges posés */
  traps: number;
  /** anticipation de la route du joueur (0..1) */
  anticipation: number;
  /** temps pour ouvrir une porte (s) */
  doorTime: number;
  /** durée de la recherche après avoir perdu le joueur (s) */
  searchTime: number;
  /** tendance à patrouiller près des objectifs restants du joueur */
  patrolObjectiveBias: number;
}
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
  /** IA du monstre */
  ai: {
    /** rayon de collision / navigation (m) */
    radius: 0.38,
    /** distance de capture (m) */
    captureRange: 1.05,
    /** recalcul du chemin en poursuite (s) */
    repathChase: 0.3,
    /** accélération (m/s²) */
    accel: 9,
    /** vitesse de rotation (rad/s) */
    turnRate: 7,
    /** hauteur des yeux (m) */
    eyeHeight: 1.85,
    /** la lampe allumée multiplie la distance de repérage */
    flashlightVisibility: 1.45,
    /** accroupi : multiplicateur de visibilité */
    crouchVisibility: 0.7,
    /** perte de vue avant de passer en recherche (s) */
    loseSightTime: 1.6,
    /** confinement : multiplicateurs */
    lockdown: { speed: 1.18, hearing: 1.6, pingInterval: 18 },
    /** point de départ (au bout du couloir sud, visible depuis le hall) */
    spawn: { x: 40.5, y: 0, z: 18.6, yaw: Math.PI },
    difficulty: {
      easy: {
        walkSpeed: 1.5,
        runSpeed: 4.3,
        searchSpeed: 1.2,
        visionRange: 13,
        visionAngle: 95,
        hearing: 0.7,
        reaction: 0.9,
        grace: 12,
        jumpBarriers: false,
        shortcuts: false,
        hideCheck: 0.15,
        sawEnterCheck: 0.55,
        traps: 0,
        anticipation: 0,
        doorTime: 0.9,
        searchTime: 9,
        patrolObjectiveBias: 0,
      },
      normal: {
        walkSpeed: 1.8,
        runSpeed: 5.4,
        searchSpeed: 1.45,
        visionRange: 17,
        visionAngle: 110,
        hearing: 1.0,
        reaction: 0.55,
        grace: 8,
        jumpBarriers: true,
        shortcuts: false,
        hideCheck: 0.3,
        sawEnterCheck: 0.85,
        traps: 0,
        anticipation: 0,
        doorTime: 0.6,
        searchTime: 13,
        patrolObjectiveBias: 0.15,
      },
      hard: {
        walkSpeed: 2.1,
        runSpeed: 6.2,
        searchSpeed: 1.7,
        visionRange: 21,
        visionAngle: 125,
        hearing: 1.3,
        reaction: 0.35,
        grace: 5,
        jumpBarriers: true,
        shortcuts: true,
        hideCheck: 0.45,
        sawEnterCheck: 1,
        traps: 5,
        anticipation: 0.35,
        doorTime: 0.4,
        searchTime: 16,
        patrolObjectiveBias: 0.35,
      },
      nightmare: {
        walkSpeed: 2.4,
        runSpeed: 7.0,
        searchSpeed: 2.0,
        visionRange: 26,
        visionAngle: 140,
        hearing: 1.6,
        reaction: 0.2,
        grace: 3,
        jumpBarriers: true,
        shortcuts: true,
        hideCheck: 0.6,
        sawEnterCheck: 1,
        traps: 8,
        anticipation: 0.8,
        doorTime: 0.25,
        searchTime: 20,
        patrolObjectiveBias: 0.6,
      },
    } as Record<Difficulty, AiDifficulty>,
  },

  audio: {
    /** réverbération (envoi) selon la pièce de la caméra */
    reverb: { outdoor: 0.1, stair: 0.6, corridor: 0.42, big: 0.46, small: 0.24, bigArea: 80 },
    /** distance (m) sous laquelle la nappe de tension monte */
    tensionRange: 16,
    /** distance (m) sous laquelle on entend respirer le monstre */
    monsterVoiceRange: 13,
    breathGain: 0.5,
    heartGain: 0.9,
    /** sirène du confinement : durée initiale, rappels (durée / période) en s */
    siren: { first: 7, burst: 3.5, period: 26 },
  },

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
    /** réglages des post-traitements (activés selon le preset) */
    post: {
      bloom: { scale: 0.5, threshold: 0.72, weight: 0.22, kernel: 48 },
      grain: { intensity: 7 },
      chromatic: { amount: 14, radial: 1.2 },
      ssao: { ratio: 0.5, radius: 1.1, strength: 0.9, samples: 8, maxZ: 40 },
    },
  },
} as const;

export type Config = typeof CONFIG;
