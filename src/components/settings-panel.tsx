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
  const [referral, setReferral] = useState<{
    code: string | null;
    link: string | null;
    discount_pct: number;
    active_count: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<{
          code: string | null;
          link: string | null;
          discount_pct: number;
          active_count: number;
        }>('/api/referral');
        setReferral(r);
      } catch {
        // silencieux : la carte reste masquée
      }
    })();
  }, []);

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
                    placeholderTextColor={colors.muted}
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
                      trackColor={{ true: colors.terracotta, false: colors.cardline }}
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
                  <IconMinus size={20} color={colors.ink} />
                </Pressable>
                <Text style={styles.hourValue}>{String(hour).padStart(2, '0')}h00</Text>
                <Pressable style={styles.hourBtn} onPress={() => setHour((h) => Math.min(23, h + 1))}>
                  <IconPlus size={20} color={colors.ink} />
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
                  placeholderTextColor={colors.ink2}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.manageBtn, refClaim === 'busy' && styles.btnDisabled]}
                  onPress={claimReferralCode}
                  disabled={refClaim === 'busy'}
                >
                  {refClaim === 'busy' ? (
                    <ActivityIndicator color={colors.ink} />
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
              trackColor={{ true: colors.terracotta, false: colors.cardline }}
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
              trackColor={{ true: colors.terracotta, false: colors.cardline }}
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
              <ActivityIndicator color={colors.ink} />
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
      <IconChevronRight size={17} color={colors.hint} />
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginLeft: spacing.xs,
    marginBottom: -spacing.xs,
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  hubRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md + 2 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md + 4,
    paddingVertical: 15,
  },
  navLabel: { fontFamily: fonts.sansMedium, fontSize: 15.5, color: colors.ink, flex: 1 },
  navValue: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, maxWidth: '50%' },
  hubSep: { height: 1, backgroundColor: colors.cardline, marginLeft: spacing.md + 4 },
  ric: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: colors.creamAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rtxt: { flex: 1, minWidth: 0 },
  rlabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink, letterSpacing: -0.2 },
  rsub: { fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 1 },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.ink },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.ink, marginBottom: spacing.xs },
  hint: { fontFamily: fonts.sans, color: colors.hint, fontSize: 13, lineHeight: 19 },
  subLabel: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xs },
  hourBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: colors.cardline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  hourBtnText: { fontFamily: fonts.sans, fontSize: 24, color: colors.ink, lineHeight: 26 },
  hourValue: { fontFamily: fonts.sansBold, fontSize: 26, color: colors.ink, minWidth: 110, textAlign: 'center' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderColor: colors.cardline,
    borderWidth: 1,
    backgroundColor: colors.cream,
  },
  langChipOn: { backgroundColor: colors.terracotta, borderColor: colors.terracotta },
  langChipText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.ink2 },
  langChipTextOn: { color: colors.surface },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  day: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderColor: colors.cardline,
    borderWidth: 1,
    backgroundColor: colors.cream,
  },
  dayOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.muted },
  dayTextOn: { color: colors.cream },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  manageBtn: {
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnText: { fontFamily: fonts.sansSemibold, color: colors.ink, fontSize: 14 },
  subscribeBtn: { marginTop: 0, paddingHorizontal: spacing.lg, flexGrow: 1 },
  btnDisabled: { opacity: 0.5 },
  msg: { fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm },
  msgOk: { color: colors.sage },
  msgErr: { color: colors.danger },
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
    borderTopColor: colors.cardline,
    paddingTop: spacing.md,
  },
  persoDimmed: { opacity: 0.5 },
  persoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  persoLock: {
    borderWidth: 1,
    borderColor: colors.cardline,
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
  planName: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink },
  refCode: {
    fontFamily: fonts.sansBold,
    fontSize: 24,
    letterSpacing: 4,
    color: colors.ink,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  refClaimRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  refInput: {
    fontFamily: fonts.sans,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  persoTexts: { flex: 1, gap: 2 },
  persoLabel: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.ink },
  persoReset: {
    marginTop: spacing.md,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  persoResetText: { fontFamily: fonts.sansSemibold, color: colors.ink, fontSize: 14 },
  persoLink: { marginTop: spacing.md },
  persoLinkText: { fontFamily: fonts.sansSemibold, color: colors.terracotta, fontSize: 14 },
  delBtn: {
    marginTop: spacing.md,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  delBtnText: { fontFamily: fonts.sansSemibold, color: colors.danger, fontSize: 15 },
  dangerBox: {
    marginTop: spacing.md,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dangerText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.danger },
  dangerInput: {
    fontFamily: fonts.sansSemibold,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
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
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  signoutText: { fontFamily: fonts.sansSemibold, color: colors.danger, fontSize: 15 },
});
