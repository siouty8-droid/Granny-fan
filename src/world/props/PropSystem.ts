import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { makeBox, CollisionMask, type Collider, type Surface } from "../../physics/Collider";
import type { CollisionWorld } from "../../physics/CollisionWorld";
import type { LightBaker } from "../lighting/LightBaker";
import type { VoxelGrid } from "../lighting/VoxelGrid";
import { ModelKit } from "./ModelKit";

/** Boîte locale [x0, y0, z0, x1, y1, z1] (repère du prop : sol = 0, avant = +z). */
export type LocalBox = readonly [number, number, number, number, number, number];

export interface PropDef {
  id: string;
  /** construit la géométrie (lod 0 = détaillé, 1 = simplifié) */
  build: (k: ModelKit, lod: 0 | 1) => void;
  /** possède un niveau de détail simplifié */
  lod?: boolean;
  /** distance de bascule vers le LOD1 (m) */
  lodDistance?: number;
  /** boîtes de collision locales */
  colliders?: LocalBox[];
  /** masque des colliders (défaut : joueur + monstre + navmesh) */
  mask?: number;
  surface?: Surface;
  /** occultation pour l'éclairage précalculé (ombres de contact) */
  occluder?: LocalBox[];
  /** projette l'ombre de la lampe torche */
  shadow?: boolean;
  /** matériau spécial (émissif…) ; défaut : atlas des props */
  material?: string;
}

export interface PropInstance {
  def: PropDef;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** rotations supplémentaires (objets renversés) */
  pitch: number;
  roll: number;
  scale: number;
  /** échelle supplémentaire sur l'axe x local (vantaux de largeur variable) */
  sx: number;
  zone: string;
  sector: string;
  colliders: Collider[];
  /** index global dans le type */
  index: number;
  /** masqué par le gameplay (ex. objet déplacé) */
  hidden: boolean;
}

/** Un type de prop = un mesh par niveau de détail, avec des thin instances dynamiques. */
interface PropType {
  def: PropDef;
  instances: PropInstance[];
  lod0: Mesh;
  lod1: Mesh | null;
  /** données précalculées par instance */
  matrices: Float32Array;
  bake: Float32Array;
  bake2: Float32Array;
  /** buffers de rendu (capacité = nombre d'instances) */
  buf0: { m: Float32Array; b: Float32Array; b2: Float32Array };
  buf1: { m: Float32Array; b: Float32Array; b2: Float32Array } | null;
  count0: number;
  count1: number;
  dirty: boolean;
}

const _m = new Matrix();
const _q = new Quaternion();
const _s = new Vector3();
const _t = new Vector3();

/**
 * Props statiques en thin instances : un mesh par type (et par LOD), buffers d'instances
 * remplis côté CPU selon les secteurs visibles (culling par zones) et la distance (LOD).
 * Éclairage précalculé par instance, colliders, occultation des voxels.
 */
export class PropSystem {
  readonly defs = new Map<string, PropDef>();
  readonly instances: PropInstance[] = [];
  private types = new Map<string, PropType>();
  private visibleSectors: Set<string> | null = null;
  private dirty = true;
  private anyTypeDirty = false;
  private baker: LightBaker | null = null;
  private lodTimer = 0;
  private allSectors = new Set<string>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: (id: string) => Material,
  ) {}

  register(def: PropDef): void {
    this.defs.set(def.id, def);
  }

  /** Place une instance. */
  add(
    id: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    zone: string,
    sector: string,
    opts: { pitch?: number; roll?: number; scale?: number; sx?: number; hidden?: boolean } = {},
  ): PropInstance {
    const def = this.defs.get(id);
    if (!def) throw new Error(`prop inconnu : ${id}`);
    const inst: PropInstance = {
      def,
      x,
      y,
      z,
      yaw,
      pitch: opts.pitch ?? 0,
      roll: opts.roll ?? 0,
      scale: opts.scale ?? 1,
      sx: opts.sx ?? 1,
      zone,
      sector,
      colliders: [],
      index: -1,
      hidden: opts.hidden ?? false,
    };
    this.instances.push(inst);
    this.allSectors.add(sector);
    return inst;
  }

  /** Transforme un point local en monde (yaw uniquement, + échelle). */
  toWorld(inst: PropInstance, lx: number, lz: number): [number, number] {
    const c = Math.cos(inst.yaw);
    const s = Math.sin(inst.yaw);
    return [inst.x + (lx * c + lz * s) * inst.scale, inst.z + (-lx * s + lz * c) * inst.scale];
  }

  /** Crée les colliders des instances (avant la navmesh et le bake). */
  buildColliders(world: CollisionWorld, list: PropInstance[] = this.instances): void {
    for (const inst of list) {
      const def = inst.def;
      if (!def.colliders || inst.colliders.length) continue;
      if (inst.pitch !== 0 || inst.roll !== 0) {
        this.addTiltedCollider(inst, world);
        continue;
      }
      for (const b of def.colliders) {
        const cx = (b[0] + b[3]) / 2;
        const cz = (b[2] + b[5]) / 2;
        const [wx, wz] = this.toWorld(inst, cx, cz);
        const c = makeBox(wx, wz, ((b[3] - b[0]) / 2) * inst.scale, ((b[5] - b[2]) / 2) * inst.scale, inst.y + b[1] * inst.scale, inst.y + b[4] * inst.scale, {
          angle: -inst.yaw,
          mask: def.mask ?? CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV | CollisionMask.INTERACT,
          surface: def.surface ?? "metal",
          tag: { prop: inst },
        });
        inst.colliders.push(c);
        world.add(c);
      }
    }
  }

  /** Objet renversé : collider approximatif (boîte basse). */
  private addTiltedCollider(inst: PropInstance, world: CollisionWorld): void {
    let hx = 0;
    let hz = 0;
    let hy = 0;
    for (const b of inst.def.colliders ?? []) {
      hx = Math.max(hx, Math.abs(b[0]), Math.abs(b[3]));
      hz = Math.max(hz, Math.abs(b[2]), Math.abs(b[5]));
      hy = Math.max(hy, b[4]);
    }
    const r = Math.max(hx, hz, hy * 0.6) * inst.scale;
    const c = makeBox(inst.x, inst.z, r * 0.8, r * 0.8, inst.y, inst.y + Math.min(hx, hz, hy) * 1.2 + 0.2, {
      angle: -inst.yaw,
      mask: CollisionMask.PLAYER | CollisionMask.MONSTER | CollisionMask.NAV,
      surface: "metal",
    });
    inst.colliders.push(c);
    world.add(c);
  }

  /** Ajoute les occulteurs des props à la grille de voxels (ombres de contact précalculées). */
  voxelize(vox: VoxelGrid): void {
    for (const inst of this.instances) {
      const boxes = inst.def.occluder ?? (inst.pitch === 0 && inst.roll === 0 ? inst.def.colliders : undefined);
      if (!boxes) continue;
      for (const b of boxes) {
        const corners = [this.toWorld(inst, b[0], b[2]), this.toWorld(inst, b[3], b[2]), this.toWorld(inst, b[0], b[5]), this.toWorld(inst, b[3], b[5])];
        const xs = corners.map((c) => c[0]);
        const zs = corners.map((c) => c[1]);
        vox.fill(Math.min(...xs) + 0.05, inst.y + b[1] * inst.scale, Math.min(...zs) + 0.05, Math.max(...xs) - 0.05, inst.y + b[4] * inst.scale - 0.05, Math.max(...zs) - 0.05);
      }
    }
  }

  private makeMesh(def: PropDef, lod: 0 | 1): Mesh {
    const k = new ModelKit();
    def.build(k, lod);
    const m = k.toMesh(lod === 0 ? `prop_${def.id}` : `prop_${def.id}_lod1`, this.scene);
    m.material = this.materials(def.material ?? "props");
    m.receiveShadows = true;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = false;
    return m;
  }

  /** Crée un mesh par type et calcule l'éclairage par instance. */
  buildGroups(baker: LightBaker | null): void {
    this.baker = baker;
    const byType = new Map<string, PropInstance[]>();
    for (const inst of this.instances) {
      const list = byType.get(inst.def.id) ?? [];
      list.push(inst);
      byType.set(inst.def.id, list);
    }
    for (const [id, list] of byType) {
      const def = list[0]!.def;
      const n = list.length;
      const matrices = new Float32Array(n * 16);
      const bake = new Float32Array(n * 4);
      const bake2 = new Float32Array(n * 4);
      list.forEach((inst, i) => {
        inst.index = i;
        composeMatrix(inst, matrices, i * 16);
        writeBake(baker, inst, bake, bake2, i);
      });
      const lod0 = this.makeMesh(def, 0);
      const lod1 = def.lod ? this.makeMesh(def, 1) : null;
      const mk = () => ({ m: new Float32Array(n * 16), b: new Float32Array(n * 4), b2: new Float32Array(n * 4) });
      const t: PropType = { def, instances: list, lod0, lod1, matrices, bake, bake2, buf0: mk(), buf1: lod1 ? mk() : null, count0: 0, count1: 0, dirty: true };
      this.initMesh(lod0, t.buf0);
      if (lod1 && t.buf1) this.initMesh(lod1, t.buf1);
      this.types.set(id, t);
    }
    this.dirty = true;
  }

  private initMesh(mesh: Mesh, buf: { m: Float32Array; b: Float32Array; b2: Float32Array }): void {
    mesh.thinInstanceSetBuffer("matrix", buf.m, 16, false);
    mesh.thinInstanceSetBuffer("bake", buf.b, 4, false);
    mesh.thinInstanceSetBuffer("bake2", buf.b2, 4, false);
    mesh.thinInstanceCount = 0;
    mesh.setEnabled(false);
  }

  /** Secteurs visibles (culling par zones) ; null = tout. Le secteur « * » est toujours visible. */
  setVisibleSectors(sectors: Set<string> | null): void {
    this.visibleSectors = sectors;
    this.dirty = true;
  }

  get sectors(): string[] {
    return [...this.allSectors];
  }

  /** Masque / réaffiche une instance (objets déplacés par le gameplay). */
  setHidden(inst: PropInstance, hidden: boolean): void {
    if (inst.hidden === hidden) return;
    inst.hidden = hidden;
    this.markDirty(inst);
  }

  private markDirty(inst: PropInstance): void {
    const t = this.types.get(inst.def.id);
    if (t) {
      t.dirty = true;
      this.anyTypeDirty = true;
    } else this.dirty = true;
  }

  /** Déplace une instance (objets dynamiques : portes, objets ramassables, cabine…). */
  move(inst: PropInstance, x: number, y: number, z: number, yaw: number, pitch = inst.pitch, roll = inst.roll): void {
    inst.x = x;
    inst.y = y;
    inst.z = z;
    inst.yaw = yaw;
    inst.pitch = pitch;
    inst.roll = roll;
    const t = this.types.get(inst.def.id);
    if (t && inst.index >= 0) composeMatrix(inst, t.matrices, inst.index * 16);
    this.markDirty(inst);
  }

  /** Change la zone / le secteur d'une instance (objet lâché ailleurs). */
  setZone(inst: PropInstance, zone: string, sector: string): void {
    inst.zone = zone;
    inst.sector = sector;
    this.allSectors.add(sector);
    this.markDirty(inst);
  }

  /** Recalcule l'éclairage précalculé d'une instance à sa position actuelle. */
  relight(inst: PropInstance): void {
    const t = this.types.get(inst.def.id);
    if (!t || inst.index < 0) return;
    writeBake(this.baker, inst, t.bake, t.bake2, inst.index);
    this.markDirty(inst);
  }

  /** Force l'éclairage d'une instance (sonde fournie). */
  setBake(inst: PropInstance, p: ArrayLike<number>): void {
    const t = this.types.get(inst.def.id);
    if (!t || inst.index < 0) return;
    for (let k = 0; k < 4; k++) {
      t.bake[inst.index * 4 + k] = p[k]!;
      t.bake2[inst.index * 4 + k] = p[k + 4] ?? 0;
    }
    this.markDirty(inst);
  }

  /** Reconstruit les buffers d'instances (secteurs visibles + LOD), quelques fois par seconde. */
  update(dt: number, cx: number, cy: number, cz: number, force = false): void {
    this.lodTimer -= dt;
    const full = this.dirty || this.lodTimer <= 0 || force;
    if (!full && !this.anyTypeDirty) return;
    if (full) {
      this.lodTimer = 0.25;
      this.dirty = false;
    }
    this.anyTypeDirty = false;
    const vis = this.visibleSectors;
    for (const t of this.types.values()) {
      if (!full && !t.dirty) continue;
      t.dirty = false;
      const d2max = (t.def.lodDistance ?? 12) ** 2;
      let n0 = 0;
      let n1 = 0;
      for (let i = 0; i < t.instances.length; i++) {
        const inst = t.instances[i]!;
        if (inst.hidden || (vis && inst.sector !== "*" && !vis.has(inst.sector))) continue;
        let target = t.buf0;
        let k = n0;
        if (t.buf1) {
          const dx = inst.x - cx;
          const dy = inst.y - cy;
          const dz = inst.z - cz;
          if (dx * dx + dy * dy * 4 + dz * dz > d2max) {
            target = t.buf1;
            k = n1++;
          } else n0++;
        } else n0++;
        target.m.set(t.matrices.subarray(i * 16, i * 16 + 16), k * 16);
        target.b.set(t.bake.subarray(i * 4, i * 4 + 4), k * 4);
        target.b2.set(t.bake2.subarray(i * 4, i * 4 + 4), k * 4);
      }
      this.commit(t.lod0, n0, t.count0);
      t.count0 = n0;
      if (t.lod1) {
        this.commit(t.lod1, n1, t.count1);
        t.count1 = n1;
      }
    }
  }

  private commit(mesh: Mesh, n: number, _prev: number): void {
    mesh.thinInstanceCount = n;
    if (n > 0) {
      mesh.thinInstanceBufferUpdated("matrix");
      mesh.thinInstanceBufferUpdated("bake");
      mesh.thinInstanceBufferUpdated("bake2");
      mesh.thinInstanceRefreshBoundingInfo(false);
    }
    mesh.setEnabled(n > 0);
  }

  /** Meshes projetant l'ombre de la lampe (LOD0 des types concernés). */
  shadowCasters(): Mesh[] {
    const out: Mesh[] = [];
    for (const t of this.types.values()) if (t.def.shadow) out.push(t.lod0);
    return out;
  }

  meshes(): Mesh[] {
    const out: Mesh[] = [];
    for (const t of this.types.values()) {
      out.push(t.lod0);
      if (t.lod1) out.push(t.lod1);
    }
    return out;
  }

  get typeCount(): number {
    return this.types.size;
  }
}

function composeMatrix(inst: PropInstance, out: Float32Array, offset: number): void {
  Quaternion.RotationYawPitchRollToRef(inst.yaw, inst.pitch, inst.roll, _q);
  _s.set(inst.scale * inst.sx, inst.scale, inst.scale);
  _t.set(inst.x, inst.y, inst.z);
  Matrix.ComposeToRef(_s, _q, _t, _m);
  _m.copyToArray(out, offset);
}

function writeBake(baker: LightBaker | null, inst: PropInstance, bake: Float32Array, bake2: Float32Array, i: number): void {
  const p = baker ? baker.probe(inst.x, inst.y + 0.6, inst.z, inst.zone) : [0.05, 0.05, 0.05, 1, 0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    bake[i * 4 + k] = p[k]!;
    bake2[i * 4 + k] = p[k + 4]!;
  }
}
