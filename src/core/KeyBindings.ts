/**
 * Actions de jeu et touches associées.
 * Les touches sont stockées par *position physique* (`KeyboardEvent.code`) : la touche
 * « avancer » par défaut est donc Z sur un clavier AZERTY et W sur un QWERTY.
 * L'option AZERTY/QWERTY sert à afficher les bons libellés (et à restaurer les défauts).
 */

export type Action =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "sprint"
  | "crouch"
  | "interact"
  | "flashlight"
  | "drop"
  | "slot1"
  | "slot2"
  | "restart"
  | "skip";

export type KeyboardLayout = "azerty" | "qwerty";

export const ACTIONS: ReadonlyArray<{ id: Action; label: string }> = [
  { id: "forward", label: "Avancer" },
  { id: "back", label: "Reculer" },
  { id: "left", label: "Gauche" },
  { id: "right", label: "Droite" },
  { id: "sprint", label: "Sprint" },
  { id: "crouch", label: "S'accroupir" },
  { id: "interact", label: "Interagir" },
  { id: "flashlight", label: "Lampe torche" },
  { id: "drop", label: "Poser l'objet" },
  { id: "slot1", label: "Emplacement 1" },
  { id: "slot2", label: "Emplacement 2" },
  { id: "restart", label: "Restart (maintenir)" },
  { id: "skip", label: "Passer (maintenir)" },
];

/** Deux touches par action : [principale, secondaire] (chaîne vide = aucune). */
export type Bindings = Record<Action, [string, string]>;

export function defaultBindings(): Bindings {
  return {
    forward: ["KeyW", "ArrowUp"],
    back: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", "ShiftRight"],
    crouch: ["KeyC", "ControlLeft"],
    interact: ["KeyE", "Mouse0"],
    flashlight: ["KeyF", "Mouse2"],
    drop: ["KeyG", ""],
    slot1: ["Digit1", ""],
    slot2: ["Digit2", ""],
    restart: ["KeyR", ""],
    skip: ["Space", "Enter"],
  };
}

const AZERTY_LABELS: Record<string, string> = {
  KeyQ: "A",
  KeyW: "Z",
  KeyA: "Q",
  KeyZ: "W",
  Semicolon: "M",
  KeyM: ",",
  Comma: ";",
  Period: ":",
  Slash: "!",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Digit0: "0",
  BracketLeft: "^",
  BracketRight: "$",
  Quote: "ù",
  Backquote: "²",
};

const SPECIAL_LABELS: Record<string, string> = {
  ShiftLeft: "Maj G",
  ShiftRight: "Maj D",
  ControlLeft: "Ctrl G",
  ControlRight: "Ctrl D",
  AltLeft: "Alt",
  AltRight: "Alt Gr",
  Space: "Espace",
  Enter: "Entrée",
  Tab: "Tab",
  CapsLock: "Verr. Maj",
  Backspace: "Retour",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Mouse0: "Clic G",
  Mouse1: "Clic milieu",
  Mouse2: "Clic D",
  Mouse3: "Souris 4",
  Mouse4: "Souris 5",
  Escape: "Échap",
};

/** Libellés récupérés via l'API Keyboard Map (Chromium) quand elle est disponible. */
let layoutMap: Map<string, string> | null = null;

export async function detectKeyboardLayout(): Promise<KeyboardLayout | null> {
  const nav = navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
  };
  try {
    if (nav.keyboard?.getLayoutMap) {
      layoutMap = await nav.keyboard.getLayoutMap();
      const w = layoutMap.get("KeyW");
      if (w === "z") return "azerty";
      if (w === "w") return "qwerty";
    }
  } catch {
    /* API refusée : on reste sur le réglage manuel */
  }
  return null;
}

export function keyLabel(code: string, layout: KeyboardLayout): string {
  if (!code) return "—";
  const special = SPECIAL_LABELS[code];
  if (special) return special;
  if (layout === "azerty") {
    const az = AZERTY_LABELS[code];
    if (az) return az;
  }
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Pavé " + code.slice(6);
  const fromMap = layoutMap?.get(code);
  if (fromMap) return fromMap.toUpperCase();
  return code;
}
