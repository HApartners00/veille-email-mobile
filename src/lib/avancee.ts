import { effectivePriority, type ClassifiableItem, type Rule } from '@/lib/priority';
import { TAG_ARCHIVE, TAG_PUB, TAG_SPAM, TAG_TRASH } from '@/lib/mail-state';

/**
 * LA JAUGE D'AVANCÉE DE L'ACCUEIL — 26/09/2026.
 *
 * ⚠️ JUMEAU EXACT de la version web : Veille Email/apps/web/src/lib/avancee.ts.
 * Même règle, à modifier DANS LES DEUX (le piège des deux copies qui divergent a déjà coûté cher,
 * voir l'Accueil mobile du 09/08).
 *
 * DÉCISIONS DE HA (26/09) :
 *   · on compte les mails REÇUS AUJOURD'HUI qui demandent une action :
 *     Urgent + Important + À répondre. Les « Info » ne comptent pas ;
 *   · un Urgent ou un Important est TRAITÉ s'il est lu, archivé ou supprimé ;
 *   · un À répondre est traité seulement si une RÉPONSE A ÉTÉ ENVOYÉE DEPUIS
 *     VMAIL (`items.repondu_le`) — ou s'il est archivé ou supprimé (« oui »,
 *     sinon la jauge ne pourrait jamais être pleine). Le lire ne suffit pas.
 *     Une réponse faite dans Outlook ne se voit pas (pas de lien en base) ;
 *   · 0 mail à traiter → pas de jauge ; tout traité → traits verts (V5).
 *
 * Décisions annoncées par Claude (HA peut les changer) : un mail « Pub » ne
 * compte jamais ; un mail passé en indésirable compte comme traité.
 */

export type ItemAvancee = ClassifiableItem & {
  status: string;
  repondu_le?: string | null;
};

export type CleAction = 'urgent' | 'important' | 'human';

export type Avancee = {
  total: number;
  traites: number;
  /** Un trait par mail : d'abord les traités (urgent → important → à répondre),
   *  puis `null` pour chaque mail qui reste à traiter. */
  traits: (CleAction | null)[];
};

const ORDRE: CleAction[] = ['urgent', 'important', 'human'];

function a(tags: string[] | null | undefined, tag: string): boolean {
  return (tags || []).some((t) => (t || '').toLowerCase() === tag);
}

/** Sorti de la boîte (archivé, supprimé, indésirable) : décidé, donc traité. */
function sorti(tags: string[] | null | undefined): boolean {
  return a(tags, TAG_ARCHIVE) || a(tags, TAG_TRASH) || a(tags, TAG_SPAM);
}

/** `items` = les mails reçus aujourd'hui, SANS le filtre « hors flux ». */
export function calculerAvancee(items: ItemAvancee[], rules: Rule[]): Avancee {
  const traitesPar: Record<CleAction, number> = { urgent: 0, important: 0, human: 0 };
  let total = 0;
  for (const it of items) {
    if (a(it.tags, TAG_PUB)) continue;
    const cle = effectivePriority(it, rules).key;
    if (cle !== 'urgent' && cle !== 'important' && cle !== 'human') continue;
    total += 1;
    const fait =
      cle === 'human'
        ? Boolean(it.repondu_le) || sorti(it.tags)
        : it.status === 'read' || sorti(it.tags);
    if (fait) traitesPar[cle] += 1;
  }
  const traits: (CleAction | null)[] = [];
  for (const k of ORDRE) for (let i = 0; i < traitesPar[k]; i++) traits.push(k);
  const traites = traits.length;
  for (let i = traites; i < total; i++) traits.push(null);
  return { total, traites, traits };
}
