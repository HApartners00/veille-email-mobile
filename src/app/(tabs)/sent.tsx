import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MailboxHeader } from '@/components/mailbox-header';
import { useI18n } from '@/context/i18n';
import { apiPost } from '@/lib/api';
import { bcp47 } from '@/lib/i18n';
import {
  cleanText,
  formatDate,
  recipientsEmails,
  recipientsLabel,
} from '@/lib/mail-format';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Onglet « Emails envoyés » — jumeau mobile de apps/web/src/app/sent/.
 *
 * Même source (table Supabase `sent_items`, alimentée par n8n), mêmes filtres,
 * mêmes libellés dans les 8 langues. Seul le design diffère.
 */

type SentItem = {
  id: string;
  account_email: string;
  provider: string;
  subject: string | null;
  preview: string | null;
  recipients: unknown;
  url: string | null;
  has_attachments: boolean;
  sent_via_vmail: boolean;
  sent_at: string;
};

// Doit rester égal à PAGE du web (apps/web/src/app/sent/sent-list.tsx).
const PAGE = 100;

const SELECT =
  'id, account_email, provider, subject, preview, recipients, url, has_attachments, sent_via_vmail, sent_at';

function newIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitize(q: string): string {
  return (q || '')
    .replace(/[^\p{L}\p{N} _@.\-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default function SentScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.sent;

  const [items, setItems] = useState<SentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forwardFor, setForwardFor] = useState<string | null>(null);
  const [forwardTo, setForwardTo] = useState('');

  const load = useCallback(async (q: string, offset: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    let qb = supabase
      .from('sent_items')
      .select(SELECT)
      .order('sent_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    const term = sanitize(q);
    if (term) qb = qb.or(`subject.ilike.%${term}%,preview.ilike.%${term}%`);
    const { data, error: qErr } = await qb;
    if (qErr) {
      // RIEN EN SILENCE : une requête refusée doit se voir, pas se traduire en
      // « aucun email envoyé ».
      setError(qErr.message);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    const rows = (data ?? []) as SentItem[];
    setItems((prev) => (replace ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE);
    setLoading(false);
    setLoadingMore(false);
  }, []);

  useEffect(() => {
    const tm = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(tm);
  }, [query]);

  useEffect(() => {
    void load(debouncedQuery, 0, true);
  }, [debouncedQuery, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(debouncedQuery, 0, true);
    setRefreshing(false);
  }, [load, debouncedQuery]);

  const accounts = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => it.account_email && s.add(it.account_email.toLowerCase()));
    return Array.from(s).sort();
  }, [items]);

  const toggleBox = useCallback((email: string) => {
    const e = email.toLowerCase();
    setSelectedBoxes((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }, []);

  const visible = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    return items.filter((it) => {
      if (
        selectedBoxes.length > 0 &&
        !selectedBoxes.includes((it.account_email || '').toLowerCase())
      )
        return false;
      // Le destinataire est dans un jsonb : `ilike` ne le voit pas côté base.
      // Complément client identique au web, sinon chercher un nom ne remonte rien.
      if (term && !recipientsEmails(it.recipients).some((e) => e.includes(term))) {
        const hay = `${it.subject ?? ''} ${it.preview ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, selectedBoxes, debouncedQuery]);

  async function act(item: SentItem, op: 'resend' | 'forward', to?: string[]) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await apiPost('/api/sent/resend', {
        id: item.id,
        op,
        to,
        idempotencyKey: newIdempotencyKey(),
      });
      setNotice(op === 'resend' ? tx.doneResent : tx.doneForwarded);
      setForwardFor(null);
      setForwardTo('');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tx.errGeneric);
    } finally {
      setBusyId(null);
    }
  }

  function submitForward(item: SentItem) {
    const list = forwardTo
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setError(tx.errAddress);
      return;
    }
    void act(item, 'forward', list);
  }

  const header = (
    <MailboxHeader
      title={tx.title}
      subtitle={tx.subtitle}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={tx.searchPlaceholder}
      accounts={accounts}
      selectedBoxes={selectedBoxes}
      onToggleBox={toggleBox}
      onClearBoxes={() => setSelectedBoxes([])}
      allBoxesLabel={tx.allBoxes}
      paddingTop={insets.top + spacing.md}
    />
  );

  if (loading && items.length === 0) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(it) => it.id}
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terracotta} />
        }
        ListHeaderComponent={
          <View>
            {header}
            <View style={styles.listHeader} />
            {error ? (
              <View style={styles.rowWrap}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={styles.rowWrap}>
                <Text style={styles.notice}>{notice}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.rowWrap}>
            <Text style={styles.empty}>{debouncedQuery ? tx.noMatch : tx.empty}</Text>
            {!debouncedQuery ? <Text style={styles.emptyHint}>{tx.emptyHint}</Text> : null}
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <View style={styles.rowWrap}>
              <Pressable
                onPress={() => !loadingMore && void load(debouncedQuery, items.length, false)}
                disabled={loadingMore}
              >
                <Text style={styles.more}>{loadingMore ? tx.searching : '＋'}</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const to = recipientsLabel(item.recipients, tx.noRecipient);
          const busy = busyId === item.id;
          return (
            <View style={styles.rowWrap}>
              <View style={styles.card}>
                <View style={styles.metaRow}>
                  <Text style={styles.toLabel}>{tx.to}</Text>
                  <Text style={styles.to} numberOfLines={1}>
                    {to}
                  </Text>
                  {item.sent_via_vmail ? <Text style={styles.badge}>{tx.viaVmail}</Text> : null}
                  <Text style={styles.date}>{formatDate(item.sent_at, intl)}</Text>
                </View>

                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject || t.common.noSubject}
                </Text>

                {cleanText(item.preview) ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {cleanText(item.preview)}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  <Pressable onPress={() => void act(item, 'resend')} disabled={busy}>
                    <Text style={[styles.action, busy && styles.actionBusy]}>
                      {busy ? tx.working : tx.resend}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setForwardFor(forwardFor === item.id ? null : item.id);
                      setForwardTo('');
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    <Text style={[styles.actionAlt, busy && styles.actionBusy]}>{tx.forward}</Text>
                  </Pressable>
                  {accounts.length > 1 ? (
                    <Text style={styles.account} numberOfLines={1}>
                      {item.account_email}
                    </Text>
                  ) : null}
                </View>

                {forwardFor === item.id ? (
                  <View style={styles.forwardWrap}>
                    <Text style={styles.forwardPrompt}>{tx.forwardPrompt}</Text>
                    <TextInput
                      style={styles.forwardInput}
                      value={forwardTo}
                      onChangeText={setForwardTo}
                      placeholder={tx.forwardPlaceholder}
                      placeholderTextColor={colors.hint}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                    />
                    <View style={styles.forwardBtns}>
                      <Pressable
                        style={[styles.primaryBtn, busy && styles.actionBusy]}
                        onPress={() => submitForward(item)}
                        disabled={busy}
                      >
                        <Text style={styles.primaryBtnText}>{busy ? tx.working : tx.confirm}</Text>
                      </Pressable>
                      <Pressable onPress={() => setForwardFor(null)}>
                        <Text style={styles.actionAlt}>{t.common.cancel}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxl },
  content: { paddingBottom: spacing.xxl },
  listHeader: { marginBottom: 14 },
  rowWrap: { paddingHorizontal: spacing.xl },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.md + 3,
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.md + 3,
    marginBottom: 9,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  toLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.hint,
  },
  to: { fontFamily: fonts.sans, flexShrink: 1, fontSize: 12.5, color: colors.muted },
  badge: {
    fontFamily: fonts.sansBold,
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.terracotta,
    backgroundColor: 'rgba(232,93,12,0.10)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  date: { fontFamily: fonts.sans, marginLeft: 'auto', fontSize: 11, color: colors.hint },
  subject: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  preview: { fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 3 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  action: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.terracotta },
  actionAlt: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted },
  actionBusy: { opacity: 0.5 },
  account: { fontFamily: fonts.sans, marginLeft: 'auto', fontSize: 11, color: colors.hint, flexShrink: 1 },

  forwardWrap: { marginTop: spacing.md },
  forwardPrompt: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.ink2 },
  forwardInput: {
    fontFamily: fonts.sans,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13.5,
    color: colors.ink,
  },
  forwardBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  primaryBtnText: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.onDark },

  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
  notice: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.terracotta, marginBottom: spacing.sm },
  more: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta, textAlign: 'center', paddingVertical: spacing.md },
});
