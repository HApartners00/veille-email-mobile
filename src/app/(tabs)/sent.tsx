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
import { EmailRow } from '@/components/email-row';
import {
  cleanText,
  formatDateCourte,
  parseRecipients,
  recipientsEmails,
  recipientsLabel,
  senderInitials,
} from '@/lib/mail-format';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing } from '@/lib/theme';

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


/**
 * « EN PAUSE » — dictionnaire LOCAL, meme convention que le reste des ecrans.
 * Jumeau de PAUSE_STR dans `apps/web/src/app/sent/sent-list.tsx`.
 */
// Bandeau d'etat vide quand la releve des envoyes est en pause. Formulation
// NEUTRALISEE le 27/08/2026 : elle disait « votre essai gratuit est termine »,
// ce qui decrit un service payant dans une app qui ne permet pas d'acheter
// (refus App Store du 27/08, regles 3.1.1 et 3.1.3(c)).
type DictPause = { paused: string; pausedHint: string };
const PAUSE_STR: Record<string, DictPause> = {
  fr: { paused: 'La relève de vos envois est en pause.', pausedHint: 'Les nouveaux envois ne sont plus remontés ici. Ceux d’avant restent visibles.' },
  en: { paused: 'Sent-mail pickup is paused.', pausedHint: 'New sent emails are no longer collected here. Earlier ones stay visible.' },
  es: { paused: 'La recogida de tus envíos está en pausa.', pausedHint: 'Los nuevos envíos ya no se recogen aquí. Los anteriores siguen visibles.' },
  de: { paused: 'Das Abrufen deiner gesendeten E-Mails ist pausiert.', pausedHint: 'Neue gesendete E-Mails werden nicht mehr abgeholt. Frühere bleiben sichtbar.' },
  pt: { paused: 'A recolha dos seus envios está em pausa.', pausedHint: 'Os novos envios já não são recolhidos aqui. Os anteriores continuam visíveis.' },
  it: { paused: 'Il recupero dei messaggi inviati è in pausa.', pausedHint: 'I nuovi invii non vengono più raccolti qui. Quelli precedenti restano visibili.' },
  ar: { paused: 'تم إيقاف جلب رسائلك المُرسَلة مؤقتًا.', pausedHint: 'لم تعد الرسائل المُرسَلة الجديدة تُجلب هنا. تبقى الرسائل السابقة ظاهرة.' },
  ru: { paused: 'Сбор отправленных писем приостановлен.', pausedHint: 'Новые отправленные письма больше не собираются. Прежние остаются видимыми.' },
};

export default function SentScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const sp = PAUSE_STR[locale] ?? PAUSE_STR.en;
  const tx = t.sent;

  /**
   * ============================================================================
   * QUATRIEME ETAT : « EN PAUSE » — 17/08/2026. Jumeau du web, meme journee.
   * ============================================================================
   * Constat de HA : l'onglet Envoyes affichait « Aucun email envoye pour le
   * moment / la synchronisation remonte vos envois une fois par jour », alors
   * qu'il venait d'envoyer un message ET que la releve de son compte etait
   * arretee. L'ecran disait « il n'y en a pas, patiente » ; la verite etait
   * « ton compte n'est plus releve, rien ne viendra ».
   *
   * MESURE (17/08) : le job n8n `Vmail — App Sent Sync` appelle
   * /api/accounts?entitled=1, qui ne renvoie que les comptes avec abonnement
   * actif ou essai en cours. Execution 28542 : `boites: 1`, zero ligne dans
   * sent_items pour ce compte.
   *
   * ⚠️ TROIS ETATS NE SUFFISENT PAS ICI. Vide, echec, « je ne sais pas encore »
   * — il en manquait un QUATRIEME : en pause.
   */
  // 25/09/2026 — PLUS DE PAUSE. La relève des Envoyés (n8n « App Sent Sync ») ne se
  // limite plus aux abonnés : la formule Gratuite a toutes les fonctionnalités, et
  // cette relève ne coûte pas d'IA. Lire `entitled` ici annoncerait une pause fausse
  // à tout compte gratuit. Le libellé « en pause » reste en place, inutilisé.
  const enPause = false as boolean;

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
            {/* ⚠️ NE PAS DIRE « AUCUN EMAIL ENVOYE » QUAND LA RELEVE EST EN
                PAUSE. L'utilisateur a peut-etre envoye dix messages : ils ne
                remonteront jamais. Annoncer un vide serait un mensonge, et
                annoncer « une fois par jour » une promesse fausse. */}
            <Text style={styles.empty}>
              {debouncedQuery
                ? tx.noMatch
                : boiteVideSelectionnee
                  ? tx.emptyBox
                  : enPause
                    ? sp.paused
                    : tx.empty}
            </Text>
            {!debouncedQuery && !boiteVideSelectionnee ? (
              <Text style={styles.emptyHint}>{enPause ? sp.pausedHint : tx.emptyHint}</Text>
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
          const premier = parseRecipients(item.recipients)[0];
          const initiales = premier
            ? senderInitials(premier.name ? `${premier.name} <${premier.email ?? ''}>` : premier.email ?? null)
            : '@';
          // ⚠️ LA LIGNE OUVRE UNE PAGE, et ne porte ni « Renvoyer » ni « Transferer »
          // (HA, 13/08 : ces boutons FONT PARTIR UN MAIL, pas sur une liste dense).
          // Pleine largeur facon Gmail depuis le 16/09/2026 : `layout="ligne"`.
          // Rond neutre : un envoi n'a pas de categorie de tri.
          return (
            <EmailRow
              layout="ligne"
              prefix={tx.to}
              sender={to}
              initials={initiales}
              prioColor="#5c554a"
              badge={item.sent_via_vmail ? tx.viaVmail : undefined}
              date={formatDateCourte(item.sent_at, intl)}
              subject={item.subject || t.common.noSubject}
              preview={cleanText(item.preview) || null}
              footnote={accounts.length > 1 ? item.account_email : undefined}
              onPress={() => router.push({ pathname: '/envoi/[id]', params: { id: item.id } })}
            />
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

  // Les styles de l'ancienne carte (card, metaRow, toLabel, to, badge, date,
  // subject, preview, account) sont partis le 16/09/2026 avec elle : la ligne
  // vit desormais dans components/email-row.tsx (`layout="ligne"`).

  // ⚠️ SUR FOND SOMBRE : `muted` y serait a 2,83:1 depuis le correctif du 12/08.
  // Le fond de page etant sombre, ce libelle prend le jeton prevu pour lui.
  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.onDarkMuted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
  more: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta, textAlign: 'center', paddingVertical: spacing.md },
});
