import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { useI18n } from '@/context/i18n';
import { apiGet, apiPost } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { GMAIL_ENABLED } from '@/lib/flags';
import { imapMsg } from '@/lib/i18n/connexion-imap';
import { FOURNISSEURS_IMAP, LIBELLE_IMAP, type FournisseurImap } from '@/lib/imap';

type Mailbox = {
  email: string;
  // Texte libre, et non « gmail | outlook » : depuis le 06/10/2026 la liste porte aussi
  // les boîtes Yahoo et iCloud, et une app installée doit savoir afficher un fournisseur
  // qu'elle ne connaît pas encore (pastille neutre) plutôt que le prendre pour Outlook.
  provider: string;
  label: string;
};

/**
 * Ce que répond `/api/connect/list?famille=toutes`. `imap` est décidé par le SERVEUR
 * (même règle que la page « Sources » du web) : `visible` = montrer les boutons Yahoo et
 * iCloud ; `lecture_prete` = la relève de ces boîtes est livrée. Un serveur plus ancien
 * n'envoie pas `imap` : les boutons restent cachés.
 */
type ReponseListe = {
  mailboxes?: Mailbox[];
  imap?: { visible?: boolean; lecture_prete?: boolean };
};

/** Pastille de chaque fournisseur. Inconnu → `colors.muted`, jamais la couleur d'un autre. */
const PASTILLE: Record<string, string> = {
  gmail: '#ea4335',
  outlook: '#0f6cbd',
  yahoo: '#6001d2',
  icloud: '#1a1a17',
};
/** `hasOwnProperty` : sans lui, un fournisseur nommé « constructor » rendrait une fonction, pas une couleur. */
function couleurPastille(provider: string): string {
  return Object.prototype.hasOwnProperty.call(PASTILLE, provider) ? PASTILLE[provider]! : colors.muted;
}

export default function Sources() {
  const { t, f, locale } = useI18n();
  const router = useRouter();
  const ti = imapMsg[locale] ?? imapMsg.en;
  const providers = GMAIL_ENABLED ? t.sources.provBoth : t.sources.provOutlook;
  const authProviders = GMAIL_ENABLED ? t.sources.authBoth : t.sources.authOutlook;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  // clé d'identité d'une boîte = son adresse email

  // `true` = la dernière lecture a échoué. Distinct de « liste vide » : une panne qui
  // s'affiche « Aucune boîte connectée » fait croire au client que sa boîte a disparu.
  // (Avant le 06/10/2026, une lecture ratée vidait la liste, sans un mot.)
  const [panne, setPanne] = useState(false);
  const [imap, setImap] = useState({ visible: false, lecturePrete: false });
  // Deux lectures peuvent se croiser (retour sur l'écran + fin d'une connexion) : seule
  // la dernière lancée a le droit d'écrire.
  const derniereLecture = useRef(0);
  // Un deuxième appui sur « Connecter Yahoo » avant que l'écran ait changé empilerait deux
  // fois l'assistant. Remis à `false` chaque fois que cet écran redevient visible.
  const versAssistant = useRef(false);

  const loadMailboxes = useCallback(async () => {
    const moi = ++derniereLecture.current;
    try {
      // `famille=toutes` : cet écran est celui où l'on connecte une boîte, il montre donc
      // aussi les boîtes Yahoo et iCloud, que les écrans de mail ne lisent pas encore.
      const j = await apiGet<ReponseListe>('/api/connect/list?famille=toutes');
      if (!Array.isArray(j?.mailboxes)) throw new Error('réponse sans liste');
      if (moi !== derniereLecture.current) return;
      setMailboxes(j.mailboxes);
      // Champ absent = serveur plus ancien que l'app : les boutons restent cachés, et c'est
      // voulu. Mais on le note, sinon « je ne vois pas Yahoo » n'aurait aucune piste.
      if (j.imap === undefined) {
        console.warn('[sources] le serveur ne dit pas s’il faut proposer Yahoo et iCloud (champ « imap » absent) : boutons cachés');
      }
      setImap({ visible: j.imap?.visible === true, lecturePrete: j.imap?.lecture_prete === true });
      setPanne(false);
    } catch (e) {
      console.error('[sources] lecture de la liste des boîtes impossible', e);
      if (moi !== derniereLecture.current) return;
      // On GARDE la liste déjà affichée s'il y en a une : elle date, mais elle est vraie.
      setPanne(true);
    } finally {
      if (moi === derniereLecture.current) setLoadingList(false);
    }
  }, []);

  // Recharge à chaque fois que l'écran reprend le focus (ex. retour du navigateur OAuth).
  useFocusEffect(
    useCallback(() => {
      versAssistant.current = false;
      setLoadingList(true);
      loadMailboxes();
    }, [loadMailboxes]),
  );

  async function connect(provider: 'gmail' | 'outlook') {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>('/api/connect/start', { provider });
      // Session d'auth (et non simple navigateur) : la feuille se ferme toute
      // seule si la page de succès redirige vers veilleemailmobile://connected,
      // et l'utilisateur revient DANS l'app au lieu d'être abandonné dans le
      // navigateur. À défaut de redirection, il ferme la feuille → retour app.
      await WebBrowser.openAuthSessionAsync(url, 'veilleemailmobile://connected');
      // Au retour, recharge immédiate (le useFocusEffect couvre les autres cas).
      setLoadingList(true);
      loadMailboxes();
    } catch (e: any) {
      setError(e?.message || t.sources.connectErr);
    } finally {
      setBusy(null);
    }
  }

  // Yahoo et iCloud n'envoient pas chez un tiers pour dire « oui » : ils ouvrent un écran
  // de l'app, en trois étapes. Au retour, `useFocusEffect` relit la liste.
  function ouvrirAssistant(fournisseur: FournisseurImap) {
    if (versAssistant.current) return;
    versAssistant.current = true;
    setError(null);
    router.push({
      pathname: '/connecter-imap',
      params: { fournisseur, lecture: imap.lecturePrete ? '1' : '0' },
    });
  }

  function confirmDisconnect(mb: Mailbox) {
    Alert.alert(
      t.sources.disconnectTitle,
      f(t.sources.disconnectMsg, { email: mb.email }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.sources.disconnect,
          style: 'destructive',
          onPress: () => disconnect(mb),
        },
      ],
    );
  }

  async function disconnect(mb: Mailbox) {
    setDisconnecting(mb.email);
    setError(null);
    try {
      await apiPost('/api/connect/disconnect', { email: mb.email });
      setMailboxes((prev) => prev.filter((m) => m.email !== mb.email));
    } catch (e: any) {
      setError(e?.message || t.sources.disconnectErr);
      // APRÈS UN ÉCHEC, LA LISTE EST RELUE (06/10/2026). Le serveur déconnecte par adresse :
      // pour une boîte Yahoo ou iCloud il supprime sur place, puis passe par n8n si la même
      // adresse a aussi une boîte Gmail ou Outlook. Si ce deuxième temps échoue, l'écran
      // affiche une erreur alors que la première boîte est déjà partie : seule une
      // relecture dit ce qu'il reste vraiment. (Après un succès, rien ne change : la ligne
      // est retirée sur place, comme avant.)
      loadMailboxes();
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerShown: true,
          // Le titre de l'écran porte le nom de la ligne des Réglages qui y mène
          // (« Boîtes connectées »). Avant le 06/10/2026 l'écran s'appelait « Sources » :
          // on appuyait sur un nom, et on arrivait sous un autre.
          title: t.sources.connectedTitle,
          headerStyle: { backgroundColor: colors.charcoal },
          headerTintColor: colors.onDark,
          headerTitleStyle: { fontFamily: fonts.sansBold, color: colors.onDark },
          headerShadowVisible: false,
          // Une simple flèche. Sans ce réglage, l'iPhone écrit à côté le nom de l'écran d'où
          // l'on vient, et ce nom est un nom technique : « (tabs) » (vu le 06/10/2026).
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {/* Boîtes connectées — sans titre dans la carte : c'est déjà celui de l'écran, juste au-dessus. */}
      <View style={styles.card}>

        {panne && !loadingList ? (
          <View style={styles.panne}>
            <Text style={styles.panneTexte}>{ti.listeIllisible}</Text>
            <Pressable
              onPress={() => {
                setLoadingList(true);
                loadMailboxes();
              }}
              accessibilityRole="button"
              style={styles.panneBouton}
              hitSlop={8}
            >
              <Text style={styles.panneAction}>{ti.reessayer}</Text>
            </Pressable>
          </View>
        ) : null}

        {loadingList ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color={colors.terracotta} />
          </View>
        ) : mailboxes.length === 0 ? (
          // Lecture ratée et rien à montrer : le message de panne suffit. « Aucune boîte »
          // serait une affirmation qu'on ne peut pas faire.
          panne ? null : (
            <Text style={styles.cardText}>
              {imap.visible ? ti.aucuneBoite : f(t.sources.noneConnected, { providers })}
            </Text>
          )
        ) : (
          mailboxes.map((mb, rang) => (
            // Clé = fournisseur + adresse : une même adresse peut exister deux fois.
            // La première ligne n'a pas de trait au-dessus d'elle, sauf s'il y a le message
            // de panne à en séparer.
            <View
              key={`${mb.provider}:${mb.email}`}
              style={[styles.mbRow, rang === 0 && !panne && styles.mbRowPremiere]}
            >
              <View style={[styles.dot, { backgroundColor: couleurPastille(mb.provider) }]} />
              <View style={styles.mbInfo}>
                <Text style={styles.mbLabel} numberOfLines={1}>
                  {mb.email}
                </Text>
                <Text style={styles.mbEmail}>{mb.label}</Text>
              </View>
              {disconnecting === mb.email ? (
                <ActivityIndicator color={colors.danger} style={styles.mbAction} />
              ) : (
                <Pressable
                  style={styles.mbAction}
                  onPress={() => confirmDisconnect(mb)}
                  disabled={!!disconnecting}
                  hitSlop={8}
                >
                  <Text style={styles.mbActionText}>{t.sources.disconnect}</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      {/* Connexion d'une nouvelle boîte */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.sources.connectTitle}</Text>
        {/* « La connexion officielle Microsoft » n'est vraie que pour Gmail et Outlook :
            dès que Yahoo et iCloud sont proposés, la phrase devient neutre (comme sur le web). */}
        <Text style={styles.cardText}>
          {imap.visible ? ti.intro : f(t.sources.connectBody, { auth: authProviders })}
        </Text>

        {/* Bouton Gmail masqué au lancement (flag GMAIL_ENABLED). Réversible : voir src/lib/flags.ts. */}
        {GMAIL_ENABLED ? (
          <Pressable
            style={[styles.btn, styles.gmail, busy === 'gmail' && styles.btnDisabled]}
            onPress={() => connect('gmail')}
            disabled={!!busy}
          >
            {busy === 'gmail' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>{t.sources.connectGmail}</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.btn, styles.outlook, busy === 'outlook' && styles.btnDisabled]}
          onPress={() => connect('outlook')}
          disabled={!!busy}
        >
          {busy === 'outlook' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{t.sources.connectOutlook}</Text>
          )}
        </Pressable>

        {/* Yahoo et iCloud : montrés seulement si le SERVEUR le dit (`imap.visible`).
            Aujourd'hui : aux administrateurs. Le jour où le web ouvre son drapeau, ils
            apparaissent ici aussi, sans republier l'app. */}
        {imap.visible
          ? FOURNISSEURS_IMAP.map((fournisseur) => (
              <Pressable
                key={fournisseur}
                style={[styles.btn, fournisseur === 'yahoo' ? styles.yahoo : styles.icloud]}
                onPress={() => ouvrirAssistant(fournisseur)}
                disabled={!!busy}
                accessibilityRole="button"
              >
                <Text style={styles.btnText}>{ti.titre.replace('{nom}', LIBELLE_IMAP[fournisseur])}</Text>
              </Pressable>
            ))
          : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.note}>{t.sources.note}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.fond },
  content: { padding: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.ink },
  cardText: { fontFamily: fonts.sans, color: colors.ink2, fontSize: 14, lineHeight: 22 },
  listLoading: { paddingVertical: spacing.md, alignItems: 'flex-start' },
  // La liste n'a pas pu être lue (ce n'est pas « aucune boîte »).
  panne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.xs },
  panneTexte: { flexShrink: 1, fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: '#8a2f0b' },
  // Une cible d'au moins 44 de haut, même pour un simple mot souligné.
  panneBouton: { minHeight: 44, justifyContent: 'center' },
  panneAction: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },

  // Lignes de boîtes connectées
  mbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  mbRowPremiere: { borderTopWidth: 0, paddingTop: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, marginEnd: spacing.md },
  mbInfo: { flex: 1 },
  mbLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink },
  mbEmail: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 1 },
  mbAction: { paddingVertical: 4, paddingHorizontal: 4 },
  mbActionText: { fontFamily: fonts.sansSemibold, color: colors.danger, fontSize: 14 },

  btn: { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  gmail: { backgroundColor: '#ea4335' },
  outlook: { backgroundColor: '#0f6cbd' },
  yahoo: { backgroundColor: '#6001d2' },
  icloud: { backgroundColor: '#1a1a17' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fonts.sansBold, color: '#fff', fontSize: 15 },
  error: { fontFamily: fonts.sans, color: colors.danger, fontSize: 13 },
  note: { fontFamily: fonts.sans, color: colors.hint, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.xs },
});
