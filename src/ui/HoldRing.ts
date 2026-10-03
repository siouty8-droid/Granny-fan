import { h } from "./dom";

const R = 26;
const CIRC = 2 * Math.PI * R;

/** Jauge circulaire de maintien de touche (restart, skip de cinématique). */
export class HoldRing {
  readonly root: HTMLDivElement;
  private fill: SVGCircleElement;
  private labelEl: HTMLDivElement;
  private shown = false;

  constructor(label: string, caption: string, position: { left?: string; top?: string; right?: string; bottom?: string }) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    const track = document.createElementNS(ns, "circle");
    track.setAttribute("class", "track");
    track.setAttribute("cx", "32");
    track.setAttribute("cy", "32");
    track.setAttribute("r", String(R));
    const fill = document.createElementNS(ns, "circle");
    fill.setAttribute("class", "fill");
    fill.setAttribute("cx", "32");
    fill.setAttribute("cy", "32");
    fill.setAttribute("r", String(R));
    fill.setAttribute("stroke-dasharray", String(CIRC));
    fill.setAttribute("stroke-dashoffset", String(CIRC));
    svg.append(track, fill);
    this.fill = fill;
    this.labelEl = h("div", { class: "label" }, label);
    this.root = h("div", { class: "hold-ring" }, h("div", { style: "position:relative;width:100%;height:100%" }, svg, this.labelEl), h("div", { class: "hold-ring-caption" }, caption));
    Object.assign(this.root.style, position);
  }

  setLabel(label: string): void {
    this.labelEl.textContent = label;
  }

  /** p dans [0, 1] ; 0 masque la jauge. */
  set(p: number): void {
    const show = p > 0.001;
    if (show !== this.shown) {
      this.root.classList.toggle("show", show);
      this.shown = show;
    }
    this.fill.setAttribute("stroke-dashoffset", String(CIRC * (1 - Math.min(1, p))));
  }
}
