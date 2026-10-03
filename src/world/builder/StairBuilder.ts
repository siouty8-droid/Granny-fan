import { makeAABB, makeRamp, CollisionMask, type Collider } from "../../physics/Collider";
import type { FloorDef, FloorId, HospitalLayout, StairDef } from "../layout/types";
import type { BatchSet } from "./MeshBatch";
import { WALL_T } from "./ArchitectureBuilder";

const HALF_T = WALL_T / 2;
const LANDING = 1.5;
const DIVIDER = 0.2;
const STEPS = 13;
const RAIL_H = 1.0;

/** Repère local d'une cage : d = profondeur depuis le côté d'entrée, w = largeur. */
interface Frame {
  D: number;
  W: number;
  /** local (d, w) → monde (x, z) */
  toWorld(d: number, w: number): { x: number; z: number };
  /** angle (rad) de l'axe d dans le plan XZ, pour les rampes */
  dAngle: number;
}

function makeFrame(s: StairDef): Frame {
  const [x0, z0, x1, z1] = s.rect;
  switch (s.entry) {
    case "z0":
      return { D: z1 - z0, W: x1 - x0, toWorld: (d, w) => ({ x: x0 + w, z: z0 + d }), dAngle: 0 };
    case "z1":
      return { D: z1 - z0, W: x1 - x0, toWorld: (d, w) => ({ x: x1 - w, z: z1 - d }), dAngle: Math.PI };
    case "x0":
      return { D: x1 - x0, W: z1 - z0, toWorld: (d, w) => ({ x: x0 + d, z: z1 - w }), dAngle: -Math.PI / 2 };
    case "x1":
      return { D: x1 - x0, W: z1 - z0, toWorld: (d, w) => ({ x: x1 - d, z: z0 + w }), dAngle: Math.PI / 2 };
  }
}

/**
 * Escaliers en U (deux volées + paliers) entre chaque paire d'étages d'une cage.
 * Visuel : marches pleines, sous-face, paliers, mur de refend, mains courantes.
 * Collision : rampes lisses (confort + navmesh) + paliers + garde-corps.
 */
export class StairBuilder {
  readonly colliders: Collider[] = [];

  constructor(
    private readonly layout: HospitalLayout,
    private readonly batches: BatchSet,
  ) {}

  build(): void {
    for (const s of this.layout.stairs) this.buildStair(s);
  }

  private floor(id: FloorId): FloorDef {
    return this.layout.floors.find((f) => f.id === id)!;
  }

  private zoneOf(s: StairDef, floor: FloorId): string {
    const r = this.layout.rooms.find((r) => r.shaft === s.id && r.floor === floor);
    return r ? r.id : `stair_${s.id}`;
  }

  private buildStair(s: StairDef): void {
    const fr = makeFrame(s);
    const wL0 = HALF_T;
    const wMid0 = fr.W / 2 - DIVIDER / 2;
    const wMid1 = fr.W / 2 + DIVIDER / 2;
    const wR1 = fr.W - HALF_T;
    const dNear = LANDING;
    const dFar = fr.D - LANDING;
    const floors = s.floors.map((f) => this.floor(f));

    for (let i = 0; i < floors.length - 1; i++) {
      const lo = floors[i]!;
      const hi = floors[i + 1]!;
      const rise = hi.y - lo.y;
      const midY = lo.y + rise / 2;
      const zone = this.zoneOf(s, lo.id);
      const mat = "concrete_stairs";

      // volée 1 (moitié gauche) : de lo.y (près) à midY (loin)
      this.flight(zone, mat, fr, wL0, wMid0, dNear, dFar, lo.y, midY);
      // volée 2 (moitié droite) : de midY (loin) à hi.y (près)
      this.flight(zone, mat, fr, wMid1, wR1, dFar, dNear, midY, hi.y);
      // palier intermédiaire (loin, pleine largeur)
      this.slab(zone, mat, fr, dFar, fr.D - HALF_T, wL0, wR1, midY, 0.25);
      // palier d'arrivée (près) au niveau supérieur
      this.slab(this.zoneOf(s, hi.id), mat, fr, HALF_T, dNear, wL0, wR1, hi.y, 0.3);
      // mur de refend entre les volées (plein, du bas au haut de la section)
      this.divider(zone, fr, wMid0, wMid1, dNear, dFar, lo.y, hi.y);
      // mains courantes le long des volées
      this.handrail(zone, fr, wMid0 - 0.04, dNear, dFar, lo.y, midY);
      this.handrail(zone, fr, wMid1 + 0.04, dFar, dNear, midY, hi.y);

      // sous l'escalier au niveau le plus bas : placard (évite de marcher sous la volée 2)
      if (i === 0) {
        const p0 = fr.toWorld(dNear, wMid1);
        const p1 = fr.toWorld(dFar, wR1);
        this.colliders.push(
          makeAABB(Math.min(p0.x, p1.x), lo.y, Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), midY, Math.max(p0.z, p1.z), { surface: "concrete" }),
        );
        this.closetUnder(zone, fr, wMid1, wR1, dNear, lo.y, midY);
      }
    }

    // garde-corps du dernier palier (côté vide de la volée montante inexistante)
    const top = floors[floors.length - 1]!;
    const zoneTop = this.zoneOf(s, top.id);
    this.railing(zoneTop, fr, wL0, wMid0, dNear, top.y);
  }

  /** Volée de marches entre dA (hauteur yA) et dB (hauteur yB), sur la bande [w0, w1]. */
  private flight(zone: string, mat: string, fr: Frame, w0: number, w1: number, dA: number, dB: number, yA: number, yB: number): void {
    const b = this.batches.get(zone, mat);
    const n = STEPS;
    const dir = dB > dA ? 1 : -1;
    const run = Math.abs(dB - dA) / n;
    const riser = (yB - yA) / n;
    // marches : chaque marche est un bloc plein (les volées montent toujours de A vers B)
    for (let i = 0; i < n; i++) {
      const da = dA + dir * run * i;
      const db = dA + dir * run * (i + 1);
      const yTop = yA + riser * (i + 1);
      const yBot = yA + riser * i - 0.28;
      this.blockLocal(b, fr, Math.min(da, db), Math.max(da, db), w0, w1, yBot, yTop);
    }
    // sous-face inclinée
    this.underside(b, fr, w0, w1, dA, dB, yA, yB);
    // collision : rampe lisse de A vers B
    const ramp = makeRamp(0, 0, 1, 1, 0, yA, yB, "concrete");
    this.fixRampOrientation(ramp, fr, dA, dB, w0, w1);
    this.colliders.push(ramp);
  }

  /**
   * Oriente la rampe pour que son z local aille du point A (dA) vers le point B (dB).
   */
  private fixRampOrientation(ramp: Collider, fr: Frame, dA: number, dB: number, w0: number, w1: number): void {
    const a = fr.toWorld(dA, (w0 + w1) / 2);
    const bb = fr.toWorld(dB, (w0 + w1) / 2);
    const vx = bb.x - a.x;
    const vz = bb.z - a.z;
    const len = Math.hypot(vx, vz);
    // z local = (-sin, cos) doit valoir (vx, vz)/len → sin = -vx/len, cos = vz/len
    ramp.sin = -vx / len;
    ramp.cos = vz / len;
    ramp.cx = (a.x + bb.x) / 2;
    ramp.cz = (a.z + bb.z) / 2;
    ramp.hz = len / 2;
    ramp.hx = (w1 - w0) / 2;
  }

  private underside(b: ReturnType<BatchSet["get"]>, fr: Frame, w0: number, w1: number, dA: number, dB: number, yA: number, yB: number): void {
    const off = 0.3;
    const p0 = fr.toWorld(dA, w0);
    const p1 = fr.toWorld(dA, w1);
    const p2 = fr.toWorld(dB, w1);
    const p3 = fr.toWorld(dB, w0);
    const base = b.vertexCount;
    // normale approximative : vers le bas
    b.vertex(p0.x, yA - off, p0.z, 0, -1, 0, 0, 0);
    b.vertex(p1.x, yA - off, p1.z, 0, -1, 0, 1, 0);
    b.vertex(p2.x, yB - off, p2.z, 0, -1, 0, 1, 3);
    b.vertex(p3.x, yB - off, p3.z, 0, -1, 0, 0, 3);
    b.tri(base, base + 1, base + 2, 0, -1, 0);
    b.tri(base, base + 2, base + 3, 0, -1, 0);
  }

  /** Bloc aligné en coordonnées locales (d, w) → boîte monde. */
  private blockLocal(b: ReturnType<BatchSet["get"]>, fr: Frame, d0: number, d1: number, w0: number, w1: number, y0: number, y1: number): void {
    const p0 = fr.toWorld(d0, w0);
    const p1 = fr.toWorld(d1, w1);
    b.box(Math.min(p0.x, p1.x), y0, Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), y1, Math.max(p0.z, p1.z), 1);
  }

  private slab(zone: string, mat: string, fr: Frame, d0: number, d1: number, w0: number, w1: number, y: number, thick: number): void {
    const b = this.batches.get(zone, mat);
    this.blockLocal(b, fr, d0, d1, w0, w1, y - thick, y);
    const p0 = fr.toWorld(d0, w0);
    const p1 = fr.toWorld(d1, w1);
    this.colliders.push(makeAABB(Math.min(p0.x, p1.x), y - thick, Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), y, Math.max(p0.z, p1.z), { surface: "concrete" }));
  }

  private divider(zone: string, fr: Frame, w0: number, w1: number, d0: number, d1: number, y0: number, y1: number): void {
    const b = this.batches.get(zone, "paint_stairs");
    this.blockLocal(b, fr, d0, d1, w0, w1, y0, y1);
    const p0 = fr.toWorld(d0, w0);
    const p1 = fr.toWorld(d1, w1);
    this.colliders.push(makeAABB(Math.min(p0.x, p1.x), y0, Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), y1, Math.max(p0.z, p1.z), { mask: CollisionMask.ALL }));
  }

  /** Main courante inclinée (barre fine) le long d'une volée. */
  private handrail(zone: string, fr: Frame, w: number, dA: number, dB: number, yA: number, yB: number): void {
    const b = this.batches.get(zone, "metal_rail");
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const da = dA + (dB - dA) * t0;
      const db = dA + (dB - dA) * t1;
      const ya = yA + (yB - yA) * t0 + 0.9;
      const yb = yA + (yB - yA) * t1 + 0.9;
      this.blockLocal(b, fr, Math.min(da, db), Math.max(da, db), w - 0.025, w + 0.025, Math.min(ya, yb) - 0.02, Math.max(ya, yb) + 0.02);
    }
  }

  /** Garde-corps horizontal le long d'un bord de palier. */
  private railing(zone: string, fr: Frame, w0: number, w1: number, d: number, y: number): void {
    const b = this.batches.get(zone, "metal_rail");
    this.blockLocal(b, fr, d - 0.03, d + 0.03, w0, w1, y + RAIL_H - 0.05, y + RAIL_H);
    this.blockLocal(b, fr, d - 0.02, d + 0.02, w0, w1, y + 0.45, y + 0.48);
    for (let w = w0 + 0.1; w < w1; w += 0.55) this.blockLocal(b, fr, d - 0.02, d + 0.02, w, w + 0.04, y, y + RAIL_H);
    const p0 = fr.toWorld(d - 0.05, w0);
    const p1 = fr.toWorld(d + 0.05, w1);
    this.colliders.push(
      makeAABB(Math.min(p0.x, p1.x), y, Math.min(p0.z, p1.z), Math.max(p0.x, p1.x), y + 2.2, Math.max(p0.z, p1.z), {
        mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV,
      }),
    );
  }

  /** Cloison du placard sous la volée 2 au niveau le plus bas. */
  private closetUnder(zone: string, fr: Frame, w0: number, w1: number, d0: number, y0: number, y1: number): void {
    const b = this.batches.get(zone, "paint_stairs");
    this.blockLocal(b, fr, d0, d0 + 0.08, w0, w1, y0, y1 + 1.8);
  }
}
