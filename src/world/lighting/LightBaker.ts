import type { ZoneInfo } from "../builder/ArchitectureBuilder";
import type { MeshBatch } from "../builder/MeshBatch";
import type { Fixture } from "./Lights";
import type { VoxelGrid } from "./VoxelGrid";

/** Direction (normalisée) vers la lune : haute, au sud-ouest (éclaire la façade principale). */
const MOON = (() => {
  const v = [-0.38, 0.78, -0.5];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();
const MOON_COLOR = [0.24, 0.3, 0.46] as const;
const SKY_COLOR = [0.036, 0.046, 0.075] as const;
const MIN_AMBIENT = [0.0045, 0.0048, 0.0058] as const;

/** Directions d'hémisphère (pondération cosinus) pour l'AO et la visibilité du ciel. */
const HEMI: Array<[number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt((i + 0.5) / n);
    out.push([Math.cos(a) * r, Math.sqrt(1 - r * r), Math.sin(a) * r]);
  }
  return out;
})();

interface LightGrid {
  cell: number;
  map: Map<number, Fixture[]>;
}

/**
 * Précalcul de l'éclairage par sommet :
 * irradiance des luminaires (ombres via voxels), lune et ciel (à travers les fenêtres),
 * occlusion ambiante, rebond approximé par zone. Sortie : attributs `bake` / `bake2`.
 */
export class LightBaker {
  private grid: LightGrid = { cell: 6, map: new Map() };
  /** irradiance directe moyenne par zone (pour le rebond) */
  private zoneAvg = new Map<string, [number, number, number, number]>();
  private probeCache = new Map<number, [number, number, number, number, number, number, number, number]>();

  constructor(
    private readonly vox: VoxelGrid,
    fixtures: Fixture[],
    private readonly zones: Map<string, ZoneInfo>,
    private readonly zoneSlots: Map<string, number>,
    /** part du ciel et de la lune qui atteint l'intérieur (verrières sales : < 1) */
    private readonly indoorSky = 1,
  ) {
    for (const f of fixtures) {
      if (f.state === "off") continue;
      const r = f.range;
      const c = this.grid.cell;
      for (let x = Math.floor((f.x - r) / c); x <= Math.floor((f.x + r) / c); x++)
        for (let y = Math.floor((f.y - r) / c); y <= Math.floor((f.y + r) / c); y++)
          for (let z = Math.floor((f.z - r) / c); z <= Math.floor((f.z + r) / c); z++) {
            const k = this.key(x, y, z);
            const list = this.grid.map.get(k) ?? [];
            list.push(f);
            this.grid.map.set(k, list);
          }
    }
  }

  private key(x: number, y: number, z: number): number {
    return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  }

  private lightsAt(x: number, y: number, z: number): Fixture[] {
    const c = this.grid.cell;
    return this.grid.map.get(this.key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c))) ?? [];
  }

  /**
   * Irradiance directe en un point. `omni` : ignore l'orientation (objets, sondes).
   * Renvoie dans `out` : [static r,g,b, flicker r,g,b, ao, skyVis].
   */
  private evalPoint(
    px: number,
    py: number,
    pz: number,
    nx: number,
    ny: number,
    nz: number,
    omni: boolean,
    slot: number,
    outdoorZone: boolean,
    out: Float32Array,
  ): void {
    const vox = this.vox;
    // point de départ décollé de la surface
    const off = omni ? 0 : 0.28;
    const sx = px + nx * off;
    const sy = py + ny * off;
    const sz = pz + nz * off;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let fr = 0;
    let fg = 0;
    let fb = 0;
    for (const L of this.lightsAt(px, py, pz)) {
      const dx = L.x - sx;
      const dy = L.y - sy;
      const dz = L.z - sz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.range * L.range) continue;
      const d = Math.sqrt(d2);
      const lx = dx / d;
      const ly = dy / d;
      const lz = dz / d;
      const cosS = omni ? 0.75 : lx * nx + ly * ny + lz * nz;
      if (cosS <= 0) continue;
      // les néons de plafond émettent vers le bas (lobe cosinus + un peu de diffusion)
      let emit = 1;
      // ly > 0 : le luminaire est au-dessus du point éclairé
      if (L.kind === "neon" || L.kind === "canopy") emit = Math.max(0, ly) * 0.85 + 0.15;
      else if (L.kind === "street") emit = Math.max(0, ly) * 0.9 + 0.1;
      if (emit <= 0) continue;
      const fall = 1 - (d / L.range) ** 4;
      let k = (cosS * emit * fall * fall) / (d2 + 0.35);
      if (k < 0.0004) continue;
      // ombre : marche jusqu'à 0.35 m du luminaire (le luminaire est dans le plafond)
      const reach = d - 0.35;
      if (reach > 0.2 && vox.march(sx, sy, sz, lx, ly, lz, reach, 0.18) >= 0) continue;
      if (L.slot > 0 && L.slot === slot) {
        fr += L.color[0] * k;
        fg += L.color[1] * k;
        fb += L.color[2] * k;
      } else {
        // clignotement d'une autre zone : on garde une contribution stable atténuée
        if (L.slot > 0) k *= 0.5;
        sr += L.color[0] * k;
        sg += L.color[1] * k;
        sb += L.color[2] * k;
      }
    }

    // occlusion ambiante (rayons courts) + visibilité du ciel (rayons longs)
    let occl = 0;
    let sky = 0;
    // repère tangent
    let tx: number, ty: number, tz: number;
    if (omni) {
      tx = 1;
      ty = 0;
      tz = 0;
      nx = 0;
      ny = 1;
      nz = 0;
    } else if (Math.abs(ny) < 0.9) {
      tx = -nz;
      ty = 0;
      tz = nx;
    } else {
      tx = 1;
      ty = 0;
      tz = 0;
    }
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    const bx = ny * tz - nz * ty;
    const by = nz * tx - nx * tz;
    const bz = nx * ty - ny * tx;
    for (const h of HEMI) {
      const rx = tx * h[0] + nx * h[1] + bx * h[2];
      const ry = ty * h[0] + ny * h[1] + by * h[2];
      const rz = tz * h[0] + nz * h[1] + bz * h[2];
      const hit = vox.march(sx, sy, sz, rx, ry, rz, 14, 0.24);
      if (hit >= 0 && hit < 0.9) occl += 1 - hit / 0.9;
      if (hit < 0 && ry > 0.05) sky += ry;
    }
    const ao = 1 - (occl / HEMI.length) * 0.85;
    const skyVis = (sky / HEMI.length) * (outdoorZone ? 1 : this.indoorSky);
    // ciel nocturne
    sr += SKY_COLOR[0] * skyVis * 2.2;
    sg += SKY_COLOR[1] * skyVis * 2.2;
    sb += SKY_COLOR[2] * skyVis * 2.2;
    // lune (ombres portées, taches de lumière à travers les fenêtres)
    const cm = omni ? 0.6 : nx * MOON[0] + ny * MOON[1] + nz * MOON[2];
    if (cm > 0 && (outdoorZone || skyVis > 0 || !omni)) {
      if (vox.march(sx, sy, sz, MOON[0], MOON[1], MOON[2], 45, 0.25) < 0) {
        const k = outdoorZone ? cm : cm * this.indoorSky;
        sr += MOON_COLOR[0] * k;
        sg += MOON_COLOR[1] * k;
        sb += MOON_COLOR[2] * k;
      }
    }
    out[0] = sr;
    out[1] = sg;
    out[2] = sb;
    out[3] = fr;
    out[4] = fg;
    out[5] = fb;
    out[6] = ao;
    out[7] = skyVis;
  }

  /** Précalcule un lot de géométrie (sommet par sommet). */
  bakeBatch(batch: MeshBatch): void {
    const zone = this.zones.get(batch.zone);
    const outdoor = !!zone?.outdoor;
    const slot = this.zoneSlots.get(batch.zone) ?? 0;
    const n = batch.vertexCount;
    const bake = new Array<number>(n * 4);
    const bake2 = new Array<number>(n * 4);
    const out = new Float32Array(8);
    const P = batch.positions;
    const Nn = batch.normals;
    let ar = 0;
    let ag = 0;
    let ab = 0;
    for (let i = 0; i < n; i++) {
      this.evalPoint(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!, Nn[i * 3]!, Nn[i * 3 + 1]!, Nn[i * 3 + 2]!, false, slot, outdoor, out);
      bake[i * 4] = out[0]!;
      bake[i * 4 + 1] = out[1]!;
      bake[i * 4 + 2] = out[2]!;
      bake[i * 4 + 3] = out[6]!;
      bake2[i * 4] = out[3]!;
      bake2[i * 4 + 1] = out[4]!;
      bake2[i * 4 + 2] = out[5]!;
      bake2[i * 4 + 3] = slot;
      ar += out[0]! + out[3]! * 0.7;
      ag += out[1]! + out[4]! * 0.7;
      ab += out[2]! + out[5]! * 0.7;
    }
    batch.bake = bake;
    batch.bake2 = bake2;
    const acc = this.zoneAvg.get(batch.zone) ?? [0, 0, 0, 0];
    acc[0] += ar;
    acc[1] += ag;
    acc[2] += ab;
    acc[3] += n;
    this.zoneAvg.set(batch.zone, acc);
  }

  /** Ajoute le rebond approximé (moyenne de la zone) + l'ambiance minimale. À appeler après tous les lots. */
  finalizeBatch(batch: MeshBatch): void {
    const acc = this.zoneAvg.get(batch.zone);
    const zone = this.zones.get(batch.zone);
    const k = zone?.outdoor ? 0.12 : 0.32;
    const br = acc && acc[3] > 0 ? (acc[0] / acc[3]) * k : 0;
    const bg = acc && acc[3] > 0 ? (acc[1] / acc[3]) * k : 0;
    const bb = acc && acc[3] > 0 ? (acc[2] / acc[3]) * k : 0;
    const b = batch.bake;
    for (let i = 0; i < b.length; i += 4) {
      const ao = b[i + 3]!;
      const aoAmb = 0.35 + 0.65 * ao;
      b[i] = b[i]! + (br + MIN_AMBIENT[0]) * aoAmb;
      b[i + 1] = b[i + 1]! + (bg + MIN_AMBIENT[1]) * aoAmb;
      b[i + 2] = b[i + 2]! + (bb + MIN_AMBIENT[2]) * aoAmb;
    }
  }

  /** Irradiance omnidirectionnelle en un point (props, objets dynamiques, monstre). */
  probe(x: number, y: number, z: number, zoneId: string | null): [number, number, number, number, number, number, number, number] {
    const kx = Math.round(x * 2);
    const ky = Math.round(y * 2);
    const kz = Math.round(z * 2);
    const key = (kx + 2048) * 16777216 + (ky + 64) * 4096 + (kz + 2048);
    const cached = this.probeCache.get(key);
    if (cached) return cached;
    const out = new Float32Array(8);
    const zone = zoneId ? this.zones.get(zoneId) : undefined;
    const slot = zoneId ? (this.zoneSlots.get(zoneId) ?? 0) : 0;
    this.evalPoint(kx / 2, ky / 2, kz / 2, 0, 1, 0, true, slot, !!zone?.outdoor, out);
    const acc = zoneId ? this.zoneAvg.get(zoneId) : undefined;
    const k = zone?.outdoor ? 0.12 : 0.32;
    const add = (c: number) => (acc && acc[3] > 0 ? (acc[c]! / acc[3]) * k : 0);
    const res: [number, number, number, number, number, number, number, number] = [
      out[0]! + add(0) + MIN_AMBIENT[0],
      out[1]! + add(1) + MIN_AMBIENT[1],
      out[2]! + add(2) + MIN_AMBIENT[2],
      out[6]!,
      out[3]!,
      out[4]!,
      out[5]!,
      slot,
    ];
    this.probeCache.set(key, res);
    return res;
  }
}
