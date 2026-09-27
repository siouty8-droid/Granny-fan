import { FLICKER_SLOTS } from "../../../render/BakedLightPlugin";
import type { PropDef } from "../PropSystem";
import * as ext from "./exterior";
import * as fx from "./fixtures";
import * as furn from "./furniture";
import * as med from "./medical";
import * as tech from "./technical";

/** Toutes les définitions de props (y compris les variantes émissives par canal de clignotement). */
export function allPropDefs(): PropDef[] {
  const defs: PropDef[] = [
    med.bed,
    med.stretcher,
    med.wheelchair,
    med.ivStand,
    med.curtain,
    med.trolley,
    med.autopsyTable,
    med.morgueLockers,
    med.surgicalLamp,
    med.opTable,
    med.xray,
    med.crib,
    med.teddy,
    furn.chairBlue,
    furn.chairOrange,
    furn.chairRow,
    furn.desk,
    furn.officeChair,
    furn.wardrobe,
    furn.lockerBank,
    furn.shelf,
    furn.cafeteriaTable,
    furn.pew,
    furn.vending,
    furn.reception,
    furn.deadPlant,
    furn.boxes,
    furn.trashBags,
    furn.washer,
    furn.laundryCart,
    furn.tvWall,
    furn.sink,
    furn.debris,
    furn.papers,
    furn.folders,
    tech.boiler,
    tech.elecCabinet,
    tech.generator,
    tech.workbench,
    tech.pipes,
    tech.pipesVertical,
    tech.medCabinet,
    fx.neonHousing,
    fx.neonHanging,
    fx.bulbCage,
    fx.emergencyBox,
    ext.dumpster,
    ext.streetLamp,
    ext.bush,
    ext.benchExt,
    ext.bollard,
    ext.acUnit,
    ext.carWreck("car_red", [0.45, 0.12, 0.1], true),
    ext.carWreck("car_gray", [0.45, 0.47, 0.48], false),
    ext.carWreck("car_blue", [0.15, 0.22, 0.38], true),
    ext.deadTree("tree_a", 11, 6),
    ext.deadTree("tree_b", 97, 5),
    ext.deadTree("tree_c", 1234, 7),
  ];
  // variantes émissives
  for (const state of ["on", "off"]) {
    defs.push(fx.neonTube(`neon_tube_${state}`, `neon_${state}`));
    defs.push(fx.bulb(`bulb_${state}`, `bulb_${state}`));
    defs.push(ext.lampHead(`lamp_head_${state}`, `lamp_${state}`));
  }
  for (let s = 1; s < FLICKER_SLOTS; s++) {
    defs.push(fx.neonTube(`neon_tube_f${s}`, `neon_f${s}`));
    defs.push(fx.bulb(`bulb_f${s}`, `bulb_f${s}`));
    defs.push(ext.lampHead(`lamp_head_f${s}`, `lamp_f${s}`));
  }
  defs.push(fx.emergencyLens("emerg_lens_green", "emerg_green"));
  defs.push(fx.emergencyLens("emerg_lens_red", "emerg_red"));
  defs.push(fx.exitSign("exit_sign", "exit_sign"));
  return defs;
}
