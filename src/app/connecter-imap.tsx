import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  I18nManager,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { Redirect, Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { IconCheck } from '@/components/icons';
import { useI18n } from '@/context/i18n';
import { apiPostBrut } from '@/lib/api';
import { imapMsg } from '@/lib/i18n/connexion-imap';
import {
  EDITEUR_IMAP,
  EXEMPLE_CODE,
  LIBELLE_IMAP,
  PAGE_MOT_DE_PASSE,
  fournisseurImapDeLAdresse,
  lireFournisseurImap,
  type FournisseurImap,
} from '@/lib/imap';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * ÉCRAN « CONNECTER YAHOO / ICLOUD » — 06/10/2026. Jumeau mobile de l'assistant du web
 * (`apps/web/src/app/sources/assistant-imap.tsx`), option C de la maquette choisie par HA.
 *
 * Gmail et Outlook se connectent en un clic : on part chez Google ou Microsoft, on dit
 * oui, on revient. Yahoo et iCloud n'offrent pas ce chemin à Vmail. Le client doit créer
 * lui-même, chez son fournisseur, un « mot de passe d'application », puis nous le donner.
 *
 * D'où trois étapes, avec UNE chose à faire par étape :
 *   1. créer le code (on ouvre la bonne page pour lui) ;
 *   2. le coller ;
 *   3. lire que c'est fait.
 *
 * On arrive ici depuis « Sources » : `/connecter-imap?fournisseur=yahoo&lecture=0`.
 *   • `fournisseur` : `yahoo` ou `icloud`. Toute autre valeur renvoie à « Sources ».
 *   • `lecture`     : `1` quand la relève des boîtes IMAP est livrée. Sinon l'étape 3 ne
 *                     promet PAS que les mails arrivent : elle dit ce qui est vrai.
 *
 * ⚠️ LE CODE N'EST PAS DANS L'ÉTAT REACT. Il vit dans une référence (`codeRef`), lue une
 * seule fois, à l'envoi, et vidée dès que le serveur a dit oui. Un état React se relit
 * dans les outils de mise au point et redessine l'écran à chaque lettre ; une référence, non.
 * (Ce n'est pas un effacement de la mémoire du téléphone : le langage ne le permet pas.
 * C'est seulement ne pas le ranger là où on le relit facilement.)
 *
 * ⚠️ LES CHAMPS DE L'ÉTAPE 2 RESTENT À L'ÉCRAN PENDANT L'ÉTAPE 1, cachés. Sur un téléphone
 * on appuie sur « retour » par réflexe : si revenir à l'étape 1 effaçait le code, le client
 * devrait retourner le chercher chez Yahoo. Cachés et non retirés, ils gardent ce qu'on y a mis.
 *
 * CE QUE CET ÉCRAN NE FAIT PAS : il ne parle pas au fournisseur. C'est `/api/connect/imap`
 * qui essaie la boîte (lecture PUIS envoi), qui retire les espaces du code Yahoo, qui
 * limite le nombre d'essais, et qui n'enregistre rien si l'essai échoue.
 */

/**
 * La route coupe à 60 s (`maxDuration`). Au-delà, plus personne ne répondra : sans cette
 * limite, un réseau mobile qui lâche laisserait l'écran sur « Vérification en cours… »,
 * retour bloqué, sans fin.
 */
const DELAI_MAX_MS = 70_000;

type Reponse = { ok?: boolean; error?: string; email?: string; retry_after_s?: number };
type Erreur = { texte: string; champ: 'adresse' | 'code' | null };
/**
 * Deux sortes de trace en console, pour les réponses que le serveur ne devrait pas faire :
 *   `inconnue`   un cas que l'écran ne sait pas nommer (il affiche la phrase générale) ;
 *   `incomplete` un cas qu'il sait nommer, mais auquel il manque ce que le serveur envoie
 *                toujours (la durée d'attente d'un 429, le code d'un 504).
 */
type ErreurServeur = Erreur & { inconnue?: true; incomplete?: string };

/** Les deux façons de « revenir en arrière » : le bouton ou le geste du téléphone, `router.back()`. */
const ACTIONS_RETOUR = ['GO_BACK', 'POP'];

export default function ConnecterImap() {
  const params = useLocalSearchParams<{ fournisseur?: string; lecture?: string }>();
  const fournisseur = lireFournisseurImap(params.fournisseur);
  // Le renvoi ci-dessous se fait sans un mot pour le client. Il laisse une trace : si un
  // jour « Sources » et cet écran ne s'entendent plus sur le nom d'un fournisseur, le
  // bouton « Connecter … » ramènerait à « Sources » sans que personne sache pourquoi.
  const recu = String(params.fournisseur ?? '(absent)').slice(0, 40);
  useEffect(() => {
    if (!fournisseur) console.warn(`[connecter-imap] fournisseur inconnu (« ${recu} ») : retour à « Sources »`);
  }, [fournisseur, recu]);
  // Un lien mal formé ne doit pas ouvrir un écran à moitié vide, ni un écran « Yahoo »
  // pour un fournisseur qu'on ne connaît pas.
  if (!fournisseur) return <Redirect href="/sources" />;
  // `key` : passer de Yahoo à iCloud repart d'un écran neuf (étape, adresse et code).
  return <Assistant key={fournisseur} fournisseur={fournisseur} lecturePrete={params.lecture === '1'} />;
}

function Assistant({
  fournisseur,
  lecturePrete,
}: {
  fournisseur: FournisseurImap;
  lecturePrete: boolean;
}) {
  const { locale, t: tApp } = useI18n();
  const router = useRouter();
  const navigation = useNavigation();
  const marges = useSafeAreaInsets();
  const t = imapMsg[locale] ?? imapMsg.en;
  const nom = LIBELLE_IMAP[fournisseur];
  const editeur = EDITEUR_IMAP[fournisseur];
  // Le SENS RÉEL de l'écran, pas la langue : après un changement de langue, le sens ne
  // bascule qu'au redémarrage de l'app (voir src/context/i18n.tsx).
  const deDroiteAGauche = I18nManager.isRTL;

  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [visible, setVisible] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [emailConnecte, setEmailConnecte] = useState('');
  const [pageNonOuverte, setPageNonOuverte] = useState(false);

  /** Le code tapé. Voir l'en-tête : il n'entre jamais dans l'état React. */
  const codeRef = useRef('');
  const champCode = useRef<TextInput>(null);
  const defilement = useRef<ScrollView>(null);
  /** Un deuxième appui pendant que la page du fournisseur s'ouvre ne doit rien lancer. */
  const ouvertureEnCours = useRef(false);
  /**
   * Un envoi est parti. `occupe` (l'état) dit la même chose, mais un état n'est à jour
   * qu'au dessin suivant : deux appuis dans le même instant passeraient tous les deux, et
   * chacun coûte un essai chez Yahoo ou Apple. Une référence change tout de suite.
   */
  const envoiEnCours = useRef(false);
  const coupure = useRef<AbortController | null>(null);
  const present = useRef(true);

  /**
   * Remplace les mots à trous, et pose les espaces insécables du français : sans elles,
   * un « » » ou un « : » part seul à la ligne suivante (vu sur la maquette du web).
   */
  function dire(texte: string, plus: Record<string, string> = {}): string {
    const mots: Record<string, string> = { nom, editeur, ...plus };
    return texte
      .replace(/\{(\w+)\}/g, (tout, cle: string) => mots[cle] ?? tout)
      .replace(/« /g, '« ')
      .replace(/ »/g, ' »')
      .replace(/ ([:;?!])/g, ' $1');
  }

  // L'écran se ferme : l'appel en cours est coupé, et l'écran ne garde plus le code.
  useEffect(() => {
    present.current = true;
    return () => {
      present.current = false;
      coupure.current?.abort();
      codeRef.current = '';
    };
  }, []);

  // LECTEUR D'ÉCRAN. Le contenu change sans que l'écran change : sans annonce, VoiceOver
  // et TalkBack restent muets après « continuer ».
  const annonceEtape = `${dire(t.etape, { n: String(etape) })}. ${dire(
    etape === 1 ? t.e1Titre : etape === 2 ? t.e2Titre : t.e3Titre,
  )}`;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(annonceEtape);
  }, [annonceEtape]);
  useEffect(() => {
    if (erreur) AccessibilityInfo.announceForAccessibility(erreur.texte);
  }, [erreur]);

  // Chaque étape commence EN HAUT. Sans cela, sur un petit téléphone, on descend jusqu'à
  // « continuer », et l'étape 2 s'ouvre déjà descendue, son titre hors de l'écran.
  useEffect(() => {
    defilement.current?.scrollTo({ y: 0, animated: false });
  }, [etape]);

  // L'APP PASSE À L'ARRIÈRE-PLAN (ou le téléphone montre la liste des apps ouvertes) : le
  // code affiché en clair est remasqué, pour ne pas rester lisible sur l'aperçu de l'app.
  useEffect(() => {
    const ecoute = AppState.addEventListener('change', (etat) => {
      if (etat !== 'active') setVisible(false);
    });
    return () => ecoute.remove();
  }, []);

  function revenirEtape1() {
    setErreur(null);
    setVisible(false);
    setEtape(1);
  }

  // LE BOUTON « RETOUR » DU TÉLÉPHONE, à l'étape 2 : il ramène à l'étape 1 au lieu de
  // quitter l'écran (l'adresse et le code sont gardés). Pendant la vérification il ne fait
  // rien : la réponse arriverait dans le vide, sans que le client sache si c'est connecté.
  //
  // ⚠️ `usePreventRemove` retient TOUT ce qui retire l'écran, pas seulement « retour » : par
  // exemple un renvoi vers la connexion quand la session tombe. Ces demandes-là ne sont pas
  // des gestes du client : on les laisse passer telles quelles, au lieu de les avaler.
  usePreventRemove(etape === 2, ({ data }) => {
    if (!ACTIONS_RETOUR.includes(data.action.type)) {
      navigation.dispatch(data.action);
      return;
    }
    if (occupe) return;
    revenirEtape1();
  });

  async function ouvrirPageDuFournisseur() {
    if (ouvertureEnCours.current) return;
    ouvertureEnCours.current = true;
    setPageNonOuverte(false);
    const url = PAGE_MOT_DE_PASSE[fournisseur];
    try {
      // Navigateur DANS l'app : en le fermant, le client retombe ici, sur les quatre gestes.
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.error('[connecter-imap] navigateur intégré indisponible, essai du navigateur du téléphone', err);
      try {
        await Linking.openURL(url);
      } catch (err2) {
        console.error('[connecter-imap] la page du fournisseur n’a pas pu être ouverte', err2);
        if (present.current) setPageNonOuverte(true);
      }
    } finally {
      ouvertureEnCours.current = false;
    }
  }

  function erreurDuServeur(status: number, codeErreur?: string, attendreS?: number): ErreurServeur {
    // 429 : la limite d'essais. Le serveur dit combien attendre ; s'il ne le dit pas, on
    // annonce la fenêtre entière (15 min) plutôt qu'un chiffre inventé plus court.
    if (codeErreur === 'trop_d_essais' || status === 429) {
      const dureeDonnee = typeof attendreS === 'number' && attendreS > 0;
      const minutes = dureeDonnee ? Math.max(1, Math.ceil(attendreS / 60)) : 15;
      return {
        texte: dire(t.errTropDEssais, { minutes: String(minutes) }),
        champ: null,
        ...(dureeDonnee ? {} : { incomplete: 'limite d’essais sans durée d’attente : 15 min annoncées par défaut' }),
      };
    }
    switch (codeErreur) {
      case 'identifiants_refuses':
      case 'mot_de_passe_invalide':
        return { texte: dire(t.errRefuse), champ: 'code' };
      case 'serveur_injoignable':
      case 'envoi_injoignable':
        return { texte: dire(t.errInjoignable), champ: null };
      case 'envoi_refuse':
        return { texte: dire(t.errEnvoi), champ: 'code' };
      case 'adresse_invalide':
      case 'fournisseur_non_pris_en_charge':
        return { texte: dire(t.errAdresse), champ: 'adresse' };
      case 'mot_de_passe_manquant':
        return { texte: dire(t.errCodeVide), champ: 'code' };
      case 'boite_deja_rattachee':
        // (08/10/2026) 409 : la boîte appartient à un AUTRE compte Vmail. Elle ne change plus de
        // compte sans un mot (serveur, lib/imap/brancher.ts) : on dit pourquoi, et quoi faire.
        return { texte: dire(t.errDejaRattachee), champ: 'adresse' };
    }
    if (status === 401) return { texte: dire(t.errSession), champ: null };
    // 504 sans code lisible : c'est la plateforme qui a coupé, le fournisseur traînait.
    if (status === 504) {
      return { texte: dire(t.errInjoignable), champ: null, incomplete: '504 sans code : la plateforme a coupé la route' };
    }
    return { texte: dire(t.errInconnue), champ: null, inconnue: true };
  }

  async function connecter() {
    if (occupe || envoiEnCours.current) return;

    const adresse = email.trim().toLowerCase();
    const code = codeRef.current;
    // Contrôle fait ICI AUSSI, avant tout appel : le serveur accepterait une adresse
    // iCloud tapée dans l'écran Yahoo (il déduit le fournisseur de l'adresse), et le
    // client lirait « connecté » sur une boîte qui n'est pas celle qu'il croit.
    if (fournisseurImapDeLAdresse(adresse) !== fournisseur) {
      setErreur({ texte: dire(t.errAdresse), champ: 'adresse' });
      return;
    }
    if (!code.trim()) {
      setErreur({ texte: dire(t.errCodeVide), champ: 'code' });
      return;
    }

    // Le clavier se range : le message qui va s'afficher sous les champs doit se voir.
    Keyboard.dismiss();
    envoiEnCours.current = true;
    setOccupe(true);
    setErreur(null);

    const arret = new AbortController();
    coupure.current = arret;
    // LA LIMITE COURT CONTRE TOUT L'APPEL, pas seulement contre l'envoi : avant d'envoyer,
    // `apiPostBrut` lit la session, et cette lecture-là n'entend pas le signal de coupure.
    // Si elle restait bloquée, l'écran resterait sur « Vérification en cours… », retour bloqué.
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const tropTard = new Promise<never>((_, rejeter) => {
      minuterie = setTimeout(() => {
        arret.abort();
        rejeter(new Error('délai dépassé'));
      }, DELAI_MAX_MS);
    });
    let r: { ok: boolean; status: number; json: Reponse };
    try {
      r = await Promise.race([
        apiPostBrut<Reponse>('/api/connect/imap', { email: adresse, password: code }, { signal: arret.signal }),
        tropTard,
      ]);
    } catch (err) {
      envoiEnCours.current = false;
      const tropLong = arret.signal.aborted;
      if (!present.current) {
        // L'écran a été fermé entre-temps : plus rien à afficher. Le serveur, lui, a peut-être
        // enregistré la boîte ; « Sources » relit sa liste à chaque retour et dira ce qu'il en est.
        console.warn('[connecter-imap] écran fermé pendant la vérification : réponse non lue');
        return;
      }
      // Le code n'est PAS dans ce journal : seulement l'erreur réseau.
      console.error('[connecter-imap] appel de /api/connect/imap impossible', tropLong ? 'délai dépassé' : err);
      // 70 s sans AUCUNE réponse, c'est le réseau : si le fournisseur traînait, la plateforme
      // aurait répondu 504 à 60 s, et l'écran aurait dit « Yahoo ne répond pas ». Accuser
      // le fournisseur ici serait inventer une cause.
      setErreur({ texte: dire(t.errReseau), champ: null });
      setOccupe(false);
      return;
    } finally {
      clearTimeout(minuterie);
      coupure.current = null;
    }
    envoiEnCours.current = false;
    if (!present.current) {
      console.warn('[connecter-imap] écran fermé pendant la vérification : réponse non lue');
      return;
    }
    setOccupe(false);

    const j = r.json ?? {};
    if (r.ok && j.ok === true) {
      // Le code a servi : il quitte la mémoire de l'écran, et le champ disparaît à l'étape 3.
      codeRef.current = '';
      champCode.current?.clear();
      setVisible(false);
      setEmailConnecte(j.email || adresse);
      setEtape(3);
      return;
    }

    const suite = erreurDuServeur(r.status, j.error, j.retry_after_s);
    if (suite.inconnue) {
      console.error('[connecter-imap] réponse inattendue de /api/connect/imap', r.status, j.error ?? '(sans code)');
    } else if (suite.incomplete) {
      console.warn('[connecter-imap] réponse incomplète de /api/connect/imap', r.status, j.error ?? '(sans code)', '—', suite.incomplete);
    }
    setErreur({ texte: suite.texte, champ: suite.champ });
  }

  function terminer() {
    // Ouvert par un lien direct, l'écran n'a rien derrière lui : on va à « Sources ».
    if (router.canGoBack()) router.back();
    else router.replace('/sources');
  }

  const gestes = t.gestes[fournisseur];
  const [e3Avant = '', e3Apres = ''] = dire(t.e3Texte).split('{email}');

  return (
    <ScrollView
      ref={defilement}
      style={styles.ecran}
      contentContainerStyle={[styles.contenu, { paddingBottom: spacing.xl + marges.bottom }]}
      keyboardShouldPersistTaps="handled"
      // iOS : l'écran remonte tout seul quand le clavier sort, sans calcul de hauteur d'en-tête.
      automaticallyAdjustKeyboardInsets
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: dire(t.titre),
          headerTitleAlign: 'center',
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: colors.charcoal },
          headerTintColor: colors.onDark,
          headerTitleStyle: { fontFamily: fonts.sansBold, color: colors.onDark },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.carte}>
        <View
          style={styles.barres}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.barre, n <= etape && styles.barreFaite]} />
          ))}
        </View>
        {/* Pas d'écart entre les lettres en arabe : il casse la liaison de l'écriture. */}
        <Text style={[styles.etape, locale === 'ar' && styles.etapeSansEcart]}>
          {dire(t.etape, { n: String(etape) })}
        </Text>

        {etape === 1 ? (
          <View>
            <Text style={styles.titre} accessibilityRole="header">
              {dire(t.e1Titre)}
            </Text>
            <Text style={styles.texte}>{dire(t.e1Texte)}</Text>

            <View style={styles.gestes}>
              {gestes.map((geste, i) => (
                <View
                  key={i}
                  style={styles.geste}
                  accessible
                  accessibilityLabel={`${i + 1}. ${dire(geste)}`}
                >
                  <View style={styles.pastille}>
                    <Text style={styles.pastilleTexte}>{i + 1}</Text>
                  </View>
                  <Text style={styles.gesteTexte}>{dire(geste)}</Text>
                </View>
              ))}
            </View>
            {fournisseur === 'icloud' ? <Text style={styles.note}>{dire(t.noteIcloud)}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.boutonPlein, styles.espaceAvant, pressed && styles.appuye]}
              onPress={ouvrirPageDuFournisseur}
              accessibilityRole="link"
            >
              <Text style={styles.boutonPleinTexte}>{dire(t.ouvrir)}</Text>
              <IconeSortie />
            </Pressable>
            {pageNonOuverte ? (
              <Text style={styles.erreurSimple}>{tApp.login.trialOpenFailed}</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [styles.boutonLigne, pressed && styles.appuye]}
              onPress={() => {
                setPageNonOuverte(false);
                setEtape(2);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.boutonLigneTexte}>{dire(t.continuer)}</Text>
              <IconeFleche versLaGauche={deDroiteAGauche} couleur={colors.ink} />
            </Pressable>
          </View>
        ) : null}

        {/* Étape 2 — présente dès l'étape 1, mais cachée : voir l'en-tête du fichier. */}
        {etape !== 3 ? (
          <View style={etape === 2 ? undefined : styles.cache}>
            <Text style={styles.titre} accessibilityRole="header">
              {dire(t.e2Titre)}
            </Text>
            <Text style={styles.texte}>{dire(t.e2Texte)}</Text>

            <Text style={styles.intitule}>{dire(t.champAdresse)}</Text>
            <TextInput
              style={[styles.champ, erreur?.champ === 'adresse' && styles.champFautif]}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setErreur(null);
              }}
              accessibilityLabel={dire(t.champAdresse)}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="next"
              // « Suivant » passe au code sans ranger le clavier.
              submitBehavior="submit"
              onSubmitEditing={() => champCode.current?.focus()}
              editable={!occupe}
            />

            <Text style={styles.intitule}>{dire(t.champCode)}</Text>
            {/* Le code s'écrit de gauche à droite dans toutes les langues : « Afficher » reste
                donc à droite, même en arabe. Quand l'écran est de droite à gauche, une rangée
                se remplit depuis la droite ; `row-reverse` la remet dans l'autre sens. */}
            <View
              style={[
                styles.cadreCode,
                deDroiteAGauche && styles.cadreCodeInverse,
                erreur?.champ === 'code' && styles.champFautif,
              ]}
            >
              {/*
                CE N'EST PAS LE MOT DE PASSE DU COMPTE VMAIL : `textContentType="none"`,
                `autoComplete="off"` et `importantForAutofill="no"` demandent au téléphone de
                ne pas le proposer à l'enregistrement, ni d'y coller un mot de passe retenu.
                `oneTimeCode` (l'astuce habituelle) est écarté exprès : le clavier y proposerait
                le code reçu par SMS au moment où le client vient de se connecter chez Yahoo.
                Pas de `value` : voir l'en-tête du fichier.
              */}
              <TextInput
                ref={champCode}
                style={styles.champCode}
                onChangeText={(v) => {
                  codeRef.current = v;
                  setErreur(null);
                }}
                accessibilityLabel={dire(t.champCode)}
                placeholder={EXEMPLE_CODE[fournisseur]}
                placeholderTextColor={colors.hint}
                secureTextEntry={!visible}
                // Android : ce clavier-là n'apprend pas et ne suggère pas ce qu'on y tape.
                keyboardType={Platform.OS === 'android' && visible ? 'visible-password' : 'default'}
                textContentType="none"
                autoComplete="off"
                importantForAutofill="no"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="go"
                onSubmitEditing={connecter}
                editable={!occupe}
              />
              <Pressable
                style={styles.afficher}
                onPress={() => setVisible((v) => !v)}
                // Le mot change (« Afficher » / « Masquer ») : pas d'état « sélectionné » en
                // plus, le lecteur d'écran dirait « Masquer, sélectionné ».
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.afficherTexte}>{visible ? t.masquer : t.afficher}</Text>
              </Pressable>
            </View>

            {erreur ? (
              <View style={styles.erreur}>
                <Text style={styles.erreurTexte}>{erreur.texte}</Text>
              </View>
            ) : null}

            <Pressable
              // Pas d'atténuation pendant la vérification : « Vérification en cours… » est
              // une information à lire, et à 60 % d'opacité elle tombait à 2,4:1 de contraste.
              style={({ pressed }) => [styles.boutonPlein, styles.espaceAvant, pressed && !occupe && styles.appuye]}
              onPress={connecter}
              disabled={occupe}
              accessibilityRole="button"
              accessibilityState={{ disabled: occupe, busy: occupe }}
            >
              {occupe ? <ActivityIndicator color={colors.cream} /> : null}
              <Text style={styles.boutonPleinTexte}>{occupe ? dire(t.verification) : dire(t.connecter)}</Text>
            </Pressable>

            <Pressable
              style={[styles.retour, occupe && styles.enAttente]}
              onPress={revenirEtape1}
              disabled={occupe}
              accessibilityRole="button"
              hitSlop={6}
            >
              <IconeFleche versLaGauche={!deDroiteAGauche} couleur={colors.muted} />
              <Text style={styles.retourTexte}>{dire(t.retour)}</Text>
            </Pressable>

            <View style={styles.rassure}>
              <IconeCadenas />
              <Text style={styles.rassureTexte}>{dire(t.rassure)}</Text>
            </View>
          </View>
        ) : null}

        {etape === 3 ? (
          <View style={styles.fin}>
            <View
              style={styles.rond}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <IconCheck size={36} color={colors.cream} strokeWidth={2.8} />
            </View>
            <Text style={[styles.titre, styles.centre]} accessibilityRole="header">
              {dire(t.e3Titre)}
            </Text>
            <Text style={[styles.texte, styles.centre]}>
              {e3Avant}
              {/* U+2066 … U+2069 : l'adresse reste écrite de gauche à droite au milieu d'une phrase arabe. */}
              <Text style={styles.adresse}>{`⁦${emailConnecte}⁩`}</Text>
              {e3Apres}
              {lecturePrete ? ` ${dire(t.e3Suite)}` : ''}
            </Text>
            {!lecturePrete ? (
              // Vu par l'administrateur seulement : les boutons Yahoo / iCloud ne sont montrés
              // aux clients que lorsque le drapeau du serveur est ouvert, et alors `lecturePrete`
              // l'est aussi. Texte recopié du web, en français comme là-bas.
              <View style={styles.apercu}>
                <Text style={styles.apercuTexte}>
                  {dire(
                    'Aperçu administrateur : Vmail lit et trie les mails de cette boîte. Répondre, archiver et supprimer arrivent bientôt.',
                  )}
                </Text>
              </View>
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.boutonPlein, styles.pleineLargeur, styles.espaceAvant, pressed && styles.appuye]}
              onPress={terminer}
              accessibilityRole="button"
            >
              <Text style={styles.boutonPleinTexte}>{dire(t.termine)}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Flèche « suite ». `versLaGauche` la retourne (écriture de droite à gauche, ou « retour »). */
function IconeFleche({ versLaGauche, couleur }: { versLaGauche: boolean; couleur: string }) {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      style={versLaGauche ? styles.retourne : undefined}
    >
      <Path d="M5 12h14" stroke={couleur} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 6l6 6-6 6" stroke={couleur} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** « Ouvre une page hors de l'app ». */
function IconeSortie() {
  const trait = { stroke: colors.cream, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M14 4h6v6" {...trait} />
      <Path d="M20 4l-9 9" {...trait} />
      <Path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" {...trait} />
    </Svg>
  );
}

function IconeCadenas() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" style={styles.cadenas}>
      <Rect x={5} y={11} width={14} height={9} rx={2} stroke={colors.muted} strokeWidth={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// CONTRASTES — mesurés le 06/10/2026 (seuil de lisibilité AA : 4,5:1 pour du texte).
/** Texte d'erreur : 5,6:1 sur son fond teinté, 6,5:1 sur la carte. */
const ENCRE_ERREUR = '#8a2f0b';
/**
 * « ÉTAPE 1 SUR 3 », en petit. Le terracotta de la marque (#c2410c) ne donne que 4,0:1 sur
 * la carte : trop peu pour du texte de 12. Celui-ci est le même, 8 % plus sombre : 4,6:1.
 * Les barres de progression, elles, gardent le terracotta de la marque (ce n'est pas du texte).
 */
const TERRACOTTA_TEXTE = '#b23c0b';

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: colors.fond },
  contenu: { padding: spacing.xl },
  carte: {
    backgroundColor: colors.surface,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },

  barres: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  barre: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.cardline },
  barreFaite: { backgroundColor: colors.terracotta },
  etape: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: TERRACOTTA_TEXTE,
    marginBottom: spacing.sm,
  },
  etapeSansEcart: { letterSpacing: 0 },

  titre: { fontFamily: fonts.sansBold, fontSize: 22, lineHeight: 28, color: colors.ink, marginBottom: spacing.sm },
  texte: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 23, color: colors.ink2 },
  centre: { textAlign: 'center' },
  note: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: spacing.md },

  // Les quatre gestes à faire chez le fournisseur.
  gestes: {
    marginTop: spacing.lg,
    backgroundColor: colors.creamAlt,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  geste: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pastille: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  pastilleTexte: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.cream },
  gesteTexte: { flex: 1, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.ink2 },

  // Boutons
  boutonPlein: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radius.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.terracotta,
  },
  boutonPleinTexte: { flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 15, color: colors.cream, textAlign: 'center' },
  boutonLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    marginTop: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardline,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  boutonLigneTexte: { flexShrink: 1, fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.ink, textAlign: 'center' },
  espaceAvant: { marginTop: spacing.lg },
  pleineLargeur: { alignSelf: 'stretch' },
  appuye: { opacity: 0.85 },
  enAttente: { opacity: 0.6 },
  retourne: { transform: [{ scaleX: -1 }] },

  // Étape 2
  cache: { display: 'none' },
  intitule: {
    fontFamily: fonts.sansSemibold,
    fontSize: 13.5,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  champ: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.cream,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  champFautif: { borderColor: colors.danger },
  cadreCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: radius.sm,
    minHeight: 48,
  },
  cadreCodeInverse: { flexDirection: 'row-reverse' },
  champCode: {
    flex: 1,
    // Sans lui, un champ refuse de rétrécir sous sa largeur « naturelle » et pousse
    // « Afficher » hors du cadre (vu au banc de rendu).
    minWidth: 0,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  afficher: { minHeight: 46, justifyContent: 'center', paddingHorizontal: spacing.md },
  afficherTexte: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.muted },
  erreur: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(194,65,12,0.12)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  erreurTexte: { fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: ENCRE_ERREUR },
  erreurSimple: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: ENCRE_ERREUR, marginTop: spacing.sm },
  retour: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  retourTexte: { fontFamily: fonts.sansSemibold, fontSize: 14, color: colors.muted },
  rassure: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.cardline,
  },
  cadenas: { marginTop: 2 },
  rassureTexte: { flex: 1, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.muted },

  // Étape 3
  fin: { alignItems: 'center' },
  rond: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  adresse: { fontFamily: fonts.sansBold, color: colors.ink },
  apercu: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardline,
    backgroundColor: colors.creamAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  apercuTexte: { fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: colors.ink2, textAlign: 'center' },
});
