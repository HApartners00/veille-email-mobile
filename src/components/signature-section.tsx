import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/context/i18n';
import { apiGet, apiPost } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';

type Mailbox = { email: string; provider: string };
type Sig = { mailbox_email: string; signature_text: string | null; enabled: boolean };

// i18n locale (pas de clés ajoutées au dictionnaire global — comme PERSO_STR).
const STR: Record<
  string,
  {
    title: string;
    subtitle: string;
    importBtn: string;
    importing: string;
    enabled: string;
    placeholder: string;
    save: string;
    saving: string;
    saved: string;
    err: string;
    none: string;
    connect: string;
  }
> = {
  fr: {
    title: 'Signature de fin de mail',
    subtitle: 'Ajoutée automatiquement au bas de vos brouillons de réponse.',
    importBtn: 'Importer du fournisseur',
    importing: 'Import…',
    enabled: 'Activée',
    placeholder: 'Votre nom, votre poste, vos coordonnées…',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Signature enregistrée.',
    err: 'Erreur réseau.',
    none: 'Aucune signature trouvée côté fournisseur.',
    connect: "Connectez d'abord une boîte mail.",
  },
  en: {
    title: 'Email signature',
    subtitle: 'Automatically added at the bottom of your reply drafts.',
    importBtn: 'Import from provider',
    importing: 'Importing…',
    enabled: 'Enabled',
    placeholder: 'Your name, title, contact details…',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Signature saved.',
    err: 'Network error.',
    none: 'No signature found on the provider side.',
    connect: 'Connect a mailbox first.',
  },
  es: {
    title: 'Firma de correo',
    subtitle: 'Se añade automáticamente al final de tus borradores de respuesta.',
    importBtn: 'Importar del proveedor',
    importing: 'Importando…',
    enabled: 'Activada',
    placeholder: 'Tu nombre, cargo, datos de contacto…',
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Firma guardada.',
    err: 'Error de red.',
    none: 'No se encontró ninguna firma en el proveedor.',
    connect: 'Conecta primero un buzón.',
  },
  de: {
    title: 'E-Mail-Signatur',
    subtitle: 'Wird automatisch unten an Ihre Antwortentwürfe angehängt.',
    importBtn: 'Vom Anbieter importieren',
    importing: 'Import…',
    enabled: 'Aktiv',
    placeholder: 'Ihr Name, Position, Kontaktdaten…',
    save: 'Speichern',
    saving: 'Speichern…',
    saved: 'Signatur gespeichert.',
    err: 'Netzwerkfehler.',
    none: 'Keine Signatur beim Anbieter gefunden.',
    connect: 'Verbinden Sie zuerst ein Postfach.',
  },
  pt: {
    title: 'Assinatura de e-mail',
    subtitle: 'Adicionada automaticamente no fim dos seus rascunhos de resposta.',
    importBtn: 'Importar do fornecedor',
    importing: 'A importar…',
    enabled: 'Ativada',
    placeholder: 'O seu nome, cargo, contactos…',
    save: 'Guardar',
    saving: 'A guardar…',
    saved: 'Assinatura guardada.',
    err: 'Erro de rede.',
    none: 'Nenhuma assinatura encontrada no fornecedor.',
    connect: 'Ligue primeiro uma caixa de correio.',
  },
  it: {
    title: 'Firma email',
    subtitle: 'Aggiunta automaticamente in fondo alle tue bozze di risposta.',
    importBtn: 'Importa dal provider',
    importing: 'Importazione…',
    enabled: 'Attiva',
    placeholder: 'Il tuo nome, ruolo, recapiti…',
    save: 'Salva',
    saving: 'Salvataggio…',
    saved: 'Firma salvata.',
    err: 'Errore di rete.',
    none: 'Nessuna firma trovata sul provider.',
    connect: 'Collega prima una casella.',
  },
  ar: {
    title: 'توقيع البريد',
    subtitle: 'يُضاف تلقائيًا أسفل مسودات ردّك.',
    importBtn: 'استيراد من المزوّد',
    importing: '…جارٍ الاستيراد',
    enabled: 'مُفعّل',
    placeholder: '…اسمك، منصبك، بيانات التواصل',
    save: 'حفظ',
    saving: '…جارٍ الحفظ',
    saved: 'تم حفظ التوقيع.',
    err: 'خطأ في الشبكة.',
    none: 'لم يُعثر على توقيع لدى المزوّد.',
    connect: 'اربط صندوق بريد أولاً.',
  },
};

export function SignatureSection() {
  const { locale } = useI18n();
  const s = STR[locale] ?? STR.en;

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    try {
      const [mb, sg] = await Promise.all([
        apiGet<{ mailboxes: Mailbox[] }>('/api/connect/list').catch(() => ({ mailboxes: [] })),
        apiGet<{ signatures: Sig[] }>('/api/signature').catch(() => ({ signatures: [] })),
      ]);
      const sigMap: Record<string, Sig> = {};
      for (const x of sg.signatures || []) sigMap[(x.mailbox_email || '').toLowerCase()] = x;
      const d: Record<string, string> = {};
      const e: Record<string, boolean> = {};
      for (const m of mb.mailboxes || []) {
        const k = (m.email || '').toLowerCase();
        d[k] = sigMap[k]?.signature_text || '';
        e[k] = sigMap[k]?.enabled ?? true;
      }
      setMailboxes(mb.mailboxes || []);
      setDrafts(d);
      setEnabled(e);
    } catch {
      // best-effort
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(m: Mailbox) {
    const k = (m.email || '').toLowerCase();
    setSavingKey(k);
    setMessage(null);
    try {
      await apiPost('/api/signature', {
        mailbox_email: m.email,
        provider: m.provider,
        signature_text: drafts[k] || '',
        enabled: enabled[k] !== false,
      });
      setMessage(s.saved);
    } catch {
      setMessage(s.err);
    }
    setSavingKey(null);
  }

  async function importSigs() {
    setImporting(true);
    setMessage(null);
    try {
      const r = await apiPost<{ imported?: number }>('/api/signature/import', {});
      setMessage(r?.imported ? `${s.saved} (${r.imported})` : s.none);
      await load();
    } catch {
      setMessage(s.none);
    }
    setImporting(false);
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{s.title}</Text>
        <Pressable
          style={[styles.importBtn, (importing || mailboxes.length === 0) && styles.disabled]}
          disabled={importing || mailboxes.length === 0}
          onPress={importSigs}
        >
          <Text style={styles.importText}>{importing ? s.importing : s.importBtn}</Text>
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{s.subtitle}</Text>

      {loading ? (
        <ActivityIndicator color={colors.terracotta} style={{ marginTop: spacing.md }} />
      ) : mailboxes.length === 0 ? (
        <Text style={styles.hint}>{s.connect}</Text>
      ) : (
        mailboxes.map((m) => {
          const k = (m.email || '').toLowerCase();
          return (
            <View key={k} style={styles.box}>
              <View style={styles.boxHead}>
                <Text style={styles.email} numberOfLines={1}>
                  {m.email}
                </Text>
                <View style={styles.enableRow}>
                  <Text style={styles.enableLabel}>{s.enabled}</Text>
                  <Switch
                    value={enabled[k] !== false}
                    onValueChange={(v) => setEnabled((p) => ({ ...p, [k]: v }))}
                    trackColor={{ true: colors.terracotta, false: colors.cardline }}
                  />
                </View>
              </View>
              <TextInput
                value={drafts[k] ?? ''}
                onChangeText={(v) => setDrafts((p) => ({ ...p, [k]: v }))}
                placeholder={s.placeholder}
                placeholderTextColor={colors.hint}
                multiline
                style={styles.input}
              />
              <Pressable
                style={[styles.saveBtn, savingKey === k && styles.disabled]}
                disabled={savingKey === k}
                onPress={() => save(m)}
              >
                <Text style={styles.saveText}>{savingKey === k ? s.saving : s.save}</Text>
              </Pressable>
            </View>
          );
        })
      )}

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },
  hint: { fontSize: 13, color: colors.hint, marginTop: spacing.md },
  importBtn: {
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  importText: { fontSize: 12, fontWeight: '600', color: colors.ink },
  box: { marginTop: spacing.lg },
  boxHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  email: { fontSize: 13, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  enableLabel: { fontSize: 12, color: colors.muted },
  input: {
    marginTop: spacing.sm,
    minHeight: 88,
    textAlignVertical: 'top',
    backgroundColor: colors.cream,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  saveBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.terracotta,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  saveText: { color: colors.cream, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.5 },
  message: { fontSize: 13, color: colors.muted, marginTop: spacing.md },
});

export default SignatureSection;
