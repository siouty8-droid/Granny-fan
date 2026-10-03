import { Cells, lerp, Noise, smoothstep } from "./noise";
import { TexCanvas } from "./TexCanvas";

/**
 * Générateurs de textures d'architecture (familles). Les familles « teintables » sont
 * produites en quasi-neutre et colorées par `albedoColor` dans le matériau.
 * Chaque générateur renvoie une TexCanvas (albedo sRGB + hauteur + rugosité + métal + AO).
 */

const N = new Noise(1337);
const N2 = new Noise(4242);
const N3 = new Noise(777);
const tmp: [number, number, number] = [0, 0, 0];

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Saleté générique : taches sombres à basse fréquence. */
function grime(u: number, v: number, freq: number, amount: number): number {
  const n = N.fbm(u, v, freq, 4) * 0.5 + 0.5;
  return smoothstep(0.55, 0.85, n) * amount;
}

/** Réseau de fissures fines (bords de cellules de Worley filtrés par un masque). */
function crackMask(cells: Cells, u: number, v: number, width: number, maskFreq: number, maskThr: number): number {
  cells.eval(u, v, tmp);
  const edge = tmp[1] - tmp[0];
  const line = 1 - smoothstep(0, width, edge);
  const m = smoothstep(maskThr, maskThr + 0.15, N2.fbm(u, v, maskFreq, 3) * 0.5 + 0.5);
  return line * m;
}

// =============================================================================

/** Peinture sur plâtre : taches d'humidité, écaillures, saleté en pied de mur, éraflures. 2 m × 4 m. */
export function paint(S: number): TexCanvas {
  const t = new TexCanvas(S, S * 2);
  const cracks = new Cells(6, N3.rand);
  t.each((u, v, _x, _y, i) => {
    const plaster = N.fbm(u * 2, v, 16, 4) * 0.5 + 0.5;
    let c = 0.84 + (plaster - 0.5) * 0.06;
    let r = c;
    let g = c;
    let b = c * 0.98;
    let hgt = plaster * 0.15;
    let rough = 0.72 + plaster * 0.1;
    // écaillures (rares) : on voit le plâtre clair en dessous
    const peel = N2.fbm(u * 2, v, 4, 5) * 0.5 + 0.5;
    const peelMask = smoothstep(0.73, 0.755, peel) * smoothstep(0.1, 0.3, v);
    if (peelMask > 0) {
      const under = 0.74 + N3.fbm(u * 2, v, 24, 3) * 0.06;
      r = lerp(r, under * 1.0, peelMask);
      g = lerp(g, under * 0.97, peelMask);
      b = lerp(b, under * 0.9, peelMask);
      hgt -= peelMask * 0.5;
      rough = lerp(rough, 0.95, peelMask);
    }
    const edge = smoothstep(0.72, 0.735, peel) - smoothstep(0.735, 0.755, peel);
    hgt += edge * 0.4;
    r *= 1 - edge * 0.15;
    g *= 1 - edge * 0.15;
    b *= 1 - edge * 0.15;
    // variations de teinte à grande échelle (retouches, vieillissement)
    const blotch = N3.fbm(u * 2, v, 2, 3) * 0.5 + 0.5;
    r *= 0.96 + blotch * 0.06;
    g *= 0.96 + blotch * 0.05;
    b *= 0.95 + blotch * 0.04;
    // coulures d'humidité depuis le plafond (v ~ 0.8 = 3.2 m) : fines traînées verticales
    const drip = N.fbm(u * 10, v * 0.35, 10, 4) * 0.5 + 0.5;
    const band = smoothstep(0.35, 0.78, v) * (1 - smoothstep(0.8, 0.82, v));
    const stain = smoothstep(0.62, 0.82, drip) * band;
    r *= 1 - stain * 0.1;
    g *= 1 - stain * 0.15;
    b *= 1 - stain * 0.26;
    const ring = (smoothstep(0.6, 0.62, drip) - smoothstep(0.62, 0.66, drip)) * band;
    r *= 1 - ring * 0.08;
    g *= 1 - ring * 0.1;
    b *= 1 - ring * 0.14;
    // saleté en pied de mur (v < 0.12 ≈ 0.5 m)
    const foot = (1 - smoothstep(0.0, 0.12, v)) * (0.5 + 0.5 * (N2.fbm(u * 2, v, 12, 3) * 0.5 + 0.5));
    r *= 1 - foot * 0.35;
    g *= 1 - foot * 0.37;
    b *= 1 - foot * 0.4;
    // éraflures horizontales (hauteur des brancards ~0.8 m)
    const sc = Math.abs(v - 0.2 - N3.perlin(u * 30, 0.5, 30, 1) * 0.01);
    const scuff = (1 - smoothstep(0.0, 0.004, sc)) * smoothstep(0.62, 0.7, N3.fbm(u * 2, 0.3, 8, 2) * 0.5 + 0.5);
    r *= 1 - scuff * 0.4;
    g *= 1 - scuff * 0.4;
    b *= 1 - scuff * 0.4;
    // fissures
    const ck = crackMask(cracks, u * 2 - Math.floor(u * 2), v, 0.012, 3, 0.72) * 0.9;
    r *= 1 - ck * 0.45;
    g *= 1 - ck * 0.45;
    b *= 1 - ck * 0.45;
    hgt -= ck * 0.3;
    // grain de saleté général
    const gr = grime(u * 2, v, 7, 0.14);
    r *= 1 - gr;
    g *= 1 - gr;
    b *= 1 - gr * 1.1;
    t.set(i, r, g, b);
    t.height[i] = hgt;
    t.rough[i] = rough;
    t.ao[i] = 1 - foot * 0.25 - ck * 0.3;
  });
  return t;
}

/** Faïence murale 15 cm, joints sales, carreaux fêlés ou manquants. 1.2 m. */
export function wallTiles(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const n = 8;
  const cracks = new Cells(10, N2.rand);
  t.each((u, v, _x, _y, i) => {
    const tu = u * n;
    const tv = v * n;
    const ix = Math.floor(tu);
    const iy = Math.floor(tv);
    const fx = tu - ix;
    const fy = tv - iy;
    const gw = 0.055;
    const dEdge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = 1 - smoothstep(gw * 0.5, gw, dEdge);
    const h = hash2(ix, iy);
    const missing = h < 0.035;
    const tileShade = 0.9 + (hash2(ix + 7, iy + 3) - 0.5) * 0.06;
    let r = tileShade;
    let g = tileShade;
    let b = tileShade;
    let hgt = smoothstep(gw * 0.5, gw * 2.2, dEdge) * 0.6;
    let rough = 0.18 + N.fbm(u, v, 20, 2) * 0.05;
    if (missing) {
      const c = 0.45 + N.fbm(u, v, 30, 3) * 0.08;
      r = c;
      g = c * 0.97;
      b = c * 0.9;
      hgt = -0.3 + N3.fbm(u, v, 40, 2) * 0.1;
      rough = 0.95;
    }
    // joints
    const gc = 0.42 + N.fbm(u, v, 24, 3) * 0.08;
    r = lerp(r, gc * 1.02, grout);
    g = lerp(g, gc, grout);
    b = lerp(b, gc * 0.9, grout);
    rough = lerp(rough, 0.9, grout);
    // fêlures sur certains carreaux
    if (!missing && h > 0.82) {
      const ck = crackMask(cracks, u, v, 0.008, 2, 0.35);
      r *= 1 - ck * 0.55;
      g *= 1 - ck * 0.55;
      b *= 1 - ck * 0.55;
      hgt -= ck * 0.2;
    }
    const gr = grime(u, v, 5, 0.22);
    r *= 1 - gr;
    g *= 1 - gr * 1.05;
    b *= 1 - gr * 1.2;
    t.set(i, r, g, b);
    t.height[i] = hgt;
    t.rough[i] = rough + gr * 0.4;
    t.ao[i] = 1 - grout * 0.35;
  });
  return t;
}

/** Linoléum marbré, joints de lés, traces de roues, zones usées. 3 m. */
export function lino(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const marble = N.fbm(u + N2.fbm(u, v, 3, 2) * 0.08, v, 9, 5) * 0.5 + 0.5;
    const speck = N3.fbm(u, v, 90, 2) * 0.5 + 0.5;
    let c = 0.72 + (marble - 0.5) * 0.14 + (speck > 0.72 ? -0.05 : 0);
    // lés de 1.5 m
    const seam = Math.min(Math.abs(u - 0.5), u, 1 - u) * 3;
    const seamLine = 1 - smoothstep(0.002, 0.006, seam);
    c *= 1 - seamLine * 0.4;
    // traces de roues (arcs sombres)
    const tr = Math.abs(Math.sin((u + N2.fbm(u, v, 2, 2) * 0.3) * 18.85) * 0.5 + N.perlin(u * 4, v * 4, 4, 4) * 0.2);
    const track = (1 - smoothstep(0.0, 0.02, tr)) * smoothstep(0.6, 0.75, N3.fbm(u, v, 3, 2) * 0.5 + 0.5);
    c *= 1 - track * 0.25;
    // usure (zones plus claires et plus mates)
    const wear = smoothstep(0.55, 0.8, N2.fbm(u, v, 2, 3) * 0.5 + 0.5);
    c = lerp(c, c * 1.06 + 0.02, wear * 0.6);
    const gr = grime(u, v, 4, 0.25);
    c *= 1 - gr;
    t.set(i, c, c, c);
    t.height[i] = marble * 0.05 - seamLine * 0.3 - track * 0.05;
    t.rough[i] = 0.42 + wear * 0.25 + gr * 0.3 + speck * 0.05;
    t.ao[i] = 1 - seamLine * 0.3;
  });
  return t;
}

/** Terrazzo (éclats multicolores), poli mais sale. 1.5 m. */
export function terrazzo(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const chips = new Cells(48, N.rand);
  const cracks = new Cells(5, N2.rand);
  const palette: Array<[number, number, number]> = [
    [0.93, 0.92, 0.88],
    [0.35, 0.33, 0.32],
    [0.6, 0.58, 0.55],
    [0.62, 0.36, 0.25],
    [0.4, 0.46, 0.38],
    [0.12, 0.12, 0.12],
  ];
  t.each((u, v, _x, _y, i) => {
    chips.eval(u, v, tmp);
    const id = tmp[2];
    const hsz = 0.25 + hash2(id, 5) * 0.2;
    const inChip = 1 - smoothstep(hsz - 0.04, hsz, tmp[0]);
    const pc = palette[Math.floor(hash2(id, 9) * palette.length)]!;
    const base = 0.7 + N.fbm(u, v, 6, 3) * 0.04;
    let r = lerp(base * 1.02, pc[0], inChip * 0.9);
    let g = lerp(base * 0.97, pc[1], inChip * 0.9);
    let b = lerp(base * 0.88, pc[2], inChip * 0.9);
    const ck = crackMask(cracks, u, v, 0.006, 2, 0.6);
    const gr = grime(u, v, 3, 0.3);
    const k = 1 - ck * 0.5 - gr;
    r *= k;
    g *= k;
    b *= k * 0.97;
    t.set(i, r, g, b);
    t.height[i] = inChip * 0.08 - ck * 0.3;
    t.rough[i] = 0.28 + gr * 0.5 + ck * 0.3;
    t.ao[i] = 1 - ck * 0.3;
  });
  return t;
}

/** Damier rouge / crème 30 cm (cafétéria). 1.2 m. */
export function checker(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const n = 4;
  const cracks = new Cells(8, N3.rand);
  t.each((u, v, _x, _y, i) => {
    const ix = Math.floor(u * n);
    const iy = Math.floor(v * n);
    const fx = u * n - ix;
    const fy = v * n - iy;
    const dEdge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = 1 - smoothstep(0.015, 0.03, dEdge);
    const dark = (ix + iy) % 2 === 0;
    const var_ = (hash2(ix, iy) - 0.5) * 0.06;
    let r = dark ? 0.55 + var_ : 0.86 + var_;
    let g = dark ? 0.12 + var_ * 0.3 : 0.81 + var_;
    let b = dark ? 0.1 + var_ * 0.3 : 0.7 + var_;
    const gcol = 0.3;
    r = lerp(r, gcol, grout);
    g = lerp(g, gcol, grout);
    b = lerp(b, gcol * 0.95, grout);
    const chipped = hash2(ix + 11, iy + 3) > 0.85;
    const ck = chipped ? crackMask(cracks, u, v, 0.01, 3, 0.4) : 0;
    const gr = grime(u, v, 4, 0.3);
    const k = 1 - ck * 0.5 - gr;
    t.set(i, r * k, g * k, b * k);
    t.height[i] = smoothstep(0.015, 0.06, dEdge) * 0.4 - ck * 0.3;
    t.rough[i] = 0.35 + grout * 0.5 + gr * 0.4;
    t.ao[i] = 1 - grout * 0.3;
  });
  return t;
}

/** Petits carreaux de sol 10 cm (cuisine, vestiaires, morgue). 1 m. */
export function floorTiles(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const n = 10;
  t.each((u, v, _x, _y, i) => {
    const ix = Math.floor(u * n);
    const iy = Math.floor(v * n);
    const fx = u * n - ix;
    const fy = v * n - iy;
    const dEdge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = 1 - smoothstep(0.03, 0.06, dEdge);
    const c0 = 0.8 + (hash2(ix, iy) - 0.5) * 0.08;
    const gr = grime(u, v, 5, 0.35);
    const groutC = 0.28 + N.fbm(u, v, 30, 2) * 0.05;
    const c = lerp(c0, groutC, grout) * (1 - gr);
    t.set(i, c, c * 0.99, c * 0.96);
    t.height[i] = smoothstep(0.03, 0.12, dEdge) * 0.4;
    t.rough[i] = 0.3 + grout * 0.55 + gr * 0.4;
    t.ao[i] = 1 - grout * 0.35;
  });
  return t;
}

/** Parquet à lames (bureaux, chapelle). 1.2 m. */
export function parquet(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const rows = 12;
  t.each((u, v, _x, _y, i) => {
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const offset = hash2(row, 1) * 0.7;
    const plankLen = 0.5;
    const pu = (u + offset) / plankLen;
    const plank = Math.floor(pu);
    const fx = pu - plank;
    const id = hash2(plank, row);
    const gap = Math.min(fy, 1 - fy) < 0.04 || Math.min(fx, 1 - fx) < 0.008;
    const grain = N.perlin(u * 60 + id * 13, v * 4 + fy * 0.2, 60, 4) * 0.5 + 0.5;
    const rings = Math.sin((grain * 8 + id * 20 + fy * 3) * Math.PI) * 0.5 + 0.5;
    const base = 0.55 + (id - 0.5) * 0.2;
    let r = base * (0.95 + rings * 0.1);
    let g = base * 0.72 * (0.95 + rings * 0.1);
    let b = base * 0.5 * (0.95 + rings * 0.08);
    const worn = smoothstep(0.55, 0.8, N2.fbm(u, v, 2, 3) * 0.5 + 0.5);
    r = lerp(r, r * 1.15, worn * 0.5);
    g = lerp(g, g * 1.12, worn * 0.5);
    b = lerp(b, b * 1.1, worn * 0.5);
    if (gap) {
      r *= 0.3;
      g *= 0.3;
      b *= 0.3;
    }
    const gr = grime(u, v, 4, 0.25);
    t.set(i, r * (1 - gr), g * (1 - gr), b * (1 - gr));
    t.height[i] = gap ? -0.4 : rings * 0.04;
    t.rough[i] = 0.45 + worn * 0.3 + gr * 0.3;
    t.ao[i] = gap ? 0.6 : 1;
  });
  return t;
}

/** Moquette (fibres, taches). 1.5 m. */
export function carpet(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const fib = N.fbm(u, v, 128, 2) * 0.5 + 0.5;
    const mott = N2.fbm(u, v, 6, 3) * 0.5 + 0.5;
    let c = 0.7 + (fib - 0.5) * 0.25 + (mott - 0.5) * 0.1;
    const stain = smoothstep(0.62, 0.72, N3.fbm(u, v, 4, 4) * 0.5 + 0.5);
    c *= 1 - stain * 0.45;
    t.set(i, c, c * 0.97, c * 0.95);
    t.height[i] = fib * 0.3;
    t.rough[i] = 0.95;
    t.ao[i] = 0.85 + fib * 0.15;
  });
  return t;
}

/** Béton brut (pores, fissures, coulures). 2 m. */
export function concrete(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const pores = new Cells(64, N2.rand);
  const cracks = new Cells(5, N.rand);
  t.each((u, v, _x, _y, i) => {
    const big = N.fbm(u, v, 4, 5) * 0.5 + 0.5;
    const fine = N3.fbm(u, v, 40, 3) * 0.5 + 0.5;
    let c = 0.62 + (big - 0.5) * 0.18 + (fine - 0.5) * 0.06;
    pores.eval(u, v, tmp);
    const pore = (1 - smoothstep(0.05, 0.1, tmp[0])) * (hash2(tmp[2], 3) > 0.6 ? 1 : 0);
    c *= 1 - pore * 0.35;
    const ck = crackMask(cracks, u, v, 0.008, 2, 0.62);
    c *= 1 - ck * 0.5;
    const stain = smoothstep(0.6, 0.85, N2.fbm(u, v, 3, 4) * 0.5 + 0.5);
    let r = c * (1 - stain * 0.15);
    let g = c * (1 - stain * 0.18);
    let b = c * (1 - stain * 0.26);
    t.set(i, r, g, b);
    t.height[i] = fine * 0.3 - pore * 0.4 - ck * 0.4;
    t.rough[i] = 0.85 + fine * 0.1;
    t.ao[i] = 1 - pore * 0.3 - ck * 0.3;
  });
  return t;
}

/** Dalles de faux-plafond 60 cm sur ossature, auréoles d'eau, dalles manquantes. 1.2 m. */
export function ceilingTiles(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const n = 2;
  const holes = new Cells(40, N3.rand);
  t.each((u, v, _x, _y, i) => {
    const ix = Math.floor(u * n);
    const iy = Math.floor(v * n);
    const fx = u * n - ix;
    const fy = v * n - iy;
    const dEdge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const bar = 1 - smoothstep(0.012, 0.02, dEdge);
    const h = hash2(ix + 3, iy + 17);
    const missing = h < 0.12;
    holes.eval(u, v, tmp);
    const hole = (1 - smoothstep(0.05, 0.12, tmp[0])) * (hash2(tmp[2], 1) > 0.5 ? 1 : 0);
    let c = 0.82 + N.fbm(u, v, 16, 3) * 0.04 - hole * 0.08;
    let r = c;
    let g = c;
    let b = c * 0.97;
    // auréoles d'infiltration
    if (h > 0.6) {
      const cx = 0.3 + hash2(ix, iy) * 0.4;
      const cy = 0.3 + hash2(iy, ix) * 0.4;
      const d = Math.hypot(fx - cx, fy - cy) + N2.fbm(u, v, 8, 3) * 0.08;
      const rad = 0.15 + h * 0.2;
      const inside = 1 - smoothstep(rad - 0.05, rad, d);
      const ringW = 1 - smoothstep(0, 0.02, Math.abs(d - rad));
      r *= 1 - inside * 0.12 - ringW * 0.25;
      g *= 1 - inside * 0.2 - ringW * 0.32;
      b *= 1 - inside * 0.35 - ringW * 0.45;
    }
    if (missing) {
      // dalle manquante : on voit le vide sombre du plénum
      const dark = 0.05 + N.fbm(u, v, 12, 2) * 0.03;
      r = g = b = dark;
    }
    const barC = 0.7;
    r = lerp(r, barC, bar);
    g = lerp(g, barC, bar);
    b = lerp(b, barC * 0.98, bar);
    t.set(i, r, g, b);
    t.height[i] = (missing ? -1 : 0) + bar * 0.4 - hole * 0.1;
    t.rough[i] = missing ? 1 : bar > 0.5 ? 0.5 : 0.95;
    t.metal[i] = bar * 0.6;
    t.ao[i] = missing ? 0.3 : 1;
  });
  return t;
}

/** Lambris de bois vertical (hall, salle d'attente, direction). 1.2 m. */
export function woodPanel(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const boards = 8;
  t.each((u, v, _x, _y, i) => {
    const bi = Math.floor(u * boards);
    const fx = u * boards - bi;
    const groove = 1 - smoothstep(0.0, 0.05, Math.min(fx, 1 - fx));
    const id = hash2(bi, 77);
    const grain = N.perlin(u * 8 + id * 5, v * 40, 8, 40) * 0.5 + 0.5;
    const streak = Math.sin((u * boards * 6 + grain * 3 + id * 9) * Math.PI) * 0.5 + 0.5;
    const base = 0.52 + (id - 0.5) * 0.12;
    let r = base * (0.9 + streak * 0.15);
    let g = base * 0.68 * (0.9 + streak * 0.15);
    let b = base * 0.46 * (0.9 + streak * 0.12);
    r *= 1 - groove * 0.6;
    g *= 1 - groove * 0.6;
    b *= 1 - groove * 0.6;
    const scratch = grime(u, v, 5, 0.2);
    t.set(i, r * (1 - scratch), g * (1 - scratch), b * (1 - scratch));
    t.height[i] = -groove * 0.5 + streak * 0.03;
    t.rough[i] = 0.4 + scratch * 0.4 + groove * 0.3;
    t.ao[i] = 1 - groove * 0.4;
  });
  return t;
}

/** Tôle larmée (sol métallique). 1 m. */
export function metalPlate(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const n = 12;
    const gx = u * n;
    const gy = v * n;
    const row = Math.floor(gy);
    const off = row % 2 === 0 ? 0 : 0.5;
    const fx = gx + off - Math.floor(gx + off) - 0.5;
    const fy = gy - row - 0.5;
    const ang = row % 2 === 0 ? 0.7 : -0.7;
    const lx = fx * Math.cos(ang) - fy * Math.sin(ang);
    const ly = fx * Math.sin(ang) + fy * Math.cos(ang);
    const bump = Math.max(0, 1 - (lx * lx) / 0.12 - (ly * ly) / 0.006);
    const rust = smoothstep(0.55, 0.8, N.fbm(u, v, 5, 4) * 0.5 + 0.5);
    const base = 0.55 + N2.fbm(u, v, 30, 2) * 0.05;
    const r = lerp(base, 0.42, rust);
    const g = lerp(base, 0.24, rust);
    const b = lerp(base * 1.02, 0.14, rust);
    t.set(i, r, g, b);
    t.height[i] = bump * 0.6;
    t.rough[i] = lerp(0.42 - bump * 0.1, 0.9, rust);
    t.metal[i] = lerp(0.9, 0.2, rust);
  });
  return t;
}

/** Métal brossé (ascenseur, inox). 1 m. */
export function metalBrushed(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const brush = N.perlin(u * 4, v * 200, 4, 200) * 0.5 + 0.5;
    const smudge = smoothstep(0.55, 0.85, N2.fbm(u, v, 5, 4) * 0.5 + 0.5);
    const c = 0.7 + (brush - 0.5) * 0.08 - smudge * 0.12;
    t.set(i, c, c, c * 1.01);
    t.height[i] = brush * 0.05;
    t.rough[i] = 0.28 + smudge * 0.3 + brush * 0.05;
    t.metal[i] = 0.95;
  });
  return t;
}

/** Pierre de taille (chapelle). 2 m. */
export function stone(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const rows = 8;
  t.each((u, v, _x, _y, i) => {
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const off = row % 2 === 0 ? 0 : 0.5;
    const cols = 5;
    const cu = u * cols + off;
    const col = Math.floor(cu);
    const fx = cu - col;
    const dEdge = Math.min(fx / 1, (1 - fx) / 1, fy * 0.6, (1 - fy) * 0.6);
    const mortar = 1 - smoothstep(0.015, 0.035, dEdge);
    const id = hash2(col, row);
    const surf = N.fbm(u, v, 20, 4) * 0.5 + 0.5;
    const c = 0.56 + (id - 0.5) * 0.12 + (surf - 0.5) * 0.1;
    const m = 0.38;
    const gr = grime(u, v, 4, 0.2);
    const r = lerp(c * 1.02, m, mortar) * (1 - gr);
    const g = lerp(c * 0.98, m, mortar) * (1 - gr);
    const b = lerp(c * 0.9, m * 0.95, mortar) * (1 - gr);
    t.set(i, r, g, b);
    t.height[i] = smoothstep(0.015, 0.12, dEdge) * 0.6 + surf * 0.15;
    t.rough[i] = 0.9;
    t.ao[i] = 1 - mortar * 0.4;
  });
  return t;
}

/** Sol caoutchouc à pastilles (pédiatrie). 1 m. */
export function rubber(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const n = 10;
    const fx = u * n - Math.floor(u * n) - 0.5;
    const fy = v * n - Math.floor(v * n) - 0.5;
    const d = Math.hypot(fx, fy);
    const stud = 1 - smoothstep(0.22, 0.26, d);
    const gr = grime(u, v, 4, 0.3);
    const c = (0.78 + stud * 0.04) * (1 - gr);
    t.set(i, c, c, c);
    t.height[i] = stud * 0.5;
    t.rough[i] = 0.75 + gr * 0.2;
    t.ao[i] = 1 - (1 - stud) * 0.05;
  });
  return t;
}

/** Enduit de façade : coulures de pluie, bandeaux de dalle, soubassement sale. 4 m × 8 m. */
export function facade(S: number): TexCanvas {
  const t = new TexCanvas(S, S * 2);
  t.each((u, v, _x, _y, i) => {
    const grain = N.fbm(u, v * 2, 48, 3) * 0.5 + 0.5;
    let c = 0.72 + (grain - 0.5) * 0.08;
    // bandeau au niveau de la dalle de l'étage (4 m = v 0.5) et en haut
    const band = (1 - smoothstep(0.0, 0.004, Math.abs(v - 0.515) - 0.02)) * 0.9;
    const topBand = smoothstep(0.96, 0.965, v);
    // coulures de pluie depuis les bandeaux
    const streak = N2.perlin(u * 40, v * 1.5, 40, 3) * 0.5 + 0.5;
    const fromBand = (smoothstep(0.2, 0.5, v) * (1 - smoothstep(0.5, 0.52, v)) + smoothstep(0.7, 0.96, v)) * smoothstep(0.55, 0.9, streak);
    c *= 1 - fromBand * 0.3;
    // soubassement
    const plinth = 1 - smoothstep(0.05, 0.07, v);
    const splash = (1 - smoothstep(0.0, 0.12, v)) * (N3.fbm(u, v, 16, 3) * 0.5 + 0.5);
    let r = c;
    let g = c * 0.97;
    let b = c * 0.9;
    r = lerp(r, 0.45, plinth);
    g = lerp(g, 0.43, plinth);
    b = lerp(b, 0.41, plinth);
    r *= 1 - splash * 0.3;
    g *= 1 - splash * 0.32;
    b *= 1 - splash * 0.35;
    r = lerp(r, 0.6, band + topBand * 0.6);
    g = lerp(g, 0.58, band + topBand * 0.6);
    b = lerp(b, 0.55, band + topBand * 0.6);
    const moss = smoothstep(0.7, 0.85, N.fbm(u, v, 6, 4) * 0.5 + 0.5) * (1 - smoothstep(0.0, 0.2, v));
    r = lerp(r, 0.22, moss * 0.6);
    g = lerp(g, 0.28, moss * 0.6);
    b = lerp(b, 0.16, moss * 0.6);
    t.set(i, r, g, b);
    t.height[i] = grain * 0.3 + band * 0.4;
    t.rough[i] = 0.92;
  });
  return t;
}

/** Briques (piliers, murets). 1 m. */
export function brick(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const rows = 14;
  t.each((u, v, _x, _y, i) => {
    const row = Math.floor(v * rows);
    const fy = v * rows - row;
    const off = row % 2 === 0 ? 0 : 0.5;
    const cols = 4;
    const cu = u * cols + off;
    const col = Math.floor(cu);
    const fx = cu - col;
    const dEdge = Math.min(fx * 3.5, (1 - fx) * 3.5, fy, 1 - fy);
    const mortar = 1 - smoothstep(0.08, 0.14, dEdge);
    const id = hash2(col, row);
    const surf = N.fbm(u, v, 30, 3) * 0.5 + 0.5;
    const r0 = 0.5 + (id - 0.5) * 0.15 + surf * 0.06;
    const r = lerp(r0, 0.55, mortar);
    const g = lerp(r0 * 0.5, 0.53, mortar);
    const b = lerp(r0 * 0.38, 0.5, mortar);
    t.set(i, r, g, b);
    t.height[i] = smoothstep(0.08, 0.3, dEdge) * 0.6;
    t.rough[i] = 0.9;
    t.ao[i] = 1 - mortar * 0.4;
  });
  return t;
}

/** Enrobé : granulats, fissures, rustines, taches d'huile. 4 m. */
export function asphalt(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const agg = new Cells(96, N.rand);
  const cracks = new Cells(4, N3.rand);
  t.each((u, v, _x, _y, i) => {
    agg.eval(u, v, tmp);
    const stone = (1 - smoothstep(0.2, 0.35, tmp[0])) * hash2(tmp[2], 2);
    let c = 0.2 + stone * 0.12 + N2.fbm(u, v, 12, 3) * 0.02;
    const patch = smoothstep(0.66, 0.68, N.fbm(u, v, 3, 3) * 0.5 + 0.5);
    c = lerp(c, 0.13, patch);
    const ck = crackMask(cracks, u, v, 0.006, 3, 0.55);
    c *= 1 - ck * 0.6;
    const oil = smoothstep(0.7, 0.82, N3.fbm(u, v, 5, 3) * 0.5 + 0.5);
    c *= 1 - oil * 0.35;
    t.set(i, c, c, c * 1.03);
    t.height[i] = stone * 0.3 - ck * 0.5;
    t.rough[i] = 0.9 - oil * 0.5;
    t.ao[i] = 1 - ck * 0.4;
  });
  return t;
}

/** Dalles de trottoir 1 m, joints envahis d'herbe. 2 m. */
export function paving(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const n = 2;
    const fx = u * n - Math.floor(u * n);
    const fy = v * n - Math.floor(v * n);
    const dEdge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const joint = 1 - smoothstep(0.006, 0.014, dEdge);
    const id = hash2(Math.floor(u * n), Math.floor(v * n));
    let c = 0.55 + (id - 0.5) * 0.08 + (N.fbm(u, v, 20, 3) * 0.5 + 0.5 - 0.5) * 0.1;
    const weed = joint * smoothstep(0.45, 0.6, N2.fbm(u, v, 10, 3) * 0.5 + 0.5);
    let r = lerp(c, 0.2, joint);
    let g = lerp(c, 0.2, joint);
    let b = lerp(c * 0.97, 0.18, joint);
    r = lerp(r, 0.2, weed);
    g = lerp(g, 0.32, weed);
    b = lerp(b, 0.12, weed);
    const gr = grime(u, v, 3, 0.25);
    t.set(i, r * (1 - gr), g * (1 - gr), b * (1 - gr));
    t.height[i] = smoothstep(0.006, 0.05, dEdge) * 0.4;
    t.rough[i] = 0.88;
  });
  return t;
}

/** Herbe haute et sèche (cour envahie, bas-côtés). 2 m. */
export function grass(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const blades = N.perlin(u * 120, v * 30, 120, 30) * 0.5 + 0.5;
    const blades2 = N3.perlin(u * 70 + 0.3, v * 160, 70, 160) * 0.5 + 0.5;
    const dry = smoothstep(0.4, 0.7, N2.fbm(u, v, 4, 4) * 0.5 + 0.5);
    const dirt = smoothstep(0.66, 0.78, N.fbm(u, v, 5, 3) * 0.5 + 0.5);
    const lum = 0.55 + (blades * blades2 - 0.25) * 0.8;
    let r = lerp(0.18, 0.42, dry) * lum;
    let g = lerp(0.3, 0.38, dry) * lum;
    let b = lerp(0.1, 0.16, dry) * lum;
    r = lerp(r, 0.26, dirt);
    g = lerp(g, 0.21, dirt);
    b = lerp(b, 0.15, dirt);
    t.set(i, r, g, b);
    t.height[i] = blades * blades2;
    t.rough[i] = 0.95;
    t.ao[i] = 0.7 + blades * 0.3;
  });
  return t;
}

/** Gravillons de toiture. 1.5 m. */
export function gravel(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  const cells = new Cells(40, N2.rand);
  t.each((u, v, _x, _y, i) => {
    cells.eval(u, v, tmp);
    const d = tmp[1] - tmp[0];
    const pebble = smoothstep(0.0, 0.25, d);
    const id = hash2(tmp[2], 4);
    const c = (0.35 + id * 0.25) * (0.5 + pebble * 0.5);
    t.set(i, c, c * 0.98, c * 0.95);
    t.height[i] = pebble;
    t.rough[i] = 0.92;
    t.ao[i] = 0.6 + pebble * 0.4;
  });
  return t;
}

/** Grille à barreaux (alpha). Un panneau = 2.5 m × 2.6 m. */
export function fenceBars(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const bars = 20;
    const fx = u * bars - Math.floor(u * bars);
    const bar = Math.abs(fx - 0.5) < 0.09;
    const rail = Math.abs(v - 0.1) < 0.012 || Math.abs(v - 0.92) < 0.012;
    const spike = v > 0.92 && Math.abs(fx - 0.5) < 0.09 * (1 - (v - 0.92) / 0.08);
    const solid = (bar && v < 0.95) || rail || spike;
    const rust = smoothstep(0.45, 0.75, N.fbm(u, v, 8, 3) * 0.5 + 0.5);
    const c = 0.15;
    t.set(i, lerp(c, 0.35, rust), lerp(c * 1.05, 0.18, rust), lerp(c * 1.05, 0.1, rust));
    t.a[i] = solid ? 1 : 0;
    t.height[i] = solid ? 1 : 0;
    t.rough[i] = lerp(0.5, 0.9, rust);
    t.metal[i] = lerp(0.8, 0.2, rust);
  });
  return t;
}

/** Marquage d'hélistation (cercle jaune + H blanc), non répété. */
export function helipad(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const d = Math.hypot(x, y);
    let r = 0.22;
    let g = 0.22;
    let b = 0.23;
    const ring = Math.abs(d - 0.42) < 0.025;
    const H = (Math.abs(x) > 0.1 && Math.abs(x) < 0.16 && Math.abs(y) < 0.22) || (Math.abs(x) < 0.16 && Math.abs(y) < 0.03);
    const wear = N.fbm(u, v, 12, 4) * 0.5 + 0.5;
    const paintOk = wear < 0.62;
    if (ring && paintOk) {
      r = 0.85;
      g = 0.66;
      b = 0.12;
    }
    if (H && paintOk) {
      r = g = b = 0.85;
    }
    const gr = grime(u, v, 4, 0.3);
    t.set(i, r * (1 - gr), g * (1 - gr), b * (1 - gr));
    t.height[i] = (ring || H) && paintOk ? 0.2 : 0;
    t.rough[i] = 0.8;
  });
  return t;
}

/** Verre sale (alpha variable : traces, poussière, coulures). 1.5 m. */
export function dirtyGlass(S: number): TexCanvas {
  const t = new TexCanvas(S, S);
  t.each((u, v, _x, _y, i) => {
    const dust = N.fbm(u, v, 5, 5) * 0.5 + 0.5;
    const streak = N2.perlin(u * 30, v * 3, 30, 3) * 0.5 + 0.5;
    const smudge = smoothstep(0.55, 0.8, N3.fbm(u, v, 4, 4) * 0.5 + 0.5);
    const a = 0.1 + dust * 0.22 + smudge * 0.35 + smoothstep(0.7, 0.9, streak) * 0.15 + (1 - smoothstep(0.0, 0.12, v)) * 0.3;
    t.set(i, 0.42 + dust * 0.1, 0.46 + dust * 0.1, 0.44 + dust * 0.08);
    t.a[i] = Math.min(0.9, a);
    t.height[i] = 0;
    t.rough[i] = 0.05 + smudge * 0.5 + dust * 0.2;
    t.metal[i] = 0;
  });
  return t;
}
