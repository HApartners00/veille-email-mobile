/**
 * Marqueurs d'etat d'un mail — JUMEAU EXACT de la version web
 * (`Veille Email/apps/web/src/lib/mail-state.ts`).
 *
 * Regle d'alignement posee par HA le 07/08/2026 : le design reste propre a chaque
 * plateforme, TOUT LE RESTE doit etre identique — meme logique, memes filtres, memes
 * fonctions, memes libelles dans les 8 langues. Ce fichier est donc une copie de
 * comportement, pas une reinterpretation. Toute modification ici doit etre faite
 * la-bas, et reciproquement.
 *
 * `pub`, `archive`, `spam` et `corbeille` sont des MARQUEURS, pas des categories : un
 * mail garde son urgent/important/human/info et porte EN PLUS l'un de ces marqueurs.
 * Deux raisons, payees d'avance cote web :
 *   1. le tri (prompt v8) est GELE depuis le 04/08 ;
 *   2. l'ingestion « remonte » la categorie d'un item quand une meilleure arrive — si
 *      `pub` avait ete une categorie, le digest aurait pu repromouvoir une publicite
 *      et la ramener dans le fil.
 */

/** Onglets Gmail mis de cote : Promotions, Reseaux sociaux, Forums.
 *  ⚠️ PAS l'onglet Notifications (CATEGORY_UPDATES) — decision mesuree du 08/08. */
export const TAG_PUB = 'pub';

/** Le mail n'est plus dans la boite de reception du fournisseur (archive, deplace). */
export const TAG_ARCHIVE = 'archive';

/** Courrier indesirable chez le fournisseur. Separe de `pub` : une pub est un mail
 *  legitime mal place, un spam ne l'est pas. */
export const TAG_SPAM = 'spam';

/** Corbeille Vmail. La ligne est GARDEE 30 jours, elle n'est plus effacee (09/08). */
export const TAG_TRASH = 'corbeille';

/** Marqueurs qui sortent un mail de l'accueil ET du fil par defaut. */
export const TAGS_HORS_FLUX = [TAG_PUB, TAG_ARCHIVE, TAG_SPAM, TAG_TRASH] as const;

/**
 * Le marqueur d'un mail, ou `null` s'il est dans le flux principal.
 *
 * ORDRE IMPORTANT, identique au web : corbeille d'abord. Un mail supprime qui
 * porterait AUSSI `pub` ou `archive` doit compter comme supprime, sinon il
 * apparaitrait dans une liste d'ou on ne pourrait pas le restaurer.
 */
export function marqueurDe(tags: string[] | null | undefined): string | null {
  const t = (tags || []).map((x) => (x || '').toLowerCase());
  if (t.includes(TAG_TRASH)) return TAG_TRASH;
  if (t.includes(TAG_SPAM)) return TAG_SPAM;
  if (t.includes(TAG_PUB)) return TAG_PUB;
  if (t.includes(TAG_ARCHIVE)) return TAG_ARCHIVE;
  return null;
}
