import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "../config";
import type { Input } from "../core/Input";
import { keyLabel, type Action } from "../core/KeyBindings";
import type { Settings } from "../core/Settings";
import type { CollisionWorld } from "../physics/CollisionWorld";
import type { Player } from "../player/Player";
import type { MaterialLibrary } from "../render/materials/MaterialLibrary";
import type { RunManager } from "../run/RunManager";
import type { HUD } from "../ui/HUD";
import type { Portal } from "../world/builder/ArchitectureBuilder";
import type { PropInstance, PropSystem } from "../world/props/PropSystem";
import type { World } from "../world/World";
import { Anchors, floorFree } from "./Anchors";
import { Rng, randomSeed } from "../core/Rng";
import type { GameContext } from "./Context";
import { ITEMS, type ItemId } from "./data/items";
import { CODE_LABELS, CODE_NOTES, LORE_NOTES, SAFES, revealed, type CodeId } from "./data/spawns";
import { DoorSystem } from "./Doors";
import { Elevator } from "./Elevator";
import { ExitSystem } from "./Exits";
import { HidingSystem } from "./Hiding";
import { InteractionSystem } from "./Interaction";
import { Inventory } from "./Inventory";
import { ItemSystem, type WorldItem, type WorldNote } from "./Items";
import { doorPropDefs } from "./models/doors";
import { itemPropDefs } from "./models/items";
import { mechanismPropDefs } from "./models/mechanisms";
import { NoiseBus } from "./Noise";
import { Emitter } from "../core/Events";

export interface SfxEvent {
  name: string;
  x: number;
  y: number;
  z: number;
  param: string;
}
import { PowerSystem } from "./Power";
import { JournalTracker } from "./Journal";
import { SafeSystem } from "./Safes";
import { buildRoomGraph, guardedAreas, planRun, type SpawnPlan } from "./SpawnPlanner";
import { VaultSystem } from "./Vaults";
import { TrapSystem, trapPropDefs } from "./Traps";

export interface GameplayDeps {
  scene: Scene;
  world: World;
  collision: CollisionWorld;
  materials: MaterialLibrary;
  player: Player;
  run: RunManager;
  hud: HUD;
  settings: Settings;
  onFinish: (exitId: string, label: string) => void;
}

/**
 * Orchestrateur du gameplay : objets, portes, coffres, courant, ascenseur, sorties, cachettes,
 * fenêtres, inventaire. Construit une fois (avant le bake), remis à zéro à chaque run.
 */
export class Gameplay implements GameContext {
  readonly world: World;
  readonly collision: CollisionWorld;
  readonly props: PropSystem;
  readonly player: Player;
  readonly run: RunManager;
  readonly hud: HUD;
  readonly inventory = new Inventory();
  readonly noise = new NoiseBus();
  /** évènements sonores (branchés sur le moteur audio) */
  readonly sounds = new Emitter<{ sfx: SfxEvent }>();
  /** chiffres connus par code (« • » = inconnu) */
  readonly knownCodes = new Map<CodeId, string>();
  readonly interaction = new InteractionSystem();
  readonly anchors: Anchors;
  readonly items: ItemSystem;
  readonly doors: DoorSystem;
  readonly safes: SafeSystem;
  readonly powerSys: PowerSystem;
  readonly elevator: Elevator;
  readonly exits: ExitSystem;
  readonly hiding: HidingSystem;
  readonly vaults: VaultSystem;
  readonly traps: TrapSystem;
  readonly journal = new JournalTracker();
  private journalRefresh = 0;
  now = 0;
  time = 0;
  plan: SpawnPlan | null = null;
  private readonly settings: Settings;
  private readonly onFinish: GameplayDeps["onFinish"];
  private readonly edges: ReturnType<typeof buildRoomGraph>;
  /** zones verrouillées (toujours au moins un objet / une note utile dedans) */
  readonly guarded: string[][];
  private readonly codeNotes = new Map<string, WorldNote>();
  private readonly loreNotes: WorldNote[] = [];
  private readonly picked = new Set<ItemId>();
  private keypadAt: { x: number; y: number; z: number } | null = null;
  private keypadCloseAt = 0;

  constructor(d: GameplayDeps) {
    this.world = d.world;
    this.collision = d.collision;
    this.props = d.world.props;
    this.player = d.player;
    this.run = d.run;
    this.hud = d.hud;
    this.settings = d.settings;
    this.onFinish = d.onFinish;
    for (const def of [...itemPropDefs(), ...doorPropDefs(), ...mechanismPropDefs(), ...trapPropDefs()]) this.props.register(def);

    // systèmes (création des instances AVANT le bake : elles ont leur éclairage précalculé)
    this.items = new ItemSystem(d.scene, d.world, this.props, () => d.materials.items());
    this.doors = new DoorSystem(d.world, this.props);
    this.safes = new SafeSystem(d.world, this.props);
    this.powerSys = new PowerSystem(d.world, this.props);
    this.elevator = new Elevator(d.world, this.props);
    this.exits = new ExitSystem(d.world, this.props);
    this.vaults = new VaultSystem(d.world);
    this.hiding = new HidingSystem(d.world, this.props, d.world.hiding);
    this.traps = new TrapSystem(d.world, this.props);
    const statics: PropInstance[] = [...this.safes.bodies, this.powerSys.board, ...this.exits.staticProps];
    this.props.buildColliders(d.collision, statics);

    // points d'apparition (après les colliders : les points au sol évitent les meubles)
    this.anchors = new Anchors(d.world, d.collision);
    if (this.anchors.warnings.length) console.info("Ancres :", this.anchors.warnings.join(" · "));

    for (const n of CODE_NOTES) this.codeNotes.set(n.id, this.items.addNote(n.id, n.author, n.text, CODE_LABELS[n.code], n));
    for (const n of LORE_NOTES) this.loreNotes.push(this.items.addNote(n.id, n.author, n.text, "", null));

    this.edges = buildRoomGraph(d.world.layout, d.world.openings);
    this.guarded = guardedAreas(d.world.layout, this.edges, "g_hall");

    this.interaction.addAll(this.items.interactables((it) => this.pickup(it)));
    this.interaction.addAll(this.doors.interactables());
    this.interaction.addAll(this.safes.interactables());
    this.interaction.addAll(this.powerSys.interactables());
    this.interaction.addAll(this.elevator.interactables());
    this.interaction.addAll(this.exits.interactables());
    this.interaction.addAll(this.vaults.interactables());
    this.interaction.addAll(this.hiding.interactables());

    this.items.onRead = (n) => this.readNote(n);
    const keypad = (title: string, code: CodeId, check: (code: string) => boolean, x: number, y: number, z: number) => this.openKeypad(title, code, check, x, y, z);
    this.safes.openKeypad = keypad;
    this.exits.openKeypad = keypad;
    this.safes.onOpen = (id) => this.items.openSafes.add(id);
    this.doors.sound = (n, x, y, z) => this.sfx(n, x, y, z);
    this.elevator.sound = (n, x, y, z) => this.sfx(n, x, y, z);
    this.hud.keypad.onSound = (n, p) => this.sfx(n, this.player.x, this.player.y + 1.4, this.player.z, p);
    this.powerSys.onPower = () => this.elevator.setPower(true);
    // les pas du joueur sont des bruits (l'IA les entend selon la surface et l'allure)
    this.player.on("footstep", (e) => this.noise.make(e.x, e.y, e.z, e.noiseRadius, "step", true, `${e.mode}:${e.surface}`));
  }

  /** Après le bake : colliders dynamiques (portes, cabine, portails) — ils n'occultent pas la lumière. */
  afterBake(): void {
    this.doors.addColliders();
    this.elevator.addColliders();
    this.exits.addColliders();
  }

  // ------------------------------------------------------------------ GameContext

  get power(): boolean {
    return this.powerSys.on;
  }

  sfx(name: string, x: number, y: number, z: number, param = ""): void {
    this.sounds.emit("sfx", { name, x, y, z, param });
  }

  toast(text: string, seconds?: number): void {
    this.hud.toast(text, seconds);
  }

  split(id: string, label: string): void {
    this.run.split(id, label, this.now);
  }

  keyLabel(action: Action): string {
    const s = this.settings.data;
    const [a, b] = s.bindings[action];
    return keyLabel(a || b, s.layout);
  }

  itemName(id: ItemId): string {
    return ITEMS[id].name;
  }

  hudBusy(): boolean {
    return this.hiding.hidden || this.vaults.busy;
  }

  finish(exitId: string, label: string): void {
    this.onFinish(exitId, label);
  }

  // ------------------------------------------------------------------ run

  /** Nouvelle run : répartition des objets selon la seed, tout remis à zéro. */
  reset(): void {
    const t0 = performance.now();
    const plan = planRun(this.run.rng, this.edges, (spot) => spot.split(":")[0]!, "g_hall", this.guarded);
    this.plan = plan;
    this.items.clear();
    const perSafe = new Map<string, number>();
    for (const p of plan.items) {
      if (p.spot.startsWith("safe_")) {
        const safe = SAFES.find((s) => s.id === p.spot)!;
        const k = perSafe.get(safe.id) ?? 0;
        perSafe.set(safe.id, k + 1);
        const slot = this.anchors.safeSlots(safe)[k % 3]!;
        this.items.place(p.item, slot, safe.id);
      } else {
        this.items.place(p.item, this.anchors.get(p.spot));
      }
    }
    for (const [id, spot] of plan.notes) {
      const note = this.codeNotes.get(id)!;
      const def = CODE_NOTES.find((n) => n.id === id)!;
      note.text = def.text.replace("{digits}", revealed(plan.codes.get(def.code)!, def.part));
      this.items.placeNote(note, this.anchors.get(spot));
    }
    LORE_NOTES.forEach((n, i) => this.items.placeNote(this.loreNotes[i]!, this.anchors.get(n.spot)));
    this.doors.reset();
    this.safes.reset(plan.codes);
    this.powerSys.reset();
    this.elevator.reset();
    this.exits.reset(plan.codes.get("gate")!);
    this.hiding.reset(this);
    this.vaults.reset();
    this.traps.reset(this.run.setup.difficulty, this.run.rng.fork("traps"));
    this.inventory.reset();
    this.knownCodes.clear();
    this.noise.reset();
    this.interaction.reset();
    this.picked.clear();
    this.journal.reset();
    this.closeOverlays();
    this.time = 0;
    if (plan.attempts > 12 || performance.now() - t0 > 20) console.info(`Répartition : ${plan.attempts} tirage(s), ${Math.round(performance.now() - t0)} ms`);
  }

  /** Retour au menu : on retire les objets du décor. */
  clear(): void {
    this.items.clear();
    this.hiding.reset(this);
    this.closeOverlays();
    this.hud.setPrompt("", false);
  }

  private closeOverlays(): void {
    this.hud.keypad.close();
    this.hud.note.close();
    this.hud.hideOverlay.hide();
    this.hud.journal.close();
    this.keypadAt = null;
  }

  // ------------------------------------------------------------------ actions

  private pickup(it: WorldItem): void {
    const inv = this.inventory;
    const id = it.item;
    if (inv.slotFor(id) >= 0) {
      inv.add(id);
      this.items.take(it);
    } else {
      // échange avec l'emplacement sélectionné : l'ancien objet prend la place du nouveau
      const sel = inv.takeSelected();
      const x = it.x;
      const y = it.y;
      const z = it.z;
      this.items.take(it);
      inv.add(id);
      if (sel) for (let k = 0; k < sel.count; k++) this.items.drop(sel.item, x, y, z, it.baseYaw, x + k * 0.1, y, z + k * 0.06);
    }
    this.noise.make(it.x, it.y, it.z, 2, "pickup");
    this.sfx("pickup", it.x, it.y, it.z, ITEMS[id].sound);
    if (!this.picked.has(id)) {
      this.picked.add(id);
      this.split(`item_${id}`, ITEMS[id].name);
      this.toast(`${ITEMS[id].name} — ${ITEMS[id].hint}`, 2.6);
    }
  }

  private dropSelected(): void {
    const p = this.player;
    const item = this.inventory.takeOneSelected();
    if (!item) return;
    if (!this.items.drop(item, p.x, p.y, p.z, p.rig.yaw)) {
      this.inventory.add(item);
      this.toast("Pas de place pour poser ça ici.", 1.4);
      return;
    }
    // l'objet posé reste dans le carnet (« posé »)
    const placed = this.items.items.find((x) => x.item === item && x.inWorld && Math.hypot(x.x - p.x, x.z - p.z) < 2.5);
    if (placed) {
      this.journal.markDropped(placed);
      this.journal.update(1e3, this);
    }
    this.noise.make(p.x, p.y, p.z, item === "battery" || item === "boltCutter" || item === "crowbar" ? 7 : 3, "drop");
    this.sfx("drop", p.x, p.y + 0.1, p.z, item === "battery" ? "heavy" : item === "boltCutter" || item === "crowbar" ? "metal" : "small");
  }

  private readNote(n: WorldNote): void {
    const def = n.codeOf;
    let digits: string | null = null;
    if (def && this.plan) {
      digits = revealed(this.plan.codes.get(def.code)!, def.part);
      const prev = this.knownCodes.get(def.code) ?? "••••";
      const merged = [...prev].map((c, i) => (c === "•" ? digits![i]! : c)).join("");
      if (merged !== prev) {
        this.knownCodes.set(def.code, merged);
        this.toast(`Code noté — ${CODE_LABELS[def.code]} : ${merged}`, 2);
      }
    }
    this.journal.notesRead.add(n.id);
    this.sfx("paper", n.x, n.y, n.z);
    this.hud.note.open(n.author, n.text, digits, `${this.keyLabel("interact")} : fermer`, n.x, n.y, n.z);
  }

  private openKeypad(title: string, code: CodeId, check: (code: string) => boolean, x: number, y: number, z: number): void {
    const known = this.knownCodes.get(code);
    const memo = known ? `Code noté : ${known}` : null;
    this.keypadAt = { x, y, z };
    this.keypadCloseAt = 0;
    this.hud.keypad.open(title, memo, `Chiffres (rangée du haut ou pavé) · ${this.keyLabel("interact")} : fermer`, (entry) => {
      const ok = check(entry);
      if (ok) this.keypadCloseAt = this.now + 650;
      return ok;
    });
  }

  // ------------------------------------------------------------------ boucle

  update(dt: number, now: number, input: Input): void {
    this.now = now;
    this.time += dt;
    const p = this.player;
    let consumed = false;

    // panneaux ouverts : fermeture (touche d'interaction ou éloignement)
    const hud = this.hud;
    if (hud.note.isOpen) {
      const a = hud.note.at;
      if (input.wasPressed("interact") || Math.hypot(p.x - a.x, p.z - a.z) > 2.6 || Math.abs(p.y - a.y) > 2) {
        hud.note.close();
        consumed = true;
      }
    }
    if (hud.keypad.isOpen) {
      const a = this.keypadAt;
      const far = a ? Math.hypot(p.x - a.x, p.z - a.z) > 2.4 : true;
      if (input.wasPressed("interact") || far || (this.keypadCloseAt && now >= this.keypadCloseAt) || this.hiding.hidden) {
        hud.keypad.close();
        this.keypadAt = null;
        consumed = true;
      }
    }

    this.hiding.update(dt, this, input);
    this.vaults.update(dt, this);
    this.interaction.suspended = consumed || hud.keypad.isOpen || this.hiding.hidden || this.vaults.busy;
    this.interaction.update(this, input, dt);

    // inventaire
    if (p.controlEnabled && !hud.keypad.isOpen) {
      if (input.wasPressed("slot1")) this.inventory.select(0);
      if (input.wasPressed("slot2")) this.inventory.select(1);
      const wheel = input.consumeWheel();
      if (wheel) this.inventory.cycle(wheel > 0 ? 1 : -1);
      if (input.wasPressed("drop")) this.dropSelected();
    }

    this.doors.update(dt, this);
    this.safes.update(dt);
    this.powerSys.update(dt);
    this.elevator.update(dt);
    this.exits.update(dt, this);
    this.traps.update(dt, this);

    // carnet : repérage continu, ouverture / fermeture (le jeu continue)
    this.journal.update(dt, this);
    if (input.wasPressed("journal") && (p.controlEnabled || this.hiding.hidden)) {
      if (hud.journal.isOpen) hud.journal.close();
      else {
        hud.journal.open(`${this.keyLabel("journal")} : fermer`);
        this.journalRefresh = 0;
        this.sfx("paper", p.x, p.y + 1.2, p.z);
      }
    }
    if (hud.journal.isOpen) {
      this.journalRefresh -= dt;
      if (this.journalRefresh <= 0) {
        this.journalRefresh = CONFIG.journal.refresh;
        hud.journal.render(this.journal.build(this));
      }
    }

    const keys = [this.keyLabel("slot1"), this.keyLabel("slot2")];
    hud.setInventory(this.inventory.slots, this.inventory.selected, keys.slice(0, CONFIG.inventory.slots));
  }

  /** Pendant les cinématiques : seules les animations des mécanismes avancent. */
  cinemaUpdate(dt: number, now: number): void {
    this.now = now;
    this.time += dt;
    this.doors.update(dt, this);
    this.safes.update(dt);
    this.powerSys.update(dt);
    this.elevator.update(dt);
    this.exits.update(dt, this);
  }

  /** Après le placement de la caméra : objets (rotation, halos). */
  lateUpdate(): void {
    const cam = this.player.rig.camera;
    this.items.update(this.time, cam.position.x, cam.position.y, cam.position.z, cam.rotation);
  }

  isPortalOpen(p: Portal): boolean {
    const o = p.opening;
    if (!o) return true;
    if (o.kind === "elevator") return this.elevator.isPortalOpen(p);
    if (o.kind === "door" || o.kind === "double") return this.doors.isPortalOpen(p);
    return true;
  }

  // ------------------------------------------------------------------ debug

  /** Résumé de la répartition (tests). */
  debugPlan(): string {
    if (!this.plan) return "";
    const items = this.plan.items.map((p) => `${p.item}@${p.spot}`).join(", ");
    const notes = [...this.plan.notes].map(([k, v]) => `${k}@${v}`).join(", ") + " codes " + [...this.plan.codes].map(([k, v]) => `${k}=${v}`).join(",");
    return `${items} | ${notes} | exits ${this.plan.exits.join("/")} (${this.plan.attempts})`;
  }

  /**
   * Tests : place le joueur face à un point (à `dist` m, sol libre, visée non occultée) et
   * renvoie le texte de l'invite visée (ou null).
   */
  debugApproach(x: number, y: number, z: number, dist = 1.2, preferX?: number, preferZ?: number): string | null {
    const p = this.player;
    const base = preferX !== undefined && preferZ !== undefined ? Math.atan2(preferX - x, preferZ - z) : 0;
    const room = this.world.roomAt(x, y, z);
    const floor = room ? this.world.floorY(room.floor) : 0;
    for (const d of [dist, dist + 0.4, dist - 0.3, dist + 0.8]) {
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const px = x + Math.sin(a) * d;
        const pz = z + Math.cos(a) * d;
        const g = this.world.collisionGround(px, pz, y + 0.6);
        if (!Number.isFinite(g) || Math.abs(g - floor) > 0.05) continue;
        if (!floorFree(this.collision, px, g, pz, 0.32, 1.8)) continue;
        const eye = g + CONFIG.player.eyeStand;
        const yaw = Math.atan2(x - px, z - pz);
        const pitch = Math.atan2(eye - y, Math.hypot(x - px, z - pz));
        p.teleport(px, g, pz, yaw, pitch);
        p.updateView(0);
        const cam = p.rig.camera.position;
        const dx = x - cam.x;
        const dy = y - cam.y;
        const dz = z - cam.z;
        const l = Math.hypot(dx, dy, dz);
        const it = this.interaction.pick(this, cam.x, cam.y, cam.z, dx / l, dy / l, dz / l);
        if (it) return it.prompt(this)?.text ?? "";
      }
    }
    return null;
  }

  /** Tests : statistiques du planificateur sur `n` seeds aléatoires. */
  debugPlanStats(n = 200): string {
    const hist = new Map<number, number>();
    let fail = 0;
    const where = new Map<string, number>();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const plan = planRun(new Rng(randomSeed(8)), this.edges, (spot) => spot.split(":")[0]!, "g_hall", this.guarded);
      hist.set(plan.attempts, (hist.get(plan.attempts) ?? 0) + 1);
      if (plan.exits.length < 3) fail++;
      for (const it of plan.items) where.set(`${it.item}@${it.spot}`, (where.get(`${it.item}@${it.spot}`) ?? 0) + 1);
    }
    const ms = (performance.now() - t0) / n;
    return `attempts ${[...hist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ")} · échecs ${fail} · ${ms.toFixed(2)} ms/plan · spots ${where.size}`;
  }

  /**
   * Tests : estimation grossière de la route (tournée gloutonne spawn → objectifs → sortie,
   * distance « Manhattan » avec pénalité d'étage, 6 m/s + temps d'interaction).
   */
  debugRouteEstimate(): string {
    const plan = this.plan;
    if (!plan) return "";
    const pos = (spot: string): [number, number, number] => {
      if (spot.startsWith("safe_")) {
        const s = SAFES.find((x) => x.id === spot)!;
        const room = this.world.layout.rooms.find((r) => r.id === s.room)!;
        return [s.x, this.world.floorY(room.floor), s.z];
      }
      const a = this.anchors.get(spot);
      return [a.x, a.y, a.z];
    };
    const itemSpot = (id: ItemId) => plan.items.filter((p) => p.item === id).map((p) => p.spot);
    const noteSpot = (id: string) => plan.notes.get(id)!;
    const dist = (a: [number, number, number], b: [number, number, number]) => (Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2])) * 1.15 + Math.abs(a[1] - b[1]) * 5;
    const tour = (targets: Array<[number, number, number]>, end: [number, number, number]): number => {
      let cur: [number, number, number] = [this.world.spawn.x, 0, this.world.spawn.z];
      const left = [...targets];
      let d = 0;
      while (left.length) {
        let bi = 0;
        for (let i = 1; i < left.length; i++) if (dist(cur, left[i]!) < dist(cur, left[bi]!)) bi = i;
        d += dist(cur, left[bi]!);
        cur = left.splice(bi, 1)[0]!;
      }
      return d + dist(cur, end);
    };
    const safeNeeds = (spot: string): string[] => {
      if (!spot.startsWith("safe_")) return [];
      const s = SAFES.find((x) => x.id === spot)!;
      return s.lock === "code" ? CODE_NOTES.filter((n) => n.code === s.code).map((n) => noteSpot(n.id)) : itemSpot("safeKey");
    };
    const need = (ids: ItemId[], notes: string[], extra: Array<[number, number, number]>): Array<[number, number, number]> => {
      const spots = new Set<string>();
      for (const id of ids) for (const sp of itemSpot(id)) {
        spots.add(sp);
        for (const x of safeNeeds(sp)) spots.add(x);
      }
      for (const n of notes) spots.add(noteSpot(n));
      return [...[...spots].map(pos), ...extra];
    };
    const gate = tour(need(["badgeRed"], ["note_gate_a", "note_gate_b"], []), [40.5, 0, -33]);
    const amb = tour(need(["boltCutter", "battery", "ambulanceKeys"], [], [[95.5, 0, 30]]), [89, 0, 31]);
    const roof = tour(need(["fuse", "crowbar"], [], [[75.5, -4, 53]]), [79.5, 8, 8.5]) + 10;
    const t = (d: number, n: number) => Math.round(d / 6 + n * 2.5);
    return `gate ${Math.round(gate)} m ≈ ${t(gate, 3)} s · ambulance ${Math.round(amb)} m ≈ ${t(amb, 5)} s · roof ${Math.round(roof)} m ≈ ${t(roof, 7)} s`;
  }

  /** Donne un objet (tests). */
  debugGive(id: ItemId): void {
    const it = this.items.items.find((x) => x.item === id && x.inWorld);
    if (it) this.items.take(it);
    this.inventory.add(id);
  }
}
