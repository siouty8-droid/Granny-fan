/**
 * Atlas de decals dessiné au canvas 2D (4 × 4 cases) : taches, sang, traînées, empreintes,
 * tags, dessins d'enfants, fissures, moisissure… + atlas des panneaux de signalétique.
 */

export const DECAL = {
  STAIN: 0,
  BLOOD_POOL: 1,
  BLOOD_SPLAT: 2,
  DRAG: 3,
  FOOTPRINTS: 4,
  WATER: 5,
  MOLD: 6,
  CRACK: 7,
  HANDPRINT: 8,
  GRAFFITI_1: 9,
  GRAFFITI_2: 10,
  GRAFFITI_3: 11,
  DRAWING: 12,
  SCRATCHES: 13,
  PUDDLE: 14,
  SOOT: 15,
} as const;

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

type Ctx = CanvasRenderingContext2D;

function blob(ctx: Ctx, cx: number, cy: number, r: number, color: string, rand: () => number, points = 14): void {
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (0.7 + rand() * 0.5);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.quadraticCurveTo(cx + Math.cos(a - 0.2) * rr * 1.1, cy + Math.sin(a - 0.2) * rr * 1.1, x, y);
  }
  ctx.fillStyle = color;
  ctx.fill();
}

function softSpot(ctx: Ctx, cx: number, cy: number, r: number, rgba: [number, number, number, number]): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]})`);
  g.addColorStop(1, `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

const DRAWERS: Array<(ctx: Ctx, s: number, rand: () => number) => void> = [
  // STAIN : tache sombre diffuse
  (ctx, s, rand) => {
    for (let i = 0; i < 18; i++) softSpot(ctx, s * (0.3 + rand() * 0.4), s * (0.3 + rand() * 0.4), s * (0.1 + rand() * 0.2), [30, 24, 16, 0.25]);
  },
  // BLOOD_POOL : flaque de sang séchée
  (ctx, s, rand) => {
    blob(ctx, s / 2, s / 2, s * 0.32, "rgba(70,6,6,0.92)", rand, 18);
    blob(ctx, s * 0.62, s * 0.58, s * 0.18, "rgba(45,3,3,0.95)", rand, 12);
    for (let i = 0; i < 14; i++) blob(ctx, s * (0.15 + rand() * 0.7), s * (0.15 + rand() * 0.7), s * (0.015 + rand() * 0.03), "rgba(80,8,8,0.85)", rand, 8);
  },
  // BLOOD_SPLAT : éclaboussure + coulures
  (ctx, s, rand) => {
    blob(ctx, s * 0.5, s * 0.35, s * 0.14, "rgba(95,8,8,0.9)", rand);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2;
      const d = s * (0.12 + rand() * 0.3);
      blob(ctx, s * 0.5 + Math.cos(a) * d, s * 0.35 + Math.sin(a) * d * 0.6, s * (0.008 + rand() * 0.02), "rgba(90,8,8,0.85)", rand, 6);
    }
    ctx.strokeStyle = "rgba(80,6,6,0.85)";
    for (let i = 0; i < 6; i++) {
      const x = s * (0.4 + rand() * 0.2);
      ctx.lineWidth = s * (0.006 + rand() * 0.01);
      ctx.beginPath();
      ctx.moveTo(x, s * 0.4);
      ctx.lineTo(x + (rand() - 0.5) * 4, s * (0.55 + rand() * 0.4));
      ctx.stroke();
    }
  },
  // DRAG : traînée de sang (corps traîné)
  (ctx, s, rand) => {
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(${60 + k * 10},5,5,${0.35 + rand() * 0.3})`;
      ctx.lineWidth = s * (0.05 + rand() * 0.06);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s * 0.1, s * (0.45 + k * 0.04));
      ctx.bezierCurveTo(s * 0.4, s * (0.4 + rand() * 0.1), s * 0.6, s * (0.55 + rand() * 0.1), s * 0.92, s * (0.5 + k * 0.03));
      ctx.stroke();
    }
    for (let i = 0; i < 20; i++) blob(ctx, s * (0.1 + rand() * 0.8), s * (0.35 + rand() * 0.3), s * 0.012, "rgba(70,6,6,0.7)", rand, 6);
  },
  // FOOTPRINTS : empreintes boueuses
  (ctx, s, rand) => {
    for (let i = 0; i < 5; i++) {
      const x = s * (0.3 + (i % 2) * 0.25);
      const y = s * (0.1 + i * 0.18);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.1 + rand() * 0.2);
      ctx.fillStyle = "rgba(40,30,20,0.6)";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.035, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, s * 0.09, s * 0.03, s * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  // WATER : auréole d'eau (murs, plafonds)
  (ctx, s, rand) => {
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(90,70,30,${0.25 + rand() * 0.2})`;
      ctx.lineWidth = s * 0.012;
      blob(ctx, s / 2, s / 2, s * (0.35 - i * 0.07), "rgba(110,90,50,0.08)", rand, 16);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const x = s * (0.3 + rand() * 0.4);
      ctx.fillStyle = "rgba(90,70,35,0.25)";
      ctx.fillRect(x, s * 0.5, s * 0.01, s * (0.2 + rand() * 0.3));
    }
  },
  // MOLD : moisissure noire-verdâtre
  (ctx, s, rand) => {
    for (let i = 0; i < 120; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * s * 0.4;
      softSpot(ctx, s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * (0.01 + rand() * 0.04), [20, 30, 15, 0.45]);
    }
  },
  // CRACK : fissure ramifiée
  (ctx, s, rand) => {
    ctx.strokeStyle = "rgba(15,12,10,0.85)";
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      let cx = x;
      let cy = y;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        a += (rand() - 0.5) * 0.9;
        cx += Math.cos(a) * (len / steps);
        cy += Math.sin(a) * (len / steps);
        ctx.lineTo(cx, cy);
        if (depth > 0 && rand() < 0.2) branch(cx, cy, a + (rand() - 0.5) * 2, len * 0.5, w * 0.6, depth - 1);
      }
      ctx.stroke();
    };
    branch(s * 0.1, s * 0.5, 0, s * 0.85, s * 0.012, 2);
  },
  // HANDPRINT : mains ensanglantées
  (ctx, s, rand) => {
    for (let h = 0; h < 2; h++) {
      ctx.save();
      ctx.translate(s * (0.35 + h * 0.3), s * (0.55 - h * 0.1));
      ctx.rotate(-0.3 + h * 0.5 + rand() * 0.2);
      ctx.fillStyle = "rgba(90,6,6,0.85)";
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.06, s * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let f = 0; f < 5; f++) {
        const fa = -Math.PI / 2 + (f - 2) * 0.32 + (f === 0 ? -0.5 : 0);
        ctx.beginPath();
        ctx.ellipse(Math.cos(fa) * s * 0.1, Math.sin(fa) * s * 0.1, s * 0.016, s * 0.05, fa + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // coulures
      for (let k = 0; k < 3; k++) ctx.fillRect(-s * 0.04 + k * s * 0.03, s * 0.05, s * 0.008, s * (0.08 + rand() * 0.15));
      ctx.restore();
    }
  },
  // GRAFFITI_1
  (ctx, s) => graffiti(ctx, s, ["IL EST", "TOUJOURS LÀ"], "rgba(180,20,20,0.9)", -0.08),
  // GRAFFITI_2
  (ctx, s) => graffiti(ctx, s, ["NE COURS", "PAS"], "rgba(220,220,210,0.85)", 0.05),
  // GRAFFITI_3
  (ctx, s) => graffiti(ctx, s, ["10 MIN", "MAX"], "rgba(40,140,200,0.85)", -0.04),
  // DRAWING : dessin d'enfant (maison + bonhommes + grande silhouette)
  (ctx, s, rand) => {
    ctx.fillStyle = "rgba(245,240,225,0.95)";
    ctx.fillRect(s * 0.08, s * 0.12, s * 0.84, s * 0.72);
    ctx.lineWidth = s * 0.012;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(40,90,200,0.9)";
    ctx.strokeRect(s * 0.18, s * 0.45, s * 0.25, s * 0.25);
    ctx.beginPath();
    ctx.moveTo(s * 0.16, s * 0.46);
    ctx.lineTo(s * 0.3, s * 0.32);
    ctx.lineTo(s * 0.45, s * 0.46);
    ctx.stroke();
    ctx.strokeStyle = "rgba(230,190,20,0.95)";
    ctx.beginPath();
    ctx.arc(s * 0.78, s * 0.24, s * 0.06, 0, Math.PI * 2);
    ctx.stroke();
    const stick = (x: number, y: number, h: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, h * 0.12, 0, Math.PI * 2);
      ctx.moveTo(x, y + h * 0.12);
      ctx.lineTo(x, y + h * 0.6);
      ctx.moveTo(x - h * 0.2, y + h * 0.3);
      ctx.lineTo(x + h * 0.2, y + h * 0.3);
      ctx.moveTo(x, y + h * 0.6);
      ctx.lineTo(x - h * 0.15, y + h);
      ctx.moveTo(x, y + h * 0.6);
      ctx.lineTo(x + h * 0.15, y + h);
      ctx.stroke();
    };
    stick(s * 0.55, s * 0.55, s * 0.18, "rgba(30,160,60,0.9)");
    stick(s * 0.65, s * 0.58, s * 0.14, "rgba(220,60,120,0.9)");
    // la grande silhouette noire aux bras trop longs…
    ctx.strokeStyle = "rgba(10,10,10,0.95)";
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.arc(s * 0.82, s * 0.42, s * 0.04, 0, Math.PI * 2);
    ctx.moveTo(s * 0.82, s * 0.46);
    ctx.lineTo(s * 0.82, s * 0.7);
    ctx.moveTo(s * 0.82, s * 0.5);
    ctx.lineTo(s * 0.7, s * 0.72);
    ctx.moveTo(s * 0.82, s * 0.5);
    ctx.lineTo(s * 0.92, s * 0.74);
    ctx.stroke();
    ctx.fillStyle = "rgba(200,0,0,0.9)";
    ctx.beginPath();
    ctx.arc(s * 0.81, s * 0.415, s * 0.008, 0, Math.PI * 2);
    ctx.arc(s * 0.835, s * 0.415, s * 0.008, 0, Math.PI * 2);
    ctx.fill();
    void rand;
  },
  // SCRATCHES : griffures
  (ctx, s, rand) => {
    ctx.strokeStyle = "rgba(25,20,18,0.8)";
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      const x = s * (0.3 + i * 0.1);
      ctx.moveTo(x, s * 0.15);
      ctx.bezierCurveTo(x + s * 0.05, s * 0.4, x - s * 0.02, s * 0.6, x + s * (0.02 + rand() * 0.05), s * 0.88);
      ctx.stroke();
    }
  },
  // PUDDLE : flaque d'eau (sombre, sera brillante)
  (ctx, s, rand) => {
    blob(ctx, s / 2, s / 2, s * 0.36, "rgba(8,10,12,0.55)", rand, 20);
    blob(ctx, s * 0.4, s * 0.45, s * 0.2, "rgba(6,8,10,0.45)", rand, 14);
  },
  // SOOT : traces de suie (incendie)
  (ctx, s, rand) => {
    for (let i = 0; i < 40; i++) softSpot(ctx, s * (0.3 + rand() * 0.4), s * (0.2 + rand() * 0.7), s * (0.06 + rand() * 0.12), [10, 9, 8, 0.2]);
  },
];

function graffiti(ctx: Ctx, s: number, lines: string[], color: string, rot: number): void {
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = s * 0.2;
  ctx.font = `bold ${size}px Impact, "Arial Black", "Liberation Sans", sans-serif`;
  lines.forEach((l, i) => {
    const y = (i - (lines.length - 1) / 2) * size * 1.05;
    ctx.fillText(l, 0, y);
    // coulures de peinture
    ctx.globalAlpha = 0.8;
    for (let k = 0; k < l.length; k += 2) ctx.fillRect(-size * l.length * 0.25 + k * size * 0.5, y + size * 0.3, size * 0.05, size * (0.2 + ((k * 7) % 5) * 0.12));
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

/** Génère l'atlas RGBA des decals (S × S). */
export function decalAtlas(S: number): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  const cell = S / 4;
  DRAWERS.forEach((draw, i) => {
    const cx = (i % 4) * cell;
    const cy = Math.floor(i / 4) * cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx + 2, cy + 2, cell - 4, cell - 4);
    ctx.clip();
    ctx.translate(cx, cy);
    draw(ctx, cell, rng(1000 + i * 77));
    ctx.restore();
  });
  const img = ctx.getImageData(0, 0, S, S);
  // l'image canvas a y vers le bas : on retourne verticalement pour v vers le haut
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    out.set(img.data.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
  }
  return out;
}

/** UV de la case `index` de l'atlas (4 × 4), v vers le haut. */
export function decalUV(index: number): [number, number, number, number] {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const s = 0.25;
  // la ligne 0 du dessin est en haut → après retournement, elle est en v haut
  const u0 = col * s;
  const v1 = 1 - row * s;
  return [u0 + 0.004, v1 - s + 0.004, u0 + s - 0.004, v1 - 0.004];
}

// =============================================================================
//  Panneaux de signalétique
// =============================================================================

export interface SignSpec {
  text: string;
  sub?: string;
  arrow?: "left" | "right" | "up" | "down" | "none";
  bg: string;
  fg: string;
}

export const SIGNS: SignSpec[] = [
  { text: "URGENCES", arrow: "right", bg: "#b01818", fg: "#ffffff" },
  { text: "URGENCES", arrow: "left", bg: "#b01818", fg: "#ffffff" },
  { text: "ACCUEIL", sub: "Hall principal", arrow: "none", bg: "#1d4f91", fg: "#ffffff" },
  { text: "CAFÉTÉRIA", arrow: "left", bg: "#1d4f91", fg: "#ffffff" },
  { text: "ESCALIER A", sub: "Niveaux 0 · 1", arrow: "none", bg: "#1f6b3a", fg: "#ffffff" },
  { text: "ESCALIER B", sub: "Niveaux -1 · 0 · 1", arrow: "none", bg: "#1f6b3a", fg: "#ffffff" },
  { text: "ESCALIER C", sub: "Service · -1 · 0", arrow: "none", bg: "#1f6b3a", fg: "#ffffff" },
  { text: "ASCENSEUR", sub: "HORS SERVICE", arrow: "none", bg: "#3a3a3a", fg: "#ffd24a" },
  { text: "RADIOLOGIE", arrow: "left", bg: "#1d4f91", fg: "#ffffff" },
  { text: "BLOC OPÉRATOIRE", sub: "Accès réservé", arrow: "none", bg: "#0f6d6d", fg: "#ffffff" },
  { text: "PÉDIATRIE", arrow: "left", bg: "#e0a01c", fg: "#1a1a1a" },
  { text: "CHAMBRES 101-112", arrow: "right", bg: "#1d4f91", fg: "#ffffff" },
  { text: "MORGUE", sub: "Personnel autorisé", arrow: "none", bg: "#2b2b2b", fg: "#dddddd" },
  { text: "LOCAL ÉLECTRIQUE", sub: "DANGER", arrow: "none", bg: "#e0c21c", fg: "#1a1a1a" },
  { text: "ARCHIVES", arrow: "none", bg: "#5a4a2a", fg: "#ffffff" },
  { text: "CHAPELLE", arrow: "none", bg: "#4a2a5a", fg: "#ffffff" },
  { text: "DIRECTION", arrow: "left", bg: "#6a1a1a", fg: "#ffffff" },
  { text: "VESTIAIRES", arrow: "none", bg: "#1d4f91", fg: "#ffffff" },
  { text: "CHAUFFERIE", arrow: "none", bg: "#8a3a10", fg: "#ffffff" },
  { text: "TOIT · HÉLISTATION", sub: "Machinerie", arrow: "up", bg: "#3a3a3a", fg: "#ffffff" },
  { text: "SALLE D'ATTENTE", arrow: "right", bg: "#1d4f91", fg: "#ffffff" },
  { text: "NIVEAU 0", sub: "Rez-de-chaussée", arrow: "none", bg: "#222222", fg: "#ffffff" },
  { text: "NIVEAU 1", sub: "Étage", arrow: "none", bg: "#222222", fg: "#ffffff" },
  { text: "NIVEAU -1", sub: "Sous-sol", arrow: "none", bg: "#222222", fg: "#ffffff" },
];

/** Atlas des panneaux (4 colonnes × 16 lignes, cases 2:1) : canvas W × 2W. */
export function signAtlas(W: number): Uint8Array {
  const H = W * 2;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const cw = W / 4;
  const ch = H / 16 / 2;
  SIGNS.forEach((sg, i) => {
    const x = (i % 4) * cw;
    const y = Math.floor(i / 4) * ch * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = sg.bg;
    ctx.fillRect(0, 0, cw, ch * 2);
    // usure
    for (let k = 0; k < 30; k++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + ((k * 37) % 10) / 120})`;
      ctx.fillRect(((k * 53) % 100) / 100 * cw, ((k * 29) % 100) / 100 * ch * 2, cw * 0.2, ch * 0.2);
    }
    ctx.fillStyle = sg.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const hasArrow = sg.arrow && sg.arrow !== "none";
    const fs = Math.min(ch * 0.62, (cw * 0.9) / Math.max(6, sg.text.length * 0.62));
    ctx.font = `bold ${fs}px "Arial", "Liberation Sans", sans-serif`;
    ctx.fillText(sg.text, cw / 2 - (hasArrow ? cw * 0.07 : 0), sg.sub ? ch * 0.8 : ch);
    if (sg.sub) {
      ctx.font = `${fs * 0.55}px "Arial", "Liberation Sans", sans-serif`;
      ctx.fillText(sg.sub, cw / 2, ch * 1.4);
    }
    if (hasArrow) {
      ctx.save();
      ctx.translate(cw * 0.88, ch);
      ctx.rotate(sg.arrow === "left" ? Math.PI : sg.arrow === "up" ? -Math.PI / 2 : sg.arrow === "down" ? Math.PI / 2 : 0);
      ctx.beginPath();
      ctx.moveTo(-ch * 0.3, -ch * 0.12);
      ctx.lineTo(ch * 0.05, -ch * 0.12);
      ctx.lineTo(ch * 0.05, -ch * 0.3);
      ctx.lineTo(ch * 0.35, 0);
      ctx.lineTo(ch * 0.05, ch * 0.3);
      ctx.lineTo(ch * 0.05, ch * 0.12);
      ctx.lineTo(-ch * 0.3, ch * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = ch * 0.06;
    ctx.strokeRect(ch * 0.05, ch * 0.05, cw - ch * 0.1, ch * 2 - ch * 0.1);
    ctx.restore();
  });
  const img = ctx.getImageData(0, 0, W, H);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) out.set(img.data.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  return out;
}

/** UV d'un panneau (4 × 16 cases). */
export function signUV(index: number): [number, number, number, number] {
  const col = index % 4;
  const row = Math.floor(index / 4);
  const u0 = col / 4;
  const v1 = 1 - row / 16;
  return [u0 + 0.002, v1 - 1 / 16 + 0.002, u0 + 1 / 4 - 0.002, v1 - 0.002];
}
