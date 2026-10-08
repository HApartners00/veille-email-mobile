/**
 * « NON DISTRIBUÉ » — les mots de l'onglet Envoyés, 08/10/2026.
 *
 * POURQUOI. Le 08/10/2026, Vmail a affiché « Envoyé ✓ » pour une réponse qu'Apple avait
 * acceptée… puis refusée dix secondes plus tard par un mail de retour. Elle n'est jamais
 * arrivée, et l'onglet Envoyés la montrait comme les autres. Choix de HA : « le dire
 * clairement ». La relève reconnaît maintenant ces mails de retour
 * (côté web : apps/web/src/lib/imap/retours.ts) et remplit deux colonnes de `sent_items` :
 * `non_distribue_le` et `non_distribue_motif`. Ce fichier porte les mots pour le dire.
 *
 * ⚠️ CE QUE L'ÉCRAN A LE DROIT DE DIRE. La marque vient d'un MAIL REÇU. Elle n'est posée que
 * si ce mail est un rapport de remise normalisé qui cite l'identifiant de l'envoi — mais un
 * tel mail peut être fabriqué. On écrit donc d'où vient l'information (« un message de retour
 * est arrivé »), et l'absence de marque ne veut PAS dire « bien arrivé » : aujourd'hui seules
 * les boîtes Yahoo et iCloud sont regardées.
 *
 * `non_distribue_motif` est un texte RECOPIÉ d'un mail : il s'affiche dans un `<Text>`, tel
 * quel, et il est en anglais la plupart du temps (c'est la phrase du serveur).
 *
 * Dictionnaire LOCAL, même convention que le reste des écrans : quatre chaînes ne justifient
 * pas d'élargir le dictionnaire partagé. JUMEAU, mot pour mot, de
 * apps/web/src/lib/non-distribue.ts (dépôt du web).
 */
export type LibellesNonDistribue = {
  /** La pastille de la liste. */
  badge: string;
  /** Le titre de l'encadré, dans la page d'un envoi. */
  titre: string;
  /** Ce que ça veut dire, et d'où on le sait. */
  explication: string;
  /** Devant la phrase du serveur. */
  raison: string;
};

const LIBELLES: Record<string, LibellesNonDistribue> = {
  fr: {
    badge: 'Non distribué',
    titre: 'Ce message n’a pas été distribué.',
    explication: 'Un message de retour est arrivé dans votre boîte : la messagerie a refusé cet envoi. Il n’est pas arrivé à son destinataire.',
    raison: 'Raison donnée par la messagerie :',
  },
  en: {
    badge: 'Not delivered',
    titre: 'This message was not delivered.',
    explication: 'A bounce message arrived in your mailbox: the mail service rejected this email. It did not reach its recipient.',
    raison: 'Reason given by the mail service:',
  },
  es: {
    badge: 'No entregado',
    titre: 'Este mensaje no se ha entregado.',
    explication: 'Ha llegado un mensaje de devolución a tu buzón: el servicio de correo ha rechazado este envío. No ha llegado a su destinatario.',
    raison: 'Motivo indicado por el servicio de correo:',
  },
  de: {
    badge: 'Nicht zugestellt',
    titre: 'Diese Nachricht wurde nicht zugestellt.',
    explication: 'In deinem Postfach ist eine Unzustellbarkeitsmeldung eingegangen: Der E-Mail-Dienst hat diese Nachricht abgelehnt. Sie hat den Empfänger nicht erreicht.',
    raison: 'Vom E-Mail-Dienst angegebener Grund:',
  },
  pt: {
    badge: 'Não entregue',
    titre: 'Esta mensagem não foi entregue.',
    explication: 'Chegou uma mensagem de devolução à sua caixa: o serviço de email recusou este envio. Não chegou ao destinatário.',
    raison: 'Motivo indicado pelo serviço de email:',
  },
  it: {
    badge: 'Non recapitato',
    titre: 'Questo messaggio non è stato recapitato.',
    explication: 'Nella tua casella è arrivato un messaggio di mancato recapito: il servizio di posta ha rifiutato questo invio. Non è arrivato al destinatario.',
    raison: 'Motivo indicato dal servizio di posta:',
  },
  ar: {
    badge: 'لم يتم التسليم',
    titre: 'لم يتم تسليم هذه الرسالة.',
    explication: 'وصلت إلى بريدك رسالة إشعار بتعذّر التسليم: رفضت خدمة البريد هذا الإرسال. لم تصل الرسالة إلى المستلم.',
    raison: 'السبب الذي ذكرته خدمة البريد:',
  },
  ru: {
    badge: 'Не доставлено',
    titre: 'Это письмо не было доставлено.',
    explication: 'В ваш ящик пришло уведомление о недоставке: почтовый сервис отклонил это письмо. Оно не дошло до получателя.',
    raison: 'Причина, указанная почтовым сервисом:',
  },
};

export function libellesNonDistribue(locale: string): LibellesNonDistribue {
  return LIBELLES[locale] ?? LIBELLES.en!;
}

/** Un envoi porte-t-il la marque ? (Une date illisible n'en est pas une.) */
export function estNonDistribue(envoi: { non_distribue_le?: string | null } | null | undefined): boolean {
  const v = envoi?.non_distribue_le;
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));
}
