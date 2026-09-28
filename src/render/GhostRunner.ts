import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "../config";
import { GhostTrack, type GhostData, type GhostPose } from "../run/Ghosts";
import { ModelKit, Region, type PartStyle } from "../world/props/ModelKit";

/**
 * Fantôme : silhouette pâle, lumineuse et transparente qui rejoue un trajet enregistré en suivant
 * le chrono (même départ que toi). Purement visuel : pas de collision, pas d'ombre, le Chirurgien
 * l'ignore, elle ne touche à rien. Un faisceau très léger montre où elle regarde quand sa lampe
 * était allumée. Elle s'efface peu après son arrivée.
 */
export class GhostRunner {
  private readonly body: Mesh;
  private readonly beam: Mesh;
  private readonly mat: StandardMaterial;
  private readonly beamMat: StandardMaterial;
  private track: GhostTrack | null = null;
  private readonly pose: GhostPose = { x: 0, y: 0, z: 0, yaw: 0, crouch: false, lamp: false };
  private crouch = 0;
  private time = 0;

  constructor(scene: Scene) {
    const st: PartStyle = { region: Region.WHITE };
    const k = new ModelKit();
    k.groundAO = false;
    // mannequin (pieds à l'origine, face à +z), à la taille du joueur
    for (const s of [-1, 1]) {
      k.cylinder([0.1 * s, 0.95, 0], [0.11 * s, 0.06, 0.02], 0.075, 8, st, true, 0.055);
      k.cylinder([0.21 * s, 1.47, 0], [0.26 * s, 0.98, 0.06], 0.055, 8, st, true, 0.045);
    }
    k.cylinder([0, 0.92, 0], [0, 1.5, -0.01], 0.17, 12, st, true, 0.19);
    k.sphere([0, 1.52, -0.01], 0.2, 12, st, 0.5);
    k.sphere([0, 1.7, 0.01], 0.12, 12, st, 1.15);
    this.body = k.toMesh("ghost", scene);
    const beam = new ModelKit();
    beam.groundAO = false;
    const z0 = 0.18;
    const z1 = 3.2;
    beam.cylinder([0.22, 1.32, z0], [0.22, 1.08, z1], 0.035, 16, st, false, 0.7);
    // additif : la couleur s'éteint vers le bout du faisceau (pas de disque net vu de dos)
    for (let i = 0; i < beam.vertexCount; i++) {
      const f = Math.max(0, 1 - (beam.positions[i * 3 + 2]! - z0) / (z1 - z0)) ** 1.5;
      for (let c = 0; c < 3; c++) beam.colors[i * 4 + c]! *= f;
    }
    this.beam = beam.toMesh("ghostBeam", scene);
    this.beam.parent = this.body;

    const c = CONFIG.ghost.color;
    const mk = (name: string, alpha: number, additive: boolean): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.disableLighting = true;
      m.emissiveColor = new Color3(c.r, c.g, c.b);
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.alpha = alpha;
      if (additive) m.alphaMode = Constants.ALPHA_ADD;
      return m;
    };
    this.mat = mk("ghostMat", CONFIG.ghost.alpha, false);
    this.beamMat = mk("ghostBeamMat", CONFIG.ghost.beamAlpha, true);
    this.beamMat.backFaceCulling = false;
    for (const [m, mat] of [
      [this.body, this.mat],
      [this.beam, this.beamMat],
    ] as const) {
      m.material = mat;
      m.isPickable = false;
      m.doNotSyncBoundingInfo = true;
      m.alwaysSelectAsActiveMesh = true;
    }
    this.hide();
  }

  /** Fantôme à rejouer (null : aucun). */
  set(data: GhostData | null): void {
    this.track = data ? new GhostTrack(data) : null;
    this.crouch = 0;
    this.hide();
  }

  get data(): GhostData | null {
    return this.track?.data ?? null;
  }

  /** Pose à l'instant `tMs` du chrono ; s'efface après l'arrivée. */
  update(tMs: number, dt: number): void {
    const tr = this.track;
    if (!tr) return;
    this.time += dt;
    const p = tr.at(tMs, this.pose);
    const b = this.body;
    // léger flottement
    b.position.set(p.x, p.y + 0.03 + Math.sin(this.time * 2.1) * 0.025, p.z);
    b.rotation.y = p.yaw;
    this.crouch += ((p.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    b.scaling.y = 1 - 0.38 * this.crouch;
    const fade = Math.max(0, Math.min(1, 1 - (tMs - tr.endMs) / CONFIG.ghost.fadeMs));
    const flicker = 0.9 + 0.1 * Math.sin(this.time * 13.7) * Math.sin(this.time * 5.3);
    this.mat.alpha = CONFIG.ghost.alpha * fade * flicker;
    this.beamMat.alpha = CONFIG.ghost.beamAlpha * fade;
    b.setEnabled(fade > 0.01);
    this.beam.setEnabled(fade > 0.01 && p.lamp);
  }

  hide(): void {
    this.body.setEnabled(false);
    this.beam.setEnabled(false);
  }
}
