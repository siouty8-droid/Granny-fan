import { SAFES } from "./spawns";

/** Tableau à fusibles du local électrique (dos au mur nord, façade vers le sud). */
export const FUSE_PANEL = { room: "b_electric", x: 75.5, z: 53.88, yaw: Math.PI };

export interface Reservation {
  room: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Emplacements réservés AVANT l'habillage des pièces (coffres, tableau électrique) :
 * le décor ne doit ni les recouvrir ni en bloquer l'accès.
 */
export function gameplayReservations(): Reservation[] {
  const out: Reservation[] = [];
  const around = (room: string, x: number, z: number, yaw: number, hw: number, depth: number, front: number) => {
    // rectangle couvrant l'objet (dos au mur) + dégagement devant
    const fx = Math.round(Math.sin(yaw));
    const fz = Math.round(Math.cos(yaw));
    const pts: Array<[number, number]> = [];
    for (const a of [-hw, hw]) {
      for (const d of [-depth / 2, depth / 2 + front]) {
        // axe latéral = (fz, -fx)
        pts.push([x + fz * a + fx * d, z - fx * a + fz * d]);
      }
    }
    out.push({
      room,
      x0: Math.min(...pts.map((p) => p[0])),
      z0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      z1: Math.max(...pts.map((p) => p[1])),
    });
  };
  for (const s of SAFES) around(s.room, s.x, s.z, s.yaw, 0.45, 0.7, 0.9);
  // tableau : le pivot est contre le mur, l'armoire fait 0.27 de profondeur
  const f = FUSE_PANEL;
  around(f.room, f.x, f.z - 0.14, f.yaw, 0.75, 0.28, 1.2);
  return out;
}
