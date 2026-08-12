import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoVmail } from '@/components/logo-v';
import { SettingsPanel } from '@/components/settings-panel';
import { useI18n } from '@/context/i18n';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * Index des reglages : on ne voit que les intitules des sections, on entre dedans
 * en tapant dessus (sous-ecrans dans src/app/settings/[section].tsx).
 *
 * Avant : toutes les sections etaient empilees ici, soit ~1900 pt de defilement.
 * Tout l'etat vit dans SettingsPanel, partage entre l'index et les sous-ecrans.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.top, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.topRow}>
          <LogoVmail size={23} />
        </View>
        <Text style={styles.title}>{t.tabs.settings}</Text>
      </View>

      <SettingsPanel only="index" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.fond },
  content: { paddingBottom: spacing.xxl },
  top: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 33,
    color: colors.onDark,
    letterSpacing: -0.8,
    marginTop: spacing.md + 2,
  },
});
