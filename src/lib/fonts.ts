/**
 * Fichiers de police embarqués — chargés dans src/app/_layout.tsx (useFonts).
 *
 * Alignement sur la source de vérité du web (packages/config/tailwind-preset.cjs) :
 * Inter pour tout le texte, Playfair Display réservé au logo de marque.
 * Les noms de famille correspondants sont exposés par `fonts` dans src/lib/theme.ts.
 */
export const interFonts = {
  Inter_400Regular: require('../../assets/fonts/Inter_400Regular.ttf'),
  Inter_400Regular_Italic: require('../../assets/fonts/Inter_400Regular_Italic.ttf'),
  Inter_500Medium: require('../../assets/fonts/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('../../assets/fonts/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('../../assets/fonts/Inter_700Bold.ttf'),
  Inter_800ExtraBold: require('../../assets/fonts/Inter_800ExtraBold.ttf'),
};
