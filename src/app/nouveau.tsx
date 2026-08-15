import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { useI18n } from '@/context/i18n';
import { apiDelete, apiGet, apiPost, apiUpload } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import {
  MAX_ATT_BYTES,
  messageEchecPJ,
  nomLisible,
  pjStr,
  typeRetenu,
} from '@/lib/pieces-jointes';
import ChampDestinataires from '@/components/champ-destinataires';
import { IconChevronLeft, IconClose, IconPlus } from '@/components/icons';

/**
 * ÉCRIRE UN MAIL NEUF — 13/08/2026.
 *
 * HA : « un bouton + pour envoyer un email, un nouvel écran doit apparaître avec un
 * espace pour écrire, l'ia qui peut t'aider, les boutons d'aide (plus court,
 * chaleureux, etc.) comme qd on répond a un mail, ajouter pj etc, en gros la mm
 * logique que qd on répond a un email, sans message préparé du coup pcq on part de
 * 0 et avec le choix du destinataire ».
 *
 * C'EST DONC LA PAGE DE RÉPONSE, MOINS LE MAIL D'ORIGINE, PLUS TROIS CHAMPS :
 * la boîte d'envoi, les destinataires, l'objet. L'éditeur est vide à l'arrivée et
 * les puces de retouche sont éteintes tant qu'il n'y a rien à retoucher —
 * arbitrage HA : pas d'étape intermédiaire, on arrive dans le champ de texte.
 *
 * ⚠️ CE QUI DIFFÈRE VRAIMENT D'UNE RÉPONSE, ET QUI A DEMANDÉ DU TRAVAIL AILLEURS :
 * une réponse déduit tout du mail reçu — la boîte d'envoi de son lien, le
 * destinataire de son expéditeur, l'objet de son objet. Ici RIEN n'est déduit, tout
 * est choisi. Les deux workflows n8n ont reçu une branche « message neuf » le même
 * jour, et `/api/compose` a été écrite pour ce contrat-là.
 */

/** Dernière boîte utilisée. Clé versionnée, même patron que `vmail.feed.filtres.v1`. */
const CLE_BOITE = 'vmail.compose.boite.v1';

const STR: Record<
  string,
  {
    titre: string;
    de: string;
    a: string;
    aPlaceholder: string;
    objet: string;
    objetPlaceholder: string;
    message: string;
    messagePlaceholder: string;
    consigne: string;
    ecrire: string;
    pj: string;
    ajouterPj: string;
    fichiers: string;
    photos: string;
    photo: string;
    envoyer: string;
    brouillon: string;
    envoi: string;
    enregistrement: string;
    aucuneBoite: string;
    sansDestinataire: string;
    sansTexte: string;
    quitter: string;
    quitterOui: string;
    quitterNon: string;
    pjOrphelines: string;
  }
> = {
  fr: { titre: 'Nouveau message', de: 'De', a: 'À', aPlaceholder: 'nom@exemple.com, autre@exemple.com', objet: 'Objet', objetPlaceholder: 'Laissez vide pour que l’IA le propose', message: 'Message', messagePlaceholder: 'Écrivez ici, ou demandez à l’IA d’écrire le premier jet.', consigne: 'Dites à l’IA quoi écrire', ecrire: 'Écrire avec l’IA', pj: 'Pièces jointes', ajouterPj: 'Joindre un fichier', fichiers: 'Fichiers', photos: 'Photothèque', photo: 'Prendre une photo', envoyer: 'Envoyer', brouillon: 'Enregistrer le brouillon', envoi: 'Envoi…', enregistrement: 'Enregistrement…', aucuneBoite: 'Aucune boîte connectée.', sansDestinataire: 'Indiquez au moins un destinataire.', sansTexte: 'Le message est vide.', quitter: 'Abandonner ce message ?', quitterOui: 'Abandonner', quitterNon: 'Continuer à écrire', pjOrphelines: 'Ces pièces jointes viennent d’un message que vous n’avez pas terminé. Elles partiront avec celui-ci.' },
  en: { titre: 'New message', de: 'From', a: 'To', aPlaceholder: 'name@example.com, other@example.com', objet: 'Subject', objetPlaceholder: 'Leave empty and the AI will suggest one', message: 'Message', messagePlaceholder: 'Write here, or ask the AI for a first draft.', consigne: 'Tell the AI what to write', ecrire: 'Write with AI', pj: 'Attachments', ajouterPj: 'Attach a file', fichiers: 'Files', photos: 'Photo library', photo: 'Take a photo', envoyer: 'Send', brouillon: 'Save draft', envoi: 'Sending…', enregistrement: 'Saving…', aucuneBoite: 'No mailbox connected.', sansDestinataire: 'Add at least one recipient.', sansTexte: 'The message is empty.', quitter: 'Discard this message?', quitterOui: 'Discard', quitterNon: 'Keep writing', pjOrphelines: 'These attachments come from a message you did not finish. They will be sent with this one.' },
  es: { titre: 'Mensaje nuevo', de: 'De', a: 'Para', aPlaceholder: 'nombre@ejemplo.com, otro@ejemplo.com', objet: 'Asunto', objetPlaceholder: 'Déjalo vacío y la IA lo propondrá', message: 'Mensaje', messagePlaceholder: 'Escribe aquí, o pide a la IA un primer borrador.', consigne: 'Dile a la IA qué escribir', ecrire: 'Escribir con IA', pj: 'Adjuntos', ajouterPj: 'Adjuntar un archivo', fichiers: 'Archivos', photos: 'Fototeca', photo: 'Hacer una foto', envoyer: 'Enviar', brouillon: 'Guardar el borrador', envoi: 'Enviando…', enregistrement: 'Guardando…', aucuneBoite: 'Ningún buzón conectado.', sansDestinataire: 'Indica al menos un destinatario.', sansTexte: 'El mensaje está vacío.', quitter: '¿Descartar este mensaje?', quitterOui: 'Descartar', quitterNon: 'Seguir escribiendo', pjOrphelines: 'Estos adjuntos vienen de un mensaje que no terminaste. Se enviarán con este.' },
  de: { titre: 'Neue Nachricht', de: 'Von', a: 'An', aPlaceholder: 'name@beispiel.de, andere@beispiel.de', objet: 'Betreff', objetPlaceholder: 'Leer lassen — die KI schlägt einen vor', message: 'Nachricht', messagePlaceholder: 'Schreib hier, oder lass die KI einen ersten Entwurf schreiben.', consigne: 'Sag der KI, was sie schreiben soll', ecrire: 'Mit KI schreiben', pj: 'Anhänge', ajouterPj: 'Datei anhängen', fichiers: 'Dateien', photos: 'Fotomediathek', photo: 'Foto aufnehmen', envoyer: 'Senden', brouillon: 'Entwurf speichern', envoi: 'Senden…', enregistrement: 'Wird gespeichert…', aucuneBoite: 'Kein Postfach verbunden.', sansDestinataire: 'Gib mindestens einen Empfänger an.', sansTexte: 'Die Nachricht ist leer.', quitter: 'Diese Nachricht verwerfen?', quitterOui: 'Verwerfen', quitterNon: 'Weiterschreiben', pjOrphelines: 'Diese Anhänge stammen aus einer nicht beendeten Nachricht. Sie werden mit dieser gesendet.' },
  pt: { titre: 'Nova mensagem', de: 'De', a: 'Para', aPlaceholder: 'nome@exemplo.com, outro@exemplo.com', objet: 'Assunto', objetPlaceholder: 'Deixa vazio e a IA propõe um', message: 'Mensagem', messagePlaceholder: 'Escreve aqui, ou pede à IA um primeiro rascunho.', consigne: 'Diz à IA o que escrever', ecrire: 'Escrever com IA', pj: 'Anexos', ajouterPj: 'Anexar um ficheiro', fichiers: 'Ficheiros', photos: 'Fototeca', photo: 'Tirar uma foto', envoyer: 'Enviar', brouillon: 'Guardar rascunho', envoi: 'A enviar…', enregistrement: 'A guardar…', aucuneBoite: 'Nenhuma caixa ligada.', sansDestinataire: 'Indica pelo menos um destinatário.', sansTexte: 'A mensagem está vazia.', quitter: 'Descartar esta mensagem?', quitterOui: 'Descartar', quitterNon: 'Continuar a escrever', pjOrphelines: 'Estes anexos vêm de uma mensagem que não terminaste. Serão enviados com esta.' },
  it: { titre: 'Nuovo messaggio', de: 'Da', a: 'A', aPlaceholder: 'nome@esempio.com, altro@esempio.com', objet: 'Oggetto', objetPlaceholder: 'Lascia vuoto e l’IA lo propone', message: 'Messaggio', messagePlaceholder: 'Scrivi qui, oppure chiedi all’IA una prima bozza.', consigne: 'Di’ all’IA cosa scrivere', ecrire: 'Scrivi con l’IA', pj: 'Allegati', ajouterPj: 'Allega un file', fichiers: 'File', photos: 'Libreria foto', photo: 'Scatta una foto', envoyer: 'Invia', brouillon: 'Salva la bozza', envoi: 'Invio…', enregistrement: 'Salvataggio…', aucuneBoite: 'Nessuna casella collegata.', sansDestinataire: 'Indica almeno un destinatario.', sansTexte: 'Il messaggio è vuoto.', quitter: 'Vuoi eliminare questo messaggio?', quitterOui: 'Elimina', quitterNon: 'Continua a scrivere', pjOrphelines: 'Questi allegati provengono da un messaggio non terminato. Saranno inviati con questo.' },
  ar: { titre: 'رسالة جديدة', de: 'من', a: 'إلى', aPlaceholder: 'name@example.com، other@example.com', objet: 'الموضوع', objetPlaceholder: 'اتركه فارغًا ليقترحه الذكاء الاصطناعي', message: 'الرسالة', messagePlaceholder: 'اكتب هنا، أو اطلب من الذكاء الاصطناعي مسودة أولى.', consigne: 'أخبر الذكاء الاصطناعي بما يكتب', ecrire: 'اكتب بالذكاء الاصطناعي', pj: 'المرفقات', ajouterPj: 'إرفاق ملف', fichiers: 'الملفات', photos: 'مكتبة الصور', photo: 'التقاط صورة', envoyer: 'إرسال', brouillon: 'حفظ المسودة', envoi: 'جارٍ الإرسال…', enregistrement: 'جارٍ الحفظ…', aucuneBoite: 'لا يوجد صندوق متصل.', sansDestinataire: 'أضف مستلمًا واحدًا على الأقل.', sansTexte: 'الرسالة فارغة.', quitter: 'هل تريد تجاهل هذه الرسالة؟', quitterOui: 'تجاهل', quitterNon: 'متابعة الكتابة', pjOrphelines: 'هذه المرفقات من رسالة لم تُكملها. ستُرسل مع هذه الرسالة.' },
  ru: { titre: 'Новое письмо', de: 'От', a: 'Кому', aPlaceholder: 'name@example.com, other@example.com', objet: 'Тема', objetPlaceholder: 'Оставьте пустым — ИИ предложит тему', message: 'Сообщение', messagePlaceholder: 'Пишите здесь или попросите ИИ написать первый вариант.', consigne: 'Скажите ИИ, что написать', ecrire: 'Написать с ИИ', pj: 'Вложения', ajouterPj: 'Прикрепить файл', fichiers: 'Файлы', photos: 'Медиатека', photo: 'Сделать фото', envoyer: 'Отправить', brouillon: 'Сохранить черновик', envoi: 'Отправка…', enregistrement: 'Сохранение…', aucuneBoite: 'Нет подключённых ящиков.', sansDestinataire: 'Укажите хотя бы одного получателя.', sansTexte: 'Сообщение пустое.', quitter: 'Отменить это письмо?', quitterOui: 'Отменить', quitterNon: 'Продолжить писать', pjOrphelines: 'Эти вложения остались от незаконченного письма. Они уйдут вместе с этим.' },
};

type Boite = { email: string; provider: string };
type PJ = { id: string; filename: string };

export default function NouveauMessage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const s = STR[locale] ?? STR.en;

  const [boites, setBoites] = useState<Boite[]>([]);
  const [boite, setBoite] = useState('');
  /**
   * ⚠️ TANT QU'ON N'A PAS REGARDE, ON NE DIT RIEN — 14/08/2026, signale par HA :
   * « pdt une seconde, ds l'encadre "de", il est ecrit aucune boite connectee ».
   *
   * Le champ affichait `boite || s.aucuneBoite`, et `boite` est vide AVANT la
   * reponse de /api/connect/list. On annoncait donc une panne pendant la seconde
   * ou l'on n'avait simplement pas encore la reponse. C'est la meme faute que le
   * « version abregee » du 13/08 : confondre « je ne sais pas encore » avec
   * « il n'y en a pas ».
   */
  const [boitesLues, setBoitesLues] = useState(false);
  const [destinataires, setDestinataires] = useState('');
  const [objet, setObjet] = useState('');
  const [texte, setTexte] = useState('');
  const [consigne, setConsigne] = useState('');

  const [pieces, setPieces] = useState<PJ[]>([]);
  /** Les PJ trouvées à l'arrivée : elles ne viennent PAS de cette rédaction. */
  const [pjHeritees, setPjHeritees] = useState(false);

  const [iaOccupee, setIaOccupee] = useState(false);
  const [occupe, setOccupe] = useState<null | 'send' | 'draft'>(null);
  const [televersement, setTeleversement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<null | 'boites' | 'quitter'>(null);

  // --- Boîtes connectées, et la dernière utilisée ---------------------------
  useEffect(() => {
    let vivant = true;
    (async () => {
      const memorisee = await AsyncStorage.getItem(CLE_BOITE).catch(() => null);
      try {
        const j = await apiGet<{ mailboxes?: Boite[] }>('/api/connect/list');
        if (!vivant) return;
        const liste = Array.isArray(j?.mailboxes) ? j.mailboxes.filter((m) => m?.email) : [];
        setBoites(liste);
        // La mémorisée ne gagne QUE si elle est encore connectée : une boîte
        // déconnectée entre-temps enverrait vers un 403 sans rien expliquer.
        const retenue = liste.find((m) => m.email === memorisee)?.email || liste[0]?.email || '';
        setBoite(retenue);
        setBoitesLues(true);
        if (liste.length === 0) setErreur(s.aucuneBoite);
      } catch (e) {
        if (vivant) {
          setBoitesLues(true);
          setErreur(e instanceof Error && e.message ? e.message : s.aucuneBoite);
        }
      }
    })();
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (boite) AsyncStorage.setItem(CLE_BOITE, boite).catch(() => {});
  }, [boite]);

  /**
   * PIÈCES JOINTES DÉJÀ LÀ À L'ARRIVÉE.
   *
   * ⚠️ CE N'EST PAS DE L'AFFICHAGE DE CONFORT. `/api/compose` joint au mail neuf
   * TOUTES les lignes sans `item_id`. Un fichier déposé puis abandonné en quittant
   * l'écran resterait donc en base et partirait avec le message SUIVANT, sans que
   * rien ne l'ait montré. On les lit, on les affiche, et on dit d'où elles
   * viennent — pour qu'on puisse les retirer en connaissance de cause.
   */
  useEffect(() => {
    apiGet<{ attachments: PJ[] }>('/api/reply-attachments?item_id=none')
      .then((j) => {
        const liste = (j.attachments || []).map((a) => ({ id: a.id, filename: a.filename }));
        setPieces(liste);
        setPjHeritees(liste.length > 0);
      })
      .catch(() => {});
  }, []);

  // --- IA -------------------------------------------------------------------
  const RETOUCHES = useMemo(
    () => [
      { label: t.email.refMoreProfessional, instruction: t.email.instrMoreProfessional },
      { label: t.email.refShorter, instruction: t.email.instrShorter },
      { label: t.email.refWarmer, instruction: t.email.instrWarmer },
      { label: t.email.refMoreDirect, instruction: t.email.instrMoreDirect },
    ],
    [t.email],
  );

  const appelerIa = useCallback(
    async (instruction: string) => {
      if (iaOccupee || !instruction.trim()) return;
      setIaOccupee(true);
      setErreur(null);
      try {
        const r = await apiPost<{ draft?: string; subject?: string }>('/api/draft', {
          // Vide au premier jet : la route bascule alors en « page blanche » et
          // écrit à partir de la seule consigne.
          previousDraft: texte,
          instructions: instruction,
          locale,
          accountEmail: boite,
          // L'IA ne propose un objet QUE si le champ est vide — arbitrage HA.
          // Elle n'écrase jamais ce qui a été tapé.
          wantSubject: !objet.trim(),
        });
        if (r?.draft) setTexte(r.draft);
        if (r?.subject && !objet.trim()) setObjet(r.subject);
        setConsigne('');
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : t.email.genFail);
      } finally {
        setIaOccupee(false);
      }
    },
    [iaOccupee, texte, objet, locale, boite, t.email.genFail],
  );

  // --- Pièces jointes -------------------------------------------------------
  const attStr = pjStr(locale);

  async function televerser(
    uri: string,
    name: string,
    type: string,
    taille?: number | null,
  ): Promise<string | null> {
    const nom = nomLisible(name);
    if (typeof taille === 'number' && taille > MAX_ATT_BYTES) return `${nom} — ${attStr.tooBig}`;
    const form = new FormData();
    // ⚠️ AUCUN `item_id` : c'est ce qui range la ligne du côté « mail neuf ».
    // La route accepte son absence depuis toujours (dossier `unsorted`), elle
    // n'avait simplement jamais eu d'appelant.
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

  // --- Envoi / brouillon ----------------------------------------------------
  const listeDestinataires = destinataires
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

  const agir = useCallback(
    async (op: 'send' | 'draft') => {
      if (occupe) return;
      if (!boite) {
        setErreur(s.aucuneBoite);
        return;
      }
      // Les deux exigences ne sont PAS les mêmes, et c'est délibéré : un envoi ne
      // se rattrape pas, un brouillon si. Même règle que dans /api/compose et
      // dans les deux workflows n8n.
      if (op === 'send' && listeDestinataires.length === 0) {
        setErreur(s.sansDestinataire);
        return;
      }
      if (op === 'send' && !texte.trim()) {
        setErreur(s.sansTexte);
        return;
      }
      setOccupe(op);
      setErreur(null);
      try {
        await apiPost('/api/compose', {
          op,
          accountEmail: boite,
          to: listeDestinataires,
          subject: objet,
          body: texte,
          idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        });
        router.back();
      } catch (e) {
        setErreur(e instanceof Error && e.message ? e.message : t.email.genFail);
        setOccupe(null);
      }
    },
    [occupe, boite, listeDestinataires, texte, objet, router, s, t.email.genFail],
  );

  /** Quelque chose a-t-il été écrit ? Sert au garde-fou du retour. */
  const commence =
    !!texte.trim() || !!objet.trim() || listeDestinataires.length > 0 || pieces.length > 0;

  const boitePlus = boites.length > 1;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable
            style={styles.backBtn}
            hitSlop={12}
            // On ne perd pas un message commencé sur un geste de retour.
            onPress={() => (commence ? setFeuille('quitter') : router.back())}
          >
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          <Text style={styles.titre}>{s.titre}</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.corps}
        contentContainerStyle={styles.corpsContenu}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* DE — toujours visible, même avec une seule boîte : envoyer depuis le
            mauvais compte ne se rattrape pas, on doit voir lequel part. */}
        <Text style={styles.label}>{s.de}</Text>
        <Pressable
          style={[styles.champ, styles.champPressable, !boitePlus && styles.champInerte]}
          disabled={!boitePlus}
          onPress={() => setFeuille('boites')}
        >
          <Text
            style={[styles.champTexte, !boitesLues && styles.champTexteEnAttente]}
            numberOfLines={1}
          >
            {boite || (boitesLues ? s.aucuneBoite : '…')}
          </Text>
        </Pressable>

        <Text style={styles.label}>{s.a}</Text>
        {/* Memoire des destinataires — 14/08/2026. Le champ reste une saisie
            libre separee par des virgules ; le composant n'ajoute que la liste
            de propositions, et il la vide des que `boite` change. */}
        <ChampDestinataires
          value={destinataires}
          onChange={setDestinataires}
          boite={boite}
          placeholder={s.aPlaceholder}
          locale={locale}
          style={styles.champ}
        />

        <Text style={styles.label}>{s.objet}</Text>
        <TextInput
          style={styles.champ}
          value={objet}
          onChangeText={setObjet}
          placeholder={s.objetPlaceholder}
          placeholderTextColor={colors.hint}
        />

        <Text style={styles.label}>{s.message}</Text>
        <TextInput
          style={styles.editeur}
          value={texte}
          onChangeText={setTexte}
          multiline
          textAlignVertical="top"
          placeholder={s.messagePlaceholder}
          placeholderTextColor={colors.hint}
        />

        {/* IA — mêmes puces que le brouillon de réponse. Éteintes tant qu'il n'y a
            rien à retoucher ; la consigne libre, elle, marche sur page blanche. */}
        <Text style={styles.label}>{t.email.adjust}</Text>
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
                  onPress={() => void appelerIa(r.instruction)}
                >
                  <Text style={styles.puceText}>{r.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.champ}
              value={consigne}
              onChangeText={setConsigne}
              placeholder={s.consigne}
              placeholderTextColor={colors.hint}
            />
            <Pressable
              style={[styles.secondaire, !consigne.trim() && styles.off]}
              disabled={!consigne.trim()}
              onPress={() => void appelerIa(consigne)}
            >
              {/* Orange, demande de HA le 14/08 : ce bouton FABRIQUE du texte,
                  il ne se contente pas de le ranger. Les deux boutons du bas,
                  eux, gardent le libelle clair sur fond sombre. */}
              <Text style={[styles.secondaireText, styles.iaBtnText]}>
                {texte.trim() ? t.email.reformulate : s.ecrire}
              </Text>
            </Pressable>
          </>
        )}

        <Text style={styles.label}>{s.pj}</Text>
        {pjHeritees ? <Text style={styles.note}>{s.pjOrphelines}</Text> : null}
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
          /* ⚠️ PLUS AUCUNE FEUILLE ICI — 14/08/2026, deuxieme correction.
             La premiere version ouvrait le selecteur natif depuis un Modal ; iOS
             refusait la seconde presentation (« Different document picking in
             progress »). J'ai d'abord retarde l'ouverture de 320 ms apres la
             fermeture — et plus rien ne se passait du tout. Plutot que de
             chercher le bon delai a l'aveugle sur un appareil que je n'ai pas,
             on SUPPRIME LA CAUSE : deux boutons en clair, appel direct, aucun
             Modal dans le chemin. Un geste de moins, et une classe entiere de
             panne qui disparait. */
          <View style={styles.pjBtns}>
            <Pressable style={styles.pjBtn} onPress={() => void depuisFichiers()}>
              <IconPlus size={14} color={colors.onDark} />
              <Text style={styles.pjBtnText}>{s.fichiers}</Text>
            </Pressable>
            <Pressable style={styles.pjBtn} onPress={() => void depuisPhotos()}>
              <IconPlus size={14} color={colors.onDark} />
              <Text style={styles.pjBtnText}>{s.photos}</Text>
            </Pressable>
          </View>
        )}

        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          style={[styles.cta, styles.flex1, occupe !== null && styles.off]}
          disabled={occupe !== null}
          onPress={() => void agir('send')}
        >
          <Text style={styles.ctaText}>{occupe === 'send' ? s.envoi : s.envoyer}</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaire, styles.flex1, occupe !== null && styles.off]}
          disabled={occupe !== null}
          onPress={() => void agir('draft')}
        >
          <Text style={styles.secondaireText}>
            {occupe === 'draft' ? s.enregistrement : s.brouillon}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={feuille !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFeuille(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setFeuille(null)}>
          <Pressable style={styles.carte} onPress={() => {}}>
            {feuille === 'boites' ? (
              <>
                <Text style={styles.carteTitre}>{s.de}</Text>
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
              </>
            ) : (
              <>
                <Text style={styles.carteTitre}>{s.quitter}</Text>
                <View style={styles.carteBtns}>
                  <Pressable
                    style={[styles.cta, styles.flex1]}
                    onPress={() => {
                      setFeuille(null);
                      router.back();
                    }}
                  >
                    <Text style={styles.ctaText}>{s.quitterOui}</Text>
                  </Pressable>
                  <Pressable style={styles.annuler} onPress={() => setFeuille(null)}>
                    <Text style={styles.annulerText}>{s.quitterNon}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  titre: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.onDark },

  corps: { flex: 1 },
  corpsContenu: { padding: spacing.xl, paddingBottom: spacing.xl },
  label: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
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
  champTexteEnAttente: { color: colors.hint },
  editeur: {
    fontFamily: fonts.sans,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    minHeight: 200,
  },
  note: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.onDarkMuted,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },

  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  puce: {
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  puceText: { fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.onDark },
  off: { opacity: 0.4 },
  iaEnCours: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  iaEnCoursText: { fontFamily: fonts.sans, fontSize: 13.5, color: colors.onDarkMuted },

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

  erreur: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.danger,
    marginTop: spacing.lg,
    lineHeight: 18,
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
  cta: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  secondaire: {
    borderWidth: 1,
    borderColor: 'rgba(234,225,208,0.28)',
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaireText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  // Le ton EXACT du bouton Envoyer (terracottaVivid), demande de HA le 14/08 :
  // terracottaLight paraissait delave a cote. Mesure sur le fond sombre #211e19 :
  // 4,75:1 — au-dessus du seuil AA de 4,5:1, donc lisible, pas seulement plus vif.
  iaBtnText: { color: colors.terracottaVivid },

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
    gap: spacing.sm,
  },
  carteTitre: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2, marginBottom: spacing.xs },
  option: { paddingVertical: 12 },
  optionText: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  optionActive: { fontFamily: fonts.sansBold, color: colors.terracotta },
  carteBtns: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  annuler: { paddingHorizontal: spacing.md, paddingVertical: 12 },
  annulerText: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.muted },
});
