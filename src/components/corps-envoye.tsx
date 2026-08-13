import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { apiPost } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

// Chantier E / C — 11/08/2026. Dictionnaire autonome (même patron que les autres
// écrans) : 4 chaînes ne justifient pas de toucher au gros dictionnaire.
const LIRE_STR: Record<
  string,
  { chargement: string; tout: string; replier: string; abrege: string }
> = {
  fr: { chargement: 'Chargement du message…', tout: 'Afficher tout', replier: 'Replier', abrege: 'Version abrégée — le message complet n’a pas pu être récupéré.' },
  en: { chargement: 'Loading the message…', tout: 'Show all', replier: 'Collapse', abrege: 'Shortened version — the full message could not be retrieved.' },
  es: { chargement: 'Cargando el mensaje…', tout: 'Mostrar todo', replier: 'Contraer', abrege: 'Versión abreviada: no se ha podido recuperar el mensaje completo.' },
  de: { chargement: 'Nachricht wird geladen…', tout: 'Alles anzeigen', replier: 'Einklappen', abrege: 'Gekürzte Fassung – die vollständige Nachricht konnte nicht geladen werden.' },
  pt: { chargement: 'A carregar a mensagem…', tout: 'Mostrar tudo', replier: 'Recolher', abrege: 'Versão abreviada — não foi possível obter a mensagem completa.' },
  it: { chargement: 'Caricamento del messaggio…', tout: 'Mostra tutto', replier: 'Comprimi', abrege: 'Versione abbreviata — non è stato possibile recuperare il messaggio completo.' },
  ar: { chargement: 'جارٍ تحميل الرسالة…', tout: 'عرض الكل', replier: 'طيّ', abrege: 'نسخة مختصرة — تعذّر استرجاع الرسالة كاملة.' },
  ru: { chargement: 'Загрузка сообщения…', tout: 'Показать полностью', replier: 'Свернуть', abrege: 'Сокращённая версия — не удалось получить письмо целиком.' },
};


function htmlToTexte(input: string): string {
  let t = String(input || '');
  t = t.replace(/<!--[\s\S]*?-->/g, '');
  t = t.replace(/<head[\s\S]*?<\/head>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  // ⚠️ « BLANC » NE VEUT PAS DIRE « ESPACE ».
  //
  // Les lignes « vides » d'un mail en tables ne sont pas vides. Deux mesures :
  //   - sur le gabarit du mail « code de connexion » lu depuis le disque (LF) :
  //     14 lignes, tout va bien ;
  //   - sur l'APPAREIL, via une sonde posée dans l'écran le 11/08 :
  //     `lignes=58  vides=49  codes_vides=[U+000D]`.
  // Gmail renvoie le corps en CRLF : chaque ligne vide contient un retour
  // chariot. `[ \t]` ne le voit pas, donc `\n{3,}` ne voyait jamais trois
  // retours d'affilée et rien n'était regroupé. C'est le grand vide qu'a vu HA.
  //
  // `[^\S\n]` = tout caractère d'espacement SAUF le retour à la ligne : \r, \t,
  // l'espace insécable U+00A0, toutes les espaces Unicode. Les caractères de
  // largeur nulle ne sont pas des espaces pour `\s` : on les retire à part.
  //
  // Reproduction du 11/08, même gabarit converti en CRLF :
  //   avant : 58 lignes / 49 vides   ·   après : 14 lignes / 5 vides
  // (les chiffres de la sonde au caractère près).
  return t
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Corps d'un mail ENVOYÉ, replié. Jumeau mobile de `components/mail-body-panel.tsx`
 * côté web — arbitrage HA du 11/08 : replié à 32 % d'écran, fondu de coupe,
 * « Afficher tout », pas d'ascenseur imbriqué.
 *
 * DEPLACE ICI LE 13/08/2026 : il vivait dans `app/(tabs)/sent.tsx`, ou taper une
 * carte le depliait sur place. HA : « qd ds envoyés on puisse vraiment cliquer sur
 * un mail et qu'il s'ouvre vraiment ». La liste ne deplie plus rien, ce composant
 * n'a donc plus qu'un seul appelant : la page `/sent/[id]`.
 *
 * ⚠️ IL EST POSE SUR LE FOND SOMBRE DE LA PAGE, plus dans une carte creme. Le
 * texte passe en `onDark` et le degrade de coupe part de `fond`, pas de
 * `surface` — sinon la coupe se ferait vers une couleur qui n'est pas la.
 *
 * `sent_items.content` porte déjà le corps complet (mesuré le 11/08 : 107 lignes
 * sur 117, moyenne 16 977 caractères, maximum 57 302). `/api/message-body` le rend
 * donc SANS appeler le fournisseur : ouvrir un envoi ne coûte qu'une lecture en base.
 */
export function CorpsEnvoye({
  sentId,
  apercu,
  locale,
}: {
  sentId: string;
  apercu: string;
  locale: string;
}) {
  const lire = LIRE_STR[locale] ?? LIRE_STR.en;
  const { height: hauteurEcran } = useWindowDimensions();
  // Vide au depart : pendant le chargement on n'affiche AUCUN texte (meme regle
  // que l'ecran d'un mail recu et que le web). L'apercu ne sort qu'en cas d'echec.
  const [corps, setCorps] = useState('');
  const [charge, setCharge] = useState(false);
  const [abrege, setAbrege] = useState(true);
  const [deplie, setDeplie] = useState(false);
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    let vivant = true;
    apiPost<{ corps?: string; source?: string }>('/api/message-body', { sentId })
      .then((j) => {
        if (!vivant) return;
        if (j?.corps) {
          setCorps(htmlToTexte(j.corps));
          setAbrege(j.source !== 'fournisseur' && j.source !== 'base_complet');
        }
      })
      .catch(() => {
        // RIEN EN SILENCE : on sort l'aperçu ET le bandeau « version abrégée ».
        if (vivant) setCorps(apercu);
      })
      .finally(() => {
        if (vivant) setCharge(true);
      });
    return () => {
      vivant = false;
    };
  }, [sentId]);

  // 32 % de l'écran, plancher à 200 px — mêmes valeurs que l'écran d'un mail
  // reçu et que le web. Voir app/email/[id].tsx pour le détail du plancher.
  const hauteurRepliee = Math.max(200, Math.round(hauteurEcran * 0.32));
  const deborde = hauteur > hauteurRepliee + 48;

  return (
    <View style={styles.corpsWrap}>
      {!charge ? (
        <Text style={styles.corpsNote}>{lire.chargement}</Text>
      ) : abrege ? (
        <Text style={styles.corpsNote}>{lire.abrege}</Text>
      ) : null}
      {charge ? (
        <>
      <View style={deplie || !deborde ? undefined : { maxHeight: hauteurRepliee, overflow: 'hidden' }}>
        {/* On ne garde QUE la plus grande hauteur vue : sinon le clipping ferait
            retomber `deborde` a faux et l'encadre oscillerait indefiniment. */}
        <View
          onLayout={(e) => {
            // ⚠️ Même correction que app/email/[id].tsx : lire l'événement AVANT que
            // React Native ne le recycle. L'updater de setState arrive trop tard et
            // recevait `e.nativeEvent === null` — l'app se fermait au clic.
            const hauteurMesuree = e.nativeEvent.layout.height;
            setHauteur((h) => Math.max(h, hauteurMesuree));
          }}
        >
          <Text style={styles.corpsTexte}>{corps}</Text>
        </View>
        {deborde && !deplie ? (
          // Vrai dégradé, comme l'écran d'un mail reçu : les sept bandes
          // empilées se voyaient une par une au lieu de fondre.
          <LinearGradient
            pointerEvents="none"
            colors={[colors.fondT, colors.fond]}
            style={styles.fondu}
          />
        ) : null}
      </View>
      {deborde ? (
        <Pressable style={styles.deplierBtn} onPress={() => setDeplie((v) => !v)}>
          <Text style={styles.deplierBtnText}>{deplie ? lire.replier : lire.tout}</Text>
        </Pressable>
      ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corpsWrap: { marginTop: spacing.sm },
  // Poses sur le fond sombre de la page : jetons clairs.
  corpsNote: { fontFamily: fonts.sans, fontSize: 12, color: colors.onDarkMuted, lineHeight: 17, marginBottom: 6 },
  corpsTexte: { fontFamily: fonts.sans, fontSize: 15, color: colors.onDark, lineHeight: 24 },
  fondu: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 52 },
  deplierBtn: {
    marginTop: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  deplierBtnText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.ink },
});

export default CorpsEnvoye;
