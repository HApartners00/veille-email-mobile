import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Caret, FilterSheet, type SheetOption } from '@/components/filter-sheet';
import { IconInbox, IconRefresh, IconSearch } from '@/components/icons';
import { LogoVmail } from '@/components/logo-v';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Bandeau charbon commun aux onglets « Envoyés » et « Brouillons ».
 *
 * Reprend le vocabulaire visuel du bandeau de l'onglet Emails
 * (`app/(tabs)/index.tsx`) : logo + titre extrabold, champ de recherche translucide,
 * filtre par boîte. Le design reste propre au mobile — c'est la logique
 * (filtres, recherche, libellés) qui doit être identique au web.
 *
 * FILTRE PAR BOÎTE : LISTE DÉROULANTE depuis le 09/08/2026, demande de HA.
 * C'était une rangée de puces, une par boîte. Trois raisons de basculer :
 *  • l'onglet Emails utilise déjà une déroulante — deux façons de filtrer par boîte
 *    dans la même app, c'était une de trop ;
 *  • à quatre ou cinq boîtes connectées, la rangée passe sur deux lignes et pousse
 *    la liste vers le bas, sur un écran où la hauteur est ce qui manque ;
 *  • la déroulante affiche le nombre d'éléments par boîte, ce que les puces ne
 *    faisaient que pour les boîtes vides (« · 0 »).
 * La feuille est le composant PARTAGÉ `components/filter-sheet.tsx`, celui-là même
 * qu'utilise l'onglet Emails — pas une copie.
 */
export function MailboxHeader({
  title,
  subtitle,
  query,
  onQueryChange,
  searchPlaceholder,
  accounts,
  emptyBoxes,
  selectedBoxes,
  onToggleBox,
  onClearBoxes,
  allBoxesLabel,
  refreshLabel,
  onRefresh,
  refreshing,
  paddingTop,
}: {
  title: string;
  subtitle: string;
  query: string;
  onQueryChange: (v: string) => void;
  searchPlaceholder: string;
  accounts: string[];
  /**
   * Boîtes dont on SAIT qu'elles n'ont aucun élément — affichées avec « · 0 ».
   * Optionnel : l'onglet Brouillons ne s'en sert pas (une boîte sans brouillon
   * n'est pas une anomalie), l'onglet Envoyés si.
   */
  emptyBoxes?: string[];
  selectedBoxes: string[];
  onToggleBox: (email: string) => void;
  onClearBoxes: () => void;
  allBoxesLabel: string;
  /** Bouton d'actualisation — omis si `onRefresh` n'est pas fourni. */
  refreshLabel?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  paddingTop: number;
}) {
  const [sheet, setSheet] = useState(false);

  // Même libellé que l'onglet Emails : « Toutes les boîtes », l'adresse quand il n'y
  // en a qu'une de cochée, sinon le nombre. Pas de troisième formulation à retenir.
  const boxLabel =
    selectedBoxes.length === 0
      ? allBoxesLabel
      : selectedBoxes.length === 1
        ? (selectedBoxes[0] as string)
        : `${selectedBoxes.length}`;

  // `emptyBoxes` servait à écrire « · 0 » sur une puce. La feuille affiche un compte
  // pour chaque boîte : 0 pour celles qu'on sait vides, rien pour les autres — on ne
  // devine pas un chiffre qu'on n'a pas.
  const options: SheetOption[] = [
    { key: '__all__', label: allBoxesLabel, selected: selectedBoxes.length === 0 },
    ...accounts.map((addr) => ({
      key: addr,
      label: addr,
      count: (emptyBoxes || []).includes(addr) ? 0 : undefined,
      selected: selectedBoxes.includes(addr),
    })),
  ];

  return (
    <View style={[styles.top, { paddingTop }]}>
      <View style={styles.topRow}>
        <LogoVmail size={23} />
        {onRefresh ? (
          <Pressable
            style={[styles.refreshBtn, refreshing && styles.refreshBtnBusy]}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <IconRefresh size={14} color={colors.terracottaLight} />
            <Text style={styles.refreshBtnText}>{refreshLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.searchWrap}>
        <IconSearch size={17} color={colors.onDarkMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onQueryChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.onDarkMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Filtre par boîte — affiché seulement à partir de 2 boîtes, comme le web. */}
      {accounts.length > 1 ? (
        <View style={styles.chipsRow}>
          <Pressable style={[styles.chip, styles.chipBox]} onPress={() => setSheet(true)}>
            <IconInbox size={14} color={colors.onDark} />
            <Text style={[styles.chipText, styles.chipTextBox]} numberOfLines={1}>
              {boxLabel}
            </Text>
            <Caret color={colors.onDark} size={13} />
          </Pressable>
        </View>
      ) : null}

      <FilterSheet
        visible={sheet}
        title={allBoxesLabel}
        options={options}
        doneLabel="OK"
        onPick={(key) => (key === '__all__' ? onClearBoxes() : onToggleBox(key))}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  chipZero: { opacity: 0.6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(240,151,90,0.5)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  refreshBtnBusy: { opacity: 0.6 },
  refreshBtnText: { fontFamily: fonts.sansSemibold, color: colors.terracottaLight, fontSize: 12 },
  title: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 33,
    color: colors.onDark,
    letterSpacing: -0.8,
    marginTop: spacing.md + 2,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.onDarkMuted,
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: spacing.lg,
    backgroundColor: 'rgba(250,247,240,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(250,247,240,0.18)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 1,
    paddingVertical: 4,
  },
  searchInput: {
    fontFamily: fonts.sans,
    flex: 1,
    fontSize: 14,
    letterSpacing: 0,
    color: colors.onDark,
    paddingVertical: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(250,247,240,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    maxWidth: 230,
  },
  chipActive: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  // Puce d'ouverture de la déroulante — mêmes valeurs que `chipBox` de l'onglet Emails.
  chipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(250,247,240,0.10)',
    borderColor: 'rgba(250,247,240,0.28)',
  },
  chipTextBox: { color: colors.onDark, flexShrink: 1 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.onDarkMuted },
  chipTextActive: { color: colors.onDark },
});

export default MailboxHeader;
