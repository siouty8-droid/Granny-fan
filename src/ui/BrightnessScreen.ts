import { CONFIG } from "../config";
import { h, Screen } from "./dom";

/** Courbe ACES ajustée (même approximation que le shader de Babylon, cas des gris). */
function aces(x: number): number {
  const a = x * (x + 0.0245786) - 0.000090537;
  const b = x * (0.983729 * x + 0.432951) + 0.238081;
  return Math.max(0, Math.min(1, a / b));
}

/** Couleur sRGB (0–255) d'une luminance linéaire après exposition, ACES, gamma et contraste. */
export function displayedLevel(linear: number, brightness: number): number {
  const g = CONFIG.graphics;
  let v = Math.pow(aces(linear * g.exposure * brightness), 1 / 2.2);
  const hc = v * v * (3 - 2 * v);
  v += (hc - v) * (g.contrast - 1);
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

/**
 * Calibrage de la luminosité (premier lancement, puis depuis les options) : trois croix de
 * luminances fixes passées par la même chaîne que le rendu ; le jeu reste visible derrière.
 */
export class BrightnessScreen extends Screen {
  private symbols: HTMLDivElement[] = [];
  private value = 1;
  private valueEl: HTMLSpanElement;
  private range: HTMLInputElement;
  onPreview: (k: number) => void = () => undefined;
  onDone: (k: number) => void = () => undefined;

  constructor() {
    super("brightness-screen");
    const b = CONFIG.graphics.brightness;
    const row = h("div", { class: "bright-symbols" });
    for (let i = 0; i < 3; i++) {
      const s = h("div", { class: "bright-cross" });
      this.symbols.push(s);
      row.append(h("div", { class: "bright-cell" }, s, h("div", { class: "bright-cap" }, ["À peine visible", "Visible", "Net"][i]!)));
    }
    this.valueEl = h("span", { class: "opt-value" });
    this.range = h("input", { type: "range", min: String(b.min), max: String(b.max), step: String(b.step) }) as HTMLInputElement;
    this.range.addEventListener("input", () => this.set(Number(this.range.value)));
    const box = h(
      "div",
      { class: "bright-box" },
      h("h2", { class: "panel-title" }, "Luminosité"),
      h("p", { class: "bright-help" }, "Règle jusqu'à ce que la croix de gauche soit à peine visible. Dans le noir, tu dois deviner les formes — pas les voir comme en plein jour."),
      row,
      h("div", { class: "bright-slider" }, h("span", null, "−"), this.range, h("span", null, "+"), this.valueEl),
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn", onclick: () => this.set(1) }, "Par défaut"),
        h("button", { class: "btn primary", onclick: () => this.onDone(this.value) }, "Valider"),
      ),
    );
    this.root.append(box);
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.onDone(this.value);
    });
  }

  open(value: number): void {
    this.set(value);
  }

  private set(v: number): void {
    const b = CONFIG.graphics.brightness;
    this.value = Math.min(b.max, Math.max(b.min, Math.round(v / b.step) * b.step));
    this.range.value = String(this.value);
    this.valueEl.textContent = `${Math.round(this.value * 100)} %`;
    b.symbols.forEach((lin, i) => {
      const c = displayedLevel(lin, this.value);
      this.symbols[i]!.style.setProperty("--c", `rgb(${c},${c},${c})`);
    });
    this.onPreview(this.value);
  }
}
