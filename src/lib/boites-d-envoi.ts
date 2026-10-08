/**
 * LES BOÎTES DEPUIS LESQUELLES ON PEUT ÉCRIRE — lot 4, 08/10/2026.
 *
 * Jusqu'ici les écrans de rédaction lisaient `/api/connect/list`, qui ne rend que les boîtes
 * Gmail et Outlook : `/api/compose` ne savait envoyer que par elles. Depuis ce lot, elle sait
 * aussi envoyer depuis une boîte Yahoo ou iCloud. Les écrans lisent donc la liste COMPLÈTE.
 *
 * ⚠️ JUMEAU : `Veille Email/apps/web/src/lib/boites-d-envoi.ts`, le même fichier à cette ligne près.
 */

/** La liste complète (Gmail, Outlook, Yahoo, iCloud). Répond 500 si la base ne se lit pas. */
export const LISTE_DES_BOITES_D_ENVOI = '/api/connect/list?famille=toutes';

export type BoiteDEnvoi = { email: string; provider: string };

const PAR_JETON = new Set(['gmail', 'outlook']);

/**
 * La liste à montrer dans le champ « De » : une ligne par ADRESSE.
 *
 * Une même adresse peut être connectée de deux façons (une adresse Yahoo branchée par le
 * bouton Outlook, puis par Yahoo). La liste complète la rend alors deux fois. On n'en montre
 * qu'une, et c'est la connexion Gmail / Outlook : c'est par elle que `/api/compose` envoie
 * dans ce cas. L'écran montre ce que le serveur fera.
 *
 * Ce qu'on ne sait pas lire (pas une liste, une ligne sans adresse) est écarté : la liste
 * rendue peut être vide, jamais fausse.
 */
export function boitesDEnvoi(brut: unknown): BoiteDEnvoi[] {
  const parAdresse = new Map<string, BoiteDEnvoi>();
  for (const m of Array.isArray(brut) ? brut : []) {
    const email = typeof m?.email === 'string' ? m.email.trim() : '';
    if (!email) continue;
    const boite: BoiteDEnvoi = { email, provider: typeof m?.provider === 'string' ? m.provider : '' };
    const cle = email.toLowerCase();
    const deja = parAdresse.get(cle);
    if (!deja || (!PAR_JETON.has(deja.provider) && PAR_JETON.has(boite.provider))) parAdresse.set(cle, boite);
  }
  return [...parAdresse.values()];
}
