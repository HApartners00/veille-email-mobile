// Logique de priorité partagée (port de apps/web/src/lib/priority.ts).

export type Priority = { key: string; label: string; color: string };

export const PRIORITIES: Priority[] = [
  { key: 'urgent', label: 'Urgent', color: '#c2410c' },
  { key: 'important', label: 'Important', color: '#b8860b' },
  { key: 'human', label: 'À répondre', color: '#4a443a' },
  { key: 'info', label: 'Info', color: '#3f7e58' },
];

export const PRIORITY_BY_KEY: Record<string, Priority> = Object.fromEntries(
  PRIORITIES.map((p) => [p.key, p]),
);

export type Rule = { match_type: string; match_value: string; category: string };

export type ClassifiableItem = {
  tags: string[];
  author: string | null;
  title: string;
};

export function extractEmail(author: string | null): string {
  if (!author) return '';
  const m = author.match(/<([^>]+)>/);
  const raw = (m ? m[1] : author).trim().toLowerCase();
  return raw.includes('@') ? raw : '';
}

export function domainOf(author: string | null): string {
  const email = extractEmail(author);
  return email.includes('@') ? email.split('@')[1] : '';
}

export function priorityFromTags(tags: string[]): Priority {
  const t = (tags || []).map((x) => x.toLowerCase());
  if (t.includes('urgent')) return PRIORITY_BY_KEY.urgent;
  if (t.includes('important')) return PRIORITY_BY_KEY.important;
  if (t.includes('human')) return PRIORITY_BY_KEY.human;
  return PRIORITY_BY_KEY.info;
}

export function matchedCategory(item: ClassifiableItem, rules: Rule[]): string | null {
  if (!rules || rules.length === 0) return null;
  const email = extractEmail(item.author);
  const domain = email.includes('@') ? email.split('@')[1] : '';
  const title = (item.title || '').toLowerCase();
  for (const r of rules) if (r.match_type === 'sender' && email && r.match_value === email) return r.category;
  for (const r of rules) if (r.match_type === 'domain' && domain && r.match_value === domain) return r.category;
  for (const r of rules) if (r.match_type === 'keyword' && r.match_value && title.includes(r.match_value)) return r.category;
  return null;
}

export function effectivePriority(item: ClassifiableItem, rules: Rule[]): Priority {
  const cat = matchedCategory(item, rules);
  if (cat && PRIORITY_BY_KEY[cat]) return PRIORITY_BY_KEY[cat];
  return priorityFromTags(item.tags);
}
