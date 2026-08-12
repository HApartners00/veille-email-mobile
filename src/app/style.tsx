import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

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

// 8 langues (repli anglais si locale inconnue).
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
  es: {
    title: 'Tu estilo',
    subtitle: 'Lo que la herramienta aprendió sobre tu forma de escribir.',
    off: 'La personalización está desactivada. Vuelve a activarla en Ajustes.',
    portrait: 'Retrato general',
    none: 'Nada aprendido todavía — envía algunas respuestas.',
    formality: 'Tono',
    greeting: 'Saludo',
    length: 'Longitud',
    emoji: 'Emojis',
    traits: 'En resumen',
    languages: 'Idiomas',
    contacts: 'Memoria por destinatario',
    samples: 'muest.',
    routing: 'Clasificación aprendida',
    routingBody: 'Reglas de clasificación activas:',
    back: 'Volver',
    yes: 'Sí',
    no: 'No',
  },
  de: {
    title: 'Ihr Stil',
    subtitle: 'Was das Tool über Ihren Schreibstil gelernt hat.',
    off: 'Die Personalisierung ist deaktiviert. Aktivieren Sie sie in den Einstellungen.',
    portrait: 'Gesamtbild',
    none: 'Noch nichts gelernt — senden Sie ein paar Antworten.',
    formality: 'Ton',
    greeting: 'Anrede',
    length: 'Länge',
    emoji: 'Emojis',
    traits: 'Kurz gesagt',
    languages: 'Sprachen',
    contacts: 'Gedächtnis pro Empfänger',
    samples: 'Bsp.',
    routing: 'Gelernte Sortierung',
    routingBody: 'Aktive Klassifizierungsregeln:',
    back: 'Zurück',
    yes: 'Ja',
    no: 'Nein',
  },
  pt: {
    title: 'O seu estilo',
    subtitle: 'O que a ferramenta aprendeu sobre a sua forma de escrever.',
    off: 'A personalização está desativada. Reative-a nas Definições.',
    portrait: 'Retrato geral',
    none: 'Nada aprendido ainda — envie algumas respostas.',
    formality: 'Tom',
    greeting: 'Saudação',
    length: 'Comprimento',
    emoji: 'Emojis',
    traits: 'Em resumo',
    languages: 'Idiomas',
    contacts: 'Memória por destinatário',
    samples: 'amost.',
    routing: 'Triagem aprendida',
    routingBody: 'Regras de classificação ativas:',
    back: 'Voltar',
    yes: 'Sim',
    no: 'Não',
  },
  it: {
    title: 'Il tuo stile',
    subtitle: 'Ciò che lo strumento ha imparato sul tuo modo di scrivere.',
    off: 'La personalizzazione è disattivata. Riattivala nelle Impostazioni.',
    portrait: 'Ritratto generale',
    none: 'Ancora nulla appreso — invia qualche risposta.',
    formality: 'Tono',
    greeting: 'Saluto',
    length: 'Lunghezza',
    emoji: 'Emoji',
    traits: 'In breve',
    languages: 'Lingue',
    contacts: 'Memoria per destinatario',
    samples: 'camp.',
    routing: 'Ordinamento appreso',
    routingBody: 'Regole di classificazione attive:',
    back: 'Indietro',
    yes: 'Sì',
    no: 'No',
  },
  ar: {
    title: 'أسلوبك',
    subtitle: 'ما تعلّمته الأداة عن طريقتك في الكتابة.',
    off: 'التخصيص مُعطَّل. أعِد تفعيله من الإعدادات.',
    portrait: 'صورة عامة',
    none: 'لم يُتعلَّم شيء بعد — أرسِل بعض الردود.',
    formality: 'النبرة',
    greeting: 'التحية',
    length: 'الطول',
    emoji: 'الرموز التعبيرية',
    traits: 'باختصار',
    languages: 'اللغات',
    contacts: 'الذاكرة حسب المُراسَل',
    samples: 'عيّنة',
    routing: 'التصنيف المُتعلَّم',
    routingBody: 'قواعد التصنيف النشطة:',
    back: 'رجوع',
    yes: 'نعم',
    no: 'لا',
  },
  ru: {
    title: 'Ваш стиль',
    subtitle: 'Что инструмент узнал о вашей манере письма.',
    off: 'Персонализация отключена. Включите её снова в Настройках.',
    portrait: 'Общий портрет',
    none: 'Пока ничего не изучено — отправьте несколько ответов.',
    formality: 'Тон',
    greeting: 'Приветствие',
    length: 'Длина',
    emoji: 'Эмодзи',
    traits: 'Вкратце',
    languages: 'Языки',
    contacts: 'Память по получателю',
    samples: 'обр.',
    routing: 'Изученная сортировка',
    routingBody: 'Активные правила классификации:',
    back: 'Назад',
    yes: 'Да',
    no: 'Нет',
  },
};

// Libellés localisés des traits (8 langues, repli anglais).
const FORMALITY_LABELS: Record<string, Record<string, string>> = {
  formal: { fr: 'soutenu', en: 'formal', es: 'formal', de: 'förmlich', pt: 'formal', it: 'formale', ar: 'رسمي', ru: 'официальный' },
  casual: { fr: 'familier', en: 'casual', es: 'informal', de: 'locker', pt: 'informal', it: 'informale', ar: 'عفوي', ru: 'неформальный' },
  neutral: { fr: 'neutre', en: 'neutral', es: 'neutral', de: 'neutral', pt: 'neutro', it: 'neutro', ar: 'محايد', ru: 'нейтральный' },
};
const LENGTH_LABELS: Record<string, Record<string, string>> = {
  short: { fr: 'bref', en: 'short', es: 'breve', de: 'kurz', pt: 'breve', it: 'breve', ar: 'قصير', ru: 'короткий' },
  medium: { fr: 'concis', en: 'medium', es: 'medio', de: 'mittel', pt: 'médio', it: 'medio', ar: 'متوسط', ru: 'средний' },
  long: { fr: 'développé', en: 'long', es: 'largo', de: 'lang', pt: 'longo', it: 'lungo', ar: 'طويل', ru: 'подробный' },
};
// tu = tutoiement/informel ; vous = vouvoiement/formel. ru : всегда «на вы» (vouvoiement).
const ADDRESS_LABELS: Record<string, Record<string, string>> = {
  tu: { fr: 'tutoiement', en: 'informal', es: 'tuteo', de: 'Duzen', pt: 'informal (tu)', it: 'informale (tu)', ar: 'مخاطبة غير رسمية', ru: 'на «ты»' },
  vous: { fr: 'vouvoiement', en: 'formal', es: 'trato formal', de: 'Siezen', pt: 'formal (você)', it: 'formale (lei)', ar: 'مخاطبة رسمية', ru: 'на «вы»' },
};

function pick(table: Record<string, Record<string, string>>, key: string, locale: string): string | null {
  const row = table[key];
  if (!row) return null;
  return row[locale] ?? row.en ?? null;
}
function fmtFormality(v: string | null | undefined, locale: string): string | null {
  if (!v) return null;
  return pick(FORMALITY_LABELS, v, locale) ?? v;
}
function fmtLength(v: string | null | undefined, locale: string): string | null {
  if (!v) return null;
  return pick(LENGTH_LABELS, v, locale) ?? v;
}
function fmtAddress(v: string | null | undefined, locale: string): string | null {
  if (v !== 'tu' && v !== 'vous') return null;
  return pick(ADDRESS_LABELS, v, locale);
}

export default function StyleScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en;

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
                    <Row label={t.formality} value={fmtFormality(sp?.formality, locale)} />
                    <Row label={t.greeting} value={sp?.greeting || null} />
                    <Row label={t.length} value={fmtLength(sp?.length, locale)} />
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
                      fmtAddress(c.traits?.address, locale),
                      fmtFormality(c.traits?.formality, locale),
                      fmtLength(c.traits?.length, locale),
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
  root: { flex: 1, backgroundColor: colors.fond },
  safe: { backgroundColor: colors.charcoal },
  topbar: { backgroundColor: colors.charcoal, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontFamily: fonts.sansSemibold, color: colors.onDark, fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: fonts.sansBold, fontSize: 24, color: colors.ink },
  // ⚠️ SUR FOND SOMBRE : `muted` y serait a 2,83:1 depuis le correctif du 12/08.
  // Le fond de page etant sombre, ce libelle prend le jeton prevu pour lui.
  subtitle: { fontFamily: fonts.sans, fontSize: 13, color: colors.onDarkMuted, marginTop: 2, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.ink, marginBottom: spacing.xs },
  hint: { fontFamily: fonts.sans, color: colors.hint, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingVertical: 6,
    borderBottomColor: colors.cardline,
    borderBottomWidth: 1,
  },
  rowLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  rowValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.cream,
  },
  chipText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.terracotta },
  contactRow: { paddingVertical: 8, borderBottomColor: colors.cardline, borderBottomWidth: 1 },
  contactTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  contactKey: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink, flexShrink: 1 },
  contactN: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted },
  contactTraits: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 },
  bigNum: { fontFamily: fonts.sansBold, fontSize: 26, color: colors.ink, marginTop: spacing.xs },
});
