import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { apiGet, apiPost } from '@/lib/api';
import { effectivePriority, PRIORITIES, type Rule } from '@/lib/priority';
import { colors, radius, spacing } from '@/lib/theme';

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
  // décoder d'abord (cas HTML échappé), retirer commentaires/style, puis balises
  let t = decode(String(input));
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<[^>]+>/g, ' ');
  return decode(t).replace(/\s{2,}/g, ' ').trim();
}

function senderName(author: string | null): string {
  if (!author) return 'Expéditeur inconnu';
  if (author.includes('<')) return author.split('<')[0].trim().replace(/"/g, '') || author;
  return author.split('@')[0];
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const SELECT = 'id, title, author, preview, url, status, tags, received_at';
const LIMIT = 100;

// Onglets de filtre : Tous + une entrée par catégorie de priorité.
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tous' },
  ...PRIORITIES.map((p) => ({ key: p.key, label: p.label })),
];

export default function Feed() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recherche + filtres
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mailboxes, setMailboxes] = useState<{ email: string; provider: string }[]>([]);
  const [selectedBox, setSelectedBox] = useState('');

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

  // Boîtes connectées (pour le tri par adresse).
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

  // Debounce de la recherche → requête Supabase (titre + expéditeur/adresse).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
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

  // Relève immédiate (ingestion seule) côté serveur, puis rechargement du feed.
  const refreshNow = useCallback(async () => {
    if (refreshingNow) return;
    setRefreshingNow(true);
    try {
      await apiPost('/api/refresh', {});
    } catch {
      // On rechargera quand même : l'ingestion a pu démarrer côté serveur.
    }
    // Laisser le temps à l'ingestion (idempotente), puis recharger le feed.
    setTimeout(async () => {
      await load(debouncedQuery);
      setRefreshingNow(false);
    }, 7000);
  }, [load, debouncedQuery, refreshingNow]);

  const prio = useCallback((it: Item) => effectivePriority(it, rules), [rules]);

  // Compteurs par catégorie (sur les items chargés).
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    PRIORITIES.forEach((p) => (c[p.key] = 0));
    items.forEach((it) => {
      const k = prio(it).key;
      c[k] = (c[k] ?? 0) + 1;
    });
    return c;
  }, [items, prio]);

  const unreadCount = useMemo(() => items.filter((it) => it.status === 'unread').length, [items]);

  const visible = useMemo(() => {
    const boxTag = selectedBox ? `box:${selectedBox.toLowerCase()}` : '';
    return items.filter((it) => {
      if (filter !== 'all' && prio(it).key !== filter) return false;
      if (unreadOnly && it.status !== 'unread') return false;
      if (boxTag && !(it.tags || []).map((t) => (t || '').toLowerCase()).includes(boxTag)) return false;
      return true;
    });
  }, [items, filter, unreadOnly, selectedBox, prio]);

  function renderItem({ item }: { item: Item }) {
    const p = prio(item);
    const unread = item.status === 'unread';
    return (
      <Pressable
        style={styles.row}
        onPress={() => router.push({ pathname: '/email/[id]', params: { id: item.id } })}
      >
        <View style={[styles.accent, { backgroundColor: p.color, opacity: unread ? 1 : 0.4 }]} />
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={[styles.prioLabel, { color: p.color }]}>{p.label.toUpperCase()}</Text>
            <Text style={styles.date}>{formatDate(item.received_at)}</Text>
          </View>
          <Text style={[styles.subject, unread && styles.subjectUnread]} numberOfLines={1}>
            {item.title || '(Sans objet)'}
          </Text>
          <Text style={styles.sender} numberOfLines={1}>
            {senderName(item.author)}
          </Text>
          {item.preview ? (
            <Text style={styles.preview} numberOfLines={1}>
              {cleanText(item.preview)}
            </Text>
          ) : null}
        </View>
      </Pressable>
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
                <Text style={styles.greeting}>Bonjour.</Text>
                <Text style={styles.sub}>
                  {items.length > 0 ? 'Vos emails récents, triés.' : 'Rien à afficher pour le moment.'}
                </Text>
              </View>
              <Pressable
                style={[styles.refreshBtn, refreshingNow && styles.refreshBtnBusy]}
                onPress={refreshNow}
                disabled={refreshingNow}
              >
                {refreshingNow ? <ActivityIndicator size="small" color={colors.terracotta} /> : null}
                <Text style={styles.refreshBtnText}>
                  {refreshingNow ? 'Actualisation…' : '↻ Actualiser'}
                </Text>
              </Pressable>
            </View>

            {/* Recherche */}
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher (titre ou expéditeur)…"
              placeholderTextColor={colors.hint}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          {/* Sélecteur de boîte connectée */}
          {mailboxes.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsList}
              contentContainerStyle={styles.chipsContent}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={[styles.boxChip, selectedBox === '' && styles.boxChipActive]}
                onPress={() => setSelectedBox('')}
              >
                <Text style={[styles.boxChipText, selectedBox === '' && styles.boxChipTextActive]}>
                  ✉ Toutes les boîtes
                </Text>
              </Pressable>
              {mailboxes.map((m) => {
                const active = selectedBox.toLowerCase() === m.email.toLowerCase();
                return (
                  <Pressable
                    key={m.email}
                    style={[styles.boxChip, active && styles.boxChipActive]}
                    onPress={() => setSelectedBox(active ? '' : m.email)}
                  >
                    <Text style={[styles.boxChipText, active && styles.boxChipTextActive]}>
                      {m.email}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Filtres par catégorie + non lus */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsList}
            contentContainerStyle={styles.chipsContent}
            keyboardShouldPersistTaps="handled"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {f.label} {counts[f.key] ?? 0}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.chip, unreadOnly && styles.chipActive]}
              onPress={() => setUnreadOnly((v) => !v)}
            >
              <Text style={[styles.chipText, unreadOnly && styles.chipTextActive]}>
                Non lus {unreadCount}
              </Text>
            </Pressable>
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !error ? (
          <Text style={styles.empty}>
            {debouncedQuery
              ? 'Aucun email ne correspond à cette recherche.'
              : filter !== 'all' || unreadOnly
                ? 'Aucun email dans ce filtre.'
                : 'Les emails apparaîtront ici dès le prochain rapport matinal.'}
          </Text>
        ) : null
      }
      ItemSeparatorComponent={() => <View style={styles.sep} />}
    />
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
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  chipsList: { flexGrow: 0 },
  chipsContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.xs },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  chipTextActive: { color: colors.cream },
  boxChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.terracotta,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  boxChipActive: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  boxChipText: { fontSize: 12, fontWeight: '600', color: colors.terracotta },
  boxChipTextActive: { color: colors.surface },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  empty: {
    textAlign: 'center',
    color: colors.hint,
    fontSize: 14,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    lineHeight: 20,
  },
  row: { flexDirection: 'row', backgroundColor: colors.surface, paddingRight: spacing.lg, paddingVertical: spacing.md },
  accent: { width: 3, borderRadius: 2, marginRight: spacing.md },
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
