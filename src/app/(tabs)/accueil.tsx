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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import { setPendingFeedFilter } from '@/lib/feed-filter';
import { marqueurDe } from '@/lib/mail-state';
import { effectivePriority, PRIORITIES, type Rule } from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconRefresh } from '@/components/icons';
import { EmailRow } from '@/components/email-row';
import { LogoVmail } from '@/components/logo-v';

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

// Teintes claires des catégories, lisibles sur le bandeau charbon (ligne recap).
const RECAP_TINT: Record<string, string> = {
  urgent: '#e08a5a',
  important: '#d5b06a',
  human: '#9aa6ac',
  info: '#a7b199',
};

// Plafond du récap « du jour ». Suffisant pour couvrir une journée normale ;
// au-delà, les compteurs seraient tronqués (cas extrême documenté).
const RECAP_CAP = 300;

/**
 * Insere le prenom dans la salutation avant sa ponctuation finale :
 * « Bonjour. » + « Hamza » -> « Bonjour Hamza. ». Aligne sur l'accueil web,
 * qui greffe le prenom issu de profiles.full_name sur son propre libelle.
 */
function greetWithName(hello: string, first: string): string {
  if (!first) return hello;
  const m = hello.match(/^([\s\S]*?)([.!?！？。]*)$/);
  return `${(m?.[1] ?? hello).trim()} ${first}${m?.[2] ?? ''}`;
}

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
  const insets = useSafeAreaInsets();
  const { t, intl } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingNow, setRefreshingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');

  // Prenom pour la salutation (comme l'accueil web).
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        const full = ((data as { full_name?: string | null } | null)?.full_name || '').trim();
        if (full) setFirstName(full.split(' ')[0] ?? '');
      } catch {
        // pas bloquant : on garde la salutation generique
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Récap « du jour » : on borne la requête à partir de minuit avec une marge
      // généreuse (RECAP_CAP) pour que les compteurs par catégorie reflètent le
      // vrai total de la journée. On charge aussi les 80 plus récents en repli
      // pour les jours sans email reçu aujourd'hui.
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [todayRes, recentRes, rulesRes] = await Promise.all([
        supabase
          .from('items')
          .select('id, title, author, preview, url, status, tags, received_at')
          .gte('received_at', start.toISOString())
          .order('received_at', { ascending: false })
          .limit(RECAP_CAP),
        supabase
          .from('items')
          .select('id, title, author, preview, url, status, tags, received_at')
          .order('received_at', { ascending: false })
          .limit(80),
        supabase.from('classification_rules').select('match_type, match_value, category'),
      ]);
      const err = todayRes.error || recentRes.error;
      if (err) setError(err.message);
      else {
        const today = (todayRes.data ?? []) as Item[];
        const recent = (recentRes.data ?? []) as Item[];
        // S'il y a des emails aujourd'hui on affiche la journée complète,
        // sinon on retombe sur les plus récents.
        setItems(today.length ? today : recent);
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
    // Exclure les emails de rapport Vmail eux-mêmes : ils arrivent dans la boîte,
    // sont ré-ingérés, et comme leur sujet contient « urgent/important » ils
    // polluaient les buckets. Ce ne sont pas des emails à trier.
    //
    // MIS DE COTE (09/08/2026) : l'accueil ne montre JAMAIS les publicites, les mails
    // sortis de la boite, les indesirables ni la corbeille — quelle que soit leur
    // categorie. Decision de HA : « je les veux pas melanger avec le reste ».
    //
    // ⚠️ CE FILTRE MANQUAIT ICI, ET C'ETAIT VISIBLE : des mails ranges en « Publicites »
    // dans l'onglet Emails apparaissaient quand meme en « Info » sur l'accueil. Le web
    // avait la regle, son jumeau mobile ne l'avait pas — exactement le piege des deux
    // copies qui divergent. `marqueurDe` est partage avec l'onglet Emails : il n'y a
    // plus qu'une definition de « hors flux » sur cette plateforme.
    const clean = items.filter(
      (it) =>
        !/^\s*vmail\s*[—–-]/i.test((it.title || '').toLowerCase()) &&
        marqueurDe(it.tags) === null,
    );
    const today = clean.filter((it) => {
      const t = new Date(it.received_at).getTime();
      return !Number.isNaN(t) && t >= startMs;
    });
    return { list: today.length ? today : clean, isToday: today.length > 0 };
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
      {/* Bandeau charbon : wordmark + actions + salutation + récap */}
      <View style={[styles.top, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.topRow}>
          <LogoVmail size={24} />
          <View style={styles.actions}>
            {/* 11/08/2026 — même bouton que l'onglet Emails (styles.pjBtn de
                (tabs)/index.tsx) : pilule bordée et libellé en toutes lettres, à la
                place du trombone seul. Les deux écrans lisent le MÊME libellé
                `t.feed.attachments`, donc les 8 langues restent alignées. */}
            <Pressable
              style={styles.pjBtn}
              onPress={() => router.push('/attachments')}
              accessibilityLabel={t.feed.attachments}
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

        <Text style={styles.date}>{todayLabel(intl)}</Text>
        <Text style={styles.greeting}>{greetWithName(t.common.hello, firstName)}</Text>

        {total === 0 ? (
          <Text style={styles.recapEmpty}>{t.home.boxUpToDate}</Text>
        ) : (
          // Chaque categorie du recap ouvre le feed deja filtre — la plomberie
          // (setPendingFeedFilter) existait mais n'etait appelee nulle part, donc
          // taper une categorie ne faisait rien. Le web le fait depuis toujours.
          <View style={styles.recapRow}>
            {PRIORITIES.map((p, i) => (
              <Pressable
                key={p.key}
                onPress={() => {
                  setPendingFeedFilter(p.key);
                  router.push('/(tabs)');
                }}
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.recap}>
                  {i > 0 ? '   ·   ' : ''}
                  <Text style={[styles.recapNum, { color: RECAP_TINT[p.key] }]}>
                    {groups[p.key]?.length ?? 0}
                  </Text>{' '}
                  {prioLabel(t, p.key).toLowerCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.body}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Sections par catégorie */}
        {PRIORITIES.map((p) => {
          const list = groups[p.key] ?? [];
          if (list.length === 0) return null;
          return (
            <View key={p.key} style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={[styles.dot, { backgroundColor: p.color }]} />
                <Text style={[styles.sectionTitle, { color: p.color }]}>
                  {prioLabel(t, p.key)}
                </Text>
                <Text style={styles.sectionCount}>{list.length}</Text>
                <View style={styles.sectionLine} />
              </View>
              {list.map((it) => (
                <EmailRow
                  key={it.id}
                  subject={it.title || t.common.noSubject}
                  sender={senderName(it.author, t.common.unknownSender)}
                  prioColor={p.color}
                  showDot
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.fond },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fond },
  content: { paddingBottom: spacing.xxl * 2 },

  // Bandeau charbon
  top: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl + 2,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Copie a l'identique de styles.pjBtn / styles.pjBtnText de (tabs)/index.tsx.
  // Toucher l'un, toucher l'autre.
  pjBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.charline,
  },
  pjBtnText: { fontFamily: fonts.sansSemibold, fontSize: 11.5, color: colors.onDarkMuted },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(240,151,90,0.5)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 1,
    paddingVertical: spacing.sm,
  },
  refreshBtnBusy: { opacity: 0.6 },
  refreshBtnText: { fontFamily: fonts.sansSemibold, color: colors.terracottaLight, fontSize: 12.5 },
  date: {
    fontFamily: fonts.sans,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginTop: spacing.lg,
  },
  greeting: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 36,
    color: colors.onDark,
    letterSpacing: -1,
    marginTop: spacing.sm,
  },
  recap: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDarkMuted, marginTop: spacing.sm, lineHeight: 20 },
  recapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  recapNum: { fontFamily: fonts.sansBold },
  recapEmpty: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDarkMuted, marginTop: spacing.sm, lineHeight: 20 },

  // Corps
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  error: { fontFamily: fonts.sans, color: colors.danger, fontSize: 13, marginBottom: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  sectionCount: { fontFamily: fonts.sansSemibold, fontSize: 11.5, color: colors.hint },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.cardline },

  allClear: { marginTop: spacing.xxl, alignItems: 'center' },
  allClearTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.sage },
  allClearSub: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.hint,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
});
