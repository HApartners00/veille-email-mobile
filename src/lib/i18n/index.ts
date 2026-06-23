/**
 * Cœur i18n de l'app mobile.
 * - Langues : fr (base), en, es, de, pt, it, ar (arabe = RTL).
 * - Détection auto de la langue de l'appareil, repli sur l'anglais.
 * - Helpers de formatage (interpolation, dates, BCP-47).
 *
 * Le Provider/hook React vit dans src/context/i18n.tsx (état + persistance).
 */
import { messages, type Dict } from './messages';

export { messages };
export type { Dict };

export const locales = ['fr', 'en', 'es', 'de', 'pt', 'it', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Noms natifs des langues (pour le sélecteur). */
export const localeNames: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  ar: 'العربية',
};

/** Codes BCP-47 pour Intl/toLocaleDateString. */
export const bcp47: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  pt: 'pt-PT',
  it: 'it-IT',
  ar: 'ar',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** L'arabe est la seule langue droite-à-gauche du jeu. */
export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}

export function getDictionary(locale: Locale): Dict {
  return messages[locale] ?? messages[defaultLocale];
}

/**
 * Normalise un tag de langue (« fr-CA », « EN_us », « ar-EG ») vers une de nos
 * 7 locales, ou null si non géré.
 */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = tag.toLowerCase().replace('_', '-').split('-')[0];
  return isLocale(base) ? base : null;
}

/** Interpolation simple : fmt('{n} emails', { n: 3 }) → '3 emails'. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

/** Libellé localisé d'une priorité (urgent/important/human/info). */
export function prioLabel(t: Dict, key: string): string {
  const p = t.prio as Record<string, string>;
  return p[key] ?? key;
}
