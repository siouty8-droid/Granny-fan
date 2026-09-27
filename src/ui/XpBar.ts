import { h } from "./dom";

/** Barre d'XP (niveau, remplissage, XP dans le niveau). */
export function xpBar(level: number, into: number, need: number, max: boolean, cls = ""): HTMLDivElement {
  const fill = h("div", { class: "xp-fill", style: `width:${max ? 100 : Math.min(100, (into / need) * 100)}%` });
  return h(
    "div",
    { class: `xp-bar ${cls}` },
    h("span", { class: "xp-level" }, `NIV. ${level}`),
    h("div", { class: "xp-track" }, fill),
    h("span", { class: "xp-num" }, max ? "MAX" : `${into} / ${need} XP`),
  );
}
