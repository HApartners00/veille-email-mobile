# Écran Emails : glisser, « Annuler », sélection — essais (09/10/2026)

## Pourquoi

Retour de HA après la première version : « le swipe est un peu bugué : le mail clignote
pendant qu'on le glisse, et le message pour annuler vient 2 s après, c'est trop long ».

Ce qui a été trouvé en LISANT le code (pas vu sur un téléphone) :

1. **Le clignement.** La couleur « appuyé » d'une ligne était transparente
   (`rgba(234,225,208,0.06)`). Derrière la ligne il y a le panneau rouge / vert du
   glissement : au début du geste, on le voyait À TRAVERS le mail, puis plus.
   → couleur opaque, même teinte (`#2d2a24`) ; l'appui ne colore la ligne qu'après 80 ms.
2. **Les 2 s.** Deux attentes s'ajoutaient :
   - `onSwipeableOpen` n'arrive qu'à la fin du ressort : ~650 ms après qu'on lâche
     (calculé avec les formules de Reanimated 4.1.7). → seuil d'arrêt 1e-4 : ~350-380 ms ;
   - puis l'écran attendait la réponse de la messagerie avant le bandeau (durée non
     mesurée : les journaux Vercel n'étaient pas accessibles). → pour UN mail, le bandeau
     apparaît tout de suite ; un refus le corrige et remet la ligne.
3. **En plus.** Entrer en sélection démontait et remontait toutes les lignes (le geste
   était retiré au lieu d'être coupé). → `enabled={false}`.

« Annuler » fonctionne même si la messagerie n'a pas encore répondu : la ligne revient
tout de suite, puis on défait ce qui a réussi. Plusieurs mails : inchangé.

## L'essai

`bash scripts/essais-ecran/lancer.sh <jsdom/lib/api.js> <dossier de tsx>`

29 vérifications sur le VRAI écran (src/app/(tabs)/index.tsx) : bandeau avant la
réponse, refus (ligne remise, phrase de la messagerie, panne écrite dans la console),
« Annuler » avant / après la réponse, échec après « Annuler », « Annuler » refusé (liste
relue), sélection (geste coupé, lignes NON remontées), lot de 2 inchangé.

09/10/2026 : **29 / 29**. Contre-épreuve : avec l'ancien écran, l'essai échoue bien sur
« bandeau AVANT la réponse ».

## Ce qui n'a pas pu être vérifié

- La sensation du doigt sur un vrai téléphone (le geste est une doublure ici).
- Le délai réel entre « lâcher » et le bandeau : calculé (~0,35 s), pas mesuré.
- Le web garde l'ancien comportement (bandeau après la réponse) : à faire ensuite.
