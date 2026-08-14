import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/context/i18n';
import { apiDelete, apiGet, apiPost, apiUpload } from '@/lib/api';
import { bcp47 } from '@/lib/i18n';
import { formatDate, recipientsEmails, recipientsLabel } from '@/lib/mail-format';
import {
  lireBrouillon,
  oublierBrouillon,
  type Brouillon,
} from '@/lib/cache-brouillons';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconChevronLeft, IconClose, IconDraft, IconPlus } from '@/components/icons';
import {
  MAX_ATT_BYTES,
  messageEchecPJ,
  nomLisible,
  pjStr,
  typeRetenu,
} from '@/lib/pieces-jointes';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/**
 * PAGE D'UN BROUILLON — 13/08/2026.
 *
 * Meme demande que pour les envois (HA : « meme logique pour les brouillons ») :
 * la liste ne fait plus que lister, tout se passe ici. Modifier, Envoyer et
 * Supprimer descendent dans cette page.
 *
 * ⚠️ « MODIFIER » N'EST PLUS UN BOUTON. L'editeur EST la page : on arrive dedans,
 * le texte est modifiable tout de suite. Un bouton « Modifier » qui ne fait que
 * rendre editable un champ deja a l'ecran ne decide de rien — c'est exactement
 * l'etape intermediaire retiree du brouillon de reponse le 12/08.
 *
 * ⚠️ ENVOYER ET SUPPRIMER ECRIVENT CHEZ LE FOURNISSEUR. Ils ne sont donc pas
 * dans la liste : on ne les voit qu'apres avoir ouvert un brouillon expres. La
 * suppression garde sa confirmation — contrairement a la corbeille des mails
 * recus, elle est DEFINITIVE chez le fournisseur, rien ne la rattrape.
 */
/**
 * La limite du brouillon, dite a l'ecran. Dictionnaire local : 8 chaines ne
 * justifient pas de toucher au dictionnaire global.
 */
const PJ_LABEL: Record<string, { de: string; pj: string; ajouter: string; fichiers: string; photos: string; heritees: string; avertNeuf: string }> = {
  fr: { de: 'De', pj: 'Pièces jointes', ajouter: 'Joindre un fichier', fichiers: 'Fichiers', photos: 'Photothèque', heritees: 'Ces pièces jointes viennent d’un message que vous n’avez pas terminé. Elles partiront avec celui-ci.', avertNeuf: 'Ce message partira comme un nouvel envoi : les pièces jointes déjà présentes dans le brouillon ne suivront pas. Rejoignez-les ici si vous y tenez.' },
  en: { de: 'From', pj: 'Attachments', ajouter: 'Attach a file', fichiers: 'Files', photos: 'Photo library', heritees: 'These attachments come from a message you did not finish. They will be sent with this one.', avertNeuf: 'This will go out as a new message: attachments already in the draft will not follow. Re-attach them here if you need them.' },
  es: { de: 'De', pj: 'Adjuntos', ajouter: 'Adjuntar un archivo', fichiers: 'Archivos', photos: 'Fototeca', heritees: 'Estos adjuntos vienen de un mensaje que no terminaste. Se enviarán con este.', avertNeuf: 'Se enviará como un mensaje nuevo: los adjuntos ya presentes en el borrador no se incluirán. Vuelve a adjuntarlos aquí si los necesitas.' },
  de: { de: 'Von', pj: 'Anhänge', ajouter: 'Datei anhängen', fichiers: 'Dateien', photos: 'Fotomediathek', heritees: 'Diese Anhänge stammen aus einer nicht beendeten Nachricht. Sie werden mit dieser gesendet.', avertNeuf: 'Dies geht als neue Nachricht raus: bereits im Entwurf vorhandene Anhänge kommen nicht mit. Hänge sie hier erneut an, wenn du sie brauchst.' },
  pt: { de: 'De', pj: 'Anexos', ajouter: 'Anexar um ficheiro', fichiers: 'Ficheiros', photos: 'Fototeca', heritees: 'Estes anexos vêm de uma mensagem que não terminaste. Serão enviados com esta.', avertNeuf: 'Isto sairá como uma mensagem nova: os anexos já presentes no rascunho não seguem. Volta a anexá-los aqui se precisares.' },
  it: { de: 'Da', pj: 'Allegati', ajouter: 'Allega un file', fichiers: 'File', photos: 'Libreria foto', heritees: 'Questi allegati provengono da un messaggio non terminato. Saranno inviati con questo.', avertNeuf: 'Partirà come un nuovo messaggio: gli allegati già presenti nella bozza non seguiranno. Riallegali qui se ti servono.' },
  ar: { de: 'من', pj: 'المرفقات', ajouter: 'إرفاق ملف', fichiers: 'الملفات', photos: 'مكتبة الصور', heritees: 'هذه المرفقات من رسالة لم تُكملها. ستُرسل مع هذه الرسالة.', avertNeuf: 'ستُرسل كرسالة جديدة: المرفقات الموجودة في المسودة لن تُرفَق. أعد إرفاقها هنا إذا كنت بحاجة إليها.' },
  ru: { de: 'От', pj: 'Вложения', ajouter: 'Прикрепить файл', fichiers: 'Файлы', photos: 'Медиатека', heritees: 'Эти вложения остались от незаконченного письма. Они уйдут вместе с этим.', avertNeuf: 'Письмо уйдёт как новое: вложения, уже находящиеся в черновике, не последуют. Прикрепите их здесь заново, если они нужны.' },
};

const NOTE_STR: Record<string, string> = {
  fr: 'Les modifications s’appliquent à l’envoi. Le brouillon chez votre messagerie n’est pas réécrit.',
  en: 'Changes apply when you send. The draft in your mailbox is not rewritten.',
  es: 'Los cambios se aplican al enviar. El borrador de tu buzón no se reescribe.',
  de: 'Änderungen gelten beim Senden. Der Entwurf in deinem Postfach wird nicht überschrieben.',
  pt: 'As alterações aplicam-se ao enviar. O rascunho na sua caixa não é reescrito.',
  it: 'Le modifiche si applicano all’invio. La bozza nella tua casella non viene riscritta.',
  ar: 'تُطبَّق التعديلات عند الإرسال. لا تُعاد كتابة المسودة في صندوق بريدك.',
  ru: 'Изменения применяются при отправке. Черновик в вашем ящике не перезаписывается.',
};

export default function PageBrouillon() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const intl = bcp47[locale];
  const tx = t.drafts;

  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [chargement, setChargement] = useState(true);
  const [texte, setTexte] = useState('');
  /**
   * DESTINATAIRES EDITABLES — 13/08/2026, demande de HA.
   *
   * ⚠️ LIMITE ASSUMEE ET DITE A L'ECRAN : `/api/drafts` ne connait que `send` et
   * `delete`. Il n'existe AUCUNE operation « enregistrer » (ni cote web, ni dans
   * n8n). Ce que l'on modifie ici — destinataires comme corps — ne peut donc pas
   * etre reecrit dans le brouillon chez le fournisseur : c'est appliqué A L'ENVOI.
   * Tant qu'on n'envoie pas, le brouillon chez Gmail garde son ancien etat.
   */
  const [destinataires, setDestinataires] = useState('');
  const [consigne, setConsigne] = useState('');
  const [iaOccupee, setIaOccupee] = useState(false);
  const [occupe, setOccupe] = useState<null | 'send' | 'delete'>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  /**
   * BOITE D'ENVOI MODIFIABLE — 14/08/2026, demande de HA : « je devrais pouvoir
   * modifier de quelle boite il part ds les brouillons, au lieu de ne plus avoir
   * le choix et juste avoir la boite qui envoie notee en bas ».
   *
   * ⚠️ CE CHOIX A UNE CONSEQUENCE, ET ELLE EST REELLE. Un brouillon existe chez
   * le fournisseur DANS UNE BOITE PRECISE, avec un identifiant qui n'a de sens
   * que la. On ne peut donc pas « l'envoyer depuis une autre boite ». L'envoi de
   * cette page passe desormais par /api/compose — un message NEUF, avec la boite
   * choisie et les PJ — puis supprime le brouillon d'origine. C'est la seule
   * facon coherente, et c'est deja ce que la page annonce depuis le 13/08 : les
   * modifications s'appliquent A L'ENVOI, le brouillon n'est pas reecrit.
   */
  const [boites, setBoites] = useState<{ email: string; provider: string }[]>([]);
  const [boite, setBoite] = useState('');
  const [pieces, setPieces] = useState<{ id: string; filename: string }[]>([]);
  const [pjHeritees, setPjHeritees] = useState(false);
  const [televersement, setTeleversement] = useState(false);
  const [feuille, setFeuille] = useState<null | 'boites'>(null);
  const pjl = PJ_LABEL[locale] ?? PJ_LABEL.en;
  const attStr = pjStr(locale);

  useEffect(() => {
    let vivant = true;
    lireBrouillon(String(id))
      .then((b) => {
        if (!vivant) return;
        setBrouillon(b);
        setTexte(b?.body ?? '');
        setDestinataires(recipientsEmails(b?.recipients ?? []).join(', '));
      })
      .catch((e) => {
        // RIEN EN SILENCE : si la messagerie est injoignable, on le dit, on ne
        // laisse pas une page vide faire croire a un brouillon disparu.
        if (vivant) setErreur(e instanceof Error && e.message ? e.message : tx.unreachable);
      })
      .finally(() => {
        if (vivant) setChargement(false);
      });
    return () => {
      vivant = false;
    };
  }, [id, tx.unreachable]);

  // Boites connectees. Defaut = celle du brouillon, qui est la seule ou il existe.
  useEffect(() => {
    apiGet<{ mailboxes?: { email: string; provider: string }[] }>('/api/connect/list')
      .then((j) => setBoites(Array.isArray(j?.mailboxes) ? j.mailboxes.filter((m) => m?.email) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (brouillon?.accountEmail && !boite) setBoite(brouillon.accountEmail);
  }, [brouillon, boite]);

  // PJ sans `item_id` : les memes que l'ecran de redaction. Voir le commentaire
  // de `nouveau.tsx` — elles partiraient avec le message suivant sans etre vues.
  useEffect(() => {
    apiGet<{ attachments: { id: string; filename: string }[] }>(
      '/api/reply-attachments?item_id=none',
    )
      .then((j) => {
        const liste = (j.attachments || []).map((a) => ({ id: a.id, filename: a.filename }));
        setPieces(liste);
        setPjHeritees(liste.length > 0);
      })
      .catch(() => {});
  }, []);

  async function televerser(uri: string, name: string, type: string, taille?: number | null) {
    const nom = nomLisible(name);
    if (typeof taille === 'number' && taille > MAX_ATT_BYTES) return `${nom} — ${attStr.tooBig}`;
    const form = new FormData();
    form.append('file', { uri, name: nom, type: typeRetenu(nom, type) } as unknown as Blob);
    try {
      const j = await apiUpload<{ attachment: { id: string; filename: string } }>(
        '/api/reply-attachments',
        form,
      );
      if (j?.attachment) {
        setPieces((p) => [...p, { id: j.attachment.id, filename: j.attachment.filename }]);
        return null;
      }
      return `${nom} — ${attStr.failed}`;
    } catch (e) {
      return `${nom} — ${messageEchecPJ(attStr, e)}`;
    }
  }

  async function depuisFichiers() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setTeleversement(true);
      setErreur(null);
      const echecs: string[] = [];
      for (const a of res.assets) {
        const err = await televerser(a.uri, a.name || 'fichier', a.mimeType || '', a.size);
        if (err) echecs.push(err);
      }
      setTeleversement(false);
      if (echecs.length) setErreur(echecs.join('\n'));
    } catch (e) {
      setTeleversement(false);
      setErreur(messageEchecPJ(attStr, e));
    }
  }

  async function depuisPhotos() {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.length) return;
      setTeleversement(true);
      setErreur(null);
      const echecs: string[] = [];
      for (const a of res.assets) {
        const err = await televerser(
          a.uri,
          a.fileName || `photo-${Date.now()}.jpg`,
          a.mimeType || 'image/jpeg',
          a.fileSize,
        );
        if (err) echecs.push(err);
      }
      setTeleversement(false);
      if (echecs.length) setErreur(echecs.join('\n'));
    } catch (e) {
      setTeleversement(false);
      setErreur(messageEchecPJ(attStr, e));
    }
  }

  async function retirerPJ(attId: string) {
    try {
      await apiDelete(`/api/reply-attachments?id=${encodeURIComponent(attId)}`);
      setPieces((p) => p.filter((x) => x.id !== attId));
    } catch (e) {
      setErreur(messageEchecPJ(attStr, e));
    }
  }

  const agir = useCallback(
    async (op: 'send' | 'delete') => {
      if (occupe || !brouillon) return;
      if (op === 'send' && !texte.trim()) {
        setErreur(tx.errEmpty);
        return;
      }
      // Les destinataires SAISIS priment. Un envoi sans destinataire ne part pas :
      // on le dit plutot que de laisser le fournisseur refuser sans explication.
      const pourEnvoi = destinataires
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (op === 'send' && pourEnvoi.length === 0) {
        setErreur(tx.noRecipient);
        return;
      }
      setOccupe(op);
      setErreur(null);
      try {
        /**
         * DEUX CHEMINS, ET C'EST LE SEUL MOYEN DE NE RIEN PERDRE — 14/08/2026.
         *
         * MESURE (execution n8n 27613) : un brouillon enregistre depuis l'ecran
         * de redaction PORTE BIEN ses pieces jointes chez le fournisseur —
         * `pj_attendues: 2, pj_jointes: 2`. Elles ne sont pas perdues, elles sont
         * INVISIBLES ICI : cette page lit `reply_attachments` en base, et ces
         * lignes-la ont ete supprimees une fois les fichiers partis chez Gmail.
         *
         * ⚠️ LE DEFAUT QUE CELA CREAIT, ET QUE J'AI INTRODUIT LE 13/08 en routant
         * cet envoi par /api/compose : compose envoie un message NEUF, qui
         * n'emporte que les lignes en base. Les PJ deja dans le brouillon
         * seraient restees derriere, et l'ecran aurait affiche « envoye ».
         * Une perte silencieuse, exactement ce qu'on traque.
         *
         * On choisit donc selon ce qui a change :
         *
         *   rien qui l'empeche  -> `send-draft` : le fournisseur envoie SON
         *                          brouillon, donc ses PJ suivent par
         *                          construction. Aucun risque de perte.
         *   boite changee, ou   -> /api/compose : message neuf. C'est le seul
         *   PJ ajoutees ici        moyen de changer de boite ou d'ajouter un
         *                          fichier — mais les PJ deja dans le brouillon
         *                          ne suivent PAS, et l'ecran le dit avant.
         */
        const boiteChangee = !!boite && boite !== brouillon.accountEmail;
        const pjAjoutees = pieces.length > 0;
        if (op === 'send' && !boiteChangee && !pjAjoutees) {
          await apiPost('/api/drafts', {
            op: 'send',
            id: brouillon.id,
            accountEmail: brouillon.accountEmail,
            provider: brouillon.provider,
            subject: brouillon.subject ?? '',
            body: texte,
            to: pourEnvoi,
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          });
          oublierBrouillon(brouillon.id);
        } else if (op === 'send') {
          /**
           * L'ENVOI PASSE PAR /api/compose, PAS PAR `send-draft` — 14/08/2026.
           *
           * MESURE FAITE AVANT D'ECRIRE. `send-draft` ne recoit que `draftId`,
           * `subject`, `body` et `to` : il n'accepte AUCUNE piece jointe, et il
           * ne sait envoyer que depuis la boite ou le brouillon existe. Les deux
           * demandes de HA — joindre un fichier, choisir la boite — y sont donc
           * impossibles, pas difficiles.
           *
           * On envoie un message NEUF avec ce qui est a l'ecran, puis on efface
           * le brouillon d'origine. Ce n'est pas un detournement : la page
           * annonce depuis le 13/08 que les modifications s'appliquent A L'ENVOI
           * et que le brouillon n'est pas reecrit — c'etait deja son contrat.
           */
          await apiPost('/api/compose', {
            op: 'send',
            accountEmail: boite || brouillon.accountEmail,
            to: pourEnvoi,
            subject: brouillon.subject ?? '',
            body: texte,
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          });
          /**
           * Le brouillon d'origine n'a plus lieu d'etre. Cet appel-la n'a PAS
           * de message d'erreur, et c'est un choix : le mail est parti, c'est le
           * seul fait qui compte, et un bandeau alarmant sur une suppression
           * ratee ferait douter d'un envoi reussi.
           *
           * ⚠️ CE N'EST PAS UN ECHEC MUET POUR AUTANT. La liste des brouillons
           * est relue EN DIRECT chez le fournisseur a chaque ouverture : si la
           * suppression echoue, le brouillon est simplement encore la. L'ecran
           * dit la verite par construction, sans avoir a l'annoncer.
           */
          try {
            await apiPost('/api/drafts', {
              op: 'delete',
              id: brouillon.id,
              accountEmail: brouillon.accountEmail,
              provider: brouillon.provider,
              idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            });
            oublierBrouillon(brouillon.id);
          } catch (e) {
            console.warn('[brouillon] envoye, mais la suppression a echoue', e);
          }
        } else {
          await apiPost('/api/drafts', {
            op: 'delete',
            id: brouillon.id,
            accountEmail: brouillon.accountEmail,
            provider: brouillon.provider,
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          });
          // Le brouillon n'existe plus chez le fournisseur : on le retire du cache
          // AVANT de revenir, sinon la liste le reafficherait le temps de relire.
          oublierBrouillon(brouillon.id);
        }
        setConfirmer(false);
        router.back();
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : tx.errGeneric);
        setOccupe(null);
      }
    },
    [
      occupe,
      brouillon,
      texte,
      destinataires,
      boite,
      router,
      tx.errEmpty,
      tx.errGeneric,
      tx.noRecipient,
    ],
  );

  /**
   * REFORMULATION PAR L'IA — 13/08/2026.
   *
   * `/api/draft` exigeait l'identifiant d'un mail RECU, qu'elle relisait dans
   * `items` pour donner le contexte au modele. Un brouillon libre ne repond a
   * rien qu'on ait en base : la route accepte desormais l'appel SANS `id`, a
   * condition qu'on lui passe le texte a reformuler. C'est ce qu'on fait ici.
   */
  const reformuler = useCallback(
    async (instruction: string) => {
      if (iaOccupee || !texte.trim()) return;
      setIaOccupee(true);
      setErreur(null);
      try {
        const r = await apiPost<{ draft?: string }>('/api/draft', {
          previousDraft: texte,
          instructions: instruction,
          locale,
        });
        if (r?.draft) setTexte(r.draft);
        setConsigne('');
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : t.email.genFail);
      } finally {
        setIaOccupee(false);
      }
    },
    [iaOccupee, texte, locale, t.email.genFail],
  );

  const RETOUCHES: { label: string; instruction: string }[] = [
    { label: t.email.refMoreProfessional, instruction: t.email.instrMoreProfessional },
    { label: t.email.refShorter, instruction: t.email.instrShorter },
    { label: t.email.refWarmer, instruction: t.email.instrWarmer },
    { label: t.email.refMoreDirect, instruction: t.email.instrMoreDirect },
  ];

  const pour = brouillon ? recipientsLabel(brouillon.recipients, tx.noRecipient) : '';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          {brouillon?.byVmail ? (
            <View style={styles.badge}>
              <IconDraft size={12} color={colors.terracottaLight} />
              <Text style={styles.badgeText}>{tx.byVmail}</Text>
            </View>
          ) : null}
        </View>

        {brouillon ? (
          <View style={styles.hero}>
            <Text style={styles.subject}>{brouillon.subject || t.common.noSubject}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.to} numberOfLines={1}>
                {tx.to} {pour}
              </Text>
              {brouillon.updatedAt ? (
                <Text style={styles.date}>{formatDate(brouillon.updatedAt, intl)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {chargement ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      ) : !brouillon ? (
        <View style={styles.center}>
          <Text style={styles.vide}>{erreur ?? tx.empty}</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {/* DE — toujours visible : envoyer depuis le mauvais compte ne se
                rattrape pas, on doit voir lequel part. */}
            <Text style={[styles.sectionLabel, styles.premierLabel]}>{pjl.de}</Text>
            <Pressable
              style={[styles.champ, styles.champPressable, boites.length < 2 && styles.champInerte]}
              disabled={boites.length < 2}
              onPress={() => setFeuille('boites')}
            >
              <Text style={styles.champTexte} numberOfLines={1}>
                {boite || brouillon.accountEmail}
              </Text>
            </Pressable>

            <Text style={styles.sectionLabel}>{tx.to}</Text>
            <TextInput
              style={styles.champ}
              value={destinataires}
              onChangeText={setDestinataires}
              placeholder={tx.noRecipient}
              placeholderTextColor={colors.hint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            {/* La limite est DITE, pas cachee : sans operation « enregistrer »
                cote fournisseur, ce qu'on modifie ici ne vaut qu'a l'envoi. */}
            <Text style={styles.note}>{NOTE_STR[locale] ?? NOTE_STR.en}</Text>

            <Text style={styles.sectionLabel}>{tx.edit}</Text>
            <TextInput
              style={styles.editeur}
              value={texte}
              onChangeText={setTexte}
              multiline
              textAlignVertical="top"
              placeholder={tx.empty}
              placeholderTextColor={colors.hint}
            />

            <Text style={styles.sectionLabel}>{t.email.adjust}</Text>
            {iaOccupee ? (
              <View style={styles.iaEnCours}>
                <ActivityIndicator color={colors.terracotta} />
                <Text style={styles.iaEnCoursText}>{t.email.aiWriting}</Text>
              </View>
            ) : (
              <>
                <View style={styles.puces}>
                  {RETOUCHES.map((r) => (
                    <Pressable
                      key={r.label}
                      style={[styles.puce, !texte.trim() && styles.off]}
                      disabled={!texte.trim()}
                      onPress={() => void reformuler(r.instruction)}
                    >
                      <Text style={styles.puceText}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  style={styles.champ}
                  value={consigne}
                  onChangeText={setConsigne}
                  placeholder={t.email.instrPlaceholder}
                  placeholderTextColor={colors.hint}
                />
                <Pressable
                  style={[styles.secondaire, (!consigne.trim() || !texte.trim()) && styles.off]}
                  disabled={!consigne.trim() || !texte.trim()}
                  onPress={() => void reformuler(consigne)}
                >
                  <Text style={styles.secondaireText}>{t.email.reformulate}</Text>
                </Pressable>
              </>
            )}

            <Text style={styles.sectionLabel}>{pjl.pj}</Text>
            {pjHeritees ? <Text style={styles.note}>{pjl.heritees}</Text> : null}
            {/* ⚠️ DIT AVANT, PAS APRES. Changer de boite ou ajouter un fichier
                oblige a partir en message neuf, et les PJ deja presentes dans le
                brouillon ne suivent pas. On l'annonce au moment ou l'on bascule,
                plutot que de laisser un « envoye » cacher ce qui manque. */}
            {(!!boite && boite !== brouillon.accountEmail) || pieces.length > 0 ? (
              <Text style={styles.note}>{pjl.avertNeuf}</Text>
            ) : null}
            {pieces.map((p) => (
              <View key={p.id} style={styles.pjLigne}>
                <Text style={styles.pjNom} numberOfLines={1}>
                  {p.filename}
                </Text>
                <Pressable hitSlop={10} onPress={() => void retirerPJ(p.id)}>
                  <IconClose size={15} color={colors.onDarkMuted} />
                </Pressable>
              </View>
            ))}
            {televersement ? (
              <View style={styles.iaEnCours}>
                <ActivityIndicator color={colors.terracotta} />
                <Text style={styles.iaEnCoursText}>{attStr.sending}</Text>
              </View>
            ) : (
              /* Aucune feuille : appel direct, meme raison qu'a la redaction —
                 un Modal dans le chemin fait refuser la presentation du
                 selecteur natif par iOS. */
              <View style={styles.pjBtns}>
                <Pressable style={styles.pjBtn} onPress={() => void depuisFichiers()}>
                  <IconPlus size={14} color={colors.onDark} />
                  <Text style={styles.pjBtnText}>{pjl.fichiers}</Text>
                </Pressable>
                <Pressable style={styles.pjBtn} onPress={() => void depuisPhotos()}>
                  <IconPlus size={14} color={colors.onDark} />
                  <Text style={styles.pjBtnText}>{pjl.photos}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Pressable
              style={[styles.cta, styles.flex1, (!!occupe || !texte.trim()) && styles.off]}
              onPress={() => void agir('send')}
              disabled={!!occupe || !texte.trim()}
            >
              {occupe === 'send' ? (
                <ActivityIndicator color={colors.onDark} />
              ) : (
                <Text style={styles.ctaText}>{tx.send}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.danger, !!occupe && styles.off]}
              onPress={() => setConfirmer(true)}
              disabled={!!occupe}
            >
              <Text style={styles.dangerText}>{tx.del}</Text>
            </Pressable>
          </View>

          {/* La suppression est DEFINITIVE chez le fournisseur : elle garde sa
              confirmation, contrairement a la corbeille d'un mail recu qui, elle,
              est reversible depuis le 09/08. */}
          <Modal
            visible={confirmer}
            transparent
            animationType="fade"
            onRequestClose={() => (occupe ? undefined : setConfirmer(false))}
          >
            <Pressable style={styles.overlay} onPress={() => (occupe ? undefined : setConfirmer(false))}>
              <Pressable style={styles.carte} onPress={() => {}}>
                <Text style={styles.carteTitre}>{tx.confirmDelete}</Text>
                <View style={styles.carteBtns}>
                  <Pressable
                    style={[styles.dangerPlein, styles.flex1, !!occupe && styles.off]}
                    onPress={() => void agir('delete')}
                    disabled={!!occupe}
                  >
                    {occupe === 'delete' ? (
                      <ActivityIndicator color={colors.cream} />
                    ) : (
                      <Text style={styles.dangerPleinText}>{tx.del}</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.annuler} onPress={() => setConfirmer(false)}>
                    <Text style={styles.annulerText}>{t.common.cancel}</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Boite d'envoi et sources de PJ. Feuille distincte de la confirmation
              de suppression : deux Modal frere, jamais imbriques — sur iOS un
              Modal dans un Modal ne se presente pas. */}
          <Modal
            visible={feuille !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setFeuille(null)}
          >
            <Pressable style={styles.overlay} onPress={() => setFeuille(null)}>
              <Pressable style={styles.carte} onPress={() => {}}>
                <Text style={styles.carteTitre}>{pjl.de}</Text>
                {boites.map((m) => (
                  <Pressable
                    key={m.email}
                    style={styles.option}
                    onPress={() => {
                      setBoite(m.email);
                      setFeuille(null);
                    }}
                  >
                    <Text style={[styles.optionText, m.email === boite && styles.optionActive]}>
                      {m.email}
                    </Text>
                  </Pressable>
                ))}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
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
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(234,225,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.terracottaLight,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  badgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 0.8,
    color: colors.terracottaLight,
  },
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  subject: {
    fontFamily: fonts.sansBold,
    fontSize: 23,
    color: colors.onDark,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  heroMeta: { marginTop: spacing.md },
  to: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: 'rgba(234,225,208,0.82)' },
  date: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: 'rgba(234,225,208,0.42)',
    marginTop: 3,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vide: { fontFamily: fonts.sans, color: colors.onDarkMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, paddingBottom: spacing.xl },
  premierLabel: { marginTop: 0 },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.xl,
  },
  editeur: {
    fontFamily: fonts.sans,
    minHeight: 240,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink2,
    lineHeight: 22,
  },
  compte: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    marginTop: spacing.xl,
  },
  champ: {
    fontFamily: fonts.sans,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.ink,
  },
  champPressable: { justifyContent: 'center', minHeight: 44 },
  champInerte: { opacity: 0.85 },
  champTexte: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  pjLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.charline,
  },
  pjNom: { flex: 1, fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDark },
  pjBtns: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.md },
  pjBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  pjBtnText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.onDark },
  option: { paddingVertical: 12 },
  optionText: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  optionActive: { fontFamily: fonts.sansBold, color: colors.terracotta },
  note: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.onDarkMuted,
    lineHeight: 16,
    marginTop: 6,
  },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  puce: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
  },
  puceText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.ink2 },
  iaEnCours: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  iaEnCoursText: { fontFamily: fonts.sans, color: colors.onDarkMuted, fontSize: 14 },
  // Pose sur le fond sombre : contour clair, comme ailleurs dans l'app.
  secondaire: {
    borderWidth: 1,
    borderColor: colors.terracottaLight,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  secondaireText: { fontFamily: fonts.sansSemibold, color: colors.terracottaLight, fontSize: 14 },

  erreur: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.charcoalSoft,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.charcoalSoft,
    borderTopWidth: 1,
    borderTopColor: colors.charline,
  },
  flex1: { flex: 1 },
  off: { opacity: 0.4 },
  cta: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  danger: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontFamily: fonts.sansBold, color: colors.danger, fontSize: 15 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,18,15,0.55)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  carte: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  carteTitre: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2, lineHeight: 20 },
  carteBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dangerPlein: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerPleinText: { fontFamily: fonts.sansBold, color: colors.cream, fontSize: 15 },
  annuler: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  annulerText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.muted },
});
