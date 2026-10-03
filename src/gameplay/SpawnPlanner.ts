import type { Rng } from "../core/Rng";
import type { OpeningPlacement } from "../world/builder/ArchitectureBuilder";
import type { HospitalLayout, LockType } from "../world/layout/types";
import type { ItemId } from "./data/items";
import { mapItemIds, type ExitId, type MapRules } from "./data/rules";
import type { CodeId } from "./data/spawns";

export type { ExitId };

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
  /** conduit de ventilation (passage accroupi) */
  vent?: boolean;
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
        edges.push({ a, b, id: o.id });
        break;
      case "vent":
        edges.push({ a, b, vent: true, id: o.id });
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
        // condamnée, ou réservée au monstre : jamais un passage pour le joueur
        if (lock === "sealed" || lock === "service") break;
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


/**
 * Zones verrouillées : groupes de pièces reliées sans verrou ni conduit, fermés par au moins une
 * porte à objet (badge, clé, planches, chaîne). Hors ascenseur, toit et pièces-mécanismes.
 * « Chaque verrou récompense » : le planificateur y garantit toujours quelque chose d'utile.
 */
export function guardedAreas(layout: HospitalLayout, edges: Edge[], start: string, exempt: string[] = []): string[][] {
  // pièces-mécanismes : leur « contenu », c'est le mécanisme lui-même (tableau à fusibles)
  const GUARD_EXEMPT = new Set(exempt);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const e of edges) {
    const free = !e.item && !e.power && e.side === undefined && !e.vent;
    if (free) parent.set(find(e.a), find(e.b));
    else {
      find(e.a);
      find(e.b);
    }
  }
  const groups = new Map<string, string[]>();
  for (const r of layout.rooms) {
    const c = find(r.id);
    const list = groups.get(c) ?? [];
    list.push(r.id);
    groups.set(c, list);
  }
  const startGroup = find(start);
  const out: string[][] = [];
  for (const [g, list] of groups) {
    if (g === startGroup) continue;
    const rooms = list.map((id) => layout.rooms.find((r) => r.id === id)!);
    if (rooms.some((r) => GUARD_EXEMPT.has(r.id) || r.kind === "elevator" || r.floor === "R")) continue;
    const set = new Set(list);
    if (edges.some((e) => e.item && set.has(e.a) !== set.has(e.b))) out.push(list);
  }
  return out;
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
export function solve(rules: MapRules, edges: Edge[], plan: Pick<SpawnPlan, "items" | "notes">, roomOfSpot: (spot: string) => string, start: string): SolveResult {
  const CODE_NOTES = rules.codeNotes;
  const SAFES = rules.safes;
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
    if (!power && (have.get("fuse") ?? 0) >= (rules.items.fuse ?? 2) && reach.has(rules.fusePanel.room)) {
      power = true;
      changed = true;
    }
    if (!changed) break;
  }
  const exits = rules.exits({ reach: (r) => reach.has(r), has: (i) => (have.get(i) ?? 0) > 0, codeKnown, power });
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

const isSafe = (spot: string): boolean => spot.startsWith("safe_");

/** Pièce d'un emplacement (coffre → pièce du coffre). */
function spotRoom(rules: MapRules, spot: string, roomOfSpot: (spot: string) => string): string {
  const safe = rules.safes.find((s) => s.id === spot);
  return safe ? safe.room : roomOfSpot(spot);
}

type PlanParts = Pick<SpawnPlan, "items" | "notes">;

/** Une note est utile si elle donne (une partie du) code du portail ou un coffre non vide. */
function noteUseful(rules: MapRules, noteId: string, items: PlanParts["items"]): boolean {
  const def = rules.codeNotes.find((n) => n.id === noteId)!;
  if (def.code === rules.exitCode) return true;
  const safe = rules.safes.find((s) => s.code === def.code);
  return !!safe && items.some((it) => it.spot === safe.id);
}

function areaFilled(rules: MapRules, area: string[], plan: PlanParts, roomOfSpot: (spot: string) => string): boolean {
  if (plan.items.some((it) => area.includes(spotRoom(rules, it.spot, roomOfSpot)))) return true;
  for (const [id, spot] of plan.notes) if (area.includes(roomOfSpot(spot)) && noteUseful(rules, id, plan.items)) return true;
  return false;
}

/** Tous les coffres contiennent quelque chose, toutes les zones verrouillées aussi. */
function rewardsOk(rules: MapRules, plan: PlanParts, areas: string[][], roomOfSpot: (spot: string) => string): boolean {
  return rules.safes.every((s) => plan.items.some((it) => it.spot === s.id)) && areas.every((a) => areaFilled(rules, a, plan, roomOfSpot));
}

/**
 * Réparation d'un tirage : déplace des objets / notes vers les coffres et zones verrouillées
 * vides, parmi leurs propres emplacements candidats (hasard de la seed). On évite de vider une
 * autre zone : on déplace de préférence un objet qui ne remplit rien d'autre.
 */
function repairRewards(rules: MapRules, plan: PlanParts, areas: string[][], roomOfSpot: (spot: string) => string, rng: Rng): void {
  const SAFES = rules.safes;
  const cands = (id: ItemId): string[] => rules.itemCandidates[id] ?? [];
  const fillsSomething = (spot: string): boolean => {
    const room = spotRoom(rules, spot, roomOfSpot);
    return isSafe(spot) || areas.some((a) => a.includes(room));
  };
  for (let pass = 0; pass < 10; pass++) {
    const used = new Set<string>([...plan.items.filter((it) => !isSafe(it.spot)).map((it) => it.spot), ...plan.notes.values()]);
    // une fois sur deux on épargne ce qui remplit déjà un coffre / une zone (moins de ricochets),
    // sinon tirage uniforme (variété du contenu)
    const prefer = <T extends { from: string }>(opts: T[]): T => {
      const calm = opts.filter((o) => !fillsSomething(o.from));
      return rng.pick(calm.length && rng.next() < 0.5 ? calm : opts);
    };
    // 1) coffres vides
    const emptySafe = SAFES.find((s) => !plan.items.some((it) => it.spot === s.id));
    if (emptySafe) {
      const opts = plan.items.map((it, idx) => ({ idx, from: it.spot })).filter(({ idx }) => cands(plan.items[idx]!.item).includes(emptySafe.id));
      if (!opts.length) return;
      plan.items[prefer(opts).idx]!.spot = emptySafe.id;
      continue;
    }
    // 2) zones verrouillées vides
    const empty = areas.find((a) => !areaFilled(rules, a, plan, roomOfSpot));
    if (!empty) return;
    const opts: Array<{ from: string; apply: () => void }> = [];
    plan.items.forEach((it, idx) => {
      for (const cand of cands(it.item)) {
        if (!empty.includes(spotRoom(rules, cand, roomOfSpot)) || (!isSafe(cand) && used.has(cand))) continue;
        opts.push({ from: it.spot, apply: () => (plan.items[idx]!.spot = cand) });
      }
    });
    for (const n of rules.codeNotes) {
      const from = plan.notes.get(n.id)!;
      if (!noteUseful(rules, n.id, plan.items)) continue;
      for (const cand of n.candidates) {
        if (!empty.includes(roomOfSpot(cand)) || used.has(cand)) continue;
        opts.push({ from, apply: () => plan.notes.set(n.id, cand) });
      }
    }
    if (!opts.length) return;
    prefer(opts).apply();
  }
}

/**
 * Tire la répartition des objets et des codes pour une seed, en garantissant que les trois
 * sorties sont réalisables, que tout objet / note est accessible, et que chaque coffre et
 * chaque zone verrouillée (`areas`) contient quelque chose d'utile (sinon nouveau tirage).
 */
export function planRun(rules: MapRules, rng: Rng, edges: Edge[], roomOfSpot: (spot: string) => string, start: string, areas: string[][] = []): SpawnPlan {
  const codeRng = rng.fork("codes");
  const codes = new Map<CodeId, string>();
  const seen = new Set<string>();
  for (const id of Object.keys(rules.codeLabels) as CodeId[]) {
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
    for (const id of mapItemIds(rules)) {
      const cands = itemRng.shuffle([...(rules.itemCandidates[id] ?? [])]);
      let placed = 0;
      for (const spot of cands) {
        if (placed >= (rules.items[id] ?? 0)) break;
        // un coffre peut contenir plusieurs objets, un emplacement au sol / sur un meuble un seul
        if (!spot.startsWith("safe_") && used.has(spot)) continue;
        used.add(spot);
        items.push({ item: id, spot });
        placed++;
      }
    }
    const notes = new Map<string, string>();
    for (const n of rules.codeNotes) {
      const free = n.candidates.filter((c) => !used.has(c));
      const spot = itemRng.pick(free.length ? free : n.candidates);
      used.add(spot);
      notes.set(n.id, spot);
    }
    const plan: PlanParts = { items, notes };
    repairRewards(rules, plan, areas, roomOfSpot, itemRng);
    const res = solve(rules, edges, plan, roomOfSpot, start);
    last = { items, notes, codes, exits: res.exits, attempts: attempt };
    if (!rewardsOk(rules, plan, areas, roomOfSpot)) continue;
    let got = 0;
    for (const n of res.have.values()) got += n;
    // tout est récupérable : pas d'objet ni de note enfermé derrière son propre verrou
    if (res.exits.length === rules.exitCount && got === items.length && res.notes.size === notes.size) return last;
  }
  console.warn("Répartition : contraintes non satisfaites", last);
  return last!;
}
