import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import { effectivePriority, PRIORITIES, type Rule } from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { colors, radius, spacing } from '@/lib/theme';
import { IconRefresh } from '@/components/icons';
import { LogoV } from '@/components/logo-v';
import { EmailRow } from '@/components/email-row';
import { setPendingFeedFilter } from '@/lib/feed-filter';

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

function senderName(author: string | null, unknown: string): string {
  if (!author) return unknown;
  if (author.includes('<')) return author.split('<')[0].trim().replace(/"/g, '') || author;
  return author.split('@')[0];
}

function todayLabel(intl: string): string {
  const s = new Date().toLocaleDateString(intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Accueil() {
  const router = useRouter();
  const { t, f, intl } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [itemsRes, rulesRes] = await Promise.all([
      supabase
        .from('items')
        .select('id, title, author, preview, url, status, tags, received_at')
        .order('received_at', { ascending: false })
        .limit(80),
      supabase.from('classification_rules').select('match_type, match_value, category'),
    ]);
    if (itemsRes.error) setError(itemsRes.error.message);
    else {
      setItems((itemsRes.data ?? []) as Item[]);
      setRules((rulesRes.data ?? []) as Rule[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Recharger en revenant sur l'onglet (après une relève / lecture).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const refreshNow = useCallback(async () => {
    if (refreshingNow) return;
    setRefreshingNow(true);
    try {
      await apiPost('/api/refresh', {});
    } catch {
      // on rechargera quand même
    }
    setTimeout(async () => {
      await load();
      setRefreshingNow(false);
    }, 7000);
  }, [load, refreshingNow]);

  const prio = useCallback((it: Item) => effectivePriority(it, rules), [rules]);

  // Mails « du jour » (reçus aujourd'hui) ; à défaut, on montre les plus récents.
  const base = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const today = items.filter((it) => {
      const t = new Date(it.received_at).getTime();
      return !Number.isNaN(t) && t >= startMs;
    });
    return { list: today.length ? today : items, isToday: today.length > 0 };
  }, [items]);

  const groups = useMemo(() => {
    const g: Record<string, Item[]> = { urgent: [], important: [], human: [], info: [] };
    base.list.forEach((it) => {
      const k = prio(it).key;
      (g[k] ?? g.info).push(it);
    });
    return g;
  }, [base, prio]);

  const total = base.list.length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.terracotta} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terracotta} />
      }
    >
      <View style={styles.headerTop}>
        <View style={styles.headerLeft}>
          <LogoV size={42} />
          <View style={styles.headerTexts}>
            <Text style={styles.date}>{todayLabel(intl)}</Text>
            <Text style={styles.greeting}>{t.common.hello}</Text>
          </View>
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

      <Text style={styles.sub}>
        {total === 0
          ? t.home.boxUpToDate
          : base.isToday
            ? f(total === 1 ? t.home.todayOne : t.home.todayMany, { n: total })
            : f(t.home.recentFallback, { n: total })}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Compteurs */}
      {total > 0 ? (
        <View style={styles.stats}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p.key}
              style={styles.statCard}
              onPress={() => {
                setPendingFeedFilter(p.key);
                router.navigate('/(tabs)');
              }}
            >
              <View style={[styles.statTop, { backgroundColor: p.color }]} />
              <Text style={[styles.statNum, { color: p.color }]}>{groups[p.key]?.length ?? 0}</Text>
              <Text style={styles.statLabel}>{prioLabel(t, p.key)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Sections par priorité */}
      {PRIORITIES.map((p) => {
        const list = groups[p.key] ?? [];
        if (list.length === 0) return null;
        return (
          <View key={p.key} style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={[styles.dot, { backgroundColor: p.color }]} />
              <Text style={[styles.sectionTitle, { color: p.color }]}>
                {prioLabel(t, p.key)} · {list.length}
              </Text>
            </View>
            {list.map((it) => (
              <EmailRow
                key={it.id}
                subject={it.title || t.common.noSubject}
                sender={senderName(it.author, t.common.unknownSender)}
                prioColor={p.color}
                unread={it.status === 'unread'}
                onPress={() => router.push({ pathname: '/email/[id]', params: { id: it.id } })}
              />
            ))}
          </View>
        );
      })}

      {total === 0 ? (
        <View style={styles.allClear}>
          <Text style={styles.allClearTitle}>{t.home.allClearTitle}</Text>
          <Text style={styles.allClearSub}>{t.home.allClearSub}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, paddingRight: spacing.md },
  headerTexts: { flex: 1 },
  date: { fontSize: 12, color: colors.muted, textTransform: 'capitalize' },
  greeting: { fontSize: 30, fontWeight: '700', color: colors.ink, marginTop: 2 },
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
  sub: { fontSize: 14, color: colors.muted, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingBottom: spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
  },
  statTop: { alignSelf: 'stretch', height: 3 },
  statNum: { fontSize: 22, fontWeight: '700', marginTop: spacing.md },
  statLabel: { fontSize: 10, color: colors.muted, marginTop: 2, textAlign: 'center' },
  section: { marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  rowSubject: { fontSize: 15, fontWeight: '500', color: colors.ink2 },
  rowSubjectUnread: { color: colors.ink, fontWeight: '700' },
  rowSender: { fontSize: 12, color: colors.muted, marginTop: 2 },
  allClear: { marginTop: spacing.xxl, alignItems: 'center' },
  allClearTitle: { fontSize: 18, fontWeight: '700', color: colors.sage },
  allClearSub: {
    fontSize: 14,
    color: colors.hint,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
});
