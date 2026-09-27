import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Monster } from "../ai/Monster";
import { CONFIG } from "../config";
import type { Gameplay } from "../gameplay/Gameplay";
import { EXTERIOR } from "../world/builder/ExteriorBuilder";
import type { Director, Script } from "./Director";

/** Services des cinématiques (acteurs, sons). */
export interface CineCtx {
  gp: Gameplay;
  monster: Monster;
  director: Director;
  /** son ponctuel (branché par le moteur audio) */
  sound: (name: string, x: number, y: number, z: number) => void;
}

const easeInOut = (u: number) => u * u * (3 - 2 * u);

/**
 * Intro (~37 s) : la voiture du pote devant l'hôpital, l'échange, la traversée du parking,
 * l'entrée, la porte qui claque, la silhouette au bout du couloir. Noir → contrôle + chrono.
 */
export function introScript(c: CineCtx): Script {
  const gp = c.gp;
  const main = gp.doors.byId.get("g_main_entrance")!;
  const sp = CONFIG.ai.spawn;
  const car = EXTERIOR.buddyCar;
  let mt = 0;
  const monsterAt = new Vector3(sp.x, sp.y, sp.z);
  let monsterYaw = sp.yaw;
  const camTarget = new Vector3(40.5, 1.64, 3.2);
  return {
    fadeIn: 1.4,
    fadeOut: 1.2,
    shots: [
      {
        dur: 8,
        keys: [
          { t: 0, pos: [53, 1.5, -46.5], look: [40, 5, -6] },
          { t: 8, pos: [47, 1.7, -44.8], look: [39.5, 4, -8] },
        ],
        events: [
          [0, () => c.monster.hide()],
          [0.2, () => c.sound("engine_idle", car.x, 0.6, car.z)],
        ],
        lines: [
          [1.2, "mehdi", "Saint-Aubin… Fermé depuis trois ans. T'es vraiment obligé ?", 1.6],
          [5.0, "leo", "Une photo du bloc opératoire. Une seule. Et je ressors.", 1.2],
        ],
      },
      {
        dur: 8.5,
        keys: [
          { t: 0, pos: [34.2, 1.25, -41.9], look: [40.5, 1.0, -38.2] },
          { t: 8.5, pos: [36.8, 1.15, -41.4], look: [41, 1.1, -38] },
        ],
        lines: [
          [0.4, "mehdi", "Le gardien repasse à minuit. Je te laisse dix minutes. Pas une de plus.", 1.4],
          [5.2, "leo", "Dix minutes. Laisse tourner le moteur.", 1.4],
        ],
        events: [[7.6, () => c.sound("car_door", car.x, 1, car.z)]],
      },
      {
        dur: 8,
        walkBob: 0.045,
        flashlight: true,
        keys: [
          { t: 0, pos: [40.2, 1.62, -30.6], look: [40.4, 1.8, -20] },
          { t: 4.5, pos: [40.5, 1.62, -12], look: [40.5, 1.9, 0] },
          { t: 8, pos: [40.5, 1.62, -2.2], look: [40.5, 1.6, 6] },
        ],
        lines: [
          [0.4, "far", "Et tu ramènes rien de là-dedans, hein !", 1.2],
          [3.6, "thought", "On entre. Une photo. On ressort.", 1.4],
        ],
        events: [
          [0.1, () => c.sound("flashlight", 40.5, 1.5, -30)],
          [5.6, () => {
            gp.doors.open(main, 40.5, -6);
            c.sound("door_open", 40.5, 1, 0);
          }],
        ],
      },
      {
        dur: 6,
        walkBob: 0.03,
        flashlight: true,
        keys: [
          { t: 0, pos: [40.5, 1.62, -2.2], look: [40.5, 1.6, 7] },
          { t: 1.6, pos: [40.5, 1.62, 1.9], look: [40.5, 1.7, 9] },
          { t: 2.1, pos: [40.5, 1.6, 2.2], look: [40.2, 1.6, 7] },
          { t: 2.7, pos: [40.5, 1.58, 2.3], look: [40.6, 1.2, -2] },
          { t: 5.2, pos: [40.5, 1.6, 2.4], look: [40.4, 1.3, -2] },
          { t: 6, pos: [40.5, 1.62, 2.6], look: [40.2, 1.5, 3] },
        ],
        events: [
          [1.9, () => {
            main.speed = 12;
            main.target = 0;
            c.director.shake(1.2);
            c.sound("slam", 40.5, 1.2, 0);
          }],
          [2.6, () => c.sound("maglock", 40.5, 2.2, 0)],
        ],
        lines: [[3.0, "leo", "Hé…! Elle s'est verrouillée toute seule ?!", 1.2]],
      },
      {
        dur: 7,
        flashlight: true,
        keys: [
          { t: 0, pos: [40.5, 1.63, 2.8], look: [40.4, 1.7, 8], fov: 90 },
          { t: 1.2, pos: [40.5, 1.64, 3.2], look: [40.5, 1.85, 18], fov: 84 },
          { t: 4.2, pos: [40.5, 1.64, 3.2], look: [40.5, 1.8, 18.3], fov: 52 },
          { t: 7, pos: [40.5, 1.64, 3.2], look: [39.8, 1.75, 18.3], fov: 60 },
        ],
        lines: [[1.4, "leo", "… Il y a quelqu'un ?", 2.2]],
        events: [
          [2.4, () => c.sound("monster_breath", sp.x, 1.8, sp.z)],
          [4.4, () => c.sound("monster_growl", sp.x, 1.8, sp.z)],
        ],
        update: (t, dt) => {
          mt += dt;
          // il fixe la caméra, tête penchée, puis se détourne et s'enfonce dans le couloir
          if (t < 4.4) {
            c.monster.cinematic(dt, mt, monsterAt.x, monsterAt.y, monsterAt.z, monsterYaw, "idle", 0, camTarget);
          } else {
            const u = Math.min(1, (t - 4.4) / 0.8);
            monsterYaw = Math.PI + (-Math.PI / 2 - Math.PI) * easeInOut(u);
            const speed = u >= 1 ? 1.3 : 0.4;
            if (u >= 1) monsterAt.x -= speed * dt;
            c.monster.cinematic(dt, mt, monsterAt.x, monsterAt.y, monsterAt.z, monsterYaw, "walk", speed, u < 1 ? camTarget : null);
          }
        },
      },
    ],
    finalize: () => {
      main.target = 0;
      main.angle = 0;
      main.speed = 5;
      gp.doors.update(0, gp);
      if (monsterAt.x === sp.x) monsterAt.x -= 2.5;
      c.monster.cinematic(0.016, mt, monsterAt.x, monsterAt.y, monsterAt.z, -Math.PI / 2, "walk", 1.3, null);
      c.monster.resumeAfterCinematic();
    },
  };
}

/** Fin commune : la voiture repart dans la rue (vers l'ouest). */
function driveAway(c: CineCtx, from: number, t: number, dur: number): void {
  const u = Math.min(1, Math.max(0, t / dur));
  const x = from - 32 * u * u;
  c.gp.exits.moveCar(x, EXTERIOR.buddyCar.z, EXTERIOR.buddyCar.yaw);
}

/** Outro de la sortie par le portail. */
export function outroGate(c: CineCtx): Script {
  const car = EXTERIOR.buddyCar;
  let mt = 0;
  return {
    fadeIn: 0.6,
    fadeOut: 1.4,
    shots: [
      {
        dur: 5.5,
        keys: [
          { t: 0, pos: [45, 1.5, -42.5], look: [40.5, 1.4, -32] },
          { t: 5.5, pos: [44, 1.4, -41.5], look: [40.5, 1.2, -34] },
        ],
        lines: [
          [0.4, "mehdi", "LÉO ! Monte, monte, MONTE !", 0.8],
          [2.8, "leo", "Démarre ! Il est juste derrière moi !", 1.0],
        ],
        events: [[4.6, () => c.sound("car_door", car.x, 1, car.z)]],
        update: (_t, dt) => {
          mt += dt;
          c.monster.cinematic(dt, mt, 40.5, 0, -30.6, Math.PI, "idle", 0, new Vector3(car.x, 1, car.z));
        },
      },
      {
        dur: 6.5,
        keys: [
          { t: 0, pos: [30, 1.1, -40.5], look: [40.5, 1.0, -38.2] },
          { t: 6.5, pos: [29, 1.2, -41], look: [22, 1.0, -38.2] },
        ],
        lines: [
          [0.6, "mehdi", "C'était quoi, ça ?! C'ÉTAIT QUOI ?!", 0.8],
          [3.6, "leo", "Roule. Et ne te retourne pas.", 1.6],
        ],
        events: [[0.1, () => c.sound("car_leave", car.x, 0.5, car.z)]],
        update: (t, dt) => {
          mt += dt;
          driveAway(c, car.x, t, 6.5);
          c.monster.cinematic(dt, mt, 40.5, 0, -31, Math.PI, "idle", 0, null);
        },
      },
    ],
    finalize: () => undefined,
  };
}

/** Outro de la sortie en ambulance. */
export function outroAmbulance(c: CineCtx): Script {
  const a = EXTERIOR.ambulance;
  const car = EXTERIOR.buddyCar;
  return {
    fadeIn: 0.6,
    fadeOut: 1.4,
    shots: [
      {
        dur: 5,
        keys: [
          { t: 0, pos: [101, 1.3, 23.5], look: [90, 1.4, 30] },
          { t: 5, pos: [102, 1.3, 24.5], look: [104, 1.2, 30] },
        ],
        lines: [[0.6, "leo", "Allez… allez… ALLEZ !", 1.0]],
        events: [
          [0.1, () => c.sound("ambulance_start", a.x, 1, a.z)],
          [1.6, () => c.sound("siren", a.x, 2, a.z)],
        ],
        update: (t) => {
          const u = Math.min(1, t / 5);
          c.gp.exits.moveAmbulance(a.x + 30 * u * u, a.z, a.yaw);
        },
      },
      {
        dur: 7,
        keys: [
          { t: 0, pos: [43.5, 1.4, -45.2], look: [62, 1.4, -38.5] },
          { t: 7, pos: [42.5, 1.35, -45.4], look: [44, 1.2, -38.4] },
        ],
        lines: [
          [1.6, "mehdi", "Une AMBULANCE ?! T'as volé une ambulance ?!", 1.0],
          [4.4, "leo", "Suis-moi. On la lâche au bout de la rue.", 1.6],
        ],
        update: (t) => {
          // l'ambulance arrive par la rue et s'arrête derrière la voiture
          const u = Math.min(1, t / 3.2);
          const x = 112 - (112 - 50) * (1 - (1 - u) * (1 - u));
          const leave = t > 5 ? 32 * ((t - 5) / 2) ** 2 : 0;
          c.gp.exits.moveAmbulance(x - leave, car.z, -Math.PI / 2);
          if (t > 5) driveAway(c, car.x, t - 5, 2);
        },
      },
    ],
    finalize: () => undefined,
  };
}

/** Outro de la sortie par le toit. */
export function outroRoof(c: CineCtx): Script {
  const car = EXTERIOR.buddyCar;
  let mt = 0;
  return {
    fadeIn: 0.6,
    fadeOut: 1.4,
    shots: [
      {
        dur: 5.5,
        keys: [
          { t: 0, pos: [87, 1.6, 3.5], look: [80.2, 6.5, 8.5] },
          { t: 5.5, pos: [86.5, 1.5, 4.5], look: [80.2, 3.5, 8.5] },
        ],
        lines: [[0.5, "thought", "Descends. Ne regarde pas en haut.", 1.6]],
        events: [[0.2, () => c.sound("ladder", 80.2, 5, 8.5)]],
        update: (t, dt) => {
          mt += dt;
          if (t > 2.6) c.monster.cinematic(dt, mt, 79.3, 8, 8.5, Math.PI / 2, "idle", 0, new Vector3(86.5, 1.5, 4.5));
        },
      },
      {
        dur: 7,
        keys: [
          { t: 0, pos: [99, 1.4, -44], look: [94, 1.3, -36] },
          { t: 7, pos: [98, 1.3, -44.5], look: [80, 1.1, -38.5] },
        ],
        lines: [
          [0.5, "mehdi", "Par ici ! Saute le grillage !", 1.0],
          [3.0, "leo", "Plus jamais d'urbex. Plus jamais.", 0.8],
          [5.0, "mehdi", "…On en reparlera. ROULE.", 1.0],
        ],
        events: [[4.4, () => c.sound("car_leave", 92, 0.5, car.z)]],
        update: (t) => {
          const x = t < 4.4 ? 92 : 92 - 40 * ((t - 4.4) / 2.6) ** 2;
          c.gp.exits.moveCar(x, car.z, car.yaw);
        },
      },
    ],
    finalize: () => undefined,
  };
}

export function outroScript(exitId: string, c: CineCtx): Script {
  if (exitId === "ambulance") return outroAmbulance(c);
  if (exitId === "roof") return outroRoof(c);
  return outroGate(c);
}
