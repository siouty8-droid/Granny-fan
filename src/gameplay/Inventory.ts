import { CONFIG } from "../config";
import { Emitter } from "../core/Events";
import { ITEMS, type ItemId } from "./data/items";

export interface Slot {
  item: ItemId;
  count: number;
}

interface InventoryEvents {
  change: void;
}

/** Inventaire à emplacements limités (2 par défaut), sélection, empilement des fusibles. */
export class Inventory extends Emitter<InventoryEvents> {
  readonly slots: Array<Slot | null> = new Array(CONFIG.inventory.slots).fill(null);
  selected = 0;

  reset(): void {
    this.slots.fill(null);
    this.selected = 0;
    this.emit("change", undefined);
  }

  count(item: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  has(item: ItemId): boolean {
    return this.count(item) > 0;
  }

  /** Emplacement pouvant recevoir cet objet (pile existante ou emplacement vide), -1 sinon. */
  slotFor(item: ItemId): number {
    const max = ITEMS[item].stack;
    const i = this.slots.findIndex((s) => s !== null && s.item === item && s.count < max);
    if (i >= 0) return i;
    if (this.slots[this.selected] === null) return this.selected;
    return this.slots.findIndex((s) => s === null);
  }

  get full(): boolean {
    return this.slots.every((s) => s !== null);
  }

  add(item: ItemId): boolean {
    const i = this.slotFor(item);
    if (i < 0) return false;
    const s = this.slots[i];
    if (s) s.count++;
    else this.slots[i] = { item, count: 1 };
    this.selected = i;
    this.emit("change", undefined);
    return true;
  }

  /** Retire un exemplaire (objet consommé). */
  remove(item: ItemId, n = 1): boolean {
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      const s = this.slots[i];
      if (!s || s.item !== item) continue;
      const k = Math.min(n, s.count);
      s.count -= k;
      n -= k;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.emit("change", undefined);
    return n === 0;
  }

  /** Vide l'emplacement sélectionné (lâcher / échanger) et renvoie son contenu. */
  takeSelected(): Slot | null {
    const s = this.slots[this.selected] ?? null;
    if (!s) return null;
    this.slots[this.selected] = null;
    this.emit("change", undefined);
    return s;
  }

  /** Retire UN exemplaire de l'emplacement sélectionné (lâcher un fusible d'une pile). */
  takeOneSelected(): ItemId | null {
    const s = this.slots[this.selected];
    if (!s) return null;
    s.count--;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.emit("change", undefined);
    return s.item;
  }

  select(i: number): void {
    if (i < 0 || i >= this.slots.length || i === this.selected) return;
    this.selected = i;
    this.emit("change", undefined);
  }

  cycle(dir: number): void {
    const n = this.slots.length;
    this.select((((this.selected + dir) % n) + n) % n);
  }
}
