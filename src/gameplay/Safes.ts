import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { GameContext } from "./Context";
import { SAFES, type CodeId, type SafeDef } from "./data/spawns";
import type { Interactable, Prompt } from "./Interaction";

interface SafeState {
  def: SafeDef;
  body: PropInstance;
  door: PropInstance;
  open: boolean;
  /** progression d'ouverture 0..1 */
  angle: number;
  hx: number;
  hz: number;
  y: number;
}

const OPEN_ANGLE = (105 * Math.PI) / 180;

/** Coffres (à code ou à clé) : porte animée, clavier, contenu révélé à l'ouverture. */
export class SafeSystem {
  readonly safes: SafeState[] = [];
  /** codes de la run */
  codes = new Map<CodeId, string>();
  onOpen: ((id: string) => void) | null = null;
  /** ouvre le clavier à code (fourni par le gameplay) */
  openKeypad: ((title: string, code: CodeId, check: (code: string) => boolean, x: number, y: number, z: number) => void) | null = null;

  constructor(
    world: World,
    private readonly props: PropSystem,
  ) {
    for (const def of SAFES) {
      const room = world.layout.rooms.find((r) => r.id === def.room)!;
      const y = world.floorY(room.floor);
      const body = props.add("safe_body", def.x, y, def.z, def.yaw, room.id, room.sector);
      const [hx, hz] = props.toWorld(body, -0.29, 0.35);
      const door = props.add(def.lock === "code" ? "safe_door_code" : "safe_door_key", hx, y + 0.1, hz, def.yaw, room.id, room.sector);
      this.safes.push({ def, body, door, open: false, angle: 0, hx, hz, y });
    }
  }

  get bodies(): PropInstance[] {
    return this.safes.map((s) => s.body);
  }

  reset(codes: Map<CodeId, string>): void {
    this.codes = codes;
    for (const s of this.safes) {
      s.open = false;
      s.angle = 0;
      this.props.move(s.door, s.hx, s.y + 0.1, s.hz, s.def.yaw);
    }
  }

  isOpen(id: string): boolean {
    return this.safes.find((s) => s.def.id === id)?.open ?? false;
  }

  private openSafe(s: SafeState, ctx: GameContext): void {
    s.open = true;
    ctx.noise.make(s.hx, s.y + 0.5, s.hz, 5, "unlock");
    ctx.sfx("safe_open", s.hx, s.y + 0.5, s.hz);
    ctx.split(`safe_${s.def.id}`, s.def.label);
    this.onOpen?.(s.def.id);
  }

  update(dt: number): void {
    for (const s of this.safes) {
      const target = s.open ? 1 : 0;
      if (s.angle === target) continue;
      s.angle = Math.min(target, s.angle + dt * 1.6);
      const e = 1 - (1 - s.angle) ** 3;
      this.props.move(s.door, s.hx, s.y + 0.1, s.hz, s.def.yaw - e * OPEN_ANGLE);
    }
  }

  interactables(): Interactable[] {
    return this.safes.map((s) => {
      const c = Math.cos(-s.def.yaw);
      const sn = Math.sin(-s.def.yaw);
      const [cx, cz] = this.props.toWorld(s.body, 0, 0.36);
      return {
        id: `safe_${s.def.id}`,
        own: s.body.colliders,
        active: () => !s.open,
        shape: () => ({ kind: "box" as const, cx, cy: s.y + 0.47, cz, hx: 0.33, hy: 0.42, hz: 0.06, cos: c, sin: sn }),
        prompt: (ctx): Prompt => {
          if (s.def.lock === "key") {
            return ctx.inventory.has("safeKey") ? { text: `Ouvrir — ${ctx.itemName("safeKey")}`, enabled: true } : { text: `${s.def.label} — il faut une petite clé`, enabled: false };
          }
          return { text: `Composer le code — ${s.def.label}`, enabled: true };
        },
        interact: (ctx) => {
          if (s.def.lock === "key") {
            this.openSafe(s, ctx);
            return;
          }
          const codeId = s.def.code!;
          this.openKeypad?.(
            s.def.label,
            codeId,
            (code) => {
              if (code === this.codes.get(codeId)) {
                this.openSafe(s, ctx);
                return true;
              }
              ctx.noise.make(cx, s.y + 0.5, cz, 3, "keypad");
              return false;
            },
            cx,
            s.y + 0.5,
            cz,
          );
        },
      };
    });
  }
}
