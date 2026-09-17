import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconChevronLeft } from '@/components/icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * DIAGNOSTIC VOIX — 17/09/2026. ÉCRAN JETABLE, ADMIN SEULEMENT.
 *
 * POURQUOI IL EXISTE. Le kit vocal (Vapi) repose sur du code natif : le moteur
 * audio de Daily et sa version de WebRTC (118, figée par Vapi). La notice de
 * Vapi dit qu'il n'est PAS compatible avec la « nouvelle architecture » de React
 * Native — mais elle parle d'Android, et notre app tourne en nouvelle
 * architecture sur iOS (Reanimated 4 l'exige). Aucun des quatre modules natifs
 * ajoutés ne déclare la nouvelle architecture dans son podspec : ils passent
 * donc par la couche de compatibilité. Personne ne peut dire depuis un clavier
 * si ça marche sur un vrai iPhone.
 *
 * Cet écran est là pour le savoir AVANT d'écrire l'assistant complet. Il ne
 * passe aucun appel, n'envoie rien, ne consomme aucune minute Vapi et ne
 * transporte aucune clé : il charge les modules, ouvre le micro une seconde et
 * le referme.
 *
 * ⚠️ RIEN EN SILENCE : chaque étape affiche le message d'erreur BRUT. Un
 * diagnostic qui dit seulement « échec » ne sert à rien.
 *
 * À SUPPRIMER une fois l'assistant vocal en production : ce fichier, la rangée
 * « Diagnostic voix » dans `components/settings-panel.tsx`, et rien d'autre.
 */

type Etat = 'attente' | 'encours' | 'ok' | 'echec';

type Etape = {
  cle: string;
  titre: string;
  etat: Etat;
  detail?: string;
};

const ETAPES: { cle: string; titre: string }[] = [
  { cle: 'moteur', titre: '1. Charger le moteur audio (Daily)' },
  { cle: 'kit', titre: '2. Charger le kit Vapi' },
  { cle: 'appel', titre: "3. Créer un objet d'appel" },
  { cle: 'micro', titre: '4. Ouvrir le micro (iOS va demander la permission)' },
  { cle: 'fermeture', titre: '5. Tout refermer' },
];

function messageErreur(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || 'Erreur sans message';
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export default function DiagnosticVoix() {
  const router = useRouter();
  const [etapes, setEtapes] = useState<Etape[]>(
    ETAPES.map((e) => ({ ...e, etat: 'attente' as Etat })),
  );
  const [encours, setEncours] = useState(false);

  function poser(cle: string, etat: Etat, detail?: string) {
    setEtapes((prec) => prec.map((e) => (e.cle === cle ? { ...e, etat, detail } : e)));
  }

  async function lancer() {
    if (encours) return;
    setEncours(true);
    setEtapes(ETAPES.map((e) => ({ ...e, etat: 'attente' as Etat })));

    // ⚠️ `require` et non `import` en tête de fichier : si le module natif manque,
    // un import en tête ferait planter l'écran AVANT d'afficher quoi que ce soit,
    // et on ne saurait pas lequel des deux a lâché.
    let Daily: any = null;
    let appel: any = null;

    poser('moteur', 'encours');
    try {
      const mod = require('@daily-co/react-native-daily-js');
      Daily = mod?.default ?? mod;
      if (typeof Daily?.createCallObject !== 'function') {
        throw new Error('Module chargé mais createCallObject est absent.');
      }
      poser('moteur', 'ok', 'Module natif chargé.');
    } catch (e) {
      poser('moteur', 'echec', messageErreur(e));
      setEncours(false);
      return;
    }

    poser('kit', 'encours');
    try {
      const mod = require('@vapi-ai/react-native');
      const Vapi = mod?.default ?? mod;
      // Aucune clé, aucun appel réseau : on vérifie seulement que la classe se
      // construit (elle ne contacte Vapi qu'au moment d'un `start`).
      const instance = new Vapi('diagnostic-sans-cle');
      if (typeof instance?.start !== 'function') {
        throw new Error('Kit chargé mais la méthode start est absente.');
      }
      poser('kit', 'ok', 'Kit chargé.');
    } catch (e) {
      poser('kit', 'echec', messageErreur(e));
      setEncours(false);
      return;
    }

    poser('appel', 'encours');
    try {
      appel = Daily.createCallObject({ audioSource: true, videoSource: false });
      poser('appel', 'ok', "Objet d'appel créé.");
    } catch (e) {
      poser('appel', 'echec', messageErreur(e));
      setEncours(false);
      return;
    }

    poser('micro', 'encours');
    try {
      await appel.startCamera({ audioSource: true, videoSource: false });
      const local = appel.participants?.()?.local;
      const piste = local?.tracks?.audio?.state ?? 'inconnu';
      const actif = local?.audio === true;
      poser(
        'micro',
        actif ? 'ok' : 'echec',
        `micro ${actif ? 'ouvert' : 'fermé'} · état de la piste : ${piste}`,
      );
    } catch (e) {
      poser('micro', 'echec', messageErreur(e));
    }

    poser('fermeture', 'encours');
    try {
      await appel.destroy();
      poser('fermeture', 'ok', 'Objet libéré.');
    } catch (e) {
      poser('fermeture', 'echec', messageErreur(e));
    }

    setEncours(false);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.rond} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          <Text style={styles.titre}>Diagnostic voix</Text>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.corps} contentContainerStyle={styles.corpsContenu}>
        <Text style={styles.intro}>
          Ce test charge le moteur audio du futur assistant vocal et ouvre le micro une seconde.
          Aucun appel n&apos;est passé, aucune minute n&apos;est consommée. Écran réservé à
          l&apos;administrateur.
        </Text>

        <View style={styles.liste}>
          {etapes.map((e) => (
            <View key={e.cle} style={styles.ligne}>
              <View style={styles.ligneHaut}>
                <Text style={styles.ligneTitre}>{e.titre}</Text>
                {e.etat === 'encours' ? (
                  <ActivityIndicator size="small" color={colors.terracotta} />
                ) : (
                  <Text
                    style={[
                      styles.badge,
                      e.etat === 'ok' && styles.badgeOk,
                      e.etat === 'echec' && styles.badgeEchec,
                    ]}
                  >
                    {e.etat === 'ok' ? 'OK' : e.etat === 'echec' ? 'ÉCHEC' : '—'}
                  </Text>
                )}
              </View>
              {e.detail ? (
                <Text style={[styles.detail, e.etat === 'echec' && styles.detailEchec]}>
                  {e.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>

        <Pressable style={[styles.cta, encours && styles.ctaOff]} onPress={lancer} disabled={encours}>
          {encours ? (
            <ActivityIndicator color={colors.onDark} />
          ) : (
            <Text style={styles.ctaTexte}>Lancer le test</Text>
          )}
        </Pressable>

        <Text style={styles.note}>
          Si une étape échoue, envoyez le texte affiché tel quel : c&apos;est le message du module
          natif, pas un résumé.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fond },
  safe: {
    backgroundColor: colors.charcoalSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.charline,
  },
  topbar: {
    backgroundColor: colors.charcoalSoft,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rond: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(234,225,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.onDark },
  corps: { flex: 1 },
  corpsContenu: { padding: spacing.xl, gap: spacing.lg },
  intro: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: colors.onDarkMuted },
  liste: { gap: spacing.md },
  ligne: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.charline,
    gap: 6,
  },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ligneTitre: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.onDark },
  badge: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.onDarkMuted,
  },
  badgeOk: { color: colors.sage },
  badgeEchec: { color: colors.danger },
  detail: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.onDarkMuted },
  detailEchec: { color: colors.danger },
  cta: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.6 },
  ctaTexte: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.onDark },
  note: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, color: colors.onDarkMuted },
});
