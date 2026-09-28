import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG, type AiDifficulty, type Difficulty } from "../config";
import { Emitter } from "../core/Events";
import type { Rng } from "../core/Rng";
import type { Gameplay } from "../gameplay/Gameplay";
import type { NoiseEvent } from "../gameplay/Noise";
import { CollisionMask } from "../physics/Collider";
import type { BakedLightPlugin } from "../render/BakedLightPlugin";
import type { HidingCandidate } from "../world/decor/Decorator";
import type { LightBaker } from "../world/lighting/LightBaker";
import type { Material } from "@babylonjs/core/Materials/material";
import { MonsterAnimator, type AnimInput, type Gait } from "./MonsterAnimator";
import { buildMonster, setMonsterSkin, type MonsterRig } from "./MonsterModel";
import type { SkinId } from "../run/Cosmetics";
import { NavFlags, type NavLink, type Navigation } from "./Navigation";

export type MonsterState = "patrol" | "investigate" | "chase" | "search" | "checkHide" | "capture";

interface MonsterEvents {
  /** repère le joueur (cri) */
  alert: void;
  /** perd la trace */
  lost: void;
  /** pas (audio) */
  step: { x: number; y: number; z: number; run: boolean };
  capture: void;
  /** ce qui l'a mis sur ta piste (récap de run, carte) */
  detect: DetectEvent;
}

export type DetectKind = "sight" | "noise" | "ping" | "sawHide" | "capture";

/** Évènement de détection : cause, distance, positions (joueur / source, monstre). */
export interface DetectEvent {
  kind: DetectKind;
  /**
   * sight : drapeaux « lamp,sprint,crouch,dark » ; noise : « type » ou « type:détail » ;
   * sawHide : type de cachette ; capture : « chase » | « hideSaw » | « hideSearch ».
   */
  detail: string;
  dist: number;
  x: number;
  y: number;
  z: number;
  mx: number;
  my: number;
  mz: number;
}

interface Traversal {
  link: NavLink;
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  height: number;
}

/**
 * Le Chirurgien : perception (vision en cône + ligne de vue, ouïe), machine à états, déplacement
 * sur la navmesh (ouverture des portes, sauts de barrières, raccourcis), fouille des cachettes,
 * capture. Paramétré par la difficulté ; plus agressif pendant le confinement.
 */
export class Monster extends Emitter<MonsterEvents> {
  readonly rig: MonsterRig;
  private anim: MonsterAnimator;
  readonly pos = new Vector3();
  yaw = 0;
  state: MonsterState = "patrol";
  private stateTime = 0;
  private speed = 0;
  private targetSpeed = 0;
  private path: Vector3[] = [];
  private pathIdx = 0;
  private repath = 0;
  private waitTimer = 0;
  private traversal: Traversal | null = null;
  private door: { id: string; t: number } | null = null;
  /** 0..1 : jauge de repérage */
  awareness = 0;
  private visible = false;
  private lastSeen = new Vector3();
  private lastSeenVel = new Vector3();
  private lastSeenTime = -1e9;
  private searchCenter = new Vector3();
  private searchUntil = 0;
  private checked = new Set<HidingCandidate>();
  private hideTarget: HidingCandidate | null = null;
  private hideTimer = 0;
  private sawHide: HidingCandidate | null = null;
  private pendingNoise: NoiseEvent | null = null;
  private pingTimer = 0;
  private graceUntil = 0;
  private time = 0;
  private stepDist = 0;
  private capT = 0;
  private flags: number = NavFlags.WALK;
  cfg: AiDifficulty = CONFIG.ai.difficulty.normal;
  difficulty: Difficulty = "normal";
  lockdown = false;
  enabled = false;
  private rng!: Rng;
  private readonly waypoints: Array<{ room: string; floor: string; p: Vector3 }> = [];
  private animIn: AnimInput = { dt: 0, time: 0, speed: 0, gait: "idle", reach: 0, reachHeight: 0, bend: 0, lunge: 0, jump: 0, look: null, lookWeight: 0 };
  private reachW = 0;
  private bendW = 0;
  private lungeW = 0;
  private lookPos = new Vector3();
  private lookW = 0;
  /** rappel : capture terminée → fin de run */
  onCaught: (() => void) | null = null;
  /** zone de rendu visible ? (culling) */
  isZoneVisible: (zone: string) => boolean = () => true;
  private lastHidePhase = "none";
  /** fouille en cours : la cachette a été vue (sinon fouille au hasard) */
  private hideSeen = false;
  debugInfo = "";

  constructor(
    scene: Scene,
    material: Material,
    eyeMaterial: Material,
    private readonly plugin: BakedLightPlugin | null,
    private readonly nav: Navigation,
    private readonly gp: Gameplay,
    private readonly baker: LightBaker | null,
  ) {
    super();
    this.rig = buildMonster(scene, material, eyeMaterial);
    this.anim = new MonsterAnimator(this.rig, 1234);
    for (const r of gp.world.layout.rooms) {
      if (r.kind === "stair" || r.kind === "elevator" || r.floor === "R") continue;
      const [x0, z0, x1, z1] = r.rect;
      const p = new Vector3((x0 + x1) / 2, gp.world.floorY(r.floor), (z0 + z1) / 2);
      this.waypoints.push({ room: r.id, floor: r.floor, p });
    }
    gp.noise.on("noise", (e) => this.hear(e));
    this.setVisible(false);
  }

  get mesh() {
    return this.rig.mesh;
  }

  /** Tenue (visuel seulement : même squelette, mêmes animations, même IA). */
  setSkin(skin: SkinId): void {
    setMonsterSkin(this.rig, skin);
  }

  private setVisible(v: boolean): void {
    this.rig.mesh.setEnabled(v);
    this.rig.eyes.setEnabled(v);
  }

  /** Nouvelle run. */
  reset(difficulty: Difficulty, rng: Rng, now: number): void {
    this.difficulty = difficulty;
    this.cfg = CONFIG.ai.difficulty[difficulty];
    this.rng = rng;
    this.flags = NavFlags.WALK | (this.cfg.jumpBarriers ? NavFlags.JUMP : 0) | (this.cfg.shortcuts ? NavFlags.SHORTCUT : 0);
    const sp = CONFIG.ai.spawn;
    this.pos.set(sp.x, sp.y, sp.z);
    this.yaw = sp.yaw;
    this.state = "patrol";
    this.stateTime = 0;
    this.speed = 0;
    this.path = [];
    this.traversal = null;
    this.door = null;
    this.awareness = 0;
    this.visible = false;
    this.lastSeenTime = -1e9;
    this.checked.clear();
    this.hideTarget = null;
    this.sawHide = null;
    this.pendingNoise = null;
    this.pingTimer = CONFIG.ai.lockdown.pingInterval;
    this.time = 0;
    this.graceUntil = this.cfg.grace;
    this.lockdown = false;
    this.capT = 0;
    this.reachW = this.bendW = this.lungeW = 0;
    this.waitTimer = 0.6;
    this.enabled = true;
    this.lastHidePhase = "none";
    this.hideSeen = false;
    void now;
    // premier objectif : s'éloigner du hall (il disparaît au fond du couloir)
    const away = this.waypoints.filter((w) => w.floor === "G" && w.p.z > 30);
    if (away.length) this.goTo(this.rng.pick(away).p);
    this.setVisible(true);
    this.place();
  }

  disable(): void {
    this.enabled = false;
    this.setVisible(false);
  }

  // ------------------------------------------------------------------ perception

  private hear(e: NoiseEvent): void {
    if (!this.enabled || this.time < this.graceUntil || this.state === "capture" || !e.byPlayer) return;
    const mult = this.cfg.hearing * (this.lockdown ? CONFIG.ai.lockdown.hearing : 1);
    const dx = e.x - this.pos.x;
    const dz = e.z - this.pos.z;
    const dy = (e.y - this.pos.y) * (e.kind === "trap" ? 1.2 : 2.5);
    const d = Math.hypot(dx, dy, dz);
    if (d > e.radius * mult) return;
    if (!this.pendingNoise || e.radius > this.pendingNoise.radius) this.pendingNoise = e;
  }

  private canSee(): boolean {
    const gp = this.gp;
    const p = gp.player;
    if (gp.hiding.phase === "in" || gp.hiding.phase === "enter") return false;
    const ex = this.pos.x;
    const ey = this.pos.y + CONFIG.ai.eyeHeight;
    const ez = this.pos.z;
    const tx = p.x;
    const ty = p.y + (p.crouched ? 0.8 : 1.4);
    const tz = p.z;
    const dx = tx - ex;
    const dz = tz - ez;
    const d = Math.hypot(dx, ty - ey, dz);
    let range = this.cfg.visionRange;
    if (p.flashlight.on) range *= CONFIG.ai.flashlightVisibility;
    if (p.crouched) range *= CONFIG.ai.crouchVisibility;
    if (this.lockdown) range *= 1.15;
    if (!p.flashlight.on && this.baker) {
      const pr = this.baker.probe(p.x, p.y + 1, p.z, gp.world.roomAt(p.x, p.y + 0.5, p.z)?.id ?? null);
      const lum = pr[0] * 0.3 + pr[1] * 0.6 + pr[2] * 0.1;
      if (lum < 0.08) range *= 0.55;
    }
    if (d > range) return false;
    if (d > 1.7) {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const cosA = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (cosA < Math.cos(((this.cfg.visionAngle / 2) * Math.PI) / 180)) return false;
    }
    return gp.collision.lineOfSight(ex, ey, ez, tx, ty, tz, CollisionMask.SIGHT);
  }

  /** Voit-il le joueur en ce moment ? (retour visuel de détection) */
  get seesPlayer(): boolean {
    return this.visible;
  }

  private detect(kind: DetectKind, detail: string, x: number, y: number, z: number): void {
    const dist = Math.hypot(x - this.pos.x, (y - this.pos.y) * 0.5, z - this.pos.z);
    this.emit("detect", { kind, detail, dist, x, y, z, mx: this.pos.x, my: this.pos.y, mz: this.pos.z });
  }

  private sightDetail(): string {
    const p = this.gp.player;
    const f: string[] = [];
    if (p.flashlight.on) f.push("lamp");
    if (p.stamina.sprinting) f.push("sprint");
    if (p.crouched) f.push("crouch");
    if (this.lockdown) f.push("lockdown");
    return f.join(",");
  }

  // ------------------------------------------------------------------ navigation

  private goTo(p: Vector3): boolean {
    const path = this.nav.path(this.pos, p, this.flags);
    if (path.length < 1) {
      this.path = [];
      return false;
    }
    this.path = path;
    this.pathIdx = path.length > 1 ? 1 : 0;
    return true;
  }

  private arrived(): boolean {
    return !this.traversal && (this.path.length === 0 || this.pathIdx >= this.path.length);
  }

  private linkAt(a: Vector3, b: Vector3): NavLink | null {
    for (const l of this.nav.links) {
      const near = (p: Vector3, q: Vector3) => Math.abs(p.x - q.x) < 0.45 && Math.abs(p.z - q.z) < 0.45 && Math.abs(p.y - q.y) < 1.2;
      if (near(a, l.a) && near(b, l.b)) return l;
      if (l.bidirectional && near(a, l.b) && near(b, l.a)) return l;
    }
    return null;
  }

  /** Porte fermée sur le chemin immédiat ? (le monstre s'arrête pour l'ouvrir) */
  private doorAhead(): string | null {
    if (this.pathIdx >= this.path.length) return null;
    const next = this.path[this.pathIdx]!;
    const dx = next.x - this.pos.x;
    const dz = next.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    for (const d of this.gp.doors.doors) {
      if (d.locked || this.gp.doors.wideOpen(d)) continue;
      const o = d.o;
      if (Math.abs(o.y - this.pos.y) > 1.5) continue;
      const ox = o.x - this.pos.x;
      const oz = o.z - this.pos.z;
      const dist = Math.hypot(ox, oz);
      if (dist > 1.6) continue;
      // la porte est devant nous et le segment la traverse
      if ((ox * fx + oz * fz) / (dist || 1) < 0.2 && dist > 0.6) continue;
      const along = o.axis === "x" ? Math.abs(this.pos.x + fx * Math.min(dist + 0.5, len) - o.x) : Math.abs(this.pos.z + fz * Math.min(dist + 0.5, len) - o.z);
      if (along > o.width / 2 + 0.5) continue;
      return d.id;
    }
    return null;
  }

  private follow(dt: number): void {
    // traversée d'une liaison (saut, fenêtre)
    if (this.traversal) {
      const tr = this.traversal;
      tr.t += dt / tr.dur;
      const u = Math.min(1, tr.t);
      Vector3.LerpToRef(tr.from, tr.to, u, this.pos);
      this.pos.y += Math.sin(u * Math.PI) * tr.height + (tr.link.kind === "drop" ? (tr.to.y - tr.from.y) * (u * u - u) : 0);
      this.faceTowards(tr.to.x - tr.from.x, tr.to.z - tr.from.z, dt, 3);
      this.speed = Vector3.Distance(tr.from, tr.to) / tr.dur;
      if (u >= 1) {
        this.traversal = null;
        this.gp.noise.make(this.pos.x, this.pos.y, this.pos.z, 10, "step", false);
      }
      return;
    }
    // porte à ouvrir
    if (this.door) {
      this.door.t += dt;
      this.targetSpeed = 0;
      if (this.door.t >= this.cfg.doorTime) {
        const d = this.gp.doors.byId.get(this.door.id);
        if (d && !d.locked) {
          this.gp.doors.open(d, this.pos.x, this.pos.z, true);
          this.gp.noise.make(d.o.x, d.o.y + 1, d.o.z, 8, "door", false);
        }
        this.door = null;
      }
    } else if (!this.arrived()) {
      const doorId = this.doorAhead();
      if (doorId) {
        const d = this.gp.doors.byId.get(doorId)!;
        // battante ou entrouverte : il la pousse sans s'arrêter ; fermée : il tourne la poignée
        if (d.swing || this.gp.doors.isOpen(d)) this.gp.doors.open(d, this.pos.x, this.pos.z, true);
        else this.door = { id: doorId, t: 0 };
      }
    }
    if (this.arrived()) {
      this.targetSpeed = 0;
    }
    const k = 1 - Math.exp(-CONFIG.ai.accel * dt * 0.35);
    this.speed += (this.targetSpeed - this.speed) * k;
    if (this.arrived() || this.door) return;
    let step = this.speed * dt;
    let guard = 0;
    while (step > 1e-4 && this.pathIdx < this.path.length && guard++ < 8) {
      const target = this.path[this.pathIdx]!;
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= step || d < 0.05) {
        this.pos.x = target.x;
        this.pos.z = target.z;
        this.pos.y = target.y;
        step -= d;
        const prev = target;
        this.pathIdx++;
        if (this.pathIdx < this.path.length) {
          const link = this.linkAt(prev, this.path[this.pathIdx]!);
          if (link) {
            const next = this.path[this.pathIdx]!;
            this.traversal = { link, from: prev.clone(), to: next.clone(), t: 0, dur: link.kind === "jump" ? 0.75 : 0.9, height: link.kind === "drop" ? 0.3 : 0.75 };
            this.pathIdx++;
            this.gp.noise.make(this.pos.x, this.pos.y, this.pos.z, 9, "step", false);
            return;
          }
        }
        continue;
      }
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      this.faceTowards(dx, dz, dt, 1);
      // hauteur : sol réel (escaliers) sinon interpolation du chemin
      const g = this.gp.collision.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.55, CollisionMask.MONSTER);
      if (Number.isFinite(g) && Math.abs(g - this.pos.y) < 0.8) this.pos.y += (g - this.pos.y) * Math.min(1, dt * 14);
      else this.pos.y += (target.y - this.pos.y) * Math.min(1, dt * 6);
      step = 0;
    }
    // sécurité : une porte fermée qu'on est en train de traverser s'ouvre d'office
    for (const d of this.gp.doors.doors) {
      if (d.locked || this.gp.doors.wideOpen(d) || Math.abs(d.o.y - this.pos.y) > 1.2) continue;
      if (Math.hypot(d.o.x - this.pos.x, d.o.z - this.pos.z) > 0.75) continue;
      this.gp.doors.open(d, this.pos.x, this.pos.z, true);
    }
    // pas (audio / bruit)
    this.stepDist += this.speed * dt;
    const stride = this.speed > 3.5 ? 1.45 : 0.8;
    if (this.stepDist > stride) {
      this.stepDist = 0;
      this.emit("step", { x: this.pos.x, y: this.pos.y, z: this.pos.z, run: this.speed > 3.5 });
    }
  }

  private faceTowards(dx: number, dz: number, dt: number, mult: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return;
    const target = Math.atan2(dx, dz);
    let diff = target - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = CONFIG.ai.turnRate * mult * dt;
    this.yaw += Math.max(-maxStep, Math.min(maxStep, diff));
  }

  // ------------------------------------------------------------------ états

  private setState(s: MonsterState): void {
    if (s === this.state) return;
    const prev = this.state;
    this.state = s;
    this.stateTime = 0;
    this.repath = 0;
    if (s === "chase" && prev !== "chase") this.emit("alert", undefined);
    if (s === "search" && prev === "chase") this.emit("lost", undefined);
  }

  private pickWaypoint(): Vector3 {
    const gp = this.gp;
    const p = gp.player;
    const r = this.rng.next();
    // près des objectifs restants du joueur
    if (r < this.cfg.patrolObjectiveBias) {
      const pts: Vector3[] = [];
      for (const it of gp.items.items) if (it.inWorld) pts.push(new Vector3(it.x, it.y, it.z));
      if (pts.length) return this.nav.randomAround(this.rng.pick(pts), 4, this.flags);
    }
    // souvent au même étage que le joueur (sans tricher sur sa position exacte)
    const pf = gp.world.roomAt(p.x, p.y + 0.5, p.z)?.floor;
    if (r < 0.55 && pf) {
      const same = this.waypoints.filter((w) => w.floor === pf && Math.hypot(w.p.x - p.x, w.p.z - p.z) < 30);
      if (same.length) return this.rng.pick(same).p;
    }
    return this.rng.pick(this.waypoints).p;
  }

  /** Point de fouille autour du centre de recherche. */
  private searchPoint(): Vector3 {
    return this.nav.randomAround(this.searchCenter, 7, this.flags);
  }

  private startSearch(center: Vector3, duration: number): void {
    this.searchCenter.copyFrom(center);
    this.searchUntil = this.time + duration;
    this.setState("search");
    this.goTo(center);
    this.waitTimer = 0;
  }

  /** Cachettes proches du centre de recherche, pas encore fouillées. */
  private nearbyHide(): HidingCandidate | null {
    const c = this.searchCenter;
    let best: HidingCandidate | null = null;
    let bestD = 8;
    for (const h of this.gp.world.hiding) {
      if (this.checked.has(h)) continue;
      if (Math.abs(h.inst.y - c.y) > 1.5) continue;
      const d = Math.hypot(h.inst.x - c.x, h.inst.z - c.z);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  /** Point d'approche devant une cachette. */
  private hideApproach(h: HidingCandidate): Vector3 {
    const inst = h.inst;
    const [x, z] = this.gp.props.toWorld(inst, 0, h.kind === "wardrobe" || h.kind === "lockers" ? 0.85 : 0);
    const side = h.kind === "bed" || h.kind === "stretcher" ? this.gp.props.toWorld(inst, 0.95, 0) : [x, z];
    return this.nav.closest(new Vector3(side[0]!, inst.y, side[1]!), this.flags);
  }

  private startCheck(h: HidingCandidate): void {
    this.hideTarget = h;
    this.hideTimer = 0;
    this.checked.add(h);
    this.setState("checkHide");
    this.goTo(this.hideApproach(h));
  }

  // ------------------------------------------------------------------ boucle

  update(dt: number, now: number, runTime: number): void {
    if (!this.enabled) return;
    this.time = runTime;
    const gp = this.gp;
    const p = gp.player;
    const cfg = this.cfg;
    const speedMult = this.lockdown ? CONFIG.ai.lockdown.speed : 1;
    this.stateTime += dt;
    void now;

    // --- perception
    const perceive = this.time >= this.graceUntil && this.state !== "capture";
    const wasVisible = this.visible;
    this.visible = perceive && this.canSee();
    // entrée dans une cachette sous ses yeux
    const hp = gp.hiding.phase;
    if (hp === "enter" && this.lastHidePhase === "none" && (wasVisible || this.state === "chase") && perceive) {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d < cfg.visionRange && gp.hiding.spot) {
        this.sawHide = gp.hiding.spot;
        this.detect("sawHide", gp.hiding.spot.kind, p.x, p.y, p.z);
      }
    }
    this.lastHidePhase = hp;
    if (this.visible) {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      const close = 1 + 2.5 * Math.max(0, 1 - d / cfg.visionRange);
      this.awareness = Math.min(1.2, this.awareness + (dt / cfg.reaction) * close);
      this.lastSeen.set(p.x, p.y, p.z);
      this.lastSeenVel.set(p.body.vx, 0, p.body.vz);
      this.lastSeenTime = this.time;
    } else {
      this.awareness = Math.max(0, this.awareness - dt * (this.state === "chase" ? 0.15 : 0.35));
    }
    if (this.visible && this.awareness >= 1 && this.state !== "chase" && this.state !== "capture") {
      this.detect("sight", this.sightDetail(), p.x, p.y, p.z);
      this.setState("chase");
    }
    // bruits entendus
    const noise = this.pendingNoise;
    this.pendingNoise = null;
    if (noise && this.state !== "capture") {
      const at = new Vector3(noise.x, noise.y, noise.z);
      if (this.state === "chase") {
        if (!this.visible && noise.byPlayer) {
          this.lastSeen.copyFrom(at);
          this.lastSeenTime = this.time;
        }
      } else {
        if (noise.byPlayer) this.detect("noise", noise.detail ? `${noise.kind}:${noise.detail}` : noise.kind, noise.x, noise.y, noise.z);
        this.setState("investigate");
        this.goTo(this.nav.closest(at, this.flags));
        this.awareness = Math.max(this.awareness, 0.35);
      }
    }
    // confinement : il « sait » périodiquement où tu es
    if (this.lockdown && this.state !== "chase" && this.state !== "capture") {
      this.pingTimer -= dt;
      if (this.pingTimer <= 0) {
        this.pingTimer = CONFIG.ai.lockdown.pingInterval;
        this.detect("ping", "", p.x, p.y, p.z);
        this.setState("investigate");
        this.goTo(this.nav.closest(new Vector3(p.x, p.y, p.z), this.flags));
      }
    }

    // --- comportement
    let gait: Gait = "walk";
    this.lookW = 0;
    switch (this.state) {
      case "patrol": {
        this.targetSpeed = cfg.walkSpeed * speedMult;
        if (this.arrived()) {
          gait = "idle";
          this.waitTimer -= dt;
          if (this.waitTimer <= 0) {
            this.goTo(this.pickWaypoint());
            this.waitTimer = 1.2 + this.rng.next() * 2.4;
          }
        }
        break;
      }
      case "investigate": {
        this.targetSpeed = cfg.walkSpeed * 1.35 * speedMult;
        if (this.arrived()) {
          gait = "search";
          this.targetSpeed = 0;
          if (this.stateTime > 0.5 && this.waitTimer <= 0) this.waitTimer = 2.5 + this.rng.next() * 1.5;
          this.waitTimer -= dt;
          if (this.waitTimer <= 0.05) {
            this.waitTimer = 0;
            this.startSearch(this.pos, cfg.searchTime * 0.5);
          }
        }
        break;
      }
      case "chase": {
        gait = "run";
        this.targetSpeed = cfg.runSpeed * speedMult;
        this.lookW = 1;
        this.lookPos.set(p.x, p.y + 1.5, p.z);
        this.repath -= dt;
        // le joueur s'est caché sous ses yeux : il va l'en sortir
        if (this.sawHide && gp.hiding.hidden) {
          const h = this.sawHide;
          this.sawHide = null;
          if (this.rng.next() < cfg.sawEnterCheck) {
            this.startCheck(h);
            this.hideSeen = true;
            break;
          }
          this.startSearch(this.lastSeen, cfg.searchTime);
          break;
        }
        if (this.visible || this.time - this.lastSeenTime < 0.4) {
          if (this.repath <= 0) {
            this.repath = CONFIG.ai.repathChase;
            if (!this.goTo(new Vector3(p.x, p.y, p.z))) this.goTo(this.nav.closest(new Vector3(p.x, p.y, p.z), this.flags));
          }
          // capture
          const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
          if (
            d < CONFIG.ai.captureRange &&
            Math.abs(p.y - this.pos.y) < 1.2 &&
            !gp.hiding.hidden &&
            gp.collision.lineOfSight(this.pos.x, this.pos.y + 1.3, this.pos.z, p.x, p.y + 1.0, p.z, CollisionMask.SIGHT)
          )
            this.startCapture("chase");
        } else if (this.time - this.lastSeenTime > CONFIG.ai.loseSightTime) {
          // anticipation : on cherche là où il devrait être
          const pred = this.lastSeen.clone();
          if (cfg.anticipation > 0) pred.addInPlace(this.lastSeenVel.scale(1.8 * cfg.anticipation));
          this.startSearch(this.nav.closest(pred, this.flags), cfg.searchTime);
        } else if (this.repath <= 0) {
          this.repath = CONFIG.ai.repathChase;
          this.goTo(this.lastSeen);
        }
        break;
      }
      case "search": {
        gait = "search";
        this.targetSpeed = cfg.searchSpeed * speedMult;
        if (this.time > this.searchUntil) {
          this.setState("patrol");
          this.waitTimer = 0.8;
          this.path = [];
          break;
        }
        if (this.arrived()) {
          this.targetSpeed = 0;
          this.waitTimer -= dt;
          if (this.waitTimer <= 0) {
            const h = this.nearbyHide();
            if (h && this.rng.next() < cfg.hideCheck) {
              this.startCheck(h);
              this.hideSeen = false;
              break;
            }
            this.goTo(this.searchPoint());
            this.waitTimer = 1 + this.rng.next() * 1.5;
          }
        }
        break;
      }
      case "checkHide": {
        gait = "walk";
        this.targetSpeed = cfg.walkSpeed * 1.2 * speedMult;
        const h = this.hideTarget!;
        if (this.arrived()) {
          gait = "idle";
          this.faceTowards(h.inst.x - this.pos.x, h.inst.z - this.pos.z, dt, 1);
          this.hideTimer += dt;
          if (this.hideTimer > 0.5 && gp.hiding.hidden && gp.hiding.spot === h) {
            // trouvé : il l'en arrache
            gp.hiding.forceOut(gp);
            this.startCapture(this.hideSeen ? "hideSaw" : "hideSearch");
            break;
          }
          if (this.hideTimer > 1.4) {
            this.hideTarget = null;
            if (this.searchUntil < this.time) this.searchUntil = this.time + cfg.searchTime * 0.4;
            this.setState("search");
            this.waitTimer = 0.4;
          }
        }
        break;
      }
      case "capture":
        this.updateCapture(dt);
        break;
    }

    if (this.state !== "capture") this.follow(dt);

    // --- gestes
    const gk = 1 - Math.exp(-8 * dt);
    const reaching = (this.door !== null) || (this.state === "checkHide" && this.arrived() && this.hideTarget && (this.hideTarget.kind === "wardrobe" || this.hideTarget.kind === "lockers"));
    const bending = this.state === "checkHide" && this.arrived() && this.hideTarget && (this.hideTarget.kind === "bed" || this.hideTarget.kind === "stretcher");
    this.reachW += ((reaching ? 1 : 0) - this.reachW) * gk;
    this.bendW += ((bending ? 1 : 0) - this.bendW) * gk;
    if (this.state !== "chase" && this.visible) {
      this.lookW = Math.min(1, this.awareness * 1.5);
      this.lookPos.set(p.x, p.y + 1.5, p.z);
    }
    this.place();
    const a = this.animIn;
    a.dt = dt;
    a.time = this.time;
    a.speed = this.traversal ? 0 : this.speed;
    a.gait = this.traversal ? "run" : gait;
    a.reach = this.reachW;
    a.reachHeight = this.door ? 0 : 0.1;
    a.bend = this.bendW;
    a.lunge = this.lungeW;
    a.jump = this.traversal ? Math.min(1, this.traversal.t) : 0;
    a.look = this.lookW > 0 ? this.lookPos : null;
    a.lookWeight = this.lookW;
    this.anim.update(a, this.pos.x, this.pos.y, this.pos.z, this.yaw, (x, z, maxY) => this.gp.collision.groundHeight(x, z, maxY, CollisionMask.MONSTER));

    // éclairage précalculé à sa position + visibilité (culling par zones)
    const zone = gp.world.roomAt(this.pos.x, this.pos.y + 0.5, this.pos.z)?.id ?? "ext";
    if (this.plugin && this.baker) {
      const pr = this.baker.probe(this.pos.x, this.pos.y + 1.2, this.pos.z, zone);
      for (let i = 0; i < 4; i++) {
        this.plugin.probe[i] = pr[i]!;
        this.plugin.probe2[i] = pr[i + 4]!;
      }
    }
    this.setVisible(this.isZoneVisible(zone) || this.state === "capture");
    this.debugInfo = `${this.state} aw=${this.awareness.toFixed(2)} vis=${this.visible} v=${this.speed.toFixed(1)} pos=${this.pos.x.toFixed(1)},${this.pos.y.toFixed(1)},${this.pos.z.toFixed(1)} path=${this.pathIdx}/${this.path.length}`;
  }

  /** Cinématiques : pose le monstre et l'anime sans IA. */
  cinematic(dt: number, time: number, x: number, y: number, z: number, yaw: number, gait: Gait, speed: number, look: Vector3 | null): void {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.place();
    const a = this.animIn;
    a.dt = dt;
    a.time = time;
    a.speed = speed;
    a.gait = gait;
    a.reach = 0;
    a.bend = 0;
    a.lunge = 0;
    a.jump = 0;
    a.look = look;
    a.lookWeight = look ? 1 : 0;
    this.anim.update(a, x, y, z, yaw, (px, pz, maxY) => this.gp.collision.groundHeight(px, pz, maxY, CollisionMask.MONSTER));
    this.stepDist += speed * dt;
    if (this.stepDist > (speed > 3.5 ? 1.45 : 0.8)) {
      this.stepDist = 0;
      this.emit("step", { x, y, z, run: speed > 3.5 });
    }
    const zone = this.gp.world.roomAt(x, y + 0.5, z)?.id ?? "ext";
    if (this.plugin && this.baker) {
      const pr = this.baker.probe(x, y + 1.2, z, zone);
      for (let i = 0; i < 4; i++) {
        this.plugin.probe[i] = pr[i]!;
        this.plugin.probe2[i] = pr[i + 4]!;
      }
    }
    this.setVisible(true);
  }

  /** Cinématiques : masqué jusqu'à son apparition. */
  hide(): void {
    this.setVisible(false);
  }

  /** Après l'intro : reprend sa route depuis sa position actuelle. */
  resumeAfterCinematic(): void {
    this.enabled = true;
    const away = this.waypoints.filter((w) => w.floor === "G" && w.p.z > 30);
    if (away.length) this.goTo(this.rng.pick(away).p);
    this.state = "patrol";
    this.stateTime = 0;
  }

  private place(): void {
    const r = this.rig.root;
    r.position.copyFrom(this.pos);
    r.rotation.set(0, this.yaw, 0);
  }

  // ------------------------------------------------------------------ capture

  private startCapture(how: "chase" | "hideSaw" | "hideSearch"): void {
    if (this.state === "capture") return;
    const pl = this.gp.player;
    this.detect("capture", how, pl.x, pl.y, pl.z);
    this.setState("capture");
    this.capT = 0;
    this.path = [];
    this.traversal = null;
    this.door = null;
    const p = this.gp.player;
    p.controlEnabled = false;
    p.frozen = true;
    p.rig.overridden = true;
    this.emit("capture", undefined);
    this.gp.noise.make(this.pos.x, this.pos.y + 1.5, this.pos.z, 30, "slam", false);
  }

  private updateCapture(dt: number): void {
    const p = this.gp.player;
    this.capT += dt;
    const t = this.capT;
    // le monstre fond sur le joueur
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.faceTowards(dx, dz, dt, 4);
    if (d > 0.55) {
      const step = Math.min(d - 0.55, dt * 6);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
    }
    this.speed = 0;
    this.lungeW = Math.min(1, t / 0.28);
    this.lookW = 1;
    // la caméra est arrachée vers son visage
    const cam = p.rig.camera;
    const hx = this.pos.x;
    const hy = this.pos.y + 1.75 + this.lungeW * 0.1;
    const hz = this.pos.z;
    this.lookPos.set(cam.position.x, cam.position.y, cam.position.z);
    const ty = Math.atan2(hx - cam.position.x, hz - cam.position.z);
    const tp = -Math.atan2(hy - cam.position.y, Math.hypot(hx - cam.position.x, hz - cam.position.z));
    const k = 1 - Math.exp(-14 * dt);
    let dyaw = ty - p.rig.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.rig.yaw += dyaw * k;
    p.rig.pitch += (tp - p.rig.pitch) * k;
    const shake = t > 0.35 ? (1.1 - Math.min(1.1, t)) * 0.06 : 0;
    cam.rotation.set(p.rig.pitch + (Math.random() - 0.5) * shake, p.rig.yaw + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 2);
    if (t > 0.45) this.gp.hud.captureFlash();
    if (t > 1.05 && this.onCaught) {
      const cb = this.onCaught;
      this.enabled = false;
      cb();
    }
  }
}
