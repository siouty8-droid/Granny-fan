import "./ui/styles.css";
import { App } from "./core/App";

async function boot(): Promise<void> {
  if (new URLSearchParams(window.location.search).has("map")) {
    const [{ renderDebugMap }, { HOSPITAL }] = await Promise.all([import("./world/layout/DebugMap"), import("./world/layout/hospital")]);
    renderDebugMap(HOSPITAL, document.getElementById("ui-root")!);
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
