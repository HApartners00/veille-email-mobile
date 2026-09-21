import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import { apiPost } from '@/lib/api';
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
// ⚠️ RISQUE APPLE ASSUME PAR HA le 17/09/2026 — voir la note de /essai
// (apps/web/src/app/essai/page.tsx) et App-Store-Connect-notes.md.
//
// `preferEphemeralSession` : la fenetre ne reprend pas une session web deja
// ouverte dans Safari, donc elle n'affiche jamais le tableau de bord (et son
// bandeau d'abonnement) a l'interieur de l'app.
const PAGE_ESSAI = 'https://app.veille-email.fr/essai';
// Meme adresse de retour que l'ecran Sources (sources.tsx).
const RETOUR_CONNEXION = 'veilleemailmobile://connected';

// ─── LE 429 N'EST PLUS MUET — 21/09/2026 ────────────────────────────────────
//
// CE QUI A ETE MESURE (journaux d'authentification Supabase, 20/09 22h15) :
//   22:15:45  POST /admin/generate_link   200   <- la page web /essai
//   22:15:47  POST /otp                   429   « after 58 seconds »
//   22:15:51  POST /otp                   429   « after 54 seconds »
//   22:15:57  POST /otp                   429   « after 48 seconds »
//   22:16:01  POST /otp                   429   « after 44 seconds »
//   22:17:01  POST /otp                   200
//
// ⚠️ LE COMMENTAIRE QUI ETAIT ICI DISAIT LE CONTRAIRE, ET IL AVAIT TORT.
// Il affirmait : « Aucun code n'a ete envoye avant ce moment (le lien de
// connexion du web est fabrique sans email), donc la limite Supabase d'un envoi
// par minute ne gene pas. » La mesure dit l'inverse : `admin.generateLink()`
// n'envoie effectivement AUCUN email, mais il CONSOMME quand meme la fenetre de
// 60 secondes par adresse. Le 429 qui suit le retour de /essai n'est donc pas
// un accident : il est GARANTI, pour tout compte cree en moins d'une minute.
//
// CE QU'ON FAIT DE CE CONSTAT :
//   1. le delai reel, celui de la reponse, s'affiche — plus de bouton muet ;
//   2. le bouton porte le compte a rebours au lieu d'etre gris sans raison ;
//   3. AU RETOUR DE /essai SEULEMENT, l'app renvoie le code toute seule quand
//      le delai est ecoule. La personne vient de connecter sa boite : lui
//      demander de retaper quelque chose 58 secondes plus tard, c'est la perdre.
//      Ailleurs (elle a appuye trop vite), c'est a elle de reappuyer.
//
// La correction de fond — ne pas demander de code a Supabase quand le web vient
// d'en consommer la fenetre — se joue cote serveur, pas ici. Elle n'est PAS
// faite : elle touche /api/connect/auto, qui marche.
const DELAI_PAR_DEFAUT = 60;

function adresseDuRetour(url: string): string | null {
  const m = /[?&]email=([^&#]*)/.exec(url);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1] || '').trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Le nombre de secondes a attendre, LU DANS LA REPONSE. Supabase repond
 * « For security purposes, you can only request this after 58 seconds. » avec
 * le code `over_email_send_rate_limit`. On ne devine pas : on lit. Si le texte
 * change un jour et qu'on n'y trouve plus de nombre, on retombe sur 60 — la
 * fenetre documentee — plutot que sur zero, qui relancerait une boucle d'echecs.
 */
function delaiDuRefus(err: unknown): number | null {
  const e = err as { message?: string; code?: string; status?: number } | null;
  const texte = `${e?.message || ''} ${e?.code || ''}`.toLowerCase();
  const limite = e?.status === 429 || texte.includes('rate limit') || texte.includes('over_email_send');
  if (!limite) return null;
  const m = /(\d+)\s*second/.exec(texte);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DELAI_PAR_DEFAUT;
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
  // Secondes restantes avant de pouvoir redemander un code. 0 = pas d'attente.
  const [attente, setAttente] = useState(0);
  // Vrai uniquement au retour de /essai : l'app renverra le code toute seule.
  const renvoiAuto = useRef(false);
  const adresseEnAttente = useRef('');

  // Le compte a rebours. Un `setTimeout` par seconde, annule au demontage.
  useEffect(() => {
    if (attente <= 0) return;
    const id = setTimeout(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [attente]);

  const envoyerCode = useCallback(
    async (adresse: string, auto: boolean): Promise<'ok' | 'inconnu' | 'attente' | 'echec'> => {
      setLoading(true);
      const { error: err } = await supabase.auth.signInWithOtp({
        email: adresse,
        // 🔴 shouldCreateUser: false — 27/08/2026.
        // Avant, l'app iOS CREAIT le compte et demarrait l'essai gratuit. Apple a
        // refuse le build 21 le 27/08 (regles 3.1.1 et 3.1.3(c)) : un service payant
        // vendu a des particuliers doit passer par l'achat integre. L'app devient donc
        // une app de CONNEXION pour des clients qui ont deja un compte ; la creation
        // de compte se fait sur le web. Ne pas remettre `true` sans achat integre.
        options: { shouldCreateUser: false },
      });
      setLoading(false);

      if (!err) {
        setError(null);
        setAttente(0);
        return 'ok';
      }

      console.error('signInWithOtp en echec :', err);

      const delai = delaiDuRefus(err);
      if (delai !== null) {
        adresseEnAttente.current = adresse;
        setAttente(delai);
        setSansCompte(false);
        if (auto) {
          // Au retour de /essai : on annonce l'attente et on renverra tout seul.
          renvoiAuto.current = true;
          setError(null);
          setInfo(f(t.login.codeComing, { n: delai }));
          setStep('code');
        } else {
          // Pas de message fige ici : il est calcule au rendu a partir du
          // compte a rebours. Capture du 21/09 : un texte fige a « 58 s » a
          // cote d'un bouton qui disait « 54 s » — deux nombres, zero confiance.
          setError(null);
        }
        return 'attente';
      }

      // Supabase repond « Signups not allowed for otp » quand l'adresse n'a pas de
      // compte. C'est le cas NORMAL ici, pas une panne.
      const brut = `${(err as { message?: string }).message || ''} ${
        (err as { code?: string }).code || ''
      }`.toLowerCase();
      if (
        brut.includes('signups not allowed') ||
        brut.includes('otp_disabled') ||
        brut.includes('user not found')
      ) {
        return 'inconnu';
      }

      setError((err as { message?: string }).message || t.login.errSend);
      return 'echec';
    },
    [f, t],
  );

  // Renvoi automatique quand le compte a rebours du retour de /essai s'acheve.
  useEffect(() => {
    if (attente !== 0 || !renvoiAuto.current) return;
    renvoiAuto.current = false;
    const adresse = adresseEnAttente.current;
    if (!adresse) return;
    (async () => {
      const r = await envoyerCode(adresse, false);
      if (r === 'ok') {
        setInfo(t.login.accountCreated);
      }
      // Les autres cas ont deja pose leur message : rien n'est avale.
    })();
  }, [attente, envoyerCode, t]);

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
    setCode('');
    const r = await envoyerCode(adresse, true);
    if (r === 'ok') {
      setError(null);
      setSansCompte(false);
      setInfo(t.login.accountCreated);
      setStep('code');
    } else if (r === 'inconnu' || r === 'echec') {
      // On ne masque rien : la boite est connectee mais le code n'est pas parti.
      setSansCompte(false);
      if (r === 'inconnu') setError(t.login.errSend);
    }
    // 'attente' : le message et le compte a rebours sont deja poses.
  }

  async function sendCode() {
    const clean = email.trim().toLowerCase();
    if (!clean || attente > 0) return;
    setError(null);
    setInfo(null);
    setSansCompte(false);
    const r = await envoyerCode(clean, false);
    if (r === 'ok') setStep('code');
    else if (r === 'inconnu') await ouvrirEssai(clean);
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
    // ─── EMAIL DE BIENVENUE — 21/09/2026 ────────────────────────────────────
    // « Votre essai a commence » part ICI, a la premiere connexion REUSSIE, et
    // pas a la creation du compte : le code de connexion part deja a ce
    // moment-la, et deux mails coup sur coup noieraient le seul qui presse.
    // La route est idempotente (index unique en base) : l'appeler a chaque
    // connexion n'envoie qu'un mail, une fois, par compte.
    // On n'attend PAS la reponse pour entrer dans l'app — mais un echec est dit
    // dans la console, jamais avale.
    void apiPost('/api/bienvenue', {}).catch((e) => {
      console.error('Email de bienvenue non declenche :', e);
    });
    router.replace('/(tabs)/accueil');
  }

  const attenteEnCours = attente > 0;
  const envoiBloque = !email || loading || attenteEnCours;

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
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
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
                  style={[styles.btn, envoiBloque && styles.btnDisabled]}
                  onPress={sendCode}
                  disabled={envoiBloque}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onDark} />
                  ) : (
                    <Text style={styles.btnText}>
                      {attenteEnCours ? f(t.login.waitBtn, { n: attente }) : t.login.getCode}
                    </Text>
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
                {/* 🔴 L'ERREUR EST DANS LA CARTE, PAS SOUS ELLE — 21/09/2026.
                    Elle etait posee tout en bas de l'ecran, sous la carte : avec
                    le clavier ouvert sur le champ email, c'est exactement la ou
                    on ne la voit pas. « On appuie, rien ne s'affiche. » */}
                {attenteEnCours ? (
                  <Text style={styles.error}>{f(t.login.tooSoon, { n: attente })}</Text>
                ) : error ? (
                  <Text style={styles.error}>{error}</Text>
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
                  onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 8))}
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
                    renvoiAuto.current = false;
                  }}
                >
                  <Text style={styles.linkText}>{t.login.changeEmail}</Text>
                </Pressable>
                {/* Le compte a rebours du retour de /essai, visible tant qu'il
                    tourne : la personne sait que son code est en route. */}
                {attenteEnCours ? (
                  <Text style={styles.info}>{f(t.login.codeComing, { n: attente })}</Text>
                ) : info ? (
                  <Text style={styles.info}>{info}</Text>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Text style={styles.hint}>
                  {f(t.login.codeSentTo, { email: email.trim().toLowerCase() })}
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.charcoal },
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
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
  error: { fontFamily: fonts.sans, color: '#ff9b6b', fontSize: 13, textAlign: 'center' },
});
