import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG } from "../config";
import { Renderer } from "../render/Renderer";
import { CollisionWorld } from "../physics/CollisionWorld";
import { Player } from "../player/Player";
import { World } from "../world/World";
import { MaterialLibrary } from "../render/materials/MaterialLibrary";
import { LightAnimator } from "../render/LightAnimator";
import { Sky } from "../render/Sky";
import { Atmosphere } from "../render/Atmosphere";
import { ZoneCulling } from "../render/ZoneCulling";
import { MenuBackground } from "../ui/MenuBackground";
import { RunManager, type RunResult } from "../run/RunManager";
import { HUD } from "../ui/HUD";
import { LoadingScreen } from "../ui/LoadingScreen";
import { MainMenu, DIFFICULTY_INFO } from "../ui/MainMenu";
import { OptionsMenu } from "../ui/OptionsMenu";
import { PauseMenu } from "../ui/PauseMenu";
import { ResultsScreen } from "../ui/ResultsScreen";
import { RecordsMenu } from "../ui/RecordsMenu";
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
import { Settings, type SettingsData } from "./Settings";

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
  player!: Player;
  world!: World;
  gameplay!: Gameplay;
  ai!: AiSystem;
  readonly audio = new AudioEngine();
  private cinema!: CinemaOverlay;
  director!: Director;
  sound!: SoundDirector;
  /** pièce de la caméra (culling, acoustique) ; undefined = non recalculée cette frame */
  private camRoom: RoomDef | null | undefined = undefined;
  culling!: ZoneCulling;
  atmosphere!: Atmosphere;
  private casterKey = "";
  private menuBg!: MenuBackground;
  private fadeEl = h("div", { class: "fade" });
  materials!: MaterialLibrary;

  state: AppState = "loading";
  private uiRoot: HTMLElement;
  private loading = new LoadingScreen();
  private menu!: MainMenu;
  private options!: OptionsMenu;
  private pause!: PauseMenu;
  private results!: ResultsScreen;
  private recordsMenu!: RecordsMenu;
  private hud = new HUD();
  private fps!: FpsCounter;
  private lastFrame = performance.now();
  private frameNow = performance.now();
  private restartHeld = 0;
  private optionsReturn: AppState = "menu";
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
    this.run.on("split", (s) => this.hud.showSplit(s));
    this.run.on("lockdown", () => {
      this.hud.toast("CONFINEMENT — l'hôpital se verrouille", 3.5);
      this.lights.lockdownTarget = 1;
      this.sound.startLockdown();
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
    this.renderer.engine.runRenderLoop(() => this.frame());

    if (DEBUG.enabled) (window as unknown as { __game: App }).__game = this;
    if (DEBUG.autostart) this.startRun();
  }

  // ------------------------------------------------------------------ chargement

  private checkEngine(): void {
    if (!this.renderer.isWebGL2) console.warn("WebGL2 indisponible : repli WebGL1 (rendu dégradé).");
  }

  private buildLevel(): void {
    const preset = CONFIG.graphics.presets[this.settings.data.graphics];
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
    const p = CONFIG.graphics.presets[this.settings.data.graphics];
    this.player.flashlight.configureShadows(p.shadowMapSize, p.shadowFilter);
    this.player.flashlight.setCasters([]);
    this.renderer.scene.activeCamera = this.player.rig.camera;
  }

  private createUI(): void {
    this.menu = new MainMenu(this.settings, {
      play: () => this.startRun(),
      records: () => this.openRecords(),
      options: () => this.openOptions("menu"),
      quit: () => this.quit(),
    });
    this.options = new OptionsMenu(this.settings, this.input);
    this.options.onClose = () => this.closeOptions();
    this.recordsMenu = new RecordsMenu(this.run.records);
    this.recordsMenu.onClose = () => {
      this.recordsMenu.unmount();
      if (this.state === "menu") this.menu.mount(this.uiRoot);
    };
    this.pause = new PauseMenu({
      resume: () => void this.resumeGame(),
      restart: () => this.restartFromMenu(),
      options: () => this.openOptions("paused"),
      quitToMenu: () => this.goMenu(),
    });
    this.results = new ResultsScreen({
      restart: () => this.restartFromMenu(),
      menu: () => this.goMenu(),
    });
    this.cinema = new CinemaOverlay(this.audio);
    this.director = new Director(this.cinema, this.player);
    this.fps = new FpsCounter(this.renderer.scene, this.renderer.engine);
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
    const preset = CONFIG.graphics.presets[s.graphics];
    this.renderer.setRenderScale(preset.renderScale);
    const sg = this.player.flashlight.shadows;
    if (!sg || sg.getShadowMap()?.getSize().width !== preset.shadowMapSize) {
      this.player.flashlight.configureShadows(preset.shadowMapSize, preset.shadowFilter);
      this.player.flashlight.setCasters([]);
    }
    this.fps.setVisible(s.showFps || DEBUG.enabled);
    this.audio.setVolumes(s.volumeMaster, s.volumeMusic, s.volumeSfx);
  }

  // ------------------------------------------------------------------ écrans

  private setScreens(...screens: Array<{ mount(p: HTMLElement): void; unmount(): void }>): void {
    for (const s of [this.menu, this.options, this.pause, this.hud, this.results, this.recordsMenu, this.cinema]) {
      if (!screens.includes(s)) s.unmount();
    }
    for (const s of screens) s.mount(this.uiRoot);
  }

  goMenu(): void {
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

  /** Seed de la prochaine run selon le mode choisi. */
  private nextSeed(): string {
    const s = this.settings.data;
    if (DEBUG.seed) return normalizeSeed(DEBUG.seed);
    if (s.seedMode === "set") {
      const seed = normalizeSeed(s.setSeed);
      if (seed) return seed;
    }
    return randomSeed(CONFIG.run.seedLength);
  }

  /** Lance une run depuis le menu. */
  startRun(): void {
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
    this.run.prepare({ seed: this.nextSeed(), seedMode: s.seedMode, difficulty: s.difficulty });
    this.gameplay.reset();
    this.ai.reset(s.difficulty, this.run.rng, performance.now());
    this.lights.reset();
    this.sound.reset();
    this.audio.setPaused(false);
    this.hud.clearCaptureFlash();
    const sp = this.world.spawn;
    this.player.reset(sp.x, sp.y, sp.z, sp.yaw);
    this.player.controlEnabled = false;
    this.restartHeld = 0;
    this.hud.restartRing.set(0);
    this.hud.clearSplit();
    this.hud.setTimer(0, false);
    this.state = "playing";
    this.pendingBegin = true;
  }

  /** Restart instantané (touche R) : pas de rechargement, pas d'intro, nouvelle seed en mode Random. */
  restartRun(): void {
    this.prepareRun();
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
    const result = this.run.finish(exitId, exitLabel, this.frameNow);
    this.ai.disable();
    this.player.controlEnabled = false;
    this.player.frozen = true;
    this.state = "cinema";
    this.setScreens(this.cinema);
    this.director.play(outroScript(exitId, this.cineCtx()), () => this.showResults(result), this.skipLabel());
  }

  private failRun(reason: "captured" | "timeout"): void {
    if (!this.run.running) return;
    const result = this.run.fail(reason, this.frameNow);
    this.showResults(result);
  }

  private showResults(result: RunResult): void {
    this.state = "results";
    this.player.controlEnabled = false;
    this.input.gameplayActive = false;
    this.input.exitPointerLock();
    this.results.show(result);
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
      "Le chrono est arrêté.",
    ]);
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
      if (this.options.isMounted) this.closeOptions();
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

  /** Tests automatisés : simule `seconds` de jeu à 60 Hz avec des touches maintenues. */
  debugSimulate(seconds: number, codes: string[] = []): string {
    for (const c of codes) this.input.debugHold(c, true);
    const steps = Math.round(seconds * 60);
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      this.player.look(this.input);
      this.player.update(1 / 60, this.input);
      if (this.state === "playing") this.gameplay.update(1 / 60, t0 + (i * 1000) / 60, this.input);
      if (this.state === "playing" && this.run.running) this.ai.update(1 / 60, t0 + (i * 1000) / 60, this.run.elapsed(t0) / 1000 + i / 60, this.run.lockdown);
      this.input.endFrame();
    }
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
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    let render = true;
    switch (this.state) {
      case "playing":
        this.updatePlaying(dt, now);
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
    }
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
    if (this.pendingBegin) {
      // prise de contrôle ET départ du chrono exactement à cette frame
      this.pendingBegin = false;
      p.controlEnabled = true;
      this.run.begin(now);
      this.input.consumeMouse({ x: 0, y: 0 });
    }
    p.look(this.input);
    p.update(dt, this.input);
    this.gameplay.update(dt, now, this.input);
    if (this.state !== "playing") return;
    if (this.run.running) this.ai.update(dt, now, this.run.elapsed(now) / 1000, this.run.lockdown);
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

  private updateMenu(dt: number): void {
    // fond animé : travellings lents dans l'hôpital
    this.menuBg.update(dt, this.player.rig);
    this.player.flashlight.setOn(false);
    this.player.flashlight.update(dt);
  }

}
