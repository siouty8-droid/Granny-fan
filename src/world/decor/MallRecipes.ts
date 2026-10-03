import type { ThemeId } from "../layout/types";
import type { PropSystem } from "../props/PropSystem";
import { MALL_FOOTPRINTS } from "../props/catalog/mall";
import { FOOTPRINT, type RoomDresser, type Side } from "./RoomDresser";

Object.assign(FOOTPRINT, MALL_FOOTPRINTS);

type Recipe = (r: RoomDresser) => void;

const SIDES: Side[] = ["s", "n", "w", "e"];
const OPP: Record<Side, Side> = { s: "n", n: "s", w: "e", e: "w" };

/** Côté de la vitrine (mur donnant sur la galerie), ou null. */
function frontSide(r: RoomDresser): Side | null {
  const [x0, z0, x1, z1] = r.room.rect;
  for (const o of r.roomOpenings()) {
    if (!o.id.endsWith("_front") && !o.id.endsWith("_entrance")) continue;
    if (o.axis === "x") return o.z === z0 ? "s" : o.z === z1 ? "n" : null;
    return o.x === x0 ? "w" : o.x === x1 ? "e" : null;
  }
  return null;
}

/** Côtés latéraux par rapport à la vitrine. */
function lateral(front: Side): Side[] {
  return front === "s" || front === "n" ? ["w", "e"] : ["s", "n"];
}

/** Ligne de mannequins derrière la vitrine (certains renversés). */
function windowDisplay(r: RoomDresser, front: Side, ids: string[]): void {
  const i = r.inner;
  const horizontal = front === "s" || front === "n";
  const lo = (horizontal ? i.x0 : i.z0) + 4.6;
  const hi = (horizontal ? i.x1 : i.z1) - 1.0;
  const depth = 1.0;
  const yaw = front === "n" ? 0 : front === "s" ? Math.PI : front === "e" ? Math.PI / 2 : -Math.PI / 2;
  let k = 0;
  for (let t = lo; t <= hi; t += 1.7, k++) {
    const id = ids[k % ids.length]!;
    const x = horizontal ? t : front === "w" ? i.x0 + depth : i.x1 - depth;
    const z = horizontal ? (front === "s" ? i.z0 + depth : i.z1 - depth) : t;
    if (r.chance(0.22)) r.placeAt(id, x + 0.3, z + 0.2, r.rnd() * 6.28, { pitch: Math.PI / 2, clearOk: true });
    else r.placeAt(id, x, z, yaw + (r.rnd() - 0.5) * 0.6, { clearOk: true });
  }
}

/** Grille d'objets au centre de la pièce (rangées parallèles à la vitrine). */
function centerGrid(r: RoomDresser, ids: string[], stepA: number, stepB: number, margin: number, skip = 0.15, yaw = 0): void {
  const i = r.inner;
  let k = 0;
  for (let x = i.x0 + margin; x <= i.x1 - margin + 1e-6; x += stepA) {
    for (let z = i.z0 + margin; z <= i.z1 - margin + 1e-6; z += stepB) {
      k++;
      if (r.chance(skip)) continue;
      r.placeAt(ids[k % ids.length]!, x, z, yaw + (r.chance(0.25) ? (r.rnd() - 0.5) * 0.5 : 0));
    }
  }
}

function litter(r: RoomDresser, papers: number, debris = 0): void {
  r.scatter("papers", papers);
  if (debris) r.scatter("debris", debris);
}

function shopBase(r: RoomDresser, fill: (front: Side, back: Side) => void): void {
  const front = frontSide(r) ?? "n";
  const back = OPP[front];
  fill(front, back);
  litter(r, 3, r.chance(0.5) ? 1 : 0);
}

export const MALL_RECIPES: Partial<Record<ThemeId, Recipe>> = {
  mall(r) {
    if (r.room.kind !== "corridor") {
      // boîtier de la grille (sortie) : dégagé
      if (r.room.id === "g_hall") r.placed.push({ x0: 56.8, z0: 0, x1: 59, z1: 2 });
      // hall d'entrée / sortie nord : bancs, plantes, poubelles
      r.randomFree("planter", 1.5);
      r.randomFree("planter", 1.5);
      r.randomFree("mall_bench", 1.5);
      r.randomFree("cart", 1.5);
      litter(r, 6, 2);
      return;
    }
    const area = r.w * r.d;
    const n = Math.floor(area / 45);
    const pool = ["mall_bench", "planter", "mall_bin", "mall_bench", "cart", "planter"];
    for (let k = 0; k < n; k++) r.randomFree(r.pick(pool), 0.9, 6, r.chance(0.6) ? 0 : Math.PI / 2);
    if (r.chance(0.35)) r.randomFree("mannequin", 0.8, 4, undefined);
    if (r.chance(0.3)) r.randomFree("mannequin_headless", 0.8, 4, r.rnd() * 6, { clearOk: false });
    litter(r, Math.ceil(area / 25), Math.floor(area / 60));
  },
  mallU(r) {
    const area = r.w * r.d;
    const n = Math.floor(area / 60);
    for (let k = 0; k < n; k++) r.randomFree(r.pick(["mall_bench", "mall_bin", "planter", "cart"]), 0.9, 6, r.w > r.d ? 0 : Math.PI / 2);
    litter(r, Math.ceil(area / 30));
  },
  atrium(r) {
    litter(r, Math.ceil((r.w * r.d) / 30), 1);
  },
  shopClothes(r) {
    shopBase(r, (front, back) => {
      windowDisplay(r, front, ["mannequin", "mannequin_pose", "mannequin_headless"]);
      // cabines d'essayage au fond (cachettes)
      r.againstWall("fitting_room", back, { t: 0.12, tries: 6 });
      r.againstWall("fitting_room", back, { t: 0.88, tries: 6 });
      r.againstWall("checkout", back, { tries: 10 }) ?? r.randomFree("checkout", 1.2, 10, 0);
      for (const s of lateral(front)) r.alongWall("clothes_rack", s, 2.4, { skipChance: 0.25, parallel: false });
      centerGrid(r, ["clothes_rack"], 2.6, 2.6, 3.4, 0.3, front === "s" || front === "n" ? 0 : Math.PI / 2);
      r.randomFree("mannequin_headless", 1, 4, r.rnd() * 6, { clearOk: false });
    });
  },
  shopShoes(r) {
    shopBase(r, (front, back) => {
      for (const s of [back, ...lateral(front)]) r.alongWall("shelf", s, 2.1, { skipChance: 0.15 });
      centerGrid(r, ["table_shoes", "mall_bench"], 3.2, 3.4, 3.2, 0.2);
      windowDisplay(r, front, ["table_shoes"]);
    });
  },
  shopToys(r) {
    shopBase(r, (front, back) => {
      for (const s of [back, ...lateral(front)]) r.alongWall("shelf", s, 2.0, { skipChance: 0.1 });
      centerGrid(r, ["gondola"], 3.2, 3.0, 3.2, 0.2);
      for (let k = 0; k < 6; k++) r.randomFree("teddy", 0.5, 6, undefined);
      r.againstWall("checkout", front, { tries: 10, clearOk: true }) ?? r.randomFree("checkout", 1.2, 10, 0);
    });
  },
  shopPhones(r) {
    shopBase(r, (front, back) => {
      r.alongWall("tv_stand", back, 2.2, { skipChance: 0.2 });
      centerGrid(r, ["table_phones"], 3.0, 3.6, 3.0, 0.15);
      for (const s of lateral(front)) r.alongWall("shelf", s, 2.4, { skipChance: 0.4 });
    });
  },
  shopPerfume(r) {
    shopBase(r, (front, back) => {
      for (const s of [back, ...lateral(front)]) r.alongWall("display_case", s, 2.0, { skipChance: 0.2 });
      centerGrid(r, ["display_case"], 3.4, 3.4, 3.4, 0.3);
      windowDisplay(r, front, ["mannequin_headless"]);
    });
  },
  shopJewelry(r) {
    shopBase(r, (front, back) => {
      r.alongWall("display_case", back, 1.9, {});
      for (const s of lateral(front)) r.alongWall("display_case", s, 1.9, { skipChance: 0.15 });
      r.againstWall("wardrobe", back, { t: 0.1 });
      r.scatter("debris", 2);
    });
  },
  shopBooks(r) {
    shopBase(r, (front, back) => {
      for (const s of [back, ...lateral(front)]) r.alongWall("shelf", s, 1.95, {});
      centerGrid(r, ["table_books", "shelf"], 3.0, 3.2, 3.2, 0.2);
      r.againstWall("checkout", front, { tries: 10, clearOk: true }) ?? r.randomFree("checkout", 1.2, 10, 0);
      r.scatter("papers", 6);
    });
  },
  shopSport(r) {
    shopBase(r, (front, back) => {
      r.againstWall("fitting_room", back, { t: 0.85, tries: 6 });
      for (const s of [back, ...lateral(front)]) r.alongWall("shelf", s, 2.3, { skipChance: 0.2 });
      centerGrid(r, ["clothes_rack", "gondola"], 3.0, 3.0, 3.2, 0.25);
      windowDisplay(r, front, ["mannequin_pose", "mannequin"]);
    });
  },
  shopPharmacy(r) {
    const front = frontSide(r);
    if (!front) {
      // infirmerie du personnel
      r.againstWall("bed", r.pick(SIDES), {});
      r.againstWall("med_cabinet", r.pick(SIDES), {});
      r.againstWall("desk", r.pick(SIDES), {});
      litter(r, 2);
      return;
    }
    shopBase(r, (f, back) => {
      r.alongWall("med_cabinet", back, 1.5, { skipChance: 0.15 });
      for (const s of lateral(f)) r.alongWall("med_cabinet", s, 1.6, { skipChance: 0.3 });
      r.againstWall("checkout", back, { tries: 10, gap: 1.4 }) ?? r.randomFree("checkout", 1.2, 10, 0);
      centerGrid(r, ["gondola"], 3.2, 3.6, 3.6, 0.3);
    });
  },
  supermarket(r) {
    const i = r.inner;
    const front: Side = r.room.rect[0] === 0 ? "e" : "w";
    const back = OPP[front];
    r.alongWall("fridge_case", back, 2.1, { skipChance: 0.1 });
    // rayons (gondoles dans le sens de la profondeur)
    const xs = front === "e" ? [i.x0 + 3.2, i.x0 + 6.0] : [i.x1 - 3.2, i.x1 - 6.0];
    for (const x of xs) for (let z = i.z0 + 2.5; z < i.z1 - 2; z += 2.15) if (!(z > 29 && z < 39) && !r.chance(0.08)) r.placeAt("gondola", x, z, Math.PI / 2 * (r.chance(0.05) ? 1.1 : 1));
    // caisses près de l'entrée
    const cx = front === "e" ? i.x1 - 2.6 : i.x0 + 2.6;
    for (const z of [17, 21, 25, 43, 47, 51]) r.placeAt("checkout", cx, z, Math.PI / 2);
    for (let k = 0; k < 7; k++) r.randomFree("cart", 0.8, 6);
    r.randomFree("pallet", 1);
    litter(r, 12, 3);
  },
  electro(r) {
    const i = r.inner;
    const front: Side = r.room.rect[0] === 96 ? "w" : "e";
    r.alongWall("tv_stand", OPP[front], 2.0, {});
    r.alongWall("washer", "n", 1.2, { skipChance: 0.2 });
    r.alongWall("fridge_case", "s", 2.2, { skipChance: 0.3 });
    for (let z = i.z0 + 4; z < i.z1 - 3; z += 3.2) if (!(z > 29 && z < 39)) r.placeAt(r.chance(0.5) ? "gondola" : "tv_stand", (i.x0 + i.x1) / 2, z, 0);
    r.randomFree("checkout", 1.5);
    r.randomFree("boxes", 1);
    r.randomFree("boxes", 1);
    litter(r, 8, 2);
  },
  foodcourt(r) {
    const i = r.inner;
    for (let x = i.x0 + 2.5; x < i.x1 - 2; x += 4.2) {
      for (let z = i.z0 + 2.6; z < i.z1 - 2.6; z += 3.6) {
        if (r.chance(0.15)) continue;
        r.placeAt("cafe_table", x, z, r.chance(0.25) ? 0.4 : 0);
      }
    }
    for (let k = 0; k < 8; k++) r.randomFree("chair_orange", 1.0, 6);
    r.randomFree("mall_bin", 1);
    r.randomFree("mall_bin", 1);
    r.randomFree("planter", 1);
    litter(r, 10, 1);
  },
  fastfood(r) {
    const i = r.inner;
    const counter = r.roomOpenings().find((o) => o.id.endsWith("_counter"));
    if (counter) r.placeAt("food_counter", counter.x, i.z1 - 0.45, Math.PI, { force: true });
    r.alongWall("workbench", "s", 2.2, { skipChance: 0.3 });
    r.againstWall("sink", "w", {});
    r.againstWall("shelf", "e", {});
    litter(r, 2, 1);
  },
  coldroom(r) {
    for (const s of SIDES) r.alongWall("shelf", s, 2.2, { skipChance: 0.3 });
    r.randomFree("pallet", 1);
    r.randomFree("pallet", 1);
    r.randomFree("boxes", 1);
    litter(r, 1);
  },
  cinemaLobby(r) {
    r.againstWall("reception", "w", { t: 0.5, gap: 0.6 });
    r.againstWall("vending", "e", { t: 0.3 });
    r.againstWall("vending", "e", { t: 0.45 });
    r.randomFree("mall_bench", 1.2);
    r.randomFree("planter", 1.2);
    r.randomFree("mall_bin", 1);
    litter(r, 8, 1);
  },
  cinema(r) {
    const i = r.inner;
    // rangées face à l'écran (mur est), allée centrale
    const zMid = (i.z0 + i.z1) / 2;
    for (let x = i.x0 + 3.2; x < i.x1 - 4.5; x += 1.45) {
      for (const dz of [-3.6, 3.6]) {
        if (r.chance(0.06)) continue;
        r.placeAt("cinema_row", x, zMid + dz, Math.PI / 2);
      }
    }
    litter(r, 8, 2);
  },
  projection(r) {
    r.placeAt("projector", 81, 10.6, 0);
    r.placeAt("projector", 88, 10.6, 0.15);
    r.alongWall("shelf", "s", 2.2, { skipChance: 0.3 });
    r.randomFree("boxes", 1);
    litter(r, 4, 1);
  },
  mallOffice(r) {
    const side = r.pick(SIDES);
    const desk = r.againstWall("desk", side, { gap: 0.6 });
    if (desk) r.placeAt("office_chair", desk.x + Math.sin(desk.yaw) * 0.9, desk.z + Math.cos(desk.yaw) * 0.9, desk.yaw + Math.PI + 0.4);
    r.againstWall("shelf", r.pick(SIDES), {});
    r.againstWall("wardrobe", r.pick(SIDES), {});
    r.againstWall("dead_plant", r.pick(SIDES), {});
    if (r.w * r.d > 120) {
      r.randomFree("cafe_table", 2.5);
      for (let k = 0; k < 4; k++) r.randomFree("office_chair", 1.5, 5);
    }
    litter(r, 4);
    r.randomFree("folders", 1, 4);
  },
  service(r) {
    const alongX = r.w >= r.d;
    const i = r.inner;
    if (r.room.kind === "corridor") {
      if (alongX) r.reserveLane({ x0: i.x0, z0: (i.z0 + i.z1) / 2 - 0.8, x1: i.x1, z1: (i.z0 + i.z1) / 2 + 0.8 });
      else r.reserveLane({ x0: (i.x0 + i.x1) / 2 - 0.8, z0: i.z0, x1: (i.x0 + i.x1) / 2 + 0.8, z1: i.z1 });
      const len = alongX ? r.w : r.d;
      const sides: Side[] = alongX ? ["s", "n"] : ["w", "e"];
      for (let k = 0; k < Math.floor(len / 7); k++) r.againstWall(r.pick(["boxes", "trash", "pallet", "laundry_cart", "cart"]), r.pick(sides), { t: (k + 0.5) / Math.floor(len / 7), tries: 2 });
      r.scatter("papers", Math.floor(len / 10));
      return;
    }
    for (const s of SIDES) r.alongWall("shelf", s, 2.6, { skipChance: 0.5 });
    r.randomFree("boxes", 1);
    r.randomFree("trash", 1);
    litter(r, 2, 1);
  },
  toilets(r) {
    r.alongWall("sink", r.pick(["w", "e"] as Side[]), 1.2, {});
    r.againstWall("trash", r.pick(SIDES), {});
    r.scatter("papers", 2);
  },
  storage(r) {
    for (const s of SIDES) r.alongWall("shelf", s, 2.2, { skipChance: 0.35 });
    r.randomFree("pallet", 1);
    r.randomFree("pallet", 1);
    r.randomFree("boxes", 0.8);
    r.randomFree("boxes", 0.8);
    litter(r, 2);
  },
  parking(r) {
    const i = r.inner;
    // voitures garées sur les places (rangées de part et d'autre des allées)
    for (const zc of [4, 12, 20, 36, 44, 52]) {
      if (zc < i.z0 + 2 || zc > i.z1 - 2) continue;
      for (let x = 16.3; x < 61; x += 2.6) {
        if (x < i.x0 + 1 || x > i.x1 - 1) continue;
        if (Math.abs(((x - 22) % 8 + 8) % 8) < 0.7) continue; // poteaux
        if (!r.chance(0.32)) continue;
        const car = r.pick(["car_gray", "car_red", "car_blue"]);
        const yaw = (r.chance(0.5) ? 0 : Math.PI) + (r.rnd() - 0.5) * 0.12;
        r.placeAt(car, x, zc, yaw);
      }
    }
    r.randomFree("cart", 1.5);
    r.randomFree("trash", 1.5);
    litter(r, 4, 2);
  },
  dock(r) {
    // le camion est posé par le gameplay (sortie) : on réserve sa place
    r.placed.push({ x0: 70.5, z0: 0, x1: 79, z1: 10 });
    r.alongWall("pallet", "w", 1.6, { skipChance: 0.3 });
    r.alongWall("shelf", "n", 2.4, { skipChance: 0.4 });
    for (let k = 0; k < 5; k++) r.randomFree("pallet", 1);
    r.randomFree("dumpster", 1);
    r.randomFree("cart", 1);
    litter(r, 4, 3);
  },
  metroHall(r) {
    const i = r.inner;
    // ligne de tourniquets (un passage cassé)
    for (let x = i.x0 + 1.4; x < i.x1 - 1; x += 1.1) {
      if (Math.abs(x - 95) < 0.6) continue;
      r.placeAt("turnstile", x, i.z1 - 3.2, 0, { force: true });
    }
    r.alongWall("ticket_machine", "e", 1.6, { skipChance: 0.2 });
    r.againstWall("reception", "s", { t: 0.65 });
    r.randomFree("metro_bench", 1.5, 6, 0);
    litter(r, 8, 3);
  },
  metroPlatform(r) {
    r.alongWall("metro_bench", "s", 5.5, { skipChance: 0.2 });
    r.alongWall("mall_bin", "s", 7, { skipChance: 0.2 });
    litter(r, 8, 2);
  },
  metroTrack(r) {
    r.scatter("debris", 6);
    r.scatter("papers", 4);
  },
  tunnel(r) {
    r.scatter("debris", 5);
  },
  serviceTunnel(r) {
    r.scatter("debris", 3);
    r.scatter("papers", 2);
  },
};

/** Extérieur du centre commercial : voitures abandonnées, arbres morts, poubelles. */
export function dressMallExterior(P: PropSystem): void {
  const cars: Array<[string, number, number, number]> = [
    ["car_gray", 12, -14, 0.05],
    ["car_red", 33.5, -24.4, 3.1],
    ["car_blue", 70, -14.2, 0.2],
    ["car_gray", 86, -34, 1.5],
    ["car_red", 101, -24, 3.2],
    ["car_blue", -12, -35, 0.6],
  ];
  for (const [id, x, z, yaw] of cars) P.add(id, x, 0, z, yaw, "ext", "ext");
  P.add("cart", 47, 0, -8, 0.7, "ext", "ext");
  P.add("cart", 64, 0, -19, 2.2, "ext", "ext");
  P.add("tree_a", -18, 0, -10, 0.4, "ext", "ext");
  P.add("tree_b", 125, 0, -12, 1.1, "ext", "ext");
  P.add("tree_c", -20, 0, 40, 2.2, "ext", "ext");
  for (const x of [40, 70]) P.add("mall_bench", x, 0, -2.4, 0, "ext", "ext");
  for (const x of [44, 66]) P.add("mall_bin", x, 0, -2.2, 0, "ext", "ext");
}
