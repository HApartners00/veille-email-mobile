import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { effectivePriority, type Rule } from '@/lib/priority';
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

  async function generate(adjust: boolean) {
    setGenLoading(true);
    setMsg(null);
    try {
      const res = await apiPost<{ draft: string }>('/api/draft', {
        id,
        instructions: adjust ? instructions : undefined,
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

  const p = item ? effectivePriority(item, rules) : null;
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
                <TextInput
                  style={styles.instr}
                  value={instructions}
                  onChangeText={setInstructions}
                  placeholder="Ajuster (ex. plus court, plus formel)…"
                  placeholderTextColor={colors.hint}
                />
                <View style={styles.row}>
                  <Pressable
                    style={[styles.secondaryBtn, !instructions.trim() && styles.btnDisabled]}
                    onPress={() => generate(true)}
                    disabled={!instructions.trim()}
                  >
                    <Text style={styles.secondaryBtnText}>Ajuster</Text>
                  </Pressable>
                  <Pressable style={[styles.cta, styles.flex1]} onPress={pushToMailbox} disabled={pushing}>
                    {pushing ? (
                      <ActivityIndicator color={colors.onDark} />
                    ) : (
                      <Text style={styles.ctaText}>Mettre dans ma boîte</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : null}

            {msg ? (
              <Text style={[styles.msg, msg.type === 'ok' ? styles.msgOk : styles.msgErr]}>{msg.text}</Text>
            ) : null}
          </View>
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
});
