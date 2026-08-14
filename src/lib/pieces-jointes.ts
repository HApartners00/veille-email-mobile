/**
 * PIÈCES JOINTES — libellés et règles PARTAGÉS par les écrans qui en attachent.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE (13/08/2026). Ces chaînes vivaient en local dans
 * `app/email/[id].tsx`. L'écran de rédaction d'un mail neuf en a besoin des mêmes,
 * et une deuxième copie aurait divergé — c'est exactement le problème qu'on venait
 * de fermer le même jour pour `ressembleAHtml`.
 *
 * `tooBig`, `badType`, `tooMany`, `failed` et `network` ne sont PAS décoratifs :
 * ils sont la seule chose que voit l'utilisateur quand un fichier est refusé. Le
 * 11/08, ces échecs étaient avalés par un `catch {}` vide et le fichier
 * disparaissait sans un mot — c'est ce silence qui avait fait passer la panne pour
 * un mystère.
 *
 * ⚠️ RESTE À FAIRE, DIT ET NON CACHÉ : `app/email/[id].tsx` porte ENCORE sa copie
 * locale. La migrer touche le rendu de tous les mails reçus, ce qui n'a rien à
 * faire dans le même lot que l'ajout d'un écran. À faire à part, en une passe.
 */

export const ATT_STR: Record<
  string,
  {
    label: string;
    add: string;
    sending: string;
    choose: string;
    files: string;
    photos: string;
    camera: string;
    cancel: string;
    permDenied: string;
    // Échecs d'ajout — 11/08/2026. Avant, `catch {}` vide : le fichier disparaissait
    // sans un mot, sur mobile comme sur le web.
    tooBig: string;
    badType: string;
    tooMany: string;
    failed: string;
    network: string;
  }
> = {
  fr: {
    label: 'Pièces jointes',
    add: 'Joindre un fichier',
    sending: 'Envoi…',
    choose: 'Ajouter une pièce jointe',
    files: 'Fichiers',
    photos: 'Photothèque',
    camera: 'Appareil photo',
    cancel: 'Annuler',
    permDenied: 'Accès refusé. Autorisez l’accès dans les réglages de votre appareil.',
    tooBig: 'Fichier trop lourd — 4 Mo maximum.',
    badType: 'Type de fichier non pris en charge.',
    tooMany: 'Maximum 10 pièces jointes.',
    failed: 'Pièce jointe refusée.',
    network: 'Erreur réseau.',
  },
  en: {
    label: 'Attachments',
    add: 'Attach a file',
    sending: 'Uploading…',
    choose: 'Add an attachment',
    files: 'Files',
    photos: 'Photo library',
    camera: 'Camera',
    cancel: 'Cancel',
    permDenied: 'Access denied. Enable access in your device settings.',
    tooBig: 'File too large — 4 MB maximum.',
    badType: 'File type not supported.',
    tooMany: 'Maximum 10 attachments.',
    failed: 'Attachment rejected.',
    network: 'Network error.',
  },
  es: {
    label: 'Archivos adjuntos',
    add: 'Adjuntar un archivo',
    sending: 'Subiendo…',
    choose: 'Añadir un adjunto',
    files: 'Archivos',
    photos: 'Fototeca',
    camera: 'Cámara',
    cancel: 'Cancelar',
    permDenied: 'Acceso denegado. Activa el acceso en los ajustes de tu dispositivo.',
    tooBig: 'Archivo demasiado pesado: 4 MB como máximo.',
    badType: 'Tipo de archivo no admitido.',
    tooMany: 'Máximo 10 archivos adjuntos.',
    failed: 'Archivo adjunto rechazado.',
    network: 'Error de red.',
  },
  de: {
    label: 'Anhänge',
    add: 'Datei anhängen',
    sending: 'Wird geladen…',
    choose: 'Anhang hinzufügen',
    files: 'Dateien',
    photos: 'Fotomediathek',
    camera: 'Kamera',
    cancel: 'Abbrechen',
    permDenied: 'Zugriff verweigert. Erlaube den Zugriff in den Geräteeinstellungen.',
    tooBig: 'Datei zu groß – maximal 4 MB.',
    badType: 'Dateityp nicht unterstützt.',
    tooMany: 'Maximal 10 Anhänge.',
    failed: 'Anhang abgelehnt.',
    network: 'Netzwerkfehler.',
  },
  pt: {
    label: 'Anexos',
    add: 'Anexar um ficheiro',
    sending: 'A enviar…',
    choose: 'Adicionar um anexo',
    files: 'Ficheiros',
    photos: 'Fototeca',
    camera: 'Câmara',
    cancel: 'Cancelar',
    permDenied: 'Acesso negado. Ative o acesso nas definições do seu dispositivo.',
    tooBig: 'Ficheiro demasiado pesado — máximo 4 MB.',
    badType: 'Tipo de ficheiro não suportado.',
    tooMany: 'Máximo de 10 anexos.',
    failed: 'Anexo recusado.',
    network: 'Erro de rede.',
  },
  it: {
    label: 'Allegati',
    add: 'Allega un file',
    sending: 'Caricamento…',
    choose: 'Aggiungi un allegato',
    files: 'File',
    photos: 'Libreria foto',
    camera: 'Fotocamera',
    cancel: 'Annulla',
    permDenied: 'Accesso negato. Abilita l’accesso nelle impostazioni del dispositivo.',
    tooBig: 'File troppo pesante — massimo 4 MB.',
    badType: 'Tipo di file non supportato.',
    tooMany: 'Massimo 10 allegati.',
    failed: 'Allegato rifiutato.',
    network: 'Errore di rete.',
  },
  ar: {
    label: 'المرفقات',
    add: 'إرفاق ملف',
    sending: '…جارٍ الرفع',
    choose: 'إضافة مرفق',
    files: 'الملفات',
    photos: 'مكتبة الصور',
    camera: 'الكاميرا',
    cancel: 'إلغاء',
    permDenied: 'تم رفض الوصول. فعّل الإذن من إعدادات جهازك.',
    tooBig: 'الملف كبير جدًا — 4 ميغابايت كحد أقصى.',
    badType: 'نوع الملف غير مدعوم.',
    tooMany: '10 مرفقات كحد أقصى.',
    failed: 'تم رفض المرفق.',
    network: 'خطأ في الشبكة.',
  },
  ru: {
    label: 'Вложения',
    add: 'Прикрепить файл',
    sending: 'Загрузка…',
    choose: 'Добавить вложение',
    files: 'Файлы',
    photos: 'Фотопленка',
    camera: 'Камера',
    cancel: 'Отмена',
    permDenied: 'Доступ запрещён. Разрешите доступ в настройках устройства.',
    tooBig: 'Файл слишком большой — максимум 4 МБ.',
    badType: 'Тип файла не поддерживается.',
    tooMany: 'Не более 10 вложений.',
    failed: 'Вложение отклонено.',
    network: 'Ошибка сети.',
  },
};

/** Le dictionnaire de la langue courante, repli anglais. */
export function pjStr(locale: string) {
  return ATT_STR[locale] ?? ATT_STR.en;
}

/**
 * Doit rester égal à MAX_BYTES de `apps/web/src/app/api/reply-attachments/route.ts`.
 * Au-delà de 4,5 Mo, Vercel renvoie un 413 AVANT d'exécuter la fonction (mesuré le
 * 11/08/2026) : on refuse ici plutôt que de faire voyager un fichier condamné.
 */
export const MAX_ATT_BYTES = 4 * 1024 * 1024;

// `expo-document-picker` renvoie souvent `application/octet-stream` pour un fichier
// parfaitement ordinaire, et c'est le seul type que la route refuse à coup sûr. On
// déduit alors le type de l'extension. Même table que côté serveur.
const MIME_PAR_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown',
  ics: 'text/calendar', rtf: 'application/rtf',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
};

export function typeRetenu(nom: string, declare: string): string {
  const d = (declare || '').toLowerCase().split(';')[0].trim();
  if (d && d !== 'application/octet-stream' && d !== 'binary/octet-stream') return d;
  const ext = (nom || '').toLowerCase().split('.').pop() || '';
  return MIME_PAR_EXTENSION[ext] || d || 'application/octet-stream';
}

/** Nom lisible : `uri.split('/').pop()` renvoie un nom déjà encodé en URL. */
export function nomLisible(nom: string): string {
  try {
    return decodeURIComponent(nom || '').trim() || 'fichier';
  } catch {
    return (nom || 'fichier').trim();
  }
}

/**
 * Message d'échec, JAMAIS muet. La route renvoie un code, pas une phrase : c'est
 * ici qu'on traduit 413 / 415 / 409 en quelque chose qui dit quoi faire.
 */
export function messageEchecPJ(str: ReturnType<typeof pjStr>, e: unknown): string {
  const msg = String((e as { message?: string })?.message || e || '');
  if (/\b413\b/.test(msg) || /trop volumineux|too large|Entity Too Large/i.test(msg)) return str.tooBig;
  if (/\b415\b/.test(msg) || /non pris en charge|non autoris|not supported/i.test(msg)) return str.badType;
  if (/\b409\b/.test(msg) || /maximum de pi|Maximum 10|maximum attach/i.test(msg)) return str.tooMany;
  if (/Network request failed|réseau|network/i.test(msg)) return str.network;
  return msg ? `${str.failed} ${msg}`.trim() : str.failed;
}
