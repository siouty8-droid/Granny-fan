import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BONES, type BoneName, type MonsterRig } from "./MonsterModel";

export type Gait = "idle" | "walk" | "run" | "search";

/** Entrées de l'animateur (fournies par le cerveau à chaque frame). */
export interface AnimInput {
  dt: number;
  time: number;
  /** vitesse horizontale réelle (m/s) */
  speed: number;
  gait: Gait;
  /** bras droit tendu vers l'avant (porte, cachette) 0..1 */
  reach: number;
  /** hauteur du geste : −1 bas … 1 haut */
  reachHeight: number;
  /** penché en avant (regarder sous un lit) 0..1 */
  bend: number;
  /** capture : bond en avant, bras levés, mâchoire ouverte 0..1 */
  lunge: number;
  /** saut de barrière : progression 0..1 (0 = pas de saut) */
  jump: number;
  /** cible du regard (monde) */
  look: Vector3 | null;
  lookWeight: number;
}

type Euler = [number, number, number];

const TAU = Math.PI * 2;

/**
 * Animations procédurales du Chirurgien : couches blendées (idle nerveux, marche voûtée, course
 * désarticulée, recherche) + gestes (atteindre, se pencher, bondir, saisir), IK des pieds sur le
 * sol (escaliers) et suivi du regard. Rotations exprimées dans les repères de repos (alignés monde).
 */
export class MonsterAnimator {
  private phase = 0;
  private w: Record<Gait, number> = { idle: 1, walk: 0, run: 0, search: 0 };
  private rot = new Map<BoneName, Euler>();
  private hip: Euler = [0, 0, 0];
  private q = new Quaternion();
  private tmpPos = new Vector3();
  // tics nerveux
  private twitch: Euler = [0, 0, 0];
  private twitchTarget: Euler = [0, 0, 0];
  private twitchTimer = 0;
  private fingerTwitch = 0;
  private headLook: [number, number] = [0, 0];
  private rnd: () => number;

  constructor(private readonly rig: MonsterRig, seed = 1) {
    let a = seed >>> 0 || 1;
    this.rnd = () => {
      a ^= a << 13;
      a ^= a >>> 17;
      a ^= a << 5;
      return (a >>> 0) / 4294967296;
    };
    for (const b of BONES) this.rot.set(b, [0, 0, 0]);
  }

  private add(b: BoneName, x: number, y: number, z: number, k = 1): void {
    const r = this.rot.get(b)!;
    r[0] += x * k;
    r[1] += y * k;
    r[2] += z * k;
  }

  /**
   * @param groundAt hauteur du sol monde sous (x, z) (NaN si inconnue)
   * @param worldX/Y/Z/yaw position et orientation de la racine
   */
  update(input: AnimInput, worldX: number, worldY: number, worldZ: number, yaw: number, groundAt: (x: number, z: number, maxY: number) => number): void {
    const dt = input.dt;
    const t = input.time;
    for (const r of this.rot.values()) {
      r[0] = 0;
      r[1] = 0;
      r[2] = 0;
    }
    this.hip[0] = this.hip[1] = this.hip[2] = 0;

    // --- poids des allures
    const k = 1 - Math.exp(-6 * dt);
    for (const g of ["idle", "walk", "run", "search"] as Gait[]) {
      let target = g === input.gait ? 1 : 0;
      if (g === "idle" && input.gait !== "idle" && input.speed < 0.15) target = 1;
      this.w[g] += (target - this.w[g]) * k;
    }
    const wsum = this.w.idle + this.w.walk + this.w.run + this.w.search || 1;
    const cycle = 1.55 * (this.w.walk + this.w.search) / wsum + 2.9 * this.w.run / wsum + 1.4 * this.w.idle / wsum;
    this.phase = (this.phase + (input.speed * dt) / Math.max(0.5, cycle)) % 1;
    const p = this.phase * TAU;
    const s = Math.sin(p);
    const c = Math.cos(p);

    // --- idle nerveux (toujours un peu présent)
    this.twitchTimer -= dt;
    if (this.twitchTimer <= 0) {
      this.twitchTimer = 0.25 + this.rnd() * 1.6;
      this.twitchTarget = [(this.rnd() - 0.5) * 0.5, (this.rnd() - 0.5) * 0.9, (this.rnd() - 0.5) * 0.8];
      this.fingerTwitch = this.rnd();
    }
    const tk = 1 - Math.exp(-22 * dt);
    for (let i = 0; i < 3; i++) this.twitch[i]! += (this.twitchTarget[i]! - this.twitch[i]!) * tk;
    const breathe = Math.sin(t * 1.9);

    // posture de base : voûté, tête penchée
    this.add("spine1", 0.22, 0, 0);
    this.add("spine2", 0.28, 0, 0);
    this.add("chest", 0.3 + breathe * 0.03, 0, 0);
    this.add("neck", -0.55, 0, 0);
    this.add("head", -0.12, 0, 0.34);
    for (const sd of ["L", "R"] as const) {
      const sg = sd === "L" ? -1 : 1;
      this.add(`clav${sd}` as BoneName, 0.12, 0, -sg * 0.14);
      this.add(`upperArm${sd}` as BoneName, -0.35, 0, sg * 0.1);
      this.add(`forearm${sd}` as BoneName, -0.25, 0, 0);
      for (let f = 0; f < 3; f++) {
        this.add(`finger${sd}${f}a` as BoneName, -0.35 - this.fingerTwitch * 0.2 * this.w.idle, 0, (f - 1) * 0.12 * sg);
        this.add(`finger${sd}${f}b` as BoneName, -0.4, 0, 0);
      }
    }

    // --- idle
    const wi = this.w.idle / wsum;
    if (wi > 0.001) {
      this.add("head", this.twitch[0], this.twitch[1], this.twitch[2], wi);
      this.add("neck", this.twitch[0] * 0.3, this.twitch[1] * 0.3, 0, wi);
      this.add("chest", 0, Math.sin(t * 0.7) * 0.08, 0, wi);
      this.hip[1] += -0.04 * wi;
      for (const sd of ["L", "R"] as const) {
        this.add(`thigh${sd}` as BoneName, -0.12, 0, 0, wi);
        this.add(`shin${sd}` as BoneName, 0.22, 0, 0, wi);
        this.add(`foot${sd}` as BoneName, -0.1, 0, 0, wi);
        this.add(`forearm${sd}` as BoneName, -0.1 - Math.sin(t * 2.3 + (sd === "L" ? 0 : 1.7)) * 0.08, 0, 0, wi);
      }
    }

    // --- marche / recherche (même cycle, recherche : tête qui balaie, bras levés)
    const ww = (this.w.walk + this.w.search) / wsum;
    if (ww > 0.001) {
      const A = 0.42;
      this.hip[1] += (-0.02 + 0.025 * Math.cos(2 * p)) * ww;
      this.add("hips", 0, 0.1 * s, 0.04 * s, ww);
      this.add("chest", 0.05, -0.12 * s, -0.03 * s, ww);
      this.add("head", 0.04 * Math.cos(2 * p), 0.06 * s, 0, ww);
      this.leg("L", -A * s, 0.08 + 0.75 * Math.max(0, c), ww);
      this.leg("R", A * s, 0.08 + 0.75 * Math.max(0, -c), ww);
      this.add("upperArmL", 0.38 * s, 0, 0, ww);
      this.add("upperArmR", -0.38 * s, 0, 0, ww);
      this.add("forearmL", -0.15 * Math.max(0, -s), 0, 0, ww);
      this.add("forearmR", -0.15 * Math.max(0, s), 0, 0, ww);
    }
    const wsr = this.w.search / wsum;
    if (wsr > 0.001) {
      this.add("neck", 0.1, Math.sin(t * 0.9) * 0.45, 0, wsr);
      this.add("head", 0.15, Math.sin(t * 0.9 + 0.4) * 0.5, Math.sin(t * 0.5) * 0.2, wsr);
      this.add("upperArmL", -0.35, 0, -0.1, wsr);
      this.add("upperArmR", -0.35, 0, 0.1, wsr);
      this.add("forearmL", -0.3, 0, 0, wsr);
      this.add("forearmR", -0.3, 0, 0, wsr);
    }

    // --- course : penché, bras qui griffent l'air en alternance
    const wr = this.w.run / wsum;
    if (wr > 0.001) {
      const A = 0.75;
      this.hip[1] += (-0.06 + 0.05 * Math.cos(2 * p)) * wr;
      this.hip[2] += 0.05 * wr;
      this.add("spine1", 0.14, 0, 0, wr);
      this.add("spine2", 0.12, 0, 0, wr);
      this.add("chest", 0.1, -0.2 * s, -0.06 * s, wr);
      this.add("neck", -0.25, 0.1 * s, 0, wr);
      this.add("head", -0.1, 0, 0.1 * s, wr);
      this.add("hips", 0, 0.18 * s, 0.06 * s, wr);
      this.leg("L", -A * s - 0.1, 0.2 + 1.25 * Math.max(0, c), wr);
      this.leg("R", A * s - 0.1, 0.2 + 1.25 * Math.max(0, -c), wr);
      this.add("upperArmL", -0.55 + 0.75 * s, 0, -0.15, wr);
      this.add("upperArmR", -0.55 - 0.75 * s, 0, 0.15, wr);
      this.add("forearmL", -0.5 - 0.3 * Math.max(0, -s), 0, 0, wr);
      this.add("forearmR", -0.5 - 0.3 * Math.max(0, s), 0, 0, wr);
      for (const sd of ["L", "R"] as const) for (let f = 0; f < 3; f++) this.add(`finger${sd}${f}a` as BoneName, 0.25, 0, (f - 1) * 0.15 * (sd === "L" ? -1 : 1), wr);
    }

    // --- gestes
    if (input.reach > 0.001) {
      const r = input.reach;
      const hgt = input.reachHeight;
      this.add("chest", 0.1 - hgt * 0.1, -0.25, 0, r);
      this.add("upperArmR", -1.35 - hgt * 0.45, 0.2, 0.1, r);
      this.add("forearmR", -0.15, 0, 0, r);
      for (let f = 0; f < 3; f++) this.add(`fingerR${f}a` as BoneName, 0.3, 0, 0, r);
      this.add("head", 0.1 - hgt * 0.2, -0.15, 0, r);
    }
    if (input.bend > 0.001) {
      const b = input.bend;
      this.hip[1] += -0.28 * b;
      this.hip[2] += -0.12 * b;
      this.add("spine1", 0.45, 0, 0, b);
      this.add("spine2", 0.4, 0, 0, b);
      this.add("chest", 0.3, 0, 0, b);
      this.add("neck", -0.5, 0, 0, b);
      this.add("head", -0.3, 0, 0.2, b);
      this.leg("L", -0.6, 1.1, b);
      this.leg("R", -0.5, 1.0, b);
      this.add("upperArmL", -0.7, 0, 0, b);
      this.add("upperArmR", -0.9, 0, 0, b);
    }
    if (input.jump > 0.001) {
      const j = input.jump;
      const tuck = Math.sin(j * Math.PI);
      this.leg("L", -1.1 * tuck, 1.6 * tuck, 1);
      this.leg("R", -0.8 * tuck, 1.3 * tuck, 1);
      this.add("upperArmL", -1.2 * tuck, 0, -0.3 * tuck);
      this.add("upperArmR", -1.2 * tuck, 0, 0.3 * tuck);
      this.add("spine2", 0.2 * tuck, 0, 0);
    }
    if (input.lunge > 0.001) {
      const l = input.lunge;
      this.hip[2] += 0.25 * l;
      this.add("spine1", -0.05, 0, 0, l);
      this.add("chest", -0.2, 0, 0, l);
      this.add("neck", 0.15, 0, 0, l);
      this.add("head", 0.1, 0, 0.35, l);
      this.add("jaw", 0.55, 0, 0, l);
      this.add("upperArmL", -1.75, 0, -0.35, l);
      this.add("upperArmR", -1.75, 0, 0.35, l);
      this.add("forearmL", -0.2, 0, 0, l);
      this.add("forearmR", -0.2, 0, 0, l);
      for (const sd of ["L", "R"] as const) for (let f = 0; f < 3; f++) this.add(`finger${sd}${f}a` as BoneName, 0.35, 0, (f - 1) * 0.3 * (sd === "L" ? -1 : 1), l);
    }

    // --- regard
    let ly = 0;
    let lp = 0;
    if (input.look && input.lookWeight > 0) {
      const hx = worldX;
      const hy = worldY + 1.95;
      const hz = worldZ;
      const dx = input.look.x - hx;
      const dy = input.look.y - hy;
      const dz = input.look.z - hz;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      // repère local : x = droite, z = avant
      const lx = dx * cy - dz * sy;
      const lz = dx * sy + dz * cy;
      ly = Math.max(-1.3, Math.min(1.3, Math.atan2(lx, lz))) * input.lookWeight;
      lp = Math.max(-0.7, Math.min(0.7, -Math.atan2(dy, Math.hypot(lx, lz)))) * input.lookWeight;
    }
    const lk = 1 - Math.exp(-8 * dt);
    this.headLook[0] += (ly - this.headLook[0]) * lk;
    this.headLook[1] += (lp - this.headLook[1]) * lk;
    this.add("neck", this.headLook[1] * 0.4, this.headLook[0] * 0.4, 0);
    this.add("head", this.headLook[1] * 0.6, this.headLook[0] * 0.6, 0);
    this.add("chest", 0, this.headLook[0] * 0.15, 0);

    // --- IK des pieds (plan sagittal) : pieds posés sur le sol (escaliers, rampes)
    this.footIK(worldX, worldY, worldZ, yaw, groundAt);

    // --- application
    const bones = this.rig.bones;
    for (const name of BONES) {
      const r = this.rot.get(name)!;
      Quaternion.RotationYawPitchRollToRef(r[1], r[0], r[2], this.q);
      bones[name].setRotationQuaternion(this.q);
    }
    const rest = this.rig.rest.hips;
    this.tmpPos.set(rest.x + this.hip[0], rest.y + this.hip[1], rest.z + this.hip[2]);
    bones.hips.position = this.tmpPos;
  }

  /** Jambe : cuisse (tangage, négatif = vers l'avant), genou (fléchi > 0), pied à plat. */
  private leg(sd: "L" | "R", thigh: number, knee: number, w: number): void {
    this.add(`thigh${sd}` as BoneName, thigh, 0, 0, w);
    this.add(`shin${sd}` as BoneName, knee, 0, 0, w);
    this.add(`foot${sd}` as BoneName, -(thigh + knee) * 0.85, 0, 0, w);
  }

  private footIK(wx: number, wy: number, wz: number, yaw: number, groundAt: (x: number, z: number, maxY: number) => number): void {
    const L1 = this.rig.thighLen;
    const L2 = this.rig.shinLen;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    let lowest = 0;
    const res: Array<{ sd: "L" | "R"; a1: number; a2: number; tz: number; ty: number } | null> = [];
    for (const sd of ["L", "R"] as const) {
      const th = this.rot.get(`thigh${sd}` as BoneName)!;
      const sh = this.rot.get(`shin${sd}` as BoneName)!;
      const hipRest = this.rig.rest[`thigh${sd}` as BoneName];
      // hanche (espace modèle, plan y-z), avec le décalage du bassin
      const hy = hipRest.y + this.hip[1];
      const hz = hipRest.z + this.hip[2];
      const a1 = th[0];
      const a2 = sh[0];
      const fz = hz - L1 * Math.sin(a1) - L2 * Math.sin(a1 + a2);
      const fy = hy - L1 * Math.cos(a1) - L2 * Math.cos(a1 + a2);
      // position monde du pied
      const lx = hipRest.x;
      const px = wx + lx * cy + fz * sy;
      const pz = wz - lx * sy + fz * cy;
      const g = groundAt(px, pz, wy + 0.6);
      if (!Number.isFinite(g) || Math.abs(g - wy) > 0.7) {
        res.push(null);
        continue;
      }
      const dh = g - wy;
      lowest = Math.min(lowest, dh);
      res.push({ sd, a1, a2, tz: fz, ty: Math.max(fy, 0.075) + dh - 0.075 + 0.075 });
    }
    // le bassin descend pour que la jambe la plus basse atteigne le sol
    if (lowest < 0) this.hip[1] += lowest;
    for (const r of res) {
      if (!r) continue;
      const hipRest = this.rig.rest[`thigh${r.sd}` as BoneName];
      const hy = hipRest.y + this.hip[1];
      const hz = hipRest.z + this.hip[2];
      const tz = r.tz - hz;
      const ty = r.ty - hy;
      let d = Math.hypot(tz, ty);
      d = Math.max(0.15, Math.min(L1 + L2 - 1e-3, d));
      const cosK = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
      const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK)));
      const cosB = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
      const beta = Math.acos(Math.max(-1, Math.min(1, cosB)));
      const thetaT = Math.atan2(-tz, -ty);
      const a1 = thetaT - beta;
      const th = this.rot.get(`thigh${r.sd}` as BoneName)!;
      const sh = this.rot.get(`shin${r.sd}` as BoneName)!;
      const ft = this.rot.get(`foot${r.sd}` as BoneName)!;
      const footAbs = th[0] + sh[0] + ft[0];
      th[0] = a1;
      sh[0] = knee;
      ft[0] = footAbs - a1 - knee;
    }
  }
}
