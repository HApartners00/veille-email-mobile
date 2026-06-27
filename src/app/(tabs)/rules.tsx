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

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { PRIORITY_BY_KEY } from '@/lib/priority';
import { prioLabel, type Dict } from '@/lib/i18n';
import { colors, spacing } from '@/lib/theme';
import { IconChevronRight } from '@/components/icons';

type RuleRow = {
  id: string;
  match_type: string;
  match_value: string;
  category: string;
};

function typeLabel(type: string, t: Dict): string {
  if (type === 'sender') return t.rules.typeSender;
  if (type === 'domain') return t.rules.typeDomain;
  if (type === 'keyword') return t.rules.typeKeyword;
  return type;
}

function valueLabel(r: RuleRow): string {
  if (r.match_type === 'domain') return `@${r.match_value}`;
  if (r.match_type === 'keyword') return `« ${r.match_value} »`;
  return r.match_value;
}

export default function RulesScreen() {
  const { t } = useI18n();
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
            <Text style={styles.ruleType}>{typeLabel(item.match_type, t)} : </Text>
            {valueLabel(item)}
          </Text>
          <View style={styles.ruleCatRow}>
            <IconChevronRight size={12} color={cat?.color ?? colors.muted} />
            <Text style={[styles.ruleCat, { color: cat?.color ?? colors.muted }]}>
              {prioLabel(t, item.category)}
            </Text>
          </View>
        </View>
        <Pressable hitSlop={8} onPress={() => remove(item.id)} disabled={busy}>
          <Text style={styles.delete}>{t.rules.delete}</Text>
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
          <Text style={styles.title}>{t.rules.title}</Text>
          <Text style={styles.sub}>{t.rules.sub}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        !error ? <Text style={styles.empty}>{t.rules.empty}</Text> : null
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
  ruleCatRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  ruleCat: { fontSize: 12, fontWeight: '600' },
  delete: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  sep: { height: 1, backgroundColor: colors.cardline, marginLeft: spacing.xl },
});
