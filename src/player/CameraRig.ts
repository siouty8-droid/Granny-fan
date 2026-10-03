import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "../config";

const DEG = Math.PI / 180;

/**
 * Caméra FPS : lacet/tangage pilotés par la souris brute (appliqués à chaque frame
 * d'affichage), FOV horizontal réglable, balancement de tête optionnel.
 * La caméra peut être « prise » par une cinématique ou une cachette (override).
 */
export class CameraRig {
  readonly camera: FreeCamera;
  yaw = 0;
  pitch = 0;
  roll = 0;
  sensitivity: number = CONFIG.input.sensitivityDefault;
  invertY = false;
  headBob = true;
  private baseFovDeg: number = CONFIG.camera.fov;
  private fovKick = 0;
  private fovKickTarget = 0;
  /** override externe (cinématiques / cachettes) */
  overridden = false;
  /** regard par-dessus l'épaule : 0 = devant, 1 = derrière (lissé) */
  lookBack = 0;
  lookBackTarget = 0;

  constructor(scene: Scene) {
    const cam = new FreeCamera("playerCam", new Vector3(0, 1.7, 0), scene, true);
    cam.inputs.clear();
    cam.minZ = CONFIG.camera.nearPlane;
    cam.maxZ = CONFIG.camera.farPlane;
    cam.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
    cam.rotation.set(0, 0, 0);
    this.camera = cam;
    this.setFov(CONFIG.camera.fov);
  }

  setFov(deg: number): void {
    this.baseFovDeg = deg;
    this.applyFov();
  }

  setFovKick(targetDeg: number): void {
    this.fovKickTarget = targetDeg;
  }

  private applyFov(): void {
    this.camera.fov = (this.baseFovDeg + this.fovKick) * DEG;
  }

  /** Applique le mouvement souris brut (counts). */
  applyMouse(dx: number, dy: number): void {
    const k = this.sensitivity * CONFIG.input.mouseBaseDegPerCount * DEG;
    this.yaw += dx * k;
    this.pitch += (this.invertY ? -dy : dy) * k;
    const lim = CONFIG.camera.pitchLimitDeg * DEG;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
    // garde le lacet dans [-PI, PI] pour la précision
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  /** Place la caméra à l'œil du joueur (appelé à chaque frame). */
  place(x: number, y: number, z: number, bobX: number, bobY: number, bobRoll: number, dt: number): void {
    // lissage du « kick » de FOV (sprint)
    const k = 1 - Math.exp(-8 * dt);
    this.fovKick += (this.fovKickTarget - this.fovKick) * k;
    this.applyFov();
    const lb = CONFIG.camera.lookBack;
    this.lookBack += (this.lookBackTarget - this.lookBack) * (1 - Math.exp(-lb.speed * dt));
    if (Math.abs(this.lookBack - this.lookBackTarget) < 0.002) this.lookBack = this.lookBackTarget;
    if (this.overridden) return;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const bx = this.headBob ? bobX : 0;
    const by = this.headBob ? bobY : 0;
    // droite = (cos, 0, -sin) dans le repère main gauche de Babylon
    // tête tournée : léger décalage vers l'épaule droite pendant la rotation
    const e = this.lookBackEase;
    const shoulder = Math.sin(e * Math.PI) * lb.shoulder;
    this.camera.position.set(x + cos * (bx + shoulder), y + by, z - sin * (bx + shoulder));
    this.camera.rotation.set(this.viewPitch, this.viewYaw, (this.headBob ? bobRoll : 0) + this.roll);
  }

  private get lookBackEase(): number {
    const t = this.lookBack;
    return t * t * (3 - 2 * t);
  }

  /** Lacet de la vue (inclut le regard en arrière ; le déplacement suit `yaw`). */
  get viewYaw(): number {
    return this.yaw + Math.PI * this.lookBackEase;
  }

  /** Tangage de la vue : on regarde à hauteur d'homme par-dessus l'épaule. */
  get viewPitch(): number {
    return this.pitch * (1 - this.lookBackEase * 0.7);
  }

  /** Direction regardée (normalisée). */
  forward(out: Vector3): Vector3 {
    const p = this.viewPitch;
    const y = this.viewYaw;
    const cp = Math.cos(p);
    out.set(Math.sin(y) * cp, -Math.sin(p), Math.cos(y) * cp);
    return out;
  }

  lookAt(dx: number, dy: number, dz: number): void {
    this.yaw = Math.atan2(dx, dz);
    this.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  }
}
