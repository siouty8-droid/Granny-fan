import type { CameraRig } from "../player/CameraRig";

interface Shot {
  from: [number, number, number, number, number];
  to: [number, number, number, number, number];
  duration: number;
}

/** Plans lents (x, y, z, lacet°, tangage°) dans l'hôpital pour le fond du menu principal. */
const SHOTS: Shot[] = [
  { from: [40.5, 1.6, 1.5, 0, 2], to: [40.5, 1.6, 9.5, 4, 0], duration: 11 },
  { from: [14, 1.65, 18.5, 90, 3], to: [24, 1.65, 18.5, 92, 1], duration: 10 },
  { from: [22, 5.6, 2.2, 75, 6], to: [30, 5.6, 4.5, 95, 4], duration: 11 },
  { from: [45, -2.4, 40.5, 10, 8], to: [47, -2.4, 44, -8, 6], duration: 10 },
  { from: [58, 1.6, 19, 40, 2], to: [64, 1.6, 23, 60, 3], duration: 10 },
  { from: [36, 1.7, 22, 160, -12], to: [38, 1.9, 27, 200, -18], duration: 10 },
  { from: [2, 5.6, 3, 60, 4], to: [7, 5.6, 6, 30, 6], duration: 10 },
];

const DEG = Math.PI / 180;
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Fond animé du menu : enchaînement de travellings dans l'hôpital (culling actif),
 * fondus au noir entre les plans.
 */
export class MenuBackground {
  private t = 0;
  private index = 0;
  fade = 1;

  constructor(private readonly fadeEl: HTMLElement) {}

  reset(): void {
    this.t = 0;
    this.index = Math.floor(Math.random() * SHOTS.length);
  }

  update(dt: number, rig: CameraRig): void {
    this.t += dt;
    let shot = SHOTS[this.index]!;
    if (this.t > shot.duration) {
      this.t = 0;
      this.index = (this.index + 1) % SHOTS.length;
      shot = SHOTS[this.index]!;
    }
    const k = ease(Math.min(1, this.t / shot.duration));
    const f = shot.from;
    const to = shot.to;
    const cam = rig.camera;
    rig.overridden = true;
    cam.position.set(f[0] + (to[0] - f[0]) * k, f[1] + (to[1] - f[1]) * k, f[2] + (to[2] - f[2]) * k);
    cam.rotation.set((f[4] + (to[4] - f[4]) * k) * DEG, (f[3] + (to[3] - f[3]) * k) * DEG, 0);
    // fondu au noir en début et fin de plan
    const edge = Math.min(this.t, shot.duration - this.t);
    this.fade = 1 - Math.min(1, edge / 1.2);
    this.fadeEl.style.opacity = this.fade.toFixed(3);
  }

  hide(): void {
    this.fadeEl.style.opacity = "0";
  }
}
