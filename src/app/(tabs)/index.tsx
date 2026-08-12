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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { apiGet, apiPost } from '@/lib/api';
import { cleanText, formatDate, senderName } from '@/lib/mail-format';
import { effectivePriority, PRIORITIES, PRIORITY_KEYS, type Rule } from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconCheck, IconMore, IconSearch } from '@/components/icons';
import { EmailRow } from '@/components/email-row';
import { LogoVmail } from '@/components/logo-v';
import { consumePendingFeedFilter } from '@/lib/feed-filter';
// Caret / CheckMark / FilterSheet vivaient ici ; extraits le 09/08 pour etre
// partages avec Envoyes et Brouillons. Une seule implementation, trois appelants.
import { FilterSheet, type SheetOption, type SheetSection } from '@/components/filter-sheet';
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

/**
 * PERSISTANCE DES FILTRES (12/08/2026). Cle versionnee : le jour ou la forme
 * stockee changera, il suffira de passer a `.v2` — une valeur d'une ancienne
 * version ne sera pas lue, et l'app repartira sur « Tous » au lieu de tomber
 * sur une forme qu'elle ne sait plus interpreter.
 */
const CLE_FILTRES = 'vmail.feed.filtres.v1';

type FiltresStockes = { filtres?: unknown; nonLus?: unknown };

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

/** Cles du menu ⋯ qui ne designent ni un dossier ni une boite. */
const CLE_TOUTES_BOITES = '__all__';
const CLE_BOITE_RECEPTION = '__inbox__';
const CLE_ACTUALISER = '__refresh__';
const CLE_TOUT_LIRE = '__markread__';

export default function Feed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, intl, locale } = useI18n();

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
  /**
   * RECHERCHE REPLIABLE (12/08/2026) : masquee au repos, ouverte en tapant la
   * loupe. Refermer VIDE le terme — une recherche active mais invisible
   * filtrerait la liste sans que rien ne le dise a l'ecran.
   */
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  /**
   * SELECTION MULTIPLE (12/08/2026). Remplace l'ancien `filter: string`.
   * Tableau VIDE = « Tous » ; il n'existe pas de cle 'all' stockee, pour qu'il
   * n'y ait qu'une seule facon de representer « aucun filtre ».
   *
   * ⚠️ Ce filtre ne touche PAS la requete Supabase, contrairement a ce que
   * laissait entendre la consigne : `load()` ne construit qu'un `order`, un
   * `range` et le `.or()` de recherche. Le tri par categorie a toujours ete
   * calcule dans `visible`, cote appareil. Rien a changer cote base.
   */
  const [filtres, setFiltres] = useState<string[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  /** `true` quand la lecture d'AsyncStorage est finie (reussie ou non). */
  const [prefsLues, setPrefsLues] = useState(false);
  const [mailboxes, setMailboxes] = useState<{ email: string; provider: string }[]>([]);
  const [selectedBoxes, setSelectedBoxes] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | 'menu'>(null);
  /**
   * DOSSIER AFFICHE (09/08/2026). `null` = boite de reception ; sinon le marqueur
   * (`archive`, `corbeille`, et depuis le 12/08 `pub` et `spam`).
   *
   * POURQUOI PAS UN ONGLET EN BAS, comme sur le web a gauche : la barre du bas ne
   * peut pas porter 7 entrees. Mesure deja payee sur ce projet — a 5 onglets et
   * 11 pt, « Отправленные » (ru) et « Gesendet » (de) debordaient, il a fallu
   * descendre a 9,5 pt (cf. le commentaire de _layout.tsx). A 7 entrees on serait a
   * ~50 px par onglet. Le selecteur de dossier vit donc DANS l'onglet Emails, ce qui
   * suit aussi le geste naturel : on cherche un mail archive depuis ses mails.
   *
   * ⚠️ 12/08/2026 — `pub` et `spam` sont DES VALEURS DE `dossier` maintenant.
   * Avant, ils vivaient dans `filter` avec un `filtreEstMarqueur` pour les
   * distinguer des categories. C'etait une exception a maintenir a chaque
   * retouche, alors que `marqueurDe()` les traite deja comme des dossiers :
   * `flux` filtre sur `marqueurDe(tags) === dossier`, et cela vaut pour eux
   * sans une ligne de plus. L'exception a donc disparu, pas le comportement.
   */
  const [dossier, setDossier] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  function toggleBox(email: string) {
    const e = email.toLowerCase();
    setSelectedBoxes((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  function toggleFiltre(key: string) {
    setFiltres((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // ---------------------------------------------------------------------------
  // Persistance des filtres sur l'appareil.
  //
  // LECTURE AU MONTAGE, et l'ecran reste sur son indicateur de chargement tant
  // qu'elle n'est pas finie (cf. le `!prefsLues` du garde plus bas). Sans cela,
  // les puces s'afficheraient un instant sur « Tous » avant de sauter sur la
  // selection retrouvee.
  //
  // ⚠️ Le `catch` n'est PAS un silence : une preference illisible ne doit pas
  // empecher la boite mail de s'afficher, et l'echec est visible a l'ecran —
  // les puces reviennent sur « Tous ». On le trace quand meme dans la console.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const brut = await AsyncStorage.getItem(CLE_FILTRES);
        if (brut) {
          const p = JSON.parse(brut) as FiltresStockes;
          if (Array.isArray(p?.filtres)) {
            // On ne garde que des cles de priorite connues : une cle disparue
            // d'une version a l'autre filtrerait sur rien, sans rien dire.
            setFiltres(p.filtres.filter((k): k is string => typeof k === 'string' && PRIORITY_KEYS.includes(k)));
          }
          if (typeof p?.nonLus === 'boolean') setUnreadOnly(p.nonLus);
        }
      } catch (e) {
        console.warn('[feed] filtres enregistres illisibles, retour sur « Tous »', e);
      } finally {
        setPrefsLues(true);
      }
    })();
  }, []);

  // ECRITURE a chaque changement. Le garde `prefsLues` est indispensable : sans
  // lui, ce meme effet ecraserait la valeur stockee par les valeurs par defaut
  // au tout premier rendu, avant meme que la lecture ait rendu la main.
  useEffect(() => {
    if (!prefsLues) return;
    AsyncStorage.setItem(CLE_FILTRES, JSON.stringify({ filtres, nonLus: unreadOnly })).catch((e) =>
      console.warn('[feed] enregistrement des filtres impossible', e),
    );
  }, [filtres, unreadOnly, prefsLues]);

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
      // Une categorie tapee depuis l'Accueil REMPLACE la selection en cours :
      // on vient de designer une categorie precise, l'ajouter aux filtres deja
      // coches donnerait une liste plus large que celle qu'on a demandee.
      const pending = consumePendingFeedFilter();
      if (pending) setFiltres(PRIORITY_KEYS.includes(pending) ? [pending] : []);
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

  /** Un mail passe-t-il les categories cochees ? Tableau vide = tout passe. */
  const passeLesCategories = useCallback(
    (it: Item) => filtres.length === 0 || filtres.includes(prio(it).key),
    [filtres, prio],
  );

  /**
   * Non lus DANS LA SELECTION (12/08/2026), et non plus dans tout le dossier :
   * le nombre annonce doit etre celui qui restera si on appuie sur la puce.
   * Avant, « Non lus 12 » pouvait n'en filtrer que 3 quand « Urgent » etait actif.
   */
  const unreadCount = useMemo(
    () => flux.filter((it) => it.status === 'unread' && passeLesCategories(it)).length,
    [flux, passeLesCategories],
  );

  const visible = useMemo(
    () =>
      flux.filter((it) => {
        if (!passeLesCategories(it)) return false;
        if (unreadOnly && it.status !== 'unread') return false;
        return true;
      }),
    [flux, passeLesCategories, unreadOnly],
  );

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

  // Les trois dossiers. Ordre aligne sur la barre de gauche du web :
  // boite de reception, archives, supprimes.
  const DOSSIERS: { key: string; valeur: string | null; label: string }[] = [
    { key: CLE_BOITE_RECEPTION, valeur: null, label: t.feed.folderInbox },
    { key: TAG_ARCHIVE, valeur: TAG_ARCHIVE, label: t.feed.folderArchived },
    { key: TAG_TRASH, valeur: TAG_TRASH, label: t.feed.folderDeleted },
  ];

  /** Intitule affiche en gros titre : le dossier courant, mis de cote compris. */
  const titreEcran =
    dossier === TAG_PUB
      ? t.feed.filterPub
      : dossier === TAG_SPAM
        ? t.feed.filterSpam
        : (DOSSIERS.find((d) => d.valeur === dossier)?.label ?? t.tabs.feed);

  // La puce « Publicites » designe les onglets Gmail : elle n'a pas de sens sans
  // boite Gmail connectee (le lancement se fait sur Outlook seul). Meme regle que le
  // web, ou le defaut est `false` pour cacher plutot que montrer a tort.
  const aUneBoiteGmail = mailboxes.some((m) => (m.provider || '').toLowerCase() === 'gmail');

  // Les mis de cote ne se proposent que depuis la boite de reception — ou depuis
  // l'un d'eux, pour pouvoir passer de l'un a l'autre. Depuis les Archives ou la
  // Corbeille ils n'ont pas de sens, exactement comme les puces qu'ils remplacent.
  const misDeCoteVisibles = dossier === null || dossier === TAG_PUB || dossier === TAG_SPAM;

  /**
   * LE MENU ⋯ — UNE SEULE FEUILLE, A SECTIONS.
   *
   * `filter-sheet.tsx` a recu les intertitres pour l'occasion plutot que de
   * fabriquer une feuille mere qui rouvrirait des sous-feuilles : changer de
   * dossier coutait alors deux appuis, et surtout cela aurait fait un second
   * systeme de feuilles a maintenir — ce que la consigne interdit.
   */
  const sectionsMenu: SheetSection[] = [];

  sectionsMenu.push({
    title: t.feed.folder,
    options: DOSSIERS.map((d) => ({ key: d.key, label: d.label, selected: d.valeur === dossier })),
  });

  if (boxAddresses.length > 1) {
    sectionsMenu.push({
      title: t.feed.byBox,
      options: [
        { key: CLE_TOUTES_BOITES, label: t.feed.allBoxes, selected: selectedBoxes.length === 0 },
        ...boxAddresses.map(
          (addr): SheetOption => ({
            key: addr,
            label: addr,
            selected: selectedBoxes.includes(addr),
          }),
        ),
      ],
    });
  }

  const optionsMisDeCote: SheetOption[] = [];
  if (misDeCoteVisibles) {
    if (aUneBoiteGmail && counts[TAG_PUB]) {
      optionsMisDeCote.push({
        key: TAG_PUB,
        label: t.feed.filterPub,
        count: counts[TAG_PUB],
        partial: hasMore,
        selected: dossier === TAG_PUB,
      });
    }
    if (counts[TAG_SPAM]) {
      optionsMisDeCote.push({
        key: TAG_SPAM,
        label: t.feed.filterSpam,
        count: counts[TAG_SPAM],
        partial: hasMore,
        selected: dossier === TAG_SPAM,
      });
    }
  }
  if (optionsMisDeCote.length > 0) {
    sectionsMenu.push({ title: t.feed.setAside, options: optionsMisDeCote });
  }

  const optionsActions: SheetOption[] = [
    {
      key: CLE_ACTUALISER,
      label: refreshingNow ? t.common.refreshing : t.common.refresh,
      selected: false,
      action: true,
      disabled: refreshingNow,
    },
  ];
  if (unreadVisibleIds.length > 0) {
    optionsActions.push({
      key: CLE_TOUT_LIRE,
      label: `${t.feed.markAllRead} (${unreadVisibleIds.length})`,
      selected: false,
      action: true,
      disabled: markingRead,
    });
  }
  sectionsMenu.push({ title: t.feed.actions, options: optionsActions });

  function choisirDansLeMenu(key: string) {
    // Dossier
    const d = DOSSIERS.find((x) => x.key === key);
    if (d) {
      setDossier(d.valeur);
      // ⚠️ ON NE REMET PLUS LES FILTRES A ZERO en changeant de dossier (12/08).
      // La raison d'origine — « garder Urgent en entrant dans la corbeille
      // afficherait une liste vide sans dire pourquoi » — ne tient plus : les
      // puces actives restent visibles en ligne 2, et le message de liste vide
      // nomme deja le filtre. Les remettre a zero ici viderait la selection
      // persistante a chaque aller-retour dans les Archives.
      setSheet(null);
      return;
    }
    // Mis de cote : un second appui sur celui ou l'on est ramene a la reception.
    if (key === TAG_PUB || key === TAG_SPAM) {
      setDossier((prev) => (prev === key ? null : key));
      setSheet(null);
      return;
    }
    // Boites : la feuille reste ouverte, on en coche souvent plusieurs.
    if (key === CLE_TOUTES_BOITES) {
      setSelectedBoxes([]);
      return;
    }
    if (boxAddresses.includes(key)) {
      toggleBox(key);
      return;
    }
    // Actions
    if (key === CLE_ACTUALISER) {
      setSheet(null);
      void refreshNow();
      return;
    }
    if (key === CLE_TOUT_LIRE) {
      setSheet(null);
      void markAllRead();
    }
  }

  function basculerRecherche() {
    setRechercheOuverte((ouverte) => {
      // On referme : le terme part avec le champ. Une recherche encore active
      // derriere une loupe fermee filtrerait la liste en silence.
      if (ouverte) setQuery('');
      return !ouverte;
    });
  }

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

  // `!prefsLues` : on ne montre pas les puces avant de savoir lesquelles sont
  // cochees, sinon elles sautent de « Tous » a la selection retrouvee.
  if (loading || !prefsLues) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.terracotta} />
      </View>
    );
  }

  return (
    <>
      <FilterSheet
        visible={sheet === 'menu'}
        title={t.feed.menuTitle}
        sections={sectionsMenu}
        doneLabel="OK"
        onPick={choisirDansLeMenu}
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
              {/* ----------------------------------------------------------------
                  LIGNE 1 — logo · Pieces jointes · loupe · ⋯
                  Quatre reperes au lieu des huit d'avant. Tout ce qui reglait un
                  affichage (dossier, boite, mis de cote) et l'action groupee est
                  passe dans le ⋯ ; « Pieces jointes » reste dehors parce que
                  c'est le seul chemin vers cette recherche.
                  ---------------------------------------------------------------- */}
              <View style={styles.topRow}>
                <LogoVmail size={23} />
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
                    style={[styles.iconBtn, rechercheOuverte && styles.iconBtnOn]}
                    onPress={basculerRecherche}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t.feed.searchPlaceholder}
                  >
                    <IconSearch
                      size={16}
                      color={rechercheOuverte ? colors.charcoal : colors.onDark}
                    />
                  </Pressable>
                  <Pressable
                    style={[styles.iconBtn, sheet === 'menu' && styles.iconBtnOn]}
                    onPress={() => setSheet('menu')}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={t.feed.menuTitle}
                  >
                    <IconMore size={18} color={sheet === 'menu' ? colors.charcoal : colors.onDark} />
                  </Pressable>
                </View>
              </View>

              {/* Le grand titre est le SEUL endroit qui dit dans quel dossier on
                  est, maintenant que le selecteur est dans le ⋯. */}
              <Text style={styles.title}>{titreEcran}</Text>

              {dossier === TAG_TRASH ? <Text style={styles.trashNote}>{t.feed.trashNote}</Text> : null}

              {/* Recherche — masquee au repos, le debounce de 300 ms est inchange. */}
              {rechercheOuverte ? (
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
                    autoFocus
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                  />
                </View>
              ) : null}

              {/* ----------------------------------------------------------------
                  LIGNE 2 — les puces, sur UNE ligne qui defile.
                  Le defilement horizontal deborde volontairement des marges du
                  bandeau (marges negatives + retrait dans le contenu) : une puce
                  coupee au bord de l'ecran est ce qui dit qu'il y en a d'autres.
                  ---------------------------------------------------------------- */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScroll}
                contentContainerStyle={styles.chipsScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  style={[styles.chip, filtres.length === 0 && styles.chipOn]}
                  onPress={() => setFiltres([])}
                >
                  <Text style={[styles.chipText, filtres.length === 0 && styles.chipTextOn]}>
                    {t.feed.filterAll}
                  </Text>
                </Pressable>

                {/* « Non lus » est un filtre CROISE : il se combine aux categories
                    au lieu de les remplacer. D'ou son etat separe. */}
                <Pressable
                  style={[styles.chip, unreadOnly && styles.chipOn]}
                  onPress={() => setUnreadOnly((v) => !v)}
                >
                  <Text style={[styles.chipText, unreadOnly && styles.chipTextOn]}>
                    {t.feed.unread}
                    {unreadCount > 0 ? ` ${unreadCount}${hasMore ? '+' : ''}` : ''}
                  </Text>
                </Pressable>

                {PRIORITIES.map((p) => {
                  const actif = filtres.includes(p.key);
                  return (
                    <Pressable
                      key={p.key}
                      style={[styles.chip, actif && styles.chipOn]}
                      onPress={() => toggleFiltre(p.key)}
                    >
                      <Text style={[styles.chipText, actif && styles.chipTextOn]}>
                        {prioLabel(t, p.key)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
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
                    : filtres.length > 0 || unreadOnly
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
    marginTop: spacing.md,
    backgroundColor: 'rgba(234,225,208,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.18)',
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
  // Bouton rond a icone seule (loupe, ⋯). 32 px de cible visible, elargie par
  // `hitSlop` : en dessous de ~44 px au total, on rate la cible au pouce.
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.charline,
  },
  iconBtnOn: { backgroundColor: colors.onDark, borderColor: colors.onDark },
  trashNote: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    marginTop: spacing.xs,
  },
  chipsScroll: {
    marginTop: spacing.md,
    // Deborde des marges du bandeau pour que les puces filent jusqu'aux bords.
    marginHorizontal: -spacing.xl,
  },
  chipsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.20)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipOn: { backgroundColor: '#f0975a', borderColor: '#f0975a' },
  chipText: { fontFamily: fonts.sansSemibold, fontSize: 12, color: colors.onDarkMuted },
  chipTextOn: { color: colors.charcoal },

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
});
