# Dix Minutes — Hôpital Saint-Aubin

Jeu d'horreur **speedrun** à la première personne dans un hôpital abandonné, inspiré de *Granny* et
de *Piggy*. Léo a dix minutes pour sortir de l'hôpital, pendant que Mehdi l'attend dans la voiture
et que « le Chirurgien » rôde dans les couloirs.

Tout est **100 % procédural** : aucun fichier externe (modèles, textures, sons, polices, images).
Géométrie, textures PBR, éclairage, personnages, animations, sons et musique sont générés au
chargement par le code.

- Babylon.js 9 (WebGL2) · Vite · TypeScript strict
- Navigation du monstre : plugin de navigation Babylon (Recast / Detour, tuiles + obstacles)
- Audio : WebAudio pur (synthèse, spatialisation 3D, réverb à convolution générée)

## Lancer le jeu

Prérequis : Node.js 20.19+ ou 22.12+ (exigence de Vite 8 ; testé avec Node 22).

```bash
npm install
npm run dev        # serveur de développement → http://localhost:5173
npm run build      # vérification des types + build de production dans dist/
npm run preview    # sert dist/ → http://localhost:4173
```

Le build est statique (`base: "./"`) : le contenu de `dist/` peut être posé tel quel sur
n'importe quel hébergement (GitHub Pages, itch.io…). Il faut le servir en HTTP (pas en `file://`),
sinon les Web Workers de génération de textures sont refusés (le jeu retombe alors sur une
génération sur le thread principal, plus lente).

Navigateurs : Chrome / Edge / Firefox récents. Le jeu verrouille la souris (pointer lock) ; sous
Chromium, la souris « brute » est utilisée (sans accélération de l'OS).

## Commandes

Les touches sont liées à la **position physique** : ZQSD en AZERTY = WASD en QWERTY. Tout est
remappable dans *Options → Contrôles* (2 touches par action, détection AZERTY/QWERTY).

| Action | Touches par défaut (AZERTY) |
| --- | --- |
| Se déplacer | Z Q S D / flèches |
| Regarder | souris |
| Sprint (jauge « tout ou rien ») | Maj |
| S'accroupir (passer sous les obstacles, marcher sans bruit) | C / Ctrl |
| Interagir (ramasser, ouvrir, se cacher, enjamber…) | E / clic gauche |
| Lampe torche | F / clic droit |
| Regarder derrière soi | maintenir V / clic milieu |
| Carnet (codes, avancement des sorties, objets repérés) | Tab |
| Choisir l'emplacement d'inventaire | 1 / 2 / molette |
| Poser l'objet tenu | G |
| Saisir un code (boîtier, coffre) | rangée des chiffres ou pavé numérique |
| Relancer la run instantanément | maintenir R (0,5 s) |
| Passer une cinématique | maintenir Espace / Entrée |
| Pause | Échap |

## Le jeu

- **Chrono** : démarre à la frame où le joueur prend la main (après l'intro), affiché en
  `m:ss.t` en jeu et `m:ss.cc` à l'arrivée. À **8:00**, l'hôpital passe en **confinement**
  (alarme, lumière rouge, monstre plus rapide et plus attentif). À **10:00**, la run est perdue.
- **Trois sorties** : le portail principal (badge rouge + code du boîtier, dont les chiffres sont
  répartis dans des notes), l'ambulance (couper la chaîne de la grille, installer la batterie,
  démarrer avec les clés) ou le toit (rétablir le courant avec les deux fusibles, prendre
  l'ascenseur, arracher les planches au pied-de-biche, descendre par l'échelle de secours).
- **Seeds** : chaque seed place les objets, les codes et les notes différemment. Un solveur
  garantit que les trois sorties restent réalisables. Mode *Random* (nouvelle seed à chaque
  relance) ou *Set Seed* (seed imposée, pour s'entraîner sur une route).
- **Notes** : Z (≤ 3:30), S, A, B, C, D, E (≤ 8:00), F au-delà. Splits comparés au record
  personnel (par difficulté et par mode de seed), records sauvegardés dans le navigateur.
- **Difficultés** : Facile, Normal, Difficile (pièges, raccourcis), Cauchemar (anticipation de
  la route du joueur). Le monstre voit (cône + ligne de vue, la lampe te rend visible de loin),
  entend (pas, sprint, portes, objets, pièges), ouvre les portes, saute les barrières, fouille
  les cachettes (armoires, dessous de lits).
- **Cinématiques** : intro (~37 s) jouée seulement depuis le menu (jamais par R), outro propre à
  chaque sortie jusqu'aux retrouvailles avec Mehdi. Dialogues lettre par lettre avec un bip par
  lettre et une voix par personnage.

## Entraînement et progression

- **Entraînement** (menu principal) : pas de monstre, pas de limite de temps, seed au choix (ou
  aléatoire). Rien n'est compté : ni records, ni historique, ni XP. Parfait pour apprendre la
  carte et bosser une route. R et « Rejouer cette seed » restent en entraînement.
- **XP et niveaux** : une évasion rapporte 20 à 80 XP selon la note (≈ 50 pour une note
  moyenne), une mort ou un temps écoulé 10 XP (moins si la run a duré moins de 90 s), le tout
  × difficulté (Facile ×0,8 → Cauchemar ×1,6). Chaque niveau demande 20 XP de plus que le
  précédent (100 XP pour le niveau 2), niveau max 20 pour l'instant.
- **Récompenses** : niveau 5 pilote auto (entraînement), 10 couleurs de lampe, 15 et 20 skins
  du Chirurgien, 20 nouvelle map (« bientôt » tant qu'elle n'est pas livrée). Menu
  **Progression** pour tout voir.
- **Codes** (écran Progression, champ *Code*) : il existe un code qui met au niveau max et
  débloque tout, y compris les récompenses à venir ; ton XP réelle continue d'être comptée et un
  bouton *Désactiver* te rend ta vraie progression.
- **Personnaliser** (menu principal ou écran Progression) : couleur de la lampe (Standard, puis
  Chaude, Néon bleu, UV, Rouge au niveau 10) et tenue du Chirurgien (l'original, *la Veilleuse
  de nuit* au niveau 15, *le Patient zéro* au niveau 20). Le Chirurgien pose dans le hall sous ta
  lampe pendant que tu choisis (glisse pour le faire tourner) ; ce qui est encore verrouillé se
  prévisualise. Visuel seulement : même squelette, mêmes animations, même IA.
- **Pilote auto** (niveau 5, panneau Entraînement) : *Meilleure* (la sortie la plus rapide de la
  seed) ou une sortie imposée. Le jeu calcule la route optimale de la seed (ordre des objets,
  notes, coffres, portes, conduits, fenêtres, ascenseur, inventaire à 2 places) puis ton perso la
  joue vraiment, avec les mêmes commandes que toi. Le bandeau montre l'étape en cours, ce qu'il
  fait et le temps théorique de chaque étape ; il finit 20 à 30 s au-dessus du temps théorique
  (petites pauses après les actions) pour que tu puisses suivre. Échap → *Prendre la main*.
  Rien n'est compté.

## Confort

- **Carnet** (Tab) : codes notés, avancement de chaque sortie (cases à cocher), objets repérés
  avec la pièce où tu les as vus. Le jeu continue pendant que tu lis.
- **Regarder derrière soi** en maintenant V, même en courant.
- **Repérage ressenti** : les bords de l'écran s'assombrissent et pulsent, et un son monte
  quand le monstre commence à te repérer, avant qu'il ne crie.
- **Écran de fin** : en cas de capture, le récap « Comment il t'a eu » (ce qu'il a entendu ou
  vu, où et quand, avec un conseil). Onglet **Carte** : ton trajet et le sien, étage par étage,
  avec les détections, les objectifs et un curseur pour rejouer la run dans le temps.
- **Rejouer cette seed** depuis l'écran de fin, la pause ou l'historique (la run compte alors
  en *Set Seed*).
- **Records → Historique / Stats** : tes 60 dernières runs (avec « Rejouer »), taux d'évasion,
  meilleur temps par sortie, causes de capture les plus fréquentes.
- **Luminosité** : calibrage au premier lancement, réglable ensuite dans les options.

## Graphismes et performances

*Options → Graphismes* :

| Preset | Rendu | Ombres de la lampe | Post-traitements |
| --- | --- | --- | --- |
| Low | 72 % | 512, PCF bas | FXAA |
| Medium | 90 % | 1024, PCF moyen | FXAA, bloom léger, grain |
| High | 100 % | 2048, PCF haut | FXAA, bloom, grain, SSAO léger, aberration chromatique |

- Cible : **60 fps en 1080p Medium** sur iGPU type Ryzen 5 5500U / Vega 7, Low pour tout iGPU
  de 2020 ou plus récent.
- **Résolution dynamique** (option) : baisse l'échelle de rendu par petits pas si le fps moyen
  passe sous 58 (ou sous la fréquence de l'écran), remonte doucement ensuite.
- **Compteur de FPS** (option) : fps, pire frame, temps CPU, draw calls, meshes actifs,
  résolution de rendu.
- Éclairage entièrement **précalculé au chargement** (par sommet, ombres comprises) : une seule
  lumière dynamique (la lampe torche). Culling par portails entre les zones, props en thin
  instances, matériaux gelés.

Tous les réglages d'équilibrage (vitesses, IA, chrono, notes, audio, presets…) sont dans
[`src/config.ts`](src/config.ts).

## Structure

```
src/
  main.ts                 démarrage (et ?map : plan de l'hôpital en 2D)
  config.ts               TOUTES les valeurs d'équilibrage et de rendu
  core/                   App (machine à états, boucle), entrées, touches, réglages, RNG, stockage
  run/                    chrono, splits, notes, records, gestion de la run, XP, cosmétiques
  player/                 joueur (capsule), caméra, lampe torche, jauge de sprint
  physics/                monde de collision (boîtes orientées, rampes, raycast), déplacement
  world/
    layout/               plan de l'hôpital en données (niveaux, pièces, ouvertures, escaliers)
    builder/              génération des murs, sols, plafonds, escaliers, fenêtres, toit, extérieur
    decor/                habillage des pièces par thème, decals
    lighting/             luminaires, voxelisation, éclairage précalculé
    props/                kit de modélisation procédurale, système de props (thin instances)
  render/                 moteur, post-traitements, résolution dynamique, ciel, brouillard,
                          culling par portails, animation des lumières
    textures/             textures PBR procédurales (+ pool de Web Workers)
    materials/            bibliothèque de matériaux, matériaux émissifs
  gameplay/               objets, inventaire, portes et serrures, coffres, courant, ascenseur,
                          sorties, cachettes, fenêtres, pièges, bruit, planificateur de seed
  autopilot/              pilote auto : planificateur de route optimale (A*) et exécution
  ai/                     modèle skinné du monstre, animations procédurales, navmesh, comportements
  cinema/                 réalisateur (caméra en splines), dialogues, scripts intro / outros
  audio/                  moteur WebAudio, recettes de sons, ambiance / musique, chef d'orchestre
  ui/                     menus, options, HUD, écrans de pause / fin / records / personnalisation, overlays
```

Le détail des phases de développement, de ce qui a été fait et des **compromis techniques** est
dans [`PLAN.md`](PLAN.md).

## Paramètres de debug (URL)

`?debug` active l'accès console `window.__game` et le compteur de FPS. Options combinables :
`autostart` (lance une run), `skipintro`, `nolock` (sans pointer lock), `seed=XXXX`,
`preset=low|medium|high`, `fixedres` (sans résolution dynamique), `bright` (éclairage plein
jour), `nocull` (sans culling), `autopilot[=gate|ambulance|roof]` (avec `autostart` : entraînement
joué par le pilote auto). `?map` affiche le plan 2D de l'hôpital.
