import { domainOf, extractEmail, PRIORITY_KEYS } from '@/lib/priority';
import { TAG_ARCHIVE, TAG_SPAM, TAG_TRASH } from '@/lib/mail-state';

/**
 * AGIR SUR PLUSIEURS MAILS D'UN COUP — 09/10/2026.
 *
 * Demande de HA : « je veux qu'on puisse sélectionner plusieurs emails d'un coup pour
 * archiver, supprimer, etc. » et « archiver ou supprimer un mail en le swipant ».
 * Ses choix : appui long dans l'app, cases au survol sur le web ; glisser à gauche =
 * corbeille, à droite = archiver ; l'action part tout de suite, avec « Annuler ».
 *
 * ⚠️ C'EST UN RETOUR SUR UNE DÉCISION DU 08/08/2026. À l'époque (option B), les
 * actions n'existaient qu'une fois le mail ouvert, « un clic à côté dans une liste
 * dense ne se rattrape pas ». Ce qui rend le retour acceptable : depuis le 09/08 la
 * corbeille MARQUE au lieu d'effacer, et chaque action a son inverse immédiat — la
 * bannière « Annuler » rattrape un geste de travers, en liste comme ailleurs.
 *
 * CE FICHIER EXISTE À L'IDENTIQUE dans le web (`apps/web/src/lib/`) et dans l'app
 * (`src/lib/`). Ce qui change d'une plateforme à l'autre (la façon d'appeler l'API, le
 * client de la base) est PASSÉ EN PARAMÈTRE (`Ports`) : la logique, elle, est la même.
 *
 * RIEN DE NOUVEAU CÔTÉ SERVEUR : archiver / corbeille / remettre / restaurer passent par
 * `/api/mail-action`, la même route que le bouton d'un mail ouvert, UN appel par mail.
 * Gmail, Outlook, iCloud, Yahoo : c'est elle qui sait parler à chacun.
 * Pourquoi pas une route « en lot » : un mail iCloud / Yahoo peut prendre jusqu'à ~25 s
 * à déplacer (lib/imap/actions.ts) ; vingt mails dans UNE requête dépasseraient la
 * minute que Vercel accorde. Un appel par mail, trois à la fois, garde chaque mail
 * dans son propre délai — et un résultat par mail : rien n'est jamais muet.
 *
 * Lu / non lu et catégorie : écrits dans Vmail seulement, exactement comme le font
 * déjà « Tout marquer comme lu » et « Reclasser cet email ».
 */

export type OpBoite = 'archive' | 'unarchive' | 'trash' | 'untrash' | 'unspam';
export type ReponseBrute = { ok: boolean; status: number; json: any };

/** Ce que chaque plateforme fournit. */
export type Ports = {
  /** POST vers l'API web, avec la session de la personne (cookies sur le web, jeton dans l'app). */
  poster: (chemin: string, corps: unknown) => Promise<ReponseBrute>;
  /** Le client Supabase de la personne connectée (sécurité par ligne : seulement SES mails). */
  base: any;
};

export type Reussite = { id: string; tags: string[] | null };
export type Echec = { id: string; message: string };
export type ResultatLot = { reussis: Reussite[]; echecs: Echec[] };

/** Trois mails à la fois : assez pour ne pas attendre, pas assez pour saturer une boîte IMAP. */
export const PARALLELE = 3;

/** L'opération qui défait `op`, ou `null` (sortir des indésirables n'a pas d'inverse proposé). */
export function inverseDe(op: OpBoite): OpBoite | null {
  return op === 'archive' ? 'unarchive'
    : op === 'unarchive' ? 'archive'
    : op === 'trash' ? 'untrash'
    : op === 'untrash' ? 'trash'
    : null;
}

/**
 * Les opérations proposées selon le dossier affiché — les mêmes que les boutons d'un
 * mail ouvert dans ce dossier.
 *   `droite` : glisser vers la droite (vert) · `gauche` : vers la gauche (rouge)
 *   `lot`    : les boutons de la barre de sélection
 */
export function opsDuDossier(dossier: string | null): { droite: OpBoite | null; gauche: OpBoite | null; lot: OpBoite[] } {
  if (dossier === TAG_TRASH) return { droite: 'untrash', gauche: null, lot: ['untrash'] };
  if (dossier === TAG_ARCHIVE) return { droite: 'unarchive', gauche: 'trash', lot: ['unarchive', 'trash'] };
  if (dossier === TAG_SPAM) return { droite: 'unspam', gauche: 'trash', lot: ['unspam', 'trash'] };
  // Boîte de réception (null) et « mis de côté » (pub).
  return { droite: 'archive', gauche: 'trash', lot: ['archive', 'trash'] };
}

/** Fait `faire(id)` pour chaque id, `parallele` à la fois, dans l'ordre des ids. */
export async function parLots<T>(
  ids: string[],
  faire: (id: string) => Promise<T>,
  parallele: number = PARALLELE,
  onProgres?: (fait: number, total: number) => void,
): Promise<T[]> {
  const sortie: T[] = new Array(ids.length);
  let prochain = 0;
  let faits = 0;
  async function ouvrier() {
    while (prochain < ids.length) {
      const i = prochain++;
      sortie[i] = await faire(ids[i]!);
      faits++;
      onProgres?.(faits, ids.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallele, ids.length)) }, ouvrier));
  return sortie;
}

/** Archiver / corbeille / remettre / restaurer / sortir des indésirables, mail par mail. */
export async function agirSurPlusieurs(
  ports: Ports,
  ids: string[],
  op: OpBoite,
  onProgres?: (fait: number, total: number) => void,
): Promise<ResultatLot> {
  const uniques = Array.from(new Set(ids.filter(Boolean)));
  const res = await parLots(
    uniques,
    async (id): Promise<Reussite | Echec> => {
      try {
        const r = await ports.poster('/api/mail-action', { itemId: id, op });
        if (r.ok) {
          // 207 compris : l'action a eu lieu chez le fournisseur (voir /api/mail-action).
          const tags = Array.isArray(r.json?.tags) ? (r.json.tags as string[]) : null;
          return { id, tags };
        }
        // `message` d'abord : c'est la phrase pour la personne (mailboxErrorResponse), comme le
        // bouton d'un mail ouvert sur le web ; `error` sinon.
        return { id, message: String(r.json?.message || r.json?.error || `Erreur ${r.status}`) };
      } catch (e) {
        return { id, message: e instanceof Error ? e.message : String(e) };
      }
    },
    PARALLELE,
    onProgres,
  );
  const reussis: Reussite[] = [];
  const echecs: Echec[] = [];
  for (const x of res) {
    if ('message' in x) echecs.push(x);
    else reussis.push(x);
  }
  return { reussis, echecs };
}

/** Lu / non lu, dans Vmail — comme « Tout marquer comme lu ». */
export async function marquerLu(
  ports: Ports,
  ids: string[],
  lu: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (ids.length === 0) return { ok: true };
  try {
    const { error } = await ports.base
      .from('items')
      .update(lu ? { status: 'read', read_at: new Date().toISOString() } : { status: 'unread', read_at: null })
      .in('id', ids);
    return error ? { ok: false, message: String(error.message || error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Change la catégorie de plusieurs mails — comme « Reclasser cet email », mail par mail :
 * on RELIT les marqueurs en base (pour ne pas écraser ce que le tri a ajouté entre-temps),
 * on retire l'ancienne catégorie, on pose la nouvelle, on GARDE tout le reste (box:*,
 * archive, corbeille…). Puis, comme le reclassement d'un seul mail, un signal par mail
 * pour l'apprentissage du tri — sans lui, le tri ne saurait pas qu'il s'est trompé.
 */
export async function classer(
  ports: Ports,
  mails: { id: string; author: string | null; tags: string[] | null }[],
  categorie: string,
): Promise<ResultatLot & { signal?: string }> {
  if (!PRIORITY_KEYS.includes(categorie)) {
    return { reussis: [], echecs: mails.map((m) => ({ id: m.id, message: 'Catégorie inconnue.' })) };
  }
  const ids = mails.map((m) => m.id);
  // Relecture groupée ; si elle échoue, on part des marqueurs connus (comme le reclassement d'un mail).
  const frais = new Map<string, string[]>();
  try {
    const { data } = await ports.base.from('items').select('id, tags').in('id', ids);
    for (const l of (data || []) as { id: string; tags: string[] | null }[]) frais.set(l.id, l.tags || []);
  } catch (e) {
    // Relecture impossible : on garde les marqueurs locaux (même repli que le reclassement
    // d'un mail) — et on le dit.
    console.warn('[classer] relecture des marqueurs impossible, marqueurs locaux utilisés', e);
  }
  const res = await parLots(mails.map((m) => m.id), async (id): Promise<Reussite | Echec> => {
    const m = mails.find((x) => x.id === id)!;
    const avant = frais.get(id) ?? m.tags ?? [];
    const tags = [...avant.filter((t) => !PRIORITY_KEYS.includes((t || '').toLowerCase())), categorie];
    try {
      const { error } = await ports.base.from('items').update({ tags }).eq('id', id);
      return error ? { id, message: String(error.message || error) } : { id, tags };
    } catch (e) {
      return { id, message: e instanceof Error ? e.message : String(e) };
    }
  });
  const reussis = res.filter((x): x is Reussite => !('message' in x));
  const echecs = res.filter((x): x is Echec => 'message' in x);

  // Les signaux d'apprentissage : on le DIT s'ils ne partent pas (sans bloquer le classement).
  let signal: string | undefined;
  if (reussis.length > 0) {
    try {
      const { data: u } = await ports.base.auth.getUser();
      const userId = u?.user?.id;
      if (userId) {
        const lignes = reussis.map((r) => {
          const m = mails.find((x) => x.id === r.id)!;
          return {
            user_id: userId,
            item_id: r.id,
            kind: 'reclass',
            payload: { target: 'this', sender: extractEmail(m.author), domain: domainOf(m.author), to: categorie },
          };
        });
        const { error } = await ports.base.from('style_signals').insert(lignes);
        if (error) signal = String(error.message || error);
      } else {
        signal = 'session introuvable';
      }
    } catch (e) {
      signal = e instanceof Error ? e.message : String(e);
    }
  }
  return { reussis, echecs, ...(signal ? { signal } : {}) };
}
