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
import { setPendingFeedFilter } from '@/lib/feed-filter';
import { marqueurDe } from '@/lib/mail-state';
import { effectivePriority, PRIORITIES, type Rule } from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import BoutonVmailIA from '@/components/bouton-vmail-ia';
import { EmailRow } from '@/components/email-row';
import { cleanText, formatDateCourte, senderInitials } from '@/lib/mail-format';
import { LogoVmail } from '@/components/logo-v';
import { BlocPremierImport } from '@/components/premier-import';
import { usePremierImport } from '@/lib/premier-import';

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

// ⚠️ TITRE DE SECTION « À RÉPONDRE » — 16/09/2026. Sa couleur de categorie
// (#4a443a) etait a 1,72:1 sur le fond sombre : quasi invisible. Il prend le
// texte secondaire sur fond sombre, le meme que le mot « À RÉPONDRE » des
// lignes de l'onglet Emails. Les autres titres gardent leur couleur.
// Mesure au passage, NON corrige (non demande) : Urgent #c2410c 3,21:1 et
// Info #3f7e58 3,43:1, sous le seuil de 4,5:1 pour ce corps de texte.
const TITRE_SECTION: Record<string, string> = {
  human: colors.onDarkMuted,
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
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  // 22/09/2026 — vrai quand ce compte n'a encore AUCUN mail en base (requête
  // sans filtre de date vide). `null` tant qu'on ne sait pas.
  const [aucunMail, setAucunMail] = useState<boolean | null>(null);

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
        setAucunMail(today.length === 0 && recent.length === 0);
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

  // Premier import : tant qu'aucun mail n'est arrivé, on ne dit PAS « Boîte à
  // jour » — on dit ce qui se passe, et l'écran se recharge tout seul.
  const premierImport = usePremierImport(aucunMail, load);
  const boiteAJour = total === 0 && premierImport === 'non';

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
          {/* 25/09/2026 — choix de HA : la pilule « Assistant » et le bouton
              « Actualiser » laissent la place à la bille « Vmail IA ». Les mails
              arrivent seuls ; tirer l'écran vers le bas recharge toujours la liste. */}
          <BoutonVmailIA />
        </View>

        <Text style={styles.date}>{todayLabel(intl)}</Text>
        <Text style={styles.greeting}>{greetWithName(t.common.hello, firstName)}</Text>

        {total === 0 ? (
          boiteAJour ? <Text style={styles.recapEmpty}>{t.home.boxUpToDate}</Text> : null
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
                <View style={[styles.dot, { backgroundColor: TITRE_SECTION[p.key] ?? p.color }]} />
                <Text style={[styles.sectionTitle, { color: TITRE_SECTION[p.key] ?? p.color }]}>
                  {prioLabel(t, p.key)}
                </Text>
                <Text style={styles.sectionCount}>{list.length}</Text>
                <View style={styles.sectionLine} />
              </View>
              {list.map((it) => (
                // Pleine largeur facon Gmail depuis le 16/09/2026, comme Emails,
                // Envoyes et Brouillons. Pas de mot de categorie : le titre de
                // section le dit deja.
                <EmailRow
                  key={it.id}
                  layout="ligne"
                  subject={it.title || t.common.noSubject}
                  sender={senderName(it.author, t.common.unknownSender)}
                  initials={senderInitials(it.author)}
                  prioKey={p.key}
                  prioColor={p.color}
                  date={formatDateCourte(it.received_at, intl)}
                  preview={it.preview ? cleanText(it.preview) : null}
                  unread={it.status === 'unread'}
                  onPress={() => router.push({ pathname: '/email/[id]', params: { id: it.id } })}
                />
              ))}
            </View>
          );
        })}

        {boiteAJour ? (
          <View style={styles.allClear}>
            <Text style={styles.allClearTitle}>{t.home.allClearTitle}</Text>
            <Text style={styles.allClearSub}>{t.home.allClearSub}</Text>
          </View>
        ) : total === 0 && !error ? (
          <BlocPremierImport etat={premierImport} onConnecter={() => router.push('/sources')} />
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
  // Pas de marge laterale sur le corps : les lignes de mail vont d'un bord a
  // l'autre (16/09/2026). La marge de 24 px est reportee sur ce qui n'est pas
  // une ligne : erreur, titres de section, message « tout est traite ».
  body: { paddingTop: spacing.xl },
  error: { fontFamily: fonts.sans, color: colors.danger, fontSize: 13, marginBottom: spacing.md, paddingHorizontal: spacing.xl },
  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: spacing.xl },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: { fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 1.4, textTransform: 'uppercase' },
  sectionCount: { fontFamily: fonts.sansSemibold, fontSize: 11.5, color: colors.hint },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.cardline },

  allClear: { marginTop: spacing.xxl, alignItems: 'center', paddingHorizontal: spacing.xl },
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
