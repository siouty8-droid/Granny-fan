import { formatTenths } from "../run/RunTimer";
import type { LogEvent, PathSample, RunLog } from "../run/RunLog";
import { CELL_AIR, CELL_SOLID, type LayoutIndex } from "../world/layout/LayoutGrid";
import type { FloorId, HospitalLayout, RoomKind } from "../world/layout/types";
import { EXTERIOR } from "../world/builder/ExteriorBuilder";
import { h } from "./dom";

/** Pixels par mètre du plan de base. */
const S = 8;
/** Taille de la vue (px internes). */
const VIEW_W = 880;
const VIEW_H = 560;
/** Marge autour de la zone parcourue (m) et taille minimale du cadrage (m). */
const CROP_MARGIN = 10;
const CROP_MIN = 36;

const FILL: Record<RoomKind, string> = {
  room: "#1d2126",
  corridor: "#252a24",
  stair: "#2c261d",
  elevator: "#2a2030",
  outdoor: "#141a14",
};

interface Base {
  canvas: HTMLCanvasElement;
  minX: number;
  maxZ: number;
}

/**
 * Carte de fin de run : plan de chaque niveau (pièces, murs), trajets du joueur et du monstre,
 * détections, objectifs, capture ou sortie. Un curseur rejoue les positions dans le temps.
 */
export class RunMap {
  private bases = new Map<FloorId, Base>();

  constructor(
    private readonly layout: HospitalLayout,
    private readonly index: LayoutIndex,
  ) {}

  /** Plan d'un niveau (calculé une fois). */
  private base(floor: FloorId): Base {
    const cached = this.bases.get(floor);
    if (cached) return cached;
    const grid = this.index.grids.get(floor)!;
    // le rez-de-chaussée couvre aussi l'extérieur (parking, rue, cour des ambulances)
    const ground = floor === "G";
    const f = EXTERIOR.fence;
    const minX = ground ? Math.min(grid.minX, f.minX - 2) : grid.minX;
    const maxX = ground ? Math.max(grid.maxX, f.maxX + 2) : grid.maxX;
    const minZ = ground ? Math.min(grid.minZ, EXTERIOR.street.minZ) : grid.minZ;
    const maxZ = ground ? Math.max(grid.maxZ, f.maxZ + 2) : grid.maxZ;
    const cv = document.createElement("canvas");
    cv.width = (maxX - minX) * S;
    cv.height = (maxZ - minZ) * S;
    const ctx = cv.getContext("2d")!;
    const X = (x: number) => (x - minX) * S;
    const Z = (z: number) => (maxZ - z) * S;
    if (ground) {
      // terrain, rue, clôture et grilles
      ctx.fillStyle = "#101310";
      ctx.fillRect(X(f.minX), Z(f.maxZ), (f.maxX - f.minX) * S, (f.maxZ - f.minZ) * S);
      ctx.fillStyle = "#15161a";
      ctx.fillRect(X(minX), Z(EXTERIOR.street.maxZ), (maxX - minX) * S, (EXTERIOR.street.maxZ - EXTERIOR.street.minZ) * S);
      ctx.strokeStyle = "rgba(160,160,150,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(X(f.minX), Z(f.maxZ), (f.maxX - f.minX) * S, (f.maxZ - f.minZ) * S);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(200,190,170,0.3)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Rue", X(40.5), Z((EXTERIOR.street.minZ + EXTERIOR.street.maxZ) / 2) + 3);
      ctx.fillText("Parking", X(40.5), Z(-18));
      ctx.fillText("Ambulances", X((EXTERIOR.bay.minX + EXTERIOR.bay.maxX) / 2), Z(40));
      ctx.strokeStyle = "#ffd24a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(EXTERIOR.mainGate.x0), Z(EXTERIOR.mainGate.z));
      ctx.lineTo(X(EXTERIOR.mainGate.x1), Z(EXTERIOR.mainGate.z));
      ctx.moveTo(X(EXTERIOR.bayGate.x), Z(EXTERIOR.bayGate.z0));
      ctx.lineTo(X(EXTERIOR.bayGate.x), Z(EXTERIOR.bayGate.z1));
      ctx.stroke();
    }
    for (let z = grid.minZ; z < grid.maxZ; z++) {
      for (let x = grid.minX; x < grid.maxX; x++) {
        const c = grid.at(x, z);
        if (c === CELL_AIR) continue;
        ctx.fillStyle = c === CELL_SOLID ? "#08090b" : FILL[grid.rooms[c]!.kind];
        ctx.fillRect(X(x), Z(z + 1), S, S);
      }
    }
    // murs (changement d'espace entre deux cellules), portes et arches effacées
    ctx.strokeStyle = "rgba(220,210,190,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let z = grid.minZ; z <= grid.maxZ; z++) {
      for (let x = grid.minX; x < grid.maxX; x++) {
        const a = grid.at(x, z - 1);
        const b = grid.at(x, z);
        if (a !== b && (a >= 0 || b >= 0)) {
          ctx.moveTo(X(x), Z(z));
          ctx.lineTo(X(x + 1), Z(z));
        }
      }
    }
    for (let x = grid.minX; x <= grid.maxX; x++) {
      for (let z = grid.minZ; z < grid.maxZ; z++) {
        const a = grid.at(x - 1, z);
        const b = grid.at(x, z);
        if (a !== b && (a >= 0 || b >= 0)) {
          ctx.moveTo(X(x), Z(z));
          ctx.lineTo(X(x), Z(z + 1));
        }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "#1a1d20";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const o of this.layout.openings) {
      if (o.floor !== floor || o.kind === "window" || o.kind === "vent") continue;
      const w = o.width / 2 - 0.15;
      if (o.axis === "x") {
        ctx.moveTo(X(o.x - w), Z(o.z));
        ctx.lineTo(X(o.x + w), Z(o.z));
      } else {
        ctx.moveTo(X(o.x), Z(o.z - w));
        ctx.lineTo(X(o.x), Z(o.z + w));
      }
    }
    ctx.stroke();
    // noms des grandes pièces
    ctx.fillStyle = "rgba(200,190,170,0.32)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    for (const r of grid.rooms) {
      if (r.kind === "outdoor" || r.kind === "elevator") continue;
      const w = r.rect[2] - r.rect[0];
      const d = r.rect[3] - r.rect[1];
      if (w * d < 40 || w < 5) continue;
      ctx.fillText(r.name, X((r.rect[0] + r.rect[2]) / 2), Z((r.rect[1] + r.rect[3]) / 2) + 3, w * S - 4);
    }
    const b: Base = { canvas: cv, minX, maxZ };
    this.bases.set(floor, b);
    return b;
  }

  /** Construit le widget (onglets de niveaux, carte, curseur temporel, légende). */
  build(log: RunLog, endT: number): HTMLElement {
    const floors = this.layout.floors.map((f) => f.id).filter((id) => log.player.some((p) => p.floor === id) || log.events.some((e) => e.floor === id));
    const last = log.events[log.events.length - 1] ?? log.player[log.player.length - 1];
    let floor: FloorId = last?.floor ?? "G";
    let t = endT;
    let whole = false;
    const canvas = h("canvas", { class: "runmap-canvas" });
    const tabs = h("div", { class: "runmap-tabs" });
    const label = h("span", { class: "runmap-time" }, formatTenths(t * 1000));
    const slider = h("input", { type: "range", min: "0", max: String(Math.max(1, endT)), step: "0.1", value: String(endT), class: "runmap-slider" });
    const draw = () => {
      this.draw(canvas, floor, log, t, endT, whole);
      label.textContent = formatTenths(t * 1000);
      for (const b of tabs.children) b.classList.toggle("active", (b as HTMLElement).dataset.floor === floor);
    };
    for (const id of floors) {
      const def = this.layout.floors.find((f) => f.id === id)!;
      const b = h("button", { class: "runmap-tab", "data-floor": id }, def.label);
      b.addEventListener("click", () => {
        floor = id;
        draw();
      });
      tabs.append(b);
    }
    const wholeBtn = h("button", { class: "runmap-tab runmap-whole" }, "Plan entier");
    wholeBtn.addEventListener("click", () => {
      whole = !whole;
      wholeBtn.classList.toggle("active", whole);
      draw();
    });
    tabs.append(wholeBtn);
    slider.addEventListener("input", () => {
      t = Number(slider.value);
      draw();
    });
    const legend = h(
      "div",
      { class: "runmap-legend" },
      h("span", { class: "lg player" }, "Toi"),
      h("span", { class: "lg monster" }, "Le Chirurgien"),
      h("span", { class: "lg detect" }, "Repéré"),
      h("span", { class: "lg split" }, "Objectif"),
    );
    draw();
    return h("div", { class: "runmap" }, tabs, h("div", { class: "runmap-view" }, canvas), h("div", { class: "runmap-scrub" }, slider, label), legend);
  }

  private draw(canvas: HTMLCanvasElement, floor: FloorId, log: RunLog, t: number, endT: number, whole: boolean): void {
    const base = this.base(floor);
    const bw = base.canvas.width;
    const bh = base.canvas.height;
    // cadrage : zone parcourue sur ce niveau (ou plan entier), au ratio de la vue
    let x0 = 0;
    let y0 = 0;
    let x1 = bw;
    let y1 = bh;
    if (!whole) {
      let ax = Infinity;
      let ay = Infinity;
      let bx = -Infinity;
      let by = -Infinity;
      const grow = (x: number, z: number) => {
        const px = (x - base.minX) * S;
        const py = (base.maxZ - z) * S;
        ax = Math.min(ax, px);
        ay = Math.min(ay, py);
        bx = Math.max(bx, px);
        by = Math.max(by, py);
      };
      for (const p of log.player) if (p.floor === floor) grow(p.x, p.z);
      for (const e of log.events) if (e.floor === floor) grow(e.x, e.z);
      if (ax < Infinity) {
        const m = CROP_MARGIN * S;
        const cx = (ax + bx) / 2;
        const cy = (ay + by) / 2;
        let w = Math.max(bx - ax + m * 2, CROP_MIN * S);
        let hh = Math.max(by - ay + m * 2, (CROP_MIN * S * VIEW_H) / VIEW_W);
        if (w / hh > VIEW_W / VIEW_H) hh = (w * VIEW_H) / VIEW_W;
        else w = (hh * VIEW_W) / VIEW_H;
        x0 = cx - w / 2;
        y0 = cy - hh / 2;
        x1 = x0 + w;
        y1 = y0 + hh;
      }
    }
    const k = Math.min(VIEW_W / (x1 - x0), VIEW_H / (y1 - y0));
    canvas.width = Math.round((x1 - x0) * k);
    canvas.height = Math.round((y1 - y0) * k);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#07080a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(base.canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
    const X = (x: number) => ((x - base.minX) * S - x0) * k;
    const Z = (z: number) => ((base.maxZ - z) * S - y0) * k;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const path = (samples: PathSample[], color: string, width: number, dash: number[]) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let open = false;
      let prev: PathSample | null = null;
      for (const s of samples) {
        if (s.t > t) break;
        const jump = prev && Math.hypot(s.x - prev.x, s.z - prev.z) > 6;
        if (s.floor !== floor || jump) {
          open = false;
          prev = s;
          if (s.floor !== floor) continue;
        }
        if (!open) ctx.moveTo(X(s.x), Z(s.z));
        else ctx.lineTo(X(s.x), Z(s.z));
        open = true;
        prev = s;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    path(log.monster, "rgba(210,50,60,0.55)", 2, [4, 4]);
    path(log.player, "rgba(236,226,200,0.9)", 2.2, []);

    // positions au temps t
    const at = (samples: PathSample[]): PathSample | null => {
      let best: PathSample | null = null;
      for (const s of samples) {
        if (s.t > t) break;
        best = s;
      }
      return best;
    };
    const dot = (s: PathSample | null, color: string, r: number) => {
      if (!s || s.floor !== floor) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(s.x), Z(s.z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (t < endT - 0.05) {
      dot(at(log.monster), "#ff3040", 4.5);
      dot(at(log.player), "#fff4d8", 4.5);
    }

    // évènements
    let n = 0;
    for (const e of log.events) {
      if (e.kind === "split") n++;
      if (e.t > t || e.floor !== floor) continue;
      this.marker(ctx, e, X(e.x), Z(e.z), n);
    }
  }

  private marker(ctx: CanvasRenderingContext2D, e: LogEvent, x: number, y: number, n: number): void {
    ctx.save();
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const disc = (fill: string, text: string, r = 6.5) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#101010";
      ctx.fillText(text, x, y + 0.5);
    };
    if (e.kind === "split") disc("#6fd49a", String(n));
    else if (e.kind === "exit") disc("#ffd24a", "★", 8);
    else if (e.kind === "lockdown") disc("#ff6a3a", "8", 6);
    else if (e.kind === "detect" && e.detect) {
      if (e.detect.kind === "capture") {
        ctx.strokeStyle = "#ff2030";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 6);
        ctx.lineTo(x + 6, y + 6);
        ctx.moveTo(x + 6, y - 6);
        ctx.lineTo(x - 6, y + 6);
        ctx.stroke();
      } else disc(e.detect.kind === "sight" || e.detect.kind === "sawHide" ? "#ff9a3a" : "#e8c060", "!", 5.5);
    }
    ctx.restore();
  }
}
