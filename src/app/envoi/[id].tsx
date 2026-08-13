import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import { cleanText, recipientsLabel } from '@/lib/mail-format';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconChevronLeft, IconSend } from '@/components/icons';
import { CorpsEnvoye } from '@/components/corps-envoye';

/**
 * PAGE D'UN MAIL ENVOYE — 13/08/2026.
 *
 * POURQUOI ELLE EXISTE. Dans l'onglet Envoyes, taper une carte la depliait sur
 * place, et « Renvoyer » / « Transferer » etaient poses sur CHAQUE carte de la
 * liste. HA : « qd ds envoyés on puisse vrmt cliquer sur un mail et qu'il s'ouvre
 * vraiment et montre vrmt le mail envoyé original. donc on enleve les boutons
 * renvoyer et transferer du mail et on les mets ds la page une fois le mail
 * clique ». La liste ne fait plus que lister ; tout se passe ici.
 *
 * ⚠️ CE N'EST PAS UN DETAIL D'ERGONOMIE. « Renvoyer » et « Transferer » ECRIVENT
 * dans la vraie boite du client et font partir un mail. Les laisser sur chaque
 * carte d'une liste dense, c'est la meme faute que celle deja corrigee le 08/08
 * pour Archiver et Corbeille : un effleurement de travers ne se rattrape pas.
 * Meme regle ici — on ne les voit qu'apres avoir ouvert un envoi expres.
 *
 * Le corps complet vient de `sent_items.content` via `/api/message-body`, sans
 * appel au fournisseur : ouvrir un envoi ne coute qu'une lecture en base.
 */

type Envoi = {
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

/**
 * Intitule de la section du corps. Meme dictionnaire local que `BODY_STR` dans
 * `app/email/[id].tsx` — 8 chaines ne justifient pas de toucher au dictionnaire
 * global. ⚠️ C'etait `tx.title` : le titre de l'ONGLET (« Emails envoyés »)
 * s'affichait au-dessus du corps du mail. Signale par HA sur capture.
 */
const CORPS_STR: Record<string, string> = {
  fr: 'Message',
  en: 'Message',
  es: 'Mensaje',
  de: 'Nachricht',
  pt: 'Mensagem',
  it: 'Messaggio',
  ar: 'الرسالة',
  ru: 'Сообщение',
};

const SELECT =
  'id, account_email, provider, subject, preview, recipients, url, has_attachments, sent_via_vmail, sent_at';

/** Meme forme que dans la liste : l'idempotence protege d'un double envoi. */
function nouvelleCleIdempotence(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function PageEnvoi() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, intl, locale } = useI18n();
  const tx = t.sent;

  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<null | 'transferer'>(null);
  const [destinataire, setDestinataire] = useState('');

  useEffect(() => {
    let vivant = true;
    (async () => {
      const { data, error } = await supabase
        .from('sent_items')
        .select(SELECT)
        .eq('id', String(id))
        .single();
      if (!vivant) return;
      // RIEN EN SILENCE : une requete refusee doit se voir, pas se traduire en
      // « aucun envoi ».
      if (error) setErreur(error.message);
      setEnvoi((data as Envoi) ?? null);
      setChargement(false);
    })();
    return () => {
      vivant = false;
    };
  }, [id]);

  const agir = useCallback(
    async (op: 'resend' | 'forward', to?: string[]) => {
      if (occupe || !envoi) return;
      setOccupe(true);
      setErreur(null);
      setAvis(null);
      try {
        await apiPost('/api/sent/resend', {
          id: envoi.id,
          op,
          to,
          idempotencyKey: nouvelleCleIdempotence(),
        });
        setAvis(op === 'resend' ? tx.doneResent : tx.doneForwarded);
        setFeuille(null);
        setDestinataire('');
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : tx.errGeneric);
      } finally {
        setOccupe(false);
      }
    },
    [occupe, envoi, tx.doneResent, tx.doneForwarded, tx.errGeneric],
  );

  function envoyerLeTransfert() {
    const liste = destinataire
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (liste.length === 0) {
      setErreur(tx.errAddress);
      return;
    }
    void agir('forward', liste);
  }

  const pour = envoi ? recipientsLabel(envoi.recipients, tx.noRecipient) : '';
  const quand = envoi
    ? new Date(envoi.sent_at).toLocaleString(intl, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Meme bandeau que la page d'un mail recu : `charcoalSoft` + filet, pour que
          les trois ecrans de lecture se ressemblent. */}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          {envoi?.sent_via_vmail ? (
            <View style={styles.badge}>
              <IconSend size={12} color={colors.terracottaLight} />
              <Text style={styles.badgeText}>{tx.viaVmail}</Text>
            </View>
          ) : null}
        </View>

        {envoi ? (
          <View style={styles.hero}>
            <Text style={styles.subject}>{envoi.subject || t.common.noSubject}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.to} numberOfLines={1}>
                {tx.to} {pour}
              </Text>
              <Text style={styles.date}>{quand}</Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {chargement ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      ) : !envoi ? (
        <View style={styles.center}>
          <Text style={styles.vide}>{tx.empty}</Text>
        </View>
      ) : (
        <>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.sectionLabel}>{CORPS_STR[locale] ?? CORPS_STR.en}</Text>
            <CorpsEnvoye
              sentId={envoi.id}
              apercu={cleanText(envoi.preview) || ''}
              locale={locale}
            />

            {envoi.has_attachments ? (
              <Text style={styles.pj}>{tx.withAttachments}</Text>
            ) : null}

            {envoi.url ? (
              <Pressable style={styles.lien} onPress={() => Linking.openURL(String(envoi.url))}>
                <Text style={styles.lienText}>{tx.openInMailbox}</Text>
              </Pressable>
            ) : null}

            <Text style={styles.compte}>{envoi.account_email}</Text>
          </ScrollView>

          {avis ? <Text style={styles.avis}>{avis}</Text> : null}
          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          {/* Barre fixe — memes gestes que la page d'un mail recu. */}
          <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              style={[styles.cta, styles.flex1, occupe && styles.off]}
              onPress={() => void agir('resend')}
              disabled={occupe}
            >
              {occupe && feuille === null ? (
                <ActivityIndicator color={colors.onDark} />
              ) : (
                <Text style={styles.ctaText}>{tx.resend}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.secondaire, styles.flex1, occupe && styles.off]}
              onPress={() => {
                setErreur(null);
                setFeuille('transferer');
              }}
              disabled={occupe}
            >
              <Text style={styles.secondaireText}>{tx.forward}</Text>
            </Pressable>
          </View>

          {/* Feuille « Transferer » — creme, comme les menus courts de la page mail. */}
          <Modal
            visible={feuille === 'transferer'}
            transparent
            animationType="fade"
            onRequestClose={() => setFeuille(null)}
          >
            <Pressable style={styles.overlay} onPress={() => setFeuille(null)}>
              <Pressable style={styles.carte} onPress={() => {}}>
                <Text style={styles.carteTitre}>{tx.forwardPrompt}</Text>
                <TextInput
                  style={styles.champ}
                  value={destinataire}
                  onChangeText={setDestinataire}
                  placeholder={tx.forwardPlaceholder}
                  placeholderTextColor={colors.hint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoFocus
                />
                <View style={styles.carteBtns}>
                  <Pressable
                    style={[styles.cta, styles.flex1, occupe && styles.off]}
                    onPress={envoyerLeTransfert}
                    disabled={occupe}
                  >
                    <Text style={styles.ctaText}>{occupe ? tx.working : tx.confirm}</Text>
                  </Pressable>
                  <Pressable style={styles.annuler} onPress={() => setFeuille(null)}>
                    <Text style={styles.annulerText}>{t.common.cancel}</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fond },
  safe: {
    backgroundColor: colors.charcoalSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.charline,
  },
  topbar: {
    backgroundColor: colors.charcoalSoft,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(234,225,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.terracottaLight,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: colors.terracottaLight,
  },
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  subject: {
    fontFamily: fonts.sansBold,
    fontSize: 23,
    color: colors.onDark,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  heroMeta: { marginTop: spacing.md },
  to: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: 'rgba(234,225,208,0.82)' },
  date: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(234,225,208,0.42)',
    marginTop: 3,
    textTransform: 'capitalize',
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vide: { fontFamily: fonts.sans, color: colors.onDarkMuted, fontSize: 15 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, paddingBottom: spacing.xl },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginBottom: spacing.sm,
  },
  pj: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.onDarkMuted, marginTop: spacing.lg },
  lien: { marginTop: spacing.lg },
  lienText: { fontFamily: fonts.sansSemibold, color: colors.terracottaLight, fontSize: 14 },
  compte: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    marginTop: spacing.xl,
  },

  avis: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.sage,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.charcoalSoft,
  },
  erreur: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.charcoalSoft,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.charcoalSoft,
    borderTopWidth: 1,
    borderTopColor: colors.charline,
  },
  flex1: { flex: 1 },
  off: { opacity: 0.4 },
  cta: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  // Bouton pose sur le fond sombre : contour clair, comme ailleurs dans l'app.
  secondaire: {
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.28)',
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaireText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,18,15,0.55)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  carte: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  carteTitre: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2 },
  champ: {
    fontFamily: fonts.sans,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.ink,
  },
  carteBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  annuler: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  annulerText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.muted },
});
