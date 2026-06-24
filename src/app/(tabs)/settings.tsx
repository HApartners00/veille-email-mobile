import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { isRtl, locales, localeNames, type Locale } from '@/lib/i18n';
import { colors, radius, spacing } from '@/lib/theme';

// Jours dans l'ordre Lun→Dim ; le libellé vient du dictionnaire (daysShort, indexé 0=Dim).
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

// Libellé du prix (facultatif) — défini par EXPO_PUBLIC_PLAN_PRICE_LABEL, ex. « 9,99 €/mois ».
const PRICE_LABEL = process.env.EXPO_PUBLIC_PLAN_PRICE_LABEL || '';

type BillingStatus = {
  status: string;
  entitled: boolean;
  hasCustomer: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
};

function formatDate(value: string | null, intl: string): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

// Libellés de la carte « Personnalisation » (autonomes, repli anglais).
type PersoStrings = {
  title: string;
  master: string;
  masterHint: string;
  learn: string;
  learnHint: string;
  reset: string;
  resetConfirm: string;
  resetCancel: string;
  resetOk: string;
  done: string;
  err: string;
  viewStyle: string;
};
const PERSO: Record<string, PersoStrings> = {
  fr: {
    title: 'Personnalisation',
    master: 'Adapter l’écriture à mon style',
    masterHint:
      'L’outil apprend votre ton et votre façon d’écrire à chaque destinataire, à partir de vos réponses.',
    learn: 'Apprendre de mes réponses',
    learnHint:
      'Conserve quelques réponses réelles pour mieux imiter votre style. Sinon, seul un portrait abstrait est gardé.',
    reset: 'Réinitialiser ma personnalisation',
    resetConfirm: 'Effacer tout le style appris ? Action irréversible.',
    resetCancel: 'Annuler',
    resetOk: 'Réinitialiser',
    done: 'Personnalisation réinitialisée.',
    err: 'Action impossible.',
    viewStyle: 'Voir votre style',
  },
  en: {
    title: 'Personalization',
    master: 'Adapt writing to my style',
    masterHint:
      'The tool learns your tone and writing style for each recipient, from your replies.',
    learn: 'Learn from my replies',
    learnHint:
      'Keeps a few real replies to better imitate your style. Otherwise only an abstract profile is kept.',
    reset: 'Reset my personalization',
    resetConfirm: 'Erase all learned style? This cannot be undone.',
    resetCancel: 'Cancel',
    resetOk: 'Reset',
    done: 'Personalization reset.',
    err: 'Action failed.',
    viewStyle: 'View your style',
  },
  es: {
    title: 'Personalización',
    master: 'Adaptar la redacción a mi estilo',
    masterHint:
      'La herramienta aprende tu tono y tu forma de escribir con cada destinatario, a partir de tus respuestas.',
    learn: 'Aprender de mis respuestas',
    learnHint:
      'Guarda algunas respuestas reales para imitar mejor tu estilo. Si no, solo se guarda un perfil abstracto.',
    reset: 'Restablecer mi personalización',
    resetConfirm: '¿Borrar todo el estilo aprendido? Acción irreversible.',
    resetCancel: 'Cancelar',
    resetOk: 'Restablecer',
    done: 'Personalización restablecida.',
    err: 'Acción imposible.',
    viewStyle: 'Ver tu estilo',
  },
  de: {
    title: 'Personalisierung',
    master: 'Schreibstil an mich anpassen',
    masterHint:
      'Das Tool lernt deinen Ton und Schreibstil pro Empfänger aus deinen Antworten.',
    learn: 'Aus meinen Antworten lernen',
    learnHint:
      'Speichert einige echte Antworten, um deinen Stil besser nachzuahmen. Sonst nur ein abstraktes Profil.',
    reset: 'Personalisierung zurücksetzen',
    resetConfirm: 'Allen gelernten Stil löschen? Nicht umkehrbar.',
    resetCancel: 'Abbrechen',
    resetOk: 'Zurücksetzen',
    done: 'Personalisierung zurückgesetzt.',
    err: 'Aktion fehlgeschlagen.',
    viewStyle: 'Deinen Stil ansehen',
  },
  pt: {
    title: 'Personalização',
    master: 'Adaptar a escrita ao meu estilo',
    masterHint:
      'A ferramenta aprende o seu tom e a sua forma de escrever para cada destinatário, a partir das suas respostas.',
    learn: 'Aprender com as minhas respostas',
    learnHint:
      'Guarda algumas respostas reais para imitar melhor o seu estilo. Caso contrário, apenas um perfil abstrato.',
    reset: 'Repor a minha personalização',
    resetConfirm: 'Apagar todo o estilo aprendido? Ação irreversível.',
    resetCancel: 'Cancelar',
    resetOk: 'Repor',
    done: 'Personalização reposta.',
    err: 'Ação impossível.',
    viewStyle: 'Ver o seu estilo',
  },
  it: {
    title: 'Personalizzazione',
    master: 'Adatta la scrittura al mio stile',
    masterHint:
      'Lo strumento impara il tuo tono e il tuo modo di scrivere per ciascun destinatario, dalle tue risposte.',
    learn: 'Impara dalle mie risposte',
    learnHint:
      'Conserva alcune risposte reali per imitare meglio il tuo stile. Altrimenti solo un profilo astratto.',
    reset: 'Reimposta la mia personalizzazione',
    resetConfirm: 'Cancellare tutto lo stile appreso? Azione irreversibile.',
    resetCancel: 'Annulla',
    resetOk: 'Reimposta',
    done: 'Personalizzazione reimpostata.',
    err: 'Azione impossibile.',
    viewStyle: 'Vedi il tuo stile',
  },
  ar: {
    title: 'التخصيص',
    master: 'تكييف الكتابة مع أسلوبي',
    masterHint: 'تتعلّم الأداة نبرتك وأسلوبك في الكتابة لكل مُراسَل، انطلاقًا من ردودك.',
    learn: 'التعلّم من ردودي',
    learnHint: 'تحتفظ ببعض الردود الفعلية لتقليد أسلوبك بشكل أفضل. وإلا، يُحفظ ملف مجرّد فقط.',
    reset: 'إعادة ضبط التخصيص',
    resetConfirm: 'مسح كل الأسلوب المُتعلَّم؟ إجراء لا رجعة فيه.',
    resetCancel: 'إلغاء',
    resetOk: 'إعادة ضبط',
    done: 'تمت إعادة ضبط التخصيص.',
    err: 'تعذّر تنفيذ الإجراء.',
    viewStyle: 'عرض أسلوبك',
  },
};

export default function Settings() {
  const { session, signOut } = useAuth();
  const { t, f, intl, locale, setLocale } = useI18n();
  const router = useRouter();
  const email = session?.user?.email ?? '—';

  const [loading, setLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hour, setHour] = useState(7);
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Abonnement (Stripe)
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingUi, setBillingUi] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const [billingMsg, setBillingMsg] = useState<string | null>(null);

  // Personnalisation
  const ps = PERSO[locale] ?? PERSO.en;
  const [persoLoaded, setPersoLoaded] = useState(false);
  const [persoEnabled, setPersoEnabled] = useState(true);
  const [persoLearn, setPersoLearn] = useState(false);
  const [persoBusy, setPersoBusy] = useState(false);
  const [persoMsg, setPersoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{ personalization_enabled: boolean; learn_from_replies: boolean }>(
          '/api/personalization',
        );
        setPersoEnabled(r.personalization_enabled !== false);
        setPersoLearn(r.learn_from_replies === true);
      } catch {
        // garde les valeurs par défaut
      } finally {
        setPersoLoaded(true);
      }
    })();
  }, []);

  async function savePerso(patch: {
    personalization_enabled?: boolean;
    learn_from_replies?: boolean;
  }) {
    const prevEnabled = persoEnabled;
    const prevLearn = persoLearn;
    if (typeof patch.personalization_enabled === 'boolean') setPersoEnabled(patch.personalization_enabled);
    if (typeof patch.learn_from_replies === 'boolean') setPersoLearn(patch.learn_from_replies);
    setPersoMsg(null);
    try {
      await apiPost('/api/personalization', patch);
    } catch {
      setPersoEnabled(prevEnabled);
      setPersoLearn(prevLearn);
      setPersoMsg({ type: 'err', text: ps.err });
    }
  }

  function resetPerso() {
    Alert.alert(ps.title, ps.resetConfirm, [
      { text: ps.resetCancel, style: 'cancel' },
      {
        text: ps.resetOk,
        style: 'destructive',
        onPress: async () => {
          setPersoBusy(true);
          setPersoMsg(null);
          try {
            await apiDelete('/api/personalization');
            setPersoMsg({ type: 'ok', text: ps.done });
          } catch {
            setPersoMsg({ type: 'err', text: ps.err });
          } finally {
            setPersoBusy(false);
          }
        },
      },
    ]);
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{ hasAccounts: boolean; hour: number; days: string }>(
          '/api/digest-settings',
        );
        setHasAccounts(!!r.hasAccounts);
        setHour(typeof r.hour === 'number' ? r.hour : 7);
        setDays(
          new Set(
            (r.days || '1,2,3,4,5')
              .split(',')
              .map((d) => Number(d))
              .filter((n) => !Number.isNaN(n)),
          ),
        );
      } catch {
        // pas de boîte / non configuré : on garde les valeurs par défaut
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleDay(v: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const daysStr = Array.from(days).sort((a, b) => a - b).join(',');
      await apiPost('/api/digest-settings', { hour, days: daysStr });
      setMsg({ type: 'ok', text: t.settings.saved });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || t.settings.saveErr });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<BillingStatus>('/api/billing/status');
        setBilling(r);
        setBillingUi('ready');
      } catch (e: any) {
        setBillingUi('error');
        setBillingMsg(e?.message || t.settings.readImpossible);
      }
    })();
  }, []);

  async function goBilling(endpoint: '/api/billing/checkout' | '/api/billing/portal') {
    setBillingUi('redirecting');
    setBillingMsg(null);
    try {
      const r = await apiPost<{ url?: string }>(endpoint, {});
      if (r?.url) {
        await WebBrowser.openBrowserAsync(r.url);
        setBillingUi('ready');
      } else {
        setBillingUi('error');
        setBillingMsg(t.settings.actionImpossible);
      }
    } catch (e: any) {
      setBillingUi('error');
      setBillingMsg(e?.message || t.settings.actionImpossible);
    }
  }

  function billingStatusText(): string {
    const s = billing?.status || 'none';
    if (s === 'trialing')
      return billing?.trial_end
        ? f(t.settings.trialOngoing, { date: formatDate(billing.trial_end, intl) })
        : t.settings.trialOngoingNoDate;
    if (s === 'active')
      return billing?.cancel_at_period_end
        ? f(t.settings.activeCancel, { date: formatDate(billing?.current_period_end || null, intl) })
        : f(t.settings.activeRenew, { date: formatDate(billing?.current_period_end || null, intl) });
    if (s === 'past_due' || s === 'unpaid') return t.settings.pastDue;
    if (s === 'canceled') return t.settings.canceled;
    return PRICE_LABEL
      ? f(t.settings.noneWithPrice, { price: PRICE_LABEL })
      : t.settings.noneNoPrice;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>{t.settings.connectedAs}</Text>
        <Text style={styles.value}>{email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.settings.language}</Text>
        <Text style={styles.hint}>{t.settings.languageHint}</Text>
        <View style={styles.langRow}>
          {locales.map((lng) => {
            const on = locale === lng;
            return (
              <Pressable
                key={lng}
                style={[styles.langChip, on && styles.langChipOn]}
                onPress={() => {
                  if (on) return;
                  const rtlChange = isRtl(lng as Locale) !== isRtl(locale);
                  void setLocale(lng as Locale);
                  if (rtlChange) {
                    Alert.alert(localeNames[lng], t.settings.rtlRestart);
                  }
                }}
              >
                <Text style={[styles.langChipText, on && styles.langChipTextOn]}>
                  {localeNames[lng]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.settings.dailyReport}</Text>
        {loading ? (
          <ActivityIndicator color={colors.terracotta} style={{ marginVertical: spacing.md }} />
        ) : (
          <>
            {!hasAccounts ? (
              <Text style={styles.hint}>{t.settings.connectBoxHint}</Text>
            ) : null}

            <Text style={styles.subLabel}>{t.settings.hourLabel}</Text>
            <View style={styles.hourRow}>
              <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.max(0, h - 1))}>
                <Text style={styles.hourBtnText}>−</Text>
              </Pressable>
              <Text style={styles.hourValue}>{String(hour).padStart(2, '0')}h00</Text>
              <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.min(23, h + 1))}>
                <Text style={styles.hourBtnText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.subLabel}>{t.settings.daysLabel}</Text>
            <View style={styles.daysRow}>
              {DAY_VALUES.map((value) => {
                const on = days.has(value);
                return (
                  <Pressable
                    key={value}
                    style={[styles.day, on && styles.dayOn]}
                    onPress={() => toggleDay(value)}
                  >
                    <Text style={[styles.dayText, on && styles.dayTextOn]}>
                      {t.settings.daysShort[value]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.saveBtn, (saving || days.size === 0 || !hasAccounts) && styles.btnDisabled]}
              onPress={save}
              disabled={saving || days.size === 0 || !hasAccounts}
            >
              {saving ? (
                <ActivityIndicator color={colors.onDark} />
              ) : (
                <Text style={styles.saveBtnText}>{t.settings.saveBtn}</Text>
              )}
            </Pressable>

            {msg ? (
              <Text style={[styles.msg, msg.type === 'ok' ? styles.msgOk : styles.msgErr]}>
                {msg.text}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.settings.subscription}</Text>
        <Text style={styles.hint}>{t.settings.subHint}</Text>
        {billingUi === 'loading' ? (
          <ActivityIndicator color={colors.terracotta} style={{ marginVertical: spacing.md }} />
        ) : (
          <>
            <Text style={styles.billingStatus}>{billingStatusText()}</Text>
            <View style={styles.billingBtns}>
              {billing?.hasCustomer ? (
                <Pressable
                  style={[styles.manageBtn, billingUi === 'redirecting' && styles.btnDisabled]}
                  onPress={() => goBilling('/api/billing/portal')}
                  disabled={billingUi === 'redirecting'}
                >
                  <Text style={styles.manageBtnText}>
                    {billingUi === 'redirecting' ? t.settings.opening : t.settings.manage}
                  </Text>
                </Pressable>
              ) : null}
              {!billing?.entitled ? (
                <Pressable
                  style={[
                    styles.saveBtn,
                    styles.subscribeBtn,
                    billingUi === 'redirecting' && styles.btnDisabled,
                  ]}
                  onPress={() => goBilling('/api/billing/checkout')}
                  disabled={billingUi === 'redirecting'}
                >
                  <Text style={styles.saveBtnText}>
                    {billingUi === 'redirecting' ? t.settings.redirecting : t.settings.startTrial}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {billingMsg ? (
              <Text style={[styles.msg, billingUi === 'error' ? styles.msgErr : styles.msgOk]}>
                {billingMsg}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{ps.title}</Text>

        <View style={styles.persoRow}>
          <View style={styles.persoTexts}>
            <Text style={styles.persoLabel}>{ps.master}</Text>
            <Text style={styles.hint}>{ps.masterHint}</Text>
          </View>
          <Switch
            value={persoEnabled}
            disabled={!persoLoaded}
            onValueChange={(v) => savePerso({ personalization_enabled: v })}
            trackColor={{ true: colors.terracotta, false: colors.cardline }}
            thumbColor={colors.surface}
          />
        </View>

        <View style={[styles.persoRow, styles.persoRowBordered, !persoEnabled && styles.persoDimmed]}>
          <View style={styles.persoTexts}>
            <Text style={styles.persoLabel}>{ps.learn}</Text>
            <Text style={styles.hint}>{ps.learnHint}</Text>
          </View>
          <Switch
            value={persoLearn}
            disabled={!persoLoaded || !persoEnabled}
            onValueChange={(v) => savePerso({ learn_from_replies: v })}
            trackColor={{ true: colors.terracotta, false: colors.cardline }}
            thumbColor={colors.surface}
          />
        </View>

        <Pressable style={styles.persoLink} onPress={() => router.push('/style')}>
          <Text style={styles.persoLinkText}>{ps.viewStyle} ›</Text>
        </Pressable>

        <Pressable
          style={[styles.persoReset, persoBusy && styles.btnDisabled]}
          onPress={resetPerso}
          disabled={persoBusy}
        >
          {persoBusy ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Text style={styles.persoResetText}>{ps.reset}</Text>
          )}
        </Pressable>

        {persoMsg ? (
          <Text style={[styles.msg, persoMsg.type === 'ok' ? styles.msgOk : styles.msgErr]}>
            {persoMsg.text}
          </Text>
        ) : null}
      </View>

      <Pressable style={styles.signout} onPress={signOut}>
        <Text style={styles.signoutText}>{t.settings.signOut}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: { fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  hint: { color: colors.hint, fontSize: 13, lineHeight: 19 },
  subLabel: {
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xs },
  hourBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: colors.cardline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  hourBtnText: { fontSize: 24, color: colors.ink, lineHeight: 26 },
  hourValue: { fontSize: 26, fontWeight: '700', color: colors.ink, minWidth: 110, textAlign: 'center' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderColor: colors.cardline,
    borderWidth: 1,
    backgroundColor: colors.cream,
  },
  langChipOn: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  langChipText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
  langChipTextOn: { color: colors.surface },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  day: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderColor: colors.cardline,
    borderWidth: 1,
    backgroundColor: colors.cream,
  },
  dayOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  dayTextOn: { color: colors.cream },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },
  billingStatus: { fontSize: 14, color: colors.ink2, lineHeight: 20, marginTop: spacing.xs },
  billingBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  manageBtn: {
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  subscribeBtn: { marginTop: 0, paddingHorizontal: spacing.lg, flexGrow: 1 },
  btnDisabled: { opacity: 0.5 },
  msg: { fontSize: 13, marginTop: spacing.sm },
  msgOk: { color: colors.sage },
  msgErr: { color: colors.danger },
  persoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  persoRowBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
    paddingTop: spacing.md,
  },
  persoDimmed: { opacity: 0.5 },
  persoTexts: { flex: 1, gap: 2 },
  persoLabel: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  persoReset: {
    marginTop: spacing.md,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  persoResetText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  persoLink: { marginTop: spacing.md },
  persoLinkText: { color: colors.terracotta, fontWeight: '600', fontSize: 14 },
  signout: {
    marginTop: spacing.md,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  signoutText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
});
