import { CONFIG, type Difficulty } from "../config";
import type { Rng } from "../core/Rng";
import { Region, type ModelKit, type PartStyle } from "../world/props/ModelKit";
import type { PropDef, PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import { floorFree } from "./Anchors";
import type { GameContext } from "./Context";

const MAX_TRAPS = 8;
const HOLD_TIME = 2.4;

const RUST: PartStyle = { region: Region.RUST };
const STEEL: PartStyle = { region: Region.STEEL, color: [0.6, 0.6, 0.62] };

/** Piège à mâchoires (ouvert : à plat ; fermé : mâchoires dressées). */
function trapModel(closed: boolean): (k: ModelKit) => void {
  return (k) => {
    k.cylinder([0, 0, 0], [0, 0.02, 0], 0.07, 10, RUST);
    k.boxMM(-0.2, 0, -0.018, 0.2, 0.015, 0.018, RUST);
    k.cylinder([0, 0.02, 0], [0, 0.03, 0], 0.045, 8, STEEL);
    for (const s of [-1, 1]) {
      k.push();
      if (closed) k.translate(0, 0.01, 0).rotateX(s * -1.35);
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI;
        pts.push([Math.cos(a) * 0.17, 0.012, s * Math.sin(a) * 0.15]);
      }
      k.tube(pts, 0.008, 4, STEEL);
      for (let i = 1; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        const x = Math.cos(a) * 0.17;
        const z = s * Math.sin(a) * 0.15;
        k.cylinder([x, 0.012, z], [x * 0.9, 0.045, z * 0.85], 0.006, 3, STEEL, true, 0.001);
      }
      k.pop();
    }
  };
}

export function trapPropDefs(): PropDef[] {
  return [
    { id: "trap_open", shadow: true, build: trapModel(false) },
    { id: "trap_closed", shadow: true, build: trapModel(true) },
  ];
}

interface Trap {
  open: PropInstance;
  closed: PropInstance;
  x: number;
  y: number;
  z: number;
  armed: boolean;
  active: boolean;
}

/**
 * Pièges à mâchoires posés dans les couloirs (difficulté Difficile et au-delà) : marcher dessus
 * immobilise un instant et fait un bruit énorme. Emplacements tirés par la seed.
 */
export class TrapSystem {
  private traps: Trap[] = [];
  private spots: Array<{ x: number; y: number; z: number; room: string; sector: string }> = [];
  private held = 0;

  constructor(
    private readonly world: World,
    private readonly props: PropSystem,
  ) {
    for (let i = 0; i < MAX_TRAPS; i++) {
      const open = props.add("trap_open", 0, -50, 0, 0, "ext", "*", { hidden: true });
      const closed = props.add("trap_closed", 0, -50, 0, 0, "ext", "*", { hidden: true });
      this.traps.push({ open, closed, x: 0, y: -50, z: 0, armed: false, active: false });
    }
    // emplacements candidats : axe des couloirs, loin des portes
    for (const r of world.layout.rooms) {
      if (r.kind !== "corridor") continue;
      const y = world.floorY(r.floor);
      const [x0, z0, x1, z1] = r.rect;
      const alongX = x1 - x0 >= z1 - z0;
      const len = alongX ? x1 - x0 : z1 - z0;
      const doors = world.openings.filter((o) => o.roomA === r || o.roomB === r);
      for (let t = 2; t < len - 2; t += 3) {
        const x = alongX ? x0 + t : (x0 + x1) / 2 + ((t * 7) % 3 === 0 ? 0.5 : -0.5);
        const z = alongX ? (z0 + z1) / 2 + ((t * 7) % 3 === 0 ? 0.5 : -0.5) : z0 + t;
        if (doors.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
        if (!floorFree(world.collision, x, y, z, 0.35, 1.2)) continue;
        this.spots.push({ x, y, z, room: r.id, sector: r.sector });
      }
    }
  }

  /** Place les pièges de la run. */
  reset(difficulty: Difficulty, rng: Rng): void {
    const n = Math.min(MAX_TRAPS, CONFIG.ai.difficulty[difficulty].traps);
    const spots = rng.shuffle([...this.spots]);
    const chosen: typeof spots = [];
    for (const s of spots) {
      if (chosen.length >= n) break;
      // pas deux pièges trop proches, ni à côté du départ
      if (chosen.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 10)) continue;
      if (Math.hypot(s.x - this.world.spawn.x, s.z - this.world.spawn.z) < 18 && s.y === 0) continue;
      chosen.push(s);
    }
    this.traps.forEach((t, i) => {
      const s = chosen[i];
      t.active = !!s;
      t.armed = !!s;
      this.props.setHidden(t.closed, true);
      if (!s) {
        this.props.setHidden(t.open, true);
        return;
      }
      t.x = s.x;
      t.y = s.y;
      t.z = s.z;
      const yaw = rng.next() * Math.PI;
      for (const inst of [t.open, t.closed]) {
        this.props.setZone(inst, s.room, s.sector);
        this.props.move(inst, s.x, s.y, s.z, yaw);
        this.props.relight(inst);
      }
      this.props.setHidden(t.open, false);
    });
    this.held = 0;
  }

  get count(): number {
    return this.traps.filter((t) => t.active).length;
  }

  update(dt: number, ctx: GameContext): void {
    const p = ctx.player;
    if (this.held > 0) {
      this.held -= dt;
      p.speedScale = this.held > 0 ? 0 : 1;
    }
    if (ctx.hudBusy()) return;
    for (const t of this.traps) {
      if (!t.armed) continue;
      if (Math.abs(p.y - t.y) > 0.5 || Math.hypot(p.x - t.x, p.z - t.z) > 0.36) continue;
      t.armed = false;
      this.props.setHidden(t.open, true);
      this.props.setHidden(t.closed, false);
      this.held = HOLD_TIME;
      p.speedScale = 0;
      ctx.noise.make(t.x, t.y + 0.3, t.z, 40, "trap");
      ctx.sfx("trap", t.x, t.y + 0.2, t.z);
      ctx.toast("Un piège ! Le claquement résonne dans tout l'étage…", 2.4);
    }
  }
}
