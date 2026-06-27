import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/lib/theme';

type Props = {
  subject: string;
  sender: string;
  prioColor: string;
  /** Libelle de priorite en majuscules (Feed). Omis = pas de ligne d'en-tete (Accueil groupe). */
  prioLabel?: string;
  /** Date formatee (optionnelle). */
  date?: string;
  preview?: string | null;
  unread?: boolean;
  onPress?: () => void;
};

/** Ligne email unifiee (Accueil + Feed) : filet de couleur + sujet + expediteur. */
export function EmailRow({
  subject,
  sender,
  prioColor,
  prioLabel,
  date,
  preview,
  unread,
  onPress,
}: Props) {
  const showTop = !!(prioLabel || date);
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.accent, { backgroundColor: prioColor, opacity: unread ? 1 : 0.4 }]} />
      <View style={styles.body}>
        {showTop ? (
          <View style={styles.top}>
            {prioLabel ? (
              <Text style={[styles.label, { color: prioColor }]}>{prioLabel}</Text>
            ) : (
              <View />
            )}
            {date ? <Text style={styles.date}>{date}</Text> : null}
          </View>
        ) : null}
        <Text style={[styles.subject, unread && styles.subjectUnread]} numberOfLines={1}>
          {subject}
        </Text>
        <Text style={styles.sender} numberOfLines={1}>
          {sender}
        </Text>
        {preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingRight: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardline,
  },
  accent: { width: 3, marginRight: spacing.md },
  body: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  date: { fontSize: 11, color: colors.hint },
  subject: { fontSize: 15, fontWeight: '500', color: colors.ink2 },
  subjectUnread: { color: colors.ink, fontWeight: '700' },
  sender: { fontSize: 12, color: colors.muted, marginTop: 1 },
  preview: { fontSize: 12, color: colors.hint, marginTop: 2 },
});

export default EmailRow;
