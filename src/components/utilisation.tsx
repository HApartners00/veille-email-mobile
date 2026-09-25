import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/i18n';
import { apiGet } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * RÉGLAGES › UTILISATION — 25/09/2026.
 *
 * Demande de HA : « comme dans l'appli Claude », pour savoir où on en est.
 * UN SEUL bloc (HA : « je veux pas de détails ») : le crédit du jour, « N %
 * utilisé », et dans combien de temps il repart. Pas de répartition par action.
 *
 * Même contenu que le web (apps/web/src/components/usage-panel.tsx), SANS le lien
 * « Plus de crédit » : l'app ne parle ni de formule ni de prix (App Store 3.1.1).
 * Aucun montant : la part du crédit du jour, lue sur /api/credit.
 */

type Etat =
  | { kind: 'lecture' }
  | { kind: 'lu'; restante: number; reinitialise_a: string }
  | { kind: 'illisible' };

type Dict = {
  titre: string;
  jour: string;
  utilise: string;
  dans: string;
  minuit: string;
  illisible: string;
  h: string;
  min: string;
};

// Copie des textes du web (usage-panel.tsx), sans « Plus de crédit ». Toucher
// l'un, toucher l'autre.
const STR: Record<string, Dict> = {
  fr: { titre: 'Utilisation', jour: 'Crédit du jour', utilise: '{p} % utilisé', dans: 'Se recharge dans {d}', minuit: 'Se recharge à minuit', illisible: 'Utilisation indisponible pour le moment. Réessayez dans un instant.', h: 'h', min: 'min' },
  en: { titre: 'Usage', jour: "Today's credit", utilise: '{p}% used', dans: 'Refills in {d}', minuit: 'Refills at midnight', illisible: 'Usage is unavailable right now. Please try again in a moment.', h: 'h', min: 'min' },
  es: { titre: 'Uso', jour: 'Crédito de hoy', utilise: '{p} % usado', dans: 'Se recarga en {d}', minuit: 'Se recarga a medianoche', illisible: 'El uso no está disponible en este momento. Inténtalo de nuevo en un momento.', h: 'h', min: 'min' },
  de: { titre: 'Nutzung', jour: 'Heutiges Guthaben', utilise: '{p} % verbraucht', dans: 'Wird aufgeladen in {d}', minuit: 'Wird um Mitternacht aufgeladen', illisible: 'Die Nutzung ist gerade nicht verfügbar. Bitte gleich erneut versuchen.', h: 'Std.', min: 'Min.' },
  pt: { titre: 'Utilização', jour: 'Crédito de hoje', utilise: '{p} % usado', dans: 'Recarrega dentro de {d}', minuit: 'Recarrega à meia-noite', illisible: 'A utilização está indisponível de momento. Tente de novo dentro de instantes.', h: 'h', min: 'min' },
  it: { titre: 'Utilizzo', jour: 'Credito di oggi', utilise: '{p}% usato', dans: 'Si ricarica tra {d}', minuit: 'Si ricarica a mezzanotte', illisible: "L'utilizzo non è disponibile al momento. Riprova tra un istante.", h: 'h', min: 'min' },
  ar: { titre: 'الاستخدام', jour: 'رصيد اليوم', utilise: 'استُخدم {p}٪', dans: 'يتجدّد خلال {d}', minuit: 'يتجدّد عند منتصف الليل', illisible: 'الاستخدام غير متاح حاليًا. أعد المحاولة بعد قليل.', h: 'س', min: 'د' },
  ru: { titre: 'Использование', jour: 'Кредит на сегодня', utilise: 'Использовано {p} %', dans: 'Пополнится через {d}', minuit: 'Пополняется в полночь', illisible: 'Данные об использовании сейчас недоступны. Повторите попытку через минуту.', h: 'ч', min: 'мин' },
};

/** Titre de la rubrique, pour l'index des réglages et le bandeau du sous-écran. */
export function utilisationTitre(locale: string): string {
  return (STR[locale] ?? STR.en!).titre;
}

function avantRecharge(iso: string, t: Dict): string | null {
  const fin = Date.parse(iso);
  if (!Number.isFinite(fin)) return null;
  const min = Math.max(0, Math.round((fin - Date.now()) / 60000));
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} ${t.h} ${String(m).padStart(2, '0')} ${t.min}` : `${m} ${t.min}`;
}

function pourcent(part: number): string {
  if (part > 0 && part < 0.005) return '< 1';
  return String(Math.round(part * 100));
}

export default function Utilisation() {
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const [etat, setEtat] = useState<Etat>({ kind: 'lecture' });
  const [, setTic] = useState(0);

  const lire = useCallback(async () => {
    try {
      const j = await apiGet<{ part_restante?: number; reinitialise_a?: string }>('/api/credit');
      const restante = Number(j?.part_restante);
      if (!Number.isFinite(restante)) {
        console.error('[utilisation] réponse sans part_restante');
        setEtat({ kind: 'illisible' });
        return;
      }
      setEtat({
        kind: 'lu',
        restante: Math.max(0, Math.min(1, restante)),
        reinitialise_a: String(j?.reinitialise_a || ''),
      });
    } catch (e) {
      console.error('[utilisation] lecture impossible', e);
      setEtat({ kind: 'illisible' });
    }
  }, []);

  useEffect(() => {
    void lire();
    const a = setInterval(() => void lire(), 120_000);
    const b = setInterval(() => setTic((x) => x + 1), 60_000);
    const abo = AppState.addEventListener('change', (s) => {
      if (s === 'active') void lire();
    });
    return () => {
      clearInterval(a);
      clearInterval(b);
      abo.remove();
    };
  }, [lire]);

  if (etat.kind === 'lecture') return <View style={styles.page} />;
  if (etat.kind === 'illisible') {
    return (
      <View style={styles.page}>
        <View style={styles.carte}>
          <Text style={styles.texte}>{t.illisible}</Text>
        </View>
      </View>
    );
  }

  const utilise = 1 - etat.restante;
  const dans = avantRecharge(etat.reinitialise_a, t);

  return (
    <View style={styles.page}>
      <View style={styles.carte}>
        <View style={styles.ligneHaut}>
          <Text style={styles.titreCarte}>{t.jour}</Text>
          <Text style={styles.valeur}>{t.utilise.replace('{p}', pourcent(utilise))}</Text>
        </View>
        <View
          style={styles.piste}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(utilise * 100) }}
        >
          <View style={[styles.rempli, { width: `${Math.round(utilise * 100)}%` }]} />
        </View>
        <Text style={styles.sous}>{dans ? t.dans.replace('{d}', dans) : t.minuit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg },
  carte: {
    backgroundColor: colors.charcoalSoft,
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  ligneHaut: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  titreCarte: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.cream, flexShrink: 1 },
  valeur: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.cream },
  texte: { fontFamily: fonts.sans, fontSize: 14, color: colors.cream, flexShrink: 1 },
  sous: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.onDarkMuted, marginTop: spacing.sm },
  piste: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden', marginTop: spacing.md },
  rempli: { height: 8, borderRadius: 4, backgroundColor: colors.terracottaVivid },
});
