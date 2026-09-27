import type { ItemId } from "./items";

/**
 * Points de spawn candidats. Format : « pièce:surface#n »
 *  - surface : desk, table, bed, shelf, workbench, trolley, pew, counter, autopsy, op_table, floor, any
 *  - #n : désambiguïse deux candidats sur la même surface
 *  - « safe_xxx » : à l'intérieur d'un coffre
 * La position exacte est résolue au chargement (seed de décor fixe) ; la seed de run choisit
 * parmi les candidats (3 à 5 par objet).
 */
export const ITEM_CANDIDATES: Record<ItemId, string[]> = {
  badgeRed: ["safe_security", "b_legist:desk", "u_nurse:desk", "u_bloc_prep:any#2", "b_pharma:desk#2"],
  badgeBlue: ["g_triage:desk", "u_room6:bed", "g_staff:desk", "b_laundry:any", "u_care:desk"],
  badgeGreen: ["g_lockers:pew", "g_office1:desk", "u_ward:bed", "g_chapel:desk", "g_kitchen:workbench"],
  morgueKey: ["b_boiler:workbench", "g_decon:any", "u_lab:any", "g_er_store:shelf", "u_radio:desk"],
  crowbar: ["b_workshop:workbench", "g_storage_n:shelf", "b_pump:floor", "g_kitchen:floor", "u_storage_n:shelf"],
  boltCutter: ["b_generator:workbench", "b_workshop:floor", "g_er_store:floor", "u_archive_u:shelf", "g_linen:any"],
  fuse: ["b_archives:shelf", "b_pharma:desk", "u_radio:floor", "b_morgue:autopsy", "u_bloc_op:op_table", "safe_morgue", "safe_archives"],
  battery: ["b_generator:floor", "b_workshop:workbench#2", "g_er_store:floor#2", "b_laundry:floor", "u_storage_n:shelf#2"],
  ambulanceKeys: ["u_room8:bed", "safe_director", "g_security:desk", "b_legist:desk#2", "u_bloc_op:op_table#2", "safe_archives"],
  safeKey: ["g_office3:desk", "u_play:floor", "g_chapel:pew", "u_dir_sec:desk"],
};

/** Codes à 4 chiffres tirés par la seed. */
export type CodeId = "gate" | "safe_security" | "safe_director" | "safe_morgue";

export const CODE_LABELS: Record<CodeId, string> = {
  gate: "Portail",
  safe_security: "Coffre sécurité",
  safe_director: "Coffre direction",
  safe_morgue: "Coffre légiste",
};

export type SafeLock = "code" | "key";

export interface SafeDef {
  id: string;
  room: string;
  x: number;
  z: number;
  /** orientation de la face avant */
  yaw: number;
  lock: SafeLock;
  /** pour les coffres à code : code à composer */
  code?: CodeId;
  label: string;
}

export const SAFES: SafeDef[] = [
  { id: "safe_security", room: "g_security", x: 20.55, z: 5.2, yaw: Math.PI / 2, lock: "code", code: "safe_security", label: "Coffre du poste de sécurité" },
  { id: "safe_director", room: "u_director", x: 3.2, z: 53.45, yaw: Math.PI, lock: "code", code: "safe_director", label: "Coffre du directeur" },
  { id: "safe_morgue", room: "b_legist", x: 55.2, z: 46.45, yaw: Math.PI, lock: "code", code: "safe_morgue", label: "Coffre du légiste" },
  { id: "safe_archives", room: "b_archives", x: 12.55, z: 30, yaw: Math.PI / 2, lock: "key", label: "Coffre à clé des archives" },
];

export interface CodeNoteDef {
  id: string;
  /** code révélé (entier ou moitié) */
  code: CodeId;
  /** partie révélée : tout le code, ou les 2 premiers (0) / 2 derniers (1) chiffres */
  part: "all" | 0 | 1;
  candidates: string[];
  /** texte ; {digits} est remplacé par les chiffres révélés (« 82•• ») */
  text: string;
  author: string;
}

export const CODE_NOTES: CodeNoteDef[] = [
  {
    id: "note_gate_a",
    code: "gate",
    part: 0,
    candidates: ["g_security:desk#2", "u_radio:desk#2", "g_office1:desk#2"],
    author: "Service technique",
    text: "Nouveau code du boîtier du portail principal (badge ROUGE obligatoire).\nPar sécurité, je l'ai coupé en deux. Début :\n\n{digits}\n\nLa suite est chez le Dr Vasseur.",
  },
  {
    id: "note_gate_b",
    code: "gate",
    part: 1,
    candidates: ["b_legist:desk#3", "u_lab:any#3", "b_archives:shelf#2", "u_dir_sec:desk#2"],
    author: "Dr L. Vasseur",
    text: "Pour le portail, les deux derniers chiffres :\n\n{digits}\n\nDétruisez ce papier. Et ne sortez plus après 22 h.",
  },
  {
    id: "note_safe_security",
    code: "safe_security",
    part: "all",
    candidates: ["g_staff:desk#2", "g_office2:desk#2", "u_nurse:desk#2"],
    author: "M. Aubert, agent de nuit",
    text: "Si tu reprends la garde : le coffre du poste, c'est {digits}.\nEt arrête de laisser la radio allumée. On entend des pas au-dessus depuis trois nuits.",
  },
  {
    id: "note_safe_director",
    code: "safe_director",
    part: "all",
    candidates: ["u_dir_sec:desk#3", "g_secretariat:desk", "u_lab:any#2"],
    author: "Secrétariat de direction",
    text: "Pour Monsieur le Directeur — combinaison du coffre : {digits}.\nLe Dr Morel a encore demandé l'accès au bloc cette nuit. J'ai refusé.",
  },
  {
    id: "note_safe_morgue",
    code: "safe_morgue",
    part: "all",
    candidates: ["b_boiler:workbench#2", "u_bloc_prep:any", "g_decon:any#2"],
    author: "Dr L. Vasseur, légiste",
    text: "Code du coffre du bureau : {digits}.\nTrois corps manquent à l'inventaire. Les tiroirs 4 et 7 ont été ouverts DE L'INTÉRIEUR.",
  },
];

/** Chiffres révélés par une note (les autres remplacés par « • »). */
export function revealed(code: string, part: CodeNoteDef["part"]): string {
  if (part === "all") return code;
  return part === 0 ? code.slice(0, 2) + "••" : "••" + code.slice(2);
}

/** Notes d'ambiance (fixes, non liées à la seed). */
export const LORE_NOTES: Array<{ id: string; spot: string; author: string; text: string }> = [
  {
    id: "lore_1",
    spot: "g_er:desk#3",
    author: "Infirmière de garde",
    text: "Nuit du 14 : le Dr Morel est revenu au bloc alors qu'il est suspendu. Il portait encore sa blouse. Personne ne l'a vu repartir.",
  },
  {
    id: "lore_2",
    spot: "u_ward:bed#2",
    author: "Patient, chambre commune",
    text: "Il passe la nuit entre les lits. Il ne marche pas comme un homme. Si on dort, il ne s'arrête pas. Alors je ne dors plus.",
  },
  {
    id: "lore_3",
    spot: "b_morgue:autopsy#2",
    author: "Registre de la morgue",
    text: "Fermeture administrative de l'établissement. Tous les corps ont été transférés.\n(Quelqu'un a rajouté au stylo : « PAS TOUS ».)",
  },
  {
    id: "lore_4",
    spot: "u_pedia:floor",
    author: "Dessin d'enfant, au dos",
    text: "le monsieur au masque il fait des opérations même quand on a pas mal",
  },
  {
    id: "lore_5",
    spot: "u_director:desk",
    author: "Lettre non envoyée",
    text: "Je ferme Saint-Aubin demain. Les portes seront verrouillées, le courant coupé. Ce qui reste à l'intérieur y restera.",
  },
];
