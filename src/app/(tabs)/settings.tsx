import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiGet, apiPost } from '@/lib/api';
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

export default function Settings() {
  const { session, signOut } = useAuth();
  const { t, f, intl, locale, setLocale } = useI18n();
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
