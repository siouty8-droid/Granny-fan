/** Mini-helper de création DOM (pas de framework). */
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === "class") {
        el.className = String(v);
      } else if (k === "html") {
        el.innerHTML = String(v);
      } else if (v === true) {
        el.setAttribute(k, "");
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Écran plein (overlay) montable / démontable. */
export abstract class Screen {
  readonly root: HTMLElement;
  private mounted = false;

  constructor(className: string) {
    this.root = h("div", { class: "screen " + className });
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.root);
    this.mounted = true;
    this.onShow();
  }

  unmount(): void {
    if (!this.mounted) return;
    this.root.remove();
    this.mounted = false;
    this.onHide();
  }

  get isMounted(): boolean {
    return this.mounted;
  }

  protected onShow(): void {}
  protected onHide(): void {}
}
