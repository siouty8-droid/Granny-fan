import { Bone } from "@babylonjs/core/Bones/bone";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { SkinId } from "../run/Cosmetics";
import { ModelKit, Region, type PartStyle } from "../world/props/ModelKit";

type V3 = [number, number, number];

/** Os du Chirurgien (pose de repos debout, bras le long du corps, +z = avant, −x = gauche). */
export const BONES = [
  "root",
  "hips",
  "spine1",
  "spine2",
  "chest",
  "neck",
  "head",
  "jaw",
  "clavL",
  "upperArmL",
  "forearmL",
  "handL",
  "clavR",
  "upperArmR",
  "forearmR",
  "handR",
  "fingerL0a",
  "fingerL0b",
  "fingerL1a",
  "fingerL1b",
  "fingerL2a",
  "fingerL2b",
  "fingerR0a",
  "fingerR0b",
  "fingerR1a",
  "fingerR1b",
  "fingerR2a",
  "fingerR2b",
  "thighL",
  "shinL",
  "footL",
  "toeL",
  "thighR",
  "shinR",
  "footR",
  "toeR",
] as const;
export type BoneName = (typeof BONES)[number];

interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** tête de l'os (espace modèle) */
  head: V3;
  /** extrémité (pour la pondération) ; défaut : tête du premier enfant */
  tail?: V3;
}

/** Miroir gauche (−x) / droite (+x) d'une position donnée pour le côté droit. */
function side(s: -1 | 1): (p: V3) => V3 {
  return (p) => [p[0] * s, p[1], p[2]];
}

/** Définition du squelette (dimensions en m). */
function boneDefs(): BoneDef[] {
  const defs: BoneDef[] = [
    { name: "root", parent: null, head: [0, 0, 0], tail: [0, 0.3, 0] },
    { name: "hips", parent: "root", head: [0, 1.1, 0] },
    { name: "spine1", parent: "hips", head: [0, 1.24, -0.01] },
    { name: "spine2", parent: "spine1", head: [0, 1.4, -0.02] },
    { name: "chest", parent: "spine2", head: [0, 1.56, -0.02] },
    { name: "neck", parent: "chest", head: [0, 1.79, 0.0] },
    { name: "head", parent: "neck", head: [0, 1.93, 0.03], tail: [0, 2.2, 0.03] },
    { name: "jaw", parent: "head", head: [0, 1.98, 0.05], tail: [0, 1.95, 0.13] },
  ];
  for (const [sn, s] of [
    ["L", -1],
    ["R", 1],
  ] as Array<["L" | "R", -1 | 1]>) {
    const m = side(s);
    const n = (b: string) => `${b}${sn}` as BoneName;
    defs.push({ name: n("clav"), parent: "chest", head: m([0.05, 1.74, 0]) });
    defs.push({ name: n("upperArm"), parent: n("clav"), head: m([0.22, 1.74, -0.01]) });
    defs.push({ name: n("forearm"), parent: n("upperArm"), head: m([0.25, 1.36, 0.0]) });
    defs.push({ name: n("hand"), parent: n("forearm"), head: m([0.27, 1.0, 0.01]), tail: m([0.28, 0.91, 0.02]) });
    for (let f = 0; f < 3; f++) {
      const dz = (f - 1) * 0.022;
      const dx = f === 1 ? 0.0 : 0.006;
      defs.push({ name: `finger${sn}${f}a` as BoneName, parent: n("hand"), head: m([0.28 + dx, 0.9, 0.02 + dz]) });
      defs.push({ name: `finger${sn}${f}b` as BoneName, parent: `finger${sn}${f}a` as BoneName, head: m([0.285 + dx, 0.78, 0.028 + dz]), tail: m([0.29 + dx, 0.64, 0.04 + dz]) });
    }
    defs.push({ name: n("thigh"), parent: "hips", head: m([0.1, 1.05, 0]) });
    defs.push({ name: n("shin"), parent: n("thigh"), head: m([0.11, 0.57, 0.02]) });
    defs.push({ name: n("foot"), parent: n("shin"), head: m([0.11, 0.09, -0.01]) });
    defs.push({ name: n("toe"), parent: n("foot"), head: m([0.11, 0.025, 0.17]), tail: m([0.11, 0.02, 0.28]) });
  }
  return defs;
}

export interface MonsterRig {
  root: TransformNode;
  mesh: Mesh;
  eyes: Mesh;
  skeleton: Skeleton;
  bones: Record<BoneName, Bone>;
  /** positions de repos (espace modèle) */
  rest: Record<BoneName, Vector3>;
  /** longueurs cuisse / tibia (IK) */
  thighLen: number;
  shinLen: number;
  /** tenue actuelle */
  skin: SkinId;
}

/** Palette d'une tenue (peau, mains) : le reste des pièces est propre à chaque tenue. */
interface Look {
  skin: PartStyle;
  skinDark: PartStyle;
  legs: PartStyle;
  knees: PartStyle;
  feet: PartStyle;
  hand: PartStyle;
  fingers: PartStyle;
  claw: PartStyle;
}

const SKIN: PartStyle = { region: Region.VINYL, color: [0.54, 0.54, 0.48] };
const SKIN_DARK: PartStyle = { region: Region.VINYL, color: [0.4, 0.38, 0.33] };
const GOWN: PartStyle = { region: Region.FABRIC_STAINED, color: [0.4, 0.5, 0.45], uv: 1.2 };
const MASK: PartStyle = { region: Region.FABRIC_STAINED, color: [0.72, 0.82, 0.86], uv: 2 };
const CAP: PartStyle = { region: Region.FABRIC, color: [0.46, 0.6, 0.56], uv: 2 };
const CLAW: PartStyle = { region: Region.RUST, color: [0.35, 0.2, 0.16] };
const BLOOD: PartStyle = { region: Region.VINYL, color: [0.42, 0.14, 0.1] };
const SOCKET: PartStyle = { region: Region.RUBBER, color: [0.05, 0.03, 0.03] };

const LOOKS: Record<SkinId, Look> = {
  classic: { skin: SKIN, skinDark: SKIN_DARK, legs: SKIN, knees: SKIN_DARK, feet: SKIN_DARK, hand: BLOOD, fingers: BLOOD, claw: CLAW },
  nightNurse: {
    skin: { region: Region.VINYL, color: [0.66, 0.63, 0.6] },
    skinDark: { region: Region.VINYL, color: [0.47, 0.43, 0.41] },
    // bas noirs filés
    legs: { region: Region.FABRIC, color: [0.15, 0.13, 0.14], uv: 2 },
    knees: { region: Region.FABRIC, color: [0.12, 0.1, 0.11], uv: 2 },
    feet: { region: Region.FABRIC, color: [0.12, 0.1, 0.11], uv: 2 },
    hand: { region: Region.VINYL, color: [0.5, 0.46, 0.44] },
    fingers: { region: Region.VINYL, color: [0.47, 0.43, 0.41] },
    // ongles vernis rouge sombre
    claw: { region: Region.VINYL, color: [0.4, 0.03, 0.05] },
  },
  patientZero: {
    skin: { region: Region.VINYL, color: [0.5, 0.56, 0.44] },
    skinDark: { region: Region.VINYL, color: [0.36, 0.4, 0.31] },
    legs: { region: Region.VINYL, color: [0.5, 0.56, 0.44] },
    knees: { region: Region.VINYL, color: [0.36, 0.4, 0.31] },
    feet: { region: Region.VINYL, color: [0.33, 0.36, 0.28] },
    hand: { region: Region.VINYL, color: [0.38, 0.4, 0.3] },
    fingers: { region: Region.VINYL, color: [0.34, 0.35, 0.26] },
    claw: CLAW,
  },
};

// --- la Veilleuse de nuit
const DRESS: PartStyle = { region: Region.FABRIC_STAINED, color: [0.7, 0.68, 0.63], uv: 1.2 };
const CARDIGAN: PartStyle = { region: Region.FABRIC, color: [0.13, 0.16, 0.28], uv: 2.5 };
const LINEN: PartStyle = { region: Region.FABRIC, color: [0.88, 0.87, 0.84], uv: 2 };
const CROSS: PartStyle = { region: Region.VINYL, color: [0.62, 0.07, 0.07] };
const HAIR: PartStyle = { region: Region.RUBBER, color: [0.05, 0.045, 0.045] };
const THREAD: PartStyle = { region: Region.FABRIC, color: [0.66, 0.6, 0.5] };
const WATCH: PartStyle = { region: Region.STEEL, color: [0.78, 0.72, 0.55] };
// --- le Patient zéro
const GOWN_P: PartStyle = { region: Region.FABRIC_STAINED, color: [0.52, 0.6, 0.66], uv: 1.4 };
const BANDAGE: PartStyle = { region: Region.FABRIC, color: [0.76, 0.74, 0.68], uv: 3 };
const POLE: PartStyle = { region: Region.STEEL, color: [0.72, 0.74, 0.76] };
const WHEEL: PartStyle = { region: Region.RUBBER, color: [0.08, 0.08, 0.08] };
const BAG: PartStyle = { region: Region.PLASTIC, color: [0.7, 0.74, 0.68] };
const LINE: PartStyle = { region: Region.PLASTIC, color: [0.9, 0.92, 0.9] };
const TAG: PartStyle = { region: Region.PLASTIC, color: [0.93, 0.93, 0.95] };

/** Anneau elliptique (tube à section variable) le long d'une polyligne verticale-ish. */
function ringTube(k: ModelKit, rings: Array<{ c: V3; rx: number; rz: number }>, segs: number, st: PartStyle, hem?: (a: number) => number): void {
  const pos = k.positions;
  const nor = k.normals;
  const uvs = k.uvs;
  const col = k.colors;
  const idx = k.indices;
  const base = pos.length / 3;
  const c = st.color ?? [1, 1, 1];
  const lin = [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2];
  rings.forEach((r, j) => {
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let y = r.c[1];
      if (hem && j === rings.length - 1) y += hem(a);
      pos.push(r.c[0] + ca * r.rx, y, r.c[2] + sa * r.rz);
      const nl = Math.hypot(ca / r.rx, sa / r.rz);
      nor.push(ca / r.rx / nl, 0, sa / r.rz / nl);
      const [u, v] = ModelKit.regionUV(st.region, (i / segs) * Math.min(1, (st.uv ?? 1) * 0.9), (j / (rings.length - 1)) * Math.min(1, (st.uv ?? 1) * 0.9));
      uvs.push(u, v);
      const ao = 0.75 + 0.25 * Math.min(1, j / 2);
      col.push(lin[0]! * ao, lin[1]! * ao, lin[2]! * ao, 1);
    }
  });
  const row = segs + 1;
  // orientation Babylon (normale sortante) : dépend du sens de parcours des anneaux
  const down = rings[rings.length - 1]!.c[1] < rings[0]!.c[1];
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = base + j * row + i;
      const b = a + 1;
      const cc = a + row + 1;
      const d = a + row;
      if (down) idx.push(a, cc, b, a, d, cc);
      else idx.push(a, b, cc, a, cc, d);
    }
  }
}

/** Distance point → segment. */
function segDist(p: V3, a: V3, b: V3): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby + (p[2] - a[2]) * abz) / l2;
  t = Math.max(0, Math.min(1, t));
  const dx = p[0] - (a[0] + abx * t);
  const dy = p[1] - (a[1] + aby * t);
  const dz = p[2] - (a[2] + abz * t);
  return Math.hypot(dx, dy, dz);
}

type Part = (bones: BoneName[], fn: () => void, rigid?: BoneName) => void;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Base orthonormée (u, v) du plan de normale `w` (unitaire). */
function planeBasis(w: V3): [V3, V3] {
  const u = unit(cross(Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], w));
  return [u, cross(w, u)];
}

/** Crâne du corps commun (ellipsoïde) : cheveux et bandages s'y plaquent. */
const SKULL_C: V3 = [0, 2.05, 0.02];
const SKULL_R: V3 = [0.1, 0.13, 0.1];
const fromSkull = (p: V3): V3 => sub(p, SKULL_C);

/** Point du crâne atteint depuis `o` (à l'intérieur) dans la direction `d`, décollé de `eps`. */
function onSkull(o: V3, d: V3, eps: number): V3 {
  const ox = (o[0] - SKULL_C[0]) / SKULL_R[0];
  const oy = (o[1] - SKULL_C[1]) / SKULL_R[1];
  const oz = (o[2] - SKULL_C[2]) / SKULL_R[2];
  const dx = d[0] / SKULL_R[0];
  const dy = d[1] / SKULL_R[1];
  const dz = d[2] / SKULL_R[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - 1;
  const t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a) + eps / (Math.hypot(d[0], d[1], d[2]) || 1);
  return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
}

/** Bande plaquée autour du crâne (bandage) : plan passant par `c`, de normale `w`, largeur 2·hw. */
function skullBand(k: ModelKit, c: V3, w: V3, hw: number, eps: number, st: PartStyle, segs = 28): void {
  const n = unit(w);
  const [u, v] = planeBasis(n);
  const rows = [-1, 1].map((s) => {
    const o: V3 = [c[0] + n[0] * hw * s, c[1] + n[1] * hw * s, c[2] + n[2] * hw * s];
    const row: V3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      row.push(onSkull(o, [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa], eps));
    }
    return row;
  });
  k.grid(rows, st, fromSkull, { closed: true });
}

/** Bandage enroulé en spirale sur un membre : de `a` à `b`, peau de rayon ra → rb. */
function limbWrap(k: ModelKit, a: V3, b: V3, ra: number, rb: number, turns: number, st: PartStyle): void {
  const d = sub(b, a);
  const w = unit(d);
  const len = Math.hypot(d[0], d[1], d[2]);
  const [u, v] = planeBasis(w);
  // bande un peu plus étroite que le pas : la peau se devine entre deux tours
  const hw = ((len / turns) * 0.78) / 2;
  const n = Math.ceil(turns * 16);
  const rows: V3[][] = [[], []];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang = t * turns * Math.PI * 2;
    const r = ra + (rb - ra) * t + 0.004;
    const cu = Math.cos(ang) * r;
    const sv = Math.sin(ang) * r;
    const c: V3 = [a[0] + d[0] * t + u[0] * cu + v[0] * sv, a[1] + d[1] * t + u[1] * cu + v[1] * sv, a[2] + d[2] * t + u[2] * cu + v[2] * sv];
    rows[0]!.push([c[0] - w[0] * hw, c[1] - w[1] * hw, c[2] - w[2] * hw]);
    rows[1]!.push([c[0] + w[0] * hw, c[1] + w[1] * hw, c[2] + w[2] * hw]);
  }
  k.grid(rows, st, (p) => {
    const q = sub(p, a);
    const s = q[0] * w[0] + q[1] * w[1] + q[2] * w[2];
    return [q[0] - w[0] * s, q[1] - w[1] * s, q[2] - w[2] * s];
  });
}

/** Corps commun à toutes les tenues : jambes, pieds, bras, mains-griffes, tronc, cou, crâne. */
function body(k: ModelKit, part: Part, H: (n: BoneName) => V3, look: Look, tailOf: (n: BoneName) => V3): void {
  for (const s of ["L", "R"] as const) {
    const n = (b: string) => `${b}${s}` as BoneName;
    const hip = H(n("thigh"));
    const knee = H(n("shin"));
    const ankle = H(n("foot"));
    const toe = H(n("toe"));
    // jambe décharnée : cuisse → genou osseux → cheville
    part(["hips", n("thigh"), n("shin"), n("foot")], () => {
      k.cylinder([hip[0], hip[1] + 0.02, hip[2]], knee, 0.062, 10, look.legs, false, 0.045);
      k.sphere(knee, 0.05, 8, look.knees);
      k.cylinder(knee, ankle, 0.046, 9, look.legs, false, 0.032);
    });
    // pied long et fin
    part([n("shin"), n("foot"), n("toe")], () => {
      k.sphere(ankle, 0.036, 8, look.feet);
      k.cylinder([ankle[0], ankle[1] - 0.02, ankle[2] - 0.05], [toe[0], toe[1] + 0.005, toe[2]], 0.035, 8, look.feet, true, 0.028);
    });
    part([n("foot"), n("toe")], () => {
      for (let t = -1; t <= 1; t++) k.cylinder([toe[0] + t * 0.018, toe[1], toe[2]], [toe[0] + t * 0.024, 0.012, toe[2] + 0.1], 0.011, 5, look.skinDark, true, 0.005);
    });
    // bras démesurés
    const sh = H(n("upperArm"));
    const el = H(n("forearm"));
    const wr = H(n("hand"));
    part([n("clav"), n("upperArm"), n("forearm"), n("hand")], () => {
      k.cylinder([sh[0] * 0.8, sh[1] + 0.01, sh[2]], el, 0.042, 9, look.skin, false, 0.033);
      k.sphere(el, 0.037, 8, look.skinDark);
      k.cylinder(el, wr, 0.034, 9, look.skin, false, 0.026);
    });
    // main + doigts-griffes
    part([n("forearm"), n("hand"), n("finger") + "0a" as BoneName, n("finger") + "1a" as BoneName, n("finger") + "2a" as BoneName], () => {
      k.cylinder(wr, [wr[0] * 1.02, 0.9, wr[2] + 0.01], 0.03, 8, look.hand, true, 0.026);
      // pouce
      k.cylinder([wr[0], 0.96, wr[2] + 0.03], [wr[0] * 0.96, 0.87, wr[2] + 0.06], 0.012, 5, look.hand, true, 0.008);
    });
    for (let f = 0; f < 3; f++) {
      const fa = `finger${s}${f}a` as BoneName;
      const fb = `finger${s}${f}b` as BoneName;
      const a = H(fa);
      const b = H(fb);
      const tip = tailOf(fb);
      part([n("hand"), fa, fb], () => {
        k.cylinder(a, b, 0.0115, 6, look.fingers, false, 0.0095);
        k.sphere(b, 0.011, 5, look.fingers);
        k.cylinder(b, [tip[0], tip[1] + 0.03, tip[2] - 0.004], 0.0095, 6, look.skinDark, false, 0.007);
        k.cylinder([tip[0], tip[1] + 0.035, tip[2] - 0.004], tip, 0.007, 5, look.claw, true, 0.001);
      });
    }
  }
  // tronc décharné (visible au col et par les déchirures)
  part(["hips", "spine1", "spine2", "chest", "neck"], () => {
    ringTube(
      k,
      [
        { c: [0, 0.98, 0], rx: 0.15, rz: 0.1 },
        { c: [0, 1.1, 0], rx: 0.155, rz: 0.105 },
        { c: [0, 1.22, -0.005], rx: 0.115, rz: 0.08 },
        { c: [0, 1.36, -0.01], rx: 0.125, rz: 0.085 },
        { c: [0, 1.5, -0.01], rx: 0.165, rz: 0.1 },
        { c: [0, 1.64, -0.015], rx: 0.19, rz: 0.1 },
        { c: [0, 1.74, -0.02], rx: 0.18, rz: 0.085 },
        { c: [0, 1.8, -0.005], rx: 0.06, rz: 0.055 },
      ],
      14,
      look.skin,
    );
  });
  // cou long
  part(["chest", "neck", "head"], () => {
    k.cylinder([0, 1.77, -0.005], [0, 1.97, 0.025], 0.042, 9, look.skin, false, 0.036);
    // vertèbres saillantes
    for (let i = 0; i < 4; i++) k.sphere([0, 1.8 + i * 0.045, -0.035 + i * 0.012], 0.016, 5, look.skinDark);
  });
  // tête allongée, orbites creuses
  part(["head"], () => {
    k.sphere([0, 2.05, 0.02], 0.1, 12, look.skin, 1.3);
    k.sphere([-0.034, 2.075, 0.095], 0.023, 6, SOCKET);
    k.sphere([0.034, 2.075, 0.095], 0.023, 6, SOCKET);
  }, "head");
}

/** Manche courte (blouse) du côté `s`. */
function shortSleeve(k: ModelKit, part: Part, H: (n: BoneName) => V3, s: "L" | "R", st: PartStyle): void {
  const sh = H(`upperArm${s}` as BoneName);
  part(["chest", `clav${s}` as BoneName, `upperArm${s}` as BoneName], () => {
    ringTube(
      k,
      [
        { c: [sh[0] * 0.75, sh[1] + 0.04, sh[2]], rx: 0.075, rz: 0.075 },
        { c: [sh[0] * 1.03, sh[1] - 0.08, sh[2]], rx: 0.07, rz: 0.07 },
        { c: [sh[0] * 1.06, sh[1] - 0.16, sh[2]], rx: 0.068, rz: 0.068 },
      ],
      10,
      st,
      (a) => Math.sin(a * 5) * 0.02 - 0.01,
    );
  });
}

/** Le Chirurgien d'origine : blouse de bloc déchirée, calot, masque. */
function classicOutfit(k: ModelKit, part: Part, H: (n: BoneName) => V3): void {
  shortSleeve(k, part, H, "L", GOWN);
  shortSleeve(k, part, H, "R", GOWN);
  // blouse chirurgicale : du col aux genoux, ourlet déchiré en lambeaux
  part(["chest", "spine2", "spine1", "hips", "thighL", "thighR"], () => {
    ringTube(
      k,
      [
        { c: [0, 1.78, -0.01], rx: 0.1, rz: 0.075 },
        { c: [0, 1.74, -0.015], rx: 0.215, rz: 0.12 },
        { c: [0, 1.6, -0.015], rx: 0.215, rz: 0.13 },
        { c: [0, 1.42, -0.015], rx: 0.18, rz: 0.125 },
        { c: [0, 1.22, -0.01], rx: 0.19, rz: 0.13 },
        { c: [0, 1.02, -0.005], rx: 0.225, rz: 0.16 },
        { c: [0, 0.84, 0], rx: 0.26, rz: 0.19 },
        { c: [0, 0.66, 0.005], rx: 0.285, rz: 0.21 },
      ],
      18,
      GOWN,
      (a) => {
        // lambeaux : bandes irrégulières
        const strip = Math.sin(a * 7) * 0.06 + Math.sin(a * 13 + 1.3) * 0.04 + Math.max(0, Math.sin(a * 3 + 0.5)) * -0.1;
        return strip;
      },
    );
  });
  // calot et liens du masque
  part(["head"], () => {
    k.push().translate(0, 2.13, 0.0).scale(1, 0.72, 1.1);
    k.sphere([0, 0, 0], 0.104, 12, CAP);
    k.pop();
    k.tube(
      [
        [-0.09, 2.03, 0.05],
        [-0.1, 2.05, -0.03],
        [-0.02, 2.08, -0.09],
      ],
      0.004,
      3,
      MASK,
    );
    k.tube(
      [
        [0.09, 2.03, 0.05],
        [0.1, 2.05, -0.03],
        [0.02, 2.08, -0.09],
      ],
      0.004,
      3,
      MASK,
    );
  }, "head");
  part(["head", "jaw"], () => {
    k.push().translate(0, 1.99, 0.075).scale(1, 0.75, 0.62);
    k.sphere([0, 0, 0], 0.09, 10, MASK);
    k.pop();
  });
}

/** La Veilleuse de nuit : robe d'infirmière, gilet, coiffe, cheveux, sourire cousu, montre. */
function nurseOutfit(k: ModelKit, part: Part, H: (n: BoneName) => V3): void {
  for (const s of ["L", "R"] as const) {
    const n = (b: string) => `${b}${s}` as BoneName;
    const sh = H(n("upperArm"));
    const el = H(n("forearm"));
    const wr = H(n("hand"));
    // manches longues du gilet, poignets blancs
    part([n("clav"), n("upperArm"), n("forearm"), n("hand")], () => {
      ringTube(
        k,
        [
          { c: [sh[0] * 0.78, sh[1] + 0.045, sh[2]], rx: 0.08, rz: 0.08 },
          { c: [sh[0] * 1.03, sh[1] - 0.08, sh[2]], rx: 0.074, rz: 0.074 },
          { c: [el[0], el[1], el[2]], rx: 0.062, rz: 0.062 },
          { c: [(el[0] + wr[0]) / 2, (el[1] + wr[1]) / 2, (el[2] + wr[2]) / 2], rx: 0.054, rz: 0.054 },
          { c: [wr[0], wr[1] + 0.06, wr[2]], rx: 0.048, rz: 0.048 },
        ],
        10,
        CARDIGAN,
      );
    });
    part([n("forearm"), n("hand")], () => {
      ringTube(
        k,
        [
          { c: [wr[0], wr[1] + 0.075, wr[2]], rx: 0.053, rz: 0.053 },
          { c: [wr[0], wr[1] + 0.03, wr[2]], rx: 0.05, rz: 0.05 },
        ],
        10,
        LINEN,
      );
    });
  }
  // robe longue (jusqu'à mi-mollet) : jupe qui suit les jambes
  part(["chest", "spine2", "spine1", "hips", "thighL", "thighR", "shinL", "shinR"], () => {
    ringTube(
      k,
      [
        { c: [0, 1.78, -0.01], rx: 0.1, rz: 0.075 },
        { c: [0, 1.74, -0.015], rx: 0.215, rz: 0.12 },
        { c: [0, 1.6, -0.015], rx: 0.21, rz: 0.13 },
        { c: [0, 1.42, -0.015], rx: 0.175, rz: 0.125 },
        { c: [0, 1.28, -0.01], rx: 0.17, rz: 0.12 },
        { c: [0, 1.08, -0.005], rx: 0.215, rz: 0.155 },
        { c: [0, 0.84, 0], rx: 0.25, rz: 0.185 },
        { c: [0, 0.6, 0.005], rx: 0.27, rz: 0.2 },
        { c: [0, 0.44, 0.005], rx: 0.28, rz: 0.205 },
      ],
      18,
      DRESS,
      (a) => Math.sin(a * 9) * 0.015 + Math.sin(a * 4 + 1) * 0.02 - 0.01,
    );
  });
  // ceinture blanche
  part(["spine1", "hips", "spine2"], () => {
    ringTube(
      k,
      [
        { c: [0, 1.31, -0.01], rx: 0.178, rz: 0.127 },
        { c: [0, 1.25, -0.009], rx: 0.18, rz: 0.129 },
      ],
      16,
      LINEN,
    );
  });
  // gilet de garde sur les épaules, col blanc
  part(["chest", "spine2", "clavL", "clavR"], () => {
    ringTube(
      k,
      [
        { c: [0, 1.8, -0.01], rx: 0.105, rz: 0.08 },
        { c: [0, 1.755, -0.015], rx: 0.232, rz: 0.135 },
        { c: [0, 1.6, -0.015], rx: 0.225, rz: 0.142 },
        { c: [0, 1.46, -0.015], rx: 0.19, rz: 0.137 },
      ],
      16,
      CARDIGAN,
    );
  });
  part(["chest", "neck"], () => {
    ringTube(
      k,
      [
        { c: [0, 1.845, 0.0], rx: 0.07, rz: 0.064 },
        { c: [0, 1.79, -0.006], rx: 0.112, rz: 0.088 },
      ],
      12,
      LINEN,
    );
  });
  // montre de gousset épinglée sur la poitrine
  part(["chest"], () => {
    k.cylinder([-0.09, 1.6, 0.125], [-0.09, 1.6, 0.143], 0.022, 10, WATCH);
    k.tube(
      [
        [-0.09, 1.622, 0.135],
        [-0.085, 1.65, 0.137],
        [-0.075, 1.67, 0.132],
      ],
      0.003,
      3,
      WATCH,
    );
  }, "chest");
  // longs cheveux noirs et raides : calotte plaquée (le visage reste dégagé)…
  part(["head"], () => {
    const cols = 28;
    const rowsN = 8;
    const rows: V3[][] = [];
    for (let j = 0; j <= rowsN; j++) {
      const row: V3[] = [];
      for (let i = 0; i <= cols; i++) {
        const th = (i / cols) * Math.PI * 2; // 0 = devant
        const front = Math.max(0, Math.cos(th));
        const back = Math.max(0, -Math.cos(th));
        // volume : plus épais derrière et vers le bas
        const eps = 0.01 + 0.014 * back * (j / rowsN);
        const ry = SKULL_R[1] + eps;
        // lisière : haut du front devant, sous les oreilles sur les côtés et derrière
        const yMin = 1.97 + 0.165 * front * front;
        const phi = Math.acos(Math.max(-1, Math.min(1, (yMin - SKULL_C[1]) / ry))) * (j / rowsN);
        row.push([
          SKULL_C[0] + (SKULL_R[0] + eps) * Math.sin(phi) * Math.sin(th),
          SKULL_C[1] + ry * Math.cos(phi),
          SKULL_C[2] + (SKULL_R[2] + eps) * Math.sin(phi) * Math.cos(th),
        ]);
      }
      rows.push(row);
    }
    k.grid(rows, HAIR, fromSkull, { closed: true });
  }, "head");
  // … rideau qui tombe dans le dos, derrière les épaules, pointes irrégulières…
  part(["head", "neck", "chest", "spine2"], () => {
    // anneaux : hauteur, demi-axes, centre z, ouverture devant (rad, de chaque côté)
    const K = [
      { y: 2.05, rx: 0.113, rz: 0.113, zc: 0.016, open: 1.3 },
      { y: 1.96, rx: 0.12, rz: 0.12, zc: 0.006, open: 1.45 },
      { y: 1.86, rx: 0.155, rz: 0.132, zc: -0.006, open: 1.8 },
      { y: 1.77, rx: 0.236, rz: 0.16, zc: -0.015, open: 2.15 },
      { y: 1.62, rx: 0.24, rz: 0.165, zc: -0.015, open: 2.2 },
      { y: 1.46, rx: 0.214, rz: 0.16, zc: -0.015, open: 2.25 },
    ];
    const cols = 22;
    const rows = K.map((r, j) => {
      const row: V3[] = [];
      for (let i = 0; i <= cols; i++) {
        const th = r.open + ((Math.PI * 2 - 2 * r.open) * i) / cols;
        const jag = j === K.length - 1 ? 0.05 * Math.abs(Math.sin(i * 1.7)) + 0.045 * Math.abs(Math.sin(i * 0.83 + 1)) : 0;
        row.push([r.rx * Math.sin(th), r.y - jag, r.zc + r.rz * Math.cos(th)]);
      }
      return row;
    });
    k.grid(rows, HAIR, (p) => [p[0], 0, p[2] + 0.01], { twoSided: true });
  });
  // … et deux mèches qui encadrent le visage, devant les épaules
  for (const sx of [-1, 1]) {
    part(["head", "neck", "chest"], () => {
      const path: Array<[number, number, number, number]> = [
        [0.088, 2.075, 0.075, 0.02],
        [0.1, 1.97, 0.078, 0.026],
        [0.118, 1.86, 0.094, 0.028],
        [0.131, 1.75, 0.114, 0.028],
        [0.136, 1.63, 0.127, 0.025],
        [0.13, sx > 0 ? 1.46 : 1.5, 0.124, 0.012],
      ];
      const rows = path.map(([x, y, z, hw]): V3[] => {
        // largeur : tangente horizontale au corps
        const r = unit([x * sx, 0, z + 0.01]);
        return [
          [x * sx - r[2] * hw, y, z + r[0] * hw],
          [x * sx + r[2] * hw, y, z - r[0] * hw],
        ];
      });
      k.grid(rows, HAIR, (p) => [p[0], 0, p[2] + 0.01], { twoSided: true });
    });
  }
  // coiffe d'infirmière à croix rouge, posée sur les cheveux
  part(["head"], () => {
    k.push().translate(0, 2.19, 0.035).rotateX(-0.3);
    k.box(0, 0, 0, 0.078, 0.028, 0.058, LINEN);
    k.box(0, 0.002, 0.06, 0.007, 0.02, 0.003, CROSS);
    k.box(0, 0.002, 0.06, 0.021, 0.007, 0.003, CROSS);
    k.pop();
  }, "head");
  // sourire cousu
  part(["head", "jaw"], () => {
    const face = (x: number) => 0.02 + Math.sqrt(Math.max(0, 0.089 * 0.089 - x * x)) + 0.004;
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const x = -0.05 + (0.1 * i) / 6;
      pts.push([x, 1.985 + (x * x) * 3.2, face(x)]);
    }
    k.tube(pts, 0.0035, 4, SOCKET);
    for (let i = 1; i <= 5; i++) {
      const x = -0.05 + (0.1 * i) / 6;
      const y = 1.985 + x * x * 3.2;
      k.cylinder([x, y - 0.011, face(x) + 0.001], [x, y + 0.011, face(x) + 0.001], 0.0022, 3, THREAD);
    }
  });
}

/** Le Patient zéro : blouse de patient en lambeaux, bandages, bracelet, pied à perfusion. */
function patientOutfit(k: ModelKit, part: Part, H: (n: BoneName) => V3): void {
  shortSleeve(k, part, H, "L", GOWN_P);
  shortSleeve(k, part, H, "R", GOWN_P);
  // blouse de patient : courte (mi-cuisse), très déchirée
  part(["chest", "spine2", "spine1", "hips", "thighL", "thighR"], () => {
    ringTube(
      k,
      [
        { c: [0, 1.78, -0.01], rx: 0.1, rz: 0.075 },
        { c: [0, 1.74, -0.015], rx: 0.215, rz: 0.12 },
        { c: [0, 1.6, -0.015], rx: 0.21, rz: 0.13 },
        { c: [0, 1.42, -0.015], rx: 0.18, rz: 0.125 },
        { c: [0, 1.22, -0.01], rx: 0.19, rz: 0.13 },
        { c: [0, 1.02, -0.005], rx: 0.225, rz: 0.16 },
        { c: [0, 0.86, 0], rx: 0.25, rz: 0.18 },
      ],
      18,
      GOWN_P,
      (a) => Math.sin(a * 6) * 0.07 + Math.sin(a * 11 + 0.7) * 0.04 + Math.max(0, Math.sin(a * 2 + 2.1)) * -0.14,
    );
  });
  // bandages plaqués : front, tour de tête de travers, mâchoire (passe sous le menton)
  part(["head"], () => {
    skullBand(k, [0, 2.125, 0.02], [0, 1, -0.28], 0.019, 0.006, BANDAGE);
    skullBand(k, [0, 2.15, 0.02], [0.3, 1, 0.1], 0.016, 0.01, BANDAGE);
  }, "head");
  part(["head", "jaw"], () => {
    // bouche béante
    k.push().translate(0, 1.972, 0.094).scale(1, 0.8, 0.55);
    k.sphere([0, 0, 0], 0.036, 8, SOCKET);
    k.pop();
    skullBand(k, [0, 2.03, 0.0], [0, -0.18, 1], 0.021, 0.014, BANDAGE, 32);
  });
  // bandages enroulés : avant-bras gauche, tibia droit (rayons de peau : ceux des cylindres du corps)
  const elL = H("forearmL");
  const wrL = H("handL");
  part(["upperArmL", "forearmL", "handL"], () => limbWrap(k, lerp3(elL, wrL, 0.14), lerp3(elL, wrL, 0.86), 0.034 - 0.008 * 0.14, 0.034 - 0.008 * 0.86, 4, BANDAGE));
  const knR = H("shinR");
  const anR = H("footR");
  part(["thighR", "shinR", "footR"], () => limbWrap(k, lerp3(knR, anR, 0.14), lerp3(knR, anR, 0.84), 0.046 - 0.014 * 0.14, 0.046 - 0.014 * 0.84, 5, BANDAGE));
  // bracelet d'hôpital au poignet droit, cathéter scotché sur l'avant-bras
  const wrR = H("handR");
  const elR = H("forearmR");
  part(["forearmR", "handR"], () => {
    ringTube(
      k,
      [
        { c: [wrR[0], wrR[1] + 0.045, wrR[2]], rx: 0.036, rz: 0.036 },
        { c: [wrR[0], wrR[1] + 0.025, wrR[2]], rx: 0.036, rz: 0.036 },
      ],
      10,
      TAG,
    );
  });
  const cath: V3 = [elR[0] + 0.012, elR[1] - 0.2, elR[2] + 0.032];
  part(["forearmR"], () => k.box(cath[0], cath[1], cath[2], 0.018, 0.012, 0.006, TAG), "forearmR");
  // pied à perfusion tenu dans la main gauche, la base traîne derrière
  const grip: V3 = [wrL[0] - 0.015, wrL[1] - 0.07, wrL[2] + 0.02];
  const dir: V3 = [-0.01, 0.95, 0.26];
  const at = (y: number): V3 => {
    const t = (y - grip[1]) / dir[1];
    return [grip[0] + dir[0] * t, y, grip[2] + dir[2] * t];
  };
  const base = at(0.07);
  const top = at(1.86);
  part(["handL"], () => {
    k.cylinder(base, top, 0.011, 6, POLE);
    // piètement à 5 branches et roulettes
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const end: V3 = [base[0] + Math.cos(a) * 0.2, 0.045, base[2] + Math.sin(a) * 0.2];
      k.cylinder(base, end, 0.009, 5, POLE);
      k.sphere([end[0], 0.028, end[2]], 0.026, 6, WHEEL);
    }
    // crochet et poche de perfusion
    k.tube([top, [top[0], top[1] + 0.03, top[2] + 0.05], [top[0], top[1] - 0.02, top[2] + 0.07]], 0.005, 4, POLE);
    k.push().translate(top[0], top[1] - 0.15, top[2] + 0.075).scale(0.75, 1.25, 0.35);
    k.sphere([0, 0, 0], 0.085, 10, BAG);
    k.pop();
    k.box(top[0], top[1] - 0.14, top[2] + 0.106, 0.034, 0.042, 0.002, TAG);
    k.cylinder([top[0], top[1] - 0.25, top[2] + 0.075], [top[0], top[1] - 0.3, top[2] + 0.075], 0.009, 6, BAG);
  }, "handL");
  // tubulure : de la poche au cathéter du bras droit
  part(["handL", "chest", "hips", "forearmR"], () => {
    k.tube(
      [
        [top[0], top[1] - 0.26, top[2] + 0.075],
        [top[0] + 0.06, top[1] - 0.55, top[2] + 0.1],
        [-0.12, 1.12, 0.26],
        [0.1, 1.02, 0.2],
        [cath[0] - 0.01, cath[1] - 0.03, cath[2] + 0.004],
      ],
      0.0045,
      4,
      LINE,
    );
  });
}

/** Géométrie + pondération d'une tenue (même squelette pour toutes). */
function monsterGeometry(skin: SkinId): { k: ModelKit; mIdx: Float32Array; mW: Float32Array } {
  const defs = boneDefs();
  const byName = new Map(defs.map((d) => [d.name, d]));
  const index = new Map<BoneName, number>();
  defs.forEach((d, i) => index.set(d.name, i));
  const tailOf = (d: BoneDef): V3 => {
    if (d.tail) return d.tail;
    const child = defs.find((c) => c.parent === d.name);
    return child ? child.head : [d.head[0], d.head[1] + 0.1, d.head[2]];
  };

  const k = new ModelKit();
  k.groundAO = false;
  const weights: Array<{ from: number; to: number; bones: BoneName[]; rigid?: BoneName }> = [];
  const part: Part = (bones, fn, rigid) => {
    const from = k.vertexCount;
    fn();
    weights.push({ from, to: k.vertexCount, bones, rigid });
  };
  const H = (n: BoneName) => byName.get(n)!.head;

  body(k, part, H, LOOKS[skin], (n) => tailOf(byName.get(n)!));
  if (skin === "nightNurse") nurseOutfit(k, part, H);
  else if (skin === "patientZero") patientOutfit(k, part, H);
  else classicOutfit(k, part, H);

  // pondération : jusqu'à 3 os parmi les candidats de la pièce, selon la distance aux segments
  const nV = k.vertexCount;
  const mIdx = new Float32Array(nV * 4);
  const mW = new Float32Array(nV * 4);
  for (const w of weights) {
    for (let v = w.from; v < w.to; v++) {
      const p: V3 = [k.positions[v * 3]!, k.positions[v * 3 + 1]!, k.positions[v * 3 + 2]!];
      if (w.rigid) {
        mIdx[v * 4] = index.get(w.rigid)!;
        mW[v * 4] = 1;
        continue;
      }
      const cands = w.bones.map((b) => {
        const d = byName.get(b)!;
        const dist = segDist(p, d.head, tailOf(d));
        return { i: index.get(b)!, w: 1 / Math.pow(dist + 0.015, 4) };
      });
      cands.sort((a, b) => b.w - a.w);
      const top = cands.slice(0, 3);
      const sum = top.reduce((a, c) => a + c.w, 0);
      top.forEach((c, j) => {
        mIdx[v * 4 + j] = c.i;
        mW[v * 4 + j] = c.w / sum;
      });
    }
  }
  return { k, mIdx, mW };
}

/** Remplit (ou remplace) la géométrie skinnée du mesh pour une tenue. */
function fillMesh(mesh: Mesh, skin: SkinId): void {
  const { k, mIdx, mW } = monsterGeometry(skin);
  const vd = new VertexData();
  vd.positions = k.positions;
  vd.normals = k.normals;
  vd.uvs = k.uvs;
  vd.colors = k.colors;
  vd.indices = k.indices;
  vd.applyToMesh(mesh, true);
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, mIdx, false, 4);
  mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, mW, false, 4);
  mesh.numBoneInfluencers = 3;
  mesh.refreshBoundingInfo();
}

/**
 * Construit le Chirurgien : squelette (36 os), mesh skinné procédural (corps décharné, tenue selon
 * le skin, bras démesurés, doigts-griffes), yeux luisants.
 */
export function buildMonster(scene: Scene, material: Material, eyeMaterial: Material, skin: SkinId = "classic"): MonsterRig {
  const defs = boneDefs();
  const byName = new Map(defs.map((d) => [d.name, d]));

  const mesh = new Mesh("monster", scene);
  fillMesh(mesh, skin);
  mesh.material = material;
  mesh.isPickable = false;

  // ------------------------------------------------------------------ squelette
  const skeleton = new Skeleton("surgeon", "surgeon", scene);
  const bones = {} as Record<BoneName, Bone>;
  const rest = {} as Record<BoneName, Vector3>;
  for (const d of defs) {
    const parent = d.parent ? bones[d.parent] : null;
    const ph = d.parent ? byName.get(d.parent)!.head : ([0, 0, 0] as V3);
    const local = Matrix.Translation(d.head[0] - ph[0], d.head[1] - ph[1], d.head[2] - ph[2]);
    const b = new Bone(d.name, skeleton, parent, local, local.clone());
    bones[d.name] = b;
    rest[d.name] = new Vector3(d.head[0], d.head[1], d.head[2]);
  }
  skeleton.returnToRest();
  mesh.skeleton = skeleton;

  const root = new TransformNode("monsterRoot", scene);
  mesh.parent = root;

  // yeux : deux points luisants dans les orbites, attachés à l'os de la tête
  const ek = new ModelKit();
  ek.groundAO = false;
  const head = byName.get("head")!.head;
  for (const x of [-0.034, 0.034]) ek.sphere([x, 2.075 - head[1], 0.108 - head[2]], 0.0055, 6, { region: Region.WHITE });
  const eyes = ek.toMesh("monsterEyes", scene);
  eyes.material = eyeMaterial;
  eyes.isPickable = false;
  eyes.attachToBone(bones.head, mesh);

  const thighLen = Vector3.Distance(rest.thighL, rest.shinL);
  const shinLen = Vector3.Distance(rest.shinL, rest.footL);
  return { root, mesh, eyes, skeleton, bones, rest, thighLen, shinLen, skin };
}

/** Change de tenue à chaud : même squelette (animations identiques), nouvelle géométrie. */
export function setMonsterSkin(rig: MonsterRig, skin: SkinId): void {
  if (rig.skin === skin) return;
  fillMesh(rig.mesh, skin);
  rig.skin = skin;
}
