import { makeAABB, CollisionMask, type Collider } from "../physics/Collider";
import { Region, type ModelKit, type PartStyle } from "../world/props/ModelKit";
import type { PropDef, PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { GameContext } from "./Context";
import type { CodeId } from "./data/spawns";
import type { Interactable, Prompt } from "./Interaction";

export const MALL_EXIT_LABELS = { doors: "Portes principales", truck: "Camion de livraison", metro: "Draisine du métro" } as const;

/** Géométrie des sorties du centre commercial (voir `layout/mall.ts`). */
export const MALL_EXITS = {
  /** portes vitrées du hall (ligne z = 0) et grille de sécurité, côté hall, devant les portes */
  doors: { x: 55, z: 0, width: 4, grilleZ: 0.5, grilleW: 4.8, grilleH: 3.1 },
  /** boîtier de commande de la grille (mur du hall, côté intérieur) */
  grilleBox: { x: 57.75, y: 1.3, z: 0.14 },
  /** rideau métallique du quai de livraison (mur sud du quai, z = 0) */
  shutter: { x: 74, z: 0.1, width: 5.5, height: 3.0, y: -5 },
  shutterButton: { x: 77.6, y: -5 + 1.25, z: 0.14 },
  /** camion de livraison, cabine vers le rideau */
  truck: { x: 74, z: 5.6, yaw: Math.PI },
  /** draisine sur la voie, dans le tunnel */
  draisine: { x: 128.5, y: -6.1, z: 48.95, yaw: Math.PI / 2 },
} as const;

const STEEL: PartStyle = { region: Region.STEEL };
const DARK: PartStyle = { region: Region.PAINTED_METAL, color: [0.2, 0.21, 0.22] };
const RUST: PartStyle = { region: Region.RUST };
const WOOD: PartStyle = { region: Region.WOOD_DARK, uv: 0.7 };
const YELLOW: PartStyle = { region: Region.PAINTED_METAL, color: [0.85, 0.65, 0.12] };

/** Grille de sécurité à barreaux (pivot : bas, centre ; plan XY). */
function grille(w: number, h: number): (k: ModelKit) => void {
  return (k) => {
    k.groundAO = false;
    for (let x = -w / 2 + 0.05; x <= w / 2 - 0.04; x += 0.12) k.boxMM(x - 0.012, 0, -0.012, x + 0.012, h, 0.012, STEEL);
    for (let y = 0.0; y <= h; y += 0.45) k.boxMM(-w / 2, y, -0.02, w / 2, y + 0.05, 0.02, DARK);
    k.boxMM(-w / 2, 0, -0.03, w / 2, 0.08, 0.03, DARK);
  };
}

/** Rideau métallique à lames (pivot : bas, centre ; plan XY). */
function shutterModel(w: number, h: number): (k: ModelKit) => void {
  return (k) => {
    k.groundAO = false;
    const slat: PartStyle = { region: Region.PAINTED_METAL, color: [0.55, 0.57, 0.56] };
    for (let y = 0; y < h; y += 0.1) k.boxMM(-w / 2, y, -0.02, w / 2, y + 0.085, 0.02, slat);
    k.boxMM(-w / 2, 0, -0.04, w / 2, 0.06, 0.04, YELLOW);
    k.boxMM(-0.25, 0.25, 0.02, 0.25, 0.32, 0.05, DARK);
  };
}

/** Draisine (avant = +z) : plate-forme, roues, balancier, caisson de batterie. */
function draisine(k: ModelKit, lod: 0 | 1): void {
  const n = lod === 0 ? 14 : 8;
  // plate-forme et châssis
  k.boxMM(-0.8, 0.42, -1.25, 0.8, 0.5, 1.25, WOOD);
  k.boxMM(-0.78, 0.28, -1.2, -0.68, 0.42, 1.2, RUST);
  k.boxMM(0.68, 0.28, -1.2, 0.78, 0.42, 1.2, RUST);
  for (const z of [-0.8, 0.8]) {
    k.cylinder([-0.85, 0.3, z], [0.85, 0.3, z], 0.04, 8, STEEL);
    for (const x of [-0.75, 0.75]) k.cylinder([x - 0.05 * Math.sign(x), 0.3, z], [x + 0.05 * Math.sign(x), 0.3, z], 0.3, n, RUST);
  }
  // potence et balancier (le balancier se manœuvre à la manivelle)
  k.boxMM(-0.08, 0.5, -0.12, 0.08, 1.15, 0.12, DARK);
  k.boxMM(-0.05, 1.15, -0.9, 0.05, 1.21, 0.9, RUST);
  for (const z of [-0.9, 0.9]) k.boxMM(-0.55, 1.12, z - 0.04, 0.55, 1.2, z + 0.04, STEEL);
  // caisson de la batterie (moteur électrique d'appoint) et logement vide
  k.boxMM(-0.7, 0.5, 0.65, -0.2, 0.85, 1.15, YELLOW);
  k.boxMM(-0.66, 0.85, 0.7, -0.24, 0.87, 1.1, DARK);
  // garde-corps avant
  k.tube([[-0.7, 0.5, 1.2], [-0.7, 1.0, 1.2], [0.7, 1.0, 1.2], [0.7, 0.5, 1.2]], 0.02, 6, STEEL);
  // feu avant
  k.cylinder([0, 0.72, 1.25], [0, 0.72, 1.3], 0.08, 10, DARK);
}

/** Manivelle installée sur l'axe du balancier. */
function crankInstalled(k: ModelKit): void {
  k.tube(
    [
      [0.08, 0.95, 0],
      [0.32, 0.95, 0],
      [0.32, 1.12, 0],
      [0.4, 1.12, 0],
    ],
    0.015,
    6,
    STEEL,
  );
  k.cylinder([0.4, 1.12, 0], [0.52, 1.12, 0], 0.025, 8, WOOD);
}

/** Lanterne avant allumée (verre émissif). */
function draisineLamp(k: ModelKit): void {
  k.groundAO = false;
  k.cylinder([0, 0.72, 1.3], [0, 0.72, 1.31], 0.065, 10, { region: Region.WHITE, color: [1, 0.95, 0.8] });
}

export function mallExitPropDefs(): PropDef[] {
  const D = MALL_EXITS;
  return [
    { id: "mall_grille", shadow: true, build: grille(D.doors.grilleW, D.doors.grilleH) },
    { id: "mall_grille_housing", shadow: false, build: (k) => k.boxMM(-D.doors.grilleW / 2 - 0.1, 0, -0.18, D.doors.grilleW / 2 + 0.1, 0.42, 0.18, DARK) },
    { id: "dock_shutter", shadow: true, build: shutterModel(D.shutter.width, D.shutter.height) },
    {
      id: "draisine",
      shadow: true,
      lod: true,
      lodDistance: 18,
      build: draisine,
      colliders: [[-0.85, 0, -1.3, 0.85, 1.2, 1.3]],
      mask: CollisionMask.ALL,
    },
    { id: "draisine_crank", shadow: false, build: crankInstalled },
    { id: "draisine_lamp", shadow: false, build: draisineLamp, material: "lamp_on" },
  ];
}

interface Lift {
  inst: PropInstance;
  collider: Collider;
  /** hauteur levée courante / cible (m) */
  raise: number;
  target: number;
  max: number;
  baseY: number;
  speed: number;
  /** x0, z0, x1, z1 du collider */
  box: [number, number, number, number];
  height: number;
}

/**
 * Sorties du centre commercial :
 * - portes principales : grille de sécurité relevée au boîtier du hall (code), puis chaîne des
 *   portes vitrées (gérée par les portes, pince coupante) → on sort sur le parvis ;
 * - quai de livraison : courant rétabli → bouton du rideau métallique → camion (clés) ;
 * - métro : draisine dans le tunnel → manivelle + batterie → on part dans le tunnel.
 */
export class MallExitSystem {
  private readonly grille: Lift;
  private readonly shutter: Lift;
  private readonly grilleLedRed: PropInstance;
  private readonly grilleLedGreen: PropInstance;
  private readonly shutterLedRed: PropInstance;
  private readonly shutterLedGreen: PropInstance;
  readonly truck: PropInstance;
  readonly draisine: PropInstance;
  private readonly crank: PropInstance;
  private readonly battery: PropInstance;
  private readonly lamp: PropInstance;
  grilleOpen = false;
  shutterOpen = false;
  crankInstalled = false;
  batteryInstalled = false;
  finished = false;
  exitCode = "";
  /** grille et rideau : obstacles de navigation tant qu'on ne passe pas dessous (l'IA suit la navmesh, sans collision) */
  readonly navObstacles: Array<{ id: string; x: number; y: number; z: number; hx: number; hz: number; lift: Lift }>;
  openKeypad: ((title: string, code: CodeId, check: (code: string) => boolean, x: number, y: number, z: number) => void) | null = null;

  constructor(
    private readonly world: World,
    private readonly props: PropSystem,
  ) {
    const D = MALL_EXITS;
    const zone = (x: number, y: number, z: number) => {
      const r = world.roomAt(x, y + 0.4, z);
      return r ? { id: r.id, sector: r.sector } : { id: "ext", sector: "ext" };
    };
    // grille de sécurité (devant les portes, côté hall) et son caisson
    const d = D.doors;
    const hallZone = zone(d.x, 0, d.grilleZ + 1);
    this.grille = this.makeLift("mall_grille", hallZone.id, hallZone.sector, d.x, 0, d.grilleZ, 0, d.grilleH - 0.1, [d.x - d.grilleW / 2, d.grilleZ - 0.06, d.x + d.grilleW / 2, d.grilleZ + 0.06], d.grilleH, 0.9);
    props.add("mall_grille_housing", d.x, d.grilleH, d.grilleZ, 0, hallZone.id, hallZone.sector);
    // boîtier de commande (mur du hall)
    const gb = D.grilleBox;
    const hall = zone(gb.x, 0, gb.z + 0.5);
    props.add("call_panel", gb.x, gb.y, gb.z, 0, hall.id, hall.sector);
    this.grilleLedRed = props.add("led_red", gb.x, gb.y + 0.09, gb.z + 0.031, 0, hall.id, hall.sector);
    this.grilleLedGreen = props.add("led_green", gb.x, gb.y + 0.09, gb.z + 0.032, 0, hall.id, hall.sector, { hidden: true });
    // rideau du quai
    const s = D.shutter;
    const dock = zone(s.x, s.y, s.z + 2);
    this.shutter = this.makeLift("dock_shutter", dock.id, dock.sector, s.x, s.y, s.z, 0, s.height - 0.15, [s.x - s.width / 2, s.z - 0.06, s.x + s.width / 2, s.z + 0.06], s.height, 0.7);
    const sb = D.shutterButton;
    props.add("call_panel", sb.x, sb.y, sb.z, 0, dock.id, dock.sector);
    this.shutterLedRed = props.add("led_red", sb.x, sb.y + 0.09, sb.z + 0.031, 0, dock.id, dock.sector);
    this.shutterLedGreen = props.add("led_green", sb.x, sb.y + 0.09, sb.z + 0.032, 0, dock.id, dock.sector, { hidden: true });
    // camion
    const t = D.truck;
    this.truck = props.add("truck", t.x, s.y, t.z, t.yaw, dock.id, dock.sector);
    // draisine
    const dr = D.draisine;
    const tun = zone(dr.x, dr.y, dr.z);
    this.draisine = props.add("draisine", dr.x, dr.y, dr.z, dr.yaw, tun.id, tun.sector);
    this.crank = props.add("draisine_crank", dr.x, dr.y, dr.z, dr.yaw, tun.id, tun.sector, { hidden: true });
    const [bx, bz] = props.toWorld(this.draisine, -0.45, 0.9);
    this.battery = props.add("battery_installed", bx, dr.y + 0.87, bz, dr.yaw, tun.id, tun.sector, { hidden: true });
    this.lamp = props.add("draisine_lamp", dr.x, dr.y, dr.z, dr.yaw, tun.id, tun.sector, { hidden: true });
    this.navObstacles = [this.grille, this.shutter].map((l, i) => ({
      id: i ? "dock_shutter" : "mall_grille",
      x: (l.box[0] + l.box[2]) / 2,
      y: l.baseY,
      z: (l.box[1] + l.box[3]) / 2,
      hx: (l.box[2] - l.box[0]) / 2 + 0.2,
      hz: 0.45,
      lift: l,
    }));
  }

  private makeLift(id: string, zone: string, sector: string, x: number, y: number, z: number, yaw: number, max: number, box: [number, number, number, number], height: number, speed: number): Lift {
    const inst = this.props.add(id, x, y, z, yaw, zone, sector);
    const collider = makeAABB(box[0], y, box[1], box[2], y + height, box[3], {
      mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.INTERACT,
      surface: "metal",
    });
    return { inst, collider, raise: 0, target: 0, max, baseY: y, speed, box, height };
  }

  get staticProps(): PropInstance[] {
    return [this.truck, this.draisine];
  }



  addColliders(): void {
    for (const l of [this.grille, this.shutter]) this.world.collision.add(l.collider);
  }

  reset(exitCode: string): void {
    this.exitCode = exitCode;
    this.grilleOpen = false;
    this.shutterOpen = false;
    this.crankInstalled = false;
    this.batteryInstalled = false;
    this.finished = false;
    for (const l of [this.grille, this.shutter]) {
      l.raise = 0;
      l.target = 0;
      this.applyLift(l);
    }
    this.props.setHidden(this.grilleLedRed, false);
    this.props.setHidden(this.grilleLedGreen, true);
    this.props.setHidden(this.shutterLedRed, false);
    this.props.setHidden(this.shutterLedGreen, true);
    this.props.setHidden(this.crank, true);
    this.props.setHidden(this.battery, true);
    this.props.setHidden(this.lamp, true);
  }

  private applyLift(l: Lift): void {
    const i = l.inst;
    this.props.move(i, i.x, l.baseY + l.raise, i.z, i.yaw);
    // la partie basse se libère au fur et à mesure (on passe dessous une fois assez levé)
    l.collider.minY = l.baseY + l.raise;
    l.collider.maxY = l.baseY + l.height + l.raise;
    l.collider.enabled = l.raise < 1.9;
    this.world.collision.update(l.collider);
  }

  update(dt: number, ctx: GameContext): void {
    for (const l of [this.grille, this.shutter]) {
      if (l.raise === l.target) continue;
      const step = l.speed * dt;
      const dd = l.target - l.raise;
      l.raise = Math.abs(dd) <= step ? l.target : l.raise + Math.sign(dd) * step;
      this.applyLift(l);
    }
    if (this.finished || !ctx.run.running) return;
    // portes principales franchies : on est sur le parvis, devant l'entrée
    const p = ctx.player;
    const d = MALL_EXITS.doors;
    if (this.grilleOpen && p.y > -0.5 && p.y < 1 && p.z < d.z - 1.4 && Math.abs(p.x - d.x) < 3.5) {
      this.finished = true;
      ctx.finish("doors", MALL_EXIT_LABELS.doors);
    }
  }

  interactables(): Interactable[] {
    const out: Interactable[] = [];
    const D = MALL_EXITS;
    const gb = D.grilleBox;
    out.push({
      id: "grille_box",
      active: () => !this.grilleOpen,
      shape: () => ({ kind: "box", cx: gb.x, cy: gb.y, cz: gb.z, hx: 0.1, hy: 0.16, hz: 0.08, cos: 1, sin: 0 }),
      prompt: (): Prompt => ({ text: "Boîtier de la grille — composer le code", enabled: true }),
      interact: (ctx) => {
        this.openKeypad?.(
          "Grille de l'entrée",
          "grille",
          (code) => {
            if (code !== this.exitCode) {
              ctx.noise.make(gb.x, gb.y, gb.z, 4, "keypad");
              return false;
            }
            this.grilleOpen = true;
            this.grille.target = this.grille.max;
            this.props.setHidden(this.grilleLedRed, true);
            this.props.setHidden(this.grilleLedGreen, false);
            ctx.noise.make(D.doors.x, 1.5, D.doors.grilleZ, 18, "machine");
            ctx.sfx("gate_open", D.doors.x, 1.5, D.doors.grilleZ);
            ctx.split("grille_open", "Grille relevée");
            return true;
          },
          gb.x,
          gb.y,
          gb.z,
        );
      },
    });
    const sb = D.shutterButton;
    out.push({
      id: "shutter_button",
      active: () => !this.shutterOpen,
      shape: () => ({ kind: "box", cx: sb.x, cy: sb.y, cz: sb.z, hx: 0.1, hy: 0.16, hz: 0.08, cos: 1, sin: 0 }),
      prompt: (ctx): Prompt => (ctx.power ? { text: "Relever le rideau métallique", enabled: true, hold: 0.4 } : { text: "Commande du rideau — pas de courant", enabled: false }),
      interact: (ctx) => {
        this.shutterOpen = true;
        this.shutter.target = this.shutter.max;
        this.props.setHidden(this.shutterLedRed, true);
        this.props.setHidden(this.shutterLedGreen, false);
        ctx.noise.make(D.shutter.x, D.shutter.y + 1.5, D.shutter.z, 20, "machine");
        ctx.sfx("gate_open", D.shutter.x, D.shutter.y + 1.5, D.shutter.z);
        ctx.split("shutter_open", "Rideau relevé");
      },
    });
    // portière du chauffeur (côté gauche de la cabine)
    const t = this.truck;
    const c = Math.cos(-t.yaw);
    const s = Math.sin(-t.yaw);
    const [tx, tz] = this.props.toWorld(t, -1.2, 3.1);
    out.push({
      id: "truck_door",
      own: t.colliders,
      active: () => true,
      shape: () => ({ kind: "box", cx: tx, cy: t.y + 1.6, cz: tz, hx: 0.12, hy: 0.6, hz: 0.55, cos: c, sin: s }),
      prompt: (ctx): Prompt => {
        if (!ctx.inventory.has("truckKeys")) return { text: "Camion — il faut les clés", enabled: false };
        if (!this.shutterOpen) return { text: "Camion — le rideau du quai est baissé", enabled: false };
        return { text: "Démarrer le camion", enabled: true };
      },
      interact: (ctx) => {
        if (this.finished) return;
        this.finished = true;
        ctx.finish("truck", MALL_EXIT_LABELS.truck);
      },
    });
    // draisine : manivelle, batterie, départ
    const dr = this.draisine;
    const dc = Math.cos(-dr.yaw);
    const ds = Math.sin(-dr.yaw);
    const at = (lx: number, lz: number) => this.props.toWorld(dr, lx, lz);
    const [cx, cz] = at(0.3, 0);
    out.push({
      id: "draisine_crank",
      own: dr.colliders,
      active: () => !this.crankInstalled,
      shape: () => ({ kind: "box", cx, cy: dr.y + 1.0, cz, hx: 0.25, hy: 0.25, hz: 0.25, cos: dc, sin: ds }),
      prompt: (ctx): Prompt =>
        ctx.inventory.has("crank") ? { text: "Fixer la manivelle", enabled: true, hold: 0.8 } : { text: "Balancier — il manque la manivelle", enabled: false },
      interact: (ctx) => {
        if (!ctx.inventory.remove("crank")) return;
        this.crankInstalled = true;
        this.props.setHidden(this.crank, false);
        ctx.noise.make(cx, dr.y + 1, cz, 7, "unlock");
        ctx.sfx("fuse_insert", cx, dr.y + 1, cz);
        ctx.split("crank", "Manivelle fixée");
      },
    });
    const [bx, bz] = at(-0.45, 0.9);
    out.push({
      id: "draisine_battery",
      own: dr.colliders,
      active: () => !this.batteryInstalled,
      shape: () => ({ kind: "box", cx: bx, cy: dr.y + 0.75, cz: bz, hx: 0.28, hy: 0.2, hz: 0.28, cos: dc, sin: ds }),
      prompt: (ctx): Prompt =>
        ctx.inventory.has("battery") ? { text: "Installer la batterie", enabled: true, hold: 1.0 } : { text: "Logement de batterie vide", enabled: false },
      interact: (ctx) => {
        if (!ctx.inventory.remove("battery")) return;
        this.batteryInstalled = true;
        this.props.setHidden(this.battery, false);
        this.props.setHidden(this.lamp, false);
        ctx.noise.make(bx, dr.y + 0.8, bz, 6, "unlock");
        ctx.sfx("battery", bx, dr.y + 0.8, bz);
        ctx.split("battery", "Batterie installée");
        ctx.toast("La lanterne de la draisine s'allume.", 2.2);
      },
    });
    const [gx, gz] = at(0, -0.2);
    out.push({
      id: "draisine_go",
      own: dr.colliders,
      active: () => true,
      shape: () => ({ kind: "box", cx: gx, cy: dr.y + 1.15, cz: gz, hx: 0.12, hy: 0.1, hz: 0.9, cos: dc, sin: ds }),
      prompt: (): Prompt => {
        if (!this.crankInstalled) return { text: "Draisine — il manque la manivelle", enabled: false };
        if (!this.batteryInstalled) return { text: "Draisine — pas de batterie", enabled: false };
        return { text: "Partir dans le tunnel", enabled: true };
      },
      interact: (ctx) => {
        if (this.finished) return;
        this.finished = true;
        ctx.finish("metro", MALL_EXIT_LABELS.metro);
      },
    });
    return out;
  }
}
