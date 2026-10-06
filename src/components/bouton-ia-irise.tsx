import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  LinearGradient as DegradeSvg,
  Path,
  Stop,
  Text as TexteSvg,
} from 'react-native-svg';

import { colors, fonts, radius } from '@/lib/theme';

/**
 * LE BOUTON « ÉCRIRE AVEC L'IA », IRISE — 06/10/2026, choix de HA.
 *
 * HA, le 06/10 : « le bouton ecrire avec l'ia est trop sombre et pas assez mis
 * en valeur ». Trois propositions lui ont ete montrees en image (orange plein,
 * irise, clair) ; il a choisi « 2, irise » : les couleurs de la goutte
 * « Vmail IA » (violet, rose, bleu), celles de `bouton-vmail-ia.tsx`. On
 * reconnait d'un coup d'oeil que c'est l'IA, et il ne concurrence pas l'orange
 * du bouton « Envoyer ».
 *
 * ⚠️ IL N'EST PLUS GRISE AU REPOS. L'ancien bouton passait a 40 % d'opacite
 * tant que la ligne de consigne etait vide — c'est surtout ca qui le rendait
 * sombre. C'est l'ecran qui decide quoi faire d'un appui sans consigne (il met
 * le curseur dans la ligne) ; ce composant, lui, reste toujours lisible.
 *
 * COMMENT LE TEXTE EST DEGRADE. React Native ne sait pas colorer un texte en
 * degrade. On pose donc le vrai texte, INVISIBLE, qui donne sa taille au
 * bouton dans les 8 langues ; puis on dessine le meme texte par-dessus en SVG,
 * rempli du degrade. Meme technique que le mot « Vmail IA » sous la goutte.
 * Tant que la taille n'est pas mesuree (une image), le texte n'est pas dessine.
 */

const IRIS = ['#b38cff', '#ff7ad9', '#7fe6ff'] as const;
const CORPS = 15;
/** Ou tombe la ligne de base du texte, en part de la hauteur de sa boite. */
const LIGNE_DE_BASE = 0.79;

function Degrade({ id }: { id: string }) {
  return (
    <Defs>
      <DegradeSvg id={id} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={IRIS[0]} />
        <Stop offset="0.5" stopColor={IRIS[1]} />
        <Stop offset="1" stopColor={IRIS[2]} />
      </DegradeSvg>
    </Defs>
  );
}

function Etoile() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" accessible={false}>
      <Degrade id="bia-etoile" />
      <Path
        fill="url(#bia-etoile)"
        d="M12 2l1.9 6.1c.3 1 1 1.7 2 2L22 12l-6.1 1.9c-1 .3-1.7 1-2 2L12 22l-1.9-6.1c-.3-1-1-1.7-2-2L2 12l6.1-1.9c1-.3 1.7-1 2-2z"
      />
      <Path
        fill="url(#bia-etoile)"
        d="M19 2l.7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7z"
      />
    </Svg>
  );
}

export default function BoutonIaIrise({
  libelle,
  onPress,
}: {
  libelle: string;
  onPress: () => void;
}) {
  const [boite, setBoite] = useState<{ l: number; h: number } | null>(null);

  const mesurer = (e: LayoutChangeEvent) => {
    const l = Math.ceil(e.nativeEvent.layout.width);
    const h = Math.ceil(e.nativeEvent.layout.height);
    // Meme taille qu'avant : on ne redessine pas pour rien.
    setBoite((avant) => (avant && avant.l === l && avant.h === h ? avant : { l, h }));
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      style={({ pressed }) => [styles.racine, pressed && styles.appuye]}
    >
      <LinearGradient colors={IRIS} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.contour}>
        <View style={styles.fond}>
          <Etoile />
          <View>
            {/* Le gabarit : invisible, il donne la taille. */}
            <Text style={styles.gabarit} numberOfLines={1} onLayout={mesurer} accessible={false}>
              {libelle}
            </Text>
            {boite ? (
              <Svg width={boite.l} height={boite.h} style={StyleSheet.absoluteFill} accessible={false}>
                <Degrade id="bia-texte" />
                <TexteSvg
                  x={boite.l / 2}
                  y={boite.h * LIGNE_DE_BASE}
                  textAnchor="middle"
                  fontFamily={fonts.sansBold}
                  fontSize={CORPS}
                  fill="url(#bia-texte)"
                >
                  {libelle}
                </TexteSvg>
              </Svg>
            ) : null}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // L'espace sous la ligne de consigne : le bouton ne colle plus au champ.
  racine: { marginTop: 10 },
  appuye: { opacity: 0.75 },
  // Le contour EST le degrade : 1,5 point de degrade depasse autour du fond.
  contour: { borderRadius: radius.sm, padding: 1.5 },
  fond: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.charcoalSoft,
    borderRadius: radius.sm - 1.5,
    // 12,5 + 1,5 de contour = la hauteur des autres boutons de l'ecran.
    paddingVertical: 12.5,
    paddingHorizontal: 14,
  },
  gabarit: { fontFamily: fonts.sansBold, fontSize: CORPS, opacity: 0 },
});
