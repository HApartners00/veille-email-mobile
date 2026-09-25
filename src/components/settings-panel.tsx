import { utilisationTitre } from '@/components/utilisation';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { isRtl, locales, localeNames, type Locale } from '@/lib/i18n';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { IconChevronRight, IconFunnel, IconInbox, IconMinus, IconPlus } from '@/components/icons';
import { LogoVmail } from '@/components/logo-v';
import { SignatureSection, signatureTitle } from '@/components/signature-section';

// Jours dans l'ordre Lun→Dim ; le libellé vient du dictionnaire (daysShort, indexé 0=Dim).
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

// Mot de confirmation de la suppression de compte.
// 🔴 NE PAS TRADUIRE ni modifier : /api/account/delete attend exactement 'SUPPRIMER'.
// Il est affiché à l'écran, donc recopiable quelle que soit la langue de l'interface.
const CONFIRM_WORD = 'SUPPRIMER';


// Verrou d'option, formulation NEUTRE — 27/08/2026.
// Avant : ce bloc portait les noms de formules, un « Choisissez votre formule »,
// « {price}/mois » et « Passer a Premium ». Retire apres le refus App Store du
// 27/08 (regles 3.1.1 et 3.1.3(c)) : l'app iOS ne doit rien dire d'un service
// payant qu'elle ne permet pas d'acheter. Le verrou reste applique COTE SERVEUR ;
// ici on se contente d'expliquer que l'option n'est pas active.
type PlanStrings = { lockBody: string };
const PLAN_STR: Record<string, PlanStrings> = {
  fr: { lockBody: 'Cette option n’est pas activée sur votre compte.' },
  en: { lockBody: 'This option is not enabled on your account.' },
  es: { lockBody: 'Esta opción no está activada en tu cuenta.' },
  de: { lockBody: 'Diese Option ist für dein Konto nicht aktiviert.' },
  pt: { lockBody: 'Esta opção não está ativada na sua conta.' },
  it: { lockBody: 'Questa opzione non è attiva sul tuo account.' },
  ar: { lockBody: 'هذا الخيار غير مُفعَّل في حسابك.' },
  ru: { lockBody: 'Эта опция не включена в вашем аккаунте.' },
};

// Libellés de la carte « Personnalisation » (autonomes, repli anglais).
type PersoStrings = {
  title: string;
  master: string;
  masterHint: string;
  learn: string;
  learnHint: string;
  reset: string;
  resetConfirm: string;
  resetCancel: string;
  resetOk: string;
  done: string;
  err: string;
  viewStyle: string;
};
const PERSO: Record<string, PersoStrings> = {
  fr: {
    title: 'Personnalisation',
    master: 'Adapter l’écriture à mon style',
    masterHint:
      'L’outil apprend votre ton et votre façon d’écrire à chaque destinataire, à partir de vos réponses.',
    learn: 'Apprendre de mes réponses',
    learnHint:
      'Conserve quelques réponses réelles pour mieux imiter votre style. Sinon, seul un portrait abstrait est gardé.',
    reset: 'Réinitialiser ma personnalisation',
    resetConfirm: 'Effacer tout le style appris ? Action irréversible.',
    resetCancel: 'Annuler',
    resetOk: 'Réinitialiser',
    done: 'Personnalisation réinitialisée.',
    err: 'Action impossible.',
    viewStyle: 'Voir votre style',
  },
  en: {
    title: 'Personalization',
    master: 'Adapt writing to my style',
    masterHint:
      'The tool learns your tone and writing style for each recipient, from your replies.',
    learn: 'Learn from my replies',
    learnHint:
      'Keeps a few real replies to better imitate your style. Otherwise only an abstract profile is kept.',
    reset: 'Reset my personalization',
    resetConfirm: 'Erase all learned style? This cannot be undone.',
    resetCancel: 'Cancel',
    resetOk: 'Reset',
    done: 'Personalization reset.',
    err: 'Action failed.',
    viewStyle: 'View your style',
  },
  es: {
    title: 'Personalización',
    master: 'Adaptar la redacción a mi estilo',
    masterHint:
      'La herramienta aprende tu tono y tu forma de escribir con cada destinatario, a partir de tus respuestas.',
    learn: 'Aprender de mis respuestas',
    learnHint:
      'Guarda algunas respuestas reales para imitar mejor tu estilo. Si no, solo se guarda un perfil abstracto.',
    reset: 'Restablecer mi personalización',
    resetConfirm: '¿Borrar todo el estilo aprendido? Acción irreversible.',
    resetCancel: 'Cancelar',
    resetOk: 'Restablecer',
    done: 'Personalización restablecida.',
    err: 'Acción imposible.',
    viewStyle: 'Ver tu estilo',
  },
  de: {
    title: 'Personalisierung',
    master: 'Schreibstil an mich anpassen',
    masterHint:
      'Das Tool lernt deinen Ton und Schreibstil pro Empfänger aus deinen Antworten.',
    learn: 'Aus meinen Antworten lernen',
    learnHint:
      'Speichert einige echte Antworten, um deinen Stil besser nachzuahmen. Sonst nur ein abstraktes Profil.',
    reset: 'Personalisierung zurücksetzen',
    resetConfirm: 'Allen gelernten Stil löschen? Nicht umkehrbar.',
    resetCancel: 'Abbrechen',
    resetOk: 'Zurücksetzen',
    done: 'Personalisierung zurückgesetzt.',
    err: 'Aktion fehlgeschlagen.',
    viewStyle: 'Deinen Stil ansehen',
  },
  pt: {
    title: 'Personalização',
    master: 'Adaptar a escrita ao meu estilo',
    masterHint:
      'A ferramenta aprende o seu tom e a sua forma de escrever para cada destinatário, a partir das suas respostas.',
    learn: 'Aprender com as minhas respostas',
    learnHint:
      'Guarda algumas respostas reais para imitar melhor o seu estilo. Caso contrário, apenas um perfil abstrato.',
    reset: 'Repor a minha personalização',
    resetConfirm: 'Apagar todo o estilo aprendido? Ação irreversível.',
    resetCancel: 'Cancelar',
    resetOk: 'Repor',
    done: 'Personalização reposta.',
    err: 'Ação impossível.',
    viewStyle: 'Ver o seu estilo',
  },
  it: {
    title: 'Personalizzazione',
    master: 'Adatta la scrittura al mio stile',
    masterHint:
      'Lo strumento impara il tuo tono e il tuo modo di scrivere per ciascun destinatario, dalle tue risposte.',
    learn: 'Impara dalle mie risposte',
    learnHint:
      'Conserva alcune risposte reali per imitare meglio il tuo stile. Altrimenti solo un profilo astratto.',
    reset: 'Reimposta la mia personalizzazione',
    resetConfirm: 'Cancellare tutto lo stile appreso? Azione irreversibile.',
    resetCancel: 'Annulla',
    resetOk: 'Reimposta',
    done: 'Personalizzazione reimpostata.',
    err: 'Azione impossibile.',
    viewStyle: 'Vedi il tuo stile',
  },
  ar: {
    title: 'التخصيص',
    master: 'تكييف الكتابة مع أسلوبي',
    masterHint: 'تتعلّم الأداة نبرتك وأسلوبك في الكتابة لكل مُراسَل، انطلاقًا من ردودك.',
    learn: 'التعلّم من ردودي',
    learnHint: 'تحتفظ ببعض الردود الفعلية لتقليد أسلوبك بشكل أفضل. وإلا، يُحفظ ملف مجرّد فقط.',
    reset: 'إعادة ضبط التخصيص',
    resetConfirm: 'مسح كل الأسلوب المُتعلَّم؟ إجراء لا رجعة فيه.',
    resetCancel: 'إلغاء',
    resetOk: 'إعادة ضبط',
    done: 'تمت إعادة ضبط التخصيص.',
    err: 'تعذّر تنفيذ الإجراء.',
    viewStyle: 'عرض أسلوبك',
  },
  ru: {
    title: 'Персонализация',
    master: 'Адаптировать письмо под мой стиль',
    masterHint:
      'Инструмент изучает ваш тон и манеру письма для каждого получателя на основе ваших ответов.',
    learn: 'Учиться на моих ответах',
    learnHint:
      'Сохраняет несколько реальных ответов, чтобы лучше имитировать ваш стиль. Иначе хранится только абстрактный профиль.',
    reset: 'Сбросить персонализацию',
    resetConfirm: 'Удалить весь изученный стиль? Действие необратимо.',
    resetCancel: 'Отмена',
    resetOk: 'Сбросить',
    done: 'Персонализация сброшена.',
    err: 'Не удалось выполнить действие.',
    viewStyle: 'Посмотреть ваш стиль',
  },
};

// Libellés « Parrainage » (autonomes, repli anglais).
type RefStrings = {
  title: string;
  yourCode: string;
  share: string;
  none: string;
  haveCode: string;
  codePlaceholder: string;
  apply: string;
  applied: string;
  invalid: string;
  // 17/09/2026 — suivi complet du parrainage dans l'app (decision de HA).
  count: string;
  discount: string;
  gainsTitle: string;
  rate: string;
  balance: string;
  noGains: string;
  setup: string;
  setupResume: string;
  setupReady: string;
  setupHint: string;
  withdraw: string;
  minHint: string;
  sent: string;
  history: string;
  stDemande: string;
  stEnvoye: string;
  stEchec: string;
  err: string;
};
const REF_STR: Record<string, RefStrings> = {
  fr: {
    title: 'Parrainage',
    yourCode: 'Votre code',
    share: 'Partager mon lien',
    none: 'Aucun filleul pour le moment — partagez votre lien !',
    haveCode: 'Vous avez un code de parrainage ?',
    codePlaceholder: 'Code (ex. ABCD1234)',
    apply: 'Appliquer',
    applied: 'Code appliqué !',
    invalid: 'Code invalide ou compte non éligible.',
    count: 'Filleuls abonnés : {n}',
    discount: 'Réduction obtenue : -{pct} %',
    gainsTitle: 'Vos gains',
    rate: 'Votre réduction est de 100 %, et chaque filleul en plus vous rapporte {pct} % en argent à chaque période.',
    balance: 'Solde disponible : {amount}',
    noGains: 'Pas encore de gains.',
    setup: 'Configurer mes virements',
    setupResume: 'Terminer la configuration de mes virements',
    setupReady: 'Virements configurés.',
    setupHint: 'Stripe vérifie votre identité et garde vos coordonnées bancaires. Vmail ne les voit jamais.',
    withdraw: 'Retirer {amount}',
    minHint: 'Retrait possible dès {min}.',
    sent: 'Virement envoyé : {amount}. Il arrive sous quelques jours.',
    history: 'Derniers retraits',
    stDemande: 'en cours',
    stEnvoye: 'envoyé',
    stEchec: 'refusé — solde rendu',
    err: 'Lecture impossible.',
  },
  en: {
    title: 'Referral program',
    yourCode: 'Your code',
    share: 'Share my link',
    none: 'No referrals yet — share your link!',
    haveCode: 'Have a referral code?',
    codePlaceholder: 'Code (e.g. ABCD1234)',
    apply: 'Apply',
    applied: 'Code applied!',
    invalid: 'Invalid code or account not eligible.',
    count: 'Subscribed referrals: {n}',
    discount: 'Discount earned: -{pct}%',
    gainsTitle: 'Your earnings',
    rate: 'Your discount is 100%, and each extra referral earns you {pct}% in cash every period.',
    balance: 'Available balance: {amount}',
    noGains: 'No earnings yet.',
    setup: 'Set up payouts',
    setupResume: 'Finish setting up payouts',
    setupReady: 'Payouts are set up.',
    setupHint: 'Stripe verifies your identity and keeps your bank details. Vmail never sees them.',
    withdraw: 'Withdraw {amount}',
    minHint: 'You can withdraw from {min}.',
    sent: 'Payout sent: {amount}. It arrives within a few days.',
    history: 'Recent payouts',
    stDemande: 'in progress',
    stEnvoye: 'sent',
    stEchec: 'declined — balance restored',
    err: 'Unable to load.',
  },
  es: {
    title: 'Programa de recomendación',
    yourCode: 'Tu código',
    share: 'Compartir mi enlace',
    none: 'Aún no hay recomendados — ¡comparte tu enlace!',
    haveCode: '¿Tienes un código de recomendación?',
    codePlaceholder: 'Código (ej. ABCD1234)',
    apply: 'Aplicar',
    applied: '¡Código aplicado!',
    invalid: 'Código no válido o cuenta no elegible.',
    count: 'Recomendados suscritos: {n}',
    discount: 'Descuento obtenido: -{pct} %',
    gainsTitle: 'Tus ganancias',
    rate: 'Tu descuento es del 100 % y cada recomendado adicional te da un {pct} % en dinero cada periodo.',
    balance: 'Saldo disponible: {amount}',
    noGains: 'Aún no hay ganancias.',
    setup: 'Configurar mis transferencias',
    setupResume: 'Terminar de configurar mis transferencias',
    setupReady: 'Transferencias configuradas.',
    setupHint: 'Stripe verifica tu identidad y guarda tus datos bancarios. Vmail nunca los ve.',
    withdraw: 'Retirar {amount}',
    minHint: 'Puedes retirar a partir de {min}.',
    sent: 'Transferencia enviada: {amount}. Llega en unos días.',
    history: 'Últimos retiros',
    stDemande: 'en curso',
    stEnvoye: 'enviado',
    stEchec: 'rechazado — saldo devuelto',
    err: 'No se pudo cargar.',
  },
  de: {
    title: 'Empfehlungsprogramm',
    yourCode: 'Dein Code',
    share: 'Meinen Link teilen',
    none: 'Noch keine Empfehlungen — teile deinen Link!',
    haveCode: 'Hast du einen Empfehlungscode?',
    codePlaceholder: 'Code (z. B. ABCD1234)',
    apply: 'Anwenden',
    applied: 'Code angewendet!',
    invalid: 'Ungültiger Code oder Konto nicht berechtigt.',
    count: 'Abonnierte Empfehlungen: {n}',
    discount: 'Erhaltener Rabatt: -{pct} %',
    gainsTitle: 'Deine Einnahmen',
    rate: 'Dein Rabatt beträgt 100 %, und jede weitere Empfehlung bringt dir pro Zeitraum {pct} % in Geld.',
    balance: 'Verfügbares Guthaben: {amount}',
    noGains: 'Noch keine Einnahmen.',
    setup: 'Auszahlungen einrichten',
    setupResume: 'Einrichtung der Auszahlungen abschließen',
    setupReady: 'Auszahlungen sind eingerichtet.',
    setupHint: 'Stripe prüft deine Identität und verwahrt deine Bankdaten. Vmail sieht sie nie.',
    withdraw: '{amount} auszahlen',
    minHint: 'Auszahlung ab {min} möglich.',
    sent: 'Auszahlung gesendet: {amount}. Sie kommt in wenigen Tagen an.',
    history: 'Letzte Auszahlungen',
    stDemande: 'läuft',
    stEnvoye: 'gesendet',
    stEchec: 'abgelehnt — Guthaben erstattet',
    err: 'Laden nicht möglich.',
  },
  pt: {
    title: 'Programa de indicação',
    yourCode: 'O teu código',
    share: 'Partilhar a minha ligação',
    none: 'Ainda sem indicados — partilha a tua ligação!',
    haveCode: 'Tens um código de indicação?',
    codePlaceholder: 'Código (ex. ABCD1234)',
    apply: 'Aplicar',
    applied: 'Código aplicado!',
    invalid: 'Código inválido ou conta não elegível.',
    count: 'Indicados subscritos: {n}',
    discount: 'Desconto obtido: -{pct} %',
    gainsTitle: 'Os teus ganhos',
    rate: 'O teu desconto é de 100 % e cada indicado a mais rende-te {pct} % em dinheiro por período.',
    balance: 'Saldo disponível: {amount}',
    noGains: 'Ainda sem ganhos.',
    setup: 'Configurar as minhas transferências',
    setupResume: 'Concluir a configuração das transferências',
    setupReady: 'Transferências configuradas.',
    setupHint: 'O Stripe verifica a tua identidade e guarda os teus dados bancários. O Vmail nunca os vê.',
    withdraw: 'Levantar {amount}',
    minHint: 'Levantamento possível a partir de {min}.',
    sent: 'Transferência enviada: {amount}. Chega em poucos dias.',
    history: 'Últimos levantamentos',
    stDemande: 'em curso',
    stEnvoye: 'enviado',
    stEchec: 'recusado — saldo reposto',
    err: 'Não foi possível carregar.',
  },
  it: {
    title: 'Programma di referral',
    yourCode: 'Il tuo codice',
    share: 'Condividi il mio link',
    none: 'Ancora nessun invitato — condividi il tuo link!',
    haveCode: 'Hai un codice di referral?',
    codePlaceholder: 'Codice (es. ABCD1234)',
    apply: 'Applica',
    applied: 'Codice applicato!',
    invalid: 'Codice non valido o account non idoneo.',
    count: 'Invitati abbonati: {n}',
    discount: 'Sconto ottenuto: -{pct}%',
    gainsTitle: 'I tuoi guadagni',
    rate: 'Il tuo sconto è del 100% e ogni invitato in più ti fa guadagnare il {pct}% in denaro per periodo.',
    balance: 'Saldo disponibile: {amount}',
    noGains: 'Ancora nessun guadagno.',
    setup: 'Configura i miei bonifici',
    setupResume: 'Completa la configurazione dei bonifici',
    setupReady: 'Bonifici configurati.',
    setupHint: 'Stripe verifica la tua identità e custodisce i tuoi dati bancari. Vmail non li vede mai.',
    withdraw: 'Preleva {amount}',
    minHint: 'Prelievo possibile da {min}.',
    sent: 'Bonifico inviato: {amount}. Arriva in pochi giorni.',
    history: 'Ultimi prelievi',
    stDemande: 'in corso',
    stEnvoye: 'inviato',
    stEchec: 'rifiutato — saldo ripristinato',
    err: 'Impossibile caricare.',
  },
  ar: {
    title: 'برنامج الإحالة',
    yourCode: 'رمزك',
    share: 'مشاركة رابطي',
    none: 'لا مُحالين بعد — شارك رابطك!',
    haveCode: 'لديك رمز إحالة؟',
    codePlaceholder: 'الرمز (مثال ABCD1234)',
    apply: 'تطبيق',
    applied: 'تم تطبيق الرمز!',
    invalid: 'رمز غير صالح أو حساب غير مؤهل.',
    count: 'المُحالون المشتركون: {n}',
    discount: 'الخصم المحصَّل: ‎-{pct}%‎',
    gainsTitle: 'أرباحك',
    rate: 'خصمك 100%، وكل مُحال إضافي يربحك {pct}‎%‎ نقدًا في كل فترة.',
    balance: 'الرصيد المتاح: {amount}',
    noGains: 'لا أرباح بعد.',
    setup: 'إعداد التحويلات',
    setupResume: 'إكمال إعداد التحويلات',
    setupReady: 'تم إعداد التحويلات.',
    setupHint: 'تتحقق Stripe من هويتك وتحتفظ ببياناتك البنكية. لا يراها Vmail أبدًا.',
    withdraw: 'سحب {amount}',
    minHint: 'السحب ممكن ابتداءً من {min}.',
    sent: 'تم إرسال التحويل: {amount}. يصل خلال أيام.',
    history: 'آخر عمليات السحب',
    stDemande: 'قيد التنفيذ',
    stEnvoye: 'مُرسل',
    stEchec: 'مرفوض — أُعيد الرصيد',
    err: 'تعذّر التحميل.',
  },
  ru: {
    title: 'Реферальная программа',
    yourCode: 'Ваш код',
    share: 'Поделиться ссылкой',
    none: 'Пока нет приглашённых — поделитесь ссылкой!',
    haveCode: 'Есть реферальный код?',
    codePlaceholder: 'Код (напр. ABCD1234)',
    apply: 'Применить',
    applied: 'Код применён!',
    invalid: 'Неверный код или аккаунт не подходит.',
    count: 'Подписавшиеся приглашённые: {n}',
    discount: 'Полученная скидка: -{pct} %',
    gainsTitle: 'Ваш доход',
    rate: 'Ваша скидка — 100 %, и каждый следующий приглашённый приносит вам {pct} % деньгами за каждый период.',
    balance: 'Доступный баланс: {amount}',
    noGains: 'Дохода пока нет.',
    setup: 'Настроить выплаты',
    setupResume: 'Завершить настройку выплат',
    setupReady: 'Выплаты настроены.',
    setupHint: 'Stripe проверяет вашу личность и хранит банковские данные. Vmail их не видит.',
    withdraw: 'Вывести {amount}',
    minHint: 'Вывод возможен от {min}.',
    sent: 'Перевод отправлен: {amount}. Поступит через несколько дней.',
    history: 'Последние выводы',
    stDemande: 'выполняется',
    stEnvoye: 'отправлен',
    stEchec: 'отклонён — баланс возвращён',
    err: 'Не удалось загрузить.',
  },
};

/**
 * Preferences de notification par categorie. Libelles repris MOT POUR MOT de
 * apps/web/src/app/settings/notification-settings.tsx : meme ecran, meme API
 * (/api/notification-prefs, qui accepte deja l'auth Bearer mobile), memes
 * valeurs par defaut (info desactive).
 */
const NOTIF: Record<
  string,
  { title: string; sub: string; urgent: string; important: string; human: string; info: string; hint: string; err: string }
> = {
  fr: { title: 'Notifications', sub: 'Choisis les catégories qui déclenchent une notification sur ton téléphone.', urgent: 'Urgent', important: 'Important', human: 'À répondre', info: 'Info', hint: 'Une notification est envoyée dès qu’un nouvel email d’une catégorie activée arrive.', err: 'Lecture impossible.' },
  en: { title: 'Notifications', sub: 'Choose which categories send a notification to your phone.', urgent: 'Urgent', important: 'Important', human: 'To reply', info: 'Info', hint: 'A notification is sent as soon as a new email in an enabled category arrives.', err: 'Unable to load.' },
  es: { title: 'Notificaciones', sub: 'Elige qué categorías envían una notificación a tu teléfono.', urgent: 'Urgente', important: 'Importante', human: 'Por responder', info: 'Info', hint: 'Se envía una notificación en cuanto llega un nuevo correo de una categoría activada.', err: 'No se pudo cargar.' },
  de: { title: 'Benachrichtigungen', sub: 'Wähle, welche Kategorien eine Benachrichtigung an dein Telefon senden.', urgent: 'Dringend', important: 'Wichtig', human: 'Zu beantworten', info: 'Info', hint: 'Eine Benachrichtigung wird gesendet, sobald eine neue E-Mail einer aktivierten Kategorie eintrifft.', err: 'Laden nicht möglich.' },
  pt: { title: 'Notificações', sub: 'Escolhe que categorias enviam uma notificação para o teu telemóvel.', urgent: 'Urgente', important: 'Importante', human: 'Para responder', info: 'Info', hint: 'Uma notificação é enviada assim que chega um novo email de uma categoria ativada.', err: 'Não foi possível carregar.' },
  it: { title: 'Notifiche', sub: 'Scegli quali categorie inviano una notifica sul tuo telefono.', urgent: 'Urgente', important: 'Importante', human: 'Da rispondere', info: 'Info', hint: 'Una notifica viene inviata appena arriva una nuova email di una categoria attivata.', err: 'Caricamento non riuscito.' },
  ar: { title: 'الإشعارات', sub: 'اختر الفئات التي ترسل إشعارًا إلى هاتفك.', urgent: 'عاجل', important: 'مهم', human: 'للرد', info: 'معلومة', hint: 'يُرسَل إشعار فور وصول بريد جديد من فئة مُفعّلة.', err: 'تعذّر التحميل.' },
  ru: { title: 'Уведомления', sub: 'Выберите категории, которые отправляют уведомление на телефон.', urgent: 'Срочное', important: 'Важное', human: 'Требует ответа', info: 'К сведению', hint: 'Уведомление отправляется, как только приходит новое письмо активированной категории.', err: 'Не удалось загрузить.' },
};

type NotifPrefs = { urgent: boolean; important: boolean; human: boolean; info: boolean };

const NOTIF_ROWS: { key: keyof NotifPrefs; color: string }[] = [
  { key: 'urgent', color: '#c2410c' },
  { key: 'important', color: '#b8860b' },
  { key: 'human', color: '#4a443a' },
  { key: 'info', color: '#3f7e58' },
];

export type SettingsSection =
  | 'index'
  | 'langue'
  | 'notifications'
  | 'rapport'
  | 'parrainage'
  | 'personnalisation'
  | 'signature'
  | 'compte';

/**
 * Panneau des reglages. UN seul composant porte tout l'etat (rapport quotidien,
 * facturation, personnalisation, parrainage) ; `only` choisit ce qu'il affiche :
 * l'index cliquable, ou une seule section quand on est entre dedans.
 *
 * Avant : tout etait empile sur un seul ecran de ~1900 pt de defilement.
 */
export function SettingsPanel({ only = 'index' }: { only?: SettingsSection }) {
  const { session, signOut } = useAuth();
  const { t, f, intl, locale, setLocale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const email = session?.user?.email ?? '—';
  const [loading, setLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hour, setHour] = useState(7);
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Preferences de notification (memes defauts que le web : info desactive).
  const nt = NOTIF[locale] ?? NOTIF.en;
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    urgent: true,
    important: true,
    human: true,
    info: false,
  });
  const [notifLoaded, setNotifLoaded] = useState(false);
  const [notifErr, setNotifErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<NotifPrefs>('/api/notification-prefs');
        if (r && typeof r.urgent === 'boolean') {
          setNotifPrefs({ urgent: r.urgent, important: r.important, human: r.human, info: r.info });
        }
      } catch {
        setNotifErr(nt.err);
      } finally {
        setNotifLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleNotif(key: keyof NotifPrefs) {
    const prev = notifPrefs;
    const next = { ...prev, [key]: !prev[key] };
    setNotifPrefs(next);
    setNotifErr(null);
    try {
      await apiPost('/api/notification-prefs', next);
    } catch {
      setNotifPrefs(prev); // rollback : l'interrupteur ne doit pas mentir
      setNotifErr(nt.err);
    }
  }

  // Parrainage (programme ambassadeur)
  const rs = REF_STR[locale] ?? REF_STR.en;
  // 17/09/2026 — l'app montre le MEME suivi que le web (decision de HA :
  // « c'est horrible s'il doit aller chercher son PC juste pour ca ») :
  // filleuls, reduction, et au-dela de 100 % les gains, les virements et le
  // retrait. Meme route que le web (/api/referral), memes regles serveur.
  // ⚠️ Risque App Store assume par HA : le parrainage n'est pas un achat,
  // mais l'ecran parle d'argent. Aucun prix d'abonnement n'y figure.
  type Referral = {
    code: string | null;
    link: string | null;
    discount_pct: number;
    active_count: number;
    gain_pct?: number;
    balances?: { currency: string; cents: number }[];
    min_withdraw_cents?: number;
    payouts_setup?: 'aucun' | 'a_finir' | 'pret' | 'inconnu';
    payouts?: { amount_cents: number; currency: string; status: 'demande' | 'envoye' | 'echec'; created_at: string }[];
    gains_error?: string | null;
  };
  const [referral, setReferral] = useState<Referral | null>(null);
  const [refErr, setRefErr] = useState(false);
  const [refTick, setRefTick] = useState(0);
  const [refBusy, setRefBusy] = useState<'virements' | 'retrait' | null>(null);
  const [refMsg, setRefMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<Referral>('/api/referral');
        setReferral(r);
        setRefErr(false);
      } catch (e) {
        // Plus de silence (17/09/2026) : la panne est journalisee ET dite.
        console.error('[parrainage] lecture /api/referral en echec', e);
        setRefErr(true);
      }
    })();
  }, [refTick]);

  function argent(cents: number, currency: string): string {
    try {
      return new Intl.NumberFormat(intl, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  }

  async function configurerVirements() {
    if (refBusy) return;
    setRefBusy('virements');
    setRefMsg(null);
    try {
      // `retour: 'app'` : Stripe renvoie vers une page qui rouvre l'app,
      // et jamais vers le tableau de bord web dans la fenetre de l'app.
      const r = await apiPost<{ url?: string; error?: string }>('/api/referral', {
        action: 'virements',
        retour: 'app',
      });
      if (!r.url) throw new Error(r.error || rs.err);
      await WebBrowser.openAuthSessionAsync(r.url, 'veilleemailmobile://parrainage');
    } catch (e: any) {
      console.error('[parrainage] configuration des virements en echec', e);
      setRefMsg({ ok: false, text: e?.message || rs.err });
    } finally {
      setRefBusy(null);
      setRefTick((x) => x + 1);
    }
  }

  async function retirer(currency: string) {
    if (refBusy) return;
    setRefBusy('retrait');
    setRefMsg(null);
    try {
      const r = await apiPost<{ ok?: boolean; amount_cents?: number; currency?: string; error?: string }>(
        '/api/referral',
        { action: 'retrait', currency },
      );
      if (r.ok && r.amount_cents && r.currency) {
        setRefMsg({ ok: true, text: rs.sent.replace('{amount}', argent(r.amount_cents, r.currency)) });
      } else {
        setRefMsg({ ok: false, text: r.error || rs.err });
      }
    } catch (e: any) {
      console.error('[parrainage] retrait en echec', e);
      setRefMsg({ ok: false, text: e?.message || rs.err });
    } finally {
      setRefBusy(null);
      setRefTick((x) => x + 1);
    }
  }

  async function shareReferral() {
    if (!referral?.link) return;
    try {
      await Share.share({ message: referral.link });
    } catch {
      // annulé / indisponible
    }
  }

  // Saisie manuelle d'un code de parrainage (le lien ?ref ne fonctionne pas en signup 100 % mobile).
  const [refCodeInput, setRefCodeInput] = useState('');
  const [refClaim, setRefClaim] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');

  async function claimReferralCode() {
    const code = refCodeInput.trim().toUpperCase();
    if (!code || refClaim === 'busy') return;
    setRefClaim('busy');
    try {
      await apiPost('/api/referral/claim', { code });
      setRefClaim('ok');
    } catch {
      setRefClaim('err');
    }
  }

  // Suppression de compte (RGPD + App Store 5.1.1(v))
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  // Abonnement (Stripe)

  // Personnalisation
  const ps = PERSO[locale] ?? PERSO.en;
  const pl = PLAN_STR[locale] ?? PLAN_STR.en;
  const [persoLoaded, setPersoLoaded] = useState(false);
  const [persoEnabled, setPersoEnabled] = useState(true);
  const [persoLearn, setPersoLearn] = useState(false);
  // Gating plan : la perso est réservée à Premium (le serveur la rend inerte sinon).
  const [persoLocked, setPersoLocked] = useState(false);
  const [persoBusy, setPersoBusy] = useState(false);
  const [persoMsg, setPersoMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{
          personalization_enabled: boolean;
          learn_from_replies: boolean;
          premium_locked?: boolean;
        }>('/api/personalization');
        setPersoEnabled(r.personalization_enabled !== false);
        setPersoLearn(r.learn_from_replies === true);
        setPersoLocked(r.premium_locked === true);
      } catch {
        // garde les valeurs par défaut
      } finally {
        setPersoLoaded(true);
      }
    })();
  }, []);

  async function savePerso(patch: {
    personalization_enabled?: boolean;
    learn_from_replies?: boolean;
  }) {
    const prevEnabled = persoEnabled;
    const prevLearn = persoLearn;
    if (typeof patch.personalization_enabled === 'boolean') setPersoEnabled(patch.personalization_enabled);
    if (typeof patch.learn_from_replies === 'boolean') setPersoLearn(patch.learn_from_replies);
    setPersoMsg(null);
    try {
      await apiPost('/api/personalization', patch);
    } catch {
      setPersoEnabled(prevEnabled);
      setPersoLearn(prevLearn);
      setPersoMsg({ type: 'err', text: ps.err });
    }
  }

  function resetPerso() {
    Alert.alert(ps.title, ps.resetConfirm, [
      { text: ps.resetCancel, style: 'cancel' },
      {
        text: ps.resetOk,
        style: 'destructive',
        onPress: async () => {
          setPersoBusy(true);
          setPersoMsg(null);
          try {
            await apiDelete('/api/personalization');
            setPersoMsg({ type: 'ok', text: ps.done });
          } catch {
            setPersoMsg({ type: 'err', text: ps.err });
          } finally {
            setPersoBusy(false);
          }
        },
      },
    ]);
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{ hasAccounts: boolean; hour: number; days: string }>(
          '/api/digest-settings',
        );
        setHasAccounts(!!r.hasAccounts);
        setHour(typeof r.hour === 'number' ? r.hour : 7);
        setDays(
          new Set(
            (r.days || '1,2,3,4,5')
              .split(',')
              .map((d) => Number(d))
              // Meme garde que le web : on borne a 0-6, pas seulement « pas NaN ».
              .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
          ),
        );
      } catch {
        // pas de boîte / non configuré : on garde les valeurs par défaut
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleDay(v: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  async function save() {
    // Le bouton est deja desactive quand aucun jour n'est coche ; garde
    // supplementaire pour ne jamais poster une liste vide (= digest coupe).
    if (days.size === 0) {
      setMsg({ type: 'err', text: t.settings.saveErr });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const daysStr = Array.from(days).sort((a, b) => a - b).join(',');
      await apiPost('/api/digest-settings', { hour, days: daysStr });
      setMsg({ type: 'ok', text: t.settings.saved });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || t.settings.saveErr });
    } finally {
      setSaving(false);
    }
  }

  // 27/08/2026 — l'appel a /api/billing/status est RETIRE de l'app iOS.
  // Refus App Store du 27/08 (regles 3.1.1 et 3.1.3(c)) : l'app ne doit ni parler
  // d'abonnement, ni lire un etat d'abonnement, tant qu'elle ne permet pas d'acheter.
  // Le controle d'acces reste entier COTE SERVEUR. Le web garde son ecran Abonnement.

  /** Supprime le compte, puis déconnecte. L'API purge Supabase en cascade,
   *  révoque les jetons OAuth des boîtes connectées et les retire du backend. */
  async function handleDelete() {
    if (delText.trim().toUpperCase() !== CONFIRM_WORD || delBusy) return;
    setDelBusy(true);
    setDelErr(null);
    try {
      await apiPost('/api/account/delete', { confirm: CONFIRM_WORD });
      // Le compte n'existe plus : la session est morte de toute façon, mais on
      // nettoie l'état local pour repartir sur l'écran de connexion.
      try {
        await signOut();
      } catch {
        /* la session est déjà invalide côté serveur, sans conséquence */
      }
    } catch (e: any) {
      setDelErr(e?.message || t.settings.delErr);
      setDelBusy(false);
    }
  }


  const show = (k: SettingsSection) => only === k;

  return (
      <View style={styles.body}>
        {show('index') ? (
          <>
            {/* Index : on ne voit que les intitules, on entre dans une section en tapant
                dessus. Chaque rangee affiche sa valeur courante a droite, pour se lire
                sans entrer nulle part. */}
            <Text style={styles.groupTitle}>{t.tabs.feed}</Text>
            <View style={styles.list}>
              <NavRow label={t.sources.connectedTitle} onPress={() => router.push('/sources')} />
              <View style={styles.hubSep} />
              <NavRow label={t.rules.title} onPress={() => router.push('/rules')} />
            </View>

            <Text style={styles.groupTitle}>{t.settings.groupApp}</Text>
            <View style={styles.list}>
              <NavRow
                label={t.settings.language}
                value={localeNames[locale]}
                onPress={() => router.push('/settings/langue')}
              />
              <View style={styles.hubSep} />
              <NavRow
                label={t.settings.dailyReport}
                value={loading ? undefined : `${String(hour).padStart(2, '0')}h00`}
                onPress={() => router.push('/settings/rapport')}
              />
              <View style={styles.hubSep} />
              <NavRow
                label={nt.title}
                value={
                  notifLoaded
                    ? String(NOTIF_ROWS.filter((r) => notifPrefs[r.key]).length)
                    : undefined
                }
                onPress={() => router.push('/settings/notifications')}
              />
              <View style={styles.hubSep} />
              {/* 21/09/2026 — le didacticiel d'accueil est REJOUABLE. Il ne se
                  montre tout seul qu'une fois ; sans cette rangee, quelqu'un qui
                  a appuye sur « Passer » n'aurait aucun moyen d'y revenir. */}
              <NavRow
                label={t.tour.replay}
                onPress={() => router.push('/didacticiel')}
              />
            </View>

            <Text style={styles.groupTitle}>{t.settings.groupAccount}</Text>
            <View style={styles.list}>
              <NavRow label={ps.title} onPress={() => router.push('/settings/personnalisation')} />
              <View style={styles.hubSep} />
              <NavRow label={ps.viewStyle} onPress={() => router.push('/style')} />
              <View style={styles.hubSep} />
              <NavRow label={signatureTitle(locale)} onPress={() => router.push('/settings/signature')} />
              <View style={styles.hubSep} />
              <NavRow label={t.settings.account} onPress={() => router.push('/settings/compte')} />
              <View style={styles.hubSep} />
              {/* 25/09/2026 — Utilisation : où en est le crédit du jour (demande de HA). */}
              <NavRow label={utilisationTitre(locale)} onPress={() => router.push('/settings/utilisation')} />
              {referral?.code ? (
                <>
                  <View style={styles.hubSep} />
                  <NavRow
                    label={rs.title}
                    value={referral.code}
                    onPress={() => router.push('/settings/parrainage')}
                  />
                </>
              ) : null}
            </View>

            {/* 19/09/2026 — DEUX ÉCRANS D'ADMINISTRATION RETIRÉS D'ICI.
                « Diagnostic voix » vérifiait que la pile native de Vapi se
                chargeait sur un vrai iPhone ; Vapi n'existe plus. « Essai
                OpenAI » mesurait le coût à la voix et au modèle ; sa question
                est tranchée.

                ⚠️ RETIRÉS POUR LA SOUMISSION, PAS PAR MÉNAGE. Apple refuse les
                fonctions cachées dans un binaire soumis, et ces deux écrans
                l'étaient : masqués derrière une adresse mail écrite en dur.

                Ils restent dans git. Les remettre est une commande. */}

            <View style={styles.card}>
              <Text style={styles.label}>{t.settings.connectedAs}</Text>
              <Text style={styles.value}>{email}</Text>
            </View>

            <Pressable style={styles.signout} onPress={signOut}>
              <Text style={styles.signoutText}>{t.settings.signOut}</Text>
            </Pressable>
          </>
        ) : null}

        {show('compte') ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>{t.settings.connectedAs}</Text>
              <Text style={styles.value}>{email}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.subLabel}>{t.settings.delTitle}</Text>
              <Text style={styles.hint}>{t.settings.delIntro}</Text>

              {!delOpen ? (
                <Pressable style={styles.delBtn} onPress={() => setDelOpen(true)}>
                  <Text style={styles.delBtnText}>{t.settings.delBtn}</Text>
                </Pressable>
              ) : (
                <View style={styles.dangerBox}>
                  <Text style={styles.dangerText}>
                    {f(t.settings.delConfirmInstr, { word: CONFIRM_WORD })}
                  </Text>
                  <TextInput
                    style={styles.dangerInput}
                    value={delText}
                    onChangeText={setDelText}
                    placeholder={CONFIRM_WORD}
                    placeholderTextColor={D.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!delBusy}
                  />
                  {delErr ? <Text style={[styles.msg, styles.msgErr]}>{delErr}</Text> : null}
                  <View style={styles.dangerRow}>
                    <Pressable
                      style={[
                        styles.dangerBtn,
                        (delText.trim().toUpperCase() !== CONFIRM_WORD || delBusy) &&
                          styles.btnDisabled,
                      ]}
                      onPress={handleDelete}
                      disabled={delText.trim().toUpperCase() !== CONFIRM_WORD || delBusy}
                    >
                      {delBusy ? (
                        <ActivityIndicator color={colors.onDark} />
                      ) : (
                        <Text style={styles.dangerBtnText}>{t.settings.delConfirmBtn}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.manageBtn, delBusy && styles.btnDisabled]}
                      onPress={() => {
                        setDelOpen(false);
                        setDelText('');
                        setDelErr(null);
                      }}
                      disabled={delBusy}
                    >
                      <Text style={styles.manageBtnText}>{t.common.cancel}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <Pressable style={styles.signout} onPress={signOut}>
              <Text style={styles.signoutText}>{t.settings.signOut}</Text>
            </Pressable>
          </>
        ) : null}

        {show('langue') ? (
        <View style={styles.card}>
            <Text style={styles.hint}>{t.settings.languageHint}</Text>
          <View style={styles.langRow}>
            {locales.map((lng) => {
              const on = locale === lng;
              return (
                <Pressable
                  key={lng}
                  style={[styles.langChip, on && styles.langChipOn]}
                  onPress={() => {
                    if (on) return;
                    const rtlChange = isRtl(lng as Locale) !== isRtl(locale);
                    void setLocale(lng as Locale);
                    if (rtlChange) {
                      Alert.alert(localeNames[lng], t.settings.rtlRestart);
                    }
                  }}
                >
                  <Text style={[styles.langChipText, on && styles.langChipTextOn]}>
                    {localeNames[lng]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        ) : null}

        {show('notifications') ? (
          <View style={styles.card}>
            <Text style={styles.hint}>{nt.sub}</Text>
            {!notifLoaded ? (
              <ActivityIndicator color={colors.terracotta} style={{ marginVertical: spacing.md }} />
            ) : (
              <>
                {NOTIF_ROWS.map((row, i) => (
                  <View
                    key={row.key}
                    style={[styles.persoRow, i > 0 && styles.persoRowBordered]}
                  >
                    <View style={styles.notifLabelRow}>
                      <View style={[styles.notifDot, { backgroundColor: row.color }]} />
                      <Text style={styles.persoLabel}>{nt[row.key]}</Text>
                    </View>
                    <Switch
                      value={notifPrefs[row.key]}
                      onValueChange={() => toggleNotif(row.key)}
                      trackColor={{ true: colors.terracotta, false: D.line }}
                      thumbColor={colors.surface}
                    />
                  </View>
                ))}
                <Text style={[styles.hint, { marginTop: spacing.md }]}>{nt.hint}</Text>
                {notifErr ? <Text style={[styles.msg, styles.msgErr]}>{notifErr}</Text> : null}
              </>
            )}
          </View>
        ) : null}

        {show('rapport') ? (
        <View style={styles.card}>
            {loading ? (
            <ActivityIndicator color={colors.terracotta} style={{ marginVertical: spacing.md }} />
          ) : (
            <>
              {!hasAccounts ? (
                <Text style={styles.hint}>{t.settings.connectBoxHint}</Text>
              ) : null}

              <Text style={styles.subLabel}>{t.settings.hourLabel}</Text>
              <View style={styles.hourRow}>
                <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.max(0, h - 1))}>
                  <IconMinus size={20} color={D.text} />
                </Pressable>
                <Text style={styles.hourValue}>{String(hour).padStart(2, '0')}h00</Text>
                <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.min(23, h + 1))}>
                  <IconPlus size={20} color={D.text} />
                </Pressable>
              </View>

              <Text style={styles.subLabel}>{t.settings.daysLabel}</Text>
              <View style={styles.daysRow}>
                {DAY_VALUES.map((value) => {
                  const on = days.has(value);
                  return (
                    <Pressable
                      key={value}
                      style={[styles.day, on && styles.dayOn]}
                      onPress={() => toggleDay(value)}
                    >
                      <Text style={[styles.dayText, on && styles.dayTextOn]}>
                        {t.settings.daysShort[value]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.saveBtn, (saving || days.size === 0 || !hasAccounts) && styles.btnDisabled]}
                onPress={save}
                disabled={saving || days.size === 0 || !hasAccounts}
              >
                {saving ? (
                  <ActivityIndicator color={colors.onDark} />
                ) : (
                  <Text style={styles.saveBtnText}>{t.settings.saveBtn}</Text>
                )}
              </Pressable>

              {msg ? (
                <Text style={[styles.msg, msg.type === 'ok' ? styles.msgOk : styles.msgErr]}>
                  {msg.text}
                </Text>
              ) : null}
            </>
          )}
        </View>
        ) : null}


        {/* Parrainage (programme ambassadeur) */}
        {show('parrainage') && referral?.code ? (
          <View style={styles.card}>
            <Text style={styles.subLabel}>{rs.yourCode}</Text>
            <Text style={styles.refCode}>{referral.code}</Text>
            <Pressable style={[styles.saveBtn, styles.subscribeBtn]} onPress={shareReferral}>
              <Text style={styles.saveBtnText}>{rs.share}</Text>
            </Pressable>

            {/* Suivi (17/09/2026) */}
            <View style={styles.refBlock}>
              {referral.active_count > 0 ? (
                <>
                  <Text style={styles.value}>{rs.count.replace('{n}', String(referral.active_count))}</Text>
                  <Text style={styles.refDiscount}>
                    {rs.discount.replace('{pct}', String(referral.discount_pct))}
                  </Text>
                </>
              ) : (
                <Text style={styles.hint}>{rs.none}</Text>
              )}
            </View>

            {(referral.gain_pct || 0) > 0 ||
            (referral.balances || []).some((b) => b.cents > 0) ||
            (referral.payouts || []).length > 0 ? (
              <View style={styles.refBlock}>
                <Text style={styles.cardTitle}>{rs.gainsTitle}</Text>
                {(referral.gain_pct || 0) > 0 ? (
                  <Text style={styles.hint}>{rs.rate.replace('{pct}', String(referral.gain_pct))}</Text>
                ) : null}
                {referral.gains_error ? <Text style={[styles.msg, styles.msgErr]}>{rs.err}</Text> : null}

                {(referral.balances || []).filter((b) => b.cents > 0).length ? (
                  (referral.balances || [])
                    .filter((b) => b.cents > 0)
                    .map((b) => {
                      const min = referral.min_withdraw_cents ?? 2000;
                      return (
                        <View key={b.currency} style={{ gap: spacing.xs }}>
                          <Text style={styles.value}>
                            {rs.balance.replace('{amount}', argent(b.cents, b.currency))}
                          </Text>
                          {referral.payouts_setup === 'pret' && b.cents >= min ? (
                            <Pressable
                              style={[styles.saveBtn, refBusy !== null && styles.btnDisabled]}
                              onPress={() => retirer(b.currency)}
                              disabled={refBusy !== null}
                            >
                              {refBusy === 'retrait' ? (
                                <ActivityIndicator color={colors.onDark} />
                              ) : (
                                <Text style={styles.saveBtnText}>
                                  {rs.withdraw.replace('{amount}', argent(b.cents, b.currency))}
                                </Text>
                              )}
                            </Pressable>
                          ) : b.cents < min ? (
                            <Text style={styles.hint}>{rs.minHint.replace('{min}', argent(min, b.currency))}</Text>
                          ) : null}
                        </View>
                      );
                    })
                ) : (
                  <Text style={styles.hint}>{rs.noGains}</Text>
                )}

                {referral.payouts_setup === 'pret' ? (
                  <Text style={styles.hint}>{rs.setupReady}</Text>
                ) : referral.payouts_setup === 'inconnu' ? (
                  <Text style={[styles.msg, styles.msgErr]}>{rs.err}</Text>
                ) : (
                  <>
                    <Pressable
                      style={[styles.manageBtn, refBusy !== null && styles.btnDisabled]}
                      onPress={configurerVirements}
                      disabled={refBusy !== null}
                    >
                      {refBusy === 'virements' ? (
                        <ActivityIndicator color={D.text} />
                      ) : (
                        <Text style={styles.manageBtnText}>
                          {referral.payouts_setup === 'a_finir' ? rs.setupResume : rs.setup}
                        </Text>
                      )}
                    </Pressable>
                    <Text style={styles.hint}>{rs.setupHint}</Text>
                  </>
                )}

                {refMsg ? (
                  <Text style={[styles.msg, refMsg.ok ? styles.msgOk : styles.msgErr]}>{refMsg.text}</Text>
                ) : null}

                {(referral.payouts || []).length ? (
                  <View style={{ gap: 2 }}>
                    <Text style={styles.subLabel}>{rs.history}</Text>
                    {(referral.payouts || []).map((po, i) => (
                      <Text key={i} style={styles.hint}>
                        {new Date(po.created_at).toLocaleDateString(intl)} · {argent(po.amount_cents, po.currency)} ·{' '}
                        {po.status === 'envoye' ? rs.stEnvoye : po.status === 'echec' ? rs.stEchec : rs.stDemande}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Saisie d'un code reçu (pas de lien ?ref au signup mobile) */}
            <Text style={[styles.subLabel, { marginTop: spacing.md }]}>{rs.haveCode}</Text>
            {refClaim === 'ok' ? (
              <Text style={[styles.msg, styles.msgOk]}>{rs.applied}</Text>
            ) : (
              <View style={styles.refClaimRow}>
                <TextInput
                  style={styles.refInput}
                  value={refCodeInput}
                  onChangeText={(v) => {
                    setRefCodeInput(v);
                    if (refClaim === 'err') setRefClaim('idle');
                  }}
                  placeholder={rs.codePlaceholder}
                  placeholderTextColor={D.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.manageBtn, refClaim === 'busy' && styles.btnDisabled]}
                  onPress={claimReferralCode}
                  disabled={refClaim === 'busy'}
                >
                  {refClaim === 'busy' ? (
                    <ActivityIndicator color={D.text} />
                  ) : (
                    <Text style={styles.manageBtnText}>{rs.apply}</Text>
                  )}
                </Pressable>
              </View>
            )}
            {refClaim === 'err' ? (
              <Text style={[styles.msg, styles.msgErr]}>{rs.invalid}</Text>
            ) : null}
          </View>
        ) : null}

        {show('personnalisation') ? (
        <View style={styles.card}>
          <View style={styles.persoTitleRow}>
          </View>

          {/* Verrou d'option, applique COTE SERVEUR. Formulation neutre depuis le 27/08/2026. */}
          {persoLocked ? (
            <View style={styles.persoLock}>
              <Text style={styles.hint}>{pl.lockBody}</Text>
            </View>
          ) : null}

          <View style={[styles.persoRow, persoLocked && styles.persoDimmed]}>
            <View style={styles.persoTexts}>
              <Text style={styles.persoLabel}>{ps.master}</Text>
              <Text style={styles.hint}>{ps.masterHint}</Text>
            </View>
            <Switch
              value={persoEnabled}
              disabled={!persoLoaded || persoLocked}
              onValueChange={(v) => savePerso({ personalization_enabled: v })}
              trackColor={{ true: colors.terracotta, false: D.line }}
              thumbColor={colors.surface}
            />
          </View>

          <View
            style={[
              styles.persoRow,
              styles.persoRowBordered,
              (!persoEnabled || persoLocked) && styles.persoDimmed,
            ]}
          >
            <View style={styles.persoTexts}>
              <Text style={styles.persoLabel}>{ps.learn}</Text>
              <Text style={styles.hint}>{ps.learnHint}</Text>
            </View>
            <Switch
              value={persoLearn}
              disabled={!persoLoaded || !persoEnabled || persoLocked}
              onValueChange={(v) => savePerso({ learn_from_replies: v })}
              trackColor={{ true: colors.terracotta, false: D.line }}
              thumbColor={colors.surface}
            />
          </View>

          <Pressable style={styles.persoLink} onPress={() => router.push('/style')}>
            <Text style={styles.persoLinkText}>{ps.viewStyle} ›</Text>
          </Pressable>

          <Pressable
            style={[styles.persoReset, persoBusy && styles.btnDisabled]}
            onPress={resetPerso}
            disabled={persoBusy}
          >
            {persoBusy ? (
              <ActivityIndicator color={D.text} />
            ) : (
              <Text style={styles.persoResetText}>{ps.reset}</Text>
            )}
          </Pressable>

          {persoMsg ? (
            <Text style={[styles.msg, persoMsg.type === 'ok' ? styles.msgOk : styles.msgErr]}>
              {persoMsg.text}
            </Text>
          ) : null}
        </View>
        ) : null}

        {show('signature') ? (
        <SignatureSection />
        ) : null}

      </View>
  );
}

/** Rangee d'index : intitule a gauche, valeur courante a droite, chevron. */
function NavRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <Text style={styles.navLabel} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.navValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <IconChevronRight size={17} color={D.hint} />
    </Pressable>
  );
}

/** Intitule d'une section, pour le bandeau du sous-ecran. */
export function settingsSectionTitle(key: SettingsSection, locale: string): string | null {
  if (key === 'notifications') return (NOTIF[locale] ?? NOTIF.en).title;
  if (key === 'personnalisation') return (PERSO[locale] ?? PERSO.en).title;
  if (key === 'parrainage') return (REF_STR[locale] ?? REF_STR.en).title;
  return null;
}

export default SettingsPanel;

// 17/09/2026 — PISTE A DE HA : reglages PLATS sur le fond sombre, comme l'Accueil.
// Plus de cartes creme : des sections separees par un filet, textes clairs.
// Retour arriere : remettre les jetons clairs (colors.ink, colors.surface...).
const D = {
  text: colors.onDark,
  muted: colors.onDarkMuted,
  hint: 'rgba(234,225,208,0.45)',
  line: colors.charline,
  voile: 'rgba(234,225,208,0.05)',
  accent: colors.terracottaLight,
  danger: '#f0957a',
  ok: '#8fc7a3',
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.fond },
  content: { paddingBottom: spacing.xxl },

  // Bandeau charbon
  top: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 33,
    color: colors.onDark,
    letterSpacing: -0.8,
    marginTop: spacing.md + 2,
  },

  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.md },

  // Hub (liste de raccourcis)
  groupTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: D.hint,
    marginTop: spacing.md,
    marginBottom: -spacing.sm,
  },
  list: {
    borderColor: D.line,
    borderBottomWidth: 1,
  },
  hubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md + 2 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 15,
  },
  navLabel: { fontFamily: fonts.sansMedium, fontSize: 15.5, color: D.text, flex: 1 },
  navValue: { fontFamily: fonts.sans, fontSize: 14, color: D.muted, maxWidth: '50%' },
  hubSep: { height: 1, backgroundColor: D.line },
  ric: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: D.voile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rtxt: { flex: 1, minWidth: 0 },
  rlabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: D.text, letterSpacing: -0.2 },
  rsub: { fontFamily: fonts.sans, fontSize: 12, color: D.hint, marginTop: 1 },

  card: {
    borderColor: D.line,
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  label: { fontFamily: fonts.sans, fontSize: 12, color: D.muted, textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontFamily: fonts.sansSemibold, fontSize: 16, color: D.text },
  cardTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: D.accent,
    marginBottom: spacing.xs,
  },
  hint: { fontFamily: fonts.sans, color: D.hint, fontSize: 13, lineHeight: 19 },
  subLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: D.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xs },
  hourBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: D.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: D.voile,
  },
  hourBtnText: { fontFamily: fonts.sans, fontSize: 24, color: D.text, lineHeight: 26 },
  hourValue: { fontFamily: fonts.sansBold, fontSize: 26, color: D.text, minWidth: 110, textAlign: 'center' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderColor: D.line,
    borderWidth: 1,
    backgroundColor: D.voile,
  },
  langChipOn: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  langChipText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: D.muted },
  langChipTextOn: { color: colors.surface },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  day: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderColor: D.line,
    borderWidth: 1,
    backgroundColor: D.voile,
  },
  dayOn: { backgroundColor: colors.onDark, borderColor: colors.onDark },
  dayText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: D.muted },
  dayTextOn: { color: colors.charcoal },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  manageBtn: {
    borderColor: D.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnText: { fontFamily: fonts.sansSemibold, color: D.text, fontSize: 14 },
  subscribeBtn: { marginTop: 0, paddingHorizontal: spacing.lg, flexGrow: 1 },
  btnDisabled: { opacity: 0.5 },
  msg: { fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm },
  msgOk: { color: D.ok },
  msgErr: { color: D.danger },
  persoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  notifLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  notifDot: { width: 8, height: 8, borderRadius: 4 },
  persoRowBordered: {
    borderTopWidth: 1,
    borderTopColor: D.line,
    paddingTop: spacing.md,
  },
  persoDimmed: { opacity: 0.5 },
  persoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  persoLock: {
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  planChooser: { gap: spacing.sm, marginTop: spacing.sm },
  planHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  planName: { fontFamily: fonts.sansBold, fontSize: 16, color: D.text },
  refCode: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    letterSpacing: 4,
    color: D.text,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  refBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: D.line,
    gap: spacing.sm,
  },
  refDiscount: { fontFamily: fonts.sansSemibold, fontSize: 15, color: D.accent },
  refClaimRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  refInput: {
    fontFamily: fonts.sans,
    flex: 1,
    borderWidth: 1,
    borderColor: D.line,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: D.text,
    backgroundColor: D.voile,
  },
  persoTexts: { flex: 1, gap: 2 },
  persoLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: D.text },
  persoReset: {
    marginTop: spacing.md,
    borderColor: D.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  persoResetText: { fontFamily: fonts.sansSemibold, color: D.text, fontSize: 14 },
  persoLink: { marginTop: spacing.md },
  persoLinkText: { fontFamily: fonts.sansSemibold, color: D.accent, fontSize: 14 },
  delBtn: {
    marginTop: spacing.md,
    borderColor: D.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  delBtnText: { fontFamily: fonts.sansSemibold, color: D.danger, fontSize: 15 },
  dangerBox: {
    marginTop: spacing.md,
    borderColor: D.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dangerText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: D.danger },
  dangerInput: {
    fontFamily: fonts.sansSemibold,
    borderWidth: 1,
    borderColor: D.danger,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: D.text,
    backgroundColor: D.voile,
  },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dangerBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  signout: {
    marginTop: spacing.md,
    borderColor: D.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  signoutText: { fontFamily: fonts.sansSemibold, color: D.danger, fontSize: 15 },
});
