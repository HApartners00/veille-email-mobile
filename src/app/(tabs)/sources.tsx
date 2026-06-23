import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { useI18n } from '@/context/i18n';
import { apiGet, apiPost } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';
import { GMAIL_ENABLED } from '@/lib/flags';

type Mailbox = {
  email: string;
  provider: 'gmail' | 'outlook';
  label: string;
};

export default function Sources() {
  const { t, f } = useI18n();
  const providers = GMAIL_ENABLED ? t.sources.provBoth : t.sources.provOutlook;
  const authProviders = GMAIL_ENABLED ? t.sources.authBoth : t.sources.authOutlook;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  // clé d'identité d'une boîte = son adresse email

  const loadMailboxes = useCallback(async () => {
    try {
      const { mailboxes } = await apiGet<{ mailboxes: Mailbox[] }>('/api/connect/list');
      setMailboxes(mailboxes || []);
    } catch {
      // liste indisponible : on n'affiche pas d'erreur bloquante, la connexion reste possible
      setMailboxes([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Recharge à chaque fois que l'écran reprend le focus (ex. retour du navigateur OAuth).
  useFocusEffect(
    useCallback(() => {
      setLoadingList(true);
      loadMailboxes();
    }, [loadMailboxes]),
  );

  async function connect(provider: 'gmail' | 'outlook') {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>('/api/connect/start', { provider });
      await WebBrowser.openBrowserAsync(url);
      // au retour, useFocusEffect rechargera la liste
    } catch (e: any) {
      setError(e?.message || t.sources.connectErr);
    } finally {
      setBusy(null);
    }
  }

  function confirmDisconnect(mb: Mailbox) {
    Alert.alert(
      t.sources.disconnectTitle,
      f(t.sources.disconnectMsg, { email: mb.email }),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.sources.disconnect,
          style: 'destructive',
          onPress: () => disconnect(mb),
        },
      ],
    );
  }

  async function disconnect(mb: Mailbox) {
    setDisconnecting(mb.email);
    setError(null);
    try {
      await apiPost('/api/connect/disconnect', { email: mb.email });
      setMailboxes((prev) => prev.filter((m) => m.email !== mb.email));
    } catch (e: any) {
      setError(e?.message || t.sources.disconnectErr);
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Boîtes connectées */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.sources.connectedTitle}</Text>

        {loadingList ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color={colors.terracotta} />
          </View>
        ) : mailboxes.length === 0 ? (
          <Text style={styles.cardText}>
            {f(t.sources.noneConnected, { providers })}
          </Text>
        ) : (
          mailboxes.map((mb) => (
            <View key={mb.email} style={styles.mbRow}>
              <View style={[styles.dot, mb.provider === 'gmail' ? styles.dotGmail : styles.dotOutlook]} />
              <View style={styles.mbInfo}>
                <Text style={styles.mbLabel} numberOfLines={1}>
                  {mb.email}
                </Text>
                <Text style={styles.mbEmail}>{mb.label}</Text>
              </View>
              {disconnecting === mb.email ? (
                <ActivityIndicator color={colors.danger} style={styles.mbAction} />
              ) : (
                <Pressable
                  style={styles.mbAction}
                  onPress={() => confirmDisconnect(mb)}
                  disabled={!!disconnecting}
                  hitSlop={8}
                >
                  <Text style={styles.mbActionText}>{t.sources.disconnect}</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      {/* Connexion d'une nouvelle boîte */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.sources.connectTitle}</Text>
        <Text style={styles.cardText}>{f(t.sources.connectBody, { auth: authProviders })}</Text>

        {/* Bouton Gmail masqué au lancement (flag GMAIL_ENABLED). Réversible : voir src/lib/flags.ts. */}
        {GMAIL_ENABLED ? (
          <Pressable
            style={[styles.btn, styles.gmail, busy === 'gmail' && styles.btnDisabled]}
            onPress={() => connect('gmail')}
            disabled={!!busy}
          >
            {busy === 'gmail' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>{t.sources.connectGmail}</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.btn, styles.outlook, busy === 'outlook' && styles.btnDisabled]}
          onPress={() => connect('outlook')}
          disabled={!!busy}
        >
          {busy === 'outlook' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{t.sources.connectOutlook}</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.note}>{t.sources.note}</Text>
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
    gap: spacing.md,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  cardText: { color: colors.ink2, fontSize: 14, lineHeight: 22 },
  listLoading: { paddingVertical: spacing.md, alignItems: 'flex-start' },

  // Lignes de boîtes connectées
  mbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md },
  dotGmail: { backgroundColor: '#ea4335' },
  dotOutlook: { backgroundColor: '#0f6cbd' },
  mbInfo: { flex: 1 },
  mbLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  mbEmail: { fontSize: 13, color: colors.muted, marginTop: 1 },
  mbAction: { paddingVertical: 4, paddingHorizontal: 4 },
  mbActionText: { color: colors.danger, fontSize: 14, fontWeight: '600' },

  btn: { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  gmail: { backgroundColor: '#ea4335' },
  outlook: { backgroundColor: '#0f6cbd' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, fontSize: 13 },
  note: { color: colors.hint, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.xs },
});
