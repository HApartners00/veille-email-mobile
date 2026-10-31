# Lecteur de mails + VoiceOver — essais (plan n°30, 31/10/2026)

## Pourquoi

L'audit 360 (constat 9.3) : le corps d'un mail s'affiche dans une WebView avec JavaScript
actif, protégé par un seul nettoyage par expressions régulières, sans CSP. Et des boutons
qui ne sont qu'une icône (flèche retour, croix) sont muets pour VoiceOver.

Ce qui a été MESURÉ avant la correction (page exacte de l'app, rejouée dans Chromium) :

1. **3 scripts d'un mail s'exécutaient** : `<img src="x"/onerror=…>` et `<svg/onload=…>`
   dès l'ouverture du mail (la regex cherche un espace avant `on…`, pas une barre
   oblique), et un lien `java&#x73;cript:` au toucher.
2. **Safari s'ouvrait tout seul** : `<meta http-equiv="refresh" content="0;url=…">`
   faisait ouvrir une fausse page à l'ouverture du mail, sans aucun toucher.
3. **Un formulaire laissé ouvert passait** (la regex attend `</form>`) : « Valider »
   ouvrait Safari avec le mot de passe tapé dans l'adresse.
4. `<base href>` envoyait les liens relatifs chez un autre site.
5. 15 boutons-icônes sans nom pour VoiceOver, 4 interrupteurs sans nom, et le bouton micro
   d'un mail nommé seulement en français ou en anglais.

## Ce qui a changé

- `src/components/mail-html.tsx`
  - une **CSP** est la première balise de la page : `script-src 'none'`, pas de cadre, de
    plug-in, d'envoi de formulaire ni de `<base>` ; images, styles, polices permis ;
  - le nettoyage retire aussi `<meta>`, `<base>` et les `<form>/<embed>/<object>` ouverts,
    et il est **repassé jusqu'à ce que plus rien ne change** (relecture du 31/10 : un seul
    passage recollait `<me<form>ta …>` en vraie balise `<meta>`) ; une balise dangereuse
    restée entière devient du texte ;
  - `aiguiller()` : sur iPhone, rien ne sort **sans un doigt** (seul `navigationType`
    « click » ouvre Safari) ; `data:` et les schémas d'autres apps sont bloqués ;
    **changement** : `mailto:` / `tel:` tapés s'ouvrent dans Mail / Téléphone (avant, ils
    étaient laissés à la WebView, qui ne sait pas les ouvrir).
  - `originWhitelist={['*']}` est gardé exprès : le restreindre ferait ouvrir Safari par
    react-native-webview lui-même, sans toucher.
- 15 boutons-icônes : `accessibilityRole="button"` + `accessibilityLabel` (Retour, Fermer,
  « Retirer la pièce jointe {nom du fichier} »).
- 4 interrupteurs (`Switch`) : nommés avec le texte affiché à côté.
- Bouton micro : `t.email.talkToAssistant` (8 langues) au lieu de « fr ou en ».
- `src/lib/i18n/messages.ts` : `common.back`, `common.removeAttachment`,
  `email.talkToAssistant`, 8 langues.

## L'essai

```
node scripts/essais-n30/essai-n30.test.cjs
```

- Partie A (sans navigateur, il suffit de `typescript`) : boutons et interrupteurs sans
  nom, textes dans les 8 langues, `aiguiller()` sur 15 cas, nettoyage (dont 8 « morceaux
  recollés »), place de la CSP.
- Partie B (Chromium via Playwright, **sautée et dite** si Playwright manque) : 8 mails
  piégés, un mail normal (hauteur, échelle, images, style, lien tapé), la CSP SEULE sur du
  HTML non nettoyé (le jour où une regex rate, la CSP tient), et le garde SEUL face à une
  redirection non nettoyée.

31/10/2026 : **77 / 77**. Contre-épreuve : sur l'ancien code, **26 / 42** (les échecs sont
exactement les failles ci-dessus).

Une relecture indépendante (autre agent, sans mes conclusions) a trouvé le défaut du
nettoyage en un seul passage, le cas `target="_blank"` des liens mailto, et des essais trop
gentils (le nettoyage retirait la charge avant que le garde soit essayé). Corrigé : essais
A4 « morceaux recollés » et B4 « le garde seul sur du HTML non nettoyé ».

Outils : `boutons-sans-nom.cjs <src>` liste les boutons muets ; `essai-lecteur.cjs <src>`
raconte chaque mail piégé ; `charger-lecteur.cjs` charge le VRAI `mail-html.tsx` avec des
doublures de React Native (rien n'est recopié à la main).

## Ce qui n'a pas pu être vérifié ici

- **Le WebKit de l'iPhone** : tout est mesuré dans Chromium. Que le script de mesure de
  l'app (injecté comme WKUserScript, hors de la page) tourne malgré `script-src 'none'`
  est le comportement attendu de WebKit, **pas vu sur un téléphone** : c'est le test à
  faire après `eas update` (un mail s'affiche-t-il en entier ?).
- VoiceOver lui-même (les libellés sont dans le code ; personne ne les a écoutés).
- Android : la règle « sans un doigt » ne s'y applique pas (pas de `navigationType`).
- Le type « click » / « other » donné à chaque navigation est celui que WebKit déclare
  (lu dans react-native-webview 13.15.0), pas observé sur un iPhone.
- Reste ouvert, dit franchement : une redirection vers `about:blank` viderait la feuille
  (elle ressemble au premier chargement). Seul le nettoyage l'empêche, en retirant toute
  balise `<meta>`.
- Le script de mesure tourne dans Chromium via `page.evaluate`, qui ignore la CSP : ça ne
  prouve PAS qu'il tourne sous la CSP dans WKWebView (c'est le test sur iPhone).
