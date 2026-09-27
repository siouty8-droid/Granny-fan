import type { Action } from "../core/KeyBindings";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { Player } from "../player/Player";
import type { RunManager } from "../run/RunManager";
import type { HUD } from "../ui/HUD";
import type { PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import type { ItemId } from "./data/items";
import type { Inventory } from "./Inventory";
import type { NoiseBus } from "./Noise";

/** Services partagés par les systèmes de gameplay (implémenté par `Gameplay`). */
export interface GameContext {
  readonly world: World;
  readonly collision: CollisionWorld;
  readonly props: PropSystem;
  readonly player: Player;
  readonly inventory: Inventory;
  readonly noise: NoiseBus;
  readonly run: RunManager;
  readonly hud: HUD;
  /** horodatage de la frame courante (performance.now) */
  readonly now: number;
  /** temps de jeu écoulé depuis le début de la run (s, animations) */
  readonly time: number;
  /** codes connus (notes lues) : id de note → code */
  readonly knownCodes: Map<string, string>;
  /** courant rétabli */
  readonly power: boolean;
  toast(text: string, seconds?: number): void;
  split(id: string, label: string): void;
  keyLabel(action: Action): string;
  itemName(id: ItemId): string;
  /** sortie franchie : arrêt du chrono à cette frame */
  finish(exitId: string, label: string): void;
}
