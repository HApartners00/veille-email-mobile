import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import { effectivePriority, type Rule } from '@/lib/priority';
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

export default function Feed() {
  const router = useRouter();
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
        .limit(50),
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
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

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
      await load();
      setRefreshingNow(false);
    }, 7000);
  }, [load, refreshingNow]);

  function renderItem({ item }: { item: Item }) {
    const p = effectivePriority(item, rules);
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
      data={items}
      keyExtractor={(it) => it.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terracotta} />}
      ListHeaderComponent={
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !error ? (
          <Text style={styles.empty}>
            Les emails apparaîtront ici dès le prochain rapport matinal.
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
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTexts: { flex: 1, paddingRight: spacing.md },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.terracotta,
    borderRadius: radius.pill ?? 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  refreshBtnBusy: { opacity: 0.6 },
  refreshBtnText: { color: colors.terracotta, fontSize: 12, fontWeight: '600' },
  greeting: { fontSize: 30, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginTop: spacing.xs },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  empty: { textAlign: 'center', color: colors.hint, fontSize: 14, paddingHorizontal: spacing.xl, marginTop: spacing.xl },
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
