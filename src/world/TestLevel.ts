import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { makeAABB, makeRamp, type Surface } from "../physics/Collider";
import type { CollisionWorld } from "../physics/CollisionWorld";

/**
 * Salle de test (phase 1–2) : murs, caisses, marche, escalier (visuel + rampe de collision),
 * poutre basse (passage accroupi), zone de sortie.
 */
export class TestLevel {
  readonly meshes: Mesh[] = [];
  /** meshes qui projettent des ombres (props uniquement : jamais l'architecture) */
  readonly casters: Mesh[] = [];
  readonly spawn = { x: 0, y: 0, z: -10, yaw: 0 };
  readonly exitZone = { minX: 10, maxX: 14, minZ: 10, maxZ: 14 };
  private mats = new Map<string, PBRMaterial>();

  constructor(private readonly scene: Scene, private readonly world: CollisionWorld) {
    this.build();
  }

  private mat(name: string, r: number, g: number, b: number, rough = 0.8, metal = 0): PBRMaterial {
    let m = this.mats.get(name);
    if (!m) {
      m = new PBRMaterial(name, this.scene);
      m.albedoColor = new Color3(r, g, b);
      m.roughness = rough;
      m.metallic = metal;
      m.emissiveColor = new Color3(r * 0.06, g * 0.06, b * 0.06);
      m.maxSimultaneousLights = 2;
      this.mats.set(name, m);
    }
    return m;
  }

  private box(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    mat: PBRMaterial,
    surface: Surface = "concrete",
    collide = true,
  ): Mesh {
    const m = CreateBox("b", { width: maxX - minX, height: maxY - minY, depth: maxZ - minZ }, this.scene);
    m.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    m.material = mat;
    m.receiveShadows = true;
    m.freezeWorldMatrix();
    this.meshes.push(m);
    if (collide) this.world.add(makeAABB(minX, minY, minZ, maxX, maxY, maxZ, { surface }));
    return m;
  }

  private build(): void {
    const floor = this.mat("floor", 0.42, 0.44, 0.43, 0.7);
    const wall = this.mat("wall", 0.55, 0.6, 0.55, 0.9);
    const crate = this.mat("crate", 0.45, 0.33, 0.2, 0.75);
    const metal = this.mat("metal", 0.5, 0.5, 0.52, 0.45, 0.8);
    const red = this.mat("exit", 0.8, 0.1, 0.1, 0.6);

    // sol + plafond partiel
    this.box(-16, -0.5, -16, 16, 0, 16, floor, "tile");
    // murs
    this.box(-16.2, 0, -16.2, 16.2, 3.6, -16, wall);
    this.box(-16.2, 0, 16, 16.2, 3.6, 16.2, wall);
    this.box(-16.2, 0, -16, -16, 3.6, 16, wall);
    this.box(16, 0, -16, 16.2, 3.6, 16, wall);

    // caisses : une marche (0.3) et des obstacles
    this.casters.push(
      this.box(-4, 0, -4, -2, 0.3, -2, crate, "wood"),
      this.box(-2, 0, -4, 0, 0.9, -2, crate, "wood"),
      this.box(3, 0, -6, 4.2, 1.2, -4.8, crate, "wood"),
      this.box(-8, 0, 2, -6, 2.2, 6, metal, "metal"),
    );

    // couloir avec poutre basse (passer accroupi)
    this.box(-12, 0, -2, -11.8, 3, 6, wall);
    this.box(-10.2, 0, -2, -10, 3, 6, wall);
    this.casters.push(this.box(-11.8, 1.25, 1.8, -10.2, 1.7, 2.2, metal, "metal"));

    // escalier : marches visuelles + rampe de collision, plateforme à 2 m
    const steps = 10;
    const rise = 2 / steps;
    const run = 0.32;
    for (let i = 0; i < steps; i++) {
      this.box(6, 0, 2 + i * run, 8, (i + 1) * rise, 2 + (i + 1) * run, floor, "concrete", false);
    }
    const len = steps * run;
    this.world.add(makeRamp(7, 2 + len / 2, 1, len / 2, 0, 0, 2, "concrete"));
    this.box(6, 0, 2 + len, 12, 2, 2 + len + 4, floor, "metal");
    this.box(8, 0, 2, 12, 2, 2 + len, wall); // mur sous le palier

    // zone de sortie (repère visuel)
    const z = this.exitZone;
    this.box(z.minX, 0, z.minZ, z.maxX, 0.02, z.maxZ, red, "tile", false);
  }
}
