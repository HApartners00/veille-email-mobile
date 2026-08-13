import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/lib/theme';

type Props = {
  subject: string;
  sender: string;
  prioColor: string;
  /** Libellé de catégorie coloré affiché en tête de carte (écran Emails). Omis = pas de libellé (Accueil groupé). */
  prioLabel?: string;
  /** Point coloré près de l'expéditeur (utile quand la carte n'a pas de libellé, ex. Accueil). */
  showDot?: boolean;
  /** Date/heure formatée (optionnelle). */
  date?: string;
  preview?: string | null;
  unread?: boolean;
  /** Badge « Brouillon prêt ». */
  draft?: boolean;
  draftLabel?: string;
  onPress?: () => void;
};

/**
 * Carte email unifiée (Accueil + Emails), design « v4 » :
 * fond blanc arrondi, pas de bande de couleur, sujet + expéditeur (point coloré),
 * libellé de catégorie optionnel, badge brouillon optionnel.
 */
export function EmailRow({
  subject,
  sender,
  prioColor,
  prioLabel,
  showDot,
  date,
  preview,
  unread,
  draft,
  draftLabel,
  onPress,
}: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* ⚠️ ECHANGE DU 13/08/2026, demande de HA : « je veux que la position de la
          date, heure soit echangee avec l'envoyeur et que ce dernier soit en plus
          fonce, comme le titre du mail ».
          L'EXPEDITEUR prend donc la place de l'heure, ici, en haut a droite ; et
          l'heure descend a la place de l'expediteur, sous le sujet.
          Mesure faite avant d'ecrire : l'ecran Accueil monte cette meme carte SANS
          `prioLabel` et SANS `date` — il n'y a donc rien a echanger la-bas, seule
          la couleur de l'expediteur change. L'echange ne touche que l'onglet Emails. */}
      {prioLabel ? (
        <View style={styles.catRow}>
          <View style={[styles.catDot, { backgroundColor: prioColor }]} />
          <Text style={[styles.catLabel, { color: prioColor }]}>{prioLabel}</Text>
          <Text style={styles.catSender} numberOfLines={1}>
            {sender}
          </Text>
        </View>
      ) : null}

      <View style={styles.subjRow}>
        <Text style={[styles.subject, unread && styles.subjectUnread]} numberOfLines={1}>
          {subject}
        </Text>
        {draft ? <Text style={styles.draft}>{draftLabel ?? 'Brouillon'}</Text> : null}
      </View>

      {/* Avec une pastille de categorie, cette ligne porte l'HEURE (l'expediteur est
          monte au-dessus). Sans pastille — l'Accueil — elle garde l'expediteur, avec
          son point colore. On ne rend rien du tout s'il n'y a ni l'un ni l'autre. */}
      {prioLabel ? (
        date ? (
          <View style={styles.meta}>
            <Text style={styles.time}>{date}</Text>
          </View>
        ) : null
      ) : (
        <View style={styles.meta}>
          <View style={styles.senderWrap}>
            {showDot ? (
              <View style={[styles.dot, { backgroundColor: prioColor, opacity: unread ? 1 : 0.5 }]} />
            ) : null}
            <Text style={styles.sender} numberOfLines={1}>
              {sender}
            </Text>
          </View>
          {date ? <Text style={styles.time}>{date}</Text> : null}
        </View>
      )}

      {preview ? (
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.md + 3,
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.md + 3,
    marginBottom: 9,
  },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  catDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
  catLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    // La categorie ne se laisse PAS ecraser par un expediteur long : c'est elle
    // qui porte l'information de tri, elle doit rester entiere.
    flexShrink: 0,
  },
  /**
   * L'expediteur, a la place qu'occupait l'heure. `ink` — la couleur du sujet,
   * comme demande. Il se coupe s'il est long (`flexShrink`), et il est pousse a
   * droite par `marginLeft: 'auto'`, exactement ou etait l'heure.
   */
  catSender: {
    fontFamily: fonts.sansMedium,
    marginLeft: 'auto',
    flexShrink: 1,
    fontSize: 12.5,
    color: colors.ink,
    textAlign: 'right',
  },
  subjRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  subject: { fontFamily: fonts.sansSemibold, flex: 1, fontSize: 15, color: colors.ink, letterSpacing: -0.2 },
  subjectUnread: { fontFamily: fonts.sansBold },
  draft: {
    fontFamily: fonts.sansBold,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.terracotta,
    backgroundColor: 'rgba(232,93,12,0.10)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    gap: spacing.sm,
  },
  senderWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  // Ecran Accueil. Meme assombrissement que `catSender` : HA veut l'expediteur
  // « en plus fonce, comme le titre du mail », et les deux cartes sont la meme.
  sender: { fontFamily: fonts.sansMedium, flexShrink: 1, fontSize: 12.5, color: colors.ink },
  time: { fontFamily: fonts.sans, fontSize: 11, color: colors.hint },
  preview: { fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 3 },
});

export default EmailRow;
