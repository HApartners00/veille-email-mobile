import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconChevronLeft } from '@/components/icons';
import { apiPost } from '@/lib/api';
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
 * ⚠️ PAS D'OUTILS ICI. Ni envoyer, ni ranger, ni mail suivant. On répond à deux
 * questions : est-ce que la voix convient, et combien ça coûte vraiment.
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

type Compteurs = {
  audioIn: number;
  audioCache: number;
  audioOut: number;
  texteIn: number;
  texteCache: number;
  texteOut: number;
};

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

  const pcRef = useRef<unknown>(null);
  const fluxRef = useRef<unknown>(null);

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
    try {
      const flux = fluxRef.current as { getTracks?: () => { stop: () => void }[] } | null;
      flux?.getTracks?.().forEach((t) => t.stop());
    } catch (e) {
      noter(`arrêt du micro : ${message(e)}`);
    }
    try {
      (pcRef.current as { close?: () => void } | null)?.close?.();
    } catch (e) {
      noter(`fermeture : ${message(e)}`);
    }
    pcRef.current = null;
    fluxRef.current = null;
    setEtape('fin');
  }, [noter]);

  useEffect(() => () => arreter(), [arreter]);

  const demarrer = useCallback(async () => {
    setErreur(null);
    setJournal([]);
    setCompteurs(ZERO);
    setEtape('demarrage');

    try {
      // 1. Le jeton court. La vraie clé OpenAI ne quitte jamais le serveur.
      noter('1. demande du jeton au serveur…');
      const r = await apiPost<{
        ok?: boolean;
        jeton?: string;
        modele?: string;
        voix?: string;
        contexte?: { objet?: string; aUnResume?: boolean; longueurInstructions?: number };
        error?: string;
      }>('/api/voice/essai-openai', { voix, modele, locale: 'fr' });
      if (!r?.jeton) throw new Error(r?.error || 'Le serveur n\'a pas renvoyé de jeton.');
      setContexte(r.contexte || null);
      noter(`   jeton reçu · modèle ${r.modele} · voix ${r.voix}`);
      noter(`   mail : ${r.contexte?.objet || '(sans objet)'} · résumé : ${r.contexte?.aUnResume ? 'oui' : 'NON'}`);

      // 2. Le module natif. `require` et non `import` en tête : si le module
      //    manquait, l'écran planterait au montage au lieu de le DIRE.
      noter('2. chargement du module WebRTC…');
      const webrtc = require('@daily-co/react-native-webrtc');
      const { RTCPeerConnection, mediaDevices } = webrtc;
      if (!RTCPeerConnection) throw new Error('RTCPeerConnection introuvable dans le module.');

      // 3. Le micro.
      noter('3. ouverture du micro…');
      const flux = await mediaDevices.getUserMedia({ audio: true, video: false });
      fluxRef.current = flux;

      // 4. La liaison directe avec OpenAI. Aucun serveur média au milieu :
      //    c'est précisément ce qui fait disparaître le péage.
      noter('4. ouverture de la liaison…');
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcRef.current = pc;
      flux.getTracks().forEach((t: unknown) => pc.addTrack(t, flux));

      // Le canal d'événements : c'est par là que passent la consommation et,
      // un jour, les appels d'outils.
      const canal = pc.createDataChannel('oai-events');
      canal.onmessage = (ev: { data: string }) => {
        try {
          const m = JSON.parse(ev.data) as {
            type?: string;
            response?: { usage?: Record<string, unknown> };
            error?: { message?: string };
          };
          if (m.type === 'error') {
            setErreur(String(m.error?.message || JSON.stringify(m)));
            return;
          }
          if (m.type === 'response.done' && m.response?.usage) {
            const u = m.response.usage as {
              input_token_details?: { audio_tokens?: number; text_tokens?: number; cached_tokens_details?: { audio_tokens?: number; text_tokens?: number } };
              output_token_details?: { audio_tokens?: number; text_tokens?: number };
            };
            const ein = u.input_token_details || {};
            const cache = ein.cached_tokens_details || {};
            const eout = u.output_token_details || {};
            setCompteurs((c) => ({
              // Les jetons mis en cache sont facturés à part, TRÈS en dessous :
              // les compter au plein tarif gonflerait la note d'un facteur 30 et
              // ferait rater la décision.
              audioIn: c.audioIn + Math.max(0, (ein.audio_tokens || 0) - (cache.audio_tokens || 0)),
              audioCache: c.audioCache + (cache.audio_tokens || 0),
              audioOut: c.audioOut + (eout.audio_tokens || 0),
              texteIn: c.texteIn + Math.max(0, (ein.text_tokens || 0) - (cache.text_tokens || 0)),
              texteCache: c.texteCache + (cache.text_tokens || 0),
              texteOut: c.texteOut + (eout.text_tokens || 0),
            }));
          }
        } catch {
          // Un message illisible ne doit pas couper la conversation.
        }
      };
      canal.onopen = () => noter('   canal ouvert');

      const offre = await pc.createOffer({});
      await pc.setLocalDescription(offre);

      noter('5. négociation avec OpenAI…');
      const rep = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(r.modele || modele)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${r.jeton}`, 'content-type': 'application/sdp' },
        body: offre.sdp,
      });
      const sdp = await rep.text();
      if (!rep.ok) throw new Error(`OpenAI a refusé la liaison (${rep.status}) : ${sdp.slice(0, 300)}`);
      await pc.setRemoteDescription({ type: 'answer', sdp });

      noter('6. liaison établie — parle.');
      setDebutMs(Date.now());
      setEtape('en_cours');
    } catch (e) {
      setErreur(message(e));
      setEtape('fin');
      arreter();
    }
  }, [voix, modele, noter, arreter]);

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
          Deux questions seulement — comment sonne la voix, et combien ça coûte.
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
