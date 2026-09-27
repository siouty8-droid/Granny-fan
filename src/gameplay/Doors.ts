import { makeBox, setColliderAngle, CollisionMask, type Collider } from "../physics/Collider";
import { WALL_T, type OpeningPlacement, type Portal } from "../world/builder/ArchitectureBuilder";
import type { LockType, RoomDef } from "../world/layout/types";
import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { GameContext } from "./Context";
import type { ItemId } from "./data/items";
import type { Interactable, Prompt } from "./Interaction";
import { LEAF_H, leafPropId, type LeafStyle } from "./models/doors";

const HALF_T = WALL_T / 2;
const MAX_ANGLE = (95 * Math.PI) / 180;
/** au-delà de cette fraction de l'ouverture max, la porte laisse passer (sinon : entrouverte) */
const WIDE_OPEN = 0.8;
const OPEN_TIME = 0.32;
const CLOSE_TIME = 0.38;

interface Leaf {
  inst: PropInstance;
  /** gond (monde) */
  hx: number;
  hz: number;
  /** direction du vantail fermé (unitaire) */
  dx: number;
  dz: number;
  width: number;
  height: number;
  collider: Collider;
  handle: PropInstance | null;
  handleU: number;
  handleY: number;
  handleFlip: number;
}

export interface Door {
  id: string;
  o: OpeningPlacement;
  lock: LockType;
  locked: boolean;
  leaves: Leaf[];
  /** angle courant (rad) : > 0 → ouvert vers le côté B */
  angle: number;
  target: number;
  speed: number;
  initialAngle: number;
  swing: boolean;
  autoClose: number;
  /** côté (+1 = B, -1 = A) d'où le verrou se manipule (planches, chaîne, sens unique) */
  lockSide: 1 | -1 | 0;
  splitLabel: string | null;
  label: string;
  planks: PropInstance | null;
  planksFallen: PropInstance | null;
  chain: PropInstance | null;
  chainCut: PropInstance | null;
  ledsRed: PropInstance[];
  ledsGreen: PropInstance[];
  everOpened: boolean;
  /** normale vers le côté B */
  nx: number;
  nz: number;
}

const BADGE: Partial<Record<LockType, { item: ItemId; color: string }>> = {
  badgeBlue: { item: "badgeBlue", color: "BLEU" },
  badgeGreen: { item: "badgeGreen", color: "VERT" },
  badgeRed: { item: "badgeRed", color: "ROUGE" },
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function leafStyle(o: OpeningPlacement): LeafStyle {
  if (o.id === "g_main_entrance" || o.id === "g_er_ambulance") return "glass";
  const themes = [o.roomA?.theme, o.roomB?.theme];
  const has = (...t: string[]) => themes.some((x) => x !== undefined && t.includes(x));
  if (o.floor === "B" || o.floor === "R" || has("boiler", "techcorr", "electric", "archives", "roofroom")) return "metal";
  if (has("office", "director", "chapel", "security")) return "wood";
  if (o.spec?.swing || o.kind === "double" || has("surgery", "er")) return "blue";
  if (has("storage", "lockers", "showers", "kitchen", "laundry", "stairs", "cafeteria")) return "cream";
  return "green";
}

/**
 * Portes : vantaux dynamiques (thin instances), colliders orientés, verrous (badges, clé,
 * planches, chaîne, sens unique, condamnées), voyants, battantes automatiques, portails de
 * culling fermés quand la porte l'est.
 */
export class DoorSystem {
  readonly doors: Door[] = [];
  readonly byId = new Map<string, Door>();
  /** déverrouillage (navigation du monstre) */
  onUnlock: ((d: Door) => void) | null = null;
  /** sons */
  sound: (name: string, x: number, y: number, z: number) => void = () => undefined;

  constructor(
    private readonly world: World,
    private readonly props: PropSystem,
  ) {
    for (const o of world.openings) {
      if (o.kind !== "door" && o.kind !== "double") continue;
      this.create(o);
    }
  }

  private sectorOf(room: RoomDef | null): { zone: string; sector: string } {
    return room ? { zone: room.id, sector: room.sector } : { zone: "ext", sector: "ext" };
  }

  private create(o: OpeningPlacement): void {
    const spec = o.spec ?? { lock: "none" as LockType };
    const lock = spec.lock;
    const ax = o.axis === "x";
    const dx = ax ? 1 : 0;
    const dz = ax ? 0 : 1;
    const nx = ax ? 0 : 1;
    const nz = ax ? 1 : 0;
    const style = leafStyle(o);
    const tall = o.kind === "double";
    const two = o.kind === "double" || (!!spec.swing && o.width >= 1.4) || style === "glass";
    const H = tall ? LEAF_H.double : LEAF_H.single;
    const lockSide: 1 | -1 | 0 = spec.openFrom ? (((ax ? spec.openFrom.z - o.z : spec.openFrom.x - o.x) >= 0 ? 1 : -1) as 1 | -1) : 0;

    const door: Door = {
      id: o.id,
      o,
      lock,
      locked: lock !== "none",
      leaves: [],
      angle: 0,
      target: 0,
      speed: MAX_ANGLE / OPEN_TIME,
      initialAngle: 0,
      swing: !!spec.swing,
      autoClose: 0,
      lockSide,
      splitLabel: spec.splitLabel ?? null,
      label: spec.splitLabel ?? "Porte",
      planks: null,
      planksFallen: null,
      chain: null,
      chainCut: null,
      ledsRed: [],
      ledsGreen: [],
      everOpened: false,
      nx,
      nz,
    };

    // vantaux
    const half = o.width / 2;
    const leafSpecs: Array<{ hx: number; hz: number; dx: number; dz: number; w: number }> = two
      ? [
          { hx: o.x - dx * (half - 0.03), hz: o.z - dz * (half - 0.03), dx, dz, w: half - 0.045 },
          { hx: o.x + dx * (half - 0.03), hz: o.z + dz * (half - 0.03), dx: -dx, dz: -dz, w: half - 0.045 },
        ]
      : [{ hx: o.x - dx * (half - 0.03), hz: o.z - dz * (half - 0.03), dx, dz, w: o.width - 0.06 }];
    const handleId =
      style === "glass" ? "handle_glass" : lock === "oneWay" ? "handle_pushbar" : lock === "morgueKey" ? "handle_key" : spec.swing ? "handle_plates" : "handle_lever";
    for (const ls of leafSpecs) {
      const inst = this.props.add(leafPropId(style, tall), ls.hx, o.y, ls.hz, 0, "door", "*", { sx: ls.w });
      const collider = makeBox(o.x, o.z, ls.w / 2, 0.03, o.y, o.y + H, {
        mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.SIGHT | CollisionMask.INTERACT,
        surface: style === "metal" ? "metal" : "wood",
        tag: { door: o.id },
      });
      const handle = this.props.add(handleId, ls.hx, o.y + 1, ls.hz, 0, "door", "*");
      const handleU = handleId === "handle_pushbar" ? ls.w / 2 : handleId === "handle_plates" ? ls.w - 0.12 : handleId === "handle_glass" ? ls.w - 0.1 : ls.w - 0.075;
      const handleY = handleId === "handle_plates" ? 1.0 : handleId === "handle_glass" ? 1.05 : 1.0;
      door.leaves.push({ inst, hx: ls.hx, hz: ls.hz, dx: ls.dx, dz: ls.dz, width: ls.w, height: H, collider, handle, handleU, handleY, handleFlip: 0 });
    }
    // barre anti-panique tournée vers le côté autorisé
    if (handleId === "handle_pushbar") {
      for (const l of door.leaves) {
        const yaw = Math.atan2(-l.dz, l.dx);
        const fz = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const dot = (fz.x * nx + fz.z * nz) * lockSide;
        l.handleFlip = dot < 0 ? Math.PI : 0;
      }
    }

    // quincaillerie visible
    const sideRoom = (s: number) => (s > 0 ? o.roomB : o.roomA);
    const faceYaw = (s: number) => Math.atan2(nx * s, nz * s);
    if (lock === "planks") {
      const s = lockSide || -1;
      const { zone, sector } = this.sectorOf(sideRoom(s));
      door.planks = this.props.add("planks", o.x + nx * s * HALF_T, o.y, o.z + nz * s * HALF_T, faceYaw(s), zone, sector, { sx: o.width + 0.3 });
      door.planksFallen = this.props.add("planks_fallen", o.x + nx * s * (HALF_T + 0.55) + dx * 0.3, o.y, o.z + nz * s * (HALF_T + 0.55) + dz * 0.3, faceYaw(s) + 0.3, zone, sector, {
        hidden: true,
      });
    } else if (lock === "chain") {
      const s = lockSide || 1;
      const { zone, sector } = this.sectorOf(sideRoom(s));
      const l = door.leaves[0]!;
      const cx = two ? o.x : l.hx + l.dx * l.handleU;
      const cz = two ? o.z : l.hz + l.dz * l.handleU;
      door.chain = this.props.add("chain_lock", cx, o.y + 1.0, cz, faceYaw(s), zone, sector);
      door.chainCut = this.props.add("chain_cut", o.x + nx * s * 0.6, o.y, o.z + nz * s * 0.6, faceYaw(s) + 0.8, zone, sector, { hidden: true });
    } else if (lock === "sealed") {
      if (style === "glass") {
        const { zone, sector } = this.sectorOf(o.roomB);
        this.props.add("maglock", o.x, o.y + o.top, o.z + nz * 0.05 + nx * 0.05, faceYaw(1), zone, sector);
      } else {
        for (const s of [-1, 1]) {
          const room = sideRoom(s);
          if (!room) continue;
          const { zone, sector } = this.sectorOf(room);
          this.props.add("sealed_plate", o.x + nx * s * HALF_T, o.y, o.z + nz * s * HALF_T, faceYaw(s), zone, sector, { sx: o.width + 0.1 });
        }
      }
    } else if (BADGE[lock]) {
      const color = lock === "badgeBlue" ? "blue" : lock === "badgeGreen" ? "green" : "red";
      for (const s of [-1, 1]) {
        const room = sideRoom(s);
        if (!room) continue;
        const { zone, sector } = this.sectorOf(room);
        const off = half + 0.2;
        const px = o.x + dx * off + nx * s * HALF_T;
        const pz = o.z + dz * off + nz * s * HALF_T;
        const yaw = faceYaw(s);
        this.props.add(`reader_${color}`, px, o.y + 1.25, pz, yaw, zone, sector);
        const lx = px + nx * s * 0.033;
        const lz = pz + nz * s * 0.033;
        door.ledsRed.push(this.props.add("led_red", lx, o.y + 1.3, lz, yaw, zone, sector));
        door.ledsGreen.push(this.props.add("led_green", lx, o.y + 1.3, lz, yaw, zone, sector, { hidden: true }));
      }
    }

    // porte entrouverte au départ (déterministe)
    const h = hashStr(o.id);
    if (spec.startOpen) door.initialAngle = MAX_ANGLE;
    else if (lock === "none" && !spec.swing && h % 100 < 34) door.initialAngle = (0.45 + ((h >>> 8) % 100) / 100) * ((h >>> 16) & 1 ? 1 : -1);

    this.doors.push(door);
    this.byId.set(o.id, door);
  }

  /** Ajoute les colliders au monde de collision (après le bake : les portes n'occultent pas la lumière). */
  addColliders(): void {
    for (const d of this.doors) for (const l of d.leaves) this.world.collision.add(l.collider);
  }

  /** Remise à zéro pour une nouvelle run. */
  reset(): void {
    for (const d of this.doors) {
      d.locked = d.lock !== "none";
      d.angle = d.initialAngle;
      d.target = d.initialAngle;
      d.autoClose = 0;
      d.everOpened = false;
      if (d.planks) this.props.setHidden(d.planks, false);
      if (d.planksFallen) this.props.setHidden(d.planksFallen, true);
      if (d.chain) this.props.setHidden(d.chain, false);
      if (d.chainCut) this.props.setHidden(d.chainCut, true);
      this.setLeds(d);
      this.applyAngle(d);
    }
  }

  private setLeds(d: Door): void {
    for (const l of d.ledsRed) this.props.setHidden(l, !d.locked);
    for (const l of d.ledsGreen) this.props.setHidden(l, d.locked);
  }

  /** Côté (+1 = B, -1 = A) d'un point. */
  sideOf(d: Door, x: number, z: number): 1 | -1 {
    return (x - d.o.x) * d.nx + (z - d.o.z) * d.nz >= 0 ? 1 : -1;
  }

  isOpen(d: Door): boolean {
    return Math.abs(d.angle) > 0.02;
  }

  /**
   * Grande ouverte (ou en train de s'ouvrir en grand) : on peut passer. Une porte simplement
   * entrouverte bloque encore le passage — l'interaction l'ouvre alors en grand.
   */
  wideOpen(d: Door): boolean {
    return Math.abs(d.target) > MAX_ANGLE * WIDE_OPEN;
  }

  /** Portail de culling ouvert ? (portes fermées = zones derrière invisibles) */
  isPortalOpen(p: Portal): boolean {
    const o = p.opening;
    if (!o) return true;
    const d = this.byId.get(o.id);
    if (!d) return true;
    return Math.abs(d.angle) > 0.02 || Math.abs(d.target) > 0.02;
  }

  /** Ouvre en s'éloignant de (x, z). */
  open(d: Door, fromX: number, fromZ: number, fast = false): void {
    const s = this.sideOf(d, fromX, fromZ);
    if (Math.abs(d.target) < 0.01) this.sound(d.swing ? "door_swing" : "door_open", d.o.x, d.o.y + 1, d.o.z);
    d.target = -s * MAX_ANGLE;
    d.speed = MAX_ANGLE / (fast ? OPEN_TIME * 0.7 : OPEN_TIME);
    d.everOpened = true;
  }

  close(d: Door): void {
    d.target = 0;
    d.speed = MAX_ANGLE / CLOSE_TIME;
  }

  /** Déverrouille (badge, clé, planches, chaîne, sens unique). */
  unlock(d: Door): void {
    d.locked = false;
    this.onUnlock?.(d);
    const snd = d.lock === "planks" ? "planks_rip" : d.lock === "chain" ? "chain_cut" : d.lock === "oneWay" ? "pushbar" : d.lock === "morgueKey" ? "key_unlock" : "badge_ok";
    this.sound(snd, d.o.x, d.o.y + 1.1, d.o.z);
    this.setLeds(d);
    if (d.planks) this.props.setHidden(d.planks, true);
    if (d.planksFallen) this.props.setHidden(d.planksFallen, false);
    if (d.chain) this.props.setHidden(d.chain, true);
    if (d.chainCut) this.props.setHidden(d.chainCut, false);
  }

  private applyAngle(d: Door): void {
    const s = Math.sin(d.angle);
    const c = Math.cos(d.angle);
    for (const l of d.leaves) {
      const vx = l.dx * c + d.nx * s;
      const vz = l.dz * c + d.nz * s;
      const yaw = Math.atan2(-vz, vx);
      this.props.move(l.inst, l.hx, d.o.y, l.hz, yaw);
      const col = l.collider;
      col.cx = l.hx + vx * (l.width / 2);
      col.cz = l.hz + vz * (l.width / 2);
      setColliderAngle(col, -yaw);
      this.world.collision.update(col);
      if (l.handle) this.props.move(l.handle, l.hx + vx * l.handleU, d.o.y + l.handleY, l.hz + vz * l.handleU, yaw + l.handleFlip);
    }
  }

  /** Animation + battantes automatiques. */
  update(dt: number, ctx: GameContext): void {
    const p = ctx.player;
    for (const d of this.doors) {
      // battantes : s'ouvrent au passage, se referment seules
      if (d.swing && !d.locked) {
        const ddx = p.x - d.o.x;
        const ddz = p.z - d.o.z;
        const along = Math.abs(ddx * (1 - d.nx) + ddz * (1 - d.nz));
        const across = ddx * d.nx + ddz * d.nz;
        const vAcross = (p.body.vx * d.nx + p.body.vz * d.nz) * -Math.sign(across || 1);
        const reach = 0.8 + Math.max(0, vAcross) * 0.25;
        const near = along < d.o.width / 2 + 0.2 && Math.abs(across) < reach && Math.abs(p.y - d.o.y) < 1.2;
        if (near) {
          if (!this.isOpen(d) && Math.abs(d.target) < 0.01 && (vAcross > 0.8 || Math.abs(across) < 0.5)) {
            this.open(d, p.x, p.z, true);
            ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, 6, "door");
          }
          d.autoClose = 1.4;
        } else if (Math.abs(d.target) > 0.01) {
          d.autoClose -= dt;
          if (d.autoClose <= 0) this.close(d);
        }
      }
      if (d.angle === d.target) continue;
      const step = d.speed * dt;
      const diff = d.target - d.angle;
      d.angle = Math.abs(diff) <= step ? d.target : d.angle + Math.sign(diff) * step;
      this.applyAngle(d);
      if (d.angle === 0 && d.target === 0) {
        ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, d.swing ? 4 : 7, "slam");
        this.sound(d.swing ? "door_swing" : "door_close", d.o.x, d.o.y + 1, d.o.z);
      }
    }
  }

  /** Interactifs (un par vantail). */
  interactables(): Interactable[] {
    const out: Interactable[] = [];
    for (const d of this.doors) {
      const own = d.leaves.map((l) => l.collider);
      for (const l of d.leaves) {
        const shape = { kind: "box" as const, cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0.1, cos: 1, sin: 0 };
        out.push({
          id: `door_${d.id}_${out.length}`,
          own,
          active: () => true,
          shape: () => {
            const c = l.collider;
            shape.cx = c.cx;
            shape.cz = c.cz;
            shape.cy = d.o.y + l.height / 2;
            shape.hx = c.hx;
            shape.hy = l.height / 2;
            shape.cos = c.cos;
            shape.sin = c.sin;
            return shape;
          },
          prompt: (ctx) => this.prompt(d, ctx),
          interact: (ctx) => this.interact(d, ctx),
        });
      }
    }
    return out;
  }

  private prompt(d: Door, ctx: GameContext): Prompt {
    const side = this.sideOf(d, ctx.player.x, ctx.player.z);
    if (!d.locked) return { text: this.wideOpen(d) ? "Fermer" : "Ouvrir", enabled: true };
    const inv = ctx.inventory;
    const badge = BADGE[d.lock];
    if (badge) {
      if (inv.has(badge.item)) return { text: `Badger — ${ctx.itemName(badge.item)}`, enabled: true };
      return { text: `Verrouillée — lecteur de badge ${badge.color}`, enabled: false };
    }
    switch (d.lock) {
      case "morgueKey":
        return inv.has("morgueKey") ? { text: "Déverrouiller — Clé de la morgue", enabled: true } : { text: "Verrouillée — il faut la clé de la morgue", enabled: false };
      case "planks":
        if (side !== d.lockSide) return { text: "Bloquée de l'autre côté", enabled: false };
        return inv.has("crowbar") ? { text: "Arracher les planches", enabled: true, hold: 1.1 } : { text: "Planches clouées — il faut un pied-de-biche", enabled: false };
      case "chain":
        if (side !== d.lockSide) return { text: "Bloquée de l'extérieur", enabled: false };
        return inv.has("boltCutter") ? { text: "Couper la chaîne", enabled: true, hold: 0.8 } : { text: "Chaîne cadenassée — il faut une pince coupante", enabled: false };
      case "oneWay":
        return side === d.lockSide ? { text: "Ouvrir (barre anti-panique)", enabled: true } : { text: "Ne s'ouvre pas de ce côté", enabled: false };
      case "power":
        return ctx.power ? { text: "Ouvrir", enabled: true } : { text: "Porte électrique — pas de courant", enabled: false };
      case "sealed":
        return d.o.id === "g_main_entrance"
          ? { text: "Verrouillée — la ventouse magnétique ne lâche pas", enabled: false }
          : { text: "Condamnée — elle ne s'ouvrira pas", enabled: false };
      default:
        return { text: "Verrouillée", enabled: false };
    }
  }

  private interact(d: Door, ctx: GameContext): void {
    const p = ctx.player;
    if (d.locked) {
      let radius = 4;
      switch (d.lock) {
        case "planks":
          radius = 15;
          ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, radius, "planks");
          break;
        case "chain":
          radius = 10;
          ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, radius, "chain");
          break;
        case "oneWay":
          ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, 9, "unlock");
          break;
        default:
          ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, radius, "unlock");
      }
      this.unlock(d);
      if (d.lock === "planks" || d.lock === "chain") {
        // l'obstacle retiré, la porte reste fermée : on l'ouvrira d'un second appui
        if (d.splitLabel) ctx.split(`door_${d.id}`, d.splitLabel);
        return;
      }
    }
    if (this.wideOpen(d)) {
      this.close(d);
      ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, 6, "door");
    } else {
      this.open(d, p.x, p.z);
      ctx.noise.make(d.o.x, d.o.y + 1, d.o.z, 6, "door");
      if (d.splitLabel) ctx.split(`door_${d.id}`, d.splitLabel);
    }
  }
}
