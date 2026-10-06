/**
 * COPIE (Cc) ET COPIE CACHEE (Cci) — 06/10/2026, demande de HA : « je dois
 * pouvoir mettre des gens en copie sur un mail ».
 *
 * Les libelles et la decoupe de la saisie, a UN seul endroit. Trois ecrans
 * affichent ces champs (message neuf, reponse, brouillon de la messagerie).
 * Jumeau de la fin de `Veille Email/apps/web/src/lib/copies-mail.ts` : les
 * memes huit langues, les memes mots.
 *
 * La VALIDATION des adresses n'est pas ici : c'est le serveur qui refuse
 * l'envoi (`lireCopies`, dans le meme fichier web), avec l'adresse fautive dans
 * le message. L'ecran affiche ce message tel quel.
 */

export type LibellesCopies = {
  /** Libelle du champ « copie ». */
  cc: string;
  /** Libelle du champ « copie cachee ». */
  cci: string;
  /** Le lien qui deplie les deux champs. */
  lien: string;
};

const LIBELLES: Record<string, LibellesCopies> = {
  fr: { cc: 'Cc', cci: 'Cci', lien: 'Cc Cci' },
  en: { cc: 'Cc', cci: 'Bcc', lien: 'Cc Bcc' },
  es: { cc: 'Cc', cci: 'Cco', lien: 'Cc Cco' },
  de: { cc: 'Cc', cci: 'Bcc', lien: 'Cc Bcc' },
  pt: { cc: 'Cc', cci: 'Bcc', lien: 'Cc Bcc' },
  it: { cc: 'Cc', cci: 'Ccn', lien: 'Cc Ccn' },
  ar: { cc: 'نسخة', cci: 'نسخة مخفية', lien: 'نسخة · نسخة مخفية' },
  ru: { cc: 'Копия', cci: 'Скрытая копия', lien: 'Копия · Скрытая копия' },
};

export function libellesCopies(locale: string): LibellesCopies {
  return LIBELLES[locale] ?? LIBELLES.en;
}

/** La saisie libre d'un champ d'adresses -> la liste envoyee au serveur. */
export function enListe(saisie: string): string[] {
  return saisie
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
