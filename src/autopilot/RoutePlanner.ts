import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Logger } from "@babylonjs/core/Misc/logger";
import { CONFIG } from "../config";
import { NavFlags, type Navigation } from "../ai/Navigation";
import type { Gameplay } from "../gameplay/Gameplay";
import type { Door } from "../gameplay/Doors";
import type { WorldItem, WorldNote } from "../gameplay/Items";
import type { Interactable } from "../gameplay/Interaction";
import { ITEMS, type ItemId } from "../gameplay/data/items";
import { CODE_NOTES, SAFES, type CodeId } from "../gameplay/data/spawns";
import { EXTERIOR } from "../world/builder/ExteriorBuilder";
import { ROOF_EXIT } from "../world/builder/RoofBuilder";
import type { FloorId } from "../world/layout/types";

export type RouteExit = "gate" | "ambulance" | "roof";

export const EXIT_NAMES: Record<RouteExit, string> = { gate: "Portail principal", ambulance: "Ambulance", roof: "Échelle du toit" };

/** Point de passage (où l'on se tient). */
export interface RouteNode {
  id: number;
  x: number;
  y: number;
  z: number;
  floor: FloorId;
  region: string;
  label: string;
  /** posé sur la navmesh (sinon : point hors d'atteinte, à ne pas utiliser comme passage) */
  onMesh: boolean;
}

/** Passage « spécial » entre deux points : porte verrouillable, conduit, fenêtre, ascenseur. */
export interface RoutePortal {
  kind: "door" | "vent" | "window" | "drop" | "elevator";
  a: number;
  b: number;
  /** temps de franchissement (s) */
  cost: number;
  oneWay: boolean;
  doorId?: string;
  openingId?: string;
  floors?: [FloorId, FloorId];
}

export type TaskKind = "pick" | "read" | "safe" | "unlock" | "power" | "gateBox" | "gateExit" | "bayChain" | "hood" | "start" | "ladder";

/** Action élémentaire de la route. */
export interface RouteTask {
  index: number;
  kind: TaskKind;
  label: string;
  place: string;
  node: number;
  /** interactable visé (null : simple déplacement) */
  target: string | null;
  /** durée de l'action pour un joueur parfait (s) */
  duration: number;
  needItems: ItemId[];
  needTasks: number[];
  gives: ItemId[];
  consumes: ItemId[];
  unlocks: string | null;
  power: boolean;
  final: boolean;
  item?: WorldItem;
  note?: WorldNote;
  safeId?: string;
  doorId?: string;
  code?: string;
  /** reprise d'un objet laissé plus tôt par un échange */
  repick?: ItemId;
}

/** Tronçon de trajet entre deux actions : points intermédiaires (portails compris). */
export interface RouteLeg {
  nodes: number[];
  /** portail emprunté pour arriver à chaque point (−1 : à pied) */
  via: number[];
  /** longueur marchée (m) hors portails */
  length: number;
  /** temps fixe des portails / portes franchis (s) */
  fixed: number;
}

export interface RouteStep {
  task: RouteTask;
  leg: RouteLeg;
  /** temps théorique à la fin de l'étape (s) */
  at: number;
  /** objet laissé sur place (échange, inventaire plein) */
  drop: ItemId | null;
}

export interface Route {
  exit: RouteExit;
  steps: RouteStep[];
  /** meilleur temps théorique estimé (s) */
  theoretical: number;
  nodes: RouteNode[];
  portals: RoutePortal[];
  /** temps de calcul (ms) */
  ms: number;
}

const INF = Number.POSITIVE_INFINITY;

/** Durées des actions pour un joueur parfait (s). */
const ACT = {
  aim: 0.25,
  press: 0.1,
  read: 0.45,
  typeDigit: 0.11,
  keypadClose: 0.65,
  safeDoor: 0.35,
  doorOpen: 0.35,
  swap: 0.25,
  /** s'accroupir puis se relever */
  crouch: 0.3,
};

/** Le segment (ax, az)–(bx, bz) coupe-t-il le rectangle ? (Liang–Barsky) */
function segmentHitsRect(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dz, az - z0) && clip(dz, z1 - az);
}

/** Vitesse moyenne (sprint dès que la jauge est pleine) utilisée pour comparer les routes. */
function averageSpeed(): number {
  const p = CONFIG.player;
  const s = CONFIG.sprint;
  const cycle = s.duration + s.rechargeDelay + s.rechargeTime;
  return (p.sprintSpeed * s.duration + p.walkSpeed * (s.rechargeDelay + s.rechargeTime)) / cycle;
}

/** Temps de marche d'une suite de tronçons avec gestion réelle de la jauge de sprint. */
export function simulateWalk(segments: Array<{ length: number; fixed: number }>): number {
  const p = CONFIG.player;
  const s = CONFIG.sprint;
  let t = 0;
  let gauge = 1;
  let state: "ready" | "sprint" | "delay" | "recharge" = "ready";
  let timer = 0;
  const advance = (dt: number, moving: boolean): number => {
    // renvoie la distance parcourue pendant dt
    let dist = 0;
    let rest = dt;
    while (rest > 1e-6) {
      if (state === "ready" && moving) state = "sprint";
      if (state === "sprint") {
        const left = gauge * s.duration;
        const step = Math.min(rest, left);
        // la jauge se vide même à l'arrêt (sprint « tout ou rien »)
        dist += moving ? p.sprintSpeed * step : 0;
        gauge -= step / s.duration;
        rest -= step;
        if (gauge <= 1e-6) {
          gauge = 0;
          state = "delay";
          timer = s.rechargeDelay;
        }
        continue;
      }
      const speed = moving ? p.walkSpeed : 0;
      if (state === "delay") {
        const step = Math.min(rest, timer);
        dist += speed * step;
        timer -= step;
        rest -= step;
        if (timer <= 1e-6) state = "recharge";
        continue;
      }
      if (state === "recharge") {
        const step = Math.min(rest, (1 - gauge) * s.rechargeTime);
        dist += speed * step;
        gauge += step / s.rechargeTime;
        rest -= step;
        if (gauge >= 1 - 1e-6) {
          gauge = 1;
          state = "ready";
        }
        continue;
      }
      // prêt mais immobile
      dist += 0;
      rest = 0;
    }
    return dist;
  };
  for (const seg of segments) {
    // temps fixe (actions, portails) : la jauge se recharge sans avancer
    if (seg.fixed > 0) {
      advance(seg.fixed, false);
      t += seg.fixed;
    }
    let left = seg.length;
    while (left > 1e-4) {
      const dt = 0.05;
      const d = advance(dt, true);
      if (d >= left) {
        t += dt * (left / d);
        left = 0;
      } else {
        left -= d;
        t += dt;
      }
    }
  }
  return t;
}

/** File de priorité (tas binaire) sur un coût. */
class Heap<T> {
  private items: T[] = [];
  private keys: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: T, key: number): void {
    const a = this.items;
    const k = this.keys;
    a.push(item);
    k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= k[i]!) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      [k[p], k[i]] = [k[i]!, k[p]!];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    const k = this.keys;
    if (!a.length) return undefined;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastKey = k.pop()!;
    if (a.length) {
      a[0] = lastItem;
      k[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && k[l]! < k[m]!) m = l;
        if (r < a.length && k[r]! < k[m]!) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        [k[m], k[i]] = [k[i]!, k[m]!];
        i = m;
      }
    }
    return top;
  }
}

interface SearchState {
  mask: number;
  pos: number;
  /** objets en main : type → nombre */
  held: Map<ItemId, number>;
  /** objets laissés par des échanges : « objet@point » → nombre */
  dropped: Map<string, number>;
  time: number;
  parent: SearchState | null;
  /** action faite pour arriver ici (−1 : départ, −2 : reprise d'un objet laissé) */
  task: number;
  repick: ItemId | null;
  /** objet laissé sur place pendant cette étape */
  drop: ItemId | null;
  key: string;
}

/**
 * Planificateur de route du pilote auto. Construit un graphe de points (actions, portes
 * verrouillables, conduits, fenêtres, ascenseur) dont les distances viennent de la navmesh,
 * puis cherche (A*) la meilleure suite d'actions pour chaque sortie en respectant les règles
 * du jeu : objets requis en main, inventaire de 2 emplacements, codes lus avant les coffres,
 * portes déverrouillées avant d'être franchies, courant pour l'ascenseur.
 */
export class RoutePlanner {
  private nodes: RouteNode[] = [];
  private portals: RoutePortal[] = [];
  private tasks: RouteTask[] = [];
  private regionOf = new Map<string, string>();
  private pair = new Map<string, { length: number; doors: number; crouch: number }>();
  private dij = new Map<string, { dist: Float64Array; prev: Int32Array; via: Int32Array }>();
  private byRegion = new Map<string, number[]>();
  private readonly speed = averageSpeed();
  private startNode = 0;
  private startRegion = "";
  private powerTask = -1;
  /** borne inférieure du temps restant (sortie en cours) */
  private bound: (mask: number, pos: number) => number = () => 0;
  /** utilité d'une porte facultative selon les actions faites */
  private usefulCache = new Map<number, boolean>();
  /** actions incontournables de la sortie en cours */
  private mandatory = new Set<number>();
  /** porte → action qui la déverrouille (sortie en cours) */
  private doorTask = new Map<string, number>();
  /** bits des actions qui ouvrent des passages (portes, courant) */
  private sigMask = 0;
  /** portails partant de chaque point */
  private portalsAt: number[][] = [];
  /** diagnostic (tests) */
  stats = { expanded: 0, capped: false, weight: 1, mandatory: 0, repick: false };
  maxExpand = 120_000;

  constructor(
    private readonly gp: Gameplay,
    private readonly nav: Navigation,
  ) {}

  // ================================================================ graphe

  private floorOfY(y: number): FloorId {
    const floors = [...this.gp.world.layout.floors].sort((a, b) => b.y - a.y);
    return (floors.find((f) => f.y <= y + 0.6) ?? floors[floors.length - 1]!).id;
  }

  /** Régions : pièces reliées sans verrou (ni conduit, fenêtre, ascenseur). */
  private buildRegions(): void {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      if (!parent.has(x)) parent.set(x, x);
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string) => parent.set(find(a), find(b));
    const outside = (f: FloorId) => (f === "R" ? "roof" : f === "U" ? "void" : "ext");
    for (const o of this.gp.world.openings) {
      const a = o.roomA?.id ?? outside(o.floor);
      const b = o.roomB?.id ?? outside(o.floor);
      find(a);
      find(b);
      const lock = o.spec?.lock ?? "none";
      if (o.kind === "open" || o.kind === "arch" || ((o.kind === "door" || o.kind === "double") && lock === "none")) union(a, b);
    }
    const shafts = new Map<string, string[]>();
    for (const r of this.gp.world.layout.rooms) {
      find(r.id);
      if (!r.shaft || r.kind !== "stair") continue;
      const l = shafts.get(r.shaft) ?? [];
      l.push(r.id);
      shafts.set(r.shaft, l);
    }
    for (const l of shafts.values()) for (let i = 1; i < l.length; i++) union(l[0]!, l[i]!);
    for (const k of parent.keys()) this.regionOf.set(k, find(k));
  }

  private regionAt(x: number, y: number, z: number): string {
    const room = this.gp.world.roomAt(x, y + 0.4, z);
    if (room) return this.regionOf.get(room.id) ?? room.id;
    const f = this.floorOfY(y);
    return this.regionOf.get(f === "R" ? "roof" : "ext") ?? "ext";
  }

  private roomName(x: number, y: number, z: number): string {
    return this.gp.world.roomAt(x, y + 0.4, z)?.name ?? (this.floorOfY(y) === "R" ? "Toit" : "Dehors");
  }

  private addNode(x: number, y: number, z: number, label: string, snap = true, region?: string): number {
    let p = new Vector3(x, y, z);
    let onMesh = !snap;
    if (snap) {
      const q = this.nav.closest(p, NavFlags.WALK | NavFlags.SHORTCUT);
      if (Number.isFinite(q.x) && Math.hypot(q.x - x, q.z - z) < 1.2 && Math.abs(q.y - y) < 1.2) {
        p = q;
        onMesh = true;
      }
    }
    const n: RouteNode = { id: this.nodes.length, x: p.x, y: p.y, z: p.z, floor: this.floorOfY(p.y), region: region ?? this.regionAt(p.x, p.y, p.z), label, onMesh };
    this.nodes.push(n);
    const l = this.byRegion.get(n.region) ?? [];
    l.push(n.id);
    this.byRegion.set(n.region, l);
    return n.id;
  }

  private interactable(id: string): Interactable | null {
    return this.gp.interaction.list.find((it) => it.id === id) ?? null;
  }

  /** Point debout d'où l'on vise (et atteint) un objet interactif. */
  standPoint(target: Interactable, preferRegion?: string): Vector3 | null {
    const s = target.shape();
    const c = s.kind === "sphere" ? new Vector3(s.x, s.y, s.z) : new Vector3(s.cx, s.cy, s.cz);
    const floorY = this.gp.world.floorY(this.floorOfY(c.y - 0.2));
    const range = (target.range ?? CONFIG.player.interactRange) - 0.15;
    const eye = CONFIG.player.eyeStand;
    // meilleur candidat : visé directement ET relié au reste de la région, sinon l'un des deux
    let best: Vector3 | null = null;
    let bestScore = 0;
    for (const r of [0.75, 1.0, 0.55, 1.3, 1.6, 1.9]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = c.x + Math.cos(a) * r;
        const pz = c.z + Math.sin(a) * r;
        const q = this.nav.closest(new Vector3(px, floorY, pz), NavFlags.WALK);
        if (!Number.isFinite(q.x) || Math.hypot(q.x - px, q.z - pz) > 0.2 || Math.abs(q.y - floorY) > 0.6) continue;
        if (preferRegion && this.regionAt(q.x, q.y, q.z) !== preferRegion) continue;
        const ex = q.x;
        const ey = q.y + eye;
        const ez = q.z;
        const dx = c.x - ex;
        const dy = c.y - ey;
        const dz = c.z - ez;
        const d = Math.hypot(dx, dy, dz);
        if (d > range) continue;
        const aimed = this.gp.interaction.pick(this.gp, ex, ey, ez, dx / d, dy / d, dz / d) === target;
        // relié au reste de la région (pas un îlot de navmesh coincé entre des meubles)
        const linked = this.connected(q);
        const score = (aimed ? 2 : 0) + (linked ? 1 : 0);
        if (score === 3) return q;
        if (score > bestScore) {
          best = q;
          bestScore = score;
        }
      }
    }
    return best;
  }

  /** Le point est-il relié (navmesh) aux points déjà connus de sa région ? */
  private connected(q: Vector3): boolean {
    const region = this.regionAt(q.x, q.y, q.z);
    const known = (this.byRegion.get(region) ?? [])
      .map((id) => this.nodes[id]!)
      .sort((a, b) => Math.hypot(a.x - q.x, a.z - q.z) - Math.hypot(b.x - q.x, b.z - q.z))
      .slice(0, 3);
    if (!known.length) return true;
    for (const n of known) {
      const path = this.nav.path(new Vector3(n.x, n.y, n.z), q, NavFlags.WALK | NavFlags.JUMP);
      const end = path[path.length - 1];
      if (end && Math.hypot(end.x - q.x, end.z - q.z) < 0.5 && Math.abs(end.y - q.y) < 1) return true;
    }
    return false;
  }

  private standNode(targetId: string, label: string, preferRegion?: string): number {
    const t = this.interactable(targetId);
    const p = t ? this.standPoint(t, preferRegion) ?? (preferRegion ? this.standPoint(t) : null) : null;
    if (!p) throw new Error(`pilote auto : pas de point d'accès pour ${targetId}`);
    return this.addNode(p.x, p.y, p.z, label, false);
  }

  /** Portails : portes verrouillables, conduits, fenêtres cassées, ascenseur. */
  private buildPortals(): void {
    const v = this.speed;
    for (const d of this.gp.doors.doors) {
      if (d.lock === "none" || d.lock === "sealed") continue;
      const o = d.o;
      const a = this.addNode(o.x - d.nx * 0.9, o.y, o.z - d.nz * 0.9, `${d.label || d.id} (A)`);
      const b = this.addNode(o.x + d.nx * 0.9, o.y, o.z + d.nz * 0.9, `${d.label || d.id} (B)`);
      this.portals.push({ kind: "door", a, b, cost: 1.8 / v + ACT.doorOpen, oneWay: false, doorId: d.id, openingId: o.id });
    }
    for (const o of this.gp.world.openings) {
      if (o.kind !== "vent") continue;
      const nx = o.axis === "x" ? 0 : 1;
      const nz = o.axis === "x" ? 1 : 0;
      const a = this.addNode(o.x - nx * 0.9, o.y, o.z - nz * 0.9, `conduit ${o.id} (A)`);
      const b = this.addNode(o.x + nx * 0.9, o.y, o.z + nz * 0.9, `conduit ${o.id} (B)`);
      // un bout hors navmesh (coincé sous un escalier, derrière un meuble) : passage inutilisable
      if (!this.nodes[a]!.onMesh || !this.nodes[b]!.onMesh) continue;
      this.portals.push({ kind: "vent", a, b, cost: 0.3 + 1.8 / CONFIG.player.crouchSpeed + 0.2, oneWay: false, openingId: o.id });
    }
    for (const o of this.gp.vaults.windows) {
      const nx = o.axis === "x" ? 0 : 1;
      const nz = o.axis === "x" ? 1 : 0;
      const drop = (!o.roomA || !o.roomB) && o.floor === "U";
      if (drop) {
        const insideSign = o.roomA ? -1 : 1;
        const a = this.addNode(o.x + nx * 0.9 * insideSign, o.y, o.z + nz * 0.9 * insideSign, `fenêtre ${o.id}`);
        const ox = o.x - nx * 0.9 * insideSign;
        const oz = o.z - nz * 0.9 * insideSign;
        const g = this.gp.world.collisionGround(ox, oz, o.y - 1);
        const b = this.addNode(ox, Number.isFinite(g) ? g : 0, oz, `sous la fenêtre ${o.id}`);
        if (!this.nodes[a]!.onMesh || !this.nodes[b]!.onMesh) continue;
        this.portals.push({ kind: "drop", a, b, cost: 1.4, oneWay: true, openingId: o.id });
      } else {
        const a = this.addNode(o.x - nx * 0.9, o.y, o.z - nz * 0.9, `fenêtre ${o.id} (A)`);
        const b = this.addNode(o.x + nx * 0.9, o.y, o.z + nz * 0.9, `fenêtre ${o.id} (B)`);
        if (!this.nodes[a]!.onMesh || !this.nodes[b]!.onMesh) continue;
        this.portals.push({ kind: "window", a, b, cost: 1.0, oneWay: false, openingId: o.id });
      }
    }
    // ascenseur : un point devant chaque palier
    const landing = new Map<FloorId, number>();
    for (const f of ["B", "G", "U", "R"] as FloorId[]) {
      const y = this.gp.world.floorY(f);
      const z = f === "R" ? 43.3 : 37.7;
      landing.set(f, this.addNode(37.5, y, z, `ascenseur (${f})`));
    }
    const fl = [...landing.keys()];
    for (let i = 0; i < fl.length; i++) {
      for (let j = 0; j < fl.length; j++) {
        if (i === j) continue;
        const dy = Math.abs(this.gp.world.floorY(fl[i]!) - this.gp.world.floorY(fl[j]!));
        // appel + portes + montée + marche dans / hors de la cabine
        this.portals.push({ kind: "elevator", a: landing.get(fl[i]!)!, b: landing.get(fl[j]!)!, cost: 2.5 + 1.4 + dy / 2.4 + 0.8 + 1.4 + 1.2, oneWay: true, floors: [fl[i]!, fl[j]!] });
      }
    }
    this.portalsAt = [];
    this.portals.forEach((p, i) => {
      (this.portalsAt[p.a] ??= []).push(i);
      (this.portalsAt[p.b] ??= []).push(i);
    });
  }

  /** Longueur de marche entre deux points d'une même région (navmesh), + portes à ouvrir et temps accroupi. */
  private walk(a: number, b: number): { length: number; doors: number; crouch: number } {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const hit = this.pair.get(key);
    if (hit) return hit;
    const na = this.nodes[a]!;
    const nb = this.nodes[b]!;
    let res = { length: INF, doors: 0, crouch: 0 };
    // les obstacles bas (gravats, brancards, arbre) se passent accroupi : liaisons JUMP de la navmesh
    const path = this.nav.path(new Vector3(na.x, na.y, na.z), new Vector3(nb.x, nb.y, nb.z), NavFlags.WALK | NavFlags.JUMP);
    if (path.length) {
      const end = path[path.length - 1]!;
      if (Math.hypot(end.x - nb.x, end.z - nb.z) < 0.7 && Math.abs(end.y - nb.y) < 1.2) {
        let len = Math.hypot(path[0]!.x - na.x, path[0]!.z - na.z);
        for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y, path[i]!.z - path[i - 1]!.z);
        res = { length: len, doors: this.doorsCrossed(path), crouch: this.crouchCost(path) };
      }
    }
    this.pair.set(key, res);
    return res;
  }

  /** Surcoût (s) des passages accroupis sous les obstacles bas traversés par une polyligne. */
  private crouchCost(path: Vector3[]): number {
    let extra = 0;
    for (const bar of this.gp.world.layout.barriers) {
      const y = this.gp.world.floorY(bar.floor);
      const [x0, z0, x1, z1] = bar.area;
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1]!;
        const q = path[i]!;
        if (Math.abs((p.y + q.y) / 2 - y) > 1.2) continue;
        if (!segmentHitsRect(p.x, p.z, q.x, q.z, x0 - 0.1, z0 - 0.1, x1 + 0.1, z1 + 0.1)) continue;
        // on traverse l'axe court, avec la marge de la capsule de part et d'autre
        const depth = Math.min(x1 - x0, z1 - z0) + 1.0;
        extra += depth / CONFIG.player.crouchSpeed - depth / this.speed + ACT.crouch;
        break;
      }
    }
    return extra;
  }

  /** Portes ordinaires (fermées, non battantes) croisées par une polyligne. */
  private doorsCrossed(path: Vector3[]): number {
    let n = 0;
    for (const d of this.gp.doors.doors) {
      if (d.lock !== "none" || d.swing) continue;
      const o = d.o;
      const hw = o.width / 2;
      for (let i = 1; i < path.length; i++) {
        const p = path[i - 1]!;
        const q = path[i]!;
        if (Math.abs((p.y + q.y) / 2 - o.y) > 1.5) continue;
        // ligne de la porte : axis x → segment le long de x à z = o.z
        const s0 = o.axis === "x" ? p.z - o.z : p.x - o.x;
        const s1 = o.axis === "x" ? q.z - o.z : q.x - o.x;
        if (s0 * s1 > 0) continue;
        const t = s0 / (s0 - s1 || 1e-9);
        const along = o.axis === "x" ? p.x + (q.x - p.x) * t - o.x : p.z + (q.z - p.z) * t - o.z;
        if (Math.abs(along) <= hw + 0.1) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  /** Signature des passages ouverts (portes déverrouillées, courant) pour un masque de tâches. */
  private signature(mask: number): number {
    return mask & this.sigMask;
  }

  private portalOpen(p: RoutePortal, sig: number): boolean {
    if (p.kind === "door") {
      const t = this.doorTask.get(p.doorId!);
      return t !== undefined && (sig & (1 << t)) !== 0;
    }
    if (p.kind === "elevator") return this.powerTask >= 0 && (sig & (1 << this.powerTask)) !== 0;
    return true;
  }

  /** Dijkstra depuis un point (temps en s), passages ouverts selon la signature ; `all` : tout ouvert. */
  private dijkstra(from: number, sig: number, all = false): { dist: Float64Array; prev: Int32Array; via: Int32Array } {
    const key = `${from}|${all ? "ALL" : sig}`;
    const hit = this.dij.get(key);
    if (hit) return hit;
    const res = this.dijkstraCore(from, all ? () => true : (p) => this.portalOpen(p, sig));
    this.dij.set(key, res);
    return res;
  }

  private dijkstraCore(from: number, open: (p: RoutePortal) => boolean): { dist: Float64Array; prev: Int32Array; via: Int32Array } {
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(INF);
    const prev = new Int32Array(n).fill(-1);
    /** portail utilisé pour arriver (−1 : marche) */
    const via = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[from] = 0;
    const heap = new Heap<number>();
    heap.push(from, 0);
    const v = this.speed;
    const openP = this.portals.map((p) => open(p));
    while (heap.size) {
      const u = heap.pop()!;
      if (done[u]) continue;
      done[u] = 1;
      const nu = this.nodes[u]!;
      for (const w of this.byRegion.get(nu.region) ?? []) {
        if (w === u || done[w]) continue;
        const e = this.walk(u, w);
        if (!Number.isFinite(e.length)) continue;
        const c = dist[u]! + e.length / v + e.doors * ACT.doorOpen + e.crouch;
        if (c < dist[w]!) {
          dist[w] = c;
          prev[w] = u;
          via[w] = -1;
          heap.push(w, c);
        }
      }
      for (const pi of this.portalsAt[u] ?? []) {
        if (!openP[pi]) continue;
        const p = this.portals[pi]!;
        let w = -1;
        if (p.a === u) w = p.b;
        else if (p.b === u && !p.oneWay) w = p.a;
        if (w < 0 || done[w]) continue;
        const c = dist[u]! + p.cost;
        if (c < dist[w]!) {
          dist[w] = c;
          prev[w] = u;
          via[w] = pi;
          heap.push(w, c);
        }
      }
    }
    return { dist, prev, via };
  }

  /** Tronçon (points + longueurs) de `a` à `b` pour une signature. */
  private leg(a: number, b: number, sig: number): RouteLeg {
    const { prev, via } = this.dijkstra(a, sig);
    const nodes: number[] = [];
    const hops: number[] = [];
    let length = 0;
    let fixed = 0;
    for (let u = b; u !== -1; u = prev[u]!) {
      nodes.unshift(u);
      hops.unshift(via[u]!);
      const p = prev[u]!;
      if (p === -1) break;
      if (via[u]! >= 0) fixed += this.portals[via[u]!]!.cost;
      else {
        const e = this.walk(p, u);
        length += e.length;
        fixed += e.doors * ACT.doorOpen + e.crouch;
      }
    }
    return { nodes, via: hops, length, fixed };
  }

  // ================================================================ tâches

  private addTask(t: Omit<RouteTask, "index">): number {
    const index = this.tasks.length;
    this.tasks.push({ ...t, index });
    return index;
  }

  /** Construit les tâches utiles à une sortie (fermeture par dépendances). */
  private buildTasks(exit: RouteExit): number {
    this.tasks = [];
    this.powerTask = -1;
    const gp = this.gp;
    const plan = gp.plan!;
    const itemTasks = new Map<WorldItem, number>();
    const safeTasks = new Map<string, number>();
    const noteTasks = new Map<string, number>();
    const doorTasks = new Map<string, number>();
    const regionsDone = new Set<string>();
    const lockItem: Partial<Record<string, ItemId>> = { badgeBlue: "badgeBlue", badgeGreen: "badgeGreen", badgeRed: "badgeRed", morgueKey: "morgueKey", planks: "crowbar", chain: "boltCutter" };

    const requireRegion = (r: string): void => {
      if (r === this.startRegion || regionsDone.has(r)) return;
      regionsDone.add(r);
      for (const p of this.portals) {
        if (p.kind === "elevator") {
          if (this.nodes[p.b]!.region === r) requirePower();
          continue;
        }
        if (p.kind !== "door") continue;
        const ra = this.nodes[p.a]!.region;
        const rb = this.nodes[p.b]!.region;
        if (ra !== r && rb !== r) continue;
        requireDoor(gp.doors.byId.get(p.doorId!)!, p);
        requireRegion(ra === r ? rb : ra);
      }
    };
    const requireAt = (node: number) => requireRegion(this.nodes[node]!.region);
    const requireDoor = (d: Door, p: RoutePortal): void => {
      if (doorTasks.has(d.id)) return;
      const key = lockItem[d.lock];
      // côté du verrou : B si lockSide = +1, A si −1, sinon le côté « libre »
      let node = p.a;
      if (d.lockSide === 1) node = p.b;
      else if (d.lockSide === 0 && this.nodes[p.b]!.region === this.startRegion) node = p.b;
      const planks = d.lock === "planks" || d.lock === "chain";
      const hold = d.lock === "planks" ? 1.1 : d.lock === "chain" ? 0.8 : 0;
      const idx = this.addTask({
        kind: "unlock",
        label: d.lock === "oneWay" ? `Sortie : ${d.label || "porte"}` : d.label || this.doorName(d),
        place: this.roomName(this.nodes[node]!.x, this.nodes[node]!.y, this.nodes[node]!.z),
        node,
        target: `door_${d.id}`,
        duration: ACT.aim + ACT.press + hold + (planks ? ACT.aim + ACT.press : 0) + ACT.doorOpen,
        needItems: key ? [key] : [],
        needTasks: [],
        gives: [],
        consumes: [],
        unlocks: d.id,
        power: false,
        final: false,
        doorId: d.id,
      });
      doorTasks.set(d.id, idx);
      if (key) requireItem(key);
    };
    const requireItem = (id: ItemId): void => {
      for (const it of gp.items.items) {
        if (it.item !== id || !it.inWorld || itemTasks.has(it)) continue;
        if (it.safe) {
          // chaque objet du coffre se prend séparément (on peut en laisser) ; marqué avant la
          // récursion pour ne pas créer deux fois la même action
          itemTasks.set(it, -1);
          const st = requireSafe(it.safe);
          const sn = this.tasks[st]!.node;
          const idx = this.addTask({ kind: "pick", label: ITEMS[id].name, place: this.tasks[st]!.place, node: sn, target: this.itemTarget(it), duration: ACT.aim + ACT.press, needItems: [], needTasks: [st], gives: [id], consumes: [], unlocks: null, power: false, final: false, item: it, safeId: it.safe });
          itemTasks.set(it, idx);
          continue;
        }
        const node = this.standNode(`item_${it.item}_${this.itemIndex(it)}`, ITEMS[id].name);
        const idx = this.addTask({ kind: "pick", label: ITEMS[id].name, place: this.roomName(it.x, it.y, it.z), node, target: this.itemTarget(it), duration: ACT.aim + ACT.press, needItems: [], needTasks: [], gives: [id], consumes: [], unlocks: null, power: false, final: false, item: it });
        itemTasks.set(it, idx);
        requireAt(node);
      }
    };
    const requireSafe = (safeId: string): number => {
      const hit = safeTasks.get(safeId);
      if (hit !== undefined) return hit;
      const def = SAFES.find((s) => s.id === safeId)!;
      const node = this.standNode(`safe_${safeId}`, def.label);
      const needTasks: number[] = [];
      const idx = this.addTask({
        kind: "safe",
        label: def.label,
        place: this.roomName(this.nodes[node]!.x, this.nodes[node]!.y, this.nodes[node]!.z),
        node,
        target: `safe_${safeId}`,
        duration: ACT.aim + ACT.press + (def.lock === "code" ? 4 * ACT.typeDigit + ACT.keypadClose : 0) + ACT.safeDoor,
        needItems: def.lock === "key" ? ["safeKey"] : [],
        needTasks,
        gives: [],
        consumes: [],
        unlocks: null,
        power: false,
        final: false,
        safeId,
        code: def.code ? plan.codes.get(def.code) : undefined,
      });
      safeTasks.set(safeId, idx);
      requireAt(node);
      if (def.lock === "key") requireItem("safeKey");
      else for (const t of requireCode(def.code!)) needTasks.push(t);
      return idx;
    };
    const requireCode = (code: CodeId): number[] => {
      const out: number[] = [];
      for (const n of CODE_NOTES) {
        if (n.code !== code) continue;
        const hit = noteTasks.get(n.id);
        if (hit !== undefined) {
          out.push(hit);
          continue;
        }
        const note = gp.items.notes.find((x) => x.id === n.id)!;
        const node = this.standNode(`note_${n.id}`, `Note — ${note.label}`);
        const idx = this.addTask({ kind: "read", label: `Note : ${note.label}`, place: this.roomName(note.x, note.y, note.z), node, target: `note_${n.id}`, duration: ACT.aim + ACT.press + ACT.read, needItems: [], needTasks: [], gives: [], consumes: [], unlocks: null, power: false, final: false, note });
        noteTasks.set(n.id, idx);
        out.push(idx);
        requireAt(node);
      }
      return out;
    };
    const requirePower = (): void => {
      if (this.powerTask >= 0) return;
      const node = this.standNode("fuse_socket_0", "Tableau électrique");
      this.powerTask = this.addTask({ kind: "power", label: "Rétablir le courant", place: this.roomName(this.nodes[node]!.x, this.nodes[node]!.y, this.nodes[node]!.z), node, target: "fuse_socket_0", duration: 2 * (ACT.aim + ACT.press) + ACT.aim + 0.5, needItems: ["fuse"], needTasks: [], gives: [], consumes: ["fuse", "fuse"], unlocks: null, power: true, final: false });
      requireAt(node);
      requireItem("fuse");
    };

    let final = -1;
    if (exit === "gate") {
      requireItem("badgeRed");
      const notes = requireCode("gate");
      const box = this.standNode("gate_box", "Boîtier du portail");
      const b = this.addTask({ kind: "gateBox", label: "Badger + code du portail", place: "Parking", node: box, target: "gate_box", duration: ACT.aim + ACT.press + 4 * ACT.typeDigit + ACT.keypadClose, needItems: ["badgeRed"], needTasks: notes, gives: [], consumes: [], unlocks: null, power: false, final: false, code: plan.codes.get("gate") });
      requireAt(box);
      // la rue n'est pas dans la navmesh : on vise l'intérieur du portail, puis ~2,4 m tout droit
      const mg = EXTERIOR.mainGate;
      const out = this.addNode((mg.x0 + mg.x1) / 2, 0, EXTERIOR.fence.minZ + 1.6, "Portail");
      // le portail met ~1,3 s à s'ouvrir assez : attente comprise
      final = this.addTask({ kind: "gateExit", label: "Franchir le portail", place: "Parking", node: out, target: null, duration: 0.6 + 2.4 / CONFIG.player.sprintSpeed, needItems: [], needTasks: [b], gives: [], consumes: [], unlocks: null, power: false, final: true });
    } else if (exit === "ambulance") {
      requireItem("boltCutter");
      requireItem("battery");
      requireItem("ambulanceKeys");
      const chainN = this.standNode("bay_chain", "Grille des ambulances");
      const chain = this.addTask({ kind: "bayChain", label: "Couper la chaîne de la grille", place: "Cour des ambulances", node: chainN, target: "bay_chain", duration: ACT.aim + 0.9, needItems: ["boltCutter"], needTasks: [], gives: [], consumes: [], unlocks: null, power: false, final: false });
      const hoodN = this.standNode("amb_hood", "Capot de l'ambulance");
      const hood = this.addTask({ kind: "hood", label: "Installer la batterie", place: "Cour des ambulances", node: hoodN, target: "amb_hood", duration: ACT.aim + 1.2, needItems: ["battery"], needTasks: [], gives: [], consumes: ["battery"], unlocks: null, power: false, final: false });
      const doorN = this.standNode("amb_door", "Portière de l'ambulance");
      final = this.addTask({ kind: "start", label: "Démarrer l'ambulance", place: "Cour des ambulances", node: doorN, target: "amb_door", duration: ACT.aim + ACT.press, needItems: ["ambulanceKeys"], needTasks: [chain, hood], gives: [], consumes: [], unlocks: null, power: false, final: true });
      requireAt(chainN);
    } else {
      requirePower();
      requireItem("crowbar");
      const ladder = this.addNode(ROOF_EXIT.x + 0.45, this.gp.world.floorY("R"), ROOF_EXIT.z, "Échelle de secours");
      final = this.addTask({ kind: "ladder", label: "Descendre par l'échelle", place: "Toit", node: ladder, target: null, duration: 0.2, needItems: [], needTasks: [], gives: [], consumes: [], unlocks: null, power: false, final: true });
      requireAt(ladder);
    }
    return final;
  }

  private doorName(d: Door): string {
    const r = this.gp.world.roomAt(d.o.x + d.nx * 0.9, d.o.y + 0.4, d.o.z + d.nz * 0.9) ?? this.gp.world.roomAt(d.o.x - d.nx * 0.9, d.o.y + 0.4, d.o.z - d.nz * 0.9);
    return `Porte — ${r?.name ?? d.id}`;
  }

  private itemIndex(it: WorldItem): number {
    // indice de l'interactable de l'objet (ordre de création dans Items.interactables)
    const all = this.gp.interaction.list.filter((x) => x.id.startsWith(`item_${it.item}_`));
    let best = all[0];
    let bd = INF;
    for (const x of all) {
      const s = x.shape();
      if (s.kind !== "sphere") continue;
      const d = Math.hypot(s.x - it.x, s.z - it.z) + Math.abs(s.y - it.y) * 0.2;
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    return Number(best!.id.slice(best!.id.lastIndexOf("_") + 1));
  }

  private itemTarget(it: WorldItem): string {
    return `item_${it.item}_${this.itemIndex(it)}`;
  }

  // ================================================================ recherche

  private heldSlots(held: Map<ItemId, number>): number {
    let n = 0;
    for (const c of held.values()) if (c > 0) n++;
    return n;
  }

  private heldKey(held: Map<ItemId, number>): string {
    return [...held]
      .filter(([, c]) => c > 0)
      .map(([k, c]) => `${k}${c}`)
      .sort()
      .join(".");
  }

  /** Nombre d'exemplaires d'un objet qu'une tâche demande en main. */
  private needCount(t: RouteTask, it: ItemId): number {
    return t.kind === "power" && it === "fuse" ? ITEMS.fuse.count : 1;
  }

  /**
   * Tâches incontournables et leurs précédences : l'action finale, ses prérequis, les objets
   * uniques demandés, et les portes / le courant sans lesquels un point obligatoire est inaccessible.
   */
  private mandatoryTasks(final: number): { list: number[]; preds: Map<number, Set<number>> } {
    const tasks = this.tasks;
    const mand = new Set<number>();
    const preds = new Map<number, Set<number>>();
    const edge = (a: number, b: number): void => {
      const l = preds.get(b) ?? new Set<number>();
      l.add(a);
      preds.set(b, l);
    };
    const add = (i: number): void => {
      if (mand.has(i)) return;
      mand.add(i);
      const t = tasks[i]!;
      for (const k of t.needTasks) {
        add(k);
        edge(k, i);
      }
      for (const it of new Set(t.needItems)) {
        const givers = tasks.filter((x) => x.gives.includes(it));
        let total = 0;
        for (const g of givers) total += g.gives.filter((y) => y === it).length;
        if (total > this.needCount(t, it)) continue;
        for (const g of givers) {
          add(g.index);
          edge(g.index, i);
        }
      }
    };
    add(final);
    for (let changed = true; changed; ) {
      changed = false;
      for (const t of tasks) {
        if (t.kind !== "unlock" && t.kind !== "power") continue;
        const closed = (p: RoutePortal): boolean => (t.kind === "unlock" ? p.kind === "door" && p.doorId === t.doorId : p.kind === "elevator");
        const { dist } = this.dijkstraCore(this.startNode, (p) => !closed(p));
        for (const m of [...mand]) {
          if (m === t.index || Number.isFinite(dist[tasks[m]!.node]!) || preds.get(m)?.has(t.index)) continue;
          if (!mand.has(t.index)) add(t.index);
          edge(t.index, m);
          changed = true;
        }
      }
    }
    // pas de cycle (sécurité) : on retire les arêtes qui en créeraient
    const order: number[] = [];
    const state = new Map<number, number>();
    const visit = (i: number): void => {
      state.set(i, 1);
      for (const q of [...(preds.get(i) ?? [])]) {
        const st = state.get(q) ?? 0;
        if (st === 1) preds.get(i)!.delete(q);
        else if (st === 0) visit(q);
      }
      state.set(i, 2);
      order.push(i);
    };
    for (const m of mand) if (!state.get(m)) visit(m);
    return { list: order, preds };
  }

  /** Prérequis remplis (actions faites, objets en main) ? */
  private ready(t: RouteTask, s: SearchState): boolean {
    for (const k of t.needTasks) if (!(s.mask & (1 << k))) return false;
    for (const it of t.needItems) if ((s.held.get(it) ?? 0) < this.needCount(t, it)) return false;
    return true;
  }

  /** Objet encore utile : une action restante le demande et on n'en a pas assez en main. */
  private wanted(it: ItemId, s: SearchState): boolean {
    let need = 0;
    for (const x of this.tasks) {
      if (s.mask & (1 << x.index) || !x.needItems.includes(it)) continue;
      need = Math.max(need, this.needCount(x, it));
    }
    return (s.held.get(it) ?? 0) < need;
  }

  /** Une action restante (hors masque) demande-t-elle cet objet ? */
  private stillNeeded(it: ItemId, mask: number): boolean {
    for (const x of this.tasks) if (!(mask & (1 << x.index)) && x.needItems.includes(it)) return true;
    return false;
  }

  /**
   * Élagage : lire une note, ramasser un objet ou ouvrir un coffre qui ne sert plus à rien ;
   * déverrouiller une porte (facultative) qui ne rapproche d'aucune action restante.
   */
  private useful(t: RouteTask, s: SearchState): boolean {
    if (t.kind === "read") return this.tasks.some((x) => !(s.mask & (1 << x.index)) && x.needTasks.includes(t.index));
    if (t.kind === "pick") return t.gives.some((it) => this.wanted(it, s));
    if (t.kind === "safe") return this.tasks.some((x) => x.kind === "pick" && x.safeId === t.safeId && !(s.mask & (1 << x.index)) && x.gives.some((it) => this.wanted(it, s)));
    if (t.kind === "unlock" && !this.mandatory.has(t.index)) {
      const ck = s.mask * 32 + t.index;
      const hit = this.usefulCache.get(ck);
      if (hit !== undefined) return hit;
      const res = this.doorUseful(t, s.mask);
      this.usefulCache.set(ck, res);
      return res;
    }
    return true;
  }

  /** Déverrouiller cette porte rapproche-t-il d'une action restante (depuis la porte) ? */
  private doorUseful(t: RouteTask, mask: number): boolean {
    const sig = this.signature(mask);
    const before = this.dijkstra(t.node, sig).dist;
    const after = this.dijkstra(t.node, sig | (1 << t.index)).dist;
    for (const x of this.tasks) {
      if (x.index === t.index || mask & (1 << x.index)) continue;
      if (after[x.node]! < before[x.node]! - 0.05) return true;
    }
    return false;
  }

  /** Inventaires possibles après une action (échange si les emplacements sont pleins). */
  private inventoryAfter(give: ItemId | null, consumes: ItemId[], from: Map<ItemId, number>, mask: number): Array<{ held: Map<ItemId, number>; extra: number; drop: ItemId | null; dropCount: number }> {
    const held = new Map(from);
    for (const c of consumes) held.set(c, Math.max(0, (held.get(c) ?? 0) - 1));
    if (!give) return [{ held, extra: 0, drop: null, dropCount: 0 }];
    const have = held.get(give) ?? 0;
    if (have > 0) {
      // pile (fusibles) ; un 2e exemplaire d'un objet unique n'existe pas
      if (have >= ITEMS[give].stack) return [];
      held.set(give, have + 1);
      return [{ held, extra: 0, drop: null, dropCount: 0 }];
    }
    if (this.heldSlots(held) < CONFIG.inventory.slots) {
      held.set(give, 1);
      return [{ held, extra: 0, drop: null, dropCount: 0 }];
    }
    // échange : l'objet de l'emplacement choisi reste sur place (on pourra revenir le prendre).
    // Un objet qui ne sert plus à rien est toujours le meilleur à laisser.
    const out: Array<{ held: Map<ItemId, number>; extra: number; drop: ItemId | null; dropCount: number }> = [];
    const useless = [...held].find(([k, c]) => c > 0 && !this.stillNeeded(k, mask));
    for (const [k, c] of useless ? [useless] : held) {
      if (c <= 0) continue;
      const m = new Map(held);
      m.set(k, 0);
      m.set(give, 1);
      out.push({ held: m, extra: ACT.swap, drop: k, dropCount: c });
    }
    return out;
  }

  private droppedKey(d: Map<string, number>): string {
    return [...d]
      .filter(([, c]) => c > 0)
      .map(([k, c]) => `${k}x${c}`)
      .sort()
      .join(".");
  }

  /** Meilleure route pour une sortie : A* exact, puis pondéré si la recherche est trop longue. */
  private search(exit: RouteExit): { route: RouteStep[]; time: number } | null {
    // les signatures dépendent des indices de tâches : cache Dijkstra propre à chaque sortie
    this.dij.clear();
    const final = this.buildTasks(exit);
    const tasks = this.tasks;
    if (tasks.length > 31) return null;
    this.doorTask.clear();
    this.sigMask = 0;
    for (const t of tasks) {
      if (t.kind === "unlock") {
        this.doorTask.set(t.doorId!, t.index);
        this.sigMask |= 1 << t.index;
      }
    }
    if (this.powerTask >= 0) this.sigMask |= 1 << this.powerTask;
    const finalT = tasks[final]!;
    const { list: order, preds } = this.mandatoryTasks(final);
    const allFrom = (n: number) => this.dijkstra(n, 0, true).dist;
    const between = new Map<number, Float64Array>();
    for (const m of order) between.set(m, allFrom(tasks[m]!.node));
    const lb = new Float64Array(tasks.length);
    // distances symétriques entre points obligatoires (arbre couvrant)
    const mNodes = order.filter((m) => m !== final);
    const sym = (a: number, b: number): number => Math.min(between.get(a)![tasks[b]!.node]!, between.get(b)![tasks[a]!.node]!);
    const symF = new Map<number, number>();
    for (const m of mNodes) symF.set(m, Math.min(between.get(m)![finalT.node]!, between.get(final)![tasks[m]!.node]!));
    const key = new Float64Array(tasks.length + 2);
    const inTree = new Uint8Array(tasks.length + 2);
    const rest: number[] = [];
    /**
     * Borne inférieure du temps restant :
     * - chaîne : chaque action obligatoire restante vient après ses prédécesseurs restants ;
     * - arbre couvrant : il faut passer par tous les points obligatoires restants puis finir.
     */
    const hCache = new Map<number, number>();
    const heuristic = (mask: number, pos: number): number => {
      const ck = mask * 1024 + pos;
      const hit = hCache.get(ck);
      if (hit !== undefined) return hit;
      const h = this.bound(mask, pos);
      hCache.set(ck, h);
      return h;
    };
    const bound = (mask: number, pos: number): number => {
      const d = allFrom(pos);
      let h = 0;
      rest.length = 0;
      let durations = finalT.duration;
      for (const m of order) {
        if (mask & (1 << m)) continue;
        const t = tasks[m]!;
        let v = d[t.node]! + t.duration;
        for (const q of preds.get(m) ?? []) {
          if (mask & (1 << q)) continue;
          const w = lb[q]! + between.get(q)![t.node]! + t.duration;
          if (w > v) v = w;
        }
        lb[m] = v;
        const end = m === final ? v : v + between.get(m)![finalT.node]! + finalT.duration;
        if (end > h) h = end;
        if (m !== final) {
          rest.push(m);
          durations += t.duration;
        }
      }
      if (rest.length > 1) {
        // Prim sur {position, restantes, finale} ; indices : 0..n-1 restantes, n = position, n+1 = finale
        const n = rest.length;
        const dist = (i: number, j: number): number => {
          if (i === n || j === n) {
            const o = i === n ? j : i;
            return o === n + 1 ? d[finalT.node]! : d[tasks[rest[o]!]!.node]!;
          }
          if (i === n + 1 || j === n + 1) return symF.get(rest[i === n + 1 ? j : i]!)!;
          return sym(rest[i]!, rest[j]!);
        };
        for (let i = 0; i < n + 2; i++) {
          key[i] = INF;
          inTree[i] = 0;
        }
        key[n] = 0;
        let total = 0;
        for (let it = 0; it < n + 2; it++) {
          let u = -1;
          for (let i = 0; i < n + 2; i++) if (!inTree[i] && (u < 0 || key[i]! < key[u]!)) u = i;
          inTree[u] = 1;
          total += key[u]!;
          for (let i = 0; i < n + 2; i++) {
            if (inTree[i]) continue;
            const w = dist(u, i);
            if (w < key[i]!) key[i] = w;
          }
        }
        if (total + durations > h) h = total + durations;
      }
      return h;
    };
    this.bound = bound;
    this.usefulCache.clear();
    this.mandatory = new Set(order);
    this.stats = { expanded: 0, capped: false, weight: 1, mandatory: order.length, repick: false };
    // d'abord sans jamais revenir chercher un objet laissé (bien plus rapide), puis avec
    for (const repick of [false, true]) {
      for (const weight of [1, 1.3, 2.5]) {
        const res = this.astar(final, heuristic, weight, this.maxExpand, repick);
        this.stats.weight = weight;
        this.stats.repick = repick;
        if (res) return res;
        if (!this.stats.capped) break;
      }
    }
    return null;
  }

  private astar(final: number, heuristic: (mask: number, pos: number) => number, weight: number, cap: number, repick: boolean): { route: RouteStep[]; time: number } | null {
    const tasks = this.tasks;
    const best = new Map<string, number>();
    const heap = new Heap<SearchState>();
    const h0 = heuristic(0, this.startNode);
    if (!Number.isFinite(h0)) return null;
    heap.push({ mask: 0, pos: this.startNode, held: new Map(), dropped: new Map(), time: 0, parent: null, task: -1, repick: null, drop: null, key: "" }, h0 * weight);
    let expanded = 0;
    this.stats.capped = false;
    const push = (s: SearchState, mask: number, pos: number, task: number, repick: ItemId | null, o: { held: Map<ItemId, number>; extra: number; drop: ItemId | null; dropCount: number }, dropped: Map<string, number>, time: number, h: number): void => {
      if (o.drop && repick) {
        const k = `${o.drop}@${pos}`;
        dropped.set(k, (dropped.get(k) ?? 0) + o.dropCount);
      }
      const key = `${mask}|${pos}|${this.heldKey(o.held)}|${this.droppedKey(dropped)}`;
      const prev = best.get(key);
      if (prev !== undefined && prev <= time) return;
      best.set(key, time);
      // à f égal, on préfère l'état le plus avancé
      heap.push({ mask, pos, held: o.held, dropped, time, parent: s, task, repick, drop: o.drop, key }, time + h * weight - time * 1e-9);
    };
    while (heap.size) {
      const s = heap.pop()!;
      if (s.task === final) {
        this.stats.expanded = expanded;
        return { route: this.unwind(s), time: s.time };
      }
      // état déjà atteint plus tôt par un autre chemin
      if (s.key && best.get(s.key)! < s.time) continue;
      if (++expanded > cap) {
        this.stats.capped = true;
        break;
      }
      const { dist } = this.dijkstra(s.pos, this.signature(s.mask));
      for (const t of tasks) {
        const bit = 1 << t.index;
        if (s.mask & bit || !this.ready(t, s) || !this.useful(t, s)) continue;
        const travel = dist[t.node]!;
        if (!Number.isFinite(travel)) continue;
        const mask = s.mask | bit;
        const h = t.index === final ? 0 : heuristic(mask, t.node);
        if (!Number.isFinite(h)) continue;
        for (const o of this.inventoryAfter(t.gives[0] ?? null, t.consumes, s.held, mask)) {
          push(s, mask, t.node, t.index, null, o, new Map(s.dropped), s.time + travel + t.duration + o.extra, h);
        }
      }
      // reprendre un objet laissé plus tôt
      if (repick) for (const [k, c] of s.dropped) {
        if (c <= 0) continue;
        const at = k.lastIndexOf("@");
        const item = k.slice(0, at) as ItemId;
        const node = Number(k.slice(at + 1));
        if (!this.wanted(item, s)) continue;
        const travel = dist[node]!;
        if (!Number.isFinite(travel)) continue;
        const h = heuristic(s.mask, node);
        if (!Number.isFinite(h)) continue;
        for (const o of this.inventoryAfter(item, [], s.held, s.mask)) {
          const dropped = new Map(s.dropped);
          if (c > 1) dropped.set(k, c - 1);
          else dropped.delete(k);
          push(s, s.mask, node, -2, item, o, dropped, s.time + travel + ACT.aim + ACT.press + o.extra, h);
        }
      }
    }
    this.stats.expanded = expanded;
    return null;
  }

  private unwind(s: SearchState): RouteStep[] {
    const chain: SearchState[] = [];
    for (let x: SearchState | null = s; x && x.task !== -1; x = x.parent) chain.unshift(x);
    const steps: RouteStep[] = [];
    let pos = this.startNode;
    let mask = 0;
    for (const x of chain) {
      let task: RouteTask;
      if (x.task === -2) {
        const n = this.nodes[x.pos]!;
        const item = x.repick!;
        task = { index: -1, kind: "pick", label: `${ITEMS[item].name} (reprise)`, place: this.roomName(n.x, n.y, n.z), node: x.pos, target: null, duration: ACT.aim + ACT.press, needItems: [], needTasks: [], gives: [item], consumes: [], unlocks: null, power: false, final: false, repick: item };
      } else task = this.tasks[x.task]!;
      const leg = this.leg(pos, task.node, this.signature(mask));
      steps.push({ task, leg, at: x.time, drop: x.drop });
      pos = task.node;
      mask = x.mask;
    }
    return steps;
  }

  // ================================================================ API

  /** Meilleure route toutes sorties confondues (ou pour une sortie imposée). */
  plan(only?: RouteExit): Route | null {
    // les chemins impossibles (paires non reliées) sont normaux ici : pas de spam dans la console
    const logLevels = Logger.LogLevels;
    Logger.LogLevels = Logger.ErrorLogLevel;
    try {
      return this.planInner(only);
    } finally {
      Logger.LogLevels = logLevels;
    }
  }

  private planInner(only?: RouteExit): Route | null {
    const t0 = performance.now();
    this.nodes = [];
    this.portals = [];
    this.pair.clear();
    this.dij.clear();
    this.byRegion.clear();
    this.regionOf.clear();
    this.buildRegions();
    const sp = this.gp.world.spawn;
    this.startNode = this.addNode(sp.x, sp.y, sp.z, "Départ");
    this.startRegion = this.nodes[this.startNode]!.region;
    this.buildPortals();
    let best: Route | null = null;
    for (const exit of (only ? [only] : ["gate", "ambulance", "roof"]) as RouteExit[]) {
      let res: { route: RouteStep[]; time: number } | null = null;
      try {
        res = this.search(exit);
      } catch (e) {
        console.warn(`pilote auto : route ${exit} impossible`, e);
      }
      if (!res) continue;
      const theoretical = this.retime(res.route);
      if (!best || theoretical < best.theoretical) best = { exit, steps: res.route, theoretical, nodes: [...this.nodes], portals: [...this.portals], ms: 0 };
      // les tâches sont reconstruites à chaque sortie : on fige celles de la route
      res.route.forEach((st) => (st.task = { ...st.task }));
    }
    if (best) best.ms = performance.now() - t0;
    return best;
  }

  /** Temps théorique avec gestion réelle de la jauge de sprint. */
  private retime(steps: RouteStep[]): number {
    const segs: Array<{ length: number; fixed: number }> = [];
    let t = 0;
    for (const s of steps) {
      segs.push({ length: s.leg.length, fixed: s.leg.fixed });
      segs.push({ length: 0, fixed: s.task.duration });
      t = simulateWalk(segs);
      s.at = t;
    }
    return t;
  }
}
