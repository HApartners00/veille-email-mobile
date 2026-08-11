import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { apiDelete, apiDownloadToFile, apiGet, apiPost, apiUpload } from '@/lib/api';
import {
  effectivePriority,
  PRIORITIES,
  PRIORITY_KEYS,
  domainOf,
  extractEmail,
  type Rule,
} from '@/lib/priority';
import { prioLabel } from '@/lib/i18n';
import { MailActions } from '@/components/mail-actions';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import {
  IconChevronLeft,
  IconClose,
  IconPlus,
  IconReplySuggested,
  IconSparkle,
} from '@/components/icons';

type Item = {
  id: string;
  title: string;
  author: string | null;
  preview: string | null;
  body?: string | null;
  content?: string | null;
  url: string | null;
  status: string;
  tags: string[];
  received_at: string;
};

function decodeEntities(t: string): string {
  return t
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

/** Convertit un corps HTML (même échappé) en texte lisible. Décode d'abord, PUIS retire les balises. */
function htmlToText(input: string): string {
  if (!input) return '';
  let t = decodeEntities(String(input)); // décoder d'abord (cas HTML échappé &lt;div&gt;)
  t = t.replace(/<!--[\s\S]*?-->/g, ''); // commentaires (MSO, etc.)
  t = t.replace(/<head[\s\S]*?<\/head>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  // Conserver les liens : <a href="URL">texte</a> → « texte (URL) » (avant de
  // supprimer les balises, sinon les URLs sont perdues et rien n'est cliquable).
  t = t.replace(
    /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, h1: string, h2: string, inner: string) => {
      const href = (h1 || h2 || '').trim();
      const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!href || href.startsWith('mailto:') || !/^https?:\/\//i.test(href)) return label;
      // ⚠️ Un lien SANS texte visible est une image ou un pixel de traçage : son
      // URL n'apporte rien à la lecture, et sur un mail marketing elle arrive en
      // TÊTE du corps sur six lignes. Constaté par HA le 11/08 sur le mail
      // Revolut. Un lien dont le texte EST l'URL, lui, reste affiché.
      if (!label) return ' ';
      if (label === href) return href;
      return `${label} (${href})`;
    },
  );
  t = t.replace(/<\/(p|div|tr|h[1-6]|li|ul|ol|table)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t); // 2e passe (double encodage éventuel)
  // ⚠️ Les lignes « vides » d'un mail en tables contiennent UNE espace. Ni
  // `[ \t]{2,}` (qui exige 2 espaces) ni `\n{3,}` (qui ne voit pas « \n \n \n »)
  // ne les attrapaient. Mesure du 11/08 sur une reproduction du mail Revolut :
  // 122 lignes vides sur 127, le vrai texte repoussé à la ligne 125, donc hors
  // du cadre replié — c'est le grand vide qu'a vu HA. On nettoie autour des
  // retours AVANT de les regrouper. Vérifié sans perte sur un vrai mail HTML
  // (le digest Vmail) : 103 lignes -> 53, texte utile strictement identique.
  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Texte avec URLs cliquables (le corps de l'email peut contenir des liens).
const URL_RE = /(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/g;
function LinkifiedText({ text, style }: { text: string; style?: any }) {
  const parts = String(text).split(URL_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Text
            key={i}
            style={{ color: colors.terracotta, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(part).catch(() => {})}
          >
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}

// Libellé de la section « Message » (corps de l'email) — dict local 8 langues.
const BODY_STR: Record<string, string> = {
  fr: 'Message',
  en: 'Message',
  es: 'Mensaje',
  de: 'Nachricht',
  pt: 'Mensagem',
  it: 'Messaggio',
  ar: 'الرسالة',
  ru: 'Сообщение',
};

// Encadré déroulant du corps du mail — 11/08/2026. Dictionnaire autonome, même
// patron que BODY_STR : on ne touche pas au gros dictionnaire pour 4 chaînes.
const LIRE_STR: Record<
  string,
  { chargement: string; tout: string; replier: string; abrege: string }
> = {
  fr: { chargement: 'Chargement du message…', tout: 'Afficher tout', replier: 'Replier', abrege: 'Version abrégée — le message complet n’a pas pu être récupéré.' },
  en: { chargement: 'Loading the message…', tout: 'Show all', replier: 'Collapse', abrege: 'Shortened version — the full message could not be retrieved.' },
  es: { chargement: 'Cargando el mensaje…', tout: 'Mostrar todo', replier: 'Contraer', abrege: 'Versión abreviada: no se ha podido recuperar el mensaje completo.' },
  de: { chargement: 'Nachricht wird geladen…', tout: 'Alles anzeigen', replier: 'Einklappen', abrege: 'Gekürzte Fassung – die vollständige Nachricht konnte nicht geladen werden.' },
  pt: { chargement: 'A carregar a mensagem…', tout: 'Mostrar tudo', replier: 'Recolher', abrege: 'Versão abreviada — não foi possível obter a mensagem completa.' },
  it: { chargement: 'Caricamento del messaggio…', tout: 'Mostra tutto', replier: 'Comprimi', abrege: 'Versione abbreviata — non è stato possibile recuperare il messaggio completo.' },
  ar: { chargement: 'جارٍ تحميل الرسالة…', tout: 'عرض الكل', replier: 'طيّ', abrege: 'نسخة مختصرة — تعذّر استرجاع الرسالة كاملة.' },
  ru: { chargement: 'Загрузка сообщения…', tout: 'Показать полностью', replier: 'Свернуть', abrege: 'Сокращённая версия — не удалось получить письмо целиком.' },
};

// Libellés de personnalisation (autonomes, repli anglais) — évite de modifier le gros dictionnaire.
const PERSO_STR: Record<string, { adapted: string; notice: string }> = {
  fr: {
    adapted: 'Adapté à votre style',
    notice: 'L’outil s’adapte à votre façon d’écrire — réglable dans Réglages.',
  },
  en: {
    adapted: 'Tailored to your style',
    notice: 'The tool adapts to how you write — adjustable in Settings.',
  },
  es: {
    adapted: 'Adaptado a tu estilo',
    notice: 'La herramienta se adapta a tu forma de escribir — ajustable en Ajustes.',
  },
  de: {
    adapted: 'An deinen Stil angepasst',
    notice: 'Das Tool passt sich deinem Schreibstil an — in den Einstellungen anpassbar.',
  },
  pt: {
    adapted: 'Adaptado ao seu estilo',
    notice: 'A ferramenta adapta-se à sua forma de escrever — ajustável nas Definições.',
  },
  it: {
    adapted: 'Adattato al tuo stile',
    notice: 'Lo strumento si adatta al tuo modo di scrivere — regolabile nelle Impostazioni.',
  },
  ar: {
    adapted: 'مُكيَّف حسب أسلوبك',
    notice: 'تتكيّف الأداة مع طريقتك في الكتابة — يمكن ضبطها في الإعدادات.',
  },
  ru: {
    adapted: 'Адаптировано под ваш стиль',
    notice: 'Инструмент подстраивается под вашу манеру письма — настраивается в Настройках.',
  },
};

// i18n locale pour les pièces jointes (clés non ajoutées au dictionnaire global).
const ATT_STR: Record<
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
    tooBig: 'Файл слишком большой — максимум 4 МБ.',
    badType: 'Тип файла не поддерживается.',
    tooMany: 'Не более 10 вложений.',
    failed: 'Вложение отклонено.',
    network: 'Ошибка сети.',
    tooBig: 'الملف كبير جدًا — 4 ميغابايت كحد أقصى.',
    badType: 'نوع الملف غير مدعوم.',
    tooMany: '10 مرفقات كحد أقصى.',
    failed: 'تم رفض المرفق.',
    network: 'خطأ في الشبكة.',
    tooBig: 'File troppo pesante — massimo 4 MB.',
    badType: 'Tipo di file non supportato.',
    tooMany: 'Massimo 10 allegati.',
    failed: 'Allegato rifiutato.',
    network: 'Errore di rete.',
    tooBig: 'Ficheiro demasiado pesado — máximo 4 MB.',
    badType: 'Tipo de ficheiro não suportado.',
    tooMany: 'Máximo de 10 anexos.',
    failed: 'Anexo recusado.',
    network: 'Erro de rede.',
    tooBig: 'Datei zu groß – maximal 4 MB.',
    badType: 'Dateityp nicht unterstützt.',
    tooMany: 'Maximal 10 Anhänge.',
    failed: 'Anhang abgelehnt.',
    network: 'Netzwerkfehler.',
    tooBig: 'Archivo demasiado pesado: 4 MB como máximo.',
    badType: 'Tipo de archivo no admitido.',
    tooMany: 'Máximo 10 archivos adjuntos.',
    failed: 'Archivo adjunto rechazado.',
    network: 'Error de red.',
    tooBig: 'File too large — 4 MB maximum.',
    badType: 'File type not supported.',
    tooMany: 'Maximum 10 attachments.',
    failed: 'Attachment rejected.',
    network: 'Network error.',
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
  },
};

// PJ reçues (téléchargement / partage).
const RECV_STR: Record<string, { download: string; share: string; failed: string }> = {
  fr: { download: 'Télécharger', share: 'Partager / Enregistrer', failed: 'Téléchargement impossible.' },
  en: { download: 'Download', share: 'Share / Save', failed: 'Download failed.' },
  es: { download: 'Descargar', share: 'Compartir / Guardar', failed: 'Descarga fallida.' },
  de: { download: 'Herunterladen', share: 'Teilen / Speichern', failed: 'Download fehlgeschlagen.' },
  pt: { download: 'Baixar', share: 'Partilhar / Guardar', failed: 'Falha no download.' },
  it: { download: 'Scarica', share: 'Condividi / Salva', failed: 'Download non riuscito.' },
  ar: { download: 'تنزيل', share: 'مشاركة / حفظ', failed: 'فشل التنزيل.' },
  ru: { download: 'Скачать', share: 'Поделиться / Сохранить', failed: 'Не удалось скачать.' },
};

export default function EmailDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, f, intl, locale } = useI18n();

  // Reformulations rapides du brouillon (identiques au web).
  const QUICK_REFINEMENTS: { label: string; instruction: string }[] = [
    { label: t.email.refMoreProfessional, instruction: t.email.instrMoreProfessional },
    { label: t.email.refShorter, instruction: t.email.instrShorter },
    { label: t.email.refWarmer, instruction: t.email.instrWarmer },
    { label: t.email.refMoreDirect, instruction: t.email.instrMoreDirect },
  ];

  // Clé d'idempotence stable pour cet écran : générée une fois par ouverture du
  // brouillon (par email), réutilisée sur les retries d'envoi / mise en boîte pour
  // éviter les doublons côté serveur.
  const idempotencyKey = useMemo(
    () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${String(id)}`,
    [id],
  );

  const [item, setItem] = useState<Item | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // Résumé IA (généré à la demande, comme le digest)
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Résumé de la conversation (fil) — à la demande.
  const [threadSummary, setThreadSummary] = useState('');
  const [tsLoading, setTsLoading] = useState(false);
  // Chantier F — le bouton « Résumer la conversation » ne s'affiche QUE s'il y a
  // vraiment un fil (arbitrage HA du 11/08). null = on ne sait pas encore, donc
  // on ne rend rien : pas de bouton qui apparaît puis s'efface.
  const [estFil, setEstFil] = useState<boolean | null>(null);
  const [tsMessages, setTsMessages] = useState(1);
  const [tsPartiel, setTsPartiel] = useState(false);
  // Chantier C — le corps COMPLET du mail. Mesure du 11/08 : items.content ne
  // contient que l'aperçu (1072 items sur 1139 à ~200 caractères). On va chercher
  // le vrai corps chez le fournisseur via /api/message-body.
  const [corpsServeur, setCorpsServeur] = useState<string | null>(null);
  const [corpsAbrege, setCorpsAbrege] = useState(true);
  const [corpsCharge, setCorpsCharge] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const [hauteurCorps, setHauteurCorps] = useState(0);
  const { height: hauteurEcran } = useWindowDimensions();

  // Brouillon
  const [draft, setDraft] = useState('');
  const [generatedDraft, setGeneratedDraft] = useState(''); // texte brut généré (pour le signal d'édition)
  const [instructions, setInstructions] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Personnalisation
  const [personalized, setPersonalized] = useState(false);
  const [notice, setNotice] = useState(false);
  const persoStr = PERSO_STR[locale] ?? PERSO_STR.en;
  const attStr = ATT_STR[locale] ?? ATT_STR.en;

  // Pièces jointes du brouillon de réponse
  const [atts, setAtts] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attError, setAttError] = useState<string | null>(null);
  const [attMenu, setAttMenu] = useState(false);

  // Pièces jointes REÇUES de l'email (téléchargeables)
  const recvStr = RECV_STR[locale] ?? RECV_STR.en;
  type RecvAtt = { id: string; filename: string; mime_type: string | null; size_bytes: number | null; attachment_id: string | null };
  const [recvAtts, setRecvAtts] = useState<RecvAtt[]>([]);
  const [dlRecvId, setDlRecvId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);

  // Envoi direct (avec confirmation)
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Reclassement (changer la catégorie / créer une règle)
  const [pendingCat, setPendingCat] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [reBusy, setReBusy] = useState(false);
  const [reNote, setReNote] = useState<string | null>(null);
  const [reError, setReError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [itemRes, rulesRes] = await Promise.all([
          supabase.from('items').select('*').eq('id', id).single(),
          supabase.from('classification_rules').select('match_type, match_value, category'),
        ]);
        if (itemRes.data) setItem(itemRes.data as Item);
        setRules((rulesRes.data ?? []) as Rule[]);
        if (itemRes.data && (itemRes.data as Item).status === 'unread') {
          await supabase
            .from('items')
            .update({ status: 'read', read_at: new Date().toISOString() })
            .eq('id', id);
        }
      } catch {
        // Ex. hors-ligne : on évite de bloquer l'écran sur le spinner.
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      setSummaryLoading(true);
      try {
        const r = await apiPost<{ summary: string }>('/api/summary', { id, locale });
        setSummary(r.summary);
      } catch {
        setSummary('');
      } finally {
        setSummaryLoading(false);
      }
    })();
  }, [id, locale]);

  async function generate(adjust: boolean, explicitInstruction?: string) {
    const instr = explicitInstruction ?? instructions;
    setGenLoading(true);
    setMsg(null);
    try {
      const res = await apiPost<{ draft: string; personalized?: boolean; showNotice?: boolean }>(
        '/api/draft',
        {
          id,
          locale,
          instructions: adjust ? instr : undefined,
          previousDraft: adjust ? draft : undefined,
        },
      );
      setDraft(res.draft);
      setGeneratedDraft(res.draft);
      setPersonalized(!!res.personalized);
      if (res.showNotice) setNotice(true);
      setInstructions('');
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || t.email.genFail });
    } finally {
      setGenLoading(false);
    }
  }

  // Corps complet du mail + détection du fil. Deux appels, en tâche de fond :
  // l'écran affiche l'aperçu tout de suite et se complète ensuite.
  useEffect(() => {
    let vivant = true;
    apiPost<{ corps?: string; source?: string }>('/api/message-body', { itemId: String(id) })
      .then((j) => {
        if (!vivant) return;
        if (j?.corps) {
          setCorpsServeur(j.corps);
          setCorpsAbrege(j.source !== 'fournisseur' && j.source !== 'base_complet');
        }
      })
      .catch(() => {
        // RIEN EN SILENCE : on garde l'aperçu ET le bandeau « version abrégée »,
        // qui reste affiché puisque corpsAbrege vaut true par défaut.
      })
      .finally(() => {
        if (vivant) setCorpsCharge(true);
      });
    apiPost<{ ok?: boolean; estFil?: boolean; messages?: number; corpsComplet?: boolean }>(
      '/api/thread-summary',
      { id: String(id), mode: 'detect' },
    )
      .then((j) => {
        if (!vivant) return;
        setEstFil(!!j?.estFil);
        setTsMessages(Number(j?.messages) || 1);
      })
      .catch(() => {
        // On ne sait pas : on ne propose pas. Mieux vaut un bouton absent qu'un
        // bouton qui promet un résumé impossible.
        if (vivant) setEstFil(false);
      });
    return () => {
      vivant = false;
    };
  }, [id]);

  // Charge les PJ déjà attachées à ce brouillon.
  useEffect(() => {
    apiGet<{ attachments: { id: string; filename: string }[] }>(
      `/api/reply-attachments?item_id=${encodeURIComponent(String(id))}`,
    )
      .then((j) =>
        setAtts((j.attachments || []).map((a) => ({ id: a.id, filename: a.filename }))),
      )
      .catch(() => {});
  }, [id]);

  // Charge les PJ REÇUES de l'email.
  useEffect(() => {
    apiGet<{ attachments: RecvAtt[] }>(`/api/email-attachments?id=${encodeURIComponent(String(id))}`)
      .then((j) => setRecvAtts((j.attachments || []).filter((a) => a.attachment_id)))
      .catch(() => {});
  }, [id]);

  function isImageAtt(a: RecvAtt): boolean {
    const m = (a.mime_type || '').toLowerCase();
    return m.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(a.filename || '');
  }

  async function fetchRecv(a: RecvAtt): Promise<string | null> {
    try {
      return await apiDownloadToFile(
        `/api/attachments/download?id=${encodeURIComponent(a.id)}`,
        a.filename,
      );
    } catch {
      Alert.alert(recvStr.failed);
      return null;
    }
  }

  // Tap sur le nom : aperçu (image dans l'app) sinon feuille de partage.
  async function openRecv(a: RecvAtt) {
    if (dlRecvId) return;
    setDlRecvId(a.id);
    const uri = await fetchRecv(a);
    if (uri) {
      if (isImageAtt(a)) {
        setPreviewMime(a.mime_type);
        setPreviewUri(uri);
      } else if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(uri, { mimeType: a.mime_type || undefined });
    }
    setDlRecvId(null);
  }

  async function sharePreview() {
    if (!previewUri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(previewUri, { mimeType: previewMime || undefined });
    }
  }

  // Bouton Télécharger : feuille de partage (enregistrer / ouvrir ailleurs).
  async function shareRecv(a: RecvAtt) {
    if (dlRecvId) return;
    setDlRecvId(a.id);
    const uri = await fetchRecv(a);
    if (uri && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, { mimeType: a.mime_type || undefined });
    }
    setDlRecvId(null);
  }

  // Doit rester égal à MAX_BYTES de apps/web/src/app/api/reply-attachments/route.ts.
  // Au-delà de 4,5 Mo, Vercel renvoie un 413 AVANT d'exécuter la fonction (mesuré le
  // 11/08/2026) : on refuse ici plutôt que de faire voyager un fichier condamné.
  const MAX_ATT_BYTES = 4 * 1024 * 1024;

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

  function typeRetenu(nom: string, declare: string): string {
    const d = (declare || '').toLowerCase().split(';')[0].trim();
    if (d && d !== 'application/octet-stream' && d !== 'binary/octet-stream') return d;
    const ext = (nom || '').toLowerCase().split('.').pop() || '';
    return MIME_PAR_EXTENSION[ext] || d || 'application/octet-stream';
  }

  /** Nom lisible : `uri.split('/').pop()` renvoie un nom déjà encodé en URL. */
  function nomLisible(nom: string): string {
    try {
      return decodeURIComponent(nom || '').trim() || 'fichier';
    } catch {
      return (nom || 'fichier').trim();
    }
  }

  /** Message d'échec, jamais muet. Renvoie null quand tout s'est bien passé. */
  function messageEchecPJ(e: unknown): string {
    const msg = String((e as { message?: string })?.message || e || '');
    if (/\b413\b/.test(msg) || /trop volumineux|too large|Entity Too Large/i.test(msg)) return attStr.tooBig;
    if (/\b415\b/.test(msg) || /non pris en charge|non autoris|not supported/i.test(msg)) return attStr.badType;
    if (/\b409\b/.test(msg) || /maximum de pi|Maximum 10|maximum attach/i.test(msg)) return attStr.tooMany;
    if (/Network request failed|réseau|network/i.test(msg)) return attStr.network;
    return msg ? `${attStr.failed} ${msg}`.trim() : attStr.failed;
  }

  // Upload d'un fichier (objet RN FormData { uri, name, type }).
  // Renvoie null si le fichier est ajouté, sinon le message d'échec à afficher.
  // 11/08/2026 — le `catch {}` était vide : un 413, un 415 ou un 409 laissait la liste
  // vide sans un mot. C'est ce silence qui a fait passer la panne pour un mystère.
  async function uploadAsset(
    uri: string,
    name: string,
    type: string,
    taille?: number | null,
  ): Promise<string | null> {
    const nom = nomLisible(name);
    if (typeof taille === 'number' && taille > MAX_ATT_BYTES) {
      return `${nom} — ${attStr.tooBig}`;
    }
    const form = new FormData();
    form.append('item_id', String(id));
    form.append('file', { uri, name: nom, type: typeRetenu(nom, type) } as unknown as Blob);
    try {
      const j = await apiUpload<{ attachment: { id: string; filename: string } }>(
        '/api/reply-attachments',
        form,
      );
      if (j?.attachment) {
        setAtts((p) => [...p, { id: j.attachment.id, filename: j.attachment.filename }]);
        return null;
      }
      return `${nom} — ${attStr.failed}`;
    } catch (e) {
      return `${nom} — ${messageEchecPJ(e)}`;
    }
  }

  // Source 1 — Fichiers (iCloud Drive, Téléchargements, etc.).
  async function pickFromFiles() {
    setAttMenu(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      setUploading(true);
      setAttError(null);
      const echecs: string[] = [];
      for (const a of res.assets) {
        const err = await uploadAsset(
          a.uri,
          a.name || 'fichier',
          a.mimeType || 'application/octet-stream',
          a.size ?? null,
        );
        if (err) echecs.push(err);
      }
      if (echecs.length) setAttError(echecs.join(' · '));
      setUploading(false);
    } catch (e) {
      setAttError(messageEchecPJ(e));
      setUploading(false);
    }
  }

  // Source 2 — Photothèque (photos/vidéos de l'appareil).
  async function pickFromPhotos() {
    setAttMenu(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(attStr.photos, attStr.permDenied);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.9,
      });
      if (res.canceled || !res.assets?.length) return;
      setUploading(true);
      setAttError(null);
      const echecs: string[] = [];
      for (const a of res.assets) {
        const name = a.fileName || a.uri.split('/').pop() || 'image.jpg';
        const err = await uploadAsset(a.uri, name, a.mimeType || 'image/jpeg', a.fileSize ?? null);
        if (err) echecs.push(err);
      }
      if (echecs.length) setAttError(echecs.join(' · '));
      setUploading(false);
    } catch (e) {
      setAttError(messageEchecPJ(e));
      setUploading(false);
    }
  }

  // Source 3 — Appareil photo.
  async function pickFromCamera() {
    setAttMenu(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(attStr.camera, attStr.permDenied);
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      if (res.canceled || !res.assets?.length) return;
      setUploading(true);
      setAttError(null);
      const a = res.assets[0];
      const err = await uploadAsset(
        a.uri,
        a.fileName || 'photo.jpg',
        a.mimeType || 'image/jpeg',
        a.fileSize ?? null,
      );
      if (err) setAttError(err);
      setUploading(false);
    } catch (e) {
      setAttError(messageEchecPJ(e));
      setUploading(false);
    }
  }

  async function removeAtt(attId: string) {
    setAtts((p) => p.filter((a) => a.id !== attId));
    try {
      await apiDelete(`/api/reply-attachments?id=${encodeURIComponent(attId)}`);
    } catch {
      // ignore
    }
  }

  async function pushToMailbox() {
    if (pushing || !draft.trim()) return;
    setPushing(true);
    setMsg(null);
    try {
      await apiPost('/api/push-to-mailbox', {
        id,
        draft,
        generatedDraft,
        locale,
        idempotencyKey,
      });
      setMsg({ type: 'ok', text: t.email.draftCreated });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || t.email.pushFail });
    } finally {
      setPushing(false);
    }
  }

  async function sendReply() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setMsg(null);
    try {
      await apiPost('/api/send-reply', { id, draft, generatedDraft, locale, idempotencyKey });
      setSent(true);
    } catch (e: any) {
      setShowConfirm(false);
      setMsg({ type: 'err', text: e?.message || t.email.sendFail });
    } finally {
      setSending(false);
    }
  }

  const catLabel = (k: string) => prioLabel(t, k);

  // Reclasser uniquement cet email : on réécrit ses tags de priorité.
  async function applyThisEmail(cat: string) {
    if (reBusy || !item) return;
    setReBusy(true);
    setReError(null);
    // Relit la valeur serveur des tags avant de réécrire, pour ne pas écraser des
    // tags ajoutés par le pipeline entre-temps (évite le last-write-wins). En cas
    // d'échec de relecture, on retombe sur la valeur locale (item.tags).
    let currentTags = item.tags || [];
    try {
      const { data: fresh } = await supabase.from('items').select('tags').eq('id', id).single();
      if (fresh && Array.isArray((fresh as { tags?: string[] }).tags)) {
        currentTags = (fresh as { tags: string[] }).tags;
      }
    } catch {
      // relecture impossible -> on garde la valeur locale (comportement actuel).
    }
    // Retire les clés de priorité, ajoute la catégorie, PRÉSERVE box:* et le reste.
    const base = (currentTags || []).filter(
      (t) => !PRIORITY_KEYS.includes((t || '').toLowerCase()),
    );
    const nextTags = [...base, cat];
    const { error: e } = await supabase.from('items').update({ tags: nextTags }).eq('id', id);
    setReBusy(false);
    if (e) {
      setReError(e.message);
      return;
    }
    // Signal de tri personnalisé (best-effort) : le cron promeut les reclassements
    // répétés du même expéditeur en règle de classement.
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('style_signals').insert({
          user_id: user.id,
          item_id: id,
          kind: 'reclass',
          payload: {
            target: 'this',
            sender: extractEmail(item.author),
            domain: domainOf(item.author),
            to: cat,
          },
        });
      }
    } catch {
      // best-effort
    }
    setItem({ ...item, tags: nextTags });
    setPendingCat(null);
    setKeyword('');
    setReNote(t.email.reclassified);
  }

  // Créer une règle (expéditeur / domaine / mot-clé) → catégorie.
  async function applyRule(type: 'sender' | 'domain' | 'keyword', value: string, cat: string) {
    const v = (value || '').trim().toLowerCase();
    if (reBusy || !v) return;
    setReBusy(true);
    setReError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setReBusy(false);
      setReError(t.email.notAuth);
      return;
    }
    const { error: e } = await supabase.from('classification_rules').upsert(
      { user_id: user.id, match_type: type, match_value: v, category: cat },
      { onConflict: 'user_id,match_type,match_value' },
    );
    setReBusy(false);
    if (e) {
      setReError(e.message);
      return;
    }
    // Refléter la règle localement pour mettre à jour la priorité affichée.
    setRules((prev) => [
      ...prev.filter((r) => !(r.match_type === type && r.match_value === v)),
      { match_type: type, match_value: v, category: cat },
    ]);
    const label =
      type === 'sender'
        ? f(t.email.labelSender, { v })
        : type === 'domain'
          ? f(t.email.labelDomain, { v })
          : f(t.email.labelKeyword, { v });
    setPendingCat(null);
    setKeyword('');
    setReNote(f(t.email.ruleCreated, { label, cat: catLabel(cat) }));
  }

  const p = item ? effectivePriority(item, rules) : null;
  const senderEmail = item ? extractEmail(item.author) : '';
  const senderDomain = item ? domainOf(item.author) : '';
  // Corps complet nettoyé. Le corps du serveur remplace l'aperçu dès qu'il arrive.
  // `htmlToText` reste nécessaire : get-message rend le HTML brut du fournisseur.
  //
  // ⚠️ Le repli ne se déclenche QUE sur un corps vide. Il testait aussi
  // `body.includes('<')`, censé détecter un nettoyage raté — mesuré le 11/08/2026,
  // ce test ne pouvait PAS faire ça : `htmlToText` retire tout `<…>`, donc un « < »
  // survivant vient forcément du texte lui-même —
  //     « Prix < 100 euros »            -> « Prix < 100 euros »
  //     « Prix &lt; 100 euros »         -> « Prix < 100 euros »
  //     « Prix &amp;lt; 100 euros »     -> « Prix < 100 euros »
  // Le seul cas de vrai résidu est une balise tronquée en fin de source
  // (« … <div » sans « > »), et un « <div » orphelin vaut mieux que de jeter
  // 29 000 caractères de mail pour le remplacer par 200 d'aperçu.
  let body = htmlToText(corpsServeur ?? (item?.content || item?.body || ''));
  const lireStr = LIRE_STR[locale] ?? LIRE_STR.en;
  // 32 % de l'écran — aligné sur le web (components/mail-body-panel.tsx) après
  // l'arbitrage HA du 11/08. Plancher à 200 px : il doit rester SOUS la valeur
  // calculée sur les écrans courants, sinon il écraserait le réglage. Sur un
  // écran de 844 pt : 270 pt. L'ancien plancher de 260 px l'aurait annulé dès
  // qu'un appareil descend sous 813 pt.
  const hauteurRepliee = Math.max(200, Math.round(hauteurEcran * 0.32));
  // 48 px de marge : en dessous, déplier ferait sauter l'écran pour trois lignes.
  const corpsDeborde = hauteurCorps > hauteurRepliee + 48;
  if (!body) {
    body = htmlToText(item?.preview || '');
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          {p ? (
            <View style={[styles.navCat, { borderColor: p.color }]}>
              <View style={[styles.navCatDot, { backgroundColor: p.color }]} />
              <Text style={[styles.navCatText, { color: p.color }]}>
                {prioLabel(t, p.key).toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        {/* Sujet + expediteur dans le bandeau : meme systeme que les listes (bandeau
            charbon = identite de l'ecran, creme = contenu). Avant, le bandeau etait
            vide et le sujet flottait sur le creme, sans ancrage. */}
        {item ? (
          <View style={styles.hero}>
            <Text style={styles.subject}>{item.title || t.common.noSubject}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.sender} numberOfLines={1}>
                {item.author ?? t.common.unknownSender}
              </Text>
              <Text style={styles.metaDate}>
                {new Date(item.received_at).toLocaleString(intl, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        ) : null}
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      ) : !item ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{t.email.notFound}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
        >
          {summaryLoading || summary || !body ? (
            <>
              <View style={styles.summaryCard}>
                <View style={styles.summaryHead}>
                  <IconSparkle size={13} color={colors.terracottaVivid} />
                  <Text style={styles.summaryLabel}>{t.email.summary}</Text>
                </View>
                {summaryLoading ? (
                  <View style={styles.genLoading}>
                    <ActivityIndicator color={colors.terracotta} />
                    <Text style={styles.genLoadingText}>{t.email.aiSummarizing}</Text>
                  </View>
                ) : (
                  <Text style={styles.summaryText}>
                    {summary || (!body ? t.email.noPreview : '')}
                  </Text>
                )}
              </View>
            </>
          ) : null}

          {/* Corps de l'email — affiché EN PLUS du résumé (avant, le message
              lui-même n'était jamais visible dès qu'un résumé existait). */}
          {body ? (
            <>
              <Text style={styles.sectionLabel}>{BODY_STR[locale] ?? BODY_STR.en}</Text>
              {!corpsCharge ? (
                <Text style={styles.corpsNote}>{lireStr.chargement}</Text>
              ) : corpsAbrege ? (
                <Text style={styles.corpsNote}>{lireStr.abrege}</Text>
              ) : null}
              {/* Encadré déroulant — arbitrage HA du 11/08 : replié à 55 % de la
                  hauteur d'écran, fondu de coupe, « Afficher tout » qui déplie à la
                  hauteur RÉELLE. Pas de ScrollView imbriquée : deux zones de
                  défilement se disputeraient le doigt, et c'est exactement le
                  « overflow: scroll posé à la va-vite » dont HA ne veut pas. */}
              <View
                style={
                  deplie || !corpsDeborde
                    ? undefined
                    : { maxHeight: hauteurRepliee, overflow: 'hidden' }
                }
              >
                {/* On ne garde QUE la plus grande hauteur vue. Sans ça : le corps
                    complet arrive -> deborde -> on clippe -> onLayout renvoie la
                    hauteur CLIPPÉE -> deborde redevient faux -> on declippe…
                    une oscillation permanente. Le premier rendu se fait sans
                    maxHeight (hauteurCorps vaut 0), donc la vraie hauteur est
                    toujours mesurée au moins une fois. */}
                <View
                  onLayout={(e) => {
                    // ⚠️ On LIT la hauteur TOUT DE SUITE. L'événement synthétique est
                    // recyclé par React Native dès la fin du gestionnaire, alors que
                    // l'updater passé à setState est appelé PLUS TARD, pendant le
                    // rendu. Le lire à l'intérieur donnait `e.nativeEvent === null` :
                    // « Cannot read property 'layout' of null », à chaque ouverture
                    // de mail (mesuré sur appareil le 11/08/2026, build 14).
                    const hauteurMesuree = e.nativeEvent.layout.height;
                    setHauteurCorps((h) => Math.max(h, hauteurMesuree));
                  }}
                >
                  <LinkifiedText text={body} style={styles.content} />
                </View>
                {corpsDeborde && !deplie ? (
                  // Fondu sans dépendance : `expo-linear-gradient` n'est pas installé
                  // (vérifié dans package.json), et l'ajouter pour un dégradé
                  // imposerait un build EAS de plus. Sept bandes suffisent à l'œil.
                  <View pointerEvents="none" style={styles.fondu}>
                    {[0.06, 0.16, 0.3, 0.48, 0.68, 0.86, 1].map((o, i) => (
                      <View key={i} style={[styles.fonduBande, { opacity: o }]} />
                    ))}
                  </View>
                ) : null}
              </View>
              {corpsDeborde ? (
                <Pressable
                  style={styles.deplierBtn}
                  onPress={() => setDeplie((v) => !v)}
                  accessibilityRole="button"
                >
                  <Text style={styles.deplierBtnText}>
                    {deplie ? lireStr.replier : lireStr.tout}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}

          {/* Actions sur le mail (archiver / corbeille / restaurer). Placees APRES la
              lecture et AVANT le reclassement : ce sont des actions sur l'objet, le
              reclassement est un reglage. Jumeau du volet de lecture web. */}
          <MailActions
            itemId={String(id)}
            tags={item.tags || []}
            onDone={(op, nouveaux) => {
              // On garde l'ecran ouvert (l'annulation doit rester atteignable) mais on
              // met l'item a jour pour que les boutons refletent le nouvel etat.
              if (nouveaux) setItem({ ...item, tags: nouveaux });
            }}
          />

          {/* Reclassement — action secondaire : on la place APRES la lecture.
              Avant, elle s'intercalait entre l'en-tete et le resume : la premiere chose
              qu'on voyait en ouvrant un mail etait un formulaire de classement. */}
          <View style={styles.reclassify}>
            <Text style={styles.reLabel}>{t.email.category}</Text>
            <View style={styles.chipsWrap}>
              {PRIORITIES.map((c) => {
                const active = p?.key === c.key;
                return (
                  <Pressable
                    key={c.key}
                    disabled={reBusy}
                    onPress={() => (active ? undefined : setPendingCat(c.key))}
                    style={[
                      styles.catChip,
                      active
                        ? { backgroundColor: c.color, borderColor: c.color }
                        : { borderColor: colors.cardline },
                    ]}
                  >
                    <Text style={[styles.catChipText, { color: active ? '#ffffff' : c.color }]}>
                      {prioLabel(t, c.key)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {pendingCat ? (
              <View style={styles.reBox}>
                <View style={styles.reBoxTop}>
                  <Text style={styles.reBoxTitle}>
                    {t.email.classifyPrefix}
                    <Text style={{ fontFamily: fonts.sansBold }}>{catLabel(pendingCat)}</Text>
                    {t.email.classifySuffix}
                  </Text>
                  <Pressable
                    onPress={() => {
                      setPendingCat(null);
                      setKeyword('');
                    }}
                  >
                    <Text style={styles.reCancel}>{t.common.cancel}</Text>
                  </Pressable>
                </View>
                <View style={styles.chipsWrap}>
                  <Pressable
                    style={styles.targetChip}
                    disabled={reBusy}
                    onPress={() => applyThisEmail(pendingCat)}
                  >
                    <Text style={styles.targetChipText}>{t.email.thisEmailOnly}</Text>
                  </Pressable>
                  {senderEmail ? (
                    <Pressable
                      style={styles.targetChip}
                      disabled={reBusy}
                      onPress={() => applyRule('sender', senderEmail, pendingCat)}
                    >
                      <Text style={styles.targetChipText}>
                        {f(t.email.allFrom, { email: senderEmail })}
                      </Text>
                    </Pressable>
                  ) : null}
                  {senderDomain ? (
                    <Pressable
                      style={styles.targetChip}
                      disabled={reBusy}
                      onPress={() => applyRule('domain', senderDomain, pendingCat)}
                    >
                      <Text style={styles.targetChipText}>
                        {f(t.email.domainTarget, { domain: senderDomain })}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.kwRow}>
                  <TextInput
                    style={styles.kwInput}
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder={t.email.keywordPlaceholder}
                    placeholderTextColor={colors.hint}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={[styles.kwBtn, (reBusy || !keyword.trim()) && styles.btnDisabled]}
                    disabled={reBusy || !keyword.trim()}
                    onPress={() => applyRule('keyword', keyword, pendingCat)}
                  >
                    <Text style={styles.kwBtnText}>{t.email.create}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {reNote ? <Text style={styles.reNote}>{reNote}</Text> : null}
            {reError ? <Text style={styles.reErr}>{reError}</Text> : null}
          </View>

          {/* Chantier F, arbitrage HA du 11/08 : le bouton DISPARAÎT quand le mail
              est isolé. `estFil === null` = on ne sait pas encore -> rien non plus,
              pour éviter un bouton qui clignote. Mesure qui l'a motivé : le mail
              Direct Assurance fait 194 caractères en base et 28 998 chez Gmail, et
              on demandait au modèle d'en résumer « les échanges clés ». */}
          {estFil === true ? (
            <>
              <Pressable
                style={[styles.linkBtn, tsLoading && styles.btnDisabled]}
                disabled={tsLoading}
                onPress={async () => {
                  if (tsLoading) return;
                  setTsLoading(true);
                  try {
                    const r = await apiPost<{ summary: string; corpsComplet?: boolean }>(
                      '/api/thread-summary',
                      { id, locale },
                    );
                    setThreadSummary(r.summary || '');
                    setTsPartiel(r.corpsComplet === false);
                  } catch (e: any) {
                    setMsg({ type: 'err', text: e?.message || t.email.genFail });
                  }
                  setTsLoading(false);
                }}
              >
                {tsLoading ? (
                  <ActivityIndicator size="small" color={colors.terracotta} />
                ) : (
                  <Text style={styles.linkBtnText}>{t.email.summarizeThread}</Text>
                )}
              </Pressable>
              {threadSummary ? (
                <View style={styles.tsBox}>
                  <Text style={styles.sectionLabel}>
                    {t.email.threadSummaryTitle} · {tsMessages}
                  </Text>
                  {/* Un résumé fait sur l'aperçu ne doit jamais passer pour un
                      résumé du mail entier. */}
                  {tsPartiel ? <Text style={styles.corpsNote}>{lireStr.abrege}</Text> : null}
                  <Text style={styles.content}>{threadSummary}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          {item.url ? (
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(item.url as string)}>
              <Text style={styles.linkBtnText}>{t.email.openInMail}</Text>
            </Pressable>
          ) : null}

          {/* Pièces jointes reçues */}
          {recvAtts.length > 0 ? (
            <View style={styles.recvBox}>
              <Text style={styles.recvTitle}>
                {attStr.label} ({recvAtts.length})
              </Text>
              {recvAtts.map((a) => (
                <View key={a.id} style={styles.recvRow}>
                  <Pressable
                    style={styles.recvNameWrap}
                    onPress={() => openRecv(a)}
                    disabled={dlRecvId === a.id}
                  >
                    <Text style={styles.recvName} numberOfLines={1}>
                      {a.filename}
                    </Text>
                  </Pressable>
                  {dlRecvId === a.id ? (
                    <ActivityIndicator size="small" color={colors.terracotta} />
                  ) : (
                    <Pressable onPress={() => shareRecv(a)} hitSlop={8}>
                      <Text style={styles.recvDl}>{recvStr.download}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          {/* Brouillon IA */}
          <View style={styles.draftSection}>
            <View style={styles.draftHead}>
              <View style={styles.draftIcon}>
                <IconReplySuggested size={16} color={colors.terracottaVivid} />
              </View>
              <Text style={styles.draftTitle}>{t.email.draftTitle}</Text>
            </View>

            {!draft && !genLoading ? (
              <Pressable style={styles.cta} onPress={() => generate(false)}>
                <Text style={styles.ctaText}>{t.email.generateDraft}</Text>
              </Pressable>
            ) : null}

            {genLoading ? (
              <View style={styles.genLoading}>
                <ActivityIndicator color={colors.terracotta} />
                <Text style={styles.genLoadingText}>{t.email.aiWriting}</Text>
              </View>
            ) : null}

            {draft && !genLoading ? (
              <>
                <TextInput
                  style={styles.draftInput}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  textAlignVertical="top"
                />

                {/* Ligne discrète : adaptation au style */}
                {personalized ? (
                  <View style={styles.adaptedRow}>
                    <IconSparkle size={12} color={colors.hint} />
                    <Text style={styles.adapted}>{persoStr.adapted}</Text>
                  </View>
                ) : null}

                {/* Avis unique (opt-out) */}
                {notice ? (
                  <View style={styles.noticeBox}>
                    <Text style={styles.noticeText}>{persoStr.notice}</Text>
                    <Pressable onPress={() => setNotice(false)} hitSlop={8}>
                      <IconClose size={15} color={colors.hint} />
                    </Pressable>
                  </View>
                ) : null}

                {/* Pièces jointes */}
                <Text style={styles.refineLabel}>{attStr.label}</Text>
                {atts.map((a) => (
                  <View key={a.id} style={styles.attRow}>
                    <Text style={styles.attName} numberOfLines={1}>
                      {a.filename}
                    </Text>
                    <Pressable onPress={() => removeAtt(a.id)} hitSlop={8}>
                      <IconClose size={15} color={colors.hint} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  style={[styles.attAddBtn, uploading && styles.btnDisabled]}
                  onPress={() => setAttMenu(true)}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.muted} />
                  ) : (
                    <IconPlus size={14} color={colors.ink} />
                  )}
                  <Text style={styles.attAddText}>{uploading ? attStr.sending : attStr.add}</Text>
                </Pressable>
                {attError ? <Text style={styles.attError}>{attError}</Text> : null}

                {/* Reformulations rapides */}
                <Text style={styles.refineLabel}>{t.email.adjust}</Text>
                <View style={styles.chipsWrap}>
                  {QUICK_REFINEMENTS.map((q) => (
                    <Pressable
                      key={q.label}
                      style={styles.refineChip}
                      disabled={genLoading}
                      onPress={() => generate(true, q.instruction)}
                    >
                      <Text style={styles.refineChipText}>{q.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  style={styles.instr}
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder={t.email.instrPlaceholder}
                  placeholderTextColor={colors.hint}
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.secondaryBtn, !instructions.trim() && styles.btnDisabled]}
                    onPress={() => generate(true)}
                    disabled={!instructions.trim()}
                  >
                    <Text style={styles.secondaryBtnText}>{t.email.reformulate}</Text>
                  </Pressable>
                  <Pressable style={[styles.cta, styles.flex1]} onPress={pushToMailbox} disabled={pushing}>
                    {pushing ? (
                      <ActivityIndicator color={colors.onDark} />
                    ) : (
                      <Text style={styles.ctaText}>{t.email.putInMailbox}</Text>
                    )}
                  </Pressable>
                </View>

                {/* Envoi direct depuis l'app (avec confirmation) */}
                <Pressable
                  style={styles.sendBtn}
                  onPress={() => {
                    setSent(false);
                    setShowConfirm(true);
                  }}
                >
                  <Text style={styles.sendBtnText}>{t.email.sendDirectly}</Text>
                </Pressable>
              </>
            ) : null}

            {msg ? (
              <Text style={[styles.msg, msg.type === 'ok' ? styles.msgOk : styles.msgErr]}>{msg.text}</Text>
            ) : null}
          </View>

          {/* Aperçu plein écran d'une PJ image */}
          <Modal
            visible={!!previewUri}
            transparent
            animationType="fade"
            onRequestClose={() => setPreviewUri(null)}
          >
            <View style={styles.previewOverlay}>
              <Pressable style={styles.previewClose} onPress={() => setPreviewUri(null)} hitSlop={12}>
                <IconClose size={26} color={colors.onDark} />
              </Pressable>
              {previewUri ? (
                <Image source={{ uri: previewUri }} style={styles.previewImg} resizeMode="contain" />
              ) : null}
              <View style={styles.previewBar}>
                <Pressable style={styles.previewAction} onPress={sharePreview}>
                  <Text style={styles.previewActionText}>{recvStr.share}</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          {/* Menu : source de la pièce jointe */}
          <Modal
            visible={attMenu}
            transparent
            animationType="fade"
            onRequestClose={() => setAttMenu(false)}
          >
            <Pressable style={styles.sheetOverlay} onPress={() => setAttMenu(false)}>
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>{attStr.choose}</Text>
                <Pressable style={styles.sheetItem} onPress={pickFromPhotos}>
                  <Text style={styles.sheetItemText}>{attStr.photos}</Text>
                </Pressable>
                <Pressable style={styles.sheetItem} onPress={pickFromCamera}>
                  <Text style={styles.sheetItemText}>{attStr.camera}</Text>
                </Pressable>
                <Pressable style={styles.sheetItem} onPress={pickFromFiles}>
                  <Text style={styles.sheetItemText}>{attStr.files}</Text>
                </Pressable>
                <Pressable style={styles.sheetCancel} onPress={() => setAttMenu(false)}>
                  <Text style={styles.sheetCancelText}>{attStr.cancel}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>

          {/* Écran de confirmation d'envoi */}
          <Modal
            visible={showConfirm}
            transparent
            animationType="fade"
            onRequestClose={() => (sending ? undefined : setShowConfirm(false))}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                {sent ? (
                  <>
                    <Text style={styles.modalTitle}>{t.email.sentTitle}</Text>
                    <Text style={styles.modalSub}>{t.email.sentSub}</Text>
                    <Pressable
                      style={styles.cta}
                      onPress={() => {
                        setShowConfirm(false);
                        router.back();
                      }}
                    >
                      <Text style={styles.ctaText}>{t.common.close}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.modalTitle}>{t.email.confirmTitle}</Text>
                    <Text style={styles.modalSub}>{t.email.confirmSub}</Text>
                    <ScrollView style={styles.modalPreview}>
                      <Text style={styles.modalPreviewText}>{draft}</Text>
                    </ScrollView>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.secondaryBtn, styles.flex1]}
                        onPress={() => setShowConfirm(false)}
                        disabled={sending}
                      >
                        <Text style={styles.secondaryBtnText}>{t.common.cancel}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.cta, styles.flex1]}
                        onPress={sendReply}
                        disabled={sending}
                      >
                        {sending ? (
                          <ActivityIndicator color={colors.onDark} />
                        ) : (
                          <Text style={styles.ctaText}>{t.email.confirmSend}</Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  safe: { backgroundColor: colors.charcoal },
  topbar: {
    backgroundColor: colors.charcoal,
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
    backgroundColor: 'rgba(250,247,240,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    opacity: 0.9,
  },
  navCatDot: { width: 6, height: 6, borderRadius: 3 },
  navCatText: { fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.8 },
  back: { fontFamily: fonts.sansSemibold, color: colors.onDark, fontSize: 16 },
  draftHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  draftIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(232,93,12,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.sans, color: colors.muted, fontSize: 15 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  prio: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.2, marginBottom: spacing.sm },

  // En-tete dans le bandeau charbon
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  subject: { fontFamily: fonts.sansBold, fontSize: 23, color: colors.onDark, lineHeight: 30, letterSpacing: -0.4 },
  heroMeta: { marginTop: spacing.md },
  sender: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: 'rgba(250,247,240,0.82)' },
  metaDate: { fontFamily: fonts.sans, fontSize: 12, color: 'rgba(250,247,240,0.42)', marginTop: 3, textTransform: 'capitalize' },

  // Resume IA : le seul bloc en carte blanche — c'est la valeur ajoutee du produit,
  // avant il avait exactement le meme traitement que le message brut.
  summaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.md + 3,
    borderLeftWidth: 3,
    borderLeftColor: colors.terracottaVivid,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  summaryLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.terracotta,
  },
  summaryText: { fontFamily: fonts.sans, fontSize: 14.5, color: colors.ink2, lineHeight: 23 },

  // Reclassement
  reclassify: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
  },
  reLabel: { fontFamily: fonts.sans, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  catChipText: { fontFamily: fonts.sansSemibold, fontSize: 12 },
  reBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reBoxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  reBoxTitle: { fontFamily: fonts.sans, flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 18 },
  reCancel: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  targetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.cream,
  },
  targetChipText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.ink2 },
  kwRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  kwInput: {
    fontFamily: fonts.sans,
    flex: 1,
    backgroundColor: colors.cream,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.ink,
  },
  kwBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kwBtnText: { fontFamily: fonts.sansSemibold, color: colors.cream, fontSize: 13 },
  reNote: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  reErr: { fontFamily: fonts.sans, fontSize: 12, color: colors.danger, marginTop: spacing.xs },

  divider: { height: 1, backgroundColor: colors.cardline, marginVertical: spacing.lg },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  content: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink2, lineHeight: 24 },
  corpsNote: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  // 52 px et non 76 : sur un cadre de 270 pt, l'ancien fondu rendait illisible
  // près d'un tiers de ce qu'on donne à lire. Même proportion que le web.
  fondu: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 52 },
  fonduBande: { flex: 1, backgroundColor: colors.cream },
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
  linkBtn: { marginTop: spacing.lg },
  linkBtnText: { fontFamily: fonts.sansSemibold, color: colors.terracotta, fontSize: 14 },

  draftSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
    gap: spacing.md,
  },
  draftTitle: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink },
  genLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  genLoadingText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14 },
  draftInput: {
    fontFamily: fonts.sans,
    minHeight: 160,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.ink2,
    lineHeight: 22,
  },
  tsBox: { marginTop: spacing.md },
  adaptedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  adapted: { fontFamily: fonts.sansItalic, fontSize: 11, color: colors.hint },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: { fontFamily: fonts.sans, flex: 1, fontSize: 12, color: colors.muted, lineHeight: 17 },
  noticeClose: { fontFamily: fonts.sans, fontSize: 13, color: colors.hint },
  refineLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  attError: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.danger, marginTop: 6, lineHeight: 18 },
  attName: { fontFamily: fonts.sans, flex: 1, fontSize: 13, color: colors.ink2 },
  attAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  attAddText: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.ink },
  recvBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  recvTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  recvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
  },
  recvNameWrap: { flex: 1, paddingEnd: spacing.sm },
  recvName: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink },
  recvDl: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  previewClose: { position: 'absolute', top: 52, end: 20, zIndex: 2, padding: 8 },
  previewImg: { width: '100%', height: '100%' },
  previewBar: { position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center' },
  previewAction: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  previewActionText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,18,15,0.45)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: 2,
  },
  sheetTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  sheetItem: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
  },
  sheetItemText: { fontFamily: fonts.sansSemibold, fontSize: 16, color: colors.terracotta },
  sheetCancel: { paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs },
  sheetCancelText: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink2 },
  refineChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
  },
  refineChipText: { fontFamily: fonts.sansMedium, fontSize: 12, color: colors.ink2 },
  instr: {
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
  row: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
  cta: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  secondaryBtn: {
    borderColor: colors.terracotta,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: fonts.sansSemibold, color: colors.terracotta, fontSize: 14 },
  btnDisabled: { opacity: 0.4 },
  msg: { fontFamily: fonts.sans, fontSize: 13, marginTop: spacing.sm },
  msgOk: { color: colors.sage },
  msgErr: { color: colors.danger },

  sendBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { fontFamily: fonts.sansBold, color: colors.cream, fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20,18,15,0.55)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  modalTitle: { fontFamily: fonts.sansBold, fontSize: 18, color: colors.ink },
  modalSub: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, lineHeight: 20 },
  modalPreview: {
    maxHeight: 220,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  modalPreviewText: { fontFamily: fonts.sans, fontSize: 14, color: colors.ink2, lineHeight: 21 },
});
