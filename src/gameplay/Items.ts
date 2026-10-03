import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import { floorFree, type Anchor } from "./Anchors";
import { ITEMS, type ItemId } from "./data/items";
import type { CodeNoteDef } from "./data/spawns";
import type { Interactable, Prompt, Shape } from "./Interaction";
import { ITEM_CENTER_Y, ITEM_SCALE, ITEM_STATIC, itemPropId } from "./models/items";

/** Objet ramassable présent dans le monde. */
export interface WorldItem {
  item: ItemId;
  inst: PropInstance;
  /** dans le monde (sinon : porté / utilisé) */
  inWorld: boolean;
  x: number;
  y: number;
  z: number;
  baseYaw: number;
  room: string;
  sector: string;
  /** dans un coffre : interactif seulement une fois le coffre ouvert */
  safe: string | null;
  phase: number;
}

/** Note (code ou ambiance). */
export interface WorldNote {
  id: string;
  author: string;
  text: string;
  /** note à code : définition (code révélé, partie) */
  codeOf: CodeNoteDef | null;
  label: string;
  inst: PropInstance;
  placed: boolean;
  x: number;
  y: number;
  z: number;
  sector: string;
}

const _q = new Quaternion();
const _m = new Matrix();
const _s = new Vector3();
const _t = new Vector3();

/**
 * Objets ramassables et notes : placement par run, rotation / flottement, lueur (matériau
 * émissif pulsé + halo additif coloré), ramassage, échange, lâcher.
 */
export class ItemSystem {
  readonly items: WorldItem[] = [];
  readonly notes: WorldNote[] = [];
  private halo: Mesh;
  private haloMatrices: Float32Array;
  private haloColors: Float32Array;
  private haloCount = 0;
  private readonly capacity: number;
  /** safes ouverts (les objets à l'intérieur deviennent ramassables) */
  openSafes = new Set<string>();
  /** callback : note lue */
  onRead: ((note: WorldNote) => void) | null = null;
  sectorVisible: (sector: string) => boolean = () => true;
  private tmp: import("../physics/Collider").Collider[] = [];

  constructor(
    scene: Scene,
    private readonly world: World,
    private readonly props: PropSystem,
    private readonly itemsMaterial: () => PBRMaterial,
    /** objets présents sur la carte et nombre d'exemplaires */
    counts: Partial<Record<ItemId, number>>,
  ) {
    for (const id of Object.keys(counts) as ItemId[]) {
      for (let i = 0; i < (counts[id] ?? 0); i++) {
        const inst = props.add(itemPropId(id), 0, -50, 0, 0, "ext", "*", { hidden: true, scale: ITEM_SCALE[id] });
        this.items.push({ item: id, inst, inWorld: false, x: 0, y: -50, z: 0, baseYaw: 0, room: "ext", sector: "*", safe: null, phase: i * 1.7 + id.length });
      }
    }
    this.capacity = this.items.length + 16;
    // halo : plan additif en thin instances (matrice + couleur)
    const plane = CreatePlane("itemHalo", { size: 1 }, scene);
    const mat = new StandardMaterial("itemHaloMat", scene);
    mat.diffuseTexture = haloTexture(scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    mat.alpha = 0.999;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.disableDepthWrite = true;
    mat.backFaceCulling = false;
    mat.fogEnabled = true;
    plane.material = mat;
    plane.isPickable = false;
    this.haloMatrices = new Float32Array(this.capacity * 16);
    this.haloColors = new Float32Array(this.capacity * 4);
    plane.thinInstanceSetBuffer("matrix", this.haloMatrices, 16, false);
    plane.thinInstanceSetBuffer("color", this.haloColors, 4, false);
    plane.thinInstanceCount = 0;
    this.halo = plane;
  }

  /** Crée une note (instances créées au chargement, placées à chaque run). */
  addNote(id: string, author: string, text: string, label: string, codeOf: CodeNoteDef | null): WorldNote {
    const inst = this.props.add("item_note", 0, -50, 0, 0, "ext", "*", { hidden: true });
    const n: WorldNote = { id, author, text, codeOf, label, inst, placed: false, x: 0, y: -50, z: 0, sector: "*" };
    this.notes.push(n);
    return n;
  }

  /** Retire tout du monde (nouvelle run / menu). */
  clear(): void {
    for (const it of this.items) this.hide(it);
    for (const n of this.notes) {
      n.placed = false;
      this.props.setHidden(n.inst, true);
    }
    this.openSafes.clear();
    this.haloCount = 0;
    this.halo.thinInstanceCount = 0;
    this.halo.setEnabled(false);
  }

  private hide(it: WorldItem): void {
    it.inWorld = false;
    it.safe = null;
    this.props.setHidden(it.inst, true);
  }

  /** Pose un objet (non encore placé) à une ancre. */
  place(item: ItemId, a: Anchor, safe: string | null = null): WorldItem | null {
    const it = this.items.find((x) => x.item === item && !x.inWorld);
    if (!it) return null;
    this.putAt(it, a.x, a.y, a.z, a.yaw, a.room, a.sector);
    it.safe = safe;
    return it;
  }

  placeNote(n: WorldNote, a: Anchor): void {
    n.placed = true;
    n.x = a.x;
    n.y = a.y;
    n.z = a.z;
    n.sector = a.sector;
    this.props.setZone(n.inst, a.room, a.sector);
    this.props.move(n.inst, a.x, a.y, a.z, a.yaw);
    this.props.relight(n.inst);
    this.props.setHidden(n.inst, false);
  }

  private putAt(it: WorldItem, x: number, y: number, z: number, yaw: number, room: string, sector: string): void {
    it.inWorld = true;
    it.x = x;
    it.y = y;
    it.z = z;
    it.baseYaw = yaw;
    it.room = room;
    it.sector = sector;
    this.props.setZone(it.inst, room, sector);
    this.props.move(it.inst, x, y, z, yaw);
    this.props.relight(it.inst);
    this.props.setHidden(it.inst, false);
  }

  /** Ramasse (retire du monde). */
  take(it: WorldItem): void {
    this.hide(it);
  }

  /** Lâche un objet au sol devant (x, z) ; renvoie false si aucune place. */
  drop(item: ItemId, px: number, py: number, pz: number, yaw: number, preferX?: number, preferY?: number, preferZ?: number): boolean {
    const it = this.items.find((x) => x.item === item && !x.inWorld);
    if (!it) return false;
    const w = this.world;
    // échange : à l'emplacement exact de l'objet ramassé
    if (preferX !== undefined && preferY !== undefined && preferZ !== undefined) {
      const room = w.roomAt(preferX, preferY + 0.2, preferZ);
      this.putAt(it, preferX, preferY, preferZ, yaw, room?.id ?? "ext", room?.sector ?? "ext");
      return true;
    }
    const tries: Array<[number, number]> = [
      [0.75, 0],
      [0.5, 0],
      [0.5, 0.5],
      [0.5, -0.5],
      [0.3, 0],
      [0, 0],
    ];
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    for (const [f, r] of tries) {
      const x = px + s * f + c * r;
      const z = pz + c * f - s * r;
      const g = w.collisionGround(x, z, py + 0.5);
      if (g < py - 1.5) continue;
      if (!floorFree(w.collision, x, g, z, 0.12, 0.3, this.tmp)) continue;
      const room = w.roomAt(x, g + 0.2, z);
      this.putAt(it, x, g, z, yaw + 0.7, room?.id ?? "ext", room?.sector ?? "ext");
      return true;
    }
    return false;
  }

  /** Interactifs : objets + notes. */
  interactables(onPickup: (it: WorldItem) => void): Interactable[] {
    const out: Interactable[] = [];
    for (const it of this.items) {
      const shape: Shape = { kind: "sphere", x: 0, y: 0, z: 0, r: 0.2 };
      out.push({
        id: `item_${it.item}_${out.length}`,
        active: () => it.inWorld && (!it.safe || this.openSafes.has(it.safe)),
        shape: () => {
          if (shape.kind === "sphere") {
            shape.x = it.x;
            shape.y = it.y + ITEM_CENTER_Y[it.item] * ITEM_SCALE[it.item] + 0.03;
            shape.z = it.z;
            shape.r = it.item === "crowbar" || it.item === "boltCutter" ? 0.3 : 0.2;
          }
          return shape;
        },
        prompt: (ctx): Prompt => {
          const name = ctx.itemName(it.item);
          if (ctx.inventory.slotFor(it.item) >= 0) return { text: `Ramasser — ${name}`, enabled: true };
          const sel = ctx.inventory.slots[ctx.inventory.selected];
          return { text: `Échanger — ${name} (contre ${sel ? ctx.itemName(sel.item) : "?"})`, enabled: true };
        },
        interact: () => onPickup(it),
      });
    }
    for (const n of this.notes) {
      const shape: Shape = { kind: "sphere", x: 0, y: 0, z: 0, r: 0.2 };
      out.push({
        id: `note_${n.id}`,
        active: () => n.placed,
        shape: () => {
          if (shape.kind === "sphere") {
            shape.x = n.x;
            shape.y = n.y + 0.03;
            shape.z = n.z;
          }
          return shape;
        },
        prompt: () => ({ text: n.label ? `Lire — ${n.label}` : "Lire", enabled: true }),
        interact: () => this.onRead?.(n),
      });
    }
    return out;
  }

  /** Animation (rotation, flottement), pulsation de la lueur, halos. */
  update(time: number, camX: number, camY: number, camZ: number, camRot: Vector3): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
    const m = this.itemsMaterial();
    const g = 0.14 + pulse * 0.16;
    m.emissiveColor.set(g, g, g);
    Quaternion.RotationYawPitchRollToRef(camRot.y, camRot.x, 0, _q);
    let n = 0;
    const addHalo = (x: number, y: number, z: number, color: string, size: number, alpha: number) => {
      if (n >= this.capacity) return;
      _s.set(size, size, size);
      _t.set(x, y, z);
      Matrix.ComposeToRef(_s, _q, _t, _m);
      _m.copyToArray(this.haloMatrices, n * 16);
      const c = hexColor(color);
      this.haloColors[n * 4] = c[0] * alpha;
      this.haloColors[n * 4 + 1] = c[1] * alpha;
      this.haloColors[n * 4 + 2] = c[2] * alpha;
      this.haloColors[n * 4 + 3] = 1;
      n++;
    };
    for (const it of this.items) {
      if (!it.inWorld) continue;
      const cy = ITEM_CENTER_Y[it.item] * ITEM_SCALE[it.item];
      if (!ITEM_STATIC[it.item]) {
        const bob = 0.025 + Math.sin(time * 2.1 + it.phase) * 0.018;
        this.props.move(it.inst, it.x, it.y + bob, it.z, it.baseYaw + time * 1.3 + it.phase);
      }
      const d2 = (it.x - camX) ** 2 + (it.y - camY) ** 2 + (it.z - camZ) ** 2;
      if (d2 > 30 * 30 || !this.sectorVisible(it.sector)) continue;
      if (it.safe && !this.openSafes.has(it.safe)) continue;
      addHalo(it.x, it.y + cy + 0.03, it.z, ITEMS[it.item].color, 0.55 + pulse * 0.12, 0.35 + pulse * 0.2);
    }
    for (const note of this.notes) {
      if (!note.placed) continue;
      const d2 = (note.x - camX) ** 2 + (note.y - camY) ** 2 + (note.z - camZ) ** 2;
      if (d2 > 25 * 25 || !this.sectorVisible(note.sector)) continue;
      addHalo(note.x, note.y + 0.05, note.z, "#fff1c8", 0.45 + pulse * 0.08, 0.2 + pulse * 0.12);
    }
    this.haloCount = n;
    this.halo.thinInstanceCount = n;
    if (n > 0) {
      this.halo.thinInstanceBufferUpdated("matrix");
      this.halo.thinInstanceBufferUpdated("color");
      this.halo.thinInstanceRefreshBoundingInfo(false);
    }
    this.halo.setEnabled(n > 0);
  }

  get visibleHalos(): number {
    return this.haloCount;
  }
}

const colorCache = new Map<string, [number, number, number]>();
function hexColor(c: string): [number, number, number] {
  let v = colorCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    colorCache.set(c, v);
  }
  return v;
}

/** Dégradé radial doux (halo). */
function haloTexture(scene: Scene): DynamicTexture {
  const S = 64;
  const tex = new DynamicTexture("haloTex", { width: S, height: S }, scene, true, Texture.BILINEAR_SAMPLINGMODE);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  tex.update(false);
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}
