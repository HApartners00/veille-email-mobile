import { useEffect, useMemo, useRef, useState } from 'react';
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

import { BilleVmailIA } from '@/components/bouton-vmail-ia';
import { IconChevronLeft, IconClose, IconPlus, IconSend } from '@/components/icons';
import { useI18n } from '@/context/i18n';
import { apiDownloadToFile, apiPost, apiPostBrut } from '@/lib/api';
import { prioLabel } from '@/lib/i18n';
import { PRIORITY_KEYS } from '@/lib/priority';
import { supabase } from '@/lib/supabase';
import { colors, fonts, priorityColors, radius, spacing } from '@/lib/theme';

// ─────────────────────────────────────────────────────────────────────────────
// L'ASSISTANT — 21/09/2026. Remplace l'écran « Pièces jointes ».
//
// Le moteur vit côté serveur (`/api/assistant`, `lib/assistant.ts` du web) :
// cet écran pose la question, affiche la réponse et les CARTES qui la suivent —
// mails, pièces jointes, réponses à relire, actions faites.
//
// ⚠️ RIEN NE PART SANS LA PERSONNE. Une carte de réponse écrit son brouillon
// avec le MÊME générateur que l'écran d'un mail (`/api/draft`, style de la
// personne compris), et l'envoi passe par la MÊME route (`/api/send-reply`),
// après la MÊME confirmation. L'assistant ne sait pas envoyer.
//
// ⚠️ LA CONVERSATION VIT ICI, PAS SUR LE SERVEUR. À chaque question, l'écran
// renvoie l'historique (textes) et les cartes déjà montrées : c'est ce qui
// permet « réponds au deuxième » au tour suivant. Rien n'est gardé une fois
// l'écran fermé — choix par défaut, annoncé.
// ─────────────────────────────────────────────────────────────────────────────

type CarteMail = {
  ref: string;
  type: 'mail';
  id: string;
  dossier: 'recus' | 'envoyes';
  de: string;
  objet: string;
  date: string;
  extrait: string;
  categorie: string | null;
};
type CartePJ = {
  ref: string;
  type: 'pj';
  id: string;
  item_id: string | null;
  attachment_id: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  sender: string | null;
  received_at: string | null;
};
type CarteReponse = { ref: string; type: 'reponse'; id: string; de: string; objet: string; consigne: string };
type CarteAction = {
  ref: string;
  type: 'action';
  id: string;
  objet: string;
  action: 'archive' | 'unarchive' | 'trash' | 'classer';
  categorie: string | null;
  ancienne_categorie: string | null;
  ok: boolean;
};
type Carte = CarteMail | CartePJ | CarteReponse | CarteAction;

type Tour = { role: 'user'; texte: string } | { role: 'assistant'; texte: string; cartes: Carte[]; erreur?: boolean };

function nomSeul(de: string): string {
  const s = String(de || '').trim();
  if (s.includes('<')) return s.split('<')[0]!.trim().replace(/"/g, '') || s;
  return s.split('@')[0] || s;
}

function tailleLisible(n: number | null): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function estImage(mime: string | null, nom: string): boolean {
  return (mime || '').toLowerCase().startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(nom || '');
}

export default function Assistant() {
  const router = useRouter();
  const { t, locale, intl } = useI18n();
  const a = t.assistant;
  const [saisie, setSaisie] = useState('');
  const [tours, setTours] = useState<Tour[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [apercu, setApercu] = useState<{ uri: string; mime: string | null } | null>(null);
  const defilement = useRef<ScrollView | null>(null);
  // Vrai tant que la personne est en bas de la conversation.
  const colle = useRef(true);

  const dateCourte = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short' });
    } catch {
      return '';
    }
  };

  // Toutes les cartes déjà montrées : renvoyées au serveur pour que leurs
  // références ([m2]…) restent valables au tour suivant.
  const toutesCartes = useMemo(
    () => tours.flatMap((x) => (x.role === 'assistant' ? x.cartes : [])),
    [tours],
  );

  async function demander(texte: string) {
    const question = texte.trim();
    if (!question || enCours) return;
    setSaisie('');
    colle.current = true;
    const historique = tours.map((x) => ({ role: x.role, texte: x.texte })).slice(-12);
    setTours((p) => [...p, { role: 'user', texte: question }]);
    setEnCours(true);
    try {
      const r = await apiPostBrut<{ texte?: string; cartes?: Carte[]; code?: string; error?: string }>(
        '/api/assistant',
        { question, historique, cartes: toutesCartes.slice(-80), locale },
      );
      if (r.ok) {
        setTours((p) => [...p, { role: 'assistant', texte: r.json.texte || '', cartes: r.json.cartes || [] }]);
      } else {
        // 🔴 Jamais muet : chaque échec a son message, dans la langue de l'app.
        // Les cartes arrivées avant la panne (une action déjà faite) restent.
        console.error('Assistant en échec :', r.status, r.json?.code, r.json?.error);
        const message =
          r.json?.code === 'plafond' ? a.errPlafond : r.json?.code === 'temps_depasse' ? a.errTemps : a.errGeneric;
        setTours((p) => [...p, { role: 'assistant', texte: message, cartes: r.json?.cartes || [], erreur: true }]);
      }
    } catch (e) {
      console.error('Assistant injoignable :', e);
      setTours((p) => [...p, { role: 'assistant', texte: a.errGeneric, cartes: [], erreur: true }]);
    }
    setEnCours(false);
  }

  async function ouvrirPJ(pj: CartePJ) {
    try {
      const uri = await apiDownloadToFile(`/api/attachments/download?id=${encodeURIComponent(pj.id)}`, pj.filename);
      if (estImage(pj.mime_type, pj.filename)) setApercu({ uri, mime: pj.mime_type });
      else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: pj.mime_type || undefined });
    } catch (e) {
      console.error('Pièce jointe non téléchargée :', e);
      Alert.alert(a.downloadFail);
    }
  }

  function carte(c: Carte) {
    if (c.type === 'mail') {
      const couleur = c.categorie ? priorityColors[c.categorie] || colors.hint : colors.hint;
      return (
        <Pressable
          key={c.ref}
          style={({ pressed }) => [styles.carte, pressed && styles.carteAppuyee]}
          onPress={() => router.push(c.dossier === 'envoyes' ? `/envoi/${c.id}` : `/email/${c.id}`)}
        >
          <View style={[styles.filet, { backgroundColor: couleur }]} />
          <View style={styles.carteCorps}>
            <View style={styles.carteLigne}>
              <Text style={styles.carteDe} numberOfLines={1}>
                {c.dossier === 'envoyes' ? `${a.to} ${nomSeul(c.de)}` : nomSeul(c.de)}
              </Text>
              <Text style={styles.carteDate}>{dateCourte(c.date)}</Text>
            </View>
            <Text style={styles.carteObjet} numberOfLines={1}>
              {c.objet || t.common.noSubject}
            </Text>
            {c.extrait ? (
              <Text style={styles.carteExtrait} numberOfLines={2}>
                {c.extrait}
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    }
    if (c.type === 'pj') {
      return (
        <View key={c.ref} style={styles.carte}>
          <View style={[styles.filet, { backgroundColor: colors.terracotta }]} />
          <View style={styles.carteCorps}>
            <Text style={styles.carteObjet} numberOfLines={1}>
              {c.filename}
            </Text>
            <Text style={styles.carteExtrait} numberOfLines={1}>
              {[c.sender ? nomSeul(c.sender) : '', dateCourte(c.received_at), tailleLisible(c.size_bytes)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={styles.liens}>
              {c.attachment_id ? (
                <Pressable onPress={() => ouvrirPJ(c)} hitSlop={8}>
                  <Text style={styles.lien}>{a.download}</Text>
                </Pressable>
              ) : null}
              {c.item_id ? (
                <Pressable onPress={() => router.push(`/email/${c.item_id}`)} hitSlop={8}>
                  <Text style={styles.lienDoux}>{a.openMail}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      );
    }
    if (c.type === 'reponse') return <CarteDeReponse key={c.ref} carte={c} />;
    return <CarteDAction key={c.ref} carte={c} />;
  }

  const vide = tours.length === 0;

  return (
    <View style={styles.racine}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={styles.haut}>
        <View style={styles.barre}>
          <Pressable style={styles.retour} onPress={() => router.back()} hitSlop={12}>
            <IconChevronLeft size={19} color={colors.onDark} />
          </Pressable>
          <View style={styles.titreBloc}>
            {/* Comme le web (25/09) : la goutte + « Vmail IA » (nom de marque, identique dans les 8 langues). */}
            <BilleVmailIA taille={24} />
            <Text style={styles.titre}>Vmail IA</Text>
          </View>
          {!vide ? (
            <Pressable
              style={[styles.retour, enCours && styles.inactif]}
              onPress={() => setTours([])}
              hitSlop={10}
              disabled={enCours}
              accessibilityRole="button"
              accessibilityLabel={a.newChat}
            >
              <IconPlus size={18} color={colors.onDark} strokeWidth={2} />
            </Pressable>
          ) : (
            <View style={{ width: 34 }} />
          )}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={defilement}
          style={styles.flex}
          contentContainerStyle={[styles.contenu, vide && styles.contenuVide]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={100}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            colle.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
          }}
          onContentSizeChange={() => {
            if (colle.current) defilement.current?.scrollToEnd({ animated: true });
          }}
        >
          {vide ? (
            <View style={styles.accueil}>
              <View style={styles.goutteAccueil}>
                <BilleVmailIA taille={64} />
              </View>
              <Text style={styles.bonjour}>{a.hello}</Text>
              <Text style={styles.intro}>{a.intro}</Text>
              <View style={styles.exemples}>
                {a.examples.map((ex) => (
                  <Pressable
                    key={ex}
                    style={({ pressed }) => [styles.exemple, pressed && styles.exempleAppuye]}
                    onPress={() => demander(ex)}
                  >
                    <Text style={styles.exempleTexte}>{ex}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            tours.map((x, i) =>
              x.role === 'user' ? (
                <View key={i} style={styles.ligneMoi}>
                  <View style={styles.bulleMoi}>
                    <Text style={styles.texteMoi}>{x.texte}</Text>
                  </View>
                </View>
              ) : (
                <View key={i} style={styles.blocAssistant}>
                  {x.texte ? (
                    <Text style={[styles.texteAssistant, x.erreur && styles.texteErreur]}>{x.texte}</Text>
                  ) : null}
                  {x.cartes.length ? <View style={styles.cartes}>{x.cartes.map(carte)}</View> : null}
                </View>
              ),
            )
          )}
          {enCours ? (
            <View style={styles.cherche}>
              <BilleVmailIA taille={18} />
              <Text style={styles.chercheTexte}>{a.thinking}</Text>
            </View>
          ) : null}
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.bas}>
          <View style={styles.saisieLigne}>
            <TextInput
              style={styles.saisie}
              value={saisie}
              onChangeText={setSaisie}
              placeholder={a.placeholder}
              placeholderTextColor={colors.onDarkMuted}
              onSubmitEditing={() => demander(saisie)}
              returnKeyType="send"
              editable={!enCours}
              multiline
              blurOnSubmit
            />
            <Pressable
              style={[styles.envoyer, (!saisie.trim() || enCours) && styles.inactif]}
              onPress={() => demander(saisie)}
              disabled={!saisie.trim() || enCours}
              accessibilityLabel={t.email.sendDirectly}
            >
              <IconSend size={17} color={colors.onDark} />
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <Modal visible={!!apercu} transparent animationType="fade" onRequestClose={() => setApercu(null)}>
        <View style={styles.apercuFond}>
          <Pressable style={styles.apercuFermer} onPress={() => setApercu(null)} hitSlop={12}>
            <IconClose size={26} color={colors.onDark} />
          </Pressable>
          {apercu ? <Image source={{ uri: apercu.uri }} style={styles.apercuImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

// ─── LA CARTE DE RÉPONSE ─────────────────────────────────────────────────────
// Même chemin que l'écran d'un mail, de bout en bout : `/api/draft` écrit,
// la personne relit et modifie, `/api/send-reply` envoie APRÈS confirmation,
// `/api/push-to-mailbox` range en brouillon. Mêmes clés d'idempotence.

function CarteDeReponse({ carte }: { carte: CarteReponse }) {
  const { t, f, locale } = useI18n();
  const a = t.assistant;
  const [brouillon, setBrouillon] = useState('');
  const [genere, setGenere] = useState('');
  const [etat, setEtat] = useState<'ecrit' | 'pret' | 'envoi' | 'envoye' | 'range' | 'echec'>('ecrit');
  const [message, setMessage] = useState<string | null>(null);
  const cle = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2)}-${carte.id}`, [carte.id]);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await apiPost<{ draft: string }>('/api/draft', { id: carte.id, locale, instructions: carte.consigne });
        if (!vivant) return;
        setBrouillon(r.draft || '');
        setGenere(r.draft || '');
        setEtat('pret');
      } catch (e: any) {
        if (!vivant) return;
        console.error('Brouillon de l’assistant non écrit :', e);
        setMessage(e?.message || a.draftFail);
        setEtat('echec');
      }
    })();
    return () => {
      vivant = false;
    };
  }, [carte.id, carte.consigne, locale, a.draftFail]);

  async function envoyer() {
    setEtat('envoi');
    setMessage(null);
    try {
      await apiPost('/api/send-reply', { id: carte.id, draft: brouillon, generatedDraft: genere, locale, idempotencyKey: cle });
      setEtat('envoye');
    } catch (e: any) {
      setMessage(e?.message || t.email.sendFail);
      setEtat('pret');
    }
  }

  function confirmer() {
    if (!brouillon.trim()) return;
    Alert.alert(t.email.confirmTitle, t.email.confirmSub, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.email.confirmSend, onPress: envoyer },
    ]);
  }

  async function ranger() {
    setMessage(null);
    try {
      await apiPost('/api/push-to-mailbox', { id: carte.id, draft: brouillon, generatedDraft: genere, locale, idempotencyKey: cle });
      setEtat('range');
    } catch (e: any) {
      setMessage(e?.message || t.email.pushFail);
    }
  }

  return (
    <View style={styles.carteReponse}>
      <Text style={styles.reponseTitre} numberOfLines={1}>
        {f(a.replyTo, { de: nomSeul(carte.de) })}
      </Text>
      <Text style={styles.reponseObjet} numberOfLines={1}>
        {carte.objet}
      </Text>
      {etat === 'ecrit' ? (
        <View style={styles.reponseAttente}>
          <BilleVmailIA taille={16} />
          <Text style={styles.reponseAttenteTexte}>{a.writing}</Text>
        </View>
      ) : etat === 'envoye' ? (
        <Text style={styles.reponseFaite}>{t.email.sentTitle}</Text>
      ) : etat === 'range' ? (
        <Text style={styles.reponseFaite}>{t.email.draftCreated}</Text>
      ) : etat === 'echec' ? null : (
        <>
          <TextInput
            style={styles.reponseTexte}
            value={brouillon}
            onChangeText={setBrouillon}
            multiline
            editable={etat === 'pret'}
            textAlignVertical="top"
          />
          <View style={styles.reponseBoutons}>
            <Pressable
              style={[styles.boutonPlein, (etat !== 'pret' || !brouillon.trim()) && styles.inactif]}
              onPress={confirmer}
              disabled={etat !== 'pret' || !brouillon.trim()}
            >
              {etat === 'envoi' ? (
                <ActivityIndicator size="small" color={colors.onDark} />
              ) : (
                <Text style={styles.boutonPleinTexte}>{t.email.sendDirectly}</Text>
              )}
            </Pressable>
            <Pressable style={[styles.boutonVide, etat !== 'pret' && styles.inactif]} onPress={ranger} disabled={etat !== 'pret'}>
              <Text style={styles.boutonVideTexte} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {t.email.putInMailbox}
              </Text>
            </Pressable>
          </View>
        </>
      )}
      {message ? <Text style={styles.reponseErreur}>{message}</Text> : null}
    </View>
  );
}

// ─── LA CARTE D'ACTION ───────────────────────────────────────────────────────
// Une action faite par l'assistant se VOIT, et s'annule d'un geste. L'annulation
// passe par les mêmes chemins que l'app : `/api/mail-action` pour ranger, et la
// même écriture de tags que l'écran d'un mail pour la catégorie.

function CarteDAction({ carte }: { carte: CarteAction }) {
  const { t, f } = useI18n();
  const a = t.assistant;
  const [annule, setAnnule] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const libelle = !carte.ok
    ? a.actionFailed
    : carte.action === 'archive'
      ? a.archived
      : carte.action === 'unarchive'
        ? a.unarchived
        : carte.action === 'trash'
          ? a.trashed
          : f(a.classed, { cat: prioLabel(t, carte.categorie || '') });

  const inverse =
    carte.action === 'archive' ? 'unarchive' : carte.action === 'unarchive' ? 'archive' : carte.action === 'trash' ? 'untrash' : null;
  const annulable = carte.ok && !annule && (inverse || (carte.action === 'classer' && carte.ancienne_categorie));

  async function annuler() {
    setOccupe(true);
    setErreur(null);
    try {
      if (inverse) {
        await apiPost('/api/mail-action', { itemId: carte.id, op: inverse });
      } else if (carte.ancienne_categorie) {
        const { data } = await supabase.from('items').select('tags').eq('id', carte.id).single();
        const tags = (((data as { tags?: string[] } | null)?.tags) || []).map(String);
        const base = tags.filter((x) => !PRIORITY_KEYS.includes(x.toLowerCase()));
        const { error } = await supabase.from('items').update({ tags: [...base, carte.ancienne_categorie] }).eq('id', carte.id);
        if (error) throw new Error(error.message);
      }
      setAnnule(true);
    } catch (e: any) {
      console.error('Annulation impossible :', e);
      setErreur(e?.message || t.mailActions.errGeneric);
    }
    setOccupe(false);
  }

  return (
    <View style={styles.carteAction}>
      <Text style={[styles.actionTexte, !carte.ok && styles.texteErreur]} numberOfLines={2}>
        {annule ? a.undone : `${carte.ok ? '✓ ' : ''}${libelle}`}
        <Text style={styles.actionObjet}>{`  ·  ${carte.objet}`}</Text>
      </Text>
      {annulable ? (
        <Pressable onPress={annuler} disabled={occupe} hitSlop={8}>
          {occupe ? (
            <ActivityIndicator size="small" color={colors.terracottaLight} />
          ) : (
            <Text style={styles.actionAnnuler}>{t.mailActions.undo}</Text>
          )}
        </Pressable>
      ) : null}
      {erreur ? <Text style={styles.reponseErreur}>{erreur}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: colors.fond },
  flex: { flex: 1 },
  haut: { backgroundColor: colors.charcoal },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.charline,
  },
  retour: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(234,225,208,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titreBloc: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  titre: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.onDark, letterSpacing: -0.2 },

  contenu: { padding: spacing.xl, gap: spacing.lg },
  contenuVide: { flexGrow: 1, justifyContent: 'center' },

  accueil: { gap: spacing.md },
  goutteAccueil: { alignSelf: 'flex-start', marginBottom: spacing.xs },
  bonjour: { fontFamily: fonts.sansExtrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.onDark },
  intro: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, color: colors.onDarkMuted },
  exemples: { gap: spacing.sm, marginTop: spacing.md },
  exemple: {
    borderWidth: 1,
    borderColor: colors.charline,
    backgroundColor: 'rgba(234,225,208,0.045)',
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  exempleAppuye: { backgroundColor: 'rgba(234,225,208,0.10)' },
  exempleTexte: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.onDark },

  ligneMoi: { alignItems: 'flex-end' },
  bulleMoi: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.lg,
    borderBottomEndRadius: radius.sm,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: 10,
    maxWidth: '86%',
  },
  texteMoi: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: colors.onDark },

  blocAssistant: { gap: spacing.md },
  texteAssistant: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, color: colors.onDark },
  texteErreur: { color: '#ff9b6b' },
  cartes: { gap: spacing.sm },

  carte: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  carteAppuyee: { opacity: 0.85 },
  filet: { width: 4 },
  carteCorps: { flex: 1, paddingVertical: 11, paddingHorizontal: spacing.md, gap: 3 },
  carteLigne: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  carteDe: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.ink },
  carteDate: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  carteObjet: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2 },
  carteExtrait: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  liens: { flexDirection: 'row', gap: spacing.lg, marginTop: 6 },
  lien: { fontFamily: fonts.sansSemibold, fontSize: 13, color: colors.terracotta },
  lienDoux: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },

  carteReponse: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  reponseTitre: {
    fontFamily: fonts.sansSemibold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  reponseObjet: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.ink2 },
  reponseAttente: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  reponseAttenteTexte: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  reponseTexte: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.ink,
    backgroundColor: colors.cream,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 110,
    marginTop: 4,
  },
  reponseBoutons: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
  boutonPlein: {
    flex: 1,
    backgroundColor: colors.terracottaVivid,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonPleinTexte: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.onDark },
  boutonVide: {
    flex: 1.3,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonVideTexte: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.ink2 },
  reponseFaite: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.sage, paddingVertical: spacing.sm },
  reponseErreur: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.danger },

  carteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.charline,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    flexWrap: 'wrap',
  },
  actionTexte: { flex: 1, fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.onDark },
  actionObjet: { fontFamily: fonts.sans, color: colors.onDarkMuted },
  actionAnnuler: { fontFamily: fonts.sansSemibold, fontSize: 13.5, color: colors.terracottaLight },

  cherche: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chercheTexte: { fontFamily: fonts.sans, fontSize: 14, color: colors.onDarkMuted },

  bas: { backgroundColor: colors.charcoal, borderTopWidth: 1, borderTopColor: colors.charline },
  saisieLigne: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saisie: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.onDark,
    backgroundColor: colors.charcoalSoft,
    borderColor: colors.charline,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
  },
  envoyer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.terracottaVivid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactif: { opacity: 0.45 },

  apercuFond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  apercuFermer: { position: 'absolute', top: 52, end: 20, zIndex: 2, padding: 8 },
  apercuImage: { width: '100%', height: '100%' },
});
