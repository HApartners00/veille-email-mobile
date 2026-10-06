/**
 * BOÎTES YAHOO ET ICLOUD — ce que l'app mobile a besoin d'en savoir. 06/10/2026.
 *
 * Gmail et Outlook se connectent en un clic (on part chez Google ou Microsoft, on dit oui,
 * on revient). Yahoo et iCloud n'offrent pas ce chemin : le client crée un « mot de passe
 * d'application » chez son fournisseur et le donne à Vmail. D'où un écran à part
 * (`src/app/connecter-imap.tsx`).
 *
 * JUMEAU de deux fichiers du web : `apps/web/src/lib/providers.ts` et
 * `apps/web/src/lib/imap/fournisseurs.ts`. Tout ce qui est ici en est RECOPIÉ, et un essai
 * du dépôt web le compare (`scripts/essais-imap/textes-mobile.test.ts`).
 *
 * CE QUI N'EST PAS ICI, et ne doit pas y venir : les serveurs IMAP / SMTP et le mot de
 * passe lui-même. L'app ne parle jamais à Yahoo ni à Apple : elle envoie l'adresse et le
 * code à `/api/connect/imap`, qui essaie la boîte et range le code chiffré.
 */

export const FOURNISSEURS_IMAP = ['yahoo', 'icloud'] as const;
export type FournisseurImap = (typeof FOURNISSEURS_IMAP)[number];

/**
 * Lecture STRICTE : rend `yahoo` ou `icloud` (en minuscules, sans espaces), sinon `null`.
 * Aucun repli : une valeur inconnue n'est rangée nulle part, c'est à l'appelant de refuser.
 */
export function lireFournisseurImap(v: unknown): FournisseurImap | null {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return (FOURNISSEURS_IMAP as readonly string[]).includes(s) ? (s as FournisseurImap) : null;
}

/** Le nom de la boîte, tel qu'on l'écrit au client. */
export const LIBELLE_IMAP: Record<FournisseurImap, string> = { yahoo: 'Yahoo', icloud: 'iCloud' };

/** Celui chez qui le client crée son code. La boîte iCloud se règle sur le compte Apple. */
export const EDITEUR_IMAP: Record<FournisseurImap, string> = { yahoo: 'Yahoo', icloud: 'Apple' };

/** La forme sous laquelle chaque fournisseur AFFICHE son code — pour que le client le reconnaisse. */
export const EXEMPLE_CODE: Record<FournisseurImap, string> = {
  yahoo: 'abcd efgh ijkl mnop',
  icloud: 'abcd-efgh-ijkl-mnop',
};

/** Page du fournisseur où le client crée son mot de passe d'application. */
export const PAGE_MOT_DE_PASSE: Record<FournisseurImap, string> = {
  yahoo: 'https://login.yahoo.com/account/security',
  icloud: 'https://account.apple.com/account/manage',
};

// Yahoo : yahoo.com, yahoo.fr, yahoo.co.uk, yahoo.com.br… + ses anciens domaines.
const DOMAINE_YAHOO = /^(yahoo\.[a-z]{2,3}(\.[a-z]{2})?|ymail\.com|rocketmail\.com|myyahoo\.com)$/;
const DOMAINES_ICLOUD = ['icloud.com', 'me.com', 'mac.com'];

/**
 * Le fournisseur IMAP d'une adresse, ou `null` si son domaine n'est pas pris en charge.
 * Aucun repli : `null` veut dire « on refuse », pas « on essaie quand même ».
 *
 * Le serveur refait ce contrôle (c'est lui qui décide). Celui-ci sert à répondre tout de
 * suite, et à refuser une adresse iCloud tapée dans l'écran Yahoo : le serveur, lui,
 * l'accepterait, et le client lirait « connecté » sur une boîte qui n'est pas celle qu'il croit.
 */
export function fournisseurImapDeLAdresse(email: unknown): FournisseurImap | null {
  const adresse = String(email ?? '')
    .trim()
    .toLowerCase();
  const arobase = adresse.lastIndexOf('@');
  if (arobase < 1) return null;
  const domaine = adresse.slice(arobase + 1);
  if (DOMAINE_YAHOO.test(domaine)) return 'yahoo';
  if (DOMAINES_ICLOUD.includes(domaine)) return 'icloud';
  return null;
}
