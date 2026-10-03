import { CONFIG } from "../config";
import type { Input } from "../core/Input";
import type { Player } from "../player/Player";
import type { CinemaOverlay, VoiceId } from "./CinemaOverlay";

export type V3 = [number, number, number];

/** Clé de caméra : `t` en secondes depuis le début du plan. */
export interface CamKey {
  t: number;
  pos: V3;
  look: V3;
  fov?: number;
}

export interface Shot {
  dur: number;
  keys: CamKey[];
  /** [temps dans le plan, voix, texte, maintien] */
  lines?: Array<[number, VoiceId, string, number?]>;
  /** [temps dans le plan, action] */
  events?: Array<[number, () => void]>;
  /** mise à jour continue (acteurs) : t = temps dans le plan */
  update?: (t: number, dt: number) => void;
  /** balancement de marche de la caméra */
  walkBob?: number;
  /** lampe torche allumée pendant le plan */
  flashlight?: boolean;
}

export interface Script {
  shots: Shot[];
  /** état final garanti (même si la cinématique est passée) */
  finalize: () => void;
  /** durée du fondu d'entrée / de sortie */
  fadeIn?: number;
  fadeOut?: number;
}

const DEG = Math.PI / 180;

function hermite(p0: number, p1: number, p2: number, p3: number, u: number): number {
  // Catmull-Rom
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/**
 * Réalisateur des cinématiques : enchaîne les plans (caméra interpolée en Catmull-Rom, FOV),
 * répliques, évènements, secousses et fondus ; passe la cinématique si la touche est maintenue.
 */
export class Director {
  active = false;
  private script: Script | null = null;
  private t = 0;
  private total = 0;
  private shotStart: number[] = [];
  private firedLines = new Set<string>();
  private firedEvents = new Set<string>();
  private skipHeld = 0;
  private onDone: (() => void) | null = null;
  private shakeAmp = 0;
  private baseFov = 90;
  private finished = false;

  constructor(
    private readonly overlay: CinemaOverlay,
    private readonly player: Player,
  ) {}

  play(script: Script, onDone: () => void, skipKey: string): void {
    this.script = script;
    this.onDone = onDone;
    this.t = 0;
    this.total = script.shots.reduce((a, s) => a + s.dur, 0);
    this.shotStart = [];
    let acc = 0;
    for (const s of script.shots) {
      this.shotStart.push(acc);
      acc += s.dur;
    }
    this.firedLines.clear();
    this.firedEvents.clear();
    this.skipHeld = 0;
    this.shakeAmp = 0;
    this.active = true;
    this.finished = false;
    this.baseFov = this.player.rig.camera.fov;
    this.player.rig.overridden = true;
    this.player.controlEnabled = false;
    this.overlay.reset(skipKey);
    this.overlay.setFade(1);
  }

  shake(a: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, a);
  }

  /** Temps écoulé dans la cinématique. */
  get time(): number {
    return this.t;
  }

  update(dt: number, input: Input): void {
    const sc = this.script;
    if (!this.active || !sc) return;
    // passer : maintien de la touche
    if (input.isDown("skip")) {
      this.skipHeld += dt;
      this.overlay.skipRing.set(this.skipHeld / CONFIG.input.skipHold);
      if (this.skipHeld >= CONFIG.input.skipHold) {
        this.end();
        return;
      }
    } else if (this.skipHeld > 0) {
      this.skipHeld = 0;
      this.overlay.skipRing.set(0);
    }
    this.t += dt;
    if (this.t >= this.total) {
      this.end();
      return;
    }
    // plan courant
    let i = this.shotStart.length - 1;
    while (i > 0 && this.shotStart[i]! > this.t) i--;
    const shot = sc.shots[i]!;
    const lt = this.t - this.shotStart[i]!;
    // répliques + évènements (de tous les plans déjà atteints)
    sc.shots.forEach((s, si) => {
      const st = this.shotStart[si]!;
      if (st > this.t) return;
      s.lines?.forEach(([at, voice, text, hold], li) => {
        const key = `${si}:${li}`;
        if (!this.firedLines.has(key) && this.t >= st + at) {
          this.firedLines.add(key);
          this.overlay.say(voice, text, hold);
        }
      });
      s.events?.forEach(([at, fn], ei) => {
        const key = `${si}:${ei}`;
        if (!this.firedEvents.has(key) && this.t >= st + at) {
          this.firedEvents.add(key);
          fn();
        }
      });
    });
    shot.update?.(lt, dt);
    this.player.flashlight.setOn(!!shot.flashlight);
    this.camera(shot, lt, dt);
    // fondus
    const fi = sc.fadeIn ?? 0.9;
    const fo = sc.fadeOut ?? 1.1;
    let fade = 0;
    if (this.t < fi) fade = 1 - this.t / fi;
    if (this.t > this.total - fo) fade = Math.max(fade, (this.t - (this.total - fo)) / fo);
    this.overlay.setFade(fade);
    this.overlay.update(dt);
  }

  private camera(shot: Shot, lt: number, dt: number): void {
    const keys = shot.keys;
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1]!.t <= lt) k++;
    const a = keys[Math.max(0, k - 1)]!;
    const b = keys[k]!;
    const c = keys[Math.min(keys.length - 1, k + 1)]!;
    const d = keys[Math.min(keys.length - 1, k + 2)]!;
    const span = Math.max(1e-3, c.t - b.t);
    let u = keys.length === 1 ? 0 : Math.max(0, Math.min(1, (lt - b.t) / span));
    u = u * u * (3 - 2 * u) * 0.5 + u * 0.5;
    const P = (i: 0 | 1 | 2) => hermite(a.pos[i], b.pos[i], c.pos[i], d.pos[i], u);
    const L = (i: 0 | 1 | 2) => hermite(a.look[i], b.look[i], c.look[i], d.look[i], u);
    let px = P(0);
    let py = P(1);
    let pz = P(2);
    if (shot.walkBob) {
      py += Math.abs(Math.sin(this.t * 5.2)) * shot.walkBob - shot.walkBob * 0.5;
      px += Math.cos(this.t * 5.2) * shot.walkBob * 0.4;
    }
    const lx = L(0) - px;
    const ly = L(1) - py;
    const lz = L(2) - pz;
    let yaw = Math.atan2(lx, lz);
    let pitch = -Math.atan2(ly, Math.hypot(lx, lz));
    let roll = 0;
    if (this.shakeAmp > 0.001) {
      yaw += (Math.random() - 0.5) * this.shakeAmp * 0.08;
      pitch += (Math.random() - 0.5) * this.shakeAmp * 0.08;
      roll += (Math.random() - 0.5) * this.shakeAmp * 0.05;
      this.shakeAmp *= Math.exp(-4 * dt);
    }
    const fovB = b.fov ?? 90;
    const fovC = c.fov ?? fovB;
    const cam = this.player.rig.camera;
    cam.position.set(px, py, pz);
    cam.rotation.set(pitch, yaw, roll);
    cam.fov = (fovB + (fovC - fovB) * u) * DEG;
    this.player.rig.yaw = yaw;
    this.player.rig.pitch = pitch;
    this.player.flashlight.update(dt);
  }

  /** Fin (normale ou passée) : état final garanti, rendu de la main. */
  end(): void {
    if (!this.active || this.finished) return;
    this.finished = true;
    this.active = false;
    this.overlay.hideDialogue();
    this.overlay.skipRing.set(0);
    this.player.rig.overridden = false;
    this.player.rig.camera.fov = this.baseFov;
    this.script?.finalize();
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }
}
