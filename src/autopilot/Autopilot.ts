import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CONFIG } from "../config";
import { NavFlags, type Navigation } from "../ai/Navigation";
import { DEBUG } from "../core/Debug";
import type { Input } from "../core/Input";
import type { Action } from "../core/KeyBindings";
import type { Door } from "../gameplay/Doors";
import type { Gameplay } from "../gameplay/Gameplay";
import type { Interactable, Shape } from "../gameplay/Interaction";
import { ITEMS, type ItemId } from "../gameplay/data/items";
import type { Collider } from "../physics/Collider";
import type { Player } from "../player/Player";
import { EXTERIOR } from "../world/builder/ExteriorBuilder";
import { ROOF_EXIT } from "../world/builder/RoofBuilder";
import type { FloorId } from "../world/layout/types";
import type { Route, RoutePortal, RouteStep } from "./RoutePlanner";

/** Micro-action exécutée frame par frame. */
type Job =
  /** marcher (navmesh) jusqu'à un point ; `reach` : on s'arrête dès que cet objet est utilisable */
  | { kind: "goto"; to: Vector3; tol: number; say: string; reach?: () => Interactable | null; toggled?: Set<string> }
  /** marcher tout droit (cabine d'ascenseur, conduit, portail, échelle) */
  | { kind: "straight"; to: Vector3; tol: number; crouch: boolean; say: string; until?: () => boolean }
  /** viser un objet interactif et l'utiliser (appui ou maintien) ; `settled` : l'action a pris, on attend `done` sans réappuyer */
  | { kind: "use"; find: () => Interactable | null; say: string; done: () => boolean; skip?: () => boolean; settled?: () => boolean }
  /** attendre une condition */
  | { kind: "wait"; until: () => boolean; max: number; say: string }
  /** taper un code sur le clavier ouvert */
  | { kind: "type"; code: string; say: string }
  /** choisir l'emplacement d'inventaire qui contient cet objet (échange) */
  | { kind: "select"; item: ItemId }
  /** laisser au spectateur le temps de suivre */
  | { kind: "pace"; at: number }
  /** fin d'étape (HUD) */
  | { kind: "stepDone"; index: number };

export type AutopilotPhase = "off" | "running" | "done" | "failed";

/** État affiché par le HUD. */
export interface AutopilotStatus {
  phase: AutopilotPhase;
  route: Route | null;
  /** étape de la route en cours */
  step: number;
  /** ce que fait le pilote en ce moment */
  doing: string;
  /** raison d'un échec */
  error: string;
}

const TAU = Math.PI * 2;
/** actions maintenues gérées par le pilote (recalculées à chaque frame) */
const HELD: readonly Action[] = ["forward", "back", "left", "right", "sprint", "crouch", "interact"];
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);

function wrap(a: number): number {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function center(s: Shape): Vector3 {
  return s.kind === "sphere" ? V(s.x, s.y, s.z) : V(s.cx, s.cy, s.cz);
}

/** Le segment (ax, az)–(bx, bz) coupe-t-il la boîte orientée (élargie de `m`) ? */
function segmentHitsBox(ax: number, az: number, bx: number, bz: number, c: Collider, m: number): boolean {
  const lx = (x: number, z: number) => (x - c.cx) * c.cos + (z - c.cz) * c.sin;
  const lz = (x: number, z: number) => -(x - c.cx) * c.sin + (z - c.cz) * c.cos;
  const x0 = lx(ax, az);
  const z0 = lz(ax, az);
  const dx = lx(bx, bz) - x0;
  const dz = lz(bx, bz) - z0;
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  const hx = c.hx + m;
  const hz = c.hz + m;
  return clip(-dx, x0 + hx) && clip(dx, hx - x0) && clip(-dz, z0 + hz) && clip(dz, hz - z0);
}

/**
 * Pilote auto (mode entraînement) : exécute une route du planificateur en jouant « pour de
 * vrai » — mêmes entrées que le joueur (déplacement, sprint, accroupi, interaction, emplacements,
 * clavier à code), caméra orientée par le pilote. Suit la navmesh, ouvre les portes fermées sur
 * son chemin, passe accroupi sous les obstacles, prend l'ascenseur, enjambe les fenêtres.
 * Se cale sur le temps théorique + une marge pour laisser le temps de comprendre la route.
 */
export class Autopilot {
  private route: Route | null = null;
  private jobs: Job[] = [];
  private job: Job | null = null;
  /** temps passé dans le job courant */
  private jt = 0;
  /** sous-état du job courant */
  private stage = 0;
  private stageT = 0;
  private tries = 0;
  private clock = 0;
  private path: Vector3[] = [];
  private pathTo = V(0, 0, 0);
  private pathAge = 0;
  private bestLeft = Infinity;
  /** contournement d'un vantail ouvert */
  private detour: Vector3 | null = null;
  private detourT = 0;
  private noProgress = 0;
  private unstick = 0;
  private unstickDir = 1;
  private stuckTotal = 0;
  private typed = 0;
  private typeT = 0;
  private margin = 0;
  /** actions à maintenir pendant cette frame */
  private want = new Set<Action>();
  /** diagnostic : dernières frames (tests) */
  readonly trace: string[] = [];
  private traceN = 0;
  readonly status: AutopilotStatus = { phase: "off", route: null, step: 0, doing: "", error: "" };

  constructor(
    private readonly gp: Gameplay,
    private readonly player: Player,
    private readonly input: Input,
    private readonly nav: Navigation,
    /** temps de run (s) : le chrono affiché, sur lequel se calent les pauses */
    private readonly time: () => number,
  ) {}

  get active(): boolean {
    return this.status.phase === "running";
  }

  /** Démarre la route (début de run, joueur au point de départ). */
  start(route: Route): void {
    this.route = route;
    this.jobs = [];
    this.job = null;
    this.clock = 0;
    this.margin = CONFIG.autopilot.margin;
    Object.assign(this.status, { phase: "running", route, step: 0, doing: "", error: "" });
    route.steps.forEach((st, i) => this.plan(st, i));
    this.input.setSynthetic(true);
    this.player.autopilot = true;
  }

  /** Rend la main au joueur (« off » : bandeau masqué ; « failed » : raison affichée). */
  stop(phase: AutopilotPhase = "off", error = ""): void {
    this.status.phase = phase;
    this.status.error = error;
    this.jobs = [];
    this.job = null;
    this.input.synthReleaseAll();
    this.input.setSynthetic(false);
    this.player.autopilot = false;
  }

  // ================================================================ préparation

  private node(i: number): Vector3 {
    const n = this.route!.nodes[i]!;
    return V(n.x, n.y, n.z);
  }

  /** Découpe une étape de route en micro-actions. */
  private plan(st: RouteStep, index: number): void {
    const leg = st.leg;
    const say = `${st.task.place}`;
    for (let i = 1; i < leg.nodes.length; i++) {
      const via = leg.via[i]!;
      if (via < 0) {
        // les points intermédiaires à pied sont des passages (pas d'arrêt devant une porte :
        // on la traverse directement)
        const next = leg.via[i + 1];
        const last = i === leg.nodes.length - 1 || (next !== undefined && next >= 0 && this.route!.portals[next]!.kind !== "door");
        if (!last) continue;
        this.jobs.push({ kind: "goto", to: this.node(leg.nodes[i]!), tol: i === leg.nodes.length - 1 ? 0.3 : 0.6, say: `Vers ${say}` });
      } else this.portal(this.route!.portals[via]!, leg.nodes[i - 1]!, leg.nodes[i]!);
    }
    const lastGoto = this.jobs.length ? this.jobs[this.jobs.length - 1] : undefined;
    const first = this.jobs.length;
    this.action(st);
    // on s'arrête de marcher dès que la cible de l'action est à portée et visible
    const use = this.jobs.slice(first).find((j) => j.kind === "use");
    if (lastGoto?.kind === "goto" && use?.kind === "use") lastGoto.reach = use.find;
    // marge répartie sur les étapes qui précèdent la sortie (la dernière termine la run)
    const n = this.route!.steps.length;
    if (index < n - 1) this.jobs.push({ kind: "pace", at: st.at + (this.margin * (index + 1)) / (n - 1) });
    this.jobs.push({ kind: "stepDone", index });
  }

  /** Franchissement d'un portail (porte verrouillable, conduit, fenêtre, ascenseur). */
  private portal(p: RoutePortal, from: number, to: number): void {
    const gp = this.gp;
    const a = this.node(from);
    const b = this.node(to);
    if (p.kind === "door") {
      this.jobs.push({ kind: "goto", to: b, tol: 0.5, say: "Passe la porte" });
      return;
    }
    const o = gp.world.openings.find((x) => x.id === p.openingId);
    if (p.kind === "vent" && o) {
      this.jobs.push({ kind: "goto", to: a, tol: 0.35, say: "Conduit de ventilation" });
      this.jobs.push({ kind: "straight", to: V(o.x, o.y, o.z), tol: 0.25, crouch: true, say: "Rampe dans le conduit" });
      this.jobs.push({ kind: "straight", to: b, tol: 0.3, crouch: true, say: "Rampe dans le conduit" });
      return;
    }
    if ((p.kind === "window" || p.kind === "drop") && o) {
      this.jobs.push({ kind: "goto", to: a, tol: 0.4, say: p.kind === "drop" ? "Fenêtre (saut)" : "Fenêtre cassée" });
      this.jobs.push({
        kind: "use",
        find: () => this.byId(`vault_${o.id}`),
        say: p.kind === "drop" ? "Saute par la fenêtre" : "Enjambe la fenêtre",
        done: () => gp.vaults.busy,
      });
      this.jobs.push({ kind: "wait", until: () => !gp.vaults.busy && this.player.controlEnabled && this.player.body.grounded, max: 4, say: "Atterrit" });
      this.jobs.push({ kind: "goto", to: b, tol: 0.5, say: "Reprend la route" });
      return;
    }
    if (p.kind === "elevator" && p.floors) {
      const [f, g] = p.floors;
      const el = gp.elevator;
      const cabin = V(37.5, 0, 40.5);
      const here = (fl: FloorId) => el.floor === fl && el.state !== "moving" && el.state !== "closing" && el.doorOpen > 0.97;
      this.jobs.push({ kind: "goto", to: a, tol: 0.4, say: "Ascenseur" });
      this.jobs.push({ kind: "use", find: () => this.byId(`elev_call_${f}`), say: "Appelle l'ascenseur", done: () => el.state !== "idle" || here(f), skip: () => here(f) });
      this.jobs.push({ kind: "wait", until: () => here(f), max: 25, say: "Attend l'ascenseur" });
      this.jobs.push({ kind: "straight", to: V(cabin.x + 0.45, gp.world.floorY(f), cabin.z), tol: 0.3, crouch: false, say: "Entre dans la cabine" });
      this.jobs.push({ kind: "use", find: () => this.byId(`elev_btn_${g}`), say: `Bouton : ${g === "R" ? "toit" : g === "U" ? "étage" : g === "G" ? "rez-de-chaussée" : "sous-sol"}`, done: () => el.state === "closing" || el.state === "moving" || el.floor === g });
      this.jobs.push({ kind: "wait", until: () => here(g), max: 25, say: "Monte / descend" });
      this.jobs.push({ kind: "straight", to: b, tol: 0.4, crouch: false, say: "Sort de la cabine" });
    }
  }

  /** L'action de l'étape (objet, note, coffre, porte, courant, sortie). */
  private action(st: RouteStep): void {
    const gp = this.gp;
    const t = st.task;
    const node = this.node(t.node);
    switch (t.kind) {
      case "pick": {
        const type = t.gives[0]!;
        const name = ITEMS[type].name;
        const wi = t.item;
        if (st.drop) this.jobs.push({ kind: "select", item: st.drop });
        // l'objet visé : celui du plan, ou (reprise) le plus proche du point d'action
        const target = () => this.itemTarget(type, wi ? V(wi.x, wi.y, wi.z) : node);
        const before = () => gp.inventory.count(type);
        let had = -1;
        this.jobs.push({
          kind: "use",
          find: () => {
            if (had < 0) had = before();
            return target();
          },
          say: `${t.repick ? "Reprend" : "Ramasse"} : ${name}${st.drop ? ` (laisse ${ITEMS[st.drop].name})` : ""}`,
          done: () => had >= 0 && gp.inventory.count(type) > had,
        });
        return;
      }
      case "read": {
        const id = t.note!.id;
        this.jobs.push({ kind: "use", find: () => this.byId(`note_${id}`), say: `Lit : ${t.label.replace(/^Note : /, "")}`, done: () => gp.journal.notesRead.has(id), skip: () => gp.journal.notesRead.has(id) });
        return;
      }
      case "safe": {
        const id = t.safeId!;
        const code = t.code;
        this.jobs.push({ kind: "use", find: () => this.byId(`safe_${id}`), say: `Ouvre : ${t.label}`, done: () => gp.safes.isOpen(id) || gp.hud.keypad.isOpen, skip: () => gp.safes.isOpen(id) });
        if (code) this.jobs.push({ kind: "type", code, say: `Tape le code ${code}` });
        this.jobs.push({ kind: "wait", until: () => gp.safes.isOpen(id), max: 3, say: "Le coffre s'ouvre" });
        return;
      }
      case "unlock": {
        const d = gp.doors.byId.get(t.doorId!)!;
        this.jobs.push({ kind: "use", find: () => this.doorLeaf(d), say: t.label.startsWith("Sortie") ? "Ouvre la porte (barre anti-panique)" : `Déverrouille : ${t.label}`, done: () => !d.locked, skip: () => !d.locked });
        if (d.lock === "planks" || d.lock === "chain") this.jobs.push({ kind: "use", find: () => this.doorLeaf(d), say: "Ouvre la porte", done: () => gp.doors.wideOpen(d), skip: () => gp.doors.wideOpen(d) });
        return;
      }
      case "power": {
        for (const i of [0, 1]) this.jobs.push({ kind: "use", find: () => this.byId(`fuse_socket_${i}`), say: `Fusible ${i + 1}/2`, done: () => gp.powerSys.installed[i]!, skip: () => gp.powerSys.installed[i]! });
        this.jobs.push({ kind: "use", find: () => this.byId("power_lever"), say: "Rétablit le courant", done: () => gp.powerSys.on, skip: () => gp.powerSys.on });
        return;
      }
      case "gateBox": {
        this.jobs.push({ kind: "use", find: () => this.byId("gate_box"), say: "Badge au boîtier du portail", done: () => gp.hud.keypad.isOpen || gp.exits.gateOpen, skip: () => gp.exits.gateOpen });
        this.jobs.push({ kind: "type", code: t.code ?? "", say: `Tape le code ${t.code ?? ""}` });
        this.jobs.push({ kind: "wait", until: () => gp.exits.gateOpen, max: 3, say: "Le portail s'ouvre" });
        return;
      }
      case "gateExit": {
        const mg = EXTERIOR.mainGate;
        this.jobs.push({ kind: "straight", to: V((mg.x0 + mg.x1) / 2, 0, EXTERIOR.fence.minZ - 2.5), tol: 0.3, crouch: false, say: "Franchit le portail", until: () => gp.exits.finished });
        return;
      }
      case "bayChain":
        this.jobs.push({ kind: "use", find: () => this.byId("bay_chain"), say: "Coupe la chaîne", done: () => gp.exits.bayOpen, skip: () => gp.exits.bayOpen });
        return;
      case "hood":
        this.jobs.push({ kind: "use", find: () => this.byId("amb_hood"), say: "Installe la batterie", done: () => gp.exits.batteryInstalled, skip: () => gp.exits.batteryInstalled });
        return;
      case "start":
        this.jobs.push({ kind: "use", find: () => this.byId("amb_door"), say: "Démarre l'ambulance", done: () => gp.exits.finished });
        return;
      case "ladder":
        this.jobs.push({ kind: "straight", to: V(ROOF_EXIT.x + 0.9, gp.world.floorY("R"), ROOF_EXIT.z), tol: 0.2, crouch: false, say: "Descend par l'échelle", until: () => gp.exits.finished });
        return;
    }
  }

  // ================================================================ cibles

  private byId(id: string): Interactable | null {
    return this.gp.interaction.list.find((x) => x.id === id) ?? null;
  }

  /** Vantail visable d'une porte (le plus proche). */
  private doorLeaf(d: Door): Interactable | null {
    const prefix = `door_${d.id}_`;
    let best: Interactable | null = null;
    let bd = Infinity;
    const p = this.player;
    for (const it of this.gp.interaction.list) {
      if (!it.id.startsWith(prefix)) continue;
      const c = center(it.shape());
      const dd = Math.hypot(c.x - p.x, c.z - p.z);
      if (dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  /** Objet ramassable d'un type, actif, le plus proche d'un point. */
  private itemTarget(type: ItemId, near: Vector3): Interactable | null {
    const prefix = `item_${type}_`;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.gp.interaction.list) {
      if (!it.id.startsWith(prefix) || !it.active(this.gp)) continue;
      const c = center(it.shape());
      const dd = Math.hypot(c.x - near.x, c.z - near.z) + Math.abs(c.y - near.y) * 0.3;
      if (dd < bd) {
        bd = dd;
        best = it;
      }
    }
    return best;
  }

  // ================================================================ boucle

  private hold(a: Action): void {
    this.want.add(a);
  }

  /** Une frame de pilotage : pose les entrées simulées et oriente la caméra. */
  update(dt: number): void {
    if (this.status.phase !== "running") return;
    this.clock = this.time();
    this.want.clear();
    if (this.player.controlEnabled || this.gp.vaults.busy) this.tick(dt);
    // fronts propres : on n'envoie que les changements de maintien
    if (this.status.phase === "running") for (const a of HELD) this.input.synthHold(a, this.want.has(a));
    if (DEBUG.enabled && ++this.traceN % 6 === 0) {
      const p = this.player;
      const j = this.job;
      this.trace.push(`${this.clock.toFixed(1)} (${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) yaw=${p.rig.yaw.toFixed(2)} pit=${p.rig.pitch.toFixed(2)} v=${p.speed.toFixed(1)} ${j?.kind ?? "-"}:${this.status.doing} st=${this.stage} cur=${this.gp.interaction.current?.id ?? "-"} want=${[...this.want].join("+")}`);
      if (this.trace.length > 80) this.trace.shift();
    }
  }

  private tick(dt: number): void {
    for (let guard = 0; guard < 8; guard++) {
      if (!this.job) {
        this.job = this.jobs.shift() ?? null;
        this.jt = 0;
        this.stage = 0;
        this.stageT = 0;
        this.tries = 0;
        this.path = [];
        this.bestLeft = Infinity;
        this.noProgress = 0;
        this.stuckTotal = 0;
        this.detour = null;
        this.detourT = 0;
        this.typed = 0;
        this.typeT = 0;
        if (!this.job) {
          this.stop("done");
          return;
        }
      }
      const finished = this.run(this.job, dt);
      if (!finished) break;
      this.job = null;
      if (this.status.phase !== "running") return;
    }
  }

  /** Exécute le job courant ; true quand il est terminé (on enchaîne dans la même frame). */
  private run(job: Job, dt: number): boolean {
    this.jt += dt;
    this.stageT += dt;
    const gp = this.gp;
    switch (job.kind) {
      case "stepDone":
        this.status.step = Math.min(job.index + 1, this.route!.steps.length - 1);
        return true;
      case "pace": {
        if (this.clock >= job.at) return true;
        this.status.doing = "…";
        this.idleLook(dt);
        return false;
      }
      case "select": {
        const inv = gp.inventory;
        const slot = inv.slots.findIndex((s) => s?.item === job.item);
        if (slot < 0 || slot === inv.selected) return true;
        if (this.jt > 2.5) return this.fail(`impossible de choisir l'emplacement (${ITEMS[job.item].name})`);
        if (this.stageT < 0.1) return false;
        this.stageT = 0;
        // les touches d'emplacement sont ignorées tant qu'un clavier à code (ou une note) est ouvert
        if (gp.hud.keypad.isOpen || gp.hud.note.isOpen) this.input.synthTap("interact");
        else this.input.synthTap(slot === 0 ? "slot1" : "slot2");
        return false;
      }
      case "wait": {
        this.status.doing = job.say;
        if (job.until()) return true;
        if (this.jt > job.max) return this.fail(`${job.say} : trop long`);
        this.idleLook(dt);
        return false;
      }
      case "type": {
        this.status.doing = job.say;
        const kp = gp.hud.keypad;
        if (!kp.isOpen) return this.typed > 0 || this.jt > 1.5;
        if (this.jt > 6) return this.fail(`${job.say} : le clavier ne répond pas`);
        this.typeT += dt;
        if (this.typed < job.code.length && this.typeT >= 0.12) {
          // chiffre refusé (clavier encore verrouillé) : on réessaie à la frame suivante
          if (kp.press(job.code[this.typed]!)) this.typed++;
          this.typeT = 0;
        }
        return this.typed >= job.code.length && this.typeT > 0.1;
      }
      case "goto":
        this.status.doing = job.say;
        return this.goto(job, dt);
      case "straight": {
        this.status.doing = job.say;
        if (job.until?.()) return true;
        return this.straight(job.to, job.tol, job.crouch, dt);
      }
      case "use":
        this.status.doing = job.say;
        return this.use(job, dt);
    }
  }

  private fail(why: string): boolean {
    this.stop("failed", why);
    return false;
  }

  // ================================================================ caméra

  private viewTo(yaw: number, pitch: number, dt: number, rate = 7): number {
    const rig = this.player.rig;
    const dy = wrap(yaw - rig.yaw);
    const dp = pitch - rig.pitch;
    const k = 1 - Math.exp(-dt * 14);
    const maxY = rate * dt;
    rig.yaw = wrap(rig.yaw + Math.max(-maxY, Math.min(maxY, dy * Math.max(k, Math.min(1, maxY / Math.max(1e-6, Math.abs(dy)))))));
    const maxP = rate * 0.7 * dt;
    rig.pitch += Math.max(-maxP, Math.min(maxP, dp));
    return Math.max(Math.abs(wrap(yaw - rig.yaw)), Math.abs(pitch - rig.pitch));
  }

  private aimAt(c: Vector3, dt: number): number {
    const cam = this.player.rig.camera.position;
    const dx = c.x - cam.x;
    const dy = c.y - cam.y;
    const dz = c.z - cam.z;
    return this.viewTo(Math.atan2(dx, dz), -Math.atan2(dy, Math.hypot(dx, dz)), dt);
  }

  /** À l'arrêt : regard posé devant soi. */
  private idleLook(dt: number): void {
    this.viewTo(this.player.rig.yaw, 0.1, dt, 3);
  }

  // ================================================================ déplacement

  private get pos(): Vector3 {
    const p = this.player;
    return V(p.x, p.y, p.z);
  }

  /** L'objet est-il à portée et visé sans obstacle depuis l'œil actuel ? */
  private canUse(it: Interactable | null): boolean {
    if (!it || !it.active(this.gp)) return false;
    const cam = this.player.rig.camera.position;
    const c = center(it.shape());
    const dx = c.x - cam.x;
    const dy = c.y - cam.y;
    const dz = c.z - cam.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > (it.range ?? CONFIG.player.interactRange) - 0.25 || d < 1e-3) return false;
    const hit = this.gp.interaction.pick(this.gp, cam.x, cam.y, cam.z, dx / d, dy / d, dz / d);
    return hit === it || (hit !== null && it.id.startsWith("door_") && hit.id.slice(0, hit.id.lastIndexOf("_")) === it.id.slice(0, it.id.lastIndexOf("_")));
  }

  /** Suit la navmesh jusqu'à `to` (sprint, portes, obstacles bas). */
  private goto(job: Extract<Job, { kind: "goto" }>, dt: number): boolean {
    const { to, tol } = job;
    const p = this.player;
    const here = this.pos;
    const d2 = Math.hypot(to.x - here.x, to.z - here.z);
    if (d2 < tol && Math.abs(to.y - here.y) < 1.4) return true;
    if (job.reach && d2 < 2.5 && Math.abs(to.y - here.y) < 1.4 && this.canUse(job.reach())) return true;
    this.pathAge += dt;
    const sameGoal = this.pathTo.subtract(to).lengthSquared() <= 0.01;
    if (!this.path.length || this.pathAge > 0.6 || !sameGoal) {
      const fresh = this.nav.path(here, to, NavFlags.WALK | NavFlags.JUMP);
      let keep = false;
      if (sameGoal && this.path.length > 1 && fresh.length > 1) {
        // hystérésis : deux chemins presque aussi longs → on garde le sien (sinon on hésite entre
        // les deux, parfois à travers une porte), sauf si le nouveau est nettement plus court
        const { seg, t } = this.project(here);
        const a = this.path[seg - 1]!;
        const b = this.path[seg]!;
        const off = Math.hypot(here.x - (a.x + (b.x - a.x) * t), here.z - (a.z + (b.z - a.z) * t));
        let freshLen = 0;
        for (let i = 1; i < fresh.length; i++) freshLen += Math.hypot(fresh[i]!.x - fresh[i - 1]!.x, fresh[i]!.z - fresh[i - 1]!.z);
        keep = off < 0.8 && freshLen > this.lookahead(here, 0).left - 1.5;
      }
      if (!keep) this.path = fresh.length ? fresh : [to];
      this.pathTo = to.clone();
      this.pathAge = 0;
    }
    // point visé : un peu plus loin sur le chemin (poursuite)
    const { point, left } = this.lookahead(here, p.stamina.sprinting ? 1.4 : 1.0);
    const door = this.closedDoorAhead(here);
    if (door) {
      this.jobs.unshift(this.job!);
      this.job = { kind: "use", find: () => this.doorLeaf(door), say: "Ouvre la porte", done: () => this.gp.doors.wideOpen(door) };
      this.jt = 0;
      this.stage = 0;
      this.stageT = 0;
      this.tries = 0;
      return false;
    }
    // vantail ouvert en travers du chemin (la navmesh ne le connaît pas) : on le contourne par son
    // bout libre ; s'il n'y a pas la place (couloir étroit), on referme la porte
    if (!this.detour) {
      const hit = this.leafOnPath(here);
      if (hit) {
        const tip = this.leafTip(hit.door, hit.leaf, here);
        const q = this.nav.closest(tip, NavFlags.WALK);
        if (Number.isFinite(q.x) && Math.hypot(q.x - tip.x, q.z - tip.z) < 0.2 && Math.abs(q.y - here.y) < 0.6) this.detour = tip;
        else if (this.closeLeaf(job, hit.door, hit.leaf)) return false;
      }
    }
    if (this.detour) {
      if (Math.hypot(this.detour.x - here.x, this.detour.z - here.z) < 0.35 || this.detourT > 2.5) {
        this.detour = null;
        this.detourT = 0;
        this.path = [];
      } else {
        this.detourT += dt;
        this.progress(left, dt);
        this.move(this.detour, dt, false, false);
        return false;
      }
    }
    this.progress(left, dt);
    const crouch = this.barrierNear(here, point);
    this.move(this.avoidTraps(here, point), dt, crouch, left > 2.5);
    return false;
  }

  /** Piège armé juste devant, trop près de la trajectoire : on décale la visée pour l'éviter. */
  private avoidTraps(here: Vector3, target: Vector3): Vector3 {
    const dx = target.x - here.x;
    const dz = target.z - here.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return target;
    const ux = dx / len;
    const uz = dz / len;
    for (const t of this.gp.traps.armedSpots()) {
      if (Math.abs(t.y - here.y) > 0.6) continue;
      const along = (t.x - here.x) * ux + (t.z - here.z) * uz;
      if (along < -0.2 || along > 2.2) continue;
      const lat = (t.x - here.x) * -uz + (t.z - here.z) * ux;
      if (Math.abs(lat) > 0.8) continue;
      // on passe du côté opposé au piège (ou du côté où il y a de la place)
      let side = lat > 0 ? -1 : 1;
      const probe = (s: number) => {
        const c = V(t.x - uz * s * 0.85, here.y, t.z + ux * s * 0.85);
        const q = this.nav.closest(c, NavFlags.WALK);
        return Number.isFinite(q.x) && Math.hypot(q.x - c.x, q.z - c.z) < 0.15;
      };
      if (!probe(side) && probe(-side)) side = -side;
      return V(t.x - uz * side * 0.85 + ux * 0.6, target.y, t.z + ux * side * 0.85 + uz * 0.6);
    }
    return target;
  }

  /** Tout droit (sans navmesh) jusqu'à `to`. */
  private straight(to: Vector3, tol: number, crouch: boolean, dt: number): boolean {
    const here = this.pos;
    const d = Math.hypot(to.x - here.x, to.z - here.z);
    if (d < tol) return true;
    this.progress(d, dt);
    this.move(to, dt, crouch, false);
    return false;
  }

  /** Avance vers un point : lacet vers la cible, avant maintenu si on est à peu près aligné. */
  private move(target: Vector3, dt: number, crouch: boolean, sprint: boolean): void {
    const p = this.player;
    if (crouch) this.hold("crouch");
    const yaw = Math.atan2(target.x - p.x, target.z - p.z);
    this.viewTo(yaw, 0.08, dt, 9);
    if (this.unstick > 0) {
      // manœuvre de dégagement : recul en crabe
      this.unstick -= dt;
      this.hold("back");
      this.hold(this.unstickDir > 0 ? "right" : "left");
      return;
    }
    const yawErr = Math.abs(wrap(yaw - p.rig.yaw));
    if (yawErr < 1.1) this.hold("forward");
    if (sprint && !crouch && yawErr < 0.5) this.hold("sprint");
  }

  /** Détection de blocage : pas de progrès → on recalcule, puis on se dégage. */
  private progress(left: number, dt: number): void {
    if (left < this.bestLeft - 0.2) {
      this.bestLeft = left;
      this.noProgress = 0;
      this.stuckTotal = 0;
      return;
    }
    this.noProgress += dt;
    // temps écoulé depuis le dernier vrai progrès (les manœuvres ne le remettent pas à zéro)
    this.stuckTotal += dt;
    if (this.noProgress > 1.2) {
      this.noProgress = 0;
      this.bestLeft = left;
      this.path = [];
      const cur = this.job;
      const leaf = cur?.kind === "goto" ? this.leafInTheWay() : null;
      // vantail ouvert de notre côté : on le referme, la porte se rouvrira vers l'autre côté
      if (leaf && cur?.kind === "goto" && this.closeLeaf(cur, leaf)) return;
      this.unstick = 0.35;
      this.unstickDir = -this.unstickDir;
    }
    if (this.stuckTotal > 12) this.fail(`bloqué (${this.status.doing})`);
  }

  /** Projection du joueur sur le chemin : segment (indice de fin) et position sur ce segment. */
  private project(here: Vector3): { seg: number; t: number } {
    const path = this.path;
    let best = 1;
    let bestT = 0;
    let bd = Infinity;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const l2 = abx * abx + abz * abz;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((here.x - a.x) * abx + (here.z - a.z) * abz) / l2)) : 1;
      const d = Math.hypot(here.x - (a.x + abx * t), here.z - (a.z + abz * t)) + Math.abs(here.y - (a.y + (b.y - a.y) * t)) * 0.5;
      if (d < bd - 1e-6) {
        bd = d;
        best = i;
        bestT = t;
      }
    }
    return { seg: best, t: bestT };
  }

  /** Les `dist` prochains mètres du chemin, depuis la position du joueur. */
  private ahead(here: Vector3, dist: number): Vector3[] {
    const path = this.path;
    const pts: Vector3[] = [here];
    if (path.length < 2) {
      if (path[0]) pts.push(path[0]);
      return pts;
    }
    const { seg, t } = this.project(here);
    const a = path[seg - 1]!;
    const b = path[seg]!;
    pts.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t));
    let acc = 0;
    for (let i = seg; i < path.length && acc < dist; i++) {
      const last = pts[pts.length - 1]!;
      acc += Math.hypot(path[i]!.x - last.x, path[i]!.z - last.z);
      pts.push(path[i]!);
    }
    return pts;
  }

  /** Point à `dist` m devant le joueur sur le chemin, et longueur restante. */
  private lookahead(here: Vector3, dist: number): { point: Vector3; left: number } {
    const path = this.path;
    if (path.length < 2) {
      const q = path[0] ?? here;
      return { point: q, left: Math.hypot(q.x - here.x, q.z - here.z) };
    }
    const { seg: best, t: bestT } = this.project(here);
    // on avance le long du chemin depuis la projection du joueur
    let rest = dist;
    let point: Vector3 | null = null;
    let left = 0;
    for (let i = best; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const k0 = i === best ? bestT : 0;
      const sx = a.x + (b.x - a.x) * k0;
      const sy = a.y + (b.y - a.y) * k0;
      const sz = a.z + (b.z - a.z) * k0;
      const len = Math.hypot(b.x - sx, b.z - sz);
      left += len;
      if (point) continue;
      if (len >= rest) {
        const k = rest / Math.max(1e-6, len);
        point = V(sx + (b.x - sx) * k, sy + (b.y - sy) * k, sz + (b.z - sz) * k);
      } else rest -= len;
    }
    return { point: point ?? path[path.length - 1]!, left };
  }

  /** Porte ordinaire fermée sur les ~2 prochains mètres du chemin ? */
  private closedDoorAhead(here: Vector3): Door | null {
    const doors = this.gp.doors;
    const pts = this.ahead(here, 2.6);
    for (const d of doors.doors) {
      if (d.swing || d.locked || doors.wideOpen(d)) continue;
      const o = d.o;
      if (Math.abs(o.y - here.y) > 1.5 || Math.hypot(o.x - here.x, o.z - here.z) > 3.2) continue;
      const side = (q: Vector3) => (o.axis === "x" ? q.z - o.z : q.x - o.x);
      // on est franchement d'un côté, assez près pour l'atteindre sans se coller au vantail
      const s0 = side(here);
      if (Math.abs(s0) < 0.25 || Math.abs(s0) > 1.9) continue;
      // le chemin passe vraiment de l'autre côté (pas un simple frôlement de l'embrasure)
      let crossAt: number | null = null;
      let beyond = false;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const sa = side(a);
        const sb = side(b);
        if (crossAt === null && sa * s0 > 0 && sb * s0 <= 0) {
          const t = sa / (sa - sb || 1e-9);
          crossAt = o.axis === "x" ? a.x + (b.x - a.x) * t - o.x : a.z + (b.z - a.z) * t - o.z;
        }
        if (crossAt !== null && sb * s0 < 0 && Math.abs(sb) > 0.3) {
          beyond = true;
          break;
        }
      }
      if (crossAt !== null && beyond && Math.abs(crossAt) <= o.width / 2 + 0.1) return d;
    }
    return null;
  }

  /** Point de contournement : un peu au-delà du bout libre du vantail (capsule du joueur). */
  private leafTip(d: Door, l: Door["leaves"][number], here: Vector3): Vector3 {
    const s = Math.sin(d.angle);
    const c = Math.cos(d.angle);
    const vx = l.dx * c + d.nx * s;
    const vz = l.dz * c + d.nz * s;
    return V(l.hx + vx * (l.width + 0.55), here.y, l.hz + vz * (l.width + 0.55));
  }

  /**
   * Referme une porte dont le vantail (de notre côté) barre le passage ; elle se rouvrira vers
   * l'autre côté si le chemin la traverse. Une seule fois par côté et par trajet (anti-boucle).
   */
  private closeLeaf(job: Extract<Job, { kind: "goto" }>, d: Door, leaf?: Door["leaves"][number]): boolean {
    const p = this.player;
    const across = (p.x - d.o.x) * d.nx + (p.z - d.o.z) * d.nz;
    const side = across >= 0 ? 1 : -1;
    const key = `${d.id}:${side > 0 ? "B" : "A"}`;
    const toggled = (job.toggled ??= new Set());
    if (toggled.has(key)) return false;
    toggled.add(key);
    // on se place hors du balayage du vantail (au-delà de son bout une fois fermé, de notre côté),
    // sinon il nous repousse de l'autre côté de la porte en se refermant
    const l = leaf ?? d.leaves.reduce((a, b) => (Math.hypot(a.hx - p.x, a.hz - p.z) < Math.hypot(b.hx - p.x, b.hz - p.z) ? a : b));
    const spot = V(l.hx + l.dx * (l.width + 0.45) + d.nx * side * 0.75, p.y, l.hz + l.dz * (l.width + 0.45) + d.nz * side * 0.75);
    const q = this.nav.closest(spot, NavFlags.WALK);
    // terminé quand le vantail est revenu dans le mur (sinon, en repartant, on se fait balayer)
    this.jobs.unshift(
      { kind: "use", find: () => this.doorLeaf(d), say: "Referme la porte qui gêne", done: () => !this.gp.doors.wideOpen(d) && Math.abs(d.angle) < 0.08, settled: () => !this.gp.doors.wideOpen(d) },
      job,
    );
    if (Number.isFinite(q.x) && Math.hypot(q.x - spot.x, q.z - spot.z) < 0.3 && Math.abs(q.y - p.y) < 0.6) {
      this.job = { kind: "straight", to: q, tol: 0.25, crouch: false, say: "Se décale pour refermer la porte" };
    } else this.job = this.jobs.shift()!;
    this.jt = 0;
    this.stage = 0;
    this.stageT = 0;
    this.tries = 0;
    return true;
  }

  /** Vantail d'une porte ouverte de notre côté qui coupe les ~2,5 prochains mètres du chemin. */
  private leafOnPath(here: Vector3): { door: Door; leaf: Door["leaves"][number] } | null {
    const doors = this.gp.doors;
    // depuis la projection sur le chemin : le début du chemin peut être resté derrière nous
    const pts = this.ahead(here, 2.5).slice(1);
    for (const d of doors.doors) {
      if (d.swing || d.locked || !doors.wideOpen(d)) continue;
      const o = d.o;
      if (Math.abs(o.y - here.y) > 1.5 || Math.hypot(o.x - here.x, o.z - here.z) > 4) continue;
      // seulement du côté du vantail (de l'autre côté, il est derrière la porte : il ne gêne pas)
      const across = (here.x - o.x) * d.nx + (here.z - o.z) * d.nz;
      if (Math.abs(across) > 0.15 && Math.sign(across) !== Math.sign(d.target)) continue;
      for (const l of d.leaves) {
        for (let i = 1; i < pts.length; i++) {
          if (segmentHitsBox(pts[i - 1]!.x, pts[i - 1]!.z, pts[i]!.x, pts[i]!.z, l.collider, 0.25)) return { door: d, leaf: l };
        }
      }
    }
    return null;
  }

  /** Porte grande ouverte de notre côté, tout près : son vantail peut barrer le chemin. */
  private leafInTheWay(): Door | null {
    const p = this.player;
    const doors = this.gp.doors;
    for (const d of doors.doors) {
      if (d.swing || d.locked || !doors.wideOpen(d)) continue;
      const o = d.o;
      if (Math.abs(o.y - p.y) > 1.5 || Math.hypot(o.x - p.x, o.z - p.z) > 2.4) continue;
      const side = (p.x - o.x) * d.nx + (p.z - o.z) * d.nz >= 0 ? 1 : -1;
      const leafSide = d.target > 0 ? 1 : -1;
      if (side === leafSide) return d;
    }
    return null;
  }

  /** Obstacle bas (gravats, brancards, arbre) tout près : on s'accroupit. */
  private barrierNear(here: Vector3, ahead: Vector3): boolean {
    for (const bar of this.gp.world.layout.barriers) {
      const y = this.gp.world.floorY(bar.floor);
      if (Math.abs(here.y - y) > 1.2) continue;
      const [x0, z0, x1, z1] = bar.area;
      const m = 0.75;
      for (const q of [here, ahead]) {
        if (q.x > x0 - m && q.x < x1 + m && q.z > z0 - m && q.z < z1 + m) return true;
      }
    }
    return false;
  }

  // ================================================================ interaction

  private use(job: Extract<Job, { kind: "use" }>, dt: number): boolean {
    const gp = this.gp;
    const input = this.input;
    if (this.stage === 0 && job.skip?.()) return true;
    if (job.done() && this.stage > 0) return true;
    // note ou clavier encore ouverts : un appui les referme (et consomme l'interaction de la frame)
    if ((gp.hud.note.isOpen || gp.hud.keypad.isOpen) && this.stage === 0) {
      if (this.stageT > 0.05) {
        input.synthTap("interact");
        this.stageT = 0;
      }
      return false;
    }
    const it = job.find();
    if (!it) {
      if (this.jt > 2) return this.fail(`${job.say} : introuvable`);
      return false;
    }
    const c = center(it.shape());
    const err = this.aimAt(c, dt);
    const cur = gp.interaction.current;
    const onTarget = cur === it || (it.id.startsWith("door_") && cur !== null && cur.id.slice(0, cur.id.lastIndexOf("_")) === it.id.slice(0, it.id.lastIndexOf("_")));
    const prompt = it.prompt(gp);
    const p = this.player;
    const far = Math.hypot(c.x - p.x, c.z - p.z);
    switch (this.stage) {
      case 0: {
        // viser
        if (onTarget && err < 0.12 && prompt?.enabled) {
          this.stage = 1;
          this.stageT = 0;
          return false;
        }
        // visé mais refusé (objet manquant…) : inutile d'insister
        if (onTarget && err < 0.12 && prompt && !prompt.enabled && this.stageT > 1.2) return this.fail(`${job.say} : ${prompt.text}`);
        // trop loin ou masqué : on s'approche un peu
        if (this.stageT > 0.7 && far > 0.9) {
          this.hold("forward");
          if (this.stageT > 2.2) this.hold("crouch");
        }
        if (this.stageT > 3.2) {
          // dernier recours : le joueur aurait pu le faire d'ici (prompt actif)
          if (prompt?.enabled && far < 2.6) {
            it.interact(gp);
            console.info(`pilote auto : interaction forcée (${it.id})`);
            this.stage = 3;
            this.stageT = 0;
            return false;
          }
          return this.fail(`${job.say} : impossible à viser`);
        }
        return false;
      }
      case 1: {
        // agir : appui simple ou maintien
        const hold = prompt?.hold ?? 0;
        if (!prompt?.enabled) {
          if (this.stageT > 1.5) return this.fail(`${job.say} : action refusée (${prompt?.text ?? "?"})`);
          return false;
        }
        if (hold <= 0) {
          input.synthTap("interact");
          this.stage = 3;
          this.stageT = 0;
          return false;
        }
        this.hold("interact");
        if (this.stageT > hold + 0.2) {
          this.stage = 3;
          this.stageT = 0;
        }
        return false;
      }
      default: {
        // vérifier l'effet
        if (job.done()) return true;
        if (job.settled?.()) {
          if (this.stageT > 3) return this.fail(`${job.say} : trop long`);
          return false;
        }
        if (this.stageT > 0.5) {
          if (++this.tries > 3) return this.fail(`${job.say} : sans effet`);
          this.stage = 0;
          this.stageT = 0;
        }
        return false;
      }
    }
  }
}
