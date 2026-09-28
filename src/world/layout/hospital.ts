import type { Surface } from "../../physics/Collider";
import type {
  BarrierDef,
  DoorSpec,
  ElevatorDef,
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
 *  HÔPITAL SAINT-AUBIN — plan conçu à la main, décrit en données.
 * ============================================================================
 *  Repère : x vers l'est, z vers le nord, 1 cellule = 1 m. Emprise du bâtiment [0,0]→[80,54].
 *  Niveaux : B (sous-sol, y = -4), G (RDC, y = 0), U (étage, y = 4), R (toit, y = 8).
 *
 *  RDC : anneau de couloirs autour de la cour intérieure (jardin), hall au sud (spawn),
 *        urgences à l'est (sortie ambulances), cafétéria/cuisine/bureaux à l'ouest,
 *        vestiaires, chapelle et lingerie au nord.
 *  Étage : même anneau autour du vide de la cour, pédiatrie + radiologie + direction à l'ouest,
 *          chambres au sud et à l'est, bloc opératoire au nord.
 *  Sous-sol : long couloir technique, chaufferie, morgue, archives, local électrique…
 *  Toit : local de machinerie de l'ascenseur (porte condamnée) → hélistation.
 */

const floors: FloorDef[] = [
  { id: "B", label: "Sous-sol", y: -4, ceiling: 3.0, footprint: [[12, 22, 80, 54]], holes: [], exposed: false },
  { id: "G", label: "Rez-de-chaussée", y: 0, ceiling: 3.2, footprint: [[0, 0, 80, 54]], holes: [], exposed: true },
  { id: "U", label: "Étage", y: 4, ceiling: 3.2, footprint: [[0, 0, 80, 54]], holes: [[30, 20, 50, 36]], exposed: true },
  { id: "R", label: "Toit", y: 8, ceiling: 2.8, footprint: [[33, 39, 43, 49]], holes: [], exposed: true },
];

const rooms: RoomDef[] = [];
const openings: OpeningDef[] = [];

function room(
  floor: FloorId,
  id: string,
  rect: Rect,
  name: string,
  theme: ThemeId,
  sector: string,
  kind: RoomKind = "room",
  extra: Partial<RoomDef> = {},
): void {
  const surfaceByTheme: Partial<Record<ThemeId, Surface>> = {
    boiler: "concrete",
    techcorr: "concrete",
    archives: "concrete",
    electric: "concrete",
    stairs: "concrete",
    courtyard: "grass",
    office: "wood",
    director: "wood",
    chapel: "wood",
    roofroom: "metal",
    elevator: "metal",
  };
  rooms.push({ id, floor, rect, name, theme, sector, kind, surface: surfaceByTheme[theme] ?? "tile", ...extra });
}

let autoId = 0;
function open(
  floor: FloorId,
  kind: OpeningKind,
  axis: "x" | "z",
  x: number,
  z: number,
  width: number,
  extra: Partial<OpeningDef> & { door?: DoorSpec } = {},
): void {
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

/** Porte (simple ou double) avec serrure éventuelle. */
function door(floor: FloorId, axis: "x" | "z", x: number, z: number, spec: DoorSpec = { lock: "none" }, width = 1.1, id?: string): void {
  open(floor, width >= 1.8 ? "double" : "door", axis, x, z, width, { door: spec, ...(id ? { id } : {}) });
}

/** Série de fenêtres régulières sur un mur. */
function windows(floor: FloorId, axis: "x" | "z", line: number, from: number, to: number, step: number, width = 1.6, broken: number[] = []): void {
  let i = 0;
  for (let t = from; t <= to + 1e-6; t += step, i++) {
    if (axis === "x") open(floor, "window", "x", t, line, width, { broken: broken.includes(i) });
    else open(floor, "window", "z", line, t, width, { broken: broken.includes(i) });
  }
}

// =============================================================================
//  RDC (G)
// =============================================================================
{
  const F: FloorId = "G";
  // --- aile sud
  room(F, "g_cafeteria", [0, 0, 20, 17], "Cafétéria", "cafeteria", "gSW");
  room(F, "g_security", [20, 0, 28, 8], "Poste de sécurité", "security", "gS");
  room(F, "g_pharmacy", [20, 8, 28, 17], "Pharmacie", "pharmacy", "gS");
  room(F, "g_hall", [28, 0, 53, 17], "Hall d'accueil", "hall", "gS");
  room(F, "g_waiting", [53, 0, 66, 17], "Salle d'attente", "waiting", "gSE");
  room(F, "g_triage", [66, 0, 80, 17], "Accueil des urgences", "er", "gSE");
  // --- anneau de couloirs + cour
  room(F, "g_corr_s", [12, 17, 53, 20], "Couloir sud", "corridor", "gS", "corridor");
  room(F, "g_corr_w", [27, 20, 30, 36], "Couloir ouest", "corridor", "gW", "corridor");
  room(F, "g_corr_e", [50, 20, 53, 36], "Couloir est", "corridor", "gE", "corridor");
  room(F, "g_corr_n", [15, 36, 53, 39], "Couloir nord", "corridor", "gN", "corridor");
  room(F, "g_corr_ww", [12, 20, 15, 54], "Couloir des bureaux", "corridor", "gW", "corridor");
  room(F, "g_court", [30, 20, 50, 36], "Cour intérieure", "courtyard", "gC", "outdoor", { surface: "grass" });
  // --- aile ouest
  room(F, "g_kitchen", [0, 17, 12, 27], "Cuisine", "kitchen", "gSW");
  room(F, "g_office1", [0, 27, 12, 33], "Bureau des admissions", "office", "gW");
  room(F, "g_office2", [0, 33, 12, 39], "Bureau médical", "office", "gW");
  room(F, "g_office3", [0, 39, 12, 46], "Bureau du cadre de santé", "office", "gW");
  room(F, "g_secretariat", [0, 46, 12, 54], "Secrétariat médical", "office", "gW");
  room(F, "g_consult", [15, 20, 27, 28], "Salle de consultation", "patient", "gW");
  room(F, "g_stairA", [15, 28, 20, 36], "Escalier A", "stairs", "gW", "stair", { shaft: "A" });
  room(F, "g_staff", [20, 28, 27, 36], "Salle de repos du personnel", "nurse", "gW");
  room(F, "g_lockers", [15, 39, 27, 54], "Vestiaires", "lockers", "gN");
  // --- bloc nord
  room(F, "g_storage_n", [27, 39, 30, 54], "Réserve", "storage", "gN");
  room(F, "g_stairB", [30, 39, 35, 47], "Escalier B", "stairs", "gN", "stair", { shaft: "B" });
  room(F, "g_elev", [36, 39, 39, 42], "Ascenseur", "elevator", "gN", "elevator", { shaft: "E" });
  room(F, "g_linen", [30, 47, 41, 54], "Lingerie", "laundry", "gN");
  room(F, "g_chapel", [41, 39, 53, 54], "Chapelle", "chapel", "gN");
  // --- aile est (urgences)
  room(F, "g_er", [53, 17, 80, 39], "Urgences", "er", "gE");
  room(F, "g_er_store", [53, 39, 66, 54], "Réserve des urgences", "storage", "gE");
  room(F, "g_stairC", [66, 39, 71, 47], "Escalier C (service)", "stairs", "gE", "stair", { shaft: "C" });
  room(F, "g_decon", [71, 39, 80, 54], "Décontamination", "showers", "gE");

  // --- ouvertures : sud
  door(F, "x", 40.5, 0, { lock: "sealed" }, 3.2, "g_main_entrance"); // porte d'entrée (claquée pendant l'intro)
  windows(F, "x", 0, 3, 17, 4.5); // cafétéria
  windows(F, "x", 0, 31, 36, 5, 1.8); // hall ouest
  windows(F, "x", 0, 45, 50, 5, 1.8); // hall est
  open(F, "window", "x", 58, 0, 2.2, { broken: true, id: "g_waiting_window", bottom: 0.8 }); // fenêtre cassée → parvis
  open(F, "window", "x", 62.5, 0, 1.8);
  windows(F, "x", 0, 70, 76, 6); // accueil urgences
  windows(F, "z", 80, 4, 12, 8); // accueil urgences, façade est
  door(F, "z", 28, 4, { lock: "badgeGreen" }, 1.1, "g_security_door");
  door(F, "z", 28, 12.5, { lock: "none" }, 1.1, "g_pharmacy_door");
  open(F, "vent", "x", 24, 8, 0.9, { id: "g_vent_pharmacy_security" }); // conduit pharmacie ↔ sécurité
  open(F, "arch", "x", 40.5, 17, 7, { id: "g_hall_arch" });
  open(F, "arch", "z", 53, 8.5, 7, { id: "g_waiting_arch" });
  door(F, "z", 66, 8, { lock: "none" }, 1.4, "g_triage_door");
  door(F, "x", 59.5, 17, { lock: "none", swing: true }, 2.4, "g_waiting_er");
  door(F, "x", 73, 17, { lock: "none" }, 1.4, "g_triage_er");
  door(F, "x", 16, 17, { lock: "none", swing: true }, 2.2, "g_cafeteria_door");
  // --- anneau / cour
  open(F, "open", "x", 13.5, 20, 3, { id: "g_open_s_ww" });
  open(F, "open", "x", 28.5, 20, 3, { id: "g_open_s_w" });
  open(F, "open", "x", 51.5, 20, 3, { id: "g_open_s_e" });
  open(F, "open", "x", 28.5, 36, 3, { id: "g_open_n_w" });
  open(F, "open", "x", 51.5, 36, 3, { id: "g_open_n_e" });
  open(F, "open", "z", 15, 37.5, 3, { id: "g_open_n_ww" });
  door(F, "z", 30, 28, { lock: "none" }, 1.2, "g_court_w");
  door(F, "z", 50, 28, { lock: "none" }, 1.2, "g_court_e");
  door(F, "x", 44.5, 36, { lock: "none" }, 2.0, "g_court_n");
  windows(F, "x", 20, 33, 47, 3.5, 1.6); // couloir sud → cour
  windows(F, "z", 30, 23, 33, 10, 1.6); // couloir ouest → cour
  windows(F, "z", 50, 23, 33, 10, 1.6);
  windows(F, "x", 36, 33, 47, 14, 1.6);
  door(F, "z", 53, 18.5, { lock: "none", swing: true }, 2.4, "g_corr_er");
  door(F, "z", 53, 28, { lock: "none" }, 1.2, "g_corr_e_er");
  // --- aile ouest
  door(F, "x", 6, 17, { lock: "none", swing: true }, 1.6, "g_kitchen_cafeteria");
  door(F, "z", 12, 18.5, { lock: "none" }, 1.1, "g_kitchen_corr");
  door(F, "z", 0, 22, { lock: "chain", openFrom: { x: 1, z: 22 }, splitLabel: "Porte de livraison" }, 1.6, "g_kitchen_delivery"); // → ruelle de service
  windows(F, "z", 0, 30, 51, 6.5, 1.4);
  door(F, "z", 12, 30, { lock: "none" }, 1.0, "g_office1_door");
  door(F, "z", 12, 36, { lock: "none" }, 1.0, "g_office2_door");
  door(F, "z", 12, 42.5, { lock: "planks", openFrom: { x: 13, z: 42.5 } }, 1.0, "g_office3_door");
  door(F, "z", 12, 50, { lock: "none" }, 1.0, "g_secretariat_door");
  door(F, "x", 6, 33, { lock: "none" }, 1.0, "g_office12");
  door(F, "z", 15, 24, { lock: "none" }, 1.1, "g_consult_ww");
  door(F, "z", 27, 24, { lock: "none" }, 1.1, "g_consult_w");
  door(F, "x", 17.5, 36, { lock: "none", swing: true }, 1.6, "g_stairA_door");
  door(F, "z", 27, 32, { lock: "none" }, 1.1, "g_staff_door");
  door(F, "x", 21, 39, { lock: "none" }, 1.4, "g_lockers_n");
  door(F, "z", 15, 47, { lock: "oneWay", openFrom: { x: 16, z: 47 } }, 1.1, "g_lockers_ww"); // raccourci
  // --- bloc nord
  door(F, "x", 28.5, 39, { lock: "none" }, 1.1, "g_storage_door");
  door(F, "z", 30, 51, { lock: "none" }, 1.1, "g_storage_linen");
  door(F, "x", 32.5, 39, { lock: "none", swing: true }, 1.6, "g_stairB_door");
  open(F, "elevator", "x", 37.5, 39, 1.4, { id: "g_elev_door", top: 2.2 });
  door(F, "z", 41, 51, { lock: "none" }, 1.1, "g_linen_chapel");
  door(F, "x", 47, 39, { lock: "none" }, 2.0, "g_chapel_door");
  windows(F, "x", 54, 44, 50, 6, 1.2);
  // --- urgences
  door(F, "z", 80, 30, { lock: "none", splitLabel: "Sortie des ambulances" }, 3.0, "g_er_ambulance"); // → cour des ambulances
  windows(F, "z", 80, 21, 37, 8, 1.8);
  door(F, "x", 59.5, 39, { lock: "badgeBlue" }, 1.4, "g_er_store_door");
  door(F, "z", 53, 46, { lock: "planks", openFrom: { x: 52, z: 46 } }, 1.1, "g_chapel_erstore"); // raccourci chapelle ↔ réserve
  door(F, "x", 68.5, 39, { lock: "none", swing: true }, 1.6, "g_stairC_door");
  door(F, "x", 75.5, 39, { lock: "none" }, 1.4, "g_decon_door");
  windows(F, "z", 80, 43, 51, 8, 1.2);
}

// =============================================================================
//  ÉTAGE (U)
// =============================================================================
{
  const F: FloorId = "U";
  // --- anneau autour du vide de la cour
  room(F, "u_corr_s", [12, 17, 53, 20], "Couloir sud (étage)", "corridorU", "uS", "corridor");
  room(F, "u_corr_w", [27, 20, 30, 36], "Couloir ouest (étage)", "corridorU", "uW", "corridor");
  room(F, "u_corr_e", [50, 20, 53, 36], "Couloir est (étage)", "corridorU", "uE", "corridor");
  room(F, "u_corr_n", [15, 36, 53, 39], "Couloir nord (étage)", "corridorU", "uN", "corridor");
  room(F, "u_corr_ww", [12, 20, 15, 54], "Couloir de radiologie", "corridorU", "uW", "corridor");
  room(F, "u_corr_se", [53, 17, 65, 20], "Passage des chambres", "corridorU", "uSE", "corridor");
  room(F, "u_corr_ne", [53, 36, 65, 39], "Passage du bloc", "corridorU", "uNE", "corridor");
  room(F, "u_corr_ee", [65, 0, 68, 54], "Couloir des chambres", "corridorU", "uE", "corridor");
  // --- ouest
  room(F, "u_pedia", [0, 0, 20, 17], "Pédiatrie", "pediatrics", "uSW");
  room(F, "u_play", [0, 17, 12, 27], "Salle de jeux", "pediatrics", "uSW");
  room(F, "u_radio", [0, 27, 12, 39], "Radiologie", "radiology", "uW");
  room(F, "u_dir_sec", [0, 39, 12, 46], "Secrétariat de direction", "office", "uW");
  room(F, "u_director", [0, 46, 12, 54], "Bureau du directeur", "director", "uW");
  room(F, "u_care", [15, 20, 27, 28], "Salle de soins", "pharmacy", "uW");
  room(F, "u_stairA", [15, 28, 20, 36], "Escalier A", "stairs", "uW", "stair", { shaft: "A" });
  room(F, "u_nurse", [20, 28, 27, 36], "Poste infirmier", "nurse", "uW");
  room(F, "u_lab", [15, 39, 27, 54], "Laboratoire", "surgery", "uN");
  // --- sud : chambres + salle commune
  room(F, "u_ward", [20, 0, 53, 9], "Salle commune", "ward", "uS");
  room(F, "u_room1", [20, 9, 28, 17], "Chambre 101", "patient", "uS");
  room(F, "u_room2", [28, 9, 36, 17], "Chambre 102", "patient", "uS");
  room(F, "u_room3", [36, 9, 44, 17], "Chambre 103", "patient", "uS");
  room(F, "u_room4", [44, 9, 53, 17], "Chambre 104", "patient", "uS");
  // --- nord
  room(F, "u_storage_n", [27, 39, 30, 54], "Réserve (étage)", "storage", "uN");
  room(F, "u_stairB", [30, 39, 35, 47], "Escalier B", "stairs", "uN", "stair", { shaft: "B" });
  room(F, "u_elev", [36, 39, 39, 42], "Ascenseur", "elevator", "uN", "elevator", { shaft: "E" });
  room(F, "u_archive_u", [30, 47, 41, 54], "Salle des dossiers", "archives", "uN", "room", { surface: "tile" });
  room(F, "u_bloc_prep", [41, 39, 53, 54], "Bloc — préparation", "surgery", "uNE");
  room(F, "u_bloc_op", [53, 39, 65, 54], "Bloc opératoire", "surgery", "uNE");
  // --- est : chambres de part et d'autre du couloir
  room(F, "u_isol", [53, 0, 65, 9], "Chambre d'isolement", "patient", "uSE");
  room(F, "u_room5", [53, 9, 65, 17], "Chambre 105", "patient", "uSE");
  room(F, "u_dayroom", [53, 20, 65, 28], "Salle de séjour", "ward", "uE");
  room(F, "u_room6", [53, 28, 65, 36], "Chambre 106", "patient", "uE");
  room(F, "u_room7", [68, 0, 80, 9], "Chambre 107", "patient", "uE");
  room(F, "u_room8", [68, 9, 80, 18], "Chambre 108", "patient", "uE");
  room(F, "u_room9", [68, 18, 80, 27], "Chambre 109", "patient", "uE");
  room(F, "u_room10", [68, 27, 80, 36], "Chambre 110", "patient", "uE");
  room(F, "u_room11", [68, 36, 80, 45], "Chambre 111", "patient", "uE");
  room(F, "u_room12", [68, 45, 80, 54], "Chambre 112", "patient", "uE");

  // --- anneau
  open(F, "open", "x", 13.5, 20, 3);
  open(F, "open", "x", 28.5, 20, 3);
  open(F, "open", "x", 51.5, 20, 3);
  open(F, "open", "x", 28.5, 36, 3);
  open(F, "open", "x", 51.5, 36, 3);
  open(F, "open", "z", 15, 37.5, 3);
  open(F, "open", "z", 53, 18.5, 3);
  open(F, "open", "z", 53, 37.5, 3);
  open(F, "open", "z", 65, 18.5, 3);
  open(F, "open", "z", 65, 37.5, 3);
  windows(F, "x", 20, 32.5, 47.5, 3, 2.2); // vitrages sur le vide de la cour
  windows(F, "z", 30, 22.5, 33.5, 3.5, 2.2);
  windows(F, "z", 50, 22.5, 33.5, 3.5, 2.2, [1]);
  windows(F, "x", 36, 32.5, 47.5, 3, 2.2);
  // --- ouest
  windows(F, "x", 0, 3, 17, 4.5);
  windows(F, "z", 0, 4, 13, 4.5);
  windows(F, "z", 0, 21, 25, 4);
  windows(F, "z", 0, 42.5, 50, 7.5, 1.6);
  door(F, "x", 16, 17, { lock: "none" }, 1.4, "u_pedia_door");
  door(F, "x", 6, 17, { lock: "none" }, 1.2, "u_pedia_play");
  door(F, "z", 12, 22, { lock: "none" }, 1.1, "u_play_door");
  door(F, "z", 12, 33, { lock: "badgeGreen", splitLabel: "Radiologie" }, 1.4, "u_radio_door");
  door(F, "z", 12, 42.5, { lock: "none" }, 1.1, "u_dirsec_door");
  door(F, "x", 6, 46, { lock: "badgeRed", splitLabel: "Bureau du directeur" }, 1.1, "u_director_door");
  door(F, "z", 15, 24, { lock: "none" }, 1.1, "u_care_door");
  door(F, "z", 27, 24, { lock: "none" }, 1.1, "u_care_w");
  door(F, "x", 17.5, 36, { lock: "none", swing: true }, 1.6, "u_stairA_door");
  door(F, "z", 27, 32, { lock: "none" }, 1.1, "u_nurse_door");
  door(F, "x", 21, 39, { lock: "none" }, 1.2, "u_lab_door");
  // --- sud
  door(F, "z", 20, 4.5, { lock: "none", swing: true }, 1.8, "u_pedia_ward");
  door(F, "z", 53, 4.5, { lock: "oneWay", openFrom: { x: 50, z: 4.5 } }, 1.2, "u_ward_isol"); // raccourci
  door(F, "x", 24, 17, { lock: "none" }, 1.1, "u_room1_door");
  door(F, "x", 32, 17, { lock: "none" }, 1.1, "u_room2_door");
  door(F, "x", 40, 17, { lock: "none" }, 1.1, "u_room3_door");
  door(F, "x", 48.5, 17, { lock: "none" }, 1.1, "u_room4_door");
  door(F, "x", 32, 9, { lock: "none" }, 1.1, "u_room2_ward");
  windows(F, "x", 0, 23, 50, 4.5, 1.6);
  // --- nord
  door(F, "x", 28.5, 39, { lock: "none" }, 1.1, "u_storage_door");
  door(F, "z", 30, 51, { lock: "none" }, 1.1, "u_storage_archive");
  door(F, "x", 32.5, 39, { lock: "none", swing: true }, 1.6, "u_stairB_door");
  open(F, "elevator", "x", 37.5, 39, 1.4, { id: "u_elev_door", top: 2.2 });
  door(F, "x", 47, 39, { lock: "badgeBlue", splitLabel: "Bloc opératoire" }, 2.0, "u_bloc_door");
  door(F, "z", 53, 46.5, { lock: "none", swing: true }, 1.8, "u_bloc_inner");
  door(F, "z", 65, 46.5, { lock: "oneWay", openFrom: { x: 64, z: 46.5 } }, 1.8, "u_bloc_ee"); // sortie de secours du bloc → couloir des chambres
  windows(F, "x", 54, 44, 60, 8, 1.4);
  // --- est
  windows(F, "x", 0, 59, 59, 1, 2);
  door(F, "z", 65, 4.5, { lock: "none" }, 1.1, "u_isol_door");
  door(F, "z", 65, 13, { lock: "none" }, 1.1, "u_room5_door");
  door(F, "z", 65, 24, { lock: "none" }, 1.4, "u_dayroom_door");
  door(F, "z", 53, 24, { lock: "none" }, 1.1, "u_dayroom_w");
  door(F, "z", 65, 32, { lock: "none" }, 1.1, "u_room6_door");
  door(F, "z", 68, 4.5, { lock: "none" }, 1.1, "u_room7_door");
  door(F, "z", 68, 13.5, { lock: "none" }, 1.1, "u_room8_door");
  door(F, "z", 68, 22.5, { lock: "none" }, 1.1, "u_room9_door");
  door(F, "z", 68, 31.5, { lock: "none" }, 1.1, "u_room10_door");
  door(F, "z", 68, 40.5, { lock: "none" }, 1.1, "u_room11_door");
  door(F, "z", 68, 49.5, { lock: "none" }, 1.1, "u_room12_door");
  windows(F, "z", 80, 4.5, 49.5, 9, 1.8);
  windows(F, "x", 0, 74, 74, 1, 2);
  windows(F, "x", 54, 74, 74, 1, 2);
}

// =============================================================================
//  SOUS-SOL (B)
// =============================================================================
{
  const F: FloorId = "B";
  room(F, "b_corr", [12, 37, 80, 39], "Couloir technique", "techcorr", "bN", "corridor");
  room(F, "b_corr2", [34, 22, 36, 37], "Galerie technique", "techcorr", "bS", "corridor");
  room(F, "b_boiler", [12, 39, 30, 54], "Chaufferie", "boiler", "bW");
  room(F, "b_stairB", [30, 39, 35, 47], "Escalier B", "stairs", "bN", "stair", { shaft: "B" });
  room(F, "b_elev", [36, 39, 39, 42], "Ascenseur", "elevator", "bN", "elevator", { shaft: "E" });
  room(F, "b_pump", [30, 47, 41, 54], "Salle des pompes", "boiler", "bN");
  room(F, "b_morgue", [41, 39, 53, 54], "Morgue", "morgue", "bN");
  room(F, "b_legist", [53, 39, 59, 47], "Bureau du légiste", "morgue", "bE");
  room(F, "b_cold", [53, 47, 59, 54], "Chambre froide", "morgue", "bE");
  room(F, "b_laundry", [59, 39, 66, 54], "Buanderie", "laundry", "bE");
  room(F, "b_stairC", [66, 39, 71, 47], "Escalier C (service)", "stairs", "bE", "stair", { shaft: "C" });
  room(F, "b_electric", [71, 39, 80, 54], "Local électrique", "electric", "bE");
  room(F, "b_archives", [12, 22, 34, 37], "Archives", "archives", "bS");
  room(F, "b_pharma", [36, 22, 50, 37], "Pharmacie centrale", "pharmacy", "bS");
  room(F, "b_workshop", [50, 22, 66, 37], "Atelier", "techcorr", "bS");
  room(F, "b_generator", [66, 22, 80, 37], "Groupe électrogène", "electric", "bS");

  open(F, "open", "x", 35, 37, 2);
  door(F, "x", 21, 39, { lock: "none" }, 1.4, "b_boiler_door");
  door(F, "x", 32.5, 39, { lock: "none", swing: true }, 1.6, "b_stairB_door");
  open(F, "elevator", "x", 37.5, 39, 1.4, { id: "b_elev_door", top: 2.2 });
  door(F, "z", 30, 50.5, { lock: "none" }, 1.1, "b_boiler_pump");
  door(F, "x", 47, 39, { lock: "morgueKey", splitLabel: "Morgue" }, 1.8, "b_morgue_door");
  door(F, "z", 53, 43, { lock: "none" }, 1.1, "b_morgue_legist");
  door(F, "z", 53, 50.5, { lock: "none" }, 1.4, "b_morgue_cold");
  door(F, "x", 62.5, 39, { lock: "none" }, 1.4, "b_laundry_door");
  open(F, "vent", "z", 59, 44, 0.9, { id: "b_vent_legist_laundry" });
  door(F, "x", 68.5, 39, { lock: "none", swing: true }, 1.6, "b_stairC_door");
  door(F, "x", 75.5, 39, { lock: "planks", openFrom: { x: 75.5, z: 38 }, splitLabel: "Local électrique" }, 1.4, "b_electric_door");
  // près de la porte de l'escalier : plus loin, le conduit débouchait sous la volée (inaccessible)
  open(F, "vent", "z", 71, 39.7, 0.9, { id: "b_vent_stairC_electric" });
  door(F, "x", 24, 37, { lock: "badgeGreen", splitLabel: "Archives" }, 1.4, "b_archives_door");
  door(F, "z", 34, 26, { lock: "oneWay", openFrom: { x: 33, z: 26 } }, 1.1, "b_archives_back");
  door(F, "z", 36, 30, { lock: "none" }, 1.4, "b_pharma_door");
  door(F, "x", 58, 37, { lock: "none" }, 1.8, "b_workshop_door");
  door(F, "x", 73, 37, { lock: "none" }, 1.4, "b_generator_door");
  door(F, "z", 66, 30, { lock: "none" }, 1.1, "b_workshop_generator");
}

// =============================================================================
//  TOIT (R)
// =============================================================================
{
  const F: FloorId = "R";
  room(F, "r_elev", [36, 39, 39, 42], "Ascenseur", "elevator", "roof", "elevator", { shaft: "E" });
  room(F, "r_machine", [33, 42, 43, 49], "Machinerie", "roofroom", "roof", "room", { surface: "metal" });
  open(F, "elevator", "x", 37.5, 42, 1.4, { id: "r_elev_door", top: 2.2 });
  door(F, "z", 43, 45.5, { lock: "planks", openFrom: { x: 42, z: 45.5 }, splitLabel: "Porte du toit" }, 1.2, "r_roof_door");
}

const stairs: StairDef[] = [
  { id: "A", rect: [15, 28, 20, 36], floors: ["G", "U"], entry: "z1" },
  { id: "B", rect: [30, 39, 35, 47], floors: ["B", "G", "U"], entry: "z0" },
  { id: "C", rect: [66, 39, 71, 47], floors: ["B", "G"], entry: "z0" },
];

const elevators: ElevatorDef[] = [
  { id: "E", rect: [36, 39, 39, 42], floors: ["B", "G", "U", "R"], doorSides: { B: "z0", G: "z0", U: "z0", R: "z1" } },
];

const barriers: BarrierDef[] = [
  { id: "bar_g_corr_w", floor: "G", area: [27.2, 26.2, 29.8, 27.4], kind: "gurneys" },
  { id: "bar_u_corr_ee", floor: "U", area: [65.2, 29.4, 67.8, 30.6], kind: "gurneys" },
  { id: "bar_b_corr", floor: "B", area: [49.4, 37.2, 50.6, 38.8], kind: "debris" },
  { id: "bar_g_court", floor: "G", area: [39.3, 20.1, 40.7, 35.9], kind: "tree" },
];

export const HOSPITAL: HospitalLayout = {
  floors,
  rooms,
  openings,
  stairs,
  elevators,
  barriers,
  spawn: { x: 40.5, y: 0, z: 3.2, yaw: 0 },
};

export function floorDef(id: FloorId): FloorDef {
  const f = floors.find((x) => x.id === id);
  if (!f) throw new Error(`niveau inconnu ${id}`);
  return f;
}
