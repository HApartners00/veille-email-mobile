/**
 * Petit relais pour transmettre un filtre de priorite a l'onglet Feed
 * (ex. depuis une carte de stats de l'Accueil) sans dependre des params
 * de navigation entre onglets.
 */
let pending: string | null = null;

export function setPendingFeedFilter(key: string | null) {
  pending = key;
}

/** Renvoie le filtre en attente et le consomme (usage unique). */
export function consumePendingFeedFilter(): string | null {
  const v = pending;
  pending = null;
  return v;
}
