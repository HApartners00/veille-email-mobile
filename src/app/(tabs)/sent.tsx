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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** HTML -> texte lisible. Même traitement que l'écran de lecture d'un mail reçu. */

import { MailboxHeader } from '@/components/mailbox-header';
import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
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


function sanitize(q: string): string {
  return (q || '')
    .replace(/[^\p{L}\p{N} _@.\-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


export default function SentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.sent;

  const [items, setItems] = useState<SentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  /**
   * Boîtes CONNECTÉES, lues à la source (mail_accounts via /api/mailboxes) et non
   * déduites des envois présents. Jumeau du web : `apps/web/src/lib/mailboxes.ts`.
   *
   * POURQUOI (08/08/2026) : une boîte connectée SANS aucun envoi disparaissait de
   * la liste, donc le filtre se masquait et la boîte muette devenait invisible.
   * Mesuré sur la boîte Outlook de HA : 141 mails reçus sur 30 jours, 0 envoi.
   */
  const [mailboxes, setMailboxes] = useState<{ email: string; sentCount: number }[]>([]);

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

  // Liste des boîtes : une seule fois au montage, en parallèle des envois. Un
  // échec ne doit rien casser — on retombe sur les boîtes vues dans les données,
  // le filtre est alors moins complet mais ne ment pas.
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const r = await apiGet<{ mailboxes?: { email?: string; sentCount?: number }[] }>(
          '/api/mailboxes',
        );
        if (!vivant) return;
        setMailboxes(
          (r?.mailboxes || [])
            .filter((m) => m && m.email)
            .map((m) => ({
              email: String(m.email).toLowerCase(),
              sentCount: typeof m.sentCount === 'number' ? m.sentCount : -1,
            })),
        );
      } catch (e) {
        // RIEN EN SILENCE, mais pas d'alerte à l'écran : le filtre est un confort,
        // pas le contenu de l'onglet.
        console.warn('[sent] liste des boîtes indisponible', e);
      }
    })();
    return () => {
      vivant = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(debouncedQuery, 0, true);
    setRefreshing(false);
  }, [load, debouncedQuery]);

  // Boîtes affichées = boîtes CONNECTÉES ∪ boîtes vues dans les envois. L'union
  // et pas seulement la liste connectée : une boîte déconnectée plus tard laisse
  // ses envois en base, ils doivent rester filtrables. Même règle que le web.
  const comptesParBoite = useMemo(() => {
    const m = new Map<string, number>();
    mailboxes.forEach((b) => m.set(b.email, b.sentCount));
    items.forEach((it) => {
      const e = (it.account_email || '').toLowerCase();
      if (e && !m.has(e)) m.set(e, -1); // -1 = comptage inconnu, jamais « zéro »
    });
    return m;
  }, [items, mailboxes]);

  const accounts = useMemo(
    () => Array.from(comptesParBoite.keys()).sort((a, b) => a.localeCompare(b)),
    [comptesParBoite],
  );

  // `sentCount` est un compte EXACT venu du serveur, pas le nombre de lignes
  // chargées : un « 0 » veut dire zéro envoi, jamais « absente de la 1re page ».
  const emptyBoxes = useMemo(
    () => accounts.filter((e) => comptesParBoite.get(e) === 0),
    [accounts, comptesParBoite],
  );

  const boiteVideSelectionnee =
    selectedBoxes.length === 1 && emptyBoxes.includes(selectedBoxes[0] as string);

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

  const header = (
    <MailboxHeader
      title={tx.title}
      subtitle={tx.subtitle}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={tx.searchPlaceholder}
      accounts={accounts}
      emptyBoxes={emptyBoxes}
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
          </View>
        }
        ListEmptyComponent={
          <View style={styles.rowWrap}>
            <Text style={styles.empty}>
              {debouncedQuery ? tx.noMatch : boiteVideSelectionnee ? tx.emptyBox : tx.empty}
            </Text>
            {!debouncedQuery && !boiteVideSelectionnee ? (
              <Text style={styles.emptyHint}>{tx.emptyHint}</Text>
            ) : null}
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
          return (
            <View style={styles.rowWrap}>
              {/* ⚠️ LA CARTE OUVRE UNE PAGE, elle ne se deplie plus sur place, et
                  elle ne porte plus « Renvoyer » ni « Transferer » — HA, 13/08 :
                  « qd ds envoyés on puisse vrmt cliquer sur un mail et qu'il
                  s'ouvre vraiment ». Ces deux boutons FONT PARTIR UN MAIL : les
                  laisser sur chaque carte d'une liste dense etait la meme faute
                  que celle corrigee le 08/08 pour Archiver et Corbeille. */}
              <Pressable
                style={styles.card}
                onPress={() => router.push({ pathname: '/envoi/[id]', params: { id: item.id } })}
                accessibilityRole="button"
                accessibilityLabel={item.subject || t.common.noSubject}
              >
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

                {accounts.length > 1 ? (
                  <Text style={styles.account} numberOfLines={1}>
                    {item.account_email}
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
  subject: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  preview: { fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 3 },
  // 52 px, comme l'écran d'un mail reçu, pour le nouveau cadre à 32 %.

  account: { fontFamily: fonts.sans, marginLeft: 'auto', fontSize: 11, color: colors.hint, flexShrink: 1 },


  // ⚠️ SUR FOND SOMBRE : `muted` y serait a 2,83:1 depuis le correctif du 12/08.
  // Le fond de page etant sombre, ce libelle prend le jeton prevu pour lui.
  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.onDarkMuted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
  more: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta, textAlign: 'center', paddingVertical: spacing.md },
});
