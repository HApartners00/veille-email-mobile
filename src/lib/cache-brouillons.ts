import { apiGet } from './api';

/**
 * Les brouillons, memorises le temps que l'app tourne.
 *
 * POURQUOI CE MODULE EXISTE — 13/08/2026. Les brouillons ne sont PAS en base :
 * ils sont lus EN DIRECT chez le fournisseur (arbitrage du 07/08 — un brouillon
 * bouge tout le temps, un miroir en base afficherait des brouillons deja
 * supprimes dans Gmail). Il n'existe donc aucune route « donne-moi CE
 * brouillon » : `/api/drafts` les rend tous, et cet appel coute 1,5 a 2,5 s.
 *
 * La page `/brouillon/[id]` ne peut pas payer ca a chaque ouverture. La liste
 * depose donc ici ce qu'elle vient de lire, et la page y puise sans reseau.
 *
 * ⚠️ LE REPLI RESTE, ET IL EST INDISPENSABLE : la memoire vit dans le module,
 * donc elle meurt avec l'app. Une page ouverte par un lien profond, ou apres un
 * redemarrage, ne trouverait rien — dans ce cas on rappelle `/api/drafts`. Sans
 * ce repli, la page serait blanche sans dire pourquoi.
 *
 * Meme patron que `lib/cache-mail.ts` et `lib/feed-filter.ts`, deja en place.
 */

export type Brouillon = {
  id: string;
  accountEmail: string;
  provider: 'gmail' | 'outlook';
  subject: string | null;
  preview: string | null;
  body: string | null;
  recipients: { name?: string | null; email?: string | null; kind?: string | null }[];
  updatedAt: string | null;
  byVmail?: boolean;
};

const parId = new Map<string, Brouillon>();

/** Appelee par la liste a chaque lecture reussie. */
export function memoriserBrouillons(liste: Brouillon[]): void {
  // On REMPLACE au lieu de fusionner : un brouillon envoye ou supprime chez le
  // fournisseur doit disparaitre d'ici aussi, sinon la page en servirait un
  // fantome.
  parId.clear();
  for (const b of liste || []) {
    if (b && b.id) parId.set(String(b.id), b);
  }
}

/** Le brouillon deja connu, ou `null`. Lisible pendant le rendu, sans await. */
export function brouillonEnCache(id: string): Brouillon | null {
  return parId.get(String(id)) ?? null;
}

/** Retire une entree apres un envoi ou une suppression. */
export function oublierBrouillon(id: string): void {
  parId.delete(String(id));
}

/**
 * Le brouillon, du cache si possible, sinon relu chez le fournisseur.
 * Renvoie `null` si le fournisseur ne le connait plus — ce n'est PAS une erreur,
 * c'est un brouillon envoye ou supprime entre-temps, et l'appelant doit le dire.
 */
export async function lireBrouillon(id: string): Promise<Brouillon | null> {
  const deja = brouillonEnCache(id);
  if (deja) return deja;
  const j = await apiGet<{ ok?: boolean; drafts?: Brouillon[] }>('/api/drafts');
  const liste = Array.isArray(j?.drafts) ? j.drafts : [];
  memoriserBrouillons(liste);
  return brouillonEnCache(id);
}
