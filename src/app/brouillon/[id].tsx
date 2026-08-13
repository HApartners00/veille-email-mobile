import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { apiPost } from '@/lib/api';
import { bcp47 } from '@/lib/i18n';
import { formatDate, recipientsEmails, recipientsLabel } from '@/lib/mail-format';
import {
  lireBrouillon,
  oublierBrouillon,
  type Brouillon,
} from '@/lib/cache-brouillons';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconChevronLeft, IconDraft } from '@/components/icons';

/**
 * PAGE D'UN BROUILLON — 13/08/2026.
 *
 * Meme demande que pour les envois (HA : « meme logique pour les brouillons ») :
 * la liste ne fait plus que lister, tout se passe ici. Modifier, Envoyer et
 * Supprimer descendent dans cette page.
 *
 * ⚠️ « MODIFIER » N'EST PLUS UN BOUTON. L'editeur EST la page : on arrive dedans,
 * le texte est modifiable tout de suite. Un bouton « Modifier » qui ne fait que
 * rendre editable un champ deja a l'ecran ne decide de rien — c'est exactement
 * l'etape intermediaire retiree du brouillon de reponse le 12/08.
 *
 * ⚠️ ENVOYER ET SUPPRIMER ECRIVENT CHEZ LE FOURNISSEUR. Ils ne sont donc pas
 * dans la liste : on ne les voit qu'apres avoir ouvert un brouillon expres. La
 * suppression garde sa confirmation — contrairement a la corbeille des mails
 * recus, elle est DEFINITIVE chez le fournisseur, rien ne la rattrape.
 */
export default function PageBrouillon() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.drafts;

  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [chargement, setChargement] = useState(true);
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState<null | 'send' | 'delete'>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  useEffect(() => {
    let vivant = true;
    lireBrouillon(String(id))
      .then((b) => {
        if (!vivant) return;
        setBrouillon(b);
        setTexte(b?.body ?? '');
      })
      .catch((e) => {
        // RIEN EN SILENCE : si la messagerie est injoignable, on le dit, on ne
        // laisse pas une page vide faire croire a un brouillon disparu.
        if (vivant) setErreur(e instanceof Error && e.message ? e.message : tx.unreachable);
      })
      .finally(() => {
        if (vivant) setChargement(false);
      });
    return () => {
      vivant = false;
    };
  }, [id, tx.unreachable]);

  const agir = useCallback(
    async (op: 'send' | 'delete') => {
      if (occupe || !brouillon) return;
      if (op === 'send' && !texte.trim()) {
        setErreur(tx.errEmpty);
        return;
      }
      setOccupe(op);
      setErreur(null);
      try {
        await apiPost('/api/drafts', {
          op,
          id: brouillon.id,
          accountEmail: brouillon.accountEmail,
          provider: brouillon.provider,
          subject: brouillon.subject ?? '',
          body: texte,
          to: recipientsEmails(brouillon.recipients),
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        // Le brouillon n'existe plus chez le fournisseur : on le retire du cache
        // AVANT de revenir, sinon la liste le reafficherait le temps de relire.
        oublierBrouillon(brouillon.id);
        setConfirmer(false);
        router.back();
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : tx.errGeneric);
        setOccupe(null);
      }
    },
    [occupe, brouillon, texte, router, tx.errEmpty, tx.errGeneric],
  );

  const pour = brouillon ? recipientsLabel(brouillon.recipients, tx.noRecipient) : '';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          {brouillon?.byVmail ? (
            <View style={styles.badge}>
              <IconDraft size={12} color={colors.terracottaLight} />
              <Text style={styles.badgeText}>{tx.byVmail}</Text>
            </View>
          ) : null}
        </View>

        {brouillon ? (
          <View style={styles.hero}>
            <Text style={styles.subject}>{brouillon.subject || t.common.noSubject}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.to} numberOfLines={1}>
                {tx.to} {pour}
              </Text>
              {brouillon.updatedAt ? (
                <Text style={styles.date}>{formatDate(brouillon.updatedAt, intl)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {chargement ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      ) : !brouillon ? (
        <View style={styles.center}>
          <Text style={styles.vide}>{erreur ?? tx.empty}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Text style={styles.sectionLabel}>{tx.edit}</Text>
            <TextInput
              style={styles.editeur}
              value={texte}
              onChangeText={setTexte}
              multiline
              textAlignVertical="top"
              placeholder={tx.empty}
              placeholderTextColor={colors.hint}
            />
            <Text style={styles.compte}>{brouillon.accountEmail}</Text>
          </ScrollView>

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              style={[styles.cta, styles.flex1, (!!occupe || !texte.trim()) && styles.off]}
              onPress={() => void agir('send')}
              disabled={!!occupe || !texte.trim()}
            >
              {occupe === 'send' ? (
                <ActivityIndicator color={colors.onDark} />
              ) : (
                <Text style={styles.ctaText}>{tx.send}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.danger, !!occupe && styles.off]}
              onPress={() => setConfirmer(true)}
              disabled={!!occupe}
            >
              <Text style={styles.dangerText}>{tx.del}</Text>
            </Pressable>
          </View>

          {/* La suppression est DEFINITIVE chez le fournisseur : elle garde sa
              confirmation, contrairement a la corbeille d'un mail recu qui, elle,
              est reversible depuis le 09/08. */}
          <Modal
            visible={confirmer}
            transparent
            animationType="fade"
            onRequestClose={() => (occupe ? undefined : setConfirmer(false))}
          >
            <Pressable style={styles.overlay} onPress={() => (occupe ? undefined : setConfirmer(false))}>
              <Pressable style={styles.carte} onPress={() => {}}>
                <Text style={styles.carteTitre}>{tx.confirmDelete}</Text>
                <View style={styles.carteBtns}>
                  <Pressable
                    style={[styles.dangerPlein, styles.flex1, !!occupe && styles.off]}
                    onPress={() => void agir('delete')}
                    disabled={!!occupe}
                  >
                    {occupe === 'delete' ? (
                      <ActivityIndicator color={colors.cream} />
                    ) : (
                      <Text style={styles.dangerPleinText}>{tx.del}</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.annuler} onPress={() => setConfirmer(false)}>
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
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vide: { fontFamily: fonts.sans, color: colors.onDarkMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
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
  editeur: {
    fontFamily: fonts.sans,
    minHeight: 240,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink2,
    lineHeight: 22,
  },
  compte: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    marginTop: spacing.lg,
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
  danger: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 15 },

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
  carteTitre: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2, lineHeight: 20 },
  carteBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dangerPlein: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerPleinText: { fontFamily: fonts.sansBold, color: colors.cream, fontSize: 15 },
  annuler: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  annulerText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.muted },
});
