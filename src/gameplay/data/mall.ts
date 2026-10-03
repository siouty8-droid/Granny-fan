import type { ExitId, MapRules } from "./rules";

/**
 * Règles du centre commercial « Les Galeries du Val ».
 *
 * Trois sorties :
 * - portes principales : couper la chaîne des portes vitrées (pince) et relever la grille de
 *   sécurité extérieure avec le code du boîtier (deux moitiés : PC sécurité / direction…) ;
 * - quai de livraison : rétablir le courant (2 fusibles, local électrique), relever le rideau
 *   métallique, démarrer le camion (clés du camion) ;
 * - tunnel du métro : entrer dans la station murée (planches → pied-de-biche), remettre en route
 *   la draisine (manivelle + batterie) et partir dans le tunnel.
 */
export const MALL_RULES: MapRules = {
  id: "mall",
  start: "g_hall",
  // ordre stable (tirage de la seed)
  items: {
    badgeBlue: 1,
    badgeGreen: 1,
    badgeRed: 1,
    crowbar: 1,
    boltCutter: 1,
    fuse: 2,
    battery: 1,
    truckKeys: 1,
    crank: 1,
    safeKey: 1,
  },
  hints: {
    badgeBlue: "Ouvre le PC sécurité",
    badgeGreen: "Cabine de projection · local électrique",
    badgeRed: "Bureau du directeur",
    crowbar: "Arrache les planches (station de métro…)",
    boltCutter: "Coupe la chaîne des portes principales",
    fuse: "Tableau du local électrique (×2)",
    battery: "Pour la draisine du métro",
  },
  itemCandidates: {
    badgeBlue: ["g_infirm:desk", "g_staff:desk", "u_meeting:desk", "g_shop5:checkout", "u_food:table", "u_burger:counter"],
    badgeGreen: ["u_pc:desk#2", "g_shop1:checkout", "u_compta:desk", "g_shop7:checkout", "u_lockers:pew", "safe_jewel"],
    badgeRed: ["safe_pc", "u_projection:shelf#2", "g_shop3:checkout", "u_archives:shelf", "g_shop9:shelf", "b_tickets:counter"],
    crowbar: ["b_res1:shelf#2", "b_workshop:floor", "g_res_shops:shelf", "u_cold:shelf", "g_res_central:shelf"],
    boltCutter: ["b_workshop:workbench", "g_menage:shelf", "b_res1:shelf", "u_cine_tech:floor", "g_trash:floor", "safe_pc"],
    fuse: ["u_projection:shelf", "b_machines:workbench", "u_servers:floor", "g_shop10:checkout", "b_pumps:workbench", "safe_jewel", "safe_direction", "g_electro:any"],
    battery: ["g_electro:any#2", "b_dock:pallet", "b_res2:floor", "g_hyper:checkout", "b_tunnel:floor", "u_res_cine:shelf"],
    truckKeys: ["safe_direction", "u_director:desk", "g_accueil:desk", "b_dock:shelf", "u_pc:desk", "safe_pc"],
    crank: ["b_tickets:counter#2", "b_platform:floor", "b_machines:floor", "b_workshop:workbench#2", "u_cine_tech:floor#2"],
    safeKey: ["g_shop11:checkout", "u_compta:desk#2", "g_shop2:shelf", "u_wok:counter", "g_res_primo:shelf", "b_tickets:counter#3"],
  },
  codeLabels: {
    grille: "Grille de l'entrée",
    safe_pc: "Coffre du PC sécurité",
    safe_direction: "Coffre de la direction",
  },
  exitCode: "grille",
  exitCodePlace: "Boîtier de la grille (hall)",
  safes: [
    { id: "safe_pc", room: "u_pc", x: 70, z: 55.45, yaw: Math.PI, lock: "code", code: "safe_pc", label: "Coffre du PC sécurité" },
    { id: "safe_direction", room: "u_director", x: 14.55, z: 51.5, yaw: Math.PI / 2, lock: "code", code: "safe_direction", label: "Coffre du directeur" },
    { id: "safe_jewel", room: "g_shop8", x: 29, z: 55.45, yaw: Math.PI, lock: "key", label: "Coffre de la bijouterie" },
  ],
  codeNotes: [
    {
      id: "note_grille_a",
      code: "grille",
      part: 0,
      candidates: ["u_pc:desk#3", "g_accueil:desk#2", "u_compta:desk#3"],
      author: "PC sécurité — consignes",
      text: "Grille extérieure de l'entrée : commande au boîtier du hall.\nNouveau code depuis l'effraction. Début :\n\n{digits}\n\nLa fin est chez M. Garnier (direction). Les portes vitrées restent enchaînées la nuit.",
    },
    {
      id: "note_grille_b",
      code: "grille",
      part: 1,
      candidates: ["u_director:desk#2", "u_archives:shelf#2", "b_workshop:workbench#3", "g_staff:desk#2"],
      author: "P. Garnier, directeur du centre",
      text: "Pour la grille, fin du code :\n\n{digits}\n\nPersonne ne rouvre avant la fin de l'enquête sur la ligne 7. Personne.",
    },
    {
      id: "note_safe_pc",
      code: "safe_pc",
      part: "all",
      candidates: ["g_staff:table", "u_lockers:pew#2", "u_meeting:desk#2"],
      author: "Rondes de nuit",
      text: "Coffre du PC : {digits}.\nSi tu entends une cloche sous le parking, tu ne descends pas. Tu remontes au PC et tu fermes à clé.",
    },
    {
      id: "note_safe_direction",
      code: "safe_direction",
      part: "all",
      candidates: ["u_compta:desk#4", "u_archives:shelf#3", "g_accueil:desk#3"],
      author: "Comptabilité",
      text: "Pour M. Garnier — combinaison du coffre : {digits}.\nLes clés du camion de livraison y sont rangées depuis la fermeture.",
    },
  ],
  loreNotes: [
    {
      id: "mall_lore_1",
      spot: "b_tickets:counter#4",
      author: "Avis aux voyageurs",
      text: "Station Val-Saint-Aubin fermée jusqu'à nouvel ordre suite à l'accident de la rame 7-14.\nLe conducteur n'a pas été retrouvé.",
    },
    {
      id: "mall_lore_2",
      spot: "u_pc:desk#4",
      author: "Main courante — PC sécurité",
      text: "02 h 10 : lumière sur la caméra 12 (quai du métro). Une lanterne. Elle avance le long de la voie.\n02 h 14 : la lanterne est dans le parking.\n02 h 15 : elle est dans l'escalator. Je coupe les écrans.",
    },
    {
      id: "mall_lore_3",
      spot: "g_shop1:checkout#2",
      author: "Mot d'une vendeuse",
      text: "Les mannequins ont encore bougé cette nuit. Ils regardent tous vers l'escalator. Je ne fais plus la fermeture seule.",
    },
    {
      id: "mall_lore_4",
      spot: "b_dock:shelf#2",
      author: "Bon de livraison froissé",
      text: "Livraison annulée. Le chauffeur refuse de descendre au quai : « on entend un sifflet de train, alors qu'il n'y a plus de trains ».",
    },
  ],
  dossierSpots: [],
  fusePanel: { room: "b_elec", x: 62.12, z: 48, yaw: Math.PI / 2 },
  powerToast: "Le courant revient. Le rideau du quai de livraison répond.",
  guardExempt: ["b_elec"],
  exits: (s) => {
    const out: ExitId[] = [];
    if (s.reach("ext") && s.codeKnown("grille")) out.push("doors");
    if (s.reach("b_dock") && s.power && s.has("truckKeys")) out.push("truck");
    if (s.reach("b_tunnel") && s.has("crank") && s.has("battery")) out.push("metro");
    return out;
  },
  exitCount: 3,
};
