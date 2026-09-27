import type { Scene } from "@babylonjs/core/scene";
import type { Difficulty } from "../config";
import type { Rng } from "../core/Rng";
import type { Gameplay } from "../gameplay/Gameplay";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { MaterialLibrary } from "../render/materials/MaterialLibrary";
import type { EmissiveMaterials } from "../render/materials/EmissiveMaterials";
import type { LightBaker } from "../world/lighting/LightBaker";
import type { World } from "../world/World";
import { Monster } from "./Monster";
import { Navigation } from "./Navigation";

/**
 * IA : navigation (navmesh + obstacles synchronisés avec les portes verrouillées) et monstre.
 */
export class AiSystem {
  readonly nav: Navigation;
  monster!: Monster;

  constructor(
    private readonly world: World,
    collision: CollisionWorld,
    private readonly gp: Gameplay,
  ) {
    this.nav = new Navigation(world, collision);
  }

  /** Après le bake, avant les colliders dynamiques du gameplay (cabine, portes). */
  async build(scene: Scene, materials: MaterialLibrary, emissive: EmissiveMaterials, baker: LightBaker | null): Promise<void> {
    await this.nav.build(scene);
    // palier du sous-sol de l'ascenseur : la cage n'est jamais un chemin
    for (const o of this.world.openings) {
      if (o.kind !== "elevator" || o.floor !== "B") continue;
      this.nav.block(`elev_${o.id}`, o.x, o.y + 1, o.z + (o.axis === "x" ? 0.4 : 0), o.axis === "x" ? 1.0 : 0.5, 1.0, o.axis === "x" ? 0.5 : 1.0);
    }
    this.syncDoors();
    this.gp.doors.onUnlock = (d) => this.nav.unblock(`door_${d.id}`);
    const mm = materials.monster();
    this.monster = new Monster(scene, mm.material, emissive.get("monster_eyes")!, mm.plugin, this.nav, this.gp, baker);
  }

  /** Portes verrouillées = obstacles de navigation. */
  private syncDoors(): void {
    for (const d of this.gp.doors.doors) {
      const id = `door_${d.id}`;
      if (!d.locked) {
        this.nav.unblock(id);
        continue;
      }
      if (this.nav.isBlocked(id)) continue;
      const o = d.o;
      const along = o.width / 2 + 0.2;
      this.nav.block(id, o.x, o.y + 1.0, o.z, o.axis === "x" ? along : 0.45, 1.0, o.axis === "x" ? 0.45 : along);
    }
  }

  reset(difficulty: Difficulty, rng: Rng, now: number): void {
    this.syncDoors();
    this.monster.reset(difficulty, rng.fork("ai"), now);
    this.nav.setRandomSeed(Math.floor(rng.fork("nav").next() * 1e9));
  }

  update(dt: number, now: number, runTime: number, lockdown: boolean): void {
    this.monster.lockdown = lockdown;
    this.monster.update(dt, now, runTime);
  }

  disable(): void {
    this.monster?.disable();
  }
}
