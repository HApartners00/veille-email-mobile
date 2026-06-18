import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, spacing } from '@/lib/theme';

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (err) {
      console.error('signInWithOtp error:', err);
      setError(err.message || JSON.stringify(err) || "Erreur d'envoi");
      return;
    }
    setStep('code');
  }

  async function verify() {
    const token = code.trim();
    if (token.length < 8) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'email',
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.root}>
      {/* Halo terracotta radial — comme le hero du site */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="18%" rx="70%" ry="42%">
              <Stop offset="0%" stopColor="#e85d0c" stopOpacity="0.13" />
              <Stop offset="55%" stopColor="#e85d0c" stopOpacity="0.03" />
              <Stop offset="100%" stopColor="#e85d0c" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#halo)" />
        </Svg>
      </View>

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.container}>
            <View style={styles.brandWrap}>
              <Text style={styles.brand}>
                <Text style={styles.brandVeille}>Veille</Text>
                <Text style={styles.brandEmail}> Email</Text>
              </Text>
              <Text style={styles.tagline}>Votre boîte mail, un jeu d&apos;enfant.</Text>
            </View>

            {step === 'email' ? (
              <View style={styles.card}>
                <Text style={styles.label}>Adresse email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="vous@exemple.com"
                  placeholderTextColor={colors.hint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="go"
                  onSubmitEditing={sendCode}
                  editable={!loading}
                />
                <Pressable
                  style={[styles.btn, (!email || loading) && styles.btnDisabled]}
                  onPress={sendCode}
                  disabled={!email || loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onDark} />
                  ) : (
                    <Text style={styles.btnText}>Recevoir mon code</Text>
                  )}
                </Pressable>
                <Text style={styles.hint}>
                  On vous envoie un code par email — pas de mot de passe à retenir.
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.label}>Code reçu par email</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="00000000"
                  placeholderTextColor={colors.hint}
                  keyboardType="number-pad"
                  returnKeyType="go"
                  onSubmitEditing={verify}
                  editable={!loading}
                  autoFocus
                />
                <Pressable
                  style={[styles.btn, (code.length < 8 || loading) && styles.btnDisabled]}
                  onPress={verify}
                  disabled={code.length < 8 || loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onDark} />
                  ) : (
                    <Text style={styles.btnText}>Se connecter</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                  }}
                >
                  <Text style={styles.linkText}>Changer d&apos;email</Text>
                </Pressable>
                <Text style={styles.hint}>Code envoyé à {email.trim().toLowerCase()}.</Text>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.charcoal },
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  brandWrap: { alignItems: 'center', marginBottom: spacing.xxl },
  brand: { fontSize: 40 },
  brandVeille: { fontFamily: fonts.serif, color: colors.onDark },
  brandEmail: { fontFamily: fonts.serifItalic, color: colors.terracottaVivid },
  tagline: { color: colors.onDarkMuted, fontSize: 14, marginTop: spacing.xs },
  card: {
    backgroundColor: '#34302a',
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.onDark },
  input: {
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.onDark,
    backgroundColor: colors.charcoal,
  },
  codeInput: { fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '600' },
  btn: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: colors.onDark, fontWeight: '700', fontSize: 15 },
  linkText: { color: colors.terracottaLight, textAlign: 'center', fontSize: 14 },
  hint: { color: colors.onDarkMuted, fontSize: 12, textAlign: 'center' },
  error: { color: '#ff9b6b', fontSize: 13, textAlign: 'center', marginTop: spacing.md },
});
