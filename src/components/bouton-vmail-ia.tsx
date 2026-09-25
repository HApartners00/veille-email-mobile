import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { useI18n } from '@/context/i18n';
import { colors, fonts } from '@/lib/theme';

/**
 * LE BOUTON « VMAIL IA » — 25/09/2026.
 *
 * Choix de HA, après quatre séries de propositions : une bille de lumière façon
 * Apple (« B1 — Aurore ») : une bille orange où des voiles rose, violet et doré
 * tournent lentement, reflet de verre en haut, halo doux autour. Il remplace la
 * pilule « Assistant » et le bouton « Actualiser ».
 *
 * CLARTÉ (demande de HA : « faut que ce soit clair sur ce que c'est ») :
 *   · le mot « Vmail IA » sous la bille (Accueil) — nom de marque, identique
 *     dans les 8 langues ;
 *   · une bulle d'explication les 3 premières fois, puis plus jamais.
 *
 * DESSIN SANS FLOU. react-native-svg ne floute pas de façon fiable sur les deux
 * plateformes : les voiles sont des ellipses remplies d'un dégradé radial qui
 * s'efface vers le bord — le flou est dans le dégradé, pas dans un filtre.
 * Mouvement : deux calques tournent à des vitesses différentes (Reanimated, sur le
 * fil de l'interface). « Réduire les animations » activé : la bille reste fixe.
 */

type Dict = { titre: string; corps: string; aria: string };
const STR: Record<string, Dict> = {
  fr: { titre: 'Votre assistant IA', corps: "Posez-lui une question sur vos mails, à l'écrit ou à la voix.", aria: 'Vmail IA, votre assistant' },
  en: { titre: 'Your AI assistant', corps: 'Ask it anything about your emails, by typing or by voice.', aria: 'Vmail AI, your assistant' },
  es: { titre: 'Tu asistente de IA', corps: 'Hazle una pregunta sobre tus correos, por escrito o por voz.', aria: 'Vmail IA, tu asistente' },
  de: { titre: 'Ihr KI-Assistent', corps: 'Stellen Sie ihm eine Frage zu Ihren E-Mails, schriftlich oder per Stimme.', aria: 'Vmail KI, Ihr Assistent' },
  pt: { titre: 'O seu assistente de IA', corps: 'Faça-lhe uma pergunta sobre os seus emails, por escrito ou por voz.', aria: 'Vmail IA, o seu assistente' },
  it: { titre: 'Il tuo assistente IA', corps: 'Fagli una domanda sulle tue email, per iscritto o a voce.', aria: 'Vmail IA, il tuo assistente' },
  ar: { titre: 'مساعدك الذكي', corps: 'اطرح عليه سؤالًا عن رسائلك، كتابةً أو بالصوت.', aria: 'Vmail IA، مساعدك' },
  ru: { titre: 'Ваш ИИ-ассистент', corps: 'Задайте ему вопрос о ваших письмах — текстом или голосом.', aria: 'Vmail IA, ваш ассистент' },
};

const CLE_VUES = 'vmailia.presentation.vues';
const VUES_MAX = 3;

/**
 * La bille seule, animée. Réutilisable (Accueil, Emails).
 *
 * 25/09 soir, retour de HA sur téléphone : « je le veux animé et le halo plus
 * fondu ».
 *   · HALO : plus grand (2,6 × la bille) et un dégradé en 7 paliers qui s'éteint
 *     en douceur (courbe en cloche), au lieu de 2 paliers qui laissaient un
 *     disque sombre au bord. Il respire (taille + intensité).
 *   · MOUVEMENT : trois calques de couleur tournent à trois vitesses, dont un qui
 *     gonfle et dégonfle ; la bille entière respire un peu. Les taches sont
 *     décentrées, sinon la rotation ne se voit pas.
 *   · « RÉDUIRE LES ANIMATIONS » (iPhone) : avant, Reanimated coupait tout
 *     (réglage par défaut ReduceMotion.System) → bille figée. Maintenant elle
 *     bouge quand même, 2 × plus lentement et sans respiration de taille :
 *     c'est un petit mouvement de couleur, pas un déplacement à l'écran.
 */
const JAMAIS = { reduceMotion: ReduceMotion.Never } as const;

export function BilleVmailIA({ taille = 38 }: { taille?: number }) {
  const s = taille;
  const reduit = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);
  const g = useSharedValue(0);
  const p = useSharedValue(0);

  useEffect(() => {
    const k = reduit ? 2 : 1;
    const tour = (sv: typeof a, fin: number, ms: number) => {
      sv.value = withRepeat(withTiming(fin, { duration: ms * k, easing: Easing.linear, ...JAMAIS }), -1, false, undefined, ReduceMotion.Never);
    };
    const va = (sv: typeof a, ms: number) => {
      sv.value = withRepeat(withTiming(1, { duration: ms * k, easing: Easing.inOut(Easing.sin), ...JAMAIS }), -1, true, undefined, ReduceMotion.Never);
    };
    tour(a, 360, 7000);
    tour(b, -360, 5000);
    tour(c, 360, 11000);
    va(g, 3400);
    va(p, 2800);
  }, [reduit, a, b, c, g, p]);

  const rotA = useAnimatedStyle(() => ({ transform: [{ rotate: `${a.value}deg` }] }));
  const rotB = useAnimatedStyle(() => ({ transform: [{ rotate: `${b.value}deg` }] }));
  const rotC = useAnimatedStyle(() => ({ transform: [{ rotate: `${c.value}deg` }, { scale: 0.85 + 0.35 * g.value }] }));
  const souffle = useAnimatedStyle(() => ({ transform: [{ scale: reduit ? 1 : 1 + 0.035 * p.value }] }));
  const halo = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * p.value,
    transform: [{ scale: reduit ? 1 : 0.92 + 0.14 * p.value }],
  }));

  const h = s * 2.6;
  return (
    <View style={{ width: s, height: s }}>
      {/* Halo : courbe en cloche, aucun bord visible */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (s - h) / 2, top: (s - h) / 2, width: h, height: h }, halo]}>
        <Svg width={h} height={h}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ff7433" stopOpacity="0.9" />
              <Stop offset="0.3" stopColor="#ff7433" stopOpacity="0.8" />
              <Stop offset="0.4" stopColor="#ff7a36" stopOpacity="0.58" />
              <Stop offset="0.52" stopColor="#ff8a3d" stopOpacity="0.32" />
              <Stop offset="0.66" stopColor="#ff8a3d" stopOpacity="0.14" />
              <Stop offset="0.82" stopColor="#ff8a3d" stopOpacity="0.04" />
              <Stop offset="1" stopColor="#ff8a3d" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={h / 2} cy={h / 2} r={h / 2} fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {/* Bille : fond + trois calques de couleur qui tournent */}
      <Animated.View style={[{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden' }, souffle]}>
        <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="fond" cx="50%" cy="55%" r="55%">
              <Stop offset="0" stopColor="#ff8a3d" />
              <Stop offset="0.5" stopColor="#d9480f" />
              <Stop offset="1" stopColor="#4a1606" />
            </RadialGradient>
          </Defs>
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill="url(#fond)" />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, rotA]}>
          <Svg width={s} height={s}>
            <Defs>
              <RadialGradient id="rose" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ff3d7f" stopOpacity="1" />
                <Stop offset="0.55" stopColor="#ff3d7f" stopOpacity="0.45" />
                <Stop offset="1" stopColor="#ff3d7f" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx={s * 0.8} cy={s * 0.68} rx={s * 0.44} ry={s * 0.3} fill="url(#rose)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, rotB]}>
          <Svg width={s} height={s}>
            <Defs>
              <RadialGradient id="violet" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#8a63ff" stopOpacity="0.95" />
                <Stop offset="0.55" stopColor="#8a63ff" stopOpacity="0.4" />
                <Stop offset="1" stopColor="#8a63ff" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx={s * 0.76} cy={s * 0.22} rx={s * 0.4} ry={s * 0.24} fill="url(#violet)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, rotC]}>
          <Svg width={s} height={s}>
            <Defs>
              <RadialGradient id="or" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ffd27a" stopOpacity="0.95" />
                <Stop offset="0.55" stopColor="#ffc15a" stopOpacity="0.4" />
                <Stop offset="1" stopColor="#ffc15a" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="coeur" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#fff1e2" stopOpacity="0.7" />
                <Stop offset="1" stopColor="#fff1e2" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx={s * 0.24} cy={s * 0.34} rx={s * 0.38} ry={s * 0.26} fill="url(#or)" />
            <Circle cx={s * 0.42} cy={s * 0.6} r={s * 0.24} fill="url(#coeur)" />
          </Svg>
        </Animated.View>
        {/* Verre : reflet, bord assombri, liseré */}
        <Svg width={s} height={s} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="reflet" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
              <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="bord" cx="50%" cy="50%" r="50%">
              <Stop offset="0.62" stopColor="#140600" stopOpacity="0" />
              <Stop offset="1" stopColor="#140600" stopOpacity="0.3" />
            </RadialGradient>
          </Defs>
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill="url(#bord)" />
          <Ellipse cx={s * 0.37} cy={s * 0.22} rx={s * 0.3} ry={s * 0.17} fill="url(#reflet)" />
          <Circle cx={s / 2} cy={s / 2} r={s / 2 - 0.5} stroke="rgba(255,235,215,0.24)" strokeWidth={1} fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Le bouton complet : la bille, le mot « Vmail IA » dessous (option), et la bulle
 * d'explication les 3 premières fois (option). Ouvre l'écran de l'assistant.
 */
export default function BoutonVmailIA({
  taille = 38,
  libelle = true,
  presentation = true,
}: {
  taille?: number;
  libelle?: boolean;
  presentation?: boolean;
}) {
  const router = useRouter();
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const [bulle, setBulle] = useState(false);

  useEffect(() => {
    if (!presentation) return;
    let vivant = true;
    let minuterie: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        const vues = Number((await AsyncStorage.getItem(CLE_VUES)) || '0') || 0;
        if (!vivant || vues >= VUES_MAX) return;
        await AsyncStorage.setItem(CLE_VUES, String(vues + 1));
        setBulle(true);
        minuterie = setTimeout(() => vivant && setBulle(false), 8000);
      } catch (e) {
        // Mémoire locale illisible : pas de bulle plutôt qu'une bulle à chaque ouverture.
        console.warn('[Vmail IA] compteur de présentation illisible', e);
      }
    })();
    return () => {
      vivant = false;
      if (minuterie) clearTimeout(minuterie);
    };
  }, [presentation]);

  const ouvrir = () => {
    setBulle(false);
    router.push('/assistant');
  };

  return (
    <View style={styles.racine}>
      <Pressable
        onPress={ouvrir}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t.aria}
        style={styles.bouton}
      >
        <BilleVmailIA taille={taille} />
        {libelle ? <Text style={styles.libelle}>Vmail IA</Text> : null}
      </Pressable>
      {bulle ? (
        <Pressable onPress={() => setBulle(false)} style={[styles.bulle, { top: taille + (libelle ? 26 : 10) }]}>
          <View style={styles.pointe} />
          <Text style={styles.bulleTitre}>{t.titre}</Text>
          <Text style={styles.bulleCorps}>{t.corps}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { alignItems: 'flex-end', zIndex: 20, elevation: 20 },
  bouton: { alignItems: 'center' },
  libelle: {
    marginTop: 5,
    fontFamily: fonts.sansSemibold,
    fontSize: 10,
    letterSpacing: 0.2,
    color: colors.onDarkMuted,
  },
  bulle: {
    position: 'absolute',
    right: 0,
    width: 232,
    backgroundColor: colors.charcoalSoft,
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  pointe: {
    position: 'absolute',
    top: -6,
    right: 16,
    width: 11,
    height: 11,
    backgroundColor: colors.charcoalSoft,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.charline,
    transform: [{ rotate: '45deg' }],
  },
  bulleTitre: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.cream },
  bulleCorps: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17, color: colors.onDarkMuted, marginTop: 3 },
});
