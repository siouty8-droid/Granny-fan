import { ITEMS, type ItemId } from "../gameplay/data/items";

/** Pictogrammes des objets (dessinés au canvas, mis en cache en data URL). */
const cache = new Map<ItemId, HTMLCanvasElement>();

export function itemIcon(id: ItemId): HTMLCanvasElement {
  const cached = cache.get(id);
  if (cached) {
    const c = document.createElement("canvas");
    c.width = cached.width;
    c.height = cached.height;
    c.getContext("2d")!.drawImage(cached, 0, 0);
    return c;
  }
  const S = 104;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const g = cv.getContext("2d")!;
  g.lineCap = "round";
  g.lineJoin = "round";
  const col = ITEMS[id].color;
  const pale = "#e9e2d6";
  const metal = "#b9bec4";
  g.translate(S / 2, S / 2);
  const glow = (c: string) => {
    g.shadowColor = c;
    g.shadowBlur = 10;
  };
  switch (id) {
    case "badgeBlue":
    case "badgeGreen":
    case "badgeRed": {
      glow(col);
      g.fillStyle = pale;
      roundRect(g, -20, -30, 40, 58, 5);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = col;
      g.fillRect(-20, -12, 40, 11);
      g.fillStyle = "#333";
      g.fillRect(-12, 6, 24, 4);
      g.fillRect(-12, 14, 16, 3);
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, -30);
      g.lineTo(0, -40);
      g.stroke();
      break;
    }
    case "morgueKey":
    case "safeKey": {
      glow(col);
      g.strokeStyle = col;
      g.lineWidth = id === "morgueKey" ? 6 : 5;
      g.beginPath();
      g.arc(-16, 0, id === "morgueKey" ? 13 : 10, 0, Math.PI * 2);
      g.moveTo(-3, 0);
      g.lineTo(34, 0);
      g.moveTo(26, 0);
      g.lineTo(26, 10);
      g.moveTo(18, 0);
      g.lineTo(18, 8);
      g.stroke();
      if (id === "morgueKey") {
        g.shadowBlur = 0;
        g.fillStyle = "#d8c8a0";
        g.fillRect(-40, 12, 22, 14);
      }
      break;
    }
    case "crowbar": {
      glow(col);
      g.strokeStyle = col;
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(-36, 30);
      g.lineTo(26, -28);
      g.quadraticCurveTo(38, -40, 30, -46);
      g.stroke();
      g.strokeStyle = metal;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-36, 30);
      g.lineTo(-44, 26);
      g.stroke();
      break;
    }
    case "boltCutter": {
      glow(col);
      g.strokeStyle = "#666";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-26, -26);
      g.lineTo(20, 22);
      g.moveTo(-16, -30);
      g.lineTo(28, 12);
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(8, 10);
      g.lineTo(24, 26);
      g.moveTo(16, 2);
      g.lineTo(32, 16);
      g.stroke();
      g.strokeStyle = metal;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-26, -26);
      g.lineTo(-36, -38);
      g.moveTo(-16, -30);
      g.lineTo(-30, -42);
      g.stroke();
      break;
    }
    case "fuse": {
      glow(col);
      g.fillStyle = "#e8dcb8";
      g.fillRect(-11, -24, 22, 48);
      g.shadowBlur = 0;
      g.fillStyle = "#d9a64a";
      g.fillRect(-13, -34, 26, 10);
      g.fillRect(-13, 24, 26, 10);
      g.fillStyle = col;
      g.fillRect(-11, -6, 22, 10);
      break;
    }
    case "battery": {
      glow(col);
      g.fillStyle = "#222";
      g.fillRect(-32, -18, 64, 42);
      g.shadowBlur = 0;
      g.fillStyle = "#c22";
      g.fillRect(-24, -28, 12, 10);
      g.fillStyle = "#555";
      g.fillRect(12, -28, 12, 10);
      g.fillStyle = col;
      g.fillRect(-24, 0, 48, 10);
      break;
    }
    case "ambulanceKeys": {
      glow(col);
      g.fillStyle = col;
      roundRect(g, -30, -16, 26, 36, 6);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#fff";
      g.fillRect(-20, -8, 6, 20);
      g.fillRect(-27, -1, 20, 6);
      g.strokeStyle = metal;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(4, -18, 8, 0, Math.PI * 2);
      g.moveTo(10, -12);
      g.lineTo(34, 12);
      g.moveTo(26, 4);
      g.lineTo(32, -2);
      g.stroke();
      break;
    }
  }
  cache.set(id, cv);
  return itemIcon(id);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
