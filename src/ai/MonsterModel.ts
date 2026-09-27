import { Bone } from "@babylonjs/core/Bones/bone";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Material } from "@babylonjs/core/Materials/material";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
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
}

const SKIN: PartStyle = { region: Region.VINYL, color: [0.54, 0.54, 0.48] };
const SKIN_DARK: PartStyle = { region: Region.VINYL, color: [0.4, 0.38, 0.33] };
const GOWN: PartStyle = { region: Region.FABRIC_STAINED, color: [0.4, 0.5, 0.45], uv: 1.2 };
const MASK: PartStyle = { region: Region.FABRIC_STAINED, color: [0.72, 0.82, 0.86], uv: 2 };
const CAP: PartStyle = { region: Region.FABRIC, color: [0.46, 0.6, 0.56], uv: 2 };
const CLAW: PartStyle = { region: Region.RUST, color: [0.35, 0.2, 0.16] };
const BLOOD: PartStyle = { region: Region.VINYL, color: [0.42, 0.14, 0.1] };
const SOCKET: PartStyle = { region: Region.RUBBER, color: [0.05, 0.03, 0.03] };

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

/**
 * Construit le Chirurgien : squelette (36 os), mesh skinné procédural (corps décharné, blouse
 * chirurgicale déchirée et tachée, masque, calot, bras démesurés, doigts-griffes), yeux luisants.
 */
export function buildMonster(scene: Scene, material: Material, eyeMaterial: Material): MonsterRig {
  const defs = boneDefs();
  const byName = new Map(defs.map((d) => [d.name, d]));
  const index = new Map<BoneName, number>();
  defs.forEach((d, i) => index.set(d.name, i));
  const tailOf = (d: BoneDef): V3 => {
    if (d.tail) return d.tail;
    const child = defs.find((c) => c.parent === d.name);
    return child ? child.head : [d.head[0], d.head[1] + 0.1, d.head[2]];
  };

  // ------------------------------------------------------------------ géométrie
  const k = new ModelKit();
  k.groundAO = false;
  const weights: Array<{ from: number; to: number; bones: BoneName[]; rigid?: BoneName }> = [];
  const part = (bones: BoneName[], fn: () => void, rigid?: BoneName) => {
    const from = k.vertexCount;
    fn();
    weights.push({ from, to: k.vertexCount, bones, rigid });
  };
  const H = (n: BoneName) => byName.get(n)!.head;

  for (const s of ["L", "R"] as const) {
    const n = (b: string) => `${b}${s}` as BoneName;
    const hip = H(n("thigh"));
    const knee = H(n("shin"));
    const ankle = H(n("foot"));
    const toe = H(n("toe"));
    // jambe décharnée : cuisse → genou osseux → cheville
    part(["hips", n("thigh"), n("shin"), n("foot")], () => {
      k.cylinder([hip[0], hip[1] + 0.02, hip[2]], knee, 0.062, 10, SKIN, false, 0.045);
      k.sphere(knee, 0.05, 8, SKIN_DARK);
      k.cylinder(knee, ankle, 0.046, 9, SKIN, false, 0.032);
    });
    // pied long et fin
    part([n("shin"), n("foot"), n("toe")], () => {
      k.sphere(ankle, 0.036, 8, SKIN_DARK);
      k.cylinder([ankle[0], ankle[1] - 0.02, ankle[2] - 0.05], [toe[0], toe[1] + 0.005, toe[2]], 0.035, 8, SKIN_DARK, true, 0.028);
    });
    part([n("foot"), n("toe")], () => {
      for (let t = -1; t <= 1; t++) k.cylinder([toe[0] + t * 0.018, toe[1], toe[2]], [toe[0] + t * 0.024, 0.012, toe[2] + 0.1], 0.011, 5, SKIN_DARK, true, 0.005);
    });
    // bras démesurés
    const sh = H(n("upperArm"));
    const el = H(n("forearm"));
    const wr = H(n("hand"));
    part([n("clav"), n("upperArm"), n("forearm"), n("hand")], () => {
      k.cylinder([sh[0] * 0.8, sh[1] + 0.01, sh[2]], el, 0.042, 9, SKIN, false, 0.033);
      k.sphere(el, 0.037, 8, SKIN_DARK);
      k.cylinder(el, wr, 0.034, 9, SKIN, false, 0.026);
    });
    // manche courte de la blouse
    part(["chest", n("clav"), n("upperArm")], () => {
      ringTube(
        k,
        [
          { c: [sh[0] * 0.75, sh[1] + 0.04, sh[2]], rx: 0.075, rz: 0.075 },
          { c: [sh[0] * 1.03, sh[1] - 0.08, sh[2]], rx: 0.07, rz: 0.07 },
          { c: [sh[0] * 1.06, sh[1] - 0.16, sh[2]], rx: 0.068, rz: 0.068 },
        ],
        10,
        GOWN,
        (a) => Math.sin(a * 5) * 0.02 - 0.01,
      );
    });
    // main + doigts-griffes (maculés de sang)
    part([n("forearm"), n("hand"), n("finger") + "0a" as BoneName, n("finger") + "1a" as BoneName, n("finger") + "2a" as BoneName], () => {
      k.cylinder(wr, [wr[0] * 1.02, 0.9, wr[2] + 0.01], 0.03, 8, BLOOD, true, 0.026);
      // pouce
      k.cylinder([wr[0], 0.96, wr[2] + 0.03], [wr[0] * 0.96, 0.87, wr[2] + 0.06], 0.012, 5, BLOOD, true, 0.008);
    });
    for (let f = 0; f < 3; f++) {
      const a = byName.get(`finger${s}${f}a` as BoneName)!;
      const b = byName.get(`finger${s}${f}b` as BoneName)!;
      const tip = tailOf(b);
      part([n("hand"), `finger${s}${f}a` as BoneName, `finger${s}${f}b` as BoneName], () => {
        k.cylinder(a.head, b.head, 0.0115, 6, BLOOD, false, 0.0095);
        k.sphere(b.head, 0.011, 5, BLOOD);
        k.cylinder(b.head, [tip[0], tip[1] + 0.03, tip[2] - 0.004], 0.0095, 6, SKIN_DARK, false, 0.007);
        k.cylinder([tip[0], tip[1] + 0.035, tip[2] - 0.004], tip, 0.007, 5, CLAW, true, 0.001);
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
      SKIN,
    );
  });
  // cou long
  part(["chest", "neck", "head"], () => {
    k.cylinder([0, 1.77, -0.005], [0, 1.97, 0.025], 0.042, 9, SKIN, false, 0.036);
    // vertèbres saillantes
    for (let i = 0; i < 4; i++) k.sphere([0, 1.8 + i * 0.045, -0.035 + i * 0.012], 0.016, 5, SKIN_DARK);
  });
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
  // tête allongée, orbites creuses, masque et calot
  part(["head"], () => {
    k.sphere([0, 2.05, 0.02], 0.1, 12, SKIN, 1.3);
    k.sphere([-0.034, 2.075, 0.095], 0.023, 6, SOCKET);
    k.sphere([0.034, 2.075, 0.095], 0.023, 6, SOCKET);
    k.push().translate(0, 2.13, 0.0).scale(1, 0.72, 1.1);
    k.sphere([0, 0, 0], 0.104, 12, CAP);
    k.pop();
    // liens du masque
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

  const mesh = new Mesh("monster", scene);
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
  return { root, mesh, eyes, skeleton, bones, rest, thighLen, shinLen };
}
