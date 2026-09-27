import type { Rng } from "../core/Rng";
import type { OpeningPlacement } from "../world/builder/ArchitectureBuilder";
import type { HospitalLayout, LockType } from "../world/layout/types";
import { ITEMS, ITEM_IDS, type ItemId } from "./data/items";
import { CODE_LABELS, CODE_NOTES, ITEM_CANDIDATES, SAFES, type CodeId } from "./data/spawns";

/** Répartition d'une run : où sont les objets, les notes, quels codes. */
export interface SpawnPlan {
  /** objets posés dans le monde : clé d'ancre (« pièce:surface#n ») ou coffre (« safe_xxx ») */
  items: Array<{ item: ItemId; spot: string }>;
  /** notes à code : id de note → clé d'ancre */
  notes: Map<string, string>;
  /** codes à 4 chiffres */
  codes: Map<CodeId, string>;
  /** sorties réalisables (toujours les 3 après validation) */
  exits: ExitId[];
  /** nombre de tirages nécessaires (debug) */
  attempts: number;
}

export type ExitId = "gate" | "ambulance" | "roof";

/** Nœud « extérieur » selon le niveau d'une ouverture. */
function outsideNode(floor: string): string {
  if (floor === "R") return "roof";
  if (floor === "U") return "void";
  return "ext";
}

interface Edge {
  a: string;
  b: string;
  /** objet requis */
  item?: ItemId;
  power?: boolean;
  /** franchissable uniquement de a vers b */
  oneDir?: boolean;
  /** verrou manipulable d'un seul côté (planches, chaîne, sens unique) : pièce de ce côté */
  side?: string;
  id: string;
}

const LOCK_ITEM: Partial<Record<LockType, ItemId>> = {
  badgeBlue: "badgeBlue",
  badgeGreen: "badgeGreen",
  badgeRed: "badgeRed",
  morgueKey: "morgueKey",
  planks: "crowbar",
  chain: "boltCutter",
};

/** Graphe des pièces (ouvertures + cages d'escalier) pour le solveur. */
export function buildRoomGraph(layout: HospitalLayout, openings: OpeningPlacement[]): Edge[] {
  const edges: Edge[] = [];
  for (const o of openings) {
    const a = o.roomA?.id ?? outsideNode(o.floor);
    const b = o.roomB?.id ?? outsideNode(o.floor);
    const sideOf = (p: { x: number; z: number } | undefined): string | undefined => {
      if (!p) return undefined;
      const neg = o.axis === "x" ? p.z < o.z : p.x < o.x;
      return neg ? a : b;
    };
    switch (o.kind) {
      case "open":
      case "arch":
      case "vent":
        edges.push({ a, b, id: o.id });
        break;
      case "window":
        if (!o.broken) break;
        // fenêtre de l'étage donnant sur le vide de la cour : on saute (sens unique, vers la cour)
        if (a === "void") edges.push({ a: b, b: "g_court", oneDir: true, id: o.id });
        else if (b === "void") edges.push({ a, b: "g_court", oneDir: true, id: o.id });
        else edges.push({ a, b, id: o.id });
        break;
      case "elevator":
        edges.push({ a, b, power: true, id: o.id });
        break;
      case "door":
      case "double": {
        const lock = o.spec?.lock ?? "none";
        if (lock === "sealed") break;
        if (lock === "none") edges.push({ a, b, id: o.id });
        else if (lock === "power") edges.push({ a, b, power: true, id: o.id });
        else if (lock === "oneWay") edges.push({ a, b, side: sideOf(o.spec?.openFrom) ?? a, id: o.id });
        else if (lock === "planks" || lock === "chain") edges.push({ a, b, item: LOCK_ITEM[lock], side: sideOf(o.spec?.openFrom) ?? a, id: o.id });
        else edges.push({ a, b, item: LOCK_ITEM[lock], id: o.id });
        break;
      }
      default:
        break;
    }
  }
  // cages d'escalier / ascenseur : même cage = communication directe
  const shafts = new Map<string, string[]>();
  for (const r of layout.rooms) {
    if (!r.shaft) continue;
    const list = shafts.get(r.shaft) ?? [];
    list.push(r.id);
    shafts.set(r.shaft, list);
  }
  for (const [shaft, list] of shafts) {
    const elevator = layout.rooms.find((r) => r.id === list[0])?.kind === "elevator";
    for (let i = 0; i < list.length - 1; i++) edges.push({ a: list[i]!, b: list[i + 1]!, power: elevator, id: `shaft_${shaft}_${i}` });
  }
  return edges;
}

export interface SolveResult {
  reach: Set<string>;
  have: Map<ItemId, number>;
  notes: Set<string>;
  power: boolean;
  exits: ExitId[];
}

/**
 * Solveur monotone : on étend l'ensemble des pièces atteignables et des objets obtenus jusqu'au
 * point fixe (les objets non consommés restent acquis ; l'inventaire limité ne change pas la
 * faisabilité puisqu'on peut toujours revenir chercher un objet posé).
 */
export function solve(edges: Edge[], plan: Pick<SpawnPlan, "items" | "notes">, roomOfSpot: (spot: string) => string, start: string): SolveResult {
  const reach = new Set<string>([start]);
  const have = new Map<ItemId, number>();
  const notes = new Set<string>();
  const opened = new Set<string>();
  const taken = new Set<number>();
  let power = false;
  const codeKnown = (code: CodeId): boolean => CODE_NOTES.every((n) => n.code !== code || notes.has(n.id));
  const safeOpen = (id: string): boolean => {
    const s = SAFES.find((x) => x.id === id)!;
    if (!reach.has(s.room)) return false;
    return s.lock === "code" ? codeKnown(s.code!) : (have.get("safeKey") ?? 0) > 0;
  };
  for (let guard = 0; guard < 200; guard++) {
    let changed = false;
    for (const e of edges) {
      if (e.item && !(have.get(e.item) ?? 0)) continue;
      if (e.power && !power) continue;
      if (e.side !== undefined && !opened.has(e.id)) {
        if (!reach.has(e.side)) continue;
        opened.add(e.id);
        changed = true;
      }
      if (reach.has(e.a) && !reach.has(e.b)) {
        reach.add(e.b);
        changed = true;
      }
      if (!e.oneDir && reach.has(e.b) && !reach.has(e.a)) {
        reach.add(e.a);
        changed = true;
      }
    }
    plan.items.forEach((p, i) => {
      if (taken.has(i)) return;
      const ok = p.spot.startsWith("safe_") ? safeOpen(p.spot) : reach.has(roomOfSpot(p.spot));
      if (!ok) return;
      taken.add(i);
      have.set(p.item, (have.get(p.item) ?? 0) + 1);
      changed = true;
    });
    for (const [note, spot] of plan.notes) {
      if (!notes.has(note) && reach.has(roomOfSpot(spot))) {
        notes.add(note);
        changed = true;
      }
    }
    if (!power && (have.get("fuse") ?? 0) >= ITEMS.fuse.count && reach.has("b_electric")) {
      power = true;
      changed = true;
    }
    if (!changed) break;
  }
  const exits: ExitId[] = [];
  const h = (i: ItemId) => (have.get(i) ?? 0) > 0;
  if (reach.has("ext") && h("badgeRed") && codeKnown("gate")) exits.push("gate");
  if (reach.has("ext") && h("boltCutter") && h("battery") && h("ambulanceKeys")) exits.push("ambulance");
  if (reach.has("roof")) exits.push("roof");
  return { reach, have, notes, power, exits };
}

/** Code à 4 chiffres « lisible » (pas de chiffre répété 3 fois, pas de suite triviale). */
function makeCode(rng: Rng): string {
  for (;;) {
    const d = [rng.int(0, 9), rng.int(0, 9), rng.int(0, 9), rng.int(0, 9)];
    const counts = new Map<number, number>();
    for (const x of d) counts.set(x, (counts.get(x) ?? 0) + 1);
    if ([...counts.values()].some((c) => c >= 3)) continue;
    const s = d.join("");
    if (s === "1234" || s === "4321" || s === "0000") continue;
    return s;
  }
}

/**
 * Tire la répartition des objets et des codes pour une seed, en garantissant que les trois
 * sorties sont réalisables (sinon nouveau tirage).
 */
export function planRun(rng: Rng, edges: Edge[], roomOfSpot: (spot: string) => string, start: string): SpawnPlan {
  const codeRng = rng.fork("codes");
  const codes = new Map<CodeId, string>();
  const seen = new Set<string>();
  for (const id of Object.keys(CODE_LABELS) as CodeId[]) {
    let c = makeCode(codeRng);
    while (seen.has(c)) c = makeCode(codeRng);
    seen.add(c);
    codes.set(id, c);
  }
  const itemRng = rng.fork("items");
  let last: SpawnPlan | null = null;
  for (let attempt = 1; attempt <= 400; attempt++) {
    const used = new Set<string>();
    const items: SpawnPlan["items"] = [];
    for (const id of ITEM_IDS) {
      const cands = itemRng.shuffle([...ITEM_CANDIDATES[id]]);
      let placed = 0;
      for (const spot of cands) {
        if (placed >= ITEMS[id].count) break;
        // un coffre peut contenir plusieurs objets, un emplacement au sol / sur un meuble un seul
        if (!spot.startsWith("safe_") && used.has(spot)) continue;
        used.add(spot);
        items.push({ item: id, spot });
        placed++;
      }
    }
    const notes = new Map<string, string>();
    for (const n of CODE_NOTES) {
      const free = n.candidates.filter((c) => !used.has(c));
      const spot = itemRng.pick(free.length ? free : n.candidates);
      used.add(spot);
      notes.set(n.id, spot);
    }
    const res = solve(edges, { items, notes }, roomOfSpot, start);
    last = { items, notes, codes, exits: res.exits, attempts: attempt };
    if (res.exits.length === 3) return last;
  }
  console.warn("Répartition : impossible de garantir les 3 sorties", last);
  return last!;
}
