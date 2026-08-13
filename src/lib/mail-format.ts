/**
 * Helpers d'affichage du courrier — SOURCE DE VÉRITÉ PARTAGÉE.
 *
 * Jumeau mobile : `veille-email-mobile/src/lib/mail-format.ts`. Les deux fichiers
 * sont volontairement IDENTIQUES (même règle que `lib/priority.ts`). Si tu touches
 * à l'un, touche à l'autre.
 *
 * Historique : `cleanText`, `formatDate` et `senderInitials` étaient définis en
 * local dans `app/feed/feed-list.tsx` (web) et `app/(tabs)/index.tsx` (mobile),
 * à l'identique. Les onglets « Envoyés » et « Brouillons » (07/08/2026) allaient
 * en faire une 3e et une 4e copie : extraits ici plutôt que recopiés.
 */

/**
 * Nettoie un extrait stocké : certains previews contiennent encore du HTML ou
 * des entités (&nbsp;, &#39;). Double décodage volontaire : les entités peuvent
 * être imbriquées (&amp;nbsp;) et le retrait des balises peut en révéler.
 */
export function cleanText(input: string | null): string {
  if (!input) return '';
  const decode = (t: string) =>
    t
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
  let t = decode(String(input));
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/\s{2,}/g, ' ').trim();
}

/** Date courte « 07 août 14:32 » dans la langue de l'utilisateur. */
export function formatDate(value: string, intl: string): string {
  try {
    return new Date(value).toLocaleString(intl, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Nom lisible d'un interlocuteur : « Marie Dupont » depuis `Marie Dupont <m@x.fr>`. */
export function senderName(author: string | null, unknown: string): string {
  if (!author) return unknown;
  if (author.includes('<')) {
    const head = author.split('<')[0];
    return (head ?? '').trim().replace(/"/g, '') || author;
  }
  return author.split('@')[0] ?? author;
}

/** Initiales pour la pastille ronde (web). Deux lettres max, sinon « @ ». */
export function senderInitials(author: string | null): string {
  if (!author) return '@';
  const namePart =
    (author.includes('<') ? author.split('<')[0]?.trim() : author.split('@')[0]) ?? '';
  const parts = namePart
    .split(/[\s.\-_]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const txt = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  const clean = namePart.replace(/[^\p{L}\p{N}]/gu, '');
  return (txt || clean.slice(0, 1) || '@').toUpperCase();
}

/** Un destinataire tel que stocké dans `sent_items.recipients` / renvoyé par n8n. */
export type Recipient = {
  name?: string | null;
  email?: string | null;
  kind?: 'to' | 'cc' | 'bcc' | null;
};

/**
 * Normalise le JSON `recipients` venant de la base ou du fournisseur.
 * Tolère : un tableau d'objets, un tableau de chaînes, une chaîne « a@x, b@y ».
 * Ne jette jamais — une donnée mal formée doit dégrader l'affichage, pas la page.
 */
export function parseRecipients(raw: unknown): Recipient[] {
  const out: Recipient[] = [];
  const pushString = (s: string, kind: Recipient['kind']) => {
    for (const part of s.split(/[,;]/)) {
      const v = part.trim();
      if (!v) continue;
      const m = v.match(/^(.*?)<([^>]+)>$/);
      if (m) out.push({ name: (m[1] ?? '').trim().replace(/"/g, ''), email: (m[2] ?? '').trim(), kind });
      else out.push({ name: null, email: v, kind });
    }
  };
  if (typeof raw === 'string') {
    pushString(raw, 'to');
    return out;
  }
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (typeof r === 'string') {
      pushString(r, 'to');
      continue;
    }
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>;
      const email = typeof o.email === 'string' ? o.email.trim() : '';
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const kindRaw = typeof o.kind === 'string' ? o.kind.toLowerCase() : '';
      const kind: Recipient['kind'] =
        kindRaw === 'cc' ? 'cc' : kindRaw === 'bcc' ? 'bcc' : 'to';
      if (email || name) out.push({ name: name || null, email: email || null, kind });
    }
  }
  return out;
}

/**
 * Ligne « À : … » d'une liste. Affiche le 1er destinataire puis « +N ».
 * `unknown` est le libellé traduit à afficher quand il n'y a aucun destinataire.
 */
export function recipientsLabel(raw: unknown, unknown: string): string {
  const list = parseRecipients(raw).filter((r) => r.email || r.name);
  if (list.length === 0) return unknown;
  const first = list[0];
  const head = (first?.name || first?.email || '').trim() || unknown;
  return list.length > 1 ? `${head} +${list.length - 1}` : head;
}

/** Toutes les adresses, pour la recherche locale et l'affichage détaillé. */
export function recipientsEmails(raw: unknown): string[] {
  return parseRecipients(raw)
    .map((r) => (r.email || '').toLowerCase())
    .filter(Boolean);
}

/**
 * Le contenu ressemble-t-il à du HTML structuré ?
 *
 * MÊME HEURISTIQUE QUE `/api/message-body` ET `components/email-body.tsx` côté
 * web — la lettre près. Elle vivait en local dans `app/email/[id].tsx` (mobile),
 * et l'écran des envoyés allait en faire une deuxième copie : deux copies d'une
 * règle de décision finissent toujours par diverger, et ici la divergence se
 * verrait à l'écran (le mail rendu d'un côté, dépouillé de l'autre).
 *
 * ⚠️ Ce fichier est le JUMEAU de `Veille Email/apps/web/src/lib/mail-format.ts`.
 * La fonction y est ajoutée à l'identique dans le même commit, même si le web ne
 * l'appelle pas encore : les deux fichiers doivent rester interchangeables.
 */
export function ressembleAHtml(s: string): boolean {
  return /<(html|body|table|div|p|a|img|br|span|td|h[1-6])[\s/>]/i.test(s);
}
