# PLAN — « Granny-fan » : speedrun d'horreur dans un hôpital abandonné

Jeu d'horreur FPS orienté speedrun (inspiré de Granny / Piggy), 100 % généré par le code
(géométrie, textures, personnages, animations, sons, UI) avec **Vite + TypeScript strict + Babylon.js 9**.

Règles de travail :
- Travail phase par phase. Une phase est cochée seulement si `npm run build` passe sans erreur
  **et** que le jeu se lance (vérifié en Chromium headless via un script Playwright + captures).
- Toutes les valeurs d'équilibrage sont dans `src/config.ts`.
- Code découpé en modules (pas de fichier géant), `strict: true`.
- Chaque compromis technique est noté dans la section « Compromis » en bas de ce fichier.

---

## Architecture cible (vue d'ensemble)

```
src/
  main.ts                 point d'entrée (boot, écran de chargement, App)
  config.ts               TOUT l'équilibrage (joueur, IA, timer, notes, audio, graphismes…)
  core/                   App (machine à états), Input (AZERTY/QWERTY/remap, souris brute),
                          Settings/Storage (localStorage), Rng (seed), Events
  physics/                colliders (boîtes orientées + rampes), grille spatiale, capsule
  player/                 contrôleur FPS, jauge de sprint, accroupi, lampe torche, bruit
  run/                    timer performance.now(), splits, notes Z→F, records/PB, RunManager
  world/                  layout de l'hôpital (données), builders (murs/sols/escaliers/extérieur),
                          zones + portails, décoration, props procéduraux, baking de lumière
  render/                 textures procédurales, matériaux PBR, plugin « baked light »,
                          culling par zones, post-process, presets, résolution dynamique
  gameplay/               objets, inventaire (2 slots), portes/serrures, coffres, notes,
                          cachettes, sorties, interactions
  ai/                     monstre : mesh skinné procédural, squelette, animations + IK,
                          navmesh (Recast V2), perception, machine à états, pièges
  cinematics/             réalisateur de cinématiques (caméra scriptée), intro, outros
  audio/                  synthèse WebAudio (DSP maison), banque de sons, ambiance, musique
  ui/                     menus DOM/CSS, HUD, pause, résultats, dialogues, keypad…
```

Principes de perf (cible : 60 fps en 1080p Medium sur Ryzen 5 5500U / Vega 7) :
- **Une seule lumière dynamique avec ombres** : la lampe torche (spot, shadow map 512→2048 selon preset).
- Éclairage des néons **précalculé au chargement** (irradiance + AO + ombres de contact par sommet,
  via une grille de voxels d'occlusion) et injecté dans le PBR par un `MaterialPlugin`.
- Géométrie statique **fusionnée par zone et par matériau**, props répétés en **thin instances**,
  matériaux **gelés**, culling **par zones/portails**.
- Textures générées une fois (canvas 2D → textures GPU), atlas pour les props et decals.

---

## Phase 1 — Setup, boucle, contrôleur joueur, caméra, menu de base
**Objectifs**
- Projet Vite + TS strict + Babylon.js 9 (WebGL2), scripts `dev` / `build` / `preview` / `typecheck`.
- Boucle de jeu : update à pas variable découpé en sous-pas (≤ 1/120 s) pour la physique,
  rendu à chaque frame d'affichage.
- Input : pointer lock avec `unadjustedMovement` (souris brute, sans lissage/accélération),
  rotation caméra appliquée à chaque frame, sensibilité décimale, inversion Y, FOV.
  Clavier AZERTY par défaut (ZQSD), preset QWERTY, touches remappables (basé sur `KeyboardEvent.code`).
- Contrôleur capsule maison : collisions contre boîtes orientées (XZ) + sols/rampes,
  marche d'escalier, gravité, accroupi (passer sous des obstacles), sprint à jauge
  (activable seulement jauge pleine, dure jusqu'à vide, puis recharge), bruit émis.
- Lampe torche (F) : spot + ombres, décalée « en main » pour des ombres visibles.
- Restart instantané (maintien R 0,5 s) avec indicateur.
- Menu principal de base + écran de chargement + niveau de test.

**Fichiers** : `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`,
`src/config.ts`, `src/core/*`, `src/physics/*`, `src/player/*`, `src/ui/*`, `src/world/TestLevel.ts`.

**Validation** : build OK ; le jeu se lance ; on se déplace dans la salle de test sans traverser
les murs, on monte une rampe/escalier, on s'accroupit sous un obstacle, le sprint suit la règle de jauge.

## Phase 2 — Timer, splits, notes, seed, écran de fin
**Objectifs**
- `RunTimer` basé sur `performance.now()` (jamais de somme de deltas), en ms, pause qui gèle le
  temps (et masque l'écran), affichage `m:ss.t` en jeu et `m:ss.cc` à la fin.
- Démarrage exactement à la frame de prise de contrôle ; arrêt à la frame du trigger de sortie.
- Limite 10:00 (run perdue), lockdown à 8:00 (hook d'événement).
- Splits dynamiques (label d'objectif) comparés au PB : vert si en avance, rouge si en retard.
- Notes Z/S/A/B/C/D/E/F (seuils dans `config.ts`).
- Seed : PRNG déterministe (hash de chaîne → sfc32), modes Random / Set Seed, flux dérivés
  (spawns, codes, IA) ; la décoration utilise une seed fixe (carte toujours reconnaissable).
- Records par difficulté × mode de seed (PB, meilleure note, splits du PB) en localStorage.
- Écran de fin : temps, grosse animation de la lettre, splits, comparaison PB, seed, difficulté, sortie.
- Menu pause (écran masqué), menu « Jouer » (difficulté + seed), écran Records.

**Fichiers** : `src/run/*`, `src/core/Rng.ts`, `src/ui/ResultsScreen.ts`, `src/ui/PauseMenu.ts`,
`src/ui/PlayMenu.ts`, `src/ui/RecordsMenu.ts`.

**Validation** : build OK ; une run de test (trigger de sortie dans la salle de test) produit un
temps, une note et des splits cohérents ; le PB est sauvegardé puis comparé à la run suivante.

## Phase 3 — Génération de l'hôpital
**Objectifs**
- Layout **conçu à la main mais décrit en données** (pièces, couloirs, portes, fenêtres, escaliers,
  ascenseur, conduits, barrières) sur 3 niveaux + extérieur + toit :
  - Sous-sol : morgue, chaufferie, archives, local électrique, couloirs techniques étroits.
  - RDC : hall d'accueil (spawn), urgences, salle d'attente, cafétéria (+ cuisine), bureaux,
    vestiaires, cour intérieure / jardin.
  - Étage : chambres, bloc opératoire, radiologie, pédiatrie, bureau du directeur.
  - Extérieur : parking + ambulance, grilles, portail principal, rue (voiture du pote), toit / hélistation.
- Builder : rasterisation des pièces sur grille 1 m → murs aux frontières (une face par zone),
  ouvertures de portes/fenêtres, sols/plafonds par pièce, escaliers en U (visuel marches + collision rampe),
  cage d'ascenseur, extérieur (sol, clôtures, bâtiment vu de dehors).
- Colliders générés automatiquement ; zones (une par pièce/couloir) reliées par des portails.

**Fichiers** : `src/world/layout/*`, `src/world/builder/*`, `src/world/Zones.ts`, `src/world/World.ts`.

**Validation** : build OK ; on peut parcourir tout l'hôpital (3 niveaux, escaliers, extérieur),
aucune fuite de collision, vue debug top-down du layout.

## Phase 4 — Décoration, matériaux, textures procédurales, éclairage
**Objectifs**
- Bibliothèque de textures procédurales (bruit, carrelage fissuré, béton, métal rouillé, bois,
  tissu, verre sale, herbe, peinture écaillée…) + normal/roughness maps, générées au chargement.
- Matériaux PBR gelés, plugin de lumière précalculée (irradiance néons + AO + ombres de contact),
  flicker par zone, teinte rouge du lockdown.
- Props procéduraux détaillés : lits, brancards, fauteuils roulants, perfusions, rideaux, chaises
  (dont renversées), bureaux, casiers, étagères d'archives, casiers réfrigérés, chaudières, tuyaux,
  armoires électriques, plantes mortes, panneaux de signalisation, dossiers, papiers… ; thin instances
  et LOD sur les objets détaillés.
- Decals (saleté, taches, sang, traces, graffitis) en atlas, fusionnés par zone.
- Identité visuelle forte par zone (couleurs, matériaux, signalétique).
- Culling par zones/portails, brouillard léger, ciel nocturne procédural.

**Fichiers** : `src/render/textures/*`, `src/render/materials/*`, `src/render/BakedLightPlugin.ts`,
`src/world/lighting/*`, `src/world/props/*`, `src/world/decor/*`, `src/render/ZoneCulling.ts`.

**Validation** : build OK ; captures de chaque zone ; draw calls raisonnables (< ~350 visibles) ;
les néons grésillent/clignotent.

## Phase 5 — Objets, portes, serrures, coffres, inventaire, cachettes, sorties
**Objectifs**
- Objets 3D détaillés (badges bleu/vert/rouge, clé de la morgue, pied-de-biche, pince coupante,
  fusibles, batterie, clés d'ambulance, petite clé), qui tournent et brillent légèrement ;
  3 à 5 points de spawn chacun, choisis par la seed.
- Inventaire 2 slots (configurable), poser / échanger.
- Portes : normales, battantes, badge de couleur, clé, planches (pied-de-biche), chaîne + cadenas
  (pince), électriques (courant), à sens unique (raccourcis) ; serrure lisible visuellement.
- Coffres à code (keypad, codes de la seed sur des notes) et à clé.
- Conduits de ventilation (accroupi), fenêtres franchissables, barrières.
- Cachettes : placards, sous les lits, casiers, sous les brancards (anim caméra fluide, cooldown).
- 3 sorties + chaînes d'objectifs : portail (badge rouge + code du boîtier), ambulance
  (batterie + clés + grille à la pince), toit (fusibles → courant → ascenseur, porte du toit au
  pied-de-biche). Splits branchés sur ces objectifs.

**Fichiers** : `src/gameplay/*`, `src/ui/Keypad.ts`, `src/ui/NoteView.ts`, `src/ui/HUD.ts`.

**Validation** : build OK ; les 3 sorties sont réalisables sur plusieurs seeds (script de test
qui vérifie la solvabilité de chaque seed) ; estimation de la route optimale ≈ 3–4 min.

## Phase 6 — IA : modèle, animations, navigation, comportements, difficultés
**Objectifs**
- « Le Chirurgien » : mesh skinné procédural (silhouette voûtée, membres trop longs, doigts
  effilés, blouse chirurgicale déchirée et tachée, masque, calot), vrai squelette (~30 os).
- Animations procédurales blendées : idle nerveux, marche, course, recherche, saut de barrière,
  ouverture de porte, vérification de cachette, capture ; IK des pieds (sol/escaliers) + regard vers le joueur.
- Navmesh Recast (plugin V2 Babylon) multi-étages : tile cache + obstacles pour les passages bloqués,
  off-mesh connections pour sauts de barrières et raccourcis (filtres selon difficulté).
- Machine à états : patrouille → investigation → chasse → recherche → vérification de cachette → capture.
- Perception : cône de vision + ligne de vue (la lampe allumée rend plus visible), ouïe (sprint,
  portes, objets, surfaces bruyantes).
- Difficultés Facile/Normal/Difficile/Cauchemar (vitesses, perception, réaction, sauts, raccourcis,
  vérifs de cachettes, pièges, anticipation) + mode lockdown agressif.
- Capture brutale → écran de fin (restart instantané proposé).

**Fichiers** : `src/ai/*`.

**Validation** : build OK ; le monstre patrouille, entend, poursuit, perd la trace, fouille,
ouvre les portes, saute les barrières selon la difficulté ; capture fonctionnelle.

## Phase 7 — Cinématiques et dialogues
**Objectifs**
- Système de dialogues : boîte stylée, texte lettre par lettre, bip WebAudio par caractère
  (timbre/hauteur propre à chaque personnage).
- Réalisateur de cinématiques (pistes caméra en splines, événements temporisés).
- Intro (~35–40 s) : voiture du pote devant l'hôpital, échange, entrée, porte qui claque, le monstre
  au bout du couloir, noir → contrôle + timer. Skippable (maintien + jauge circulaire). Jamais rejouée par R.
- Outros par sortie (portail / ambulance / toit) → retrouvailles avec le pote, dialogue final, départ.
  Skippables. Puis écran de fin.

**Fichiers** : `src/cinematics/*`, `src/ui/DialogueBox.ts`, `src/ui/HoldIndicator.ts`.

## Phase 8 — Audio procédural complet
**Objectifs**
- Moteur WebAudio : bus général / musique / effets (volumes séparés), compresseur, réverb
  (réponse impulsionnelle générée).
- Ambiance : drone oppressant, bourdonnement des néons (spatialisé), gouttes, vent (cour/extérieur), craquements.
- Pas du joueur par surface (carrelage, béton, herbe, métal), respiration jauge vide.
- Monstre spatialisé 3D (pas lourds, respiration, cris de détection) + filtrage d'occlusion.
- Musique de chasse dynamique, sirène du lockdown, portes, serrures, objets, coffres, bips.

**Fichiers** : `src/audio/*`.

## Phase 9 — Optimisation, presets graphiques, polish final
**Objectifs**
- Presets Low / Medium / High (résolution de rendu, ombres de la torche, FXAA partout,
  bloom/grain/SSAO léger selon preset), résolution dynamique (< 58 fps → baisse légère), compteur FPS.
- Profilage (draw calls, triangles, temps CPU), freeze des matériaux / active meshes quand possible.
- Menu principal avec fond animé de l'hôpital, options complètes, polish UI/UX, README final.

**Fichiers** : `src/render/*`, `src/ui/*`, `README.md`.

---

## Avancement

- [x] Phase 1 — Setup, boucle, contrôleur, caméra, menu
  > Vite 8 + TS 7 (strict) + Babylon.js 9.28 (imports profonds, WebGL2). Boucle maison
  > (`App.frame`) : souris brute consommée à chaque frame, physique en sous-pas ≤ 1/120 s.
  > `CollisionWorld` (grille spatiale 4 m, boîtes orientées + rampes, raycast DDA) et
  > `CharacterMover` (capsule : poussée hors pénétration, marches, rampes, passage accroupi).
  > Jauge de sprint « tout ou rien », lampe torche décalée en main + ombres PCF + cookie procédural,
  > restart R maintenu 0,5 s, menu principal / options complètes / pause opaque / écran de chargement.
  > Validé en Chromium headless (script Playwright) : déplacement, collisions, escalier, poutre
  > basse accroupi, restart, pause.
- [x] Phase 2 — Timer, splits, notes, seed, écran de fin
  > `RunTimer` 100 % `performance.now()` (horodatage de frame, pause qui gèle, `m:ss.t` / `m:ss.cc`),
  > départ du chrono **et** prise de contrôle à la même frame (`pendingBegin`), arrêt à la frame du
  > trigger. `RunManager` : lockdown 8:00, échec à 10:00, splits par id comparés au PB (vert/rouge).
  > Seeds : cyrb128 + sfc32, flux dérivés (`fork`), seeds aléatoires lisibles, Set Seed normalisée.
  > Records localStorage par difficulté × mode (PB, meilleure note, splits du PB, tentatives).
  > Écran de fin (compteur, lettre qui « slam » + onde + secousse, splits, PB, seed copiable),
  > écran Records, pause opaque avec infos de run. Testé : run de test complète + restart R.
- [ ] Phase 3 — Génération de l'hôpital
- [ ] Phase 4 — Décoration, matériaux, éclairage
- [ ] Phase 5 — Objets, portes, coffres, inventaire, cachettes, sorties
- [ ] Phase 6 — IA
- [ ] Phase 7 — Cinématiques et dialogues
- [ ] Phase 8 — Audio procédural
- [ ] Phase 9 — Optimisation, presets, polish

## Compromis techniques

_(mis à jour au fil des phases)_

- **Touches par position physique** (`KeyboardEvent.code`) : ZQSD en AZERTY et WASD en QWERTY
  correspondent aux mêmes touches physiques ; l'option AZERTY/QWERTY règle donc l'affichage des
  libellés (détection auto via l'API Keyboard Map quand elle existe). Plus robuste que `event.key`
  (Maj, verr. maj, touches mortes).
- **Souris brute** : `requestPointerLock({ unadjustedMovement: true })` n'existe que sous Chromium ;
  ailleurs on retombe sur le pointer lock classique (accélération de l'OS possible).
- **Ombres** : seuls les props / le monstre / les portes projettent des ombres ; l'architecture
  (sols, murs) n'est que receveuse (évite l'auto-ombrage et divise le coût de la shadow map).
- **Tests automatisés** : Chromium headless tourne en rendu logiciel (SwiftShader) → validations
  fonctionnelles et captures possibles, mais pas de mesure de fps représentative.
