import type { OpeningPlacement } from "../world/builder/ArchitectureBuilder";
import type { World } from "../world/World";
import type { GameContext } from "./Context";
import type { Interactable, Prompt } from "./Interaction";

interface Vault {
  o: OpeningPlacement;
  p0: [number, number, number];
  p1: [number, number, number];
  p2: [number, number, number];
  t: number;
  dur: number;
}

/** Fenêtres cassées : enjamber le rebord (ou sauter dans la cour depuis l'étage). */
export class VaultSystem {
  readonly windows: OpeningPlacement[];
  private active: Vault | null = null;
  private landing = false;

  constructor(private readonly world: World) {
    this.windows = world.openings.filter((o) => o.kind === "window" && o.broken);
  }

  get busy(): boolean {
    return this.active !== null;
  }

  reset(): void {
    this.active = null;
  }

  private normal(o: OpeningPlacement): [number, number] {
    return o.axis === "x" ? [0, 1] : [1, 0];
  }

  interactables(): Interactable[] {
    return this.windows.map((o) => {
      const [nx, nz] = this.normal(o);
      const drop = !o.roomA || !o.roomB ? (o.floor === "U" ? true : false) : false;
      return {
        id: `vault_${o.id}`,
        active: () => this.active === null,
        shape: () => ({
          kind: "box" as const,
          cx: o.x,
          cy: o.y + o.bottom + 0.55,
          cz: o.z,
          hx: o.axis === "x" ? o.width / 2 : 0.3,
          hy: 0.6,
          hz: o.axis === "x" ? 0.3 : o.width / 2,
          cos: 1,
          sin: 0,
        }),
        prompt: (): Prompt => ({ text: drop ? "Sauter dans la cour (4 m)" : "Enjamber la fenêtre", enabled: true }),
        interact: (ctx) => this.start(o, nx, nz, ctx),
      };
    });
  }

  private start(o: OpeningPlacement, nx: number, nz: number, ctx: GameContext): void {
    const p = ctx.player;
    const side = (p.x - o.x) * nx + (p.z - o.z) * nz >= 0 ? 1 : -1;
    const along = o.axis === "x" ? Math.max(o.x - o.width / 2 + 0.35, Math.min(o.x + o.width / 2 - 0.35, p.x)) : Math.max(o.z - o.width / 2 + 0.35, Math.min(o.z + o.width / 2 - 0.35, p.z));
    const wx = o.axis === "x" ? along : o.x;
    const wz = o.axis === "x" ? o.z : along;
    const sill = o.y + o.bottom + 0.04;
    const tx = wx - nx * side * 0.65;
    const tz = wz - nz * side * 0.65;
    const g = this.world.collisionGround(tx, tz, sill + 0.2);
    const land = g > sill - 1.4 ? g : sill;
    this.active = { o, p0: [p.x, p.y, p.z], p1: [wx, sill, wz], p2: [tx, land, tz], t: 0, dur: 0.6 };
    p.controlEnabled = false;
    p.frozen = true;
    p.crouched = true;
    ctx.noise.make(wx, sill, wz, 7, "glass");
    ctx.sfx("vault_glass", wx, sill, wz);
  }

  update(dt: number, ctx: GameContext): void {
    const v = this.active;
    if (!v) return;
    v.t += dt;
    const u = Math.min(1, v.t / v.dur);
    const e = u * u * (3 - 2 * u);
    // courbe de Bézier quadratique passant au-dessus du rebord
    const c: [number, number, number] = [v.p1[0], v.p1[1] + 0.35, v.p1[2]];
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const d = e * e;
    const x = a * v.p0[0] + b * c[0] + d * v.p2[0];
    const y = a * v.p0[1] + b * c[1] + d * v.p2[1];
    const z = a * v.p0[2] + b * c[2] + d * v.p2[2];
    ctx.player.placeBody(x, y, z);
    if (u >= 1) {
      this.active = null;
      ctx.player.frozen = false;
      ctx.player.controlEnabled = true;
      ctx.player.body.grounded = false;
      if (v.p2[1] > v.p1[1] - 0.5 && v.p1[1] - v.o.y > 2) this.landing = true;
    }
    if (this.landing && ctx.player.body.grounded) {
      this.landing = false;
      ctx.sfx("land", ctx.player.x, ctx.player.y, ctx.player.z);
    }
  }
}
