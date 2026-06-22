// Flags de lancement — RÉVERSIBLES.
//
// Session 17 : lancement « Outlook-only ». On masque l'entrée Gmail dans TOUTE
// l'app (boutons + mentions), SANS rien supprimer. Le pipeline n8n Gmail reste
// 100% intact ; ceci ne cache que l'entrée Gmail côté UI. Les boîtes Gmail déjà
// connectées restent affichées dans la liste et continuent d'être relevées.
//
// Pour RÉACTIVER Gmail plus tard : poser la variable d'env Expo
//   EXPO_PUBLIC_ENABLE_GMAIL=true
// (ou repasser la valeur par défaut ci-dessous à true). Aucune autre modif requise.
export const GMAIL_ENABLED = process.env.EXPO_PUBLIC_ENABLE_GMAIL === 'true';
