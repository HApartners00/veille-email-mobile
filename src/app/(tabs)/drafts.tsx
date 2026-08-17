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
import { cleanText, formatDate, recipientsLabel } from '@/lib/mail-format';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Onglet « Brouillons » — jumeau mobile de apps/web/src/app/drafts/.
 *
 * LECTURE EN DIRECT chez le fournisseur, via /api/drafts → webhook n8n. Rien
 * n'est stocké côté Vmail : un brouillon supprimé depuis Gmail disparaît ici
 * aussi. Contrepartie assumée : messagerie injoignable = liste vide, et l'écran
 * le DIT au lieu d'afficher « aucun brouillon ».
 */


/**
 * BROUILLONS VMAIL — 17/08/2026. Dictionnaire LOCAL, meme convention que
 * `NOTE_STR` dans `app/brouillon/[id].tsx` : deux chaines ne justifient pas
 * d'elargir le dictionnaire global, qui obligerait a toucher les huit tables.
 */
type DictVmail = { modifiable: string; chezVous: string };
const VMAIL_STR: Record<string, DictVmail> = {
  fr: { modifiable: 'Modifiable', chezVous: 'Vos brouillons Vmail ne sont pas visibles dans Gmail ni dans Outlook.' },
  en: { modifiable: 'Editable', chezVous: 'Your Vmail drafts are not visible in Gmail or Outlook.' },
  es: { modifiable: 'Editable', chezVous: 'Tus borradores de Vmail no se ven en Gmail ni en Outlook.' },
  de: { modifiable: 'Bearbeitbar', chezVous: 'Deine Vmail-Entwürfe sind in Gmail und Outlook nicht sichtbar.' },
  pt: { modifiable: 'Editável', chezVous: 'Os seus rascunhos Vmail não aparecem no Gmail nem no Outlook.' },
  it: { modifiable: 'Modificabile', chezVous: 'Le tue bozze Vmail non sono visibili in Gmail né in Outlook.' },
  ar: { modifiable: 'قابلة للتعديل', chezVous: 'مسوداتك في Vmail غير ظاهرة في Gmail أو Outlook.' },
  ru: { modifiable: 'Редактируемый', chezVous: 'Ваши черновики Vmail не видны в Gmail и Outlook.' },
};

type BrouillonVmail = {
  id: string;
  accountEmail: string;
  to: string[];
  subject: string;
  body: string;
  updatedAt: string;
};

/** Une ligne de la liste, quelle que soit sa provenance. */
type Ligne = {
  cle: string;
  id: string;
  /** Brouillon possede par Vmail : modifiable, ouvre l'editeur. */
  vmail: boolean;
  accountEmail: string;
  subject: string;
  preview: string;
  to: string;
  updatedAt: string | null;
  byVmail: boolean;
};

export default function DraftsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.drafts;
  const sv = VMAIL_STR[locale] ?? VMAIL_STR.en;

  const [drafts, setDrafts] = useState<Brouillon[]>([]);
  /**
   * ⚠️ DEUX SOURCES, DEUX ETATS D'ECHEC SEPARES — 17/08/2026.
   *
   * Les brouillons Vmail sont en base, ceux de la messagerie sont lus en direct
   * chez le fournisseur. L'un peut tomber sans l'autre. Melanger les deux ferait
   * disparaitre des brouillons parfaitement lisibles a cause d'une panne qui ne
   * les concerne pas — et l'inverse : une liste vide masquerait le fait qu'on
   * n'a PAS PU regarder la messagerie.
   */
  const [vmailDrafts, setVmailDrafts] = useState<BrouillonVmail[]>([]);
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
    // Les brouillons Vmail, en base : rapides, et independants de la messagerie.
    // Un echec ici n'efface pas ceux du fournisseur, et reciproquement.
    void apiGet<{ ok?: boolean; drafts?: BrouillonVmail[] }>('/api/vmail-drafts')
      .then((j) => setVmailDrafts(Array.isArray(j?.drafts) ? j.drafts : []))
      .catch(() => setVmailDrafts([]));

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
    vmailDrafts.forEach((d) => d.accountEmail && s.add(d.accountEmail.toLowerCase()));
    return Array.from(s).sort();
  }, [drafts, vmailDrafts]);

  const toggleBox = useCallback((email: string) => {
    const e = email.toLowerCase();
    setSelectedBoxes((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();

    // Les brouillons Vmail ouvrent l'editeur de redaction, ou tout est
    // modifiable. Ceux de la messagerie gardent leur page.
    const aVmail: Ligne[] = vmailDrafts.map((d) => ({
      cle: `vmail-${d.id}`,
      id: d.id,
      vmail: true,
      accountEmail: d.accountEmail || '',
      subject: d.subject || '',
      preview: d.body || '',
      to: (d.to || []).join(', ') || tx.noRecipient,
      updatedAt: d.updatedAt || null,
      byVmail: true,
    }));

    const aFournisseur: Ligne[] = drafts.map((d) => ({
      cle: `fournisseur-${d.id}`,
      id: d.id,
      vmail: false,
      accountEmail: d.accountEmail || '',
      subject: d.subject || '',
      preview: d.preview || '',
      to: recipientsLabel(d.recipients, tx.noRecipient),
      updatedAt: d.updatedAt,
      byVmail: Boolean(d.byVmail),
    }));

    // Un seul tri, sur la date : on cherche « ce que j'ai touche en dernier »,
    // pas « d'ou ca vient ». La provenance se lit sur la pastille.
    return [...aVmail, ...aFournisseur]
      .filter((d) => {
        if (selectedBoxes.length > 0 && !selectedBoxes.includes(d.accountEmail.toLowerCase()))
          return false;
        if (!term) return true;
        return `${d.subject} ${d.preview} ${d.to}`.toLowerCase().includes(term);
      })
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }, [drafts, vmailDrafts, selectedBoxes, query, tx.noRecipient]);

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
        keyExtractor={(d) => d.cle}
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
        /* DIT UNE FOIS, LA OU CA SE CONSTATE. Un brouillon Vmail absent de
           Gmail n'est pas une panne : c'est le choix du 17/08. Sans cette
           ligne, la premiere reaction serait « il a disparu ». */
        ListFooterComponent={
          vmailDrafts.length > 0 ? <Text style={styles.noteVmail}>{sv.chezVous}</Text> : null
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
          const to = d.to;
          return (
            <View style={styles.rowWrap}>
              {/* ⚠️ LA CARTE OUVRE UNE PAGE — HA, 13/08 : « meme logique pour les
                  brouillons ». Modifier, Envoyer et Supprimer ne sont plus ici :
                  « Envoyer » fait partir un vrai mail et « Supprimer » efface
                  DEFINITIVEMENT chez le fournisseur. Deux gestes irrattrapables
                  qui n'ont rien a faire sur chaque carte d'une liste dense. */}
              <Pressable
                style={styles.card}
                onPress={() =>
                  d.vmail
                    ? router.push({ pathname: '/nouveau', params: { draft: d.id } })
                    : router.push({ pathname: '/brouillon/[id]', params: { id: d.id } })
                }
                accessibilityRole="button"
                accessibilityLabel={d.subject || t.common.noSubject}
              >
                <View style={styles.metaRow}>
                  <Text style={styles.toLabel}>{tx.to}</Text>
                  <Text style={styles.to} numberOfLines={1}>
                    {to}
                  </Text>
                  {/* La pastille dit ce qu'on peut FAIRE, pas d'ou ca vient :
                      « Modifiable » a un sens pour l'utilisateur, « brouillon
                      Vmail » n'en a aucun. */}
                  {d.vmail ? (
                    <Text style={styles.badge}>{sv.modifiable}</Text>
                  ) : d.byVmail ? (
                    <Text style={styles.badge}>{tx.byVmail}</Text>
                  ) : null}
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
  noteVmail: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.onDarkMuted,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    textAlign: 'center',
  },
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
