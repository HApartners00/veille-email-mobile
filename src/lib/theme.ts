/**
 * Système de design « S2 » partagé avec le web et le digest.
 * Sidebar/headers sombres (charbon) + contenu crème + accent terracotta.
 */
export const colors = {
  // Surfaces
  charcoal: '#211e19',
  charcoalSoft: '#2a251e',
  charline: '#37322b',
  cream: '#faf7f0',
  creamAlt: '#f3eee3',
  surface: '#ffffff',
  cardline: '#e4dcc9',
  line: '#e7e1d4',
  avatar: '#efe9da',

  // Texte
  ink: '#1a1a17',
  ink2: '#2a2a25',
  muted: '#857f70',
  hint: '#a8a291',
  onDark: '#faf7f0',
  onDarkMuted: 'rgba(250,247,240,0.66)',

  // Accents
  terracotta: '#c2410c',
  terracottaVivid: '#e85d0c',
  terracottaLight: '#e8956b',
  ocre: '#b8860b',
  taupe: '#4a443a',
  sage: '#3f7e58',
  danger: '#b8542e',
} as const;

/** Couleurs de priorité (alignées sur apps/web/src/lib/priority.ts). */
export const priorityColors: Record<string, string> = {
  urgent: '#c2410c',
  important: '#b8860b',
  human: '#4a443a',
  info: '#3f7e58',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Polices Playfair Display (chargées dans _layout via @expo-google-fonts). */
export const fonts = {
  serif: 'PlayfairDisplay_700Bold',
  serifItalic: 'PlayfairDisplay_700Bold_Italic',
  serifSemibold: 'PlayfairDisplay_600SemiBold',
} as const;
