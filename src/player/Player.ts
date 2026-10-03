import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "../config";
import type { Input } from "../core/Input";
import { Emitter } from "../core/Events";
import { CollisionMask, type Surface } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";
import { CharacterMover, makeBody, type CharacterBody } from "../physics/CharacterMover";
import { CameraRig } from "./CameraRig";
import { Flashlight } from "./Flashlight";
import { Stamina } from "./Stamina";

export type MoveMode = "walk" | "sprint" | "crouch";

export interface FootstepEvent {
  x: number;
  y: number;
  z: number;
  surface: Surface;
  mode: MoveMode;
  /** rayon de bruit perçu par l'IA (m) */
  noiseRadius: number;
}

interface PlayerEvents {
  footstep: FootstepEvent;
  sprintStart: void;
  sprintEnd: void;
  flashlight: boolean;
  crouch: boolean;
}

/**
 * Joueur FPS : capsule + caméra + lampe + jauge de sprint.
 * La physique tourne en sous-pas (<= 1/120 s), la caméra est replacée à chaque frame.
 */
export class Player extends Emitter<PlayerEvents> {
  readonly body: CharacterBody;
  readonly mover: CharacterMover;
  readonly rig: CameraRig;
  readonly flashlight: Flashlight;
  readonly stamina = new Stamina();

  /** le joueur a le contrôle (sinon : cinématique, cachette, pause…) */
  controlEnabled = false;
  crouched = false;
  /** 0 = debout, 1 = accroupi (lissé) */
  crouchAmount = 0;
  private crouchHeld = false;
  private visualFeet = 0;
  private stepDistance = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private wasSprinting = false;
  /** vitesse horizontale actuelle (m/s) */
  speed = 0;
  /** multiplicateur de vitesse externe (pièges, capture…) */
  speedScale = 1;
  /** physique suspendue (cachette, enjambement, cinématique) : la position est pilotée de l'extérieur */
  frozen = false;
  /** mouvement souris de la frame (counts), même sans contrôle (vue limitée en cachette) */
  readonly mouse = { x: 0, y: 0 };

  constructor(scene: Scene, readonly world: CollisionWorld) {
    super();
    const p = CONFIG.player;
    this.body = makeBody(p.radius, p.standHeight);
    this.mover = new CharacterMover(world, CollisionMask.PLAYER);
    this.rig = new CameraRig(scene);
    this.flashlight = new Flashlight(scene, this.rig);
  }

  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }
  get z(): number {
    return this.body.z;
  }

  get moveMode(): MoveMode {
    if (this.crouched) return "crouch";
    if (this.stamina.sprinting) return "sprint";
    return "walk";
  }

  get eyeHeight(): number {
    const p = CONFIG.player;
    return p.eyeStand + (p.eyeCrouch - p.eyeStand) * this.crouchAmount;
  }

  /** Position de l'œil (sans balancement). */
  get eyeY(): number {
    return this.visualFeet + this.eyeHeight;
  }

  teleport(x: number, y: number, z: number, yaw: number, pitch = 0): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = b.vy = b.vz = 0;
    this.visualFeet = y;
    this.rig.yaw = yaw;
    this.rig.pitch = pitch;
    this.flashlight.snap();
  }

  /** Place le corps sans toucher à l'orientation de la vue (animations scriptées). */
  placeBody(x: number, y: number, z: number): void {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = b.vy = b.vz = 0;
    this.visualFeet = y;
  }

  /** Remise à zéro complète pour une nouvelle run. */
  reset(x: number, y: number, z: number, yaw: number): void {
    this.teleport(x, y, z, yaw);
    this.frozen = false;
    this.crouched = false;
    this.crouchHeld = false;
    this.crouchAmount = 0;
    this.body.height = CONFIG.player.standHeight;
    this.stamina.reset();
    this.stepDistance = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.speed = 0;
    this.speedScale = 1;
    this.wasSprinting = false;
    this.flashlight.setOn(true);
    this.rig.setFovKick(0);
    this.rig.roll = 0;
    this.rig.lookBack = 0;
    this.rig.lookBackTarget = 0;
  }

  /** pilote auto : il oriente la caméra lui-même (souris ignorée) */
  autopilot = false;
  /** modificateur « lampe à piles » : charge 0..1 (null = lampe illimitée) */
  battery: number | null = null;
  /** modificateur « sans sprint » */
  sprintAllowed = true;

  /** Règles de la run (modificateurs) : à appeler après `reset`. */
  setRules(r: { battery: boolean; sprint: boolean }): void {
    this.battery = r.battery ? 1 : null;
    this.sprintAllowed = r.sprint;
    this.flashlight.batteryScale = 1;
  }

  /** Lampe à piles : décharge allumée, recharge éteinte, faiblit et vacille en fin de charge. */
  private updateBattery(dt: number): void {
    if (this.battery === null) return;
    const b = CONFIG.modifiers.battery;
    const fl = this.flashlight;
    if (fl.on) {
      this.battery = Math.max(0, this.battery - dt / b.drain);
      if (this.battery <= 0) {
        fl.setOn(false);
        this.emit("flashlight", false);
      }
    } else this.battery = Math.min(1, this.battery + dt / b.recharge);
    let k = 1;
    if (this.battery < b.dimBelow) {
      const f = this.battery / b.dimBelow;
      k = 0.35 + 0.65 * f;
      if (Math.random() < dt * (1 - f) * 6) k *= 0.3;
    }
    fl.batteryScale = k;
  }

  /** Rotation de la vue : appelée une fois par frame d'affichage, avant le rendu. */
  look(input: Input): void {
    input.consumeMouse(this.mouse);
    if (!this.controlEnabled || this.autopilot) return;
    this.rig.applyMouse(this.mouse.x, this.mouse.y);
  }

  update(dt: number, input: Input): void {
    const cfg = CONFIG.player;
    const b = this.body;
    this.updateBattery(dt);
    if (this.frozen) {
      this.rig.lookBackTarget = 0;
      this.stamina.update(dt);
      this.speed = 0;
      this.bobAmp = 0;
      const ct = this.crouched ? 1 : 0;
      this.crouchAmount += (ct - this.crouchAmount) * (1 - Math.exp(-cfg.crouchLerp * dt));
      return;
    }

    // --- actions ponctuelles
    if (this.controlEnabled) {
      if (input.wasPressed("flashlight")) {
        if (!this.flashlight.on && this.battery !== null && this.battery < CONFIG.modifiers.battery.minToLight) {
          // piles à plat : un raté, la lampe reste éteinte
          this.flashlight.sputter();
          this.emit("flashlight", false);
        } else {
          this.flashlight.toggle();
          this.emit("flashlight", this.flashlight.on);
        }
      }
      // Appui (ou maintien en mouvement quand la jauge redevient pleine) → activation si pleine.
      const held = input.isDown("sprint") && this.isMovingInput(input) && this.stamina.state === "ready";
      if (!this.sprintAllowed) {
        if (input.wasPressed("sprint")) this.stamina.deniedFlash = 0.35;
      } else if (input.wasPressed("sprint") || held) {
        if (this.stamina.tryActivate()) this.emit("sprintStart", undefined);
      }
      this.crouchHeld = input.isDown("crouch");
      this.rig.lookBackTarget = input.isDown("lookBack") ? 1 : 0;
    } else {
      this.crouchHeld = this.crouched && this.crouchHeld;
      this.rig.lookBackTarget = 0;
    }

    // --- accroupi
    if (this.crouchHeld && !this.crouched) {
      this.crouched = true;
      this.emit("crouch", true);
    } else if (!this.crouchHeld && this.crouched) {
      if (this.mover.fits(b, cfg.standHeight, cfg.stepHeight)) {
        this.crouched = false;
        this.emit("crouch", false);
      }
    }
    const crouchTarget = this.crouched ? 1 : 0;
    this.crouchAmount += (crouchTarget - this.crouchAmount) * (1 - Math.exp(-cfg.crouchLerp * dt));
    if (Math.abs(this.crouchAmount - crouchTarget) < 0.002) this.crouchAmount = crouchTarget;
    b.height = this.crouched ? cfg.crouchHeight : cfg.standHeight;

    // --- jauge
    this.stamina.update(dt);
    if (this.wasSprinting && !this.stamina.sprinting) this.emit("sprintEnd", undefined);
    this.wasSprinting = this.stamina.sprinting;

    // --- direction voulue
    let fwd = 0;
    let side = 0;
    if (this.controlEnabled) {
      if (input.isDown("forward")) fwd += 1;
      if (input.isDown("back")) fwd -= 1;
      if (input.isDown("right")) side += 1;
      if (input.isDown("left")) side -= 1;
    }
    const yaw = this.rig.yaw;
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    let wx = sy * fwd + cy * side;
    let wz = cy * fwd - sy * side;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-6) {
      wx /= wl;
      wz /= wl;
    }
    const mode = this.moveMode;
    const maxSpeed = (mode === "crouch" ? cfg.crouchSpeed : mode === "sprint" ? cfg.sprintSpeed : cfg.walkSpeed) * this.speedScale;
    this.rig.setFovKick(mode === "sprint" && wl > 0 ? CONFIG.sprint.fovKick : 0);

    // --- intégration en sous-pas
    const steps = Math.max(1, Math.ceil(dt / cfg.maxSubstep));
    const h = dt / steps;
    const startX = b.x;
    const startZ = b.z;
    for (let i = 0; i < steps; i++) {
      const tx = wx * maxSpeed;
      const tz = wz * maxSpeed;
      const accel = b.grounded ? (wl > 0 ? cfg.groundAccel : cfg.groundDecel) : cfg.airAccel;
      let dvx = tx - b.vx;
      let dvz = tz - b.vz;
      const dl = Math.hypot(dvx, dvz);
      const maxDv = accel * h;
      if (dl > maxDv) {
        dvx *= maxDv / dl;
        dvz *= maxDv / dl;
      }
      b.vx += dvx;
      b.vz += dvz;
      this.mover.step(b, h, cfg.stepHeight, cfg.groundSnap, cfg.gravity);
    }
    const moved = Math.hypot(b.x - startX, b.z - startZ);
    this.speed = dt > 0 ? moved / dt : 0;

    // --- lissage vertical de la caméra (marches)
    const diff = b.y - this.visualFeet;
    if (Math.abs(diff) > 0.6) this.visualFeet = b.y;
    else this.visualFeet += diff * (1 - Math.exp(-cfg.stepSmoothing * dt));

    // --- pas / balancement
    if (b.grounded && moved > 0.0005) {
      this.stepDistance += moved;
      const stride = mode === "sprint" ? 1.25 : mode === "crouch" ? 0.62 : 0.86;
      this.bobPhase += (moved / stride) * Math.PI;
      if (this.stepDistance >= stride) {
        this.stepDistance -= stride;
        this.emitFootstep(mode);
      }
    }
    const hb = CONFIG.camera.headBob;
    const targetAmp =
      b.grounded && this.speed > 0.5
        ? (mode === "sprint" ? hb.sprintAmplitude : mode === "crouch" ? hb.crouchAmplitude : hb.walkAmplitude) * Math.min(1, this.speed / cfg.walkSpeed)
        : 0;
    this.bobAmp += (targetAmp - this.bobAmp) * (1 - Math.exp(-10 * dt));
  }

  private isMovingInput(input: Input): boolean {
    return input.isDown("forward") || input.isDown("back") || input.isDown("left") || input.isDown("right");
  }

  private emitFootstep(mode: MoveMode): void {
    const n = CONFIG.noise;
    const base = mode === "sprint" ? n.sprintStep : mode === "crouch" ? n.crouchStep : n.walkStep;
    const mult = n.surfaceMultiplier[this.body.surface] ?? 1;
    this.emit("footstep", {
      x: this.body.x,
      y: this.body.y,
      z: this.body.z,
      surface: this.body.surface,
      mode,
      noiseRadius: base * mult,
    });
  }

  /** Place la caméra et la lampe (fin de frame, juste avant le rendu). */
  updateView(dt: number): void {
    const hb = CONFIG.camera.headBob;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * this.bobAmp * 1.6 - this.bobAmp * 0.8;
    const bobX = Math.cos(this.bobPhase) * this.bobAmp * 0.7;
    const bobRoll = Math.cos(this.bobPhase) * this.bobAmp * hb.rollDeg * 0.3;
    this.rig.place(this.body.x, this.eyeY, this.body.z, bobX, bobY, bobRoll, dt);
    this.flashlight.update(dt);
  }
}
