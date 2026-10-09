# Glisser un mail, sélectionner plusieurs mails — rendu de l'app (09/10/2026)

Même chantier que `Veille Email/scripts/essais-selection/LISEZ-MOI.md` (les choix de HA,
les choix par défaut, ce qui n'a pas pu être vérifié y sont écrits).

## Les fichiers de l'app

- `src/lib/actions-groupees.ts` et `src/lib/i18n/selection-mails.ts` : LES MÊMES que dans
  le web (`apps/web/src/lib/…`). Si l'un change, copier l'autre à l'identique.
- `src/components/ligne-glissable.tsx` : glisser à droite = archiver (vert), à gauche =
  corbeille (rouge), jusqu'au bout (35 % de la largeur) pour agir.
- `src/components/selection-mails.tsx` : la barre du bas (✕, « N sélectionnés », Tout,
  les actions) et le bandeau « Annuler » (8 s).
- `src/components/email-row.tsx` : appui long (350 ms), case à la place de l'avatar.
- `src/app/(tabs)/index.tsx` : l'écran Emails relie le tout. Le bouton « retour »
  d'Android et le changement de dossier ferment la sélection.

## Le rendu

`bash scripts/rendu-selection/lancer.sh <dossier>` écrit `vues-app.json` (chaque vue en HTML) avec les vrais
composants (react-native-web) ; les doublures remplacent ce qui n'existe qu'au téléphone
(geste, animations, icônes SVG, largeur d'écran fixée à 390). C'est une IMAGE FIXE : elle
montre les couleurs et la place des choses, pas la sensation du doigt.

Rendu du 09/10/2026 : `Veille Email/Claude outputs/app-glisser-selection.png`.
