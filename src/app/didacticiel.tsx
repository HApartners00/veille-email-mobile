import { useCallback, useRef, useState } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { IconMic, IconSend, IconSparkle } from '@/components/icons';
import { useI18n } from '@/context/i18n';
import { marquerDidacticielVu } from '@/lib/didacticiel';
import { colors, fonts, radius, spacing } from '@/lib/theme';

// ─────────────────────────────────────────────────────────────────────────────
// DIDACTICIEL D'ACCUEIL — 21/09/2026
//
// CINQ ECRANS PLEINE PAGE, choix de HA : pas de bulles posees sur l'interface
// (elles se decalent des que la mise en page bouge, et on les lit en diagonale),
// pas de page unique (cinq idees empilees, on n'en retient aucune).
//
// L'ORDRE N'EST PAS DECORATIF :
//   1. le tri en 4 — c'est ce qui distingue Vmail au premier coup d'oeil ;
//   2. le resume — ce qu'on gagne sur CHAQUE email ;
//   3. le brouillon — ce qu'on gagne quand il faut repondre ;
//   4. la voix — la nouveaute de la 1.2.0 ;
//   5. le reclassement — l'outil apprend de vous (ecran ajoute par HA).
//
// « Passer » est visible EN PERMANENCE, sur les cinq ecrans. Un didacticiel
// dont on ne peut pas sortir est une porte fermee, pas un accueil.
//
// ⚠️ LES ILLUSTRATIONS SONT DESSINEES EN VUES, PAS EN IMAGES. Trois raisons :
// elles suivent la langue et le sens d'ecriture, elles ne pesent rien dans le
// paquet, et elles restent JS pur — donc publiables par `eas update`, sans
// nouveau build.
//
// ⚠️ NON VERIFIE SUR APPAREIL : le defilement pagine en arabe (RTL). React
// Native inverse lui-meme les ScrollView horizontales, et `contentOffset.x`
// reste croissant dans l'ordre logique — c'est le comportement documente, pas
// une mesure faite ici. A regarder sur un vrai iPhone en arabe.
// ─────────────────────────────────────────────────────────────────────────────

/** Teintes de categories eclaircies pour le fond sombre (comme l'Accueil). */
const TEINTES = {
  urgent: '#e08a5a',
  important: '#d5b06a',
  human: '#9aa6ac',
  info: '#a7b199',
} as const;

const TRAIT = 'rgba(234,225,208,0.14)';
const CARTE = 'rgba(234,225,208,0.055)';

/** Barre grise qui figure une ligne de texte dans les maquettes. */
function Barre({ w, h = 7, o = 0.3 }: { w: number | string; h?: number; o?: number }) {
  return (
    <View
      style={{
        width: w as number,
        height: h,
        borderRadius: h / 2,
        backgroundColor: `rgba(234,225,208,${o})`,
      }}
    />
  );
}

/** Une ligne d'email : filet de couleur, objet, expediteur. */
function LigneMail({
  couleur,
  largeurs,
  attenue = false,
}: {
  couleur: string;
  largeurs: [number, number];
  attenue?: boolean;
}) {
  return (
    <View style={[styles.ligneMail, attenue && styles.ligneAttenuee]}>
      <View style={[styles.filet, { backgroundColor: couleur }]} />
      <View style={styles.ligneTextes}>
        <Barre w={largeurs[0]} h={8} o={attenue ? 0.16 : 0.42} />
        <Barre w={largeurs[1]} h={6} o={attenue ? 0.1 : 0.22} />
      </View>
    </View>
  );
}

// ─── ECRAN 1 : le tri en quatre ──────────────────────────────────────────────
function VisuelTri() {
  return (
    <View style={styles.visuel}>
      <View style={styles.pile}>
        <LigneMail couleur={TEINTES.urgent} largeurs={[132, 78]} />
        <LigneMail couleur={TEINTES.important} largeurs={[108, 92]} />
        <LigneMail couleur={TEINTES.human} largeurs={[146, 64]} />
        <LigneMail couleur={TEINTES.info} largeurs={[96, 84]} />
      </View>
      {/* La publicite, mise de cote : decalee, en pointilles, effacee. */}
      <View style={styles.pubWrap}>
        <View style={styles.pub}>
          <Barre w={86} h={6} o={0.16} />
        </View>
      </View>
    </View>
  );
}

// ─── ECRAN 2 : le resume avant le mail ───────────────────────────────────────
function VisuelResume() {
  return (
    <View style={styles.visuel}>
      <View style={styles.carte}>
        <View style={styles.carteEntete}>
          <IconSparkle size={14} color={colors.terracottaLight} />
          <Barre w={62} h={6} o={0.34} />
        </View>
        <View style={styles.carteLignes}>
          <Barre w={196} o={0.4} />
          <Barre w={176} o={0.4} />
          <Barre w={118} o={0.4} />
        </View>
      </View>
      {/* Le mail lui-meme, en dessous, qu'on n'a pas eu besoin d'ouvrir. */}
      <View style={styles.dessous}>
        <Barre w={210} h={5} o={0.09} />
        <Barre w={188} h={5} o={0.09} />
        <Barre w={200} h={5} o={0.09} />
        <Barre w={140} h={5} o={0.09} />
      </View>
    </View>
  );
}

// ─── ECRAN 3 : le brouillon de reponse ───────────────────────────────────────
function VisuelBrouillon() {
  return (
    <View style={styles.visuel}>
      <View style={styles.carte}>
        <View style={styles.carteLignes}>
          <Barre w={204} o={0.42} />
          <Barre w={186} o={0.42} />
          <Barre w={212} o={0.42} />
          <Barre w={96} o={0.42} />
        </View>
        <View style={styles.curseurLigne}>
          <Barre w={58} o={0.42} />
          <View style={styles.curseur} />
        </View>
      </View>
      <View style={styles.boutonFactice}>
        <IconSend size={15} color={colors.onDark} />
        <View style={styles.boutonBarre} />
      </View>
    </View>
  );
}

// ─── ECRAN 4 : l'assistant vocal ─────────────────────────────────────────────
function VisuelVoix() {
  const barres = [14, 26, 38, 52, 34, 22, 44, 30, 18];
  return (
    <View style={styles.visuel}>
      <View style={styles.halo2}>
        <View style={styles.halo1}>
          <View style={styles.pastilleMicro}>
            <IconMic size={26} color={colors.onDark} />
          </View>
        </View>
      </View>
      <View style={styles.onde}>
        {barres.map((h, i) => (
          <View
            key={i}
            style={{
              width: 4,
              height: h,
              borderRadius: 2,
              backgroundColor: `rgba(232,149,107,${0.28 + (h / 52) * 0.55})`,
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─── ECRAN 5 : reclasser, et il apprend ──────────────────────────────────────
function VisuelReclasser({ labelAvant, labelApres }: { labelAvant: string; labelApres: string }) {
  return (
    <View style={styles.visuel}>
      <LigneMail couleur={TEINTES.info} largeurs={[128, 74]} />
      <View style={styles.pucesRow}>
        <View style={[styles.puce, styles.puceEteinte]}>
          <Text style={[styles.puceTexte, { color: 'rgba(234,225,208,0.38)' }]} numberOfLines={1}>
            {labelAvant}
          </Text>
        </View>
        <Text style={styles.fleche}>{I18nManager.isRTL ? '←' : '→'}</Text>
        <View style={[styles.puce, styles.puceActive]}>
          <Text style={[styles.puceTexte, { color: colors.charcoal }]} numberOfLines={1}>
            {labelApres}
          </Text>
        </View>
      </View>
      <LigneMail couleur={TEINTES.important} largeurs={[128, 74]} />
    </View>
  );
}

export default function Didacticiel() {
  const router = useRouter();
  const { t, f } = useI18n();
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const [sortie, setSortie] = useState(false);

  const ecrans = [
    { titre: t.tour.s1Title, corps: t.tour.s1Body, visuel: <VisuelTri /> },
    { titre: t.tour.s2Title, corps: t.tour.s2Body, visuel: <VisuelResume /> },
    { titre: t.tour.s3Title, corps: t.tour.s3Body, visuel: <VisuelBrouillon /> },
    { titre: t.tour.s4Title, corps: t.tour.s4Body, visuel: <VisuelVoix /> },
    {
      titre: t.tour.s5Title,
      corps: t.tour.s5Body,
      visuel: <VisuelReclasser labelAvant={t.prio.info} labelApres={t.prio.important} />,
    },
  ];
  const dernier = page >= ecrans.length - 1;

  // Sortie — « Passer » comme « Commencer » passent par ici. Le marquage est
  // tente, et son echec n'empeche JAMAIS de sortir : au pire le didacticiel se
  // remontrera, ce qui est moins grave que de rester coince dedans.
  const sortir = useCallback(async () => {
    if (sortie) return;
    setSortie(true);
    await marquerDidacticielVu();
    // RETOUR, PAS REMPLACEMENT. Le didacticiel est toujours POUSSE par-dessus
    // quelque chose : les onglets (premiere ouverture) ou les Reglages (« Revoir
    // le didacticiel »). `back()` y revient sans remonter les onglets — un
    // `replace` en creait une deuxieme instance, qui redemandait au serveur
    // « deja vu ? » et pouvait relancer l'ecran si le marquage avait echoue.
    // Seul cas sans historique : un lien direct vers /didacticiel.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/accueil');
  }, [router, sortie]);

  const suivant = useCallback(() => {
    if (dernier) {
      void sortir();
      return;
    }
    const cible = page + 1;
    setPage(cible);
    scroll.current?.scrollTo({ x: cible * width, animated: true });
  }, [dernier, page, sortir, width]);

  const onFinDeGlisse = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    if (i !== page) setPage(Math.min(Math.max(i, 0), ecrans.length - 1));
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />

      {/* Halo terracotta — le meme que l'ecran de connexion. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="haloTour" cx="50%" cy="16%" rx="72%" ry="44%">
              <Stop offset="0%" stopColor="#e85d0c" stopOpacity="0.15" />
              <Stop offset="55%" stopColor="#e85d0c" stopOpacity="0.035" />
              <Stop offset="100%" stopColor="#e85d0c" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#haloTour)" />
        </Svg>
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* « Passer », sur les cinq ecrans, tout le temps. */}
        <View style={styles.barreHaute}>
          <Text style={styles.compteur}>
            {f(t.tour.step, { i: page + 1, n: ecrans.length })}
          </Text>
          <Pressable onPress={sortir} hitSlop={14} disabled={sortie}>
            <Text style={styles.passer}>{t.tour.skip}</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onFinDeGlisse}
          style={styles.pages}
        >
          {ecrans.map((e, i) => (
            <View key={i} style={[styles.page, { width }]}>
              {/* ⚠️ DEUX ZONES, PAS UN BLOC CENTRE — corrige apres capture du
                  21/09. Centrer « visuel + titre + texte » d'un seul bloc
                  faisait SAUTER le titre de 30 px d'un ecran a l'autre, selon
                  que le titre tenait sur une ligne ou deux. Le visuel prend
                  l'espace libre ; le texte a une hauteur fixe, aligne en haut :
                  le titre demarre au meme pixel sur les cinq ecrans. */}
              <View style={styles.zoneVisuel}>{e.visuel}</View>
              <View style={styles.zoneTexte}>
                <Text style={styles.titre}>{e.titre}</Text>
                <Text style={styles.corps}>{e.corps}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.bas}>
          <View style={styles.points}>
            {ecrans.map((_, i) => (
              <View key={i} style={[styles.point, i === page && styles.pointActif]} />
            ))}
          </View>
          <Pressable style={styles.bouton} onPress={suivant} disabled={sortie}>
            <Text style={styles.boutonTexte}>{dernier ? t.tour.done : t.tour.next}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.charcoal },
  safe: { flex: 1 },

  barreHaute: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  compteur: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(234,225,208,0.38)',
  },
  passer: { fontFamily: fonts.sansSemibold, fontSize: 14.5, color: colors.terracottaLight },

  pages: { flex: 1 },
  page: { flex: 1, paddingHorizontal: spacing.xl },
  zoneVisuel: { flex: 1, justifyContent: 'center' },
  // Assez haut pour le texte le plus long des huit langues (russe, allemand :
  // titre sur deux lignes, corps sur quatre ou cinq). `minHeight` et pas
  // `height` : une traduction plus longue repousse, elle n'est jamais coupee.
  zoneTexte: { minHeight: 228, justifyContent: 'flex-start', paddingBottom: spacing.lg },

  visuel: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },

  pile: { width: '100%', maxWidth: 300, gap: spacing.sm },
  ligneMail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: CARTE,
    borderColor: TRAIT,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    width: '100%',
    maxWidth: 300,
  },
  ligneAttenuee: { opacity: 0.4 },
  filet: { width: 3, height: 26, borderRadius: 2 },
  ligneTextes: { gap: 7, flex: 1 },

  pubWrap: { width: '100%', maxWidth: 300, alignItems: 'flex-end' },
  pub: {
    borderColor: 'rgba(234,225,208,0.16)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    width: '62%',
    opacity: 0.75,
  },

  carte: {
    backgroundColor: CARTE,
    borderColor: TRAIT,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 300,
    gap: spacing.md,
  },
  carteEntete: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  carteLignes: { gap: 9 },
  dessous: { width: '100%', maxWidth: 300, gap: 8, paddingHorizontal: spacing.lg },

  curseurLigne: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  curseur: { width: 2, height: 14, backgroundColor: colors.terracottaVivid, borderRadius: 1 },

  boutonFactice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  boutonBarre: {
    width: 54,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(234,225,208,0.85)',
  },

  halo2: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(232,93,12,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo1: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(232,93,12,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleMicro: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.terracottaVivid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onde: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 54 },

  pucesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  puce: { borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
  puceEteinte: { borderColor: TRAIT, borderWidth: 1 },
  puceActive: { backgroundColor: TEINTES.important },
  puceTexte: { fontFamily: fonts.sansSemibold, fontSize: 12.5 },
  fleche: { fontFamily: fonts.sans, fontSize: 17, color: 'rgba(234,225,208,0.45)' },

  titre: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.7,
    color: colors.onDark,
    marginBottom: spacing.md,
  },
  corps: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 25,
    color: colors.onDarkMuted,
  },

  bas: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.xl },
  points: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  point: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(234,225,208,0.22)',
  },
  pointActif: { backgroundColor: colors.terracottaVivid, width: 20 },
  bouton: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonTexte: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
});
