import type { DetectEvent } from "../ai/Monster";
import { CONFIG } from "../config";
import type { LogEvent, RunLog } from "./RunLog";

export interface RecapLine {
  /** temps de run (s) */
  t: number;
  text: string;
  /** pièce où ça s'est passé */
  place: string;
  kind: DetectEvent["kind"] | "info";
}

/** Récap d'une run perdue : enchaînement des détections + un conseil ciblé. */
export interface Recap {
  title: string;
  lines: RecapLine[];
  tip: string;
  /** cause principale, classée (statistiques) */
  cause: CauseKey;
}

export type CauseKey = "sprint" | "steps" | "noise" | "trap" | "lamp" | "seen" | "sawHide" | "hideSearch" | "lockdown" | "chase" | "timeout";

/** Libellés des causes (historique, statistiques). */
export const CAUSE_LABELS: Record<CauseKey, string> = {
  sprint: "Entendu en train de courir",
  steps: "Entendu marcher",
  noise: "Un bruit l'a attiré",
  trap: "Piège déclenché",
  lamp: "Repéré à la lampe",
  seen: "Repéré à vue",
  sawHide: "Vu en train de se cacher",
  hideSearch: "Cachette fouillée",
  lockdown: "Confinement",
  chase: "Rattrapé",
  timeout: "Temps écoulé",
};

function classify(cause: DetectEvent | null, capture: DetectEvent | null): CauseKey {
  if (capture?.detail === "hideSaw") return "sawHide";
  if (capture?.detail === "hideSearch") return "hideSearch";
  if (!cause) return "chase";
  if (cause.kind === "ping") return "lockdown";
  if (cause.kind === "sawHide") return "sawHide";
  if (cause.kind === "sight") return cause.detail.includes("lamp") ? "lamp" : "seen";
  const [kind, mode] = cause.detail.split(":");
  if (kind === "step") return mode === "sprint" ? "sprint" : "steps";
  if (kind === "trap") return "trap";
  return "noise";
}

const SURFACES: Record<string, string> = {
  tile: "sur le carrelage",
  concrete: "sur le béton",
  metal: "sur le métal",
  wood: "sur le parquet",
  grass: "dans l'herbe",
};

const NOISES: Record<string, string> = {
  door: "une porte",
  slam: "une porte claquer",
  unlock: "une serrure",
  planks: "les planches arrachées",
  chain: "la chaîne coupée",
  drop: "un objet tomber",
  glass: "la vitre",
  keypad: "les bips d'un clavier",
  machine: "une machine démarrer",
  vault: "ton passage par la fenêtre",
  pickup: "un objet ramassé",
  trap: "le piège claquer",
};

const HIDES: Record<string, string> = {
  wardrobe: "dans l'armoire",
  lockers: "dans le casier",
  bed: "sous le lit",
  stretcher: "sous le brancard",
};

const m = (d: number) => `${Math.round(d)} m`;

/** Phrase décrivant une détection. */
export function describe(e: DetectEvent): string {
  switch (e.kind) {
    case "sight": {
      const f = e.detail.split(",").filter(Boolean);
      const why: string[] = [];
      if (f.includes("lamp")) why.push("lampe allumée");
      if (f.includes("sprint")) why.push("en plein sprint");
      if (f.includes("crouch")) why.push("pourtant accroupi");
      if (f.includes("lockdown")) why.push("confinement");
      return `Il t'a vu à ${m(e.dist)}${why.length ? ` (${why.join(", ")})` : ""}`;
    }
    case "noise": {
      const [kind, a, b] = e.detail.split(":");
      if (kind === "step") {
        const where = SURFACES[b ?? ""] ?? "";
        if (a === "sprint") return `Il t'a entendu courir ${where} à ${m(e.dist)}`.trim();
        if (a === "crouch") return `Même accroupi, il a entendu tes pas ${where}`.trim();
        return `Il a entendu tes pas ${where} à ${m(e.dist)}`.trim();
      }
      if (kind === "door" && a === "hide") return `Il a entendu ta cachette grincer à ${m(e.dist)}`;
      if (kind === "trap") return `Tu as marché sur un piège : il l'a entendu à ${m(e.dist)}`;
      return `Il a entendu ${NOISES[kind ?? ""] ?? "du bruit"} à ${m(e.dist)}`;
    }
    case "ping":
      return "Confinement : il a su où tu étais";
    case "sawHide":
      return `Il t'a vu te cacher ${HIDES[e.detail] ?? ""}`.trim();
    case "capture":
      if (e.detail === "hideSaw") return "Il t'a sorti de ta cachette : il t'avait vu y entrer";
      if (e.detail === "hideSearch") return "Il a fouillé ta cachette… et il t'a trouvé";
      return "Il t'a rattrapé";
  }
}

/** Conseil selon la cause principale. */
function tipFor(cause: DetectEvent | null, capture: DetectEvent | null): string {
  if (capture?.detail === "hideSaw") return "S'il te voit entrer dans une cachette, il vient te chercher : casse d'abord la ligne de vue (angle, porte).";
  if (capture?.detail === "hideSearch") return "Il fouille les cachettes proches de l'endroit où il t'a perdu : éloigne-toi avant de te cacher.";
  if (!cause) return "En poursuite, casse la ligne de vue (portes, angles, étages) avant de te cacher.";
  if (cause.kind === "ping") return "Après 8:00, il sait régulièrement où tu es : ne reste jamais immobile.";
  if (cause.kind === "sawHide") return "S'il te voit entrer dans une cachette, il vient te chercher : casse d'abord la ligne de vue.";
  if (cause.kind === "sight") {
    if (cause.detail.includes("lamp")) return "La lampe te rend visible de bien plus loin : coupe-la quand il rôde (tes yeux s'habituent).";
    if (cause.detail.includes("sprint")) return "Le sprint attire l'œil et s'entend de loin : garde-le pour fuir, pas pour explorer.";
    return "Accroupi et dans l'ombre, il te repère beaucoup plus tard.";
  }
  const [kind, mode] = cause.detail.split(":");
  if (kind === "step" && mode === "sprint") return "Le sprint s'entend de très loin : accroupi, tes pas portent beaucoup moins.";
  if (kind === "step") return "Le carrelage et le métal résonnent : accroupis-toi quand ses pas sont proches.";
  if (kind === "trap") return "En Difficile et Cauchemar, regarde le sol dans les couloirs : les pièges s'entendent dans tout l'étage.";
  if (kind === "planks" || kind === "chain" || kind === "machine") return "Certaines actions s'entendent de loin : fais-les quand il est à l'autre bout du bâtiment.";
  if (kind === "slam" || kind === "door") return "Les portes s'entendent : laisse-les ouvertes derrière toi quand tu repasses par là.";
  return "En poursuite, casse la ligne de vue (portes, angles, étages) avant de te cacher.";
}

/** Construit le récap à partir du journal (capture ou temps écoulé). */
export function buildRecap(log: RunLog, reason: "captured" | "timeout"): Recap {
  const det = log.detections;
  if (reason === "timeout") {
    const splits = log.events.filter((e) => e.kind === "split");
    const last = splits[splits.length - 1];
    return {
      title: "Pourquoi c'est fini",
      lines: last ? [{ t: last.t, text: `Dernier objectif : ${last.label}`, place: "", kind: "info" }] : [],
      tip: splits.length === 0 ? "Commence par une sortie et suis-la jusqu'au bout : lis les notes, le carnet garde les codes." : "Regarde la carte : les allers-retours et les détours coûtent le plus de temps.",
      cause: "timeout",
    };
  }
  const capIdx = det.findLastIndex((e) => e.detect?.kind === "capture");
  const capture = capIdx >= 0 ? det[capIdx]! : null;
  const endT = capture ? capture.t : Infinity;
  const window: LogEvent[] = det.filter((e) => e.t <= endT && e.t >= endT - CONFIG.runLog.recapWindow && e.detect?.kind !== "capture");
  const chain = window.slice(-(CONFIG.runLog.recapLines - 1));
  // cause principale : ce qui a déclenché la dernière poursuite (vue / cachette vue), sinon le dernier bruit
  const trigger = [...chain].reverse().find((e) => e.detect?.kind === "noise" || e.detect?.kind === "ping") ?? null;
  const sight = [...chain].reverse().find((e) => e.detect?.kind === "sight" || e.detect?.kind === "sawHide") ?? null;
  const cause = (trigger && sight && trigger.t < sight.t ? trigger : sight ?? trigger)?.detect ?? null;
  const lines: RecapLine[] = chain.map((e) => ({ t: e.t, text: describe(e.detect!), place: e.label, kind: e.detect!.kind }));
  if (capture?.detect) lines.push({ t: capture.t, text: describe(capture.detect), place: capture.label, kind: "capture" });
  return { title: "Comment il t'a eu", lines, tip: tipFor(cause, capture?.detect ?? null), cause: classify(cause, capture?.detect ?? null) };
}
