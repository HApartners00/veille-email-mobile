import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/i18n';
import { apiPost } from '@/lib/api';
import { TAG_ARCHIVE, TAG_SPAM, TAG_TRASH } from '@/lib/mail-state';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Actions sur un mail recu — archiver, corbeille, restaurer, non indesirable.
 *
 * JUMEAU de `Veille Email/apps/web/src/app/email/mail-actions.tsx` : meme route
 * (`POST /api/mail-action`), memes operations, meme protection, memes libelles dans
 * les 8 langues. Seul le dessin change, c'est la regle d'alignement de HA (07/08).
 *
 * ⚠️ CES BOUTONS ECRIVENT DANS LA VRAIE BOITE DU CLIENT. Ils ne sont donc PAS dans la
 * liste : on ne les voit qu'apres avoir ouvert un mail exprès. Un effleurement de
 * travers dans une liste dense ne se rattrape pas de la meme façon.
 *
 * UNE SEULE PROTECTION, LA MEME PARTOUT : une banniere « Annuler » pendant 8 secondes
 * qui appelle l'operation inverse. Depuis le 09/08 la corbeille MARQUE au lieu
 * d'effacer, donc l'annulation y est instantanee comme ailleurs — l'ancienne
 * confirmation avant suppression n'avait plus de justification.
 */

export type Op = 'archive' | 'unarchive' | 'trash' | 'untrash' | 'unspam';

/**
 * LA LOGIQUE, SANS LE DESSIN — extraite le 12/08/2026.
 *
 * La page mail passe ses actions dans une barre fixe en bas et un menu ⋯ : deux
 * conteneurs differents, alors qu'un composant ne peut se rendre qu'a un seul
 * endroit. Recopier l'appel a `/api/mail-action` dans la barre aurait donne deux
 * implementations qui se seraient mises a diverger a la premiere retouche — c'est
 * exactement ce qui est arrive au classifieur sur ce projet.
 *
 * Il n'y a donc qu'UNE implementation de `agir`, ici, et deux facons de l'afficher :
 * ce hook pour la page mail, et `<MailActions>` juste en dessous, inchange.
 */
export function useMailActions({
  itemId,
  tags,
  onDone,
}: {
  itemId: string;
  tags: string[];
  /** Previent l'ecran parent pour qu'il rafraichisse ou ferme, sans recharger. */
  onDone?: (op: Op, tags: string[] | null) => void;
}) {
  const { t } = useI18n();
  const m = t.mailActions;

  const [etat, setEtat] = useState<string[]>(tags);
  const [busy, setBusy] = useState<Op | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [annulable, setAnnulable] = useState<{ message: string; inverse: Op } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ⚠️ DEPENDANCE SUR LE CONTENU, PAS SUR L'IDENTITE DU TABLEAU. Un appelant qui
  // ecrit `tags={item.tags || []}` fabrique un tableau NEUF a chaque rendu ; avec
  // `[tags]` en dependance, l'effet repartirait a chaque rendu, `setEtat` poserait
  // une reference differente, et on tournerait en boucle. Ça ne se voyait pas tant
  // que le hook vivait dans un composant enfant (le tableau n'etait recree que
  // quand le PARENT rendait) — ça se verrait immediatement ici, ou il vit dans la
  // page elle-meme.
  const cleTags = tags.map((x) => (x || '').toLowerCase()).sort().join('|');
  useEffect(() => setEtat(tags), [cleTags]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (minuteur.current) clearTimeout(minuteur.current); }, []);

  const marqueurs = etat.map((x) => (x || '').toLowerCase());
  const estArchive = marqueurs.includes(TAG_ARCHIVE);
  const estSpam = marqueurs.includes(TAG_SPAM);
  const estCorbeille = marqueurs.includes(TAG_TRASH);

  async function agir(op: Op, silencieux = false) {
    if (busy) return;
    setBusy(op);
    setErreur(null);
    try {
      const r = await apiPost<{ ok?: boolean; tags?: string[] }>('/api/mail-action', { itemId, op });
      const nouveaux = Array.isArray(r?.tags) ? r.tags : null;
      if (nouveaux) setEtat(nouveaux);
      onDone?.(op, nouveaux);

      if (!silencieux) {
        const message =
          op === 'archive' ? m.doneArchived
          : op === 'unarchive' ? m.doneUnarchived
          : op === 'trash' ? m.doneTrashed
          : op === 'untrash' ? m.doneUntrashed
          : m.doneUnspam;
        // `unspam` n'a pas d'inverse propose : remettre un mail dans les indesirables
        // n'est pas une intention d'utilisateur.
        const inverse: Op | null =
          op === 'archive' ? 'unarchive'
          : op === 'unarchive' ? 'archive'
          : op === 'trash' ? 'untrash'
          : op === 'untrash' ? 'trash'
          : null;
        setAnnulable(inverse ? { message, inverse } : null);
        if (minuteur.current) clearTimeout(minuteur.current);
        if (inverse) minuteur.current = setTimeout(() => setAnnulable(null), 8000);
      }
    } catch (e) {
      // RIEN EN SILENCE : on affiche ce que la messagerie a repondu, pas un message
      // generique qui masquerait un delai depasse ou une boite deconnectee.
      setErreur((e as Error)?.message || m.errGeneric);
    } finally {
      setBusy(null);
    }
  }

  /** Rejoue l'operation inverse et retire la banniere. */
  function annuler() {
    if (!annulable) return;
    const inv = annulable.inverse;
    setAnnulable(null);
    void agir(inv, true);
  }

  return { m, etat, busy, erreur, annulable, agir, annuler, estArchive, estSpam, estCorbeille };
}

/**
 * Actions en ligne — la forme d'origine, mot pour mot. Elle n'est plus utilisee par
 * la page mail depuis le 12/08 (barre fixe), mais elle reste le jumeau de
 * `apps/web/src/app/email/mail-actions.tsx` et le rendu de reference.
 */
export function MailActions({
  itemId,
  tags,
  onDone,
}: {
  itemId: string;
  tags: string[];
  onDone?: (op: Op, tags: string[] | null) => void;
}) {
  const { m, busy, erreur, annulable, agir, annuler, estArchive, estSpam, estCorbeille } =
    useMailActions({ itemId, tags, onDone });

  function Bouton({ op, label, danger }: { op: Op; label: string; danger?: boolean }) {
    return (
      <Pressable
        style={[styles.btn, danger && styles.btnDanger]}
        disabled={!!busy}
        onPress={() => void agir(op)}
      >
        {/* Indicateur sur fond sombre : `muted` n'y passe plus depuis le 12/08. */}
        {busy === op ? (
          <ActivityIndicator size="small" color={colors.onDarkMuted} />
        ) : (
          <Text style={[styles.btnText, danger && styles.btnTextDanger]}>{label}</Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* Un mail a la corbeille n'a qu'une action qui ait du sens : en sortir.
          Proposer « Archiver » sur un mail supprime demanderait de deviner dans quel
          etat il retombe. */}
      <View style={styles.row}>
        {estCorbeille ? (
          <Bouton op="untrash" label={m.untrash} />
        ) : (
          <>
            {estArchive ? (
              <Bouton op="unarchive" label={m.unarchive} />
            ) : (
              <Bouton op="archive" label={m.archive} />
            )}
            {estSpam ? <Bouton op="unspam" label={m.unspam} /> : null}
            <Bouton op="trash" label={m.trash} danger />
          </>
        )}
      </View>

      {annulable ? (
        <View style={styles.undoRow}>
          <Text style={styles.undoText}>{annulable.message}</Text>
          <Pressable disabled={!!busy} onPress={annuler} hitSlop={8}>
            <Text style={styles.undoLink}>{m.undo}</Text>
          </Pressable>
        </View>
      ) : null}

      {erreur ? <Text style={styles.err}>{erreur}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    minWidth: 64,
    alignItems: 'center',
  },
  btnDanger: { borderColor: colors.danger },
  // ⚠️ POSE DIRECTEMENT SUR LE FOND SOMBRE (pas dans une carte) : texte clair,
  // sinon invisible. Voir `fond` dans lib/theme.ts.
  btnText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.onDark },
  btnTextDanger: { color: colors.danger },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  undoText: { fontFamily: fonts.sans, fontSize: 12, color: colors.onDarkMuted, flexShrink: 1 },
  undoLink: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.terracotta },
  err: { fontFamily: fonts.sans, fontSize: 12, color: colors.danger, marginTop: spacing.sm },
});
