import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconArchive, IconCheck, IconClose, IconFlag, IconMail, IconTrash, IconUndo } from '@/components/icons';
import { ROUGE_GLISSER, VERT_GLISSER } from '@/components/ligne-glissable';
import type { OpBoite } from '@/lib/actions-groupees';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * SÉLECTION DE PLUSIEURS MAILS — les trois morceaux d'écran (09/10/2026).
 *
 *   · `BarreActions`    : en BAS, au-dessus des onglets. Une ligne « ✕ · 3 sélectionnés ·
 *                         Tout », puis les actions du dossier, Lu, Non lu, Catégorie.
 *                         Pendant un lot : « En cours… 3/12 ».
 *                         Tout est EN BAS, sous le pouce : une barre fixe en haut aurait
 *                         recouvert à moitié le grand titre de l'écran (vu au rendu).
 *   · `BandeauResultat` : en bas, après une action — ce qui a été fait, « Annuler »
 *                         quand l'action a un inverse, ou l'échec en clair.
 *
 * Entrée en sélection : appui long sur un mail (choix de HA). Sortie : ✕, ou après une
 * action. Rien ici n'appelle le serveur : c'est l'écran qui agit.
 */

type Bouton = { cle: string; libelle: string; Icone: typeof IconArchive; couleur?: string; onPress: () => void };

export function BarreActions({
  nombre,
  libelleTout,
  libelleFermer,
  toutCoche,
  onFermer,
  onTout,
  ops,
  libelleOp,
  libelleLu,
  libelleNonLu,
  libelleCategorie,
  enCours,
  onOp,
  onLu,
  onNonLu,
  onCategorie,
}: {
  nombre: string;
  libelleTout: string;
  libelleFermer: string;
  toutCoche: boolean;
  onFermer: () => void;
  onTout: () => void;
  ops: OpBoite[];
  libelleOp: (op: OpBoite) => string;
  libelleLu: string;
  libelleNonLu: string;
  libelleCategorie: string;
  /** Texte d'avancement pendant un lot ; `null` = boutons actifs. */
  enCours: string | null;
  onOp: (op: OpBoite) => void;
  onLu: () => void;
  onNonLu: () => void;
  onCategorie: () => void;
}) {
  if (enCours) {
    return (
      <View style={[st.barreBas, st.barreBasEnCours]}>
        <ActivityIndicator color={colors.terracottaVivid} />
        <Text style={st.enCours}>{enCours}</Text>
      </View>
    );
  }
  const boutons: Bouton[] = [
    ...ops.map((op) => ({
      cle: op,
      libelle: libelleOp(op),
      Icone: op === 'trash' ? IconTrash : op === 'archive' ? IconArchive : IconUndo,
      couleur: op === 'trash' ? ROUGE_GLISSER : op === 'archive' ? VERT_GLISSER : undefined,
      onPress: () => onOp(op),
    })),
    { cle: 'lu', libelle: libelleLu, Icone: IconCheck, onPress: onLu },
    { cle: 'nonlu', libelle: libelleNonLu, Icone: IconMail, onPress: onNonLu },
    { cle: 'categorie', libelle: libelleCategorie, Icone: IconFlag, onPress: onCategorie },
  ];
  return (
    <View style={[st.barreBas, st.barreBasColonne]}>
      <View style={st.ligneHaut}>
        <Pressable onPress={onFermer} hitSlop={10} accessibilityRole="button" accessibilityLabel={libelleFermer} style={st.rond}>
          <IconClose size={16} color={colors.onDark} />
        </Pressable>
        <Text style={st.nombre} numberOfLines={1}>
          {nombre}
        </Text>
        <Pressable
          onPress={onTout}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: toutCoche }}
          style={[st.tout, toutCoche && st.toutOn]}
        >
          {toutCoche ? <IconCheck size={13} color={colors.charcoal} strokeWidth={2.8} /> : null}
          <Text style={[st.toutTexte, toutCoche && st.toutTexteOn]}>{libelleTout}</Text>
        </Pressable>
      </View>
      <View style={st.ligneBoutons}>
      {boutons.map((b) => (
        <Pressable
          key={b.cle}
          onPress={b.onPress}
          accessibilityRole="button"
          accessibilityLabel={b.libelle}
          style={({ pressed }) => [st.bouton, pressed && st.boutonPresse]}
        >
          <View style={[st.pastille, b.couleur ? { backgroundColor: b.couleur } : null]}>
            <b.Icone size={19} color={b.couleur ? '#fff' : colors.onDark} />
          </View>
          <Text style={st.boutonTexte} numberOfLines={1}>
            {b.libelle}
          </Text>
        </Pressable>
      ))}
      </View>
    </View>
  );
}

export function BandeauResultat({
  message,
  erreur,
  libelleAnnuler,
  onAnnuler,
  onFermer,
}: {
  message: string;
  erreur?: boolean;
  /** Absent = pas d'annulation proposée (lu, catégorie, échec complet). */
  libelleAnnuler?: string;
  onAnnuler?: () => void;
  onFermer: () => void;
}) {
  return (
    <View style={[st.bandeau, erreur && st.bandeauErreur]} accessibilityLiveRegion="polite">
      <Text style={st.bandeauTexte} numberOfLines={3}>
        {message}
      </Text>
      {libelleAnnuler && onAnnuler ? (
        <Pressable onPress={onAnnuler} hitSlop={8} accessibilityRole="button">
          <Text style={st.annuler}>{libelleAnnuler}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onFermer} hitSlop={10} accessibilityRole="button" accessibilityLabel="OK">
          <IconClose size={16} color={colors.onDarkMuted} />
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  rond: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(234,225,208,0.10)',
  },
  nombre: { flex: 1, fontFamily: fonts.sansBold, fontSize: 16, color: colors.onDark },
  tout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.30)',
  },
  toutOn: { backgroundColor: colors.onDark, borderColor: colors.onDark },
  toutTexte: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.onDark },
  toutTexteOn: { color: colors.charcoal },

  barreBas: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: radius.lg,
    backgroundColor: '#2c2720',
    borderWidth: 1,
    borderColor: colors.charline,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  barreBasColonne: { flexDirection: 'column', paddingTop: 10, paddingHorizontal: 12, gap: 12 },
  ligneHaut: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 2 },
  ligneBoutons: { flexDirection: 'row', justifyContent: 'space-around' },
  barreBasEnCours: { justifyContent: 'center', gap: spacing.md, paddingVertical: 18 },
  enCours: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.onDark },
  bouton: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 2, borderRadius: radius.md },
  boutonPresse: { backgroundColor: 'rgba(234,225,208,0.08)' },
  pastille: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(234,225,208,0.10)',
  },
  boutonTexte: { fontFamily: fonts.sansMedium, fontSize: 11, color: colors.onDark },

  bandeau: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    zIndex: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  bandeauErreur: { backgroundColor: '#f6ddd5' },
  bandeauTexte: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 19, color: colors.ink },
  annuler: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.terracotta },
});
