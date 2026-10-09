// Textes du FICHIER JOINT À LA SIGNATURE (09/10/2026) — 8 langues.
// ⚠️ MÊME FICHIER dans l'app : veille-email-mobile/src/lib/i18n/signature-pj.ts. Si l'un
// change, copier l'autre à l'identique.

export type TextesPjSignature = {
  titre: string;
  explication: string;
  joindre: string;
  remplacer: string;
  retirer: string;
  envoi: string;
  tropGros: string;
  typeRefuse: string;
  echec: string;
  coupee: string;
  /** La petite étiquette à côté du nom du fichier, dans une réponse ou un nouveau mail. */
  etiquette: string;
  retirerDeCeMail: string;
  remettre: (nom: string) => string;
  nonVerifie: string;
};

const T: Record<string, TextesPjSignature> = {
  fr: {
    titre: 'Fichier joint à la signature',
    explication: 'Il part avec chaque réponse et chaque nouveau mail de cette boîte. Vous pouvez le retirer d’un mail précis.',
    joindre: 'Joindre un fichier',
    remplacer: 'Remplacer',
    retirer: 'Retirer',
    envoi: 'Envoi du fichier…',
    tropGros: 'Fichier trop volumineux (4 Mo maximum).',
    typeRefuse: 'Ce type de fichier n’est pas accepté.',
    echec: 'Le fichier n’a pas pu être enregistré.',
    coupee: 'La signature de cette boîte est désactivée : le fichier ne part pas.',
    etiquette: 'Signature',
    retirerDeCeMail: 'Retirer de ce mail',
    remettre: (n) => `Joindre à nouveau « ${n} »`,
    nonVerifie: 'Le fichier de la signature n’a pas pu être vérifié : il partira peut-être avec ce mail.',
  },
  en: {
    titre: 'File attached to the signature',
    explication: 'It goes out with every reply and every new email from this mailbox. You can remove it from a specific email.',
    joindre: 'Attach a file',
    remplacer: 'Replace',
    retirer: 'Remove',
    envoi: 'Uploading…',
    tropGros: 'File too large (4 MB max).',
    typeRefuse: 'This file type is not accepted.',
    echec: 'The file could not be saved.',
    coupee: 'The signature of this mailbox is turned off: the file is not sent.',
    etiquette: 'Signature',
    retirerDeCeMail: 'Remove from this email',
    remettre: (n) => `Attach “${n}” again`,
    nonVerifie: 'The signature file could not be checked: it may go out with this email.',
  },
  es: {
    titre: 'Archivo adjunto a la firma',
    explication: 'Se envía con cada respuesta y cada correo nuevo de este buzón. Puede quitarlo de un correo concreto.',
    joindre: 'Adjuntar un archivo',
    remplacer: 'Reemplazar',
    retirer: 'Quitar',
    envoi: 'Subiendo el archivo…',
    tropGros: 'Archivo demasiado grande (4 MB como máximo).',
    typeRefuse: 'Este tipo de archivo no se acepta.',
    echec: 'No se pudo guardar el archivo.',
    coupee: 'La firma de este buzón está desactivada: el archivo no se envía.',
    etiquette: 'Firma',
    retirerDeCeMail: 'Quitar de este correo',
    remettre: (n) => `Volver a adjuntar «${n}»`,
    nonVerifie: 'No se pudo comprobar el archivo de la firma: puede que se envíe con este correo.',
  },
  de: {
    titre: 'An die Signatur angehängte Datei',
    explication: 'Sie wird mit jeder Antwort und jeder neuen E-Mail aus diesem Postfach gesendet. Sie können sie aus einer einzelnen E-Mail entfernen.',
    joindre: 'Datei anhängen',
    remplacer: 'Ersetzen',
    retirer: 'Entfernen',
    envoi: 'Datei wird hochgeladen…',
    tropGros: 'Datei zu groß (maximal 4 MB).',
    typeRefuse: 'Dieser Dateityp wird nicht akzeptiert.',
    echec: 'Die Datei konnte nicht gespeichert werden.',
    coupee: 'Die Signatur dieses Postfachs ist deaktiviert: Die Datei wird nicht gesendet.',
    etiquette: 'Signatur',
    retirerDeCeMail: 'Aus dieser E-Mail entfernen',
    remettre: (n) => `„${n}“ wieder anhängen`,
    nonVerifie: 'Die Signaturdatei konnte nicht geprüft werden: Sie wird eventuell mit dieser E-Mail gesendet.',
  },
  pt: {
    titre: 'Ficheiro anexado à assinatura',
    explication: 'É enviado com cada resposta e cada novo email desta caixa. Pode retirá-lo de um email específico.',
    joindre: 'Anexar um ficheiro',
    remplacer: 'Substituir',
    retirer: 'Retirar',
    envoi: 'A enviar o ficheiro…',
    tropGros: 'Ficheiro demasiado grande (4 MB no máximo).',
    typeRefuse: 'Este tipo de ficheiro não é aceite.',
    echec: 'Não foi possível guardar o ficheiro.',
    coupee: 'A assinatura desta caixa está desativada: o ficheiro não é enviado.',
    etiquette: 'Assinatura',
    retirerDeCeMail: 'Retirar deste email',
    remettre: (n) => `Voltar a anexar «${n}»`,
    nonVerifie: 'Não foi possível verificar o ficheiro da assinatura: pode ser enviado com este email.',
  },
  it: {
    titre: 'File allegato alla firma',
    explication: 'Parte con ogni risposta e ogni nuova email di questa casella. Puoi toglierlo da una singola email.',
    joindre: 'Allega un file',
    remplacer: 'Sostituisci',
    retirer: 'Rimuovi',
    envoi: 'Caricamento del file…',
    tropGros: 'File troppo grande (massimo 4 MB).',
    typeRefuse: 'Questo tipo di file non è accettato.',
    echec: 'Non è stato possibile salvare il file.',
    coupee: 'La firma di questa casella è disattivata: il file non viene inviato.',
    etiquette: 'Firma',
    retirerDeCeMail: 'Togli da questa email',
    remettre: (n) => `Allega di nuovo «${n}»`,
    nonVerifie: 'Non è stato possibile verificare il file della firma: potrebbe partire con questa email.',
  },
  ar: {
    titre: 'ملف مرفق بالتوقيع',
    explication: 'يُرسَل مع كل رد وكل رسالة جديدة من هذا الصندوق. يمكنك إزالته من رسالة بعينها.',
    joindre: 'إرفاق ملف',
    remplacer: 'استبدال',
    retirer: 'إزالة',
    envoi: 'جارٍ رفع الملف…',
    tropGros: 'الملف كبير جدًا (4 ميغابايت كحد أقصى).',
    typeRefuse: 'نوع الملف هذا غير مقبول.',
    echec: 'تعذّر حفظ الملف.',
    coupee: 'توقيع هذا الصندوق معطّل: لن يُرسَل الملف.',
    etiquette: 'التوقيع',
    retirerDeCeMail: 'إزالة من هذه الرسالة',
    remettre: (n) => `إرفاق «${n}» من جديد`,
    nonVerifie: 'تعذّر التحقق من ملف التوقيع: قد يُرسَل مع هذه الرسالة.',
  },
  ru: {
    titre: 'Файл, прикреплённый к подписи',
    explication: 'Он отправляется с каждым ответом и каждым новым письмом из этого ящика. Его можно убрать из конкретного письма.',
    joindre: 'Прикрепить файл',
    remplacer: 'Заменить',
    retirer: 'Удалить',
    envoi: 'Загрузка файла…',
    tropGros: 'Файл слишком большой (не более 4 МБ).',
    typeRefuse: 'Этот тип файла не принимается.',
    echec: 'Не удалось сохранить файл.',
    coupee: 'Подпись этого ящика отключена: файл не отправляется.',
    etiquette: 'Подпись',
    retirerDeCeMail: 'Убрать из этого письма',
    remettre: (n) => `Снова прикрепить «${n}»`,
    nonVerifie: 'Не удалось проверить файл подписи: он может уйти с этим письмом.',
  },
};

export function textesPjSignature(locale: string): TextesPjSignature {
  return T[locale] ?? T.en!;
}

/** Taille lisible : « 312 Ko », « 2,4 Mo » (la virgule suit la langue). */
export function tailleLisible(octets: number, locale: string): string {
  const ko = octets / 1024;
  if (ko < 1024) return `${Math.max(1, Math.round(ko))} ${locale === 'fr' ? 'Ko' : 'KB'}`;
  const mo = (ko / 1024).toLocaleString(locale, { maximumFractionDigits: 1 });
  return `${mo} ${locale === 'fr' ? 'Mo' : 'MB'}`;
}
