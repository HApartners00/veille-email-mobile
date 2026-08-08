import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { IconRefresh, IconSearch } from '@/components/icons';
import { LogoVmail } from '@/components/logo-v';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Bandeau charbon commun aux onglets « Envoyés » et « Brouillons ».
 *
 * Reprend le vocabulaire visuel du bandeau de l'onglet Emails
 * (`app/(tabs)/index.tsx`) : logo + titre extrabold, champ de recherche translucide,
 * puces de filtre par boîte. Le design reste propre au mobile — c'est la logique
 * (filtres, recherche, libellés) qui doit être identique au web.
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
          <Pressable
            style={[styles.chip, selectedBoxes.length === 0 && styles.chipActive]}
            onPress={onClearBoxes}
          >
            <Text style={[styles.chipText, selectedBoxes.length === 0 && styles.chipTextActive]}>
              {allBoxesLabel}
            </Text>
          </Pressable>
          {accounts.map((addr) => {
            const active = selectedBoxes.includes(addr);
            return (
              <Pressable
                key={addr}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onToggleBox(addr)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {addr}
                  {(emptyBoxes || []).includes(addr) ? (
                    <Text style={styles.chipZero}> · 0</Text>
                  ) : null}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
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
  chipText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.onDarkMuted },
  chipTextActive: { color: colors.onDark },
});

export default MailboxHeader;
