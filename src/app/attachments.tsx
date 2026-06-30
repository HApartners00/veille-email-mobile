import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';

import { useI18n } from '@/context/i18n';
import { apiDownloadToFile, apiPost } from '@/lib/api';
import { IconClose } from '@/components/icons';
import { colors, radius, spacing } from '@/lib/theme';

type Att = {
  id: string;
  item_id: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  sender: string | null;
  received_at: string | null;
  attachment_id?: string | null;
};

type Filters = {
  keywords: string[];
  type: string;
  sender: string | null;
  after: string | null;
  before: string | null;
};

type Turn =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string;
      results: Att[];
      query?: string;
      filters?: Filters;
      hasMore?: boolean;
      loadingMore?: boolean;
      typeFilter?: string;
    };

function mimeCategory(mime: string | null, filename: string): string {
  const m = (mime || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (m.includes('pdf') || f.endsWith('.pdf')) return 'pdf';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/.test(f)) return 'image';
  if (m.includes('spreadsheet') || m.includes('excel') || m.includes('csv') || /\.(xlsx?|csv)$/.test(f)) return 'sheet';
  if (m.includes('presentation') || m.includes('powerpoint') || /\.(pptx?)$/.test(f)) return 'slides';
  if (m.includes('word') || m.includes('msword') || /\.(docx?|rtf|txt)$/.test(f)) return 'doc';
  if (/zip|rar|7z|tar|gzip/.test(m) || /\.(zip|rar|7z|tar|gz)$/.test(f)) return 'archive';
  return 'other';
}

const CAT_LABELS: Record<string, Record<string, string>> = {
  fr: { all: 'Tous', pdf: 'PDF', image: 'Images', doc: 'Documents', sheet: 'Tableurs', slides: 'Slides', archive: 'Archives', other: 'Autres' },
  en: { all: 'All', pdf: 'PDF', image: 'Images', doc: 'Documents', sheet: 'Spreadsheets', slides: 'Slides', archive: 'Archives', other: 'Other' },
  es: { all: 'Todos', pdf: 'PDF', image: 'Imágenes', doc: 'Documentos', sheet: 'Hojas', slides: 'Diapos', archive: 'Archivos', other: 'Otros' },
  de: { all: 'Alle', pdf: 'PDF', image: 'Bilder', doc: 'Dokumente', sheet: 'Tabellen', slides: 'Folien', archive: 'Archive', other: 'Andere' },
  pt: { all: 'Todos', pdf: 'PDF', image: 'Imagens', doc: 'Documentos', sheet: 'Folhas', slides: 'Slides', archive: 'Arquivos', other: 'Outros' },
  it: { all: 'Tutti', pdf: 'PDF', image: 'Immagini', doc: 'Documenti', sheet: 'Fogli', slides: 'Slide', archive: 'Archivi', other: 'Altri' },
  ar: { all: 'الكل', pdf: 'PDF', image: 'صور', doc: 'مستندات', sheet: 'جداول', slides: 'شرائح', archive: 'أرشيف', other: 'أخرى' },
};

const DL_LABELS: Record<string, { download: string; share: string; failed: string }> = {
  fr: { download: 'Télécharger', share: 'Partager / Enregistrer', failed: 'Téléchargement impossible.' },
  en: { download: 'Download', share: 'Share / Save', failed: 'Download failed.' },
  es: { download: 'Descargar', share: 'Compartir / Guardar', failed: 'Descarga fallida.' },
  de: { download: 'Herunterladen', share: 'Teilen / Speichern', failed: 'Download fehlgeschlagen.' },
  pt: { download: 'Baixar', share: 'Partilhar / Guardar', failed: 'Falha no download.' },
  it: { download: 'Scarica', share: 'Condividi / Salva', failed: 'Download non riuscito.' },
  ar: { download: 'تنزيل', share: 'مشاركة / حفظ', failed: 'فشل التنزيل.' },
};

function isImageAtt(mime: string | null, filename: string): boolean {
  const m = (mime || '').toLowerCase();
  return m.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(filename || '');
}

const MORE_LABELS: Record<string, { more: string; loading: string }> = {
  fr: { more: 'Charger plus', loading: 'Chargement…' },
  en: { more: 'Load more', loading: 'Loading…' },
  es: { more: 'Cargar más', loading: 'Cargando…' },
  de: { more: 'Mehr laden', loading: 'Laden…' },
  pt: { more: 'Carregar mais', loading: 'A carregar…' },
  it: { more: 'Carica altro', loading: 'Caricamento…' },
  ar: { more: 'تحميل المزيد', loading: '…جارٍ التحميل' },
};

const STR: Record<
  string,
  {
    title: string;
    subtitle: string;
    placeholder: string;
    send: string;
    searching: string;
    intro: string;
    examples: string[];
    from: string;
    open: string;
    err: string;
  }
> = {
  fr: {
    title: 'Pièces jointes',
    subtitle: 'Décrivez le fichier reçu — je le retrouve dans vos emails.',
    placeholder: 'Ex : le PDF du contrat de Marie',
    send: 'Rechercher',
    searching: 'Recherche…',
    intro: 'Décrivez une pièce jointe reçue, en langage naturel.',
    examples: ['la facture PDF de janvier', 'la photo de Paul', 'le tableur du budget'],
    from: 'De',
    open: "Ouvrir l'email",
    err: 'Une erreur est survenue. Réessayez.',
  },
  en: {
    title: 'Attachments',
    subtitle: 'Describe the file you received — I will find it in your emails.',
    placeholder: 'e.g. the contract PDF from Marie',
    send: 'Search',
    searching: 'Searching…',
    intro: 'Describe an attachment you received, in plain language.',
    examples: ['the January invoice PDF', 'the photo from Paul', 'the budget spreadsheet'],
    from: 'From',
    open: 'Open email',
    err: 'Something went wrong. Try again.',
  },
  es: {
    title: 'Adjuntos',
    subtitle: 'Describe el archivo recibido — lo encuentro en tus correos.',
    placeholder: 'ej. el PDF del contrato de María',
    send: 'Buscar',
    searching: 'Buscando…',
    intro: 'Describe un archivo adjunto recibido, en lenguaje natural.',
    examples: ['la factura PDF de enero', 'la foto de Pablo', 'la hoja del presupuesto'],
    from: 'De',
    open: 'Abrir correo',
    err: 'Ocurrió un error. Inténtalo de nuevo.',
  },
  de: {
    title: 'Anhänge',
    subtitle: 'Beschreiben Sie die erhaltene Datei — ich finde sie in Ihren E-Mails.',
    placeholder: 'z. B. das Vertrags-PDF von Marie',
    send: 'Suchen',
    searching: 'Suche…',
    intro: 'Beschreiben Sie einen erhaltenen Anhang in natürlicher Sprache.',
    examples: ['die Januar-Rechnung als PDF', 'das Foto von Paul', 'die Budget-Tabelle'],
    from: 'Von',
    open: 'E-Mail öffnen',
    err: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
  },
  pt: {
    title: 'Anexos',
    subtitle: 'Descreva o ficheiro recebido — eu encontro-o nos seus emails.',
    placeholder: 'ex. o PDF do contrato da Marie',
    send: 'Procurar',
    searching: 'A procurar…',
    intro: 'Descreva um anexo recebido, em linguagem natural.',
    examples: ['a fatura PDF de janeiro', 'a foto do Paulo', 'a folha do orçamento'],
    from: 'De',
    open: 'Abrir email',
    err: 'Ocorreu um erro. Tente novamente.',
  },
  it: {
    title: 'Allegati',
    subtitle: 'Descrivi il file ricevuto — lo trovo nelle tue email.',
    placeholder: 'es. il PDF del contratto di Maria',
    send: 'Cerca',
    searching: 'Ricerca…',
    intro: 'Descrivi un allegato ricevuto, in linguaggio naturale.',
    examples: ['la fattura PDF di gennaio', 'la foto di Paolo', 'il foglio del budget'],
    from: 'Da',
    open: 'Apri email',
    err: 'Si è verificato un errore. Riprova.',
  },
  ar: {
    title: 'المرفقات',
    subtitle: 'صِف الملف الذي استلمته — وسأجده في بريدك.',
    placeholder: 'مثال: ملف PDF لعقد ماري',
    send: 'بحث',
    searching: '…جارٍ البحث',
    intro: 'صِف مرفقًا استلمته، بلغة طبيعية.',
    examples: ['فاتورة يناير PDF', 'صورة من بول', 'جدول الميزانية'],
    from: 'من',
    open: 'فتح البريد',
    err: 'حدث خطأ. حاول مرة أخرى.',
  },
};

function fmtSize(n: number | null): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function AttachmentsScreen() {
  const { locale, intl } = useI18n();
  const router = useRouter();
  const s = STR[locale] ?? STR.en;
  const dlStr = DL_LABELS[locale] ?? DL_LABELS.en;

  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [dlId, setDlId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  function fmtDate(v: string | null): string {
    if (!v) return '';
    try {
      return new Date(v).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setInput('');
    setTurns((p) => [...p, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const j = await apiPost<{ answer?: string; results?: Att[]; filters?: Filters; hasMore?: boolean }>(
        '/api/attachments/search',
        { query: q, locale },
      );
      setTurns((p) => [
        ...p,
        {
          role: 'assistant',
          text: j?.answer || '',
          results: (j?.results || []) as Att[],
          query: q,
          filters: j?.filters,
          hasMore: !!j?.hasMore,
          typeFilter: 'all',
        },
      ]);
    } catch {
      setTurns((p) => [...p, { role: 'assistant', text: s.err, results: [] }]);
    }
    setLoading(false);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  async function loadMore(index: number) {
    const turn = turns[index];
    if (!turn || turn.role !== 'assistant' || turn.loadingMore) return;
    setTurns((p) => p.map((t, i) => (i === index ? { ...t, loadingMore: true } : t)));
    try {
      const j = await apiPost<{ results?: Att[]; hasMore?: boolean }>('/api/attachments/search', {
        query: turn.query || '',
        locale,
        filters: turn.filters,
        offset: turn.results.length,
        limit: 20,
      });
      const more = (j?.results || []) as Att[];
      setTurns((p) =>
        p.map((t, i) =>
          i === index && t.role === 'assistant'
            ? { ...t, results: [...t.results, ...more], hasMore: !!j?.hasMore, loadingMore: false }
            : t,
        ),
      );
    } catch {
      setTurns((p) => p.map((t, i) => (i === index ? { ...t, loadingMore: false } : t)));
    }
  }

  function setTypeFilter(index: number, cat: string) {
    setTurns((p) => p.map((t, i) => (i === index && t.role === 'assistant' ? { ...t, typeFilter: cat } : t)));
  }

  async function download(a: Att) {
    if (dlId) return;
    setDlId(a.id);
    try {
      const uri = await apiDownloadToFile(
        `/api/attachments/download?id=${encodeURIComponent(a.id)}`,
        a.filename,
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: a.mime_type || undefined });
      }
    } catch {
      Alert.alert(dlStr.failed);
    }
    setDlId(null);
  }

  // Tap sur un résultat : aperçu (image dans l'app) sinon partage.
  async function openAtt(a: Att) {
    if (dlId) return;
    setDlId(a.id);
    try {
      const uri = await apiDownloadToFile(
        `/api/attachments/download?id=${encodeURIComponent(a.id)}`,
        a.filename,
      );
      if (isImageAtt(a.mime_type, a.filename)) {
        setPreviewMime(a.mime_type);
        setPreviewUri(uri);
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: a.mime_type || undefined });
      }
    } catch {
      Alert.alert(dlStr.failed);
    }
    setDlId(null);
  }

  async function sharePreview() {
    if (!previewUri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(previewUri, { mimeType: previewMime || undefined });
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>‹ {s.title}</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <View style={styles.intro}>
        <Text style={styles.subtitle}>{s.subtitle}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {turns.length === 0 ? (
          <View>
            <Text style={styles.introText}>{s.intro}</Text>
            <View style={styles.chips}>
              {s.examples.map((ex) => (
                <Pressable key={ex} style={styles.chip} onPress={() => ask(ex)}>
                  <Text style={styles.chipText}>{ex}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          turns.map((turn, i) =>
            turn.role === 'user' ? (
              <View key={i} style={styles.userRow}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{turn.text}</Text>
                </View>
              </View>
            ) : (
              (() => {
                const cats = CAT_LABELS[locale] || CAT_LABELS.en;
                const more = MORE_LABELS[locale] || MORE_LABELS.en;
                const present = Array.from(
                  new Set(turn.results.map((a) => mimeCategory(a.mime_type, a.filename))),
                );
                const active = turn.typeFilter || 'all';
                const shown =
                  active === 'all'
                    ? turn.results
                    : turn.results.filter((a) => mimeCategory(a.mime_type, a.filename) === active);
                return (
                  <View key={i} style={styles.assistantBlock}>
                    <Text style={styles.assistantText}>{turn.text}</Text>
                    {present.length > 1 ? (
                      <View style={styles.filterRow}>
                        {['all', ...present].map((c) => (
                          <Pressable
                            key={c}
                            style={[styles.filterChip, active === c && styles.filterChipActive]}
                            onPress={() => setTypeFilter(i, c)}
                          >
                            <Text style={[styles.filterChipText, active === c && styles.filterChipTextActive]}>
                              {cats[c] || c}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {shown.map((a) => (
                      <View key={a.id} style={styles.card}>
                        <Pressable onPress={() => openAtt(a)} disabled={dlId === a.id}>
                          <Text style={styles.cardName}>{a.filename}</Text>
                        </Pressable>
                        <Text style={styles.cardMeta}>
                          {a.sender ? `${s.from} ${a.sender}` : ''}
                          {a.sender && (a.received_at || a.size_bytes) ? ' · ' : ''}
                          {fmtDate(a.received_at)}
                          {a.size_bytes ? ` · ${fmtSize(a.size_bytes)}` : ''}
                        </Text>
                        <View style={styles.cardActions}>
                          {a.attachment_id ? (
                            <Pressable onPress={() => download(a)} disabled={dlId === a.id}>
                              {dlId === a.id ? (
                                <ActivityIndicator size="small" color={colors.terracotta} />
                              ) : (
                                <Text style={styles.cardLink}>{dlStr.download}</Text>
                              )}
                            </Pressable>
                          ) : null}
                          {a.item_id ? (
                            <Pressable onPress={() => router.push(`/email/${a.item_id}`)}>
                              <Text style={styles.cardLinkMuted}>{s.open}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ))}
                    {turn.hasMore && active === 'all' ? (
                      <Pressable
                        style={styles.moreBtn}
                        onPress={() => loadMore(i)}
                        disabled={turn.loadingMore}
                      >
                        <Text style={styles.moreBtnText}>
                          {turn.loadingMore ? more.loading : more.more}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })()
            ),
          )
        )}
        {loading ? <ActivityIndicator color={colors.terracotta} style={{ marginTop: spacing.md }} /> : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={s.placeholder}
          placeholderTextColor={colors.hint}
          onSubmitEditing={() => ask(input)}
          returnKeyType="search"
        />
        <Pressable
          style={[styles.sendBtn, (!input.trim() || loading) && styles.disabled]}
          onPress={() => ask(input)}
          disabled={!input.trim() || loading}
        >
          <Text style={styles.sendText}>{loading ? s.searching : s.send}</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      {/* Aperçu plein écran d'une image */}
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
              <Text style={styles.previewActionText}>{dlStr.share}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  safe: { backgroundColor: colors.charcoal },
  topbar: { backgroundColor: colors.charcoal, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.onDark, fontSize: 16, fontWeight: '700' },
  kav: { flex: 1 },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  previewClose: { position: 'absolute', top: 52, right: 20, zIndex: 2, padding: 8 },
  previewImg: { width: '100%', height: '100%' },
  previewBar: { position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center' },
  previewAction: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  previewActionText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },
  intro: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  subtitle: { fontSize: 13, color: colors.muted },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  introText: { fontSize: 14, color: colors.muted, marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 13, color: colors.ink2 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    maxWidth: '85%',
  },
  userText: { color: colors.onDark, fontSize: 14 },
  assistantBlock: { gap: spacing.sm },
  assistantText: { fontSize: 14, color: colors.ink },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.terracotta, backgroundColor: colors.cream },
  filterChipText: { fontSize: 12, color: colors.muted },
  filterChipTextActive: { color: colors.terracotta, fontWeight: '600' },
  moreBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginTop: spacing.xs,
  },
  moreBtnText: { fontSize: 13, color: colors.ink2, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  cardLink: { fontSize: 13, color: colors.terracotta, fontWeight: '600' },
  cardLinkMuted: { fontSize: 13, color: colors.muted, fontWeight: '500' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: 8 },
  inputBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
    backgroundColor: colors.cream,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
  sendBtn: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  sendText: { color: colors.onDark, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.5 },
});
