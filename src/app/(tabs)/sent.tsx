import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Chantier E / C — 11/08/2026. Dictionnaire autonome (même patron que les autres
// écrans) : 4 chaînes ne justifient pas de toucher au gros dictionnaire.
const LIRE_STR: Record<
  string,
  { chargement: string; tout: string; replier: string; abrege: string }
> = {
  fr: { chargement: 'Chargement du message…', tout: 'Afficher tout', replier: 'Replier', abrege: 'Version abrégée — le message complet n’a pas pu être récupéré.' },
  en: { chargement: 'Loading the message…', tout: 'Show all', replier: 'Collapse', abrege: 'Shortened version — the full message could not be retrieved.' },
  es: { chargement: 'Cargando el mensaje…', tout: 'Mostrar todo', replier: 'Contraer', abrege: 'Versión abreviada: no se ha podido recuperar el mensaje completo.' },
  de: { chargement: 'Nachricht wird geladen…', tout: 'Alles anzeigen', replier: 'Einklappen', abrege: 'Gekürzte Fassung – die vollständige Nachricht konnte nicht geladen werden.' },
  pt: { chargement: 'A carregar a mensagem…', tout: 'Mostrar tudo', replier: 'Recolher', abrege: 'Versão abreviada — não foi possível obter a mensagem completa.' },
  it: { chargement: 'Caricamento del messaggio…', tout: 'Mostra tutto', replier: 'Comprimi', abrege: 'Versione abbreviata — non è stato possibile recuperare il messaggio completo.' },
  ar: { chargement: 'جارٍ تحميل الرسالة…', tout: 'عرض الكل', replier: 'طيّ', abrege: 'نسخة مختصرة — تعذّر استرجاع الرسالة كاملة.' },
  ru: { chargement: 'Загрузка сообщения…', tout: 'Показать полностью', replier: 'Свернуть', abrege: 'Сокращённая версия — не удалось получить письмо целиком.' },
};

/** HTML -> texte lisible. Même traitement que l'écran de lecture d'un mail reçu. */
function htmlToTexte(input: string): string {
  let t = String(input || '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<head[\s\S]*?<\/head>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

import { MailboxHeader } from '@/components/mailbox-header';
import { useI18n } from '@/context/i18n';
import { apiGet, apiPost } from '@/lib/api';
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

function newIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitize(q: string): string {
  return (q || '')
    .replace(/[^\p{L}\p{N} _@.\-]/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Corps d'un mail ENVOYÉ, replié. Jumeau mobile de `components/mail-body-panel.tsx`
 * côté web — arbitrage HA du 11/08 : replié à 55 % d'écran, fondu de coupe,
 * « Afficher tout », pas d'ascenseur imbriqué.
 *
 * `sent_items.content` porte déjà le corps complet (mesuré le 11/08 : 107 lignes
 * sur 117, moyenne 16 977 caractères, maximum 57 302). `/api/message-body` le rend
 * donc SANS appeler le fournisseur : ouvrir un envoi ne coûte qu'une lecture en base.
 */
function CorpsEnvoye({
  sentId,
  apercu,
  locale,
}: {
  sentId: string;
  apercu: string;
  locale: string;
}) {
  const lire = LIRE_STR[locale] ?? LIRE_STR.en;
  const { height: hauteurEcran } = useWindowDimensions();
  const [corps, setCorps] = useState(apercu);
  const [charge, setCharge] = useState(false);
  const [abrege, setAbrege] = useState(true);
  const [deplie, setDeplie] = useState(false);
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    let vivant = true;
    apiPost<{ corps?: string; source?: string }>('/api/message-body', { sentId })
      .then((j) => {
        if (!vivant) return;
        if (j?.corps) {
          setCorps(htmlToTexte(j.corps));
          setAbrege(j.source !== 'fournisseur' && j.source !== 'base_complet');
        }
      })
      .catch(() => {
        // RIEN EN SILENCE : le bandeau « version abrégée » reste affiché.
      })
      .finally(() => {
        if (vivant) setCharge(true);
      });
    return () => {
      vivant = false;
    };
  }, [sentId]);

  const hauteurRepliee = Math.max(240, Math.round(hauteurEcran * 0.55));
  const deborde = hauteur > hauteurRepliee + 48;

  return (
    <View style={styles.corpsWrap}>
      {!charge ? (
        <Text style={styles.corpsNote}>{lire.chargement}</Text>
      ) : abrege ? (
        <Text style={styles.corpsNote}>{lire.abrege}</Text>
      ) : null}
      <View style={deplie || !deborde ? undefined : { maxHeight: hauteurRepliee, overflow: 'hidden' }}>
        {/* On ne garde QUE la plus grande hauteur vue : sinon le clipping ferait
            retomber `deborde` a faux et l'encadre oscillerait indefiniment. */}
        <View
          onLayout={(e) => {
            // ⚠️ Même correction que app/email/[id].tsx : lire l'événement AVANT que
            // React Native ne le recycle. L'updater de setState arrive trop tard et
            // recevait `e.nativeEvent === null` — l'app se fermait au clic.
            const hauteurMesuree = e.nativeEvent.layout.height;
            setHauteur((h) => Math.max(h, hauteurMesuree));
          }}
        >
          <Text style={styles.corpsTexte}>{corps}</Text>
        </View>
        {deborde && !deplie ? (
          <View pointerEvents="none" style={styles.fondu}>
            {[0.06, 0.16, 0.3, 0.48, 0.68, 0.86, 1].map((o, i) => (
              <View key={i} style={[styles.fonduBande, { opacity: o }]} />
            ))}
          </View>
        ) : null}
      </View>
      {deborde ? (
        <Pressable style={styles.deplierBtn} onPress={() => setDeplie((v) => !v)}>
          <Text style={styles.deplierBtnText}>{deplie ? lire.replier : lire.tout}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function SentScreen() {
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.sent;

  const [items, setItems] = useState<SentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const [busyId, setBusyId] = useState<string | null>(null);
  // Chantier E — 11/08/2026 : la liste n'etait pas cliquable. On ouvre sur place,
  // sans navigation, pour ne pas perdre le filtre ni la position de defilement.
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const [forwardFor, setForwardFor] = useState<string | null>(null);
  const [forwardTo, setForwardTo] = useState('');

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

  async function act(item: SentItem, op: 'resend' | 'forward', to?: string[]) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await apiPost('/api/sent/resend', {
        id: item.id,
        op,
        to,
        idempotencyKey: newIdempotencyKey(),
      });
      setNotice(op === 'resend' ? tx.doneResent : tx.doneForwarded);
      setForwardFor(null);
      setForwardTo('');
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tx.errGeneric);
    } finally {
      setBusyId(null);
    }
  }

  function submitForward(item: SentItem) {
    const list = forwardTo
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setError(tx.errAddress);
      return;
    }
    void act(item, 'forward', list);
  }

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
            {notice ? (
              <View style={styles.rowWrap}>
                <Text style={styles.notice}>{notice}</Text>
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
          const busy = busyId === item.id;
          return (
            <View style={styles.rowWrap}>
              <View style={styles.card}>
                <Pressable
                  onPress={() => setOuvertId((v) => (v === item.id ? null : item.id))}
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

                {cleanText(item.preview) && ouvertId !== item.id ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    {cleanText(item.preview)}
                  </Text>
                ) : null}
                </Pressable>

                {ouvertId === item.id ? (
                  <CorpsEnvoye
                    sentId={item.id}
                    apercu={cleanText(item.preview) || ''}
                    locale={locale}
                  />
                ) : null}

                <View style={styles.actions}>
                  <Pressable onPress={() => void act(item, 'resend')} disabled={busy}>
                    <Text style={[styles.action, busy && styles.actionBusy]}>
                      {busy ? tx.working : tx.resend}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setForwardFor(forwardFor === item.id ? null : item.id);
                      setForwardTo('');
                      setError(null);
                    }}
                    disabled={busy}
                  >
                    <Text style={[styles.actionAlt, busy && styles.actionBusy]}>{tx.forward}</Text>
                  </Pressable>
                  {accounts.length > 1 ? (
                    <Text style={styles.account} numberOfLines={1}>
                      {item.account_email}
                    </Text>
                  ) : null}
                </View>

                {forwardFor === item.id ? (
                  <View style={styles.forwardWrap}>
                    <Text style={styles.forwardPrompt}>{tx.forwardPrompt}</Text>
                    <TextInput
                      style={styles.forwardInput}
                      value={forwardTo}
                      onChangeText={setForwardTo}
                      placeholder={tx.forwardPlaceholder}
                      placeholderTextColor={colors.hint}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                    />
                    <View style={styles.forwardBtns}>
                      <Pressable
                        style={[styles.primaryBtn, busy && styles.actionBusy]}
                        onPress={() => submitForward(item)}
                        disabled={busy}
                      >
                        <Text style={styles.primaryBtnText}>{busy ? tx.working : tx.confirm}</Text>
                      </Pressable>
                      <Pressable onPress={() => setForwardFor(null)}>
                        <Text style={styles.actionAlt}>{t.common.cancel}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
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
  corpsWrap: { marginTop: spacing.sm },
  corpsNote: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, lineHeight: 17, marginBottom: 6 },
  corpsTexte: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink2, lineHeight: 23 },
  fondu: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 },
  fonduBande: { flex: 1, backgroundColor: colors.surface },
  deplierBtn: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardline,
    alignItems: 'center',
  },
  deplierBtnText: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.ink },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.md },
  action: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.terracotta },
  actionAlt: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted },
  actionBusy: { opacity: 0.5 },
  account: { fontFamily: fonts.sans, marginLeft: 'auto', fontSize: 11, color: colors.hint, flexShrink: 1 },

  forwardWrap: { marginTop: spacing.md },
  forwardPrompt: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.ink2 },
  forwardInput: {
    fontFamily: fonts.sans,
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13.5,
    color: colors.ink,
  },
  forwardBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  primaryBtnText: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.onDark },

  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
  notice: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.terracotta, marginBottom: spacing.sm },
  more: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta, textAlign: 'center', paddingVertical: spacing.md },
});
