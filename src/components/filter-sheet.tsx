import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts, spacing } from '@/lib/theme';

/**
 * Menu deroulant en feuille basse (bottom sheet) — filtre par boite, par type, par dossier.
 *
 * EXTRAIT DE `app/(tabs)/index.tsx` LE 09/08/2026, sans changer une ligne de son
 * comportement. Il n'y vivait que pour l'onglet Emails ; HA a demande le meme
 * selecteur de boites dans Envoyes, et Brouillons partage le meme en-tete.
 *
 * Le recopier aurait donne trois listes deroulantes qui se seraient mises a diverger
 * a la premiere retouche — c'est exactement ce qui est arrive au classifieur sur ce
 * projet. Il n'y a donc qu'UNE implementation, ici, et trois appelants.
 */

export type SheetOption = {
  key: string;
  label: string;
  count?: number;
  /** `true` = le compte est calcule sur ce qui est charge, il en reste peut-etre. */
  partial?: boolean;
  selected: boolean;
  /**
   * Ligne d'ACTION et non de choix (« Actualiser », « Tout marquer comme lu ») :
   * pas de coche, pas d'etat coche/decoche, et le libelle prend la couleur
   * d'accent pour dire qu'il se passe quelque chose quand on appuie.
   * Ajoute le 12/08/2026 pour le menu ⋯ de l'onglet Emails.
   */
  action?: boolean;
  /** Texte discret a droite du libelle (ex. le dossier courant). */
  value?: string;
  /** Grise la ligne et ignore l'appui — sans la faire disparaitre. */
  disabled?: boolean;
};

/**
 * Un groupe de lignes sous un intertitre. Une feuille SANS section reste
 * possible (prop `options`) : les trois appelants d'origine ne changent pas.
 */
export type SheetSection = {
  /** Absent = groupe sans intertitre. */
  title?: string;
  options: SheetOption[];
};

/** Chevron bas vectoriel (pas de glyphe : ils ne sont pas rendus pareil partout). */
export function Caret({ color = colors.muted, size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 9l6 6 6-6"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Coche vectorielle pour les options selectionnees. */
export function CheckMark({ color = colors.terracotta, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12l5 5L20 7"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function FilterSheet({
  visible,
  title,
  options,
  sections,
  doneLabel,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** Liste a plat — la forme d'origine, gardee telle quelle. */
  options?: SheetOption[];
  /**
   * Liste groupee sous des intertitres. Prioritaire sur `options` quand les
   * deux sont fournies. Une seule feuille porte alors plusieurs natures de
   * choix (dossier, boite, actions) — c'est ce que demande le menu ⋯.
   */
  sections?: SheetSection[];
  doneLabel: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  // Normalisation : tout se rend comme des sections. Sans `sections`, on en
  // fabrique une seule, sans intertitre — rendu identique a l'ancien.
  const groupes: SheetSection[] = sections ?? [{ options: options ?? [] }];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {groupes.map((g, gi) => (
              <View key={g.title ?? `g${gi}`}>
                {g.title ? (
                  <Text style={[styles.sectionTitle, gi > 0 && styles.sectionTitleNext]}>
                    {g.title}
                  </Text>
                ) : null}
                {g.options.map((o) => (
                  <Pressable
                    key={o.key}
                    style={[styles.sheetRow, o.disabled && styles.sheetRowOff]}
                    disabled={o.disabled}
                    onPress={() => onPick(o.key)}
                  >
                    <Text
                      style={[
                        styles.sheetRowText,
                        o.action && styles.sheetRowTextAction,
                        o.selected && styles.sheetRowTextSel,
                      ]}
                      numberOfLines={1}
                    >
                      {o.label}
                    </Text>
                    <View style={styles.sheetRight}>
                      {o.value ? (
                        <Text style={styles.sheetValue} numberOfLines={1}>
                          {o.value}
                        </Text>
                      ) : null}
                      {o.count != null ? (
                        <Text style={styles.sheetCount}>
                          {o.count}
                          {o.partial ? '+' : ''}
                        </Text>
                      ) : null}
                      {o.selected ? <CheckMark /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.sheetDone} onPress={onClose}>
            <Text style={styles.sheetDoneText}>{doneLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(33,30,25,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 3,
    borderTopColor: colors.terracotta,
  },
  sheetTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  // Intertitre de groupe. Meme graisse et meme casse que `sheetTitle` mais un
  // cran plus petit : le titre de la feuille doit rester le plus fort.
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.hint,
    marginBottom: 2,
  },
  /** Respiration au-dessus des groupes suivants — pas du premier. */
  sectionTitleNext: { marginTop: spacing.lg },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardline,
    gap: spacing.md,
  },
  sheetRowOff: { opacity: 0.45 },
  sheetRowText: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink2, flexShrink: 1 },
  sheetRowTextSel: { fontFamily: fonts.sansBold, color: colors.terracotta },
  /** Une action se lit comme un bouton, pas comme un choix a cocher. */
  sheetRowTextAction: { fontFamily: fonts.sansMedium, color: colors.terracotta },
  sheetRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetValue: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, maxWidth: 150 },
  sheetCount: { fontFamily: fonts.sans, fontSize: 13, color: colors.hint },
  sheetDone: {
    marginTop: spacing.lg,
    backgroundColor: colors.ink,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sheetDoneText: { fontFamily: fonts.sansBold, color: colors.cream, fontSize: 14 },
});

export default FilterSheet;
