import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { apiPost } from '@/lib/api';
import { ressembleAHtml } from '@/lib/mail-format';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import MailHtml from '@/components/mail-html';

/**
 * Chantier E / C — 11/08/2026. Dictionnaire autonome (même patron que les autres
 * écrans) : quelques chaînes ne justifient pas de toucher au gros dictionnaire.
 *
 * ⚠️ `absent` AJOUTÉ LE 13/08/2026, ET CE N'EST PAS UN LIBELLÉ DE PLUS.
 *
 * L'écran ne connaissait que deux états : « on a le mail » et « version abrégée
 * — le message complet n'a pas pu être récupéré ». Il en manquait un troisième,
 * et c'est celui qui s'est présenté : LE MAIL N'A PAS DE TEXTE DU TOUT.
 *
 * Mesuré sur l'envoi du 13/08 04:32 signalé par HA (exécution n8n 27153) :
 *
 *     ok: true   corps: "\r\n"   longueur: 2   snippet: ""
 *
 * La chaîne a parfaitement fonctionné — l'API a bien interrogé Gmail, et Gmail a
 * répondu que ce mail ne contient qu'une pièce jointe. Faute de ce troisième
 * état, l'écran affichait « n'a pas pu être récupéré » : une phrase FAUSSE, qui
 * envoie chercher une panne là où il n'y en a pas. L'API disait pourtant la
 * vérité (`avertissement: 'contenu_absent'`) ; personne ne la lisait.
 */
const LIRE_STR: Record<
  string,
  { chargement: string; tout: string; replier: string; abrege: string; absent: string }
> = {
  fr: { chargement: 'Chargement du message…', tout: 'Afficher tout', replier: 'Replier', abrege: 'Version abrégée — le message complet n’a pas pu être récupéré.', absent: 'Ce message ne contient pas de texte.' },
  en: { chargement: 'Loading the message…', tout: 'Show all', replier: 'Collapse', abrege: 'Shortened version — the full message could not be retrieved.', absent: 'This message contains no text.' },
  es: { chargement: 'Cargando el mensaje…', tout: 'Mostrar todo', replier: 'Contraer', abrege: 'Versión abreviada: no se ha podido recuperar el mensaje completo.', absent: 'Este mensaje no contiene texto.' },
  de: { chargement: 'Nachricht wird geladen…', tout: 'Alles anzeigen', replier: 'Einklappen', abrege: 'Gekürzte Fassung – die vollständige Nachricht konnte nicht geladen werden.', absent: 'Diese Nachricht enthält keinen Text.' },
  pt: { chargement: 'A carregar a mensagem…', tout: 'Mostrar tudo', replier: 'Recolher', abrege: 'Versão abreviada — não foi possível obter a mensagem completa.', absent: 'Esta mensagem não contém texto.' },
  it: { chargement: 'Caricamento del messaggio…', tout: 'Mostra tutto', replier: 'Comprimi', abrege: 'Versione abbreviata — non è stato possibile recuperare il messaggio completo.', absent: 'Questo messaggio non contiene testo.' },
  ar: { chargement: 'جارٍ تحميل الرسالة…', tout: 'عرض الكل', replier: 'طيّ', abrege: 'نسخة مختصرة — تعذّر استرجاع الرسالة كاملة.', absent: 'لا تحتوي هذه الرسالة على نص.' },
  ru: { chargement: 'Загрузка сообщения…', tout: 'Показать полностью', replier: 'Свернуть', abrege: 'Сокращённая версия — не удалось получить письмо целиком.', absent: 'В этом письме нет текста.' },
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
  /**
   * ⚠️ LE CORPS EST GARDE BRUT — 13/08/2026.
   *
   * Il etait reduit en texte des l'arrivee (`htmlToTexte`), ce qui rendait
   * impossible de l'afficher tel qu'il est. HA, sur un digest envoye : « ca me
   * sort le texte en brut ». Un digest est un mail en tables : le depouiller de
   * ses balises n'en laisse qu'un mur de texte.
   *
   * La page d'un mail RECU rendait deja le vrai HTML dans une WebView depuis le
   * 11/08 ; l'ecran des envoyes etait reste au texte. La reduction n'est plus
   * qu'un REPLI, pour les mails qui ne sont pas en HTML.
   */
  const [corps, setCorps] = useState('');
  const [charge, setCharge] = useState(false);
  /**
   * CE QU'ON A LE DROIT DE DIRE SUR CE QUI EST AFFICHÉ.
   *
   *   null      le mail est là, en entier — aucun bandeau
   *   'abrege'  on n'a qu'une version partielle, ou rien, PARCE QU'ON A ÉCHOUÉ
   *   'absent'  le serveur a répondu, et il dit qu'il n'y a pas de texte
   *
   * ⚠️ CET ÉTAT NE SE DÉDUIT PAS DE `corps` VIDE. Un corps vide peut venir d'un
   * mail sans texte comme d'un réseau coupé, et ce sont deux choses opposées :
   * l'une est normale, l'autre est une panne. On le tient donc explicitement,
   * posé par la branche qui SAIT. Défaut prudent à 'abrege' : tant que rien n'a
   * répondu, on ne prétend pas montrer le mail entier.
   */
  const [raison, setRaison] = useState<null | 'abrege' | 'absent'>('abrege');
  const [deplie, setDeplie] = useState(false);
  const [hauteur, setHauteur] = useState(0);

  useEffect(() => {
    let vivant = true;
    apiPost<{ corps?: string; source?: string; avertissement?: string }>('/api/message-body', {
      sentId,
    })
      .then((j) => {
        if (!vivant) return;
        const recu = j?.corps || '';
        setCorps(recu);
        if (recu) {
          setRaison(j.source !== 'fournisseur' && j.source !== 'base_complet' ? 'abrege' : null);
          return;
        }
        // Réponse SANS corps. `contenu_absent` est le verdict de la route quand
        // ni la base ni le fournisseur n'ont de texte : ce n'est pas un échec, et
        // le dire comme tel serait envoyer chercher une panne inexistante.
        // Toute autre réponse vide reste un échec, et garde son bandeau.
        setRaison(j?.avertissement === 'contenu_absent' ? 'absent' : 'abrege');
      })
      .catch(() => {
        // RIEN EN SILENCE : on sort l'aperçu ET le bandeau « version abrégée ».
        // Un réseau coupé n'est JAMAIS 'absent', même si l'aperçu est vide.
        if (vivant) {
          setCorps(apercu);
          setRaison('abrege');
        }
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

  const estHtml = ressembleAHtml(corps);
  /**
   * Le texte n'est calcule QUE si on va s'en servir. `htmlToTexte` passe une
   * douzaine d'expressions regulieres sur le corps entier — un digest fait
   * 18 000 caracteres, et le refaire a chaque rendu (deplier, mesurer la
   * hauteur, tourner l'ecran) se paierait a l'usage.
   */
  const texte = useMemo(() => (estHtml ? '' : htmlToTexte(corps)), [corps, estHtml]);

  return (
    <View style={styles.corpsWrap}>
      {/* Trois états, trois phrases distinctes — et plus deux phrases pour trois
          situations. Voir le commentaire de LIRE_STR. */}
      {!charge ? (
        <Text style={styles.corpsNote}>{lire.chargement}</Text>
      ) : raison === 'absent' ? (
        <Text style={styles.corpsNote}>{lire.absent}</Text>
      ) : raison === 'abrege' ? (
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
          {/* LE VRAI MAIL quand c'est du HTML, exactement comme la page d'un
              mail recu (app/email/[id].tsx). On ne retombe sur le texte que si
              le corps n'est pas du HTML — mails en texte brut — ou si la lecture
              a echoue et qu'on n'a que l'apercu de la base.

              ⚠️ LA WEBVIEW PEINT SON PROPRE FOND, creme (#faf7f0). Sur cette
              page au fond sombre, le mail apparait donc comme une feuille claire
              posee dessus. C'est voulu : c'est le mail tel qu'il est parti, pas
              une transposition aux couleurs de l'app. */}
          {estHtml ? (
            <MailHtml html={corps} />
          ) : (
            <Text style={styles.corpsTexte}>{texte}</Text>
          )}
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
