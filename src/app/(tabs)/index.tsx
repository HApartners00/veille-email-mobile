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
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { apiGet, apiPost } from '@/lib/api';
import { cleanText, formatDate, senderName } from '@/lib/mail-format';
import { effectivePriority, PRIORITIES, type Rule } from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconCheck, IconInbox, IconRefresh, IconSearch } from '@/components/icons';
import { EmailRow } from '@/components/email-row';
import { LogoVmail } from '@/components/logo-v';
import { consumePendingFeedFilter } from '@/lib/feed-filter';
// Caret / CheckMark / FilterSheet vivaient ici ; extraits le 09/08 pour etre
// partages avec Envoyes et Brouillons. Une seule implementation, trois appelants.
import { Caret, FilterSheet, type SheetOption } from '@/components/filter-sheet';
import { marqueurDe, TAG_ARCHIVE, TAG_PUB, TAG_SPAM, TAG_TRASH } from '@/lib/mail-state';

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




const SELECT = 'id, title, author, preview, url, status, tags, received_at';
const PAGE = 100;

// Libellé « Charger plus » local (le dictionnaire i18n partagé n'expose pas
// encore cette clé ; on reste sur le même patron que app/attachments.tsx).
const LOAD_MORE_LABEL: Record<string, string> = {
  fr: 'Charger plus',
  en: 'Load more',
  es: 'Cargar más',
  de: 'Mehr laden',
  pt: 'Carregar mais',
  it: 'Carica altro',
  ar: 'تحميل المزيد',
  ru: 'Загрузить ещё',
};
function loadMoreLabel(locale: string): string {
  return LOAD_MORE_LABEL[locale] ?? LOAD_MORE_LABEL.en;
}

/** Assainit le terme de recherche pour l'injecter sans risque dans un `.or()` PostgREST. */
function sanitizeTerm(q: string): string {
  return (q || '')
    .replace(/[^\p{L}\p{N} _@.\-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default function Feed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, intl, locale } = useI18n();

  const FILTERS: { key: string; label: string }[] = [
    { key: 'all', label: t.feed.filterAll },
    ...PRIORITIES.map((p) => ({ key: p.key, label: prioLabel(t, p.key) })),
  ];
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mailboxes, setMailboxes] = useState<{ email: string; provider: string }[]>([]);
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | 'box' | 'type' | 'dossier'>(null);
  /**
   * DOSSIER AFFICHE (09/08/2026). `null` = boite de reception ; sinon le marqueur
   * (`archive` ou `corbeille`).
   *
   * POURQUOI PAS UN ONGLET EN BAS, comme sur le web a gauche : la barre du bas ne
   * peut pas porter 7 entrees. Mesure deja payee sur ce projet — a 5 onglets et
   * 11 pt, « Отправленные » (ru) et « Gesendet » (de) debordaient, il a fallu
   * descendre a 9,5 pt (cf. le commentaire de _layout.tsx). A 7 entrees on serait a
   * ~50 px par onglet. Le selecteur de dossier vit donc DANS l'onglet Emails, ce qui
   * suit aussi le geste naturel : on cherche un mail archive depuis ses mails.
   */
  const [dossier, setDossier] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  function toggleBox(email: string) {
    const e = email.toLowerCase();
    setSelectedBoxes((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  const load = useCallback(async (q: string) => {
    setError(null);
    try {
      let qb = supabase
        .from('items')
        .select(SELECT)
        .order('received_at', { ascending: false })
        .range(0, PAGE - 1);
      const term = sanitizeTerm(q);
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
        const rows = (itemsRes.data ?? []) as Item[];
        setItems(rows);
        setHasMore(rows.length === PAGE);
        setRules((rulesRes.data ?? []) as Rule[]);
      }
    } catch (e) {
      // Ex. hors-ligne : la requête réseau lève -> on évite le spinner infini.
      setError((e as Error)?.message || 'Chargement impossible.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Pagination : charge la page suivante et l'ajoute à la liste courante.
  // Le filtrage boîte/type est client -> on ré-applique après ajout.
  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    try {
      let qb = supabase
        .from('items')
        .select(SELECT)
        .order('received_at', { ascending: false })
        .range(items.length, items.length + PAGE - 1);
      const term = sanitizeTerm(debouncedQuery);
      if (term) {
        qb = qb.or(`title.ilike.%${term}%,author.ilike.%${term}%`);
      }
      const { data, error: qErr } = await qb;
      if (qErr) {
        setError(qErr.message);
      } else {
        const rows = (data ?? []) as Item[];
        setItems((prev) => {
          const seen = new Set(prev.map((it) => it.id));
          return [...prev, ...rows.filter((it) => !seen.has(it.id))];
        });
        setHasMore(rows.length === PAGE);
      }
    } catch (e) {
      setError((e as Error)?.message || 'Chargement impossible.');
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, loading, hasMore, items.length, debouncedQuery]);

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
    // Exclure les emails de rapport Vmail eux-mêmes (ré-ingérés depuis la boîte).
    const src = items.filter(
    // LE TIRET SIMPLE A ETE RETIRE (09/08/2026) : l'app s'appelle « Vmail - Email IA »,
    // donc les mails d'App Store Connect etaient pris pour des rapports et caches.
    // Mesure : 86 sujets captures en base, 80 le restent, les 6 liberes sont tous des
    // mails TestFlight. Les vrais rapports utilisent le cadratin.
      (it) => !/^\s*vmail\s*[—–]/i.test((it.title || '').toLowerCase()),
    );
    if (selectedBoxes.length === 0) return src;
    const wanted = selectedBoxes.map((b) => `box:${b.toLowerCase()}`);
    return src.filter((it) => {
      const tags = (it.tags || []).map((tg) => (tg || '').toLowerCase());
      return wanted.some((bt) => tags.includes(bt));
    });
  }, [items, selectedBoxes]);

  // Le contenu du dossier courant : dans la boite de reception, tout ce qui ne porte
  // AUCUN marqueur ; dans un dossier, tout ce qui porte CE marqueur-la.
  // Jumeau exact de `fluxPrincipal` cote web (feed-list.tsx).
  const flux = useMemo(
    () => boxFiltered.filter((it) => marqueurDe(it.tags) === dossier),
    [boxFiltered, dossier],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: flux.length, [TAG_PUB]: 0, [TAG_SPAM]: 0 };
    PRIORITIES.forEach((p) => (c[p.key] = 0));
    flux.forEach((it) => {
      const k = prio(it).key;
      c[k] = (c[k] ?? 0) + 1;
    });
    // Les mis de cote se comptent sur TOUT le lot, pas sur le dossier courant.
    boxFiltered.forEach((it) => {
      const m = marqueurDe(it.tags);
      if (m === TAG_PUB || m === TAG_SPAM) c[m] = (c[m] ?? 0) + 1;
    });
    return c;
  }, [boxFiltered, flux, prio]);

  const unreadCount = useMemo(
    () => flux.filter((it) => it.status === 'unread').length,
    [flux],
  );

  // Les puces « Publicites » et « Indesirables » ne filtrent pas le dossier courant :
  // elles EN CHANGENT (ce sont des mis de cote, pas des categories). D'ou ce test.
  const filtreEstMarqueur = filter === TAG_PUB || filter === TAG_SPAM;

  const visible = useMemo(() => {
    const src = filtreEstMarqueur
      ? boxFiltered.filter((it) => marqueurDe(it.tags) === filter)
      : flux;
    return src.filter((it) => {
      if (!filtreEstMarqueur && filter !== 'all' && prio(it).key !== filter) return false;
      if (unreadOnly && it.status !== 'unread') return false;
      return true;
    });
  }, [boxFiltered, flux, filter, filtreEstMarqueur, unreadOnly, prio]);

  // Adresses proposees au filtre = boites connectees (Account Store) UNION les
  // boites presentes dans les items charges (tags `box:`). Sans cette union, un
  // echec de /api/connect/list masquait completement le filtre. Aligne sur le web.
  const boxAddresses = useMemo(() => {
    const set = new Set<string>(mailboxes.map((m) => (m.email || '').toLowerCase()).filter(Boolean));
    items.forEach((it) => {
      (it.tags || []).forEach((tg) => {
        const x = (tg || '').toLowerCase();
        if (x.startsWith('box:')) set.add(x.slice(4));
      });
    });
    return Array.from(set).sort();
  }, [mailboxes, items]);

  // Elague les boites cochees qui ne sont plus proposees (ex. recherche).
  useEffect(() => {
    setSelectedBoxes((prev) => {
      const kept = prev.filter((b) => boxAddresses.includes(b));
      return kept.length === prev.length ? prev : kept;
    });
  }, [boxAddresses]);

  // Marque comme lus tous les emails non lus actuellement visibles.
  const unreadVisibleIds = visible.filter((it) => it.status === 'unread').map((it) => it.id);

  async function markAllRead() {
    if (unreadVisibleIds.length === 0 || markingRead) return;
    setMarkingRead(true);
    const ids = unreadVisibleIds;
    const before = items;
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, status: 'read' } : it)));
    const { error: updErr } = await supabase
      .from('items')
      .update({ status: 'read', read_at: new Date().toISOString() } as never)
      .in('id', ids);
    setMarkingRead(false);
    if (updErr) setItems(before); // rollback : l'affichage ne doit pas mentir
  }

  const boxLabel =
    selectedBoxes.length === 0
      ? t.feed.allBoxes
      : selectedBoxes.length === 1
        ? selectedBoxes[0]
        : `${selectedBoxes.length} ${t.feed.byBox.toLowerCase()}`;
  const typeLabel = FILTERS.find((f) => f.key === filter)?.label ?? t.feed.filterAll;

  const boxOptions: SheetOption[] = [
    { key: '__all__', label: t.feed.allBoxes, selected: selectedBoxes.length === 0 },
    ...boxAddresses.map((addr) => ({
      key: addr,
      label: addr,
      selected: selectedBoxes.includes(addr),
    })),
  ];
  // Les trois dossiers. Ordre aligne sur la barre de gauche du web :
  // boite de reception, archives, supprimes.
  const DOSSIERS: { key: string; valeur: string | null; label: string }[] = [
    { key: '__inbox__', valeur: null, label: t.feed.folderInbox },
    { key: TAG_ARCHIVE, valeur: TAG_ARCHIVE, label: t.feed.folderArchived },
    { key: TAG_TRASH, valeur: TAG_TRASH, label: t.feed.folderDeleted },
  ];
  const dossierLabel = DOSSIERS.find((d) => d.valeur === dossier)?.label ?? t.feed.folderInbox;
  const dossierOptions: SheetOption[] = DOSSIERS.map((d) => ({
    key: d.key,
    label: d.label,
    selected: d.valeur === dossier,
  }));

  // La puce « Publicites » designe les onglets Gmail : elle n'a pas de sens sans
  // boite Gmail connectee (le lancement se fait sur Outlook seul). Meme regle que le
  // web, ou le defaut est `false` pour cacher plutot que montrer a tort.
  const aUneBoiteGmail = mailboxes.some((m) => (m.provider || '').toLowerCase() === 'gmail');

  const typeOptions: SheetOption[] = FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: counts[f.key] ?? 0,
    // Compteurs calculés sur les items chargés : indique s'il reste des pages.
    partial: hasMore,
    selected: filter === f.key,
  }));

  function renderItem({ item }: { item: Item }) {
    const p = prio(item);
    return (
      <View style={styles.rowWrap}>
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
    <>
      <FilterSheet
        visible={sheet === 'dossier'}
        title={t.feed.folderInbox}
        options={dossierOptions}
        doneLabel="OK"
        onPick={(key) => {
          const d = DOSSIERS.find((x) => x.key === key);
          setDossier(d ? d.valeur : null);
          // On repart de « Tous » : garder « Urgent » en entrant dans la corbeille
          // afficherait une liste vide sans dire pourquoi.
          setFilter('all');
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />

      <FilterSheet
        visible={sheet === 'box'}
        title={t.feed.byBox}
        options={boxOptions}
        doneLabel="OK"
        onPick={(key) => (key === '__all__' ? setSelectedBoxes([]) : toggleBox(key))}
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
          <View style={styles.listHeader}>
            <View style={[styles.top, { paddingTop: insets.top + spacing.md }]}>
              <View style={styles.topRow}>
                <LogoVmail size={23} />
                {/* `topRow` est en space-between : les deux actions sont regroupees
                    a droite, sinon le bouton du milieu flotterait tout seul. */}
                <View style={styles.topActions}>
                  {/* Pieces jointes : un bouton, pas un onglet. C'est une RECHERCHE
                      qu'on lance avec une question en tete, pas un dossier qu'on
                      ouvre pour voir. Meme decision que sur le web (09/08/2026). */}
                  <Pressable
                    style={styles.pjBtn}
                    onPress={() => router.push('/attachments')}
                    hitSlop={6}
                  >
                    <Text style={styles.pjBtnText}>{t.feed.attachments}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.refreshBtn, refreshingNow && styles.refreshBtnBusy]}
                    onPress={refreshNow}
                    disabled={refreshingNow}
                  >
                    {refreshingNow ? (
                      <ActivityIndicator size="small" color={colors.terracottaLight} />
                    ) : (
                      <IconRefresh size={13} color={colors.terracottaLight} />
                    )}
                    <Text style={styles.refreshBtnText}>
                      {refreshingNow ? t.common.refreshing : t.common.refresh}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.title}>{dossier ? dossierLabel : t.tabs.feed}</Text>

              {/* Selecteur de dossier — toujours visible : c'est le seul chemin vers
                  les archives et la corbeille sur mobile. */}
              <View style={styles.chipsRow}>
                <Pressable style={[styles.chip, styles.chipBox]} onPress={() => setSheet('dossier')}>
                  <Text style={[styles.chipText, styles.chipTextBox]} numberOfLines={1}>
                    {dossierLabel}
                  </Text>
                  <Caret color={colors.onDark} size={13} />
                </Pressable>
                {dossier === TAG_TRASH ? (
                  <Text style={styles.trashNote}>{t.feed.trashNote}</Text>
                ) : null}
              </View>

              {/* Recherche */}
              <View style={styles.searchWrap}>
                <IconSearch size={16} color={colors.onDarkMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t.feed.searchPlaceholder}
                  placeholderTextColor={colors.onDarkMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
              </View>

              {/* Filtre par boîte (déroulant) */}
              {boxAddresses.length > 1 ? (
                <View style={styles.chipsRow}>
                  <Pressable style={[styles.chip, styles.chipBox]} onPress={() => setSheet('box')}>
                    <IconInbox size={14} color={colors.onDark} />
                    <Text style={[styles.chipText, styles.chipTextBox]} numberOfLines={1}>
                      {boxLabel}
                    </Text>
                    <Caret color={colors.onDark} size={13} />
                  </Pressable>
                </View>
              ) : null}

              {/* Filtres de type (chips) */}
              <View style={styles.chipsRow}>
                <Pressable
                  style={[styles.chip, filter === 'all' && styles.chipOn]}
                  onPress={() => setFilter('all')}
                >
                  <Text style={[styles.chipText, filter === 'all' && styles.chipTextOn]}>
                    {t.feed.filterAll}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.chip, unreadOnly && styles.chipOn]}
                  onPress={() => setUnreadOnly((v) => !v)}
                >
                  <Text style={[styles.chipText, unreadOnly && styles.chipTextOn]}>
                    {t.feed.unread} {unreadCount}
                    {hasMore ? '+' : ''}
                  </Text>
                </Pressable>

                {PRIORITIES.map((p) => (
                  <Pressable
                    key={p.key}
                    style={[styles.chip, filter === p.key && styles.chipOn]}
                    onPress={() => setFilter(filter === p.key ? 'all' : p.key)}
                  >
                    <Text style={[styles.chipText, filter === p.key && styles.chipTextOn]}>
                      {prioLabel(t, p.key)}
                    </Text>
                  </Pressable>
                ))}

                {/* Mis de cote : affiches seulement s'ils contiennent quelque chose,
                    et seulement depuis la boite de reception — cliquer « Publicites »
                    depuis la corbeille ne voudrait rien dire. Ordre et conditions
                    identiques au web. */}
                {!dossier && aUneBoiteGmail && counts[TAG_PUB] ? (
                  <Pressable
                    style={[styles.chip, filter === TAG_PUB && styles.chipOn]}
                    onPress={() => setFilter(filter === TAG_PUB ? 'all' : TAG_PUB)}
                  >
                    <Text style={[styles.chipText, filter === TAG_PUB && styles.chipTextOn]}>
                      {t.feed.filterPub}
                    </Text>
                  </Pressable>
                ) : null}
                {!dossier && counts[TAG_SPAM] ? (
                  <Pressable
                    style={[styles.chip, filter === TAG_SPAM && styles.chipOn]}
                    onPress={() => setFilter(filter === TAG_SPAM ? 'all' : TAG_SPAM)}
                  >
                    <Text style={[styles.chipText, filter === TAG_SPAM && styles.chipTextOn]}>
                      {t.feed.filterSpam}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Action groupee « tout marquer comme lu » — existait sur le web
                  uniquement. Porte ici pour aligner les deux plateformes. */}
              {unreadVisibleIds.length > 0 ? (
                <Pressable
                  style={styles.markAllBtn}
                  onPress={() => void markAllRead()}
                  disabled={markingRead}
                  hitSlop={8}
                >
                  <Text style={[styles.markAllText, markingRead && styles.markAllTextBusy]}>
                    {t.feed.markAllRead} ({unreadVisibleIds.length})
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasMore && !loadingMore && !loading) void loadMore();
        }}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyWrap}>
              <IconCheck size={28} color={colors.sage} />
              <Text style={styles.empty}>
                {debouncedQuery
                  ? t.feed.emptySearch
                  : dossier
                    ? t.feed.emptyFolder
                    : filter !== 'all' || unreadOnly
                      ? t.feed.emptyFilter
                      : t.feed.emptyDefault}
              </Text>
              {hasMore ? (
                <Pressable
                  style={styles.loadMoreBtn}
                  onPress={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.terracotta} />
                  ) : (
                    <Text style={styles.loadMoreText}>{loadMoreLabel(locale)}</Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListFooterComponent={
          hasMore && visible.length > 0 ? (
            <Pressable
              style={styles.loadMoreBtn}
              onPress={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.terracotta} />
              ) : (
                <Text style={styles.loadMoreText}>{loadMoreLabel(locale)}</Text>
              )}
            </Pressable>
          ) : null
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.fond },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fond },
  content: { paddingBottom: spacing.xxl },
  markAllBtn: { alignSelf: 'flex-start', marginTop: spacing.sm },
  markAllText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.terracottaLight },
  markAllTextBusy: { opacity: 0.5 },
  rowWrap: { paddingHorizontal: spacing.xl },
  // Respiration entre le bandeau charbon et la premiere carte : sans elle, la liste
  // demarrait au ras du bandeau (l'ecran Accueil, lui, a ses intitules de section).
  listHeader: { marginBottom: 14 },

  // Bandeau charbon
  top: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(240,151,90,0.5)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  refreshBtnBusy: { opacity: 0.6 },
  refreshBtnText: { fontFamily: fonts.sansSemibold, color: colors.terracottaLight, fontSize: 12 },
  title: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 33,
    color: colors.onDark,
    letterSpacing: -0.8,
    marginTop: spacing.md + 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: spacing.lg,
    backgroundColor: 'rgba(250,247,240,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(250,247,240,0.18)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 1,
    paddingVertical: 4,
  },
  searchInput: {
    fontFamily: fonts.sans,
    flex: 1,
    fontSize: 14,
    letterSpacing: 0,
    color: colors.onDark,
    paddingVertical: 8,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pjBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.charline,
  },
  pjBtnText: { fontFamily: fonts.sansSemibold, fontSize: 11.5, color: colors.onDarkMuted },
  trashNote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    alignSelf: 'center',
    marginLeft: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: 'rgba(250,247,240,0.20)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipOn: { backgroundColor: '#f0975a', borderColor: '#f0975a' },
  chipBox: { borderColor: 'rgba(250,247,240,0.28)' },
  chipText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.onDarkMuted, flexShrink: 1 },
  chipTextOn: { color: colors.charcoal },
  chipTextBox: { color: colors.onDark },


  error: { fontFamily: fonts.sans, color: colors.danger, fontSize: 13, marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  loadMoreText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta },
  emptyWrap: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  empty: {
    fontFamily: fonts.sans,
    textAlign: 'center',
    color: colors.hint,
    fontSize: 14,
    paddingHorizontal: spacing.xl,
    lineHeight: 20,
  },
  row: { flexDirection: 'row', backgroundColor: colors.surface, paddingEnd: spacing.lg, paddingVertical: spacing.md },
  accent: { width: 3, marginEnd: spacing.md },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  prioLabel: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1 },
  date: { fontFamily: fonts.sans, fontSize: 11, color: colors.hint },
  subject: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink2 },
  subjectUnread: { fontFamily: fonts.sansBold, color: colors.ink },
  sender: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 1 },
  preview: { fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.cardline, marginStart: spacing.lg },
});
