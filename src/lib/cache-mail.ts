import { apiPost } from './api';

/**
 * Corps et résumé d'un mail, mémorisés le temps que l'app tourne.
 *
 * POURQUOI — constat de HA le 11/08/2026 : « quand je pars et reviens sur le
 * mail il se recharge », et « le résumé ne devrait pas se recharger à chaque
 * fois, il doit être retenu comme le mail ».
 *
 * Le serveur a désormais son propre cache (table `item_bodies`), ce qui supprime
 * l'appel au fournisseur et l'appel au modèle. Mais il reste un aller-retour
 * réseau, donc un « Chargement du message… » qui clignote à chaque retour sur un
 * mail déjà lu. Ici, le deuxième affichage ne coûte RIEN : ni réseau, ni attente.
 *
 * ⚠️ La mémorisation vit dans le module, donc elle meurt avec l'app. C'est
 * voulu : le cache durable est en base, celui-ci n'est là que pour le confort de
 * navigation. Un échec n'est PAS mémorisé — sinon une coupure d'une seconde
 * condamnerait le mail jusqu'au redémarrage de l'app.
 */

export type Corps = {
  corps?: string;
  source?: string;
  avertissement?: string;
  estFil?: boolean;
  messages?: number;
};

// ⚠️ DEUX TABLES PAR RESSOURCE, ET CE N'EST PAS DU ZÈLE.
// Mémoriser la PROMESSE évite de refaire l'appel, mais pas le clignotement : au
// remontage de l'écran, l'état repart en « chargement » et une promesse, même
// déjà résolue, ne se lit qu'au tour de boucle suivant. HA : « bug d'un instant
// sur le corps du mail quand je le rouvre ». On garde donc aussi la VALEUR,
// lisible SYNCHRONEMENT au premier rendu.
const corps = new Map<string, Promise<Corps>>();
const corpsResolus = new Map<string, Corps>();
const resumes = new Map<string, Promise<string>>();
const resumesResolus = new Map<string, string>();

/** Le corps déjà connu, ou `null`. À lire pendant le rendu, sans await. */
export function corpsEnCache(itemId: string): Corps | null {
  return corpsResolus.get(itemId) ?? null;
}

/** Le résumé déjà connu, ou `null`. */
export function resumeEnCache(itemId: string, locale: string): string | null {
  return resumesResolus.get(`${itemId}|${locale}`) ?? null;
}

export function lireCorps(itemId: string): Promise<Corps> {
  const deja = corps.get(itemId);
  if (deja) return deja;
  const p = apiPost<Corps>('/api/message-body', { itemId });
  corps.set(itemId, p);
  p.then((v) => corpsResolus.set(itemId, v)).catch(() => corps.delete(itemId));
  return p;
}

/** La langue fait partie de la clé : changer de langue doit redemander le résumé. */
export function lireResume(itemId: string, locale: string): Promise<string> {
  const cle = `${itemId}|${locale}`;
  const deja = resumes.get(cle);
  if (deja) return deja;
  const p = apiPost<{ summary?: string }>('/api/summary', { id: itemId, locale }).then(
    (r) => String(r?.summary || ''),
  );
  resumes.set(cle, p);
  p.then((v) => resumesResolus.set(cle, v)).catch(() => resumes.delete(cle));
  return p;
}
