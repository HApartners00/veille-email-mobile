import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { apiGet, apiPost } from '@/lib/api';
import { effectivePriority, PRIORITIES, type Rule } from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { colors, radius, spacing } from '@/lib/theme';
import { IconCheck, IconRefresh } from '@/components/icons';
import { EmailRow } from '@/components/email-row';
import { consumePendingFeedFilter } from '@/lib/feed-filter';

type Item = {
  id: string;
  title: string;
  author: string | null;
  preview: string | null;
  url: string | null;
  status: string;
  tags: string[];
  received_at: string;
};

function cleanText(input: string | null): string {
  if (!input) return '';
  const decode = (t: string) =>
    t
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)));
  let t = decode(String(input));
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/\s{2,}/g, ' ').trim();
}

function senderName(author: string | null, unknown: string): string {
  if (!author) return unknown;
  if (author.includes('<')) return author.split('<')[0].trim().replace(/"/g, '') || author;
  return author.split('@')[0];
}

function formatDate(value: string, intl: string): string {
  try {
    return new Date(value).toLocaleString(intl, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Chevron bas vectoriel (pas de glyphe). */
function Caret({ color = colors.muted, size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Coche vectorielle pour les options selectionnees. */
function CheckMark({ color = colors.terracotta, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L20 7" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type SheetOption = { key: string; label: string; count?: number; selected: boolean };

/** Menu deroulant en feuille basse (bottom sheet). */
function FilterSheet({
  visible,
  title,
  options,
  doneLabel,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  doneLabel: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {options.map((o) => (
              <Pressable key={o.key} style={styles.sheetRow} onPress={() => onPick(o.key)}>
                <Text
                  style={[styles.sheetRowText, o.selected && styles.sheetRowTextSel]}
                  numberOfLines={1}
                >
                  {o.label}
                </Text>
                <View style={styles.sheetRight}>
                  {o.count != null ? <Text style={styles.sheetCount}>{o.count}</Text> : null}
                  {o.selected ? <CheckMark /> : null}
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.sheetDone} onPress={onClose}>
            <Text style={styles.sheetDoneText}>{doneLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const SELECT = 'id, title, author, preview, url, status, tags, received_at';
const LIMIT = 100;

export default function Feed() {
  const router = useRouter();
  const { t, intl } = useI18n();

  const FILTERS: { key: string; label: string }[] = [
    { key: 'all', label: t.feed.filterAll },
    ...PRIORITIES.map((p) => ({ key: p.key, label: prioLabel(t, p.key) })),
  ];
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mailboxes, setMailboxes] = useState<{ email: string; provider: string }[]>([]);
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | 'box' | 'type'>(null);

  function toggleBox(email: string) {
    const e = email.toLowerCase();
    setSelectedBoxes((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  const load = useCallback(async (q: string) => {
    setError(null);
    let qb = supabase
      .from('items')
      .select(SELECT)
      .order('received_at', { ascending: false })
      .limit(LIMIT);
    const term = (q || '').trim().replace(/[,%]/g, ' ').trim();
    if (term) {
      qb = qb.or(`title.ilike.%${term}%,author.ilike.%${term}%`);
    }
    const [itemsRes, rulesRes] = await Promise.all([
      qb,
      supabase.from('classification_rules').select('match_type, match_value, category'),
    ]);
    if (itemsRes.error) {
      setError(itemsRes.error.message);
    } else {
      setItems((itemsRes.data ?? []) as Item[]);
      setRules((rulesRes.data ?? []) as Rule[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  // Recharge le feed a chaque retour sur l'onglet (statut lu/non lu a jour
  // apres l'ouverture d'un email).
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingFeedFilter();
      if (pending) setFilter(pending);
      load(debouncedQuery);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery]),
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{ mailboxes: { email: string; provider: string }[] }>(
          '/api/connect/list',
        );
        setMailboxes(r.mailboxes || []);
      } catch {
        // pas bloquant
      }
    })();
  }, []);

  useEffect(() => {
    const tm = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(tm);
  }, [query]);

  useEffect(() => {
    load(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(debouncedQuery);
    setRefreshing(false);
  }, [load, debouncedQuery]);

  const refreshNow = useCallback(async () => {
    if (refreshingNow) return;
    setRefreshingNow(true);
    try {
      await apiPost('/api/refresh', {});
    } catch {
      // On rechargera quand meme.
    }
    setTimeout(async () => {
      await load(debouncedQuery);
      setRefreshingNow(false);
    }, 7000);
  }, [load, debouncedQuery, refreshingNow]);

  const prio = useCallback((it: Item) => effectivePriority(it, rules), [rules]);

  const boxFiltered = useMemo(() => {
    if (selectedBoxes.length === 0) return items;
    const wanted = selectedBoxes.map((b) => `box:${b.toLowerCase()}`);
    return items.filter((it) => {
      const tags = (it.tags || []).map((tg) => (tg || '').toLowerCase());
      return wanted.some((bt) => tags.includes(bt));
    });
  }, [items, selectedBoxes]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: boxFiltered.length };
    PRIORITIES.forEach((p) => (c[p.key] = 0));
    boxFiltered.forEach((it) => {
      const k = prio(it).key;
      c[k] = (c[k] ?? 0) + 1;
    });
    return c;
  }, [boxFiltered, prio]);

  const unreadCount = useMemo(
    () => boxFiltered.filter((it) => it.status === 'unread').length,
    [boxFiltered],
  );

  const visible = useMemo(() => {
    return boxFiltered.filter((it) => {
      if (filter !== 'all' && prio(it).key !== filter) return false;
      if (unreadOnly && it.status !== 'unread') return false;
      return true;
    });
  }, [boxFiltered, filter, unreadOnly, prio]);

  const boxLabel =
    selectedBoxes.length === 0
      ? t.feed.allBoxes
      : selectedBoxes.length === 1
        ? selectedBoxes[0]
        : `${selectedBoxes.length} ${t.feed.byBox.toLowerCase()}`;
  const typeLabel = FILTERS.find((f) => f.key === filter)?.label ?? t.feed.filterAll;

  const boxOptions: SheetOption[] = [
    { key: '__all__', label: t.feed.allBoxes, selected: selectedBoxes.length === 0 },
    ...mailboxes.map((m) => ({
      key: m.email.toLowerCase(),
      label: m.email,
      selected: selectedBoxes.includes(m.email.toLowerCase()),
    })),
  ];
  const typeOptions: SheetOption[] = FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: counts[f.key] ?? 0,
    selected: filter === f.key,
  }));

  function renderItem({ item }: { item: Item }) {
    const p = prio(item);
    return (
      <EmailRow
        subject={item.title || t.common.noSubject}
        sender={senderName(item.author, t.common.unknownSender)}
        prioColor={p.color}
        prioLabel={prioLabel(t, p.key).toUpperCase()}
        date={formatDate(item.received_at, intl)}
        preview={item.preview ? cleanText(item.preview) : null}
        unread={item.status === 'unread'}
        onPress={() => router.push({ pathname: '/email/[id]', params: { id: item.id } })}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.terracotta} />
      </View>
    );
  }

  return (
    <>
      <FilterSheet
        visible={sheet === 'box'}
        title={t.feed.byBox}
        options={boxOptions}
        doneLabel="OK"
        onPick={(key) => (key === '__all__' ? setSelectedBoxes([]) : toggleBox(key))}
        onClose={() => setSheet(null)}
      />
      <FilterSheet
        visible={sheet === 'type'}
        title={t.feed.byType}
        options={typeOptions}
        doneLabel="OK"
        onPick={(key) => {
          setFilter(key);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />

      <FlatList
        style={styles.screen}
        contentContainerStyle={styles.content}
        data={visible}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terracotta} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <View style={styles.headerTexts}>
                  <Text style={styles.greeting}>{t.common.hello}</Text>
                  <Text style={styles.sub}>
                    {items.length > 0 ? t.feed.subSorted : t.feed.subEmpty}
                  </Text>
                </View>
                <Pressable
                  style={[styles.refreshBtn, refreshingNow && styles.refreshBtnBusy]}
                  onPress={refreshNow}
                  disabled={refreshingNow}
                >
                  {refreshingNow ? (
                    <ActivityIndicator size="small" color={colors.terracotta} />
                  ) : (
                    <IconRefresh size={13} color={colors.terracotta} />
                  )}
                  <Text style={styles.refreshBtnText}>
                    {refreshingNow ? t.common.refreshing : t.common.refresh}
                  </Text>
                </Pressable>
              </View>

              <TextInput
                style={styles.search}
                value={query}
                onChangeText={setQuery}
                placeholder={t.feed.searchPlaceholder}
                placeholderTextColor={colors.hint}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />

              {/* Barre de filtres : boites (deroulant) - type (deroulant) - non lus */}
              <View style={styles.filterBar}>
                {mailboxes.length > 1 ? (
                  <Pressable style={styles.fbtn} onPress={() => setSheet('box')}>
                    <Text style={styles.fbtnText} numberOfLines={1}>
                      {boxLabel}
                    </Text>
                    <Caret />
                  </Pressable>
                ) : null}

                <Pressable style={styles.fbtn} onPress={() => setSheet('type')}>
                  <Text style={styles.fbtnText} numberOfLines={1}>
                    {typeLabel}
                  </Text>
                  <Caret />
                </Pressable>

                <Pressable
                  style={[styles.fbtn, styles.fbtnToggle, unreadOnly && styles.fbtnActive]}
                  onPress={() => setUnreadOnly((v) => !v)}
                >
                  <Text style={[styles.fbtnText, unreadOnly && styles.fbtnTextActive]} numberOfLines={1}>
                    {t.feed.unread} {unreadCount}
                  </Text>
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyWrap}>
              <IconCheck size={28} color={colors.sage} />
              <Text style={styles.empty}>
                {debouncedQuery
                  ? t.feed.emptySearch
                  : filter !== 'all' || unreadOnly
                    ? t.feed.emptyFilter
                    : t.feed.emptyDefault}
              </Text>
            </View>
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  content: { paddingBottom: spacing.xxl },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTexts: { flex: 1, paddingRight: spacing.md },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  refreshBtnBusy: { opacity: 0.6 },
  refreshBtnText: { color: colors.terracotta, fontSize: 12, fontWeight: '600' },
  greeting: { fontSize: 30, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginTop: spacing.xs },
  search: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },

  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  fbtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  fbtnText: { fontSize: 13, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  fbtnToggle: { borderColor: colors.cardline },
  fbtnActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  fbtnTextActive: { color: colors.cream },

  backdrop: { flex: 1, backgroundColor: 'rgba(33,30,25,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 3,
    borderTopColor: colors.terracotta,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardline,
    gap: spacing.md,
  },
  sheetRowText: { fontSize: 15, color: colors.ink2, flexShrink: 1 },
  sheetRowTextSel: { color: colors.terracotta, fontWeight: '700' },
  sheetRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetCount: { fontSize: 13, color: colors.hint },
  sheetDone: {
    marginTop: spacing.lg,
    backgroundColor: colors.ink,
    paddingVertical: 13,
    alignItems: 'center',
  },
  sheetDoneText: { color: colors.cream, fontSize: 14, fontWeight: '700' },

  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  emptyWrap: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty: {
    textAlign: 'center',
    color: colors.hint,
    fontSize: 14,
    paddingHorizontal: spacing.xl,
    lineHeight: 20,
  },
  row: { flexDirection: 'row', backgroundColor: colors.surface, paddingRight: spacing.lg, paddingVertical: spacing.md },
  accent: { width: 3, marginRight: spacing.md },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  prioLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  date: { fontSize: 11, color: colors.hint },
  subject: { fontSize: 15, fontWeight: '500', color: colors.ink2 },
  subjectUnread: { color: colors.ink, fontWeight: '700' },
  sender: { fontSize: 12, color: colors.muted, marginTop: 1 },
  preview: { fontSize: 12, color: colors.hint, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.cardline, marginLeft: spacing.lg },
});
