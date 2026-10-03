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

/** Modificateurs de run (optionnels : plus durs, bonus d'XP, pas de records). */
export type ModifierId = "battery" | "noSprint" | "fog" | "enraged" | "invisible" | "short" | "noJournal" | "noHiding";
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
  autopilot: {
    /** marge visée au-dessus du temps théorique (s) : le temps de suivre ce que fait le pilote */
    margin: 22,
    /** pièges au plus (obstacles de navigation du pilote) */
    maxTraps: 8,
  },

  /** Fantôme (ton meilleur temps sur la seed, ou la run du pilote auto) */
  ghost: {
    /** pas d'échantillonnage du trajet (ms de chrono) */
    sampleMs: 200,
    /** fantômes gardés au plus, et taille totale max des trajets (caractères) */
    maxStored: 20,
    maxChars: 600_000,
    color: { r: 0.55, g: 0.8, b: 1.0 },
    alpha: 0.3,
    beamAlpha: 0.045,
    /** effacement après l'arrivée (ms) */
    fadeMs: 1500,
  },

  /** Événements flippants (ambiance seulement) */
  scares: {
    /** premier événement après (s de run) */
    firstDelay: [35, 60] as [number, number],
    /** puis toutes les (s) */
    interval: [45, 95] as [number, number],
    /** pas d'événement si le Chirurgien est plus près que ça (m) */
    monsterClear: 16,
    /** la silhouette disparaît à cette distance (m) ou après ce temps (s) */
    figureVanishDist: 9,
    figureMaxTime: 3.5,
  },

  /** Succès : seuils */
  achievements: {
    /** « Sprint final » : évasion sous ce temps (ms) */
    under2Ms: 2 * 60_000,
    /** « Le noir complet » : part maximale du temps lampe allumée */
    darkLampShare: 0.2,
  },

  /** Modificateurs de run */
  modifiers: {
    /** bonus d'XP de chaque modificateur (fraction), cumulés puis plafonnés à maxXpBonus */
    xpBonus: { battery: 0.2, noSprint: 0.2, fog: 0.15, enraged: 0.25, invisible: 0.25, short: 0.15, noJournal: 0.1, noHiding: 0.1 } as Record<ModifierId, number>,
    maxXpBonus: 1,
    /** lampe à piles : durée d'éclairage d'une charge pleine (s), recharge complète éteinte (s) */
    battery: { drain: 160, recharge: 120, dimBelow: 0.25, minToLight: 0.04 },
    /** brouillard : multiplicateur de densité, couleur (plus claire : on voit le brouillard) */
    fog: { density: 3.3, color: { r: 0.075, g: 0.08, b: 0.085 } },
    /** Chirurgien enragé : multiplicateurs */
    enraged: { speed: 1.15, hearing: 1.35, vision: 1.1 },
    /** Chirurgien invisible : visible dans cette fraction du cône / de la portée de la lampe */
    invisible: { cone: 0.85, range: 0.9, hold: 0.2 },
    /** chrono réduit */
    short: { timeLimitMs: 5 * 60_000, lockdownMs: 4 * 60_000 },
  },

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
    /** regarder derrière soi : vitesse de rotation (1/s) et décalage de l'épaule (m) */
    lookBack: { speed: 11, shoulder: 0.12 },
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
    /**
     * Lanterne du Conducteur (centre commercial) : vraie lumière qui le suit (repère de loin pour
     * le joueur) et qui lui permet de te voir dans le noir à portée de sa lumière.
     */
    lantern: { color: [1.0, 0.62, 0.28] as const, intensity: 9, range: 9, flicker: 0.12, sight: 7 },
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

  /** XP et niveaux (l'entraînement ne rapporte rien) */
  progression: {
    /** niveau maximum (pour l'instant) */
    maxLevel: 20,
    /** XP pour passer du niveau n au niveau n+1 : base + pas × (n − 1) → 100, 120, 140… */
    levelBase: 100,
    levelStep: 20,
    /** mort ou temps écoulé : XP pleine si la run a duré au moins `deathFullAfter` s (anti-farm) */
    deathXp: 10,
    deathFullAfter: 90,
    deathMinFactor: 0.3,
    /** évasion selon la note (moyenne entre B et C = 50) */
    winXp: { Z: 80, S: 71, A: 63, B: 54, C: 46, D: 37, E: 29, F: 20 } as Record<Grade, number>,
    difficultyMult: { easy: 0.8, normal: 1, hard: 1.3, nightmare: 1.6 } as Record<Difficulty, number>,
  },

  /** retour visuel du repérage (vignette) */
  danger: {
    /** opacité max de la vignette */
    max: 0.85,
    /** niveau quand il te voit en poursuite / te poursuit sans te voir */
    chaseSeen: 0.6,
    chaseHidden: 0.3,
    /** vitesses de montée / descente (1/s) */
    rise: 6,
    fall: 1.2,
  },

  journal: {
    /** fréquence de repérage des objets visibles (s) */
    scanInterval: 0.25,
    /** distance max de repérage (m) */
    spotRange: 9,
    /** rafraîchissement du carnet ouvert (s) */
    refresh: 0.3,
  },

  history: {
    /** nombre de runs conservées */
    maxEntries: 60,
    /** une run relancée / quittée après ce délai (s) compte comme abandonnée */
    abandonAfter: 20,
  },

  runLog: {
    /** intervalle d'échantillonnage des trajectoires (s) */
    sampleInterval: 0.25,
    /** même cause de détection répétée : ignorée pendant (s) */
    dedupe: 4,
    /** récap de capture : détections retenues dans les N s précédant la capture */
    recapWindow: 45,
    /** nombre max de lignes du récap */
    recapLines: 4,
  },

  audio: {
    /** réverbération (envoi) selon la pièce de la caméra */
    reverb: { outdoor: 0.1, stair: 0.6, corridor: 0.42, big: 0.46, small: 0.24, bigArea: 80 },
    /** distance (m) sous laquelle la nappe de tension monte */
    tensionRange: 16,
    /** distance (m) sous laquelle on entend respirer le monstre */
    monsterVoiceRange: 13,
    breathGain: 0.5,
    /** repérage : seuil de la jauge qui déclenche le « coup » sonore */
    detectSting: 0.3,
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
    /** exposition de base (tone mapping ACES) et contraste */
    exposure: 1.25,
    contrast: 1.18,
    /** réglage de luminosité (× exposition) ; calibrage : luminances des 3 symboles (linéaire) */
    brightness: { min: 0.55, max: 1.8, step: 0.05, symbols: [0.004, 0.012, 0.05] },
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
