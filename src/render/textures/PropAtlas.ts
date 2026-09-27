import { Cells, lerp, Noise, smoothstep } from "./noise";
import { TexCanvas } from "./TexCanvas";

const N = new Noise(9001);
const N2 = new Noise(31337);
const tmp: [number, number, number] = [0, 0, 0];

type RegionFn = (u: number, v: number, out: RegionOut) => void;

interface RegionOut {
  r: number;
  g: number;
  b: number;
  h: number;
  rough: number;
  metal: number;
  ao: number;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const scratchCells = new Cells(12, N2.rand);

/** Métal peint (blanc cassé), éclats et rouille sur les bords. */
const paintedMetal: RegionFn = (u, v, o) => {
  const chip = smoothstep(0.66, 0.7, N.fbm(u, v, 6, 5) * 0.5 + 0.5);
  const rust = smoothstep(0.72, 0.8, N2.fbm(u, v, 5, 4) * 0.5 + 0.5);
  const base = 0.86 + N.fbm(u, v, 30, 2) * 0.03;
  o.r = lerp(lerp(base, 0.5, chip), 0.42, rust);
  o.g = lerp(lerp(base, 0.5, chip), 0.25, rust);
  o.b = lerp(lerp(base * 0.97, 0.52, chip), 0.14, rust);
  o.h = -chip * 0.3 + rust * 0.2;
  o.rough = lerp(lerp(0.45, 0.35, chip), 0.9, rust);
  o.metal = lerp(lerp(0.0, 0.9, chip), 0.2, rust);
  o.ao = 1;
};

/** Acier inox / chrome brossé. */
const steel: RegionFn = (u, v, o) => {
  const brush = N.perlin(u * 3, v * 150, 3, 150) * 0.5 + 0.5;
  const smudge = smoothstep(0.55, 0.85, N2.fbm(u, v, 4, 4) * 0.5 + 0.5);
  const c = 0.78 + (brush - 0.5) * 0.06 - smudge * 0.1;
  o.r = c;
  o.g = c;
  o.b = c * 1.01;
  o.h = brush * 0.05;
  o.rough = 0.22 + smudge * 0.3;
  o.metal = 1;
  o.ao = 1;
};

/** Métal très rouillé. */
const rust: RegionFn = (u, v, o) => {
  const n = N.fbm(u, v, 8, 5) * 0.5 + 0.5;
  const flake = N2.fbm(u, v, 30, 3) * 0.5 + 0.5;
  o.r = 0.35 + n * 0.25;
  o.g = 0.18 + n * 0.12;
  o.b = 0.1 + n * 0.05;
  o.h = flake * 0.5;
  o.rough = 0.9;
  o.metal = 0.25;
  o.ao = 0.85 + flake * 0.15;
};

/** Plastique mat clair (teinté par sommet). */
const plastic: RegionFn = (u, v, o) => {
  const n = N.fbm(u, v, 20, 3) * 0.5 + 0.5;
  scratchCells.eval(u, v, tmp);
  const scratch = 1 - smoothstep(0.0, 0.02, tmp[1] - tmp[0]);
  const c = 0.82 + n * 0.05 - scratch * 0.08;
  o.r = c;
  o.g = c;
  o.b = c;
  o.h = -scratch * 0.2;
  o.rough = 0.5 + scratch * 0.2;
  o.metal = 0;
  o.ao = 1;
};

/** Tissu (drap) : trame + plis doux. */
const fabric: RegionFn = (u, v, o) => {
  const weave = (Math.sin(u * 600) * Math.sin(v * 600)) * 0.5 + 0.5;
  const folds = N.fbm(u * 0.5, v, 4, 3) * 0.5 + 0.5;
  const grime = smoothstep(0.6, 0.85, N2.fbm(u, v, 3, 4) * 0.5 + 0.5);
  const c = 0.88 - weave * 0.04 - (folds - 0.5) * 0.08 - grime * 0.18;
  o.r = c;
  o.g = c * 0.99;
  o.b = c * 0.95;
  o.h = folds * 0.6 + weave * 0.05;
  o.rough = 0.95;
  o.metal = 0;
  o.ao = 0.9 + folds * 0.1;
};

/** Tissu taché de sang / de rouille. */
const fabricStained: RegionFn = (u, v, o) => {
  fabric(u, v, o);
  const stain = N.fbm(u + 3.1, v, 3, 5) * 0.5 + 0.5;
  const s = smoothstep(0.6, 0.68, stain) * 0.85;
  const edge = (smoothstep(0.58, 0.6, stain) - smoothstep(0.6, 0.68, stain)) * 0.6;
  o.r = lerp(o.r, 0.45, s) - edge * 0.08;
  o.g = lerp(o.g, 0.1, s) - edge * 0.08;
  o.b = lerp(o.b, 0.08, s) - edge * 0.04;
  o.rough = lerp(o.rough, 0.6, s);
};

/** Matelas à rayures, taches jaunâtres. */
const mattress: RegionFn = (u, v, o) => {
  const stripe = Math.sin(u * Math.PI * 24) > 0.3 ? 1 : 0;
  const quilt = (Math.abs(Math.sin(u * Math.PI * 6)) * Math.abs(Math.sin(v * Math.PI * 6))) ** 0.5;
  const stain = smoothstep(0.55, 0.75, N.fbm(u, v, 3, 5) * 0.5 + 0.5);
  let r = stripe ? 0.62 : 0.84;
  let g = stripe ? 0.7 : 0.84;
  let b = stripe ? 0.78 : 0.8;
  r = lerp(r, 0.62, stain);
  g = lerp(g, 0.52, stain);
  b = lerp(b, 0.3, stain);
  o.r = r * (0.85 + quilt * 0.15);
  o.g = g * (0.85 + quilt * 0.15);
  o.b = b * (0.85 + quilt * 0.15);
  o.h = quilt * 0.6;
  o.rough = 0.9;
  o.metal = 0;
  o.ao = 0.8 + quilt * 0.2;
};

const woodFn =
  (base: [number, number, number]): RegionFn =>
  (u, v, o) => {
    const grain = N.perlin(u * 6, v * 60, 6, 60) * 0.5 + 0.5;
    const rings = Math.sin((u * 30 + grain * 4) * Math.PI) * 0.5 + 0.5;
    const wear = smoothstep(0.6, 0.85, N2.fbm(u, v, 4, 3) * 0.5 + 0.5);
    const k = 0.85 + rings * 0.18;
    o.r = base[0] * k * (1 + wear * 0.2);
    o.g = base[1] * k * (1 + wear * 0.15);
    o.b = base[2] * k * (1 + wear * 0.1);
    o.h = rings * 0.1;
    o.rough = 0.5 + wear * 0.3;
    o.metal = 0;
    o.ao = 1;
  };

/** Caoutchouc noir. */
const rubber: RegionFn = (u, v, o) => {
  const n = N.fbm(u, v, 40, 2) * 0.5 + 0.5;
  o.r = o.g = o.b = 0.1 + n * 0.04;
  o.h = n * 0.3;
  o.rough = 0.85;
  o.metal = 0;
  o.ao = 1;
};

/** Papier imprimé (lignes de texte), jauni. */
const paper: RegionFn = (u, v, o) => {
  const lineY = v * 36;
  const inLine = Math.abs(lineY - Math.floor(lineY) - 0.5) < 0.18;
  const word = N.value(u * 60, Math.floor(lineY) * 7.3, 60, 256) > 0.35;
  const margin = u > 0.1 && u < 0.9 && v > 0.08 && v < 0.92;
  const header = v > 0.84 && v < 0.9 && u < 0.6;
  const ink = (inLine && word && margin) || header;
  const yellow = N2.fbm(u, v, 3, 3) * 0.5 + 0.5;
  o.r = ink ? 0.2 : 0.86 - yellow * 0.06;
  o.g = ink ? 0.2 : 0.83 - yellow * 0.08;
  o.b = ink ? 0.25 : 0.74 - yellow * 0.12;
  o.h = 0;
  o.rough = 0.9;
  o.metal = 0;
  o.ao = 1;
};

/** Carton ondulé. */
const cardboard: RegionFn = (u, v, o) => {
  const flute = Math.sin(u * Math.PI * 80) * 0.5 + 0.5;
  const n = N.fbm(u, v, 10, 3) * 0.5 + 0.5;
  const tape = Math.abs(v - 0.5) < 0.05;
  o.r = tape ? 0.72 : 0.55 + n * 0.08;
  o.g = tape ? 0.6 : 0.42 + n * 0.06;
  o.b = tape ? 0.4 : 0.28 + n * 0.04;
  o.h = flute * 0.1;
  o.rough = tape ? 0.4 : 0.92;
  o.metal = 0;
  o.ao = 1;
};

/** Skaï / vinyle capitonné (sièges), craquelé. */
const vinyl: RegionFn = (u, v, o) => {
  scratchCells.eval(u * 0.9, v * 0.9, tmp);
  const crack = 1 - smoothstep(0.0, 0.015, tmp[1] - tmp[0]);
  const n = N.fbm(u, v, 12, 3) * 0.5 + 0.5;
  const c = 0.72 + n * 0.08 - crack * 0.3;
  o.r = c;
  o.g = c;
  o.b = c;
  o.h = n * 0.2 - crack * 0.4;
  o.rough = 0.45 + crack * 0.4;
  o.metal = 0;
  o.ao = 1 - crack * 0.3;
};

/** Écran / vitre sombre. */
const screen: RegionFn = (u, v, o) => {
  const n = N.fbm(u, v, 6, 3) * 0.5 + 0.5;
  const dust = smoothstep(0.55, 0.8, N2.fbm(u, v, 8, 3) * 0.5 + 0.5);
  o.r = 0.04 + dust * 0.12;
  o.g = 0.05 + dust * 0.12;
  o.b = 0.06 + dust * 0.12;
  o.h = 0;
  o.rough = 0.08 + dust * 0.6 + n * 0.05;
  o.metal = 0;
  o.ao = 1;
};

const white: RegionFn = (_u, _v, o) => {
  o.r = o.g = o.b = 0.95;
  o.h = 0;
  o.rough = 0.4;
  o.metal = 0;
  o.ao = 1;
};

const concrete: RegionFn = (u, v, o) => {
  const n = N.fbm(u, v, 8, 4) * 0.5 + 0.5;
  const f = N2.fbm(u, v, 40, 2) * 0.5 + 0.5;
  const c = 0.55 + (n - 0.5) * 0.15 + (f - 0.5) * 0.05;
  o.r = c;
  o.g = c * 0.98;
  o.b = c * 0.94;
  o.h = f * 0.4;
  o.rough = 0.9;
  o.metal = 0;
  o.ao = 1;
};

const REGIONS: RegionFn[] = [
  paintedMetal,
  steel,
  rust,
  plastic,
  fabric,
  fabricStained,
  mattress,
  woodFn([0.62, 0.46, 0.3]),
  woodFn([0.34, 0.2, 0.12]),
  rubber,
  paper,
  cardboard,
  vinyl,
  screen,
  white,
  concrete,
];

/** Génère l'atlas des props (4 × 4 régions). */
export function propAtlas(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const cell = S / 4;
  const o: RegionOut = { r: 0, g: 0, b: 0, h: 0, rough: 0.8, metal: 0, ao: 1 };
  t.each((_u, _v, x, y, i) => {
    const col = Math.floor(x / cell);
    const row = Math.floor(y / cell);
    const fn = REGIONS[row * 4 + col]!;
    const lu = (x - col * cell + 0.5) / cell;
    const lv = (y - row * cell + 0.5) / cell;
    fn(lu, lv, o);
    t.set(i, o.r, o.g, o.b);
    t.height[i] = o.h;
    t.rough[i] = o.rough;
    t.metal[i] = o.metal;
    t.ao[i] = o.ao;
  });
  void hash;
  return t;
}
