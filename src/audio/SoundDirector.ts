import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG } from "../config";
import type { Monster } from "../ai/Monster";
import type { Gameplay } from "../gameplay/Gameplay";
import { CollisionMask } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { Player } from "../player/Player";
import { BakeGlobals } from "../render/BakedLightPlugin";
import type { RoomDef } from "../world/layout/types";
import type { Fixture } from "../world/lighting/Lights";
import type { World } from "../world/World";
import { Ambience } from "./Ambience";
import type { AudioEngine } from "./AudioEngine";
import { Sfx, type Pos } from "./Sfx";

export type SoundMode = "loading" | "menu" | "playing" | "cinema" | "paused" | "results";

export interface SoundDeps {
  audio: AudioEngine;
  world: World;
  collision: CollisionWorld;
  player: Player;
  gameplay: Gameplay;
  monster: Monster;
}

const FORWARD = new Vector3(0, 0, 1);

/** Noms des sons ponctuels des cinématiques → recette + paramètre. */
const CINE_SOUNDS: Record<string, [string, string]> = {
  engine_idle: ["engine", "6"],
  car_leave: ["engine", "4"],
  ambulance_start: ["engine", "3"],
  slam: ["door_slam", ""],
  maglock: ["key_unlock", ""],
  ladder: ["land", ""],
};

/**
 * Chef d'orchestre audio : branche les recettes (Sfx) et les couches continues (Ambience)
 * sur les évènements du jeu (pas, portes, objets, monstre, confinement…), place l'auditeur
 * sur la caméra, calcule l'occlusion (ligne de vue, étages) et la réverbération de la pièce.
 */
export class SoundDirector {
  readonly sfx: Sfx;
  readonly ambience: Ambience;
  private readonly cfg = CONFIG.audio;
  private readonly neons: Fixture[];
  private readonly fwd = new Vector3();
  private readonly listener = { x: 0, y: 0, z: 0, floorY: 0 };
  private room: RoomDef | null = null;
  private roomTimer = 0;
  private humTimer = 0;
  private breathTimer = 0;
  private breathIn = true;
  private heartTimer = 0;
  private voxTimer = 4;
  private sirenTimer = 0;
  private sirenCycle = 0;
  private lockdown = false;
  /** le « coup » de repérage a déjà été joué (réarmé quand il t'oublie) */
  private stung = false;

  constructor(private readonly d: SoundDeps) {
    this.sfx = new Sfx(d.audio);
    this.ambience = new Ambience(d.audio, this.sfx);
    this.sfx.occlusion = (x, y, z) => this.occlusion(x, y, z);
    this.neons = d.world.fixtures.filter((f) => f.kind === "neon" && f.state !== "off");

    d.player.on("footstep", (e) => this.sfx.footstep(e.surface, e.mode, null));
    d.player.on("flashlight", () => this.sfx.play("flashlight", null));
    d.gameplay.sounds.on("sfx", (e) => this.sfx.play(e.name, { x: e.x, y: e.y, z: e.z }, e.param));
    const m = d.monster;
    m.on("step", (e) => this.sfx.play("monster_step", { x: e.x, y: e.y + 0.05, z: e.z }, e.run ? "run" : ""));
    m.on("alert", () => {
      this.sfx.play("monster_scream", this.head());
      this.voxTimer = 2.5;
    });
    m.on("lost", () => {
      this.sfx.play("monster_growl", this.head());
      this.voxTimer = 4;
    });
    m.on("capture", () => this.sfx.play("capture", null));
  }

  /** Nouvelle run : silence de la poursuite, fin du confinement. */
  reset(): void {
    this.lockdown = false;
    this.sirenTimer = 0;
    this.sirenCycle = 0;
    this.voxTimer = 4;
    this.stung = false;
    this.heartTimer = 0;
    this.breathTimer = 0;
    const a = this.ambience;
    a.lockdown = false;
    a.siren = false;
    a.setChase(false);
    a.chase = 0;
    a.tension = 0;
  }

  /** Début du confinement : sirène (puis rappels périodiques), drone plus dissonant. */
  startLockdown(): void {
    this.lockdown = true;
    this.ambience.lockdown = true;
    this.sirenTimer = this.cfg.siren.first;
    this.sirenCycle = this.cfg.siren.period;
    this.sfx.play("bang", { x: this.listener.x + 12, y: this.listener.floorY + 3, z: this.listener.z - 8 });
  }

  /** Son ponctuel d'une cinématique. */
  cinema(name: string, x: number, y: number, z: number): void {
    const [recipe, param] = CINE_SOUNDS[name] ?? [name, ""];
    this.sfx.play(recipe, { x, y, z }, param);
  }

  private head(): Pos {
    const p = this.d.monster.pos;
    return { x: p.x, y: p.y + 1.8, z: p.z };
  }

  /** 0 = dégagé ; ~0.6 derrière un mur / une porte fermée ; ~0.85 autre étage. */
  private occlusion(x: number, y: number, z: number): number {
    const L = this.listener;
    if (Math.hypot(x - L.x, y - L.y, z - L.z) < 1.5) return 0;
    let occ = 0;
    const rel = y - L.floorY;
    if (rel < -0.6 || rel > 3.8) occ = 0.85;
    if (occ < 0.6 && !this.d.collision.lineOfSight(L.x, L.y, L.z, x, y, z, CollisionMask.SIGHT)) occ = 0.6;
    return occ;
  }

  /**
   * À chaque frame. `room` : pièce de la caméra (déjà calculée pour le culling), `camera` :
   * caméra active (auditeur).
   */
  update(dt: number, mode: SoundMode, camera: Camera, room: RoomDef | null | undefined): void {
    const a = this.d.audio;
    if (!a.ctx || mode === "loading" || mode === "paused") return;
    this.ambience.start();
    if (room !== undefined) this.room = room;
    const amb = this.ambience;

    // auditeur = caméra
    const c = camera.globalPosition;
    camera.getDirectionToRef(FORWARD, this.fwd);
    a.setListener(c.x, c.y, c.z, this.fwd.x, this.fwd.y, this.fwd.z);
    const L = this.listener;
    L.x = c.x;
    L.y = c.y;
    L.z = c.z;
    L.floorY = this.room ? this.d.world.floorY(this.room.floor) : 0;

    // acoustique de la pièce (réverb, vent)
    this.roomTimer -= dt;
    if (this.roomTimer <= 0) {
      this.roomTimer = 0.25;
      a.setReverb(this.reverbOf(this.room));
      amb.outdoor = !this.room || this.room.kind === "outdoor" ? 1 : this.room.theme === "courtyard" ? 0.8 : 0;
    }
    // bourdonnement des néons les plus proches
    this.humTimer -= dt;
    if (this.humTimer <= 0) {
      this.humTimer = 0.4;
      this.updateHums();
    }

    amb.enabled = mode !== "results";
    amb.events = mode === "playing" || mode === "cinema";
    if (mode === "playing") this.updatePlaying(dt);
    else {
      amb.setChase(false);
      amb.tension = Math.max(0, amb.tension - dt);
      amb.siren = false;
    }
    amb.update(dt, BakeGlobals.flicker, L);
  }

  private reverbOf(room: RoomDef | null): number {
    const r = this.cfg.reverb;
    if (!room || room.kind === "outdoor") return r.outdoor;
    if (room.kind === "stair") return r.stair;
    if (room.kind === "elevator") return r.small;
    if (room.kind === "corridor") return r.corridor;
    const [x0, z0, x1, z1] = room.rect;
    return Math.abs((x1 - x0) * (z1 - z0)) > r.bigArea ? r.big : r.small;
  }

  private readonly humList: Array<{ x: number; y: number; z: number; slot: number; level: number; d: number }> = [];

  private updateHums(): void {
    const L = this.listener;
    const list = this.humList;
    list.length = 0;
    for (const f of this.neons) {
      const dy = f.y - L.floorY;
      if (dy < 0 || dy > 4.5) continue;
      const d = (f.x - L.x) ** 2 + (f.z - L.z) ** 2;
      if (d > 110) continue;
      list.push({ x: f.x, y: f.y, z: f.z, slot: f.slot, level: f.state === "flicker" ? 1 : 0.5, d });
    }
    list.sort((p, q) => p.d - q.d);
    this.ambience.setHums(list);
  }

  private updatePlaying(dt: number): void {
    const { player, monster, gameplay } = this.d;
    const amb = this.ambience;
    const cfg = this.cfg;

    // essoufflement (jauge de sprint vidée)
    const st = player.stamina;
    if (st.breathless > 0) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        const k = Math.min(1, st.breathless / CONFIG.sprint.breathlessTime);
        this.sfx.breath(this.breathIn, cfg.breathGain * (0.4 + 0.6 * k));
        this.breathTimer = this.breathIn ? 0.42 : 0.5 + (1 - k) * 0.4;
        this.breathIn = !this.breathIn;
      }
    } else {
      this.breathTimer = 0;
      this.breathIn = true;
    }

    // monstre : distance, poursuite, tension, voix, cœur
    const active = monster.enabled && monster.state !== "capture";
    const mp = monster.pos;
    const dist = Math.hypot(mp.x - player.x, (mp.y - player.y) * 2, mp.z - player.z);
    amb.setChase(monster.enabled && (monster.state === "chase" || monster.state === "capture"));
    const near = active ? Math.max(0, Math.min(1, (cfg.tensionRange - dist) / (cfg.tensionRange - 4))) : 0;
    const tension = Math.max(near * (monster.state === "chase" ? 0.3 : 1), active ? monster.awareness * 0.8 : 0);
    amb.tension += (tension - amb.tension) * Math.min(1, dt * 2);

    if (active) {
      this.voxTimer -= dt;
      if (this.voxTimer <= 0) {
        if (monster.state === "chase") {
          this.sfx.play("monster_growl", this.head());
          this.voxTimer = 2.5 + Math.random() * 2;
        } else if (dist < cfg.monsterVoiceRange) {
          this.sfx.play("monster_breath", this.head());
          this.voxTimer = 3 + Math.random() * 2.5;
        } else this.voxTimer = 1;
      }
    }
    // il commence à te repérer (avant le cri)
    if (active && monster.seesPlayer && monster.state !== "chase" && monster.awareness > cfg.detectSting && !this.stung) {
      this.stung = true;
      this.sfx.play("detect", null);
    } else if (monster.awareness < 0.08) this.stung = false;

    const hidden = gameplay.hiding.hidden;
    const scared = (hidden && dist < 10) || (monster.state === "chase" && dist < 7);
    if (active && scared) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        const k = Math.max(0, Math.min(1, dist / 10));
        this.sfx.heartbeat(cfg.heartGain * (1 - k * 0.6));
        this.heartTimer = 0.42 + k * 0.5;
      }
    } else this.heartTimer = 0;

    // sirène du confinement : longue au déclenchement, puis rappels
    if (this.lockdown) {
      if (this.sirenTimer > 0) this.sirenTimer -= dt;
      else {
        this.sirenCycle -= dt;
        if (this.sirenCycle <= 0) {
          this.sirenCycle = cfg.siren.period;
          this.sirenTimer = cfg.siren.burst;
        }
      }
      amb.siren = this.sirenTimer > 0;
    } else amb.siren = false;
  }
}
