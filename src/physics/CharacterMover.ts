import type { Collider, Surface } from "./Collider";
import { toLocalX, toLocalZ } from "./Collider";
import type { CollisionWorld } from "./CollisionWorld";

export interface CharacterBody {
  x: number;
  /** hauteur des pieds */
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  height: number;
  grounded: boolean;
  surface: Surface;
  /** collider sur lequel on se tient (plateforme mobile, etc.) */
  ground: Collider | null;
}

export function makeBody(radius: number, height: number): CharacterBody {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, radius, height, grounded: false, surface: "tile", ground: null };
}

const PROBE_OFFSETS: ReadonlyArray<[number, number]> = [
  [0, 0],
  [0.6, 0],
  [-0.6, 0],
  [0, 0.6],
  [0, -0.6],
];

/**
 * Contrôleur « capsule » cinématique (cylindre vertical) :
 * - collisions horizontales contre des boîtes orientées (poussée hors pénétration, glissement) ;
 * - marches franchissables (sommet <= pieds + stepHeight) et rampes (escaliers) ;
 * - obstacles en hauteur ignorés si la tête passe dessous (accroupi) ;
 * - accroche au sol en descente, gravité sinon.
 */
export class CharacterMover {
  private candidates: Collider[] = [];
  private groundOut: { surface: Collider | null } = { surface: null };

  constructor(
    private readonly world: CollisionWorld,
    private readonly mask: number,
  ) {}

  /** Un pas de simulation. */
  step(b: CharacterBody, dt: number, stepHeight: number, snap: number, gravity: number): void {
    // --- horizontal
    let nx = b.x + b.vx * dt;
    let nz = b.z + b.vz * dt;
    const r = b.radius;
    const feet = b.y;
    const head = b.y + b.height;

    for (let iter = 0; iter < 4; iter++) {
      const list = this.world.query(nx - r - 0.05, nz - r - 0.05, nx + r + 0.05, nz + r + 0.05, this.mask, this.candidates);
      let pushed = false;
      for (const c of list) {
        if (c.ramp) continue;
        if (c.maxY <= feet + stepHeight) continue; // marche franchissable
        if (c.minY >= head - 0.02) continue; // passe sous l'obstacle
        const res = pushOut(c, nx, nz, r);
        if (!res) continue;
        nx += res.nx * res.depth;
        nz += res.nz * res.depth;
        const vn = b.vx * res.nx + b.vz * res.nz;
        if (vn < 0) {
          b.vx -= vn * res.nx;
          b.vz -= vn * res.nz;
        }
        pushed = true;
      }
      if (!pushed) break;
    }
    b.x = nx;
    b.z = nz;

    // --- vertical
    const ground = this.groundAt(b.x, b.z, r, b.y + stepHeight);
    if (b.vy <= 0 && ground > -Infinity && ground >= b.y - snap) {
      b.y = ground;
      b.vy = 0;
      b.grounded = true;
    } else {
      b.grounded = false;
      b.vy -= gravity * dt;
      b.y += b.vy * dt;
      if (ground > -Infinity && b.y <= ground) {
        b.y = ground;
        b.vy = 0;
        b.grounded = true;
      }
    }
    const gc = this.groundOut.surface;
    b.ground = b.grounded ? gc : null;
    if (b.grounded && gc) b.surface = gc.surface;
  }

  /** Sol le plus haut sous l'empreinte (centre + 4 sondes). */
  groundAt(x: number, z: number, r: number, maxY: number): number {
    let best = -Infinity;
    let bestC: Collider | null = null;
    for (const [ox, oz] of PROBE_OFFSETS) {
      const h = this.world.groundHeight(x + ox * r, z + oz * r, maxY, this.mask, this.groundOut);
      if (h > best) {
        best = h;
        bestC = this.groundOut.surface;
      }
    }
    this.groundOut.surface = bestC;
    return best;
  }

  /** Le corps peut-il occuper la hauteur `height` à sa position actuelle ? */
  fits(b: CharacterBody, height: number, stepHeight: number): boolean {
    const r = b.radius;
    const list = this.world.query(b.x - r, b.z - r, b.x + r, b.z + r, this.mask, this.candidates);
    const feet = b.y;
    const head = b.y + height;
    for (const c of list) {
      if (c.ramp) continue;
      if (c.maxY <= feet + stepHeight) continue;
      if (c.minY >= head - 0.02) continue;
      if (pushOut(c, b.x, b.z, r - 0.02)) return false;
    }
    return true;
  }
}

const out = { nx: 0, nz: 0, depth: 0 };

/** Pénétration cercle (x, z, r) / boîte orientée → direction de sortie monde + profondeur. */
export function pushOut(c: Collider, x: number, z: number, r: number): typeof out | null {
  const lx = toLocalX(c, x, z);
  const lz = toLocalZ(c, x, z);
  if (Math.abs(lx) > c.hx + r || Math.abs(lz) > c.hz + r) return null;
  const qx = Math.max(-c.hx, Math.min(c.hx, lx));
  const qz = Math.max(-c.hz, Math.min(c.hz, lz));
  const dx = lx - qx;
  const dz = lz - qz;
  const d2 = dx * dx + dz * dz;
  let nlx: number;
  let nlz: number;
  let depth: number;
  if (d2 > 1e-10) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    nlx = dx / d;
    nlz = dz / d;
    depth = r - d;
  } else {
    // centre à l'intérieur : sortie par l'axe le moins profond
    const px = c.hx - Math.abs(lx);
    const pz = c.hz - Math.abs(lz);
    if (px < pz) {
      nlx = lx >= 0 ? 1 : -1;
      nlz = 0;
      depth = px + r;
    } else {
      nlx = 0;
      nlz = lz >= 0 ? 1 : -1;
      depth = pz + r;
    }
  }
  out.nx = nlx * c.cos - nlz * c.sin;
  out.nz = nlx * c.sin + nlz * c.cos;
  out.depth = depth;
  return out;
}
