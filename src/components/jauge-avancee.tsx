import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/i18n';
import type { Avancee, CleAction } from '@/lib/avancee';
import { fonts, spacing } from '@/lib/theme';

/**
 * LA JAUGE D'AVANCÉE — ACCUEIL DE L'APP — 26/09/2026.
 *
 * Choix de HA sur maquettes : look « B — un trait par mail », coloré par
 * catégorie quand le mail est traité ; tout traité → « V5 », tous les traits
 * verts et « ✓ Tout est traité ». Posée juste au-dessus de la section Urgent.
 * Au-delà de 20 mails, les traits se collent en une barre continue (toujours
 * colorée par catégorie). 0 mail à traiter → rien.
 *
 * La règle de calcul vit dans lib/avancee.ts. Jumelle du web :
 * Veille Email/apps/web/src/components/jauge-avancee.tsx (mêmes textes, 8 langues).
 */

/** Vert « tout est traité » (V5), lisible sur le fond sombre. */
const VERT_TRAITE = '#5fa37a';
const PISTE = 'rgba(255,255,255,0.10)';
const MAX_TRAITS_SEPARES = 20;

// Teintes des catégories sur fond sombre — les mêmes que le récap de l'Accueil
// (RECAP_TINT) et que `onDark` sur le web.
const TEINTE: Record<CleAction, string> = {
  urgent: '#e08a5a',
  important: '#d5b06a',
  human: '#9aa6ac',
};

type Dict = { compte: string; suite: string; fini: string };

const STR: Record<string, Dict> = {
  fr: { compte: '{n} sur {total}', suite: 'traités aujourd’hui', fini: 'Tout est traité' },
  en: { compte: '{n} of {total}', suite: 'handled today', fini: 'All handled' },
  es: { compte: '{n} de {total}', suite: 'gestionados hoy', fini: 'Todo gestionado' },
  de: { compte: '{n} von {total}', suite: 'heute erledigt', fini: 'Alles erledigt' },
  pt: { compte: '{n} de {total}', suite: 'tratados hoje', fini: 'Tudo tratado' },
  it: { compte: '{n} su {total}', suite: 'gestiti oggi', fini: 'Tutto gestito' },
  ar: { compte: '{n} من {total}', suite: 'عولجت اليوم', fini: 'تمت معالجة كل شيء' },
  ru: { compte: '{n} из {total}', suite: 'обработано сегодня', fini: 'Всё обработано' },
};

export function JaugeAvancee({ avancee }: { avancee: Avancee }) {
  const { locale } = useI18n();
  const t = STR[locale] ?? STR.en!;
  const { total, traites, traits } = avancee;
  if (total <= 0) return null;
  const fini = traites >= total;
  const colle = traits.length > MAX_TRAITS_SEPARES;
  const compte = t.compte.replace('{n}', String(traites)).replace('{total}', String(total));

  return (
    <View
      style={styles.bloc}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={fini ? t.fini : `${compte} ${t.suite}`}
      accessibilityValue={{ min: 0, max: total, now: traites }}
    >
      {fini ? (
        <Text style={[styles.texte, styles.fini]}>✓ {t.fini}</Text>
      ) : (
        <Text style={styles.texte}>
          <Text style={styles.compte}>{compte}</Text> {t.suite}
        </Text>
      )}
      <View style={[styles.rangee, colle && styles.rangeeColle]}>
        {traits.map((k, i) => (
          <View
            key={i}
            style={[
              styles.trait,
              colle && styles.traitColle,
              { backgroundColor: fini ? VERT_TRAITE : k ? TEINTE[k] : PISTE },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  texte: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: 'rgba(234,225,208,0.66)', marginBottom: 8 },
  compte: { fontFamily: fonts.sansSemibold, color: '#eae1d0' },
  fini: { fontFamily: fonts.sansSemibold, color: VERT_TRAITE },
  rangee: { flexDirection: 'row', gap: 4, height: 6 },
  rangeeColle: { gap: 0, borderRadius: 3, overflow: 'hidden' },
  trait: { flex: 1, height: 6, borderRadius: 3 },
  traitColle: { borderRadius: 0 },
});
