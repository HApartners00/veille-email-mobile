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

import { supabase } from '@/lib/supabase';
import { PRIORITY_BY_KEY } from '@/lib/priority';
import { colors, spacing } from '@/lib/theme';

type RuleRow = {
  id: string;
  match_type: string;
  match_value: string;
  category: string;
};

function typeLabel(t: string): string {
  if (t === 'sender') return 'Expéditeur';
  if (t === 'domain') return 'Domaine';
  if (t === 'keyword') return 'Sujet contient';
  return t;
}

function valueLabel(r: RuleRow): string {
  if (r.match_type === 'domain') return `@${r.match_value}`;
  if (r.match_type === 'keyword') return `« ${r.match_value} »`;
  return r.match_value;
}

export default function RulesScreen() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: e } = await supabase
      .from('classification_rules')
      .select('id, match_type, match_value, category')
      .order('created_at', { ascending: false });
    if (e) setError(e.message);
    else setRules((data ?? []) as RuleRow[]);
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

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prev = rules;
    setRules((r) => r.filter((x) => x.id !== id));
    const { error: e } = await supabase.from('classification_rules').delete().eq('id', id);
    setBusy(false);
    if (e) {
      setRules(prev);
      setError(e.message);
    }
  }

  function renderItem({ item }: { item: RuleRow }) {
    const cat = PRIORITY_BY_KEY[item.category];
    return (
      <View style={styles.row}>
        <View style={styles.rowBody}>
          <Text style={styles.ruleText} numberOfLines={1}>
            <Text style={styles.ruleType}>{typeLabel(item.match_type)} : </Text>
            {valueLabel(item)}
          </Text>
          <Text style={[styles.ruleCat, { color: cat?.color ?? colors.muted }]}>
            → {cat?.label ?? item.category}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={() => remove(item.id)} disabled={busy}>
          <Text style={styles.delete}>Supprimer</Text>
        </Pressable>
      </View>
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
      data={rules}
      keyExtractor={(r) => r.id}
      renderItem={renderItem}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.terracotta} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Règles de classement</Text>
          <Text style={styles.sub}>
            Les emails correspondants sont automatiquement reclassés dans votre feed.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !error ? (
          <Text style={styles.empty}>
            Aucune règle. Depuis un email, choisissez une catégorie puis « Tous les emails de… », « Le
            domaine… » ou un mot-clé pour en créer une.
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
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginTop: spacing.xs, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
  empty: {
    textAlign: 'center',
    color: colors.hint,
    fontSize: 14,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  rowBody: { flex: 1, minWidth: 0 },
  ruleText: { fontSize: 14, color: colors.ink },
  ruleType: { color: colors.muted },
  ruleCat: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  delete: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  sep: { height: 1, backgroundColor: colors.cardline, marginLeft: spacing.xl },
});
