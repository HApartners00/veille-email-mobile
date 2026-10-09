import { type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { Extrapolation, interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { IconArchive, IconTrash, IconUndo } from '@/components/icons';
import { fonts, spacing } from '@/lib/theme';
import type { OpBoite } from '@/lib/actions-groupees';

/**
 * GLISSER UN MAIL POUR L'ARCHIVER OU LE METTRE À LA CORBEILLE — 09/10/2026.
 *
 * Choix de HA : glisser vers la GAUCHE = corbeille (rouge), vers la DROITE = archiver
 * (vert). Glisser jusqu'au bout fait l'action TOUT DE SUITE ; une bannière « Annuler »
 * la rattrape (c'est l'écran qui la montre, pas ce composant).
 *
 * « JUSQU'AU BOUT » : le panneau d'action fait toute la largeur de l'écran. Relâché
 * au-delà de 35 % de la largeur, la ligne part jusqu'au bout et l'action est lancée ;
 * en deçà, elle revient à sa place et rien ne se passe.
 *
 * Le sens est lu sur `SwipeDirection` de react-native-gesture-handler 2.28 : RIGHT =
 * la ligne est partie vers la droite (vérifié dans son code : `toValue > 0`).
 *
 * Ce composant ne parle à PERSONNE : il dit seulement « on a glissé à droite / à
 * gauche ». L'écran appelle `/api/mail-action`, retire la ligne, montre « Annuler »,
 * et la remet si l'action échoue.
 */

/** Rouge et vert des deux gestes. Le rouge est plus froid que le terracotta de la marque,
 *  pour qu'on ne confonde pas « supprimer » avec un bouton ordinaire. */
export const VERT_GLISSER = '#2c7a54';
export const ROUGE_GLISSER = '#b4321f';

const SEUIL = 0.35;

/**
 * FIN DU MOUVEMENT PLUS TÔT — 09/10/2026, retour de HA : « le message pour annuler vient
 * 2 s après, c'est trop long ».
 *
 * `onSwipeableOpen` n'est appelé que quand le ressort de react-native-gesture-handler
 * 2.28 est « arrivé ». Avec son réglage (masse 2, raideur 700) et le seuil d'arrêt par
 * défaut de Reanimated 4.1 (énergie 6e-9), c'est ~650 ms après qu'on a lâché, alors que
 * la ligne est déjà au bord depuis longtemps. Avec un seuil à 1e-4, c'est ~350-380 ms ;
 * il reste alors moins de 2 px à parcourir (la ligne est hors de l'écran). Calcul refait
 * avec les formules de Reanimated 4.1.7 (springUtils.ts), pas mesuré sur un téléphone.
 * Le même réglage vaut pour le retour en place (lâché trop tôt) : < 2 px sautés à la fin.
 */
const RESSORT = { energyThreshold: 1e-4 };

export type ActionGlisser = { op: OpBoite; libelle: string };

function iconeDe(op: OpBoite) {
  if (op === 'trash') return IconTrash;
  if (op === 'archive') return IconArchive;
  return IconUndo; // remettre en boîte, restaurer, non indésirable
}

function Panneau({
  action,
  cote,
  translation,
  largeur,
}: {
  action: ActionGlisser;
  cote: 'gauche' | 'droite';
  translation: SharedValue<number>;
  largeur: number;
}) {
  const Icone = iconeDe(action.op);
  // L'icône grossit un peu en approchant du seuil : on SENT quand l'action va partir.
  const anime = useAnimatedStyle(() => {
    const d = Math.abs(translation.value);
    const s = interpolate(d, [0, largeur * SEUIL], [0.8, 1.1], Extrapolation.CLAMP);
    return { transform: [{ scale: s }] };
  });
  return (
    <View
      style={[
        st.panneau,
        { width: largeur, backgroundColor: action.op === 'trash' ? ROUGE_GLISSER : VERT_GLISSER },
        cote === 'gauche' ? st.versGauche : st.versDroite,
      ]}
    >
      <Reanimated.View style={[st.contenu, anime]}>
        <Icone size={22} color="#fff" />
        <Text style={st.libelle}>{action.libelle}</Text>
      </Reanimated.View>
    </View>
  );
}

export function LigneGlissable({
  children,
  droite,
  gauche,
  actif = true,
  onAction,
}: {
  children: ReactNode;
  /** Glisser vers la droite (panneau vert à gauche). `null` = pas de geste de ce côté. */
  droite: ActionGlisser | null;
  /** Glisser vers la gauche (panneau rouge à droite). */
  gauche: ActionGlisser | null;
  /** Faux pendant la sélection multiple : on coche, on ne glisse pas. */
  actif?: boolean;
  onAction: (op: OpBoite) => void;
}) {
  const { width } = useWindowDimensions();
  if (!droite && !gauche) return <>{children}</>;
  return (
    // `enabled` plutôt que retirer le composant pendant une sélection (09/10/2026) :
    // le retirer démontait et remontait TOUTES les lignes à l'entrée et à la sortie de
    // la sélection.
    <ReanimatedSwipeable
      enabled={actif}
      animationOptions={RESSORT}
      friction={1}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={width * SEUIL}
      rightThreshold={width * SEUIL}
      dragOffsetFromLeftEdge={12}
      dragOffsetFromRightEdge={12}
      renderLeftActions={
        droite ? (_p, translation) => <Panneau action={droite} cote="gauche" translation={translation} largeur={width} /> : undefined
      }
      renderRightActions={
        gauche ? (_p, translation) => <Panneau action={gauche} cote="droite" translation={translation} largeur={width} /> : undefined
      }
      onSwipeableOpen={(sens) => {
        if (sens === SwipeDirection.RIGHT && droite) onAction(droite.op);
        else if (sens === SwipeDirection.LEFT && gauche) onAction(gauche.op);
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const st = StyleSheet.create({
  panneau: { justifyContent: 'center' },
  versGauche: { alignItems: 'flex-start', paddingLeft: spacing.xl },
  versDroite: { alignItems: 'flex-end', paddingRight: spacing.xl },
  contenu: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  libelle: { fontFamily: fonts.sansSemibold, fontSize: 15, color: '#fff' },
});
