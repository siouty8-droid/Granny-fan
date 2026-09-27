import { h } from "./dom";

/**
 * Clavier à code (coffres, boîtier du portail) : saisie au clavier (rangée des chiffres ou pavé),
 * sans quitter le verrouillage du pointeur. Le jeu continue pendant la saisie.
 */
export class KeypadView {
  readonly root: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private cells: HTMLDivElement[] = [];
  private memoEl: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private helpEl: HTMLDivElement;
  private entry = "";
  private submit: ((code: string) => boolean) | null = null;
  private lockedUntil = 0;
  isOpen = false;

  constructor() {
    this.titleEl = h("div", { class: "keypad-title" });
    const row = h("div", { class: "keypad-cells" });
    for (let i = 0; i < 4; i++) {
      const c = h("div", { class: "keypad-cell" }, "");
      this.cells.push(c);
      row.append(c);
    }
    this.memoEl = h("div", { class: "keypad-memo" });
    this.statusEl = h("div", { class: "keypad-status" });
    this.helpEl = h("div", { class: "keypad-help" });
    this.root = h("div", { class: "keypad" }, this.titleEl, row, this.statusEl, this.memoEl, this.helpEl);
    window.addEventListener("keydown", this.onKey, true);
  }

  open(title: string, memo: string | null, help: string, onSubmit: (code: string) => boolean): void {
    this.isOpen = true;
    this.entry = "";
    this.submit = onSubmit;
    this.titleEl.textContent = title;
    this.memoEl.textContent = memo ?? "";
    this.memoEl.style.display = memo ? "" : "none";
    this.helpEl.textContent = help;
    this.statusEl.textContent = "";
    this.root.className = "keypad show";
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.submit = null;
    this.root.className = "keypad";
  }

  private render(): void {
    for (let i = 0; i < 4; i++) this.cells[i]!.textContent = this.entry[i] ?? "";
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.isOpen) return;
    const now = performance.now();
    let digit: string | null = null;
    if (/^Digit\d$/.test(e.code)) digit = e.code.slice(5);
    else if (/^Numpad\d$/.test(e.code)) digit = e.code.slice(6);
    if (digit !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (now < this.lockedUntil) return;
      if (this.entry.length >= 4) this.entry = "";
      this.entry += digit;
      this.statusEl.textContent = "";
      this.root.classList.remove("error");
      this.render();
      if (this.entry.length === 4) this.validate();
    } else if (e.code === "Backspace") {
      e.preventDefault();
      this.entry = this.entry.slice(0, -1);
      this.render();
    } else if (e.code === "Enter" || e.code === "NumpadEnter") {
      e.preventDefault();
      e.stopPropagation();
      if (this.entry.length === 4) this.validate();
    }
  };

  private validate(): void {
    const ok = this.submit?.(this.entry) ?? false;
    if (ok) {
      this.statusEl.textContent = "OUVERT";
      this.root.classList.add("ok");
      this.lockedUntil = performance.now() + 600;
    } else {
      this.statusEl.textContent = "CODE ERRONÉ";
      this.root.classList.remove("error");
      void this.root.offsetWidth;
      this.root.classList.add("error");
      this.lockedUntil = performance.now() + 350;
      this.entry = "";
      window.setTimeout(() => this.render(), 350);
    }
  }
}

/** Lecture d'une note (panneau latéral, non bloquant). */
export class NoteView {
  readonly root: HTMLDivElement;
  private authorEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private footEl: HTMLDivElement;
  isOpen = false;
  /** position où la note a été ouverte (fermeture si on s'éloigne) */
  at = { x: 0, y: 0, z: 0 };

  constructor() {
    this.authorEl = h("div", { class: "note-author" });
    this.textEl = h("div", { class: "note-text" });
    this.footEl = h("div", { class: "note-foot" });
    this.root = h("div", { class: "note-view" }, h("div", { class: "note-paper" }, this.textEl, this.authorEl), this.footEl);
  }

  open(author: string, text: string, code: string | null, foot: string, x: number, y: number, z: number): void {
    this.isOpen = true;
    this.at = { x, y, z };
    this.authorEl.textContent = `— ${author}`;
    const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    this.textEl.innerHTML = code ? safe.replace(code, `<span class="note-code">${code}</span>`) : safe;
    this.footEl.textContent = foot;
    this.root.className = "note-view show";
  }

  close(): void {
    this.isOpen = false;
    this.root.className = "note-view";
  }
}

export type HideView = "cabinet" | "bed" | null;

/** Vue depuis une cachette : fentes d'armoire / dessous de lit. */
export class HideOverlay {
  readonly root: HTMLDivElement;
  private label: HTMLDivElement;

  constructor() {
    this.label = h("div", { class: "hide-label" });
    this.root = h("div", { class: "hide-overlay" }, this.label);
  }

  show(kind: HideView, text: string): void {
    this.root.className = kind ? `hide-overlay show ${kind}` : "hide-overlay";
    this.label.textContent = text;
  }

  hide(): void {
    this.root.className = "hide-overlay";
  }
}
