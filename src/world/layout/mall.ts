import type { Surface } from "../../physics/Collider";
import type {
  DoorSpec,
  FloorDef,
  FloorId,
  HospitalLayout,
  OpeningDef,
  OpeningKind,
  Rect,
  RoomDef,
  RoomKind,
  StairDef,
  ThemeId,
} from "./types";

/**
 * ============================================================================
 *  LES GALERIES DU VAL — centre commercial fermé depuis l'accident de la ligne 7.
 * ============================================================================
 *  Repère : x vers l'est, z vers le nord, 1 cellule = 1 m. Emprise [0,0]→[110,70].
 *  Niveaux : B (sous-sol, y = -5), G (galerie, y = 0), U (mezzanine, y = 5).
 *
 *  Galerie : allée est-ouest (z 27→41) croisée par une allée nord-sud (x 49→61), sous verrière.
 *            Les vides de la mezzanine (puits de lumière) laissent voir la galerie d'en haut ;
 *            escalators à l'arrêt dans trois d'entre eux, fontaine à sec au centre.
 *  RDC : 12 boutiques + deux grandes surfaces (Primo à l'ouest, Électro Max à l'est), hall
 *        d'entrée au sud (départ, portes vitrées enchaînées), couloirs de service derrière.
 *  Mezzanine : aire de restauration et ses cuisines, cinéma (hall, 2 salles, cabine), bureaux de
 *              la direction et PC sécurité.
 *  Sous-sol : parking, quai de livraison, locaux techniques, et la station de métro murée
 *             (salle des guichets, quai, voie en contrebas, tunnel, rame accidentée).
 */

/** Hauteur de la mezzanine (dessus du vide, sous la verrière). */
export const MALL_SKYLIGHT_Y = 9.2;

const floors: FloorDef[] = [
  { id: "B", label: "Sous-sol", y: -5, ceiling: 3.2, footprint: [[9, 0, 86, 70], [86, 24, 140, 62]], holes: [], exposed: false },
  { id: "G", label: "Galerie", y: 0, ceiling: 4.2, footprint: [[0, 0, 110, 70]], holes: [], exposed: true },
  {
    id: "U",
    label: "Mezzanine",
    y: 5,
    ceiling: 4.2,
    footprint: [[9, 0, 101, 70]],
    holes: [],
    exposed: true,
  },
];

/** Vides de la mezzanine (puits de lumière au-dessus de la galerie). */
export const MALL_VOIDS: Array<{ id: string; rect: Rect; name: string }> = [
  { id: "w1", rect: [18, 31, 33, 37], name: "Puits ouest" },
  { id: "w2", rect: [37, 31, 49, 37], name: "Puits ouest" },
  { id: "c", rect: [51, 29, 59, 39], name: "Atrium" },
  { id: "e1", rect: [61, 31, 74, 37], name: "Puits est" },
  { id: "e2", rect: [78, 31, 92, 37], name: "Puits est" },
  { id: "s", rect: [53, 16, 57, 27], name: "Puits sud" },
  { id: "n", rect: [53, 41, 57, 52], name: "Puits nord" },
];
floors.find((f) => f.id === "U")!.holes.push(...MALL_VOIDS.map((v) => v.rect));

/** Allées de la galerie (même découpage au RDC et à la mezzanine). */
const GALLERY: Array<{ id: string; rect: Rect; name: string; sector: string }> = [
  { id: "galW_s", rect: [14, 27, 49, 31], name: "Allée ouest", sector: "W" },
  { id: "galW_n", rect: [14, 37, 49, 41], name: "Allée ouest", sector: "W" },
  { id: "galW_end", rect: [14, 31, 18, 37], name: "Allée ouest", sector: "W" },
  { id: "galW_bridge", rect: [33, 31, 37, 37], name: "Passerelle ouest", sector: "W" },
  { id: "galC_s", rect: [49, 27, 61, 29], name: "Rond-point", sector: "C" },
  { id: "galC_n", rect: [49, 39, 61, 41], name: "Rond-point", sector: "C" },
  { id: "galC_w", rect: [49, 29, 51, 39], name: "Rond-point", sector: "C" },
  { id: "galC_e", rect: [59, 29, 61, 39], name: "Rond-point", sector: "C" },
  { id: "galE_s", rect: [61, 27, 96, 31], name: "Allée est", sector: "E" },
  { id: "galE_n", rect: [61, 37, 96, 41], name: "Allée est", sector: "E" },
  { id: "galE_bridge", rect: [74, 31, 78, 37], name: "Passerelle est", sector: "E" },
  { id: "galE_end", rect: [92, 31, 96, 37], name: "Allée est", sector: "E" },
  { id: "galS_w", rect: [49, 12, 53, 27], name: "Allée sud", sector: "S" },
  { id: "galS_e", rect: [57, 12, 61, 27], name: "Allée sud", sector: "S" },
  { id: "galS_end", rect: [53, 12, 57, 16], name: "Allée sud", sector: "S" },
  { id: "galN_w", rect: [49, 41, 53, 56], name: "Allée nord", sector: "N" },
  { id: "galN_e", rect: [57, 41, 61, 56], name: "Allée nord", sector: "N" },
  { id: "galN_end", rect: [53, 52, 57, 56], name: "Allée nord", sector: "N" },
];

const rooms: RoomDef[] = [];
const openings: OpeningDef[] = [];

const SURFACE_BY_THEME: Partial<Record<ThemeId, Surface>> = {
  parking: "concrete",
  dock: "concrete",
  service: "concrete",
  stairs: "concrete",
  projection: "concrete",
  metroTrack: "concrete",
  tunnel: "concrete",
  shopClothes: "wood",
  shopShoes: "wood",
  shopBooks: "wood",
  cinema: "wood",
  cinemaLobby: "wood",
  mallOffice: "wood",
  coldroom: "metal",
};

function room(floor: FloorId, id: string, rect: Rect, name: string, theme: ThemeId, sector: string, kind: RoomKind = "room", extra: Partial<RoomDef> = {}): void {
  rooms.push({ id, floor, rect, name, theme, sector, kind, surface: SURFACE_BY_THEME[theme] ?? "tile", ...extra });
}

let autoId = 0;
function open(floor: FloorId, kind: OpeningKind, axis: "x" | "z", x: number, z: number, width: number, extra: Partial<OpeningDef> & { door?: DoorSpec } = {}): void {
  const id = extra.id ?? `${floor}_${kind}_${autoId++}`;
  const defaults: Partial<OpeningDef> =
    kind === "window"
      ? { top: 2.3, bottom: 0.95 }
      : kind === "vent"
        ? { top: 1.22, bottom: 0 }
        : kind === "arch" || kind === "open"
          ? { top: kind === "open" ? 99 : 2.6, bottom: 0 }
          : { top: kind === "double" ? 2.3 : 2.15, bottom: 0 };
  openings.push({ floor, kind, axis, x, z, width, ...defaults, ...extra, id });
}

function door(floor: FloorId, axis: "x" | "z", x: number, z: number, spec: DoorSpec = { lock: "none" }, width = 1.1, id?: string): void {
  open(floor, width >= 1.8 ? "double" : "door", axis, x, z, width, { door: spec, ...(id ? { id } : {}) });
}

/** Vitrine de boutique sur un mur horizontal (z = line) : porte vitrée + grande baie. */
function storefront(floor: FloorId, id: string, x0: number, x1: number, line: number, spec: DoorSpec = { lock: "none" }): void {
  door(floor, "x", x0 + 2.6, line, spec, 2.2, `${id}_door`);
  const s = x0 + 4.1;
  const e = x1 - 0.7;
  open(floor, "window", "x", (s + e) / 2, line, e - s, { id: `${id}_front`, bottom: 0.3, top: 3.0 });
}

// =============================================================================
//  GALERIE (RDC, G)
// =============================================================================
{
  const F: FloorId = "G";
  for (const g of GALLERY) room(F, `g_${g.id}`, g.rect, g.name, "mall", `g${g.sector}`, "corridor");
  for (const v of MALL_VOIDS) room(F, `g_void_${v.id}`, v.rect, v.name, "atrium", v.id === "c" ? "gC" : `g${v.id[0]!.toUpperCase()}`, "room", { ceiling: MALL_SKYLIGHT_Y });
  room(F, "g_hall", [47, 0, 63, 12], "Hall d'entrée", "mall", "gS");
  room(F, "g_exit_n", [49, 56, 61, 70], "Sortie de secours nord", "mall", "gN");

  // --- boutiques
  const shops: Array<[string, Rect, string, ThemeId, string]> = [
    ["g_shop1", [14, 12, 26, 27], "Mode Elsa", "shopClothes", "gW"],
    ["g_shop2", [26, 12, 38, 27], "Pas Sages — chaussures", "shopShoes", "gW"],
    ["g_shop3", [38, 12, 49, 27], "Planète Jouets", "shopToys", "gW"],
    ["g_shop4", [61, 12, 73, 27], "Mobil'Hit", "shopPhones", "gE"],
    ["g_shop5", [73, 12, 85, 27], "Zéphyr", "shopClothes", "gE"],
    ["g_shop6", [85, 12, 96, 27], "Iris Parfums", "shopPerfume", "gE"],
    ["g_shop7", [14, 41, 26, 56], "Le Grenier à livres", "shopBooks", "gW"],
    ["g_shop8", [26, 41, 38, 56], "Bijouterie Lacombe", "shopJewelry", "gW"],
    ["g_shop9", [38, 41, 49, 56], "Stade Sport", "shopSport", "gW"],
    ["g_shop10", [61, 41, 73, 56], "Pharmacie du Val", "shopPharmacy", "gE"],
    ["g_shop11", [73, 41, 85, 56], "Mini Mômes", "shopClothes", "gE"],
    ["g_shop12", [85, 41, 96, 56], "Disco Vinyles", "shopBooks", "gE"],
  ];
  for (const [id, rect, name, theme, sector] of shops) {
    room(F, id, rect, name, theme, sector);
    const south = rect[1] < 27;
    // bijouterie : rideau cadenassé côté galerie, porte de service condamnée
    const jewel = id === "g_shop8";
    storefront(F, id, rect[0], rect[2], south ? 27 : 41, jewel ? { lock: "chain", openFrom: { x: rect[0] + 2.6, z: 40 }, splitLabel: "Bijouterie" } : undefined);
    // porte de service à l'arrière (couloir technique)
    door(F, "x", rect[0] + (rect[2] - rect[0]) * 0.55, south ? 12 : 56, { lock: jewel ? "sealed" : "none" }, 1.0, `${id}_back`);
  }
  room(F, "g_hyper", [0, 12, 14, 56], "Hypermarché Primo", "supermarket", "gW");
  room(F, "g_electro", [96, 12, 110, 56], "Électro Max", "electro", "gE");
  open(F, "arch", "z", 14, 34, 5.2, { id: "g_hyper_entrance", top: 3.2 });
  open(F, "arch", "z", 96, 34, 5.2, { id: "g_electro_entrance", top: 3.2 });

  // --- hall d'entrée (départ) et façade sud
  // sortie 1 : grille (code, côté hall) puis chaîne des portes vitrées (pince coupante)
  door(F, "x", 55, 0, { lock: "chain", openFrom: { x: 55, z: 1 }, splitLabel: "Portes principales" }, 4, "g_main_entrance");
  open(F, "window", "x", 49.6, 0, 3.2, { id: "g_hall_win_w", bottom: 0.2, top: 3.4 });
  open(F, "window", "x", 60.4, 0, 3.2, { id: "g_hall_win_e", bottom: 0.2, top: 3.4 });
  door(F, "z", 47, 10, { lock: "none" }, 1.1, "g_hall_svc_w");
  door(F, "z", 63, 10, { lock: "none" }, 1.1, "g_hall_svc_e");

  // --- service sud
  room(F, "g_corr_sw", [9, 8, 47, 12], "Couloir de service sud", "service", "gSvc", "corridor");
  room(F, "g_corr_se", [63, 8, 101, 12], "Couloir de service sud", "service", "gSvc", "corridor");
  room(F, "g_res_primo", [0, 0, 9, 12], "Réserve du Primo", "storage", "gW");
  room(F, "g_stairA", [9, 0, 14, 8], "Escalier A", "stairs", "gSvc", "stair", { shaft: "A" });
  room(F, "g_wc_w", [14, 0, 26, 8], "Toilettes", "toilets", "gSvc");
  room(F, "g_menage", [26, 0, 36, 8], "Local de ménage", "storage", "gSvc");
  room(F, "g_infirm", [36, 0, 47, 8], "Infirmerie", "shopPharmacy", "gSvc");
  room(F, "g_accueil", [63, 0, 74, 8], "Objets trouvés", "mallOffice", "gSvc");
  room(F, "g_wc_e", [74, 0, 85, 8], "Toilettes", "toilets", "gSvc");
  room(F, "g_trash", [85, 0, 96, 8], "Local poubelles", "service", "gSvc");
  room(F, "g_stairB", [96, 0, 101, 8], "Escalier B", "stairs", "gSvc", "stair", { shaft: "B" });
  room(F, "g_res_electro", [101, 0, 110, 12], "Réserve d'Électro Max", "storage", "gE");
  door(F, "z", 9, 10, { lock: "none" }, 1.4, "g_res_primo_corr");
  door(F, "x", 4.5, 12, { lock: "none" }, 2.0, "g_res_primo_hyper");
  door(F, "x", 11.5, 8, { lock: "none", swing: true }, 1.6, "g_stairA_door");
  door(F, "x", 20, 8, { lock: "none" }, 1.1, "g_wc_w_door");
  door(F, "x", 31, 8, { lock: "none" }, 1.0, "g_menage_door");
  door(F, "x", 41.5, 8, { lock: "none" }, 1.2, "g_infirm_door");
  door(F, "x", 68.5, 8, { lock: "none" }, 1.1, "g_accueil_door");
  door(F, "x", 79.5, 8, { lock: "none" }, 1.1, "g_wc_e_door");
  door(F, "x", 90.5, 8, { lock: "none" }, 1.4, "g_trash_door");
  door(F, "x", 98.5, 8, { lock: "none", swing: true }, 1.6, "g_stairB_door");
  door(F, "z", 101, 10, { lock: "none" }, 1.4, "g_res_electro_corr");
  door(F, "x", 105.5, 12, { lock: "none" }, 2.0, "g_res_electro_shop");

  // --- service nord
  room(F, "g_corr_nw", [9, 56, 49, 59], "Couloir de service nord", "service", "gSvc", "corridor");
  room(F, "g_corr_ne", [61, 56, 101, 59], "Couloir de service nord", "service", "gSvc", "corridor");
  room(F, "g_res_primo_n", [0, 56, 9, 70], "Réserve du Primo", "storage", "gW");
  room(F, "g_res_shops", [9, 59, 30, 70], "Réserve des boutiques", "storage", "gSvc");
  room(F, "g_stairC", [30, 59, 35, 67], "Escalier C", "stairs", "gSvc", "stair", { shaft: "C" });
  room(F, "g_staff", [35, 59, 49, 70], "Salle du personnel", "mallOffice", "gSvc");
  room(F, "g_agents", [61, 59, 75, 70], "Vestiaires du personnel", "toilets", "gSvc");
  room(F, "g_stairD", [75, 59, 80, 67], "Escalier D", "stairs", "gSvc", "stair", { shaft: "D" });
  room(F, "g_res_central", [80, 59, 101, 70], "Réserve centrale", "storage", "gSvc");
  room(F, "g_res_electro_n", [101, 56, 110, 70], "Réserve d'Électro Max", "storage", "gE");
  door(F, "x", 4.5, 56, { lock: "none" }, 2.0, "g_res_primo_n_hyper");
  door(F, "z", 9, 57.5, { lock: "none" }, 1.4, "g_res_primo_n_corr");
  door(F, "x", 20, 59, { lock: "none" }, 1.6, "g_res_shops_door");
  door(F, "x", 32.5, 59, { lock: "none", swing: true }, 1.6, "g_stairC_door");
  door(F, "x", 42, 59, { lock: "none" }, 1.1, "g_staff_door");
  door(F, "z", 49, 57.5, { lock: "none" }, 1.2, "g_exit_n_w");
  door(F, "z", 61, 57.5, { lock: "none" }, 1.2, "g_exit_n_e");
  door(F, "x", 55, 70, { lock: "sealed" }, 3.0, "g_exit_n_doors");
  door(F, "x", 68, 59, { lock: "none" }, 1.1, "g_agents_door");
  door(F, "x", 77.5, 59, { lock: "none", swing: true }, 1.6, "g_stairD_door");
  door(F, "x", 90.5, 59, { lock: "none" }, 2.0, "g_res_central_door");
  door(F, "z", 101, 57.5, { lock: "none" }, 1.4, "g_res_electro_n_corr");
  door(F, "x", 105.5, 56, { lock: "none" }, 2.0, "g_res_electro_n_shop");
}

// =============================================================================
//  MEZZANINE (U)
// =============================================================================
{
  const F: FloorId = "U";
  for (const g of GALLERY) room(F, `u_${g.id}`, g.rect, g.name.replace("Allée", "Coursive"), "mallU", `u${g.sector}`, "corridor");

  // --- restauration
  room(F, "u_food", [14, 17, 49, 27], "Aire de restauration", "foodcourt", "uW");
  const kitchens: Array<[string, number, number, string]> = [
    ["u_burger", 14, 26, "Burger Royal"],
    ["u_pizza", 26, 38, "Pizza Napoli"],
    ["u_wok", 38, 49, "Wok Express"],
  ];
  for (const [id, x0, x1, name] of kitchens) {
    room(F, id, [x0, 12, x1, 17], name, "fastfood", "uW");
    open(F, "window", "x", (x0 + x1) / 2 + 0.8, 17, 6, { id: `${id}_counter`, bottom: 1.05, top: 2.3, broken: true });
    door(F, "x", x0 + 1.4, 17, { lock: "none" }, 1.0, `${id}_door`);
    door(F, "x", x1 - 1.6, 12, { lock: "none" }, 1.0, `${id}_back`);
  }
  room(F, "u_corr_s", [9, 8, 61, 12], "Couloir de service (étage)", "service", "uSvc", "corridor");
  room(F, "u_stairA", [9, 0, 14, 8], "Escalier A", "stairs", "uSvc", "stair", { shaft: "A" });
  room(F, "u_cold", [14, 0, 32, 8], "Chambres froides", "coldroom", "uSvc");
  room(F, "u_res_food", [32, 0, 49, 8], "Réserve de la restauration", "storage", "uSvc");
  room(F, "u_wc", [49, 0, 61, 8], "Toilettes (étage)", "toilets", "uSvc");
  door(F, "x", 11.5, 8, { lock: "none", swing: true }, 1.6, "u_stairA_door");
  door(F, "x", 23, 8, { lock: "none" }, 1.4, "u_cold_door");
  door(F, "x", 40.5, 8, { lock: "none" }, 1.4, "u_res_food_door");
  door(F, "x", 55, 8, { lock: "none" }, 1.1, "u_wc_door");
  door(F, "x", 51, 12, { lock: "none" }, 1.1, "u_gal_svc");

  // --- cinéma
  room(F, "u_cine_lobby", [61, 12, 73, 27], "Cinéma — hall", "cinemaLobby", "uE");
  room(F, "u_salle1", [73, 12, 96, 27], "Salle 1", "cinema", "uE");
  room(F, "u_projection", [61, 4, 96, 12], "Cabine de projection", "projection", "uSvc");
  room(F, "u_cine_tech", [61, 0, 96, 4], "Local technique du cinéma", "service", "uSvc");
  room(F, "u_stairB", [96, 0, 101, 8], "Escalier B", "stairs", "uSvc", "stair", { shaft: "B" });
  room(F, "u_landingB", [96, 8, 101, 12], "Palier B", "service", "uSvc");
  door(F, "x", 67, 27, { lock: "none" }, 3.0, "u_cine_entrance");
  door(F, "z", 61, 20, { lock: "none" }, 1.2, "u_cine_side");
  door(F, "z", 73, 19.5, { lock: "none" }, 1.8, "u_salle1_door");
  door(F, "x", 66, 12, { lock: "badgeGreen", splitLabel: "Cabine de projection" }, 1.0, "u_projection_door");
  door(F, "z", 61, 10, { lock: "badgeGreen" }, 1.0, "u_projection_corr");
  open(F, "window", "x", 81, 12, 0.8, { id: "u_proj_win1", bottom: 2.6, top: 3.2 });
  open(F, "window", "x", 88, 12, 0.8, { id: "u_proj_win2", bottom: 2.6, top: 3.2 });
  door(F, "x", 70, 4, { lock: "none" }, 1.1, "u_cine_tech_door");
  door(F, "x", 98.5, 8, { lock: "none", swing: true }, 1.6, "u_stairB_door");
  door(F, "z", 96, 10, { lock: "badgeGreen" }, 1.1, "u_landingB_door");

  // --- direction, PC sécurité, salle 2
  room(F, "u_director", [14, 41, 26, 56], "Bureau du directeur", "mallOffice", "uW");
  room(F, "u_compta", [26, 41, 38, 56], "Comptabilité", "mallOffice", "uW");
  room(F, "u_meeting", [38, 41, 49, 56], "Salle de réunion", "mallOffice", "uW");
  room(F, "u_pc", [61, 41, 73, 56], "PC sécurité", "security", "uE");
  room(F, "u_salle2", [73, 41, 96, 56], "Salle 2", "cinema", "uE");
  door(F, "x", 20, 41, { lock: "badgeRed", splitLabel: "Bureau du directeur" }, 1.1, "u_director_door");
  door(F, "x", 32, 41, { lock: "none" }, 1.1, "u_compta_door");
  door(F, "x", 44, 41, { lock: "none" }, 1.4, "u_meeting_door");
  door(F, "x", 67, 41, { lock: "badgeBlue", splitLabel: "PC sécurité" }, 1.2, "u_pc_door");
  door(F, "x", 84.5, 41, { lock: "none" }, 1.8, "u_salle2_door");
  door(F, "z", 26, 48.5, { lock: "oneWay", openFrom: { x: 25, z: 48.5 } }, 1.0, "u_dir_compta");

  // --- service nord
  room(F, "u_corr_n", [9, 56, 101, 59], "Couloir de service (étage)", "service", "uSvc", "corridor");
  room(F, "u_archives", [9, 59, 35, 70], "Archives de la direction", "archives", "uSvc");
  room(F, "u_servers", [35, 59, 49, 70], "Salle des serveurs", "electric", "uSvc");
  room(F, "u_wc_n", [49, 59, 61, 70], "Toilettes (étage)", "toilets", "uSvc");
  room(F, "u_lockers", [61, 59, 75, 70], "Vestiaires des agents", "lockers", "uSvc");
  room(F, "u_stairD", [75, 59, 80, 67], "Escalier D", "stairs", "uSvc", "stair", { shaft: "D" });
  room(F, "u_res_cine", [80, 59, 101, 70], "Réserve du cinéma", "storage", "uSvc");
  door(F, "x", 55, 56, { lock: "none" }, 2.0, "u_gal_n_svc");
  door(F, "x", 20, 56, { lock: "oneWay", openFrom: { x: 20, z: 55 } }, 1.0, "u_director_back");
  door(F, "x", 20, 59, { lock: "none" }, 1.4, "u_archives_door");
  door(F, "x", 42, 59, { lock: "none" }, 1.1, "u_servers_door");
  door(F, "x", 55, 59, { lock: "none" }, 1.1, "u_wc_n_door");
  door(F, "x", 68, 59, { lock: "none" }, 1.1, "u_lockers_door");
  door(F, "x", 77.5, 59, { lock: "none", swing: true }, 1.6, "u_stairD_door");
  door(F, "x", 90.5, 59, { lock: "none" }, 1.4, "u_res_cine_door");
  door(F, "x", 79, 56, { lock: "none" }, 1.1, "u_salle2_back");
}

// =============================================================================
//  SOUS-SOL (B) : parking, livraisons, station de métro
// =============================================================================
{
  const F: FloorId = "B";
  room(F, "b_stairA", [9, 0, 14, 8], "Escalier A", "stairs", "bP", "stair", { shaft: "A" });
  room(F, "b_lobbyA", [9, 8, 14, 20], "Sas de l'escalier A", "service", "bP");
  room(F, "b_park_sw", [14, 0, 38, 28], "Parking", "parking", "bP");
  room(F, "b_park_se", [38, 0, 62, 28], "Parking", "parking", "bP");
  room(F, "b_park_nw", [14, 28, 38, 56], "Parking", "parking", "bP");
  room(F, "b_park_ne", [38, 28, 62, 56], "Parking", "parking", "bP");
  door(F, "x", 11.5, 8, { lock: "none", swing: true }, 1.6, "b_stairA_door");
  door(F, "z", 14, 14, { lock: "none" }, 1.4, "b_lobbyA_park");

  room(F, "b_corr_n", [14, 56, 86, 59], "Couloir technique", "service", "bSvc", "corridor");
  room(F, "b_res1", [14, 59, 30, 70], "Réserve", "storage", "bSvc");
  room(F, "b_stairC", [30, 59, 35, 67], "Escalier C", "stairs", "bSvc", "stair", { shaft: "C" });
  room(F, "b_res2", [35, 59, 49, 70], "Réserve", "storage", "bSvc");
  room(F, "b_transfo", [49, 59, 62, 70], "Transformateur", "electric", "bSvc");
  room(F, "b_workshop", [62, 59, 75, 70], "Atelier de maintenance", "techcorr", "bSvc");
  room(F, "b_stairD", [75, 59, 80, 67], "Escalier D", "stairs", "bSvc", "stair", { shaft: "D" });
  room(F, "b_pumps", [80, 59, 86, 70], "Local des pompes", "boiler", "bSvc");
  door(F, "x", 26, 56, { lock: "none" }, 2.4, "b_park_corr_w");
  door(F, "x", 50, 56, { lock: "none" }, 2.4, "b_park_corr_e");
  door(F, "x", 22, 59, { lock: "none" }, 1.6, "b_res1_door");
  door(F, "x", 32.5, 59, { lock: "none", swing: true }, 1.6, "b_stairC_door");
  door(F, "x", 42, 59, { lock: "none" }, 1.6, "b_res2_door");
  door(F, "x", 55.5, 59, { lock: "none" }, 1.4, "b_transfo_door");
  door(F, "x", 68.5, 59, { lock: "none" }, 1.4, "b_workshop_door");
  door(F, "x", 77.5, 59, { lock: "none", swing: true }, 1.6, "b_stairD_door");
  door(F, "x", 83, 59, { lock: "none" }, 1.1, "b_pumps_door");

  room(F, "b_dock", [62, 0, 86, 40], "Quai de livraison", "dock", "bD");
  room(F, "b_elec", [62, 40, 74, 56], "Local électrique", "electric", "bD");
  room(F, "b_machines", [74, 40, 86, 56], "Salle des machines", "techcorr", "bD");
  open(F, "arch", "z", 62, 14, 8, { id: "b_park_dock", top: 3.0 });
  door(F, "x", 68, 40, { lock: "badgeGreen", splitLabel: "Local électrique" }, 1.4, "b_elec_dock");
  door(F, "x", 68, 56, { lock: "planks", openFrom: { x: 68, z: 55 } }, 1.1, "b_elec_corr"); // raccourci vers le couloir technique
  door(F, "x", 80, 40, { lock: "none" }, 1.4, "b_machines_dock");
  door(F, "x", 80.5, 56, { lock: "none" }, 1.1, "b_machines_corr");

  // --- station « Val-Saint-Aubin » (ligne 7), murée depuis l'accident
  room(F, "b_tickets", [86, 24, 104, 40], "Salle des guichets", "metroHall", "bM");
  room(F, "b_platform", [86, 40, 124, 46], "Quai — direction Porte du Val", "metroPlatform", "bM");
  room(F, "b_track", [86, 46, 124, 52], "Voie 1", "metroTrack", "bM", "room", { floorOffset: -1.1 });
  room(F, "b_tunnel", [124, 46, 140, 52], "Tunnel de la ligne 7", "tunnel", "bT", "corridor", { floorOffset: -1.1 });
  // la station est murée : brèche condamnée par des planches, côté quai de livraison
  door(F, "z", 86, 32, { lock: "planks", openFrom: { x: 85, z: 32 }, splitLabel: "Station de métro" }, 1.4, "b_dock_tickets");
  // sortie 2 : rideau métallique du quai (mécanisme propre, pas de vantail) → rampe des camions
  open(F, "double", "x", 74, 0, 5.5, { id: "b_dock_shutter", top: 3.0, door: { lock: "sealed" } });
  open(F, "arch", "x", 91, 40, 2.6, { id: "b_tickets_platform_w", top: 2.6 });
  open(F, "arch", "x", 99, 40, 2.6, { id: "b_tickets_platform_e", top: 2.6 });
}

// =============================================================================
//  Plateaux ouverts : pas de murs entre les pièces d'un même ensemble (ni autour des vides)
// =============================================================================

/** Contenu d'une cellule : id de pièce, "#air" (vide de la mezzanine) ou null (masse / dehors). */
function cellAt(floor: FloorId, x: number, z: number): string | null {
  for (const r of rooms) {
    if (r.floor !== floor) continue;
    const [x0, z0, x1, z1] = r.rect;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return r.id;
  }
  const f = floors.find((q) => q.id === floor)!;
  for (const h of f.holes) if (x >= h[0] && x < h[2] && z >= h[1] && z < h[3]) return "#air";
  return null;
}

/** Ouvre (sans mur) toutes les frontières entre membres de `ids` (et le vide si `air`). */
function openPlan(floor: FloorId, ids: string[], air: boolean): void {
  const set = new Set(ids);
  if (air) set.add("#air");
  const fp = floors.find((q) => q.id === floor)!.footprint;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const r of fp) {
    minX = Math.min(minX, r[0]);
    minZ = Math.min(minZ, r[1]);
    maxX = Math.max(maxX, r[2]);
    maxZ = Math.max(maxZ, r[3]);
  }
  for (const axis of ["x", "z"] as const) {
    const kMin = axis === "x" ? minZ : minX;
    const kMax = axis === "x" ? maxZ : maxX;
    const tMin = axis === "x" ? minX : minZ;
    const tMax = axis === "x" ? maxX : maxZ;
    for (let k = kMin + 1; k < kMax; k++) {
      let runStart = -1;
      let runKey = "";
      const flush = (end: number) => {
        if (runStart >= 0) {
          const c = (runStart + end) / 2;
          if (axis === "x") open(floor, "open", "x", c, k, end - runStart);
          else open(floor, "open", "z", k, c, end - runStart);
        }
        runStart = -1;
        runKey = "";
      };
      for (let t = tMin; t <= tMax; t++) {
        let key = "";
        if (t < tMax) {
          const a = axis === "x" ? cellAt(floor, t, k - 1) : cellAt(floor, k - 1, t);
          const b = axis === "x" ? cellAt(floor, t, k) : cellAt(floor, k, t);
          if (a && b && a !== b && set.has(a) && set.has(b) && !(a === "#air" && b === "#air")) key = `${a}|${b}`;
        }
        if (key !== runKey) {
          flush(t);
          if (key) {
            runStart = t;
            runKey = key;
          }
        }
      }
    }
  }
}

openPlan("G", [...GALLERY.map((g) => `g_${g.id}`), ...MALL_VOIDS.map((v) => `g_void_${v.id}`), "g_hall", "g_exit_n"], false);
openPlan("U", [...GALLERY.map((g) => `u_${g.id}`), "u_food"], true);
openPlan("B", ["b_park_sw", "b_park_se", "b_park_nw", "b_park_ne", "b_platform", "b_track", "b_tunnel"], false);

const stairs: StairDef[] = [
  { id: "A", rect: [9, 0, 14, 8], floors: ["B", "G", "U"], entry: "z1" },
  { id: "B", rect: [96, 0, 101, 8], floors: ["G", "U"], entry: "z1" },
  { id: "C", rect: [30, 59, 35, 67], floors: ["B", "G"], entry: "z0" },
  { id: "D", rect: [75, 59, 80, 67], floors: ["B", "G", "U"], entry: "z0" },
];

/** Escalators à l'arrêt (bas → haut), dans les vides de la mezzanine : deux voies par puits. */
export interface EscalatorDef {
  id: string;
  /** pied (RDC) et tête (mezzanine) de l'axe, au milieu de la voie */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** largeur d'une voie (m) */
  width: number;
}

export const MALL_ESCALATORS: EscalatorDef[] = [
  { id: "esc_w1", x0: 23, z0: 32.65, x1: 33, z1: 32.65, width: 1.3 },
  { id: "esc_w2", x0: 23, z0: 35.35, x1: 33, z1: 35.35, width: 1.3 },
  { id: "esc_e1", x0: 88, z0: 32.65, x1: 78, z1: 32.65, width: 1.3 },
  { id: "esc_e2", x0: 88, z0: 35.35, x1: 78, z1: 35.35, width: 1.3 },
  { id: "esc_s1", x0: 54.0, z0: 26, x1: 54.0, z1: 16, width: 1.3 },
  { id: "esc_s2", x0: 56.0, z0: 26, x1: 56.0, z1: 16, width: 1.3 },
];

/** Rame accidentée sur la voie 1 (centre, longueur, cap). */
export const MALL_TRAIN = { x: 105, z: 48.7, yaw: Math.PI / 2 + 0.035, length: 17, width: 2.6 };

export const MALL: HospitalLayout = {
  id: "mall",
  floors,
  rooms,
  openings,
  stairs,
  elevators: [],
  barriers: [],
  spawn: { x: 55, y: 0, z: 3, yaw: 0 },
};
