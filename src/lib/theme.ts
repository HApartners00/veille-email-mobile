/**
 * Système de design « S2 » partagé avec le web et le digest.
 * Sidebar/headers sombres (charbon) + contenu crème + accent terracotta.
 */
export const colors = {
  // Surfaces
  charcoal: '#211e19',
  charcoalSoft: '#2a251e',
  charline: '#37322b',

  // ==========================================================================
  // FOND DE PAGE SOMBRE — 11/08/2026, demande de HA : « c'est QUE le fond en
  // fonce. Les bandeaux des mails restent en clair, et les boutons dans
  // Reglages aussi. »
  //
  // ⚠️ POURQUOI UN JETON DEDIE ET PAS `cream` FONCE : `cream` sert DEUX roles
  // dans ce code. Fond de page, oui — mais aussi TEXTE CLAIR pose sur les
  // boutons terracotta (`sendBtnText`, `saveText`, `dayTextOn`...) et fond des
  // puces claires des Reglages. Le foncer basculait donc tout d'un coup :
  // texte sombre sur bouton sombre, puces invisibles. Les deux roles sont
  // desormais separes ; seul `fond` est sombre.
  //
  // Revenir en arriere = mettre `fond: '#faf7f0'`. Rien d'autre.
  // ==========================================================================
  /** Fond des ecrans, et LUI SEUL. */
  fond: '#211e19', //  clair : '#faf7f0'
  /** Version transparente de `fond` — pour les degrades de coupe. */
  fondT: 'rgba(33,30,25,0)',

  // ⚠️ LES SURFACES CLAIRES SONT RECHAUFFEES — HA, 11/08 : « le fond j'aime
  // bien, c'est le clair que j'aime pas, c'est trop blanc ». Du blanc pur sur
  // du charbon fait des blocs qui sautent aux yeux ; un crème chaud garde la
  // lisibilité du texte sombre sans trouer la page.
  //   surface  #ffffff -> #f2ece0   (les cartes : mails, boutons, Réglages)
  //   creamAlt #f3eee3 -> #e9e2d3   (les fonds secondaires, un cran en dessous)
  //   cardline #e4dcc9 -> #d9d0ba   (les bordures, pour rester visibles)
  // ⚠️ `surfaceT` DOIT suivre `surface` : c'est le départ transparent du dégradé
  // de coupe de l'onglet Envoyés. Laissé sur du blanc, il teinterait le fondu.
  cream: '#f2ebde',
  creamAlt: '#e4dccb',
  surface: '#eae1d0',
  cardline: '#d3c9b2',
  line: '#d9cfba',
  avatar: '#ddd3bd',

  /** Version transparente de `surface` — doit rester la même teinte. */
  surfaceT: 'rgba(234,225,208,0)',

  // Texte
  ink: '#1a1a17',
  ink2: '#2a2a25',
  // ==========================================================================
  // ⚠️ `muted` EST LE JETON DU TEXTE SECONDAIRE SUR SURFACE CLAIRE, ET LUI SEUL.
  //
  // Mesure du 12/08/2026 : a #857f70 il donnait 3,07:1 sur les cartes creme —
  // sous le seuil AA de 4,5:1. Le HANDOFF proposait #6b6455 « en un jeton » ;
  // c'etait faux, parce que `muted` servait AUSSI de texte sur le fond sombre,
  // ou il passait de 4,17:1 a 2,83:1. Exactement le piege deja paye par `cream`
  // (voir plus haut) : un jeton, deux roles.
  //
  // Les deux roles sont donc separes. Les huit endroits qui posaient du `muted`
  // sur le fond sombre prennent desormais `onDarkMuted` (5,9 a 6,3:1) :
  //   attachments (sous-titre, intro) · rules (sous-titre) · style (sous-titre)
  //   drafts (liste vide) · sent (liste vide) · email/[id] (liste vide,
  //   « L'IA redige… », intitules du brouillon) · mail-actions (indicateur)
  //
  // #6b6455 -> 4,52:1 sur `surface`, 4,95:1 sur `cream`. Retour arriere :
  // remettre '#857f70' ICI et rebasculer ces huit endroits sur `muted`.
  // ==========================================================================
  muted: '#6b6455',
  hint: '#a8a291',
  // ⚠️ ESSAI HA du 11/08 : « toutes les polices blanches dans cette meme
  // couleur ». Le texte clair ne prend plus le creme d'origine (#faf7f0, quasi
  // blanc) mais EXACTEMENT la teinte des cartes (#eae1d0). Bandeaux, boutons
  // terracotta et textes sur fond sombre parlent donc la meme langue que le
  // reste de l'app. Retour en arriere : remettre '#faf7f0' ici et relancer le
  // remplacement inverse des rgba(234,225,208,...) -> rgba(250,247,240,...).
  onDark: '#eae1d0',
  onDarkMuted: 'rgba(234,225,208,0.66)',

  // Accents
  terracotta: '#c2410c',
  terracottaVivid: '#e85d0c',
  terracottaLight: '#e8956b',
  ocre: '#b8860b',
  taupe: '#4a443a',
  sage: '#3f7e58',
  danger: '#b8542e',
} as const;

/** Couleurs de priorité (alignées sur apps/web/src/lib/priority.ts). */
export const priorityColors: Record<string, string> = {
  urgent: '#c2410c',
  important: '#b8860b',
  human: '#4a443a',
  info: '#3f7e58',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/**
 * Polices de marque (chargées dans src/app/_layout.tsx).
 *
 * Inter pour TOUT le texte, Playfair Display réservé au logo — c'est la règle du web
 * (packages/config/tailwind-preset.cjs : « le serif éditorial est réservé au logo »).
 *
 * ⚠️ React Native n'hérite pas de fontFamily et ne synthétise pas les graisses d'une
 * police nommée : chaque style de texte doit choisir sa graisse explicitement ici,
 * et non via fontWeight.
 */
export const fonts = {
  // Texte — Inter
  sans: 'Inter_400Regular',
  sansItalic: 'Inter_400Regular_Italic',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  sansExtrabold: 'Inter_800ExtraBold',
  // Marque — Playfair Display (logo uniquement)
  serif: 'PlayfairDisplay_700Bold',
  serifItalic: 'PlayfairDisplay_700Bold_Italic',
  serifSemibold: 'PlayfairDisplay_600SemiBold',
} as const;
