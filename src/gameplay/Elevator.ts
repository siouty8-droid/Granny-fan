import { makeAABB, CollisionMask, type Collider } from "../physics/Collider";
import type { Portal } from "../world/builder/ArchitectureBuilder";
import type { FloorId } from "../world/layout/types";
import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { GameContext } from "./Context";
import type { Interactable, Prompt } from "./Interaction";
import { CABIN } from "./models/mechanisms";

const FLOOR_NAMES: Record<FloorId, string> = { B: "Sous-sol", G: "Rez-de-chaussée", U: "Étage", R: "Toit" };
const DOOR_TIME = 0.7;
const SPEED = 2.4;

interface Landing {
  floor: FloorId;
  y: number;
  /** côté des portes : -1 = z0, +1 = z1 */
  side: 1 | -1;
  panels: PropInstance[];
  blocker: Collider;
  call: PropInstance;
  callLed: PropInstance;
  callLedOff: PropInstance;
  openingId: string;
}

type State = "idle" | "closing" | "moving" | "opening";

/**
 * Ascenseur (cage E) : cabine traversante mobile, portes palières et de cabine coulissantes,
 * boutons d'appel et de cabine. Hors service tant que le courant n'est pas rétabli.
 */
export class Elevator {
  private cabin: PropInstance;
  private light: PropInstance;
  private cabinPanels: PropInstance[] = [];
  private landings: Landing[] = [];
  private colliders: Collider[] = [];
  private cabinBlockers: Collider[] = [];
  private buttonLeds: PropInstance[] = [];
  private readonly cx: number;
  private readonly cz: number;
  private readonly shaftMinZ: number;
  private readonly shaftMaxZ: number;
  y = 0;
  private fromY = 0;
  private toY = 0;
  private moveT = 0;
  private moveDur = 1;
  /** ouverture des portes 0..1 */
  doorOpen = 0;
  state: State = "idle";
  floor: FloorId = "G";
  private target: FloorId = "G";
  powered = false;

  constructor(
    private readonly world: World,
    private readonly props: PropSystem,
  ) {
    const def = world.layout.elevators[0]!;
    const [x0, z0, x1, z1] = def.rect;
    this.cx = (x0 + x1) / 2;
    this.cz = (z0 + z1) / 2;
    this.shaftMinZ = z0;
    this.shaftMaxZ = z1;
    this.cabin = props.add("elev_cabin", this.cx, 0, this.cz, 0, "elevator", "*");
    this.light = props.add("cabin_light", this.cx, CABIN.h - 0.02, this.cz, 0, "elevator", "*");
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        this.cabinPanels.push(props.add("elev_door", this.cx + k * 0.36, 0, this.cz + s * (CABIN.hd - 0.1), 0, "elevator", "*"));
      }
    }
    for (let i = 0; i < 4; i++) {
      this.buttonLeds.push(props.add("btn_off", this.cx + CABIN.hw - 0.085, 1.05 + i * 0.13, this.cz, Math.PI / 2, "elevator", "*"));
      this.buttonLeds.push(props.add("btn_green", this.cx + CABIN.hw - 0.086, 1.05 + i * 0.13, this.cz, Math.PI / 2, "elevator", "*", { hidden: true }));
    }
    for (const f of def.floors) {
      const y = world.floorY(f);
      const side = def.doorSides[f] === "z1" ? 1 : -1;
      const line = side > 0 ? z1 : z0;
      const panels = [-1, 1].map((k) => props.add("elev_door", this.cx + k * 0.36, y, line, 0, "elevator", "*"));
      const blocker = makeAABB(this.cx - 0.75, y, line - 0.08, this.cx + 0.75, y + 2.3, line + 0.08, { mask: CollisionMask.ALL, surface: "metal", tag: { elevator: f } });
      // bouton d'appel sur le palier, à droite de la porte
      const room = this.landingRoom(f, side, line);
      const zone = room?.id ?? "ext";
      const sector = room?.sector ?? "ext";
      const wallZ = line + side * 0.12;
      const yaw = side > 0 ? 0 : Math.PI;
      const call = props.add("call_panel", this.cx + 1.05, y + 1.15, wallZ, yaw, zone, sector);
      const callLedOff = props.add("led_off", this.cx + 1.05, y + 1.15, wallZ + side * 0.031, yaw, zone, sector);
      const callLed = props.add("led_amber", this.cx + 1.05, y + 1.15, wallZ + side * 0.032, yaw, zone, sector, { hidden: true });
      const opening = world.openings.find((o) => o.kind === "elevator" && o.floor === f);
      this.landings.push({ floor: f, y, side, panels, blocker, call, callLed, callLedOff, openingId: opening?.id ?? "" });
    }
    // colliders de la cabine (plancher, parois, portes de cabine)
    const { hw, hd } = CABIN;
    const cx = this.cx;
    const cz = this.cz;
    const mk = (a: number, b: number, c: number, d: number, y0: number, y1: number) => makeAABB(cx + a, y0, cz + c, cx + b, y1, cz + d, { mask: CollisionMask.ALL, surface: "metal" });
    this.colliders.push(mk(-hw, hw, -hd, hd, -0.2, 0)); // plancher
    this.colliders.push(mk(-hw, -hw + 0.05, -hd, hd, 0, 2.45));
    this.colliders.push(mk(hw - 0.05, hw, -hd, hd, 0, 2.45));
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? -hd : hd - 0.05;
      this.colliders.push(mk(-hw, -CABIN.door, z0, z0 + 0.05, 0, 2.45));
      this.colliders.push(mk(CABIN.door, hw, z0, z0 + 0.05, 0, 2.45));
      const b = mk(-CABIN.door, CABIN.door, z0 - 0.02, z0 + 0.07, 0, 2.2);
      this.cabinBlockers.push(b);
      this.colliders.push(b);
    }
    // les parois de la cabine suivent sa hauteur : on garde les y relatifs
    for (const c of this.colliders) {
      (c as Collider & { ry0: number; ry1: number }).ry0 = c.minY;
      (c as Collider & { ry0: number; ry1: number }).ry1 = c.maxY;
    }
  }

  private landingRoom(f: FloorId, side: number, line: number) {
    return this.world.roomAt(this.cx, this.world.floorY(f) + 0.5, line + side * 0.5);
  }

  addColliders(): void {
    for (const l of this.landings) this.world.collision.add(l.blocker);
    for (const c of this.colliders) this.world.collision.add(c);
  }

  reset(): void {
    this.powered = false;
    this.state = "idle";
    this.floor = "G";
    this.target = "G";
    this.y = this.world.floorY("G");
    this.doorOpen = 0;
    this.refreshLeds();
    this.apply(true);
  }

  setPower(on: boolean): void {
    this.powered = on;
    this.refreshLeds();
    // à l'arrivée du courant, la cabine ouvre ses portes à son étage
    if (on && this.state === "idle") this.state = "opening";
  }

  private refreshLeds(): void {
    this.props.setHidden(this.light, !this.powered);
    for (const l of this.landings) {
      this.props.setHidden(l.callLed, !this.powered);
      this.props.setHidden(l.callLedOff, this.powered);
    }
    for (let i = 0; i < 4; i++) {
      this.props.setHidden(this.buttonLeds[i * 2]!, this.powered);
      this.props.setHidden(this.buttonLeds[i * 2 + 1]!, !this.powered);
    }
  }

  private landing(f: FloorId): Landing {
    return this.landings.find((l) => l.floor === f)!;
  }

  /** Demande d'envoi / d'appel de la cabine. */
  request(f: FloorId, ctx: GameContext | null): void {
    if (!this.powered) return;
    if (f === this.floor && (this.state === "idle" || this.state === "opening")) {
      this.state = "opening";
      return;
    }
    this.target = f;
    if (this.state === "idle" || this.state === "opening") this.state = "closing";
    if (ctx) ctx.noise.make(this.cx, this.y + 1, this.cz, 8, "machine");
  }

  /** Portail vertical / palier : ouvert si les portes le sont. */
  isPortalOpen(p: Portal): boolean {
    const o = p.opening;
    if (!o || o.kind !== "elevator") return true;
    const l = this.landings.find((x) => x.openingId === o.id);
    if (!l) return true;
    return this.doorOpen > 0.02 && this.floor === l.floor && this.state !== "moving";
  }

  update(dt: number): void {
    switch (this.state) {
      case "closing":
        this.doorOpen = Math.max(0, this.doorOpen - dt / DOOR_TIME);
        if (this.doorOpen === 0) {
          if (this.target === this.floor) {
            this.state = "idle";
          } else {
            this.state = "moving";
            this.fromY = this.y;
            this.toY = this.world.floorY(this.target);
            this.moveT = 0;
            this.moveDur = Math.abs(this.toY - this.fromY) / SPEED + 0.8;
          }
        }
        break;
      case "moving": {
        this.moveT += dt;
        const t = Math.min(1, this.moveT / this.moveDur);
        const e = t * t * (3 - 2 * t);
        this.y = this.fromY + (this.toY - this.fromY) * e;
        if (t >= 1) {
          this.floor = this.target;
          this.state = "opening";
        }
        break;
      }
      case "opening":
        this.doorOpen = Math.min(1, this.doorOpen + dt / DOOR_TIME);
        if (this.doorOpen === 1) this.state = "idle";
        break;
      default:
        return;
    }
    this.apply(false);
  }

  private apply(all: boolean): void {
    const y = this.y;
    this.props.move(this.cabin, this.cx, y, this.cz, 0);
    this.props.move(this.light, this.cx, y + CABIN.h - 0.02, this.cz, 0);
    for (let i = 0; i < 4; i++) {
      const on = this.buttonLeds[i * 2]!;
      const g = this.buttonLeds[i * 2 + 1]!;
      this.props.move(on, on.x, y + 1.05 + i * 0.13, on.z, on.yaw);
      this.props.move(g, g.x, y + 1.05 + i * 0.13, g.z, g.yaw);
    }
    const here = this.landing(this.floor);
    const open = this.state === "moving" ? 0 : this.doorOpen;
    const slide = 0.36 + open * 0.66;
    // portes de cabine : seules celles du côté du palier s'ouvrent
    let k = 0;
    for (const s of [-1, 1]) {
      for (const dir of [-1, 1]) {
        const p = this.cabinPanels[k++]!;
        const o = s === here.side ? slide : 0.36;
        this.props.move(p, this.cx + dir * o, y, this.cz + s * (CABIN.hd - 0.1), 0);
      }
    }
    for (let i = 0; i < 2; i++) {
      const b = this.cabinBlockers[i]!;
      const s = i === 0 ? -1 : 1;
      b.enabled = !(s === here.side && open > 0.9);
    }
    for (const c of this.colliders) {
      const r = c as Collider & { ry0: number; ry1: number };
      c.minY = y + r.ry0;
      c.maxY = y + r.ry1;
      this.world.collision.update(c);
    }
    for (const l of this.landings) {
      const o = l === here ? open : 0;
      if (!all && l !== here && l.blocker.enabled) continue;
      const line = l.side > 0 ? this.shaftMaxZ : this.shaftMinZ;
      l.panels.forEach((p, i) => this.props.move(p, this.cx + (i === 0 ? -1 : 1) * (0.36 + o * 0.66), l.y, line, 0));
      l.blocker.enabled = o < 0.9;
    }
  }

  interactables(): Interactable[] {
    const out: Interactable[] = [];
    for (const l of this.landings) {
      out.push({
        id: `elev_call_${l.floor}`,
        active: () => true,
        shape: () => ({ kind: "box", cx: l.call.x, cy: l.call.y, cz: l.call.z, hx: 0.1, hy: 0.16, hz: 0.08, cos: 1, sin: 0 }),
        prompt: (): Prompt => {
          if (!this.powered) return { text: "Ascenseur — hors service (pas de courant)", enabled: false };
          if (this.floor === l.floor && this.state !== "moving" && this.state !== "closing") return { text: "Ascenseur — ouvrir", enabled: true };
          return { text: "Appeler l'ascenseur", enabled: true };
        },
        interact: (ctx) => this.request(l.floor, ctx),
      });
    }
    const floors: FloorId[] = ["B", "G", "U", "R"];
    floors.forEach((f, i) => {
      out.push({
        id: `elev_btn_${f}`,
        range: 1.6,
        active: () => this.state !== "moving",
        shape: () => ({ kind: "box", cx: this.cx + CABIN.hw - 0.08, cy: this.y + 1.05 + i * 0.13, cz: this.cz, hx: 0.04, hy: 0.055, hz: 0.07, cos: 1, sin: 0 }),
        prompt: (): Prompt => {
          if (!this.powered) return { text: "Pas de courant", enabled: false };
          return { text: `${FLOOR_NAMES[f]}${f === this.floor ? " (ici)" : ""}`, enabled: true };
        },
        interact: (ctx) => this.request(f, ctx),
      });
    });
    return out;
  }

  /** Le joueur est-il dans la cabine ? */
  contains(x: number, y: number, z: number): boolean {
    return Math.abs(x - this.cx) < CABIN.hw && Math.abs(z - this.cz) < CABIN.hd && y > this.y - 0.5 && y < this.y + 2.4;
  }
}
