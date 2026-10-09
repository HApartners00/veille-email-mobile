// Textes de « TRANSFÉRER UN MAIL REÇU » (09/10/2026) — 8 langues.
// ⚠️ MÊME FICHIER dans l'app : veille-email-mobile/src/lib/i18n/transfert.ts. Si l'un change,
// copier l'autre à l'identique.
//
// `entete` : le bloc posé au-dessus du mail d'origine (« ---------- Message transféré », De,
// Date, Objet, À, Cc). Le serveur le prend dans la langue de la personne qui transfère, comme
// Gmail. (Outlook écrit le sien lui-même, dans la langue de la boîte.)

export type TextesTransfert = {
  bouton: string;
  titre: string;
  a: string;
  placeholderA: string;
  copies: string;
  mot: string;
  placeholderMot: string;
  ia: string;
  iaReecrire: string;
  placeholderConsigne: string;
  iaEnCours: string;
  piecesOrigine: string;
  piecesOrigineInconnues: string;
  piecesOrigineIllisibles: string;
  ajoutees: string;
  ajouterFichier: string;
  envoiFichier: string;
  envoyer: string;
  envoi: string;
  confirmer: (n: number) => string;
  oui: string;
  annuler: string;
  fermer: string;
  fait: string;
  sansDestinataire: string;
  adresseInvalide: (x: string) => string;
  echec: string;
  echecIa: string;
  imapTexte: string;
  entete: { titre: string; de: string; date: string; objet: string; a: string; cc: string };
};

const T: Record<string, TextesTransfert> = {
  fr: {
    bouton: 'Transférer',
    titre: 'Transférer ce mail',
    a: 'À',
    placeholderA: 'Adresse e-mail (plusieurs : séparez par des virgules)',
    copies: 'Cc / Cci',
    mot: 'Votre mot',
    placeholderMot: 'Un mot au-dessus du message transféré (facultatif)…',
    ia: 'Écrire avec l’IA',
    iaReecrire: 'Modifier avec l’IA',
    placeholderConsigne: 'Ex. : demande-lui de valider le devis avant vendredi',
    iaEnCours: 'Rédaction…',
    piecesOrigine: 'Pièces jointes du mail (elles partent avec)',
    piecesOrigineInconnues: 'Les pièces jointes du mail partent avec le transfert.',
    piecesOrigineIllisibles: 'La liste des pièces jointes du mail n’a pas pu être lue. Elles partent quand même avec le transfert.',
    ajoutees: 'Fichiers ajoutés',
    ajouterFichier: 'Ajouter un fichier',
    envoiFichier: 'Envoi du fichier…',
    envoyer: 'Transférer',
    envoi: 'Transfert en cours…',
    confirmer: (n) => (n > 1 ? `Transférer ce mail à ${n} destinataires ?` : 'Transférer ce mail ?'),
    oui: 'Oui, transférer',
    annuler: 'Annuler',
    fermer: 'Fermer',
    fait: 'Mail transféré.',
    sansDestinataire: 'Ajoutez au moins un destinataire.',
    adresseInvalide: (x) => `Adresse invalide : ${x}`,
    echec: 'Le transfert n’a pas pu partir.',
    echecIa: 'L’IA n’a pas pu écrire le mot.',
    imapTexte: 'Depuis Yahoo et iCloud, le mail d’origine part en texte simple, avec ses pièces jointes.',
    entete: { titre: '---------- Message transféré ---------', de: 'De :', date: 'Date :', objet: 'Objet :', a: 'À :', cc: 'Cc :' },
  },
  en: {
    bouton: 'Forward',
    titre: 'Forward this email',
    a: 'To',
    placeholderA: 'Email address (several: separate with commas)',
    copies: 'Cc / Bcc',
    mot: 'Your note',
    placeholderMot: 'A note above the forwarded message (optional)…',
    ia: 'Write with AI',
    iaReecrire: 'Edit with AI',
    placeholderConsigne: 'E.g.: ask them to approve the quote before Friday',
    iaEnCours: 'Writing…',
    piecesOrigine: 'Email attachments (they go with it)',
    piecesOrigineInconnues: 'The email’s attachments go with the forward.',
    piecesOrigineIllisibles: 'The list of the email’s attachments could not be read. They still go with the forward.',
    ajoutees: 'Added files',
    ajouterFichier: 'Add a file',
    envoiFichier: 'Uploading…',
    envoyer: 'Forward',
    envoi: 'Forwarding…',
    confirmer: (n) => (n > 1 ? `Forward this email to ${n} recipients?` : 'Forward this email?'),
    oui: 'Yes, forward',
    annuler: 'Cancel',
    fermer: 'Close',
    fait: 'Email forwarded.',
    sansDestinataire: 'Add at least one recipient.',
    adresseInvalide: (x) => `Invalid address: ${x}`,
    echec: 'The forward could not be sent.',
    echecIa: 'The AI could not write the note.',
    imapTexte: 'From Yahoo and iCloud, the original email goes as plain text, with its attachments.',
    entete: { titre: '---------- Forwarded message ---------', de: 'From:', date: 'Date:', objet: 'Subject:', a: 'To:', cc: 'Cc:' },
  },
  es: {
    bouton: 'Reenviar',
    titre: 'Reenviar este correo',
    a: 'Para',
    placeholderA: 'Dirección de correo (varias: sepárelas con comas)',
    copies: 'Cc / Cco',
    mot: 'Su nota',
    placeholderMot: 'Una nota encima del mensaje reenviado (opcional)…',
    ia: 'Escribir con IA',
    iaReecrire: 'Modificar con IA',
    placeholderConsigne: 'Ej.: pídele que valide el presupuesto antes del viernes',
    iaEnCours: 'Redactando…',
    piecesOrigine: 'Adjuntos del correo (se envían también)',
    piecesOrigineInconnues: 'Los adjuntos del correo se envían con el reenvío.',
    piecesOrigineIllisibles: 'No se pudo leer la lista de adjuntos del correo. Se envían igualmente con el reenvío.',
    ajoutees: 'Archivos añadidos',
    ajouterFichier: 'Añadir un archivo',
    envoiFichier: 'Subiendo…',
    envoyer: 'Reenviar',
    envoi: 'Reenviando…',
    confirmer: (n) => (n > 1 ? `¿Reenviar este correo a ${n} destinatarios?` : '¿Reenviar este correo?'),
    oui: 'Sí, reenviar',
    annuler: 'Cancelar',
    fermer: 'Cerrar',
    fait: 'Correo reenviado.',
    sansDestinataire: 'Añada al menos un destinatario.',
    adresseInvalide: (x) => `Dirección no válida: ${x}`,
    echec: 'No se pudo enviar el reenvío.',
    echecIa: 'La IA no pudo escribir la nota.',
    imapTexte: 'Desde Yahoo e iCloud, el correo original se envía como texto simple, con sus adjuntos.',
    entete: { titre: '---------- Mensaje reenviado ---------', de: 'De:', date: 'Fecha:', objet: 'Asunto:', a: 'Para:', cc: 'Cc:' },
  },
  de: {
    bouton: 'Weiterleiten',
    titre: 'Diese E-Mail weiterleiten',
    a: 'An',
    placeholderA: 'E-Mail-Adresse (mehrere: durch Kommas trennen)',
    copies: 'Cc / Bcc',
    mot: 'Ihre Notiz',
    placeholderMot: 'Eine Notiz über der weitergeleiteten Nachricht (optional)…',
    ia: 'Mit KI schreiben',
    iaReecrire: 'Mit KI ändern',
    placeholderConsigne: 'Z. B.: bitte ihn, das Angebot vor Freitag freizugeben',
    iaEnCours: 'Wird geschrieben…',
    piecesOrigine: 'Anhänge der E-Mail (werden mitgesendet)',
    piecesOrigineInconnues: 'Die Anhänge der E-Mail werden mit weitergeleitet.',
    piecesOrigineIllisibles: 'Die Liste der Anhänge konnte nicht gelesen werden. Sie werden trotzdem mit weitergeleitet.',
    ajoutees: 'Hinzugefügte Dateien',
    ajouterFichier: 'Datei hinzufügen',
    envoiFichier: 'Wird hochgeladen…',
    envoyer: 'Weiterleiten',
    envoi: 'Wird weitergeleitet…',
    confirmer: (n) => (n > 1 ? `Diese E-Mail an ${n} Empfänger weiterleiten?` : 'Diese E-Mail weiterleiten?'),
    oui: 'Ja, weiterleiten',
    annuler: 'Abbrechen',
    fermer: 'Schließen',
    fait: 'E-Mail weitergeleitet.',
    sansDestinataire: 'Fügen Sie mindestens einen Empfänger hinzu.',
    adresseInvalide: (x) => `Ungültige Adresse: ${x}`,
    echec: 'Die Weiterleitung konnte nicht gesendet werden.',
    echecIa: 'Die KI konnte die Notiz nicht schreiben.',
    imapTexte: 'Aus Yahoo und iCloud wird die ursprüngliche E-Mail als reiner Text gesendet, mit ihren Anhängen.',
    entete: { titre: '---------- Weitergeleitete Nachricht ---------', de: 'Von:', date: 'Datum:', objet: 'Betreff:', a: 'An:', cc: 'Cc:' },
  },
  pt: {
    bouton: 'Reencaminhar',
    titre: 'Reencaminhar este email',
    a: 'Para',
    placeholderA: 'Endereço de email (vários: separe com vírgulas)',
    copies: 'Cc / Bcc',
    mot: 'A sua nota',
    placeholderMot: 'Uma nota acima da mensagem reencaminhada (opcional)…',
    ia: 'Escrever com IA',
    iaReecrire: 'Alterar com IA',
    placeholderConsigne: 'Ex.: pede-lhe que valide o orçamento antes de sexta-feira',
    iaEnCours: 'A redigir…',
    piecesOrigine: 'Anexos do email (seguem com ele)',
    piecesOrigineInconnues: 'Os anexos do email seguem com o reencaminhamento.',
    piecesOrigineIllisibles: 'Não foi possível ler a lista de anexos do email. Seguem na mesma com o reencaminhamento.',
    ajoutees: 'Ficheiros adicionados',
    ajouterFichier: 'Adicionar um ficheiro',
    envoiFichier: 'A enviar…',
    envoyer: 'Reencaminhar',
    envoi: 'A reencaminhar…',
    confirmer: (n) => (n > 1 ? `Reencaminhar este email para ${n} destinatários?` : 'Reencaminhar este email?'),
    oui: 'Sim, reencaminhar',
    annuler: 'Cancelar',
    fermer: 'Fechar',
    fait: 'Email reencaminhado.',
    sansDestinataire: 'Adicione pelo menos um destinatário.',
    adresseInvalide: (x) => `Endereço inválido: ${x}`,
    echec: 'Não foi possível enviar o reencaminhamento.',
    echecIa: 'A IA não conseguiu escrever a nota.',
    imapTexte: 'A partir do Yahoo e do iCloud, o email original segue em texto simples, com os seus anexos.',
    entete: { titre: '---------- Mensagem reencaminhada ---------', de: 'De:', date: 'Data:', objet: 'Assunto:', a: 'Para:', cc: 'Cc:' },
  },
  it: {
    bouton: 'Inoltra',
    titre: 'Inoltra questa email',
    a: 'A',
    placeholderA: 'Indirizzo email (più indirizzi: separali con virgole)',
    copies: 'Cc / Ccn',
    mot: 'Il tuo messaggio',
    placeholderMot: 'Un messaggio sopra l’email inoltrata (facoltativo)…',
    ia: 'Scrivi con l’IA',
    iaReecrire: 'Modifica con l’IA',
    placeholderConsigne: 'Es.: chiedigli di approvare il preventivo entro venerdì',
    iaEnCours: 'Scrittura…',
    piecesOrigine: 'Allegati dell’email (partono anche loro)',
    piecesOrigineInconnues: 'Gli allegati dell’email partono con l’inoltro.',
    piecesOrigineIllisibles: 'Non è stato possibile leggere l’elenco degli allegati. Partono comunque con l’inoltro.',
    ajoutees: 'File aggiunti',
    ajouterFichier: 'Aggiungi un file',
    envoiFichier: 'Caricamento…',
    envoyer: 'Inoltra',
    envoi: 'Inoltro in corso…',
    confirmer: (n) => (n > 1 ? `Inoltrare questa email a ${n} destinatari?` : 'Inoltrare questa email?'),
    oui: 'Sì, inoltra',
    annuler: 'Annulla',
    fermer: 'Chiudi',
    fait: 'Email inoltrata.',
    sansDestinataire: 'Aggiungi almeno un destinatario.',
    adresseInvalide: (x) => `Indirizzo non valido: ${x}`,
    echec: 'Non è stato possibile inoltrare l’email.',
    echecIa: 'L’IA non è riuscita a scrivere il messaggio.',
    imapTexte: 'Da Yahoo e iCloud, l’email originale parte come testo semplice, con i suoi allegati.',
    entete: { titre: '---------- Messaggio inoltrato ---------', de: 'Da:', date: 'Data:', objet: 'Oggetto:', a: 'A:', cc: 'Cc:' },
  },
  ar: {
    bouton: 'إعادة توجيه',
    titre: 'إعادة توجيه هذه الرسالة',
    a: 'إلى',
    placeholderA: 'عنوان البريد (عدة عناوين: افصل بينها بفواصل)',
    copies: 'نسخة / نسخة مخفية',
    mot: 'ملاحظتك',
    placeholderMot: 'ملاحظة فوق الرسالة المُعاد توجيهها (اختياري)…',
    ia: 'الكتابة بالذكاء الاصطناعي',
    iaReecrire: 'التعديل بالذكاء الاصطناعي',
    placeholderConsigne: 'مثال: اطلب منه الموافقة على عرض السعر قبل الجمعة',
    iaEnCours: 'جارٍ الكتابة…',
    piecesOrigine: 'مرفقات الرسالة (تُرسَل معها)',
    piecesOrigineInconnues: 'تُرسَل مرفقات الرسالة مع إعادة التوجيه.',
    piecesOrigineIllisibles: 'تعذّرت قراءة قائمة مرفقات الرسالة. ستُرسَل مع ذلك مع إعادة التوجيه.',
    ajoutees: 'ملفات مضافة',
    ajouterFichier: 'إضافة ملف',
    envoiFichier: 'جارٍ الرفع…',
    envoyer: 'إعادة توجيه',
    envoi: 'جارٍ إعادة التوجيه…',
    confirmer: (n) => (n > 1 ? `إعادة توجيه هذه الرسالة إلى ${n} مستلمين؟` : 'إعادة توجيه هذه الرسالة؟'),
    oui: 'نعم، أعد التوجيه',
    annuler: 'إلغاء',
    fermer: 'إغلاق',
    fait: 'تمت إعادة توجيه الرسالة.',
    sansDestinataire: 'أضف مستلمًا واحدًا على الأقل.',
    adresseInvalide: (x) => `عنوان غير صالح: ${x}`,
    echec: 'تعذّرت إعادة توجيه الرسالة.',
    echecIa: 'تعذّر على الذكاء الاصطناعي كتابة الملاحظة.',
    imapTexte: 'من Yahoo وiCloud، تُرسَل الرسالة الأصلية كنص بسيط مع مرفقاتها.',
    entete: { titre: '---------- رسالة مُعاد توجيهها ---------', de: 'من:', date: 'التاريخ:', objet: 'الموضوع:', a: 'إلى:', cc: 'نسخة:' },
  },
  ru: {
    bouton: 'Переслать',
    titre: 'Переслать это письмо',
    a: 'Кому',
    placeholderA: 'Адрес эл. почты (несколько — через запятую)',
    copies: 'Копия / Скрытая',
    mot: 'Ваша заметка',
    placeholderMot: 'Заметка над пересылаемым письмом (необязательно)…',
    ia: 'Написать с ИИ',
    iaReecrire: 'Изменить с ИИ',
    placeholderConsigne: 'Напр.: попроси его утвердить смету до пятницы',
    iaEnCours: 'Пишу…',
    piecesOrigine: 'Вложения письма (отправятся вместе с ним)',
    piecesOrigineInconnues: 'Вложения письма отправятся вместе с пересылкой.',
    piecesOrigineIllisibles: 'Не удалось прочитать список вложений письма. Они всё равно отправятся вместе с пересылкой.',
    ajoutees: 'Добавленные файлы',
    ajouterFichier: 'Добавить файл',
    envoiFichier: 'Загрузка…',
    envoyer: 'Переслать',
    envoi: 'Пересылка…',
    confirmer: (n) => (n > 1 ? `Переслать это письмо ${n} получателям?` : 'Переслать это письмо?'),
    oui: 'Да, переслать',
    annuler: 'Отмена',
    fermer: 'Закрыть',
    fait: 'Письмо переслано.',
    sansDestinataire: 'Добавьте хотя бы одного получателя.',
    adresseInvalide: (x) => `Неверный адрес: ${x}`,
    echec: 'Не удалось переслать письмо.',
    echecIa: 'ИИ не смог написать заметку.',
    imapTexte: 'Из Yahoo и iCloud исходное письмо отправляется простым текстом, со своими вложениями.',
    entete: { titre: '---------- Пересылаемое сообщение ---------', de: 'От:', date: 'Дата:', objet: 'Тема:', a: 'Кому:', cc: 'Копия:' },
  },
};

export function textesTransfert(locale: string): TextesTransfert {
  const l = String(locale || '').toLowerCase().slice(0, 2);
  return (T[l] ?? T.en)!;
}

/** Le préfixe d'objet d'un transfert (Gmail, Yahoo, iCloud). Outlook écrit le sien. */
export const PREFIXE_TRANSFERT = 'Fwd:';

/** Un objet déjà marqué « transféré » (Fwd, Fw, TR, WG, RV, Enc, I) ne reçoit pas de second préfixe. */
export function sujetDeTransfert(objet: string, prefixe = PREFIXE_TRANSFERT): string {
  const o = String(objet || '').trim();
  if (/^\s*(fwd?|tr|wg|rv|enc|i)\s*:/i.test(o)) return o;
  return `${prefixe} ${o}`.trim();
}
