import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG } from "../config";
import { CollisionMask } from "../physics/Collider";
import type { Gameplay } from "./Gameplay";
import { ITEMS, type ItemId } from "./data/items";
import type { CodeId } from "./data/spawns";
import type { WorldItem } from "./Items";

export interface JournalStep {
  text: string;
  done: boolean;
  /** précision (où l'objet a été vu, chiffres connus…) */
  hint: string;
}

export interface JournalExit {
  label: string;
  done: number;
  steps: JournalStep[];
}

export interface JournalData {
  codes: Array<{ label: string; digits: string; place: string; complete: boolean }>;
  exits: JournalExit[];
  spotted: Array<{ name: string; color: string; place: string; dropped: boolean }>;
  notesRead: number;
}

/**
 * Carnet de Léo : ce que le joueur sait (codes notés), ce qu'il a vu (objets repérés, avec la
 * pièce) et où il en est pour chaque sortie. Rien n'est révélé que le joueur n'ait vu ou lu.
 */
export class JournalTracker {
  /** objets repérés → pièce où ils ont été vus */
  private readonly seen = new Map<WorldItem, string>();
  private readonly dropped = new Set<WorldItem>();
  readonly notesRead = new Set<string>();
  private timer = 0;

  reset(): void {
    this.seen.clear();
    this.dropped.clear();
    this.notesRead.clear();
    this.timer = 0;
  }

  markDropped(it: WorldItem): void {
    this.dropped.add(it);
  }

  /** Repérage des objets visibles (distance, cône de vue, ligne de vue). */
  update(dt: number, gp: Gameplay): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CONFIG.journal.scanInterval;
    const cam = gp.player.rig.camera;
    const c = cam.globalPosition;
    cam.getDirectionToRef(FORWARD, _dir);
    const f = _dir;
    const range = CONFIG.journal.spotRange;
    for (const it of gp.items.items) {
      if (!it.inWorld) {
        this.dropped.delete(it);
        continue;
      }
      if (it.safe && !gp.items.openSafes.has(it.safe)) continue;
      const dx = it.x - c.x;
      const dy = it.y + 0.1 - c.y;
      const dz = it.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range) continue;
      if (d > 1.2 && (dx * f.x + dy * f.y + dz * f.z) / d < 0.55) continue;
      if (!gp.collision.lineOfSight(c.x, c.y, c.z, it.x, it.y + 0.1, it.z, CollisionMask.SIGHT)) continue;
      this.seen.set(it, gp.world.roomAt(it.x, it.y + 0.2, it.z)?.name ?? "Dehors");
    }
  }

  private whereSeen(id: ItemId): string {
    for (const [it, place] of this.seen) if (it.item === id && it.inWorld) return place;
    return "";
  }

  build(gp: Gameplay): JournalData {
    const inv = gp.inventory;
    const has = (id: ItemId) => inv.has(id);
    const seenHint = (id: ItemId) => {
      if (has(id)) return "sur toi";
      const w = this.whereSeen(id);
      return w ? `vu : ${w}` : "";
    };
    const code = (id: CodeId) => gp.knownCodes.get(id) ?? "••••";
    const complete = (id: CodeId) => !code(id).includes("•");
    const fuses = gp.powerSys.installed.filter(Boolean).length;
    const step = (text: string, done: boolean, hint = ""): JournalStep => ({ text, done, hint: done ? "" : hint });
    const unlocked = (doorId: string) => {
      const d = gp.doors.byId.get(doorId);
      return !!d && !d.locked;
    };
    const fuseStep = step(`Fusibles posés (${fuses}/2)`, fuses >= 2 || gp.power, has("fuse") ? `${inv.count("fuse")} sur toi` : seenHint("fuse"));

    let exits: JournalExit[];
    const mx = gp.mallExits;
    if (mx) {
      exits = [
        {
          label: "Portes principales",
          done: 0,
          steps: [
            step("Code de la grille", complete("grille") || mx.grilleOpen, code("grille") !== "••••" ? code("grille") : ""),
            step("Relever la grille (boîtier du hall)", mx.grilleOpen),
            step("Pince coupante", has("boltCutter") || unlocked("g_main_entrance"), seenHint("boltCutter")),
            step("Couper la chaîne des portes", unlocked("g_main_entrance")),
          ],
        },
        {
          label: "Camion de livraison",
          done: 0,
          steps: [
            fuseStep,
            step("Rétablir le courant (local électrique)", gp.power),
            step("Relever le rideau du quai", mx.shutterOpen),
            step("Clés du camion", has("truckKeys"), seenHint("truckKeys")),
          ],
        },
        {
          label: "Draisine du métro",
          done: 0,
          steps: [
            step("Entrer dans la station (planches)", unlocked("b_dock_tickets"), has("crowbar") ? "pied-de-biche sur toi" : seenHint("crowbar")),
            step("Fixer la manivelle", mx.crankInstalled, seenHint("crank")),
            step("Installer la batterie", mx.batteryInstalled, seenHint("battery")),
          ],
        },
      ];
    } else {
      const ex = gp.exits;
      const roofOpen = unlocked("r_roof_door");
      exits = [
        {
          label: "Portail principal",
          done: 0,
          steps: [
            step("Badge rouge", has("badgeRed") || ex.gateOpen, seenHint("badgeRed")),
            step("Code du boîtier", complete("gate") || ex.gateOpen, code("gate") !== "••••" ? code("gate") : ""),
            step("Ouvrir le portail", ex.gateOpen),
          ],
        },
        {
          label: "Ambulance",
          done: 0,
          steps: [
            step("Pince coupante", has("boltCutter") || ex.bayOpen, seenHint("boltCutter")),
            step("Couper la chaîne de la grille", ex.bayOpen),
            step("Installer la batterie", ex.batteryInstalled, seenHint("battery")),
            step("Clés de l'ambulance", has("ambulanceKeys"), seenHint("ambulanceKeys")),
          ],
        },
        {
          label: "Échelle du toit",
          done: 0,
          steps: [
            fuseStep,
            step("Rétablir le courant", gp.power),
            step("Pied-de-biche", has("crowbar") || roofOpen, seenHint("crowbar")),
            step("Porte du toit (planches)", roofOpen),
          ],
        },
      ];
    }
    for (const e of exits) e.done = e.steps.filter((s) => s.done).length;

    const rules = gp.rules;
    const codes = (Object.keys(rules.codeLabels) as CodeId[]).map((id) => {
      const safe = rules.safes.find((s) => s.code === id);
      const place = safe ? (gp.world.index.roomsById.get(safe.room)?.name ?? "") : rules.exitCodePlace;
      return { label: rules.codeLabels[id] ?? "", digits: code(id), place, complete: complete(id) };
    });

    const spotted: JournalData["spotted"] = [];
    for (const [it, place] of this.seen) {
      if (!it.inWorld) continue;
      spotted.push({ name: ITEMS[it.item].name, color: ITEMS[it.item].color, place, dropped: this.dropped.has(it) });
    }
    return { codes, exits, spotted, notesRead: this.notesRead.size };
  }
}

const FORWARD = new Vector3(0, 0, 1);
const _dir = new Vector3();
