import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/i18n';
import type { EtatPremierImport } from '@/lib/premier-import';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Ce que montre l'app tant qu'aucun mail n'est arrivé — 22/09/2026.
 * Remplace le « ✓ Boîte à jour » qui mentait à un compte tout neuf (voir
 * `lib/premier-import.ts`). Le même bloc sert à l'Accueil et à l'onglet Emails.
 */
export function BlocPremierImport({
  etat,
  onConnecter,
}: {
  etat: EtatPremierImport;
  onConnecter: () => void;
}) {
  const { t } = useI18n();
  const p = t.premierImport;

  if (etat === 'sans-boite') {
    return (
      <View style={styles.bloc}>
        <Text style={styles.titre}>{p.sansBoiteTitre}</Text>
        <Text style={styles.texte}>{p.sansBoiteTexte}</Text>
        <Pressable
          style={({ pressed }) => [styles.bouton, pressed && styles.boutonAppuye]}
          onPress={onConnecter}
          accessibilityRole="button"
        >
          <Text style={styles.boutonTexte}>{t.sources.connectTitle}</Text>
        </Pressable>
      </View>
    );
  }

  if (etat === 'attente' || etat === 'trop-long') {
    return (
      <View style={styles.bloc} accessibilityLiveRegion="polite">
        {etat === 'attente' ? <ActivityIndicator color={colors.terracottaLight} style={styles.roue} /> : null}
        <Text style={styles.titre}>{p.titre}</Text>
        <Text style={styles.texte}>{etat === 'attente' ? p.texte : p.long}</Text>
      </View>
    );
  }

  // 'inconnu' : on vérifie encore s'il y a une boîte. Rien d'affirmé.
  if (etat === 'inconnu') {
    return (
      <View style={styles.bloc}>
        <ActivityIndicator color={colors.terracottaLight} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  bloc: { marginTop: spacing.xxl, alignItems: 'center', paddingHorizontal: spacing.xl },
  roue: { marginBottom: spacing.md },
  titre: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.onDark, textAlign: 'center' },
  texte: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
    maxWidth: 300,
  },
  bouton: {
    marginTop: spacing.lg,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: spacing.xl,
  },
  boutonAppuye: { opacity: 0.85 },
  boutonTexte: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.onDark },
});
