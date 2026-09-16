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
  /**
   * Disposition. `carte` (defaut) = la carte creme arrondie, gardee pour l'Accueil.
   * `ligne` = pleine largeur sur le fond sombre, facon Gmail (onglet Emails, 16/09/2026).
   */
  layout?: 'carte' | 'ligne';
  /** Cle de categorie (`urgent` | `important` | `human` | `info`). Utilisee par `ligne`. */
  prioKey?: string;
  /** Initiales du rond (`senderInitials`). Utilisees par `ligne`. */
  initials?: string;
  /** Petit mot avant le nom, ex. « À » dans Envoyés. Utilise par `ligne`. */
  prefix?: string;
  /** Pastille apres le nom, ex. « Vmail » dans Envoyés. Utilisee par `ligne`. */
  badge?: string;
  /** Petite ligne sous l'apercu, ex. la boite d'envoi. Utilisee par `ligne`. */
  footnote?: string;
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
  layout = 'carte',
  prioKey,
  initials,
  prefix,
  badge,
  footnote,
}: Props) {
  if (layout === 'ligne') {
    return (
      <EmailLigne
        subject={subject}
        sender={sender}
        prioKey={prioKey}
        prioColor={prioColor}
        prioLabel={prioLabel}
        initials={initials}
        date={date}
        preview={preview}
        unread={unread}
        draft={draft}
        draftLabel={draftLabel}
        prefix={prefix}
        badge={badge}
        footnote={footnote}
        onPress={onPress}
      />
    );
  }
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

// =============================================================================
// DISPOSITION `ligne` — 16/09/2026, demande de HA : « les mails affiches sont en
// bandeau creme qui ne prennent pas toute la largeur, je veux un truc comme
// Outlook ou Gmail ». Maquette validee : « B sombre + categorie ».
//
//   [rond]  Expediteur ............ CATEGORIE · heure
//           Sujet
//           Apercu ................................. •
//
// ⚠️ ORDRE : l'expediteur revient en haut a gauche et l'heure a droite. C'est
// l'inverse de l'echange demande le 13/08 (voir la carte plus bas) — assume par
// HA en choisissant la maquette B.
//
// ⚠️ COULEURS SUR FOND SOMBRE, mesurees le 16/09 (contre #211e19) :
//   mot URGENT     #e8956b  7,07:1
//   mot IMPORTANT  #d9a73a  7,54:1
//   mot INFO       #6fb58a  6,84:1
//   mot A REPONDRE onDarkMuted
// Les couleurs de priorite d'origine (#4a443a surtout) disparaissent sur le
// charbon : elles restent pour les ronds, pas pour le texte.
//
// ⚠️ RONDS : initiales creme #f2ebde. Mesure du contraste :
//   urgent #c2410c 4,37:1 · info #3f7e58 4,08:1 · human #5c554a 6,21:1
//   important #b8860b ne donnait que 2,75:1 -> assombri en #8f6708 (4,31:1).
//   human #4a443a se confondait avec le fond -> eclairci en #5c554a.
// =============================================================================

const LIGNE_MOT: Record<string, string> = {
  urgent: '#e8956b',
  important: '#d9a73a',
  human: colors.onDarkMuted,
  info: '#6fb58a',
};

const LIGNE_ROND: Record<string, string> = {
  urgent: '#c2410c',
  important: '#8f6708',
  human: '#5c554a',
  info: '#3f7e58',
};

type LigneProps = Omit<Props, 'layout' | 'showDot'>;

function EmailLigne({
  subject,
  sender,
  prioKey,
  prioColor,
  prioLabel,
  initials,
  date,
  preview,
  unread,
  draft,
  draftLabel,
  prefix,
  badge,
  footnote,
  onPress,
}: LigneProps) {
  // Une cle inconnue retombe sur la couleur fournie par l'appelant : on ne
  // masque pas une categorie nouvelle derriere une couleur par defaut.
  const rond = (prioKey && LIGNE_ROND[prioKey]) || prioColor;
  const mot = (prioKey && LIGNE_MOT[prioKey]) || prioColor;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subject}
      style={({ pressed }) => [lg.row, pressed && lg.rowPressed]}
    >
      <View style={[lg.avatar, { backgroundColor: rond }]}>
        <Text style={lg.initials}>{initials || '@'}</Text>
      </View>

      <View style={lg.body}>
        <View style={lg.top}>
          {prefix ? <Text style={lg.prefix}>{prefix}</Text> : null}
          <Text style={[lg.sender, unread && lg.senderUnread]} numberOfLines={1}>
            {sender}
          </Text>
          {badge ? <Text style={lg.badge}>{badge}</Text> : null}
          {prioLabel ? (
            <Text style={[lg.cat, { color: mot }]} numberOfLines={1}>
              {prioLabel}
            </Text>
          ) : null}
          {prioLabel && date ? <Text style={lg.sep}>·</Text> : null}
          {date ? <Text style={[lg.time, unread && lg.timeUnread]}>{date}</Text> : null}
        </View>

        <View style={lg.subjRow}>
          <Text style={[lg.subject, unread && lg.subjectUnread]} numberOfLines={1}>
            {subject}
          </Text>
          {draft ? <Text style={styles.draft}>{draftLabel ?? 'Brouillon'}</Text> : null}
        </View>

        <View style={lg.bottom}>
          <Text style={lg.preview} numberOfLines={1}>
            {preview ?? ''}
          </Text>
          {unread ? <View style={lg.unreadDot} /> : null}
        </View>

        {footnote ? (
          <Text style={lg.footnote} numberOfLines={1}>
            {footnote}
          </Text>
        ) : null}
      </View>

      {/* Trait de separation, decale pour commencer sous le texte (pas sous le rond). */}
      <View style={lg.separator} />
    </Pressable>
  );
}

const AVATAR = 40;
const PAD_H = 16;
const GAP = 12;

const lg = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GAP,
    paddingHorizontal: PAD_H,
    paddingVertical: 12,
    backgroundColor: colors.fond,
  },
  rowPressed: { backgroundColor: 'rgba(234,225,208,0.06)' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initials: { fontFamily: fonts.sansSemibold, fontSize: 14, color: '#f2ebde' },
  body: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sender: {
    fontFamily: fonts.sansMedium,
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    color: 'rgba(234,225,208,0.80)',
  },
  senderUnread: { fontFamily: fonts.sansBold, color: colors.onDark },
  prefix: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(234,225,208,0.55)',
    flexShrink: 0,
  },
  badge: {
    fontFamily: fonts.sansBold,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.terracottaLight,
    backgroundColor: 'rgba(232,93,12,0.16)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
    flexShrink: 0,
  },
  footnote: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(234,225,208,0.45)',
    marginTop: 3,
  },
  // La categorie ne se coupe pas : c'est elle qui porte le tri. C'est le nom qui
  // cede la place (flex: 1 + numberOfLines).
  cat: {
    fontFamily: fonts.sansBold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    flexShrink: 0,
  },
  sep: { fontFamily: fonts.sans, fontSize: 12, color: 'rgba(234,225,208,0.35)' },
  time: { fontFamily: fonts.sans, fontSize: 12, color: 'rgba(234,225,208,0.55)', flexShrink: 0 },
  timeUnread: { fontFamily: fonts.sansSemibold, color: colors.terracottaLight },
  subjRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  subject: { fontFamily: fonts.sans, flex: 1, fontSize: 14, lineHeight: 19, color: 'rgba(234,225,208,0.80)' },
  subjectUnread: { fontFamily: fonts.sansSemibold, color: colors.onDark },
  // `minHeight` : un mail sans apercu garde la meme hauteur que les autres
  // (mesure au rendu du 16/09 : sans elle, la ligne etait plus courte).
  bottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, minHeight: 18 },
  preview: { fontFamily: fonts.sans, flex: 1, fontSize: 13, lineHeight: 18, color: 'rgba(234,225,208,0.55)' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.terracottaVivid },
  separator: {
    position: 'absolute',
    left: PAD_H + AVATAR + GAP,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.charline,
  },
});

export default EmailRow;
