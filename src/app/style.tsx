import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';

type Traits = {
  address?: 'tu' | 'vous' | null;
  formality?: string | null;
  greeting?: string | null;
  length?: string | null;
  avg_len?: number | null;
  emoji?: boolean;
};
type Profile = {
  enabled: boolean;
  style_profile: {
    greeting: string | null;
    signoff: string | null;
    formality: string | null;
    length: string | null;
    emoji: boolean;
    traits: string[];
    languages: string[];
  };
  contacts: { scope: string; key: string; sample_count: number; traits: Traits }[];
  routing_rules_count: number;
};

// fr complet ; repli anglais pour les autres locales (écran informatif).
const STR: Record<string, Record<string, string>> = {
  fr: {
    title: 'Votre style',
    subtitle: 'Ce que l’outil a appris de votre façon d’écrire.',
    off: 'La personnalisation est désactivée. Réactivez-la dans Réglages.',
    portrait: 'Portrait général',
    none: 'Rien d’appris pour l’instant — envoyez quelques réponses.',
    formality: 'Ton',
    greeting: 'Salutation',
    length: 'Longueur',
    emoji: 'Emojis',
    traits: 'En bref',
    languages: 'Langues',
    contacts: 'Mémoire par destinataire',
    samples: 'éch.',
    routing: 'Tri appris',
    routingBody: 'Règles de classement actives :',
    back: 'Retour',
    yes: 'Oui',
    no: 'Non',
  },
  en: {
    title: 'Your style',
    subtitle: 'What the tool learned about how you write.',
    off: 'Personalization is off. Turn it back on in Settings.',
    portrait: 'Overall portrait',
    none: 'Nothing learned yet — send a few replies.',
    formality: 'Tone',
    greeting: 'Greeting',
    length: 'Length',
    emoji: 'Emojis',
    traits: 'In short',
    languages: 'Languages',
    contacts: 'Per-recipient memory',
    samples: 'samp.',
    routing: 'Learned sorting',
    routingBody: 'Active classification rules:',
    back: 'Back',
    yes: 'Yes',
    no: 'No',
  },
};

function fmtFormality(v: string | null | undefined, fr: boolean): string | null {
  if (!v) return null;
  if (v === 'formal') return fr ? 'soutenu' : 'formal';
  if (v === 'casual') return fr ? 'familier' : 'casual';
  if (v === 'neutral') return fr ? 'neutre' : 'neutral';
  return v;
}
function fmtLength(v: string | null | undefined, fr: boolean): string | null {
  if (!v) return null;
  if (v === 'short') return fr ? 'bref' : 'short';
  if (v === 'medium') return fr ? 'concis' : 'medium';
  if (v === 'long') return fr ? 'développé' : 'long';
  return v;
}
function fmtAddress(v: string | null | undefined, fr: boolean): string | null {
  if (v === 'tu') return fr ? 'tutoiement' : 'informal';
  if (v === 'vous') return fr ? 'vouvoiement' : 'formal';
  return null;
}

export default function StyleScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en;
  const fr = locale === 'fr';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<Profile>('/api/personalization/profile');
        setData(r);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sp = data?.style_profile;
  const hasPortrait =
    !!sp && (!!sp.formality || !!sp.greeting || !!sp.length || sp.traits.length > 0);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ {t.back}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>

          {!data || data.enabled === false ? (
            <View style={styles.card}>
              <Text style={styles.hint}>{t.off}</Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t.portrait}</Text>
                {!hasPortrait ? (
                  <Text style={styles.hint}>{t.none}</Text>
                ) : (
                  <>
                    <Row label={t.formality} value={fmtFormality(sp?.formality, fr)} />
                    <Row label={t.greeting} value={sp?.greeting || null} />
                    <Row label={t.length} value={fmtLength(sp?.length, fr)} />
                    <Row label={t.emoji} value={sp?.emoji ? t.yes : t.no} />
                    <Row
                      label={t.languages}
                      value={sp?.languages?.length ? sp.languages.join(', ') : null}
                    />
                    {sp?.traits?.length ? (
                      <View style={styles.chipsWrap}>
                        {sp.traits.map((tt, i) => (
                          <View key={i} style={styles.chip}>
                            <Text style={styles.chipText}>{tt}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </View>

              {data.contacts?.length ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{t.contacts}</Text>
                  {data.contacts.map((c) => {
                    const parts = [
                      fmtAddress(c.traits?.address, fr),
                      fmtFormality(c.traits?.formality, fr),
                      fmtLength(c.traits?.length, fr),
                      c.traits?.greeting ? `« ${c.traits.greeting} »` : null,
                    ].filter(Boolean);
                    return (
                      <View key={`${c.scope}:${c.key}`} style={styles.contactRow}>
                        <View style={styles.contactTop}>
                          <Text style={styles.contactKey} numberOfLines={1}>
                            {c.scope === 'domain' ? `@${c.key}` : c.key}
                          </Text>
                          <Text style={styles.contactN}>
                            {c.sample_count} {t.samples}
                          </Text>
                        </View>
                        {parts.length ? <Text style={styles.contactTraits}>{parts.join(' · ')}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t.routing}</Text>
                <Text style={styles.hint}>{t.routingBody}</Text>
                <Text style={styles.bigNum}>{data.routing_rules_count}</Text>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  safe: { backgroundColor: colors.charcoal },
  topbar: { backgroundColor: colors.charcoal, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.onDark, fontSize: 16, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  hint: { color: colors.hint, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomColor: colors.cardline,
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  rowValue: { fontSize: 14, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.cream,
  },
  chipText: { fontSize: 12, color: colors.terracotta, fontWeight: '600' },
  contactRow: { paddingVertical: 8, borderBottomColor: colors.cardline, borderBottomWidth: 1 },
  contactTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  contactKey: { fontSize: 14, color: colors.ink, flexShrink: 1 },
  contactN: { fontSize: 11, color: colors.muted },
  contactTraits: { fontSize: 12, color: colors.muted, marginTop: 2 },
  bigNum: { fontSize: 26, fontWeight: '700', color: colors.ink, marginTop: spacing.xs },
});
