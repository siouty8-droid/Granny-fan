import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG, type Difficulty, type GraphicsPreset } from "../config";
import { Renderer } from "../render/Renderer";
import { CollisionWorld } from "../physics/CollisionWorld";
import { Player } from "../player/Player";
import { World } from "../world/World";
import { MaterialLibrary } from "../render/materials/MaterialLibrary";
import { LightAnimator } from "../render/LightAnimator";
import { Sky } from "../render/Sky";
import { Atmosphere } from "../render/Atmosphere";
import { ZoneCulling } from "../render/ZoneCulling";
import { PostFx } from "../render/PostFx";
import { DynamicResolution } from "../render/DynamicResolution";
import { MenuBackground } from "../ui/MenuBackground";
import { RunManager, type RunResult } from "../run/RunManager";
import { RunLog } from "../run/RunLog";
import { buildRecap, type CauseKey } from "../run/DeathRecap";
import { History, type HistoryOutcome } from "../run/History";
import { Progression, type XpGain } from "../run/Progression";
import { ProgressionScreen } from "../ui/ProgressionScreen";
import { Autopilot } from "../autopilot/Autopilot";
import { EXIT_NAMES, RoutePlanner, type RouteExit } from "../autopilot/RoutePlanner";
import { RunMap } from "../ui/RunMap";
import { HUD } from "../ui/HUD";
import { LoadingScreen } from "../ui/LoadingScreen";
import { MainMenu, DIFFICULTY_INFO } from "../ui/MainMenu";
import { OptionsMenu } from "../ui/OptionsMenu";
import { PauseMenu } from "../ui/PauseMenu";
import { ResultsScreen } from "../ui/ResultsScreen";
import { RecordsMenu } from "../ui/RecordsMenu";
import { BrightnessScreen } from "../ui/BrightnessScreen";
import { FpsCounter } from "../ui/FpsCounter";
import { Gameplay } from "../gameplay/Gameplay";
import { AiSystem } from "../ai/AiSystem";
import { AudioEngine } from "../audio/AudioEngine";
import { SoundDirector, type SoundMode } from "../audio/SoundDirector";
import { CinemaOverlay } from "../cinema/CinemaOverlay";
import { Director } from "../cinema/Director";
import { introScript, outroScript, type CineCtx } from "../cinema/scripts";
import { h } from "../ui/dom";
import type { RoomDef } from "../world/layout/types";
import { DEBUG } from "./Debug";
import { Input } from "./Input";
import { detectKeyboardLayout, keyLabel } from "./KeyBindings";
import { normalizeSeed, randomSeed } from "./Rng";
import { Settings, type AutopilotMode, type SettingsData } from "./Settings";

type AppState = "loading" | "menu" | "playing" | "paused" | "results" | "cinema";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Application : machine à états (chargement → menu → jeu ⇄ pause → résultats…),
 * boucle de rendu, câblage des systèmes.
 */
export class App {
  readonly settings = new Settings();
  readonly renderer: Renderer;
  readonly input: Input;
  readonly collision = new CollisionWorld();
  readonly run = new RunManager();
  readonly lights = new LightAnimator();
  readonly history = new History();
  readonly progression = new Progression();
  player!: Player;
  world!: World;
  gameplay!: Gameplay;
  ai!: AiSystem;
  /** pilote auto (entraînement) */
  autopilot!: Autopilot;
  readonly audio = new AudioEngine();
  private cinema!: CinemaOverlay;
  director!: Director;
  sound!: SoundDirector;
  /** pièce de la caméra (culling, acoustique) ; undefined = non recalculée cette frame */
  private camRoom: RoomDef | null | undefined = undefined;
  culling!: ZoneCulling;
  private postFx!: PostFx;
  private dynRes!: DynamicResolution;
  atmosphere!: Atmosphere;
  private casterKey = "";
  private menuBg!: MenuBackground;
  private fadeEl = h("div", { class: "fade" });
  materials!: MaterialLibrary;
  /** trajets + détections de la run (carte et récap de fin) */
  runLog!: RunLog;
  private runMap: RunMap | null = null;
  /** seed imposée pour la prochaine run (« Rejouer cette seed ») */
  private replaySeed: string | null = null;
  private replayDifficulty: Difficulty | null = null;
  /** tests : temps de run simulé (debugSimulate) */
  private simTime: number | null = null;
  /** tests : horloge de jeu simulée (ms) */
  private simClock = 0;
  /** tests : seule la simulation fait avancer le jeu et le chrono (mesures reproductibles) */
  private simLocked = false;
  /** niveau de danger affiché (repérage par le monstre) */
  private danger = 0;

  state: AppState = "loading";
  private uiRoot: HTMLElement;
  private loading = new LoadingScreen();
  private menu!: MainMenu;
  private options!: OptionsMenu;
  private pause!: PauseMenu;
  private results!: ResultsScreen;
  private recordsMenu!: RecordsMenu;
  private brightness!: BrightnessScreen;
  private progressionScreen!: ProgressionScreen;
  /** mode entraînement (conservé aux restarts, jusqu'au retour au menu) */
  private training = false;
  /** seed imposée de l'entraînement (null = aléatoire à chaque restart) */
  private trainingSeed: string | null = null;
  /** pilote auto demandé pour l'entraînement en cours */
  private trainingAutopilot: AutopilotMode = "off";
  /** frames avant le calcul de la route (le message « calcul » s'affiche d'abord) */
  private planPending = 0;
  /** route jouée par le pilote pour l'écran de fin */
  private autopilotRun: { exit: string; theoretical: number } | null = null;
  private brightnessFrom: "menu" | "options" = "menu";
  private hud = new HUD();
  private fps!: FpsCounter;
  private lastFrame = performance.now();
  private frameNow = performance.now();
  private restartHeld = 0;
  private optionsReturn: AppState = "menu";
  private appliedPreset: GraphicsPreset | null = null;
  private refreezeFrames = 0;
  /** la run démarre (contrôle + chrono) à la prochaine frame */
  private pendingBegin = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas, this.settings.data.bindings);
    this.loading.mount(uiRoot);
  }

  async init(): Promise<void> {
    const t0 = performance.now();
    const step = async (p: number, label: string) => {
      this.loading.setProgress(p, label);
      await nextFrame();
    };
    await step(0.02, "Vérification du moteur…");
    this.checkEngine();
    await step(0.05, "Plans de l'hôpital…");
    this.buildLevel();
    await step(0.1, "Textures procédurales…");
    await this.world.generateMaterials((p, label) => step(0.1 + p * 0.3, `Textures procédurales… ${label}`));
    await step(0.4, "Éclairage précalculé…");
    const tb = performance.now();
    await this.world.bakeLighting((p, label) => step(0.4 + p * 0.45, `Éclairage précalculé… ${label}`));
    console.info(`Bake : ${Math.round(performance.now() - tb)} ms`);
    await step(0.85, "Navigation du monstre…");
    await this.ai.build(this.renderer.scene, this.materials, this.world.emissive, this.world.baker);
    console.info(`Navmesh : ${Math.round(this.ai.nav.buildMs)} ms · ${this.ai.nav.links.length} liaisons`);
    this.gameplay.afterBake();
    await step(0.86, "Assemblage des zones…");
    this.createMeshes();
    await step(0.9, "Préparation du joueur…");
    this.createPlayer();
    this.createUI();
    this.sound = new SoundDirector({
      audio: this.audio,
      world: this.world,
      collision: this.collision,
      player: this.player,
      gameplay: this.gameplay,
      monster: this.ai.monster,
    });
    // état initial des mécanismes (portes, ascenseur…) pour le fond du menu
    this.gameplay.reset();
    this.gameplay.clear();
    await step(0.94, "Compilation des shaders…");
    await this.warmup();
    this.materials.freezeAll();
    this.loading.setProgress(1, "Prêt.");
    console.info(`Chargement : ${Math.round(performance.now() - t0)} ms`);
    await nextFrame();

    void detectKeyboardLayout().then((layout) => {
      if (layout && !localStorage.getItem("dixminutes.layoutDetected")) {
        try {
          localStorage.setItem("dixminutes.layoutDetected", "1");
        } catch {
          /* ignore */
        }
        this.settings.update({ layout });
      }
    });

    this.settings.on("change", (s) => this.applySettings(s));
    this.applySettings(this.settings.data);
    this.input.onPointerLockChange((locked) => this.onPointerLock(locked));
    window.addEventListener("keydown", (e) => this.onGlobalKey(e));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pauseGame();
    });
    this.run.on("split", (s) => {
      this.hud.showSplit(s);
      const p = this.player;
      // la sortie a son propre repère (étoile) sur la carte
      if (!s.id.startsWith("exit_")) this.runLog.add("split", s.ms / 1000, p.x, p.y, p.z, s.label);
    });
    this.ai.monster.on("detect", (e) => this.runLog.add("detect", this.runTime(), e.x, e.y, e.z, this.placeName(e.x, e.y, e.z), e));
    this.run.on("lockdown", () => {
      this.hud.toast("CONFINEMENT — l'hôpital se verrouille", 3.5);
      this.lights.lockdownTarget = 1;
      this.sound.startLockdown();
      const p = this.player;
      this.runLog.add("lockdown", this.runTime(), p.x, p.y, p.z, "Confinement");
    });
    // l'audio ne peut démarrer qu'après un geste de l'utilisateur (politique d'autoplay)
    const unlockAudio = () => {
      this.audio.ensure();
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    this.run.on("timeout", () => this.failRun("timeout"));

    this.loading.unmount();
    this.goMenu();
    // premier lancement : calibrage de la luminosité avant le menu
    if (!this.settings.data.brightnessCalibrated && !DEBUG.autostart) this.openBrightness("menu");
    this.renderer.engine.runRenderLoop(() => this.frame());

    if (DEBUG.enabled) (window as unknown as { __game: App }).__game = this;
    if (DEBUG.autostart) {
      if (DEBUG.autopilot) this.startTraining(DEBUG.seed);
      else this.startRun();
    }
  }

  // ------------------------------------------------------------------ chargement

  private checkEngine(): void {
    if (!this.renderer.isWebGL2) console.warn("WebGL2 indisponible : repli WebGL1 (rendu dégradé).");
  }

  /** Preset graphique effectif (réglages, ou forcé par ?preset=low|medium|high). */
  private get presetName(): GraphicsPreset {
    const d = DEBUG.preset;
    return d === "low" || d === "medium" || d === "high" ? d : this.settings.data.graphics;
  }

  private buildLevel(): void {
    const preset = CONFIG.graphics.presets[this.presetName];
    this.materials = new MaterialLibrary(this.renderer.scene, preset.textureSize, preset.maxAniso);
    this.world = new World(this.renderer.scene, this.collision, this.materials);
    this.world.buildGeometry();
    this.player = new Player(this.renderer.scene, this.collision);
    this.gameplay = new Gameplay({
      scene: this.renderer.scene,
      world: this.world,
      collision: this.collision,
      materials: this.materials,
      player: this.player,
      run: this.run,
      hud: this.hud,
      settings: this.settings,
      onFinish: (id, label) => this.finishRun(id, label),
    });
    this.ai = new AiSystem(this.world, this.collision, this.gameplay);
    this.autopilot = new Autopilot(this.gameplay, this.player, this.input, this.ai.nav, () => this.runTime());
    const floors = [...this.world.layout.floors].sort((a, b) => b.y - a.y);
    this.runLog = new RunLog((x, y, z) => this.world.roomAt(x, y + 0.4, z)?.floor ?? (floors.find((f) => f.y <= y + 0.6) ?? floors[floors.length - 1]!).id);
  }

  private createMeshes(): void {
    this.world.createMeshes();
    new Sky(this.renderer.scene, 2048);
    this.atmosphere = new Atmosphere(this.renderer.scene);
    this.culling = new ZoneCulling(this.world.zones, this.world.zoneMeshes, this.world.props);
    this.culling.enabled = !DEBUG.noCull;
    this.culling.isPortalOpen = (p) => this.gameplay.isPortalOpen(p);
    this.gameplay.items.sectorVisible = (s) => !this.culling.enabled || this.culling.visibleSectors.has(s);
    this.ai.monster.isZoneVisible = (z) => !this.culling.enabled || this.culling.visible.has(z);
    this.ai.monster.onCaught = () => this.failRun("captured");
    if (DEBUG.bright) {
      const hemi = new HemisphericLight("debugHemi", new Vector3(0.3, 1, 0.2), this.renderer.scene);
      hemi.intensity = 2.2;
      hemi.groundColor = new Color3(0.5, 0.5, 0.5);
      this.renderer.scene.fogDensity = 0.004;
    }
    console.info("Monde :", this.world.stats());
  }

  private createPlayer(): void {
    const p = CONFIG.graphics.presets[this.presetName];
    this.postFx = new PostFx(this.renderer.scene, this.player.rig.camera, this.renderer.isWebGL2);
    this.dynRes = new DynamicResolution(this.renderer);
    this.player.flashlight.configureShadows(p.shadowMapSize, p.shadowFilter);
    this.player.flashlight.setCasters([]);
    this.renderer.scene.activeCamera = this.player.rig.camera;
  }

  private createUI(): void {
    this.menu = new MainMenu(
      this.settings,
      {
        play: () => this.startRun(),
        training: (seed) => this.startTraining(seed),
        progression: () => this.openProgression(),
        records: () => this.openRecords(),
        options: () => this.openOptions("menu"),
        quit: () => this.quit(),
      },
      this.progression,
    );
    this.progressionScreen = new ProgressionScreen(this.progression);
    this.progressionScreen.onClose = () => {
      this.progressionScreen.unmount();
      if (this.state === "menu") this.menu.mount(this.uiRoot);
    };
    this.options = new OptionsMenu(this.settings, this.input);
    this.options.onClose = () => this.closeOptions();
    this.options.onCalibrate = () => this.openBrightness("options");
    this.brightness = new BrightnessScreen();
    this.brightness.onPreview = (k) => this.renderer.setBrightness(k);
    this.brightness.onDone = (k) => this.closeBrightness(k);
    this.recordsMenu = new RecordsMenu(this.run.records, this.history);
    this.recordsMenu.onReplay = (seed, difficulty) => this.replayFromHistory(seed, difficulty);
    this.recordsMenu.onClose = () => {
      this.recordsMenu.unmount();
      if (this.state === "menu") this.menu.mount(this.uiRoot);
    };
    this.pause = new PauseMenu({
      resume: () => void this.resumeGame(),
      restart: () => this.restartFromMenu(),
      replay: () => this.replayRun(),
      options: () => this.openOptions("paused"),
      quitToMenu: () => this.goMenu(),
      takeOver: () => {
        this.autopilot.stop();
        this.autopilotRun = null;
        this.hud.toast("Tu reprends la main.", 2);
        void this.resumeGame();
      },
    });
    this.results = new ResultsScreen({
      restart: () => this.restartFromMenu(),
      replay: () => this.replayRun(),
      menu: () => this.goMenu(),
    });
    this.cinema = new CinemaOverlay(this.audio);
    this.director = new Director(this.cinema, this.player);
    this.fps = new FpsCounter(this.renderer.scene, this.renderer.engine);
    this.fps.extra = () => `rendu ${Math.round(this.renderer.renderScale * 100)} %${this.dynRes.enabled ? " (dyn.)" : ""} · ${this.presetName}`;
    this.uiRoot.appendChild(this.fps.el);
    this.uiRoot.prepend(this.fadeEl);
    this.menuBg = new MenuBackground(this.fadeEl);
  }

  private async warmup(): Promise<void> {
    const scene = this.renderer.scene;
    await scene.whenReadyAsync();
    scene.render();
  }

  // ------------------------------------------------------------------ réglages

  private applySettings(s: SettingsData): void {
    this.input.bindings = s.bindings;
    const rig = this.player.rig;
    rig.sensitivity = s.sensitivity;
    rig.invertY = s.invertY;
    rig.headBob = s.headBob;
    rig.setFov(s.fov);
    const name = this.presetName;
    const preset = CONFIG.graphics.presets[name];
    if (name !== this.appliedPreset) {
      this.appliedPreset = name;
      this.dynRes.setBase(preset.renderScale);
      this.postFx.apply(name);
    }
    this.dynRes.enabled = s.dynamicResolution && !DEBUG.fixedRes;
    const sg = this.player.flashlight.shadows;
    if (!sg || sg.getShadowMap()?.getSize().width !== preset.shadowMapSize) {
      this.player.flashlight.configureShadows(preset.shadowMapSize, preset.shadowFilter);
      this.player.flashlight.setCasters([]);
      this.casterKey = ""; // les projeteurs sont ré-enregistrés à la prochaine frame
      if (this.state !== "loading") {
        // la qualité de filtrage change les shaders : on dégèle le temps de recompiler
        this.materials.unfreezeAll();
        this.refreezeFrames = 3;
      }
    }
    this.fps.setVisible(s.showFps || DEBUG.enabled);
    this.renderer.setBrightness(s.brightness);
    this.audio.setVolumes(s.volumeMaster, s.volumeMusic, s.volumeSfx);
  }

  // ------------------------------------------------------------------ écrans

  private setScreens(...screens: Array<{ mount(p: HTMLElement): void; unmount(): void }>): void {
    for (const s of [this.menu, this.options, this.pause, this.hud, this.results, this.recordsMenu, this.cinema, this.brightness, this.progressionScreen]) {
      if (!screens.includes(s)) s.unmount();
    }
    for (const s of screens) s.mount(this.uiRoot);
  }

  goMenu(): void {
    this.autopilot.stop();
    this.recordAbandon();
    this.training = false;
    this.state = "menu";
    this.audio.setPaused(false);
    this.sound.reset();
    this.gameplay.clear();
    this.ai.disable();
    this.lights.reset();
    this.menuBg.reset();
    this.pendingBegin = false;
    this.input.gameplayActive = false;
    this.input.exitPointerLock();
    this.player.controlEnabled = false;
    this.setScreens(this.menu);
  }

  private openBrightness(from: "menu" | "options"): void {
    this.brightnessFrom = from;
    if (from === "menu") this.menu.unmount();
    this.brightness.open(this.settings.data.brightness);
    this.brightness.mount(this.uiRoot);
  }

  private closeBrightness(k: number): void {
    this.brightness.unmount();
    this.settings.update({ brightness: k, brightnessCalibrated: true });
    if (this.brightnessFrom === "menu" && this.state === "menu") this.menu.mount(this.uiRoot);
  }

  private openProgression(): void {
    this.menu.unmount();
    this.progressionScreen.mount(this.uiRoot);
  }

  private openRecords(): void {
    this.menu.unmount();
    this.recordsMenu.mount(this.uiRoot);
  }

  private openOptions(from: AppState): void {
    this.optionsReturn = from;
    this.options.mount(this.uiRoot);
  }

  private closeOptions(): void {
    this.options.unmount();
    if (this.optionsReturn === "menu" && this.state === "menu") this.menu.mount(this.uiRoot);
  }

  private quit(): void {
    window.close();
    this.uiRoot.append(
      h(
        "div",
        { class: "screen pause-screen" },
        h("div", { class: "pause-box" }, h("h1", { class: "pause-title" }, "À bientôt."), h("div", { class: "pause-info" }, "Tu peux fermer cet onglet.")),
      ),
    );
    this.renderer.engine.stopRenderLoop();
  }

  // ------------------------------------------------------------------ run

  /** Temps de run courant (s). */
  private runTime(): number {
    return this.simTime ?? this.run.elapsed(this.frameNow) / 1000;
  }

  private placeName(x: number, y: number, z: number): string {
    return this.world.roomAt(x, y + 0.4, z)?.name ?? "Dehors";
  }

  /** Seed de la prochaine run selon le mode choisi. */
  private nextSeed(): string {
    const s = this.settings.data;
    if (this.replaySeed) return this.replaySeed;
    if (DEBUG.seed) return normalizeSeed(DEBUG.seed);
    if (s.seedMode === "set") {
      const seed = normalizeSeed(s.setSeed);
      if (seed) return seed;
    }
    return randomSeed(CONFIG.run.seedLength);
  }

  /** Lance une run depuis le menu. */
  startRun(): void {
    this.training = false;
    this.audio.ensure();
    this.prepareRun();
    this.input.gameplayActive = true;
    this.input.reset();
    void this.lockPointer();
    if (DEBUG.skipIntro) this.setScreens(this.hud);
    else this.playIntro();
  }

  private cineCtx(): CineCtx {
    return { gp: this.gameplay, monster: this.ai.monster, director: this.director, sound: (n, x, y, z) => this.sound.cinema(n, x, y, z) };
  }

  private skipLabel(): string {
    return keyLabel(this.settings.data.bindings.skip[0] || this.settings.data.bindings.skip[1], this.settings.data.layout);
  }

  /** Entraînement : pas d'intro, pas de monstre, pas de limite de temps, rien n'est compté. */
  private startTraining(seed: string | null): void {
    this.training = true;
    this.trainingSeed = seed ? normalizeSeed(seed) || null : null;
    const unlocked = this.progression.isUnlocked("autopilot") || DEBUG.enabled;
    this.trainingAutopilot = unlocked ? (DEBUG.autopilot ?? this.settings.data.trainingAutopilot) : "off";
    this.audio.ensure();
    this.prepareRun();
    this.input.gameplayActive = true;
    this.input.reset();
    void this.lockPointer();
    this.setScreens(this.hud);
  }

  /** Intro (depuis le menu uniquement) : le chrono démarre à la frame où le joueur prend la main. */
  private playIntro(): void {
    this.state = "cinema";
    this.setScreens(this.cinema);
    this.director.play(introScript(this.cineCtx()), () => this.endIntro(), this.skipLabel());
  }

  private endIntro(): void {
    const sp = this.world.spawn;
    this.player.teleport(sp.x, sp.y, sp.z, sp.yaw);
    this.player.flashlight.setOn(true);
    this.state = "playing";
    this.pendingBegin = true;
    this.input.reset();
    this.setScreens(this.hud);
    if (!DEBUG.noPointerLock && !this.input.pointerLocked) this.pauseGame();
  }

  /** Remet le monde et le joueur à zéro ; la run démarrera à la frame suivante. */
  private prepareRun(): void {
    this.menuBg.hide();
    this.player.rig.overridden = false;
    const s = this.settings.data;
    // une seed rejouée est connue : elle compte comme « Set Seed » pour les records
    this.recordAbandon();
    if (this.training) {
      const seed = this.replaySeed ?? this.trainingSeed ?? randomSeed(CONFIG.run.seedLength);
      this.run.prepare({ seed, seedMode: this.replaySeed || this.trainingSeed ? "set" : "random", difficulty: s.difficulty, training: true });
    } else {
      const seedMode = this.replaySeed ? "set" : s.seedMode;
      this.run.prepare({ seed: this.nextSeed(), seedMode, difficulty: this.replayDifficulty ?? s.difficulty, training: false });
    }
    this.replaySeed = null;
    this.replayDifficulty = null;
    this.simLocked = false;
    this.autopilot.stop();
    this.runLog.reset();
    this.gameplay.reset();
    this.ai.reset(this.run.setup.difficulty, this.run.rng, performance.now());
    if (this.training) this.ai.disable();
    // entraînement avec pilote auto : les pièges armés sont des obstacles (il les contourne, comme
    // un joueur attentif) ; le monstre est absent, sa navigation n'est pas concernée
    for (let i = 0; i < CONFIG.autopilot.maxTraps; i++) this.ai.nav.unblock(`trap_${i}`);
    if (this.training && this.trainingAutopilot !== "off") {
      this.gameplay.traps.armedSpots().forEach((t, i) => this.ai.nav.block(`trap_${i}`, t.x, t.y + 0.3, t.z, 0.45, 0.3, 0.45));
    }
    this.hud.setMode(this.training ? "ENTRAÎNEMENT" : null);
    this.lights.reset();
    this.sound.reset();
    this.audio.setPaused(false);
    this.hud.clearCaptureFlash();
    this.danger = 0;
    this.hud.setDanger(0, 0);
    const sp = this.world.spawn;
    this.player.reset(sp.x, sp.y, sp.z, sp.yaw);
    this.player.controlEnabled = false;
    this.restartHeld = 0;
    this.hud.restartRing.set(0);
    this.hud.clearSplit();
    this.hud.setTimer(0, false);
    this.state = "playing";
    this.pendingBegin = true;
    this.autopilotRun = null;
    this.hud.autopilot.planning(false);
    if (this.training && this.trainingAutopilot !== "off") {
      // la route est calculée avant le départ du chrono (message affiché d'abord)
      this.planPending = 2;
      this.hud.autopilot.planning(true);
    } else this.planPending = 0;
  }

  /** Pilote auto : calcule la route de la seed et prend les commandes. */
  private startAutopilot(): void {
    const mode = this.trainingAutopilot;
    const route = mode === "off" ? null : new RoutePlanner(this.gameplay, this.ai.nav).plan(mode === "best" ? undefined : mode);
    this.hud.autopilot.planning(false);
    if (!route) {
      this.hud.toast("Pilote auto : aucune route trouvée pour cette seed. À toi de jouer !", 4);
      return;
    }
    this.autopilot.start(route);
    this.autopilotRun = { exit: EXIT_NAMES[route.exit], theoretical: route.theoretical };
  }

  /** Restart instantané (touche R) : pas de rechargement, pas d'intro, nouvelle seed en mode Random. */
  restartRun(): void {
    this.prepareRun();
  }

  /** Historique : une run relancée ou quittée en cours de route compte comme abandonnée. */
  private recordAbandon(): void {
    if (!this.run.running || this.run.setup.training) return;
    const t = this.run.elapsed(performance.now());
    if (t < CONFIG.history.abandonAfter * 1000) return;
    this.pushHistory("abandoned", t, "", "", null, null);
    this.run.status = "failed";
  }

  private pushHistory(outcome: HistoryOutcome, ms: number, exitId: string, exitLabel: string, grade: RunResult["grade"], cause: CauseKey | null): void {
    const st = this.run.setup;
    this.history.add({ date: Date.now(), seed: st.seed, seedMode: st.seedMode, difficulty: st.difficulty, outcome, ms, exitId, exitLabel, grade, cause, splits: this.run.splits.length });
  }

  /** Rejoue une seed de l'historique (depuis les records : avec l'intro, comme une run normale). */
  private replayFromHistory(seed: string, difficulty: Difficulty): void {
    this.training = false;
    this.replaySeed = seed;
    this.replayDifficulty = difficulty;
    this.recordsMenu.unmount();
    this.startRun();
  }

  /** Recommence sur la seed de la run en cours / terminée. */
  private replayRun(): void {
    this.replaySeed = this.run.setup.seed;
    this.restartFromMenu();
  }

  private restartFromMenu(): void {
    this.prepareRun();
    this.setScreens(this.hud);
    this.input.gameplayActive = true;
    this.input.reset();
    void this.lockPointer();
  }

  /** Sortie franchie : chrono arrêté à cette frame, puis outro (passable), puis écran de fin. */
  finishRun(exitId: string, exitLabel: string): void {
    const p = this.player;
    this.runLog.add("exit", this.runTime(), p.x, p.y, p.z, exitLabel);
    const result = this.run.finish(exitId, exitLabel, this.frameNow);
    if (this.autopilot.active) this.autopilot.stop("done");
    this.ai.disable();
    this.player.controlEnabled = false;
    this.player.frozen = true;
    this.state = "cinema";
    this.setScreens(this.cinema);
    this.director.play(outroScript(exitId, this.cineCtx()), () => this.showResults(result), this.skipLabel());
  }

  private failRun(reason: "captured" | "timeout"): void {
    if (!this.run.running) return;
    const p = this.player;
    if (reason === "timeout") this.runLog.add("timeout", this.runTime(), p.x, p.y, p.z, "Temps écoulé");
    this.autopilot.stop();
    const result = this.run.fail(reason, this.frameNow);
    this.showResults(result);
  }

  private showResults(result: RunResult): void {
    this.state = "results";
    this.player.controlEnabled = false;
    this.input.gameplayActive = false;
    this.input.exitPointerLock();
    this.runMap ??= new RunMap(this.world.layout, this.world.index);
    const endT = result.timeMs / 1000;
    const training = result.setup.training;
    const recap = result.success || training ? null : buildRecap(this.runLog, result.failReason ?? "captured");
    let xp: XpGain | null = null;
    if (!training) {
      const outcome = result.success ? "escaped" : (result.failReason ?? "captured");
      this.pushHistory(outcome, result.timeMs, result.exitId, result.exitLabel, result.grade, recap?.cause ?? null);
      xp = this.progression.award(
        Progression.compute({ success: result.success, grade: result.grade, difficulty: result.setup.difficulty, runSeconds: result.timeMs / 1000, reason: outcome }),
      );
    }
    this.results.show(result, {
      recap,
      map: this.runLog.player.length > 1 ? this.runMap.build(this.runLog, endT) : null,
      xp,
      training,
      autopilot: training ? this.autopilotRun : null,
    });
    this.setScreens(this.results);
  }

  private async lockPointer(): Promise<boolean> {
    if (DEBUG.noPointerLock) return true;
    return this.input.requestPointerLock();
  }

  pauseGame(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.audio.setPaused(true);
    this.run.pause(performance.now());
    this.player.controlEnabled = false;
    this.input.gameplayActive = false;
    this.input.exitPointerLock();
    const s = this.run.setup;
    this.pause.setInfo([
      `Seed ${s.seed} · ${s.seedMode === "random" ? "Random" : "Set Seed"}`,
      `Difficulté : ${DIFFICULTY_INFO[s.difficulty].name}`,
      s.training ? "Entraînement — rien n'est compté." : "Le chrono est arrêté.",
    ]);
    this.pause.setAutopilot(this.autopilot.active);
    this.setScreens(this.pause);
  }

  async resumeGame(): Promise<void> {
    if (this.state !== "paused") return;
    const ok = await this.lockPointer();
    if (!ok) return; // le navigateur refuse (délai après Échap) : on reste en pause
    this.state = "playing";
    this.audio.setPaused(false);
    this.run.resume(performance.now());
    this.player.controlEnabled = !this.pendingBegin;
    this.input.gameplayActive = true;
    this.input.reset();
    this.setScreens(this.hud);
  }

  private onPointerLock(locked: boolean): void {
    if (!locked && this.state === "playing" && !DEBUG.noPointerLock) this.pauseGame();
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (this.input.capturing) return;
    if (e.code === "Escape") {
      if (this.brightness.isMounted) this.closeBrightness(this.settings.data.brightness);
      else if (this.options.isMounted) this.closeOptions();
      else if (this.recordsMenu.isMounted) this.recordsMenu.onClose();
      else if (this.state === "playing") this.pauseGame();
      else if (this.state === "paused") void this.resumeGame();
      return;
    }
    if (this.state === "results" && !e.repeat) {
      const b = this.settings.data.bindings.restart;
      if (e.code === b[0] || e.code === b[1]) this.restartFromMenu();
    }
  }

  /** Tests : calcule la route du pilote auto pour la seed en cours (résumé texte). */
  debugRoute(only?: RouteExit): string {
    const planner = new RoutePlanner(this.gameplay, this.ai.nav);
    (window as unknown as { __planner: RoutePlanner }).__planner = planner;
    const r = planner.plan(only);
    if (!r) return "aucune route";
    const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
    return `${r.exit} théorique ${fmt(r.theoretical)} (${Math.round(r.ms)} ms, ${r.nodes.length} points)\n` + r.steps.map((st, i) => `${i + 1}. ${fmt(st.at)} ${st.task.kind} ${st.task.label}${st.drop ? ` (laisse ${st.drop})` : ""} — ${st.task.place} [${st.leg.length.toFixed(0)} m${st.leg.nodes.length > 2 ? ", via " + st.leg.nodes.slice(1, -1).map((n) => r.nodes[n]!.label).join(" > ") : ""}]`).join("\n");
  }

  /**
   * Tests : ne fait plus avancer le jeu que par `debugSimulate` — les frames réelles se contentent
   * du rendu et le chrono est gelé entre deux simulations (il ne compte que le temps simulé).
   */
  debugSimLock(on: boolean): void {
    if (on === this.simLocked) return;
    this.simLocked = on;
    if (on) this.run.pause(performance.now());
    else this.run.resume(performance.now());
  }

  /** Tests : lance le pilote auto sur la run en cours (route calculée maintenant). */
  debugAutopilot(only?: RouteExit): string {
    const r = new RoutePlanner(this.gameplay, this.ai.nav).plan(only);
    if (!r) return "aucune route";
    this.autopilot.start(r);
    return `${r.exit} ${r.theoretical.toFixed(1)} s, ${r.steps.length} étapes`;
  }

  /** Tests automatisés : simule `seconds` de jeu à 60 Hz avec des touches maintenues. */
  debugSimulate(seconds: number, codes: string[] = []): string {
    for (const c of codes) this.input.debugHold(c, true);
    const steps = Math.round(seconds * 60);
    // horloge de jeu monotone d'un appel à l'autre (délais en ms : claviers, portes…)
    this.simClock = Math.max(this.simClock, performance.now());
    const t0 = this.simClock;
    const real0 = performance.now();
    this.simClock += steps * (1000 / 60);
    for (let i = 0; i < steps; i++) {
      if (this.state === "playing") this.autopilot.update(1 / 60);
      this.player.look(this.input);
      this.player.update(1 / 60, this.input);
      if (this.state === "playing") this.gameplay.update(1 / 60, t0 + (i * 1000) / 60, this.input);
      if (this.state === "playing" && this.run.running) {
        const t = this.run.elapsed(real0) / 1000;
        this.simTime = t;
        this.ai.update(1 / 60, t0 + (i * 1000) / 60, t, this.run.lockdown);
        const m = this.ai.monster;
        this.runLog.sample(1 / 60, t, this.player.x, this.player.y, this.player.z, m.enabled ? m.pos : null);
      }
      // caméra à jour à chaque pas : la visée (interactions, pilote auto) part de l'œil
      this.player.updateView(1 / 60);
      this.input.endFrame();
      // le chrono avance pas à pas : une sortie franchie en cours de simulation s'arrête au bon temps
      this.run.timer.debugAdvance(1000 / 60);
    }
    this.simTime = null;
    this.player.updateView(1 / 60);
    for (const c of codes) this.input.debugHold(c, false);
    const p = this.player;
    return [p.x, p.y, p.z].map((v) => v.toFixed(2)).join(",");
  }

  // ------------------------------------------------------------------ boucle

  private frame(): void {
    const now = performance.now();
    this.frameNow = now;
    let dt = (now - this.lastFrame) / 1000;
    const rawDt = dt;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    let render = true;
    switch (this.state) {
      case "playing":
        if (!this.simLocked) this.updatePlaying(dt, now);
        break;
      case "menu":
        this.updateMenu(dt);
        break;
      case "cinema":
        this.director.update(dt, this.input);
        this.gameplay.cinemaUpdate(dt, now);
        break;
      case "paused":
      case "results":
        render = false; // écran opaque : inutile de rendre la scène
        break;
      default:
        break;
    }
    if (render) {
      this.updateVisibility(dt);
      this.lights.update(dt);
      this.world.emissive.update();
      const cam = this.player.rig.camera.position;
      this.world.props.update(dt, cam.x, cam.y, cam.z);
      this.renderer.scene.render();
      this.dynRes.update(rawDt);
      if (this.refreezeFrames > 0 && --this.refreezeFrames === 0) this.materials.freezeAll();
    } else this.dynRes.restart();
    this.sound.update(dt, this.state as SoundMode, this.player.rig.camera, this.camRoom);
    this.camRoom = undefined;
    this.fps.tick(dt);
    this.input.endFrame();
  }

  /** Zone de la caméra, culling par portails, brouillard, ombres de la lampe. */
  private updateVisibility(dt: number): void {
    const cam = this.player.rig.camera;
    const p = cam.position;
    // en jeu : zone des pieds du joueur (la caméra peut être très basse — sous un lit — ou dans un meuble)
    const refY = this.state === "playing" ? this.player.y + 0.4 : p.y - 1.2;
    const room = this.world.roomAt(p.x, refY, p.z);
    this.camRoom = room;
    const zone = room ? room.id : "ext";
    this.culling.update(cam, zone);
    this.atmosphere.update(dt, !room || room.kind === "outdoor");
    if (!this.casterKey) {
      this.casterKey = "set";
      this.player.flashlight.setCasters([...this.world.props.shadowCasters(), this.ai.monster.mesh]);
    }
  }

  private updatePlaying(dt: number, now: number): void {
    const p = this.player;
    if (this.planPending > 0) {
      // calcul de la route pendant l'écran figé : le chrono démarre à la frame suivante
      if (--this.planPending === 0) this.startAutopilot();
      return;
    }
    if (this.pendingBegin) {
      // prise de contrôle ET départ du chrono exactement à cette frame
      this.pendingBegin = false;
      p.controlEnabled = true;
      this.run.begin(now);
      this.input.consumeMouse({ x: 0, y: 0 });
    }
    this.autopilot.update(dt);
    p.look(this.input);
    p.update(dt, this.input);
    this.gameplay.update(dt, now, this.input);
    this.hud.autopilot.update(this.autopilot.status, "Échap");
    if (this.state !== "playing") return;
    if (this.run.running) {
      const t = this.run.elapsed(now) / 1000;
      this.ai.update(dt, now, t, this.run.lockdown);
      const m = this.ai.monster;
      this.runLog.sample(dt, t, p.x, p.y, p.z, m.enabled ? m.pos : null);
      this.updateDanger(dt);
    }
    if (this.state !== "playing") return;

    // restart instantané (maintien)
    if (this.input.isDown("restart")) {
      this.restartHeld += dt;
      this.hud.restartRing.set(this.restartHeld / CONFIG.input.restartHold);
      if (this.restartHeld >= CONFIG.input.restartHold) {
        this.restartRun();
        return;
      }
    } else if (this.restartHeld > 0) {
      this.restartHeld = 0;
      this.hud.restartRing.set(0);
    }

    this.run.update(now);
    if (this.state !== "playing") return;
    p.updateView(dt);
    this.gameplay.lateUpdate();
    this.hud.setTimer(this.run.elapsed(now), this.run.lockdown);
    this.hud.setSprint(p.stamina.value, p.stamina.state, p.stamina.deniedFlash > 0, dt);
  }

  /** Retour visuel du repérage : monte vite quand il te voit, retombe lentement. */
  private updateDanger(dt: number): void {
    const m = this.ai.monster;
    let target = 0;
    if (m.enabled && m.state !== "capture") {
      if (m.seesPlayer) target = m.state === "chase" ? CONFIG.danger.chaseSeen : Math.min(1, m.awareness);
      else if (m.state === "chase") target = CONFIG.danger.chaseHidden;
    }
    const rate = target > this.danger ? CONFIG.danger.rise : CONFIG.danger.fall;
    this.danger += (target - this.danger) * Math.min(1, dt * rate);
    this.hud.setDanger(this.danger * CONFIG.danger.max, dt);
  }

  private updateMenu(dt: number): void {
    // fond animé : travellings lents dans l'hôpital
    this.menuBg.update(dt, this.player.rig);
    this.player.flashlight.setOn(false);
    this.player.flashlight.update(dt);
  }

}
