import { makeAABB, makeBox, makeRamp, CollisionMask, type Collider, type Surface } from "../../physics/Collider";
import { SIGNS, signUV } from "../../render/textures/DecalAtlas";
import { CELL_AIR, type LayoutIndex } from "../layout/LayoutGrid";
import { MALL_ESCALATORS, MALL_SKYLIGHT_Y, MALL_TRAIN, MALL_VOIDS, type EscalatorDef } from "../layout/mall";
import type { HospitalLayout, Rect } from "../layout/types";
import { EXTERIOR_ZONE } from "./ArchitectureBuilder";
import type { BatchSet, MeshBatch, V3 } from "./MeshBatch";

/** Masque des garde-corps : bloquent le passage, pas la vue ni la lumière. */
const RAIL_MASK = CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV;
const RAIL_H = 1.05;
/** fond des escalators : palier plat avant la pente */
const ESC_FLAT = 0.6;
/** voies du métro (sous le niveau du quai) */
const TRACK_Y = -6.1;

/** Enseignes au-dessus des vitrines (pièce → texte de l'atlas des panneaux). */
const SHOP_SIGNS: Record<string, string> = {
  g_shop1: "MODE ELSA",
  g_shop2: "PAS SAGES",
  g_shop3: "PLANÈTE JOUETS",
  g_shop4: "MOBIL'HIT",
  g_shop5: "ZÉPHYR",
  g_shop6: "IRIS PARFUMS",
  g_shop7: "LE GRENIER",
  g_shop8: "LACOMBE",
  g_shop9: "STADE SPORT",
  g_shop10: "PHARMACIE",
  g_shop11: "MINI MÔMES",
  g_shop12: "DISCO VINYLES",
  g_hyper: "PRIMO",
  g_electro: "ÉLECTRO MAX",
};

function signIndex(text: string): number {
  return SIGNS.findIndex((s) => s.text === text);
}

/**
 * Architecture propre au centre commercial (en plus des murs / sols génériques) :
 * garde-corps vitrés et bandeaux des vides de la mezzanine, verrières, escalators à l'arrêt,
 * fontaine, piliers, parking (poteaux, marquage), station de métro (bord de quai, rails, rame
 * accidentée), enseignes, rideaux métalliques, extérieur (parking, auvent).
 */
export class MallBuilder {
  readonly colliders: Collider[] = [];
  private readonly uY: number;

  constructor(
    private readonly layout: HospitalLayout,
    private readonly index: LayoutIndex,
    private readonly batches: BatchSet,
  ) {
    this.uY = layout.floors.find((f) => f.id === "U")!.y;
  }

  build(): void {
    for (const e of MALL_ESCALATORS) this.escalator(e);
    for (const v of MALL_VOIDS) {
      this.voidEdges(v.rect, `g_void_${v.id}`);
      this.skylight(v.rect, `g_void_${v.id}`);
      this.pendantCables(v.rect, `g_void_${v.id}`);
    }
    this.galleryColumns();
    this.fountain(55, 34, "g_void_c");
    this.shopSigns();
    this.parking();
    this.metro();
    this.shutters();
    this.sealedDoors();
    this.cinemaScreens();
    this.exterior();
  }

  /**
   * Portes condamnées (jamais ouvrables) : vantaux fixes faits ici — portes vitrées enchaînées de
   * l'entrée principale, portes coupe-feu de la sortie nord. Le gameplay ne crée pas de vantail
   * pour les portes « sealed » du centre commercial (à respecter quand il prendra cette carte en charge).
   */
  private sealedDoors(): void {
    for (const o of this.layout.openings) {
      if (o.door?.lock !== "sealed") continue;
      const f = this.layout.floors.find((q) => q.id === o.floor)!;
      const y0 = f.y;
      const top = o.top ?? 2.2;
      const glassy = o.id === "g_main_entrance";
      const zoneIn = this.zoneAt(o.floor as "B" | "G" | "U", o.axis === "x" ? o.x : o.x + 0.5, o.axis === "x" ? o.z + 0.5 : o.z);
      const zoneOut = this.zoneAt(o.floor as "B" | "G" | "U", o.axis === "x" ? o.x : o.x - 0.5, o.axis === "x" ? o.z - 0.5 : o.z);
      const zone = zoneIn !== EXTERIOR_ZONE ? zoneIn : zoneOut;
      const frame = this.batches.get(zone, glassy ? "mall_fascia" : "metal_rail");
      const fill = this.batches.get(zone, glassy ? "glass" : "shutter");
      const n = Math.max(2, Math.round(o.width / 1.0));
      const w = o.width / n;
      if (o.axis !== "x") continue;
      const z = o.z;
      for (let i = 0; i < n; i++) {
        const xa = o.x - o.width / 2 + i * w;
        for (const nz of [-1, 1]) fill.quad({ x: xa, y: y0, z: z + nz * 0.02 }, { x: w, y: 0, z: 0 }, { x: 0, y: top, z: 0 }, { x: 0, y: 0, z: nz }, [xa, 0], [w, top]);
        frame.box(xa, y0, z - 0.05, xa + 0.06, y0 + top, z + 0.05, 1);
        if (glassy) frame.box(xa + 0.1, y0 + 0.95, z - 0.08, xa + w - 0.1, y0 + 1.0, z + 0.08, 1);
      }
      frame.box(o.x + o.width / 2 - 0.06, y0, z - 0.05, o.x + o.width / 2, y0 + top, z + 0.05, 1);
      frame.box(o.x - o.width / 2, y0 + top - 0.08, z - 0.05, o.x + o.width / 2, y0 + top, z + 0.05, 1);
      if (glassy) {
        // chaîne et cadenas sur les poignées (côté intérieur)
        const chain = this.batches.get(zone, "rail_steel");
        for (let i = 0; i < 9; i++) {
          const t = i / 8;
          const x = o.x - 0.6 + t * 1.2;
          const yy = y0 + 1.0 - Math.sin(t * Math.PI) * 0.18;
          chain.box(x - 0.05, yy - 0.025, z + 0.07, x + 0.05, yy + 0.025, z + 0.12, 1);
        }
        chain.box(o.x - 0.07, y0 + 0.7, z + 0.08, o.x + 0.07, y0 + 0.84, z + 0.16, 1);
      }
      this.colliders.push(makeAABB(o.x - o.width / 2, y0, z - 0.06, o.x + o.width / 2, y0 + top, z + 0.06, { surface: "metal" }));
    }
  }

  /** Écrans des deux salles (mur est), toile déchirée en bas. */
  private cinemaScreens(): void {
    for (const [zone, z0, z1] of [["u_salle1", 13.5, 25.5], ["u_salle2", 42.5, 54.5]] as Array<[string, number, number]>) {
      const b = this.batches.get(zone, "paint_white");
      const x = 96 - 0.14;
      const y0 = this.uY + 0.9;
      b.quad({ x, y: y0, z: z1 }, { x: 0, y: 0, z: z0 - z1 }, { x: 0, y: 3.0, z: 0 }, { x: -1, y: 0, z: 0 }, [0, 0], [z1 - z0, 3], Math.ceil(z1 - z0), 3);
      const frame = this.batches.get(zone, "paint_shop_black");
      frame.box(x - 0.04, y0 - 0.15, z0 - 0.15, x + 0.1, y0, z1 + 0.15, 1);
      frame.box(x - 0.04, y0 + 3.0, z0 - 0.15, x + 0.1, y0 + 3.15, z1 + 0.15, 1);
      // scène devant l'écran
      const stage = this.batches.get(zone, "parquet_dark");
      stage.box(93.2, this.uY, z0 - 1, 95.88, this.uY + 0.4, z1 + 1, 1, { bottom: false });
      this.colliders.push(makeAABB(93.2, this.uY, z0 - 1, 95.88, this.uY + 0.4, z1 + 1, { surface: "wood" }));
    }
  }

  private zoneAt(floor: "B" | "G" | "U", x: number, z: number): string {
    return this.index.grids.get(floor)?.roomAt(x, z)?.id ?? EXTERIOR_ZONE;
  }

  // ------------------------------------------------------------------ escalators

  private escalator(e: EscalatorDef): void {
    const dx = e.x1 - e.x0;
    const dz = e.z1 - e.z0;
    const L = Math.hypot(dx, dz);
    const ux = dx / L;
    const uz = dz / L;
    // perpendiculaire (gauche de la montée)
    const px = -uz;
    const pz = ux;
    const rise = this.uY;
    const zone = this.zoneAt("G", (e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2);
    const hw = e.width / 2;
    const yAt = (s: number) => (s <= ESC_FLAT ? 0 : ((s - ESC_FLAT) / (L - ESC_FLAT)) * rise);
    const P = (s: number, t: number, y: number): V3 => ({ x: e.x0 + ux * s + px * t, y, z: e.z0 + uz * s + pz * t });

    // marches (blocs alignés : les escalators suivent les axes)
    const steps = this.batches.get(zone, "escalator_steel");
    const n = 24;
    const run = (L - ESC_FLAT) / n;
    const riser = rise / n;
    for (let i = 0; i < n; i++) {
      const s0 = ESC_FLAT + run * i;
      const s1 = s0 + run;
      const yTop = riser * (i + 1);
      const a = P(s0, -hw, 0);
      const b = P(s1, hw, 0);
      steps.box(Math.min(a.x, b.x), yTop - riser - 0.12, Math.min(a.z, b.z), Math.max(a.x, b.x), yTop, Math.max(a.z, b.z), 1, { bottom: false });
    }
    // palier bas (plaque peigne)
    const f0 = P(0, -hw, 0);
    const f1 = P(ESC_FLAT, hw, 0);
    steps.box(Math.min(f0.x, f1.x), 0, Math.min(f0.z, f1.z), Math.max(f0.x, f1.x), 0.06, Math.max(f0.z, f1.z), 1, { bottom: false });
    // plaque d'arrivée sur la mezzanine
    const t0 = P(L, -hw, 0);
    const t1 = P(L + 0.7, hw, 0);
    steps.box(Math.min(t0.x, t1.x), rise, Math.min(t0.z, t1.z), Math.max(t0.x, t1.x), rise + 0.025, Math.max(t0.z, t1.z), 1, { bottom: false });

    // flancs : caisson métallique (sous la pente) + vitrage + main courante
    const side = this.batches.get(zone, "escalator_side");
    const glass = this.batches.get(zone, "glass");
    const rail = this.batches.get(zone, "rubber_black");
    const segs = 8;
    for (const t of [-hw - 0.08, hw + 0.08]) {
      for (let i = 0; i < segs; i++) {
        const sa = (L * i) / segs;
        const sb = (L * (i + 1)) / segs;
        const ya = yAt(sa);
        const yb = yAt(sb);
        // caisson : du dessous de la poutre (−0.9) au-dessus des marches (+0.25), deux faces
        for (const sgn of [-1, 1]) {
          const tt = t + sgn * 0.06;
          this.slanted(side, P(sa, tt, 0), P(sb, tt, 0), Math.max(0, ya - 0.9), ya + 0.25, Math.max(0, yb - 0.9), yb + 0.25, { x: px * sgn, y: 0, z: pz * sgn });
          this.slanted(glass, P(sa, tt * 0.999, 0), P(sb, tt * 0.999, 0), ya + 0.25, ya + 0.95, yb + 0.25, yb + 0.95, { x: px * sgn, y: 0, z: pz * sgn });
        }
        const a = P(sa, t, 0);
        const b = P(sb, t, 0);
        const ylo = Math.min(ya, yb) + 0.95;
        const yhi = Math.max(ya, yb) + 1.02;
        rail.box(Math.min(a.x, b.x) - 0.05, ylo, Math.min(a.z, b.z) - 0.05, Math.max(a.x, b.x) + 0.05, yhi, Math.max(a.z, b.z) + 0.05, 1);
      }
      // collider latéral (toute la hauteur : on ne passe pas sous l'escalator par le côté)
      const a = P(0, t - 0.07, 0);
      const b = P(L, t + 0.07, 0);
      this.colliders.push(makeAABB(Math.min(a.x, b.x), 0, Math.min(a.z, b.z), Math.max(a.x, b.x), rise + 1.2, Math.max(a.z, b.z), { mask: RAIL_MASK, surface: "metal" }));
    }
    // dessous de la poutre (sous-face inclinée, vers le bas)
    const under = this.batches.get(zone, "escalator_side");
    const sU = ESC_FLAT + 1.4;
    const yA = yAt(sU) - 0.9;
    const yB = rise - 0.9;
    const c0 = P(sU, -hw - 0.14, 0);
    const c1 = P(sU, hw + 0.14, 0);
    const c2 = P(L, hw + 0.14, 0);
    const c3 = P(L, -hw - 0.14, 0);
    const i0 = under.vertex(c0.x, yA, c0.z, 0, -1, 0, 0, 0);
    const i1 = under.vertex(c1.x, yA, c1.z, 0, -1, 0, 1, 0);
    const i2 = under.vertex(c2.x, yB, c2.z, 0, -1, 0, 1, 4);
    const i3 = under.vertex(c3.x, yB, c3.z, 0, -1, 0, 0, 4);
    under.tri(i0, i1, i2, 0, -1, 0);
    under.tri(i0, i2, i3, 0, -1, 0);
    // pente : rampe lisse (confort + navmesh), du pied du plan incliné à la mezzanine
    const cs = (ESC_FLAT + L) / 2;
    const c = P(cs, 0, 0);
    this.colliders.push(makeRamp(c.x, c.z, hw, (L - ESC_FLAT) / 2, Math.atan2(-ux, uz), 0, rise, "metal"));
  }

  /** Panneau incliné (parallélogramme vertical) entre deux points au sol, hauteurs bas/haut à chaque bout. */
  private slanted(b: MeshBatch, a: V3, c: V3, ya0: number, ya1: number, yc0: number, yc1: number, n: V3): void {
    const len = Math.hypot(c.x - a.x, c.z - a.z);
    const i0 = b.vertex(a.x, ya0, a.z, n.x, n.y, n.z, 0, ya0);
    const i1 = b.vertex(c.x, yc0, c.z, n.x, n.y, n.z, len, yc0);
    const i2 = b.vertex(c.x, yc1, c.z, n.x, n.y, n.z, len, yc1);
    const i3 = b.vertex(a.x, ya1, a.z, n.x, n.y, n.z, 0, ya1);
    b.tri(i0, i1, i2, n.x, n.y, n.z);
    b.tri(i0, i2, i3, n.x, n.y, n.z);
  }

  // ------------------------------------------------------------------ vides de la mezzanine

  /** Une voie d'escalator arrive-t-elle sur ce segment de bord ? */
  private escalatorAt(x: number, z: number): boolean {
    for (const e of MALL_ESCALATORS) {
      if (Math.hypot(e.x1 - x, e.z1 - z) < e.width / 2 + 0.25) return true;
      // segment perpendiculaire à la voie : on compare la coordonnée transverse
      const alongX = Math.abs(e.x1 - e.x0) > Math.abs(e.z1 - e.z0);
      if (alongX && Math.abs(x - e.x1) < 0.05 && Math.abs(z - e.z1) < e.width / 2 + 0.2) return true;
      if (!alongX && Math.abs(z - e.z1) < 0.05 && Math.abs(x - e.x1) < e.width / 2 + 0.2) return true;
    }
    return false;
  }

  /** Bords d'un vide : bandeau (épaisseur de dalle) côté vide, garde-corps vitré côté coursive. */
  private voidEdges(r: Rect, voidZone: string): void {
    const gridU = this.index.grids.get("U")!;
    const y = this.uY;
    const fascia = this.batches.get(voidZone, "mall_fascia");
    const [x0, z0, x1, z1] = r;
    // segments unitaires (centre, axe, côté extérieur)
    type Seg = { axis: "x" | "z"; line: number; t: number; out: -1 | 1 };
    const segs: Seg[] = [];
    for (let x = x0; x < x1; x++) {
      segs.push({ axis: "x", line: z0, t: x, out: -1 });
      segs.push({ axis: "x", line: z1, t: x, out: 1 });
    }
    for (let z = z0; z < z1; z++) {
      segs.push({ axis: "z", line: x0, t: z, out: -1 });
      segs.push({ axis: "z", line: x1, t: z, out: 1 });
    }
    for (const s of segs) {
      // cellule côté coursive
      const cx = s.axis === "x" ? s.t : s.out < 0 ? s.line - 1 : s.line;
      const cz = s.axis === "x" ? (s.out < 0 ? s.line - 1 : s.line) : s.t;
      const cell = gridU.at(cx, cz);
      if (cell === CELL_AIR || cell < 0) continue;
      const walk = gridU.rooms[cell]!.id;
      // bandeau (vers le vide) : de sous la dalle jusqu'au-dessus du sol de la mezzanine
      const nIn = -s.out;
      if (s.axis === "x") fascia.quad({ x: s.t, y: y - 0.85, z: s.line }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0.9, z: 0 }, { x: 0, y: 0, z: nIn }, [s.t, 0], [1, 0.9]);
      else fascia.quad({ x: s.line, y: y - 0.85, z: s.t }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0.9, z: 0 }, { x: nIn, y: 0, z: 0 }, [s.t, 0], [1, 0.9]);
      const mx = s.axis === "x" ? s.t + 0.5 : s.line;
      const mz = s.axis === "x" ? s.line : s.t + 0.5;
      if (this.escalatorAt(mx, mz)) continue;
      this.railing(walk, s.axis, s.line, s.t, s.t + 1, y, s.out);
    }
  }

  /** Garde-corps vitré d'un mètre (lisse, vitre, montant). `out` : côté coursive. */
  private railing(zone: string, axis: "x" | "z", line: number, t0: number, t1: number, y: number, out: number): void {
    const glass = this.batches.get(zone, "glass");
    const metal = this.batches.get(zone, "mall_fascia");
    const k = line + out * 0.06;
    if (axis === "x") {
      glass.quad({ x: t0, y: y + 0.1, z: k }, { x: t1 - t0, y: 0, z: 0 }, { x: 0, y: RAIL_H - 0.15, z: 0 }, { x: 0, y: 0, z: out }, [t0, 0], [1, 1]);
      metal.box(t0, y + RAIL_H - 0.05, k - 0.04, t1, y + RAIL_H + 0.02, k + 0.04, 1);
      metal.box(t0, y, k - 0.05, t1, y + 0.1, k + 0.05, 1, { bottom: false });
      metal.box(t0 - 0.025, y, k - 0.025, t0 + 0.025, y + RAIL_H, k + 0.025, 1, { bottom: false });
      this.colliders.push(makeAABB(t0, y, k - 0.06, t1, y + 2.2, k + 0.06, { mask: RAIL_MASK, surface: "metal" }));
    } else {
      glass.quad({ x: k, y: y + 0.1, z: t0 }, { x: 0, y: 0, z: t1 - t0 }, { x: 0, y: RAIL_H - 0.15, z: 0 }, { x: out, y: 0, z: 0 }, [t0, 0], [1, 1]);
      metal.box(k - 0.04, y + RAIL_H - 0.05, t0, k + 0.04, y + RAIL_H + 0.02, t1, 1);
      metal.box(k - 0.05, y, t0, k + 0.05, y + 0.1, t1, 1, { bottom: false });
      metal.box(k - 0.025, y, t0 - 0.025, k + 0.025, y + RAIL_H, t0 + 0.025, 1, { bottom: false });
      this.colliders.push(makeAABB(k - 0.06, y, t0, k + 0.06, y + 2.2, t1, { mask: RAIL_MASK, surface: "metal" }));
    }
  }

  /** Verrière en bâtière au-dessus d'un vide (vitrage + structure). Aucun collider : la lune passe. */
  private skylight(r: Rect, zone: string): void {
    const [x0, z0, x1, z1] = r;
    const y = MALL_SKYLIGHT_Y;
    const glass = this.batches.get(zone, "glass");
    const frame = this.batches.get(zone, "mall_fascia");
    const alongX = x1 - x0 >= z1 - z0;
    const span = alongX ? z1 - z0 : x1 - x0;
    const h = Math.min(1.6, span * 0.28);
    const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
    const len = alongX ? x1 - x0 : z1 - z0;
    const lo = alongX ? x0 : z0;
    // deux pans
    for (const sgn of [-1, 1]) {
      const edge = sgn < 0 ? (alongX ? z0 : x0) : alongX ? z1 : x1;
      const nyv = span / 2;
      const nl = Math.hypot(nyv, h);
      const n: V3 = alongX ? { x: 0, y: -nyv / nl, z: (sgn * -h) / nl * -1 } : { x: (sgn * -h) / nl * -1, y: -nyv / nl, z: 0 };
      if (alongX) glass.quad({ x: lo, y, z: edge }, { x: len, y: 0, z: 0 }, { x: 0, y: h, z: mid - edge }, n, [lo, 0], [len, span / 2], Math.ceil(len / 2), 1);
      else glass.quad({ x: edge, y, z: lo }, { x: 0, y: 0, z: len }, { x: mid - edge, y: h, z: 0 }, n, [lo, 0], [len, span / 2], Math.ceil(len / 2), 1);
    }
    // pignons (triangles vitrés)
    for (const end of [lo, lo + len]) {
      const base = glass.vertexCount;
      const nd = end === lo ? -1 : 1;
      if (alongX) {
        glass.vertex(end, y, z0, -nd, 0, 0, z0, 0);
        glass.vertex(end, y, z1, -nd, 0, 0, z1, 0);
        glass.vertex(end, y + h, mid, -nd, 0, 0, mid, h);
        glass.tri(base, base + 1, base + 2, -nd, 0, 0);
      } else {
        glass.vertex(x0, y, end, 0, 0, -nd, x0, 0);
        glass.vertex(x1, y, end, 0, 0, -nd, x1, 0);
        glass.vertex(mid, y + h, end, 0, 0, -nd, mid, h);
        glass.tri(base, base + 1, base + 2, 0, 0, -nd);
      }
    }
    // structure : faîtage, chevrons tous les 2 m, ceinture
    const T = 0.07;
    if (alongX) {
      frame.box(x0, y + h - T, mid - T, x1, y + h + T, mid + T, 1);
      frame.box(x0, y - 0.18, z0 - 0.12, x1, y, z0 + 0.12, 1);
      frame.box(x0, y - 0.18, z1 - 0.12, x1, y, z1 + 0.12, 1);
      for (let x = x0; x <= x1 + 1e-6; x += 2) {
        for (const ez of [z0, z1]) this.rafter(frame, { x, y, z: ez }, { x, y: y + h, z: mid }, T, "x");
      }
    } else {
      frame.box(mid - T, y + h - T, z0, mid + T, y + h + T, z1, 1);
      frame.box(x0 - 0.12, y - 0.18, z0, x0 + 0.12, y, z1, 1);
      frame.box(x1 - 0.12, y - 0.18, z0, x1 + 0.12, y, z1, 1);
      for (let z = z0; z <= z1 + 1e-6; z += 2) {
        for (const ex of [x0, x1]) this.rafter(frame, { x: ex, y, z }, { x: mid, y: y + h, z }, T, "z");
      }
    }
  }

  /** Chevron incliné de section T×T entre deux points (axe d'épaisseur : x ou z). */
  private rafter(b: MeshBatch, a: V3, c: V3, T: number, thick: "x" | "z"): void {
    const h = T / 2;
    const off = thick === "x" ? { x: h, z: 0 } : { x: 0, z: h };
    for (const sg of [-1, 1]) {
      const pa = { x: a.x + off.x * sg, y: 0, z: a.z + off.z * sg };
      const pc = { x: c.x + off.x * sg, y: 0, z: c.z + off.z * sg };
      this.slanted(b, pa, pc, a.y - h, a.y + h, c.y - h, c.y + h, { x: (off.x / h) * sg, y: 0, z: (off.z / h) * sg });
    }
    // dessous et dessus
    const len = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
    for (const sg of [-1, 1]) {
      const yo = sg * h;
      const i0 = b.vertex(a.x - off.x, a.y + yo, a.z - off.z, 0, sg, 0, 0, 0);
      const i1 = b.vertex(a.x + off.x, a.y + yo, a.z + off.z, 0, sg, 0, T, 0);
      const i2 = b.vertex(c.x + off.x, c.y + yo, c.z + off.z, 0, sg, 0, T, len);
      const i3 = b.vertex(c.x - off.x, c.y + yo, c.z - off.z, 0, sg, 0, 0, len);
      b.tri(i0, i1, i2, 0, sg, 0);
      b.tri(i0, i2, i3, 0, sg, 0);
    }
  }

  /** Câbles des suspensions des puits (mêmes positions que dans `placeFixtures`). */
  private pendantCables(r: Rect, zone: string): void {
    const [x0, z0, x1, z1] = r;
    const alongX = x1 - x0 >= z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(len / 6));
    const b = this.batches.get(zone, "rubber_black");
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = alongX ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
      const z = alongX ? (z0 + z1) / 2 : z0 + (z1 - z0) * t;
      b.box(x - 0.012, 6.5, z - 0.012, x + 0.012, MALL_SKYLIGHT_Y, z + 0.012, 1, { top: false, bottom: false });
    }
  }

  /** Colonnes rondes aux angles des vides (RDC) et poteaux de la mezzanine. */
  private galleryColumns(): void {
    const done = new Set<string>();
    const placed: Array<[number, number]> = [];
    for (const v of MALL_VOIDS) {
      const [x0, z0, x1, z1] = v.rect;
      const pts: Array<[number, number]> = [];
      const outset = 0.35;
      pts.push([x0 - outset, z0 - outset], [x1 + outset, z0 - outset], [x0 - outset, z1 + outset], [x1 + outset, z1 + outset]);
      for (const [x, z] of pts) {
        if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4.5)) continue;
        const key = `${Math.round(x)}:${Math.round(z)}`;
        if (done.has(key)) continue;
        placed.push([x, z]);
        // pas de colonne sur une voie d'escalator ni dans un autre vide
        if (this.index.grids.get("U")!.at(Math.floor(x), Math.floor(z)) === CELL_AIR) continue;
        done.add(key);
        for (const [floor, y0, y1] of [["G", 0, this.uY - 0.8], ["U", this.uY, MALL_SKYLIGHT_Y]] as const) {
          const zone = this.zoneAt(floor, x, z);
          if (zone === EXTERIOR_ZONE) continue;
          this.cylinder(this.batches.get(zone, "mall_fascia"), x, z, 0.26, y0, y1, 12);
          this.colliders.push(makeAABB(x - 0.26, y0, z - 0.26, x + 0.26, y1, z + 0.26, { surface: "metal" }));
        }
      }
    }
  }

  /** Cylindre vertical (faces latérales seulement). */
  private cylinder(b: MeshBatch, cx: number, cz: number, r: number, y0: number, y1: number, n: number, cap = false): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const nx = Math.cos(am);
      const nz = Math.sin(am);
      const p0 = { x: cx + Math.cos(a0) * r, z: cz + Math.sin(a0) * r };
      const p1 = { x: cx + Math.cos(a1) * r, z: cz + Math.sin(a1) * r };
      const u0 = (i / n) * Math.PI * 2 * r;
      const u1 = ((i + 1) / n) * Math.PI * 2 * r;
      const i0 = b.vertex(p0.x, y0, p0.z, Math.cos(a0), 0, Math.sin(a0), u0, y0);
      const i1 = b.vertex(p1.x, y0, p1.z, Math.cos(a1), 0, Math.sin(a1), u1, y0);
      const i2 = b.vertex(p1.x, y1, p1.z, Math.cos(a1), 0, Math.sin(a1), u1, y1);
      const i3 = b.vertex(p0.x, y1, p0.z, Math.cos(a0), 0, Math.sin(a0), u0, y1);
      b.tri(i0, i1, i2, nx, 0, nz);
      b.tri(i0, i2, i3, nx, 0, nz);
    }
    if (cap) {
      const c = b.vertex(cx, y1, cz, 0, 1, 0, cx, cz);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const i0 = b.vertex(cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r, 0, 1, 0, cx + Math.cos(a0) * r, cz + Math.sin(a0) * r);
        const i1 = b.vertex(cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r, 0, 1, 0, cx + Math.cos(a1) * r, cz + Math.sin(a1) * r);
        b.tri(c, i0, i1, 0, 1, 0);
      }
    }
  }

  /** Anneau horizontal (dessus d'une margelle). */
  private ring(b: MeshBatch, cx: number, cz: number, r0: number, r1: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const i0 = b.vertex(cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0, 0, 1, 0, Math.cos(a0) * r0, Math.sin(a0) * r0);
      const i1 = b.vertex(cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0, 0, 1, 0, Math.cos(a1) * r0, Math.sin(a1) * r0);
      const i2 = b.vertex(cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1, 0, 1, 0, Math.cos(a1) * r1, Math.sin(a1) * r1);
      const i3 = b.vertex(cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1, 0, 1, 0, Math.cos(a0) * r1, Math.sin(a0) * r1);
      b.tri(i0, i1, i2, 0, 1, 0);
      b.tri(i0, i2, i3, 0, 1, 0);
    }
  }

  /** Fontaine à sec : bassin octogonal, fond sale, vasques superposées. */
  private fountain(cx: number, cz: number, zone: string): void {
    const stone = this.batches.get(zone, "terrazzo_mall");
    const tile = this.batches.get(zone, "tile_dark");
    const metal = this.batches.get(zone, "mall_fascia");
    const R = 3.0;
    const H = 0.5;
    const n = 8;
    // margelle : faces extérieure et intérieure + dessus
    this.cylinder(stone, cx, cz, R, 0, H, n);
    const inner = this.batches.get(zone, "terrazzo_mall");
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const r = R - 0.32;
      const i0 = inner.vertex(cx + Math.cos(a0) * r, 0.02, cz + Math.sin(a0) * r, -Math.cos(am), 0, -Math.sin(am), 0, 0);
      const i1 = inner.vertex(cx + Math.cos(a1) * r, 0.02, cz + Math.sin(a1) * r, -Math.cos(am), 0, -Math.sin(am), 1, 0);
      const i2 = inner.vertex(cx + Math.cos(a1) * r, H, cz + Math.sin(a1) * r, -Math.cos(am), 0, -Math.sin(am), 1, H);
      const i3 = inner.vertex(cx + Math.cos(a0) * r, H, cz + Math.sin(a0) * r, -Math.cos(am), 0, -Math.sin(am), 0, H);
      inner.tri(i0, i1, i2, -Math.cos(am), 0, -Math.sin(am));
      inner.tri(i0, i2, i3, -Math.cos(am), 0, -Math.sin(am));
      // collider de la margelle (segment orienté)
      const mx = cx + Math.cos(am) * (R - 0.16) * Math.cos(Math.PI / n);
      const mz = cz + Math.sin(am) * (R - 0.16) * Math.cos(Math.PI / n);
      const half = R * Math.sin(Math.PI / n);
      this.colliders.push(makeBox(mx, mz, half, 0.17, 0, H, { angle: -am + Math.PI / 2, surface: "concrete" }));
    }
    this.ring(stone, cx, cz, R - 0.32, R, H, n);
    // fond du bassin (carrelage sombre, sale)
    this.ring(tile, cx, cz, 0.01, R - 0.32, 0.025, n);
    // vasques
    this.cylinder(stone, cx, cz, 0.45, 0, 1.1, 10, true);
    this.cylinder(stone, cx, cz, 1.35, 1.1, 1.3, 14, true);
    this.cylinder(metal, cx, cz, 0.12, 1.3, 2.4, 8);
    this.cylinder(stone, cx, cz, 0.6, 2.4, 2.52, 10, true);
    this.cylinder(metal, cx, cz, 0.06, 2.52, 2.95, 6, true);
    this.colliders.push(makeAABB(cx - 0.5, 0, cz - 0.5, cx + 0.5, 2.5, cz + 0.5, { surface: "concrete" }));
    this.colliders.push(makeAABB(cx - 1.35, 1.05, cz - 1.35, cx + 1.35, 1.3, cz + 1.35, { surface: "concrete" }));
  }

  // ------------------------------------------------------------------ enseignes

  private shopSigns(): void {
    for (const o of this.layout.openings) {
      if (!o.id.endsWith("_front") && !o.id.endsWith("_entrance")) continue;
      const roomId = o.id.replace(/_(front|entrance)$/, "");
      const text = SHOP_SIGNS[roomId];
      if (!text) continue;
      const idx = signIndex(text);
      if (idx < 0) continue;
      const room = this.layout.rooms.find((r) => r.id === roomId);
      if (!room) continue;
      // côté galerie : à l'opposé de la boutique
      const [x0, z0, x1, z1] = room.rect;
      const inner = o.axis === "x" ? (z0 + z1) / 2 : (x0 + x1) / 2;
      const line = o.axis === "x" ? o.z : o.x;
      const out = inner < line ? 1 : -1;
      const cxAlong = o.axis === "x" ? o.x : o.z;
      const px = o.axis === "x" ? cxAlong : line + out * 0.5;
      const pz = o.axis === "x" ? line + out * 0.5 : cxAlong;
      const zone = this.zoneAt("G", px, pz);
      this.sign(zone, o.axis, line + out * (0.12 + 0.02), cxAlong, 3.6, out, idx, 2.4, 1.2);
    }
    // repères : cinéma, restauration, métro, parking, niveaux
    const extra: Array<[string, "x" | "z", number, number, number, number, string]> = [
      ["CINÉMA LE PALACE", "x", 27, 67, this.uY + 3.3, 1, "U"],
      ["RESTAURATION", "x", 41, 31.5, this.uY + 3.3, -1, "U"],
      ["MÉTRO", "z", 86, 32, -5 + 2.6, 1, "B"],
      ["LIGNE 7", "x", 40, 95, -5 + 2.6, -1, "B"],
      ["PARKING", "x", 56, 26, -5 + 2.4, -1, "B"],
    ];
    for (const [text, axis, line, along, y, out, floor] of extra) {
      const idx = signIndex(text);
      if (idx < 0) continue;
      const px = axis === "x" ? along : line + out * 0.5;
      const pz = axis === "x" ? line + out * 0.5 : along;
      this.sign(this.zoneAt(floor as "B" | "G" | "U", px, pz), axis, line + out * 0.14, along, y, out, idx, 1.8, 0.9);
    }
  }

  /** Panneau de l'atlas collé au mur (ligne `k`), face vers `out`. */
  private sign(zone: string, axis: "x" | "z", k: number, along: number, cy: number, out: number, idx: number, w: number, h: number): void {
    const b = this.batches.get(zone, "signs");
    const uv = signUV(idx);
    const uvO: [number, number] = [uv[0], uv[1]];
    const uvS: [number, number] = [uv[2] - uv[0], uv[3] - uv[1]];
    // le côté droit du panneau, vu depuis `out`
    if (axis === "x") {
      const U: V3 = { x: out > 0 ? -w : w, y: 0, z: 0 };
      b.quad({ x: along - U.x / 2, y: cy - h / 2, z: k }, U, { x: 0, y: h, z: 0 }, { x: 0, y: 0, z: out }, uvO, uvS);
    } else {
      const U: V3 = { x: 0, y: 0, z: out > 0 ? w : -w };
      b.quad({ x: k, y: cy - h / 2, z: along - U.z / 2 }, U, { x: 0, y: h, z: 0 }, { x: out, y: 0, z: 0 }, uvO, uvS);
    }
  }

  // ------------------------------------------------------------------ parking

  private parking(): void {
    const y = -5;
    const ceil = y + 3.2;
    for (let x = 22; x <= 54; x += 8) {
      for (let z = 8; z <= 48; z += 8) {
        const zone = this.zoneAt("B", x, z);
        if (!zone.startsWith("b_park")) continue;
        const c = this.batches.get(zone, "concrete_wall");
        const band = this.batches.get(zone, "paint_yellow_hazard");
        c.box(x - 0.3, y + 0.9, z - 0.3, x + 0.3, ceil, z + 0.3, 1, { bottom: false, top: false });
        band.box(x - 0.31, y, z - 0.31, x + 0.31, y + 0.9, z + 0.31, 1, { bottom: false, top: false });
        this.colliders.push(makeAABB(x - 0.3, y, z - 0.3, x + 0.3, ceil, z + 0.3));
      }
    }
    // marquage des places : lignes blanches de part et d'autre des allées (x)
    for (const zc of [4, 12, 20, 36, 44, 52]) {
      for (let x = 15; x < 61.5; x += 2.6) {
        const zone = this.zoneAt("B", x, zc);
        if (!zone.startsWith("b_park")) continue;
        const b = this.batches.get(zone, "paint_white");
        b.quad({ x: x, y: y + 0.008, z: zc - 2.4 }, { x: 0.1, y: 0, z: 0 }, { x: 0, y: 0, z: 4.8 }, { x: 0, y: 1, z: 0 }, [0, 0], [0.1, 4.8]);
      }
    }
    // allée centrale : flèches au sol (bandes)
    for (let x = 18; x < 60; x += 6) {
      const zone = this.zoneAt("B", x, 28);
      const b = this.batches.get(zone, "paint_yellow_hazard");
      b.quad({ x, y: y + 0.008, z: 27.9 }, { x: 2.2, y: 0, z: 0 }, { x: 0, y: 0, z: 0.2 }, { x: 0, y: 1, z: 0 }, [0, 0], [2.2, 0.2]);
    }
  }

  // ------------------------------------------------------------------ métro

  private metro(): void {
    const qy = -5;
    // bord de quai (face verticale côté voie) + bande d'éveil
    const edge = this.batches.get("b_track", "tile_wall_cream");
    edge.quad({ x: 86, y: TRACK_Y, z: 46 }, { x: 38, y: 0, z: 0 }, { x: 0, y: qy - TRACK_Y, z: 0 }, { x: 0, y: 0, z: 1 }, [86, 0], [38, 1.1], 38, 1);
    this.colliders.push(makeAABB(86, TRACK_Y - 0.1, 45.7, 124, qy, 46, { surface: "tile" }));
    const strip = this.batches.get("b_platform", "paint_yellow_hazard");
    strip.quad({ x: 86, y: qy + 0.006, z: 45.45 }, { x: 38, y: 0, z: 0 }, { x: 0, y: 0, z: 0.5 }, { x: 0, y: 1, z: 0 }, [0, 0], [38, 0.5], 19, 1);
    // rails et traverses (voie + tunnel)
    for (const [zone, x0, x1] of [["b_track", 86, 124], ["b_tunnel", 124, 140]] as Array<[string, number, number]>) {
      const rail = this.batches.get(zone, "rail_steel");
      const sl = this.batches.get(zone, "sleeper");
      for (const rz of [48.2, 49.7]) rail.box(x0, TRACK_Y + 0.14, rz - 0.04, x1, TRACK_Y + 0.3, rz + 0.04, 1, { bottom: false });
      // troisième rail (alimentation) le long du mur
      rail.box(x0, TRACK_Y + 0.2, 51.1, x1, TRACK_Y + 0.32, 51.25, 1, { bottom: false });
      for (let x = x0 + 0.3; x < x1; x += 0.65) sl.box(x - 0.12, TRACK_Y, 47.5, x + 0.12, TRACK_Y + 0.14, 50.4, 1, { bottom: false });
    }
    // escalier de service au bout du quai (descente sur la voie)
    const st = this.batches.get("b_track", "concrete_stairs");
    const n = 6;
    for (let i = 0; i < n; i++) {
      const xa = 116 + (5 * i) / n;
      st.box(xa, TRACK_Y, 46, 116 + 5, TRACK_Y + ((qy - TRACK_Y) * (i + 1)) / n, 47.2, 1, { bottom: false });
    }
    this.colliders.push(makeRamp(118.5, 46.6, 0.6, 2.5, Math.atan2(-1, 0), TRACK_Y, qy, "concrete"));
    // palier en haut des marches, au niveau du quai
    st.box(121, TRACK_Y, 46, 123, qy, 47.2, 1, { bottom: false });
    this.colliders.push(makeAABB(121, TRACK_Y, 46, 123, qy, 47.2, { surface: "concrete" }));
    const rl = this.batches.get("b_track", "metal_rail");
    rl.box(116, TRACK_Y + 1.0, 47.17, 123, TRACK_Y + 1.06, 47.23, 1);
    rl.box(121, qy + 1.0, 47.17, 123, qy + 1.06, 47.23, 1);
    this.colliders.push(makeAABB(116, TRACK_Y, 47.2, 123, TRACK_Y + 2.0, 47.3, { mask: RAIL_MASK }));
    // fond du tunnel : éboulement
    const rock = this.batches.get("b_tunnel", "concrete_tunnel");
    rock.box(138.2, TRACK_Y, 46, 140, TRACK_Y + 2.2, 52, 1);
    rock.box(136.8, TRACK_Y, 46.3, 138.4, TRACK_Y + 1.1, 51.4, 1);
    this.train();
    // banquettes du quai
    // (faites ici : objets lourds, collées au mur nord du couloir de la station)
  }

  /** Rame accidentée : caisse inclinée, vitres sombres, portes, bogies. */
  private train(): void {
    const t = MALL_TRAIN;
    const zone = "b_track";
    const body = this.batches.get(zone, "train_body");
    const stripe = this.batches.get(zone, "train_stripe");
    const glass = this.batches.get(zone, "glass");
    const dark = this.batches.get(zone, "paint_gray_dark");
    const roll = 0.07;
    const fwd = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
    const side = { x: Math.cos(t.yaw), z: -Math.sin(t.yaw) };
    const base = TRACK_Y + 0.55;
    const H = 2.9;
    const hl = t.length / 2;
    const hw = t.width / 2;
    // repère : (l, w, h) → monde, avec roulis autour de l'axe longitudinal
    const W = (l: number, w: number, h: number): V3 => {
      const wr = w * Math.cos(roll) - h * Math.sin(roll);
      const hr = w * Math.sin(roll) + h * Math.cos(roll);
      return { x: t.x + fwd.x * l + side.x * wr, y: base + hr, z: t.z + fwd.z * l + side.z * wr };
    };
    const quad = (b: MeshBatch, a: V3, bb: V3, c: V3, d: V3, uw: number, vh: number) => {
      const ex = { x: bb.x - a.x, y: bb.y - a.y, z: bb.z - a.z };
      const ey = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z };
      let nx = ex.y * ey.z - ex.z * ey.y;
      let ny = ex.z * ey.x - ex.x * ey.z;
      let nz = ex.x * ey.y - ex.y * ey.x;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // normale tournée vers l'extérieur de la caisse
      const mx = (a.x + c.x) / 2 - t.x;
      const my = (a.y + c.y) / 2 - (base + H / 2);
      const mz = (a.z + c.z) / 2 - t.z;
      if (nx * mx + ny * my + nz * mz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const i0 = b.vertex(a.x, a.y, a.z, nx, ny, nz, 0, 0);
      const i1 = b.vertex(bb.x, bb.y, bb.z, nx, ny, nz, uw, 0);
      const i2 = b.vertex(c.x, c.y, c.z, nx, ny, nz, uw, vh);
      const i3 = b.vertex(d.x, d.y, d.z, nx, ny, nz, 0, vh);
      b.tri(i0, i1, i2, nx, ny, nz);
      b.tri(i0, i2, i3, nx, ny, nz);
    };
    // caisse : flancs (bas, bande, haut au-dessus des vitres), toit, bouts
    for (const s of [-1, 1]) {
      const w = s * hw;
      const span = (h0: number, h1: number, b: MeshBatch) =>
        s > 0 ? quad(b, W(-hl, w, h0), W(hl, w, h0), W(hl, w, h1), W(-hl, w, h1), t.length, h1 - h0) : quad(b, W(hl, w, h0), W(-hl, w, h0), W(-hl, w, h1), W(hl, w, h1), t.length, h1 - h0);
      span(0, 0.85, body);
      span(0.85, 1.05, stripe);
      span(1.05, 1.15, body);
      span(1.95, H - 0.2, body);
      // vitres et portes (légèrement en avant)
      const off = s * 0.012;
      for (let i = 0; i < 4; i++) {
        const l0 = -hl + 1.2 + i * 4.1;
        const l1 = l0 + 2.6;
        const g = (a: number, b2: number, h0: number, h1: number, mat: MeshBatch) =>
          s > 0 ? quad(mat, W(a, w + off, h0), W(b2, w + off, h0), W(b2, w + off, h1), W(a, w + off, h1), b2 - a, h1 - h0) : quad(mat, W(b2, w + off, h0), W(a, w + off, h0), W(a, w + off, h1), W(b2, w + off, h1), b2 - a, h1 - h0);
        g(l0, l1, 1.15, 1.95, glass);
        g(l1 + 0.15, l1 + 1.35, 0.08, 2.1, dark);
      }
      span(1.15, 1.95, dark);
    }
    quad(body, W(-hl, hw, H - 0.2), W(hl, hw, H - 0.2), W(hl, 0, H), W(-hl, 0, H), t.length, hw);
    quad(body, W(hl, -hw, H - 0.2), W(-hl, -hw, H - 0.2), W(-hl, 0, H), W(hl, 0, H), t.length, hw);
    for (const e of [-1, 1]) {
      const l = e * hl;
      const a = W(l, -hw, 0);
      const b2 = W(l, hw, 0);
      const c = W(l, hw, H - 0.2);
      const d = W(l, -hw, H - 0.2);
      if (e > 0) quad(body, a, b2, c, d, t.width, H);
      else quad(body, b2, a, d, c, t.width, H);
    }
    // plancher et bogies
    quad(dark, W(hl, -hw, 0), W(-hl, -hw, 0), W(-hl, hw, 0), W(hl, hw, 0), t.length, t.width);
    const bog = this.batches.get(zone, "rail_steel");
    for (const l of [-hl + 2.4, hl - 2.4]) {
      const c = W(l, 0, -0.3);
      bog.box(c.x - 1.2, TRACK_Y + 0.14, c.z - 1.0, c.x + 1.2, TRACK_Y + 0.6, c.z + 1.0, 1);
    }
    this.colliders.push(makeBox(t.x, t.z, hw + 0.05, hl, TRACK_Y, base + H, { angle: -t.yaw + Math.PI / 2, surface: "metal" }));
  }

  // ------------------------------------------------------------------ rideaux métalliques

  private shutters(): void {
    // entrée du parking (rampe condamnée) et rideau du quai de livraison
    this.shutter("b_park_sw", 26, 0.13, 6, -5, 3.0, 1);
    this.shutter("b_dock", 74, 0.13, 5.5, -5, 3.0, 1);
  }

  private shutter(zone: string, cx: number, z: number, w: number, y: number, h: number, out: number): void {
    const b = this.batches.get(zone, "shutter");
    b.quad({ x: cx - w / 2, y, z }, { x: w, y: 0, z: 0 }, { x: 0, y: h, z: 0 }, { x: 0, y: 0, z: out }, [0, 0], [w, h * 2], Math.ceil(w), Math.ceil(h * 2));
    const rib = this.batches.get(zone, "metal_rail");
    rib.box(cx - w / 2 - 0.12, y, z - 0.05, cx - w / 2, y + h + 0.3, z + 0.14, 1);
    rib.box(cx + w / 2, y, z - 0.05, cx + w / 2 + 0.12, y + h + 0.3, z + 0.14, 1);
    rib.box(cx - w / 2 - 0.12, y + h, z - 0.05, cx + w / 2 + 0.12, y + h + 0.45, z + 0.3, 1);
  }

  // ------------------------------------------------------------------ extérieur

  private exterior(): void {
    const Z = EXTERIOR_ZONE;
    this.ground("asphalt", -30, -46, 140, -4, "concrete");
    this.ground("sidewalk", -30, -4, 140, 0, "concrete");
    this.ground("sidewalk", -30, 0, 0, 100, "concrete");
    this.ground("sidewalk", 110, 0, 140, 100, "concrete");
    this.ground("sidewalk", 0, 70, 110, 100, "concrete");
    this.ground("road", -60, -62, 170, -46, "concrete", false);
    this.ground("grass_ext", -60, -46, -30, 130, "grass", false);
    this.ground("grass_ext", 140, -46, 170, 130, "grass", false);
    this.ground("grass_ext", -30, 100, 140, 130, "grass", false);
    // marquage du parking extérieur
    const paint = this.batches.get(Z, "paint_white");
    for (const zc of [-14, -24, -34]) {
      for (let x = -26; x < 136; x += 2.7) {
        if (Math.abs(x - 55) < 6) continue;
        paint.quad({ x, y: 0.008, z: zc - 2.4 }, { x: 0.1, y: 0, z: 0 }, { x: 0, y: 0, z: 4.8 }, { x: 0, y: 1, z: 0 }, [0, 0], [0.1, 4.8]);
      }
    }
    // auvent de l'entrée
    const canopy = this.batches.get(Z, "mall_fascia");
    canopy.box(48, 4.3, -4.5, 62, 4.6, 0, 1);
    for (const cx of [48.6, 61.4]) {
      canopy.box(cx - 0.15, 0, -4.2, cx + 0.15, 4.3, -3.9, 1);
      this.colliders.push(makeAABB(cx - 0.15, 0, -4.2, cx + 0.15, 4.3, -3.9));
    }
    // grande enseigne sur la façade
    const idx = signIndex("LES GALERIES DU VAL");
    if (idx >= 0) this.sign(Z, "x", -0.14, 55, 6.6, -1, idx, 9, 4.5);
  }

  private ground(mat: string, x0: number, z0: number, x1: number, z1: number, surface: Surface, collide = true): void {
    const b = this.batches.get(EXTERIOR_ZONE, mat);
    const w = x1 - x0;
    const d = z1 - z0;
    b.quad({ x: x0, y: 0, z: z0 }, { x: w, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: 1, z: 0 }, [x0, z0], [w, d], Math.ceil(w / 3), Math.ceil(d / 3));
    if (collide) this.colliders.push(makeAABB(x0, -0.8, z0, x1, 0, z1, { surface }));
  }
}
