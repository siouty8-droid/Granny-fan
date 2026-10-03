import type { Input } from "../core/Input";
import { CONFIG } from "../config";
import type { HidingCandidate, HidingKind } from "../world/decor/Decorator";
import type { PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import { floorFree } from "./Anchors";
import type { GameContext } from "./Context";
import type { Interactable, Prompt } from "./Interaction";

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

type Phase = "none" | "enter" | "in" | "exit";

const ENTER_TIME = 0.38;
const EXIT_TIME = 0.32;
const DEG = Math.PI / 180;

const PROMPTS: Record<HidingKind, string> = {
  wardrobe: "Se cacher dans l'armoire",
  lockers: "Se cacher dans un casier",
  bed: "Se glisser sous le lit",
  stretcher: "Se glisser sous le brancard",
  fitting: "Se cacher dans la cabine d'essayage",
};

/** Cachette où l'on se tient debout derrière une porte / un rideau. */
const standing = (k: HidingKind): boolean => k === "wardrobe" || k === "lockers" || k === "fitting";

/** Son d'entrée / sortie. */
const hideSound = (k: HidingKind): string => (k === "fitting" ? "curtain" : standing(k) ? "cabinet" : "bed");

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Cachettes (armoires, casiers, sous les lits / brancards) : entrée et sortie animées,
 * vue limitée, lampe coupée, temps de recharge. Expose l'état pour l'IA (phase 6).
 */
export class HidingSystem {
  phase: Phase = "none";
  spot: HidingCandidate | null = null;
  private t = 0;
  private from: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private to: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private exitPose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private base: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private cooldown = 0;
  private flashWas = true;
  /** horodatage de l'entrée (l'IA vérifie si elle l'a vu entrer) */
  enteredAt = 0;
  /** position du corps pendant la cachette */
  readonly bodyPos = { x: 0, y: 0, z: 0 };
  /** modificateur « sans cachettes » */
  private disabled = false;

  constructor(
    private readonly world: World,
    private readonly props: PropSystem,
    private readonly candidates: HidingCandidate[],
  ) {}

  get hidden(): boolean {
    return this.phase !== "none";
  }

  reset(ctx: GameContext | null): void {
    if (this.phase !== "none" && ctx) {
      ctx.player.rig.overridden = false;
      ctx.player.frozen = false;
      ctx.hud.hideOverlay.hide();
    }
    this.phase = "none";
    this.spot = null;
    this.cooldown = 0;
    this.disabled = !!ctx && ctx.run.setup.modifiers.includes("noHiding");
  }

  interactables(): Interactable[] {
    return this.candidates.map((cand) => {
      const c = cand.inst.colliders[0];
      return {
        id: `hide_${cand.kind}_${cand.inst.index}_${cand.inst.x.toFixed(1)}`,
        own: cand.inst.colliders,
        active: () => this.phase === "none" && this.cooldown <= 0 && !!c,
        shape: () => ({
          kind: "box" as const,
          cx: c!.cx,
          cy: (c!.minY + c!.maxY) / 2,
          cz: c!.cz,
          hx: c!.hx,
          hy: (c!.maxY - c!.minY) / 2,
          hz: c!.hz,
          cos: c!.cos,
          sin: c!.sin,
        }),
        prompt: (): Prompt => (this.disabled ? { text: "Condamné (sans cachettes)", enabled: false } : { text: PROMPTS[cand.kind], enabled: true }),
        interact: (ctx) => {
          if (!this.disabled) this.enter(cand, ctx);
        },
      };
    });
  }

  /** Pose de la caméra dans la cachette + pose de sortie. */
  private poses(cand: HidingCandidate, px: number, pz: number): { hide: Pose; body: [number, number]; exit: Pose | null } {
    const inst = cand.inst;
    const P = this.props;
    const y = inst.y;
    const eye = CONFIG.player.eyeStand;
    // position du joueur dans le repère du meuble
    const dx = px - inst.x;
    const dz = pz - inst.z;
    const lx = dx * Math.cos(inst.yaw) - dz * Math.sin(inst.yaw);
    const exitCandidates: Array<[number, number, number]> = [];
    let hide: Pose;
    let body: [number, number];
    if (cand.kind === "fitting") {
      // debout derrière le rideau, l'œil contre l'interstice (côté droit, entre rideau et cloison)
      const [hx, hz] = P.toWorld(inst, 0.43, 0.3);
      hide = { x: hx, y: y + 1.6, z: hz, yaw: inst.yaw, pitch: 4 * DEG };
      body = P.toWorld(inst, 0, 0);
      exitCandidates.push([0, 0.55 + 0.5, inst.yaw], [0.5, 1.0, inst.yaw], [-0.5, 1.0, inst.yaw]);
    } else if (cand.kind === "wardrobe" || cand.kind === "lockers") {
      let cx = 0;
      if (cand.kind === "lockers") cx = Math.abs(lx) < 0.2 ? 0 : Math.sign(lx) * 0.4;
      // œil juste devant la porte (la vue « à travers les fentes » est simulée par l'overlay)
      const [hx, hz] = P.toWorld(inst, cx, cand.kind === "lockers" ? 0.3 : 0.34);
      hide = { x: hx, y: y + (cand.kind === "lockers" ? 1.55 : 1.6), z: hz, yaw: inst.yaw, pitch: 6 * DEG };
      body = P.toWorld(inst, cx, 0);
      exitCandidates.push([cx, 0.3 + 0.5, inst.yaw], [cx + 0.45, 0.85, inst.yaw], [cx - 0.45, 0.85, inst.yaw]);
    } else {
      const s = lx >= 0 ? 1 : -1;
      const [hx, hz] = P.toWorld(inst, s * 0.12, 0.15);
      const look = inst.yaw + s * (Math.PI / 2);
      hide = { x: hx, y: y + (cand.kind === "bed" ? 0.2 : 0.3), z: hz, yaw: look, pitch: -2 * DEG };
      body = P.toWorld(inst, 0, 0);
      const half = cand.kind === "bed" ? 0.5 : 0.36;
      exitCandidates.push([s * (half + 0.42), 0.1, look], [-s * (half + 0.42), 0.1, look - s * Math.PI], [0, 1.05 + 0.45, inst.yaw], [0, -1.05 - 0.45, inst.yaw + Math.PI]);
    }
    let exit: Pose | null = null;
    for (const [ex, ez, yaw] of exitCandidates) {
      const [wx, wz] = P.toWorld(inst, ex, ez);
      if (floorFree(this.world.collision, wx, y, wz, 0.3, 1.8)) {
        exit = { x: wx, y: y + eye, z: wz, yaw, pitch: 0 };
        break;
      }
    }
    return { hide, body, exit };
  }

  private enter(cand: HidingCandidate, ctx: GameContext): void {
    const p = ctx.player;
    const { hide, body, exit } = this.poses(cand, p.x, p.z);
    if (!exit) {
      ctx.toast("Pas assez de place pour se cacher ici.", 1.5);
      return;
    }
    const cam = p.rig.camera.position;
    this.from = { x: cam.x, y: cam.y, z: cam.z, yaw: p.rig.yaw, pitch: p.rig.pitch };
    this.to = hide;
    this.base = { ...hide };
    this.exitPose = exit;
    this.spot = cand;
    this.phase = "enter";
    this.t = 0;
    this.enteredAt = ctx.now;
    this.flashWas = p.flashlight.on;
    p.flashlight.setOn(false);
    p.controlEnabled = false;
    p.frozen = true;
    p.rig.overridden = true;
    this.bodyPos.x = body[0];
    this.bodyPos.y = cand.inst.y;
    this.bodyPos.z = body[1];
    ctx.noise.make(cand.inst.x, cand.inst.y + 0.8, cand.inst.z, 3, "door", true, "hide");
    ctx.sfx("hide", cand.inst.x, cand.inst.y + 0.8, cand.inst.z, hideSound(cand.kind));
  }

  private startExit(ctx: GameContext): void {
    const cam = ctx.player.rig.camera.position;
    this.from = { x: cam.x, y: cam.y, z: cam.z, yaw: ctx.player.rig.yaw, pitch: ctx.player.rig.pitch };
    this.to = this.exitPose;
    this.phase = "exit";
    this.t = 0;
    ctx.hud.hideOverlay.hide();
    const s = this.spot!;
    ctx.noise.make(s.inst.x, s.inst.y + 0.8, s.inst.z, 4, "door", true, "hide");
    ctx.sfx("hide", s.inst.x, s.inst.y + 0.8, s.inst.z, hideSound(s.kind));
  }

  /** Sortie forcée (capture par l'IA, restart). */
  forceOut(ctx: GameContext): void {
    if (this.phase === "none") return;
    const p = ctx.player;
    p.placeBody(this.exitPose.x, this.exitPose.y - CONFIG.player.eyeStand, this.exitPose.z);
    p.rig.overridden = false;
    p.frozen = false;
    ctx.hud.hideOverlay.hide();
    this.phase = "none";
    this.spot = null;
  }

  update(dt: number, ctx: GameContext, input: Input): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.phase === "none") return;
    const p = ctx.player;
    const rig = p.rig;
    const cam = rig.camera;
    if (this.phase === "enter" || this.phase === "exit") {
      this.t += dt;
      const dur = this.phase === "enter" ? ENTER_TIME : EXIT_TIME;
      const u = Math.min(1, this.t / dur);
      const e = u * u * (3 - 2 * u);
      const f = this.from;
      const to = this.to;
      const x = f.x + (to.x - f.x) * e;
      const z = f.z + (to.z - f.z) * e;
      // léger passage bas au milieu (on se baisse pour entrer / sortir)
      const dip = this.spot && !standing(this.spot.kind) ? 0 : Math.sin(e * Math.PI) * 0.12;
      const y = f.y + (to.y - f.y) * e - dip;
      const yaw = f.yaw + wrapAngle(to.yaw - f.yaw) * e;
      const pitch = f.pitch + (to.pitch - f.pitch) * e;
      cam.position.set(x, y, z);
      cam.rotation.set(pitch, yaw, 0);
      rig.yaw = yaw;
      rig.pitch = pitch;
      if (u >= 1) {
        if (this.phase === "enter") {
          this.phase = "in";
          this.t = 0;
          p.placeBody(this.bodyPos.x, this.bodyPos.y, this.bodyPos.z);
          const kind = this.spot!.kind;
          ctx.hud.hideOverlay.show(kind === "fitting" ? "curtain" : standing(kind) ? "cabinet" : "bed", `${ctx.keyLabel("interact")} : sortir`);
        } else {
          const ex = this.exitPose;
          p.placeBody(ex.x, ex.y - CONFIG.player.eyeStand, ex.z);
          rig.yaw = ex.yaw;
          rig.pitch = 0;
          rig.overridden = false;
          p.frozen = false;
          p.crouched = false;
          p.controlEnabled = true;
          if (this.flashWas) p.flashlight.setOn(true);
          this.phase = "none";
          this.spot = null;
          this.cooldown = 0.8;
        }
      }
      return;
    }
    // dans la cachette : regard limité
    rig.applyMouse(p.mouse.x, p.mouse.y);
    const b = this.base;
    const dy = wrapAngle(rig.yaw - b.yaw);
    const lim = 55 * DEG;
    if (dy > lim) rig.yaw = b.yaw + lim;
    if (dy < -lim) rig.yaw = b.yaw - lim;
    rig.pitch = Math.max(b.pitch - 25 * DEG, Math.min(b.pitch + 30 * DEG, rig.pitch));
    cam.position.set(b.x, b.y, b.z);
    cam.rotation.set(rig.pitch, rig.yaw, 0);
    if (input.wasPressed("interact") && this.t > 0.15) this.startExit(ctx);
    this.t += dt;
  }
}
