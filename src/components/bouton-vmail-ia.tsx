import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
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

/** La bille seule, animée. Réutilisable (Accueil, Emails). */
export function BilleVmailIA({ taille = 38 }: { taille?: number }) {
  const s = taille;
  const reduit = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const p = useSharedValue(0);

  useEffect(() => {
    if (reduit) return;
    a.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    b.value = withRepeat(withTiming(-360, { duration: 9000, easing: Easing.linear }), -1, false);
    p.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduit, a, b, p]);

  const rotA = useAnimatedStyle(() => ({ transform: [{ rotate: `${a.value}deg` }] }));
  const rotB = useAnimatedStyle(() => ({ transform: [{ rotate: `${b.value}deg` }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.45 + 0.2 * p.value }));

  const h = s * 1.8;
  return (
    <View style={{ width: s, height: s }}>
      {/* Halo */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (s - h) / 2, top: (s - h) / 2 }, halo]}>
        <Svg width={h} height={h}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0.45" stopColor="#ff6a2a" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#ff6a2a" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={h / 2} cy={h / 2} r={h / 2} fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {/* Bille : fond + deux calques de voiles qui tournent */}
      <View style={{ width: s, height: s, borderRadius: s / 2, overflow: 'hidden' }}>
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
                <Stop offset="0" stopColor="#ff4f8b" stopOpacity="0.95" />
                <Stop offset="1" stopColor="#ff4f8b" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="or" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ffc15a" stopOpacity="0.9" />
                <Stop offset="1" stopColor="#ffc15a" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx={s * 0.74} cy={s * 0.62} rx={s * 0.42} ry={s * 0.3} fill="url(#rose)" />
            <Ellipse cx={s * 0.3} cy={s * 0.28} rx={s * 0.4} ry={s * 0.26} fill="url(#or)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, rotB]}>
          <Svg width={s} height={s}>
            <Defs>
              <RadialGradient id="violet" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#8a63ff" stopOpacity="0.85" />
                <Stop offset="1" stopColor="#8a63ff" stopOpacity="0" />
              </RadialGradient>
              <RadialGradient id="coeur" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ffecd7" stopOpacity="0.6" />
                <Stop offset="1" stopColor="#ffecd7" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx={s * 0.72} cy={s * 0.28} rx={s * 0.36} ry={s * 0.22} fill="url(#violet)" />
            <Circle cx={s * 0.5} cy={s * 0.55} r={s * 0.28} fill="url(#coeur)" />
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
              <Stop offset="1" stopColor="#140600" stopOpacity="0.55" />
            </RadialGradient>
          </Defs>
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill="url(#bord)" />
          <Ellipse cx={s * 0.37} cy={s * 0.22} rx={s * 0.3} ry={s * 0.17} fill="url(#reflet)" />
          <Circle cx={s / 2} cy={s / 2} r={s / 2 - 0.5} stroke="rgba(255,235,215,0.24)" strokeWidth={1} fill="none" />
        </Svg>
      </View>
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
