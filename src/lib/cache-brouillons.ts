import AsyncStorage from '@react-native-async-storage/async-storage';

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
  /**
   * Pieces jointes DEJA chez le fournisseur (15/08/2026). Remontees par
   * `list-drafts` cote n8n et laissees passer par `/api/drafts`.
   *
   * `null` ou absent = JE NE SAIS PAS (lecture en echec, ou workflow anterieur).
   * `[]` = ce brouillon n'en a aucune. La page distingue les deux.
   */
  attachments?:
    | { filename: string; mimeType?: string | null; size?: number | null; attachmentId?: string }[]
    | null;
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

// ============================================================================
// LA LISTE DE LA DERNIERE VISITE — 16/09/2026. Jumeau de
// `Veille Email/apps/web/src/lib/cache-brouillons.ts` : memes regles.
//
// MESURE en production le 16/09 (9 brouillons) : `/api/drafts` repond en
// 7,4 s a froid, puis 2,6 a 3,0 s — n8n (demarrage 1,6 s a froid, lecture des
// comptes 0,8 a 2,1 s, Gmail 0,9 a 1,1 s). L'ecran affiche donc d'abord la
// liste de la derniere visite, puis la remplace par la vraie.
//
// ⚠️ CONFIDENTIALITE : pas de corps (apercu coupe a 240 caracteres), une cle
// par utilisateur, effacee a la deconnexion et a l'expiration de la session
// (`context/auth.tsx`). La copie ne remplit PAS la Map ci-dessus : la page
// d'un brouillon a besoin du corps.
// ============================================================================

const PREFIXE_LISTE = 'vmail.brouillons.liste.v1:';
const APERCU_MAX = 240;

export type ListeMemorisee<V> = { enregistreLe: number; brouillons: Brouillon[]; vmail: V[] };

/** La liste de la derniere visite de CET utilisateur, ou `null`. */
export async function lireListeMemorisee<V>(userId: string): Promise<ListeMemorisee<V> | null> {
  if (!userId) return null;
  let brut: string | null = null;
  try {
    brut = await AsyncStorage.getItem(PREFIXE_LISTE + userId);
  } catch (e) {
    // L'ecran marche comme avant, sans liste immediate — mais ca se voit.
    console.warn('[brouillons] lecture de la copie locale impossible', e);
    return null;
  }
  if (!brut) return null;
  try {
    const v = JSON.parse(brut) as ListeMemorisee<V>;
    if (!v || !Array.isArray(v.brouillons) || !Array.isArray(v.vmail)) return null;
    return v;
  } catch (e) {
    console.warn('[brouillons] copie locale illisible, ignoree', e);
    AsyncStorage.removeItem(PREFIXE_LISTE + userId).catch((e2) =>
      console.warn('[brouillons] copie illisible non effacee', e2),
    );
    return null;
  }
}

/** Depose la liste qu'on vient de lire, SANS les corps. */
export function memoriserListe<V extends { body?: string | null }>(
  userId: string,
  brouillons: Brouillon[],
  vmail: V[],
): void {
  if (!userId) return;
  const couper = (s: string | null | undefined) => (s ? String(s).slice(0, APERCU_MAX) : s ?? null);
  const valeur: ListeMemorisee<V> = {
    enregistreLe: Date.now(),
    brouillons: (brouillons || []).map((d) => ({ ...d, body: null, preview: couper(d.preview) })),
    // Les brouillons Vmail n'ont pas d'apercu separe : leur `body` en tient lieu.
    vmail: (vmail || []).map((d) => ({ ...d, body: couper(d.body) ?? '' })),
  };
  AsyncStorage.setItem(PREFIXE_LISTE + userId, JSON.stringify(valeur)).catch((e) =>
    console.warn('[brouillons] copie locale non enregistree', e),
  );
}

/** Efface les copies de TOUS les utilisateurs de cet appareil. */
export async function effacerListesMemorisees(): Promise<void> {
  try {
    const cles = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIXE_LISTE));
    if (cles.length) await AsyncStorage.multiRemove(cles);
  } catch (e) {
    console.warn('[brouillons] copies locales non effacees', e);
  }
}
