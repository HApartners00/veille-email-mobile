import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconClose, IconMic, IconMicOff } from '@/components/icons';
import { arreterVoix, couperMicro, oublierVoix, type EtatVoix } from '@/lib/voix-client';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * LE PANNEAU VOCAL — PISTE A, validée par HA le 17/09/2026.
 *
 * Il REMPLACE la barre du bas pendant la conversation. Le mail, le résumé et la
 * réponse restent visibles et défilables au-dessus : c'est tout l'intérêt de la
 * piste A contre le plein écran — on continue de voir ce dont on parle, et la
 * demande de confirmation s'affiche à l'endroit exact où l'on appuie
 * d'habitude sur « Envoyer ».
 *
 * Deux états seulement : on parle, ou on confirme un envoi. Le second n'est pas
 * un dialogue modal : les boutons sont là pour le doigt, mais la voix suffit.
 *
 * ⚠️ Dictionnaire local FR/EN : l'assistant vocal ne parle que ces deux langues
 * pour l'instant (arbitrage HA), et 12 chaînes ne justifient pas de toucher au
 * dictionnaire global des 8 langues.
 */

const T = {
  fr: {
    demarrage: 'Connexion…',
    ecoute: 'Je vous écoute',
    parle: "L'assistant parle",
    vous: 'Vous parlez',
    terminer: 'Terminer',
    micro: 'Couper le micro',
    microOn: 'Remettre le micro',
    confirmation: "Confirmation d'envoi",
    aDire: 'Dites « oui » pour envoyer, « non » pour annuler',
    envoye: 'La réponse est partie.',
    fin: 'Conversation terminée',
    fermer: 'Fermer',
  },
  en: {
    demarrage: 'Connecting…',
    ecoute: "I'm listening",
    parle: 'The assistant is speaking',
    vous: 'You are speaking',
    terminer: 'End',
    micro: 'Mute',
    microOn: 'Unmute',
    confirmation: 'Send confirmation',
    aDire: 'Say “yes” to send, “no” to cancel',
    envoye: 'The reply has been sent.',
    fin: 'Conversation ended',
    fermer: 'Close',
  },
} as const;

/** Barres d'égaliseur. Décoratives : elles disent seulement « ça tourne ». */
function Ondes({ actif }: { actif: boolean }) {
  const [pas, setPas] = useState(0);
  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => setPas((p) => (p + 1) % 4), 220);
    return () => clearInterval(t);
  }, [actif]);
  const hauteurs = [
    [7, 14, 20, 11, 16],
    [14, 20, 11, 16, 7],
    [20, 11, 16, 7, 14],
    [11, 16, 7, 14, 20],
  ][actif ? pas : 0];
  return (
    <View style={styles.ondes}>
      {hauteurs.map((h, i) => (
        <View key={i} style={[styles.onde, { height: actif ? h : 6 }]} />
      ))}
    </View>
  );
}

function duree(debutMs: number | null): string {
  if (!debutMs) return '0:00';
  const s = Math.max(0, Math.round((Date.now() - debutMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PanneauVoix({
  etat,
  locale,
}: {
  etat: EtatVoix;
  locale: string;
}) {
  const t = locale === 'en' ? T.en : T.fr;
  const insets = useSafeAreaInsets();
  const [, retracer] = useState(0);

  /**
   * ⚠️ LE PANNEAU TIENT SA PROPRE HORLOGE — 19/09/2026.
   *
   * Constat de HA, premier appel après la bascule sur OpenAI : « ça marche mais
   * je l'ai laissé parler, le temps avance pas ».
   *
   * ⚠️ CAUSE NON TROUVÉE PAR LA RELECTURE. `lib/voix-client.ts` pose bien
   * `debutMs` au moment où la liaison s'établit, et ce panneau le lisait. Sur le
   * papier ça devait marcher ; sur le téléphone, non. Je n'ai pas su dire
   * pourquoi en lisant, et je ne vais pas prétendre le contraire.
   *
   * Ce qui est fait ici ne masque pas la cause : ça SUPPRIME LA DÉPENDANCE. Le
   * panneau note l'heure à laquelle il s'ouvre, et s'en sert si — et seulement
   * si — `debutMs` manque. Quand la valeur arrive, c'est elle qui prime, parce
   * qu'elle démarre à la liaison et non à l'affichage.
   *
   * Si le compteur reste à 0:00 malgré ça, c'est que le panneau ne se redessine
   * pas du tout, et le défaut est ailleurs. On saura où chercher.
   */
  const [debutLocal, setDebutLocal] = useState<number | null>(null);
  useEffect(() => {
    if (etat.etape === 'inactif') {
      setDebutLocal(null);
      return;
    }
    setDebutLocal((d) => d ?? Date.now());
  }, [etat.etape]);

  // Le compteur avance : une seconde d'horloge, pas d'animation.
  // Il tourne aussi pendant « Connexion… » : une attente qui ne se compte pas
  // ressemble à une panne.
  useEffect(() => {
    if (etat.etape !== 'en_cours' && etat.etape !== 'demarrage') return;
    const i = setInterval(() => retracer((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [etat.etape]);

  const parle = etat.quiParle === 'assistant';
  const titre =
    etat.etape === 'demarrage'
      ? t.demarrage
      : etat.etape === 'fin'
        ? t.fin
        : parle
          ? t.parle
          : etat.quiParle === 'vous'
            ? t.vous
            : t.ecoute;

  return (
    <View style={[styles.panneau, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {/* ------------------------------------------------- ligne d'état */}
      <View style={styles.ligne}>
        {etat.etape === 'demarrage' ? (
          <ActivityIndicator color={colors.terracotta} />
        ) : (
          <Ondes actif={etat.etape === 'en_cours'} />
        )}
        <View style={styles.colonne}>
          <Text style={styles.titre}>{titre}</Text>
          <Text style={styles.sousTitre}>
            {duree(etat.debutMs ?? debutLocal)}
            {etat.muet ? ' · micro coupé' : ''}
          </Text>
        </View>
        {etat.etape === 'en_cours' ? (
          <Pressable
            style={styles.rond}
            onPress={() => couperMicro(!etat.muet)}
            accessibilityLabel={etat.muet ? t.microOn : t.micro}
            hitSlop={8}
          >
            {etat.muet ? (
              <IconMicOff size={18} color={colors.danger} />
            ) : (
              <IconMic size={18} color={colors.onDark} />
            )}
          </Pressable>
        ) : null}
      </View>

      {/* ------------------------------------------------ dernière phrase */}
      {etat.phrase && etat.etape === 'en_cours' ? (
        <Text style={styles.phrase} numberOfLines={3}>
          {etat.phrase}
        </Text>
      ) : null}

      {/* ----------------------------------------------------- l'erreur */}
      {/* RIEN EN SILENCE : le message brut, pas un « une erreur est survenue ». */}
      {etat.erreur ? <Text style={styles.erreur}>{etat.erreur}</Text> : null}

      {/* ------------------------------------------- confirmation d'envoi */}
      {etat.confirmation && !etat.envoye ? (
        <View style={styles.confirmation}>
          <Text style={styles.confirmationTitre}>{t.confirmation}</Text>
          <Text style={styles.confirmationAide}>{t.aDire}</Text>
        </View>
      ) : null}

      {etat.envoye ? <Text style={styles.envoye}>{t.envoye}</Text> : null}

      {/* -------------------------------------------------------- boutons */}
      {etat.etape === 'fin' ? (
        <Pressable style={styles.terminer} onPress={oublierVoix}>
          <Text style={styles.terminerTexte}>{t.fermer}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.terminer} onPress={() => void arreterVoix()}>
          <IconClose size={16} color={colors.terracottaLight} />
          <Text style={styles.terminerTexte}>{t.terminer}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panneau: {
    backgroundColor: colors.charcoalSoft,
    borderTopWidth: 1,
    borderTopColor: colors.charline,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  colonne: { flex: 1, gap: 2 },
  titre: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.onDark },
  sousTitre: { fontFamily: fonts.sans, fontSize: 11.5, color: colors.onDarkMuted },
  ondes: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 39, height: 22 },
  onde: { width: 3, borderRadius: 1.5, backgroundColor: colors.terracottaLight },
  rond: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(234,225,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phrase: {
    fontFamily: fonts.sansItalic,
    fontSize: 15,
    lineHeight: 22,
    color: colors.onDark,
  },
  erreur: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.danger },
  confirmation: {
    borderWidth: 1,
    borderColor: colors.terracottaLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  confirmationTitre: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.terracottaLight,
  },
  confirmationAide: { fontFamily: fonts.sans, fontSize: 13, color: colors.onDark },
  envoye: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.sage },
  terminer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 13,
  },
  terminerTexte: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.terracottaLight },
});
