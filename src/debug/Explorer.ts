import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG } from "../config";
import { DEBUG } from "../core/Debug";
import { Input } from "../core/Input";
import { Settings } from "../core/Settings";
import { CollisionWorld } from "../physics/CollisionWorld";
import { Player } from "../player/Player";
import { Atmosphere } from "../render/Atmosphere";
import { LightAnimator } from "../render/LightAnimator";
import { MaterialLibrary } from "../render/materials/MaterialLibrary";
import { PostFx } from "../render/PostFx";
import { Renderer } from "../render/Renderer";
import { Sky } from "../render/Sky";
import { ZoneCulling } from "../render/ZoneCulling";
import type { HospitalLayout } from "../world/layout/types";
import { World } from "../world/World";

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Visite libre d'une carte (URL `?explore=mall`) : le monde complet (géométrie, décor, éclairage
 * précalculé, culling) sans gameplay ni monstre. Marche normale, ou vol libre (touche V) ;
 * `window.__explore` permet de placer la caméra (captures automatisées).
 */
export class Explorer {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly settings = new Settings();
  private readonly collision = new CollisionWorld();
  private readonly lights = new LightAnimator();
  private world!: World;
  private player!: Player;
  private culling!: ZoneCulling;
  private atmosphere!: Atmosphere;
  private fly = false;
  private last = performance.now();
  private readonly label: HTMLDivElement;
  /** caméra imposée (captures) : la boucle ne la déplace plus */
  private pinned = false;

  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    private readonly layout: HospitalLayout,
  ) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas, this.settings.data.bindings);
    this.label = document.createElement("div");
    this.label.style.cssText = "position:fixed;left:12px;top:10px;color:#e8dcc0;font:13px monospace;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre";
    uiRoot.appendChild(this.label);
    canvas.addEventListener("click", () => {
      if (!DEBUG.noPointerLock) void canvas.requestPointerLock();
    });
  }

  async init(): Promise<void> {
    const t0 = performance.now();
    const say = async (t: string) => {
      this.label.textContent = t;
      await nextFrame();
    };
    await say("Plans…");
    const preset = CONFIG.graphics.presets[DEBUG.preset === "low" || DEBUG.preset === "medium" || DEBUG.preset === "high" ? DEBUG.preset : this.settings.data.graphics];
    const materials = new MaterialLibrary(this.renderer.scene, preset.textureSize, preset.maxAniso);
    this.world = new World(this.renderer.scene, this.collision, materials, this.layout);
    if (this.world.index.errors.length) console.warn("Erreurs de plan :", this.world.index.errors);
    this.world.buildGeometry();
    await say("Textures…");
    await this.world.generateMaterials(async (p, l) => say(`Textures… ${Math.round(p * 100)} % ${l}`));
    await say("Éclairage précalculé…");
    const tb = performance.now();
    await this.world.bakeLighting(async (p, l) => say(`Éclairage… ${Math.round(p * 100)} % ${l}`));
    console.info(`Bake : ${Math.round(performance.now() - tb)} ms`);
    this.world.createMeshes();
    new Sky(this.renderer.scene, 2048);
    this.atmosphere = new Atmosphere(this.renderer.scene);
    this.culling = new ZoneCulling(this.world.zones, this.world.zoneMeshes, this.world.props);
    this.culling.enabled = !DEBUG.noCull;
    this.player = new Player(this.renderer.scene, this.collision);
    new PostFx(this.renderer.scene, this.player.rig.camera, this.renderer.isWebGL2);
    this.player.flashlight.configureShadows(preset.shadowMapSize, preset.shadowFilter);
    this.player.flashlight.setCasters(this.world.props.shadowCasters());
    this.renderer.scene.activeCamera = this.player.rig.camera;
    const s = this.layout.spawn;
    this.player.reset(s.x, s.y, s.z, s.yaw);
    this.player.controlEnabled = true;
    if (DEBUG.bright) {
      const hemi = new HemisphericLight("debugHemi", new Vector3(0.3, 1, 0.2), this.renderer.scene);
      hemi.intensity = 2.2;
      hemi.groundColor = new Color3(0.5, 0.5, 0.5);
    }
    materials.freezeAll();
    console.info("Monde :", this.world.stats(), `· chargement ${Math.round(performance.now() - t0)} ms`);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyV") this.fly = !this.fly;
    });
    (window as unknown as { __explore: unknown }).__explore = {
      world: this.world,
      player: this.player,
      culling: this.culling,
      /** place la caméra (x, y = hauteur de l'œil, z, cap, tangage) et fige la boucle */
      view: (x: number, y: number, z: number, yaw: number, pitch = 0) => {
        this.pinned = true;
        const cam = this.player.rig.camera;
        this.player.rig.overridden = true;
        cam.position.set(x, y, z);
        cam.rotation.set(pitch, yaw, 0);
      },
      /** place le joueur debout (la boucle reprend la main) */
      walk: (x: number, y: number, z: number, yaw: number) => {
        this.pinned = false;
        this.player.rig.overridden = false;
        this.player.reset(x, y, z, yaw);
        this.player.controlEnabled = true;
      },
      lamp: (on: boolean) => this.player.flashlight.setOn(on),
      ready: true,
    };
    this.renderer.engine.runRenderLoop(() => this.frame());
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const p = this.player;
    if (!this.pinned) {
      if (this.fly) this.flyUpdate(dt);
      else {
        p.look(this.input);
        p.update(dt, this.input);
      }
    }
    const cam = p.rig.camera;
    const refY = this.pinned || this.fly ? cam.position.y - 1.2 : p.y + 0.4;
    const room = this.world.roomAt(cam.position.x, refY, cam.position.z);
    this.culling.update(cam, room ? room.id : "ext");
    this.atmosphere.update(dt, !room || room.kind === "outdoor");
    this.lights.update(dt);
    this.world.emissive.update();
    this.world.props.update(dt, cam.position.x, cam.position.y, cam.position.z);
    this.renderer.scene.render();
    this.label.textContent = `${this.layout.id} · ${room ? room.name : "extérieur"} (${room?.floor ?? "-"}) · ${cam.position.x.toFixed(1)}, ${cam.position.y.toFixed(1)}, ${cam.position.z.toFixed(1)}${this.fly ? " · VOL (V)" : " · V : vol libre"}`;
    this.input.endFrame();
  }

  /** Vol libre : déplacement caméra sans collision (ZQSD/WASD, interaction / accroupi pour monter / descendre). */
  private flyUpdate(dt: number): void {
    const p = this.player;
    p.look(this.input);
    const rig = p.rig;
    rig.overridden = true;
    const cam = rig.camera;
    cam.rotation.set(rig.pitch, rig.yaw, 0);
    const sp = (this.input.isDown("sprint") ? 22 : 8) * dt;
    const fx = Math.sin(rig.yaw);
    const fz = Math.cos(rig.yaw);
    let mx = 0;
    let mz = 0;
    let my = 0;
    if (this.input.isDown("forward")) mz += 1;
    if (this.input.isDown("back")) mz -= 1;
    if (this.input.isDown("right")) mx += 1;
    if (this.input.isDown("left")) mx -= 1;
    if (this.input.isDown("interact")) my += 1;
    if (this.input.isDown("crouch")) my -= 1;
    cam.position.x += (fx * mz + fz * mx) * sp;
    cam.position.z += (fz * mz - fx * mx) * sp;
    cam.position.y += my * sp;
  }
}
