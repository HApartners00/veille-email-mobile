import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconClose } from '@/components/icons';
import { apiGet } from '@/lib/api';
import { tailleLisible, textesPjSignature } from '@/lib/i18n/signature-pj';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * LE FICHIER DE LA SIGNATURE, DANS UN MAIL — 09/10/2026.
 * Jumeau de `Veille Email/apps/web/src/components/pj-signature.tsx`.
 *
 * L'écran demande au SERVEUR quel fichier partira (par mail reçu, ou par boîte d'envoi) :
 * c'est la même règle qu'à l'envoi, l'écran montre donc exactement ce qui part. La personne
 * peut le retirer de CE mail (✕) — l'écran envoie alors `pjSignature: false`.
 *
 * Une lecture en échec n'est PAS « pas de fichier » : le serveur, lui, le joindra quand
 * même. On le DIT (`nonVerifie`), au lieu d'afficher un mail sans fichier qui partirait avec.
 */
export type PjSig = { nom: string; taille: number; type: string };

export function usePjSignature(source: { itemId?: string; boite?: string }) {
  const [pj, setPj] = useState<PjSig | null>(null);
  const [joindre, setJoindre] = useState(true);
  const [nonVerifie, setNonVerifie] = useState(false);
  const requete = source.itemId
    ? `item_id=${encodeURIComponent(source.itemId)}`
    : source.boite
      ? `boite=${encodeURIComponent(source.boite)}`
      : '';
  useEffect(() => {
    if (!requete) {
      setPj(null);
      setNonVerifie(false);
      return;
    }
    let annule = false;
    apiGet<{ pj?: PjSig | null }>(`/api/signature/piece-jointe?${requete}`)
      .then((j) => {
        if (annule) return;
        setPj(j?.pj ?? null);
        setNonVerifie(false);
        setJoindre(true);
      })
      .catch((e) => {
        if (annule) return;
        console.error('[signature] fichier de la signature non vérifié', e);
        setPj(null);
        setNonVerifie(true);
      });
    return () => {
      annule = true;
    };
  }, [requete]);
  return { pj, joindre, setJoindre, nonVerifie };
}

export default function PjSignature({
  pj,
  joindre,
  setJoindre,
  nonVerifie,
  locale,
  desactive = false,
}: {
  pj: PjSig | null;
  joindre: boolean;
  setJoindre: (v: boolean) => void;
  nonVerifie: boolean;
  locale: string;
  /** Pendant un envoi : on ne change plus ce qui part. */
  desactive?: boolean;
}) {
  const t = textesPjSignature(locale);
  if (nonVerifie) return <Text style={styles.alerte}>{t.nonVerifie}</Text>;
  if (!pj) return null;
  if (!joindre) {
    return (
      <Pressable onPress={() => setJoindre(true)} disabled={desactive} hitSlop={6}>
        <Text style={[styles.remettre, desactive && styles.eteint]}>{t.remettre(pj.nom)}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.ligne}>
      <Text style={styles.nom} numberOfLines={1}>
        {pj.nom}
        <Text style={styles.taille}>{'  ' + tailleLisible(pj.taille, locale)}</Text>
      </Text>
      <View style={styles.etiquette}>
        <Text style={styles.etiquetteTexte}>{t.etiquette}</Text>
      </View>
      <Pressable
        onPress={() => setJoindre(false)}
        disabled={desactive}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t.retirerDeCeMail}
      >
        <IconClose size={15} color={colors.hint} />
      </Pressable>
    </View>
  );
}

// Même dessin que les lignes de pièces jointes de la réponse (app/email/[id].tsx, attRow).
const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    backgroundColor: 'rgba(234,225,208,0.05)',
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  nom: { fontFamily: fonts.sans, flex: 1, fontSize: 13, color: colors.onDark },
  taille: { fontFamily: fonts.sans, fontSize: 12, color: colors.onDarkMuted },
  etiquette: {
    borderWidth: 1,
    borderColor: colors.charline,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  etiquetteTexte: {
    fontFamily: fonts.sansSemibold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  remettre: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.onDarkMuted,
    textDecorationLine: 'underline',
    marginTop: spacing.xs,
  },
  alerte: { fontFamily: fonts.sans, fontSize: 12.5, color: '#f0957a', marginTop: spacing.xs, lineHeight: 18 },
  eteint: { opacity: 0.6 },
});
