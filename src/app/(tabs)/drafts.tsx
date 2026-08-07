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
import { apiGet, apiPost } from '@/lib/api';
import { bcp47 } from '@/lib/i18n';
import { cleanText, formatDate, recipientsEmails, recipientsLabel } from '@/lib/mail-format';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Onglet « Brouillons » — jumeau mobile de apps/web/src/app/drafts/.
 *
 * LECTURE EN DIRECT chez le fournisseur, via /api/drafts → webhook n8n. Rien
 * n'est stocké côté Vmail : un brouillon supprimé depuis Gmail disparaît ici
 * aussi. Contrepartie assumée : messagerie injoignable = liste vide, et l'écran
 * le DIT au lieu d'afficher « aucun brouillon ».
 */

type Draft = {
  id: string;
  accountEmail: string;
  provider: 'gmail' | 'outlook';
  subject: string | null;
  preview: string | null;
  body: string | null;
  recipients: { name?: string | null; email?: string | null; kind?: string | null }[];
  updatedAt: string | null;
  byVmail: boolean;
  threadId: string | null;
};

function newIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DraftsScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.drafts;

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** Panne de lecture — distincte de « aucun brouillon ». */
  const [failure, setFailure] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    setError(null);
    try {
      const j = await apiGet<{ ok?: boolean; drafts?: Draft[] }>('/api/drafts');
      setDrafts(Array.isArray(j?.drafts) ? j.drafts : []);
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : tx.unreachable);
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [tx.unreachable]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const accounts = useMemo(() => {
    const s = new Set<string>();
    drafts.forEach((d) => d.accountEmail && s.add(d.accountEmail.toLowerCase()));
    return Array.from(s).sort();
  }, [drafts]);

  const toggleBox = useCallback((email: string) => {
    const e = email.toLowerCase();
    setSelectedBoxes((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return drafts.filter((d) => {
      if (selectedBoxes.length > 0 && !selectedBoxes.includes((d.accountEmail || '').toLowerCase()))
        return false;
      if (!term) return true;
      const hay = `${d.subject ?? ''} ${d.preview ?? ''} ${recipientsEmails(d.recipients).join(' ')}`;
      return hay.toLowerCase().includes(term);
    });
  }, [drafts, selectedBoxes, query]);

  async function post(draft: Draft, op: 'send' | 'delete', body?: string) {
    if (busyId) return;
    setBusyId(draft.id);
    setError(null);
    setNotice(null);
    try {
      await apiPost('/api/drafts', {
        op,
        id: draft.id,
        accountEmail: draft.accountEmail,
        provider: draft.provider,
        subject: draft.subject ?? '',
        body: body ?? draft.body ?? '',
        to: recipientsEmails(draft.recipients),
        idempotencyKey: newIdempotencyKey(),
      });
      setNotice(op === 'send' ? tx.sent : tx.deleted);
      setEditingId(null);
      setConfirmDeleteId(null);
      // La vérité est chez le fournisseur : on relit au lieu de retirer la ligne
      // à la main. Si l'opération n'a pas pris, le brouillon réapparaît.
      await reload();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tx.errGeneric);
    } finally {
      setBusyId(null);
    }
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
      refreshLabel={loading ? t.common.refreshing : t.common.refresh}
      onRefresh={() => void reload()}
      refreshing={loading}
      paddingTop={insets.top + spacing.md}
    />
  );

  if (loading && drafts.length === 0 && !failure) {
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
        data={failure ? [] : visible}
        keyExtractor={(d) => d.id}
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
          failure ? (
            <View style={styles.rowWrap}>
              <Text style={styles.failure}>{failure}</Text>
              <Pressable onPress={() => void reload()}>
                <Text style={styles.retry}>{tx.retry}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.rowWrap}>
              <Text style={styles.empty}>{query ? tx.noMatch : tx.empty}</Text>
              {!query ? <Text style={styles.emptyHint}>{tx.emptyHint}</Text> : null}
            </View>
          )
        }
        renderItem={({ item: d }) => {
          const to = recipientsLabel(d.recipients, tx.noRecipient);
          const busy = busyId === d.id;
          const editing = editingId === d.id;
          const bodyEmpty = !(d.body ?? '').trim();
          return (
            <View style={styles.rowWrap}>
              <View style={styles.card}>
                <View style={styles.metaRow}>
                  <Text style={styles.toLabel}>{tx.to}</Text>
                  <Text style={styles.to} numberOfLines={1}>
                    {to}
                  </Text>
                  {d.byVmail ? <Text style={styles.badge}>{tx.byVmail}</Text> : null}
                  {d.updatedAt ? (
                    <Text style={styles.date}>{formatDate(d.updatedAt, intl)}</Text>
                  ) : null}
                </View>

                <Text style={styles.subject} numberOfLines={1}>
                  {d.subject || t.common.noSubject}
                </Text>

                {editing ? (
                  <TextInput
                    style={styles.editor}
                    value={editBody}
                    onChangeText={setEditBody}
                    multiline
                    textAlignVertical="top"
                  />
                ) : cleanText(d.preview) ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {cleanText(d.preview)}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  {editing ? (
                    <>
                      <Pressable
                        style={[styles.primaryBtn, (busy || !editBody.trim()) && styles.actionBusy]}
                        onPress={() => void post(d, 'send', editBody)}
                        disabled={busy || !editBody.trim()}
                      >
                        <Text style={styles.primaryBtnText}>{busy ? tx.sending : tx.send}</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingId(null)}>
                        <Text style={styles.actionAlt}>{t.common.cancel}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => {
                          setEditingId(d.id);
                          setEditBody(d.body ?? '');
                          setError(null);
                        }}
                        disabled={busy}
                      >
                        <Text style={[styles.action, busy && styles.actionBusy]}>{tx.edit}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void post(d, 'send')}
                        disabled={busy || bodyEmpty}
                      >
                        <Text style={[styles.action, (busy || bodyEmpty) && styles.actionBusy]}>
                          {busy ? tx.sending : tx.send}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmDeleteId(confirmDeleteId === d.id ? null : d.id)}
                        disabled={busy}
                      >
                        <Text style={[styles.danger, busy && styles.actionBusy]}>{tx.del}</Text>
                      </Pressable>
                    </>
                  )}
                  {accounts.length > 1 ? (
                    <Text style={styles.account} numberOfLines={1}>
                      {d.accountEmail}
                    </Text>
                  ) : null}
                </View>

                {confirmDeleteId === d.id ? (
                  <View style={styles.confirmWrap}>
                    <Text style={styles.confirmText}>{tx.confirmDelete}</Text>
                    <View style={styles.confirmBtns}>
                      <Pressable
                        style={[styles.dangerBtn, busy && styles.actionBusy]}
                        onPress={() => void post(d, 'delete')}
                        disabled={busy}
                      >
                        <Text style={styles.primaryBtnText}>{busy ? tx.deleting : tx.del}</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteId(null)}>
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
  subject: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink, letterSpacing: -0.2 },
  preview: { fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 3 },
  editor: {
    fontFamily: fonts.sans,
    marginTop: spacing.sm,
    minHeight: 130,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13.5,
    color: colors.ink,
  },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  action: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.terracotta },
  actionAlt: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted },
  danger: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.danger },
  actionBusy: { opacity: 0.5 },
  account: { fontFamily: fonts.sans, marginLeft: 'auto', fontSize: 11, color: colors.hint, flexShrink: 1 },

  primaryBtn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  dangerBtn: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  primaryBtnText: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.onDark },

  confirmWrap: { marginTop: spacing.md },
  confirmText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.ink2 },
  confirmBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },

  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  failure: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.danger, textAlign: 'center', marginTop: spacing.xl },
  retry: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.terracotta, textAlign: 'center', marginTop: spacing.sm },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
  notice: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.terracotta, marginBottom: spacing.sm },
});
