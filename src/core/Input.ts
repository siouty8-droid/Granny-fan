import type { Action, Bindings } from "./KeyBindings";

/** Touches dont on bloque le comportement navigateur pendant le jeu. */
const BLOCK_DEFAULT = new Set([
  "Space",
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "Backspace",
  "Slash",
  "Quote",
]);

/**
 * Entrées clavier / souris.
 * - Souris : on accumule `movementX/Y` bruts (pointer lock `unadjustedMovement` quand dispo)
 *   et la caméra les consomme une fois par frame d'affichage — aucun lissage, aucune accélération.
 * - Clavier : état « maintenu » + fronts montants par frame.
 */
export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private wheelSteps = 0;
  private skipNextMove = false;
  private lockListeners = new Set<(locked: boolean) => void>();
  private captureFn: ((code: string) => void) | null = null;

  bindings: Bindings;
  /** true pendant le gameplay : on empêche les raccourcis navigateur sur les touches de jeu. */
  gameplayActive = false;
  /** support effectif de la souris brute */
  rawMouse = false;
  /**
   * Pilote auto : les actions de jeu viennent d'ici (le clavier du joueur est ignoré pour elles),
   * sauf celles de `USER_ACTIONS` (restart, passer, carnet).
   */
  private synth: { held: Set<Action>; pressed: Set<Action>; released: Set<Action>; taps: Set<Action> } | null = null;
  private static readonly USER_ACTIONS: ReadonlySet<Action> = new Set<Action>(["restart", "skip", "journal"]);

  constructor(private readonly canvas: HTMLCanvasElement, bindings: Bindings) {
    this.bindings = bindings;
    window.addEventListener("keydown", this.onKeyDown, { capture: true });
    window.addEventListener("keyup", this.onKeyUp, { capture: true });
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("contextmenu", (e) => {
      if (this.gameplayActive || this.pointerLocked) e.preventDefault();
    });
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  // ----------------------------------------------------------------- clavier

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.captureFn) {
      e.preventDefault();
      e.stopPropagation();
      const fn = this.captureFn;
      this.captureFn = null;
      fn(e.code === "Escape" ? "" : e.code);
      return;
    }
    if (this.gameplayActive && (BLOCK_DEFAULT.has(e.code) || this.isBound(e.code))) e.preventDefault();
    if (e.repeat) return;
    if (!this.held.has(e.code)) this.pressed.add(e.code);
    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.held.delete(e.code)) this.released.add(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    const code = "Mouse" + e.button;
    if (this.captureFn) {
      // Clic gauche pendant la capture : accepté seulement si le pointeur est sur le bouton de remap
      e.preventDefault();
      const fn = this.captureFn;
      this.captureFn = null;
      fn(code);
      return;
    }
    if (!this.pointerLocked && !this.gameplayActive) return;
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
  };

  private onMouseUp = (e: MouseEvent): void => {
    const code = "Mouse" + e.button;
    if (this.held.delete(code)) this.released.add(code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    if (this.skipNextMove) {
      this.skipNextMove = false;
      return;
    }
    const dx = e.movementX;
    const dy = e.movementY;
    // Garde-fou contre les pics parasites de certains navigateurs à la prise du lock.
    if (Math.abs(dx) > 2500 || Math.abs(dy) > 2500) return;
    this.mouseX += dx;
    this.mouseY += dy;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.pointerLocked) return;
    this.wheelSteps += Math.sign(e.deltaY);
  };

  private onBlur = (): void => {
    for (const c of this.held) this.released.add(c);
    this.held.clear();
  };

  private isBound(code: string): boolean {
    for (const key in this.bindings) {
      const b = this.bindings[key as Action];
      if (b[0] === code || b[1] === code) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ API actions

  isDown(action: Action): boolean {
    if (this.synth && !Input.USER_ACTIONS.has(action)) return this.synth.held.has(action);
    const b = this.bindings[action];
    return (b[0] !== "" && this.held.has(b[0])) || (b[1] !== "" && this.held.has(b[1]));
  }

  wasPressed(action: Action): boolean {
    if (this.synth && !Input.USER_ACTIONS.has(action)) return this.synth.pressed.has(action);
    const b = this.bindings[action];
    return (b[0] !== "" && this.pressed.has(b[0])) || (b[1] !== "" && this.pressed.has(b[1]));
  }

  wasReleased(action: Action): boolean {
    if (this.synth && !Input.USER_ACTIONS.has(action)) return this.synth.released.has(action);
    const b = this.bindings[action];
    return (b[0] !== "" && this.released.has(b[0])) || (b[1] !== "" && this.released.has(b[1]));
  }

  codeDown(code: string): boolean {
    return this.held.has(code);
  }

  codePressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Mouvement souris brut accumulé depuis le dernier appel (en counts). */
  consumeMouse(out: { x: number; y: number }): void {
    out.x = this.mouseX;
    out.y = this.mouseY;
    this.mouseX = 0;
    this.mouseY = 0;
  }

  consumeWheel(): number {
    const w = this.wheelSteps;
    this.wheelSteps = 0;
    return w;
  }

  /** À appeler en fin de frame : purge les fronts. */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    if (this.synth) {
      const s = this.synth;
      s.pressed.clear();
      s.released.clear();
      // appuis brefs : relâchés après une frame
      for (const a of s.taps) if (s.held.delete(a)) s.released.add(a);
      s.taps.clear();
    }
  }

  /** Active / coupe la couche d'actions simulées (pilote auto). */
  setSynthetic(on: boolean): void {
    this.synth = on ? { held: new Set(), pressed: new Set(), released: new Set(), taps: new Set() } : null;
  }

  get synthetic(): boolean {
    return this.synth !== null;
  }

  /** Pilote auto : maintient / relâche une action (front montant au premier maintien). */
  synthHold(action: Action, down: boolean): void {
    const s = this.synth;
    if (!s) return;
    if (down) {
      if (!s.held.has(action)) s.pressed.add(action);
      s.held.add(action);
    } else if (s.held.delete(action)) s.released.add(action);
  }

  /** Pilote auto : appui bref (relâché automatiquement après une frame). */
  synthTap(action: Action): void {
    const s = this.synth;
    if (!s) return;
    s.pressed.add(action);
    s.held.add(action);
    s.taps.add(action);
  }

  /** Pilote auto : relâche toutes les actions simulées. */
  synthReleaseAll(): void {
    const s = this.synth;
    if (!s) return;
    for (const a of s.held) s.released.add(a);
    s.held.clear();
  }

  /** Oublie tout (changement d'état de jeu). */
  reset(): void {
    this.held.clear();
    this.pressed.clear();
    this.released.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheelSteps = 0;
  }

  /** Tests automatisés : simule le maintien d'une touche. */
  debugHold(code: string, down: boolean): void {
    if (down) {
      if (!this.held.has(code)) this.pressed.add(code);
      this.held.add(code);
    } else if (this.held.delete(code)) {
      this.released.add(code);
    }
  }

  /** Capture la prochaine touche / bouton pressé (menu de remappage). */
  captureNext(fn: (code: string) => void): void {
    this.captureFn = fn;
  }

  cancelCapture(): void {
    this.captureFn = null;
  }

  get capturing(): boolean {
    return this.captureFn !== null;
  }

  // ------------------------------------------------------------ pointer lock

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  async requestPointerLock(): Promise<boolean> {
    if (this.pointerLocked) return true;
    const el = this.canvas as HTMLCanvasElement & {
      requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
    };
    try {
      await el.requestPointerLock({ unadjustedMovement: true });
      this.rawMouse = true;
    } catch {
      try {
        await el.requestPointerLock();
        this.rawMouse = false;
      } catch {
        return false;
      }
    }
    return this.pointerLocked;
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  onPointerLockChange(fn: (locked: boolean) => void): () => void {
    this.lockListeners.add(fn);
    return () => this.lockListeners.delete(fn);
  }

  private onLockChange = (): void => {
    const locked = this.pointerLocked;
    if (locked) this.skipNextMove = true;
    this.mouseX = 0;
    this.mouseY = 0;
    for (const fn of this.lockListeners) fn(locked);
  };
}
