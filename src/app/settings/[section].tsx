import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconChevronLeft } from '@/components/icons';
import { SettingsPanel, settingsSectionTitle, type SettingsSection } from '@/components/settings-panel';
import { signatureTitle } from '@/components/signature-section';
import { useI18n } from '@/context/i18n';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const KNOWN: SettingsSection[] = [
  'langue',
  'notifications',
  'rapport',
  'abonnement',
  'parrainage',
  'personnalisation',
  'signature',
];

/**
 * Sous-ecran d'une section de reglages. Meme systeme visuel que le reste de l'app :
 * bandeau charbon (retour + titre), contenu sur creme.
 */
export default function SettingsSectionScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { section } = useLocalSearchParams<{ section: string }>();
  const key = (KNOWN.includes(section as SettingsSection) ? section : 'langue') as SettingsSection;

  const titles: Record<string, string> = {
    langue: t.settings.language,
    notifications: settingsSectionTitle('notifications', locale) ?? t.settings.groupApp,
    rapport: t.settings.dailyReport,
    abonnement: t.settings.subscription,
    parrainage: settingsSectionTitle('parrainage', locale) ?? t.settings.groupAccount,
    personnalisation: settingsSectionTitle('personnalisation', locale) ?? t.settings.groupAccount,
    signature: signatureTitle(locale),
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {titles[key]}
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <SettingsPanel only={key} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fond },
  safe: { backgroundColor: colors.charcoal },
  topbar: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(234,225,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.sansBold, fontSize: 20, color: colors.onDark, letterSpacing: -0.3, flex: 1 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: spacing.xxl * 2 },
});
