import { CELL_AIR, CELL_SOLID, indexLayout } from "./LayoutGrid";
import type { FloorId, HospitalLayout, LockType, RoomKind } from "./types";

const KIND_COLORS: Record<RoomKind, string> = {
  room: "#3c4652",
  corridor: "#5d6a58",
  stair: "#7a5a2e",
  elevator: "#6a3a6a",
  outdoor: "#2f5a2a",
};

const LOCK_COLORS: Record<LockType, string> = {
  none: "#d8d0c0",
  badgeBlue: "#3a7bff",
  badgeGreen: "#3fd46a",
  badgeRed: "#ff3a3a",
  morgueKey: "#c0a060",
  planks: "#a0602a",
  chain: "#b0b0b0",
  power: "#ffd000",
  oneWay: "#ff8cf0",
  sealed: "#555",
  service: "#e05a1a",
};

/**
 * Vue debug du plan (URL `?map`) : un canvas par niveau, pièces, ouvertures colorées par
 * type de serrure, escaliers, barrières, spawn + liste des erreurs de validation.
 */
export function renderDebugMap(layout: HospitalLayout, root: HTMLElement): void {
  const idx = indexLayout(layout);
  const S = 11;
  root.innerHTML = "";
  root.style.cssText = "position:fixed;inset:0;overflow:auto;background:#111;color:#ddd;font:12px monospace;pointer-events:auto;padding:12px";
  const errs = document.createElement("pre");
  errs.style.color = idx.errors.length ? "#ff6060" : "#60ff90";
  errs.textContent = idx.errors.length ? idx.errors.join("\n") : "Layout valide ✓";
  root.appendChild(errs);

  for (const floor of layout.floors) {
    const grid = idx.grids.get(floor.id)!;
    const title = document.createElement("h3");
    title.textContent = `${floor.id} — ${floor.label} (y = ${floor.y})`;
    root.appendChild(title);
    const cv = document.createElement("canvas");
    cv.width = grid.w * S;
    cv.height = grid.d * S;
    root.appendChild(cv);
    const ctx = cv.getContext("2d")!;
    // z vers le haut de l'image
    const X = (x: number) => (x - grid.minX) * S;
    const Z = (z: number) => (grid.maxZ - z) * S;
    for (let z = grid.minZ; z < grid.maxZ; z++) {
      for (let x = grid.minX; x < grid.maxX; x++) {
        const c = grid.at(x, z);
        ctx.fillStyle = c === CELL_AIR ? "#16181c" : c === CELL_SOLID ? "#07070a" : KIND_COLORS[grid.rooms[c]!.kind];
        ctx.fillRect(X(x), Z(z + 1), S, S);
      }
    }
    // murs
    ctx.strokeStyle = "#e8e0d0";
    ctx.lineWidth = 2;
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
    // ouvertures
    for (const o of layout.openings.filter((o) => o.floor === floor.id)) {
      const lock = o.door?.lock ?? "none";
      ctx.strokeStyle =
        o.kind === "window" ? (o.broken ? "#ff9020" : "#70b0ff") : o.kind === "vent" ? "#ffff40" : o.kind === "open" ? "#5d6a58" : o.kind === "arch" ? "#909090" : LOCK_COLORS[lock];
      ctx.lineWidth = o.kind === "window" ? 3 : 5;
      ctx.beginPath();
      if (o.axis === "x") {
        ctx.moveTo(X(o.x - o.width / 2), Z(o.z));
        ctx.lineTo(X(o.x + o.width / 2), Z(o.z));
      } else {
        ctx.moveTo(X(o.x), Z(o.z - o.width / 2));
        ctx.lineTo(X(o.x), Z(o.z + o.width / 2));
      }
      ctx.stroke();
    }
    // barrières
    ctx.fillStyle = "rgba(255,120,0,0.8)";
    for (const b of layout.barriers.filter((b) => b.floor === floor.id)) {
      ctx.fillRect(X(b.area[0]), Z(b.area[3]), (b.area[2] - b.area[0]) * S, (b.area[3] - b.area[1]) * S);
    }
    // noms
    ctx.fillStyle = "#fff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (const r of grid.rooms) {
      const cx = (r.rect[0] + r.rect[2]) / 2;
      const cz = (r.rect[1] + r.rect[3]) / 2;
      const words = r.name.split(" ");
      words.forEach((w, i) => ctx.fillText(w, X(cx), Z(cz) + (i - (words.length - 1) / 2) * 11));
    }
    if (floor.id === ("G" satisfies FloorId)) {
      ctx.fillStyle = "#ff0";
      ctx.beginPath();
      ctx.arc(X(layout.spawn.x), Z(layout.spawn.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
