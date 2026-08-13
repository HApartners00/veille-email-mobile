import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MailboxHeader } from '@/components/mailbox-header';
import { memoriserBrouillons, type Brouillon } from '@/lib/cache-brouillons';
import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
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


export default function DraftsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.drafts;

  const [drafts, setDrafts] = useState<Brouillon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** Panne de lecture — distincte de « aucun brouillon ». */
  const [failure, setFailure] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    setError(null);
    try {
      const j = await apiGet<{ ok?: boolean; drafts?: Brouillon[] }>('/api/drafts');
      const liste = Array.isArray(j?.drafts) ? j.drafts : [];
      setDrafts(liste);
      // La page /brouillon/[id] y puise sans repayer 1,5 a 2,5 s de reseau.
      memoriserBrouillons(liste);
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
          return (
            <View style={styles.rowWrap}>
              {/* ⚠️ LA CARTE OUVRE UNE PAGE — HA, 13/08 : « meme logique pour les
                  brouillons ». Modifier, Envoyer et Supprimer ne sont plus ici :
                  « Envoyer » fait partir un vrai mail et « Supprimer » efface
                  DEFINITIVEMENT chez le fournisseur. Deux gestes irrattrapables
                  qui n'ont rien a faire sur chaque carte d'une liste dense. */}
              <Pressable
                style={styles.card}
                onPress={() => router.push({ pathname: '/brouillon/[id]', params: { id: d.id } })}
                accessibilityRole="button"
                accessibilityLabel={d.subject || t.common.noSubject}
              >
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

                {cleanText(d.preview) ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {cleanText(d.preview)}
                  </Text>
                ) : null}

                {accounts.length > 1 ? (
                  <Text style={styles.account} numberOfLines={1}>
                    {d.accountEmail}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.fond },
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

  account: { fontFamily: fonts.sans, marginLeft: 'auto', fontSize: 11, color: colors.hint, flexShrink: 1 },



  // ⚠️ SUR FOND SOMBRE : `muted` y serait a 2,83:1 depuis le correctif du 12/08.
  // Le fond de page etant sombre, ce libelle prend le jeton prevu pour lui.
  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.onDarkMuted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  failure: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.danger, textAlign: 'center', marginTop: spacing.xl },
  retry: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.terracotta, textAlign: 'center', marginTop: spacing.sm },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
});
