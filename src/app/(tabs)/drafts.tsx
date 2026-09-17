import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { EmailRow } from '@/components/email-row';
import { MailboxHeader } from '@/components/mailbox-header';
import {
  chargerEnDirect,
  lireListeBase,
  lireListeMemorisee,
  memoriserBrouillons,
  memoriserListe,
  type Brouillon,
} from '@/lib/cache-brouillons';
import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
import { bcp47 } from '@/lib/i18n';
import { cleanText, formatDateCourte, recipientsLabel, senderInitials } from '@/lib/mail-format';
import { colors, fonts, spacing } from '@/lib/theme';

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
type DictVmail = { modifiable: string; chezVous: string; memoire: string; memoireSeule: string };
const VMAIL_STR: Record<string, DictVmail> = {
  fr: { modifiable: 'Modifiable', chezVous: 'Vos brouillons Vmail ne sont pas visibles dans Gmail ni dans Outlook.', memoire: 'Liste de votre dernière visite — mise à jour en cours…', memoireSeule: 'Liste de votre dernière visite — elle n’a pas pu être mise à jour.' },
  en: { modifiable: 'Editable', chezVous: 'Your Vmail drafts are not visible in Gmail or Outlook.', memoire: 'List from your last visit — updating…', memoireSeule: 'List from your last visit — it could not be updated.' },
  es: { modifiable: 'Editable', chezVous: 'Tus borradores de Vmail no se ven en Gmail ni en Outlook.', memoire: 'Lista de su última visita — actualizando…', memoireSeule: 'Lista de su última visita — no se ha podido actualizar.' },
  de: { modifiable: 'Bearbeitbar', chezVous: 'Deine Vmail-Entwürfe sind in Gmail und Outlook nicht sichtbar.', memoire: 'Liste von Ihrem letzten Besuch — wird aktualisiert…', memoireSeule: 'Liste von Ihrem letzten Besuch — sie konnte nicht aktualisiert werden.' },
  pt: { modifiable: 'Editável', chezVous: 'Os seus rascunhos Vmail não aparecem no Gmail nem no Outlook.', memoire: 'Lista da sua última visita — a atualizar…', memoireSeule: 'Lista da sua última visita — não foi possível atualizá-la.' },
  it: { modifiable: 'Modificabile', chezVous: 'Le tue bozze Vmail non sono visibili in Gmail né in Outlook.', memoire: 'Elenco della tua ultima visita — aggiornamento in corso…', memoireSeule: 'Elenco della tua ultima visita — non è stato possibile aggiornarlo.' },
  ar: { modifiable: 'قابلة للتعديل', chezVous: 'مسوداتك في Vmail غير ظاهرة في Gmail أو Outlook.', memoire: 'قائمة زيارتك الأخيرة — جارٍ التحديث…', memoireSeule: 'قائمة زيارتك الأخيرة — تعذّر تحديثها.' },
  ru: { modifiable: 'Редактируемый', chezVous: 'Ваши черновики Vmail не видны в Gmail и Outlook.', memoire: 'Список с вашего прошлого визита — обновляется…', memoireSeule: 'Список с вашего прошлого визита — обновить его не удалось.' },
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

  // ==========================================================================
  // AFFICHAGE IMMEDIAT — 16/09/2026. Mesure : /api/drafts met 2,6 a 7,4 s.
  // On montre d'abord la liste de la derniere visite (sans corps, voir
  // lib/cache-brouillons), avec une ligne qui dit qu'elle se met a jour, puis
  // la vraie liste la remplace. Jumeau de apps/web/src/app/drafts/drafts-list.tsx.
  // ==========================================================================
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const [depuisMemoire, setDepuisMemoire] = useState(false);
  const reseauBrouillons = useRef<Brouillon[] | null>(null);
  const reseauVmail = useRef<BrouillonVmail[] | null>(null);
  const vmailAffiche = useRef<BrouillonVmail[]>([]);
  vmailAffiche.current = vmailDrafts;
  const depuisMemoireRef = useRef(depuisMemoire);
  depuisMemoireRef.current = depuisMemoire;

  // Plus recente liste deja affichee (copie locale ou base), pour que la plus
  // ancienne des deux, si elle arrive en second, n'ecrase pas l'autre.
  const affichageLe = useRef(0);

  useEffect(() => {
    let actif = true;
    const montrer = (brouillons: Brouillon[], le: number) => {
      // Si la vraie liste est deja arrivee, aucune copie ne l'ecrase.
      if (!actif || reseauBrouillons.current || le <= affichageLe.current) return;
      affichageLe.current = le;
      setDrafts(brouillons);
      setDepuisMemoire(true);
    };
    void lireListeMemorisee<BrouillonVmail>(userId).then((m) => {
      if (!m) return;
      if (actif && !reseauVmail.current) setVmailDrafts(m.vmail);
      montrer(m.brouillons, m.enregistreLe);
    });
    // LISTE EN BASE — 16/09/2026. Seule source possible au premier passage sur
    // cet appareil ou apres une deconnexion (la copie locale est alors vide).
    // Une requete Supabase, sans appel a la messagerie.
    if (userId) {
      void lireListeBase().then((b) => {
        if (b) montrer(b.brouillons, b.enregistreLe);
      });
    }
    return () => {
      actif = false;
    };
  }, [userId]);

  const enregistrer = useCallback(() => {
    // Rien tant que la liste du FOURNISSEUR n'est pas arrivee : une copie sans
    // elle ecraserait la bonne par une liste vide.
    if (!reseauBrouillons.current) return;
    memoriserListe(userId, reseauBrouillons.current, reseauVmail.current ?? vmailAffiche.current);
  }, [userId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    setError(null);
    // Les brouillons Vmail, en base : rapides, et independants de la messagerie.
    // Un echec ici n'efface pas ceux du fournisseur, et reciproquement.
    void apiGet<{ ok?: boolean; drafts?: BrouillonVmail[] }>('/api/vmail-drafts')
      .then((j) => {
        if (!Array.isArray(j?.drafts)) {
          // Avant le 16/09 : liste videe EN SILENCE. On garde l'affichage et on le dit.
          console.error('[brouillons] /api/vmail-drafts : reponse invalide', j);
          return;
        }
        reseauVmail.current = j.drafts;
        setVmailDrafts(j.drafts);
        enregistrer();
      })
      .catch((e) => console.error('[brouillons] /api/vmail-drafts en echec', e));

    try {
      // Lecture partagee avec la page /brouillon/[id] (lib/cache-brouillons) :
      // elle remplit aussi le cache en memoire, corps compris.
      const liste = await chargerEnDirect();
      setDrafts(liste);
      setDepuisMemoire(false);
      reseauBrouillons.current = liste;
      enregistrer();
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : tx.unreachable);
      // Une liste de la derniere visite deja affichee RESTE (elle est annoncee
      // comme telle) ; sinon la liste est vide et la panne est dite.
      if (!depuisMemoireRef.current) setDrafts([]);
      memoriserBrouillons([]);
    } finally {
      setLoading(false);
    }
  }, [tx.unreachable, enregistrer]);

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
        data={failure && !depuisMemoire ? [] : visible}
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
            {depuisMemoire && loading && !failure ? (
              <Text style={styles.memoire} accessibilityRole="text">
                {sv.memoire}
              </Text>
            ) : null}
            {failure && depuisMemoire && visible.length > 0 ? (
              <View style={styles.rowWrap}>
                <Text style={styles.memoireEchec}>{sv.memoireSeule}</Text>
                <Text style={styles.failure}>{failure}</Text>
                <Pressable onPress={() => void reload()}>
                  <Text style={styles.retry}>{tx.retry}</Text>
                </Pressable>
              </View>
            ) : null}
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
          // Pas de destinataire : un « @ », pas les initiales de « Sans destinataire ».
          const initiales = to === tx.noRecipient ? '@' : senderInitials(to);
          // ⚠️ LA LIGNE OUVRE UNE PAGE — HA, 13/08 : Modifier, Envoyer et Supprimer
          // ne sont pas dans la liste. « Envoyer » fait partir un vrai mail et
          // « Supprimer » efface DEFINITIVEMENT chez le fournisseur.
          // Pleine largeur facon Gmail depuis le 16/09/2026 : `layout="ligne"`.
          // La pastille dit ce qu'on peut FAIRE (« Modifiable »), pas d'ou ca vient.
          return (
            <EmailRow
              layout="ligne"
              prefix={tx.to}
              sender={to}
              initials={initiales}
              prioColor="#5c554a"
              badge={d.vmail ? sv.modifiable : d.byVmail ? tx.byVmail : undefined}
              date={d.updatedAt ? formatDateCourte(d.updatedAt, intl) : undefined}
              subject={d.subject || t.common.noSubject}
              preview={cleanText(d.preview) || null}
              footnote={accounts.length > 1 ? d.accountEmail : undefined}
              onPress={() =>
                d.vmail
                  ? router.push({ pathname: '/nouveau', params: { draft: d.id } })
                  : router.push({ pathname: '/brouillon/[id]', params: { id: d.id } })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  memoire: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    paddingHorizontal: spacing.lg,
    marginTop: -6,
    marginBottom: spacing.sm,
  },
  memoireEchec: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    textAlign: 'center',
  },
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

  // Les styles de l'ancienne carte (card, metaRow, toLabel, to, badge, date,
  // subject, preview, account) sont partis le 16/09/2026 avec elle : la ligne
  // vit desormais dans components/email-row.tsx (`layout="ligne"`).

  // ⚠️ SUR FOND SOMBRE : `muted` y serait a 2,83:1 depuis le correctif du 12/08.
  // Le fond de page etant sombre, ce libelle prend le jeton prevu pour lui.
  empty: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.onDarkMuted, textAlign: 'center', marginTop: spacing.xl },
  emptyHint: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.hint, textAlign: 'center', marginTop: 6 },
  failure: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.danger, textAlign: 'center', marginTop: spacing.xl },
  retry: { fontFamily: fonts.sansSemibold, fontSize: 12.5, color: colors.terracotta, textAlign: 'center', marginTop: spacing.sm },
  error: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.danger, marginBottom: spacing.sm },
});
