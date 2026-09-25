import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';

import { useI18n } from '@/context/i18n';
import { colors, fonts } from '@/lib/theme';

/**
 * LE BOUTON « VMAIL IA » — 25/09/2026.
 *
 * Le symbole : une goutte de verre irisée animée (choix de HA du 25/09 soir,
 * après la bille orange « Aurore »). Il remplace la pilule « Assistant » et le
 * bouton « Actualiser ».
 *
 * CLARTÉ (demande de HA : « faut que ce soit clair sur ce que c'est ») :
 *   · le mot « Vmail IA » sous la bille (Accueil) — nom de marque, identique
 *     dans les 8 langues ;
 *   · une bulle d'explication les 3 premières fois, puis plus jamais.
 *
 * DESSIN : voir la note au-dessus de BilleVmailIA (animation WebP précalculée).
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
 * 25/09 soir — choix de HA : une goutte de verre irisée (violet, rose, cyan,
 * reflets blancs) qui ondule, d'après une image de référence qu'il a envoyée.
 * Ce vrai rendu 3D (verre qui réfracte la lumière) ne se dessine pas en direct
 * sur un téléphone : il a été calculé une fois, puis enregistré en animation
 * WebP (assets/images/vmail-ia.webp — 120 images, 15 par seconde, boucle de
 * 8 s, fond transparent, ~450 Ko). expo-image la joue en boucle.
 * La même animation sert au web (apps/web/public/vmail-ia.webp).
 *
 * La goutte occupe ~81,5 % du cadre (le reste = sa lueur) : le cadre déborde
 * donc de la taille demandée pour que la goutte fasse bien « taille » pixels.
 */
const ANIMATION = require('@/assets/images/vmail-ia.webp');
const PART_GOUTTE = 0.815;

export function BilleVmailIA({ taille = 38 }: { taille?: number }) {
  const cadre = Math.round(taille / PART_GOUTTE);
  const marge = (cadre - taille) / 2;
  return (
    <View style={{ width: taille, height: taille }} pointerEvents="none">
      <Image
        source={ANIMATION}
        style={{ position: 'absolute', left: -marge, top: -marge, width: cadre, height: cadre }}
        contentFit="contain"
        autoplay
        accessible={false}
      />
    </View>
  );
}

/**
 * « Vmail IA » sous la goutte — style « Irisée » choisi par HA le 25/09 : le texte
 * reprend les couleurs de la goutte (violet → rose → cyan). Dessiné en SVG car un
 * texte en dégradé n'existe pas en React Native de base. Même rendu que le web
 * (apps/web/src/components/bille-vmail-ia.tsx).
 */
function LibelleIrise() {
  const l = 58;
  const h = 15;
  return (
    <Svg width={l} height={h} style={styles.libelle} accessible={false}>
      <Defs>
        <LinearGradient id="vmia-iris" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#b38cff" />
          <Stop offset="0.5" stopColor="#ff7ad9" />
          <Stop offset="1" stopColor="#7fe6ff" />
        </LinearGradient>
      </Defs>
      <SvgText
        x={l / 2}
        y={11.5}
        textAnchor="middle"
        fontFamily={fonts.sansSemibold}
        fontSize={11}
        letterSpacing={0.1}
        fill="url(#vmia-iris)"
      >
        Vmail IA
      </SvgText>
    </Svg>
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
        {libelle ? <LibelleIrise /> : null}
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
  libelle: { marginTop: 4 },
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
