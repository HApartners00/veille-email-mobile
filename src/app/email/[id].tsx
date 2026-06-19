import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import {
  effectivePriority,
  PRIORITIES,
  PRIORITY_KEYS,
  domainOf,
  extractEmail,
  type Rule,
} from '@/lib/priority';
import { colors, radius, spacing } from '@/lib/theme';

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

// Reformulations rapides du brouillon (identiques au web).
const QUICK_REFINEMENTS: { label: string; instruction: string }[] = [
  { label: 'Plus professionnel', instruction: 'Rends le ton plus professionnel et formel.' },
  { label: 'Plus court', instruction: "Raccourcis nettement le message, va à l'essentiel." },
  { label: 'Plus chaleureux', instruction: 'Rends le ton plus chaleureux et cordial.' },
  { label: 'Plus direct', instruction: 'Sois plus direct et factuel, sans fioritures.' },
];

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
  t = t.replace(/<\/(p|div|tr|h[1-6]|li|ul|ol|table)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeEntities(t); // 2e passe (double encodage éventuel)
  return t.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export default function EmailDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // Résumé IA (généré à la demande, comme le digest)
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Brouillon
  const [draft, setDraft] = useState('');
  const [instructions, setInstructions] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

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
      const [itemRes, rulesRes] = await Promise.all([
        supabase.from('items').select('*').eq('id', id).single(),
        supabase.from('classification_rules').select('match_type, match_value, category'),
      ]);
      if (itemRes.data) setItem(itemRes.data as Item);
      setRules((rulesRes.data ?? []) as Rule[]);
      setLoading(false);
      if (itemRes.data && (itemRes.data as Item).status === 'unread') {
        await supabase
          .from('items')
          .update({ status: 'read', read_at: new Date().toISOString() })
          .eq('id', id);
      }
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      setSummaryLoading(true);
      try {
        const r = await apiPost<{ summary: string }>('/api/summary', { id });
        setSummary(r.summary);
      } catch {
        setSummary('');
      } finally {
        setSummaryLoading(false);
      }
    })();
  }, [id]);

  async function generate(adjust: boolean, explicitInstruction?: string) {
    const instr = explicitInstruction ?? instructions;
    setGenLoading(true);
    setMsg(null);
    try {
      const res = await apiPost<{ draft: string }>('/api/draft', {
        id,
        instructions: adjust ? instr : undefined,
        previousDraft: adjust ? draft : undefined,
      });
      setDraft(res.draft);
      setInstructions('');
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'Échec de la génération.' });
    } finally {
      setGenLoading(false);
    }
  }

  async function pushToMailbox() {
    if (!draft.trim()) return;
    setPushing(true);
    setMsg(null);
    try {
      await apiPost('/api/push-to-mailbox', { id, draft });
      setMsg({ type: 'ok', text: 'Brouillon créé dans votre messagerie ✓' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || "Échec de l'envoi en boîte." });
    } finally {
      setPushing(false);
    }
  }

  async function sendReply() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setMsg(null);
    try {
      await apiPost('/api/send-reply', { id, draft });
      setSent(true);
    } catch (e: any) {
      setShowConfirm(false);
      setMsg({ type: 'err', text: e?.message || "Échec de l'envoi." });
    } finally {
      setSending(false);
    }
  }

  const catLabel = (k: string) => PRIORITIES.find((p) => p.key === k)?.label ?? k;

  // Reclasser uniquement cet email : on réécrit ses tags de priorité.
  async function applyThisEmail(cat: string) {
    if (reBusy || !item) return;
    setReBusy(true);
    setReError(null);
    const base = (item.tags || []).filter((t) => !PRIORITY_KEYS.includes((t || '').toLowerCase()));
    const nextTags = [...base, cat];
    const { error: e } = await supabase.from('items').update({ tags: nextTags }).eq('id', id);
    setReBusy(false);
    if (e) {
      setReError(e.message);
      return;
    }
    setItem({ ...item, tags: nextTags });
    setPendingCat(null);
    setKeyword('');
    setReNote('Cet email a été reclassé.');
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
      setReError('Non authentifié.');
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
        ? `les emails de ${v}`
        : type === 'domain'
          ? `le domaine @${v}`
          : `les sujets contenant « ${v} »`;
    setPendingCat(null);
    setKeyword('');
    setReNote(`Règle créée : ${label} → ${catLabel(cat)}.`);
  }

  const p = item ? effectivePriority(item, rules) : null;
  const senderEmail = item ? extractEmail(item.author) : '';
  const senderDomain = item ? domainOf(item.author) : '';
  // Corps complet nettoyé ; si le nettoyage laisse des balises (HTML récalcitrant),
  // on retombe sur l'aperçu propre extrait par le pipeline.
  let body = htmlToText(item?.content || item?.body || '');
  if (!body || body.includes('<')) {
    body = htmlToText(item?.preview || '');
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topbar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹ Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.terracotta} />
        </View>
      ) : !item ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Email introuvable.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
        >
          {p ? <Text style={[styles.prio, { color: p.color }]}>{p.label.toUpperCase()}</Text> : null}
          <Text style={styles.subject}>{item.title || '(Sans objet)'}</Text>
          <Text style={styles.meta}>{item.author ?? 'Expéditeur inconnu'}</Text>
          <Text style={styles.metaDate}>
            {new Date(item.received_at).toLocaleString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>

          {/* Reclassement : changer la catégorie / créer une règle */}
          <View style={styles.reclassify}>
            <Text style={styles.reLabel}>Catégorie</Text>
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
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {pendingCat ? (
              <View style={styles.reBox}>
                <View style={styles.reBoxTop}>
                  <Text style={styles.reBoxTitle}>
                    Classer comme <Text style={{ fontWeight: '700' }}>{catLabel(pendingCat)}</Text> —
                    appliquer à :
                  </Text>
                  <Pressable
                    onPress={() => {
                      setPendingCat(null);
                      setKeyword('');
                    }}
                  >
                    <Text style={styles.reCancel}>Annuler</Text>
                  </Pressable>
                </View>
                <View style={styles.chipsWrap}>
                  <Pressable
                    style={styles.targetChip}
                    disabled={reBusy}
                    onPress={() => applyThisEmail(pendingCat)}
                  >
                    <Text style={styles.targetChipText}>Cet email seulement</Text>
                  </Pressable>
                  {senderEmail ? (
                    <Pressable
                      style={styles.targetChip}
                      disabled={reBusy}
                      onPress={() => applyRule('sender', senderEmail, pendingCat)}
                    >
                      <Text style={styles.targetChipText}>Tous les emails de {senderEmail}</Text>
                    </Pressable>
                  ) : null}
                  {senderDomain ? (
                    <Pressable
                      style={styles.targetChip}
                      disabled={reBusy}
                      onPress={() => applyRule('domain', senderDomain, pendingCat)}
                    >
                      <Text style={styles.targetChipText}>Le domaine @{senderDomain}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.kwRow}>
                  <TextInput
                    style={styles.kwInput}
                    value={keyword}
                    onChangeText={setKeyword}
                    placeholder="…ou sujets contenant ce mot-clé"
                    placeholderTextColor={colors.hint}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={[styles.kwBtn, (reBusy || !keyword.trim()) && styles.btnDisabled]}
                    disabled={reBusy || !keyword.trim()}
                    onPress={() => applyRule('keyword', keyword, pendingCat)}
                  >
                    <Text style={styles.kwBtnText}>Créer</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {reNote ? <Text style={styles.reNote}>{reNote}</Text> : null}
            {reError ? <Text style={styles.reErr}>{reError}</Text> : null}
          </View>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Résumé</Text>
          {summaryLoading ? (
            <View style={styles.genLoading}>
              <ActivityIndicator color={colors.terracotta} />
              <Text style={styles.genLoadingText}>L&apos;IA résume…</Text>
            </View>
          ) : (
            <Text style={styles.content}>{summary || body || 'Pas d’aperçu disponible.'}</Text>
          )}

          {item.url ? (
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(item.url as string)}>
              <Text style={styles.linkBtnText}>Ouvrir dans la messagerie →</Text>
            </Pressable>
          ) : null}

          {/* Brouillon IA */}
          <View style={styles.draftSection}>
            <Text style={styles.draftTitle}>Brouillon de réponse</Text>

            {!draft && !genLoading ? (
              <Pressable style={styles.cta} onPress={() => generate(false)}>
                <Text style={styles.ctaText}>Générer un brouillon</Text>
              </Pressable>
            ) : null}

            {genLoading ? (
              <View style={styles.genLoading}>
                <ActivityIndicator color={colors.terracotta} />
                <Text style={styles.genLoadingText}>L&apos;IA rédige…</Text>
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

                {/* Reformulations rapides */}
                <Text style={styles.refineLabel}>Ajuster :</Text>
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
                  placeholder="…ou une consigne libre (ex. propose 9h, ajoute mon numéro)"
                  placeholderTextColor={colors.hint}
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.secondaryBtn, !instructions.trim() && styles.btnDisabled]}
                    onPress={() => generate(true)}
                    disabled={!instructions.trim()}
                  >
                    <Text style={styles.secondaryBtnText}>Reformuler</Text>
                  </Pressable>
                  <Pressable style={[styles.cta, styles.flex1]} onPress={pushToMailbox} disabled={pushing}>
                    {pushing ? (
                      <ActivityIndicator color={colors.onDark} />
                    ) : (
                      <Text style={styles.ctaText}>Mettre dans ma boîte</Text>
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
                  <Text style={styles.sendBtnText}>Envoyer directement →</Text>
                </Pressable>
              </>
            ) : null}

            {msg ? (
              <Text style={[styles.msg, msg.type === 'ok' ? styles.msgOk : styles.msgErr]}>{msg.text}</Text>
            ) : null}
          </View>

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
                    <Text style={styles.modalTitle}>✓ Réponse envoyée</Text>
                    <Text style={styles.modalSub}>
                      Votre réponse a bien été envoyée dans le fil d&apos;origine.
                    </Text>
                    <Pressable
                      style={styles.cta}
                      onPress={() => {
                        setShowConfirm(false);
                        router.back();
                      }}
                    >
                      <Text style={styles.ctaText}>Fermer</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.modalTitle}>Envoyer cette réponse ?</Text>
                    <Text style={styles.modalSub}>
                      Elle partira directement depuis votre messagerie, dans le fil d&apos;origine.
                    </Text>
                    <ScrollView style={styles.modalPreview}>
                      <Text style={styles.modalPreviewText}>{draft}</Text>
                    </ScrollView>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.secondaryBtn, styles.flex1]}
                        onPress={() => setShowConfirm(false)}
                        disabled={sending}
                      >
                        <Text style={styles.secondaryBtnText}>Annuler</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.cta, styles.flex1]}
                        onPress={sendReply}
                        disabled={sending}
                      >
                        {sending ? (
                          <ActivityIndicator color={colors.onDark} />
                        ) : (
                          <Text style={styles.ctaText}>Confirmer l&apos;envoi</Text>
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
  topbar: { backgroundColor: colors.charcoal, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { color: colors.onDark, fontSize: 16, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.muted, fontSize: 15 },
  body: { flex: 1 },
  bodyContent: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  prio: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: spacing.sm },
  subject: { fontSize: 22, fontWeight: '700', color: colors.ink, lineHeight: 28 },
  meta: { fontSize: 14, color: colors.ink2, marginTop: spacing.md },
  metaDate: { fontSize: 12, color: colors.hint, marginTop: 2, textTransform: 'capitalize' },

  // Reclassement
  reclassify: { marginTop: spacing.lg },
  reLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  catChipText: { fontSize: 12, fontWeight: '600' },
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
  reBoxTitle: { flex: 1, fontSize: 13, color: colors.ink2, lineHeight: 18 },
  reCancel: { fontSize: 12, color: colors.muted },
  targetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.cream,
  },
  targetChipText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  kwRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  kwInput: {
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
  kwBtnText: { color: colors.cream, fontWeight: '600', fontSize: 13 },
  reNote: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  reErr: { fontSize: 12, color: colors.danger, marginTop: spacing.xs },

  divider: { height: 1, backgroundColor: colors.cardline, marginVertical: spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.terracotta,
    marginBottom: spacing.sm,
  },
  content: { fontSize: 15, color: colors.ink2, lineHeight: 24 },
  linkBtn: { marginTop: spacing.lg },
  linkBtnText: { color: colors.terracotta, fontWeight: '600', fontSize: 14 },

  draftSection: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
    gap: spacing.md,
  },
  draftTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  genLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  genLoadingText: { color: colors.muted, fontSize: 14 },
  draftInput: {
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
  refineLabel: { fontSize: 12, color: colors.muted },
  refineChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.surface,
  },
  refineChipText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
  instr: {
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
  ctaText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderColor: colors.terracotta,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: colors.terracotta, fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.4 },
  msg: { fontSize: 13, marginTop: spacing.sm },
  msgOk: { color: colors.sage },
  msgErr: { color: colors.danger },

  sendBtn: {
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: colors.cream, fontWeight: '700', fontSize: 15 },

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
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  modalSub: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  modalPreview: {
    maxHeight: 220,
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  modalPreviewText: { fontSize: 14, color: colors.ink2, lineHeight: 21 },
});
