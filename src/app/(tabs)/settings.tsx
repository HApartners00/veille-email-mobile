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
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/auth';
import { useI18n } from '@/context/i18n';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { isRtl, locales, localeNames, type Locale } from '@/lib/i18n';
import { colors, radius, spacing } from '@/lib/theme';
import { IconMinus, IconPlus } from '@/components/icons';
import { SignatureSection } from '@/components/signature-section';

// Jours dans l'ordre Lun→Dim ; le libellé vient du dictionnaire (daysShort, indexé 0=Dim).
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

// Libellés de prix — surchageables par env. Défauts = tarifs actuels.
// « Essentiel » / « Premium » = noms de produit, invariables (8 langues).
const PRICE_ESSENTIAL = process.env.EXPO_PUBLIC_PLAN_PRICE_LABEL_ESSENTIAL || '5,99 €';
const PRICE_PREMIUM =
  process.env.EXPO_PUBLIC_PLAN_PRICE_LABEL_PREMIUM ||
  process.env.EXPO_PUBLIC_PLAN_PRICE_LABEL ||
  '9,99 €';
const PLAN_NAMES: Record<string, string> = { essential: 'Essentiel', premium: 'Premium' };

type BillingStatus = {
  status: string;
  entitled: boolean;
  source?: 'subscription' | 'trial' | null;
  plan?: 'essential' | 'premium' | null;
  hasCustomer: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  free_trial_ends_at?: string | null;
};

// Libellés « deux formules » + verrou Premium (autonomes, repli anglais).
type PlanStrings = {
  choose: string;
  essentialDesc: string;
  premiumDesc: string;
  chooseBtn: string; // {plan}
  perMonth: string; // {price}
  planLabel: string; // {plan}
  upgradeHint: string;
  trialPremiumNote: string;
  lockBadge: string;
  lockBody: string;
  lockCta: string;
};
const PLAN_STR: Record<string, PlanStrings> = {
  fr: {
    choose: 'Choisissez votre formule :',
    essentialDesc: 'Tout Vmail : tri quotidien, brouillons IA, pièces jointes, 8 langues.',
    premiumDesc:
      'Tout Essentiel + l’outil parle comme vous : brouillons dans votre ton, apprentissage de vos réponses, écran « Votre style ».',
    chooseBtn: 'Choisir {plan}',
    perMonth: '{price}/mois',
    planLabel: 'Votre formule : {plan}',
    upgradeHint:
      'La personnalisation du style est réservée à Premium — changez de formule depuis le portail de facturation.',
    trialPremiumNote:
      'Votre essai gratuit donne accès à tout, personnalisation du style incluse (formule Premium).',
    lockBadge: 'Premium',
    lockBody:
      'La personnalisation du style — l’outil parle comme vous — est incluse dans la formule Premium.',
    lockCta: 'Passer à Premium',
  },
  en: {
    choose: 'Choose your plan:',
    essentialDesc: 'All of Vmail: daily sorting, AI drafts, attachments, 8 languages.',
    premiumDesc:
      'Everything in Essentiel + the tool writes like you: drafts in your tone, learning from your replies, “Your style” screen.',
    chooseBtn: 'Choose {plan}',
    perMonth: '{price}/month',
    planLabel: 'Your plan: {plan}',
    upgradeHint:
      'Style personalization is Premium-only — switch plans from the billing portal.',
    trialPremiumNote:
      'Your free trial gives access to everything, style personalization included (Premium plan).',
    lockBadge: 'Premium',
    lockBody: 'Style personalization — the tool writes like you — is included in the Premium plan.',
    lockCta: 'Upgrade to Premium',
  },
  es: {
    choose: 'Elige tu plan:',
    essentialDesc: 'Todo Vmail: clasificación diaria, borradores IA, adjuntos, 8 idiomas.',
    premiumDesc:
      'Todo Essentiel + la herramienta escribe como tú: borradores con tu tono, aprendizaje de tus respuestas, pantalla «Tu estilo».',
    chooseBtn: 'Elegir {plan}',
    perMonth: '{price}/mes',
    planLabel: 'Tu plan: {plan}',
    upgradeHint:
      'La personalización del estilo es exclusiva de Premium — cambia de plan desde el portal de facturación.',
    trialPremiumNote:
      'Tu prueba gratuita da acceso a todo, personalización del estilo incluida (plan Premium).',
    lockBadge: 'Premium',
    lockBody:
      'La personalización del estilo — la herramienta escribe como tú — está incluida en el plan Premium.',
    lockCta: 'Pasar a Premium',
  },
  de: {
    choose: 'Wähle deinen Tarif:',
    essentialDesc: 'Das ganze Vmail: tägliche Sortierung, KI-Entwürfe, Anhänge, 8 Sprachen.',
    premiumDesc:
      'Alles aus Essentiel + das Tool schreibt wie du: Entwürfe in deinem Ton, Lernen aus deinen Antworten, Bildschirm „Dein Stil“.',
    chooseBtn: '{plan} wählen',
    perMonth: '{price}/Monat',
    planLabel: 'Dein Tarif: {plan}',
    upgradeHint:
      'Die Stil-Personalisierung gibt es nur in Premium — wechsle den Tarif im Abrechnungsportal.',
    trialPremiumNote:
      'Deine kostenlose Testphase umfasst alles, inklusive Stil-Personalisierung (Premium-Tarif).',
    lockBadge: 'Premium',
    lockBody:
      'Die Stil-Personalisierung — das Tool schreibt wie du — ist im Premium-Tarif enthalten.',
    lockCta: 'Auf Premium upgraden',
  },
  pt: {
    choose: 'Escolhe o teu plano:',
    essentialDesc: 'Todo o Vmail: triagem diária, rascunhos IA, anexos, 8 línguas.',
    premiumDesc:
      'Tudo do Essentiel + a ferramenta escreve como tu: rascunhos no teu tom, aprendizagem das tuas respostas, ecrã «O teu estilo».',
    chooseBtn: 'Escolher {plan}',
    perMonth: '{price}/mês',
    planLabel: 'O teu plano: {plan}',
    upgradeHint:
      'A personalização do estilo é exclusiva do Premium — muda de plano no portal de faturação.',
    trialPremiumNote:
      'O teu teste gratuito dá acesso a tudo, personalização do estilo incluída (plano Premium).',
    lockBadge: 'Premium',
    lockBody:
      'A personalização do estilo — a ferramenta escreve como você — está incluída no plano Premium.',
    lockCta: 'Passar a Premium',
  },
  it: {
    choose: 'Scegli il tuo piano:',
    essentialDesc: 'Tutto Vmail: classificazione quotidiana, bozze IA, allegati, 8 lingue.',
    premiumDesc:
      'Tutto Essentiel + lo strumento scrive come te: bozze nel tuo tono, apprendimento dalle tue risposte, schermata «Il tuo stile».',
    chooseBtn: 'Scegli {plan}',
    perMonth: '{price}/mese',
    planLabel: 'Il tuo piano: {plan}',
    upgradeHint:
      'La personalizzazione dello stile è riservata a Premium — cambia piano dal portale di fatturazione.',
    trialPremiumNote:
      'La tua prova gratuita dà accesso a tutto, personalizzazione dello stile inclusa (piano Premium).',
    lockBadge: 'Premium',
    lockBody:
      'La personalizzazione dello stile — lo strumento scrive come te — è inclusa nel piano Premium.',
    lockCta: 'Passa a Premium',
  },
  ar: {
    choose: 'اختر باقتك:',
    essentialDesc: 'كل Vmail: الفرز اليومي، مسودات الذكاء الاصطناعي، المرفقات، 8 لغات.',
    premiumDesc:
      'كل ما في Essentiel + الأداة تكتب بأسلوبك: مسودات بنبرتك، تعلّم من ردودك، شاشة «أسلوبك».',
    chooseBtn: 'اختيار {plan}',
    perMonth: '{price}/شهر',
    planLabel: 'باقتك: {plan}',
    upgradeHint: 'تخصيص الأسلوب حصري لباقة Premium — غيّر الباقة من بوابة الفوترة.',
    trialPremiumNote:
      'تجربتك المجانية تمنحك الوصول إلى كل شيء، بما في ذلك تخصيص الأسلوب (باقة Premium).',
    lockBadge: 'Premium',
    lockBody: 'تخصيص الأسلوب — الأداة تكتب بأسلوبك — مُضمَّن في باقة Premium.',
    lockCta: 'الترقية إلى Premium',
  },
  ru: {
    choose: 'Выберите тариф:',
    essentialDesc: 'Весь Vmail: ежедневная сортировка, черновики с ИИ, вложения, 8 языков.',
    premiumDesc:
      'Всё из Essentiel + инструмент пишет как вы: черновики в вашем тоне, обучение на ваших ответах, экран «Ваш стиль».',
    chooseBtn: 'Выбрать {plan}',
    perMonth: '{price}/мес',
    planLabel: 'Ваш тариф: {plan}',
    upgradeHint:
      'Персонализация стиля доступна только в Premium — смените тариф в портале оплаты.',
    trialPremiumNote:
      'Бесплатный пробный период открывает доступ ко всему, включая персонализацию стиля (тариф Premium).',
    lockBadge: 'Premium',
    lockBody: 'Персонализация стиля — инструмент пишет как вы — входит в тариф Premium.',
    lockCta: 'Перейти на Premium',
  },
};

function formatDate(value: string | null, intl: string): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

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
  intro: string;
  yourCode: string;
  share: string;
  activeCount: string; // {n}
  discount: string; // {pct}
  none: string;
};
const REF_STR: Record<string, RefStrings> = {
  fr: {
    title: 'Parrainage',
    intro:
      'Chaque filleul abonné vous rapporte une remise permanente : -10 % (Essentiel) ou -20 % (Premium), cumulable jusqu’à -100 %, tant qu’il reste abonné.',
    yourCode: 'Votre code',
    share: 'Partager mon lien',
    activeCount: 'Filleuls abonnés : {n}',
    discount: 'Votre remise actuelle : -{pct} %',
    none: 'Aucun filleul pour le moment — partagez votre lien !',
  },
  en: {
    title: 'Referral program',
    intro:
      'Every subscribed referral earns you a standing discount: -10% (Essentiel) or -20% (Premium), stacking up to -100%, for as long as they stay subscribed.',
    yourCode: 'Your code',
    share: 'Share my link',
    activeCount: 'Subscribed referrals: {n}',
    discount: 'Your current discount: -{pct}%',
    none: 'No referrals yet — share your link!',
  },
  es: {
    title: 'Programa de recomendación',
    intro:
      'Cada recomendado suscrito te da un descuento permanente: -10% (Essentiel) o -20% (Premium), acumulable hasta -100%, mientras siga suscrito.',
    yourCode: 'Tu código',
    share: 'Compartir mi enlace',
    activeCount: 'Recomendados suscritos: {n}',
    discount: 'Tu descuento actual: -{pct}%',
    none: 'Aún no hay recomendados — ¡comparte tu enlace!',
  },
  de: {
    title: 'Empfehlungsprogramm',
    intro:
      'Jede abonnierte Empfehlung bringt dir einen dauerhaften Rabatt: -10 % (Essentiel) oder -20 % (Premium), kumulierbar bis -100 %, solange sie abonniert bleibt.',
    yourCode: 'Dein Code',
    share: 'Meinen Link teilen',
    activeCount: 'Abonnierte Empfehlungen: {n}',
    discount: 'Dein aktueller Rabatt: -{pct} %',
    none: 'Noch keine Empfehlungen — teile deinen Link!',
  },
  pt: {
    title: 'Programa de indicação',
    intro:
      'Cada indicado subscrito dá-te um desconto permanente: -10% (Essentiel) ou -20% (Premium), acumulável até -100%, enquanto continuar subscrito.',
    yourCode: 'O teu código',
    share: 'Partilhar a minha ligação',
    activeCount: 'Indicados subscritos: {n}',
    discount: 'O teu desconto atual: -{pct}%',
    none: 'Ainda sem indicados — partilha a tua ligação!',
  },
  it: {
    title: 'Programma di referral',
    intro:
      'Ogni invitato abbonato ti dà uno sconto permanente: -10% (Essentiel) o -20% (Premium), cumulabile fino a -100%, finché resta abbonato.',
    yourCode: 'Il tuo codice',
    share: 'Condividi il mio link',
    activeCount: 'Invitati abbonati: {n}',
    discount: 'Il tuo sconto attuale: -{pct}%',
    none: 'Ancora nessun invitato — condividi il tuo link!',
  },
  ar: {
    title: 'برنامج الإحالة',
    intro:
      'كل مُحال مشترك يمنحك خصمًا دائمًا: ‎-10%‎ (Essentiel) أو ‎-20%‎ (Premium)، قابلًا للتراكم حتى ‎-100%‎، ما دام مشتركًا.',
    yourCode: 'رمزك',
    share: 'مشاركة رابطي',
    activeCount: 'المُحالون المشتركون: {n}',
    discount: 'خصمك الحالي: -{pct}%',
    none: 'لا مُحالين بعد — شارك رابطك!',
  },
  ru: {
    title: 'Реферальная программа',
    intro:
      'Каждый подписавшийся приглашённый даёт вам постоянную скидку: -10% (Essentiel) или -20% (Premium), суммируется до -100%, пока он остаётся подписанным.',
    yourCode: 'Ваш код',
    share: 'Поделиться ссылкой',
    activeCount: 'Подписавшиеся приглашённые: {n}',
    discount: 'Ваша текущая скидка: -{pct}%',
    none: 'Пока нет приглашённых — поделитесь ссылкой!',
  },
};

export default function Settings() {
  const { session, signOut } = useAuth();
  const { t, f, intl, locale, setLocale } = useI18n();
  const router = useRouter();
  const email = session?.user?.email ?? '—';

  const [loading, setLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hour, setHour] = useState(7);
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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

  // Abonnement (Stripe)
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingUi, setBillingUi] = useState<'loading' | 'ready' | 'redirecting' | 'error'>('loading');
  const [billingMsg, setBillingMsg] = useState<string | null>(null);

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
              .filter((n) => !Number.isNaN(n)),
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

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<BillingStatus>('/api/billing/status');
        setBilling(r);
        setBillingUi('ready');
      } catch (e: any) {
        setBillingUi('error');
        setBillingMsg(e?.message || t.settings.readImpossible);
      }
    })();
  }, []);

  async function goBilling(
    endpoint: '/api/billing/checkout' | '/api/billing/portal',
    plan?: 'essential' | 'premium',
  ) {
    setBillingUi('redirecting');
    setBillingMsg(null);
    try {
      const r = await apiPost<{ url?: string }>(endpoint, plan ? { plan } : {});
      if (r?.url) {
        await WebBrowser.openBrowserAsync(r.url);
        setBillingUi('ready');
      } else {
        setBillingUi('error');
        setBillingMsg(t.settings.actionImpossible);
      }
    } catch (e: any) {
      setBillingUi('error');
      setBillingMsg(e?.message || t.settings.actionImpossible);
    }
  }

  function billingStatusText(): string {
    const s = billing?.status || 'none';
    if (s === 'trialing')
      return billing?.trial_end
        ? f(t.settings.trialOngoing, { date: formatDate(billing.trial_end, intl) })
        : t.settings.trialOngoingNoDate;
    if (s === 'active')
      return billing?.cancel_at_period_end
        ? f(t.settings.activeCancel, { date: formatDate(billing?.current_period_end || null, intl) })
        : f(t.settings.activeRenew, { date: formatDate(billing?.current_period_end || null, intl) });
    if (s === 'past_due' || s === 'unpaid') return t.settings.pastDue;
    if (s === 'canceled') return t.settings.canceled;
    // Essai gratuit SANS carte en cours (pas d'abonnement Stripe).
    if (billing?.source === 'trial' && billing?.free_trial_ends_at) {
      return f(t.settings.trialOngoing, { date: formatDate(billing.free_trial_ends_at, intl) });
    }
    return t.settings.noneNoPrice;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>{t.settings.connectedAs}</Text>
        <Text style={styles.value}>{email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.settings.language}</Text>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.settings.dailyReport}</Text>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.settings.subscription}</Text>
        <Text style={styles.hint}>{t.settings.subHint}</Text>
        {billingUi === 'loading' ? (
          <ActivityIndicator color={colors.terracotta} style={{ marginVertical: spacing.md }} />
        ) : (
          <>
            <Text style={styles.billingStatus}>{billingStatusText()}</Text>

            {/* Essai sans carte = accès Premium complet (note). */}
            {billing?.source === 'trial' ? (
              <Text style={styles.hint}>{pl.trialPremiumNote}</Text>
            ) : null}

            {/* Formule courante + upsell Essentiel → Premium. */}
            {billing?.source === 'subscription' && billing?.plan ? (
              <>
                <Text style={styles.billingStatus}>
                  {f(pl.planLabel, { plan: PLAN_NAMES[billing.plan] || billing.plan })}
                </Text>
                {billing.plan === 'essential' ? (
                  <Text style={styles.hint}>{pl.upgradeHint}</Text>
                ) : null}
              </>
            ) : null}

            {/* Choix de la formule quand il n'y a pas d'accès. */}
            {!billing?.entitled ? (
              <View style={styles.planChooser}>
                <Text style={styles.subLabel}>{pl.choose}</Text>
                {(
                  [
                    { id: 'essential', price: PRICE_ESSENTIAL, desc: pl.essentialDesc },
                    { id: 'premium', price: PRICE_PREMIUM, desc: pl.premiumDesc },
                  ] as const
                ).map((p) => (
                  <View key={p.id} style={styles.planCard}>
                    <View style={styles.planHead}>
                      <Text style={styles.planName}>{PLAN_NAMES[p.id]}</Text>
                      <Text style={styles.planPrice}>{f(pl.perMonth, { price: p.price })}</Text>
                    </View>
                    <Text style={styles.hint}>{p.desc}</Text>
                    <Pressable
                      style={[
                        styles.saveBtn,
                        p.id === 'premium' ? styles.subscribeBtn : styles.planBtnAlt,
                        billingUi === 'redirecting' && styles.btnDisabled,
                      ]}
                      onPress={() => goBilling('/api/billing/checkout', p.id)}
                      disabled={billingUi === 'redirecting'}
                    >
                      <Text style={p.id === 'premium' ? styles.saveBtnText : styles.planBtnAltText}>
                        {billingUi === 'redirecting'
                          ? t.settings.redirecting
                          : f(pl.chooseBtn, { plan: PLAN_NAMES[p.id] })}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.billingBtns}>
              {billing?.hasCustomer ? (
                <Pressable
                  style={[styles.manageBtn, billingUi === 'redirecting' && styles.btnDisabled]}
                  onPress={() => goBilling('/api/billing/portal')}
                  disabled={billingUi === 'redirecting'}
                >
                  <Text style={styles.manageBtnText}>
                    {billingUi === 'redirecting' ? t.settings.opening : t.settings.manage}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {billingMsg ? (
              <Text style={[styles.msg, billingUi === 'error' ? styles.msgErr : styles.msgOk]}>
                {billingMsg}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* Parrainage (programme ambassadeur) */}
      {referral?.code ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{rs.title}</Text>
          <Text style={styles.hint}>{rs.intro}</Text>
          <Text style={styles.subLabel}>{rs.yourCode}</Text>
          <Text style={styles.refCode}>{referral.code}</Text>
          {referral.active_count > 0 ? (
            <>
              <Text style={styles.billingStatus}>
                {f(rs.activeCount, { n: String(referral.active_count) })}
              </Text>
              <Text style={styles.refDiscount}>
                {f(rs.discount, { pct: String(referral.discount_pct) })}
              </Text>
            </>
          ) : (
            <Text style={styles.billingStatus}>{rs.none}</Text>
          )}
          <Pressable style={[styles.saveBtn, styles.subscribeBtn]} onPress={shareReferral}>
            <Text style={styles.saveBtnText}>{rs.share}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.persoTitleRow}>
          <Text style={styles.cardTitle}>{ps.title}</Text>
          {persoLocked ? (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{pl.lockBadge}</Text>
            </View>
          ) : null}
        </View>

        {/* Verrou plan : la perso est réservée à Premium (inerte côté serveur sinon). */}
        {persoLocked ? (
          <View style={styles.persoLock}>
            <Text style={styles.hint}>{pl.lockBody}</Text>
            <Pressable
              style={[styles.saveBtn, styles.subscribeBtn, billingUi === 'redirecting' && styles.btnDisabled]}
              onPress={() =>
                billing?.hasCustomer
                  ? goBilling('/api/billing/portal')
                  : goBilling('/api/billing/checkout', 'premium')
              }
              disabled={billingUi === 'redirecting'}
            >
              <Text style={styles.saveBtnText}>{pl.lockCta}</Text>
            </Pressable>
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

      <SignatureSection />

      <Pressable style={styles.signout} onPress={signOut}>
        <Text style={styles.signoutText}>{t.settings.signOut}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: { fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  hint: { color: colors.hint, fontSize: 13, lineHeight: 19 },
  subLabel: {
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
  hourBtnText: { fontSize: 24, color: colors.ink, lineHeight: 26 },
  hourValue: { fontSize: 26, fontWeight: '700', color: colors.ink, minWidth: 110, textAlign: 'center' },
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
  langChipText: { fontSize: 13, fontWeight: '600', color: colors.ink2 },
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
  dayText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  dayTextOn: { color: colors.cream },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },
  billingStatus: { fontSize: 14, color: colors.ink2, lineHeight: 20, marginTop: spacing.xs },
  billingBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  manageBtn: {
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageBtnText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  subscribeBtn: { marginTop: 0, paddingHorizontal: spacing.lg, flexGrow: 1 },
  btnDisabled: { opacity: 0.5 },
  msg: { fontSize: 13, marginTop: spacing.sm },
  msgOk: { color: colors.sage },
  msgErr: { color: colors.danger },
  persoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  persoRowBordered: {
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
    paddingTop: spacing.md,
  },
  persoDimmed: { opacity: 0.5 },
  persoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  premiumBadge: {
    borderWidth: 1,
    borderColor: colors.terracotta,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  premiumBadgeText: {
    color: colors.terracotta,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  persoLock: {
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  planChooser: { gap: spacing.sm, marginTop: spacing.sm },
  planCard: {
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: 10,
    padding: spacing.md,
    gap: spacing.xs,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  planName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  planPrice: { fontSize: 14, color: colors.ink2 },
  planBtnAlt: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.cardline,
  },
  planBtnAltText: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  refCode: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.ink,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  refDiscount: { fontSize: 14, color: colors.terracotta, fontWeight: '600', marginTop: 2 },
  persoTexts: { flex: 1, gap: 2 },
  persoLabel: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  persoReset: {
    marginTop: spacing.md,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  persoResetText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
  persoLink: { marginTop: spacing.md },
  persoLinkText: { color: colors.terracotta, fontWeight: '600', fontSize: 14 },
  signout: {
    marginTop: spacing.md,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
  },
  signoutText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
});
