import { makeBox, setColliderAngle, CollisionMask, type Collider } from "../physics/Collider";
import { EXTERIOR } from "../world/builder/ExteriorBuilder";
import { ROOF_EXIT } from "../world/builder/RoofBuilder";
import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { GameContext } from "./Context";
import type { Interactable, Prompt } from "./Interaction";
import type { CodeId } from "./data/spawns";

interface GateLeaf {
  inst: PropInstance;
  hx: number;
  hz: number;
  dx: number;
  dz: number;
  width: number;
  collider: Collider;
}

interface Gate {
  leaves: GateLeaf[];
  /** normale d'ouverture (vers l'extérieur) */
  nx: number;
  nz: number;
  angle: number;
  target: number;
  speed: number;
}

export const EXIT_LABELS = { gate: "Portail principal", ambulance: "Ambulance", roof: "Échelle du toit" } as const;

/**
 * Les trois sorties :
 * - portail principal : badge rouge + code du boîtier → le portail s'ouvre, on le franchit ;
 * - ambulance : couper la chaîne de la grille, installer la batterie, démarrer avec les clés ;
 * - toit : (courant → ascenseur, planches au pied-de-biche) puis l'échelle de secours.
 */
export class ExitSystem {
  private main: Gate;
  private bay: Gate;
  private gateBox: PropInstance;
  private gateLedRed: PropInstance;
  private gateLedGreen: PropInstance;
  private bayChain: PropInstance;
  private bayChainCut: PropInstance;
  readonly ambulance: PropInstance;
  private headlights: PropInstance;
  gateOpen = false;
  bayOpen = false;
  batteryInstalled = false;
  finished = false;
  openKeypad: ((title: string, code: CodeId, check: (code: string) => boolean, x: number, y: number, z: number) => void) | null = null;
  gateCode = "";

  constructor(
    private readonly world: World,
    private readonly props: PropSystem,
  ) {
    const g = EXTERIOR.mainGate;
    const fz = EXTERIOR.fence.minZ;
    const halfW = (g.x1 - g.x0) / 2;
    this.main = this.makeGate("gate_main", [
      { hx: g.x0, hz: fz, dx: 1, dz: 0, w: halfW },
      { hx: g.x1, hz: fz, dx: -1, dz: 0, w: halfW },
    ], 0, -1, 2.3);
    const bg = EXTERIOR.bayGate;
    const bw = (bg.z1 - bg.z0) / 2;
    this.bay = this.makeGate("gate_bay", [
      { hx: bg.x, hz: bg.z0, dx: 0, dz: 1, w: bw },
      { hx: bg.x, hz: bg.z1, dx: 0, dz: -1, w: bw },
    ], 1, 0, 2.2);
    const b = EXTERIOR.gateBox;
    this.gateBox = props.add("gate_box", b.x, 0, b.z, 0, "ext", "ext");
    this.gateLedRed = props.add("led_red", b.x + 0.02, 1.44, b.z + 0.046, 0, "ext", "ext");
    this.gateLedGreen = props.add("led_green", b.x - 0.02, 1.44, b.z + 0.046, 0, "ext", "ext", { hidden: true });
    this.bayChain = props.add("chain_lock", bg.x - 0.04, 1.1, (bg.z0 + bg.z1) / 2, -Math.PI / 2, "ext", "ext");
    this.bayChainCut = props.add("chain_cut", bg.x - 0.7, 0, (bg.z0 + bg.z1) / 2 + 0.3, 1.2, "ext", "ext", { hidden: true });
    const a = EXTERIOR.ambulance;
    this.ambulance = props.add("ambulance", a.x, 0, a.z, a.yaw, "ext", "ext");
    this.headlights = props.add("amb_headlights", a.x, 0, a.z, a.yaw, "ext", "ext", { hidden: true });
    // échelle de secours au bord du toit
    props.add("ladder", 80.02, world.floorY("R"), ROOF_EXIT.z, Math.PI / 2, "ext", "ext");
  }

  private makeGate(id: string, specs: Array<{ hx: number; hz: number; dx: number; dz: number; w: number }>, nx: number, nz: number, h: number): Gate {
    const leaves = specs.map((s) => {
      const yaw = Math.atan2(-s.dz, s.dx);
      const inst = this.props.add(id, s.hx, 0, s.hz, yaw, "ext", "ext");
      const collider = makeBox(s.hx + s.dx * s.w / 2, s.hz + s.dz * s.w / 2, s.w / 2, 0.06, 0, h + 0.2, {
        angle: -yaw,
        mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.INTERACT,
        surface: "metal",
      });
      return { inst, hx: s.hx, hz: s.hz, dx: s.dx, dz: s.dz, width: s.w, collider };
    });
    return { leaves, nx, nz, angle: 0, target: 0, speed: 0.8 };
  }

  get staticProps(): PropInstance[] {
    return [this.gateBox, this.ambulance];
  }

  addColliders(): void {
    for (const g of [this.main, this.bay]) for (const l of g.leaves) this.world.collision.add(l.collider);
  }

  reset(gateCode: string): void {
    this.gateCode = gateCode;
    this.gateOpen = false;
    this.bayOpen = false;
    this.batteryInstalled = false;
    this.finished = false;
    for (const g of [this.main, this.bay]) {
      g.angle = 0;
      g.target = 0;
      this.applyGate(g);
    }
    this.props.setHidden(this.gateLedRed, false);
    this.props.setHidden(this.gateLedGreen, true);
    this.props.setHidden(this.bayChain, false);
    this.props.setHidden(this.bayChainCut, true);
    this.props.setHidden(this.headlights, true);
  }

  private applyGate(g: Gate): void {
    const s = Math.sin(g.angle);
    const c = Math.cos(g.angle);
    for (const l of g.leaves) {
      const vx = l.dx * c + g.nx * s;
      const vz = l.dz * c + g.nz * s;
      const yaw = Math.atan2(-vz, vx);
      this.props.move(l.inst, l.hx, 0, l.hz, yaw);
      l.collider.cx = l.hx + vx * (l.width / 2);
      l.collider.cz = l.hz + vz * (l.width / 2);
      setColliderAngle(l.collider, -yaw);
      this.world.collision.update(l.collider);
    }
  }

  update(dt: number, ctx: GameContext): void {
    for (const g of [this.main, this.bay]) {
      if (g.angle === g.target) continue;
      const step = g.speed * dt;
      const d = g.target - g.angle;
      g.angle = Math.abs(d) <= step ? g.target : g.angle + Math.sign(d) * step;
      this.applyGate(g);
    }
    if (this.finished || !ctx.run.running) return;
    const p = ctx.player;
    // portail franchi
    const mg = EXTERIOR.mainGate;
    if (this.gateOpen && p.z < EXTERIOR.fence.minZ - 0.6 && p.x > mg.x0 - 0.5 && p.x < mg.x1 + 0.5) {
      this.finished = true;
      ctx.finish("gate", EXIT_LABELS.gate);
      return;
    }
    // bord du toit, au niveau de l'échelle
    if (p.y > this.world.floorY("R") - 0.5 && p.x > 79.55 && Math.abs(p.z - ROOF_EXIT.z) < ROOF_EXIT.width / 2 + 0.1) {
      this.finished = true;
      ctx.finish("roof", EXIT_LABELS.roof);
    }
  }

  interactables(): Interactable[] {
    const out: Interactable[] = [];
    const b = EXTERIOR.gateBox;
    out.push({
      id: "gate_box",
      own: this.gateBox.colliders,
      active: () => !this.gateOpen,
      shape: () => ({ kind: "box", cx: b.x, cy: 1.28, cz: b.z, hx: 0.16, hy: 0.22, hz: 0.12, cos: 1, sin: 0 }),
      prompt: (ctx): Prompt =>
        ctx.inventory.has("badgeRed")
          ? { text: "Badger et composer le code du portail", enabled: true }
          : { text: "Boîtier du portail — lecteur de badge ROUGE", enabled: false },
      interact: (ctx) => {
        ctx.noise.make(b.x, 1.3, b.z, 3, "unlock");
        this.openKeypad?.(
          "Portail principal",
          "gate",
          (code) => {
            if (code !== this.gateCode) {
              ctx.noise.make(b.x, 1.3, b.z, 4, "keypad");
              return false;
            }
            this.gateOpen = true;
            this.main.target = (100 * Math.PI) / 180;
            this.main.speed = 0.9;
            this.props.setHidden(this.gateLedRed, true);
            this.props.setHidden(this.gateLedGreen, false);
            ctx.noise.make(b.x, 1.3, b.z, 18, "machine");
            ctx.split("gate_open", "Portail ouvert");
            return true;
          },
          b.x,
          1.3,
          b.z,
        );
      },
    });
    const bg = EXTERIOR.bayGate;
    out.push({
      id: "bay_chain",
      active: () => !this.bayOpen,
      shape: () => ({ kind: "box", cx: bg.x - 0.05, cy: 1.1, cz: (bg.z0 + bg.z1) / 2, hx: 0.12, hy: 0.35, hz: 0.45, cos: 1, sin: 0 }),
      prompt: (ctx): Prompt =>
        ctx.inventory.has("boltCutter")
          ? { text: "Couper la chaîne de la grille", enabled: true, hold: 0.9 }
          : { text: "Grille cadenassée — il faut une pince coupante", enabled: false },
      interact: (ctx) => {
        this.bayOpen = true;
        this.bay.target = (70 * Math.PI) / 180;
        this.bay.speed = 1.1;
        this.props.setHidden(this.bayChain, true);
        this.props.setHidden(this.bayChainCut, false);
        ctx.noise.make(bg.x, 1, (bg.z0 + bg.z1) / 2, 12, "chain");
        ctx.split("bay_gate", "Grille coupée");
      },
    });
    const amb = this.ambulance;
    const c = Math.cos(-amb.yaw);
    const s = Math.sin(-amb.yaw);
    const [hx, hz] = this.props.toWorld(amb, 0, 2.55);
    out.push({
      id: "amb_hood",
      own: amb.colliders,
      active: () => !this.batteryInstalled,
      shape: () => ({ kind: "box", cx: hx, cy: 1.15, cz: hz, hx: 0.95, hy: 0.25, hz: 0.45, cos: c, sin: s }),
      prompt: (ctx): Prompt =>
        ctx.inventory.has("battery")
          ? { text: "Installer la batterie", enabled: true, hold: 1.2 }
          : { text: "Capot — la batterie a été retirée", enabled: false },
      interact: (ctx) => {
        if (!ctx.inventory.remove("battery")) return;
        this.batteryInstalled = true;
        this.props.setHidden(this.headlights, false);
        ctx.noise.make(hx, 1, hz, 6, "unlock");
        ctx.split("battery", "Batterie installée");
        ctx.toast("Les phares s'allument.", 2.2);
      },
    });
    const [dx, dz] = this.props.toWorld(amb, -1.0, 1.25);
    out.push({
      id: "amb_door",
      own: amb.colliders,
      active: () => true,
      shape: () => ({ kind: "box", cx: dx, cy: 1.6, cz: dz, hx: 0.12, hy: 0.55, hz: 0.45, cos: c, sin: s }),
      prompt: (ctx): Prompt => {
        if (!this.batteryInstalled) return { text: "Ambulance — pas de batterie", enabled: false };
        if (!ctx.inventory.has("ambulanceKeys")) return { text: "Ambulance — il faut les clés", enabled: false };
        if (!this.bayOpen) return { text: "Ambulance — la grille est encore fermée", enabled: false };
        return { text: "Démarrer l'ambulance", enabled: true };
      },
      interact: (ctx) => {
        if (this.finished) return;
        this.finished = true;
        ctx.finish("ambulance", EXIT_LABELS.ambulance);
      },
    });
    return out;
  }
}
