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
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useI18n } from '@/context/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, spacing } from '@/lib/theme';

// ─── PARCOURS D'ESSAI — 17/09/2026 ─────────────────────────────────────────
// Avant : une adresse sans compte tombait sur « Aucun compte Vmail pour cette
// adresse » et rien d'autre — un mur pour qui venait de telecharger l'app.
// Decision de HA : l'app ouvre la page web /essai dans une fenetre Safari. La
// page fait CONNECTER LA BOITE OUTLOOK — la meme inscription que le site : le
// compte est cree a partir de l'adresse que Microsoft confirme, essai compris.
// La page de succes n8n renvoie ensuite vers
// `veilleemailmobile://connected?email=<adresse du compte>` ; on envoie alors
// le code a CETTE adresse (elle peut differer de celle tapee) et on passe a la
// saisie du code.
//
// Aucun code n'a ete envoye avant ce moment (le lien de connexion du web est
// fabrique sans email), donc la limite Supabase d'un envoi par minute ne gene pas.
//
// ⚠️ RISQUE APPLE ASSUME PAR HA le 17/09/2026 — voir la note de /essai
// (apps/web/src/app/essai/page.tsx) et App-Store-Connect-notes.md.
//
// `preferEphemeralSession` : la fenetre ne reprend pas une session web deja
// ouverte dans Safari, donc elle n'affiche jamais le tableau de bord (et son
// bandeau d'abonnement) a l'interieur de l'app.
const PAGE_ESSAI = 'https://app.veille-email.fr/essai';
// Meme adresse de retour que l'ecran Sources (sources.tsx).
const RETOUR_CONNEXION = 'veilleemailmobile://connected';

function adresseDuRetour(url: string): string | null {
  const m = /[?&]email=([^&#]*)/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1] || '').trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export default function Login() {
  const router = useRouter();
  const { t, f, locale } = useI18n();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Adresse sans compte : on garde le bouton visible si l'utilisateur a ferme
  // la fenetre sans aller au bout.
  const [sansCompte, setSansCompte] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function ouvrirEssai(adresseTapee: string) {
    setError(null);
    const url = `${PAGE_ESSAI}?from=app&lang=${encodeURIComponent(locale)}`;
    let res: WebBrowser.WebBrowserAuthSessionResult;
    try {
      res = await WebBrowser.openAuthSessionAsync(url, RETOUR_CONNEXION, {
        preferEphemeralSession: true,
      });
    } catch (e) {
      console.error('openAuthSessionAsync /essai en echec:', e);
      setSansCompte(true);
      setError(t.login.trialOpenFailed);
      return;
    }
    if (res.type !== 'success') {
      // Fenetre fermee sans connecter de boite : on reste ici, bouton visible.
      setSansCompte(true);
      setError(t.login.noAccountTrial);
      return;
    }
    // Le compte porte l'adresse de la BOITE connectee, pas forcement celle tapee.
    const adresse = adresseDuRetour(res.url) || adresseTapee;
    setEmail(adresse);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) {
      // On ne masque rien : la boite est connectee mais le code n'est pas parti.
      console.error('signInWithOtp apres inscription en echec:', err);
      setSansCompte(false);
      setError(`${t.login.errSend} : ${err.message}`);
      return;
    }
    setCode('');
    setError(null);
    setSansCompte(false);
    setInfo(t.login.accountCreated);
    setStep('code');
  }

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    setSansCompte(false);
    // 🔴 shouldCreateUser: false — 27/08/2026.
    // Avant, l'app iOS CREAIT le compte et demarrait l'essai gratuit. Apple a refuse
    // le build 21 le 27/08 (regles 3.1.1 et 3.1.3(c)) : un service payant vendu a des
    // particuliers doit passer par l'achat integre. L'app devient donc une app de
    // CONNEXION pour des clients qui ont deja un compte ; la creation de compte se
    // fait sur le web. Ne pas remettre `true` sans avoir ajoute l'achat integre.
    const { error: err } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (err) {
      console.error('signInWithOtp error:', err);
      // Supabase repond « Signups not allowed for otp » quand l'adresse n'a pas de
      // compte. C'est le cas NORMAL ici, pas une panne : on dit ou creer le compte
      // plutot que d'afficher un message technique en anglais.
      const brut = `${err.message || ''} ${(err as any)?.code || ''}`.toLowerCase();
      const inconnu =
        brut.includes('signups not allowed') ||
        brut.includes('otp_disabled') ||
        brut.includes('user not found');
      if (inconnu) {
        // Adresse sans compte : on ouvre directement la page d'essai.
        await ouvrirEssai(clean);
        return;
      }
      setError(err.message || JSON.stringify(err) || t.login.errSend);
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
    router.replace('/(tabs)/accueil');
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
                <Text style={styles.brandVeille}>V</Text>
                <Text style={styles.brandEmail}>mail</Text>
              </Text>
              <Text style={styles.tagline}>{t.login.tagline}</Text>
            </View>

            {step === 'email' ? (
              <View style={styles.card}>
                <Text style={styles.label}>{t.login.emailLabel}</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t.login.emailPlaceholder}
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
                    <Text style={styles.btnText}>{t.login.getCode}</Text>
                  )}
                </Pressable>
                {sansCompte ? (
                  <Pressable
                    style={[styles.btnSecondary, loading && styles.btnDisabled]}
                    onPress={() => ouvrirEssai(email.trim().toLowerCase())}
                    disabled={loading}
                  >
                    <Text style={styles.btnSecondaryText}>{t.login.createAccount}</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.hint}>{t.login.emailHint}</Text>
                {/* 03/09/2026 — la phrase « Votre compte se cree sur veille-email.fr »
                    est RETIREE. Guideline 3.1.3(f) : « no calls to action for purchase
                    outside of the app ». Elle nommait un domaine ou l'on souscrit un
                    service payant. Ne pas la remettre sans avoir tranche avec Apple. */}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.label}>{t.login.codeLabel}</Text>
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
                    <Text style={styles.btnText}>{t.login.signIn}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStep('email');
                    setCode('');
                    setError(null);
                    setInfo(null);
                  }}
                >
                  <Text style={styles.linkText}>{t.login.changeEmail}</Text>
                </Pressable>
                {info ? <Text style={styles.info}>{info}</Text> : null}
                <Text style={styles.hint}>
                  {f(t.login.codeSentTo, { email: email.trim().toLowerCase() })}
                </Text>
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
  brand: { fontFamily: fonts.sans, fontSize: 40 },
  brandVeille: { fontFamily: fonts.serif, color: colors.onDark },
  brandEmail: { fontFamily: fonts.serifItalic, color: colors.terracottaVivid },
  tagline: { fontFamily: fonts.sans, color: colors.onDarkMuted, fontSize: 14, marginTop: spacing.xs },
  card: {
    backgroundColor: '#34302a',
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  label: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.onDark },
  input: {
    fontFamily: fonts.sans,
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.onDark,
    backgroundColor: colors.charcoal,
  },
  codeInput: { fontFamily: fonts.sansSemibold, fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  btn: {
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnSecondary: {
    borderColor: colors.terracottaVivid,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { fontFamily: fonts.sansBold, color: colors.terracottaLight, fontSize: 15 },
  info: { fontFamily: fonts.sansSemibold, color: colors.onDark, fontSize: 13, textAlign: 'center' },
  btnText: { fontFamily: fonts.sansBold, color: colors.onDark, fontSize: 15 },
  linkText: { fontFamily: fonts.sans, color: colors.terracottaLight, textAlign: 'center', fontSize: 14 },
  hint: { fontFamily: fonts.sans, color: colors.onDarkMuted, fontSize: 12, textAlign: 'center' },
  error: { fontFamily: fonts.sans, color: '#ff9b6b', fontSize: 13, textAlign: 'center', marginTop: spacing.md },
});
