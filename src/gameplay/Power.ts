import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { FusePanelDef } from "./data/rules";
import type { Interactable, Prompt } from "./Interaction";

const LEVER_OFF = 2.3;
const LEVER_ON = 0.45;

/**
 * Tableau électrique du sous-sol : deux fusibles à insérer puis levier à abaisser → courant
 * rétabli (ascenseur, voyants).
 */
export class PowerSystem {
  readonly board: PropInstance;
  private fuses: PropInstance[] = [];
  private socketLeds: PropInstance[] = [];
  private lever: PropInstance;
  private ledRed: PropInstance;
  private ledGreen: PropInstance;
  installed = [false, false];
  on = false;
  private leverAngle = LEVER_OFF;
  onPower: (() => void) | null = null;
  private readonly y: number;

  constructor(
    world: World,
    private readonly props: PropSystem,
    panel: FusePanelDef,
    private readonly toastText: string,
  ) {
    const f = panel;
    const room = world.layout.rooms.find((r) => r.id === f.room)!;
    this.y = world.floorY(room.floor);
    const y = this.y;
    this.board = props.add("fuse_board", f.x, y, f.z, f.yaw, room.id, room.sector);
    const at = (lx: number, ly: number, lz: number, id: string, hidden = false): PropInstance => {
      const [x, z] = props.toWorld(this.board, lx, lz);
      return props.add(id, x, y + ly, z, f.yaw, room.id, room.sector, { hidden });
    };
    for (const lx of [-0.2, 0.0]) {
      this.fuses.push(at(lx, 1.255, 0.3, "fuse_installed", true));
      this.socketLeds.push(at(lx, 1.6, 0.265, "led_off"));
      this.socketLeds.push(at(lx, 1.6, 0.266, "led_amber", true));
    }
    this.lever = at(0.28, 1.3, 0.31, "panel_lever");
    this.ledRed = at(0.24, 1.72, 0.265, "led_red");
    this.ledGreen = at(0.32, 1.72, 0.265, "led_green", true);
  }

  reset(): void {
    this.installed = [false, false];
    this.on = false;
    this.leverAngle = LEVER_OFF;
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < 2; i++) {
      this.props.setHidden(this.fuses[i]!, !this.installed[i]);
      this.props.setHidden(this.socketLeds[i * 2]!, this.installed[i]!);
      this.props.setHidden(this.socketLeds[i * 2 + 1]!, !this.installed[i]);
    }
    this.props.setHidden(this.ledRed, this.on);
    this.props.setHidden(this.ledGreen, !this.on);
    this.applyLever();
  }

  private applyLever(): void {
    const l = this.lever;
    this.props.move(l, l.x, l.y, l.z, l.yaw, this.leverAngle, 0);
  }

  update(dt: number): void {
    const target = this.on ? LEVER_ON : LEVER_OFF;
    if (this.leverAngle === target) return;
    const step = dt * 7;
    const d = target - this.leverAngle;
    this.leverAngle = Math.abs(d) <= step ? target : this.leverAngle + Math.sign(d) * step;
    this.applyLever();
  }

  interactables(): Interactable[] {
    const b = this.board;
    const c = Math.cos(-b.yaw);
    const s = Math.sin(-b.yaw);
    const out: Interactable[] = [];
    [-0.2, 0.0].forEach((lx, i) => {
      const [cx, cz] = this.props.toWorld(b, lx, 0.3);
      out.push({
        id: `fuse_socket_${i}`,
        active: () => !this.installed[i],
        shape: () => ({ kind: "box", cx, cy: this.y + 1.34, cz, hx: 0.07, hy: 0.2, hz: 0.06, cos: c, sin: s }),
        prompt: (ctx): Prompt =>
          ctx.inventory.has("fuse") ? { text: "Insérer un fusible", enabled: true } : { text: "Support vide — il manque un fusible", enabled: false },
        interact: (ctx) => {
          if (!ctx.inventory.remove("fuse")) return;
          this.installed[i] = true;
          this.refresh();
          ctx.noise.make(cx, this.y + 1.3, cz, 4, "unlock");
          ctx.sfx("fuse_insert", cx, this.y + 1.3, cz);
        },
      });
    });
    const [lx, lz] = this.props.toWorld(b, 0.28, 0.32);
    out.push({
      id: "power_lever",
      active: () => !this.on,
      shape: () => ({ kind: "box", cx: lx, cy: this.y + 1.3, cz: lz, hx: 0.1, hy: 0.25, hz: 0.1, cos: c, sin: s }),
      prompt: (): Prompt => {
        const missing = this.installed.filter((x) => !x).length;
        if (missing) return { text: `Levier bloqué — il manque ${missing} fusible${missing > 1 ? "s" : ""}`, enabled: false };
        return { text: "Rétablir le courant", enabled: true, hold: 0.5 };
      },
      interact: (ctx) => {
        this.on = true;
        this.refresh();
        ctx.noise.make(lx, this.y + 1.3, lz, 14, "machine");
        ctx.sfx("lever", lx, this.y + 1.3, lz);
        ctx.split("power", "Courant rétabli");
        ctx.toast(this.toastText, 3);
        this.onPower?.();
      },
    });
    return out;
  }
}
