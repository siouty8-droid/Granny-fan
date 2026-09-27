import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG } from "../config";
import type { Input } from "../core/Input";
import { CollisionMask, containsXZ, type Collider } from "../physics/Collider";
import type { GameContext } from "./Context";

/** Forme de visée : sphère ou boîte orientée autour de Y. */
export type Shape =
  | { kind: "sphere"; x: number; y: number; z: number; r: number }
  | { kind: "box"; cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; cos: number; sin: number };

export interface Prompt {
  /** action proposée (« Ouvrir », « Ramasser — Badge rouge »…) */
  text: string;
  /** false : information seulement (verrou, objet manquant) */
  enabled: boolean;
  /** durée de maintien requise (s) ; 0 = appui simple */
  hold?: number;
}

/** Objet avec lequel le joueur peut interagir (visée + touche d'interaction). */
export interface Interactable {
  readonly id: string;
  /** interactif en ce moment ? (objet ramassé, coffre fermé…) */
  active(ctx: GameContext): boolean;
  shape(): Shape;
  prompt(ctx: GameContext): Prompt | null;
  interact(ctx: GameContext): void;
  /** colliders propres (ignorés pour le test d'occultation) */
  readonly own?: readonly Collider[];
  /** portée spécifique (défaut : CONFIG.player.interactRange) */
  readonly range?: number;
}

const _fwd = new Vector3();

/** Intersection rayon / forme : distance ou null. */
export function rayShape(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, s: Shape): number | null {
  if (s.kind === "sphere") {
    const lx = ox - s.x;
    const ly = oy - s.y;
    const lz = oz - s.z;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - s.r * s.r;
    if (c <= 0) return 0;
    const disc = b * b - c;
    if (disc < 0 || b > 0) return null;
    return -b - Math.sqrt(disc);
  }
  // boîte : repère local (x = (cos, sin), z = (-sin, cos))
  const px = ox - s.cx;
  const pz = oz - s.cz;
  const lox = px * s.cos + pz * s.sin;
  const loz = -px * s.sin + pz * s.cos;
  const loy = oy - s.cy;
  const ldx = dx * s.cos + dz * s.sin;
  const ldz = -dx * s.sin + dz * s.cos;
  let t0 = 0;
  let t1 = Infinity;
  const slab = (o: number, d: number, h: number): boolean => {
    if (Math.abs(d) < 1e-9) return Math.abs(o) <= h;
    let a = (-h - o) / d;
    let b = (h - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(lox, ldx, s.hx) || !slab(loy, dy, s.hy) || !slab(loz, ldz, s.hz)) return null;
  return t0;
}

function shapeCenter(s: Shape): [number, number, number] {
  return s.kind === "sphere" ? [s.x, s.y, s.z] : [s.cx, s.cy, s.cz];
}

/**
 * Visée des objets interactifs depuis la caméra : le plus proche le long du rayon, non occulté
 * (murs, meubles — sauf le meuble qui porte l'objet). Gère les appuis simples et les maintiens.
 */
export class InteractionSystem {
  readonly list: Interactable[] = [];
  current: Interactable | null = null;
  private holdTime = 0;
  private holdTarget: Interactable | null = null;
  /** suspendu (clavier à code ouvert, cachette, cinématique) */
  suspended = false;
  private lastHtml = "";
  private candidates: Array<{ it: Interactable; t: number }> = [];

  add(it: Interactable): void {
    this.list.push(it);
  }

  addAll(list: Interactable[]): void {
    for (const it of list) this.list.push(it);
  }

  reset(): void {
    this.current = null;
    this.holdTime = 0;
    this.holdTarget = null;
    this.lastHtml = "";
  }

  update(ctx: GameContext, input: Input, dt: number): void {
    if (this.suspended || !ctx.player.controlEnabled) {
      this.current = null;
      this.holdTarget = null;
      this.holdTime = 0;
      this.show(ctx, null, 0);
      return;
    }
    const cam = ctx.player.rig.camera.position;
    ctx.player.rig.forward(_fwd);
    this.current = this.pick(ctx, cam.x, cam.y, cam.z, _fwd.x, _fwd.y, _fwd.z);
    const prompt = this.current ? this.current.prompt(ctx) : null;

    // appui / maintien
    let progress = 0;
    if (this.current && prompt && prompt.enabled) {
      const hold = prompt.hold ?? 0;
      if (hold <= 0) {
        if (input.wasPressed("interact")) this.current.interact(ctx);
      } else {
        if (this.holdTarget !== this.current) {
          this.holdTarget = null;
          this.holdTime = 0;
        }
        if (input.isDown("interact") && (this.holdTarget === this.current || input.wasPressed("interact"))) {
          this.holdTarget = this.current;
          this.holdTime += dt;
          progress = Math.min(1, this.holdTime / hold);
          if (this.holdTime >= hold) {
            this.holdTarget = null;
            this.holdTime = 0;
            progress = 0;
            this.current.interact(ctx);
          }
        } else {
          this.holdTarget = null;
          this.holdTime = 0;
        }
      }
    } else {
      this.holdTarget = null;
      this.holdTime = 0;
    }
    this.show(ctx, this.current ? this.current.prompt(ctx) : null, progress);
  }

  private show(ctx: GameContext, prompt: Prompt | null, progress: number): void {
    let html = "";
    if (prompt) {
      const text = prompt.text.replace(/</g, "&lt;");
      if (prompt.enabled) {
        const key = ctx.keyLabel("interact");
        const hold = prompt.hold ? ` <span class="hold">(maintenir)</span>` : "";
        html = `<span class="key">${key}</span> ${text}${hold}`;
        if (progress > 0) html += `<div class="prompt-bar"><div style="transform:scaleX(${progress.toFixed(3)})"></div></div>`;
      } else {
        html = `<span class="locked">${text}</span>`;
      }
    }
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      ctx.hud.setPrompt(html, !!prompt && prompt.enabled);
    }
  }

  /** Objet visé : le plus proche le long du rayon, non occulté. */
  pick(ctx: GameContext, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): Interactable | null {
    const base = CONFIG.player.interactRange;
    const cands = this.candidates;
    cands.length = 0;
    for (const it of this.list) {
      const range = it.range ?? base;
      const s = it.shape();
      const [cx, cy, cz] = shapeCenter(s);
      const ddx = cx - ox;
      const ddy = cy - oy;
      const ddz = cz - oz;
      const reach = range + (s.kind === "sphere" ? s.r : Math.max(s.hx, s.hy, s.hz));
      if (ddx * ddx + ddy * ddy + ddz * ddz > reach * reach) continue;
      if (!it.active(ctx)) continue;
      const t = rayShape(ox, oy, oz, dx, dy, dz, s);
      if (t === null || t > range) continue;
      cands.push({ it, t });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.t - b.t);
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const { it, t } = cands[i]!;
      const [cx, cy, cz] = shapeCenter(it.shape());
      const own = it.own;
      const hit = ctx.collision.raycast(ox, oy, oz, dx, dy, dz, Math.max(0, t - 0.02), CollisionMask.SIGHT | CollisionMask.INTERACT, (c) => {
        if (own && own.includes(c)) return true;
        // le meuble qui porte l'objet ne le cache pas
        return containsXZ(c, cx, cz, 0.02) && cy >= c.minY - 0.05 && cy <= c.maxY + 0.3;
      });
      if (!hit) return it;
    }
    return null;
  }
}
