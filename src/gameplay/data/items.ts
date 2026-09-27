/** Objets ramassables du jeu. */
export type ItemId =
  | "badgeBlue"
  | "badgeGreen"
  | "badgeRed"
  | "morgueKey"
  | "crowbar"
  | "boltCutter"
  | "fuse"
  | "battery"
  | "ambulanceKeys"
  | "safeKey";

export interface ItemDef {
  id: ItemId;
  name: string;
  /** courte description (infobulle / HUD) */
  hint: string;
  /** couleur d'accent (icône, lueur) */
  color: string;
  /** nombre d'exemplaires dans le monde */
  count: number;
  /** consommé à l'utilisation */
  consumable: boolean;
  /** exemplaires empilables dans un même emplacement d'inventaire */
  stack: number;
  /** son de ramassage (phase audio) */
  sound: "card" | "keys" | "metal" | "heavy" | "small";
}

export const ITEMS: Record<ItemId, ItemDef> = {
  badgeBlue: { id: "badgeBlue", name: "Badge bleu", hint: "Ouvre les portes à lecteur bleu", color: "#3a7bff", count: 1, consumable: false, stack: 1, sound: "card" },
  badgeGreen: { id: "badgeGreen", name: "Badge vert", hint: "Ouvre les portes à lecteur vert", color: "#3fd46a", count: 1, consumable: false, stack: 1, sound: "card" },
  badgeRed: { id: "badgeRed", name: "Badge rouge", hint: "Direction · boîtier du portail", color: "#ff3a3a", count: 1, consumable: false, stack: 1, sound: "card" },
  morgueKey: { id: "morgueKey", name: "Clé de la morgue", hint: "Ouvre la morgue (sous-sol)", color: "#c9a45c", count: 1, consumable: false, stack: 1, sound: "keys" },
  crowbar: { id: "crowbar", name: "Pied-de-biche", hint: "Arrache les planches clouées", color: "#d84a2a", count: 1, consumable: false, stack: 1, sound: "metal" },
  boltCutter: { id: "boltCutter", name: "Pince coupante", hint: "Coupe chaînes et cadenas", color: "#e0a020", count: 1, consumable: false, stack: 1, sound: "metal" },
  fuse: { id: "fuse", name: "Fusible", hint: "Tableau du local électrique (×2)", color: "#f4e04a", count: 2, consumable: true, stack: 2, sound: "small" },
  battery: { id: "battery", name: "Batterie", hint: "Pour démarrer l'ambulance", color: "#9ad04a", count: 1, consumable: true, stack: 1, sound: "heavy" },
  ambulanceKeys: { id: "ambulanceKeys", name: "Clés de l'ambulance", hint: "Contact de l'ambulance", color: "#ff5a5a", count: 1, consumable: false, stack: 1, sound: "keys" },
  safeKey: { id: "safeKey", name: "Petite clé", hint: "Ouvre le coffre à clé", color: "#d8c070", count: 1, consumable: false, stack: 1, sound: "keys" },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
