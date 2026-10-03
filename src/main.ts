import "./ui/styles.css";
import { App } from "./core/App";

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  if (params.has("map")) {
    const [{ renderDebugMap }, { HOSPITAL }, { MALL }] = await Promise.all([import("./world/layout/DebugMap"), import("./world/layout/hospital"), import("./world/layout/mall")]);
    renderDebugMap(params.get("map") === "mall" ? MALL : HOSPITAL, document.getElementById("ui-root")!);
    return;
  }
  if (params.has("explore")) {
    // visite libre d'une carte (sans gameplay) : ?explore=mall
    const [{ Explorer }, { HOSPITAL }, { MALL }] = await Promise.all([import("./debug/Explorer"), import("./world/layout/hospital"), import("./world/layout/mall")]);
    const ex = new Explorer(document.getElementById("render-canvas") as HTMLCanvasElement, document.getElementById("ui-root")!, params.get("explore") === "hospital" ? HOSPITAL : MALL);
    await ex.init();
    return;
  }
  const canvas = document.getElementById("render-canvas") as HTMLCanvasElement | null;
  const uiRoot = document.getElementById("ui-root");
  if (!canvas || !uiRoot) throw new Error("DOM incomplet");
  const app = new App(canvas, uiRoot);
  try {
    await app.init();
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    const el = document.createElement("div");
    el.className = "screen loading";
    el.innerHTML = `<div class="loading-error"></div>`;
    (el.firstChild as HTMLElement).textContent = "Erreur au chargement :\n" + msg;
    uiRoot.appendChild(el);
  }
}

void boot();
