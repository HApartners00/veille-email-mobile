import { StyleSheet, Text, type TextStyle } from 'react-native';

import { colors, fonts } from '@/lib/theme';

/**
 * Wordmark « Vmail » — reprise du logo de marque (veille-email-site/public/vmail-logo.png) :
 * un « V » crème droit, puis « mail » en italique orange dont seul le « ai » est éclairci
 * et nimbé de néon. Playfair Display est la SEULE police serif de l'app : elle est
 * réservée à ce logo (règle du web, packages/config/tailwind-preset.cjs).
 *
 * Avant : chaque écran recopiait `V<Text>mail</Text>` en police système, « mail » tout orange.
 */
export function LogoVmail({ size = 22, glow = true }: { size?: number; glow?: boolean }) {
  /**
   * ⚠️ LE HALO ETAIT COUPE NET EN BAS — constat de HA le 11/08/2026.
   *
   * Une ombre de texte est dessinee DANS la boite de la vue, pas au-dela : avec
   * `includeFontPadding: false` et aucune hauteur de ligne, la boite s'arrete a
   * la ligne de base, et le halo se fait trancher a l'horizontale. Ce n'est pas
   * l'ombre qui etait mal reglee, c'est la place qu'on lui laissait.
   *
   * On donne donc de la hauteur de ligne, et on adoucit le rayon : un halo plus
   * large qu'il n'a de place se coupera toujours, quel que soit le reglage.
   */
  const halo: TextStyle = glow
    ? { textShadowColor: 'rgba(240,106,24,0.55)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 9 }
    : {};
  return (
    <Text
      allowFontScaling={false}
      style={[styles.base, { fontSize: size, lineHeight: Math.round(size * 1.5) }]}
    >
      <Text style={styles.v}>V</Text>
      <Text style={styles.mail}>m</Text>
      <Text style={[styles.ai, halo]}>ai</Text>
      <Text style={styles.mail}>l</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
  v: { fontFamily: fonts.serif, color: colors.onDark },
  mail: { fontFamily: fonts.serifItalic, color: '#f06a18' },
  ai: { fontFamily: fonts.serifItalic, color: '#f5a06a' },
});

export default LogoVmail;
