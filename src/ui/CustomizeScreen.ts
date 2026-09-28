import type { Settings } from "../core/Settings";
import { available, effectiveFlashColor, effectiveSkin, FLASH_COLORS, SKINS, unlockLevel, type FlashColorId, type SkinId } from "../run/Cosmetics";
import type { Progression, UnlockId } from "../run/Progression";
import { clear, h, Screen } from "./dom";

const css = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(",")})`;

/**
 * Personnalisation (visuel seulement) : couleur de la lampe, tenue du Chirurgien. Le Chirurgien
 * pose derrière le panneau (vitrine 3D) ; un choix débloqué s'équipe au clic, un choix verrouillé
 * se prévisualise seulement.
 */
export class CustomizeScreen extends Screen {
  private readonly body = h("div", { class: "cz-body" });
  private flash: FlashColorId = "standard";
  private skin: SkinId = "classic";
  /** aperçu demandé (la vitrine affiche ça) */
  onPreview: (flash: FlashColorId, skin: SkinId) => void = () => {};
  /** glisser sur la vitrine : rotation du Chirurgien (rad) */
  onRotate: (delta: number) => void = () => {};
  onClose: () => void = () => {};

  constructor(
    private readonly settings: Settings,
    private readonly progression: Progression,
  ) {
    super("custom-screen");
    const stage = h("div", { class: "cz-stage" }, h("div", { class: "cz-hint" }, "Glisse pour le faire tourner"));
    let dragX: number | null = null;
    stage.addEventListener("pointerdown", (e) => {
      dragX = e.clientX;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", (e) => {
      if (dragX === null) return;
      this.onRotate((e.clientX - dragX) * 0.012);
      dragX = e.clientX;
    });
    const release = () => (dragX = null);
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    this.root.append(
      stage,
      h(
        "div",
        { class: "cz-panel" },
        h("div", { class: "cz-head" }, h("h2", { class: "panel-title" }, "Personnaliser"), h("button", { class: "btn", onclick: () => this.onClose() }, "Retour")),
        this.body,
      ),
    );
  }

  private readonly unlocked = (id: UnlockId) => this.progression.isUnlocked(id);

  protected override onShow(): void {
    this.flash = effectiveFlashColor(this.settings.data.flashColor, this.unlocked);
    this.skin = effectiveSkin(this.settings.data.monsterSkin, this.unlocked);
    this.render();
    this.onPreview(this.flash, this.skin);
  }

  private pickFlash(id: FlashColorId): void {
    this.flash = id;
    if (available(FLASH_COLORS.find((c) => c.id === id)!, this.unlocked)) this.settings.update({ flashColor: id });
    this.render();
    this.onPreview(this.flash, this.skin);
  }

  private pickSkin(id: SkinId): void {
    this.skin = id;
    if (available(SKINS.find((k) => k.id === id)!, this.unlocked)) this.settings.update({ monsterSkin: id });
    this.render();
    this.onPreview(this.flash, this.skin);
  }

  private render(): void {
    clear(this.body);
    const level = this.progression.level;
    const s = this.settings.data;
    const worn = { flash: effectiveFlashColor(s.flashColor, this.unlocked), skin: effectiveSkin(s.monsterSkin, this.unlocked) };

    this.body.append(
      h("p", { class: "panel-text" }, `Niveau ${level}${this.progression.unlockAll ? " (code)" : ""} · visuel seulement : aucun effet sur la partie ni sur le Chirurgien.`),
    );

    // lampe torche
    const swatches = h("div", { class: "cz-swatches" });
    for (const c of FLASH_COLORS) {
      const need = unlockLevel(c.unlock);
      const locked = !available(c, this.unlocked);
      swatches.append(
        h(
          "button",
          { class: `cz-swatch ${this.flash === c.id ? "selected" : ""} ${locked ? "locked" : ""}`, onclick: () => this.pickFlash(c.id) },
          h("span", { class: "cz-dot", style: `background:${css(c.tint)};box-shadow:0 0 14px ${css(c.tint)}` }),
          h("span", { class: "cz-name" }, c.name),
          h("span", { class: "cz-state" }, locked ? `🔒 niv. ${need}` : worn.flash === c.id ? "✓ équipée" : ""),
        ),
      );
    }
    const flashDef = FLASH_COLORS.find((c) => c.id === this.flash)!;
    this.body.append(
      h("div", { class: "cz-section" }, h("div", { class: "res-splits-title" }, "Lampe torche"), swatches, h("div", { class: "cz-desc" }, flashDef.desc)),
    );

    // tenues du Chirurgien
    const list = h("div", { class: "choice-list" });
    for (const k of SKINS) {
      const need = unlockLevel(k.unlock);
      const locked = !available(k, this.unlocked);
      list.append(
        h(
          "button",
          { class: `choice cz-skin ${this.skin === k.id ? "selected" : ""} ${locked ? "locked" : ""}`, onclick: () => this.pickSkin(k.id) },
          h("div", { class: "choice-name" }, k.name, h("span", { class: "cz-state" }, locked ? `🔒 niveau ${need}` : worn.skin === k.id ? "✓ équipée" : "")),
          h("div", { class: "choice-desc" }, k.desc),
        ),
      );
    }
    this.body.append(h("div", { class: "cz-section" }, h("div", { class: "res-splits-title" }, "Tenue du Chirurgien"), list));

    // aperçu d'un choix verrouillé
    const skinDef = SKINS.find((k) => k.id === this.skin)!;
    const locked = [flashDef, skinDef].filter((d) => !available(d, this.unlocked));
    const status = locked.length
      ? `Aperçu seulement — ${locked.map((d) => `« ${d.name} » au niveau ${unlockLevel(d.unlock)}`).join(", ")}. Tu es niveau ${level}.`
      : "Équipé : c'est ce que tu verras à ta prochaine run.";
    this.body.append(h("div", { class: `cz-status ${locked.length ? "preview" : ""}` }, status));
  }
}
