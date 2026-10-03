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
- **Modèle** (`MonsterModel.ts`, tenue d'origine ; skins en phase 11) : mesh skinné procédural (~7 k triangles) sur un **squelette de
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

**✅ Fait** — 100 % synthèse WebAudio, aucun fichier son.
- **Moteur** (`AudioEngine.ts`) : contexte créé au premier geste (politique d'autoplay), bus
  général → compresseur, musique / effets / voix (volumes séparés, courbe perceptive), **réverb
  à convolution** (réponse impulsionnelle générée), auditeur 3D sur la caméra (repère main gauche
  → main droite), contexte suspendu en pause.
- **Recettes** (`Sfx.ts`, ~45 sons) : graphes éphémères oscillateurs + bruit filtré + enveloppes +
  saturation. Pas par surface (carrelage, béton, herbe, métal, bois) et par allure, souffle,
  cœur ; portes (grincement FM, claquement, battant), badge, clé, planches arrachées, chaîne
  coupée, barre anti-panique, objets (carte, clés, métal, lourd…), papier, touches / code bon /
  erroné, coffre, fusible, levier, ascenseur (moteur, ding, portes), portail, batterie, vitre,
  réception, cachettes, piège, lampe ; monstre (pas lourds et griffes, respiration, grognement,
  **cri de détection** saturé, capture) ; voitures (portière, moteur), sirène d'ambulance ;
  gouttes, craquements, chocs lointains.
- **Spatialisation** : chaque son 3D passe par un `PannerNode` + un **filtre d'occlusion**
  (passe-bas + atténuation) calculé par ligne de vue (murs, portes fermées) et par étage.
- **Ambiance** (`Ambience.ts`) : drone grave (dents de scie filtrées, LFO lent) + dissonance du
  confinement, vent (cour / extérieur), **3 voix de bourdonnement de néons** spatialisées et
  réaffectées aux tubes les plus proches (suivent leur clignotement), gouttes / craquements /
  chocs aléatoires, nappe de tension quand le monstre approche ou repère le joueur,
  **musique de poursuite** (séquenceur 176 BPM, 196 en confinement : grosse caisse, tom,
  charleston, accords dissonants) en fondu, **sirène** du confinement (longue puis rappels).
- **Chef d'orchestre** (`SoundDirector.ts`) : branche joueur (pas, lampe, essoufflement quand la
  jauge est vide), gameplay (évènements `sfx` émis par portes, serrures, objets, coffres,
  courant, ascenseur, sorties, fenêtres, cachettes, pièges), monstre (pas, cri, souffle,
  grognements, capture), battements de cœur en cachette quand il rôde, réverb selon la pièce
  (escaliers > couloirs > grandes salles > petites > dehors), sons des cinématiques.
- Coût mesuré : ~0.02 ms/frame pour la direction, ~0.2 ms par son déclenché.

## Phase 9 — Optimisation, presets graphiques, polish final
**Objectifs**
- Presets Low / Medium / High (résolution de rendu, ombres de la torche, FXAA partout,
  bloom/grain/SSAO léger selon preset), résolution dynamique (< 58 fps → baisse légère), compteur FPS.
- Profilage (draw calls, triangles, temps CPU), freeze des matériaux / active meshes quand possible.
- Menu principal avec fond animé de l'hôpital, options complètes, polish UI/UX, README final.

**Fichiers** : `src/render/*`, `src/ui/*`, `README.md`.

**✅ Fait**
- **Post-traitements par preset** (`PostFx.ts`) : FXAA partout ; bloom léger (demi-résolution,
  seuil haut : néons, écrans, phares) + grain animé en Medium/High ; SSAO2 léger (demi-résolution,
  8 échantillons, via le pré-rendu MRT WebGL2) + aberration chromatique en High. Le tone mapping
  et le vignettage restent dans les matériaux (aucune passe d'image processing en plus).
  Changement de preset à chaud : pipeline recréé, ombres de la lampe reconfigurées (projeteurs
  ré-enregistrés, matériaux dégelés le temps de recompiler puis regelés).
- **Résolution dynamique** (`DynamicResolution.ts`) : fenêtre de 0,75 s, pas de −4 % sous 58 fps
  (ou sous ~95 % de la fréquence de l'écran estimée par l'intervalle vsync), remontée par +2 %
  après 3 fenêtres stables, plancher 55 %, fenêtres contenant une saccade isolée ignorées.
  Affichée dans le compteur de FPS (échelle, preset).
- **Chargement** : textures procédurales générées dans un **pool de Web Workers** (un par cœur,
  6 max ; tâches triées par coût ; repli sur le thread principal si les workers sont refusés).
  VM de test (4 cœurs, rendu logiciel) : 17 s → 8,7 s pour les textures, 22,8 s → 14,5 s au total.
- **CPU par frame** : le système de props ne réécrit plus les buffers d'instances que si la
  répartition visible / LOD0 / LOD1 d'un type change (≈ 1 ms → 0,1 ms en moyenne). Profil
  mesuré (VM lente) : joueur + gameplay + IA + audio + culling + props ≈ 1 ms ; le reste est le
  rendu Babylon (≈ 100–300 draw calls selon la zone).
- **Correctif rendu** : la lampe n'est plus jamais désactivée (intensité 0 + shadow map figée
  quand elle est éteinte) — désactivée, les matériaux gelés gardaient un sampler d'ombre sans
  texture et WebGL rejetait des draw calls (props invisibles une frame au menu / en cinématique).
  Vérifié : 0 erreur GL sur menu, jeu, cachettes, confinement, intro et outros, en Medium et High.
- **Polish** : textes du menu graphique, `?preset=` / `?fixedres` pour les tests, suppression du
  niveau de test de la phase 1, **README** complet (lancement, commandes, jeu, presets,
  structure, paramètres de debug).

## Phase 10 — Confort et lisibilité (après la v1)
**Objectifs** (choisis avec le joueur) : comprendre ses morts, relire sa run, garder le fil des
objectifs, et quelques réglages de confort — sans affaiblir la peur.

**✅ Fait**
- **Journal de run** (`run/RunLog.ts`) : trajets du joueur et du monstre échantillonnés (0,25 s),
  détections émises par le monstre (`detect` : vue avec lampe / sprint / accroupi, bruit avec
  type et allure + surface des pas, cachette vue, confinement, capture), splits, sortie.
- **Récap de capture** (`run/DeathRecap.ts`) : chaîne des dernières détections (temps, phrase,
  pièce) + conseil ciblé selon la cause principale ; causes classées pour les statistiques.
- **Carte de fin** (`ui/RunMap.ts`) : plan de chaque niveau (extérieur compris au RDC), trajets,
  repères (détections, objectifs numérotés, capture, sortie), cadrage automatique sur la zone
  parcourue ou plan entier, curseur temporel qui rejoue les positions.
- **Carnet** (Tab, `gameplay/Journal.ts`) : repérage des objets vus (distance, cône, ligne de
  vue), codes notés, checklist par sortie ; non bloquant, rafraîchi en continu.
- **Regarder derrière** (V / clic milieu) : rotation lissée de 180° de la vue, la lampe et
  l'audio suivent la tête, le déplacement garde son cap.
- **Repérage ressenti** : vignette sombre qui pulse selon la jauge de repérage, « coup »
  sonore (inspiration + cordes dissonantes) quand elle passe 30 %.
- **Luminosité** : exposition réglable, écran de calibrage (3 croix passées par la même chaîne
  ACES + gamma + contraste que le rendu, scène visible derrière) au premier lancement.
- **Historique / stats** (`run/History.ts`, onglets des records), abandons comptés au-delà de
  20 s, **Rejouer cette seed** (fin de run, pause, historique).

**Correctif « chaque verrou récompense »** (retour de jeu : le Bloc ouvert au badge bleu était
vide) : mesuré sur 400 seeds, le Bloc était vide 42 % du temps et le badge bleu totalement
inutile dans 24 % des seeds.
- Le planificateur détecte automatiquement les **zones verrouillées** (groupes de pièces fermés
  par une porte à objet, hors conduits, ascenseur, toit et local électrique) : Poste de sécurité,
  Bureau du cadre de santé, Réserve des urgences, Radiologie, Bureau du directeur, Bloc, Morgue,
  Archives. Chacune contient **toujours** au moins un objet ou une note utile, et **chaque coffre**
  contient toujours au moins un objet (une note de coffre n'est donc jamais inutile).
- Tirage puis **réparation** (déplacement d'objets / notes vers leurs propres candidats dans les
  zones vides), puis validation : 3 sorties, **tout objet et toute note accessibles**. 1000 seeds :
  0 échec, 75 % en 1 tirage, 0,5 ms en moyenne. Nouveaux emplacements candidats pour garder de
  la variété (badges et clés dans les coffres, bureau du directeur, cadre de santé, bloc).
- Portes : la porte condamnée du Bloc devient une **sortie de secours** (barre anti-panique,
  raccourci vers le couloir des chambres) ; chambres 103 et 109 ouvertes ; une porte
  **entrouverte** s'ouvre en grand d'un seul appui (avant : « Fermer » puis « Ouvrir ») et le
  monstre la pousse au passage.

## Phase 11 — Entraînement, XP et niveaux
**✅ Étape 1 faite**
- **Entraînement** : `RunSetup.training` → pas de monstre (IA désactivée), pas de limite de
  temps, pas d'intro, aucun enregistrement (records, tentatives, historique, XP) ; étiquette
  « ENTRAÎNEMENT » sous le chrono, écran de fin marqué, carte et splits disponibles.
- **Progression** (`run/Progression.ts`) : XP totale en localStorage, niveau calculé
  (coût 100 + 20 × (n − 1), plafond 20), gain selon la note (Z 80 → F 20, moyenne B/C = 50) ou
  mort/temps écoulé (10, réduit si run < 90 s : anti-farm), × difficulté. Écran de fin : gain
  détaillé, barre animée, passage de niveau et récompenses débloquées. Menu : badge de niveau,
  écran **Progression** (récompenses, règles).
- Récompenses déclarées (`UNLOCKS`) avec un drapeau `ready` : pilote auto (5), couleurs de lampe
  (10), skins (15, 20), nouvelle map (20) — affichées « bientôt » tant qu'elles ne sont pas
  livrées.
- Correctif : l'IA prenait la difficulté des réglages au lieu de celle de la run (« Rejouer »
  depuis l'historique).

**✅ Étape 2 faite — pilote auto** (entraînement, niveau 5)
- **Planificateur** (`autopilot/RoutePlanner.ts`) : graphe de points (point d'action de chaque
  objet / note / coffre / serrure, deux côtés de chaque porte verrouillable, conduits, fenêtres,
  sauts d'étage, paliers d'ascenseur) ; régions = pièces reliées sans verrou (union-find) ;
  distances à pied via la navmesh (passages accroupis sous les obstacles bas comptés au ralenti,
  portes ordinaires à ouvrir). Les actions utiles à une sortie sont trouvées par fermeture des
  dépendances (objets → coffres → notes → portes → courant), puis un **A\*** sur (actions faites,
  position, inventaire) respecte toutes les règles : 2 emplacements avec échanges, piles de
  fusibles, objets pris un par un dans les coffres, codes lus avant de taper, portes et courant
  avant de passer. Heuristique admissible = max(chaîne de prérequis, arbre couvrant des points
  obligatoires) ; élagage des actions inutiles (note / objet / coffre qui ne sert plus, porte
  facultative qui ne rapproche de rien, on lâche d'abord un objet devenu inutile). Recherche
  sans « reprise d'objet posé » d'abord, avec en secours. Temps théorique recalculé avec la vraie
  jauge de sprint. 60 seeds × 3 sorties : 0 échec, 0,1 s médiane, ~1,3 s au pire par sortie.
- **Pilote** (`autopilot/Autopilot.ts`) : joue avec les vraies commandes (couche d'entrées
  simulées dans `Input`) : suivi de la navmesh (poursuite du chemin, sprint dès que la jauge est
  pleine, hystérésis pour ne pas hésiter entre deux chemins équivalents), ouverture des portes
  fermées sur le chemin, contournement d'un vantail ouvert par son bout libre (la navmesh ne
  connaît pas les vantaux) ou, dans un couloir trop étroit, fermeture de la porte après s'être
  écarté de son balayage, accroupi sous les obstacles et dans les conduits, fenêtres (enjamber / sauter),
  ascenseur (appel, cabine, bouton, attente), visée des objets (arrêt dès que l'objet est à portée
  et visible), choix de l'emplacement avant un échange, codes tapés au clavier du boîtier. Se cale
  sur le chrono : temps théorique + 22 s répartis sur les étapes avant la sortie (pauses courtes
  après les actions) pour qu'on puisse suivre.
  Détection de blocage (recalcul, manœuvre de dégagement) ; en dernier recours il rend la main.
- **Interface** : choix dans le panneau Entraînement (Non / Meilleure / Portail / Ambulance /
  Toit, verrouillé avant le niveau 5), calcul de la route avant le départ du chrono, bandeau
  (sortie, temps théorique, étape en cours + ce que fait le pilote, étapes suivantes et leur temps
  prévu), « Prendre la main » dans la pause, écran de fin : théorique vs réalisé.
- **Pièges** (Difficile / Cauchemar, présents aussi en entraînement) : obstacles de navigation
  pour le pilote + écart latéral quand un piège est juste devant ; aucun déclenché sur les tests.
- Tests : plus de 100 runs complètes en simulation 60 Hz (~27 seeds × 3 sorties, chrono verrouillé
  sur le temps simulé : `debugSimLock`), 0 échec depuis les derniers correctifs ; version finale :
  écart au théorique 21–29 s (moyenne 23,4 s), Cauchemar 6/6 sans piège déclenché.
- Correctif de level design trouvé par le pilote : le conduit escalier C ↔ local électrique
  débouchait sous la volée d'escalier (inaccessible) → déplacé près de la porte de l'escalier.

**✅ Étape 3 faite — couleurs de lampe (niveau 10) et skins du Chirurgien (15, 20)**
- **Cosmétiques** (`run/Cosmetics.ts`) : 5 couleurs de lampe (luminance recalée sur la lampe
  d'origine pour ne pas changer la visibilité) et 3 tenues ; un choix pas (ou plus) débloqué
  retombe sur l'original. Réglages `flashColor` / `monsterSkin` (gardés par « tout réinitialiser »).
- **Skins** (`ai/MonsterModel.ts`) : corps commun + tenue par skin, sur le même squelette de 36 os
  (animations, capture et IA inchangées) ; changement à chaud en remplaçant la géométrie du même
  mesh (ombres, matériau gelé et culling intacts). *La Veilleuse de nuit* : robe et gilet de garde,
  ceinture et col blancs, montre de gousset, coiffe à croix rouge, longs cheveux noirs (calotte
  plaquée, rideau dans le dos, deux mèches devant les épaules), bas noirs, ongles rouges, sourire
  cousu. *Le Patient zéro* : peau verdâtre, blouse de patient en lambeaux, bandages plaqués sur le
  crâne et enroulés sur un bras et un tibia, bouche béante, bracelet d'hôpital, cathéter, pied à
  perfusion tenu d'une main (poche, tubulure jusqu'au bras). Nouvelle surface libre du kit de
  modélisation (`ModelKit.grid`) pour les rubans et nappes.
- **Écran Personnaliser** (menu principal, écran Progression) : panneau à gauche, vitrine 3D à
  droite (plan fixe du hall, Chirurgien en idle qui te fixe, lampe braquée sur lui dans la
  couleur choisie, glisser pour le tourner) ; clic = équiper si débloqué, sinon aperçu
  (« se débloque au niveau X »), retour aux choix équipés en sortant.
- Petits conforts : Échap ferme aussi l'écran Progression ; menu principal resserré pour tenir
  en 720p avec une entrée de plus ; récompenses débloquées → « où s'en servir ».
- **Code « tout débloquer »** (écran Progression) : niveau max + toutes les récompenses, y compris
  celles ajoutées plus tard — tout contenu verrouillé passe par `Progression.isUnlocked`, qui
  répond oui quand le code est actif (les cosmétiques aussi, via un prédicat). Stocké avec l'XP
  (`unlockAll`), l'XP réelle continue d'être comptée ; *Désactiver* rend la vraie progression (un
  cosmétique équipé redevenu verrouillé retombe sur l'original). Le code n'est pas en clair dans
  les sources (empreinte FNV-1a de la saisie normalisée).

## Phase 12 — Modificateurs, fantôme, succès, sons des skins

**Règle commune — 3 types de run** (`isRanked` dans `run/RunManager.ts`) :
- *classée* (Jouer, sans modificateur) : records, PB, tentatives, splits de référence, fantôme,
  XP, succès ;
- *modifiée* (au moins un modificateur) : XP avec bonus et succès, mais ni records ni PB (pas de
  comparaison au PB pendant la run), marquée dans l'historique (exclue du meilleur temps par
  sortie et de l'évasion moyenne) ;
- *entraînement* : rien ne compte.
Le code « tout débloquer » ne donne ni succès ni records.

**✅ Étape A — modificateurs** (`run/Modifiers.ts`, valeurs dans `CONFIG.modifiers`)
- Lampe à piles (décharge 160 s allumée, recharge 120 s éteinte, faiblit et vacille sous 25 %,
  raté à l'allumage à vide ; jauge « LAMPE » au HUD), Sans sprint (jauge barrée, appui refusé),
  Brouillard (densité ×3,3, couleur plus claire), Chirurgien enragé (vitesses ×1,15, ouïe ×1,35,
  vue ×1,1), Chirurgien invisible (corps affiché seulement dans le cône de la lampe — tête, torse
  ou jambes —, yeux toujours visibles, toujours entier en capture et en cinématique), Chrono 5 min
  (confinement à 4:00, dialogues et écran de fin adaptés), Sans carnet (Tab refusé, aucun code
  noté), Sans cachettes (« Condamné »).
- Bonus d'XP cumulés, plafonnés à +100 % ; détail sur l'écran de fin.
- Choix dans le panneau Difficulté (pastilles, description au survol, « Tout retirer »), rappel
  dans le panneau Entraînement, liste sous le chrono, ligne dans la pause et l'écran de fin.
- R et « Recommencer » gardent la difficulté et les modificateurs de la run ; « Rejouer » depuis
  l'historique reprend ceux de la run d'origine ; coupés quand le pilote auto joue (sa route
  suppose les conditions normales). `?mods=battery,fog…` pour les tests.

**✅ Étape B — fantôme** (`run/Ghosts.ts`, `render/GhostRunner.ts`, valeurs dans `CONFIG.ghost`)
- Enregistrement de chaque run : un échantillon toutes les 200 ms de chrono (position en cm,
  lacet, accroupi, lampe), en écarts successifs base 36 : ~2 Ko par minute.
- Gardé par seed × difficulté : « pb » (run classée réussie qui bat le fantôme existant) et « auto »
  (run complète du pilote auto) ; 20 fantômes et 600 Ko de trajets au plus (les plus anciens
  partent).
- Rejoué sur le chrono (même départ) : mannequin transparent bleuté qui flotte et scintille, avec
  un faisceau additif qui s'éteint sur sa longueur quand sa lampe était allumée ; s'efface après
  son arrivée ; pas de collision, pas d'ombre, ignoré par l'IA ; caché en cinématique et au menu.
- Quand un fantôme court, les écarts en direct se comparent à SES splits (même seed) ; étiquette
  « FANTÔME 1:23.45 » + écart sous le chrono ; écran de fin : fantôme battu / écart, fantôme
  enregistré. Réglages : Oui/Non (panneau Mode de seed), Non / Mon record / Pilote auto (panneau
  Entraînement). Jamais en run modifiée ni quand le pilote auto joue.

**✅ Étape C — succès** (`run/Achievements.ts`, seuils dans `CONFIG.achievements`)
- 21 succès (2 secrets), XP de 20 à 150 chacun, donnée une seule fois et ajoutée au gain de la run
  (lignes « Succès : … +XP » sur l'écran de fin).
- Évalués à la fin des runs comptées (classées ou modifiées ; jamais en entraînement, jamais par
  le code) à partir du résultat et de ce qui s'est passé pendant la run : poursuites (`alert`),
  poursuites semées (`lost`), repérages à vue (`detect` sight / sawHide), temps lampe allumée,
  notes lues ; compteurs cumulés gardés (évasions, captures, sorties, modificateurs, notes).
- Onglet « Succès n/21 » dans l'écran Progression : débloqués (date), en cours (avancement 2/3,
  4/8, 12/50…), secrets masqués.
- Écran de fin : défile au lieu d'être coupé et se resserre sur les écrans bas.

**✅ Étape D — sons des tenues** (`audio/Sfx.ts`, `audio/SoundDirector.ts`)
- Chaque tenue a ses 4 sons, joués aux mêmes déclenchements que ceux du Chirurgien (pas, cri de
  repérage, grognement de poursuite / quand il te perd, souffle quand il est proche) :
  *la Veilleuse* — pieds nus et ongles qui claquent, berceuse fredonnée (« Au clair de la lune »
  en mineur, trois fragments), « chhhut » soufflé, cri aigu ; *le Patient zéro* — pas lourds + roulette
  de la perfusion qui grince et tige qui cliquette, râle humide et sifflement, gargouillis, hurlement
  rauque.
- Équité : mêmes sorties (portée, atténuation, réverb) que les sons d'origine et volumes recalés
  à la mesure (RMS à 4 m, écarts ≤ 1 dB ; le fredonnement, plus tonal, légèrement en dessous).
- Vitrine de la personnalisation : la voix de la tenue en aperçu, à la tête du Chirurgien, tout de
  suite au changement puis toutes les 5 à 7 s.

**✅ Dossiers cachés et événements flippants**
- Dossiers (`run/Dossiers.ts`, textes et 12 emplacements dans `data/spawns.ts`) : un par run comptée,
  pris parmi ceux pas encore trouvés (seed → même dossier, même endroit), ancres résolues après
  toutes les autres (aucun emplacement existant ne bouge) ; lu = gardé (toast n/10), onglet
  « Dossiers » pour les relire ; succès *Enquêteur* (22e).
- Événements (`gameplay/ScareEvents.ts`, `CONFIG.scares`) : premier après 35–60 s puis toutes les
  45–95 s, tirés au hasard sans répéter le précédent ; coupure de courant (intensité de
  l'éclairage précalculé + canaux de clignotement), cri lointain, porte qui claque (son seul),
  chuchotement, silhouette (placée 11–19 m devant en ligne de vue, disparaît à 9 m, braquée 0,35 s
  ou après 3,5 s). Rien sur le bus de bruit ; reportés pendant poursuite / cachette / Chirurgien à
  moins de 16 m ; réglage Options → Audio.

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
- [x] Phase 8 — Audio procédural
- [x] Phase 9 — Optimisation, presets, polish
- [x] Phase 10 — Confort (récap, carte, carnet, regard arrière, repérage, luminosité, historique, rejouer)
- [x] Phase 11 — Entraînement + XP/niveaux (étape 1) · pilote auto (étape 2) · lampes et skins (étape 3)
- [x] Phase 12 — Modificateurs · fantôme · succès · sons des tenues

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
- **Temps de chargement** : textures générées en JS (CPU) dans des Web Workers ; le bake
  d'éclairage (~0,7 s) et la navmesh (~0,5 s) restent sur le thread principal. La texture la plus
  lourde (peinture 1024×2048) borne le temps total : la découper en bandes accélérerait encore.
- **Pas de gel des meshes actifs** (`freezeActiveMeshes`) : incompatible avec le culling par
  portails qui change la liste à chaque déplacement ; on compte sur le culling + thin instances.
- **SSAO seulement en High** : sur iGPU, la passe MRT + SSAO coûte plusieurs ms ; l'occlusion
  ambiante est déjà en grande partie précalculée (bake par sommet + AO des textures).
- **Résolution dynamique** : mesure au fps (pas de requêtes de temps GPU, rarement disponibles
  en WebGL) ; chaque changement d'échelle réalloue les cibles de rendu (pas espacés de 0,75 s).
- **Audio sans échantillons** : timbres volontairement « lo-fi » (bruit filtré, oscillateurs) ;
  panoramique `equalpower` (HRTF trop coûteux pour des dizaines de sons éphémères) ; l'occlusion
  est binaire par ligne de vue (pas de propagation par les portails).
- **Tests automatisés** : Chromium headless tourne en rendu logiciel (SwiftShader) → validations
  fonctionnelles et captures possibles, mais pas de mesure de fps représentative.
- **Pilote auto sans re-planification** : la route est calculée une fois au départ (état initial
  de la seed) ; si tu prends la main, le pilote ne peut pas la reprendre en cours de run. Le
  planificateur ignore le monstre (entraînement uniquement) et suppose une visée parfaite
  (0,25 s par action) : le temps théorique est une borne atteignable par un joueur parfait.
