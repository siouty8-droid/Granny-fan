import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Portal, ZoneInfo } from "../world/builder/ArchitectureBuilder";
import type { PropSystem } from "../world/props/PropSystem";

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const _v = new Vector3();
const _p = new Vector3();

/**
 * Culling par zones et portails : depuis la zone de la caméra, on traverse les portails
 * (portes, fenêtres, arches, cages) visibles dans un rectangle écran qui se rétrécit à chaque
 * portail. Seules les zones atteintes (et leurs secteurs de props) sont activées.
 */
export class ZoneCulling {
  enabled = true;
  /** portails fermés (portes) — renseigné par le gameplay */
  isPortalOpen: (p: Portal) => boolean = () => true;
  readonly visible = new Set<string>();
  private prevVisible = new Set<string>();
  private best = new Map<string, Rect>();
  private viewProj = new Matrix();
  private sectorOfZone = new Map<string, string>();
  visibleSectors = new Set<string>();
  maxDepth = 9;

  constructor(
    private readonly zones: Map<string, ZoneInfo>,
    private readonly zoneMeshes: Map<string, Mesh[]>,
    private readonly props: PropSystem,
  ) {
    for (const z of zones.values()) this.sectorOfZone.set(z.id, z.sector);
    // tout masquer au départ
    for (const list of zoneMeshes.values()) for (const m of list) m.setEnabled(false);
    props.setVisibleSectors(new Set());
  }

  /** Active tout (menu, debug). */
  showAll(): void {
    for (const list of this.zoneMeshes.values()) for (const m of list) m.setEnabled(true);
    this.props.setVisibleSectors(null);
    this.prevVisible = new Set(this.zones.keys());
  }

  update(camera: Camera, cameraZone: string): void {
    if (!this.enabled) {
      this.showAll();
      return;
    }
    this.visible.clear();
    this.best.clear();
    camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), this.viewProj);
    const cam = camera.globalPosition;
    const start = this.zones.has(cameraZone) ? cameraZone : "ext";
    const stack: Array<{ zone: string; rect: Rect; depth: number; from: Portal | null }> = [
      { zone: start, rect: { x0: -1, y0: -1, x1: 1, y1: 1 }, depth: 0, from: null },
    ];
    this.best.set(start, { x0: -1, y0: -1, x1: 1, y1: 1 });
    let guard = 0;
    while (stack.length && guard++ < 2000) {
      const cur = stack.pop()!;
      this.visible.add(cur.zone);
      if (cur.depth >= this.maxDepth) continue;
      const z = this.zones.get(cur.zone);
      if (!z) continue;
      for (const p of z.portals) {
        if (p === cur.from) continue;
        if (!this.isPortalOpen(p)) continue;
        const next = p.a === cur.zone ? p.b : p.a;
        const r = this.portalRect(p, cam);
        if (!r) continue;
        const nr: Rect = { x0: Math.max(r.x0, cur.rect.x0), y0: Math.max(r.y0, cur.rect.y0), x1: Math.min(r.x1, cur.rect.x1), y1: Math.min(r.y1, cur.rect.y1) };
        if (nr.x1 <= nr.x0 || nr.y1 <= nr.y0) continue;
        const prev = this.best.get(next);
        if (prev && nr.x0 >= prev.x0 && nr.y0 >= prev.y0 && nr.x1 <= prev.x1 && nr.y1 <= prev.y1) continue;
        this.best.set(next, prev ? { x0: Math.min(prev.x0, nr.x0), y0: Math.min(prev.y0, nr.y0), x1: Math.max(prev.x1, nr.x1), y1: Math.max(prev.y1, nr.y1) } : nr);
        stack.push({ zone: next, rect: nr, depth: cur.depth + 1, from: p });
      }
    }
    this.apply();
  }

  /** Rectangle écran (NDC) couvert par un portail, ou null s'il est hors champ. */
  private portalRect(p: Portal, cam: Vector3): Rect | null {
    // caméra très proche du portail : on garde tout le parent
    const dx = cam.x - p.cx;
    const dy = cam.y - p.cy;
    const dz = cam.z - p.cz;
    const nearPlane = p.normal === "x" ? Math.abs(dx) : p.normal === "y" ? Math.abs(dy) : Math.abs(dz);
    const inside =
      p.normal === "x"
        ? Math.abs(dz) <= p.hw + 0.3 && Math.abs(dy) <= p.hh + 0.3
        : p.normal === "z"
          ? Math.abs(dx) <= p.hw + 0.3 && Math.abs(dy) <= p.hh + 0.3
          : Math.abs(dx) <= p.hw + 0.3 && Math.abs(dz) <= p.hh + 0.3;
    if (nearPlane < 0.6 && inside) return { x0: -1, y0: -1, x1: 1, y1: 1 };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let behind = 0;
    const m = this.viewProj.m;
    for (let i = 0; i < 4; i++) {
      const su = i & 1 ? 1 : -1;
      const sv = i & 2 ? 1 : -1;
      if (p.normal === "x") _p.set(p.cx, p.cy + sv * p.hh, p.cz + su * p.hw);
      else if (p.normal === "z") _p.set(p.cx + su * p.hw, p.cy + sv * p.hh, p.cz);
      else _p.set(p.cx + su * p.hw, p.cy, p.cz + sv * p.hh);
      // clip = p * viewProj (vecteurs lignes, convention Babylon)
      const cx = _p.x * m[0]! + _p.y * m[4]! + _p.z * m[8]! + m[12]!;
      const cy = _p.x * m[1]! + _p.y * m[5]! + _p.z * m[9]! + m[13]!;
      const cw = _p.x * m[3]! + _p.y * m[7]! + _p.z * m[11]! + m[15]!;
      if (cw <= 0.05) {
        behind++;
        continue;
      }
      const nx = cx / cw;
      const ny = cy / cw;
      if (nx < x0) x0 = nx;
      if (ny < y0) y0 = ny;
      if (nx > x1) x1 = nx;
      if (ny > y1) y1 = ny;
    }
    if (behind === 4) return null;
    if (behind > 0) {
      // portail qui traverse le plan de la caméra : conservateur
      return { x0: -1, y0: -1, x1: 1, y1: 1 };
    }
    if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null;
    void _v;
    return { x0, y0, x1, y1 };
  }

  private apply(): void {
    for (const z of this.prevVisible) {
      if (this.visible.has(z)) continue;
      const list = this.zoneMeshes.get(z);
      if (list) for (const m of list) m.setEnabled(false);
    }
    for (const z of this.visible) {
      if (this.prevVisible.has(z)) continue;
      const list = this.zoneMeshes.get(z);
      if (list) for (const m of list) m.setEnabled(true);
    }
    const sectors = new Set<string>();
    for (const z of this.visible) {
      const s = this.sectorOfZone.get(z);
      if (s) sectors.add(s);
    }
    let changed = sectors.size !== this.visibleSectors.size;
    if (!changed) for (const s of sectors) if (!this.visibleSectors.has(s)) changed = true;
    if (changed) this.props.setVisibleSectors(sectors);
    this.visibleSectors = sectors;
    const tmp = this.prevVisible;
    this.prevVisible = new Set(this.visible);
    tmp.clear();
  }
}
