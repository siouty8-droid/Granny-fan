import type { AutopilotStatus } from "../autopilot/Autopilot";
import { EXIT_NAMES, type RouteTask } from "../autopilot/RoutePlanner";
import { ITEMS } from "../gameplay/data/items";
import { formatTenths } from "../run/RunTimer";
import { h } from "./dom";

/** Intitulé court d'une étape de route (HUD, écran de fin). */
export function stepTitle(t: RouteTask): string {
  switch (t.kind) {
    case "pick":
      return `${t.repick ? "Reprendre" : "Ramasser"} : ${ITEMS[t.gives[0]!].name}`;
    case "read":
      return `Lire : ${t.label.replace(/^Note : /, "note ")}`;
    case "safe":
      return `Ouvrir : ${t.label}`;
    case "unlock":
      return t.label.startsWith("Sortie") ? "Sortir par la porte anti-panique" : `Déverrouiller : ${t.label.replace(/^Porte — /, "")}`;
    case "power":
      return "Rétablir le courant";
    case "gateBox":
      return "Badge + code du portail";
    case "gateExit":
      return "Franchir le portail";
    case "bayChain":
      return "Couper la chaîne de la grille";
    case "hood":
      return "Installer la batterie";
    case "start":
      return "Démarrer l'ambulance";
    case "ladder":
      return "Descendre par l'échelle";
  }
}

/**
 * Bandeau du pilote auto : sortie visée et temps théorique, étape en cours (avec ce que le
 * pilote fait à l'instant), la précédente et les suivantes avec leur temps prévu.
 */
export class AutopilotView {
  readonly root = h("div", { class: "autopilot" });
  private key = "";
  /** instant de l'échec (le message s'efface après quelques secondes) */
  private failedAt = 0;

  /** Calcul de la route en cours (avant le départ). */
  planning(on: boolean): void {
    this.key = "";
    if (!on) {
      this.root.classList.remove("show");
      return;
    }
    this.root.replaceChildren(h("div", { class: "ap-head" }, h("span", { class: "ap-tag" }, "PILOTE AUTO"), "Calcul de la meilleure route…"));
    this.root.classList.add("show");
  }

  update(st: AutopilotStatus, takeKey: string): void {
    if (st.phase === "failed") {
      const now = performance.now();
      if (!this.failedAt) this.failedAt = now;
      else if (now - this.failedAt > 8000) {
        this.root.classList.remove("show");
        return;
      }
    } else this.failedAt = 0;
    const key = `${st.phase}|${st.step}|${st.doing}|${st.error}`;
    if (key === this.key) return;
    this.key = key;
    const r = st.route;
    if (st.phase === "off" || !r) {
      this.root.classList.remove("show");
      return;
    }
    this.root.classList.add("show");
    const head = h(
      "div",
      { class: "ap-head" },
      h("span", { class: "ap-tag" }, "PILOTE AUTO"),
      `${EXIT_NAMES[r.exit]} · théorique ${formatTenths(r.theoretical * 1000)}`,
    );
    if (st.phase === "failed") {
      this.root.replaceChildren(head, h("div", { class: "ap-error" }, `Bloqué : ${st.error}`), h("div", { class: "ap-foot" }, "À toi de jouer."));
      return;
    }
    const list = h("div", { class: "ap-steps" });
    const n = r.steps.length;
    const from = Math.max(0, st.step - 1);
    const to = Math.min(n, st.step + 4);
    for (let i = from; i < to; i++) {
      const s = r.steps[i]!;
      const cls = i < st.step ? "done" : i === st.step ? "cur" : "";
      const row = h(
        "div",
        { class: `ap-step ${cls}` },
        h("span", { class: "ap-n" }, `${i + 1}/${n}`),
        h("span", { class: "ap-t" }, formatTenths(s.at * 1000)),
        h("span", { class: "ap-l" }, stepTitle(s.task), h("small", null, ` — ${s.task.place}`)),
      );
      list.append(row);
      if (i === st.step && st.doing) list.append(h("div", { class: "ap-doing" }, `▸ ${st.doing}`));
    }
    this.root.replaceChildren(head, list, h("div", { class: "ap-foot" }, `${takeKey} → Prendre la main`));
  }
}
