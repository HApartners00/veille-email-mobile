import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useAuth } from '@/context/auth';
import { apiGet, apiPost } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

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

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default function Settings() {
  const { session, signOut } = useAuth();
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
      setMsg({ type: 'ok', text: 'Enregistré ✓' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Enregistrement impossible.' });
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
        setBillingMsg(e?.message || 'Lecture impossible.');
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
        setBillingMsg('Action impossible.');
      }
    } catch (e: any) {
      setBillingUi('error');
      setBillingMsg(e?.message || 'Action impossible.');
    }
  }

  function billingStatusText(): string {
    const s = billing?.status || 'none';
    if (s === 'trialing')
      return `Essai gratuit en cours${
        billing?.trial_end ? `, jusqu'au ${formatDate(billing.trial_end)}` : ''
      }.`;
    if (s === 'active')
      return billing?.cancel_at_period_end
        ? `Abonnement actif — se termine le ${formatDate(billing?.current_period_end || null)} (résiliation programmée).`
        : `Abonnement actif — prochain renouvellement le ${formatDate(billing?.current_period_end || null)}.`;
    if (s === 'past_due' || s === 'unpaid')
      return 'Paiement en échec. Mettez à jour votre moyen de paiement pour conserver le service.';
    if (s === 'canceled')
      return 'Abonnement résilié. Réabonnez-vous pour relancer votre veille quotidienne.';
    return `Démarrez votre essai gratuit de 14 jours${
      PRICE_LABEL ? `, puis ${PRICE_LABEL}` : ''
    }. Sans abonnement actif, le rapport quotidien est suspendu.`;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Connecté en tant que</Text>
        <Text style={styles.value}>{email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Rapport quotidien</Text>
        {loading ? (
          <ActivityIndicator color={colors.terracotta} style={{ marginVertical: spacing.md }} />
        ) : (
          <>
            {!hasAccounts ? (
              <Text style={styles.hint}>
                Connectez une boîte (onglet Sources) pour régler l&apos;heure et les jours.
              </Text>
            ) : null}

            <Text style={styles.subLabel}>Heure</Text>
            <View style={styles.hourRow}>
              <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.max(0, h - 1))}>
                <Text style={styles.hourBtnText}>−</Text>
              </Pressable>
              <Text style={styles.hourValue}>{String(hour).padStart(2, '0')}h00</Text>
              <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.min(23, h + 1))}>
                <Text style={styles.hourBtnText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.subLabel}>Jours</Text>
            <View style={styles.daysRow}>
              {DAYS.map((d) => {
                const on = days.has(d.value);
                return (
                  <Pressable
                    key={d.value}
                    style={[styles.day, on && styles.dayOn]}
                    onPress={() => toggleDay(d.value)}
                  >
                    <Text style={[styles.dayText, on && styles.dayTextOn]}>{d.label}</Text>
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
                <Text style={styles.saveBtnText}>Enregistrer</Text>
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
        <Text style={styles.cardTitle}>Abonnement</Text>
        <Text style={styles.hint}>Votre accès au tri quotidien et aux brouillons IA.</Text>
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
                    {billingUi === 'redirecting' ? 'Ouverture…' : 'Gérer mon abonnement'}
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
                    {billingUi === 'redirecting' ? 'Redirection…' : "Démarrer l'essai gratuit"}
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
        <Text style={styles.signoutText}>Se déconnecter</Text>
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
