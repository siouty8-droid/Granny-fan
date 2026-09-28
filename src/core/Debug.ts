/** Drapeaux de debug (URL : ?debug=1). */
const params = new URLSearchParams(window.location.search);

export const DEBUG = {
  enabled: params.has("debug"),
  /** ne pas exiger le pointer lock (tests automatisés / navigateurs headless) */
  noPointerLock: params.has("nolock"),
  /** lance directement une run au démarrage */
  autostart: params.has("autostart"),
  /** saute l'intro */
  skipIntro: params.has("skipintro"),
  /** preset forcé */
  preset: params.get("preset"),
  seed: params.get("seed"),
  /** éclairage plein jour pour inspecter la géométrie */
  bright: params.has("bright"),
  /** désactive le culling par portails */
  noCull: params.has("nocull"),
  /** désactive la résolution dynamique (captures reproductibles) */
  fixedRes: params.has("fixedres"),
  /** entraînement avec pilote auto (?autopilot, ?autopilot=gate|ambulance|roof) */
  autopilot: params.has("autopilot") ? ((["gate", "ambulance", "roof"] as const).find((e) => e === params.get("autopilot")) ?? ("best" as const)) : null,
  /** modificateurs imposés (?mods=battery,fog…) */
  mods: params.has("mods") ? (params.get("mods") ?? "").split(",").filter(Boolean) : null,
};
