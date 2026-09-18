import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconChevronLeft } from '@/components/icons';
import { demarrerOpenAI, type AppelOutilVu, type SessionOpenAI, type Usage } from '@/lib/voix-openai';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * BANC D'ESSAI — LA VOIX D'OPENAI EN DIRECT. 18/09/2026. ADMIN SEULEMENT.
 *
 * ⚠️ POURQUOI CET ÉCRAN EXISTE. Mesuré sur de vrais appels : l'assistant coûte
 * 0,0898 $/min chez Vapi, dont 0,05 $ de péage — 56 % qui ne paient ni la voix,
 * ni le modèle, ni la transcription. Aucune remise n'existe sous 999 $/mois.
 * OpenAI entend et répond en voix d'un seul tenant, et l'app s'y connecte EN
 * DIRECT, sans plateforme au milieu : le calcul donne ~0,02 $/min, soit −78 %.
 *
 * Un calcul n'est pas une mesure, et aucun tableau ne dit comment une voix
 * SONNE. Cet écran tranche les deux, et rien d'autre.
 *
 * ⚠️ IL NE REMPLACE RIEN. Le bouton « Assistant » continue de passer par Vapi.
 * Rien ici n'est branché sur les vrais appels.
 *
 * ⚠️ LES SEPT OUTILS SONT LÀ DEPUIS LE 18/09, DEUXIÈME PASSE. Le banc n'en avait
 * aucun au départ : il ne posait que deux questions, la voix et le prix. Les
 * deux ont leur réponse — HA a écouté les dix voix et choisi `cedar` ; la mesure
 * donne 0,0193 $/min contre 0,0898 chez Vapi, soit −78 %.
 *
 * Restait la seule chose qui compte : un assistant qui ne peut ni envoyer, ni
 * ranger, ni passer au mail suivant ne sert à rien, quel que soit son prix.
 *
 * ⚠️ LA MÉCANIQUE N'EST PLUS DANS CET ÉCRAN. Elle vit dans `lib/voix-openai.ts`,
 * écrite comme un module — c'est le même code qui servira le jour de la
 * bascule. Un banc qui mesure autre chose que ce qu'on livrera ne mesure rien.
 *
 * ⚠️ RIEN EN SILENCE. Chaque panne s'affiche BRUTE. Un banc qui dit « échec »
 * sans dire lequel ne sert à rien — c'est la leçon de l'écran de diagnostic.
 */

/**
 * LES TARIFS PUBLIÉS D'OPENAI au 18/09/2026, en dollars par MILLION de jetons.
 *
 * ⚠️ CE SONT DES TARIFS ANNONCÉS, PAS UNE FACTURE. Le total affiché plus bas est
 * donc un CALCUL à partir de la consommation réelle, pas un relevé bancaire. À
 * recouper avec le tableau de bord OpenAI avant d'en tirer une décision.
 */
const TARIFS: Record<string, { audioIn: number; audioCache: number; audioOut: number; texteIn: number; texteCache: number; texteOut: number }> = {
  'gpt-realtime-2.1-mini': { audioIn: 10, audioCache: 0.3, audioOut: 20, texteIn: 0.6, texteCache: 0.06, texteOut: 2.4 },
  'gpt-realtime-2.1': { audioIn: 32, audioCache: 0.4, audioOut: 64, texteIn: 4, texteCache: 0.4, texteOut: 24 },
};

/** Le coût mesuré de l'assistant actuel, pour avoir le point de comparaison sous les yeux. */
const COUT_VAPI_MINUTE = 0.0898;

const VOIX = ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];

/** Les compteurs sont ceux du module : une seule définition, pas deux. */
type Compteurs = Usage;

const ZERO: Compteurs = { audioIn: 0, audioCache: 0, audioOut: 0, texteIn: 0, texteCache: 0, texteOut: 0 };

function message(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || 'Erreur sans message';
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function cout(c: Compteurs, modele: string): number {
  const t = TARIFS[modele] || TARIFS['gpt-realtime-2.1-mini'];
  return (
    (c.audioIn * t.audioIn +
      c.audioCache * t.audioCache +
      c.audioOut * t.audioOut +
      c.texteIn * t.texteIn +
      c.texteCache * t.texteCache +
      c.texteOut * t.texteOut) /
    1_000_000
  );
}

export default function EssaiOpenAI() {
  const router = useRouter();
  const [etape, setEtape] = useState<'attente' | 'demarrage' | 'en_cours' | 'fin'>('attente');
  const [erreur, setErreur] = useState<string | null>(null);
  const [journal, setJournal] = useState<string[]>([]);
  const [voix, setVoix] = useState('marin');
  const [modele, setModele] = useState('gpt-realtime-2.1-mini');
  const [compteurs, setCompteurs] = useState<Compteurs>(ZERO);
  const [debutMs, setDebutMs] = useState<number | null>(null);
  const [, retracer] = useState(0);
  const [contexte, setContexte] = useState<{ objet?: string; aUnResume?: boolean } | null>(null);
  // ⚠️ CE QUE LE BANC DOIT MONTRER EN PLUS DU PRIX : chaque outil appelé, son
  // résultat et son TEMPS. Un outil lent ne se voit pas — il s'entend comme un
  // silence, et on accuse la voix.
  const [outils, setOutils] = useState<AppelOutilVu[]>([]);
  const [dernierDit, setDernierDit] = useState<string>('');

  const sessionRef = useRef<SessionOpenAI | null>(null);

  // Le compteur avance à l'horloge. Sans lui, impossible de rapporter la
  // consommation à une durée — et c'est le coût PAR MINUTE qui nous intéresse.
  useEffect(() => {
    if (etape !== 'en_cours') return;
    const i = setInterval(() => retracer((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [etape]);

  const noter = useCallback((ligne: string) => {
    setJournal((j) => [...j.slice(-40), ligne]);
  }, []);

  const arreter = useCallback(() => {
    sessionRef.current?.arreter();
    sessionRef.current = null;
    setEtape('fin');
  }, []);

  useEffect(() => () => arreter(), [arreter]);

  const demarrer = useCallback(async () => {
    setErreur(null);
    setJournal([]);
    setOutils([]);
    setDernierDit('');
    setCompteurs(ZERO);
    setEtape('demarrage');

    try {
      const session = await demarrerOpenAI({
        voix,
        modele,
        locale: 'fr',
        surEtape: noter,
        // Les compteurs s'ADDITIONNENT : le module rend la consommation de
        // CHAQUE réponse, pas un cumul. Les remplacer ferait afficher le coût
        // de la dernière phrase comme s'il était celui de l'appel entier.
        surUsage: (u) =>
          setCompteurs((c) => ({
            audioIn: c.audioIn + u.audioIn,
            audioCache: c.audioCache + u.audioCache,
            audioOut: c.audioOut + u.audioOut,
            texteIn: c.texteIn + u.texteIn,
            texteCache: c.texteCache + u.texteCache,
            texteOut: c.texteOut + u.texteOut,
          })),
        surOutil: (a) => setOutils((l) => [...l, a]),
        surTexte: (t) => setDernierDit(t),
        // RIEN EN SILENCE : une panne pendant la conversation s'affiche, elle
        // ne se contente pas d'arrêter la voix.
        surErreur: (m) => setErreur(m),
        surMail: (id) => noter(`   → la conversation passe au mail ${id.slice(0, 8)}…`),
      });
      sessionRef.current = session;
      setContexte(session.contexte);
      setDebutMs(Date.now());
      setEtape('en_cours');
    } catch (e) {
      setErreur(message(e));
      setEtape('fin');
      sessionRef.current?.arreter();
      sessionRef.current = null;
    }
  }, [voix, modele, noter]);

  const secondes = debutMs ? Math.max(1, Math.round((Date.now() - debutMs) / 1000)) : 0;
  const total = cout(compteurs, modele);
  const parMinute = secondes > 0 ? (total * 60) / secondes : 0;
  const ecart = parMinute > 0 ? Math.round((1 - parMinute / COUT_VAPI_MINUTE) * 100) : 0;

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.entete}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.retour}>
          <IconChevronLeft size={20} color={colors.onDark} />
        </Pressable>
        <Text style={styles.titre}>Essai OpenAI</Text>
      </View>

      <ScrollView contentContainerStyle={styles.corps}>
        <Text style={styles.intro}>
          Banc de mesure. Vapi continue de servir les vrais appels : rien ici ne les touche.
          Les sept outils sont branchés — essaie « résume-moi ce mail », « réponds que je suis
          d&apos;accord », « archive-le », « mail suivant ».
        </Text>

        {/* ------------------------------------------------------ la voix */}
        <Text style={styles.sousTitre}>Voix</Text>
        <View style={styles.puces}>
          {VOIX.map((v) => (
            <Pressable
              key={v}
              disabled={etape === 'en_cours' || etape === 'demarrage'}
              onPress={() => setVoix(v)}
              style={[styles.puce, voix === v && styles.puceOn]}
            >
              <Text style={[styles.puceTexte, voix === v && styles.puceTexteOn]}>{v}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sousTitre}>Modèle</Text>
        <View style={styles.puces}>
          {Object.keys(TARIFS).map((m) => (
            <Pressable
              key={m}
              disabled={etape === 'en_cours' || etape === 'demarrage'}
              onPress={() => setModele(m)}
              style={[styles.puce, modele === m && styles.puceOn]}
            >
              <Text style={[styles.puceTexte, modele === m && styles.puceTexteOn]}>
                {m.replace('gpt-realtime-2.1', 'realtime')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* --------------------------------------------------- la mesure */}
        {etape === 'en_cours' || etape === 'fin' ? (
          <View style={styles.mesure}>
            <Text style={styles.mesureTitre}>MESURE</Text>
            <Ligne libelle="durée" valeur={`${secondes} s`} />
            <Ligne libelle="audio entrant" valeur={`${compteurs.audioIn} jetons`} />
            <Ligne libelle="audio en cache" valeur={`${compteurs.audioCache} jetons`} />
            <Ligne libelle="audio sortant" valeur={`${compteurs.audioOut} jetons`} />
            <Ligne libelle="texte (entrée / cache / sortie)" valeur={`${compteurs.texteIn} / ${compteurs.texteCache} / ${compteurs.texteOut}`} />
            <View style={styles.trait} />
            <Ligne libelle="total de cet appel" valeur={`${total.toFixed(4)} $`} fort />
            <Ligne libelle="par minute" valeur={`${parMinute.toFixed(4)} $`} fort />
            <Ligne libelle="Vapi, pour comparer" valeur={`${COUT_VAPI_MINUTE.toFixed(4)} $/min`} />
            {parMinute > 0 ? (
              <Text style={[styles.verdict, ecart > 0 ? styles.verdictBon : styles.verdictMauvais]}>
                {ecart > 0 ? `${ecart} % moins cher que Vapi` : `${-ecart} % plus cher que Vapi`}
              </Text>
            ) : null}
            <Text style={styles.avertissement}>
              Calculé sur les tarifs publiés d&apos;OpenAI, pas sur une facture. À recouper avec leur
              tableau de bord avant de trancher.
            </Text>
          </View>
        ) : null}

        {/* ---------------------------------------------------- les outils */}
        {outils.length ? (
          <View style={styles.mesure}>
            <Text style={styles.mesureTitre}>OUTILS APPELÉS ({outils.length})</Text>
            {outils.map((o, i) => (
              <View key={i} style={styles.outil}>
                <View style={styles.ligne}>
                  <Text style={[styles.ligneLibelle, o.erreur ? styles.outilRate : styles.outilOk]}>
                    {o.erreur ? '✕' : '✓'} {o.nom}
                  </Text>
                  <Text style={styles.ligneValeur}>
                    {o.ms} ms{typeof o.msServeur === 'number' ? ` (dont ${o.msServeur} serveur)` : ''}
                  </Text>
                </View>
                {Object.keys(o.args).length ? (
                  <Text style={styles.outilArgs}>{JSON.stringify(o.args)}</Text>
                ) : null}
                {/* RIEN EN SILENCE : on montre la réponse ENTIÈRE, pas un « ok ».
                    C'est elle que l'assistant a lue — si elle est fausse, on doit
                    pouvoir le voir sans rouvrir les journaux du serveur. */}
                <Text style={[styles.outilResultat, o.erreur && styles.outilRate]}>{o.resultat}</Text>
              </View>
            ))}
            <Text style={styles.avertissement}>
              Le temps affiché est celui vu par le téléphone. La part « serveur » est celle que le
              serveur rapporte : la différence est le réseau.
            </Text>
          </View>
        ) : null}

        {/* ------------------------------------------------ ce qu'il vient de dire */}
        {dernierDit ? (
          <View style={styles.mesure}>
            <Text style={styles.mesureTitre}>DERNIÈRE PHRASE</Text>
            <Text style={styles.outilResultat}>{dernierDit}</Text>
          </View>
        ) : null}

        {/* --------------------------------------------------- l'erreur */}
        {erreur ? (
          <View style={styles.erreurBloc}>
            <Text style={styles.erreurTitre}>PANNE</Text>
            <Text style={styles.erreurTexte}>{erreur}</Text>
          </View>
        ) : null}

        {/* --------------------------------------------------- le journal */}
        {journal.length ? (
          <View style={styles.journal}>
            {journal.map((l, i) => (
              <Text key={i} style={styles.journalLigne}>
                {l}
              </Text>
            ))}
          </View>
        ) : null}

        {contexte && etape === 'attente' ? (
          <Text style={styles.note}>
            Dernier essai : {contexte.objet || '(sans objet)'}
          </Text>
        ) : null}

        {/* --------------------------------------------------- le bouton */}
        {etape === 'en_cours' ? (
          <Pressable style={[styles.bouton, styles.boutonStop]} onPress={arreter}>
            <Text style={[styles.boutonTexte, styles.boutonTexteStop]}>Terminer</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.bouton} onPress={() => void demarrer()} disabled={etape === 'demarrage'}>
            {etape === 'demarrage' ? (
              <ActivityIndicator color={colors.charcoal} />
            ) : (
              <Text style={styles.boutonTexte}>{etape === 'fin' ? 'Recommencer' : 'Lancer l\'essai'}</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Ligne({ libelle, valeur, fort }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <View style={styles.ligne}>
      <Text style={[styles.ligneLibelle, fort && styles.ligneFort]}>{libelle}</Text>
      <Text style={[styles.ligneValeur, fort && styles.ligneFort]}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.charcoal },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.charline,
  },
  retour: { padding: 4 },
  titre: { fontFamily: fonts.sansSemibold, fontSize: 17, color: colors.onDark },
  corps: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  intro: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: colors.onDarkMuted },
  sousTitre: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.terracottaLight,
  },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  puce: {
    borderWidth: 1,
    borderColor: colors.charline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  puceOn: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  puceTexte: { fontFamily: fonts.sans, fontSize: 13, color: colors.onDarkMuted },
  puceTexteOn: { color: colors.onDark, fontFamily: fonts.sansSemibold },
  mesure: {
    borderWidth: 1,
    borderColor: colors.charline,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  mesureTitre: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    color: colors.terracottaLight,
    marginBottom: 4,
  },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  ligneLibelle: { fontFamily: fonts.sans, fontSize: 13, color: colors.onDarkMuted, flex: 1 },
  ligneValeur: { fontFamily: fonts.sans, fontSize: 13, color: colors.onDark },
  ligneFort: { fontFamily: fonts.sansSemibold, color: colors.onDark },
  trait: { height: 1, backgroundColor: colors.charline, marginVertical: 4 },
  outil: {
    borderTopWidth: 1,
    borderTopColor: colors.charline,
    paddingTop: 8,
    marginTop: 4,
    gap: 4,
  },
  outilOk: { fontFamily: fonts.sansSemibold, color: colors.sage },
  outilRate: { fontFamily: fonts.sansSemibold, color: colors.danger },
  outilArgs: { fontFamily: fonts.sans, fontSize: 11, color: colors.onDarkMuted },
  outilResultat: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.onDark },
  verdict: { fontFamily: fonts.sansBold, fontSize: 15, marginTop: 6 },
  verdictBon: { color: colors.sage },
  verdictMauvais: { color: colors.danger },
  avertissement: {
    fontFamily: fonts.sansItalic,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.onDarkMuted,
    marginTop: 6,
  },
  erreurBloc: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  erreurTitre: { fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1.1, color: colors.danger },
  erreurTexte: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.onDark },
  journal: { gap: 2 },
  journalLigne: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.onDarkMuted },
  note: { fontFamily: fonts.sans, fontSize: 12, color: colors.onDarkMuted },
  bouton: {
    backgroundColor: colors.terracottaLight,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  boutonStop: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  boutonTexte: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.charcoal },
  // Le bouton « Terminer » est transparent : du charbon sur du charbon ne se lit pas.
  boutonTexteStop: { color: colors.terracottaLight },
});
