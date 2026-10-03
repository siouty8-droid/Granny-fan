import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Monster } from "../ai/Monster";
import { CONFIG } from "../config";
import { CollisionMask } from "../physics/Collider";
import type { Player } from "../player/Player";
import type { LightAnimator } from "../render/LightAnimator";
import type { World } from "../world/World";
import { ModelKit, Region } from "../world/props/ModelKit";
import type { Gameplay } from "./Gameplay";

type ScareKind = "lights" | "cry" | "slam" | "whisper" | "silhouette";

export interface ScareDeps {
  scene: Scene;
  world: World;
  player: Player;
  monster: Monster;
  gameplay: Gameplay;
  lights: LightAnimator;
  /** son ponctuel (null : non spatialisé) */
  sound: (name: string, pos: { x: number; y: number; z: number } | null) => void;
}

/**
 * Événements flippants : de temps en temps, un truc pour faire sursauter — coupure de courant,
 * cri au loin, porte qui claque, chuchotement à l'oreille, silhouette au bout du couloir qui
 * disparaît. Purement d'ambiance : rien n'est émis sur le bus de bruit (le Chirurgien n'entend
 * rien), aucune porte ne bouge, aucune règle ne change. Jamais en entraînement, jamais pendant une
 * poursuite, une cachette ou quand le Chirurgien est proche.
 */
export class ScareEvents {
  private enabled = false;
  private timer = 0;
  private last: ScareKind | null = null;
  private readonly fig: Mesh;
  private figT = -1;
  private figLit = 0;
  private readonly fwd = new Vector3();
  /** dernier événement (tests) */
  lastFired: ScareKind | null = null;

  constructor(private readonly d: ScareDeps) {
    // silhouette : grande, voûtée, noire, deux points rouges à peine visibles
    const k = new ModelKit();
    k.groundAO = false;
    const st = { region: Region.WHITE, color: [0.02, 0.02, 0.02] as [number, number, number] };
    for (const s of [-1, 1]) {
      k.cylinder([0.11 * s, 1.0, 0], [0.12 * s, 0.03, 0.04], 0.07, 8, st, true, 0.05);
      k.cylinder([0.22 * s, 1.62, 0.02], [0.3 * s, 0.82, 0.12], 0.05, 8, st, true, 0.035);
    }
    k.cylinder([0, 0.95, 0], [0, 1.68, 0.1], 0.19, 12, st, true, 0.21);
    k.sphere([0, 1.86, 0.2], 0.13, 12, st, 1.25);
    const eyes = { region: Region.WHITE, color: [0.55, 0.05, 0.05] as [number, number, number] };
    for (const s of [-1, 1]) k.sphere([0.04 * s, 1.9, 0.32], 0.012, 6, eyes);
    this.fig = k.toMesh("scareFigure", d.scene);
    const m = new StandardMaterial("scareFigureMat", d.scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.White();
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    this.fig.material = m;
    this.fig.isPickable = false;
    this.fig.setEnabled(false);
  }

  /** Nouvelle run (ou retour au menu : `on` false). */
  reset(on: boolean): void {
    const c = CONFIG.scares;
    this.enabled = on;
    this.timer = c.firstDelay[0] + Math.random() * (c.firstDelay[1] - c.firstDelay[0]);
    this.last = null;
    this.lastFired = null;
    this.hideFigure();
  }

  /** Fin de run : plus rien, silhouette effacée. */
  stop(): void {
    this.enabled = false;
    this.hideFigure();
  }

  update(dt: number): void {
    this.updateFigure(dt);
    if (!this.enabled) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const c = CONFIG.scares;
    const p = this.d.player;
    const m = this.d.monster;
    const dist = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
    // pas pendant le danger réel : on retente un peu plus tard
    if (this.d.gameplay.hiding.hidden || (m.enabled && (m.state === "chase" || m.state === "capture" || dist < c.monsterClear))) {
      this.timer = 6;
      return;
    }
    const kinds: ScareKind[] = (["lights", "cry", "slam", "whisper", "silhouette"] as ScareKind[]).filter((k) => k !== this.last);
    for (let tries = 0; tries < 4; tries++) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
      if (this.fire(kind)) {
        this.last = kind;
        this.lastFired = kind;
        break;
      }
    }
    this.timer = c.interval[0] + Math.random() * (c.interval[1] - c.interval[0]);
  }

  /** Déclenche un événement ; false s'il n'est pas possible ici (pas de porte, couloir trop court…). */
  fire(kind: ScareKind): boolean {
    const p = this.d.player;
    const eyeY = p.y + 1.6;
    switch (kind) {
      case "lights":
        this.d.lights.blackout(1.2 + Math.random() * 1.2);
        this.d.sound("zap", { x: p.x, y: eyeY + 1.2, z: p.z });
        return true;
      case "cry": {
        const a = Math.random() * Math.PI * 2;
        this.d.sound("far_cry", { x: p.x + Math.sin(a) * 28, y: eyeY, z: p.z + Math.cos(a) * 28 });
        return true;
      }
      case "slam": {
        const doors = this.d.gameplay.doors.doors.filter((dr) => {
          const dd = Math.hypot(dr.o.x - p.x, dr.o.z - p.z);
          return dd > 6 && dd < 20 && Math.abs(dr.o.y - p.y) < 1.5;
        });
        if (!doors.length) return false;
        const dr = doors[Math.floor(Math.random() * doors.length)]!;
        this.d.sound("door_slam", { x: dr.o.x, y: dr.o.y + 1.2, z: dr.o.z });
        return true;
      }
      case "whisper": {
        const s = Math.random() < 0.5 ? -1 : 1;
        const yaw = p.rig.yaw;
        // juste derrière l'épaule
        this.d.sound("whisper", { x: p.x + Math.cos(yaw) * 0.7 * s - Math.sin(yaw) * 0.4, y: eyeY, z: p.z - Math.sin(yaw) * 0.7 * s - Math.cos(yaw) * 0.4 });
        return true;
      }
      case "silhouette":
        return this.placeFigure();
    }
  }

  // ------------------------------------------------------------------ silhouette

  private placeFigure(): boolean {
    const p = this.d.player;
    const w = this.d.world;
    const yaw = p.rig.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const eyeY = p.y + 1.6;
    for (const dist of [19, 16, 13, 11]) {
      const x = p.x + fx * dist;
      const z = p.z + fz * dist;
      const g = w.collisionGround(x, z, p.y + 0.8);
      if (!Number.isFinite(g) || Math.abs(g - p.y) > 0.4) continue;
      if (!w.roomAt(x, g + 0.5, z)) continue;
      const col = this.d.gameplay.collision;
      if (!col.lineOfSight(p.x, eyeY, p.z, x, g + 1.7, z, CollisionMask.SIGHT)) continue;
      if (!col.lineOfSight(p.x, eyeY, p.z, x, g + 0.6, z, CollisionMask.SIGHT)) continue;
      this.fig.position.set(x, g, z);
      this.fig.rotation.y = yaw + Math.PI;
      this.fig.setEnabled(true);
      this.figT = 0;
      this.figLit = 0;
      return true;
    }
    return false;
  }

  /** La silhouette disparaît dès qu'on s'approche, qu'on la braque, ou au bout de quelques secondes. */
  private updateFigure(dt: number): void {
    if (this.figT < 0) return;
    this.figT += dt;
    const p = this.d.player;
    const f = this.fig.position;
    const dist = Math.hypot(f.x - p.x, f.z - p.z);
    const fl = p.flashlight;
    let lit = false;
    if (fl.on) {
      this.d.player.rig.forward(this.fwd);
      const dx = f.x - p.x;
      const dy = f.y + 1.2 - (p.y + 1.6);
      const dz = f.z - p.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      lit = (dx * this.fwd.x + dy * this.fwd.y + dz * this.fwd.z) / l > Math.cos((CONFIG.flashlight.angleDeg / 2) * 0.6 * (Math.PI / 180));
    }
    this.figLit = lit ? this.figLit + dt : 0;
    if (dist < CONFIG.scares.figureVanishDist || this.figLit > 0.35 || this.figT > CONFIG.scares.figureMaxTime) {
      this.d.lights.blackout(0.18);
      this.hideFigure();
    }
  }

  private hideFigure(): void {
    this.figT = -1;
    this.fig.setEnabled(false);
  }
}
