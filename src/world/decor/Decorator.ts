import type { OpeningPlacement } from "../builder/ArchitectureBuilder";
import { EXTERIOR } from "../builder/ExteriorBuilder";
import { HELIPAD } from "../builder/RoofBuilder";
import type { HospitalLayout, RoomDef, ThemeId } from "../layout/types";
import type { Fixture } from "../lighting/Lights";
import type { PropInstance, PropSystem } from "../props/PropSystem";
import { RoomDresser, type Side } from "./RoomDresser";

export type HidingKind = "wardrobe" | "lockers" | "bed" | "stretcher";

export interface HidingCandidate {
  kind: HidingKind;
  inst: PropInstance;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SIDES: Side[] = ["s", "n", "w", "e"];
const HIDE_KINDS: Record<string, HidingKind> = { wardrobe: "wardrobe", lockers: "lockers", bed: "bed", stretcher: "stretcher" };

/**
 * Habillage de l'hôpital : chaque thème a sa recette (mobilier, désordre, objets inquiétants),
 * luminaires, extérieur. Tout est déterministe (seed de décor fixe) pour que la carte reste
 * identique d'une run à l'autre.
 */
export class Decorator {
  readonly hiding: HidingCandidate[] = [];
  private floorY = new Map<string, number>();

  constructor(
    private readonly layout: HospitalLayout,
    private readonly openings: OpeningPlacement[],
    private readonly props: PropSystem,
    private readonly reservations: ReadonlyArray<{ room: string; x0: number; z0: number; x1: number; z1: number }> = [],
  ) {
    for (const f of layout.floors) this.floorY.set(f.id, f.y);
  }

  run(fixtures: Fixture[]): void {
    for (const room of this.layout.rooms) this.dressRoom(room);
    this.placeFixtures(fixtures);
    this.dressExterior();
  }

  private dresser(room: RoomDef): RoomDresser {
    const r = new RoomDresser(room, this.floorY.get(room.floor)!, this.openings, this.props, hashStr(room.id + "#decor"), (inst) => {
      const kind = HIDE_KINDS[inst.def.id];
      if (kind && inst.pitch === 0 && inst.roll === 0) this.hiding.push({ kind, inst });
    });
    for (const res of this.reservations) if (res.room === room.id) r.placed.push({ x0: res.x0, z0: res.z0, x1: res.x1, z1: res.z1 });
    return r;
  }

  private dressRoom(room: RoomDef): void {
    const r = this.dresser(room);
    const fn = RECIPES[room.theme];
    if (room.kind === "corridor") corridor(r);
    else if (fn) fn(r);
  }

  // ------------------------------------------------------------------ luminaires

  private placeFixtures(fixtures: Fixture[]): void {
    for (const f of fixtures) {
      const zone = f.zone;
      const room = this.layout.rooms.find((x) => x.id === zone);
      const sector = room?.sector ?? "ext";
      const yaw = f.alongX ? 0 : Math.PI / 2;
      const add = (id: string, y = f.y, yw = yaw) => this.props.add(id, f.x, y, f.z, yw, zone, sector);
      const state = f.state === "on" ? "on" : f.state === "off" ? "off" : `f${f.slot}`;
      switch (f.kind) {
        case "neon":
          if (f.state === "off" && (f.id * 7) % 5 === 0) add("neon_hanging");
          else {
            add("neon_housing");
            add(`neon_tube_${state}`);
          }
          break;
        case "bulb":
          add("bulb_cage");
          add(`bulb_${state}`);
          break;
        case "emergency":
          add("emergency_box", f.y, yaw);
          add(room?.theme === "electric" ? "emerg_lens_red" : "emerg_lens_green", f.y, yaw);
          break;
        case "street":
          this.props.add("street_lamp", f.x, 0, f.z - 1.2, 0, "ext", "ext");
          this.props.add(`lamp_head_${state}`, f.x, 0, f.z - 1.2, 0, "ext", "ext");
          break;
        case "canopy":
          add("bulb_cage", f.y + 0.05);
          add(`bulb_${state}`, f.y + 0.05);
          break;
        default:
          break;
      }
    }
    // panneaux « SORTIE » au-dessus des portes des cages d'escalier et des sorties
    for (const o of this.openings) {
      const isStairDoor = (o.roomA?.kind === "stair" || o.roomB?.kind === "stair") && o.kind !== "open";
      const isExit = o.id === "g_er_ambulance" || o.id === "g_kitchen_delivery" || o.id === "r_roof_door";
      if (!isStairDoor && !isExit) continue;
      const other = o.roomA?.kind === "stair" ? o.roomB : o.roomA;
      if (!other) continue;
      // côté de la pièce « non escalier »
      const sideSign = other === o.roomA ? -1 : 1;
      const y = o.y + o.top + 0.25;
      const room = other;
      if (o.axis === "x") this.props.add("exit_sign", o.x, y, o.z + sideSign * 0.13, sideSign > 0 ? 0 : Math.PI, room.id, room.sector);
      else this.props.add("exit_sign", o.x + sideSign * 0.13, y, o.z, sideSign > 0 ? Math.PI / 2 : -Math.PI / 2, room.id, room.sector);
    }
  }

  // ------------------------------------------------------------------ extérieur

  private dressExterior(): void {
    const P = this.props;
    const cars: Array<[string, number, number, number]> = [
      ["car_gray", 12, -14, 0.05],
      ["car_red", 18.5, -14.4, -0.08],
      ["car_blue", 58, -15, 3.1],
      ["car_gray", 70.5, -13.8, 0.3],
      ["car_red", 27, -24.5, 1.45],
      ["car_blue", 5, -25, -0.1],
      ["car_gray", 89, -8, 1.65],
    ];
    for (const [id, x, z, yaw] of cars) P.add(id, x, 0, z, yaw, "ext", "ext");
    for (const [x, z] of [[-6, 40], [-6, 47], [30, 58.5], [62, 58.5]] as Array<[number, number]>) P.add("dumpster", x, 0, z, Math.PI / 2, "ext", "ext");
    for (let x = 34; x <= 47; x += 2.6) P.add("bollard", x, 0, -6, 0, "ext", "ext");
    P.add("trash", -8, 0, 35, 0.4, "ext", "ext");
    P.add("trash", 84, 0, 50, 1.2, "ext", "ext");
    P.add("boxes", -9, 0, 30, 0.2, "ext", "ext");
    P.add("tree_a", -4, 0, -20, 0.4, "ext", "ext");
    P.add("tree_b", 76, 0, -26, 1.1, "ext", "ext");
    P.add("tree_c", 92, 0, -2, 2.2, "ext", "ext");
    P.add("bush", -3, 0, -12, 0, "ext", "ext");
    P.add("bush", 93, 0, 10, 1, "ext", "ext");
    P.add("bench_ext", 30, 0, -3.1, 0, "ext", "ext");
    P.add("bench_ext", 51, 0, -3.1, 0, "ext", "ext");
    // cour intérieure envahie
    const court = this.layout.rooms.find((r) => r.id === "g_court")!;
    P.add("tree_a", 34.5, 0, 24, 0.3, court.id, court.sector);
    P.add("tree_c", 46, 0, 31.5, 1.7, court.id, court.sector);
    for (const [x, z] of [[32, 34], [36.5, 21.5], [44, 22], [48, 26.5], [33, 30], [47.5, 34.2]] as Array<[number, number]>) P.add("bush", x, 0, z, x, court.id, court.sector);
    P.add("bench_ext", 36, 0, 33.8, Math.PI, court.id, court.sector);
    P.add("bench_ext", 44.5, 0, 22.2, 0, court.id, court.sector);
    // toit : groupes de climatisation
    for (const [x, z] of [[10, 10], [22, 46], [60, 45], [74, 40], [14, 30]] as Array<[number, number]>) P.add("ac_unit", x, 8, z, 0, "ext", "ext");
    void HELIPAD;
    void EXTERIOR;
  }
}

// =============================================================================
//  Recettes par thème
// =============================================================================

type Recipe = (r: RoomDresser) => void;

/** Couloir : quelques objets contre les murs, allée centrale toujours libre. */
function corridor(r: RoomDresser): void {
  const i = r.inner;
  const alongX = r.w >= r.d;
  // allée centrale dégagée (1.7 m)
  if (alongX) r.reserveLane({ x0: i.x0, z0: (i.z0 + i.z1) / 2 - 0.85, x1: i.x1, z1: (i.z0 + i.z1) / 2 + 0.85 });
  else r.reserveLane({ x0: (i.x0 + i.x1) / 2 - 0.85, z0: i.z0, x1: (i.x0 + i.x1) / 2 + 0.85, z1: i.z1 });
  const len = alongX ? r.w : r.d;
  const n = Math.floor(len / 5.5);
  const sides: Side[] = alongX ? ["s", "n"] : ["w", "e"];
  const pool = ["stretcher", "wheelchair", "ivstand", "chair_row", "trolley", "dead_plant", "laundry_cart", "trash", "chair_blue"];
  for (let k = 0; k < n; k++) {
    const id = r.pick(pool);
    const side = r.pick(sides);
    const parallel = id === "stretcher" || id === "chair_row" ? id === "stretcher" : false;
    r.againstWall(id, side, { parallel, t: (k + 0.2 + r.rnd() * 0.6) / n, tries: 3 });
  }
  if (r.room.theme !== "techcorr") r.scatter("papers", Math.floor(len / 9));
  else {
    r.scatter("debris", Math.floor(len / 12));
    for (const side of sides) r.alongWall("pipes", side, 2.0, { skipChance: 0.3, gap: -0.08, decor: true });
  }
}

const RECIPES: Partial<Record<ThemeId, Recipe>> = {
  hall(r) {
    const i = r.inner;
    r.placeAt("reception", (i.x0 + i.x1) / 2 + 5, i.z0 + 9.5, Math.PI, { force: false });
    for (const [x, z] of [[33, 6], [33, 10], [48, 6], [48, 10]] as Array<[number, number]>) r.placeAt("chair_row", x, z, Math.PI / 2);
    for (const [x, z] of [[29, 1.2], [52, 1.2], [29, 15.8], [52, 15.8]] as Array<[number, number]>) r.placeAt("dead_plant", x, z, 0);
    r.againstWall("vending", "w", { t: 0.75 });
    r.placeAt("wheelchair", 36.5, 14.5, 2.3);
    r.placeAt("chair_blue", 44, 5, 1.2, { pitch: Math.PI / 2 });
    r.scatter("papers", 8);
    r.scatter("debris", 2);
  },
  waiting(r) {
    for (let row = 0; row < 3; row++) for (let c = 0; c < 2; c++) r.placeAt("chair_row", 56.5 + c * 5, 4 + row * 3.6, row === 1 && c === 1 ? 0.2 : 0);
    r.againstWall("tv", "n", { t: 0.5, decor: true, height: 2.3 });
    r.againstWall("vending", "e", { t: 0.2 });
    r.againstWall("dead_plant", "n", { t: 0.05 });
    r.placeAt("chair_orange", 61, 13.5, 0.7, { pitch: Math.PI / 2 });
    r.scatter("papers", 5);
  },
  er(r) {
    // box de soins le long des murs, séparés par des rideaux
    for (const side of ["n", "w", "e"] as Side[]) {
      const n = side === "n" ? 5 : 3;
      for (let k = 0; k < n; k++) {
        const bed = r.againstWall(r.chance(0.6) ? "stretcher" : "bed", side, { t: (k + 0.5) / n, tries: 1 });
        if (bed) {
          r.againstWall("ivstand", side, { t: (k + 0.5) / n + 0.06, tries: 1, clearOk: true });
        }
      }
    }
    const i = r.inner;
    for (let k = 0; k < 4; k++) r.placeAt("curtain", i.x0 + 4.2 + k * 5.2, i.z1 - 1.3, Math.PI / 2, { noReserve: true, force: true });
    r.randomFree("trolley", 3);
    r.randomFree("trolley", 3);
    r.randomFree("wheelchair", 2);
    r.placeAt("desk", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2, 0);
    r.randomFree("stretcher", 3, 10, undefined);
    r.scatter("papers", 8);
    r.scatter("debris", 2);
  },
  cafeteria(r) {
    const i = r.inner;
    for (let cx = 0; cx < 4; cx++) {
      for (let cz = 0; cz < 3; cz++) {
        if (r.chance(0.15)) continue;
        r.placeAt("cafe_table", i.x0 + 3 + cx * 4.2, i.z0 + 3 + cz * 4.2, r.chance(0.3) ? 0.3 : 0);
      }
    }
    for (let k = 0; k < 4; k++) r.randomFree("chair_orange", 1.5, 6, undefined);
    r.randomFree("chair_orange", 1.5, 6);
    r.againstWall("vending", "e", { t: 0.8 });
    r.scatter("papers", 5);
    r.randomFree("trash", 1);
  },
  kitchen(r) {
    r.alongWall("workbench", "w", 2.6, { skipChance: 0.2 });
    r.alongWall("shelf", "n", 2.4, { skipChance: 0.3 });
    r.againstWall("sink", "e", {});
    r.againstWall("trash", "s", {});
    r.scatter("debris", 1);
  },
  office(r) {
    const side = r.pick(SIDES);
    const desk = r.againstWall("desk", side, { gap: 0.6 });
    if (desk) r.placeAt("office_chair", desk.x + Math.sin(desk.yaw) * 0.9, desk.z + Math.cos(desk.yaw) * 0.9, desk.yaw + Math.PI + 0.4);
    r.againstWall("wardrobe", r.pick(SIDES), {});
    r.againstWall("shelf", r.pick(SIDES), {});
    r.againstWall("dead_plant", r.pick(SIDES), {});
    if (r.chance(0.5)) r.againstWall("boxes", r.pick(SIDES), {});
    r.scatter("papers", 3);
    r.randomFree("folders", 1, 4);
  },
  security(r) {
    r.alongWall("desk", "n", 2.2, {});
    r.againstWall("office_chair", "n", { gap: 0.9 });
    r.againstWall("wardrobe", "w", {});
    r.againstWall("lockers", "e", {});
    r.scatter("papers", 3);
  },
  pharmacy(r) {
    r.alongWall("med_cabinet", "n", 1.5, { skipChance: 0.2 });
    r.alongWall("med_cabinet", "w", 1.5, { skipChance: 0.3 });
    r.againstWall("desk", "s", {});
    r.againstWall("boxes", "e", {});
    r.scatter("papers", 2);
  },
  chapel(r) {
    const i = r.inner;
    for (let row = 0; row < 5; row++) {
      r.placeAt("pew", (i.x0 + i.x1) / 2 - 2.2, i.z0 + 3 + row * 1.8, 0);
      r.placeAt("pew", (i.x0 + i.x1) / 2 + 2.2, i.z0 + 3 + row * 1.8, row === 3 ? 0.25 : 0);
    }
    r.againstWall("desk", "n", { t: 0.5 });
    r.againstWall("dead_plant", "n", { t: 0.2 });
    r.againstWall("dead_plant", "n", { t: 0.8 });
    r.scatter("papers", 2);
  },
  lockers(r) {
    for (const side of ["w", "e", "n"] as Side[]) r.alongWall("lockers", side, 1.35, { skipChance: 0.1 });
    const i = r.inner;
    r.placeAt("pew", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2, Math.PI / 2);
    r.scatter("papers", 2);
  },
  showers(r) {
    r.alongWall("sink", "e", 1.3, {});
    r.againstWall("trash", "w", {});
    r.againstWall("laundry_cart", "s", {});
  },
  storage(r) {
    for (const side of SIDES) r.alongWall("shelf", side, 2.2, { skipChance: 0.35 });
    r.randomFree("boxes", 0.8);
    r.randomFree("boxes", 0.8);
    r.randomFree("wheelchair", 0.8);
    r.scatter("papers", 2);
  },
  laundry(r) {
    r.alongWall("washer", r.pick(["w", "e"] as Side[]), 1.2, {});
    r.randomFree("laundry_cart", 1);
    r.randomFree("laundry_cart", 1);
    r.alongWall("shelf", "n", 2.4, { skipChance: 0.4 });
  },
  pediatrics(r) {
    const i = r.inner;
    if (r.w > 8 && r.d > 8) {
      for (let k = 0; k < 4; k++) r.againstWall("crib", k % 2 ? "s" : "w", { t: 0.15 + (k >> 1) * 0.55 });
      for (let k = 0; k < 3; k++) r.randomFree("crib", 2);
    } else {
      r.againstWall("crib", "w", {});
      r.againstWall("shelf", "n", {});
    }
    for (let k = 0; k < 4; k++) r.randomFree("teddy", 0.5, 6, undefined, { clearOk: false });
    r.randomFree("chair_orange", 1.2, 6);
    r.randomFree("chair_blue", 1.2, 6);
    r.placeAt("wheelchair", (i.x0 + i.x1) / 2 + 1, (i.z0 + i.z1) / 2, 0.6);
    r.scatter("papers", 3);
  },
  patient(r) {
    const beds = r.w * r.d > 70 ? 2 : 1;
    const side = r.pick(SIDES);
    for (let b = 0; b < beds; b++) {
      const bed = r.againstWall("bed", side, { t: beds === 1 ? 0.35 + r.rnd() * 0.3 : 0.2 + b * 0.6, tries: 3 });
      if (bed) {
        r.againstWall("ivstand", side, { t: beds === 1 ? 0.8 : 0.2 + b * 0.6 + 0.17, tries: 2, clearOk: true });
        r.againstWall("trolley", side, { tries: 2 });
      }
    }
    if (beds === 2) {
      const i = r.inner;
      if (side === "s" || side === "n") r.placeAt("curtain", (i.x0 + i.x1) / 2, side === "s" ? i.z0 + 1.2 : i.z1 - 1.2, Math.PI / 2, { force: true, noReserve: true });
      else r.placeAt("curtain", side === "w" ? i.x0 + 1.2 : i.x1 - 1.2, (i.z0 + i.z1) / 2, 0, { force: true, noReserve: true });
    }
    r.againstWall("wardrobe", r.pick(SIDES), {});
    r.randomFree("chair_blue", 1, 5);
    r.againstWall("tv", r.pick(SIDES), { decor: true, height: 2.3 });
    if (r.chance(0.5)) r.againstWall("dead_plant", r.pick(SIDES), {});
    r.scatter("papers", 2);
  },
  ward(r) {
    const i = r.inner;
    const alongX = r.w >= r.d;
    const sides: Side[] = alongX ? ["s", "n"] : ["w", "e"];
    for (const side of sides) {
      const len = alongX ? r.w : r.d;
      const n = Math.floor(len / 3.2);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const bed = r.againstWall(r.chance(0.85) ? "bed" : "stretcher", side, { t, tries: 1 });
        if (bed && k < n - 1 && r.chance(0.7)) {
          const c = (alongX ? i.x0 : i.z0) + (len * (k + 1)) / n;
          if (alongX) r.placeAt("curtain", c, side === "s" ? i.z0 + 1.2 : i.z1 - 1.2, Math.PI / 2, { force: true, noReserve: true });
          else r.placeAt("curtain", side === "w" ? i.x0 + 1.2 : i.x1 - 1.2, c, 0, { force: true, noReserve: true });
        }
      }
    }
    r.randomFree("wheelchair", 2);
    r.randomFree("ivstand", 2);
    r.randomFree("trolley", 2);
    r.scatter("papers", 4);
  },
  surgery(r) {
    const i = r.inner;
    if (r.w * r.d > 100) {
      r.placeAt("op_table", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2, 0);
      r.placeAt("surgical_lamp", (i.x0 + i.x1) / 2 - 0.7, (i.z0 + i.z1) / 2, 0, { force: true, noReserve: true, y: r.y + 0.0 });
      r.randomFree("trolley", 1.5);
      r.randomFree("ivstand", 1.5);
      r.alongWall("med_cabinet", "n", 1.8, { skipChance: 0.3 });
    } else {
      r.alongWall("sink", r.pick(SIDES), 1.2, { skipChance: 0.3 });
      r.againstWall("med_cabinet", r.pick(SIDES), {});
      r.againstWall("trolley", r.pick(SIDES), {});
      r.againstWall("stretcher", r.pick(SIDES), { parallel: true });
      r.againstWall("shelf", r.pick(SIDES), {});
    }
    r.scatter("papers", 2);
  },
  radiology(r) {
    const i = r.inner;
    r.placeAt("xray", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2 - 1, 0);
    r.againstWall("desk", "e", {});
    r.againstWall("wardrobe", "w", {});
    r.againstWall("shelf", "n", {});
    r.scatter("papers", 3);
  },
  director(r) {
    const i = r.inner;
    r.placeAt("desk", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2 + 0.5, Math.PI);
    r.placeAt("office_chair", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2 + 1.5, Math.PI + 0.3);
    r.alongWall("shelf", "w", 2, {});
    r.againstWall("dead_plant", "n", { t: 0.1 });
    r.againstWall("wardrobe", "e", {});
    r.scatter("papers", 4);
  },
  nurse(r) {
    r.againstWall("desk", r.pick(SIDES), {});
    r.againstWall("med_cabinet", r.pick(SIDES), {});
    r.againstWall("trolley", r.pick(SIDES), {});
    r.againstWall("wardrobe", r.pick(SIDES), {});
    r.randomFree("office_chair", 1);
    r.scatter("papers", 3);
  },
  morgue(r) {
    const i = r.inner;
    if (r.w * r.d > 100) {
      r.againstWall("morgue_lockers", "n", { t: 0.25 });
      r.againstWall("morgue_lockers", "n", { t: 0.75 });
      r.placeAt("autopsy", (i.x0 + i.x1) / 2 - 2.5, (i.z0 + i.z1) / 2 - 1, 0);
      r.placeAt("autopsy", (i.x0 + i.x1) / 2 + 2.5, (i.z0 + i.z1) / 2 - 1, 0.1);
      r.alongWall("sink", "e", 1.4, { skipChance: 0.4 });
      r.againstWall("stretcher", "w", { parallel: true });
      r.randomFree("trolley", 1.5);
    } else if (r.room.id === "b_cold") {
      r.againstWall("morgue_lockers", "e", {});
      r.againstWall("stretcher", "w", { parallel: true });
    } else {
      r.againstWall("desk", r.pick(SIDES), {});
      r.againstWall("shelf", r.pick(SIDES), {});
      r.againstWall("wardrobe", r.pick(SIDES), {});
    }
    r.scatter("papers", 2);
  },
  boiler(r) {
    const i = r.inner;
    if (r.w * r.d > 120) {
      r.placeAt("boiler", i.x0 + 4.5, (i.z0 + i.z1) / 2 + 1.5, 0);
      r.placeAt("boiler", i.x0 + 10, (i.z0 + i.z1) / 2 + 1.5, 0);
    } else {
      r.placeAt("generator", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2, 0);
    }
    for (const side of SIDES) r.alongWall("pipes_v", side, 3.5, { skipChance: 0.4 });
    r.alongWall("pipes", "n", 2, { gap: -0.08, decor: true });
    r.againstWall("workbench", "s", {});
    r.scatter("debris", 3);
  },
  archives(r) {
    const i = r.inner;
    if (r.w * r.d > 120) {
      // rangées d'étagères : un vrai petit labyrinthe
      for (let x = i.x0 + 2.2; x < i.x1 - 1.5; x += 2.4) {
        for (let z = i.z0 + 2.0; z < i.z1 - 1.5; z += 2.1) {
          if (r.chance(0.18)) continue;
          r.placeAt("shelf", x, z, Math.PI / 2 * (r.chance(0.2) ? 1 : 0));
        }
      }
    } else {
      for (const side of SIDES) r.alongWall("shelf", side, 2.1, { skipChance: 0.2 });
    }
    r.scatter("papers", 10);
    r.randomFree("boxes", 1);
    r.randomFree("boxes", 1);
  },
  electric(r) {
    if (r.room.id === "b_generator") {
      const i = r.inner;
      r.placeAt("generator", (i.x0 + i.x1) / 2, (i.z0 + i.z1) / 2, 0);
      r.againstWall("workbench", "n", {});
    } else {
      r.alongWall("elec_cabinet", "e", 2.1, {});
      r.alongWall("elec_cabinet", "n", 2.1, { skipChance: 0.3 });
    }
    for (const side of ["w", "s"] as Side[]) r.alongWall("pipes", side, 2, { gap: -0.08, decor: true, skipChance: 0.2 });
    r.scatter("debris", 1);
  },
  techcorr(r) {
    // salles techniques larges (atelier)
    r.alongWall("workbench", "n", 3, { skipChance: 0.3 });
    r.alongWall("shelf", "s", 2.5, { skipChance: 0.4 });
    r.randomFree("boxes", 1);
    r.alongWall("pipes", "w", 2, { gap: -0.08, decor: true });
    r.scatter("debris", 2);
  },
  roofroom(r) {
    r.againstWall("elec_cabinet", "w", {});
    r.againstWall("workbench", "n", { t: 0.7 });
    r.scatter("debris", 1);
  },
};
