import { CONFIG, type GraphicsPreset } from "../config";
import type { Input } from "../core/Input";
import { ACTIONS, keyLabel, type Action } from "../core/KeyBindings";
import type { Settings, SettingsData } from "../core/Settings";
import { clear, h, Screen } from "./dom";

type Tab = "controls" | "graphics" | "audio";

/** Menu d'options (accessible depuis le menu principal et la pause). */
export class OptionsMenu extends Screen {
  private tab: Tab = "controls";
  private body: HTMLDivElement;
  private tabs: HTMLDivElement;
  private capturing: { action: Action; index: 0 | 1 } | null = null;
  onClose: () => void = () => {};
  /** ouvre l'écran de calibrage de la luminosité */
  onCalibrate: () => void = () => {};

  constructor(private readonly settings: Settings, private readonly input: Input) {
    super("options-screen");
    this.body = h("div", { class: "options-body" });
    this.tabs = h("div", { class: "tabs" });
    const box = h(
      "div",
      { class: "options-box" },
      h(
        "div",
        { class: "options-head" },
        h("h2", { class: "panel-title" }, "Options"),
        h("button", { class: "btn", onclick: () => this.close() }, "Retour"),
      ),
      this.tabs,
      this.body,
    );
    this.root.append(box);
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.capturing) {
        e.stopPropagation();
        this.close();
      }
    });
    settings.on("change", () => {
      if (this.isMounted && !this.capturing) this.render();
    });
  }

  protected override onShow(): void {
    this.render();
  }

  protected override onHide(): void {
    this.input.cancelCapture();
    this.capturing = null;
  }

  close(): void {
    this.input.cancelCapture();
    this.capturing = null;
    this.onClose();
  }

  private render(): void {
    clear(this.tabs);
    const mk = (id: Tab, label: string) =>
      h(
        "button",
        {
          class: `tab ${this.tab === id ? "active" : ""}`,
          onclick: () => {
            this.tab = id;
            this.render();
          },
        },
        label,
      );
    this.tabs.append(mk("controls", "Contrôles"), mk("graphics", "Graphismes"), mk("audio", "Audio"));
    clear(this.body);
    const s = this.settings.data;
    if (this.tab === "controls") this.renderControls(s);
    else if (this.tab === "graphics") this.renderGraphics(s);
    else this.renderAudio(s);
  }

  // ------------------------------------------------------------------ widgets

  private row(label: string, control: HTMLElement, hint?: string): HTMLDivElement {
    return h("div", { class: "opt-row" }, h("div", { class: "opt-label" }, label, hint ? h("small", null, hint) : null), h("div", { class: "opt-control" }, control));
  }

  private slider(
    value: number,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    onChange: (v: number) => void,
    fine = false,
  ): HTMLElement {
    const out = h("span", { class: "opt-value" }, format(value));
    const range = h("input", { type: "range", min, max, step, value }) as HTMLInputElement;
    const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    const set = (v: number) => {
      const c = Math.min(max, Math.max(min, Number(v.toFixed(decimals))));
      range.value = String(c);
      out.textContent = format(c);
      onChange(c);
    };
    range.addEventListener("input", () => {
      out.textContent = format(Number(range.value));
    });
    range.addEventListener("change", () => set(Number(range.value)));
    const wrap = h("div", { style: "display:flex;align-items:center;gap:8px" });
    if (fine) wrap.append(h("button", { class: "btn", style: "padding:4px 9px", onclick: () => set(Number(range.value) - step) }, "−"));
    wrap.append(range);
    if (fine) wrap.append(h("button", { class: "btn", style: "padding:4px 9px", onclick: () => set(Number(range.value) + step) }, "+"));
    wrap.append(out);
    return wrap;
  }

  private toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const t = h("button", { class: `toggle ${on ? "on" : ""}`, "aria-pressed": on ? "true" : "false" });
    t.addEventListener("click", () => onChange(!on));
    return t;
  }

  private seg<T extends string>(value: T, options: Array<[T, string]>, onChange: (v: T) => void): HTMLElement {
    const wrap = h("div", { class: "seg" });
    for (const [v, label] of options) {
      wrap.append(h("button", { class: v === value ? "on" : "", onclick: () => onChange(v) }, label));
    }
    return wrap;
  }

  // ------------------------------------------------------------------ onglets

  private renderControls(s: SettingsData): void {
    const up = (p: Partial<SettingsData>) => this.settings.update(p);
    this.body.append(
      this.row(
        "Sensibilité souris",
        this.slider(s.sensitivity, CONFIG.input.sensitivityMin, CONFIG.input.sensitivityMax, 0.01, (v) => v.toFixed(2), (v) => up({ sensitivity: v }), true),
        "Mouvement brut (pointer lock sans accélération quand le navigateur le permet).",
      ),
      this.row("Inverser l'axe Y", this.toggle(s.invertY, (v) => up({ invertY: v }))),
      this.row("Champ de vision (horizontal)", this.slider(s.fov, CONFIG.camera.fovMin, CONFIG.camera.fovMax, 1, (v) => `${v}°`, (v) => up({ fov: v }))),
      this.row("Balancement de la caméra", this.toggle(s.headBob, (v) => up({ headBob: v })), "Désactivable pour les joueurs sensibles au mal des transports."),
      this.row(
        "Disposition du clavier",
        this.seg(s.layout, [["azerty", "AZERTY"], ["qwerty", "QWERTY"]], (v) => up({ layout: v })),
        "Les touches suivent la position physique : ZQSD en AZERTY, WASD en QWERTY.",
      ),
    );
    const head = h("div", { class: "opt-row", style: "border:none;margin-top:14px" }, h("div", { class: "opt-label", style: "color:var(--text-dim);letter-spacing:.14em;text-transform:uppercase;font-size:12px" }, "Touches"), h("div", { class: "opt-control" }, h("button", { class: "btn", onclick: () => this.settings.resetBindings() }, "Par défaut")));
    this.body.append(head);
    for (const a of ACTIONS) {
      const binds = s.bindings[a.id];
      const ctrl = h("div", { style: "display:flex;gap:8px" });
      for (const idx of [0, 1] as const) {
        const cap = this.capturing && this.capturing.action === a.id && this.capturing.index === idx;
        const btn = h("button", { class: `keybind ${cap ? "capturing" : ""}` }, cap ? "Appuie…" : keyLabel(binds[idx], s.layout));
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.startCapture(a.id, idx);
        });
        ctrl.append(btn);
      }
      this.body.append(this.row(a.label, ctrl));
    }
    this.body.append(h("div", { class: "choice-desc", style: "margin-top:12px" }, "Échap pendant la capture = effacer la touche. Échap en jeu = pause (non remappable)."));
  }

  private startCapture(action: Action, index: 0 | 1): void {
    this.capturing = { action, index };
    this.render();
    // petit délai : ignorer le clic qui vient de lancer la capture
    window.setTimeout(() => {
      this.input.captureNext((code) => {
        const b = { ...this.settings.data.bindings };
        const pair: [string, string] = [...b[action]] as [string, string];
        pair[index] = code;
        // retire ce code des autres actions pour éviter les doublons
        if (code) {
          for (const k of Object.keys(b) as Action[]) {
            if (k === action) continue;
            const p = b[k];
            if (p[0] === code || p[1] === code) b[k] = [p[0] === code ? "" : p[0], p[1] === code ? "" : p[1]];
          }
        }
        b[action] = pair;
        this.capturing = null;
        this.settings.update({ bindings: b });
        this.render();
      });
    }, 60);
  }

  private renderGraphics(s: SettingsData): void {
    const up = (p: Partial<SettingsData>) => this.settings.update(p);
    const desc: Record<GraphicsPreset, string> = {
      low: "Rendu à 72 %, ombres 512, FXAA. Pour tout iGPU récent (2020+).",
      medium: "Rendu à 90 %, ombres 1024, FXAA, bloom léger, grain. Cible : 60 fps en 1080p sur iGPU type Vega 7.",
      high: "Rendu natif, ombres 2048 filtrées, FXAA, bloom, grain, SSAO léger, aberration chromatique.",
    };
    this.body.append(
      this.row("Preset graphique", this.seg(s.graphics, [["low", "Low"], ["medium", "Medium"], ["high", "High"]], (v) => up({ graphics: v })), `${desc[s.graphics]} La résolution des textures change au prochain lancement.`),
      this.row(
        "Luminosité",
        h(
          "div",
          { class: "opt-inline" },
          this.slider(s.brightness, CONFIG.graphics.brightness.min, CONFIG.graphics.brightness.max, CONFIG.graphics.brightness.step, (v) => `${Math.round(v * 100)} %`, (v) => up({ brightness: v })),
          h("button", { class: "btn small", onclick: () => this.onCalibrate() }, "Calibrer…"),
        ),
      ),
      this.row("Résolution dynamique", this.toggle(s.dynamicResolution, (v) => up({ dynamicResolution: v })), "Baisse légèrement la résolution de rendu si les fps passent sous 58."),
      this.row("Compteur de FPS (debug)", this.toggle(s.showFps, (v) => up({ showFps: v }))),
    );
  }

  private renderAudio(s: SettingsData): void {
    const up = (p: Partial<SettingsData>) => this.settings.update(p);
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.body.append(
      this.row("Volume général", this.slider(s.volumeMaster, 0, 1, 0.01, pct, (v) => up({ volumeMaster: v }))),
      this.row("Musique", this.slider(s.volumeMusic, 0, 1, 0.01, pct, (v) => up({ volumeMusic: v }))),
      this.row("Effets", this.slider(s.volumeSfx, 0, 1, 0.01, pct, (v) => up({ volumeSfx: v }))),
      this.row(
        "Événements flippants",
        this.toggle(s.scares, (v) => up({ scares: v })),
        "Coupures de courant, cris au loin, portes qui claquent, silhouettes… Ambiance seulement : ça ne change rien au jeu.",
      ),
    );
  }
}
