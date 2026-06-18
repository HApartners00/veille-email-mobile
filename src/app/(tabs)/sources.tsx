import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { apiPost } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';

export default function Sources() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(provider: 'gmail' | 'outlook') {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>('/api/connect/start', { provider });
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      setError(e?.message || 'Connexion impossible.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connecter une boîte mail</Text>
        <Text style={styles.cardText}>
          Autorisez l&apos;accès à votre boîte via la connexion officielle Google ou Microsoft. Vous
          choisirez l&apos;heure et les jours de votre rapport, puis vous reviendrez ici.
        </Text>

        <Pressable
          style={[styles.btn, styles.gmail, busy === 'gmail' && styles.btnDisabled]}
          onPress={() => connect('gmail')}
          disabled={!!busy}
        >
          {busy === 'gmail' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Connecter Gmail</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.btn, styles.outlook, busy === 'outlook' && styles.btnDisabled]}
          onPress={() => connect('outlook')}
          disabled={!!busy}
        >
          {busy === 'outlook' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Connecter Outlook</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Text style={styles.note}>
        Après avoir autorisé l&apos;accès dans le navigateur, revenez à l&apos;app. Vos prochains
        emails seront triés au prochain rapport.
      </Text>
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
  btn: { borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  gmail: { backgroundColor: '#ea4335' },
  outlook: { backgroundColor: '#0f6cbd' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, fontSize: 13 },
  note: { color: colors.hint, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing.xs },
});
