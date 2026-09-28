import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Monster } from "../ai/Monster";
import type { CameraRig } from "../player/CameraRig";
import type { Flashlight } from "../player/Flashlight";
import type { FlashColorId, SkinId } from "../run/Cosmetics";

/** Le Chirurgien pose au fond du hall d'entrée, face à la porte ; la caméra est à ~3 m. */
const SPOT = { x: 40.5, y: 0, z: 8.7, yaw: Math.PI };
const CAM = { x: 39.8, y: 1.55, z: 5.65 };
/** position du Chirurgien à l'écran (fraction de la largeur) : le panneau occupe la gauche */
const SCREEN_X = 0.64;
const FADE_IN = 0.6;

/**
 * Vitrine de la personnalisation (fond du menu) : plan fixe dans le hall, le Chirurgien dans la
 * tenue choisie, éclairé par la lampe dans la couleur choisie. Glisser le fait tourner sur lui-même
 * (sa tête, elle, continue de te fixer).
 */
export class Showcase {
  flash: FlashColorId = "standard";
  skin: SkinId = "classic";
  /** rotation imposée par le joueur (rad) */
  yaw = 0;
  private t = 0;
  /** prochaine voix de la tenue (s) */
  private voiceT = 0.8;
  /** la voix de la tenue (fredonnement, râle…), jouée à la tête du Chirurgien */
  onVoice: (x: number, y: number, z: number) => void = () => {};
  private readonly eye = new Vector3();
  private readonly chest = new Vector3(SPOT.x, SPOT.y + 1.3, SPOT.z);

  constructor(private readonly fadeEl: HTMLElement) {}

  reset(flash: FlashColorId, skin: SkinId): void {
    this.flash = flash;
    this.skin = skin;
    this.yaw = 0;
    this.t = 0;
    this.voiceT = 0.8;
  }

  /** Nouvelle tenue en aperçu : on l'entend tout de suite. */
  voiceSoon(): void {
    this.voiceT = Math.min(this.voiceT, 0.35);
  }

  update(dt: number, rig: CameraRig, monster: Monster, flashlight: Flashlight): void {
    this.t += dt;
    const cam = rig.camera;
    rig.overridden = true;
    cam.position.set(CAM.x, CAM.y, CAM.z);
    // cadrage : le Chirurgien à SCREEN_X de la largeur, en pied (FOV horizontal fixe)
    const dx = SPOT.x - CAM.x;
    const dz = SPOT.z - CAM.z;
    const toMonster = Math.atan2(dx, dz);
    const off = Math.atan((SCREEN_X * 2 - 1) * Math.tan(cam.fov / 2));
    const dist = Math.hypot(dx, dz);
    const pitch = Math.atan2(CAM.y - 1.02, dist);
    cam.rotation.set(pitch, toMonster - off, 0);
    this.eye.copyFrom(cam.position);
    monster.cinematic(dt, this.t, SPOT.x, SPOT.y, SPOT.z, SPOT.yaw + this.yaw, "idle", 0, this.eye);
    flashlight.aimAt = this.chest;
    flashlight.setOn(true);
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 5 + Math.random() * 2;
      this.onVoice(SPOT.x, SPOT.y, SPOT.z);
    }
    this.fadeEl.style.opacity = Math.max(0, 1 - this.t / FADE_IN).toFixed(3);
  }
}
