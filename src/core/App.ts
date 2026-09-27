import { CONFIG } from "../config";
import { Renderer } from "../render/Renderer";
import { CollisionWorld } from "../physics/CollisionWorld";
import { Player } from "../player/Player";
import { TestLevel } from "../world/TestLevel";
import { HUD } from "../ui/HUD";
import { LoadingScreen } from "../ui/LoadingScreen";
import { MainMenu } from "../ui/MainMenu";
import { OptionsMenu } from "../ui/OptionsMenu";
import { PauseMenu } from "../ui/PauseMenu";
import { FpsCounter } from "../ui/FpsCounter";
import { h } from "../ui/dom";
import { DEBUG } from "./Debug";
import { Input } from "./Input";
import { detectKeyboardLayout } from "./KeyBindings";
import { Settings, type SettingsData } from "./Settings";

type AppState = "loading" | "menu" | "playing" | "paused";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Application : machine à états (chargement → menu → jeu ⇄ pause…), boucle de rendu,
 * câblage des systèmes.
 */
export class App {
  readonly settings = new Settings();
  readonly renderer: Renderer;
  readonly input: Input;
  readonly world = new CollisionWorld();
  player!: Player;
  level!: TestLevel;

  private state: AppState = "loading";
  private uiRoot: HTMLElement;
  private loading = new LoadingScreen();
  private menu!: MainMenu;
  private options!: OptionsMenu;
  private pause!: PauseMenu;
  private hud = new HUD();
  private fps!: FpsCounter;
  private lastFrame = performance.now();
  private restartHeld = 0;
  private menuTime = 0;
  private optionsReturn: AppState = "menu";

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas, this.settings.data.bindings);
    this.loading.mount(uiRoot);
  }

  async init(): Promise<void> {
    const steps: Array<[string, () => void | Promise<void>]> = [
      ["Vérification du moteur…", () => this.checkEngine()],
      ["Construction du niveau…", () => this.buildLevel()],
      ["Préparation du joueur…", () => this.createPlayer()],
      ["Interface…", () => this.createUI()],
      ["Compilation des shaders…", () => this.warmup()],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [label, fn] = steps[i]!;
      this.loading.setProgress(i / steps.length, label);
      await nextFrame();
      await fn();
    }
    this.loading.setProgress(1, "Prêt.");
    await nextFrame();

    detectKeyboardLayout().then((layout) => {
      // première ouverture : on aligne l'affichage sur le clavier détecté
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

    this.loading.unmount();
    this.goMenu();
    this.renderer.engine.runRenderLoop(() => this.frame());

    if (DEBUG.enabled) (window as unknown as { __game: App }).__game = this;
    if (DEBUG.autostart) this.startRun();
  }

  // ------------------------------------------------------------------ chargement

  private checkEngine(): void {
    if (!this.renderer.isWebGL2) {
      console.warn("WebGL2 indisponible : repli WebGL1 (rendu dégradé).");
    }
  }

  private buildLevel(): void {
    this.level = new TestLevel(this.renderer.scene, this.world);
  }

  private createPlayer(): void {
    this.player = new Player(this.renderer.scene, this.world);
    const p = CONFIG.graphics.presets[this.settings.data.graphics];
    this.player.flashlight.configureShadows(p.shadowMapSize, p.shadowFilter);
    this.player.flashlight.setCasters(this.level.casters);
    this.renderer.scene.activeCamera = this.player.rig.camera;
  }

  private createUI(): void {
    this.menu = new MainMenu(this.settings, {
      play: () => this.startRun(),
      records: () => this.hud.toast("Records : phase 2"),
      options: () => this.openOptions("menu"),
      quit: () => this.quit(),
    });
    this.options = new OptionsMenu(this.settings, this.input);
    this.options.onClose = () => this.closeOptions();
    this.pause = new PauseMenu({
      resume: () => void this.resumeGame(),
      restart: () => {
        this.restartRun();
        void this.resumeGame();
      },
      options: () => this.openOptions("paused"),
      quitToMenu: () => this.goMenu(),
    });
    this.fps = new FpsCounter(this.renderer.scene, this.renderer.engine);
    this.uiRoot.appendChild(this.fps.el);
  }

  private async warmup(): Promise<void> {
    // un rendu pour compiler les shaders pendant l'écran de chargement
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
    }
    this.fps.setVisible(s.showFps || DEBUG.enabled);
  }

  // ------------------------------------------------------------------ états

  private setScreens(...screens: Array<{ mount(p: HTMLElement): void; unmount(): void }>): void {
    for (const s of [this.menu, this.options, this.pause, this.hud]) {
      if (!screens.includes(s)) s.unmount();
    }
    for (const s of screens) s.mount(this.uiRoot);
  }

  goMenu(): void {
    this.state = "menu";
    this.input.gameplayActive = false;
    this.input.exitPointerLock();
    this.player.controlEnabled = false;
    this.setScreens(this.menu);
  }

  startRun(): void {
    this.restartRun();
    this.setScreens(this.hud);
    this.state = "playing";
    this.input.gameplayActive = true;
    this.input.reset();
    void this.lockPointer();
  }

  /** Relance instantanée (touche R) : pas de rechargement, pas d'intro. */
  restartRun(): void {
    const s = this.level.spawn;
    this.player.reset(s.x, s.y, s.z, s.yaw);
    this.player.controlEnabled = true;
    this.restartHeld = 0;
    this.hud.restartRing.set(0);
  }

  private async lockPointer(): Promise<boolean> {
    if (DEBUG.noPointerLock) return true;
    const ok = await this.input.requestPointerLock();
    return ok;
  }

  pauseGame(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.player.controlEnabled = false;
    this.input.gameplayActive = false;
    this.input.exitPointerLock();
    this.pause.setInfo([`Difficulté : ${this.settings.data.difficulty}`]);
    this.setScreens(this.pause);
  }

  async resumeGame(): Promise<void> {
    if (this.state !== "paused") return;
    const ok = await this.lockPointer();
    if (!ok) return; // le navigateur refuse (délai après Échap) : on reste en pause
    this.state = "playing";
    this.player.controlEnabled = true;
    this.input.gameplayActive = true;
    this.input.reset();
    this.setScreens(this.hud);
  }

  private onPointerLock(locked: boolean): void {
    if (!locked && this.state === "playing" && !DEBUG.noPointerLock) this.pauseGame();
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (e.code !== "Escape" || this.input.capturing) return;
    if (this.options.isMounted) {
      this.closeOptions();
    } else if (this.state === "playing") {
      this.pauseGame();
    } else if (this.state === "paused") {
      void this.resumeGame();
    }
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
    // si l'onglet n'a pas été ouvert par script, on ne peut pas le fermer
    this.uiRoot.append(
      h(
        "div",
        { class: "screen pause-screen" },
        h("div", { class: "pause-box" }, h("h1", { class: "pause-title" }, "À bientôt."), h("div", { class: "pause-info" }, "Tu peux fermer cet onglet.")),
      ),
    );
    this.renderer.engine.stopRenderLoop();
  }

  // ------------------------------------------------------------------ boucle

  private frame(): void {
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    let render = true;
    switch (this.state) {
      case "playing":
        this.updatePlaying(dt);
        break;
      case "menu":
        this.updateMenu(dt);
        break;
      case "paused":
        render = false; // écran masqué : inutile de rendre la scène
        break;
      default:
        break;
    }
    if (render) this.renderer.scene.render();
    this.fps.tick(dt);
    this.input.endFrame();
  }

  private updatePlaying(dt: number): void {
    const p = this.player;
    p.look(this.input);
    p.update(dt, this.input);

    // restart instantané (maintien)
    if (this.input.isDown("restart")) {
      this.restartHeld += dt;
      this.hud.restartRing.set(this.restartHeld / CONFIG.input.restartHold);
      if (this.restartHeld >= CONFIG.input.restartHold) this.restartRun();
    } else if (this.restartHeld > 0) {
      this.restartHeld = 0;
      this.hud.restartRing.set(0);
    }

    p.updateView(dt);
    this.hud.setSprint(p.stamina.value, p.stamina.state, p.stamina.deniedFlash > 0, dt);
  }

  private updateMenu(dt: number): void {
    // fond animé : lente orbite (sera remplacé par un travelling dans l'hôpital)
    this.menuTime += dt;
    const t = this.menuTime * 0.05;
    const rig = this.player.rig;
    rig.overridden = true;
    rig.camera.position.set(Math.sin(t) * 9, 2.2 + Math.sin(t * 1.7) * 0.2, Math.cos(t) * 9);
    rig.camera.rotation.set(0.12, t + Math.PI, 0);
    rig.overridden = false;
    this.player.flashlight.update(dt);
  }
}
