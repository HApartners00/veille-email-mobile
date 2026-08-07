import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

const DEF = colors.ink;

/** Accueil - maison. */
export function IconHome({ size = 24, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 11.5 12 4l8 7.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 10v9.5h12V10"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Feed - liste. */
export function IconFeed({ size = 24, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={8} y1={6} x2={20} y2={6} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={8} y1={12} x2={20} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={8} y1={18} x2={20} y2={18} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={4} cy={6} r={1.4} fill={color} />
      <Circle cx={4} cy={12} r={1.4} fill={color} />
      <Circle cx={4} cy={18} r={1.4} fill={color} />
    </Svg>
  );
}

/** Sources / boites - enveloppe. */
export function IconMail({ size = 24, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={5.5} width={18} height={13} rx={2} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M4 7l8 6 8-6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Regles - drapeau. */
export function IconFlag({ size = 24, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 21V4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 4.5h11l-2.5 3.5L17 11.5H6"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Reglages - curseurs. */
export function IconSliders({ size = 24, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={4} y1={8} x2={20} y2={8} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={4} y1={16} x2={20} y2={16} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={9} cy={8} r={2.6} fill={colors.cream} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={15} cy={16} r={2.6} fill={colors.cream} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** Fermer - croix. */
export function IconClose({ size = 20, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={6} y1={6} x2={18} y2={18} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={18} y1={6} x2={6} y2={18} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Etincelle (adapte au style). */
export function IconSparkle({ size = 16, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"
        stroke={color}
        strokeWidth={strokeWidth - 0.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Moins. */
export function IconMinus({ size = 22, color = DEF, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={5} y1={12} x2={19} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Plus. */
export function IconPlus({ size = 22, color = DEF, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1={5} y1={12} x2={19} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Line x1={12} y1={5} x2={12} y2={19} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Chevron droit. */
export function IconChevronRight({ size = 18, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="9 5 16 12 9 19"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Chevron bas. */
export function IconChevronDown({ size = 14, color = colors.muted, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="6 9 12 15 18 9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Coche. */
export function IconCheck({ size = 18, color = colors.terracotta, strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="5 12 10 17 20 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Actualiser - fleche circulaire. */
export function IconRefresh({ size = 16, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 11a8 8 0 1 0-.6 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline
        points="20 4 20 11 13 11"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Chevron gauche (retour). */
export function IconChevronLeft({ size = 20, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polyline
        points="15 6 9 12 15 18"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Reponse suggeree - stylo + etincelle (option B). */
export function IconReplySuggested({ size = 18, color = DEF, strokeWidth = 1.5 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 21l1-3.5L13.5 8l2.5 2.5L6.5 20 3 21z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M18.4 3l.65 1.75L20.8 5.4l-1.75.65L18.4 7.8l-.65-1.75L16 5.4l1.75-.65z"
        stroke={color}
        strokeWidth={strokeWidth - 0.35}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Paper plane - envoyer. */
export function IconSend({ size = 18, color = DEF, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 12L20 5l-6.5 15-2.6-6z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Recherche - loupe au trait. */
export function IconSearch({ size = 18, color = DEF, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M20 20l-3.4-3.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Boite de reception (filtre par boite). */
export function IconInbox({ size = 18, color = DEF, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 13l3-7h12l3 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d="M3 13h5l1.4 2.2h5.2L20 13"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Cloche - notifications. */
export function IconBell({ size = 18, color = DEF, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.4 5 1.9 6H4.6c.5-1 1.9-2 1.9-6z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M10 19.5a2 2 0 0 0 4 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** Horloge - rapport quotidien. */
export function IconClock({ size = 18, color = DEF, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 7.5V12l3 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Globe - langue. */
export function IconGlobe({ size = 18, color = DEF, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3.5 12h17" stroke={color} strokeWidth={strokeWidth - 0.2} />
      <Path
        d="M12 3.5c2.4 2.5 2.4 14.5 0 17M12 3.5c-2.4 2.5-2.4 14.5 0 17"
        stroke={color}
        strokeWidth={strokeWidth - 0.2}
      />
    </Svg>
  );
}

/** Etoile - abonnement. */
export function IconStar({ size = 18, color = DEF, strokeWidth = 1.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.6l2.5 5.1 5.6.8-4.05 3.95.96 5.55L12 16.4l-5.06 2.6.96-5.55L3.85 9.5l5.6-.8z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Entonnoir - regles de tri. */
export function IconFunnel({ size = 18, color = DEF, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6h16l-6 7v5l-4 2v-7z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Trombone - pieces jointes. */
export function IconPaperclip({ size = 18, color = DEF, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1L13.9 4.4a3.3 3.3 0 0 1 4.7 4.7L9.9 17.8a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
