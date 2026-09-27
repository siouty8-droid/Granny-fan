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

**Fichiers** : `src/gameplay/*` (données, ancres, planificateur, interaction, inventaire, objets, portes, coffres, courant, ascenseur, sorties, cachettes, fenêtres, orchestrateur), `src/gameplay/models/*` (modèles procéduraux), `src/ui/GameOverlays.ts` (clavier à code, notes, cachettes), `src/ui/ItemIcons.ts`, `src/ui/HUD.ts`, `src/world/builder/DoorFrameBuilder.ts`.

**Validation** : build OK ; les 3 sorties sont réalisables sur plusieurs seeds (script de test
qui vérifie la solvabilité de chaque seed) ; estimation de la route optimale ≈ 3–4 min.

**✅ Fait** —
- **Données** : 10 types d'objets (fusibles ×2, empilables), 3 à 7 points candidats chacun
  (« pièce:surface#n » ou « dans le coffre X »), 4 coffres (3 à code, 1 à clé), 5 notes à code
  (le code du portail est coupé en deux notes), 5 notes d'ambiance (lore du Dr Morel).
- **Ancres** : résolues une fois au chargement sur le décor fixe (emplacements sur le dessus des
  bureaux, établis, étagères, lits, tables d'autopsie… ou points de sol libres), uniques et stables.
  Coffres et tableau électrique réservés avant l'habillage des pièces.
- **Planificateur** : répartition par seed (`rng.fork("items")`, codes via `fork("codes")`) +
  solveur monotone sur le graphe des pièces (portes à badge/clé/planches/chaîne côté manipulable,
  sens unique, fenêtres cassées, saut dans la cour, cages d'escalier, ascenseur alimenté, coffres,
  courant) : les **3 sorties sont garanties** (300 seeds testées : 0 échec, 1 tirage, 0,2 ms).
- **Interaction** : visée depuis la caméra (sphères / boîtes orientées), occultation par le décor
  (sauf le meuble qui porte l'objet), invites contextuelles (verrou lisible : « lecteur de badge
  VERT », « bloquée de l'autre côté »…), appui simple ou maintien avec jauge.
- **Objets** : modèles procéduraux, rotation + flottement, émission pulsée + halo additif coloré
  (thin instances), ramasser / échanger (l'ancien objet prend la place) / poser (G), sélection 1-2
  + molette, icônes d'inventaire dessinées au canvas, split + astuce au premier ramassage.
- **Portes** (87) : vantaux thin-instanciés par style (vert, crème, bois, métal, bleu à hublot, vitré),
  battants ou doubles, colliders orientés qui suivent l'animation, battantes auto (s'ouvrent au
  passage, se referment), portes entrouvertes au départ, verrous visibles : lecteurs de badge +
  voyant rouge/vert, serrure à clé, planches clouées (arrachées → tas au sol), chaîne + cadenas
  (coupée → morceaux au sol), barre anti-panique côté autorisé, tôle rivetée des condamnées,
  ventouse de la porte d'entrée. Huisseries statiques précalculées. **Portes fermées = portails de
  culling fermés.**
- **Coffres** : porte animée, clavier à code (saisie clavier sans quitter le pointer lock, mémo des
  chiffres déjà trouvés, erreur/validation), coffre à clé ; contenu interactif une fois ouvert.
- **Courant** : tableau du local électrique (2 fusibles à insérer, voyants, levier animé) → split
  « Courant rétabli », ascenseur alimenté.
- **Ascenseur** : cabine traversante mobile (colliders qui suivent, le joueur est porté), portes
  palières + portes de cabine coulissantes, boutons d'appel et de cabine, voyants, B/RDC/Étage/Toit.
- **Sorties** : portail (badge rouge + code du boîtier → vantaux qui s'ouvrent → franchir),
  ambulance (couper la chaîne de la grille, installer la batterie → phares, démarrer avec les clés),
  toit (courant → ascenseur → planches de la porte du toit → échelle de secours). Chrono arrêté à
  la frame du trigger / de l'interaction.
- **Cachettes** (106) : armoires, casiers (colonne la plus proche), sous les lits / brancards ;
  entrée/sortie caméra lissées, vue limitée, lampe coupée, overlay (fentes / dessous de lit),
  sortie sur un côté libre, recharge 0,8 s ; état exposé pour l'IA (`enteredAt`).
- **Fenêtres cassées** : enjamber (hall → parvis) ou sauter dans la cour depuis l'étage.
- **Bruits** : bus d'événements (portes, planches, chaîne, clavier, objets, fenêtre…) pour l'IA.
- **Restart** : tout est remis à zéro en ~1 ms (aucune reconstruction).
- Testé en headless : ramassage / échange / pose de tous les objets, lecture des notes, codes faux
  puis justes, badge, planches, chaîne, sens unique des deux côtés, battantes, cachettes, fenêtres,
  courant + ascenseur B → Toit avec le joueur dedans, et les **3 sorties jusqu'à l'écran de fin**.
- Estimation (tournée gloutonne à vol d'oiseau, 6 m/s) : 45–100 s selon la sortie et la seed, soit
  en réalité ~1,5–3 min avec les détours, et 3–5 min à l'aveugle (exploration, monstre) ; la sortie
  la plus rapide change d'une seed à l'autre.

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

**✅ Fait** —
- **Modèle** (`MonsterModel.ts`) : mesh skinné procédural (~7 k triangles) sur un **squelette de
  36 os** (bassin, 3 vertèbres, cou, tête, mâchoire, clavicules, bras démesurés, mains, 3 doigts-griffes
  à 2 phalanges par main, cuisses, tibias, pieds, orteils). Corps décharné à la peau craquelée,
  blouse chirurgicale tachée de sang à l'ourlet en lambeaux, masque (sur la mâchoire), calot,
  mains ensanglantées, orbites creuses + deux points luisants (attachés à l'os de la tête).
  Pondération automatique (distance aux segments d'os, 3 influences). Ombre portée par la lampe,
  éclairage précalculé via une sonde mobile (plugin), masqué quand sa zone est cullée.
- **Animations** (`MonsterAnimator.ts`) : couches additives blendées — posture voûtée, idle
  nerveux (respiration, tics saccadés de la tête et des doigts), marche, course désarticulée
  (bras qui griffent l'air), recherche (tête qui balaie) ; gestes : bras tendu (portes, armoires),
  penché (sous les lits), saut groupé (barrières), bond de capture (bras levés, mâchoire ouverte).
  **IK des pieds** analytique à 2 os (escaliers, bassin qui descend) et **suivi du regard**.
- **Navigation** (`Navigation.ts`) : navmesh Recast via le plugin de navigation Babylon V2
  (tile cache), générée en ~0,5 s depuis les colliders statiques (sols, murs, rampes d'escalier,
  meubles). Toutes les portes déverrouillées sont franchissables ; **portes verrouillées = obstacles**
  retirés quand le joueur les ouvre ; liaisons hors-maillage pour **sauter les barrières** (dès
  Normal) et les **raccourcis** (fenêtre cassée, saut dans la cour — dès Difficile), filtrées par
  drapeaux de requête.
- **Cerveau** (`Monster.ts`) : patrouille (souvent à l'étage du joueur, biais vers ses objectifs
  selon la difficulté) → investigation (bruits) → poursuite (course, recalcul 0,3 s) → recherche
  autour de la dernière position connue (anticipation de la trajectoire en Difficile/Cauchemar)
  → fouille de cachettes (probabilité par difficulté, certaine s'il t'a **vu entrer**) → capture.
  Perception : cône de vision + ligne de vue (portes fermées opaques), portée ×1,45 lampe allumée,
  ×0,7 accroupi, ×0,55 dans le noir lampe éteinte ; ouïe sur le bus de bruits (pas selon la surface
  et l'allure, portes, planches, chaîne, clavier, objets lâchés, pièges ; atténuation entre étages).
  Ouvre les portes (pause « main tendue » selon la difficulté), pousse les battantes.
- **Difficultés** (tout dans `CONFIG.ai`) : vitesses, portée/angle de vision, ouïe, temps de réaction,
  répit de départ, sauts, raccourcis, fouilles, pièges (5 en Difficile, 8 en Cauchemar : mâchoires
  qui immobilisent 2,4 s et claquent très fort), anticipation, temps d'ouverture de porte.
- **Confinement** (8:00) : plus rapide, ouïe ×1,6, il « sait » où tu es toutes les 18 s ; lumières rouges.
- **Capture** : il fond sur toi, la caméra est arrachée vers son visage, secousse + voile rouge,
  puis écran de fin « Capturé » (restart instantané avec R).
- Départ : il est visible au bout du couloir depuis le hall et s'éloigne pendant le répit.
- Testé en headless : navmesh (chemins inter-étages, extérieur, raccourcis), 87 portes franchissables,
  porte fermée ouverte puis franchie, saut de barrière, escaliers, ouïe (sprint), repérage → poursuite
  → capture, cachette fouillée sous ses yeux → capture, pièges, confinement ; 120 s d'errance sans
  blocage ; coût IA + gameplay ≈ 0,07 ms/frame.

## Phase 7 — Cinématiques et dialogues
**Objectifs**
- Système de dialogues : boîte stylée, texte lettre par lettre, bip WebAudio par caractère
  (timbre/hauteur propre à chaque personnage).
- Réalisateur de cinématiques (pistes caméra en splines, événements temporisés).
- Intro (~35–40 s) : voiture du pote devant l'hôpital, échange, entrée, porte qui claque, le monstre
  au bout du couloir, noir → contrôle + timer. Skippable (maintien + jauge circulaire). Jamais rejouée par R.
- Outros par sortie (portail / ambulance / toit) → retrouvailles avec le pote, dialogue final, départ.
  Skippables. Puis écran de fin.

**Fichiers** : `src/cinema/*` (Director, CinemaOverlay, scripts), `src/audio/AudioEngine.ts` (bips), `src/ui/HoldRing.ts`.

**✅ Fait** —
- **Dialogues** (`CinemaOverlay.ts`) : boîte stylée, texte lettre par lettre, **un bip WebAudio par
  lettre** (hauteur selon la lettre, timbre propre : Léo triangle médium, Mehdi carré grave, pensées
  en sinus aigu en italique, « Mehdi au loin » atténué), pauses après la ponctuation.
- **Réalisateur** (`Director.ts`) : plans enchaînés, caméra interpolée en Catmull-Rom (position,
  cible, FOV), balancement de marche, secousses, répliques et évènements temporisés, fondus,
  bandes noires, **passable en maintenant la touche « Passer »** (jauge circulaire). Chaque script
  a un `finalize()` qui garantit l'état final même si on passe.
- **Intro (~37 s)** : la voiture de Mehdi dans la rue, phares allumés ; « dix minutes, pas une de
  plus » (la limite de temps) ; traversée du parking à la lampe, les portes vitrées s'ouvrent,
  claquent derrière Léo (secousse, ventouse), il se retourne, puis **la silhouette au bout du
  couloir** (zoom lent), qui penche la tête et s'éloigne ; noir → contrôle + chrono **à la même
  frame**. Jouée uniquement depuis le menu ; R ne la rejoue jamais.
- **Outros** (chrono déjà arrêté à la frame de sortie) : portail (Mehdi hurle de monter, le monstre
  derrière la grille, la voiture file), ambulance (elle défonce la sortie et rejoint la voiture dans
  la rue), toit (descente par l'échelle, le monstre au bord du toit, saut du grillage). Toujours les
  retrouvailles + échange final + départ, puis l'écran de fin.
- Les mécanismes (portes, portails, ascenseur) sont animés pendant les cinématiques ; le culling
  suit la caméra ; l'IA est suspendue (le monstre est « joué » par le script).
- Crochets sonores (`c.sound(...)`) posés pour la phase 8.

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
- [x] Phase 3 — Génération de l'hôpital
  > Plan écrit à la main dans `world/layout/hospital.ts` (≈ 85 pièces sur B/G/U/R, 3 cages
  > d'escalier, 1 ascenseur, ~150 ouvertures typées portes/fenêtres/arches/conduits, barrières),
  > validé par `indexLayout` (chevauchements, ouvertures hors mur…) et visualisable via `?map`.
  > `ArchitectureBuilder` : murs générés sur les frontières de cellules avec gestion locale des
  > coins (raccourci / prolongé / continu), faces par zone + soubassements, tableaux d'ouvertures,
  > sols/plafonds subdivisés (support de l'éclairage par sommet), façades, colliders, zones + portails
  > (dont portails verticaux des cages). `StairBuilder` (escaliers en U : marches, paliers, refend,
  > rampes de collision, garde-corps), `RoofBuilder` (dalle, acrotères, hélistation, trouée de
  > l'échelle), `ExteriorBuilder` (parvis/parking, ruelles, cour des ambulances, rue, clôtures,
  > portail, auvents). Tests Playwright : escaliers A/B montée/descente, murs, arbre (accroupi),
  > conduit (accroupi), allège de fenêtre. ~91k triangles, 1100 colliders.
- [x] Phase 4 — Décoration, matériaux, éclairage
  > **Textures** : ~24 familles procédurales (peinture écaillée à coulures, faïence fêlée, lino,
  > terrazzo, damier, parquet, moquette, béton, faux-plafond auréolé, lambris, tôle larmée, inox,
  > pierre, caoutchouc, façade, brique, enrobé, pavés, herbe, gravier, grille alpha, hélistation,
  > verre sale) → albedo + normal + ORM, teintées par matériau (~65 matériaux PBR gelés).
  > **Éclairage précalculé** : grille de voxels 0.25 m (colliders + props), luminaires placés par
  > thème (cassés / qui clignotent), irradiance par sommet avec ombres, lune + ciel à travers les
  > fenêtres, AO, rebond approximé, canaux de clignotement (16) et teinte rouge du confinement via
  > `BakedLightPlugin` (compatible matériaux gelés). Bake complet ≈ 0.5 s.
  > **Props** : kit de modélisation (boîtes, cylindres, tubes, révolution, nappes), atlas 4×4
  > (métal peint, inox, rouille, plastique, draps, tissu taché, matelas, bois, caoutchouc, papier,
  > carton, skaï, écran…), ~55 modèles (lits, brancards, fauteuils roulants, perfusions, rideaux,
  > casiers, morgue, chaudières, voitures, arbres morts…), thin instances par type avec LOD par
  > instance et bake par instance ; `Decorator` avec une recette par thème (~2100 instances,
  > 106 cachettes candidates). **Decals** (sang, traînées, tags, dessins d'enfants…) et
  > **signalétique** en atlas canvas, **fenêtres** (cadres, vitrage sale, éclats), **ciel** nocturne
  > procédural, **brouillard** adaptatif intérieur/extérieur, **culling par portails** (rectangle
  > écran rétréci à chaque portail) : ~40–200 draw calls selon la zone. Menu : travellings animés.
- [x] Phase 5 — Objets, portes, coffres, inventaire, cachettes, sorties
- [x] Phase 6 — IA
- [x] Phase 7 — Cinématiques et dialogues
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
- **Objets dynamiques en thin instances** : portes, objets, cabine, portails… sont des instances du
  système de props (buffers réécrits seulement pour les types modifiés). Les vantaux sont dans un
  secteur « toujours visible » (une porte appartient aux deux pièces) : ~15 draw calls fixes.
- **Portes non prises en compte par l'éclairage précalculé** (ni par la navmesh) : la lumière
  « traverse » les portes fermées, ce qui passe inaperçu et évite un bake par état de porte.
- **Navmesh depuis les colliders** (boîtes / rampes) plutôt que depuis les meshes de rendu :
  géométrie simple et propre, génération ~0,5 s. Les portes n'en font pas partie : le monstre les
  ouvre lui-même ; seules les portes verrouillées sont des obstacles du tile cache.
- **Le monstre ne prend pas l'ascenseur** : le toit est hors de sa portée (il attend au point
  atteignable le plus proche) — l'ascenseur reste une échappatoire risquée (portes lentes).
- **Animations procédurales** (couches d'angles additives) plutôt que clés d'animation ; IK des
  pieds dans le plan sagittal (suffisant pour une silhouette voûtée dans la pénombre).
- **Cinématiques sans modèle du joueur** : jeu à la première personne, donc plans subjectifs pour
  Léo et plans d'ensemble où il est hors champ ; Mehdi reste dans sa voiture (on ne voit que la
  voiture). Aucun personnage humain à animer = pas de « vallée de l'étrange ».
- **Pas de physique pour le monstre** : il suit la navmesh (hauteur recalée sur le sol réel).
- **Code saisi au clavier** (rangée des chiffres ou pavé) plutôt qu'en visant les touches du
  boîtier : plus rapide pour du speedrun, et le pointer lock n'est jamais perdu.
- **Solveur de faisabilité monotone** : l'inventaire limité (2 emplacements) n'entre pas en compte
  (on peut toujours poser un objet et revenir le chercher), seul l'accès compte.
- **Ombres** : seuls les props / le monstre / les portes projettent des ombres ; l'architecture
  (sols, murs) n'est que receveuse (évite l'auto-ombrage et divise le coût de la shadow map).
- **Props en thin instances « un mesh par type »** : les clones Babylon partagent leur géométrie,
  donc les buffers d'instance personnalisés (`bake`) entraient en conflit entre secteurs. On garde
  un seul mesh par type (et par LOD) dont les buffers sont reconstruits côté CPU (4 Hz ou au
  changement de secteurs visibles) : moins de draw calls, culling par secteur conservé.
- **Éclairage par sommet** plutôt que lightmaps : pas d'UV2 à générer, bake très rapide ; les
  murs/sols sont subdivisés (~1 m) pour porter les dégradés. Les objets dynamiques utilisent
  des sondes (irradiance omnidirectionnelle au point).
- **Temps de chargement** : la génération des textures est faite en JS sur le thread principal
  (≈ 20 s dans la VM de test en rendu logiciel, bien moins sur une vraie machine). Piste phase 9 :
  pool de Web Workers.
- **Tests automatisés** : Chromium headless tourne en rendu logiciel (SwiftShader) → validations
  fonctionnelles et captures possibles, mais pas de mesure de fps représentative.
