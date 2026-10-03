import type { JournalData } from "../gameplay/Journal";
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
  /** sons des touches (branché par le gameplay) */
  onSound: (name: string, param: string) => void = () => undefined;

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
    this.lockedUntil = 0;
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
      this.press(digit);
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

  /** Saisit un chiffre (clavier, ou pilote auto) ; false si la saisie est bloquée. */
  press(digit: string): boolean {
    if (!this.isOpen || performance.now() < this.lockedUntil) return false;
    if (this.entry.length >= 4) this.entry = "";
    this.entry += digit;
    this.onSound("keypad_digit", digit);
    this.statusEl.textContent = "";
    this.root.classList.remove("error");
    this.render();
    if (this.entry.length === 4) this.validate();
    return true;
  }

  private validate(): void {
    const ok = this.submit?.(this.entry) ?? false;
    this.onSound(ok ? "keypad_ok" : "keypad_err", "");
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

export type HideView = "cabinet" | "bed" | "curtain" | null;

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

/** Carnet de Léo (non bloquant) : codes, avancement par sortie, objets repérés. */
export class JournalView {
  readonly root: HTMLDivElement;
  private body: HTMLDivElement;
  private foot: HTMLDivElement;
  isOpen = false;

  constructor() {
    this.body = h("div", { class: "journal-body" });
    this.foot = h("div", { class: "journal-foot" });
    this.root = h("div", { class: "journal" }, h("div", { class: "journal-page" }, h("div", { class: "journal-title" }, "Carnet"), this.body), this.foot);
  }

  open(foot: string): void {
    this.isOpen = true;
    this.foot.textContent = foot;
    this.root.className = "journal show";
  }

  close(): void {
    this.isOpen = false;
    this.root.className = "journal";
  }

  render(d: JournalData): void {
    const b = this.body;
    b.textContent = "";
    // sorties
    for (const e of d.exits) {
      const sec = h("div", { class: `j-exit${e.done === e.steps.length ? " ready" : ""}` }, h("div", { class: "j-h" }, e.label, h("span", { class: "j-count" }, `${e.done}/${e.steps.length}`)));
      for (const s of e.steps) {
        sec.append(h("div", { class: `j-step${s.done ? " done" : ""}` }, h("span", { class: "j-box" }, s.done ? "✓" : ""), s.text, s.hint ? h("span", { class: "j-hint" }, ` — ${s.hint}`) : ""));
      }
      b.append(sec);
    }
    // codes
    const codes = h("div", { class: "j-sec" }, h("div", { class: "j-h" }, "Codes"));
    for (const c of d.codes) {
      codes.append(h("div", { class: `j-code${c.complete ? " done" : ""}` }, h("span", { class: "j-digits" }, c.digits), `${c.label}`, h("span", { class: "j-hint" }, ` — ${c.place}`)));
    }
    b.append(codes);
    // objets repérés
    const sp = h("div", { class: "j-sec" }, h("div", { class: "j-h" }, "Repéré"));
    if (d.spotted.length === 0) sp.append(h("div", { class: "j-empty" }, "Rien encore…"));
    for (const s of d.spotted) {
      sp.append(h("div", { class: "j-item" }, h("span", { class: "j-dot", style: `background:${s.color}` }), s.name, h("span", { class: "j-hint" }, ` — ${s.place}${s.dropped ? " (posé)" : ""}`)));
    }
    b.append(sp);
    if (d.notesRead > 0) b.append(h("div", { class: "j-empty" }, `${d.notesRead} note${d.notesRead > 1 ? "s" : ""} lue${d.notesRead > 1 ? "s" : ""}`));
  }
}
