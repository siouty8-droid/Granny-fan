/**
 * Générateur pseudo-aléatoire déterministe (sfc32) initialisé par un hash de chaîne (cyrb128).
 * Tout l'aléatoire *de gameplay* passe par une Rng dérivée de la seed de la run.
 */

/** Hash 128 bits d'une chaîne → 4 entiers 32 bits. */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    [this.a, this.b, this.c, this.d] = cyrb128(seed);
    // chauffe du générateur
    for (let i = 0; i < 15; i++) this.next();
  }

  /** Flottant dans [0, 1). */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier dans [min, max] (inclus). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: ReadonlyArray<T>): T {
    if (arr.length === 0) throw new Error("Rng.pick sur tableau vide");
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = t;
    }
    return arr;
  }

  /** Sous-flux indépendant et stable (ex. « items », « codes », « ai »). */
  fork(label: string): Rng {
    return new Rng(`${this.seed}::${label}`);
  }
}

const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Seed aléatoire lisible (sans caractères ambigus). */
export function randomSeed(length: number): string {
  const bytes = new Uint32Array(length);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 2 ** 32);
  let s = "";
  for (let i = 0; i < length; i++) s += SEED_ALPHABET[(bytes[i] ?? 0) % SEED_ALPHABET.length];
  return s;
}

/** Normalise une seed saisie par le joueur. */
export function normalizeSeed(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
}
