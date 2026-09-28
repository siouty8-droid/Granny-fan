import { CONFIG, type Difficulty } from "../config";
import { loadJSON, saveJSON } from "../core/Storage";
import type { SplitTime } from "./Records";

/** « pb » : ton meilleur temps sur la seed (run classée) ; « auto » : la run du pilote auto. */
export type GhostKind = "pb" | "auto";

/** Un fantôme enregistré : trajet échantillonné + splits (écarts en direct). */
export interface GhostData {
  seed: string;
  difficulty: Difficulty;
  kind: GhostKind;
  /** temps final (ms) */
  ms: number;
  exit: string;
  date: number;
  splits: SplitTime[];
  /** pas d'échantillonnage (ms de chrono) */
  rate: number;
  /** échantillons encodés (voir GhostRecorder) */
  track: string;
}

/** Pose du fantôme à un instant. */
export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  crouch: boolean;
  lamp: boolean;
}

const VERSION = 1;

/**
 * Enregistreur : un échantillon tous les `rate` ms de chrono (position en cm, lacet en
 * centièmes de radian, drapeaux accroupi / lampe), encodé en écarts successifs : une run de
 * 2 min tient en ~15 Ko.
 */
export class GhostRecorder {
  private readonly rate = CONFIG.ghost.sampleMs;
  private out: number[] = [];
  private next = 0;
  private prev = [0, 0, 0, 0];

  reset(): void {
    this.out = [];
    this.next = 0;
    this.prev = [0, 0, 0, 0];
  }

  get samples(): number {
    return this.out.length / 5;
  }

  /** À appeler à chaque pas de jeu : n'ajoute un échantillon qu'aux instants voulus. */
  sample(tMs: number, x: number, y: number, z: number, yaw: number, crouch: boolean, lamp: boolean): void {
    while (tMs >= this.next) {
      this.push(x, y, z, yaw, crouch, lamp);
      this.next += this.rate;
    }
  }

  private push(x: number, y: number, z: number, yaw: number, crouch: boolean, lamp: boolean): void {
    let a = yaw % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    else if (a < -Math.PI) a += Math.PI * 2;
    const q = [Math.round(x * 100), Math.round(y * 100), Math.round(z * 100), Math.round(a * 100)];
    for (let i = 0; i < 4; i++) {
      this.out.push(q[i]! - this.prev[i]!);
      this.prev[i] = q[i]!;
    }
    this.out.push((crouch ? 1 : 0) | (lamp ? 2 : 0));
  }

  /** Trajet encodé (base 36, séparé par des virgules). */
  encode(): string {
    return this.out.map((v) => v.toString(36)).join(",");
  }

  get sampleRate(): number {
    return this.rate;
  }
}

/** Trajet décodé : pose interpolée à n'importe quel instant du chrono. */
export class GhostTrack {
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly zs: Float32Array;
  private readonly yaws: Float32Array;
  private readonly flags: Uint8Array;
  readonly count: number;

  constructor(readonly data: GhostData) {
    const v = data.track ? data.track.split(",").map((s) => parseInt(s, 36)) : [];
    const n = Math.floor(v.length / 5);
    this.count = n;
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
    this.zs = new Float32Array(n);
    this.yaws = new Float32Array(n);
    this.flags = new Uint8Array(n);
    const acc = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) acc[k]! += v[i * 5 + k] || 0;
      this.xs[i] = acc[0]! / 100;
      this.ys[i] = acc[1]! / 100;
      this.zs[i] = acc[2]! / 100;
      this.yaws[i] = acc[3]! / 100;
      this.flags[i] = v[i * 5 + 4] || 0;
    }
  }

  /** Fin du trajet (ms). */
  get endMs(): number {
    return Math.max(0, (this.count - 1) * this.data.rate);
  }

  at(tMs: number, out: GhostPose): GhostPose {
    if (this.count === 0) return out;
    const f = Math.max(0, Math.min(this.count - 1, tMs / this.data.rate));
    const i = Math.min(this.count - 2, Math.floor(f));
    if (i < 0) {
      out.x = this.xs[0]!;
      out.y = this.ys[0]!;
      out.z = this.zs[0]!;
      out.yaw = this.yaws[0]!;
      out.crouch = (this.flags[0]! & 1) !== 0;
      out.lamp = (this.flags[0]! & 2) !== 0;
      return out;
    }
    const k = f - i;
    out.x = this.xs[i]! + (this.xs[i + 1]! - this.xs[i]!) * k;
    out.y = this.ys[i]! + (this.ys[i + 1]! - this.ys[i]!) * k;
    out.z = this.zs[i]! + (this.zs[i + 1]! - this.zs[i]!) * k;
    let dy = this.yaws[i + 1]! - this.yaws[i]!;
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    out.yaw = this.yaws[i]! + dy * k;
    const fl = this.flags[k < 0.5 ? i : i + 1]!;
    out.crouch = (fl & 1) !== 0;
    out.lamp = (fl & 2) !== 0;
    return out;
  }
}

/**
 * Fantômes enregistrés (localStorage) : un par seed × difficulté × type. Les plus anciens partent
 * au-delà de `CONFIG.ghost.maxStored` ou de la taille maximale, pour ne pas remplir le stockage
 * du navigateur.
 */
export class GhostStore {
  private list: GhostData[];

  constructor() {
    const raw = loadJSON<{ version: number; list: GhostData[] } | null>("ghosts", null);
    this.list = raw && raw.version === VERSION && Array.isArray(raw.list) ? raw.list.filter((g) => g && typeof g.track === "string") : [];
  }

  get(seed: string, difficulty: Difficulty, kind: GhostKind): GhostData | null {
    return this.list.find((g) => g.seed === seed && g.difficulty === difficulty && g.kind === kind) ?? null;
  }

  /** Enregistre (remplace celui de la même seed / difficulté / type). Renvoie true si gardé. */
  save(g: GhostData): boolean {
    this.list = this.list.filter((o) => !(o.seed === g.seed && o.difficulty === g.difficulty && o.kind === g.kind));
    this.list.unshift(g);
    const cfg = CONFIG.ghost;
    if (this.list.length > cfg.maxStored) this.list.length = cfg.maxStored;
    // taille totale bornée : on retire les plus anciens
    let size = this.list.reduce((s, o) => s + o.track.length, 0);
    while (size > cfg.maxChars && this.list.length > 1) size -= this.list.pop()!.track.length;
    saveJSON("ghosts", { version: VERSION, list: this.list });
    return this.list.includes(g);
  }

  clear(): void {
    this.list = [];
    saveJSON("ghosts", { version: VERSION, list: this.list });
  }
}
