import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiGet, apiPost } from '@/lib/api';
import { ecouterCreditEpuise, signalerCreditEpuise, type SignalEpuise } from '@/lib/credit';
import { colors, fonts } from '@/lib/theme';

/**
 * LES PANNEAUX DU CRÉDIT DU JOUR — APP.
 *
 * 25/09/2026 : une barre fine en haut de l'écran + un panneau « crédit épuisé ».
 * 26/09/2026 — DÉCISION DE HA : LA BARRE EST RETIRÉE. À la place, un PANNEAU
 * prévient à 75 % puis à 90 % du crédit du jour (« 75 % de votre crédit du jour
 * utilisé — Il se recharge à minuit. »). Une fois par COMPTE et par jour : le
 * serveur réserve le panneau (POST /api/credit/seuil) avant qu'on l'affiche, donc
 * vu sur le web = pas remontré ici. Le suivi reste dans Réglages › Utilisation.
 * Le panneau « épuisé » à 100 % est gardé tel quel.
 *
 * ⚠️ La barre faisait aussi un travail invisible : elle ouvrait le panneau
 * « épuisé » une fois par jour quand le crédit était déjà vide à l'ouverture.
 * Ce composant garde donc la LECTURE (ouverture, retour dans l'app, toutes les
 * 2 minutes) — il n'affiche plus rien d'autre que les panneaux.
 *
 * 🔴 DIFFÉRENCE VOULUE AVEC LE WEB : AUCUNE OFFRE, AUCUN PRIX, AUCUN LIEN vers une
 * formule ou vers le site (règle App Store 3.1.1, et la même chez Google). La
 * proposition de formule part par email, hors de l'app.
 */

type Dict = {
  titre: string;
  tri: string;
  demain: string;
  fermer: string;
  /** 26/09/2026 — {p} = 75 ou 90. */
  seuilTitre: string;
  seuilTexte: string;
};

const STR: Record<string, Dict> = {
  fr: {
    titre: 'Crédit du jour épuisé',
    tri: 'Il se recharge à minuit. Le tri de vos nouveaux emails reprendra à ce moment-là.',
    demain: 'Revenez demain : tout reprendra automatiquement.',
    fermer: 'Compris',
    seuilTitre: '{p} % de votre crédit du jour utilisé',
    seuilTexte: 'Il se recharge à minuit.',
  },
  en: {
    titre: 'Today’s credit is used up',
    tri: 'It refills at midnight. Sorting of your new emails resumes then.',
    demain: 'Come back tomorrow: everything restarts on its own.',
    fermer: 'Got it',
    seuilTitre: '{p}% of today’s credit used',
    seuilTexte: 'It refills at midnight.',
  },
  es: {
    titre: 'Crédito de hoy agotado',
    tri: 'Se recarga a medianoche. La clasificación de tus nuevos correos se reanudará entonces.',
    demain: 'Vuelve mañana: todo se reanudará solo.',
    fermer: 'Entendido',
    seuilTitre: 'Has usado el {p} % del crédito de hoy',
    seuilTexte: 'Se recarga a medianoche.',
  },
  de: {
    titre: 'Heutiges Guthaben aufgebraucht',
    tri: 'Es wird um Mitternacht aufgeladen. Dann wird auch die Sortierung neuer E-Mails fortgesetzt.',
    demain: 'Kommen Sie morgen wieder: alles läuft von selbst weiter.',
    fermer: 'Verstanden',
    seuilTitre: '{p} % des heutigen Guthabens verbraucht',
    seuilTexte: 'Es wird um Mitternacht aufgeladen.',
  },
  pt: {
    titre: 'Crédito de hoje esgotado',
    tri: 'Recarrega à meia-noite. A triagem dos seus novos emails retoma nessa altura.',
    demain: 'Volte amanhã: tudo recomeça sozinho.',
    fermer: 'Entendido',
    seuilTitre: '{p} % do crédito de hoje utilizado',
    seuilTexte: 'Recarrega à meia-noite.',
  },
  it: {
    titre: 'Credito di oggi esaurito',
    tri: 'Si ricarica a mezzanotte. L’ordinamento delle nuove email riprenderà allora.',
    demain: 'Torna domani: tutto ripartirà da solo.',
    fermer: 'Ho capito',
    seuilTitre: '{p}% del credito di oggi utilizzato',
    seuilTexte: 'Si ricarica a mezzanotte.',
  },
  ar: {
    titre: 'نفد رصيد اليوم',
    tri: 'يتجدّد عند منتصف الليل، ويُستأنف حينها فرز رسائلك الجديدة.',
    demain: 'عُد غدًا: سيعود كل شيء تلقائيًا.',
    fermer: 'حسنًا',
    seuilTitre: 'استُخدم {p}٪ من رصيد اليوم',
    seuilTexte: 'يُجدَّد عند منتصف الليل.',
  },
  ru: {
    titre: 'Кредит на сегодня исчерпан',
    tri: 'Он пополнится в полночь. Тогда же возобновится сортировка новых писем.',
    demain: 'Возвращайтесь завтра: всё возобновится само.',
    fermer: 'Понятно',
    seuilTitre: 'Использовано {p} % сегодняшнего кредита',
    seuilTexte: 'Пополняется в полночь.',
  },
};

const CLE_PANNEAU = 'credit.panneau.';

type Panneau = null | 'epuise' | 75 | 90;

export default function CreditOverlay() {
  const { session } = useAuth();
  if (!session) return null;
  return <CreditOverlayConnecte />;
}

function CreditOverlayConnecte() {
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const insets = useSafeAreaInsets();
  const [panneau, setPanneau] = useState<Panneau>(null);
  const dernierRefus = useRef(0);

  const lire = useCallback(async () => {
    try {
      const j = await apiGet<{ epuise?: boolean; reinitialise_a?: string; seuil?: number | null }>(
        '/api/credit',
      );
      if (j?.epuise === true) {
        signalerCreditEpuise({ source: 'jauge', reinitialise_a: j?.reinitialise_a ?? null });
        return;
      }
      if (j?.seuil === 75 || j?.seuil === 90) {
        // Le serveur réserve le panneau : s'il a déjà été montré (web, autre
        // appareil), il répond null et on n'affiche rien.
        const k = await apiPost<{ seuil?: number | null }>('/api/credit/seuil', {});
        if (k?.seuil === 75 || k?.seuil === 90) {
          const s = k.seuil;
          // Jamais par-dessus le panneau « épuisé ».
          setPanneau((p) => (p === 'epuise' ? p : s));
        }
      }
    } catch (e) {
      console.error('[crédit] lecture impossible', e);
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

  // Le panneau « épuisé » : à chaque refus (sauf rafale), une fois par jour quand
  // c'est la lecture à l'ouverture qui le constate.
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
        }
        setPanneau('epuise');
      })();
    });
  }, []);

  const fermer = () => setPanneau(null);
  const seuil = panneau === 75 || panneau === 90 ? panneau : null;

  return (
    <Modal visible={panneau !== null} transparent animationType="fade" onRequestClose={fermer}>
      <Pressable style={styles.voile} onPress={fermer}>
        <Pressable style={[styles.feuille, { paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
          {/* Ce qu'il reste du crédit du jour : rien (épuisé), 25 % ou 10 %. */}
          <View style={styles.jaugeVide}>
            {seuil ? <View style={[styles.jaugeReste, { width: `${100 - seuil}%` }]} /> : null}
          </View>
          {seuil ? (
            <>
              <Text style={styles.titre} accessibilityRole="header">
                {t.seuilTitre.replace('{p}', String(seuil))}
              </Text>
              <Text style={styles.corps}>{t.seuilTexte}</Text>
            </>
          ) : (
            <>
              <Text style={styles.titre} accessibilityRole="header">
                {t.titre}
              </Text>
              <Text style={styles.corps}>{t.tri}</Text>
              <Text style={styles.demain}>{t.demain}</Text>
            </>
          )}
          <Pressable onPress={fermer} style={styles.bouton} accessibilityRole="button">
            <Text style={styles.boutonTexte}>{t.fermer}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  jaugeVide: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.10)', marginBottom: 20, overflow: 'hidden' },
  jaugeReste: { height: 3, borderRadius: 2, backgroundColor: colors.terracottaVivid },
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
