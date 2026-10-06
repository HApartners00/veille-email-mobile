import type { FournisseurImap } from '../imap';

import type { Locale } from './index';

/**
 * TEXTES DE « CONNECTER YAHOO / ICLOUD » DANS L'APP MOBILE — 06/10/2026.
 *
 * JUMEAU de `apps/web/src/lib/i18n/connexion-imap.ts` (dépôt du web). Ce fichier a été
 * FABRIQUÉ à partir de celui du web, pas réécrit : mêmes phrases, même ordre, mêmes clés.
 * Trois différences seulement, et elles sont voulues :
 *   1. sur un téléphone on ne « clique » pas : dans les gestes Yahoo, « cliquez sur »
 *      devient « touchez » (et son équivalent dans chaque langue ; le russe ne change pas) ;
 *   2. trois clés en plus, pour l'écran « Sources » de l'app : `aucuneBoite`,
 *      `listeIllisible`, `reessayer` (les deux premières reprennent les mots du web) ;
 *   3. le type `Locale` et `FournisseurImap` viennent de l'app, pas du web.
 * Un essai du dépôt web compare les deux fichiers clé par clé
 * (`scripts/essais-imap/textes-mobile.test.ts`) : changer une phrase ici ou là-bas sans
 * changer l'autre le fait échouer.
 *
 * POURQUOI UN FICHIER À PART, et pas des clés dans `messages.ts` : ce texte ne sert qu'à
 * deux écrans, il doit rester comparable ligne à ligne avec celui du web, et il est typé
 * `Record<Locale, …>` — ajouter une langue sans compléter cette table est une ERREUR
 * TypeScript.
 *
 * LES MOTS À TROUS, remplacés par l'écran :
 *   {nom}     la boîte           → « Yahoo » ou « iCloud »
 *   {editeur} celui qui la tient → « Yahoo » ou « Apple »
 *   {n}, {email}, {minutes}
 * Deux mots et pas un, parce que la boîte iCloud se règle sur le compte APPLE :
 * « Ouvrir iCloud » enverrait le client au mauvais endroit.
 *
 * ⚠️ LES NOMS DE BOUTONS ENTRE GUILLEMETS SONT RECOPIÉS, PAS TRADUITS. Ce sont les
 * libellés que le client verra chez Yahoo ou chez Apple ; un mot « à peu près juste »
 * et il ne trouve pas le bouton. Ils ont été relevés le 05/10/2026 sur les pages d'aide
 * (voir le fichier du web pour les sources et pour ce qui n'a PAS pu être relevé :
 * Yahoo en arabe, en russe et en portugais du Portugal, Apple en russe).
 * ⚠️ NON VÉRIFIÉ : ces pages décrivent le site sur ordinateur. Sur un téléphone, Yahoo et
 * Apple peuvent ranger les mêmes boutons ailleurs. À relire sur un vrai téléphone.
 */
export type ImapDict = {
  /** Bouton de l'écran « Sources » ET titre de l'écran de l'assistant : « Connecter Yahoo ». */
  titre: string;
  /** Phrase de la carte « Connecter une boîte », quand Yahoo et iCloud sont proposés. */
  intro: string;
  fermer: string;
  etape: string;

  e1Titre: string;
  e1Texte: string;
  ouvrir: string;
  continuer: string;
  /** Les quatre gestes à faire chez le fournisseur, dans l'ordre. */
  gestes: Record<FournisseurImap, [string, string, string, string]>;
  /** Apple exige l'identification à deux facteurs pour créer ce mot de passe. */
  noteIcloud: string;

  e2Titre: string;
  e2Texte: string;
  champAdresse: string;
  champCode: string;
  afficher: string;
  masquer: string;
  connecter: string;
  verification: string;
  retour: string;
  rassure: string;

  e3Titre: string;
  e3Texte: string;
  e3Suite: string;
  termine: string;

  errAdresse: string;
  errCodeVide: string;
  errRefuse: string;
  errInjoignable: string;
  errEnvoi: string;
  errInconnue: string;
  errReseau: string;
  errSession: string;
  /** Refus de la limite d'essais (429). {minutes} = l'attente annoncée par le serveur. */
  errTropDEssais: string;

  // ── Propres à l'app mobile (écran « Sources ») ──
  /** Liste vide, quand Yahoo et iCloud sont proposés (la phrase d'origine ne cite qu'Outlook). */
  aucuneBoite: string;
  /** La liste des boîtes n'a pas pu être lue : ce n'est PAS « aucune boîte ». */
  listeIllisible: string;
  reessayer: string;
};

export const imapMsg: Record<Locale, ImapDict> = {
  fr: {
    titre: 'Connecter {nom}',
    intro: 'Choisissez votre boîte. Vmail vous guide pas à pas.',
    fermer: 'Fermer',
    etape: 'Étape {n} sur 3',
    e1Titre: 'Créez un mot de passe pour Vmail',
    e1Texte:
      '{editeur} ne laisse pas une application se connecter avec votre mot de passe habituel. Il faut créer un code spécial. Cela prend 1 minute.',
    ouvrir: 'Ouvrir {editeur}',
    continuer: 'J’ai mon code, continuer',
    gestes: {
      yahoo: [
        'Ouvrez la page « Sécurité » de Yahoo (bouton ci-dessous).',
        'Sous « Connexions externes », touchez « Créer un mot de passe d’application ».',
        'Écrivez « Vmail », puis touchez « Générer le mot de passe ».',
        'Copiez le code affiché, et revenez ici.',
      ],
      icloud: [
        'Ouvrez votre compte Apple (bouton ci-dessous).',
        'Dans « Connexion et sécurité », choisissez « Mots de passe pour applications ».',
        'Choisissez « Générer un mot de passe pour application », et écrivez « Vmail ».',
        'Copiez le code affiché, et revenez ici.',
      ],
    },
    noteIcloud: 'L’identification à deux facteurs doit être activée sur votre compte Apple.',
    e2Titre: 'Collez votre code',
    e2Texte: 'Écrivez votre adresse {nom}, puis collez le code que {editeur} vient de vous donner.',
    champAdresse: 'Votre adresse {nom}',
    champCode: 'Mot de passe d’application',
    afficher: 'Afficher',
    masquer: 'Masquer',
    connecter: 'Connecter ma boîte {nom}',
    verification: 'Vérification en cours…',
    retour: 'Revenir à l’étape 1',
    rassure:
      'Vmail ne vous demande jamais votre mot de passe {editeur} habituel. Ce code ne sert qu’à Vmail : vous pouvez le supprimer quand vous voulez, depuis votre compte {editeur}.',
    e3Titre: 'C’est connecté',
    e3Texte: '{email} est reliée à Vmail.',
    e3Suite: 'Vos derniers mails arrivent dans quelques minutes.',
    termine: 'Terminé',
    errAdresse: 'Ce n’est pas une adresse {nom}. Vérifiez l’adresse.',
    errCodeVide: 'Collez le mot de passe d’application.',
    errRefuse:
      '{editeur} a refusé ce code. Vérifiez que c’est bien le mot de passe d’application, et pas votre mot de passe habituel. Vous pouvez aussi en créer un nouveau.',
    errInjoignable: '{editeur} ne répond pas pour le moment. Réessayez dans une minute.',
    errEnvoi:
      'La boîte s’ouvre, mais {editeur} refuse l’envoi avec ce code. Créez un nouveau mot de passe d’application et réessayez.',
    errInconnue: 'La connexion n’a pas abouti. Réessayez dans un instant.',
    errReseau: 'Erreur réseau. Vérifiez votre connexion et réessayez.',
    errSession: 'Votre session a expiré. Reconnectez-vous à Vmail.',
    errTropDEssais: 'Trop d’essais. Attendez {minutes} min avant de réessayer.',
    aucuneBoite: 'Aucune boîte connectée pour le moment.',
    listeIllisible: 'La liste des boîtes n’a pas pu être lue.',
    reessayer: 'Réessayer',
  },
  en: {
    titre: 'Connect {nom}',
    intro: 'Choose your mailbox. Vmail guides you step by step.',
    fermer: 'Close',
    etape: 'Step {n} of 3',
    e1Titre: 'Create a password for Vmail',
    e1Texte:
      '{editeur} doesn’t let an app sign in with your usual password. You need to create a special code. It takes 1 minute.',
    ouvrir: 'Open {editeur}',
    continuer: 'I have my code, continue',
    gestes: {
      yahoo: [
        'Open Yahoo’s “Account Security” page (button below).',
        'Under “External connections”, tap “Create app password”.',
        'Type “Vmail”, then tap “Generate password”.',
        'Copy the code shown, then come back here.',
      ],
      icloud: [
        'Open your Apple Account (button below).',
        'In “Sign-In and Security”, select “App-Specific Passwords”.',
        'Select “Generate an app-specific password” and type “Vmail”.',
        'Copy the code shown, then come back here.',
      ],
    },
    noteIcloud: 'Two-factor authentication must be turned on for your Apple Account.',
    e2Titre: 'Paste your code',
    e2Texte: 'Type your {nom} address, then paste the code {editeur} just gave you.',
    champAdresse: 'Your {nom} address',
    champCode: 'App password',
    afficher: 'Show',
    masquer: 'Hide',
    connecter: 'Connect my {nom} mailbox',
    verification: 'Checking…',
    retour: 'Back to step 1',
    rassure:
      'Vmail never asks for your usual {editeur} password. This code is only for Vmail: you can delete it whenever you like from your {editeur} account.',
    e3Titre: 'Connected',
    e3Texte: '{email} is now linked to Vmail.',
    e3Suite: 'Your latest emails will arrive within a few minutes.',
    termine: 'Done',
    errAdresse: 'This isn’t a {nom} address. Check the address.',
    errCodeVide: 'Paste the app password.',
    errRefuse:
      '{editeur} rejected this code. Make sure it’s the app password, not your usual password. You can also create a new one.',
    errInjoignable: '{editeur} isn’t responding right now. Try again in a minute.',
    errEnvoi:
      'The mailbox opens, but {editeur} refuses sending with this code. Create a new app password and try again.',
    errInconnue: 'The connection didn’t go through. Try again in a moment.',
    errReseau: 'Network error. Check your connection and try again.',
    errSession: 'Your session has expired. Sign in to Vmail again.',
    errTropDEssais: 'Too many attempts. Wait {minutes} min before trying again.',
    aucuneBoite: 'No mailbox connected yet.',
    listeIllisible: 'The mailbox list couldn’t be loaded.',
    reessayer: 'Try again',
  },
  es: {
    titre: 'Conectar {nom}',
    intro: 'Elige tu buzón. Vmail te guía paso a paso.',
    fermer: 'Cerrar',
    etape: 'Paso {n} de 3',
    e1Titre: 'Crea una contraseña para Vmail',
    e1Texte:
      '{editeur} no deja que una aplicación se conecte con tu contraseña habitual. Hay que crear un código especial. Se tarda 1 minuto.',
    ouvrir: 'Abrir {editeur}',
    continuer: 'Ya tengo mi código, continuar',
    gestes: {
      yahoo: [
        'Abre la página «Seguridad de la cuenta» de Yahoo (botón de abajo).',
        'En «Conexiones externas», toca «Crear contraseña de aplicación».',
        'Escribe «Vmail» y toca «Generar contraseña».',
        'Copia el código que aparece y vuelve aquí.',
      ],
      icloud: [
        'Abre tu cuenta de Apple (botón de abajo).',
        'En «Inicio de sesión y seguridad», selecciona «Contraseñas específicas para apps».',
        'Selecciona «Generar una contraseña específica para la app» y escribe «Vmail».',
        'Copia el código que aparece y vuelve aquí.',
      ],
    },
    noteIcloud: 'La autenticación de doble factor debe estar activada en tu cuenta de Apple.',
    e2Titre: 'Pega tu código',
    e2Texte: 'Escribe tu dirección de {nom} y pega el código que {editeur} te acaba de dar.',
    champAdresse: 'Tu dirección de {nom}',
    champCode: 'Contraseña de aplicación',
    afficher: 'Mostrar',
    masquer: 'Ocultar',
    connecter: 'Conectar mi buzón de {nom}',
    verification: 'Comprobando…',
    retour: 'Volver al paso 1',
    rassure:
      'Vmail nunca te pide tu contraseña habitual de {editeur}. Este código solo sirve para Vmail: puedes eliminarlo cuando quieras desde tu cuenta de {editeur}.',
    e3Titre: 'Conectado',
    e3Texte: '{email} está vinculado a Vmail.',
    e3Suite: 'Tus últimos correos llegarán en unos minutos.',
    termine: 'Listo',
    errAdresse: 'No es una dirección de {nom}. Revisa la dirección.',
    errCodeVide: 'Pega la contraseña de aplicación.',
    errRefuse:
      '{editeur} ha rechazado este código. Comprueba que es la contraseña de aplicación y no tu contraseña habitual. También puedes crear una nueva.',
    errInjoignable: '{editeur} no responde en este momento. Inténtalo de nuevo en un minuto.',
    errEnvoi:
      'El buzón se abre, pero {editeur} rechaza el envío con este código. Crea una nueva contraseña de aplicación e inténtalo de nuevo.',
    errInconnue: 'La conexión no se ha completado. Inténtalo de nuevo en un momento.',
    errReseau: 'Error de red. Comprueba tu conexión e inténtalo de nuevo.',
    errSession: 'Tu sesión ha caducado. Vuelve a iniciar sesión en Vmail.',
    errTropDEssais: 'Demasiados intentos. Espera {minutes} min antes de volver a intentarlo.',
    aucuneBoite: 'Ningún buzón conectado todavía.',
    listeIllisible: 'No se ha podido cargar la lista de buzones.',
    reessayer: 'Reintentar',
  },
  de: {
    titre: '{nom} verbinden',
    intro: 'Wähle dein Postfach. Vmail führt dich Schritt für Schritt.',
    fermer: 'Schließen',
    etape: 'Schritt {n} von 3',
    e1Titre: 'Erstelle ein Passwort für Vmail',
    e1Texte:
      '{editeur} lässt keine App mit deinem normalen Passwort zugreifen. Du musst einen speziellen Code erstellen. Das dauert 1 Minute.',
    ouvrir: '{editeur} öffnen',
    continuer: 'Ich habe meinen Code, weiter',
    gestes: {
      yahoo: [
        'Öffne die Seite „Account-Sicherheit“ von Yahoo (Schaltfläche unten).',
        'Tippe unter „Externe Verbindungen“ auf „App-Passwort erstellen“.',
        'Gib „Vmail“ ein und tippe auf „Passwort generieren“.',
        'Kopiere den angezeigten Code und komm hierher zurück.',
      ],
      icloud: [
        'Öffne deinen Apple Account (Schaltfläche unten).',
        'Wähle unter „Anmelden und Sicherheit“ die Option „App-spezifische Passwörter“.',
        'Wähle „App-spezifisches Passwort erstellen“ und gib „Vmail“ ein.',
        'Kopiere den angezeigten Code und komm hierher zurück.',
      ],
    },
    noteIcloud: 'Die Zwei-Faktor-Authentifizierung muss für deinen Apple Account aktiviert sein.',
    e2Titre: 'Füge deinen Code ein',
    e2Texte: 'Gib deine {nom}-Adresse ein und füge den Code ein, den {editeur} dir gerade gegeben hat.',
    champAdresse: 'Deine {nom}-Adresse',
    champCode: 'App-Passwort',
    afficher: 'Anzeigen',
    masquer: 'Verbergen',
    connecter: 'Mein {nom}-Postfach verbinden',
    verification: 'Wird geprüft…',
    retour: 'Zurück zu Schritt 1',
    rassure:
      'Vmail fragt nie nach deinem normalen {editeur}-Passwort. Dieser Code gilt nur für Vmail: Du kannst ihn jederzeit in deinem {editeur}-Konto löschen.',
    e3Titre: 'Verbunden',
    e3Texte: '{email} ist jetzt mit Vmail verbunden.',
    e3Suite: 'Deine neuesten E-Mails kommen in wenigen Minuten an.',
    termine: 'Fertig',
    errAdresse: 'Das ist keine {nom}-Adresse. Prüfe die Adresse.',
    errCodeVide: 'Füge das App-Passwort ein.',
    errRefuse:
      '{editeur} hat diesen Code abgelehnt. Prüfe, ob es wirklich das App-Passwort ist und nicht dein normales Passwort. Du kannst auch ein neues erstellen.',
    errInjoignable: '{editeur} antwortet gerade nicht. Versuche es in einer Minute erneut.',
    errEnvoi:
      'Das Postfach lässt sich öffnen, aber {editeur} lehnt das Senden mit diesem Code ab. Erstelle ein neues App-Passwort und versuche es erneut.',
    errInconnue: 'Die Verbindung ist nicht zustande gekommen. Versuche es gleich noch einmal.',
    errReseau: 'Netzwerkfehler. Prüfe deine Verbindung und versuche es erneut.',
    errSession: 'Deine Sitzung ist abgelaufen. Melde dich erneut bei Vmail an.',
    errTropDEssais: 'Zu viele Versuche. Warte {minutes} Min., bevor du es erneut versuchst.',
    aucuneBoite: 'Noch kein Postfach verbunden.',
    listeIllisible: 'Die Postfachliste konnte nicht geladen werden.',
    reessayer: 'Erneut versuchen',
  },
  pt: {
    titre: 'Ligar {nom}',
    intro: 'Escolhe a tua caixa. O Vmail guia-te passo a passo.',
    fermer: 'Fechar',
    etape: 'Passo {n} de 3',
    e1Titre: 'Cria uma palavra-passe para o Vmail',
    e1Texte:
      'Com {editeur}, uma aplicação não se pode ligar com a tua palavra-passe habitual. É preciso criar um código especial. Demora 1 minuto.',
    ouvrir: 'Abrir {editeur}',
    continuer: 'Já tenho o código, continuar',
    gestes: {
      yahoo: [
        'Abre a página «Segurança» da tua conta Yahoo (botão abaixo).',
        'Em «Conexões externas», toca em «Criar senha de aplicativo».',
        'Escreve «Vmail» e toca em «Gerar senha».',
        'Copia o código apresentado e volta aqui.',
      ],
      icloud: [
        'Abre a tua Conta Apple (botão abaixo).',
        'Em «Início de sessão e segurança», seleciona «Palavras-passe específicas de app».',
        'Seleciona «Gerar uma palavra-passe específica de app» e escreve «Vmail».',
        'Copia o código apresentado e volta aqui.',
      ],
    },
    noteIcloud: 'A autenticação de dois fatores tem de estar ativa na tua Conta Apple.',
    e2Titre: 'Cola o teu código',
    e2Texte: 'Escreve o teu endereço {nom} e cola o código que acabaste de receber.',
    champAdresse: 'O teu endereço {nom}',
    champCode: 'Palavra-passe de aplicação',
    afficher: 'Mostrar',
    masquer: 'Ocultar',
    connecter: 'Ligar a minha caixa {nom}',
    verification: 'A verificar…',
    retour: 'Voltar ao passo 1',
    rassure:
      'O Vmail nunca te pede a tua palavra-passe habitual de {editeur}. Este código serve apenas para o Vmail: podes eliminá-lo quando quiseres, na tua conta {editeur}.',
    e3Titre: 'Caixa ligada',
    e3Texte: '{email} está ligada ao Vmail.',
    e3Suite: 'Os teus últimos emails chegam dentro de alguns minutos.',
    termine: 'Concluir',
    errAdresse: 'Este não é um endereço {nom}. Verifica o endereço.',
    errCodeVide: 'Cola a palavra-passe de aplicação.',
    errRefuse:
      'O código foi recusado por {editeur}. Confirma que é a palavra-passe de aplicação e não a tua palavra-passe habitual. Também podes criar uma nova.',
    errInjoignable: '{editeur} não está a responder neste momento. Tenta de novo dentro de um minuto.',
    errEnvoi:
      'A caixa abre, mas o envio com este código foi recusado por {editeur}. Cria uma nova palavra-passe de aplicação e tenta de novo.',
    errInconnue: 'A ligação não foi concluída. Tenta de novo dentro de momentos.',
    errReseau: 'Erro de rede. Verifica a tua ligação e tenta de novo.',
    errSession: 'A tua sessão expirou. Inicia sessão no Vmail novamente.',
    errTropDEssais: 'Demasiadas tentativas. Aguarda {minutes} min antes de tentar de novo.',
    aucuneBoite: 'Nenhuma caixa conectada ainda.',
    listeIllisible: 'Não foi possível carregar a lista de caixas.',
    reessayer: 'Tentar de novo',
  },
  it: {
    titre: 'Collega {nom}',
    intro: 'Scegli la tua casella. Vmail ti guida passo dopo passo.',
    fermer: 'Chiudi',
    etape: 'Passaggio {n} di 3',
    e1Titre: 'Crea una password per Vmail',
    e1Texte:
      '{editeur} non permette a un’app di collegarsi con la tua password abituale. Bisogna creare un codice speciale. Ci vuole 1 minuto.',
    ouvrir: 'Apri {editeur}',
    continuer: 'Ho il mio codice, continua',
    gestes: {
      yahoo: [
        'Apri la pagina «Sicurezza» del tuo account Yahoo (pulsante qui sotto).',
        'In «Connessioni esterne», tocca «Crea password per le app».',
        'Scrivi «Vmail», poi tocca «Genera password».',
        'Copia il codice mostrato e torna qui.',
      ],
      icloud: [
        'Apri il tuo Apple Account (pulsante qui sotto).',
        'In «Accesso e sicurezza», seleziona «Password specifiche per le app».',
        'Seleziona «Genera una password specifica per l’app» e scrivi «Vmail».',
        'Copia il codice mostrato e torna qui.',
      ],
    },
    noteIcloud: 'L’autenticazione a due fattori deve essere attiva sul tuo Apple Account.',
    e2Titre: 'Incolla il tuo codice',
    e2Texte: 'Scrivi il tuo indirizzo {nom}, poi incolla il codice che {editeur} ti ha appena dato.',
    champAdresse: 'Il tuo indirizzo {nom}',
    champCode: 'Password per le app',
    afficher: 'Mostra',
    masquer: 'Nascondi',
    connecter: 'Collega la mia casella {nom}',
    verification: 'Verifica in corso…',
    retour: 'Torna al passaggio 1',
    rassure:
      'Vmail non ti chiede mai la tua password {editeur} abituale. Questo codice serve solo a Vmail: puoi eliminarlo quando vuoi dal tuo account {editeur}.',
    e3Titre: 'Collegata',
    e3Texte: '{email} è collegata a Vmail.',
    e3Suite: 'Le tue ultime email arriveranno tra qualche minuto.',
    termine: 'Fine',
    errAdresse: 'Questo non è un indirizzo {nom}. Controlla l’indirizzo.',
    errCodeVide: 'Incolla la password per le app.',
    errRefuse:
      '{editeur} ha rifiutato questo codice. Controlla che sia la password per le app e non la tua password abituale. Puoi anche crearne una nuova.',
    errInjoignable: '{editeur} non risponde in questo momento. Riprova tra un minuto.',
    errEnvoi:
      'La casella si apre, ma {editeur} rifiuta l’invio con questo codice. Crea una nuova password per le app e riprova.',
    errInconnue: 'Il collegamento non è riuscito. Riprova tra un istante.',
    errReseau: 'Errore di rete. Controlla la connessione e riprova.',
    errSession: 'La sessione è scaduta. Accedi di nuovo a Vmail.',
    errTropDEssais: 'Troppi tentativi. Attendi {minutes} min prima di riprovare.',
    aucuneBoite: 'Nessuna casella collegata al momento.',
    listeIllisible: 'Impossibile caricare l’elenco delle caselle.',
    reessayer: 'Riprova',
  },
  ar: {
    titre: 'ربط {nom}',
    intro: 'اختر صندوق بريدك. يرشدك Vmail خطوة بخطوة.',
    fermer: 'إغلاق',
    etape: 'الخطوة {n} من 3',
    e1Titre: 'أنشئ كلمة مرور لـ Vmail',
    e1Texte:
      'لا تسمح {editeur} لأي تطبيق بالاتصال بكلمة مرورك المعتادة. يجب إنشاء رمز خاص. يستغرق ذلك دقيقة واحدة.',
    ouvrir: 'فتح {editeur}',
    continuer: 'لديّ الرمز، متابعة',
    gestes: {
      yahoo: [
        'افتح صفحة أمان الحساب في Yahoo (الزر أدناه).',
        'ضمن «External connections»، اضغط على «Create app password» (إنشاء كلمة مرور للتطبيق).',
        'اكتب «Vmail»، ثم اضغط على «Generate password».',
        'انسخ الرمز الظاهر، ثم عُد إلى هنا.',
      ],
      icloud: [
        'افتح حساب Apple الخاص بك (الزر أدناه).',
        'في قسم «تسجيل الدخول والأمان»، اختر «كلمات السر الخاصة بالتطبيقات».',
        'اختر «إنشاء كلمة سر خاصة بالتطبيق»، واكتب «Vmail».',
        'انسخ الرمز الظاهر، ثم عُد إلى هنا.',
      ],
    },
    noteIcloud: 'يجب تفعيل المصادقة ذات العاملين في حساب Apple الخاص بك.',
    e2Titre: 'الصق الرمز',
    e2Texte: 'اكتب عنوان {nom} الخاص بك، ثم الصق الرمز الذي حصلت عليه للتو من {editeur}.',
    champAdresse: 'عنوان {nom} الخاص بك',
    champCode: 'كلمة مرور التطبيق',
    afficher: 'إظهار',
    masquer: 'إخفاء',
    connecter: 'ربط صندوق {nom}',
    verification: 'جارٍ التحقق…',
    retour: 'العودة إلى الخطوة 1',
    rassure:
      'لا يطلب Vmail أبدًا كلمة مرور {editeur} المعتادة. هذا الرمز خاص بـ Vmail فقط: يمكنك حذفه متى شئت من حسابك في {editeur}.',
    e3Titre: 'تم الربط',
    e3Texte: 'تم ربط {email} بـ Vmail.',
    e3Suite: 'ستصل أحدث رسائلك خلال بضع دقائق.',
    termine: 'تم',
    errAdresse: 'هذا ليس عنوان {nom}. تحقّق من العنوان.',
    errCodeVide: 'الصق كلمة مرور التطبيق.',
    errRefuse:
      'رفضت {editeur} هذا الرمز. تأكّد أنه كلمة مرور التطبيق وليس كلمة مرورك المعتادة. يمكنك أيضًا إنشاء رمز جديد.',
    errInjoignable: '{editeur} لا تستجيب حاليًا. حاول مجددًا بعد دقيقة.',
    errEnvoi:
      'يُفتح الصندوق، لكن {editeur} ترفض الإرسال بهذا الرمز. أنشئ كلمة مرور تطبيق جديدة وحاول مجددًا.',
    errInconnue: 'لم يكتمل الاتصال. حاول مجددًا بعد لحظات.',
    errReseau: 'خطأ في الشبكة. تحقّق من اتصالك وحاول مجددًا.',
    errSession: 'انتهت جلستك. سجّل الدخول إلى Vmail من جديد.',
    errTropDEssais: 'محاولات كثيرة جدًا. انتظر {minutes} دقيقة قبل المحاولة مجددًا.',
    aucuneBoite: 'لا يوجد صندوق متصل بعد.',
    listeIllisible: 'تعذّر تحميل قائمة الصناديق.',
    reessayer: 'أعد المحاولة',
  },
  ru: {
    titre: 'Подключить {nom}',
    intro: 'Выберите почтовый ящик. Vmail проведёт вас шаг за шагом.',
    fermer: 'Закрыть',
    etape: 'Шаг {n} из 3',
    e1Titre: 'Создайте пароль для Vmail',
    e1Texte:
      '{editeur} не позволяет приложениям входить с вашим обычным паролем. Нужно создать специальный код. Это займёт 1 минуту.',
    ouvrir: 'Открыть {editeur}',
    continuer: 'Код у меня, продолжить',
    gestes: {
      yahoo: [
        'Откройте страницу безопасности аккаунта Yahoo (кнопка ниже).',
        'В разделе «External connections» нажмите «Create app password» (создать пароль приложения).',
        'Введите «Vmail», затем нажмите «Generate password».',
        'Скопируйте показанный код и вернитесь сюда.',
      ],
      icloud: [
        'Откройте свой Аккаунт Apple (кнопка ниже).',
        'В разделе «Вход в учетную запись и безопасность» выберите «Пароли приложений».',
        'Выберите создание пароля для приложения и введите «Vmail».',
        'Скопируйте показанный код и вернитесь сюда.',
      ],
    },
    noteIcloud: 'В вашем Аккаунте Apple должна быть включена двухфакторная аутентификация.',
    e2Titre: 'Вставьте код',
    e2Texte: 'Введите ваш адрес {nom}, затем вставьте код, который только что выдал {editeur}.',
    champAdresse: 'Ваш адрес {nom}',
    champCode: 'Пароль приложения',
    afficher: 'Показать',
    masquer: 'Скрыть',
    connecter: 'Подключить мой ящик {nom}',
    verification: 'Проверка…',
    retour: 'Вернуться к шагу 1',
    rassure:
      'Vmail никогда не запрашивает ваш обычный пароль {editeur}. Этот код нужен только для Vmail: вы можете удалить его в любой момент в своём аккаунте {editeur}.',
    e3Titre: 'Подключено',
    e3Texte: 'Ящик {email} привязан к Vmail.',
    e3Suite: 'Ваши последние письма появятся через несколько минут.',
    termine: 'Готово',
    errAdresse: 'Это не адрес {nom}. Проверьте адрес.',
    errCodeVide: 'Вставьте пароль приложения.',
    errRefuse:
      '{editeur} отклонил этот код. Убедитесь, что это пароль приложения, а не ваш обычный пароль. Можно также создать новый.',
    errInjoignable: '{editeur} сейчас не отвечает. Повторите попытку через минуту.',
    errEnvoi:
      'Ящик открывается, но {editeur} отклоняет отправку с этим кодом. Создайте новый пароль приложения и повторите попытку.',
    errInconnue: 'Подключение не удалось. Повторите попытку чуть позже.',
    errReseau: 'Ошибка сети. Проверьте подключение и повторите попытку.',
    errSession: 'Сеанс истёк. Войдите в Vmail снова.',
    errTropDEssais: 'Слишком много попыток. Подождите {minutes} мин и повторите.',
    aucuneBoite: 'Пока нет подключённых ящиков.',
    listeIllisible: 'Не удалось загрузить список ящиков.',
    reessayer: 'Повторить',
  },
};
