import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
import { ecouterCreditEpuise, signalerCreditEpuise, type SignalEpuise } from '@/lib/credit';
import { colors, fonts } from '@/lib/theme';

/**
 * LA JAUGE ET LE PANNEAU DU CRÉDIT DU JOUR — APP — 25/09/2026.
 *
 * Même comportement que le web (décisions de HA) :
 *   · une barre fine en haut de l'écran ; un toucher dit « il vous reste N % » ;
 *   · un panneau « crédit du jour épuisé » dès qu'une action est refusée, et une
 *     fois par jour à l'ouverture si le crédit est déjà vide.
 *
 * 🔴 DIFFÉRENCE VOULUE AVEC LE WEB : AUCUNE OFFRE, AUCUN PRIX, AUCUN LIEN vers une
 * formule ou vers le site (règle App Store 3.1.1, et la même chez Google). Le
 * panneau dit seulement que le crédit revient à minuit. La proposition de
 * formule part par email, hors de l'app.
 *
 * TROIS ÉTATS pour la jauge, jamais confondus : en lecture (rien), lue (la
 * barre à sa vraie longueur), illisible (barre grise, « indisponible »).
 */

type Dict = {
  reste: string; // {p}
  vide: string;
  recharge: string;
  indispo: string;
  titre: string;
  tri: string;
  demain: string;
  fermer: string;
  aria: string;
};

const STR: Record<string, Dict> = {
  fr: {
    reste: 'Il vous reste {p} % de votre crédit du jour.',
    vide: 'Crédit du jour épuisé. Revenez demain.',
    recharge: 'Se recharge à minuit.',
    indispo: 'Crédit du jour indisponible pour le moment.',
    titre: 'Crédit du jour épuisé',
    tri: 'Il se recharge à minuit. Le tri de vos nouveaux emails reprendra à ce moment-là.',
    demain: 'Revenez demain : tout reprendra automatiquement.',
    fermer: 'Compris',
    aria: 'Crédit du jour',
  },
  en: {
    reste: 'You have {p}% of today’s credit left.',
    vide: 'Today’s credit is used up. Come back tomorrow.',
    recharge: 'Refills at midnight.',
    indispo: 'Today’s credit is unavailable right now.',
    titre: 'Today’s credit is used up',
    tri: 'It refills at midnight. Sorting of your new emails resumes then.',
    demain: 'Come back tomorrow: everything restarts on its own.',
    fermer: 'Got it',
    aria: 'Today’s credit',
  },
  es: {
    reste: 'Te queda un {p} % del crédito de hoy.',
    vide: 'El crédito de hoy se ha agotado. Vuelve mañana.',
    recharge: 'Se recarga a medianoche.',
    indispo: 'El crédito de hoy no está disponible en este momento.',
    titre: 'Crédito de hoy agotado',
    tri: 'Se recarga a medianoche. La clasificación de tus nuevos correos se reanudará entonces.',
    demain: 'Vuelve mañana: todo se reanudará solo.',
    fermer: 'Entendido',
    aria: 'Crédito de hoy',
  },
  de: {
    reste: 'Ihnen bleiben {p} % des heutigen Guthabens.',
    vide: 'Das heutige Guthaben ist aufgebraucht. Kommen Sie morgen wieder.',
    recharge: 'Wird um Mitternacht aufgeladen.',
    indispo: 'Das heutige Guthaben ist gerade nicht verfügbar.',
    titre: 'Heutiges Guthaben aufgebraucht',
    tri: 'Es wird um Mitternacht aufgeladen. Dann wird auch die Sortierung neuer E-Mails fortgesetzt.',
    demain: 'Kommen Sie morgen wieder: alles läuft von selbst weiter.',
    fermer: 'Verstanden',
    aria: 'Heutiges Guthaben',
  },
  pt: {
    reste: 'Resta-lhe {p} % do crédito de hoje.',
    vide: 'O crédito de hoje esgotou-se. Volte amanhã.',
    recharge: 'Recarrega à meia-noite.',
    indispo: 'O crédito de hoje está indisponível de momento.',
    titre: 'Crédito de hoje esgotado',
    tri: 'Recarrega à meia-noite. A triagem dos seus novos emails retoma nessa altura.',
    demain: 'Volte amanhã: tudo recomeça sozinho.',
    fermer: 'Entendido',
    aria: 'Crédito de hoje',
  },
  it: {
    reste: 'Ti resta il {p}% del credito di oggi.',
    vide: 'Il credito di oggi è esaurito. Torna domani.',
    recharge: 'Si ricarica a mezzanotte.',
    indispo: 'Il credito di oggi non è disponibile al momento.',
    titre: 'Credito di oggi esaurito',
    tri: 'Si ricarica a mezzanotte. L’ordinamento delle nuove email riprenderà allora.',
    demain: 'Torna domani: tutto ripartirà da solo.',
    fermer: 'Ho capito',
    aria: 'Credito di oggi',
  },
  ar: {
    reste: 'تبقّى لك {p}٪ من رصيد اليوم.',
    vide: 'نفد رصيد اليوم. عُد غدًا.',
    recharge: 'يُجدَّد عند منتصف الليل.',
    indispo: 'رصيد اليوم غير متاح حاليًا.',
    titre: 'نفد رصيد اليوم',
    tri: 'يتجدّد عند منتصف الليل، ويُستأنف حينها فرز رسائلك الجديدة.',
    demain: 'عُد غدًا: سيعود كل شيء تلقائيًا.',
    fermer: 'حسنًا',
    aria: 'رصيد اليوم',
  },
  ru: {
    reste: 'У вас осталось {p} % сегодняшнего кредита.',
    vide: 'Кредит на сегодня исчерпан. Возвращайтесь завтра.',
    recharge: 'Пополняется в полночь.',
    indispo: 'Кредит на сегодня сейчас недоступен.',
    titre: 'Кредит на сегодня исчерпан',
    tri: 'Он пополнится в полночь. Тогда же возобновится сортировка новых писем.',
    demain: 'Возвращайтесь завтра: всё возобновится само.',
    fermer: 'Понятно',
    aria: 'Кредит на сегодня',
  },
};

type Etat =
  | { kind: 'lecture' }
  | { kind: 'lu'; part: number; epuise: boolean }
  | { kind: 'illisible' };

const CLE_PANNEAU = 'credit.panneau.';

export default function CreditOverlay() {
  const { session } = useAuth();
  if (!session) return null;
  return <CreditOverlayConnecte />;
}

function CreditOverlayConnecte() {
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const insets = useSafeAreaInsets();
  const [etat, setEtat] = useState<Etat>({ kind: 'lecture' });
  const [bulle, setBulle] = useState(false);
  const [panneau, setPanneau] = useState(false);
  const dernierRefus = useRef(0);

  const lire = useCallback(async () => {
    try {
      const j = await apiGet<{ part_restante?: number; epuise?: boolean; reinitialise_a?: string }>(
        '/api/credit',
      );
      const part = Math.max(0, Math.min(1, Number(j?.part_restante)));
      if (!Number.isFinite(part)) {
        console.error('[jauge] réponse sans part_restante exploitable');
        setEtat({ kind: 'illisible' });
        return;
      }
      const epuise = j?.epuise === true;
      setEtat({ kind: 'lu', part, epuise });
      if (epuise) signalerCreditEpuise({ source: 'jauge', reinitialise_a: j?.reinitialise_a ?? null });
    } catch (e) {
      console.error('[jauge] lecture impossible', e);
      setEtat({ kind: 'illisible' });
    }
  }, []);

  // Lecture : à l'ouverture, au retour dans l'app, toutes les 2 minutes.
  useEffect(() => {
    void lire();
    const minuterie = setInterval(() => void lire(), 120_000);
    const abo = AppState.addEventListener('change', (s) => {
      if (s === 'active') void lire();
    });
    return () => {
      clearInterval(minuterie);
      abo.remove();
    };
  }, [lire]);

  // Le panneau : à chaque refus (sauf rafale), une fois par jour quand c'est la jauge.
  useEffect(() => {
    return ecouterCreditEpuise((s: SignalEpuise) => {
      void (async () => {
        if (s.source === 'jauge') {
          const cle = CLE_PANNEAU + (s.reinitialise_a || new Date().toISOString().slice(0, 10));
          try {
            if ((await AsyncStorage.getItem(cle)) === '1') return;
            await AsyncStorage.setItem(cle, '1');
          } catch (e) {
            console.warn('[panneau crédit] mémoire locale indisponible', e);
          }
        } else {
          const maintenant = Date.now();
          if (maintenant - dernierRefus.current < 5000) return;
          dernierRefus.current = maintenant;
          // Un refus vient d'arriver : la jauge doit le montrer tout de suite.
          setEtat((e) => (e.kind === 'lu' ? { kind: 'lu', part: 0, epuise: true } : e));
        }
        setPanneau(true);
      })();
    });
  }, []);

  if (etat.kind === 'lecture') return null;

  const pct = etat.kind === 'lu' ? Math.round(etat.part * 100) : 0;
  const message =
    etat.kind === 'illisible' ? t.indispo : etat.epuise ? t.vide : t.reste.replace('{p}', String(pct));

  return (
    <>
      <View pointerEvents="box-none" style={[styles.haut, { top: insets.top }]}>
        <Pressable
          onPress={() => setBulle((b) => !b)}
          hitSlop={{ top: 8, bottom: 16, left: 0, right: 0 }}
          accessibilityRole="button"
          accessibilityLabel={t.aria}
          accessibilityHint={message}
          style={styles.piste}
        >
          {etat.kind === 'lu' ? (
            <View style={[styles.rempli, { width: `${pct}%` }]} />
          ) : (
            <View style={[styles.rempli, styles.gris, { width: '100%' }]} />
          )}
        </Pressable>
        {bulle ? (
          <Pressable onPress={() => setBulle(false)} style={styles.bulle}>
            <Text style={styles.bulleTexte}>{message}</Text>
            {etat.kind === 'lu' ? <Text style={styles.bulleSous}>{t.recharge}</Text> : null}
          </Pressable>
        ) : null}
      </View>

      <Modal visible={panneau} transparent animationType="fade" onRequestClose={() => setPanneau(false)}>
        <Pressable style={styles.voile} onPress={() => setPanneau(false)}>
          <Pressable style={[styles.feuille, { paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
            <View style={styles.jaugeVide} />
            <Text style={styles.titre} accessibilityRole="header">
              {t.titre}
            </Text>
            <Text style={styles.corps}>{t.tri}</Text>
            <Text style={styles.demain}>{t.demain}</Text>
            <Pressable onPress={() => setPanneau(false)} style={styles.bouton} accessibilityRole="button">
              <Text style={styles.boutonTexte}>{t.fermer}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  haut: { position: 'absolute', left: 0, right: 0, zIndex: 50, elevation: 50 },
  piste: { height: 3, backgroundColor: 'rgba(255,255,255,0.10)' },
  rempli: { height: 3, backgroundColor: colors.terracottaVivid },
  gris: { backgroundColor: 'rgba(255,255,255,0.25)' },
  bulle: {
    position: 'absolute',
    top: 10,
    right: 16,
    maxWidth: 300,
    backgroundColor: colors.charcoalSoft,
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bulleTexte: { color: colors.cream, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  bulleSous: { color: colors.onDarkMuted, fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  voile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: colors.charcoal,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderColor: colors.charline,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  jaugeVide: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 20 },
  titre: { color: colors.cream, fontFamily: fonts.sansSemibold, fontSize: 19, letterSpacing: -0.2 },
  corps: { color: colors.onDarkMuted, fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  demain: { color: colors.cream, fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21, marginTop: 16 },
  bouton: {
    marginTop: 22,
    backgroundColor: colors.terracottaVivid,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  boutonTexte: { color: '#fff', fontFamily: fonts.sansSemibold, fontSize: 15 },
});
